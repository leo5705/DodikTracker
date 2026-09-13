import { Response } from 'express';
import { db } from '../../db/index.ts';
import { notifications, users } from '../../db/schema.ts';
import { eq, and, sql } from 'drizzle-orm';
import { telegramBot } from '../telegram.ts';
import {
  NotificationType,
  NotificationChannelSettings,
  normalizeNotificationPreferences,
  getDefaultNotificationPreferences,
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

export interface CreateNotificationPayload {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  content?: string;
  link?: string;
  relatedEntity?: string;
  relatedEntityId?: string;
  senderId?: number;
  senderAvatar?: string;
  senderUsername?: string;
  metadata?: Record<string, any>;
  skipInApp?: boolean;
}

export interface BroadcastNotificationPayload {
  type?: NotificationType;
  title: string;
  body: string;
  link?: string;
  relatedEntity?: string;
  relatedEntityId?: string;
  senderId?: number;
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

  private getNotificationEmoji(type: string): string {
    switch (type) {
      case 'ACHIEVEMENT_UNLOCKED': return '🏆';
      case 'FRIEND_REQUEST': return '👥';
      case 'FRIEND_ACCEPTED': return '🤝';
      case 'NEW_MESSAGE': return '💬';
      case 'FRIEND_REVIEW': return '✍️';
      case 'FRIEND_ACTIVITY': return '⚡';
      case 'NEW_RELEASE': return '🎬';
      case 'MENTION': return '🔔';
      case 'ADMIN_ALERT': return '🛡️';
      case 'SYSTEM': return 'ℹ️';
      case 'LIKE': return '❤️';
      case 'COMMENT': return '💬';
      case 'LIST_INVITE': return '📋';
      case 'LIST_FOLLOW': return '⭐';
      default: return '🔔';
    }
  }

  // =========================================================================
  // CORE NOTIFICATION DISPATCHER
  // =========================================================================

  /**
   * Main entry point to deliver a notification to a specific user.
   * Checks user's channel preferences (inApp, toast, telegram).
   */
  public async notifyUser(payload: CreateNotificationPayload): Promise<{ ok: boolean; notificationId?: number }> {
    const {
      userId,
      type,
      title,
      body,
      content,
      link,
      relatedEntity,
      relatedEntityId,
      senderId,
      senderAvatar,
      senderUsername,
      metadata,
      skipInApp,
    } = payload;

    if (!userId) return { ok: false };

    try {
      // 1. Fetch user notification settings & telegram chatId
      const [userRecord] = await db
        .select({
          id: users.id,
          username: users.username,
          telegramChatId: users.telegramChatId,
          notificationSettings: users.notificationSettings,
        })
        .from(users)
        .where(eq(users.id, userId))
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

      // 3. Deliver In-App (DB + Real-Time SSE)
      if (channelSettings.inApp && !skipInApp) {
        const [saved] = await db
          .insert(notifications)
          .values({
            userId,
            type,
            title,
            body,
            content: content || body,
            link: link || null,
            relatedEntity: relatedEntity || null,
            relatedEntityId: relatedEntityId || null,
            senderId: senderId || null,
            senderAvatar: senderAvatar || null,
            senderUsername: senderUsername || null,
            metadataJson: metadata ? JSON.stringify(metadata) : null,
            isRead: false,
            createdAt: new Date(),
          })
          .returning();

        insertedId = saved.id;

        // Fetch fresh unread count for SSE payload
        const unreadCountResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(notifications)
          .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
        const unreadCount = Number(unreadCountResult[0]?.count || 1);

        // Push real-time event to user's active client tabs
        this.sendSSEEvent(userId, 'notification', {
          notification: {
            ...saved,
            showToast: channelSettings.toast,
          },
          unreadCount,
        });
      }

      // 4. Deliver via Telegram (Async Queue)
      if (channelSettings.telegram && userRecord.telegramChatId) {
        this.enqueueTelegram({
          userId,
          chatId: userRecord.telegramChatId,
          type,
          title,
          body,
          link,
          retries: 0,
        });
      }

      return { ok: true, notificationId: insertedId };
    } catch (err) {
      console.error(`[NotificationService] Failed to notify user ${userId}:`, err);
      return { ok: false };
    }
  }

  /**
   * Broadcast notification to multiple or all users (System / Admin Alerts)
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

      let delivered = 0;
      for (const uid of targetIds) {
        const res = await this.notifyUser({
          userId: uid,
          type: payload.type || 'ADMIN_ALERT',
          title: payload.title,
          body: payload.body,
          link: payload.link,
          relatedEntity: payload.relatedEntity,
          relatedEntityId: payload.relatedEntityId,
          senderId: payload.senderId,
        });
        if (res.ok) delivered++;
      }

      return { deliveredCount: delivered };
    } catch (err) {
      console.error('[NotificationService] Broadcast failed:', err);
      return { deliveredCount: 0 };
    }
  }

  // =========================================================================
  // HIGH-LEVEL CONVENIENCE HELPERS
  // =========================================================================

  public async notifyAchievementUnlocked(userId: number, achievement: { id: number; title: string; description: string; points: number }) {
    return this.notifyUser({
      userId,
      type: 'ACHIEVEMENT_UNLOCKED',
      title: '🏆 Новое достижение!',
      body: `«${achievement.title}» (+${achievement.points} PTS): ${achievement.description}`,
      link: '/achievements',
      relatedEntity: 'ACHIEVEMENT',
      relatedEntityId: String(achievement.id),
    });
  }

  public async notifyFriendRequest(sender: { id: number; username: string; avatar?: string | null }, receiverId: number) {
    return this.notifyUser({
      userId: receiverId,
      type: 'FRIEND_REQUEST',
      title: 'Новая заявка в друзья',
      body: `@${sender.username} хочет добавить вас в друзья`,
      link: '/friends',
      senderId: sender.id,
      senderUsername: sender.username,
      senderAvatar: sender.avatar,
      relatedEntity: 'USER',
      relatedEntityId: sender.username,
    });
  }

  public async notifyFriendAccepted(sender: { id: number; username: string; avatar?: string | null }, receiverId: number) {
    return this.notifyUser({
      userId: receiverId,
      type: 'FRIEND_ACCEPTED',
      title: 'Заявка в друзья принята',
      body: `@${sender.username} теперь у вас в друзьях!`,
      link: `/u/${sender.username}`,
      senderId: sender.id,
      senderUsername: sender.username,
      senderAvatar: sender.avatar,
      relatedEntity: 'USER',
      relatedEntityId: sender.username,
    });
  }

  public async notifyNewMessage(sender: { id: number; username: string; avatar?: string | null }, receiverId: number, snippet: string) {
    return this.notifyUser({
      userId: receiverId,
      type: 'NEW_MESSAGE',
      title: `Новое сообщение от @${sender.username}`,
      body: snippet,
      link: `/friends?chat=${sender.username}`,
      senderId: sender.id,
      senderUsername: sender.username,
      senderAvatar: sender.avatar,
      relatedEntity: 'USER',
      relatedEntityId: sender.username,
    });
  }

  public async notifyFriendReview(
    author: { id: number; username: string; avatar?: string | null },
    recipientId: number,
    mediaInfo: { id: number; title: string; type?: string },
    reviewSnippet: string
  ) {
    return this.notifyUser({
      userId: recipientId,
      type: 'FRIEND_REVIEW',
      title: `Новый отзыв от @${author.username}`,
      body: `@${author.username} написал(а) отзыв к «${mediaInfo.title}»: «${reviewSnippet}»`,
      link: `/media/${mediaInfo.type?.toLowerCase() || 'any'}/${mediaInfo.id}`,
      senderId: author.id,
      senderUsername: author.username,
      senderAvatar: author.avatar,
      relatedEntity: 'MEDIA',
      relatedEntityId: String(mediaInfo.id),
    });
  }

  public async notifyFriendActivity(
    actor: { id: number; username: string; avatar?: string | null },
    recipientId: number,
    activityText: string,
    link?: string
  ) {
    return this.notifyUser({
      userId: recipientId,
      type: 'FRIEND_ACTIVITY',
      title: `Активность друга`,
      body: `@${actor.username} ${activityText}`,
      link: link || `/u/${actor.username}`,
      senderId: actor.id,
      senderUsername: actor.username,
      senderAvatar: actor.avatar,
      relatedEntity: 'USER',
      relatedEntityId: actor.username,
    });
  }

  public async notifyMention(
    author: { id: number; username: string; avatar?: string | null },
    mentionedUserId: number,
    contextSnippet: string,
    link: string
  ) {
    return this.notifyUser({
      userId: mentionedUserId,
      type: 'MENTION',
      title: `Упоминание от @${author.username}`,
      body: `@${author.username} упомянул(а) вас: «${contextSnippet}»`,
      link,
      senderId: author.id,
      senderUsername: author.username,
      senderAvatar: author.avatar,
      relatedEntity: 'USER',
      relatedEntityId: author.username,
    });
  }

  public async notifyNewRelease(userId: number, mediaTitle: string, releaseInfo: string, link: string) {
    return this.notifyUser({
      userId,
      type: 'NEW_RELEASE',
      title: '🎬 Новый релиз отслеживаемого контента',
      body: `«${mediaTitle}»: ${releaseInfo}`,
      link,
      relatedEntity: 'MEDIA',
    });
  }
}

export const notificationService = new NotificationService();
