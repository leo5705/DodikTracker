/**
 * Dodik Tracker - Watch Party Content Integration & Episode Flow Tests (Stage 6)
 * Verifies movie/series/anime room creation, server-authoritative episode switching,
 * non-host permission enforcement, atomic source/episode updates, and reconnect behavior.
 */

import { watchPartyService } from '../services/watchParty/watchPartyService.ts';
import { roomManager } from '../services/watchParty/roomManager.ts';
import { db, pool } from '../../db/index.ts';
import { runAutoMigrations } from '../../db/autoInit.ts';
import { users, watchPartyRooms, watchPartyMembers, media } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';

let hostUserId = 0;
let memberUserId = 0;
let testMovieMediaId = 0;
let testSeriesMediaId = 0;
let testAnimeMediaId = 0;
let createdRoomCodes: string[] = [];

async function setupTestData() {
  await runAutoMigrations(pool);

  const timestamp = Date.now();
  const [u1] = await db
    .insert(users)
    .values({
      uid: `stage6_host_${timestamp}`,
      username: `stage6_host_${timestamp}`,
      passwordHash: 'dummyhash',
      role: 'USER',
      roles: '["user"]',
    })
    .returning();
  hostUserId = u1.id;

  const [u2] = await db
    .insert(users)
    .values({
      uid: `stage6_member_${timestamp}`,
      username: `stage6_member_${timestamp}`,
      passwordHash: 'dummyhash',
      role: 'USER',
      roles: '["user"]',
    })
    .returning();
  memberUserId = u2.id;

  const [m1] = await db
    .insert(media)
    .values({
      title: 'Интерстеллар',
      type: 'MOVIE',
    })
    .returning();
  testMovieMediaId = m1.id;

  const [m2] = await db
    .insert(media)
    .values({
      title: 'Игра престолов',
      type: 'TV',
    })
    .returning();
  testSeriesMediaId = m2.id;

  const [m3] = await db
    .insert(media)
    .values({
      title: 'Атака титанов',
      type: 'ANIME',
    })
    .returning();
  testAnimeMediaId = m3.id;
}

async function cleanupTestData() {
  for (const code of createdRoomCodes) {
    try {
      roomManager.unregisterRoom(code);
    } catch (_e) {}
  }

  if (hostUserId || memberUserId) {
    await db.delete(watchPartyRooms).where(eq(watchPartyRooms.hostUserId, hostUserId));
    await db.delete(users).where(eq(users.id, hostUserId));
    await db.delete(users).where(eq(users.id, memberUserId));
  }

  if (testMovieMediaId) await db.delete(media).where(eq(media.id, testMovieMediaId));
  if (testSeriesMediaId) await db.delete(media).where(eq(media.id, testSeriesMediaId));
  if (testAnimeMediaId) await db.delete(media).where(eq(media.id, testAnimeMediaId));
}

