import { ResolvedPlaybackSource, AudioQuality } from './types.ts';

interface CacheEntry {
  data: ResolvedPlaybackSource;
  expiresAtTimestamp: number;
}

export class PlaybackCache {
  private cache = new Map<string, CacheEntry>();
  private inFlightMap = new Map<string, Promise<ResolvedPlaybackSource>>();
  private defaultTtlMs = 3 * 60 * 60 * 1000; // 3 hours in ms

  /**
   * Generates key from track ID and requested quality
   */
  public generateKey(trackId: string, quality: AudioQuality = 'high'): string {
    return `${trackId.trim()}:${quality}`;
  }

  /**
   * Gets cached entry if present and not expired
   */
  public get(trackId: string, quality: AudioQuality = 'high'): ResolvedPlaybackSource | null {
    const key = this.generateKey(trackId, quality);
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() >= entry.expiresAtTimestamp) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Stores item in cache, calculating expiry from source's expiresAt or default TTL
   */
  public set(trackId: string, quality: AudioQuality, data: ResolvedPlaybackSource): void {
    const key = this.generateKey(trackId, quality);

    let ttlMs = this.defaultTtlMs;
    if (data.expiresAt) {
      const parsedExp = new Date(data.expiresAt).getTime();
      if (!isNaN(parsedExp)) {
        // Subtract 5-minute safety buffer before real YouTube URL expiration
        const remainingTtl = parsedExp - Date.now() - 5 * 60 * 1000;
        if (remainingTtl > 0) {
          ttlMs = Math.min(ttlMs, remainingTtl);
        }
      }
    }

    const expiresAtTimestamp = Date.now() + ttlMs;
    this.cache.set(key, { data, expiresAtTimestamp });
  }

  /**
   * Wraps call in in-flight lock to prevent cache stampede.
   * If 20 concurrent requests ask for same key, only 1 fetch executes.
   */
  public async getOrFetch(
    trackId: string,
    quality: AudioQuality,
    fetcher: () => Promise<ResolvedPlaybackSource>
  ): Promise<{ source: ResolvedPlaybackSource; cacheHit: boolean }> {
    const key = this.generateKey(trackId, quality);

    // 1. Check cache first
    const cached = this.get(trackId, quality);
    if (cached) {
      return { source: cached, cacheHit: true };
    }

    // 2. Check if request is currently in-flight
    let inFlightPromise = this.inFlightMap.get(key);
    if (inFlightPromise) {
      const result = await inFlightPromise;
      return { source: result, cacheHit: true }; // Cache hit for stampede follower
    }

    // 3. Initiate fetch with lock
    inFlightPromise = (async () => {
      try {
        const resolved = await fetcher();
        this.set(trackId, quality, resolved);
        return resolved;
      } finally {
        this.inFlightMap.delete(key);
      }
    })();

    this.inFlightMap.set(key, inFlightPromise);
    const result = await inFlightPromise;
    return { source: result, cacheHit: false };
  }

  /**
   * Invalidates single key or clear all
   */
  public invalidate(trackId: string, quality?: AudioQuality): void {
    if (quality) {
      this.cache.delete(this.generateKey(trackId, quality));
    } else {
      for (const k of this.cache.keys()) {
        if (k.startsWith(`${trackId}:`)) {
          this.cache.delete(k);
        }
      }
    }
  }

  public clear(): void {
    this.cache.clear();
    this.inFlightMap.clear();
  }
}

export const globalPlaybackCache = new PlaybackCache();
