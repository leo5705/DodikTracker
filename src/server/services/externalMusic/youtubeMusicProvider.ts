import { ExternalMusicProvider } from './externalMusicProvider.ts';
import { ExternalCatalogItem, ExternalArtist, ExternalRelease } from './types.ts';
import { youtubeMusicService, upgradeYouTubeThumbnail } from '../youtubeMusicService.ts';
import { externalMusicConfig } from './externalMusicConfig.ts';

export class YouTubeMusicProvider implements ExternalMusicProvider {
  public readonly name = 'youtube';

  public async searchTracks(query: string, options?: { limit?: number }): Promise<ExternalCatalogItem[]> {
    if (!externalMusicConfig.isCatalogEnabled('youtube')) {
      return [];
    }

    try {
      const results = await youtubeMusicService.searchSongs(query, options?.limit || 10);
      externalMusicConfig.recordSearch(true);
      externalMusicConfig.recordHealth('youtube', true, null);

      return results.map((dt) => ({
        kind: 'external' as const,
        id: `yt_${dt.videoId}`,
        providerTrackId: dt.videoId,
        provider: 'youtube' as const,
        title: dt.title,
        artist: dt.artist,
        artists: dt.artists,
        artistId: dt.artistId || null,
        album: dt.album || null,
        durationSeconds: dt.durationSeconds || null,
        thumbnail: dt.thumbnail || null,
        youtubeUrl: dt.youtubeUrl,
        lyrics: null,
        explicit: dt.isExplicit || null,
        playable: true,
      }));
    } catch (err: any) {
      externalMusicConfig.recordSearch(false);
      externalMusicConfig.recordHealth('youtube', false, err.message);
      throw err;
    }
  }

  public async searchArtists(query: string, options?: { limit?: number }): Promise<ExternalArtist[]> {
    if (!externalMusicConfig.isCatalogEnabled('youtube')) {
      return [];
    }
    try {
      const results = await youtubeMusicService.searchArtists(query, options?.limit || 5);
      return results.map((a) => ({
        provider: 'youtube' as const,
        providerArtistId: a.artistId,
        name: a.name,
        avatar: a.avatar,
        description: null,
        profileUrl: `https://music.youtube.com/channel/${a.artistId}`,
        followersCount: null,
        subscribers: a.subscribers || null,
      }));
    } catch (err) {
      console.error('[YouTubeMusicProvider] searchArtists error:', err);
      return [];
    }
  }

  public async searchReleases(query: string, options?: { limit?: number }): Promise<ExternalRelease[]> {
    if (!externalMusicConfig.isCatalogEnabled('youtube')) {
      return [];
    }
    try {
      const results = await youtubeMusicService.searchAlbums(query, options?.limit || 6);
      return results.map((alb) => {
        const isSingle = alb.type === 'single' || /single/i.test(alb.title);
        const isEp = alb.type === 'ep' || /\bep\b/i.test(alb.title);
        return {
          provider: 'youtube' as const,
          providerReleaseId: alb.albumId,
          title: alb.title,
          artist: alb.artist || 'YouTube Artist',
          coverUrl: alb.coverUrl,
          releaseType: isSingle ? 'single' : isEp ? 'ep' : 'album',
          year: alb.year || null,
          tracksCount: null,
        };
      });
    } catch (err) {
      console.error('[YouTubeMusicProvider] searchReleases error:', err);
      return [];
    }
  }

  public async getTrack(providerTrackId: string): Promise<ExternalCatalogItem | null> {
    return this.getTrackDetails(providerTrackId);
  }

