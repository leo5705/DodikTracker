import {
  MediaProvider,
  MediaSearchResult,
  MediaDetailExtended,
  ProviderHealthResult,
} from './types.ts';
import { GameTranslator } from '../services/gameTranslator.ts';

export function extractIgdbCredentials(credentials?: Record<string, any>): {
  clientId: string | null;
  clientSecret: string | null;
  directToken: string | null;
} {
  if (!credentials) return { clientId: null, clientSecret: null, directToken: null };

  let clientId: string | null = credentials.clientId || null;
  let clientSecret: string | null = credentials.clientSecret || null;
  let directToken: string | null = credentials.token || credentials.accessToken || null;

  // Check if apiKey contains combined string e.g. "clientId:clientSecret" or "clientId;clientSecret"
  if (credentials.apiKey && typeof credentials.apiKey === 'string') {
    const raw = credentials.apiKey.trim();
    if (raw.includes(':') && !clientSecret) {
      const parts = raw.split(':');
      clientId = parts[0].trim();
      clientSecret = parts.slice(1).join(':').trim();
    } else if (raw.includes(';') && !clientSecret) {
      const parts = raw.split(';');
      clientId = parts[0].trim();
      clientSecret = parts.slice(1).join(';').trim();
    } else if (!clientId) {
      clientId = raw;
    }
  }

  // Also check if clientId field has a combined string
  if (clientId && clientId.includes(':') && !clientSecret) {
    const parts = clientId.split(':');
    clientId = parts[0].trim();
    clientSecret = parts.slice(1).join(':').trim();
  }

  return { clientId, clientSecret, directToken };
}

export class IGDBProvider implements MediaProvider {
  name = 'IGDB';
  supportedTypes = ['GAME'];
  requiresKey = true;

  private cachedToken: { cacheKey: string; token: string; expiresAt: number } | null = null;

