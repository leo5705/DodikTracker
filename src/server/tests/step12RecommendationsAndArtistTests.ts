import { parseTrackArtists } from '../services/youtubeMusicService.ts';
import { musicRecommendationService } from '../services/musicRecommendationService.ts';
import { youtubeMusicProvider } from '../services/externalMusic/youtubeMusicProvider.ts';
import { rankingService } from '../services/musicRecommendation/rankingService.ts';
import { transitionService } from '../services/musicRecommendation/transitionService.ts';
import { CandidateTrack, TasteProfile } from '../services/musicRecommendation/types.ts';

export async function runStep12UnitTests(): Promise<{ passed: boolean; logs: string[] }> {
  const logs: string[] = [];
  let passed = true;

  const log = (msg: string) => {
    logs.push(msg);
  };

  try {
    log('=== STEP 12 UNIT TESTS: Behavioral Recommendations Engine ===');

    // Test 1: Featured Artist Parsing
    log('Test 1: parseTrackArtists primary/featured role normalization...');
    const parsed1 = parseTrackArtists('Eminem feat. Rihanna', ['Eminem', 'Rihanna'], 'Love The Way You Lie', 'artist_123');
    if (parsed1.length === 2 && parsed1[0].role === 'PRIMARY' && parsed1[1].role === 'FEATURED' && parsed1[1].name === 'Rihanna') {
      log('✓ Test 1 Passed: Primary and Featured roles correctly parsed.');
    } else {
      passed = false;
      log(`✗ Test 1 Failed: Got ${JSON.stringify(parsed1)}`);
    }

    // Test 2: Cold Start Recommendations
    log('Test 2: musicRecommendationService cold start...');
    const coldRecs = await musicRecommendationService.getColdStartRecommendations();
    if (coldRecs.isColdStart === true && Array.isArray(coldRecs.popularNow) && coldRecs.popularNow.length > 0) {
      log(`✓ Test 2 Passed: Cold start returns popularNow (${coldRecs.popularNow.length} tracks).`);
    } else {
      passed = false;
      log(`✗ Test 2 Failed: Got ${JSON.stringify(coldRecs)}`);
    }

    // Test 3: Multi-Factor Ranking & Negative Signals
    log('Test 3: Ranking Engine handles taste affinity, negative signals, and penalties...');
    const mockTaste: TasteProfile = {
      userId: 999,
      computedAt: Date.now(),
      totalSignals: 25,
      genres: {
        rock: { weight: 0.9, count: 12, name: 'Rock' },
        electronic: { weight: 0.5, count: 5, name: 'Electronic' },
      },
      artists: {
        'linkin park': { weight: 0.95, playCount: 15, likeCount: 3, skipCount: 0 },
        'daft punk': { weight: 0.6, playCount: 6, likeCount: 1, skipCount: 0 },
      },
      negativeArtists: new Set(['bad artist']),
      negativeGenres: new Set(),
      shortTermArtists: ['Linkin Park'],
      shortTermGenres: ['Rock'],
      recentTrackIds: new Set(['rec_heard_yesterday']),
      averageDuration: 210,
      explicitRatio: 0.2,
      favoriteTrackIds: new Set(['fav_track_1']),
      favoriteReleaseIds: new Set(),
      subscribedArtistNames: new Set(['Linkin Park']),
    };

    const mockCandidates: CandidateTrack[] = [
      {
        id: 'fav_track_1',
        provider: 'dodik',
        title: 'Numb',
        artistName: 'Linkin Park',
        genres: ['Rock'],
        source: 'favorite',
      },
      {
        id: 'bad_track_1',
        provider: 'dodik',
        title: 'Annoying Song',
        artistName: 'Bad Artist',
        genres: ['Pop'],
        source: 'genre_match',
      },
      {
        id: 'disc_track_1',
        provider: 'youtube',
        title: 'New Rock Wave',
        artistName: 'New Indie Group',
        genres: ['Rock'],
        source: 'discovery',
      },
      {
        id: 'rec_heard_yesterday',
        provider: 'youtube',
        title: 'In The End',
        artistName: 'Linkin Park',
        genres: ['Rock'],
        source: 'loved_artist',
      },
    ];

    const ranked = rankingService.rankCandidates(mockCandidates, mockTaste);
    const topTrack = ranked[0];
    const badTrack = ranked.find((t) => t.id === 'bad_track_1');

    if (topTrack && topTrack.id === 'fav_track_1' && badTrack && badTrack.score < 20) {
      log(`✓ Test 3 Passed: Favorite track scored highest (${topTrack.score}), negative artist penalized (${badTrack.score}).`);
    } else {
      passed = false;
      log(`✗ Test 3 Failed: Top track ${topTrack?.id} (${topTrack?.score}), bad track score ${badTrack?.score}`);
    }

    // Test 4: Diversity & Anti-Monopoly Filter
    log('Test 4: Diversity filter enforces max tracks per artist...');
    const duplicateCandidates: CandidateTrack[] = [
      { id: '1', provider: 'dodik', title: 'Track 1', artistName: 'Artist A', source: 'loved_artist' },
      { id: '2', provider: 'dodik', title: 'Track 2', artistName: 'Artist A', source: 'loved_artist' },
      { id: '3', provider: 'dodik', title: 'Track 3', artistName: 'Artist A', source: 'loved_artist' },
      { id: '4', provider: 'dodik', title: 'Track 4', artistName: 'Artist A', source: 'loved_artist' },
      { id: '5', provider: 'dodik', title: 'Track 5', artistName: 'Artist B', source: 'loved_artist' },
      { id: '6', provider: 'dodik', title: 'Track 6', artistName: 'Artist C', source: 'loved_artist' },
    ];
    const scoredDups = rankingService.rankCandidates(duplicateCandidates, mockTaste);
    const diversified = rankingService.applyDiversityFilter(scoredDups, { maxPerArtist: 2, limit: 10 });
    const countArtistA = diversified.filter((t) => t.artistName === 'Artist A').length;

    if (countArtistA === 2 && diversified.length >= 4) {
      log(`✓ Test 4 Passed: Artist A capped at ${countArtistA} tracks in diversified shelf.`);
    } else {
      passed = false;
      log(`✗ Test 4 Failed: Artist A count is ${countArtistA}, total: ${diversified.length}`);
    }

    // Test 5: Transition Graph Recording & Lookup
    log('Test 5: Transition graph records sequential transitions...');
    await transitionService.recordTransition('test_track_A', 'test_track_B', 'Artist A', 'Artist B');
    const nextTracks = await transitionService.getNextTracks('test_track_A', 5);
    const foundTransition = nextTracks.find((n) => n.toTrackId === 'test_track_B');

    if (foundTransition && foundTransition.count >= 1) {
      log(`✓ Test 5 Passed: Transition A -> B recorded and retrieved (${foundTransition.count} transitions).`);
    } else {
      passed = false;
      log(`✗ Test 5 Failed: Transition not found in graph.`);
    }

    log('===========================================================');
    return { passed, logs };
  } catch (err: any) {
    logs.push(`Fatal Error during Step 12 unit tests: ${err.message || err}`);
    return { passed: false, logs };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStep12UnitTests()
    .then((res) => {
      console.log(res.logs.join('\n'));
      process.exit(res.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
