import { MediaProvider, MediaSearchResult, MediaDetailExtended, ProviderHealthResult } from './types.ts';

interface CacheEntry {
  timestamp: number;
  data: any;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export class OpenLibraryProvider implements MediaProvider {
  name = 'OpenLibrary';
  supportedTypes = ['BOOK', 'COMIC', 'BOARD_GAME'];
  requiresKey = false;

  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  private headers = {
    'User-Agent': 'DodikTracker/1.0 (https://dodik.local; openlibrary-integration)',
    Accept: 'application/json',
  };

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: any) {
    if (this.cache.size > 200) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { timestamp: Date.now(), data });
  }

  async healthCheck(_credentials?: Record<string, any>): Promise<ProviderHealthResult> {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout('https://openlibrary.org/search.json?q=tolkien&limit=1', {
        headers: this.headers,
      }, 5000);
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}: Ошибка OpenLibrary API` };
      }
      return { ok: true, latencyMs, details: 'OpenLibrary API доступен и отвечает корректно' };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message || 'Сетевая ошибка / таймаут' };
    }
  }

  async search(
    query: string,
    _credentials?: Record<string, any>,
    page: number = 1,
    limit: number = 20,
    filters?: import('./types.ts').UnifiedSearchFilters
  ): Promise<import('./types.ts').PaginatedResult<MediaSearchResult>> {
    const trimmedQ = (query || '').trim();
    const cacheKey = `search:${trimmedQ.toLowerCase()}:${page}:${limit}:${JSON.stringify(filters || {})}`;
    const cached = this.getFromCache<import('./types.ts').PaginatedResult<MediaSearchResult>>(cacheKey);
    if (cached) return cached;

    try {
      const params = new URLSearchParams({
        limit: String(limit),
        page: String(page),
        fields: 'key,title,author_name,cover_i,first_publish_year,ratings_average,subject,first_sentence',
      });

      if (trimmedQ) {
        params.set('q', trimmedQ);
      } else if (filters?.genres && filters.genres.length > 0) {
        params.set('subject', filters.genres[0].toLowerCase());
      } else {
        params.set('q', 'bestseller');
      }

      if (filters?.sortBy === 'rating') {
        params.set('sort', 'rating');
      } else if (filters?.sortBy === 'release_date') {
        params.set('sort', filters.sortOrder === 'asc' ? 'old' : 'new');
      }

      const res = await fetchWithTimeout(
        `https://openlibrary.org/search.json?${params.toString()}`,
        { headers: this.headers },
        6000
      );
      if (!res.ok) return { results: [], hasMore: false, page };
      const data = await res.json();
      const results: MediaSearchResult[] = [];

      for (const doc of data.docs || []) {
        const coverUrl = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined;
        const author = Array.isArray(doc.author_name) ? doc.author_name.join(', ') : undefined;
        const title = doc.title || 'Без названия';
        const displayTitle = author ? `${title} (${author})` : title;

        const subjects: string[] = doc.subject || [];
        const isBoardGame = subjects.some((s) => /board game|tabletop|card game/i.test(s));
        const isComic = !isBoardGame && subjects.some((s) => /comic|graphic novel|manga|superhero/i.test(s));

        const description = Array.isArray(doc.first_sentence)
          ? doc.first_sentence[0]
          : typeof doc.first_sentence === 'string'
            ? doc.first_sentence
            : undefined;

        const rating = doc.ratings_average ? Math.round(doc.ratings_average * 2 * 10) / 10 : undefined;
        const year = doc.first_publish_year || undefined;

        // Post-filter
        if (filters?.year && year !== filters.year) continue;
        if (filters?.yearFrom && year && year < filters.yearFrom) continue;
        if (filters?.yearTo && year && year > filters.yearTo) continue;
        if (filters?.ratingFrom !== undefined && rating !== undefined && rating < filters.ratingFrom) continue;
        if (filters?.ratingTo !== undefined && rating !== undefined && rating > filters.ratingTo) continue;

        results.push({
          provider: 'OpenLibrary',
          externalId: doc.key ? doc.key.replace(/^\//, '') : String(doc.cover_i || Math.random()),
          type: isBoardGame ? 'BOARD_GAME' : isComic ? 'COMIC' : 'BOOK',
          title: displayTitle,
          originalTitle: doc.title,
          description,
          posterUrl: coverUrl,
          year,
          rating,
          genres: subjects.slice(0, 4),
        });
      }

      const hasMore = (data.start + (data.docs?.length || 0)) < (data.numFound || 0);
      const paginated = { results, hasMore, page, total: data.numFound };
      this.setCache(cacheKey, paginated);
      return paginated;
    } catch (_err) {
      return cached || { results: [], hasMore: false, page };
    }
  }

  async getDetails(externalId: string, _type?: string, _credentials?: Record<string, any>): Promise<MediaSearchResult & MediaDetailExtended> {
    const cacheKey = `details:${externalId}`;
    const cached = this.getFromCache<MediaSearchResult & MediaDetailExtended>(cacheKey);
    if (cached) return cached;

    try {
      const cleanKey = externalId.startsWith('works/') || externalId.startsWith('books/')
        ? externalId
        : `works/${externalId}`;

      const res = await fetchWithTimeout(`https://openlibrary.org/${cleanKey}.json`, { headers: this.headers }, 6000);
      if (!res.ok) {
        throw new Error(`OpenLibrary returned ${res.status}`);
      }
      const data = await res.json();

      let description: string | undefined;
      if (typeof data.description === 'string') {
        description = data.description;
      } else if (data.description && typeof data.description.value === 'string') {
        description = data.description.value;
      }

      const coverId = Array.isArray(data.covers) && data.covers.length > 0 ? data.covers[0] : undefined;
      const posterUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined;

      const subjects: string[] = data.subjects || [];
      const isComic = subjects.some((s) => /comic|graphic novel|manga|superhero/i.test(s));

      const authorsList: string[] = [];
      if (Array.isArray(data.authors)) {
        for (const a of data.authors) {
          if (a?.author?.key) {
            authorsList.push(a.author.key.replace('/authors/', ''));
          }
        }
      }

      const result: MediaSearchResult & MediaDetailExtended = {
        provider: 'OpenLibrary',
        externalId: cleanKey,
        type: isComic ? 'COMIC' : 'BOOK',
        title: data.title || 'Без названия',
        originalTitle: data.title,
        description,
        posterUrl,
        genres: subjects.slice(0, 5),
        writers: authorsList.length > 0 ? authorsList : undefined,
        tags: subjects.slice(0, 8),
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (_err) {
      if (cached) return cached;
      return {
        provider: 'OpenLibrary',
        externalId,
        type: 'BOOK',
        title: externalId,
      };
    }
  }

  async getTrending(
    type?: string,
    _credentials?: Record<string, any>,
    page: number = 1,
    limit: number = 20
  ): Promise<import('./types.ts').PaginatedResult<MediaSearchResult>> {
    const isComic = type === 'COMIC';
    const isBoardGame = type === 'BOARD_GAME';
    const subject = isBoardGame ? 'board_games' : isComic ? 'graphic_novels' : 'popular';
    const offset = Math.max((page - 1) * limit, 0);
    const cacheKey = `trending:${subject}:${offset}:${limit}`;
    const cached = this.getFromCache<import('./types.ts').PaginatedResult<MediaSearchResult>>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetchWithTimeout(
        `https://openlibrary.org/subjects/${subject}.json?limit=${limit}&offset=${offset}`,
        { headers: this.headers },
        6000
      );
      if (!res.ok) return { results: [], hasMore: false, page };
      const data = await res.json();
      const results: MediaSearchResult[] = [];

      for (const work of data.works || []) {
        const coverUrl = work.cover_id ? `https://covers.openlibrary.org/b/id/${work.cover_id}-L.jpg` : undefined;
        const author = Array.isArray(work.authors) ? work.authors.map((a: any) => a.name).join(', ') : undefined;
        const title = work.title || 'Без названия';
        const displayTitle = author ? `${title} (${author})` : title;

        results.push({
          provider: 'OpenLibrary',
          externalId: work.key ? work.key.replace(/^\//, '') : String(work.cover_id || Math.random()),
          type: isBoardGame ? 'BOARD_GAME' : isComic ? 'COMIC' : 'BOOK',
          title: displayTitle,
          originalTitle: work.title,
          posterUrl: coverUrl,
          year: work.first_publish_year || undefined,
          genres: work.subject?.slice(0, 4) || [subject],
        });
      }

      const hasMore = (offset + (data.works?.length || 0)) < (data.work_count || 0);
      const paginated = { results, hasMore, page, total: data.work_count };
      this.setCache(cacheKey, paginated);
      return paginated;
    } catch (_err) {
      return cached || { results: [], hasMore: false, page };
    }
  }
}
