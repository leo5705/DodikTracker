import {
  MediaProvider,
  MediaSearchResult,
  ProviderHealthResult,
  MediaDetailExtended,
} from './types.ts';
import { TMDBProvider } from './tmdb.ts';
import { KinopoiskProvider } from './kinopoisk.ts';
import { RAWGProvider } from './rawg.ts';
import { TheGamesDBProvider } from './thegamesdb.ts';
import { IGDBProvider } from './igdb.ts';
import { AniListProvider } from './anilist.ts';
import { OpenLibraryProvider } from './openlibrary.ts';
import { db } from '../../db/index.ts';
import { systemIntegrations, apiLogs } from '../../db/schema.ts';
import { decryptCredentials } from '../../lib/crypto.ts';
import { eq } from 'drizzle-orm';

class ProviderManager {
  private providers: Map<string, MediaProvider> = new Map();
  private detailsCache: Map<string, { data: MediaSearchResult & MediaDetailExtended; expiresAt: number }> = new Map();

  constructor() {
    this.register(new TMDBProvider());
    this.register(new KinopoiskProvider());
    this.register(new RAWGProvider());
    this.register(new TheGamesDBProvider());
    this.register(new IGDBProvider());
    this.register(new AniListProvider());
    this.register(new OpenLibraryProvider());
  }

  register(provider: MediaProvider) {
    this.providers.set(provider.name.toUpperCase(), provider);
  }

  getProvider(name: string): MediaProvider | undefined {
    return this.providers.get(name.toUpperCase());
  }

  getAllProviders(): MediaProvider[] {
    return Array.from(this.providers.values());
  }

  async getCredentialsForProvider(name: string): Promise<{ enabled: boolean; priority: number; credentials?: Record<string, any> }> {
    try {
      const records = await db
        .select()
        .from(systemIntegrations)
        .where(eq(systemIntegrations.provider, name.toUpperCase()))
        .limit(1);

      if (records.length === 0) {
        return { enabled: false, priority: 99 };
      }

      const rec = records[0];
      const credentials = rec.encryptedCredentials ? decryptCredentials(rec.encryptedCredentials) : undefined;
      return { enabled: rec.enabled, priority: rec.priority || 1, credentials };
    } catch (err) {
      console.error(`Failed to fetch credentials for ${name}:`, err);
      return { enabled: false, priority: 99 };
    }
  }

  async getDetails(
    providerName: string,
    externalId: string,
    mediaType?: string
  ): Promise<(MediaSearchResult & MediaDetailExtended) | null> {
    const cacheKey = `${providerName.toUpperCase()}_${mediaType || 'ALL'}_${externalId}`;
    const cached = this.detailsCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const provider = this.getProvider(providerName);
    if (!provider || !provider.getDetails) {
      return null;
    }

    const { enabled, credentials } = await this.getCredentialsForProvider(provider.name);
    if (provider.requiresKey && (!enabled || !credentials)) {
      return null;
    }

    const start = Date.now();
    try {
      let details = await provider.getDetails(externalId, mediaType, credentials);
      const latencyMs = Date.now() - start;

      await db.insert(apiLogs).values({
        provider: provider.name,
        endpoint: `details?id=${externalId}&type=${mediaType || ''}`,
        status: details ? 200 : 404,
        latencyMs,
      }).catch(() => {});

      if (details) {
        // If it's a game, run multi-provider enrichment to backfill missing screenshots/videos
        if (details.type === 'GAME') {
          details = await this.enrichGameDetails(details);
        }

        // Cache for 30 minutes
        this.detailsCache.set(cacheKey, {
          data: details,
          expiresAt: Date.now() + 30 * 60 * 1000,
        });
      }

      return details;
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      await db.insert(apiLogs).values({
        provider: provider.name,
        endpoint: `details?id=${externalId}&type=${mediaType || ''}`,
        status: 500,
        latencyMs,
        error: err.message,
      }).catch(() => {});
      return null;
    }
  }

