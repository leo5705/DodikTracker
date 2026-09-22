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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#252233]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#9B6BFF] to-[#6366F1] flex items-center justify-center shadow-lg shadow-purple-950/40">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#F3F1F8] tracking-tight flex items-center gap-2">
              Центр уведомлений
              {unreadCount > 0 && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-300 font-mono">
                  {unreadCount} новых
                </span>
              )}
            </h1>
            <p className="text-xs text-[#9A94AA]">
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
            className={`p-2 rounded-xl border transition-all ${
              soundEnabled
                ? 'bg-[#191724] border-[#9B6BFF]/40 text-[#AC82FF] hover:border-[#9B6BFF]'
                : 'bg-[#14131A] border-[#252233] text-[#656075] hover:text-[#9A94AA]'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Test push button */}
          <button
            type="button"
            onClick={triggerTestToast}
            title="Проверить появление всплывающего уведомления"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#191724] hover:bg-[#252233] border border-[#2E2A40] text-xs font-semibold text-[#D5D0E3] hover:text-white transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Тест Toast</span>
          </button>

          {/* Settings link */}
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('/settings')}
            title="Настройки каналов уведомлений"
            className="p-2 rounded-xl bg-[#191724] hover:bg-[#252233] border border-[#2E2A40] text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main card */}
      <div className="rounded-2xl bg-[#14131A] border border-[#252233] p-5 sm:p-6 space-y-5 shadow-xl shadow-black/20">
        {/* Filter bar & Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[#252233]">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {filterTabs.map((tab) => (
              <button
                key={`tab-${tab.id}`}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeFilter === tab.id
                    ? 'bg-[#9B6BFF] text-white shadow-md shadow-purple-950/50'
                    : 'bg-[#191724] text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#252233]'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      activeFilter === tab.id ? 'bg-white/20 text-white' : 'bg-[#252233] text-[#7A748E]'
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
                className="flex items-center gap-1.5 text-xs text-[#AC82FF] hover:text-white transition-colors"
              >
                <CheckCheck className="w-4 h-4" />
                <span>Прочитать всё</span>
              </button>
            )}

            {notifications.some((n) => n.isRead) && (
              <button
                type="button"
                onClick={() => clearReadNotifications()}
                className="flex items-center gap-1.5 text-xs text-[#7A748E] hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Очистить прочитанные</span>
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        {loading && notifications.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-[#9A94AA] gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#9B6BFF]" />
            <p className="text-xs font-medium">Загрузка уведомлений...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center text-[#9A94AA] gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#191724] border border-[#252233] flex items-center justify-center">
              <Bell className="w-6 h-6 text-[#656075]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#D5D0E3]">Нет уведомлений</h3>
              <p className="text-xs text-[#7A748E] max-w-xs">
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
                      ? 'bg-[#191724]/40 border-[#252233] text-[#9A94AA] hover:bg-[#191724]/80'
                      : 'bg-[#191724] border-[#9B6BFF]/30 text-[#F3F1F8] shadow-md shadow-purple-950/10 hover:border-[#9B6BFF]/70'
                  }`}
                >
                  {/* Left unread bar indicator */}
                  {!notif.isRead && (
                    <div className="absolute top-4 left-2 bottom-4 w-1 bg-[#9B6BFF] rounded-full" />
                  )}

                  {/* Avatar or Category Icon */}
                  <div className="relative shrink-0 pl-1">
                    {notif.senderAvatar ? (
                      <img
                        src={notif.senderAvatar}
                        alt=""
                        className="w-11 h-11 rounded-2xl object-cover border border-[#2E2A40]"
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
                          <span className="w-2 h-2 rounded-full bg-[#9B6BFF] inline-block animate-pulse" />
                        )}
                      </div>
                      <span className="text-[11px] text-[#656075] whitespace-nowrap font-mono">
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                    </div>

                    <h4 className={`text-sm font-bold tracking-tight ${notif.isRead ? 'text-[#D5D0E3]' : 'text-white'}`}>
                      {notif.title}
                    </h4>

                    <p className={`text-xs leading-relaxed ${notif.isRead ? 'text-[#9A94AA]' : 'text-[#C5C0D6]'}`}>
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
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Принять дружбу
                          </button>
                          <button
                            type="button"
                            disabled={processingFriendId === notif.id}
                            onClick={(e) => handleFriendAction(notif, 'DECLINE', e)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#252233] hover:bg-red-500/20 hover:text-red-300 text-[#9A94AA] text-xs font-semibold transition-colors disabled:opacity-50"
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
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-semibold shadow transition-colors disabled:opacity-50"
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
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#252233] hover:bg-red-500/20 hover:text-red-300 text-[#9A94AA] text-xs font-semibold transition-colors disabled:opacity-50"
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
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-colors"
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
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition-colors"
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
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-semibold transition-colors"
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
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#252233]/70 hover:bg-[#252233] text-xs text-[#D5D0E3] hover:text-white transition-colors"
                        >
                          <span>Перейти к объекту</span>
                          <ExternalLink className="w-3 h-3 text-[#9B6BFF]" />
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
                        className="p-1.5 text-[#7A748E] hover:text-[#AC82FF] hover:bg-[#252233] rounded-lg transition-colors"
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
                      className="p-1.5 text-[#7A748E] hover:text-red-400 hover:bg-[#252233] rounded-lg transition-colors"
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
          <div className="w-full max-w-md bg-[#14131A] border border-[#2E2A40] rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-400" />
                Быстрый ответ для {quickReplyTo.senderUsername || 'пользователя'}
              </h3>
              <button
                type="button"
                onClick={() => setQuickReplyTo(null)}
                className="p-1 text-[#7A748E] hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#9A94AA] bg-[#191724] p-3 rounded-xl border border-[#252233]">
              «{quickReplyTo.body || quickReplyTo.content}»
            </p>

            <form onSubmit={handleSendReply} className="space-y-3">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Напишите ответ..."
                rows={3}
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#191724] border border-[#252233] text-sm text-white placeholder-[#656075] focus:outline-none focus:border-[#9B6BFF] resize-none"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickReplyTo(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#9A94AA] hover:text-white hover:bg-[#252233] transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-all disabled:opacity-50"
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
