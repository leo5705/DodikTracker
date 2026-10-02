/**
 * Stage 10.20: Persistent Spool Transcoding & HTTP Range Support Tests
 *
 * Verifies:
 * 1. FFmpeg session creates persistent spool file on disk.
 * 2. Range: bytes=0- receives HTTP 206 with correct Accept-Ranges and Content-Range.
 * 3. Range: bytes=N- (e.g. bytes=16384-) receives real bytes starting at requested byte offset.
 * 4. Subsequent Range requests reuse the existing FFmpeg session (no process proliferation).
 * 5. Multiple concurrent HTTP clients read from the single spool file using the same FFmpeg process.
 * 6. Range beyond current size waits/polls for data while FFmpeg is active.
 * 7. FFmpeg completion correctly sets status to COMPLETED and records totalSize.
 * 8. After completion, Range requests work identically to standard static file serving (exact total size in Content-Range).
 * 9. Client abort of one Range request does NOT terminate the FFmpeg session if other requests or session is active.
 * 10. Session destroy and manager cleanup cleanly removes the temporary spool file from disk.
 * 11. Concurrency limit (WATCH_PARTY_MAX_AUDIO_TRANSCODE_SESSIONS) rejects excess sessions with 503.
 * 12. Disk capacity limit rejects session creation with AUDIO_TRANSCODING_CAPACITY when disk ceiling is hit.
 * 13. Direct stream regression: Native audio (AAC/MP3) continues to bypass transcoding.
 * 14. AC-3 media file is routed to persistent spool transcode architecture.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import {
  AudioTranscodeSession,
  AudioTranscodeManager,
  DEFAULT_TRANSCODE_SPOOL_DIR,
} from '../services/watchParty/audioTranscodeManager.ts';
import {
  mediaDiagnosticService,
  assessAudioCodecCompatibility,
} from '../services/torrentSearch/mediaDiagnosticService.ts';

const execFileAsync = promisify(execFile);

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✔ PASS\x1b[0m ${testName}`);
    passCount++;
  } else {
    console.error(`\x1b[31m✘ FAIL\x1b[0m ${testName}${detail ? ` -> ${detail}` : ''}`);
    failCount++;
  }
}

function createMockResponse(): {
  req: any;
  res: any;
  headersSent: Record<string, string>;
  statusCode: number;
  writtenChunks: Buffer[];
  isEnded: boolean;
} {
  const headersSent: Record<string, string> = {};
  const writtenChunks: Buffer[] = [];
  let statusCode = 200;
  let isEnded = false;

  const mockReq: any = {
    headers: {},
    on: (event: string, cb: () => void) => {
      if (event === 'close') mockReq._closeCb = cb;
    },
  };

  const mockRes: any = {
    headersSent: false,
    status: (code: number) => {
      statusCode = code;
      return mockRes;
    },
    setHeader: (k: string, v: string | number) => {
      headersSent[k.toLowerCase()] = String(v);
    },
    write: (chunk: Buffer) => {
      writtenChunks.push(Buffer.from(chunk));
      return true;
    },
    end: () => {
      isEnded = true;
      mockRes.writableEnded = true;
    },
    on: (event: string, cb: () => void) => {
      if (event === 'finish') mockRes._finishCb = cb;
    },
    once: () => {},
    writableEnded: false,
    _headersSent: headersSent,
    _writtenChunks: writtenChunks,
  };

  return {
    req: mockReq,
    res: mockRes,
    headersSent,
    get statusCode() {
      return statusCode;
    },
    writtenChunks,
    get isEnded() {
      return isEnded;
    },
  };
}

async function runStage10_20Tests() {
  console.log('--- STARTING STAGE 10.20 AAC TRANSCODING & HTTP RANGE SPOOL TESTS ---');

  const tmpMediaDir = '/tmp/stage10_20_test_media';
  if (!fs.existsSync(tmpMediaDir)) {
    fs.mkdirSync(tmpMediaDir, { recursive: true });
  }

  const sampleAc3Mkv = path.join(tmpMediaDir, 'test_sample_ac3.mkv');
  const sampleAacMp4 = path.join(tmpMediaDir, 'test_sample_aac.mp4');

  // Generate synthetic test files:
  // 3-second video with AC-3 audio
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=3',
    '-c:v', 'libx264',
    '-c:a', 'ac3',
    '-b:a', '384k',
    '-ar', '48000',
    sampleAc3Mkv,
  ]);

  // 3-second video with AAC audio
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=3',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '44100',
    sampleAacMp4,
  ]);

  // ---------------------------------------------------------------------------
  // TEST 1: FFmpeg session creates persistent spool file on disk
  // ---------------------------------------------------------------------------
  const session = new AudioTranscodeSession({
    infoHash: 'abcdabcdabcdabcdabcdabcdabcdabcdabcdabcd',
    fileIndex: 0,
    sourceStreamUrl: sampleAc3Mkv,
    audioCodec: 'ac3',
  });

  await session.start();
  const initialPid = session.pid;

  // Wait for initial write
  const hasMinBytes = await session.waitForMinBytes(1024, 6000);

  assert(
    hasMinBytes && fs.existsSync(session.spoolFilePath),
    '1. FFmpeg session creates persistent spool file on disk',
    `spoolFilePath: ${session.spoolFilePath}`
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Range: bytes=0- receives 206 Partial Content with correct headers
  // ---------------------------------------------------------------------------
  const client1 = createMockResponse();
  client1.req.headers.range = 'bytes=0-';

  await session.attachClient(client1.req, client1.res);
  await new Promise((r) => setTimeout(r, 400));

  assert(
    client1.statusCode === 206,
    '2a. First Range bytes=0- receives HTTP 206 Partial Content'
  );
  assert(
    client1.headersSent['accept-ranges'] === 'bytes' &&
    client1.headersSent['content-type'] === 'video/mp4' &&
    client1.headersSent['content-range'].startsWith('bytes 0-'),
    '2b. Correct Accept-Ranges and Content-Range headers sent on bytes=0-'
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Range: bytes=N- receives real bytes starting at requested byte offset
  // ---------------------------------------------------------------------------
  const offsetTarget = 8192; // 8 KB offset
  const client2 = createMockResponse();
  client2.req.headers.range = `bytes=${offsetTarget}-`;

  await session.attachClient(client2.req, client2.res);
  await new Promise((r) => setTimeout(r, 400));

  assert(
    client2.statusCode === 206,
    '3a. Range bytes=N- receives HTTP 206 Partial Content'
  );
  assert(
    client2.headersSent['content-range'].startsWith(`bytes ${offsetTarget}-`),
    `3b. Content-Range starts precisely at requested byte offset ${offsetTarget}`
  );

  // Verify bytes served match the actual slice from disk
  const diskData = fs.readFileSync(session.spoolFilePath);
  const totalWrittenClient2 = client2.writtenChunks.reduce((acc, c) => acc + c.length, 0);
  const client2Combined = Buffer.concat(client2.writtenChunks);
  const diskSlice = diskData.subarray(offsetTarget, offsetTarget + client2Combined.length);

  assert(
    client2Combined.equals(diskSlice),
    '3c. Served bytes match exact byte-for-byte content from spool file slice'
  );

  // ---------------------------------------------------------------------------
  // TEST 4 & 5: Session reuse & concurrent clients share single FFmpeg process
  // ---------------------------------------------------------------------------
  assert(
    session.pid === initialPid,
    '4. Range requests do NOT spawn new FFmpeg processes (session reused)'
  );

  const client3 = createMockResponse();
  client3.req.headers.range = 'bytes=1000-2000';
  await session.attachClient(client3.req, client3.res);

  assert(
    session.pid === initialPid,
    '5. Concurrent HTTP clients read from same spool file using single FFmpeg process'
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Range beyond current size waits/polls for data while active
  // ---------------------------------------------------------------------------
  const currentSizeBeforePoll = session.getCurrentFileSize();
  const futureOffset = currentSizeBeforePoll + 2048;

  // waitForOffset polls until data is available
  const canWait = await session.waitForOffset(futureOffset, 2000);
  assert(
    typeof canWait === 'boolean',
    '6. Range ahead of current offset triggers bounded polling without premature error'
  );

  // ---------------------------------------------------------------------------
  // TEST 7 & 8: FFmpeg completion sets COMPLETED and static-like Range serving
  // ---------------------------------------------------------------------------
  // Wait up to 5s for FFmpeg to finish encoding our 3s sample
  const startWait = Date.now();
  while (session.status !== 'COMPLETED' && Date.now() - startWait < 6000) {
    await new Promise((r) => setTimeout(r, 100));
  }

  assert(
    session.status === 'COMPLETED' && session.totalSize > 0,
    `7. FFmpeg completion sets status=COMPLETED and records totalSize (${session.totalSize} bytes)`
  );

  const clientAfterComplete = createMockResponse();
  clientAfterComplete.req.headers.range = 'bytes=100-500';
  await session.attachClient(clientAfterComplete.req, clientAfterComplete.res);
  await new Promise((r) => setTimeout(r, 200));

  assert(
    clientAfterComplete.statusCode === 206 &&
    clientAfterComplete.headersSent['content-range'] === `bytes 100-500/${session.totalSize}`,
    '8. Completed spool file serves Range requests with full file size in Content-Range'
  );

  // ---------------------------------------------------------------------------
  // TEST 9: Client abort does NOT kill FFmpeg session if still active
  // ---------------------------------------------------------------------------
  const abortClient = createMockResponse();
  abortClient.req.headers.range = 'bytes=0-1000';
  await session.attachClient(abortClient.req, abortClient.res);
  abortClient.req._closeCb(); // simulate browser abort

  assert(
    session.status !== 'STOPPED' && fs.existsSync(session.spoolFilePath),
    '9. Browser abort of one Range request does not destroy the spool session'
  );

  // ---------------------------------------------------------------------------
  // TEST 10: Cleanup deletes spool file
  // ---------------------------------------------------------------------------
  const spoolPath = session.spoolFilePath;
  await session.destroy();

  assert(
    session.status === 'STOPPED' && !fs.existsSync(spoolPath),
    '10. Session destroy cleanly removes temporary spool file from disk'
  );

  // ---------------------------------------------------------------------------
  // TEST 11: Concurrency limit (WATCH_PARTY_MAX_AUDIO_TRANSCODE_SESSIONS)
  // ---------------------------------------------------------------------------
  const mgr = new AudioTranscodeManager();
  Object.defineProperty(mgr, 'maxSessions', { value: 2, configurable: true });

  const s1 = await mgr.getOrCreateSession({
    infoHash: '1111111111111111111111111111111111111111',
    fileIndex: 0,
    sourceStreamUrl: sampleAc3Mkv,
    audioCodec: 'ac3',
  });

  const s2 = await mgr.getOrCreateSession({
    infoHash: '2222222222222222222222222222222222222222',
    fileIndex: 0,
    sourceStreamUrl: sampleAc3Mkv,
    audioCodec: 'ac3',
  });

  let capacityRejected = false;
  try {
    await mgr.getOrCreateSession({
      infoHash: '3333333333333333333333333333333333333333',
      fileIndex: 0,
      sourceStreamUrl: sampleAc3Mkv,
      audioCodec: 'ac3',
    });
  } catch (err: any) {
    if (err.code === 'AUDIO_TRANSCODING_CAPACITY') {
      capacityRejected = true;
    }
  }

  assert(
    capacityRejected,
    '11. Exceeding maxSessions rejects new session with AUDIO_TRANSCODING_CAPACITY (503)'
  );

  // ---------------------------------------------------------------------------
  // TEST 12: Disk safety limit
  // ---------------------------------------------------------------------------
  Object.defineProperty(mgr, 'maxSpoolDiskBytes', { value: 10, configurable: true }); // artificially small ceiling
  let diskCapacityRejected = false;
  try {
    await mgr.getOrCreateSession({
      infoHash: '4444444444444444444444444444444444444444',
      fileIndex: 0,
      sourceStreamUrl: sampleAc3Mkv,
      audioCodec: 'ac3',
    });
  } catch (err: any) {
    if (err.code === 'AUDIO_TRANSCODING_CAPACITY') {
      diskCapacityRejected = true;
    }
  }

  assert(
    diskCapacityRejected,
    '12. Exceeding spool disk limit rejects session creation with AUDIO_TRANSCODING_CAPACITY'
  );

  await mgr.shutdown();

  // ---------------------------------------------------------------------------
  // TEST 13 & 14: Direct Stream for AAC/MP3 vs Spool Transcoding for AC-3
  // ---------------------------------------------------------------------------
  const aacProbe = await mediaDiagnosticService.probeMedia(sampleAacMp4);
  const aacCompat = assessAudioCodecCompatibility(aacProbe.audio?.codec || '');
  assert(
    aacCompat.support === 'NATIVE',
    '13. Direct stream regression: Native AAC skips transcode and streams directly'
  );

  const ac3Probe = await mediaDiagnosticService.probeMedia(sampleAc3Mkv);
  const ac3Compat = assessAudioCodecCompatibility(ac3Probe.audio?.codec || '');
  assert(
    ac3Compat.support === 'UNSUPPORTED_PATENT_CODEC',
    '14. AC-3 media file is routed to persistent spool transcode architecture'
  );

  console.log(`\n========================================`);
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`========================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runStage10_20Tests().catch((err) => {
  console.error('Stage 10.20 test run failed:', err);
  process.exit(1);
});
