import YTMusic, { type SongDetailed } from 'ytmusic-api';
import rateLimit from 'express-rate-limit';

export interface YouTubeTrackDTO {
  source: 'youtube';
  videoId: string;
  title: string;
  artist: string;
  artists: string[];
  artistId?: string | null;
  album?: string | null;
  durationSeconds?: number | null;
  thumbnail: string | null;
  youtubeUrl: string;
  isExplicit?: boolean | null;
}

export interface TrackArtistRef {
  id?: string | null;
  name: string;
  role: 'PRIMARY' | 'FEATURED';
}

export function parseTrackArtists(
  rawArtist: string | undefined | null,
  rawArtists: string[] | undefined | null,
  rawTitle: string | undefined | null,
  primaryArtistId?: string | null
): TrackArtistRef[] {
  const result: TrackArtistRef[] = [];
  const seenNames = new Set<string>();

  let titleFeaturedNames: string[] = [];
  if (rawTitle) {
    const featMatch = rawTitle.match(/\((?:feat|featuring|ft)\.?\s+([^)]+)\)/i);
    if (featMatch && featMatch[1]) {
      titleFeaturedNames = featMatch[1].split(/,|\s+&\s+|\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
    }
  }

  let primaryName = '';
  let artistStrFeaturedNames: string[] = [];

  if (rawArtist && (rawArtist.includes(' feat. ') || rawArtist.includes(' ft. ') || rawArtist.includes(' featuring '))) {
    const parts = rawArtist.split(/\s+(?:feat|ft|featuring)\.?\s+/i);
    primaryName = parts[0].trim();
    if (parts[1]) {
      artistStrFeaturedNames = parts[1].split(/,|\s+&\s+|\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
    }
  } else if (Array.isArray(rawArtists) && rawArtists.length > 0) {
    primaryName = rawArtists[0].trim();
    artistStrFeaturedNames = rawArtists.slice(1).map((a) => a.trim()).filter(Boolean);
  } else if (rawArtist) {
    primaryName = rawArtist.trim();
  }

  if (primaryName) {
    result.push({
      id: primaryArtistId || null,
      name: primaryName,
      role: 'PRIMARY',
    });
    seenNames.add(primaryName.toLowerCase());
  }

  const allFeatured = [...artistStrFeaturedNames, ...titleFeaturedNames];
  for (const name of allFeatured) {
    const cleanName = name.trim();
    if (cleanName && !seenNames.has(cleanName.toLowerCase())) {
      seenNames.add(cleanName.toLowerCase());
      result.push({
        id: null,
        name: cleanName,
        role: 'FEATURED',
      });
    }
  }

  return result;
}

export function upgradeYouTubeThumbnail(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim();
  if (clean.includes('googleusercontent.com') || clean.includes('ggpht.com')) {
    let upgraded = clean;
    if (/=w\d+-h\d+[^?#]*/.test(upgraded)) {
      upgraded = upgraded.replace(/=w\d+-h\d+[^?#]*/, '=w544-h544-l90-rj');
    } else if (/=s\d+[^?#]*/.test(upgraded)) {
      upgraded = upgraded.replace(/=s\d+[^?#]*/, '=s544-c');
    }
    return upgraded;
  }
  return clean;
}

export class YouTubeMusicService {
  private ytmusic: YTMusic | null = null;
  private initPromise: Promise<YTMusic> | null = null;
  private cache = new Map<string, { data: YouTubeTrackDTO[]; expiresAt: number }>();
  private readonly MAX_CACHE_ENTRIES = 500;
  private readonly CACHE_TTL_MS = 60 * 1000; // 60 seconds

  /**
   * Initializes and returns the singleton YTMusic client instance.
   * Ensures thread-safe / concurrent-safe single initialization across the server process.
   */
  public async getClient(): Promise<YTMusic> {
    if (this.ytmusic) {
      return this.ytmusic;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      const client = new YTMusic();
      await client.initialize();
      this.ytmusic = client;
      return client;
    })().catch((err) => {
      this.initPromise = null;
      throw err;
    });

    return this.initPromise;
  }

  /**
   * Cleans up expired cache entries and enforces max size limit (FIFO/LRU).
   */
  private pruneCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
    if (this.cache.size > this.MAX_CACHE_ENTRIES) {
      const excess = this.cache.size - this.MAX_CACHE_ENTRIES;
      const keysToDelete = Array.from(this.cache.keys()).slice(0, excess);
      for (const key of keysToDelete) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Normalizes raw SongDetailed item from ytmusic-api into clean YouTubeTrackDTO.
   * Ensures raw internal ytmusic fields do not leak and no fake values are fabricated.
   */
  public normalizeSong(song: SongDetailed | any): YouTubeTrackDTO | null {
    if (!song || !song.videoId || typeof song.videoId !== 'string') {
      return null;
    }

    const videoId = String(song.videoId).trim();
    const title = song.name ? String(song.name).trim() : (song.title ? String(song.title).trim() : 'Без названия');

    // Extract artists and artistId
    let artistName = '';
    let artistsList: string[] = [];
    let artistId: string | null = null;

    if (Array.isArray(song.artists) && song.artists.length > 0) {
      artistsList = song.artists
        .map((a: any) => (typeof a === 'string' ? a.trim() : (a?.name ? String(a.name).trim() : '')))
        .filter(Boolean);
      artistName = artistsList[0] || '';
      const firstA = song.artists[0];
      if (firstA && typeof firstA === 'object') {
        artistId = firstA.artistId || firstA.browseId || firstA.id || null;
      }
    } else if (song.artist && typeof song.artist === 'object' && song.artist.name) {
      artistName = String(song.artist.name).trim();
      artistsList = [artistName];
      artistId = song.artist.artistId || song.artist.browseId || song.artist.id || null;
    } else if (typeof song.artist === 'string' && song.artist.trim()) {
      artistName = song.artist.trim();
      artistsList = [artistName];
    }

    // Extract album
    let albumName: string | null = null;
    if (song.album) {
      if (typeof song.album === 'object' && song.album.name) {
        albumName = String(song.album.name).trim() || null;
      } else if (typeof song.album === 'string') {
        albumName = song.album.trim() || null;
      }
    }

    // Extract duration in seconds
    let durationSeconds: number | null = null;
    if (typeof song.duration === 'number' && !isNaN(song.duration) && song.duration >= 0) {
      durationSeconds = Math.round(song.duration);
    }

    // Extract highest resolution thumbnail
    let thumbnailUrl: string | null = null;
    if (Array.isArray(song.thumbnails) && song.thumbnails.length > 0) {
      const validThumbs = song.thumbnails.filter((t: any) => t && typeof t.url === 'string' && t.url.trim().length > 0);
      if (validThumbs.length > 0) {
        const sorted = [...validThumbs].sort((a: any, b: any) => (Number(b.width) || 0) - (Number(a.width) || 0));
        thumbnailUrl = upgradeYouTubeThumbnail(sorted[0].url.trim());
      }
    }

    // Extract explicit flag
    let isExplicit: boolean | null = null;
    if (typeof song.isExplicit === 'boolean') {
      isExplicit = song.isExplicit;
    } else if (typeof song.explicit === 'boolean') {
      isExplicit = song.explicit;
    }

    const dto: YouTubeTrackDTO = {
      source: 'youtube',
      videoId,
      title,
      artist: artistName,
      artists: artistsList,
      artistId: artistId ? String(artistId).trim() : null,
      album: albumName,
      durationSeconds,
      thumbnail: thumbnailUrl,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      isExplicit,
    };

    return dto;
  }

  /**
   * Search songs in YouTube Music with TTL caching, input validation, and result limits.
   */
  public async searchSongs(rawQuery: string, rawLimit = 10): Promise<YouTubeTrackDTO[]> {
    const trimmed = (rawQuery || '').trim();
    if (!trimmed) {
      const err: any = new Error('Поисковый запрос не может быть пустым');
      err.status = 400;
      throw err;
    }

    if (trimmed.length > 200) {
      const err: any = new Error('Поисковый запрос слишком длинный (максимум 200 символов)');
      err.status = 400;
      throw err;
    }

    const normalizedQuery = trimmed.replace(/\s+/g, ' ');
    const limit = Math.min(20, Math.max(1, Number(rawLimit) || 10));

    const cacheKey = `youtube-search:${normalizedQuery.toLowerCase()}:${limit}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);

    if (cached && now < cached.expiresAt) {
      return cached.data;
    }

    try {
      const client = await this.getClient();
      const rawSongs = await client.searchSongs(normalizedQuery);

      const normalizedResults: YouTubeTrackDTO[] = [];
      if (Array.isArray(rawSongs)) {
        for (const item of rawSongs) {
          const dto = this.normalizeSong(item);
          if (dto) {
            normalizedResults.push(dto);
          }
          if (normalizedResults.length >= limit) {
            break;
          }
        }
      }

      this.pruneCache();
      this.cache.set(cacheKey, {
        data: normalizedResults,
        expiresAt: now + this.CACHE_TTL_MS,
      });

      return normalizedResults;
    } catch (err: any) {
      if (err.status === 400) {
        throw err;
      }
      console.error('[YouTubeMusicService] External API error while searching:', err);
      const extErr: any = new Error('Не удалось выполнить поиск в YouTube Music. Внешний сервис временно недоступен.');
      extErr.status = 502;
      extErr.cause = err;
      throw extErr;
    }
  }

  /**
   * Search artists in YouTube Music with caching
   */
  public async searchArtists(rawQuery: string, rawLimit = 5): Promise<Array<{ artistId: string; name: string; avatar: string | null; subscribers?: string | null }>> {
    const trimmed = (rawQuery || '').trim();
    if (!trimmed) return [];

    const limit = Math.min(10, Math.max(1, Number(rawLimit) || 5));
    try {
      const client = await this.getClient();
      const rawArtists = await client.searchArtists(trimmed);
      if (!Array.isArray(rawArtists)) return [];

      const results: Array<{ artistId: string; name: string; avatar: string | null; subscribers?: string | null }> = [];
      for (const a of rawArtists) {
        const artistId = a.artistId || (a as any).browseId || (a as any).id;
        if (!artistId) continue;

        let avatar: string | null = null;
        if (Array.isArray(a.thumbnails) && a.thumbnails.length > 0) {
          const sorted = [...a.thumbnails].sort((x: any, y: any) => (Number(y.width) || 0) - (Number(x.width) || 0));
          avatar = upgradeYouTubeThumbnail(sorted[0]?.url || null);
        }

        results.push({
          artistId: String(artistId).trim(),
          name: a.name || 'YouTube Artist',
          avatar,
          subscribers: (a as any).subscribers || (a as any).subscriberCount || null,
        });

        if (results.length >= limit) break;
      }

      return results;
    } catch (err) {
      console.error('[YouTubeMusicService] searchArtists error:', err);
      return [];
    }
  }

  /**
   * Search albums in YouTube Music with caching
   */
  public async searchAlbums(rawQuery: string, rawLimit = 6): Promise<Array<{ albumId: string; title: string; artist: string; coverUrl: string | null; year?: number | null; type?: string | null }>> {
    const trimmed = (rawQuery || '').trim();
    if (!trimmed) return [];

    const limit = Math.min(12, Math.max(1, Number(rawLimit) || 6));
    try {
      const client = await this.getClient();
      const rawAlbums = await client.searchAlbums(trimmed);
      if (!Array.isArray(rawAlbums)) return [];

      const results: Array<{ albumId: string; title: string; artist: string; coverUrl: string | null; year?: number | null; type?: string | null }> = [];
      for (const alb of rawAlbums) {
        const albumId = alb.albumId || (alb as any).browseId || (alb as any).id;
        if (!albumId) continue;

        let coverUrl: string | null = null;
        if (Array.isArray(alb.thumbnails) && alb.thumbnails.length > 0) {
          const sorted = [...alb.thumbnails].sort((x: any, y: any) => (Number(y.width) || 0) - (Number(x.width) || 0));
          coverUrl = upgradeYouTubeThumbnail(sorted[0]?.url || null);
        }

        let artistName = '';
        if (alb.artist && typeof alb.artist === 'object') {
          artistName = (alb.artist as any).name || '';
        } else if (typeof alb.artist === 'string') {
          artistName = alb.artist;
        }

        results.push({
          albumId: String(albumId).trim(),
          title: alb.name || (alb as any).title || 'Альбом',
          artist: artistName,
          coverUrl,
          year: (alb as any).year ? parseInt(String((alb as any).year), 10) || null : null,
          type: (alb as any).type || 'album',
        });

        if (results.length >= limit) break;
      }

      return results;
    } catch (err) {
      console.error('[YouTubeMusicService] searchAlbums error:', err);
      return [];
    }
  }

  /**
   * Clear in-memory cache (for tests/debugging)
   */
  public clearCache(): void {
    this.cache.clear();
  }
}

export const youtubeMusicService = new YouTubeMusicService();

export const youtubeSearchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 30, // 30 search requests per IP per minute
  message: { error: 'Слишком много поисковых запросов к YouTube Music. Пожалуйста, подождите минуту.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    trustProxy: false,
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
});
