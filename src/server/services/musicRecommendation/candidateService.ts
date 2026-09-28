import { db } from '../../../db/index.ts';
import {
  musicTracks,
  musicReleases,
  artistProfiles,
  musicReleaseGenres,
  musicGenres,
  musicReviews,
  userMusicHistory,
} from '../../../db/schema.ts';
import { eq, and, desc, sql, inArray, notInArray, gte, lte } from 'drizzle-orm';
import { TasteProfile, CandidateTrack } from './types.ts';
import { youtubeMusicProvider } from '../externalMusic/youtubeMusicProvider.ts';
import { transitionService } from './transitionService.ts';

export class CandidateService {
  /**
   * Generates a diverse pool of candidate tracks from internal DB & external sources.
   */
  public async generateCandidatePool(
    taste: TasteProfile,
    options: { includeExternal?: boolean } = {}
  ): Promise<CandidateTrack[]> {
    const candidateMap = new Map<string, CandidateTrack>();

    const addCandidate = (c: CandidateTrack) => {
      if (!c.id) return;
      const key = String(c.id);
      const existing = candidateMap.get(key);
      if (!existing) {
        candidateMap.set(key, c);
      }
    };

    // Top artists sorted by weight
    const topArtistsList = Object.entries(taste.artists)
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 10);

