import { Router, Response } from 'express';
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
  users,
  activities,
} from '../../db/schema.ts';
import { eq, and, or, desc, asc, sql, ilike, inArray } from 'drizzle-orm';
import { notificationService } from '../services/notificationService.ts';
import { logAdminAction } from './admin/auditHelper.ts';

export const musicRouter = Router();

// ==========================================
// HELPER FUNCTIONS
// ==========================================

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

    const [createdRelease] = await db
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

    // Link genres if provided
    if (Array.isArray(genreIds) && genreIds.length > 0) {
      for (const gId of genreIds) {
        const numG = Number(gId);
        if (!isNaN(numG) && numG > 0) {
          await db.insert(musicReleaseGenres).values({
            releaseId: createdRelease.id,
            genreId: numG,
          }).catch(() => {});
        }
      }
    }

    // Link initial tracks if provided
    if (Array.isArray(tracks) && tracks.length > 0) {
      for (let idx = 0; idx < tracks.length; idx++) {
        const trk = tracks[idx];
        if (trk.title && trk.audioFile) {
          await db.insert(musicTracks).values({
            releaseId: createdRelease.id,
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
          }).catch(() => {});
        }
      }
    }

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

    // Fetch current user's review if logged in
    let userReview = null;
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
    }

    res.json({
      release,
      genres: genreRows,
      tracks: tracksList,
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

    const { title, description, cover, releaseDate, type, status, genreIds } = req.body;
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

    const [updated] = await db
      .update(musicReleases)
      .set(updateData)
      .where(eq(musicReleases.id, releaseId))
      .returning();

    // Update genres if provided
    if (Array.isArray(genreIds)) {
      await db.delete(musicReleaseGenres).where(eq(musicReleaseGenres.releaseId, releaseId));
      for (const gId of genreIds) {
        const numG = Number(gId);
        if (!isNaN(numG) && numG > 0) {
          await db.insert(musicReleaseGenres).values({
            releaseId,
            genreId: numG,
          }).catch(() => {});
        }
      }
    }

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

    for (let i = 0; i < trackIds.length; i++) {
      const tId = Number(trackIds[i]);
      if (!isNaN(tId) && tId > 0) {
        await db
          .update(musicTracks)
          .set({ trackNumber: i + 1 })
          .where(and(eq(musicTracks.id, tId), eq(musicTracks.releaseId, releaseId)));
      }
    }

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
 * Real metrics for musician's studio overview
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
        },
        recentReleases: [],
        reviews: [],
      });
    }

    // Count releases by status
    const releasesList = await db
      .select()
      .from(musicReleases)
      .where(eq(musicReleases.artistId, artist.id))
      .orderBy(desc(musicReleases.createdAt));

    const totalReleases = releasesList.length;
    const draftsCount = releasesList.filter(r => r.status === 'DRAFT').length;
    const pendingCount = releasesList.filter(r => r.status === 'PENDING_REVIEW').length;
    const publishedCount = releasesList.filter(r => r.status === 'PUBLISHED').length;

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
      },
      recentReleases: releasesList.slice(0, 5),
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

