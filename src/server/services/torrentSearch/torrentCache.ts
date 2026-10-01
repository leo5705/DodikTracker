/**
 * TorrentCache: In-memory TTL cache for torrent search query results.
 * Prevents redundant external Prowlarr API calls for identical media queries.
 */

import { TorrentSearchResult, TorrentSearchQuery } from './torrentSearchTypes.ts';

interface CacheEntry {
  result: TorrentSearchResult;
  expiresAt: number;
}

export class TorrentCache {
  private cache = new Map<string, CacheEntry>();
  private defaultTtlMs = 15 * 60 * 1000; // 15 minutes TTL

  /**
   * Generates a deterministic string key from a TorrentSearchQuery.
   */
  public generateKey(query: TorrentSearchQuery): string {
    const parts = [
      String(query.mediaType || 'movie').toLowerCase(),
      String(query.mediaId || query.title).toLowerCase().trim(),
      query.year ? String(query.year) : '',
      query.seasonNumber !== undefined ? `s${query.seasonNumber}` : '',
      query.episodeNumber !== undefined ? `e${query.episodeNumber}` : '',
    ];
    return parts.filter(Boolean).join(':');
  }

  /**
   * Retrieves cached result if valid and unexpired.
   */
  public get(query: TorrentSearchQuery): TorrentSearchResult | null {
    const key = this.generateKey(query);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Stores a result in the cache.
   */
  public set(query: TorrentSearchQuery, result: TorrentSearchResult, ttlMs?: number): void {
    const key = this.generateKey(query);
    const ttl = ttlMs || this.defaultTtlMs;

    this.cache.set(key, {
      result,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Clears the entire cache.
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Returns current cache size.
   */
  public size(): number {
    return this.cache.size;
  }
}

export const torrentCache = new TorrentCache();
