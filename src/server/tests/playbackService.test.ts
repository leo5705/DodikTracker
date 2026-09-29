/**
 * Dodik Tracker - Playback API & Resolvers Architecture Tests
 *
 * Verifies:
 * 1. extractYouTubeVideoId parses YouTube video IDs from various inputs
 * 2. DirectAudioPlaybackResolver resolves direct uploaded audio files
 * 3. PlaybackCache hit/miss lifecycle and invalidation
 * 4. Concurrent requests invoke underlying resolver only ONCE (stampede protection)
 */

import { PlaybackService } from '../services/music/playback/PlaybackService.ts';
import { PlaybackCache } from '../services/music/playback/PlaybackCache.ts';
import { DirectAudioPlaybackResolver } from '../services/music/playback/DirectAudioPlaybackResolver.ts';
import { extractYouTubeVideoId } from '../../utils/musicPlaybackResolver.ts';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

export async function runPlaybackServiceTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  const results: TestResult[] = [];
  const cache = new PlaybackCache();
  const service = new PlaybackService(cache);

  // 1. YouTube Video ID extraction
  try {
    const testCases = [
      { input: 'yt_dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
      { input: 'youtube:dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
      { input: 'dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
      { input: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
      { input: 'https://youtu.be/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
    ];

    for (const tc of testCases) {
      const extracted = extractYouTubeVideoId(tc.input);
      if (extracted !== tc.expected) {
        throw new Error(`Failed for input "${tc.input}": expected "${tc.expected}", got "${extracted}"`);
      }
    }

    if (extractYouTubeVideoId('invalid_id_format_too_short') !== null) {
      throw new Error('Expected null for invalid short ID');
    }

    results.push({ name: '1. extractYouTubeVideoId detection', passed: true });
  } catch (err: any) {
    results.push({ name: '1. extractYouTubeVideoId detection', passed: false, error: err.message });
  }

  // 2. Direct MP3 Audio Resolution
  try {
    const directResolver = new DirectAudioPlaybackResolver('https://dodiktracker.org');
    const track = {
      id: 42,
      title: 'Test Song',
      audioFile: 'song_42_12345.mp3',
      duration: 180,
    };

    const resolved = await directResolver.resolve(track, { quality: 'standard' });

    if (resolved.trackId !== '42') throw new Error(`Expected trackId "42", got "${resolved.trackId}"`);
    if (resolved.sourceType !== 'direct_audio') throw new Error(`Expected sourceType "direct_audio", got "${resolved.sourceType}"`);
    if (resolved.streamUrl !== 'https://dodiktracker.org/uploads/audio/song_42_12345.mp3') {
      throw new Error(`Unexpected streamUrl "${resolved.streamUrl}"`);
    }
    if (resolved.mimeType !== 'audio/mpeg') throw new Error(`Expected mimeType "audio/mpeg", got "${resolved.mimeType}"`);
    if (resolved.isSeekable !== true) throw new Error('Expected isSeekable true');
    if (resolved.duration !== 180) throw new Error(`Expected duration 180, got "${resolved.duration}"`);

    results.push({ name: '2. Direct MP3 Audio Resolution', passed: true });
  } catch (err: any) {
    results.push({ name: '2. Direct MP3 Audio Resolution', passed: false, error: err.message });
  }

  // 3. Cache Hit/Miss & Invalidation
  try {
    const track = {
      id: 101,
      audioFile: '/uploads/audio/test.mp3',
    };

    const firstRes = await service.resolve(track, { quality: 'high' });
    if (firstRes.sourceType !== 'direct_audio') throw new Error('Expected direct_audio source');

    const cachedItem = cache.get('101', 'high');
    if (!cachedItem) throw new Error('Expected item to be present in cache');
    if (cachedItem.streamUrl !== firstRes.streamUrl) throw new Error('Cached streamUrl mismatch');

    cache.invalidate('101', 'high');
    if (cache.get('101', 'high') !== null) throw new Error('Expected cache item to be invalidated');

    results.push({ name: '3. Cache Hit/Miss & Invalidation', passed: true });
  } catch (err: any) {
    results.push({ name: '3. Cache Hit/Miss & Invalidation', passed: false, error: err.message });
  }

  // 4. Cache Stampede Protection
  try {
    let callCount = 0;
    const testCache = new PlaybackCache();

    const mockFetcher = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        trackId: '999',
        sourceType: 'direct_audio' as const,
        streamUrl: 'https://example.com/audio.mp3',
        quality: 'high' as const,
      };
    };

    const promises = Array.from({ length: 20 }).map(() =>
      testCache.getOrFetch('999', 'high', mockFetcher)
    );

    const outcomes = await Promise.all(promises);

    if (callCount !== 1) {
      throw new Error(`Expected fetcher to be called exactly 1 time, but was called ${callCount} times`);
    }

    if (outcomes.length !== 20) {
      throw new Error(`Expected 20 promise outcomes, got ${outcomes.length}`);
    }

    for (const o of outcomes) {
      if (o.source.streamUrl !== 'https://example.com/audio.mp3') {
        throw new Error('Outcome streamUrl mismatch');
      }
    }

    results.push({ name: '4. Cache Stampede Protection (20 concurrent requests -> 1 fetch)', passed: true });
  } catch (err: any) {
    results.push({ name: '4. Cache Stampede Protection', passed: false, error: err.message });
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  return { total, passed, failed: total - passed, results };
}

// Self-execution if run via tsx
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('playbackService.test')) {
  runPlaybackServiceTests().then((res) => {
    console.log(`\n=== PLAYBACK SERVICE TEST RESULTS (${res.passed}/${res.total} Passed) ===`);
    res.results.forEach((r) => {
      if (r.passed) console.log(` [PASS] ${r.name}`);
      else console.error(` [FAIL] ${r.name}: ${r.error}`);
    });
    if (res.failed > 0) process.exit(1);
  });
}
