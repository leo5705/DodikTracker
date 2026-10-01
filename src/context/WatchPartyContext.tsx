/**
 * WatchPartyContext: Client state manager & WebSocket client for Watch Party sessions.
 * Manages socket lifecycle, reconnect with exponential backoff, authoritative playback,
 * live member telemetry, and real-time chat.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext.tsx';
import {
  WatchPartyRoom,
  WatchPartyMemberLiveState,
  WatchPartyMessage,
  WatchPartyPlaybackState,
  AuthoritativePlaybackSnapshot,
  MediaSourceConfig,
  ServerToClientEvent,
  ClientToServerEvent,
  TorrentSourceState,
} from '../types/watchParty.ts';

export type WatchPartyConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'JOINING'
  | 'CONNECTED_TO_ROOM'
  | 'RECONNECTING'
  | 'ERROR';

interface WatchPartyContextType {
  connectionState: WatchPartyConnectionState;
  room: WatchPartyRoom | null;
  members: WatchPartyMemberLiveState[];
  authoritativePlayback: AuthoritativePlaybackSnapshot;
  chatMessages: WatchPartyMessage[];
  isHost: boolean;
  currentMemberLiveState: WatchPartyMemberLiveState | undefined;
  error: string | null;
  reconnecting: boolean;
  kickedReason: string | null;
  roomClosedReason: string | null;
  syncNotification: string | null;
  // Torrent State
  torrentState: TorrentSourceState | null;
  torrentFile: { name: string; index: number; path: string; sizeBytes?: number } | null;
  torrentErrorCode: string | null;
  torrentErrorMessage: string | null;
  torrentFallbackCount: number;
  torrentRetryCount: number;
  // Actions
  connect: (roomCode: string, passcode?: string) => void;
  disconnect: () => void;
  hostPlay: (position?: number) => void;
  hostPause: (position?: number) => void;
  hostSeek: (position: number) => void;
  forceSyncAll: (position?: number, state?: WatchPartyPlaybackState) => void;
  hostChangeSource: (source: MediaSourceConfig, mediaId?: number, seasonNumber?: number, episodeNumber?: number) => void;
  hostTriggerAutoTorrent: () => Promise<void>;
  hostCancelAutoTorrent: () => Promise<void>;
  hostTransfer: (targetUserId: number) => void;
  hostKick: (targetUserId: number, ban?: boolean) => void;
  hostCloseRoom: () => void;
  sendProgress: (currentTime: number, duration: number, buffering: boolean) => void;
  requestSync: () => void;
  sendChatMessage: (content: string, playbackTimestamp?: number) => void;
  clearError: () => void;
  setSyncNotification: (msg: string | null) => void;
}

const WatchPartyContext = createContext<WatchPartyContextType | undefined>(undefined);

export const WatchPartyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { dbUser, token, authFetch } = useAuth();

  const [connectionState, setConnectionState] = useState<WatchPartyConnectionState>('DISCONNECTED');
  const [room, setRoom] = useState<WatchPartyRoom | null>(null);
  const [members, setMembers] = useState<WatchPartyMemberLiveState[]>([]);
  const [authoritativePlayback, setAuthoritativePlayback] = useState<AuthoritativePlaybackSnapshot>({
    state: 'PAUSED',
    position: 0,
    duration: 0,
    serverTimestamp: Date.now(),
  });
  const [chatMessages, setChatMessages] = useState<WatchPartyMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [kickedReason, setKickedReason] = useState<string | null>(null);
  const [roomClosedReason, setRoomClosedReason] = useState<string | null>(null);
  const [syncNotification, setSyncNotification] = useState<string | null>(null);

  // Torrent tracking states
  const [torrentState, setTorrentState] = useState<TorrentSourceState | null>(null);
  const [torrentFile, setTorrentFile] = useState<{ name: string; index: number; path: string; sizeBytes?: number } | null>(null);
  const [torrentErrorCode, setTorrentErrorCode] = useState<string | null>(null);
  const [torrentErrorMessage, setTorrentErrorMessage] = useState<string | null>(null);
  const [torrentFallbackCount, setTorrentFallbackCount] = useState<number>(0);
  const [torrentRetryCount, setTorrentRetryCount] = useState<number>(0);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isManuallyDisconnectedRef = useRef<boolean>(false);
  const lastProgressSentRef = useRef<number>(0);

  // Store room credentials for reconnect
  const activeRoomCodeRef = useRef<string | null>(null);
  const activePasscodeRef = useRef<string | undefined>(undefined);

  const isHost = Boolean(room && dbUser && room.hostUserId === dbUser.id);
  const currentMemberLiveState = members.find((m) => dbUser && m.userId === dbUser.id);

  // Safe send helper
  const sendWsEvent = useCallback((event: ClientToServerEvent) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(event));
    }
  }, []);

  // Fetch initial chat messages
  const loadChatHistory = useCallback(
    async (code: string) => {
      try {
        const res = await authFetch(`/api/watch-party/rooms/${encodeURIComponent(code)}/messages?limit=60`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            setChatMessages(data.messages);
          }
        }
      } catch (err) {
        console.warn('[WatchParty] Failed to load initial chat history:', err);
      }
    },
    [authFetch]
  );

  // Connect & handshake
  const connect = useCallback(
    (roomCode: string, passcode?: string) => {
      if (!roomCode) return;

      activeRoomCodeRef.current = roomCode.trim();
      activePasscodeRef.current = passcode;
      isManuallyDisconnectedRef.current = false;
      setError(null);
      setKickedReason(null);
      setRoomClosedReason(null);

      // Clean up previous socket if existing
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch (_e) {}
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      setConnectionState('CONNECTING');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const queryParams = new URLSearchParams();
      if (token) queryParams.set('token', token);

      const wsUrl = `${protocol}//${host}/ws/watch-party${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0;
          setConnectionState('JOINING');

          // Send JOIN_ROOM
          const joinEvent: ClientToServerEvent = {
            type: 'JOIN_ROOM',
            roomId: activeRoomCodeRef.current!,
            passcode: activePasscodeRef.current,
          };
          ws.send(JSON.stringify(joinEvent));
        };

        ws.onmessage = (event) => {
          try {
            const data: ServerToClientEvent = JSON.parse(event.data);

            switch (data.type) {
              case 'ROOM_STATE':
                setConnectionState('CONNECTED_TO_ROOM');
                setRoom(data.room);
                setAuthoritativePlayback(data.authoritativePlayback);
                setMembers(data.members || []);
                loadChatHistory(data.room.code);

                // Fetch initial torrent state if active
                authFetch(`/api/watch-party/rooms/${data.room.code}/torrent-state`)
                  .then((r) => r.json())
                  .then((tsRes) => {
                    if (tsRes.success && tsRes.session) {
                      setTorrentState(tsRes.session.state);
                      setTorrentFile(tsRes.session.selectedFile || null);
                      setTorrentErrorCode(tsRes.session.errorCode || null);
                      setTorrentErrorMessage(tsRes.session.errorMessage || null);
                    }
                  })
                  .catch(() => {});
                break;

              case 'PLAYBACK_UPDATE':
                setAuthoritativePlayback({
                  state: data.playbackState,
                  position: data.authoritativePosition,
                  duration: data.duration,
                  serverTimestamp: data.serverTimestamp,
                });
                break;

              case 'MEMBER_JOINED':
                setMembers((prev) => {
                  const existingIdx = prev.findIndex((m) => m.userId === data.member.userId);
                  if (existingIdx >= 0) {
                    const copy = [...prev];
                    copy[existingIdx] = data.member;
                    return copy;
                  }
                  return [...prev, data.member];
                });
                break;

              case 'MEMBER_LEFT':
                setMembers((prev) => prev.filter((m) => m.userId !== data.userId));
                break;

              case 'MEMBERS_STATE_UPDATE':
                setMembers(data.members || []);
                break;

              case 'HOST_CHANGED':
                setRoom((prev) => (prev ? { ...prev, hostUserId: data.newHostUserId } : null));
                setMembers((prev) =>
                  prev.map((m) => ({
                    ...m,
                    role: m.userId === data.newHostUserId ? 'HOST' : m.userId === data.previousHostUserId ? 'MEMBER' : m.role,
                  }))
                );
                break;

              case 'SOURCE_CHANGED':
                setRoom((prev) =>
                  prev
                    ? {
                        ...prev,
                        sourceType: data.source.type,
                        sourceUrl: data.source.url || null,
                        sourceConfig: data.source,
                        mediaId: data.mediaId ?? prev.mediaId,
                        seasonNumber: data.seasonNumber ?? prev.seasonNumber,
                        episodeNumber: data.episodeNumber ?? prev.episodeNumber,
                      }
                    : null
                );
                // Reset torrent state upon source change
                setTorrentState(null);
                setTorrentFile(null);
                setTorrentErrorCode(null);
                setTorrentErrorMessage(null);
                setTorrentFallbackCount(0);
                setTorrentRetryCount(0);
                break;

              case 'TORRENT_STATE_UPDATE' as any: {
                const update = data as any;
                setTorrentState(update.state);
                setTorrentFile(update.selectedFile || null);
                setTorrentErrorCode(update.errorCode || null);
                setTorrentErrorMessage(update.errorMessage || null);
                setTorrentFallbackCount(update.fallbackCount || 0);
                setTorrentRetryCount(update.retryCount || 0);
                break;
              }

              case 'TORRENT_SOURCE_READY' as any:
                setTorrentState('READY');
                setTorrentErrorCode(null);
                setTorrentErrorMessage(null);
                setTorrentFallbackCount(0);
                setTorrentRetryCount(0);
                break;

              case 'CHAT_MESSAGE':
                setChatMessages((prev) => {
                  // Prevent duplicate messages
                  if (prev.some((m) => m.id === data.message.id)) return prev;
                  return [...prev, data.message];
                });
                break;

              case 'KICKED':
                setKickedReason(data.reason || 'Вы были исключены из комнаты');
                setConnectionState('DISCONNECTED');
                isManuallyDisconnectedRef.current = true;
                if (socketRef.current) socketRef.current.close();
                break;

              case 'ROOM_CLOSED':
                setRoomClosedReason(data.reason || 'Комната была закрыта');
                setConnectionState('DISCONNECTED');
                isManuallyDisconnectedRef.current = true;
                if (socketRef.current) socketRef.current.close();
                break;

              case 'ERROR':
                setError(data.message || 'Ошибка комнаты');
                if (data.code === 'FORBIDDEN' || data.code === 'BANNED' || data.code === 'ROOM_NOT_FOUND') {
                  setConnectionState('ERROR');
                }
                break;
            }
          } catch (err) {
            console.warn('[WatchParty] Message parse error:', err);
          }
        };

        ws.onclose = (ev) => {
          socketRef.current = null;

          if (isManuallyDisconnectedRef.current || ev.code === 4401 || ev.code === 1000) {
            setConnectionState('DISCONNECTED');
            return;
          }

          // Trigger exponential backoff reconnect
          setConnectionState('RECONNECTING');
          const delay = Math.min(15000, 1000 * Math.pow(1.5, reconnectAttemptsRef.current));
          reconnectAttemptsRef.current += 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            if (activeRoomCodeRef.current && !isManuallyDisconnectedRef.current) {
              connect(activeRoomCodeRef.current, activePasscodeRef.current);
            }
          }, delay);
        };

        ws.onerror = () => {
          setConnectionState('ERROR');
        };
      } catch (err: any) {
        setError(err.message || 'Не удалось подключиться к серверу');
        setConnectionState('ERROR');
      }
    },
    [token, loadChatHistory]
  );

  const disconnect = useCallback(() => {
    isManuallyDisconnectedRef.current = true;
    activeRoomCodeRef.current = null;
    activePasscodeRef.current = undefined;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      try {
        socketRef.current.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
        socketRef.current.close(1000, 'User left');
      } catch (_e) {}
      socketRef.current = null;
    }

    setConnectionState('DISCONNECTED');
    setRoom(null);
    setMembers([]);
    setChatMessages([]);
    setKickedReason(null);
    setRoomClosedReason(null);
    setError(null);
    setTorrentState(null);
    setTorrentFile(null);
    setTorrentErrorCode(null);
    setTorrentErrorMessage(null);
    setTorrentFallbackCount(0);
    setTorrentRetryCount(0);
  }, []);

  // HOST Controls
  const hostPlay = useCallback(
    (position?: number) => {
      sendWsEvent({ type: 'HOST_PLAY', position });
    },
    [sendWsEvent]
  );

  const hostPause = useCallback(
    (position?: number) => {
      sendWsEvent({ type: 'HOST_PAUSE', position });
    },
    [sendWsEvent]
  );

  const hostSeek = useCallback(
    (position: number) => {
      sendWsEvent({ type: 'HOST_SEEK', position });
    },
    [sendWsEvent]
  );

  const forceSyncAll = useCallback(
    (position?: number, state?: WatchPartyPlaybackState) => {
      const pos = typeof position === 'number' && !isNaN(position) ? position : authoritativePlayback.position;
      const st = state || authoritativePlayback.state;
      sendWsEvent({ type: 'HOST_FORCE_SYNC', position: pos, playbackState: st });
    },
    [sendWsEvent, authoritativePlayback.position, authoritativePlayback.state]
  );

  const hostChangeSource = useCallback(
    (source: MediaSourceConfig, mediaId?: number, seasonNumber?: number, episodeNumber?: number) => {
      sendWsEvent({ type: 'HOST_CHANGE_SOURCE', source, mediaId, seasonNumber, episodeNumber });
    },
    [sendWsEvent]
  );

  const hostTriggerAutoTorrent = useCallback(async () => {
    if (!room) return;
    try {
      const res = await authFetch(`/api/watch-party/rooms/${room.code}/auto-torrent`, {
        method: 'POST',
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Ошибка автозапуска торрента');
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка поиска торрента');
    }
  }, [room, authFetch]);

  const hostCancelAutoTorrent = useCallback(async () => {
    if (!room) return;
    try {
      const res = await authFetch(`/api/watch-party/rooms/${room.code}/cancel-torrent`, {
        method: 'POST',
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Ошибка отмены сессии поиска');
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка остановки сессии');
    }
  }, [room, authFetch]);

  const hostTransfer = useCallback(
    (targetUserId: number) => {
      sendWsEvent({ type: 'HOST_TRANSFER', targetUserId });
    },
    [sendWsEvent]
  );

  const hostKick = useCallback(
    (targetUserId: number, ban?: boolean) => {
      sendWsEvent({ type: 'HOST_KICK', targetUserId, ban });
    },
    [sendWsEvent]
  );

  const hostCloseRoom = useCallback(() => {
    sendWsEvent({ type: 'HOST_CLOSE_ROOM' });
  }, [sendWsEvent]);

  // Client telemetry progress (Throttled to 350ms)
  const sendProgress = useCallback(
    (currentTime: number, duration: number, buffering: boolean) => {
      const now = Date.now();
      if (now - lastProgressSentRef.current < 350) return;
      lastProgressSentRef.current = now;

      sendWsEvent({
        type: 'MEMBER_PROGRESS',
        currentTime,
        duration,
        buffering,
        clientTimestamp: now,
      });
    },
    [sendWsEvent]
  );

  const requestSync = useCallback(() => {
    sendWsEvent({ type: 'REQUEST_SYNC' });
  }, [sendWsEvent]);

  const sendChatMessage = useCallback(
    (content: string, playbackTimestamp?: number) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      sendWsEvent({
        type: 'CHAT_MESSAGE',
        content: trimmed,
        playbackTimestamp,
      });
    },
    [sendWsEvent]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        try {
          socketRef.current.close(1000, 'Unmount');
        } catch (_e) {}
      }
    };
  }, []);

  return (
    <WatchPartyContext.Provider
      value={{
        connectionState,
        room,
        members,
        authoritativePlayback,
        chatMessages,
        isHost,
        currentMemberLiveState,
        error,
        reconnecting: connectionState === 'RECONNECTING',
        kickedReason,
        roomClosedReason,
        syncNotification,
        torrentState,
        torrentFile,
        torrentErrorCode,
        torrentErrorMessage,
        torrentFallbackCount,
        torrentRetryCount,
        connect,
        disconnect,
        hostPlay,
        hostPause,
        hostSeek,
        forceSyncAll,
        hostChangeSource,
        hostTriggerAutoTorrent,
        hostCancelAutoTorrent,
        hostTransfer,
        hostKick,
        hostCloseRoom,
        sendProgress,
        requestSync,
        sendChatMessage,
        clearError,
        setSyncNotification,
      }}
    >
      {children}
    </WatchPartyContext.Provider>
  );
};

export const useWatchParty = (): WatchPartyContextType => {
  const context = useContext(WatchPartyContext);
  if (!context) {
    throw new Error('useWatchParty must be used within a WatchPartyProvider');
  }
  return context;
};
