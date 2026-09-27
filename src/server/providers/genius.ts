import { MediaProvider, MediaSearchResult, ProviderHealthResult, PaginatedResult } from './types.ts';
import { geniusProvider as gProvider } from '../services/externalMusic/lyrics/geniusProvider.ts';

export class GeniusProvider implements MediaProvider {
  name = 'Genius';
  supportedTypes = ['LYRICS'];
  requiresKey = true;

  async healthCheck(credentials?: Record<string, any>): Promise<ProviderHealthResult> {
    const res = await gProvider.testConnection(credentials?.apiKey || credentials?.token);
    return {
      ok: res.ok,
      latencyMs: res.latency || 0,
      error: res.ok ? undefined : res.message,
      details: res.message,
    };
  }

  async search(
    query: string,
    credentials?: Record<string, any>,
    _page = 1,
    _limit = 10
  ): Promise<PaginatedResult<MediaSearchResult>> {
    const hit = await gProvider.searchLyrics({ title: query, artists: [] }, credentials?.apiKey || credentials?.token);
    const results: MediaSearchResult[] = hit
      ? [
          {
            provider: 'Genius',
            externalId: query,
            type: 'MUSIC',
            title: hit.title || query,
            description: hit.artist || undefined,
            posterUrl: undefined,
            coverUrl: undefined,
          },
        ]
      : [];
    return {
      results,
      hasMore: false,
    };
  }
}
