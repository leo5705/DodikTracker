import { db } from '../../../db/index.ts';
import {
  userMusicHistory,
  musicFavoriteTracks,
  musicFavoriteReleases,
  artistSubscriptions,
  musicReviews,
  musicTracks,
  musicReleases,
  artistProfiles,
  musicReleaseGenres,
  musicGenres,
  musicPlaylistTracks,
  musicPlaylists,
} from '../../../db/schema.ts';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { TasteProfile } from './types.ts';

const PROFILE_CACHE = new Map<number, { profile: TasteProfile; expiresAt: number }>();
const PROFILE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

export class TasteProfileService {
  /**
   * Invalidates taste profile cache for a user upon significant interaction.
   */
  public invalidateUserCache(userId: number) {
    PROFILE_CACHE.delete(userId);
  }

  /**
   * Computes or retrieves cached Taste Profile for a user.
   */
  public async getTasteProfile(userId: number, forceRefresh = false): Promise<TasteProfile> {
    const now = Date.now();
    const cached = PROFILE_CACHE.get(userId);

    if (!forceRefresh && cached && cached.expiresAt > now) {
      return cached.profile;
    }

    const profile = await this.computeTasteProfile(userId);
    PROFILE_CACHE.set(userId, {
      profile,
      expiresAt: now + PROFILE_TTL_MS,
    });

    return profile;
  }

  private async computeTasteProfile(userId: number): Promise<TasteProfile> {
    const now = Date.now();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);

    // 1. Fetch user listening history (last 150 records)
    const historyRows = await db
      .select()
      .from(userMusicHistory)
      .where(eq(userMusicHistory.userId, userId))
      .orderBy(desc(userMusicHistory.listenedAt))
      .limit(150);

    // 2. Fetch favorite tracks
    const favTracks = await db
      .select({
        trackId: musicFavoriteTracks.trackId,
        artistId: musicTracks.artistId,
        artistName: artistProfiles.stageName,
        releaseId: musicTracks.releaseId,
        duration: musicTracks.duration,
        explicit: musicTracks.explicit,
      })
      .from(musicFavoriteTracks)
      .innerJoin(musicTracks, eq(musicFavoriteTracks.trackId, musicTracks.id))
      .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(and(eq(musicFavoriteTracks.userId, userId), eq(musicReleases.status, 'PUBLISHED')))
      .limit(100);

    // 3. Fetch favorite releases
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

    // 4. Fetch artist subscriptions
    const subscriptions = await db
      .select({
        artistId: artistSubscriptions.artistId,
        provider: artistSubscriptions.provider,
        externalArtistName: artistSubscriptions.externalArtistName,
        stageName: artistProfiles.stageName,
      })
      .from(artistSubscriptions)
      .leftJoin(artistProfiles, eq(artistSubscriptions.artistId, artistProfiles.id))
      .where(eq(artistSubscriptions.userId, userId))
      .limit(50);

    // 5. Fetch reviews submitted by user
    const reviews = await db
      .select({
        releaseId: musicReviews.releaseId,
        overallScore: musicReviews.overallScore,
        artistId: musicReleases.artistId,
        artistName: artistProfiles.stageName,
      })
      .from(musicReviews)
      .innerJoin(musicReleases, eq(musicReviews.releaseId, musicReleases.id))
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(eq(musicReviews.userId, userId))
      .limit(50);

    // 6. Fetch tracks user added to playlists
    const playlistTracks = await db
      .select({
        trackId: musicPlaylistTracks.trackId,
        artistName: artistProfiles.stageName,
        artistId: musicTracks.artistId,
      })
      .from(musicPlaylistTracks)
      .innerJoin(musicPlaylists, eq(musicPlaylistTracks.playlistId, musicPlaylists.id))
      .innerJoin(musicTracks, eq(musicPlaylistTracks.trackId, musicTracks.id))
      .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(and(eq(musicPlaylists.userId, userId), eq(musicReleases.status, 'PUBLISHED')))
      .limit(60);

    // Accumulators
    const artistScores = new Map<string, { weight: number; playCount: number; likeCount: number; skipCount: number; artistId?: number | string; rawName: string }>();
    const genreScores = new Map<string, { weight: number; count: number; name: string }>();
    const negativeArtists = new Set<string>();
    const negativeGenres = new Set<string>();

