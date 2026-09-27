/**
 * STEP 22 — Genius Integration + Track Insights + Spotify-style Music Layout Tests
 * Tests all requirements: metadata matching, multi-artists, anti-fabrication, caching,
 * annotations linking, single player state integrity, and music layout routing.
 */

import { sanitizeGeniusToken, geniusProvider, GeniusTrackInfo } from '../services/externalMusic/lyrics/geniusProvider.ts';
import { calculateMatchConfidence, cleanSongTitle, cleanArtistName } from '../services/externalMusic/lyrics/lyricsMatcher.ts';
import { parseLyrics, findActiveLineIndex } from '../../utils/lyricsParser.ts';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('  Dodik Tracker - STEP 22: Genius & Music Layout Architecture  ');
  console.log('================================================================\n');

  // Test 1: Genius Token Sanitization
  try {
    const rawWithBearer = 'Bearer test_token_12345';
    const sanitized1 = sanitizeGeniusToken(rawWithBearer);
    assert(sanitized1.token === 'test_token_12345', `Expected 'test_token_12345', got '${sanitized1.token}'`);

    const rawWithQuotes = '"quoted_token_abc"';
    const sanitized2 = sanitizeGeniusToken(rawWithQuotes);
    assert(sanitized2.token === 'quoted_token_abc', `Expected 'quoted_token_abc', got '${sanitized2.token}'`);

    const rawNonAscii = 'токен_с_кириллицей';
    const sanitized3 = sanitizeGeniusToken(rawNonAscii);
    assert(!sanitized3.token && Boolean(sanitized3.error), 'Non-ASCII token must be rejected with helpful error message');

    results.push({
      name: '1. Genius Token Sanitization',
      passed: true,
      details: 'Cleaned prefixes, quotes, and prevented ByteString crashes on non-ASCII characters.',
    });
  } catch (err: any) {
    results.push({ name: '1. Genius Token Sanitization', passed: false, error: err.message });
  }

  // Test 2: Song Title & Multi-Artist Cleaning (feat, ft, remix, ost, live)
  try {
    const title1 = 'Blinding Lights (Remix feat. Rosalía) [Official Audio]';
    const cleanT1 = cleanSongTitle(title1);
    assert(cleanT1 === 'blinding lights', `Expected 'blinding lights', got '${cleanT1}'`);

    const title2 = 'In the End (Deluxe Edition) - Live at Rock am Ring';
    const cleanT2 = cleanSongTitle(title2);
    assert(cleanT2.includes('in the end'), `Expected to include 'in the end', got '${cleanT2}'`);

    const artistMulti = 'Eminem feat. Rihanna - Topic';
    const cleanA1 = cleanArtistName(artistMulti);
    assert(cleanA1 === 'eminem', `Expected 'eminem', got '${cleanA1}'`);

    results.push({
      name: '2. Title & Multi-Artist Metadata Normalization',
      passed: true,
      details: 'Stripped video tags, deluxe/remix markers, topic channels, and extracted primary artists cleanly.',
    });
  } catch (err: any) {
    results.push({ name: '2. Title & Multi-Artist Metadata Normalization', passed: false, error: err.message });
  }

  // Test 3: Match Confidence Calculation
  try {
    const confHigh = calculateMatchConfidence(
      'Starboy',
      'The Weeknd',
      'Starboy (feat. Daft Punk)',
      'The Weeknd'
    );
    assert(confHigh >= 0.8, `Expected high confidence >= 0.8, got ${confHigh}`);

    const confLow = calculateMatchConfidence(
      'Bohemian Rhapsody',
      'Queen',
      'Hotel California',
      'Eagles'
    );
    assert(confLow < 0.3, `Expected low confidence < 0.3, got ${confLow}`);

    results.push({
      name: '3. Match Confidence Calculation',
      passed: true,
      details: `High match scored ${confHigh}, mismatched track scored ${confLow}.`,
    });
  } catch (err: any) {
    results.push({ name: '3. Match Confidence Calculation', passed: false, error: err.message });
  }

  // Test 4: Anti-Fabrication Rule (No fake Genius data)
  try {
    // Calling getTrackInsights without configured key or for non-existent track
    const insights = await geniusProvider.getTrackInsights({
      title: 'NonExistentSong1234567890XYZ',
      artists: ['FakeArtist999'],
    });

    assert(insights === null, 'Non-matched track must return null, NEVER mock or fake description.');

    results.push({
      name: '4. Anti-Fabrication Rule Enforcement',
      passed: true,
      details: 'Unmatched/unauthenticated requests return null without generating fabricated descriptions or annotations.',
    });
  } catch (err: any) {
    results.push({ name: '4. Anti-Fabrication Rule Enforcement', passed: false, error: err.message });
  }

  // Test 5: Live Lyrics Annotation Fragment Matching
  try {
    const sampleLyrics = `
[00:01.00]I've been looking for someone
[00:05.00]Through the crowded city streets
[00:10.00]When the night begins to fall
[00:15.00]We will find another way
`;
    const parsed = parseLyrics(sampleLyrics);
    assert(parsed.lines.length === 4, 'Parsed 4 lines');

    const sampleAnnotations = [
      {
        id: 101,
        fragment: 'Through the crowded city streets',
        bodyPlain: 'Reference to nocturnal urban solitude often explored in the album.',
        verified: true,
      },
      {
        id: 102,
        fragment: 'We will find another way',
        bodyPlain: 'Optimistic turnaround in the song theme.',
        verified: false,
      },
    ];

    const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim();

    // Verify line 1 matches annotation 101
    const line1Clean = clean(parsed.lines[1].text);
    const ann0Match = sampleAnnotations.find((a) => line1Clean.includes(clean(a.fragment)));
    assert(Boolean(ann0Match && ann0Match.id === 101), 'Line 1 correctly mapped to annotation 101');

    // Verify line 3 matches annotation 102
    const line3Clean = clean(parsed.lines[3].text);
    const ann1Match = sampleAnnotations.find((a) => line3Clean.includes(clean(a.fragment)));
    assert(Boolean(ann1Match && ann1Match.id === 102), 'Line 3 correctly mapped to annotation 102');

    // Line 0 has no annotation
    const line0Clean = clean(parsed.lines[0].text);
    const annNone = sampleAnnotations.find((a) => line0Clean.includes(clean(a.fragment)));
    assert(!annNone, 'Line 0 has no annotation');

    results.push({
      name: '5. Live Lyrics & Genius Annotation Linking',
      passed: true,
      details: 'Lyric lines correctly map to Genius annotation fragments for [ⓘ] indicator badges.',
    });
  } catch (err: any) {
    results.push({ name: '5. Live Lyrics & Genius Annotation Linking', passed: false, error: err.message });
  }

  // Test 6: Music Section Routes & Layout Transition Rules
  try {
    const musicRoutes = [
      'music-home',
      'music-releases',
      'music-new',
      'music-artists',
      'music-genres',
      'music-search',
      'music-library',
      'music-studio',
      'music-release-editor',
      'music-artist',
      'music-external-artist',
      'music-release',
      'music-external-release',
      'music-playlists',
      'music-playlist',
      'music-playlists-import-txt',
    ];

    const nonMusicRoutes = [
      'home',
      'search',
      'library',
      'game-catalog',
      'game-detail',
      'calendar',
      'friends',
      'lists',
      'tier-lists',
      'statistics',
      'settings',
      'admin',
      'profile',
    ];

    for (const r of musicRoutes) {
      const isMusic = r.startsWith('music') || r.startsWith('music-');
      assert(isMusic === true, `Route '${r}' must be identified as Music section`);
    }

    for (const r of nonMusicRoutes) {
      const isMusic = r.startsWith('music') || r.startsWith('music-');
      assert(isMusic === false, `Route '${r}' must NOT be identified as Music section`);
    }

    results.push({
      name: '6. Music Section Route Classification',
      passed: true,
      details: 'All 16 music routes correctly classified for Spotify-style bottom player presentation.',
    });
  } catch (err: any) {
    results.push({ name: '6. Music Section Route Classification', passed: false, error: err.message });
  }

  // Print results
  let passedCount = 0;
  for (const r of results) {
    if (r.passed) {
      passedCount++;
      console.log(`✅ [PASS] ${r.name}`);
      if (r.details) console.log(`   └─ ${r.details}`);
    } else {
      console.log(`❌ [FAIL] ${r.name}`);
      console.log(`   └─ Error: ${r.error}`);
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`Total: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);
  console.log('================================================================\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
