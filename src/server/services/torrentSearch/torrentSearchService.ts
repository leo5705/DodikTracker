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
  TorrentSearchStatus,
} from './torrentSearchTypes.ts';
import { torznabClient } from './torznabClient.ts';
import { rankTorrentCandidates } from './torrentScorer.ts';
import { torrentCache } from './torrentCache.ts';
import { torrServerClient } from './torrServerClient.ts';
import { isSampleFile } from './torrentFileSelector.ts';

export class TorrentSearchService {
  /**
   * Constructs a TorrentSearchQuery from a media record in database.
   */
  public async normalizeQueryFromMediaId(
    mediaId: number,
    seasonNumber?: number,
    episodeNumber?: number
  ): Promise<TorrentSearchQuery | null> {
    console.log(`[TorrentSearch] normalize query mediaId=${mediaId}, season=${seasonNumber ?? 'none'}, episode=${episodeNumber ?? 'none'}`);

    let [mediaRecord] = await db
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

    // If not found by primary key media.id, check mediaExternalIds (e.g. TMDB/IMDB external IDs passed from UI)
    if (!mediaRecord) {
      const byExt = await db
        .select({ mediaId: mediaExternalIds.mediaId })
        .from(mediaExternalIds)
        .where(eq(mediaExternalIds.externalId, String(mediaId)))
        .limit(1);

      if (byExt.length > 0) {
        const [resolved] = await db
          .select({
            id: media.id,
            type: media.type,
            title: media.title,
            originalTitle: media.originalTitle,
            year: media.year,
          })
          .from(media)
          .where(eq(media.id, byExt[0].mediaId))
          .limit(1);

        if (resolved) {
          mediaRecord = resolved;
        }
      }
    }

    if (!mediaRecord || !mediaRecord.title) {
      console.log(`[TorrentSearch] mediaId=${mediaId} not found in database`);
      return null;
    }

    // Get external IDs (TMDB / IMDB) if available
    const extIds = await db
      .select({ provider: mediaExternalIds.provider, externalId: mediaExternalIds.externalId })
      .from(mediaExternalIds)
      .where(eq(mediaExternalIds.mediaId, mediaRecord.id));

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

    const normalizedTitle = mediaRecord.title;
    const normalizedYear = mediaRecord.year || undefined;
    const finalSeason = isSeries ? seasonNumber ?? 1 : undefined;
    const finalEpisode = isSeries ? episodeNumber ?? 1 : undefined;

    console.log(`[TorrentSearch] normalized title="${normalizedTitle}", year=${normalizedYear ?? 'none'}, season=${finalSeason ?? 'none'}, episode=${finalEpisode ?? 'none'}`);

    return {
      mediaId: mediaRecord.id,
      mediaType: isSeries ? 'series' : 'movie',
      title: normalizedTitle,
      originalTitle: mediaRecord.originalTitle || undefined,
      year: normalizedYear,
      tmdbId,
      imdbId,
      seasonNumber: finalSeason,
      episodeNumber: finalEpisode,
    };
  }

