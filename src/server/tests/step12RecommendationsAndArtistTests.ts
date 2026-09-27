import { parseTrackArtists } from '../services/youtubeMusicService.ts';
import { musicRecommendationService } from '../services/musicRecommendationService.ts';
import { youtubeMusicProvider } from '../services/externalMusic/youtubeMusicProvider.ts';

export async function runStep12UnitTests(): Promise<{ passed: boolean; logs: string[] }> {
  const logs: string[] = [];
  let passed = true;

  const log = (msg: string) => {
    logs.push(msg);
  };

  try {
    log('=== STEP 12 UNIT TESTS: Artist Profile & Recommendations ===');

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

    // Test 3: Nirvana Discography & Categorization
    log('Test 3: External Artist full discography categorization (Nirvana)...');
    const fullProfile = await youtubeMusicProvider.getArtistFullProfile('UCrPe3hLA51968GwxHSZ1llw');
    if (fullProfile && fullProfile.albums.length > 1) {
      log(`✓ Test 3 Passed: Successfully loaded ${fullProfile.albums.length} studio albums, ${fullProfile.liveReleases.length} live releases, ${fullProfile.compilations.length} compilations for Nirvana.`);
    } else {
      passed = false;
      log(`✗ Test 3 Failed: Artist profile loading failed or returned < 2 albums.`);
    }

    log('===========================================================');
    return { passed, logs };
  } catch (err: any) {
    logs.push(`Fatal Error during Step 12 unit tests: ${err.message || err}`);
    return { passed: false, logs };
  }
}
