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

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setActionError(null);
    try {
      const res = await authFetch('/api/admin/invites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: genCount, prefix: genPrefix }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка генерации инвайтов');
      
      setGeneratedCodes(data.codes || []);
      setActionSuccess(`Успешно создано ${data.count} инвайт-кодов!`);
      fetchInvites();
    } catch (err: any) {
      setActionError(err.message || 'Не удалось сгенерировать');
    } finally {
      setGenerating(false);
    }
  };

  const handleToggle = async (id: number) => {
    try {
      const res = await authFetch(`/api/admin/invites/${id}/toggle`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка переключения статуса');
      
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, isActive: data.isActive } : item))
      );
      setActionSuccess('Статус инвайта обновлен');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err.message || 'Ошибка обновления статуса');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот инвайт-код?')) return;
    try {
      const res = await authFetch(`/api/admin/invites/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка удаления');
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
      setActionSuccess('Инвайт-код удален');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err.message || 'Ошибка удаления');
    }
  };

  const copyCode = (code: string, id: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const copyBatchAll = () => {
    navigator.clipboard.writeText(generatedCodes.join('\n'));
    setCopiedBatch(true);
    setTimeout(() => setCopiedBatch(false), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#14131A] border border-[#252233]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-[#AC82FF] flex items-center justify-center">
            <Ticket className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#F3F1F8]">Управление инвайт-кодами</h3>
            <p className="text-xs text-[#9A94AA]">
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
            className="px-3.5 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-all shadow-md shadow-purple-950/40 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Сгенерировать инвайты
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#14131A] border border-[#252233]">
          <span className="text-[11px] font-semibold text-[#9A94AA] block mb-1">Всего инвайтов</span>
          <span className="text-xl font-bold text-[#F3F1F8]">{stats.total}</span>
        </div>
        <div className="p-4 rounded-xl bg-[#14131A] border border-[#252233]">
          <span className="text-[11px] font-semibold text-[#9A94AA] block mb-1">Активные</span>
          <span className="text-xl font-bold text-emerald-400">{stats.active}</span>
        </div>
        <div className="p-4 rounded-xl bg-[#14131A] border border-[#252233]">
          <span className="text-[11px] font-semibold text-[#9A94AA] block mb-1">Использованные</span>
          <span className="text-xl font-bold text-[#AC82FF]">{stats.used}</span>
        </div>
        <div className="p-4 rounded-xl bg-[#14131A] border border-[#252233]">
          <span className="text-[11px] font-semibold text-[#9A94AA] block mb-1">Отключенные</span>
          <span className="text-xl font-bold text-red-400">{stats.disabled}</span>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#14131A] border border-[#252233] self-start">
          <button
            onClick={() => {
              setStatusFilter('ALL');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'ALL'
                ? 'bg-[#9B6BFF] text-white'
                : 'text-[#9A94AA] hover:text-[#F3F1F8]'
            }`}
          >
            Все ({stats.total})
          </button>
          <button
            onClick={() => {
              setStatusFilter('ACTIVE');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'ACTIVE'
                ? 'bg-[#9B6BFF] text-white'
                : 'text-[#9A94AA] hover:text-[#F3F1F8]'
            }`}
          >
            Активные ({stats.active})
          </button>
          <button
            onClick={() => {
              setStatusFilter('USED');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'USED'
                ? 'bg-[#9B6BFF] text-white'
                : 'text-[#9A94AA] hover:text-[#F3F1F8]'
            }`}
          >
            Использованные ({stats.used})
          </button>
          <button
            onClick={() => {
              setStatusFilter('DISABLED');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'DISABLED'
                ? 'bg-[#9B6BFF] text-white'
                : 'text-[#9A94AA] hover:text-[#F3F1F8]'
            }`}
          >
            Отключенные ({stats.disabled})
          </button>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6B667B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по коду или username..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#14131A] border border-[#252233] text-xs text-[#F3F1F8] placeholder-[#6B667B] focus:outline-none focus:border-[#AC82FF]"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 rounded-xl bg-[#191724] hover:bg-[#252233] border border-[#2E2A40] text-xs font-semibold text-[#F3F1F8] transition-colors"
          >
            Найти
          </button>
        </form>
      </div>

      {/* Invites Table */}
      <div className="rounded-2xl bg-[#14131A] border border-[#252233] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <RefreshCw className="w-7 h-7 text-[#AC82FF] animate-spin" />
            <span className="text-xs text-[#9A94AA]">Загрузка инвайтов...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#9A94AA]">
            Инвайт-коды не найдены
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#252233] bg-[#191724]/60 text-[#9A94AA]">
                  <th className="p-3.5 font-semibold">Инвайт-код</th>
                  <th className="p-3.5 font-semibold">Статус</th>
                  <th className="p-3.5 font-semibold">Создатель</th>
                  <th className="p-3.5 font-semibold">Кем использован</th>
                  <th className="p-3.5 font-semibold">Создан</th>
                  <th className="p-3.5 font-semibold text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252233]">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#191724]/40 transition-colors">
                    {/* Code */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#F3F1F8]">{item.code}</span>
                        <button
                          onClick={() => copyCode(item.code, item.id)}
                          title="Скопировать код"
                          className="p-1 rounded hover:bg-[#2E2A40] text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
                        >
                          {copiedCodeId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="p-3.5">
                      {item.isUsed ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 inline-flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Использован
                        </span>
                      ) : !item.isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-300 border border-red-500/30 inline-flex items-center gap-1">
                          <PowerOff className="w-3 h-3" />
                          Отключен
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Активен
                        </span>
                      )}
                    </td>

                    {/* Creator */}
                    <td className="p-3.5">
                      {item.creatorUsername ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#F3F1F8]">@{item.creatorUsername}</span>
                        </div>
                      ) : (
                        <span className="text-[#6B667B]">Системный</span>
                      )}
                    </td>

                    {/* Used By */}
                    <td className="p-3.5">
                      {item.usedByUsername ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#AC82FF]">@{item.usedByUsername}</span>
                          <span className="text-[10px] text-[#6B667B]">({formatDate(item.usedAt)})</span>
                        </div>
                      ) : (
                        <span className="text-[#6B667B]">—</span>
                      )}
                    </td>

                    {/* Created */}
                    <td className="p-3.5 text-[#9A94AA]">{formatDate(item.createdAt)}</td>

                    {/* Actions */}
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleToggle(item.id)}
                          title={item.isActive ? 'Отключить инвайт' : 'Включить инвайт'}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            item.isActive
                              ? 'bg-[#191724] hover:bg-red-500/20 text-[#9A94AA] hover:text-red-400 border-[#2E2A40]'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {item.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={() => handleDelete(item.id)}
                          title="Удалить инвайт"
                          className="p-1.5 rounded-lg bg-[#191724] hover:bg-red-500/20 text-[#9A94AA] hover:text-red-400 border border-[#2E2A40] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
          <div className="flex items-center justify-between p-3.5 border-t border-[#252233] bg-[#191724]/40">
            <span className="text-xs text-[#9A94AA]">Страница {page} из {totalPages}</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg bg-[#14131A] border border-[#2E2A40] disabled:opacity-40 text-[#F3F1F8]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg bg-[#14131A] border border-[#2E2A40] disabled:opacity-40 text-[#F3F1F8]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#14131A] border border-[#2E2A40] rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-[#AC82FF]" />
                <h4 className="text-sm font-bold text-[#F3F1F8]">Генерация инвайтов (Admin)</h4>
              </div>
              <button
                onClick={() => setShowGenModal(false)}
                className="text-[#9A94AA] hover:text-[#F3F1F8] text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#9A94AA]">Количество кодов (1 — 100)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={genCount}
                  onChange={(e) => setGenCount(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs text-[#F3F1F8] focus:outline-none focus:border-[#AC82FF]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#9A94AA]">Префикс кода</label>
                <input
                  type="text"
                  value={genPrefix}
                  onChange={(e) => setGenPrefix(e.target.value.toUpperCase())}
                  placeholder="DODIK"
                  className="w-full px-3 py-2 rounded-xl bg-[#191724] border border-[#2E2A40] text-xs font-mono text-[#F3F1F8] focus:outline-none focus:border-[#AC82FF]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowGenModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-[#191724] text-[#9A94AA] hover:text-[#F3F1F8] text-xs font-semibold"
                >
                  Закрыть
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold flex items-center gap-1.5 shadow-md"
                >
                  {generating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Генерация...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Сгенерировать
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Generated Codes Output */}
            {generatedCodes.length > 0 && (
              <div className="pt-3 border-t border-[#252233] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400">
                    Сгенерировано ({generatedCodes.length}):
                  </span>
                  <button
                    onClick={copyBatchAll}
                    className="text-[11px] font-semibold text-[#AC82FF] hover:text-[#C4A7FF] flex items-center gap-1"
                  >
                    {copiedBatch ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedBatch ? 'Все скопированы' : 'Скопировать все'}
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-[#191724] border border-[#2E2A40] max-h-36 overflow-y-auto space-y-1 font-mono text-xs text-[#F3F1F8]">
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
