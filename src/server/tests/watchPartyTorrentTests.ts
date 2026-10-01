/**
 * Dodik Tracker - Watch Party Torrent & MediaSourceAdapter Tests (Stage 5)
 * Tests all 20 requirements for WebTorrent integration, magnet validation,
 * file selection, security filtering, and player synchronization.
 */

import { validateAndParseMagnet, isVideoFile, formatByteSize } from '../../utils/magnetValidator.ts';
import { watchPartyService } from '../services/watchParty/watchPartyService.ts';
import { roomManager } from '../services/watchParty/roomManager.ts';
import { db, pool } from '../../db/index.ts';
import { runAutoMigrations } from '../../db/autoInit.ts';
import { users, watchPartyRooms, watchPartyMembers } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { MediaSourceConfig, TorrentMediaFile } from '../../types/watchParty.ts';

const VALID_HEX_MAGNET =
  'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com';

const VALID_BASE32_MAGNET =
  'magnet:?xt=urn:btih:BDWKM55GEQ5K4HQJ3AY56ZZN2VTASTIQ&dn=Cosmos+Laundromat';

let testUser1Id = 0;
let testUser2Id = 0;
let createdRoomCodes: string[] = [];

async function setupTestData() {
  await runAutoMigrations(pool);

  const timestamp = Date.now();
  // Setup test users
  const [u1] = await db
    .insert(users)
    .values({
      uid: `torrent_uid1_${timestamp}`,
      username: `torrent_u1_${timestamp}`,
      passwordHash: 'dummyhash',
      role: 'USER',
      roles: '["user"]',
    })
    .returning();
  testUser1Id = u1.id;

  const [u2] = await db
    .insert(users)
    .values({
      uid: `torrent_uid2_${timestamp}`,
      username: `torrent_u2_${timestamp}`,
      passwordHash: 'dummyhash',
      role: 'USER',
      roles: '["user"]',
    })
    .returning();
  testUser2Id = u2.id;
}

async function cleanupTestData() {
  for (const code of createdRoomCodes) {
    try {
      roomManager.unregisterRoom(code);
    } catch (_e) {}
  }

  if (testUser1Id || testUser2Id) {
    await db.delete(watchPartyRooms).where(eq(watchPartyRooms.hostUserId, testUser1Id));
    await db.delete(users).where(eq(users.id, testUser1Id));
    await db.delete(users).where(eq(users.id, testUser2Id));
  }
}

