import { Router, Response } from 'express';
import crypto from 'crypto';
import { requireAuth, optionalAuth, AuthRequest, isStaffRole, requireStaff, requireAdminOnly, isAdminRole } from '../../middleware/auth.ts';
import { db } from '../../db/index.ts';
import {
  artistProfiles,
  musicGenres,
  musicReleases,
  musicReleaseGenres,
  musicTracks,
  musicReviews,
  musicianApplications,
  musicPlaybackSessions,
  musicListens,
  ptsTransactions,
  musicFavoriteReleases,
  musicFavoriteTracks,
  musicPlaylists,
  musicPlaylistTracks,
  musicPlaylistMembers,
  users,
  activities,
  artistSubscriptions,
  userMusicHistory,
} from '../../db/schema.ts';
import { eq, and, or, desc, asc, sql, ilike, inArray, gt, gte } from 'drizzle-orm';
import { notificationService } from '../services/notificationService.ts';
import { logAdminAction } from './admin/auditHelper.ts';
import { youtubeMusicService, youtubeSearchLimiter } from '../services/youtubeMusicService.ts';
import { youtubeMusicProvider } from '../services/externalMusic/youtubeMusicProvider.ts';
import { externalMusicConfig } from '../services/externalMusic/externalMusicConfig.ts';
import { lyricsService } from '../services/externalMusic/lyricsService.ts';
import { geniusProvider } from '../services/externalMusic/lyrics/geniusProvider.ts';
import { musicRecommendationService } from '../services/musicRecommendationService.ts';
import { parseRawInput, matchParsedTracks } from '../services/playlistImportService.ts';

export const musicRouter = Router();

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Rate limiting map for music listen events (30 requests per minute per IP/user)
const listenRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkListenRateLimit(identifier: string, limit = 30, windowMs = 60000): boolean {
  const now = Date.now();
  const record = listenRateLimitMap.get(identifier);
  if (!record || now > record.resetAt) {
    listenRateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (record.count >= limit) {
    return false;
  }
  record.count++;
  return true;
}

// Periodic cleanup of rate limit map (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of listenRateLimitMap.entries()) {
    if (now > value.resetAt) {
      listenRateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

function getClientSessionIdentifier(req: any): string {
  const cookieSession = req.cookies?.['dodik_anon_session'];
  if (cookieSession) return String(cookieSession);
  const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  return crypto.createHash('sha256').update(`${rawIp}-${ua}`).digest('hex').substring(0, 32);
}

/**
 * Calculates milestone rewards for qualifying music listens (1 PTS per 10 eligible listens)
 * Idempotent via PostgreSQL unique constraint on reference_id in pts_transactions.
 */
async function checkAndAwardMusicListenPts(artistId: number, authorUserId: number): Promise<{ awarded: number; totalListens: number }> {
  try {
    const [listensRes] = await db
      .select({
        total: sql<number>`count(*)`,
      })
      .from(musicListens)
      .innerJoin(musicReleases, eq(musicListens.releaseId, musicReleases.id))
      .where(
        and(
          eq(musicReleases.artistId, artistId),
          eq(musicReleases.status, 'PUBLISHED'),
          eq(musicListens.isEligible, true)
        )
      );

    const totalEligibleListens = Number(listensRes?.total || 0);
    const totalMilestones = Math.floor(totalEligibleListens / 10);

    if (totalMilestones <= 0) {
      return { awarded: 0, totalListens: totalEligibleListens };
    }

    let newlyAwarded = 0;
    for (let m = 1; m <= totalMilestones; m++) {
      const referenceId = `artist_${artistId}_listen_milestone_${m}`;
      const desc = `Награда за ${m * 10} прослушиваний музыки (+1 PTS)`;

      const res = await db
        .insert(ptsTransactions)
        .values({
          userId: authorUserId,
          amount: 1,
          type: 'MUSIC_LISTEN_REWARD',
          source: 'music_listen',
          referenceId,
          description: desc,
          createdAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: ptsTransactions.id });

      if (res.length > 0) {
        newlyAwarded += 1;
      }
    }

    return { awarded: newlyAwarded, totalListens: totalEligibleListens };
  } catch (err) {
    console.error('Error awarding music listen PTS milestone:', err);
    return { awarded: 0, totalListens: 0 };
  }
}

async function notifyAdminsNewPendingRelease(releaseId: number, releaseTitle: string, artistStageName: string, actorUserId: number) {
  try {
    const staffUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ['SUPER_ADMIN', 'ADMIN', 'MODERATOR']), eq(users.isBlocked, false)));

    for (const staff of staffUsers) {
      await notificationService.create({
        recipientUserId: staff.id,
        type: 'SYSTEM',
        title: '🎵 Новый релиз на модерации',
        body: `Музыкант «${artistStageName}» отправил релиз «${releaseTitle}» на проверку.`,
        link: '/admin?tab=music_moderation',
        entityType: 'MUSIC_RELEASE',
        entityId: String(releaseId),
        actorUserId,
        dedupKey: `MUSIC_PENDING_REVIEW:${releaseId}`,
        dedupWindowSeconds: 300,
      });
    }

    await logAdminAction({
      userId: actorUserId,
      action: 'MUSIC_RELEASE_SUBMITTED',
      details: `Релиз «${releaseTitle}» (ID: ${releaseId}) отправлен на модерацию (Исполнитель: ${artistStageName})`,
    });
  } catch (err) {
    console.error('Error notifying admins of new pending release:', err);
  }
}

function slugify(text: string): string {
  const cyrillicMap: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
  };

  const str = text.toLowerCase().trim();
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (cyrillicMap[char] !== undefined) {
      result += cyrillicMap[char];
    } else {
      result += char;
    }
  }

  return result
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `music-${Date.now()}`;
}

/**
 * Checks if user has musician role or is admin (SUPER_ADMIN / ADMIN)
 */
function isMusicianOrAdmin(user: any): boolean {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  return role === 'musician' || isAdminRole(user.role);
}

/**
 * Helper to resolve artist profile for current user or numeric ID
 */
async function getArtistProfileByUserId(userId: number) {
  const found = await db
    .select()
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, userId))
    .limit(1);
  return found.length > 0 ? found[0] : null;
}

/**
 * Helper to get or auto-create artist profile for logged-in user if they are musician or staff/admin
 */
async function getOrCreateArtistProfileByUserId(user: any) {
  if (!user || !user.id) return null;
  const found = await getArtistProfileByUserId(user.id);
  if (found) return found;

  if (isMusicianOrAdmin(user) || isStaffRole(user.role)) {
    let baseSlug = slugify(user.username || `artist-${user.id}`);
    const slugCheck = await db
      .select({ id: artistProfiles.id })
      .from(artistProfiles)
      .where(eq(artistProfiles.slug, baseSlug))
      .limit(1);

    if (slugCheck.length > 0) {
      baseSlug = `${baseSlug}-${Math.floor(Math.random() * 899 + 100)}`;
    }

    const [created] = await db
      .insert(artistProfiles)
      .values({
        userId: user.id,
        stageName: user.username || `Исполнитель ${user.id}`,
        slug: baseSlug,
        avatar: user.avatar || null,
        status: 'ACTIVE',
      })
      .returning();
    return created;
  }

  return null;
}

/**
 * Validates 100-point score criteria
 */
function validateScore(val: any, name: string): number {
  const num = Number(val);
  if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 100) {
    throw new Error(`Оценка "${name}" должна быть целым числом от 0 до 100`);
  }
  return num;
}

// ==========================================
// 1. ARTIST PROFILES (/api/music/artists)
// ==========================================

/**
 * GET /api/music/artists/me
 * Get logged-in user's artist profile
 */
