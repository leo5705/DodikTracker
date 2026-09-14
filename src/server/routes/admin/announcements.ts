import { Router, Response } from 'express';
import { requireAuth, requireStaff, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import { announcements, users } from '../../../db/schema.ts';
import { eq, and, sql, desc, or } from 'drizzle-orm';
import { logAdminAction } from './auditHelper.ts';
import { notificationService } from '../../services/notificationService.ts';

export const announcementsRouter = Router();

// 1. Admin List Announcements
announcementsRouter.get('/announcements', requireAuth, requireStaff('MANAGE_ANNOUNCEMENTS'), async (_req: AuthRequest, res: Response) => {
  try {
    const items = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        message: announcements.message,
        severity: announcements.severity,
        targetAudience: announcements.targetAudience,
        isActive: announcements.isActive,
        startAt: announcements.startAt,
        endAt: announcements.endAt,
        showBanner: announcements.showBanner,
        sendTelegram: announcements.sendTelegram,
        createdAt: announcements.createdAt,
        updatedAt: announcements.updatedAt,
        creatorUsername: users.username,
      })
      .from(announcements)
      .leftJoin(users, eq(announcements.createdBy, users.id))
      .orderBy(desc(announcements.createdAt));

    res.json(items);
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
      message,
      severity,
      targetAudience,
      showBanner,
      sendTelegram,
      startAt,
      endAt,
      isActive,
    } = req.body;
    const actor = req.dbUser!;

    if (!title || !message) {
      return res.status(400).json({ error: 'Заголовок и текст объявления обязательны' });
    }

    const [created] = await db
      .insert(announcements)
      .values({
        title: title.trim(),
        message: message.trim(),
        severity: severity || 'INFO',
        targetAudience: targetAudience || 'ALL',
        showBanner: showBanner !== undefined ? !!showBanner : true,
        sendTelegram: !!sendTelegram,
        startAt: startAt ? new Date(startAt) : new Date(),
        endAt: endAt ? new Date(endAt) : null,
        isActive: isActive !== undefined ? !!isActive : true,
        createdBy: actor.id,
      })
      .returning();

    await logAdminAction({
      userId: actor.id,
      action: 'CREATE_ANNOUNCEMENT',
      details: `Создано системное объявление: «${created.title}» (${created.severity})`,
      ip: req.ip,
    });

    if (sendTelegram && created.isActive) {
      const severityEmoji = created.severity === 'CRITICAL' ? '🚨' : created.severity === 'WARNING' ? '⚠️' : '📢';
      await notificationService.sendTelegramNotification(
        `${severityEmoji} *${created.title}*\n\n${created.message}`
      );
    }

    res.json(created);
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
      message,
      severity,
      targetAudience,
      showBanner,
      sendTelegram,
      startAt,
      endAt,
      isActive,
    } = req.body;
    const actor = req.dbUser!;

    const [updated] = await db
      .update(announcements)
      .set({
        title: title !== undefined ? title.trim() : undefined,
        message: message !== undefined ? message.trim() : undefined,
        severity: severity !== undefined ? severity : undefined,
        targetAudience: targetAudience !== undefined ? targetAudience : undefined,
        showBanner: showBanner !== undefined ? !!showBanner : undefined,
        sendTelegram: sendTelegram !== undefined ? !!sendTelegram : undefined,
        startAt: startAt ? new Date(startAt) : undefined,
        endAt: endAt !== undefined ? (endAt ? new Date(endAt) : null) : undefined,
        isActive: isActive !== undefined ? !!isActive : undefined,
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

    res.json(updated);
  } catch (err: any) {
    console.error('[Announcements] Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Admin Delete Announcement
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
// Public Endpoints
// ============================================

export const publicAnnouncementsRouter = Router();

// Public active banners
publicAnnouncementsRouter.get('/announcements/active', async (_req, res) => {
  try {
    const items = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        message: announcements.message,
        severity: announcements.severity,
        showBanner: announcements.showBanner,
        startAt: announcements.startAt,
        endAt: announcements.endAt,
      })
      .from(announcements)
      .where(
        and(
          eq(announcements.isActive, true),
          sql`${announcements.startAt} <= NOW()`,
          or(sql`${announcements.endAt} IS NULL`, sql`${announcements.endAt} >= NOW()`)
        )
      )
      .orderBy(desc(announcements.createdAt));

    res.json(items);
  } catch (err: any) {
    console.error('[PublicAnnouncements] Active error:', err);
    res.status(500).json({ error: err.message });
  }
});
