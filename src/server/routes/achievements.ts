import { Router, Response } from 'express';
import { requireAuth, requireAdmin, optionalAuth, AuthRequest, requireStaff } from '../../middleware/auth.ts';
import { achievementService } from '../achievements/service.ts';
import { db } from '../../db/index.ts';
import { achievements, userAchievements, users } from '../../db/schema.ts';
import { eq, sql, ilike, or, and } from 'drizzle-orm';
import { AchievementRarity, AchievementStatus } from '../achievements/types.ts';

export const achievementsRouter = Router();

/**
 * Helper to resolve user by flexible parameters (ID, username, email)
 */
async function resolveUser(userIdInput?: any, usernameInput?: any, emailInput?: any) {
  // 1. Try numeric userId
  if (userIdInput !== undefined && userIdInput !== null && userIdInput !== '') {
    const num = Number(userIdInput);
    if (!isNaN(num) && num > 0) {
      const [u] = await db.select({ id: users.id, username: users.username, avatar: users.avatar, role: users.role }).from(users).where(eq(users.id, num)).limit(1);
      if (u) return u;
    }
  }

  // 2. Try string query (username, email, or string with @)
  const candidateStr = usernameInput || emailInput || (typeof userIdInput === 'string' && isNaN(Number(userIdInput)) ? userIdInput : undefined);
  if (candidateStr) {
    const clean = String(candidateStr).trim().replace(/^@/, '');
    const numId = !isNaN(Number(clean)) ? Number(clean) : null;
    const [u] = await db
      .select({ id: users.id, username: users.username, avatar: users.avatar, role: users.role })
      .from(users)
      .where(
        or(
          ilike(users.username, clean),
          ilike(users.email, clean),
          eq(sql`LOWER(${users.username})`, clean.toLowerCase()),
          numId ? eq(users.id, numId) : undefined
        )
      )
      .limit(1);
    if (u) return u;
  }

  return null;
}

/**
 * Helper to resolve achievement by flexible parameters (ID or Slug)
 */
async function resolveAchievement(achIdInput?: any, slugInput?: any) {
  // 1. Try numeric ID
  if (achIdInput !== undefined && achIdInput !== null && achIdInput !== '') {
    const num = Number(achIdInput);
    if (!isNaN(num) && num > 0) {
      const [a] = await db.select({ id: achievements.id, slug: achievements.slug, title: achievements.title }).from(achievements).where(eq(achievements.id, num)).limit(1);
      if (a) return a;
    }
  }

  // 2. Try slug string
  const candidateSlug = slugInput || (typeof achIdInput === 'string' && isNaN(Number(achIdInput)) ? achIdInput : undefined);
  if (candidateSlug) {
    const clean = String(candidateSlug).trim().toLowerCase();
    const [a] = await db
      .select({ id: achievements.id, slug: achievements.slug, title: achievements.title })
      .from(achievements)
      .where(or(eq(achievements.slug, clean), ilike(achievements.slug, clean)))
      .limit(1);
    if (a) return a;
  }

  return null;
}

/**
 * 1. GET /api/achievements
 * Returns all active achievements. If user is authenticated, includes their unlock status,
 * unlock date, progress, and user stats.
 */
