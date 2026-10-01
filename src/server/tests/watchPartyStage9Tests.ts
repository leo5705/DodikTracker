/**
 * Watch Party Stage 9 Test Suite:
 * Automatic Torrent Discovery, Torznab Parser/Scorer, Cache & TorrServer Client.
 */

import { db } from '../../db/index.ts';
import { media, users } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { torrentSearchService } from '../services/torrentSearch/torrentSearchService.ts';
import { torznabClient } from '../services/torrentSearch/torznabClient.ts';
import { torrServerClient } from '../services/torrentSearch/torrServerClient.ts';
import { torrentCache } from '../services/torrentSearch/torrentCache.ts';
import {
  parseQualityFromTitle,
  checkMatchedMedia,
  parseProwlarrJsonItem,
} from '../services/torrentSearch/torrentParser.ts';
import { scoreTorrentCandidate, rankTorrentCandidates } from '../services/torrentSearch/torrentScorer.ts';
import { TorrentCandidate, TorrentSearchQuery } from '../services/torrentSearch/torrentSearchTypes.ts';

import { selectBestVideoFile } from '../services/torrentSearch/torrentFileSelector.ts';

async function runStage9Tests() {
  console.log('--- STARTING WATCH PARTY STAGE 9 TESTS ---');
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
    // 1. Torznab Query Formatting
    const movieQ: TorrentSearchQuery = {
      mediaType: 'movie',
      title: 'Inception',
      originalTitle: 'Inception',
      year: 2010,
    };
    const movieQueryStr = torznabClient.buildQueryString(movieQ);
    assert(movieQueryStr === 'Inception 2010', '1. Movie query builds "Title Year" string');

    const seriesQ: TorrentSearchQuery = {
      mediaType: 'series',
      title: 'Breaking Bad',
      originalTitle: 'Breaking Bad',
      seasonNumber: 2,
      episodeNumber: 5,
    };
    const seriesQueryStr = torznabClient.buildQueryString(seriesQ);
    assert(seriesQueryStr === 'Breaking Bad S02E05', '2. Series query builds "Title S02E05" string');

    // 2. Release Title Quality Parsing
    const quality = parseQualityFromTitle('Inception.2010.1080p.WEB-DL.x264.DTS-HD');
    assert(
      quality.resolution === '1080p' &&
        quality.source === 'WEB-DL' &&
        quality.codec === 'x264' &&
        quality.audioCodec === 'DTS',
      '3. Quality parser identifies 1080p WEB-DL x264 DTS'
    );

    // 3. Candidate Scoring & Sample Rejection
    const sampleCand: TorrentCandidate = {
      id: '1',
      name: 'Inception.2010.sample.1080p.mkv',
      seeders: 50,
      leechers: 2,
      quality: { resolution: '1080p' },
      score: 0,
    };
    const sampleScore = scoreTorrentCandidate(sampleCand, movieQ);
    assert(sampleScore === 0 || sampleScore === -1000, '4. Sample release receives negative/zero score penalty');

    const goodCand: TorrentCandidate = {
      id: '2',
      name: 'Inception.2010.1080p.WEB-DL.x264',
      infoHash: '0123456789abcdef0123456789abcdef01234567',
      seeders: 30,
      leechers: 5,
      sizeBytes: 3 * 1024 * 1024 * 1024,
      quality: { resolution: '1080p', source: 'WEB-DL', codec: 'x264' },
      matchedMedia: { title: true, year: true },
      score: 0,
    };
    const goodScore = scoreTorrentCandidate(goodCand, movieQ);
    assert(goodScore > 500, `5. High quality release receives high suitability score (${goodScore})`);

    // 4. Candidate Ranking Order
    const lowSeedCand: TorrentCandidate = {
      id: '3',
      name: 'Inception.2010.720p.HDTV',
      seeders: 0,
      leechers: 0,
      quality: { resolution: '720p' },
      matchedMedia: { title: true, year: true },
      score: 0,
    };
    const ranked = rankTorrentCandidates([lowSeedCand, goodCand, sampleCand], movieQ);
    assert(ranked[0].id === '2', '6. Candidate with active seeders and 1080p ranks first');

    // 5. Torrent Cache Operation
    torrentCache.set(movieQ, {
      status: 'SUCCESS',
      query: movieQ,
      candidates: [goodCand],
      totalFound: 1,
      executionTimeMs: 12,
    });
    const cachedResult = torrentCache.get(movieQ);
    assert(
      cachedResult !== null && cachedResult.candidates[0].id === '2',
      '7. TorrentCache stores and retrieves search results'
    );

    // 6. Database Media Metadata Normalization
    const [createdMedia] = await db
      .insert(media)
      .values({
        type: 'MOVIE',
        title: 'Тестовый Фильм STG9',
        originalTitle: 'Test Movie STG9',
        year: 2024,
      })
      .returning();

    const normalizedQuery = await torrentSearchService.normalizeQueryFromMediaId(createdMedia.id);
    assert(
      normalizedQuery !== null &&
        normalizedQuery.title === 'Тестовый Фильм STG9' &&
        normalizedQuery.year === 2024,
      '8. normalizeQueryFromMediaId builds clean search query from DB media record'
    );

    // 7. TorrServer Stream URL Generator
    const streamUrl = torrServerClient.getStreamUrl('0123456789abcdef0123456789abcdef01234567', 0);
    assert(
      streamUrl.includes('/stream?link=0123456789abcdef0123456789abcdef01234567') &&
        streamUrl.includes('index=0'),
      '9. TorrServerClient generates direct stream URL correctly'
    );

    // 8. Deterministic File Selection (Movie & Series Pack)
    const packFiles = [
      { index: 0, name: 'sample.mkv', sizeBytes: 10 * 1024 * 1024 },
      { index: 1, name: 'Breaking.Bad.S02E01.1080p.mkv', sizeBytes: 1.5 * 1024 * 1024 * 1024 },
      { index: 2, name: 'Breaking.Bad.S02E05.1080p.mkv', sizeBytes: 1.6 * 1024 * 1024 * 1024 },
      { index: 3, name: 'Featurette.mp4', sizeBytes: 50 * 1024 * 1024 },
    ];
    const episodeSelection = selectBestVideoFile(packFiles, { mediaType: 'series', seasonNumber: 2, episodeNumber: 5 });
    assert(
      episodeSelection.selectedIndex === 2 && episodeSelection.selectedFile?.name.includes('S02E05'),
      '10. File selector accurately matches S02E05 in season pack over sample/E01'
    );

    const movieFiles = [
      { index: 0, name: 'Trailer.mp4', sizeBytes: 50 * 1024 * 1024 },
      { index: 1, name: 'Inception.2010.1080p.mkv', sizeBytes: 4 * 1024 * 1024 * 1024 },
    ];
    const movieSelection = selectBestVideoFile(movieFiles, { mediaType: 'movie' });
    assert(
      movieSelection.selectedIndex === 1 && movieSelection.selectedFile?.name.includes('Inception'),
      '11. File selector ignores trailer and picks main movie file'
    );

    // Cleanup
    await db.delete(media).where(eq(media.id, createdMedia.id));

    console.log(`\n=== WATCH PARTY STAGE 9 TEST RESULTS ===`);
    console.log(`Passed: ${passed} | Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err: any) {
    console.error('Stage 9 Test Execution Error:', err);
    process.exit(1);
  }
}

runStage9Tests();
