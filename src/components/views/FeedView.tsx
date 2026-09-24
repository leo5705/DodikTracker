import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Radio,
  Heart,
  MessageSquare,
  Star,
  Film,
  Tv,
  Gamepad2,
  BookOpen,
  CheckCircle2,
  ListPlus,
  Trophy,
  UserPlus,
  Send,
  Trash2,
  Share2,
  RefreshCw,
  Sparkles,
  Users,
  User,
  Compass,
  PlusCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Layers,
  Award,
  Clock,
  Quote,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { formatMediaTypePath } from '../../utils/formatters.ts';
import { usePresence } from '../../hooks/usePresence.ts';
import { PresenceIndicator } from '../ui/PresenceIndicator.tsx';
import { formatActivity } from '../../utils/activityFormatter.ts';
import { resolveAchievementIcon } from '../../utils/iconResolver.tsx';

interface ActivityItem {
  id: number;
  type: string;
  details: string | null;
  parsedDetails: any;
  createdAt: string;
  user: {
    id: number;
    username: string;
    avatar: string | null;
    role: string;
    bio: string | null;
  };
  media?: {
    id: number;
    title: string;
    originalTitle: string | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    type: string;
    year: number | null;
    rating: number | null;
  } | null;
  list?: {
    id: number;
    title: string;
    cover: string | null;
    category: string | null;
  } | null;
  tierList?: {
    id: number;
    title: string;
    category: string | null;
  } | null;
  likesCount: number;
  userLiked: boolean;
  commentsCount: number;
  recentComments?: Array<{
    id: number;
    content: string;
    createdAt: string;
    userId: number;
    username: string;
    avatar: string | null;
    role?: string;
  }>;
}

