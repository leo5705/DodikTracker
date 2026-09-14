import React, { useState, useMemo } from 'react';
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
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AdminDashboardTab } from '../admin/AdminDashboardTab.tsx';
import { AdminUsersTab } from '../admin/AdminUsersTab.tsx';
import { AdminModerationTab } from '../admin/AdminModerationTab.tsx';
import { AdminNewsTab } from '../admin/AdminNewsTab.tsx';
import { AdminAnnouncementsTab } from '../admin/AdminAnnouncementsTab.tsx';
import { AdminContentTab } from '../admin/AdminContentTab.tsx';
import { AdminNotificationsTab } from '../admin/AdminNotificationsTab.tsx';
import { AdminAchievementsTab } from '../admin/AdminAchievementsTab.tsx';
import { AdminAnalyticsTab } from '../admin/AdminAnalyticsTab.tsx';
import { AdminIntegrationsTab } from '../admin/AdminIntegrationsTab.tsx';
import { AdminAuditTab } from '../admin/AdminAuditTab.tsx';
import { AdminSettingsTab } from '../admin/AdminSettingsTab.tsx';

export type AdminTabType =
  | 'dashboard'
  | 'moderation'
  | 'users'
  | 'content'
  | 'news'
  | 'announcements'
  | 'notifications'
  | 'achievements'
  | 'analytics'
  | 'integrations'
  | 'audit'
  | 'settings';

interface TabDefinition {
  id: AdminTabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  canAccess: boolean;
  badge?: string | number;
}

export const AdminView: React.FC = () => {
  const { dbUser } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTabType>('dashboard');

  const role = dbUser?.role || 'USER';
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isAdmin = role === 'ADMIN' || isSuperAdmin;
  const isModerator = role === 'MODERATOR' || isAdmin;
  const isContentManager = role === 'CONTENT_MANAGER' || isAdmin;
  const isNewsEditor = role === 'NEWS_EDITOR' || isAdmin;

  const isStaff = isSuperAdmin || isAdmin || isModerator || isContentManager || isNewsEditor;

  const tabs: TabDefinition[] = useMemo(() => {
    return [
      {
        id: 'dashboard',
        label: 'Обзор',
        icon: LayoutDashboard,
        canAccess: isStaff,
      },
      {
        id: 'moderation',
        label: 'Модерация',
        icon: ShieldCheck,
        canAccess: isModerator || isContentManager,
      },
      {
        id: 'users',
        label: 'Пользователи',
        icon: Users,
        canAccess: isModerator,
      },
      {
        id: 'content',
        label: 'Каталог',
        icon: Film,
        canAccess: isContentManager,
      },
      {
        id: 'news',
        label: 'Новости',
        icon: Newspaper,
        canAccess: isNewsEditor,
      },
      {
        id: 'announcements',
        label: 'Объявления',
        icon: Radio,
        canAccess: isNewsEditor,
      },
      {
        id: 'notifications',
        label: 'Рассылка',
        icon: Bell,
        canAccess: isAdmin,
      },
      {
        id: 'achievements',
        label: 'Достижения',
        icon: Trophy,
        canAccess: isAdmin,
      },
      {
        id: 'analytics',
        label: 'Аналитика',
        icon: TrendingUp,
        canAccess: isAdmin,
      },
      {
        id: 'integrations',
        label: 'Интеграции',
        icon: Key,
        canAccess: isAdmin,
      },
      {
        id: 'audit',
        label: 'Аудит',
        icon: FileText,
        canAccess: isModerator,
      },
      {
        id: 'settings',
        label: 'Настройки',
        icon: Settings,
        canAccess: isAdmin,
      },
    ];
  }, [isStaff, isModerator, isContentManager, isNewsEditor, isAdmin]);

  const accessibleTabs = useMemo(() => tabs.filter((t) => t.canAccess), [tabs]);

  if (!isStaff) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-4 shadow-xl">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[#F3F1F8] mb-2">Доступ ограничен</h2>
        <p className="text-sm text-[#9A94AA] max-w-md leading-relaxed">
          Данная панель управления предназначена исключительно для администрации и модераторов Dodik Tracker.
        </p>
      </div>
    );
  }

  // Safety fallback if current activeTab is not accessible to this role
  const currentTabAllowed = accessibleTabs.some((t) => t.id === activeTab);
  const currentTab = currentTabAllowed ? activeTab : (accessibleTabs[0]?.id || 'dashboard');

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-[#14131A] border border-[#252233] shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#9B6BFF]/20 to-[#6E42E5]/20 border border-[#9B6BFF]/30 flex items-center justify-center text-[#AC82FF] shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-[#F3F1F8]">Панель управления</h1>
              <span
                className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border ${
                  isSuperAdmin
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : isAdmin
                    ? 'bg-purple-500/15 border-purple-500/40 text-[#AC82FF]'
                    : isModerator
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                    : isContentManager
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                }`}
              >
                {role}
              </span>
            </div>
            <p className="text-xs text-[#9A94AA] mt-0.5">
              Управление платформой Dodik Tracker • Авторизован как @{dbUser?.username}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-[#9A94AA] self-start md:self-center">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#191724] border border-[#252233]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            LIVE ADMIN CONSOLE
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-[#252233] pb-1 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max p-1 bg-[#14131A] border border-[#252233] rounded-2xl">
          {accessibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-[#9B6BFF] text-white shadow-lg shadow-[#9B6BFF]/25 scale-[1.02]'
                    : 'text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#191724]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#9A94AA]'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-[#252233] text-[#AC82FF]'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content Display */}
      <div className="min-h-[500px]">
        {currentTab === 'dashboard' && (
          <AdminDashboardTab onNavigateTab={(tab) => setActiveTab(tab as AdminTabType)} />
        )}
        {currentTab === 'moderation' && <AdminModerationTab />}
        {currentTab === 'users' && <AdminUsersTab />}
        {currentTab === 'content' && <AdminContentTab />}
        {currentTab === 'news' && <AdminNewsTab />}
        {currentTab === 'announcements' && <AdminAnnouncementsTab />}
        {currentTab === 'notifications' && <AdminNotificationsTab />}
        {currentTab === 'achievements' && <AdminAchievementsTab />}
        {currentTab === 'analytics' && <AdminAnalyticsTab />}
        {currentTab === 'integrations' && <AdminIntegrationsTab />}
        {currentTab === 'audit' && <AdminAuditTab />}
        {currentTab === 'settings' && <AdminSettingsTab />}
      </div>
    </div>
  );
};
