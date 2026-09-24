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
      // 1. Try Apple Music Top Albums RSS Chart Feed (Real Charts)
      try {
        const rssRes = await fetch('https://itunes.apple.com/us/rss/topalbums/limit=50/json');
        if (rssRes.ok) {
          const rssData = await rssRes.json();
          const entries = rssData.feed?.entry || [];
          if (Array.isArray(entries) && entries.length > 0) {
            const chartResults: MediaSearchResult[] = [];
            for (const entry of entries.slice(offset, offset + limit)) {
              const albumName = entry['im:name']?.label || entry.title?.label || 'Без названия';
              const artist = entry['im:artist']?.label;
              const images = entry['im:image'] || [];
              const posterUrl = images.length > 0 ? images[images.length - 1]?.label : undefined;
              const extId = entry.id?.attributes?.['im:id'] || String(Math.random());
              const releaseDateStr = entry['im:releaseDate']?.label;
              const year = releaseDateStr ? parseInt(releaseDateStr.split('-')[0], 10) : undefined;
              const genre = entry.category?.attributes?.label;

              chartResults.push({
                provider: 'ITUNES',
                externalId: extId,
                type: 'MUSIC',
                title: albumName,
                originalTitle: artist,
                description: artist ? `Исполнитель: ${artist}` : undefined,
                posterUrl,
                backdropUrl: posterUrl,
                releaseDate: releaseDateStr ? releaseDateStr.split('T')[0] : undefined,
                year,
                genres: genre ? [genre] : [],
              });
            }

            if (chartResults.length > 0) {
              return { results: chartResults, hasMore: offset + limit < entries.length, page, total: entries.length };
            }
          }
        }
      } catch (rssErr) {
        console.warn('iTunes RSS charts fetch failed, falling back to search:', rssErr);
      }

      // 2. Fallback to search query
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
        ageRating: item.contentAdvisoryRating || undefined,
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