  public async getArtist(providerArtistId: string): Promise<ExternalArtist | null> {
    if (!externalMusicConfig.isCatalogEnabled('youtube')) {
      return null;
    }
    try {
      const client = await youtubeMusicService.getClient();
      const artist = await client.getArtist(providerArtistId);
      if (!artist) return null;

      let avatarUrl: string | null = null;
      if (Array.isArray(artist.thumbnails) && artist.thumbnails.length > 0) {
        const sorted = [...artist.thumbnails].sort((a: any, b: any) => (Number(b.width) || 0) - (Number(a.width) || 0));
        avatarUrl = upgradeYouTubeThumbnail(sorted[0]?.url || null);
      }

      let followersCount: number | null = null;
      const subs = (artist as any).subscribers || (artist as any).subscriberCount || (artist as any).followers;
      if (typeof subs === 'number') {
        followersCount = subs;
      } else if (typeof subs === 'string') {
        const cleanSubs = subs.replace(/subscribers?/i, '').trim();
        if (cleanSubs.endsWith('M') || cleanSubs.endsWith('m')) {
          followersCount = Math.round(parseFloat(cleanSubs) * 1000000);
        } else if (cleanSubs.endsWith('K') || cleanSubs.endsWith('k')) {
          followersCount = Math.round(parseFloat(cleanSubs) * 1000);
        } else {
          const parsed = parseInt(cleanSubs.replace(/\D/g, ''), 10);
          if (!isNaN(parsed)) followersCount = parsed;
        }
      }

      return {
        provider: 'youtube',
        providerArtistId,
        name: artist.name || 'YouTube Artist',
        avatar: avatarUrl,
        description: (artist as any).description || null,
        profileUrl: `https://music.youtube.com/channel/${providerArtistId}`,
        followersCount,
      };
    } catch (err) {
      console.error('[YouTubeMusicProvider] getArtist error:', err);
      return null;
    }
  }

  public async getArtistTracks(providerArtistId: string): Promise<ExternalCatalogItem[]> {
    if (!externalMusicConfig.isCatalogEnabled('youtube')) {
      return [];
    }
    try {
      const client = await youtubeMusicService.getClient();
      let songs: any[] = [];
      try {
        songs = await client.getArtistSongs(providerArtistId);
      } catch {
        const artist = await client.getArtist(providerArtistId);
        if (artist && (artist as any).songs) {
          songs = (artist as any).songs;
        } else if (artist && (artist as any).topSongs) {
          songs = (artist as any).topSongs;
        } else if (artist && artist.name) {
          const searchSongs = await youtubeMusicService.searchSongs(artist.name, 15);
          return searchSongs.map((dto) => ({
            kind: 'external' as const,
            id: `yt_${dto.videoId}`,
            providerTrackId: dto.videoId,
            provider: 'youtube' as const,
            title: dto.title,
            artist: dto.artist,
            artists: dto.artists,
            album: dto.album || null,
            durationSeconds: dto.durationSeconds || null,
            thumbnail: dto.thumbnail || null,
            youtubeUrl: dto.youtubeUrl,
            lyrics: null,
            explicit: dto.isExplicit || null,
            playable: true,
          }));
        }
      }

      if (!Array.isArray(songs)) return [];
      return songs.map((s) => {
        const dto = youtubeMusicService.normalizeSong(s);
        return dto ? {
          kind: 'external' as const,
          id: `yt_${dto.videoId}`,
          providerTrackId: dto.videoId,
          provider: 'youtube' as const,
          title: dto.title,
          artist: dto.artist,
          artists: dto.artists,
          album: dto.album || null,
          durationSeconds: dto.durationSeconds || null,
          thumbnail: dto.thumbnail || null,
          youtubeUrl: dto.youtubeUrl,
          lyrics: null,
          explicit: dto.isExplicit || null,
          playable: true,
        } : null;
      }).filter(Boolean) as ExternalCatalogItem[];
    } catch (err) {
      console.error('[YouTubeMusicProvider] getArtistTracks error:', err);
      return [];
    }
  }

  public async getArtistReleases(providerArtistId: string): Promise<ExternalRelease[]> {
    if (!externalMusicConfig.isCatalogEnabled('youtube')) {
      return [];
    }
    try {
      const fullProfile = await this.getArtistFullProfile(providerArtistId);
      if (!fullProfile) return [];
      return [
        ...fullProfile.albums,
        ...fullProfile.singlesAndEps,
        ...fullProfile.compilations,
        ...fullProfile.liveReleases,
      ];
    } catch (err) {
      console.error('[YouTubeMusicProvider] getArtistReleases error:', err);
      return [];
    }
  }

