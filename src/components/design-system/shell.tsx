import React, { useState } from 'react';
import {
  Compass,
  Library,
  Search,
  CalendarDays,
  Users,
  MessageSquare,
  ListOrdered,
  Layers,
  Dice5,
  Trophy,
  BarChart3,
  Settings,
  ShieldAlert,
  Radio,
  Newspaper,
  Bell,
  Sparkles,
  LogOut,
  LogIn,
  Menu,
  X,
  ChevronRight,
  Plus,
  Heart,
  SlidersHorizontal,
  Music,
  Disc,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { FeedbackModal } from '../modals/FeedbackModal.tsx';
import { Avatar } from './user-and-social.tsx';

export interface NavItemConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  badge?: number | string;
  action?: () => void;
}

export const Sidebar: React.FC<{
  onCloseMobile?: () => void;
}> = ({ onCloseMobile }) => {
  const { dbUser, logout, login, loading } = useAuth();
  const { navigate, route } = useRouter();
  const { unreadCount } = useNotifications();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const isStaff = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER', 'NEWS_EDITOR'].includes(
    dbUser?.role || ''
  );

  const currentRouteName = route.name;

  const mainNavItems: NavItemConfig[] = [
    { id: 'home', label: 'Главная', icon: Compass, path: '/' },
    { id: 'music', label: '🎵 Музыка', icon: Disc, path: '/music' },
    { id: 'search', label: 'Каталог', icon: Search, path: '/search' },
    { id: 'library', label: 'Библиотека', icon: Library, path: '/library' },
    { id: 'calendar', label: 'Календарь', icon: CalendarDays, path: '/calendar' },
    { id: 'friends', label: 'Друзья', icon: Users, path: '/friends' },
    {
      id: 'messages',
      label: 'Сообщения',
      icon: MessageSquare,
      path: '#',
      action: () => {
        window.dispatchEvent(new CustomEvent('toggle_messenger'));
        if (onCloseMobile) onCloseMobile();
      },
    },
    { id: 'lists', label: 'Списки', icon: ListOrdered, path: '/lists' },
    { id: 'tier-lists', label: 'Tier List', icon: Layers, path: '/tier-lists' },
    { id: 'roulette', label: 'Рулетка', icon: Dice5, path: '/roulette' },
    { id: 'achievements', label: 'Достижения', icon: Trophy, path: '/achievements' },
    { id: 'statistics', label: 'Статистика', icon: BarChart3, path: '/statistics' },
    { id: 'news', label: 'Новости', icon: Newspaper, path: '/news' },
    { id: 'feed', label: 'Лента', icon: Radio, path: '/feed' },
    { id: 'music-studio', label: 'Студия музыки', icon: Music, path: '/music/studio' },
    { id: 'settings', label: 'Настройки', icon: Settings, path: '/settings' },
  ];

  if (isStaff) {
    mainNavItems.push({
      id: 'admin',
      label: 'Админ-панель',
      icon: ShieldAlert,
      path: '/admin',
    });
  }

  const isItemActive = (item: NavItemConfig) => {
    if (item.id === 'home' && currentRouteName === 'home') return true;
    if (item.id === 'music' && (currentRouteName.startsWith('music') && currentRouteName !== 'music-studio')) return true;
    if (item.id === 'library' && currentRouteName.startsWith('library')) return true;
    if (item.id === 'search' && (currentRouteName === 'search' || currentRouteName.startsWith('game-catalog'))) return true;
    if (item.id === 'calendar' && currentRouteName === 'calendar') return true;
    if (item.id === 'friends' && currentRouteName === 'friends') return true;
    if (item.id === 'lists' && (currentRouteName === 'lists' || currentRouteName === 'list-detail')) return true;
    if (item.id === 'tier-lists' && (currentRouteName === 'tier-lists' || currentRouteName === 'tier-list-detail')) return true;
    if (item.id === 'roulette' && currentRouteName === 'roulette') return true;
    if (item.id === 'achievements' && currentRouteName === 'achievements') return true;
    if (item.id === 'statistics' && currentRouteName === 'statistics') return true;
    if (item.id === 'news' && (currentRouteName === 'news' || currentRouteName === 'news-detail')) return true;
    if (item.id === 'feed' && currentRouteName === 'feed') return true;
    if (item.id === 'music-studio' && currentRouteName === 'music-studio') return true;
    if (item.id === 'settings' && currentRouteName === 'settings') return true;
    if (item.id === 'admin' && currentRouteName === 'admin') return true;
    return false;
  };

  const handleItemClick = (item: NavItemConfig) => {
    if (item.action) {
      item.action();
      return;
    }
    navigate(item.path);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <aside
      id="desktop-sidebar"
      className="flex flex-col w-[264px] shrink-0 bg-[#0B0D20] border-r border-[#1E2442] h-screen sticky top-0 select-none z-30"
    >
      {/* Brand Header */}
      <div className="h-[72px] px-5 border-b border-[#1E2442] flex items-center justify-between shrink-0">
        <div
          onClick={() => {
            navigate('/');
            if (onCloseMobile) onCloseMobile();
          }}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] flex items-center justify-center shadow-md shadow-[#7C3AED]/25 group-hover:scale-105 transition-transform duration-200 border border-violet-400/30">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-wider text-[#F8FAFC] text-base leading-none">
                DODIK
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[#191D38] text-[#A78BFA] font-bold border border-[#8B5CF6]/30 leading-none">
                TRACKER
              </span>
            </div>
            <p className="text-xs text-[#64748B] font-medium leading-none mt-1">
              Media Ecosystem
            </p>
          </div>
        </div>

        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden p-2 rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#151932]"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links Area */}
      <div className="flex-1 overflow-y-auto px-3 py-3.5 space-y-1 custom-scrollbar">
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item);

          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 text-left select-none cursor-pointer group ${
                active
                  ? 'bg-[#181436] text-[#F8FAFC] border border-[#8B5CF6]/40 shadow-sm shadow-[#7C3AED]/20 ring-1 ring-[#8B5CF6]/20'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#11152A] border border-transparent'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-colors ${
                  active
                    ? 'text-[#A78BFA]'
                    : 'text-[#64748B] group-hover:text-[#94A3B8]'
                }`}
              />
              <span className="truncate flex-1">{item.label}</span>
              {active && (
                <span className="w-2 h-2 rounded-full bg-[#8B5CF6] shadow-sm shadow-[#8B5CF6]" />
              )}
            </button>
          );
        })}
      </div>

      {/* User Profile Footer */}
      <div className="p-3 border-t border-[#1E2442] bg-[#080A18]/60 shrink-0 space-y-2.5">
        {loading ? (
          <div className="flex items-center gap-2.5 px-2 py-2 text-xs text-[#94A3B8]">
            <div className="w-9 h-9 rounded-xl bg-[#151932] animate-pulse" />
            <span>Загрузка...</span>
          </div>
        ) : dbUser ? (
          <div className="p-2.5 rounded-xl bg-[#0F132A] border border-[#1E2442] space-y-2.5">
            <div className="flex items-center justify-between gap-2.5">
              <div
                className="flex items-center gap-2.5 overflow-hidden cursor-pointer flex-1 group"
                onClick={() => {
                  navigate(`/u/${dbUser.username}`);
                  if (onCloseMobile) onCloseMobile();
                }}
              >
                <Avatar
                  src={dbUser.avatar}
                  username={dbUser.username}
                  size="sm"
                />
                <div className="overflow-hidden min-w-0">
                  <p className="text-sm font-bold text-[#F8FAFC] group-hover:text-[#A78BFA] transition-colors truncate leading-tight">
                    @{dbUser.username}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#161233] border border-[#8B5CF6]/30 text-[10px] font-mono font-bold text-[#A78BFA] tabular-nums">
                      <Trophy className="w-3 h-3 text-[#8B5CF6]" />
                      {dbUser.pts ?? 0} PTS
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    navigate('/notifications');
                    if (onCloseMobile) onCloseMobile();
                  }}
                  title="Уведомления"
                  className="p-2 text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] rounded-xl transition-colors relative cursor-pointer"
                >
                  <Bell className="w-4.5 h-4.5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-rose-500 border border-[#0B0D20] flex items-center justify-center text-[8px] font-bold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => logout()}
                  title="Выйти"
                  className="p-2 text-[#94A3B8] hover:text-rose-400 hover:bg-[#151932] rounded-xl transition-colors cursor-pointer"
                >
                  <LogOut className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Profile and Feedback buttons */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  navigate(`/u/${dbUser.username}`);
                  if (onCloseMobile) onCloseMobile();
                }}
                className="py-1.5 px-3 rounded-lg bg-[#151932] hover:bg-[#1A1F3E] text-[#CBD5E1] hover:text-[#F8FAFC] border border-[#1E2442] text-xs font-semibold transition-colors cursor-pointer text-center"
              >
                Профиль
              </button>
              <button
                type="button"
                onClick={() => setIsFeedbackOpen(true)}
                className="py-1.5 px-3 rounded-lg bg-[#151932] hover:bg-[#1A1F3E] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2442] text-xs font-semibold transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5 text-[#8B5CF6]" />
                Отзыв
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => login()}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-sm font-bold shadow-md shadow-[#7C3AED]/25 transition-all cursor-pointer"
          >
            <LogIn className="w-4.5 h-4.5" />
            Войти через Google
          </button>
        )}
      </div>

      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </aside>
  );
};

export const TopBar: React.FC<{
  onOpenMobileMenu: () => void;
}> = ({ onOpenMobileMenu }) => {
  const { dbUser, authFetch } = useAuth();
  const { navigate, route } = useRouter();
  const { unreadCount } = useNotifications();
  const [searchValue, setSearchValue] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpenSuggestions, setIsOpenSuggestions] = useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);
  const debounceTimerRef = React.useRef<any>(null);

  const getSectionTitle = (routeName: string) => {
    if (routeName === 'home') return 'Главная';
    if (routeName.startsWith('music')) {
      if (routeName === 'music-studio') return 'Студия музыки';
      if (routeName === 'music-artist') return 'Исполнитель';
      if (routeName === 'music-release') return 'Музыкальный релиз';
      return 'Музыка';
    }
    if (routeName.startsWith('library')) return 'Моя библиотека';
    if (routeName === 'search' || routeName.startsWith('game-catalog')) return 'Каталог';
    if (routeName === 'calendar') return 'Календарь';
    if (routeName === 'friends') return 'Друзья';
    if (routeName === 'lists' || routeName === 'list-detail') return 'Списки';
    if (routeName === 'tier-lists' || routeName === 'tier-list-detail') return 'Tier-листы';
    if (routeName === 'roulette') return 'Рулетка';
    if (routeName === 'achievements') return 'Достижения';
    if (routeName === 'statistics') return 'Статистика';
    if (routeName === 'news' || routeName === 'news-detail') return 'Новости';
    if (routeName === 'feed') return 'Лента';
    if (routeName === 'settings') return 'Настройки';
    if (routeName === 'admin') return 'Админ-панель';
    if (routeName === 'notifications') return 'Уведомления';
    if (routeName.startsWith('media-') || routeName === 'media-detail') return 'Карточка тайтла';
    if (routeName === 'profile' || routeName.startsWith('user-profile')) return 'Профиль';
    return 'Dodik Tracker';
  };

  const fetchSuggestions = async (q: string) => {
    if (!q || q.trim().length < 1) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await (authFetch || fetch)(`/api/search/autocomplete?q=${encodeURIComponent(q.trim())}&limit=6`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.results || []);
      }
    } catch (e) {
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchValue(val);
    setIsOpenSuggestions(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (val.trim().length >= 1) {
      debounceTimerRef.current = setTimeout(() => {
        fetchSuggestions(val);
      }, 250);
    } else {
      setSuggestions([]);
    }
  };

  // Close suggestions when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsOpenSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsOpenSuggestions(false);
    if (searchValue.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchValue.trim())}`);
    } else {
      navigate('/search');
    }
  };

  const handleSelectSuggestion = (item: any) => {
    setIsOpenSuggestions(false);
    setSearchValue('');
    const id = item.mediaId || item.id;
    if (id) {
      const typePath = (item.type || 'movie').toLowerCase();
      navigate(`/media/${typePath}/${id}`);
    } else {
      navigate(`/search?q=${encodeURIComponent(item.title || '')}`);
    }
  };

  return (
    <header className="h-[72px] border-b border-[#1E2442] bg-[#080A18]/85 backdrop-blur-xl sticky top-0 z-20 px-4 sm:px-6 lg:px-8 2xl:px-10 flex items-center justify-between gap-4">
      {/* Mobile Toggle & Brand */}
      <div className="flex items-center gap-3 md:hidden">
        <button
          onClick={onOpenMobileMenu}
          className="p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-[#94A3B8] hover:text-white"
          title="Меню"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-base text-[#F8FAFC] tracking-wider">
            DODIK
          </span>
        </div>
      </div>

      {/* Desktop Left: Current Section Title */}
      <div className="hidden md:flex items-center gap-2.5 min-w-[180px] shrink-0">
        <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider font-mono">
          Раздел /
        </span>
        <span className="text-base font-extrabold text-[#F8FAFC] tracking-tight truncate">
          {getSectionTitle(route.name)}
        </span>
      </div>

      {/* Global Search Bar in TopBar */}
      <div ref={searchContainerRef} className="hidden sm:flex items-center flex-1 max-w-lg mx-auto relative">
        <form onSubmit={handleSearchSubmit} className="relative w-full flex items-center">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#8B5CF6] pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={handleInputChange}
            onFocus={() => setIsOpenSuggestions(true)}
            placeholder="Быстрый поиск фильмов, аниме, игр, книг..."
            className="w-full h-11 pl-10 pr-16 rounded-xl bg-[#0B0D20] hover:bg-[#11152A] focus:bg-[#0B0D20] text-sm text-[#F8FAFC] placeholder-[#64748B] border border-[#1E2442] focus:border-[#8B5CF6]/80 focus:ring-1 focus:ring-[#8B5CF6]/30 transition-all outline-none"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchValue && (
              <button
                type="button"
                onClick={() => {
                  setSearchValue('');
                  setSuggestions([]);
                }}
                className="p-1 text-[#64748B] hover:text-[#F8FAFC] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="p-2 rounded-lg bg-[#151932] hover:bg-[#8B5CF6] text-[#A78BFA] hover:text-white transition-colors cursor-pointer"
              title="Поиск"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Autocomplete Dropdown */}
        {isOpenSuggestions && searchValue.trim().length >= 1 && (
          <div className="absolute top-13 left-0 right-0 bg-[#0B0D20] border border-[#1E2442] rounded-2xl shadow-2xl overflow-hidden z-50 divide-y divide-[#1E2442]/60">
            {suggestions.length > 0 ? (
              <div className="p-2 space-y-1 max-h-88 overflow-y-auto custom-scrollbar">
                {suggestions.map((item, idx) => (
                  <button
                    key={`${item.id || item.externalId}-${idx}`}
                    type="button"
                    onClick={() => handleSelectSuggestion(item)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#151932] text-left transition-colors cursor-pointer group"
                  >
                    {item.posterUrl ? (
                      <img
                        src={item.posterUrl}
                        alt=""
                        className="w-9 h-12 object-cover rounded-lg shrink-0 bg-[#151932]"
                      />
                    ) : (
                      <div className="w-9 h-12 rounded-lg bg-[#151932] flex items-center justify-center shrink-0 text-[#64748B] text-xs">
                        N/A
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#F8FAFC] group-hover:text-[#A78BFA] truncate">
                          {item.title}
                        </span>
                        {item.year && (
                          <span className="text-xs text-[#64748B] font-mono shrink-0">
                            {item.year}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-[#191D38] text-[#8B5CF6]">
                          {item.type}
                        </span>
                        {item.dodikRating && (
                          <span className="text-xs font-bold text-amber-400 font-mono">
                            ★ {item.dodikRating}
                          </span>
                        )}
                        {item.isAdult && (
                          <span className="text-[10px] font-bold text-rose-400 bg-rose-950/40 border border-rose-800/40 px-1.5 py-0.5 rounded">
                            18+
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleSearchSubmit}
                  className="w-full py-2.5 px-3 text-center text-sm font-bold text-[#A78BFA] hover:text-white hover:bg-[#151932] rounded-xl transition-colors cursor-pointer"
                >
                  Все результаты для «{searchValue}» →
                </button>
              </div>
            ) : isSearching ? (
              <div className="py-5 text-center text-xs sm:text-sm text-[#64748B] flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 animate-spin text-[#8B5CF6]" />
                <span>Поиск подсказок...</span>
              </div>
            ) : (
              <div className="p-4 text-center text-xs sm:text-sm text-[#64748B]">
                Ничего не найдено.{' '}
                <button
                  type="button"
                  onClick={handleSearchSubmit}
                  className="text-[#8B5CF6] hover:underline font-semibold"
                >
                  Искать в общем каталоге
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        {/* Quick Search trigger for mobile */}
        <button
          onClick={() => navigate('/search')}
          className="sm:hidden p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-[#94A3B8] hover:text-white"
          title="Поиск"
        >
          <Search className="w-4.5 h-4.5" />
        </button>

        {/* Roulette quick button */}
        <button
          onClick={() => navigate('/roulette')}
          className="hidden md:inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#151932] hover:bg-[#191D38] text-xs sm:text-sm font-semibold text-[#A78BFA] hover:text-white border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-all cursor-pointer"
        >
          <Dice5 className="w-4 h-4 text-[#8B5CF6]" />
          <span>Рулетка</span>
        </button>

        {/* Messenger Drawer Toggle Button */}
        {dbUser && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle_messenger'))}
            className="p-2.5 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors relative cursor-pointer"
            title="Сообщения"
          >
            <MessageSquare className="w-4.5 h-4.5" />
          </button>
        )}

        {/* Notifications Icon Button */}
        {dbUser && (
          <button
            onClick={() => navigate('/notifications')}
            className="p-2.5 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors relative cursor-pointer"
            title="Уведомления"
          >
            <Bell className="w-4.5 h-4.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-rose-500 border-2 border-[#080A18] flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        )}

        {/* User Mini Profile / Avatar Button */}
        {dbUser ? (
          <div
            onClick={() => navigate(`/u/${dbUser.username}`)}
            className="flex items-center gap-2.5 p-1 pl-2.5 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] cursor-pointer transition-colors"
          >
            <span className="hidden lg:inline text-xs sm:text-sm font-bold text-[#F8FAFC] max-w-[100px] truncate">
              @{dbUser.username}
            </span>
            <Avatar src={dbUser.avatar} username={dbUser.username} size="xs" />
          </div>
        ) : null}
      </div>
    </header>
  );
};

export const MobileBottomNav: React.FC = () => {
  const { route, navigate } = useRouter();
  const { dbUser } = useAuth();
  const currentRouteName = route.name;

  const items = [
    { id: 'home', label: 'Главная', icon: Compass, path: '/' },
    { id: 'search', label: 'Каталог', icon: Search, path: '/search' },
    { id: 'library', label: 'Библиотека', icon: Library, path: '/library' },
    { id: 'roulette', label: 'Рулетка', icon: Dice5, path: '/roulette' },
    {
      id: 'profile',
      label: 'Профиль',
      icon: Users,
      path: dbUser ? `/u/${dbUser.username}` : '/profile',
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-safe bg-[#0B0D20]/95 backdrop-blur-xl border-t border-[#1E2442] flex items-center justify-around px-1 z-40">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          (item.id === 'home' && currentRouteName === 'home') ||
          (item.id === 'search' && (currentRouteName === 'search' || currentRouteName.startsWith('game-catalog'))) ||
          (item.id === 'library' && currentRouteName.startsWith('library')) ||
          (item.id === 'roulette' && currentRouteName === 'roulette') ||
          (item.id === 'profile' && currentRouteName === 'profile');

        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center flex-1 py-1.5 text-xs font-medium transition-colors select-none cursor-pointer ${
              isActive
                ? 'text-[#A78BFA] font-bold'
                : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-[#8B5CF6]' : 'text-[#64748B]'}`} />
            <span className="truncate max-w-full text-[11px]">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export const AppShell: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { currentTrack } = useMusicPlayer();

  return (
    <div className="min-h-screen bg-[#080A18] text-[#F8FAFC] flex antialiased">
      {/* Permanent Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-76 max-w-[85vw] h-full shadow-2xl">
            <Sidebar onCloseMobile={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        <main className={`flex-1 min-w-0 px-4 sm:px-6 lg:px-8 2xl:px-10 py-7 max-w-[1760px] 2xl:max-w-[1920px] mx-auto w-full transition-all ${
          currentTrack ? 'pb-[calc(9.5rem+env(safe-area-inset-bottom,0px))] md:pb-28' : 'pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-12'
        }`}>
          {children}
        </main>

        <MobileBottomNav />
      </div>
    </div>
  );
};
