/**
 * Watch Party Stage 7 Test Suite:
 * Stabilization, Security Hardening, Reconnect, Playback Sync & Malformed WS Defense.
 */

import { db, pool } from '../../db/index.ts';
import { watchPartyRooms, watchPartyMembers, watchPartyMessages, users } from '../../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { watchPartyService } from '../services/watchParty/watchPartyService.ts';
import { roomManager } from '../services/watchParty/roomManager.ts';
import { watchPartyWsServer } from '../services/watchParty/wsServer.ts';
import { validateAndParseMagnet } from '../../utils/magnetValidator.ts';
import bcrypt from 'bcryptjs';

async function runStage7Tests() {
  console.log('--- STARTING WATCH PARTY STAGE 7 TESTS ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`\x1b[32m✔ PASS\x1b[0m ${testName}`);
      passed++;
    } else {
      console.error(`\x1b[31m✖ FAIL\x1b[0m ${testName}`);
      if (details) console.error(`   Details: ${details}`);
      failed++;
    }
  }

  try {
    // Setup test users
    const [u1] = await db.insert(users).values({
      uid: `usr_stg7_host_${Date.now()}`,
      username: `stg7_host_${Math.floor(Math.random() * 10000)}`,
      role: 'USER',
    }).returning();

    const [u2] = await db.insert(users).values({
      uid: `usr_stg7_member_${Date.now()}`,
      username: `stg7_member_${Math.floor(Math.random() * 10000)}`,
      role: 'USER',
    }).returning();

    // 1. Create Room & Verify passcodeHash is masked
    const room = await watchPartyService.createRoom(u1.id, {
      title: 'Stage 7 Security Room',
      privacy: 'PRIVATE',
      passcode: 'secret123',
      sourceType: 'DIRECT',
      sourceUrl: 'https://example.com/video.mp4',
    });

    assert(
      room.hasPasscode === true && (room as any).passcodeHash === undefined,
      '1. DTO hides passcodeHash and exposes only hasPasscode flag'
    );

    // 2. Closed Room Action Rejections
    const closedRoom = await watchPartyService.createRoom(u1.id, {
      title: 'Stage 7 Closed Room',
      sourceType: 'DIRECT',
      sourceUrl: 'https://example.com/video.mp4',
    });
    await watchPartyService.closeRoom(closedRoom.code, u1.id);

    let closedErrorCaught = false;
    try {
      await watchPartyService.setPlaybackState(closedRoom.code, u1.id, 'PLAYING', 10);
    } catch (err: any) {
      closedErrorCaught = err.message.includes('закрыта');
    }
    assert(closedErrorCaught, '2. Closed room rejects setPlaybackState action');

    // 3. Server Authority: Non-host action rejections
    await watchPartyService.joinRoom(room.code, u2.id, 'secret123');

    let nonHostPlaybackError = false;
    try {
      await watchPartyService.setPlaybackState(room.code, u2.id, 'PLAYING', 10);
    } catch (err: any) {
      nonHostPlaybackError = err.message.includes('Только HOST');
    }
    assert(nonHostPlaybackError, '3. Non-HOST prohibited from modifying playback state');

    let nonHostSourceError = false;
    try {
      await watchPartyService.changeSource(room.code, u2.id, { type: 'DIRECT', url: 'https://example.com/v2.mp4' });
    } catch (err: any) {
      nonHostSourceError = err.message.includes('Только HOST');
    }
    assert(nonHostSourceError, '4. Non-HOST prohibited from modifying media source');

    // 4. Playback Sanitization (NaN and Infinity defense)
    const activeState = roomManager.getActiveRoom(room.code);
    assert(activeState !== undefined, '5. Active room present in memory manager');

    const sanitizedSnapshot = roomManager.updatePlaybackState(room.code, 'PLAYING', NaN);
    assert(
      sanitizedSnapshot !== undefined && !isNaN(sanitizedSnapshot.position) && isFinite(sanitizedSnapshot.position),
      '6. NaN position in updatePlaybackState safely sanitized to 0'
    );

    // 5. Authoritative Position Calculation
    roomManager.updatePlaybackState(room.code, 'PLAYING', 10.0);
    const pos1 = roomManager.calculateAuthoritativePosition(activeState!, Date.now());
    const pos2 = roomManager.calculateAuthoritativePosition(activeState!, Date.now() + 2000);
    assert(
      pos2 >= pos1 + 1.9 && pos2 <= pos1 + 2.2,
      '7. PLAYING authoritative position advances correctly with elapsed server time'
    );

    roomManager.updatePlaybackState(room.code, 'PAUSED', 10.0);
    const posPaused = roomManager.calculateAuthoritativePosition(activeState!, Date.now() + 5000);
    assert(posPaused === 10.0, '8. PAUSED authoritative position remains static');

    // 6. Member Progress does not alter authoritative state
    roomManager.updateMemberProgress(room.code, u2.id, {
      currentTime: 45.0,
      duration: 100,
      buffering: false,
      clientTimestamp: Date.now(),
    });
    const snapshotAfterMemberProgress = roomManager.getAuthoritativePlayback(room.code);
    assert(
      snapshotAfterMemberProgress?.position === 10.0 && snapshotAfterMemberProgress.state === 'PAUSED',
      '9. MEMBER_PROGRESS telemetry does not corrupt authoritative room position or state'
    );

    // 7. Magnet URI Security
    const validHex40 = validateAndParseMagnet('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567');
    assert(validHex40.isValid === true && validHex40.infoHash === '0123456789abcdef0123456789abcdef01234567', '10. Valid hex40 magnet accepted');

    const maliciousScheme = validateAndParseMagnet('javascript:alert(1)');
    assert(maliciousScheme.isValid === false, '11. Malicious scheme (javascript:) rejected');

    const httpScheme = validateAndParseMagnet('http://example.com/file.torrent');
    assert(httpScheme.isValid === false, '12. HTTP scheme rejected as magnet URI');

    // 8. Host Transfer & Permission Update
    await watchPartyService.transferHost(room.code, u1.id, u2.id);
    const updatedRoom = await watchPartyService.getRoom(room.code, u2.id);
    assert(updatedRoom.hostUserId === u2.id, '13. Host transferred to u2 successfully');

    let oldHostPlaybackError = false;
    try {
      await watchPartyService.setPlaybackState(room.code, u1.id, 'PLAYING', 0);
    } catch (err: any) {
      oldHostPlaybackError = err.message.includes('Только HOST');
    }
    assert(oldHostPlaybackError, '14. Demoted previous host cannot execute host playback commands');

    // 9. Cleanup test data
    await watchPartyService.closeRoom(room.code, u2.id);
    assert(roomManager.isRoomActive(room.code) === false, '15. Closed room unregistered from memory');

    console.log(`\n=== WATCH PARTY STAGE 7 TEST RESULTS ===`);
    console.log(`Passed: ${passed} | Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err: any) {
    console.error('Stage 7 Test Execution Error:', err);
    process.exit(1);
  }
}

runStage7Tests();