  public async getArtistFullProfile(providerArtistId: string): Promise<import('./types.ts').ExternalArtistFullProfile | null> {
    if (!externalMusicConfig.isCatalogEnabled('youtube')) {
      return null;
    }

    try {
      const client = await youtubeMusicService.getClient();
      const artistSummary = await client.getArtist(providerArtistId);
      if (!artistSummary) return null;

      const artistName = artistSummary.name || 'Артист';

      // Avatar
      let avatarUrl: string | null = null;
      if (Array.isArray(artistSummary.thumbnails) && artistSummary.thumbnails.length > 0) {
        const sorted = [...artistSummary.thumbnails].sort((a: any, b: any) => (Number(b.width) || 0) - (Number(a.width) || 0));
        avatarUrl = upgradeYouTubeThumbnail(sorted[0]?.url || null);
      }

      // Followers
      let followersCount: number | null = null;
      const subs = (artistSummary as any).subscribers || (artistSummary as any).subscriberCount;
      if (typeof subs === 'number') followersCount = subs;
      else if (typeof subs === 'string') {
        const cleanSubs = subs.replace(/subscribers?/i, '').trim();
        if (cleanSubs.endsWith('M') || cleanSubs.endsWith('m')) followersCount = Math.round(parseFloat(cleanSubs) * 1000000);
        else if (cleanSubs.endsWith('K') || cleanSubs.endsWith('k')) followersCount = Math.round(parseFloat(cleanSubs) * 1000);
        else {
          const parsed = parseInt(cleanSubs.replace(/\D/g, ''), 10);
          if (!isNaN(parsed)) followersCount = parsed;
        }
      }

      const artist: ExternalArtist = {
        provider: 'youtube',
        providerArtistId,
        name: artistName,
        avatar: avatarUrl,
        description: (artistSummary as any).description || null,
        profileUrl: `https://music.youtube.com/channel/${providerArtistId}`,
        followersCount,
      };

      // Popular Tracks (top 10)
      let popularTracks: ExternalCatalogItem[] = [];
      const topSongsRaw = artistSummary.topSongs || (artistSummary as any).songs || [];
      if (Array.isArray(topSongsRaw)) {
        popularTracks = topSongsRaw.map((s) => {
          const dto = youtubeMusicService.normalizeSong(s);
          return dto ? {
            kind: 'external' as const,
            id: `yt_${dto.videoId}`,
            providerTrackId: dto.videoId,
            provider: 'youtube' as const,
            title: dto.title,
            artist: dto.artist || artistName,
            artists: dto.artists.length > 0 ? dto.artists : [artistName],
            artistId: providerArtistId,
            album: dto.album || null,
            durationSeconds: dto.durationSeconds || null,
            thumbnail: dto.thumbnail || avatarUrl || null,
            youtubeUrl: dto.youtubeUrl,
            lyrics: null,
            explicit: dto.isExplicit || null,
            playable: true,
          } : null;
        }).filter(Boolean) as ExternalCatalogItem[];
      }

      // Fetch Full Albums Catalog
      let fullAlbumsRaw: any[] = [];
      try {
        const fetched = await client.getArtistAlbums(providerArtistId);
        if (Array.isArray(fetched)) fullAlbumsRaw = fetched;
      } catch (err) {
        console.warn('[YouTubeMusicProvider] getArtistAlbums failed, fallback to search:', err);
      }

      // If direct artist album query yielded few or no albums, search by artist name for full catalog
      if (fullAlbumsRaw.length < 5 && artistName) {
        try {
          const searchedAlbums = await youtubeMusicService.searchAlbums(artistName, 15);
          for (const sa of searchedAlbums) {
            if (sa.albumId) {
              fullAlbumsRaw.push({
                albumId: sa.albumId,
                name: sa.title,
                title: sa.title,
                type: sa.type || 'album',
                year: sa.year,
                thumbnails: sa.coverUrl ? [{ url: sa.coverUrl, width: 544, height: 544 }] : [],
              });
            }
          }
        } catch (err) {
          console.warn('[YouTubeMusicProvider] searchAlbums fallback error:', err);
        }
      }

      // Merge with topAlbums and topSingles
      const allReleasesRawMap = new Map<string, any>();
      if (Array.isArray(artistSummary.topAlbums)) {
        for (const a of artistSummary.topAlbums) {
          const id = a.albumId || (a as any).browseId || (a as any).id;
          if (id) allReleasesRawMap.set(id, a);
        }
      }
      if (Array.isArray(artistSummary.topSingles)) {
        for (const s of artistSummary.topSingles) {
          const id = s.albumId || (s as any).browseId || (s as any).id;
          if (id) allReleasesRawMap.set(id, { ...s, releaseType: 'single' });
        }
      }
      for (const fa of fullAlbumsRaw) {
        const id = fa.albumId || (fa as any).browseId || (fa as any).id;
        if (id && !allReleasesRawMap.has(id)) {
          allReleasesRawMap.set(id, fa);
        }
      }

      const allReleasesRaw = Array.from(allReleasesRawMap.values());

      // Categorize releases
      const albums: ExternalRelease[] = [];
      const singlesAndEps: ExternalRelease[] = [];
      const compilations: ExternalRelease[] = [];
      const liveReleases: ExternalRelease[] = [];

      for (const a of allReleasesRaw) {
        const albumId = a.albumId || (a as any).browseId || (a as any).id;
        if (!albumId) continue;

        let coverUrl: string | null = null;
        if (Array.isArray(a.thumbnails) && a.thumbnails.length > 0) {
          const sorted = [...a.thumbnails].sort((x: any, y: any) => (Number(y.width) || 0) - (Number(x.width) || 0));
          coverUrl = upgradeYouTubeThumbnail(sorted[0]?.url || null);
        }

        const title = (a.name || a.title || 'Релиз').trim();
        const lowerTitle = title.toLowerCase();
        const type = String(a.type || a.releaseType || '').toLowerCase();

        const isLive = lowerTitle.includes('live') || lowerTitle.includes('unplugged') || lowerTitle.includes('concert') || lowerTitle.includes('broadcast');
        const isCompilation = lowerTitle.includes('best of') || lowerTitle.includes('greatest hits') || lowerTitle.includes('box set') || lowerTitle.includes('collection') || lowerTitle.includes('incesticide') || lowerTitle.includes('sliver');
        const isSingleEp = type === 'single' || type === 'ep' || lowerTitle.includes('single') || lowerTitle.endsWith(' - ep');

        let rType: 'album' | 'single' | 'ep' | 'compilation' | 'live' | 'other' = 'album';
        if (isLive) rType = 'live';
        else if (isCompilation) rType = 'compilation';
        else if (isSingleEp) rType = type === 'ep' ? 'ep' : 'single';

        const releaseObj: ExternalRelease = {
          provider: 'youtube',
          providerReleaseId: albumId,
          title,
          artist: artistName,
          artistId: providerArtistId,
          coverUrl,
          releaseType: rType,
          year: a.year ? parseInt(String(a.year), 10) || null : null,
          tracksCount: a.trackCount ? parseInt(String(a.trackCount), 10) || null : null,
        };

        if (isLive) liveReleases.push(releaseObj);
        else if (isCompilation) compilations.push(releaseObj);
        else if (isSingleEp) singlesAndEps.push(releaseObj);
        else albums.push(releaseObj);
      }

      // Sort by year descending (newest first)
      const sortByYearDesc = (arr: ExternalRelease[]) => {
        return arr.sort((a, b) => (b.year || 0) - (a.year || 0));
      };

      sortByYearDesc(albums);
      sortByYearDesc(singlesAndEps);
      sortByYearDesc(compilations);
      sortByYearDesc(liveReleases);

      const allCategorized = [...albums, ...singlesAndEps, ...compilations, ...liveReleases];
      const latestRelease = allCategorized.length > 0 ? allCategorized[0] : null;
      const popularReleases = allCategorized.slice(0, 8);

      // Featuring / Appears On
      const featuring: ExternalCatalogItem[] = [];
      if (Array.isArray(artistSummary.featuredOn)) {
        for (const rawItem of artistSummary.featuredOn) {
          const item = rawItem as any;
          const itemTitle = item.name || item.title;
          const itemId = item.playlistId || item.browseId || item.id;
          if (itemId && itemTitle) {
            featuring.push({
              kind: 'external',
              id: `yt_${itemId}`,
              providerTrackId: itemId,
              provider: 'youtube',
              title: itemTitle,
              artist: item.artist?.name || 'Featuring',
              artists: [item.artist?.name || 'Featuring'],
              album: null,
              durationSeconds: null,
              thumbnail: Array.isArray(item.thumbnails) && item.thumbnails[0]?.url ? upgradeYouTubeThumbnail(item.thumbnails[0].url) : null,
              lyrics: null,
              explicit: null,
              playable: true,
            });
          }
        }
      }

      // Similar Artists
      const similarArtists: ExternalArtist[] = [];
      if (Array.isArray(artistSummary.similarArtists)) {
        for (const sa of artistSummary.similarArtists) {
          if (sa.artistId && sa.name) {
            let saAvatar: string | null = null;
            if (Array.isArray(sa.thumbnails) && sa.thumbnails.length > 0) {
              saAvatar = upgradeYouTubeThumbnail(sa.thumbnails[0].url);
            }
            similarArtists.push({
              provider: 'youtube',
              providerArtistId: sa.artistId,
              name: sa.name,
              avatar: saAvatar,
              description: null,
              profileUrl: `https://music.youtube.com/channel/${sa.artistId}`,
            });
          }
        }
      }

      return {
        artist,
        popularTracks,
        latestRelease,
        popularReleases,
        albums,
        singlesAndEps,
        compilations,
        liveReleases,
        featuring,
        similarArtists,
      };
    } catch (err) {
      console.error('[YouTubeMusicProvider] getArtistFullProfile error:', err);
      return null;
    }
  }

