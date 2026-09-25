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
  users,
  activities,
} from '../../db/schema.ts';
import { eq, and, or, desc, asc, sql, ilike, inArray, gt, gte } from 'drizzle-orm';
import { notificationService } from '../services/notificationService.ts';
import { logAdminAction } from './admin/auditHelper.ts';

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
    const param = req.params.idOrSlug;
    const numId = Number(param);
    const isNum = !isNaN(numId) && numId > 0;

    const condition = isNum
      ? eq(artistProfiles.id, numId)
      : eq(artistProfiles.slug, param);

    const found = await db
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
      .where(condition)
      .limit(1);

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

    res.json({
      artist,
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
    } else if (userArtist) {
      // Show published, plus user's own releases in any status
      conditions.push(
        or(
          eq(musicReleases.status, 'PUBLISHED'),
          eq(musicReleases.artistId, userArtist.id)
        )
      );
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
        await tx.delete(musicTracks).where(eq(musicTracks.releaseId, releaseId));
        for (let idx = 0; idx < tracks.length; idx++) {
          const trk = tracks[idx];
          if (trk.title && trk.audioFile) {
            await tx.insert(musicTracks).values({
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
            });
          }
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

    res.json({
      favoriteReleasesCount: Number(favReleasesCount?.count || 0),
      favoriteTracksCount: Number(favTracksCount?.count || 0),
      recentTracksCount: Number(recentCountRes.rows?.[0]?.count || 0),
      totalListeningSeconds: Number(recentCountRes.rows?.[0]?.totalSeconds || 0),
      reviewsCount: Number(reviewsCountRes?.count || 0),
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

    res.json({
      releases: releasesMatch,
      artists: artistsMatch,
      tracks: tracksMatch,
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

