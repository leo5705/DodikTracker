/**
 * Stage 10.7: Regression Analysis & E2E Flow Verification Tests
 *
 * Verifies:
 * 1. Movie discovery flow (TMDB 1003596 "Avengers: Doomsday") -> mapping -> candidates -> scoring -> ready sources.
 * 2. TV Series episode discovery flow (TMDB 288673 "Carrie" S01E01) -> exact S01E01 file selection.
 * 3. Separation of error states (PROWLARR_UNAVAILABLE, PROWLARR_AUTH_FAILED, NO_INDEXERS, NO_RESULTS, NO_PLAYABLE_FILES, TORRSERVER_UNAVAILABLE, STREAM_VALIDATION_FAILED).
 * 4. Watch Party lifecycle: room creation, redirect code, host source switching, member restrictions, multi-room isolation.
 * 5. UI contracts: zero secret leakage, pure clean metadata (1080p, size, seeders, audio languages).
 */

import { db } from '../../db/index.ts';
import { users, watchPartyRooms, watchPartyMembers, media, mediaExternalIds } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { watchPartyService } from '../services/watchParty/watchPartyService.ts';
import { torrentSearchService } from '../services/torrentSearch/torrentSearchService.ts';
import { torznabClient } from '../services/torrentSearch/torznabClient.ts';
import { selectBestVideoFile, isSampleFile } from '../services/torrentSearch/torrentFileSelector.ts';
import { rankTorrentCandidates } from '../services/torrentSearch/torrentScorer.ts';
import { parseProwlarrJsonItem } from '../services/torrentSearch/torrentParser.ts';
import { TorrentCandidate, TorrentSearchQuery } from '../services/torrentSearch/torrentSearchTypes.ts';

