import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Users,
  Film,
  Activity,
  Key,
  ShieldCheck,
  Radio,
  Newspaper,
  Bell,
  Trophy,
  TrendingUp,
  FileText,
  Settings,
  LayoutDashboard,
  Ticket,
  MessageSquare,
  Menu,
  X,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Server,
  Zap,
  Music,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AdminDashboardTab } from '../admin/AdminDashboardTab.tsx';
import { AdminUsersTab } from '../admin/AdminUsersTab.tsx';
import { AdminMusiciansTab } from '../admin/AdminMusiciansTab.tsx';
import { AdminMusicModerationTab } from '../admin/AdminMusicModerationTab.tsx';
import { AdminModerationTab } from '../admin/AdminModerationTab.tsx';
import { AdminFeedbackTab } from '../admin/AdminFeedbackTab.tsx';
import { AdminNewsTab } from '../admin/AdminNewsTab.tsx';
import { AdminAnnouncementsTab } from '../admin/AdminAnnouncementsTab.tsx';
import { AdminContentTab } from '../admin/AdminContentTab.tsx';
import { AdminNotificationsTab } from '../admin/AdminNotificationsTab.tsx';
import { AdminAchievementsTab } from '../admin/AdminAchievementsTab.tsx';
import { AdminAnalyticsTab } from '../admin/AdminAnalyticsTab.tsx';
import { AdminIntegrationsTab } from '../admin/AdminIntegrationsTab.tsx';
import { AdminAuditTab } from '../admin/AdminAuditTab.tsx';
import { AdminSettingsTab } from '../admin/AdminSettingsTab.tsx';
import { AdminInvitesTab } from '../admin/AdminInvitesTab.tsx';
import { AdminUpdatesTab } from '../admin/AdminUpdatesTab.tsx';

export type AdminTabType =
  | 'dashboard'
  | 'users'
  | 'musicians'
  | 'music_moderation'
  | 'moderation'
  | 'content'
  | 'achievements'
  | 'news'
  | 'announcements'
  | 'feedback'
  | 'invites'
  | 'integrations'
  | 'audit'
  | 'settings'
  | 'notifications'
  | 'analytics'
  | 'updates';

interface SidebarItem {
  id: AdminTabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  canAccess: boolean;
  group: 'main' | 'comms' | 'system' | 'tools';
  badge?: string | number;
  badgeVariant?: 'alert' | 'purple' | 'neutral';
}

