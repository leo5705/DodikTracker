/**
 * TorznabClient: Communicates with Prowlarr REST / Torznab API.
 * Formulates search queries and fetches releases without exposing API keys to clients.
 */

import { TorrentCandidate, TorrentSearchQuery } from './torrentSearchTypes.ts';
import { parseProwlarrJsonItem } from './torrentParser.ts';

export class TorznabClient {
  private cachedResolvedUrl: string | null = null;

  public get prowlarrUrl(): string {
    if (this.cachedResolvedUrl) {
      return this.cachedResolvedUrl;
    }
    const envUrl = process.env.PROWLARR_URL?.trim();
    if (envUrl) {
      return envUrl.replace(/\/+$/, '');
    }
    return 'http://127.0.0.1:9696';
  }

  private get apiKey(): string {
    return process.env.PROWLARR_API_KEY || '';
  }

  private get timeoutMs(): number {
    const parsed = parseInt(process.env.PROWLARR_TIMEOUT_MS || '10000', 10);
    return isNaN(parsed) ? 10000 : parsed;
  }

  /**
   * Sanitizes title string by removing tracker-incompatible punctuation (colons, quotes, etc).
   */
  public cleanSearchText(text: string): string {
    return text
      .replace(/[:\/\\?*"~«»„“]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Checks if Prowlarr URL and API key are configured and reachable.
   */
  public async isAvailable(): Promise<{ ok: boolean; reason?: string; resolvedUrl?: string; statusCode?: number }> {
    const rawEnvUrl = process.env.PROWLARR_URL?.trim();
    const envUrl = rawEnvUrl ? rawEnvUrl.replace(/\/+$/, '') : null;

    const candidateUrls = [
      ...(envUrl ? [envUrl] : []),
      'http://127.0.0.1:9696',
      'http://localhost:9696',
    ].filter((v, i, a) => a.indexOf(v) === i);

    const primaryUrl = this.prowlarrUrl;
    let lastError = `Не удалось подключиться к Prowlarr (${primaryUrl}): служба не запущена или недоступна`;
    let lastStatusCode: number | undefined;

    for (const url of candidateUrls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);

        const healthUrl = `${url}/api/v1/health${this.apiKey ? `?apikey=${encodeURIComponent(this.apiKey)}` : ''}`;
        const res = await fetch(healthUrl, { signal: controller.signal });
        clearTimeout(timer);

        if (res.ok || res.status === 401 || res.status === 403) {
          this.cachedResolvedUrl = url;
          if (res.status === 401 || res.status === 403) {
            return { ok: false, reason: 'PROWLARR_AUTH_FAILED', statusCode: res.status, resolvedUrl: url };
          }
          return { ok: true, resolvedUrl: url };
        }
        lastStatusCode = res.status;
        lastError = `HTTP ${res.status}: Prowlarr недоступен (${url})`;
      } catch (err: any) {
        // Continue probing next candidate
      }
    }

    return { ok: false, reason: lastError, statusCode: lastStatusCode, resolvedUrl: primaryUrl };
  }

  /**
   * Constructs search query text for Prowlarr with sanitized characters.
   */
  public buildQueryString(query: TorrentSearchQuery): string {
    const rawTitle = (query.originalTitle && query.originalTitle.toLowerCase() !== query.title.toLowerCase())
      ? query.originalTitle
      : query.title;

    let q = this.cleanSearchText(rawTitle);

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
      // Don't append year if already in title
      if (!q.includes(String(query.year))) {
        q += ` ${query.year}`;
      }
    }

    return q.trim();
  }

  /**
   * Builds secondary/fallback search queries (e.g. Russian title, title without year).
   */
  public buildFallbackQueryStrings(query: TorrentSearchQuery): string[] {
    const fallbacks: string[] = [];
    const mainQuery = this.buildQueryString(query);

    // 1. If originalTitle was used, try Russian/localized title
    if (query.title && query.originalTitle && query.title.toLowerCase() !== query.originalTitle.toLowerCase()) {
      let alt = this.cleanSearchText(query.title);
      if (query.seasonNumber !== undefined && query.episodeNumber !== undefined) {
        const s = String(query.seasonNumber).padStart(2, '0');
        const e = String(query.episodeNumber).padStart(2, '0');
        alt += ` S${s}E${e}`;
      } else if (query.seasonNumber !== undefined) {
        const s = String(query.seasonNumber).padStart(2, '0');
        alt += ` S${s}`;
      } else if (query.year && !alt.includes(String(query.year))) {
        alt += ` ${query.year}`;
      }
      if (alt !== mainQuery && !fallbacks.includes(alt)) {
        fallbacks.push(alt);
      }
    }

    // 2. Query without year (for releases that omit the year in title)
    if (query.year && query.mediaType !== 'series' && query.seasonNumber === undefined) {
      const withoutYear = this.cleanSearchText(query.originalTitle || query.title);
      if (withoutYear !== mainQuery && !fallbacks.includes(withoutYear)) {
        fallbacks.push(withoutYear);
      }
    }

    return fallbacks;
  }

  /**
   * Executes a single query fetch against Prowlarr API.
   */
  private async executeProwlarrSearch(
    targetUrl: string,
    searchQuery: string,
    query: TorrentSearchQuery
  ): Promise<TorrentCandidate[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const searchUrl = new URL(`${targetUrl}/api/v1/search`);
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
      throw new Error(`Prowlarr HTTP ${res.status}`);
    }

    const rawItems = await res.json();
    if (!Array.isArray(rawItems)) {
      return [];
    }

    const candidates: TorrentCandidate[] = [];
    for (const item of rawItems) {
      const parsed = parseProwlarrJsonItem(item, query);
      if (parsed) {
        candidates.push(parsed);
      }
    }
    return candidates;
  }

  /**
   * Searches Prowlarr API for torrent candidates with automatic fallback queries.
   */
  public async search(query: TorrentSearchQuery): Promise<{ candidates: TorrentCandidate[]; rawError?: string }> {
    const isAvail = await this.isAvailable();
    if (!isAvail.ok) {
      return { candidates: [], rawError: isAvail.reason };
    }

    const targetUrl = isAvail.resolvedUrl || this.prowlarrUrl;
    const primaryQuery = this.buildQueryString(query);

    console.log(`[TorrentSearch] calling Torznab (primary: "${primaryQuery}")`);

    try {
      let candidates = await this.executeProwlarrSearch(targetUrl, primaryQuery, query);
      console.log(`[TorrentSearch] candidates found=${candidates.length} for "${primaryQuery}"`);

      // If 0 candidates, try fallback query variations
      if (candidates.length === 0) {
        const fallbacks = this.buildFallbackQueryStrings(query);
        for (const fbQuery of fallbacks) {
          try {
            console.log(`[TorrentSearch] calling Torznab (fallback: "${fbQuery}")`);
            const fbCandidates = await this.executeProwlarrSearch(targetUrl, fbQuery, query);
            console.log(`[TorrentSearch] candidates found=${fbCandidates.length} for "${fbQuery}"`);
            if (fbCandidates.length > 0) {
              candidates = fbCandidates;
              break;
            }
          } catch (_fbErr) {}
        }
      }

      return { candidates };
    } catch (err: any) {
      return { candidates: [], rawError: err?.message || 'Ошибка выполнения запроса к Prowlarr' };
    }
  }
}

export const torznabClient = new TorznabClient();
