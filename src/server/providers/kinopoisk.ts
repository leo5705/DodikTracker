import { MediaProvider, MediaSearchResult, ProviderHealthResult } from './types.ts';

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

  async search(query: string, credentials?: Record<string, any>): Promise<MediaSearchResult[]> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return [];

    try {
      const res = await fetch(`https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(query)}&page=1`, {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) return [];
      const data = await res.json();
      const results: MediaSearchResult[] = [];

      for (const film of (data.films || [])) {
        const isTv = film.type === 'TV_SERIES' || film.type === 'MINI_SERIES';
        results.push({
          provider: 'Kinopoisk',
          externalId: String(film.filmId),
          type: isTv ? 'TV' : 'MOVIE',
          title: film.nameRu || film.nameEn || 'Без названия',
          originalTitle: film.nameEn || undefined,
          description: film.description || undefined,
          posterUrl: film.posterUrlPreview || film.posterUrl,
          year: film.year ? parseInt(film.year, 10) : undefined,
          rating: film.rating && film.rating !== 'null' ? parseFloat(film.rating) : undefined,
        });
      }

      return results;
    } catch (err) {
      console.error('Kinopoisk search error:', err);
      return [];
    }
  }
}
