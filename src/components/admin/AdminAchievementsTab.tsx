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
    if (!userQuery.trim()) return;

    setUserLoading(true);
    setGrantErrorMsg(null);
    setGrantSuccessMsg(null);
    try {
      const res = await authFetch(`/api/achievements/user/${userQuery.trim().toLowerCase()}`);
      if (!res.ok) {
        throw new Error('Пользователь не найден');
      }
      const data = await res.json();
      setSearchedUser({ username: userQuery.trim().toLowerCase() });
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
    if (!searchedUser || !selectedAchId) {
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
          userId: searchedUser.id || (userAchievements[0] ? userAchievements[0].userId : undefined),
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
      const refreshRes = await authFetch(`/api/achievements/user/${searchedUser.username}`);
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
    if (!revokeModalData) return;
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
          userId: searchedUser.id || (userAchievements[0] ? userAchievements[0].userId : undefined),
          achievementId: revokeModalData.achievementId,
          reason: revokeModalData.reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка при отзыве');

      setGrantSuccessMsg(data.message || 'Достижение успешно отозвано');
      setRevokeModalData(null);

      // Refresh target user achievements
      const refreshRes = await authFetch(`/api/achievements/user/${searchedUser.username}`);
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
    <div className="space-y-6">
      {/* Sub-Tabs Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-[#14131A] border border-[#252233]">
        <div className="flex flex-wrap items-center gap-2">
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
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  subTab === tab.id
                    ? 'bg-[#9B6BFF] text-white shadow-md shadow-purple-950/40'
                    : 'bg-[#1C1A24] text-[#9A94AA] hover:text-[#F3F1F8] border border-[#2F2B42]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {subTab === 'list' && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-950/40 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Создать достижение</span>
          </button>
        )}
      </div>

      {/* 1. ACHIEVEMENTS LIST */}
      {subTab === 'list' && (
        <div className="space-y-4">
          {loadingList ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#AC82FF] animate-spin" />
              <p className="text-xs text-[#9A94AA]">Загрузка достижений...</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#252233] bg-[#14131A]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#252233] bg-[#181622] text-[#656075] font-mono text-[11px] uppercase">
                    <th className="py-3 px-4">ID / Slug</th>
                    <th className="py-3 px-4">Название & Описание</th>
                    <th className="py-3 px-4">Редкость & Очки</th>
                    <th className="py-3 px-4">Условие</th>
                    <th className="py-3 px-4">Статус</th>
                    <th className="py-3 px-4 text-center">Выдано раз</th>
                    <th className="py-3 px-4 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#201D2C]">
                  {achievements.map((ach) => {
                    const rInfo = RARITY_CONFIG[ach.rarity] || RARITY_CONFIG.COMMON;
                    return (
                      <tr key={ach.id} className="hover:bg-[#1A1827]/60 transition-colors">
                        <td className="py-3 px-4 font-mono text-[#9A94AA]">
                          <span className="text-[#F3F1F8] font-bold">#{ach.id}</span>
                          <div className="text-[10px] text-zinc-500">{ach.slug}</div>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-bold text-[#F3F1F8] flex items-center gap-1.5">
                            <span>{ach.title}</span>
                            {ach.isSecret && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono">
                                СЕКРЕТНОЕ
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#9A94AA] line-clamp-1">
                            {ach.description}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${rInfo.badgeBg}`}
                            >
                              {rInfo.label}
                            </span>
                            <span className="font-mono text-[#AC82FF] font-bold">
                              +{ach.points}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[#9A94AA]">
                          <div className="text-zinc-300 font-semibold">{ach.conditionType}</div>
                          <div className="text-[10px] text-zinc-500 line-clamp-1">
                            {JSON.stringify(ach.conditionConfig)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              ach.status === 'ACTIVE'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                                : ach.status === 'DRAFT'
                                ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                            }`}
                          >
                            {ach.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-[#F3F1F8]">
                          {ach.grantsCount}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleOpenEdit(ach)}
                            className="p-1.5 rounded-lg bg-[#1F1C2B] hover:bg-[#282438] text-[#AC82FF] border border-[#3A344E] transition-colors cursor-pointer"
                            title="Редактировать"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
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
          <div className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4">
            <h3 className="text-sm font-bold text-[#F3F1F8] flex items-center gap-2">
              <Search className="w-4 h-4 text-[#AC82FF]" />
              <span>Поиск пользователя для управления достижениями</span>
            </h3>

            <form onSubmit={handleSearchUser} className="flex gap-2 max-w-lg">
              <input
                type="text"
                placeholder="Введите username пользователя..."
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                className="flex-1 px-3.5 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
              />
              <button
                type="submit"
                disabled={userLoading}
                className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B5CF6] text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {userLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>Найти</span>
              </button>
            </form>

            {grantSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-300 font-medium flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{grantSuccessMsg}</span>
              </div>
            )}

            {grantErrorMsg && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-800 text-xs text-red-300 font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{grantErrorMsg}</span>
              </div>
            )}
          </div>

          {searchedUser && (
            <div className="space-y-6">
              {/* Grant New Achievement Card */}
              <div className="p-5 rounded-2xl bg-[#171424] border border-[#3A3355] space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#AC82FF] font-mono flex items-center gap-2">
                  <Award className="w-4 h-4" />
                  <span>Выдать новое достижение пользователю @{searchedUser.username}</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#9A94AA] mb-1 block">Выберите достижение:</label>
                    <select
                      value={selectedAchId}
                      onChange={(e) => setSelectedAchId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
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
                    <label className="text-[11px] text-[#9A94AA] mb-1 block">Причина выдачи (опционально):</label>
                    <input
                      type="text"
                      placeholder="Награда за активность, победу в конкурсе..."
                      value={grantReason}
                      onChange={(e) => setGrantReason(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                    />
                  </div>
                </div>

                <button
                  onClick={handleGrantSubmit}
                  disabled={!selectedAchId || grantActionLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {grantActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                  <span>Выдать достижение</span>
                </button>
              </div>

              {/* User Current Achievements Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#9A94AA] font-mono">
                  Текущие достижения пользователя @{searchedUser.username}
                </h4>

                <div className="overflow-x-auto rounded-2xl border border-[#252233] bg-[#14131A]">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#252233] bg-[#181622] text-[#656075] font-mono text-[11px] uppercase">
                        <th className="py-3 px-4">Достижение</th>
                        <th className="py-3 px-4">Редкость</th>
                        <th className="py-3 px-4">Статус</th>
                        <th className="py-3 px-4">Дата / Тип</th>
                        <th className="py-3 px-4 text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#201D2C]">
                      {userAchievements.map((ach) => (
                        <tr key={ach.id} className="hover:bg-[#1A1827]/60 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-bold text-[#F3F1F8] block">{ach.title}</span>
                            <span className="text-[11px] text-[#9A94AA]">{ach.description}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-800/40 bg-purple-950/40 text-purple-300">
                              {ach.rarity}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {ach.isUnlocked ? (
                              <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Получено
                              </span>
                            ) : (
                              <span className="text-zinc-500 font-medium text-[11px]">Не получено</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-[#9A94AA]">
                            {ach.isUnlocked ? (
                              <div>
                                <div>{ach.unlockedAt ? new Date(ach.unlockedAt).toLocaleDateString('ru-RU') : '-'}</div>
                                <div className="text-[10px] text-zinc-500">{ach.grantType}</div>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {ach.isUnlocked && (
                              <button
                                onClick={() =>
                                  setRevokeModalData({
                                    achievementId: ach.id,
                                    title: ach.title,
                                    reason: '',
                                  })
                                }
                                className="px-3 py-1 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-800 text-[11px] font-bold transition-colors cursor-pointer"
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
            <h3 className="text-xs font-bold text-[#9A94AA] font-mono uppercase tracking-wider">
              Журнал выдач, отзывов и начислений ({historyTotal})
            </h3>
            <button
              onClick={fetchHistory}
              className="text-xs text-[#AC82FF] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Обновить журнал</span>
            </button>
          </div>

          {historyLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#AC82FF] animate-spin" />
              <p className="text-xs text-[#9A94AA]">Загрузка истории...</p>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="py-16 text-center text-xs text-[#9A94AA] rounded-2xl bg-[#14131A] border border-[#252233]">
              Журнал действий пуст
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#252233] bg-[#14131A]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#252233] bg-[#181622] text-[#656075] font-mono text-[11px] uppercase">
                    <th className="py-3 px-4">Время</th>
                    <th className="py-3 px-4">Действие</th>
                    <th className="py-3 px-4">Достижение</th>
                    <th className="py-3 px-4">Пользователь</th>
                    <th className="py-3 px-4">Источник / Администратор</th>
                    <th className="py-3 px-4">Причина & Детали</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#201D2C]">
                  {historyItems.map((item) => (
                    <tr key={item.id} className="hover:bg-[#1A1827]/60 transition-colors">
                      <td className="py-3 px-4 font-mono text-[11px] text-[#9A94AA] whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString('ru-RU')}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
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
                      <td className="py-3 px-4 font-bold text-[#F3F1F8]">
                        {item.achievementTitle || `#${item.achievementId}`}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#AC82FF]">
                        @{item.targetUsername || `User #${item.userId}`}
                      </td>
                      <td className="py-3 px-4 text-[#9A94AA]">
                        {item.source === 'MANUAL' ? (
                          <span className="text-purple-300 font-medium">
                            Админ: @{item.adminUsername || item.adminId}
                          </span>
                        ) : (
                          <span className="font-mono text-zinc-500">Система (Авто)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#9A94AA] text-[11px] max-w-xs">
                        {item.reason && <div className="text-zinc-200 italic">«{item.reason}»</div>}
                        {item.metadata && (
                          <div className="font-mono text-[10px] text-zinc-500 line-clamp-1">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-3xl bg-[#141221] border border-[#3A3355] p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="text-base font-bold text-[#F3F1F8] flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#AC82FF]" />
              <span>{editingItem ? 'Редактировать достижение' : 'Новое достижение'}</span>
            </h3>

            {formError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-800 text-xs text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveAchievement} className="space-y-3 text-xs">
              <div>
                <label className="text-[#9A94AA] mb-1 block">Уникальный Slug:</label>
                <input
                  type="text"
                  disabled={!!editingItem}
                  placeholder="e.g. movies_10"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF] disabled:opacity-50"
                  required
                />
              </div>

              <div>
                <label className="text-[#9A94AA] mb-1 block">Название:</label>
                <input
                  type="text"
                  placeholder="Название достижения..."
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                  required
                />
              </div>

              <div>
                <label className="text-[#9A94AA] mb-1 block">Описание:</label>
                <textarea
                  rows={2}
                  placeholder="Описание условий получения..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#9A94AA] mb-1 block">Иконка (Lucide):</label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                  />
                </div>

                <div>
                  <label className="text-[#9A94AA] mb-1 block">Очки (Points):</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.points}
                    onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#9A94AA] mb-1 block">Редкость:</label>
                  <select
                    value={formData.rarity}
                    onChange={(e) => setFormData({ ...formData, rarity: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                  >
                    <option value="COMMON">COMMON (Обычное)</option>
                    <option value="RARE">RARE (Редкое)</option>
                    <option value="EPIC">EPIC (Эпическое)</option>
                    <option value="LEGENDARY">LEGENDARY (Легендарное)</option>
                    <option value="MYTHIC">MYTHIC (Мифическое)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[#9A94AA] mb-1 block">Статус:</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                  >
                    <option value="ACTIVE">ACTIVE (Активно)</option>
                    <option value="DRAFT">DRAFT (Черновик)</option>
                    <option value="HIDDEN">HIDDEN (Скрыто)</option>
                    <option value="ARCHIVED">ARCHIVED (В архиве)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[#9A94AA] mb-1 block">Тип условия (Condition Type):</label>
                <select
                  value={formData.conditionType}
                  onChange={(e) => setFormData({ ...formData, conditionType: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
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
                <label className="text-[#9A94AA] mb-1 block">
                  Конфигурация условий (JSON conditionConfig):
                </label>
                <textarea
                  rows={3}
                  value={formData.conditionConfig}
                  onChange={(e) => setFormData({ ...formData, conditionConfig: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] font-mono text-[11px] text-[#F3F1F8] focus:outline-none focus:border-[#9B6BFF]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="secret-checkbox"
                  checked={formData.isSecret}
                  onChange={(e) => setFormData({ ...formData, isSecret: e.target.checked })}
                  className="rounded border-[#2F2B42] bg-[#1C1A24] text-[#9B6BFF] focus:ring-0"
                />
                <label htmlFor="secret-checkbox" className="text-[#F3F1F8] text-xs font-medium cursor-pointer">
                  Секретное достижение (скрывать условия до открытия)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#252233]">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1C1A24] hover:bg-[#252233] text-zinc-300 font-bold transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B5CF6] text-white font-bold transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {formSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingItem ? 'Сохранить изменения' : 'Создать'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVOKE REASON MODAL */}
      {revokeModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-3xl bg-[#141221] border border-red-900/60 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Отозвать достижение</span>
            </h3>

            <p className="text-xs text-[#9A94AA]">
              Вы собираетесь отозвать достижение «{revokeModalData.title}» у пользователя @
              {searchedUser?.username}. Укажите причину для аудита.
            </p>

            <div>
              <label className="text-[11px] text-[#9A94AA] mb-1 block">Причина отзыва (обязательно):</label>
              <textarea
                rows={3}
                placeholder="Причина отзыва достижения..."
                value={revokeModalData.reason}
                onChange={(e) =>
                  setRevokeModalData({ ...revokeModalData, reason: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#1C1A24] border border-[#2F2B42] text-xs text-[#F3F1F8] focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRevokeModalData(null)}
                className="px-4 py-2 rounded-xl bg-[#1C1A24] hover:bg-[#252233] text-zinc-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleExecuteRevoke}
                disabled={revoking || !revokeModalData.reason.trim()}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {revoking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Подтвердить отзыв</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
