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
      } else {
        setThreadsData((prev) => ({
          ...prev,
          [reportId]: { loading: false, replies: [] },
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
      const nextState = !prev[reportId];
      if (nextState && !threadsData[reportId]?.replies) {
        loadThreadReplies(reportId);
      }
      return { ...prev, [reportId]: nextState };
    });
  };

  const handleSendReply = async (reportId: number) => {
    const text = (replyDrafts[reportId] || '').trim();
    if (!text) return;

    const nextStatus = replyStatuses[reportId] || 'IN_REVIEW';
    setIsSubmittingReply((prev) => ({ ...prev, [reportId]: true }));

    try {
      const res = await authFetch(`/api/admin/reports/${reportId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          status: nextStatus,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Append new reply to thread
        setThreadsData((prev) => {
          const current = prev[reportId]?.replies || [];
          return {
            ...prev,
            [reportId]: {
              loading: false,
              replies: [...current, data.reply],
            },
          };
        });

        // Clear draft
        setReplyDrafts((prev) => ({ ...prev, [reportId]: '' }));

        // Update item status in list
        setItems((prev) =>
          prev.map((item) =>
            item.id === reportId
              ? {
                  ...item,
                  status: nextStatus,
                  moderatorComment: text,
                  moderatorUsername: dbUser?.username || item.moderatorUsername,
                  resolvedAt: nextStatus === 'RESOLVED' || nextStatus === 'DISMISSED' ? new Date().toISOString() : item.resolvedAt,
                }
              : item
          )
        );
      }
    } catch (err) {
      console.error('[AdminFeedback] Send reply error:', err);
    } finally {
      setIsSubmittingReply((prev) => ({ ...prev, [reportId]: false }));
    }
  };

  const handleQuickStatus = async (reportId: number, newStatus: string) => {
    try {
      const res = await authFetch(`/api/reports/${reportId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
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
          <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Баг / Ошибка
          </span>
        );
      case 'COMPLAINT':
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            Жалоба
          </span>
        );
      case 'SUGGESTION':
      default:
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" />
            Идея / Предложение
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Ожидает ответа
          </span>
        );
      case 'IN_REVIEW':
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            В процессе / Диалог
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            Решено
          </span>
        );
      case 'DISMISSED':
      case 'REJECTED':
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
            Закрыто
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-zinc-800 text-zinc-300">
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
    <div className="space-y-6">
      {/* Top Filter & Actions Bar */}
      <div className="p-4 rounded-2xl bg-[#14131A] border border-[#252233] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-[#252233] text-[#F3F1F8] border border-[#3A344E]'
                  : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
              }`}
            >
              Все
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-500 text-black'
                  : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
              }`}
            >
              Новые
            </button>
            <button
              onClick={() => setStatusFilter('IN_REVIEW')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                statusFilter === 'IN_REVIEW'
                  ? 'bg-blue-500 text-black'
                  : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
              }`}
            >
              В работе / Ответы
            </button>
            <button
              onClick={() => setStatusFilter('RESOLVED')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                statusFilter === 'RESOLVED'
                  ? 'bg-emerald-500 text-black'
                  : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
              }`}
            >
              Решено
            </button>
            <button
              onClick={() => setStatusFilter('DISMISSED')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                statusFilter === 'DISMISSED'
                  ? 'bg-zinc-700 text-white'
                  : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
              }`}
            >
              Закрытые
            </button>
          </div>

          <button
            onClick={fetchFeedback}
            className="p-2 bg-[#0F0E12] hover:bg-[#252233] border border-[#252233] rounded-xl text-[#9A94AA] hover:text-[#F3F1F8] transition-colors self-start sm:self-auto"
            title="Обновить"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#AC82FF]' : ''}`} />
          </button>
        </div>

        {/* Category Filter & Search */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-[#252233]">
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => setCategoryFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                categoryFilter === 'ALL'
                  ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40'
                  : 'bg-[#0F0E12] text-[#9A94AA]'
              }`}
            >
              Все категории
            </button>
            <button
              onClick={() => setCategoryFilter('SUGGESTION')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                categoryFilter === 'SUGGESTION'
                  ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40'
                  : 'bg-[#0F0E12] text-[#9A94AA]'
              }`}
            >
              Идеи
            </button>
            <button
              onClick={() => setCategoryFilter('BUG')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                categoryFilter === 'BUG'
                  ? 'bg-orange-500/20 text-orange-200 border border-orange-500/40'
                  : 'bg-[#0F0E12] text-[#9A94AA]'
              }`}
            >
              Ошибки
            </button>
            <button
              onClick={() => setCategoryFilter('COMPLAINT')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                categoryFilter === 'COMPLAINT'
                  ? 'bg-red-500/20 text-red-200 border border-red-500/40'
                  : 'bg-[#0F0E12] text-[#9A94AA]'
              }`}
            >
              Жалобы
            </button>
          </div>

          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#656075]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по тексту или автору..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] placeholder-[#656075] outline-none focus:border-[#9B6BFF] transition-colors"
            />
          </div>
        </div>
      </div>

      {/* List of Feedback Items */}
      {loading && items.length === 0 ? (
        <div className="p-12 text-center text-[#9A94AA] bg-[#14131A] rounded-2xl border border-[#252233] space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin text-[#AC82FF] mx-auto" />
          <p className="text-sm">Загрузка обратной связи...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center text-[#9A94AA] bg-[#14131A] rounded-2xl border border-[#252233] space-y-2">
          <MessageSquare className="w-8 h-8 text-[#656075] mx-auto opacity-50" />
          <p className="text-sm font-semibold text-[#F3F1F8]">Обращений не найдено</p>
          <p className="text-xs">Все отзывы и предложения в этой категории обработаны.</p>
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
                className="p-5 rounded-2xl bg-[#14131A] border border-[#252233] hover:border-[#3A344E] transition-all space-y-4 shadow-lg"
              >
                {/* Header info */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#252233]">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {getCategoryBadge(item.targetId)}
                    {getStatusBadge(item.status)}
                    <span className="text-xs font-bold text-[#F3F1F8]">Обращение #{item.id}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[#9A94AA]">
                    <div className="flex items-center gap-1.5">
                      {item.reporterAvatar ? (
                        <img
                          src={item.reporterAvatar}
                          alt={item.reporterUsername}
                          className="w-5 h-5 rounded-full object-cover border border-[#252233]"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-[#191724] border border-[#252233] flex items-center justify-center text-[10px] text-[#AC82FF]">
                          <User className="w-3 h-3" />
                        </div>
                      )}
                      <span className="font-semibold text-[#F3F1F8]">
                        {item.reporterUsername ? `@${item.reporterUsername}` : 'Анонимный пользователь'}
                      </span>
                    </div>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleString('ru-RU')}
                    </span>
                  </div>
                </div>

                {/* Original Feedback Message */}
                <div className="p-4 rounded-xl bg-[#0F0E12] border border-[#252233] text-sm text-[#F3F1F8] leading-relaxed whitespace-pre-wrap">
                  <div className="text-[11px] font-bold text-[#AC82FF] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Сообщение пользователя:
                  </div>
                  {item.description}
                </div>

                {/* Latest Mod Status / Quick Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleThread(item.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#191724] hover:bg-[#252233] border border-[#2E2A40] text-xs font-bold text-[#F3F1F8] flex items-center gap-2 transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#AC82FF]" />
                      {isExpanded ? 'Скрыть переписку' : 'Открыть переписку / Ответить'}
                      {replies.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-md bg-[#9B6BFF]/20 text-[#AC82FF] text-[10px]">
                          {replies.length}
                        </span>
                      )}
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {item.status !== 'RESOLVED' && (
                      <button
                        onClick={() => handleQuickStatus(item.id, 'RESOLVED')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Пометить как Решено
                      </button>
                    )}
                  </div>

                  {item.moderatorUsername && (
                    <div className="text-[11px] text-[#9A94AA] flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                      Модератор: <span className="font-semibold text-[#F3F1F8]">@{item.moderatorUsername}</span>
                    </div>
                  )}
                </div>

                {/* Thread & Reply Box Section */}
                {isExpanded && (
                  <div className="pt-4 border-t border-[#252233] space-y-4 animate-fade-in-up">
                    <div className="text-xs font-bold text-[#9A94AA] uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-[#AC82FF]" />
                      История диалога
                    </div>

                    {/* Messages History */}
                    {thread?.loading ? (
                      <div className="p-6 text-center text-xs text-[#9A94AA]">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#AC82FF] mx-auto mb-2" />
                        Загрузка сообщений...
                      </div>
                    ) : replies.length === 0 ? (
                      <div className="p-4 rounded-xl bg-[#0F0E12] border border-[#252233] text-xs text-[#9A94AA] text-center">
                        Ответов пока нет. Вы можете быть первым, кто ответит пользователю.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {replies.map((reply) => (
                          <div
                            key={reply.id}
                            className={`p-3.5 rounded-xl border text-xs leading-relaxed space-y-1.5 ${
                              reply.isAdminResponse
                                ? 'bg-purple-950/20 border-purple-500/30 text-[#F3F1F8] ml-4'
                                : 'bg-[#0F0E12] border-[#252233] text-[#F3F1F8] mr-4'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] text-[#9A94AA]">
                              <div className="flex items-center gap-1.5">
                                {reply.isAdminResponse ? (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-200 font-bold text-[10px] flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3 text-purple-300" />
                                    Администрация
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold text-[10px]">
                                    Пользователь
                                  </span>
                                )}
                                <span className="font-semibold text-[#F3F1F8]">
                                  {reply.authorUsername ? `@${reply.authorUsername}` : 'Участник'}
                                </span>
                              </div>
                              <span>{new Date(reply.createdAt).toLocaleString('ru-RU')}</span>
                            </div>
                            <div className="whitespace-pre-wrap text-sm text-[#F3F1F8]">{reply.message}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Admin Reply Input Box */}
                    <div className="p-4 rounded-xl bg-[#191724] border border-[#2E2A40] space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-[#F3F1F8]">
                        <span className="flex items-center gap-1.5">
                          <CornerDownRight className="w-4 h-4 text-[#AC82FF]" />
                          Ответить пользователю
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#9A94AA]">Установить статус:</span>
                          <select
                            value={replyStatuses[item.id] || (item.status === 'PENDING' ? 'IN_REVIEW' : item.status)}
                            onChange={(e) =>
                              setReplyStatuses((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            className="bg-[#0F0E12] border border-[#252233] rounded-lg px-2.5 py-1 text-xs text-[#F3F1F8] outline-none"
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
                        className="w-full h-24 p-3 bg-[#0F0E12] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] placeholder-[#656075] outline-none focus:border-[#9B6BFF] transition-colors resize-none custom-scrollbar"
                      />

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#656075]">
                          Пользователь получит уведомление <code className="text-[#AC82FF]">FEEDBACK_REPLIED</code>
                        </span>
                        <button
                          type="button"
                          disabled={!draft.trim() || isSubmitting}
                          onClick={() => handleSendReply(item.id)}
                          className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-purple-900/20"
                        >
                          <Send className="w-3.5 h-3.5" />
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