    // Top genres sorted by weight
    const topGenresList = Object.entries(taste.genres)
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 5);

    // 1. Source A: Published Dodik Tracks by User's Affinity Artists
    const affinityArtistIds = topArtistsList
      .map(([_, data]) => data.artistId)
      .filter((id): id is number => typeof id === 'number');

    if (affinityArtistIds.length > 0) {
      try {
        const artistTracks = await db
          .select({
            id: musicTracks.id,
            title: musicTracks.title,
            duration: musicTracks.duration,
            explicit: musicTracks.explicit,
            listenCount: musicTracks.listenCount,
            artistId: musicTracks.artistId,
            artistName: artistProfiles.stageName,
            releaseTitle: musicReleases.title,
            releaseCover: musicReleases.cover,
            releaseDate: musicReleases.releaseDate,
          })
          .from(musicTracks)
          .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
          .leftJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
          .where(
            and(
              eq(musicTracks.status, 'PUBLISHED'),
              eq(musicReleases.status, 'PUBLISHED'),
              inArray(musicTracks.artistId, affinityArtistIds.slice(0, 8))
            )
          )
          .limit(30);

        for (const t of artistTracks) {
          const isFav = taste.favoriteTrackIds.has(String(t.id));
          addCandidate({
            id: String(t.id),
            trackId: String(t.id),
            provider: 'dodik',
            title: t.title,
            artistName: t.artistName || 'Исполнитель',
            artistId: t.artistId,
            releaseTitle: t.releaseTitle,
            releaseCover: t.releaseCover,
            durationSeconds: t.duration,
            explicit: t.explicit,
            listenCount: t.listenCount,
            source: isFav ? 'favorite' : 'loved_artist',
            sourceReason: isFav ? 'Из ваших любимых треков' : `Потому что вы слушаете ${t.artistName}`,
          });
        }
      } catch (err) {
        console.warn('[CandidateService] Error fetching artist tracks:', err);
      }
    }

    // 2. Source B: Published Dodik Tracks by Preferred Genres
    if (topGenresList.length > 0) {
      try {
        const topGenreNames = topGenresList.map(([_, g]) => g.name);
        const genreTracks = await db
          .select({
            id: musicTracks.id,
            title: musicTracks.title,
            duration: musicTracks.duration,
            explicit: musicTracks.explicit,
            listenCount: musicTracks.listenCount,
            artistId: musicTracks.artistId,
            artistName: artistProfiles.stageName,
            releaseTitle: musicReleases.title,
            releaseCover: musicReleases.cover,
            genreName: musicGenres.name,
          })
          .from(musicTracks)
          .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
          .innerJoin(musicReleaseGenres, eq(musicReleases.id, musicReleaseGenres.releaseId))
          .innerJoin(musicGenres, eq(musicReleaseGenres.genreId, musicGenres.id))
          .leftJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
          .where(
            and(
              eq(musicTracks.status, 'PUBLISHED'),
              eq(musicReleases.status, 'PUBLISHED'),
              inArray(musicGenres.name, topGenreNames.slice(0, 4))
            )
          )
          .limit(30);

        for (const gt of genreTracks) {
          addCandidate({
            id: String(gt.id),
            trackId: String(gt.id),
            provider: 'dodik',
            title: gt.title,
            artistName: gt.artistName || 'Исполнитель',
            artistId: gt.artistId,
            releaseTitle: gt.releaseTitle,
            releaseCover: gt.releaseCover,
            durationSeconds: gt.duration,
            explicit: gt.explicit,
            genres: gt.genreName ? [gt.genreName] : [],
            listenCount: gt.listenCount,
            source: 'genre_match',
            sourceReason: `В вашем любимом жанре «${gt.genreName}»`,
          });
        }
      } catch (err) {
        console.warn('[CandidateService] Error fetching genre tracks:', err);
      }
    }

    // 3. Source C: Underrated Gems (High ratings, listenCount < 50)
    try {
      const underratedTracks = await db
        .select({
          id: musicTracks.id,
          title: musicTracks.title,
          duration: musicTracks.duration,
          explicit: musicTracks.explicit,
          listenCount: musicTracks.listenCount,
          artistId: musicTracks.artistId,
          artistName: artistProfiles.stageName,
          releaseTitle: musicReleases.title,
          releaseCover: musicReleases.cover,
          avgReviewScore: sql<number>`COALESCE((SELECT AVG(overall_score) FROM music_reviews WHERE release_id = music_releases.id), 80)`,
        })
        .from(musicTracks)
        .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
        .leftJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
        .where(
          and(
            eq(musicTracks.status, 'PUBLISHED'),
            eq(musicReleases.status, 'PUBLISHED'),
            lte(musicTracks.listenCount, 50)
          )
        )
        .orderBy(desc(sql`COALESCE((SELECT AVG(overall_score) FROM music_reviews WHERE release_id = music_releases.id), 0)`))
        .limit(15);

      for (const ug of underratedTracks) {
        addCandidate({
          id: String(ug.id),
          trackId: String(ug.id),
          provider: 'dodik',
          title: ug.title,
          artistName: ug.artistName || 'Исполнитель',
          artistId: ug.artistId,
          releaseTitle: ug.releaseTitle,
          releaseCover: ug.releaseCover,
          durationSeconds: ug.duration,
          explicit: ug.explicit,
          listenCount: ug.listenCount,
          avgScore: Number(ug.avgReviewScore || 80),
          source: 'underrated',
          sourceReason: 'Недооценённый трек сообщества Dodik Tracker',
        });
      }
    } catch (err) {
      console.warn('[CandidateService] Error fetching underrated tracks:', err);
    }

    // 4. Source D: Transition Graph candidates
    const recentSampleIds = Array.from(taste.recentTrackIds).slice(0, 10);
    if (recentSampleIds.length > 0) {
      for (const srcId of recentSampleIds.slice(0, 4)) {
        const nextList = await transitionService.getNextTracks(srcId, 4);
        for (const n of nextList) {
          if (!candidateMap.has(n.toTrackId)) {
            // Check if internal Dodik numeric track
            const numId = Number(n.toTrackId);
            if (!isNaN(numId) && !n.toTrackId.startsWith('yt_')) {
              try {
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
                  .leftJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
                  .where(eq(musicTracks.id, numId))
                  .limit(1);

                if (dbTrk) {
                  addCandidate({
                    id: String(dbTrk.id),
                    trackId: String(dbTrk.id),
                    provider: 'dodik',
                    title: dbTrk.title,
                    artistName: dbTrk.artistName || 'Исполнитель',
                    releaseTitle: dbTrk.releaseTitle,
                    releaseCover: dbTrk.releaseCover,
                    durationSeconds: dbTrk.duration,
                    source: 'transition',
                    sourceReason: 'Слушатели часто включают этот трек следующим',
                  });
                }
              } catch {}
            }
          }
        }
      }
    }

    // 5. Source E: External YouTube Multi-Artist & Multi-Genre Pool
    if (options.includeExternal !== false) {
      // Query external candidates across top 3-4 distinct artists (not just 1)
      const externalSearchArtists = topArtistsList
        .slice(0, 4)
        .map(([name]) => name)
        .filter((name) => !taste.negativeArtists.has(name.toLowerCase()));

      for (const artistName of externalSearchArtists) {
        try {
          const searched = await youtubeMusicProvider.searchTracks(artistName, { limit: 8 });
          for (const st of searched) {
            addCandidate({
              id: st.id,
              trackId: st.id,
              provider: st.provider,
              title: st.title,
              artistName: st.artist,
              artistId: st.artistId,
              releaseTitle: st.album || 'Сингл',
              releaseCover: st.thumbnail,
              durationSeconds: st.durationSeconds,
              explicit: Boolean((st as any).explicit ?? (st as any).isExplicit),
              source: 'loved_artist',
              sourceReason: `Потому что вы слушали «${artistName}»`,
            });
          }
        } catch {}
      }

      // Query external exploration / discovery in top genres
      const discoveryGenres = topGenresList.slice(0, 3).map(([_, g]) => g.name);
      for (const genre of discoveryGenres) {
        try {
          const genreTracks = await youtubeMusicProvider.searchTracks(`${genre} hits 2026`, { limit: 6 });
          for (const gt of genreTracks) {
            // Check if artist is unfamiliar to user (Discovery candidate)
            const artistKey = gt.artist.toLowerCase();
            const isUnfamiliar = !taste.artists[artistKey] && !taste.negativeArtists.has(artistKey);

            addCandidate({
              id: gt.id,
              trackId: gt.id,
              provider: gt.provider,
              title: gt.title,
              artistName: gt.artist,
              artistId: gt.artistId,
              releaseTitle: gt.album || 'Сингл',
              releaseCover: gt.thumbnail,
              durationSeconds: gt.durationSeconds,
              explicit: Boolean((gt as any).explicit ?? (gt as any).isExplicit),
              genres: [genre],
              source: isUnfamiliar ? 'discovery' : 'genre_match',
              sourceReason: isUnfamiliar
                ? `Новый артист в вашем стиле «${genre}»`
                : `Популярно в стиле «${genre}»`,
            });
          }
        } catch {}
      }
    }

    return Array.from(candidateMap.values());
  }

  /**
   * Generates cold-start candidate pool for new or unauthenticated users.
   */
  public async generateColdStartCandidates(): Promise<CandidateTrack[]> {
    const list: CandidateTrack[] = [];

    // 1. Dodik popular community tracks
    try {
      const dodikPopular = await db
        .select({
          id: musicTracks.id,
          title: musicTracks.title,
          duration: musicTracks.duration,
          explicit: musicTracks.explicit,
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

      for (const dp of dodikPopular) {
        list.push({
          id: String(dp.id),
          trackId: String(dp.id),
          provider: 'dodik',
          title: dp.title,
          artistName: dp.artistName || 'Исполнитель',
          artistId: dp.artistId,
          releaseTitle: dp.releaseTitle,
          releaseCover: dp.releaseCover,
          durationSeconds: dp.duration,
          explicit: dp.explicit,
          listenCount: dp.listenCount,
          source: 'cold_start',
          sourceReason: 'Популярно в Dodik Tracker',
        });
      }
    } catch {}

    // 2. Global diverse trending tracks
    try {
      const trendingQueries = ['Top Hits 2026', 'Rock Hits', 'Electronic Dance Hits', 'Hip Hop Hits'];
      for (const q of trendingQueries) {
        const ytHits = await youtubeMusicProvider.searchTracks(q, { limit: 5 });
        for (const yt of ytHits) {
          list.push({
            id: yt.id,
            trackId: yt.id,
            provider: yt.provider,
            title: yt.title,
            artistName: yt.artist,
            artistId: yt.artistId,
            releaseTitle: yt.album || 'Сингл',
            releaseCover: yt.thumbnail,
            durationSeconds: yt.durationSeconds,
            explicit: Boolean((yt as any).explicit ?? (yt as any).isExplicit),
            source: 'cold_start',
            sourceReason: 'Мировой хит',
          });
        }
      }
    } catch {}

    return list;
  }
}

export const candidateService = new CandidateService();
