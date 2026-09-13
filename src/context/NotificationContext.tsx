import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext.tsx';
import { AppNotification } from '../types/notification.ts';
import { ActiveToast, NotificationToastContainer } from '../components/notifications/NotificationToast.tsx';
import { playNotificationSound } from '../lib/notificationSound.ts';

interface NotificationContextType {
  unreadCount: number;
  notifications: AppNotification[];
  loading: boolean;
  activeToasts: ActiveToast[];
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  fetchNotifications: (filter?: string) => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: number) => Promise<void>;
  clearReadNotifications: () => Promise<void>;
  dismissToast: (id: string) => void;
  triggerTestToast: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const NotificationProvider: React.FC<{
  children: React.ReactNode;
  onNavigate?: (path: string) => void;
}> = ({ children, onNavigate }) => {
  const { dbUser, authFetch } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeToasts, setActiveToasts] = useState<ActiveToast[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('dodik_notification_sound');
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const saveSoundPref = (enabled: boolean) => {
    setSoundEnabled(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dodik_notification_sound', String(enabled));
    }
  };

  const fetchUnreadCount = useCallback(async () => {
    if (!dbUser) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await authFetch('/api/notifications/unread-count');
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(Number(data.unreadCount || 0));
      }
    } catch {
      // Non-blocking
    }
  }, [dbUser, authFetch]);

  const fetchNotifications = useCallback(
    async (filter = 'all') => {
      if (!dbUser) return;
      setLoading(true);
      try {
        const res = await authFetch(`/api/notifications?filter=${encodeURIComponent(filter)}&limit=50`);
        if (res.ok) {
          const data = await res.json();
          let rawList: AppNotification[] = [];
          if (Array.isArray(data)) {
            rawList = data;
          } else if (data && Array.isArray(data.notifications)) {
            rawList = data.notifications;
            if (typeof data.unreadCount === 'number') {
              setUnreadCount(data.unreadCount);
            }
          }

          // Filter out missing IDs and deduplicate
          const seen = new Set<number>();
          const deduped: AppNotification[] = [];
          for (const item of rawList) {
            if (item && item.id !== undefined && item.id !== null) {
              const numId = Number(item.id);
              if (!seen.has(numId)) {
                seen.add(numId);
                deduped.push({ ...item, id: numId });
              }
            }
          }
          setNotifications(deduped);
        }
      } catch (err) {
        console.warn('Failed to load notifications:', err);
      } finally {
        setLoading(false);
      }
    },
    [dbUser, authFetch]
  );

  const dismissToast = useCallback((id: string) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (notif: AppNotification) => {
      const toastId = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      setActiveToasts((prev) => [
        {
          id: toastId,
          notification: notif,
          createdAt: Date.now(),
        },
        ...prev.slice(0, 4), // Cap at 5 simultaneous toasts
      ]);

      if (soundEnabled) {
        playNotificationSound(notif.type);
      }
    },
    [soundEnabled]
  );

  const markAsRead = useCallback(
    async (id: number) => {
      try {
        const res = await authFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
        if (res.ok) {
          const data = await res.json();
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
          );
          if (typeof data.unreadCount === 'number') {
            setUnreadCount(data.unreadCount);
          } else {
            setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        }
      } catch (err) {
        console.error('Error marking as read:', err);
      }
    },
    [authFetch]
  );

  const markAllAsRead = useCallback(async () => {
    try {
      const res = await authFetch('/api/notifications/read-all', { method: 'PUT' });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  }, [authFetch]);

  const deleteNotification = useCallback(
    async (id: number) => {
      try {
        const res = await authFetch(`/api/notifications/${id}`, { method: 'DELETE' });
        if (res.ok) {
          const data = await res.json();
          setNotifications((prev) => prev.filter((n) => n.id !== id));
          if (typeof data.unreadCount === 'number') {
            setUnreadCount(data.unreadCount);
          }
        }
      } catch (err) {
        console.error('Error deleting notification:', err);
      }
    },
    [authFetch]
  );

  const clearReadNotifications = useCallback(async () => {
    try {
      const res = await authFetch('/api/notifications/clear-read', { method: 'DELETE' });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => !n.isRead));
      }
    } catch (err) {
      console.error('Error clearing read notifications:', err);
    }
  }, [authFetch]);

  // Test toast helper
  const triggerTestToast = useCallback(() => {
    pushToast({
      id: Date.now(),
      userId: dbUser?.id || 0,
      type: 'ACHIEVEMENT_UNLOCKED',
      title: 'Первооткрыватель системы!',
      body: 'Тестовое push-уведомление успешно доставлено в режиме реального времени.',
      isRead: false,
      createdAt: new Date().toISOString(),
      link: '/achievements',
    });
  }, [dbUser, pushToast]);

  // Connect Real-Time SSE Stream
  useEffect(() => {
    if (!dbUser) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setUnreadCount(0);
      return;
    }

    let isSubscribed = true;
    let heartbeatInterval: number | null = null;

    const setupSSE = async () => {
      try {
        // Request dedicated short-lived token for EventSource
        const tokenRes = await authFetch('/api/notifications/stream-token');
        if (!tokenRes.ok || !isSubscribed) return;
        const { token } = await tokenRes.json();

        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        const sessionId = Math.random().toString(36).substring(2, 15);
        const streamUrl = `/api/notifications/stream?token=${encodeURIComponent(token)}&sessionId=${sessionId}`;
        const es = new EventSource(streamUrl, { withCredentials: true });
        eventSourceRef.current = es;

        if (heartbeatInterval) window.clearInterval(heartbeatInterval);
        heartbeatInterval = window.setInterval(() => {
          authFetch(`/api/presence/heartbeat?sessionId=${sessionId}`, { method: 'POST' }).catch(() => {});
        }, 15000);

        es.addEventListener('connected', () => {
          // Connection confirmed
        });

        es.addEventListener('presence', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            window.dispatchEvent(new CustomEvent('presence_update', { detail: data }));
          } catch {}
        });

        es.addEventListener('chat_message', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            window.dispatchEvent(new CustomEvent('chat_message', { detail: data }));
          } catch {}
        });

        es.addEventListener('unread_count', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (typeof data.unreadCount === 'number') {
              setUnreadCount(data.unreadCount);
            }
          } catch {}
        });

        es.addEventListener('notification', (e: MessageEvent) => {
          try {
            const raw = JSON.parse(e.data);
            const payload: AppNotification = raw?.notification ? raw.notification : raw;
            if (!payload || payload.id === undefined || payload.id === null) {
              console.warn('[SSE] Received notification without valid id:', raw);
              return;
            }

            const numericId = Number(payload.id);
            const normalizedPayload: AppNotification = { ...payload, id: numericId };

            // Prepend new notification to current list, removing duplicates
            setNotifications((prev) => [
              normalizedPayload,
              ...prev.filter((n) => Number(n.id) !== numericId),
            ]);

            if (typeof raw?.unreadCount === 'number') {
              setUnreadCount(raw.unreadCount);
            } else {
              setUnreadCount((prev) => prev + 1);
            }

            // Pop toast alert
            pushToast(normalizedPayload);
          } catch (err) {
            console.warn('[SSE] Failed to parse notification:', err);
          }
        });

        es.onerror = () => {
          es.close();
          eventSourceRef.current = null;
          // Reconnect after 6 seconds if still logged in
          if (isSubscribed) {
            reconnectTimeoutRef.current = setTimeout(setupSSE, 6000);
          }
        };
      } catch (err) {
        if (isSubscribed) {
          reconnectTimeoutRef.current = setTimeout(setupSSE, 10000);
        }
      }
    };

    fetchUnreadCount();
    setupSSE();

    return () => {
      isSubscribed = false;
      if (heartbeatInterval) window.clearInterval(heartbeatInterval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [dbUser?.id, fetchUnreadCount, pushToast, authFetch]);

  const handleToastAction = (notif: AppNotification) => {
    markAsRead(notif.id);
    if (notif.link && onNavigate) {
      onNavigate(notif.link);
    } else if (onNavigate) {
      onNavigate('/notifications');
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        notifications,
        loading,
        activeToasts,
        soundEnabled,
        setSoundEnabled: saveSoundPref,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearReadNotifications,
        dismissToast,
        triggerTestToast,
      }}
    >
      {children}
      <NotificationToastContainer
        toasts={activeToasts}
        onClose={dismissToast}
        onAction={handleToastAction}
      />
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
};
