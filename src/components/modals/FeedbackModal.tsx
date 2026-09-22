import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  AlertTriangle,
  Send,
  X,
  ShieldAlert,
  Sparkles,
  Lightbulb,
  ShieldCheck,
  Clock,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  Inbox,
  CornerDownRight,
  User,
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

interface UserFeedbackTicket {
  id: number;
  targetType: string;
  targetId: string;
  reason: string;
  description: string;
  status: string;
  moderatorComment: string | null;
  actionTaken: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
  lastReplyAt: string | null;
}

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTicketId?: number | null;
  initialTab?: 'my' | 'new';
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  initialTicketId = null,
  initialTab = 'new',
}) => {
  const { authFetch, dbUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'my' | 'new'>(initialTab);
  
  // New ticket state
  const [type, setType] = useState<'SUGGESTION' | 'BUG' | 'COMPLAINT'>('SUGGESTION');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // My tickets list state
  const [tickets, setTickets] = useState<UserFeedbackTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);

  // Active selected thread state
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(initialTicketId);
  const [selectedTicket, setSelectedTicket] = useState<UserFeedbackTicket | null>(null);
  const [replies, setReplies] = useState<ReportReply[]>([]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [userReplyText, setUserReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Fetch tickets list for current user
  const fetchMyTickets = useCallback(async () => {
    if (!dbUser) return;
    setIsLoadingTickets(true);
    try {
      const res = await authFetch('/api/feedback/my');
      if (res.ok) {
        const data = await res.json();
        setTickets(data.items || []);
      }
    } catch (err) {
      console.error('[FeedbackModal] Fetch tickets error:', err);
    } finally {
      setIsLoadingTickets(false);
    }
  }, [authFetch, dbUser]);

  // Load single thread details & messages
  const loadThread = useCallback(
    async (ticketId: number) => {
      setIsLoadingThread(true);
      try {
        const res = await authFetch(`/api/feedback/${ticketId}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedTicket(data.report);
          setReplies(data.replies || []);
        }
      } catch (err) {
        console.error('[FeedbackModal] Load thread error:', err);
      } finally {
        setIsLoadingThread(false);
      }
    },
    [authFetch]
  );

  // Synchronize initialTicketId / initialTab when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialTicketId) {
        setSelectedTicketId(initialTicketId);
        setActiveTab('my');
        loadThread(initialTicketId);
      } else {
        setSelectedTicketId(null);
        setActiveTab(initialTab);
      }
      if (dbUser) {
        fetchMyTickets();
      }
    }
  }, [isOpen, initialTicketId, initialTab, dbUser, fetchMyTickets, loadThread]);

  // Handle selecting a ticket from the list
  const handleSelectTicket = (t: UserFeedbackTicket) => {
    setSelectedTicketId(t.id);
    setSelectedTicket(t);
    loadThread(t.id);
  };

  // Handle Submitting a New Feedback Ticket
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await authFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'SYSTEM',
          targetId: type,
          reason: type === 'SUGGESTION' ? 'OTHER' : type === 'BUG' ? 'OTHER' : 'RULES_VIOLATION',
          description: description.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка отправки обращения');
      }

      setDescription('');
      await fetchMyTickets();

      // Switch to My Tickets and select the created ticket
      if (data.reportId) {
        setSelectedTicketId(data.reportId);
        loadThread(data.reportId);
        setActiveTab('my');
      } else {
        setActiveTab('my');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка при отправке сообщения. Попробуйте позже.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle user reply to thread
  const handleSendReply = async () => {
    if (!selectedTicketId || !userReplyText.trim()) return;

    setIsSubmittingReply(true);
    try {
      const res = await authFetch(`/api/feedback/${selectedTicketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userReplyText.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setReplies((prev) => [...prev, data.reply]);
        setUserReplyText('');
        // Refresh ticket status if reopened
        setSelectedTicket((prev) => (prev ? { ...prev, status: 'IN_REVIEW' } : null));
        fetchMyTickets();
      }
    } catch (err) {
      console.error('[FeedbackModal] Send reply error:', err);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  if (!isOpen) return null;

  const getCategoryBadge = (targetId: string) => {
    switch (targetId) {
      case 'BUG':
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Ошибка
          </span>
        );
      case 'COMPLAINT':
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" />
            Жалоба
          </span>
        );
      case 'SUGGESTION':
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            Идея
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Ожидает ответа
          </span>
        );
      case 'IN_REVIEW':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            В диалоге
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            Решено
          </span>
        );
      case 'DISMISSED':
      case 'REJECTED':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
            Закрыто
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-800 text-zinc-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-[#14131A] border border-[#252233] rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-fade-in-up">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#252233] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#191724] border border-[#252233] flex items-center justify-center text-[#AC82FF]">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#F3F1F8]">Служба поддержки и отзывов</h2>
              <p className="text-xs text-[#9A94AA]">Двухсторонний диалог с командой Dodik Tracker</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#252233] rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs (if logged in) */}
        {dbUser && !selectedTicketId && (
          <div className="flex items-center gap-2 p-3 bg-[#0F0E12] border-b border-[#252233] shrink-0">
            <button
              onClick={() => setActiveTab('my')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'my'
                  ? 'bg-[#9B6BFF] text-white shadow-lg shadow-[#9B6BFF]/20'
                  : 'text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#191724]'
              }`}
            >
              <Inbox className="w-4 h-4" />
              <span>Мои обращения</span>
              {tickets.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-white text-[10px]">
                  {tickets.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('new')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'new'
                  ? 'bg-[#9B6BFF] text-white shadow-lg shadow-[#9B6BFF]/20'
                  : 'text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#191724]'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Новое обращение</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
          {/* VIEW 1: Active Thread View (Single Ticket Conversation) */}
          {selectedTicketId ? (
            <div className="space-y-4">
              {/* Back to list button */}
              <div className="flex items-center justify-between pb-2 border-b border-[#252233]">
                <button
                  onClick={() => {
                    setSelectedTicketId(null);
                    setSelectedTicket(null);
                    setReplies([]);
                    fetchMyTickets();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#191724] hover:bg-[#252233] text-xs font-semibold text-[#F3F1F8] transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#AC82FF]" />
                  Все обращения
                </button>
                {selectedTicket && (
                  <div className="flex items-center gap-2">
                    {getCategoryBadge(selectedTicket.targetId)}
                    {getStatusBadge(selectedTicket.status)}
                  </div>
                )}
              </div>

              {isLoadingThread ? (
                <div className="p-10 text-center text-xs text-[#9A94AA] space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#AC82FF] mx-auto" />
                  <p>Загрузка переписки...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Original feedback message */}
                  <div className="p-4 rounded-2xl bg-[#191724] border border-[#2E2A40] space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#9A94AA]">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-[#252233] flex items-center justify-center text-[10px] text-[#AC82FF]">
                          <User className="w-3 h-3" />
                        </div>
                        <span className="font-bold text-[#F3F1F8]">Вы (Исходное сообщение)</span>
                      </div>
                      {selectedTicket && (
                        <span className="flex items-center gap-1 text-[11px]">
                          <Clock className="w-3 h-3" />
                          {new Date(selectedTicket.createdAt).toLocaleString('ru-RU')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[#F3F1F8] leading-relaxed whitespace-pre-wrap">
                      {selectedTicket?.description}
                    </p>
                  </div>

                  {/* Message Thread History */}
                  {replies.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="text-[11px] font-bold text-[#9A94AA] uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-[#AC82FF]" />
                        История ответов
                      </div>
                      {replies.map((reply) => (
                        <div
                          key={reply.id}
                          className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2 ${
                            reply.isAdminResponse
                              ? 'bg-purple-950/20 border-purple-500/30 text-[#F3F1F8]'
                              : 'bg-[#0F0E12] border-[#252233] text-[#F3F1F8]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] text-[#9A94AA]">
                            <div className="flex items-center gap-2">
                              {reply.isAdminResponse ? (
                                <span className="px-2 py-0.5 rounded-md bg-purple-500/30 text-purple-200 font-bold text-[10px] flex items-center gap-1">
                                  <ShieldCheck className="w-3.5 h-3.5 text-purple-300" />
                                  Ответ Администратора (@{reply.authorUsername || 'Администрация'})
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 font-bold text-[10px]">
                                  Вы (@{reply.authorUsername || dbUser?.username})
                                </span>
                              )}
                            </div>
                            <span>{new Date(reply.createdAt).toLocaleString('ru-RU')}</span>
                          </div>
                          <div className="text-sm text-[#F3F1F8] whitespace-pre-wrap">{reply.message}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* User Reply Box */}
                  <div className="p-4 rounded-2xl bg-[#0F0E12] border border-[#252233] space-y-3 pt-4">
                    <div className="text-xs font-bold text-[#F3F1F8] flex items-center gap-1.5">
                      <CornerDownRight className="w-3.5 h-3.5 text-[#AC82FF]" />
                      Написать ответ администратору
                    </div>
                    <textarea
                      value={userReplyText}
                      onChange={(e) => setUserReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      placeholder="Напишите уточнение или ответ на комментарий поддержки... (Ctrl+Enter для отправки)"
                      className="w-full h-24 p-3 bg-[#14131A] border border-[#252233] rounded-xl text-xs text-[#F3F1F8] placeholder-[#656075] outline-none focus:border-[#9B6BFF] transition-colors resize-none custom-scrollbar"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#656075]">Ваш ответ мгновенно поступит модераторам</span>
                      <button
                        type="button"
                        disabled={!userReplyText.trim() || isSubmittingReply}
                        onClick={handleSendReply}
                        className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {isSubmittingReply ? 'Отправка...' : 'Отправить'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'my' && dbUser ? (
            /* VIEW 2: My Tickets List */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#252233]">
                <h3 className="text-xs font-bold text-[#9A94AA] uppercase tracking-wider">
                  Ваши обращения ({tickets.length})
                </h3>
                <button
                  onClick={fetchMyTickets}
                  className="p-1.5 rounded-lg bg-[#0F0E12] hover:bg-[#191724] text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
                  title="Обновить"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTickets ? 'animate-spin text-[#AC82FF]' : ''}`} />
                </button>
              </div>

              {isLoadingTickets && tickets.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#9A94AA]">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#AC82FF] mx-auto mb-2" />
                  Загрузка списка обращений...
                </div>
              ) : tickets.length === 0 ? (
                <div className="p-8 text-center bg-[#0F0E12] border border-[#252233] rounded-2xl space-y-3">
                  <Inbox className="w-8 h-8 text-[#656075] mx-auto" />
                  <p className="text-sm font-bold text-[#F3F1F8]">У вас пока нет отправленных обращений</p>
                  <p className="text-xs text-[#9A94AA] max-w-sm mx-auto">
                    Вы можете отправить идею, сообщить об ошибке или задать вопрос администрации платформы.
                  </p>
                  <button
                    onClick={() => setActiveTab('new')}
                    className="px-4 py-2 rounded-xl bg-[#9B6BFF] hover:bg-[#8B58F8] text-white text-xs font-bold transition-colors"
                  >
                    Создать обращение
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {tickets.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => handleSelectTicket(t)}
                      className="p-4 rounded-2xl bg-[#0F0E12] border border-[#252233] hover:border-[#9B6BFF]/50 transition-all cursor-pointer space-y-2 group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {getCategoryBadge(t.targetId)}
                          {getStatusBadge(t.status)}
                          <span className="text-xs font-bold text-[#F3F1F8]">#{t.id}</span>
                        </div>
                        <span className="text-[11px] text-[#9A94AA]">
                          {new Date(t.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>

                      <p className="text-xs text-[#9A94AA] line-clamp-2 leading-relaxed group-hover:text-[#F3F1F8] transition-colors">
                        {t.description}
                      </p>

                      <div className="flex items-center justify-between pt-1 text-[11px] text-[#656075] border-t border-[#252233]/40">
                        <span className="flex items-center gap-1 text-[#AC82FF]">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {t.replyCount > 0
                            ? `${t.replyCount} сообщений в диалоге`
                            : t.moderatorComment
                            ? 'Есть ответ модератора'
                            : 'Ожидает рассмотрения'}
                        </span>
                        <span className="font-bold text-[#9B6BFF] group-hover:underline">Открыть диалог →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* VIEW 3: Create New Ticket Form */
            <form onSubmit={handleSubmit} className="space-y-5">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-[#9A94AA] uppercase tracking-wider">
                  Категория обращения
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('SUGGESTION')}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                      type === 'SUGGESTION'
                        ? 'bg-purple-500/10 border-purple-500/30 text-[#AC82FF]'
                        : 'bg-[#191724] border-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]'
                    }`}
                  >
                    <Lightbulb className={`w-5 h-5 ${type === 'SUGGESTION' ? 'text-purple-400' : ''}`} />
                    Идея
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('BUG')}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                      type === 'BUG'
                        ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                        : 'bg-[#191724] border-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]'
                    }`}
                  >
                    <AlertTriangle className={`w-5 h-5 ${type === 'BUG' ? 'text-orange-400' : ''}`} />
                    Ошибка
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('COMPLAINT')}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                      type === 'COMPLAINT'
                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                        : 'bg-[#191724] border-[#252233] text-[#9A94AA] hover:text-[#F3F1F8]'
                    }`}
                  >
                    <ShieldAlert className={`w-5 h-5 ${type === 'COMPLAINT' ? 'text-red-400' : ''}`} />
                    Жалоба
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[#9A94AA] uppercase tracking-wider">
                  Подробное описание
                </label>
                <textarea
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    type === 'SUGGESTION'
                      ? 'Опишите вашу идею по улучшению платформы Dodik Tracker...'
                      : type === 'BUG'
                      ? 'Где и при каких обстоятельствах возникла ошибка? Укажите шаги воспроизведения.'
                      : 'Опишите суть жалобы. Пожалуйста, укажите ссылки на контент, если применимо.'
                  }
                  className="w-full h-36 p-3 bg-[#0F0E12] border border-[#252233] rounded-xl text-sm text-[#F3F1F8] placeholder-[#656075] outline-none focus:border-[#9B6BFF] transition-colors resize-none custom-scrollbar"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#9A94AA] hover:text-[#F3F1F8] hover:bg-[#252233] transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !description.trim()}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#9B6BFF] text-white text-xs font-bold hover:bg-[#8B58F8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-purple-900/20"
                >
                  {isSubmitting ? 'Отправка...' : 'Отправить обращение'}
                  {!isSubmitting && <Send className="w-4 h-4" />}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
