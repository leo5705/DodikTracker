import { Router, Response } from 'express';
import { requireAuth, requireStaff, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import { users, notifications } from '../../../db/schema.ts';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { logAdminAction } from './auditHelper.ts';
import { notificationService } from '../../services/notificationService.ts';

export const adminNotificationsRouter = Router();

// 1. Send Targeted or Broadcast Notification
adminNotificationsRouter.post('/notifications/send', requireAuth, requireStaff('MANAGE_NOTIFICATIONS'), async (req: AuthRequest, res: Response) => {
  try {
    const { target, role, userId, username, type, title, body, link, sendTelegram } = req.body;
    const actor = req.dbUser!;

    if (!title || !body) {
      return res.status(400).json({ error: 'Заголовок и текст сообщения обязательны' });
    }

    const notifType = type || 'SYSTEM';
    let recipientCount = 0;

    if (target === 'ALL') {
      // Broadcast to all active users
      await notificationService.broadcastNotification({
        type: notifType,
        title: title.trim(),
        body: body.trim(),
        link: link ? link.trim() : undefined,
      });

      const [usersCountRes] = await db.select({ val: sql<number>`COUNT(*)::int` }).from(users).where(eq(users.isBlocked, false));
      recipientCount = Number(usersCountRes?.val || 0);

      if (sendTelegram) {
        await notificationService.sendTelegramNotification(
          `📢 *${title.trim()}*\n\n${body.trim()}${link ? `\n\n🔗 ${link}` : ''}`
        );
      }
    } else if (target === 'ROLE' && role) {
      const targetUsers = await db
        .select({ id: users.id, telegramChatId: users.telegramChatId })
        .from(users)
        .where(and(eq(users.role, role), eq(users.isBlocked, false)));

      for (const u of targetUsers) {
        await notificationService.notifyUser({
          userId: u.id,
          type: notifType,
          title: title.trim(),
          body: body.trim(),
          link: link ? link.trim() : undefined,
        });
      }
      recipientCount = targetUsers.length;
    } else if (target === 'SPECIFIC') {
      let targetUser = null;
      if (userId) {
        const [u] = await db.select().from(users).where(eq(users.id, parseInt(userId, 10))).limit(1);
        targetUser = u;
      } else if (username) {
        const [u] = await db.select().from(users).where(eq(users.username, username.trim())).limit(1);
        targetUser = u;
      }

      if (!targetUser) {
        return res.status(404).json({ error: 'Целевой пользователь не найден' });
      }

      await notificationService.notifyUser({
        userId: targetUser.id,
        type: notifType,
        title: title.trim(),
        body: body.trim(),
        link: link ? link.trim() : undefined,
      });
      recipientCount = 1;

      if (sendTelegram && targetUser.telegramChatId) {
        await notificationService.sendTelegramNotification(
          `🔔 *${title.trim()}*\n\n${body.trim()}${link ? `\n\n🔗 ${link}` : ''}`
        );
      }
    } else {
      return res.status(400).json({ error: 'Неверные параметры адресации уведомления' });
    }

    await logAdminAction({
      userId: actor.id,
      action: 'SEND_NOTIFICATION',
      details: `Отправлено уведомление «${title.trim()}» (Цель: ${target}${role ? `:${role}` : ''}, Получателей: ${recipientCount})`,
      ip: req.ip,
    });

    res.json({
      success: true,
      recipients: recipientCount,
      message: `Уведомление успешно доставлено (${recipientCount} пользователей)`,
    });
  } catch (err: any) {
    console.error('[AdminNotifications] Send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Recent Sent System Notifications
adminNotificationsRouter.get('/notifications/history', requireAuth, requireStaff('MANAGE_NOTIFICATIONS'), async (_req: AuthRequest, res: Response) => {
  try {
    const history = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        link: notifications.link,
        createdAt: notifications.createdAt,
        recipientUsername: users.username,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.userId, users.id))
      .where(inArray(notifications.type, ['SYSTEM', 'ADMIN_ALERT']))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    res.json(history);
  } catch (err: any) {
    console.error('[AdminNotifications] History error:', err);
    res.status(500).json({ error: err.message });
  }
});
