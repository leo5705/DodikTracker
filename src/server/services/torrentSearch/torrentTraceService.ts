/**
 * TorrentTraceService: Real live production trace for Watch Source discovery.
 * Executes the authentic 12-step pipeline and reports precise diagnostics
 * without any mocks or secret leakage.
 */

import { db } from '../../../db/index.ts';
import { media, mediaExternalIds } from '../../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { torznabClient } from './torznabClient.ts';
import { torrServerClient } from './torrServerClient.ts';
import { rankTorrentCandidates } from './torrentScorer.ts';
import { torrentSearchService } from './torrentSearchService.ts';
import { TorrentCandidate, TorrentSearchQuery, TorrentSearchResult } from './torrentSearchTypes.ts';

export interface WatchSourceTraceStep {
  step: number;
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED' | 'INFO';
  durationMs?: number;
  details: Record<string, any>;
  error?: string;
}

export interface WatchSourceTraceReport {
  timestamp: string;
  input: {
    mediaId?: string | number;
    mediaType?: string;
    seasonNumber?: number;
    episodeNumber?: number;
  };
  overallStatus: 'PASS' | 'FAIL' | 'NO_SOURCES';
  rootCause?: string;
  steps: WatchSourceTraceStep[];
  frontendPayload: {
    available: boolean;
    reason: string;
    status: string;
    totalFound: number;
    candidateCount: number;
  };
}

export class TorrentTraceService {
  /**
   * Masks sensitive infoHash strings for safe diagnostic logging (e.g. "0123...cdef").
   */
  public maskHash(hash?: string): string | undefined {
    if (!hash || hash.length < 8) return hash;
    return `${hash.substring(0, 4)}...${hash.substring(hash.length - 4)}`;
  }

  /**
   * Masks URLs to hide private credentials.
   */
  public maskUrl(url?: string): string | undefined {
    if (!url) return undefined;
    return url.replace(/:\/\/([^@]+@)?/, '://***@');
  }

