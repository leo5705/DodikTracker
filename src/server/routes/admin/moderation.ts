import { Router, Response } from 'express';
import { requireAuth, requireStaff, optionalAuth, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import {
  reports,
  users,
  reviews,
  comments,
  lists,
  tierLists,
  media,
  directMessages,
} from '../../../db/schema.ts';
import { eq, and, sql, desc, count } from 'drizzle-orm';
import { logAdminAction } from './auditHelper.ts';
import { notificationService } from '../../services/notificationService.ts';

export const moderationRouter = Router();

// Public / User-facing Reports Router
export const publicReportsRouter = Router();

const handleReportCreation = async (req: AuthRequest, res: Response) => {
  try {
    const { targetType, targetId, reason, description } = req.body;
    const reporter = req.dbUser;

    if (!targetType || !targetId) {
      return res.status(400).json({ error: 'Необходимо указать targetType и targetId' });
    }

    // For non-SYSTEM reports, require authentication
    if (targetType !== 'SYSTEM' && !reporter) {
      return res.status(401).json({ error: 'Необходима авторизация для отправки жалобы' });
    }

    const effectiveReason = reason || (targetType === 'SYSTEM' ? 'OTHER' : 'RULES_VIOLATION');

    let targetUserId: number | null = null;
    const targetIdStr = String(targetId);
    const targetIdNum = parseInt(targetIdStr, 10);

    // Resolve targetUserId based on entity type
    if (targetType === 'USER') {
      targetUserId = !isNaN(targetIdNum) ? targetIdNum : null;
    } else if (targetType === 'REVIEW' && !isNaN(targetIdNum)) {
      const [rev] = await db.select({ userId: reviews.userId }).from(reviews).where(eq(reviews.id, targetIdNum)).limit(1);
      if (rev) targetUserId = rev.userId;
    } else if (targetType === 'COMMENT' && !isNaN(targetIdNum)) {
      const [cmt] = await db.select({ userId: comments.userId }).from(comments).where(eq(comments.id, targetIdNum)).limit(1);
      if (cmt) targetUserId = cmt.userId;
    } else if (targetType === 'LIST' && !isNaN(targetIdNum)) {
      const [lst] = await db.select({ ownerId: lists.ownerId }).from(lists).where(eq(lists.id, targetIdNum)).limit(1);
      if (lst) targetUserId = lst.ownerId;
    } else if (targetType === 'TIER_LIST' && !isNaN(targetIdNum)) {
      const [tl] = await db.select({ ownerId: tierLists.ownerId }).from(tierLists).where(eq(tierLists.id, targetIdNum)).limit(1);
      if (tl) targetUserId = tl.ownerId;
    } else if (targetType === 'MESSAGE' && !isNaN(targetIdNum)) {
      const [msg] = await db.select({ senderId: directMessages.senderId }).from(directMessages).where(eq(directMessages.id, targetIdNum)).limit(1);
      if (msg) targetUserId = msg.senderId;
    }

    const [newReport] = await db
      .insert(reports)
      .values({
        reporterId: reporter ? reporter.id : null,
        targetType,
        targetId: targetIdStr,
        targetUserId,
        reason: effectiveReason,
        description: description ? String(description).slice(0, 2000) : null,
        status: 'PENDING',
      })
      .returning();

    res.json({
      success: true,
      reportId: newReport.id,
      message: targetType === 'SYSTEM' ? 'Ваше обращение успешно отправлено' : 'Жалоба успешно отправлена и передана модераторам',
    });
  } catch (err: any) {
    console.error('[Moderation] Create report error:', err);
    res.status(500).json({ error: err.message });
  }
};

publicReportsRouter.post('/reports', optionalAuth, handleReportCreation);
publicReportsRouter.post('/feedback', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { type, message, description } = req.body;
    const content = (description || message || '').trim();
    if (!content) {
      return res.status(400).json({ error: 'Текст обращения не может быть пустым' });
    }
    const reporter = req.dbUser;
    const feedbackType = type ? String(type).toUpperCase() : 'SUGGESTION';

    const [newReport] = await db
      .insert(reports)
      .values({
        reporterId: reporter ? reporter.id : null,
        targetType: 'SYSTEM',
        targetId: feedbackType,
        targetUserId: null,
        reason: feedbackType === 'BUG' ? 'OTHER' : feedbackType === 'COMPLAINT' ? 'RULES_VIOLATION' : 'OTHER',
        description: content.slice(0, 2000),
        status: 'PENDING',
      })
      .returning();

    res.json({
      success: true,
      reportId: newReport.id,
      message: 'Спасибо за ваше обращение! Оно успешно сохранено и передано администрации.',
    });
  } catch (err: any) {
    console.error('[Feedback] Create error:', err);
    res.status(500).json({ error: err.message });
  }
});
moderationRouter.post('/reports/create', optionalAuth, handleReportCreation);


