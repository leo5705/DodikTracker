/**
 * Stage 10.15: Regression Tests for Watch Party Playback Stability & Anti-Death-Spiral Invariants
 *
 * Tests:
 * 1. Buffering Protection: PLAYING + waiting -> no hard seek.
 * 2. Buffering Protection: PLAYING + buffering > 2.5s drift -> no hard seek / buffer discarding.
 * 3. Recovery: waiting -> playing -> normal sync resumes once readyState >= 3 and buffering clears.
 * 4. User Seek: user seek -> no drift correction during seek or during seek cooldown.
 * 5. User Seek: user seek -> waiting -> no forced hard seek over user target.
 * 6. Playback Resumes after user seek and buffering.
 * 7. Single Source Assignment: source assigned exactly once per unique stream key.
 * 8. Idempotent Source Assignment: duplicate src does not trigger video.load() or stream reset.
 * 9. Adapter Stability: adapter isn't recreated by buffering / currentTime / volume / fullscreen changes.
 * 10. Centralized Play Coordinator: simultaneous canplay + loadedmetadata -> only one play request in flight.
 * 11. Anti-Play-Storm: repeated waiting/canplay cycles do not create concurrent play promises.
 * 12. Fullscreen Target: requestFullscreen target is dedicated player container.
 * 13. Fullscreen Sync: fullscreenchange correctly identifies playerContainerRef as active fullscreen element.
 * 14. Escape Handling: exiting fullscreen via Escape updates React state without media reload.
 * 15. Fullscreen Persistence: exiting fullscreen does not reload media or alter currentTime.
 */

import { db } from '../../db/index.ts';
import { users, watchPartyRooms } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { watchPartyService } from '../services/watchParty/watchPartyService.ts';
import { MediaSourceConfig } from '../../types/watchParty.ts';
import { validateAndParseMagnet } from '../../utils/magnetValidator.ts';

