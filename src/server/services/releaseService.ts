import { db } from '../../db/index.ts';
import {
  media,
  mediaExternalIds,
  userMedia,
  releaseSubscriptions,
  seasons,
  episodes,
  listItems,
  lists,
  systemIntegrations,
} from '../../db/schema.ts';
import { eq, and, or, inArray, gte, lte, ilike, desc, asc, sql } from 'drizzle-orm';
import { decryptCredentials } from '../../lib/crypto.ts';
import { notificationService } from './notificationService.ts';

export interface ReleaseFilterOptions {
  scope?: 'upcoming' | 'past' | 'all';
  categories?: string[];
  dateFrom?: string;
  dateTo?: string;
  followedOnly?: boolean;
  genre?: string;
  platform?: string;
  country?: string;
  search?: string;
  sort?: 'date' | 'popularity' | 'rating' | 'title';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  userId?: number;
  isSuperAdmin?: boolean;
}

export interface ReleaseItem {
  id: number;
  mediaId: number;
  type: string;
  title: string;
  originalTitle?: string | null;
  description?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  releaseDate: string;
  releaseTime?: string | null;
  year?: number | null;
  genres: string[];
  rating?: number | null;
  platforms?: string[];
  totalSeasons?: number | null;
  totalEpisodes?: number | null;
  isFollowed: boolean;
  isSubscribed: boolean;
  userLibraryStatus?: string | null;
  isSoon: boolean;
  isPopular: boolean;
  countdown: string;
  daysUntil: number;
  episodeInfo?: {
    seasonNumber: number;
    episodeNumber: number;
    title?: string | null;
  } | null;
}

