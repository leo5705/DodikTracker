/**
 * RoomManager: In-memory live state orchestrator for active Watch Party sessions.
 * Provides server-authoritative playback calculation, drift detection, and live member tracking.
 */

import {
  WatchPartyPlaybackState,
  WatchPartyRoom,
  WatchPartyMemberLiveState,
  AuthoritativePlaybackSnapshot,
  MediaSourceConfig,
  WatchPartySyncStatus,
  WatchPartyRole,
} from '../../../types/watchParty.ts';

export interface ActiveRoomState {
  id: number;
  code: string;
  hostUserId: number;
  title: string;
  mediaId: number | null;
  mediaType: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  playbackState: WatchPartyPlaybackState;
  currentTime: number; // Base position at lastActionTimestamp (seconds)
  lastActionTimestamp: number; // Server epoch (ms)
  duration: number; // Total media duration (seconds)
  source: MediaSourceConfig;
  members: Map<number, WatchPartyMemberLiveState>; // userId -> Live State
  createdAt: number;
}

class RoomManager {
  // Key: room code -> ActiveRoomState
  private roomsByCode: Map<string, ActiveRoomState> = new Map();
  // Key: numeric room id -> room code
  private idToCodeMap: Map<number, string> = new Map();

  /**
   * Resolves room code from either code or numeric id.
   */
  private resolveCode(codeOrId: string | number): string | undefined {
    if (typeof codeOrId === 'number' || !isNaN(Number(codeOrId))) {
      const numId = Number(codeOrId);
      if (this.idToCodeMap.has(numId)) {
        return this.idToCodeMap.get(numId);
      }
    }
    const code = String(codeOrId).trim();
    return this.roomsByCode.has(code) ? code : undefined;
  }

  /**
   * Retrieves the active in-memory room state.
   */
  public getActiveRoom(codeOrId: string | number): ActiveRoomState | undefined {
    const code = this.resolveCode(codeOrId);
    if (!code) return undefined;
    return this.roomsByCode.get(code);
  }

  /**
   * Checks whether a room is currently active in memory.
   */
  public isRoomActive(codeOrId: string | number): boolean {
    return !!this.getActiveRoom(codeOrId);
  }

  /**
   * Registers or updates an active room in memory.
   */
  public registerActiveRoom(
    room: WatchPartyRoom,
    initialMembers?: WatchPartyMemberLiveState[]
  ): ActiveRoomState {
    const code = room.code;
    const now = Date.now();

    const membersMap = new Map<number, WatchPartyMemberLiveState>();
    if (initialMembers) {
      for (const m of initialMembers) {
        membersMap.set(m.userId, m);
      }
    }

    const state: ActiveRoomState = {
      id: room.id,
      code: room.code,
      hostUserId: room.hostUserId,
      title: room.title,
      mediaId: room.mediaId,
      mediaType: room.mediaType,
      seasonNumber: room.seasonNumber,
      episodeNumber: room.episodeNumber,
      playbackState: room.playbackState || 'PAUSED',
      currentTime: room.lastCurrentTime || 0,
      lastActionTimestamp: now,
      duration: room.lastDuration || 0,
      source: room.sourceConfig || {
        type: room.sourceType || 'DIRECT',
        url: room.sourceUrl || undefined,
      },
      members: membersMap,
      createdAt: now,
    };

    this.roomsByCode.set(code, state);
    this.idToCodeMap.set(room.id, code);

    return state;
  }

  /**
   * Removes a room from memory upon closing.
   */
  public unregisterRoom(codeOrId: string | number): void {
    const code = this.resolveCode(codeOrId);
    if (!code) return;
    const room = this.roomsByCode.get(code);
    if (room) {
      this.idToCodeMap.delete(room.id);
      this.roomsByCode.delete(code);
    }
  }

