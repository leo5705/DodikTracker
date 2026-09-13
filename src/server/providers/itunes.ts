import {
  MediaProvider,
  MediaSearchResult,
  ProviderHealthResult,
  MediaDetailExtended,
} from './types.ts';

export class ITunesProvider implements MediaProvider {
  name = 'ITUNES';
  supportedTypes = ['MUSIC'];
  requiresKey = false;

  async healthCheck(): Promise<ProviderHealthResult> {
    const start = Date.now();
    try {
      const res = await fetch('https://itunes.apple.com/search?term=queen&entity=album&limit=1');
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}: Ошибка iTunes API` };
      }
      return { ok: true, latencyMs, details: 'iTunes Music API доступен' };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message || 'Сетевая ошибка' };
    }
  }

  async search(
    query: string,
    _credentials?: Record<string, any>,
    page: number = 1,
    limit: number = 20
  ): Promise<import('./types.ts').PaginatedResult<MediaSearchResult>> {
    if (!query.trim()) return { results: [], hasMore: false, page };

    const offset = Math.max((page - 1) * limit, 0);
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
        query
      )}&entity=album&limit=${limit}&offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) return { results: [], hasMore: false, page };

      const data = await res.json();
      const results: MediaSearchResult[] = [];

      for (const item of data.results || []) {
        if (!item.collectionId) continue;
        const artwork = item.artworkUrl100
          ? item.artworkUrl100.replace('100x100bb', '600x600bb')
          : undefined;
        const year = item.releaseDate ? parseInt(item.releaseDate.split('-')[0], 10) : undefined;

        results.push({
          provider: 'ITUNES',
          externalId: String(item.collectionId),
          type: 'MUSIC',
          title: item.collectionName || 'Без названия',
          originalTitle: item.artistName,
          description: `Исполнитель: ${item.artistName}. Треков: ${item.trackCount || 0}`,
          posterUrl: artwork,
          backdropUrl: artwork,
          releaseDate: item.releaseDate ? item.releaseDate.split('T')[0] : undefined,
          year,
          genres: item.primaryGenreName ? [item.primaryGenreName] : [],
        });
      }

      const hasMore = (data.results || []).length >= limit;
      return { results, hasMore, page };
    } catch (err) {
      console.error('iTunes search error:', err);
      return { results: [], hasMore: false, page };
    }
  }

  async getTrending(
    _type: string = 'MUSIC',
    _credentials?: Record<string, any>,
    page: number = 1,
    limit: number = 20
  ): Promise<import('./types.ts').PaginatedResult<MediaSearchResult>> {
    const offset = Math.max((page - 1) * limit, 0);
    try {
      const trendingTerms = ['hits', 'popular', 'top', 'chart', 'album'];
      const term = trendingTerms[(page - 1) % trendingTerms.length];
      const url = `https://itunes.apple.com/search?term=${term}&entity=album&limit=${limit}&offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) return { results: [], hasMore: false, page };

      const data = await res.json();
      const results: MediaSearchResult[] = [];

      for (const item of data.results || []) {
        if (!item.collectionId) continue;
        const artwork = item.artworkUrl100
          ? item.artworkUrl100.replace('100x100bb', '600x600bb')
          : undefined;
        const year = item.releaseDate ? parseInt(item.releaseDate.split('-')[0], 10) : undefined;

        results.push({
          provider: 'ITUNES',
          externalId: String(item.collectionId),
          type: 'MUSIC',
          title: item.collectionName || 'Без названия',
          originalTitle: item.artistName,
          description: `Исполнитель: ${item.artistName}. Треков: ${item.trackCount || 0}`,
          posterUrl: artwork,
          backdropUrl: artwork,
          releaseDate: item.releaseDate ? item.releaseDate.split('T')[0] : undefined,
          year,
          genres: item.primaryGenreName ? [item.primaryGenreName] : [],
        });
      }

      const hasMore = (data.results || []).length >= limit;
      return { results, hasMore, page };
    } catch (err) {
      console.error('iTunes trending error:', err);
      return { results: [], hasMore: false, page };
    }
  }

  async getDetails(
    externalId: string
  ): Promise<(MediaSearchResult & MediaDetailExtended) | null> {
    try {
      const res = await fetch(`https://itunes.apple.com/lookup?id=${externalId}&entity=album`);
      if (!res.ok) return null;
      const data = await res.json();
      const item = (data.results || [])[0];
      if (!item) return null;

      const artwork = item.artworkUrl100
        ? item.artworkUrl100.replace('100x100bb', '600x600bb')
        : undefined;
      const year = item.releaseDate ? parseInt(item.releaseDate.split('-')[0], 10) : undefined;

      return {
        provider: 'ITUNES',
        externalId: String(item.collectionId),
        type: 'MUSIC',
        title: item.collectionName || 'Без названия',
        originalTitle: item.artistName,
        description: `Альбом исполнителя ${item.artistName}. Всего композиций: ${item.trackCount || '?'}. Выпущен лейблом: ${item.copyright || 'N/A'}.`,
        posterUrl: artwork,
        backdropUrl: artwork,
        releaseDate: item.releaseDate ? item.releaseDate.split('T')[0] : undefined,
        year,
        genres: item.primaryGenreName ? [item.primaryGenreName] : [],
        creators: [item.artistName],
        statusText: year ? `Релиз ${year}` : undefined,
        sourceText: 'Apple Music / iTunes API',
        website: item.collectionViewUrl,
      };
    } catch (err) {
      console.error('iTunes details error:', err);
      return null;
    }
  }
}
