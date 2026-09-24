import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  CheckCheck,
  Loader2,
  Trash2,
  Settings,
  Sparkles,
  ExternalLink,
  Volume2,
  VolumeX,
  X,
  UserCheck,
  UserX,
  MessageSquare,
  Trophy,
  Star,
  Zap,
  Film,
  AtSign,
  ShieldAlert,
  Info,
  Heart,
  MessageCircle,
  Filter,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { AppNotification } from '../../types/notification.ts';
import { getNotificationVisuals } from '../notifications/NotificationToast.tsx';

interface NotificationCenterViewProps {
  onNavigate?: (path: string) => void;
}

type FilterCategory = 'ALL' | 'UNREAD' | 'ACHIEVEMENTS' | 'SOCIAL' | 'CONTENT' | 'SYSTEM';

function formatRelativeTime(dateInput: string | Date): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 45) return 'только что';
  if (diffMin < 60) return `${diffMin} ${getNoun(diffMin, 'минуту', 'минуты', 'минут')} назад`;
  if (diffHour < 24) return `${diffHour} ${getNoun(diffHour, 'час', 'часа', 'часов')} назад`;
  if (diffDay === 1) return `вчера в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDay < 7) return `${diffDay} ${getNoun(diffDay, 'день', 'дня', 'дней')} назад`;

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getNoun(number: number, one: string, two: string, five: string) {
  let n = Math.abs(number);
  n %= 100;
  if (n >= 5 && n <= 20) return five;
  n %= 10;
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return two;
  return five;
}

export const NotificationCenterView: React.FC<NotificationCenterViewProps> = ({ onNavigate }) => {
  const { authFetch } = useAuth();
  const {
    notifications,
    unreadCount,
    loading,
    soundEnabled,
    setSoundEnabled,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearReadNotifications,
    triggerTestToast,
  } = useNotifications();

  const [activeFilter, setActiveFilter] = useState<FilterCategory>('ALL');
  const [processingFriendId, setProcessingFriendId] = useState<number | null>(null);
  const [processingInviteId, setProcessingInviteId] = useState<number | null>(null);
  const [quickReplyTo, setQuickReplyTo] = useState<AppNotification | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const filteredNotifications = useMemo(() => {
    const list = notifications.filter((notif) => {
      if (!notif) return false;
      if (activeFilter === 'UNREAD') return !notif.isRead;
      if (activeFilter === 'ACHIEVEMENTS') {
        return notif.type === 'ACHIEVEMENT_UNLOCKED' || notif.type === 'ACHIEVEMENT';
      }
      if (activeFilter === 'SOCIAL') {
        return [
          'FRIEND_REQUEST',
          'FRIEND_ACCEPTED',
          'LIST_INVITE',
          'LIST_INVITE_ACCEPTED',
          'LIST_INVITE_DECLINED',
          'LIST_FOLLOW',
          'TIER_LIST_INVITE',
          'NEW_MESSAGE',
          'FRIEND_REVIEW',
          'FRIEND_ACTIVITY',
          'MENTION',
          'LIKE',
          'REVIEW_LIKED',
          'COMMENT',
          'REVIEW_COMMENTED',
        ].includes(notif.type);
      }
      if (activeFilter === 'CONTENT') {
        return ['NEW_RELEASE', 'CONTENT_COMPLETED', 'CONTENT_SHARED'].includes(notif.type);
      }
      if (activeFilter === 'SYSTEM') {
        return [
          'SYSTEM',
          'ADMIN_ALERT',
          'ADMIN_ANNOUNCEMENT',
          'FEEDBACK_REPLIED',
        ].includes(notif.type);
      }
      return true;
    });

    const seen = new Set<string | number>();
    return list.filter((notif, index) => {
      const key = notif.id !== undefined && notif.id !== null ? String(notif.id) : `fallback-idx-${index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [notifications, activeFilter]);

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.isRead) {
      await markAsRead(notif.id);
    }

    const entType = (notif.entityType || notif.relatedEntity || '').toUpperCase();
    const entId = notif.entityId || notif.relatedEntityId;

    if (notif.link && onNavigate) {
      onNavigate(notif.link);
    } else if (entType === 'REPORT' || entType === 'FEEDBACK') {
      if (onNavigate) onNavigate('/feedback');
    } else if (entType === 'TIER_LIST' && entId && onNavigate) {
      onNavigate(`/tier-lists/${entId}`);
    } else if (entType === 'REVIEW' && entId && onNavigate) {
      onNavigate(`/review/${entId}`);
    } else if (entType === 'MEDIA' && entId && onNavigate) {
      onNavigate(`/media/${entId}`);
    } else if (entType === 'USER' && entId && onNavigate) {
      onNavigate(`/u/${entId}`);
    } else if (entType === 'LIST' && entId && onNavigate) {
      onNavigate(`/lists/${entId}`);
    } else if (entType === 'ACHIEVEMENT' && onNavigate) {
      onNavigate('/achievements');
    }
  };

  // Quick accept/decline friend request
  const handleFriendAction = async (notif: AppNotification, action: 'ACCEPT' | 'DECLINE', e: React.MouseEvent) => {
    e.stopPropagation();
    if (!notif.senderId) return;

    setProcessingFriendId(notif.id);
    try {
      if (action === 'ACCEPT') {
        await authFetch('/api/friends/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId: notif.senderId }),
        });
      } else {
        await authFetch('/api/friends/decline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId: notif.senderId }),
        });
      }
      // Mark notification as read
      await markAsRead(notif.id);
    } catch (err) {
      console.error('Failed to respond to friend request:', err);
    } finally {
      setProcessingFriendId(null);
    }
  };

  // Quick accept/decline list invitation
  const handleListInviteAction = async (notif: AppNotification, action: 'ACCEPT' | 'DECLINE', e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessingInviteId(notif.id);
    try {
      let invId = notif.metadata?.invitationId;
      if (!invId && notif.metadataJson) {
        try {
          const parsed = JSON.parse(notif.metadataJson);
          invId = parsed.invitationId;
        } catch (_e) {}
      }
      const listId = notif.relatedEntityId || notif.metadata?.listId;

      if (invId) {
        const endpoint = action === 'ACCEPT' ? `/api/list-invitations/${invId}/accept` : `/api/list-invitations/${invId}/decline`;
        await authFetch(endpoint, { method: 'POST' });
      } else if (listId) {
        const endpoint = action === 'ACCEPT' ? `/api/lists/${listId}/invitations/accept` : `/api/lists/${listId}/invitations/decline`;
        await authFetch(endpoint, { method: 'POST' });
      }

      await markAsRead(notif.id);
      await fetchNotifications();

      if (action === 'ACCEPT' && listId && onNavigate) {
        onNavigate(`/lists/${listId}`);
      }
    } catch (err) {
      console.error('Failed to respond to list invitation:', err);
    } finally {
      setProcessingInviteId(null);
    }
  };

  // Quick send reply to a direct message notification
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickReplyTo?.senderId || !replyText.trim()) return;

    setSendingReply(true);
    try {
      const res = await authFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: quickReplyTo.senderId,
          content: replyText.trim(),
        }),
      });
      if (res.ok) {
        setReplyText('');
        setQuickReplyTo(null);
      }
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setSendingReply(false);
    }
  };

  const filterTabs: { id: FilterCategory; label: string; count?: number }[] = [
    { id: 'ALL', label: 'Все', count: notifications.length },
    { id: 'UNREAD', label: 'Непрочитанные', count: unreadCount },
    {
      id: 'ACHIEVEMENTS',
      label: 'Достижения',
      count: notifications.filter((n) => n.type === 'ACHIEVEMENT_UNLOCKED' || n.type === 'ACHIEVEMENT').length,
    },
    {
      id: 'SOCIAL',
      label: 'Социальные',
      count: notifications.filter((n) =>
        [
          'FRIEND_REQUEST',
          'FRIEND_ACCEPTED',
          'LIST_INVITE',
          'LIST_INVITE_ACCEPTED',
          'LIST_INVITE_DECLINED',
          'LIST_FOLLOW',
          'TIER_LIST_INVITE',
          'NEW_MESSAGE',
          'FRIEND_REVIEW',
          'FRIEND_ACTIVITY',
          'MENTION',
          'LIKE',
          'REVIEW_LIKED',
          'COMMENT',
          'REVIEW_COMMENTED',
        ].includes(n.type)
      ).length,
    },
    {
      id: 'CONTENT',
      label: 'Контент',
      count: notifications.filter((n) =>
        ['NEW_RELEASE', 'CONTENT_COMPLETED', 'CONTENT_SHARED'].includes(n.type)
      ).length,
    },
    {
      id: 'SYSTEM',
      label: 'Системные',
      count: notifications.filter((n) =>
        ['SYSTEM', 'ADMIN_ALERT', 'ADMIN_ANNOUNCEMENT', 'FEEDBACK_REPLIED'].includes(n.type)
      ).length,
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-20 md:pb-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#1E2442]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] flex items-center justify-center shadow-lg shadow-[#7C3AED]/25">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#F8FAFC] tracking-tight flex items-center gap-2">
              Центр уведомлений
              {unreadCount > 0 && (
                <span className="text-xs px-2.5 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-red-400 font-mono font-semibold">
                  {unreadCount} новых
                </span>
              )}
            </h1>
            <p className="text-xs text-[#94A3B8]">
              Мгновенные оповещения о друзьях, новых отзывах, релизах и достижениях
            </p>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          {/* Sound toggle button */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Звук уведомлений включен' : 'Звук уведомлений выключен'}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-[#11152A] border-[#8B5CF6]/40 text-[#A78BFA] hover:border-[#8B5CF6]'
                : 'bg-[#0B0D20] border-[#1E2442] text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Test push button */}
          <button
            type="button"
            onClick={triggerTestToast}
            title="Проверить появление всплывающего уведомления"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-semibold text-[#F8FAFC] hover:text-white transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Тест Toast</span>
          </button>

          {/* Settings link */}
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('/settings')}
            title="Настройки каналов уведомлений"
            className="p-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main card */}
      <div className="rounded-2xl bg-[#0B0D20] border border-[#1E2442] p-5 sm:p-6 space-y-5 shadow-xl shadow-black/20">
        {/* Filter bar & Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[#1E2442]">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {filterTabs.map((tab) => (
              <button
                key={`tab-${tab.id}`}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeFilter === tab.id
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
                    : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] border border-[#1E2442]'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                      activeFilter === tab.id ? 'bg-white/20 text-white' : 'bg-[#151932] text-[#A78BFA]'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Quick Bulk Operations */}
          <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllAsRead()}
                className="flex items-center gap-1.5 text-xs text-[#A78BFA] hover:text-white transition-colors cursor-pointer"
              >
                <CheckCheck className="w-4 h-4" />
                <span>Прочитать всё</span>
              </button>
            )}

            {notifications.some((n) => n.isRead) && (
              <button
                type="button"
                onClick={() => clearReadNotifications()}
                className="flex items-center gap-1.5 text-xs text-[#64748B] hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Очистить прочитанные</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        {loading && notifications.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-[#94A3B8] gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#8B5CF6]" />
            <p className="text-xs font-medium">Загрузка уведомлений...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center text-[#94A3B8] gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-center">
              <Bell className="w-6 h-6 text-[#64748B]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#F8FAFC]">Нет уведомлений</h3>
              <p className="text-xs text-[#64748B] max-w-xs">
                {activeFilter === 'UNREAD'
                  ? 'Все входящие уведомления уже прочитаны.'
                  : 'В этой категории пока нет новых событий.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notif, index) => {
              const visuals = getNotificationVisuals(notif.type);
              const IconComponent = visuals.icon;
              const notifKey = notif.id !== undefined && notif.id !== null ? `notif-${notif.id}` : `notif-idx-${index}`;

              return (
                <div
                  key={notifKey}
                  onClick={() => handleNotificationClick(notif)}
                  className={`group relative p-4 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-start gap-4 ${
                    notif.isRead
                      ? 'bg-[#11152A]/50 border-[#1E2442] text-[#94A3B8] hover:bg-[#11152A]'
                      : 'bg-[#11152A] border-[#8B5CF6]/30 text-[#F8FAFC] shadow-sm hover:border-[#8B5CF6]/60'
                  }`}
                >
                  {/* Left unread bar indicator */}
                  {!notif.isRead && (
                    <div className="absolute top-4 left-2 bottom-4 w-1 bg-[#8B5CF6] rounded-full" />
                  )}

                  {/* Avatar or Category Icon */}
                  <div className="relative shrink-0 pl-1">
                    {notif.senderAvatar ? (
                      <img
                        src={notif.senderAvatar}
                        alt=""
                        className="w-11 h-11 rounded-2xl object-cover border border-[#1E2442]"
                      />
                    ) : (
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${visuals.badgeColor}`}>
                        <IconComponent className="w-5 h-5" />
                      </div>
                    )}
                    {notif.senderAvatar && (
                      <div className={`absolute -bottom-1 -right-1 p-1 rounded-full border ${visuals.badgeColor}`}>
                        <IconComponent className="w-3 h-3" />
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border ${visuals.badgeColor}`}>
                          {visuals.categoryName}
                        </span>
                        {!notif.isRead && (
                          <span className="w-2 h-2 rounded-full bg-[#8B5CF6] inline-block animate-pulse" />
                        )}
                      </div>
                      <span className="text-[11px] text-[#64748B] whitespace-nowrap font-mono">
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                    </div>

                    <h4 className={`text-sm font-bold tracking-tight ${notif.isRead ? 'text-[#94A3B8]' : 'text-white'}`}>
                      {notif.title}
                    </h4>

                    <p className={`text-xs leading-relaxed ${notif.isRead ? 'text-[#94A3B8]' : 'text-[#CBD5E1]'}`}>
                      {notif.message || notif.body || notif.content}
                    </p>

                    {/* Inline Quick Action Buttons */}
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      {/* Friend Request Actions */}
                      {notif.type === 'FRIEND_REQUEST' && notif.senderId && !notif.isRead && (
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            type="button"
                            disabled={processingFriendId === notif.id}
                            onClick={(e) => handleFriendAction(notif, 'ACCEPT', e)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Принять дружбу
                          </button>
                          <button
                            type="button"
                            disabled={processingFriendId === notif.id}
                            onClick={(e) => handleFriendAction(notif, 'DECLINE', e)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#151932] hover:bg-rose-500/20 hover:text-rose-300 text-[#94A3B8] text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            Отклонить
                          </button>
                        </div>
                      )}

                      {/* List Invite Actions */}
                      {notif.type === 'LIST_INVITE' && !notif.isRead && (
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            type="button"
                            disabled={processingInviteId === notif.id}
                            onClick={(e) => handleListInviteAction(notif, 'ACCEPT', e)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold shadow transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {processingInviteId === notif.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <UserCheck className="w-3.5 h-3.5" />
                            )}
                            Принять приглашение
                          </button>
                          <button
                            type="button"
                            disabled={processingInviteId === notif.id}
                            onClick={(e) => handleListInviteAction(notif, 'DECLINE', e)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#151932] hover:bg-rose-500/20 hover:text-rose-300 text-[#94A3B8] text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            Отклонить
                          </button>
                        </div>
                      )}

                      {/* Tier List Invite Action */}
                      {notif.type === 'TIER_LIST_INVITE' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNotificationClick(notif);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <span>Открыть тир-лист</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}

                      {/* Support Feedback Reply Action */}
                      {notif.type === 'FEEDBACK_REPLIED' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNotificationClick(notif);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <span>Посмотреть ответ поддержки</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}

                      {/* Direct Message Quick Reply button */}
                      {notif.type === 'NEW_MESSAGE' && notif.senderId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuickReplyTo(notif);
                          }}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Быстрый ответ
                        </button>
                      )}

                      {/* Generic Link Action */}
                      {notif.link && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNotificationClick(notif);
                          }}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#151932] hover:bg-[#1E2442] border border-[#1E2442] text-xs text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
                        >
                          <span>Перейти к объекту</span>
                          <ExternalLink className="w-3 h-3 text-[#8B5CF6]" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card Side Controls */}
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-start opacity-70 group-hover:opacity-100 transition-opacity">
                    {!notif.isRead && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notif.id);
                        }}
                        title="Отметить как прочитанное"
                        className="p-1.5 text-[#64748B] hover:text-[#A78BFA] hover:bg-[#151932] rounded-lg transition-colors cursor-pointer"
                      >
                        <CheckCheck className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notif.id);
                      }}
                      title="Удалить уведомление"
                      className="p-1.5 text-[#64748B] hover:text-rose-400 hover:bg-[#151932] rounded-lg transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick reply modal dialog */}
      {quickReplyTo && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0B0D20] border border-[#1E2442] rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-400" />
                Быстрый ответ для {quickReplyTo.senderUsername || 'пользователя'}
              </h3>
              <button
                type="button"
                onClick={() => setQuickReplyTo(null)}
                className="p-1 text-[#64748B] hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#94A3B8] bg-[#11152A] p-3 rounded-xl border border-[#1E2442]">
              «{quickReplyTo.body || quickReplyTo.content}»
            </p>

            <form onSubmit={handleSendReply} className="space-y-3">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Напишите ответ..."
                rows={3}
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] resize-none"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickReplyTo(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#94A3B8] hover:text-white hover:bg-[#151932] transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  {sendingReply ? 'Отправка...' : 'Отправить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