async function runStage6Tests() {
  console.log('--- STARTING WATCH PARTY STAGE 6 (CONTENT & EPISODE FLOW) TESTS ---');
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

    // 1. Movie Room Creation
    const movieRoom = await watchPartyService.createRoom(hostUserId, {
      title: 'Интерстеллар',
      mediaId: testMovieMediaId,
      mediaType: 'MOVIE',
      privacy: 'PUBLIC',
      sourceType: 'DIRECT',
      sourceUrl: 'https://cdn.example.com/interstellar.mp4',
    });
    createdRoomCodes.push(movieRoom.code);

    assert(
      movieRoom.mediaId === testMovieMediaId &&
        movieRoom.mediaType === 'MOVIE' &&
        movieRoom.title === 'Интерстеллар' &&
        movieRoom.sourceType === 'DIRECT',
      '1. Movie room created with mediaId and mediaType'
    );

    // 2. Series & Episode Room Creation
    const seriesRoom = await watchPartyService.createRoom(hostUserId, {
      title: 'Игра престолов — S01 E01',
      mediaId: testSeriesMediaId,
      mediaType: 'TV',
      seasonNumber: 1,
      episodeNumber: 1,
      privacy: 'PUBLIC',
      sourceType: 'DIRECT',
      sourceUrl: 'https://cdn.example.com/got_s01e01.mp4',
    });
    createdRoomCodes.push(seriesRoom.code);

    assert(
      seriesRoom.mediaId === testSeriesMediaId &&
        seriesRoom.mediaType === 'TV' &&
        seriesRoom.seasonNumber === 1 &&
        seriesRoom.episodeNumber === 1,
      '2. Series room created with season and episode numbers'
    );

    // 3. Anime Room Creation
    const animeRoom = await watchPartyService.createRoom(hostUserId, {
      title: 'Атака титанов — S02 E03',
      mediaId: testAnimeMediaId,
      mediaType: 'ANIME',
      seasonNumber: 2,
      episodeNumber: 3,
      privacy: 'PUBLIC',
      sourceType: 'DIRECT',
      sourceUrl: 'https://cdn.example.com/aot_s02e03.mp4',
    });
    createdRoomCodes.push(animeRoom.code);

    assert(
      animeRoom.mediaId === testAnimeMediaId &&
        animeRoom.mediaType === 'ANIME' &&
        animeRoom.seasonNumber === 2 &&
        animeRoom.episodeNumber === 3,
      '3. Anime room created with season and episode numbers'
    );

    // 4. HOST Episode Change (Server-Authoritative)
    const updatedSeriesRoom = await watchPartyService.changeSource(
      seriesRoom.code,
      hostUserId,
      {
        type: 'DIRECT',
        url: 'https://cdn.example.com/got_s01e02.mp4',
        title: 'Игра престолов — S01 E02',
      },
      testSeriesMediaId,
      1,
      2
    );

    assert(
      updatedSeriesRoom.seasonNumber === 1 &&
        updatedSeriesRoom.episodeNumber === 2 &&
        updatedSeriesRoom.sourceUrl === 'https://cdn.example.com/got_s01e02.mp4' &&
        updatedSeriesRoom.playbackState === 'PAUSED' &&
        updatedSeriesRoom.lastCurrentTime === 0,
      '4. HOST changes episode atomically: season, episode, source, and resets position to 0 PAUSED'
    );

    // 5. MEMBER Attempt to Change Episode / Source Rejection
    let memberForbiddenErr: string | null = null;
    try {
      await watchPartyService.changeSource(
        seriesRoom.code,
        memberUserId,
        {
          type: 'DIRECT',
          url: 'https://cdn.example.com/got_hacked.mp4',
        },
        testSeriesMediaId,
        1,
        5
      );
    } catch (err: any) {
      memberForbiddenErr = err.message;
    }

    assert(
      Boolean(memberForbiddenErr && memberForbiddenErr.includes('Только HOST')),
      '5. MEMBER prohibited from modifying episode or media source'
    );

    // 6. Closed Room cannot change source
    await watchPartyService.closeRoom(animeRoom.code, hostUserId);
    let closedRoomErr: string | null = null;
    try {
      await watchPartyService.changeSource(
        animeRoom.code,
        hostUserId,
        { type: 'DIRECT', url: 'https://cdn.example.com/aot_s02e04.mp4' },
        testAnimeMediaId,
        2,
        4
      );
    } catch (err: any) {
      closedRoomErr = err.message;
    }

    assert(
      Boolean(closedRoomErr && closedRoomErr.includes('закрыта')),
      '6. Closed room prohibits source and episode modifications'
    );

    // 7. Private Room DTO does not leak passcodeHash
    const privateRoom = await watchPartyService.createRoom(hostUserId, {
      title: 'Private Movie Session',
      privacy: 'PRIVATE',
      passcode: 'secret123',
      sourceType: 'DIRECT',
      sourceUrl: 'https://cdn.example.com/private_movie.mp4',
    });
    createdRoomCodes.push(privateRoom.code);

    const fetchedPrivateRoom = await watchPartyService.getRoom(privateRoom.code, memberUserId);
    assert(
      !(fetchedPrivateRoom as any).passcodeHash && fetchedPrivateRoom.privacy === 'PRIVATE',
      '7. Private room DTO hides passcodeHash before join'
    );

    // 8. Reconnect preserves content, episode, and in-memory room state
    const activeInMemory = roomManager.getActiveRoom(seriesRoom.code);
    assert(
      activeInMemory?.mediaId === testSeriesMediaId &&
        activeInMemory.seasonNumber === 1 &&
        activeInMemory.episodeNumber === 2,
      '8. Active room state in memory preserves mediaId, seasonNumber, and episodeNumber for client reconnects'
    );

  } catch (err) {
    console.error('Stage 6 Test execution error:', err);
    failedCount++;
  } finally {
    await cleanupTestData();
  }

  console.log(`\n=== WATCH PARTY STAGE 6 TEST RESULTS ===`);
  console.log(`Passed: ${passedCount} | Failed: ${failedCount}`);

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStage6Tests();
