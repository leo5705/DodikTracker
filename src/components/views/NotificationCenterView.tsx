import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  Loader2,
  Trash2,
  Info,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface NotificationCenterViewProps {
  onNavigate?: (path: string) => void;
}

export const NotificationCenterView: React.FC<NotificationCenterViewProps> = ({ onNavigate }) => {
  const { authFetch } = useAuth();
  const [notificationsList, setNotificationsList] = useState<any[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'SOCIAL' | 'RELEASE'>('ALL');

  const fetchNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const res = await authFetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotificationsList(data);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAllNotificationsRead = async () => {
    try {
      const res = await authFetch('/api/notifications/read-all', { method: 'PUT' });
      if (res.ok) {
        fetchNotifications();
      }
    } catch (err) {
      console.error('Error marking all as read', err);
    }
  };

  const handleDeleteNotification = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await authFetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotificationsList((prev) => prev.filter((n) => n.id !== id));
      }
    } catch (err) {
      console.error('Error deleting notification', err);
    }
  };
  
  const handleNotificationClick = async (notif: any) => {
    if (!notif.isRead) {
      try {
        await authFetch(`/api/notifications/${notif.id}/read`, { method: 'PUT' });
        setNotificationsList((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
        );
      } catch (err) {
        console.error('Failed to mark as read', err);
      }
    }
    
    // Navigate based on relatedEntity or link
    if (notif.link && onNavigate) {
      onNavigate(notif.link);
    } else if (notif.relatedEntity === 'USER' && notif.relatedEntityId && onNavigate) {
      onNavigate(`/u/${notif.relatedEntityId}`);
    } else if (notif.relatedEntity === 'MEDIA' && notif.relatedEntityId && onNavigate) {
      onNavigate(`/media/${notif.relatedEntityId}`);
    } else if (notif.relatedEntity === 'LIST' && notif.relatedEntityId && onNavigate) {
      onNavigate(`/lists/${notif.relatedEntityId}`);
    } else if (notif.relatedEntity === 'TIER_LIST' && notif.relatedEntityId && onNavigate) {
      onNavigate(`/tier-lists/${notif.relatedEntityId}`);
    }
  };

  const filteredNotifications = notificationsList.filter((notif) => {
    if (filter === 'UNREAD') return !notif.isRead;
    if (filter === 'SOCIAL') return ['FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'COMMENT', 'LIKE'].includes(notif.type);
    if (filter === 'RELEASE') return ['NEW_RELEASE', 'LIST_UPDATE'].includes(notif.type);
    return true;
  });

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-fade-in pb-20 md:pb-0">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-[#F3F1F8] tracking-tight">Центр уведомлений</h1>
        <p className="text-[#9A94AA] text-sm">События, друзья, релизы и обновления списков</p>
      </div>

      <div className="p-6 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#252233]">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'ALL', label: 'Все' },
              { id: 'UNREAD', label: 'Непрочитанные' },
              { id: 'SOCIAL', label: 'Социальные' },
              { id: 'RELEASE', label: 'Релизы' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  filter === tab.id
                    ? 'bg-[#9B6BFF] text-white'
                    : 'bg-[#191724] text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#252233]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {notificationsList.some(n => !n.isRead) && (
            <button
              onClick={handleMarkAllNotificationsRead}
              className="flex items-center gap-1.5 text-xs text-[#AC82FF] hover:text-white transition-colors whitespace-nowrap"
            >
              <CheckCheck className="w-4 h-4" />
              Прочитать все
            </button>
          )}
        </div>

        {notificationsLoading ? (
          <div className="py-12 flex items-center justify-center text-[#9A94AA]">
            <Loader2 className="w-6 h-6 animate-spin text-[#9B6BFF]" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-[#9A94AA] gap-3">
            <Bell className="w-10 h-10 opacity-20" />
            <p className="text-sm">Нет уведомлений в этой категории</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-4 ${
                  notif.isRead
                    ? 'bg-[#191724]/40 border-[#252233] text-[#9A94AA] hover:bg-[#191724]'
                    : 'bg-[#191724] border-[#9B6BFF]/30 text-[#F3F1F8] shadow-sm shadow-[#9B6BFF]/10 hover:border-[#9B6BFF]/60'
                }`}
              >
                <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${notif.isRead ? 'bg-transparent' : 'bg-[#9B6BFF]'}`} />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-bold ${notif.isRead ? 'text-[#D5D0E3]' : 'text-white'}`}>
                      {notif.title}
                    </span>
                    <span className="text-[10px] text-[#656075] whitespace-nowrap">
                      {new Date(notif.createdAt).toLocaleString('ru-RU', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className={`text-xs leading-relaxed ${notif.isRead ? 'text-[#9A94AA]' : 'text-[#D5D0E3]'}`}>
                    {notif.body}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDeleteNotification(notif.id, e)}
                  className="p-1.5 text-[#656075] hover:text-red-400 hover:bg-[#252233] transition-colors rounded-lg ml-2"
                  title="Удалить"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