musicRouter.get('/artists/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await getOrCreateArtistProfileByUserId(req.dbUser!);
    if (!profile) {
      return res.status(404).json({ profile: null, message: 'Профиль музыканта не найден' });
    }
    res.json({ profile });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/music/artists
 * Create or register artist profile for current user
 */
musicRouter.post('/artists', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;

    if (!isMusicianOrAdmin(user)) {
      return res.status(403).json({
        error: 'Создание профиля исполнителя доступно пользователям с ролью musician или администрации'
      });
    }

    const existing = await getArtistProfileByUserId(user.id);
    if (existing) {
      return res.status(409).json({
        error: 'У вас уже создан профиль исполнителя',
        profile: existing
      });
    }

    const { stageName, slug: inputSlug, avatar, description } = req.body;

    if (!stageName || !String(stageName).trim()) {
      return res.status(400).json({ error: 'Сценическое имя (stageName) обязательно' });
    }

    const cleanStageName = String(stageName).trim();
    let finalSlug = inputSlug && String(inputSlug).trim()
      ? slugify(String(inputSlug))
      : slugify(cleanStageName);

    // Check slug uniqueness
    const slugExists = await db
      .select({ id: artistProfiles.id })
      .from(artistProfiles)
      .where(eq(artistProfiles.slug, finalSlug))
      .limit(1);

    if (slugExists.length > 0) {
      finalSlug = `${finalSlug}-${Math.floor(Math.random() * 899 + 100)}`;
    }

    const [createdProfile] = await db
      .insert(artistProfiles)
      .values({
        userId: user.id,
        stageName: cleanStageName,
        slug: finalSlug,
        avatar: avatar ? String(avatar).trim() : (user.avatar || null),
        description: description ? String(description).trim() : null,
        status: 'ACTIVE',
      })
      .returning();

    res.status(201).json({ success: true, profile: createdProfile });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/artists
 * List artists with pagination & search
 */
musicRouter.get('/artists', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;
    const search = req.query.search ? String(req.query.search).trim() : '';

    const conditions = [eq(artistProfiles.status, 'ACTIVE')];
    if (search) {
      conditions.push(ilike(artistProfiles.stageName, `%${search}%`));
    }

    const whereClause = and(...conditions);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(artistProfiles)
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    const list = await db
      .select({
        id: artistProfiles.id,
        userId: artistProfiles.userId,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        avatar: artistProfiles.avatar,
        description: artistProfiles.description,
        status: artistProfiles.status,
        createdAt: artistProfiles.createdAt,
        updatedAt: artistProfiles.updatedAt,
        username: users.username,
        userAvatar: users.avatar,
      })
      .from(artistProfiles)
      .leftJoin(users, eq(artistProfiles.userId, users.id))
      .where(whereClause)
      .orderBy(desc(artistProfiles.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      artists: list,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/artists/:idOrSlug
 * Get artist profile details with published releases, tracks, reviews, and stats
 */
musicRouter.get('/artists/:idOrSlug', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rawParam = req.params.idOrSlug;
    const decodedParam = decodeURIComponent(rawParam).trim();
    const numId = Number(decodedParam);
    const isNum = !isNaN(numId) && numId > 0;

    let found = await db
      .select({
        id: artistProfiles.id,
        userId: artistProfiles.userId,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        avatar: artistProfiles.avatar,
        description: artistProfiles.description,
        status: artistProfiles.status,
        createdAt: artistProfiles.createdAt,
        updatedAt: artistProfiles.updatedAt,
        username: users.username,
        userAvatar: users.avatar,
        userRole: users.role,
      })
      .from(artistProfiles)
      .leftJoin(users, eq(artistProfiles.userId, users.id))
      .where(isNum ? eq(artistProfiles.id, numId) : or(eq(artistProfiles.slug, decodedParam), eq(artistProfiles.slug, rawParam)))
      .limit(1);

    if (found.length === 0 && !isNum) {
      const cleanSlug = slugify(decodedParam);
      found = await db
        .select({
          id: artistProfiles.id,
          userId: artistProfiles.userId,
          stageName: artistProfiles.stageName,
          slug: artistProfiles.slug,
          avatar: artistProfiles.avatar,
          description: artistProfiles.description,
          status: artistProfiles.status,
          createdAt: artistProfiles.createdAt,
          updatedAt: artistProfiles.updatedAt,
          username: users.username,
          userAvatar: users.avatar,
          userRole: users.role,
        })
        .from(artistProfiles)
        .leftJoin(users, eq(artistProfiles.userId, users.id))
        .where(
          or(
            ilike(artistProfiles.slug, cleanSlug),
            ilike(artistProfiles.stageName, decodedParam),
            ilike(artistProfiles.stageName, `%${decodedParam}%`)
          )
        )
        .limit(1);
    }

    if (found.length === 0) {
      return res.status(404).json({ error: 'Исполнитель не найден' });
    }

    const artist = found[0];

    // Fetch published releases
    const releasesList = await db
      .select({
        id: musicReleases.id,
        artistId: musicReleases.artistId,
        title: musicReleases.title,
        slug: musicReleases.slug,
        type: musicReleases.type,
        description: musicReleases.description,
        cover: musicReleases.cover,
        releaseDate: musicReleases.releaseDate,
        status: musicReleases.status,
        listenCount: musicReleases.listenCount,
        createdAt: musicReleases.createdAt,
        updatedAt: musicReleases.updatedAt,
        avgScore: sql<number>`COALESCE((SELECT ROUND(AVG(overall_score)::numeric, 1) FROM music_reviews WHERE release_id = music_releases.id), 0)`,
        reviewsCount: sql<number>`(SELECT count(*) FROM music_reviews WHERE release_id = music_releases.id)`,
        tracksCount: sql<number>`(SELECT count(*) FROM music_tracks WHERE release_id = music_releases.id)`,
      })
      .from(musicReleases)
      .where(
        and(
          eq(musicReleases.artistId, artist.id),
          eq(musicReleases.status, 'PUBLISHED')
        )
      )
      .orderBy(desc(musicReleases.createdAt));

    const releaseIds = releasesList.map((r) => r.id);

    // Fetch tracks for published releases
    let tracksList: any[] = [];
    if (releaseIds.length > 0) {
      tracksList = await db
        .select({
          id: musicTracks.id,
          releaseId: musicTracks.releaseId,
          releaseTitle: musicReleases.title,
          releaseCover: musicReleases.cover,
          releaseSlug: musicReleases.slug,
          title: musicTracks.title,
          slug: musicTracks.slug,
          trackNumber: musicTracks.trackNumber,
          audioFile: musicTracks.audioFile,
          duration: musicTracks.duration,
          explicit: musicTracks.explicit,
          lyrics: musicTracks.lyrics,
          authorNote: musicTracks.authorNote,
          listenCount: musicTracks.listenCount,
          createdAt: musicTracks.createdAt,
        })
        .from(musicTracks)
        .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
        .where(
          and(
            inArray(musicTracks.releaseId, releaseIds),
            eq(musicTracks.status, 'PUBLISHED')
          )
        )
        .orderBy(desc(musicReleases.createdAt), asc(musicTracks.trackNumber));
    }

    // Fetch reviews for artist's releases
    let reviewsList: any[] = [];
    if (releaseIds.length > 0) {
      reviewsList = await db
        .select({
          id: musicReviews.id,
          releaseId: musicReviews.releaseId,
          releaseTitle: musicReleases.title,
          releaseCover: musicReleases.cover,
          overallScore: musicReviews.overallScore,
          musicScore: musicReviews.musicScore,
          performanceScore: musicReviews.performanceScore,
          productionScore: musicReviews.productionScore,
          lyricsScore: musicReviews.lyricsScore,
          atmosphereScore: musicReviews.atmosphereScore,
          cohesionScore: musicReviews.cohesionScore,
          text: musicReviews.text,
          createdAt: musicReviews.createdAt,
          username: users.username,
          userAvatar: users.avatar,
        })
        .from(musicReviews)
        .innerJoin(musicReleases, eq(musicReviews.releaseId, musicReleases.id))
        .leftJoin(users, eq(musicReviews.userId, users.id))
        .where(inArray(musicReviews.releaseId, releaseIds))
        .orderBy(desc(musicReviews.createdAt))
        .limit(20);
    }

    // Compute aggregate statistics
    let totalReviews = 0;
    let avgOverallScore = 0;
    if (releaseIds.length > 0) {
      const [reviewStats] = await db
        .select({
          totalReviews: sql<number>`count(*)`,
          avgScore: sql<number>`COALESCE(ROUND(AVG(overall_score)::numeric, 1), 0)`,
        })
        .from(musicReviews)
        .where(inArray(musicReviews.releaseId, releaseIds));

      totalReviews = Number(reviewStats?.totalReviews || 0);
      avgOverallScore = Number(reviewStats?.avgScore || 0);
    }

    const totalListens = releasesList.reduce((acc, r) => acc + (r.listenCount || 0), 0);

    let isSubscribed = false;
    if (req.dbUser) {
      const sub = await db
        .select({ id: artistSubscriptions.id })
        .from(artistSubscriptions)
        .where(
          and(
            eq(artistSubscriptions.userId, req.dbUser.id),
            eq(artistSubscriptions.artistId, artist.id)
          )
        )
        .limit(1);
      isSubscribed = sub.length > 0;
    }

    res.json({
      artist: {
        ...artist,
        isSubscribed,
      },
      releases: releasesList,
      tracks: tracksList,
      reviews: reviewsList,
      stats: {
        totalReleases: releasesList.length,
        totalTracks: tracksList.length,
        totalReviews,
        avgOverallScore,
        totalListens,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/music/artists/:id
 * Update artist profile
 */
musicRouter.put('/artists/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const artistId = parseInt(req.params.id, 10);

    const existing = await db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.id, artistId))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Профиль исполнителя не найден' });
    }

    const artist = existing[0];
    if (artist.userId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'Нет прав на редактирование этого профиля' });
    }

    const { stageName, avatar, description, status } = req.body;
    const updateData: Partial<typeof artistProfiles.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (stageName && String(stageName).trim()) {
      updateData.stageName = String(stageName).trim();
    }
    if (avatar !== undefined) updateData.avatar = avatar ? String(avatar).trim() : null;
    if (description !== undefined) updateData.description = description ? String(description).trim() : null;

    if (status && isStaffRole(user.role)) {
      if (['ACTIVE', 'PENDING', 'SUSPENDED'].includes(status)) {
        updateData.status = status;
      }
    }

    const [updated] = await db
      .update(artistProfiles)
      .set(updateData)
      .where(eq(artistProfiles.id, artistId))
      .returning();

    res.json({ success: true, profile: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. MUSIC GENRES (/api/music/genres)
// ==========================================

/**
 * GET /api/music/genres
 * List all music genres
 */
musicRouter.get('/genres', async (_req, res) => {
  try {
    const genres = await db.select().from(musicGenres).orderBy(asc(musicGenres.name));
    res.json({ genres });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/music/genres
 * Create new genre (Staff required)
 */
musicRouter.post('/genres', requireAuth, requireStaff('MANAGE_CONTENT'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug: inputSlug } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Название жанра обязательно' });
    }

    const cleanName = String(name).trim();
    const finalSlug = inputSlug && String(inputSlug).trim() ? slugify(String(inputSlug)) : slugify(cleanName);

    const [genre] = await db
      .insert(musicGenres)
      .values({ name: cleanName, slug: finalSlug })
      .returning();

    res.status(201).json({ success: true, genre });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. MUSIC RELEASES (/api/music/releases)
// ==========================================

/**
 * POST /api/music/releases
 * Create a new release (Single / EP / Album)
 */
musicRouter.post('/releases', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const artist = await getOrCreateArtistProfileByUserId(user);

    const { title, slug: inputSlug, type, description, cover, releaseDate, status, genreIds, tracks, artistId: bodyArtistId } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Название релиза обязательно' });
    }

    const cleanType = String(type || 'SINGLE').toUpperCase();
    if (!['SINGLE', 'EP', 'ALBUM'].includes(cleanType)) {
      return res.status(400).json({ error: 'Тип релиза должен быть SINGLE, EP или ALBUM' });
    }

    const cleanTitle = String(title).trim();
    let finalSlug = inputSlug && String(inputSlug).trim()
      ? slugify(String(inputSlug))
      : slugify(cleanTitle);

    const slugCheck = await db
      .select({ id: musicReleases.id })
      .from(musicReleases)
      .where(eq(musicReleases.slug, finalSlug))
      .limit(1);

    if (slugCheck.length > 0) {
      finalSlug = `${finalSlug}-${Math.floor(Math.random() * 899 + 100)}`;
    }

    // Determine target artistId
    let targetArtistId = artist?.id;

    if (bodyArtistId) {
      const parsedArtistId = Number(bodyArtistId);
      if (!isNaN(parsedArtistId) && parsedArtistId > 0) {
        if (isStaffRole(user.role)) {
          targetArtistId = parsedArtistId;
        } else if (artist && artist.id === parsedArtistId) {
          targetArtistId = parsedArtistId;
        } else {
          // Verify if requested artist profile belongs to user
          const checkProfile = await db
            .select()
            .from(artistProfiles)
            .where(and(eq(artistProfiles.id, parsedArtistId), eq(artistProfiles.userId, user.id)))
            .limit(1);
          if (checkProfile.length > 0) {
            targetArtistId = parsedArtistId;
          }
        }
      }
    }

    if (!targetArtistId) {
      if (!artist && !isMusicianOrAdmin(user) && !isStaffRole(user.role)) {
        return res.status(403).json({ error: 'Для создания релиза необходимо завести профиль исполнителя' });
      }
      return res.status(400).json({ error: 'Не указан исполнитель' });
    }

    const releaseStatus = status && ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED'].includes(status) ? status : 'DRAFT';

    // Atomic release creation (release + genres + initial tracks)
    const createdRelease = await db.transaction(async (tx) => {
      const [newRelease] = await tx
        .insert(musicReleases)
        .values({
          artistId: targetArtistId,
          title: cleanTitle,
          slug: finalSlug,
          type: cleanType,
          description: description ? String(description).trim() : null,
          cover: cover ? String(cover).trim() : null,
          releaseDate: releaseDate ? String(releaseDate).trim() : null,
          status: releaseStatus,
        })
        .returning();

      // Link genres if provided (all or nothing)
      if (Array.isArray(genreIds) && genreIds.length > 0) {
        for (const gId of genreIds) {
          const numG = Number(gId);
          if (!isNaN(numG) && numG > 0) {
            await tx.insert(musicReleaseGenres).values({
              releaseId: newRelease.id,
              genreId: numG,
            });
          }
        }
      }

      // Link initial tracks if provided (all or nothing)
      if (Array.isArray(tracks) && tracks.length > 0) {
        for (let idx = 0; idx < tracks.length; idx++) {
          const trk = tracks[idx];
          if (trk.title && trk.audioFile) {
            await tx.insert(musicTracks).values({
              releaseId: newRelease.id,
              artistId: targetArtistId,
              title: String(trk.title).trim(),
              slug: slugify(String(trk.title)),
              trackNumber: trk.trackNumber ? Number(trk.trackNumber) : (idx + 1),
              audioFile: String(trk.audioFile).trim(),
              duration: trk.duration ? Number(trk.duration) : null,
              lyrics: trk.lyrics ? String(trk.lyrics).trim() : null,
              authorNote: trk.authorNote ? String(trk.authorNote).trim() : null,
              explicit: Boolean(trk.explicit),
              status: 'PUBLISHED',
            });
          }
        }
      }

      return newRelease;
    });

    if (createdRelease.status === 'PENDING_REVIEW') {
      let stageName = user.username;
      if (targetArtistId) {
        const [aProf] = await db
          .select({ stageName: artistProfiles.stageName })
          .from(artistProfiles)
          .where(eq(artistProfiles.id, targetArtistId))
          .limit(1);
        if (aProf?.stageName) stageName = aProf.stageName;
      }
      await notifyAdminsNewPendingRelease(createdRelease.id, createdRelease.title, stageName, user.id);
    }

    res.status(201).json({ success: true, release: createdRelease });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/releases
 * List music releases with filters & pagination
 */
musicRouter.get('/releases', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const artistId = req.query.artistId ? Number(req.query.artistId) : null;
    const type = req.query.type ? String(req.query.type).toUpperCase() : null;
    const statusParam = req.query.status ? String(req.query.status).toUpperCase() : null;
    const search = req.query.search ? String(req.query.search).trim() : '';
    const genreId = req.query.genreId ? Number(req.query.genreId) : null;
    const sort = String(req.query.sort || 'newest');

    const user = req.dbUser;
    const userArtist = user ? await getArtistProfileByUserId(user.id) : null;

    const conditions = [];

    // Privacy / Status Filter
    if (statusParam && isStaffRole(user?.role)) {
      conditions.push(eq(musicReleases.status, statusParam));
    } else if (artistId && userArtist && userArtist.id === artistId) {
      if (statusParam && ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED'].includes(statusParam)) {
        conditions.push(eq(musicReleases.status, statusParam));
      }
    } else {
      conditions.push(eq(musicReleases.status, 'PUBLISHED'));
    }

    if (artistId) conditions.push(eq(musicReleases.artistId, artistId));
    if (type && ['SINGLE', 'EP', 'ALBUM'].includes(type)) conditions.push(eq(musicReleases.type, type));
    if (search) conditions.push(ilike(musicReleases.title, `%${search}%`));

    if (genreId) {
      const releaseIdsInGenre = await db
        .select({ releaseId: musicReleaseGenres.releaseId })
        .from(musicReleaseGenres)
        .where(eq(musicReleaseGenres.genreId, genreId));
      const rIds = releaseIdsInGenre.map(r => r.releaseId);
      if (rIds.length > 0) {
        conditions.push(inArray(musicReleases.id, rIds));
      } else {
        // Return empty result if no releases match genre
        conditions.push(eq(musicReleases.id, -1));
      }
    }

    const whereClause = and(...conditions);

    const [countRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicReleases)
      .where(whereClause);

    const total = Number(countRes?.count || 0);

    let orderExpr = desc(musicReleases.createdAt);
    if (sort === 'oldest') {
      orderExpr = asc(musicReleases.createdAt);
    } else if (sort === 'highest') {
      orderExpr = desc(sql`COALESCE((SELECT AVG(overall_score) FROM music_reviews WHERE release_id = music_releases.id), 0)`);
    } else if (sort === 'popular') {
      orderExpr = desc(sql`(SELECT count(*) FROM music_reviews WHERE release_id = music_releases.id)`);
    }

    const releasesList = await db
      .select({
        id: musicReleases.id,
        artistId: musicReleases.artistId,
        title: musicReleases.title,
        slug: musicReleases.slug,
        type: musicReleases.type,
        description: musicReleases.description,
        cover: musicReleases.cover,
        releaseDate: musicReleases.releaseDate,
        status: musicReleases.status,
        listenCount: musicReleases.listenCount,
        createdAt: musicReleases.createdAt,
        updatedAt: musicReleases.updatedAt,
        stageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistAvatar: artistProfiles.avatar,
        avgScore: sql<number>`COALESCE((SELECT ROUND(AVG(overall_score)::numeric, 1) FROM music_reviews WHERE release_id = music_releases.id), 0)`,
        reviewsCount: sql<number>`(SELECT count(*) FROM music_reviews WHERE release_id = music_releases.id)`,
        tracksCount: sql<number>`(SELECT count(*) FROM music_tracks WHERE release_id = music_releases.id)`,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(limit)
      .offset(offset);

    res.json({
      releases: releasesList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/releases/:idOrSlug
 * Get detailed release with artist, tracks, genres, and review scores
 */
musicRouter.get('/releases/:idOrSlug', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const param = req.params.idOrSlug;
    const numId = Number(param);
    const isNum = !isNaN(numId) && numId > 0;

    const condition = isNum
      ? eq(musicReleases.id, numId)
      : eq(musicReleases.slug, param);

    const found = await db
      .select({
        id: musicReleases.id,
        artistId: musicReleases.artistId,
        title: musicReleases.title,
        slug: musicReleases.slug,
        type: musicReleases.type,
        description: musicReleases.description,
        cover: musicReleases.cover,
        releaseDate: musicReleases.releaseDate,
        status: musicReleases.status,
        rejectionReason: musicReleases.rejectionReason,
        listenCount: musicReleases.listenCount,
        createdAt: musicReleases.createdAt,
        updatedAt: musicReleases.updatedAt,
        stageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistAvatar: artistProfiles.avatar,
        artistUserId: artistProfiles.userId,
        artistDescription: artistProfiles.description,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(condition)
      .limit(1);

    if (found.length === 0) {
      return res.status(404).json({ error: 'Релиз не найден' });
    }

    const release = found[0];

    // Privacy check - Return 404 for non-published releases if not owner or staff
    const user = req.dbUser;
    if (release.status !== 'PUBLISHED') {
      const isOwner = user && user.id === release.artistUserId;
      if (!isOwner && !isStaffRole(user?.role)) {
        return res.status(404).json({ error: 'Релиз не найден' });
      }
    }

    // Fetch tracks
    const tracksList = await db
      .select()
      .from(musicTracks)
      .where(eq(musicTracks.releaseId, release.id))
      .orderBy(asc(musicTracks.trackNumber));

    // Fetch genres
    const genreRows = await db
      .select({
        id: musicGenres.id,
        name: musicGenres.name,
        slug: musicGenres.slug,
      })
      .from(musicReleaseGenres)
      .innerJoin(musicGenres, eq(musicReleaseGenres.genreId, musicGenres.id))
      .where(eq(musicReleaseGenres.releaseId, release.id));

    // Fetch review statistics
    const [reviewStats] = await db
      .select({
        reviewsCount: sql<number>`count(*)`,
        avgOverallScore: sql<number>`ROUND(AVG(overall_score)::numeric, 1)`,
        avgMusicScore: sql<number>`ROUND(AVG(music_score)::numeric, 1)`,
        avgPerformanceScore: sql<number>`ROUND(AVG(performance_score)::numeric, 1)`,
        avgProductionScore: sql<number>`ROUND(AVG(production_score)::numeric, 1)`,
        avgLyricsScore: sql<number>`ROUND(AVG(lyrics_score)::numeric, 1)`,
        avgAtmosphereScore: sql<number>`ROUND(AVG(atmosphere_score)::numeric, 1)`,
        avgCohesionScore: sql<number>`ROUND(AVG(cohesion_score)::numeric, 1)`,
      })
      .from(musicReviews)
      .where(eq(musicReviews.releaseId, release.id));

    // Fetch current user's review and favorite statuses if logged in
    let userReview = null;
    let isFavoriteRelease = false;
    let favoriteTrackIds = new Set<number>();

    if (user) {
      const myRev = await db
        .select()
        .from(musicReviews)
        .where(
          and(
            eq(musicReviews.releaseId, release.id),
            eq(musicReviews.userId, user.id)
          )
        )
        .limit(1);
      if (myRev.length > 0) userReview = myRev[0];

      // Check if release is in user's favorites
      const [favRel] = await db
        .select({ id: musicFavoriteReleases.id })
        .from(musicFavoriteReleases)
        .where(
          and(
            eq(musicFavoriteReleases.userId, user.id),
            eq(musicFavoriteReleases.releaseId, release.id)
          )
        )
        .limit(1);
      isFavoriteRelease = Boolean(favRel);

      // Check which tracks are in user's favorites (batch query to avoid N+1)
      if (tracksList.length > 0) {
        const trackIds = tracksList.map((t) => t.id);
        const favTracks = await db
          .select({ trackId: musicFavoriteTracks.trackId })
          .from(musicFavoriteTracks)
          .where(
            and(
              eq(musicFavoriteTracks.userId, user.id),
              inArray(musicFavoriteTracks.trackId, trackIds)
            )
          );
        favoriteTrackIds = new Set(favTracks.map((ft) => ft.trackId));
      }
    }

    const enrichedTracks = tracksList.map((t) => ({
      ...t,
      isFavorite: favoriteTrackIds.has(t.id),
    }));

    res.json({
      release: {
        ...release,
        isFavorite: isFavoriteRelease,
      },
      genres: genreRows,
      tracks: enrichedTracks,
      stats: {
        reviewsCount: Number(reviewStats?.reviewsCount || 0),
        avgOverallScore: Number(reviewStats?.avgOverallScore || 0),
        avgMusicScore: Number(reviewStats?.avgMusicScore || 0),
        avgPerformanceScore: Number(reviewStats?.avgPerformanceScore || 0),
        avgProductionScore: Number(reviewStats?.avgProductionScore || 0),
        avgLyricsScore: Number(reviewStats?.avgLyricsScore || 0),
        avgAtmosphereScore: Number(reviewStats?.avgAtmosphereScore || 0),
        avgCohesionScore: Number(reviewStats?.avgCohesionScore || 0),
      },
      userReview,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/music/releases/:id
 * Update release details
 */
musicRouter.put('/releases/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const releaseId = parseInt(req.params.id, 10);

    const existing = await db
      .select({
        id: musicReleases.id,
        title: musicReleases.title,
        status: musicReleases.status,
        artistId: musicReleases.artistId,
        artistUserId: artistProfiles.userId,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(eq(musicReleases.id, releaseId))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Релиз не найден' });
    }

    const release = existing[0];
    if (release.artistUserId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'Нет прав на редактирование этого релиза' });
    }

    // Moderation lock check: Non-staff cannot edit releases that are currently in PENDING_REVIEW
    if (release.status === 'PENDING_REVIEW' && !isStaffRole(user.role)) {
      return res.status(409).json({
        error: 'RELEASE_UNDER_MODERATION',
        message: 'Релиз находится на модерации и заблокирован для редактирования',
      });
    }

    const { title, description, cover, releaseDate, type, status, genreIds, tracks } = req.body;
    const updateData: Partial<typeof musicReleases.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (title && String(title).trim()) updateData.title = String(title).trim();
    if (description !== undefined) updateData.description = description ? String(description).trim() : null;
    if (cover !== undefined) updateData.cover = cover ? String(cover).trim() : null;
    if (releaseDate !== undefined) updateData.releaseDate = releaseDate ? String(releaseDate).trim() : null;
    if (type && ['SINGLE', 'EP', 'ALBUM'].includes(String(type).toUpperCase())) {
      updateData.type = String(type).toUpperCase();
    }

    if (status) {
      const allowedStatuses = isStaffRole(user.role)
        ? ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED']
        : ['DRAFT', 'PENDING_REVIEW', 'ARCHIVED'];
      if (allowedStatuses.includes(status)) {
        updateData.status = status;
      }
    }

    // Atomic update of release, genres, and tracklist
    const updated = await db.transaction(async (tx) => {
      const [updatedRelease] = await tx
        .update(musicReleases)
        .set(updateData)
        .where(eq(musicReleases.id, releaseId))
        .returning();

      // Update genres if provided
      if (Array.isArray(genreIds)) {
        await tx.delete(musicReleaseGenres).where(eq(musicReleaseGenres.releaseId, releaseId));
        for (const gId of genreIds) {
          const numG = Number(gId);
          if (!isNaN(numG) && numG > 0) {
            await tx.insert(musicReleaseGenres).values({
              releaseId,
              genreId: numG,
            });
          }
        }
      }

      // Update tracks if provided (from release editor)
      if (Array.isArray(tracks)) {
        const existingTracks = await tx
          .select()
          .from(musicTracks)
          .where(eq(musicTracks.releaseId, releaseId));

        const existingMap = new Map(existingTracks.map((t) => [t.id, t]));
        const updatedTrackIds = new Set<number>();

        for (let idx = 0; idx < tracks.length; idx++) {
          const trk = tracks[idx];
          if (trk.title && trk.audioFile) {
            const trkId = trk.id ? Number(trk.id) : null;
            if (trkId && existingMap.has(trkId)) {
              // Update existing track without changing its primary key
              await tx
                .update(musicTracks)
                .set({
                  title: String(trk.title).trim(),
                  slug: slugify(String(trk.title)),
                  trackNumber: trk.trackNumber ? Number(trk.trackNumber) : (idx + 1),
                  audioFile: String(trk.audioFile).trim(),
                  duration: trk.duration ? Number(trk.duration) : null,
                  lyrics: trk.lyrics ? String(trk.lyrics).trim() : null,
                  authorNote: trk.authorNote ? String(trk.authorNote).trim() : null,
                  explicit: Boolean(trk.explicit),
                  updatedAt: new Date(),
                })
                .where(eq(musicTracks.id, trkId));
              updatedTrackIds.add(trkId);
            } else {
              // Insert new track
              const [newTrk] = await tx
                .insert(musicTracks)
                .values({
                  releaseId,
                  artistId: release.artistId,
                  title: String(trk.title).trim(),
                  slug: slugify(String(trk.title)),
                  trackNumber: trk.trackNumber ? Number(trk.trackNumber) : (idx + 1),
                  audioFile: String(trk.audioFile).trim(),
                  duration: trk.duration ? Number(trk.duration) : null,
                  lyrics: trk.lyrics ? String(trk.lyrics).trim() : null,
                  authorNote: trk.authorNote ? String(trk.authorNote).trim() : null,
                  explicit: Boolean(trk.explicit),
                  status: 'PUBLISHED',
                })
                .returning({ id: musicTracks.id });
              if (newTrk) updatedTrackIds.add(newTrk.id);
            }
          }
        }

        // Delete only tracks that were explicitly removed from the tracklist
        const removedTrackIds = existingTracks
          .filter((t) => !updatedTrackIds.has(t.id))
          .map((t) => t.id);

        if (removedTrackIds.length > 0) {
          await tx
            .delete(musicTracks)
            .where(inArray(musicTracks.id, removedTrackIds));
        }
      }

      return updatedRelease;
    });

    // Trigger admin notification if status transitioned to PENDING_REVIEW
    if (updated.status === 'PENDING_REVIEW' && release.status !== 'PENDING_REVIEW') {
      let stageName = user.username;
      if (release.artistId) {
        const [aProf] = await db
          .select({ stageName: artistProfiles.stageName })
          .from(artistProfiles)
          .where(eq(artistProfiles.id, release.artistId))
          .limit(1);
        if (aProf?.stageName) stageName = aProf.stageName;
      }
      await notifyAdminsNewPendingRelease(updated.id, updated.title, stageName, user.id);
    }

    res.json({ success: true, release: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/music/releases/:id/submit
 * Musician submit release for moderation
 */
musicRouter.post('/releases/:id/submit', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const releaseId = parseInt(req.params.id, 10);

    const existing = await db
      .select({
        id: musicReleases.id,
        title: musicReleases.title,
        status: musicReleases.status,
        artistId: musicReleases.artistId,
        artistUserId: artistProfiles.userId,
        stageName: artistProfiles.stageName,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(eq(musicReleases.id, releaseId))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Релиз не найден' });
    }

    const release = existing[0];
    if (release.artistUserId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'Нет прав на редактирование этого релиза' });
    }

    // Check track count
    const [trackCountRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicTracks)
      .where(eq(musicTracks.releaseId, releaseId));

    if (Number(trackCountRes?.count || 0) === 0) {
      return res.status(400).json({ error: 'Для отправки на модерацию добавьте хотя бы один трек' });
    }

    if (release.status === 'PENDING_REVIEW') {
      return res.json({ success: true, message: 'Релиз уже находится на модерации', release });
    }

    const [updated] = await db
      .update(musicReleases)
      .set({
        status: 'PENDING_REVIEW',
        updatedAt: new Date(),
      })
      .where(eq(musicReleases.id, releaseId))
      .returning();

    await notifyAdminsNewPendingRelease(release.id, release.title, release.stageName || user.username, user.id);

    res.json({
      success: true,
      message: 'Релиз успешно отправлен на модерацию',
      release: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/music/releases/:id
 * Delete release
 */
musicRouter.delete('/releases/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const releaseId = parseInt(req.params.id, 10);

    const existing = await db
      .select({
        id: musicReleases.id,
        artistUserId: artistProfiles.userId,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(eq(musicReleases.id, releaseId))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Релиз не найден' });
    }

    if (existing[0].artistUserId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'Нет прав на удаление этого релиза' });
    }

    await db.delete(musicReleases).where(eq(musicReleases.id, releaseId));
    res.json({ success: true, message: 'Релиз успешно удалён' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. MUSIC TRACKS (/api/music/tracks)
// ==========================================

/**
 * POST /api/music/releases/:releaseId/tracks
 * Add track to release
 */
musicRouter.post('/releases/:releaseId/tracks', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const releaseId = parseInt(req.params.releaseId, 10);

    const existingRelease = await db
      .select({
        id: musicReleases.id,
        artistId: musicReleases.artistId,
        artistUserId: artistProfiles.userId,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(eq(musicReleases.id, releaseId))
      .limit(1);

    if (existingRelease.length === 0) {
      return res.status(404).json({ error: 'Релиз не найден' });
    }

    const rel = existingRelease[0];
    if (rel.artistUserId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'Нет прав на добавление треков к этому релизу' });
    }

    const { title, trackNumber, audioFile, duration, lyrics, authorNote, explicit } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Название трека обязательно' });
    }
    if (!audioFile || !String(audioFile).trim()) {
      return res.status(400).json({ error: 'Аудиофайл (audioFile) обязателен' });
    }

    const cleanTitle = String(title).trim();

    // Auto-calculate track number if not provided
    let finalTrackNumber = trackNumber ? Number(trackNumber) : 1;
    if (!trackNumber) {
      const [maxTrack] = await db
        .select({ maxNo: sql<number>`MAX(track_number)` })
        .from(musicTracks)
        .where(eq(musicTracks.releaseId, releaseId));
      finalTrackNumber = Number(maxTrack?.maxNo || 0) + 1;
    }

    const [createdTrack] = await db
      .insert(musicTracks)
      .values({
        releaseId,
        artistId: rel.artistId,
        title: cleanTitle,
        slug: slugify(cleanTitle),
        trackNumber: finalTrackNumber,
        audioFile: String(audioFile).trim(),
        duration: duration ? Number(duration) : null,
        lyrics: lyrics ? String(lyrics).trim() : null,
        authorNote: authorNote ? String(authorNote).trim() : null,
        explicit: Boolean(explicit),
        status: 'PUBLISHED',
      })
      .returning();

    res.status(201).json({ success: true, track: createdTrack });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/music/releases/:releaseId/tracks/reorder
 * Batch update track order for a release
 */
musicRouter.put('/releases/:releaseId/tracks/reorder', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const releaseId = parseInt(req.params.releaseId, 10);
    const { trackIds } = req.body; // Array of track IDs in desired order

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({ error: 'Укажите массив trackIds' });
    }

    const existingRelease = await db
      .select({
        id: musicReleases.id,
        status: musicReleases.status,
        artistUserId: artistProfiles.userId,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(eq(musicReleases.id, releaseId))
      .limit(1);

    if (existingRelease.length === 0) {
      return res.status(404).json({ error: 'Релиз не найден' });
    }

    if (existingRelease[0].artistUserId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'Нет прав на изменение порядка треков в этом релизе' });
    }

    if (existingRelease[0].status === 'PENDING_REVIEW' && !isStaffRole(user.role)) {
      return res.status(409).json({
        error: 'RELEASE_UNDER_MODERATION',
        message: 'Релиз находится на модерации и заблокирован для редактирования',
      });
    }

    await db.transaction(async (tx) => {
      for (let i = 0; i < trackIds.length; i++) {
        const tId = Number(trackIds[i]);
        if (!isNaN(tId) && tId > 0) {
          await tx
            .update(musicTracks)
            .set({ trackNumber: i + 1 })
            .where(and(eq(musicTracks.id, tId), eq(musicTracks.releaseId, releaseId)));
        }
      }
    });

    const updatedTracks = await db
      .select()
      .from(musicTracks)
      .where(eq(musicTracks.releaseId, releaseId))
      .orderBy(asc(musicTracks.trackNumber));

    res.json({ success: true, tracks: updatedTracks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/music/tracks/:id
 * Update single track
 */
musicRouter.put('/tracks/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const trackId = parseInt(req.params.id, 10);

    const existing = await db
      .select({
        id: musicTracks.id,
        artistUserId: artistProfiles.userId,
      })
      .from(musicTracks)
      .leftJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
      .where(eq(musicTracks.id, trackId))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Трек не найден' });
    }

    if (existing[0].artistUserId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'Нет прав на изменение этого трека' });
    }

    const { title, trackNumber, audioFile, duration, lyrics, authorNote, explicit, status } = req.body;
    const updateData: Partial<typeof musicTracks.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (title && String(title).trim()) {
      updateData.title = String(title).trim();
      updateData.slug = slugify(String(title));
    }
    if (trackNumber !== undefined) updateData.trackNumber = Number(trackNumber);
    if (audioFile !== undefined) updateData.audioFile = String(audioFile).trim();
    if (duration !== undefined) updateData.duration = duration ? Number(duration) : null;
    if (lyrics !== undefined) updateData.lyrics = lyrics ? String(lyrics).trim() : null;
    if (authorNote !== undefined) updateData.authorNote = authorNote ? String(authorNote).trim() : null;
    if (explicit !== undefined) updateData.explicit = Boolean(explicit);
    if (status && ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) updateData.status = status;

    const [updated] = await db
      .update(musicTracks)
      .set(updateData)
      .where(eq(musicTracks.id, trackId))
      .returning();

    res.json({ success: true, track: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/music/tracks/:id
 * Delete track
 */
musicRouter.delete('/tracks/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const trackId = parseInt(req.params.id, 10);

    const existing = await db
      .select({
        id: musicTracks.id,
        artistUserId: artistProfiles.userId,
      })
      .from(musicTracks)
      .leftJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
      .where(eq(musicTracks.id, trackId))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Трек не найден' });
    }

    if (existing[0].artistUserId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'Нет прав на удаление этого трека' });
    }

    await db.delete(musicTracks).where(eq(musicTracks.id, trackId));
    res.json({ success: true, message: 'Трек успешно удалён' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4b. MUSIC TRACK PLAYBACK SESSIONS & LISTENING TRACKING
// ==========================================

/**
 * POST /api/music/tracks/:trackId/playback-start
 * Register start of playback session
 */
musicRouter.post('/tracks/:trackId/playback-start', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const trackId = parseInt(req.params.trackId, 10);
    if (isNaN(trackId) || trackId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор трека' });
    }

    const { playbackSessionId } = req.body;
    if (!playbackSessionId || typeof playbackSessionId !== 'string' || playbackSessionId.length > 128) {
      return res.status(400).json({ error: 'playbackSessionId обязателен' });
    }

    const user = req.dbUser;
    const sessionIdentifier = getClientSessionIdentifier(req);
    const rateLimitKey = user ? `user_${user.id}` : `anon_${sessionIdentifier}`;

    if (!checkListenRateLimit(rateLimitKey, 60)) {
      return res.status(429).json({ error: 'Слишком много запросов воспроизведения' });
    }

    // Verify track and its release status
    const [trackRow] = await db
      .select({
        trackId: musicTracks.id,
        releaseId: musicTracks.releaseId,
        status: musicReleases.status,
      })
      .from(musicTracks)
      .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
      .where(eq(musicTracks.id, trackId))
      .limit(1);

    if (!trackRow) {
      return res.status(404).json({ error: 'Трек не найден' });
    }

    // Only published releases can track public playback sessions
    if (trackRow.status !== 'PUBLISHED') {
      return res.json({ success: false, message: 'Воспроизведение неопубликованного релиза не регистрируется' });
    }

    // Insert playback session
    await db
      .insert(musicPlaybackSessions)
      .values({
        playbackSessionId,
        trackId,
        releaseId: trackRow.releaseId,
        userId: user ? user.id : null,
        sessionIdentifier,
        isConsumed: false,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    res.json({ success: true, playbackSessionId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/music/tracks/:trackId/listen
 * Validates qualified listen event, applies anti-fraud, updates counters & awards PTS milestone
 */
musicRouter.post('/tracks/:trackId/listen', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const trackId = parseInt(req.params.trackId, 10);
    if (isNaN(trackId) || trackId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор трека' });
    }

    const { playbackSessionId, playedSeconds } = req.body;
    if (!playbackSessionId || typeof playbackSessionId !== 'string') {
      return res.status(400).json({ error: 'playbackSessionId обязателен' });
    }

    const user = req.dbUser;
    const sessionIdentifier = getClientSessionIdentifier(req);
    const rateLimitKey = user ? `user_${user.id}` : `anon_${sessionIdentifier}`;

    // Rate limiting: 30 listen events per minute
    if (!checkListenRateLimit(rateLimitKey, 30)) {
      return res.status(429).json({ counted: false, error: 'Слишком частые запросы' });
    }

    // Retrieve track, parent release, and author artist profile
    const [trackInfo] = await db
      .select({
        trackId: musicTracks.id,
        duration: musicTracks.duration,
        trackListenCount: musicTracks.listenCount,
        releaseId: musicReleases.id,
        releaseStatus: musicReleases.status,
        releaseListenCount: musicReleases.listenCount,
        artistId: musicReleases.artistId,
        artistUserId: artistProfiles.userId,
      })
      .from(musicTracks)
      .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
      .innerJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(eq(musicTracks.id, trackId))
      .limit(1);

    if (!trackInfo) {
      return res.status(404).json({ counted: false, error: 'Трек не найден' });
    }

    // Only published releases count towards public listens
    if (trackInfo.releaseStatus !== 'PUBLISHED') {
      return res.json({ counted: false });
    }

    // Look up playback session
    const [session] = await db
      .select()
      .from(musicPlaybackSessions)
      .where(
        and(
          eq(musicPlaybackSessions.playbackSessionId, playbackSessionId),
          eq(musicPlaybackSessions.trackId, trackId),
          eq(musicPlaybackSessions.isConsumed, false)
        )
      )
      .limit(1);

    if (!session) {
      // Session already consumed or invalid
      return res.json({ counted: false });
    }

    // Wall-clock verification to prevent seek-spoofing
    const elapsedSeconds = (Date.now() - (session.createdAt?.getTime() || Date.now())) / 1000;
    const trackDuration = trackInfo.duration && trackInfo.duration > 0 ? trackInfo.duration : 180;

    // Required playback threshold: min(30s, 50% of track). For tracks < 30s: 50% of track (min 5s).
    let thresholdSec = 30;
    if (trackDuration < 30) {
      thresholdSec = Math.max(5, Math.floor(trackDuration * 0.5));
    } else {
      thresholdSec = Math.min(30, Math.max(10, Math.floor(trackDuration * 0.5)));
    }

    // Tolerance of 3 seconds for network latency and audio buffering
    if (elapsedSeconds < thresholdSec - 3) {
      // Mark consumed to avoid replay
      await db
        .update(musicPlaybackSessions)
        .set({ isConsumed: true })
        .where(eq(musicPlaybackSessions.id, session.id));
      return res.json({ counted: false });
    }

    // Mark session as consumed
    await db
      .update(musicPlaybackSessions)
      .set({ isConsumed: true })
      .where(eq(musicPlaybackSessions.id, session.id));

    // Check if listener is the author of this track
    const isAuthor = Boolean(user && user.id === trackInfo.artistUserId);
    if (isAuthor) {
      // Record internal listen event for author's personal playback history,
      // but do NOT increase public listen count and do NOT award PTS.
      await db.insert(musicListens).values({
        trackId,
        releaseId: trackInfo.releaseId,
        userId: user ? user.id : null,
        sessionIdentifier,
        playbackSessionId,
        durationPlayed: typeof playedSeconds === 'number' ? Math.round(playedSeconds) : Math.round(elapsedSeconds),
        isEligible: false,
        isAuthor: true,
        createdAt: new Date(),
        qualifiedAt: new Date(),
      });

      return res.json({
        counted: false,
        isAuthor: true,
        trackListenCount: trackInfo.trackListenCount,
        releaseListenCount: trackInfo.releaseListenCount,
      });
    }

    // Cooldown check (24 hours for the same track per user or guest session)
    const cooldownPeriod = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cooldownCondition = user
      ? and(
          eq(musicListens.trackId, trackId),
          eq(musicListens.userId, user.id),
          eq(musicListens.isEligible, true),
          gt(musicListens.createdAt, cooldownPeriod)
        )
      : and(
          eq(musicListens.trackId, trackId),
          eq(musicListens.sessionIdentifier, sessionIdentifier),
          eq(musicListens.isEligible, true),
          gt(musicListens.createdAt, cooldownPeriod)
        );

    const [recentEligible] = await db
      .select({ id: musicListens.id })
      .from(musicListens)
      .where(cooldownCondition)
      .limit(1);

    if (recentEligible) {
      // User or guest has already triggered an eligible listen for this track within 24h
      await db.insert(musicListens).values({
        trackId,
        releaseId: trackInfo.releaseId,
        userId: user ? user.id : null,
        sessionIdentifier,
        playbackSessionId,
        durationPlayed: typeof playedSeconds === 'number' ? Math.round(playedSeconds) : Math.round(elapsedSeconds),
        isEligible: false,
        isAuthor: false,
        createdAt: new Date(),
        qualifiedAt: new Date(),
      });

      return res.json({
        counted: false,
        trackListenCount: trackInfo.trackListenCount,
        releaseListenCount: trackInfo.releaseListenCount,
      });
    }

    // Record QUALIFIED ELIGIBLE LISTEN
    await db.insert(musicListens).values({
      trackId,
      releaseId: trackInfo.releaseId,
      userId: user ? user.id : null,
      sessionIdentifier,
      playbackSessionId,
      durationPlayed: typeof playedSeconds === 'number' ? Math.round(playedSeconds) : Math.round(elapsedSeconds),
      isEligible: true,
      isAuthor: false,
      createdAt: new Date(),
      qualifiedAt: new Date(),
    });

    // Atomically increment track and release listen counters
    await db
      .update(musicTracks)
      .set({ listenCount: sql`${musicTracks.listenCount} + 1` })
      .where(eq(musicTracks.id, trackId));

    await db
      .update(musicReleases)
      .set({ listenCount: sql`${musicReleases.listenCount} + 1` })
      .where(eq(musicReleases.id, trackInfo.releaseId));

    // Award PTS milestone to author if eligible threshold reached
    if (trackInfo.artistUserId) {
      await checkAndAwardMusicListenPts(trackInfo.artistId, trackInfo.artistUserId);
    }

    const updatedTrackCount = trackInfo.trackListenCount + 1;
    const updatedReleaseCount = trackInfo.releaseListenCount + 1;

    res.json({
      counted: true,
      trackListenCount: updatedTrackCount,
      releaseListenCount: updatedReleaseCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, counted: false });
  }
});

/**
 * GET /api/music/releases/:releaseId/stats
 * Public listen statistics for a release
 */
musicRouter.get('/releases/:releaseId/stats', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const param = req.params.releaseId;
    const numId = Number(param);
    const isNum = !isNaN(numId) && numId > 0;

    const condition = isNum
      ? eq(musicReleases.id, numId)
      : eq(musicReleases.slug, param);

    const [release] = await db
      .select({
        id: musicReleases.id,
        title: musicReleases.title,
        slug: musicReleases.slug,
        status: musicReleases.status,
        listenCount: musicReleases.listenCount,
        artistId: musicReleases.artistId,
        artistUserId: artistProfiles.userId,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(condition)
      .limit(1);

    if (!release) {
      return res.status(404).json({ error: 'Релиз не найден' });
    }

    const user = req.dbUser;
    if (release.status !== 'PUBLISHED') {
      const isOwner = user && user.id === release.artistUserId;
      if (!isOwner && !isStaffRole(user?.role)) {
        return res.status(404).json({ error: 'Релиз не найден' });
      }
    }

    const tracksList = await db
      .select({
        id: musicTracks.id,
        title: musicTracks.title,
        trackNumber: musicTracks.trackNumber,
        duration: musicTracks.duration,
        listenCount: musicTracks.listenCount,
      })
      .from(musicTracks)
      .where(eq(musicTracks.releaseId, release.id))
      .orderBy(asc(musicTracks.trackNumber));

    res.json({
      releaseId: release.id,
      title: release.title,
      slug: release.slug,
      listenCount: release.listenCount,
      tracks: tracksList,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/artists/:idOrSlug/stats
 * Public listen statistics for an artist
 */
musicRouter.get('/artists/:idOrSlug/stats', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const param = req.params.idOrSlug;
    const numId = Number(param);
    const isNum = !isNaN(numId) && numId > 0;

    const condition = isNum
      ? eq(artistProfiles.id, numId)
      : eq(artistProfiles.slug, param);

    const [artist] = await db
      .select({
        id: artistProfiles.id,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
      })
      .from(artistProfiles)
      .where(condition)
      .limit(1);

    if (!artist) {
      return res.status(404).json({ error: 'Исполнитель не найден' });
    }

    const [listensRes] = await db
      .select({
        totalListens: sql<number>`COALESCE(SUM(${musicReleases.listenCount}), 0)`,
        publishedCount: sql<number>`count(*)`,
      })
      .from(musicReleases)
      .where(
        and(
          eq(musicReleases.artistId, artist.id),
          eq(musicReleases.status, 'PUBLISHED')
        )
      );

    res.json({
      artistId: artist.id,
      stageName: artist.stageName,
      slug: artist.slug,
      totalListens: Number(listensRes?.totalListens || 0),
      publishedReleasesCount: Number(listensRes?.publishedCount || 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. MUSIC REVIEWS (100-Point Scoring System)
// ==========================================

/**
 * POST /api/music/releases/:releaseId/reviews
 * Submit or update a 100-point 6-criterion review for a release
 */
musicRouter.post('/releases/:releaseId/reviews', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const releaseId = parseInt(req.params.releaseId, 10);

    const existingRelease = await db
      .select({ id: musicReleases.id, title: musicReleases.title })
      .from(musicReleases)
      .where(eq(musicReleases.id, releaseId))
      .limit(1);

    if (existingRelease.length === 0) {
      return res.status(404).json({ error: 'Музыкальный релиз не найден' });
    }

    const {
      musicScore,
      performanceScore,
      productionScore,
      lyricsScore,
      atmosphereScore,
      cohesionScore,
      text,
    } = req.body;

    // Strict 100-point validation for all 6 scores
    let mScore: number, pScore: number, prScore: number, lScore: number, aScore: number, cScore: number;
    try {
      mScore = validateScore(musicScore, 'Музыка');
      pScore = validateScore(performanceScore, 'Исполнение');
      prScore = validateScore(productionScore, 'Продакшн');
      lScore = validateScore(lyricsScore, 'Тексты');
      aScore = validateScore(atmosphereScore, 'Атмосфера');
      cScore = validateScore(cohesionScore, 'Целостность');
    } catch (valErr: any) {
      return res.status(400).json({ error: valErr.message });
    }

    // SERVER-AUTHORITATIVE OVERALL SCORE CALCULATION
    const calculatedOverallScore = Math.round(((mScore + pScore + prScore + lScore + aScore + cScore) / 6.0) * 10) / 10;

    // Upsert review record
    const existingReview = await db
      .select()
      .from(musicReviews)
      .where(
        and(
          eq(musicReviews.releaseId, releaseId),
          eq(musicReviews.userId, user.id)
        )
      )
      .limit(1);

    let savedReview;
    if (existingReview.length > 0) {
      [savedReview] = await db
        .update(musicReviews)
        .set({
          musicScore: mScore,
          performanceScore: pScore,
          productionScore: prScore,
          lyricsScore: lScore,
          atmosphereScore: aScore,
          cohesionScore: cScore,
          overallScore: calculatedOverallScore,
          text: text ? String(text).trim() : null,
          updatedAt: new Date(),
        })
        .where(eq(musicReviews.id, existingReview[0].id))
        .returning();
    } else {
      [savedReview] = await db
        .insert(musicReviews)
        .values({
          userId: user.id,
          releaseId,
          musicScore: mScore,
          performanceScore: pScore,
          productionScore: prScore,
          lyricsScore: lScore,
          atmosphereScore: aScore,
          cohesionScore: cScore,
          overallScore: calculatedOverallScore,
          text: text ? String(text).trim() : null,
        })
        .returning();

      // Log social activity
      await db.insert(activities).values({
        userId: user.id,
        type: 'MUSIC_REVIEW_CREATED',
        details: JSON.stringify({
          releaseId,
          releaseTitle: existingRelease[0].title,
          overallScore: calculatedOverallScore,
        }),
      }).catch(() => {});
    }

    res.json({
      success: true,
      review: savedReview,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/releases/:releaseId/reviews
 * Fetch reviews for release
 */
musicRouter.get('/releases/:releaseId/reviews', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const releaseId = parseInt(req.params.releaseId, 10);
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const sort = String(req.query.sort || 'newest');
    const offset = (page - 1) * limit;

    const [countRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicReviews)
      .where(eq(musicReviews.releaseId, releaseId));

    const total = Number(countRes?.count || 0);

    let orderClause = desc(musicReviews.createdAt);
    if (sort === 'highest') {
      orderClause = desc(musicReviews.overallScore);
    } else if (sort === 'lowest') {
      orderClause = asc(musicReviews.overallScore);
    }

    const reviewsList = await db
      .select({
        id: musicReviews.id,
        userId: musicReviews.userId,
        releaseId: musicReviews.releaseId,
        musicScore: musicReviews.musicScore,
        performanceScore: musicReviews.performanceScore,
        productionScore: musicReviews.productionScore,
        lyricsScore: musicReviews.lyricsScore,
        atmosphereScore: musicReviews.atmosphereScore,
        cohesionScore: musicReviews.cohesionScore,
        overallScore: musicReviews.overallScore,
        text: musicReviews.text,
        createdAt: musicReviews.createdAt,
        updatedAt: musicReviews.updatedAt,
        username: users.username,
        userAvatar: users.avatar,
      })
      .from(musicReviews)
      .leftJoin(users, eq(musicReviews.userId, users.id))
      .where(eq(musicReviews.releaseId, releaseId))
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset);

    res.json({
      reviews: reviewsList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/music/reviews/:id
 * Delete music review
 */
musicRouter.delete('/reviews/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const reviewId = parseInt(req.params.id, 10);

    const existing = await db
      .select()
      .from(musicReviews)
      .where(eq(musicReviews.id, reviewId))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Рецензия не найдена' });
    }

    if (existing[0].userId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'Нет прав на удаление этой рецензии' });
    }

    await db.delete(musicReviews).where(eq(musicReviews.id, reviewId));
    res.json({ success: true, message: 'Рецензия успешно удалена' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5b. USER MUSIC LIBRARY («МОЯ МУЗЫКА»)
// ==========================================

/**
 * GET /api/music/reviews/my
 * Get releases reviewed by the current user
 */
musicRouter.get('/reviews/my', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;

    const userReviews = await db
      .select({
        id: musicReviews.id,
        releaseId: musicReviews.releaseId,
        userId: musicReviews.userId,
        musicScore: musicReviews.musicScore,
        performanceScore: musicReviews.performanceScore,
        productionScore: musicReviews.productionScore,
        lyricsScore: musicReviews.lyricsScore,
        atmosphereScore: musicReviews.atmosphereScore,
        cohesionScore: musicReviews.cohesionScore,
        overallScore: musicReviews.overallScore,
        text: musicReviews.text,
        createdAt: musicReviews.createdAt,
        updatedAt: musicReviews.updatedAt,
        releaseTitle: musicReleases.title,
        releaseSlug: musicReleases.slug,
        releaseCover: musicReleases.cover,
        releaseType: musicReleases.type,
        releaseDate: musicReleases.releaseDate,
        releaseListenCount: musicReleases.listenCount,
        artistId: musicReleases.artistId,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistAvatar: artistProfiles.avatar,
      })
      .from(musicReviews)
      .innerJoin(musicReleases, eq(musicReviews.releaseId, musicReleases.id))
      .innerJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(and(eq(musicReviews.userId, user.id), eq(musicReleases.status, 'PUBLISHED')))
      .orderBy(desc(musicReviews.createdAt));

    res.json({ reviews: userReviews });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/my/summary
 * Overview metrics of user's personal music library
 */
musicRouter.get('/my/summary', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;

    const [favReleasesCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicFavoriteReleases)
      .innerJoin(musicReleases, eq(musicFavoriteReleases.releaseId, musicReleases.id))
      .where(and(eq(musicFavoriteReleases.userId, user.id), eq(musicReleases.status, 'PUBLISHED')));

    const [favTracksCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicFavoriteTracks)
      .innerJoin(musicTracks, eq(musicFavoriteTracks.trackId, musicTracks.id))
      .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
      .where(and(eq(musicFavoriteTracks.userId, user.id), eq(musicReleases.status, 'PUBLISHED')));

    const recentCountRes = await db.execute(sql`
      SELECT COUNT(DISTINCT ml.track_id)::integer as count,
             COALESCE(SUM(ml.duration_played), 0)::integer as "totalSeconds"
      FROM music_listens ml
      INNER JOIN music_releases r ON ml.release_id = r.id
      WHERE ml.user_id = ${user.id} AND r.status = 'PUBLISHED'
    `);

    const [reviewsCountRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicReviews)
      .innerJoin(musicReleases, eq(musicReviews.releaseId, musicReleases.id))
      .where(and(eq(musicReviews.userId, user.id), eq(musicReleases.status, 'PUBLISHED')));

    const [playlistsCountRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicPlaylists)
      .where(eq(musicPlaylists.userId, user.id));

    res.json({
      favoriteReleasesCount: Number(favReleasesCount?.count || 0),
      favoriteTracksCount: Number(favTracksCount?.count || 0),
      recentTracksCount: Number(recentCountRes.rows?.[0]?.count || 0),
      totalListeningSeconds: Number(recentCountRes.rows?.[0]?.totalSeconds || 0),
      reviewsCount: Number(reviewsCountRes?.count || 0),
      playlistsCount: Number(playlistsCountRes?.count || 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/my/releases
 * Fetch user's favorite published releases with search, filter & sort
 */
musicRouter.get('/my/releases', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;
    const sort = String(req.query.sort || 'recent_added');
    const q = req.query.q ? String(req.query.q).trim() : '';
    const type = req.query.type ? String(req.query.type).toUpperCase() : 'ALL';

    const conditions = [
      eq(musicFavoriteReleases.userId, user.id),
      eq(musicReleases.status, 'PUBLISHED'),
    ];

    if (q) {
      conditions.push(
        or(
          ilike(musicReleases.title, `%${q}%`),
          ilike(artistProfiles.stageName, `%${q}%`)
        )!
      );
    }

    if (type !== 'ALL' && ['SINGLE', 'EP', 'ALBUM'].includes(type)) {
      conditions.push(eq(musicReleases.type, type));
    }

    const whereClause = and(...conditions);

    const [countRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicFavoriteReleases)
      .innerJoin(musicReleases, eq(musicFavoriteReleases.releaseId, musicReleases.id))
      .innerJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(whereClause);

    const total = Number(countRes?.count || 0);

    let orderExpr = desc(musicFavoriteReleases.createdAt);
    if (sort === 'title_asc') {
      orderExpr = asc(musicReleases.title);
    } else if (sort === 'title_desc') {
      orderExpr = desc(musicReleases.title);
    } else if (sort === 'release_date_desc') {
      orderExpr = desc(musicReleases.releaseDate);
    } else if (sort === 'popular') {
      orderExpr = desc(musicReleases.listenCount);
    } else if (sort === 'rating') {
      orderExpr = desc(sql`(SELECT ROUND(AVG(overall_score)::numeric, 1) FROM music_reviews WHERE release_id = music_releases.id)`);
    }

    const releasesList = await db
      .select({
        id: musicReleases.id,
        artistId: musicReleases.artistId,
        title: musicReleases.title,
        slug: musicReleases.slug,
        type: musicReleases.type,
        description: musicReleases.description,
        cover: musicReleases.cover,
        releaseDate: musicReleases.releaseDate,
        status: musicReleases.status,
        listenCount: musicReleases.listenCount,
        createdAt: musicReleases.createdAt,
        addedAt: musicFavoriteReleases.createdAt,
        stageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistAvatar: artistProfiles.avatar,
        avgScore: sql<number>`COALESCE((SELECT ROUND(AVG(overall_score)::numeric, 1) FROM music_reviews WHERE release_id = music_releases.id), 0)`,
        reviewsCount: sql<number>`(SELECT count(*) FROM music_reviews WHERE release_id = music_releases.id)`,
        tracksCount: sql<number>`(SELECT count(*) FROM music_tracks WHERE release_id = music_releases.id)`,
      })
      .from(musicFavoriteReleases)
      .innerJoin(musicReleases, eq(musicFavoriteReleases.releaseId, musicReleases.id))
      .innerJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(limit)
      .offset(offset);

    const enriched = releasesList.map((rel) => ({
      ...rel,
      isFavorite: true,
    }));

    res.json({
      releases: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/music/my/releases/:releaseId
 * Add published release to user's favorites
 */
musicRouter.post('/my/releases/:releaseId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const releaseId = parseInt(req.params.releaseId, 10);

    if (isNaN(releaseId) || releaseId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор релиза' });
    }

    // Only allow adding published releases
    const [release] = await db
      .select({ id: musicReleases.id, title: musicReleases.title, status: musicReleases.status })
      .from(musicReleases)
      .where(eq(musicReleases.id, releaseId))
      .limit(1);

    if (!release || release.status !== 'PUBLISHED') {
      return res.status(404).json({ error: 'Релиз не найден или ещё не опубликован' });
    }

    await db
      .insert(musicFavoriteReleases)
      .values({
        userId: user.id,
        releaseId,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    res.json({
      success: true,
      isFavorite: true,
      message: `Релиз «${release.title}» добавлен в избранное`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/music/my/releases/:releaseId
 * Remove release from user's favorites
 */
musicRouter.delete('/my/releases/:releaseId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const releaseId = parseInt(req.params.releaseId, 10);

    if (isNaN(releaseId) || releaseId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор релиза' });
    }

    await db
      .delete(musicFavoriteReleases)
      .where(
        and(
          eq(musicFavoriteReleases.userId, user.id),
          eq(musicFavoriteReleases.releaseId, releaseId)
        )
      );

    res.json({
      success: true,
      isFavorite: false,
      message: 'Релиз удалён из избранного',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/my/releases/:releaseId/status
 * Check if release is in user's favorites
 */
musicRouter.get('/my/releases/:releaseId/status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const releaseId = parseInt(req.params.releaseId, 10);

    if (isNaN(releaseId) || releaseId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор релиза' });
    }

    const [found] = await db
      .select({ id: musicFavoriteReleases.id })
      .from(musicFavoriteReleases)
      .where(
        and(
          eq(musicFavoriteReleases.userId, user.id),
          eq(musicFavoriteReleases.releaseId, releaseId)
        )
      )
      .limit(1);

    res.json({ isFavorite: Boolean(found) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/my/tracks
 * Fetch user's favorite tracks with search & sort
 */
musicRouter.get('/my/tracks', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 30));
    const offset = (page - 1) * limit;
    const sort = String(req.query.sort || 'recent_added');
    const q = req.query.q ? String(req.query.q).trim() : '';

    const conditions = [
      eq(musicFavoriteTracks.userId, user.id),
      eq(musicReleases.status, 'PUBLISHED'),
    ];

    if (q) {
      conditions.push(
        or(
          ilike(musicTracks.title, `%${q}%`),
          ilike(musicReleases.title, `%${q}%`),
          ilike(artistProfiles.stageName, `%${q}%`)
        )!
      );
    }

    const whereClause = and(...conditions);

    const [countRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicFavoriteTracks)
      .innerJoin(musicTracks, eq(musicFavoriteTracks.trackId, musicTracks.id))
      .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
      .innerJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(whereClause);

    const total = Number(countRes?.count || 0);

    let orderExpr = desc(musicFavoriteTracks.createdAt);
    if (sort === 'title_asc') {
      orderExpr = asc(musicTracks.title);
    } else if (sort === 'popular') {
      orderExpr = desc(musicTracks.listenCount);
    } else if (sort === 'duration') {
      orderExpr = desc(musicTracks.duration);
    }

    const tracksList = await db
      .select({
        id: musicTracks.id,
        releaseId: musicTracks.releaseId,
        artistId: musicTracks.artistId,
        title: musicTracks.title,
        slug: musicTracks.slug,
        trackNumber: musicTracks.trackNumber,
        audioFile: musicTracks.audioFile,
        duration: musicTracks.duration,
        explicit: musicTracks.explicit,
        lyrics: musicTracks.lyrics,
        authorNote: musicTracks.authorNote,
        listenCount: musicTracks.listenCount,
        createdAt: musicTracks.createdAt,
        addedAt: musicFavoriteTracks.createdAt,
        releaseTitle: musicReleases.title,
        releaseCover: musicReleases.cover,
        releaseSlug: musicReleases.slug,
        releaseType: musicReleases.type,
        artistName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
      })
      .from(musicFavoriteTracks)
      .innerJoin(musicTracks, eq(musicFavoriteTracks.trackId, musicTracks.id))
      .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
      .innerJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(limit)
      .offset(offset);

    const enriched = tracksList.map((tr) => ({
      ...tr,
      isFavorite: true,
    }));

    res.json({
      tracks: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/music/my/tracks/:trackId
 * Add track from published release to user's favorites
 */
musicRouter.post('/my/tracks/:trackId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const trackId = parseInt(req.params.trackId, 10);

    if (isNaN(trackId) || trackId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор трека' });
    }

    // Verify track belongs to a published release
    const [track] = await db
      .select({
        id: musicTracks.id,
        title: musicTracks.title,
        releaseStatus: musicReleases.status,
      })
      .from(musicTracks)
      .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
      .where(eq(musicTracks.id, trackId))
      .limit(1);

    if (!track || track.releaseStatus !== 'PUBLISHED') {
      return res.status(404).json({ error: 'Трек не найден или релиз ещё не опубликован' });
    }

    await db
      .insert(musicFavoriteTracks)
      .values({
        userId: user.id,
        trackId,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    res.json({
      success: true,
      isFavorite: true,
      message: `Трек «${track.title}» добавлен в любимые`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/music/my/tracks/:trackId
 * Remove track from user's favorites
 */
musicRouter.delete('/my/tracks/:trackId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const trackId = parseInt(req.params.trackId, 10);

    if (isNaN(trackId) || trackId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор трека' });
    }

    await db
      .delete(musicFavoriteTracks)
      .where(
        and(
          eq(musicFavoriteTracks.userId, user.id),
          eq(musicFavoriteTracks.trackId, trackId)
        )
      );

    res.json({
      success: true,
      isFavorite: false,
      message: 'Трек удалён из любимых',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/my/tracks/:trackId/status
 * Check if track is in user's favorites
 */
musicRouter.get('/my/tracks/:trackId/status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const trackId = parseInt(req.params.trackId, 10);

    if (isNaN(trackId) || trackId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор трека' });
    }

    const [found] = await db
      .select({ id: musicFavoriteTracks.id })
      .from(musicFavoriteTracks)
      .where(
        and(
          eq(musicFavoriteTracks.userId, user.id),
          eq(musicFavoriteTracks.trackId, trackId)
        )
      )
      .limit(1);

    res.json({ isFavorite: Boolean(found) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/my/recent
 * Recently played unique tracks from actual PostgreSQL playback events
 * Shows latest listen date per track without duplicates
 */
musicRouter.get('/my/recent', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 30));
    const offset = (page - 1) * limit;
    const q = req.query.q ? String(req.query.q).trim() : '';

    const searchClause = q
      ? sql`AND (t.title ILIKE ${'%' + q + '%'} OR r.title ILIKE ${'%' + q + '%'} OR ap.stage_name ILIKE ${'%' + q + '%'})`
      : sql``;

    const countRes = await db.execute(sql`
      SELECT COUNT(DISTINCT ml.track_id)::integer as total
      FROM music_listens ml
      INNER JOIN music_tracks t ON ml.track_id = t.id
      INNER JOIN music_releases r ON ml.release_id = r.id
      INNER JOIN artist_profiles ap ON r.artist_id = ap.id
      WHERE ml.user_id = ${user.id}
        AND r.status = 'PUBLISHED'
        ${searchClause}
    `);
    const total = Number(countRes.rows?.[0]?.total || 0);

    const tracksRes = await db.execute(sql`
      SELECT
        t.id,
        t.release_id as "releaseId",
        t.artist_id as "artistId",
        t.title,
        t.slug,
        t.track_number as "trackNumber",
        t.audio_file as "audioFile",
        t.duration,
        t.explicit,
        t.lyrics,
        t.author_note as "authorNote",
        t.listen_count as "listenCount",
        r.title as "releaseTitle",
        r.cover as "releaseCover",
        r.slug as "releaseSlug",
        r.type as "releaseType",
        ap.stage_name as "artistName",
        ap.slug as "artistSlug",
        MAX(ml.created_at) as "lastListenedAt",
        COUNT(ml.id)::integer as "userListenCount"
      FROM music_listens ml
      INNER JOIN music_tracks t ON ml.track_id = t.id
      INNER JOIN music_releases r ON ml.release_id = r.id
      INNER JOIN artist_profiles ap ON r.artist_id = ap.id
      WHERE ml.user_id = ${user.id}
        AND r.status = 'PUBLISHED'
        ${searchClause}
      GROUP BY t.id, r.id, ap.id
      ORDER BY MAX(ml.created_at) DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const trackRows = tracksRes.rows || [];
    let favoriteSet = new Set<number>();
    if (trackRows.length > 0) {
      const trackIds = trackRows.map((r: any) => r.id);
      const favs = await db
        .select({ trackId: musicFavoriteTracks.trackId })
        .from(musicFavoriteTracks)
        .where(
          and(
            eq(musicFavoriteTracks.userId, user.id),
            inArray(musicFavoriteTracks.trackId, trackIds)
          )
        );
      favoriteSet = new Set(favs.map((f) => f.trackId));
    }

    const items = trackRows.map((row: any) => ({
      ...row,
      isFavorite: favoriteSet.has(row.id),
    }));

    res.json({
      tracks: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// 6. MUSICIAN APPLICATIONS (/api/music/applications)
// ==========================================

/**
 * POST /api/music/applications
 * Submit application for musician status
 */
musicRouter.post('/applications', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;

    const isAlreadyMusician = isMusicianOrAdmin(user);
    if (isAlreadyMusician) {
      return res.status(400).json({ error: 'У вас уже есть статус музыканта или администратора' });
    }

    // Check if user already has a pending application
    const existingPending = await db
      .select()
      .from(musicianApplications)
      .where(
        and(
          eq(musicianApplications.userId, user.id),
          eq(musicianApplications.status, 'PENDING')
        )
      )
      .limit(1);

    if (existingPending.length > 0) {
      return res.status(409).json({
        error: 'Ваша заявка уже находится на рассмотрении администрации',
        application: existingPending[0],
      });
    }

    const { message } = req.body;
    const cleanMessage = message ? String(message).trim() : '';

    const [app] = await db
      .insert(musicianApplications)
      .values({
        userId: user.id,
        status: 'PENDING',
        message: cleanMessage,
      })
      .returning();

    res.status(201).json({ success: true, application: app });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/applications/my
 * Get logged-in user's active/latest application
 */
musicRouter.get('/applications/my', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;

    const apps = await db
      .select()
      .from(musicianApplications)
      .where(eq(musicianApplications.userId, user.id))
      .orderBy(desc(musicianApplications.createdAt))
      .limit(1);

    const isMusician = isMusicianOrAdmin(user);

    res.json({
      application: apps.length > 0 ? apps[0] : null,
      isMusician,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/applications/admin
 * Admin list all applications
 */
musicRouter.get('/applications/admin', requireAuth, requireStaff('ACCESS_ADMIN_PANEL'), async (req: AuthRequest, res: Response) => {
  try {
    const statusFilter = req.query.status ? String(req.query.status).toUpperCase() : 'ALL';
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (['PENDING', 'APPROVED', 'REJECTED'].includes(statusFilter)) {
      conditions.push(eq(musicianApplications.status, statusFilter));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicianApplications)
      .where(whereClause);

    const total = Number(countRes?.count || 0);

    const list = await db
      .select({
        id: musicianApplications.id,
        userId: musicianApplications.userId,
        status: musicianApplications.status,
        message: musicianApplications.message,
        reviewedBy: musicianApplications.reviewedBy,
        reviewedAt: musicianApplications.reviewedAt,
        rejectionReason: musicianApplications.rejectionReason,
        createdAt: musicianApplications.createdAt,
        updatedAt: musicianApplications.updatedAt,
        username: users.username,
        userAvatar: users.avatar,
        userEmail: users.email,
        userRole: users.role,
      })
      .from(musicianApplications)
      .leftJoin(users, eq(musicianApplications.userId, users.id))
      .where(whereClause)
      .orderBy(desc(musicianApplications.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      applications: list,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/music/applications/admin/:id/approve
 * Admin approve musician application (ADMIN ONLY)
 */
musicRouter.post('/applications/admin/:id/approve', requireAuth, requireAdminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.dbUser!;
    const appId = parseInt(req.params.id, 10);

    if (isNaN(appId) || appId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID заявки' });
    }

    const foundApp = await db
      .select()
      .from(musicianApplications)
      .where(eq(musicianApplications.id, appId))
      .limit(1);

    if (foundApp.length === 0) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    const application = foundApp[0];

    if (application.status === 'APPROVED') {
      return res.status(400).json({ error: 'Заявка уже была одобрена ранее' });
    }
    if (application.status === 'REJECTED') {
      return res.status(400).json({ error: 'Заявка уже была отклонена. Повторное одобрение отклоненных заявок запрещено.' });
    }
    if (application.status !== 'PENDING') {
      return res.status(400).json({ error: 'Одобрить можно только заявку со статусом PENDING' });
    }

    // 1. Update application status
    const [updatedApp] = await db
      .update(musicianApplications)
      .set({
        status: 'APPROVED',
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(musicianApplications.id, appId))
      .returning();

    // 2. Update user role to 'musician' if user is currently regular USER
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, application.userId))
      .limit(1);

    if (targetUser && targetUser.role === 'USER') {
      await db
        .update(users)
        .set({ role: 'musician', updatedAt: new Date() })
        .where(eq(users.id, targetUser.id));
    }

    // 3. Create or activate artistProfile for user
    if (targetUser) {
      const existingProfile = await getArtistProfileByUserId(targetUser.id);
      if (!existingProfile) {
        let baseSlug = slugify(targetUser.username);
        const slugCheck = await db
          .select({ id: artistProfiles.id })
          .from(artistProfiles)
          .where(eq(artistProfiles.slug, baseSlug))
          .limit(1);

        if (slugCheck.length > 0) {
          baseSlug = `${baseSlug}-${Math.floor(Math.random() * 899 + 100)}`;
        }

        await db.insert(artistProfiles).values({
          userId: targetUser.id,
          stageName: targetUser.username,
          slug: baseSlug,
          avatar: targetUser.avatar || null,
          status: 'ACTIVE',
        });
      } else if (existingProfile.status !== 'ACTIVE') {
        await db
          .update(artistProfiles)
          .set({ status: 'ACTIVE', updatedAt: new Date() })
          .where(eq(artistProfiles.id, existingProfile.id));
      }
    }

    res.json({
      success: true,
      message: 'Заявка одобрена, пользователю выдан статус музыканта',
      application: updatedApp,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/music/applications/admin/:id/reject
 * Admin reject musician application (ADMIN ONLY)
 */
musicRouter.post('/applications/admin/:id/reject', requireAuth, requireAdminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.dbUser!;
    const appId = parseInt(req.params.id, 10);
    const { rejectionReason } = req.body;

    if (isNaN(appId) || appId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID заявки' });
    }

    const foundApp = await db
      .select()
      .from(musicianApplications)
      .where(eq(musicianApplications.id, appId))
      .limit(1);

    if (foundApp.length === 0) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    const application = foundApp[0];

    if (application.status === 'APPROVED') {
      return res.status(400).json({ error: 'Нельзя отклонить уже одобренную заявку' });
    }
    if (application.status === 'REJECTED') {
      return res.status(400).json({ error: 'Заявка уже была отклонена ранее' });
    }

    const [updatedApp] = await db
      .update(musicianApplications)
      .set({
        status: 'REJECTED',
        rejectionReason: rejectionReason ? String(rejectionReason).trim() : 'Заявка отклонена администрацией',
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(musicianApplications.id, appId))
      .returning();

    res.json({
      success: true,
      message: 'Заявка отклонена',
      application: updatedApp,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. MUSIC STUDIO METRICS & DASHBOARD
// ==========================================

/**
 * GET /api/music/studio/releases
 * Musician Studio: List ONLY the authenticated user's releases across all moderation statuses (DRAFT, PENDING_REVIEW, PUBLISHED, REJECTED, ARCHIVED)
 */
musicRouter.get('/studio/releases', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const artist = await getOrCreateArtistProfileByUserId(user);

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset = (page - 1) * limit;

    const statusParam = req.query.status ? String(req.query.status).toUpperCase() : null;
    const type = req.query.type ? String(req.query.type).toUpperCase() : null;
    const search = req.query.search ? String(req.query.search).trim() : '';
    const sort = String(req.query.sort || 'newest');

    // If user has no artist profile, return empty releases array
    if (!artist) {
      return res.json({
        releases: [],
        pagination: {
          page: 1,
          limit,
          total: 0,
          totalPages: 0,
        },
      });
    }

    // Strict ownership condition: artistId MUST equal current user's artist profile ID
    const conditions = [eq(musicReleases.artistId, artist.id)];

    if (statusParam && ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED'].includes(statusParam)) {
      conditions.push(eq(musicReleases.status, statusParam));
    }
    if (type && ['SINGLE', 'EP', 'ALBUM'].includes(type)) {
      conditions.push(eq(musicReleases.type, type));
    }
    if (search) {
      conditions.push(ilike(musicReleases.title, `%${search}%`));
    }

    const whereClause = and(...conditions);

    // Calculate total count strictly for this user's releases
    const [countRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicReleases)
      .where(whereClause);

    const total = Number(countRes?.count || 0);

    let orderExpr = desc(musicReleases.createdAt);
    if (sort === 'oldest') {
      orderExpr = asc(musicReleases.createdAt);
    } else if (sort === 'highest') {
      orderExpr = desc(sql`COALESCE((SELECT AVG(overall_score) FROM music_reviews WHERE release_id = music_releases.id), 0)`);
    } else if (sort === 'popular') {
      orderExpr = desc(sql`(SELECT count(*) FROM music_reviews WHERE release_id = music_releases.id)`);
    }

    const releasesList = await db
      .select({
        id: musicReleases.id,
        artistId: musicReleases.artistId,
        title: musicReleases.title,
        slug: musicReleases.slug,
        type: musicReleases.type,
        description: musicReleases.description,
        cover: musicReleases.cover,
        releaseDate: musicReleases.releaseDate,
        status: musicReleases.status,
        rejectionReason: musicReleases.rejectionReason,
        listenCount: musicReleases.listenCount,
        createdAt: musicReleases.createdAt,
        updatedAt: musicReleases.updatedAt,
        stageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistAvatar: artistProfiles.avatar,
        avgScore: sql<number>`COALESCE((SELECT ROUND(AVG(overall_score)::numeric, 1) FROM music_reviews WHERE release_id = music_releases.id), 0)`,
        reviewsCount: sql<number>`(SELECT count(*) FROM music_reviews WHERE release_id = music_releases.id)`,
        tracksCount: sql<number>`(SELECT count(*) FROM music_tracks WHERE release_id = music_releases.id)`,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(limit)
      .offset(offset);

    res.json({
      releases: releasesList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/studio/stats
 * Real metrics for musician's studio overview & extended analytics
 */
musicRouter.get('/studio/stats', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const artist = await getOrCreateArtistProfileByUserId(user);

    if (!artist) {
      return res.json({
        artist: null,
        stats: {
          totalReleases: 0,
          totalTracks: 0,
          totalReviews: 0,
          avgOverallScore: 0,
          draftsCount: 0,
          pendingCount: 0,
          publishedCount: 0,
          totalListens: 0,
          uniqueListeners: 0,
          avgListensPerListener: 0,
          periodListens: 0,
          periodUniqueListeners: 0,
          periodChangePct: null,
          periodChangeLabel: 'Нет данных для сравнения',
          ptsEarned: 0,
        },
        topTrack: null,
        newListenersCount: 0,
        returningListenersCount: 0,
        peakDay: 'Недостаточно данных',
        peakHour: 'Недостаточно данных',
        dayOfWeekStats: [],
        hourlyStats: [],
        recentReleases: [],
        releasesStats: [],
        tracksStats: [],
        dailyStats: [],
        ptsRewardsHistory: [],
        reviews: [],
      });
    }

    // 1. All artist releases
    const releasesList = await db
      .select({
        id: musicReleases.id,
        artistId: musicReleases.artistId,
        title: musicReleases.title,
        slug: musicReleases.slug,
        type: musicReleases.type,
        description: musicReleases.description,
        cover: musicReleases.cover,
        releaseDate: musicReleases.releaseDate,
        status: musicReleases.status,
        listenCount: musicReleases.listenCount,
        createdAt: musicReleases.createdAt,
        updatedAt: musicReleases.updatedAt,
        reviewsCount: sql<number>`(SELECT count(*) FROM music_reviews WHERE release_id = music_releases.id)`,
        tracksCount: sql<number>`(SELECT count(*) FROM music_tracks WHERE release_id = music_releases.id)`,
      })
      .from(musicReleases)
      .where(eq(musicReleases.artistId, artist.id))
      .orderBy(desc(musicReleases.createdAt));

    const totalReleases = releasesList.length;
    const draftsCount = releasesList.filter(r => r.status === 'DRAFT').length;
    const pendingCount = releasesList.filter(r => r.status === 'PENDING_REVIEW').length;
    const publishedCount = releasesList.filter(r => r.status === 'PUBLISHED').length;

    // Published release IDs for public metrics
    const publishedReleases = releasesList.filter(r => r.status === 'PUBLISHED');
    const publishedReleaseIds = publishedReleases.map(r => r.id);

    // Total tracks
    const [tracksRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicTracks)
      .where(eq(musicTracks.artistId, artist.id));

    const totalTracks = Number(tracksRes?.count || 0);

    // Reviews metrics for artist's releases
    const releaseIds = releasesList.map(r => r.id);
    let totalReviews = 0;
    let avgOverallScore = 0;
    let recentReviews: any[] = [];

    if (releaseIds.length > 0) {
      const [reviewStats] = await db
        .select({
          totalReviews: sql<number>`count(*)`,
          avgScore: sql<number>`ROUND(AVG(overall_score)::numeric, 1)`,
        })
        .from(musicReviews)
        .where(inArray(musicReviews.releaseId, releaseIds));

      totalReviews = Number(reviewStats?.totalReviews || 0);
      avgOverallScore = Number(reviewStats?.avgScore || 0);

      recentReviews = await db
        .select({
          id: musicReviews.id,
          releaseId: musicReviews.releaseId,
          releaseTitle: musicReleases.title,
          overallScore: musicReviews.overallScore,
          musicScore: musicReviews.musicScore,
          performanceScore: musicReviews.performanceScore,
          productionScore: musicReviews.productionScore,
          lyricsScore: musicReviews.lyricsScore,
          atmosphereScore: musicReviews.atmosphereScore,
          cohesionScore: musicReviews.cohesionScore,
          text: musicReviews.text,
          createdAt: musicReviews.createdAt,
          username: users.username,
          userAvatar: users.avatar,
        })
        .from(musicReviews)
        .leftJoin(musicReleases, eq(musicReviews.releaseId, musicReleases.id))
        .leftJoin(users, eq(musicReviews.userId, users.id))
        .where(inArray(musicReviews.releaseId, releaseIds))
        .orderBy(desc(musicReviews.createdAt))
        .limit(10);
    }

    // PTS ledger queries
    const [ptsEarnedRes] = await db
      .select({
        totalPts: sql<number>`COALESCE(SUM(${ptsTransactions.amount}), 0)`,
      })
      .from(ptsTransactions)
      .where(
        and(
          eq(ptsTransactions.userId, user.id),
          eq(ptsTransactions.type, 'MUSIC_LISTEN_REWARD')
        )
      );

    const ptsEarned = Number(ptsEarnedRes?.totalPts || 0);

    const ptsRewardsHistory = await db
      .select({
        id: ptsTransactions.id,
        amount: ptsTransactions.amount,
        type: ptsTransactions.type,
        source: ptsTransactions.source,
        referenceId: ptsTransactions.referenceId,
        description: ptsTransactions.description,
        createdAt: ptsTransactions.createdAt,
      })
      .from(ptsTransactions)
      .where(
        and(
          eq(ptsTransactions.userId, user.id),
          eq(ptsTransactions.type, 'MUSIC_LISTEN_REWARD')
        )
      )
      .orderBy(desc(ptsTransactions.createdAt))
      .limit(20);

    const daysParam = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;

    // If no published releases, return with cleanly zeroed metrics
    if (publishedReleaseIds.length === 0) {
      return res.json({
        artist,
        stats: {
          totalReleases,
          totalTracks,
          totalReviews,
          avgOverallScore,
          draftsCount,
          pendingCount,
          publishedCount,
          totalListens: 0,
          uniqueListeners: 0,
          avgListensPerListener: 0,
          periodListens: 0,
          periodUniqueListeners: 0,
          periodChangePct: null,
          periodChangeLabel: 'Нет данных для сравнения',
          ptsEarned,
        },
        topTrack: null,
        newListenersCount: 0,
        returningListenersCount: 0,
        peakDay: 'Недостаточно данных',
        peakHour: 'Недостаточно данных',
        dayOfWeekStats: [
          { dow: 1, label: 'Пн', name: 'Понедельник', listens: 0 },
          { dow: 2, label: 'Вт', name: 'Вторник', listens: 0 },
          { dow: 3, label: 'Ср', name: 'Среда', listens: 0 },
          { dow: 4, label: 'Чт', name: 'Четверг', listens: 0 },
          { dow: 5, label: 'Пт', name: 'Пятница', listens: 0 },
          { dow: 6, label: 'Сб', name: 'Суббота', listens: 0 },
          { dow: 7, label: 'Вс', name: 'Воскресенье', listens: 0 },
        ],
        hourlyStats: Array.from({ length: 24 }, (_, h) => ({
          hour: h,
          label: `${String(h).padStart(2, '0')}:00`,
          listens: 0,
        })),
        recentReleases: releasesList.slice(0, 5),
        releasesStats: [],
        tracksStats: [],
        dailyStats: Array.from({ length: daysParam }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (daysParam - 1 - i));
          return {
            date: d.toISOString().split('T')[0],
            label: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
            listens: 0,
            uniqueListeners: 0,
            newListeners: 0,
            returningListeners: 0,
          };
        }),
        ptsRewardsHistory,
        reviews: recentReviews,
      });
    }

    // 2. Lifetime public listens & unique listeners (excluding author)
    const [lifetimeRes] = await db
      .select({
        totalListens: sql<number>`count(*)`,
        uniqueListeners: sql<number>`count(DISTINCT COALESCE('u:' || ${musicListens.userId}::text, 's:' || ${musicListens.sessionIdentifier}))`,
      })
      .from(musicListens)
      .where(
        and(
          inArray(musicListens.releaseId, publishedReleaseIds),
          eq(musicListens.isEligible, true),
          eq(musicListens.isAuthor, false)
        )
      );

    const totalListens = Number(lifetimeRes?.totalListens || 0);
    const uniqueListeners = Number(lifetimeRes?.uniqueListeners || 0);
    const avgListensPerListener = uniqueListeners > 0
      ? Math.round((totalListens / uniqueListeners) * 10) / 10
      : 0;

    // 3. Current period listens & unique listeners
    const [periodRes] = await db
      .select({
        periodListens: sql<number>`count(*)`,
        periodUnique: sql<number>`count(DISTINCT COALESCE('u:' || ${musicListens.userId}::text, 's:' || ${musicListens.sessionIdentifier}))`,
      })
      .from(musicListens)
      .where(
        and(
          inArray(musicListens.releaseId, publishedReleaseIds),
          eq(musicListens.isEligible, true),
          eq(musicListens.isAuthor, false),
          gte(musicListens.createdAt, sql`NOW() - (${daysParam} || ' days')::interval`)
        )
      );

    const periodListens = Number(periodRes?.periodListens || 0);
    const periodUniqueListeners = Number(periodRes?.periodUnique || 0);

    // 4. Previous period of same length for comparison
    const [prevPeriodRes] = await db
      .select({
        prevListens: sql<number>`count(*)`,
        prevUnique: sql<number>`count(DISTINCT COALESCE('u:' || ${musicListens.userId}::text, 's:' || ${musicListens.sessionIdentifier}))`,
      })
      .from(musicListens)
      .where(
        and(
          inArray(musicListens.releaseId, publishedReleaseIds),
          eq(musicListens.isEligible, true),
          eq(musicListens.isAuthor, false),
          gte(musicListens.createdAt, sql`NOW() - ((${daysParam} * 2) || ' days')::interval`),
          sql`${musicListens.createdAt} < NOW() - (${daysParam} || ' days')::interval`
        )
      );

    const prevListens = Number(prevPeriodRes?.prevListens || 0);
    let periodChangePct: number | null = null;
    let periodChangeLabel = 'Нет данных для сравнения';
    if (prevListens > 0) {
      const pct = Math.round(((periodListens - prevListens) / prevListens) * 1000) / 10;
      periodChangePct = pct;
      periodChangeLabel = `${pct >= 0 ? '+' : ''}${pct}% к предыдущим ${daysParam} дням`;
    }

    // 5. Daily Breakdown for Chart
    const dailyDbRows = await db
      .select({
        dateStr: sql<string>`to_char(${musicListens.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
        uniqueCount: sql<number>`count(DISTINCT COALESCE('u:' || ${musicListens.userId}::text, 's:' || ${musicListens.sessionIdentifier}))`,
      })
      .from(musicListens)
      .where(
        and(
          inArray(musicListens.releaseId, publishedReleaseIds),
          eq(musicListens.isEligible, true),
          eq(musicListens.isAuthor, false),
          gte(musicListens.createdAt, sql`NOW() - (${daysParam} || ' days')::interval`)
        )
      )
      .groupBy(sql`to_char(${musicListens.createdAt}, 'YYYY-MM-DD')`);

    const dailyListensMap = new Map<string, number>();
    const dailyUniqueMap = new Map<string, number>();
    for (const row of dailyDbRows) {
      if (row.dateStr) {
        dailyListensMap.set(row.dateStr, Number(row.count || 0));
        dailyUniqueMap.set(row.dateStr, Number(row.uniqueCount || 0));
      }
    }

    // 6. First listen dates for daily new listeners calculation
    const publishedIdsSql = sql.join(publishedReleaseIds.map(id => sql`${id}`), sql`, `);

    const firstListenRows = await db.execute(sql`
      WITH first_listens AS (
        SELECT 
          COALESCE('u:' || ${musicListens.userId}::text, 's:' || ${musicListens.sessionIdentifier}) AS listener_key,
          MIN(${musicListens.createdAt}) as first_listen_at
        FROM ${musicListens}
        WHERE ${musicListens.releaseId} IN (${publishedIdsSql})
          AND ${musicListens.isEligible} = true
          AND ${musicListens.isAuthor} = false
        GROUP BY COALESCE('u:' || ${musicListens.userId}::text, 's:' || ${musicListens.sessionIdentifier})
      )
      SELECT 
        to_char(first_listen_at, 'YYYY-MM-DD') as date_str,
        count(*)::int as new_count
      FROM first_listens
      WHERE first_listen_at >= NOW() - (${daysParam} || ' days')::interval
      GROUP BY to_char(first_listen_at, 'YYYY-MM-DD')
    `);

    const dailyNewMap = new Map<string, number>();
    for (const row of (firstListenRows.rows as any[]) || []) {
      if (row.date_str) {
        dailyNewMap.set(row.date_str, Number(row.new_count || 0));
      }
    }

    const dailyStats: {
      date: string;
      label: string;
      listens: number;
      uniqueListeners: number;
      newListeners: number;
      returningListeners: number;
    }[] = [];

    for (let i = daysParam - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      const dayListens = dailyListensMap.get(dateKey) || 0;
      const dayUnique = dailyUniqueMap.get(dateKey) || 0;
      const dayNew = dailyNewMap.get(dateKey) || 0;
      const dayReturning = Math.max(0, dayUnique - dayNew);
      dailyStats.push({
        date: dateKey,
        label,
        listens: dayListens,
        uniqueListeners: dayUnique,
        newListeners: dayNew,
        returningListeners: dayReturning,
      });
    }

    // 7. Period Cohort: New vs Returning Listeners
    const periodCohortRows = await db.execute(sql`
      WITH active_listeners AS (
        SELECT DISTINCT 
          COALESCE('u:' || ${musicListens.userId}::text, 's:' || ${musicListens.sessionIdentifier}) AS listener_key
        FROM ${musicListens}
        WHERE ${musicListens.releaseId} IN (${publishedIdsSql})
          AND ${musicListens.isEligible} = true
          AND ${musicListens.isAuthor} = false
          AND ${musicListens.createdAt} >= NOW() - (${daysParam} || ' days')::interval
      ),
      prior_listens AS (
        SELECT DISTINCT 
          COALESCE('u:' || ${musicListens.userId}::text, 's:' || ${musicListens.sessionIdentifier}) AS listener_key
        FROM ${musicListens}
        WHERE ${musicListens.releaseId} IN (${publishedIdsSql})
          AND ${musicListens.isEligible} = true
          AND ${musicListens.isAuthor} = false
          AND ${musicListens.createdAt} < NOW() - (${daysParam} || ' days')::interval
      )
      SELECT 
        COUNT(al.listener_key)::int as total_active,
        COUNT(pl.listener_key)::int as returning_count
      FROM active_listeners al
      LEFT JOIN prior_listens pl ON al.listener_key = pl.listener_key
    `);

    const cohortRow = (periodCohortRows.rows as any[])?.[0] || {};
    const totalActive = Number(cohortRow.total_active || 0);
    const returningListenersCount = Number(cohortRow.returning_count || 0);
    const newListenersCount = Math.max(0, totalActive - returningListenersCount);

    // 8. Day of week breakdown (1=Mon ... 7=Sun)
    const dowRows = await db.execute(sql`
      SELECT 
        EXTRACT(ISODOW FROM ${musicListens.createdAt})::int as dow,
        count(*)::int as listens
      FROM ${musicListens}
      WHERE ${musicListens.releaseId} IN (${publishedIdsSql})
        AND ${musicListens.isEligible} = true
        AND ${musicListens.isAuthor} = false
      GROUP BY dow
      ORDER BY dow
    `);
    const dowMap = new Map<number, number>();
    for (const r of (dowRows.rows as any[]) || []) {
      dowMap.set(Number(r.dow), Number(r.listens || 0));
    }

    const dowLabels = [
      { dow: 1, label: 'Пн', name: 'Понедельник' },
      { dow: 2, label: 'Вт', name: 'Вторник' },
      { dow: 3, label: 'Ср', name: 'Среда' },
      { dow: 4, label: 'Чт', name: 'Четверг' },
      { dow: 5, label: 'Пт', name: 'Пятница' },
      { dow: 6, label: 'Сб', name: 'Суббота' },
      { dow: 7, label: 'Вс', name: 'Воскресенье' },
    ];

    let peakDay = 'Недостаточно данных';
    let maxDowCount = 0;
    let bestDowName = '';

    const dayOfWeekStats = dowLabels.map((d) => {
      const listens = dowMap.get(d.dow) || 0;
      if (listens > maxDowCount) {
        maxDowCount = listens;
        bestDowName = d.name;
      }
      return {
        dow: d.dow,
        label: d.label,
        name: d.name,
        listens,
      };
    });

    if (maxDowCount > 0) {
      peakDay = `${bestDowName} (${maxDowCount.toLocaleString('ru-RU')} просл.)`;
    }

    // 9. Hourly breakdown (00:00 to 23:00)
    const hourRows = await db.execute(sql`
      SELECT 
        EXTRACT(HOUR FROM ${musicListens.createdAt})::int as hour,
        count(*)::int as listens
      FROM ${musicListens}
      WHERE ${musicListens.releaseId} IN (${publishedIdsSql})
        AND ${musicListens.isEligible} = true
        AND ${musicListens.isAuthor} = false
      GROUP BY hour
      ORDER BY hour
    `);
    const hourMap = new Map<number, number>();
    for (const r of (hourRows.rows as any[]) || []) {
      hourMap.set(Number(r.hour), Number(r.listens || 0));
    }

    let peakHour = 'Недостаточно данных';
    let maxHourCount = 0;
    let bestHour = -1;

    const hourlyStats = Array.from({ length: 24 }, (_, h) => {
      const listens = hourMap.get(h) || 0;
      if (listens > maxHourCount) {
        maxHourCount = listens;
        bestHour = h;
      }
      return {
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        listens,
      };
    });

    if (maxHourCount > 0 && bestHour >= 0) {
      peakHour = `${String(bestHour).padStart(2, '0')}:00 - ${String((bestHour + 1) % 24).padStart(2, '0')}:00 (${maxHourCount.toLocaleString('ru-RU')} просл.)`;
    }

    // 10. Published Releases Stats & Shares
    const releasesStatsRows = await db.execute(sql`
      SELECT 
        mr.id,
        mr.artist_id as "artistId",
        mr.title,
        mr.slug,
        mr.type,
        mr.cover,
        mr.release_date as "releaseDate",
        mr.status,
        mr.created_at as "createdAt",
        COUNT(DISTINCT mt.id)::int as "tracksCount",
        (SELECT count(*)::int FROM music_reviews WHERE release_id = mr.id) as "reviewsCount",
        COUNT(DISTINCT CASE WHEN ml.is_eligible = true AND ml.is_author = false THEN ml.id END)::int as "listenCount"
      FROM music_releases mr
      LEFT JOIN music_tracks mt ON mt.release_id = mr.id
      LEFT JOIN music_listens ml ON ml.release_id = mr.id
      WHERE mr.artist_id = ${artist.id} AND mr.status = 'PUBLISHED'
      GROUP BY mr.id
      ORDER BY "listenCount" DESC, mr.created_at DESC
    `);

    const releasesStats = (releasesStatsRows.rows as any[]).map((r) => {
      const lCount = Number(r.listenCount || 0);
      const sharePct = totalListens > 0 ? Math.round((lCount / totalListens) * 1000) / 10 : 0;
      return {
        id: Number(r.id),
        artistId: Number(r.artistId),
        title: String(r.title),
        slug: String(r.slug),
        type: String(r.type),
        cover: r.cover || null,
        status: String(r.status),
        releaseDate: r.releaseDate || null,
        listenCount: lCount,
        tracksCount: Number(r.tracksCount || 0),
        reviewsCount: Number(r.reviewsCount || 0),
        createdAt: r.createdAt,
        sharePct,
      };
    });

    // 11. Popular Tracks Stats (Published releases only)
    const tracksStatsRows = await db.execute(sql`
      SELECT 
        mt.id,
        mt.release_id as "releaseId",
        mr.title as "releaseTitle",
        mr.cover as "releaseCover",
        mt.title,
        mt.slug,
        mt.track_number as "trackNumber",
        mt.duration,
        mt.status,
        mt.created_at as "createdAt",
        COUNT(ml.id)::int as "listenCount"
      FROM music_tracks mt
      INNER JOIN music_releases mr ON mt.release_id = mr.id
      LEFT JOIN music_listens ml ON ml.track_id = mt.id AND ml.is_eligible = true AND ml.is_author = false
      WHERE mt.artist_id = ${artist.id} AND mr.status = 'PUBLISHED'
      GROUP BY mt.id, mr.title, mr.cover
      ORDER BY "listenCount" DESC, mt.created_at DESC
    `);

    const tracksStats = (tracksStatsRows.rows as any[]).map((t) => ({
      id: Number(t.id),
      releaseId: Number(t.releaseId),
      releaseTitle: String(t.releaseTitle),
      releaseCover: t.releaseCover || null,
      title: String(t.title),
      slug: t.slug || null,
      trackNumber: Number(t.trackNumber || 1),
      duration: t.duration ? Number(t.duration) : null,
      listenCount: Number(t.listenCount || 0),
      status: String(t.status),
      createdAt: t.createdAt,
    }));

    // Top Track KPI
    const topTrack = tracksStats.length > 0 && tracksStats[0]
      ? {
          id: tracksStats[0].id,
          title: tracksStats[0].title,
          releaseTitle: tracksStats[0].releaseTitle,
          listenCount: tracksStats[0].listenCount,
        }
      : null;

    res.json({
      artist,
      stats: {
        totalReleases,
        totalTracks,
        totalReviews,
        avgOverallScore,
        draftsCount,
        pendingCount,
        publishedCount,
        totalListens,
        uniqueListeners,
        avgListensPerListener,
        periodListens,
        periodUniqueListeners,
        periodChangePct,
        periodChangeLabel,
        ptsEarned,
      },
      topTrack,
      newListenersCount,
      returningListenersCount,
      peakDay,
      peakHour,
      dayOfWeekStats,
      hourlyStats,
      recentReleases: releasesList.slice(0, 5),
      releasesStats,
      tracksStats,
      dailyStats,
      ptsRewardsHistory,
      reviews: recentReviews,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. MUSIC HUB HOME & SEARCH
// ==========================================

let cachedExternalHits: any[] = [];
let cachedExternalHitsExpiresAt = 0;

/**
 * GET /api/music/home
 * Returns curated data for the /music portal hub
 */
musicRouter.get('/home', optionalAuth, async (_req, res) => {
  try {
    // 1. Published Releases Count
    const [relCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicReleases)
      .where(eq(musicReleases.status, 'PUBLISHED'));

    // 2. Total Published Tracks Count
    const [trackCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicTracks)
      .where(eq(musicTracks.status, 'PUBLISHED'));

    // 3. Active Artists Count
    const [artistCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(artistProfiles)
      .where(eq(artistProfiles.status, 'ACTIVE'));

    // 4. Total Reviews
    const [reviewCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicReviews);

    // 5. Featured / Latest Published Releases
    const latestReleases = await db
      .select({
        id: musicReleases.id,
        artistId: musicReleases.artistId,
        title: musicReleases.title,
        slug: musicReleases.slug,
        type: musicReleases.type,
        description: musicReleases.description,
        cover: musicReleases.cover,
        releaseDate: musicReleases.releaseDate,
        createdAt: musicReleases.createdAt,
        stageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistAvatar: artistProfiles.avatar,
        avgScore: sql<number>`COALESCE((SELECT ROUND(AVG(overall_score)::numeric, 1) FROM music_reviews WHERE release_id = music_releases.id), 0)`,
        reviewsCount: sql<number>`(SELECT count(*) FROM music_reviews WHERE release_id = music_releases.id)`,
        tracksCount: sql<number>`(SELECT count(*) FROM music_tracks WHERE release_id = music_releases.id)`,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(eq(musicReleases.status, 'PUBLISHED'))
      .orderBy(desc(musicReleases.createdAt))
      .limit(8);

    // 6. Popular Releases (by average review score / review count)
    const popularReleases = await db
      .select({
        id: musicReleases.id,
        artistId: musicReleases.artistId,
        title: musicReleases.title,
        slug: musicReleases.slug,
        type: musicReleases.type,
        description: musicReleases.description,
        cover: musicReleases.cover,
        releaseDate: musicReleases.releaseDate,
        createdAt: musicReleases.createdAt,
        stageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistAvatar: artistProfiles.avatar,
        avgScore: sql<number>`COALESCE((SELECT ROUND(AVG(overall_score)::numeric, 1) FROM music_reviews WHERE release_id = music_releases.id), 0)`,
        reviewsCount: sql<number>`(SELECT count(*) FROM music_reviews WHERE release_id = music_releases.id)`,
        tracksCount: sql<number>`(SELECT count(*) FROM music_tracks WHERE release_id = music_releases.id)`,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(eq(musicReleases.status, 'PUBLISHED'))
      .orderBy(desc(sql`COALESCE((SELECT AVG(overall_score) FROM music_reviews WHERE release_id = music_releases.id), 0)`), desc(musicReleases.createdAt))
      .limit(8);

    // 7. Popular Artists
    const popularArtists = await db
      .select({
        id: artistProfiles.id,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        avatar: artistProfiles.avatar,
        description: artistProfiles.description,
        releasesCount: sql<number>`(SELECT count(*) FROM music_releases WHERE artist_id = artist_profiles.id AND status = 'PUBLISHED')`,
        tracksCount: sql<number>`(SELECT count(*) FROM music_tracks WHERE artist_id = artist_profiles.id AND status = 'PUBLISHED')`,
      })
      .from(artistProfiles)
      .where(eq(artistProfiles.status, 'ACTIVE'))
      .orderBy(desc(sql`(SELECT count(*) FROM music_releases WHERE artist_id = artist_profiles.id AND status = 'PUBLISHED')`))
      .limit(6);

    // 8. All Genres
    const genresList = await db
      .select()
      .from(musicGenres)
      .orderBy(asc(musicGenres.name));

    // 9. Popular Dodik tracks
    const popularDodikTracks = await db
      .select({
        id: musicTracks.id,
        releaseId: musicTracks.releaseId,
        title: musicTracks.title,
        slug: musicTracks.slug,
        audioFile: musicTracks.audioFile,
        duration: musicTracks.duration,
        trackNumber: musicTracks.trackNumber,
        lyrics: musicTracks.lyrics,
        releaseTitle: musicReleases.title,
        releaseCover: musicReleases.cover,
        releaseSlug: musicReleases.slug,
        stageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
      })
      .from(musicTracks)
      .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
      .innerJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
      .where(
        and(
          eq(musicTracks.status, 'PUBLISHED'),
          eq(musicReleases.status, 'PUBLISHED')
        )
      )
      .orderBy(desc(musicTracks.listenCount), desc(musicTracks.createdAt))
      .limit(8);

    const dodikTracksFormatted = popularDodikTracks.map((t) => ({
      ...t,
      kind: 'dodik',
      source: 'dodik',
    }));

    // 10. Trending YouTube Music Hits (cached 15 min)
    let trendingHits: any[] = [];
    if (Date.now() < cachedExternalHitsExpiresAt && cachedExternalHits.length > 0) {
      trendingHits = cachedExternalHits;
    } else {
      try {
        const timeoutPromise = new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 3000));
        const searchPromise = youtubeMusicProvider.searchTracks('top hits 2026', { limit: 12 });
        const externalHits = await Promise.race([searchPromise, timeoutPromise]);
        if (Array.isArray(externalHits) && externalHits.length > 0) {
          cachedExternalHits = externalHits;
          cachedExternalHitsExpiresAt = Date.now() + 15 * 60 * 1000;
          trendingHits = externalHits;
        } else if (cachedExternalHits.length > 0) {
          trendingHits = cachedExternalHits;
        }
      } catch (e) {
        console.warn('Failed to load external hits for home:', e);
        if (cachedExternalHits.length > 0) {
          trendingHits = cachedExternalHits;
        }
      }
    }

    res.json({
      stats: {
        totalReleases: Number(relCount?.count || 0),
        totalTracks: Number(trackCount?.count || 0),
        totalArtists: Number(artistCount?.count || 0),
        totalReviews: Number(reviewCount?.count || 0),
      },
      heroRelease: popularReleases[0] || latestReleases[0] || null,
      latestReleases,
      popularReleases,
      popularArtists,
      popularTracks: dodikTracksFormatted,
      trendingHits,
      genres: genresList,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/search
 * Dedicated music search across published releases, active artists, and published tracks
 */
musicRouter.get('/search', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : '';

    if (!q) {
      return res.json({ releases: [], artists: [], tracks: [] });
    }

    // Search published releases
    const releasesMatch = await db
      .select({
        id: musicReleases.id,
        artistId: musicReleases.artistId,
        title: musicReleases.title,
        slug: musicReleases.slug,
        type: musicReleases.type,
        cover: musicReleases.cover,
        releaseDate: musicReleases.releaseDate,
        stageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        avgScore: sql<number>`COALESCE((SELECT ROUND(AVG(overall_score)::numeric, 1) FROM music_reviews WHERE release_id = music_releases.id), 0)`,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(
        and(
          eq(musicReleases.status, 'PUBLISHED'),
          ilike(musicReleases.title, `%${q}%`)
        )
      )
      .limit(10);

    // Search active artists
    const artistsMatch = await db
      .select({
        id: artistProfiles.id,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        avatar: artistProfiles.avatar,
        description: artistProfiles.description,
      })
      .from(artistProfiles)
      .where(
        and(
          eq(artistProfiles.status, 'ACTIVE'),
          ilike(artistProfiles.stageName, `%${q}%`)
        )
      )
      .limit(10);

    // Search published tracks
    const tracksMatch = await db
      .select({
        id: musicTracks.id,
        releaseId: musicTracks.releaseId,
        title: musicTracks.title,
        slug: musicTracks.slug,
        audioFile: musicTracks.audioFile,
        duration: musicTracks.duration,
        trackNumber: musicTracks.trackNumber,
        lyrics: musicTracks.lyrics,
        releaseTitle: musicReleases.title,
        releaseCover: musicReleases.cover,
        releaseSlug: musicReleases.slug,
        stageName: artistProfiles.stageName,
      })
      .from(musicTracks)
      .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
      .innerJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
      .where(
        and(
          eq(musicTracks.status, 'PUBLISHED'),
          eq(musicReleases.status, 'PUBLISHED'),
          ilike(musicTracks.title, `%${q}%`)
        )
      )
      .limit(15);

    // Search external music tracks, artists, and releases safely from YouTube Music if enabled
    let externalTracks: any[] = [];
    let externalArtists: any[] = [];
    let externalReleases: any[] = [];

    if (req.query.includeExternal !== 'false') {
      try {
        if (externalMusicConfig.isCatalogEnabled('youtube')) {
          const [ytTracks, ytArtists, ytReleases] = await Promise.allSettled([
            youtubeMusicProvider.searchTracks(q, { limit: 20 }),
            youtubeMusicProvider.searchArtists(q, { limit: 8 }),
            youtubeMusicProvider.searchReleases(q, { limit: 8 }),
          ]);

          if (ytTracks.status === 'fulfilled') {
            externalTracks = ytTracks.value;
          }
          if (ytArtists.status === 'fulfilled') {
            externalArtists = ytArtists.value;
          }
          if (ytReleases.status === 'fulfilled') {
            externalReleases = ytReleases.value;
          }
        }
      } catch (e) {
        console.warn('[MusicRouter] External search error in search endpoint:', e);
      }
    }

    res.json({
      releases: releasesMatch,
      artists: artistsMatch,
      tracks: tracksMatch,
      externalTracks,
      externalArtists,
      externalReleases,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. ADMIN MUSIC MODERATION ENDPOINTS
// ==========================================

/**
 * GET /api/music/admin/releases/pending-count
 * Returns real count of releases with PENDING_REVIEW status for admin sidebar badge
 */
musicRouter.get('/admin/releases/pending-count', requireAuth, requireStaff('MANAGE_MODERATION'), async (req: AuthRequest, res: Response) => {
  try {
    const [countRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicReleases)
      .where(eq(musicReleases.status, 'PENDING_REVIEW'));

    res.json({ count: Number(countRes?.count || 0) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/admin/releases
 * List releases for moderation queue
 */
musicRouter.get('/admin/releases', requireAuth, requireStaff('MANAGE_MODERATION'), async (req: AuthRequest, res: Response) => {
  try {
    const statusParam = req.query.status ? String(req.query.status).toUpperCase() : 'PENDING_REVIEW';
    const typeParam = req.query.type ? String(req.query.type).toUpperCase() : null;

    const conditions = [eq(musicReleases.status, statusParam)];
    if (typeParam && ['SINGLE', 'EP', 'ALBUM'].includes(typeParam)) {
      conditions.push(eq(musicReleases.type, typeParam));
    }

    const releasesList = await db
      .select({
        id: musicReleases.id,
        artistId: musicReleases.artistId,
        title: musicReleases.title,
        slug: musicReleases.slug,
        type: musicReleases.type,
        description: musicReleases.description,
        cover: musicReleases.cover,
        releaseDate: musicReleases.releaseDate,
        status: musicReleases.status,
        rejectionReason: musicReleases.rejectionReason,
        createdAt: musicReleases.createdAt,
        updatedAt: musicReleases.updatedAt,
        stageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistAvatar: artistProfiles.avatar,
        artistUserId: artistProfiles.userId,
        username: users.username,
        tracksCount: sql<number>`(SELECT count(*) FROM music_tracks WHERE release_id = music_releases.id)`,
        hasExplicit: sql<boolean>`EXISTS (SELECT 1 FROM music_tracks WHERE release_id = music_releases.id AND explicit = true)`,
        totalDuration: sql<number>`COALESCE((SELECT SUM(duration) FROM music_tracks WHERE release_id = music_releases.id), 0)`,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .leftJoin(users, eq(artistProfiles.userId, users.id))
      .where(and(...conditions))
      .orderBy(asc(musicReleases.createdAt));

    res.json({ releases: releasesList });
  } catch (err: any) {
    console.error('Error fetching admin music releases queue:', err);
    res.status(500).json({ error: 'Не удалось загрузить очередь модерации' });
  }
});

/**
 * GET /api/music/admin/releases/:id
 * Get complete detail of release for admin inspection modal/view
 */
musicRouter.get('/admin/releases/:id', requireAuth, requireStaff('MANAGE_MODERATION'), async (req: AuthRequest, res: Response) => {
  try {
    const releaseId = parseInt(req.params.id, 10);
    if (isNaN(releaseId) || releaseId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID релиза' });
    }

    const found = await db
      .select({
        id: musicReleases.id,
        artistId: musicReleases.artistId,
        title: musicReleases.title,
        slug: musicReleases.slug,
        type: musicReleases.type,
        description: musicReleases.description,
        cover: musicReleases.cover,
        releaseDate: musicReleases.releaseDate,
        status: musicReleases.status,
        rejectionReason: musicReleases.rejectionReason,
        createdAt: musicReleases.createdAt,
        updatedAt: musicReleases.updatedAt,
        stageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistAvatar: artistProfiles.avatar,
        artistUserId: artistProfiles.userId,
        username: users.username,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .leftJoin(users, eq(artistProfiles.userId, users.id))
      .where(eq(musicReleases.id, releaseId))
      .limit(1);

    if (found.length === 0) {
      return res.status(404).json({ error: 'Релиз не найден' });
    }

    const release = found[0];

    const tracksList = await db
      .select()
      .from(musicTracks)
      .where(eq(musicTracks.releaseId, release.id))
      .orderBy(asc(musicTracks.trackNumber));

    const genreRows = await db
      .select({
        id: musicGenres.id,
        name: musicGenres.name,
        slug: musicGenres.slug,
      })
      .from(musicReleaseGenres)
      .innerJoin(musicGenres, eq(musicReleaseGenres.genreId, musicGenres.id))
      .where(eq(musicReleaseGenres.releaseId, release.id));

    res.json({
      release,
      tracks: tracksList,
      genres: genreRows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/music/admin/releases/:id/approve
 * Admin approve release (PENDING_REVIEW -> PUBLISHED)
 */
musicRouter.post('/admin/releases/:id/approve', requireAuth, requireStaff('MANAGE_MODERATION'), async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.dbUser!;
    const releaseId = parseInt(req.params.id, 10);
    if (isNaN(releaseId) || releaseId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID релиза' });
    }

    const found = await db
      .select({
        id: musicReleases.id,
        title: musicReleases.title,
        slug: musicReleases.slug,
        status: musicReleases.status,
        artistId: musicReleases.artistId,
        artistUserId: artistProfiles.userId,
        stageName: artistProfiles.stageName,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(eq(musicReleases.id, releaseId))
      .limit(1);

    if (found.length === 0) {
      return res.status(404).json({ error: 'Релиз не найден' });
    }

    const release = found[0];

    if (release.status !== 'PENDING_REVIEW') {
      return res.status(400).json({ error: `Одобрение невозможно: релиз находится в статусе «${release.status}»` });
    }

    const [updated] = await db
      .update(musicReleases)
      .set({
        status: 'PUBLISHED',
        rejectionReason: null,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(musicReleases.id, releaseId))
      .returning();

    // Notify musician
    if (release.artistUserId) {
      await notificationService.create({
        recipientUserId: release.artistUserId,
        type: 'NEW_RELEASE',
        title: '🎵 Релиз опубликован',
        body: `Ваш релиз «${release.title}» одобрен и опубликован на Dodik Tracker.`,
        link: `/music/release/${release.slug || release.id}`,
        entityType: 'MUSIC_RELEASE',
        entityId: String(release.id),
        actorUserId: admin.id,
      });
    }

    // Notify followers / subscribers of this artist
    try {
      const followers = await db
        .select({ userId: artistSubscriptions.userId })
        .from(artistSubscriptions)
        .where(eq(artistSubscriptions.artistId, release.artistId));

      for (const follower of followers) {
        await notificationService.create({
          recipientUserId: follower.userId,
          type: 'NEW_RELEASE',
          title: '🎵 Новый релиз любимого исполнителя',
          body: `Музыкант «${release.stageName}» выпустил новый релиз «${release.title}»!`,
          link: `/music/release/${release.slug || release.id}`,
          entityType: 'MUSIC_RELEASE',
          entityId: String(release.id),
          actorUserId: release.artistUserId || admin.id,
        });
      }
    } catch (followErr) {
      console.error('[ApproveRelease] Failed to notify artist followers:', followErr);
    }

    await logAdminAction({
      userId: admin.id,
      action: 'MUSIC_RELEASE_APPROVED',
      details: `Одобрен музыкальный релиз «${release.title}» (ID: ${release.id}, Исполнитель: ${release.stageName || 'ID:' + release.artistId})`,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: 'Релиз успешно одобрен и опубликован',
      release: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/music/admin/releases/:id/reject
 * Admin reject release (PENDING_REVIEW -> REJECTED)
 */
musicRouter.post('/admin/releases/:id/reject', requireAuth, requireStaff('MANAGE_MODERATION'), async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.dbUser!;
    const releaseId = parseInt(req.params.id, 10);
    const { rejectionReason } = req.body;

    if (isNaN(releaseId) || releaseId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID релиза' });
    }

    const reasonStr = rejectionReason ? String(rejectionReason).trim() : '';
    if (!reasonStr) {
      return res.status(400).json({ error: 'Причина отклонения обязательна' });
    }

    const found = await db
      .select({
        id: musicReleases.id,
        title: musicReleases.title,
        slug: musicReleases.slug,
        status: musicReleases.status,
        artistId: musicReleases.artistId,
        artistUserId: artistProfiles.userId,
        stageName: artistProfiles.stageName,
      })
      .from(musicReleases)
      .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(eq(musicReleases.id, releaseId))
      .limit(1);

    if (found.length === 0) {
      return res.status(404).json({ error: 'Релиз не найден' });
    }

    const release = found[0];

    if (release.status !== 'PENDING_REVIEW') {
      return res.status(400).json({ error: `Отклонение невозможно: релиз находится в статусе «${release.status}»` });
    }

    const [updated] = await db
      .update(musicReleases)
      .set({
        status: 'REJECTED',
        rejectionReason: reasonStr,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(musicReleases.id, releaseId))
      .returning();

    // Notify musician
    if (release.artistUserId) {
      await notificationService.create({
        recipientUserId: release.artistUserId,
        type: 'SYSTEM',
        title: '🎵 Релиз отклонён',
        body: `Релиз «${release.title}» требует изменений.\nПричина: ${reasonStr}`,
        link: '/music/studio',
        entityType: 'MUSIC_RELEASE',
        entityId: String(release.id),
        actorUserId: admin.id,
      });
    }

    await logAdminAction({
      userId: admin.id,
      action: 'MUSIC_RELEASE_REJECTED',
      details: `Отклонён музыкальный релиз «${release.title}» (ID: ${release.id}, Причина: ${reasonStr})`,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: 'Релиз отклонён',
      release: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// USER PLAYLISTS API
// ==========================================

/**
 * POST /api/music/playlists
 * Create a new user playlist
 */
musicRouter.post('/playlists', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { title, description, cover, visibility, isCollaborative } = req.body;

    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (!trimmedTitle || trimmedTitle.length < 1 || trimmedTitle.length > 100) {
      return res.status(400).json({ error: 'Название плейлиста обязательно и должно содержать от 1 до 100 символов' });
    }

    const trimmedDesc = typeof description === 'string' ? description.trim().slice(0, 1000) : null;
    const trimmedCover = typeof cover === 'string' && cover.trim().length > 0 ? cover.trim().slice(0, 500) : null;

    let validVisibility = 'PUBLIC';
    if (visibility && ['PUBLIC', 'UNLISTED', 'PRIVATE'].includes(visibility)) {
      validVisibility = visibility;
    }

    const [created] = await db
      .insert(musicPlaylists)
      .values({
        userId: user.id,
        title: trimmedTitle,
        description: trimmedDesc,
        cover: trimmedCover,
        visibility: validVisibility,
        isCollaborative: Boolean(isCollaborative),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json({
      success: true,
      message: 'Плейлист успешно создан',
      playlist: {
        ...created,
        tracksCount: 0,
        totalDuration: 0,
        isCollaborative: Boolean(created.isCollaborative),
        owner: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/playlists
 * Explore public playlists
 */
musicRouter.get('/playlists', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;
    const sort = String(req.query.sort || 'popular');
    const q = req.query.q ? String(req.query.q).trim() : '';

    const conditions = [
      eq(musicPlaylists.visibility, 'PUBLIC'),
    ];

    if (q) {
      conditions.push(
        or(
          ilike(musicPlaylists.title, `%${q}%`),
          ilike(musicPlaylists.description, `%${q}%`),
          ilike(users.username, `%${q}%`)
        )!
      );
    }

    const whereClause = and(...conditions);

    const [countRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicPlaylists)
      .innerJoin(users, eq(musicPlaylists.userId, users.id))
      .where(whereClause);

    const total = Number(countRes?.count || 0);

    let orderExpr = desc(musicPlaylists.createdAt);
    if (sort === 'title_asc') {
      orderExpr = asc(musicPlaylists.title);
    } else if (sort === 'updated') {
      orderExpr = desc(musicPlaylists.updatedAt);
    } else if (sort === 'tracks_count') {
      orderExpr = desc(sql`(SELECT count(*) FROM music_playlist_tracks WHERE playlist_id = music_playlists.id)`);
    } else if (sort === 'popular') {
      // Order by sum of listen counts of tracks in playlist or tracks count
      orderExpr = desc(sql`COALESCE((SELECT SUM(mt.listen_count) FROM music_playlist_tracks mpt JOIN music_tracks mt ON mpt.track_id = mt.id WHERE mpt.playlist_id = music_playlists.id), 0) + (SELECT count(*) FROM music_playlist_tracks WHERE playlist_id = music_playlists.id) * 10`);
    }

    const playlistRows = await db
      .select({
        id: musicPlaylists.id,
        userId: musicPlaylists.userId,
        title: musicPlaylists.title,
        description: musicPlaylists.description,
        cover: musicPlaylists.cover,
        visibility: musicPlaylists.visibility,
        createdAt: musicPlaylists.createdAt,
        updatedAt: musicPlaylists.updatedAt,
        username: users.username,
        userAvatar: users.avatar,
        tracksCount: sql<number>`(SELECT count(*)::int FROM music_playlist_tracks WHERE playlist_id = music_playlists.id)`,
        totalDuration: sql<number>`COALESCE((SELECT SUM(mt.duration)::int FROM music_playlist_tracks mpt JOIN music_tracks mt ON mpt.track_id = mt.id WHERE mpt.playlist_id = music_playlists.id), 0)`,
        firstTrackCover: sql<string | null>`(SELECT mr.cover FROM music_playlist_tracks mpt JOIN music_tracks mt ON mpt.track_id = mt.id JOIN music_releases mr ON mt.release_id = mr.id WHERE mpt.playlist_id = music_playlists.id ORDER BY mpt.position ASC LIMIT 1)`,
      })
      .from(musicPlaylists)
      .innerJoin(users, eq(musicPlaylists.userId, users.id))
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(limit)
      .offset(offset);

    const formatted = playlistRows.map((pl) => ({
      id: pl.id,
      userId: pl.userId,
      title: pl.title,
      description: pl.description,
      cover: pl.cover || pl.firstTrackCover,
      customCover: pl.cover,
      firstTrackCover: pl.firstTrackCover,
      visibility: pl.visibility,
      createdAt: pl.createdAt,
      updatedAt: pl.updatedAt,
      tracksCount: Number(pl.tracksCount || 0),
      totalDuration: Number(pl.totalDuration || 0),
      owner: {
        id: pl.userId,
        username: pl.username,
        avatar: pl.userAvatar,
      },
    }));

    res.json({
      playlists: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/playlists/my
 * User's own playlists (all visibilities)
 */
musicRouter.get('/playlists/my', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 30));
    const offset = (page - 1) * limit;
    const sort = String(req.query.sort || 'updated');
    const q = req.query.q ? String(req.query.q).trim() : '';

    const conditions = [
      eq(musicPlaylists.userId, user.id),
    ];

    if (q) {
      conditions.push(
        or(
          ilike(musicPlaylists.title, `%${q}%`),
          ilike(musicPlaylists.description, `%${q}%`)
        )!
      );
    }

    const whereClause = and(...conditions);

    const [countRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(musicPlaylists)
      .where(whereClause);

    const total = Number(countRes?.count || 0);

    let orderExpr = desc(musicPlaylists.updatedAt);
    if (sort === 'newest') {
      orderExpr = desc(musicPlaylists.createdAt);
    } else if (sort === 'title_asc') {
      orderExpr = asc(musicPlaylists.title);
    } else if (sort === 'tracks_count') {
      orderExpr = desc(sql`(SELECT count(*) FROM music_playlist_tracks WHERE playlist_id = music_playlists.id)`);
    }

    const playlistRows = await db
      .select({
        id: musicPlaylists.id,
        userId: musicPlaylists.userId,
        title: musicPlaylists.title,
        description: musicPlaylists.description,
        cover: musicPlaylists.cover,
        visibility: musicPlaylists.visibility,
        createdAt: musicPlaylists.createdAt,
        updatedAt: musicPlaylists.updatedAt,
        tracksCount: sql<number>`(SELECT count(*)::int FROM music_playlist_tracks WHERE playlist_id = music_playlists.id)`,
        totalDuration: sql<number>`COALESCE((SELECT SUM(mt.duration)::int FROM music_playlist_tracks mpt JOIN music_tracks mt ON mpt.track_id = mt.id WHERE mpt.playlist_id = music_playlists.id), 0)`,
        firstTrackCover: sql<string | null>`(SELECT mr.cover FROM music_playlist_tracks mpt JOIN music_tracks mt ON mpt.track_id = mt.id JOIN music_releases mr ON mt.release_id = mr.id WHERE mpt.playlist_id = music_playlists.id ORDER BY mpt.position ASC LIMIT 1)`,
      })
      .from(musicPlaylists)
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(limit)
      .offset(offset);

    const formatted = playlistRows.map((pl) => ({
      id: pl.id,
      userId: pl.userId,
      title: pl.title,
      description: pl.description,
      cover: pl.cover || pl.firstTrackCover,
      customCover: pl.cover,
      firstTrackCover: pl.firstTrackCover,
      visibility: pl.visibility,
      createdAt: pl.createdAt,
      updatedAt: pl.updatedAt,
      tracksCount: Number(pl.tracksCount || 0),
      totalDuration: Number(pl.totalDuration || 0),
      owner: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
      },
    }));

    res.json({
      playlists: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/playlists/my/for-track/:trackId
 * List of user's playlists (and collaborative playlists where user can add tracks)
 * indicating whether track is in each playlist
 */
musicRouter.get('/playlists/my/for-track/:trackId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const trackId = parseInt(req.params.trackId, 10);

    if (isNaN(trackId) || trackId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор трека' });
    }

    const playlistRows = await db
      .select({
        id: musicPlaylists.id,
        userId: musicPlaylists.userId,
        title: musicPlaylists.title,
        cover: musicPlaylists.cover,
        visibility: musicPlaylists.visibility,
        isCollaborative: musicPlaylists.isCollaborative,
        updatedAt: musicPlaylists.updatedAt,
        tracksCount: sql<number>`(SELECT count(*)::int FROM music_playlist_tracks WHERE playlist_id = music_playlists.id)`,
        containsTrack: sql<boolean>`EXISTS (SELECT 1 FROM music_playlist_tracks WHERE playlist_id = music_playlists.id AND track_id = ${trackId})`,
        firstTrackCover: sql<string | null>`(SELECT mr.cover FROM music_playlist_tracks mpt JOIN music_tracks mt ON mpt.track_id = mt.id JOIN music_releases mr ON mt.release_id = mr.id WHERE mpt.playlist_id = music_playlists.id ORDER BY mpt.position ASC LIMIT 1)`,
      })
      .from(musicPlaylists)
      .where(
        or(
          eq(musicPlaylists.userId, user.id),
          and(
            eq(musicPlaylists.isCollaborative, true),
            sql`EXISTS (SELECT 1 FROM music_playlist_members mpm WHERE mpm.playlist_id = music_playlists.id AND mpm.user_id = ${user.id} AND mpm.can_add_tracks = true)`
          )
        )
      )
      .orderBy(desc(musicPlaylists.updatedAt));

    const formatted = playlistRows.map((pl) => ({
      id: pl.id,
      title: pl.title,
      cover: pl.cover || pl.firstTrackCover,
      visibility: pl.visibility,
      isCollaborative: Boolean(pl.isCollaborative),
      isOwner: pl.userId === user.id,
      tracksCount: Number(pl.tracksCount || 0),
      containsTrack: Boolean(pl.containsTrack),
    }));

    res.json({ playlists: formatted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/user/:username/playlists
 * Public playlists created by a user
 */
musicRouter.get('/user/:username/playlists', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const username = req.params.username;
    if (!username) {
      return res.status(400).json({ error: 'Имя пользователя обязательно' });
    }

    const [targetUser] = await db
      .select({
        id: users.id,
        username: users.username,
        avatar: users.avatar,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const isSelf = req.dbUser?.id === targetUser.id;
    const isStaff = isStaffRole(req.dbUser?.role);

    const conditions = [eq(musicPlaylists.userId, targetUser.id)];
    if (!isSelf && !isStaff) {
      conditions.push(eq(musicPlaylists.visibility, 'PUBLIC'));
    }

    const playlistRows = await db
      .select({
        id: musicPlaylists.id,
        userId: musicPlaylists.userId,
        title: musicPlaylists.title,
        description: musicPlaylists.description,
        cover: musicPlaylists.cover,
        visibility: musicPlaylists.visibility,
        createdAt: musicPlaylists.createdAt,
        updatedAt: musicPlaylists.updatedAt,
        tracksCount: sql<number>`(SELECT count(*)::int FROM music_playlist_tracks WHERE playlist_id = music_playlists.id)`,
        totalDuration: sql<number>`COALESCE((SELECT SUM(mt.duration)::int FROM music_playlist_tracks mpt JOIN music_tracks mt ON mpt.track_id = mt.id WHERE mpt.playlist_id = music_playlists.id), 0)`,
        firstTrackCover: sql<string | null>`(SELECT mr.cover FROM music_playlist_tracks mpt JOIN music_tracks mt ON mpt.track_id = mt.id JOIN music_releases mr ON mt.release_id = mr.id WHERE mpt.playlist_id = music_playlists.id ORDER BY mpt.position ASC LIMIT 1)`,
      })
      .from(musicPlaylists)
      .where(and(...conditions))
      .orderBy(desc(musicPlaylists.updatedAt));

    const formatted = playlistRows.map((pl) => ({
      id: pl.id,
      userId: pl.userId,
      title: pl.title,
      description: pl.description,
      cover: pl.cover || pl.firstTrackCover,
      customCover: pl.cover,
      firstTrackCover: pl.firstTrackCover,
      visibility: pl.visibility,
      createdAt: pl.createdAt,
      updatedAt: pl.updatedAt,
      tracksCount: Number(pl.tracksCount || 0),
      totalDuration: Number(pl.totalDuration || 0),
      owner: targetUser,
    }));

    res.json({
      playlists: formatted,
      user: targetUser,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/playlists/:id
 * Single playlist view with all tracks, collaboration info and member details
 */
musicRouter.get('/playlists/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const playlistId = parseInt(req.params.id, 10);
    if (isNaN(playlistId) || playlistId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор плейлиста' });
    }

    const [playlistRow] = await db
      .select({
        id: musicPlaylists.id,
        userId: musicPlaylists.userId,
        title: musicPlaylists.title,
        description: musicPlaylists.description,
        cover: musicPlaylists.cover,
        visibility: musicPlaylists.visibility,
        isCollaborative: musicPlaylists.isCollaborative,
        createdAt: musicPlaylists.createdAt,
        updatedAt: musicPlaylists.updatedAt,
        ownerUsername: users.username,
        ownerAvatar: users.avatar,
      })
      .from(musicPlaylists)
      .innerJoin(users, eq(musicPlaylists.userId, users.id))
      .where(eq(musicPlaylists.id, playlistId))
      .limit(1);

    if (!playlistRow) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }

    const isOwner = Boolean(req.dbUser && req.dbUser.id === playlistRow.userId);
    const isStaff = isStaffRole(req.dbUser?.role);

    // Fetch members
    const membersRows = await db
      .select({
        id: musicPlaylistMembers.id,
        userId: users.id,
        username: users.username,
        displayName: users.username,
        avatar: users.avatar,
        role: musicPlaylistMembers.role,
        canAddTracks: musicPlaylistMembers.canAddTracks,
        canRemoveTracks: musicPlaylistMembers.canRemoveTracks,
        addedAt: musicPlaylistMembers.addedAt,
      })
      .from(musicPlaylistMembers)
      .innerJoin(users, eq(musicPlaylistMembers.userId, users.id))
      .where(eq(musicPlaylistMembers.playlistId, playlistId))
      .orderBy(asc(musicPlaylistMembers.addedAt));

    const currentMember = req.dbUser ? membersRows.find((m) => m.userId === req.dbUser!.id) : null;
    const isCollaborator = isOwner || Boolean(currentMember) || (Boolean(playlistRow.isCollaborative) && Boolean(req.dbUser));

    // Permission check for PRIVATE playlist
    if (playlistRow.visibility === 'PRIVATE' && !isOwner && !isStaff && !currentMember) {
      return res.status(403).json({ error: 'Этот плейлист приватный и доступен только его владельцу и участникам' });
    }

    // Permissions summary
    const canAddTracks = isOwner || isStaff || (Boolean(playlistRow.isCollaborative) && (!currentMember || currentMember.canAddTracks));
    const canRemoveTracks = isOwner || isStaff || Boolean(currentMember?.canRemoveTracks);
    const canManageSettings = isOwner || isStaff;
    const canManageMembers = isOwner || isStaff;

    // Fetch playlist tracks with addedBy user info
    const rawTracks = await db
      .select({
        junctionId: musicPlaylistTracks.id,
        position: musicPlaylistTracks.position,
        addedAt: musicPlaylistTracks.addedAt,
        addedByUserId: musicPlaylistTracks.addedByUserId,
        id: musicTracks.id,
        releaseId: musicTracks.releaseId,
        artistId: musicTracks.artistId,
        title: musicTracks.title,
        slug: musicTracks.slug,
        trackNumber: musicTracks.trackNumber,
        audioFile: musicTracks.audioFile,
        duration: musicTracks.duration,
        explicit: musicTracks.explicit,
        lyrics: musicTracks.lyrics,
        authorNote: musicTracks.authorNote,
        listenCount: musicTracks.listenCount,
        releaseTitle: musicReleases.title,
        releaseCover: musicReleases.cover,
        releaseSlug: musicReleases.slug,
        releaseType: musicReleases.type,
        releaseStatus: musicReleases.status,
        artistName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
      })
      .from(musicPlaylistTracks)
      .innerJoin(musicTracks, eq(musicPlaylistTracks.trackId, musicTracks.id))
      .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
      .innerJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
      .where(
        and(
          eq(musicPlaylistTracks.playlistId, playlistId),
          (isOwner || isStaff) ? undefined : eq(musicReleases.status, 'PUBLISHED')
        )
      )
      .orderBy(asc(musicPlaylistTracks.position), asc(musicPlaylistTracks.addedAt));

    // Fetch user details for addedBy users
    const addedByUserIds = Array.from(new Set(rawTracks.map((r) => r.addedByUserId).filter(Boolean))) as number[];
    let addedUsersMap = new Map<number, { id: number; username: string; avatar: string | null }>();
    if (addedByUserIds.length > 0) {
      const addedUserRecords = await db
        .select({ id: users.id, username: users.username, avatar: users.avatar })
        .from(users)
        .where(inArray(users.id, addedByUserIds));
      addedUsersMap = new Map(addedUserRecords.map((u) => [u.id, u]));
    }

    // Check favorite status for tracks if logged in
    let favoriteTrackIds = new Set<number>();
    if (req.dbUser) {
      const favRows = await db
        .select({ trackId: musicFavoriteTracks.trackId })
        .from(musicFavoriteTracks)
        .where(eq(musicFavoriteTracks.userId, req.dbUser.id));
      favoriteTrackIds = new Set(favRows.map((r) => r.trackId));
    }

    const tracks = rawTracks.map((tr) => {
      const addedByUser = tr.addedByUserId ? addedUsersMap.get(tr.addedByUserId) : null;
      const canDeleteThisTrack = isOwner || isStaff || (Boolean(playlistRow.isCollaborative) && tr.addedByUserId === req.dbUser?.id);

      return {
        id: tr.id,
        junctionId: tr.junctionId,
        position: tr.position,
        addedAt: tr.addedAt,
        releaseId: tr.releaseId,
        artistId: tr.artistId,
        title: tr.title,
        slug: tr.slug,
        trackNumber: tr.trackNumber,
        audioFile: tr.audioFile,
        duration: tr.duration,
        explicit: tr.explicit,
        lyrics: tr.lyrics,
        authorNote: tr.authorNote,
        listenCount: tr.listenCount,
        releaseTitle: tr.releaseTitle,
        releaseCover: tr.releaseCover,
        releaseSlug: tr.releaseSlug,
        releaseType: tr.releaseType,
        artistName: tr.artistName,
        artistSlug: tr.artistSlug,
        isFavorite: favoriteTrackIds.has(tr.id),
        addedBy: addedByUser
          ? {
              id: addedByUser.id,
              username: addedByUser.username,
              avatar: addedByUser.avatar,
            }
          : tr.addedByUserId === playlistRow.userId
          ? {
              id: playlistRow.userId,
              username: playlistRow.ownerUsername,
              avatar: playlistRow.ownerAvatar,
            }
          : null,
        canRemove: canDeleteThisTrack,
      };
    });

    const totalDuration = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    const firstTrackCover = tracks.length > 0 ? tracks[0].releaseCover : null;

    res.json({
      playlist: {
        id: playlistRow.id,
        userId: playlistRow.userId,
        title: playlistRow.title,
        description: playlistRow.description,
        cover: playlistRow.cover || firstTrackCover,
        customCover: playlistRow.cover,
        firstTrackCover,
        visibility: playlistRow.visibility,
        isCollaborative: Boolean(playlistRow.isCollaborative),
        createdAt: playlistRow.createdAt,
        updatedAt: playlistRow.updatedAt,
        tracksCount: tracks.length,
        totalDuration,
        owner: {
          id: playlistRow.userId,
          username: playlistRow.ownerUsername,
          avatar: playlistRow.ownerAvatar,
        },
        members: membersRows,
      },
      tracks,
      isOwner,
      isCollaborator,
      canAddTracks,
      canRemoveTracks,
      canManageSettings,
      canManageMembers,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/music/playlists/:id
 * PATCH /api/music/playlists/:id
 * Update playlist details and collaboration settings
 */
const updatePlaylistHandler = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const playlistId = parseInt(req.params.id, 10);

    if (isNaN(playlistId) || playlistId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор плейлиста' });
    }

    const [existing] = await db
      .select()
      .from(musicPlaylists)
      .where(eq(musicPlaylists.id, playlistId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }

    if (existing.userId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'У вас нет прав для изменения этого плейлиста' });
    }

    const { title, description, cover, visibility, isCollaborative } = req.body;

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (title !== undefined) {
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle || trimmedTitle.length < 1 || trimmedTitle.length > 100) {
        return res.status(400).json({ error: 'Название плейлиста обязательно и должно содержать от 1 до 100 символов' });
      }
      updateData.title = trimmedTitle;
    }

    if (description !== undefined) {
      updateData.description = typeof description === 'string' && description.trim().length > 0 ? description.trim().slice(0, 1000) : null;
    }

    if (cover !== undefined) {
      updateData.cover = typeof cover === 'string' && cover.trim().length > 0 ? cover.trim().slice(0, 500) : null;
    }

    if (visibility !== undefined) {
      if (!['PUBLIC', 'UNLISTED', 'PRIVATE'].includes(visibility)) {
        return res.status(400).json({ error: 'Некорректный уровень приватности (PUBLIC, UNLISTED, PRIVATE)' });
      }
      updateData.visibility = visibility;
    }

    if (isCollaborative !== undefined) {
      updateData.isCollaborative = Boolean(isCollaborative);
    }

    const [updated] = await db
      .update(musicPlaylists)
      .set(updateData)
      .where(eq(musicPlaylists.id, playlistId))
      .returning();

    res.json({
      success: true,
      message: 'Плейлист успешно обновлён',
      playlist: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

musicRouter.put('/playlists/:id', requireAuth, updatePlaylistHandler);
musicRouter.patch('/playlists/:id', requireAuth, updatePlaylistHandler);

/**
 * DELETE /api/music/playlists/:id
 * Delete playlist
 */
musicRouter.delete('/playlists/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const playlistId = parseInt(req.params.id, 10);

    if (isNaN(playlistId) || playlistId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор плейлиста' });
    }

    const [existing] = await db
      .select()
      .from(musicPlaylists)
      .where(eq(musicPlaylists.id, playlistId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }

    if (existing.userId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'У вас нет прав для удаления этого плейлиста' });
    }

    await db.delete(musicPlaylists).where(eq(musicPlaylists.id, playlistId));

    res.json({
      success: true,
      message: 'Плейлист успешно удалён',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/music/playlists/:id/tracks
 * Add track to playlist (supports collaborative playlists)
 */
musicRouter.post('/playlists/:id/tracks', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const playlistId = parseInt(req.params.id, 10);
    const { trackId } = req.body;

    const numericTrackId = parseInt(String(trackId), 10);

    if (isNaN(playlistId) || playlistId <= 0 || isNaN(numericTrackId) || numericTrackId <= 0) {
      return res.status(400).json({ error: 'Неверные параметры запроса' });
    }

    const [playlist] = await db
      .select()
      .from(musicPlaylists)
      .where(eq(musicPlaylists.id, playlistId))
      .limit(1);

    if (!playlist) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }

    const isOwner = playlist.userId === user.id;
    const isStaff = isStaffRole(user.role);

    // Permission check for collaboration
    let canAdd = isOwner || isStaff;
    if (!canAdd && playlist.isCollaborative) {
      // Check if user is an existing member with canAddTracks permission
      const [member] = await db
        .select()
        .from(musicPlaylistMembers)
        .where(
          and(
            eq(musicPlaylistMembers.playlistId, playlistId),
            eq(musicPlaylistMembers.userId, user.id)
          )
        )
        .limit(1);

      if (member) {
        canAdd = member.canAddTracks;
      } else {
        // If collaborative playlist allows participants to add, user can add
        canAdd = true;
      }
    }

    if (!canAdd) {
      return res.status(403).json({ error: 'У вас нет прав на добавление треков в этот плейлист' });
    }

    // Verify track exists
    const [track] = await db
      .select({
        id: musicTracks.id,
        title: musicTracks.title,
        releaseStatus: musicReleases.status,
      })
      .from(musicTracks)
      .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
      .where(eq(musicTracks.id, numericTrackId))
      .limit(1);

    if (!track) {
      return res.status(404).json({ error: 'Трек не найден в каталоге' });
    }

    // Check if track is already in playlist
    const [existingTrackInPlaylist] = await db
      .select({ id: musicPlaylistTracks.id })
      .from(musicPlaylistTracks)
      .where(
        and(
          eq(musicPlaylistTracks.playlistId, playlistId),
          eq(musicPlaylistTracks.trackId, numericTrackId)
        )
      )
      .limit(1);

    if (existingTrackInPlaylist) {
      return res.json({
        success: true,
        alreadyExists: true,
        message: `Трек «${track.title}» уже находится в этом плейлисте`,
      });
    }

    // If collaborative and user is not yet recorded as a member, record them
    if (playlist.isCollaborative && !isOwner) {
      await db
        .insert(musicPlaylistMembers)
        .values({
          playlistId,
          userId: user.id,
          role: 'COLLABORATOR',
          canAddTracks: true,
          canRemoveTracks: false,
        })
        .onConflictDoNothing();
    }

    // Get max position in playlist
    const [maxPosRes] = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(position), 0)` })
      .from(musicPlaylistTracks)
      .where(eq(musicPlaylistTracks.playlistId, playlistId));

    const nextPos = Number(maxPosRes?.maxPos || 0) + 1;

    await db.insert(musicPlaylistTracks).values({
      playlistId,
      trackId: numericTrackId,
      addedByUserId: user.id,
      position: nextPos,
      addedAt: new Date(),
    });

    await db
      .update(musicPlaylists)
      .set({ updatedAt: new Date() })
      .where(eq(musicPlaylists.id, playlistId));

    // Send notification to playlist owner if added by a collaborator
    if (playlist.userId !== user.id) {
      try {
        await notificationService.create({
          recipientUserId: playlist.userId,
          actorUserId: user.id,
          type: 'CONTENT_SHARED',
          title: 'Новый трек в плейлисте',
          body: `${user.username} добавил(а) «${track.title}» в плейлист «${playlist.title}»`,
          entityType: 'MUSIC_PLAYLIST',
          entityId: String(playlist.id),
          link: `/music/playlist/${playlist.id}`,
          dedupKey: `playlist_track_add:${playlist.id}:${user.id}:${numericTrackId}`,
        });
      } catch (err) {
        console.warn('Notification send failed for playlist track addition:', err);
      }
    }

    res.json({
      success: true,
      message: `Трек «${track.title}» добавлен в плейлист «${playlist.title}»`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/music/playlists/:id/tracks/:trackId
 * Remove track from playlist (supports owner and author of track addition)
 */
musicRouter.delete('/playlists/:id/tracks/:trackId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const playlistId = parseInt(req.params.id, 10);
    const trackId = parseInt(req.params.trackId, 10);

    if (isNaN(playlistId) || playlistId <= 0 || isNaN(trackId) || trackId <= 0) {
      return res.status(400).json({ error: 'Неверные параметры запроса' });
    }

    const [playlist] = await db
      .select()
      .from(musicPlaylists)
      .where(eq(musicPlaylists.id, playlistId))
      .limit(1);

    if (!playlist) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }

    const [trackEntry] = await db
      .select()
      .from(musicPlaylistTracks)
      .where(
        and(
          eq(musicPlaylistTracks.playlistId, playlistId),
          eq(musicPlaylistTracks.trackId, trackId)
        )
      )
      .limit(1);

    if (!trackEntry) {
      return res.status(404).json({ error: 'Трек не найден в этом плейлисте' });
    }

    const isOwner = playlist.userId === user.id;
    const isStaff = isStaffRole(user.role);
    const isAddedByMe = trackEntry.addedByUserId === user.id;

    // Check permission
    let canRemove = isOwner || isStaff;
    if (!canRemove && playlist.isCollaborative && isAddedByMe) {
      canRemove = true;
    }

    if (!canRemove) {
      return res.status(403).json({ error: 'У вас нет прав на удаление этого трека из плейлиста' });
    }

    await db
      .delete(musicPlaylistTracks)
      .where(
        and(
          eq(musicPlaylistTracks.playlistId, playlistId),
          eq(musicPlaylistTracks.trackId, trackId)
        )
      );

    await db
      .update(musicPlaylists)
      .set({ updatedAt: new Date() })
      .where(eq(musicPlaylists.id, playlistId));

    res.json({
      success: true,
      message: 'Трек удалён из плейлиста',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/music/playlists/:id/members
 * List members of a collaborative playlist
 */
musicRouter.get('/playlists/:id/members', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const playlistId = parseInt(req.params.id, 10);
    if (isNaN(playlistId) || playlistId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор плейлиста' });
    }

    const [playlist] = await db
      .select()
      .from(musicPlaylists)
      .where(eq(musicPlaylists.id, playlistId))
      .limit(1);

    if (!playlist) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }

    const members = await db
      .select({
        id: musicPlaylistMembers.id,
        userId: users.id,
        username: users.username,
        avatar: users.avatar,
        role: musicPlaylistMembers.role,
        canAddTracks: musicPlaylistMembers.canAddTracks,
        canRemoveTracks: musicPlaylistMembers.canRemoveTracks,
        addedAt: musicPlaylistMembers.addedAt,
      })
      .from(musicPlaylistMembers)
      .innerJoin(users, eq(musicPlaylistMembers.userId, users.id))
      .where(eq(musicPlaylistMembers.playlistId, playlistId))
      .orderBy(asc(musicPlaylistMembers.addedAt));

    res.json({ members });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/music/playlists/:id/members
 * Add collaborator/member to playlist (Owner only)
 */
musicRouter.post('/playlists/:id/members', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const playlistId = parseInt(req.params.id, 10);
    const { userId, username, role, canAddTracks, canRemoveTracks } = req.body;

    if (isNaN(playlistId) || playlistId <= 0) {
      return res.status(400).json({ error: 'Неверный идентификатор плейлиста' });
    }

    const [playlist] = await db
      .select()
      .from(musicPlaylists)
      .where(eq(musicPlaylists.id, playlistId))
      .limit(1);

    if (!playlist) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }

    if (playlist.userId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'Только владелец плейлиста может управлять участниками' });
    }

    // Resolve target user
    let targetUserId = typeof userId === 'number' ? userId : parseInt(String(userId), 10);
    if ((isNaN(targetUserId) || targetUserId <= 0) && username) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(ilike(users.username, username.trim()))
        .limit(1);
      if (u) targetUserId = u.id;
    }

    if (isNaN(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }

    if (targetUserId === playlist.userId) {
      return res.status(400).json({ error: 'Владелец уже является главным участником плейлиста' });
    }

    // Upsert member
    const [existingMember] = await db
      .select()
      .from(musicPlaylistMembers)
      .where(
        and(
          eq(musicPlaylistMembers.playlistId, playlistId),
          eq(musicPlaylistMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (existingMember) {
      await db
        .update(musicPlaylistMembers)
        .set({
          role: role || existingMember.role,
          canAddTracks: canAddTracks !== undefined ? Boolean(canAddTracks) : existingMember.canAddTracks,
          canRemoveTracks: canRemoveTracks !== undefined ? Boolean(canRemoveTracks) : existingMember.canRemoveTracks,
        })
        .where(eq(musicPlaylistMembers.id, existingMember.id));
    } else {
      await db.insert(musicPlaylistMembers).values({
        playlistId,
        userId: targetUserId,
        role: role || 'COLLABORATOR',
        canAddTracks: canAddTracks !== undefined ? Boolean(canAddTracks) : true,
        canRemoveTracks: canRemoveTracks !== undefined ? Boolean(canRemoveTracks) : false,
      });
    }

    // Ensure playlist is marked collaborative
    if (!playlist.isCollaborative) {
      await db
        .update(musicPlaylists)
        .set({ isCollaborative: true })
        .where(eq(musicPlaylists.id, playlistId));
    }

    // Send notification
    try {
      await notificationService.create({
        recipientUserId: targetUserId,
        actorUserId: user.id,
        type: 'CONTENT_SHARED',
        title: 'Приглашение в плейлист',
        body: `${user.username} добавил(а) вас в совместный плейлист «${playlist.title}»`,
        entityType: 'MUSIC_PLAYLIST',
        entityId: String(playlist.id),
        link: `/music/playlist/${playlist.id}`,
      });
    } catch (e) {
      console.warn('Failed to send playlist member invite notification:', e);
    }

    res.json({ success: true, message: 'Участник успешно добавлен' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/music/playlists/:id/members/:userId
 * Update member permissions or role (Owner only)
 */
musicRouter.put('/playlists/:id/members/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const playlistId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);

    if (isNaN(playlistId) || playlistId <= 0 || isNaN(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Неверные параметры запроса' });
    }

    const [playlist] = await db
      .select()
      .from(musicPlaylists)
      .where(eq(musicPlaylists.id, playlistId))
      .limit(1);

    if (!playlist) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }

    if (playlist.userId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'Только владелец плейлиста может изменять права участников' });
    }

    const { role, canAddTracks, canRemoveTracks } = req.body;

    const [member] = await db
      .select()
      .from(musicPlaylistMembers)
      .where(
        and(
          eq(musicPlaylistMembers.playlistId, playlistId),
          eq(musicPlaylistMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (!member) {
      return res.status(404).json({ error: 'Участник не найден в этом плейлисте' });
    }

    const updateFields: Record<string, any> = {};
    if (role !== undefined) updateFields.role = role;
    if (canAddTracks !== undefined) updateFields.canAddTracks = Boolean(canAddTracks);
    if (canRemoveTracks !== undefined) updateFields.canRemoveTracks = Boolean(canRemoveTracks);

    const [updated] = await db
      .update(musicPlaylistMembers)
      .set(updateFields)
      .where(eq(musicPlaylistMembers.id, member.id))
      .returning();

    res.json({ success: true, message: 'Права участника обновлены', member: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/music/playlists/:id/members/:userId
 * Remove collaborator from playlist (Owner can remove any, Member can leave)
 */
musicRouter.delete('/playlists/:id/members/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const playlistId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);

    if (isNaN(playlistId) || playlistId <= 0 || isNaN(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Неверные параметры запроса' });
    }

    const [playlist] = await db
      .select()
      .from(musicPlaylists)
      .where(eq(musicPlaylists.id, playlistId))
      .limit(1);

    if (!playlist) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }

    const isOwner = playlist.userId === user.id;
    const isStaff = isStaffRole(user.role);
    const isSelfLeaving = user.id === targetUserId;

    if (!isOwner && !isStaff && !isSelfLeaving) {
      return res.status(403).json({ error: 'У вас нет прав на удаление этого участника' });
    }

    await db
      .delete(musicPlaylistMembers)
      .where(
        and(
          eq(musicPlaylistMembers.playlistId, playlistId),
          eq(musicPlaylistMembers.userId, targetUserId)
        )
      );

    res.json({ success: true, message: isSelfLeaving ? 'Вы покинули плейлист' : 'Участник удалён' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/music/playlists/:id/reorder
 * Reorder tracks in playlist
 */
musicRouter.put('/playlists/:id/reorder', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const playlistId = parseInt(req.params.id, 10);
    const { trackIds } = req.body;

    if (isNaN(playlistId) || playlistId <= 0 || !Array.isArray(trackIds)) {
      return res.status(400).json({ error: 'Неверные параметры запроса' });
    }

    const [playlist] = await db
      .select()
      .from(musicPlaylists)
      .where(eq(musicPlaylists.id, playlistId))
      .limit(1);

    if (!playlist) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }

    if (playlist.userId !== user.id && !isStaffRole(user.role)) {
      return res.status(403).json({ error: 'У вас нет прав на редактирование этого плейлиста' });
    }

    // Update positions sequentially
    for (let i = 0; i < trackIds.length; i++) {
      const tid = parseInt(trackIds[i], 10);
      if (!isNaN(tid)) {
        await db
          .update(musicPlaylistTracks)
          .set({ position: i + 1 })
          .where(
            and(
              eq(musicPlaylistTracks.playlistId, playlistId),
              eq(musicPlaylistTracks.trackId, tid)
            )
          );
      }
    }

    await db
      .update(musicPlaylists)
      .set({ updatedAt: new Date() })
      .where(eq(musicPlaylists.id, playlistId));

    res.json({
      success: true,
      message: 'Порядок треков обновлён',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 12. EXTERNAL MUSIC SEARCH & LYRICS
// ==========================================

/**
 * GET /api/music/tracks/:trackId/lyrics
 * Fetch lyrics for internal or external track
 */
musicRouter.get('/tracks/:trackId/lyrics', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rawId = String(req.params.trackId).trim();
    if (!rawId) {
      return res.status(400).json({ error: 'Идентификатор трека обязателен' });
    }

    // Check if numeric (internal Dodik track)
    const numId = Number(rawId);
    if (!isNaN(numId) && numId > 0 && !rawId.startsWith('yt_')) {
      const lyrics = await lyricsService.getInternalTrackLyrics(numId);
      return res.json({ trackId: numId, lyrics });
    }

    // External track ID
    const providerTrackId = rawId.replace(/^yt_/, '');
    const title = req.query.title ? String(req.query.title) : undefined;
    const artist = req.query.artist ? String(req.query.artist) : undefined;

    const preferredProvider = req.dbUser?.musicLyricsProvider || 'auto';

    const lyrics = await lyricsService.getExternalTrackLyrics(
      providerTrackId, 
      title, 
      artist, 
      null, 
      null, 
      preferredProvider
    );
    return res.json({ trackId: rawId, lyrics });
  } catch (err: any) {
    console.error('[MusicRouter] Fetch lyrics error:', err);
    res.status(500).json({ error: 'Не удалось загрузить текст песни' });
  }
});

/**
 * GET /api/music/tracks/:trackId/genius
 * Fetch Genius Track Insights (description, annotations, credits, primary artist info)
 */
musicRouter.get('/tracks/:trackId/genius', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rawId = String(req.params.trackId).trim();
    if (!rawId) {
      return res.status(400).json({ error: 'Идентификатор трека обязателен' });
    }

    let title = req.query.title ? String(req.query.title).trim() : '';
    let artist = req.query.artist ? String(req.query.artist).trim() : '';
    let album = req.query.album ? String(req.query.album).trim() : undefined;

    // If internal Dodik numeric ID and title/artist missing, load from DB
    const numId = Number(rawId);
    if (!isNaN(numId) && numId > 0 && !rawId.startsWith('yt_')) {
      if (!title || !artist) {
        const [track] = await db
          .select({
            title: musicTracks.title,
            artistName: artistProfiles.stageName,
            releaseTitle: musicReleases.title,
          })
          .from(musicTracks)
          .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
          .innerJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
          .where(eq(musicTracks.id, numId))
          .limit(1);

        if (track) {
          title = title || track.title;
          artist = artist || track.artistName;
          album = album || track.releaseTitle;
        }
      }
    } else if (rawId.startsWith('yt_') && (!title || !artist)) {
      // Fetch details from YouTube if not provided
      const cleanYtId = rawId.replace(/^yt_/, '');
      const details = await youtubeMusicProvider.getTrackDetails(cleanYtId);
      if (details) {
        title = title || details.title;
        artist = artist || details.artist;
        album = album || details.album || undefined;
      }
    }

    if (!title) {
      return res.json({ trackId: rawId, genius: null, configured: true, message: 'Недостаточно информации о треке' });
    }

    const rawApiKey = externalMusicConfig.getApiKey('genius');
    const isConfigured = Boolean(rawApiKey && rawApiKey.trim().length > 0);

    // Safe diagnostic log without printing token
    console.log(`[MusicRouter] Fetching Genius insights for "${title}" by "${artist}". Genius configured: ${isConfigured}`);

    if (!isConfigured) {
      console.warn('[MusicRouter] GENIUS_NOT_CONFIGURED: Access Token for Genius API is missing.');
      return res.json({
        trackId: rawId,
        genius: null,
        configured: false,
        message: 'GENIUS_NOT_CONFIGURED',
      });
    }

    const artists = artist ? artist.split(/[,/&]| feat\.? | ft\.? /i).map((a) => a.trim()).filter(Boolean) : [];
    if (artist && !artists.includes(artist)) {
      artists.unshift(artist);
    }

    const genius = await geniusProvider.getTrackInsights({
      title,
      artists,
      album,
    });

    return res.json({
      trackId: rawId,
      genius: genius || null,
      configured: true,
      message: genius ? undefined : 'Информация Genius пока недоступна',
    });
  } catch (err: any) {
    console.error('[MusicRouter] Fetch genius insights error:', err);
    return res.status(500).json({ error: 'Не удалось загрузить информацию Genius' });
  }
});

/**
 * GET /api/music/external/youtube/search
 * External YouTube Music song search.
 * Returns normalized YouTubeTrackDTO[] without creating DB records or downloading tracks.
 */
musicRouter.get('/external/youtube/search', youtubeSearchLimiter, async (req: any, res: Response) => {
  try {
    const q = req.query.q;
    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.status(400).json({ error: 'Поисковый запрос обязателен и не может быть пустым' });
    }

    if (q.trim().length > 200) {
      return res.status(400).json({ error: 'Поисковый запрос слишком длинный (максимум 200 символов)' });
    }

    const rawLimit = req.query.limit !== undefined ? parseInt(req.query.limit as string, 10) : 10;
    const limit = isNaN(rawLimit) ? 10 : Math.min(20, Math.max(1, rawLimit));

    const results = await youtubeMusicService.searchSongs(q, limit);
    return res.json(results);
  } catch (err: any) {
    console.error('[MusicRouter] External YouTube search error:', err);
    const status = err.status && typeof err.status === 'number' ? err.status : 500;
    const message = err.status === 400
      ? err.message
      : 'Не удалось выполнить поиск в YouTube Music. Попробуйте позже.';
    return res.status(status).json({ error: message });
  }
});

/**
 * GET /api/music/external/search
 * External music catalog search (YouTube Music).
 */
musicRouter.get('/external/search', async (req: any, res: Response) => {
  try {
    const q = req.query.q;
    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.status(400).json({ error: 'Поисковый запрос обязателен' });
    }

    const rawLimit = req.query.limit !== undefined ? parseInt(req.query.limit as string, 10) : 10;
    const limit = isNaN(rawLimit) ? 10 : Math.min(20, Math.max(1, rawLimit));

    const results: any[] = [];

    // Search YouTube Music if enabled
    if (externalMusicConfig.isCatalogEnabled('youtube')) {
      try {
        const ytResults = await youtubeMusicProvider.searchTracks(q, { limit });
        results.push(...ytResults);
      } catch (e) {
        console.warn('[MusicRouter] YouTube search failed in unified search:', e);
      }
    }

    return res.json(results);
  } catch (err: any) {
    console.error('[MusicRouter] Unified external search error:', err);
    return res.status(500).json({ error: 'Ошибка выполнения внешнего поиска' });
  }
});

/**
 * GET /api/music/recommendations/for-you
 * Personal recommendations endpoint supporting limit and cursor pagination.
 */
musicRouter.get('/recommendations/for-you', optionalAuth, async (req: any, res: Response) => {
  try {
    const userId = req.dbUser ? req.dbUser.id : null;
    const limit = parseInt(req.query.limit as string, 10) || 12;
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const refresh = req.query.refresh === 'true' || req.query.refresh === '1';

    const result = await musicRecommendationService.getPersonalizedForYou(userId, { limit, cursor, refresh });
    return res.json(result);
  } catch (err: any) {
    console.error('[MusicRouter] /recommendations/for-you error:', err);
    return res.status(500).json({ error: 'Не удалось загрузить персональные рекомендации' });
  }
});

/**
 * GET /api/music/recommendations
 * Personalized recommendations system based on user history and affinity signals.
 */
musicRouter.get('/recommendations', optionalAuth, async (req: any, res: Response) => {
  try {
    const userId = req.dbUser ? req.dbUser.id : null;
    const recommendations = await musicRecommendationService.getRecommendationsForUser(userId);
    return res.json(recommendations);
  } catch (err: any) {
    console.error('[MusicRouter] Recommendations error:', err);
    return res.status(500).json({ error: 'Не удалось сгенерировать рекомендации' });
  }
});

/**
 * GET /api/music/recommendations/similar/:trackId
 * Get similar tracks for a specific track ID.
 */
musicRouter.get('/recommendations/similar/:trackId', async (req: any, res: Response) => {
  try {
    const { trackId } = req.params;
    const artist = req.query.artist ? String(req.query.artist) : undefined;
    const title = req.query.title ? String(req.query.title) : undefined;

    const similar = await musicRecommendationService.getSimilarTracksForTrack(trackId, artist, title);
    return res.json({ tracks: similar });
  } catch (err: any) {
    console.error('[MusicRouter] Similar tracks error:', err);
    return res.status(500).json({ error: 'Не удалось загрузить похожие треки' });
  }
});

/**
 * POST /api/music/history
 * Record playback event in user_music_history table.
 */
musicRouter.post('/history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    const { trackId, provider, title, artistName, artistId, releaseTitle, releaseCover, durationSeconds } = req.body;

    if (!trackId || !title || !artistName) {
      return res.status(400).json({ error: 'Необходимы параметры trackId, title, artistName' });
    }

    await db.insert(userMusicHistory).values({
      userId,
      trackId: String(trackId),
      provider: provider || 'dodik',
      title,
      artistName,
      artistId: artistId ? String(artistId) : null,
      releaseTitle: releaseTitle || null,
      releaseCover: releaseCover || null,
      durationSeconds: durationSeconds ? parseInt(String(durationSeconds), 10) : null,
      listenedAt: new Date(),
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[MusicRouter] History record error:', err);
    return res.status(500).json({ error: 'Не удалось сохранить историю' });
  }
});

/**
 * GET /api/music/external/artist/:provider/:artistId
 * Fetch YouTube Music external artist full profile with categorized discography, popular tracks, and similar artists.
 */
musicRouter.get('/external/artist/:provider/:artistId', optionalAuth, async (req: any, res: Response) => {
  try {
    const { provider, artistId } = req.params;
    if (provider !== 'youtube') {
      return res.status(400).json({ error: 'Поддерживается только провайдер youtube' });
    }

    const fullProfile = await youtubeMusicProvider.getArtistFullProfile(artistId);
    if (!fullProfile) {
      return res.status(404).json({ error: 'Профиль внешнего артиста не найден' });
    }

    let isSubscribed = false;
    if (req.dbUser) {
      const sub = await db
        .select({ id: artistSubscriptions.id })
        .from(artistSubscriptions)
        .where(
          and(
            eq(artistSubscriptions.userId, req.dbUser.id),
            eq(artistSubscriptions.provider, provider),
            eq(artistSubscriptions.externalArtistId, artistId)
          )
        )
        .limit(1);
      isSubscribed = sub.length > 0;
    }

    return res.json({
      artist: {
        ...fullProfile.artist,
        isSubscribed,
      },
      tracks: fullProfile.popularTracks,
      releases: [
        ...fullProfile.albums,
        ...fullProfile.singlesAndEps,
        ...fullProfile.compilations,
        ...fullProfile.liveReleases,
      ],
      fullProfile,
    });
  } catch (err: any) {
    console.error('[MusicRouter] Fetch external artist profile error:', err);
    return res.status(500).json({ error: 'Не удалось загрузить внешний профиль артиста' });
  }
});

/**
 * GET /api/music/external/release/:provider/:releaseId
 * Fetch YouTube Music external release with tracklist.
 */
musicRouter.get('/external/release/:provider/:releaseId', async (req: any, res: Response) => {
  try {
    const { provider, releaseId } = req.params;
    if (provider !== 'youtube') {
      return res.status(400).json({ error: 'Поддерживается только провайдер youtube' });
    }

    const release = await youtubeMusicProvider.getRelease(releaseId);
    if (!release) {
      return res.status(404).json({ error: 'Внешний релиз не найден' });
    }

    return res.json(release);
  } catch (err: any) {
    console.error('[MusicRouter] Fetch external release error:', err);
    return res.status(500).json({ error: 'Не удалось загрузить внешний релиз' });
  }
});

// ==========================================
// ARTIST SUBSCRIPTIONS ENDPOINTS
// ==========================================

// Get user followed artists (subscriptions)
musicRouter.get('/my-subscriptions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;

    const subs = await db
      .select({
        id: artistSubscriptions.id,
        artistId: artistSubscriptions.artistId,
        provider: artistSubscriptions.provider,
        externalArtistId: artistSubscriptions.externalArtistId,
        externalArtistName: artistSubscriptions.externalArtistName,
        externalArtistAvatar: artistSubscriptions.externalArtistAvatar,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        avatar: artistProfiles.avatar,
      })
      .from(artistSubscriptions)
      .leftJoin(artistProfiles, eq(artistSubscriptions.artistId, artistProfiles.id))
      .where(eq(artistSubscriptions.userId, userId));

    const dodikArtists = subs
      .filter((s) => s.artistId !== null)
      .map((s) => ({
        id: s.artistId,
        stageName: s.stageName,
        slug: s.slug,
        avatar: s.avatar,
      }));

    const externalArtists = subs
      .filter((s) => s.provider !== null)
      .map((s) => ({
        provider: s.provider,
        artistId: s.externalArtistId,
        name: s.externalArtistName,
        avatar: s.externalArtistAvatar,
      }));

    return res.json({
      dodikArtists,
      externalArtists,
    });
  } catch (err: any) {
    console.error('Error fetching followed artists:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Subscribe to a Dodik artist
musicRouter.post('/artists/:artistId/subscribe', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    const artistId = parseInt(req.params.artistId, 10);
    if (isNaN(artistId)) return res.status(400).json({ error: 'Неверный ID исполнителя' });

    // Check if artist exists
    const artist = await db.select().from(artistProfiles).where(eq(artistProfiles.id, artistId)).limit(1);
    if (artist.length === 0) return res.status(404).json({ error: 'Исполнитель не найден' });

    await db
      .insert(artistSubscriptions)
      .values({
        userId,
        artistId,
      })
      .onConflictDoNothing();

    return res.json({ subscribed: true });
  } catch (err: any) {
    console.error('Error subscribing to artist:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Unsubscribe from a Dodik artist
musicRouter.delete('/artists/:artistId/subscribe', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    const artistId = parseInt(req.params.artistId, 10);
    if (isNaN(artistId)) return res.status(400).json({ error: 'Неверный ID исполнителя' });

    await db
      .delete(artistSubscriptions)
      .where(
        and(
          eq(artistSubscriptions.userId, userId),
          eq(artistSubscriptions.artistId, artistId)
        )
      );

    return res.json({ subscribed: false });
  } catch (err: any) {
    console.error('Error unsubscribing from artist:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Subscribe to an external artist
musicRouter.post('/external/artists/:provider/:artistId/subscribe', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    const { provider, artistId } = req.params;
    if (provider !== 'youtube' && provider !== 'soundcloud') {
      return res.status(400).json({ error: 'Неизвестный провайдер' });
    }

    const { name, avatar } = req.body;

    await db
      .insert(artistSubscriptions)
      .values({
        userId,
        provider,
        externalArtistId: artistId,
        externalArtistName: name || null,
        externalArtistAvatar: avatar || null,
      })
      .onConflictDoNothing();

    return res.json({ subscribed: true });
  } catch (err: any) {
    console.error('Error subscribing to external artist:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Unsubscribe from an external artist
musicRouter.delete('/external/artists/:provider/:artistId/subscribe', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    const { provider, artistId } = req.params;
    if (provider !== 'youtube' && provider !== 'soundcloud') {
      return res.status(400).json({ error: 'Неизвестный провайдер' });
    }

    await db
      .delete(artistSubscriptions)
      .where(
        and(
          eq(artistSubscriptions.userId, userId),
          eq(artistSubscriptions.provider, provider),
          eq(artistSubscriptions.externalArtistId, artistId)
        )
      );

    return res.json({ subscribed: false });
  } catch (err: any) {
    console.error('Error unsubscribing from external artist:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 13. PLAYLIST IMPORT ENGINE (TXT / CSV / JSON / YMusicExport)
// ==========================================

const parsePlaylistImportHandler = async (req: AuthRequest, res: Response) => {
  try {
    const rawContent = req.body.text || req.body.content || req.body.data;
    if (!rawContent || (typeof rawContent !== 'string' && typeof rawContent !== 'object')) {
      return res.status(400).json({ error: 'Содержимое файла плейлиста обязательно' });
    }

    const contentStr = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    const rawTracks = parseRawInput(contentStr);

    if (rawTracks.length === 0) {
      return res.status(400).json({ error: 'Не удалось извлечь список треков из переданного файла' });
    }

    const matchResult = await matchParsedTracks(rawTracks);

    return res.json({
      total: matchResult.total,
      matchedCount: matchResult.matchedCount,
      unmatchedCount: matchResult.unmatchedCount,
      tracks: matchResult.tracks,
      unmatchedTracks: matchResult.unmatchedTracks,
    });
  } catch (err: any) {
    console.error('Error parsing playlist for import:', err);
    return res.status(500).json({ error: err.message || 'Ошибка при распознавании файла плейлиста' });
  }
};

musicRouter.post('/playlists/import/parse', optionalAuth, parsePlaylistImportHandler);
musicRouter.post('/playlists/import-txt/parse', optionalAuth, parsePlaylistImportHandler);

/**
 * Helper to ensure an external YouTube track is safely registered in musicTracks
 * so it can be stored in musicPlaylistTracks with a valid foreign key.
 */
async function ensureExternalTrackRegistered(
  userId: number,
  trackData: {
    videoId: string;
    title: string;
    artistName: string;
    album?: string | null;
    coverUrl?: string | null;
    duration?: number | null;
  }
): Promise<number | null> {
  if (!trackData.videoId) return null;
  const cleanVideoId = String(trackData.videoId).trim();
  const audioFileKey = `yt_${cleanVideoId}`;

  // 1. Check if track already exists in musicTracks
  const [existingTrack] = await db
    .select({ id: musicTracks.id })
    .from(musicTracks)
    .where(or(eq(musicTracks.audioFile, audioFileKey), eq(musicTracks.slug, audioFileKey)))
    .limit(1);

  if (existingTrack) {
    return existingTrack.id;
  }

  // 2. Find or create external artist profile
  const artistName = String(trackData.artistName || 'Внешний исполнитель').trim();
  let artistSlug = slugify(artistName);

  const [existingArtist] = await db
    .select({ id: artistProfiles.id })
    .from(artistProfiles)
    .where(ilike(artistProfiles.stageName, artistName))
    .limit(1);

  let artistId: number;
  if (existingArtist) {
    artistId = existingArtist.id;
  } else {
    const [createdArtist] = await db
      .insert(artistProfiles)
      .values({
        userId,
        stageName: artistName,
        slug: `${artistSlug}-ext-${Math.floor(Math.random() * 899 + 100)}`,
        status: 'ACTIVE',
        avatar: trackData.coverUrl || null,
      })
      .returning({ id: artistProfiles.id });
    artistId = createdArtist.id;
  }

  // 3. Find or create external release
  const releaseTitle = String(trackData.album || 'YouTube Music').trim();
  const [existingRelease] = await db
    .select({ id: musicReleases.id })
    .from(musicReleases)
    .where(and(eq(musicReleases.artistId, artistId), ilike(musicReleases.title, releaseTitle)))
    .limit(1);

  let releaseId: number;
  if (existingRelease) {
    releaseId = existingRelease.id;
  } else {
    const [createdRelease] = await db
      .insert(musicReleases)
      .values({
        artistId,
        title: releaseTitle,
        slug: `${slugify(releaseTitle)}-ext-${Math.floor(Math.random() * 899 + 100)}`,
        type: 'SINGLE',
        cover: trackData.coverUrl || null,
        status: 'PUBLISHED',
      })
      .returning({ id: musicReleases.id });
    releaseId = createdRelease.id;
  }

  // 4. Create track row in musicTracks
  const [newTrack] = await db
    .insert(musicTracks)
    .values({
      releaseId,
      artistId,
      title: String(trackData.title).trim(),
      slug: audioFileKey,
      audioFile: audioFileKey,
      duration: trackData.duration ? Math.round(Number(trackData.duration)) : null,
      status: 'PUBLISHED',
    })
    .returning({ id: musicTracks.id });

  return newTrack ? newTrack.id : null;
}

const executePlaylistImportHandler = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const { mode, playlistId: existingPlaylistId, title, description, isCollaborative, tracks, trackIds } = req.body;

    const trackItems: any[] = Array.isArray(tracks) && tracks.length > 0 ? tracks : Array.isArray(trackIds) ? trackIds : [];

    if (trackItems.length === 0) {
      return res.status(400).json({ error: 'Список треков для импорта пуст' });
    }

    let targetPlaylistId: number;

    if (mode === 'EXISTING' || existingPlaylistId) {
      const plId = parseInt(String(existingPlaylistId), 10);
      if (isNaN(plId) || plId <= 0) {
        return res.status(400).json({ error: 'Неверный идентификатор существующго плейлиста' });
      }

      const [playlist] = await db
        .select()
        .from(musicPlaylists)
        .where(eq(musicPlaylists.id, plId))
        .limit(1);

      if (!playlist) {
        return res.status(404).json({ error: 'Плейлист не найден' });
      }

      const isOwner = playlist.userId === user.id;
      const isStaff = isStaffRole(user.role);

      let canAdd = isOwner || isStaff;
      if (!canAdd && playlist.isCollaborative) {
        const [member] = await db
          .select()
          .from(musicPlaylistMembers)
          .where(
            and(
              eq(musicPlaylistMembers.playlistId, plId),
              eq(musicPlaylistMembers.userId, user.id)
            )
          )
          .limit(1);
        canAdd = member ? member.canAddTracks : true;
      }

      if (!canAdd) {
        return res.status(403).json({ error: 'У вас нет прав на добавление треков в этот плейлист' });
      }

      targetPlaylistId = plId;
    } else {
      // Create a new playlist
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Название нового плейлиста обязательно' });
      }

      const [newPlaylist] = await db
        .insert(musicPlaylists)
        .values({
          userId: user.id,
          title: title.trim(),
          description: description?.trim() || null,
          visibility: 'PUBLIC',
          isCollaborative: Boolean(isCollaborative),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      targetPlaylistId = newPlaylist.id;
    }

    // Get current max position
    const [maxPosRes] = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(position), 0)` })
      .from(musicPlaylistTracks)
      .where(eq(musicPlaylistTracks.playlistId, targetPlaylistId));

    let currentPos = Number(maxPosRes?.maxPos || 0);
    let added = 0;
    let skipped = 0;

    for (let i = 0; i < trackItems.length; i++) {
      const rawItem = trackItems[i];
      let targetTrackId: number | null = null;

      if (typeof rawItem === 'number' || (typeof rawItem === 'string' && /^\d+$/.test(rawItem))) {
        targetTrackId = parseInt(String(rawItem), 10);
      } else if (typeof rawItem === 'object' && rawItem !== null) {
        if (rawItem.numericTrackId && typeof rawItem.numericTrackId === 'number') {
          targetTrackId = rawItem.numericTrackId;
        } else if (rawItem.id && typeof rawItem.id === 'number') {
          targetTrackId = rawItem.id;
        } else if (rawItem.videoId || (typeof rawItem.id === 'string' && rawItem.id.startsWith('yt_'))) {
          const vId = rawItem.videoId || String(rawItem.id).replace(/^yt_/, '');
          targetTrackId = await ensureExternalTrackRegistered(user.id, {
            videoId: vId,
            title: rawItem.title || 'Внешний трек',
            artistName: rawItem.artistName || rawItem.artist || 'Исполнитель',
            album: rawItem.album || rawItem.releaseTitle || null,
            coverUrl: rawItem.coverUrl || rawItem.thumbnail || null,
            duration: rawItem.duration || rawItem.durationSeconds || null,
          });
        }
      }

      if (!targetTrackId || isNaN(targetTrackId) || targetTrackId <= 0) {
        skipped++;
        continue;
      }

      // Check if track exists in musicTracks
      const [track] = await db
        .select({ id: musicTracks.id, title: musicTracks.title })
        .from(musicTracks)
        .where(eq(musicTracks.id, targetTrackId))
        .limit(1);

      if (!track) {
        skipped++;
        continue;
      }

      // Check if already in playlist
      const [exists] = await db
        .select({ id: musicPlaylistTracks.id })
        .from(musicPlaylistTracks)
        .where(
          and(
            eq(musicPlaylistTracks.playlistId, targetPlaylistId),
            eq(musicPlaylistTracks.trackId, track.id)
          )
        )
        .limit(1);

      if (exists) {
        skipped++;
        continue;
      }

      currentPos++;
      await db
        .insert(musicPlaylistTracks)
        .values({
          playlistId: targetPlaylistId,
          trackId: track.id,
          addedByUserId: user.id,
          position: currentPos,
          addedAt: new Date(),
        })
        .onConflictDoNothing();

      added++;
    }

    await db
      .update(musicPlaylists)
      .set({ updatedAt: new Date() })
      .where(eq(musicPlaylists.id, targetPlaylistId));

    return res.json({
      success: true,
      playlistId: targetPlaylistId,
      added,
      skipped,
    });
  } catch (err: any) {
    console.error('Error executing playlist import:', err);
    return res.status(500).json({ error: err.message || 'Ошибка при сохранении импортированного плейлиста' });
  }
};

musicRouter.post('/playlists/import/execute', requireAuth, executePlaylistImportHandler);
musicRouter.post('/playlists/import-txt/execute', requireAuth, executePlaylistImportHandler);

