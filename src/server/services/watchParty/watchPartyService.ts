/**
 * WatchPartyService: Core business logic and database persistence for Watch Party sessions.
 * Manages database transactions, role authorization, room lifecycle, and bridges to RoomManager.
 */

import { db } from '../../../db/index.ts';
import {
  watchPartyRooms,
  watchPartyMembers,
  watchPartyMessages,
  users,
  media,
} from '../../../db/schema.ts';
import { eq, and, desc, asc, isNull, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  WatchPartyRoom,
  WatchPartyMember,
  WatchPartyMessage,
  WatchPartyRole,
  WatchPartyRoomStatus,
  WatchPartyPrivacy,
  WatchPartyPlaybackState,
  WatchPartySourceType,
  MediaSourceConfig,
  AuthoritativePlaybackSnapshot,
} from '../../../types/watchParty.ts';
import { roomManager, ActiveRoomState } from './roomManager.ts';

import { validateAndParseMagnet } from '../../../utils/magnetValidator.ts';

/**
 * Sanitizes and validates a MediaSourceConfig object before database persistence.
 */
function sanitizeSourceConfig(
  sourceType: WatchPartySourceType,
  sourceUrl?: string | null,
  sourceConfig?: MediaSourceConfig | null
): { sanitizedType: WatchPartySourceType; sanitizedUrl: string | null; sanitizedConfig: MediaSourceConfig | null } {
  let type = sourceType || 'DIRECT';
  let url = sourceUrl || null;
  let config: MediaSourceConfig | null = sourceConfig || null;

  if (type === 'TORRENT' || config?.type === 'TORRENT' || config?.magnetUri) {
    type = 'TORRENT';
    let rawMagnet = config?.magnetUri || config?.url || url || '';

    // If rawMagnet is not a valid magnet string, but a valid infoHash exists in config, resolve into canonical magnet URI
    const configHash = config?.infoHash || '';
    if (
      (!rawMagnet || rawMagnet.startsWith('http://') || rawMagnet.startsWith('https://')) &&
      configHash &&
      (/^[0-9a-fA-F]{40}$/i.test(configHash) || /^[2-7a-zA-Z]{32}$/i.test(configHash))
    ) {
      rawMagnet = `magnet:?xt=urn:btih:${configHash.toLowerCase()}${config?.title ? `&dn=${encodeURIComponent(config.title)}` : ''}`;
    }

    const parsed = validateAndParseMagnet(rawMagnet);

    if (!parsed.isValid) {
      throw new Error(`Некорректный источник торрента: ${parsed.error || 'Неверная magnet-ссылка'}`);
    }

    config = {
      type: 'TORRENT',
      magnetUri: parsed.magnetUri,
      fileName: config?.fileName ? String(config.fileName).slice(0, 500) : undefined,
      infoHash: parsed.infoHash,
      trackers: parsed.trackers,
      title: config?.title ? String(config.title).slice(0, 300) : parsed.displayName,
    };
    url = parsed.magnetUri;
  } else if (config) {
    // Strip sensitive fields
    const safeConfig: MediaSourceConfig = {
      type: config.type || type,
      url: config.url ? String(config.url).slice(0, 2048) : undefined,
      title: config.title ? String(config.title).slice(0, 300) : undefined,
      posterUrl: config.posterUrl ? String(config.posterUrl).slice(0, 2048) : undefined,
      subtitles: Array.isArray(config.subtitles) ? config.subtitles.slice(0, 20) : undefined,
      audioTracks: Array.isArray(config.audioTracks) ? config.audioTracks.slice(0, 10) : undefined,
    };
    config = safeConfig;
  }

  return { sanitizedType: type, sanitizedUrl: url, sanitizedConfig: config };
}

export interface CreateRoomInput {
  title: string;
  mediaId?: number | null;
  mediaType?: string;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  sourceType?: WatchPartySourceType;
  sourceUrl?: string | null;
  sourceConfig?: MediaSourceConfig | null;
  mediaMetadata?: Record<string, any> | null;
  privacy?: WatchPartyPrivacy;
  passcode?: string;
  initialDuration?: number;
}

