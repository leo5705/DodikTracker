import { MediaProvider, MediaSearchResult, ProviderHealthResult, UnifiedSearchFilters, PaginatedResult } from './types.ts';

export class KinopoiskProvider implements MediaProvider {
  name = 'Kinopoisk';
  supportedTypes = ['MOVIE', 'TV'];
  requiresKey = true;

  async healthCheck(credentials?: Record<string, any>): Promise<ProviderHealthResult> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) {
      return { ok: false, latencyMs: 0, error: 'API ключ Kinopoisk не настроен' };
    }

    const start = Date.now();
    try {
      const res = await fetch('https://kinopoiskapiunofficial.tech/api/v2.2/films/collections?type=TOP_POPULAR_ALL&page=1', {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}: Ошибка проверки ключа Кинопоиск` };
      }
      return { ok: true, latencyMs, details: 'Подключение к Кинопоиск API успешно' };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message || 'Сетевая ошибка' };
    }
  }

  async search(
    query: string,
    credentials?: Record<string, any>,
    page: number = 1,
    _limit: number = 20,
    filters?: UnifiedSearchFilters
  ): Promise<PaginatedResult<MediaSearchResult>> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return { results: [], hasMore: false, page };

    const trimmedQ = (query || '').trim();
    const hasFilters = Boolean(
      filters &&
        (filters.genres?.length ||
          filters.countries?.length ||
          filters.year ||
          filters.yearFrom ||
          filters.yearTo ||
          filters.ratingFrom ||
          filters.ratingTo ||
          filters.votesFrom ||
          filters.sortBy ||
          filters.type)
    );

    try {
      let url: string;
      const headers = {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      };

      if (hasFilters) {
        const params = new URLSearchParams({ page: String(page) });
        if (trimmedQ) params.set('keyword', trimmedQ);
        if (filters?.year) {
          params.set('yearFrom', String(filters.year));
          params.set('yearTo', String(filters.year));
        } else {
          if (filters?.yearFrom) params.set('yearFrom', String(filters.yearFrom));
          if (filters?.yearTo) params.set('yearTo', String(filters.yearTo));
        }
        if (filters?.ratingFrom !== undefined) params.set('ratingFrom', String(filters.ratingFrom));
        if (filters?.ratingTo !== undefined) params.set('ratingTo', String(filters.ratingTo));
        if (filters?.type === 'TV') params.set('type', 'TV_SERIES');
        else if (filters?.type === 'MOVIE') params.set('type', 'FILM');
        else params.set('type', 'ALL');

        if (filters?.sortBy === 'rating') params.set('order', 'RATING');
        else if (filters?.sortBy === 'votes') params.set('order', 'NUM_VOTE');
        else if (filters?.sortBy === 'release_date') params.set('order', 'YEAR');

        url = `https://kinopoiskapiunofficial.tech/api/v2.2/films?${params.toString()}`;
      } else if (trimmedQ) {
        url = `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(trimmedQ)}&page=${page}`;
      } else {
        url = `https://kinopoiskapiunofficial.tech/api/v2.2/films/collections?type=TOP_POPULAR_ALL&page=${page}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) return { results: [], hasMore: false, page };
      const data = await res.json();
      const results: MediaSearchResult[] = [];

      const rawItems = data.items || data.films || [];
      for (const film of rawItems) {
        const isTv = film.type === 'TV_SERIES' || film.type === 'MINI_SERIES';
        const ratingVal = film.ratingKinopoisk || film.ratingImdb || (film.rating && film.rating !== 'null' ? parseFloat(film.rating) : undefined);
        const yearVal = film.year ? parseInt(String(film.year), 10) : undefined;

        results.push({
          provider: 'Kinopoisk',
          externalId: String(film.kinopoiskId || film.filmId),
          type: isTv ? 'TV' : 'MOVIE',
          title: film.nameRu || film.nameEn || film.nameOriginal || 'Без названия',
          originalTitle: film.nameEn || film.nameOriginal || undefined,
          description: film.shortDescription || film.description || undefined,
          posterUrl: film.posterUrlPreview || film.posterUrl,
          year: yearVal,
          rating: ratingVal ? Math.round(Number(ratingVal) * 10) / 10 : undefined,
        });
      }

      const totalPages = data.totalPages || data.pagesCount || 1;
      const hasMore = page < totalPages;
      return { results, hasMore, page, total: totalPages };
    } catch (err) {
      console.error('Kinopoisk search error:', err);
      return { results: [], hasMore: false, page };
    }
  }

  async getTrending(
    type: string = 'MOVIE',
    credentials?: Record<string, any>,
    page: number = 1,
    limit: number = 20,
    filters?: UnifiedSearchFilters
  ): Promise<PaginatedResult<MediaSearchResult>> {
    return this.search('', credentials, page, limit, { ...filters, type });
  }
}
