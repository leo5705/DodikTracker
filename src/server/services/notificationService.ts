import { Response } from 'express';
import { db } from '../../db/index.ts';
import { notifications, users } from '../../db/schema.ts';
import { eq, and, sql, or, gte } from 'drizzle-orm';
import { telegramBot } from '../telegram.ts';
import {
  NotificationType,
  NotificationChannelSettings,
  normalizeNotificationPreferences,
} from '../../types/notification.ts';

interface TelegramJob {
  userId: number;
  chatId: string;
  type: NotificationType | string;
  title: string;
  body: string;
  link?: string;
  retries: number;
}

export interface CreateNotificationInput {
  recipientUserId?: number;
  userId?: number; // alias
  type: NotificationType | string;
  title: string;
  message?: string;
  body?: string; // alias
  content?: string | null;
  actorUserId?: number | null;
  senderId?: number | null; // alias
  senderUsername?: string | null;
  senderAvatar?: string | null;
  entityType?: string | null;
  relatedEntity?: string | null; // alias
  entityId?: string | null;
  relatedEntityId?: string | null; // alias
  metadata?: Record<string, any> | null;
  metadataJson?: string | null;
  link?: string | null;
  dedupKey?: string | null;
  dedupWindowSeconds?: number; // default 120s
  skipInApp?: boolean;
  skipTelegram?: boolean;
}

export type CreateNotificationPayload = CreateNotificationInput;

export interface BroadcastNotificationPayload {
  type?: NotificationType | string;
  title: string;
  message?: string;
  body?: string;
  content?: string;
  link?: string;
  entityType?: string;
  relatedEntity?: string;
  entityId?: string;
  relatedEntityId?: string;
  actorUserId?: number;
  senderId?: number;
  metadata?: Record<string, any>;
  targetUserIds?: number[]; // If omitted, sends to all active users
  excludeUserId?: number;
}

class NotificationService {
  // 1. SSE Connection Store: userId -> Set of express Response streams
  private sseClients = new Map<number, Set<Response>>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  // 2. Telegram Queue & Processing
  private telegramQueue: TelegramJob[] = [];
  private isProcessingTelegram = false;
  private maxRetries = 3;
  private delayBetweenTelegramMs = 75; // ~13 msgs/sec, safe under Telegram's 30/sec limit

  constructor() {
    this.startHeartbeat();
  }

  // =========================================================================
  // REAL-TIME SSE (Server-Sent Events) MANAGEMENT
  // =========================================================================

