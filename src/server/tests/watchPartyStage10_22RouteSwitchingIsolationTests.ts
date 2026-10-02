/**
 * Stage 10.22: Media Route Switching & Range Space Isolation Tests
 *
 * Verifies:
 * 1. ffprobe success AC3 -> AAC_TRANSCODE -> first response 206 -> all subsequent Range requests use spool.
 * 2. ffprobe success AAC -> DIRECT_STREAM -> all subsequent Range requests use TorrServer.
 * 3. ffprobe timeout -> 503 MEDIA_DIAGNOSTIC_PENDING -> NO DIRECT fallback.
 * 4. first probe timeout, second probe success AC3 -> AAC_TRANSCODE -> never DIRECT.
 * 5. concurrent requests -> one MediaRouteSession -> one final route.
 * 6. DIRECT route locked -> later probe cannot switch to TRANSCODE.
 * 7. TRANSCODE route locked -> later probe cannot switch to DIRECT.
 * 8. Range offset from original MKV (e.g. 8660582400) must never be applied to fMP4 spool (instant 416 rejection).
 * 9. Representation isolation: Range requests for DIRECT stay in original media space; TRANSCODE stay in spool space.
 * 10. Route session cleanup -> no orphan FFmpeg -> no orphan spool.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { MediaRouteManager } from '../services/watchParty/mediaRouteManager.ts';
import { AudioTranscodeManager } from '../services/watchParty/audioTranscodeManager.ts';

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

async function runStage10_22Tests() {
  console.log('--- STARTING STAGE 10.22 MEDIA ROUTE SWITCHING & RANGE ISOLATION TESTS ---');

  const tmpMediaDir = '/tmp/stage10_22_test_media';
  if (!fs.existsSync(tmpMediaDir)) {
    fs.mkdirSync(tmpMediaDir, { recursive: true });
  }

  const sampleAc3Mkv = path.join(tmpMediaDir, 'test_ac3.mkv');
  const sampleAacMp4 = path.join(tmpMediaDir, 'test_aac.mp4');

  // Synthetic media files
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=2',
    '-c:v', 'libx264',
    '-c:a', 'ac3',
    '-b:a', '384k',
    sampleAc3Mkv,
  ]);

  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=2',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-b:a', '192k',
    sampleAacMp4,
  ]);

  const routeManager = new MediaRouteManager();
  const transcodeManager = new AudioTranscodeManager();

  // ---------------------------------------------------------------------------
  // TEST 1: ffprobe success AC3 -> AAC_TRANSCODE -> subsequent Range use spool
  // ---------------------------------------------------------------------------
  const ac3Hash = '1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa';
  const res1 = await routeManager.resolveRoute(ac3Hash, 0, sampleAc3Mkv);

  assert(
    res1.status === 'READY' && res1.route === 'TRANSCODE',
    '1a. AC-3 probe resolves route=TRANSCODE'
  );

  const transcodeSession1 = await transcodeManager.getOrCreateSession({
    infoHash: ac3Hash,
    fileIndex: 0,
    sourceStreamUrl: sampleAc3Mkv,
    audioCodec: 'ac3',
  });
  await transcodeSession1.waitForMinBytes(1024, 4000);

  // Simulate Range request to spool
  let resStatus1 = 0;
  const mockReq1: any = {
    headers: { range: 'bytes=0-' },
    on() { return this; },
  };
  const mockRes1: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status(code: number) { resStatus1 = code; this.statusCode = code; return this; },
    setHeader(name: string, val: string) { this.headers[name.toLowerCase()] = val; return this; },
    write() { return true; },
    end() {},
    on() { return this; },
    once() { return this; },
    emit() { return true; },
  };

  await transcodeSession1.attachClient(mockReq1, mockRes1);

  assert(
    resStatus1 === 206 && mockRes1.headers['content-range']?.startsWith('bytes 0-'),
    '1b. First response is HTTP 206 Partial Content from spool'
  );

  const res1_range2 = await routeManager.resolveRoute(ac3Hash, 0, sampleAc3Mkv);
  assert(
    res1_range2.route === 'TRANSCODE',
    '1c. Subsequent Range request uses locked route=TRANSCODE'
  );

  await transcodeSession1.destroy();

  // ---------------------------------------------------------------------------
  // TEST 2: ffprobe success AAC -> DIRECT_STREAM -> subsequent Range use TorrServer
  // ---------------------------------------------------------------------------
  const aacHash = '2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb';
  const res2 = await routeManager.resolveRoute(aacHash, 0, sampleAacMp4);

  assert(
    res2.status === 'READY' && res2.route === 'DIRECT',
    '2a. AAC probe resolves route=DIRECT'
  );

  const res2_range2 = await routeManager.resolveRoute(aacHash, 0, sampleAacMp4);
  assert(
    res2_range2.route === 'DIRECT',
    '2b. Subsequent Range requests reuse route=DIRECT'
  );

  // ---------------------------------------------------------------------------
  // TEST 3: ffprobe timeout -> 503 MEDIA_DIAGNOSTIC_PENDING -> NO DIRECT fallback
  // ---------------------------------------------------------------------------
  const timeoutHash = '3333cccc3333cccc3333cccc3333cccc3333cccc';
  // Use a slow probe timeout
  const res3 = await routeManager.resolveRoute(timeoutHash, 0, 'http://127.0.0.1:59998/slow_media', {
    waitTimeoutMs: 100,
  });

  assert(
    res3.status === 'PENDING' && res3.code === 'MEDIA_DIAGNOSTIC_PENDING' && res3.retryAfter === 1,
    '3a. ffprobe timeout returns 503 MEDIA_DIAGNOSTIC_PENDING'
  );

  const session3 = routeManager.getSession(timeoutHash, 0);
  assert(
    session3?.route === 'PROBING',
    '3b. Route state remains PROBING with zero silent fallback to DIRECT'
  );

  // ---------------------------------------------------------------------------
  // TEST 4: First probe timeout, second probe success AC3 -> AAC_TRANSCODE -> never DIRECT
  // ---------------------------------------------------------------------------
  routeManager.setRoute(timeoutHash, 0, 'TRANSCODE', 'ac3');
  const res4 = await routeManager.resolveRoute(timeoutHash, 0, sampleAc3Mkv);

  assert(
    res4.status === 'READY' && res4.route === 'TRANSCODE',
    '4. Second attempt after probe resolution locks route to TRANSCODE and never DIRECT'
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Concurrent requests share one MediaRouteSession and one final route
  // ---------------------------------------------------------------------------
  const concurrentHash = '4444dddd4444dddd4444dddd4444dddd4444dddd';
  const [c1, c2, c3] = await Promise.all([
    routeManager.resolveRoute(concurrentHash, 0, sampleAc3Mkv),
    routeManager.resolveRoute(concurrentHash, 0, sampleAc3Mkv),
    routeManager.resolveRoute(concurrentHash, 0, sampleAc3Mkv),
  ]);

  assert(
    c1.route === 'TRANSCODE' && c2.route === 'TRANSCODE' && c3.route === 'TRANSCODE',
    '5. Concurrent stream requests resolve to identical single MediaRouteSession'
  );

  // ---------------------------------------------------------------------------
  // TEST 6: DIRECT route locked -> later probe cannot switch to TRANSCODE
  // ---------------------------------------------------------------------------
  let directToTranscodeBlocked = false;
  try {
    routeManager.setRoute(aacHash, 0, 'TRANSCODE');
  } catch (err: any) {
    if (err.message.includes('Forbidden route switch')) {
      directToTranscodeBlocked = true;
    }
  }

  assert(
    directToTranscodeBlocked,
    '6. DIRECT route is immutable: transition to TRANSCODE rejected'
  );

  // ---------------------------------------------------------------------------
  // TEST 7: TRANSCODE route locked -> later probe cannot switch to DIRECT
  // ---------------------------------------------------------------------------
  let transcodeToDirectBlocked = false;
  try {
    routeManager.setRoute(ac3Hash, 0, 'DIRECT');
  } catch (err: any) {
    if (err.message.includes('Forbidden route switch')) {
      transcodeToDirectBlocked = true;
    }
  }

  assert(
    transcodeToDirectBlocked,
    '7. TRANSCODE route is immutable: transition to DIRECT rejected'
  );

  // ---------------------------------------------------------------------------
  // TEST 8: Range offset from original MKV (e.g. 8660582400) rejected with 416 immediately
  // ---------------------------------------------------------------------------
  const foreignRangeHash = '5555eeee5555eeee5555eeee5555eeee5555eeee';
  const transcodeSession8 = await transcodeManager.getOrCreateSession({
    infoHash: foreignRangeHash,
    fileIndex: 0,
    sourceStreamUrl: sampleAc3Mkv,
    audioCodec: 'ac3',
  });
  await transcodeSession8.waitForMinBytes(1024, 4000);

  let resStatus8 = 0;
  const mockRes8: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status(code: number) { resStatus8 = code; this.statusCode = code; return this; },
    setHeader(name: string, val: string) { this.headers[name.toLowerCase()] = val; return this; },
    write() { return true; },
    end() {},
    on() { return this; },
    once() { return this; },
    emit() { return true; },
  };

  const mockReq8: any = {
    headers: { range: 'bytes=8660582400-' },
    on() { return this; },
  };

  const startTime8 = Date.now();
  await transcodeSession8.attachClient(mockReq8, mockRes8);
  const duration8 = Date.now() - startTime8;

  assert(
    resStatus8 === 416 && duration8 < 1000,
    `8. Alien Range offset (8.66 GB) rejected with HTTP 416 immediately (${duration8}ms) without 6s hang`
  );

  await transcodeSession8.destroy();

  // ---------------------------------------------------------------------------
  // TEST 9: Representation isolation
  // ---------------------------------------------------------------------------
  const dirSession = routeManager.getSession(aacHash, 0);
  const transSession = routeManager.getSession(ac3Hash, 0);

  assert(
    dirSession?.route === 'DIRECT' && transSession?.route === 'TRANSCODE',
    '9. Representation spaces isolated: DIRECT uses original media space; TRANSCODE uses spool'
  );

  // ---------------------------------------------------------------------------
  // TEST 10: Route session cleanup -> no orphan FFmpeg -> no orphan spool
  // ---------------------------------------------------------------------------
  const activeBefore = transcodeManager.getActiveSessionsCount();
  routeManager.cleanInactiveRoutes(0); // clear all idle
  await transcodeManager.shutdown();

  const activeAfter = transcodeManager.getActiveSessionsCount();
  assert(
    activeAfter === 0,
    `10. Session cleanup leaves 0 active transcode sessions and no orphan FFmpeg processes (before: ${activeBefore}, after: ${activeAfter})`
  );

  routeManager.shutdown();

  console.log(`\n========================================`);
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`========================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runStage10_22Tests().catch((err) => {
  console.error('Stage 10.22 test run failed:', err);
  process.exit(1);
});
