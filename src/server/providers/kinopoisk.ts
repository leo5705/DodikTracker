import { MediaProvider, MediaSearchResult, ProviderHealthResult, UnifiedSearchFilters, PaginatedResult, MediaVideoItem } from './types.ts';

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

  async getDetails(
    externalId: string,
    _type?: string,
    credentials?: Record<string, any>
  ): Promise<(MediaSearchResult & import('./types.ts').MediaDetailExtended) | null> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return null;

    try {
      const url = `https://kinopoiskapiunofficial.tech/api/v2.2/films/${externalId}`;
      const res = await fetch(url, {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) return null;
      const film = await res.json();

      const isTv = film.type === 'TV_SERIES' || film.type === 'MINI_SERIES' || film.type === 'TV_SHOW';
      const ratingVal = film.ratingKinopoisk || film.ratingImdb || (film.rating && film.rating !== 'null' ? parseFloat(film.rating) : undefined);
      const yearVal = film.year ? parseInt(String(film.year), 10) : undefined;

      let ageRating: string | undefined;
      if (film.ratingAgeLimits) {
        const num = film.ratingAgeLimits.replace(/age/i, '');
        ageRating = `${num}+`;
      } else if (film.ratingMpaa) {
        ageRating = String(film.ratingMpaa).toUpperCase();
      }

      const genres = (film.genres || []).map((g: any) => g.genre).filter(Boolean);
      const countries = (film.countries || []).map((c: any) => c.country).filter(Boolean);

      // Fetch official videos / trailers from Kinopoisk Unofficial API
      const videos: MediaVideoItem[] = [];
      let trailerUrl: string | undefined;

      try {
        const vUrl = `https://kinopoiskapiunofficial.tech/api/v2.2/films/${externalId}/videos`;
        const vRes = await fetch(vUrl, {
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
          },
        });
        if (vRes.ok) {
          const vData = await vRes.json();
          const items = Array.isArray(vData.items) ? vData.items : [];
          for (const item of items) {
            if (!item.url) continue;
            const name = item.name || '';
            const lowerName = name.toLowerCase();
            const isTrailer = lowerName.includes('трейлер') || lowerName.includes('trailer');
            const isTeaser = lowerName.includes('тизер') || lowerName.includes('teaser');
            const type = isTrailer ? 'Trailer' : isTeaser ? 'Teaser' : 'Clip';

            let embedUrl: string | undefined;
            let key: string | undefined;
            const site = item.site === 'YOUTUBE' ? 'YouTube' : item.site || 'Video';

            if (site === 'YouTube' || item.url.includes('youtube') || item.url.includes('youtu.be')) {
              const ytMatch = item.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
              if (ytMatch && ytMatch[1]) {
                key = ytMatch[1];
                embedUrl = `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0`;
              }
            }

            videos.push({
              title: name || (isTrailer ? 'Официальный трейлер' : 'Видеоролик'),
              url: item.url,
              embedUrl,
              site,
              key,
              type,
              thumbnailUrl: key ? `https://img.youtube.com/vi/${key}/hqdefault.jpg` : undefined,
              official: true,
            });
          }

          const mainTrailer = videos.find((v) => v.type === 'Trailer') || videos[0];
          trailerUrl = mainTrailer?.url;
        }
      } catch (_e) {}

      return {
        provider: 'Kinopoisk',
        externalId: String(film.kinopoiskId || film.filmId || externalId),
        type: isTv ? 'TV' : 'MOVIE',
        title: film.nameRu || film.nameEn || film.nameOriginal || 'Без названия',
        originalTitle: film.nameEn || film.nameOriginal || undefined,
        description: film.description || film.shortDescription || undefined,
        posterUrl: film.posterUrl || film.posterUrlPreview,
        backdropUrl: film.coverUrl || film.posterUrl,
        year: yearVal,
        rating: ratingVal ? Math.round(Number(ratingVal) * 10) / 10 : undefined,
        ageRating,
        countries,
        genres,
        videos: videos.length > 0 ? videos : undefined,
        trailerUrl,
        runtimeMinutes: film.filmLength || undefined,
        statusText: film.completed ? 'Завершён' : yearVal ? `Выпущен в ${yearVal}` : 'Выпущен',
        sourceText: 'Кинопоиск',
      };
    } catch (err) {
      console.error('Kinopoisk getDetails error:', err);
      return null;
    }
  }
}
