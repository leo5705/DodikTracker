import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Filter,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Clock,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export const AdminAuditTab: React.FC = () => {
  const { authFetch } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        action: actionFilter,
        q: search.trim(),
      });
      const res = await authFetch(`/api/admin/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error('Ошибка загрузки журнала аудита');
      const data = await res.json();
      setLogs(data.items || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить журнал действий');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const getActionBadge = (action: string) => {
    if (action.includes('BAN') || action.includes('BLOCK') || action.includes('DELETE')) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-red-500/20 text-red-300 border border-red-500/30">
          {action}
        </span>
      );
    }
    if (action.includes('ROLE') || action.includes('PERMISSION') || action.includes('SETTING')) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
          {action}
        </span>
      );
    }
    if (action.includes('NEWS') || action.includes('ANNOUNCEMENT') || action.includes('NOTIF')) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          {action}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-zinc-800 text-zinc-300">
        {action}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#14131A] border border-[#252233]">
        <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#9A94AA] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по журналу (действие, админ, ID)..."
              className="w-full pl-9 pr-4 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] placeholder-[#656075] outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-white text-xs font-semibold"
          >
            Найти
          </button>
        </form>

        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
        >
          <option value="ALL">Все типы действий</option>
          <option value="USER_">Действия с пользователями</option>
          <option value="REPORT_">Модерация жалоб</option>
          <option value="CONTENT_">Каталог контента</option>
          <option value="NEWS_">Новости</option>
          <option value="ANNOUNCEMENT_">Объявления</option>
          <option value="SETTINGS_">Настройки системы</option>
        </select>
      </div>

      {/* Summary */}
      <div className="text-xs text-[#9A94AA] flex items-center justify-between px-1">
        <span>Всего записей в аудите: <strong className="text-[#F3F1F8]">{totalCount}</strong></span>
        <span>Страница {page} из {totalPages}</span>
      </div>

      {/* Audit Table */}
      <div className="rounded-2xl bg-[#14131A] border border-[#252233] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <RotateCw className="w-6 h-6 text-[#9B6BFF] animate-spin" />
            <span className="text-xs text-[#9A94AA]">Чтение журнала аудита...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-xs">{error}</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-xs">Событий пока нет</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#252233] bg-[#0F0E12]/80 text-[#656075] uppercase tracking-wider font-mono text-[10px]">
                  <th className="py-3 px-4">Время</th>
                  <th className="py-3 px-3">Администратор</th>
                  <th className="py-3 px-3">Действие</th>
                  
                  <th className="py-3 px-4">Подробности</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252233]/60">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#191724] transition-colors">
                    {/* Timestamp */}
                    <td className="py-3 px-4 whitespace-nowrap text-[#9A94AA] font-mono text-[11px]">
                      {new Date(log.createdAt).toLocaleString('ru-RU')}
                    </td>

                    {/* Admin User */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#0F0E12] border border-[#252233] flex items-center justify-center text-[10px] font-bold text-[#AC82FF]">
                          {log.adminUsername ? log.adminUsername[0].toUpperCase() : 'A'}
                        </div>
                        <span className="font-bold text-[#F3F1F8]">@{log.adminUsername || 'admin'}</span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getActionBadge(log.action)}
                    </td>



                    {/* Details */}
                    <td className="py-3 px-4 text-[#9A94AA] font-mono text-[11px] max-w-md truncate">
                      {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details || '—'}
                    </td>
                  </tr>
                ))}
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
    </div>
  );
};
