/**
 * Watch Party WebSocket Server
 * Real-time synchronization, authoritative playback events, chat, and room connection management.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import { users } from '../../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../../../lib/firebase-admin.ts';
import {
  ClientToServerEvent,
  ServerToClientEvent,
  WatchPartyRoom,
  WatchPartyPlaybackState,
  MediaSourceConfig,
} from '../../../types/watchParty.ts';
import { watchPartyService } from './watchPartyService.ts';
import { roomManager } from './roomManager.ts';

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  username?: string;
  avatar?: string | null;
  currentRoomCode?: string;
  isAlive?: boolean;
  lastProgressAt?: number;
  chatRateLimitTimestamps?: number[];
}

export class WatchPartyWebSocketServer {
  private wss: WebSocketServer;
  // Room code -> Set of active WebSockets in that room
  private roomConnections: Map<string, Set<AuthenticatedWebSocket>> = new Map();
  // User ID -> Set of all active WebSockets for that user
  private userSockets: Map<number, Set<AuthenticatedWebSocket>> = new Map();

  // Background timers
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private telemetryInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupListeners();
    this.startHeartbeat();
    this.startTelemetryAggregation();
  }

  public getWss(): WebSocketServer {
    return this.wss;
  }

  /**
   * Parses token from cookie or query params during HTTP upgrade handshake.
   */
  public async authenticateRequest(req: IncomingMessage): Promise<{ id: number; username: string; avatar: string | null } | null> {
    try {
      let token: string | undefined;

      // 1. Query parameter token (e.g. /ws/watch-party?token=...)
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const queryToken = url.searchParams.get('token');
      if (queryToken) {
        token = queryToken;
      }

      // 2. Cookie header: dodik_session=...
      if (!token && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, val] = cookie.trim().split('=');
          if (name === 'dodik_session' && val) {
            token = decodeURIComponent(val);
            break;
          }
        }
      }

      // 3. Authorization header
      if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.slice(7);
      }

      if (!token) return null;

      // 1. Try Custom JWT Token first
      try {
        const payload = jwt.verify(token, JWT_SECRET) as any;
        if (payload && payload.userId) {
          const [user] = await db
            .select({ id: users.id, username: users.username, avatar: users.avatar, isBlocked: users.isBlocked })
            .from(users)
            .where(eq(users.id, payload.userId))
            .limit(1);

          if (user && !user.isBlocked) {
            return { id: user.id, username: user.username, avatar: user.avatar };
          }
        }
      } catch (_jwtErr) {
        // Fall back to Firebase verification
      }

      // 2. Try Firebase ID token verification
      try {
        const decodedToken = await adminAuth.verifyIdToken(token);
        if (decodedToken && decodedToken.uid) {
          const [user] = await db
            .select({ id: users.id, username: users.username, avatar: users.avatar, isBlocked: users.isBlocked })
            .from(users)
            .where(eq(users.uid, decodedToken.uid))
            .limit(1);

          if (user && !user.isBlocked) {
            return { id: user.id, username: user.username, avatar: user.avatar };
          }
        }
      } catch (_fbErr) {
        // Both verification attempts failed
      }

      return null;
    } catch (_err) {
      return null;
    }
  }

  /**
   * Attaches connection and event handlers.
   */
  private setupListeners(): void {
    this.wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      if (ws.userId) {
        if (!this.userSockets.has(ws.userId)) {
          this.userSockets.set(ws.userId, new Set());
        }
        this.userSockets.get(ws.userId)!.add(ws);
      }

      ws.on('message', async (data: string | Buffer) => {
        try {
          const raw = data.toString();
          const event: ClientToServerEvent = JSON.parse(raw);
          await this.handleClientEvent(ws, event);
        } catch (err: any) {
          this.sendError(ws, 'INVALID_PAYLOAD', err?.message || 'Некорректный формат сообщения');
        }
      });

      ws.on('close', () => {
        this.handleSocketDisconnect(ws);
      });

      ws.on('error', (err) => {
        console.warn(`[WatchParty WS] Socket error (User ${ws.userId || 'anon'}):`, err.message);
      });
    });
  }

  /**
   * Centralized message routing for incoming client events.
   */
  private async handleClientEvent(ws: AuthenticatedWebSocket, event: ClientToServerEvent): Promise<void> {
    if (!ws.userId || !ws.username) {
      this.sendError(ws, 'UNAUTHORIZED', 'Требуется авторизация');
      ws.close(4401, 'Unauthorized');
      return;
    }

    if (!event || typeof event !== 'object' || Array.isArray(event) || !event.type) {
      this.sendError(ws, 'INVALID_PAYLOAD', 'Некорректная структура события');
      return;
    }

    switch (event.type) {
      case 'JOIN_ROOM':
        await this.handleJoinRoom(ws, event.roomId, event.passcode);
        break;

      case 'LEAVE_ROOM':
        await this.handleLeaveRoom(ws);
        break;

      case 'HOST_PLAY':
        await this.handleHostPlay(ws, event.position);
        break;

      case 'HOST_PAUSE':
        await this.handleHostPause(ws, event.position);
        break;

      case 'HOST_SEEK':
        await this.handleHostSeek(ws, event.position);
        break;

      case 'HOST_FORCE_SYNC':
        await this.handleHostForceSync(ws, event.position, event.playbackState);
        break;

      case 'HOST_CHANGE_SOURCE':
        await this.handleHostChangeSource(ws, event.source, event.mediaId, event.seasonNumber, event.episodeNumber);
        break;

      case 'HOST_TRANSFER':
        await this.handleHostTransfer(ws, event.targetUserId);
        break;

      case 'HOST_KICK':
        await this.handleHostKick(ws, event.targetUserId, event.ban);
        break;

      case 'HOST_CLOSE_ROOM':
        await this.handleHostCloseRoom(ws);
        break;

      case 'MEMBER_PROGRESS':
        this.handleMemberProgress(ws, event);
        break;

      case 'CHAT_MESSAGE':
        await this.handleChatMessage(ws, event.content, event.playbackTimestamp);
        break;

      case 'REQUEST_SYNC':
        this.handleRequestSync(ws);
        break;

      default:
        this.sendError(ws, 'INVALID_MESSAGE', 'Неизвестный тип события');
    }
  }

  /**
   * 1. JOIN ROOM
   */
  private async handleJoinRoom(ws: AuthenticatedWebSocket, roomCodeInput: string, passcode?: string): Promise<void> {
    if (!roomCodeInput) {
      this.sendError(ws, 'INVALID_PAYLOAD', 'Не указан код комнаты');
      return;
    }

    const cleanCode = roomCodeInput.trim();

    try {
      // Use Stage 2 Service for membership logic & password validation
      const { room, member } = await watchPartyService.joinRoom(cleanCode, ws.userId!, passcode);

      // If socket was already in another room, leave previous room first
      if (ws.currentRoomCode && ws.currentRoomCode !== room.code) {
        this.removeSocketFromRoom(ws, ws.currentRoomCode);
      }

      ws.currentRoomCode = room.code;

      if (!this.roomConnections.has(room.code)) {
        this.roomConnections.set(room.code, new Set());
      }
      this.roomConnections.get(room.code)!.add(ws);

      // Upsert live state in memory
      roomManager.upsertMemberLiveState(room.code, {
        userId: ws.userId!,
        username: ws.username!,
        avatar: ws.avatar || null,
        role: member.role,
      });

      const authoritativePlayback = roomManager.getAuthoritativePlayback(room.code) || {
        state: room.playbackState,
        position: room.lastCurrentTime,
        duration: room.lastDuration,
        serverTimestamp: Date.now(),
      };

      const membersLive = roomManager.listActiveMembers(room.code);

      // 1. Send complete ROOM_STATE to the joining client
      this.sendEvent(ws, {
        type: 'ROOM_STATE',
        room,
        authoritativePlayback,
        members: membersLive,
        serverTimestamp: Date.now(),
      });

      // 2. Broadcast MEMBER_JOINED to all other sockets in this room
      const currentLiveMember = roomManager.getMember(room.code, ws.userId!);
      if (currentLiveMember) {
        this.broadcastToRoom(
          room.code,
          {
            type: 'MEMBER_JOINED',
            member: currentLiveMember,
          },
          ws
        );
      }
    } catch (err: any) {
      let code = 'FORBIDDEN';
      if (err.message.includes('не найдена')) code = 'ROOM_NOT_FOUND';
      else if (err.message.includes('закрыта')) code = 'ROOM_CLOSED';
      else if (err.message.includes('заблокированы')) code = 'BANNED';
      else if (err.message.includes('пароль')) code = 'FORBIDDEN';

      this.sendError(ws, code, err.message || 'Ошибка входа в комнату');
    }
  }

  /**
   * 2. LEAVE ROOM
   */
  private async handleLeaveRoom(ws: AuthenticatedWebSocket): Promise<void> {
    const roomCode = ws.currentRoomCode;
    if (!roomCode || !ws.userId) return;

    this.removeSocketFromRoom(ws, roomCode);
    ws.currentRoomCode = undefined;

    try {
      const result = await watchPartyService.leaveRoom(roomCode, ws.userId);

      if (result.roomClosed) {
        this.broadcastToRoom(roomCode, {
          type: 'ROOM_CLOSED',
          reason: 'Комната закрыта, так как все участники покинули её.',
        });
        this.cleanupRoomSockets(roomCode);
      } else if (result.newHostUserId) {
        this.broadcastToRoom(roomCode, {
          type: 'HOST_CHANGED',
          previousHostUserId: ws.userId,
          newHostUserId: result.newHostUserId,
        });
        this.broadcastToRoom(roomCode, {
          type: 'MEMBER_LEFT',
          userId: ws.userId,
          reason: 'Покинул комнату',
        });
      } else {
        this.broadcastToRoom(roomCode, {
          type: 'MEMBER_LEFT',
          userId: ws.userId,
          reason: 'Покинул комнату',
        });
      }
    } catch (err: any) {
      console.warn(`[WatchParty WS] Leave room error:`, err.message);
    }
  }

  /**
   * 3. HOST PLAY
   */
  private async handleHostPlay(ws: AuthenticatedWebSocket, position?: number): Promise<void> {
    const roomCode = ws.currentRoomCode;
    if (!roomCode) {
      this.sendError(ws, 'NOT_MEMBER', 'Вы не находитесь в комнате');
      return;
    }

    try {
      const snapshot = await watchPartyService.setPlaybackState(roomCode, ws.userId!, 'PLAYING', position);

      this.broadcastToRoom(roomCode, {
        type: 'PLAYBACK_UPDATE',
        playbackState: snapshot.state,
        authoritativePosition: snapshot.position,
        duration: snapshot.duration,
        serverTimestamp: snapshot.serverTimestamp,
        triggeredByUserId: ws.userId!,
      });
    } catch (err: any) {
      this.sendError(ws, 'FORBIDDEN', err.message || 'Ошибка воспроизведения');
    }
  }

  /**
   * 4. HOST PAUSE
   */
  private async handleHostPause(ws: AuthenticatedWebSocket, position?: number): Promise<void> {
    const roomCode = ws.currentRoomCode;
    if (!roomCode) {
      this.sendError(ws, 'NOT_MEMBER', 'Вы не находитесь в комнате');
      return;
    }

    try {
      const snapshot = await watchPartyService.setPlaybackState(roomCode, ws.userId!, 'PAUSED', position);

      this.broadcastToRoom(roomCode, {
        type: 'PLAYBACK_UPDATE',
        playbackState: snapshot.state,
        authoritativePosition: snapshot.position,
        duration: snapshot.duration,
        serverTimestamp: snapshot.serverTimestamp,
        triggeredByUserId: ws.userId!,
      });
    } catch (err: any) {
      this.sendError(ws, 'FORBIDDEN', err.message || 'Ошибка паузы');
    }
  }

  /**
   * 5. HOST SEEK
   */
  private async handleHostSeek(ws: AuthenticatedWebSocket, targetPosition?: number): Promise<void> {
    const roomCode = ws.currentRoomCode;
    if (!roomCode) {
      this.sendError(ws, 'NOT_MEMBER', 'Вы не находитесь в комнате');
      return;
    }

    if (targetPosition === undefined || isNaN(targetPosition) || !isFinite(targetPosition) || targetPosition < 0) {
      this.sendError(ws, 'INVALID_PAYLOAD', 'Некорректная позиция таймкода');
      return;
    }

    try {
      const active = roomManager.getActiveRoom(roomCode);
      const currentPlaybackState: WatchPartyPlaybackState = active?.playbackState || 'PAUSED';

      const snapshot = await watchPartyService.setPlaybackState(
        roomCode,
        ws.userId!,
        currentPlaybackState,
        targetPosition
      );

      this.broadcastToRoom(roomCode, {
        type: 'PLAYBACK_UPDATE',
        playbackState: snapshot.state,
        authoritativePosition: snapshot.position,
        duration: snapshot.duration,
        serverTimestamp: snapshot.serverTimestamp,
        triggeredByUserId: ws.userId!,
      });
    } catch (err: any) {
      this.sendError(ws, 'FORBIDDEN', err.message || 'Ошибка перемотки');
    }
  }

  /**
   * 5.5. HOST FORCE SYNC
   * Forces all members in room to instantly align to host's position and playback state.
   */
  private async handleHostForceSync(
    ws: AuthenticatedWebSocket,
    position: number,
    desiredState?: WatchPartyPlaybackState
  ): Promise<void> {
    const roomCode = ws.currentRoomCode;
    if (!roomCode) {
      this.sendError(ws, 'NOT_MEMBER', 'Вы не находитесь в комнате');
      return;
    }

    const targetPosition = typeof position === 'number' && !isNaN(position) ? Math.max(0, position) : 0;

    try {
      const active = roomManager.getActiveRoom(roomCode);
      const targetState: WatchPartyPlaybackState = desiredState || active?.playbackState || 'PLAYING';

      const snapshot = await watchPartyService.setPlaybackState(
        roomCode,
        ws.userId!,
        targetState,
        targetPosition
      );

      this.broadcastToRoom(roomCode, {
        type: 'PLAYBACK_UPDATE',
        playbackState: snapshot.state,
        authoritativePosition: snapshot.position,
        duration: snapshot.duration,
        serverTimestamp: snapshot.serverTimestamp,
        triggeredByUserId: ws.userId!,
        isForceSync: true,
      });
    } catch (err: any) {
      this.sendError(ws, 'FORBIDDEN', err.message || 'Ошибка принудительной синхронизации');
    }
  }

  /**
   * 6. HOST CHANGE SOURCE
   */
  private async handleHostChangeSource(
    ws: AuthenticatedWebSocket,
    source: MediaSourceConfig,
    mediaId?: number,
    seasonNumber?: number,
    episodeNumber?: number
  ): Promise<void> {
    const roomCode = ws.currentRoomCode;
    if (!roomCode) {
      this.sendError(ws, 'NOT_MEMBER', 'Вы не находитесь в комнате');
      return;
    }

    if (!source || !source.type) {
      this.sendError(ws, 'INVALID_PAYLOAD', 'Некорректная конфигурация источника');
      return;
    }

    try {
      await watchPartyService.changeSource(roomCode, ws.userId!, source, mediaId, seasonNumber, episodeNumber);

      this.broadcastToRoom(roomCode, {
        type: 'SOURCE_CHANGED',
        source,
        mediaId,
        seasonNumber,
        episodeNumber,
        updatedByUserId: ws.userId!,
      });

      // After source change, broadcast fresh PAUSED playback state
      const snapshot = roomManager.getAuthoritativePlayback(roomCode);
      if (snapshot) {
        this.broadcastToRoom(roomCode, {
          type: 'PLAYBACK_UPDATE',
          playbackState: snapshot.state,
          authoritativePosition: snapshot.position,
          duration: snapshot.duration,
          serverTimestamp: snapshot.serverTimestamp,
          triggeredByUserId: ws.userId!,
        });
      }
    } catch (err: any) {
      this.sendError(ws, 'FORBIDDEN', err.message || 'Ошибка смены источника медиа');
    }
  }

  /**
   * 7. HOST TRANSFER
   */
  private async handleHostTransfer(ws: AuthenticatedWebSocket, targetUserId: number): Promise<void> {
    const roomCode = ws.currentRoomCode;
    if (!roomCode) {
      this.sendError(ws, 'NOT_MEMBER', 'Вы не находитесь в комнате');
      return;
    }

    try {
      await watchPartyService.transferHost(roomCode, ws.userId!, targetUserId);

      this.broadcastToRoom(roomCode, {
        type: 'HOST_CHANGED',
        previousHostUserId: ws.userId!,
        newHostUserId: targetUserId,
      });
    } catch (err: any) {
      this.sendError(ws, 'FORBIDDEN', err.message || 'Ошибка передачи роли HOST');
    }
  }

  /**
   * 8. HOST KICK
   */
  private async handleHostKick(ws: AuthenticatedWebSocket, targetUserId: number, ban?: boolean): Promise<void> {
    const roomCode = ws.currentRoomCode;
    if (!roomCode) {
      this.sendError(ws, 'NOT_MEMBER', 'Вы не находитесь в комнате');
      return;
    }

    try {
      await watchPartyService.kickMember(roomCode, ws.userId!, targetUserId, Boolean(ban));

      // Notify and disconnect target user sockets
      const targetSockets = this.userSockets.get(targetUserId);
      if (targetSockets) {
        for (const sock of targetSockets) {
          if (sock.currentRoomCode === roomCode) {
            this.sendEvent(sock, {
              type: 'KICKED',
              reason: ban ? 'Вы были заблокированы в этой комнате' : 'Вы были исключены из комнаты',
              isBanned: Boolean(ban),
            });
            this.removeSocketFromRoom(sock, roomCode);
            sock.currentRoomCode = undefined;
          }
        }
      }

      this.broadcastToRoom(roomCode, {
        type: 'MEMBER_LEFT',
        userId: targetUserId,
        reason: ban ? 'Заблокирован хостом' : 'Исключён хостом',
      });
    } catch (err: any) {
      this.sendError(ws, 'FORBIDDEN', err.message || 'Ошибка исключения участника');
    }
  }

  /**
   * 9. HOST CLOSE ROOM
   */
  private async handleHostCloseRoom(ws: AuthenticatedWebSocket): Promise<void> {
    const roomCode = ws.currentRoomCode;
    if (!roomCode) {
      this.sendError(ws, 'NOT_MEMBER', 'Вы не находитесь в комнате');
      return;
    }

    try {
      await watchPartyService.closeRoom(roomCode, ws.userId!);

      this.broadcastToRoom(roomCode, {
        type: 'ROOM_CLOSED',
        reason: 'Комната была закрыта создателем.',
      });

      this.cleanupRoomSockets(roomCode);
    } catch (err: any) {
      this.sendError(ws, 'FORBIDDEN', err.message || 'Ошибка закрытия комнаты');
    }
  }

  /**
   * 10. MEMBER PROGRESS (Telemetry throttled to max 1 per 250ms)
   */
  private handleMemberProgress(
    ws: AuthenticatedWebSocket,
    event: { currentTime: number; duration: number; buffering: boolean; clientTimestamp: number }
  ): void {
    const roomCode = ws.currentRoomCode;
    if (!roomCode || !ws.userId) return;

    const now = Date.now();
    // Throttle progress processing to avoid excessive computation
    if (ws.lastProgressAt && now - ws.lastProgressAt < 250) {
      return;
    }
    ws.lastProgressAt = now;

    roomManager.updateMemberProgress(roomCode, ws.userId, {
      currentTime: typeof event.currentTime === 'number' && !isNaN(event.currentTime) ? Math.max(0, event.currentTime) : 0,
      duration: typeof event.duration === 'number' && !isNaN(event.duration) ? Math.max(0, event.duration) : 0,
      buffering: Boolean(event.buffering),
      clientTimestamp: event.clientTimestamp || now,
    });

    // Update live torrent session playback/buffering state if the host reports progress in a TORRENT room
    const active = roomManager.getActiveRoom(roomCode);
    const isHost = active && active.hostUserId === ws.userId;
    if (isHost && active.source?.type === 'TORRENT') {
      import('../torrentSearch/torrentSessionManager.ts').then(({ torrentSessionManager }) => {
        const targetState = event.buffering
          ? 'BUFFERING'
          : active.playbackState === 'PLAYING'
          ? 'PLAYING'
          : 'READY';
        torrentSessionManager.updatePlaybackState(roomCode, targetState);
      }).catch(() => {});
    }
  }

  /**
   * 11. REQUEST SYNC
   */
  private handleRequestSync(ws: AuthenticatedWebSocket): void {
    const roomCode = ws.currentRoomCode;
    if (!roomCode) return;

    const snapshot = roomManager.getAuthoritativePlayback(roomCode);
    if (!snapshot) return;

    this.sendEvent(ws, {
      type: 'PLAYBACK_UPDATE',
      playbackState: snapshot.state,
      authoritativePosition: snapshot.position,
      duration: snapshot.duration,
      serverTimestamp: snapshot.serverTimestamp,
      triggeredByUserId: ws.userId || 0,
    });
  }

  /**
   * 12. CHAT MESSAGE (With in-memory anti-spam rate limiting)
   */
  private async handleChatMessage(ws: AuthenticatedWebSocket, content: string, playbackTimestamp?: number): Promise<void> {
    const roomCode = ws.currentRoomCode;
    if (!roomCode || !ws.userId) {
      this.sendError(ws, 'NOT_MEMBER', 'Вы не находитесь в комнате');
      return;
    }

    const now = Date.now();
    if (!ws.chatRateLimitTimestamps) {
      ws.chatRateLimitTimestamps = [];
    }

    // Filter timestamps within the last 10 seconds
    ws.chatRateLimitTimestamps = ws.chatRateLimitTimestamps.filter((ts) => now - ts < 10000);

    // Limit: max 5 messages per 10 seconds
    if (ws.chatRateLimitTimestamps.length >= 5) {
      this.sendError(ws, 'RATE_LIMITED', 'Слишком частая отправка сообщений. Подождите немного.');
      return;
    }

    ws.chatRateLimitTimestamps.push(now);

    try {
      const savedMessage = await watchPartyService.createMessage(
        roomCode,
        ws.userId,
        content,
        playbackTimestamp,
        'TEXT'
      );

      this.broadcastToRoom(roomCode, {
        type: 'CHAT_MESSAGE',
        message: savedMessage,
      });
    } catch (err: any) {
      this.sendError(ws, 'INVALID_PAYLOAD', err.message || 'Ошибка отправки сообщения');
    }
  }

  /**
   * Periodic Aggregated Telemetry Broadcast (~2 times/second).
   */
  private startTelemetryAggregation(): void {
    if (this.telemetryInterval) return;

    this.telemetryInterval = setInterval(() => {
      for (const [roomCode, sockets] of this.roomConnections.entries()) {
        if (sockets.size === 0) continue;

        const members = roomManager.listActiveMembers(roomCode);
        if (members.length === 0) continue;

        const authoritative = roomManager.getAuthoritativePlayback(roomCode);
        const authoritativePosition = authoritative?.position ?? 0;
        const now = Date.now();

        const payload: ServerToClientEvent = {
          type: 'MEMBERS_STATE_UPDATE',
          members,
          authoritativePosition,
          serverTimestamp: now,
        };

        const json = JSON.stringify(payload);
        for (const sock of sockets) {
          if (sock.readyState === WebSocket.OPEN) {
            sock.send(json);
          }
        }
      }
    }, 500); // 500ms = 2 times per second
  }

  /**
   * Heartbeat / Ping-Pong (Every 30 seconds).
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      for (const client of this.wss.clients as Set<AuthenticatedWebSocket>) {
        if (client.isAlive === false) {
          console.log(`[WatchParty WS] Terminating stale socket (User ${client.userId || 'anon'})`);
          client.terminate();
          continue;
        }

        client.isAlive = false;
        client.ping();
      }
    }, 30000);
  }

  /**
   * Cleans up room socket references.
   */
  private removeSocketFromRoom(ws: AuthenticatedWebSocket, roomCode: string): void {
    const roomSet = this.roomConnections.get(roomCode);
    if (roomSet) {
      roomSet.delete(ws);
      if (roomSet.size === 0) {
        this.roomConnections.delete(roomCode);
      }
    }
  }

  /**
   * Disconnect cleanup handler.
   */
  private handleSocketDisconnect(ws: AuthenticatedWebSocket): void {
    if (ws.userId) {
      const userSet = this.userSockets.get(ws.userId);
      if (userSet) {
        userSet.delete(ws);
        if (userSet.size === 0) {
          this.userSockets.delete(ws.userId);
        }
      }
    }

    const roomCode = ws.currentRoomCode;
    if (roomCode) {
      this.removeSocketFromRoom(ws, roomCode);

      // Check if user has other active sockets in this room (e.g. other tabs)
      const otherSocketsInRoom = Array.from(this.roomConnections.get(roomCode) || []).some(
        (s) => s.userId === ws.userId
      );

      // If no remaining sockets for this user in the room, mark in-memory state disconnected
      if (!otherSocketsInRoom && ws.userId) {
        const liveMember = roomManager.getMember(roomCode, ws.userId);
        if (liveMember) {
          liveMember.isOnline = false;
          liveMember.syncStatus = 'DISCONNECTED';
        }
      }
    }
  }

  /**
   * Closes all connections belonging to a closed room.
   */
  private cleanupRoomSockets(roomCode: string): void {
    const set = this.roomConnections.get(roomCode);
    if (set) {
      for (const sock of set) {
        sock.currentRoomCode = undefined;
      }
      this.roomConnections.delete(roomCode);
    }
  }

  /**
   * Helper to send JSON event to a single socket.
   */
  public sendEvent(ws: WebSocket, event: ServerToClientEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  /**
   * Helper to send error message to a single socket.
   */
  public sendError(ws: WebSocket, code: string, message: string): void {
    this.sendEvent(ws, {
      type: 'ERROR',
      code,
      message,
    });
  }

  /**
   * Broadcasts a JSON event to all open connections in a room.
   */
  public broadcastToRoom(roomCode: string, event: ServerToClientEvent, excludeSocket?: WebSocket): void {
    const set = this.roomConnections.get(roomCode);
    if (!set || set.size === 0) return;

    const payload = JSON.stringify(event);
    for (const client of set) {
      if (client !== excludeSocket && client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Clean shutdown on server termination.
   */
  public destroy(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.telemetryInterval) clearInterval(this.telemetryInterval);
    this.wss.close();
  }
}

export const watchPartyWsServer = new WatchPartyWebSocketServer();
