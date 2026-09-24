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
  Cpu,
  Info,
  X,
  Copy,
  Check,
  Eye,
  Terminal,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatAuditLog, FormattedAuditLog } from '../../utils/auditFormatter.ts';

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

  // Modal Inspector State
  const [selectedAuditLog, setSelectedAuditLog] = useState<FormattedAuditLog | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

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

  const handleCopyJson = (jsonString: string) => {
    navigator.clipboard.writeText(jsonString);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div className="space-y-5 w-full animate-in fade-in duration-200">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
        <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4.5 h-4.5 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по событию, администратору или содержимому..."
              className="w-full h-11 pl-10 pr-4 bg-[#11152A] border border-[#1E2442] focus:border-[#8B5CF6] rounded-xl text-sm text-[#F8FAFC] placeholder-[#64748B] outline-none transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="h-11 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-bold transition-colors cursor-pointer shadow-md"
          >
            Найти
          </button>
        </form>

        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          className="h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs sm:text-sm text-[#F8FAFC] outline-none font-medium cursor-pointer"
        >
          <option value="ALL">Все категории аудита</option>
          <option value="SYSTEM_">Система и авто-задачи</option>
          <option value="USER_">Пользователи и аккаунты</option>
          <option value="CONTENT_">Каталог контента</option>
          <option value="REPORT_">Модерация и жалобы</option>
          <option value="NEWS_">Новости</option>
          <option value="ANNOUNCEMENT_">Объявления</option>
          <option value="ACHIEVEMENTS_">Достижения</option>
          <option value="INTEGRATIONS_">Интеграции и API</option>
          <option value="SETTINGS_">Системные настройки</option>
        </select>
      </div>

      {/* Summary Header */}
      <div className="text-xs sm:text-sm text-[#94A3B8] flex items-center justify-between px-1">
        <span>
          Всего записей в аудите: <strong className="text-[#F8FAFC]">{totalCount}</strong>
          {actionFilter !== 'ALL' && <span className="ml-2 text-[#A78BFA] font-semibold">(фильтр активен)</span>}
        </span>
        <span>
          Страница <strong className="text-[#F8FAFC]">{page}</strong> из{' '}
          <strong className="text-[#F8FAFC]">{totalPages}</strong>
        </span>
      </div>

      {/* Main Table */}
      <div className="rounded-2xl bg-[#0B0D20] border border-[#1E2442] overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <RotateCw className="w-8 h-8 text-[#8B5CF6] animate-spin" />
            <span className="text-sm text-[#94A3B8] font-mono">Чтение системного журнала аудита...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm space-y-3">
            <p>{error}</p>
            <button
              onClick={fetchLogs}
              className="h-10 px-5 rounded-xl bg-[#7C3AED] text-white text-xs font-bold hover:bg-[#6D28D9] cursor-pointer"
            >
              Повторить загрузку
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-[#64748B] text-sm space-y-2">
            <FileText className="w-10 h-10 mx-auto text-[#64748B]" />
            <p className="font-semibold text-zinc-400">Записей не найдено по заданным критериям</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[720px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-[#0B0D20]/95 backdrop-blur-md shadow-sm">
                <tr className="border-b border-[#1E2442] text-[#94A3B8] uppercase tracking-wider font-mono text-xs">
                  <th className="py-3.5 px-4">Время</th>
                  <th className="py-3.5 px-3.5">Исполнитель</th>
                  <th className="py-3.5 px-3.5">Категория / Событие</th>
                  <th className="py-3.5 px-4">Описание и параметры</th>
                  <th className="py-3.5 px-4 text-right">Детали</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2442]">
                {logs.map((log) => {
                  const item = formatAuditLog(log);
                  return (
                    <tr key={item.id} className="hover:bg-[#11152A] transition-colors group">
                      {/* Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono text-[#F8FAFC] font-semibold text-xs sm:text-sm">
                          {item.formattedDate}
                        </div>
                        <div className="text-xs text-[#64748B] font-mono">{item.relativeDate}</div>
                      </td>

                      {/* Actor */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        {item.isSystem ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold">
                            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Система</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#151932] border border-[#1E2442] flex items-center justify-center text-xs font-bold text-[#A78BFA]">
                              {item.actorName.charAt(1)?.toUpperCase() || 'A'}
                            </div>
                            <span className="font-bold text-[#F8FAFC] font-mono text-xs sm:text-sm">{item.actorName}</span>
                          </div>
                        )}
                      </td>

                      {/* Category & Title */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        <div className="space-y-1">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] sm:text-xs font-bold font-mono border uppercase tracking-wider ${item.badgeClass}`}
                          >
                            {item.category}
                          </span>
                          <div className="font-bold text-white text-xs sm:text-sm">{item.title}</div>
                        </div>
                      </td>

                      {/* Description & Highlights */}
                      <td className="py-3.5 px-4">
                        <div className="text-[#CBD5E1] text-xs sm:text-sm leading-relaxed max-w-xl">
                          {item.summary}
                        </div>
                        {item.highlights.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {item.highlights.map((h, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-0.5 rounded-md bg-[#11152A] border border-[#1E2442] text-xs font-mono text-[#94A3B8]"
                              >
                                <strong className="text-[#F8FAFC]">{h.label}:</strong> {h.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Details Button */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedAuditLog(item)}
                          className="h-9 px-3.5 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/50 text-[#A78BFA] hover:text-white text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Info className="w-4 h-4" />
                          <span>Подробнее</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 border-t border-[#1E2442] flex items-center justify-between text-xs sm:text-sm text-[#94A3B8]">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="h-10 px-4 rounded-xl bg-[#11152A] border border-[#1E2442] hover:bg-[#151932] disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1.5 cursor-pointer font-semibold"
          >
            <ChevronLeft className="w-4 h-4" />
            Назад
          </button>
          <span>
            Страница <strong className="text-[#F8FAFC]">{page}</strong> из{' '}
            <strong className="text-[#F8FAFC]">{totalPages}</strong>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="h-10 px-4 rounded-xl bg-[#11152A] border border-[#1E2442] hover:bg-[#151932] disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1.5 cursor-pointer font-semibold"
          >
            Вперёд
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* INSPECT MODAL FOR TECHNICAL DETAILS */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 space-y-5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#1E2442] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-center text-[#8B5CF6]">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[10px] sm:text-xs font-bold font-mono border uppercase tracking-wider ${selectedAuditLog.badgeClass}`}
                    >
                      {selectedAuditLog.category}
                    </span>
                    <span className="text-xs font-mono text-[#64748B]">ID: #{selectedAuditLog.id}</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#F8FAFC] mt-0.5">{selectedAuditLog.title}</h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Scrollable */}
            <div className="space-y-4 overflow-y-auto pr-1 custom-scrollbar flex-1">
              {/* Event Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442]">
                  <span className="text-xs font-mono uppercase text-[#64748B] block font-bold">Исполнитель</span>
                  <span className="text-sm font-bold text-[#F8FAFC] font-mono mt-1 block">
                    {selectedAuditLog.isSystem ? 'Система' : selectedAuditLog.actorName}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442]">
                  <span className="text-xs font-mono uppercase text-[#64748B] block font-bold">Действие</span>
                  <span className="text-xs font-bold text-[#A78BFA] font-mono mt-1 block truncate">
                    {selectedAuditLog.action}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442]">
                  <span className="text-xs font-mono uppercase text-[#64748B] block font-bold">Дата и время</span>
                  <span className="text-xs font-medium text-[#F8FAFC] font-mono mt-1 block">
                    {selectedAuditLog.formattedDate}
                  </span>
                </div>
              </div>

              {/* Summary Description */}
              <div className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-1.5">
                <span className="text-xs font-mono uppercase text-[#64748B] block font-bold">
                  Человекочитаемое описание
                </span>
                <p className="text-sm text-white leading-relaxed font-sans">{selectedAuditLog.summary}</p>
              </div>

              {/* JSON Metadata Payload */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-[#64748B] font-bold">Сырые параметры (JSON)</span>
                  <button
                    onClick={() => handleCopyJson(selectedAuditLog.rawDetails)}
                    className="flex items-center gap-1.5 text-xs text-[#A78BFA] hover:text-white font-mono cursor-pointer"
                  >
                    {copiedJson ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Скопировать JSON</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 rounded-2xl bg-[#080A18] border border-[#1E2442] text-xs font-mono text-emerald-400 overflow-x-auto max-h-48 custom-scrollbar">
                  {selectedAuditLog.rawDetails}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-[#1E2442] flex justify-end">
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="h-11 px-6 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-sm font-bold text-white transition-colors cursor-pointer border border-[#1E2442]"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
