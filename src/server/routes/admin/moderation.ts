import { Router, Response } from 'express';
import { requireAuth, requireStaff, optionalAuth, AuthRequest, hasStaffPermission } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import {
  reports,
  reportReplies,
  users,
  reviews,
  comments,
  lists,
  tierLists,
  media,
  directMessages,
  musicReviews,
  musicReleases,
  artistProfiles,
} from '../../../db/schema.ts';
import { eq, and, sql, desc, asc, count, inArray } from 'drizzle-orm';
import { logAdminAction } from './auditHelper.ts';
import { notificationService } from '../../services/notificationService.ts';

export const moderationRouter = Router();

// Public / User-facing Reports & Feedback Router
export const publicReportsRouter = Router();

const handleReportCreation = async (req: AuthRequest, res: Response) => {
  try {
    const { targetType, targetId, reason, description, subject } = req.body;
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
    const targetIdStr = String(targetId).trim();
    const targetIdNum = parseInt(targetIdStr, 10);

    // Resolve targetUserId based on entity type & verify entity existence
    if (targetType === 'USER') {
      targetUserId = !isNaN(targetIdNum) ? targetIdNum : null;
      if (targetUserId) {
        const [targetU] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
        if (!targetU) {
          return res.status(404).json({ error: 'Пользователь не найден' });
        }
      }
    } else if (targetType === 'MUSIC_REVIEW') {
      if (isNaN(targetIdNum) || targetIdNum <= 0) {
        return res.status(400).json({ error: 'Некорректный идентификатор музыкального отзыва' });
      }
      const [mRev] = await db
        .select({
          id: musicReviews.id,
          userId: musicReviews.userId,
          releaseId: musicReviews.releaseId,
        })
        .from(musicReviews)
        .where(eq(musicReviews.id, targetIdNum))
        .limit(1);

      if (!mRev) {
        return res.status(404).json({ error: 'Музыкальный отзыв не найден' });
      }
      targetUserId = mRev.userId;

      // Self-report prevention
      if (reporter && reporter.id === mRev.userId) {
        return res.status(400).json({ error: 'Вы не можете отправить жалобу на собственный отзыв' });
      }
    } else if (targetType === 'REVIEW' && !isNaN(targetIdNum)) {
      const [rev] = await db.select({ userId: reviews.userId }).from(reviews).where(eq(reviews.id, targetIdNum)).limit(1);
      if (!rev) {
        return res.status(404).json({ error: 'Отзыв не найден' });
      }
      targetUserId = rev.userId;
      if (reporter && reporter.id === rev.userId) {
        return res.status(400).json({ error: 'Вы не можете отправить жалобу на собственный отзыв' });
      }
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

    // Duplicate report prevention: only 1 active (PENDING or IN_REVIEW) report per user per target
    if (reporter) {
      const [existingReport] = await db
        .select({ id: reports.id })
        .from(reports)
        .where(
          and(
            eq(reports.reporterId, reporter.id),
            eq(reports.targetType, targetType),
            eq(reports.targetId, targetIdStr),
            inArray(reports.status, ['PENDING', 'IN_REVIEW'])
          )
        )
        .limit(1);

      if (existingReport) {
        return res.status(409).json({
          error: 'Вы уже отправили жалобу на этот объект. Она находится на рассмотрении модераторов.',
          reportId: existingReport.id,
        });
      }
    }

    const [newReport] = await db
      .insert(reports)
      .values({
        reporterId: reporter ? reporter.id : null,
        targetType,
        targetId: targetIdStr,
        targetUserId,
        reason: effectiveReason,
        subject: subject ? String(subject).slice(0, 255) : null,
        description: description ? String(description).slice(0, 2000) : null,
        status: 'PENDING',
      })
      .returning();

    // Notify moderation staff about the new report
    try {
      const staffUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.role, ['SUPER_ADMIN', 'ADMIN', 'MODERATOR']), eq(users.isBlocked, false)));

      for (const staff of staffUsers) {
        await notificationService.create({
          recipientUserId: staff.id,
          type: 'SYSTEM',
          title: '⚠️ Новая жалоба на модерацию',
          body: `Поступила жалоба на ${targetType === 'MUSIC_REVIEW' ? 'музыкальный отзыв' : targetType} (${effectiveReason}).`,
          link: '/admin?tab=moderation',
          entityType: 'REPORT',
          entityId: String(newReport.id),
          actorUserId: reporter ? reporter.id : undefined,
          dedupKey: `MODERATION_REPORT:${newReport.id}`,
          dedupWindowSeconds: 300,
        });
      }
    } catch (notifErr) {
      console.error('[Moderation] Notify staff error:', notifErr);
    }

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
      report: newReport,
      message: 'Спасибо за ваше обращение! Оно успешно сохранено и передано администрации.',
    });
  } catch (err: any) {
    console.error('[Feedback] Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// User: List my feedback submissions
publicReportsRouter.get(['/feedback/my', '/feedback'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const myReports = await db
      .select({
        id: reports.id,
        targetType: reports.targetType,
        targetId: reports.targetId,
        subject: reports.subject,
        reason: reports.reason,
        description: reports.description,
        status: reports.status,
        moderatorComment: reports.moderatorComment,
        actionTaken: reports.actionTaken,
        resolvedAt: reports.resolvedAt,
        createdAt: reports.createdAt,
        updatedAt: reports.updatedAt,
        replyCount: sql<number>`CAST(COUNT(DISTINCT ${reportReplies.id}) AS integer)`,
        lastReplyAt: sql<string>`MAX(${reportReplies.createdAt})`,
      })
      .from(reports)
      .leftJoin(reportReplies, eq(reports.id, reportReplies.reportId))
      .where(and(eq(reports.reporterId, user.id), eq(reports.targetType, 'SYSTEM')))
      .groupBy(reports.id)
      .orderBy(desc(reports.createdAt));

    res.json({ items: myReports });
  } catch (err: any) {
    console.error('[Feedback] Get my feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// User / Staff: Get single feedback/report detail with full reply thread
publicReportsRouter.get(['/feedback/:id', '/reports/:id/thread'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Неверный идентификатор обращения' });
    }

    const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!report) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    const user = req.dbUser!;
    const isStaff = hasStaffPermission(user.role, 'MANAGE_MODERATION');

    // Security: Regular users can ONLY access their own feedback/reports
    if (!isStaff && report.reporterId !== user.id) {
      return res.status(403).json({ error: 'У вас нет доступа к этому обращению' });
    }

    // Reporter Info
    let reporter = null;
    if (report.reporterId) {
      const [r] = await db
        .select({ id: users.id, username: users.username, avatar: users.avatar, role: users.role })
        .from(users)
        .where(eq(users.id, report.reporterId))
        .limit(1);
      reporter = r;
    }

    // Thread Replies
    const repliesList = await db
      .select({
        id: reportReplies.id,
        reportId: reportReplies.reportId,
        authorUserId: reportReplies.authorUserId,
        message: reportReplies.message,
        isAdminResponse: reportReplies.isAdminResponse,
        createdAt: reportReplies.createdAt,
        authorUsername: users.username,
        authorAvatar: users.avatar,
        authorRole: users.role,
      })
      .from(reportReplies)
      .leftJoin(users, eq(reportReplies.authorUserId, users.id))
      .where(eq(reportReplies.reportId, id))
      .orderBy(asc(reportReplies.createdAt));

    res.json({
      report,
      reporter,
      replies: repliesList,
    });
  } catch (err: any) {
    console.error('[Feedback] Thread detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// User / Admin: Post a reply to feedback / report
const handlePostReply = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Неверный идентификатор' });
    }

    const message = (req.body.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!report) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    const actor = req.dbUser!;
    const isStaff = hasStaffPermission(actor.role, 'MANAGE_MODERATION');
    const isReporter = report.reporterId === actor.id;

    if (!isStaff && !isReporter) {
      return res.status(403).json({ error: 'У вас нет доступа к этому обращению' });
    }

    // Security: Only verified staff can post with isAdminResponse = true
    const isAdminResponse = isStaff;

    const [newReply] = await db
      .insert(reportReplies)
      .values({
        reportId: id,
        authorUserId: actor.id,
        message,
        isAdminResponse,
      })
      .returning();

    // If Admin replied:
    if (isAdminResponse) {
      const nextStatus = req.body.status || (report.status === 'PENDING' ? 'IN_REVIEW' : report.status);
      await db
        .update(reports)
        .set({
          moderatorId: actor.id,
          moderatorComment: message,
          status: nextStatus,
          resolvedAt: nextStatus === 'RESOLVED' || nextStatus === 'DISMISSED' ? new Date() : report.resolvedAt,
          updatedAt: new Date(),
        })
        .where(eq(reports.id, id));

      await logAdminAction({
        userId: actor.id,
        action: 'REPLY_FEEDBACK',
        details: `Администратор ответил на обращение/жалобу #${id}: «${message.slice(0, 80)}»`,
        ip: req.ip,
      });

      // Send notification to the feedback author
      if (report.reporterId) {
        notificationService
          .notifyFeedbackReplied(
            { id: actor.id, username: actor.username, avatar: actor.avatar },
            report.reporterId,
            id,
            message
          )
          .catch((err) => console.error('[Notification] Feedback reply notify error:', err));
      }
    } else {
      // User replied to their own ticket: reopen/update status to IN_REVIEW if it was previously closed
      const nextStatus = report.status === 'RESOLVED' || report.status === 'DISMISSED' ? 'IN_REVIEW' : report.status;
      await db
        .update(reports)
        .set({
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(reports.id, id));
    }

    res.json({
      success: true,
      reply: {
        ...newReply,
        authorUsername: actor.username,
        authorAvatar: actor.avatar,
        authorRole: actor.role,
      },
    });
  } catch (err: any) {
    console.error('[Feedback] Reply error:', err);
    res.status(500).json({ error: err.message });
  }
};

publicReportsRouter.post(['/feedback/:id/reply', '/reports/:id/reply'], requireAuth, handlePostReply);
moderationRouter.post(['/reports/:id/reply', '/feedback/:id/reply'], requireAuth, requireStaff('MANAGE_MODERATION'), handlePostReply);
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
        subject: reports.subject,
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

    // Enrich items with entity previews safely
    const musicReviewIds = items.filter(r => r.targetType === 'MUSIC_REVIEW').map(r => parseInt(r.targetId, 10)).filter(id => !isNaN(id));
    const contentReviewIds = items.filter(r => r.targetType === 'REVIEW').map(r => parseInt(r.targetId, 10)).filter(id => !isNaN(id));
    const commentIds = items.filter(r => r.targetType === 'COMMENT').map(r => parseInt(r.targetId, 10)).filter(id => !isNaN(id));
    const listIds = items.filter(r => r.targetType === 'LIST').map(r => parseInt(r.targetId, 10)).filter(id => !isNaN(id));
    const tierListIds = items.filter(r => r.targetType === 'TIER_LIST').map(r => parseInt(r.targetId, 10)).filter(id => !isNaN(id));
    const mediaIds = items.filter(r => r.targetType === 'MEDIA').map(r => parseInt(r.targetId, 10)).filter(id => !isNaN(id));

    const musicReviewMap = new Map<number, any>();
    if (musicReviewIds.length > 0) {
      const mRevRows = await db
        .select({
          id: musicReviews.id,
          overallScore: musicReviews.overallScore,
          text: musicReviews.text,
          releaseTitle: musicReleases.title,
          artistStageName: artistProfiles.stageName,
        })
        .from(musicReviews)
        .leftJoin(musicReleases, eq(musicReviews.releaseId, musicReleases.id))
        .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
        .where(inArray(musicReviews.id, musicReviewIds));

      mRevRows.forEach((row) => {
        musicReviewMap.set(row.id, {
          title: `Релиз «${row.releaseTitle || 'Музыкальный релиз'}» (${row.artistStageName || 'Исполнитель'}) • ${row.overallScore}/100`,
          text: row.text,
        });
      });
    }

    const contentReviewMap = new Map<number, any>();
    if (contentReviewIds.length > 0) {
      const revRows = await db
        .select({
          id: reviews.id,
          title: reviews.title,
          content: reviews.content,
          isHidden: reviews.isHidden,
          mediaTitle: media.title,
        })
        .from(reviews)
        .leftJoin(media, eq(reviews.mediaId, media.id))
        .where(inArray(reviews.id, contentReviewIds));

      revRows.forEach((row) => {
        contentReviewMap.set(row.id, {
          title: row.title || (row.mediaTitle ? `Отзыв к «${row.mediaTitle}»` : 'Отзыв'),
          text: row.content,
          isHidden: row.isHidden,
        });
      });
    }

    const commentMap = new Map<number, any>();
    if (commentIds.length > 0) {
      const cmtRows = await db
        .select({ id: comments.id, content: comments.content, isHidden: comments.isHidden })
        .from(comments)
        .where(inArray(comments.id, commentIds));
      cmtRows.forEach(c => commentMap.set(c.id, { text: c.content, isHidden: c.isHidden }));
    }

    const listMap = new Map<number, any>();
    if (listIds.length > 0) {
      const lRows = await db
        .select({ id: lists.id, title: lists.title, description: lists.description, isHidden: lists.isHidden })
        .from(lists)
        .where(inArray(lists.id, listIds));
      lRows.forEach(l => listMap.set(l.id, { title: l.title, text: l.description, isHidden: l.isHidden }));
    }

    const tierListMap = new Map<number, any>();
    if (tierListIds.length > 0) {
      const tlRows = await db
        .select({ id: tierLists.id, title: tierLists.title, description: tierLists.description, isHidden: tierLists.isHidden })
        .from(tierLists)
        .where(inArray(tierLists.id, tierListIds));
      tlRows.forEach(tl => tierListMap.set(tl.id, { title: tl.title, text: tl.description, isHidden: tl.isHidden }));
    }

    const mediaMap = new Map<number, any>();
    if (mediaIds.length > 0) {
      const mRows = await db
        .select({ id: media.id, title: media.title, description: media.description, isHidden: media.isHidden })
        .from(media)
        .where(inArray(media.id, mediaIds));
      mRows.forEach(m => mediaMap.set(m.id, { title: m.title, text: m.description, isHidden: m.isHidden }));
    }

    const enrichedItems = items.map((r) => {
      const targetIdNum = parseInt(r.targetId, 10);
      let preview: any = null;
      if (!isNaN(targetIdNum)) {
        if (r.targetType === 'MUSIC_REVIEW') preview = musicReviewMap.get(targetIdNum) || null;
        else if (r.targetType === 'REVIEW') preview = contentReviewMap.get(targetIdNum) || null;
        else if (r.targetType === 'COMMENT') preview = commentMap.get(targetIdNum) || null;
        else if (r.targetType === 'LIST') preview = listMap.get(targetIdNum) || null;
        else if (r.targetType === 'TIER_LIST') preview = tierListMap.get(targetIdNum) || null;
        else if (r.targetType === 'MEDIA') preview = mediaMap.get(targetIdNum) || null;
      }
      return {
        ...r,
        preview,
      };
    });

    res.json({
      items: enrichedItems,
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

    if (report.targetType === 'MUSIC_REVIEW' && !isNaN(targetIdNum)) {
      const [mRev] = await db
        .select({
          review: musicReviews,
          releaseTitle: musicReleases.title,
          releaseCover: musicReleases.cover,
          releaseSlug: musicReleases.slug,
          artistStageName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          authorUsername: users.username,
          authorAvatar: users.avatar,
        })
        .from(musicReviews)
        .leftJoin(musicReleases, eq(musicReviews.releaseId, musicReleases.id))
        .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
        .leftJoin(users, eq(musicReviews.userId, users.id))
        .where(eq(musicReviews.id, targetIdNum))
        .limit(1);
      targetEntity = mRev || null;
    } else if (report.targetType === 'REVIEW' && !isNaN(targetIdNum)) {
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

    // Hydrate replies
    const repliesList = await db
      .select({
        id: reportReplies.id,
        reportId: reportReplies.reportId,
        authorUserId: reportReplies.authorUserId,
        message: reportReplies.message,
        isAdminResponse: reportReplies.isAdminResponse,
        createdAt: reportReplies.createdAt,
        authorUsername: users.username,
        authorAvatar: users.avatar,
        authorRole: users.role,
      })
      .from(reportReplies)
      .leftJoin(users, eq(reportReplies.authorUserId, users.id))
      .where(eq(reportReplies.reportId, id))
      .orderBy(asc(reportReplies.createdAt));

    res.json({
      report,
      reporter,
      targetUser,
      targetEntity,
      replies: repliesList,
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

    if (updated?.reporterId && moderatorComment) {
      notificationService.notifyFeedbackReplied(
        { id: actor.id, username: actor.username, avatar: actor.avatar },
        updated.reporterId,
        id,
        moderatorComment
      ).catch(() => {});
    }

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
    if (action === 'DELETE' || action === 'HIDE' || action === 'CONTENT_HIDDEN' || action === 'HIDE_CONTENT') {
      const shouldHide = action === 'HIDE' || action === 'CONTENT_HIDDEN' || action === 'HIDE_CONTENT';
      if (report.targetType === 'MUSIC_REVIEW' && !isNaN(targetIdNum)) {
        // Music review removal
        await db.delete(musicReviews).where(eq(musicReviews.id, targetIdNum));
      } else if (report.targetType === 'REVIEW' && !isNaN(targetIdNum)) {
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

    if (report?.reporterId && moderatorComment) {
      notificationService.notifyFeedbackReplied(
        { id: actor.id, username: actor.username, avatar: actor.avatar },
        report.reporterId,
        id,
        moderatorComment
      ).catch(() => {});
    }

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