achievementsRouter.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.dbUser?.id;
    if (currentUserId) {
      const data = await achievementService.getUserAchievements(currentUserId, currentUserId);
      return res.json(data);
    }

    // Unauthenticated: return active non-secret achievements with progress = 0
    const list = await db
      .select()
      .from(achievements)
      .where(eq(achievements.isActive, true))
      .orderBy(achievements.id);

    const mapped = list.map((ach) => ({
      id: ach.id,
      slug: ach.isSecret ? 'secret' : ach.slug,
      title: ach.isSecret ? 'Секретное достижение' : ach.title,
      description: ach.isSecret ? 'Условия получения скрыты до момента открытия.' : ach.description,
      icon: ach.isSecret ? 'Lock' : ach.icon,
      rarity: ach.rarity,
      status: ach.status,
      badgeStyle: ach.badgeStyle,
      isActive: ach.isActive,
      conditionType: ach.conditionType,
      conditionConfig: JSON.parse(ach.conditionConfig || '{}'),
      isSecret: ach.isSecret,
      points: ach.points,
      createdAt: ach.createdAt,
      updatedAt: ach.updatedAt,
      isUnlocked: false,
    }));

    res.json({
      achievements: mapped,
      stats: {
        total: list.length,
        unlocked: 0,
        points: 0,
        percentage: 0,
      },
    });
  } catch (err: any) {
    console.error('[Achievements API] GET / error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. POST /api/achievements/check
 * Force evaluations across all available triggers for the logged in user
 */
achievementsRouter.post('/check', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.dbUser!;
    const triggers = [
      'USER_REGISTERED',
      'USER_VERIFIED',
      'MEDIA_ADDED',
      'MEDIA_COMPLETED',
      'REVIEW_WRITTEN',
      'LIKE_RECEIVED',
      'FRIEND_ADDED',
      'LIST_CREATED',
      'LIST_ITEM_ADDED',
      'TIER_LIST_CREATED',
      'TIER_LIST_COMPLETED',
      'DAYS_STREAK',
    ] as const;

    const newlyUnlockedAll = [];
    for (const trig of triggers) {
      const unlocked = await achievementService.checkAndUnlock(user.id, trig);
      if (unlocked.length > 0) {
        newlyUnlockedAll.push(...unlocked);
      }
    }

    const updatedData = await achievementService.getUserAchievements(user.id, user.id);
    res.json({
      newlyUnlocked: newlyUnlockedAll,
      ...updatedData,
    });
  } catch (err: any) {
    console.error('[Achievements API] POST /check error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. GET /api/achievements/user/:username
 * Public profile achievements view
 */
achievementsRouter.get('/user/:username', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rawUsername = req.params.username || '';
    const targetUser = await resolveUser(undefined, rawUsername);

    if (!targetUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const data = await achievementService.getUserAchievements(targetUser.id, req.dbUser?.id);
    res.json({
      user: {
        id: targetUser.id,
        username: targetUser.username,
        avatar: targetUser.avatar,
        role: targetUser.role,
      },
      ...data,
    });
  } catch (err: any) {
    console.error('[Achievements API] GET /user/:username error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ADMIN ENDPOINTS
// ==========================================

/**
 * 4. GET /api/achievements/admin/all
 * Admin list with all achievements and grant statistics
 */
achievementsRouter.get('/admin/all', requireAuth, requireStaff('MANAGE_ACHIEVEMENTS'), async (_req: AuthRequest, res: Response) => {
  try {
    const all = await db
      .select({
        id: achievements.id,
        slug: achievements.slug,
        title: achievements.title,
        description: achievements.description,
        icon: achievements.icon,
        rarity: achievements.rarity,
        status: achievements.status,
        badgeStyle: achievements.badgeStyle,
        isActive: achievements.isActive,
        conditionType: achievements.conditionType,
        conditionConfig: achievements.conditionConfig,
        isSecret: achievements.isSecret,
        points: achievements.points,
        createdAt: achievements.createdAt,
        updatedAt: achievements.updatedAt,
        grantsCount: sql<number>`(SELECT count(*) FROM user_achievements WHERE user_achievements.achievement_id = achievements.id AND user_achievements.is_revoked = false)`,
      })
      .from(achievements)
      .orderBy(achievements.id);

    const mapped = all.map((a) => {
      let config = {};
      try {
        config = JSON.parse(a.conditionConfig || '{}');
      } catch {
        // ignore
      }
      return {
        ...a,
        conditionConfig: config,
        grantsCount: Number(a.grantsCount || 0),
      };
    });

    res.json({ achievements: mapped });
  } catch (err: any) {
    console.error('[Achievements API] Admin list error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. POST /api/achievements/admin
 * Create new achievement
 */
achievementsRouter.post('/admin', requireAuth, requireStaff('MANAGE_ACHIEVEMENTS'), async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.dbUser!;
    const {
      slug,
      title,
      description,
      icon,
      rarity,
      status,
      badgeStyle,
      conditionType,
      conditionConfig,
      isSecret,
      points,
    } = req.body;

    if (!slug || !title || !description || !conditionType) {
      return res.status(400).json({ error: 'Slug, название, описание и тип условия обязательны' });
    }

    const created = await achievementService.createAchievement(
      {
        slug,
        title,
        description,
        icon: icon || 'Trophy',
        rarity: (rarity as AchievementRarity) || 'COMMON',
        status: (status as AchievementStatus) || 'ACTIVE',
        badgeStyle: badgeStyle || 'purple',
        conditionType,
        conditionConfig: conditionConfig || {},
        isSecret: Boolean(isSecret),
        points: Number(points) || 10,
      },
      admin.id
    );

    res.json({ success: true, achievement: created });
  } catch (err: any) {
    console.error('[Achievements API] Create error:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * 6. PUT /api/achievements/admin/:id
 * Update existing achievement
 */
achievementsRouter.put('/admin/:id', requireAuth, requireStaff('MANAGE_ACHIEVEMENTS'), async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.dbUser!;
    const id = parseInt(req.params.id, 10);
    const {
      title,
      description,
      icon,
      rarity,
      status,
      badgeStyle,
      conditionType,
      conditionConfig,
      isSecret,
      points,
    } = req.body;

    await achievementService.updateAchievement(
      id,
      {
        title,
        description,
        icon,
        rarity,
        status,
        badgeStyle,
        conditionType,
        conditionConfig,
        isSecret,
        points: points !== undefined ? Number(points) : undefined,
      },
      admin.id
    );

    res.json({ success: true, message: 'Достижение успешно обновлено' });
  } catch (err: any) {
    console.error('[Achievements API] Update error:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * 7. POST /api/achievements/admin/grant
 * Manually grant achievement to user
 */
achievementsRouter.post('/admin/grant', requireAuth, requireStaff('MANAGE_ACHIEVEMENTS'), async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.dbUser!;
    const { userId, user_id, targetUserId, username, targetUsername, email, achievementId, achievement_id, targetAchId, achId, slug, achievementSlug, reason } = req.body;

    const targetUser = await resolveUser(userId ?? user_id ?? targetUserId, username ?? targetUsername, email);
    const targetAch = await resolveAchievement(achievementId ?? achievement_id ?? targetAchId ?? achId, slug ?? achievementSlug);

    if (!targetUser || !targetAch) {
      return res.status(400).json({ error: 'Пользователь или достижение не указаны' });
    }

    const result = await achievementService.grantToUser(
      targetUser.id,
      targetAch.id,
      admin.id,
      reason ? String(reason).trim() : undefined
    );

    res.json(result);
  } catch (err: any) {
    console.error('[Achievements API] Grant error:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * 8. POST /api/achievements/admin/revoke
 * Revoke achievement from user
 */
achievementsRouter.post('/admin/revoke', requireAuth, requireStaff('MANAGE_ACHIEVEMENTS'), async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.dbUser!;
    const { userId, user_id, targetUserId, username, targetUsername, email, achievementId, achievement_id, targetAchId, achId, slug, achievementSlug, reason } = req.body;

    const targetUser = await resolveUser(userId ?? user_id ?? targetUserId, username ?? targetUsername, email);
    const targetAch = await resolveAchievement(achievementId ?? achievement_id ?? targetAchId ?? achId, slug ?? achievementSlug);

    if (!targetUser || !targetAch) {
      return res.status(400).json({ error: 'Пользователь или достижение не указаны' });
    }

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'Обязательно укажите причину снятия достижения' });
    }

    const result = await achievementService.revokeFromUser(
      targetUser.id,
      targetAch.id,
      admin.id,
      String(reason).trim()
    );

    res.json(result);
  } catch (err: any) {
    console.error('[Achievements API] Revoke error:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * 9. POST /api/achievements/admin/regrant
 * Re-grant achievement to user
 */
achievementsRouter.post('/admin/regrant', requireAuth, requireStaff('MANAGE_ACHIEVEMENTS'), async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.dbUser!;
    const { userId, user_id, targetUserId, username, targetUsername, email, achievementId, achievement_id, targetAchId, achId, slug, achievementSlug, reason } = req.body;

    const targetUser = await resolveUser(userId ?? user_id ?? targetUserId, username ?? targetUsername, email);
    const targetAch = await resolveAchievement(achievementId ?? achievement_id ?? targetAchId ?? achId, slug ?? achievementSlug);

    if (!targetUser || !targetAch) {
      return res.status(400).json({ error: 'Пользователь или достижение не указаны' });
    }

    const result = await achievementService.regrantToUser(
      targetUser.id,
      targetAch.id,
      admin.id,
      reason ? String(reason).trim() : undefined
    );

    res.json(result);
  } catch (err: any) {
    console.error('[Achievements API] Regrant error:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * 10. GET /api/achievements/admin/history
 * View issuance & revocation audit history
 */
achievementsRouter.get('/admin/history', requireAuth, requireStaff('MANAGE_ACHIEVEMENTS'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : undefined;
    const achievementId = req.query.achievementId ? Number(req.query.achievementId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const data = await achievementService.getHistory({
      userId,
      achievementId,
      limit,
      offset,
    });

    res.json(data);
  } catch (err: any) {
    console.error('[Achievements API] History error:', err);
    res.status(500).json({ error: err.message });
  }
});
