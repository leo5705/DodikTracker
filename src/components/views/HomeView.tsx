import React, { useState, useEffect } from 'react';
import {
  Play,
  Flame,
  Radio,
  Dice5,
  Sparkles,
  ArrowRight,
  Plus,
  Star,
  Film,
  Tv,
  Gamepad2,
  Book,
  BookOpen,
  Newspaper,
  Calendar,
  User,
  Pin,
  Eye,
  CheckCircle2,
  Clock,
  Trophy,
  Users,
  Search,
  MessageSquare,
  Bell,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  BookmarkPlus,
  Award,
  Layers,
  Activity,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AddToLibraryModal } from '../modals/AddToLibraryModal.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { formatMediaTypePath, formatDuration } from '../../utils/formatters.ts';
import {
  SectionHeader,
  MediaCard,
  PrimaryButton,
  SecondaryButton,
  CategoryBadge,
  RatingBadge,
  StatusBadge,
  Avatar,
  ActivityTimelineItem,
  NewsCard,
  ActivityItemSkeleton,
  NewsCardSkeleton,
} from '../design-system/index.ts';

interface HomeViewProps {
  onNavigate: (tab: any) => void;
}

function formatTimeAgo(dateStr?: string | Date | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const past = new Date(dateStr).getTime();
  const diffSec = Math.max(0, Math.floor((now - past) / 1000));
  if (diffSec < 60) return 'только что';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} дн назад`;
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const { dbUser, counts, authFetch } = useAuth();
  const { navigate } = useRouter();

  // State
  const [inProgress, setInProgress] = useState<any[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [recCategory, setRecCategory] = useState<'ALL' | 'MOVIE' | 'GAME' | 'ANIME'>('ALL');
  const [friendsFeed, setFriendsFeed] = useState<any[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [userFeed, setUserFeed] = useState<any[]>([]);
  const [achievementsData, setAchievementsData] = useState<{
    stats: { total: number; unlocked: number; points: number; percentage: number };
    latestUnlocked?: any;
    nextLocked?: any;
  } | null>(null);
  const [friendsOnline, setFriendsOnline] = useState<any[]>([]);
  const [latestNews, setLatestNews] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [spotlightItem, setSpotlightItem] = useState<any | null>(null);
  const [modalItem, setModalItem] = useState<any | null>(null);
  const [quickSearchInput, setQuickSearchInput] = useState('');
  const [updatingProgressId, setUpdatingProgressId] = useState<number | null>(null);
  const [upcomingReleases, setUpcomingReleases] = useState<any[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);

  // Quick search submit
  const handleQuickSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickSearchInput.trim()) {
      navigate(`/search?q=${encodeURIComponent(quickSearchInput.trim())}`);
    } else {
      navigate('/search');
    }
  };

  // Fetch In-Progress Media (WATCHING, PLAYING, READING)
  const fetchInProgress = async () => {
    if (!dbUser) return;
    try {
      const res = await authFetch('/api/library');
      if (res.ok) {
        const data = await res.json();
        const active = data.filter((item: any) =>
          ['WATCHING', 'PLAYING', 'READING', 'PLAN_TO_WATCH', 'PLAN_TO_PLAY', 'PLAN_TO_READ'].includes(item.status)
        );
        // Prioritize strictly active ones
        const strictlyActive = active.filter((item: any) =>
          ['WATCHING', 'PLAYING', 'READING'].includes(item.status)
        );
        const finalItems = strictlyActive.length > 0 ? strictlyActive : active.slice(0, 6);
        setInProgress(finalItems);
      }
    } catch (_err) {}
  };

  // Quick +1 progress update
  const handleIncrementProgress = async (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dbUser || !item.userMediaId) return;
    const nextProg = (item.progress || 0) + 1;
    setUpdatingProgressId(item.userMediaId);
    try {
      const res = await authFetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: item.mediaId || item.id,
          progress: nextProg,
          status: item.status || 'WATCHING',
        }),
      });
      if (res.ok) {
        setInProgress((prev) =>
          prev.map((it) => (it.userMediaId === item.userMediaId ? { ...it, progress: nextProg } : it))
        );
      }
    } catch (_err) {
    } finally {
      setUpdatingProgressId(null);
    }
  };

  // Fetch Recommendations / Trending
  const fetchRecommendations = async (type: string = 'ALL') => {
    try {
      const endpoint =
        type === 'ALL'
          ? '/api/media/trending?type=MOVIE'
          : `/api/media/trending?type=${type}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.results || [];
        setRecommendations(items.slice(0, 6));
        if (items.length > 0 && !spotlightItem) {
          setSpotlightItem(items[0]);
        }
      }
    } catch (_err) {}
  };

  // Fetch Feed (Friends & Community)
  const fetchFeeds = async () => {
    setFeedLoading(true);
    try {
      // 1. Social friends feed
      const resFriends = await authFetch('/api/feed?tab=friends&limit=8');
      if (resFriends.ok) {
        const data = await resFriends.json();
        const items = data.activities || (Array.isArray(data) ? data : []);
        if (items.length > 0) {
          setFriendsFeed(items.slice(0, 8));
        } else {
          // Fallback to all feed if not authenticated or no friends
          const resAll = await fetch('/api/feed?tab=all&limit=8');
          if (resAll.ok) {
            const dataAll = await resAll.json();
            const itemsAll = dataAll.activities || (Array.isArray(dataAll) ? dataAll : []);
            setFriendsFeed(itemsAll.slice(0, 8));
          }
        }
      } else {
        const resAll = await fetch('/api/feed?tab=all&limit=8');
        if (resAll.ok) {
          const dataAll = await resAll.json();
          const itemsAll = dataAll.activities || (Array.isArray(dataAll) ? dataAll : []);
          setFriendsFeed(itemsAll.slice(0, 8));
        }
      }
    } catch (_err) {
      setFriendsFeed([]);
    } finally {
      setFeedLoading(false);
    }

    // 2. User personal activity
    if (dbUser) {
      try {
        const resUser = await authFetch('/api/feed?tab=my&limit=5');
        if (resUser.ok) {
          const dataUser = await resUser.json();
          const itemsUser = dataUser.activities || (Array.isArray(dataUser) ? dataUser : []);
          setUserFeed(itemsUser.slice(0, 5));
        }
      } catch (_err) {}
    }
  };

  // Fetch Achievements
  const fetchAchievements = async () => {
    try {
      const res = await authFetch('/api/achievements');
      if (res.ok) {
        const data = await res.json();
        const unlockedList = (data.achievements || []).filter((a: any) => a.isUnlocked);
        const lockedList = (data.achievements || []).filter((a: any) => !a.isUnlocked && !a.isSecret);
        setAchievementsData({
          stats: data.stats || { total: 0, unlocked: 0, points: 0, percentage: 0 },
          latestUnlocked: unlockedList.length > 0 ? unlockedList[unlockedList.length - 1] : null,
          nextLocked: lockedList.length > 0 ? lockedList[0] : null,
        });
      }
    } catch (_err) {}
  };

  // Fetch Friends List (Online presence)
  const fetchFriends = async () => {
    if (!dbUser) return;
    try {
      const res = await authFetch('/api/friends');
      if (res.ok) {
        const data = await res.json();
        setFriendsOnline(Array.isArray(data) ? data.slice(0, 5) : []);
      }
    } catch (_err) {}
  };

  // Fetch News
  const fetchNews = async () => {
    setNewsLoading(true);
    try {
      const res = await fetch('/api/news?limit=3');
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.items || [];
        setLatestNews(items.slice(0, 3));
      }
    } catch (_err) {
      setLatestNews([]);
    } finally {
      setNewsLoading(false);
    }
  };

  const fetchUpcomingReleases = async () => {
    try {
      setUpcomingLoading(true);
      let res: Response | null = null;
      try {
        res = await authFetch('/api/releases?scope=upcoming&limit=6');
      } catch (_e) {
        res = await fetch('/api/releases?scope=upcoming&limit=6');
      }
      if (res && res.ok) {
        const data = await res.json();
        const items = data.releases || data.items || (Array.isArray(data) ? data : []);
        setUpcomingReleases(items.slice(0, 6));
      }
    } catch (_err) {
      setUpcomingReleases([]);
    } finally {
      setUpcomingLoading(false);
    }
  };

  useEffect(() => {
    fetchInProgress();
    fetchRecommendations(recCategory);
    fetchFeeds();
    fetchAchievements();
    fetchFriends();
    fetchNews();
    fetchUpcomingReleases();
  }, [dbUser]);

  useEffect(() => {
    fetchRecommendations(recCategory);
  }, [recCategory]);

  // Determine current active hero item
  const activeHeroItem =
    inProgress.length > 0 ? inProgress[heroIndex % inProgress.length] : spotlightItem;

  const handleHeroNavigate = (item: any) => {
    if (!item) return;
    const id = item.mediaId || item.id;
    const type = item.type || 'MOVIE';
    navigate(`/media/${formatMediaTypePath(type)}/${id}`);
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-16">
      {/* 1. TOP DASHBOARD GREETING & QUICK BAR */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#8B5CF6]/5 rounded-full blur-3xl pointer-events-none" />

        {/* User Greeting & Status Info */}
        <div className="flex items-center gap-3.5 min-w-0">
          {dbUser ? (
            <div
              onClick={() => navigate(`/u/${dbUser.username}`)}
              className="relative cursor-pointer group shrink-0"
            >
              <Avatar src={dbUser.avatar} username={dbUser.username} size="md" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0B0D20]" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] flex items-center justify-center text-white shrink-0 shadow-md shadow-[#7C3AED]/20">
              <Sparkles className="w-5 h-5" />
            </div>
          )}

          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-black text-[#F8FAFC] truncate tracking-tight">
                {dbUser ? `Привет, ${dbUser.username}!` : 'Добро пожаловать в Dodik Tracker'}
              </h1>
              {achievementsData?.stats && (
                <span className="px-2 py-0.5 rounded-full bg-[#151932] border border-[#8B5CF6]/30 text-[11px] font-bold text-[#A78BFA] font-mono tabular-nums flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-[#A78BFA]" />
                  {achievementsData.stats.points} PTS
                </span>
              )}
            </div>
            <p className="text-xs text-[#94A3B8] truncate">
              {dbUser
                ? 'Твой персональный медиа-дашборд готов к работе'
                : 'Сохраняйте, оценивайте и исследуйте фильмы, игры, аниме и книги'}
            </p>
          </div>
        </div>

        {/* Center/Right Global Quick Search & Quick Actions */}
        <div className="flex items-center gap-2.5 flex-1 lg:max-w-xl">
          <form onSubmit={handleQuickSearchSubmit} className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#64748B]" />
            <input
              type="text"
              value={quickSearchInput}
              onChange={(e) => setQuickSearchInput(e.target.value)}
              placeholder="Поиск по названию, жанру или персоне..."
              className="w-full h-11 pl-10 pr-24 rounded-xl bg-[#080A18] hover:bg-[#11152A] focus:bg-[#080A18] text-sm text-[#F8FAFC] placeholder-[#64748B] border border-[#1E2442] focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#8B5CF6]/40 transition-all outline-none"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-[#151932] hover:bg-[#7C3AED] text-xs font-semibold text-[#CBD5E1] hover:text-white transition-colors cursor-pointer border border-[#1E2442]"
            >
              Найти
            </button>
          </form>

          {/* Quick Roulette trigger */}
          <button
            onClick={() => onNavigate('roulette')}
            className="hidden sm:flex items-center gap-2 h-11 px-4 rounded-xl bg-[#151932] hover:bg-[#191D38] border border-[#1E2442] hover:border-[#8B5CF6]/40 text-xs sm:text-sm font-semibold text-[#A78BFA] hover:text-white transition-all cursor-pointer shrink-0"
            title="Случайный выбор"
          >
            <Dice5 className="w-4.5 h-4.5 text-[#8B5CF6]" />
            <span className="hidden md:inline">Рулетка</span>
          </button>
        </div>
      </div>

      {/* 2. HERO / CONTINUE SECTION (25-30% screen height, compact & atmospheric) */}
      {activeHeroItem && (
        <div className="relative rounded-3xl overflow-hidden bg-[#0B0D20] border border-[#1E2442] shadow-2xl group min-h-[260px] sm:min-h-[290px] flex flex-col justify-end">
          {/* Backdrop Image with gradient overlay */}
          {activeHeroItem.backdropUrl || activeHeroItem.posterUrl ? (
            <div className="absolute inset-0 z-0 overflow-hidden">
              <img
                src={activeHeroItem.backdropUrl || activeHeroItem.posterUrl}
                alt={activeHeroItem.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center filter brightness-60 scale-105 group-hover:scale-100 transition-transform duration-700 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#080A18] via-[#080A18]/85 via-55% to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#080A18] via-[#080A18]/70 to-transparent" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#151932] via-[#11152A] to-[#080A18]" />
          )}

          {/* Carousel Selector Controls (if multiple in-progress items) */}
          {inProgress.length > 1 && (
            <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-[#080A18]/80 backdrop-blur-md px-2.5 py-1 rounded-xl border border-[#1E2442] text-[11px] font-mono text-[#94A3B8]">
              <button
                onClick={() =>
                  setHeroIndex((prev) => (prev - 1 + inProgress.length) % inProgress.length)
                }
                className="p-1 hover:text-[#F8FAFC] transition-colors cursor-pointer"
                title="Предыдущий тайтл"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="tabular-nums font-semibold text-[#A78BFA]">
                {heroIndex + 1} / {inProgress.length}
              </span>
              <button
                onClick={() => setHeroIndex((prev) => (prev + 1) % inProgress.length)}
                className="p-1 hover:text-[#F8FAFC] transition-colors cursor-pointer"
                title="Следующий тайтл"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Hero Content Body */}
          <div className="relative z-10 p-5 sm:p-6 lg:p-7 flex flex-col sm:flex-row items-start sm:items-end gap-5">
            {/* Poster Thumbnail */}
            <div
              onClick={() => handleHeroNavigate(activeHeroItem)}
              className="w-20 sm:w-28 md:w-32 aspect-[2/3] rounded-2xl overflow-hidden bg-[#11152A] border-2 border-[#1E2442] shadow-2xl shrink-0 cursor-pointer group-hover:border-[#8B5CF6]/50 transition-colors"
            >
              {activeHeroItem.posterUrl ? (
                <img
                  src={activeHeroItem.posterUrl}
                  alt={activeHeroItem.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#64748B]">
                  <Film className="w-8 h-8" />
                </div>
              )}
            </div>

            {/* Title & Metadata */}
            <div className="space-y-3 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CategoryBadge type={activeHeroItem.type || 'MOVIE'} size="sm" />
                {activeHeroItem.status ? (
                  <StatusBadge status={activeHeroItem.status} size="sm" />
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-[#151932] text-[#A78BFA] border border-[#8B5CF6]/30 text-[11px] font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#A78BFA]" /> Рекомендация
                  </span>
                )}
                {activeHeroItem.year && (
                  <span className="text-xs text-[#94A3B8] font-mono tabular-nums">
                    {activeHeroItem.year}
                  </span>
                )}
                {activeHeroItem.rating && (
                  <RatingBadge rating={activeHeroItem.rating} size="sm" />
                )}
              </div>

              <h2
                onClick={() => handleHeroNavigate(activeHeroItem)}
                className="text-xl sm:text-2xl lg:text-3xl font-black text-[#F8FAFC] tracking-tight hover:text-[#A78BFA] transition-colors cursor-pointer line-clamp-1"
              >
                {activeHeroItem.title}
              </h2>

              {activeHeroItem.description && (
                <p className="text-xs sm:text-sm text-[#94A3B8] line-clamp-2 max-w-2xl leading-relaxed">
                  {activeHeroItem.description}
                </p>
              )}

              {/* Progress Bar (if in-progress) */}
              {activeHeroItem.progress !== undefined && (
                <div className="space-y-1.5 max-w-md pt-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#94A3B8]">
                    <span>Прогресс:</span>
                    <span className="text-[#A78BFA] font-bold tabular-nums">
                      {activeHeroItem.progress} {activeHeroItem.totalEpisodes ? `/ ${activeHeroItem.totalEpisodes}` : 'серий / глав'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#151932] overflow-hidden border border-[#1E2442]">
                    <div
                      className="h-full bg-gradient-to-r from-[#7C3AED] to-[#6366F1] rounded-full transition-all duration-300"
                      style={{
                        width: activeHeroItem.totalEpisodes
                          ? `${Math.min(100, Math.round((activeHeroItem.progress / activeHeroItem.totalEpisodes) * 100))}%`
                          : '40%',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <PrimaryButton
                  onClick={() => handleHeroNavigate(activeHeroItem)}
                  size="sm"
                  icon={<Play className="w-3.5 h-3.5 fill-white" />}
                >
                  Продолжить
                </PrimaryButton>

                {activeHeroItem.userMediaId ? (
                  <>
                    <SecondaryButton
                      onClick={(e) => handleIncrementProgress(activeHeroItem, e)}
                      size="sm"
                      disabled={updatingProgressId === activeHeroItem.userMediaId}
                      icon={<Plus className="w-3.5 h-3.5 text-[#A78BFA]" />}
                    >
                      +1 прогресс
                    </SecondaryButton>
                    <SecondaryButton
                      onClick={() => setModalItem(activeHeroItem)}
                      size="sm"
                    >
                      Изменить статус
                    </SecondaryButton>
                  </>
                ) : (
                  <SecondaryButton
                    onClick={() => setModalItem(activeHeroItem)}
                    size="sm"
                    icon={<BookmarkPlus className="w-3.5 h-3.5 text-[#A78BFA]" />}
                  >
                    В библиотеку
                  </SecondaryButton>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. «ПРОДОЛЖИТЬ» (Horizontal In-Progress Shelf) */}
      {dbUser && inProgress.length > 0 && (
        <div className="space-y-3.5">
          <SectionHeader
            title="Продолжить"
            icon={<Play className="w-4 h-4 text-[#8B5CF6] fill-[#8B5CF6]" />}
            actionText="Вся библиотека"
            onAction={() => onNavigate('library')}
            count={inProgress.length}
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-5">
            {inProgress.map((item) => (
              <div
                key={item.userMediaId || item.id}
                onClick={() => handleHeroNavigate(item)}
                className="group relative flex flex-col justify-between p-3 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 transition-all duration-200 cursor-pointer hover:-translate-y-1 shadow-lg"
              >
                {/* Poster */}
                <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-[#11152A] mb-2">
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#64748B]">
                      <Film className="w-6 h-6" />
                    </div>
                  )}

                  {/* Badges */}
                  <div className="absolute top-1.5 left-1.5">
                    <CategoryBadge type={item.type || 'MOVIE'} size="sm" />
                  </div>

                  {item.rating && (
                    <div className="absolute bottom-1.5 right-1.5">
                      <RatingBadge rating={item.rating} size="sm" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-1.5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-xs text-[#F8FAFC] group-hover:text-[#A78BFA] transition-colors line-clamp-1">
                      {item.title}
                    </h3>
                    <div className="flex items-center justify-between text-[10px] text-[#94A3B8] font-mono mt-0.5">
                      <StatusBadge status={item.status} size="sm" />
                      {item.progress !== undefined && (
                        <span className="tabular-nums font-semibold text-[#CBD5E1]">
                          {item.progress} {item.totalEpisodes ? `/${item.totalEpisodes}` : 'пр.'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar + Quick Action */}
                  <div className="pt-1.5 flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 rounded-full bg-[#151932] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#7C3AED] to-[#6366F1] rounded-full"
                        style={{
                          width: item.totalEpisodes
                            ? `${Math.min(100, Math.round((item.progress / item.totalEpisodes) * 100))}%`
                            : '50%',
                        }}
                      />
                    </div>
                    <button
                      onClick={(e) => handleIncrementProgress(item, e)}
                      disabled={updatingProgressId === item.userMediaId}
                      className="p-1 rounded-md bg-[#151932] hover:bg-[#7C3AED] text-[#A78BFA] hover:text-white border border-[#1E2442] text-[10px] font-bold transition-colors cursor-pointer"
                      title="Увеличить прогресс на 1"
                    >
                      +1
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. «РЕКОМЕНДАЦИИ ДЛЯ ТЕБЯ» (5-7 visually rich cards) */}
      <div className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <SectionHeader
            title="Рекомендации для тебя"
            icon={<Sparkles className="w-4 h-4 text-[#8B5CF6]" />}
            className="!mb-0"
          />

          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0B0D20] border border-[#1E2442] overflow-x-auto">
            {[
              { id: 'ALL', label: 'Все' },
              { id: 'MOVIE', label: 'Фильмы' },
              { id: 'GAME', label: 'Игры' },
              { id: 'ANIME', label: 'Аниме' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setRecCategory(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  recCategory === tab.id
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-sm'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {recommendations.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-5">
            {recommendations.map((item, idx) => (
              <MediaCard
                key={item.mediaId || item.id || idx}
                media={{
                  id: item.mediaId || item.id,
                  title: item.title,
                  type: item.type || (recCategory === 'ALL' ? 'MOVIE' : recCategory),
                  posterUrl: item.posterUrl,
                  year: item.year,
                  rating: item.rating,
                }}
                showQuickActions={true}
                onQuickAdd={(m) => setModalItem(m)}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-[#0B0D20] border border-[#1E2442] text-center text-xs text-[#94A3B8]">
            Подбор персональных рекомендаций...
          </div>
        )}
      </div>

      {/* 5. 2-COLUMN SECTION: SOCIAL ACTIVITY FEED (65%) & EDITORIAL NEWS (35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: «ЛЕНТА АКТИВНОСТИ» (8 cols ~ 65%) */}
        <div className="lg:col-span-8 space-y-3.5">
          <SectionHeader
            title="Лента активности"
            icon={<Radio className="w-4 h-4 text-[#8B5CF6]" />}
            actionText="Вся лента →"
            onAction={() => onNavigate('feed')}
          />

          <div className="p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] shadow-xl">
            {feedLoading ? (
              <div className="space-y-1 divide-y divide-[#1E2442]/60">
                {[1, 2, 3, 4].map((i) => (
                  <ActivityItemSkeleton key={i} />
                ))}
              </div>
            ) : friendsFeed.length > 0 ? (
              <div className="space-y-1 divide-y divide-[#1E2442]/50">
                {friendsFeed.slice(0, 7).map((act, index) => (
                  <ActivityTimelineItem
                    key={act.id || index}
                    activity={act}
                    isLast={index === Math.min(friendsFeed.length, 7) - 1}
                    onUserClick={(uname) => navigate(`/u/${uname}`)}
                    onMediaClick={(type, id) =>
                      navigate(`/media/${formatMediaTypePath(type)}/${id}`)
                    }
                    onListClick={(id) => navigate(`/lists/${id}`)}
                    onAchievementClick={() => onNavigate('achievements')}
                  />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center space-y-2">
                <Users className="w-7 h-7 text-[#64748B] mx-auto" />
                <p className="text-xs text-[#94A3B8]">Пока нет активности друзей</p>
                <button
                  type="button"
                  onClick={() => onNavigate('friends')}
                  className="text-xs font-semibold text-[#A78BFA] hover:text-white transition-colors cursor-pointer"
                >
                  Найти друзей →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: «НОВОСТИ» (4 cols ~ 35%) */}
        <div className="lg:col-span-4 space-y-3.5">
          <SectionHeader
            title="Новости"
            icon={<Newspaper className="w-4 h-4 text-[#8B5CF6]" />}
            actionText="Все новости →"
            onAction={() => navigate('/news')}
          />

          {newsLoading ? (
            <div className="space-y-3.5">
              {[1, 2].map((i) => (
                <NewsCardSkeleton key={i} />
              ))}
            </div>
          ) : latestNews.length > 0 ? (
            <div className="space-y-3.5">
              {latestNews.slice(0, 3).map((art) => {
                let parsedCategory = 'Новости';
                if (art.tags) {
                  if (Array.isArray(art.tags) && art.tags.length > 0) {
                    parsedCategory = art.tags[0];
                  } else if (typeof art.tags === 'string' && art.tags.startsWith('[')) {
                    try {
                      const arr = JSON.parse(art.tags);
                      if (Array.isArray(arr) && arr.length > 0) parsedCategory = arr[0];
                    } catch (_e) {}
                  }
                }

                return (
                  <NewsCard
                    key={art.id}
                    image={art.cover}
                    title={art.title}
                    excerpt={
                      art.excerpt ||
                      (art.content
                        ? art.content.replace(/[#*`_>]/g, '').slice(0, 85) + '...'
                        : '')
                    }
                    category={parsedCategory}
                    date={art.publishedAt || art.createdAt}
                    authorUsername={art.authorUsername}
                    isPinned={art.isPinned}
                    isFeatured={art.isFeatured}
                    onClick={() => navigate(`/news/${art.slug || art.id}`)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-[#0B0D20] border border-[#1E2442] text-center text-xs text-[#94A3B8]">
              Пока нет новых публикаций
            </div>
          )}
        </div>
      </div>

      {/* 6. «СТАТИСТИКА» (5 Compact Dashboard Widgets with Real Data) */}
      <div className="space-y-3.5">
        <SectionHeader
          title="Твоя статистика"
          icon={<TrendingUp className="w-4 h-4 text-[#8B5CF6]" />}
          actionText="Полная статистика"
          onAction={() => onNavigate('statistics')}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Movies */}
          <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-2 hover:border-[#8B5CF6]/40 transition-colors">
            <div className="flex items-center justify-between text-[#94A3B8]">
              <span className="text-xs font-semibold">Фильмы</span>
              <Film className="w-4 h-4 text-[#8B5CF6]" />
            </div>
            <div className="text-2xl font-bold text-[#F8FAFC] font-mono tabular-nums">
              {counts?.movies || 0}
            </div>
            <p className="text-[10px] text-[#64748B]">В коллекции</p>
          </div>

          {/* TV Shows */}
          <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-2 hover:border-[#8B5CF6]/40 transition-colors">
            <div className="flex items-center justify-between text-[#94A3B8]">
              <span className="text-xs font-semibold">Сериалы</span>
              <Tv className="w-4 h-4 text-[#8B5CF6]" />
            </div>
            <div className="text-2xl font-bold text-[#F8FAFC] font-mono tabular-nums">
              {counts?.tv || 0}
            </div>
            <p className="text-[10px] text-[#64748B]">В библиотеке</p>
          </div>

          {/* Games */}
          <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-2 hover:border-[#8B5CF6]/40 transition-colors">
            <div className="flex items-center justify-between text-[#94A3B8]">
              <span className="text-xs font-semibold">Игры</span>
              <Gamepad2 className="w-4 h-4 text-[#8B5CF6]" />
            </div>
            <div className="text-2xl font-bold text-[#F8FAFC] font-mono tabular-nums">
              {counts?.games || 0}
            </div>
            <p className="text-[10px] text-[#64748B]">В трекере</p>
          </div>

          {/* Anime & Manga */}
          <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-2 hover:border-[#8B5CF6]/40 transition-colors">
            <div className="flex items-center justify-between text-[#94A3B8]">
              <span className="text-xs font-semibold">Аниме & Манга</span>
              <BookOpen className="w-4 h-4 text-[#8B5CF6]" />
            </div>
            <div className="text-2xl font-bold text-[#F8FAFC] font-mono tabular-nums">
              {(counts?.anime || 0) + (counts?.manga || 0)}
            </div>
            <p className="text-[10px] text-[#64748B]">Тайтлов</p>
          </div>

          {/* Completed Total */}
          <div className="col-span-2 sm:col-span-1 p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-2 hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center justify-between text-emerald-400">
              <span className="text-xs font-semibold">Завершено</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
              {counts?.completed || 0}
            </div>
            <p className="text-[10px] text-[#64748B]">Пройдено & просмотрено</p>
          </div>
        </div>
      </div>

      {/* 7. «ПРЕДСТОЯЩИЕ РЕЛИЗЫ» */}
      <div className="space-y-3.5">
        <SectionHeader
          title="Предстоящие релизы"
          icon={<Calendar className="w-4 h-4 text-[#8B5CF6]" />}
          actionText="Календарь релизов"
          onAction={() => onNavigate('calendar')}
        />

        {upcomingLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="aspect-[2/3] rounded-2xl bg-[#0B0D20] border border-[#1E2442] animate-pulse"
              />
            ))}
          </div>
        ) : upcomingReleases.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {upcomingReleases.map((rel, idx) => {
              const relDate = rel.releaseDate ? new Date(rel.releaseDate) : null;
              const formattedDate = relDate
                ? relDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                : '';
              const daysLeft = relDate
                ? Math.ceil((relDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null;

              return (
                <div key={rel.id || rel.mediaId || idx} className="relative group">
                  <MediaCard
                    media={{
                      id: rel.mediaId || rel.id,
                      title: rel.title,
                      type: rel.type || rel.category || 'MOVIE',
                      posterUrl: rel.posterUrl,
                      year: relDate ? relDate.getFullYear() : undefined,
                      rating: rel.rating,
                    }}
                    showQuickActions={true}
                    onQuickAdd={(m) => setModalItem(m)}
                  />
                  {formattedDate && (
                    <div className="absolute top-3 left-3 px-2 py-0.5 rounded-lg bg-[#080A18]/90 backdrop-blur-md border border-[#8B5CF6]/50 text-[10px] font-mono font-bold text-[#A78BFA] shadow-md pointer-events-none z-10 flex items-center gap-1">
                      <span>{formattedDate}</span>
                      {daysLeft !== null && daysLeft > 0 && daysLeft <= 30 && (
                        <span className="text-[#64748B]">({daysLeft} дн.)</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-[#0B0D20] border border-[#1E2442] text-center text-xs text-[#94A3B8]">
            Нет ближайших релизов на этой неделе
          </div>
        )}
      </div>

      {/* 8. 2-COLUMN WIDGETS: «ТВОИ ДОСТИЖЕНИЯ» & «ДРУЗЬЯ ОНЛАЙН» */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: «ТВОИ ДОСТИЖЕНИЯ» WIDGET (6 cols) */}
        <div className="lg:col-span-6 p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#151932] border border-[#8B5CF6]/30 text-[#A78BFA]">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#F8FAFC]">Твои достижения</h3>
                <p className="text-[11px] text-[#94A3B8]">Награды и прогресс профиля</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('achievements')}
              className="text-xs font-semibold text-[#A78BFA] hover:text-white transition-colors cursor-pointer"
            >
              Все →
            </button>
          </div>

          {/* Achievement Progress Bar */}
          {achievementsData?.stats && (
            <div className="space-y-2 p-3 rounded-xl bg-[#080A18] border border-[#1E2442]">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#94A3B8]">Открыто наград:</span>
                <span className="font-bold text-[#F8FAFC] tabular-nums">
                  {achievementsData.stats.unlocked} / {achievementsData.stats.total}{' '}
                  <span className="text-[#A78BFA]">({achievementsData.stats.percentage}%)</span>
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#151932] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#6366F1] rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(4, achievementsData.stats.percentage)}%` }}
                />
              </div>
            </div>
          )}

          {/* Latest Unlocked or Next Target */}
          {achievementsData?.latestUnlocked ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#151932]/50 border border-[#8B5CF6]/30">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] flex items-center justify-center text-white shrink-0 shadow-md">
                <Award className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  Последнее достижение
                </span>
                <h4 className="text-xs font-bold text-[#F8FAFC] truncate">
                  {achievementsData.latestUnlocked.title}
                </h4>
                <p className="text-[11px] text-[#94A3B8] truncate">
                  +{achievementsData.latestUnlocked.points} Dodik PTS
                </p>
              </div>
            </div>
          ) : achievementsData?.nextLocked ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#080A18] border border-[#1E2442]">
              <div className="w-9 h-9 rounded-xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[#64748B] shrink-0">
                <Trophy className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-[#A78BFA] font-bold uppercase tracking-wider">
                  Следующая цель
                </span>
                <h4 className="text-xs font-bold text-[#F8FAFC] truncate">
                  {achievementsData.nextLocked.title}
                </h4>
                <p className="text-[11px] text-[#94A3B8] truncate">
                  {achievementsData.nextLocked.description}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Right: «ОНЛАЙН ДРУЗЬЯ» (6 cols) */}
        <div className="lg:col-span-6 p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#151932] border border-[#8B5CF6]/30 text-[#A78BFA]">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#F8FAFC]">Друзья</h3>
                <p className="text-[11px] text-[#94A3B8]">Быстрые сообщения и статус</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('friends')}
              className="text-xs font-semibold text-[#A78BFA] hover:text-white transition-colors cursor-pointer"
            >
              Все →
            </button>
          </div>

          {friendsOnline.length > 0 ? (
            <div className="space-y-2">
              {friendsOnline.map((fr) => (
                <div
                  key={fr.id}
                  onClick={() => navigate(`/u/${fr.username}`)}
                  className="flex items-center justify-between gap-2.5 p-2 rounded-xl bg-[#080A18] hover:bg-[#151932] border border-[#1E2442] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative">
                      <Avatar src={fr.avatar} username={fr.username} size="sm" />
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#080A18]" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[#F8FAFC] truncate block">
                        @{fr.username}
                      </span>
                      <span className="text-[10px] text-[#64748B] truncate block">
                        {fr.bio || 'В сети'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(
                        new CustomEvent('open_chat', { detail: fr })
                      );
                    }}
                    className="p-1.5 rounded-lg bg-[#151932] hover:bg-[#7C3AED] text-[#A78BFA] hover:text-white transition-colors cursor-pointer"
                    title="Написать сообщение"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center space-y-2">
              <Users className="w-6 h-6 text-[#64748B] mx-auto" />
              <p className="text-xs text-[#94A3B8]">
                {dbUser ? 'У вас пока нет друзей в сети' : 'Войдите, чтобы находить друзей'}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('friends')}
                className="text-xs font-semibold text-[#A78BFA] hover:text-white transition-colors cursor-pointer"
              >
                Перейти в раздел «Друзья» →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal for adding to tracker */}
      {modalItem && (
        <AddToLibraryModal mediaItem={modalItem} onClose={() => setModalItem(null)} />
      )}
    </div>
  );
};