// In-memory sync cache with TTL
let lastSyncTimestamp = 0;
const SYNC_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export class ReleaseService {
  /**
   * Returns current local ISO date (YYYY-MM-DD)
   */
  getTodayDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Pluralized Russian countdown string
   */
  formatCountdown(diffDays: number): string {
    if (diffDays === 0) return 'Сегодня';
    if (diffDays === 1) return 'Завтра';
    if (diffDays === -1) return 'Вчера';
    if (diffDays < 0) {
      const abs = Math.abs(diffDays);
      if (abs === 1) return 'Вышел вчера';
      return `Вышел ${abs} дн. назад`;
    }

    const mod10 = diffDays % 10;
    const mod100 = diffDays % 100;
    let daysWord = 'дней';
    if (mod10 === 1 && mod100 !== 11) {
      daysWord = 'день';
    } else if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
      daysWord = 'дня';
    }

    return `Через ${diffDays} ${daysWord}`;
  }

  /**
   * Sync upcoming releases from active external providers (TMDB, RAWG, AniList)
   */
  async syncProvidersIfNeeded(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - lastSyncTimestamp < SYNC_CACHE_TTL) {
      return;
    }
    lastSyncTimestamp = now;

    try {
      const today = this.getTodayDateString();
      const nextYearDate = new Date();
      nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);
      const nextYear = nextYearDate.toISOString().slice(0, 10);

      // Fetch active integration credentials
      const integrations = await db.select().from(systemIntegrations).where(eq(systemIntegrations.enabled, true));
      const credsMap: Record<string, any> = {};
      for (const integ of integrations) {
        if (integ.encryptedCredentials && integ.encryptedCredentials.trim()) {
          try {
            credsMap[integ.provider.toUpperCase()] = decryptCredentials(integ.encryptedCredentials);
          } catch {
            // ignore decryption failure
          }
        }
      }

      const syncTasks: Promise<any>[] = [];

      // 1. TMDB Upcoming Movies
      if (credsMap['TMDB']?.apiKey) {
        const apiKey = credsMap['TMDB'].apiKey;
        syncTasks.push(
          (async () => {
            try {
              const url = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=ru-RU&primary_release_date.gte=${today}&primary_release_date.lte=${nextYear}&sort_by=popularity.desc&page=1`;
              const res = await fetch(url);
              if (res.ok) {
                const data = await res.json();
                for (const item of (data.results || []).slice(0, 25)) {
                  if (!item.release_date || !item.title) continue;
                  await this.upsertExternalRelease({
                    provider: 'TMDB',
                    externalId: String(item.id),
                    type: 'MOVIE',
                    title: item.title,
                    originalTitle: item.original_title,
                    description: item.overview,
                    posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
                    backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : undefined,
                    releaseDate: item.release_date,
                    year: item.release_date ? parseInt(item.release_date.slice(0, 4), 10) : undefined,
                    rating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined,
                  });
                }
              }
            } catch (e) {
              console.warn('[ReleaseSync] TMDB movie sync error:', e);
            }
          })()
        );

        // TMDB Upcoming TV Shows
        syncTasks.push(
          (async () => {
            try {
              const url = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&language=ru-RU&first_air_date.gte=${today}&first_air_date.lte=${nextYear}&sort_by=popularity.desc&page=1`;
              const res = await fetch(url);
              if (res.ok) {
                const data = await res.json();
                for (const item of (data.results || []).slice(0, 25)) {
                  if (!item.first_air_date || !item.name) continue;
                  await this.upsertExternalRelease({
                    provider: 'TMDB',
                    externalId: String(item.id),
                    type: 'TV',
                    title: item.name,
                    originalTitle: item.original_name,
                    description: item.overview,
                    posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
                    backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : undefined,
                    releaseDate: item.first_air_date,
                    year: item.first_air_date ? parseInt(item.first_air_date.slice(0, 4), 10) : undefined,
                    rating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : undefined,
                  });
                }
              }
            } catch (e) {
              console.warn('[ReleaseSync] TMDB TV sync error:', e);
            }
          })()
        );
      }

      // 2. RAWG Upcoming Games
      if (credsMap['RAWG']?.apiKey) {
        const apiKey = credsMap['RAWG'].apiKey;
        syncTasks.push(
          (async () => {
            try {
              const url = `https://api.rawg.io/api/games?key=${apiKey}&dates=${today},${nextYear}&ordering=-added&page_size=30`;
              const res = await fetch(url);
              if (res.ok) {
                const data = await res.json();
                for (const game of (data.results || []).slice(0, 30)) {
                  if (!game.released || !game.name) continue;
                  const platforms = (game.platforms || []).map((p: any) => p.platform?.name).filter(Boolean);
                  const genres = (game.genres || []).map((g: any) => g.name).filter(Boolean);
                  await this.upsertExternalRelease({
                    provider: 'RAWG',
                    externalId: String(game.id),
                    type: 'GAME',
                    title: game.name,
                    originalTitle: game.name,
                    description: game.description_raw || undefined,
                    posterUrl: game.background_image || undefined,
                    backdropUrl: game.background_image || undefined,
                    releaseDate: game.released,
                    year: game.released ? parseInt(game.released.slice(0, 4), 10) : undefined,
                    rating: game.rating ? Math.round(game.rating * 2 * 10) / 10 : undefined,
                    genres: [...genres, ...platforms],
                  });
                }
              }
            } catch (e) {
              console.warn('[ReleaseSync] RAWG sync error:', e);
            }
          })()
        );
      }

      // 3. AniList Upcoming Anime (Public API, no key required)
      syncTasks.push(
        (async () => {
          try {
            const todayInt = parseInt(today.replace(/-/g, ''), 10);
            const query = `
              query ($today: Int) {
                Page(page: 1, perPage: 25) {
                  media(type: ANIME, status_in: [NOT_YET_RELEASED, RELEASING], startDate_greater: $today, sort: [START_DATE, POPULARITY_DESC]) {
                    id
                    title { romaji english native }
                    coverImage { large extraLarge }
                    bannerImage
                    startDate { year month day }
                    genres
                    averageScore
                    description
                  }
                }
              }
            `;
            const res = await fetch('https://graphql.anilist.co', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, variables: { today: todayInt } }),
            });
            if (res.ok) {
              const data = await res.json();
              const items = data.data?.Page?.media || [];
              for (const item of items) {
                const s = item.startDate;
                if (!s?.year || !s?.month || !s?.day) continue;
                const mStr = String(s.month).padStart(2, '0');
                const dStr = String(s.day).padStart(2, '0');
                const releaseDate = `${s.year}-${mStr}-${dStr}`;
                const title = item.title?.english || item.title?.romaji || 'Без названия';
                const origTitle = item.title?.native || item.title?.romaji;
                await this.upsertExternalRelease({
                  provider: 'ANILIST',
                  externalId: String(item.id),
                  type: 'ANIME',
                  title,
                  originalTitle: origTitle,
                  description: item.description ? item.description.replace(/<[^>]*>?/gm, '') : undefined,
                  posterUrl: item.coverImage?.extraLarge || item.coverImage?.large,
                  backdropUrl: item.bannerImage,
                  releaseDate,
                  year: s.year,
                  genres: item.genres || [],
                  rating: item.averageScore ? Math.round((item.averageScore / 10) * 10) / 10 : undefined,
                });
              }
            }
          } catch (e) {
            console.warn('[ReleaseSync] AniList sync error:', e);
          }
        })()
      );

      await Promise.allSettled(syncTasks);
    } catch (err) {
      console.error('[ReleaseSync] Failed to sync external releases:', err);
    }
  }

  /**
   * Helper to upsert external release into media and mediaExternalIds
   */
  private async upsertExternalRelease(payload: {
    provider: string;
    externalId: string;
    type: string;
    title: string;
    originalTitle?: string;
    description?: string;
    posterUrl?: string;
    backdropUrl?: string;
    releaseDate: string;
    year?: number;
    rating?: number;
    genres?: string[];
  }): Promise<void> {
    try {
      const existingExt = await db
        .select({ mediaId: mediaExternalIds.mediaId })
        .from(mediaExternalIds)
        .where(
          and(
            eq(mediaExternalIds.provider, payload.provider),
            eq(mediaExternalIds.externalId, payload.externalId)
          )
        )
        .limit(1);

      if (existingExt.length > 0) {
        // Update release date and poster if missing
        await db
          .update(media)
          .set({
            releaseDate: payload.releaseDate,
            ...(payload.posterUrl ? { posterUrl: payload.posterUrl } : {}),
            ...(payload.rating ? { rating: payload.rating } : {}),
            ...(payload.year ? { year: payload.year } : {}),
          })
          .where(eq(media.id, existingExt[0].mediaId));
        return;
      }

      // Insert new media record
      const [newMedia] = await db
        .insert(media)
        .values({
          type: payload.type,
          title: payload.title,
          originalTitle: payload.originalTitle,
          description: payload.description,
          posterUrl: payload.posterUrl,
          backdropUrl: payload.backdropUrl,
          releaseDate: payload.releaseDate,
          year: payload.year,
          genres: payload.genres ? JSON.stringify(payload.genres) : null,
          rating: payload.rating,
        })
        .returning();

      await db
        .insert(mediaExternalIds)
        .values({
          mediaId: newMedia.id,
          provider: payload.provider,
          externalId: payload.externalId,
        })
        .catch(() => {});
    } catch (err) {
      // Ignore duplicate insert collisions
    }
  }

  /**
   * Get all releases with rich filtering, sorting, pagination, and user state
   */
  async getReleases(options: ReleaseFilterOptions): Promise<{
    items: ReleaseItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
    currentDate: string;
    availableGenres: string[];
    availablePlatforms: string[];
  }> {
    // 1. Sync external providers if needed
    await this.syncProvidersIfNeeded();

    const todayStr = this.getTodayDateString();
    const scope = options.scope || 'upcoming';
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 30));
    const offset = (page - 1) * limit;

    // 2. Determine user's tracked IDs if logged in
    let userSubscribedMediaIds = new Set<number>();
    let userLibraryMap = new Map<number, string>();
    let userTrackedAllIds = new Set<number>();

    if (options.userId) {
      // Release subscriptions
      const subs = await db
        .select({ mediaId: releaseSubscriptions.mediaId })
        .from(releaseSubscriptions)
        .where(eq(releaseSubscriptions.userId, options.userId));
      subs.forEach((s) => {
        userSubscribedMediaIds.add(s.mediaId);
        userTrackedAllIds.add(s.mediaId);
      });

      // User Media library
      const uMedia = await db
        .select({ mediaId: userMedia.mediaId, status: userMedia.status })
        .from(userMedia)
        .where(eq(userMedia.userId, options.userId));
      uMedia.forEach((um) => {
        userLibraryMap.set(um.mediaId, um.status);
        userTrackedAllIds.add(um.mediaId);
      });

      // User's custom lists
      const uLists = await db
        .select({ mediaId: listItems.mediaId })
        .from(listItems)
        .innerJoin(lists, eq(listItems.listId, lists.id))
        .where(eq(lists.ownerId, options.userId));
      uLists.forEach((ul) => {
        userTrackedAllIds.add(ul.mediaId);
      });
    }

    // 3. Build SQL conditions for media table
    const conditions: any[] = [
      sql`(${media.releaseDate} IS NOT NULL AND ${media.releaseDate} != '')`
    ];

    if (!options.isSuperAdmin) {
      conditions.push(eq(media.isHidden, false));
    }

    // Scope filter (Upcoming vs Past vs All)
    if (scope === 'upcoming') {
      conditions.push(gte(media.releaseDate, todayStr));
    } else if (scope === 'past') {
      conditions.push(sql`${media.releaseDate} < ${todayStr}`);
    }

    // Date range filter
    if (options.dateFrom) {
      conditions.push(gte(media.releaseDate, options.dateFrom));
    }
    if (options.dateTo) {
      conditions.push(lte(media.releaseDate, options.dateTo));
    }

    // Category filter
    if (options.categories && options.categories.length > 0 && !options.categories.includes('all') && !options.categories.includes('ALL')) {
      const upperCats = options.categories.map((c) => c.toUpperCase());
      conditions.push(inArray(media.type, upperCats));
    }

    // Search filter
    if (options.search && options.search.trim()) {
      const q = `%${options.search.trim()}%`;
      conditions.push(or(ilike(media.title, q), ilike(media.originalTitle, q)));
    }

    // Followed only filter
    if (options.followedOnly) {
      if (userTrackedAllIds.size === 0) {
        return {
          items: [],
          total: 0,
          page,
          limit,
          hasMore: false,
          currentDate: todayStr,
          availableGenres: [],
          availablePlatforms: [],
        };
      }
      conditions.push(inArray(media.id, Array.from(userTrackedAllIds)));
    }

    // Platform filter for games
    if (options.platform && options.platform.trim()) {
      conditions.push(ilike(media.genres, `%${options.platform.trim()}%`));
    }

    // Genre filter
    if (options.genre && options.genre.trim()) {
      conditions.push(ilike(media.genres, `%${options.genre.trim()}%`));
    }

    const whereClause = and(...conditions);

    // 4. Query total count
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(media)
      .where(whereClause);
    const total = Number(totalRow?.count || 0);

    // 5. Query items with ordering
    let orderByClause: any[] = [];
    const sort = options.sort || 'date';
    const order = options.order || (scope === 'past' ? 'desc' : 'asc');

    if (sort === 'popularity' || sort === 'rating') {
      orderByClause = [
        order === 'asc' ? asc(media.rating) : desc(media.rating),
        order === 'asc' ? asc(media.releaseDate) : desc(media.releaseDate),
      ];
    } else if (sort === 'title') {
      orderByClause = [order === 'asc' ? asc(media.title) : desc(media.title)];
    } else {
      // Default: date
      orderByClause = [order === 'asc' ? asc(media.releaseDate) : desc(media.releaseDate)];
    }

    const rows = await db
      .select()
      .from(media)
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(limit)
      .offset(offset);

    // 6. Map into rich ReleaseItem objects
    const todayD = new Date(todayStr + 'T00:00:00Z');
    const allGenresSet = new Set<string>();
    const allPlatformsSet = new Set<string>();

    const knownGamePlatforms = ['PC', 'PlayStation 5', 'PS5', 'PlayStation 4', 'PS4', 'Xbox Series X/S', 'Xbox Series', 'Xbox One', 'Nintendo Switch', 'Switch', 'Android', 'iOS'];

    const items: ReleaseItem[] = rows.map((row) => {
      let parsedGenres: string[] = [];
      if (row.genres) {
        try {
          if (row.genres.startsWith('[')) {
            parsedGenres = JSON.parse(row.genres);
          } else {
            parsedGenres = row.genres.split(',').map((g) => g.trim());
          }
        } catch {
          parsedGenres = [row.genres];
        }
      }

      // Collect distinct genres and platforms
      const itemPlatforms: string[] = [];
      const itemGenres: string[] = [];

      parsedGenres.forEach((g) => {
        if (knownGamePlatforms.some((kp) => kp.toLowerCase() === g.toLowerCase())) {
          itemPlatforms.push(g);
          allPlatformsSet.add(g);
        } else {
          itemGenres.push(g);
          allGenresSet.add(g);
        }
      });

      // Calculate days difference
      const releaseD = new Date(row.releaseDate! + 'T00:00:00Z');
      const diffMs = releaseD.getTime() - todayD.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      const isSubscribed = userSubscribedMediaIds.has(row.id);
      const userLibStatus = userLibraryMap.get(row.id) || null;
      const isFollowed = isSubscribed || !!userLibStatus;
      const isSoon = diffDays === 0 || diffDays === 1;
      const isPopular = (row.rating != null && row.rating >= 7.8);

      return {
        id: row.id,
        mediaId: row.id,
        type: row.type,
        title: row.title,
        originalTitle: row.originalTitle,
        description: row.description,
        posterUrl: row.posterUrl,
        backdropUrl: row.backdropUrl,
        releaseDate: row.releaseDate!,
        year: row.year,
        genres: itemGenres,
        rating: row.rating,
        platforms: itemPlatforms.length > 0 ? itemPlatforms : undefined,
        totalSeasons: row.totalSeasons,
        totalEpisodes: row.totalEpisodes,
        isFollowed,
        isSubscribed,
        userLibraryStatus: userLibStatus,
        isSoon,
        isPopular,
        countdown: this.formatCountdown(diffDays),
        daysUntil: diffDays,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      hasMore: offset + items.length < total,
      currentDate: todayStr,
      availableGenres: Array.from(allGenresSet).slice(0, 30),
      availablePlatforms: Array.from(allPlatformsSet),
    };
  }

  /**
   * Follow a release
   */
  async followRelease(userId: number, mediaId: number): Promise<{ followed: boolean }> {
    const existing = await db
      .select({ id: releaseSubscriptions.id })
      .from(releaseSubscriptions)
      .where(
        and(
          eq(releaseSubscriptions.userId, userId),
          eq(releaseSubscriptions.mediaId, mediaId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(releaseSubscriptions).values({
        userId,
        mediaId,
        notified: false,
      });
    }

    return { followed: true };
  }

  /**
   * Unfollow a release
   */
  async unfollowRelease(userId: number, mediaId: number): Promise<{ followed: boolean }> {
    await db
      .delete(releaseSubscriptions)
      .where(
        and(
          eq(releaseSubscriptions.userId, userId),
          eq(releaseSubscriptions.mediaId, mediaId)
        )
      )
      .catch(() => {});

    return { followed: false };
  }

  /**
   * Get user's followed release IDs
   */
  async getUserSubscriptions(userId: number): Promise<number[]> {
    const rows = await db
      .select({ mediaId: releaseSubscriptions.mediaId })
      .from(releaseSubscriptions)
      .where(eq(releaseSubscriptions.userId, userId));
    return rows.map((r) => r.mediaId);
  }

  /**
   * Check and notify users about releases happening today
   */
  async checkAndNotifyUpcomingReleases(): Promise<number> {
    const todayStr = this.getTodayDateString();
    let notifiedCount = 0;

    try {
      const pending = await db
        .select({
          subId: releaseSubscriptions.id,
          userId: releaseSubscriptions.userId,
          mediaId: releaseSubscriptions.mediaId,
          mediaTitle: media.title,
          releaseDate: media.releaseDate,
        })
        .from(releaseSubscriptions)
        .innerJoin(media, eq(releaseSubscriptions.mediaId, media.id))
        .where(
          and(
            eq(releaseSubscriptions.notified, false),
            lte(media.releaseDate, todayStr)
          )
        );

      for (const item of pending) {
        try {
          await notificationService.notifyNewRelease(
            item.userId,
            item.mediaTitle,
            `Долгожданный релиз «${item.mediaTitle}» официально выходит сегодня!`,
            `/media/${item.mediaId}`
          );

          await db
            .update(releaseSubscriptions)
            .set({ notified: true })
            .where(eq(releaseSubscriptions.id, item.subId));

          notifiedCount++;
        } catch (err) {
          console.error('[ReleaseNotification] Failed to notify user:', err);
        }
      }
    } catch (err) {
      console.error('[ReleaseNotification] Error checking notifications:', err);
    }

    return notifiedCount;
  }
}

export const releaseService = new ReleaseService();
