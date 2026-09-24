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
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Ошибка
          </span>
        );
      case 'COMPLAINT':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" />
            Жалоба
          </span>
        );
      case 'SUGGESTION':
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/30 flex items-center gap-1">
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
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Ожидает ответа
          </span>
        );
      case 'IN_REVIEW':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-sky-500/15 text-sky-300 border border-sky-500/30">
            В диалоге
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            Решено
          </span>
        );
      case 'DISMISSED':
      case 'REJECTED':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-[#151932] text-[#64748B] border border-[#1E2442]">
            Закрыто
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-[#151932] text-[#94A3B8] border border-[#1E2442]">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#0B0D20] border border-[#1E2442] rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-fade-in-up">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#1E2442] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#11152A] border border-[#1E2442] flex items-center justify-center text-[#A78BFA]">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#F8FAFC]">Служба поддержки и отзывов</h2>
              <p className="text-xs text-[#94A3B8]">Двухсторонний диалог с командой Dodik Tracker</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#94A3B8] hover:text-white hover:bg-[#151932] rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs (if logged in) */}
        {dbUser && !selectedTicketId && (
          <div className="flex items-center gap-2 p-3 bg-[#080A18] border-b border-[#1E2442] shrink-0">
            <button
              onClick={() => setActiveTab('my')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'my'
                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#11152A]'
              }`}
            >
              <Inbox className="w-4 h-4" />
              <span>Мои обращения</span>
              {tickets.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-white text-[10px] font-mono">
                  {tickets.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('new')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'new'
                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#11152A]'
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
              <div className="flex items-center justify-between pb-2 border-b border-[#1E2442]">
                <button
                  onClick={() => {
                    setSelectedTicketId(null);
                    setSelectedTicket(null);
                    setReplies([]);
                    fetchMyTickets();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-semibold text-[#F8FAFC] transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#8B5CF6]" />
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
                <div className="p-10 text-center text-xs text-[#94A3B8] space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#8B5CF6] mx-auto" />
                  <p className="font-mono">Загрузка переписки...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Original feedback message */}
                  <div className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[10px] text-[#A78BFA]">
                          <User className="w-3 h-3" />
                        </div>
                        <span className="font-bold text-[#F8FAFC]">Вы (Исходное сообщение)</span>
                      </div>
                      {selectedTicket && (
                        <span className="flex items-center gap-1 text-[11px]">
                          <Clock className="w-3 h-3 text-[#64748B]" />
                          {new Date(selectedTicket.createdAt).toLocaleString('ru-RU')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[#F8FAFC] leading-relaxed whitespace-pre-wrap">
                      {selectedTicket?.description}
                    </p>
                  </div>

                  {/* Message Thread History */}
                  {replies.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                        <Sparkles className="w-3 h-3 text-[#8B5CF6]" />
                        История ответов
                      </div>
                      {replies.map((reply) => (
                        <div
                          key={reply.id}
                          className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2 ${
                            reply.isAdminResponse
                              ? 'bg-[#181436] border-[#8B5CF6]/40 text-[#F8FAFC]'
                              : 'bg-[#11152A] border-[#1E2442] text-[#F8FAFC]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
                            <div className="flex items-center gap-2">
                              {reply.isAdminResponse ? (
                                <span className="px-2 py-0.5 rounded-md bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 text-[#A78BFA] font-bold text-[10px] flex items-center gap-1 font-mono">
                                  <ShieldCheck className="w-3.5 h-3.5 text-[#8B5CF6]" />
                                  Ответ Администратора (@{reply.authorUsername || 'Администрация'})
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-[#151932] border border-[#1E2442] text-[#CBD5E1] font-bold text-[10px] font-mono">
                                  Вы (@{reply.authorUsername || dbUser?.username})
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px]">{new Date(reply.createdAt).toLocaleString('ru-RU')}</span>
                          </div>
                          <div className="text-sm text-[#F8FAFC] whitespace-pre-wrap">{reply.message}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* User Reply Box */}
                  <div className="p-4 rounded-2xl bg-[#080A18] border border-[#1E2442] space-y-3 pt-4">
                    <div className="text-xs font-bold text-[#F8FAFC] flex items-center gap-1.5">
                      <CornerDownRight className="w-3.5 h-3.5 text-[#8B5CF6]" />
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
                      className="w-full h-24 p-3 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs text-[#F8FAFC] placeholder-[#64748B] outline-none focus:border-[#8B5CF6] transition-colors resize-none custom-scrollbar"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#64748B]">Ваш ответ поступит модераторам</span>
                      <button
                        type="button"
                        disabled={!userReplyText.trim() || isSubmittingReply}
                        onClick={handleSendReply}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
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
              <div className="flex items-center justify-between pb-2 border-b border-[#1E2442]">
                <h3 className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider font-mono">
                  Ваши обращения ({tickets.length})
                </h3>
                <button
                  onClick={fetchMyTickets}
                  className="p-1.5 rounded-lg bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
                  title="Обновить"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTickets ? 'animate-spin text-[#8B5CF6]' : ''}`} />
                </button>
              </div>

              {isLoadingTickets && tickets.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#94A3B8]">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#8B5CF6] mx-auto mb-2" />
                  <span className="font-mono">Загрузка списка обращений...</span>
                </div>
              ) : tickets.length === 0 ? (
                <div className="p-8 text-center bg-[#11152A] border border-[#1E2442] rounded-2xl space-y-3">
                  <Inbox className="w-8 h-8 text-[#64748B] mx-auto" />
                  <p className="text-sm font-bold text-[#F8FAFC]">У вас пока нет отправленных обращений</p>
                  <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
                    Вы можете отправить идею, сообщить об ошибке или задать вопрос администрации платформы.
                  </p>
                  <button
                    onClick={() => setActiveTab('new')}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Создать обращение
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {tickets.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => handleSelectTicket(t)}
                      className="p-4 rounded-xl bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/50 transition-all cursor-pointer space-y-2 group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getCategoryBadge(t.targetId)}
                          {getStatusBadge(t.status)}
                          <span className="text-xs font-mono font-bold text-[#CBD5E1]">#{t.id}</span>
                        </div>
                        <span className="text-[11px] text-[#64748B] font-mono">
                          {new Date(t.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>

                      <p className="text-xs text-[#94A3B8] line-clamp-2 leading-relaxed group-hover:text-[#F8FAFC] transition-colors">
                        {t.description}
                      </p>

                      <div className="flex items-center justify-between pt-1 text-[11px] text-[#64748B] border-t border-[#1E2442]">
                        <span className="flex items-center gap-1 text-[#A78BFA]">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {t.replyCount > 0
                            ? `${t.replyCount} сообщений в диалоге`
                            : t.moderatorComment
                            ? 'Есть ответ модератора'
                            : 'Ожидает рассмотрения'}
                        </span>
                        <span className="font-bold text-[#A78BFA] group-hover:underline">Открыть диалог →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* VIEW 3: Create New Ticket Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider font-mono">
                  Категория обращения
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('SUGGESTION')}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      type === 'SUGGESTION'
                        ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/40 text-[#A78BFA]'
                        : 'bg-[#11152A] border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    <Lightbulb className={`w-5 h-5 ${type === 'SUGGESTION' ? 'text-[#A78BFA]' : ''}`} />
                    Идея
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('BUG')}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      type === 'BUG'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-[#11152A] border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    <AlertTriangle className={`w-5 h-5 ${type === 'BUG' ? 'text-amber-400' : ''}`} />
                    Ошибка
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('COMPLAINT')}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      type === 'COMPLAINT'
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                        : 'bg-[#11152A] border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    <ShieldAlert className={`w-5 h-5 ${type === 'COMPLAINT' ? 'text-rose-400' : ''}`} />
                    Жалоба
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider font-mono">
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
                  className="w-full h-32 p-3 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs text-[#F8FAFC] placeholder-[#64748B] outline-none focus:border-[#8B5CF6] transition-colors resize-none custom-scrollbar"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] border border-[#1E2442] transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !description.trim()}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white text-xs font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-[#7C3AED]/25 cursor-pointer"
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