  /**
   * Computes the server-authoritative playback position in seconds.
   * If PLAYING: position = basePosition + (now - lastActionTimestamp) / 1000
   * If PAUSED: position = basePosition
   */
  public calculateAuthoritativePosition(room: ActiveRoomState, targetTimeMs: number = Date.now()): number {
    if (room.playbackState === 'PAUSED') {
      return room.currentTime;
    }

    const elapsedSeconds = Math.max(0, (targetTimeMs - room.lastActionTimestamp) / 1000);
    const calculated = room.currentTime + elapsedSeconds;

    if (room.duration > 0 && calculated >= room.duration) {
      return room.duration;
    }

    return Number(calculated.toFixed(2));
  }

  /**
   * Returns a snapshot of the authoritative playback status.
   */
  public getAuthoritativePlayback(codeOrId: string | number): AuthoritativePlaybackSnapshot | undefined {
    const room = this.getActiveRoom(codeOrId);
    if (!room) return undefined;

    const now = Date.now();
    const position = this.calculateAuthoritativePosition(room, now);

    return {
      state: room.playbackState,
      position,
      duration: room.duration,
      serverTimestamp: now,
    };
  }

  /**
   * Updates playback state (PLAY, PAUSE, SEEK) with server-authoritative timestamping.
   */
  public updatePlaybackState(
    codeOrId: string | number,
    newState: WatchPartyPlaybackState,
    newPosition?: number,
    newDuration?: number
  ): AuthoritativePlaybackSnapshot | undefined {
    const room = this.getActiveRoom(codeOrId);
    if (!room) return undefined;

    const now = Date.now();

    // If explicit valid position given, use it; otherwise compute current position
    const isValidPosition = newPosition !== undefined && typeof newPosition === 'number' && !isNaN(newPosition) && isFinite(newPosition);
    let finalPosition = isValidPosition ? Math.max(0, newPosition) : this.calculateAuthoritativePosition(room, now);
    if (room.duration > 0 && finalPosition > room.duration) {
      finalPosition = room.duration;
    }
    if (isNaN(finalPosition) || !isFinite(finalPosition) || finalPosition < 0) {
      finalPosition = 0;
    }

    room.playbackState = newState === 'PLAYING' ? 'PLAYING' : 'PAUSED';
    room.currentTime = Number(finalPosition.toFixed(2));
    room.lastActionTimestamp = now;

    if (newDuration !== undefined && typeof newDuration === 'number' && !isNaN(newDuration) && isFinite(newDuration) && newDuration > 0) {
      room.duration = newDuration;
    }

    return {
      state: room.playbackState,
      position: room.currentTime,
      duration: room.duration,
      serverTimestamp: now,
    };
  }

  /**
   * Updates source configuration and optionally related media IDs.
   */
  public setSource(
    codeOrId: string | number,
    source: MediaSourceConfig,
    mediaId?: number | null,
    seasonNumber?: number | null,
    episodeNumber?: number | null
  ): void {
    const room = this.getActiveRoom(codeOrId);
    if (!room) return;

    room.source = source;
    if (mediaId !== undefined) room.mediaId = mediaId;
    if (seasonNumber !== undefined) room.seasonNumber = seasonNumber;
    if (episodeNumber !== undefined) room.episodeNumber = episodeNumber;

    // Reset playback to 0 on source switch
    room.currentTime = 0;
    room.playbackState = 'PAUSED';
    room.lastActionTimestamp = Date.now();
  }

  /**
   * Transfers HOST in memory.
   */
  public setHost(codeOrId: string | number, newHostUserId: number): void {
    const room = this.getActiveRoom(codeOrId);
    if (!room) return;

    const oldHostId = room.hostUserId;
    room.hostUserId = newHostUserId;

    const oldHostMember = room.members.get(oldHostId);
    if (oldHostMember) oldHostMember.role = 'MEMBER';

    const newHostMember = room.members.get(newHostUserId);
    if (newHostMember) newHostMember.role = 'HOST';
  }

