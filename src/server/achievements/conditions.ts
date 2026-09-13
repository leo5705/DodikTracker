import { db } from '../../db/index.ts';
import {
  users,
  userMedia,
  media,
  reviews,
  friendRequests,
  likes,
  lists,
  listItems,
  tierLists,
  activities,
} from '../../db/schema.ts';
import { eq, and, or, count, sql, desc, gte } from 'drizzle-orm';
import {
  AchievementConditionConfig,
  AchievementContext,
  ConditionEvaluationResult,
} from './types.ts';

export interface AchievementConditionHandler {
  readonly id: string;
  canHandle(conditionType: string): boolean;
  evaluate(
    config: AchievementConditionConfig,
    context: AchievementContext
  ): Promise<ConditionEvaluationResult>;
  getProgress(
    config: AchievementConditionConfig,
    userId: number
  ): Promise<{ current: number; target: number }>;
}

/**
 * 1. Registration & Verification Handler
 */
export class RegistrationConditionHandler implements AchievementConditionHandler {
  readonly id = 'REGISTRATION';

  canHandle(conditionType: string): boolean {
    return (
      conditionType === 'USER_REGISTERED' || conditionType === 'USER_VERIFIED'
    );
  }

  async evaluate(
    _config: AchievementConditionConfig,
    context: AchievementContext
  ): Promise<ConditionEvaluationResult> {
    // If trigger is registration and userId exists
    if (context.trigger === 'USER_REGISTERED' && context.userId) {
      return { eligible: true, currentValue: 1, targetValue: 1 };
    }
    // If checking later, check if user exists
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, context.userId))
      .limit(1);

    if (!user) return { eligible: false, currentValue: 0, targetValue: 1 };

    if (context.trigger === 'USER_VERIFIED') {
      return { eligible: Boolean(user.email), currentValue: user.email ? 1 : 0, targetValue: 1 };
    }

    return { eligible: true, currentValue: 1, targetValue: 1 };
  }

  async getProgress(
    _config: AchievementConditionConfig,
    _userId: number
  ): Promise<{ current: number; target: number }> {
    return { current: 1, target: 1 };
  }
}

/**
 * 2. Media Progress & Count Handler (Watched, Played, Read, Added)
 * Supports:
 * - Specific media types: 'MOVIE', 'TV', 'ANIME', 'GAME', 'BOOK', 'MANGA', 'MUSIC'
 * - Status: 'COMPLETED' (e.g. watched/finished) or 'ALL' (added to library)
 * - Count threshold: 1, 10, 50, 100, 500, etc.
 */
export class MediaConditionHandler implements AchievementConditionHandler {
  readonly id = 'MEDIA';

  canHandle(conditionType: string): boolean {
    return (
      conditionType === 'MEDIA_ADDED' ||
      conditionType === 'MEDIA_COMPLETED' ||
      conditionType === 'TOTAL_CONTENT_COUNT'
    );
  }

  async evaluate(
    config: AchievementConditionConfig,
    context: AchievementContext
  ): Promise<ConditionEvaluationResult> {
    const progress = await this.getProgress(config, context.userId);
    return {
      eligible: progress.current >= progress.target,
      currentValue: progress.current,
      targetValue: progress.target,
    };
  }

  async getProgress(
    config: AchievementConditionConfig,
    userId: number
  ): Promise<{ current: number; target: number }> {
    const target = config.count || config.targetValue || 1;
    const requiredType = config.mediaType && config.mediaType !== 'ALL' ? config.mediaType : null;
    const requiredStatus = config.status || (config.conditionType === 'MEDIA_COMPLETED' ? 'COMPLETED' : null);

    const conditions = [eq(userMedia.userId, userId)];

    if (requiredStatus) {
      conditions.push(eq(userMedia.status, requiredStatus));
    }

    if (requiredType) {
      conditions.push(eq(media.type, requiredType));
    }

    const [res] = await db
      .select({ val: count() })
      .from(userMedia)
      .innerJoin(media, eq(userMedia.mediaId, media.id))
      .where(and(...conditions));

    const current = Number(res?.val || 0);
    return { current, target };
  }
}

/**
 * 3. Reviews Written Handler
 */
export class ReviewConditionHandler implements AchievementConditionHandler {
  readonly id = 'REVIEWS';

  canHandle(conditionType: string): boolean {
    return conditionType === 'REVIEW_WRITTEN';
  }

  async evaluate(
    config: AchievementConditionConfig,
    context: AchievementContext
  ): Promise<ConditionEvaluationResult> {
    const progress = await this.getProgress(config, context.userId);
    return {
      eligible: progress.current >= progress.target,
      currentValue: progress.current,
      targetValue: progress.target,
    };
  }

