import { Router, Response } from 'express';
import crypto from 'crypto';
import { requireAuth, requireStaff, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import {
  users,
  userMedia,
  reviews,
  lists,
  tierLists,
  comments,
  friendRequests,
  reports,
  adminAuditLogs,
  passwordResetTokens,
  inviteCodes,
} from '../../../db/schema.ts';
import { eq, or, and, sql, desc, ilike, count, inArray } from 'drizzle-orm';
import { logAdminAction } from './auditHelper.ts';
import { notificationService } from '../../services/notificationService.ts';

export const usersRouter = Router();

// 1. List users with search, role/status filters, pagination
usersRouter.get('/users', requireAuth, requireStaff('MANAGE_USERS'), async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10)));
    const offset = (page - 1) * limit;

    const searchQuery = (req.query.q as string || '').trim();
    const roleFilter = (req.query.role as string || 'ALL').toUpperCase();
    const statusFilter = (req.query.status as string || 'ALL').toUpperCase();

    const conditions: any[] = [];

    if (searchQuery) {
      const isNum = /^\d+$/.test(searchQuery.replace('#', ''));
      const numId = isNum ? parseInt(searchQuery.replace('#', ''), 10) : null;

      const searchConditions = [
        ilike(users.username, `%${searchQuery}%`),
        ilike(users.email, `%${searchQuery}%`),
        ilike(users.telegramUsername, `%${searchQuery}%`),
      ];

      if (numId !== null) {
        searchConditions.push(eq(users.id, numId));
      }

      conditions.push(or(...searchConditions));
    }

    if (roleFilter !== 'ALL') {
      if (roleFilter === 'STAFF') {
        conditions.push(inArray(users.role, ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER', 'NEWS_EDITOR']));
      } else {
        conditions.push(eq(users.role, roleFilter));
      }
    }

    if (statusFilter === 'BLOCKED') {
      conditions.push(eq(users.isBlocked, true));
    } else if (statusFilter === 'TEMP_BANNED') {
      conditions.push(and(eq(users.isBlocked, false), sql`${users.bannedUntil} > NOW()`));
    } else if (statusFilter === 'ACTIVE') {
      conditions.push(and(eq(users.isBlocked, false), or(sql`${users.bannedUntil} IS NULL`, sql`${users.bannedUntil} <= NOW()`)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db.select({ val: count() }).from(users).where(whereClause);
    const totalCount = Number(totalRes?.val || 0);

    const items = await db
      .select({
        id: users.id,
        uid: users.uid,
        username: users.username,
        email: users.email,
        avatar: users.avatar,
        role: users.role,
        isBlocked: users.isBlocked,
        bannedUntil: users.bannedUntil,
        banReason: users.banReason,
        warningCount: users.warningCount,
        lastWarningReason: users.lastWarningReason,
        invitesLeft: users.invitesLeft,
        telegramChatId: users.telegramChatId,
        telegramUsername: users.telegramUsername,
        createdAt: users.createdAt,
        mediaCount: sql<number>`COALESCE((SELECT COUNT(*) FROM user_media WHERE user_media.user_id = "users"."id"), 0)::int`,
        reviewsCount: sql<number>`COALESCE((SELECT COUNT(*) FROM reviews WHERE reviews.user_id = "users"."id"), 0)::int`,
        invitedByUserId: sql<number | null>`(
          SELECT ic.creator_id FROM invite_codes ic WHERE ic.used_by_id = "users"."id" LIMIT 1
        )`,
        invitedByUsername: sql<string | null>`(
          SELECT u_inv.username FROM invite_codes ic 
          LEFT JOIN users u_inv ON u_inv.id = ic.creator_id 
          WHERE ic.used_by_id = "users"."id" LIMIT 1
        )`,
        invitedByAvatar: sql<string | null>`(
          SELECT u_inv.avatar FROM invite_codes ic 
          LEFT JOIN users u_inv ON u_inv.id = ic.creator_id 
          WHERE ic.used_by_id = "users"."id" LIMIT 1
        )`,
        usedInviteCode: sql<string | null>`(
          SELECT ic.code FROM invite_codes ic WHERE ic.used_by_id = "users"."id" LIMIT 1
        )`,
        usedInviteDate: sql<string | null>`(
          SELECT ic.used_at::text FROM invite_codes ic WHERE ic.used_by_id = "users"."id" LIMIT 1
        )`,
        invitedUsersCount: sql<number>`COALESCE((
          SELECT COUNT(*) FROM invite_codes ic WHERE ic.creator_id = "users"."id" AND ic.is_used = true AND ic.used_by_id IS NOT NULL
        ), 0)::int`,
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
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
    console.error('[AdminUsers] List error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Detailed user profile & statistics
usersRouter.get('/users/:id', requireAuth, requireStaff('MANAGE_USERS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Media status counts
    const mediaBreakdownRes = await db.execute(sql`
      SELECT status, COUNT(*)::int as count
      FROM user_media
      WHERE user_id = ${id}
      GROUP BY status
    `);

    // Category breakdown
    const categoryBreakdownRes = await db.execute(sql`
      SELECT m.type as category, COUNT(*)::int as count
      FROM user_media um
      JOIN media m ON m.id = um.media_id
      WHERE um.user_id = ${id}
      GROUP BY m.type
    `);

    // Counts
    const [reviewsCountRes] = await db.select({ val: count() }).from(reviews).where(eq(reviews.userId, id));
    const [listsCountRes] = await db.select({ val: count() }).from(lists).where(eq(lists.ownerId, id));
    const [tierListsCountRes] = await db.select({ val: count() }).from(tierLists).where(eq(tierLists.ownerId, id));
    const [commentsCountRes] = await db.select({ val: count() }).from(comments).where(eq(comments.userId, id));
    const [friendsCountRes] = await db
      .select({ val: count() })
      .from(friendRequests)
      .where(and(or(eq(friendRequests.senderId, id), eq(friendRequests.receiverId, id)), eq(friendRequests.status, 'ACCEPTED')));

    // 1. Who invited this user (inviter data & invite code used)
    const [usedInviteRecord] = await db
      .select({
        code: inviteCodes.code,
        creatorId: inviteCodes.creatorId,
        createdAt: inviteCodes.createdAt,
        usedAt: inviteCodes.usedAt,
        creatorUsername: users.username,
        creatorEmail: users.email,
        creatorAvatar: users.avatar,
        creatorRole: users.role,
        creatorIsBlocked: users.isBlocked,
        creatorBannedUntil: users.bannedUntil,
      })
      .from(inviteCodes)
      .leftJoin(users, eq(inviteCodes.creatorId, users.id))
      .where(eq(inviteCodes.usedById, id))
      .limit(1);

    const invitedBy = usedInviteRecord
      ? {
          inviteCode: usedInviteRecord.code,
          inviteCreatedAt: usedInviteRecord.createdAt,
          inviteUsedAt: usedInviteRecord.usedAt,
          isSystemInvite: !usedInviteRecord.creatorId,
          inviter: usedInviteRecord.creatorId
            ? {
                id: usedInviteRecord.creatorId,
                username: usedInviteRecord.creatorUsername,
                email: usedInviteRecord.creatorEmail,
                avatar: usedInviteRecord.creatorAvatar,
                role: usedInviteRecord.creatorRole,
                isBlocked: usedInviteRecord.creatorIsBlocked,
                bannedUntil: usedInviteRecord.creatorBannedUntil,
              }
            : null,
        }
      : null;

    // 2. Who was invited by this user (all users registered through their codes)
    const invitedUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        avatar: users.avatar,
        role: users.role,
        isBlocked: users.isBlocked,
        bannedUntil: users.bannedUntil,
        warningCount: users.warningCount,
        createdAt: users.createdAt,
        inviteCode: inviteCodes.code,
        inviteCreatedAt: inviteCodes.createdAt,
        inviteUsedAt: inviteCodes.usedAt,
      })
      .from(inviteCodes)
      .innerJoin(users, eq(inviteCodes.usedById, users.id))
      .where(and(eq(inviteCodes.creatorId, id), eq(inviteCodes.isUsed, true)))
      .orderBy(desc(inviteCodes.usedAt));

    // 3. User's active/unused invite codes
    const activeInviteCodes = await db
      .select({
        id: inviteCodes.id,
        code: inviteCodes.code,
        isActive: inviteCodes.isActive,
        createdAt: inviteCodes.createdAt,
      })
      .from(inviteCodes)
      .where(and(eq(inviteCodes.creatorId, id), eq(inviteCodes.isUsed, false)))
      .orderBy(desc(inviteCodes.createdAt));

    // Reports filed against this user
    const reportsAgainstUser = await db
      .select({
        id: reports.id,
        targetType: reports.targetType,
        reason: reports.reason,
        description: reports.description,
        status: reports.status,
        actionTaken: reports.actionTaken,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.targetUserId, id))
      .orderBy(desc(reports.createdAt))
      .limit(10);

    // Audit logs for this user (actions by or targeting this user)
    const userAuditLogs = await db
      .select({
        id: adminAuditLogs.id,
        action: adminAuditLogs.action,
        details: adminAuditLogs.details,
        createdAt: adminAuditLogs.createdAt,
      })
      .from(adminAuditLogs)
      .where(or(eq(adminAuditLogs.userId, id), ilike(adminAuditLogs.details, `%@${user.username}%`)))
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(10);

    res.json({
      user: {
        id: user.id,
        uid: user.uid,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        role: user.role,
        isBlocked: user.isBlocked,
        bannedUntil: user.bannedUntil,
        banReason: user.banReason,
        warningCount: user.warningCount,
        lastWarningReason: user.lastWarningReason,
        invitesLeft: user.invitesLeft,
        telegramChatId: user.telegramChatId,
        telegramUsername: user.telegramUsername,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      stats: {
        mediaByStatus: (mediaBreakdownRes as any).rows || [],
        mediaByCategory: (categoryBreakdownRes as any).rows || [],
        reviewsCount: Number(reviewsCountRes?.val || 0),
        listsCount: Number(listsCountRes?.val || 0),
        tierListsCount: Number(tierListsCountRes?.val || 0),
        commentsCount: Number(commentsCountRes?.val || 0),
        friendsCount: Number(friendsCountRes?.val || 0),
      },
      invitedBy,
      invitedUsers,
      activeInviteCodes,
      reports: reportsAgainstUser,
      auditLogs: userAuditLogs,
    });
  } catch (err: any) {
    console.error('[AdminUsers] Detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Change user role
usersRouter.put('/users/:id/role', requireAuth, requireStaff('MANAGE_USERS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { role } = req.body;
    const actor = req.dbUser!;

    const allowedRoles = ['USER', 'musician', 'MODERATOR', 'CONTENT_MANAGER', 'NEWS_EDITOR', 'ADMIN', 'SUPER_ADMIN'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Недопустимая роль' });
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Role hierarchy rules
    if ((role === 'musician' || targetUser.role === 'musician') && actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Только администратор может назначать или изменять роль музыканта' });
    }
    if (targetUser.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Только Главный Администратор может изменять роль другого Главного Администратора' });
    }

    if (role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Только Главный Администратор может назначать роль SUPER_ADMIN' });
    }

    if ((role === 'ADMIN' || targetUser.role === 'ADMIN') && actor.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Только Главный Администратор может назначать или изменять роль ADMIN' });
    }

    // Prevent demoting the last SUPER_ADMIN
    if (targetUser.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
      const [superAdminCountRes] = await db.select({ val: count() }).from(users).where(eq(users.role, 'SUPER_ADMIN'));
      if (Number(superAdminCountRes?.val || 0) <= 1) {
        return res.status(400).json({ error: 'Нельзя понизить единственного Главного Администратора' });
      }
    }

    const [updated] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    await logAdminAction({
      userId: actor.id,
      action: 'CHANGE_ROLE',
      details: `Роль пользователя @${targetUser.username} изменена с ${targetUser.role} на ${role}`,
      ip: req.ip,
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[AdminUsers] Change role error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Permanent Block/Unblock
usersRouter.put('/users/:id/block', requireAuth, requireStaff('MANAGE_USERS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;
    const actor = req.dbUser!;

    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (targetUser.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Нельзя заблокировать Главного Администратора' });
    }

    if (targetUser.role === 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Только Главный Администратор может блокировать администраторов' });
    }

    const newStatus = !targetUser.isBlocked;
    const [updated] = await db
      .update(users)
      .set({
        isBlocked: newStatus,
        banReason: newStatus ? (reason || 'Нарушение правил сообщества') : null,
        bannedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    await logAdminAction({
      userId: actor.id,
      action: newStatus ? 'BAN_USER' : 'UNBAN_USER',
      details: `${newStatus ? 'Перманентный бан' : 'Разблокировка'} пользователя @${targetUser.username}. Причина: ${reason || 'Не указана'}`,
      ip: req.ip,
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[AdminUsers] Block error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Temporary Ban
usersRouter.put('/users/:id/temp-ban', requireAuth, requireStaff('MANAGE_USERS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { hours, reason } = req.body;
    const actor = req.dbUser!;

    const banHours = parseInt(hours, 10);
    if (isNaN(banHours) || banHours <= 0) {
      return res.status(400).json({ error: 'Укажите корректный срок бана в часах (больше 0)' });
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (targetUser.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Нельзя заблокировать Главного Администратора' });
    }

    const bannedUntil = new Date(Date.now() + banHours * 3600 * 1000);
    const banReasonText = reason || 'Временное ограничение доступа за нарушение правил';

    const [updated] = await db
      .update(users)
      .set({
        bannedUntil,
        banReason: banReasonText,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    await logAdminAction({
      userId: actor.id,
      action: 'TEMP_BAN_USER',
      details: `Временный бан пользователя @${targetUser.username} на ${banHours} ч. (до ${bannedUntil.toLocaleString('ru-RU')}). Причина: ${banReasonText}`,
      ip: req.ip,
    });

    // Notify user
    await notificationService.notifyUser({
      userId: id,
      type: 'ADMIN_ALERT',
      title: '⚠️ Доступ к аккаунту временно ограничен',
      body: `Ваш аккаунт временно заблокирован на ${banHours} ч. До: ${bannedUntil.toLocaleString('ru-RU')}. Причина: ${banReasonText}`,
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[AdminUsers] Temp ban error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Issue Warning
usersRouter.post('/users/:id/warn', requireAuth, requireStaff('MANAGE_USERS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;
    const actor = req.dbUser!;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Укажите причину предупреждения' });
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const newCount = (targetUser.warningCount || 0) + 1;

    const [updated] = await db
      .update(users)
      .set({
        warningCount: newCount,
        lastWarningReason: reason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    await logAdminAction({
      userId: actor.id,
      action: 'WARN_USER',
      details: `Вынесено предупреждение #${newCount} пользователю @${targetUser.username}: «${reason.trim()}»`,
      ip: req.ip,
    });

    // Send official notification to the user
    await notificationService.notifyUser({
      userId: id,
      type: 'ADMIN_ALERT',
      title: `⚠️ Официальное предупреждение от модератора (#${newCount})`,
      body: `Вам вынесено предупреждение по причине: «${reason.trim()}». Пожалуйста, ознакомьтесь с правилами платформы.`,
    });

    res.json({
      success: true,
      user: updated,
      warningCount: newCount,
    });
  } catch (err: any) {
    console.error('[AdminUsers] Warn error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Password Reset Link Generation
usersRouter.post('/users/:id/reset-password', requireAuth, requireStaff('MANAGE_USERS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokens).values({
      userId: id,
      tokenHash,
      expiresAt,
    });

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const resetUrl = `${protocol}://${host}/reset-password/${rawToken}`;

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'RESET_PASSWORD',
      details: `Сгенерирована ссылка сброса пароля для @${targetUser.username}`,
      ip: req.ip,
    });

    res.json({
      success: true,
      token: rawToken,
      resetUrl,
      username: targetUser.username,
      expiresAt,
    });
  } catch (err: any) {
    console.error('[AdminUsers] Reset password error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8. Adjust User Invites
usersRouter.put('/users/:id/invites', requireAuth, requireStaff('MANAGE_USERS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { count: inviteCount } = req.body;

    const countNum = parseInt(inviteCount, 10);
    if (isNaN(countNum) || countNum < 0) {
      return res.status(400).json({ error: 'Количество инвайтов должно быть неотрицательным числом' });
    }

    const [updated] = await db
      .update(users)
      .set({ invitesLeft: countNum, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'UPDATE_USER_INVITES',
      details: `Количество инвайтов для @${updated.username} изменено на ${countNum}`,
      ip: req.ip,
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[AdminUsers] Invites error:', err);
    res.status(500).json({ error: err.message });
  }
});