  private async getAccessToken(credentials?: Record<string, any>): Promise<{ token: string | null; error?: string; clientId: string | null }> {
    const { clientId, clientSecret, directToken } = extractIgdbCredentials(credentials);

    if (!clientId) {
      return { token: null, error: 'Twitch Client ID не указан', clientId: null };
    }

    if (directToken) {
      return { token: directToken, clientId };
    }

    if (!clientSecret) {
      return {
        token: null,
        error: 'Отсутствует Twitch Client Secret. IGDB (Twitch API) требует пару: Client ID и Client Secret.',
        clientId,
      };
    }

    const cacheKey = `${clientId}_${clientSecret}`;
    if (this.cachedToken && this.cachedToken.cacheKey === cacheKey && Date.now() < this.cachedToken.expiresAt - 60000) {
      return { token: this.cachedToken.token, clientId };
    }

    try {
      const res = await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
        { method: 'POST' }
      );
      if (!res.ok) {
        let errDetail = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson.message) errDetail = errJson.message;
        } catch {}
        console.error('Failed to get IGDB/Twitch token:', errDetail);
        return { token: null, error: `Ошибка Twitch OAuth: ${errDetail} (проверьте Client ID и Client Secret в dev.twitch.tv)`, clientId };
      }

      const data = await res.json();
      if (data.access_token) {
        this.cachedToken = {
          cacheKey,
          token: data.access_token,
          expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        };
        return { token: data.access_token, clientId };
      }
      return { token: null, error: 'Twitch не вернул access_token', clientId };
    } catch (err: any) {
      console.error('IGDB token fetch error:', err);
      return { token: null, error: err.message || 'Ошибка сети при получении Twitch OAuth токена', clientId };
    }
  }

  async healthCheck(credentials?: Record<string, any>): Promise<ProviderHealthResult> {
    const { clientId, clientSecret } = extractIgdbCredentials(credentials);

    if (!clientId) {
      return { ok: false, latencyMs: 0, error: 'Twitch Client ID для IGDB не указан' };
    }
    if (!clientSecret) {
      return {
        ok: false,
        latencyMs: 0,
        error: 'Для IGDB требуются оба ключа: Twitch Client ID и Twitch Client Secret. Пожалуйста, введите Client Secret из Twitch Developer Console (dev.twitch.tv/console/apps).',
      };
    }

    const start = Date.now();
    try {
      const { token, error: tokenError, clientId: resolvedClientId } = await this.getAccessToken(credentials);
      if (!token || !resolvedClientId) {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          error: tokenError || 'Не удалось получить Twitch OAuth токен. Проверьте Client ID и Client Secret.',
        };
      }

      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': resolvedClientId,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
        },
        body: 'fields id, name; limit 1;',
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        let errDetail = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (Array.isArray(errJson) && errJson[0]?.title) {
            errDetail = errJson[0].title;
          } else if (errJson?.message) {
            errDetail = errJson.message;
          }
        } catch {}
        return { ok: false, latencyMs, error: `IGDB API вернул ошибку (${errDetail})` };
      }

      return { ok: true, latencyMs, details: 'Подключение к IGDB (Twitch API v4) успешно установлено!' };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message || 'Ошибка сети при обращении к IGDB' };
    }
  }

  async search(
    query: string,
    credentials?: Record<string, any>,
    page: number = 1,
    limit: number = 20
  ): Promise<import('./types.ts').PaginatedResult<MediaSearchResult>> {
    if (!query.trim()) return { results: [], hasMore: false, page };

    const { token, clientId: resolvedClientId } = await this.getAccessToken(credentials);
    if (!token || !resolvedClientId) return { results: [], hasMore: false, page };

    try {
      const offset = Math.max((page - 1) * limit, 0);
      const cleanQ = query.replace(/"/g, '\\"');
      const body = `search "${cleanQ}"; fields id, name, summary, rating, first_release_date, cover.image_id, genres.name, platforms.name, alternative_names.name; offset ${offset}; limit ${limit};`;

      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': resolvedClientId,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
        },
        body,
      });

      if (!res.ok) return { results: [], hasMore: false, page };
      const games = await res.json();
      if (!Array.isArray(games)) return { results: [], hasMore: false, page };

      const results: MediaSearchResult[] = [];

      for (const game of games) {
        const coverId = game.cover?.image_id;
        const posterUrl = coverId
          ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${coverId}.jpg`
          : undefined;

        let year: number | undefined;
        let releaseDate: string | undefined;
        if (game.first_release_date) {
          const d = new Date(game.first_release_date * 1000);
          year = d.getFullYear();
          releaseDate = d.toISOString().split('T')[0];
        }

        const rawGenres = (game.genres || []).map((g: any) => g.name);
        const alternates = (game.alternative_names || []).map((a: any) => a.name);

        const translation = await GameTranslator.translateGame({
          provider: 'IGDB',
          externalId: String(game.id),
          title: game.name,
          description: game.summary,
          genres: rawGenres,
          alternates,
        });

        results.push({
          provider: 'IGDB',
          externalId: String(game.id),
          type: 'GAME',
          title: translation.title,
          originalTitle: game.name,
          description: translation.description,
          posterUrl,
          backdropUrl: posterUrl,
          year,
          releaseDate,
          rating: game.rating ? Math.round(game.rating) / 10 : undefined,
          genres: translation.genres,
        });
      }

      const hasMore = games.length >= limit;
      return { results, hasMore, page };
    } catch (err) {
      console.error('IGDB search error:', err);
      return { results: [], hasMore: false, page };
    }
  }

  async getDetails(
    externalId: string,
    _type?: string,
    credentials?: Record<string, any>
  ): Promise<(MediaSearchResult & MediaDetailExtended) | null> {
    const { token, clientId: resolvedClientId } = await this.getAccessToken(credentials);
    if (!token || !resolvedClientId) return null;

    try {
      const body = `fields id, name, summary, storyline, rating, first_release_date, cover.image_id, artworks.image_id, screenshots.image_id, genres.name, platforms.name, involved_companies.company.name, involved_companies.developer, involved_companies.publisher, videos.video_id, videos.name, websites.url, alternative_names.name; where id = ${externalId};`;

      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': resolvedClientId,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
        },
        body,
      });

      if (!res.ok) return null;
      const games = await res.json();
      if (!Array.isArray(games) || games.length === 0) return null;

      const game = games[0];
      const coverId = game.cover?.image_id;
      const posterUrl = coverId
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${coverId}.jpg`
        : undefined;

      const artworkId = game.artworks?.[0]?.image_id;
      const backdropUrl = artworkId
        ? `https://images.igdb.com/igdb/image/upload/t_1080p/${artworkId}.jpg`
        : posterUrl;

      const screenshots: string[] = (game.screenshots || [])
        .map((s: any) => s.image_id ? `https://images.igdb.com/igdb/image/upload/t_1080p/${s.image_id}.jpg` : null)
        .filter(Boolean);

      const platforms: string[] = (game.platforms || []).map((p: any) => p.name);
      const rawGenres: string[] = (game.genres || []).map((g: any) => g.name);

      const developers: string[] = [];
      const publishers: string[] = [];
      for (const inv of (game.involved_companies || [])) {
        if (inv.developer && inv.company?.name) developers.push(inv.company.name);
        if (inv.publisher && inv.company?.name) publishers.push(inv.company.name);
      }

      const videos = (game.videos || []).map((v: any) => ({
        title: v.name || 'Официальный трейлер',
        url: `https://www.youtube.com/watch?v=${v.video_id}`,
        site: 'YouTube',
        key: v.video_id,
        type: 'Trailer',
      }));

      let year: number | undefined;
      let releaseDate: string | undefined;
      if (game.first_release_date) {
        const d = new Date(game.first_release_date * 1000);
        year = d.getFullYear();
        releaseDate = d.toISOString().split('T')[0];
      }

      const alternates = (game.alternative_names || []).map((a: any) => a.name);

      const fullDesc = game.storyline
        ? `${game.summary || ''}\n\n${game.storyline}`
        : game.summary;

      const translation = await GameTranslator.translateGame({
        provider: 'IGDB',
        externalId: String(game.id),
        title: game.name,
        description: fullDesc,
        genres: rawGenres,
        alternates,
      });

      return {
        provider: 'IGDB',
        externalId: String(game.id),
        type: 'GAME',
        title: translation.title,
        originalTitle: game.name,
        description: translation.description,
        posterUrl,
        backdropUrl,
        coverUrl: posterUrl,
        year,
        releaseDate,
        genres: translation.genres,
        platforms: platforms.length > 0 ? platforms : undefined,
        developers: developers.length > 0 ? developers : undefined,
        publishers: publishers.length > 0 ? publishers : undefined,
        screenshots: screenshots.length > 0 ? screenshots : undefined,
        videos: videos.length > 0 ? videos : undefined,
        trailerUrl: videos[0]?.url,
        rating: game.rating ? Math.round(game.rating) / 10 : undefined,
        website: game.websites?.[0]?.url,
        statusText: year ? `Вышла в ${year}` : 'Выпущена',
        sourceText: 'IGDB',
      };
    } catch (err) {
      console.error('IGDB getDetails error:', err);
      return null;
    }
  }

  async getTrending(
    _type?: string,
    credentials?: Record<string, any>,
    page: number = 1,
    limit: number = 20
  ): Promise<import('./types.ts').PaginatedResult<MediaSearchResult>> {
    const { token, clientId: resolvedClientId } = await this.getAccessToken(credentials);
    if (!token || !resolvedClientId) return { results: [], hasMore: false, page };

    try {
      const offset = Math.max((page - 1) * limit, 0);
      const body = `fields id, name, summary, rating, first_release_date, cover.image_id, genres.name, platforms.name, alternative_names.name; where rating_count > 15 & rating != null; sort rating desc; offset ${offset}; limit ${limit};`;

      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': resolvedClientId,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
        },
        body,
      });

      if (!res.ok) return { results: [], hasMore: false, page };
      const games = await res.json();
      if (!Array.isArray(games)) return { results: [], hasMore: false, page };

      const results: MediaSearchResult[] = [];

      for (const game of games) {
        const coverId = game.cover?.image_id;
        const posterUrl = coverId
          ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${coverId}.jpg`
          : undefined;

        let year: number | undefined;
        let releaseDate: string | undefined;
        if (game.first_release_date) {
          const d = new Date(game.first_release_date * 1000);
          year = d.getFullYear();
          releaseDate = d.toISOString().split('T')[0];
        }

        const rawGenres = (game.genres || []).map((g: any) => g.name);
        const alternates = (game.alternative_names || []).map((a: any) => a.name);

        const translation = await GameTranslator.translateGame({
          provider: 'IGDB',
          externalId: String(game.id),
          title: game.name,
          description: game.summary,
          genres: rawGenres,
          alternates,
        });

        results.push({
          provider: 'IGDB',
          externalId: String(game.id),
          type: 'GAME',
          title: translation.title,
          originalTitle: game.name,
          description: translation.description,
          posterUrl,
          backdropUrl: posterUrl,
          year,
          releaseDate,
          rating: game.rating ? Math.round(game.rating) / 10 : undefined,
          genres: translation.genres,
        });
      }

      const hasMore = games.length >= limit;
      return { results, hasMore, page };
    } catch (err) {
      console.error('IGDB trending error:', err);
      return { results: [], hasMore: false, page };
    }
  }
}
