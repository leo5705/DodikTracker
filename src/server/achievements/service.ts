import { db } from '../../db/index.ts';
import { Pool } from 'pg';
import {
  achievements,
  userAchievements,
  achievementHistory,
  adminAuditLogs,
  users,
} from '../../db/schema.ts';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import {
  AchievementItem,
  AchievementTriggerType,
  AchievementRarity,
  AchievementStatus,
  AchievementGrantType,
} from './types.ts';
import { conditionRegistry } from './conditions.ts';
import { SEED_ACHIEVEMENTS } from './seed.ts';
import { sendAppNotification } from '../api.ts';

export class AchievementService {
  /**
   * Initializes PostgreSQL tables and seeds default achievements if empty.
   */
  async init(): Promise<void> {
    const adminPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_ADMIN_USER || process.env.SQL_USER,
      password: process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 2,
      connectionTimeoutMillis: 10000,
    });

    try {
      // 1. Ensure tables exist in PostgreSQL
      await adminPool.query(`
        CREATE TABLE IF NOT EXISTS achievements (
          id SERIAL PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          icon TEXT NOT NULL DEFAULT 'Trophy',
          rarity TEXT NOT NULL DEFAULT 'COMMON',
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          badge_style TEXT NOT NULL DEFAULT 'purple',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          condition_type TEXT NOT NULL,
          condition_config TEXT NOT NULL DEFAULT '{}',
          is_secret BOOLEAN NOT NULL DEFAULT FALSE,
          points INTEGER NOT NULL DEFAULT 10,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS achievements_slug_idx ON achievements (slug);
        CREATE INDEX IF NOT EXISTS achievements_status_idx ON achievements (status);
        CREATE INDEX IF NOT EXISTS achievements_condition_type_idx ON achievements (condition_type);

        CREATE TABLE IF NOT EXISTS user_achievements (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
          grant_type TEXT NOT NULL DEFAULT 'AUTOMATIC',
          admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          reason TEXT,
          is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
          revoked_at TIMESTAMP,
          revoked_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          revoke_reason TEXT,
          granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT user_achievements_user_id_achievement_id_unq UNIQUE (user_id, achievement_id)
        );

        CREATE INDEX IF NOT EXISTS user_achievements_user_id_idx ON user_achievements (user_id);
        CREATE INDEX IF NOT EXISTS user_achievements_achievement_id_idx ON user_achievements (achievement_id);

        CREATE TABLE IF NOT EXISTS achievement_history (
          id SERIAL PRIMARY KEY,
          achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          action TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'AUTOMATIC',
          admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          reason TEXT,
          metadata TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS achievement_history_user_id_idx ON achievement_history (user_id);
        CREATE INDEX IF NOT EXISTS achievement_history_achievement_id_idx ON achievement_history (achievement_id);
        CREATE INDEX IF NOT EXISTS achievement_history_action_idx ON achievement_history (action);
      `);

      // Grant permissions to the application user
      if (process.env.SQL_USER && process.env.SQL_USER !== (process.env.SQL_ADMIN_USER || '')) {
        await adminPool.query(`
          GRANT ALL PRIVILEGES ON TABLE achievements, user_achievements, achievement_history TO "${process.env.SQL_USER}";
          GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${process.env.SQL_USER}";
        `);
      }

      await adminPool.end();

      // 2. Seed initial achievements if table is empty
      const existing = await db.select({ id: achievements.id }).from(achievements).limit(1);
      if (existing.length === 0) {
        console.log('[Achievements] Seeding default achievements into PostgreSQL...');
        for (const item of SEED_ACHIEVEMENTS) {
          await db.insert(achievements).values({
            slug: item.slug,
            title: item.title,
            description: item.description,
            icon: item.icon,
            rarity: item.rarity,
            status: item.status,
            badgeStyle: item.badgeStyle,
            isActive: true,
            conditionType: item.conditionType,
            conditionConfig: JSON.stringify(item.conditionConfig),
            isSecret: item.isSecret || false,
            points: item.points,
          });
        }
        console.log(`[Achievements] Seeded ${SEED_ACHIEVEMENTS.length} achievements.`);
      }
    } catch (err) {
      console.error('[Achievements] Init error:', err);
      try {
        await adminPool.end();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Check and unlock achievements for a user on a given trigger
   */
  async checkAndUnlock(
    userId: number,
    trigger: AchievementTriggerType,
    metadata?: Record<string, any>
  ): Promise<AchievementItem[]> {
    if (!userId) return [];

    try {
      // 1. Fetch active achievements for this trigger
      const candidates = await db
        .select()
        .from(achievements)
        .where(
          and(
            eq(achievements.isActive, true),
            eq(achievements.status, 'ACTIVE'),
            eq(achievements.conditionType, trigger)
          )
        );

      if (candidates.length === 0) return [];

      // 2. Fetch already unlocked achievements for this user
      const existingGrants = await db
        .select({ achievementId: userAchievements.achievementId })
        .from(userAchievements)
        .where(
          and(
            eq(userAchievements.userId, userId),
            eq(userAchievements.isRevoked, false)
          )
        );

      const alreadyUnlockedSet = new Set(existingGrants.map((g) => g.achievementId));
      const newlyUnlocked: AchievementItem[] = [];

      for (const ach of candidates) {
        if (alreadyUnlockedSet.has(ach.id)) continue;

        let config: Record<string, any> = {};
        try {
          config = JSON.parse(ach.conditionConfig || '{}');
        } catch {
          config = {};
        }

        const evalResult = await conditionRegistry.evaluate(ach.conditionType, config, {
          userId,
          trigger,
          metadata,
        });

        if (evalResult.eligible) {
          // Unlock achievement
          await this.internalGrant(userId, ach.id, 'AUTOMATIC', undefined, 'Автоматическое выполнение условий');

          newlyUnlocked.push({
            id: ach.id,
            slug: ach.slug,
            title: ach.title,
            description: ach.description,
            icon: ach.icon,
            rarity: ach.rarity as AchievementRarity,
            status: ach.status as AchievementStatus,
            badgeStyle: ach.badgeStyle,
            isActive: ach.isActive,
            conditionType: ach.conditionType,
            conditionConfig: config,
            isSecret: ach.isSecret,
            points: ach.points,
            createdAt: ach.createdAt,
            updatedAt: ach.updatedAt,
            isUnlocked: true,
            unlockedAt: new Date(),
            grantType: 'AUTOMATIC',
          });
        }
      }

      return newlyUnlocked;
    } catch (err) {
      console.error('[Achievements] Error checking achievements:', err);
      return [];
    }
  }

  /**
   * Internal unlock helper that handles DB insert, history record, and system notification
   */
  private async internalGrant(
    userId: number,
    achievementId: number,
    grantType: AchievementGrantType,
    adminId?: number,
    reason?: string
  ): Promise<void> {
    const now = new Date();

    // 1. Insert or update user_achievements
    const [existing] = await db
      .select()
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.achievementId, achievementId)
        )
      )
      .limit(1);

    const action = existing && existing.isRevoked ? 'RE_GRANTED' : 'GRANTED';

    if (existing) {
      await db
        .update(userAchievements)
        .set({
          isRevoked: false,
          revokedAt: null,
          revokedByAdminId: null,
          revokeReason: null,
          grantType,
          adminId: adminId || null,
          reason: reason || null,
          grantedAt: now,
          updatedAt: now,
        })
        .where(eq(userAchievements.id, existing.id));
    } else {
      await db.insert(userAchievements).values({
        userId,
        achievementId,
        grantType,
        adminId: adminId || null,
        reason: reason || null,
        isRevoked: false,
        grantedAt: now,
        updatedAt: now,
      });
    }

    // 2. Append immutable history record
    await db.insert(achievementHistory).values({
      achievementId,
      userId,
      action,
      source: grantType,
      adminId: adminId || null,
      reason: reason || null,
      createdAt: now,
    });

    // 3. Create System Notification for user
    const [ach] = await db
      .select({ title: achievements.title, description: achievements.description })
      .from(achievements)
      .where(eq(achievements.id, achievementId))
      .limit(1);

    if (ach) {
      sendAppNotification(userId, {
        type: 'ACHIEVEMENT_UNLOCKED',
        title: '🏆 Достижение разблокировано!',
        body: `Вы получили достижение «${ach.title}»: ${ach.description}`,
        link: '/achievements',
        relatedEntity: 'achievement',
        relatedEntityId: String(achievementId),
      }).catch((err) => {
        console.warn('[Achievements] Notification send error:', err);
      });
    }
  }

  /**
   * Admin: Manually grant achievement to a user
   */
  async grantToUser(
    userId: number,
    achievementId: number,
    adminId: number,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    const [targetUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!targetUser) throw new Error('Пользователь не найден');

    const [ach] = await db.select().from(achievements).where(eq(achievements.id, achievementId)).limit(1);
    if (!ach) throw new Error('Достижение не найдено');

    await this.internalGrant(userId, achievementId, 'ADMIN', adminId, reason || 'Выдано администратором');

    // Audit log
    await db.insert(adminAuditLogs).values({
      userId: adminId,
      action: 'ACHIEVEMENT_GRANT',
      details: JSON.stringify({
        targetUserId: userId,
        targetUsername: targetUser.username,
        achievementId,
        achievementSlug: ach.slug,
        achievementTitle: ach.title,
        reason,
      }),
    });

    return { success: true, message: `Достижение «${ach.title}» успешно выдано пользователю ${targetUser.username}` };
  }

  /**
   * Admin: Revoke achievement from a user (soft delete with audit)
   */
  async revokeFromUser(
    userId: number,
    achievementId: number,
    adminId: number,
    reason: string
  ): Promise<{ success: boolean; message: string }> {
    const [existing] = await db
      .select()
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.achievementId, achievementId)
        )
      )
      .limit(1);

    if (!existing || existing.isRevoked) {
      throw new Error('У пользователя нет активного достижения для снятия');
    }

    const now = new Date();

    // 1. Mark as revoked in user_achievements
    await db
      .update(userAchievements)
      .set({
        isRevoked: true,
        revokedAt: now,
        revokedByAdminId: adminId,
        revokeReason: reason,
        updatedAt: now,
      })
      .where(eq(userAchievements.id, existing.id));

    // 2. Append history record
    await db.insert(achievementHistory).values({
      achievementId,
      userId,
      action: 'REVOKED',
      source: 'ADMIN',
      adminId,
      reason,
      createdAt: now,
    });

    // 3. Admin audit log
    const [targetUser] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
    const [ach] = await db.select({ title: achievements.title }).from(achievements).where(eq(achievements.id, achievementId)).limit(1);

    await db.insert(adminAuditLogs).values({
      userId: adminId,
      action: 'ACHIEVEMENT_REVOKE',
      details: JSON.stringify({
        targetUserId: userId,
        targetUsername: targetUser?.username,
        achievementId,
        achievementTitle: ach?.title,
        reason,
      }),
    });

    return { success: true, message: `Достижение успешно отозвано у пользователя` };
  }

  /**
   * Admin: Re-grant achievement to a user
   */
  async regrantToUser(
    userId: number,
    achievementId: number,
    adminId: number,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    return this.grantToUser(userId, achievementId, adminId, reason || 'Повторная выдача администратором');
  }

  /**
   * Get all achievements with user unlock status and progress
   */
  async getUserAchievements(userId: number, viewerId?: number): Promise<{
    achievements: AchievementItem[];
    stats: {
      total: number;
      unlocked: number;
      points: number;
      percentage: number;
    };
  }> {
    const allAchievements = await db
      .select()
      .from(achievements)
      .where(eq(achievements.isActive, true))
      .orderBy(achievements.id);

    const grants = await db
      .select()
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.isRevoked, false)
        )
      );

    const grantMap = new Map<number, typeof userAchievements.$inferSelect>();
    for (const g of grants) {
      grantMap.set(g.achievementId, g);
    }

    let totalPoints = 0;
    let unlockedCount = 0;

    const resultList: AchievementItem[] = [];

    for (const ach of allAchievements) {
      const grant = grantMap.get(ach.id);
      const isUnlocked = Boolean(grant);

      if (isUnlocked) {
        unlockedCount++;
        totalPoints += ach.points;
      }

      let config: Record<string, any> = {};
      try {
        config = JSON.parse(ach.conditionConfig || '{}');
      } catch {
        config = {};
      }

      let progressInfo: { current: number; target: number; percentage: number } | undefined;
      if (!isUnlocked && viewerId === userId) {
        try {
          const prog = await conditionRegistry.getProgress(ach.conditionType, config, userId);
          const pct = Math.min(100, Math.round((prog.current / (prog.target || 1)) * 100));
          progressInfo = { current: prog.current, target: prog.target, percentage: pct };
        } catch {
          // progress calculation fallback
        }
      }

      // Hide secret achievements if not yet unlocked
      const isSecretLocked = ach.isSecret && !isUnlocked;

      resultList.push({
        id: ach.id,
        slug: isSecretLocked ? 'secret' : ach.slug,
        title: isSecretLocked ? 'Секретное достижение' : ach.title,
        description: isSecretLocked ? 'Условия получения скрыты до момента открытия.' : ach.description,
        icon: isSecretLocked ? 'Lock' : ach.icon,
        rarity: ach.rarity as AchievementRarity,
        status: ach.status as AchievementStatus,
        badgeStyle: ach.badgeStyle,
        isActive: ach.isActive,
        conditionType: ach.conditionType,
        conditionConfig: config,
        isSecret: ach.isSecret,
        points: ach.points,
        createdAt: ach.createdAt,
        updatedAt: ach.updatedAt,
        isUnlocked,
        unlockedAt: grant ? grant.grantedAt : null,
        grantType: grant ? (grant.grantType as AchievementGrantType) : undefined,
        grantedByAdminId: grant?.adminId,
        grantReason: grant?.reason,
        progress: progressInfo,
      });
    }

    const total = allAchievements.length;
    const percentage = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;

    return {
      achievements: resultList,
      stats: {
        total,
        unlocked: unlockedCount,
        points: totalPoints,
        percentage,
      },
    };
  }

  /**
   * Admin: List issuance and revocation history with user and admin details
   */
  async getHistory(filters: {
    userId?: number;
    achievementId?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ history: any[]; total: number }> {
    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const conditions = [];
    if (filters.userId) conditions.push(eq(achievementHistory.userId, filters.userId));
    if (filters.achievementId) conditions.push(eq(achievementHistory.achievementId, filters.achievementId));

    const rows = await db
      .select({
        id: achievementHistory.id,
        action: achievementHistory.action,
        source: achievementHistory.source,
        reason: achievementHistory.reason,
        createdAt: achievementHistory.createdAt,
        achievementId: achievementHistory.achievementId,
        achievementTitle: achievements.title,
        achievementSlug: achievements.slug,
        achievementIcon: achievements.icon,
        achievementRarity: achievements.rarity,
        userId: achievementHistory.userId,
        username: users.username,
        userAvatar: users.avatar,
        adminId: achievementHistory.adminId,
      })
      .from(achievementHistory)
      .innerJoin(achievements, eq(achievementHistory.achievementId, achievements.id))
      .innerJoin(users, eq(achievementHistory.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(achievementHistory.createdAt))
      .limit(limit)
      .offset(offset);

    // Fetch admin usernames for records where adminId is present
    const adminIds = Array.from(new Set(rows.map((r) => r.adminId).filter(Boolean))) as number[];
    const adminMap = new Map<number, string>();
    if (adminIds.length > 0) {
      const adminUsers = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, adminIds));
      for (const a of adminUsers) {
        adminMap.set(a.id, a.username);
      }
    }

    const history = rows.map((r) => ({
      ...r,
      adminUsername: r.adminId ? adminMap.get(r.adminId) : null,
    }));

    return { history, total: history.length };
  }

  /**
   * Admin: Create a new achievement
   */
  async createAchievement(
    data: {
      slug: string;
      title: string;
      description: string;
      icon: string;
      rarity: AchievementRarity;
      status: AchievementStatus;
      badgeStyle: string;
      conditionType: string;
      conditionConfig: Record<string, any>;
      isSecret?: boolean;
      points?: number;
    },
    adminId: number
  ): Promise<AchievementItem> {
    const slug = data.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const existing = await db.select({ id: achievements.id }).from(achievements).where(eq(achievements.slug, slug)).limit(1);
    if (existing.length > 0) {
      throw new Error(`Достижение с кодовым именем (slug) «${slug}» уже существует`);
    }

    const [inserted] = await db
      .insert(achievements)
      .values({
        slug,
        title: data.title.trim(),
        description: data.description.trim(),
        icon: data.icon || 'Trophy',
        rarity: data.rarity || 'COMMON',
        status: data.status || 'ACTIVE',
        badgeStyle: data.badgeStyle || 'purple',
        isActive: data.status !== 'ARCHIVED',
        conditionType: data.conditionType,
        conditionConfig: JSON.stringify(data.conditionConfig || {}),
        isSecret: Boolean(data.isSecret),
        points: data.points || 10,
      })
      .returning();

    // Audit log
    await db.insert(adminAuditLogs).values({
      userId: adminId,
      action: 'ACHIEVEMENT_CREATE',
      details: JSON.stringify({ achievementId: inserted.id, slug, title: inserted.title }),
    });

    return {
      ...inserted,
      rarity: inserted.rarity as AchievementRarity,
      status: inserted.status as AchievementStatus,
      conditionConfig: data.conditionConfig || {},
    };
  }

  /**
   * Admin: Update an existing achievement
   */
  async updateAchievement(
    id: number,
    data: Partial<{
      title: string;
      description: string;
      icon: string;
      rarity: AchievementRarity;
      status: AchievementStatus;
      badgeStyle: string;
      conditionType: string;
      conditionConfig: Record<string, any>;
      isSecret: boolean;
      points: number;
    }>,
    adminId: number
  ): Promise<void> {
    const [existing] = await db.select().from(achievements).where(eq(achievements.id, id)).limit(1);
    if (!existing) throw new Error('Достижение не найдено');

    const updateFields: Record<string, any> = { updatedAt: new Date() };
    if (data.title !== undefined) updateFields.title = data.title.trim();
    if (data.description !== undefined) updateFields.description = data.description.trim();
    if (data.icon !== undefined) updateFields.icon = data.icon;
    if (data.rarity !== undefined) updateFields.rarity = data.rarity;
    if (data.status !== undefined) {
      updateFields.status = data.status;
      updateFields.isActive = data.status !== 'ARCHIVED';
    }
    if (data.badgeStyle !== undefined) updateFields.badgeStyle = data.badgeStyle;
    if (data.conditionType !== undefined) updateFields.conditionType = data.conditionType;
    if (data.conditionConfig !== undefined) updateFields.conditionConfig = JSON.stringify(data.conditionConfig);
    if (data.isSecret !== undefined) updateFields.isSecret = data.isSecret;
    if (data.points !== undefined) updateFields.points = data.points;

    await db.update(achievements).set(updateFields).where(eq(achievements.id, id));

    // Audit log
    await db.insert(adminAuditLogs).values({
      userId: adminId,
      action: 'ACHIEVEMENT_UPDATE',
      details: JSON.stringify({ achievementId: id, updated: Object.keys(updateFields) }),
    });
  }
}

export const achievementService = new AchievementService();
