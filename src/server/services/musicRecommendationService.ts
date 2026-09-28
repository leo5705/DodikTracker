import { db } from '../../db/index.ts';
import {
  musicTracks,
  musicReleases,
  artistProfiles,
  artistSubscriptions,
  musicReleaseGenres,
  musicGenres,
  userMusicHistory,
  musicFavoriteTracks,
  musicFavoriteReleases,
} from '../../db/schema.ts';
import { eq, and, desc, sql, inArray, notInArray } from 'drizzle-orm';
import {
  TasteProfile,
  CandidateTrack,
  ScoredTrack,
  RecommendationResponse,
  RecommendationArtistItem,
  RecommendationReleaseItem,
  ForYouResponse,
  PlaybackInteractionEvent,
} from './musicRecommendation/types.ts';

export type {
  TasteProfile,
  CandidateTrack,
  ScoredTrack,
  RecommendationResponse,
  RecommendationArtistItem,
  RecommendationReleaseItem,
  ForYouResponse,
  PlaybackInteractionEvent,
};
import { tasteProfileService } from './musicRecommendation/tasteProfileService.ts';
import { candidateService } from './musicRecommendation/candidateService.ts';
import { rankingService } from './musicRecommendation/rankingService.ts';
import { transitionService } from './musicRecommendation/transitionService.ts';
import { youtubeMusicProvider } from './externalMusic/youtubeMusicProvider.ts';