  /**
   * Searches for torrent candidates for a given mediaId and optional season/episode numbers.
   */
  public async searchByMediaId(
    mediaId: number,
    seasonNumber?: number,
    episodeNumber?: number,
    verifyPlayability: boolean = false
  ): Promise<TorrentSearchResult> {
    const query = await this.normalizeQueryFromMediaId(mediaId, seasonNumber, episodeNumber);
    if (!query) {
      return {
        status: 'INVALID_MEDIA_METADATA',
        reason: 'INVALID_MEDIA_METADATA',
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

    return this.search(query, verifyPlayability);
  }

  /**
   * Performs the full Stage 10 playability verification chain:
   * TorrentCandidate -> automatic scoring -> file selection -> TorrServer load -> playable file -> stream URL -> HTTP stream validation
   */
  public async verifyCandidatePlayability(
    candidate: TorrentCandidate,
    query: TorrentSearchQuery
  ): Promise<{
    isPlayable: boolean;
    selectedFile?: { index: number; name: string; sizeBytes?: number };
    streamUrl?: string;
    reason?: string;
  }> {
    const safeName = (candidate.name || 'Candidate').substring(0, 50);
    console.log(`[TorrentSearch] candidate "${safeName}"`);

    // 1. Health check TorrServer
    console.log(`[TorrentSearch] TorrServer health check`);
    const health = await torrServerClient.healthCheck();
    if (!health.isAvailable) {
      return { isPlayable: false, reason: 'TORRSERVER_LOAD_FAILED' };
    }

    const magnet = candidate.magnetUri || candidate.downloadUrl;
    if (!magnet) {
      return { isPlayable: false, reason: 'RESULTS_BUT_NO_PLAYABLE_FILE' };
    }

    // 2. TorrServer load
    console.log(`[TorrentSearch] TorrServer load`);
    const addResult = await torrServerClient.addTorrent(magnet, candidate.name);
    if (!addResult.success || !addResult.hash) {
      return { isPlayable: false, reason: 'TORRSERVER_LOAD_FAILED' };
    }

    const infoHash = addResult.hash;

    try {
      // 3. File selection & Playable file check
      console.log(`[TorrentSearch] file selection`);
      const resolution = await torrServerClient.resolveBestStreamUrl(infoHash, {
        seasonNumber: query.seasonNumber,
        episodeNumber: query.episodeNumber,
        mediaType: query.mediaType,
      });

      if (!resolution || !resolution.streamUrl || resolution.selectedIndex === undefined) {
        await torrServerClient.removeTorrent(infoHash);
        return { isPlayable: false, reason: 'RESULTS_BUT_NO_PLAYABLE_FILE' };
      }

      // 4. Verify file is not sample or trailer
      const selectedName = resolution.selectedFileName || '';
      if (isSampleFile(selectedName)) {
        await torrServerClient.removeTorrent(infoHash);
        return { isPlayable: false, reason: 'RESULTS_BUT_NO_PLAYABLE_FILE' };
      }

      // 5. HTTP stream validation
      console.log(`[TorrentSearch] stream validation`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const streamRes = await fetch(resolution.streamUrl, {
          headers: { Range: 'bytes=0-65535' },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (streamRes.status >= 400) {
          await torrServerClient.removeTorrent(infoHash);
          return { isPlayable: false, reason: 'STREAM_VALIDATION_FAILED' };
        }

        const ct = streamRes.headers.get('content-type') || '';
        if (ct.includes('text/html') || ct.includes('application/json')) {
          await torrServerClient.removeTorrent(infoHash);
          return { isPlayable: false, reason: 'STREAM_VALIDATION_FAILED' };
        }

        const reader = streamRes.body?.getReader();
        if (reader) {
          await reader.read().catch(() => {});
          reader.cancel().catch(() => {});
        }
      } catch (streamErr: any) {
        clearTimeout(timer);
        await torrServerClient.removeTorrent(infoHash);
        return { isPlayable: false, reason: 'STREAM_VALIDATION_FAILED' };
      }

      // Clean up test verification torrent
      await torrServerClient.removeTorrent(infoHash);

      return {
        isPlayable: true,
        selectedFile: {
          index: resolution.selectedIndex,
          name: resolution.selectedFileName || `Файл #${resolution.selectedIndex}`,
        },
        streamUrl: resolution.streamUrl,
      };
    } catch (err: any) {
      await torrServerClient.removeTorrent(infoHash).catch(() => {});
      return { isPlayable: false, reason: 'STREAM_VALIDATION_FAILED' };
    }
  }

  /**
   * Filters ranked candidates down to ONLY those verified playable through the full chain.
   */
  public async filterVerifiedPlayableCandidates(
    candidates: TorrentCandidate[],
    query: TorrentSearchQuery,
    maxToVerify: number = 3
  ): Promise<{ verified: TorrentCandidate[]; lastFailureReason?: string }> {
    const verified: TorrentCandidate[] = [];
    const candidatesToCheck = candidates.slice(0, maxToVerify);
    let lastFailureReason: string | undefined;

    console.log(`[TorrentSearch] playable validation started for ${candidatesToCheck.length} candidates`);

    for (let idx = 0; idx < candidatesToCheck.length; idx++) {
      const candidate = candidatesToCheck[idx];
      console.log(`[TorrentSearch] candidate #${idx + 1} checking`);
      const res = await this.verifyCandidatePlayability(candidate, query);
      if (res.isPlayable) {
        verified.push(candidate);
      } else if (res.reason) {
        lastFailureReason = res.reason;
      }
    }

    return { verified, lastFailureReason };
  }

  /**
   * Executes a torrent search query with caching, scoring, and Prowlarr fallback.
   */
  public async search(query: TorrentSearchQuery, verifyPlayability: boolean = false): Promise<TorrentSearchResult> {
    const startMs = Date.now();

    // 1. Check cache (only for non-verified or cache matches)
    const cached = torrentCache.get(query);
    if (cached && !verifyPlayability) {
      return { ...cached, executionTimeMs: Date.now() - startMs };
    }

    // 2. Query Prowlarr Torznab API
    const { candidates: rawCandidates, rawError } = await torznabClient.search(query);

    const execTime = Date.now() - startMs;

    if (rawError && rawCandidates.length === 0) {
      console.log(`[TorrentSearch] Prowlarr error: ${rawError}`);
      const isAuthFail = rawError.includes('PROWLARR_AUTH_FAILED') || rawError.includes('401') || rawError.includes('403') || rawError.includes('authentication failed');
      const isNoIndexers = rawError.includes('NO_INDEXERS') || rawError.includes('индексатор') || rawError.includes('no indexers');
      const status: TorrentSearchStatus = isAuthFail
        ? 'PROWLARR_AUTH_FAILED'
        : isNoIndexers
        ? 'NO_INDEXERS'
        : 'PROWLARR_UNAVAILABLE';

      return {
        status,
        reason: status,
        query,
        candidates: [],
        totalFound: 0,
        executionTimeMs: execTime,
        error: rawError,
      };
    }

    if (rawCandidates.length === 0) {
      console.log(`[TorrentSearch] no candidates found from Prowlarr`);
      const result: TorrentSearchResult = {
        status: 'NO_RESULTS',
        reason: 'NO_RESULTS',
        query,
        candidates: [],
        totalFound: 0,
        executionTimeMs: execTime,
      };
      torrentCache.set(query, result, 5 * 60 * 1000); // 5 min TTL for empty results
      return result;
    }

    // 3. Score and rank candidates
    let rankedCandidates = rankTorrentCandidates(rawCandidates, query);
    let verificationFailureReason: string | undefined;

    // 4. Optionally verify playability against TorrServer & stream validation
    if (verifyPlayability) {
      const verification = await this.filterVerifiedPlayableCandidates(rankedCandidates, query);
      rankedCandidates = verification.verified;
      verificationFailureReason = verification.lastFailureReason;
    }

    console.log(`[TorrentSearch] playable candidates=${rankedCandidates.length}`);

    if (rankedCandidates.length === 0) {
      const resolvedStatus: TorrentSearchStatus =
        (verificationFailureReason as any) || (rawCandidates.length > 0 ? 'NO_PLAYABLE_FILES' : 'NO_RESULTS');
      const result: TorrentSearchResult = {
        status: resolvedStatus,
        reason: resolvedStatus,
        query,
        candidates: [],
        totalFound: 0,
        executionTimeMs: Date.now() - startMs,
      };
      return result;
    }

    const bestCandidate = rankedCandidates[0];

    const result: TorrentSearchResult = {
      status: 'SUCCESS',
      reason: 'SUCCESS',
      query,
      candidates: rankedCandidates,
      bestCandidate,
      totalFound: rankedCandidates.length,
      executionTimeMs: Date.now() - startMs,
    };

    // 5. Save to cache
    if (!verifyPlayability) {
      torrentCache.set(query, result);
    }

    return result;
  }
}

export const torrentSearchService = new TorrentSearchService();
