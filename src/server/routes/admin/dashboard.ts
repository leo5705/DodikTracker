import { Router, Response } from 'express';
import { requireAuth, requireStaff, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import {
  users,
  media,
  userMedia,
  reviews,
  lists,
  tierLists,
  comments,
  directMessages,
  reports,
  adminAuditLogs,
  systemIntegrations,
  systemSettings,
  inviteCodes,
  news,
  announcements,
  notifications,
  friendRequests,
} from '../../../db/schema.ts';
import { sql, desc, eq, count, and, gte, isNull } from 'drizzle-orm';

export const dashboardRouter = Router();

function padDates(rows: any[], days: number): any[] {
  const result: any[] = [];
  const now = new Date();
  const dateMap = new Map<string, number>();
  
  for (const row of rows) {
    dateMap.set(row.day, row.count);
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateString = d.toISOString().split('T')[0];
    result.push({
      day: dateString,
      count: dateMap.get(dateString) || 0
    });
  }
  return result;
}

dashboardRouter.get('/dashboard', requireAuth, requireStaff('VIEW_DASHBOARD'), async (_req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // 1. User metrics
    const [totalUsersRes] = await db.select({ val: count() }).from(users);
    const [newUsers7dRes] = await db.select({ val: count() }).from(users).where(gte(users.createdAt, sevenDaysAgo));
    const [newUsers30dRes] = await db.select({ val: count() }).from(users).where(gte(users.createdAt, thirtyDaysAgo));
    const [blockedUsersRes] = await db.select({ val: count() }).from(users).where(eq(users.isBlocked, true));
    const [staffUsersRes] = await db.select({ val: count() }).from(users).where(sql`${users.role} != 'USER'`);

    // Active users: users with activity or media added in last 30d
    const activeUsersRes = await db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int as count FROM (
        SELECT user_id FROM user_media WHERE updated_at >= ${thirtyDaysAgo}
        UNION
        SELECT user_id FROM reviews WHERE created_at >= ${thirtyDaysAgo}
        UNION
        SELECT owner_id as user_id FROM lists WHERE created_at >= ${thirtyDaysAgo}
      ) active_pool
    `);
    const activeUsers30d = Number((activeUsersRes as any).rows?.[0]?.count || 0);

    // 2. Content metrics
    const [totalMediaRes] = await db.select({ val: count() }).from(media);
    const mediaByCategoryRes = await db
      .select({
        type: media.type,
        count: count(),
      })
      .from(media)
      .groupBy(media.type);

    const [hiddenMediaRes] = await db.select({ val: count() }).from(media).where(eq(media.isHidden, true));

    // 3. Engagement metrics
    const [totalUserMediaRes] = await db.select({ val: count() }).from(userMedia);
    const [totalReviewsRes] = await db.select({ val: count() }).from(reviews);
    const [totalListsRes] = await db.select({ val: count() }).from(lists);
    const [totalTierListsRes] = await db.select({ val: count() }).from(tierLists);
    const [totalCommentsRes] = await db.select({ val: count() }).from(comments);
    const [totalMessagesRes] = await db.select({ val: count() }).from(directMessages);
    
    const [totalFriendRequestsRes] = await db.select({ val: count() }).from(friendRequests);
    const [acceptedFriendRequestsRes] = await db.select({ val: count() }).from(friendRequests).where(eq(friendRequests.status, 'ACCEPTED'));

    // 4. Moderation metrics
    const [pendingReportsRes] = await db.select({ val: count() }).from(reports).where(eq(reports.status, 'PENDING'));
    const [totalReportsRes] = await db.select({ val: count() }).from(reports);
    const [resolvedReportsRes] = await db.select({ val: count() }).from(reports).where(eq(reports.status, 'RESOLVED'));

    // 5. System integrations summary
    const allIntegrations = await db.select().from(systemIntegrations);
    const integrationsStatus = {
      total: allIntegrations.length,
      enabled: allIntegrations.filter((i) => i.enabled).length,
      hasErrors: allIntegrations.filter((i) => !!i.lastError).length,
    };

    // 6. Settings summary
    const settingsList = await db.select().from(systemSettings);
    const settingsMap = new Map(settingsList.map((s) => [s.key, s.value]));
    const regMode = settingsMap.get('site_access_mode') || 'OPEN';
    const maintenanceMode = regMode === 'MAINTENANCE' || settingsMap.get('maintenance_mode') === 'true';

    // Additional Stats requested by User
    
    // Invites
    const [totalInvitesRes] = await db.select({ val: count() }).from(inviteCodes);
    const [activeInvitesRes] = await db.select({ val: count() }).from(inviteCodes).where(eq(inviteCodes.isActive, true));
    const [usedInvitesRes] = await db.select({ val: count() }).from(inviteCodes).where(eq(inviteCodes.isUsed, true));
    
    // News
    const [totalNewsRes] = await db.select({ val: count() }).from(news);
    const [publishedNewsRes] = await db.select({ val: count() }).from(news).where(eq(news.status, 'PUBLISHED'));
    const [draftNewsRes] = await db.select({ val: count() }).from(news).where(eq(news.status, 'DRAFT'));
    const [archivedNewsRes] = await db.select({ val: count() }).from(news).where(eq(news.status, 'ARCHIVED'));
    
    // Announcements
    const [totalAnnouncementsRes] = await db.select({ val: count() }).from(announcements);
    const [activeAnnouncementsRes] = await db.select({ val: count() }).from(announcements).where(eq(announcements.isActive, true));
    const [publishedAnnouncementsRes] = await db.select({ val: count() }).from(announcements).where(eq(announcements.status, 'PUBLISHED'));
    
    // Notifications
    const [totalNotificationsRes] = await db.select({ val: count() }).from(notifications);
    const [unreadNotificationsRes] = await db.select({ val: count() }).from(notifications).where(eq(notifications.isRead, false));

    // 7. Daily trends (last 14 days)
    const dailyRegistrationsRes = await db.execute(sql`
      SELECT TO_CHAR(timezone('UTC', created_at), 'YYYY-MM-DD') as day, COUNT(*)::int as count
      FROM users
      WHERE created_at >= ${fourteenDaysAgo}
      GROUP BY day
      ORDER BY day ASC
    `);

    const dailyReviewsRes = await db.execute(sql`
      SELECT TO_CHAR(timezone('UTC', created_at), 'YYYY-MM-DD') as day, COUNT(*)::int as count
      FROM reviews
      WHERE created_at >= ${fourteenDaysAgo}
      GROUP BY day
      ORDER BY day ASC
    `);

    const dailyUserMediaRes = await db.execute(sql`
      SELECT TO_CHAR(timezone('UTC', created_at), 'YYYY-MM-DD') as day, COUNT(*)::int as count
      FROM user_media
      WHERE created_at >= ${fourteenDaysAgo}
      GROUP BY day
      ORDER BY day ASC
    `);

    const dailyReportsRes = await db.execute(sql`
      SELECT TO_CHAR(timezone('UTC', created_at), 'YYYY-MM-DD') as day, COUNT(*)::int as count
      FROM reports
      WHERE created_at >= ${fourteenDaysAgo}
      GROUP BY day
      ORDER BY day ASC
    `);

    // 8. Recent audit logs
    const recentAudit = await db
      .select({
        id: adminAuditLogs.id,
        action: adminAuditLogs.action,
        details: adminAuditLogs.details,
        ip: adminAuditLogs.ip,
        createdAt: adminAuditLogs.createdAt,
        adminUsername: users.username,
        adminAvatar: users.avatar,
      })
      .from(adminAuditLogs)
      .leftJoin(users, eq(adminAuditLogs.userId, users.id))
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(8);

    res.json({
      users: {
        total: Number(totalUsersRes?.val || 0),
        active30d: activeUsers30d,
        new7d: Number(newUsers7dRes?.val || 0),
        new30d: Number(newUsers30dRes?.val || 0),
        blocked: Number(blockedUsersRes?.val || 0),
        staff: Number(staffUsersRes?.val || 0),
      },
      content: {
        total: Number(totalMediaRes?.val || 0),
        hidden: Number(hiddenMediaRes?.val || 0),
        byCategory: mediaByCategoryRes,
      },
      engagement: {
        userMedia: Number(totalUserMediaRes?.val || 0),
        reviews: Number(totalReviewsRes?.val || 0),
        lists: Number(totalListsRes?.val || 0),
        tierLists: Number(totalTierListsRes?.val || 0),
        comments: Number(totalCommentsRes?.val || 0),
        messages: Number(totalMessagesRes?.val || 0),
        friendRequestsTotal: Number(totalFriendRequestsRes?.val || 0),
        friendRequestsAccepted: Number(acceptedFriendRequestsRes?.val || 0),
      },
      moderation: {
        pending: Number(pendingReportsRes?.val || 0),
        total: Number(totalReportsRes?.val || 0),
        resolved: Number(resolvedReportsRes?.val || 0),
      },
      system: {
        registrationMode: regMode,
        maintenanceMode,
        integrations: integrationsStatus,
      },
      additionalStats: {
        invites: {
          total: Number(totalInvitesRes?.val || 0),
          active: Number(activeInvitesRes?.val || 0),
          used: Number(usedInvitesRes?.val || 0),
        },
        news: {
          total: Number(totalNewsRes?.val || 0),
          published: Number(publishedNewsRes?.val || 0),
          drafts: Number(draftNewsRes?.val || 0),
          archived: Number(archivedNewsRes?.val || 0),
        },
        announcements: {
          total: Number(totalAnnouncementsRes?.val || 0),
          active: Number(activeAnnouncementsRes?.val || 0),
          published: Number(publishedAnnouncementsRes?.val || 0),
        },
        notifications: {
          total: Number(totalNotificationsRes?.val || 0),
          unread: Number(unreadNotificationsRes?.val || 0),
        }
      },
      trends: {
        registrations: padDates((dailyRegistrationsRes as any).rows || [], 14),
        reviews: padDates((dailyReviewsRes as any).rows || [], 14),
        userMedia: padDates((dailyUserMediaRes as any).rows || [], 14),
        reports: padDates((dailyReportsRes as any).rows || [], 14),
      },
      recentAudit,
    });
  } catch (err: any) {
    console.error('[AdminDashboard] Error:', err);
    res.status(500).json({ error: err.message });
  }
});