  async getProgress(
    config: AchievementConditionConfig,
    userId: number
  ): Promise<{ current: number; target: number }> {
    const target = config.count || 1;
    const [res] = await db
      .select({ val: count() })
      .from(reviews)
      .where(eq(reviews.userId, userId));

    const current = Number(res?.val || 0);
    return { current, target };
  }
}

/**
 * 4. Likes Received Handler
 */
export class LikeConditionHandler implements AchievementConditionHandler {
  readonly id = 'LIKES';

  canHandle(conditionType: string): boolean {
    return conditionType === 'LIKE_RECEIVED';
  }

  async evaluate(
    config: AchievementConditionConfig,
    context: AchievementContext
  ): Promise<ConditionEvaluationResult> {
    const progress = await this.getProgress(config, context.userId);
    return {
      eligible: progress.current >= progress.target,
      currentValue: progress.current,
      targetValue: progress.target,
    };
  }

  async getProgress(
    config: AchievementConditionConfig,
    userId: number
  ): Promise<{ current: number; target: number }> {
    const target = config.count || 1;

    // Sum likes received on user's reviews + user's activities + user's lists
    const [reviewLikesRes] = await db
      .select({ total: sql<number>`coalesce(sum(${reviews.likesCount}), 0)` })
      .from(reviews)
      .where(eq(reviews.userId, userId));

    // Also count likes on user's lists and tier lists
    const [socialLikesRes] = await db
      .select({ total: count() })
      .from(likes)
      .innerJoin(lists, eq(likes.targetId, lists.id))
      .where(and(eq(likes.targetType, 'LIST'), eq(lists.ownerId, userId)));

    const current = Number(reviewLikesRes?.total || 0) + Number(socialLikesRes?.total || 0);
    return { current, target };
  }
}

/**
 * 5. Friends Handler
 */
export class FriendConditionHandler implements AchievementConditionHandler {
  readonly id = 'FRIENDS';

  canHandle(conditionType: string): boolean {
    return conditionType === 'FRIEND_ADDED';
  }

  async evaluate(
    config: AchievementConditionConfig,
    context: AchievementContext
  ): Promise<ConditionEvaluationResult> {
    const progress = await this.getProgress(config, context.userId);
    return {
      eligible: progress.current >= progress.target,
      currentValue: progress.current,
      targetValue: progress.target,
    };
  }

  async getProgress(
    config: AchievementConditionConfig,
    userId: number
  ): Promise<{ current: number; target: number }> {
    const target = config.count || 1;
    const [res] = await db
      .select({ val: count() })
      .from(friendRequests)
      .where(
        and(
          or(eq(friendRequests.senderId, userId), eq(friendRequests.receiverId, userId)),
          eq(friendRequests.status, 'ACCEPTED')
        )
      );

    const current = Number(res?.val || 0);
    return { current, target };
  }
}

/**
 * 6. Lists & List Items Handler
 */
export class ListConditionHandler implements AchievementConditionHandler {
  readonly id = 'LISTS';

  canHandle(conditionType: string): boolean {
    return conditionType === 'LIST_CREATED' || conditionType === 'LIST_ITEM_ADDED';
  }

  async evaluate(
    config: AchievementConditionConfig,
    context: AchievementContext
  ): Promise<ConditionEvaluationResult> {
    const progress = await this.getProgress(config, context.userId);
    return {
      eligible: progress.current >= progress.target,
      currentValue: progress.current,
      targetValue: progress.target,
    };
  }

  async getProgress(
    config: AchievementConditionConfig,
    userId: number
  ): Promise<{ current: number; target: number }> {
    if (config.minItems) {
      // Check maximum items across any single user list
      const userLists = await db
        .select({ id: lists.id })
        .from(lists)
        .where(eq(lists.ownerId, userId));

      if (userLists.length === 0) return { current: 0, target: config.minItems };

      const listIds = userLists.map((l) => l.id);
      const [maxItemsRes] = await db
        .select({
          listId: listItems.listId,
          total: count(),
        })
        .from(listItems)
        .where(sql`${listItems.listId} IN (${sql.join(listIds, sql`, `)})`)
        .groupBy(listItems.listId)
        .orderBy(desc(count()))
        .limit(1);

      const current = Number(maxItemsRes?.total || 0);
      return { current, target: config.minItems };
    }

    // Default: list count
    const target = config.count || 1;
    const [res] = await db
      .select({ val: count() })
      .from(lists)
      .where(eq(lists.ownerId, userId));

    const current = Number(res?.val || 0);
    return { current, target };
  }
}

/**
 * 7. Tier List Handler
 */
export class TierListConditionHandler implements AchievementConditionHandler {
  readonly id = 'TIER_LISTS';

  canHandle(conditionType: string): boolean {
    return (
      conditionType === 'TIER_LIST_CREATED' ||
      conditionType === 'TIER_LIST_COMPLETED'
    );
  }

