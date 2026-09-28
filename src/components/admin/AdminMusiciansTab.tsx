import React, { useState, useEffect, useCallback } from 'react';
import {
  Music,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  User,
  Shield,
  FileText,
  AlertCircle,
  Check,
  X,
  Loader2,
  UserPlus,
  UserMinus,
  ExternalLink,
  Award,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface MusicianApplication {
  id: number;
  userId: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  message: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  username: string;
  userAvatar: string | null;
  userEmail: string;
  userRole: string;
}

interface PlatformMusician {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  role: string;
  roles: string[];
  createdAt: string;
  artistProfile: {
    id: number;
    stageName: string;
    slug: string;
    avatar: string | null;
    status: string;
  } | null;
}

export const AdminMusiciansTab: React.FC = () => {
  const { authFetch, isAdmin, isSuperAdmin } = useAuth();
  const [tabMode, setTabMode] = useState<'APPLICATIONS' | 'MUSICIANS'>('APPLICATIONS');

  // Applications state
  const [applications, setApplications] = useState<MusicianApplication[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [appsSearch, setAppsSearch] = useState('');
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Platform musicians state
  const [musicians, setMusicians] = useState<PlatformMusician[]>([]);
  const [musiciansLoading, setMusiciansLoading] = useState(false);
  const [musiciansSearch, setMusiciansSearch] = useState('');

  // Reject Modal state
  const [rejectingApp, setRejectingApp] = useState<MusicianApplication | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Manual Grant Modal state
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [grantUserQuery, setGrantUserQuery] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [grantingUserId, setGrantingUserId] = useState<number | null>(null);

  // Revoke confirmation modal state
  const [revokingMusician, setRevokingMusician] = useState<PlatformMusician | null>(null);
  const [revokingLoading, setRevokingLoading] = useState(false);

  const fetchApplications = useCallback(async () => {
    setAppsLoading(true);
    try {
      const res = await authFetch(`/api/music/applications/admin?status=${activeStatus}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
      }
    } catch (err) {
      console.error('Error fetching musician applications:', err);
    } finally {
      setAppsLoading(false);
    }
  }, [authFetch, activeStatus]);

  const fetchMusicians = useCallback(async () => {
    setMusiciansLoading(true);
    try {
      const res = await authFetch('/api/music/admin/musicians');
      if (res.ok) {
        const data = await res.json();
        setMusicians(data.musicians || []);
      }
    } catch (err) {
      console.error('Error fetching platform musicians:', err);
    } finally {
      setMusiciansLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (tabMode === 'APPLICATIONS') {
      fetchApplications();
    } else {
      fetchMusicians();
    }
  }, [tabMode, fetchApplications, fetchMusicians]);

  const handleApprove = async (appId: number) => {
    if (!confirm('Выдать пользователю роль музыканта?')) {
      return;
    }
    setProcessingId(appId);
    try {
      const res = await authFetch(`/api/music/applications/admin/${appId}/approve`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchApplications();
      } else {
        const err = await res.json();
        alert(err.error || 'Ошибка при одобрении заявки');
      }
    } catch (_err) {
      alert('Ошибка при выполнении запроса');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectingApp) return;
    setProcessingId(rejectingApp.id);
    try {
      const res = await authFetch(`/api/music/applications/admin/${rejectingApp.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason }),
      });
      if (res.ok) {
        setRejectingApp(null);
        setRejectionReason('');
        fetchApplications();
      } else {
        const err = await res.json();
        alert(err.error || 'Ошибка при отклонении заявки');
      }
    } catch (_err) {
      alert('Ошибка при выполнении запроса');
    } finally {
      setProcessingId(null);
    }
  };

  const handleSearchUsersForGrant = async (query: string) => {
    setGrantUserQuery(query);
    if (!query.trim() || query.trim().length < 2) {
      setSearchedUsers([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const res = await authFetch(`/api/admin/users?search=${encodeURIComponent(query.trim())}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setSearchedUsers(data.users || []);
      }
    } catch (err) {
      console.error('Error searching users for musician role:', err);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleGrantMusician = async (userId: number, username: string) => {
    if (!confirm(`Выдать статус музыканта пользователю @${username}?`)) return;
    setGrantingUserId(userId);
    try {
      const res = await authFetch(`/api/music/admin/users/${userId}/grant-musician`, {
        method: 'POST',
      });
      if (res.ok) {
        alert(`Роль музыканта успешно выдана пользователю @${username}`);
        setGrantModalOpen(false);
        setGrantUserQuery('');
        setSearchedUsers([]);
        fetchMusicians();
      } else {
        const data = await res.json();
        alert(data.error || 'Ошибка выдачи роли музыканта');
      }
    } catch (_err) {
      alert('Ошибка при выполнении запроса');
    } finally {
      setGrantingUserId(null);
    }
  };

  const handleRevokeMusician = async () => {
    if (!revokingMusician) return;
    setRevokingLoading(true);
    try {
      const res = await authFetch(`/api/music/admin/users/${revokingMusician.id}/revoke-musician`, {
        method: 'POST',
      });
      if (res.ok) {
        setRevokingMusician(null);
        fetchMusicians();
      } else {
        const data = await res.json();
        alert(data.error || 'Ошибка отзыва роли музыканта');
      }
    } catch (_err) {
      alert('Ошибка при выполнении запроса');
    } finally {
      setRevokingLoading(false);
    }
  };

  const filteredApps = applications.filter((app) => {
    if (!appsSearch.trim()) return true;
    const q = appsSearch.toLowerCase();
    return (
      app.username.toLowerCase().includes(q) ||
      app.userEmail.toLowerCase().includes(q) ||
      (app.message && app.message.toLowerCase().includes(q))
    );
  });

  const filteredMusicians = musicians.filter((m) => {
    if (!musiciansSearch.trim()) return true;
    const q = musiciansSearch.toLowerCase();
    return (
      m.username.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      (m.artistProfile?.stageName && m.artistProfile.stageName.toLowerCase().includes(q)) ||
      (m.artistProfile?.slug && m.artistProfile.slug.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Music className="w-5 h-5 text-purple-400" />
            <span>Управление музыкантами</span>
          </h2>
          <p className="text-xs text-[#94A3B8] mt-1">
            Модерация заявок на авторство и управление действующими музыкантами платформы
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          {(isAdmin || isSuperAdmin) && (
            <button
              onClick={() => {
                setGrantModalOpen(true);
                setGrantUserQuery('');
                setSearchedUsers([]);
              }}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-mono font-bold text-white transition-all shadow-md shadow-purple-600/20 flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Выдать статус</span>
            </button>
          )}

          <button
            onClick={() => (tabMode === 'APPLICATIONS' ? fetchApplications() : fetchMusicians())}
            disabled={appsLoading || musiciansLoading}
            className="px-3.5 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs font-mono font-semibold text-[#94A3B8] hover:text-white hover:bg-[#1A203C] transition-all flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${appsLoading || musiciansLoading ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        </div>
      </div>

      {/* Main Tab Mode Switcher */}
      <div className="flex items-center gap-2 border-b border-[#1E2442] pb-3">
        <button
          onClick={() => setTabMode('APPLICATIONS')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
            tabMode === 'APPLICATIONS'
              ? 'bg-purple-600/20 border border-purple-500/40 text-purple-300 shadow-md shadow-purple-600/10'
              : 'text-[#94A3B8] hover:text-white hover:bg-[#11152A]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Заявки на рассмотрение ({applications.filter((a) => a.status === 'PENDING').length})</span>
        </button>

        <button
          onClick={() => setTabMode('MUSICIANS')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
            tabMode === 'MUSICIANS'
              ? 'bg-purple-600/20 border border-purple-500/40 text-purple-300 shadow-md shadow-purple-600/10'
              : 'text-[#94A3B8] hover:text-white hover:bg-[#11152A]'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Музыканты платформы ({musicians.length})</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* 1. APPLICATIONS VIEW                                            */}
      {/* ============================================================== */}
      {tabMode === 'APPLICATIONS' && (
        <div className="space-y-4">
          {/* Sub-Tabs & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0B0D20] border border-[#1E2442] overflow-x-auto">
              {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setActiveStatus(st)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
                    activeStatus === st
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                      : 'text-[#94A3B8] hover:text-white hover:bg-[#11152A]'
                  }`}
                >
                  {st === 'PENDING' && 'На рассмотрении'}
                  {st === 'APPROVED' && 'Одобренные'}
                  {st === 'REJECTED' && 'Отклонённые'}
                  {st === 'ALL' && 'Все заявки'}
                </button>
              ))}
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Поиск по никнейму, email..."
                value={appsSearch}
                onChange={(e) => setAppsSearch(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Applications List */}
          {appsLoading ? (
            <div className="py-20 text-center text-[#64748B] flex flex-col items-center gap-2 font-mono text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span>Загрузка заявок...</span>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto">
                <Music className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white">Заявок не найдено</p>
              <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
                {activeStatus === 'PENDING'
                  ? 'В данный момент нет новых заявок, ожидающих рассмотрения.'
                  : 'По заданным фильтрам заявки не обнаружены.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredApps.map((app) => (
                <div
                  key={app.id}
                  className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#2E365C] transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
                >
                  {/* Left User & Info */}
                  <div className="flex items-start gap-4 min-w-0">
                    {app.userAvatar ? (
                      <img
                        src={app.userAvatar}
                        alt={app.username}
                        className="w-11 h-11 rounded-2xl object-cover border border-[#1E2442] shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-2xl bg-purple-900/50 text-purple-300 font-bold text-sm flex items-center justify-center font-mono border border-[#1E2442] shrink-0">
                        {app.username.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white font-mono">@{app.username}</span>
                        <span className="text-xs text-[#64748B]">({app.userEmail})</span>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border ${
                            app.userRole === 'musician'
                              ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                              : 'bg-[#11152A] border-[#1E2442] text-[#94A3B8]'
                          }`}
                        >
                          {app.userRole}
                        </span>

                        {/* Status badge */}
                        {app.status === 'PENDING' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>На рассмотрении</span>
                          </span>
                        )}
                        {app.status === 'APPROVED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            <span>Одобрено</span>
                          </span>
                        )}
                        {app.status === 'REJECTED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            <span>Отклонено</span>
                          </span>
                        )}
                      </div>

                      {app.message && (
                        <p className="text-xs text-[#CBD5E1] bg-[#11152A] p-3 rounded-2xl border border-[#1E2442] leading-relaxed whitespace-pre-wrap">
                          {app.message}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-[11px] font-mono text-[#64748B]">
                        <span>Подано: {new Date(app.createdAt).toLocaleString('ru-RU')}</span>
                        {app.reviewedAt && (
                          <span>Рассмотрено: {new Date(app.reviewedAt).toLocaleString('ru-RU')}</span>
                        )}
                      </div>

                      {app.status === 'REJECTED' && app.rejectionReason && (
                        <div className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20 font-mono">
                          <strong>Причина отказа:</strong> {app.rejectionReason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {app.status === 'PENDING' && (
                    <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                      <button
                        onClick={() => handleApprove(app.id)}
                        disabled={processingId === app.id}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        <span>Одобрить</span>
                      </button>
                      <button
                        onClick={() => {
                          setRejectingApp(app);
                          setRejectionReason('');
                        }}
                        disabled={processingId === app.id}
                        className="px-3.5 py-2 rounded-xl bg-rose-600/20 border border-rose-500/30 hover:bg-rose-600 text-rose-300 hover:text-white font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                        <span>Отклонить</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. PLATFORM MUSICIANS VIEW                                      */}
      {/* ============================================================== */}
      {tabMode === 'MUSICIANS' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Поиск по псевдониму, никнейму, email..."
                value={musiciansSearch}
                onChange={(e) => setMusiciansSearch(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500"
              />
            </div>

            <span className="text-xs font-mono text-[#94A3B8]">
              Всего музыкантов: <strong className="text-white">{musicians.length}</strong>
            </span>
          </div>

          {/* Musicians Table / Grid */}
          {musiciansLoading ? (
            <div className="py-20 text-center text-[#64748B] flex flex-col items-center gap-2 font-mono text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span>Загрузка списка музыкантов...</span>
            </div>
          ) : filteredMusicians.length === 0 ? (
            <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto">
                <Music className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white">Музыканты не найдены</p>
              <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
                На платформе пока нет пользователей с ролью музыканта или ни один пользователь не соответствует запросу.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMusicians.map((m) => (
                <div
                  key={m.id}
                  className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#2E365C] transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {m.artistProfile?.avatar || m.avatar ? (
                      <img
                        src={m.artistProfile?.avatar || m.avatar || ''}
                        alt={m.artistProfile?.stageName || m.username}
                        className="w-12 h-12 rounded-2xl object-cover border border-[#1E2442] shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-purple-900/50 text-purple-300 font-bold text-base flex items-center justify-center font-mono border border-[#1E2442] shrink-0">
                        {(m.artistProfile?.stageName || m.username).charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white font-mono">
                          {m.artistProfile?.stageName || m.username}
                        </span>
                        <span className="text-xs text-[#64748B]">(@{m.username})</span>

                        {m.artistProfile?.status && (
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border ${
                              m.artistProfile.status === 'ACTIVE'
                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                            }`}
                          >
                            Профиль: {m.artistProfile.status}
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300">
                          Роли: [{m.roles.join(', ')}]
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-[#94A3B8] font-mono">
                        <span>Email: {m.email}</span>
                        {m.artistProfile?.slug && (
                          <span>Slug: /{m.artistProfile.slug}</span>
                        )}
                        <span>В платформе с: {new Date(m.createdAt).toLocaleDateString('ru-RU')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {m.artistProfile?.slug && (
                      <a
                        href={`/music/artist/${m.artistProfile.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
                        title="Страница исполнителя"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}

                    {(isAdmin || isSuperAdmin) && (
                      <button
                        onClick={() => setRevokingMusician(m)}
                        className="px-3.5 py-2 rounded-xl bg-rose-600/15 border border-rose-500/30 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Отозвать роль музыканта"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        <span>Снять роль</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. MODALS                                                      */}
      {/* ============================================================== */}

      {/* Manual Grant Modal */}
      {grantModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B0D20] border border-[#1E2442] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2442]">
              <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-400" />
                <span>Выдать роль музыканта</span>
              </h3>
              <button
                onClick={() => setGrantModalOpen(false)}
                className="p-1 text-[#64748B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#94A3B8]">
              Найдите зарегистрированного пользователя для ручного присвоения роли музыканта. Существующие роли будут сохранены.
            </p>

            <div className="relative">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Введите никнейм или email..."
                value={grantUserQuery}
                onChange={(e) => handleSearchUsersForGrant(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500"
              />
            </div>

            {searchingUsers ? (
              <div className="py-6 text-center text-[#64748B] flex items-center justify-center gap-2 text-xs font-mono">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                <span>Поиск пользователей...</span>
              </div>
            ) : searchedUsers.length > 0 ? (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {searchedUsers.map((u) => {
                  const hasMusicianRole = Array.isArray(u.roles)
                    ? u.roles.includes('musician')
                    : u.role === 'musician';
                  return (
                    <div
                      key={u.id}
                      className="p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-white font-mono">@{u.username}</span>
                        <div className="text-[11px] text-[#64748B] truncate">{u.email}</div>
                      </div>

                      {hasMusicianRole ? (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300">
                          Уже музыкант
                        </span>
                      ) : (
                        <button
                          onClick={() => handleGrantMusician(u.id, u.username)}
                          disabled={grantingUserId === u.id}
                          className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
                        >
                          {grantingUserId === u.id ? 'Выдача...' : 'Выдать'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : grantUserQuery.trim().length >= 2 ? (
              <div className="py-4 text-center text-xs text-[#64748B] font-mono">
                Пользователи не найдены
              </div>
            ) : null}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setGrantModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#11152A] text-xs font-mono font-semibold text-[#94A3B8] hover:text-white border border-[#1E2442] transition-colors cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Musician Role Confirm Modal */}
      {revokingMusician && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B0D20] border border-[#1E2442] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2442]">
              <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-400" />
                <span>Снятие роли музыканта</span>
              </h3>
              <button
                onClick={() => setRevokingMusician(null)}
                className="p-1 text-[#64748B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#94A3B8]">
              Вы уверены, что хотите снять роль музыканта у пользователя{' '}
              <strong className="text-white">@{revokingMusician.username}</strong>?
            </p>
            <p className="text-[11px] text-[#64748B] bg-[#11152A] p-3 rounded-2xl border border-[#1E2442]">
              Все остальные роли пользователя (например, модератор или контент-менеджер) останутся неизменными.
              Профиль исполнителя будет приостановлен (SUSPENDED).
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRevokingMusician(null)}
                className="px-4 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs font-mono font-bold text-[#94A3B8] hover:text-white cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={handleRevokeMusician}
                disabled={revokingLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-rose-600/20 cursor-pointer disabled:opacity-50"
              >
                {revokingLoading ? 'Снятие...' : 'Подтвердить снятие'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingApp && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B0D20] border border-[#1E2442] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2442]">
              <h3 className="text-base font-extrabold text-white font-mono flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-400" />
                <span>Отклонение заявки</span>
              </h3>
              <button
                onClick={() => setRejectingApp(null)}
                className="p-1 text-[#64748B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#94A3B8]">
              Заявка пользователя <strong className="text-white">@{rejectingApp.username}</strong> будет отклонена.
              Укажите причину для информирования пользователя:
            </p>

            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Причина отклонения (например: не предоставил примеры работ)..."
              className="w-full p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-rose-500 resize-none"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectingApp(null)}
                className="px-4 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs font-mono font-bold text-[#94A3B8] hover:text-white cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={processingId === rejectingApp.id}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-rose-600/20 cursor-pointer disabled:opacity-50"
              >
                Подтвердить отказ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