  /**
   * Gets a specific member live state.
   */
  public getMember(codeOrId: string | number, userId: number): WatchPartyMemberLiveState | undefined {
    const room = this.getActiveRoom(codeOrId);
    return room?.members.get(userId);
  }

  /**
   * Adds or updates a member's live in-memory presence.
   */
  public upsertMemberLiveState(
    codeOrId: string | number,
    member: {
      userId: number;
      username: string;
      avatar: string | null;
      role: WatchPartyRole;
    }
  ): WatchPartyMemberLiveState | undefined {
    const room = this.getActiveRoom(codeOrId);
    if (!room) return undefined;

    const existing = room.members.get(member.userId);
    const now = Date.now();

    const updated: WatchPartyMemberLiveState = {
      userId: member.userId,
      username: member.username,
      avatar: member.avatar,
      role: member.role,
      currentTime: existing?.currentTime ?? 0,
      duration: existing?.duration ?? room.duration,
      percentage: existing?.percentage ?? 0,
      buffering: existing?.buffering ?? false,
      playbackState: existing?.playbackState ?? room.playbackState,
      driftSeconds: existing?.driftSeconds ?? 0,
      syncStatus: existing?.syncStatus ?? 'SYNCED',
      isOnline: true,
      lastPingAt: now,
    };

    room.members.set(member.userId, updated);
    return updated;
  }

  /**
   * Updates an active member's playback progress and classifies drift status.
   */
  public updateMemberProgress(
    codeOrId: string | number,
    userId: number,
    progress: {
      currentTime: number;
      duration: number;
      buffering: boolean;
      clientTimestamp: number;
    }
  ): WatchPartyMemberLiveState | undefined {
    const room = this.getActiveRoom(codeOrId);
    if (!room) return undefined;

    const member = room.members.get(userId);
    if (!member) return undefined;

    const now = Date.now();
    const authoritativePos = this.calculateAuthoritativePosition(room, now);
    const drift = progress.currentTime - authoritativePos;

    let syncStatus: WatchPartySyncStatus = 'SYNCED';
    if (progress.buffering) {
      syncStatus = 'BUFFERING';
    } else if (room.playbackState === 'PAUSED') {
      syncStatus = 'PAUSED';
    } else if (Math.abs(drift) <= 1.5) {
      syncStatus = 'SYNCED';
    } else if (drift < -4.0) {
      syncStatus = 'SEVERE_LAG';
    } else if (drift < -1.5) {
      syncStatus = 'SLIGHT_LAG';
    } else {
      syncStatus = 'AHEAD';
    }

    const duration = progress.duration > 0 ? progress.duration : room.duration;
    const percentage = duration > 0 ? Math.min(100, Math.max(0, (progress.currentTime / duration) * 100)) : 0;

    member.currentTime = progress.currentTime;
    member.duration = duration;
    member.percentage = Number(percentage.toFixed(1));
    member.buffering = progress.buffering;
    member.playbackState = room.playbackState;
    member.driftSeconds = Number(drift.toFixed(2));
    member.syncStatus = syncStatus;
    member.isOnline = true;
    member.lastPingAt = now;

    return member;
  }

  /**
   * Removes member from in-memory tracking.
   */
  public removeMember(codeOrId: string | number, userId: number): void {
    const room = this.getActiveRoom(codeOrId);
    if (!room) return;
    room.members.delete(userId);
  }

  /**
   * Returns list of live active members in the room.
   */
  public listActiveMembers(codeOrId: string | number): WatchPartyMemberLiveState[] {
    const room = this.getActiveRoom(codeOrId);
    if (!room) return [];
    return Array.from(room.members.values());
  }

  /**
   * Returns total count of active in-memory rooms.
   */
  public getActiveRoomsCount(): number {
    return this.roomsByCode.size;
  }

  /**
   * Resets all in-memory rooms (useful for testing).
   */
  public clearAllRooms(): void {
    this.roomsByCode.clear();
    this.idToCodeMap.clear();
  }
}

export const roomManager = new RoomManager();
