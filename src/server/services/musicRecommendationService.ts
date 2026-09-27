import { db } from '../../db/index.ts';
import {
  musicListens,
  musicTracks,
  musicReleases,
  artistProfiles,
  artistSubscriptions,
  musicFavoriteTracks,
  musicFavoriteReleases,
  userMusicHistory,
  musicReleaseGenres,
  musicGenres,
} from '../../db/schema.ts';
import { eq, and, desc, sql, gte, lte, notInArray, inArray } from 'drizzle-orm';
import { youtubeMusicProvider } from './externalMusic/youtubeMusicProvider.ts';

export interface RecommendationTrackItem {
  trackId: string;
  provider: 'dodik' | 'youtube';
  title: string;
  artistName: string;
  artistId?: string | null;
  releaseTitle?: string | null;
  releaseCover?: string | null;
  durationSeconds?: number | null;
  score?: number;
  explanation?: string;
  listenedAt?: string;
  lastListenedAt?: string;
  listenCount?: number;
}

export interface RecommendationReleaseItem {
  releaseId: string | number;
  provider: 'dodik' | 'youtube';
  title: string;
  artistName: string;
  cover?: string | null;
  year?: number | null;
  releaseType?: string;
  explanation?: string;
}

export interface RecommendationResponse {
  continueListening: RecommendationTrackItem[];
  forYou: RecommendationTrackItem[];
  longTimeNoListen: RecommendationTrackItem[];
  basedOnYourTaste: RecommendationTrackItem[];
  newForYou: RecommendationReleaseItem[];
  popularNow: RecommendationTrackItem[];
  isColdStart: boolean;
}

