import { Router, Response } from 'express';
import { requireAuth, optionalAuth, requireStaff, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import { announcements, announcementReads, users } from '../../../db/schema.ts';
import { eq, and, sql, desc, or, inArray } from 'drizzle-orm';
import { logAdminAction } from './auditHelper.ts';
import { notificationService } from '../../services/notificationService.ts';

export const announcementsRouter = Router();

// Helper to normalize priority
function normalizePriority(raw: string | undefined): 'NORMAL' | 'IMPORTANT' | 'CRITICAL' {
  if (!raw) return 'NORMAL';
  const u = raw.toUpperCase();
  if (u === 'CRITICAL') return 'CRITICAL';
  if (u === 'IMPORTANT' || u === 'WARNING') return 'IMPORTANT';
  return 'NORMAL';
}

// Helper to map priority to severity for compatibility
function priorityToSeverity(priority: string): 'INFO' | 'WARNING' | 'CRITICAL' {
  if (priority === 'CRITICAL') return 'CRITICAL';
  if (priority === 'IMPORTANT' || priority === 'WARNING') return 'WARNING';
  return 'INFO';
}

// 1. Admin List Announcements
announcementsRouter.get('/announcements', requireAuth, requireStaff('MANAGE_ANNOUNCEMENTS'), async (_req: AuthRequest, res: Response) => {
  try {
    const items = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        message: announcements.message,
        priority: announcements.priority,
        severity: announcements.severity,
        status: announcements.status,
        targetAudience: announcements.targetAudience,
        isActive: announcements.isActive,
        publishedAt: announcements.publishedAt,
        startAt: announcements.startAt,
        endAt: announcements.endAt,
        showBanner: announcements.showBanner,
        sendTelegram: announcements.sendTelegram,
        createdAt: announcements.createdAt,
        updatedAt: announcements.updatedAt,
        author: {
          id: users.id,
          username: users.username,
          avatar: users.avatar,
          role: users.role,
        },
      })
      .from(announcements)
      .leftJoin(users, eq(announcements.createdBy, users.id))
      .orderBy(desc(announcements.createdAt));

    // Get read counts per announcement
    const readCounts = await db
      .select({
        announcementId: announcementReads.announcementId,
        count: sql<number>`count(${announcementReads.id})::int`,
      })
      .from(announcementReads)
      .groupBy(announcementReads.announcementId);

    const countMap = new Map<number, number>();
    readCounts.forEach((r) => countMap.set(r.announcementId, Number(r.count)));

    const formatted = items.map((item) => ({
      ...item,
      content: item.content || item.message,
      priority: normalizePriority(item.priority || item.severity),
      readCount: countMap.get(item.id) || 0,
    }));

    res.json(formatted);
  } catch (err: any) {
    console.error('[Announcements] Admin list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Admin Create Announcement
announcementsRouter.post('/announcements', requireAuth, requireStaff('MANAGE_ANNOUNCEMENTS'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      content,
      message,
      priority,
      severity,
      status,
      targetAudience,
      showBanner,
      sendTelegram,
      startAt,
      endAt,
      isActive,
    } = req.body;
    const actor = req.dbUser!;

    const textBody = (content || message || '').trim();
    if (!title?.trim() || !textBody) {
      return res.status(400).json({ error: 'Заголовок и текст объявления обязательны' });
    }

    const finalPriority = normalizePriority(priority || severity);
    const finalSeverity = priorityToSeverity(finalPriority);
    const finalStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' =
      status === 'DRAFT' || status === 'ARCHIVED' || status === 'PUBLISHED'
        ? status
        : isActive === false
        ? 'DRAFT'
        : 'PUBLISHED';
    const isPublished = finalStatus === 'PUBLISHED';
    const finalIsActive = isActive !== undefined ? !!isActive : isPublished;

    const [created] = await db
      .insert(announcements)
      .values({
        title: title.trim(),
        content: textBody,
        message: textBody,
        priority: finalPriority,
        severity: finalSeverity,
        status: finalStatus,
        targetAudience: targetAudience || 'ALL',
        showBanner: showBanner !== undefined ? !!showBanner : true,
        sendTelegram: !!sendTelegram,
        publishedAt: isPublished ? new Date() : null,
        startAt: startAt ? new Date(startAt) : new Date(),
        endAt: endAt ? new Date(endAt) : null,
        isActive: finalIsActive,
        createdBy: actor.id,
      })
      .returning();

    await logAdminAction({
      userId: actor.id,
      action: 'CREATE_ANNOUNCEMENT',
      details: `Создано системное объявление: «${created.title}» (приоритет: ${finalPriority}, статус: ${finalStatus})`,
      ip: req.ip,
    });

    if (isPublished && finalIsActive) {
      notificationService.broadcastNotification({
        type: 'ADMIN_ANNOUNCEMENT',
        title: created.title,
        message: textBody,
        content: textBody,
        entityType: 'ANNOUNCEMENT',
        entityId: String(created.id),
        actorUserId: actor.id,
      }).catch(() => {});
    }

    if (sendTelegram && isPublished && finalIsActive) {
      const severityEmoji = finalPriority === 'CRITICAL' ? '🚨' : finalPriority === 'IMPORTANT' ? '⚠️' : '📢';
      notificationService.sendTelegramNotification(
        `${severityEmoji} *${created.title}*\n\n${textBody}`
      );
    }

    res.json({
      ...created,
      content: created.content || created.message,
      priority: normalizePriority(created.priority),
      author: {
        id: actor.id,
        username: actor.username,
        avatar: actor.avatar,
        role: actor.role,
      },
    });
  } catch (err: any) {
    console.error('[Announcements] Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Admin Update Announcement
announcementsRouter.put('/announcements/:id', requireAuth, requireStaff('MANAGE_ANNOUNCEMENTS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      title,
      content,
      message,
      priority,
      severity,
      status,
      targetAudience,
      showBanner,
      sendTelegram,
      startAt,
      endAt,
      isActive,
    } = req.body;
    const actor = req.dbUser!;

    // Find existing
    const [existing] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    const textBody = content !== undefined ? content.trim() : message !== undefined ? message.trim() : undefined;
    const finalPriority = priority !== undefined || severity !== undefined ? normalizePriority(priority || severity) : undefined;
    const finalSeverity = finalPriority ? priorityToSeverity(finalPriority) : undefined;

    let finalStatus = status;
    let finalIsActive = isActive;
    let publishedAtUpdate = undefined;

    if (status !== undefined) {
      finalStatus = status;
      if (status === 'PUBLISHED') {
        finalIsActive = true;
        if (!existing.publishedAt) {
          publishedAtUpdate = new Date();
        }
      } else {
        finalIsActive = false;
      }
    } else if (isActive !== undefined) {
      finalIsActive = !!isActive;
      finalStatus = isActive ? 'PUBLISHED' : 'DRAFT';
      if (isActive && !existing.publishedAt) {
        publishedAtUpdate = new Date();
      }
    }

    const [updated] = await db
      .update(announcements)
      .set({
        title: title !== undefined ? title.trim() : undefined,
        content: textBody,
        message: textBody,
        priority: finalPriority,
        severity: finalSeverity,
        status: finalStatus,
        targetAudience: targetAudience !== undefined ? targetAudience : undefined,
        showBanner: showBanner !== undefined ? !!showBanner : undefined,
        sendTelegram: sendTelegram !== undefined ? !!sendTelegram : undefined,
        publishedAt: publishedAtUpdate !== undefined ? publishedAtUpdate : undefined,
        startAt: startAt !== undefined ? (startAt ? new Date(startAt) : null) : undefined,
        endAt: endAt !== undefined ? (endAt ? new Date(endAt) : null) : undefined,
        isActive: finalIsActive !== undefined ? finalIsActive : undefined,
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, id))
      .returning();

    await logAdminAction({
      userId: actor.id,
      action: 'UPDATE_ANNOUNCEMENT',
      details: `Обновлено системное объявление #${id}: «${updated.title}»`,
      ip: req.ip,
    });

    res.json({
      ...updated,
      content: updated.content || updated.message,
      priority: normalizePriority(updated.priority),
    });
  } catch (err: any) {
    console.error('[Announcements] Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Admin Publish Announcement
announcementsRouter.post('/announcements/:id/publish', requireAuth, requireStaff('MANAGE_ANNOUNCEMENTS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const actor = req.dbUser!;

    const [updated] = await db
      .update(announcements)
      .set({
        status: 'PUBLISHED',
        isActive: true,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    await logAdminAction({
      userId: actor.id,
      action: 'PUBLISH_ANNOUNCEMENT',
      details: `Опубликовано системное объявление #${id}: «${updated.title}»`,
      ip: req.ip,
    });

    notificationService.broadcastNotification({
      type: 'ADMIN_ANNOUNCEMENT',
      title: updated.title,
      message: updated.content || updated.message || '',
      content: updated.content || updated.message || '',
      entityType: 'ANNOUNCEMENT',
      entityId: String(updated.id),
      actorUserId: actor.id,
    }).catch(() => {});

    res.json({
      ...updated,
      content: updated.content || updated.message,
      priority: normalizePriority(updated.priority),
    });
  } catch (err: any) {
    console.error('[Announcements] Publish error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Admin Unpublish Announcement
announcementsRouter.post('/announcements/:id/unpublish', requireAuth, requireStaff('MANAGE_ANNOUNCEMENTS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const actor = req.dbUser!;

    const [updated] = await db
      .update(announcements)
      .set({
        status: 'DRAFT',
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    await logAdminAction({
      userId: actor.id,
      action: 'UNPUBLISH_ANNOUNCEMENT',
      details: `Снято с публикации системное объявление #${id}: «${updated.title}»`,
      ip: req.ip,
    });

    res.json({
      ...updated,
      content: updated.content || updated.message,
      priority: normalizePriority(updated.priority),
    });
  } catch (err: any) {
    console.error('[Announcements] Unpublish error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Admin Delete Announcement
announcementsRouter.delete('/announcements/:id', requireAuth, requireStaff('MANAGE_ANNOUNCEMENTS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(announcements).where(eq(announcements.id, id));

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'DELETE_ANNOUNCEMENT',
      details: `Удалено системное объявление #${id}`,
      ip: req.ip,
    });

    res.json({ success: true, message: 'Объявление удалено' });
  } catch (err: any) {
    console.error('[Announcements] Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Public / User Endpoints
// ============================================

export const publicAnnouncementsRouter = Router();

// Public / User: Get active published announcements for display (banner/modal)
publicAnnouncementsRouter.get('/announcements/active', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const includeRead = req.query.includeRead === 'true';

    // 1. Fetch active, published announcements within time window
    const items = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        message: announcements.message,
        priority: announcements.priority,
        severity: announcements.severity,
        status: announcements.status,
        showBanner: announcements.showBanner,
        startAt: announcements.startAt,
        endAt: announcements.endAt,
        publishedAt: announcements.publishedAt,
        createdAt: announcements.createdAt,
        author: {
          id: users.id,
          username: users.username,
          avatar: users.avatar,
          role: users.role,
        },
      })
      .from(announcements)
      .leftJoin(users, eq(announcements.createdBy, users.id))
      .where(
        and(
          eq(announcements.isActive, true),
          eq(announcements.status, 'PUBLISHED'),
          or(sql`${announcements.startAt} IS NULL`, sql`${announcements.startAt} <= NOW()`),
          or(sql`${announcements.endAt} IS NULL`, sql`${announcements.endAt} >= NOW()`)
        )
      )
      .orderBy(desc(announcements.createdAt));

    if (items.length === 0) {
      return res.json([]);
    }

    // 2. If user is logged in, check which ones are read in DB
    const readMap = new Set<number>();
    if (user) {
      const annIds = items.map((i) => i.id);
      const reads = await db
        .select({ announcementId: announcementReads.announcementId })
        .from(announcementReads)
        .where(
          and(
            eq(announcementReads.userId, user.id),
            inArray(announcementReads.announcementId, annIds)
          )
        );

      reads.forEach((r) => readMap.add(r.announcementId));
    }

    const formatted = items.map((item) => {
      const isRead = readMap.has(item.id);
      return {
        id: item.id,
        title: item.title,
        content: item.content || item.message,
        message: item.message || item.content,
        priority: normalizePriority(item.priority || item.severity),
        status: item.status,
        showBanner: item.showBanner,
        startAt: item.startAt,
        endAt: item.endAt,
        publishedAt: item.publishedAt || item.createdAt,
        createdAt: item.createdAt,
        author: item.author?.username ? item.author : { username: 'Администрация', role: 'ADMIN' },
        isRead,
      };
    });

    // If includeRead is false, only return unread announcements for the banner
    const result = includeRead ? formatted : formatted.filter((item) => !item.isRead);

    res.json(result);
  } catch (err: any) {
    console.error('[PublicAnnouncements] Active error:', err);
    res.status(500).json({ error: err.message });
  }
});

// User: Mark announcement as read (saved to DB)
publicAnnouncementsRouter.post('/announcements/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.dbUser!.id;

    // Check if announcement exists
    const [ann] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    if (!ann) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    // Insert read record with conflict ignore
    await db
      .insert(announcementReads)
      .values({
        announcementId: id,
        userId: userId,
        readAt: new Date(),
      })
      .onConflictDoNothing();

    res.json({ success: true, message: 'Объявление отмечено как прочитанное' });
  } catch (err: any) {
    console.error('[PublicAnnouncements] Mark read error:', err);
    res.status(500).json({ error: err.message });
  }
});

// User: Mark all active announcements as read
publicAnnouncementsRouter.post('/announcements/read-all', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;

    const activeList = await db
      .select({ id: announcements.id })
      .from(announcements)
      .where(and(eq(announcements.isActive, true), eq(announcements.status, 'PUBLISHED')));

    for (const item of activeList) {
      await db
        .insert(announcementReads)
        .values({
          announcementId: item.id,
          userId: userId,
          readAt: new Date(),
        })
        .onConflictDoNothing();
    }

    res.json({ success: true, count: activeList.length });
  } catch (err: any) {
    console.error('[PublicAnnouncements] Mark all read error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public: Get published announcements history / archive
publicAnnouncementsRouter.get('/announcements', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser;
    const items = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        message: announcements.message,
        priority: announcements.priority,
        severity: announcements.severity,
        status: announcements.status,
        publishedAt: announcements.publishedAt,
        createdAt: announcements.createdAt,
        author: {
          id: users.id,
          username: users.username,
          avatar: users.avatar,
          role: users.role,
        },
      })
      .from(announcements)
      .leftJoin(users, eq(announcements.createdBy, users.id))
      .where(eq(announcements.status, 'PUBLISHED'))
      .orderBy(desc(announcements.publishedAt), desc(announcements.createdAt))
      .limit(50);

    const readMap = new Set<number>();
    if (user && items.length > 0) {
      const annIds = items.map((i) => i.id);
      const reads = await db
        .select({ announcementId: announcementReads.announcementId })
        .from(announcementReads)
        .where(
          and(
            eq(announcementReads.userId, user.id),
            inArray(announcementReads.announcementId, annIds)
          )
        );
      reads.forEach((r) => readMap.add(r.announcementId));
    }

    const formatted = items.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content || item.message,
      priority: normalizePriority(item.priority || item.severity),
      status: item.status,
      publishedAt: item.publishedAt || item.createdAt,
      createdAt: item.createdAt,
      author: item.author?.username ? item.author : { username: 'Администрация', role: 'ADMIN' },
      isRead: readMap.has(item.id),
    }));

    res.json(formatted);
  } catch (err: any) {
    console.error('[PublicAnnouncements] List error:', err);
    res.status(500).json({ error: err.message });
  }
});