  public async getRelease(providerReleaseId: string): Promise<ExternalRelease | null> {
    if (!externalMusicConfig.isCatalogEnabled('youtube')) {
      return null;
    }
    try {
      const client = await youtubeMusicService.getClient();
      const album = await client.getAlbum(providerReleaseId);
      if (!album) return null;

      let coverUrl: string | null = null;
      if (Array.isArray(album.thumbnails) && album.thumbnails.length > 0) {
        const sorted = [...album.thumbnails].sort((a: any, b: any) => (Number(b.width) || 0) - (Number(a.width) || 0));
        coverUrl = upgradeYouTubeThumbnail(sorted[0]?.url || null);
      }

      const tracksDto = Array.isArray(album.songs) ? album.songs.map((s) => {
        const dto = youtubeMusicService.normalizeSong(s);
        return dto ? {
          kind: 'external' as const,
          id: `yt_${dto.videoId}`,
          providerTrackId: dto.videoId,
          provider: 'youtube' as const,
          title: dto.title,
          artist: dto.artist || album.artist?.name || 'YouTube Artist',
          artists: dto.artists.length > 0 ? dto.artists : [album.artist?.name || 'YouTube Artist'],
          album: album.name,
          albumId: album.albumId || providerReleaseId,
          durationSeconds: dto.durationSeconds || null,
          thumbnail: dto.thumbnail || coverUrl || null,
          youtubeUrl: dto.youtubeUrl,
          lyrics: null,
          explicit: dto.isExplicit || null,
          playable: true,
        } : null;
      }).filter(Boolean) as ExternalCatalogItem[] : [];

      const isSingle = (album.type && String(album.type).toLowerCase() === 'single') || tracksDto.length === 1;
      const isEp = (album.type && String(album.type).toLowerCase() === 'ep') || (tracksDto.length > 1 && tracksDto.length <= 4);
      const rType = isSingle ? 'single' : (isEp ? 'ep' : 'album');

      return {
        provider: 'youtube',
        providerReleaseId,
        title: album.name,
        artist: album.artist?.name || 'YouTube Artist',
        artistId: album.artist?.artistId || null,
        coverUrl,
        releaseType: rType,
        year: album.year ? parseInt(String(album.year), 10) || null : null,
        tracksCount: tracksDto.length,
        tracks: tracksDto,
      };
    } catch (err) {
      console.error('[YouTubeMusicProvider] getRelease error:', err);
      return null;
    }
  }

