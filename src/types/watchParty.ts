/**
 * Types & contracts for the Dodik Tracker Watch Party system (Stage 1).
 * Defines database models, member states, source abstraction, and WebSocket event protocols.
 */

// 1. Core Enumerations & Constants
export type WatchPartyRole = 'HOST' | 'MEMBER';

export type WatchPartyRoomStatus = 'ACTIVE' | 'CLOSED';

export type WatchPartyPrivacy = 'PUBLIC' | 'PRIVATE';

export type WatchPartyPlaybackState = 'PLAYING' | 'PAUSED';

export type WatchPartySourceType = 'DIRECT' | 'HLS' | 'YOUTUBE' | 'TORRENT';

export type WatchPartyMessageType = 'TEXT' | 'SYSTEM' | 'ACTION';

export type WatchPartySyncStatus =
  | 'SYNCED'          // Within tolerance (|drift| <= 1.5s)
  | 'SLIGHT_LAG'      // Small lag (-4.0s <= drift < -1.5s) -> smoothly accelerate via playbackRate
  | 'SEVERE_LAG'      // Severe lag (drift < -4.0s) -> perform controlled seek
  | 'AHEAD'           // Ahead of host (drift > +1.5s) -> slow down via playbackRate
  | 'BUFFERING'       // Actively buffering video stream
  | 'PAUSED'          // Member or host is paused
  | 'DISCONNECTED';   // Connection lost or tab backgrounded

// 2. Media Source Abstraction
export interface MediaSubtitleTrack {
  id?: string;
  label: string;
  src: string;
  lang: string;
  isDefault?: boolean;
}

export interface MediaAudioTrack {
  id?: string;
  label: string;
  src?: string;
  lang?: string;
  isDefault?: boolean;
}

export interface MediaSourceConfig {
  type: WatchPartySourceType;
  url?: string;
  title?: string;
  posterUrl?: string;
  headers?: Record<string, string>;
  // Torrent/P2P parameters
  magnetUri?: string;
  fileName?: string;
  infoHash?: string;
  trackers?: string[];
  torrentMagnetOrUrl?: string;
  torrentFileIndex?: number;
  downloadUrl?: string;
  subtitles?: MediaSubtitleTrack[];
  audioTracks?: MediaAudioTrack[];
  metadata?: Record<string, any>;
}

// 2.1 Torrent Engine States & File Models
export type TorrentLoadingState =
  | 'IDLE'
  | 'PARSING'
  | 'FETCHING_METADATA'
  | 'CONNECTING_PEERS'
  | 'BUFFERING'
  | 'READY'
  | 'PLAYING'
  | 'PAUSED'
  | 'SEEKING'
  | 'ERROR'
  | 'DESTROYING';

export interface TorrentMediaFile {
  name: string;
  length: number;
  formattedSize: string;
  extension: string;
  mimeType?: string;
  isVideo: boolean;
  canPlay: boolean;
  index: number;
}

export interface TorrentPeerStats {
  numPeers: number;
  downloadSpeed: number; // bytes/sec
  uploadSpeed: number; // bytes/sec
  downloaded: number; // bytes
  total: number; // bytes
  progress: number; // 0..1 (fraction)
  ratio: number;
  timeRemaining?: number;
}