export class WatchPartyService {
  /**
   * Generates a unique, cryptographically secure room code in format 'wtch-xxxxxx'.
   */
  public async generateUniqueRoomCode(): Promise<string> {
    for (let attempts = 0; attempts < 10; attempts++) {
      const randomPart = crypto.randomBytes(3).toString('hex').toLowerCase();
      const code = `wtch-${randomPart}`;

      const existing = await db
        .select({ id: watchPartyRooms.id })
        .from(watchPartyRooms)
        .where(eq(watchPartyRooms.code, code))
        .limit(1);

      if (existing.length === 0) {
        return code;
      }
    }
    // Fallback: longer random string
    return `wtch-${crypto.randomBytes(5).toString('hex').toLowerCase()}`;
  }

  /**
   * Transforms raw database record into a safe, client-facing WatchPartyRoom DTO.
   * Strips out sensitive information (e.g. passcodeHash).
   */
  public formatRoomDto(
    room: typeof watchPartyRooms.$inferSelect,
    hostUser?: { id: number; username: string; avatar: string | null } | null,
    memberCount?: number
  ): WatchPartyRoom {
    let parsedSourceConfig: MediaSourceConfig | null = null;
    if (room.sourceConfig) {
      try {
        parsedSourceConfig = typeof room.sourceConfig === 'string' ? JSON.parse(room.sourceConfig) : room.sourceConfig;
      } catch (_e) {
        parsedSourceConfig = null;
      }
    }

    let parsedMediaMetadata: Record<string, any> | null = null;
    if (room.mediaMetadata) {
      try {
        parsedMediaMetadata = typeof room.mediaMetadata === 'string' ? JSON.parse(room.mediaMetadata) : room.mediaMetadata;
      } catch (_e) {
        parsedMediaMetadata = null;
      }
    }

    // Get live playback state from RoomManager if active
    let livePlaybackState: WatchPartyPlaybackState = (room.playbackState as WatchPartyPlaybackState) || 'PAUSED';
    let liveCurrentTime = room.lastCurrentTime || 0;
    let liveDuration = room.lastDuration || 0;

    const activeRoom = roomManager.getActiveRoom(room.code);
    if (activeRoom) {
      livePlaybackState = activeRoom.playbackState;
      liveCurrentTime = roomManager.calculateAuthoritativePosition(activeRoom);
      liveDuration = activeRoom.duration || liveDuration;
    }

    return {
      id: room.id,
      code: room.code,
      title: room.title,
      mediaId: room.mediaId,
      mediaType: room.mediaType,
      seasonNumber: room.seasonNumber,
      episodeNumber: room.episodeNumber,
      hostUserId: room.hostUserId,
      hostUser: hostUser ? { id: hostUser.id, username: hostUser.username, avatar: hostUser.avatar } : undefined,
      sourceType: (room.sourceType as WatchPartySourceType) || 'DIRECT',
      sourceUrl: room.sourceUrl,
      sourceConfig: parsedSourceConfig,
      mediaMetadata: parsedMediaMetadata,
      status: (room.status as WatchPartyRoomStatus) || 'ACTIVE',
      privacy: (room.privacy as WatchPartyPrivacy) || 'PUBLIC',
      hasPasscode: Boolean(room.passcodeHash), // Safe boolean flag only
      playbackState: livePlaybackState,
      lastCurrentTime: liveCurrentTime,
      lastDuration: liveDuration,
      memberCount: memberCount ?? (activeRoom ? activeRoom.members.size : undefined),
      createdAt: room.createdAt ? new Date(room.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: room.updatedAt ? new Date(room.updatedAt).toISOString() : new Date().toISOString(),
      closedAt: room.closedAt ? new Date(room.closedAt).toISOString() : null,
    };
  }

  /**
   * Helper to fetch host details.
   */
  private async getHostUser(userId: number) {
    const [u] = await db
      .select({ id: users.id, username: users.username, avatar: users.avatar })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return u || null;
  }

  /**
   * 1. CREATE ROOM
   * Creates a new Watch Party room in a single atomic database transaction.
   */
  public async createRoom(hostUserId: number, input: CreateRoomInput): Promise<WatchPartyRoom> {
    if (!hostUserId || isNaN(hostUserId)) {
      throw new Error('Некорректный идентификатор создателя комнаты');
    }

    const title = (input.title || '').trim();
    if (!title) {
      throw new Error('Название комнаты обязательно');
    }

    const privacy: WatchPartyPrivacy = input.privacy === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
    let passcodeHash: string | null = null;

    if (privacy === 'PRIVATE') {
      const passcode = (input.passcode || '').trim();
      if (!passcode || passcode.length < 3) {
        throw new Error('Для приватной комнаты требуется пароль (минимум 3 символа)');
      }
      passcodeHash = await bcrypt.hash(passcode, 10);
    }

    // Verify mediaId if provided
    let mediaType = (input.mediaType || 'MOVIE').toUpperCase();
    if (input.mediaId) {
      const [mediaRecord] = await db
        .select({ id: media.id, type: media.type })
        .from(media)
        .where(eq(media.id, input.mediaId))
        .limit(1);

      if (mediaRecord) {
        mediaType = mediaRecord.type;
      }
    }

    const code = await this.generateUniqueRoomCode();
    const rawConfig = input.sourceConfig || (input as any).source;
    const rawType = input.sourceType || (input as any).source?.type || rawConfig?.type || 'DIRECT';
    const rawUrl = input.sourceUrl || (input as any).source?.url || rawConfig?.url;

    const { sanitizedType, sanitizedUrl, sanitizedConfig } = sanitizeSourceConfig(
      rawType,
      rawUrl,
      rawConfig
    );
    const sourceConfigStr = sanitizedConfig ? JSON.stringify(sanitizedConfig) : null;
    const mediaMetadataStr = input.mediaMetadata ? JSON.stringify(input.mediaMetadata) : null;

    // Atomic DB Transaction: create room + host membership
    const result = await db.transaction(async (tx) => {
      const [createdRoom] = await tx
        .insert(watchPartyRooms)
        .values({
          code,
          title,
          mediaId: input.mediaId || null,
          mediaType,
          seasonNumber: input.seasonNumber ?? null,
          episodeNumber: input.episodeNumber ?? null,
          hostUserId,
          sourceType: sanitizedType,
          sourceUrl: sanitizedUrl,
          sourceConfig: sourceConfigStr,
          mediaMetadata: mediaMetadataStr,
          status: 'ACTIVE',
          privacy,
          passcodeHash,
          playbackState: 'PAUSED',
          lastCurrentTime: 0,
          lastDuration: input.initialDuration || 0,
        })
        .returning();

      await tx.insert(watchPartyMembers).values({
        roomId: createdRoom.id,
        userId: hostUserId,
        role: 'HOST',
        isBanned: false,
      });

      return createdRoom;
    });

    const hostUser = await this.getHostUser(hostUserId);
    const formattedDto = this.formatRoomDto(result, hostUser, 1);

    // Register active room in memory
    roomManager.registerActiveRoom(formattedDto);
    if (hostUser) {
      roomManager.upsertMemberLiveState(code, {
        userId: hostUser.id,
        username: hostUser.username,
        avatar: hostUser.avatar,
        role: 'HOST',
      });
    }

    // If the room is created with TORRENT source and has media but no magnetUri/url, trigger auto-torrent discovery!
    if (sanitizedType === 'TORRENT' && !sanitizedUrl && (!sanitizedConfig || !sanitizedConfig.magnetUri)) {
      if (input.mediaId) {
        try {
          const { torrentSessionManager } = await import('../torrentSearch/torrentSessionManager.ts');
          torrentSessionManager.triggerAutoTorrent(
            code,
            hostUserId,
            input.mediaId,
            input.seasonNumber ?? null,
            input.episodeNumber ?? null
          ).catch((err) => {
            console.error('[TORRENT-AUTO] Automatic trigger on room creation failed:', err);
          });
        } catch (_err) {
          console.error('[TORRENT-AUTO] Failed to import torrentSessionManager for automatic room creation:', _err);
        }
      }
    }

    return formattedDto;
  }

  /**
   * 2. GET ROOM
   * Fetches room by code or id. Lazy loads in-memory active state if needed.
   */
  public async getRoom(codeOrId: string | number, requestingUserId?: number): Promise<WatchPartyRoom> {
    const isNumeric = typeof codeOrId === 'number' || (!isNaN(Number(codeOrId)) && !String(codeOrId).startsWith('wtch-'));
    const filter = isNumeric ? eq(watchPartyRooms.id, Number(codeOrId)) : eq(watchPartyRooms.code, String(codeOrId).trim());

    const [roomRecord] = await db
      .select()
      .from(watchPartyRooms)
      .where(filter)
      .limit(1);

    if (!roomRecord) {
      throw new Error('Комната просмотра не найдена');
    }

    const hostUser = await this.getHostUser(roomRecord.hostUserId);

    // Count current active members
    const [memberCountRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(watchPartyMembers)
      .where(and(eq(watchPartyMembers.roomId, roomRecord.id), isNull(watchPartyMembers.leftAt)));

    const memberCount = memberCountRes?.count || 1;

    // If ACTIVE and not in memory, lazy-load it
    if (roomRecord.status === 'ACTIVE' && !roomManager.isRoomActive(roomRecord.code)) {
      const formatted = this.formatRoomDto(roomRecord, hostUser, memberCount);
      roomManager.registerActiveRoom(formatted);
    }

    return this.formatRoomDto(roomRecord, hostUser, memberCount);
  }

  /**
   * 3. JOIN ROOM
   * Validates access, handles password checking, and idempotently registers membership.
   */
  public async joinRoom(
    codeOrId: string | number,
    userId: number,
    passcode?: string
  ): Promise<{ room: WatchPartyRoom; member: WatchPartyMember }> {
    if (!userId || isNaN(userId)) {
      throw new Error('Требуется авторизация для входа в комнату');
    }

    const roomDto = await this.getRoom(codeOrId, userId);

    if (roomDto.status === 'CLOSED') {
      throw new Error('Комната просмотра закрыта');
    }

    // Check if user is banned or already exists in room
    const [existingMember] = await db
      .select()
      .from(watchPartyMembers)
      .where(and(eq(watchPartyMembers.roomId, roomDto.id), eq(watchPartyMembers.userId, userId)))
      .limit(1);

    if (existingMember?.isBanned) {
      throw new Error('Вы были заблокированы в этой комнате');
    }

    // Check passcode if PRIVATE and user is not already an established member
    if (roomDto.privacy === 'PRIVATE' && !existingMember) {
      const [rawRoom] = await db
        .select({ passcodeHash: watchPartyRooms.passcodeHash })
        .from(watchPartyRooms)
        .where(eq(watchPartyRooms.id, roomDto.id))
        .limit(1);

      if (rawRoom?.passcodeHash) {
        if (!passcode) {
          throw new Error('Для входа в приватную комнату требуется пароль');
        }
        const isMatch = await bcrypt.compare(passcode, rawRoom.passcodeHash);
        if (!isMatch) {
          throw new Error('Неверный пароль комнаты');
        }
      }
    }

    const now = new Date();
    let memberRecord: typeof watchPartyMembers.$inferSelect;

    if (existingMember) {
      // Re-activate membership
      const [updated] = await db
        .update(watchPartyMembers)
        .set({
          leftAt: null,
          lastSeenAt: now,
        })
        .where(eq(watchPartyMembers.id, existingMember.id))
        .returning();
      memberRecord = updated;
    } else {
      // Create new member record
      const role: WatchPartyRole = roomDto.hostUserId === userId ? 'HOST' : 'MEMBER';
      const [created] = await db
        .insert(watchPartyMembers)
        .values({
          roomId: roomDto.id,
          userId,
          role,
          isBanned: false,
          joinedAt: now,
          lastSeenAt: now,
        })
        .returning();
      memberRecord = created;
    }

    // Register live presence in RoomManager
    const [userRecord] = await db
      .select({ id: users.id, username: users.username, avatar: users.avatar })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRecord) {
      roomManager.upsertMemberLiveState(roomDto.code, {
        userId: userRecord.id,
        username: userRecord.username,
        avatar: userRecord.avatar,
        role: (memberRecord.role as WatchPartyRole) || 'MEMBER',
      });
    }

    const memberDto: WatchPartyMember = {
      id: memberRecord.id,
      roomId: memberRecord.roomId,
      userId: memberRecord.userId,
      user: userRecord ? { id: userRecord.id, username: userRecord.username, avatar: userRecord.avatar } : undefined,
      role: (memberRecord.role as WatchPartyRole) || 'MEMBER',
      isBanned: memberRecord.isBanned,
      joinedAt: memberRecord.joinedAt ? new Date(memberRecord.joinedAt).toISOString() : new Date().toISOString(),
      lastSeenAt: memberRecord.lastSeenAt ? new Date(memberRecord.lastSeenAt).toISOString() : new Date().toISOString(),
      leftAt: memberRecord.leftAt ? new Date(memberRecord.leftAt).toISOString() : null,
    };

    return {
      room: await this.getRoom(roomDto.code, userId),
      member: memberDto,
    };
  }

  /**
   * 4. LEAVE ROOM
   * Updates membership and handles deterministic HOST succession if host leaves.
   */
  public async leaveRoom(codeOrId: string | number, userId: number): Promise<{ success: boolean; roomClosed?: boolean; newHostUserId?: number }> {
    const roomDto = await this.getRoom(codeOrId, userId);
    const now = new Date();

    // Mark member left
    await db
      .update(watchPartyMembers)
      .set({
        leftAt: now,
        lastSeenAt: now,
      })
      .where(and(eq(watchPartyMembers.roomId, roomDto.id), eq(watchPartyMembers.userId, userId)));

    roomManager.removeMember(roomDto.code, userId);

    // If leaving user was HOST:
    if (roomDto.hostUserId === userId && roomDto.status === 'ACTIVE') {
      // Deterministic Succession: Find oldest joined active non-banned member
      const remainingActiveMembers = await db
        .select()
        .from(watchPartyMembers)
        .where(
          and(
            eq(watchPartyMembers.roomId, roomDto.id),
            isNull(watchPartyMembers.leftAt),
            eq(watchPartyMembers.isBanned, false)
          )
        )
        .orderBy(asc(watchPartyMembers.joinedAt));

      if (remainingActiveMembers.length > 0) {
        // Transfer to oldest active member
        const successor = remainingActiveMembers[0];
        await this.transferHost(roomDto.code, userId, successor.userId, true);
        return { success: true, newHostUserId: successor.userId };
      } else {
        // No remaining active members -> automatically close room
        await this.closeRoom(roomDto.code, userId, true);
        return { success: true, roomClosed: true };
      }
    }

    return { success: true };
  }

  /**
   * 5. TRANSFER HOST
   * Atomically transfers HOST privileges to another active member.
   */
  public async transferHost(
    codeOrId: string | number,
    currentHostUserId: number,
    targetUserId: number,
    isSystemSuccession: boolean = false
  ): Promise<WatchPartyRoom> {
    const roomDto = await this.getRoom(codeOrId, currentHostUserId);

    if (!isSystemSuccession && roomDto.hostUserId !== currentHostUserId) {
      throw new Error('Только текущий HOST может передать права управления комнатой');
    }

    if (roomDto.status === 'CLOSED') {
      throw new Error('Нельзя передать права: комната закрыта');
    }

    if (currentHostUserId === targetUserId) {
      throw new Error('Пользователь уже является HOST комнаты');
    }

    // Verify target user is in room and not banned
    const [targetMember] = await db
      .select()
      .from(watchPartyMembers)
      .where(and(eq(watchPartyMembers.roomId, roomDto.id), eq(watchPartyMembers.userId, targetUserId)))
      .limit(1);

    if (!targetMember || targetMember.isBanned) {
      throw new Error('Участник не найден или заблокирован в этой комнате');
    }

    const now = new Date();

    // Atomic DB update
    await db.transaction(async (tx) => {
      // Demote previous host
      await tx
        .update(watchPartyMembers)
        .set({ role: 'MEMBER', lastSeenAt: now })
        .where(and(eq(watchPartyMembers.roomId, roomDto.id), eq(watchPartyMembers.userId, currentHostUserId)));

      // Promote target member
      await tx
        .update(watchPartyMembers)
        .set({ role: 'HOST', leftAt: null, lastSeenAt: now })
        .where(and(eq(watchPartyMembers.roomId, roomDto.id), eq(watchPartyMembers.userId, targetUserId)));

      // Update room host pointer
      await tx
        .update(watchPartyRooms)
        .set({ hostUserId: targetUserId, updatedAt: now })
        .where(eq(watchPartyRooms.id, roomDto.id));
    });

    // Update RoomManager
    roomManager.setHost(roomDto.code, targetUserId);

    return this.getRoom(roomDto.code, targetUserId);
  }

  /**
   * 6. KICK MEMBER
   * Removes member from room and optionally bans them.
   */
  public async kickMember(
    codeOrId: string | number,
    hostUserId: number,
    targetUserId: number,
    ban: boolean = false
  ): Promise<boolean> {
    const roomDto = await this.getRoom(codeOrId, hostUserId);

    if (roomDto.hostUserId !== hostUserId) {
      throw new Error('Только HOST комнаты может исключать участников');
    }

    if (roomDto.status === 'CLOSED') {
      throw new Error('Нельзя исключать участников: комната закрыта');
    }

    if (hostUserId === targetUserId) {
      throw new Error('HOST не может исключить самого себя');
    }

    const now = new Date();

    const [updated] = await db
      .update(watchPartyMembers)
      .set({
        leftAt: now,
        isBanned: ban,
        lastSeenAt: now,
      })
      .where(and(eq(watchPartyMembers.roomId, roomDto.id), eq(watchPartyMembers.userId, targetUserId)))
      .returning();

    if (!updated) {
      throw new Error('Участник не найден в этой комнате');
    }

    roomManager.removeMember(roomDto.code, targetUserId);

    return true;
  }

  /**
   * 7. CLOSE ROOM
   * Closes active room, persists last playback snapshot, and purges from in-memory manager.
   */
  public async closeRoom(
    codeOrId: string | number,
    hostUserId: number,
    isSystemClosing: boolean = false
  ): Promise<WatchPartyRoom> {
    const roomDto = await this.getRoom(codeOrId, hostUserId);

    if (!isSystemClosing && roomDto.hostUserId !== hostUserId) {
      throw new Error('Только HOST комнаты может закрыть её');
    }

    const authoritativeSnapshot = roomManager.getAuthoritativePlayback(roomDto.code);
    const lastPosition = authoritativeSnapshot?.position ?? roomDto.lastCurrentTime ?? 0;
    const now = new Date();

    const [closedRecord] = await db
      .update(watchPartyRooms)
      .set({
        status: 'CLOSED',
        playbackState: 'PAUSED',
        lastCurrentTime: lastPosition,
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(watchPartyRooms.id, roomDto.id))
      .returning();

    // Clean up Torrent session and release any active references
    try {
      const { torrentSessionManager } = await import('../torrentSearch/torrentSessionManager.ts');
      await torrentSessionManager.cancelSession(roomDto.code);
    } catch (_err) {}

    roomManager.unregisterRoom(roomDto.code);

    const hostUser = await this.getHostUser(closedRecord.hostUserId);
    return this.formatRoomDto(closedRecord, hostUser, 0);
  }

  /**
   * 8. GET MEMBERS
   * Returns list of room members with DB persistence + live online stats.
   */
  public async getMembers(codeOrId: string | number, requestingUserId?: number): Promise<WatchPartyMember[]> {
    const roomDto = await this.getRoom(codeOrId, requestingUserId);

    const rows = await db
      .select({
        id: watchPartyMembers.id,
        roomId: watchPartyMembers.roomId,
        userId: watchPartyMembers.userId,
        role: watchPartyMembers.role,
        isBanned: watchPartyMembers.isBanned,
        joinedAt: watchPartyMembers.joinedAt,
        lastSeenAt: watchPartyMembers.lastSeenAt,
        leftAt: watchPartyMembers.leftAt,
        username: users.username,
        avatar: users.avatar,
      })
      .from(watchPartyMembers)
      .innerJoin(users, eq(watchPartyMembers.userId, users.id))
      .where(eq(watchPartyMembers.roomId, roomDto.id))
      .orderBy(asc(watchPartyMembers.joinedAt));

    return rows.map((r) => ({
      id: r.id,
      roomId: r.roomId,
      userId: r.userId,
      user: {
        id: r.userId,
        username: r.username,
        avatar: r.avatar,
      },
      role: (r.role as WatchPartyRole) || 'MEMBER',
      isBanned: r.isBanned,
      joinedAt: r.joinedAt ? new Date(r.joinedAt).toISOString() : new Date().toISOString(),
      lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : new Date().toISOString(),
      leftAt: r.leftAt ? new Date(r.leftAt).toISOString() : null,
    }));
  }

  /**
   * 9. GET ROOM MESSAGES
   * Returns paginated room chat history.
   */
  public async getRoomMessages(
    codeOrId: string | number,
    requestingUserId: number,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ messages: WatchPartyMessage[]; total: number }> {
    const roomDto = await this.getRoom(codeOrId, requestingUserId);

    const limit = Math.min(100, Math.max(1, options.limit || 50));
    const offset = Math.max(0, options.offset || 0);

    const [totalCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(watchPartyMessages)
      .where(eq(watchPartyMessages.roomId, roomDto.id));

    const rows = await db
      .select({
        id: watchPartyMessages.id,
        roomId: watchPartyMessages.roomId,
        userId: watchPartyMessages.userId,
        type: watchPartyMessages.type,
        content: watchPartyMessages.content,
        playbackTimestamp: watchPartyMessages.playbackTimestamp,
        metadata: watchPartyMessages.metadata,
        createdAt: watchPartyMessages.createdAt,
        username: users.username,
        avatar: users.avatar,
      })
      .from(watchPartyMessages)
      .innerJoin(users, eq(watchPartyMessages.userId, users.id))
      .where(eq(watchPartyMessages.roomId, roomDto.id))
      .orderBy(asc(watchPartyMessages.createdAt))
      .limit(limit)
      .offset(offset);

    const messages: WatchPartyMessage[] = rows.map((r) => {
      let meta: Record<string, any> | null = null;
      if (r.metadata) {
        try {
          meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
        } catch (_e) {
          meta = null;
        }
      }
      return {
        id: r.id,
        roomId: r.roomId,
        userId: r.userId,
        user: {
          id: r.userId,
          username: r.username,
          avatar: r.avatar,
        },
        type: r.type as any,
        content: r.content,
        playbackTimestamp: r.playbackTimestamp,
        metadata: meta,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      };
    });

    return {
      messages,
      total: totalCount?.count || 0,
    };
  }

  /**
   * 10. CREATE MESSAGE
   * Persists a room chat message and returns formatted payload for broadcast.
   */
  public async createMessage(
    codeOrId: string | number,
    userId: number,
    content: string,
    playbackTimestamp?: number,
    type: 'TEXT' | 'SYSTEM' | 'ACTION' = 'TEXT',
    metadata?: Record<string, any>
  ): Promise<WatchPartyMessage> {
    const roomDto = await this.getRoom(codeOrId, userId);

    if (roomDto.status === 'CLOSED') {
      throw new Error('Нельзя отправлять сообщения в закрытую комнату');
    }

    // Verify member is in room and not banned
    const [member] = await db
      .select()
      .from(watchPartyMembers)
      .where(and(eq(watchPartyMembers.roomId, roomDto.id), eq(watchPartyMembers.userId, userId)))
      .limit(1);

    if (!member || member.isBanned) {
      throw new Error('Вы не являетесь участником этой комнаты');
    }

    const trimmed = (content || '').trim();
    if (!trimmed) {
      throw new Error('Текст сообщения не может быть пустым');
    }

    if (trimmed.length > 2000) {
      throw new Error('Сообщение слишком длинное (максимум 2000 символов)');
    }

    const [sender] = await db
      .select({ id: users.id, username: users.username, avatar: users.avatar })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const [created] = await db
      .insert(watchPartyMessages)
      .values({
        roomId: roomDto.id,
        userId,
        type,
        content: trimmed,
        playbackTimestamp:
          playbackTimestamp !== undefined && !isNaN(playbackTimestamp)
            ? Number(playbackTimestamp.toFixed(2))
            : null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        createdAt: new Date(),
      })
      .returning();

    return {
      id: created.id,
      roomId: created.roomId,
      userId: created.userId,
      user: sender ? { id: sender.id, username: sender.username, avatar: sender.avatar } : undefined,
      type: created.type as any,
      content: created.content,
      playbackTimestamp: created.playbackTimestamp,
      metadata: metadata || null,
      createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * 11. CHANGE MEDIA SOURCE
   * Updates source configuration and resets playback (HOST only).
   */
  public async changeSource(
    codeOrId: string | number,
    hostUserId: number,
    source: MediaSourceConfig,
    mediaId?: number | null,
    seasonNumber?: number | null,
    episodeNumber?: number | null
  ): Promise<WatchPartyRoom> {
    const roomDto = await this.getRoom(codeOrId, hostUserId);

    if (roomDto.hostUserId !== hostUserId) {
      throw new Error('Только HOST комнаты может изменять источник медиа');
    }

    if (roomDto.status === 'CLOSED') {
      throw new Error('Нельзя изменять источник: комната закрыта');
    }

    const { sanitizedType, sanitizedUrl, sanitizedConfig } = sanitizeSourceConfig(
      source.type || 'DIRECT',
      source.url,
      source
    );
    const sourceConfigStr = sanitizedConfig ? JSON.stringify(sanitizedConfig) : null;
    const now = new Date();

    const [updated] = await db
      .update(watchPartyRooms)
      .set({
        sourceType: sanitizedType,
        sourceUrl: sanitizedUrl,
        sourceConfig: sourceConfigStr,
        mediaId: mediaId !== undefined ? mediaId : roomDto.mediaId,
        seasonNumber: seasonNumber !== undefined ? seasonNumber : roomDto.seasonNumber,
        episodeNumber: episodeNumber !== undefined ? episodeNumber : roomDto.episodeNumber,
        playbackState: 'PAUSED',
        lastCurrentTime: 0,
        updatedAt: now,
      })
      .where(eq(watchPartyRooms.id, roomDto.id))
      .returning();

    // Clean up previous Torrent session and release any references
    try {
      const { torrentSessionManager } = await import('../torrentSearch/torrentSessionManager.ts');
      await torrentSessionManager.cancelSession(roomDto.code);

      // If the new source is TORRENT and either it has no magnet/url, or the episode/media changed:
      if (sanitizedType === 'TORRENT' && (
        !source.magnetUri || 
        (mediaId !== undefined && mediaId !== roomDto.mediaId) || 
        (seasonNumber !== undefined && seasonNumber !== roomDto.seasonNumber) || 
        (episodeNumber !== undefined && episodeNumber !== roomDto.episodeNumber)
      )) {
        const finalMediaId = mediaId !== undefined && mediaId !== null ? mediaId : roomDto.mediaId;
        if (finalMediaId) {
          torrentSessionManager.triggerAutoTorrent(
            roomDto.code,
            hostUserId,
            finalMediaId,
            seasonNumber !== undefined ? seasonNumber : roomDto.seasonNumber,
            episodeNumber !== undefined ? episodeNumber : roomDto.episodeNumber
          ).catch((err) => {
            console.error('[TORRENT-AUTO] Automatic episode transition trigger failed:', err);
          });
        }
      }
    } catch (_err) {}

    roomManager.setSource(roomDto.code, sanitizedConfig || source, mediaId, seasonNumber, episodeNumber);

    const hostUser = await this.getHostUser(updated.hostUserId);
    return this.formatRoomDto(updated, hostUser);
  }

  /**
   * 12. AUTHORITATIVE PLAYBACK CONTROL (Service methods)
   */
  public async setPlaybackState(
    codeOrId: string | number,
    hostUserId: number,
    newState: WatchPartyPlaybackState,
    position?: number,
    duration?: number
  ): Promise<AuthoritativePlaybackSnapshot> {
    const roomDto = await this.getRoom(codeOrId, hostUserId);

    if (roomDto.status === 'CLOSED') {
      throw new Error('Нельзя изменять воспроизведение: комната закрыта');
    }

    if (roomDto.hostUserId !== hostUserId) {
      throw new Error('Только HOST комнаты может изменять состояние воспроизведения');
    }

    const snapshot = roomManager.updatePlaybackState(roomDto.code, newState, position, duration);
    if (!snapshot) {
      throw new Error('Ошибка обновления состояния воспроизведения в памяти');
    }

    // Persist snapshot to DB periodically or on state transitions
    await db
      .update(watchPartyRooms)
      .set({
        playbackState: newState,
        lastCurrentTime: snapshot.position,
        lastDuration: snapshot.duration,
        updatedAt: new Date(),
      })
      .where(eq(watchPartyRooms.id, roomDto.id));

    return snapshot;
  }
}

export const watchPartyService = new WatchPartyService();
