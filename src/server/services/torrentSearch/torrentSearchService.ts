/**
 * TorrentSearchService: High-level orchestrator for automatic torrent source discovery.
 * Fetches structured media metadata from database, queries Torznab/Prowlarr, applies ranking/scoring,
 * and caches search candidates.
 */

import { db } from '../../../db/index.ts';
import { media, mediaExternalIds } from '../../../db/schema.ts';
import { eq } from 'drizzle-orm';
import {
  TorrentSearchQuery,
  TorrentSearchResult,
  TorrentCandidate,
} from './torrentSearchTypes.ts';
import { torznabClient } from './torznabClient.ts';
import { rankTorrentCandidates } from './torrentScorer.ts';
import { torrentCache } from './torrentCache.ts';

export class TorrentSearchService {
  /**
   * Constructs a TorrentSearchQuery from a media record in database.
   */
  public async normalizeQueryFromMediaId(
    mediaId: number,
    seasonNumber?: number,
    episodeNumber?: number
  ): Promise<TorrentSearchQuery | null> {
    const [mediaRecord] = await db
      .select({
        id: media.id,
        type: media.type,
        title: media.title,
        originalTitle: media.originalTitle,
        year: media.year,
      })
      .from(media)
      .where(eq(media.id, mediaId))
      .limit(1);

    if (!mediaRecord || !mediaRecord.title) {
      return null;
    }

    // Get external IDs (TMDB / IMDB) if available
    const extIds = await db
      .select({ provider: mediaExternalIds.provider, externalId: mediaExternalIds.externalId })
      .from(mediaExternalIds)
      .where(eq(mediaExternalIds.mediaId, mediaId));

    let tmdbId: number | undefined;
    let imdbId: string | undefined;

    for (const ext of extIds) {
      if (ext.provider === 'TMDB' && !isNaN(Number(ext.externalId))) {
        tmdbId = Number(ext.externalId);
      } else if (ext.provider === 'IMDB') {
        imdbId = ext.externalId;
      }
    }

    const isSeries = mediaRecord.type === 'TV' || mediaRecord.type === 'ANIME';

    return {
      mediaId: mediaRecord.id,
      mediaType: isSeries ? 'series' : 'movie',
      title: mediaRecord.title,
      originalTitle: mediaRecord.originalTitle || undefined,
      year: mediaRecord.year || undefined,
      tmdbId,
      imdbId,
      seasonNumber: isSeries ? seasonNumber ?? 1 : undefined,
      episodeNumber: isSeries ? episodeNumber ?? 1 : undefined,
    };
  }

  /**
   * Searches for torrent candidates for a given mediaId and optional season/episode numbers.
   */
  public async searchByMediaId(
    mediaId: number,
    seasonNumber?: number,
    episodeNumber?: number
  ): Promise<TorrentSearchResult> {
    const query = await this.normalizeQueryFromMediaId(mediaId, seasonNumber, episodeNumber);
    if (!query) {
      return {
        status: 'METADATA_INCOMPLETE',
        query: {
          mediaId,
          mediaType: 'movie',
          title: `Media #${mediaId}`,
          seasonNumber,
          episodeNumber,
        },
        candidates: [],
        totalFound: 0,
        executionTimeMs: 0,
        error: 'Метаданные медиапроизведения не найдены в базе данных',
      };
    }

    return this.search(query);
  }

  /**
   * Executes a torrent search query with caching, scoring, and Prowlarr fallback.
   */
  public async search(query: TorrentSearchQuery): Promise<TorrentSearchResult> {
    const startMs = Date.now();

    // 1. Check cache
    const cached = torrentCache.get(query);
    if (cached) {
      return { ...cached, executionTimeMs: Date.now() - startMs };
    }

    // 2. Query Prowlarr Torznab API
    const { candidates: rawCandidates, rawError } = await torznabClient.search(query);

    const execTime = Date.now() - startMs;

    if (rawError && rawCandidates.length === 0) {
      return {
        status: 'PROWLARR_UNAVAILABLE',
        query,
        candidates: [],
        totalFound: 0,
        executionTimeMs: execTime,
        error: rawError,
      };
    }

    if (rawCandidates.length === 0) {
      const result: TorrentSearchResult = {
        status: 'NO_RESULTS',
        query,
        candidates: [],
        totalFound: 0,
        executionTimeMs: execTime,
      };
      torrentCache.set(query, result, 5 * 60 * 1000); // 5 min TTL for empty results
      return result;
    }

    // 3. Score and rank candidates
    const rankedCandidates = rankTorrentCandidates(rawCandidates, query);
    const bestCandidate = rankedCandidates.length > 0 ? rankedCandidates[0] : undefined;

    const result: TorrentSearchResult = {
      status: 'SUCCESS',
      query,
      candidates: rankedCandidates,
      bestCandidate,
      totalFound: rankedCandidates.length,
      executionTimeMs: execTime,
    };

    // 4. Save to cache
    torrentCache.set(query, result);

    return result;
  }
}

export const torrentSearchService = new TorrentSearchService();
