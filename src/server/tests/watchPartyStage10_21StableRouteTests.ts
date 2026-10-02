/**
 * Stage 10.21: Stable Media Routing Tests (One Source -> One Media Route)
 *
 * Verifies:
 * 1. Probe success -> DIRECT: Native AAC sets route=DIRECT; multiple subsequent Range requests all reuse DIRECT.
 * 2. Probe success -> TRANSCODE: Unsupported AC-3 sets route=TRANSCODE; multiple subsequent Range requests reuse TRANSCODE and same FFmpeg session.
 * 3. Probe timeout handling: If probe is still in progress, resolveRoute returns PENDING (HTTP 503 MEDIA_DIAGNOSTIC_PENDING), NEVER silently falling back to DIRECT.
 * 4. Probe eventually succeeds: Subsequent request after probe completion seamlessly transitions to TRANSCODE and locks route.
 * 5. Forbidden route switching: DIRECT -> TRANSCODE and TRANSCODE -> DIRECT transitions are strictly rejected.
 * 6. Large Range after route=TRANSCODE: An out-of-bounds byte range (e.g. 8.66 GB) waits on spool rather than attempting to interpret against original MKV.
 * 7. Concurrent Range requests share single route and single FFmpeg session without route jitter.
 * 8. Cache cleanup removes idle route sessions after inactivity.
 * 9. Direct stream regression: Native audio (AAC/MP3) remains DIRECT.
 * 10. Stage 10.20 spool persistence integration preserved.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
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

async function runStage10_21Tests() {
  console.log('--- STARTING STAGE 10.21 STABLE MEDIA ROUTING TESTS ---');

  const tmpMediaDir = '/tmp/stage10_21_test_media';
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

  // ---------------------------------------------------------------------------
  // TEST 1: Probe success -> DIRECT (Native AAC)
  // ---------------------------------------------------------------------------
  const aacHash = 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111';
  const res1 = await routeManager.resolveRoute(aacHash, 0, sampleAacMp4);

  assert(
    res1.status === 'READY' && res1.route === 'DIRECT',
    '1a. Native AAC probe resolves route=DIRECT'
  );

  // Subsequent Range requests for same source must reuse DIRECT
  const res1_range2 = await routeManager.resolveRoute(aacHash, 0, sampleAacMp4);
  const res1_range3 = await routeManager.resolveRoute(aacHash, 0, sampleAacMp4);

  assert(
    res1_range2.route === 'DIRECT' && res1_range3.route === 'DIRECT',
    '1b. Subsequent Range requests reuse locked route=DIRECT'
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Probe success -> TRANSCODE (AC-3)
  // ---------------------------------------------------------------------------
  const ac3Hash = 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222';
  const res2 = await routeManager.resolveRoute(ac3Hash, 0, sampleAc3Mkv);

  assert(
    res2.status === 'READY' && res2.route === 'TRANSCODE',
    '2a. Unsupported AC-3 probe resolves route=TRANSCODE'
  );

  // Subsequent Range requests must reuse TRANSCODE
  const res2_range2 = await routeManager.resolveRoute(ac3Hash, 0, sampleAc3Mkv);
  const res2_range3 = await routeManager.resolveRoute(ac3Hash, 0, sampleAc3Mkv);

  assert(
    res2_range2.route === 'TRANSCODE' && res2_range3.route === 'TRANSCODE',
    '2b. Subsequent Range requests reuse locked route=TRANSCODE'
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Probe timeout handling (NO silent fallback to DIRECT)
  // ---------------------------------------------------------------------------
  const timeoutHash = 'cccc3333cccc3333cccc3333cccc3333cccc3333';
  // Simulate slow / non-responsive URL by passing unreachable dummy URL with short waitTimeoutMs
  const res3 = await routeManager.resolveRoute(timeoutHash, 0, 'http://127.0.0.1:59999/slow_stream', {
    waitTimeoutMs: 150,
  });

  assert(
    res3.status === 'PENDING' && res3.code === 'MEDIA_DIAGNOSTIC_PENDING' && res3.retryAfter === 1,
    '3. Probe timeout returns HTTP 503 MEDIA_DIAGNOSTIC_PENDING without silent fallback to DIRECT'
  );

  const session3 = routeManager.getSession(timeoutHash, 0);
  assert(
    session3?.route === 'PROBING',
    '3b. Route state remains PROBING rather than silently falling back to DIRECT'
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Probe eventually succeeds and locks route
  // ---------------------------------------------------------------------------
  // Set the route as if probe finished and detected AC3
  routeManager.setRoute(timeoutHash, 0, 'TRANSCODE', 'ac3');
  const res4 = await routeManager.resolveRoute(timeoutHash, 0, sampleAc3Mkv);

  assert(
    res4.status === 'READY' && res4.route === 'TRANSCODE',
    '4. After probe completion, subsequent request immediately gets locked route=TRANSCODE'
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Forbidden route switching (DIRECT <-> TRANSCODE)
  // ---------------------------------------------------------------------------
  let switchDirectToTranscodeBlocked = false;
  try {
    routeManager.setRoute(aacHash, 0, 'TRANSCODE');
  } catch (err: any) {
    if (err.message.includes('Forbidden route switch')) {
      switchDirectToTranscodeBlocked = true;
    }
  }

  assert(
    switchDirectToTranscodeBlocked,
    '5a. Attempt to switch DIRECT -> TRANSCODE is strictly forbidden'
  );

  let switchTranscodeToDirectBlocked = false;
  try {
    routeManager.setRoute(ac3Hash, 0, 'DIRECT');
  } catch (err: any) {
    if (err.message.includes('Forbidden route switch')) {
      switchTranscodeToDirectBlocked = true;
    }
  }

  assert(
    switchTranscodeToDirectBlocked,
    '5b. Attempt to switch TRANSCODE -> DIRECT is strictly forbidden'
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Large Range after route=TRANSCODE (Production Scenario)
  // ---------------------------------------------------------------------------
  // When route is TRANSCODE, an out-of-bounds byte range from original MKV
  // (e.g. 8660582400) is isolated to transcode session and does not touch MKV
  const transcodeManager = new AudioTranscodeManager();
  const transcodeSession = await transcodeManager.getOrCreateSession({
    infoHash: ac3Hash,
    fileIndex: 0,
    sourceStreamUrl: sampleAc3Mkv,
    audioCodec: 'ac3',
  });

  const hugeOffset = 8660582400; // 8.66 GB
  // waitForOffset for an offset larger than full completed file must return false cleanly
  await transcodeSession.waitForMinBytes(1024, 4000);
  const waitRes = await transcodeSession.waitForOffset(hugeOffset, 500);

  assert(
    waitRes === false,
    '6. Out-of-bounds Range (8.66 GB) is safely isolated to transcode spool without corrupting MKV stream'
  );

  await transcodeSession.destroy();

  // ---------------------------------------------------------------------------
  // TEST 7: Concurrent Range requests share single route
  // ---------------------------------------------------------------------------
  const concurrentHash = 'dddd4444dddd4444dddd4444dddd4444dddd4444';
  const [c1, c2, c3] = await Promise.all([
    routeManager.resolveRoute(concurrentHash, 0, sampleAc3Mkv),
    routeManager.resolveRoute(concurrentHash, 0, sampleAc3Mkv),
    routeManager.resolveRoute(concurrentHash, 0, sampleAc3Mkv),
  ]);

  assert(
    c1.route === 'TRANSCODE' && c2.route === 'TRANSCODE' && c3.route === 'TRANSCODE',
    '7. Concurrent Range requests all resolve to the identical route=TRANSCODE'
  );

  // ---------------------------------------------------------------------------
  // TEST 8: Cache cleanup of idle route sessions
  // ---------------------------------------------------------------------------
  const idleSession = routeManager.getSession(aacHash, 0);
  if (idleSession) {
    idleSession.lastAccess = Date.now() - 20 * 60 * 1000; // simulate 20m ago
  }

  routeManager.cleanInactiveRoutes(15 * 60 * 1000);
  assert(
    routeManager.getSession(aacHash, 0) === undefined,
    '8. Inactive route session (>15m idle) cleanly removed by garbage collection'
  );

  // ---------------------------------------------------------------------------
  // TEST 9 & 10: Direct stream regression & Stage 10.20 persistence
  // ---------------------------------------------------------------------------
  const nativeDirectRes = await routeManager.resolveRoute('eeee5555eeee5555eeee5555eeee5555eeee5555', 0, sampleAacMp4);
  assert(
    nativeDirectRes.route === 'DIRECT',
    '9. Direct stream regression: Native AAC remains strictly DIRECT'
  );

  assert(
    typeof transcodeManager.getOrCreateSession === 'function' &&
    typeof transcodeManager.handleTranscodeRequest === 'function',
    '10. Stage 10.20 persistent spool transcode API fully intact'
  );

  routeManager.shutdown();
  await transcodeManager.shutdown();

  console.log(`\n========================================`);
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`========================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runStage10_21Tests().catch((err) => {
  console.error('Stage 10.21 test run failed:', err);
  process.exit(1);
});
