/**
 * LRCLIB Provider for Synchronized Karaoke Lyrics (LRC timestamps)
 * LRCLIB is a free, public, high-quality lyrics database with vast coverage of synchronized LRC lyrics.
 */

import { cleanSongTitle, cleanArtistName } from './lyricsMatcher.ts';

export interface LrclibLyricsResult {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
}

export class LrclibProvider {
  private readonly baseUrl = 'https://lrclib.net/api';
  private readonly timeoutMs = 4000;

  /**
   * Fetch synced/plain lyrics from LRCLIB
   */
  public async getLyrics(params: {
    trackName: string;
    artistName: string;
    albumName?: string | null;
    duration?: number | null;
  }): Promise<string | null> {
    const cleanTitle = cleanSongTitle(params.trackName);
    const cleanArtist = cleanArtistName(params.artistName);

    if (!cleanTitle || !cleanArtist) {
      return null;
    }

    try {
      const url = new URL(`${this.baseUrl}/get`);
      url.searchParams.set('track_name', cleanTitle);
      url.searchParams.set('artist_name', cleanArtist);
      if (params.albumName) {
        url.searchParams.set('album_name', params.albumName.trim());
      }
      if (params.duration && params.duration > 0) {
        url.searchParams.set('duration', String(Math.round(params.duration)));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'DodikTracker/1.0 (https://github.com/dodik-tracker)',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as LrclibLyricsResult;
        if (data.syncedLyrics && data.syncedLyrics.trim()) {
          return data.syncedLyrics.trim();
        }
        if (data.plainLyrics && data.plainLyrics.trim()) {
          return data.plainLyrics.trim();
        }
      }

      // If exact match failed, try search endpoint
      const searchUrl = new URL(`${this.baseUrl}/search`);
      searchUrl.searchParams.set('q', `${cleanArtist} ${cleanTitle}`);

      const searchController = new AbortController();
      const searchTimeoutId = setTimeout(() => searchController.abort(), this.timeoutMs);

      const searchRes = await fetch(searchUrl.toString(), {
        headers: {
          'User-Agent': 'DodikTracker/1.0 (https://github.com/dodik-tracker)',
        },
        signal: searchController.signal,
      });
      clearTimeout(searchTimeoutId);

      if (searchRes.ok) {
        const results = (await searchRes.json()) as any[];
        if (Array.isArray(results) && results.length > 0) {
          // Prefer syncedLyrics first
          const syncedItem = results.find((r) => r.syncedLyrics && r.syncedLyrics.trim().length > 0);
          if (syncedItem) {
            return syncedItem.syncedLyrics.trim();
          }
          const plainItem = results.find((r) => r.plainLyrics && r.plainLyrics.trim().length > 0);
          if (plainItem) {
            return plainItem.plainLyrics.trim();
          }
        }
      }

      return null;
    } catch (err) {
      // Non-blocking fallback
      return null;
    }
  }
}

export const lrclibProvider = new LrclibProvider();
