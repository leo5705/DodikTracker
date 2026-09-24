import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  Check,
  X,
  Trash2,
  EyeOff,
  Clock,
  Ban,
  Filter,
  Search,
  ExternalLink,
  MessageSquare,
  FileText,
  User,
  Layers,
  Film,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export const AdminModerationTab: React.FC = () => {
  const { authFetch } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [targetTypeFilter, setTargetTypeFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Action states
  const [actingReportId, setActingReportId] = useState<number | null>(null);
  const [actionModal, setActionModal] = useState<{
    report: any;
    actionType: 'DISMISS' | 'HIDE_CONTENT' | 'WARN_USER' | 'BAN_USER' | 'BLOCK_USER';
    warnReason?: string;
    banHours?: string;
    moderatorNotes?: string;
  } | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        targetType: targetTypeFilter,
        page: String(page),
        limit: '20',
      });
      const res = await authFetch(`/api/admin/reports?${params.toString()}`);
      if (!res.ok) throw new Error('Ошибка загрузки очереди модерации');
      const data = await res.json();
      setReports(data.items || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить жалобы');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [statusFilter, targetTypeFilter, page]);

  const handleChangeStatus = async (reportId: number, newStatus: string) => {
    try {
      const res = await authFetch(`/api/admin/reports/${reportId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchReports();
    } catch (err) {
      console.error(err);
    }
  };

  const handleExecuteAction = async () => {
    if (!actionModal) return;
    const { report, actionType, warnReason, banHours, moderatorNotes } = actionModal;
    setActingReportId(report.id);

    try {
      let actionTaken = 'RESOLVED';
      if (actionType === 'DISMISS') actionTaken = 'DISMISSED';
      else if (actionType === 'HIDE_CONTENT') actionTaken = 'CONTENT_HIDDEN';
      else if (actionType === 'WARN_USER') actionTaken = 'USER_WARNED';
      else if (actionType === 'BAN_USER') actionTaken = 'USER_TEMP_BANNED';
      else if (actionType === 'BLOCK_USER') actionTaken = 'USER_BLOCKED';

      const res = await authFetch(`/api/admin/reports/${report.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionTaken,
          moderatorNotes,
          warnReason,
          banHours: banHours ? parseInt(banHours, 10) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка обработки жалобы');

      setActionModal(null);
      fetchReports();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActingReportId(null);
    }
  };

  const getReasonBadge = (reason: string, targetType?: string) => {
    if (targetType === 'SYSTEM') {
      return (
        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
          ОБРАТНАЯ СВЯЗЬ
        </span>
      );
    }
    switch (reason) {
      case 'SPAM':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500/20 text-amber-300">
            СПАМ
          </span>
        );
      case 'HARASSMENT':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-red-500/20 text-red-300">
            ОСКОРБЛЕНИЯ
          </span>
        );
      case 'NSFW':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-rose-500/20 text-rose-300">
            18+ / NSFW
          </span>
        );
      case 'SPOILER':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-500/20 text-purple-300">
            СПОЙЛЕР
          </span>
        );
      case 'RULES_VIOLATION':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-orange-500/20 text-orange-300">
            НАРУШЕНИЕ ПРАВИЛ
          </span>
        );
      case 'OTHER':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-zinc-700 text-zinc-300">
            ДРУГОЕ
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-[#1E2442] text-[#CBD5E1]">
            {reason}
          </span>
        );
    }
  };

  const getTargetIcon = (type: string) => {
    switch (type) {
      case 'REVIEW':
        return <FileText className="w-4 h-4 text-indigo-400" />;
      case 'COMMENT':
        return <MessageSquare className="w-4 h-4 text-teal-400" />;
      case 'MESSAGE':
        return <MessageSquare className="w-4 h-4 text-purple-400" />;
      case 'USER':
        return <User className="w-4 h-4 text-amber-400" />;
      case 'LIST':
      case 'TIER_LIST':
        return <Layers className="w-4 h-4 text-rose-400" />;
      case 'MEDIA':
        return <Film className="w-4 h-4 text-sky-400" />;
      case 'SYSTEM':
        return <MessageSquare className="w-4 h-4 text-purple-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="space-y-5 w-full animate-in fade-in duration-200">
      {/* Top Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 p-4 sm:p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 lg:pb-0">
          <button
            onClick={() => {
              setStatusFilter('PENDING');
              setPage(1);
            }}
            className={`h-11 px-4 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'PENDING'
                ? 'bg-[#7C3AED] text-white shadow-md'
                : 'bg-[#11152A] text-[#94A3B8] hover:text-white border border-[#1E2442]'
            }`}
          >
            Новые (Ожидают)
          </button>
          <button
            onClick={() => {
              setStatusFilter('IN_REVIEW');
              setPage(1);
            }}
            className={`h-11 px-4 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'IN_REVIEW'
                ? 'bg-blue-500 text-black shadow-md'
                : 'bg-[#11152A] text-[#94A3B8] hover:text-white border border-[#1E2442]'
            }`}
          >
            В работе
          </button>
          <button
            onClick={() => {
              setStatusFilter('RESOLVED');
              setPage(1);
            }}
            className={`h-11 px-4 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'RESOLVED'
                ? 'bg-emerald-500 text-black shadow-md'
                : 'bg-[#11152A] text-[#94A3B8] hover:text-white border border-[#1E2442]'
            }`}
          >
            Решено
          </button>
          <button
            onClick={() => {
              setStatusFilter('DISMISSED');
              setPage(1);
            }}
            className={`h-11 px-4 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'DISMISSED'
                ? 'bg-zinc-700 text-white shadow-md'
                : 'bg-[#11152A] text-[#94A3B8] hover:text-white border border-[#1E2442]'
            }`}
          >
            Отклонённые
          </button>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => {
              setTargetTypeFilter('ALL');
              setPage(1);
            }}
            className={`h-11 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
              targetTypeFilter === 'ALL'
                ? 'bg-[#1E2442] text-[#F8FAFC] border border-[#1E2442]'
                : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2442]'
            }`}
          >
            Все типы
          </button>
          <button
            onClick={() => {
              setTargetTypeFilter('SYSTEM');
              setPage(1);
            }}
            className={`h-11 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer ${
              targetTypeFilter === 'SYSTEM'
                ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40'
                : 'bg-[#11152A] text-[#94A3B8] hover:text-purple-300 border border-[#1E2442]'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-purple-400" />
            Обратная связь
          </button>
          <select
            value={targetTypeFilter}
            onChange={(e) => {
              setTargetTypeFilter(e.target.value);
              setPage(1);
            }}
            className="h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs sm:text-sm text-[#F8FAFC] outline-none font-medium cursor-pointer"
          >
            <option value="ALL">Другие фильтры...</option>
            <option value="SYSTEM">Обратная связь (Идеи/Баги)</option>
            <option value="REVIEW">Отзывы (Reviews)</option>
            <option value="COMMENT">Комментарии</option>
            <option value="MESSAGE">Сообщения</option>
            <option value="USER">Пользователи</option>
            <option value="LIST">Списки</option>
            <option value="TIER_LIST">Tier Lists</option>
          </select>
        </div>
      </div>

      {/* Reports Count Summary */}
      <div className="text-xs sm:text-sm text-[#94A3B8] flex items-center justify-between px-1">
        <span>
          В списке: <strong className="text-[#F8FAFC]">{totalCount}</strong>{' '}
          {targetTypeFilter === 'SYSTEM' ? 'обращений' : 'записей'}
        </span>
        <span>
          Страница <strong className="text-[#F8FAFC]">{page}</strong> из{' '}
          <strong className="text-[#F8FAFC]">{totalPages}</strong>
        </span>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <RotateCw className="w-8 h-8 text-[#8B5CF6] animate-spin" />
          <span className="text-sm text-[#94A3B8] font-mono">Загрузка очереди модерации...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-400 text-sm bg-red-500/10 rounded-2xl border border-red-500/20">
          {error}
        </div>
      ) : reports.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#0B0D20] border border-[#1E2442] text-zinc-500 text-sm space-y-2">
          <ShieldCheck className="w-12 h-12 mx-auto text-emerald-500/40" />
          <p className="font-bold text-zinc-300 text-base">
            {targetTypeFilter === 'SYSTEM'
              ? 'Нет новых обращений пользователей'
              : 'В этой категории нет жалоб'}
          </p>
          <p className="text-xs sm:text-sm text-[#64748B]">
            {targetTypeFilter === 'SYSTEM'
              ? 'Все предложения, сообщения об ошибках и отзывы обработаны.'
              : 'Все обращения успешно обработаны или отсутствуют.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((r) => (
            <div
              key={r.id}
              className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#1E2442] transition-all space-y-4 shadow-lg"
            >
              {/* Header: Type, Reason, Status, Date */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#1E2442]/70">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-[#11152A] border border-[#1E2442]">
                    {getTargetIcon(r.targetType)}
                  </div>
                  <span className="font-bold text-sm sm:text-base text-[#F8FAFC]">
                    {r.targetType === 'SYSTEM'
                      ? `Обращение #${r.id} • ${
                          r.targetId === 'SUGGESTION'
                            ? '💡 Идея / Предложение'
                            : r.targetId === 'BUG'
                            ? '🐛 Баг / Ошибка'
                            : r.targetId === 'COMPLAINT'
                            ? '⚠️ Жалоба'
                            : 'Обратная связь'
                        }`
                      : `Жалоба #${r.id} на ${r.targetType}`}
                  </span>
                  {getReasonBadge(r.reason, r.targetType)}
                </div>

                <div className="flex items-center gap-3 text-xs sm:text-sm text-[#94A3B8]">
                  <span>
                    Отправитель:{' '}
                    <strong className="text-[#F8FAFC]">
                      {r.reporterUsername ? `@${r.reporterUsername}` : 'Аноним'}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>{new Date(r.createdAt).toLocaleString('ru-RU')}</span>
                </div>
              </div>

              {/* Reported Content / Entity Preview */}
              {r.targetType !== 'SYSTEM' && (
                <div className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442]/70 text-sm space-y-2.5">
                  <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider font-mono">
                    Проверяемый объект:
                  </div>

                  {r.preview ? (
                    <div className="space-y-2">
                      {r.preview.title && (
                        <div className="font-bold text-indigo-300 text-base">{r.preview.title}</div>
                      )}
                      {r.preview.text && (
                        <div className="text-[#F8FAFC] text-sm leading-relaxed whitespace-pre-wrap bg-[#0B0D20] p-3.5 rounded-xl border border-[#1E2442]">
                          «{r.preview.text}»
                        </div>
                      )}
                      {r.preview.isHidden && (
                        <div className="text-amber-400 text-xs flex items-center gap-1.5 font-semibold pt-1">
                          <EyeOff className="w-4 h-4" />
                          Данный объект уже скрыт модератором
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[#64748B] italic text-xs sm:text-sm">
                      Объект #{r.targetId} (исходный контент был удален или отсутствует)
                    </div>
                  )}
                </div>
              )}

              {/* Reporter's notes / Feedback description */}
              {r.description && (
                <div className="p-4 rounded-2xl bg-[#080A18] border border-[#1E2442] space-y-1.5">
                  <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider font-mono">
                    {r.targetType === 'SYSTEM' ? 'Текст сообщения / идеи:' : 'Пояснение заявителя:'}
                  </div>
                  <p className="text-sm text-[#CBD5E1] whitespace-pre-wrap leading-relaxed font-sans">
                    {r.description}
                  </p>
                </div>
              )}

              {/* Target Author info */}
              {r.targetUserId && (
                <div className="flex items-center justify-between text-xs sm:text-sm text-[#94A3B8] pt-1">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#8B5CF6]" />
                    <span>
                      Автор контента:{' '}
                      <strong className="text-[#F8FAFC]">
                        {r.targetUsername ? `@${r.targetUsername}` : `User #${r.targetUserId}`}
                      </strong>
                    </span>
                    {r.targetUserWarns > 0 && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-xs font-mono">
                        {r.targetUserWarns} предупр.
                      </span>
                    )}
                    {r.targetUserBlocked && (
                      <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-bold text-xs font-mono">
                        Заблокирован
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Resolution / Action Footer */}
              {r.targetType === 'SYSTEM' ? (
                <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2.5 border-t border-[#1E2442]/60">
                  {r.status === 'PENDING' && (
                    <button
                      onClick={() => handleChangeStatus(r.id, 'IN_REVIEW')}
                      className="h-10 px-4 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                    >
                      Взять в работу
                    </button>
                  )}
                  {['PENDING', 'IN_REVIEW'].includes(r.status) && (
                    <>
                      <button
                        onClick={() => handleChangeStatus(r.id, 'RESOLVED')}
                        className="h-10 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                      >
                        Решено
                      </button>
                      <button
                        onClick={() => handleChangeStatus(r.id, 'DISMISSED')}
                        className="h-10 px-4 rounded-xl bg-[#1E2442] hover:bg-[#322E45] text-xs sm:text-sm font-semibold text-[#F8FAFC] transition-colors cursor-pointer"
                      >
                        Закрыть
                      </button>
                    </>
                  )}
                  {['RESOLVED', 'DISMISSED'].includes(r.status) && (
                    <div className="p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs sm:text-sm text-[#94A3B8] flex items-center justify-between w-full">
                      <span className="text-emerald-400 font-bold">
                        Статус: {r.status === 'RESOLVED' ? 'Решено' : 'Закрыто'}
                      </span>
                      {r.resolvedAt && <span>{new Date(r.resolvedAt).toLocaleString('ru-RU')}</span>}
                    </div>
                  )}
                </div>
              ) : r.status === 'PENDING' ? (
                <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2.5 border-t border-[#1E2442]/60">
                  {/* Dismiss */}
                  <button
                    onClick={() => setActionModal({ report: r, actionType: 'DISMISS' })}
                    className="h-10 px-4 rounded-xl bg-[#11152A] border border-[#1E2442] hover:bg-[#1E2442] text-xs sm:text-sm font-semibold text-[#F8FAFC] transition-colors cursor-pointer"
                  >
                    Отклонить жалобу
                  </button>

                  {/* Hide content */}
                  <button
                    onClick={() => setActionModal({ report: r, actionType: 'HIDE_CONTENT' })}
                    className="h-10 px-4 rounded-xl bg-purple-900/40 hover:bg-purple-900/60 border border-purple-500/40 text-purple-200 text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <EyeOff className="w-4 h-4" />
                    Скрыть контент
                  </button>

                  {/* Warn user */}
                  {r.targetUserId && (
                    <button
                      onClick={() =>
                        setActionModal({
                          report: r,
                          actionType: 'WARN_USER',
                          warnReason: `Нарушение правил: ${r.reason}`,
                        })
                      }
                      className="h-10 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Предупредить автора
                    </button>
                  )}

                  {/* Ban user */}
                  {r.targetUserId && (
                    <button
                      onClick={() =>
                        setActionModal({ report: r, actionType: 'BAN_USER', banHours: '24' })
                      }
                      className="h-10 px-4 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Clock className="w-4 h-4" />
                      Временный бан
                    </button>
                  )}

                  {/* Block user permanently */}
                  {r.targetUserId && (
                    <button
                      onClick={() => setActionModal({ report: r, actionType: 'BLOCK_USER' })}
                      className="h-10 px-4 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Ban className="w-4 h-4" />
                      Заблокировать
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] text-xs sm:text-sm text-[#94A3B8] flex items-center justify-between">
                  <div>
                    <span className="text-emerald-400 font-bold">Рассмотрено: </span>
                    <span>Действие: {r.actionTaken || 'Решено'}</span>
                    {r.moderatorNotes && (
                      <span className="block text-xs text-[#64748B] mt-0.5 font-mono">
                        «{r.moderatorNotes}»
                      </span>
                    )}
                  </div>
                  {r.resolvedAt && <span>{new Date(r.resolvedAt).toLocaleString('ru-RU')}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Moderation Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-[#F8FAFC]">
              {actionModal.actionType === 'DISMISS' && 'Отклонить жалобу'}
              {actionModal.actionType === 'HIDE_CONTENT' && 'Скрыть контент из общего доступа'}
              {actionModal.actionType === 'WARN_USER' && 'Вынести предупреждение автору'}
              {actionModal.actionType === 'BAN_USER' && 'Временный бан автора'}
              {actionModal.actionType === 'BLOCK_USER' && 'Бессрочная блокировка аккаунта автора'}
            </h3>

            {actionModal.actionType === 'WARN_USER' && (
              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">Причина предупреждения:</label>
                <input
                  type="text"
                  value={actionModal.warnReason || ''}
                  onChange={(e) =>
                    setActionModal({ ...actionModal, warnReason: e.target.value })
                  }
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
                />
              </div>
            )}

            {actionModal.actionType === 'BAN_USER' && (
              <div>
                <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">Срок бана:</label>
                <select
                  value={actionModal.banHours || '24'}
                  onChange={(e) => setActionModal({ ...actionModal, banHours: e.target.value })}
                  className="w-full h-11 px-3.5 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
                >
                  <option value="6">6 часов</option>
                  <option value="24">24 часа (1 день)</option>
                  <option value="72">72 часа (3 дня)</option>
                  <option value="168">7 дней (1 неделя)</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-xs sm:text-sm text-[#94A3B8] font-semibold block mb-1.5">Заметка модератора (для аудита):</label>
              <textarea
                value={actionModal.moderatorNotes || ''}
                onChange={(e) =>
                  setActionModal({ ...actionModal, moderatorNotes: e.target.value })
                }
                placeholder="Пояснение принятого решения..."
                rows={2}
                className="w-full p-3 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] outline-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setActionModal(null)}
                className="h-11 px-5 rounded-xl bg-[#11152A] hover:bg-[#1E2442] text-sm font-semibold text-[#F8FAFC] border border-[#1E2442] transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={handleExecuteAction}
                disabled={actingReportId !== null}
                className="h-11 px-5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-sm font-bold text-white flex items-center gap-2 transition-colors cursor-pointer shadow-md"
              >
                {actingReportId !== null && <RotateCw className="w-4 h-4 animate-spin" />}
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