  async evaluate(
    config: AchievementConditionConfig,
    context: AchievementContext
  ): Promise<ConditionEvaluationResult> {
    const progress = await this.getProgress(config, context.userId);
    return {
      eligible: progress.current >= progress.target,
      currentValue: progress.current,
      targetValue: progress.target,
    };
  }

  async getProgress(
    config: AchievementConditionConfig,
    userId: number
  ): Promise<{ current: number; target: number }> {
    const target = config.count || 1;

    if (config.status === 'COMPLETED' || config.requireFilled) {
      // Find tier lists with at least 1 placed item
      const userTiers = await db
        .select({ id: tierLists.id, itemsJson: tierLists.itemsJson })
        .from(tierLists)
        .where(eq(tierLists.ownerId, userId));

      let filledCount = 0;
      for (const tl of userTiers) {
        try {
          const items = JSON.parse(tl.itemsJson || '[]');
          if (Array.isArray(items) && items.length > 0) {
            filledCount++;
          }
        } catch {
          // ignore
        }
      }
      return { current: filledCount, target };
    }

    const [res] = await db
      .select({ val: count() })
      .from(tierLists)
      .where(eq(tierLists.ownerId, userId));

    const current = Number(res?.val || 0);
    return { current, target };
  }
}

/**
 * 8. Days Streak & Longevity Handler
 */
export class StreakConditionHandler implements AchievementConditionHandler {
  readonly id = 'STREAK';

  canHandle(conditionType: string): boolean {
    return conditionType === 'DAYS_STREAK';
  }

  async evaluate(
    config: AchievementConditionConfig,
    context: AchievementContext
  ): Promise<ConditionEvaluationResult> {
    const progress = await this.getProgress(config, context.userId);
    return {
      eligible: progress.current >= progress.target,
      currentValue: progress.current,
      targetValue: progress.target,
    };
  }

  async getProgress(
    config: AchievementConditionConfig,
    userId: number
  ): Promise<{ current: number; target: number }> {
    const target = config.days || config.count || 1;

    // Calculate unique activity days
    const recentActivities = await db
      .select({
        day: sql<string>`DATE(${activities.createdAt})`,
      })
      .from(activities)
      .where(eq(activities.userId, userId))
      .groupBy(sql`DATE(${activities.createdAt})`)
      .orderBy(desc(sql`DATE(${activities.createdAt})`))
      .limit(30);

    const current = recentActivities.length;
    return { current, target };
  }
}

/**
 * 9. Custom / Admin Constructor Condition Handler
 */
export class CustomConditionHandler implements AchievementConditionHandler {
  readonly id = 'CUSTOM';

  canHandle(conditionType: string): boolean {
    return conditionType === 'CUSTOM';
  }

  async evaluate(
    config: AchievementConditionConfig,
    context: AchievementContext
  ): Promise<ConditionEvaluationResult> {
    const target = config.targetValue || config.count || 1;
    const current = Number(context.metadata?.[config.customKey || 'value'] || 0);
    return {
      eligible: current >= target,
      currentValue: current,
      targetValue: target,
    };
  }

  async getProgress(
    config: AchievementConditionConfig,
    _userId: number
  ): Promise<{ current: number; target: number }> {
    return {
      current: 0,
      target: config.targetValue || config.count || 1,
    };
  }
}

/**
 * Registry of condition handlers
 */
export class ConditionRegistry {
  private handlers: AchievementConditionHandler[] = [];

  constructor() {
    this.register(new RegistrationConditionHandler());
    this.register(new MediaConditionHandler());
    this.register(new ReviewConditionHandler());
    this.register(new LikeConditionHandler());
    this.register(new FriendConditionHandler());
    this.register(new ListConditionHandler());
    this.register(new TierListConditionHandler());
    this.register(new StreakConditionHandler());
    this.register(new CustomConditionHandler());
  }

  register(handler: AchievementConditionHandler) {
    this.handlers.push(handler);
  }

  getHandler(conditionType: string): AchievementConditionHandler | undefined {
    return this.handlers.find((h) => h.canHandle(conditionType));
  }

  async evaluate(
    conditionType: string,
    config: AchievementConditionConfig,
    context: AchievementContext
  ): Promise<ConditionEvaluationResult> {
    const handler = this.getHandler(conditionType);
    if (!handler) {
      console.warn(`[ConditionRegistry] No handler for conditionType: ${conditionType}`);
      return { eligible: false, currentValue: 0, targetValue: 1 };
    }
    return handler.evaluate(config, context);
  }

  async getProgress(
    conditionType: string,
    config: AchievementConditionConfig,
    userId: number
  ): Promise<{ current: number; target: number }> {
    const handler = this.getHandler(conditionType);
    if (!handler) {
      return { current: 0, target: config.count || 1 };
    }
    return handler.getProgress(config, userId);
  }
}

export const conditionRegistry = new ConditionRegistry();