// In-memory cache for full recommendation response per user
const RECS_CACHE = new Map<number, { data: RecommendationResponse; expiresAt: number }>();
const RECS_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class MusicRecommendationService {
  /**
   * Invalidates recommendation cache for a user.
   */
  public invalidateUserCache(userId: number) {
    RECS_CACHE.delete(userId);
    tasteProfileService.invalidateUserCache(userId);
  }

  /**
   * Records a detailed playback event with duration, completion ratio, skips, and transitions.
   */
  public async recordPlaybackEvent(event: PlaybackInteractionEvent): Promise<void> {
    const {
      userId,
      trackId,
      provider = 'dodik',
      title,
      artistName,
      artistId,
      releaseTitle,
      releaseCover,
      durationSeconds,
      playedSeconds,
      completionRatio,
      isCompleted = false,
      isSkipped = false,
      isQuickSkip = false,
      contextSource = 'manual',
      fromTrackId,
    } = event;

    if (!userId || !trackId || !title || !artistName) return;

    try {
      // 1. Insert or update history row
      await db.insert(userMusicHistory).values({
        userId,
        trackId: String(trackId),
        provider,
        title,
        artistName,
        artistId: artistId ? String(artistId) : null,
        releaseTitle: releaseTitle || null,
        releaseCover: releaseCover || null,
        durationSeconds: durationSeconds ? Math.round(Number(durationSeconds)) : null,
        playedSeconds: playedSeconds ? Math.round(Number(playedSeconds)) : null,
        completionRatio: typeof completionRatio === 'number' ? Number(completionRatio.toFixed(3)) : null,
        isCompleted: Boolean(isCompleted),
        isSkipped: Boolean(isSkipped),
        isQuickSkip: Boolean(isQuickSkip),
        contextSource,
        fromTrackId: fromTrackId ? String(fromTrackId) : null,
        listenedAt: new Date(),
      });

      // 2. If valid sequential transition occurred, record in transition graph
      if (fromTrackId && fromTrackId !== trackId) {
        await transitionService.recordTransition(fromTrackId, trackId, null, artistName);
      }

      // If user performed quick skip or completed track, invalidate taste cache to adapt
      if (isQuickSkip || isCompleted) {
        this.invalidateUserCache(userId);
      }
    } catch (err) {
      console.warn('[MusicRecommendationService] Error recording playback event:', err);
    }
  }

  /**
   * Generates comprehensive personalized recommendations partitioned into distinct semantic shelves.
   */
  public async getRecommendationsForUser(userId: number | null, forceRefresh = false): Promise<RecommendationResponse> {
    // 1. Cold start for anonymous / unauthenticated users
    if (!userId) {
      return this.getColdStartRecommendations();
    }

    const now = Date.now();
    const cached = RECS_CACHE.get(userId);
    if (!forceRefresh && cached && cached.expiresAt > now) {
      return cached.data;
    }

    try {
      // 2. Compute dynamic User Taste Profile
      const taste = await tasteProfileService.getTasteProfile(userId, forceRefresh);

      // If user has insufficient signals (< 2 total interactions), return cold-start
      if (taste.totalSignals < 2) {
        return this.getColdStartRecommendations();
      }

      // 3. Generate candidate pool from multiple DB & external sources
      const candidates = await candidateService.generateCandidatePool(taste, { includeExternal: true });

      // 4. Batch fetch transition affinity for candidates from user's recent tracks
      const recentIds = Array.from(taste.recentTrackIds).slice(0, 10);
      const candidateIds = candidates.map((c) => String(c.id));
      const transitionAffinityMap = await transitionService.getBatchTransitionAffinity(recentIds, candidateIds);

      // 5. Rank and score candidate pool
      const rankedCandidates = rankingService.rankCandidates(candidates, taste, transitionAffinityMap);

      // 6. Partition into specialized recommendation shelves

      // Shelf A: "Продолжить слушать" (Continue Listening - recent unique plays)
      const userHistory = await db
        .select()
        .from(userMusicHistory)
        .where(eq(userMusicHistory.userId, userId))
        .orderBy(desc(userMusicHistory.listenedAt))
        .limit(30);

      const continueListeningMap = new Map<string, ScoredTrack>();
      for (const h of userHistory) {
        if (!continueListeningMap.has(h.trackId)) {
          continueListeningMap.set(h.trackId, {
            id: h.trackId,
            provider: (h.provider as any) || 'dodik',
            title: h.title,
            artistName: h.artistName,
            artistId: h.artistId,
            releaseTitle: h.releaseTitle,
            releaseCover: h.releaseCover,
            durationSeconds: h.durationSeconds,
            score: 90,
            source: 'recent_session',
            explanation: 'Вы недавно слушали',
            lastListenedAt: h.listenedAt ? h.listenedAt.toISOString() : undefined,
          });
        }
        if (continueListeningMap.size >= 6) break;
      }
      const continueListening = Array.from(continueListeningMap.values());

      // Shelf B: "Вернитесь к этому" / Long Time No Listen
      // (Played >= 2 times or favorite, but not listened in last 10 days)
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
      const trackPlayCounts = new Map<string, { count: number; lastTime: number; item: ScoredTrack }>();

      for (const h of userHistory) {
        const time = h.listenedAt ? h.listenedAt.getTime() : 0;
        const existing = trackPlayCounts.get(h.trackId);
        if (existing) {
          existing.count += 1;
          if (time > existing.lastTime) existing.lastTime = time;
        } else {
          trackPlayCounts.set(h.trackId, {
            count: 1,
            lastTime: time,
            item: {
              id: h.trackId,
              provider: (h.provider as any) || 'dodik',
              title: h.title,
              artistName: h.artistName,
              artistId: h.artistId,
              releaseTitle: h.releaseTitle,
              releaseCover: h.releaseCover,
              durationSeconds: h.durationSeconds,
              score: 85,
              source: 'favorite',
              explanation: 'Вы давно не слушали этот трек',
            },
          });
        }
      }

      const longTimeNoListen: ScoredTrack[] = [];
      for (const [tId, data] of trackPlayCounts.entries()) {
        const isOld = data.lastTime < tenDaysAgo;
        const isLoved = taste.favoriteTrackIds.has(tId) || data.count >= 2;
        if (isLoved && isOld) {
          longTimeNoListen.push({
            ...data.item,
            listenCountUser: data.count,
            lastListenedAt: new Date(data.lastTime).toISOString(),
            explanation: `Вы слушали ${data.count} ${data.count === 1 ? 'раз' : 'раза'}, но давно не включали`,
          });
        }
        if (longTimeNoListen.length >= 6) break;
      }

      // Shelf C: "Для вас" (For You - diverse, multi-artist, multi-genre blend)
      const forYou = rankingService.applyDiversityFilter(rankedCandidates, {
        maxPerArtist: 2,
        limit: 12,
      });

      const forYouIds = new Set(forYou.map((t) => t.id));

      // Shelf D: "Похожие на ваш вкус" (Taste Affinity - core long-term matches)
      const tasteAffinityCandidates = rankedCandidates.filter(
        (t) => (t.source === 'favorite' || t.source === 'loved_artist' || t.source === 'genre_match') && !forYouIds.has(t.id)
      );
      const tasteAffinity = rankingService.applyDiversityFilter(tasteAffinityCandidates, {
        maxPerArtist: 2,
        limit: 8,
      });

      // Shelf E: "Откройте новое" (Discovery & Exploration - unfamiliar artists matching user's taste)
      const discoveryCandidates = rankedCandidates.filter(
        (t) => t.source === 'discovery' || (!taste.artists[t.artistName.toLowerCase()] && !forYouIds.has(t.id))
      );
      const discoverNew = rankingService.applyDiversityFilter(discoveryCandidates, {
        maxPerArtist: 1,
        limit: 8,
      });

      // Shelf F: "На основе последних прослушиваний" (Recent Context)
      const recentContextCandidates = rankedCandidates.filter(
        (t) =>
          taste.shortTermArtists.some((a) => a.toLowerCase() === t.artistName.toLowerCase()) &&
          !forYouIds.has(t.id)
      );
      const recentContext = rankingService.applyDiversityFilter(recentContextCandidates, {
        maxPerArtist: 2,
        limit: 8,
      });

      // Shelf G: "Недооценённое" (Underrated Gems from community)
      const underratedCandidates = rankedCandidates.filter((t) => t.source === 'underrated');
      const underratedGems = rankingService.applyDiversityFilter(underratedCandidates, {
        maxPerArtist: 2,
        limit: 6,
      });

      // Shelf H: "Рекомендованные исполнители" (Recommended Artists)
      const recommendedArtists: RecommendationArtistItem[] = [];
      const topArtistEntries = Object.entries(taste.artists)
        .sort((a, b) => b[1].weight - a[1].weight)
        .slice(0, 5);

      for (const [artName, artData] of topArtistEntries) {
        const topTrack = rankedCandidates.find((t) => t.artistName.toLowerCase() === artName.toLowerCase());
        recommendedArtists.push({
          artistId: artData.artistId,
          provider: 'dodik',
          stageName: artName,
          explanation: `Потому что вам нравится музыка исполнителя ${artName}`,
          topTrack: topTrack || null,
        });
      }

      // Shelf I: "Новые релизы для вас" (New Releases from Subscribed / Loved Artists)
      const newForYou: RecommendationReleaseItem[] = [];
      const userSubscriptions = await db
        .select()
        .from(artistSubscriptions)
        .where(eq(artistSubscriptions.userId, userId))
        .limit(10);

      for (const s of userSubscriptions) {
        if (s.externalArtistId && s.provider === 'youtube') {
          try {
            const rels = await youtubeMusicProvider.getArtistReleases(s.externalArtistId);
            if (rels.length > 0) {
              const latest = rels[0];
              newForYou.push({
                releaseId: latest.providerReleaseId,
                provider: 'youtube',
                title: latest.title,
                artistName: latest.artist || s.externalArtistName || 'Исполнитель',
                cover: latest.coverUrl,
                year: latest.year,
                releaseType: latest.releaseType,
                explanation: `Новый релиз подписки: ${s.externalArtistName}`,
              });
            }
          } catch {}
        }
        if (newForYou.length >= 6) break;
      }

      const response: RecommendationResponse = {
        isColdStart: false,
        forYou,
        tasteAffinity,
        discoverNew,
        recentContext,
        longTimeNoListen,
        underratedGems,
        recommendedArtists,
        continueListening,
        newForYou,
        popularNow: [],
      };

      RECS_CACHE.set(userId, { data: response, expiresAt: now + RECS_TTL_MS });
      return response;
    } catch (err) {
      console.error('[MusicRecommendationService] Error in getRecommendationsForUser:', err);
      return this.getColdStartRecommendations();
    }
  }

  /**
   * Cold start recommendations for new or unauthenticated users.
   */
  public async getColdStartRecommendations(): Promise<RecommendationResponse> {
    const rawCandidates = await candidateService.generateColdStartCandidates();
    const scored = rawCandidates.map((c) => ({
      ...c,
      score: 75,
      explanation: c.sourceReason || 'Популярно в Dodik Tracker',
    }));

    const popularNow = rankingService.applyDiversityFilter(scored, { maxPerArtist: 2, limit: 12 });

    return {
      isColdStart: true,
      forYou: [],
      tasteAffinity: [],
      discoverNew: [],
      recentContext: [],
      longTimeNoListen: [],
      underratedGems: [],
      recommendedArtists: [],
      continueListening: [],
      newForYou: [],
      popularNow,
    };
  }

  /**
   * Dedicated endpoint logic for GET /api/music/recommendations/for-you with pagination & refresh.
   */
  public async getPersonalizedForYou(
    userId: number | null,
    options: { limit?: number; cursor?: string | number; refresh?: boolean } = {}
  ): Promise<ForYouResponse> {
    const limit = Math.min(Math.max(Number(options.limit) || 12, 1), 50);
    const offset = Math.max(parseInt(String(options.cursor || '0'), 10) || 0, 0);

    if (!userId) {
      const cold = await this.getColdStartRecommendations();
      const paginated = cold.popularNow.slice(offset, offset + limit);
      const hasMore = cold.popularNow.length > offset + limit;
      return {
        isPersonalized: false,
        totalSignals: 0,
        fallbackReason: 'unauthenticated',
        tracks: paginated,
        hasMore,
        nextCursor: hasMore ? String(offset + limit) : null,
      };
    }

    if (options.refresh) {
      this.invalidateUserCache(userId);
    }

    const recs = await this.getRecommendationsForUser(userId, Boolean(options.refresh));

    if (recs.isColdStart || recs.forYou.length === 0) {
      const cold = await this.getColdStartRecommendations();
      const paginated = cold.popularNow.slice(offset, offset + limit);
      const hasMore = cold.popularNow.length > offset + limit;
      return {
        isPersonalized: false,
        totalSignals: 0,
        fallbackReason: 'insufficient_history',
        tracks: paginated,
        hasMore,
        nextCursor: hasMore ? String(offset + limit) : null,
      };
    }

    // Combine forYou + tasteAffinity + discoverNew for deep pagination
    const allPersonalTracks = [...recs.forYou, ...recs.tasteAffinity, ...recs.discoverNew];
    const uniqueMap = new Map<string, ScoredTrack>();
    for (const t of allPersonalTracks) {
      if (!uniqueMap.has(t.id)) uniqueMap.set(t.id, t);
    }

    const allTracks = Array.from(uniqueMap.values());
    const paginated = allTracks.slice(offset, offset + limit);
    const hasMore = allTracks.length > offset + limit;

    return {
      isPersonalized: true,
      totalSignals: allTracks.length,
      fallbackReason: null,
      tracks: paginated,
      hasMore,
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  }

  /**
   * Returns similar tracks for a given track ID or artist/title query.
   * Utilizes transition graph, same-genre discovery, and related artists rather than just repeating 1 artist.
   */
  public async getSimilarTracksForTrack(
    trackId: string,
    queryArtist?: string,
    queryTitle?: string
  ): Promise<ScoredTrack[]> {
    const similarMap = new Map<string, ScoredTrack>();
    const isInternalNum = !isNaN(Number(trackId)) && !trackId.startsWith('yt_');
    let artistForSearch = queryArtist || '';

    // 1. Transition Graph Lookups (Tracks frequently played after this track)
    try {
      const nextTransitions = await transitionService.getNextTracks(trackId, 4);
      for (const n of nextTransitions) {
        const numId = Number(n.toTrackId);
        if (!isNaN(numId) && !n.toTrackId.startsWith('yt_')) {
          const [dbTrk] = await db
            .select({
              id: musicTracks.id,
              title: musicTracks.title,
              duration: musicTracks.duration,
              artistName: artistProfiles.stageName,
              releaseTitle: musicReleases.title,
              releaseCover: musicReleases.cover,
            })
            .from(musicTracks)
            .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
            .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
            .where(eq(musicTracks.id, numId))
            .limit(1);

          if (dbTrk) {
            similarMap.set(String(dbTrk.id), {
              id: String(dbTrk.id),
              provider: 'dodik',
              title: dbTrk.title,
              artistName: dbTrk.artistName || 'Исполнитель',
              releaseTitle: dbTrk.releaseTitle,
              releaseCover: dbTrk.releaseCover,
              durationSeconds: dbTrk.duration,
              score: 95,
              source: 'transition',
              explanation: 'Слушатели часто включают этот трек следующим',
            });
          }
        }
      }
    } catch {}

    // 2. Internal Dodik catalog matching by release genres
    if (isInternalNum) {
      try {
        const [dbTrack] = await db
          .select({
            id: musicTracks.id,
            title: musicTracks.title,
            releaseId: musicTracks.releaseId,
            artistId: musicReleases.artistId,
            artistName: artistProfiles.stageName,
            releaseTitle: musicReleases.title,
            releaseCover: musicReleases.cover,
          })
          .from(musicTracks)
          .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
          .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
          .where(eq(musicTracks.id, Number(trackId)))
          .limit(1);

        if (dbTrack) {
          artistForSearch = artistForSearch || dbTrack.artistName || '';

          // Find other tracks from same genre
          const genres = await db
            .select({ genreId: musicReleaseGenres.genreId, genreName: musicGenres.name })
            .from(musicReleaseGenres)
            .innerJoin(musicGenres, eq(musicReleaseGenres.genreId, musicGenres.id))
            .where(eq(musicReleaseGenres.releaseId, dbTrack.releaseId));

          if (genres.length > 0) {
            const genreIds = genres.map((g) => g.genreId);
            const genreSimilar = await db
              .select({
                id: musicTracks.id,
                title: musicTracks.title,
                duration: musicTracks.duration,
                artistName: artistProfiles.stageName,
                releaseTitle: musicReleases.title,
                releaseCover: musicReleases.cover,
              })
              .from(musicTracks)
              .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
              .innerJoin(musicReleaseGenres, eq(musicReleases.id, musicReleaseGenres.releaseId))
              .leftJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
              .where(
                and(
                  eq(musicTracks.status, 'PUBLISHED'),
                  eq(musicReleases.status, 'PUBLISHED'),
                  inArray(musicReleaseGenres.genreId, genreIds),
                  sql`${musicTracks.id} != ${dbTrack.id}`
                )
              )
              .limit(6);

            for (const gs of genreSimilar) {
              similarMap.set(String(gs.id), {
                id: String(gs.id),
                provider: 'dodik',
                title: gs.title,
                artistName: gs.artistName || 'Исполнитель',
                releaseTitle: gs.releaseTitle,
                releaseCover: gs.releaseCover,
                durationSeconds: gs.duration,
                score: 85,
                source: 'genre_match',
                explanation: `В схожем стиле «${genres[0].genreName}»`,
              });
            }
          }
        }
      } catch (err) {
        console.warn('[MusicRecommendationService] Error in getSimilarTracksForTrack internal:', err);
      }
    }

    // 3. External Related Search
    if (artistForSearch) {
      try {
        const searched = await youtubeMusicProvider.searchTracks(artistForSearch, { limit: 8 });
        for (const st of searched) {
          if (st.id !== trackId && !similarMap.has(st.id)) {
            similarMap.set(st.id, {
              id: st.id,
              provider: st.provider,
              title: st.title,
              artistName: st.artist,
              artistId: st.artistId,
              releaseTitle: st.album || 'Сингл',
              releaseCover: st.thumbnail,
              durationSeconds: st.durationSeconds,
              score: 80,
              source: 'loved_artist',
              explanation: `Похоже на «${artistForSearch}»`,
            });
          }
          if (similarMap.size >= 12) break;
        }
      } catch {}
    }

    // 4. Fallback if empty
    if (similarMap.size === 0) {
      const cold = await candidateService.generateColdStartCandidates();
      for (const c of cold.slice(0, 8)) {
        similarMap.set(c.id, {
          ...c,
          score: 70,
          explanation: 'Популярное предложение',
        });
      }
    }

    return Array.from(similarMap.values()).slice(0, 12);
  }
}

export const musicRecommendationService = new MusicRecommendationService();