    const favoriteTrackIds = new Set<string>();
    const favoriteReleaseIds = new Set<number>();
    const subscribedArtistNames = new Set<string>();
    const recentTrackIds = new Set<string>();

    const shortTermArtistsList: string[] = [];
    const shortTermGenresList: string[] = [];

    let totalDurationSum = 0;
    let durationCount = 0;
    let explicitCount = 0;
    let totalSampleCount = 0;

    const normalizeKey = (str?: string | null) => (str ? str.toLowerCase().trim() : '');

    const addArtistWeight = (
      name: string,
      score: number,
      meta?: { isPlay?: boolean; isLike?: boolean; isSkip?: boolean; artistId?: number | string }
    ) => {
      if (!name || !name.trim()) return;
      const key = normalizeKey(name);
      const existing = artistScores.get(key) || {
        weight: 0,
        playCount: 0,
        likeCount: 0,
        skipCount: 0,
        artistId: meta?.artistId,
        rawName: name.trim(),
      };

      existing.weight += score;
      if (meta?.isPlay) existing.playCount += 1;
      if (meta?.isLike) existing.likeCount += 1;
      if (meta?.isSkip) existing.skipCount += 1;
      if (meta?.artistId && !existing.artistId) existing.artistId = meta.artistId;

      artistScores.set(key, existing);
    };

    const addGenreWeight = (genreName: string, score: number) => {
      if (!genreName || !genreName.trim()) return;
      const key = normalizeKey(genreName);
      const existing = genreScores.get(key) || { weight: 0, count: 0, name: genreName.trim() };
      existing.weight += score;
      existing.count += 1;
      genreScores.set(key, existing);
    };

    // Process Subscriptions (Strong long-term positive: +5.0)
    for (const sub of subscriptions) {
      const name = sub.stageName || sub.externalArtistName;
      if (name) {
        subscribedArtistNames.add(name);
        addArtistWeight(name, 5.0, { isLike: true, artistId: sub.artistId || undefined });
      }
    }

    // Process Favorite Releases (+3.5)
    for (const fr of favReleases) {
      if (fr.releaseId) favoriteReleaseIds.add(fr.releaseId);
      if (fr.artistName) {
        addArtistWeight(fr.artistName, 3.5, { isLike: true, artistId: fr.artistId || undefined });
      }
    }

    // Process Favorite Tracks (+4.0)
    for (const ft of favTracks) {
      if (ft.trackId) favoriteTrackIds.add(String(ft.trackId));
      if (ft.artistName) {
        addArtistWeight(ft.artistName, 4.0, { isLike: true, artistId: ft.artistId || undefined });
      }
      if (ft.duration) {
        totalDurationSum += ft.duration;
        durationCount++;
      }
      if (ft.explicit) explicitCount++;
      totalSampleCount++;
    }

    // Process Playlist Tracks (+3.0)
    for (const pt of playlistTracks) {
      if (pt.artistName) {
        addArtistWeight(pt.artistName, 3.0, { isLike: true, artistId: pt.artistId || undefined });
      }
    }

    // Process Reviews (Based on rating score)
    for (const rev of reviews) {
      if (rev.artistName) {
        const ratingWeight = Math.max(0.5, (rev.overallScore || 70) / 20); // 90 -> 4.5
        addArtistWeight(rev.artistName, ratingWeight, { artistId: rev.artistId || undefined });
      }
    }

    // Fetch genres for user's favorite & reviewed releases in batch
    const releaseIdsForGenres = Array.from(
      new Set([
        ...favReleases.map((r) => r.releaseId),
        ...favTracks.map((t) => t.releaseId).filter((id): id is number => typeof id === 'number'),
        ...reviews.map((rv) => rv.releaseId),
      ])
    ).slice(0, 50);

    if (releaseIdsForGenres.length > 0) {
      const releaseGenres = await db
        .select({
          releaseId: musicReleaseGenres.releaseId,
          genreName: musicGenres.name,
        })
        .from(musicReleaseGenres)
        .innerJoin(musicGenres, eq(musicReleaseGenres.genreId, musicGenres.id))
        .where(inArray(musicReleaseGenres.releaseId, releaseIdsForGenres));

      for (const rg of releaseGenres) {
        addGenreWeight(rg.genreName, 2.5);
      }
    }

    // Process History (Listens, completions, repeats, skips, and quick skips)
    const trackPlayMap = new Map<string, number>();