  public registerSSEClient(userId: number, res: Response) {
    if (!this.sseClients.has(userId)) {
      this.sseClients.set(userId, new Set());
    }
    const clientSet = this.sseClients.get(userId)!;
    clientSet.add(res);

    // Initial handshake
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, timestamp: Date.now() })}\n\n`);

    // Clean up when client disconnects
    res.on('close', () => {
      clientSet.delete(res);
      if (clientSet.size === 0) {
        this.sseClients.delete(userId);
      }
    });
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      for (const [_userId, clientSet] of this.sseClients.entries()) {
        for (const res of clientSet) {
          try {
            res.write(`: ping\n\n`);
          } catch {
            clientSet.delete(res);
          }
        }
      }
    }, 25000); // 25 seconds keep-alive
  }

  public sendSSEEvent(userId: number, event: string, data: any) {
    const clientSet = this.sseClients.get(userId);
    if (!clientSet || clientSet.size === 0) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clientSet) {
      try {
        res.write(payload);
      } catch (err) {
        console.warn(`[NotificationService] SSE write failed for user ${userId}:`, err);
        clientSet.delete(res);
      }
    }
  }

  public broadcastSSEEvent(event: string, data: any, excludeUserId?: number) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [userId, clientSet] of this.sseClients.entries()) {
      if (excludeUserId && userId === excludeUserId) continue;
      for (const res of clientSet) {
        try {
          res.write(payload);
        } catch {
          clientSet.delete(res);
        }
      }
    }
  }

  // =========================================================================
  // TELEGRAM QUEUE & RATE LIMITER
  // =========================================================================

  private enqueueTelegram(job: TelegramJob) {
    this.telegramQueue.push(job);
    this.processTelegramQueue();
  }

  private async processTelegramQueue() {
    if (this.isProcessingTelegram || this.telegramQueue.length === 0) return;
    this.isProcessingTelegram = true;

    try {
      while (this.telegramQueue.length > 0) {
        const job = this.telegramQueue.shift()!;
        try {
          const success = await this.sendTelegramFormatted(job);
          if (!success && job.retries < this.maxRetries) {
            job.retries += 1;
            // Backoff retry: put back to end of queue after slight delay
            setTimeout(() => {
              this.telegramQueue.push(job);
              this.processTelegramQueue();
            }, job.retries * 2000);
          }
        } catch (err) {
          console.warn('[NotificationService] Error in Telegram job execution:', err);
        }

        // Rate limit pacing
        await new Promise((r) => setTimeout(r, this.delayBetweenTelegramMs));
      }
    } finally {
      this.isProcessingTelegram = false;
    }
  }

  private async sendTelegramFormatted(job: TelegramJob): Promise<boolean> {
    const icon = this.getNotificationEmoji(job.type);
    const lines = [
      `${icon} *${this.escapeTelegramMarkdown(job.title)}*`,
      '',
      this.escapeTelegramMarkdown(job.body),
    ];

    if (job.link) {
      const fullUrl = job.link.startsWith('http')
        ? job.link
        : `https://ais-dev-d5h4sdwyfdatdgro7ftp4s-367905707348.europe-west2.run.app${job.link.startsWith('/') ? '' : '/'}${job.link}`;
      lines.push('');
      lines.push(`🔗 [Перейти в Dodik Tracker](${fullUrl})`);
    }

    const text = lines.join('\n');
    const res = await telegramBot.sendMessage(job.chatId, text);
    return !!res?.ok;
  }

  private escapeTelegramMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1');
  }

  public getNotificationEmoji(type: string): string {
    switch (type) {
      case 'ACHIEVEMENT':
      case 'ACHIEVEMENT_UNLOCKED':
        return '🏆';
      case 'FRIEND_REQUEST':
        return '👥';
      case 'FRIEND_ACCEPTED':
        return '🤝';
      case 'REVIEW_LIKED':
      case 'LIKE':
        return '❤️';
      case 'REVIEW_COMMENTED':
      case 'COMMENT':
        return '💬';
      case 'FEEDBACK_REPLIED':
        return '📬';
      case 'CONTENT_COMPLETED':
        return '🎉';
      case 'CONTENT_SHARED':
        return '🍿';
      case 'TIER_LIST_INVITE':
        return '📊';
      case 'NEW_MESSAGE':
        return '✉️';
      case 'FRIEND_REVIEW':
        return '✍️';
      case 'FRIEND_ACTIVITY':
        return '⚡';
      case 'NEW_RELEASE':
        return '🎬';
      case 'MENTION':
        return '🔔';
      case 'ADMIN_ANNOUNCEMENT':
      case 'ADMIN_ALERT':
        return '📢';
      case 'SYSTEM':
        return 'ℹ️';
      case 'LIST_INVITE':
        return '📋';
      case 'LIST_FOLLOW':
        return '⭐';
      default:
        return '🔔';
    }
  }

  // =========================================================================
  // CORE NOTIFICATION CREATION & DISPATCHING
  // =========================================================================

  /**
   * Primary entry point: creates a unified notification entity in the database
   * and dispatches it through configured channels (In-App SSE and Telegram).
   */
  public async create(params: CreateNotificationInput): Promise<{
    ok: boolean;
    notificationId?: number;
    duplicate?: boolean;
  }> {
    const recipientId = params.recipientUserId ?? params.userId;
    if (!recipientId) {
      console.warn('[NotificationService] create called without recipientUserId/userId');
      return { ok: false };
    }

    const type = params.type;
    const title = params.title;
    const message = params.message ?? params.body ?? '';
    const body = message;
    const actorId = params.actorUserId !== undefined ? params.actorUserId : (params.senderId ?? null);
    const entityType = params.entityType ?? params.relatedEntity ?? null;
    const entityId = params.entityId ?? params.relatedEntityId ?? null;
    const metadata = params.metadata ?? (params.metadataJson ? this.safeJsonParse(params.metadataJson) : null);
    const metadataJson = metadata ? JSON.stringify(metadata) : (params.metadataJson ?? null);
    const content = params.content ?? message;
    const link = params.link ?? null;
    const senderAvatar = params.senderAvatar ?? null;
    const senderUsername = params.senderUsername ?? null;

    // Deduplication check
    const dedupWindowSeconds = params.dedupWindowSeconds ?? 120;
    let dedupKey = params.dedupKey;

    if (!dedupKey) {
      // Auto-generate dedup key for actionable / social events that may be triggered repeatedly
      if (['REVIEW_LIKED', 'LIKE', 'FRIEND_REQUEST', 'TIER_LIST_INVITE', 'CONTENT_SHARED', 'ACHIEVEMENT', 'ACHIEVEMENT_UNLOCKED'].includes(type)) {
        dedupKey = `${type}:${recipientId}:${actorId || 'sys'}:${entityType || ''}:${entityId || ''}`;
      }
    }

    try {
      if (dedupKey) {
        const windowStart = new Date(Date.now() - dedupWindowSeconds * 1000);
        const [existing] = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              or(eq(notifications.recipientUserId, recipientId), eq(notifications.userId, recipientId)),
              eq(notifications.dedupKey, dedupKey),
              gte(notifications.createdAt, windowStart)
            )
          )
          .limit(1);

        if (existing) {
          // Duplicate detected within deduplication window
          return { ok: true, duplicate: true, notificationId: existing.id };
        }
      }

      // 1. Fetch recipient user details & preferences
      const [userRecord] = await db
        .select({
          id: users.id,
          username: users.username,
          telegramChatId: users.telegramChatId,
          notificationSettings: users.notificationSettings,
        })
        .from(users)
        .where(eq(users.id, recipientId))
        .limit(1);

      if (!userRecord) return { ok: false };

      // 2. Resolve preferences for this specific notification type
      const prefs = normalizeNotificationPreferences(userRecord.notificationSettings);
      const channelSettings: NotificationChannelSettings = prefs[type] || {
        inApp: true,
        toast: true,
        telegram: false,
      };

      let insertedId: number | undefined;

      // 3. Channel: In-App (DB Persistence + Real-Time SSE Stream)
      if (channelSettings.inApp && !params.skipInApp) {
        const [saved] = await db
          .insert(notifications)
          .values({
            recipientUserId: recipientId,
            userId: recipientId,
            type,
            title,
            message,
            body,
            content,
            actorUserId: actorId,
            senderId: actorId,
            entityType,
            relatedEntity: entityType,
            entityId,
            relatedEntityId: entityId,
            metadata: metadataJson,
            metadataJson,
            dedupKey: dedupKey || null,
            link,
            senderAvatar,
            senderUsername,
            isRead: false,
            createdAt: new Date(),
          })
          .returning();

        insertedId = saved.id;

        // Fetch fresh unread count for SSE payload
        const unreadCountResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(notifications)
          .where(
            and(
              or(eq(notifications.recipientUserId, recipientId), eq(notifications.userId, recipientId)),
              eq(notifications.isRead, false)
            )
          );
        const unreadCount = Number(unreadCountResult[0]?.count || 1);

        // Push real-time event to user's active client tabs
        this.sendSSEEvent(recipientId, 'notification', {
          notification: {
            ...saved,
            recipientUserId: saved.recipientUserId || saved.userId,
            userId: saved.recipientUserId || saved.userId,
            message: saved.message || saved.body,
            body: saved.message || saved.body,
            actorUserId: saved.actorUserId !== undefined ? saved.actorUserId : saved.senderId,
            senderId: saved.actorUserId !== undefined ? saved.actorUserId : saved.senderId,
            entityType: saved.entityType || saved.relatedEntity,
            relatedEntity: saved.entityType || saved.relatedEntity,
            entityId: saved.entityId || saved.relatedEntityId,
            relatedEntityId: saved.entityId || saved.relatedEntityId,
            metadata: metadata,
            showToast: channelSettings.toast,
          },
          unreadCount,
        });
      }

      // 4. Channel: Telegram (Asynchronous Queue, Rate Limited)
      if (channelSettings.telegram && !params.skipTelegram && userRecord.telegramChatId) {
        this.enqueueTelegram({
          userId: recipientId,
          chatId: userRecord.telegramChatId,
          type,
          title,
          body: message,
          link: link || undefined,
          retries: 0,
        });
      }

      return { ok: true, notificationId: insertedId, duplicate: false };
    } catch (err) {
      console.error(`[NotificationService] Failed to create notification for user ${recipientId}:`, err);
      return { ok: false };
    }
  }

  /**
   * Alias for backward compatibility with existing callers of notifyUser.
   */
  public async notifyUser(payload: CreateNotificationPayload): Promise<{
    ok: boolean;
    notificationId?: number;
    duplicate?: boolean;
  }> {
    return this.create(payload);
  }

  /**
   * Broadcast notification to multiple or all users (e.g. Admin Announcements or System Alerts).
   */
  public async broadcastNotification(payload: BroadcastNotificationPayload): Promise<{ deliveredCount: number }> {
    try {
      let targetIds = payload.targetUserIds;

      if (!targetIds || targetIds.length === 0) {
        const allUsers = await db.select({ id: users.id }).from(users);
        targetIds = allUsers.map((u) => u.id);
      }

      if (payload.excludeUserId) {
        targetIds = targetIds.filter((id) => id !== payload.excludeUserId);
      }

      const effectiveType = payload.type || 'ADMIN_ANNOUNCEMENT';
      const effectiveMessage = payload.message || payload.body || '';

      let delivered = 0;
      for (const uid of targetIds) {
        const res = await this.create({
          recipientUserId: uid,
          type: effectiveType,
          title: payload.title,
          message: effectiveMessage,
          content: payload.content,
          link: payload.link,
          entityType: payload.entityType || payload.relatedEntity,
          entityId: payload.entityId || payload.relatedEntityId,
          actorUserId: payload.actorUserId || payload.senderId,
          metadata: payload.metadata,
        });
        if (res.ok && !res.duplicate) delivered++;
      }

      return { deliveredCount: delivered };
    } catch (err) {
      console.error('[NotificationService] Broadcast failed:', err);
      return { deliveredCount: 0 };
    }
  }

  // =========================================================================
  // DOMAIN-SPECIFIC CONVENIENCE HELPERS
  // =========================================================================

  public async notifyFriendRequest(
    sender: { id: number; username: string; avatar?: string | null },
    receiverId: number
  ) {
    return this.create({
      recipientUserId: receiverId,
      actorUserId: sender.id,
      senderUsername: sender.username,
      senderAvatar: sender.avatar,
      type: 'FRIEND_REQUEST',
      title: 'Новая заявка в друзья',
      message: `@${sender.username} хочет добавить вас в друзья`,
      link: '/friends',
      entityType: 'USER',
      entityId: String(sender.id),
      dedupKey: `friend_request:${sender.id}:${receiverId}`,
      dedupWindowSeconds: 300,
    });
  }

  public async notifyFriendAccepted(
    sender: { id: number; username: string; avatar?: string | null },
    receiverId: number
  ) {
    return this.create({
      recipientUserId: receiverId,
      actorUserId: sender.id,
      senderUsername: sender.username,
      senderAvatar: sender.avatar,
      type: 'FRIEND_ACCEPTED',
      title: 'Заявка в друзья принята',
      message: `@${sender.username} теперь у вас в друзьях!`,
      link: `/u/${sender.username}`,
      entityType: 'USER',
      entityId: String(sender.id),
      dedupKey: `friend_accepted:${sender.id}:${receiverId}`,
    });
  }

  public async notifyReviewLiked(
    actor: { id: number; username: string; avatar?: string | null },
    reviewAuthorId: number,
    reviewId: number,
    mediaTitle?: string,
    mediaId?: number | string
  ) {
    const titleSnippet = mediaTitle ? ` к «${mediaTitle}»` : '';
    return this.create({
      recipientUserId: reviewAuthorId,
      actorUserId: actor.id,
      senderUsername: actor.username,
      senderAvatar: actor.avatar,
      type: 'REVIEW_LIKED',
      title: 'Новый лайк',
      message: `@${actor.username} оценил(а) вашу рецензию${titleSnippet}`,
      link: mediaId ? `/media/any/${mediaId}` : undefined,
      entityType: 'REVIEW',
      entityId: String(reviewId),
      dedupKey: `like:review:${actor.id}:${reviewId}`,
      dedupWindowSeconds: 300,
      metadata: { reviewId, mediaId, mediaTitle },
    });
  }

  public async notifyReviewCommented(
    author: { id: number; username: string; avatar?: string | null },
    reviewAuthorId: number,
    reviewId: number,
    commentSnippet: string,
    mediaTitle?: string,
    mediaId?: number | string
  ) {
    const titleSnippet = mediaTitle ? ` к «${mediaTitle}»` : '';
    return this.create({
      recipientUserId: reviewAuthorId,
      actorUserId: author.id,
      senderUsername: author.username,
      senderAvatar: author.avatar,
      type: 'REVIEW_COMMENTED',
      title: 'Новый комментарий к рецензии',
      message: `@${author.username} прокомментировал(а) вашу рецензию${titleSnippet}: «${commentSnippet.substring(0, 100)}»`,
      content: commentSnippet,
      link: mediaId ? `/media/any/${mediaId}` : undefined,
      entityType: 'REVIEW',
      entityId: String(reviewId),
      dedupKey: `comment:review:${author.id}:${reviewId}:${commentSnippet.substring(0, 30)}`,
      dedupWindowSeconds: 60,
      metadata: { reviewId, mediaId, mediaTitle },
    });
  }

  public async notifyFeedbackReplied(
    admin: { id: number; username: string; avatar?: string | null },
    recipientUserId: number,
    reportId: number,
    replySnippet: string
  ) {
    return this.create({
      recipientUserId,
      actorUserId: admin.id,
      senderUsername: admin.username,
      senderAvatar: admin.avatar,
      type: 'FEEDBACK_REPLIED',
      title: 'Администратор ответил на ваш отзыв',
      message: replySnippet,
      content: replySnippet,
      link: `/feedback?id=${reportId}`,
      entityType: 'REPORT',
      entityId: String(reportId),
      metadata: { reportId, replySnippet },
    });
  }

  public async notifyContentCompleted(
    userId: number,
    mediaTitle: string,
    mediaId: number,
    mediaType?: string
  ) {
    const rawType = (mediaType || '').toUpperCase();
    let actionVerb = 'просмотр';
    if (rawType === 'GAME') {
      actionVerb = 'прохождение';
    } else if (rawType === 'BOOK' || rawType === 'MANGA' || rawType === 'COMIC') {
      actionVerb = 'чтение';
    } else if (rawType === 'MUSIC') {
      actionVerb = 'прослушивание';
    }

    return this.create({
      recipientUserId: userId,
      type: 'CONTENT_COMPLETED',
      title: '🎉 Завершено!',
      message: `Вы завершили ${actionVerb} «${mediaTitle}»! Поздравляем!`,
      link: `/media/${mediaType?.toLowerCase() || 'any'}/${mediaId}`,
      entityType: 'MEDIA',
      entityId: String(mediaId),
      dedupKey: `content_completed:${userId}:${mediaId}`,
      dedupWindowSeconds: 600,
      metadata: { mediaId, mediaTitle, mediaType },
    });
  }

  public async notifyContentRated(
    userId: number,
    mediaTitle: string,
    mediaId: number,
    rating: number,
    mediaType?: string
  ) {
    return this.create({
      recipientUserId: userId,
      type: 'RATING_CHANGED',
      title: '⭐ Оценка сохранена',
      message: `Вы поставили оценку ${rating}/10 для «${mediaTitle}».`,
      link: `/media/${mediaType?.toLowerCase() || 'any'}/${mediaId}`,
      entityType: 'MEDIA',
      entityId: String(mediaId),
      dedupKey: `content_rated:${userId}:${mediaId}:${rating}`,
      dedupWindowSeconds: 300,
      metadata: { mediaId, mediaTitle, mediaType, rating },
    });
  }

  public async notifyContentShared(
    sender: { id: number; username: string; avatar?: string | null },
    recipientUserId: number,
    mediaTitle: string,
    mediaId: number,
    mediaType?: string,
    options?: {
      note?: string;
      rating?: number | null;
      isCompletion?: boolean;
    } | string
  ) {
    const opts = typeof options === 'string' ? { note: options } : options || {};
    const noteText = opts.note ? ` с комментарием: «${opts.note}»` : '';
    const ratingText = opts.rating ? ` (оценка ${opts.rating}/10)` : '';

    const title = opts.isCompletion
      ? `@${sender.username} завершил(а) «${mediaTitle}»`
      : `Рекомендация от @${sender.username}`;

    const message = opts.isCompletion
      ? `@${sender.username} завершил(а) «${mediaTitle}»${ratingText}${noteText} и делится этим с вами!`
      : `@${sender.username} рекомендует вам «${mediaTitle}»${noteText}`;

    return this.create({
      recipientUserId,
      actorUserId: sender.id,
      senderUsername: sender.username,
      senderAvatar: sender.avatar,
      type: 'CONTENT_SHARED',
      title,
      message,
      content: opts.note || undefined,
      link: `/media/${mediaType?.toLowerCase() || 'any'}/${mediaId}`,
      entityType: 'MEDIA',
      entityId: String(mediaId),
      dedupKey: `content_shared:${sender.id}:${recipientUserId}:${mediaId}`,
      dedupWindowSeconds: 3600,
      metadata: { mediaId, mediaTitle, mediaType, note: opts.note, rating: opts.rating, isCompletion: opts.isCompletion },
    });
  }

  public async notifyTierListInvite(
    inviter: { id: number; username: string; avatar?: string | null },
    recipientUserId: number,
    tierListId: number,
    tierListTitle: string
  ) {
    return this.create({
      recipientUserId,
      actorUserId: inviter.id,
      senderUsername: inviter.username,
      senderAvatar: inviter.avatar,
      type: 'TIER_LIST_INVITE',
      title: 'Приглашение в тир-лист',
      message: `@${inviter.username} приглашает вас посмотреть и оценить тир-лист «${tierListTitle}»`,
      link: `/tier-lists/${tierListId}`,
      entityType: 'TIER_LIST',
      entityId: String(tierListId),
      dedupKey: `tier_list_invite:${inviter.id}:${recipientUserId}:${tierListId}`,
      dedupWindowSeconds: 300,
      metadata: { tierListId, tierListTitle },
    });
  }

  public async notifyAchievement(
    userId: number,
    achievement: { id: number; title: string; description: string; points: number }
  ) {
    return this.create({
      recipientUserId: userId,
      type: 'ACHIEVEMENT',
      title: '🏆 Новое достижение!',
      message: `«${achievement.title}» (+${achievement.points} PTS): ${achievement.description}`,
      link: '/achievements',
      entityType: 'ACHIEVEMENT',
      entityId: String(achievement.id),
      dedupKey: `achievement:${userId}:${achievement.id}`,
      metadata: achievement,
    });
  }

  public async notifyAchievementUnlocked(
    userId: number,
    achievement: { id: number; title: string; description: string; points: number }
  ) {
    return this.notifyAchievement(userId, achievement);
  }

  public async notifyNewMessage(
    sender: { id: number; username: string; avatar?: string | null },
    receiverId: number,
    snippet: string
  ) {
    return this.create({
      recipientUserId: receiverId,
      actorUserId: sender.id,
      senderUsername: sender.username,
      senderAvatar: sender.avatar,
      type: 'NEW_MESSAGE',
      title: `Новое сообщение от @${sender.username}`,
      message: snippet,
      link: `/friends?chat=${sender.username}`,
      entityType: 'USER',
      entityId: String(sender.id),
      dedupKey: `new_message:${sender.id}:${receiverId}:${Date.now().toString().slice(0, -4)}`,
      dedupWindowSeconds: 15,
    });
  }

  public async notifyFriendReview(
    author: { id: number; username: string; avatar?: string | null },
    recipientId: number,
    mediaInfo: { id: number; title: string; type?: string },
    reviewSnippet: string
  ) {
    return this.create({
      recipientUserId: recipientId,
      actorUserId: author.id,
      senderUsername: author.username,
      senderAvatar: author.avatar,
      type: 'FRIEND_REVIEW',
      title: `Новый отзыв от @${author.username}`,
      message: `@${author.username} написал(а) отзыв к «${mediaInfo.title}»: «${reviewSnippet.substring(0, 100)}»`,
      link: `/media/${mediaInfo.type?.toLowerCase() || 'any'}/${mediaInfo.id}`,
      entityType: 'MEDIA',
      entityId: String(mediaInfo.id),
      metadata: { mediaId: mediaInfo.id, mediaTitle: mediaInfo.title },
    });
  }

  public async notifyFriendActivity(
    actor: { id: number; username: string; avatar?: string | null },
    recipientId: number,
    activityText: string,
    link?: string
  ) {
    return this.create({
      recipientUserId: recipientId,
      actorUserId: actor.id,
      senderUsername: actor.username,
      senderAvatar: actor.avatar,
      type: 'FRIEND_ACTIVITY',
      title: 'Активность друга',
      message: `@${actor.username} ${activityText}`,
      link: link || `/u/${actor.username}`,
      entityType: 'USER',
      entityId: actor.username,
    });
  }

  public async notifyMention(
    author: { id: number; username: string; avatar?: string | null },
    mentionedUserId: number,
    contextSnippet: string,
    link: string
  ) {
    return this.create({
      recipientUserId: mentionedUserId,
      actorUserId: author.id,
      senderUsername: author.username,
      senderAvatar: author.avatar,
      type: 'MENTION',
      title: `Упоминание от @${author.username}`,
      message: `@${author.username} упомянул(а) вас: «${contextSnippet}»`,
      link,
      entityType: 'USER',
      entityId: author.username,
    });
  }

  public async notifyNewRelease(userId: number, mediaTitle: string, releaseInfo: string, link: string) {
    return this.create({
      recipientUserId: userId,
      type: 'NEW_RELEASE',
      title: '🎬 Новый релиз отслеживаемого контента',
      message: `«${mediaTitle}»: ${releaseInfo}`,
      link,
      entityType: 'MEDIA',
      dedupKey: `new_release:${userId}:${mediaTitle}:${releaseInfo}`,
      dedupWindowSeconds: 3600,
    });
  }

  public sendTelegramNotification(text: string, targetChatId?: string) {
    (async () => {
      try {
        if (targetChatId) {
          await telegramBot.sendMessage(targetChatId, text);
          return;
        }
        const tgUsers = await db
          .select({ chatId: users.telegramChatId })
          .from(users)
          .where(sql`${users.telegramChatId} IS NOT NULL`);
        for (const u of tgUsers) {
          if (u.chatId) {
            try {
              await telegramBot.sendMessage(u.chatId, text);
              await new Promise((resolve) => setTimeout(resolve, 50));
            } catch (_e) {}
          }
        }
      } catch (err) {
        console.error('[NotificationService] sendTelegramNotification error:', err);
      }
    })();
  }

  private safeJsonParse(val: string): any {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
}

export const notificationService = new NotificationService();
export const NotificationDispatcher = notificationService;
export { NotificationService };
