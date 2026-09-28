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
  Music,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatAuditLog } from '../../utils/auditFormatter.ts';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';
import { getUserRoles, type SystemRole, ROLE_LABELS, ROLE_BADGE_COLORS } from '../../utils/rbac.ts';

export const AdminUsersTab: React.FC = () => {
  const { authFetch, dbUser, isAdmin, isSuperAdmin } = useAuth();
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

  // Role Change Modal (Independent Multi-roles)
  const [roleModalUser, setRoleModalUser] = useState<any | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<SystemRole[]>(['user']);
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
      const res = await authFetch(`/api/admin/users/${roleModalUser.id}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: selectedRoles }),
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
    const r = String(role || '').toLowerCase();
    switch (r) {
      case 'super_admin':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/30 whitespace-nowrap">
            Гл. Администратор
          </span>
        );
      case 'admin':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 whitespace-nowrap">
            Администратор
          </span>
        );
      case 'moderator':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 whitespace-nowrap">
            Модератор
          </span>
        );
      case 'content_manager':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
            Контент-менеджер
          </span>
        );
      case 'news_editor':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 whitespace-nowrap">
            Редактор новостей
          </span>
        );
      case 'musician':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 whitespace-nowrap">
            🎵 Музыкант
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/50 whitespace-nowrap">
            Пользователь
          </span>
        );
    }
  };

  const renderRoleBadges = (u: any) => {
    const userRoles = getUserRoles(u);
    const nonUserRoles = userRoles.filter((r) => r !== 'user');
    if (nonUserRoles.length === 0) {
      return getRoleBadge('user');
    }
    return (
      <div className="flex flex-wrap gap-1.5 items-center">
        {nonUserRoles.map((r) => (
          <React.Fragment key={r}>{getRoleBadge(r)}</React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4.5 h-4.5 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по никнейму, email, @telegram или #ID..."
              className="w-full h-11 pl-10 pr-4 bg-[#11152A] border border-[#1E2442] focus:border-[#8B5CF6] rounded-xl text-sm text-[#F8FAFC] placeholder-[#64748B] outline-none transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="h-11 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold transition-colors whitespace-nowrap cursor-pointer shadow-md"
          >
            Найти
          </button>
        </form>

        {/* Filter selectors */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs sm:text-sm text-[#F8FAFC] outline-none font-medium cursor-pointer"
          >
            <option value="ALL">Все роли</option>
            <option value="STAFF">Весь персонал</option>
            <option value="MUSICIAN">🎵 Музыканты</option>
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
            className="h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs sm:text-sm text-[#F8FAFC] outline-none font-medium cursor-pointer"
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
            className="h-11 px-3 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs sm:text-sm text-[#F8FAFC] outline-none font-medium cursor-pointer"
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
              className="h-11 px-3.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              Сброс
            </button>
          )}

          {/* Refresh button */}
          <button
            onClick={() => fetchUsers(page)}
            disabled={loading}
            title="Обновить список"
            className="h-11 w-11 flex items-center justify-center rounded-xl bg-[#11152A] border border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4.5 h-4.5 ${loading ? 'animate-spin text-[#8B5CF6]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Users Count Summary */}
      <div className="text-xs sm:text-sm text-[#94A3B8] flex items-center justify-between px-1">
        <span>
          Всего в базе: <strong className="text-[#F8FAFC]">{totalCount}</strong> пользователей
          {(search || roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <span className="ml-2 text-[#A78BFA] font-semibold">(с учётом активных фильтров)</span>
          )}
        </span>
        <span>
          Страница <strong className="text-[#F8FAFC]">{page}</strong> из <strong className="text-[#F8FAFC]">{totalPages}</strong>
        </span>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl bg-[#0B0D20] border border-[#1E2442] overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <RotateCw className="w-6 h-6 text-[#8B5CF6] animate-spin" />
            <span className="text-xs text-[#94A3B8]">Загрузка пользователей из базы данных...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <div className="text-red-400 text-xs font-semibold">{error}</div>
            <button
              onClick={() => fetchUsers(page)}
              className="px-4 py-2 bg-[#7C3AED] text-white rounded-xl text-xs font-bold hover:bg-[#6D28D9] transition-colors cursor-pointer"
            >
              Повторить попытку
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-[#64748B] text-xs space-y-2">
            <Users className="w-8 h-8 text-[#64748B] mx-auto" />
            <p>Пользователи не найдены по заданным критериям</p>
            {(search || roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button
                onClick={handleResetFilters}
                className="mt-2 px-3 py-1.5 bg-[#11152A] text-[#A78BFA] border border-[#1E2442] rounded-lg text-xs hover:bg-[#151932] transition-colors cursor-pointer"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[720px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-[#0B0D20]/95 backdrop-blur-md shadow-sm">
                <tr className="border-b border-[#1E2442] text-[#94A3B8] uppercase tracking-wider font-mono text-xs">
                  <th className="py-3.5 px-4">Пользователь</th>
                  <th className="py-3.5 px-3.5">Отображаемое имя</th>
                  <th className="py-3.5 px-3.5">Роль</th>
                  <th className="py-3.5 px-3.5">Статус</th>
                  <th className="py-3.5 px-3.5">Дата регистр.</th>
                  <th className="py-3.5 px-3.5">Приглашён кем</th>
                  <th className="py-3.5 px-3.5 text-center">Пригласил (чел.)</th>
                  <th className="py-3.5 px-3.5 text-center">Инвайты</th>
                  <th className="py-3.5 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2442]">
                {users.map((u) => {
                  const isTempBanned = u.bannedUntil && new Date(u.bannedUntil) > new Date();
                  const displayName = u.telegramUsername
                    ? `@${u.telegramUsername}`
                    : u.email
                    ? u.email
                    : '—';

                  return (
                    <tr key={u.id} className="hover:bg-[#11152A] transition-colors">
                      {/* 1. Avatar & Username */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {u.avatar ? (
                            <img
                              src={u.avatar}
                              alt={u.username}
                              className="w-9 h-9 rounded-xl object-cover border border-[#1E2442] shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 flex items-center justify-center font-bold text-[#A78BFA] shrink-0 text-sm">
                              {u.username ? u.username.charAt(0).toUpperCase() : 'U'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-[#F8FAFC] flex items-center gap-1.5 truncate">
                              <span className="hover:underline cursor-pointer" onClick={() => openUserDetails(u.id)}>
                                {u.username}
                              </span>
                              <span className="text-xs text-[#64748B] font-mono">#{u.id}</span>
                            </div>
                            <div className="text-xs text-[#64748B] font-mono truncate">
                              {u.uid ? u.uid.substring(0, 16) : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Display Name / Telegram / Email */}
                      <td className="py-3.5 px-3.5">
                        <div className="text-xs sm:text-sm text-[#94A3B8] truncate max-w-[150px]" title={displayName}>
                          {displayName}
                        </div>
                      </td>

                      {/* 3. Role */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        {renderRoleBadges(u)}
                      </td>

                      {/* 4. Status */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        {u.isBlocked ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                            Заблокирован
                          </span>
                        ) : isTempBanned ? (
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 w-max"
                            title={`Бан до ${new Date(u.bannedUntil).toLocaleString('ru-RU')}`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            Бан до {new Date(u.bannedUntil).toLocaleDateString('ru-RU')}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Активен
                          </span>
                        )}
                      </td>

                      {/* 5. Registration Date */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap text-[#94A3B8] text-xs sm:text-sm">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('ru-RU') : '—'}
                      </td>

                      {/* 6. Invited By */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        {u.invitedByUsername ? (
                          <button
                            onClick={() => {
                              if (u.invitedByUserId) openUserDetails(u.invitedByUserId);
                            }}
                            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/50 hover:bg-[#151932] text-left transition-colors group max-w-[170px] cursor-pointer"
                            title={`Пригласил @${u.invitedByUsername} (код: ${u.usedInviteCode || '—'})`}
                          >
                            {u.invitedByAvatar ? (
                              <img
                                src={u.invitedByAvatar}
                                alt={u.invitedByUsername}
                                className="w-5 h-5 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-[#8B5CF6]/30 text-xs font-bold text-[#A78BFA] flex items-center justify-center shrink-0">
                                {u.invitedByUsername.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-semibold text-[#A78BFA] group-hover:underline truncate">
                                @{u.invitedByUsername}
                              </span>
                              {u.usedInviteCode && (
                                <span className="text-[10px] text-[#64748B] font-mono leading-none truncate">
                                  {u.usedInviteCode}
                                </span>
                              )}
                            </div>
                          </button>
                        ) : u.usedInviteCode ? (
                          <div className="inline-flex flex-col">
                            <span className="text-xs font-medium text-amber-300/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                              Системный
                            </span>
                            <span className="text-[10px] text-[#64748B] font-mono mt-0.5">
                              {u.usedInviteCode}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#64748B] italic">
                            Прямая регистр.
                          </span>
                        )}
                      </td>

                      {/* 7. Invited Users Count */}
                      <td className="py-3.5 px-3.5 text-center">
                        <button
                          onClick={() => openUserDetails(u.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs sm:text-sm font-mono font-bold transition-colors cursor-pointer ${
                            (u.invitedUsersCount || 0) > 0
                              ? 'bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/30 hover:bg-[#8B5CF6]/25'
                              : 'text-[#64748B] hover:text-[#94A3B8]'
                          }`}
                          title={`Пользователь пригласил ${u.invitedUsersCount || 0} чел.`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          {u.invitedUsersCount || 0}
                        </button>
                      </td>

                      {/* 8. Invites Left */}
                      <td className="py-3.5 px-3.5 text-center">
                        <button
                          onClick={() => {
                            setInvitesModalUser(u);
                            setNewInvitesCount(u.invitesLeft ?? 3);
                          }}
                          className="hover:underline font-mono text-[#A78BFA] text-xs sm:text-sm font-bold px-2 py-1 rounded hover:bg-[#8B5CF6]/15 transition-colors cursor-pointer"
                          title="Изменить баланс инвайтов"
                        >
                          {u.invitesLeft ?? 0}
                        </button>
                      </td>

                      {/* 9. Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View details */}
                          <button
                            onClick={() => openUserDetails(u.id)}
                            title="Карточка пользователя"
                            className="p-2 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Role change - Admins only */}
                          {(isAdmin || isSuperAdmin) && (
                            <button
                              onClick={() => {
                                setRoleModalUser(u);
                                setSelectedRoles(getUserRoles(u));
                              }}
                              title="Управление ролями"
                              className="p-2 rounded-xl bg-[#11152A] hover:bg-[#8B5CF6]/20 text-[#94A3B8] hover:text-[#A78BFA] transition-colors cursor-pointer"
                            >
                              <Shield className="w-4 h-4" />
                            </button>
                          )}

                          {/* Issue warning */}
                          <button
                            onClick={() => {
                              setWarnModalUser(u);
                              setWarnReason('');
                            }}
                            title="Вынести предупреждение"
                            className="p-2 rounded-xl bg-[#11152A] hover:bg-amber-900/30 text-[#94A3B8] hover:text-amber-300 transition-colors cursor-pointer"
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </button>

                          {/* Temporary ban */}
                          <button
                            onClick={() => {
                              setTempBanUser(u);
                              setBanReason('');
                            }}
                            title="Временный бан"
                            className="p-2 rounded-xl bg-[#11152A] hover:bg-orange-900/30 text-[#94A3B8] hover:text-orange-300 transition-colors cursor-pointer"
                          >
                            <Clock className="w-4 h-4" />
                          </button>

                          {/* Permanent block / unblock (DANGER ACTION) */}
                          <button
                            onClick={() => setUserToBlock(u)}
                            title={u.isBlocked ? 'Разблокировать' : 'Заблокировать навсегда'}
                            className={`p-2 rounded-xl transition-colors cursor-pointer ${
                              u.isBlocked
                                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                                : 'bg-rose-500/15 border border-rose-500/35 text-rose-300 hover:bg-rose-500/25'
                            }`}
                          >
                            {u.isBlocked ? <UserCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                          </button>

                          {/* Reset Password */}
                          <button
                            onClick={() => handleGeneratePasswordReset(u)}
                            disabled={generatingReset === u.id}
                            title="Сбросить пароль"
                            className="p-2 rounded-xl bg-[#11152A] hover:bg-sky-900/30 text-[#94A3B8] hover:text-sky-300 transition-colors cursor-pointer"
                          >
                            {generatingReset === u.id ? (
                              <RotateCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <KeyRound className="w-4 h-4" />
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
        <div className="p-4 border-t border-[#1E2442] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#94A3B8]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="px-2.5 py-1.5 rounded-xl bg-[#11152A] border border-[#1E2442] hover:bg-[#151932] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
              title="Первая страница"
            >
              « 1
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-xl bg-[#11152A] border border-[#1E2442] hover:bg-[#151932] disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Назад
            </button>
          </div>

          <div className="flex items-center gap-1">
            <span className="px-2">
              Страница <strong className="text-[#F8FAFC]">{page}</strong> из <strong className="text-[#F8FAFC]">{totalPages}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-xl bg-[#11152A] border border-[#1E2442] hover:bg-[#151932] disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1 cursor-pointer"
            >
              Вперёд
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="px-2.5 py-1.5 rounded-xl bg-[#11152A] border border-[#1E2442] hover:bg-[#151932] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
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
          <div className="w-full max-w-3xl bg-[#0B0D20] border border-[#1E2442] rounded-2xl p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#1E2442]">
              <div className="flex items-center gap-3">
                {selectedUserDetail.user.avatar ? (
                  <img
                    src={selectedUserDetail.user.avatar}
                    alt={selectedUserDetail.user.username}
                    className="w-12 h-12 rounded-xl object-cover border border-[#1E2442]"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-lg font-bold text-[#A78BFA]">
                    {selectedUserDetail.user.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold text-[#F8FAFC] flex items-center gap-2">
                    {selectedUserDetail.user.username}
                    {getRoleBadge(selectedUserDetail.user.role)}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                    <span>{selectedUserDetail.user.email || 'Email отсутствует'}</span>
                    {selectedUserDetail.user.telegramUsername && (
                      <span className="text-[#A78BFA]">@{selectedUserDetail.user.telegramUsername}</span>
                    )}
                    <span className="text-[10px] text-[#64748B] font-mono">ID: #{selectedUserDetail.user.id}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserDetail(null)}
                className="p-1.5 rounded-lg hover:bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Basic Info & Status strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#11152A] border border-[#1E2442]">
                <span className="text-[#94A3B8] block text-[10px] uppercase font-mono">Статус аккаунта</span>
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

              <div className="p-3 rounded-xl bg-[#11152A] border border-[#1E2442]">
                <span className="text-[#94A3B8] block text-[10px] uppercase font-mono">Дата регистрации</span>
                <span className="text-xs font-semibold text-[#F8FAFC] mt-1 block">
                  {selectedUserDetail.user.createdAt
                    ? new Date(selectedUserDetail.user.createdAt).toLocaleDateString('ru-RU')
                    : '—'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#11152A] border border-[#1E2442]">
                <span className="text-[#94A3B8] block text-[10px] uppercase font-mono">Баланс инвайтов</span>
                <span className="text-base font-bold text-[#A78BFA] mt-0.5 block font-mono">
                  {selectedUserDetail.user.invitesLeft ?? 0}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#11152A] border border-[#1E2442]">
                <span className="text-[#94A3B8] block text-[10px] uppercase font-mono">Пригласил (всего)</span>
                <span className="text-base font-bold text-[#F8FAFC] mt-0.5 block font-mono">
                  {selectedUserDetail.invitedUsers?.length ?? 0} чел.
                </span>
              </div>
            </div>

            {/* Counts grid (activity in tracker) */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-center">
                <span className="text-[#94A3B8] block text-[10px]">Отзывов</span>
                <span className="text-sm font-bold text-[#F8FAFC]">
                  {selectedUserDetail.stats?.reviewsCount ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-center">
                <span className="text-[#94A3B8] block text-[10px]">Списков</span>
                <span className="text-sm font-bold text-[#F8FAFC]">
                  {selectedUserDetail.stats?.listsCount ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-center">
                <span className="text-[#94A3B8] block text-[10px]">Тир-листов</span>
                <span className="text-sm font-bold text-[#F8FAFC]">
                  {selectedUserDetail.stats?.tierListsCount ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-center">
                <span className="text-[#94A3B8] block text-[10px]">Комментариев</span>
                <span className="text-sm font-bold text-[#F8FAFC]">
                  {selectedUserDetail.stats?.commentsCount ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-center">
                <span className="text-[#94A3B8] block text-[10px]">Друзей</span>
                <span className="text-sm font-bold text-[#F8FAFC]">
                  {selectedUserDetail.stats?.friendsCount ?? 0}
                </span>
              </div>
            </div>

            {/* ========================================================= */}
            {/* БЛОК 1: Приглашения (Кто пригласил этого пользователя) */}
            {/* ========================================================= */}
            <div className="p-4 rounded-xl bg-[#11152A] border border-[#1E2442] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#F8FAFC] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Ticket className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  Приглашения • Кто пригласил пользователя
                </h4>
                {selectedUserDetail.invitedBy?.inviteCode && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/30">
                    Код: {selectedUserDetail.invitedBy.inviteCode}
                  </span>
                )}
              </div>

              {selectedUserDetail.invitedBy ? (
                <div className="space-y-2.5">
                  {selectedUserDetail.invitedBy.inviter ? (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#0B0D20] border border-[#1E2442]">
                      <div className="flex items-center gap-2.5">
                        {selectedUserDetail.invitedBy.inviter.avatar ? (
                          <img
                            src={selectedUserDetail.invitedBy.inviter.avatar}
                            alt={selectedUserDetail.invitedBy.inviter.username}
                            className="w-9 h-9 rounded-xl object-cover border border-[#1E2442]"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 flex items-center justify-center font-bold text-[#A78BFA] text-xs">
                            {selectedUserDetail.invitedBy.inviter.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#F8FAFC]">
                              @{selectedUserDetail.invitedBy.inviter.username}
                            </span>
                            {getRoleBadge(selectedUserDetail.invitedBy.inviter.role)}
                          </div>
                          <span className="text-[11px] text-[#94A3B8]">
                            {selectedUserDetail.invitedBy.inviter.email || 'Email не указан'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => openUserDetails(selectedUserDetail.invitedBy.inviter.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#11152A] hover:bg-[#151932] text-xs font-medium text-[#A78BFA] border border-[#1E2442] flex items-center gap-1 transition-colors cursor-pointer"
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
                        <div className="text-[11px] text-[#94A3B8]">Создан администратором напрямую без привязки к пользователю</div>
                      </div>
                    </div>
                  ) : null}

                  {/* Invite Code, Dates */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                    <div className="p-2.5 rounded-lg bg-[#0B0D20] border border-[#1E2442]">
                      <span className="text-[10px] text-[#64748B] uppercase block font-mono">Инвайт-код</span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="font-mono font-bold text-[#A78BFA] text-xs">
                          {selectedUserDetail.invitedBy.inviteCode}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedUserDetail.invitedBy.inviteCode);
                            setCopiedCode(selectedUserDetail.invitedBy.inviteCode);
                            setTimeout(() => setCopiedCode(null), 2000);
                          }}
                          className="text-[#94A3B8] hover:text-[#F8FAFC] p-0.5 cursor-pointer"
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

                    <div className="p-2.5 rounded-lg bg-[#0B0D20] border border-[#1E2442]">
                      <span className="text-[10px] text-[#64748B] uppercase block font-mono">Дата создания инвайта</span>
                      <span className="font-medium text-[#F8FAFC] text-xs mt-0.5 block">
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

                    <div className="p-2.5 rounded-lg bg-[#0B0D20] border border-[#1E2442]">
                      <span className="text-[10px] text-[#64748B] uppercase block font-mono">Дата регистрации</span>
                      <span className="font-medium text-[#F8FAFC] text-xs mt-0.5 block">
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
                <div className="p-3 rounded-lg bg-[#0B0D20] border border-[#1E2442] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#94A3B8]" />
                    <div>
                      <span className="font-medium text-[#F8FAFC] block">Прямая регистрация</span>
                      <span className="text-[11px] text-[#94A3B8]">Пользователь зарегистрировался без инвайт-кода (открытая регистрация)</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-[#64748B] font-mono shrink-0">
                    {selectedUserDetail.user.createdAt ? new Date(selectedUserDetail.user.createdAt).toLocaleDateString('ru-RU') : '—'}
                  </span>
                </div>
              )}
            </div>

            {/* ========================================================= */}
            {/* БЛОК 2: Кого пригласил пользователь */}
            {/* ========================================================= */}
            <div className="p-4 rounded-xl bg-[#11152A] border border-[#1E2442] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#F8FAFC] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Users className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  Кого пригласил пользователь ({selectedUserDetail.invitedUsers?.length || 0})
                </h4>
                <span className="text-[11px] text-[#94A3B8]">
                  Осталось инвайтов: <strong className="text-[#A78BFA] font-mono">{selectedUserDetail.user.invitesLeft ?? 0}</strong>
                </span>
              </div>

              {!selectedUserDetail.invitedUsers || selectedUserDetail.invitedUsers.length === 0 ? (
                <div className="p-4 rounded-lg bg-[#0B0D20] border border-[#1E2442] text-center text-xs text-[#64748B]">
                  Пользователь пока никого не пригласил
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {selectedUserDetail.invitedUsers.map((invUser: any) => {
                    const isInvBanned = invUser.bannedUntil && new Date(invUser.bannedUntil) > new Date();
                    return (
                      <div
                        key={invUser.id}
                        className="p-2.5 rounded-xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {invUser.avatar ? (
                            <img
                              src={invUser.avatar}
                              alt={invUser.username}
                              className="w-8 h-8 rounded-xl object-cover border border-[#1E2442] shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 flex items-center justify-center font-bold text-[#A78BFA] shrink-0 text-xs">
                              {invUser.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-[#F8FAFC]">@{invUser.username}</span>
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
                            <div className="text-[11px] text-[#94A3B8] truncate">
                              {invUser.email || 'Email отсутствует'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                          <div className="text-right">
                            <div className="text-[10px] font-mono text-[#A78BFA] bg-[#8B5CF6]/10 px-1.5 py-0.5 rounded border border-[#8B5CF6]/20 inline-block">
                              {invUser.inviteCode}
                            </div>
                            <div className="text-[10px] text-[#64748B] mt-0.5 font-mono">
                              {new Date(invUser.createdAt).toLocaleDateString('ru-RU')}
                            </div>
                          </div>
                          <button
                            onClick={() => openUserDetails(invUser.id)}
                            title="Открыть профиль"
                            className="p-1.5 rounded-lg bg-[#11152A] hover:bg-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
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
              <div className="p-4 rounded-xl bg-[#11152A] border border-[#1E2442] space-y-2.5">
                <h4 className="text-xs font-bold text-[#F8FAFC] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  Активные (неиспользованные) инвайты ({selectedUserDetail.activeInviteCodes.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedUserDetail.activeInviteCodes.map((codeItem: any) => (
                    <div
                      key={codeItem.id}
                      className="p-2.5 rounded-lg bg-[#0B0D20] border border-[#1E2442] flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#A78BFA]">{codeItem.code}</span>
                        <span className="text-[10px] text-[#64748B] font-mono">
                          {new Date(codeItem.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(codeItem.code);
                          setCopiedCode(codeItem.code);
                          setTimeout(() => setCopiedCode(null), 2000);
                        }}
                        className="p-1 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
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
                  <h4 className="text-xs font-bold text-[#F8FAFC] mb-2 uppercase tracking-wider font-mono">
                    Жалобы ({selectedUserDetail.reports?.length || 0})
                  </h4>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {selectedUserDetail.reports?.map((r: any) => (
                      <div key={r.id} className="p-2 rounded-lg bg-[#11152A] border border-[#1E2442] text-xs flex justify-between">
                        <div>
                          <span className="font-bold text-red-400">{r.reason}: </span>
                          <span className="text-[#94A3B8] text-[11px]">{r.description || 'Без пояснения'}</span>
                        </div>
                        <span className="text-[10px] text-[#64748B] shrink-0 ml-1 font-mono">
                          {new Date(r.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Audit Logs */}
                <div>
                  <h4 className="text-xs font-bold text-[#F8FAFC] mb-2 uppercase tracking-wider font-mono">
                    История аудита ({selectedUserDetail.auditLogs?.length || 0})
                  </h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">
                    {selectedUserDetail.auditLogs?.map((log: any) => {
                      const item = formatAuditLog(log);
                      return (
                        <div key={log.id} className="p-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-[11px] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#F8FAFC] font-mono">{item.title}</span>
                            <span className="text-[#64748B] text-[10px] font-mono">{item.relativeDate}</span>
                          </div>
                          <p className="text-[#94A3B8] text-[11px]">{item.summary}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedUserDetail(null)}
                className="h-11 px-6 rounded-xl bg-[#11152A] text-sm font-bold text-[#F8FAFC] hover:bg-[#1E2442] border border-[#1E2442] transition-colors cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. Change Role Modal (Independent Multi-roles) */}
      {/* ============================================================ */}
      {roleModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-[#F8FAFC] flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-400" />
                <span>Управление ролями: @{roleModalUser.username}</span>
              </h3>
              <p className="text-xs text-[#94A3B8]">
                Роли независимы. Выдача одной роли (например, модератора) не снимает другие роли (например, музыканта).
              </p>
            </div>

            {/* List of independent roles */}
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {[
                {
                  id: 'user' as SystemRole,
                  title: 'Пользователь (USER)',
                  description: 'Базовый доступ к профилю, библиотеке, оценкам и социальным функциям.',
                  icon: Users,
                  locked: true,
                },
                {
                  id: 'musician' as SystemRole,
                  title: 'Музыкант (MUSICIAN)',
                  description: 'Доступ к Creative Studio, загрузка аудиотреков, создание релизов и управление карточкой артиста.',
                  icon: Music,
                  locked: false,
                },
                {
                  id: 'news_editor' as SystemRole,
                  title: 'Редактор новостей (NEWS_EDITOR)',
                  description: 'Создание, редактирование и публикация новостей и объявлений. Без доступа к панели администрирования.',
                  icon: FileText,
                  locked: false,
                },
                {
                  id: 'content_manager' as SystemRole,
                  title: 'Контент-менеджер (CONTENT_MANAGER)',
                  description: 'Управление медиатекой, метаданными фильмов, аниме, сериалов и игр.',
                  icon: Film,
                  locked: false,
                },
                {
                  id: 'moderator' as SystemRole,
                  title: 'Модератор (MODERATOR)',
                  description: 'Модерация отзывов, комментариев, обработка жалоб и предупреждения пользователей.',
                  icon: ShieldCheck,
                  locked: false,
                },
                {
                  id: 'admin' as SystemRole,
                  title: 'Администратор (ADMIN)',
                  description: 'Полный доступ к панели администрирования, пользователям, модерации и настройкам.',
                  icon: ShieldAlert,
                  locked: !isSuperAdmin,
                  superAdminOnly: true,
                },
                {
                  id: 'super_admin' as SystemRole,
                  title: 'Главный администратор (SUPER_ADMIN)',
                  description: 'Наивысший приоритет доступа ко всей платформе.',
                  icon: Award,
                  locked: !isSuperAdmin,
                  superAdminOnly: true,
                },
              ].map((item) => {
                const isChecked = selectedRoles.includes(item.id);
                const IconComponent = item.icon;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.locked) return;
                      setSelectedRoles((prev) => {
                        if (prev.includes(item.id)) {
                          return prev.filter((r) => r !== item.id);
                        } else {
                          return [...prev, item.id];
                        }
                      });
                    }}
                    className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                      item.locked
                        ? 'bg-[#0E1226]/50 border-[#1E2442]/50 opacity-80 cursor-default'
                        : isChecked
                        ? 'bg-purple-950/20 border-purple-500/50 cursor-pointer hover:border-purple-400'
                        : 'bg-[#11152A] border-[#1E2442] cursor-pointer hover:border-[#2E365C]'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isChecked ? 'bg-purple-500/20 text-purple-300' : 'bg-[#1A203C] text-[#64748B]'
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold font-mono ${isChecked ? 'text-white' : 'text-[#CBD5E1]'}`}>
                            {item.title}
                          </span>
                          {item.superAdminOnly && !isSuperAdmin && (
                            <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              Только Super Admin
                            </span>
                          )}
                          {item.id === 'user' && (
                            <span className="text-[10px] text-[#64748B] bg-[#1A203C] px-1.5 py-0.5 rounded">
                              Всегда активен
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#94A3B8] mt-0.5 leading-relaxed">{item.description}</p>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={item.locked}
                      readOnly
                      className="mt-1 w-4 h-4 rounded text-purple-600 focus:ring-0 focus:ring-offset-0 bg-[#0B0D20] border-[#1E2442] shrink-0"
                    />
                  </div>
                );
              })}
            </div>

            {/* Selected Roles Preview */}
            <div className="p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-1.5">
              <span className="text-[11px] font-mono text-[#64748B] uppercase font-bold tracking-wider">
                Итоговый набор ролей:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedRoles.map((r) => (
                  <span
                    key={r}
                    className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300"
                  >
                    {ROLE_LABELS[r] || r}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setRoleModalUser(null)}
                className="h-11 px-5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-sm font-semibold text-[#F8FAFC] border border-[#1E2442] transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={handleRoleChange}
                disabled={savingRole}
                className="h-11 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-sm font-bold text-white flex items-center gap-2 transition-colors cursor-pointer shadow-md disabled:opacity-50"
              >
                {savingRole && <RotateCw className="w-4 h-4 animate-spin" />}
                <span>Сохранить роли</span>
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
          <div className="w-full max-w-md bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-[#F8FAFC]">
                Предупреждение для @{warnModalUser.username}
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              У пользователя сейчас <strong>{warnModalUser.warningCount || 0}</strong> предупреждений. После вынесения счётчик увеличится на 1, а пользователю придёт системное уведомление.
            </p>

            <textarea
              value={warnReason}
              onChange={(e) => setWarnReason(e.target.value)}
              placeholder="Причина вынесения предупреждения (нарушение правил, спам, токсичность)..."
              rows={3}
              className="w-full p-3.5 bg-[#11152A] border border-[#1E2442] focus:border-amber-500 rounded-xl text-sm text-[#F8FAFC] placeholder-[#64748B] outline-none"
            />

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setWarnModalUser(null)}
                className="h-11 px-5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-sm font-semibold text-[#F8FAFC] border border-[#1E2442] transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={handleIssueWarning}
                disabled={savingWarn || !warnReason.trim()}
                className="h-11 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-black text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-md"
              >
                {savingWarn && <RotateCw className="w-4 h-4 animate-spin" />}
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
          <div className="w-full max-w-md bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-orange-400">
              <Clock className="w-6 h-6" />
              <h3 className="text-base font-bold text-[#F8FAFC]">
                Временный бан @{tempBanUser.username}
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              В течение срока бана пользователь не сможет авторизоваться и выполнять действия на сайте.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">Срок ограничения:</label>
                <select
                  value={banDurationHours}
                  onChange={(e) => setBanDurationHours(e.target.value)}
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
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
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">Причина бана:</label>
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Нарушение правил сообщества..."
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setTempBanUser(null)}
                className="h-11 px-5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-sm font-semibold text-[#F8FAFC] border border-[#1E2442] transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={handleApplyBan}
                disabled={savingBan}
                className="h-11 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-black text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-md"
              >
                {savingBan && <RotateCw className="w-4 h-4 animate-spin" />}
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
          <div className="w-full max-w-md bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-sky-400">
              <KeyRound className="w-6 h-6" />
              <h3 className="text-base font-bold text-[#F8FAFC]">
                Ссылка сброса пароля: @{resetModalData.username}
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              Передайте эту одноразовую ссылку пользователю. Ссылка действительна 24 часа.
            </p>

            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442]">
              <input
                type="text"
                readOnly
                value={resetModalData.resetUrl}
                className="w-full bg-transparent text-xs sm:text-sm text-sky-300 outline-none select-all font-mono px-2"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(resetModalData.resetUrl);
                  setResetModalData({ ...resetModalData, copied: true });
                }}
                className="p-2 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-white shrink-0 cursor-pointer"
              >
                {resetModalData.copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setResetModalData(null)}
                className="h-11 px-6 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-sm font-bold text-[#F8FAFC] border border-[#1E2442] transition-colors cursor-pointer"
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
          <div className="w-full max-w-sm bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-[#F8FAFC]">
              Количество инвайтов: @{invitesModalUser.username}
            </h3>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              Укажите доступный пользователю баланс приглашений.
            </p>

            <input
              type="number"
              min="0"
              max="999"
              value={newInvitesCount}
              onChange={(e) => setNewInvitesCount(parseInt(e.target.value, 10) || 0)}
              className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-base font-mono font-bold text-[#F8FAFC] outline-none"
            />

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setInvitesModalUser(null)}
                className="h-11 px-5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-sm font-semibold text-[#F8FAFC] border border-[#1E2442] transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveInvites}
                disabled={savingInvites}
                className="h-11 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-sm font-bold text-white transition-colors cursor-pointer shadow-md"
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