export const AdminView: React.FC = () => {
  const { dbUser, authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTabType>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingReportsCount, setPendingReportsCount] = useState<number | null>(null);
  const [pendingMusicCount, setPendingMusicCount] = useState<number | null>(null);

  const role = dbUser?.role || 'USER';
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isAdmin = role === 'ADMIN' || isSuperAdmin;
  const isModerator = role === 'MODERATOR' || isAdmin;
  const isContentManager = role === 'CONTENT_MANAGER' || isAdmin;
  const isNewsEditor = role === 'NEWS_EDITOR' || isAdmin;

  const isStaff = isSuperAdmin || isAdmin || isModerator || isContentManager || isNewsEditor;

  // Check URL query parameters for tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['music_moderation', 'musicians', 'users', 'moderation', 'dashboard'].includes(tabParam)) {
      setActiveTab(tabParam as AdminTabType);
    }
  }, []);

  // Fetch pending reports badge count for the Moderation tab and pending music releases badge
  useEffect(() => {
    if (!isStaff) return;
    let isMounted = true;
    const fetchBadges = async () => {
      try {
        const [repRes, musRes] = await Promise.all([
          authFetch('/api/admin/reports?status=PENDING&limit=1'),
          authFetch('/api/music/admin/releases/pending-count'),
        ]);

        if (repRes.ok && isMounted) {
          const data = await repRes.json();
          setPendingReportsCount(data.total || 0);
        }

        if (musRes.ok && isMounted) {
          const mData = await musRes.json();
          setPendingMusicCount(mData.count || 0);
        }
      } catch (err) {
        // Silently continue
      }
    };
    fetchBadges();
    return () => {
      isMounted = false;
    };
  }, [authFetch, isStaff, activeTab]);

  // Sidebar item list conforming to the exact requested hierarchy
  const sidebarItems: SidebarItem[] = useMemo(() => {
    return [
      // 1. Dashboard
      {
        id: 'dashboard',
        label: 'Дашборд',
        icon: LayoutDashboard,
        canAccess: isStaff,
        group: 'main',
      },
      // 2. Users
      {
        id: 'users',
        label: 'Пользователи',
        icon: Users,
        canAccess: isModerator,
        group: 'main',
      },
      // 2b. Musicians
      {
        id: 'musicians',
        label: 'Музыканты',
        icon: Users,
        canAccess: isModerator,
        group: 'main',
      },
      // 2c. Music Moderation
      {
        id: 'music_moderation',
        label: 'Музыкальная модерация',
        icon: Music,
        canAccess: isModerator || isContentManager,
        group: 'main',
        badge: pendingMusicCount && pendingMusicCount > 0 ? pendingMusicCount : undefined,
        badgeVariant: 'purple',
      },
      // 3. Moderation
      {
        id: 'moderation',
        label: 'Модерация',
        icon: ShieldCheck,
        canAccess: isModerator || isContentManager,
        group: 'main',
        badge: pendingReportsCount && pendingReportsCount > 0 ? pendingReportsCount : undefined,
        badgeVariant: 'alert',
      },
      // 4. Content
      {
        id: 'content',
        label: 'Контент',
        icon: Film,
        canAccess: isContentManager,
        group: 'main',
      },
      // 5. Achievements
      {
        id: 'achievements',
        label: 'Достижения',
        icon: Trophy,
        canAccess: isAdmin,
        group: 'main',
      },

      // 6. News
      {
        id: 'news',
        label: 'Новости',
        icon: Newspaper,
        canAccess: isNewsEditor,
        group: 'comms',
      },
      // 7. Announcements
      {
        id: 'announcements',
        label: 'Объявления',
        icon: Radio,
        canAccess: isNewsEditor,
        group: 'comms',
      },
      // 8. Feedback
      {
        id: 'feedback',
        label: 'Обратная связь',
        icon: MessageSquare,
        canAccess: isModerator,
        group: 'comms',
      },
      // 9. Invites
      {
        id: 'invites',
        label: 'Инвайт-коды',
        icon: Ticket,
        canAccess: isAdmin,
        group: 'comms',
      },

      // 10. Integrations
      {
        id: 'integrations',
        label: 'Интеграции',
        icon: Key,
        canAccess: isAdmin,
        group: 'system',
      },
      // 11. Audit Log
      {
        id: 'audit',
        label: 'Журнал аудита',
        icon: FileText,
        canAccess: isModerator,
        group: 'system',
      },
      // 12. Settings
      {
        id: 'settings',
        label: 'Настройки',
        icon: Settings,
        canAccess: isAdmin,
        group: 'system',
      },

      // Additional Tools
      {
        id: 'notifications',
        label: 'Уведомления',
        icon: Bell,
        canAccess: isAdmin,
        group: 'tools',
      },
      {
        id: 'analytics',
        label: 'Аналитика',
        icon: TrendingUp,
        canAccess: isAdmin,
        group: 'tools',
      },
      {
        id: 'updates',
        label: 'Обновления',
        icon: Zap,
        canAccess: isAdmin,
        group: 'tools',
      },
    ];
  }, [isStaff, isModerator, isContentManager, isNewsEditor, isAdmin, pendingReportsCount, pendingMusicCount]);

  const accessibleItems = useMemo(() => sidebarItems.filter((i) => i.canAccess), [sidebarItems]);

  if (!isStaff) {
    return (
      <div className="flex flex-col items-center justify-center py-28 px-4 text-center max-w-lg mx-auto">
        <div className="w-18 h-18 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-5 shadow-xl">
          <ShieldAlert className="w-9 h-9" />
        </div>
        <h2 className="text-2xl font-extrabold text-white mb-2 font-mono">Доступ ограничен</h2>
        <p className="text-sm sm:text-base text-[#94A3B8] leading-relaxed">
          Панель управления предназначена исключительно для уполномоченной администрации и
          модераторов Dodik Tracker.
        </p>
      </div>
    );
  }

  const currentTabAllowed = accessibleItems.some((t) => t.id === activeTab);
  const currentTab = currentTabAllowed ? activeTab : (accessibleItems[0]?.id || 'dashboard');
  const activeTabDef = sidebarItems.find((i) => i.id === currentTab);

  const handleSelectTab = (tabId: AdminTabType) => {
    setActiveTab(tabId);
    setSidebarOpen(false);
  };

  const renderNavGroup = (title: string, groupKey: 'main' | 'comms' | 'system' | 'tools') => {
    const items = accessibleItems.filter((i) => i.group === groupKey);
    if (items.length === 0) return null;

    return (
      <div className="space-y-1.5">
        <div className="px-3 text-xs font-mono font-bold uppercase tracking-wider text-[#64748B]">
          {title}
        </div>
        <div className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer group ${
                  isActive
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-lg shadow-[#7C3AED]/25 font-bold'
                    : 'text-[#94A3B8] hover:text-white hover:bg-[#11152A]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4.5 h-4.5 shrink-0 transition-colors ${
                      isActive ? 'text-white' : 'text-[#64748B] group-hover:text-purple-300'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold shrink-0 ${
                      item.badgeVariant === 'alert'
                        ? 'bg-amber-500 text-black animate-pulse'
                        : isActive
                        ? 'bg-white/25 text-white'
                        : 'bg-[#1E2442] text-[#A78BFA]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full pb-16">
      {/* CONTROL CENTER SHELL: SIDEBAR + MAIN CONTENT (FULL WIDTH) */}
      <div className="flex flex-col lg:flex-row gap-5 items-start w-full">
        {/* MOBILE TOP CONTROLLER TOGGLE */}
        <div className="lg:hidden w-full p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-white cursor-pointer"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs sm:text-sm font-mono font-bold text-white">ПАНЕЛЬ УПРАВЛЕНИЯ</span>
            </div>
          </div>
          <div className="text-xs sm:text-sm font-mono text-[#A78BFA] px-3 py-1 rounded-xl bg-[#11152A] border border-[#1E2442] font-semibold">
            {activeTabDef?.label}
          </div>
        </div>

        {/* SIDEBAR BACKDROP ON MOBILE */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
          />
        )}

        {/* SIDEBAR NAVIGATION (Wide & spacious ~268px) */}
        <aside
          className={`fixed lg:sticky top-0 lg:top-4 left-0 h-full lg:h-[calc(100vh-2rem)] w-68 shrink-0 max-w-[85vw] bg-[#0B0D20] border border-[#1E2442] rounded-r-3xl lg:rounded-3xl p-4 flex flex-col justify-between z-50 lg:z-10 shadow-2xl transition-transform duration-200 overflow-hidden ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="space-y-4 overflow-y-auto custom-scrollbar pr-1 flex-1">
            {/* Control Center Brand / Status */}
            <div className="pb-3 border-b border-[#1E2442]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#6366F1] flex items-center justify-center text-white shadow-md shadow-[#7C3AED]/30">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xs sm:text-sm font-black text-white font-mono tracking-wider">
                      DODIK ADMIN
                    </h2>
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-mono text-emerald-400 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      ОНЛАЙН
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden p-1.5 text-[#94A3B8] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Admin Profile Pill */}
              <div className="mt-3 p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {dbUser?.avatar ? (
                    <img
                      src={dbUser.avatar}
                      alt={dbUser.username}
                      className="w-8 h-8 rounded-xl object-cover border border-[#1E2442]"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-xl bg-purple-900/50 text-purple-300 font-bold text-xs flex items-center justify-center font-mono">
                      {dbUser?.username?.charAt(0).toUpperCase() || 'A'}
                    </div>
                  )}
                  <span className="text-xs sm:text-sm font-mono font-bold text-white truncate">
                    @{dbUser?.username}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-lg text-[10px] sm:text-xs font-mono font-bold border ${
                    isSuperAdmin
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      : isAdmin
                      ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                      : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                  }`}
                >
                  {role}
                </span>
              </div>
            </div>

            {/* Sidebar Navigation Groups */}
            <div className="space-y-4">
              {renderNavGroup('Основное', 'main')}
              {renderNavGroup('Контент и связь', 'comms')}
              {renderNavGroup('Система', 'system')}
              {renderNavGroup('Инструменты', 'tools')}
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className="pt-3 border-t border-[#1E2442] text-xs font-mono text-[#64748B] flex items-center justify-between shrink-0">
            <span>Dodik Tracker Admin</span>
            <span className="text-xs text-emerald-400 font-bold">v1.0.0</span>
          </div>
        </aside>

        {/* MAIN CONTROL CENTER VIEWPORT (FULL AVAILABLE WIDTH) */}
        <main className="flex-1 w-full min-w-0 space-y-5">
          {/* Top Control Bar */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-center text-[#A78BFA] shadow-inner shrink-0">
                {activeTabDef ? (
                  <activeTabDef.icon className="w-5 h-5" />
                ) : (
                  <LayoutDashboard className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
                    Панель управления
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#64748B]" />
                  <span className="text-xs sm:text-sm font-mono font-bold text-[#A78BFA]">
                    {activeTabDef?.label}
                  </span>
                </div>
                <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                  {activeTabDef?.id === 'dashboard' && 'Оперативная сводка системы'}
                  {activeTabDef?.id === 'users' && 'Управление пользователями'}
                  {activeTabDef?.id === 'musicians' && 'Музыканты и заявки на статус'}
                  {activeTabDef?.id === 'music_moderation' && 'Модерация музыкальных релизов'}
                  {activeTabDef?.id === 'moderation' && 'Очередь модерации контента'}
                  {activeTabDef?.id === 'content' && 'Каталог произведений и медиа'}
                  {activeTabDef?.id === 'achievements' && 'Система наград и достижений'}
                  {activeTabDef?.id === 'news' && 'Публикация новостей'}
                  {activeTabDef?.id === 'announcements' && 'Системные объявления'}
                  {activeTabDef?.id === 'feedback' && 'Обратная связь и репорты'}
                  {activeTabDef?.id === 'invites' && 'Инвайт-коды и регистрации'}
                  {activeTabDef?.id === 'integrations' && 'API интеграции и ключи'}
                  {activeTabDef?.id === 'audit' && 'Журнал аудита действий'}
                  {activeTabDef?.id === 'settings' && 'Глобальная конфигурация'}
                  {activeTabDef?.id === 'notifications' && 'Системная рассылка'}
                  {activeTabDef?.id === 'analytics' && 'Глубокая аналитика платформы'}
                  {activeTabDef?.id === 'updates' && 'Журнал обновлений'}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              <div className="px-3.5 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs sm:text-sm font-mono text-[#94A3B8] flex items-center gap-2 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>СЕРВЕР: РАБОТАЕТ</span>
              </div>
            </div>
          </div>

          {/* Active Tab Component */}
          <div className="min-h-[550px] w-full">
            {currentTab === 'dashboard' && (
              <AdminDashboardTab onNavigateTab={(tab) => handleSelectTab(tab as AdminTabType)} />
            )}
            {currentTab === 'users' && <AdminUsersTab />}
            {currentTab === 'musicians' && <AdminMusiciansTab />}
            {currentTab === 'music_moderation' && <AdminMusicModerationTab />}
            {currentTab === 'moderation' && <AdminModerationTab />}
            {currentTab === 'content' && <AdminContentTab />}
            {currentTab === 'achievements' && <AdminAchievementsTab />}
            {currentTab === 'news' && <AdminNewsTab />}
            {currentTab === 'announcements' && <AdminAnnouncementsTab />}
            {currentTab === 'feedback' && <AdminFeedbackTab />}
            {currentTab === 'invites' && <AdminInvitesTab />}
            {currentTab === 'integrations' && <AdminIntegrationsTab />}
            {currentTab === 'audit' && <AdminAuditTab />}
            {currentTab === 'settings' && <AdminSettingsTab />}
            {currentTab === 'notifications' && <AdminNotificationsTab />}
            {currentTab === 'analytics' && <AdminAnalyticsTab />}
            {currentTab === 'updates' && <AdminUpdatesTab />}
          </div>
        </main>
      </div>
    </div>
  );
};
