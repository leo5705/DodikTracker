import React, { useState, useEffect } from 'react';
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

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        q: search.trim(),
        role: roleFilter,
        status: statusFilter,
      });
      const res = await authFetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error('Ошибка загрузки пользователей');
      const data = await res.json();
      setUsers(data.items || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить список пользователей');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const openUserDetails = async (userId: number) => {
    setDetailLoading(true);
    try {
      const res = await authFetch(`/api/admin/users/${userId}`);
      if (!res.ok) throw new Error('Ошибка получения деталей пользователя');
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
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">Гл. Администратор</span>;
      case 'ADMIN':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">Администратор</span>;
      case 'MODERATOR':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Модератор</span>;
      case 'CONTENT_MANAGER':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Контент-менеджер</span>;
      case 'NEWS_EDITOR':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">Редактор новостей</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800 text-zinc-400">Пользователь</span>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#14131A] border border-[#252233]">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#9A94AA] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени пользователя или email..."
              className="w-full pl-9 pr-4 py-2 bg-[#0F0E12] border border-[#252233] focus:border-[#9B6BFF] rounded-xl text-xs text-[#F3F1F8] placeholder-[#656075] outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-colors"
          >
            Найти
          </button>
        </form>

        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
          >
            <option value="ALL">Все роли</option>
            <option value="USER">Пользователи</option>
            <option value="MODERATOR">Модераторы</option>
            <option value="CONTENT_MANAGER">Контент-менеджеры</option>
            <option value="NEWS_EDITOR">Редакторы новостей</option>
            <option value="ADMIN">Администраторы</option>
            <option value="SUPER_ADMIN">Суперадмины</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
          >
            <option value="ALL">Любой статус</option>
            <option value="ACTIVE">Активные</option>
            <option value="TEMP_BANNED">Временный бан</option>
            <option value="BLOCKED">Заблокированные</option>
          </select>
        </div>
      </div>

      {/* Users Count Summary */}
      <div className="text-xs text-[#9A94AA] flex items-center justify-between px-1">
        <span>Всего найдено: <strong className="text-[#F3F1F8]">{totalCount}</strong> пользователей</span>
        <span>Страница {page} из {totalPages}</span>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl bg-[#14131A] border border-[#252233] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <RotateCw className="w-6 h-6 text-[#9B6BFF] animate-spin" />
            <span className="text-xs text-[#9A94AA]">Загрузка пользователей...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-xs">{error}</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-xs">Пользователи не найдены</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#252233] bg-[#0F0E12]/80 text-[#656075] uppercase tracking-wider font-mono text-[10px]">
                  <th className="py-3 px-4">Пользователь</th>
                  <th className="py-3 px-3">Роль</th>
                  <th className="py-3 px-3">Статус</th>
                  <th className="py-3 px-3 text-center">Предупр.</th>
                  <th className="py-3 px-3 text-center">В трекере</th>
                  <th className="py-3 px-3 text-center">Инвайты</th>
                  <th className="py-3 px-3">Дата регистр.</th>
                  <th className="py-3 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252233]/60">
                {users.map((u) => {
                  const isTempBanned = u.bannedUntil && new Date(u.bannedUntil) > new Date();

                  return (
                    <tr key={u.id} className="hover:bg-[#191724] transition-colors">
                      {/* User Info */}
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
                              {u.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-[#F3F1F8] flex items-center gap-1.5 truncate">
                              <span>{u.username}</span>
                              <span className="text-[10px] text-[#656075] font-mono">#{u.id}</span>
                            </div>
                            <div className="text-[11px] text-[#9A94AA] truncate">{u.email || 'Без email'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {getRoleBadge(u.role)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {u.isBlocked ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                            Заблокирован
                          </span>
                        ) : isTempBanned ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-max">
                            <Clock className="w-3 h-3" />
                            Бан до {new Date(u.bannedUntil).toLocaleDateString('ru-RU')}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400">
                            Активен
                          </span>
                        )}
                      </td>

                      {/* Warnings */}
                      <td className="py-3 px-3 text-center">
                        {u.warningCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold font-mono">
                            {u.warningCount}
                          </span>
                        ) : (
                          <span className="text-[#656075]">0</span>
                        )}
                      </td>

                      {/* Tracked Count */}
                      <td className="py-3 px-3 text-center font-mono text-[#F3F1F8]">
                        {u.trackedCount || 0}
                      </td>

                      {/* Invites */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => {
                            setInvitesModalUser(u);
                            setNewInvitesCount(u.invitesCount ?? 3);
                          }}
                          className="hover:underline font-mono text-purple-300"
                        >
                          {u.invitesCount ?? 0}
                        </button>
                      </td>

                      {/* Registered Date */}
                      <td className="py-3 px-3 whitespace-nowrap text-[#9A94AA] text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString('ru-RU')}
                      </td>

                      {/* Actions */}
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
        <div className="p-4 border-t border-[#252233] flex items-center justify-between text-xs text-[#9A94AA]">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-xl bg-[#0F0E12] border border-[#252233] hover:bg-[#191724] disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Назад
          </button>
          <span>
            Страница {page} из {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-xl bg-[#0F0E12] border border-[#252233] hover:bg-[#191724] disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1"
          >
            Вперёд
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 1. User Full Detail Modal */}
      {/* ============================================================ */}
      {selectedUserDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-5 my-8">
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
                  <p className="text-xs text-[#9A94AA]">{selectedUserDetail.user.email || 'Email отсутствует'}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserDetail(null)}
                className="p-1 rounded-lg hover:bg-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Counts grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233]">
                <span className="text-[#9A94AA] block">Отзывов:</span>
                <span className="text-base font-bold text-[#F3F1F8]">{selectedUserDetail.counts.reviews}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233]">
                <span className="text-[#9A94AA] block">Списков:</span>
                <span className="text-base font-bold text-[#F3F1F8]">{selectedUserDetail.counts.lists}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233]">
                <span className="text-[#9A94AA] block">Друзей:</span>
                <span className="text-base font-bold text-[#F3F1F8]">{selectedUserDetail.counts.friends}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233]">
                <span className="text-[#9A94AA] block">Предупреждений:</span>
                <span className="text-base font-bold text-amber-400">{selectedUserDetail.user.warningCount || 0}</span>
              </div>
            </div>

            {/* Reports filed against this user */}
            <div>
              <h4 className="text-xs font-bold text-[#F3F1F8] mb-2 uppercase tracking-wider">
                Жалобы на этого пользователя ({selectedUserDetail.reportsAgainstUser.length})
              </h4>
              {selectedUserDetail.reportsAgainstUser.length === 0 ? (
                <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233] text-xs text-[#656075]">
                  Жалоб на пользователя не поступало
                </div>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedUserDetail.reportsAgainstUser.map((r: any) => (
                    <div key={r.id} className="p-2.5 rounded-xl bg-[#0F0E12] border border-[#252233] text-xs flex justify-between">
                      <div>
                        <span className="font-bold text-red-400">{r.reason}: </span>
                        <span className="text-[#9A94AA]">{r.description || 'Без пояснения'}</span>
                      </div>
                      <span className="text-[10px] text-[#656075]">{new Date(r.createdAt).toLocaleDateString('ru-RU')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit log for this user */}
            <div>
              <h4 className="text-xs font-bold text-[#F3F1F8] mb-2 uppercase tracking-wider">История аудита</h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {selectedUserDetail.userAuditLogs.map((log: any) => (
                  <div key={log.id} className="p-2 rounded-lg bg-[#0F0E12] text-[11px] flex justify-between">
                    <span className="text-[#9A94AA] truncate">{log.details}</span>
                    <span className="text-[#656075] ml-2 shrink-0">{new Date(log.createdAt).toLocaleDateString('ru-RU')}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedUserDetail(null)}
                className="px-4 py-2 rounded-xl bg-[#252233] text-xs font-semibold text-[#F3F1F8] hover:bg-[#322E45]"
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
              У пользователя сейчас <strong>{warnModalUser.warningCount || 0}</strong> предупреждений. После вынесения счётчик увеличится на 1, а пользователю придёт уведомление.
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
