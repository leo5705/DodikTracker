import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Shield,
  Calendar,
  Lock,
  UserPlus,
  UserCheck,
  Sparkles,
  Star,
  Film,
  Tv,
  Gamepad2,
  Book,
  BookOpen,
  Flame,
  MessageSquare,
  Layers,
  ChevronRight,
  Clock,
  Loader2,
  CheckCircle2,
  Settings,
  Trophy,
  Share2,
  HeartHandshake,
  BarChart2,
  PieChart,
  Grid,
  Filter,
  Search,
  Award,
  Hash,
  Activity,
  ListOrdered,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { formatMediaTypePath } from '../common/MediaCard.tsx';
import { TasteComparisonModal } from '../modals/TasteComparisonModal.tsx';
import { AchievementBadge } from '../achievements/AchievementBadge.tsx';
import { usePresence } from '../../hooks/usePresence.ts';
import { PresenceIndicator } from '../ui/PresenceIndicator.tsx';

interface ProfileViewProps {
  username?: string;
  onNavigateSettings?: () => void;
  onSelectMedia?: (mediaId: number) => void;
  onNavigateUser?: (username: string) => void;
}

type ProfileTab = 'overview' | 'media' | 'lists' | 'tier-lists' | 'achievements' | 'statistics';

export const ProfileView: React.FC<ProfileViewProps> = ({
  username,
  onNavigateSettings,
  onNavigateUser,
}) => {
  const { authFetch, dbUser, login } = useAuth();
  const { navigate, route } = useRouter();
  const targetUsername = username || dbUser?.username;

  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ProfileTab>(() => {
    const rawTab = route.params?.tab;
    if (rawTab && ['overview', 'media', 'lists', 'tier-lists', 'achievements', 'statistics'].includes(rawTab)) {
      return rawTab as ProfileTab;
    }
    if (rawTab === 'library') return 'media';
    return 'overview';
  });

  const [userAchievements, setUserAchievements] = useState<any[]>([]);
  const [achievementsStats, setAchievementsStats] = useState<any>(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);

  // Filters for Media Tab
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedRatingFilter, setSelectedRatingFilter] = useState<string>('ALL');
  const [mediaSearchQuery, setMediaSearchQuery] = useState<string>('');

  const [showTasteCompare, setShowTasteCompare] = useState(false);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);

  const profileUserId = profileData?.user?.id;
  const presenceMap = usePresence(profileUserId ? [profileUserId] : []);

  const fetchProfile = async () => {
    if (!targetUsername) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await authFetch(`/api/users/${targetUsername}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Пользователь не найден');
        throw new Error('Не удалось загрузить профиль');
      }
      const data = await res.json();
      setProfileData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserAchievements = async () => {
    if (!targetUsername) return;
    setAchievementsLoading(true);
    try {
      const res = await authFetch(`/api/achievements/user/${targetUsername}`);
      if (res.ok) {
        const json = await res.json();
        setUserAchievements(json.achievements || []);
        setAchievementsStats(json.stats || null);
      }
    } catch (err) {
      console.error('Failed to fetch user achievements:', err);
    } finally {
      setAchievementsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchUserAchievements();
  }, [targetUsername, dbUser]);

  const handleSendFriendRequest = async () => {
    if (!dbUser) {
      await login();
      return;
    }
    setFriendActionLoading(true);
    try {
      const res = await authFetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUsername }),
      });
      if (res.ok) {
        fetchProfile();
      }
    } catch (err) {
      console.error('Failed to send friend request:', err);
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleShareProfile = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 3000);
    }
  };

  const getCategoryIcon = (type: string) => {
    switch (type) {
      case 'MOVIE':
        return <Film className="w-3.5 h-3.5 text-purple-400" />;
      case 'TV':
        return <Tv className="w-3.5 h-3.5 text-blue-400" />;
      case 'ANIME':
        return <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />;
      case 'MANGA':
        return <BookOpen className="w-3.5 h-3.5 text-pink-400" />;
      case 'GAME':
        return <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'BOOK':
        return <Book className="w-3.5 h-3.5 text-amber-400" />;
      case 'COMIC':
        return <Flame className="w-3.5 h-3.5 text-orange-400" />;
      default:
        return <Film className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-[#94A3B8] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#8B5CF6]" />
        <span className="text-xs">Загрузка профиля...</span>
      </div>
    );
  }

  if (error || !profileData) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-center text-[#64748B]">
          <User className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-white">{error || 'Профиль не найден'}</h2>
        <p className="text-xs text-[#94A3B8]">
          Возможно, пользователь изменил имя или ссылка была скопирована с ошибкой.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-xl bg-[#151932] hover:bg-[#8B5CF6]/20 border border-[#1E2442] text-xs font-bold text-white"
        >
          На главную
        </button>
      </div>
    );
  }

  const {
    user,
    isOwner,
    friendStatus,
    isPrivate,
    canViewLibrary,
    canViewRatings,
    canViewStats,
    canViewLists,
    library = [],
    stats = {},
    reviews = [],
    lists = [],
    tierLists = [],
  } = profileData;

  // Calculate PTS
  const calculatedPts = (achievementsStats?.points || 0) + (stats?.totalMedia || 0) * 10 + (reviews?.length || 0) * 25;

  // Filtered Library
  const filteredLibrary = library.filter((item: any) => {
    if (selectedCategory !== 'ALL' && item.type !== selectedCategory) return false;
    if (selectedStatus !== 'ALL' && item.status !== selectedStatus) return false;

    // Rating filter
    const userScore = item.rating || item.userRating || 0;
    if (selectedRatingFilter === '10') {
      if (userScore !== 10) return false;
    } else if (selectedRatingFilter === '8+') {
      if (userScore < 8) return false;
    } else if (selectedRatingFilter === '5+') {
      if (userScore < 5) return false;
    } else if (selectedRatingFilter === 'UNRATED') {
      if (userScore > 0) return false;
    }

    if (mediaSearchQuery.trim()) {
      const q = mediaSearchQuery.toLowerCase();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchOrig = item.originalTitle?.toLowerCase().includes(q);
      if (!matchTitle && !matchOrig) return false;
    }
    return true;
  });

  // Top Rated Media for Overview
  const topRatedMedia = [...library]
    .filter((m: any) => typeof m.rating === 'number' && m.rating > 0)
    .sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 6);

  // Category Distribution Map for Overview/Stats
  const categoryStats = library.reduce((acc: Record<string, number>, item: any) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});

  // Rating Distribution (1-10) for Stats
  const ratingDistribution = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
    const count = library.filter((item: any) => Math.round(item.rating || 0) === num).length;
    return { rating: num, count };
  });
  const maxRatingCount = Math.max(...ratingDistribution.map((d) => d.count), 1);

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 space-y-6 pb-16 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {copiedToast && (
        <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl bg-[#151932] border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Ссылка на профиль скопирована в буфер обмена!</span>
        </div>
      )}

      {/* HERO PROFILE HEADER */}
      <div className="relative rounded-3xl bg-[#0B0D20] border border-[#1E2442] overflow-hidden shadow-2xl">
        {/* Backdrop Banner with Mesh Gradient */}
        <div className="h-44 sm:h-56 w-full bg-gradient-to-r from-[#1A0B2E] via-[#0F172A] to-[#0A1128] border-b border-[#1E2442] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(139,92,246,0.25),_transparent_65%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(99,102,241,0.2),_transparent_60%)]" />
          
          {/* Subtle decorative pattern */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              onClick={handleShareProfile}
              className="p-2 rounded-xl bg-[#0B0D20]/70 hover:bg-[#0B0D20] backdrop-blur-md border border-white/10 text-white text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
              title="Поделиться профилем"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Поделиться</span>
            </button>
          </div>
        </div>

        {/* Profile Info Section */}
        <div className="px-6 sm:px-8 pb-6 pt-0 relative">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 -mt-16 sm:-mt-20 mb-6">
            {/* Left: Avatar + Details */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-5">
              {/* Avatar Container */}
              <div className="relative self-start shrink-0">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.username}
                    referrerPolicy="no-referrer"
                    className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl ring-4 ring-[#0B0D20] border-2 border-[#8B5CF6]/40 object-cover bg-[#151932] shadow-2xl"
                  />
                ) : (
                  <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl ring-4 ring-[#0B0D20] border-2 border-[#8B5CF6]/40 bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] flex items-center justify-center text-4xl font-black text-white shadow-2xl font-mono">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Subtle Presence Dot */}
                <div className="absolute -bottom-1 -right-1">
                  <PresenceIndicator presence={presenceMap[user.id]} size="md" />
                </div>
              </div>

              {/* Username & Bio */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    @{user.username}
                  </h1>

                  {user.role === 'SUPER_ADMIN' && (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex items-center gap-1">
                      <Shield className="w-3 h-3 text-amber-400" />
                      FOUNDER
                    </span>
                  )}
                  {user.role === 'ADMIN' && (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                      ADMIN
                    </span>
                  )}
                  {user.role === 'VIP' && (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                      VIP
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-[#94A3B8] flex-wrap">
                  <span className="flex items-center gap-1 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-[#64748B]" />
                    С {new Date(user.createdAt).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })}
                  </span>
                  <PresenceIndicator presence={presenceMap[user.id]} showText size="sm" />
                </div>

                {user.bio && (
                  <p className="text-xs text-[#CBD5E1] max-w-xl line-clamp-2 mt-2 italic bg-[#11152A]/80 px-3 py-1.5 rounded-xl border border-[#1E2442]">
                    «{user.bio}»
                  </p>
                )}
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2.5 flex-wrap md:self-end">
              {isOwner ? (
                <button
                  onClick={onNavigateSettings}
                  className="px-4 py-2.5 rounded-2xl bg-[#151932] hover:bg-[#8B5CF6]/20 border border-[#1E2442] hover:border-[#8B5CF6]/50 text-xs font-bold text-white transition-all flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Settings className="w-3.5 h-3.5 text-[#A78BFA]" />
                  <span>Редактировать профиль</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('open_chat', {
                          detail: { id: user.id, username: user.username, avatar: user.avatar },
                        })
                      )
                    }
                    className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-bold shadow-lg shadow-[#7C3AED]/25 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Написать</span>
                  </button>

                  <button
                    onClick={() => setShowTasteCompare(true)}
                    className="px-3.5 py-2.5 rounded-2xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 text-xs font-bold text-[#CBD5E1] hover:text-white transition-all flex items-center gap-2 cursor-pointer"
                    title="Сравнить вкусы"
                  >
                    <HeartHandshake className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span className="hidden sm:inline">Сравнить вкусы</span>
                  </button>

                  {friendStatus === 'FRIENDS' ? (
                    <span className="px-3 py-2 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>В друзьях</span>
                    </span>
                  ) : friendStatus === 'PENDING_SENT' ? (
                    <span className="px-3 py-2 rounded-2xl bg-[#11152A] border border-[#1E2442] text-[#94A3B8] text-xs font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Заявка отправлена</span>
                    </span>
                  ) : friendStatus === 'PENDING_RECEIVED' ? (
                    <button
                      onClick={() => navigate('/friends')}
                      className="px-3.5 py-2 rounded-2xl bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      Принять заявку
                    </button>
                  ) : (
                    <button
                      onClick={handleSendFriendRequest}
                      disabled={friendActionLoading}
                      className="px-4 py-2.5 rounded-2xl bg-[#151932] hover:bg-[#8B5CF6]/20 border border-[#1E2442] hover:border-[#8B5CF6]/50 text-white text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {friendActionLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5 text-[#A78BFA]" />
                      )}
                      <span>В друзья</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Quick Metrics Bar in Header (Friends, Media Count, PTS, Achievements) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[#1E2442]">
            {/* 1. Media Count */}
            <div className="p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Film className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider">Медиатека</div>
                <div className="text-base font-black text-white font-mono">{stats.totalMedia || library.length || 0}</div>
              </div>
            </div>

            {/* 2. PTS */}
            <div className="p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider">Рейтинг PTS</div>
                <div className="text-base font-black text-indigo-300 font-mono">{calculatedPts}</div>
              </div>
            </div>

            {/* 3. Achievements */}
            <div className="p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider">Достижения</div>
                <div className="text-base font-black text-amber-300 font-mono">
                  {achievementsStats?.unlocked ?? userAchievements.filter((a) => a.unlocked).length}
                </div>
              </div>
            </div>

            {/* 4. Average Rating */}
            <div className="p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Star className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider">Средний балл</div>
                <div className="text-base font-black text-emerald-300 font-mono">
                  {stats.averageRating ? `${stats.averageRating} / 10` : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Privacy Guard */}
      {isPrivate ? (
        <div className="p-12 rounded-3xl bg-[#0B0D20] border border-[#1E2442] text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#151932] border border-[#8B5CF6]/30 flex items-center justify-center text-[#A78BFA]">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Этот профиль закрыт</h3>
            <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
              Пользователь ограничил доступ к библиотеке и активности. Добавьте его в друзья для просмотра.
            </p>
          </div>
          {!isOwner && friendStatus === 'NONE' && (
            <button
              onClick={handleSendFriendRequest}
              disabled={friendActionLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white text-xs font-bold shadow-lg shadow-[#7C3AED]/25 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Отправить заявку</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* PROFILE NAVIGATION TABS */}
          <div className="flex items-center gap-2 border-b border-[#1E2442] pb-3 overflow-x-auto no-scrollbar">
            {[
              { id: 'overview', label: 'Обзор', icon: Grid, count: null },
              { id: 'media', label: 'Медиа', icon: Film, count: library.length },
              { id: 'lists', label: 'Списки', icon: Layers, count: lists.length },
              { id: 'tier-lists', label: 'Tier Lists', icon: Sparkles, count: tierLists.length },
              {
                id: 'achievements',
                label: 'Достижения',
                icon: Trophy,
                count: achievementsStats?.unlocked ?? userAchievements.filter((a) => a.unlocked).length,
              },
              { id: 'statistics', label: 'Статистика', icon: BarChart2, count: null },
            ].map((tabItem) => {
              const Icon = tabItem.icon;
              const isActive = activeTab === tabItem.id;
              return (
                <button
                  key={tabItem.id}
                  onClick={() => setActiveTab(tabItem.id as ProfileTab)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-lg shadow-[#7C3AED]/25'
                      : 'bg-[#11152A] text-[#94A3B8] hover:text-white hover:bg-[#151932] border border-[#1E2442]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tabItem.label}</span>
                  {typeof tabItem.count === 'number' && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#0B0D20] text-[#CBD5E1] font-mono">
                      {tabItem.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Category Breakdown Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {[
                  { type: 'GAME', label: 'Игры', color: 'text-emerald-400', icon: Gamepad2 },
                  { type: 'MOVIE', label: 'Фильмы', color: 'text-purple-400', icon: Film },
                  { type: 'TV', label: 'Сериалы', color: 'text-blue-400', icon: Tv },
                  { type: 'ANIME', label: 'Аниме', color: 'text-fuchsia-400', icon: Sparkles },
                  { type: 'BOOK', label: 'Книги', color: 'text-amber-400', icon: Book },
                  { type: 'MANGA', label: 'Манга', color: 'text-pink-400', icon: BookOpen },
                ].map((cat) => {
                  const Icon = cat.icon;
                  const count = categoryStats[cat.type] || 0;
                  return (
                    <div
                      key={cat.type}
                      onClick={() => {
                        setSelectedCategory(cat.type);
                        setActiveTab('media');
                      }}
                      className="p-3.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/40 cursor-pointer transition-all flex flex-col items-center justify-center text-center gap-1 group shadow-md"
                    >
                      <Icon className={`w-5 h-5 ${cat.color} group-hover:scale-110 transition-transform`} />
                      <span className="text-[11px] font-semibold text-[#94A3B8] group-hover:text-white mt-1">
                        {cat.label}
                      </span>
                      <span className="text-base font-black text-white font-mono">{count}</span>
                    </div>
                  );
                })}
              </div>

              {/* Top Rated Media Favorites Showcase */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span>Высшие оценки</span>
                  </h3>
                  {library.length > 6 && (
                    <button
                      onClick={() => setActiveTab('media')}
                      className="text-xs font-semibold text-[#A78BFA] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Все медиа ({library.length})</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {topRatedMedia.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-[#0B0D20] border border-[#1E2442] text-center text-xs text-[#64748B]">
                    Пока нет оцененных произведений в библиотеке
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    {topRatedMedia.map((item: any) => (
                      <div
                        key={item.userMediaId}
                        onClick={() => navigate(`/media/${formatMediaTypePath(item.type)}/${item.mediaId}`)}
                        className="group relative rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 overflow-hidden cursor-pointer transition-all hover:-translate-y-1 shadow-lg"
                      >
                        <div className="aspect-[2/3] w-full bg-[#11152A] relative overflow-hidden">
                          {item.posterUrl ? (
                            <img
                              src={item.posterUrl}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#64748B]">
                              {getCategoryIcon(item.type)}
                            </div>
                          )}

                          {/* Score Badge */}
                          {item.rating && (
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-amber-500/40 text-amber-300 font-mono font-black text-[11px] flex items-center gap-1 shadow-lg">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span>{item.rating}</span>
                            </div>
                          )}
                        </div>

                        <div className="p-2.5">
                          <h4 className="text-xs font-bold text-white truncate group-hover:text-[#A78BFA] transition-colors">
                            {item.title}
                          </h4>
                          <span className="text-[10px] text-[#64748B] font-mono">{item.type}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Achievements Highlight */}
              {userAchievements.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span>Витрина достижений</span>
                    </h3>
                    <button
                      onClick={() => setActiveTab('achievements')}
                      className="text-xs font-semibold text-[#A78BFA] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Все ачивки</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {userAchievements
                      .filter((a) => a.unlocked)
                      .slice(0, 4)
                      .map((ach) => (
                        <div
                          key={ach.id}
                          className="p-3.5 rounded-2xl bg-[#0B0D20] border border-amber-500/30 flex items-center gap-3 shadow-md"
                        >
                          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                            <Trophy className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-xs font-bold text-white truncate">{ach.title}</h5>
                            <span className="text-[10px] text-amber-300 font-mono">+{ach.points} PTS</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MEDIA LIBRARY */}
          {activeTab === 'media' && (
            <div className="space-y-4">
              {/* Filter Controls Bar */}
              <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-3 shadow-md">
                {/* Search in user's library */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#64748B]" />
                  <input
                    type="text"
                    placeholder="Поиск по библиотеке пользователя..."
                    value={mediaSearchQuery}
                    onChange={(e) => setMediaSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] focus:border-[#8B5CF6] text-xs text-white placeholder-[#64748B] focus:outline-none"
                  />
                </div>

                {/* Category & Status pills */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[#1E2442]">
                  {/* Category Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {[
                      { id: 'ALL', label: 'Все категории' },
                      { id: 'GAME', label: 'Игры' },
                      { id: 'MOVIE', label: 'Фильмы' },
                      { id: 'TV', label: 'Сериалы' },
                      { id: 'ANIME', label: 'Аниме' },
                      { id: 'BOOK', label: 'Книги' },
                      { id: 'MANGA', label: 'Манга' },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                          selectedCategory === cat.id
                            ? 'bg-[#151932] text-[#A78BFA] border border-[#8B5CF6]/50 shadow-sm'
                            : 'bg-[#11152A] text-[#94A3B8] hover:text-white border border-[#1E2442]'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Status Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {[
                      { id: 'ALL', label: 'Все статусы' },
                      { id: 'COMPLETED', label: 'Завершено' },
                      { id: 'WATCHING', label: 'В процессе' },
                      { id: 'PLAN_TO_WATCH', label: 'В планах' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        onClick={() => setSelectedStatus(st.id)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          selectedStatus === st.id
                            ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                            : 'bg-[#11152A] text-[#64748B] hover:text-[#94A3B8] border border-[#1E2442]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {/* Rating Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 border-t border-[#1E2442] pt-2 w-full">
                    <span className="text-[10px] text-[#64748B] font-mono mr-1 shrink-0">Оценка:</span>
                    {[
                      { id: 'ALL', label: 'Все' },
                      { id: '10', label: '★ 10' },
                      { id: '8+', label: '★ 8+' },
                      { id: '5+', label: '★ 5+' },
                      { id: 'UNRATED', label: 'Без оценки' },
                    ].map((rf) => (
                      <button
                        key={rf.id}
                        onClick={() => setSelectedRatingFilter(rf.id)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          selectedRatingFilter === rf.id
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                            : 'bg-[#11152A] text-[#64748B] hover:text-[#94A3B8] border border-[#1E2442]'
                        }`}
                      >
                        {rf.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Grid of media */}
              {filteredLibrary.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-2">
                  <Film className="w-8 h-8 text-[#64748B] mx-auto stroke-1" />
                  <p className="text-xs text-[#94A3B8]">Медиа по выбранным фильтрам не найдено</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                  {filteredLibrary.map((item: any) => (
                    <div
                      key={item.userMediaId || `${item.type}-${item.mediaId}`}
                      onClick={() => navigate(`/media/${formatMediaTypePath(item.type)}/${item.mediaId}`)}
                      className="group relative rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 overflow-hidden cursor-pointer transition-all hover:-translate-y-1 shadow-lg flex flex-col justify-between"
                    >
                      <div className="aspect-[2/3] w-full bg-[#11152A] relative overflow-hidden">
                        {item.posterUrl ? (
                          <img
                            src={item.posterUrl}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#64748B]">
                            {getCategoryIcon(item.type)}
                          </div>
                        )}

                        {/* Rating Overlay */}
                        {item.rating ? (
                          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-black/85 backdrop-blur-md border border-amber-500/40 text-amber-300 font-mono font-black text-[11px] flex items-center gap-1 shadow-md">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span>{item.rating}</span>
                          </div>
                        ) : null}

                        {/* Status Label */}
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md text-[10px] font-semibold text-white border border-white/10">
                          {item.status === 'COMPLETED' ? 'Пройдено' : item.status === 'WATCHING' ? 'В процессе' : 'В планах'}
                        </div>
                      </div>

                      <div className="p-3">
                        <h4 className="text-xs font-bold text-white truncate group-hover:text-[#A78BFA] transition-colors">
                          {item.title}
                        </h4>
                        <span className="text-[10px] text-[#64748B] font-mono">{item.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LISTS */}
          {activeTab === 'lists' && (
            <div className="space-y-4">
              {lists.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-2">
                  <Layers className="w-8 h-8 text-[#64748B] mx-auto stroke-1" />
                  <p className="text-xs text-[#94A3B8]">У пользователя пока нет созданных списков</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {lists.map((list: any) => (
                    <div
                      key={list.id}
                      onClick={() => navigate(`/lists/${list.id}`)}
                      className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 cursor-pointer transition-all shadow-lg space-y-3 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                          <Layers className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-[#11152A] text-[#94A3B8] border border-[#1E2442]">
                          {list.itemsCount || 0} тайтлов
                        </span>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-white group-hover:text-[#A78BFA] transition-colors line-clamp-1">
                          {list.title}
                        </h4>
                        {list.description && (
                          <p className="text-xs text-[#94A3B8] line-clamp-2 mt-1">{list.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TIER LISTS */}
          {activeTab === 'tier-lists' && (
            <div className="space-y-4">
              {tierLists.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-2">
                  <Sparkles className="w-8 h-8 text-[#64748B] mx-auto stroke-1" />
                  <p className="text-xs text-[#94A3B8]">У пользователя пока нет тир-листов</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {tierLists.map((tl: any) => (
                    <div
                      key={tl.id}
                      onClick={() => navigate(`/tier-lists/${tl.id}`)}
                      className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 cursor-pointer transition-all shadow-lg space-y-3 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-[#11152A] text-[#94A3B8] border border-[#1E2442]">
                          {tl.category || 'Медиа'}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-white group-hover:text-[#A78BFA] transition-colors line-clamp-1">
                          {tl.title}
                        </h4>
                        {tl.description && (
                          <p className="text-xs text-[#94A3B8] line-clamp-2 mt-1">{tl.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ACHIEVEMENTS */}
          {activeTab === 'achievements' && (
            <div className="space-y-6">
              {/* Stats Top Box */}
              {achievementsStats && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
                    <span className="text-[10px] font-bold text-[#94A3B8] uppercase">Разблокировано</span>
                    <p className="text-xl font-black text-amber-400 font-mono mt-1">
                      {achievementsStats.unlocked} / {achievementsStats.total}
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
                    <span className="text-[10px] font-bold text-[#94A3B8] uppercase">Очки Достижений</span>
                    <p className="text-xl font-black text-[#A78BFA] font-mono mt-1">
                      {achievementsStats.points} PTS
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-bold text-[#94A3B8] uppercase">Прогресс завершения</span>
                    <p className="text-xl font-black text-emerald-400 font-mono mt-1">
                      {Math.round((achievementsStats.unlocked / (achievementsStats.total || 1)) * 100)}%
                    </p>
                  </div>
                </div>
              )}

              {/* Achievements Grid */}
              {achievementsLoading ? (
                <div className="py-16 text-center text-[#94A3B8] text-xs">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#8B5CF6]" />
                  Загрузка списка наград...
                </div>
              ) : userAchievements.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-2">
                  <Trophy className="w-8 h-8 text-[#64748B] mx-auto stroke-1" />
                  <p className="text-xs text-[#94A3B8]">Пока нет разблокированных достижений</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  {userAchievements.map((ach) => (
                    <div
                      key={ach.id}
                      className={`p-4 rounded-2xl border transition-all flex items-start gap-3.5 shadow-md ${
                        ach.unlocked
                          ? 'bg-[#0B0D20] border-amber-500/30'
                          : 'bg-[#0B0D20]/50 border-[#1E2442] opacity-60'
                      }`}
                    >
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                          ach.unlocked
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-lg shadow-amber-500/10'
                            : 'bg-[#11152A] border-[#1E2442] text-[#64748B]'
                        }`}
                      >
                        <Trophy className="w-5 h-5" />
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 justify-between">
                          <h4 className="text-xs font-bold text-white truncate">{ach.title}</h4>
                          <span className="text-[10px] font-mono font-bold text-amber-300 shrink-0">
                            +{ach.points} PTS
                          </span>
                        </div>
                        <p className="text-[11px] text-[#94A3B8] line-clamp-2">{ach.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: STATISTICS */}
          {activeTab === 'statistics' && (
            <div className="space-y-6">
              {/* Rating Distribution Histogram */}
              <div className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-amber-400" />
                  <span>Распределение оценок (1 - 10)</span>
                </h3>

                <div className="flex items-end gap-2 sm:gap-4 h-36 pt-4 border-b border-[#1E2442]">
                  {ratingDistribution.map((bar) => {
                    const heightPercent = (bar.count / maxRatingCount) * 100;
                    return (
                      <div key={bar.rating} className="flex-1 flex flex-col items-center h-full justify-end group">
                        <span className="text-[10px] font-mono text-[#94A3B8] group-hover:text-amber-400 mb-1">
                          {bar.count > 0 ? bar.count : ''}
                        </span>
                        <div
                          style={{ height: `${Math.max(heightPercent, 4)}%` }}
                          className={`w-full max-w-[28px] rounded-t-lg transition-all ${
                            bar.count > 0
                              ? 'bg-gradient-to-t from-[#7C3AED] to-amber-400 group-hover:brightness-125 shadow-md shadow-amber-500/15'
                              : 'bg-[#151932]'
                          }`}
                        />
                        <span className="text-[10px] font-mono text-[#64748B] mt-2 font-bold group-hover:text-white">
                          ★{bar.rating}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Media Distribution Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-3 shadow-xl">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-purple-400" />
                    <span>По категориям</span>
                  </h3>
                  <div className="space-y-2.5 pt-2">
                    {Object.entries(categoryStats).map(([cat, count]) => {
                      const pct = Math.round((Number(count) / (library.length || 1)) * 100);
                      return (
                        <div key={cat} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-semibold text-white">{cat}</span>
                            <span className="text-[#94A3B8] font-mono">
                              {Number(count)} шт. ({pct}%)
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-[#151932] overflow-hidden">
                            <div
                              style={{ width: `${pct}%` }}
                              className="h-full bg-gradient-to-r from-[#7C3AED] to-[#6366F1] rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-3 shadow-xl">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Итоги аккаунта</span>
                  </h3>
                  <div className="space-y-3 pt-2 text-xs">
                    <div className="flex justify-between py-2 border-b border-[#1E2442]">
                      <span className="text-[#94A3B8]">Завершено всего:</span>
                      <span className="font-mono font-bold text-emerald-300">{stats.completedCount || 0}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#1E2442]">
                      <span className="text-[#94A3B8]">Написано рецензий:</span>
                      <span className="font-mono font-bold text-[#A78BFA]">{reviews.length}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#1E2442]">
                      <span className="text-[#94A3B8]">Создано списков & тир-листов:</span>
                      <span className="font-mono font-bold text-cyan-300">{lists.length + tierLists.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Taste Comparison Modal */}
      {showTasteCompare && targetUsername && (
        <TasteComparisonModal
          friendUsername={targetUsername}
          onClose={() => setShowTasteCompare(false)}
        />
      )}
    </div>
  );
};
