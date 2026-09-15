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
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-zinc-900 to-zinc-900 border border-purple-800/30 shadow-lg">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-zinc-100 tracking-tight flex items-center gap-2">
                СОЦИАЛЬНАЯ ЛЕНТА
              </h1>
              <p className="text-xs text-zinc-400">
                Реальные действия, просмотры, оценки и списки сообщества Dodik Tracker
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => fetchFeed(true)}
          disabled={loading || refreshing}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
          title="Обновить ленту"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-purple-400' : ''}`} />
          <span>Обновить</span>
        </button>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            tab === 'all'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800/80'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Все события</span>
        </button>

        <button
          onClick={() => setTab('friends')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative ${
            tab === 'friends'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800/80'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Друзья</span>
          {friendCount > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-purple-950 text-purple-300 border border-purple-800/50">
              {friendCount}
            </span>
          )}
        </button>

        {dbUser && (
          <button
            onClick={() => setTab('my')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              tab === 'my'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800/80'
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
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                typeFilter === item.id
                  ? 'bg-purple-950 text-purple-200 border border-purple-700/60 shadow-sm'
                  : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800/60'
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
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                categoryFilter === cat.id
                  ? 'bg-zinc-100 text-zinc-900 font-bold'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800/60'
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
            const badge = getEventBadge(act.type, act.parsedDetails || act.details, act.media?.type);
            const isCommentsOpen = !!expandedComments[act.id];
            const commentsList = commentsData[act.id] || act.recentComments || [];

            return (
              <div
                key={act.id}
                id={`activity-${act.id}`}
                className="p-4 sm:p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 hover:border-zinc-700/80 transition-all shadow-md space-y-3.5 group"
              >
                {/* Event Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* User Avatar with Presence */}
                    <div className="relative shrink-0">
                      {act.user.avatar ? (
                        <img
                          src={act.user.avatar}
                          alt={act.user.username}
                          referrerPolicy="no-referrer"
                          onClick={() => navigate(`/u/${act.user.username}`)}
                          className="w-10 h-10 rounded-full object-cover ring-2 ring-purple-500/20 cursor-pointer hover:opacity-85 transition-opacity"
                        />
                      ) : (
                        <div
                          onClick={() => navigate(`/u/${act.user.username}`)}
                          className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-800 to-indigo-900 flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:opacity-85 transition-opacity shadow-sm"
                        >
                          {act.user.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {act.user.id && (
                        <PresenceIndicator
                          presence={presenceMap[act.user.id]}
                          className="absolute -bottom-0.5 -right-0.5"
                          size="sm"
                        />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => navigate(`/u/${act.user.username}`)}
                          className="text-xs font-bold text-zinc-100 hover:text-purple-300 transition-colors"
                        >
                          @{act.user.username}
                        </button>

                        {/* Event Action Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.color}`}
                        >
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>
                      </div>

                      <span className="text-[11px] text-zinc-400 font-mono flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        {formatRelativeTime(act.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Direct Message button for other users */}
                  {dbUser && act.user.id !== dbUser.id && (
                    <button
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent('open_chat', {
                            detail: {
                              id: act.user.id,
                              username: act.user.username,
                              avatar: act.user.avatar,
                            },
                          })
                        )
                      }
                      className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-purple-900/40 text-zinc-400 hover:text-purple-300 border border-zinc-700/60 transition-colors shrink-0"
                      title="Написать сообщение"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Event Details Content */}

                {/* 1. Media Event Card */}
                {act.media && (
                  <div
                    onClick={() =>
                      navigate(`/media/${formatMediaTypePath(act.media!.type || 'MOVIE')}/${act.media!.id}`)
                    }
                    className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex gap-3.5 items-center cursor-pointer hover:border-purple-500/50 hover:bg-zinc-950 transition-all group/media"
                  >
                    {act.media.posterUrl ? (
                      <img
                        src={act.media.posterUrl}
                        alt={act.media.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-16 object-cover rounded-lg shrink-0 shadow-md ring-1 ring-zinc-800 group-hover/media:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-12 h-16 bg-zinc-900 rounded-lg flex items-center justify-center text-zinc-400 shrink-0 border border-zinc-800">
                        {getMediaIcon(act.media.type)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-zinc-100 line-clamp-1 group-hover/media:text-purple-300 transition-colors">
                          {act.media.title}
                        </h4>
                        {act.media.year && (
                          <span className="text-[11px] text-zinc-400 font-mono">({act.media.year})</span>
                        )}
                      </div>

                      {act.media.originalTitle && act.media.originalTitle !== act.media.title && (
                        <p className="text-[11px] text-zinc-400 line-clamp-1">
                          {act.media.originalTitle}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-0.5">
                        <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                          {act.media.type}
                        </span>

                        {act.type === 'MEDIA_RATED' && act.details && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {act.details}
                          </span>
                        )}

                        {act.media.rating && act.type !== 'MEDIA_RATED' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400">
                            <Star className="w-2.5 h-2.5 fill-amber-400" />
                            {act.media.rating}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Review Content (if REVIEW_ADDED) */}
                {act.type === 'REVIEW_ADDED' && act.parsedDetails && (
                  <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-900/40 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      {act.parsedDetails.title && (
                        <h5 className="text-xs font-bold text-purple-200">
                          «{act.parsedDetails.title}»
                        </h5>
                      )}
                      {act.parsedDetails.rating && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 shrink-0">
                          <Star className="w-3 h-3 fill-amber-400" />
                          {act.parsedDetails.rating}/10
                        </span>
                      )}
                    </div>
                    {act.parsedDetails.snippet && (
                      <p className="text-xs text-zinc-300 italic leading-relaxed line-clamp-3">
                        "{act.parsedDetails.snippet}"
                      </p>
                    )}
                  </div>
                )}

                {/* 3. List Event Card */}
                {act.list && (
                  <div
                    onClick={() => navigate(`/lists/${act.list!.id}`)}
                    className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex gap-3.5 items-center cursor-pointer hover:border-cyan-500/50 hover:bg-zinc-950 transition-all"
                  >
                    <div className="w-12 h-14 bg-cyan-950/40 border border-cyan-800/40 rounded-lg flex items-center justify-center text-cyan-400 shrink-0">
                      <ListPlus className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-zinc-100 hover:text-cyan-300 transition-colors line-clamp-1">
                        {act.list.title}
                      </h4>
                      {act.list.category && (
                        <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/30">
                          {act.list.category}
                        </span>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-cyan-400 transition-colors" />
                  </div>
                )}

                {/* 4. Tier List Event Card */}
                {act.tierList && (
                  <div
                    onClick={() => navigate(`/tier-lists/${act.tierList!.id}`)}
                    className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex gap-3.5 items-center cursor-pointer hover:border-indigo-500/50 hover:bg-zinc-950 transition-all"
                  >
                    <div className="w-12 h-14 bg-indigo-950/40 border border-indigo-800/40 rounded-lg flex items-center justify-center text-indigo-400 shrink-0">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-zinc-100 hover:text-indigo-300 transition-colors line-clamp-1">
                        {act.tierList.title}
                      </h4>
                      {act.tierList.category && (
                        <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/30">
                          {act.tierList.category}
                        </span>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-indigo-400 transition-colors" />
                  </div>
                )}

                {/* 5. Achievement Event Card */}
                {act.type === 'ACHIEVEMENT_UNLOCKED' && act.parsedDetails && (
                  <div
                    onClick={() => navigate('/achievements')}
                    className="p-3.5 rounded-xl bg-gradient-to-r from-yellow-950/30 via-zinc-950 to-zinc-950 border border-yellow-800/40 flex gap-3.5 items-center cursor-pointer hover:border-yellow-600 transition-all"
                  >
                    <div className="w-11 h-11 rounded-xl bg-yellow-900/40 border border-yellow-700/50 flex items-center justify-center text-yellow-400 shrink-0 shadow-inner">
                      <Trophy className="w-5 h-5 fill-yellow-400/20" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-yellow-200">
                          {act.parsedDetails.title}
                        </h4>
                        {act.parsedDetails.points && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-yellow-950 text-yellow-400 border border-yellow-800/40">
                            +{act.parsedDetails.points} XP
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 line-clamp-2">
                        {act.parsedDetails.description}
                      </p>
                    </div>
                  </div>
                )}

                {/* 6. Friend Added Event */}
                {act.type === 'FRIEND_ADDED' && act.parsedDetails && (
                  <div
                    onClick={() =>
                      act.parsedDetails.friendUsername &&
                      navigate(`/u/${act.parsedDetails.friendUsername}`)
                    }
                    className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex gap-3 items-center cursor-pointer hover:border-teal-500/40 transition-all"
                  >
                    <div className="w-9 h-9 rounded-full bg-teal-950 border border-teal-800/40 flex items-center justify-center text-teal-300 font-bold text-xs">
                      {act.parsedDetails.friendUsername?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <p className="text-xs text-zinc-200">
                        Подружились с{' '}
                        <strong className="text-teal-300 hover:underline">
                          @{act.parsedDetails.friendUsername}
                        </strong>
                      </p>
                    </div>
                  </div>
                )}

                {/* Event Actions Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    {/* Like Button */}
                    <button
                      onClick={() => toggleLike(act.id, act.userLiked)}
                      className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg border transition-all text-xs font-medium ${
                        act.userLiked
                          ? 'bg-red-950/50 text-red-400 border-red-800/50 shadow-sm'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800/50'
                      }`}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          act.userLiked ? 'fill-red-400 text-red-400' : 'text-zinc-400'
                        }`}
                      />
                      <span>{act.likesCount || 0}</span>
                    </button>

                    {/* Comments Toggle Button */}
                    <button
                      onClick={() => toggleCommentsSection(act.id)}
                      className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg border transition-all text-xs font-medium ${
                        isCommentsOpen
                          ? 'bg-purple-950/50 text-purple-300 border-purple-800/50'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800/50'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{act.commentsCount || 0}</span>
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
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 transition-colors"
                    title="Скопировать ссылку"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Inline Comments Section */}
                {isCommentsOpen && (
                  <div className="pt-3 border-t border-zinc-800/80 space-y-3">
                    {/* List of comments */}
                    {commentsList.length > 0 ? (
                      <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                        {commentsList.map((c) => {
                          const isOwnComment = dbUser?.id === c.userId;
                          const canDelete =
                            isOwnComment ||
                            ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(dbUser?.role || '');

                          return (
                            <div
                              key={c.id}
                              className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800/70 flex gap-2.5 items-start text-xs group/comment"
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
                                  <div className="w-6 h-6 rounded-full bg-purple-900/60 flex items-center justify-center text-[10px] font-bold text-purple-200">
                                    {c.username.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    onClick={() => navigate(`/u/${c.username}`)}
                                    className="font-bold text-zinc-200 hover:text-purple-300 cursor-pointer"
                                  >
                                    @{c.username}
                                  </span>
                                  <span className="text-[10px] text-zinc-400 font-mono">
                                    {formatRelativeTime(c.createdAt)}
                                  </span>
                                </div>
                                <p className="text-zinc-300 text-xs break-words leading-relaxed">
                                  {c.content}
                                </p>
                              </div>

                              {canDelete && (
                                <button
                                  onClick={() => handleDeleteComment(act.id, c.id)}
                                  className="opacity-0 group-hover/comment:opacity-100 p-1 text-zinc-400 hover:text-red-400 transition-opacity"
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
                      <p className="text-xs text-zinc-400 text-center py-2 italic">
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
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                        <button
                          onClick={() => handleSendComment(act.id)}
                          disabled={
                            !(commentInputs[act.id] || '').trim() || submittingComment[act.id]
                          }
                          className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white transition-colors"
                          title="Отправить"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400 text-center pt-1">
                        <button
                          onClick={() => navigate('/login')}
                          className="text-purple-400 hover:underline font-semibold"
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
        <div className="py-16 px-6 text-center space-y-4 bg-zinc-900/40 rounded-2xl border border-zinc-800/80 max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-purple-950/50 border border-purple-800/40 flex items-center justify-center mx-auto text-purple-400 shadow-inner">
            {tab === 'friends' ? (
              <Users className="w-7 h-7" />
            ) : tab === 'my' ? (
              <User className="w-7 h-7" />
            ) : (
              <Radio className="w-7 h-7" />
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-bold text-zinc-100">
              {tab === 'friends'
                ? 'В ленте друзей пока пусто'
                : tab === 'my'
                ? 'Вы ещё не совершали действий'
                : 'Событий пока не найдено'}
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
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
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors shadow-md shadow-purple-900/20"
              >
                <UserPlus className="w-4 h-4" />
                <span>Найти пользователей</span>
              </button>
            )}

            <button
              onClick={() => navigate('/movies')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors"
            >
              <Film className="w-4 h-4 text-purple-400" />
              <span>Каталог медиа</span>
            </button>

            <button
              onClick={() => navigate('/lists')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors"
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
