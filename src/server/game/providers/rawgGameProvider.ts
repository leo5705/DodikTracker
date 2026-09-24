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
import { deduplicateAndNormalizeStores } from '../../../utils/storeNormalizer.ts';

const RAWG_PLATFORM_MAP: Record<string, number> = {
  pc: 4,
  ps5: 187,
  'playstation 5': 187,
  ps4: 18,
  'playstation 4': 18,
  'xbox series': 186,
  'xbox series x': 186,
  'xbox one': 1,
  'nintendo switch': 7,
  switch: 7,
  ios: 3,
  android: 21,
  macos: 5,
  linux: 6,
};

const RAWG_GENRE_MAP: Record<string, string> = {
  экшен: 'action',
  action: 'action',
  боевик: 'action',
  приключения: 'adventure',
  adventure: 'adventure',
  рпг: 'role-playing-games-rpg',
  ролевая: 'role-playing-games-rpg',
  rpg: 'role-playing-games-rpg',
  стратегия: 'strategy',
  strategy: 'strategy',
  шутер: 'shooter',
  shooter: 'shooter',
  симулятор: 'simulation',
  simulation: 'simulation',
  гонки: 'racing',
  racing: 'racing',
  спорт: 'sports',
  sports: 'sports',
  хоррор: 'horror',
  ужасы: 'horror',
  инди: 'indie',
  indie: 'indie',
  головоломка: 'puzzle',
  puzzle: 'puzzle',
  платформер: 'platformer',
  ммо: 'massively-multiplayer',
};

export class RAWGGameProvider implements IGameProvider {
  public name: 'RAWG' = 'RAWG';
  private readonly baseUrl = 'https://api.rawg.io/api';
  private readonly timeoutMs = 7000;

