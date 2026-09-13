import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Database,
  Users,
  Activity,
  Key,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  Loader2,
  AlertTriangle,
  Server,
  Lock,
  Ticket,
  Send,
  Copy,
  Check,
  Plus,
  Minus,
  Sparkles,
  ShieldCheck,
  Ban,
  KeyRound,
  Film,
  Search,
  ExternalLink,
  Shield,
  FileText,
  Trash2,
  Trophy,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';
import { AdminAchievementsTab } from '../admin/AdminAchievementsTab.tsx';

export const AdminView: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'achievements' | 'access' | 'integrations' | 'users' | 'logs'>('dashboard');

  // Dashboard stats
  const [stats, setStats] = useState<any | null>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [logsSubTab, setLogsSubTab] = useState<'audit' | 'api'>('audit');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Password Reset Modal state
  const [resetModalData, setResetModalData] = useState<{
    isOpen: boolean;
    username: string;
    resetUrl: string;
    expiresAt: string;
    loading: boolean;
    copied: boolean;
    error?: string;
  } | null>(null);

  // Block user confirmation
  const [userToBlockConfirm, setUserToBlockConfirm] = useState<any | null>(null);
  const [blockingUserId, setBlockingUserId] = useState<number | null>(null);

  // Access & Invites state
  const [regMode, setRegMode] = useState<string>('INVITE_ONLY');
  const [savingRegMode, setSavingRegMode] = useState(false);
  const [regModeNotice, setRegModeNotice] = useState<string | null>(null);

  const [invitesList, setInvitesList] = useState<any[]>([]);
  const [generatingInvites, setGeneratingInvites] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [userInviteEdits, setUserInviteEdits] = useState<Record<number, number>>({});
  const [savingUserInvite, setSavingUserInvite] = useState<Record<number, boolean>>({});

  // Telegram settings
  const [tgSettings, setTgSettings] = useState<any>({
    hasToken: false,
    maskedToken: '',
    botUsername: 'DodikTrackerBot',
    adminIds: [],
  });
  const [tgTokenInput, setTgTokenInput] = useState('');
  const [tgUsernameInput, setTgUsernameInput] = useState('DodikTrackerBot');
  const [tgAdminIdsInput, setTgAdminIdsInput] = useState('');
  const [savingTg, setSavingTg] = useState(false);
  const [tgNotice, setTgNotice] = useState<string | null>(null);

  // Integration editing state
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [healthChecking, setHealthChecking] = useState<Record<string, boolean>>({});
  const [healthResults, setHealthResults] = useState<Record<string, { ok: boolean; latencyMs: number; error?: string }>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, string>>({});

  // Message Cleanup Worker State
  const [cleanupStatus, setCleanupStatus] = useState<{
    isRunning: boolean;
    lastRunStartTime: string | null;
    lastRunEndTime: string | null;
    lastDurationMs: number | null;
    lastDeletedCount: number;
    lastError: string | null;
    totalRuns: number;
  } | null>(null);
  const [triggeringCleanup, setTriggeringCleanup] = useState(false);
  const [cleanupNotice, setCleanupNotice] = useState<string | null>(null);

  const fetchAllAdminData = async () => {
    setLoading(true);
    try {
      const [statsRes, intRes, usersRes, logsRes, auditRes, modeRes, invitesRes, tgRes, cleanupRes] = await Promise.all([
        authFetch('/api/admin/dashboard'),
        authFetch('/api/admin/integrations'),
        authFetch('/api/admin/users'),
        authFetch('/api/admin/api-logs'),
        authFetch('/api/admin/audit-logs'),
        authFetch('/api/auth/registration-mode'),
        authFetch('/api/admin/invites'),
        authFetch('/api/admin/telegram-settings'),
        authFetch('/api/admin/message-cleanup/status'),
      ]);

      const parseJsonSafe = async (res: Response) => {
        if (!res.ok) return null;
        try {
          const text = await res.text();
          return text ? JSON.parse(text) : null;
        } catch {
          return null;
        }
      };

      const statsData = await parseJsonSafe(statsRes);
      if (statsData) setStats(statsData);

      const intData = await parseJsonSafe(intRes);
      if (intData) setIntegrations(intData);

      const cleanupData = await parseJsonSafe(cleanupRes);
      if (cleanupData) setCleanupStatus(cleanupData);

      const usersData = await parseJsonSafe(usersRes);
      if (Array.isArray(usersData)) {
        setUsersList(usersData);
        // Initialize invite edits map
        const initialEdits: Record<number, number> = {};
        usersData.forEach((u: any) => {
          initialEdits[u.id] = u.invitesLeft ?? 3;
        });
        setUserInviteEdits(initialEdits);
      }

      const logsData = await parseJsonSafe(logsRes);
      if (logsData) setLogs(logsData);

      const auditData = await parseJsonSafe(auditRes);
      if (auditData) setAuditLogs(auditData);

      const modeData = await parseJsonSafe(modeRes);
      if (modeData) {
        setRegMode(modeData.mode || 'INVITE_ONLY');
      }

      const invitesData = await parseJsonSafe(invitesRes);
      if (invitesData) setInvitesList(invitesData);

      const tgData = await parseJsonSafe(tgRes);
      if (tgData) {
        setTgSettings(tgData);
        setTgUsernameInput(tgData.botUsername || 'DodikTrackerBot');
        setTgAdminIdsInput(Array.isArray(tgData.adminIds) ? tgData.adminIds.join(', ') : '');
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerCleanup = async () => {
    setTriggeringCleanup(true);
    setCleanupNotice(null);
    try {
      const res = await authFetch('/api/admin/message-cleanup/run', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setCleanupNotice(`Очистка завершена: удалено ${data.deletedCount} сообщений за ${data.durationMs}мс`);
        // Refresh status & audit logs
        const statusRes = await authFetch('/api/admin/message-cleanup/status');
        if (statusRes.ok) setCleanupStatus(await statusRes.json());
        fetchAuditLogs();
        setTimeout(() => setCleanupNotice(null), 5000);
      } else {
        setCleanupNotice(`Ошибка: ${data.error || 'Не удалось выполнить очистку'}`);
      }
    } catch (err: any) {
      setCleanupNotice(`Ошибка сети: ${err.message}`);
    } finally {
      setTriggeringCleanup(false);
    }
  };

  useEffect(() => {
    if (dbUser?.role === 'ADMIN' || dbUser?.role === 'SUPER_ADMIN') {
      fetchAllAdminData();
    } else {
      setLoading(false);
    }
  }, [dbUser]);

  // Save Registration Mode
  const handleSaveRegMode = async (newMode: string) => {
    setSavingRegMode(true);
    setRegModeNotice(null);
    try {
      const res = await authFetch('/api/admin/registration-mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) {
        setRegMode(newMode);
        setRegModeNotice('Режим регистрации успешно обновлен');
        setTimeout(() => setRegModeNotice(null), 3000);
      }
    } catch (err: any) {
      setRegModeNotice(`Ошибка: ${err.message}`);
    } finally {
      setSavingRegMode(false);
    }
  };

  // Admin Unlimited Invite Generation
  const handleGenerateInvites = async (count = 1) => {
    setGeneratingInvites(true);
    try {
      for (let i = 0; i < count; i++) {
        await authFetch('/api/invites/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      }
      const updated = await authFetch('/api/admin/invites');
      if (updated.ok) setInvitesList(await updated.json());
    } catch (err) {
      console.error('Failed to generate invites:', err);
    } finally {
      setGeneratingInvites(false);
    }
  };

  // Adjust specific user invite balance
  const handleSaveUserInvites = async (userId: number) => {
    const count = userInviteEdits[userId];
    if (count === undefined) return;
    setSavingUserInvite((prev) => ({ ...prev, [userId]: true }));
    try {
      const res = await authFetch(`/api/admin/users/${userId}/invites`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      });
      if (res.ok) {
        setUsersList((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, invitesLeft: count } : u))
        );
      }
    } catch (err) {
      console.error('Failed to update invites for user:', err);
    } finally {
      setSavingUserInvite((prev) => ({ ...prev, [userId]: false }));
    }
  };

  // Save Telegram settings
  const handleSaveTelegram = async () => {
    setSavingTg(true);
    setTgNotice(null);
    try {
      const parsedAdminIds = tgAdminIdsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await authFetch('/api/admin/telegram-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: tgTokenInput || undefined,
          botUsername: tgUsernameInput.trim(),
          adminIds: parsedAdminIds,
        }),
      });

      if (res.ok) {
        setTgNotice('Настройки Telegram-бота успешно сохранены');
        setTgTokenInput('');
        const tgRes = await authFetch('/api/admin/telegram-settings');
        if (tgRes.ok) setTgSettings(await tgRes.json());
        setTimeout(() => setTgNotice(null), 3500);
      }
    } catch (err: any) {
      setTgNotice(`Ошибка: ${err.message}`);
    } finally {
      setSavingTg(false);
    }
  };

  const copyInvite = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Integrations save & health-check
  const saveIntegration = async (
    provider: string,
    enabled?: boolean,
    priority?: number,
    extraCreds?: { clientId?: string; clientSecret?: string }
  ) => {
    const key = apiKeys[provider];
    setSaveStatus((prev) => ({ ...prev, [provider]: 'Сохранение...' }));
    try {
      const res = await authFetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: key !== undefined ? key : undefined,
          enabled,
          priority,
          clientId: extraCreds?.clientId,
          clientSecret: extraCreds?.clientSecret,
        }),
      });
      if (res.ok) {
        setSaveStatus((prev) => ({ ...prev, [provider]: 'Сохранено!' }));
        setTimeout(() => setSaveStatus((prev) => ({ ...prev, [provider]: '' })), 2500);
        const updated = await authFetch('/api/admin/integrations');
        if (updated.ok) setIntegrations(await updated.json());
      } else {
        setSaveStatus((prev) => ({ ...prev, [provider]: 'Ошибка сохранения' }));
      }
    } catch (_err) {
      setSaveStatus((prev) => ({ ...prev, [provider]: 'Ошибка сети' }));
    }
  };

  const deleteKey = async (provider: string) => {
    setSaveStatus((prev) => ({ ...prev, [provider]: 'Удаление...' }));
    try {
      const res = await authFetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          removeKey: true,
        }),
      });
      if (res.ok) {
        setApiKeys((prev) => ({ ...prev, [provider]: '' }));
        setSaveStatus((prev) => ({ ...prev, [provider]: 'Ключ удален!' }));
        setTimeout(() => setSaveStatus((prev) => ({ ...prev, [provider]: '' })), 2500);
        const updated = await authFetch('/api/admin/integrations');
        if (updated.ok) setIntegrations(await updated.json());
      } else {
        setSaveStatus((prev) => ({ ...prev, [provider]: 'Ошибка удаления' }));
      }
    } catch (_err) {
      setSaveStatus((prev) => ({ ...prev, [provider]: 'Ошибка сети' }));
    }
  };

  const toggleIntegration = async (provider: string, currentEnabled: boolean) => {
    await saveIntegration(provider, !currentEnabled);
  };

  const updatePriority = async (provider: string, priority: number) => {
    await saveIntegration(provider, undefined, priority);
  };

  const testHealthCheck = async (provider: string) => {
    setHealthChecking((prev) => ({ ...prev, [provider]: true }));
    try {
      const res = await authFetch('/api/admin/integrations/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: apiKeys[provider] || undefined,
        }),
      });
      const data = await res.json();
      setHealthResults((prev) => ({ ...prev, [provider]: data }));
    } catch (err: any) {
      setHealthResults((prev) => ({
        ...prev,
        [provider]: { ok: false, latencyMs: 0, error: err.message },
      }));
    } finally {
      setHealthChecking((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const changeUserRole = async (userId: number, role: string) => {
    try {
      const res = await authFetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setUsersList((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
        fetchAuditLogs();
      }
    } catch (err) {
      console.error('Failed to change role:', err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await authFetch('/api/admin/audit-logs');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };

  const handleToggleBlockUser = async () => {
    if (!userToBlockConfirm) return;
    const targetUser = userToBlockConfirm;
    setBlockingUserId(targetUser.id);
    try {
      const res = await authFetch(`/api/admin/users/${targetUser.id}/block`, {
        method: 'PUT',
      });
      const data = await res.json();
      if (res.ok) {
        setUsersList((prev) =>
          prev.map((u) => (u.id === targetUser.id ? { ...u, isBlocked: data.isBlocked } : u))
        );
        setUserToBlockConfirm(null);
        fetchAuditLogs();
      }
    } catch (err) {
      console.error('Failed to toggle block:', err);
    } finally {
      setBlockingUserId(null);
    }
  };

  const handleTriggerResetPassword = async (userId: number, username: string) => {
    setResetModalData({
      isOpen: true,
      username,
      resetUrl: '',
      expiresAt: '',
      loading: true,
      copied: false,
    });
    try {
      const res = await authFetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setResetModalData({
          isOpen: true,
          username: data.username || username,
          resetUrl: data.resetUrl,
          expiresAt: data.expiresAt,
          loading: false,
          copied: false,
        });
        fetchAuditLogs();
      } else {
        setResetModalData({
          isOpen: true,
          username,
          resetUrl: '',
          expiresAt: '',
          loading: false,
          copied: false,
          error: data.error || 'Ошибка при генерации ссылки',
        });
      }
    } catch (err: any) {
      setResetModalData({
        isOpen: true,
        username,
        resetUrl: '',
        expiresAt: '',
        loading: false,
        copied: false,
        error: 'Сетевая ошибка при генерации ссылки',
      });
    }
  };

  if (dbUser?.role !== 'ADMIN' && dbUser?.role !== 'SUPER_ADMIN') {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-red-950/60 border border-red-800/40 flex items-center justify-center mx-auto text-red-400">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-zinc-100 font-mono">ДОСТУП ОГРАНИЧЕН</h2>
        <p className="text-xs text-zinc-400">Данный раздел доступен только администраторам системы.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#F3F1F8] font-mono tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-[#9B6BFF]" />
            ПАНЕЛЬ УПРАВЛЕНИЯ СИСТЕМОЙ
          </h1>
          <p className="text-xs text-[#9A94AA] mt-1">
            Закрытый проект: режимы доступа, бесконечные инвайты, Telegram-бот и провайдеры API
          </p>
        </div>

        <button
          onClick={fetchAllAdminData}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#191724] hover:bg-[#252233] border border-[#2E2A40] text-xs font-semibold text-[#F3F1F8] transition-colors self-start sm:self-auto"
        >
          <RotateCw className="w-3.5 h-3.5" />
          Обновить данные
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#252233] pb-2">
        {[
          { id: 'dashboard', label: 'Обзор системы', icon: Activity },
          { id: 'achievements', label: 'Достижения', icon: Trophy },
          { id: 'access', label: 'Доступ & Инвайты & Telegram', icon: Ticket },
          { id: 'users', label: 'Пользователи & Роли', icon: Users },
          { id: 'integrations', label: 'Интеграции & API Ключи', icon: Key },
          { id: 'logs', label: 'Логи запросов API', icon: Server },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-[#9B6BFF] text-white shadow-md shadow-purple-950/50'
                  : 'bg-[#14131A] text-[#9A94AA] hover:text-[#F3F1F8] border border-[#252233]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#AC82FF] animate-spin" />
          <p className="text-xs text-[#9A94AA]">Связь с базой данных...</p>
        </div>
      ) : activeTab === 'dashboard' ? (
        /* DASHBOARD OVERVIEW */
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-800/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <span>Cloud SQL (PostgreSQL 15)</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                    ONLINE
                  </span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Регион: <strong className="text-zinc-300">europe-west2</strong> &bull; Drizzle ORM Pool Active
                </p>
              </div>
            </div>
            <div className="hidden sm:block text-right text-xs text-zinc-400 font-mono">
              AES-256-GCM: <span className="text-emerald-400 font-bold">АКТИВНО</span>
            </div>
          </div>

          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] space-y-1">
                <span className="text-xs text-[#9A94AA]">Пользователей в базе</span>
                <p className="text-2xl font-black text-[#F3F1F8] font-mono">{stats.totalUsers}</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] space-y-1">
                <span className="text-xs text-[#9A94AA]">Медиа в каталоге</span>
                <p className="text-2xl font-black text-[#AC82FF] font-mono">{stats.totalMedia}</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] space-y-1">
                <span className="text-xs text-[#9A94AA]">Списков & Коллекций</span>
                <p className="text-2xl font-black text-[#F3F1F8] font-mono">{stats.totalLists}</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] space-y-1">
                <span className="text-xs text-[#9A94AA]">Тир-листов</span>
                <p className="text-2xl font-black text-[#F3F1F8] font-mono">{stats.totalTierLists}</p>
              </div>
            </div>
          )}

          {/* Background Jobs & Automated Message Retention */}
          <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#252233] pb-4">
              <div>
                <h3 className="text-base font-bold text-[#F3F1F8] flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#AC82FF]" />
                  Автоматическая очистка сообщений чата (7 дней)
                </h3>
                <p className="text-xs text-[#9A94AA] mt-0.5">
                  Фоновый воркер удаляет сообщения старше 7 дней раз в неделю батчами по 500 записей с защитой от параллельного запуска.
                </p>
              </div>
              <button
                onClick={handleTriggerCleanup}
                disabled={triggeringCleanup || cleanupStatus?.isRunning}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#353147] text-xs font-semibold text-white border border-[#3A344E] transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {triggeringCleanup || cleanupStatus?.isRunning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#AC82FF]" />
                    Очистка выполняется...
                  </>
                ) : (
                  <>
                    <RotateCw className="w-3.5 h-3.5 text-[#AC82FF]" />
                    Запустить вручную
                  </>
                )}
              </button>
            </div>

            {cleanupNotice && (
              <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-800/50 text-xs text-purple-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                {cleanupNotice}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-[#191724] border border-[#252233] space-y-1">
                <span className="text-[11px] text-[#9A94AA]">Периодичность</span>
                <p className="text-xs font-bold text-[#F3F1F8] font-mono">1 раз в 7 дней</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#191724] border border-[#252233] space-y-1">
                <span className="text-[11px] text-[#9A94AA]">Срок хранения (TTL)</span>
                <p className="text-xs font-bold text-[#AC82FF] font-mono">7 дней</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#191724] border border-[#252233] space-y-1">
                <span className="text-[11px] text-[#9A94AA]">Последний запуск</span>
                <p className="text-xs font-bold text-[#F3F1F8] font-mono truncate">
                  {cleanupStatus?.lastRunStartTime
                    ? new Date(cleanupStatus.lastRunStartTime).toLocaleString('ru-RU')
                    : 'Ожидание первого цикла'}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#191724] border border-[#252233] space-y-1">
                <span className="text-[11px] text-[#9A94AA]">Удалено за последний запуск</span>
                <p className="text-xs font-bold text-emerald-400 font-mono">
                  {cleanupStatus ? `${cleanupStatus.lastDeletedCount} сообщений (${cleanupStatus.lastDurationMs ?? 0}мс)` : '0'}
                </p>
              </div>
            </div>

            {cleanupStatus?.lastError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>Последняя ошибка: {cleanupStatus.lastError}</span>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'achievements' ? (
        <AdminAchievementsTab />
      ) : activeTab === 'access' ? (
        /* ACCESS, INVITES & TELEGRAM TAB */
        <div className="space-y-8">
          {/* 1. Registration Mode Selector */}
          <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#252233] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#F3F1F8] flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#AC82FF]" />
                  Режим доступа и регистрации на сайте
                </h3>
                <p className="text-xs text-[#9A94AA]">
                  Определяет, кто и как может присоединиться к сообществу Dodik Tracker.
                </p>
              </div>
              {regModeNotice && (
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/30">
                  {regModeNotice}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              {/* Option 1: Open */}
              <div
                onClick={() => handleSaveRegMode('OPEN')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  regMode === 'OPEN'
                    ? 'bg-[#1D182E] border-[#9B6BFF] shadow-lg shadow-purple-950/40'
                    : 'bg-[#191724] border-[#252233] hover:border-[#3A344E]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 font-mono">СВОБОДНЫЙ ВХОД</span>
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      regMode === 'OPEN' ? 'border-[#AC82FF] bg-[#9B6BFF]' : 'border-zinc-600'
                    }`}
                  >
                    {regMode === 'OPEN' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <h4 className="text-sm font-bold text-[#F3F1F8] mt-2">Свободная регистрация</h4>
                <p className="text-xs text-[#9A94AA] mt-1 leading-relaxed">
                  Любой посетитель может создать аккаунт по почте, паролю или Google без инвайта.
                </p>
              </div>

              {/* Option 2: Invite-Only */}
              <div
                onClick={() => handleSaveRegMode('INVITE_ONLY')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  regMode === 'INVITE_ONLY'
                    ? 'bg-[#1D182E] border-[#9B6BFF] shadow-lg shadow-purple-950/40'
                    : 'bg-[#191724] border-[#252233] hover:border-[#3A344E]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#AC82FF] font-mono">ПО ИНВАЙТАМ</span>
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      regMode === 'INVITE_ONLY' ? 'border-[#AC82FF] bg-[#9B6BFF]' : 'border-zinc-600'
                    }`}
                  >
                    {regMode === 'INVITE_ONLY' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <h4 className="text-sm font-bold text-[#F3F1F8] mt-2">Только по инвайт-кодам</h4>
                <p className="text-xs text-[#9A94AA] mt-1 leading-relaxed">
                  Регистрация открыта только при указании валидного инвайта от участника или админа.
                </p>
              </div>

              {/* Option 3: Closed */}
              <div
                onClick={() => handleSaveRegMode('CLOSED')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  regMode === 'CLOSED'
                    ? 'bg-[#1D182E] border-[#9B6BFF] shadow-lg shadow-purple-950/40'
                    : 'bg-[#191724] border-[#252233] hover:border-[#3A344E]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 font-mono">ЗАКРЫТЫЙ КЛУБ</span>
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      regMode === 'CLOSED' ? 'border-[#AC82FF] bg-[#9B6BFF]' : 'border-zinc-600'
                    }`}
                  >
                    {regMode === 'CLOSED' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <h4 className="text-sm font-bold text-[#F3F1F8] mt-2">Полностью закрытая</h4>
                <p className="text-xs text-[#9A94AA] mt-1 leading-relaxed">
                  Новая регистрация заморожена. Доступ разрешён только уже существующим пользователям.
                </p>
              </div>
            </div>
          </div>

          {/* 2. Admin Unlimited Invite Generator */}
          <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#252233] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#F3F1F8] flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-amber-400" />
                  Бесконечная генерация инвайтов (Для Администрации)
                </h3>
                <p className="text-xs text-[#9A94AA]">
                  Администрация может генерировать инвайты в неограниченном количестве.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleGenerateInvites(1)}
                  disabled={generatingInvites}
                  className="px-3.5 py-1.5 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-all shadow flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  +1 Инвайт
                </button>
                <button
                  onClick={() => handleGenerateInvites(5)}
                  disabled={generatingInvites}
                  className="px-3.5 py-1.5 rounded-xl bg-[#191724] hover:bg-[#252233] border border-[#2E2A40] text-[#AC82FF] text-xs font-bold transition-all disabled:opacity-50"
                >
                  +5 Инвайтов
                </button>
                <button
                  onClick={() => handleGenerateInvites(10)}
                  disabled={generatingInvites}
                  className="px-3.5 py-1.5 rounded-xl bg-[#191724] hover:bg-[#252233] border border-[#2E2A40] text-[#AC82FF] text-xs font-bold transition-all disabled:opacity-50"
                >
                  +10 Инвайтов
                </button>
              </div>
            </div>

            {/* List of system invites */}
            <div className="rounded-2xl border border-[#252233] overflow-hidden">
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs text-[#D5D0E3]">
                  <thead className="bg-[#191724] border-b border-[#252233] font-mono text-[10px] text-[#9A94AA] uppercase sticky top-0">
                    <tr>
                      <th className="p-3">Инвайт-код</th>
                      <th className="p-3">Создатель</th>
                      <th className="p-3">Статус</th>
                      <th className="p-3">Кем активирован</th>
                      <th className="p-3">Дата создания</th>
                      <th className="p-3 text-right">Копировать</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#252233]">
                    {invitesList.map((inv) => (
                      <tr key={inv.id} className="hover:bg-[#191724]/60">
                        <td className="p-3 font-mono font-bold text-[#AC82FF]">{inv.code}</td>
                        <td className="p-3 text-[#9A94AA]">{inv.creatorUsername || 'Администратор'}</td>
                        <td className="p-3">
                          {inv.isUsed ? (
                            <span className="px-2 py-0.5 rounded bg-zinc-800 text-[#9A94AA] text-[10px]">
                              Использован
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                              Активен
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-[#9A94AA]">
                          {inv.usedByUsername ? `@${inv.usedByUsername}` : '—'}
                        </td>
                        <td className="p-3 text-[#6B667B]">
                          {new Date(inv.createdAt).toLocaleDateString('ru-RU')}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => copyInvite(inv.code)}
                            className="p-1.5 rounded-lg bg-[#252233] hover:bg-[#2E2A40] text-[#D5D0E3] transition-colors"
                            title="Скопировать инвайт"
                          >
                            {copiedCode === inv.code ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 3. User Invite Balance Editor */}
          <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4 shadow-xl">
            <div className="border-b border-[#252233] pb-3">
              <h3 className="text-base font-bold text-[#F3F1F8] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#9B6BFF]" />
                Управление лимитами приглашений пользователей
              </h3>
              <p className="text-xs text-[#9A94AA]">
                По умолчанию у каждого пользователя 3 приглашения. Администратор может изменить количество у любого участника.
              </p>
            </div>

            <div className="rounded-2xl border border-[#252233] overflow-hidden">
              <table className="w-full text-left text-xs text-[#D5D0E3]">
                <thead className="bg-[#191724] border-b border-[#252233] font-mono text-[10px] text-[#9A94AA] uppercase">
                  <tr>
                    <th className="p-3">Пользователь</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Роль</th>
                    <th className="p-3">Осталось инвайтов</th>
                    <th className="p-3 text-right">Управление балансом</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#252233]">
                  {usersList.map((u) => {
                    const currentEditVal = userInviteEdits[u.id] ?? u.invitesLeft ?? 3;
                    const isSaving = savingUserInvite[u.id];

                    return (
                      <tr key={u.id} className="hover:bg-[#191724]/60">
                        <td className="p-3 font-bold text-[#F3F1F8] flex items-center gap-2">
                          @{u.username}
                        </td>
                        <td className="p-3 font-mono text-[#9A94AA]">{u.email}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-[#252233] text-[#AC82FF] font-mono text-[10px]">
                            {u.role}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-amber-300">
                          {u.invitesLeft ?? 3} шт.
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() =>
                                setUserInviteEdits((prev) => ({
                                  ...prev,
                                  [u.id]: Math.max(0, (prev[u.id] ?? 3) - 1),
                                }))
                              }
                              className="p-1 rounded bg-[#252233] hover:bg-[#2E2A40] text-[#D5D0E3]"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={currentEditVal}
                              onChange={(e) =>
                                setUserInviteEdits((prev) => ({
                                  ...prev,
                                  [u.id]: parseInt(e.target.value, 10) || 0,
                                }))
                              }
                              className="w-14 px-2 py-1 text-center rounded-lg bg-[#191724] border border-[#2E2A40] text-xs font-mono text-[#F3F1F8]"
                            />
                            <button
                              onClick={() =>
                                setUserInviteEdits((prev) => ({
                                  ...prev,
                                  [u.id]: (prev[u.id] ?? 3) + 1,
                                }))
                              }
                              className="p-1 rounded bg-[#252233] hover:bg-[#2E2A40] text-[#D5D0E3]"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleSaveUserInvites(u.id)}
                              disabled={isSaving}
                              className="px-2.5 py-1 rounded-lg bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-semibold ml-1"
                            >
                              {isSaving ? '...' : 'Сохранить'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Telegram Integration Settings */}
          <div className="p-6 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#252233] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#F3F1F8] flex items-center gap-2">
                  <Send className="w-5 h-5 text-sky-400" />
                  Интеграция с Telegram Ботом
                </h3>
                <p className="text-xs text-[#9A94AA]">
                  Авторизация участников через Telegram и отправка уведомлений о релизах и рецензиях.
                </p>
              </div>
              {tgNotice && (
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/30">
                  {tgNotice}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#D5D0E3]">Токен Telegram Бота</label>
                <input
                  type="password"
                  value={tgTokenInput}
                  onChange={(e) => setTgTokenInput(e.target.value)}
                  placeholder={
                    tgSettings.hasToken ? tgSettings.maskedToken : '718293849:AAHk...'
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-[#AC82FF]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#D5D0E3]">Username Бота</label>
                <input
                  type="text"
                  value={tgUsernameInput}
                  onChange={(e) => setTgUsernameInput(e.target.value)}
                  placeholder="DodikTrackerBot"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-[#AC82FF]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#D5D0E3]">
                Chat ID администраторов (через запятую)
              </label>
              <input
                type="text"
                value={tgAdminIdsInput}
                onChange={(e) => setTgAdminIdsInput(e.target.value)}
                placeholder="184920492, 92837482"
                className="w-full px-3.5 py-2 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-[#AC82FF]"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={handleSaveTelegram}
                disabled={savingTg}
                className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2"
              >
                {savingTg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Сохранить настройки Telegram</span>
              </button>
            </div>
          </div>
        </div>
      ) : activeTab === 'integrations' ? (
        /* INTEGRATIONS MANAGER */
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-800/30 flex items-center gap-3">
            <Lock className="w-5 h-5 text-purple-400 shrink-0" />
            <p className="text-xs text-zinc-300 leading-relaxed">
              Все API-ключи хранятся в <strong>Google Cloud SQL</strong> в зашифрованном виде (AES-256-GCM).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {integrations.map((intg) => {
              const health = healthResults[intg.provider];
              const isChecking = healthChecking[intg.provider];
              const statusText = saveStatus[intg.provider];

              const getProviderDesc = (name: string) => {
                switch (name.toUpperCase()) {
                  case 'THEGAMESDB':
                    return 'База данных TheGamesDB (thegamesdb.net): обложки, скриншоты, платформы, жанры и русские описания.';
                  case 'RAWG':
                    return 'Крупнейшая видеоигровая база RAWG: рейтинги, ролики, скриншоты, теги и издатели.';
                  case 'IGDB':
                    return 'База видеоигр Internet Game Database от Twitch: скриншоты 1080p, официальные YouTube-трейлеры.';
                  case 'TMDB':
                    return 'The Movie Database: фильмы и сериалы со всего мира.';
                  case 'KINOPOISK':
                    return 'Кинопоиск API: русскоязычные фильмы, сериалы и актёрские составы.';
                  case 'ANILIST':
                    return 'AniList GraphQL: актуальные аниме, манга и онгоинги.';
                  case 'OPENLIBRARY':
                    return 'Open Library: международный каталог книг и изданий.';
                  default:
                    return '';
                }
              };

              return (
                <div
                  key={intg.provider}
                  className={`p-5 rounded-2xl bg-zinc-900 border transition-all ${
                    intg.enabled ? 'border-zinc-800 hover:border-[#9B6BFF]/40' : 'border-zinc-800/60 opacity-80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm font-mono border ${
                          intg.enabled
                            ? 'bg-[#9B6BFF]/20 border-[#9B6BFF]/40 text-[#AC82FF]'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                        }`}
                      >
                        {intg.provider.substring(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-zinc-100">{intg.provider}</h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              intg.enabled
                                ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                                : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                            }`}
                          >
                            {intg.enabled ? 'Включен' : 'Выключен'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{getProviderDesc(intg.provider)}</p>
                      </div>
                    </div>

                    {/* Priority & Toggle */}
                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <span>Приоритет:</span>
                        <select
                          value={intg.priority || 1}
                          onChange={(e) => updatePriority(intg.provider, parseInt(e.target.value, 10))}
                          className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-[#9B6BFF]"
                        >
                          <option value="1">1 (Высший)</option>
                          <option value="2">2 (Высокий)</option>
                          <option value="3">3 (Средний)</option>
                          <option value="4">4 (Низкий)</option>
                        </select>
                      </div>

                      <button
                        onClick={() => toggleIntegration(intg.provider, intg.enabled)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          intg.enabled
                            ? 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                            : 'bg-emerald-600/20 hover:bg-emerald-600 border-emerald-500/40 text-emerald-300 hover:text-white'
                        }`}
                      >
                        {intg.enabled ? 'Отключить' : 'Включить'}
                      </button>
                    </div>
                  </div>

                  {intg.requiresKey ? (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-zinc-300">
                          {intg.provider === 'IGDB' ? 'API Ключ или Client ID Twitch:' : 'Секретный API Ключ:'}
                        </label>
                        {intg.hasKey && (
                          <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Ключ сохранен и зашифрован
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="password"
                          value={apiKeys[intg.provider] !== undefined ? apiKeys[intg.provider] : ''}
                          onChange={(e) =>
                            setApiKeys((prev) => ({
                              ...prev,
                              [intg.provider]: e.target.value,
                            }))
                          }
                          placeholder={intg.hasKey ? '•••••••••••••••••••••••• (изменить ключ)' : 'Введите API ключ...'}
                          className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#9B6BFF]"
                        />
                        <button
                          onClick={() => saveIntegration(intg.provider, intg.enabled)}
                          className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8A55FF] text-white text-xs font-semibold shadow transition-colors whitespace-nowrap"
                        >
                          Сохранить ключ
                        </button>
                        {intg.hasKey && (
                          <button
                            onClick={() => deleteKey(intg.provider)}
                            title="Удалить сохраненный ключ"
                            className="px-3 py-2 rounded-xl bg-rose-950/30 hover:bg-rose-900/50 border border-rose-800/40 text-rose-300 text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Удалить</span>
                          </button>
                        )}
                        <button
                          onClick={() => testHealthCheck(intg.provider)}
                          disabled={isChecking}
                          className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {isChecking ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Activity className="w-3.5 h-3.5 text-[#AC82FF]" />
                          )}
                          Проверить связь
                        </button>
                      </div>
                      {statusText && <p className="text-xs text-[#AC82FF] font-medium">{statusText}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-xs text-zinc-400">
                        Этот провайдер работает по открытому API (без ключа авторизации).
                      </p>
                      <button
                        onClick={() => testHealthCheck(intg.provider)}
                        disabled={isChecking}
                        className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {isChecking ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Activity className="w-3.5 h-3.5 text-[#AC82FF]" />
                        )}
                        Проверить связь
                      </button>
                    </div>
                  )}

                  {health && (
                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        health.ok
                          ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                          : 'bg-red-950/40 border-red-800/50 text-red-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {health.ok ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                        <span>
                          {health.ok
                            ? `Связь установлена успешно (Задержка: ${health.latencyMs} мс)`
                            : `Ошибка подключения: ${health.error || 'Провайдер отклонил запрос'}`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab === 'users' ? (
        /* USERS & ROLES - FULL MANAGEMENT (Req 16 & 17) */
        <div className="space-y-4">
          {/* Search and stats bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#14131A] border border-[#252233]">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#9A94AA] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Поиск по логину или email..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-[#9B6BFF] transition-colors"
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-[#9A94AA]">
              <span>
                Всего пользователей: <strong className="text-[#F3F1F8]">{usersList.length}</strong>
              </span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">
                Заблокировано:{' '}
                <strong className="text-rose-400">
                  {usersList.filter((u) => u.isBlocked).length}
                </strong>
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-[#14131A] border border-[#252233] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#D5D0E3]">
                <thead className="bg-[#191724] border-b border-[#252233] uppercase font-mono text-[10px] text-[#9A94AA]">
                  <tr>
                    <th className="p-3.5">ID</th>
                    <th className="p-3.5">Пользователь</th>
                    <th className="p-3.5">Email</th>
                    <th className="p-3.5">Роль</th>
                    <th className="p-3.5">Telegram</th>
                    <th className="p-3.5">Статус</th>
                    <th className="p-3.5">Тайтлов</th>
                    <th className="p-3.5">Инвайтов</th>
                    <th className="p-3.5">Регистрация</th>
                    <th className="p-3.5 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#252233]">
                  {usersList
                    .filter(
                      (u) =>
                        u.username?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                        u.email?.toLowerCase().includes(userSearchQuery.toLowerCase())
                    )
                    .map((u) => {
                      const isSelf = u.id === dbUser?.id;
                      const isSuperAdmin = u.role === 'SUPER_ADMIN';
                      const currentEditVal = userInviteEdits[u.id] ?? u.invitesLeft ?? 3;
                      const isSavingInvite = savingUserInvite[u.id];

                      return (
                        <tr key={u.id} className="hover:bg-[#191724]/60 transition-colors">
                          <td className="p-3.5 font-mono text-[#9A94AA]">#{u.id}</td>
                          <td className="p-3.5 font-bold text-[#F3F1F8]">
                            <div className="flex items-center gap-2.5">
                              {u.avatar ? (
                                <img
                                  src={u.avatar}
                                  alt={u.username}
                                  referrerPolicy="no-referrer"
                                  className="w-8 h-8 rounded-full object-cover border border-[#252233]"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-[#9B6BFF]/20 border border-[#9B6BFF]/40 flex items-center justify-center text-xs font-bold text-[#AC82FF]">
                                  {u.username.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <span className="block font-medium">@{u.username}</span>
                                {isSelf && (
                                  <span className="text-[9px] font-mono text-[#9B6BFF] uppercase">
                                    (Это вы)
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 text-[#9A94AA] font-mono">{u.email}</td>
                          <td className="p-3.5">
                            <select
                              value={u.role}
                              disabled={isSuperAdmin && dbUser?.role !== 'SUPER_ADMIN'}
                              onChange={(e) => changeUserRole(u.id, e.target.value)}
                              className="px-2 py-1 rounded-lg bg-[#191724] border border-[#2E2A40] text-xs font-mono text-[#AC82FF] focus:outline-none focus:border-[#9B6BFF]"
                            >
                              <option value="USER">USER</option>
                              <option value="MODERATOR">MODERATOR</option>
                              <option value="ADMIN">ADMIN</option>
                              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                            </select>
                          </td>
                          <td className="p-3.5">
                            {u.telegramUsername ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-950/40 border border-sky-800/50 text-sky-300 text-[11px] font-mono">
                                <Send className="w-3 h-3 text-sky-400" />@{u.telegramUsername}
                              </span>
                            ) : (
                              <span className="text-[#6B667B] text-[11px] font-mono">Не привязан</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            {u.isBlocked ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/60 border border-rose-800/60 text-rose-300 text-[10px] font-mono">
                                <Ban className="w-3 h-3" />
                                Заблокирован
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[10px] font-mono">
                                <CheckCircle2 className="w-3 h-3" />
                                Активен
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 font-mono text-[#F3F1F8]">
                            <div className="flex items-center gap-1.5">
                              <Film className="w-3.5 h-3.5 text-[#9B6BFF]" />
                              <span>{u.mediaCount || 0}</span>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() =>
                                  setUserInviteEdits((prev) => ({
                                    ...prev,
                                    [u.id]: Math.max(0, (prev[u.id] ?? u.invitesLeft ?? 3) - 1),
                                  }))
                                }
                                className="p-0.5 rounded bg-[#252233] hover:bg-[#2E2A40] text-[#D5D0E3]"
                              >
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <input
                                type="number"
                                min="0"
                                value={currentEditVal}
                                onChange={(e) =>
                                  setUserInviteEdits((prev) => ({
                                    ...prev,
                                    [u.id]: parseInt(e.target.value, 10) || 0,
                                  }))
                                }
                                className="w-10 px-1 py-0.5 text-center rounded bg-[#191724] border border-[#2E2A40] text-xs font-mono text-[#F3F1F8]"
                              />
                              <button
                                onClick={() =>
                                  setUserInviteEdits((prev) => ({
                                    ...prev,
                                    [u.id]: (prev[u.id] ?? u.invitesLeft ?? 3) + 1,
                                  }))
                                }
                                className="p-0.5 rounded bg-[#252233] hover:bg-[#2E2A40] text-[#D5D0E3]"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                              <button
                                onClick={() => handleSaveUserInvites(u.id)}
                                disabled={isSavingInvite}
                                className="px-1.5 py-0.5 rounded bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-[10px] font-bold ml-1 disabled:opacity-50"
                              >
                                {isSavingInvite ? '...' : 'OK'}
                              </button>
                            </div>
                          </td>
                          <td className="p-3.5 text-[#9A94AA] text-[11px] whitespace-nowrap">
                            {new Date(u.createdAt).toLocaleDateString('ru-RU')}
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => handleTriggerResetPassword(u.id, u.username)}
                                title="Сбросить пароль пользователя"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#191724] hover:bg-[#252233] border border-[#2E2A40] text-xs text-[#AC82FF] hover:text-[#9B6BFF] font-medium transition-colors"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                <span className="hidden xl:inline">Сбросить пароль</span>
                              </button>
                              {!isSuperAdmin && !isSelf && (
                                <button
                                  onClick={() => setUserToBlockConfirm(u)}
                                  disabled={blockingUserId === u.id}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                                    u.isBlocked
                                      ? 'bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/60 text-emerald-300'
                                      : 'bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/60 text-rose-300'
                                  }`}
                                >
                                  {blockingUserId === u.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : u.isBlocked ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Разблокировать</span>
                                    </>
                                  ) : (
                                    <>
                                      <Ban className="w-3.5 h-3.5" />
                                      <span>Заблокировать</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* LOGS TAB - AUDIT LOGS & API REQUESTS (Req 18 & 19) */
        <div className="space-y-4">
          {/* Subtabs for Logs */}
          <div className="flex items-center gap-2 border-b border-[#252233] pb-2">
            <button
              onClick={() => setLogsSubTab('audit')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                logsSubTab === 'audit'
                  ? 'bg-[#9B6BFF] text-white shadow'
                  : 'bg-[#14131A] text-[#9A94AA] hover:text-[#F3F1F8] border border-[#252233]'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Действия администратора ({auditLogs.length})
            </button>
            <button
              onClick={() => setLogsSubTab('api')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                logsSubTab === 'api'
                  ? 'bg-[#9B6BFF] text-white shadow'
                  : 'bg-[#14131A] text-[#9A94AA] hover:text-[#F3F1F8] border border-[#252233]'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              API Запросы провайдеров ({logs.length})
            </button>
          </div>

          {logsSubTab === 'audit' ? (
            /* AUDIT LOGS TABLE */
            <div className="rounded-2xl bg-[#14131A] border border-[#252233] overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#D5D0E3]">
                  <thead className="bg-[#191724] border-b border-[#252233] uppercase font-mono text-[10px] text-[#9A94AA]">
                    <tr>
                      <th className="p-3.5">Время</th>
                      <th className="p-3.5">Действие</th>
                      <th className="p-3.5">Администратор</th>
                      <th className="p-3.5">Детали</th>
                      <th className="p-3.5">IP Адрес</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#252233]">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-[#9A94AA]">
                          Журнал действий администратора пока пуст.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((item) => {
                        let actionBadgeColor = 'bg-zinc-800 text-zinc-300';
                        if (item.action.includes('BAN')) actionBadgeColor = 'bg-rose-950/70 border border-rose-800/60 text-rose-300';
                        else if (item.action.includes('UNBAN')) actionBadgeColor = 'bg-emerald-950/70 border border-emerald-800/60 text-emerald-300';
                        else if (item.action.includes('RESET')) actionBadgeColor = 'bg-amber-950/70 border border-amber-800/60 text-amber-300';
                        else if (item.action.includes('ROLE')) actionBadgeColor = 'bg-purple-950/70 border border-purple-800/60 text-purple-300';
                        else if (item.action.includes('INVITE')) actionBadgeColor = 'bg-sky-950/70 border border-sky-800/60 text-sky-300';

                        return (
                          <tr key={item.id} className="hover:bg-[#191724]/60 transition-colors">
                            <td className="p-3.5 text-[#9A94AA] font-mono text-[11px] whitespace-nowrap">
                              {new Date(item.createdAt).toLocaleString('ru-RU')}
                            </td>
                            <td className="p-3.5">
                              <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${actionBadgeColor}`}>
                                {item.action}
                              </span>
                            </td>
                            <td className="p-3.5 font-medium text-[#F3F1F8]">
                              <div className="flex items-center gap-2">
                                {item.adminAvatar ? (
                                  <img
                                    src={item.adminAvatar}
                                    alt={item.adminUsername || 'Admin'}
                                    referrerPolicy="no-referrer"
                                    className="w-5 h-5 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[9px] text-zinc-400">
                                    {(item.adminUsername || 'A').charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <span>@{item.adminUsername || 'Система'}</span>
                              </div>
                            </td>
                            <td className="p-3.5 text-xs text-[#D5D0E3] max-w-md">
                              {item.details || '—'}
                            </td>
                            <td className="p-3.5 font-mono text-[#6B667B] text-[11px]">
                              {item.ip || '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* API LOGS TABLE */
            <div className="rounded-2xl bg-[#14131A] border border-[#252233] overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#D5D0E3]">
                  <thead className="bg-[#191724] border-b border-[#252233] uppercase font-mono text-[10px] text-[#9A94AA]">
                    <tr>
                      <th className="p-3.5">Время</th>
                      <th className="p-3.5">Провайдер</th>
                      <th className="p-3.5">Эндпоинт / Query</th>
                      <th className="p-3.5">Статус</th>
                      <th className="p-3.5">Задержка</th>
                      <th className="p-3.5">Результат</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#252233]">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-[#9A94AA]">
                          Запросов к внешним API пока не зафиксировано.
                        </td>
                      </tr>
                    ) : (
                      logs.map((lg) => (
                        <tr key={lg.id} className="hover:bg-[#191724]/60 transition-colors">
                          <td className="p-3.5 text-[#9A94AA] text-[11px] font-mono whitespace-nowrap">
                            {new Date(lg.createdAt).toLocaleTimeString('ru-RU')}
                          </td>
                          <td className="p-3.5 font-bold font-mono text-[#F3F1F8]">{lg.provider}</td>
                          <td className="p-3.5 font-mono text-[#9A94AA] truncate max-w-xs">{lg.endpoint}</td>
                          <td className="p-3.5">
                            <span
                              className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                                lg.status >= 200 && lg.status < 300
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : 'bg-rose-950 text-rose-300'
                              }`}
                            >
                              {lg.status}
                            </span>
                          </td>
                          <td className="p-3.5 font-mono text-[#9A94AA]">{lg.latencyMs || 0} ms</td>
                          <td className="p-3.5">
                            {lg.status >= 200 && lg.status < 300 ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Успешно
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-400 text-xs">
                                <XCircle className="w-3.5 h-3.5" /> Ошибка
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONFIRM BLOCK MODAL */}
      <ConfirmModal
        isOpen={userToBlockConfirm !== null}
        title={userToBlockConfirm?.isBlocked ? 'Разблокировать пользователя?' : 'Заблокировать пользователя?'}
        message={
          userToBlockConfirm?.isBlocked
            ? `Пользователь @${userToBlockConfirm?.username} снова сможет входить в систему и работать с медиатекой.`
            : `Пользователь @${userToBlockConfirm?.username} будет заблокирован и потеряет доступ к сервису.`
        }
        confirmText={userToBlockConfirm?.isBlocked ? 'Разблокировать' : 'Заблокировать'}
        variant={userToBlockConfirm?.isBlocked ? 'primary' : 'danger'}
        onConfirm={handleToggleBlockUser}
        onCancel={() => setUserToBlockConfirm(null)}
      />

      {/* RESET PASSWORD MODAL (Req 17) */}
      {resetModalData?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#14131A] border border-[#252233] rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#9B6BFF]/10 border border-[#9B6BFF]/30 flex items-center justify-center text-[#AC82FF]">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#F3F1F8]">Сброс пароля</h3>
                  <p className="text-xs text-[#9A94AA]">Для пользователя @{resetModalData.username}</p>
                </div>
              </div>
              <button
                onClick={() => setResetModalData(null)}
                className="p-1 rounded-lg text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#191724]"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {resetModalData.loading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-[#9A94AA]">
                <Loader2 className="w-6 h-6 animate-spin text-[#AC82FF]" />
                <span className="text-xs">Генерация одноразовой ссылки...</span>
              </div>
            ) : resetModalData.error ? (
              <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-300">
                {resetModalData.error}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-[#191724] border border-[#2E2A40] space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-[#9A94AA]">
                    <span>Одноразовая ссылка для установки пароля:</span>
                    <span className="text-amber-400 font-mono font-bold">Действует 1 час</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={resetModalData.resetUrl}
                      className="flex-1 px-3 py-2 rounded-xl bg-[#0A090D] border border-[#252233] text-xs font-mono text-[#F3F1F8] select-all focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(resetModalData.resetUrl);
                        setResetModalData((prev) => (prev ? { ...prev, copied: true } : null));
                        setTimeout(() => {
                          setResetModalData((prev) => (prev ? { ...prev, copied: false } : null));
                        }, 2000);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        resetModalData.copied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#9B6BFF] hover:bg-[#8B58F8] text-white'
                      }`}
                    >
                      {resetModalData.copied ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {resetModalData.copied ? 'Скопировано' : 'Копировать'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-[#9A94AA] leading-relaxed">
                  Передайте эту ссылку пользователю. Перейдя по ней, он сможет задать новый пароль для входа в свой профиль. Ссылка одноразовая и деактивируется после использования.
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setResetModalData(null)}
                className="px-4 py-2 rounded-xl bg-[#191724] hover:bg-[#252233] border border-[#2E2A40] text-xs font-semibold text-[#F3F1F8] transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
