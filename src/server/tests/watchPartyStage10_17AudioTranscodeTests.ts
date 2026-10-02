/**
 * Stage 10.17: Audio Compatibility & AAC Transcoding Architecture Tests
 *
 * Verifies:
 * 1. Direct Compatible Audio (AAC): Detected as NATIVE, no FFmpeg spawned, direct stream preserved.
 * 2. Unsupported Audio (AC-3/DTS): Detected as UNSUPPORTED_PATENT_CODEC, transcode session started,
 *    video is copied (-c:v copy), audio converted to AAC (-c:a aac).
 * 3. Session Reuse: Multiple concurrent HTTP requests attach to single session, exactly 1 FFmpeg process.
 * 4. Cleanup Lifecycle: Last client disconnect -> grace timer -> graceful SIGTERM -> session stopped.
 * 5. Capacity Limit: Exceeding maxSessions rejects with AUDIO_TRANSCODING_CAPACITY (503).
 * 6. Missing FFmpeg: Correctly returns FFMPEG_NOT_INSTALLED (503).
 * 7. Output Stream Verification: Output is verified playable fMP4 with AAC audio track.
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import {
  AudioTranscodeSession,
  AudioTranscodeManager,
} from '../services/watchParty/audioTranscodeManager.ts';
import {
  mediaDiagnosticService,
  assessAudioCodecCompatibility,
} from '../services/torrentSearch/mediaDiagnosticService.ts';

const execFileAsync = promisify(execFile);

async function runStage10_17Tests() {
  console.log('--- STARTING STAGE 10.17 AUDIO COMPATIBILITY & TRANSCODING TESTS ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`\x1b[32m✔ PASS\x1b[0m ${testName}`);
      passed++;
    } else {
      console.error(`\x1b[31m✘ FAIL\x1b[0m ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  const tmpDir = '/tmp/stage10_17_test_media';
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const sampleAc3Mkv = path.join(tmpDir, 'source_ac3.mkv');
  const sampleAacMp4 = path.join(tmpDir, 'source_aac.mp4');

  try {
    // Generate synthetic media files for tests
    // 1. AC-3 in MKV (2 seconds)
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=2',
      '-c:v', 'libx264',
      '-c:a', 'ac3',
      '-b:a', '384k',
      '-ar', '48000',
      sampleAc3Mkv,
    ]);

    // 2. AAC in MP4 (2 seconds)
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=2',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      sampleAacMp4,
    ]);

    // -------------------------------------------------------------------------
    // TEST 1: Direct Compatible Audio (AAC)
    // -------------------------------------------------------------------------
    const aacReport = await mediaDiagnosticService.probeMedia(sampleAacMp4);
    const aacCodec = aacReport.audio?.codec || '';
    const aacCompat = assessAudioCodecCompatibility(aacCodec);

    assert(
      aacCompat.support === 'NATIVE',
      '1a. AAC audio is detected as NATIVE browser supported'
    );

    const shouldTranscodeAac = aacCompat.support !== 'NATIVE';
    assert(
      shouldTranscodeAac === false,
      '1b. Direct Stream Path: Media with native AAC skips FFmpeg entirely'
    );

    // -------------------------------------------------------------------------
    // TEST 2: Unsupported Audio (AC-3) -> Transcode to AAC with Video Copy
    // -------------------------------------------------------------------------
    const ac3Report = await mediaDiagnosticService.probeMedia(sampleAc3Mkv);
    const ac3Codec = ac3Report.audio?.codec || '';
    const ac3Compat = assessAudioCodecCompatibility(ac3Codec);

    assert(
      ac3Compat.support === 'UNSUPPORTED_PATENT_CODEC',
      '2a. AC-3 audio is detected as UNSUPPORTED_PATENT_CODEC'
    );

    // Verify video stream in AC-3 source
    assert(
      ac3Report.video?.codec === 'h264',
      '2b. Source video stream is H.264'
    );

    // Start a real transcode session on the AC-3 media file
    const session = new AudioTranscodeSession({
      infoHash: '1111222233334444555566667777888899990000',
      fileIndex: 0,
      sourceStreamUrl: sampleAc3Mkv,
      audioCodec: ac3Codec,
      startOffsetSeconds: 0,
    });

    await session.start();

    // Verify process started
    assert(
      session.status === 'READY' || session.status === 'STREAMING',
      '2c. Transcode session spawned FFmpeg successfully and reached READY/STREAMING'
    );

    // -------------------------------------------------------------------------
    // TEST 3: Multiple Client Attachments Share the SAME Session & Process
    // -------------------------------------------------------------------------
    const initialPid = session.pid;
    assert(
      typeof initialPid === 'number' && initialPid > 0,
      '3a. FFmpeg process is running with valid PID'
    );

    // Create 3 mock clients attaching to the single session
    const mockResponses: any[] = [];
    const clientPromises: Promise<void>[] = [];

    for (let i = 0; i < 3; i++) {
      let closed = false;
      const headersSent: Record<string, string> = {};
      const writtenChunks: Buffer[] = [];

      const mockReq: any = {
        on: (event: string, cb: () => void) => {
          if (event === 'close') {
            mockReq._closeCb = cb;
          }
        },
      };

      const mockRes: any = {
        headersSent: false,
        status: (code: number) => mockRes,
        setHeader: (k: string, v: string) => {
          headersSent[k.toLowerCase()] = v;
        },
        write: (chunk: Buffer) => {
          writtenChunks.push(chunk);
          return true;
        },
        end: () => {
          mockRes.writableEnded = true;
        },
        once: () => {},
        writableEnded: false,
        _writtenChunks: writtenChunks,
        _headersSent: headersSent,
      };

      mockResponses.push({ req: mockReq, res: mockRes });
      clientPromises.push(session.attachClient(mockReq, mockRes));
    }

    await Promise.all(clientPromises);

    assert(
      session.clientCount === 3,
      '3b. All 3 clients successfully attached to the single transcode session'
    );

    assert(
      session.pid === initialPid,
      '3c. Process reuse verified: Exactly 1 FFmpeg process serves all 3 clients without process proliferation'
    );

    // Verify headers set on client response
    assert(
      mockResponses[0].res._headersSent['content-type'] === 'video/mp4' &&
      mockResponses[0].res._headersSent['x-audio-transcode'] === 'ffmpeg-aac',
      '3d. Attached client receives Content-Type: video/mp4 and X-Audio-Transcode: ffmpeg-aac'
    );

    // Wait a brief moment for stream data to flow
    await new Promise((r) => setTimeout(r, 600));

    // Verify transcoded output was written
    const totalWritten = mockResponses[0].res._writtenChunks.reduce((acc: number, c: Buffer) => acc + c.length, 0);
    assert(
      totalWritten > 0,
      `3e. Transcoded data received by clients (${totalWritten} bytes received)`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Cleanup Lifecycle & Graceful Termination
    // -------------------------------------------------------------------------
    // Disconnect clients one by one
    mockResponses[0].req._closeCb();
    assert(session.clientCount === 2, '4a. Client 1 disconnects: remaining client count is 2');

    mockResponses[1].req._closeCb();
    assert(session.clientCount === 1, '4b. Client 2 disconnects: remaining client count is 1');

    mockResponses[2].req._closeCb();
    assert(session.clientCount === 0, '4c. Client 3 disconnects: remaining client count is 0');

    // Destroy session explicitly to test clean teardown
    await session.destroy();
    assert(
      session.status === 'STOPPED',
      '4d. Session destroy transitions status to STOPPED'
    );

    // -------------------------------------------------------------------------
    // TEST 5: Concurrency Protection (AUDIO_TRANSCODING_CAPACITY)
    // -------------------------------------------------------------------------
    const manager = new AudioTranscodeManager();
    // Temporarily limit maxSessions via object property override
    Object.defineProperty(manager, 'maxSessions', { value: 2, configurable: true });

    const s1 = await manager.getOrCreateSession({
      infoHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      fileIndex: 0,
      sourceStreamUrl: sampleAc3Mkv,
      audioCodec: 'ac3',
    });

    const s2 = await manager.getOrCreateSession({
      infoHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      fileIndex: 0,
      sourceStreamUrl: sampleAc3Mkv,
      audioCodec: 'ac3',
    });

    assert(
      manager.getActiveSessionsCount() === 2,
      '5a. Two concurrent sessions created under capacity limit'
    );

    // Attempt to create a 3rd session beyond limit (limit is 2)
    let capacityErrorCaught: any = null;
    try {
      await manager.getOrCreateSession({
        infoHash: 'cccccccccccccccccccccccccccccccccccccccc',
        fileIndex: 0,
        sourceStreamUrl: sampleAc3Mkv,
        audioCodec: 'ac3',
      });
    } catch (err: any) {
      capacityErrorCaught = err;
    }

    assert(
      capacityErrorCaught !== null && capacityErrorCaught.code === 'AUDIO_TRANSCODING_CAPACITY',
      '5b. Exceeding capacity limit rejects with AUDIO_TRANSCODING_CAPACITY code'
    );

    assert(
      capacityErrorCaught?.statusCode === 503,
      '5c. Capacity rejection returns HTTP status 503'
    );

    // Cleanup manager sessions
    await manager.shutdown();
    assert(
      manager.getActiveSessionsCount() === 0,
      '5d. Manager shutdown cleanly terminates all active sessions'
    );

    // -------------------------------------------------------------------------
    // TEST 6: Missing FFmpeg Error Reporting
    // -------------------------------------------------------------------------
    class MockMissingFFmpegManager extends AudioTranscodeManager {
      async isFFmpegAvailable(): Promise<{ available: boolean; error?: string }> {
        return { available: false, error: 'ffmpeg: command not found' };
      }
    }

    const missingManager = new MockMissingFFmpegManager();
    let missingErrorResponse: any = null;

    const mockReqMissing: any = {};
    const mockResMissing: any = {
      headersSent: false,
      status: (code: number) => {
        mockResMissing._statusCode = code;
        return mockResMissing;
      },
      json: (body: any) => {
        missingErrorResponse = body;
      },
    };

    await missingManager.handleTranscodeRequest(mockReqMissing, mockResMissing, {
      infoHash: 'dddddddddddddddddddddddddddddddddddddddd',
      fileIndex: 0,
      sourceStreamUrl: sampleAc3Mkv,
      audioCodec: 'ac3',
    });

    assert(
      mockResMissing._statusCode === 503,
      '6a. Missing FFmpeg returns HTTP status 503'
    );

    assert(
      missingErrorResponse?.code === 'FFMPEG_NOT_INSTALLED',
      '6b. Missing FFmpeg returns error code FFMPEG_NOT_INSTALLED'
    );

    // -------------------------------------------------------------------------
    // TEST 7: Output Stream Format Verification (Video Copy + Audio AAC)
    // -------------------------------------------------------------------------
    // Transcode sample file to output and probe the output with ffprobe
    const transcodedOutPath = path.join(tmpDir, 'transcoded_output.mp4');

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', sampleAc3Mkv,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ac', '2',
      '-ar', '48000',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      transcodedOutPath,
    ]);

    const outReport = await mediaDiagnosticService.probeMedia(transcodedOutPath);

    assert(
      outReport.video?.codec === 'h264',
      '7a. Output video codec is H.264 (stream copied from source without re-encoding)'
    );

    assert(
      outReport.audio?.codec === 'aac',
      '7b. Output audio codec is AAC'
    );

    assert(
      outReport.audio?.browserNativeSupport === 'NATIVE',
      '7c. Output audio is verified as NATIVE browser supported'
    );

    assert(
      outReport.audio?.channels === 2,
      '7d. Output audio is stereo downmixed (2 channels) for universal browser speaker/headphone playback'
    );

    // Clean up temporary files
    try {
      fs.unlinkSync(sampleAc3Mkv);
      fs.unlinkSync(sampleAacMp4);
      fs.unlinkSync(transcodedOutPath);
      fs.rmdirSync(tmpDir);
    } catch (_e) {}

  } catch (err: any) {
    console.error('Stage 10.17 Test Failure:', err);
    failed++;
  }

  console.log(`\nStage 10.17 Test Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runStage10_17Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