  public async getReleaseTracks(providerReleaseId: string): Promise<ExternalCatalogItem[]> {
    const release = await this.getRelease(providerReleaseId);
    return release?.tracks || [];
  }

  // Backward compatibility methods
  public async searchSongs(query: string, limit = 10): Promise<ExternalCatalogItem[]> {
    return this.searchTracks(query, { limit });
  }

  public async getTrackDetails(providerTrackId: string): Promise<ExternalCatalogItem | null> {
    if (!providerTrackId || typeof providerTrackId !== 'string') {
      return null;
    }
    const cleanId = providerTrackId.replace(/^yt_/, '').trim();
    if (!cleanId) return null;

    // 1. Try searchSongs with the videoId - fast, reliable, matches YouTube Music catalog
    try {
      const searchResults = await youtubeMusicService.searchSongs(cleanId, 5);
      const exactMatch = searchResults.find((r) => r.videoId === cleanId);
      if (exactMatch) {
        return {
          kind: 'external' as const,
          id: `yt_${exactMatch.videoId}`,
          providerTrackId: exactMatch.videoId,
          provider: 'youtube' as const,
          title: exactMatch.title,
          artist: exactMatch.artist,
          artists: exactMatch.artists,
          album: exactMatch.album || null,
          durationSeconds: exactMatch.durationSeconds || null,
          thumbnail: exactMatch.thumbnail || null,
          youtubeUrl: exactMatch.youtubeUrl,
          lyrics: null,
          explicit: exactMatch.isExplicit || null,
          playable: true,
        };
      }
    } catch {
      // Non-blocking fallback
    }

    // 2. Fallback to YouTube oEmbed API - public, official, zero authentication required
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${cleanId}&format=json`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (oembedRes.ok) {
        const oembed = (await oembedRes.json()) as any;
        if (oembed && oembed.title) {
          const author = (oembed.author_name || 'YouTube Music').replace(/\s*-\s*Topic$/i, '').trim();
          return {
            kind: 'external' as const,
            id: `yt_${cleanId}`,
            providerTrackId: cleanId,
            provider: 'youtube' as const,
            title: oembed.title,
            artist: author,
            artists: [author],
            album: null,
            durationSeconds: null,
            thumbnail: oembed.thumbnail_url || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
            youtubeUrl: `https://www.youtube.com/watch?v=${cleanId}`,
            lyrics: null,
            explicit: null,
            playable: true,
          };
        }
      }
    } catch {
      // Non-blocking fallback
    }

    // 3. Fallback: try client.getSong() quietly
    try {
      const client = await youtubeMusicService.getClient();
      const song = await client.getSong(cleanId);
      if (song) {
        const dto = youtubeMusicService.normalizeSong(song);
        if (dto) {
          return {
            kind: 'external' as const,
            id: `yt_${dto.videoId}`,
            providerTrackId: dto.videoId,
            provider: 'youtube' as const,
            title: dto.title,
            artist: dto.artist,
            artists: dto.artists,
            album: dto.album || null,
            durationSeconds: dto.durationSeconds || null,
            thumbnail: dto.thumbnail || null,
            youtubeUrl: dto.youtubeUrl,
            lyrics: null,
            explicit: dto.isExplicit || null,
            playable: true,
          };
        }
      }
    } catch {
      // Silently handle if player endpoint is restricted
    }

    return null;
  }

  public async getLyrics(providerTrackId: string): Promise<string | null> {
    if (!providerTrackId || typeof providerTrackId !== 'string') {
      return null;
    }
    const cleanId = providerTrackId.replace(/^yt_/, '').trim();
    if (!cleanId) return null;

    try {
      const client = await youtubeMusicService.getClient();
      const lyricsData = await client.getLyrics(cleanId);
      if (!lyricsData || !Array.isArray(lyricsData) || lyricsData.length === 0) {
        return null;
      }
      const lyricsText = lyricsData.map((line) => (line || '').trim()).filter(Boolean).join('\n');
      return lyricsText || null;
    } catch {
      // Expected when song has no lyrics available or on parse failure
      return null;
    }
  }

  public async testConnection(): Promise<{ ok: boolean; message: string; latency?: number }> {
    const start = Date.now();
    try {
      const results = await youtubeMusicService.searchSongs('Queen', 2);
      const latency = Date.now() - start;
      if (Array.isArray(results) && results.length > 0) {
        externalMusicConfig.recordHealth('youtube', true, null, latency);
        return {
          ok: true,
          message: `Соединение с YouTube Music активно! Получено ${results.length} результатов, задержка: ${latency} мс.`,
          latency,
        };
      }
      externalMusicConfig.recordHealth('youtube', false, 'Пустой ответ поиска', latency);
      return { ok: false, message: 'Поиск не вернул результатов', latency };
    } catch (err: any) {
      const latency = Date.now() - start;
      const msg = err.message || 'Ошибка сети';
      externalMusicConfig.recordHealth('youtube', false, msg, latency);
      return { ok: false, message: `Ошибка проверки соединения: ${msg}`, latency };
    }
  }
}

export const youtubeMusicProvider = new YouTubeMusicProvider();
