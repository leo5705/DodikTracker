import { db } from '../../db/index.ts';
import {
  media,
  mediaExternalIds,
  systemIntegrations,
  gameEntityCache,
  gameEntityMappings,
} from '../../db/schema.ts';
import { decryptCredentials } from '../../lib/crypto.ts';
import { eq, and, sql, desc, ilike, or } from 'drizzle-orm';
import { RAWGGameProvider } from './providers/rawgGameProvider.ts';
import { GMDBGameProvider } from './providers/gmdbGameProvider.ts';
import { GameMatcher } from './matcher.ts';
import { GameTranslator } from '../services/gameTranslator.ts';
import { providerManager } from '../providers/index.ts';
import {
  UnifiedGame,
  UnifiedGameSummary,
  UnifiedDeveloper,
  UnifiedPublisher,
  UnifiedSeries,
  UnifiedDLC,
  UnifiedScreenshot,
  UnifiedVideo,
  UnifiedStore,
  UnifiedCreator,
  UnifiedGenre,
  UnifiedPlatform,
  GameAdminDiagnostic,
  GameCatalogFilters,
} from '../../types/unifiedGame.ts';
import { RawGameData } from './types.ts';

export class UnifiedGameService {
  private static instance: UnifiedGameService;
  private rawgProvider: RAWGGameProvider;
  private gmdbProvider: GMDBGameProvider;

  // In-memory caching layer
  private memoryCache: Map<string, { data: any; expiresAt: number; sources?: any }> = new Map();

  private constructor() {
    this.rawgProvider = new RAWGGameProvider();
    this.gmdbProvider = new GMDBGameProvider();
  }

  public static getInstance(): UnifiedGameService {
    if (!UnifiedGameService.instance) {
      UnifiedGameService.instance = new UnifiedGameService();
    }
    return UnifiedGameService.instance;
  }

  /**
   * Decrypt credentials for game providers from system integrations table
   */
  private async getProviderCredentials(
    providerName: 'RAWG' | 'THEGAMESDB' | 'GMDB' | 'IGDB'
  ): Promise<Record<string, any> | undefined> {
    try {
      const targetNames =
        providerName === 'GMDB' || providerName === 'THEGAMESDB'
          ? ['THEGAMESDB', 'GMDB']
          : [providerName];

      const records = await db
        .select()
        .from(systemIntegrations)
        .where(
          sql`${systemIntegrations.provider} IN (${sql.join(
            targetNames.map((n) => sql`${n}`),
            sql`, `
          )})`
        );

      const enabledRec = records.find((r) => r.enabled) || records[0];
      if (!enabledRec || !enabledRec.encryptedCredentials) return undefined;

      const decrypted = decryptCredentials(enabledRec.encryptedCredentials);
      return decrypted;
    } catch (err) {
      console.warn(`[UnifiedGameService] Failed to load credentials for ${providerName}:`, err);
      return undefined;
    }
  }

  /**
   * Retrieve from in-memory or database cache
   */
  private async getFromCache<T>(cacheKey: string): Promise<{ data: T; sources?: any; expiresAt?: string } | null> {
    const now = Date.now();

    // 1. Check memory cache
    const mem = this.memoryCache.get(cacheKey);
    if (mem && mem.expiresAt > now) {
      return { data: mem.data, sources: mem.sources, expiresAt: new Date(mem.expiresAt).toISOString() };
    }

    // 2. Check Cloud SQL cache
    try {
      const cached = await db
        .select()
        .from(gameEntityCache)
        .where(eq(gameEntityCache.cacheKey, cacheKey))
        .limit(1);

      if (cached.length > 0) {
        const row = cached[0];
        if (row.expiresAt && row.expiresAt.getTime() > now) {
          const parsed = JSON.parse(row.data);
          const sources = row.providerSources ? JSON.parse(row.providerSources) : undefined;
          // Hydrate memory cache
          this.memoryCache.set(cacheKey, { data: parsed, expiresAt: row.expiresAt.getTime(), sources });
          return { data: parsed, sources, expiresAt: row.expiresAt.toISOString() };
        }
      }
    } catch (err) {
      console.warn(`[UnifiedGameService] DB cache read error:`, err);
    }

    return null;
  }

  /**
   * Save item to in-memory and database cache
   */
  private async setCache(cacheKey: string, entityType: string, data: any, ttlSeconds: number, sources?: any) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    this.memoryCache.set(cacheKey, { data, expiresAt: expiresAt.getTime(), sources });

