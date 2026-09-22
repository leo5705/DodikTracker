import { Router, Response } from 'express';
import { requireAuth, requireStaff, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import { media, mediaExternalIds, seasons, episodes, userMedia } from '../../../db/schema.ts';
import { eq, and, sql, desc, count, ilike, or } from 'drizzle-orm';
import { logAdminAction } from './auditHelper.ts';
import { UnifiedGameService } from '../../game/unifiedGameService.ts';

export const contentRouter = Router();

// 1. List Content / Media
contentRouter.get('/content', requireAuth, requireStaff('MANAGE_CONTENT'), async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const offset = (page - 1) * limit;

    const typeFilter = (req.query.type as string || 'ALL').toUpperCase();
    const visibilityFilter = (req.query.visibility as string || 'ALL').toUpperCase();
    const searchQuery = (req.query.q as string || '').trim();

    const conditions: any[] = [];
    if (typeFilter !== 'ALL') {
      conditions.push(eq(media.type, typeFilter));
    }
    if (visibilityFilter === 'HIDDEN') {
      conditions.push(eq(media.isHidden, true));
    } else if (visibilityFilter === 'VISIBLE') {
      conditions.push(eq(media.isHidden, false));
    }
    if (searchQuery) {
      conditions.push(or(ilike(media.title, `%${searchQuery}%`), ilike(media.originalTitle, `%${searchQuery}%`)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db.select({ val: count() }).from(media).where(whereClause);
    const totalCount = Number(totalRes?.val || 0);

    const items = await db
      .select({
        id: media.id,
        type: media.type,
        title: media.title,
        originalTitle: media.originalTitle,
        description: media.description,
        posterUrl: media.posterUrl,
        backdropUrl: media.backdropUrl,
        releaseDate: media.releaseDate,
        year: media.year,
        genres: media.genres,
        rating: media.rating,
        totalSeasons: media.totalSeasons,
        totalEpisodes: media.totalEpisodes,
        isHidden: media.isHidden,
        createdAt: media.createdAt,
        updatedAt: media.updatedAt,
        trackerCount: sql<number>`COALESCE((SELECT COUNT(*) FROM user_media WHERE user_media.media_id = ${media.id}), 0)::int`,
      })
      .from(media)
      .where(whereClause)
      .orderBy(desc(media.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      items,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (err: any) {
    console.error('[Content] List error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Media Details
contentRouter.get('/content/:id', requireAuth, requireStaff('MANAGE_CONTENT'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [item] = await db.select().from(media).where(eq(media.id, id)).limit(1);
    if (!item) {
      return res.status(404).json({ error: 'Медиа не найдено' });
    }

    const extIds = await db.select().from(mediaExternalIds).where(eq(mediaExternalIds.mediaId, id));
    const mediaSeasons = await db.select().from(seasons).where(eq(seasons.mediaId, id)).orderBy(seasons.seasonNumber);
    
    // User tracking counts
    const trackingStatsRes = await db.execute(sql`
      SELECT status, COUNT(*)::int as count
      FROM user_media
      WHERE media_id = ${id}
      GROUP BY status
    `);

    res.json({
      media: item,
      externalIds: extIds,
      seasons: mediaSeasons,
      trackingStats: (trackingStatsRes as any).rows || [],
    });
  } catch (err: any) {
    console.error('[Content] Detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Update Media Metadata
contentRouter.put('/content/:id', requireAuth, requireStaff('MANAGE_CONTENT'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      title,
      originalTitle,
      description,
      posterUrl,
      backdropUrl,
      releaseDate,
      year,
      genres,
      rating,
      totalSeasons,
      totalEpisodes,
      totalDurationMinutes,
    } = req.body;
    const actor = req.dbUser!;

    const [updated] = await db
      .update(media)
      .set({
        title: title !== undefined ? title.trim() : undefined,
        originalTitle: originalTitle !== undefined ? originalTitle : undefined,
        description: description !== undefined ? description : undefined,
        posterUrl: posterUrl !== undefined ? posterUrl : undefined,
        backdropUrl: backdropUrl !== undefined ? backdropUrl : undefined,
        releaseDate: releaseDate !== undefined ? releaseDate : undefined,
        year: year !== undefined ? parseInt(year, 10) : undefined,
        genres: genres !== undefined ? (typeof genres === 'string' ? genres : JSON.stringify(genres)) : undefined,
        rating: rating !== undefined ? parseFloat(rating) : undefined,
        totalSeasons: totalSeasons !== undefined ? parseInt(totalSeasons, 10) : undefined,
        totalEpisodes: totalEpisodes !== undefined ? parseInt(totalEpisodes, 10) : undefined,
        totalDurationMinutes: totalDurationMinutes !== undefined ? parseInt(totalDurationMinutes, 10) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(media.id, id))
      .returning();

    await logAdminAction({
      userId: actor.id,
      action: 'UPDATE_MEDIA',
      details: `Обновлены метаданные медиа #${id}: «${updated.title}»`,
      ip: req.ip,
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[Content] Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Toggle Media Visibility
contentRouter.post('/content/:id/toggle-hide', requireAuth, requireStaff('MANAGE_CONTENT'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const actor = req.dbUser!;

    const [item] = await db.select().from(media).where(eq(media.id, id)).limit(1);
    if (!item) {
      return res.status(404).json({ error: 'Медиа не найдено' });
    }

    const newHidden = !item.isHidden;
    const [updated] = await db
      .update(media)
      .set({ isHidden: newHidden, updatedAt: new Date() })
      .where(eq(media.id, id))
      .returning();

    // Invalidate game cache if it's a game
    if (item.type === 'GAME') {
      const extRows = await db
        .select({ externalId: mediaExternalIds.externalId })
        .from(mediaExternalIds)
        .where(eq(mediaExternalIds.mediaId, id))
        .catch(() => []);
      const extIds = extRows.map((r) => r.externalId);
      await UnifiedGameService.getInstance().invalidateGameCache(id, extIds);
    }

    await logAdminAction({
      userId: actor.id,
      action: newHidden ? 'HIDE_MEDIA' : 'UNHIDE_MEDIA',
      details: `${newHidden ? 'Скрыто' : 'Восстановлено отображение'} медиа #${id}: «${item.title}»`,
      ip: req.ip,
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[Content] Toggle hide error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Add External ID
contentRouter.post('/content/:id/external-ids', requireAuth, requireStaff('MANAGE_CONTENT'), async (req: AuthRequest, res: Response) => {
  try {
    const mediaId = parseInt(req.params.id, 10);
    const { provider, externalId } = req.body;

    if (!provider || !externalId) {
      return res.status(400).json({ error: 'Необходимо указать provider и externalId' });
    }

    const [created] = await db
      .insert(mediaExternalIds)
      .values({
        mediaId,
        provider: provider.trim(),
        externalId: String(externalId).trim(),
      })
      .returning();

    res.json(created);
  } catch (err: any) {
    console.error('[Content] Add external ID error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Delete External ID
contentRouter.delete('/content/:id/external-ids/:extId', requireAuth, requireStaff('MANAGE_CONTENT'), async (req: AuthRequest, res: Response) => {
  try {
    const extId = parseInt(req.params.extId, 10);
    await db.delete(mediaExternalIds).where(eq(mediaExternalIds.id, extId));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