  /**
   * Executes a complete live production trace on a media item.
   */
  public async executeTrace(input: {
    mediaId?: string | number;
    mediaType?: string;
    seasonNumber?: number;
    episodeNumber?: number;
  }): Promise<WatchSourceTraceReport> {
    const startTime = Date.now();
    const steps: WatchSourceTraceStep[] = [];
    let rootCause: string | undefined;

    // -------------------------------------------------------------
    // Step 1: REQUEST
    // -------------------------------------------------------------
    steps.push({
      step: 1,
      name: 'REQUEST',
      status: 'PASS',
      details: {
        rawMediaId: input.mediaId,
        rawMediaType: input.mediaType,
        seasonNumber: input.seasonNumber ?? null,
        episodeNumber: input.episodeNumber ?? null,
      },
    });

    // -------------------------------------------------------------
    // Step 2: MEDIA_RESOLUTION
    // -------------------------------------------------------------
    const step2Start = Date.now();
    let resolvedMediaRecord: any = null;
    let resolutionType = 'NONE';
    const numId = input.mediaId !== undefined ? Number(input.mediaId) : NaN;

    if (!isNaN(numId)) {
      // Check primary key media.id
      const [byPk] = await db
        .select()
        .from(media)
        .where(eq(media.id, numId))
        .limit(1);

      if (byPk) {
        resolvedMediaRecord = byPk;
        resolutionType = 'PRIMARY_KEY_MEDIA_ID';
      } else {
        // Check external ID (TMDB / IMDB)
        const [byExt] = await db
          .select({ mediaId: mediaExternalIds.mediaId })
          .from(mediaExternalIds)
          .where(eq(mediaExternalIds.externalId, String(numId)))
          .limit(1);

        if (byExt) {
          const [extRecord] = await db
            .select()
            .from(media)
            .where(eq(media.id, byExt.mediaId))
            .limit(1);
          if (extRecord) {
            resolvedMediaRecord = extRecord;
            resolutionType = 'EXTERNAL_ID_MATCH';
          }
        }
      }
    }

    // Lookup external IDs associated with resolved item
    let externalIdsList: Array<{ provider: string; externalId: string }> = [];
    if (resolvedMediaRecord) {
      externalIdsList = await db
        .select({ provider: mediaExternalIds.provider, externalId: mediaExternalIds.externalId })
        .from(mediaExternalIds)
        .where(eq(mediaExternalIds.mediaId, resolvedMediaRecord.id));
    }

    const step2Passed = Boolean(resolvedMediaRecord && resolvedMediaRecord.title);
    steps.push({
      step: 2,
      name: 'MEDIA_RESOLUTION',
      status: step2Passed ? 'PASS' : 'FAIL',
      durationMs: Date.now() - step2Start,
      details: {
        inputId: input.mediaId,
        resolutionType,
        resolvedLocalMediaId: resolvedMediaRecord?.id ?? null,
        title: resolvedMediaRecord?.title ?? null,
        originalTitle: resolvedMediaRecord?.originalTitle ?? null,
        year: resolvedMediaRecord?.year ?? null,
        mediaTypeInDb: resolvedMediaRecord?.type ?? null,
        externalIds: externalIdsList,
      },
      error: step2Passed ? undefined : 'Media item not found in database by primary key or external IDs',
    });

    if (!step2Passed && !rootCause) {
      rootCause = 'INVALID_MEDIA_METADATA: Media item does not exist in local database';
    }

    // -------------------------------------------------------------
    // Step 3: QUERY_NORMALIZATION
    // -------------------------------------------------------------
    const isSeries =
      input.mediaType === 'series' ||
      input.mediaType === 'TV' ||
      input.mediaType === 'ANIME' ||
      resolvedMediaRecord?.type === 'TV' ||
      resolvedMediaRecord?.type === 'ANIME';

    const normalizedTitle = resolvedMediaRecord?.title || (input.mediaId ? `Media #${input.mediaId}` : 'Unknown');
    const normalizedOriginalTitle = resolvedMediaRecord?.originalTitle || undefined;
    const normalizedYear = resolvedMediaRecord?.year || undefined;
    const finalSeason = isSeries ? input.seasonNumber ?? 1 : undefined;
    const finalEpisode = isSeries ? input.episodeNumber ?? 1 : undefined;

    const query: TorrentSearchQuery = {
      mediaId: resolvedMediaRecord?.id,
      mediaType: isSeries ? 'series' : 'movie',
      title: normalizedTitle,
      originalTitle: normalizedOriginalTitle,
      year: normalizedYear,
      seasonNumber: finalSeason,
      episodeNumber: finalEpisode,
    };

    const primaryQueryString = torznabClient.buildQueryString(query);
    const fallbackQueries = torznabClient.buildFallbackQueryStrings(query);

    steps.push({
      step: 3,
      name: 'QUERY_NORMALIZATION',
      status: 'PASS',
      details: {
        normalizedTitle,
        originalTitle: normalizedOriginalTitle,
        year: normalizedYear,
        isSeries,
        seasonNumber: finalSeason,
        episodeNumber: finalEpisode,
        primaryQueryString,
        fallbackQueries,
      },
    });

    // -------------------------------------------------------------
    // Step 4: PROWLARR_CONNECTIVITY
    // -------------------------------------------------------------
    const step4Start = Date.now();
    const prowlarrAvail = await torznabClient.isAvailable();
    steps.push({
      step: 4,
      name: 'PROWLARR_CONNECTIVITY',
      status: prowlarrAvail.ok ? 'PASS' : 'FAIL',
      durationMs: Date.now() - step4Start,
      details: {
        prowlarrConfiguredUrl: this.maskUrl(torznabClient.prowlarrUrl),
        resolvedUrl: this.maskUrl(prowlarrAvail.resolvedUrl),
        reachable: prowlarrAvail.ok,
      },
      error: prowlarrAvail.ok ? undefined : prowlarrAvail.reason,
    });

    if (!prowlarrAvail.ok && !rootCause) {
      rootCause = `PROWLARR_UNAVAILABLE: ${prowlarrAvail.reason}`;
    }

    // -------------------------------------------------------------
    // Step 5: TORZNAB_SEARCH
    // -------------------------------------------------------------
    const step5Start = Date.now();
    const torznabResult = await torznabClient.search(query);
    const rawCandidates = torznabResult.candidates || [];
    const step5Passed = rawCandidates.length > 0;

    steps.push({
      step: 5,
      name: 'TORZNAB_SEARCH',
      status: prowlarrAvail.ok ? (step5Passed ? 'PASS' : 'INFO') : 'SKIPPED',
      durationMs: Date.now() - step5Start,
      details: {
        rawCandidatesCount: rawCandidates.length,
        queriesTried: [primaryQueryString, ...fallbackQueries],
        rawError: torznabResult.rawError ?? null,
      },
      error: torznabResult.rawError,
    });

    if (prowlarrAvail.ok && rawCandidates.length === 0 && !rootCause) {
      rootCause = 'NO_RESULTS: Prowlarr indexers returned 0 releases for formulated queries';
    }

    // -------------------------------------------------------------
    // Step 6: CANDIDATE_PARSING
    // -------------------------------------------------------------
    steps.push({
      step: 6,
      name: 'CANDIDATE_PARSING',
      status: rawCandidates.length > 0 ? 'PASS' : 'SKIPPED',
      details: {
        parsedCandidatesCount: rawCandidates.length,
        sampleCandidates: rawCandidates.slice(0, 3).map((c) => ({
          name: c.name,
          quality: c.quality,
          seeders: c.seeders,
          hasMagnet: Boolean(c.magnetUri || c.downloadUrl),
          infoHashMasked: this.maskHash(c.infoHash),
        })),
      },
    });

    // -------------------------------------------------------------
    // Step 7: AUTOMATIC_SCORING
    // -------------------------------------------------------------
    const rankedCandidates = rawCandidates.length > 0 ? rankTorrentCandidates(rawCandidates, query) : [];
    const topCand = rankedCandidates[0];

    steps.push({
      step: 7,
      name: 'AUTOMATIC_SCORING',
      status: rankedCandidates.length > 0 ? 'PASS' : 'SKIPPED',
      details: {
        rankedCount: rankedCandidates.length,
        topCandidate: topCand
          ? {
              name: topCand.name,
              score: topCand.score,
              quality: topCand.quality,
              seeders: topCand.seeders,
              hasMagnet: Boolean(topCand.magnetUri || topCand.downloadUrl),
            }
          : null,
      },
    });

    // -------------------------------------------------------------
    // Step 8: TORRSERVER_CONNECTIVITY
    // -------------------------------------------------------------
    const step8Start = Date.now();
    const torrHealth = await torrServerClient.healthCheck();
    steps.push({
      step: 8,
      name: 'TORRSERVER_CONNECTIVITY',
      status: torrHealth.isAvailable ? 'PASS' : 'FAIL',
      durationMs: Date.now() - step8Start,
      details: {
        torrServerConfiguredUrl: this.maskUrl(torrServerClient.baseUrl),
        reachable: torrHealth.isAvailable,
        version: torrHealth.version ?? null,
      },
      error: torrHealth.isAvailable ? undefined : torrHealth.error,
    });

    if (!torrHealth.isAvailable && !rootCause && rankedCandidates.length > 0) {
      rootCause = `TORRSERVER_LOAD_FAILED: ${torrHealth.error}`;
    }

    // -------------------------------------------------------------
    // Step 9: PLAYABILITY_VALIDATION (Full Chain Execution)
    // -------------------------------------------------------------
    const step9Start = Date.now();
    const searchResult: TorrentSearchResult = await torrentSearchService.search(query, true);
    const playableCandidates = searchResult.candidates || [];
    const step9Passed = playableCandidates.length > 0;

    steps.push({
      step: 9,
      name: 'PLAYABILITY_VALIDATION',
      status: step9Passed ? 'PASS' : 'FAIL',
      durationMs: Date.now() - step9Start,
      details: {
        playableCandidatesCount: playableCandidates.length,
        statusResult: searchResult.status,
        reasonResult: searchResult.reason,
        bestPlayableCandidate: searchResult.bestCandidate
          ? {
              name: searchResult.bestCandidate.name,
              quality: searchResult.bestCandidate.quality,
              seeders: searchResult.bestCandidate.seeders,
              score: searchResult.bestCandidate.score,
            }
          : null,
      },
      error: searchResult.error,
    });

    if (!step9Passed && !rootCause) {
      rootCause = searchResult.reason || searchResult.status || 'NO_PLAYABLE_SOURCES';
    }

    // -------------------------------------------------------------
    // Step 10: FINAL_STATUS
    // -------------------------------------------------------------
    const isAvailable = playableCandidates.length > 0;
    const finalReason = searchResult.reason || searchResult.status || (isAvailable ? 'SUCCESS' : 'NO_RESULTS');

    const report: WatchSourceTraceReport = {
      timestamp: new Date().toISOString(),
      input,
      overallStatus: isAvailable ? 'PASS' : rootCause?.startsWith('PROWLARR') ? 'FAIL' : 'NO_SOURCES',
      rootCause,
      steps,
      frontendPayload: {
        available: isAvailable,
        reason: finalReason,
        status: searchResult.status,
        totalFound: searchResult.totalFound,
        candidateCount: playableCandidates.length,
      },
    };

    return report;
  }
}

export const torrentTraceService = new TorrentTraceService();