  private async fetchWithTimeout(url: string, timeout = this.timeoutMs): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  public async healthCheck(credentials?: Record<string, any>): Promise<ProviderHealthResult> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) {
      return { ok: false, latencyMs: 0, error: 'API-ключ RAWG не настроен' };
    }

    const start = Date.now();
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/games?key=${apiKey}&page_size=1`, 5000);
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}: Ошибка проверки ключа RAWG` };
      }
      return { ok: true, latencyMs, details: 'Подключение к RAWG API активно' };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message || 'Сетевая ошибка RAWG' };
    }
  }

  public async getGame(externalId: string, credentials?: Record<string, any>): Promise<RawGameData | null> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return null;

    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/games/${encodeURIComponent(externalId)}?key=${apiKey}`);
      if (!res.ok) return null;
      const data = await res.json();

      const year = data.released ? parseInt(data.released.split('-')[0], 10) : undefined;
      const cleanDesc = data.description_raw || (data.description ? data.description.replace(/<[^>]*>/g, '') : undefined);

      const platforms = (data.platforms || []).map((p: any) => {
        const reqObj = p.requirements_ru || p.requirements_en || p.requirements || {};
        const minReq =
          reqObj.minimum ||
          p.requirements?.minimum ||
          p.requirements_en?.minimum ||
          p.requirements_ru?.minimum ||
          undefined;
        const recReq =
          reqObj.recommended ||
          p.requirements?.recommended ||
          p.requirements_en?.recommended ||
          p.requirements_ru?.recommended ||
          undefined;

        return {
          id: p.platform?.id,
          name: p.platform?.name || 'Unknown',
          slug: p.platform?.slug,
          releasedAt: p.released_at,
          requirements: (minReq || recReq) ? {
            minimum: minReq,
            recommended: recReq,
          } : undefined,
        };
      });

      const developers = (data.developers || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        slug: d.slug || String(d.id),
        image: d.image_background,
      }));

      const publishers = (data.publishers || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug || String(p.id),
        image: p.image_background,
      }));

      const genres = (data.genres || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
      }));

      const tags = (data.tags || []).slice(0, 20).map((t: any) => t.name);

      const stores = deduplicateAndNormalizeStores(
        (data.stores || []).map((s: any) => ({
          id: s.store?.id || s.id,
          name: s.store?.name || 'Store',
          domain: s.store?.domain,
          url: s.url,
          storeId: s.store?.id ? String(s.store.id) : undefined,
        }))
      );

      return {
        externalId: String(data.id),
        provider: 'RAWG',
        slug: data.slug || String(data.id),
        title: data.name || 'Без названия',
        originalTitle: data.name_original || data.name,
        description: cleanDesc,
        releaseDate: data.released,
        year,
        rating: data.rating ? Math.round(data.rating * 2 * 10) / 10 : undefined,
        ratingCount: data.ratings_count,
        metacritic: data.metacritic ?? null,
        metacriticUrl: data.metacritic_url ?? null,
        ageRating: data.esrb_rating?.name ?? null,
        posterUrl: data.background_image,
        backdropUrl: data.background_image_additional || data.background_image,
        coverUrl: data.background_image,
        website: data.website || null,
        playtime: data.playtime || null,
        genres,
        tags,
        platforms,
        developers,
        publishers,
        stores,
      };
    } catch (err) {
      console.warn(`[RAWGGameProvider] getGame(${externalId}) failed:`, err);
      return null;
    }
  }

  public async searchGames(
    query: string,
    filters?: GameCatalogFilters,
    credentials?: Record<string, any>
  ): Promise<{ results: RawGameData[]; total?: number; hasMore: boolean }> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return { results: [], hasMore: false };

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const trimmedQ = (query || '').trim();

    try {
      const params = new URLSearchParams({
        key: apiKey,
        page: String(page),
        page_size: String(limit),
      });

      if (trimmedQ) params.set('search', trimmedQ);

      if (filters?.developer) params.set('developers', filters.developer.toLowerCase().trim());
      if (filters?.publisher) params.set('publishers', filters.publisher.toLowerCase().trim());

      if (filters?.genre) {
        const slug = RAWG_GENRE_MAP[filters.genre.toLowerCase().trim()] || filters.genre.toLowerCase().trim();
        params.set('genres', slug);
      }

      if (filters?.platform) {
        const pId = RAWG_PLATFORM_MAP[filters.platform.toLowerCase().trim()];
        if (pId) params.set('platforms', String(pId));
      }

      if (filters?.sortBy === 'trending') {
        const today = new Date();
        const oneYearAgoStr = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const sixMonthsAheadStr = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        params.set('dates', `${oneYearAgoStr},${sixMonthsAheadStr}`);
      } else if (filters?.year) {
        params.set('dates', `${filters.year}-01-01,${filters.year}-12-31`);
      } else if (filters?.yearFrom || filters?.yearTo) {
        const from = filters.yearFrom ? `${filters.yearFrom}-01-01` : '1970-01-01';
        const to = filters.yearTo ? `${filters.yearTo}-12-31` : '2030-12-31';
        params.set('dates', `${from},${to}`);
      }

      if (filters?.ratingFrom !== undefined || filters?.ratingTo !== undefined) {
        const from = filters.ratingFrom ? Math.round(filters.ratingFrom * 10) : 0;
        const to = filters.ratingTo ? Math.round(filters.ratingTo * 10) : 100;
        params.set('metacritic', `${from},${to}`);
      }

      if (filters?.sortBy === 'trending') {
        const today = new Date();
        const oneYearAgoStr = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const sixMonthsAheadStr = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        params.set('dates', `${oneYearAgoStr},${sixMonthsAheadStr}`);
        params.set('ordering', '-added');
      } else if (filters?.sortBy === 'rating') {
        params.set('ordering', filters.sortOrder === 'asc' ? 'rating' : '-rating');
      } else if (filters?.sortBy === 'release_date') {
        params.set('ordering', filters.sortOrder === 'asc' ? 'released' : '-released');
      } else if (filters?.sortBy === 'name') {
        params.set('ordering', 'name');
      } else if (!trimmedQ) {
        params.set('ordering', '-added');
      }

      const res = await this.fetchWithTimeout(`${this.baseUrl}/games?${params.toString()}`);
      if (!res.ok) return { results: [], hasMore: false };
      const data = await res.json();

      const results: RawGameData[] = (data.results || []).map((g: any) => {
        const year = g.released ? parseInt(g.released.split('-')[0], 10) : undefined;
        return {
          externalId: String(g.id),
          provider: 'RAWG',
          slug: g.slug || String(g.id),
          title: g.name || 'Без названия',
          originalTitle: g.name,
          releaseDate: g.released,
          year,
          rating: g.rating ? Math.round(g.rating * 2 * 10) / 10 : undefined,
          ratingCount: g.ratings_count,
          metacritic: g.metacritic ?? null,
          posterUrl: g.background_image,
          backdropUrl: g.background_image,
          coverUrl: g.background_image,
          genres: (g.genres || []).map((genre: any) => ({
            id: genre.id,
            name: genre.name,
            slug: genre.slug,
          })),
          tags: (g.tags || []).slice(0, 10).map((t: any) => t.name),
          platforms: (g.platforms || []).map((p: any) => ({
            id: p.platform?.id,
            name: p.platform?.name,
            slug: p.platform?.slug,
          })),
          developers: [],
          publishers: [],
        };
      });

      return { results, total: data.count, hasMore: Boolean(data.next) };
    } catch (err) {
      console.warn('[RAWGGameProvider] searchGames failed:', err);
      return { results: [], hasMore: false };
    }
  }

  public async getCatalog(
    filters: GameCatalogFilters,
    credentials?: Record<string, any>
  ): Promise<{ results: RawGameData[]; total?: number; hasMore: boolean }> {
    return this.searchGames('', filters, credentials);
  }

  public async getDeveloper(idOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedDeveloper | null> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return null;

    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/developers/${encodeURIComponent(idOrSlug)}?key=${apiKey}`);
      if (!res.ok) return null;
      const data = await res.json();

      const cleanDesc = data.description ? data.description.replace(/<[^>]*>/g, '') : undefined;

      return {
        id: String(data.id),
        name: data.name,
        slug: data.slug || String(data.id),
        image: data.image_background,
        backdropUrl: data.image_background,
        description: cleanDesc,
        gamesCount: data.games_count,
      };
    } catch (err) {
      console.warn(`[RAWGGameProvider] getDeveloper(${idOrSlug}) failed:`, err);
      return null;
    }
  }

  public async getPublisher(idOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedPublisher | null> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return null;

    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/publishers/${encodeURIComponent(idOrSlug)}?key=${apiKey}`);
      if (!res.ok) return null;
      const data = await res.json();

      const cleanDesc = data.description ? data.description.replace(/<[^>]*>/g, '') : undefined;

      return {
        id: String(data.id),
        name: data.name,
        slug: data.slug || String(data.id),
        image: data.image_background,
        backdropUrl: data.image_background,
        description: cleanDesc,
        gamesCount: data.games_count,
      };
    } catch (err) {
      console.warn(`[RAWGGameProvider] getPublisher(${idOrSlug}) failed:`, err);
      return null;
    }
  }

  public async getGamesByDeveloper(
    developerIdOrSlug: string,
    page = 1,
    limit = 20,
    sort?: string,
    credentials?: Record<string, any>
  ): Promise<{ results: RawGameData[]; total?: number; hasMore: boolean }> {
    return this.searchGames('', {
      developer: developerIdOrSlug,
      page,
      limit,
      sortBy: (sort as any) || 'popularity',
    }, credentials);
  }

  public async getGamesByPublisher(
    publisherIdOrSlug: string,
    page = 1,
    limit = 20,
    sort?: string,
    credentials?: Record<string, any>
  ): Promise<{ results: RawGameData[]; total?: number; hasMore: boolean }> {
    return this.searchGames('', {
      publisher: publisherIdOrSlug,
      page,
      limit,
      sortBy: (sort as any) || 'popularity',
    }, credentials);
  }

  public async getSeries(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedSeries | null> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return null;

    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/games/${encodeURIComponent(gameIdOrSlug)}/game-series?key=${apiKey}&page_size=15`);
      if (!res.ok) return null;
      const data = await res.json();

      const results = data.results || [];
      if (results.length === 0) return null;

      const games: UnifiedGameSummary[] = results.map((g: any) => ({
        id: String(g.id),
        slug: g.slug || String(g.id),
        title: g.name,
        originalTitle: g.name,
        posterUrl: g.background_image,
        coverUrl: g.background_image,
        backdropUrl: g.background_image,
        releaseDate: g.released,
        year: g.released ? parseInt(g.released.split('-')[0], 10) : undefined,
        rating: g.rating ? Math.round(g.rating * 2 * 10) / 10 : undefined,
        metacritic: g.metacritic ?? null,
        genres: (g.genres || []).map((x: any) => x.name),
        platforms: (g.platforms || []).map((x: any) => x.platform?.name).filter(Boolean),
      }));

      return {
        id: `series-${gameIdOrSlug}`,
        name: `Серия ${games[0]?.title || ''}`,
        slug: `series-${gameIdOrSlug}`,
        gamesCount: data.count || games.length,
        games,
      };
    } catch (err) {
      console.warn(`[RAWGGameProvider] getSeries(${gameIdOrSlug}) failed:`, err);
      return null;
    }
  }

  public async getDLCs(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedDLC[]> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return [];

    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/games/${encodeURIComponent(gameIdOrSlug)}/additions?key=${apiKey}&page_size=20`);
      if (!res.ok) return [];
      const data = await res.json();

      return (data.results || []).map((d: any) => ({
        id: String(d.id),
        title: d.name,
        slug: d.slug,
        coverUrl: d.background_image,
        releaseDate: d.released,
        rating: d.rating ? Math.round(d.rating * 2 * 10) / 10 : undefined,
        type: 'DLC / Дополнение',
      }));
    } catch (err) {
      console.warn(`[RAWGGameProvider] getDLCs(${gameIdOrSlug}) failed:`, err);
      return [];
    }
  }

  public async getScreenshots(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedScreenshot[]> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return [];

    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/games/${encodeURIComponent(gameIdOrSlug)}/screenshots?key=${apiKey}`);
      if (!res.ok) return [];
      const data = await res.json();

      return (data.results || []).map((s: any) => ({
        id: String(s.id),
        url: s.image,
        thumbnailUrl: s.image,
        width: s.width,
        height: s.height,
        isPrimary: s.is_deleted === false,
      }));
    } catch (err) {
      console.warn(`[RAWGGameProvider] getScreenshots(${gameIdOrSlug}) failed:`, err);
      return [];
    }
  }

  public async getVideos(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedVideo[]> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return [];

    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/games/${encodeURIComponent(gameIdOrSlug)}/movies?key=${apiKey}`);
      if (!res.ok) return [];
      const data = await res.json();

      return (data.results || []).map((m: any) => {
        const videoUrl = m.data?.max || m.data?.[480] || m.clip;
        return {
          id: String(m.id),
          title: m.name || 'Официальный трейлер',
          url: videoUrl,
          site: 'RAWG',
          type: 'Trailer',
          thumbnailUrl: m.preview,
        };
      }).filter((v: UnifiedVideo) => Boolean(v.url));
    } catch (err) {
      console.warn(`[RAWGGameProvider] getVideos(${gameIdOrSlug}) failed:`, err);
      return [];
    }
  }

  public async getStores(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedStore[]> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return [];

    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/games/${encodeURIComponent(gameIdOrSlug)}/stores?key=${apiKey}`);
      if (!res.ok) return [];
      const data = await res.json();

      return deduplicateAndNormalizeStores(
        (data.results || []).map((s: any) => ({
          id: String(s.id),
          name: s.store_id ? `Store #${s.store_id}` : 'Store',
          url: s.url,
          storeId: String(s.store_id),
        }))
      );
    } catch (err) {
      console.warn(`[RAWGGameProvider] getStores(${gameIdOrSlug}) failed:`, err);
      return [];
    }
  }

  public async getCreators(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedCreator[]> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return [];

    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/games/${encodeURIComponent(gameIdOrSlug)}/development-team?key=${apiKey}&page_size=15`);
      if (!res.ok) return [];
      const data = await res.json();

      return (data.results || []).map((c: any) => ({
        id: String(c.id),
        name: c.name,
        slug: c.slug,
        role: (c.positions || []).map((p: any) => p.name).join(', ') || 'Developer',
        image: c.image,
        gamesCount: c.games_count,
      }));
    } catch (err) {
      console.warn(`[RAWGGameProvider] getCreators(${gameIdOrSlug}) failed:`, err);
      return [];
    }
  }

  public async getSimilar(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedGameSummary[]> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return [];

    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/games/${encodeURIComponent(gameIdOrSlug)}/suggested?key=${apiKey}&page_size=8`);
      if (!res.ok) return [];
      const data = await res.json();

      return (data.results || []).map((g: any) => ({
        id: String(g.id),
        slug: g.slug || String(g.id),
        title: g.name,
        originalTitle: g.name,
        posterUrl: g.background_image,
        coverUrl: g.background_image,
        releaseDate: g.released,
        year: g.released ? parseInt(g.released.split('-')[0], 10) : undefined,
        rating: g.rating ? Math.round(g.rating * 2 * 10) / 10 : undefined,
        metacritic: g.metacritic ?? null,
        genres: (g.genres || []).map((x: any) => x.name),
        platforms: (g.platforms || []).map((x: any) => x.platform?.name).filter(Boolean),
      }));
    } catch (err) {
      console.warn(`[RAWGGameProvider] getSimilar(${gameIdOrSlug}) failed:`, err);
      return [];
    }
  }

  public async getDevelopersList(
    page = 1,
    limit = 20,
    search?: string,
    credentials?: Record<string, any>
  ): Promise<{ results: UnifiedDeveloper[]; total?: number; hasMore: boolean }> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return { results: [], hasMore: false };

    try {
      const params = new URLSearchParams({
        key: apiKey,
        page: String(page),
        page_size: String(limit),
      });
      if (search?.trim()) params.set('search', search.trim());

      const res = await this.fetchWithTimeout(`${this.baseUrl}/developers?${params.toString()}`);
      if (!res.ok) return { results: [], hasMore: false };
      const data = await res.json();

      const results: UnifiedDeveloper[] = (data.results || []).map((d: any) => ({
        id: String(d.id),
        name: d.name,
        slug: d.slug || String(d.id),
        image: d.image_background,
        backdropUrl: d.image_background,
        gamesCount: d.games_count,
        topGames: (d.games || []).slice(0, 4).map((g: any) => ({
          id: String(g.id),
          slug: g.slug || String(g.id),
          title: g.name,
          rating: g.rating,
        })),
      }));

      return { results, total: data.count, hasMore: Boolean(data.next) };
    } catch (err) {
      console.warn('[RAWGGameProvider] getDevelopersList failed:', err);
      return { results: [], hasMore: false };
    }
  }

  public async getPublishersList(
    page = 1,
    limit = 20,
    search?: string,
    credentials?: Record<string, any>
  ): Promise<{ results: UnifiedPublisher[]; total?: number; hasMore: boolean }> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return { results: [], hasMore: false };

    try {
      const params = new URLSearchParams({
        key: apiKey,
        page: String(page),
        page_size: String(limit),
      });
      if (search?.trim()) params.set('search', search.trim());

      const res = await this.fetchWithTimeout(`${this.baseUrl}/publishers?${params.toString()}`);
      if (!res.ok) return { results: [], hasMore: false };
      const data = await res.json();

      const results: UnifiedPublisher[] = (data.results || []).map((p: any) => ({
        id: String(p.id),
        name: p.name,
        slug: p.slug || String(p.id),
        image: p.image_background,
        backdropUrl: p.image_background,
        gamesCount: p.games_count,
        topGames: (p.games || []).slice(0, 4).map((g: any) => ({
          id: String(g.id),
          slug: g.slug || String(g.id),
          title: g.name,
          rating: g.rating,
        })),
      }));

      return { results, total: data.count, hasMore: Boolean(data.next) };
    } catch (err) {
      console.warn('[RAWGGameProvider] getPublishersList failed:', err);
      return { results: [], hasMore: false };
    }
  }
}
