import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';

export type PresenceStatus = 'online' | 'recently_online' | 'offline';

export interface UserPresenceInfo {
  userId: number;
  status: PresenceStatus;
  statusText: string;
  lastActiveAt: string | null;
  activeSessionsCount: number;
}

export const usePresence = (userIds: number[]) => {
  const [presenceMap, setPresenceMap] = useState<Record<number, UserPresenceInfo>>({});
  const { authFetch } = useAuth();

  useEffect(() => {
    if (userIds.length === 0) return;

    // Fetch initial presence statuses
    const fetchPresence = async () => {
      try {
        const query = userIds.join(',');
        const res = await authFetch(`/api/presence/status?userIds=${query}`);
        if (res.ok) {
          const data = await res.json();
          setPresenceMap(prev => ({ ...prev, ...data }));
        }
      } catch (err) {
        console.warn('Failed to fetch presence:', err);
      }
    };
    fetchPresence();
  }, [userIds.join(','), authFetch]);

  useEffect(() => {
    // Listen for real-time presence updates via SSE (dispatched from NotificationContext)
    const handlePresenceUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<UserPresenceInfo>;
      const presence = customEvent.detail;
      if (presence && presence.userId) {
        setPresenceMap(prev => {
          if (prev[presence.userId]?.status === presence.status && prev[presence.userId]?.lastActiveAt === presence.lastActiveAt) {
            return prev;
          }
          return {
            ...prev,
            [presence.userId]: presence
          };
        });
      }
    };

    window.addEventListener('presence_update', handlePresenceUpdate);
    return () => {
      window.removeEventListener('presence_update', handlePresenceUpdate);
    };
  }, []);

  return presenceMap;
};
