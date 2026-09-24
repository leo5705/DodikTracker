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

export const AdminMusiciansTab: React.FC = () => {
  const { authFetch } = useAuth();
  const [applications, setApplications] = useState<MusicianApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Reject Modal state
  const [rejectingApp, setRejectingApp] = useState<MusicianApplication | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/music/applications/admin?status=${activeStatus}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
      }
    } catch (err) {
      console.error('Error fetching musician applications:', err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, activeStatus]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

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
    } catch (err: any) {
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
    } catch (err) {
      alert('Ошибка при выполнении запроса');
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = applications.filter((app) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      app.username.toLowerCase().includes(q) ||
      app.userEmail.toLowerCase().includes(q) ||
      (app.message && app.message.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Music className="w-5 h-5 text-purple-400" />
            <span>Заявки на статус музыканта</span>
          </h2>
          <p className="text-xs text-[#94A3B8] mt-1">
            Модерация заявок пользователей на получение прав публикации авторской музыки
          </p>
        </div>

        <button
          onClick={fetchApplications}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs font-mono font-semibold text-[#94A3B8] hover:text-white hover:bg-[#1A203C] transition-all flex items-center gap-2 self-start sm:self-center cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Обновить</span>
        </button>
      </div>

      {/* Tabs & Search */}
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
            placeholder="Поиск по имени, email, порфолио..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* Applications List */}
      {loading ? (
        <div className="py-20 text-center text-[#64748B] flex flex-col items-center gap-2 font-mono text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          <span>Загрузка заявок...</span>
        </div>
      ) : filtered.length === 0 ? (
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
          {filtered.map((app) => (
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