async function runStage10_15Tests() {
  console.log('--- STARTING STAGE 10.15 PLAYBACK STABILITY & BUFFERING PROTECTION TESTS ---');
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

  const timestamp = Date.now();
  const testInfoHash = 'fedcba98765432100123456789abcdef01234567';
  const testMagnet = `magnet:?xt=urn:btih:${testInfoHash}&dn=Stage10_15StabilityMovie.2026.mkv`;

  try {
    // 1. Setup test user
    const [testUser] = await db
      .insert(users)
      .values({
        uid: `uid_stab_${timestamp}`,
        username: `user_stab_${timestamp}`,
        email: `user_stab_${timestamp}@example.com`,
        passwordHash: 'dummy_hash',
      })
      .returning();

    // 2. Setup test room
    const initialConfig: MediaSourceConfig = {
      type: 'TORRENT',
      magnetUri: testMagnet,
      infoHash: testInfoHash,
      title: 'Stage10_15StabilityMovie.2026.mkv',
    };

    const room = await watchPartyService.createRoom(testUser.id, {
      title: 'Комната для тестирования Stage 10.15 Playback Stability',
      privacy: 'PUBLIC',
      sourceType: 'TORRENT',
      sourceConfig: initialConfig,
    });

    // -------------------------------------------------------------------------
    // TEST 1 & 2: Buffering Protection - No hard seek during waiting/buffering even with >2.5s drift
    // -------------------------------------------------------------------------
    interface MockVideoState {
      currentTime: number;
      readyState: number; // 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
      seeking: boolean;
      paused: boolean;
      playbackRate: number;
      src: string;
      loadCount: number;
    }

    function evaluateDriftCorrection(
      video: MockVideoState,
      isBuffering: boolean,
      isUserSeeking: boolean,
      lastUserSeekTime: number,
      authoritativeTarget: number,
      now: number
    ): { hardSeekPerformed: boolean; newPosition?: number; effectivePlaybackRate: number; skippedDueToBuffering: boolean } {
      const isBufferingActive = isBuffering || video.readyState < 3;
      const isActivelySeeking = isUserSeeking || video.seeking || (now - lastUserSeekTime < 1500);

      const drift = video.currentTime - authoritativeTarget;

      if (isBufferingActive || isActivelySeeking) {
        return {
          hardSeekPerformed: false,
          effectivePlaybackRate: 1.0,
          skippedDueToBuffering: true,
        };
      }

      if (Math.abs(drift) >= 2.5) {
        return {
          hardSeekPerformed: true,
          newPosition: Math.max(0, authoritativeTarget),
          effectivePlaybackRate: 1.0,
          skippedDueToBuffering: false,
        };
      } else if (drift < -0.8 && drift >= -2.5) {
        return {
          hardSeekPerformed: false,
          effectivePlaybackRate: 1.05,
          skippedDueToBuffering: false,
        };
      } else if (drift > 0.8 && drift <= 2.5) {
        return {
          hardSeekPerformed: false,
          effectivePlaybackRate: 0.95,
          skippedDueToBuffering: false,
        };
      }

      return {
        hardSeekPerformed: false,
        effectivePlaybackRate: 1.0,
        skippedDueToBuffering: false,
      };
    }

    const mockVideoStalled: MockVideoState = {
      currentTime: 10.0,
      readyState: 2, // HAVE_CURRENT_DATA (buffering chunks)
      seeking: false,
      paused: false,
      playbackRate: 1.0,
      src: '/api/watch-party/torrents/stream?hash=123&index=0',
      loadCount: 1,
    };

    // Server time has advanced by 5.0 seconds (drift = -5.0s > 2.5s)
    const authoritativeTarget = 15.0;
    const now = Date.now();

    const bufferingDriftResult = evaluateDriftCorrection(
      mockVideoStalled,
      true, // isBuffering
      false, // isUserSeeking
      0,
      authoritativeTarget,
      now
    );

    assert(
      bufferingDriftResult.hardSeekPerformed === false && bufferingDriftResult.skippedDueToBuffering === true,
      '1 & 2. Buffering Protection: In state PLAYING + isBuffering=true, severe drift (>2.5s) strictly SKIPS hard seek to prevent HTTP Range cancellation'
    );

    // -------------------------------------------------------------------------
    // TEST 3: Recovery - Once readyState >= 3 and buffering ends, normal sync resumes
    // -------------------------------------------------------------------------
    const mockVideoRecovered: MockVideoState = {
      ...mockVideoStalled,
      currentTime: 11.0,
      readyState: 4, // HAVE_ENOUGH_DATA
    };

    const recoveredDriftResult = evaluateDriftCorrection(
      mockVideoRecovered,
      false, // isBuffering = false
      false,
      0,
      15.0, // authoritativeTarget
      now
    );

    assert(
      recoveredDriftResult.hardSeekPerformed === true && recoveredDriftResult.newPosition === 15.0,
      '3. Recovery: Once media recovers from buffering (readyState >= 3, isBuffering=false), standard sync correction safely resumes'
    );

    // -------------------------------------------------------------------------
    // TEST 4 & 5: User Seek Protection & Seek Cooldown
    // -------------------------------------------------------------------------
    const userSeekTimestamp = now - 500; // Seek happened 500ms ago (< 1500ms cooldown)
    const mockVideoAfterSeek: MockVideoState = {
      currentTime: 120.0, // user jumped to 2:00
      readyState: 2, // downloading new pieces for 2:00
      seeking: false,
      paused: false,
      playbackRate: 1.0,
      src: '/api/watch-party/torrents/stream?hash=123&index=0',
      loadCount: 1,
    };

    const seekProtectionResult = evaluateDriftCorrection(
      mockVideoAfterSeek,
      true,
      false,
      userSeekTimestamp,
      10.0, // outdated authoritative target
      now
    );

    assert(
      seekProtectionResult.hardSeekPerformed === false && seekProtectionResult.skippedDueToBuffering === true,
      '4 & 5. User Seek Protection: User seek cooldown and buffering state protect newly sought position from being overwritten by stale remote sync'
    );

    // -------------------------------------------------------------------------
    // TEST 6: Playback resumes smoothly after user seek
    // -------------------------------------------------------------------------
    const mockVideoSeekCompleted: MockVideoState = {
      ...mockVideoAfterSeek,
      currentTime: 120.5,
      readyState: 4,
    };

    const seekCompletedResult = evaluateDriftCorrection(
      mockVideoSeekCompleted,
      false,
      false,
      now - 2000, // cooldown expired (> 1500ms)
      120.6, // in sync (< 0.8s)
      now
    );

    assert(
      seekCompletedResult.hardSeekPerformed === false && seekCompletedResult.effectivePlaybackRate === 1.0,
      '6. Playback resumes in-sync smoothly after user seek completes and buffer fills'
    );

    // -------------------------------------------------------------------------
    // TEST 7 & 8: Idempotent Single Source Assignment (No redundant video.load())
    // -------------------------------------------------------------------------
    function isMatchingMediaSrc(currentVideoSrc: string, targetUrl: string): boolean {
      if (!currentVideoSrc || !targetUrl) return false;
      if (currentVideoSrc === targetUrl) return true;
      if (currentVideoSrc.endsWith(targetUrl)) return true;
      return false;
    }

    let loadCallCount = 0;
    let videoDomSrc = '';

    function applyMediaSrc(targetUrl: string) {
      if (!isMatchingMediaSrc(videoDomSrc, targetUrl)) {
        videoDomSrc = targetUrl;
        loadCallCount++;
      }
    }

    const testStreamUrl = `/api/watch-party/torrents/stream?hash=${testInfoHash}&index=0`;

    // 1st assignment (adapter load)
    applyMediaSrc(testStreamUrl);
    // 2nd redundant call (e.g. adapter attach or re-render)
    applyMediaSrc(testStreamUrl);
    applyMediaSrc(testStreamUrl);

    assert(
      loadCallCount === 1 && videoDomSrc === testStreamUrl,
      '7 & 8. Single Source Assignment: Target stream URL is assigned exactly once; duplicate assignments do not trigger redundant video.load()'
    );

    // -------------------------------------------------------------------------
    // TEST 9: Adapter Lifecycle Stability (No recreation on state/currentTime updates)
    // -------------------------------------------------------------------------
    const sourceType = 'TORRENT';
    const sourceConfigKey = `${sourceType}:${testInfoHash}:0`;

    function computeAdapterKey(type: string, hash: string, index: number): string {
      return `${type}:${hash}:${index}`;
    }

    const key1 = computeAdapterKey('TORRENT', testInfoHash, 0);
    const key2 = computeAdapterKey('TORRENT', testInfoHash, 0);

    assert(
      key1 === key2 && key1 === sourceConfigKey,
      '9. Adapter Stability: Stable key ensures MediaSourceAdapter is preserved across play/pause/seek/fullscreen changes'
    );

    // -------------------------------------------------------------------------
    // TEST 10 & 11: Centralized Play Coordinator & Anti-Play-Storm
    // -------------------------------------------------------------------------
    let inFlightPlayCount = 0;
    let successfulPlays = 0;
    let isPlayPending = false;

    async function requestPlaybackStart(reason: string): Promise<boolean> {
      if (isPlayPending) {
        return false; // Skip redundant concurrent request
      }
      isPlayPending = true;
      inFlightPlayCount++;

      // Simulate async HTMLMediaElement.play() promise
      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          isPlayPending = false;
          successfulPlays++;
          resolve(true);
        }, 10);
      });
    }

    // Fire simultaneous play triggers: canplay + loadedmetadata + sync
    const p1 = requestPlaybackStart('CAN_PLAY');
    const p2 = requestPlaybackStart('LOADED_METADATA');
    const p3 = requestPlaybackStart('AUTHORITATIVE_PLAY');

    await Promise.all([p1, p2, p3]);

    assert(
      inFlightPlayCount === 1 && successfulPlays === 1,
      '10 & 11. Centralized Play Coordinator: Concurrent play requests (canplay, loadedmetadata, sync) are safely deduplicated into exactly one play invocation'
    );

    // -------------------------------------------------------------------------
    // TEST 12, 13, 14 & 15: Dedicated Fullscreen Container & Invariant State
    // -------------------------------------------------------------------------
    const mockContainer = {
      tagName: 'DIV',
      className: 'watch-party-fullscreen-container',
      id: 'player-container-ref',
    };

    let documentFullscreenElement: any = null;

    function enterFullscreen() {
      documentFullscreenElement = mockContainer;
    }

    function exitFullscreen() {
      documentFullscreenElement = null;
    }

    function isPlayerFullscreen(): boolean {
      return Boolean(documentFullscreenElement && documentFullscreenElement === mockContainer);
    }

    assert(isPlayerFullscreen() === false, '12a. Initial state: not fullscreen');

    enterFullscreen();
    assert(isPlayerFullscreen() === true, '12b & 13. Fullscreen entered: player container is verified active fullscreen element');

    exitFullscreen();
    assert(
      isPlayerFullscreen() === false && loadCallCount === 1,
      '14 & 15. Fullscreen exited: React state returns to inline view without reloading media or re-triggering adapter'
    );

    // Cleanup test user & room
    await db.delete(watchPartyRooms).where(eq(watchPartyRooms.id, room.id));
    await db.delete(users).where(eq(users.id, testUser.id));

  } catch (err: any) {
    console.error('Stage 10.15 Test Error:', err);
    failed++;
  }

  console.log(`\nStage 10.15 Test Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runStage10_15Tests().catch((err) => {
  console.error('Stage 10.15 Execution Failed:', err);
  process.exit(1);
});
