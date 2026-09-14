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
        body: JSON.stringify({ status: newStatus })
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
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
          ОБРАТНАЯ СВЯЗЬ
        </span>
      );
    }
    switch (reason) {
      case 'SPAM':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300">СПАМ</span>;
      case 'HARASSMENT':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-500/20 text-red-300">ОСКОРБЛЕНИЯ</span>;
      case 'NSFW':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-300">18+ / NSFW</span>;
      case 'SPOILER':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/20 text-purple-300">СПОЙЛЕР</span>;
      case 'RULES_VIOLATION':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300">ПРАВИЛА</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-800 text-zinc-300">{reason}</span>;
    }
  };

  const getTargetIcon = (type: string) => {
    switch (type) {
      case 'REVIEW':
        return <FileText className="w-4 h-4 text-emerald-400" />;
      case 'COMMENT':
        return <MessageSquare className="w-4 h-4 text-blue-400" />;
      case 'USER':
        return <User className="w-4 h-4 text-purple-400" />;
      case 'LIST':
      case 'TIER_LIST':
        return <Layers className="w-4 h-4 text-amber-400" />;
      case 'SYSTEM':
        return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      default:
        return <Film className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#14131A] border border-[#252233]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setStatusFilter('PENDING'); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              statusFilter === 'PENDING'
                ? 'bg-amber-500 text-black'
                : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
            }`}
          >
            Новые жалобы
          </button>
          <button
            onClick={() => { setStatusFilter('IN_REVIEW'); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              statusFilter === 'IN_REVIEW'
                ? 'bg-blue-500 text-black'
                : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
            }`}
          >
            В работе
          </button>
          <button
            onClick={() => { setStatusFilter('RESOLVED'); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              statusFilter === 'RESOLVED'
                ? 'bg-emerald-500 text-black'
                : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
            }`}
          >
            Решено
          </button>
          <button
            onClick={() => { setStatusFilter('DISMISSED'); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              statusFilter === 'DISMISSED'
                ? 'bg-zinc-700 text-white'
                : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
            }`}
          >
            Отклонённые
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => { setTargetTypeFilter('ALL'); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              targetTypeFilter === 'ALL'
                ? 'bg-[#252233] text-[#F3F1F8] border border-[#3A344E]'
                : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
            }`}
          >
            Все типы
          </button>
          <button
            onClick={() => { setTargetTypeFilter('SYSTEM'); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              targetTypeFilter === 'SYSTEM'
                ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40'
                : 'bg-[#0F0E12] text-[#9A94AA] hover:text-purple-300'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
            Обратная связь
          </button>
          <select
            value={targetTypeFilter}
            onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
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
      <div className="text-xs text-[#9A94AA] flex items-center justify-between px-1">
        <span>В списке: <strong className="text-[#F3F1F8]">{totalCount}</strong> {targetTypeFilter === 'SYSTEM' ? 'обращений' : 'записей'}</span>
        <span>Страница {page} из {totalPages}</span>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <RotateCw className="w-6 h-6 text-[#9B6BFF] animate-spin" />
          <span className="text-xs text-[#9A94AA]">Загрузка очереди модерации...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-400 text-xs bg-red-500/10 rounded-2xl border border-red-500/20">{error}</div>
      ) : reports.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#14131A] border border-[#252233] text-zinc-500 text-xs space-y-2">
          <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500/40" />
          <p className="font-semibold text-zinc-400">
            {targetTypeFilter === 'SYSTEM' ? 'Нет новых обращений пользователей' : 'В этой категории нет жалоб'}
          </p>
          <p className="text-[11px]">
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
              className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] hover:border-[#3A344E] transition-all space-y-4"
            >
              {/* Header: Type, Reason, Status, Date */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#252233]/70">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-[#0F0E12] border border-[#252233]">
                    {getTargetIcon(r.targetType)}
                  </div>
                  <span className="font-bold text-xs text-[#F3F1F8]">
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

                <div className="flex items-center gap-3 text-xs text-[#9A94AA]">
                  <span>
                    Отправитель:{' '}
                    <strong className="text-[#F3F1F8]">
                      {r.reporterUsername ? `@${r.reporterUsername}` : 'Аноним'}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>{new Date(r.createdAt).toLocaleString('ru-RU')}</span>
                </div>
              </div>

              {/* Reported Content / Entity Preview */}
              {r.targetType !== 'SYSTEM' && (
                <div className="p-3.5 rounded-xl bg-[#0F0E12] border border-[#252233]/70 text-xs space-y-2">
                  <div className="text-[11px] font-bold text-[#656075] uppercase tracking-wider">
                    Проверяемый объект:
                  </div>

                  {r.preview ? (
                    <div className="space-y-1">
                      {r.preview.title && (
                        <div className="font-bold text-indigo-300 text-sm">{r.preview.title}</div>
                      )}
                      {r.preview.text && (
                        <div className="text-[#F3F1F8] leading-relaxed whitespace-pre-wrap bg-[#14131A] p-3 rounded-lg border border-[#252233]">
                          «{r.preview.text}»
                        </div>
                      )}
                      {r.preview.isHidden && (
                        <div className="text-amber-400 text-[11px] flex items-center gap-1 font-semibold pt-1">
                          <EyeOff className="w-3.5 h-3.5" />
                          Данный объект уже скрыт модератором
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[#656075] italic">
                      Объект #{r.targetId} (исходный контент был удален или отсутствует)
                    </div>
                  )}
                </div>
              )}

              {/* Reporter's notes / Feedback description */}
              {r.description && (
                <div
                  className={`text-xs p-3.5 rounded-xl ${
                    r.targetType === 'SYSTEM'
                      ? 'bg-[#191724] border border-[#2E2A40] text-[#F3F1F8]'
                      : 'bg-amber-500/5 border border-amber-500/20 text-amber-200/90'
                  }`}
                >
                  <span
                    className={`font-bold block mb-1 ${
                      r.targetType === 'SYSTEM' ? 'text-[#AC82FF]' : 'text-amber-300'
                    }`}
                  >
                    {r.targetType === 'SYSTEM' ? 'Текст обращения:' : 'Комментарий заявителя:'}
                  </span>
                  <p className="whitespace-pre-wrap leading-relaxed">{r.description}</p>
                </div>
              )}

              {/* Target User Info & History */}
              {r.targetUsername && (
                <div className="flex items-center justify-between text-xs text-[#9A94AA] pt-1">
                  <div className="flex items-center gap-2">
                    <span>Автор контента:</span>
                    <span className="font-bold text-[#F3F1F8]">@{r.targetUsername}</span>
                    {r.targetUserWarnings > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">
                        {r.targetUserWarnings} пред.
                      </span>
                    )}
                    {r.targetUserBlocked && (
                      <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold text-[10px]">
                        Заблокирован
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Resolution / Action Footer */}
              {r.targetType === 'SYSTEM' ? (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#252233]/60">
                  {r.status === 'PENDING' && (
                    <button
                      onClick={() => handleChangeStatus(r.id, 'IN_REVIEW')}
                      className="px-3 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 text-xs font-bold transition-colors"
                    >
                      Взять в работу
                    </button>
                  )}
                  {['PENDING', 'IN_REVIEW'].includes(r.status) && (
                    <>
                      <button
                        onClick={() => handleChangeStatus(r.id, 'RESOLVED')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-colors"
                      >
                        Решено
                      </button>
                      <button
                        onClick={() => handleChangeStatus(r.id, 'DISMISSED')}
                        className="px-3 py-1.5 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8] transition-colors"
                      >
                        Закрыть
                      </button>
                    </>
                  )}
                  {['RESOLVED', 'DISMISSED'].includes(r.status) && (
                    <div className="p-2 rounded-lg bg-[#0F0E12] border border-[#252233] text-xs text-[#9A94AA] flex items-center justify-between w-full">
                      <span className="text-emerald-400 font-bold">Статус: {r.status === 'RESOLVED' ? 'Решено' : 'Закрыто'}</span>
                      {r.resolvedAt && <span>{new Date(r.resolvedAt).toLocaleString('ru-RU')}</span>}
                    </div>
                  )}
                </div>
              ) : r.status === 'PENDING' ? (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#252233]/60">
                  {/* Dismiss */}
                  <button
                    onClick={() => setActionModal({ report: r, actionType: 'DISMISS' })}
                    className="px-3 py-1.5 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8] transition-colors"
                  >
                    Отклонить жалобу
                  </button>

                  {/* Hide content */}
                  <button
                    onClick={() => setActionModal({ report: r, actionType: 'HIDE_CONTENT' })}
                    className="px-3 py-1.5 rounded-xl bg-purple-900/40 hover:bg-purple-900/60 border border-purple-500/40 text-purple-200 text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    Скрыть контент
                  </button>

                  {/* Warn user */}
                  {r.targetUserId && (
                    <button
                      onClick={() => setActionModal({ report: r, actionType: 'WARN_USER', warnReason: `Нарушение правил: ${r.reason}` })}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Предупредить автора
                    </button>
                  )}

                  {/* Ban user */}
                  {r.targetUserId && (
                    <button
                      onClick={() => setActionModal({ report: r, actionType: 'BAN_USER', banHours: '24' })}
                      className="px-3 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Временный бан
                    </button>
                  )}

                  {/* Block user permanently */}
                  {r.targetUserId && (
                    <button
                      onClick={() => setActionModal({ report: r, actionType: 'BLOCK_USER' })}
                      className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Заблокировать
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233] text-xs text-[#9A94AA] flex items-center justify-between">
                  <div>
                    <span className="text-emerald-400 font-bold">Рассмотрено: </span>
                    <span>Действие: {r.actionTaken || 'Решено'}</span>
                    {r.moderatorNotes && <span className="block text-[11px] text-[#656075] mt-0.5">«{r.moderatorNotes}»</span>}
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
          <div className="w-full max-w-md bg-[#14131A] border border-[#252233] rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#F3F1F8]">
              {actionModal.actionType === 'DISMISS' && 'Отклонить жалобу'}
              {actionModal.actionType === 'HIDE_CONTENT' && 'Скрыть контент из общего доступа'}
              {actionModal.actionType === 'WARN_USER' && 'Вынести предупреждение автору'}
              {actionModal.actionType === 'BAN_USER' && 'Временный бан автора'}
              {actionModal.actionType === 'BLOCK_USER' && 'Бессрочная блокировка аккаунта автора'}
            </h3>

            {actionModal.actionType === 'WARN_USER' && (
              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Причина предупреждения:</label>
                <input
                  type="text"
                  value={actionModal.warnReason || ''}
                  onChange={(e) => setActionModal({ ...actionModal, warnReason: e.target.value })}
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                />
              </div>
            )}

            {actionModal.actionType === 'BAN_USER' && (
              <div>
                <label className="text-xs text-[#9A94AA] block mb-1">Срок бана:</label>
                <select
                  value={actionModal.banHours || '24'}
                  onChange={(e) => setActionModal({ ...actionModal, banHours: e.target.value })}
                  className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
                >
                  <option value="6">6 часов</option>
                  <option value="24">24 часа (1 день)</option>
                  <option value="72">72 часа (3 дня)</option>
                  <option value="168">7 дней (1 неделя)</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-xs text-[#9A94AA] block mb-1">Заметка модератора (для аудита):</label>
              <textarea
                value={actionModal.moderatorNotes || ''}
                onChange={(e) => setActionModal({ ...actionModal, moderatorNotes: e.target.value })}
                placeholder="Пояснение принятого решения..."
                rows={2}
                className="w-full p-2.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8]"
              >
                Отмена
              </button>
              <button
                onClick={handleExecuteAction}
                disabled={actingReportId !== null}
                className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-xs font-bold text-white flex items-center gap-1.5"
              >
                {actingReportId !== null && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
