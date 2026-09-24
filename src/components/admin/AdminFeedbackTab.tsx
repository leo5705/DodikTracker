import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Lightbulb,
  AlertTriangle,
  ShieldAlert,
  Send,
  CheckCircle2,
  Clock,
  User,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface ReportReply {
  id: number;
  reportId: number;
  authorUserId: number | null;
  message: string;
  isAdminResponse: boolean;
  createdAt: string;
  authorUsername?: string;
  authorAvatar?: string;
  authorRole?: string;
}

interface FeedbackItem {
  id: number;
  targetType: string;
  targetId: string;
  targetUserId: number | null;
  reason: string;
  description: string;
  status: string;
  moderatorComment: string | null;
  actionTaken: string | null;
  resolvedAt: string | null;
  createdAt: string;
  reporterUsername: string;
  reporterAvatar: string | null;
  moderatorUsername: string | null;
  replyCount?: number;
}

export const AdminFeedbackTab: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Expanded threads cache: reportId -> replies[]
  const [expandedThreads, setExpandedThreads] = useState<Record<number, boolean>>({});
  const [threadsData, setThreadsData] = useState<Record<number, { loading: boolean; replies: ReportReply[] }>>({});

  // Reply inputs: reportId -> text
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [replyStatuses, setReplyStatuses] = useState<Record<number, string>>({});
  const [isSubmittingReply, setIsSubmittingReply] = useState<Record<number, boolean>>({});

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        targetType: 'SYSTEM',
        status: statusFilter,
        limit: '50',
      });
      const res = await authFetch(`/api/admin/reports?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('[AdminFeedback] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, statusFilter]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const loadThreadReplies = async (reportId: number) => {
    setThreadsData((prev) => ({
      ...prev,
      [reportId]: { loading: true, replies: prev[reportId]?.replies || [] },
    }));

    try {
      const res = await authFetch(`/api/feedback/${reportId}`);
      if (res.ok) {
        const data = await res.json();
        setThreadsData((prev) => ({
          ...prev,
          [reportId]: { loading: false, replies: data.replies || [] },
        }));
      }
    } catch (err) {
      console.error('[AdminFeedback] Load replies error:', err);
      setThreadsData((prev) => ({
        ...prev,
        [reportId]: { loading: false, replies: [] },
      }));
    }
  };

  const toggleThread = (reportId: number) => {
    setExpandedThreads((prev) => {
      const next = !prev[reportId];
      if (next && !threadsData[reportId]?.replies?.length) {
        loadThreadReplies(reportId);
      }
      return { ...prev, [reportId]: next };
    });
  };

  const handleSendReply = async (reportId: number) => {
    const draft = replyDrafts[reportId]?.trim();
    if (!draft) return;

    const newStatus = replyStatuses[reportId] || 'IN_REVIEW';
    setIsSubmittingReply((prev) => ({ ...prev, [reportId]: true }));

    try {
      const res = await authFetch(`/api/feedback/${reportId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: draft,
          newStatus: newStatus,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setReplyDrafts((prev) => ({ ...prev, [reportId]: '' }));

        // Refresh thread replies
        await loadThreadReplies(reportId);

        // Update main item status in state
        setItems((prev) =>
          prev.map((item) =>
            item.id === reportId
              ? {
                  ...item,
                  status: newStatus,
                  resolvedAt: newStatus === 'RESOLVED' || newStatus === 'DISMISSED' ? new Date().toISOString() : null,
                  moderatorUsername: dbUser?.username || item.moderatorUsername,
                }
              : item
          )
        );
      }
    } catch (err) {
      console.error('[AdminFeedback] Reply error:', err);
    } finally {
      setIsSubmittingReply((prev) => ({ ...prev, [reportId]: false }));
    }
  };

  const handleQuickStatus = async (reportId: number, newStatus: string) => {
    try {
      const res = await authFetch(`/api/admin/reports/${reportId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionTaken: newStatus,
          status: newStatus,
        }),
      });

      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === reportId
              ? {
                  ...item,
                  status: newStatus,
                  resolvedAt: newStatus === 'RESOLVED' || newStatus === 'DISMISSED' ? new Date().toISOString() : null,
                }
              : item
          )
        );
      }
    } catch (err) {
      console.error('[AdminFeedback] Quick status error:', err);
    }
  };

  const getCategoryBadge = (targetId: string) => {
    switch (targetId) {
      case 'BUG':
        return (
          <span className="px-3 py-1 rounded-xl text-xs font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            Баг / Ошибка
          </span>
        );
      case 'COMPLAINT':
        return (
          <span className="px-3 py-1 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4" />
            Жалоба
          </span>
        );
      case 'SUGGESTION':
      default:
        return (
          <span className="px-3 py-1 rounded-xl text-xs font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-1.5">
            <Lightbulb className="w-4 h-4" />
            Идея / Предложение
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Ожидает ответа
          </span>
        );
      case 'IN_REVIEW':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            В процессе / Диалог
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            Решено
          </span>
        );
      case 'DISMISSED':
      case 'REJECTED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#11152A] text-zinc-400 border border-[#1E2442]">
            Закрыто
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#11152A] text-zinc-300 border border-[#1E2442]">
            {status}
          </span>
        );
    }
  };

  const filteredItems = items.filter((item) => {
    if (categoryFilter !== 'ALL' && item.targetId !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = (item.description || '').toLowerCase().includes(q);
      const matchUser = (item.reporterUsername || '').toLowerCase().includes(q);
      const matchMod = (item.moderatorUsername || '').toLowerCase().includes(q);
      if (!matchText && !matchUser && !matchMod) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      {/* Top Filter & Actions Bar */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`h-11 px-4 rounded-2xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-[#1E2442] text-[#F8FAFC] border border-[#1E2442]'
                  : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              Все
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`h-11 px-4 rounded-2xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              Новые
            </button>
            <button
              onClick={() => setStatusFilter('IN_REVIEW')}
              className={`h-11 px-4 rounded-2xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                statusFilter === 'IN_REVIEW'
                  ? 'bg-blue-500 text-black shadow-md'
                  : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              В работе / Ответы
            </button>
            <button
              onClick={() => setStatusFilter('RESOLVED')}
              className={`h-11 px-4 rounded-2xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                statusFilter === 'RESOLVED'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              Решено
            </button>
            <button
              onClick={() => setStatusFilter('DISMISSED')}
              className={`h-11 px-4 rounded-2xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                statusFilter === 'DISMISSED'
                  ? 'bg-zinc-700 text-white'
                  : 'bg-[#11152A] text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              Закрытые
            </button>
          </div>

          <button
            onClick={fetchFeedback}
            className="h-11 w-11 flex items-center justify-center bg-[#11152A] hover:bg-[#1E2442] border border-[#1E2442] rounded-2xl text-[#94A3B8] hover:text-[#F8FAFC] transition-colors self-start sm:self-auto cursor-pointer"
            title="Обновить"
          >
            <RefreshCw className={`w-4.5 h-4.5 ${loading ? 'animate-spin text-[#A78BFA]' : ''}`} />
          </button>
        </div>

        {/* Category Filter & Search */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-[#1E2442]">
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <button
              onClick={() => setCategoryFilter('ALL')}
              className={`h-10 px-3.5 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer ${
                categoryFilter === 'ALL'
                  ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40'
                  : 'bg-[#11152A] text-[#94A3B8] border border-[#1E2442]'
              }`}
            >
              Все категории
            </button>
            <button
              onClick={() => setCategoryFilter('SUGGESTION')}
              className={`h-10 px-3.5 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer ${
                categoryFilter === 'SUGGESTION'
                  ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40'
                  : 'bg-[#11152A] text-[#94A3B8] border border-[#1E2442]'
              }`}
            >
              Идеи
            </button>
            <button
              onClick={() => setCategoryFilter('BUG')}
              className={`h-10 px-3.5 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer ${
                categoryFilter === 'BUG'
                  ? 'bg-orange-500/20 text-orange-200 border border-orange-500/40'
                  : 'bg-[#11152A] text-[#94A3B8] border border-[#1E2442]'
              }`}
            >
              Ошибки
            </button>
            <button
              onClick={() => setCategoryFilter('COMPLAINT')}
              className={`h-10 px-3.5 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer ${
                categoryFilter === 'COMPLAINT'
                  ? 'bg-red-500/20 text-red-200 border border-red-500/40'
                  : 'bg-[#11152A] text-[#94A3B8] border border-[#1E2442]'
              }`}
            >
              Жалобы
            </button>
          </div>

          <div className="relative flex-1 w-full">
            <Search className="w-4.5 h-4.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по тексту или автору..."
              className="w-full h-11 pl-10 pr-4 bg-[#11152A] border border-[#1E2442] rounded-xl text-sm text-[#F8FAFC] placeholder-[#64748B] outline-none focus:border-[#8B5CF6] transition-colors"
            />
          </div>
        </div>
      </div>

      {/* List of Feedback Items */}
      {loading && items.length === 0 ? (
        <div className="p-16 text-center text-[#94A3B8] bg-[#0B0D20] rounded-3xl border border-[#1E2442] space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-[#A78BFA] mx-auto" />
          <p className="text-base font-semibold">Загрузка обратной связи...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-16 text-center text-[#94A3B8] bg-[#0B0D20] rounded-3xl border border-[#1E2442] space-y-3">
          <MessageSquare className="w-10 h-10 text-[#64748B] mx-auto opacity-50" />
          <p className="text-base font-bold text-[#F8FAFC]">Обращений не найдено</p>
          <p className="text-xs sm:text-sm">Все отзывы и предложения в этой категории обработаны.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const isExpanded = !!expandedThreads[item.id];
            const thread = threadsData[item.id];
            const replies = thread?.replies || [];
            const draft = replyDrafts[item.id] || '';
            const isSubmitting = isSubmittingReply[item.id] || false;

            return (
              <div
                key={item.id}
                className="p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-all space-y-4 shadow-lg"
              >
                {/* Header info */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#1E2442]">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {getCategoryBadge(item.targetId)}
                    {getStatusBadge(item.status)}
                    <span className="text-sm font-bold text-[#F8FAFC]">Обращение #{item.id}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs sm:text-sm text-[#94A3B8]">
                    <div className="flex items-center gap-2">
                      {item.reporterAvatar ? (
                        <img
                          src={item.reporterAvatar}
                          alt={item.reporterUsername}
                          className="w-6 h-6 rounded-full object-cover border border-[#1E2442]"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-[#11152A] border border-[#1E2442] flex items-center justify-center text-xs text-[#A78BFA]">
                          <User className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <span className="font-semibold text-[#F8FAFC]">
                        {item.reporterUsername ? `@${item.reporterUsername}` : 'Анонимный пользователь'}
                      </span>
                    </div>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-mono text-xs">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(item.createdAt).toLocaleString('ru-RU')}
                    </span>
                  </div>
                </div>

                {/* Original Feedback Message */}
                <div className="p-4 sm:p-5 rounded-2xl bg-[#11152A] border border-[#1E2442] text-sm text-[#F8FAFC] leading-relaxed whitespace-pre-wrap font-sans">
                  <div className="text-xs font-bold text-[#A78BFA] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4" />
                    Сообщение пользователя:
                  </div>
                  {item.description}
                </div>

                {/* Latest Mod Status / Quick Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      onClick={() => toggleThread(item.id)}
                      className="h-11 px-4 rounded-2xl bg-[#11152A] hover:bg-[#1E2442] border border-[#1E2442] text-xs sm:text-sm font-bold text-[#F8FAFC] flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4 text-[#A78BFA]" />
                      {isExpanded ? 'Скрыть переписку' : 'Открыть переписку / Ответить'}
                      {replies.length > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-[#8B5CF6]/20 text-[#A78BFA] text-xs font-mono font-bold">
                          {replies.length}
                        </span>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {item.status !== 'RESOLVED' && (
                      <button
                        onClick={() => handleQuickStatus(item.id, 'RESOLVED')}
                        className="h-11 px-4 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Пометить как Решено
                      </button>
                    )}
                  </div>

                  {item.moderatorUsername && (
                    <div className="text-xs sm:text-sm text-[#94A3B8] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-purple-400" />
                      Модератор: <span className="font-semibold text-[#F8FAFC]">@{item.moderatorUsername}</span>
                    </div>
                  )}
                </div>

                {/* Thread & Reply Box Section */}
                {isExpanded && (
                  <div className="pt-4 border-t border-[#1E2442] space-y-4 animate-fade-in-up">
                    <div className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#A78BFA]" />
                      История диалога
                    </div>

                    {/* Messages History */}
                    {thread?.loading ? (
                      <div className="p-8 text-center text-sm text-[#94A3B8]">
                        <RefreshCw className="w-5 h-5 animate-spin text-[#A78BFA] mx-auto mb-2" />
                        Загрузка сообщений...
                      </div>
                    ) : replies.length === 0 ? (
                      <div className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] text-xs sm:text-sm text-[#94A3B8] text-center">
                        Ответов пока нет. Вы можете быть первым, кто ответит пользователю.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {replies.map((reply) => (
                          <div
                            key={reply.id}
                            className={`p-4 rounded-2xl border text-sm leading-relaxed space-y-2 ${
                              reply.isAdminResponse
                                ? 'bg-purple-950/20 border-purple-500/30 text-[#F8FAFC] ml-4'
                                : 'bg-[#11152A] border-[#1E2442] text-[#F8FAFC] mr-4'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                              <div className="flex items-center gap-2">
                                {reply.isAdminResponse ? (
                                  <span className="px-2 py-0.5 rounded bg-purple-500/30 text-purple-200 font-bold text-xs flex items-center gap-1">
                                    <ShieldCheck className="w-3.5 h-3.5 text-purple-300" />
                                    Администрация
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold text-xs">
                                    Пользователь
                                  </span>
                                )}
                                <span className="font-semibold text-[#F8FAFC]">
                                  {reply.authorUsername ? `@${reply.authorUsername}` : 'Участник'}
                                </span>
                              </div>
                              <span className="font-mono text-xs">{new Date(reply.createdAt).toLocaleString('ru-RU')}</span>
                            </div>
                            <div className="whitespace-pre-wrap text-sm text-[#F8FAFC]">{reply.message}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Admin Reply Input Box */}
                    <div className="p-5 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-3.5">
                      <div className="flex items-center justify-between text-sm font-bold text-[#F8FAFC] flex-wrap gap-2">
                        <span className="flex items-center gap-2">
                          <CornerDownRight className="w-4 h-4 text-[#A78BFA]" />
                          Ответить пользователю
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#94A3B8] font-semibold">Установить статус:</span>
                          <select
                            value={replyStatuses[item.id] || (item.status === 'PENDING' ? 'IN_REVIEW' : item.status)}
                            onChange={(e) =>
                              setReplyStatuses((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            className="bg-[#0B0D20] border border-[#1E2442] rounded-xl px-3 py-1.5 text-xs text-[#F8FAFC] outline-none font-medium"
                          >
                            <option value="IN_REVIEW">В процессе / В работе</option>
                            <option value="RESOLVED">Решено (Завершить)</option>
                            <option value="DISMISSED">Отклонить / Закрыть</option>
                          </select>
                        </div>
                      </div>

                      <textarea
                        value={draft}
                        onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault();
                            handleSendReply(item.id);
                          }
                        }}
                        placeholder="Введите ваш официальный ответ. Пользователь получит уведомление на сайте и в Telegram (если подключен)... (Ctrl+Enter для отправки)"
                        className="w-full h-28 p-3.5 bg-[#0B0D20] border border-[#1E2442] rounded-2xl text-sm text-[#F8FAFC] placeholder-[#64748B] outline-none focus:border-[#8B5CF6] transition-colors resize-none custom-scrollbar"
                      />

                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs text-[#64748B]">
                          Пользователь получит уведомление <code className="text-[#A78BFA] font-mono">FEEDBACK_REPLIED</code>
                        </span>
                        <button
                          type="button"
                          disabled={!draft.trim() || isSubmitting}
                          onClick={() => handleSendReply(item.id)}
                          className="h-11 px-6 rounded-2xl bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-50 text-white text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-purple-900/20 cursor-pointer"
                        >
                          <Send className="w-4 h-4" />
                          {isSubmitting ? 'Отправка...' : 'Отправить ответ'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
