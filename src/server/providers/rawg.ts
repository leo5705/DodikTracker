import {
  MediaProvider,
  MediaSearchResult,
  ProviderHealthResult,
  MediaDetailExtended,
  CriticScoreInfo,
  SimilarMediaItem,
} from './types.ts';
import { GameTranslator } from '../services/gameTranslator.ts';

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

export class RAWGProvider implements MediaProvider {
  name = 'RAWG';
  supportedTypes = ['GAME'];
  requiresKey = true;

  async healthCheck(credentials?: Record<string, any>): Promise<ProviderHealthResult> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) {
      return { ok: false, latencyMs: 0, error: 'API ключ RAWG не настроен' };
    }

    const start = Date.now();
    try {
      const res = await fetch(`https://api.rawg.io/api/games?key=${apiKey}&page_size=1`);
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}: Ошибка проверки ключа RAWG` };
      }
      return { ok: true, latencyMs, details: 'Подключение к RAWG API успешно' };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message || 'Сетевая ошибка' };
    }
  }

  async search(
    query: string,
    credentials?: Record<string, any>,
    page: number = 1,
    limit: number = 20,
    filters?: import('./types.ts').UnifiedSearchFilters
  ): Promise<import('./types.ts').PaginatedResult<MediaSearchResult>> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return { results: [], hasMore: false, page };

    const trimmedQ = (query || '').trim();
    try {
      const params = new URLSearchParams({
        key: apiKey,
        page: String(page),
        page_size: String(limit),
      });

      if (trimmedQ) {
        params.set('search', trimmedQ);
      }

      // Platforms
      if (filters?.platforms && filters.platforms.length > 0) {
        const platformIds = filters.platforms
          .map((p) => RAWG_PLATFORM_MAP[p.toLowerCase().trim()] || parseInt(p, 10))
          .filter(Boolean);
        if (platformIds.length > 0) {
          params.set('platforms', platformIds.join(','));
        }
      }

      // Genres
      if (filters?.genres && filters.genres.length > 0) {
        const genreSlugs = filters.genres
          .map((g) => RAWG_GENRE_MAP[g.toLowerCase().trim()] || g.toLowerCase().trim())
          .filter(Boolean);
        if (genreSlugs.length > 0) {
          params.set('genres', genreSlugs.join(','));
        }
      }

      // Dates
      if (filters?.year) {
        params.set('dates', `${filters.year}-01-01,${filters.year}-12-31`);
      } else if (filters?.yearFrom || filters?.yearTo) {
        const from = filters.yearFrom ? `${filters.yearFrom}-01-01` : '1970-01-01';
        const to = filters.yearTo ? `${filters.yearTo}-12-31` : '2030-12-31';
        params.set('dates', `${from},${to}`);
      }

      // Metacritic / Rating
      if (filters?.ratingFrom !== undefined || filters?.ratingTo !== undefined) {
        const from = filters.ratingFrom ? Math.round(filters.ratingFrom * 10) : 0;
        const to = filters.ratingTo ? Math.round(filters.ratingTo * 10) : 100;
        params.set('metacritic', `${from},${to}`);
      }

      // Ordering
      if (filters?.sortBy === 'rating') {
        params.set('ordering', filters.sortOrder === 'asc' ? 'rating' : '-rating');
      } else if (filters?.sortBy === 'release_date') {
        params.set('ordering', filters.sortOrder === 'asc' ? 'released' : '-released');
      } else if (filters?.sortBy === 'title') {
        params.set('ordering', 'name');
      } else if (!trimmedQ) {
        params.set('ordering', '-added');
      }

      // Game modes / tags
      if (filters?.gameMode) {
        params.set('tags', filters.gameMode.toLowerCase());
      }

      const res = await fetch(`https://api.rawg.io/api/games?${params.toString()}`);
      if (!res.ok) return { results: [], hasMore: false, page };
      const data = await res.json();
      const results: MediaSearchResult[] = [];

      for (const game of (data.results || [])) {
        const year = game.released ? parseInt(game.released.split('-')[0], 10) : undefined;
        const rawGenres = (game.genres || []).map((g: any) => g.name);

        const translation = await GameTranslator.translateGame({
          provider: 'RAWG',
          externalId: String(game.id),
          title: game.name || 'Без названия',
          genres: rawGenres,
        });

        results.push({
          provider: 'RAWG',
          externalId: String(game.id),
          type: 'GAME',
          title: translation.title,
          originalTitle: game.name || undefined,
          posterUrl: game.background_image || undefined,
          backdropUrl: game.background_image || undefined,
          coverUrl: game.background_image || undefined,
          releaseDate: game.released || undefined,
          year,
          rating: game.rating ? Math.round(game.rating * 2 * 10) / 10 : undefined,
          genres: translation.genres,
          platforms: (game.platforms || []).map((p: any) => p.platform?.name).filter(Boolean),
        });
      }

      const hasMore = Boolean(data.next);
      return { results, hasMore, page, total: data.count };
    } catch (err) {
      console.error('RAWG search error:', err);
      return { results: [], hasMore: false, page };
    }
  }

  async getTrending(
    _type?: string,
    credentials?: Record<string, any>,
    page: number = 1,
    limit: number = 20,
    filters?: import('./types.ts').UnifiedSearchFilters
  ): Promise<import('./types.ts').PaginatedResult<MediaSearchResult>> {
    return this.search('', credentials, page, limit, filters);
  }

  async getDetails(
    externalId: string,
    _type?: string,
    credentials?: Record<string, any>
  ): Promise<(MediaSearchResult & MediaDetailExtended) | null> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return null;

    try {
      const res = await fetch(`https://api.rawg.io/api/games/${externalId}?key=${apiKey}`);
      if (!res.ok) return null;
      const data = await res.json();

      const year = data.released ? parseInt(data.released.split('-')[0], 10) : undefined;
      const cleanDesc = data.description_raw || (data.description ? data.description.replace(/<[^>]*>/g, '') : undefined);
      const developers = (data.developers || []).map((d: any) => d.name);
      const publishers = (data.publishers || []).map((p: any) => p.name);
      const platforms = (data.platforms || []).map((p: any) => p.platform?.name).filter(Boolean);
      const rawGenres = (data.genres || []).map((g: any) => g.name);
      const rawTags = (data.tags || []).slice(0, 15).map((t: any) => t.name);

      // Critic score from Metacritic if available
      const criticScore: CriticScoreInfo | null = data.metacritic
        ? {
            source: 'Metacritic',
            score: data.metacritic,
            max: 100,
          }
        : null;

      // Fetch screenshots
      let screenshots: string[] = [];
      try {
        const ssRes = await fetch(`https://api.rawg.io/api/games/${externalId}/screenshots?key=${apiKey}`);
        if (ssRes.ok) {
          const ssData = await ssRes.json();
          screenshots = (ssData.results || []).map((s: any) => s.image).filter(Boolean);
        }
      } catch (_e) {}

      // Fetch movies / trailers
      const videos: any[] = [];
      let trailerUrl: string | undefined;
      try {
        const moviesRes = await fetch(`https://api.rawg.io/api/games/${externalId}/movies?key=${apiKey}`);
        if (moviesRes.ok) {
          const moviesData = await moviesRes.json();
          for (const movie of (moviesData.results || [])) {
            const videoUrl = movie.data?.max || movie.data?.['480'];
            if (videoUrl) {
              if (!trailerUrl) trailerUrl = videoUrl;
              videos.push({
                id: movie.id,
                title: movie.name || 'Официальный ролик / трейлер',
                url: videoUrl,
                site: 'RAWG Video',
                type: 'Trailer',
              });
            }
          }
        }
      } catch (_e) {}

      // Fetch series / similar
      let similar: SimilarMediaItem[] = [];
      try {
        const seriesRes = await fetch(`https://api.rawg.io/api/games/${externalId}/game-series?key=${apiKey}&page_size=8`);
        if (seriesRes.ok) {
          const seriesData = await seriesRes.json();
          similar = (seriesData.results || []).map((g: any) => ({
            externalId: String(g.id),
            provider: 'RAWG',
            type: 'GAME',
            title: GameTranslator.translateTitleOnly(g.name || 'Без названия'),
            originalTitle: g.name,
            posterUrl: g.background_image || undefined,
            year: g.released ? parseInt(g.released.split('-')[0], 10) : undefined,
            rating: g.rating ? Math.round(g.rating * 2 * 10) / 10 : undefined,
          }));
        }

        if (similar.length === 0) {
          const sugRes = await fetch(`https://api.rawg.io/api/games/${externalId}/suggested?key=${apiKey}&page_size=8`);
          if (sugRes.ok) {
            const sugData = await sugRes.json();
            similar = (sugData.results || []).map((g: any) => ({
              externalId: String(g.id),
              provider: 'RAWG',
              type: 'GAME',
              title: GameTranslator.translateTitleOnly(g.name || 'Без названия'),
              originalTitle: g.name,
              posterUrl: g.background_image || undefined,
              year: g.released ? parseInt(g.released.split('-')[0], 10) : undefined,
              rating: g.rating ? Math.round(g.rating * 2 * 10) / 10 : undefined,
            }));
          }
        }
      } catch (_e) {}

      // Apply Russian translation layer
      const translation = await GameTranslator.translateGame({
        provider: 'RAWG',
        externalId: String(data.id),
        title: data.name || 'Без названия',
        description: cleanDesc,
        genres: rawGenres,
        tags: rawTags,
        alternates: Array.isArray(data.alternative_names) ? data.alternative_names : [],
      });

      return {
        provider: 'RAWG',
        externalId: String(data.id),
        type: 'GAME',
        title: translation.title,
        originalTitle: data.name || undefined,
        description: translation.description,
        posterUrl: data.background_image || undefined,
        backdropUrl: data.background_image_additional || data.background_image || undefined,
        coverUrl: data.background_image || undefined,
        releaseDate: data.released || undefined,
        year,
        genres: translation.genres,
        rating: data.rating ? Math.round(data.rating * 2 * 10) / 10 : undefined,
        developers: developers.length > 0 ? developers : undefined,
        publishers: publishers.length > 0 ? publishers : undefined,
        platforms: platforms.length > 0 ? platforms : undefined,
        tags: translation.tags.length > 0 ? translation.tags : undefined,
        screenshots: screenshots.length > 0 ? screenshots : undefined,
        videos: videos.length > 0 ? videos : undefined,
        trailerUrl,
        criticScore,
        website: data.website || undefined,
        similar,
        statusText: year ? `Вышла в ${year}` : 'Выпущена',
        sourceText: 'RAWG Video Games Database',
      };
    } catch (err) {
      console.error('RAWG getDetails error:', err);
      return null;
    }
  }
}