  /**
   * Multi-source fallback & enrichment for games
   * If the primary provider lacks screenshots, videos/trailers, developers, or description,
   * seamlessly enrich from another active game provider (RAWG, THEGAMESDB, IGDB) without fake data.
   */
  async enrichGameDetails(
    details: MediaSearchResult & MediaDetailExtended
  ): Promise<MediaSearchResult & MediaDetailExtended> {
    const needsScreenshots = !details.screenshots || details.screenshots.length === 0;
    const needsVideos = !details.videos || details.videos.length === 0;
    const needsDevelopers = !details.developers || details.developers.length === 0;
    const needsPublishers = !details.publishers || details.publishers.length === 0;
    const needsDescription = !details.description;
    const needsRating = details.rating === undefined;

    if (!needsScreenshots && !needsVideos && !needsDevelopers && !needsPublishers && !needsDescription && !needsRating) {
      return details;
    }

    const queryTitle = details.originalTitle || details.title;
    if (!queryTitle) return details;

    const allGameProviders = ['RAWG', 'THEGAMESDB', 'IGDB'].filter(
      (p) => p !== details.provider.toUpperCase()
    );

    for (const altProviderName of allGameProviders) {
      const { enabled, credentials } = await this.getCredentialsForProvider(altProviderName);
      const altProvider = this.getProvider(altProviderName);
      if (!altProvider || (altProvider.requiresKey && (!enabled || !credentials))) {
        continue;
      }

      try {
        const searchItems = await altProvider.search(queryTitle, credentials);
        if (searchItems.length === 0) continue;

        // Find the best match
        const lowerQ = queryTitle.toLowerCase().trim();
        const matched =
          searchItems.find((item) => {
            const t1 = item.title.toLowerCase().trim();
            const t2 = (item.originalTitle || '').toLowerCase().trim();
            return t1 === lowerQ || t2 === lowerQ;
          }) || searchItems[0];

        if (matched && altProvider.getDetails) {
          const altDetails = await altProvider.getDetails(matched.externalId, 'GAME', credentials);
          if (altDetails) {
            if (needsScreenshots && altDetails.screenshots && altDetails.screenshots.length > 0) {
              details.screenshots = altDetails.screenshots;
            }
            if (needsVideos && altDetails.videos && altDetails.videos.length > 0) {
              details.videos = altDetails.videos;
              if (!details.trailerUrl) details.trailerUrl = altDetails.trailerUrl;
            }
            if (needsDevelopers && altDetails.developers && altDetails.developers.length > 0) {
              details.developers = altDetails.developers;
            }
            if (needsPublishers && altDetails.publishers && altDetails.publishers.length > 0) {
              details.publishers = altDetails.publishers;
            }
            if (needsDescription && altDetails.description && !details.description) {
              details.description = altDetails.description;
            }
            if (needsRating && altDetails.rating !== undefined && details.rating === undefined) {
              details.rating = altDetails.rating;
            }
            if (!details.criticScore && altDetails.criticScore) {
              details.criticScore = altDetails.criticScore;
            }
            if (!details.website && altDetails.website) {
              details.website = altDetails.website;
            }
            if (!details.coverUrl && altDetails.coverUrl) {
              details.coverUrl = altDetails.coverUrl;
            }
            break;
          }
        }
      } catch (err) {
        console.warn(`[ProviderManager] Enrichment from ${altProviderName} failed:`, err);
      }
    }

    return details;
  }

  async search(query: string, typeFilter?: string): Promise<MediaSearchResult[]> {
    const results: MediaSearchResult[] = [];
    const allProviders = this.getAllProviders();

    // Fetch integration statuses to respect priority
    const providerStatuses: Array<{ provider: MediaProvider; priority: number; credentials?: Record<string, any> }> = [];

    for (const provider of allProviders) {
      if (typeFilter && !provider.supportedTypes.includes(typeFilter)) {
        continue;
      }
      const { enabled, priority, credentials } = await this.getCredentialsForProvider(provider.name);
      if (provider.requiresKey && (!enabled || !credentials)) {
        continue;
      }
      providerStatuses.push({ provider, priority, credentials });
    }

    // Sort by priority (1 is highest priority)
    providerStatuses.sort((a, b) => a.priority - b.priority);

    for (const { provider, credentials } of providerStatuses) {
      const start = Date.now();
      try {
        const items = await provider.search(query, credentials);
        const latencyMs = Date.now() - start;

        await db.insert(apiLogs).values({
          provider: provider.name,
          endpoint: `search?q=${query}`,
          status: 200,
          latencyMs,
        }).catch(() => {});

        results.push(...items);
      } catch (err: any) {
        const latencyMs = Date.now() - start;
        await db.insert(apiLogs).values({
          provider: provider.name,
          endpoint: `search?q=${query}`,
          status: 500,
          latencyMs,
          error: err.message,
        }).catch(() => {});
      }
    }

    return results;
  }

  async getTrending(type: string = 'MOVIE'): Promise<MediaSearchResult[]> {
    const allProviders = this.getAllProviders();
    const results: MediaSearchResult[] = [];

    for (const provider of allProviders) {
      if (!provider.supportedTypes.includes(type) || !provider.getTrending) {
        continue;
      }

      const { enabled, credentials } = await this.getCredentialsForProvider(provider.name);
      if (provider.requiresKey && (!enabled || !credentials)) {
        continue;
      }

      try {
        const items = await provider.getTrending(type, credentials);
        results.push(...items);
      } catch (err) {
        console.error(`Error fetching trending from ${provider.name}:`, err);
      }
    }

    return results;
  }

  async healthCheck(providerName: string, customCredentials?: Record<string, any>): Promise<ProviderHealthResult> {
    const provider = this.getProvider(providerName);
    if (!provider) {
      return { ok: false, latencyMs: 0, error: `Провайдер ${providerName} не найден` };
    }

    let creds = customCredentials;
    if (!creds) {
      const stored = await this.getCredentialsForProvider(providerName);
      creds = stored.credentials;
    }

    const start = Date.now();
    try {
      const result = await provider.healthCheck(creds);
      const latencyMs = Date.now() - start;

      await db.insert(apiLogs).values({
        provider: provider.name,
        endpoint: 'health_check',
        status: result.ok ? 200 : 400,
        latencyMs,
        error: result.error,
      }).catch(() => {});

      return result;
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message };
    }
  }
}

export const providerManager = new ProviderManager();
