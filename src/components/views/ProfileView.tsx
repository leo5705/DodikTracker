import React, { useState, useEffect } from 'react';
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
  ListOrdered,
  Layers,
  ChevronRight,
  Clock,
  Loader2,
  CheckCircle2,
  Settings,
  Trophy,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { MediaCard, formatMediaTypePath } from '../common/MediaCard.tsx';
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

export const ProfileView: React.FC<ProfileViewProps> = ({
  username,
  onNavigateSettings,
  onSelectMedia,
  onNavigateUser,
}) => {
  const { authFetch, dbUser, login } = useAuth();
  const { navigate } = useRouter();
  const targetUsername = username || dbUser?.username;

  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'library' | 'reviews' | 'lists' | 'achievements'>('library');
  const [userAchievements, setUserAchievements] = useState<any[]>([]);
  const [achievementsStats, setAchievementsStats] = useState<any>(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showTasteCompare, setShowTasteCompare] = useState(false);
  const [friendActionLoading, setFriendActionLoading] = useState(false);

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

  useEffect(() => {
    fetchProfile();
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
    if (activeTab === 'achievements') {
      fetchUserAchievements();
    }
  }, [activeTab, targetUsername]);

  const getCategoryIcon = (type: string) => {
    switch (type) {
      case 'MOVIE':
        return <Film className="w-3.5 h-3.5 text-purple-400" />;
      case 'TV':
        return <Tv className="w-3.5 h-3.5 text-indigo-400" />;
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

  const getCategoryName = (type: string) => {
    switch (type) {
      case 'MOVIE':
        return 'Фильмы';
      case 'TV':
        return 'Сериалы';
      case 'ANIME':
        return 'Аниме';
      case 'MANGA':
        return 'Манга';
      case 'GAME':
        return 'Игры';
      case 'BOOK':
        return 'Книги';
      case 'COMIC':
        return 'Комиксы';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-[#9A94AA] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#9B6BFF]" />
        <span className="text-sm">Загрузка профиля...</span>
      </div>
    );
  }

  if (error || !profileData) {
    return (
      <div className="py-20 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-[#191724] border border-[#252233] flex items-center justify-center text-[#9A94AA]">
          <User className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-[#F3F1F8]">{error || 'Профиль не найден'}</h2>
        <p className="text-xs text-[#9A94AA]">Возможно, пользователь изменил имя или удалил аккаунт.</p>
      </div>
    );
  }

  const { user, isOwner, isFriend, friendStatus, isPrivate, canViewLibrary, canViewRatings, canViewStats, canViewLists, library, stats, reviews, lists, tierLists } = profileData;

  const filteredLibrary =
    selectedCategory === 'ALL'
      ? library
      : library.filter((item: any) => item.type === selectedCategory);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Profile Header Banner Card */}
      <div className="relative rounded-2xl bg-[#14131A] border border-[#252233] overflow-hidden shadow-xl">
        {/* Banner */}
        <div className="h-36 sm:h-48 w-full bg-gradient-to-r from-purple-950/50 via-[#181622] to-[#121117] border-b border-[#252233] relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(155,107,255,0.15),_transparent_70%)]" />
        </div>

        {/* Profile Details Bar */}
        <div className="px-5 sm:px-8 pb-6 pt-0 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-14 sm:-mt-16 mb-4">
            <div className="flex items-end gap-4">
              {/* Avatar */}
              <div className="relative">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.username}
                    referrerPolicy="no-referrer"
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl ring-4 ring-[#14131A] border border-[#3A344E] object-cover bg-[#191724] shadow-2xl"
                  />
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl ring-4 ring-[#14131A] border border-[#3A344E] bg-gradient-to-tr from-purple-900 to-indigo-800 flex items-center justify-center text-3xl font-black text-white font-mono shadow-2xl">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}
                {user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? (
                  <div className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-purple-600 text-white shadow-lg" title="Администратор">
                    <Shield className="w-3.5 h-3.5" />
                  </div>
                ) : null}
              </div>

              {/* Username & Badges */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black text-[#F3F1F8] font-mono tracking-tight">
                    @{user.username}
                  </h1>
                  <PresenceIndicator presence={presenceMap[user.id]} showText size="sm" />
                  {user.role === 'SUPER_ADMIN' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30 font-mono">
                      FOUNDER
                    </span>
                  )}
                  {user.role === 'ADMIN' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                      ADMIN
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#9A94AA] flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  В Dodik Tracker с {new Date(user.createdAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap sm:self-end">
              {isOwner ? (
                <button
                  onClick={onNavigateSettings}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#191724] hover:bg-[#1F1C2E] border border-[#2E2A40] text-xs font-semibold text-[#F3F1F8] transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-[#AC82FF]" />
                  Редактировать профиль
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('open_chat', { detail: { id: user.id, username: user.username, avatar: user.avatar } }));
                    }}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/40 transition-all"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Сообщение
                  </button>
                  <button
                    onClick={() => setShowTasteCompare(true)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/30 text-xs font-semibold text-[#AC82FF] transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Сравнить вкусы
                  </button>

                  <button
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('open_chat', {
                          detail: {
                            id: user.id,
                            username: user.username,
                            avatar: user.avatar,
                          },
                        })
                      );
                    }}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#252233] hover:bg-[#353147] border border-[#3A344E] text-xs font-semibold text-[#F3F1F8] transition-colors"
                    title="Написать личное сообщение"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#AC82FF]" />
                    Сообщение
                  </button>

                  {friendStatus === 'FRIENDS' ? (
                    <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                      <UserCheck className="w-3.5 h-3.5" />
                      У вас в друзьях
                    </span>
                  ) : friendStatus === 'PENDING_SENT' ? (
                    <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#191724] border border-[#252233] text-[#9A94AA] text-xs font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      Заявка отправлена
                    </span>
                  ) : friendStatus === 'PENDING_RECEIVED' ? (
                    <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#9B6BFF] text-white text-xs font-semibold">
                      Ждет вашего ответа
                    </span>
                  ) : (
                    <button
                      onClick={handleSendFriendRequest}
                      disabled={friendActionLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-semibold shadow-lg shadow-purple-950/40 transition-colors disabled:opacity-50"
                    >
                      {friendActionLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      Добавить в друзья
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Bio */}
          {user.bio && (
            <div className="mt-2 text-xs sm:text-sm text-[#D5D0E3] max-w-2xl bg-[#181622]/60 p-3 rounded-xl border border-[#252233]">
              {user.bio}
            </div>
          )}
        </div>
      </div>

      {/* Private Profile Guard */}
      {isPrivate ? (
        <div className="p-10 rounded-2xl bg-[#14131A] border border-[#252233] text-center space-y-4 shadow-xl">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#191724] border border-[#2E2A40] flex items-center justify-center text-[#AC82FF]">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[#F3F1F8]">Этот профиль закрыт</h3>
            <p className="text-xs text-[#9A94AA] max-w-md mx-auto">
              Пользователь ограничил доступ к своей активности и библиотеке. Добавьте его в друзья, чтобы просматривать профиль.
            </p>
          </div>
          {!isOwner && friendStatus === 'NONE' && (
            <button
              onClick={handleSendFriendRequest}
              disabled={friendActionLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-semibold shadow-lg shadow-purple-950/40 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Отправить заявку в друзья
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Stats Bar (if visible) */}
          {canViewStats && stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-[#14131A] border border-[#252233]">
                <p className="text-[11px] font-semibold text-[#9A94AA] uppercase tracking-wider">Всего в трекере</p>
                <p className="text-xl sm:text-2xl font-black text-[#F3F1F8] font-mono mt-1">{stats.totalMedia}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#14131A] border border-[#252233]">
                <p className="text-[11px] font-semibold text-[#9A94AA] uppercase tracking-wider">Завершено</p>
                <p className="text-xl sm:text-2xl font-black text-emerald-400 font-mono mt-1">{stats.completedCount}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#14131A] border border-[#252233]">
                <p className="text-[11px] font-semibold text-[#9A94AA] uppercase tracking-wider">Средняя оценка</p>
                <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono mt-1 flex items-center gap-1">
                  <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                  {stats.averageRating || '—'}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[#14131A] border border-[#252233]">
                <p className="text-[11px] font-semibold text-[#9A94AA] uppercase tracking-wider">Рецензий</p>
                <p className="text-xl sm:text-2xl font-black text-[#AC82FF] font-mono mt-1">{reviews.length}</p>
              </div>
            </div>
          )}

          {/* Navigation Tabs (Library, Reviews, Lists) */}
          <div className="flex items-center justify-between border-b border-[#252233] pb-3 gap-2 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setActiveTab('library')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'library'
                    ? 'bg-[#9B6BFF] text-white shadow-md'
                    : 'text-[#9A94AA] hover:text-[#F3F1F8] bg-[#14131A] border border-[#252233]'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                Медиатека ({library.length})
              </button>

              <button
                onClick={() => setActiveTab('reviews')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'reviews'
                    ? 'bg-[#9B6BFF] text-white shadow-md'
                    : 'text-[#9A94AA] hover:text-[#F3F1F8] bg-[#14131A] border border-[#252233]'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Отзывы ({reviews.length})
              </button>

              <button
                onClick={() => setActiveTab('lists')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'lists'
                    ? 'bg-[#9B6BFF] text-white shadow-md'
                    : 'text-[#9A94AA] hover:text-[#F3F1F8] bg-[#14131A] border border-[#252233]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Списки & Тир-листы ({lists.length + tierLists.length})
              </button>

              <button
                onClick={() => setActiveTab('achievements')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'achievements'
                    ? 'bg-[#9B6BFF] text-white shadow-md'
                    : 'text-[#9A94AA] hover:text-[#F3F1F8] bg-[#14131A] border border-[#252233]'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                Достижения ({achievementsStats?.unlocked ?? '0'})
              </button>
            </div>
          </div>

          {/* TAB 1: LIBRARY */}
          {activeTab === 'library' && (
            <div className="space-y-4">
              {!canViewLibrary ? (
                <div className="p-8 rounded-xl bg-[#14131A] border border-[#252233] text-center text-[#9A94AA] text-xs">
                  Пользователь скрыл свою библиотеку настройками приватности.
                </div>
              ) : (
                <>
                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    {[
                      { id: 'ALL', label: 'Все' },
                      { id: 'MOVIE', label: 'Фильмы' },
                      { id: 'TV', label: 'Сериалы' },
                      { id: 'ANIME', label: 'Аниме' },
                      { id: 'MANGA', label: 'Манга' },
                      { id: 'GAME', label: 'Игры' },
                      { id: 'BOOK', label: 'Книги' },
                      { id: 'COMIC', label: 'Комиксы' },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium shrink-0 transition-colors ${
                          selectedCategory === cat.id
                            ? 'bg-[#1F1C2E] text-[#AC82FF] border border-[#3A344E]'
                            : 'bg-[#14131A] text-[#9A94AA] hover:text-white border border-[#252233]'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {filteredLibrary.length === 0 ? (
                    <div className="py-12 text-center rounded-xl bg-[#14131A] border border-[#252233] p-4 text-xs text-[#9A94AA]">
                      В этой категории пока ничего нет.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                      {filteredLibrary.map((item: any) => (
                        <div
                          key={item.userMediaId}
                          onClick={() => navigate(`/media/${formatMediaTypePath(item.type)}/${item.mediaId}`)}
                          className="group relative rounded-xl bg-[#14131A] border border-[#252233] hover:border-[#3A344E] overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 shadow-md hover:shadow-xl"
                        >
                          <div className="aspect-[2/3] w-full bg-[#191724] relative overflow-hidden">
                            {item.posterUrl ? (
                              <img
                                src={item.posterUrl}
                                alt={item.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#9A94AA]">
                                {getCategoryIcon(item.type)}
                              </div>
                            )}

                            {/* Badge */}
                            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-[#0F0E12]/80 backdrop-blur-sm border border-[#252233] text-[10px] font-semibold text-[#AC82FF]">
                              {getCategoryName(item.type)}
                            </div>

                            {item.rating && (
                              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-[#0F0E12]/80 backdrop-blur-sm border border-amber-500/40 text-[10px] font-bold text-amber-300 flex items-center gap-1 font-mono">
                                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                {item.rating}
                              </div>
                            )}

                            {/* Status Bottom Overlay */}
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#0F0E12] via-[#0F0E12]/80 to-transparent p-2 pt-6">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  item.status === 'COMPLETED'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : item.status === 'WATCHING' || item.status === 'PLAYING' || item.status === 'READING'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-zinc-800 text-zinc-300'
                                }`}
                              >
                                {item.status === 'COMPLETED'
                                  ? 'Завершено'
                                  : item.status === 'WATCHING' || item.status === 'PLAYING' || item.status === 'READING'
                                  ? 'В процессе'
                                  : 'В планах'}
                              </span>
                            </div>
                          </div>

                          <div className="p-2.5">
                            <h4 className="text-xs font-bold text-[#F3F1F8] truncate group-hover:text-[#AC82FF] transition-colors">
                              {item.title}
                            </h4>
                            <p className="text-[10px] text-[#9A94AA] font-mono mt-0.5">
                              {item.year || '—'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 2: REVIEWS */}
          {activeTab === 'reviews' && (
            <div className="space-y-3">
              {!canViewRatings ? (
                <div className="p-8 rounded-xl bg-[#14131A] border border-[#252233] text-center text-[#9A94AA] text-xs">
                  Пользователь скрыл свои рецензии настройками приватности.
                </div>
              ) : reviews.length === 0 ? (
                <div className="py-12 text-center rounded-xl bg-[#14131A] border border-[#252233] p-4 text-xs text-[#9A94AA]">
                  Пользователь пока не написал рецензий.
                </div>
              ) : (
                reviews.map((rev: any) => (
                  <div
                    key={rev.id}
                    onClick={() => navigate(`/media/${formatMediaTypePath(rev.mediaType)}/${rev.mediaId}`)}
                    className="p-4 rounded-xl bg-[#14131A] border border-[#252233] hover:border-[#3A344E] transition-all cursor-pointer space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {rev.mediaPoster && (
                          <img
                            src={rev.mediaPoster}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-10 h-14 object-cover rounded-lg border border-[#252233]"
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-[#F3F1F8]">{rev.mediaTitle}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#191724] text-[#AC82FF] border border-[#252233]">
                              {getCategoryName(rev.mediaType)}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#9A94AA] mt-0.5">
                            {new Date(rev.createdAt).toLocaleDateString('ru-RU')}
                          </p>
                        </div>
                      </div>

                      {rev.rating && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold font-mono">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          {rev.rating}/10
                        </div>
                      )}
                    </div>

                    {rev.title && <h5 className="text-xs font-bold text-[#F3F1F8]">{rev.title}</h5>}
                    <p className="text-xs text-[#D5D0E3] leading-relaxed line-clamp-3">{rev.content}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: LISTS & TIER LISTS */}
          {activeTab === 'lists' && (
            <div className="space-y-4">
              {!canViewLists ? (
                <div className="p-8 rounded-xl bg-[#14131A] border border-[#252233] text-center text-[#9A94AA] text-xs">
                  Пользователь скрыл свои коллекции и тир-листы.
                </div>
              ) : lists.length === 0 && tierLists.length === 0 ? (
                <div className="py-12 text-center rounded-xl bg-[#14131A] border border-[#252233] p-4 text-xs text-[#9A94AA]">
                  Пользователь пока не создал публичных коллекций или тир-листов.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {lists.map((lst: any) => (
                    <div
                      key={lst.id}
                      onClick={() => navigate(`/lists/${lst.id}`)}
                      className="p-4 rounded-xl bg-[#14131A] border border-[#252233] hover:border-[#AC82FF]/60 hover:bg-[#191724] space-y-1.5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 shadow group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#AC82FF]">
                          <ListOrdered className="w-3.5 h-3.5" />
                          Коллекция
                        </div>
                        <span className="text-[10px] text-[#9A94AA] group-hover:text-[#AC82FF] transition-colors">
                          Открыть →
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-[#F3F1F8] group-hover:text-[#AC82FF] transition-colors">{lst.title}</h4>
                      {lst.description && (
                        <p className="text-xs text-[#9A94AA] line-clamp-2">{lst.description}</p>
                      )}
                    </div>
                  ))}

                  {tierLists.map((tl: any) => (
                    <div
                      key={tl.id}
                      onClick={() => navigate(`/tier-lists/${tl.id}`)}
                      className="p-4 rounded-xl bg-[#14131A] border border-[#252233] hover:border-fuchsia-500/60 hover:bg-[#191724] space-y-1.5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 shadow group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-fuchsia-400">
                          <Layers className="w-3.5 h-3.5" />
                          Tier List ({tl.category})
                        </div>
                        <span className="text-[10px] text-[#9A94AA] group-hover:text-fuchsia-400 transition-colors">
                          Открыть →
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-[#F3F1F8] group-hover:text-fuchsia-400 transition-colors">{tl.title}</h4>
                      {tl.description && (
                        <p className="text-xs text-[#9A94AA] line-clamp-2">{tl.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ACHIEVEMENTS */}
          {activeTab === 'achievements' && (
            <div className="space-y-4">
              {/* Stats Bar */}
              {achievementsStats && (
                <div className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 text-[#AC82FF] flex items-center justify-center">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#F3F1F8]">Достижения пользователя</h4>
                      <p className="text-xs text-[#9A94AA]">
                        Открыто {achievementsStats.unlocked} из {achievementsStats.total} ({achievementsStats.percentage}%)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="px-3.5 py-1.5 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-xs font-mono">
                      <span className="text-[#9A94AA] mr-1.5">Всего очков:</span>
                      <span className="text-[#AC82FF] font-bold">+{achievementsStats.points} PTS</span>
                    </div>
                  </div>
                </div>
              )}

              {achievementsLoading ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-2 text-[#9A94AA]">
                  <Loader2 className="w-6 h-6 animate-spin text-[#AC82FF]" />
                  <span className="text-xs">Загрузка достижений...</span>
                </div>
              ) : userAchievements.length === 0 ? (
                <div className="py-12 text-center rounded-xl bg-[#14131A] border border-[#252233] p-4 text-xs text-[#9A94AA]">
                  Пользователь пока не открыл ни одного достижения.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {userAchievements.map((ach) => (
                    <AchievementBadge key={ach.id} {...ach} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Taste Comparison Modal */}
      {showTasteCompare && (
        <TasteComparisonModal
          friendUsername={user.username}
          onClose={() => setShowTasteCompare(false)}
        />
      )}
    </div>
  );
};
