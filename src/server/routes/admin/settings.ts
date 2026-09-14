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

// 1. Get All System Settings
settingsRouter.get('/settings', requireAuth, requireStaff('MANAGE_SETTINGS'), async (_req: AuthRequest, res: Response) => {
  try {
    const all = await db.select().from(systemSettings);
    const map: Record<string, string> = {};
    for (const s of all) {
      map[s.key] = s.value;
    }
    res.json({
      site_access_mode: map.site_access_mode || 'OPEN',
      maintenance_message: map.maintenance_message || 'Сервис находится на техническом обслуживании',
      site_name: map.site_name || 'Dodik Tracker',
      default_invites: map.default_invites || '3',
    });
  } catch (err: any) {
    console.error('[Settings] Get error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Update System Settings
settingsRouter.put('/settings', requireAuth, requireStaff('MANAGE_SETTINGS'), async (req: AuthRequest, res: Response) => {
  try {
    const updates = req.body; // Record<string, any>
    const actor = req.dbUser!;

    const allowedKeys = [
      'site_access_mode',
      'maintenance_message',
      'site_name',
      'default_invites',
    ];

    for (const [key, val] of Object.entries(updates)) {
      if (!allowedKeys.includes(key)) continue;

      const stringVal = typeof val === 'boolean' ? (val ? 'true' : 'false') : String(val);

      const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
      if (existing) {
        await db.update(systemSettings).set({ value: stringVal, updatedAt: new Date() }).where(eq(systemSettings.key, key));
      } else {
        await db.insert(systemSettings).values({ key, value: stringVal });
      }
    }

    await logAdminAction({
      userId: actor.id,
      action: 'UPDATE_SETTINGS',
      details: `Обновлены системные настройки: ${Object.keys(updates).join(', ')}`,
      ip: req.ip,
    });

    res.json({ success: true, message: 'Настройки успешно сохранены' });
  } catch (err: any) {
    console.error('[Settings] Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. List Invite Codes
settingsRouter.get('/invites', requireAuth, requireStaff('MANAGE_SETTINGS'), async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10)));
    const offset = (page - 1) * limit;

    const [totalRes] = await db.select({ val: count() }).from(inviteCodes);
    const totalCount = Number(totalRes?.val || 0);

    const items = await db
      .select({
        id: inviteCodes.id,
        code: inviteCodes.code,
        creatorId: inviteCodes.creatorId,
        usedById: inviteCodes.usedById,
        usedAt: inviteCodes.usedAt,
        createdAt: inviteCodes.createdAt,
        creatorUsername: sql<string>`(SELECT username FROM users WHERE users.id = ${inviteCodes.creatorId})`,
        usedByUsername: sql<string>`(SELECT username FROM users WHERE users.id = ${inviteCodes.usedById})`,
      })
      .from(inviteCodes)
      .orderBy(desc(inviteCodes.createdAt))
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
    console.error('[Settings] Invites error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Generate System Invite Codes
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
      });
      createdCodes.push(code);
    }

    await logAdminAction({
      userId: actor.id,
      action: 'GENERATE_INVITES',
      details: `Сгенерировано ${num} системных инвайт-кодов с префиксом ${codePrefix}`,
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
        'USER_': ['CHANGE_ROLE', 'BAN_USER', 'UNBAN_USER', 'TEMP_BAN_USER', 'WARN_USER', 'RESET_PASSWORD', 'UPDATE_USER_INVITES'],
        'REPORT_': ['UPDATE_REPORT_STATUS', 'RESOLVE_REPORT'],
        'CONTENT_': ['UPDATE_MEDIA', 'HIDE_MEDIA', 'UNHIDE_MEDIA'],
        'NEWS_': ['CREATE_NEWS', 'UPDATE_NEWS', 'DELETE_NEWS'],
        'ANNOUNCEMENT_': ['CREATE_ANNOUNCEMENT', 'UPDATE_ANNOUNCEMENT', 'DELETE_ANNOUNCEMENT'],
        'SETTINGS_': ['UPDATE_SETTINGS', 'GENERATE_INVITES', 'UPDATE_INTEGRATION', 'UPDATE_REGISTRATION_MODE', 'UPDATE_TELEGRAM_SETTINGS']
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
