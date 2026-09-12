import {
  MediaProvider,
  MediaSearchResult,
  MediaDetailExtended,
  ProviderHealthResult,
} from './types.ts';
import { GameTranslator } from '../services/gameTranslator.ts';

const BASE_URL = 'https://api.thegamesdb.net/v1';

export class TheGamesDBProvider implements MediaProvider {
  name = 'THEGAMESDB';
  supportedTypes = ['GAME'];
  requiresKey = true;

  // Cached genre and platform dictionary
  private genresCache: Map<number, string> = new Map();
  private platformsCache: Map<number, string> = new Map();
  private developersCache: Map<number, string> = new Map();
  private publishersCache: Map<number, string> = new Map();

  async healthCheck(credentials?: Record<string, any>): Promise<ProviderHealthResult> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) {
      return { ok: false, latencyMs: 0, error: 'API ключ TheGamesDB не настроен' };
    }

    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/API/Limit?apikey=${encodeURIComponent(apiKey)}`);
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        return {
          ok: false,
          latencyMs,
          error: `HTTP ${res.status}: Ошибка проверки API ключа TheGamesDB`,
        };
      }

      const json = await res.json();
      if (json.status === 'Success' && json.data) {
        const remaining = json.data.remaining_monthly_allowance;
        const total = json.data.monthly_allowance;
        return {
          ok: true,
          latencyMs,
          details: `TheGamesDB подключен успешно (Осталось запросов: ${remaining ?? 'N/A'} из ${total ?? 'N/A'})`,
        };
      }

      return { ok: true, latencyMs, details: 'TheGamesDB подключен' };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message || 'Ошибка сети при обращении к TheGamesDB' };
    }
  }

  private async fetchGenres(apiKey: string) {
    if (this.genresCache.size > 0) return;
    try {
      const res = await fetch(`${BASE_URL}/Genres?apikey=${encodeURIComponent(apiKey)}`);
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
    } catch (err) {
      console.warn('[TheGamesDB] Failed to cache genres:', err);
    }
  }

  async search(query: string, credentials?: Record<string, any>): Promise<MediaSearchResult[]> {
    const apiKey = credentials?.apiKey;
    if (!apiKey || !query.trim()) return [];

    await this.fetchGenres(apiKey);

    try {
      const url = `${BASE_URL}/Games/ByGameName?name=${encodeURIComponent(query.trim())}&apikey=${encodeURIComponent(apiKey)}&fields=players,publishers,genres,overview,last_updated,rating,platform,coop,youtube,alternates&include=boxart,platform`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`TheGamesDB search HTTP ${res.status}`);
        return [];
      }

      const json = await res.json();
      const games = json?.data?.games;
      if (!Array.isArray(games) || games.length === 0) return [];

      const boxartData = json?.include?.boxart?.data || {};
      const boxartBase = json?.include?.boxart?.base_url?.medium ||
        json?.include?.boxart?.base_url?.original ||
        'https://cdn.thegamesdb.net/images/medium/';
      const platformData = json?.include?.platform?.data || {};

      // Map platforms from includes
      for (const [pId, pVal] of Object.entries(platformData)) {
        const p = pVal as any;
        if (p?.name) this.platformsCache.set(Number(pId), p.name);
      }

      const results: MediaSearchResult[] = [];

      for (const game of games.slice(0, 15)) {
        const gameIdStr = String(game.id);
        const gameBoxarts = boxartData[gameIdStr] || [];
        const frontBoxart = gameBoxarts.find((b: any) => b.side === 'front') || gameBoxarts[0];
        const posterUrl = frontBoxart?.filename
          ? (frontBoxart.filename.startsWith('http') ? frontBoxart.filename : `${boxartBase}${frontBoxart.filename}`)
          : undefined;

        // Resolve raw genres
        const rawGenres: string[] = [];
        if (Array.isArray(game.genres)) {
          for (const gId of game.genres) {
            const gName = this.genresCache.get(Number(gId));
            if (gName) rawGenres.push(gName);
          }
        }

        // Release year
        let year: number | undefined;
        if (game.release_date) {
          const y = parseInt(game.release_date.split('-')[0], 10);
          if (!isNaN(y)) year = y;
        }

        // Translation
        const translation = await GameTranslator.translateGame({
          provider: 'THEGAMESDB',
          externalId: gameIdStr,
          title: game.game_title,
          description: game.overview,
          genres: rawGenres,
          alternates: Array.isArray(game.alternates) ? game.alternates : [],
        });

        results.push({
          provider: 'THEGAMESDB',
          externalId: gameIdStr,
          type: 'GAME',
          title: translation.title,
          originalTitle: game.game_title,
          description: translation.description,
          posterUrl,
          backdropUrl: posterUrl,
          year,
          releaseDate: game.release_date || undefined,
          genres: translation.genres,
          rating: game.rating ? 8.0 : undefined,
        });
      }

      return results;
    } catch (err) {
      console.error('TheGamesDB search error:', err);
      return [];
    }
  }

  async getDetails(
    externalId: string,
    _type?: string,
    credentials?: Record<string, any>
  ): Promise<(MediaSearchResult & MediaDetailExtended) | null> {
    const apiKey = credentials?.apiKey;
    if (!apiKey) return null;

    await this.fetchGenres(apiKey);

    try {
      // 1. Fetch Game info
      const gameUrl = `${BASE_URL}/Games/ByGameID?id=${encodeURIComponent(externalId)}&apikey=${encodeURIComponent(apiKey)}&fields=players,publishers,genres,overview,last_updated,rating,platform,coop,youtube,alternates&include=boxart,platform`;
      const res = await fetch(gameUrl);
      if (!res.ok) return null;

      const json = await res.json();
      const games = json?.data?.games;
      if (!Array.isArray(games) || games.length === 0) return null;
      const game = games[0];

      // 2. Fetch all real game images (screenshots, fanarts, boxart)
      let imagesData: any = null;
      try {
        const imagesRes = await fetch(`${BASE_URL}/Games/Images?games_id=${encodeURIComponent(externalId)}&apikey=${encodeURIComponent(apiKey)}`);
        if (imagesRes.ok) {
          imagesData = await imagesRes.json();
        }
      } catch (err) {
        console.warn('[TheGamesDB] Failed to fetch images:', err);
      }

      const imgBaseOriginal = imagesData?.data?.base_url?.original || 'https://cdn.thegamesdb.net/images/original/';
      const imgBaseLarge = imagesData?.data?.base_url?.large || imagesData?.data?.base_url?.original || 'https://cdn.thegamesdb.net/images/large/';
      const allGameImages = imagesData?.data?.images?.[String(externalId)] || [];

      // Find real front boxart / poster
      const frontBoxart = allGameImages.find((img: any) => img.type === 'boxart' && img.side === 'front') ||
        allGameImages.find((img: any) => img.type === 'boxart');
      const posterUrl = frontBoxart?.filename
        ? (frontBoxart.filename.startsWith('http') ? frontBoxart.filename : `${imgBaseLarge}${frontBoxart.filename}`)
        : undefined;

      // Find real backdrop / fanart / banner
      const fanart = allGameImages.find((img: any) => img.type === 'fanart') ||
        allGameImages.find((img: any) => img.type === 'banner');
      const backdropUrl = fanart?.filename
        ? (fanart.filename.startsWith('http') ? fanart.filename : `${imgBaseOriginal}${fanart.filename}`)
        : posterUrl;

      // Screenshots: filter images with type === 'screenshot'
      const screenshots: string[] = allGameImages
        .filter((img: any) => img.type === 'screenshot' && img.filename)
        .map((img: any) => img.filename.startsWith('http') ? img.filename : `${imgBaseOriginal}${img.filename}`);

      // If no screenshots found, include fanart images
      if (screenshots.length === 0) {
        const fanarts = allGameImages
          .filter((img: any) => img.type === 'fanart' && img.filename)
          .map((img: any) => img.filename.startsWith('http') ? img.filename : `${imgBaseOriginal}${img.filename}`);
        screenshots.push(...fanarts);
      }

      // Platforms
      const platformData = json?.include?.platform?.data || {};
      const platforms: string[] = [];
      if (game.platform) {
        const pObj = platformData[String(game.platform)];
        if (pObj?.name) {
          platforms.push(pObj.name);
          this.platformsCache.set(Number(game.platform), pObj.name);
        } else if (this.platformsCache.has(Number(game.platform))) {
          platforms.push(this.platformsCache.get(Number(game.platform))!);
        }
      }

      // Genres
      const rawGenres: string[] = [];
      if (Array.isArray(game.genres)) {
        for (const gId of game.genres) {
          const gName = this.genresCache.get(Number(gId));
          if (gName) rawGenres.push(gName);
        }
      }

      // Developers & Publishers resolution
      const developers: string[] = [];
      const publishers: string[] = [];

      if (Array.isArray(game.developers) && game.developers.length > 0) {
        const missingDevs = game.developers.filter((dId: number) => !this.developersCache.has(dId));
        if (missingDevs.length > 0) {
          try {
            const devRes = await fetch(`${BASE_URL}/Developers/ByDeveloperID?id=${missingDevs.join(',')}&apikey=${encodeURIComponent(apiKey)}`);
            if (devRes.ok) {
              const devJson = await devRes.json();
              const devs = devJson?.data?.developers || {};
              for (const [dId, val] of Object.entries(devs)) {
                const d = val as any;
                if (d?.name) this.developersCache.set(Number(dId), d.name);
              }
            }
          } catch (err) {
            console.warn('[TheGamesDB] Failed to fetch developers:', err);
          }
        }
        for (const dId of game.developers) {
          if (this.developersCache.has(dId)) developers.push(this.developersCache.get(dId)!);
        }
      }

      if (Array.isArray(game.publishers) && game.publishers.length > 0) {
        const missingPubs = game.publishers.filter((pId: number) => !this.publishersCache.has(pId));
        if (missingPubs.length > 0) {
          try {
            const pubRes = await fetch(`${BASE_URL}/Publishers/ByPublisherID?id=${missingPubs.join(',')}&apikey=${encodeURIComponent(apiKey)}`);
            if (pubRes.ok) {
              const pubJson = await pubRes.json();
              const pubs = pubJson?.data?.publishers || {};
              for (const [pId, val] of Object.entries(pubs)) {
                const p = val as any;
                if (p?.name) this.publishersCache.set(Number(pId), p.name);
              }
            }
          } catch (err) {
            console.warn('[TheGamesDB] Failed to fetch publishers:', err);
          }
        }
        for (const pId of game.publishers) {
          if (this.publishersCache.has(pId)) publishers.push(this.publishersCache.get(pId)!);
        }
      }

      // Video / Trailer
      const videos = [];
      let trailerUrl: string | undefined;
      if (game.youtube) {
        const ytId = String(game.youtube).trim();
        trailerUrl = `https://www.youtube.com/watch?v=${ytId}`;
        videos.push({
          title: 'Официальный трейлер / Геймплей',
          url: trailerUrl,
          site: 'YouTube',
          key: ytId,
          type: 'Trailer',
        });
      }

      // Year
      let year: number | undefined;
      if (game.release_date) {
        const y = parseInt(game.release_date.split('-')[0], 10);
        if (!isNaN(y)) year = y;
      }

      // Translation
      const translation = await GameTranslator.translateGame({
        provider: 'THEGAMESDB',
        externalId: String(externalId),
        title: game.game_title,
        description: game.overview,
        genres: rawGenres,
        alternates: Array.isArray(game.alternates) ? game.alternates : [],
      });

      return {
        provider: 'THEGAMESDB',
        externalId: String(externalId),
        type: 'GAME',
        title: translation.title,
        originalTitle: game.game_title,
        description: translation.description,
        posterUrl,
        backdropUrl,
        coverUrl: posterUrl,
        year,
        releaseDate: game.release_date || undefined,
        genres: translation.genres,
        platforms,
        developers,
        publishers,
        screenshots,
        videos,
        trailerUrl,
        statusText: year ? `Вышла в ${year}` : 'Выпущена',
        sourceText: 'TheGamesDB',
      };
    } catch (err) {
      console.error('TheGamesDB getDetails error:', err);
      return null;
    }
  }

  async getTrending(_type?: string, credentials?: Record<string, any>): Promise<MediaSearchResult[]> {
    return this.search('Witcher', credentials);
  }
}