    for (let i = 0; i < historyRows.length; i++) {
      const h = historyRows[i];
      const isRecent = h.listenedAt && h.listenedAt >= threeDaysAgo;
      const trackId = String(h.trackId);

      recentTrackIds.add(trackId);

      // Track play frequency
      const playCount = (trackPlayMap.get(trackId) || 0) + 1;
      trackPlayMap.set(trackId, playCount);

      if (h.durationSeconds) {
        totalDurationSum += h.durationSeconds;
        durationCount++;
      }
      totalSampleCount++;

      // Compute individual listen signal weight
      let listenWeight = 1.0;

      if (h.isCompleted || (h.completionRatio && h.completionRatio >= 0.85)) {
        listenWeight = 2.0; // Strong completion
      } else if (h.isQuickSkip) {
        listenWeight = -1.2; // Rapid skip penalty
      } else if (h.isSkipped) {
        listenWeight = -0.5; // Normal skip penalty
      }

      // Repeat listen bonus
      if (playCount >= 2) {
        listenWeight += 1.5;
      }
      if (playCount >= 5) {
        listenWeight += 3.0; // Heavy repeat
      }

      // Recency decay: older records carry less immediate weight
      const daysOld = h.listenedAt ? Math.max(0, (now - h.listenedAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      const decay = Math.exp(-daysOld / 30); // 30-day half-life decay
      const decayedScore = listenWeight * decay;

      if (h.artistName) {
        addArtistWeight(h.artistName, decayedScore, {
          isPlay: true,
          isSkip: Boolean(h.isSkipped || h.isQuickSkip),
          artistId: h.artistId || undefined,
        });

        if (isRecent || i < 15) {
          if (!shortTermArtistsList.includes(h.artistName)) {
            shortTermArtistsList.push(h.artistName);
          }
        }
      }
    }

    // Identify negative signals (high skip rate & net negative weight)
    for (const [key, data] of artistScores.entries()) {
      if (data.skipCount >= 3 && data.skipCount > data.playCount * 0.7 && data.weight < 0) {
        negativeArtists.add(key);
      }
    }

    // Normalize Artist & Genre weights into [0.0 - 1.0] scale
    let maxArtistWeight = 0;
    for (const a of artistScores.values()) {
      if (a.weight > maxArtistWeight) maxArtistWeight = a.weight;
    }

    let maxGenreWeight = 0;
    for (const g of genreScores.values()) {
      if (g.weight > maxGenreWeight) maxGenreWeight = g.weight;
    }

    const normalizedArtists: Record<string, { weight: number; playCount: number; likeCount: number; skipCount: number; artistId?: number | string }> = {};
    for (const [k, v] of artistScores.entries()) {
      if (v.weight > 0) {
        normalizedArtists[v.rawName] = {
          weight: maxArtistWeight > 0 ? Number((v.weight / maxArtistWeight).toFixed(3)) : 0.5,
          playCount: v.playCount,
          likeCount: v.likeCount,
          skipCount: v.skipCount,
          artistId: v.artistId,
        };
      }
    }

    const normalizedGenres: Record<string, { weight: number; count: number; name: string }> = {};
    for (const [k, v] of genreScores.entries()) {
      if (v.weight > 0) {
        normalizedGenres[v.name] = {
          weight: maxGenreWeight > 0 ? Number((v.weight / maxGenreWeight).toFixed(3)) : 0.5,
          count: v.count,
          name: v.name,
        };
      }
    }

    const totalSignals =
      historyRows.length +
      favTracks.length +
      favReleases.length +
      subscriptions.length +
      reviews.length +
      playlistTracks.length;

    return {
      userId,
      computedAt: now,
      totalSignals,
      genres: normalizedGenres,
      artists: normalizedArtists,
      negativeArtists,
      negativeGenres,
      shortTermArtists: shortTermArtistsList.slice(0, 10),
      shortTermGenres: shortTermGenresList.slice(0, 5),
      recentTrackIds,
      averageDuration: durationCount > 0 ? Math.round(totalDurationSum / durationCount) : 210,
      explicitRatio: totalSampleCount > 0 ? Number((explicitCount / totalSampleCount).toFixed(2)) : 0.2,
      favoriteTrackIds,
      favoriteReleaseIds,
      subscribedArtistNames,
    };
  }
}

export const tasteProfileService = new TasteProfileService();