export const FeedView: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const { navigate } = useRouter();

  const [tab, setTab] = useState<'all' | 'friends' | 'my'>('all');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'MEDIA' | 'REVIEWS' | 'LISTS' | 'ACHIEVEMENTS' | 'FRIENDS'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [friendCount, setFriendCount] = useState<number>(0);

  // Expanded comment sections map (activityId -> boolean)
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
  // Loaded comments data (activityId -> comment[])
  const [commentsData, setCommentsData] = useState<Record<number, any[]>>({});
  // Active comment input text (activityId -> string)
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  // Submitting comment state (activityId -> boolean)
  const [submittingComment, setSubmittingComment] = useState<Record<number, boolean>>({});

  // Collect user IDs for presence indicators
  const userIds = useMemo(() => {
    const ids = new Set<number>();
    feed.forEach((act) => {
      if (act.user?.id) ids.add(act.user.id);
      if (act.recentComments) {
        act.recentComments.forEach((c) => ids.add(c.userId));
      }
    });
    return Array.from(ids);
  }, [feed]);

  const presenceMap = usePresence(userIds);

  const fetchFeed = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const queryParams = new URLSearchParams();
      queryParams.set('tab', tab);
      if (typeFilter !== 'ALL') queryParams.set('type', typeFilter);
      if (categoryFilter !== 'ALL') queryParams.set('category', categoryFilter);
      queryParams.set('limit', '50');

      const res = await authFetch(`/api/feed?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setFeed(data);
        } else if (data && Array.isArray(data.activities)) {
          setFeed(data.activities);
          setFriendCount(data.friendCount || 0);
        }
      }
    } catch (err) {
      console.error('Failed to load feed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, [tab, typeFilter, categoryFilter, dbUser]);

  const toggleLike = async (activityId: number, currentLiked: boolean) => {
    if (!dbUser) {
      navigate('/login');
      return;
    }

    // Optimistic update
    setFeed((prev) =>
      prev.map((act) => {
        if (act.id === activityId) {
          return {
            ...act,
            userLiked: !currentLiked,
            likesCount: currentLiked ? Math.max(0, act.likesCount - 1) : act.likesCount + 1,
          };
        }
        return act;
      })
    );

    try {
      await authFetch('/api/social/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'ACTIVITY', targetId: activityId }),
      });
    } catch (err) {
      console.error('Failed to toggle like:', err);
      fetchFeed();
    }
  };

  const toggleCommentsSection = async (activityId: number) => {
    const nextState = !expandedComments[activityId];
    setExpandedComments((prev) => ({ ...prev, [activityId]: nextState }));

    if (nextState && !commentsData[activityId]) {
      try {
        const res = await authFetch(`/api/activities/${activityId}/comments`);
        if (res.ok) {
          const list = await res.json();
          setCommentsData((prev) => ({ ...prev, [activityId]: list }));
        }
      } catch (err) {
        console.error('Failed to fetch activity comments:', err);
      }
    }
  };

  const handleSendComment = async (activityId: number) => {
    const text = (commentInputs[activityId] || '').trim();
    if (!text || !dbUser) return;

    setSubmittingComment((prev) => ({ ...prev, [activityId]: true }));
    try {
      const res = await authFetch(`/api/activities/${activityId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });

      if (res.ok) {
        const createdComment = await res.json();
        setCommentInputs((prev) => ({ ...prev, [activityId]: '' }));
        setCommentsData((prev) => ({
          ...prev,
          [activityId]: [...(prev[activityId] || []), createdComment],
        }));
        // Increment comments counter
        setFeed((prev) =>
          prev.map((act) =>
            act.id === activityId ? { ...act, commentsCount: (act.commentsCount || 0) + 1 } : act
          )
        );
      }
    } catch (err) {
      console.error('Failed to send comment:', err);
    } finally {
      setSubmittingComment((prev) => ({ ...prev, [activityId]: false }));
    }
  };

  const handleDeleteComment = async (activityId: number, commentId: number) => {
    try {
      const res = await authFetch(`/api/activities/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setCommentsData((prev) => ({
          ...prev,
          [activityId]: (prev[activityId] || []).filter((c) => c.id !== commentId),
        }));
        setFeed((prev) =>
          prev.map((act) =>
            act.id === activityId
              ? { ...act, commentsCount: Math.max(0, (act.commentsCount || 1) - 1) }
              : act
          )
        );
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const getMediaIcon = (type?: string) => {
    switch (type) {
      case 'TV':
      case 'ANIME':
        return <Tv className="w-3.5 h-3.5 text-blue-400" />;
      case 'GAME':
        return <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'BOOK':
      case 'MANGA':
      case 'COMIC':
        return <BookOpen className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Film className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  const getEventBadge = (type: string, details?: any, mediaType?: string) => {
    switch (type) {
      case 'MEDIA_COMPLETED':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
          label: mediaType === 'GAME' ? 'Завершил(а) игру' : mediaType === 'BOOK' ? 'Прочитал(а) книгу' : 'Завершил(а) просмотр',
          color: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40',
        };
      case 'MEDIA_STATUS_CHANGED':
      case 'MEDIA_ADDED': {
        const rawStatus = typeof details === 'string' ? details : details?.status || '';
        let label = 'Добавил(а) в библиотеку';
        if (rawStatus === 'WATCHING' || rawStatus === 'PLAYING') {
          label = mediaType === 'GAME' ? 'Начал(а) играть' : 'Смотрит';
        } else if (rawStatus === 'PLAN_TO_WATCH' || rawStatus === 'PLANNED') {
          label = 'Запланировал(а)';
        } else if (rawStatus === 'ON_HOLD') {
          label = 'Отложил(а)';
        } else if (rawStatus === 'DROPPED') {
          label = 'Бросил(а)';
        }
        return {
          icon: getMediaIcon(mediaType),
          label,
          color: 'bg-purple-950/60 text-purple-300 border-purple-800/40',
        };
      }
      case 'MEDIA_RATED':
        return {
          icon: <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />,
          label: 'Оценил(а) тайтл',
          color: 'bg-amber-950/60 text-amber-300 border-amber-800/40',
        };
      case 'REVIEW_ADDED':
        return {
          icon: <Quote className="w-3.5 h-3.5 text-pink-400" />,
          label: 'Написал(а) рецензию',
          color: 'bg-pink-950/60 text-pink-300 border-pink-800/40',
        };
      case 'LIST_CREATED':
        return {
          icon: <ListPlus className="w-3.5 h-3.5 text-cyan-400" />,
          label: 'Создал(а) список',
          color: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/40',
        };
      case 'LIST_UPDATED':
        return {
          icon: <Layers className="w-3.5 h-3.5 text-cyan-400" />,
          label: 'Обновил(а) список',
          color: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/40',
        };
      case 'TIERLIST_CREATED':
      case 'TIERLIST_UPDATED':
        return {
          icon: <Sparkles className="w-3.5 h-3.5 text-indigo-400" />,
          label: 'Создал(а) тир-лист',
          color: 'bg-indigo-950/60 text-indigo-300 border-indigo-800/40',
        };
      case 'ACHIEVEMENT_UNLOCKED':
        return {
          icon: <Trophy className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400/20" />,
          label: 'Разблокировал(а) достижение',
          color: 'bg-yellow-950/60 text-yellow-300 border-yellow-800/40',
        };
      case 'FRIEND_ADDED':
        return {
          icon: <UserPlus className="w-3.5 h-3.5 text-teal-400" />,
          label: 'Новая дружба',
          color: 'bg-teal-950/60 text-teal-300 border-teal-800/40',
        };
      default:
        return {
          icon: <Radio className="w-3.5 h-3.5 text-zinc-400" />,
          label: 'Активность',
          color: 'bg-zinc-800 text-zinc-300 border-zinc-700',
        };
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'только что';
      if (diffMins < 60) return `${diffMins} мин назад`;
      if (diffHours < 24) return `${diffHours} ч назад`;
      if (diffDays === 1) return 'вчера';
      if (diffDays < 7) return `${diffDays} дн назад`;
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6 pb-16 max-w-3xl mx-auto px-2 sm:px-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E2442] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#A78BFA] uppercase tracking-wider font-mono">
            <Radio className="w-4 h-4 text-[#8B5CF6] animate-pulse" />
            <span>Социальная лента</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight mt-1">
            Пульс сообщества
          </h1>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Реальные действия, просмотры, оценки и списки сообщества Dodik Tracker
          </p>
        </div>

        <button
          onClick={() => fetchFeed(true)}
          disabled={loading || refreshing}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#11152A] hover:bg-[#151932] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2442] text-xs font-medium transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          title="Обновить ленту"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#8B5CF6]' : ''}`} />
          <span>Обновить</span>
        </button>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#1E2442] pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            tab === 'all'
              ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
              : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] border border-[#1E2442]'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Все события</span>
        </button>

        <button
          onClick={() => setTab('friends')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative cursor-pointer ${
            tab === 'friends'
              ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
              : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] border border-[#1E2442]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Друзья</span>
          {friendCount > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-md bg-[#151932] text-[#A78BFA] border border-[#1E2442] font-mono">
              {friendCount}
            </span>
          )}
        </button>

        {dbUser && (
          <button
            onClick={() => setTab('my')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              tab === 'my'
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
                : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] border border-[#1E2442]'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Моя активность</span>
          </button>
        )}
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        {/* Event Type Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {[
            { id: 'ALL', label: 'Все типы' },
            { id: 'MEDIA', label: 'Медиа' },
            { id: 'REVIEWS', label: 'Рецензии' },
            { id: 'LISTS', label: 'Списки и тиры' },
            { id: 'ACHIEVEMENTS', label: 'Достижения' },
            { id: 'FRIENDS', label: 'Дружба' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTypeFilter(item.id as any)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                typeFilter === item.id
                  ? 'bg-[#151932] text-[#F8FAFC] border border-[#8B5CF6]/50 shadow-sm'
                  : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] border border-[#1E2442]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Media Category Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {[
            { id: 'ALL', label: 'Все' },
            { id: 'MOVIE', label: 'Фильмы' },
            { id: 'TV', label: 'Сериалы' },
            { id: 'ANIME', label: 'Аниме' },
            { id: 'GAME', label: 'Игры' },
            { id: 'BOOK', label: 'Книги' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                categoryFilter === cat.id
                  ? 'bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/40'
                  : 'bg-[#0B0D20] text-[#64748B] hover:text-[#94A3B8] border border-[#1E2442]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Activities Feed Stream */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center space-y-3 bg-zinc-900/30 rounded-2xl border border-zinc-800/80">
          <div className="w-10 h-10 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
          <p className="text-xs text-zinc-400 font-medium">Загрузка ленты событий...</p>
        </div>
      ) : feed.length > 0 ? (
        <div className="space-y-4">
          {feed.map((act) => {
            const formatted = formatActivity(act);
            const badge = getEventBadge(act.type, act.parsedDetails || act.details, act.media?.type);
            const isCommentsOpen = !!expandedComments[act.id];
            const commentsList = commentsData[act.id] || act.recentComments || [];

            return (
              <div
                key={act.id}
                id={`activity-${act.id}`}
                className="p-4 sm:p-5 rounded-2xl bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-all shadow-lg space-y-3.5 group"
              >
                {/* Event Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* User Avatar with Presence */}
                    <div className="relative shrink-0">
                      {formatted.actor.avatar ? (
                        <img
                          src={formatted.actor.avatar}
                          alt={formatted.actor.username}
                          referrerPolicy="no-referrer"
                          onClick={() => navigate(`/u/${formatted.actor.username}`)}
                          className="w-10 h-10 rounded-xl object-cover ring-2 ring-[#8B5CF6]/40 cursor-pointer hover:opacity-85 transition-opacity"
                        />
                      ) : (
                        <div
                          onClick={() => navigate(`/u/${formatted.actor.username}`)}
                          className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#6366F1] flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:opacity-85 transition-opacity shadow-sm"
                        >
                          {formatted.actor.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {formatted.actor.id && (
                        <PresenceIndicator
                          presence={presenceMap[formatted.actor.id]}
                          className="absolute -bottom-0.5 -right-0.5"
                          size="sm"
                        />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => navigate(`/u/${formatted.actor.username}`)}
                          className="text-xs font-bold text-[#F8FAFC] hover:text-[#A78BFA] transition-colors cursor-pointer"
                        >
                          @{formatted.actor.username}
                        </button>

                        {/* Event Action Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badge.color}`}
                        >
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>
                      </div>

                      <span
                        title={formatted.fullDateTime}
                        className="text-[11px] text-[#94A3B8] font-mono flex items-center gap-1 mt-0.5 cursor-default"
                      >
                        <Clock className="w-3 h-3 text-[#64748B]" />
                        {formatted.relativeTime}
                      </span>
                    </div>
                  </div>

                  {/* Direct Message button for other users */}
                  {dbUser && formatted.actor.id && formatted.actor.id !== dbUser.id && (
                    <button
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent('open_chat', {
                            detail: {
                              id: formatted.actor.id,
                              username: formatted.actor.username,
                              avatar: formatted.actor.avatar,
                            },
                          })
                        )
                      }
                      className="p-1.5 rounded-lg bg-[#0B0D20] hover:bg-[#151932] text-[#94A3B8] hover:text-[#A78BFA] border border-[#1E2442] transition-colors shrink-0 cursor-pointer"
                      title="Написать сообщение"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Event Details Content */}

                {/* 1. Media Event Card */}
                {formatted.media && (
                  <div
                    onClick={() =>
                      navigate(`/media/${formatMediaTypePath(formatted.media!.type || 'MOVIE')}/${formatted.media!.id}`)
                    }
                    className="p-3 rounded-xl bg-[#0B0D20] border border-[#1E2442] flex gap-3.5 items-center cursor-pointer hover:border-[#8B5CF6]/50 hover:bg-[#151932]/50 transition-all group/media"
                  >
                    {formatted.media.posterUrl ? (
                      <img
                        src={formatted.media.posterUrl}
                        alt={formatted.media.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-16 object-cover rounded-lg shrink-0 shadow-md ring-1 ring-[#1E2442] group-hover/media:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-12 h-16 bg-[#11152A] rounded-lg flex items-center justify-center text-[#64748B] shrink-0 border border-[#1E2442]">
                        {getMediaIcon(formatted.media.type)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-[#F8FAFC] line-clamp-1 group-hover/media:text-[#A78BFA] transition-colors">
                          {formatted.media.title}
                        </h4>
                        {formatted.media.year && (
                          <span className="text-[11px] text-[#94A3B8] font-mono">({formatted.media.year})</span>
                        )}
                      </div>

                      {formatted.media.originalTitle && formatted.media.originalTitle !== formatted.media.title && (
                        <p className="text-[11px] text-[#94A3B8] line-clamp-1">
                          {formatted.media.originalTitle}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-0.5">
                        <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-[#11152A] text-[#94A3B8] border border-[#1E2442]">
                          {formatted.media.type}
                        </span>

                        {formatted.userRating ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {formatted.userRating}/100
                          </span>
                        ) : formatted.media.rating ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400">
                            <Star className="w-2.5 h-2.5 fill-amber-400" />
                            {formatted.media.rating}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Review Content */}
                {formatted.reviewSnippet && (
                  <div className="p-3.5 rounded-xl bg-[#151932] border border-[#8B5CF6]/30 space-y-2">
                    <p className="text-xs text-[#CBD5E1] italic leading-relaxed line-clamp-3">
                      «{formatted.reviewSnippet}»
                    </p>
                  </div>
                )}

                {/* 3. List Event Card */}
                {formatted.list && (
                  <div
                    onClick={() => navigate(`/lists/${formatted.list!.id}`)}
                    className="p-3 rounded-xl bg-[#0B0D20] border border-[#1E2442] flex gap-3.5 items-center cursor-pointer hover:border-cyan-500/50 hover:bg-[#151932]/50 transition-all"
                  >
                    <div className="w-12 h-14 bg-cyan-950/40 border border-cyan-800/40 rounded-lg flex items-center justify-center text-cyan-400 shrink-0">
                      <ListPlus className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-[#F8FAFC] hover:text-cyan-300 transition-colors line-clamp-1">
                        {formatted.list.title}
                      </h4>
                      {formatted.list.category && (
                        <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/30">
                          {formatted.list.category}
                        </span>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-[#64748B] group-hover:text-cyan-400 transition-colors" />
                  </div>
                )}

                {/* 4. Tier List Event Card */}
                {formatted.tierList && (
                  <div
                    onClick={() => navigate(`/tier-lists/${formatted.tierList!.id}`)}
                    className="p-3 rounded-xl bg-[#0B0D20] border border-[#1E2442] flex gap-3.5 items-center cursor-pointer hover:border-[#8B5CF6]/50 hover:bg-[#151932]/50 transition-all"
                  >
                    <div className="w-12 h-14 bg-violet-950/40 border border-violet-800/40 rounded-lg flex items-center justify-center text-[#A78BFA] shrink-0">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-[#F8FAFC] hover:text-[#A78BFA] transition-colors line-clamp-1">
                        {formatted.tierList.title}
                      </h4>
                      {formatted.tierList.category && (
                        <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-violet-950/60 text-[#A78BFA] border border-violet-800/30">
                          {formatted.tierList.category}
                        </span>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-[#64748B] group-hover:text-[#A78BFA] transition-colors" />
                  </div>
                )}

                {/* 5. Achievement Event Card */}
                {formatted.achievement && (() => {
                  const AchIcon = resolveAchievementIcon(formatted.achievement.icon);
                  return (
                    <div
                      onClick={() => navigate('/achievements')}
                      className="p-3.5 rounded-xl bg-[#0B0D20] border border-amber-500/30 flex gap-3.5 items-center cursor-pointer hover:border-amber-500/60 transition-all shadow-md group/ach"
                    >
                      <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                        <AchIcon className="w-5 h-5 fill-amber-400/20" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-bold text-amber-300 group-hover/ach:text-amber-200 transition-colors truncate">
                            🏆 {formatted.achievement.title}
                          </h4>
                          {formatted.achievement.points && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              +{formatted.achievement.points} XP
                            </span>
                          )}
                          {formatted.achievement.rarity && (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-[#11152A] text-amber-400/80 border border-amber-500/20">
                              {formatted.achievement.rarity}
                            </span>
                          )}
                        </div>
                        {formatted.achievement.description && (
                          <p className="text-[11px] text-[#94A3B8] line-clamp-2">
                            {formatted.achievement.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 6. Friend Added Event */}
                {formatted.friend && (
                  <div
                    onClick={() => navigate(`/u/${formatted.friend!.username}`)}
                    className="p-3 rounded-xl bg-[#0B0D20] border border-[#1E2442] flex gap-3 items-center cursor-pointer hover:border-emerald-500/40 transition-all"
                  >
                    <div className="w-9 h-9 rounded-full bg-emerald-950 border border-emerald-800/40 flex items-center justify-center text-emerald-300 font-bold text-xs">
                      {formatted.friend.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs text-[#F8FAFC]">
                        Подружились с{' '}
                        <strong className="text-emerald-300 hover:underline">
                          @{formatted.friend.username}
                        </strong>
                      </p>
                    </div>
                  </div>
                )}

                {/* 7. Fallback Activity Details */}
                {!formatted.media &&
                  !formatted.reviewSnippet &&
                  !formatted.list &&
                  !formatted.tierList &&
                  !formatted.achievement &&
                  !formatted.friend &&
                  formatted.detailsText && (
                    <div className="p-3 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-[#CBD5E1]">
                      {formatted.detailsText}
                    </div>
                )}

                {/* Event Actions Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-[#1E2442] text-xs text-[#94A3B8]">
                  <div className="flex items-center gap-2">
                    {/* Like Button */}
                    <button
                      onClick={() => toggleLike(act.id, act.userLiked)}
                      className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg border transition-all text-xs font-medium cursor-pointer ${
                        act.userLiked
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
                          : 'bg-[#0B0D20] text-[#94A3B8] border-[#1E2442] hover:text-[#F8FAFC] hover:bg-[#151932]'
                      }`}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          act.userLiked ? 'fill-rose-400 text-rose-400' : 'text-[#64748B]'
                        }`}
                      />
                      <span className="font-mono">{act.likesCount || 0}</span>
                    </button>

                    {/* Comments Toggle Button */}
                    <button
                      onClick={() => toggleCommentsSection(act.id)}
                      className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg border transition-all text-xs font-medium cursor-pointer ${
                        isCommentsOpen
                          ? 'bg-[#151932] text-[#A78BFA] border-[#8B5CF6]/50'
                          : 'bg-[#0B0D20] text-[#94A3B8] border-[#1E2442] hover:text-[#F8FAFC] hover:bg-[#151932]'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#64748B]" />
                      <span className="font-mono">{act.commentsCount || 0}</span>
                      {isCommentsOpen ? (
                        <ChevronUp className="w-3 h-3 ml-0.5 opacity-60" />
                      ) : (
                        <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
                      )}
                    </button>
                  </div>

                  {/* Share button */}
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(window.location.href);
                    }}
                    className="p-1.5 rounded-lg hover:bg-[#151932] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                    title="Скопировать ссылку"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Inline Comments Section */}
                {isCommentsOpen && (
                  <div className="pt-3 border-t border-[#1E2442] space-y-3">
                    {/* List of comments */}
                    {commentsList.length > 0 ? (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {commentsList.map((c) => {
                          const isOwnComment = dbUser?.id === c.userId;
                          const canDelete =
                            isOwnComment ||
                            ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(dbUser?.role || '');

                          return (
                            <div
                              key={c.id}
                              className="p-2.5 rounded-xl bg-[#0B0D20] border border-[#1E2442] flex gap-2.5 items-start text-xs group/comment"
                            >
                              <div
                                onClick={() => navigate(`/u/${c.username}`)}
                                className="cursor-pointer shrink-0"
                              >
                                {c.avatar ? (
                                  <img
                                    src={c.avatar}
                                    alt={c.username}
                                    referrerPolicy="no-referrer"
                                    className="w-6 h-6 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-[#7C3AED]/40 flex items-center justify-center text-[10px] font-bold text-[#A78BFA]">
                                    {c.username.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    onClick={() => navigate(`/u/${c.username}`)}
                                    className="font-bold text-[#F8FAFC] hover:text-[#A78BFA] cursor-pointer"
                                  >
                                    @{c.username}
                                  </span>
                                  <span className="text-[10px] text-[#64748B] font-mono">
                                    {formatRelativeTime(c.createdAt)}
                                  </span>
                                </div>
                                <p className="text-[#CBD5E1] text-xs break-words leading-relaxed">
                                  {c.content}
                                </p>
                              </div>

                              {canDelete && (
                                <button
                                  onClick={() => handleDeleteComment(act.id, c.id)}
                                  className="opacity-0 group-hover/comment:opacity-100 p-1 text-[#64748B] hover:text-rose-400 transition-opacity cursor-pointer"
                                  title="Удалить"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-[#94A3B8] text-center py-2 italic">
                        Комментариев пока нет. Будьте первым!
                      </p>
                    )}

                    {/* New Comment Input */}
                    {dbUser ? (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={commentInputs[act.id] || ''}
                          onChange={(e) =>
                            setCommentInputs((prev) => ({ ...prev, [act.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendComment(act.id);
                            }
                          }}
                          placeholder="Написать комментарий..."
                          className="flex-1 bg-[#0B0D20] border border-[#1E2442] rounded-xl px-3 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]/80 transition-colors"
                        />
                        <button
                          onClick={() => handleSendComment(act.id)}
                          disabled={
                            !(commentInputs[act.id] || '').trim() || submittingComment[act.id]
                          }
                          className="p-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 text-white transition-colors cursor-pointer"
                          title="Отправить"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-[#94A3B8] text-center pt-1">
                        <button
                          onClick={() => navigate('/login')}
                          className="text-[#A78BFA] hover:underline font-semibold"
                        >
                          Войдите
                        </button>
                        , чтобы оставлять комментарии
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Rich Contextual Empty State */
        <div className="py-16 px-6 text-center space-y-4 bg-[#11152A] rounded-2xl border border-[#1E2442] max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-[#151932] border border-[#8B5CF6]/30 flex items-center justify-center mx-auto text-[#A78BFA] shadow-inner">
            {tab === 'friends' ? (
              <Users className="w-7 h-7" />
            ) : tab === 'my' ? (
              <User className="w-7 h-7" />
            ) : (
              <Radio className="w-7 h-7" />
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-bold text-[#F8FAFC]">
              {tab === 'friends'
                ? 'В ленте друзей пока пусто'
                : tab === 'my'
                ? 'Вы ещё не совершали действий'
                : 'Событий пока не найдено'}
            </h3>
            <p className="text-xs text-[#94A3B8] max-w-sm mx-auto leading-relaxed">
              {tab === 'friends'
                ? 'Добавляйте друзей в Dodik Tracker, чтобы видеть их просмотры, оценки, рецензии и пользовательские списки!'
                : tab === 'my'
                ? 'Добавляйте тайтлы в библиотеку, ставьте оценки и создавайте списки — ваша активность появится здесь.'
                : 'Попробуйте изменить выбранные фильтры или начните вести трекинг медиа прямо сейчас.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {tab === 'friends' && (
              <button
                onClick={() => navigate('/users')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-[#7C3AED]/25 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Найти пользователей</span>
              </button>
            )}

            <button
              onClick={() => navigate('/movies')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B0D20] hover:bg-[#151932] text-[#F8FAFC] text-xs font-semibold border border-[#1E2442] transition-colors cursor-pointer"
            >
              <Film className="w-4 h-4 text-[#A78BFA]" />
              <span>Каталог медиа</span>
            </button>

            <button
              onClick={() => navigate('/lists')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B0D20] hover:bg-[#151932] text-[#F8FAFC] text-xs font-semibold border border-[#1E2442] transition-colors cursor-pointer"
            >
              <ListPlus className="w-4 h-4 text-cyan-400" />
              <span>Списки и Тиры</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
