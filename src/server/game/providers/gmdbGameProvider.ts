import {
  IGameProvider,
  RawGameData,
  ProviderHealthResult,
} from '../types.ts';
import {
  UnifiedDeveloper,
  UnifiedPublisher,
  UnifiedSeries,
  UnifiedDLC,
  UnifiedScreenshot,
  UnifiedVideo,
  UnifiedStore,
  UnifiedCreator,
  UnifiedGameSummary,
  GameCatalogFilters,
} from '../../../types/unifiedGame.ts';

const BASE_URL = 'https://api.thegamesdb.net/v1';

export class GMDBGameProvider implements IGameProvider {
  public name: 'GMDB' = 'GMDB';
  private readonly timeoutMs = 7000;

  private genresCache: Map<number, string> = new Map();
  private platformsCache: Map<number, string> = new Map();
  private developersCache: Map<number, string> = new Map();
  private publishersCache: Map<number, string> = new Map();

  private async fetchWithTimeout(url: string, timeout = this.timeoutMs): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  public async healthCheck(credentials?: Record<string, any>): Promise<ProviderHealthResult> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) {
      return { ok: false, latencyMs: 0, error: 'API-ключ GMDB / TheGamesDB не настроен' };
    }

    const start = Date.now();
    try {
      const res = await this.fetchWithTimeout(`${BASE_URL}/API/Limit?apikey=${encodeURIComponent(apiKey)}`, 5000);
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}: Ошибка проверки API ключа GMDB` };
      }
      const json = await res.json();
      const remaining = json?.data?.remaining_monthly_allowance;
      return {
        ok: true,
        latencyMs,
        details: `Подключение к GMDB успешно (Лимит: ${remaining ?? 'N/A'})`,
      };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message || 'Сетевая ошибка GMDB' };
    }
  }

  private async preloadDictionaries(apiKey: string) {
    if (this.genresCache.size > 0 && this.platformsCache.size > 0) return;

    try {
      if (this.genresCache.size === 0) {
        const res = await this.fetchWithTimeout(`${BASE_URL}/Genres?apikey=${encodeURIComponent(apiKey)}`, 4000);
        if (res.ok) {
          const json = await res.json();
          const genres = json?.data?.genres;
          if (genres && typeof genres === 'object') {
            for (const [id, val] of Object.entries(genres)) {
              const g = val as any;
              if (g?.name) this.genresCache.set(Number(id), g.name);
            }
          }
        }
      }

      if (this.platformsCache.size === 0) {
        const res = await this.fetchWithTimeout(`${BASE_URL}/Platforms?apikey=${encodeURIComponent(apiKey)}`, 4000);
        if (res.ok) {
          const json = await res.json();
          const platforms = json?.data?.platforms;
          if (platforms && typeof platforms === 'object') {
            for (const [id, val] of Object.entries(platforms)) {
              const p = val as any;
              if (p?.name) this.platformsCache.set(Number(id), p.name);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[GMDBGameProvider] Dictionary preload warning:', err);
    }
  }

  public async getGame(externalId: string, credentials?: Record<string, any>): Promise<RawGameData | null> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return null;

    await this.preloadDictionaries(apiKey);

    try {
      const url = `${BASE_URL}/Games/ByGameID?id=${encodeURIComponent(externalId)}&apikey=${encodeURIComponent(apiKey)}&fields=players,publishers,developers,genres,overview,last_updated,rating,platform,coop,youtube,alternates&include=boxart,platform`;
      const res = await this.fetchWithTimeout(url);
      if (!res.ok) return null;

      const json = await res.json();
      const games = json?.data?.games;
      if (!Array.isArray(games) || games.length === 0) return null;
      const game = games[0];

      // Fetch all real images from GMDB
      let imagesData: any = null;
      try {
        const imgRes = await this.fetchWithTimeout(`${BASE_URL}/Games/Images?games_id=${encodeURIComponent(externalId)}&apikey=${encodeURIComponent(apiKey)}`, 4000);
        if (imgRes.ok) imagesData = await imgRes.json();
      } catch (_e) {}

      const imgBaseOriginal = imagesData?.data?.base_url?.original || 'https://cdn.thegamesdb.net/images/original/';
      const imgBaseLarge = imagesData?.data?.base_url?.large || imgBaseOriginal;
      const allGameImages = imagesData?.data?.images?.[String(externalId)] || [];

      const frontBoxart = allGameImages.find((img: any) => img.type === 'boxart' && img.side === 'front') ||
        allGameImages.find((img: any) => img.type === 'boxart');
      const posterUrl = frontBoxart?.filename
        ? (frontBoxart.filename.startsWith('http') ? frontBoxart.filename : `${imgBaseLarge}${frontBoxart.filename}`)
        : undefined;

      const fanart = allGameImages.find((img: any) => img.type === 'fanart') ||
        allGameImages.find((img: any) => img.type === 'banner');
      const backdropUrl = fanart?.filename
        ? (fanart.filename.startsWith('http') ? fanart.filename : `${imgBaseOriginal}${fanart.filename}`)
        : posterUrl;

      const screenshots = allGameImages
        .filter((img: any) => (img.type === 'screenshot' || img.type === 'fanart') && img.filename)
        .map((img: any) => ({
          url: img.filename.startsWith('http') ? img.filename : `${imgBaseOriginal}${img.filename}`,
          width: img.resolution ? parseInt(img.resolution.split('x')[0], 10) : undefined,
          height: img.resolution ? parseInt(img.resolution.split('x')[1], 10) : undefined,
        }));

      // Platforms
      const platformData = json?.include?.platform?.data || {};
      const platforms: any[] = [];
      if (game.platform) {
        const pObj = platformData[String(game.platform)];
        const name = pObj?.name || this.platformsCache.get(Number(game.platform)) || 'Platform';
        platforms.push({
          id: game.platform,
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        });
      }

      // Genres
      const genres: any[] = [];
      if (Array.isArray(game.genres)) {
        for (const gId of game.genres) {
          const gName = this.genresCache.get(Number(gId));
          if (gName) {
            genres.push({
              id: gId,
              name: gName,
              slug: gName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            });
          }
        }
      }

      // Developers & Publishers
      const developers: any[] = [];
      if (Array.isArray(game.developers)) {
        for (const dId of game.developers) {
          const dName = `Developer #${dId}`;
          developers.push({
            id: dId,
            name: dName,
            slug: `dev-${dId}`,
          });
        }
      }

      const publishers: any[] = [];
      if (Array.isArray(game.publishers)) {
        for (const pId of game.publishers) {
          const pName = `Publisher #${pId}`;
          publishers.push({
            id: pId,
            name: pName,
            slug: `pub-${pId}`,
          });
        }
      }

      // Videos (e.g. YouTube trailer if available)
      const videos: any[] = [];
      if (game.youtube) {
        videos.push({
          id: `gmdb-yt-${game.id}`,
          title: 'Официальный трейлер / Геймплей',
          url: game.youtube.startsWith('http') ? game.youtube : `https://www.youtube.com/watch?v=${game.youtube}`,
          site: 'YouTube',
          key: game.youtube.replace(/^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=/, ''),
          type: 'Trailer',
        });
      }

      const year = game.release_date ? parseInt(game.release_date.split('-')[0], 10) : undefined;
      const slug = (game.game_title || `game-${game.id}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      return {
        externalId: String(game.id),
        provider: 'GMDB',
        slug,
        title: game.game_title || 'Без названия',
        originalTitle: game.game_title,
        description: game.overview,
        releaseDate: game.release_date || undefined,
        year: !isNaN(year as number) ? year : undefined,
        rating: game.rating ? 8.0 : undefined,
        posterUrl,
        backdropUrl,
        coverUrl: posterUrl,
        genres,
        tags: [],
        platforms,
        developers,
        publishers,
        screenshots,
        videos,
        multiplayer: game.coop || game.players ? {
          coop: game.coop === 'Yes' || game.coop === true,
          players: game.players ? String(game.players) : undefined,
        } : null,
      };
    } catch (err) {
      console.warn(`[GMDBGameProvider] getGame(${externalId}) failed:`, err);
      return null;
    }
  }

  public async searchGames(
    query: string,
    filters?: GameCatalogFilters,
    credentials?: Record<string, any>
  ): Promise<{ results: RawGameData[]; total?: number; hasMore: boolean }> {
    const apiKey = credentials?.apiKey;
    if (!apiKey || !query.trim()) return { results: [], hasMore: false };

    await this.preloadDictionaries(apiKey);

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;

    try {
      const url = `${BASE_URL}/Games/ByGameName?name=${encodeURIComponent(query.trim())}&apikey=${encodeURIComponent(apiKey)}&fields=players,publishers,genres,overview,last_updated,rating,platform,coop,youtube,alternates&include=boxart,platform&page=${page}`;
      const res = await this.fetchWithTimeout(url);
      if (!res.ok) return { results: [], hasMore: false };

      const json = await res.json();
      const games = json?.data?.games;
      if (!Array.isArray(games) || games.length === 0) return { results: [], hasMore: false };

      const boxartData = json?.include?.boxart?.data || {};
      const boxartBase = json?.include?.boxart?.base_url?.medium ||
        json?.include?.boxart?.base_url?.original ||
        'https://cdn.thegamesdb.net/images/medium/';

      const results: RawGameData[] = [];
      const startIndex = Math.max((page - 1) * limit, 0);
      const pagedGames = games.length > limit ? games.slice(startIndex, startIndex + limit) : games;

      for (const game of pagedGames) {
        const gameIdStr = String(game.id);
        const gameBoxarts = boxartData[gameIdStr] || [];
        const frontBoxart = gameBoxarts.find((b: any) => b.side === 'front') || gameBoxarts[0];
        const posterUrl = frontBoxart?.filename
          ? (frontBoxart.filename.startsWith('http') ? frontBoxart.filename : `${boxartBase}${frontBoxart.filename}`)
          : undefined;

        const rawGenres: any[] = [];
        if (Array.isArray(game.genres)) {
          for (const gId of game.genres) {
            const gName = this.genresCache.get(Number(gId));
            if (gName) rawGenres.push({ id: gId, name: gName, slug: gName.toLowerCase().replace(/[^a-z0-9]/g, '-') });
          }
        }

        const year = game.release_date ? parseInt(game.release_date.split('-')[0], 10) : undefined;
        const slug = (game.game_title || `game-${game.id}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        results.push({
          externalId: gameIdStr,
          provider: 'GMDB',
          slug,
          title: game.game_title || 'Без названия',
          originalTitle: game.game_title,
          description: game.overview,
          releaseDate: game.release_date || undefined,
          year: !isNaN(year as number) ? year : undefined,
          rating: game.rating ? 8.0 : undefined,
          posterUrl,
          backdropUrl: posterUrl,
          coverUrl: posterUrl,
          genres: rawGenres,
          tags: [],
          platforms: [],
          developers: [],
          publishers: [],
        });
      }

      const hasMore = games.length > limit ? (startIndex + pagedGames.length) < games.length : games.length >= limit;
      return { results, total: games.length, hasMore };
    } catch (err) {
      console.warn('[GMDBGameProvider] searchGames failed:', err);
      return { results: [], hasMore: false };
    }
  }

  public async getCatalog(
    filters: GameCatalogFilters,
    credentials?: Record<string, any>
  ): Promise<{ results: RawGameData[]; total?: number; hasMore: boolean }> {
    return this.searchGames(filters.query || '', filters, credentials);
  }

  public async getDeveloper(idOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedDeveloper | null> {
    return {
      id: idOrSlug,
      name: `Developer ${idOrSlug}`,
      slug: idOrSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    };
  }

  public async getPublisher(idOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedPublisher | null> {
    return {
      id: idOrSlug,
      name: `Publisher ${idOrSlug}`,
      slug: idOrSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    };
  }

  public async getGamesByDeveloper(): Promise<{ results: RawGameData[]; total?: number; hasMore: boolean }> {
    return { results: [], hasMore: false };
  }

  public async getGamesByPublisher(): Promise<{ results: RawGameData[]; total?: number; hasMore: boolean }> {
    return { results: [], hasMore: false };
  }

  public async getSeries(): Promise<UnifiedSeries | null> {
    return null;
  }

  public async getDLCs(): Promise<UnifiedDLC[]> {
    return [];
  }

  public async getScreenshots(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedScreenshot[]> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return [];

    try {
      const imgRes = await this.fetchWithTimeout(`${BASE_URL}/Games/Images?games_id=${encodeURIComponent(gameIdOrSlug)}&apikey=${encodeURIComponent(apiKey)}`);
      if (!imgRes.ok) return [];
      const imagesData = await imgRes.json();
      const imgBaseOriginal = imagesData?.data?.base_url?.original || 'https://cdn.thegamesdb.net/images/original/';
      const allGameImages = imagesData?.data?.images?.[String(gameIdOrSlug)] || [];

      return allGameImages
        .filter((img: any) => (img.type === 'screenshot' || img.type === 'fanart') && img.filename)
        .map((img: any, idx: number) => ({
          id: `gmdb-ss-${idx}`,
          url: img.filename.startsWith('http') ? img.filename : `${imgBaseOriginal}${img.filename}`,
          thumbnailUrl: img.filename.startsWith('http') ? img.filename : `${imgBaseOriginal}${img.filename}`,
        }));
    } catch (err) {
      console.warn(`[GMDBGameProvider] getScreenshots(${gameIdOrSlug}) failed:`, err);
      return [];
    }
  }

  public async getVideos(): Promise<UnifiedVideo[]> {
    return [];
  }

  public async getStores(): Promise<UnifiedStore[]> {
    return [];
  }

  public async getCreators(): Promise<UnifiedCreator[]> {
    return [];
  }

  public async getSimilar(): Promise<UnifiedGameSummary[]> {
    return [];
  }

  public async getDevelopersList(): Promise<{ results: UnifiedDeveloper[]; total?: number; hasMore: boolean }> {
    return { results: [], hasMore: false };
  }

  public async getPublishersList(): Promise<{ results: UnifiedPublisher[]; total?: number; hasMore: boolean }> {
    return { results: [], hasMore: false };
  }
}