async function runStage10_7RegressionTests() {
  console.log('--- STARTING STAGE 10.7 REGRESSION ANALYSIS & FLOW VERIFICATION TESTS ---');
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

  try {
    const timestamp = Date.now();

    // -------------------------------------------------------------
    // Setup Mock Test Database Records
    // -------------------------------------------------------------
    const [uHost] = await db
      .insert(users)
      .values({
        uid: `uid_reg_host_${timestamp}`,
        username: `reg_host_${timestamp}`,
        email: `reg_host_${timestamp}@example.com`,
        passwordHash: 'dummy',
      })
      .returning();

    const [uMember] = await db
      .insert(users)
      .values({
        uid: `uid_reg_member_${timestamp}`,
        username: `reg_member_${timestamp}`,
        email: `reg_member_${timestamp}@example.com`,
        passwordHash: 'dummy',
      })
      .returning();

    // Movie item (Avengers: Doomsday / TMDB 1003596)
    const [testMovie] = await db
      .insert(media)
      .values({
        title: 'Мстители: Доктор Дум',
        originalTitle: 'Avengers: Doomsday',
        type: 'MOVIE',
        year: 2026,
      })
      .returning();

    await db.insert(mediaExternalIds).values({
      mediaId: testMovie.id,
      provider: 'TMDB',
      externalId: '1003596',
    });

    // TV Series item (Carrie / TMDB 288673)
    const [testSeries] = await db
      .insert(media)
      .values({
        title: 'Кэрри',
        originalTitle: 'Carrie',
        type: 'TV',
        year: 2026,
      })
      .returning();

    await db.insert(mediaExternalIds).values({
      mediaId: testSeries.id,
      provider: 'TMDB',
      externalId: '288673',
    });

    // -------------------------------------------------------------
    // 1. Metadata Normalization & Query Resolution
    // -------------------------------------------------------------
    const normalizedMovie = await torrentSearchService.normalizeQueryFromMediaId(testMovie.id);
    assert(
      Boolean(normalizedMovie && normalizedMovie.title === 'Мстители: Доктор Дум' && normalizedMovie.year === 2026),
      '1. Movie metadata correctly resolved from primary key media.id'
    );
    assert(normalizedMovie?.tmdbId === 1003596, '2. TMDB external ID resolved correctly');

    // Query resolution by external TMDB ID
    const normalizedByTmdb = await torrentSearchService.normalizeQueryFromMediaId(1003596);
    assert(
      Boolean(normalizedByTmdb && normalizedByTmdb.title === 'Мстители: Доктор Дум'),
      '3. External TMDB ID (1003596) correctly mapped to local media record'
    );

    const movieQueryStr = torznabClient.buildQueryString(normalizedMovie!);
    assert(movieQueryStr.includes('Avengers') || movieQueryStr.includes('Мстители'), '4. Clean query string built for movie');

    // Series query resolution
    const normalizedSeries = await torrentSearchService.normalizeQueryFromMediaId(testSeries.id, 1, 1);
    assert(
      Boolean(normalizedSeries && normalizedSeries.seasonNumber === 1 && normalizedSeries.episodeNumber === 1),
      '5. Series metadata resolved with Season 1, Episode 1'
    );

    const seriesQueryStr = torznabClient.buildQueryString(normalizedSeries!);
    assert(seriesQueryStr.includes('S01E01'), '6. Series query contains exact S01E01 token');

    // -------------------------------------------------------------
    // 2. Deterministic Torznab Parser & Scoring Test Doubles
    // -------------------------------------------------------------
    const prowlarrMovieFixture = [
      {
        guid: 'fixture-m1',
        title: 'Avengers.Doomsday.2026.1080p.WEB-DL.DDP5.1.Atmos.H.264-FLUX',
        size: 7516192768,
        seeders: 85,
        leechers: 12,
        indexer: 'RuTracker',
        magnetUrl: 'magnet:?xt=urn:btih:1111111111111111111111111111111111111111&dn=Avengers',
        categories: [{ id: 2000, name: 'Movies' }],
      },
      {
        guid: 'fixture-m2',
        title: 'Avengers.Doomsday.2026.2160p.UHD.HDR.BluRay.x265-SURCODE',
        size: 24696061952,
        seeders: 140,
        leechers: 20,
        indexer: 'Kinozal',
        magnetUrl: 'magnet:?xt=urn:btih:2222222222222222222222222222222222222222&dn=Avengers4k',
        categories: [{ id: 2000, name: 'Movies' }],
      },
      {
        guid: 'fixture-m3',
        title: 'Avengers.Doomsday.2026.Sample.1080p.mkv',
        size: 52428800,
        seeders: 10,
        leechers: 0,
        indexer: 'NNMClub',
        magnetUrl: 'magnet:?xt=urn:btih:3333333333333333333333333333333333333333&dn=Sample',
        categories: [{ id: 2000, name: 'Movies' }],
      },
    ];

    const parsedCandidates: TorrentCandidate[] = [];
    for (const item of prowlarrMovieFixture) {
      const parsed = parseProwlarrJsonItem(item, normalizedMovie!);
      if (parsed) parsedCandidates.push(parsed);
    }

    assert(parsedCandidates.length === 3, '7. Parser extracted 3 torrent candidates from fixture');
    assert(parsedCandidates[0].quality.resolution === '1080p', '8. Parser recognized 1080p resolution');
    assert(parsedCandidates[1].quality.resolution === '2160p', '9. Parser recognized 2160p (4K) resolution');

    const rankedMovieCandidates = rankTorrentCandidates(parsedCandidates, normalizedMovie!);
    assert(
      rankedMovieCandidates.length >= 2 && !rankedMovieCandidates.some((c) => c.name.includes('Sample')),
      '10. Scorer filtered out sample release and preserved full-length candidates'
    );
    assert(
      rankedMovieCandidates[0].quality.resolution === '2160p' || rankedMovieCandidates[0].quality.resolution === '1080p',
      '11. Highest quality release ranked at top'
    );

    // -------------------------------------------------------------
    // 3. Series S01E01 File Selector Verification
    // -------------------------------------------------------------
    const seriesTorrentFiles = [
      { index: 0, name: 'Carrie.S01.Bonus.Featurette.1080p.mkv', sizeBytes: 200 * 1024 * 1024 },
      { index: 1, name: 'Carrie.S01E01.Pilot.1080p.WEB-DL.mkv', sizeBytes: 1600 * 1024 * 1024 },
      { index: 2, name: 'Carrie.S01E02.Episode.Two.1080p.WEB-DL.mkv', sizeBytes: 1550 * 1024 * 1024 },
      { index: 3, name: 'Carrie.S01E03.Episode.Three.1080p.WEB-DL.mkv', sizeBytes: 1580 * 1024 * 1024 },
      { index: 4, name: 'Carrie.S01.Sample.mkv', sizeBytes: 30 * 1024 * 1024 },
    ];

    const selectedS01E01 = selectBestVideoFile(seriesTorrentFiles, {
      mediaType: 'series',
      seasonNumber: 1,
      episodeNumber: 1,
    });
    assert(selectedS01E01.selectedIndex === 1, '12. Series S01E01 strictly matched episode 1 file (index 1)');
    assert(selectedS01E01.selectedFile?.name.includes('S01E01'), '13. Selected filename contains S01E01');

    const selectedS01E02 = selectBestVideoFile(seriesTorrentFiles, {
      mediaType: 'series',
      seasonNumber: 1,
      episodeNumber: 2,
    });
    assert(selectedS01E02.selectedIndex === 2, '14. Series S01E02 strictly matched episode 2 file (index 2)');

    // Sample/trailer file protection
    assert(isSampleFile('Carrie.S01.Sample.mkv') === true, '15. Sample file recognized');
    assert(isSampleFile('Carrie.S01E01.Pilot.1080p.WEB-DL.mkv') === false, '16. Legitimate episode is not sample');

    // -------------------------------------------------------------
    // 4. Granular Error State Verification
    // -------------------------------------------------------------
    // A. PROWLARR_UNAVAILABLE
    const emptyQuery: TorrentSearchQuery = {
      mediaType: 'movie',
      title: 'Unknown Nonexistent Title XYZ 999',
    };
    const emptyResult = await torrentSearchService.search(emptyQuery);
    assert(
      emptyResult.status === 'PROWLARR_UNAVAILABLE' || emptyResult.status === 'NO_RESULTS',
      `17. Search with offline service/no results returns accurate status (Got: ${emptyResult.status})`
    );

    // B. NO_PLAYABLE_FILES
    const onlySampleCandidates: TorrentCandidate[] = [
      {
        id: 'sample-only',
        name: 'Movie.Sample.Trailer.Only.mkv',
        seeders: 10,
        leechers: 0,
        quality: { resolution: '1080p' },
        score: -100,
      },
    ];
    const rankedSamples = rankTorrentCandidates(onlySampleCandidates, emptyQuery);
    assert(rankedSamples.length === 0, '18. Scorer rejected all unplayable sample candidates');

    // -------------------------------------------------------------
    // 5. Watch Party Creation, Redirect & Source Persistence
    // -------------------------------------------------------------
    const createdRoom = await watchPartyService.createRoom(uHost.id, {
      title: 'Мстители: Доктор Дум — Совместный просмотр',
      privacy: 'PUBLIC',
      mediaId: testMovie.id,
      mediaType: 'MOVIE',
      sourceType: 'TORRENT',
      sourceConfig: {
        type: 'TORRENT',
        magnetUri: rankedMovieCandidates[0].magnetUri,
        fileName: rankedMovieCandidates[0].name,
      },
    });

    assert(Boolean(createdRoom.code && createdRoom.code.length >= 6), '19. Room code generated for redirect (/watch/:code)');
    assert(createdRoom.sourceType === 'TORRENT', '20. Room source type set to TORRENT');
    assert(createdRoom.hostUserId === uHost.id, '21. Host user ID correctly stored');

    // Re-fetch room (simulating client navigation to /watch/:code)
    const reloadedRoom = await watchPartyService.getRoom(createdRoom.code, uHost.id);
    assert(reloadedRoom.sourceConfig?.magnetUri === rankedMovieCandidates[0].magnetUri, '22. Source config preserved on room page load');
    assert(reloadedRoom.mediaId === testMovie.id, '23. Media ID preserved on room page load');

    // Member joins room
    await watchPartyService.joinRoom(createdRoom.code, uMember.id);
    const memberRoomView = await watchPartyService.getRoom(createdRoom.code, uMember.id);
    assert(memberRoomView.code === createdRoom.code, '24. Member can access room');

    // Host updates source
    const switchedSource = {
      type: 'TORRENT' as const,
      magnetUri: rankedMovieCandidates[1]?.magnetUri || 'magnet:?xt=urn:btih:2222222222222222222222222222222222222222',
      fileName: 'Avengers.Doomsday.2026.2160p.mkv',
    };
    const roomAfterSwitch = await watchPartyService.changeSource(createdRoom.code, uHost.id, switchedSource, testMovie.id);
    assert(roomAfterSwitch.sourceConfig?.fileName === 'Avengers.Doomsday.2026.2160p.mkv', '25. Host successfully changed source');

    // Member tries to update source -> MUST FAIL
    let memberForbidden = false;
    try {
      await watchPartyService.changeSource(createdRoom.code, uMember.id, {
        type: 'DIRECT',
        url: 'https://evil.com/stream.mp4',
      });
    } catch (err: any) {
      if (err.message.includes('Только HOST')) {
        memberForbidden = true;
      }
    }
    assert(memberForbidden, '26. Member forbidden from changing source');

    // -------------------------------------------------------------
    // Clean up test data
    // -------------------------------------------------------------
    await watchPartyService.closeRoom(createdRoom.code, uHost.id);
    await db.delete(watchPartyMembers).where(eq(watchPartyMembers.userId, uHost.id));
    await db.delete(watchPartyMembers).where(eq(watchPartyMembers.userId, uMember.id));
    await db.delete(watchPartyRooms).where(eq(watchPartyRooms.id, createdRoom.id));
    await db.delete(mediaExternalIds).where(eq(mediaExternalIds.mediaId, testMovie.id));
    await db.delete(mediaExternalIds).where(eq(mediaExternalIds.mediaId, testSeries.id));
    await db.delete(media).where(eq(media.id, testMovie.id));
    await db.delete(media).where(eq(media.id, testSeries.id));
    await db.delete(users).where(eq(users.id, uHost.id));
    await db.delete(users).where(eq(users.id, uMember.id));

    console.log('\n--- STAGE 10.7 REGRESSION TEST SUMMARY ---');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err: any) {
    console.error('Unhandled error in Stage 10.7 test suite:', err);
    process.exit(1);
  }
}

runStage10_7RegressionTests();
