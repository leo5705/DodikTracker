/**
 * Stage 10.9: Regression Tests for Watch Party Source Contract & Privacy Flow
 *
 * Specifically tests:
 * 1. Bug 1 Fix: Normal/Solo watch room creation does not trigger private room password validation.
 * 2. Bug 1 Rule: Genuine Private room without password (or < 3 chars) is strictly rejected.
 * 3. Bug 1 Rule: Genuine Private room with password >= 3 chars is successfully created.
 * 4. Bug 2 Fix: TorrentCandidate with HTTP/HTTPS downloadUrl and valid infoHash resolves cleanly into TORRENT source.
 * 5. Bug 2 Rule: Arbitrary non-torrent HTTP URL without infoHash is strictly rejected when passed as TORRENT.
 * 6. Server-side source persistence and playback state initialization.
 */

import { db } from '../../db/index.ts';
import { users, watchPartyRooms, watchPartyMembers, media } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { watchPartyService } from '../services/watchParty/watchPartyService.ts';
import { parseProwlarrJsonItem } from '../services/torrentSearch/torrentParser.ts';
import { validateAndParseMagnet } from '../../utils/magnetValidator.ts';
import { TorrentSearchQuery } from '../services/torrentSearch/torrentSearchTypes.ts';

async function runWatchPartySourceContractAndPrivacyTests() {
  console.log('--- STARTING WATCH PARTY SOURCE CONTRACT & PRIVACY REGRESSION TESTS ---');
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

  try {
    // -------------------------------------------------------------------------
    // Setup Test User and Test Media
    // -------------------------------------------------------------------------
    const [testUser] = await db
      .insert(users)
      .values({
        uid: `uid_wp_fix_${timestamp}`,
        username: `wp_user_${timestamp}`,
        email: `wp_user_${timestamp}@example.com`,
        passwordHash: 'dummy_hash',
      })
      .returning();

    const [testMedia] = await db
      .insert(media)
      .values({
        title: 'Интерстеллар Фикс',
        originalTitle: 'Interstellar Fix',
        type: 'MOVIE',
        year: 2014,
      })
      .returning();

    const validInfoHash = '0123456789abcdef0123456789abcdef01234567';
    const validMagnet = `magnet:?xt=urn:btih:${validInfoHash}&dn=Interstellar`;

    // -------------------------------------------------------------------------
    // TEST A (BUG 1 FIX): Normal / Solo Watch without password
    // -------------------------------------------------------------------------
    let soloRoomCreated = false;
    let soloRoomCode = '';
    try {
      const room = await watchPartyService.createRoom(testUser.id, {
        title: 'Интерстеллар — Обычный просмотр',
        privacy: 'PUBLIC', // Normal solo watch uses PUBLIC privacy without password requirement
        mediaId: testMedia.id,
        mediaType: 'MOVIE',
        sourceType: 'TORRENT',
        sourceConfig: {
          type: 'TORRENT',
          magnetUri: validMagnet,
          infoHash: validInfoHash,
          fileName: 'Interstellar.2014.1080p.mkv',
        },
      });
      if (room && room.code) {
        soloRoomCreated = true;
        soloRoomCode = room.code;
      }
    } catch (err: any) {
      console.error('Solo watch creation error:', err.message);
    }
    assert(
      soloRoomCreated,
      '1. [BUG 1 FIX] Normal / Solo watch room created successfully without password error'
    );

    // -------------------------------------------------------------------------
    // TEST B (BUG 1 RULE): Private Room with missing/short password is rejected
    // -------------------------------------------------------------------------
    let privateEmptyRejected = false;
    try {
      await watchPartyService.createRoom(testUser.id, {
        title: 'Приватная комната без пароля',
        privacy: 'PRIVATE',
        passcode: '', // Missing
        mediaId: testMedia.id,
        sourceType: 'TORRENT',
        sourceConfig: { type: 'TORRENT', magnetUri: validMagnet },
      });
    } catch (err: any) {
      if (err.message.includes('Для приватной комнаты требуется пароль')) {
        privateEmptyRejected = true;
      }
    }
    assert(
      privateEmptyRejected,
      '2. [BUG 1 RULE] Private room without password is strictly rejected with min 3 char error'
    );

    let privateShortRejected = false;
    try {
      await watchPartyService.createRoom(testUser.id, {
        title: 'Приватная комната с коротким паролем',
        privacy: 'PRIVATE',
        passcode: '12', // Less than 3 chars
        mediaId: testMedia.id,
        sourceType: 'TORRENT',
        sourceConfig: { type: 'TORRENT', magnetUri: validMagnet },
      });
    } catch (err: any) {
      if (err.message.includes('Для приватной комнаты требуется пароль')) {
        privateShortRejected = true;
      }
    }
    assert(
      privateShortRejected,
      '3. [BUG 1 RULE] Private room with passcode < 3 chars is strictly rejected'
    );

    // -------------------------------------------------------------------------
    // TEST C (BUG 1 RULE): Private Room with valid password (>= 3 chars) succeeds
    // -------------------------------------------------------------------------
    let privateValidCreated = false;
    let privateRoomCode = '';
    try {
      const room = await watchPartyService.createRoom(testUser.id, {
        title: 'Приватная комната с паролем',
        privacy: 'PRIVATE',
        passcode: 'secret123',
        mediaId: testMedia.id,
        sourceType: 'TORRENT',
        sourceConfig: { type: 'TORRENT', magnetUri: validMagnet },
      });
      if (room && room.code && room.privacy === 'PRIVATE') {
        privateValidCreated = true;
        privateRoomCode = room.code;
      }
    } catch (err: any) {
      console.error('Private room valid creation error:', err.message);
    }
    assert(
      privateValidCreated,
      '4. [BUG 1 RULE] Private room with valid passcode (>= 3 chars) created successfully'
    );

    // -------------------------------------------------------------------------
    // TEST D (BUG 2 FIX): Prowlarr/RuTor item with downloadUrl + infoHash resolves to TORRENT
    // -------------------------------------------------------------------------
    const rutorProwlarrItem = {
      title: 'Интерстеллар / Interstellar (2014) BDRip 1080p | D',
      size: 11811160064,
      seeders: 65,
      leechers: 4,
      indexer: 'RuTor',
      guid: 'http://rutor.info/torrent/391482',
      downloadUrl: 'http://127.0.0.1:9696/1/download?link=http%3A%2F%2Frutor.info%2Fdownload%2F391482',
      magnetUrl: null, // RuTor often returns null magnetUrl with infoHash
      infoHash: 'e2b0c3f5a891d4e7b2c5a891d4e7b2c5a891d4e7',
    };

    const dummyQuery: TorrentSearchQuery = {
      mediaId: testMedia.id,
      mediaType: 'movie',
      title: 'Интерстеллар',
      year: 2014,
    };

    const parsedCandidate = parseProwlarrJsonItem(rutorProwlarrItem, dummyQuery);
    assert(
      Boolean(parsedCandidate && parsedCandidate.infoHash === 'e2b0c3f5a891d4e7b2c5a891d4e7b2c5a891d4e7'),
      '5. [BUG 2 FIX] Parser correctly extracted infoHash from RuTor Prowlarr item'
    );
    assert(
      Boolean(parsedCandidate?.magnetUri && parsedCandidate.magnetUri.startsWith('magnet:?xt=urn:btih:e2b0c3f5a891d4e7b2c5a891d4e7b2c5a891d4e7')),
      '6. [BUG 2 FIX] Parser synthesized canonical magnetUri from candidate infoHash'
    );

    // Test creating Watch Together room with candidate that has HTTP downloadUrl & infoHash
    let watchTogetherCreated = false;
    let watchTogetherRoomCode = '';
    try {
      const room = await watchPartyService.createRoom(testUser.id, {
        title: 'Интерстеллар — Смотреть вместе',
        privacy: 'PUBLIC',
        mediaId: testMedia.id,
        sourceType: 'TORRENT',
        sourceConfig: {
          type: 'TORRENT',
          magnetUri: parsedCandidate?.magnetUri,
          infoHash: parsedCandidate?.infoHash,
          downloadUrl: parsedCandidate?.downloadUrl,
          title: parsedCandidate?.name,
        },
      });
      if (room && room.code && room.sourceType === 'TORRENT') {
        watchTogetherCreated = true;
        watchTogetherRoomCode = room.code;
      }
    } catch (err: any) {
      console.error('Watch Together room creation error:', err.message);
    }
    assert(
      watchTogetherCreated,
      '7. [BUG 2 FIX] "Смотреть вместе" creates room cleanly with RuTor source (no "не является magnet" error)'
    );

    // Test source resolution when sourceConfig has HTTP url but valid infoHash
    let httpWithHashCreated = false;
    try {
      const room = await watchPartyService.createRoom(testUser.id, {
        title: 'Тест HTTP Url + InfoHash',
        privacy: 'PUBLIC',
        mediaId: testMedia.id,
        sourceType: 'TORRENT',
        sourceConfig: {
          type: 'TORRENT',
          url: 'http://127.0.0.1:9696/1/download?link=rutor',
          infoHash: 'e2b0c3f5a891d4e7b2c5a891d4e7b2c5a891d4e7',
          title: 'Интерстеллар',
        },
      });
      if (room && room.sourceConfig?.magnetUri?.startsWith('magnet:?xt=urn:btih:e2b0c3f5a891d4e7b2c5a891d4e7b2c5a891d4e7')) {
        httpWithHashCreated = true;
        await watchPartyService.closeRoom(room.code, testUser.id);
      }
    } catch (err: any) {
      console.error('HTTP with hash error:', err.message);
    }
    assert(
      httpWithHashCreated,
      '8. [BUG 2 FIX] sanitizeSourceConfig converts HTTP download link + infoHash into canonical magnetUri'
    );

    // -------------------------------------------------------------------------
    // TEST E (SECURITY RULE): Invalid non-torrent URL is strictly rejected
    // -------------------------------------------------------------------------
    let invalidTorrentRejected = false;
    try {
      await watchPartyService.createRoom(testUser.id, {
        title: 'Невалидный торрент источник',
        privacy: 'PUBLIC',
        mediaId: testMedia.id,
        sourceType: 'TORRENT',
        sourceConfig: {
          type: 'TORRENT',
          url: 'https://example.com/not_a_torrent_video.mp4',
          // Missing infoHash
        },
      });
    } catch (err: any) {
      if (err.message.includes('Обычный HTTP/HTTPS URL не является magnet-ссылкой')) {
        invalidTorrentRejected = true;
      }
    }
    assert(
      invalidTorrentRejected,
      '9. [SECURITY RULE] Non-torrent HTTP URL without infoHash is strictly rejected (SSRF protection)'
    );

    // -------------------------------------------------------------------------
    // Clean up test data
    // -------------------------------------------------------------------------
    if (soloRoomCode) await watchPartyService.closeRoom(soloRoomCode, testUser.id);
    if (privateRoomCode) await watchPartyService.closeRoom(privateRoomCode, testUser.id);
    if (watchTogetherRoomCode) await watchPartyService.closeRoom(watchTogetherRoomCode, testUser.id);

    await db.delete(watchPartyMembers).where(eq(watchPartyMembers.userId, testUser.id));
    await db.delete(watchPartyRooms).where(eq(watchPartyRooms.hostUserId, testUser.id));
    await db.delete(media).where(eq(media.id, testMedia.id));
    await db.delete(users).where(eq(users.id, testUser.id));

    console.log('\n--- WATCH PARTY SOURCE CONTRACT & PRIVACY TEST SUMMARY ---');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err: any) {
    console.error('Unhandled error in test runner:', err);
    process.exit(1);
  }
}

runWatchPartySourceContractAndPrivacyTests();