// 2. List Reports (Admin/Moderator)
moderationRouter.get('/reports', requireAuth, requireStaff('MANAGE_MODERATION'), async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const offset = (page - 1) * limit;

    const statusFilter = (req.query.status as string || 'ALL').toUpperCase();
    const typeFilter = ((req.query.targetType || req.query.type) as string || 'ALL').toUpperCase();

    const conditions: any[] = [];
    if (statusFilter !== 'ALL') {
      conditions.push(eq(reports.status, statusFilter));
    }
    if (typeFilter !== 'ALL') {
      conditions.push(eq(reports.targetType, typeFilter));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db.select({ val: count() }).from(reports).where(whereClause);
    const totalCount = Number(totalRes?.val || 0);

    const items = await db
      .select({
        id: reports.id,
        targetType: reports.targetType,
        targetId: reports.targetId,
        targetUserId: reports.targetUserId,
        reason: reports.reason,
        description: reports.description,
        status: reports.status,
        moderatorComment: reports.moderatorComment,
        actionTaken: reports.actionTaken,
        resolvedAt: reports.resolvedAt,
        createdAt: reports.createdAt,
        reporterUsername: sql<string>`COALESCE((SELECT username FROM users WHERE users.id = ${reports.reporterId}), 'Аноним')`,
        reporterAvatar: sql<string>`(SELECT avatar FROM users WHERE users.id = ${reports.reporterId})`,
        targetUsername: sql<string>`(SELECT username FROM users WHERE users.id = ${reports.targetUserId})`,
        targetAvatar: sql<string>`(SELECT avatar FROM users WHERE users.id = ${reports.targetUserId})`,
        targetIsBlocked: sql<boolean>`(SELECT is_blocked FROM users WHERE users.id = ${reports.targetUserId})`,
        targetWarningCount: sql<number>`(SELECT warning_count FROM users WHERE users.id = ${reports.targetUserId})`,
        moderatorUsername: sql<string>`(SELECT username FROM users WHERE users.id = ${reports.moderatorId})`,
      })
      .from(reports)
      .where(whereClause)
      .orderBy(desc(reports.createdAt))
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
    console.error('[Moderation] List error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Hydrated Report Details
moderationRouter.get('/reports/:id', requireAuth, requireStaff('MANAGE_MODERATION'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!report) {
      return res.status(404).json({ error: 'Жалоба не найдена' });
    }

    let reporter = null;
    if (report.reporterId) {
      const [r] = await db.select({ id: users.id, username: users.username, avatar: users.avatar }).from(users).where(eq(users.id, report.reporterId)).limit(1);
      reporter = r;
    }

    let targetUser = null;
    if (report.targetUserId) {
      const [u] = await db.select().from(users).where(eq(users.id, report.targetUserId)).limit(1);
      targetUser = u;
    }

    // Hydrate the target entity
    let targetEntity: any = null;
    const targetIdNum = parseInt(report.targetId, 10);

    if (report.targetType === 'REVIEW' && !isNaN(targetIdNum)) {
      const [rev] = await db
        .select({
          review: reviews,
          mediaTitle: media.title,
          mediaPoster: media.posterUrl,
          mediaType: media.type,
        })
        .from(reviews)
        .leftJoin(media, eq(reviews.mediaId, media.id))
        .where(eq(reviews.id, targetIdNum))
        .limit(1);
      targetEntity = rev;
    } else if (report.targetType === 'COMMENT' && !isNaN(targetIdNum)) {
      const [cmt] = await db.select().from(comments).where(eq(comments.id, targetIdNum)).limit(1);
      targetEntity = cmt;
    } else if (report.targetType === 'LIST' && !isNaN(targetIdNum)) {
      const [lst] = await db.select().from(lists).where(eq(lists.id, targetIdNum)).limit(1);
      targetEntity = lst;
    } else if (report.targetType === 'TIER_LIST' && !isNaN(targetIdNum)) {
      const [tl] = await db.select().from(tierLists).where(eq(tierLists.id, targetIdNum)).limit(1);
      targetEntity = tl;
    } else if (report.targetType === 'MEDIA' && !isNaN(targetIdNum)) {
      const [med] = await db.select().from(media).where(eq(media.id, targetIdNum)).limit(1);
      targetEntity = med;
    } else if (report.targetType === 'MESSAGE' && !isNaN(targetIdNum)) {
      const [msg] = await db.select().from(directMessages).where(eq(directMessages.id, targetIdNum)).limit(1);
      targetEntity = msg;
    } else if (report.targetType === 'USER' && !isNaN(targetIdNum)) {
      targetEntity = targetUser;
    }

    res.json({
      report,
      reporter,
      targetUser,
      targetEntity,
    });
  } catch (err: any) {
    console.error('[Moderation] Detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Update Report Status (e.g. IN_REVIEW or REJECTED)
const handleReportStatusUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, moderatorComment } = req.body;
    const actor = req.dbUser!;

    const isResolved = status === 'RESOLVED' || status === 'DISMISSED';
    const [updated] = await db
      .update(reports)
      .set({
        status,
        moderatorId: actor.id,
        moderatorComment: moderatorComment || null,
        resolvedAt: isResolved ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, id))
      .returning();

    await logAdminAction({
      userId: actor.id,
      action: 'UPDATE_REPORT_STATUS',
      details: `Жалоба/обращение #${id} переведено в статус ${status}`,
      ip: req.ip,
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[Moderation] Update status error:', err);
    res.status(500).json({ error: err.message });
  }
};

moderationRouter.put('/reports/:id/status', requireAuth, requireStaff('MANAGE_MODERATION'), handleReportStatusUpdate);
moderationRouter.put('/moderation/reports/:id/status', requireAuth, requireStaff('MANAGE_MODERATION'), handleReportStatusUpdate);

// 5. Execute Moderation Action on Report
const handleReportActionExecution = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { action, moderatorComment, banHours, warningReason } = req.body;
    const actor = req.dbUser!;

    const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!report) {
      return res.status(404).json({ error: 'Жалоба не найдена' });
    }

    const targetIdNum = parseInt(report.targetId, 10);

    // Perform the moderation action on target entity
    if (action === 'DELETE' || action === 'HIDE') {
      const shouldHide = action === 'HIDE';
      if (report.targetType === 'REVIEW' && !isNaN(targetIdNum)) {
        if (action === 'DELETE') {
          await db.delete(reviews).where(eq(reviews.id, targetIdNum));
        } else {
          await db.update(reviews).set({ isHidden: true }).where(eq(reviews.id, targetIdNum));
        }
      } else if (report.targetType === 'COMMENT' && !isNaN(targetIdNum)) {
        if (action === 'DELETE') {
          await db.delete(comments).where(eq(comments.id, targetIdNum));
        } else {
          await db.update(comments).set({ isHidden: true }).where(eq(comments.id, targetIdNum));
        }
      } else if (report.targetType === 'LIST' && !isNaN(targetIdNum)) {
        if (action === 'DELETE') {
          await db.delete(lists).where(eq(lists.id, targetIdNum));
        } else {
          await db.update(lists).set({ isHidden: true }).where(eq(lists.id, targetIdNum));
        }
      } else if (report.targetType === 'TIER_LIST' && !isNaN(targetIdNum)) {
        if (action === 'DELETE') {
          await db.delete(tierLists).where(eq(tierLists.id, targetIdNum));
        } else {
          await db.update(tierLists).set({ isHidden: true }).where(eq(tierLists.id, targetIdNum));
        }
      } else if (report.targetType === 'MEDIA' && !isNaN(targetIdNum)) {
        await db.update(media).set({ isHidden: true }).where(eq(media.id, targetIdNum));
      }
    } else if (action === 'RESTORE') {
      if (report.targetType === 'REVIEW' && !isNaN(targetIdNum)) {
        await db.update(reviews).set({ isHidden: false }).where(eq(reviews.id, targetIdNum));
      } else if (report.targetType === 'COMMENT' && !isNaN(targetIdNum)) {
        await db.update(comments).set({ isHidden: false }).where(eq(comments.id, targetIdNum));
      } else if (report.targetType === 'LIST' && !isNaN(targetIdNum)) {
        await db.update(lists).set({ isHidden: false }).where(eq(lists.id, targetIdNum));
      } else if (report.targetType === 'TIER_LIST' && !isNaN(targetIdNum)) {
        await db.update(tierLists).set({ isHidden: false }).where(eq(tierLists.id, targetIdNum));
      } else if (report.targetType === 'MEDIA' && !isNaN(targetIdNum)) {
        await db.update(media).set({ isHidden: false }).where(eq(media.id, targetIdNum));
      }
    } else if (action === 'WARN_USER' && report.targetUserId) {
      const [u] = await db.select().from(users).where(eq(users.id, report.targetUserId)).limit(1);
      if (u) {
        const newCount = (u.warningCount || 0) + 1;
        const reasonStr = warningReason || moderatorComment || 'Нарушение правил сообщества';
        await db
          .update(users)
          .set({ warningCount: newCount, lastWarningReason: reasonStr })
          .where(eq(users.id, report.targetUserId));

        await notificationService.notifyUser({
          userId: report.targetUserId,
          type: 'ADMIN_ALERT',
          title: `⚠️ Предупреждение от модератора (#${newCount})`,
          body: `Вам вынесено предупреждение по жалобе #${id}. Причина: ${reasonStr}`,
        });
      }
    } else if (action === 'TEMP_BAN' && report.targetUserId) {
      const hours = parseInt(banHours, 10) || 24;
      const bannedUntil = new Date(Date.now() + hours * 3600 * 1000);
      const reasonStr = moderatorComment || 'Временный бан по результатам рассмотрения жалобы';
      await db
        .update(users)
        .set({ bannedUntil, banReason: reasonStr })
        .where(eq(users.id, report.targetUserId));

      await notificationService.notifyUser({
        userId: report.targetUserId,
        type: 'ADMIN_ALERT',
        title: '⚠️ Аккаунт временно заблокирован',
        body: `Ваш аккаунт заблокирован на ${hours} ч. до ${bannedUntil.toLocaleString('ru-RU')}. Причина: ${reasonStr}`,
      });
    } else if (action === 'BAN' && report.targetUserId) {
      const reasonStr = moderatorComment || 'Перманентный бан по результатам рассмотрения жалобы';
      await db
        .update(users)
        .set({ isBlocked: true, banReason: reasonStr, bannedUntil: null })
        .where(eq(users.id, report.targetUserId));
    }

    // Mark report resolved
    const [updated] = await db
      .update(reports)
      .set({
        status: action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED',
        actionTaken: action,
        moderatorId: actor.id,
        moderatorComment: moderatorComment || null,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reports.id, id))
      .returning();

    await logAdminAction({
      userId: actor.id,
      action: 'RESOLVE_REPORT',
      details: `Жалоба #${id} (${report.targetType} #${report.targetId}) закрыта действием: ${action}. Комментарий: ${moderatorComment || 'нет'}`,
      ip: req.ip,
    });

    res.json({
      success: true,
      report: updated,
    });
  } catch (err: any) {
    console.error('[Moderation] Action error:', err);
    res.status(500).json({ error: err.message });
  }
};

moderationRouter.post('/reports/:id/action', requireAuth, requireStaff('MANAGE_MODERATION'), handleReportActionExecution);
moderationRouter.post('/reports/:id/resolve', requireAuth, requireStaff('MANAGE_MODERATION'), handleReportActionExecution);