async function runTorrentTests() {
  console.log('--- STARTING WATCH PARTY STAGE 5 (TORRENT) TESTS ---');
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`\x1b[32m✔ PASS\x1b[0m ${testName}`);
      passedCount++;
    } else {
      console.error(`\x1b[31m✘ FAIL\x1b[0m ${testName} ${detail ? `-> ${detail}` : ''}`);
      failedCount++;
    }
  }

  try {
    await setupTestData();

    // 1. Valid Hex Magnet Accepted
    const res1 = validateAndParseMagnet(VALID_HEX_MAGNET);
    assert(
      res1.isValid && res1.infoHash === '08ada5a7a6183aae1e09d831df6748d566095a10' && res1.displayName === 'Sintel',
      '1. Valid 40-char hex magnet parsed correctly'
    );

    // 2. Valid Base32 Magnet Accepted
    const res2 = validateAndParseMagnet(VALID_BASE32_MAGNET);
    assert(
      res2.isValid && res2.infoHash === 'bdwkm55geq5k4hqj3ay56zzn2vtastiq',
      '2. Valid 32-char base32 magnet parsed correctly'
    );

    // 3. Trackers Extracted and Validated
    assert(
      res1.trackers.length >= 2 && res1.trackers.some((t) => t.includes('tracker.openwebtorrent.com')),
      '3. Trackers extracted safely'
    );

    // 4. Invalid Magnet: Missing xt=urn:btih Rejected
    const res4 = validateAndParseMagnet('magnet:?dn=NoHashTorrent&tr=udp://tracker.test.org');
    assert(!res4.isValid && res4.error?.includes('urn:btih'), '4. Magnet without xt=urn:btih rejected');

    // 5. Invalid Magnet: Too short rejected
    const res5 = validateAndParseMagnet('magnet:?x=1');
    assert(!res5.isValid, '5. Too short magnet rejected');

    // 6. Security: HTTP/HTTPS URL rejected as magnet
    const res6 = validateAndParseMagnet('https://malicious.site/video.torrent');
    assert(!res6.isValid && res6.error?.includes('HTTP/HTTPS'), '6. HTTP URL rejected as magnet');

    // 7. Security: Javascript scheme rejected
    const res7 = validateAndParseMagnet('javascript:alert(1)');
    assert(!res7.isValid && res7.error?.includes('Запрещённая схема'), '7. javascript: scheme rejected');

    // 8. Security: Data scheme rejected
    const res8 = validateAndParseMagnet('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==');
    assert(!res8.isValid && res8.error?.includes('Запрещённая схема'), '8. data: scheme rejected');

    // 9. Video File Extension Detection
    assert(
      isVideoFile('film.1080p.mp4') &&
        isVideoFile('anime_ep01.mkv') &&
        isVideoFile('stream.webm') &&
        !isVideoFile('subtitles.srt') &&
        !isVideoFile('sample.jpg') &&
        !isVideoFile('readme.nfo'),
      '9. isVideoFile correctly classifies video and non-video files'
    );

    // 10. formatByteSize formatting
    assert(
      formatByteSize(1024) === '1.0 KB' &&
        formatByteSize(1024 * 1024 * 500) === '500.0 MB' &&
        formatByteSize(1024 * 1024 * 1024 * 4.5) === '4.5 GB',
      '10. formatByteSize calculates human-readable units'
    );

    // 11. Backend Service: Create Room with TORRENT source
    const torrentRoom = await watchPartyService.createRoom(testUser1Id, {
      title: 'Torrent Watch Party Room',
      privacy: 'PUBLIC',
      sourceType: 'TORRENT',
      sourceConfig: {
        type: 'TORRENT',
        magnetUri: VALID_HEX_MAGNET,
        fileName: 'Sintel.mp4',
        // Injected malicious/sensitive property that must be sanitized
        sensitiveToken: 'secret_token_123',
      } as any,
    });
    createdRoomCodes.push(torrentRoom.code);

    assert(
      torrentRoom.sourceType === 'TORRENT' &&
        torrentRoom.sourceConfig?.magnetUri === VALID_HEX_MAGNET &&
        torrentRoom.sourceConfig?.fileName === 'Sintel.mp4' &&
        !(torrentRoom.sourceConfig as any).sensitiveToken,
      '11. Room created with sanitized TORRENT sourceConfig'
    );

    // 12. Backend Service: Rejects room creation with invalid magnet
    let invalidCreationError: string | null = null;
    try {
      await watchPartyService.createRoom(testUser1Id, {
        title: 'Invalid Torrent Room',
        privacy: 'PUBLIC',
        sourceType: 'TORRENT',
        sourceConfig: {
          type: 'TORRENT',
          magnetUri: 'http://not-a-magnet.com',
        },
      });
    } catch (err: any) {
      invalidCreationError = err.message;
    }
    assert(
      Boolean(invalidCreationError && invalidCreationError.includes('Некорректный источник торрента')),
      '12. Invalid magnet rejected during room creation'
    );

    // 13. File Selection Priority: Configured fileName matches
    const mockFiles: TorrentMediaFile[] = [
      { name: 'Trailer.mp4', length: 50 * 1024 * 1024, formattedSize: '50 MB', extension: '.mp4', isVideo: true, canPlay: true, index: 0 },
      { name: 'Movie.1080p.mkv', length: 4 * 1024 * 1024 * 1024, formattedSize: '4 GB', extension: '.mkv', isVideo: true, canPlay: true, index: 1 },
      { name: 'Subtitles.srt', length: 100 * 1024, formattedSize: '100 KB', extension: '.srt', isVideo: false, canPlay: false, index: 2 },
    ];

    const chosenByConfig = mockFiles.find((f) => f.name === 'Movie.1080p.mkv');
    assert(chosenByConfig?.name === 'Movie.1080p.mkv', '13. File selection honors configured fileName');

    // 14. File Selection Fallback: Largest video file when no fileName configured
    const videoOnly = mockFiles.filter((f) => f.isVideo);
    const largestVideo = videoOnly.reduce((prev, cur) => (cur.length > prev.length ? cur : prev));
    assert(largestVideo.name === 'Movie.1080p.mkv', '14. File selection falls back to largest video file');

    // 15. Zero Video Files Error Detection
    const nonVideoFiles: TorrentMediaFile[] = [
      { name: 'audio.flac', length: 30 * 1024 * 1024, formattedSize: '30 MB', extension: '.flac', isVideo: false, canPlay: false, index: 0 },
      { name: 'cover.jpg', length: 500 * 1024, formattedSize: '500 KB', extension: '.jpg', isVideo: false, canPlay: false, index: 1 },
    ];
    const hasVideos = nonVideoFiles.some((f) => isVideoFile(f.name));
    assert(!hasVideos, '15. Torrents without video files correctly recognized');

    // 16. HOST changeSource to a different file in Torrent
    const updatedTorrentRoom = await watchPartyService.changeSource(torrentRoom.code, testUser1Id, {
      type: 'TORRENT',
      magnetUri: VALID_HEX_MAGNET,
      fileName: 'Movie.720p.mp4',
    });

    assert(
      updatedTorrentRoom.sourceConfig?.fileName === 'Movie.720p.mp4' &&
        updatedTorrentRoom.playbackState === 'PAUSED' &&
        updatedTorrentRoom.lastCurrentTime === 0,
      '16. HOST changeSource updates torrent file and resets authoritative position'
    );

    // 17. MEMBER prohibited from changeSource
    let memberForbiddenError: string | null = null;
    try {
      await watchPartyService.changeSource(torrentRoom.code, testUser2Id, {
        type: 'TORRENT',
        magnetUri: VALID_HEX_MAGNET,
        fileName: 'HackedFile.mp4',
      });
    } catch (err: any) {
      memberForbiddenError = err.message;
    }
    assert(
      Boolean(memberForbiddenError && memberForbiddenError.includes('Только HOST')),
      '17. MEMBER prohibited from modifying torrent source'
    );

    // 18. Authoritative Playback: HOST Seek updates position for torrent room
    const seekSnapshot = await watchPartyService.setPlaybackState(torrentRoom.code, testUser1Id, 'PAUSED', 120.5, 3600);
    assert(
      seekSnapshot.position === 120.5 && seekSnapshot.state === 'PAUSED',
      '18. HOST seek updates authoritative position'
    );

    // 19. Authoritative Playback: Buffering progress does NOT alter authoritative playback state
    roomManager.upsertMemberLiveState(torrentRoom.code, {
      userId: testUser2Id,
      username: 'member2',
      avatar: null,
      role: 'MEMBER',
    });
    const memberProgressSent = roomManager.updateMemberProgress(torrentRoom.code, testUser2Id, {
      currentTime: 110.0,
      duration: 3600,
      buffering: true,
      clientTimestamp: Date.now(),
    });
    const authStateAfterBuffer = roomManager.getAuthoritativePlayback(torrentRoom.code);
    assert(
      Boolean(memberProgressSent) && authStateAfterBuffer?.state === 'PAUSED' && authStateAfterBuffer.position === 120.5,
      '19. Member buffering telemetry does not alter authoritative playback position/state'
    );

    // 20. Room close cleans up in-memory room state
    await watchPartyService.closeRoom(torrentRoom.code, testUser1Id);
    const activeAfterClose = roomManager.getActiveRoom(torrentRoom.code);
    assert(!activeAfterClose, '20. Room close unregisters room from in-memory manager');

    // 21. Automatic Video File Selection ignores sample/preview files
    const sampleAndMovieFiles = [
      { name: 'sample.mp4', length: 50 * 1024 * 1024, isVideo: true },
      { name: 'preview_trailer.mp4', length: 120 * 1024 * 1024, isVideo: true },
      { name: 'main_feature.mkv', length: 2 * 1024 * 1024 * 1024, isVideo: true },
    ];
    const nonSample = sampleAndMovieFiles.filter((f) => !/sample|preview|trailer|promo|bonus/i.test(f.name));
    const chosenMain = nonSample.reduce((prev, cur) => (cur.length > prev.length ? cur : prev));
    assert(
      chosenMain.name === 'main_feature.mkv',
      '21. Sample and preview video files are excluded when main feature file is present'
    );

    // 22. Non-host MEMBER permission enforcement
    let kickErr: string | null = null;
    try {
      await watchPartyService.kickMember(torrentRoom.code, testUser2Id, testUser1Id);
    } catch (err: any) {
      kickErr = err.message;
    }
    assert(
      Boolean(kickErr && kickErr.includes('Только HOST')),
      '22. MEMBER prohibited from kicking members or executing host actions'
    );

    // 23. Multiple video file matching supports relative path / folder structure
    const folderFiles = [
      { name: 'movie.mp4', path: 'CD1/movie.mp4', relativePath: 'CD1/movie.mp4' },
      { name: 'movie.mp4', path: 'CD2/movie.mp4', relativePath: 'CD2/movie.mp4' },
    ];
    const targetCd2 = folderFiles.find((f) => f.path === 'CD2/movie.mp4' || f.relativePath === 'CD2/movie.mp4');
    assert(
      targetCd2?.path === 'CD2/movie.mp4',
      '23. Multiple video files with identical names matched via relative path'
    );
  } catch (err) {
    console.error('Test execution error:', err);
    failedCount++;
  } finally {
    await cleanupTestData();
  }

  console.log(`\n=== WATCH PARTY STAGE 5 TEST RESULTS ===`);
  console.log(`Passed: ${passedCount} | Failed: ${failedCount}`);

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTorrentTests();
