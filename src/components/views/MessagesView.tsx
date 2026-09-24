import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Loader2,
  Trash2,
  ChevronLeft,
  User,
  Shield,
  ExternalLink,
  Plus,
  X,
  Check,
  CheckCheck,
  Users,
  Smile,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { usePresence } from '../../hooks/usePresence.ts';
import { PresenceIndicator } from '../ui/PresenceIndicator.tsx';

interface Dialog {
  otherUserId: number;
  username: string;
  avatar: string | null;
  content: string;
  createdAt: string;
  isRead: boolean;
  senderId: number;
  unreadCount: number;
}

interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  isRead: boolean;
  createdAt: string;
}

interface UserProfilePreview {
  id: number;
  username: string;
  avatar: string | null;
  bio?: string | null;
}

export const MessagesView: React.FC = () => {
  const { authFetch, dbUser, login } = useAuth();
  const { navigate, route } = useRouter();

  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [loadingDialogs, setLoadingDialogs] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeChatUser, setActiveChatUser] = useState<UserProfilePreview | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);

  // New Chat Modal with Friends
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [friendsList, setFriendsList] = useState<UserProfilePreview[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Collect user IDs for presence
  const presenceUserIds = useMemo(() => {
    const ids = new Set<number>();
    dialogs.forEach((d) => ids.add(d.otherUserId));
    if (activeChatUser) ids.add(activeChatUser.id);
    friendsList.forEach((f) => ids.add(f.id));
    return Array.from(ids);
  }, [dialogs, activeChatUser, friendsList]);

  const presenceMap = usePresence(presenceUserIds);

  const fetchDialogs = async () => {
    if (!dbUser) {
      setLoadingDialogs(false);
      return;
    }
    try {
      const res = await authFetch('/api/messages');
      if (res.ok) {
        const data = await res.json();
        setDialogs(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load dialogs:', err);
    } finally {
      setLoadingDialogs(false);
    }
  };

  const fetchMessages = async (userId: number) => {
    setLoadingMessages(true);
    setHasMore(true);
    try {
      const res = await authFetch(`/api/messages/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
        scrollToBottom();
        if (data.length < 50) setHasMore(false);

        // Mark as read
        authFetch(`/api/messages/${userId}/read`, { method: 'POST' }).catch(() => {});
        // Update dialog list unread count
        setDialogs((prev) =>
          prev.map((d) => (d.otherUserId === userId ? { ...d, unreadCount: 0, isRead: true } : d))
        );
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const fetchFriends = async () => {
    setLoadingFriends(true);
    try {
      const res = await authFetch('/api/friends');
      if (res.ok) {
        const data = await res.json();
        setFriendsList(data);
      }
    } catch (err) {
      console.error('Failed to load friends:', err);
    } finally {
      setLoadingFriends(false);
    }
  };

  useEffect(() => {
    fetchDialogs();
  }, [dbUser]);

  // Handle URL param if opened with /messages/:userId
  useEffect(() => {
    const routeUserId = route.params?.userId;
    if (routeUserId) {
      const parsedId = parseInt(routeUserId, 10);
      if (!isNaN(parsedId)) {
        // If not loaded yet, fetch user info or select from dialogs
        const existingDialog = dialogs.find((d) => d.otherUserId === parsedId);
        if (existingDialog) {
          selectChat({
            id: existingDialog.otherUserId,
            username: existingDialog.username,
            avatar: existingDialog.avatar,
          });
        }
      }
    }
  }, [route.params?.userId, dialogs]);

  // Real-time message listener
  useEffect(() => {
    const handleNewMessage = (e: Event) => {
      const { detail: msg } = e as CustomEvent<Message>;
      if (activeChatUser && (msg.senderId === activeChatUser.id || msg.receiverId === activeChatUser.id)) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        scrollToBottom();
        if (msg.senderId === activeChatUser.id) {
          authFetch(`/api/messages/${activeChatUser.id}/read`, { method: 'POST' }).catch(() => {});
        }
      }
      fetchDialogs();
    };

    window.addEventListener('chat_message', handleNewMessage);
    return () => window.removeEventListener('chat_message', handleNewMessage);
  }, [activeChatUser]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const selectChat = (user: UserProfilePreview) => {
    setActiveChatUser(user);
    fetchMessages(user.id);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeChatUser || sending) return;

    const textToSend = inputMessage.trim();
    setInputMessage('');
    setSending(true);

    try {
      const res = await authFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: activeChatUser.id,
          content: textToSend,
        }),
      });

      if (res.ok) {
        const createdMessage = await res.json();
        setMessages((prev) => [...prev, createdMessage]);
        scrollToBottom();
        fetchDialogs();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    try {
      const res = await authFetch(`/api/messages/${messageId}`, { method: 'DELETE' });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const filteredDialogs = useMemo(() => {
    if (!searchQuery.trim()) return dialogs;
    const q = searchQuery.toLowerCase();
    return dialogs.filter(
      (d) => d.username.toLowerCase().includes(q) || d.content?.toLowerCase().includes(q)
    );
  }, [dialogs, searchQuery]);

  if (!dbUser) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#151932] border border-[#8B5CF6]/30 flex items-center justify-center mx-auto text-[#A78BFA] shadow-xl">
          <MessageSquare className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Мессенджер Dodik Tracker</h2>
          <p className="text-xs text-[#94A3B8]">
            Войдите в аккаунт, чтобы общаться с друзьями и обсуждать любимые фильмы, сериалы и игры.
          </p>
        </div>
        <button
          onClick={() => login()}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white text-xs font-bold shadow-lg shadow-[#7C3AED]/25"
        >
          Войти в аккаунт
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-4 h-[calc(100dvh-5.5rem)] flex flex-col">
      {/* Messenger Container */}
      <div className="flex-1 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-2xl overflow-hidden flex">
        {/* LEFT PANE: Dialogs List */}
        <div
          className={`w-full md:w-80 lg:w-96 border-r border-[#1E2442] flex flex-col bg-[#0B0D20] shrink-0 ${
            activeChatUser ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Header */}
          <div className="p-4 border-b border-[#1E2442] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#8B5CF6]" />
              <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">Сообщения</h2>
            </div>
            <button
              onClick={() => {
                fetchFriends();
                setShowNewChatModal(true);
              }}
              className="p-2 rounded-xl bg-[#151932] hover:bg-[#8B5CF6]/20 border border-[#1E2442] hover:border-[#8B5CF6]/40 text-[#A78BFA] transition-colors cursor-pointer"
              title="Начать новый диалог"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Search Box */}
          <div className="p-3 border-b border-[#1E2442]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#64748B]" />
              <input
                type="text"
                placeholder="Поиск по диалогам..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] focus:border-[#8B5CF6] text-xs text-white placeholder-[#64748B] focus:outline-none"
              />
            </div>
          </div>

          {/* Dialogs Stream */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
            {loadingDialogs ? (
              <div className="py-12 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#8B5CF6] mx-auto" />
              </div>
            ) : filteredDialogs.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <MessageSquare className="w-8 h-8 text-[#64748B] mx-auto stroke-1" />
                <p className="text-xs text-[#94A3B8]">
                  {searchQuery ? 'Диалогов не найдено' : 'Нет активных переписок'}
                </p>
                <button
                  onClick={() => {
                    fetchFriends();
                    setShowNewChatModal(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#151932] hover:bg-[#8B5CF6]/20 border border-[#1E2442] text-xs font-bold text-[#A78BFA] transition-colors"
                >
                  Написать другу
                </button>
              </div>
            ) : (
              filteredDialogs.map((dialog) => {
                const isSelected = activeChatUser?.id === dialog.otherUserId;
                return (
                  <div
                    key={dialog.otherUserId}
                    onClick={() =>
                      selectChat({
                        id: dialog.otherUserId,
                        username: dialog.username,
                        avatar: dialog.avatar,
                      })
                    }
                    className={`p-3 rounded-2xl cursor-pointer transition-all flex items-center gap-3 border ${
                      isSelected
                        ? 'bg-[#151932] border-[#8B5CF6]/50 shadow-md'
                        : 'bg-transparent border-transparent hover:bg-[#11152A] hover:border-[#1E2442]'
                    }`}
                  >
                    {/* Avatar with Presence */}
                    <div className="relative shrink-0">
                      {dialog.avatar ? (
                        <img
                          src={dialog.avatar}
                          alt={dialog.username}
                          className="w-11 h-11 rounded-2xl object-cover bg-[#151932] border border-[#1E2442]"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#7C3AED]/30 to-[#6366F1]/30 border border-[#8B5CF6]/40 flex items-center justify-center text-[#A78BFA] font-bold text-sm">
                          {dialog.username[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <PresenceIndicator presence={presenceMap[dialog.otherUserId]} size="sm" />
                      </div>
                    </div>

                    {/* Dialog Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between mb-0.5">
                        <span className="text-xs font-bold text-white truncate">@{dialog.username}</span>
                        <span className="text-[10px] text-[#64748B] font-mono shrink-0">
                          {new Date(dialog.createdAt).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-xs truncate ${
                            dialog.unreadCount > 0 ? 'text-white font-bold' : 'text-[#94A3B8]'
                          }`}
                        >
                          {dialog.senderId === dbUser.id && (
                            <span className="text-[#8B5CF6] mr-1">Вы:</span>
                          )}
                          {dialog.content}
                        </p>

                        {dialog.unreadCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white text-[10px] font-bold font-mono shrink-0 shadow-md">
                            {dialog.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: Active Chat */}
        <div
          className={`flex-1 flex flex-col bg-[#080A18] ${
            !activeChatUser ? 'hidden md:flex' : 'flex'
          }`}
        >
          {activeChatUser ? (
            <>
              {/* Chat Header */}
              <div className="p-3.5 px-4 bg-[#0B0D20] border-b border-[#1E2442] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setActiveChatUser(null)}
                    className="p-1.5 rounded-xl hover:bg-[#151932] text-[#94A3B8] hover:text-white md:hidden transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  <div
                    onClick={() => navigate(`/u/${activeChatUser.username}`)}
                    className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition-opacity min-w-0"
                  >
                    <div className="relative shrink-0">
                      {activeChatUser.avatar ? (
                        <img
                          src={activeChatUser.avatar}
                          alt={activeChatUser.username}
                          className="w-10 h-10 rounded-2xl object-cover bg-[#151932] border border-[#1E2442]"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#6366F1] flex items-center justify-center text-white font-bold text-xs">
                          {activeChatUser.username[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <PresenceIndicator presence={presenceMap[activeChatUser.id]} size="sm" />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">
                          @{activeChatUser.username}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#94A3B8] font-medium block">
                        {presenceMap[activeChatUser.id]?.status === 'online'
                          ? 'В сети'
                          : presenceMap[activeChatUser.id]?.statusText || 'Не в сети'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/u/${activeChatUser.username}`)}
                  className="px-3 py-1.5 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-semibold text-[#CBD5E1] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Открыть профиль"
                >
                  <User className="w-3.5 h-3.5 text-[#A78BFA]" />
                  <span className="hidden sm:inline">Профиль</span>
                </button>
              </div>

              {/* Messages Feed */}
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar"
              >
                {loadingMessages ? (
                  <div className="py-16 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#8B5CF6] mx-auto" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-16 text-center space-y-2">
                    <Sparkles className="w-8 h-8 text-[#64748B] mx-auto stroke-1" />
                    <h4 className="text-xs font-bold text-white">Начните диалог</h4>
                    <p className="text-[11px] text-[#94A3B8]">
                      Отправьте первое сообщение пользователю @{activeChatUser.username}
                    </p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isSelf = msg.senderId === dbUser.id;
                    const timeStr = new Date(msg.createdAt).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={msg.id || index}
                        className={`flex flex-col group ${isSelf ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`relative max-w-[85%] sm:max-w-md px-3.5 py-2 rounded-2xl text-xs transition-all shadow-md ${
                            isSelf
                              ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white rounded-br-none'
                              : 'bg-[#11152A] border border-[#1E2442] text-[#F8FAFC] rounded-bl-none'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>

                          <div
                            className={`flex items-center gap-1 justify-end mt-1 text-[10px] font-mono ${
                              isSelf ? 'text-purple-200' : 'text-[#64748B]'
                            }`}
                          >
                            <span>{timeStr}</span>
                            {isSelf && (
                              <span>
                                {msg.isRead ? (
                                  <CheckCheck className="w-3 h-3 text-emerald-300 inline" />
                                ) : (
                                  <Check className="w-3 h-3 text-purple-300 inline" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quick Delete Option for sender */}
                        {isSelf && (
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="text-[10px] text-[#64748B] hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 pr-1 cursor-pointer flex items-center gap-0.5"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                            <span>Удалить</span>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Box */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 bg-[#0B0D20] border-t border-[#1E2442] flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Напишите сообщение... (Enter для отправки)"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-2xl bg-[#11152A] border border-[#1E2442] focus:border-[#8B5CF6] text-xs text-white placeholder-[#64748B] focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={!inputMessage.trim() || sending}
                  className="p-2.5 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 disabled:opacity-50 text-white transition-all cursor-pointer shadow-md shadow-[#7C3AED]/25 shrink-0"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3 text-[#94A3B8]">
              <div className="w-16 h-16 rounded-3xl bg-[#11152A] border border-[#1E2442] flex items-center justify-center text-[#64748B]">
                <MessageSquare className="w-8 h-8 stroke-1" />
              </div>
              <h3 className="text-sm font-bold text-white">Выберите диалог</h3>
              <p className="text-xs text-[#64748B] max-w-sm">
                Выберите пользователя из списка слева или начните новую беседу с другом.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Modal with Friends */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#0B0D20] border border-[#1E2442] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-[#8B5CF6]" />
                <span>Начать новый диалог</span>
              </h3>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="p-1 rounded-lg text-[#64748B] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto no-scrollbar">
              {loadingFriends ? (
                <div className="py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-[#8B5CF6] mx-auto" />
                </div>
              ) : friendsList.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#64748B]">
                  Список друзей пуст. Добавьте друзей на вкладке «Друзья».
                </div>
              ) : (
                friendsList.map((fr) => (
                  <div
                    key={fr.id}
                    onClick={() => {
                      selectChat(fr);
                      setShowNewChatModal(false);
                    }}
                    className="p-2.5 rounded-2xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative">
                        {fr.avatar ? (
                          <img
                            src={fr.avatar}
                            alt={fr.username}
                            className="w-9 h-9 rounded-xl object-cover bg-[#0B0D20]"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7C3AED]/30 to-[#6366F1]/30 flex items-center justify-center text-white text-xs font-bold">
                            {fr.username[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="absolute -bottom-0.5 -right-0.5">
                          <PresenceIndicator presence={presenceMap[fr.id]} size="sm" />
                        </div>
                      </div>
                      <span className="text-xs font-bold text-white">@{fr.username}</span>
                    </div>

                    <button className="text-xs font-semibold text-[#A78BFA] hover:underline">
                      Написать
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
