import { MediaProvider, MediaSearchResult, ProviderHealthResult, PaginatedResult } from './types.ts';
import { youtubeMusicProvider as ytProvider } from '../services/externalMusic/youtubeMusicProvider.ts';

export class YouTubeMusicProvider implements MediaProvider {
  name = 'YouTube Music';
  supportedTypes = ['MUSIC'];
  requiresKey = false;

  async healthCheck(_credentials?: Record<string, any>): Promise<ProviderHealthResult> {
    const res = await ytProvider.testConnection();
    return {
      ok: res.ok,
      latencyMs: res.latency || 0,
      error: res.ok ? undefined : res.message,
      details: res.message,
    };
  }

  async search(
    query: string,
    _credentials?: Record<string, any>,
    _page = 1,
    limit = 10
  ): Promise<PaginatedResult<MediaSearchResult>> {
    const tracks = await ytProvider.searchTracks(query, { limit });
    const results: MediaSearchResult[] = tracks.map((t) => ({
      provider: 'YouTube Music',
      externalId: t.providerTrackId,
      type: 'MUSIC',
      title: t.title,
      description: t.album || undefined,
      posterUrl: t.thumbnail || undefined,
      coverUrl: t.thumbnail || undefined,
      genres: [],
    }));
    return {
      results,
      hasMore: false,
    };
  }
}
