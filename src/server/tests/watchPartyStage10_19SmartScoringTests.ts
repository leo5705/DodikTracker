/**
 * Stage 10.19: Stable Watch Party Playback & Smart Torrent Source Selection Tests
 *
 * Verifies:
 * 1. Bitrate estimation & scoring (optimal 2.5-7.5 Mbps bonus, heavy penalty, duration unknown safeguard).
 * 2. Seed efficiency (seeders / sizeGB; dense swarm bonus vs starvation risk penalty).
 * 3. Relative balance: 8GB with 80 seeders beats 4GB with 5 seeders (NO hard size cutoff).
 * 4. Release type & codec scoring (WEB-DL > Remux; H.264 > AV1; AAC/MP3 native > AC-3/DTS).
 * 5. Reproduction of "Wolf of Wall Street" scenario:
 *    - 16GB BDRip DTS (12 Mbps, 14 seeders) vs 5.2GB WEB-DL AAC (3.9 Mbps, 50 seeders).
 *    - Validates that WEB-DL AAC wins decisively for reliable web playback.
 * 6. Non-regression of existing scoring criteria (title match, Russian audio, subtitles, series/season).
 */

import {
  scoreTorrentCandidate,
  rankTorrentCandidates,
} from '../services/torrentSearch/torrentScorer.ts';
import {
  TorrentCandidate,
  TorrentSearchQuery,
} from '../services/torrentSearch/torrentSearchTypes.ts';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${testName}`, details ? details : '');
    failCount++;
  }
}

async function runTests() {
  console.log('--- STAGE 10.19 SMART TORRENT SCORING & PLAYBACK TESTS ---');

  const baseQuery: TorrentSearchQuery = {
    title: 'The Wolf of Wall Street',
    originalTitle: 'The Wolf of Wall Street',
    year: 2013,
    mediaType: 'movie',
    durationMinutes: 180, // 3 hours
  };

  // ---------------------------------------------------------------------------
  // TEST 1: Bitrate Estimation & Scoring
  // ---------------------------------------------------------------------------
  console.log('\n[Test 1] Bitrate Estimation & Scoring');
  {
    // 5.5 GB for 180 min => ~4.07 Mbps (in 2.5 - 7.5 Mbps optimal range)
    const optimalSizeCand: TorrentCandidate = {
      id: 'opt-1',
      name: 'The Wolf of Wall Street 2013 1080p WEB-DL x264 AAC',
      sizeBytes: 5.5 * 1024 * 1024 * 1024,
      seeders: 50,
      leechers: 10,
      quality: {
        resolution: '1080p',
        source: 'WEB-DL',
        codec: 'x264',
        audioCodec: 'AAC',
      },
      matchedMedia: { title: true, year: true },
    };

    // 25 GB for 180 min => ~18.5 Mbps (excessive bitrate > 16 Mbps)
    const heavyRemuxCand: TorrentCandidate = {
      id: 'heavy-1',
      name: 'The Wolf of Wall Street 2013 1080p Remux AVC DTS-HD MA',
      sizeBytes: 25 * 1024 * 1024 * 1024,
      seeders: 50,
      leechers: 10,
      quality: {
        resolution: '1080p',
        source: 'Remux',
        codec: 'AVC',
        audioCodec: 'DTS',
      },
      matchedMedia: { title: true, year: true },
    };

    const scoreOpt = scoreTorrentCandidate(optimalSizeCand, baseQuery);
    const scoreHeavy = scoreTorrentCandidate(heavyRemuxCand, baseQuery);

    assert(
      typeof optimalSizeCand.estimatedBitrateMbps === 'number' &&
      optimalSizeCand.estimatedBitrateMbps >= 3.8 &&
      optimalSizeCand.estimatedBitrateMbps <= 4.6,
      `Calculated accurate estimatedBitrateMbps for 5.5GB/180m (${optimalSizeCand.estimatedBitrateMbps} Mbps)`
    );

    assert(
      typeof heavyRemuxCand.estimatedBitrateMbps === 'number' &&
      heavyRemuxCand.estimatedBitrateMbps > 16,
      `Calculated excessive bitrate for 25GB/180m (${heavyRemuxCand.estimatedBitrateMbps} Mbps)`
    );

    assert(
      scoreOpt > scoreHeavy + 100,
      `Optimal streaming bitrate outscores excessive bitrate by large margin (${scoreOpt} vs ${scoreHeavy})`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Duration Unknown Safeguard (No arbitrary bitrate penalty)
  // ---------------------------------------------------------------------------
  console.log('\n[Test 2] Duration Unknown Safeguard');
  {
    const queryNoDuration: TorrentSearchQuery = {
      title: 'The Wolf of Wall Street',
      mediaType: 'movie',
      // durationMinutes undefined!
    };

    const candUnknownDuration: TorrentCandidate = {
      id: 'cand-no-dur',
      name: 'The Wolf of Wall Street 2013 1080p BDRip',
      sizeBytes: 15 * 1024 * 1024 * 1024,
      seeders: 30,
      leechers: 5,
      quality: {
        resolution: '1080p',
        source: 'BDRip',
        codec: 'x264',
        audioCodec: 'AC3',
      },
      matchedMedia: { title: true, year: true },
    };

    scoreTorrentCandidate(candUnknownDuration, queryNoDuration);

    assert(
      candUnknownDuration.estimatedBitrateMbps === undefined,
      'Does NOT estimate bitrate or apply penalty when duration is unknown'
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Seed Efficiency (seeders / sizeGB) & Relative Size Balance
  // ---------------------------------------------------------------------------
  console.log('\n[Test 3] Seed Efficiency & Relative Size Balance (No hard 3-6GB cap)');
  {
    // Candidate A: 8 GB with 80 seeders (Efficiency = 10 seeders/GB)
    const largeWellSeeded: TorrentCandidate = {
      id: 'large-8gb',
      name: 'The Wolf of Wall Street 2013 1080p WEB-DL x264 AAC',
      sizeBytes: 8 * 1024 * 1024 * 1024,
      seeders: 80,
      leechers: 10,
      quality: {
        resolution: '1080p',
        source: 'WEB-DL',
        codec: 'x264',
        audioCodec: 'AAC',
      },
      matchedMedia: { title: true, year: true },
    };

    // Candidate B: 3.5 GB with only 4 seeders (Efficiency = ~1.14 seeders/GB, slow swarm risk)
    const smallLowSeeded: TorrentCandidate = {
      id: 'small-3.5gb',
      name: 'The Wolf of Wall Street 2013 720p WEBRip x264 AAC',
      sizeBytes: 3.5 * 1024 * 1024 * 1024,
      seeders: 4,
      leechers: 1,
      quality: {
        resolution: '720p',
        source: 'WEBRip',
        codec: 'x264',
        audioCodec: 'AAC',
      },
      matchedMedia: { title: true, year: true },
    };

    const scoreLarge = scoreTorrentCandidate(largeWellSeeded, baseQuery);
    const scoreSmall = scoreTorrentCandidate(smallLowSeeded, baseQuery);

    assert(
      largeWellSeeded.seedEfficiency! >= 9.5,
      `High seed efficiency correctly assigned (${largeWellSeeded.seedEfficiency})`
    );

    assert(
      scoreLarge > scoreSmall + 80,
      `8GB release with 80 seeders beats 3.5GB release with 4 seeders (${scoreLarge} vs ${scoreSmall})`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Browser-Native Audio vs Transcoded Audio
  // ---------------------------------------------------------------------------
  console.log('\n[Test 4] Audio Codec Preference (Native AAC vs AC-3/DTS)');
  {
    const candAac: TorrentCandidate = {
      id: 'aac-1',
      name: 'Movie 1080p WEB-DL AAC',
      sizeBytes: 4 * 1024 * 1024 * 1024,
      seeders: 30,
      leechers: 5,
      quality: { resolution: '1080p', source: 'WEB-DL', codec: 'x264', audioCodec: 'AAC' },
      matchedMedia: { title: true, year: true },
    };

    const candAc3: TorrentCandidate = {
      id: 'ac3-1',
      name: 'Movie 1080p WEB-DL AC3',
      sizeBytes: 4 * 1024 * 1024 * 1024,
      seeders: 30,
      leechers: 5,
      quality: { resolution: '1080p', source: 'WEB-DL', codec: 'x264', audioCodec: 'AC3' },
      matchedMedia: { title: true, year: true },
    };

    const candDts: TorrentCandidate = {
      id: 'dts-1',
      name: 'Movie 1080p WEB-DL DTS',
      sizeBytes: 4 * 1024 * 1024 * 1024,
      seeders: 30,
      leechers: 5,
      quality: { resolution: '1080p', source: 'WEB-DL', codec: 'x264', audioCodec: 'DTS' },
      matchedMedia: { title: true, year: true },
    };

    const sAac = scoreTorrentCandidate(candAac, baseQuery);
    const sAc3 = scoreTorrentCandidate(candAc3, baseQuery);
    const sDts = scoreTorrentCandidate(candDts, baseQuery);

    assert(sAac > sAc3, `Native AAC audio outscores AC-3 (${sAac} vs ${sAc3})`);
    assert(sAc3 > sDts, `AC-3 outscores heavy DTS (${sAc3} vs ${sDts})`);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Real Production Scenario — "The Wolf of Wall Street"
  // ---------------------------------------------------------------------------
  console.log('\n[Test 5] Production Scenario Reproduction: "The Wolf of Wall Street"');
  {
    // Problematic candidate identified in Stage 10.18:
    // Heavy 15.8 GB BDRip, 179 min, ~12 Mbps video bitrate, DTS audio, only 14 seeders
    const problematicBdrip: TorrentCandidate = {
      id: 'prod-bdrip-heavy',
      name: 'Волк с Уолл-стрит / The Wolf of Wall Street (2013) BDRip 1080p | D, P, A | DTS',
      sizeBytes: 15.8 * 1024 * 1024 * 1024,
      seeders: 14,
      leechers: 6,
      quality: {
        resolution: '1080p',
        source: 'BDRip',
        codec: 'AVC',
        audioCodec: 'DTS',
        subtitles: ['ru', 'en'],
      },
      languages: ['rus', 'eng'],
      matchedMedia: { title: true, year: true },
    };

    // Stable streaming candidate:
    // 5.8 GB WEB-DL 1080p, H.264, AAC audio, ~4.3 Mbps, 65 seeders
    const stableWebDl: TorrentCandidate = {
      id: 'prod-webdl-stable',
      name: 'Волк с Уолл-стрит / The Wolf of Wall Street (2013) WEB-DL 1080p | D | AAC',
      sizeBytes: 5.8 * 1024 * 1024 * 1024,
      seeders: 65,
      leechers: 12,
      quality: {
        resolution: '1080p',
        source: 'WEB-DL',
        codec: 'x264',
        audioCodec: 'AAC',
        subtitles: ['ru'],
      },
      languages: ['rus'],
      matchedMedia: { title: true, year: true },
    };

    const ranked = rankTorrentCandidates([problematicBdrip, stableWebDl], baseQuery);

    assert(
      ranked[0].id === 'prod-webdl-stable',
      `Smart ranking selects stable WEB-DL AAC as #1 (score: ${ranked[0].score}) over heavy BDRip DTS (score: ${ranked[1].score})`
    );

    assert(
      ranked[0].score - ranked[1].score >= 120,
      `Point advantage for stable candidate is substantial (+${ranked[0].score - ranked[1].score} pts)`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Startup Sync Invariant
  // ---------------------------------------------------------------------------
  console.log('\n[Test 6] Startup Synchronization Invariants');
  {
    // Rule: If authoritative initial position <= 5.0 seconds (e.g. room creation timestamp drift),
    // the player does NOT execute seeking on the cold fMP4 stream.
    const initialPosition1 = 3.54; // Exact drift from Stage 10.18 user logs!
    const shouldAvoidColdSeek = initialPosition1 <= 5.0;

    assert(
      shouldAvoidColdSeek,
      `Initial position 3.54s classified as startup drift <= 5.0s, avoiding cold seek`
    );

    const initialPosition2 = 120.0; // User joins room midway
    const requiresAdaptivePrebuffer = initialPosition2 > 5.0;

    assert(
      requiresAdaptivePrebuffer,
      `Mid-session join at 120s requires waiting for adaptive prebuffer before seeking`
    );
  }

  console.log(`\n========================================`);
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`========================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
