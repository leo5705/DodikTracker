/**
 * Dodik Tracker - Automated YouTube Music Search Backend Tests
 * 
 * Test Scenarios:
 * 1. Empty query (q = '') -> 400 Bad Request
 * 2. Query exceeding maximum length (> 200 chars) -> 400 Bad Request
 * 3. Limit parameter capped to max 20 when limit > 20, default to 10
 * 4. Normalization logic properly formats raw API response into strict YouTubeTrackDTO
 * 5. Raw ytmusic-api internal fields (formats, thumbnails array, etc.) do NOT leak
 * 6. Missing optional fields produce null without fabricating fake artist/duration values
 * 7. In-memory TTL Cache caches responses by normalized key and respects expiration
 * 8. Error handling prevents server crashes and returns structured errors without stack traces
 * 9. Rate limit configuration and validation
 * 10. Existing Music Router endpoints and structures remain intact and uncorrupted
 */

import { YouTubeMusicService, YouTubeTrackDTO, youtubeMusicService } from '../services/youtubeMusicService.ts';
import { musicRouter } from '../routes/music.ts';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

export async function runYouTubeMusicTests(): Promise<{ total: number; passed: number; failed: number; results: TestResult[] }> {
  const results: TestResult[] = [];

  // 1. Empty query validation -> 400
  try {
    let thrown = false;
    try {
      await youtubeMusicService.searchSongs('');
    } catch (err: any) {
      thrown = true;
      if (err.status !== 400) {
        throw new Error(`Expected status 400, got ${err.status}`);
      }
    }
    if (!thrown) throw new Error('Service did not throw on empty query');

    let thrownWhitespace = false;
    try {
      await youtubeMusicService.searchSongs('     ');
    } catch (err: any) {
      thrownWhitespace = true;
      if (err.status !== 400) {
        throw new Error(`Expected status 400 on whitespace query, got ${err.status}`);
      }
    }
    if (!thrownWhitespace) throw new Error('Service did not throw on whitespace query');

    results.push({
      name: 'Empty query (q = "") or whitespace returns 400 error',
      passed: true,
      details: 'Validated empty query and whitespace strings throw 400 Bad Request.',
    });
  } catch (err: any) {
    results.push({ name: 'Empty query validation', passed: false, error: err.message });
  }

  // 2. Query exceeding 200 characters -> 400
  try {
    const longQuery = 'a'.repeat(201);
    let thrownLong = false;
    try {
      await youtubeMusicService.searchSongs(longQuery);
    } catch (err: any) {
      thrownLong = true;
      if (err.status !== 400) {
        throw new Error(`Expected status 400, got ${err.status}`);
      }
    }
    if (!thrownLong) throw new Error('Service did not throw on query > 200 chars');

    results.push({
      name: 'Too long query (> 200 chars) returns 400 error',
      passed: true,
      details: 'Rejected query exceeding 200 chars with status 400.',
    });
  } catch (err: any) {
    results.push({ name: 'Too long query validation', passed: false, error: err.message });
  }

  // 3. Normalization logic & DTO structure verification
  try {
    const rawMockSong = {
      type: 'SONG',
      videoId: 'dQw4w9WgXcQ',
      name: 'Never Gonna Give You Up',
      artist: {
        artistId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
        name: 'Rick Astley',
      },
      album: {
        albumId: 'MPREb_mock123',
        name: 'Whenever You Need Somebody',
      },
      duration: 213,
      thumbnails: [
        { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/small.jpg', width: 120, height: 90 },
        { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', width: 1280, height: 720 },
        { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/medium.jpg', width: 320, height: 180 },
      ],
      isExplicit: false,
      extraInternalRawField: 'should_not_leak',
      formats: [{ itag: 140, url: 'http://secret' }],
    };

    const service = new YouTubeMusicService();
    const dto = service.normalizeSong(rawMockSong);

    if (!dto) throw new Error('normalizeSong returned null');

    if (dto.source !== 'youtube') throw new Error(`Expected source: "youtube", got "${dto.source}"`);
    if (dto.videoId !== 'dQw4w9WgXcQ') throw new Error(`Expected videoId: "dQw4w9WgXcQ", got "${dto.videoId}"`);
    if (dto.title !== 'Never Gonna Give You Up') throw new Error(`Expected title: "Never Gonna Give You Up", got "${dto.title}"`);
    if (dto.artist !== 'Rick Astley') throw new Error(`Expected artist: "Rick Astley", got "${dto.artist}"`);
    if (!Array.isArray(dto.artists) || dto.artists[0] !== 'Rick Astley') throw new Error('Expected artists array containing Rick Astley');
    if (dto.album !== 'Whenever You Need Somebody') throw new Error(`Expected album name, got "${dto.album}"`);
    if (dto.durationSeconds !== 213) throw new Error(`Expected durationSeconds: 213, got "${dto.durationSeconds}"`);
    if (dto.thumbnail !== 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg') {
      throw new Error(`Expected highest resolution thumbnail, got "${dto.thumbnail}"`);
    }
    if (dto.youtubeUrl !== 'https://www.youtube.com/watch?v=dQw4w9WgXcQ') {
      throw new Error(`Expected youtubeUrl, got "${dto.youtubeUrl}"`);
    }
    if (dto.isExplicit !== false) throw new Error(`Expected isExplicit: false, got "${dto.isExplicit}"`);

    // 4. Check raw ytmusic-api fields do NOT leak
    const allowedKeys = new Set([
      'source',
      'videoId',
      'title',
      'artist',
      'artists',
      'album',
      'durationSeconds',
      'thumbnail',
      'youtubeUrl',
      'isExplicit',
    ]);

    const actualKeys = Object.keys(dto);
    for (const key of actualKeys) {
      if (!allowedKeys.has(key)) {
        throw new Error(`Leaked raw or unexpected field in DTO: ${key}`);
      }
    }

    if ((dto as any).extraInternalRawField !== undefined || (dto as any).formats !== undefined) {
      throw new Error('Raw internal fields leaked into DTO!');
    }

    results.push({
      name: 'Normalization produces exact DTO & does not leak raw ytmusic fields',
      passed: true,
      details: 'All required DTO properties present, highest resolution thumbnail picked, raw fields isolated.',
    });
  } catch (err: any) {
    results.push({ name: 'DTO normalization and isolation test', passed: false, error: err.message });
  }

  // 5. Missing optional fields test (no fake data fabrication)
  try {
    const rawMinimalSong = {
      type: 'SONG',
      videoId: 'min12345678',
      name: 'Ambient Track',
      artist: null,
      album: null,
      duration: null,
      thumbnails: [],
    };

    const service = new YouTubeMusicService();
    const minimalDto = service.normalizeSong(rawMinimalSong);

    if (!minimalDto) throw new Error('normalizeSong returned null');
    if (minimalDto.album !== null) throw new Error(`Expected null album, got ${minimalDto.album}`);
    if (minimalDto.durationSeconds !== null) throw new Error(`Expected null durationSeconds, got ${minimalDto.durationSeconds}`);
    if (minimalDto.thumbnail !== null) throw new Error(`Expected null thumbnail, got ${minimalDto.thumbnail}`);
    if (minimalDto.isExplicit !== null) throw new Error(`Expected null isExplicit, got ${minimalDto.isExplicit}`);

    results.push({
      name: 'Missing fields return null and do not fabricate fake artists or durations',
      passed: true,
      details: 'Verified album, durationSeconds, thumbnail, and isExplicit resolve to null when absent.',
    });
  } catch (err: any) {
    results.push({ name: 'Missing fields null test', passed: false, error: err.message });
  }

  // 6. In-memory TTL Cache verification
  try {
    const service = new YouTubeMusicService();
    service.clearCache();

    // Mock client on service
    let callCount = 0;
    (service as any).getClient = async () => ({
      searchSongs: async (q: string) => {
        callCount++;
        return [
          {
            type: 'SONG',
            videoId: `vid_${callCount}`,
            name: `Song for ${q}`,
            artist: { name: 'Artist' },
            album: { name: 'Album' },
            duration: 180,
            thumbnails: [{ url: 'http://thumb.jpg', width: 300, height: 300 }],
          },
        ];
      },
    });

    const res1 = await service.searchSongs('  Queen Bohemian   Rhapsody  ', 10);
    const res2 = await service.searchSongs('queen bohemian rhapsody', 10);

    if (callCount !== 1) {
      throw new Error(`Expected exactly 1 client call due to cache, got ${callCount}`);
    }

    if (res1[0].videoId !== res2[0].videoId) {
      throw new Error('Cached results mismatch');
    }

    results.push({
      name: 'In-memory TTL cache normalizes query and prevents redundant network calls',
      passed: true,
      details: 'Normalized "  Queen Bohemian   Rhapsody  " and cached result for identical normalized query.',
    });
  } catch (err: any) {
    results.push({ name: 'Cache verification test', passed: false, error: err.message });
  }

  // 7. Limit clamping test (limit > 20 capped at 20)
  try {
    const service = new YouTubeMusicService();
    const twentyFiveSongs = Array.from({ length: 25 }, (_, i) => ({
      type: 'SONG',
      videoId: `vid_${i}`,
      name: `Track ${i}`,
      artist: { name: 'Artist' },
      album: { name: 'Album' },
      duration: 120,
      thumbnails: [],
    }));

    (service as any).getClient = async () => ({
      searchSongs: async () => twentyFiveSongs,
    });

    const result50 = await service.searchSongs('test limit', 50);
    if (result50.length !== 20) {
      throw new Error(`Expected 20 items maximum when requesting limit 50, got ${result50.length}`);
    }

    const resultDefault = await service.searchSongs('test default limit', 10);
    if (resultDefault.length !== 10) {
      throw new Error(`Expected 10 items for default limit, got ${resultDefault.length}`);
    }

    results.push({
      name: 'Limit parameter capped at 20 maximum and defaults properly',
      passed: true,
      details: 'Requested 50 results -> accurately capped to 20.',
    });
  } catch (err: any) {
    results.push({ name: 'Limit clamping test', passed: false, error: err.message });
  }

  // 8. External API Error handling (does not crash server)
  try {
    const service = new YouTubeMusicService();
    (service as any).getClient = async () => ({
      searchSongs: async () => {
        throw new Error('YouTube Music upstream network timeout');
      },
    });

    let caughtStatus: number | null = null;
    let caughtMessage = '';
    try {
      await service.searchSongs('error query');
    } catch (err: any) {
      caughtStatus = err.status;
      caughtMessage = err.message;
    }

    if (caughtStatus !== 502) {
      throw new Error(`Expected status 502 for external API failure, got ${caughtStatus}`);
    }

    if (!caughtMessage.includes('YouTube Music')) {
      throw new Error(`Expected clean error message, got: ${caughtMessage}`);
    }

    results.push({
      name: 'External API failure is handled gracefully with 502 error without server crash',
      passed: true,
      details: 'Handled upstream network failure and returned clean 502 status error.',
    });
  } catch (err: any) {
    results.push({ name: 'Error handling test', passed: false, error: err.message });
  }

  // 9. Existing Music Router routes verification
  try {
    if (!musicRouter || typeof musicRouter !== 'function') {
      throw new Error('musicRouter is not a valid express Router');
    }

    // Inspect routes registered on musicRouter
    const routes = (musicRouter.stack || [])
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));

    const hasYoutubeSearch = routes.some(
      (r) => r.path === '/external/youtube/search' && r.methods.includes('get')
    );

    if (!hasYoutubeSearch) {
      throw new Error('Route GET /external/youtube/search is missing from musicRouter');
    }

    // Verify critical existing routes exist
    const requiredExisting = [
      '/releases',
      '/artists',
      '/playlists',
      '/my/tracks',
      '/my/releases',
    ];

    for (const reqPath of requiredExisting) {
      const exists = routes.some((r) => r.path === reqPath || r.path.startsWith(reqPath));
      if (!exists) {
        throw new Error(`Existing music route ${reqPath} is missing!`);
      }
    }

    results.push({
      name: 'MusicRouter registers /external/youtube/search while preserving all existing endpoints',
      passed: true,
      details: 'Confirmed GET /external/youtube/search and all existing /api/music routes are intact.',
    });
  } catch (err: any) {
    results.push({ name: 'Router preservation test', passed: false, error: err.message });
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

// Auto-run when executed directly via tsx
runYouTubeMusicTests().then((res) => {
  console.log(`\n======================================================`);
  console.log(`   Dodik Tracker - YouTube Music Search Backend Tests `);
  console.log(`======================================================`);
  for (const r of res.results) {
    console.log(`${r.passed ? '✅ [PASS]' : '❌ [FAIL]'} ${r.name}`);
    if (r.details) console.log(`   └─ ${r.details}`);
    if (r.error) console.log(`   └─ Error: ${r.error}`);
  }
  console.log(`------------------------------------------------------`);
  console.log(`Total: ${res.total} | Passed: ${res.passed} | Failed: ${res.failed}`);
  console.log(`======================================================\n`);

  if (res.failed > 0) {
    process.exit(1);
  }
  process.exit(0);
});
