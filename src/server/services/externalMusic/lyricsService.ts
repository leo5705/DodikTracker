import { db } from '../../../db/index.ts';
import { musicTracks } from '../../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { youtubeMusicProvider } from './youtubeMusicProvider.ts';
import { geniusProvider } from './lyrics/geniusProvider.ts';
import { lrclibProvider } from './lyrics/lrclibProvider.ts';
import { externalMusicConfig } from './externalMusicConfig.ts';
import { calculateMatchConfidence } from './lyrics/lyricsMatcher.ts';

interface CachedLyrics {
  text: string;
  provider: string;
  expiresAt: number;
}

export class LyricsService {
  private cache = new Map<string, CachedLyrics>();
  private readonly CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
  private readonly MAX_CACHE_ENTRIES = 500;

  /**
   * Fetch lyrics for an internal Dodik track by integer track ID
   */
  public async getInternalTrackLyrics(trackId: number): Promise<string | null> {
    if (isNaN(trackId) || trackId <= 0) return null;
    try {
      const [track] = await db
        .select({ lyrics: musicTracks.lyrics })
        .from(musicTracks)
        .where(eq(musicTracks.id, trackId))
        .limit(1);

      return track?.lyrics ? track.lyrics.trim() : null;
    } catch (err) {
      console.error(`[LyricsService] Error fetching internal lyrics for track ${trackId}:`, err);
      return null;
    }
  }

  /**
   * Fetch lyrics for an external track by provider track ID (e.g. YouTube videoId)
   * Ensures strict metadata matching and pluggable provider chain (YouTube -> Genius).
   */
  public async getExternalTrackLyrics(
    providerTrackId: string,
    expectedTitle?: string,
    expectedArtist?: string,
    album?: string | null,
    durationSeconds?: number | null,
    preferredProvider?: string | null
  ): Promise<string | null> {
    if (!providerTrackId || typeof providerTrackId !== 'string') return null;

    const cleanId = providerTrackId.replace(/^yt_/, '').trim();
    if (!cleanId) return null;

    const cacheKey = `lyrics:${cleanId}:${(expectedTitle || '').toLowerCase().trim()}:${preferredProvider || 'auto'}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);

    if (cached && now < cached.expiresAt) {
      externalMusicConfig.recordCache(true);
      return cached.text;
    }
    externalMusicConfig.recordCache(false);

    try {
      // 1. Fetch details to get official track metadata if not provided
      let title = expectedTitle;
      let artist = expectedArtist;

      if (!title || !artist) {
        const details = await youtubeMusicProvider.getTrackDetails(cleanId);
        if (details) {
          title = title || details.title;
          artist = artist || details.artist;
        }
      }

      // Verify metadata if both expected and candidate are known
      if (expectedTitle || expectedArtist) {
        const details = await youtubeMusicProvider.getTrackDetails(cleanId);
        if (details && (expectedTitle || expectedArtist)) {
          const confidence = calculateMatchConfidence(
            expectedTitle || details.title,
            expectedArtist || details.artist,
            details.title,
            details.artist
          );
          if (confidence < 0.6) {
            console.warn(`[LyricsService] Track metadata confidence too low for ${cleanId}: ${confidence}`);
            externalMusicConfig.recordLyrics(false);
            return null;
          }
        }
      }

      const providers = [];
      const pref = String(preferredProvider || 'auto').toLowerCase();

      if (pref === 'genius') {
        providers.push('genius');
        providers.push('lrclib');
        providers.push('youtube');
      } else if (pref === 'youtube') {
        providers.push('youtube');
        providers.push('lrclib');
        providers.push('genius');
      } else {
        // Default "auto" order: 1. LRCLIB (for synchronized karaoke LRC lyrics), 2. YouTube, 3. Genius
        providers.push('lrclib');
        providers.push('youtube');
        providers.push('genius');
      }

      for (const p of providers) {
        if (p === 'lrclib' && title && artist) {
          const lrcLyrics = await lrclibProvider.getLyrics({
            trackName: title,
            artistName: artist,
            albumName: album,
            duration: durationSeconds,
          });
          if (lrcLyrics && lrcLyrics.trim()) {
            const text = lrcLyrics.trim();
            this.setCache(cacheKey, text, 'lrclib');
            externalMusicConfig.recordLyrics(true);
            return text;
          }
        } else if (p === 'youtube') {
          const ytLyrics = await youtubeMusicProvider.getLyrics(cleanId);
          if (ytLyrics && ytLyrics.trim()) {
            const text = ytLyrics.trim();
            this.setCache(cacheKey, text, 'youtube');
            externalMusicConfig.recordLyrics(true);
            return text;
          }
        } else if (p === 'genius') {
          if (externalMusicConfig.isLyricsEnabled('genius') && title) {
            const geniusResult = await geniusProvider.searchLyrics({
              title,
              artists: artist ? [artist] : [],
              album: album || null,
              durationSeconds: durationSeconds || null,
            });

            if (geniusResult && geniusResult.text) {
              this.setCache(cacheKey, geniusResult.text, 'genius');
              externalMusicConfig.recordLyrics(true);
              return geniusResult.text;
            }
          }
        }
      }

      // No lyrics available - NEVER fabricate or generate placeholder text
      externalMusicConfig.recordLyrics(false);
      return null;
    } catch (err) {
      console.error(`[LyricsService] Error fetching external lyrics for ${cleanId}:`, err);
      externalMusicConfig.recordLyrics(false);
      return null;
    }
  }

  private setCache(key: string, text: string, provider: string): void {
    if (this.cache.size >= this.MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      text,
      provider,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }

  public clearCache(): void {
    this.cache.clear();
  }
}

export const lyricsService = new LyricsService();
