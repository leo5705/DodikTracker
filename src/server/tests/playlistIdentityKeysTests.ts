/**
 * Unit & Integration verification for Playlist Stable Key and Deduplication Architecture
 */
import {
  getStablePlaylistBaseKey,
  getStablePlaylistKey,
  getStablePlaylistTrackKey,
  getStableTrackBaseKey,
  getStableTrackKey,
  dedupePlaylists,
  dedupeTracks,
} from '../../utils/musicIdentity.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('🧪 Starting Playlist Keys & Identity verification tests...\n');

// 1. Test getStablePlaylistBaseKey
console.log('--- 1. Testing getStablePlaylistBaseKey ---');
const pl1 = { id: 42, title: 'Rock Classics', userId: 7 };
const pl2 = { id: '42', title: 'Rock Classics', userId: 7 };
const pl3 = { id: null, title: 'My Mix', userId: 7 };
const pl4 = { id: 0, title: 'Zero Id', userId: 2 };

assert(getStablePlaylistBaseKey(pl1) === 'dodik-pl-42', 'pl1 id 42 gives dodik-pl-42');
assert(getStablePlaylistBaseKey(pl2) === 'dodik-pl-42', 'pl2 string "42" gives dodik-pl-42');
assert(getStablePlaylistBaseKey(pl3) === 'meta-pl-7-my mix', 'pl3 without id gives meta-pl-7-my mix');
assert(getStablePlaylistBaseKey(null) === 'playlist-fallback', 'null playlist gives fallback');

// 2. Test getStablePlaylistKey with index
console.log('\n--- 2. Testing getStablePlaylistKey ---');
assert(getStablePlaylistKey(pl1) === 'dodik-pl-42', 'getStablePlaylistKey without index');
assert(getStablePlaylistKey(pl1, 3) === 'dodik-pl-42-3', 'getStablePlaylistKey with index 3');

// 3. Test getStablePlaylistTrackKey with junctionId and duplicate tracks
console.log('\n--- 3. Testing getStablePlaylistTrackKey ---');
// Scenario: Same track added twice to the playlist at different positions
const trackA_instance1 = {
  id: 105,
  junctionId: 1001,
  position: 0,
  playlistId: 10,
  title: 'Starboy',
};
const trackA_instance2 = {
  id: 105,
  junctionId: 1002,
  position: 5,
  playlistId: 10,
  title: 'Starboy',
};

const key1 = getStablePlaylistTrackKey(trackA_instance1, 0);
const key2 = getStablePlaylistTrackKey(trackA_instance2, 5);

assert(key1 === 'pl-junction-1001', 'track instance 1 key uses junctionId 1001');
assert(key2 === 'pl-junction-1002', 'track instance 2 key uses junctionId 1002');
assert(key1 !== key2, 'Keys for identical track added twice to a playlist MUST be distinct and unique!');

// Scenario: Track without junctionId but with playlistId & position
const trackFallbackPosition = {
  id: 200,
  playlistId: 15,
  position: 2,
  title: 'Blinding Lights',
};
assert(
  getStablePlaylistTrackKey(trackFallbackPosition, 2) === 'pl-15-pos-2-tr-200',
  'Track with playlistId and position generates stable pos key'
);

// Scenario: YouTube / external track in playlist
const ytTrack = {
  id: 'yt_dQw4w9WgXcQ',
  videoId: 'dQw4w9WgXcQ',
  junctionId: 555,
  title: 'Never Gonna Give You Up',
};
assert(
  getStablePlaylistTrackKey(ytTrack, 0) === 'pl-junction-555',
  'External/YT track with junctionId gives pl-junction-555'
);

// 4. Test dedupePlaylists
console.log('\n--- 4. Testing dedupePlaylists ---');
const rawPlaylists = [
  { id: 1, title: 'Workout' },
  { id: 2, title: 'Chill' },
  { id: 1, title: 'Workout Duplicate' },
  { id: 3, title: 'Focus' },
  { id: 2, title: 'Chill Duplicate' },
];

const dedupedPl = dedupePlaylists(rawPlaylists);
assert(dedupedPl.length === 3, `Expected 3 unique playlists, got ${dedupedPl.length}`);
assert(dedupedPl.map((p) => p.id).join(',') === '1,2,3', 'Deduplicated IDs match 1,2,3');

// 5. Test dedupeTracks
console.log('\n--- 5. Testing dedupeTracks ---');
const rawTracks = [
  { id: 10, title: 'Track 10' },
  { id: 20, title: 'Track 20' },
  { id: 10, title: 'Track 10 Duplicate' },
  { id: 'yt_abc', videoId: 'abc', title: 'YT Track' },
  { id: 'yt_abc', videoId: 'abc', title: 'YT Track Duplicate' },
];

const dedupedTr = dedupeTracks(rawTracks);
assert(dedupedTr.length === 3, `Expected 3 unique tracks, got ${dedupedTr.length}`);

// 6. Test Key collision resistance across a 1000 item list
console.log('\n--- 6. Testing 1000 items collision resistance ---');
const generatedTracks = Array.from({ length: 1000 }, (_, i) => ({
  id: (i % 50) + 1, // Repeating track IDs (1 to 50)
  junctionId: i + 1, // Unique junction row IDs (1 to 1000)
  position: i,
  playlistId: 99,
  title: `Track ${(i % 50) + 1}`,
}));

const keysSet = new Set<string>();
for (let i = 0; i < generatedTracks.length; i++) {
  const k = getStablePlaylistTrackKey(generatedTracks[i], i);
  if (keysSet.has(k)) {
    assert(false, `Duplicate key detected in playlist tracks: ${k}`);
  }
  keysSet.add(k);
}

assert(keysSet.size === 1000, `Generated ${keysSet.size} unique keys for 1000 playlist tracks.`);

console.log('\n🎉 ALL PLAYLIST KEY & DEDUPLICATION TESTS PASSED SUCCESSFULLY!\n');
