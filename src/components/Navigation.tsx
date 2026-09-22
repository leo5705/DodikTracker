import React, { useState, useEffect } from 'react';
import {
  Compass,
  Film,
  Tv,
  Gamepad2,
  Book,
  BookOpen,
  Flame,
  Library,
  Radio,
  Users,
  ListOrdered,
  Dice5,
  Layers,
  BarChart3,
  CalendarDays,
  ShieldAlert,
  Settings,
  Bell,
  LogIn,
  LogOut,
  Sparkles,
  ChevronDown,
  Search,
  Trophy,
  Newspaper,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import { useNotifications } from '../context/NotificationContext.tsx';
import { FeedbackModal } from "./modals/FeedbackModal.tsx";
import { MessageSquare } from "lucide-react";

export type ActiveTab =
  | 'home'
  | 'search'
  | 'library'
  | 'feed'
  | 'friends'
  | 'lists'
  | 'roulette'
  | 'tier-lists'
  | 'statistics'
  | 'achievements'
  | 'news'
  | 'calendar'
  | 'admin'
  | 'profile'
  | 'settings';

interface NavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  selectedCategory?: string;
  onSelectCategory?: (cat: string) => void;
  onOpenProfile?: () => void;
  onOpenSettings?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  selectedCategory = 'ALL',
  onSelectCategory,
  onOpenProfile,
  onOpenSettings,
}) => {
  const { dbUser, login, logout, loading, authFetch } = useAuth();
  const { navigate, route } = useRouter();
  const { unreadCount } = useNotifications();
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const isStaff = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MANAGER', 'NEWS_EDITOR'].includes(dbUser?.role || '');
  const isAdmin = isStaff;

  // Derive active tab from route name if available
  const effectiveTab: ActiveTab = (() => {
    switch (route.name) {
      case 'home':
        return 'home';
      case 'search':
        return 'search';
      case 'library':
        return 'library';
      case 'feed':
        return 'feed';
      case 'friends':
        return 'friends';
      case 'lists':
      case 'list-detail':
        return 'lists';
      case 'roulette':
        return 'roulette';
      case 'tier-lists':
      case 'tier-list-detail':
        return 'tier-lists';
      case 'statistics':
        return 'statistics';
      case 'achievements':
        return 'achievements';
      case 'news':
      case 'news-detail':
        return 'news';
      case 'calendar':
        return 'calendar';
      case 'admin':
        return 'admin';
      case 'profile':
        return 'profile';
      case 'settings':
        return 'settings';
      default:
        return activeTab;
    }
  })();

  const handleTabClick = (tabId: ActiveTab) => {
    setActiveTab(tabId);
    const pathMap: Record<string, string> = {
      home: '/',
      search: '/search',
      library: '/library',
      feed: '/feed',
      friends: '/friends',
      lists: '/lists',
      roulette: '/roulette',
      'tier-lists': '/tier-lists',
      statistics: '/statistics',
      achievements: '/achievements',
      news: '/news',
      calendar: '/calendar',
      admin: '/admin',
      profile: dbUser ? `/u/${dbUser.username}` : '/profile',
      settings: '/settings',
    };
    if (pathMap[tabId]) {
      navigate(pathMap[tabId]);
    }
  };

  const handleCategoryClick = (catId: string) => {
    onSelectCategory?.(catId);
    if (catId === 'GAME') {
      navigate('/games/catalog');
      return;
    }
    setActiveTab('library');
    navigate(`/library?category=${catId}`);
  };

  const handleProfileClick = () => {
    if (dbUser) {
      navigate(`/u/${dbUser.username}`);
    } else {
      onOpenProfile?.();
    }
  };

  const handleSettingsClick = () => {
    navigate('/settings');
    onOpenSettings?.();
  };

  const categories = [
    { id: 'MOVIE', label: 'Фильмы', icon: Film, color: 'text-purple-400' },
    { id: 'TV', label: 'Сериалы', icon: Tv, color: 'text-indigo-400' },
    { id: 'ANIME', label: 'Аниме', icon: Sparkles, color: 'text-fuchsia-400' },
    { id: 'MANGA', label: 'Манга', icon: BookOpen, color: 'text-pink-400' },
    { id: 'GAME', label: 'Игры', icon: Gamepad2, color: 'text-emerald-400' },
    { id: 'BOOK', label: 'Книги', icon: Book, color: 'text-amber-400' },
    { id: 'COMIC', label: 'Комиксы', icon: Flame, color: 'text-orange-400' },
  ];

  const mainTools = [
    { id: 'home', label: 'Главная', icon: Compass },
    { id: 'search', label: 'Поиск и Каталог', icon: Search },
    { id: 'library', label: 'Моя библиотека', icon: Library },
    { id: 'feed', label: 'Лента сообщества', icon: Radio },
    { id: 'friends', label: 'Друзья', icon: Users },
    { id: 'lists', label: 'Коллекции', icon: ListOrdered },
    { id: 'roulette', label: 'Рулетка выбора', icon: Dice5 },
    { id: 'tier-lists', label: 'Tier Lists', icon: Layers },
    { id: 'statistics', label: 'Статистика', icon: BarChart3 },
    { id: 'achievements', label: 'Достижения', icon: Trophy },
    { id: 'news', label: 'Новости', icon: Newspaper },
    { id: 'calendar', label: 'Календарь релизов', icon: CalendarDays },
  ];

  if (isAdmin) {
    mainTools.push({ id: 'admin', label: 'Админ-панель', icon: ShieldAlert });
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        id="desktop-sidebar"
        className="hidden md:flex flex-col w-64 border-r border-[#252233] bg-[#0F0E12] h-screen sticky top-0 shrink-0 select-none z-30"
      >
        {/* Brand Header */}
        <div className="p-5 pb-4 border-b border-[#252233] flex items-center justify-between">
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => handleTabClick('home')}
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#9B6BFF] to-[#6366F1] flex items-center justify-center shadow-lg shadow-purple-950/50 group-hover:scale-105 transition-transform duration-200">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black tracking-wider text-[#F3F1F8] text-base font-mono">
                  DODIK
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-[#AC82FF] font-bold border border-purple-500/30">
                  TRACKER
                </span>
              </div>
              <p className="text-[10px] text-[#9A94AA] font-medium">Медиа & Социальная сеть</p>
            </div>
          </div>
        </div>

        {/* Scrollable Navigation Area */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
          {/* Main Navigation */}
          <div className="space-y-0.5">
            <div className="px-3 pb-1.5 text-[10px] font-bold text-[#656075] uppercase tracking-wider font-mono">
              ОБЗОР
            </div>
            {mainTools.map((item) => {
              const Icon = item.icon;
              const isActive = effectiveTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-item-${item.id}`}
                  onClick={() => handleTabClick(item.id as ActiveTab)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                    isActive
                      ? 'bg-[#191724] text-[#AC82FF] border border-[#3A344E] shadow-sm'
                      : 'text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#14131A] border border-transparent'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-[#9B6BFF]' : 'text-[#9A94AA]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#9B6BFF] shadow-sm shadow-[#9B6BFF]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Media Categories Separation */}
          <div className="space-y-0.5 pt-2 border-t border-[#252233]/70">
            <div className="px-3 pb-1.5 text-[10px] font-bold text-[#656075] uppercase tracking-wider font-mono flex items-center justify-between">
              <span>КАТЕГОРИИ</span>
              <span className="text-[9px] text-[#9A94AA]">8 разделов</span>
            </div>
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = effectiveTab === 'library' && selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all text-left ${
                    isSelected
                      ? 'bg-[#191724] text-white border border-[#3A344E]'
                      : 'text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#14131A] border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${cat.color}`} />
                  <span className="truncate">{cat.label}</span>
                  {isSelected && (
                    <span className="ml-auto text-[10px] text-[#AC82FF] font-mono">●</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* User Footer / Auth Section */}
        <div className="p-3 border-t border-[#252233] bg-[#121118]">
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-[#9A94AA]">
              <div className="w-8 h-8 rounded-xl bg-[#191724] animate-pulse" />
              <span>Загрузка...</span>
            </div>
          ) : dbUser ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-[#191724] transition-colors">
                <div
                  className="flex items-center gap-2 overflow-hidden cursor-pointer flex-1"
                  onClick={handleProfileClick}
                >
                  {dbUser.avatar ? (
                    <img
                      src={dbUser.avatar}
                      alt={dbUser.username}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-xl border border-[#3A344E] object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-xl bg-purple-900/80 border border-purple-500/40 flex items-center justify-center text-xs font-bold text-purple-200 shrink-0">
                      {dbUser.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-[#F3F1F8] truncate leading-tight">
                      @{dbUser.username}
                    </p>
                    <p className="text-[10px] text-[#AC82FF] font-mono">
                      {dbUser.role === 'SUPER_ADMIN'
                        ? 'Главный админ'
                        : dbUser.role === 'ADMIN'
                        ? 'Администратор'
                        : 'Профиль'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => navigate('/notifications')}
                    title="Уведомления"
                    className="p-1.5 text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#252233] rounded-lg transition-colors relative"
                  >
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-[#121118] flex items-center justify-center text-[8px] font-bold text-white shadow-sm">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={handleSettingsClick}
                    title="Настройки аккаунта"
                    className="p-1.5 text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#252233] rounded-lg transition-colors relative"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => logout()}
                    title="Выйти"
                    className="p-1.5 text-[#9A94AA] hover:text-red-400 hover:bg-[#252233] rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => login()}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold shadow-lg shadow-purple-950/40 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Войти через Google
            </button>
          )}

          {/* Feedback Button */}
          <button
            onClick={() => setIsFeedbackModalOpen(true)}
            className="w-full mt-2 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#191724] hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8] border border-[#252233] text-xs font-semibold transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Обратная связь
          </button>
        </div>
      </aside>

      {/* Modals */}
      <FeedbackModal 
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
      />

      {/* Mobile Top Bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#0F0E12]/95 backdrop-blur-md border-b border-[#252233] px-4 flex items-center justify-between z-40">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => handleTabClick('home')}
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#9B6BFF] to-[#6366F1] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-black tracking-wider text-[#F3F1F8] text-sm font-mono">
            DODIK
          </span>
        </div>

        <div className="flex items-center gap-2">
          {dbUser ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigate('/notifications')}
                className="p-1.5 text-[#9A94AA] hover:text-white relative"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 border border-[#0F0E12]" />
                )}
              </button>
              <button
                onClick={() => setIsFeedbackModalOpen(true)}
                className="p-1.5 text-[#9A94AA] hover:text-white"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
              <button
                onClick={handleSettingsClick}
                className="p-1.5 text-[#9A94AA] hover:text-white"
              >
                <Settings className="w-4 h-4" />
              </button>
              <div
                className="cursor-pointer"
                onClick={handleProfileClick}
              >
                {dbUser.avatar ? (
                  <img
                    src={dbUser.avatar}
                    alt={dbUser.username}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-lg border border-[#3A344E] object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-purple-900 flex items-center justify-center text-xs text-purple-200">
                    {dbUser.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => login()}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#9B6BFF] text-white font-medium"
            >
              Войти
            </button>
          )}
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav
        id="mobile-bottom-nav"
        className="md:hidden fixed bottom-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-safe bg-[#0F0E12]/95 backdrop-blur-xl border-t border-[#252233] flex items-center justify-around px-1 z-40"
      >
        {[
          { id: 'home', label: 'Главная', icon: Compass },
          { id: 'search', label: 'Поиск', icon: Search },
          { id: 'library', label: 'Библиотека', icon: Library },
          { id: 'feed', label: 'Лента', icon: Radio },
          { id: 'roulette', label: 'Рулетка', icon: Dice5 },
          ...(isAdmin ? [{ id: 'admin', label: 'Админ', icon: ShieldAlert }] : []),
        ].map((item) => {
          const Icon = item.icon;
          const isActive = effectiveTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id as ActiveTab)}
              className={`flex flex-col items-center justify-center flex-1 max-w-[4.5rem] py-1 text-[10px] font-medium transition-colors touch-manipulation select-none ${
                isActive ? 'text-[#AC82FF] font-semibold' : 'text-[#9A94AA] hover:text-[#F3F1F8]'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-[#9B6BFF]' : 'text-[#9A94AA]'}`} />
              <span className="truncate max-w-full">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
