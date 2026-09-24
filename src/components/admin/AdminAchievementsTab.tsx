import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Search,
  Shield,
  Clock,
  Award,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Filter,
  Check,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { RARITY_CONFIG } from '../achievements/AchievementBadge.tsx';

interface AdminAchievementItem {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
  rarity: string;
  status: string;
  badgeStyle: string;
  isActive: boolean;
  conditionType: string;
  conditionConfig: any;
  isSecret: boolean;
  points: number;
  grantsCount: number;
  createdAt: string;
  updatedAt: string;
}

interface AuditHistoryItem {
  id: number;
  achievementId: number;
  userId: number;
  action: string;
  source: string;
  adminId?: number;
  reason?: string;
  metadata?: any;
  createdAt: string;
  achievementTitle?: string;
  targetUsername?: string;
  adminUsername?: string;
}

export const AdminAchievementsTab: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const [subTab, setSubTab] = useState<'list' | 'manual' | 'history'>('list');

  // Achievements list
  const [achievements, setAchievements] = useState<AdminAchievementItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Edit / Create Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminAchievementItem | null>(null);
  const [formData, setFormData] = useState({
    slug: '',
    title: '',
    description: '',
    icon: 'Trophy',
    rarity: 'COMMON',
    status: 'ACTIVE',
    badgeStyle: 'purple',
    conditionType: 'MEDIA_COUNT',
    conditionConfig: '{"count": 10}',
    isSecret: false,
    points: 10,
  });
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Manual grant & revoke state
  const [userQuery, setUserQuery] = useState('');
  const [searchedUser, setSearchedUser] = useState<any | null>(null);
  const [userAchievements, setUserAchievements] = useState<any[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [selectedAchId, setSelectedAchId] = useState<number | ''>('');
  const [grantReason, setGrantReason] = useState('');
  const [grantActionLoading, setGrantActionLoading] = useState(false);
  const [grantSuccessMsg, setGrantSuccessMsg] = useState<string | null>(null);
  const [grantErrorMsg, setGrantErrorMsg] = useState<string | null>(null);

  // Revocation modal state
  const [revokeModalData, setRevokeModalData] = useState<{
    achievementId: number;
    title: string;
    reason: string;
  } | null>(null);
  const [revoking, setRevoking] = useState(false);

  // History state
  const [historyItems, setHistoryItems] = useState<AuditHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);

  const fetchAchievements = async () => {
    try {
      setLoadingList(true);
      const res = await authFetch('/api/achievements/admin/all');
      if (res.ok) {
        const json = await res.json();
        setAchievements(json.achievements || []);
      }
    } catch (err) {
      console.error('Failed to fetch admin achievements:', err);
    } finally {
      setLoadingList(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await authFetch('/api/achievements/admin/history?limit=100');
      if (res.ok) {
        const json = await res.json();
        setHistoryItems(json.history || []);
        setHistoryTotal(json.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchAchievements();
  }, []);

  useEffect(() => {
    if (subTab === 'history') {
      fetchHistory();
    } else if (subTab === 'manual' && achievements.length === 0) {
      fetchAchievements();
    }
  }, [subTab]);

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormData({
      slug: '',
      title: '',
      description: '',
      icon: 'Trophy',
      rarity: 'COMMON',
      status: 'ACTIVE',
      badgeStyle: 'purple',
      conditionType: 'MEDIA_COUNT',
      conditionConfig: '{"count": 10}',
      isSecret: false,
      points: 10,
    });
    setFormError(null);
    setEditModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (ach: AdminAchievementItem) => {
    setEditingItem(ach);
    setFormData({
      slug: ach.slug,
      title: ach.title,
      description: ach.description,
      icon: ach.icon,
      rarity: ach.rarity,
      status: ach.status,
      badgeStyle: ach.badgeStyle,
      conditionType: ach.conditionType,
      conditionConfig: JSON.stringify(ach.conditionConfig, null, 2),
      isSecret: ach.isSecret,
      points: ach.points,
    });
    setFormError(null);
    setEditModalOpen(true);
  };

  // Submit Create / Edit
  const handleSaveAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSaving(true);
    setFormError(null);

    try {
      let parsedConfig = {};
      try {
        parsedConfig = JSON.parse(formData.conditionConfig);
      } catch {
        throw new Error('Некорректный JSON в поле конфигурации условий (conditionConfig)');
      }

      if (editingItem) {
        // Update
        const res = await authFetch(`/api/achievements/admin/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formData.title,
            description: formData.description,
            icon: formData.icon,
            rarity: formData.rarity,
            status: formData.status,
            badgeStyle: formData.badgeStyle,
            conditionType: formData.conditionType,
            conditionConfig: parsedConfig,
            isSecret: formData.isSecret,
            points: Number(formData.points),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка при обновлении');
      } else {
        // Create
        const res = await authFetch('/api/achievements/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: formData.slug.trim(),
            title: formData.title.trim(),
            description: formData.description.trim(),
            icon: formData.icon.trim(),
            rarity: formData.rarity,
            status: formData.status,
            badgeStyle: formData.badgeStyle,
            conditionType: formData.conditionType,
            conditionConfig: parsedConfig,
            isSecret: formData.isSecret,
            points: Number(formData.points),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка при создании');
      }

      setEditModalOpen(false);
      fetchAchievements();
    } catch (err: any) {
      setFormError(err.message || 'Ошибка сохранения');
    } finally {
      setFormSaving(false);
    }
  };

  // Search user for manual management
  const handleSearchUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQ = userQuery.trim();
    if (!cleanQ) return;

    setUserLoading(true);
    setGrantErrorMsg(null);
    setGrantSuccessMsg(null);
    try {
      const res = await authFetch(`/api/achievements/user/${encodeURIComponent(cleanQ)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Пользователь не найден');
      }
      const data = await res.json();
      if (!data.user || !data.user.id) {
        throw new Error('Данные пользователя не получены');
      }
      setSearchedUser(data.user);
      setUserAchievements(data.achievements || []);
    } catch (err: any) {
      setSearchedUser(null);
      setUserAchievements([]);
      setGrantErrorMsg(err.message);
    } finally {
      setUserLoading(false);
    }
  };

  // Manual Grant
  const handleGrantSubmit = async () => {
    if (!searchedUser || !searchedUser.id || !selectedAchId) {
      setGrantErrorMsg('Выберите пользователя и достижение');
      return;
    }

    setGrantActionLoading(true);
    setGrantErrorMsg(null);
    setGrantSuccessMsg(null);

    try {
      const res = await authFetch('/api/achievements/admin/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(searchedUser.id),
          username: searchedUser.username,
          achievementId: Number(selectedAchId),
          reason: grantReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка при выдаче');

      setGrantSuccessMsg(data.message || 'Достижение успешно выдано!');
      setGrantReason('');
      setSelectedAchId('');

      // Refresh target user's achievements
      const refreshRes = await authFetch(
        `/api/achievements/user/${encodeURIComponent(searchedUser.username)}`
      );
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json();
        setUserAchievements(refreshed.achievements || []);
      }
      fetchAchievements();
    } catch (err: any) {
      setGrantErrorMsg(err.message);
    } finally {
      setGrantActionLoading(false);
    }
  };

  // Execute Revoke with Reason
  const handleExecuteRevoke = async () => {
    if (!revokeModalData || !searchedUser?.id) return;
    if (!revokeModalData.reason.trim()) {
      setGrantErrorMsg('Причина отзыва обязательна');
      return;
    }

    setRevoking(true);
    try {
      const res = await authFetch('/api/achievements/admin/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(searchedUser.id),
          username: searchedUser.username,
          achievementId: Number(revokeModalData.achievementId),
          reason: revokeModalData.reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка при отзыве');

      setGrantSuccessMsg(data.message || 'Достижение успешно отозвано');
      setRevokeModalData(null);

      // Refresh target user achievements
      const refreshRes = await authFetch(
        `/api/achievements/user/${encodeURIComponent(searchedUser.username)}`
      );
      if (refreshRes.ok) {
        const refreshed = await refreshRes.json();
        setUserAchievements(refreshed.achievements || []);
      }
      fetchAchievements();
    } catch (err: any) {
      setGrantErrorMsg(err.message);
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      {/* Sub-Tabs Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          {[
            { id: 'list', label: 'Список достижений', icon: Trophy },
            { id: 'manual', label: 'Ручная выдача и отзыв', icon: Shield },
            { id: 'history', label: 'История & Аудит', icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as any)}
                className={`flex items-center gap-2 h-11 px-5 rounded-2xl text-sm font-bold transition-all cursor-pointer ${
                  subTab === tab.id
                    ? 'bg-[#8B5CF6] text-white shadow-lg shadow-purple-950/40'
                    : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2442]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {subTab === 'list' && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 h-11 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-all shadow-md shadow-emerald-950/40 cursor-pointer"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>Создать достижение</span>
          </button>
        )}
      </div>

      {/* 1. ACHIEVEMENTS LIST */}
      {subTab === 'list' && (
        <div className="space-y-4">
          {loadingList ? (
            <div className="py-24 flex flex-col items-center justify-center space-y-3 bg-[#0B0D20] rounded-3xl border border-[#1E2442]">
              <Loader2 className="w-8 h-8 text-[#A78BFA] animate-spin" />
              <p className="text-sm text-[#94A3B8]">Загрузка достижений...</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[720px] overflow-y-auto no-scrollbar rounded-3xl border border-[#1E2442] bg-[#0B0D20] shadow-xl">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#0B0D20]/95 backdrop-blur-md shadow-sm">
                  <tr className="border-b border-[#1E2442] text-[#94A3B8] font-mono text-xs uppercase">
                    <th className="py-4 px-5">ID / Slug</th>
                    <th className="py-4 px-5">Название & Описание</th>
                    <th className="py-4 px-5">Редкость & Очки</th>
                    <th className="py-4 px-5">Условие</th>
                    <th className="py-4 px-5">Статус</th>
                    <th className="py-4 px-5 text-center">Выдано раз</th>
                    <th className="py-4 px-5 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2442]">
                  {achievements.map((ach) => {
                    const rInfo = RARITY_CONFIG[ach.rarity] || RARITY_CONFIG.COMMON;
                    return (
                      <tr key={ach.id} className="hover:bg-[#11152A]/80 transition-colors">
                        <td className="py-4 px-5 font-mono text-[#94A3B8]">
                          <span className="text-[#F8FAFC] font-bold">#{ach.id}</span>
                          <div className="text-xs text-zinc-500">{ach.slug}</div>
                        </td>
                        <td className="py-4 px-5 max-w-sm">
                          <div className="font-bold text-base text-[#F8FAFC] flex items-center gap-2">
                            <span>{ach.title}</span>
                            {ach.isSecret && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono">
                                СЕКРЕТНОЕ
                              </span>
                            )}
                          </div>
                          <div className="text-xs sm:text-sm text-[#94A3B8] line-clamp-1 mt-0.5">
                            {ach.description}
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-bold px-2.5 py-1 rounded-full border ${rInfo.badgeBg}`}
                            >
                              {rInfo.label}
                            </span>
                            <span className="font-mono text-[#A78BFA] font-bold text-sm">
                              +{ach.points}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-5 font-mono text-xs sm:text-sm text-[#94A3B8]">
                          <div className="text-zinc-300 font-semibold">{ach.conditionType}</div>
                          <div className="text-xs text-zinc-500 line-clamp-1">
                            {JSON.stringify(ach.conditionConfig)}
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <span
                            className={`text-xs font-mono px-2.5 py-1 rounded-full border font-bold ${
                              ach.status === 'ACTIVE'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                                : ach.status === 'DRAFT'
                                ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                                : 'bg-[#11152A] text-zinc-400 border-[#1E2442]'
                            }`}
                          >
                            {ach.status}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-center font-mono font-bold text-[#F8FAFC] text-base">
                          {ach.grantsCount}
                        </td>
                        <td className="py-4 px-5 text-right">
                          <button
                            onClick={() => handleOpenEdit(ach)}
                            className="p-2.5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-[#A78BFA] border border-[#1E2442] transition-colors cursor-pointer"
                            title="Редактировать"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2. MANUAL GRANT & REVOKE */}
      {subTab === 'manual' && (
        <div className="space-y-6">
          {/* User Search Bar */}
          <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-[#F8FAFC] flex items-center gap-2.5">
              <Search className="w-5 h-5 text-[#A78BFA]" />
              <span>Поиск пользователя для управления достижениями</span>
            </h3>

            <form onSubmit={handleSearchUser} className="flex gap-2.5 max-w-xl">
              <input
                type="text"
                placeholder="Введите username пользователя..."
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                className="flex-1 h-11 px-4 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
              />
              <button
                type="submit"
                disabled={userLoading}
                className="h-11 px-5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {userLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>Найти</span>
              </button>
            </form>

            {grantSuccessMsg && (
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800 text-sm text-emerald-300 font-medium flex items-center gap-2.5">
                <Check className="w-4.5 h-4.5 shrink-0" />
                <span>{grantSuccessMsg}</span>
              </div>
            )}

            {grantErrorMsg && (
              <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800 text-sm text-red-300 font-medium flex items-center gap-2.5">
                <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
                <span>{grantErrorMsg}</span>
              </div>
            )}
          </div>

          {searchedUser && (
            <div className="space-y-6">
              {/* Grant New Achievement Card */}
              <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#A78BFA] font-mono flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  <span>Выдать новое достижение пользователю @{searchedUser.username}</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold mb-1.5 block">Выберите достижение:</label>
                    <select
                      value={selectedAchId}
                      onChange={(e) => setSelectedAchId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full h-11 px-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
                    >
                      <option value="">-- Выберите достижение --</option>
                      {achievements.map((a) => (
                        <option key={a.id} value={a.id}>
                          #{a.id} {a.title} ({a.rarity}, +{a.points} pts)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold mb-1.5 block">Причина выдачи (опционально):</label>
                    <input
                      type="text"
                      placeholder="Награда за активность, победу в конкурсе..."
                      value={grantReason}
                      onChange={(e) => setGrantReason(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
                    />
                  </div>
                </div>

                <button
                  onClick={handleGrantSubmit}
                  disabled={!selectedAchId || grantActionLoading}
                  className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2 shadow-md"
                >
                  {grantActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                  <span>Выдать достижение</span>
                </button>
              </div>

              {/* User Current Achievements Table */}
              <div className="space-y-3">
                <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#94A3B8] font-mono">
                  Текущие достижения пользователя @{searchedUser.username}
                </h4>

                <div className="overflow-x-auto rounded-3xl border border-[#1E2442] bg-[#0B0D20] shadow-xl">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#1E2442] bg-[#11152A] text-[#64748B] font-mono text-xs uppercase">
                        <th className="py-4 px-5">Достижение</th>
                        <th className="py-4 px-5">Редкость</th>
                        <th className="py-4 px-5">Статус</th>
                        <th className="py-4 px-5">Дата / Тип</th>
                        <th className="py-4 px-5 text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2442]">
                      {userAchievements.map((ach) => (
                        <tr key={ach.id} className="hover:bg-[#11152A]/80 transition-colors">
                          <td className="py-4 px-5">
                            <span className="font-bold text-base text-[#F8FAFC] block">{ach.title}</span>
                            <span className="text-xs sm:text-sm text-[#94A3B8]">{ach.description}</span>
                          </td>
                          <td className="py-4 px-5">
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full border border-purple-800/40 bg-purple-950/40 text-purple-300">
                              {ach.rarity}
                            </span>
                          </td>
                          <td className="py-4 px-5">
                            {ach.isUnlocked ? (
                              <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-xs sm:text-sm">
                                <CheckCircle2 className="w-4 h-4" />
                                Получено
                              </span>
                            ) : (
                              <span className="text-zinc-500 font-medium text-xs sm:text-sm">Не получено</span>
                            )}
                          </td>
                          <td className="py-4 px-5 font-mono text-xs sm:text-sm text-[#94A3B8]">
                            {ach.isUnlocked ? (
                              <div>
                                <div>{ach.unlockedAt ? new Date(ach.unlockedAt).toLocaleDateString('ru-RU') : '-'}</div>
                                <div className="text-xs text-zinc-500">{ach.grantType}</div>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-4 px-5 text-right">
                            {ach.isUnlocked && (
                              <button
                                onClick={() =>
                                  setRevokeModalData({
                                    achievementId: ach.id,
                                    title: ach.title,
                                    reason: '',
                                  })
                                }
                                className="h-10 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                              >
                                Отозвать
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. AUDIT HISTORY */}
      {subTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-[#94A3B8] font-mono uppercase tracking-wider">
              Журнал выдач, отзывов и начислений ({historyTotal})
            </h3>
            <button
              onClick={fetchHistory}
              className="text-xs sm:text-sm text-[#A78BFA] hover:underline flex items-center gap-1.5 cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              <span>Обновить журнал</span>
            </button>
          </div>

          {historyLoading ? (
            <div className="py-24 flex flex-col items-center justify-center space-y-3 bg-[#0B0D20] rounded-3xl border border-[#1E2442]">
              <Loader2 className="w-8 h-8 text-[#A78BFA] animate-spin" />
              <p className="text-sm text-[#94A3B8]">Загрузка истории...</p>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="py-20 text-center text-sm text-[#94A3B8] rounded-3xl bg-[#0B0D20] border border-[#1E2442]">
              Журнал действий пуст
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[720px] overflow-y-auto no-scrollbar rounded-3xl border border-[#1E2442] bg-[#0B0D20] shadow-xl">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#0B0D20]/95 backdrop-blur-md shadow-sm">
                  <tr className="border-b border-[#1E2442] text-[#94A3B8] font-mono text-xs uppercase">
                    <th className="py-4 px-5">Время</th>
                    <th className="py-4 px-5">Действие</th>
                    <th className="py-4 px-5">Достижение</th>
                    <th className="py-4 px-5">Пользователь</th>
                    <th className="py-4 px-5">Источник / Администратор</th>
                    <th className="py-4 px-5">Причина & Детали</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2442]">
                  {historyItems.map((item) => (
                    <tr key={item.id} className="hover:bg-[#11152A]/80 transition-colors">
                      <td className="py-4 px-5 font-mono text-xs text-[#94A3B8] whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString('ru-RU')}
                      </td>
                      <td className="py-4 px-5">
                        <span
                          className={`text-xs font-mono px-2.5 py-1 rounded-full font-bold border ${
                            item.action === 'UNLOCKED' || item.action === 'MANUAL_GRANT'
                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                              : item.action === 'REVOKED'
                              ? 'bg-red-950/60 text-red-300 border-red-800'
                              : 'bg-purple-950/60 text-purple-300 border-purple-800'
                          }`}
                        >
                          {item.action}
                        </span>
                      </td>
                      <td className="py-4 px-5 font-bold text-[#F8FAFC]">
                        {item.achievementTitle || `#${item.achievementId}`}
                      </td>
                      <td className="py-4 px-5 font-mono text-[#A78BFA] font-bold">
                        @{item.targetUsername || `User #${item.userId}`}
                      </td>
                      <td className="py-4 px-5 text-[#94A3B8] text-xs sm:text-sm">
                        {item.source === 'MANUAL' ? (
                          <span className="text-purple-300 font-medium">
                            Админ: @{item.adminUsername || item.adminId}
                          </span>
                        ) : (
                          <span className="font-mono text-zinc-500">Система (Авто)</span>
                        )}
                      </td>
                      <td className="py-4 px-5 text-[#94A3B8] text-xs sm:text-sm max-w-sm">
                        {item.reason && <div className="text-zinc-200 italic">«{item.reason}»</div>}
                        {item.metadata && (
                          <div className="font-mono text-xs text-zinc-500 line-clamp-1">
                            {typeof item.metadata === 'string'
                              ? item.metadata
                              : JSON.stringify(item.metadata)}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT ACHIEVEMENT MODAL */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-3xl bg-[#0B0D20] border border-[#1E2442] p-6 sm:p-7 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2442]">
              <div className="flex items-center gap-2.5">
                <Trophy className="w-6 h-6 text-[#A78BFA]" />
                <h3 className="text-lg font-bold text-[#F8FAFC]">
                  {editingItem ? 'Редактировать достижение' : 'Новое достижение'}
                </h3>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-2 rounded-xl hover:bg-[#151932] text-[#64748B] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800 text-sm text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveAchievement} className="space-y-4 text-sm">
              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold mb-1.5 block">Уникальный Slug:</label>
                <input
                  type="text"
                  disabled={!!editingItem}
                  placeholder="e.g. movies_10"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6] disabled:opacity-50 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold mb-1.5 block">Название:</label>
                <input
                  type="text"
                  placeholder="Название достижения..."
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
                  required
                />
              </div>

              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold mb-1.5 block">Описание:</label>
                <textarea
                  rows={2}
                  placeholder="Описание условий получения..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold mb-1.5 block">Иконка (Lucide):</label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>

                <div>
                  <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold mb-1.5 block">Очки (Points):</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.points}
                    onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })}
                    className="w-full h-11 px-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold mb-1.5 block">Редкость:</label>
                  <select
                    value={formData.rarity}
                    onChange={(e) => setFormData({ ...formData, rarity: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
                  >
                    <option value="COMMON">COMMON (Обычное)</option>
                    <option value="RARE">RARE (Редкое)</option>
                    <option value="EPIC">EPIC (Эпическое)</option>
                    <option value="LEGENDARY">LEGENDARY (Легендарное)</option>
                    <option value="MYTHIC">MYTHIC (Мифическое)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold mb-1.5 block">Статус:</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
                  >
                    <option value="ACTIVE">ACTIVE (Активно)</option>
                    <option value="DRAFT">DRAFT (Черновик)</option>
                    <option value="HIDDEN">HIDDEN (Скрыто)</option>
                    <option value="ARCHIVED">ARCHIVED (В архиве)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold mb-1.5 block">Тип условия (Condition Type):</label>
                <select
                  value={formData.conditionType}
                  onChange={(e) => setFormData({ ...formData, conditionType: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
                >
                  <option value="USER_REGISTERED">USER_REGISTERED (Регистрация)</option>
                  <option value="USER_VERIFIED">USER_VERIFIED (Подтвержденный профиль)</option>
                  <option value="MEDIA_COUNT">MEDIA_COUNT (Добавлено в библиотеку)</option>
                  <option value="MEDIA_COMPLETED_COUNT">MEDIA_COMPLETED_COUNT (Просмотрено/пройдено)</option>
                  <option value="MEDIA_TYPE_COUNT">MEDIA_TYPE_COUNT (Контент по категории)</option>
                  <option value="REVIEWS_COUNT">REVIEWS_COUNT (Количество отзывов)</option>
                  <option value="LIKES_RECEIVED_COUNT">LIKES_RECEIVED_COUNT (Полученные лайки)</option>
                  <option value="FRIENDS_COUNT">FRIENDS_COUNT (Количество друзей)</option>
                  <option value="LISTS_CREATED_COUNT">LISTS_CREATED_COUNT (Создано списков)</option>
                  <option value="LIST_ITEMS_COUNT">LIST_ITEMS_COUNT (Элементов в списках)</option>
                  <option value="TIER_LISTS_COUNT">TIER_LISTS_COUNT (Создано Tier Lists)</option>
                  <option value="DAYS_STREAK">DAYS_STREAK (Серия дней входа)</option>
                </select>
              </div>

              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold mb-1.5 block">
                  Конфигурация условий (JSON conditionConfig):
                </label>
                <textarea
                  rows={3}
                  value={formData.conditionConfig}
                  onChange={(e) => setFormData({ ...formData, conditionConfig: e.target.value })}
                  className="w-full p-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] font-mono text-xs text-[#F8FAFC] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="secret-checkbox"
                  checked={formData.isSecret}
                  onChange={(e) => setFormData({ ...formData, isSecret: e.target.checked })}
                  className="w-4 h-4 rounded border-[#1E2442] bg-[#11152A] text-[#8B5CF6] focus:ring-0"
                />
                <label htmlFor="secret-checkbox" className="text-[#F8FAFC] text-sm font-medium cursor-pointer">
                  Секретное достижение (скрывать условия до открытия)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#1E2442]">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="h-11 px-5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-zinc-300 font-semibold transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="h-11 px-6 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-bold transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2 shadow-lg shadow-purple-950/40"
                >
                  {formSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingItem ? 'Сохранить изменения' : 'Создать'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVOKE REASON MODAL */}
      {revokeModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-3xl bg-[#0B0D20] border border-red-900/60 p-6 sm:p-7 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Отозвать достижение</span>
            </h3>

            <p className="text-xs sm:text-sm text-[#94A3B8]">
              Вы собираетесь отозвать достижение «{revokeModalData.title}» у пользователя @
              {searchedUser?.username}. Укажите причину для аудита.
            </p>

            <div>
              <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold mb-1.5 block">Причина отзыва (обязательно):</label>
              <textarea
                rows={3}
                placeholder="Причина отзыва достижения..."
                value={revokeModalData.reason}
                onChange={(e) =>
                  setRevokeModalData({ ...revokeModalData, reason: e.target.value })
                }
                className="w-full p-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1E2442]">
              <button
                type="button"
                onClick={() => setRevokeModalData(null)}
                className="h-11 px-5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-zinc-300 text-sm font-semibold transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleExecuteRevoke}
                disabled={revoking || !revokeModalData.reason.trim()}
                className="h-11 px-6 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {revoking && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Подтвердить отзыв</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