    try {
      const dataStr = JSON.stringify(data);
      const sourcesStr = sources ? JSON.stringify(sources) : null;

      await db
        .insert(gameEntityCache)
        .values({
          cacheKey,
          entityType,
          data: dataStr,
          providerSources: sourcesStr,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: gameEntityCache.cacheKey,
          set: {
            data: dataStr,
            providerSources: sourcesStr,
            expiresAt,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      console.warn(`[UnifiedGameService] DB cache write error:`, err);
    }
  }

  /**
   * Build complete UnifiedGame object from a local database `media` record
   */
  private buildUnifiedGameFromLocalMedia(
    mediaRow: typeof media.$inferSelect,
    extIds: { provider: string; externalId: string }[] = []
  ): UnifiedGame {
    const extMap: Record<string, string> = {};
    extIds.forEach((e) => {
      extMap[e.provider.toUpperCase()] = e.externalId;
    });

    let parsedGenres: UnifiedGenre[] = [];
    if (mediaRow.genres) {
      try {
        const gList = mediaRow.genres.startsWith('[')
          ? JSON.parse(mediaRow.genres)
          : mediaRow.genres.split(',').map((s: string) => s.trim());
        parsedGenres = gList.map((g: string, i: number) => ({
          id: `local-g-${i}`,
          name: g,
          slug: g.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '-'),
        }));
      } catch {
        parsedGenres = [{ id: 'local-g-0', name: mediaRow.genres, slug: 'general' }];
      }
    }

    return {
      id: mediaRow.id,
      mediaId: mediaRow.id,
      slug: String(mediaRow.id),
      title: mediaRow.title,
      originalTitle: mediaRow.originalTitle || mediaRow.title,
      description: mediaRow.description || undefined,
      releaseDate: mediaRow.releaseDate || (mediaRow.year ? `${mediaRow.year}-01-01` : undefined),
      year: mediaRow.year || undefined,
      rating: mediaRow.rating || undefined,
      rawgRating: mediaRow.rating ? Math.round((mediaRow.rating / 2) * 10) / 10 : undefined,
      posterUrl: mediaRow.posterUrl || undefined,
      backdropUrl: mediaRow.backdropUrl || mediaRow.posterUrl || undefined,
      coverUrl: mediaRow.posterUrl || undefined,
      genres: parsedGenres,
      tags: [],
      platforms: [{ id: 'pc', name: 'PC', slug: 'pc' }],
      developers: [],
      publishers: [],
      series: null,
      dlcs: [],
      stores: [],
      screenshots: [],
      videos: [],
      creators: [],
      similar: [],
      externalIds: {
        rawg: extMap['RAWG'],
        gmdb: extMap['THEGAMESDB'] || extMap['GMDB'],
        igdb: extMap['IGDB'],
      },
      providerMeta: {
        sources: {
          title: 'LOCAL',
          description: 'LOCAL',
          coverUrl: 'LOCAL',
          releaseDate: 'LOCAL',
          rating: 'LOCAL',
          genres: 'LOCAL',
          platforms: 'LOCAL',
          developers: 'LOCAL',
          publishers: 'LOCAL',
        },
        lastSyncedAt: new Date().toISOString(),
        rawgAvailable: false,
        gmdbAvailable: false,
      },
    };
  }

  public async invalidateGameCache(idOrSlug?: string | number, externalIds?: string[]) {
    if (idOrSlug !== undefined && idOrSlug !== null) {
      const slugStr = String(idOrSlug);
      this.memoryCache.delete(`game:details:${slugStr}`);
      try {
        await db.delete(gameEntityCache).where(eq(gameEntityCache.cacheKey, `game:details:${slugStr}`));
      } catch {}
    }
    if (externalIds && externalIds.length > 0) {
      for (const ext of externalIds) {
        this.memoryCache.delete(`game:details:${ext}`);
        try {
          await db.delete(gameEntityCache).where(eq(gameEntityCache.cacheKey, `game:details:${ext}`));
        } catch {}
      }
    }
    // Clear search and catalog memory caches to reflect visibility changes
    for (const key of Array.from(this.memoryCache.keys())) {
      if (key.startsWith('game:search:') || key.startsWith('game:catalog:')) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Convert IGDB MediaDetailExtended object to RawGameData for merging
   */
  private convertIgdbToRawGameData(igdb: any): RawGameData {
    const rawGenres = (igdb.genres || []).map((g: string, i: number) => ({
      id: `igdb-g-${i}`,
      name: g,
      slug: g.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '-'),
    }));

    const rawPlatforms = (igdb.platforms || []).map((p: string, i: number) => ({
      id: `igdb-p-${i}`,
      name: p,
      slug: p.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '-'),
    }));

    const rawDevs = (igdb.developers || []).map((d: string, i: number) => ({
      id: `igdb-d-${i}`,
      name: d,
      slug: d.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '-'),
    }));

    const rawPubs = (igdb.publishers || []).map((p: string, i: number) => ({
      id: `igdb-pub-${i}`,
      name: p,
      slug: p.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '-'),
    }));

    const rawScreenshots = (igdb.screenshots || []).map((url: string, i: number) => ({
      id: `igdb-ss-${i}`,
      url,
    }));

