import { Response } from 'express';
import { db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { notificationService } from './notificationService.ts';

export type PresenceStatus = 'online' | 'recently_online' | 'offline';

export interface UserPresenceInfo {
  userId: number;
  status: PresenceStatus;
  statusText: string;
  lastActiveAt: string | null;
  activeSessionsCount: number;
}

export interface ClientSession {
  sessionId: string;
  userId: number;
  connectedAt: number;
  lastPingAt: number;
  userAgent?: string;
  sseRes?: Response;
}

class PresenceService {
  // userId -> Map<sessionId, ClientSession>
  private userSessions: Map<number, Map<string, ClientSession>> = new Map();

  // In-memory record of last disconnected timestamp: userId -> Date
  private lastActiveMap: Map<number, Date> = new Map();

  // Disconnect grace timers: userId -> NodeJS.Timeout
  // Prevents false offline flutters when reloading (F5) or switching tabs
  private disconnectGraceTimers: Map<number, NodeJS.Timeout> = new Map();

  // Background watchdog timer for dead/hung connections
  private watchdogTimer: NodeJS.Timeout | null = null;

  // Session timeout: 35 seconds (heartbeats are sent every 15 seconds)
  private readonly SESSION_TIMEOUT_MS = 35000;
  // Grace period before marking offline: 3.5 seconds
  private readonly GRACE_PERIOD_MS = 3500;
  // Recently online threshold: 15 minutes
  private readonly RECENTLY_ONLINE_THRESHOLD_MS = 15 * 60 * 1000;

  constructor() {
    this.startWatchdog();
  }

  private startWatchdog() {
    if (this.watchdogTimer) return;
    this.watchdogTimer = setInterval(() => {
      this.cleanupStaleSessions();
    }, 5000);
  }

  public isUserOnline(userId: number): boolean {
    const sessions = this.userSessions.get(userId);
    return !!sessions && sessions.size > 0;
  }

  public getActiveSessionCount(userId: number): number {
    return this.userSessions.get(userId)?.size ?? 0;
  }

  /**
   * Register or update an active heartbeat from a client session.
   * Called by the client every ~15s or on initial connection.
   */
  public recordHeartbeat(userId: number, sessionId: string, userAgent?: string): UserPresenceInfo {
    // Clear any pending grace timeout because user is definitely active
    if (this.disconnectGraceTimers.has(userId)) {
      clearTimeout(this.disconnectGraceTimers.get(userId)!);
      this.disconnectGraceTimers.delete(userId);
    }

    const wasOnline = this.isUserOnline(userId);

    let userMap = this.userSessions.get(userId);
    if (!userMap) {
      userMap = new Map();
      this.userSessions.set(userId, userMap);
    }

    const now = Date.now();
    const existing = userMap.get(sessionId);

    userMap.set(sessionId, {
      sessionId,
      userId,
      connectedAt: existing?.connectedAt ?? now,
      lastPingAt: now,
      userAgent: userAgent || existing?.userAgent,
      sseRes: existing?.sseRes,
    });

    // If user just transitioned from offline to online, broadcast immediately
    if (!wasOnline) {
      const presence = this.getUserPresence(userId);
      this.broadcastPresence(presence);
    }

    return this.getUserPresence(userId);
  }

  /**
   * Attach an active Server-Sent Events response to a session.
   */
  public registerSSESession(userId: number, sessionId: string, res: Response, userAgent?: string) {
    // Clear grace timer if active
    if (this.disconnectGraceTimers.has(userId)) {
      clearTimeout(this.disconnectGraceTimers.get(userId)!);
      this.disconnectGraceTimers.delete(userId);
    }

    const wasOnline = this.isUserOnline(userId);

    let userMap = this.userSessions.get(userId);
    if (!userMap) {
      userMap = new Map();
      this.userSessions.set(userId, userMap);
    }

    const now = Date.now();
    const existing = userMap.get(sessionId);

    userMap.set(sessionId, {
      sessionId,
      userId,
      connectedAt: existing?.connectedAt ?? now,
      lastPingAt: now,
      userAgent: userAgent || existing?.userAgent,
      sseRes: res,
    });

    if (!wasOnline) {
      const presence = this.getUserPresence(userId);
      this.broadcastPresence(presence);
    }

    // When SSE stream closes (tab closed, browser closed, network disconnect)
    res.on('close', () => {
      this.removeSession(userId, sessionId);
    });
  }

  /**
   * Remove a specific session (tab closed, logout, or beacon send).
   */
  public removeSession(userId: number, sessionId: string) {
    const userMap = this.userSessions.get(userId);
    if (!userMap) return;

    userMap.delete(sessionId);

    // If user still has other active sessions (e.g. phone, other tabs), stay online
    if (userMap.size > 0) {
      return;
    }

    // Clean up empty map
    this.userSessions.delete(userId);

    // Use a short grace period to prevent false offline transitions during quick page reloads
    if (this.disconnectGraceTimers.has(userId)) {
      clearTimeout(this.disconnectGraceTimers.get(userId)!);
    }

    const timer = setTimeout(() => {
      this.disconnectGraceTimers.delete(userId);
      // If user did not reconnect during grace period, finalize offline status
      if (!this.isUserOnline(userId)) {
        this.handleUserWentOffline(userId);
      }
    }, this.GRACE_PERIOD_MS);

    this.disconnectGraceTimers.set(userId, timer);
  }

  /**
   * Finalize user offline status, save lastActiveAt to DB, and broadcast.
   */
  private handleUserWentOffline(userId: number) {
    const now = new Date();
    this.lastActiveMap.set(userId, now);

    // Update database last active timestamp
    db.update(users)
      .set({ updatedAt: now })
      .where(eq(users.id, userId))
      .catch((err) => {
        console.warn(`[PresenceService] Failed to update user ${userId} updatedAt:`, err);
      });

    const presence = this.getUserPresence(userId);
    this.broadcastPresence(presence);
  }

  /**
   * Watchdog cleanup for stale/hung connections where client abruptly disconnected
   * without TCP close or sendBeacon.
   */
  private cleanupStaleSessions() {
    const now = Date.now();
    const usersToCheckOffline: number[] = [];

    for (const [userId, sessionMap] of this.userSessions.entries()) {
      for (const [sessionId, session] of sessionMap.entries()) {
        if (now - session.lastPingAt > this.SESSION_TIMEOUT_MS) {
          sessionMap.delete(sessionId);
        }
      }

      if (sessionMap.size === 0) {
        this.userSessions.delete(userId);
        usersToCheckOffline.push(userId);
      }
    }

    for (const userId of usersToCheckOffline) {
      if (!this.disconnectGraceTimers.has(userId)) {
        this.handleUserWentOffline(userId);
      }
    }
  }

  /**
   * Broadcast presence update to all connected SSE clients.
   */
  public broadcastPresence(presence: UserPresenceInfo) {
    notificationService.broadcastSSEEvent('presence', presence);
  }

  private pluralHours(h: number): string {
    const mod10 = h % 10;
    const mod100 = h % 100;
    if (mod100 >= 11 && mod100 <= 19) return 'часов';
    if (mod10 === 1) return 'час';
    if (mod10 >= 2 && mod10 <= 4) return 'часа';
    return 'часов';
  }

  private pluralDays(d: number): string {
    const mod10 = d % 10;
    const mod100 = d % 100;
    if (mod100 >= 11 && mod100 <= 19) return 'дней';
    if (mod10 === 1) return 'день';
    if (mod10 >= 2 && mod10 <= 4) return 'дня';
    return 'дней';
  }

  public formatStatusText(status: PresenceStatus, lastActive: Date | null): string {
    if (status === 'online') {
      return 'В сети';
    }
    if (!lastActive) {
      return 'Не в сети';
    }

    const now = Date.now();
    const diffMs = Math.max(0, now - lastActive.getTime());
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin <= 1) {
      return 'Был(а) только что';
    }
    if (diffMin < 60) {
      return `Был(а) ${diffMin} мин. назад`;
    }

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      return `Был(а) ${diffHours} ${this.pluralHours(diffHours)} назад`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      return 'Был(а) вчера';
    }
    if (diffDays < 7) {
      return `Был(а) ${diffDays} ${this.pluralDays(diffDays)} назад`;
    }

    return `Был(а) ${lastActive.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
  }

  /**
   * Get calculated presence object for a given user.
   */
  public getUserPresence(userId: number, fallbackUpdatedAt?: Date | string | null): UserPresenceInfo {
    const isOnline = this.isUserOnline(userId);
    const activeCount = this.getActiveSessionCount(userId);

    if (isOnline) {
      return {
        userId,
        status: 'online',
        statusText: 'В сети',
        lastActiveAt: null,
        activeSessionsCount: activeCount,
      };
    }

    // Resolve last active timestamp
    let lastActive = this.lastActiveMap.get(userId);
    if (!lastActive && fallbackUpdatedAt) {
      lastActive = new Date(fallbackUpdatedAt);
      this.lastActiveMap.set(userId, lastActive);
    }

    let status: PresenceStatus = 'offline';
    if (lastActive) {
      const diffMs = Date.now() - lastActive.getTime();
      if (diffMs <= this.RECENTLY_ONLINE_THRESHOLD_MS) {
        status = 'recently_online';
      }
    }

    return {
      userId,
      status,
      statusText: this.formatStatusText(status, lastActive || null),
      lastActiveAt: lastActive ? lastActive.toISOString() : null,
      activeSessionsCount: 0,
    };
  }

  /**
   * Batch calculate presence for a list of users.
   */
  public getUsersPresence(
    userIds: number[],
    updatedAtMap?: Map<number, Date | string | null>
  ): Record<number, UserPresenceInfo> {
    const result: Record<number, UserPresenceInfo> = {};
    for (const id of userIds) {
      const fallback = updatedAtMap?.get(id);
      result[id] = this.getUserPresence(id, fallback);
    }
    return result;
  }
}

export const presenceService = new PresenceService();
