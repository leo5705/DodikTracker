import { parseLyrics, findActiveLineIndex } from '../../utils/lyricsParser.ts';
import { musicRecommendationService } from '../services/musicRecommendationService.ts';

async function runStep13Tests() {
  console.log('=== RUNNING STEP 13 PLAYER & TRACK ACTIONS TESTS ===');

  // 1. Test Live Lyrics Parser
  const syncedLyrics = `[00:00.00] Intro\n[00:05.50] First line of song\n[00:12.10] Second line of song\n[00:20.00] Third line of song`;
  const parsed = parseLyrics(syncedLyrics);
  if (parsed.mode !== 'synced' || parsed.lines.length !== 4) {
    throw new Error('Live Lyrics parser failed to parse synced lyrics');
  }
  console.log('✓ Test 1 Passed: Live Lyrics parsing verified');

  // 2. Test active line index binary search
  const idx1 = findActiveLineIndex(parsed.lines, 2);
  const idx2 = findActiveLineIndex(parsed.lines, 8);
  const idx3 = findActiveLineIndex(parsed.lines, 15);
  if (idx1 !== 0 || idx2 !== 1 || idx3 !== 2) {
    throw new Error(`Active line index search failed: got ${idx1}, ${idx2}, ${idx3}`);
  }
  console.log('✓ Test 2 Passed: Active line binary search verified');

  // 3. Test Similar Tracks recommendation endpoint
  const similar = await musicRecommendationService.getSimilarTracksForTrack('yt_test123', 'Nirvana', 'Smells Like Teen Spirit');
  if (!Array.isArray(similar)) {
    throw new Error('getSimilarTracksForTrack did not return an array');
  }
  console.log(`✓ Test 3 Passed: Similar tracks recommendation returned ${similar.length} items`);

  console.log('=== ALL STEP 13 TESTS PASSED SUCCESSFULLY! ===');
}

runStep13Tests().catch((err) => {
  console.error('Step 13 tests failed:', err);
  process.exit(1);
});