    const rawVideos = (igdb.videos || []).map((v: any, i: number) => ({
      id: `igdb-v-${i}`,
      title: v.title || 'Official Trailer',
      url: v.url,
      site: v.site || 'YouTube',
      key: v.key,
      type: v.type || 'Trailer',
    }));

    return {
      externalId: String(igdb.externalId),
      provider: 'GMDB', // Treated as secondary provider for merge logic
      slug: igdb.slug || String(igdb.externalId),
      title: igdb.title,
      originalTitle: igdb.originalTitle,
      description: igdb.description,
      releaseDate: igdb.releaseDate,
      year: igdb.year,
      rating: igdb.rating,
      posterUrl: igdb.posterUrl,
      backdropUrl: igdb.backdropUrl,
      coverUrl: igdb.coverUrl || igdb.posterUrl,
      website: igdb.website,
      genres: rawGenres,
      tags: [],
      platforms: rawPlatforms,
      developers: rawDevs,
      publishers: rawPubs,
      screenshots: rawScreenshots,
      videos: rawVideos,
    };
  }

  /**
   * Retrieve Unified Game Details by internal ID, media DB ID, RAWG id/slug, IGDB id, or GMDB id
   */
  public async getGameDetails(idOrSlug: string): Promise<UnifiedGame | null> {
    const cacheKey = `game:details:${idOrSlug}`;
    const cached = await this.getFromCache<UnifiedGame>(cacheKey);
    if (cached) return cached.data;

    const [rawgCreds, gmdbCreds, igdbCreds] = await Promise.all([
      this.getProviderCredentials('RAWG'),
      this.getProviderCredentials('THEGAMESDB'),
      this.getProviderCredentials('IGDB'),
    ]);

    let rawgId: string | undefined;
    let gmdbId: string | undefined;
    let igdbId: string | undefined;
    let mediaId: number | undefined;
    let localMediaRow: typeof media.$inferSelect | undefined;
    let externalIdsList: { provider: string; externalId: string }[] = [];

    // 1. Check if idOrSlug is numeric Media ID from DB
    if (/^\d+$/.test(idOrSlug)) {
      const numId = parseInt(idOrSlug, 10);
      const rows = await db.select().from(media).where(eq(media.id, numId)).limit(1);
      if (rows.length > 0) {
        localMediaRow = rows[0];
        mediaId = numId;
      }

      const extIds = await db
        .select({ provider: mediaExternalIds.provider, externalId: mediaExternalIds.externalId })
        .from(mediaExternalIds)
        .where(eq(mediaExternalIds.mediaId, numId));

      externalIdsList = extIds;

      if (extIds.length > 0) {
        for (const ext of extIds) {
          const prov = ext.provider.toUpperCase();
          if (prov === 'RAWG') rawgId = ext.externalId;
          if (prov === 'THEGAMESDB' || prov === 'GMDB') gmdbId = ext.externalId;
          if (prov === 'IGDB') igdbId = ext.externalId;
        }
      } else {
        rawgId = idOrSlug;
      }
    } else {
      rawgId = idOrSlug;
      // Check if there is an externalId mapping in DB
      const extMatch = await db
        .select()
        .from(mediaExternalIds)
        .where(eq(mediaExternalIds.externalId, idOrSlug))
        .limit(1);

      if (extMatch.length > 0) {
        mediaId = extMatch[0].mediaId;
        const rows = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
        if (rows.length > 0) localMediaRow = rows[0];

        const allExt = await db
          .select({ provider: mediaExternalIds.provider, externalId: mediaExternalIds.externalId })
          .from(mediaExternalIds)
          .where(eq(mediaExternalIds.mediaId, mediaId));
        externalIdsList = allExt;
        for (const ext of allExt) {
          const prov = ext.provider.toUpperCase();
          if (prov === 'RAWG') rawgId = ext.externalId;
          if (prov === 'THEGAMESDB' || prov === 'GMDB') gmdbId = ext.externalId;
          if (prov === 'IGDB') igdbId = ext.externalId;
        }
      }
    }

    // Check known gameEntityMappings if GMDB ID is not resolved yet
    if (rawgId && !gmdbId) {
      try {
        const mapping = await db
          .select()
          .from(gameEntityMappings)
          .where(
            and(
              eq(gameEntityMappings.entityType, 'GAME'),
              eq(gameEntityMappings.provider, 'GMDB'),
              eq(gameEntityMappings.internalId, rawgId)
            )
          )
          .limit(1);
        if (mapping.length > 0) {
          gmdbId = mapping[0].externalId;
        }
      } catch (_e) {}
    }

    // 2. Fetch primary data concurrently from available external providers
    const [rawgGame, gmdbGame, igdbRaw] = await Promise.all([
      rawgId && rawgCreds ? this.rawgProvider.getGame(rawgId, rawgCreds).catch(() => null) : Promise.resolve(null),
      gmdbId && gmdbCreds ? this.gmdbProvider.getGame(gmdbId, gmdbCreds).catch(() => null) : Promise.resolve(null),
      igdbId && igdbCreds
        ? providerManager.getDetails('IGDB', igdbId, 'GAME').catch(() => null)
        : Promise.resolve(null),
    ]);

    let secondaryGame = gmdbGame;
    if (!secondaryGame && igdbRaw) {
      secondaryGame = this.convertIgdbToRawGameData(igdbRaw);
    }

    // Fallback: If we have RAWG data and no secondary data, attempt GMDB search to enrich
    if (rawgGame && !secondaryGame && gmdbCreds) {
      try {
        const gmdbSearch = await this.gmdbProvider.searchGames(rawgGame.title, { limit: 5 }, gmdbCreds);
        for (const candidate of gmdbSearch.results) {
          const match = GameMatcher.evaluateMatch(rawgGame, candidate);
          if (match.confidence === 'HIGH') {
            const enriched = await this.gmdbProvider.getGame(candidate.externalId, gmdbCreds);
            if (enriched) {
              secondaryGame = enriched;
              await db
                .insert(gameEntityMappings)
                .values({
                  entityType: 'GAME',
                  internalId: rawgGame.slug || String(rawgGame.externalId),
                  provider: 'GMDB',
                  externalId: candidate.externalId,
                  confidence: 'HIGH',
                  metadata: JSON.stringify({ matchReasons: match.reasons }),
                })
                .catch(() => {});
              break;
            }
          }
        }
      } catch (err) {
        console.warn('[UnifiedGameService] Secondary GMDB matching failed:', err);
      }
    }

    // Fallback if no RAWG or GMDB data, but we have IGDB or local media record:
    if (!rawgGame && !secondaryGame) {
      // If local DB record exists, return formatted UnifiedGame
      if (localMediaRow) {
        const localUnified = this.buildUnifiedGameFromLocalMedia(localMediaRow, externalIdsList);
        await this.setCache(cacheKey, 'GAME', localUnified, 86400, localUnified.providerMeta.sources);
        return localUnified;
      }
      return null;
    }

    const primarySlug = rawgGame?.slug || secondaryGame?.slug || idOrSlug;

    // 3. Fetch supplemental data concurrently
    const [
      series,
      dlcs,
      screenshotsRawg,
      screenshotsGmdb,
      videosRawg,
      stores,
      creators,
      similar,
      translation,
    ] = await Promise.all([
      rawgGame && rawgCreds ? this.rawgProvider.getSeries(primarySlug, rawgCreds).catch(() => null) : Promise.resolve(null),
      rawgGame && rawgCreds ? this.rawgProvider.getDLCs(primarySlug, rawgCreds).catch(() => []) : Promise.resolve([]),
      rawgGame && rawgCreds ? this.rawgProvider.getScreenshots(primarySlug, rawgCreds).catch(() => []) : Promise.resolve([]),
      secondaryGame && gmdbCreds ? this.gmdbProvider.getScreenshots(secondaryGame.externalId, gmdbCreds).catch(() => []) : Promise.resolve([]),
      rawgGame && rawgCreds ? this.rawgProvider.getVideos(primarySlug, rawgCreds).catch(() => []) : Promise.resolve([]),
      rawgGame && rawgCreds ? this.rawgProvider.getStores(primarySlug, rawgCreds).catch(() => []) : Promise.resolve([]),
      rawgGame && rawgCreds ? this.rawgProvider.getCreators(primarySlug, rawgCreds).catch(() => []) : Promise.resolve([]),
      rawgGame && rawgCreds ? this.rawgProvider.getSimilar(primarySlug, rawgCreds).catch(() => []) : Promise.resolve([]),
      GameTranslator.translateGame({
        provider: rawgGame ? 'RAWG' : (igdbRaw ? 'IGDB' : 'THEGAMESDB'),
        externalId: rawgGame?.externalId || secondaryGame?.externalId || idOrSlug,
        title: rawgGame?.title || secondaryGame?.title || localMediaRow?.title || 'Без названия',
        description: rawgGame?.description || secondaryGame?.description || localMediaRow?.description,
      }),
    ]);

    // Merge screenshots
    const combinedScreenshots: UnifiedScreenshot[] = [...screenshotsRawg];
    for (const ss of screenshotsGmdb) {
      if (!combinedScreenshots.some((existing) => existing.url === ss.url)) {
        combinedScreenshots.push(ss);
      }
    }

    // Merge into UnifiedGame
    const unified = GameMatcher.mergeGames(rawgGame, secondaryGame, {
      series,
      dlcs,
      screenshots: combinedScreenshots,
      videos: videosRawg,
      stores,
      creators,
      similar,
      translatedTitle:
        translation.title !== (rawgGame?.title || secondaryGame?.title) ? translation.title : undefined,
      translatedDesc: translation.description,
      internalId: primarySlug,
      mediaId: mediaId || localMediaRow?.id,
    });

    // If local record has higher priority overrides or custom cover
    if (localMediaRow) {
      if (localMediaRow.posterUrl && !unified.posterUrl) unified.posterUrl = localMediaRow.posterUrl;
      if (localMediaRow.backdropUrl && !unified.backdropUrl) unified.backdropUrl = localMediaRow.backdropUrl;
    }

    // Cache for 24 hours (86400 seconds)
    await this.setCache(cacheKey, 'GAME', unified, 86400, unified.providerMeta.sources);
    return unified;
  }

  /**
   * Search games across RAWG, GMDB, IGDB, and local database with deduplication and filters
   */
  public async searchGames(
    query: string,
    filters?: GameCatalogFilters
  ): Promise<{ results: UnifiedGameSummary[]; total: number; hasMore: boolean; page: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const cacheKey = `game:search:${query}:${JSON.stringify(filters || {})}`;

    const cached = await this.getFromCache<{
      results: UnifiedGameSummary[];
      total: number;
      hasMore: boolean;
      page: number;
    }>(cacheKey);
    if (cached) return cached.data;

    const [rawgCreds, gmdbCreds, igdbCreds] = await Promise.all([
      this.getProviderCredentials('RAWG'),
      this.getProviderCredentials('THEGAMESDB'),
      this.getProviderCredentials('IGDB'),
    ]);

    // Fetch in parallel
    const [rawgRes, gmdbRes, igdbRes, localGames] = await Promise.all([
      rawgCreds
        ? this.rawgProvider.searchGames(query, filters, rawgCreds).catch(() => ({ results: [], total: 0, hasMore: false }))
        : Promise.resolve({ results: [], total: 0, hasMore: false }),
      gmdbCreds && query.trim()
        ? this.gmdbProvider.searchGames(query, filters, gmdbCreds).catch(() => ({ results: [], total: 0, hasMore: false }))
        : Promise.resolve({ results: [], total: 0, hasMore: false }),
      igdbCreds && query.trim()
        ? (providerManager.getProvider('IGDB')?.search?.(query, igdbCreds, page, limit, { type: 'GAME' }) as Promise<any>).catch(() => ({ results: [], hasMore: false }))
        : Promise.resolve({ results: [], hasMore: false }),
      db
        .select()
        .from(media)
        .where(
          and(
            eq(media.type, 'GAME'),
            eq(media.isHidden, false),
            query.trim()
              ? or(
                  ilike(media.title, `%${query.trim()}%`),
                  media.originalTitle ? ilike(media.originalTitle, `%${query.trim()}%`) : undefined
                )
              : undefined
          )
        )
        .limit(limit)
        .catch(() => []),
    ]);

    const combinedMap = new Map<string, UnifiedGameSummary>();

    // 1. Process local database matches
    for (const lm of (localGames || [])) {
      const norm = GameMatcher.normalizeTitle(lm.title);
      combinedMap.set(norm, {
        id: lm.id,
        mediaId: lm.id,
        slug: String(lm.id),
        title: lm.title,
        originalTitle: lm.originalTitle || undefined,
        posterUrl: lm.posterUrl || undefined,
        backdropUrl: lm.backdropUrl || undefined,
        coverUrl: lm.posterUrl || undefined,
        releaseDate: lm.releaseDate || undefined,
        year: lm.year || undefined,
        rating: lm.rating || undefined,
      });
    }

    // 2. Process RAWG results
    for (const rg of (rawgRes.results || [])) {
      const norm = GameMatcher.normalizeTitle(rg.title);
      const existing = combinedMap.get(norm);
      const summary: UnifiedGameSummary = {
        id: existing?.mediaId || rg.slug || rg.externalId,
        mediaId: existing?.mediaId,
        slug: rg.slug || rg.externalId,
        title: rg.title,
        originalTitle: rg.originalTitle,
        posterUrl: rg.posterUrl || existing?.posterUrl,
        backdropUrl: rg.backdropUrl || existing?.backdropUrl,
        coverUrl: rg.coverUrl || existing?.coverUrl,
        releaseDate: rg.releaseDate || existing?.releaseDate,
        year: rg.year || existing?.year,
        rating: rg.rating || existing?.rating,
        ratingCount: rg.ratingCount,
        metacritic: rg.metacritic,
        genres: rg.genres.map((g) => g.name),
        platforms: rg.platforms.map((p) => p.name),
      };
      combinedMap.set(norm, summary);
    }

    // 3. Process GMDB results
    for (const gg of (gmdbRes.results || [])) {
      const norm = GameMatcher.normalizeTitle(gg.title);
      const existing = combinedMap.get(norm);

      if (existing) {
        if (!existing.posterUrl && gg.posterUrl) existing.posterUrl = gg.posterUrl;
        if (!existing.coverUrl && gg.coverUrl) existing.coverUrl = gg.coverUrl;
        if (!existing.year && gg.year) existing.year = gg.year;
      } else {
        combinedMap.set(norm, {
          id: gg.slug || gg.externalId,
          slug: gg.slug || gg.externalId,
          title: gg.title,
          originalTitle: gg.originalTitle,
          posterUrl: gg.posterUrl,
          backdropUrl: gg.backdropUrl,
          coverUrl: gg.coverUrl,
          releaseDate: gg.releaseDate,
          year: gg.year,
          rating: gg.rating,
          genres: gg.genres.map((g) => g.name),
          platforms: gg.platforms.map((p) => p.name),
        });
      }
    }

    // 4. Process IGDB results
    if (igdbRes && Array.isArray((igdbRes as any).results)) {
      for (const ig of (igdbRes as any).results) {
        const norm = GameMatcher.normalizeTitle(ig.title);
        const existing = combinedMap.get(norm);
        if (existing) {
          if (!existing.posterUrl && ig.posterUrl) existing.posterUrl = ig.posterUrl;
          if (!existing.year && ig.year) existing.year = ig.year;
        } else {
          combinedMap.set(norm, {
            id: ig.externalId,
            slug: ig.externalId,
            title: ig.title,
            originalTitle: ig.originalTitle,
            posterUrl: ig.posterUrl,
            backdropUrl: ig.backdropUrl,
            coverUrl: ig.posterUrl,
            releaseDate: ig.releaseDate,
            year: ig.year,
            rating: ig.rating,
            genres: ig.genres,
            platforms: ig.platforms,
          });
        }
      }
    }

    const results = Array.from(combinedMap.values());
    const total = results.length;
    const hasMore = (rawgRes.hasMore || gmdbRes.hasMore || (igdbRes as any)?.hasMore) ?? false;

    const payload = { results, total, hasMore, page };
    await this.setCache(cacheKey, 'SEARCH', payload, 3600);
    return payload;
  }

  /**
   * Catalog / browse games with deep filtering & graceful fallback when RAWG key is missing
   */
  public async getCatalog(
    filters: GameCatalogFilters
  ): Promise<{ results: UnifiedGameSummary[]; total: number; hasMore: boolean; page: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const cacheKey = `game:catalog:${JSON.stringify(filters)}`;

    const cached = await this.getFromCache<{
      results: UnifiedGameSummary[];
      total: number;
      hasMore: boolean;
      page: number;
    }>(cacheKey);
    if (cached) return cached.data;

    const rawgCreds = await this.getProviderCredentials('RAWG');

    if (rawgCreds) {
      try {
        const rawgRes = await this.rawgProvider.getCatalog(filters, rawgCreds);
        if (rawgRes && rawgRes.results && rawgRes.results.length > 0) {
          const results: UnifiedGameSummary[] = rawgRes.results.map((rg) => ({
            id: rg.slug || rg.externalId,
            slug: rg.slug || rg.externalId,
            title: rg.title,
            originalTitle: rg.originalTitle,
            posterUrl: rg.posterUrl,
            backdropUrl: rg.backdropUrl,
            coverUrl: rg.coverUrl,
            releaseDate: rg.releaseDate,
            year: rg.year,
            rating: rg.rating,
            ratingCount: rg.ratingCount,
            metacritic: rg.metacritic,
            genres: rg.genres.map((g) => g.name),
            platforms: rg.platforms.map((p) => p.name),
          }));

          const payload = {
            results,
            total: rawgRes.total || results.length,
            hasMore: rawgRes.hasMore,
            page,
          };

          await this.setCache(cacheKey, 'CATALOG', payload, 3600);
          return payload;
        }
      } catch (err) {
        console.warn('[UnifiedGameService] RAWG catalog fetch failed, falling back to local DB/IGDB:', err);
      }
    }

    // Fallback to local database `media` table
    const offset = (page - 1) * limit;
    const localGames = await db
      .select()
      .from(media)
      .where(and(eq(media.type, 'GAME'), eq(media.isHidden, false)))
      .orderBy(desc(media.rating), desc(media.id))
      .limit(limit)
      .offset(offset)
      .catch(() => []);

    const results: UnifiedGameSummary[] = localGames.map((lm) => {
      let parsedGenres: string[] = [];
      if (lm.genres) {
        try {
          parsedGenres = lm.genres.startsWith('[') ? JSON.parse(lm.genres) : [lm.genres];
        } catch {
          parsedGenres = [lm.genres];
        }
      }
      return {
        id: lm.id,
        mediaId: lm.id,
        slug: String(lm.id),
        title: lm.title,
        originalTitle: lm.originalTitle || undefined,
        posterUrl: lm.posterUrl || undefined,
        backdropUrl: lm.backdropUrl || undefined,
        coverUrl: lm.posterUrl || undefined,
        releaseDate: lm.releaseDate || undefined,
        year: lm.year || undefined,
        rating: lm.rating || undefined,
        genres: parsedGenres,
        platforms: ['PC'],
      };
    });

    const payload = {
      results,
      total: results.length,
      hasMore: results.length >= limit,
      page,
    };

    await this.setCache(cacheKey, 'CATALOG', payload, 3600);
    return payload;
  }

  /**
   * Get Developer details
   */
  public async getDeveloper(idOrSlug: string): Promise<UnifiedDeveloper | null> {
    const cacheKey = `game:developer:${idOrSlug}`;
    const cached = await this.getFromCache<UnifiedDeveloper>(cacheKey);
    if (cached) return cached.data;

    const rawgCreds = await this.getProviderCredentials('RAWG');
    if (!rawgCreds) return null;

    try {
      const dev = await this.rawgProvider.getDeveloper(idOrSlug, rawgCreds);
      if (!dev) return null;

      await this.setCache(cacheKey, 'DEVELOPER', dev, 86400);
      return dev;
    } catch {
      return null;
    }
  }

  /**
   * Get games by developer with pagination and sorting
   */
  public async getDeveloperGames(
    developerIdOrSlug: string,
    page = 1,
    limit = 20,
    sort = 'popularity'
  ): Promise<{ results: UnifiedGameSummary[]; total: number; hasMore: boolean; page: number }> {
    const cacheKey = `game:developer_games:${developerIdOrSlug}:${page}:${limit}:${sort}`;
    const cached = await this.getFromCache<{
      results: UnifiedGameSummary[];
      total: number;
      hasMore: boolean;
      page: number;
    }>(cacheKey);
    if (cached) return cached.data;

    const rawgCreds = await this.getProviderCredentials('RAWG');
    if (!rawgCreds) return { results: [], total: 0, hasMore: false, page };

    try {
      const res = await this.rawgProvider.getGamesByDeveloper(developerIdOrSlug, page, limit, sort, rawgCreds);
      const results: UnifiedGameSummary[] = res.results.map((rg) => ({
        id: rg.slug || rg.externalId,
        slug: rg.slug || rg.externalId,
        title: rg.title,
        originalTitle: rg.originalTitle,
        posterUrl: rg.posterUrl,
        backdropUrl: rg.backdropUrl,
        coverUrl: rg.coverUrl,
        releaseDate: rg.releaseDate,
        year: rg.year,
        rating: rg.rating,
        ratingCount: rg.ratingCount,
        metacritic: rg.metacritic,
        genres: rg.genres.map((g) => g.name),
        platforms: rg.platforms.map((p) => p.name),
      }));

      const payload = { results, total: res.total || results.length, hasMore: res.hasMore, page };
      await this.setCache(cacheKey, 'DEVELOPER_GAMES', payload, 3600);
      return payload;
    } catch {
      return { results: [], total: 0, hasMore: false, page };
    }
  }

  /**
   * Get Publisher details
   */
  public async getPublisher(idOrSlug: string): Promise<UnifiedPublisher | null> {
    const cacheKey = `game:publisher:${idOrSlug}`;
    const cached = await this.getFromCache<UnifiedPublisher>(cacheKey);
    if (cached) return cached.data;

    const rawgCreds = await this.getProviderCredentials('RAWG');
    if (!rawgCreds) return null;

    try {
      const pub = await this.rawgProvider.getPublisher(idOrSlug, rawgCreds);
      if (!pub) return null;

      await this.setCache(cacheKey, 'PUBLISHER', pub, 86400);
      return pub;
    } catch {
      return null;
    }
  }

  /**
   * Get games by publisher with pagination and sorting
   */
  public async getPublisherGames(
    publisherIdOrSlug: string,
    page = 1,
    limit = 20,
    sort = 'popularity'
  ): Promise<{ results: UnifiedGameSummary[]; total: number; hasMore: boolean; page: number }> {
    const cacheKey = `game:publisher_games:${publisherIdOrSlug}:${page}:${limit}:${sort}`;
    const cached = await this.getFromCache<{
      results: UnifiedGameSummary[];
      total: number;
      hasMore: boolean;
      page: number;
    }>(cacheKey);
    if (cached) return cached.data;

    const rawgCreds = await this.getProviderCredentials('RAWG');
    if (!rawgCreds) return { results: [], total: 0, hasMore: false, page };

    try {
      const res = await this.rawgProvider.getGamesByPublisher(publisherIdOrSlug, page, limit, sort, rawgCreds);
      const results: UnifiedGameSummary[] = res.results.map((rg) => ({
        id: rg.slug || rg.externalId,
        slug: rg.slug || rg.externalId,
        title: rg.title,
        originalTitle: rg.originalTitle,
        posterUrl: rg.posterUrl,
        backdropUrl: rg.backdropUrl,
        coverUrl: rg.coverUrl,
        releaseDate: rg.releaseDate,
        year: rg.year,
        rating: rg.rating,
        ratingCount: rg.ratingCount,
        metacritic: rg.metacritic,
        genres: rg.genres.map((g) => g.name),
        platforms: rg.platforms.map((p) => p.name),
      }));

      const payload = { results, total: res.total || results.length, hasMore: res.hasMore, page };
      await this.setCache(cacheKey, 'PUBLISHER_GAMES', payload, 3600);
      return payload;
    } catch {
      return { results: [], total: 0, hasMore: false, page };
    }
  }

  /**
   * Get game series by game id/slug
   */
  public async getSeries(gameIdOrSlug: string): Promise<UnifiedSeries | null> {
    const rawgCreds = await this.getProviderCredentials('RAWG');
    if (!rawgCreds) return null;
    try {
      return await this.rawgProvider.getSeries(gameIdOrSlug, rawgCreds);
    } catch {
      return null;
    }
  }

  /**
   * Get DLCs for game
   */
  public async getDLCs(gameIdOrSlug: string): Promise<UnifiedDLC[]> {
    const rawgCreds = await this.getProviderCredentials('RAWG');
    if (!rawgCreds) return [];
    try {
      return await this.rawgProvider.getDLCs(gameIdOrSlug, rawgCreds);
    } catch {
      return [];
    }
  }

  /**
   * Get Developers catalog / search
   */
  public async getDevelopersList(
    page = 1,
    limit = 20,
    search?: string
  ): Promise<{ results: UnifiedDeveloper[]; total: number; hasMore: boolean }> {
    const rawgCreds = await this.getProviderCredentials('RAWG');
    if (!rawgCreds) return { results: [], total: 0, hasMore: false };
    try {
      const res = await this.rawgProvider.getDevelopersList(page, limit, search, rawgCreds);
      return { results: res.results, total: res.total || res.results.length, hasMore: res.hasMore };
    } catch {
      return { results: [], total: 0, hasMore: false };
    }
  }

  /**
   * Get Publishers catalog / search
   */
  public async getPublishersList(
    page = 1,
    limit = 20,
    search?: string
  ): Promise<{ results: UnifiedPublisher[]; total: number; hasMore: boolean }> {
    const rawgCreds = await this.getProviderCredentials('RAWG');
    if (!rawgCreds) return { results: [], total: 0, hasMore: false };
    try {
      const res = await this.rawgProvider.getPublishersList(page, limit, search, rawgCreds);
      return { results: res.results, total: res.total || res.results.length, hasMore: res.hasMore };
    } catch {
      return { results: [], total: 0, hasMore: false };
    }
  }

  /**
   * Get Admin Diagnostic data for a specific game
   */
  public async getGameDiagnostic(idOrSlug: string): Promise<GameAdminDiagnostic | null> {
    const [rawgCreds, gmdbCreds] = await Promise.all([
      this.getProviderCredentials('RAWG'),
      this.getProviderCredentials('THEGAMESDB'),
    ]);

    const [rawgHealth, gmdbHealth] = await Promise.all([
      this.rawgProvider.healthCheck(rawgCreds),
      this.gmdbProvider.healthCheck(gmdbCreds),
    ]);

    const game = await this.getGameDetails(idOrSlug);
    if (!game) return null;

    const cacheKey = `game:details:${idOrSlug}`;
    const cacheEntry = await this.getFromCache<UnifiedGame>(cacheKey);

    const fieldProvenance: Record<string, { source: string; isFallback: boolean; originalValueSnippet?: string }> = {};
    for (const [field, src] of Object.entries(game.providerMeta.sources)) {
      fieldProvenance[field] = {
        source: src,
        isFallback: src === 'GMDB' && !game.providerMeta.rawgAvailable,
      };
    }

    return {
      internalId: game.id,
      slug: game.slug,
      mediaId: game.mediaId,
      externalIds: game.externalIds,
      providerHealth: {
        rawg: {
          ok: rawgHealth.ok,
          status: rawgHealth.ok ? 'Active' : 'Missing Credentials or Inactive',
          latencyMs: rawgHealth.latencyMs,
          lastError: rawgHealth.error,
        },
        gmdb: {
          ok: gmdbHealth.ok,
          status: gmdbHealth.ok ? 'Active' : 'Missing Credentials or Inactive',
          latencyMs: gmdbHealth.latencyMs,
          lastError: gmdbHealth.error,
        },
      },
      fieldProvenance,
      cacheInfo: {
        isCached: Boolean(cacheEntry),
        cachedAt: game.providerMeta.lastSyncedAt,
        expiresAt: cacheEntry?.expiresAt,
      },
      matchingConfidence: 'HIGH',
      matchingDetails: 'Единая схема Dodik Tracker (RAWG + TheGamesDB / GMDB / IGDB / Local DB)',
      lastSyncedAt: game.providerMeta.lastSyncedAt,
    };
  }
}
