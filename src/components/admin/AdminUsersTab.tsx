import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Filter,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Ban,
  AlertTriangle,
  RotateCw,
  KeyRound,
  Ticket,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  Check,
  X,
  Clock,
  UserCheck,
  UserX,
  FileText,
  Copy,
  RefreshCw,
  Send,
  Calendar,
  Sparkles,
  Award,
  Hash,
  Mail,
  MessageSquare,
  Film,
  BookOpen,
  Gamepad2,
  Tv,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';

export const AdminUsersTab: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modals state
  const [selectedUserDetail, setSelectedUserDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Role Change Modal
  const [roleModalUser, setRoleModalUser] = useState<any | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('USER');
  const [savingRole, setSavingRole] = useState(false);

  // Warning Modal
  const [warnModalUser, setWarnModalUser] = useState<any | null>(null);
  const [warnReason, setWarnReason] = useState('');
  const [savingWarn, setSavingWarn] = useState(false);

  // Temp Ban Modal
  const [tempBanUser, setTempBanUser] = useState<any | null>(null);
  const [banDurationHours, setBanDurationHours] = useState('24');
  const [banReason, setBanReason] = useState('');
  const [savingBan, setSavingBan] = useState(false);

  // Block Confirm Modal
  const [userToBlock, setUserToBlock] = useState<any | null>(null);
  const [blocking, setBlocking] = useState(false);

  // Reset Password Modal
  const [resetModalData, setResetModalData] = useState<{
    username: string;
    resetUrl: string;
    copied: boolean;
  } | null>(null);
  const [generatingReset, setGeneratingReset] = useState<number | null>(null);

  // Invites Edit Modal
  const [invitesModalUser, setInvitesModalUser] = useState<any | null>(null);
  const [newInvitesCount, setNewInvitesCount] = useState<number>(3);
  const [savingInvites, setSavingInvites] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchUsers = useCallback(async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(limit),
        q: search.trim(),
        role: roleFilter,
        status: statusFilter,
      });
      const res = await authFetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Ошибка сервера (${res.status})`);
      }
      const data = await res.json();
      setUsers(data.items || []);
      setTotalPages(Math.max(1, data.totalPages || 1));
      setTotalCount(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить список пользователей');
    } finally {
      setLoading(false);
    }
  }, [authFetch, page, limit, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, roleFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (page === 1) {
      fetchUsers(1);
    } else {
      setPage(1);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setRoleFilter('ALL');
    setStatusFilter('ALL');
    setLimit(20);
    setPage(1);
  };

  const openUserDetails = async (userId: number) => {
    setDetailLoading(true);
    try {
      const res = await authFetch(`/api/admin/users/${userId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Ошибка получения данных пользователя');
      }
      const data = await res.json();
      setSelectedUserDetail(data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRoleChange = async () => {
    if (!roleModalUser) return;
    setSavingRole(true);
    try {
      const res = await authFetch(`/api/admin/users/${roleModalUser.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка изменения роли');
      setRoleModalUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingRole(false);
    }
  };

  const handleIssueWarning = async () => {
    if (!warnModalUser || !warnReason.trim()) return;
    setSavingWarn(true);
    try {
      const res = await authFetch(`/api/admin/users/${warnModalUser.id}/warning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: warnReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка вынесения предупреждения');
      setWarnModalUser(null);
      setWarnReason('');
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingWarn(false);
    }
  };

  const handleApplyBan = async () => {
    if (!tempBanUser) return;
    setSavingBan(true);
    try {
      const hours = parseInt(banDurationHours, 10) || 24;
      const res = await authFetch(`/api/admin/users/${tempBanUser.id}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationHours: hours, reason: banReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка наложения бана');
      setTempBanUser(null);
      setBanReason('');
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingBan(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!userToBlock) return;
    setBlocking(true);
    try {
      const res = await authFetch(`/api/admin/users/${userToBlock.id}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isBlocked: !userToBlock.isBlocked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка блокировки');
      setUserToBlock(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBlocking(false);
    }
  };

  const handleGeneratePasswordReset = async (user: any) => {
    setGeneratingReset(user.id);
    try {
      const res = await authFetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка генерации ссылки');
      setResetModalData({
        username: user.username,
        resetUrl: data.resetUrl,
        copied: false,
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGeneratingReset(null);
    }
  };

  const handleSaveInvites = async () => {
    if (!invitesModalUser) return;
    setSavingInvites(true);
    try {
      const res = await authFetch(`/api/admin/users/${invitesModalUser.id}/invites`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitesCount: newInvitesCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка обновления инвайтов');
      setInvitesModalUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingInvites(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30 whitespace-nowrap">
            Гл. Администратор
          </span>
        );
      case 'ADMIN':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 whitespace-nowrap">
            Администратор
          </span>
        );
      case 'MODERATOR':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 whitespace-nowrap">
            Модератор
          </span>
        );
      case 'CONTENT_MANAGER':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
            Контент-менеджер
          </span>
        );
      case 'NEWS_EDITOR':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 whitespace-nowrap">
            Редактор новостей
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/50 whitespace-nowrap">
            Пользователь
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl bg-[#14131A] border border-[#252233]">
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#9A94AA] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по никнейму, email, @telegram или #ID..."
              className="w-full pl-9 pr-4 py-2 bg-[#0F0E12] border border-[#252233] focus:border-[#9B6BFF] rounded-xl text-xs text-[#F3F1F8] placeholder-[#656075] outline-none transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A94AA] hover:text-[#F3F1F8]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-colors whitespace-nowrap"
          >
            Найти
          </button>
        </form>

        {/* Filter selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
          >
            <option value="ALL">Все роли</option>
            <option value="STAFF">Весь персонал</option>
            <option value="USER">Пользователи</option>
            <option value="MODERATOR">Модераторы</option>
            <option value="CONTENT_MANAGER">Контент-менеджеры</option>
            <option value="NEWS_EDITOR">Редакторы новостей</option>
            <option value="ADMIN">Администраторы</option>
            <option value="SUPER_ADMIN">Суперадмины</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
          >
            <option value="ALL">Любой статус</option>
            <option value="ACTIVE">Активные</option>
            <option value="TEMP_BANNED">Временный бан</option>
            <option value="BLOCKED">Заблокированные</option>
          </select>

          {/* Page Limit */}
          <select
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value, 10));
              setPage(1);
            }}
            className="px-2.5 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
          >
            <option value="10">10 / стр</option>
            <option value="20">20 / стр</option>
            <option value="50">50 / стр</option>
            <option value="100">100 / стр</option>
          </select>

          {/* Reset button */}
          {(search || roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button
              onClick={handleResetFilters}
              title="Сбросить фильтры"
              className="px-3 py-2 rounded-xl bg-[#0F0E12] border border-[#252233] text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#191724] text-xs transition-colors"
            >
              Сброс
            </button>
          )}

          {/* Refresh button */}
          <button
            onClick={() => fetchUsers(page)}
            disabled={loading}
            title="Обновить список"
            className="p-2 rounded-xl bg-[#0F0E12] border border-[#252233] text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#191724] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#9B6BFF]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Users Count Summary */}
      <div className="text-xs text-[#9A94AA] flex items-center justify-between px-1">
        <span>
          Всего в базе: <strong className="text-[#F3F1F8]">{totalCount}</strong> пользователей
          {(search || roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <span className="ml-2 text-purple-300">(с учётом активных фильтров)</span>
          )}
        </span>
        <span>
          Страница <strong className="text-[#F3F1F8]">{page}</strong> из <strong className="text-[#F3F1F8]">{totalPages}</strong>
        </span>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl bg-[#14131A] border border-[#252233] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <RotateCw className="w-6 h-6 text-[#9B6BFF] animate-spin" />
            <span className="text-xs text-[#9A94AA]">Загрузка пользователей из базы данных...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <div className="text-red-400 text-xs font-semibold">{error}</div>
            <button
              onClick={() => fetchUsers(page)}
              className="px-4 py-2 bg-[#9B6BFF] text-white rounded-xl text-xs font-bold hover:bg-[#8B58F8] transition-colors"
            >
              Повторить попытку
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-xs space-y-2">
            <Users className="w-8 h-8 text-zinc-600 mx-auto" />
            <p>Пользователи не найдены по заданным критериям</p>
            {(search || roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button
                onClick={handleResetFilters}
                className="mt-2 px-3 py-1.5 bg-[#252233] text-purple-300 rounded-lg text-xs hover:bg-[#322E45] transition-colors"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#252233] bg-[#0F0E12]/80 text-[#656075] uppercase tracking-wider font-mono text-[10px]">
                  <th className="py-3 px-4">Пользователь</th>
                  <th className="py-3 px-3">Отображаемое имя</th>
                  <th className="py-3 px-3">Роль</th>
                  <th className="py-3 px-3">Статус</th>
                  <th className="py-3 px-3">Дата регистр.</th>
                  <th className="py-3 px-3">Приглашён кем</th>
                  <th className="py-3 px-3 text-center">Пригласил (чел.)</th>
                  <th className="py-3 px-3 text-center">Инвайты</th>
                  <th className="py-3 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252233]/60">
                {users.map((u) => {
                  const isTempBanned = u.bannedUntil && new Date(u.bannedUntil) > new Date();
                  const displayName = u.telegramUsername
                    ? `@${u.telegramUsername}`
                    : u.email
                    ? u.email
                    : '—';

                  return (
                    <tr key={u.id} className="hover:bg-[#191724] transition-colors">
                      {/* 1. Avatar & Username */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {u.avatar ? (
                            <img
                              src={u.avatar}
                              alt={u.username}
                              className="w-8 h-8 rounded-xl object-cover border border-[#252233] shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-xl bg-purple-900/40 border border-purple-500/30 flex items-center justify-center font-bold text-purple-300 shrink-0">
                              {u.username ? u.username.charAt(0).toUpperCase() : 'U'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-[#F3F1F8] flex items-center gap-1.5 truncate">
                              <span className="hover:underline cursor-pointer" onClick={() => openUserDetails(u.id)}>
                                {u.username}
                              </span>
                              <span className="text-[10px] text-[#656075] font-mono">#{u.id}</span>
                            </div>
                            <div className="text-[10px] text-[#656075] font-mono truncate">
                              {u.uid ? u.uid.substring(0, 16) : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Display Name / Telegram / Email */}
                      <td className="py-3 px-3">
                        <div className="text-[11px] text-[#9A94AA] truncate max-w-[140px]" title={displayName}>
                          {displayName}
                        </div>
                      </td>

                      {/* 3. Role */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {getRoleBadge(u.role)}
                      </td>

                      {/* 4. Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {u.isBlocked ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                            Заблокирован
                          </span>
                        ) : isTempBanned ? (
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-max"
                            title={`Бан до ${new Date(u.bannedUntil).toLocaleString('ru-RU')}`}
                          >
                            <Clock className="w-3 h-3" />
                            Бан до {new Date(u.bannedUntil).toLocaleDateString('ru-RU')}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Активен
                          </span>
                        )}
                      </td>

                      {/* 5. Registration Date */}
                      <td className="py-3 px-3 whitespace-nowrap text-[#9A94AA] text-[11px]">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('ru-RU') : '—'}
                      </td>

                      {/* 6. Invited By */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {u.invitedByUsername ? (
                          <button
                            onClick={() => {
                              if (u.invitedByUserId) openUserDetails(u.invitedByUserId);
                            }}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#0F0E12] border border-[#252233] hover:border-purple-500/50 hover:bg-purple-950/20 text-left transition-colors group max-w-[160px]"
                            title={`Пригласил @${u.invitedByUsername} (код: ${u.usedInviteCode || '—'})`}
                          >
                            {u.invitedByAvatar ? (
                              <img
                                src={u.invitedByAvatar}
                                alt={u.invitedByUsername}
                                className="w-4 h-4 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-4 h-4 rounded-full bg-purple-900/60 text-[9px] font-bold text-purple-300 flex items-center justify-center shrink-0">
                                {u.invitedByUsername.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex flex-col min-w-0">
                              <span className="text-[11px] font-medium text-purple-300 group-hover:underline truncate">
                                @{u.invitedByUsername}
                              </span>
                              {u.usedInviteCode && (
                                <span className="text-[9px] text-[#656075] font-mono leading-none truncate">
                                  {u.usedInviteCode}
                                </span>
                              )}
                            </div>
                          </button>
                        ) : u.usedInviteCode ? (
                          <div className="inline-flex flex-col">
                            <span className="text-[10px] font-medium text-amber-300/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              Системный
                            </span>
                            <span className="text-[9px] text-[#656075] font-mono mt-0.5">
                              {u.usedInviteCode}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[#656075] italic">
                            Прямая регистр.
                          </span>
                        )}
                      </td>

                      {/* 7. Invited Users Count */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => openUserDetails(u.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-bold transition-colors ${
                            (u.invitedUsersCount || 0) > 0
                              ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20'
                              : 'text-[#656075] hover:text-[#9A94AA]'
                          }`}
                          title={`Пользователь пригласил ${u.invitedUsersCount || 0} чел.`}
                        >
                          <Users className="w-3 h-3" />
                          {u.invitedUsersCount || 0}
                        </button>
                      </td>

                      {/* 8. Invites Left */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => {
                            setInvitesModalUser(u);
                            setNewInvitesCount(u.invitesLeft ?? 3);
                          }}
                          className="hover:underline font-mono text-purple-300 text-xs px-1.5 py-0.5 rounded hover:bg-purple-950/30 transition-colors"
                          title="Изменить баланс инвайтов"
                        >
                          {u.invitesLeft ?? 0}
                        </button>
                      </td>

                      {/* 9. Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* View details */}
                          <button
                            onClick={() => openUserDetails(u.id)}
                            title="Карточка пользователя"
                            className="p-1.5 rounded-lg bg-[#0F0E12] hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Role change */}
                          <button
                            onClick={() => {
                              setRoleModalUser(u);
                              setSelectedRole(u.role);
                            }}
                            title="Сменить роль"
                            className="p-1.5 rounded-lg bg-[#0F0E12] hover:bg-purple-900/30 text-[#9A94AA] hover:text-purple-300 transition-colors"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>

                          {/* Issue warning */}
                          <button
                            onClick={() => {
                              setWarnModalUser(u);
                              setWarnReason('');
                            }}
                            title="Вынести предупреждение"
                            className="p-1.5 rounded-lg bg-[#0F0E12] hover:bg-amber-900/30 text-[#9A94AA] hover:text-amber-300 transition-colors"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </button>

                          {/* Temporary ban */}
                          <button
                            onClick={() => {
                              setTempBanUser(u);
                              setBanReason('');
                            }}
                            title="Временный бан"
                            className="p-1.5 rounded-lg bg-[#0F0E12] hover:bg-orange-900/30 text-[#9A94AA] hover:text-orange-300 transition-colors"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>

                          {/* Permanent block / unblock */}
                          <button
                            onClick={() => setUserToBlock(u)}
                            title={u.isBlocked ? 'Разблокировать' : 'Заблокировать навсегда'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              u.isBlocked
                                ? 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/60'
                                : 'bg-[#0F0E12] hover:bg-red-900/30 text-[#9A94AA] hover:text-red-400'
                            }`}
                          >
                            {u.isBlocked ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>

                          {/* Reset Password */}
                          <button
                            onClick={() => handleGeneratePasswordReset(u)}
                            disabled={generatingReset === u.id}
                            title="Сбросить пароль"
                            className="p-1.5 rounded-lg bg-[#0F0E12] hover:bg-blue-900/30 text-[#9A94AA] hover:text-blue-300 transition-colors"
                          >
                            {generatingReset === u.id ? (
                              <RotateCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <KeyRound className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 border-t border-[#252233] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#9A94AA]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="px-2.5 py-1.5 rounded-xl bg-[#0F0E12] border border-[#252233] hover:bg-[#191724] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Первая страница"
            >
              « 1
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-xl bg-[#0F0E12] border border-[#252233] hover:bg-[#191724] disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Назад
            </button>
          </div>

          <div className="flex items-center gap-1">
            <span className="px-2">
              Страница <strong className="text-[#F3F1F8]">{page}</strong> из <strong className="text-[#F3F1F8]">{totalPages}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-xl bg-[#0F0E12] border border-[#252233] hover:bg-[#191724] disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1"
            >
              Вперёд
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="px-2.5 py-1.5 rounded-xl bg-[#0F0E12] border border-[#252233] hover:bg-[#191724] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Последняя страница"
            >
              {totalPages} »
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 1. User Full Detail Modal */}
      {/* ============================================================ */}
      {selectedUserDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-3xl bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#252233]">
              <div className="flex items-center gap-3">
                {selectedUserDetail.user.avatar ? (
                  <img
                    src={selectedUserDetail.user.avatar}
                    alt={selectedUserDetail.user.username}
                    className="w-12 h-12 rounded-xl object-cover border border-[#252233]"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-purple-900/40 border border-purple-500/30 flex items-center justify-center text-lg font-bold text-purple-300">
                    {selectedUserDetail.user.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold text-[#F3F1F8] flex items-center gap-2">
                    {selectedUserDetail.user.username}
                    {getRoleBadge(selectedUserDetail.user.role)}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-[#9A94AA]">
                    <span>{selectedUserDetail.user.email || 'Email отсутствует'}</span>
                    {selectedUserDetail.user.telegramUsername && (
                      <span className="text-purple-300">@{selectedUserDetail.user.telegramUsername}</span>
                    )}
                    <span className="text-[10px] text-[#656075] font-mono">ID: #{selectedUserDetail.user.id}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserDetail(null)}
                className="p-1.5 rounded-lg hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Basic Info & Status strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233]">
                <span className="text-[#9A94AA] block text-[10px] uppercase font-mono">Статус аккаунта</span>
                <div className="mt-1">
                  {selectedUserDetail.user.isBlocked ? (
                    <span className="text-red-400 font-bold">Заблокирован</span>
                  ) : selectedUserDetail.user.bannedUntil && new Date(selectedUserDetail.user.bannedUntil) > new Date() ? (
                    <span className="text-amber-300 font-bold">
                      Бан до {new Date(selectedUserDetail.user.bannedUntil).toLocaleDateString('ru-RU')}
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-bold">Активен</span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233]">
                <span className="text-[#9A94AA] block text-[10px] uppercase font-mono">Дата регистрации</span>
                <span className="text-xs font-semibold text-[#F3F1F8] mt-1 block">
                  {selectedUserDetail.user.createdAt
                    ? new Date(selectedUserDetail.user.createdAt).toLocaleDateString('ru-RU')
                    : '—'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233]">
                <span className="text-[#9A94AA] block text-[10px] uppercase font-mono">Баланс инвайтов</span>
                <span className="text-base font-bold text-purple-300 mt-0.5 block font-mono">
                  {selectedUserDetail.user.invitesLeft ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233]">
                <span className="text-[#9A94AA] block text-[10px] uppercase font-mono">Пригласил (всего)</span>
                <span className="text-base font-bold text-[#F3F1F8] mt-0.5 block font-mono">
                  {selectedUserDetail.invitedUsers?.length ?? 0} чел.
                </span>
              </div>
            </div>

            {/* Counts grid (activity in tracker) */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-[#0F0E12] border border-[#252233] text-center">
                <span className="text-[#9A94AA] block text-[10px]">Отзывов</span>
                <span className="text-sm font-bold text-[#F3F1F8]">
                  {selectedUserDetail.stats?.reviewsCount ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0F0E12] border border-[#252233] text-center">
                <span className="text-[#9A94AA] block text-[10px]">Списков</span>
                <span className="text-sm font-bold text-[#F3F1F8]">
                  {selectedUserDetail.stats?.listsCount ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0F0E12] border border-[#252233] text-center">
                <span className="text-[#9A94AA] block text-[10px]">Тир-листов</span>
                <span className="text-sm font-bold text-[#F3F1F8]">
                  {selectedUserDetail.stats?.tierListsCount ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0F0E12] border border-[#252233] text-center">
                <span className="text-[#9A94AA] block text-[10px]">Комментариев</span>
                <span className="text-sm font-bold text-[#F3F1F8]">
                  {selectedUserDetail.stats?.commentsCount ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0F0E12] border border-[#252233] text-center">
                <span className="text-[#9A94AA] block text-[10px]">Друзей</span>
                <span className="text-sm font-bold text-[#F3F1F8]">
                  {selectedUserDetail.stats?.friendsCount ?? 0}
                </span>
              </div>
            </div>

            {/* ========================================================= */}
            {/* БЛОК 1: Приглашения (Кто пригласил этого пользователя) */}
            {/* ========================================================= */}
            <div className="p-4 rounded-xl bg-[#0F0E12] border border-[#252233] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5 text-purple-400" />
                  Приглашения • Кто пригласил пользователя
                </h4>
                {selectedUserDetail.invitedBy?.inviteCode && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                    Код: {selectedUserDetail.invitedBy.inviteCode}
                  </span>
                )}
              </div>

              {selectedUserDetail.invitedBy ? (
                <div className="space-y-2.5">
                  {selectedUserDetail.invitedBy.inviter ? (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#14131A] border border-[#252233]">
                      <div className="flex items-center gap-2.5">
                        {selectedUserDetail.invitedBy.inviter.avatar ? (
                          <img
                            src={selectedUserDetail.invitedBy.inviter.avatar}
                            alt={selectedUserDetail.invitedBy.inviter.username}
                            className="w-9 h-9 rounded-xl object-cover border border-[#252233]"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-purple-900/40 border border-purple-500/30 flex items-center justify-center font-bold text-purple-300 text-xs">
                            {selectedUserDetail.invitedBy.inviter.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#F3F1F8]">
                              @{selectedUserDetail.invitedBy.inviter.username}
                            </span>
                            {getRoleBadge(selectedUserDetail.invitedBy.inviter.role)}
                          </div>
                          <span className="text-[11px] text-[#9A94AA]">
                            {selectedUserDetail.invitedBy.inviter.email || 'Email не указан'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => openUserDetails(selectedUserDetail.invitedBy.inviter.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#252233] hover:bg-[#322E45] text-xs font-medium text-purple-300 flex items-center gap-1 transition-colors"
                      >
                        Карточка
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  ) : selectedUserDetail.invitedBy.isSystemInvite ? (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                      <Ticket className="w-4 h-4 shrink-0 text-amber-400" />
                      <div>
                        <div className="font-semibold">Системный инвайт-код</div>
                        <div className="text-[11px] text-[#9A94AA]">Создан администратором напрямую без привязки к пользователю</div>
                      </div>
                    </div>
                  ) : null}

                  {/* Invite Code, Dates */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                    <div className="p-2.5 rounded-lg bg-[#14131A] border border-[#252233]/80">
                      <span className="text-[10px] text-[#656075] uppercase block font-mono">Инвайт-код</span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="font-mono font-bold text-purple-300 text-xs">
                          {selectedUserDetail.invitedBy.inviteCode}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedUserDetail.invitedBy.inviteCode);
                            setCopiedCode(selectedUserDetail.invitedBy.inviteCode);
                            setTimeout(() => setCopiedCode(null), 2000);
                          }}
                          className="text-[#9A94AA] hover:text-[#F3F1F8] p-0.5"
                          title="Скопировать инвайт-код"
                        >
                          {copiedCode === selectedUserDetail.invitedBy.inviteCode ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#14131A] border border-[#252233]/80">
                      <span className="text-[10px] text-[#656075] uppercase block font-mono">Дата создания инвайта</span>
                      <span className="font-medium text-[#F3F1F8] text-xs mt-0.5 block">
                        {selectedUserDetail.invitedBy.inviteCreatedAt
                          ? new Date(selectedUserDetail.invitedBy.inviteCreatedAt).toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#14131A] border border-[#252233]/80">
                      <span className="text-[10px] text-[#656075] uppercase block font-mono">Дата регистрации</span>
                      <span className="font-medium text-[#F3F1F8] text-xs mt-0.5 block">
                        {selectedUserDetail.user.createdAt
                          ? new Date(selectedUserDetail.user.createdAt).toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-[#14131A] border border-[#252233] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#9A94AA]" />
                    <div>
                      <span className="font-medium text-[#F3F1F8] block">Прямая регистрация</span>
                      <span className="text-[11px] text-[#9A94AA]">Пользователь зарегистрировался без инвайт-кода (открытая регистрация)</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-[#656075] font-mono shrink-0">
                    {selectedUserDetail.user.createdAt ? new Date(selectedUserDetail.user.createdAt).toLocaleDateString('ru-RU') : '—'}
                  </span>
                </div>
              )}
            </div>

            {/* ========================================================= */}
            {/* БЛОК 2: Кого пригласил пользователь */}
            {/* ========================================================= */}
            <div className="p-4 rounded-xl bg-[#0F0E12] border border-[#252233] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-purple-400" />
                  Кого пригласил пользователь ({selectedUserDetail.invitedUsers?.length || 0})
                </h4>
                <span className="text-[11px] text-[#9A94AA]">
                  Осталось инвайтов: <strong className="text-purple-300">{selectedUserDetail.user.invitesLeft ?? 0}</strong>
                </span>
              </div>

              {!selectedUserDetail.invitedUsers || selectedUserDetail.invitedUsers.length === 0 ? (
                <div className="p-4 rounded-lg bg-[#14131A] border border-[#252233] text-center text-xs text-[#656075]">
                  Пользователь пока никого не пригласил
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {selectedUserDetail.invitedUsers.map((invUser: any) => {
                    const isInvBanned = invUser.bannedUntil && new Date(invUser.bannedUntil) > new Date();
                    return (
                      <div
                        key={invUser.id}
                        className="p-2.5 rounded-xl bg-[#14131A] border border-[#252233] hover:border-purple-500/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {invUser.avatar ? (
                            <img
                              src={invUser.avatar}
                              alt={invUser.username}
                              className="w-8 h-8 rounded-xl object-cover border border-[#252233] shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-xl bg-purple-900/40 border border-purple-500/30 flex items-center justify-center font-bold text-purple-300 shrink-0 text-xs">
                              {invUser.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-[#F3F1F8]">@{invUser.username}</span>
                              {getRoleBadge(invUser.role)}
                              {invUser.isBlocked ? (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                                  Заблокирован
                                </span>
                              ) : isInvBanned ? (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Бан
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  Активен
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#9A94AA] truncate">
                              {invUser.email || 'Email отсутствует'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                          <div className="text-right">
                            <div className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20 inline-block">
                              {invUser.inviteCode}
                            </div>
                            <div className="text-[10px] text-[#656075] mt-0.5">
                              {new Date(invUser.createdAt).toLocaleDateString('ru-RU')}
                            </div>
                          </div>
                          <button
                            onClick={() => openUserDetails(invUser.id)}
                            title="Открыть профиль"
                            className="p-1.5 rounded-lg bg-[#0F0E12] hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ========================================================= */}
            {/* БЛОК 3: Активные / Сгенерированные инвайт-коды */}
            {/* ========================================================= */}
            {selectedUserDetail.activeInviteCodes && selectedUserDetail.activeInviteCodes.length > 0 && (
              <div className="p-4 rounded-xl bg-[#0F0E12] border border-[#252233] space-y-2.5">
                <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  Активные (неиспользованные) инвайты ({selectedUserDetail.activeInviteCodes.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedUserDetail.activeInviteCodes.map((codeItem: any) => (
                    <div
                      key={codeItem.id}
                      className="p-2.5 rounded-lg bg-[#14131A] border border-[#252233] flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-purple-300">{codeItem.code}</span>
                        <span className="text-[10px] text-[#656075]">
                          {new Date(codeItem.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(codeItem.code);
                          setCopiedCode(codeItem.code);
                          setTimeout(() => setCopiedCode(null), 2000);
                        }}
                        className="p-1 text-[#9A94AA] hover:text-[#F3F1F8]"
                        title="Скопировать"
                      >
                        {copiedCode === codeItem.code ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reports & Audit logs */}
            {((selectedUserDetail.reports && selectedUserDetail.reports.length > 0) ||
              (selectedUserDetail.auditLogs && selectedUserDetail.auditLogs.length > 0)) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Reports */}
                <div>
                  <h4 className="text-xs font-bold text-[#F3F1F8] mb-2 uppercase tracking-wider">
                    Жалобы ({selectedUserDetail.reports?.length || 0})
                  </h4>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {selectedUserDetail.reports?.map((r: any) => (
                      <div key={r.id} className="p-2 rounded-lg bg-[#0F0E12] border border-[#252233] text-xs flex justify-between">
                        <div>
                          <span className="font-bold text-red-400">{r.reason}: </span>
                          <span className="text-[#9A94AA] text-[11px]">{r.description || 'Без пояснения'}</span>
                        </div>
                        <span className="text-[10px] text-[#656075] shrink-0 ml-1">
                          {new Date(r.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Audit Logs */}
                <div>
                  <h4 className="text-xs font-bold text-[#F3F1F8] mb-2 uppercase tracking-wider">
                    История аудита ({selectedUserDetail.auditLogs?.length || 0})
                  </h4>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {selectedUserDetail.auditLogs?.map((log: any) => (
                      <div key={log.id} className="p-2 rounded-lg bg-[#0F0E12] border border-[#252233] text-[11px] flex justify-between">
                        <span className="text-[#9A94AA] truncate">{log.details}</span>
                        <span className="text-[#656075] ml-2 shrink-0">{new Date(log.createdAt).toLocaleDateString('ru-RU')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedUserDetail(null)}
                className="px-4 py-2 rounded-xl bg-[#252233] text-xs font-semibold text-[#F3F1F8] hover:bg-[#322E45] transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. Change Role Modal */}
      {/* ============================================================ */}
      {roleModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#F3F1F8]">
              Сменить роль для @{roleModalUser.username}
            </h3>
            <p className="text-xs text-[#9A94AA]">
              Выберите уровень доступа сотрудника или пользователя в системе.
            </p>

            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
            >
              <option value="USER">USER — Обычный пользователь</option>
              <option value="NEWS_EDITOR">NEWS_EDITOR — Редактор новостей</option>
              <option value="CONTENT_MANAGER">CONTENT_MANAGER — Контент-менеджер</option>
              <option value="MODERATOR">MODERATOR — Модератор</option>
              <option value="ADMIN">ADMIN — Администратор</option>
              {dbUser?.role === 'SUPER_ADMIN' && (
                <option value="SUPER_ADMIN">SUPER_ADMIN — Главный администратор</option>
              )}
            </select>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setRoleModalUser(null)}
                className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8]"
              >
                Отмена
              </button>
              <button
                onClick={handleRoleChange}
                disabled={savingRole}
                className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-xs font-bold text-white flex items-center gap-1.5"
              >
                {savingRole && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. Issue Warning Modal */}
      {/* ============================================================ */}
      {warnModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold text-[#F3F1F8]">
                Предупреждение для @{warnModalUser.username}
              </h3>
            </div>
            <p className="text-xs text-[#9A94AA]">
              У пользователя сейчас <strong>{warnModalUser.warningCount || 0}</strong> предупреждений. После вынесения счётчик увеличится на 1, а пользователю придёт системное уведомление.
            </p>

            <textarea
              value={warnReason}
              onChange={(e) => setWarnReason(e.target.value)}
              placeholder="Причина вынесения предупреждения (нарушение правил, спам, токсичность)..."
              rows={3}
              className="w-full p-3 bg-[#0F0E12] border border-[#252233] focus:border-amber-500 rounded-xl text-xs text-[#F3F1F8] placeholder-[#656075] outline-none"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setWarnModalUser(null)}
                className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8]"
              >
                Отмена
              </button>
              <button
                onClick={handleIssueWarning}
                disabled={savingWarn || !warnReason.trim()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-black text-xs font-bold flex items-center gap-1.5"
              >
                {savingWarn && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                Вынести предупреждение
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. Temporary Ban Modal */}
      {/* ============================================================ */}
      {tempBanUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-orange-400">
              <Clock className="w-5 h-5" />
              <h3 className="text-sm font-bold text-[#F3F1F8]">
                Временный бан @{tempBanUser.username}
              </h3>
            </div>
            <p className="text-xs text-[#9A94AA]">
              В течение срока бана пользователь не сможет авторизоваться и выполнять действия на сайте.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Срок ограничения:</label>
                <select
                  value={banDurationHours}
                  onChange={(e) => setBanDurationHours(e.target.value)}
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                >
                  <option value="1">1 час</option>
                  <option value="6">6 часов</option>
                  <option value="24">24 часа (1 день)</option>
                  <option value="72">72 часа (3 дня)</option>
                  <option value="168">7 дней (1 неделя)</option>
                  <option value="720">30 дней (1 месяц)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Причина бана:</label>
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Нарушение правил сообщества..."
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setTempBanUser(null)}
                className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8]"
              >
                Отмена
              </button>
              <button
                onClick={handleApplyBan}
                disabled={savingBan}
                className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-black text-xs font-bold flex items-center gap-1.5"
              >
                {savingBan && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                Применить бан
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. Permanent Block Confirm Modal */}
      {/* ============================================================ */}
      <ConfirmModal
        isOpen={!!userToBlock}
        onCancel={() => setUserToBlock(null)}
        onConfirm={handleToggleBlock}
        title={userToBlock?.isBlocked ? 'Разблокировать пользователя?' : 'Заблокировать пользователя навсегда?'}
        message={
          userToBlock?.isBlocked
            ? `Пользователь @${userToBlock?.username} снова сможет входить и пользоваться сайтом.`
            : `Пользователь @${userToBlock?.username} потеряет доступ к сайту до отмены блокировки.`
        }
        confirmText={userToBlock?.isBlocked ? 'Разблокировать' : 'Заблокировать'}
        cancelText="Отмена"
        variant={!userToBlock?.isBlocked ? 'danger' : 'primary'}
      />

      {/* ============================================================ */}
      {/* 6. Password Reset Link Modal */}
      {/* ============================================================ */}
      {resetModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-blue-400">
              <KeyRound className="w-5 h-5" />
              <h3 className="text-sm font-bold text-[#F3F1F8]">
                Ссылка сброса пароля: @{resetModalData.username}
              </h3>
            </div>
            <p className="text-xs text-[#9A94AA]">
              Передайте эту одноразовую ссылку пользователю. Ссылка действительна 24 часа.
            </p>

            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#0F0E12] border border-[#252233]">
              <input
                type="text"
                readOnly
                value={resetModalData.resetUrl}
                className="w-full bg-transparent text-xs text-blue-300 outline-none select-all"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(resetModalData.resetUrl);
                  setResetModalData({ ...resetModalData, copied: true });
                }}
                className="p-1.5 rounded-lg bg-[#252233] hover:bg-[#322E45] text-white shrink-0"
              >
                {resetModalData.copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setResetModalData(null)}
                className="px-4 py-2 rounded-xl bg-[#252233] text-xs font-semibold text-[#F3F1F8]"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. Edit Invites Modal */}
      {/* ============================================================ */}
      {invitesModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#F3F1F8]">
              Количество инвайтов: @{invitesModalUser.username}
            </h3>
            <p className="text-xs text-[#9A94AA]">
              Укажите доступный пользователю баланс приглашений.
            </p>

            <input
              type="number"
              min="0"
              max="999"
              value={newInvitesCount}
              onChange={(e) => setNewInvitesCount(parseInt(e.target.value, 10) || 0)}
              className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-sm font-mono text-[#F3F1F8] outline-none"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setInvitesModalUser(null)}
                className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8]"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveInvites}
                disabled={savingInvites}
                className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-xs font-bold text-white"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