export interface ForYouResponse {
  isPersonalized: boolean;
  totalSignals: number;
  fallbackReason: 'unauthenticated' | 'insufficient_history' | null;
  tracks: RecommendationTrackItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class MusicRecommendationService {
  /**
   * Generates deterministic personal recommendations for a user based on real DB signals.
   */
  public async getRecommendationsForUser(userId: number | null): Promise<RecommendationResponse> {
    // 1. Cold start / Anonymous fallback
    if (!userId) {
      return this.getColdStartRecommendations();
    }

    try {
      // 2. Load user signals from DB
      // A. Recent History (from user_music_history and music_listens)
      const userHistory = await db
        .select()
        .from(userMusicHistory)
        .where(eq(userMusicHistory.userId, userId))
        .orderBy(desc(userMusicHistory.listenedAt))
        .limit(100);

      // B. Favorite Tracks
      const favTracks = await db
        .select({
          trackId: musicFavoriteTracks.trackId,
          title: musicTracks.title,
          artistName: artistProfiles.stageName,
          releaseTitle: musicReleases.title,
          releaseCover: musicReleases.cover,
        })
        .from(musicFavoriteTracks)
        .leftJoin(musicTracks, eq(musicFavoriteTracks.trackId, musicTracks.id))
        .leftJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
        .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
        .where(eq(musicFavoriteTracks.userId, userId))
        .limit(50);

      // C. Subscribed Artists
      const subscriptions = await db
        .select()
        .from(artistSubscriptions)
        .where(eq(artistSubscriptions.userId, userId))
        .limit(50);

      const totalSignals = userHistory.length + favTracks.length + subscriptions.length;

      // If user has virtually no history or signals, treat as cold start
      if (totalSignals === 0) {
        return this.getColdStartRecommendations();
      }

      // 3. Process Signals
      // A. Continue Listening (last 6 recently played items)
      const continueListeningMap = new Map<string, RecommendationTrackItem>();
      for (const h of userHistory) {
        if (!continueListeningMap.has(h.trackId)) {
          continueListeningMap.set(h.trackId, {
            trackId: h.trackId,
            provider: (h.provider as any) || 'dodik',
            title: h.title,
            artistName: h.artistName,
            artistId: h.artistId,
            releaseTitle: h.releaseTitle,
            releaseCover: h.releaseCover,
            durationSeconds: h.durationSeconds,
            listenedAt: h.listenedAt ? h.listenedAt.toISOString() : undefined,
            explanation: 'Вы недавно слушали',
          });
        }
        if (continueListeningMap.size >= 6) break;
      }
      const continueListening = Array.from(continueListeningMap.values());

      // B. Long Time No Listen (tracks played multiple times, but not in last 10 days)
      const now = Date.now();
      const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
      const trackPlayCounts = new Map<string, { count: number; lastTime: number; item: RecommendationTrackItem }>();

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
              trackId: h.trackId,
              provider: (h.provider as any) || 'dodik',
              title: h.title,
              artistName: h.artistName,
              artistId: h.artistId,
              releaseTitle: h.releaseTitle,
              releaseCover: h.releaseCover,
              durationSeconds: h.durationSeconds,
              explanation: 'Вы давно не слушали',
            },
          });
        }
      }

      const longTimeNoListen: RecommendationTrackItem[] = [];
      for (const [tId, data] of trackPlayCounts.entries()) {
        const isOld = now - data.lastTime > tenDaysMs;
        if (data.count >= 2 && isOld) {
          longTimeNoListen.push({
            ...data.item,
            listenCount: data.count,
            lastListenedAt: new Date(data.lastTime).toISOString(),
            explanation: `Вы слушали ${data.count} раз, но давно не включали`,
          });
        }
        if (longTimeNoListen.length >= 6) break;
      }

      // C. Calculate Artist & Track Affinity Score for "For You" & "Based On Your Taste"
      const artistFrequency = new Map<string, number>();
      for (const h of userHistory) {
        const name = h.artistName.toLowerCase();
        artistFrequency.set(name, (artistFrequency.get(name) || 0) + 1);
      }
      for (const s of subscriptions) {
        if (s.externalArtistName) {
          const name = s.externalArtistName.toLowerCase();
          artistFrequency.set(name, (artistFrequency.get(name) || 0) + 5);
        }
      }

      // Top Artist Name
      let topArtistName = '';
      let maxFreq = 0;
      for (const [name, freq] of artistFrequency.entries()) {
        if (freq > maxFreq) {
          maxFreq = freq;
          topArtistName = name;
        }
      }

      // Candidate Recommendations Pool ("For You" & "Based on Your Taste")
      const forYouMap = new Map<string, RecommendationTrackItem>();

      // Include favorite Dodik tracks
      for (const f of favTracks) {
        if (f.trackId && f.title && f.artistName) {
          forYouMap.set(String(f.trackId), {
            trackId: String(f.trackId),
            provider: 'dodik',
            title: f.title,
            artistName: f.artistName,
            releaseTitle: f.releaseTitle,
            releaseCover: f.releaseCover,
            score: 95,
            explanation: 'Из ваших любимых треков',
          });
        }
      }

      // Fetch external recommendations if top artist exists
      if (topArtistName) {
        try {
          const searchTracks = await youtubeMusicProvider.searchTracks(topArtistName, { limit: 10 });
          for (const st of searchTracks) {
            if (!forYouMap.has(st.id)) {
              forYouMap.set(st.id, {
                trackId: st.id,
                provider: st.provider,
                title: st.title,
                artistName: st.artist,
                artistId: st.artistId,
                releaseTitle: st.album || 'Сингл',
                releaseCover: st.thumbnail,
                durationSeconds: st.durationSeconds,
                score: 80,
                explanation: `Потому что вы слушали ${st.artist}`,
              });
            }
          }
        } catch {
          // Fallback gracefully
        }
      }

      // Dodik Catalog popular tracks fallback to enrich
      const dodikPopular = await db
        .select({
          trackId: musicTracks.id,
          title: musicTracks.title,
          artistName: artistProfiles.stageName,
          releaseTitle: musicReleases.title,
          releaseCover: musicReleases.cover,
          listenCount: musicTracks.listenCount,
        })
        .from(musicTracks)
        .leftJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
        .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
        .orderBy(desc(musicTracks.listenCount))
        .limit(10);

      for (const dp of dodikPopular) {
        if (dp.trackId && dp.title && dp.artistName && !forYouMap.has(String(dp.trackId))) {
          forYouMap.set(String(dp.trackId), {
            trackId: String(dp.trackId),
            provider: 'dodik',
            title: dp.title,
            artistName: dp.artistName,
            releaseTitle: dp.releaseTitle,
            releaseCover: dp.releaseCover,
            score: 70,
            explanation: 'Популярно в Dodik Tracker',
          });
        }
      }

      const allForYou = Array.from(forYouMap.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
      const forYou = allForYou.slice(0, 8);
      const basedOnYourTaste = allForYou.slice(8, 16);

      // D. New Releases for You (from subscribed or favorite artists)
      const newForYou: RecommendationReleaseItem[] = [];
      for (const s of subscriptions) {
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
          } catch {
            // ignore
          }
        }
        if (newForYou.length >= 6) break;
      }

      return {
        continueListening,
        forYou,
        longTimeNoListen,
        basedOnYourTaste,
        newForYou,
        popularNow: [],
        isColdStart: false,
      };
    } catch (err) {
      console.error('[MusicRecommendationService] Error generating recommendations:', err);
      return this.getColdStartRecommendations();
    }
  }

  /**
   * Cold start recommendations for new or unauthenticated users.
   */
  public async getColdStartRecommendations(): Promise<RecommendationResponse> {
    const popularNow: RecommendationTrackItem[] = [];

    // 1. Dodik popular tracks
    try {
      const dodikPopular = await db
        .select({
          trackId: musicTracks.id,
          title: musicTracks.title,
          artistName: artistProfiles.stageName,
          releaseTitle: musicReleases.title,
          releaseCover: musicReleases.cover,
        })
        .from(musicTracks)
        .leftJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
        .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
        .orderBy(desc(musicTracks.listenCount))
        .limit(8);

      for (const dp of dodikPopular) {
        if (dp.trackId && dp.title && dp.artistName) {
          popularNow.push({
            trackId: String(dp.trackId),
            provider: 'dodik',
            title: dp.title,
            artistName: dp.artistName,
            releaseTitle: dp.releaseTitle,
            releaseCover: dp.releaseCover,
            explanation: 'Популярно в Dodik Tracker',
          });
        }
      }
    } catch {
      // ignore
    }

    // 2. Trending external tracks
    try {
      const externalPopular = await youtubeMusicProvider.searchTracks('Hits 2024', { limit: 8 });
      for (const ep of externalPopular) {
        popularNow.push({
          trackId: ep.id,
          provider: ep.provider,
          title: ep.title,
          artistName: ep.artist,
          artistId: ep.artistId,
          releaseTitle: ep.album || 'Сингл',
          releaseCover: ep.thumbnail,
          durationSeconds: ep.durationSeconds,
          explanation: 'Популярно сейчас',
        });
      }
    } catch {
      // ignore
    }

    return {
      continueListening: [],
      forYou: [],
      longTimeNoListen: [],
      basedOnYourTaste: [],
      newForYou: [],
      popularNow: popularNow.slice(0, 12),
      isColdStart: true,
    };
  }

  /**
   * Returns similar tracks for a given track ID or artist/title query.
   */
  public async getSimilarTracksForTrack(
    trackId: string,
    queryArtist?: string,
    queryTitle?: string
  ): Promise<RecommendationTrackItem[]> {
    const similarMap = new Map<string, RecommendationTrackItem>();

    const isInternalNum = !isNaN(Number(trackId)) && !trackId.startsWith('yt_');
    let artistForSearch = queryArtist || '';

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
          .leftJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
          .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
          .where(eq(musicTracks.id, Number(trackId)));

        if (dbTrack) {
          if (!artistForSearch && dbTrack.artistName) {
            artistForSearch = dbTrack.artistName;
          }

          if (dbTrack.artistId) {
            const sameArtistTracks = await db
              .select({
                id: musicTracks.id,
                title: musicTracks.title,
                releaseTitle: musicReleases.title,
                releaseCover: musicReleases.cover,
                artistName: artistProfiles.stageName,
              })
              .from(musicTracks)
              .leftJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
              .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
              .where(
                and(
                  eq(musicReleases.artistId, dbTrack.artistId),
                  sql`${musicTracks.id} != ${dbTrack.id}`
                )
              )
              .limit(8);

            for (const sat of sameArtistTracks) {
              similarMap.set(String(sat.id), {
                trackId: String(sat.id),
                provider: 'dodik',
                title: sat.title,
                artistName: sat.artistName || artistForSearch || 'Исполнитель',
                releaseTitle: sat.releaseTitle,
                releaseCover: sat.releaseCover,
                explanation: `От исполнителя ${sat.artistName || artistForSearch}`,
              });
            }
          }
        }
      } catch (err) {
        console.error('[MusicRecommendationService] Error getting internal similar tracks:', err);
      }
    }

    if (artistForSearch) {
      try {
        const searched = await youtubeMusicProvider.searchTracks(artistForSearch, { limit: 12 });
        for (const st of searched) {
          if (st.id !== trackId && !similarMap.has(st.id)) {
            similarMap.set(st.id, {
              trackId: st.id,
              provider: st.provider,
              title: st.title,
              artistName: st.artist,
              artistId: st.artistId,
              releaseTitle: st.album || 'Сингл',
              releaseCover: st.thumbnail,
              durationSeconds: st.durationSeconds,
              explanation: `Похоже на «${artistForSearch}»`,
            });
          }
          if (similarMap.size >= 12) break;
        }
      } catch (err) {
        console.error('[MusicRecommendationService] Error fetching external similar tracks:', err);
      }
    }

    if (similarMap.size === 0) {
      try {
        const externalPopular = await youtubeMusicProvider.searchTracks('Hits 2024', { limit: 8 });
        for (const ep of externalPopular) {
          if (ep.id !== trackId) {
            similarMap.set(ep.id, {
              trackId: ep.id,
              provider: ep.provider,
              title: ep.title,
              artistName: ep.artist,
              artistId: ep.artistId,
              releaseTitle: ep.album || 'Сингл',
              releaseCover: ep.thumbnail,
              durationSeconds: ep.durationSeconds,
              explanation: 'Популярное предложение',
            });
          }
        }
      } catch {}
    }

    return Array.from(similarMap.values()).slice(0, 12);
  }

  /**
   * Dedicated endpoint logic for GET /api/music/recommendations/for-you
   * Real user signal-based personalized recommendations with pagination support.
   */
  public async getPersonalizedForYou(
    userId: number | null,
    options: { limit?: number; cursor?: string | number; refresh?: boolean } = {}
  ): Promise<ForYouResponse> {
    const limit = Math.min(Math.max(Number(options.limit) || 12, 1), 50);
    const offset = Math.max(parseInt(String(options.cursor || '0'), 10) || 0, 0);

    // 1. Unauthenticated user -> Cold start fallback
    if (!userId) {
      const fallbackTracks = await this.getFallbackPopularTracks(Boolean(options.refresh));
      const paginated = fallbackTracks.slice(offset, offset + limit);
      const hasMore = fallbackTracks.length > offset + limit;
      return {
        isPersonalized: false,
        totalSignals: 0,
        fallbackReason: 'unauthenticated',
        tracks: paginated,
        hasMore,
        nextCursor: hasMore ? String(offset + limit) : null,
      };
    }

    try {
      // 2. Fetch real user signals from DB
      // A. userMusicHistory
      const userHistory = await db
        .select()
        .from(userMusicHistory)
        .where(eq(userMusicHistory.userId, userId))
        .orderBy(desc(userMusicHistory.listenedAt))
        .limit(100);

      // B. Qualified completed listens (isEligible = true)
      const qualifiedListens = await db
        .select({
          trackId: musicListens.trackId,
          releaseId: musicListens.releaseId,
          createdAt: musicListens.createdAt,
        })
        .from(musicListens)
        .where(and(eq(musicListens.userId, userId), eq(musicListens.isEligible, true)))
        .orderBy(desc(musicListens.createdAt))
        .limit(100);

      // C. Favorite tracks
      const favTracks = await db
        .select({
          trackId: musicFavoriteTracks.trackId,
          title: musicTracks.title,
          artistId: musicTracks.artistId,
          artistName: artistProfiles.stageName,
          releaseId: musicTracks.releaseId,
          releaseTitle: musicReleases.title,
          releaseCover: musicReleases.cover,
          duration: musicTracks.duration,
        })
        .from(musicFavoriteTracks)
        .innerJoin(musicTracks, eq(musicFavoriteTracks.trackId, musicTracks.id))
        .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
        .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
        .where(
          and(
            eq(musicFavoriteTracks.userId, userId),
            eq(musicTracks.status, 'PUBLISHED'),
            eq(musicReleases.status, 'PUBLISHED')
          )
        )
        .limit(50);

      // D. Favorite releases
      const favReleases = await db
        .select({
          releaseId: musicFavoriteReleases.releaseId,
          artistId: musicReleases.artistId,
          artistName: artistProfiles.stageName,
        })
        .from(musicFavoriteReleases)
        .innerJoin(musicReleases, eq(musicFavoriteReleases.releaseId, musicReleases.id))
        .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
        .where(and(eq(musicFavoriteReleases.userId, userId), eq(musicReleases.status, 'PUBLISHED')))
        .limit(50);

      // E. Subscribed artists
      const subscriptions = await db
        .select()
        .from(artistSubscriptions)
        .where(eq(artistSubscriptions.userId, userId))
        .limit(50);

      const totalSignals =
        userHistory.length +
        qualifiedListens.length +
        favTracks.length +
        favReleases.length +
        subscriptions.length;

      // If user has insufficient history (< 2 signals), return cold-start fallback
      if (totalSignals < 2) {
        const fallbackTracks = await this.getFallbackPopularTracks(Boolean(options.refresh));
        const paginated = fallbackTracks.slice(offset, offset + limit);
        const hasMore = fallbackTracks.length > offset + limit;
        return {
          isPersonalized: false,
          totalSignals,
          fallbackReason: 'insufficient_history',
          tracks: paginated,
          hasMore,
          nextCursor: hasMore ? String(offset + limit) : null,
        };
      }

      // 3. Calculate affinity weights
      const artistAffinity = new Map<string, { weight: number; displayName: string; artistId?: number }>();
      const addArtistScore = (name: string, score: number, id?: number) => {
        if (!name) return;
        const key = name.toLowerCase().trim();
        const existing = artistAffinity.get(key);
        if (existing) {
          existing.weight += score;
          if (id && !existing.artistId) existing.artistId = id;
        } else {
          artistAffinity.set(key, { weight: score, displayName: name.trim(), artistId: id });
        }
      };

      for (const h of userHistory) {
        addArtistScore(h.artistName, 2);
      }
      for (const f of favTracks) {
        if (f.artistName) addArtistScore(f.artistName, 5, f.artistId || undefined);
      }
      for (const fr of favReleases) {
        if (fr.artistName) addArtistScore(fr.artistName, 4, fr.artistId || undefined);
      }
      for (const s of subscriptions) {
        if (s.externalArtistName) {
          addArtistScore(s.externalArtistName, 6);
        }
        if (s.artistId) {
          const [ap] = await db
            .select({ stageName: artistProfiles.stageName })
            .from(artistProfiles)
            .where(eq(artistProfiles.id, s.artistId))
            .limit(1);
          if (ap?.stageName) addArtistScore(ap.stageName, 6, s.artistId);
        }
      }

      // Top Artists
      const sortedArtists = Array.from(artistAffinity.values()).sort((a, b) => b.weight - a.weight);
      const topArtist = sortedArtists.length > 0 ? sortedArtists[0] : null;

      // 4. Candidate Pool Building
      const candidateMap = new Map<string, RecommendationTrackItem>();

      // A. Include User's Favorite Tracks (high relevance)
      for (const ft of favTracks) {
        if (!candidateMap.has(String(ft.trackId))) {
          candidateMap.set(String(ft.trackId), {
            trackId: String(ft.trackId),
            provider: 'dodik',
            title: ft.title,
            artistName: ft.artistName || 'Исполнитель',
            artistId: ft.artistId ? String(ft.artistId) : null,
            releaseTitle: ft.releaseTitle,
            releaseCover: ft.releaseCover,
            durationSeconds: ft.duration,
            score: 95,
            explanation: 'Из ваших любимых треков',
          });
        }
      }

      // B. Discover other published Dodik tracks by affinity artists
      const affinityArtistIds = sortedArtists
        .map((a) => a.artistId)
        .filter((id): id is number => typeof id === 'number');

      if (affinityArtistIds.length > 0) {
        const dodikArtistTracks = await db
          .select({
            id: musicTracks.id,
            title: musicTracks.title,
            duration: musicTracks.duration,
            listenCount: musicTracks.listenCount,
            artistId: musicTracks.artistId,
            artistName: artistProfiles.stageName,
            releaseTitle: musicReleases.title,
            releaseCover: musicReleases.cover,
          })
          .from(musicTracks)
          .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
          .leftJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
          .where(
            and(
              eq(musicTracks.status, 'PUBLISHED'),
              eq(musicReleases.status, 'PUBLISHED'),
              inArray(musicTracks.artistId, affinityArtistIds.slice(0, 10))
            )
          )
          .limit(30);

        for (const dat of dodikArtistTracks) {
          const tId = String(dat.id);
          if (!candidateMap.has(tId)) {
            candidateMap.set(tId, {
              trackId: tId,
              provider: 'dodik',
              title: dat.title,
              artistName: dat.artistName || 'Исполнитель',
              artistId: dat.artistId ? String(dat.artistId) : null,
              releaseTitle: dat.releaseTitle,
              releaseCover: dat.releaseCover,
              durationSeconds: dat.duration,
              score: 85 + Math.min(10, (dat.listenCount || 0) * 0.1),
              explanation: `Потому что вы слушаете «${dat.artistName}»`,
            });
          }
        }
      }

      // C. Genre Affinity discovery:
      // Find releases user listened to, extract genres, find more published tracks from those genres
      const userReleaseIds = [
        ...qualifiedListens.map((q) => q.releaseId),
        ...favReleases.map((fr) => fr.releaseId),
      ].filter((id): id is number => typeof id === 'number');

      if (userReleaseIds.length > 0) {
        const genresUserLikes = await db
          .select({
            genreId: musicReleaseGenres.genreId,
            genreName: musicGenres.name,
          })
          .from(musicReleaseGenres)
          .innerJoin(musicGenres, eq(musicReleaseGenres.genreId, musicGenres.id))
          .where(inArray(musicReleaseGenres.releaseId, userReleaseIds.slice(0, 20)))
          .limit(30);

        const genreCounts = new Map<number, { count: number; name: string }>();
        for (const g of genresUserLikes) {
          const current = genreCounts.get(g.genreId);
          if (current) {
            current.count += 1;
          } else {
            genreCounts.set(g.genreId, { count: 1, name: g.genreName });
          }
        }

        const topGenres = Array.from(genreCounts.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 3);

        if (topGenres.length > 0) {
          const topGenreIds = topGenres.map(([id]) => id);
          const genreTracks = await db
            .select({
              id: musicTracks.id,
              title: musicTracks.title,
              duration: musicTracks.duration,
              listenCount: musicTracks.listenCount,
              artistId: musicTracks.artistId,
              artistName: artistProfiles.stageName,
              releaseTitle: musicReleases.title,
              releaseCover: musicReleases.cover,
              genreId: musicReleaseGenres.genreId,
            })
            .from(musicTracks)
            .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
            .innerJoin(musicReleaseGenres, eq(musicReleases.id, musicReleaseGenres.releaseId))
            .leftJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
            .where(
              and(
                eq(musicTracks.status, 'PUBLISHED'),
                eq(musicReleases.status, 'PUBLISHED'),
                inArray(musicReleaseGenres.genreId, topGenreIds)
              )
            )
            .limit(20);

          for (const gt of genreTracks) {
            const tId = String(gt.id);
            if (!candidateMap.has(tId)) {
              const genreInfo = genreCounts.get(gt.genreId);
              candidateMap.set(tId, {
                trackId: tId,
                provider: 'dodik',
                title: gt.title,
                artistName: gt.artistName || 'Исполнитель',
                artistId: gt.artistId ? String(gt.artistId) : null,
                releaseTitle: gt.releaseTitle,
                releaseCover: gt.releaseCover,
                durationSeconds: gt.duration,
                score: 75 + Math.min(10, (gt.listenCount || 0) * 0.1),
                explanation: `В жанре «${genreInfo?.name || 'Популярное'}», который вы слушаете`,
              });
            }
          }
        }
      }

      // D. External candidate tracks from top artist
      if (topArtist && topArtist.displayName) {
        try {
          const externalHits = await youtubeMusicProvider.searchTracks(topArtist.displayName, { limit: 12 });
          for (const eh of externalHits) {
            if (!candidateMap.has(eh.id)) {
              candidateMap.set(eh.id, {
                trackId: eh.id,
                provider: eh.provider,
                title: eh.title,
                artistName: eh.artist,
                artistId: eh.artistId,
                releaseTitle: eh.album || 'Сингл',
                releaseCover: eh.thumbnail,
                durationSeconds: eh.durationSeconds,
                score: 80,
                explanation: `Потому что вы слушали «${topArtist.displayName}»`,
              });
            }
          }
        } catch {
          // ignore
        }
      }

      // E. Add highest-rated published Dodik tracks to enrich
      const dodikHighRated = await db
        .select({
          id: musicTracks.id,
          title: musicTracks.title,
          duration: musicTracks.duration,
          listenCount: musicTracks.listenCount,
          artistId: musicTracks.artistId,
          artistName: artistProfiles.stageName,
          releaseTitle: musicReleases.title,
          releaseCover: musicReleases.cover,
        })
        .from(musicTracks)
        .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
        .leftJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
        .where(
          and(
            eq(musicTracks.status, 'PUBLISHED'),
            eq(musicReleases.status, 'PUBLISHED')
          )
        )
        .orderBy(desc(musicTracks.listenCount))
        .limit(15);

      for (const dh of dodikHighRated) {
        const tId = String(dh.id);
        if (!candidateMap.has(tId)) {
          candidateMap.set(tId, {
            trackId: tId,
            provider: 'dodik',
            title: dh.title,
            artistName: dh.artistName || 'Исполнитель',
            artistId: dh.artistId ? String(dh.artistId) : null,
            releaseTitle: dh.releaseTitle,
            releaseCover: dh.releaseCover,
            durationSeconds: dh.duration,
            score: 65,
            explanation: 'Популярно в Dodik Tracker',
          });
        }
      }

      // 5. Filter, sort, and paginate
      if (options.refresh) {
        for (const item of candidateMap.values()) {
          item.score = (item.score || 70) + (Math.random() * 20 - 10);
        }
      }

      const allCandidates = Array.from(candidateMap.values()).sort(
        (a, b) => (b.score || 0) - (a.score || 0)
      );

      const paginated = allCandidates.slice(offset, offset + limit);
      const hasMore = allCandidates.length > offset + limit;

      return {
        isPersonalized: true,
        totalSignals,
        fallbackReason: null,
        tracks: paginated,
        hasMore,
        nextCursor: hasMore ? String(offset + limit) : null,
      };
    } catch (err) {
      console.error('[MusicRecommendationService] Error in getPersonalizedForYou:', err);
      const fallbackTracks = await this.getFallbackPopularTracks(Boolean(options.refresh));
      const paginated = fallbackTracks.slice(offset, offset + limit);
      const hasMore = fallbackTracks.length > offset + limit;
      return {
        isPersonalized: false,
        totalSignals: 0,
        fallbackReason: 'insufficient_history',
        tracks: paginated,
        hasMore,
        nextCursor: hasMore ? String(offset + limit) : null,
      };
    }
  }

  /**
   * Helper to retrieve popular published tracks as fallback
   */
  public async getFallbackPopularTracks(shuffle: boolean = false): Promise<RecommendationTrackItem[]> {
    const list: RecommendationTrackItem[] = [];
    try {
      const popularDodik = await db
        .select({
          trackId: musicTracks.id,
          title: musicTracks.title,
          artistName: artistProfiles.stageName,
          artistId: musicTracks.artistId,
          releaseTitle: musicReleases.title,
          releaseCover: musicReleases.cover,
          duration: musicTracks.duration,
        })
        .from(musicTracks)
        .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
        .leftJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
        .where(
          and(
            eq(musicTracks.status, 'PUBLISHED'),
            eq(musicReleases.status, 'PUBLISHED')
          )
        )
        .orderBy(desc(musicTracks.listenCount))
        .limit(16);

      for (const pd of popularDodik) {
        list.push({
          trackId: String(pd.trackId),
          provider: 'dodik',
          title: pd.title,
          artistName: pd.artistName || 'Исполнитель',
          artistId: pd.artistId ? String(pd.artistId) : null,
          releaseTitle: pd.releaseTitle,
          releaseCover: pd.releaseCover,
          durationSeconds: pd.duration,
          explanation: 'Популярно в Dodik Tracker',
        });
      }
    } catch (err) {
      console.error('Error fetching fallback popular tracks:', err);
    }

    try {
      const ytPopular = await youtubeMusicProvider.searchTracks('Top Hits 2024', { limit: 12 });
      for (const yt of ytPopular) {
        list.push({
          trackId: yt.id,
          provider: yt.provider,
          title: yt.title,
          artistName: yt.artist,
          artistId: yt.artistId,
          releaseTitle: yt.album || 'Сингл',
          releaseCover: yt.thumbnail,
          durationSeconds: yt.durationSeconds,
          explanation: 'Мировой хит',
        });
      }
    } catch {}

    if (shuffle) {
      list.sort(() => Math.random() - 0.5);
    }

    return list;
  }
}

export const musicRecommendationService = new MusicRecommendationService();
