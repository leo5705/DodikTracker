/**
 * TorznabClient: Communicates with Prowlarr REST / Torznab API.
 * Formulates search queries and fetches releases without exposing API keys to clients.
 */

import { TorrentCandidate, TorrentSearchQuery } from './torrentSearchTypes.ts';
import { parseProwlarrJsonItem } from './torrentParser.ts';

export class TorznabClient {
  private get prowlarrUrl(): string {
    return (process.env.PROWLARR_URL || 'http://localhost:9696').replace(/\/+$/, '');
  }

  private get apiKey(): string {
    return process.env.PROWLARR_API_KEY || '';
  }

  private get timeoutMs(): number {
    const parsed = parseInt(process.env.PROWLARR_TIMEOUT_MS || '10000', 10);
    return isNaN(parsed) ? 10000 : parsed;
  }

  /**
   * Checks if Prowlarr URL and API key are configured and reachable.
   */
  public async isAvailable(): Promise<{ ok: boolean; reason?: string }> {
    if (!this.prowlarrUrl) {
      return { ok: false, reason: 'PROWLARR_URL не настроен в переменных окружения' };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      const url = `${this.prowlarrUrl}/api/v1/health${this.apiKey ? `?apikey=${encodeURIComponent(this.apiKey)}` : ''}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        return { ok: true };
      }
      return { ok: false, reason: `HTTP ${res.status}: Prowlarr недоступен` };
    } catch (err: any) {
      return { ok: false, reason: err?.message || 'Не удалось подключиться к Prowlarr' };
    }
  }

  /**
   * Constructs search query text for Prowlarr.
   */
  public buildQueryString(query: TorrentSearchQuery): string {
    let q = query.title.trim();

    // If original title differs, combine or prefer
    if (query.originalTitle && query.originalTitle.toLowerCase() !== query.title.toLowerCase()) {
      q = `${query.originalTitle}`;
    }

    if (query.mediaType === 'series' || query.seasonNumber !== undefined) {
      if (query.seasonNumber !== undefined && query.episodeNumber !== undefined) {
        const s = String(query.seasonNumber).padStart(2, '0');
        const e = String(query.episodeNumber).padStart(2, '0');
        q += ` S${s}E${e}`;
      } else if (query.seasonNumber !== undefined) {
        const s = String(query.seasonNumber).padStart(2, '0');
        q += ` S${s}`;
      }
    } else if (query.year) {
      q += ` ${query.year}`;
    }

    return q;
  }

  /**
   * Searches Prowlarr API for torrent candidates.
   */
  public async search(query: TorrentSearchQuery): Promise<{ candidates: TorrentCandidate[]; rawError?: string }> {
    const isAvail = await this.isAvailable();
    if (!isAvail.ok) {
      return { candidates: [], rawError: isAvail.reason };
    }

    const searchQuery = this.buildQueryString(query);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      // Prowlarr Search Endpoint
      const searchUrl = new URL(`${this.prowlarrUrl}/api/v1/search`);
      if (this.apiKey) {
        searchUrl.searchParams.set('apikey', this.apiKey);
      }
      searchUrl.searchParams.set('query', searchQuery);
      searchUrl.searchParams.set('type', 'search');
      searchUrl.searchParams.set('limit', '40');

      const res = await fetch(searchUrl.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        return { candidates: [], rawError: `Prowlarr HTTP ${res.status}` };
      }

      const rawItems = await res.json();
      if (!Array.isArray(rawItems)) {
        return { candidates: [] };
      }

      const candidates: TorrentCandidate[] = [];
      for (const item of rawItems) {
        const parsed = parseProwlarrJsonItem(item, query);
        if (parsed) {
          candidates.push(parsed);
        }
      }

      return { candidates };
    } catch (err: any) {
      return { candidates: [], rawError: err?.message || 'Ошибка выполнения запроса к Prowlarr' };
    }
  }
}

export const torznabClient = new TorznabClient();