// 3. Database Entity Models
export interface WatchPartyRoom {
  id: number;
  code: string;
  title: string;
  mediaId: number | null;
  mediaType: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  hostUserId: number;
  hostUser?: {
    id: number;
    username: string;
    avatar: string | null;
  };
  sourceType: WatchPartySourceType;
  sourceUrl: string | null;
  sourceConfig: MediaSourceConfig | null;
  mediaMetadata: Record<string, any> | null;
  status: WatchPartyRoomStatus;
  privacy: WatchPartyPrivacy;
  hasPasscode: boolean; // Safe boolean flag for clients; passcodeHash is never sent over API
  playbackState: WatchPartyPlaybackState;
  lastCurrentTime: number;
  lastDuration: number;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface WatchPartyMember {
  id: number;
  roomId: number;
  userId: number;
  user?: {
    id: number;
    username: string;
    avatar: string | null;
  };
  role: WatchPartyRole;
  isBanned: boolean;
  joinedAt: string;
  lastSeenAt: string;
  leftAt: string | null;
}

export interface WatchPartyMessage {
  id: number;
  roomId: number;
  userId: number;
  user?: {
    id: number;
    username: string;
    avatar: string | null;
  };
  type: WatchPartyMessageType;
  content: string;
  playbackTimestamp: number | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

// 4. Live Ephemeral In-Memory State (Managed by RoomManager on Server)
export interface WatchPartyMemberLiveState {
  userId: number;
  username: string;
  avatar: string | null;
  role: WatchPartyRole;
  currentTime: number;
  duration: number;
  percentage: number;
  buffering: boolean;
  playbackState: WatchPartyPlaybackState;
  driftSeconds: number; // memberCurrentTime - authoritativeRoomTime
  syncStatus: WatchPartySyncStatus;
  isOnline: boolean;
  lastPingAt: number;
}

export interface AuthoritativePlaybackSnapshot {
  state: WatchPartyPlaybackState;
  position: number;
  duration: number;
  serverTimestamp: number; // Server-authoritative epoch timestamp in ms
}

// 5. WebSocket Event Contracts (Client -> Server)
export interface C2S_JoinRoomEvent {
  type: 'JOIN_ROOM';
  roomId: string; // code or id
  passcode?: string;
}

export interface C2S_LeaveRoomEvent {
  type: 'LEAVE_ROOM';
}

export interface C2S_HostPlayEvent {
  type: 'HOST_PLAY';
  position?: number;
}

export interface C2S_HostPauseEvent {
  type: 'HOST_PAUSE';
  position?: number;
}

export interface C2S_HostSeekEvent {
  type: 'HOST_SEEK';
  position: number;
}

export interface C2S_HostChangeSourceEvent {
  type: 'HOST_CHANGE_SOURCE';
  source: MediaSourceConfig;
  mediaId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface C2S_HostTransferEvent {
  type: 'HOST_TRANSFER';
  targetUserId: number;
}

export interface C2S_HostKickEvent {
  type: 'HOST_KICK';
  targetUserId: number;
  ban?: boolean;
}

export interface C2S_HostCloseRoomEvent {
  type: 'HOST_CLOSE_ROOM';
}

export interface C2S_MemberProgressEvent {
  type: 'MEMBER_PROGRESS';
  currentTime: number;
  duration: number;
  buffering: boolean;
  clientTimestamp: number;
}

export interface C2S_ChatMessageEvent {
  type: 'CHAT_MESSAGE';
  content: string;
  playbackTimestamp?: number;
}

export interface C2S_RequestSyncEvent {
  type: 'REQUEST_SYNC';
}

export type ClientToServerEvent =
  | C2S_JoinRoomEvent
  | C2S_LeaveRoomEvent
  | C2S_HostPlayEvent
  | C2S_HostPauseEvent
  | C2S_HostSeekEvent
  | C2S_HostChangeSourceEvent
  | C2S_HostTransferEvent
  | C2S_HostKickEvent
  | C2S_HostCloseRoomEvent
  | C2S_MemberProgressEvent
  | C2S_ChatMessageEvent
  | C2S_RequestSyncEvent;

// 6. WebSocket Event Contracts (Server -> Client)
export interface S2C_RoomStateEvent {
  type: 'ROOM_STATE';
  room: WatchPartyRoom;
  authoritativePlayback: AuthoritativePlaybackSnapshot;
  members: WatchPartyMemberLiveState[];
  serverTimestamp: number;
}

export interface S2C_PlaybackUpdateEvent {
  type: 'PLAYBACK_UPDATE';
  playbackState: WatchPartyPlaybackState;
  authoritativePosition: number;
  duration: number;
  serverTimestamp: number;
  triggeredByUserId: number;
}

export interface S2C_MemberJoinedEvent {
  type: 'MEMBER_JOINED';
  member: WatchPartyMemberLiveState;
}

export interface S2C_MemberLeftEvent {
  type: 'MEMBER_LEFT';
  userId: number;
  reason?: string;
}

export interface S2C_MembersStateUpdateEvent {
  type: 'MEMBERS_STATE_UPDATE';
  members: WatchPartyMemberLiveState[];
  authoritativePosition: number;
  serverTimestamp: number;
}

export interface S2C_HostChangedEvent {
  type: 'HOST_CHANGED';
  previousHostUserId: number;
  newHostUserId: number;
}

export interface S2C_SourceChangedEvent {
  type: 'SOURCE_CHANGED';
  source: MediaSourceConfig;
  mediaId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  updatedByUserId: number;
}

export interface S2C_ChatMessageEvent {
  type: 'CHAT_MESSAGE';
  message: WatchPartyMessage;
}

export interface S2C_KickedEvent {
  type: 'KICKED';
  reason: string;
  isBanned: boolean;
}

export interface S2C_RoomClosedEvent {
  type: 'ROOM_CLOSED';
  reason: string;
}

export interface S2C_ErrorEvent {
  type: 'ERROR';
  code: string;
  message: string;
}

export type TorrentSourceState =
  | 'DISCOVERING'
  | 'FOUND'
  | 'LOADING'
  | 'READY'
  | 'PLAYING'
  | 'BUFFERING'
  | 'FAILED'
  | 'STOPPING'
  | 'STOPPED';

export interface S2C_TorrentStateUpdateEvent {
  type: 'TORRENT_STATE_UPDATE';
  roomCode: string;
  state: TorrentSourceState;
  infoHash?: string;
  selectedFile?: { index: number; name: string; path: string; sizeBytes?: number };
  errorCode?: string;
  errorMessage?: string;
  fallbackCount?: number;
  retryCount?: number;
}

export interface S2C_TorrentSourceReadyEvent {
  type: 'TORRENT_SOURCE_READY';
  roomCode: string;
  sourceType: 'TORRENT';
  state: 'READY';
}

export type ServerToClientEvent =
  | S2C_RoomStateEvent
  | S2C_PlaybackUpdateEvent
  | S2C_MemberJoinedEvent
  | S2C_MemberLeftEvent
  | S2C_MembersStateUpdateEvent
  | S2C_HostChangedEvent
  | S2C_SourceChangedEvent
  | S2C_ChatMessageEvent
  | S2C_KickedEvent
  | S2C_RoomClosedEvent
  | S2C_ErrorEvent
  | S2C_TorrentStateUpdateEvent
  | S2C_TorrentSourceReadyEvent;

export interface TorrentQualityInfo {
  resolution: '2160p' | '1080p' | '720p' | '480p' | 'unknown';
  source?: string;
  codec?: string;
  audioCodec?: string;
  isHDR?: boolean;
  is10Bit?: boolean;
}

export interface TorrentCandidate {
  id: string;
  name: string;
  infoHash?: string;
  magnetUri?: string;
  sizeBytes?: number;
  formattedSize?: string;
  seeders: number;
  leechers: number;
  indexer?: string;
  publishDate?: string;
  category?: string;
  downloadUrl?: string;
  quality: TorrentQualityInfo;
  languages?: string[];
  score: number;
}

