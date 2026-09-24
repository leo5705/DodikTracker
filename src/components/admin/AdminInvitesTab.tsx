import React, { useState, useEffect } from 'react';
import {
  Ticket,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Power,
  PowerOff,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface AdminInviteItem {
  id: number;
  code: string;
  creatorId: number | null;
  usedById: number | null;
  isUsed: boolean;
  isActive: boolean;
  createdAt: string;
  usedAt: string | null;
  creatorUsername: string | null;
  creatorAvatar: string | null;
  usedByUsername: string | null;
  usedByAvatar: string | null;
}

interface AdminInvitesStats {
  total: number;
  active: number;
  used: number;
  disabled: number;
}

export const AdminInvitesTab: React.FC = () => {
  const { authFetch } = useAuth();
  const [items, setItems] = useState<AdminInviteItem[]>([]);
  const [stats, setStats] = useState<AdminInvitesStats>({ total: 0, active: 0, used: 0, disabled: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'USED' | 'DISABLED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Generation state
  const [showGenModal, setShowGenModal] = useState(false);
  const [genCount, setGenCount] = useState(5);
  const [genPrefix, setGenPrefix] = useState('DODIK');
  const [generating, setGenerating] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copiedBatch, setCopiedBatch] = useState(false);

  const [copiedCodeId, setCopiedCodeId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchInvites = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        status: statusFilter,
        q: searchQuery,
      });
      const res = await authFetch(`/api/admin/invites?${params.toString()}`);
      if (!res.ok) throw new Error('Ошибка загрузки списка инвайтов');
      const data = await res.json();
      setItems(data.items || []);
      setTotalPages(data.totalPages || 1);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err: any) {
      setActionError(err.message || 'Не удалось получить инвайты');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, [page, statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchInvites();
  };

  const handleToggle = async (id: number) => {
    try {
      const res = await authFetch(`/api/admin/invites/${id}/toggle`, {
        method: 'POST',
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Ошибка изменения статуса');
      }
      fetchInvites();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот инвайт-код?')) return;
    try {
      const res = await authFetch(`/api/admin/invites/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Ошибка удаления инвайта');
      }
      setActionSuccess('Инвайт успешно удален');
      fetchInvites();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setActionError(null);
    try {
      const res = await authFetch('/api/admin/invites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: genCount,
          prefix: genPrefix,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Ошибка генерации инвайтов');

      setGeneratedCodes(d.codes || []);
      setActionSuccess(`Успешно создано ${d.count || genCount} инвайт-кодов`);
      fetchInvites();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = (code: string, id: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const copyBatchAll = () => {
    if (generatedCodes.length === 0) return;
    navigator.clipboard.writeText(generatedCodes.join('\n'));
    setCopiedBatch(true);
    setTimeout(() => setCopiedBatch(false), 2500);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-purple-500/15 text-[#A78BFA] flex items-center justify-center">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#F8FAFC]">Инвайт-система</h3>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              Просмотр, генерация без ограничений и модерация всех инвайтов проекта
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setGeneratedCodes([]);
              setShowGenModal(true);
            }}
            className="h-11 px-5 rounded-2xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-bold transition-all shadow-lg shadow-purple-950/40 flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>Сгенерировать инвайты</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionError && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-lg">
          <span className="text-xs sm:text-sm font-semibold text-[#94A3B8] block mb-1">Всего инвайтов</span>
          <span className="text-2xl sm:text-3xl font-bold text-[#F8FAFC]">{stats.total}</span>
        </div>
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-lg">
          <span className="text-xs sm:text-sm font-semibold text-[#94A3B8] block mb-1">Активные</span>
          <span className="text-2xl sm:text-3xl font-bold text-emerald-400">{stats.active}</span>
        </div>
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-lg">
          <span className="text-xs sm:text-sm font-semibold text-[#94A3B8] block mb-1">Использованные</span>
          <span className="text-2xl sm:text-3xl font-bold text-[#A78BFA]">{stats.used}</span>
        </div>
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-lg">
          <span className="text-xs sm:text-sm font-semibold text-[#94A3B8] block mb-1">Отключенные</span>
          <span className="text-2xl sm:text-3xl font-bold text-red-400">{stats.disabled}</span>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] self-start flex-wrap">
          <button
            onClick={() => {
              setStatusFilter('ALL');
              setPage(1);
            }}
            className={`h-10 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-[#8B5CF6] text-white shadow-md'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            Все ({stats.total})
          </button>
          <button
            onClick={() => {
              setStatusFilter('ACTIVE');
              setPage(1);
            }}
            className={`h-10 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              statusFilter === 'ACTIVE'
                ? 'bg-[#8B5CF6] text-white shadow-md'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            Активные ({stats.active})
          </button>
          <button
            onClick={() => {
              setStatusFilter('USED');
              setPage(1);
            }}
            className={`h-10 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              statusFilter === 'USED'
                ? 'bg-[#8B5CF6] text-white shadow-md'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            Использованные ({stats.used})
          </button>
          <button
            onClick={() => {
              setStatusFilter('DISABLED');
              setPage(1);
            }}
            className={`h-10 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              statusFilter === 'DISABLED'
                ? 'bg-[#8B5CF6] text-white shadow-md'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            Отключенные ({stats.disabled})
          </button>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex items-center gap-2.5">
          <div className="relative flex-1 md:w-72">
            <Search className="w-4.5 h-4.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по коду или username..."
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#A78BFA]"
            />
          </div>
          <button
            type="submit"
            className="h-11 px-5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] border border-[#1E2442] text-sm font-bold text-[#F8FAFC] transition-colors cursor-pointer"
          >
            Найти
          </button>
        </form>
      </div>

      {/* Invites Table */}
      <div className="rounded-3xl bg-[#0B0D20] border border-[#1E2442] overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <RefreshCw className="w-8 h-8 text-[#A78BFA] animate-spin" />
            <span className="text-sm text-[#94A3B8]">Загрузка инвайтов...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-16 text-center text-sm text-[#94A3B8]">
            Инвайт-коды не найдены
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[720px] overflow-y-auto no-scrollbar">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-[#0B0D20]/95 backdrop-blur-md shadow-sm">
                <tr className="border-b border-[#1E2442] text-[#94A3B8] font-mono uppercase text-xs">
                  <th className="py-4 px-5 font-semibold">Инвайт-код</th>
                  <th className="py-4 px-5 font-semibold">Статус</th>
                  <th className="py-4 px-5 font-semibold">Создатель</th>
                  <th className="py-4 px-5 font-semibold">Кем использован</th>
                  <th className="py-4 px-5 font-semibold">Создан</th>
                  <th className="py-4 px-5 font-semibold text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2442]">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#11152A]/80 transition-colors">
                    {/* Code */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-base text-[#F8FAFC] tracking-wider">{item.code}</span>
                        <button
                          onClick={() => copyCode(item.code, item.id)}
                          title="Скопировать код"
                          className="p-1.5 rounded-lg hover:bg-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                        >
                          {copiedCodeId === item.id ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-5">
                      {item.isUsed ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 inline-flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5" />
                          Использован
                        </span>
                      ) : !item.isActive ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-300 border border-red-500/30 inline-flex items-center gap-1.5">
                          <PowerOff className="w-3.5 h-3.5" />
                          Отключен
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          Активен
                        </span>
                      )}
                    </td>

                    {/* Creator */}
                    <td className="py-4 px-5">
                      {item.creatorUsername ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#F8FAFC]">@{item.creatorUsername}</span>
                        </div>
                      ) : (
                        <span className="text-[#64748B]">Системный</span>
                      )}
                    </td>

                    {/* Used By */}
                    <td className="py-4 px-5">
                      {item.usedByUsername ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#A78BFA]">@{item.usedByUsername}</span>
                          <span className="text-xs text-[#64748B] font-mono">({formatDate(item.usedAt)})</span>
                        </div>
                      ) : (
                        <span className="text-[#64748B]">—</span>
                      )}
                    </td>

                    {/* Created */}
                    <td className="py-4 px-5 text-xs sm:text-sm text-[#94A3B8] font-mono">{formatDate(item.createdAt)}</td>

                    {/* Actions */}
                    <td className="py-4 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggle(item.id)}
                          title={item.isActive ? 'Отключить инвайт' : 'Включить инвайт'}
                          className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                            item.isActive
                              ? 'bg-[#11152A] hover:bg-red-500/20 text-[#94A3B8] hover:text-red-400 border-[#1E2442]'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {item.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={() => handleDelete(item.id)}
                          title="Удалить инвайт"
                          className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 sm:p-5 border-t border-[#1E2442] bg-[#11152A]/40">
            <span className="text-xs sm:text-sm text-[#94A3B8]">Страница {page} из {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-10 px-3 rounded-xl bg-[#0B0D20] border border-[#1E2442] disabled:opacity-40 text-[#F8FAFC] flex items-center justify-center cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-10 px-3 rounded-xl bg-[#0B0D20] border border-[#1E2442] disabled:opacity-40 text-[#F8FAFC] flex items-center justify-center cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 sm:p-7 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2442]">
              <div className="flex items-center gap-2.5">
                <Ticket className="w-6 h-6 text-[#A78BFA]" />
                <h4 className="text-base sm:text-lg font-bold text-[#F8FAFC]">Генерация инвайтов (Admin)</h4>
              </div>
              <button
                onClick={() => setShowGenModal(false)}
                className="p-2 rounded-xl hover:bg-[#151932] text-[#64748B] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm font-semibold text-[#94A3B8]">Количество кодов (1 — 100)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={genCount}
                  onChange={(e) => setGenCount(parseInt(e.target.value, 10) || 1)}
                  className="w-full h-11 px-4 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#A78BFA] font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm font-semibold text-[#94A3B8]">Префикс кода</label>
                <input
                  type="text"
                  value={genPrefix}
                  onChange={(e) => setGenPrefix(e.target.value.toUpperCase())}
                  placeholder="DODIK"
                  className="w-full h-11 px-4 rounded-xl bg-[#11152A] border border-[#1E2442] text-sm font-mono text-[#F8FAFC] focus:outline-none focus:border-[#A78BFA]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowGenModal(false)}
                  className="h-11 px-5 rounded-xl bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] text-sm font-semibold cursor-pointer"
                >
                  Закрыть
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="h-11 px-6 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-purple-950/40 cursor-pointer"
                >
                  {generating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Генерация...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Сгенерировать
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Generated Codes Output */}
            {generatedCodes.length > 0 && (
              <div className="pt-3 border-t border-[#1E2442] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-emerald-400">
                    Сгенерировано ({generatedCodes.length}):
                  </span>
                  <button
                    onClick={copyBatchAll}
                    className="text-xs font-bold text-[#A78BFA] hover:text-[#C4A7FF] flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedBatch ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedBatch ? 'Все скопированы' : 'Скопировать все'}
                  </button>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] max-h-44 overflow-y-auto space-y-1.5 font-mono text-sm text-[#F8FAFC] custom-scrollbar">
                  {generatedCodes.map((c, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
