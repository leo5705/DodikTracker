import { Router, Response } from 'express';
import crypto from 'crypto';
import { requireAuth, requireStaff, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import {
  systemSettings,
  systemIntegrations,
  adminAuditLogs,
  apiLogs,
  inviteCodes,
  users,
} from '../../../db/schema.ts';
import { eq, and, sql, or, desc, count, ilike } from 'drizzle-orm';
import { logAdminAction } from './auditHelper.ts';

export const settingsRouter = Router();

// Helper to get all settings as key-value map
async function getSettingsMap() {
  const all = await db.select().from(systemSettings);
  const map: Record<string, string> = {};
  for (const s of all) {
    map[s.key] = s.value;
  }
  return map;
}

// 1. Get All System Settings
settingsRouter.get('/settings', requireAuth, requireStaff('MANAGE_SETTINGS'), async (_req: AuthRequest, res: Response) => {
  try {
    const map = await getSettingsMap();
    const mode = (map.site_access_mode || 'OPEN').toUpperCase();
    const validModes = ['OPEN', 'INVITE_ONLY', 'CLOSED', 'MAINTENANCE'];
    const safeMode = validModes.includes(mode) ? mode : 'OPEN';

    res.json({
      site_access_mode: safeMode,
      siteAccessMode: safeMode,
      maintenance_message: map.maintenance_message || 'Сервис находится на техническом обслуживании',
      site_name: map.site_name || 'Dodik Tracker',
      siteName: map.site_name || 'Dodik Tracker',
      site_motto: map.site_motto || 'Трекер фильмов, аниме, сериалов и игр',
      siteMotto: map.site_motto || 'Трекер фильмов, аниме, сериалов и игр',
      default_invites: map.default_invites || '3',
      allowGuestReviews: map.allow_guest_reviews !== 'false',
      allow_guest_reviews: map.allow_guest_reviews !== 'false',
      maxCommentsPerMinute: parseInt(map.max_comments_per_minute || '5', 10),
      max_comments_per_minute: parseInt(map.max_comments_per_minute || '5', 10),
      maxAvatarSizeMb: parseInt(map.max_avatar_size_mb || '5', 10),
      max_avatar_size_mb: parseInt(map.max_avatar_size_mb || '5', 10),
    });
  } catch (err: any) {
    console.error('[Settings] Get error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update settings handler (used for both PUT and POST)
const handleUpdateSettings = async (req: AuthRequest, res: Response) => {
  try {
    const updates = req.body; // Record<string, any>
    const actor = req.dbUser!;

    const keyMapping: Record<string, string> = {
      site_access_mode: 'site_access_mode',
      siteAccessMode: 'site_access_mode',
      maintenance_message: 'maintenance_message',
      site_name: 'site_name',
      siteName: 'site_name',
      site_motto: 'site_motto',
      siteMotto: 'site_motto',
      default_invites: 'default_invites',
      allow_guest_reviews: 'allow_guest_reviews',
      allowGuestReviews: 'allow_guest_reviews',
      max_comments_per_minute: 'max_comments_per_minute',
      maxCommentsPerMinute: 'max_comments_per_minute',
      max_avatar_size_mb: 'max_avatar_size_mb',
      maxAvatarSizeMb: 'max_avatar_size_mb',
    };

    const validModes = ['OPEN', 'INVITE_ONLY', 'CLOSED', 'MAINTENANCE'];

    // 1. Group updates strictly by dbKey to prevent alias overwrites
    const normalizedUpdates: Record<string, string> = {};

    for (const [rawKey, val] of Object.entries(updates)) {
      const dbKey = keyMapping[rawKey];
      if (!dbKey) continue;

      let stringVal: string;
      if (typeof val === 'boolean') {
        stringVal = val ? 'true' : 'false';
      } else {
        stringVal = String(val);
      }

      if (dbKey === 'site_access_mode') {
        stringVal = stringVal.toUpperCase();
        if (!validModes.includes(stringVal)) {
          continue;
        }
      }

      // If snake_case key is passed, give it precedence over alias camelCase key
      if (normalizedUpdates[dbKey] === undefined || rawKey === dbKey) {
        normalizedUpdates[dbKey] = stringVal;
      }
    }

    const updatedKeys: string[] = [];

    // 2. Persist normalized settings to system_settings table
    for (const [dbKey, stringVal] of Object.entries(normalizedUpdates)) {
      const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, dbKey)).limit(1);
      if (existing) {
        await db.update(systemSettings).set({ value: stringVal, updatedAt: new Date() }).where(eq(systemSettings.key, dbKey));
      } else {
        await db.insert(systemSettings).values({ key: dbKey, value: stringVal, description: 'Системная настройка' });
      }
      updatedKeys.push(dbKey);
    }

    if (updatedKeys.length > 0) {
      await logAdminAction({
        userId: actor.id,
        action: 'UPDATE_SETTINGS',
        details: `Обновлены системные настройки: ${updatedKeys.join(', ')}`,
        ip: req.ip,
      });
    }

    const map = await getSettingsMap();
    const mode = (map.site_access_mode || 'OPEN').toUpperCase();
    const safeMode = validModes.includes(mode) ? mode : 'OPEN';

    res.json({
      success: true,
      message: 'Настройки успешно сохранены',
      settings: {
        site_access_mode: safeMode,
        siteAccessMode: safeMode,
        maintenance_message: map.maintenance_message || 'Сервис находится на техническом обслуживании',
        site_name: map.site_name || 'Dodik Tracker',
        siteName: map.site_name || 'Dodik Tracker',
        site_motto: map.site_motto || 'Трекер фильмов, аниме, сериалов и игр',
        siteMotto: map.site_motto || 'Трекер фильмов, аниме, сериалов и игр',
        default_invites: map.default_invites || '3',
        allowGuestReviews: map.allow_guest_reviews !== 'false',
        allow_guest_reviews: map.allow_guest_reviews !== 'false',
        maxCommentsPerMinute: parseInt(map.max_comments_per_minute || '5', 10),
        max_comments_per_minute: parseInt(map.max_comments_per_minute || '5', 10),
        maxAvatarSizeMb: parseInt(map.max_avatar_size_mb || '5', 10),
        max_avatar_size_mb: parseInt(map.max_avatar_size_mb || '5', 10),
      },
    });
  } catch (err: any) {
    console.error('[Settings] Update error:', err);
    res.status(500).json({ error: err.message });
  }
};

// 2. Update System Settings (support both PUT and POST)
settingsRouter.put('/settings', requireAuth, requireStaff('MANAGE_SETTINGS'), handleUpdateSettings);
settingsRouter.post('/settings', requireAuth, requireStaff('MANAGE_SETTINGS'), handleUpdateSettings);

// 3. List Invite Codes with filtering, search and stats
settingsRouter.get('/invites', requireAuth, requireStaff('MANAGE_SETTINGS'), async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10)));
    const offset = (page - 1) * limit;
    const status = String(req.query.status || 'ALL').toUpperCase();
    const query = String(req.query.q || '').trim();

    // Base conditions
    const conditions = [];
    if (status === 'ACTIVE') {
      conditions.push(and(eq(inviteCodes.isUsed, false), eq(inviteCodes.isActive, true)));
    } else if (status === 'USED') {
      conditions.push(eq(inviteCodes.isUsed, true));
    } else if (status === 'DISABLED') {
      conditions.push(eq(inviteCodes.isActive, false));
    }

    if (query) {
      conditions.push(
        sql`(${inviteCodes.code} ILIKE ${'%' + query + '%'} OR (SELECT username FROM users WHERE users.id = ${inviteCodes.creatorId}) ILIKE ${'%' + query + '%'} OR (SELECT username FROM users WHERE users.id = ${inviteCodes.usedById}) ILIKE ${'%' + query + '%'})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db.select({ val: count() }).from(inviteCodes).where(whereClause);
    const totalCount = Number(totalRes?.val || 0);

    // Global counts for badges
    const [allCountRes] = await db.select({ val: count() }).from(inviteCodes);
    const [activeCountRes] = await db.select({ val: count() }).from(inviteCodes).where(and(eq(inviteCodes.isUsed, false), eq(inviteCodes.isActive, true)));
    const [usedCountRes] = await db.select({ val: count() }).from(inviteCodes).where(eq(inviteCodes.isUsed, true));
    const [disabledCountRes] = await db.select({ val: count() }).from(inviteCodes).where(eq(inviteCodes.isActive, false));

    const items = await db
      .select({
        id: inviteCodes.id,
        code: inviteCodes.code,
        creatorId: inviteCodes.creatorId,
        usedById: inviteCodes.usedById,
        isUsed: inviteCodes.isUsed,
        isActive: inviteCodes.isActive,
        usedAt: inviteCodes.usedAt,
        createdAt: inviteCodes.createdAt,
        creatorUsername: sql<string>`(SELECT username FROM users WHERE users.id = ${inviteCodes.creatorId})`,
        creatorAvatar: sql<string>`(SELECT avatar FROM users WHERE users.id = ${inviteCodes.creatorId})`,
        usedByUsername: sql<string>`(SELECT username FROM users WHERE users.id = ${inviteCodes.usedById})`,
        usedByAvatar: sql<string>`(SELECT avatar FROM users WHERE users.id = ${inviteCodes.usedById})`,
      })
      .from(inviteCodes)
      .where(whereClause)
      .orderBy(desc(inviteCodes.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      items,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      stats: {
        total: Number(allCountRes?.val || 0),
        active: Number(activeCountRes?.val || 0),
        used: Number(usedCountRes?.val || 0),
        disabled: Number(disabledCountRes?.val || 0),
      },
    });
  } catch (err: any) {
    console.error('[Settings] Invites error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Generate System Invite Codes (Admin Unlimited)
settingsRouter.post('/invites/generate', requireAuth, requireStaff('MANAGE_SETTINGS'), async (req: AuthRequest, res: Response) => {
  try {
    const { count: qty, prefix } = req.body;
    const actor = req.dbUser!;
    const num = Math.min(100, Math.max(1, parseInt(qty, 10) || 5));
    const codePrefix = prefix ? String(prefix).toUpperCase().replace(/[^A-Z0-9]/g, '') : 'DODIK';

    const createdCodes: string[] = [];

    for (let i = 0; i < num; i++) {
      const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
      const code = `${codePrefix}-${randomPart}`;
      await db.insert(inviteCodes).values({
        code,
        creatorId: actor.id,
        isUsed: false,
        isActive: true,
      });
      createdCodes.push(code);
    }

    await logAdminAction({
      userId: actor.id,
      action: 'GENERATE_INVITES',
      details: `Сгенерировано ${num} инвайт-кодов с префиксом ${codePrefix}`,
      ip: req.ip,
    });

    res.json({
      success: true,
      count: num,
      codes: createdCodes,
    });
  } catch (err: any) {
    console.error('[Settings] Generate invites error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4.1 Toggle / Disable Invite Code
settingsRouter.post('/invites/:id/toggle', requireAuth, requireStaff('MANAGE_SETTINGS'), async (req: AuthRequest, res: Response) => {
  try {
    const inviteId = parseInt(req.params.id, 10);
    if (!inviteId) return res.status(400).json({ error: 'Неверный ID инвайта' });

    const [existing] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, inviteId)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Инвайт-код не найден' });

    const newActive = !existing.isActive;
    await db.update(inviteCodes).set({ isActive: newActive }).where(eq(inviteCodes.id, inviteId));

    await logAdminAction({
      userId: req.dbUser!.id,
      action: newActive ? 'ENABLE_INVITE' : 'DISABLE_INVITE',
      details: `Инвайт-код ${existing.code} ${newActive ? 'активирован' : 'отключен'}`,
      ip: req.ip,
    });

    res.json({ success: true, isActive: newActive });
  } catch (err: any) {
    console.error('[Settings] Toggle invite error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4.2 Delete Invite Code
settingsRouter.delete('/invites/:id', requireAuth, requireStaff('MANAGE_SETTINGS'), async (req: AuthRequest, res: Response) => {
  try {
    const inviteId = parseInt(req.params.id, 10);
    if (!inviteId) return res.status(400).json({ error: 'Неверный ID инвайта' });

    const [existing] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, inviteId)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Инвайт-код не найден' });

    await db.delete(inviteCodes).where(eq(inviteCodes.id, inviteId));

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'DELETE_INVITE',
      details: `Удален инвайт-код ${existing.code}`,
      ip: req.ip,
    });

    res.json({ success: true, message: 'Инвайт-код удален' });
  } catch (err: any) {
    console.error('[Settings] Delete invite error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Audit Logs List
settingsRouter.get('/audit-logs', requireAuth, requireStaff('VIEW_AUDIT_LOG'), async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '30'), 10)));
    const offset = (page - 1) * limit;

    const actionFilter = (req.query.action as string || 'ALL').toUpperCase();
    const searchQuery = (req.query.q as string || '').trim();

    const conditions: any[] = [];
    if (actionFilter !== 'ALL') {
      const categoryMap: Record<string, string[]> = {
        'SYSTEM_': ['MESSAGES_WEEKLY_CLEANUP', 'SYSTEM_CLEANUP', 'SYSTEM_BACKGROUND_JOB'],
        'USER_': ['CHANGE_ROLE', 'BAN_USER', 'UNBAN_USER', 'TEMP_BAN_USER', 'WARN_USER', 'RESET_PASSWORD', 'UPDATE_USER_INVITES'],
        'REPORT_': ['UPDATE_REPORT_STATUS', 'RESOLVE_REPORT', 'REPLY_FEEDBACK'],
        'CONTENT_': ['UPDATE_MEDIA', 'HIDE_MEDIA', 'UNHIDE_MEDIA', 'DELETE_MEDIA'],
        'NEWS_': ['CREATE_NEWS', 'UPDATE_NEWS', 'UPDATE_NEWS_STATUS', 'DELETE_NEWS'],
        'ANNOUNCEMENT_': ['CREATE_ANNOUNCEMENT', 'UPDATE_ANNOUNCEMENT', 'PUBLISH_ANNOUNCEMENT', 'UNPUBLISH_ANNOUNCEMENT', 'DELETE_ANNOUNCEMENT'],
        'ACHIEVEMENTS_': ['ACHIEVEMENT_CREATE', 'ACHIEVEMENT_UPDATE', 'ACHIEVEMENT_GRANT', 'ACHIEVEMENT_REVOKE', 'ACHIEVEMENT_REGRANT'],
        'INTEGRATIONS_': ['UPDATE_INTEGRATION_KEY', 'DELETE_INTEGRATION_KEY', 'TOGGLE_INTEGRATION'],
        'INVITES_': ['GENERATE_INVITES', 'ENABLE_INVITE', 'DISABLE_INVITE', 'DELETE_INVITE'],
        'NOTIFICATIONS_': ['SEND_NOTIFICATION'],
        'SETTINGS_': ['UPDATE_SETTINGS', 'UPDATE_REGISTRATION_MODE', 'UPDATE_TELEGRAM_SETTINGS']
      };
      const allowedActions = categoryMap[actionFilter];
      if (allowedActions) {
        const orConditions = allowedActions.map(a => eq(adminAuditLogs.action, a));
        conditions.push(or(...orConditions));
      } else {
        conditions.push(eq(adminAuditLogs.action, actionFilter));
      }
    }
    if (searchQuery) {
      conditions.push(ilike(adminAuditLogs.details, `%${searchQuery}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db.select({ val: count() }).from(adminAuditLogs).where(whereClause);
    const totalCount = Number(totalRes?.val || 0);

    const items = await db
      .select({
        id: adminAuditLogs.id,
        action: adminAuditLogs.action,
        details: adminAuditLogs.details,
        ip: adminAuditLogs.ip,
        createdAt: adminAuditLogs.createdAt,
        adminId: adminAuditLogs.userId,
        adminUsername: users.username,
        adminAvatar: users.avatar,
        adminRole: users.role,
      })
      .from(adminAuditLogs)
      .leftJoin(users, eq(adminAuditLogs.userId, users.id))
      .where(whereClause)
      .orderBy(desc(adminAuditLogs.createdAt))
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
    console.error('[Settings] Audit logs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. External API Logs
settingsRouter.get('/api-logs', requireAuth, requireStaff('VIEW_AUDIT_LOG'), async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '30'), 10)));
    const offset = (page - 1) * limit;

    const providerFilter = (req.query.provider as string || 'ALL').toUpperCase();
    const conditions: any[] = [];
    if (providerFilter !== 'ALL') {
      conditions.push(eq(apiLogs.provider, providerFilter));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db.select({ val: count() }).from(apiLogs).where(whereClause);
    const totalCount = Number(totalRes?.val || 0);

    const items = await db
      .select()
      .from(apiLogs)
      .where(whereClause)
      .orderBy(desc(apiLogs.createdAt))
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
    console.error('[Settings] API logs error:', err);
    res.status(500).json({ error: err.message });
  }
});


// 7. Get Integrations
export default settingsRouter;
