import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, ChevronLeft, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { usePresence } from '../../hooks/usePresence.ts';
import { PresenceIndicator } from '../ui/PresenceIndicator.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

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

export const MiniMessenger: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const { navigate } = useRouter();
  
  const [isOpen, setIsOpen] = useState(false);
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [loadingDialogs, setLoadingDialogs] = useState(false);
  
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [activeChatUser, setActiveChatUser] = useState<{ id: number, username: string, avatar: string | null } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Use presence hook for dialog users and active chat user
  const userIdsForPresence = activeChatId ? [activeChatId] : dialogs.map(d => d.otherUserId);
  const presenceMap = usePresence(userIdsForPresence);

  // Expose a global method to open chat with a specific user or toggle messenger
  useEffect(() => {
    const handleOpenChat = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: number, username: string, avatar: string | null }>;
      const user = customEvent.detail;
      setIsOpen(true);
      openChat(user);
    };
    const handleToggleMessenger = () => {
      setIsOpen(prev => !prev);
    };
    window.addEventListener('open_chat', handleOpenChat);
    window.addEventListener('toggle_messenger', handleToggleMessenger);
    return () => {
      window.removeEventListener('open_chat', handleOpenChat);
      window.removeEventListener('toggle_messenger', handleToggleMessenger);
    };
  }, []);

  // Initial fetch of dialogs to show unread badge
  useEffect(() => {
    fetchDialogsQuietly();
  }, []);

  // Fetch dialogs when messenger is opened (if active chat not open)
  useEffect(() => {
    if (isOpen && !activeChatId) {
      fetchDialogs();
    }
  }, [isOpen, activeChatId]);

  // Fetch messages when a chat is opened
  useEffect(() => {
    if (activeChatId) {
      fetchMessages(activeChatId);
    }
  }, [activeChatId]);

  // Real-time message listener
  useEffect(() => {
    const handleNewMessage = (e: Event) => {
      const { detail: msg } = e as CustomEvent<Message>;
      
      // If we are currently chatting with the sender or receiver
      if (activeChatId && (msg.senderId === activeChatId || msg.receiverId === activeChatId)) {
        setMessages(prev => [...prev, msg]);
        scrollToBottom();
        if (msg.senderId === activeChatId) {
          authFetch(`/api/messages/${activeChatId}/read`, { method: 'POST' }).catch(console.error);
        }
      }
      
      // Update dialog list (fetch again quietly)
      fetchDialogsQuietly();
    };
    window.addEventListener('chat_message', handleNewMessage);
    return () => window.removeEventListener('chat_message', handleNewMessage);
  }, [activeChatId]);

  const fetchDialogs = async () => {
    setLoadingDialogs(true);
    await fetchDialogsQuietly();
    setLoadingDialogs(false);
  };

  const fetchDialogsQuietly = async () => {
    try {
      const res = await authFetch('/api/messages');
      if (res.ok) {
        setDialogs(await res.json());
      }
    } catch (err) {
      console.error('Failed to load dialogs', err);
    }
  };

  const fetchMessages = async (otherUserId: number) => {
    setLoadingMessages(true);
    setHasMore(true);
    try {
      const res = await authFetch(`/api/messages/${otherUserId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
        scrollToBottom();
        if (data.length < 50) setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load messages', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadMoreMessages = async () => {
    if (!activeChatId || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldestMessage = messages[0];
      const res = await authFetch(`/api/messages/${activeChatId}?before=${oldestMessage.createdAt}`);
      if (res.ok) {
        const data: Message[] = await res.json();
        if (data.length < 50) setHasMore(false);
        
        const scrollEl = scrollContainerRef.current;
        const oldScrollHeight = scrollEl?.scrollHeight || 0;
        
        setMessages(prev => [...data, ...prev]);
        
        setTimeout(() => {
          if (scrollEl) {
            scrollEl.scrollTop = scrollEl.scrollHeight - oldScrollHeight;
          }
        }, 0);
      }
    } catch (err) {
      console.error('Failed to load more messages', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop === 0) {
      loadMoreMessages();
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const openChat = (user: { id: number, username: string, avatar: string | null }) => {
    setActiveChatId(user.id);
    setActiveChatUser(user);
    // Optimistically mark unread dialog as read
    setDialogs(prev => prev.map(d => {
      if (d.otherUserId === user.id) {
        return { ...d, unreadCount: 0 };
      }
      return d;
    }));
  };

  const closeChat = () => {
    setActiveChatId(null);
    setActiveChatUser(null);
    setMessages([]);
    fetchDialogs();
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChatId) return;
    
    setSending(true);
    try {
      const res = await authFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: activeChatId, content: newMessage })
      });
      if (res.ok) {
        setNewMessage('');
        // We wait for SSE to append the message, or append optimistically:
        // Actually, SSE comes very fast, so appending optimistically isn't strictly necessary, 
        // but we can rely on SSE to update the view.
      }
    } catch (err) {
      console.error('Failed to send message', err);
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (messageId: number) => {
    try {
      const res = await authFetch(`/api/messages/${messageId}`, { method: 'DELETE' });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
      }
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  };

  if (!dbUser) return null;

  return (
    <div
      id="floating-mini-messenger"
      className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+0.75rem)] right-4 md:bottom-6 md:right-6 z-35 flex flex-col items-end pointer-events-none"
    >
      {/* Messenger Panel */}
      {isOpen && (
        <div className="pointer-events-auto w-[calc(100vw-2rem)] max-w-[22rem] sm:max-w-sm md:w-96 h-[490px] max-h-[calc(100dvh-5rem-env(safe-area-inset-bottom,0px)-4rem)] bg-[#0B0D20]/95 backdrop-blur-xl border border-[#1E2442] rounded-2xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden mb-3 animate-in slide-in-from-bottom-5 duration-200">
          
          {/* Header */}
          <div className="h-14 bg-[#11152A] border-b border-[#1E2442] px-4 flex items-center justify-between shrink-0">
            {activeChatUser ? (
              <div className="flex items-center gap-3">
                <button onClick={closeChat} className="p-1.5 -ml-1.5 hover:bg-[#151932] rounded-lg text-[#94A3B8] transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div 
                  className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => {
                    setIsOpen(false);
                    navigate(`/u/${activeChatUser.username}`);
                  }}
                >
                  <div className="relative">
                    {activeChatUser.avatar ? (
                      <img src={activeChatUser.avatar} alt="avatar" className="w-8 h-8 rounded-full object-cover border border-[#1E2442]" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] flex items-center justify-center text-xs font-bold text-white">
                        {activeChatUser.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <PresenceIndicator presence={presenceMap[activeChatUser.id]} className="absolute -bottom-0.5 -right-0.5" size="sm" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-[#F8FAFC] leading-tight">@{activeChatUser.username}</span>
                    <span className="text-[10px] text-[#94A3B8] leading-tight">
                      {presenceMap[activeChatUser.id]?.statusText || 'offline'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <h3 className="text-sm font-bold text-[#F8FAFC] flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[#8B5CF6]" />
                <span>Мессенджер</span>
              </h3>
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate(activeChatUser ? `/messages/${activeChatUser.id}` : '/messages');
                }}
                className="p-1.5 hover:bg-[#151932] rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
                title="Развернуть на весь экран"
              >
                <span className="text-xs font-mono">⤢</span>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-[#151932] rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
                title="Закрыть мессенджер"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden relative flex flex-col bg-[#080A18]/50">
            {!activeChatId ? (
              /* Dialogs List */
              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {loadingDialogs ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#8B5CF6]" /></div>
                ) : dialogs.length === 0 ? (
                  <div className="text-center py-10 text-[#64748B] text-xs">
                    Нет активных диалогов.<br/>Перейдите в профиль друга, чтобы начать общение.
                  </div>
                ) : (
                  dialogs.map(dialog => (
                    <div
                      key={dialog.otherUserId}
                      onClick={() => openChat({ id: dialog.otherUserId, username: dialog.username, avatar: dialog.avatar })}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#11152A] cursor-pointer transition-colors border border-transparent hover:border-[#1E2442]"
                    >
                      <div className="relative shrink-0">
                        {dialog.avatar ? (
                          <img src={dialog.avatar} alt={dialog.username} className="w-12 h-12 rounded-full object-cover ring-1 ring-[#1E2442]" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#7C3AED]/40 to-[#6366F1]/40 border border-[#8B5CF6]/30 flex items-center justify-center text-sm font-bold text-white">
                            {dialog.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <PresenceIndicator presence={presenceMap[dialog.otherUserId]} className="absolute -bottom-0.5 right-0" size="sm" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <h4 className="text-sm font-bold text-[#F8FAFC] truncate">@{dialog.username}</h4>
                          <span className="text-[10px] text-[#64748B] shrink-0 font-mono">
                            {new Date(dialog.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <p className={`text-xs truncate ${dialog.unreadCount > 0 ? 'text-[#F8FAFC] font-semibold' : 'text-[#94A3B8]'}`}>
                            {dialog.senderId === dbUser.id && <span className="text-[#8B5CF6] mr-1">Вы:</span>}
                            {dialog.content}
                          </p>
                          {dialog.unreadCount > 0 && (
                            <span className="shrink-0 bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center shadow-sm">
                              {dialog.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Chat View */
              <>
                <div 
                  ref={scrollContainerRef}
                  onScroll={handleScroll}
                  className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
                >
                  {loadingMore && <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-[#8B5CF6]" /></div>}
                  {loadingMessages ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#8B5CF6]" /></div>
                  ) : (
                    messages.map((msg, idx) => {
                      const isMe = msg.senderId === dbUser.id;
                      const showAvatar = !isMe && (idx === messages.length - 1 || messages[idx + 1].senderId === dbUser.id);
                      
                      return (
                        <div key={msg.id} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {!isMe && (
                            <div className="w-6 shrink-0 flex items-end">
                              {showAvatar && activeChatUser?.avatar ? (
                                <img src={activeChatUser.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                              ) : showAvatar ? (
                                <div className="w-6 h-6 rounded-full bg-violet-900/60 flex items-center justify-center text-[10px] font-bold text-white">
                                  {activeChatUser?.username.charAt(0).toUpperCase()}
                                </div>
                              ) : null}
                            </div>
                          )}
                          <div className={`group relative max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                            isMe 
                              ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white rounded-br-sm shadow-md shadow-violet-950/30' 
                              : 'bg-[#151932] text-[#F8FAFC] rounded-bl-sm border border-[#1E2442]'
                          }`}>
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            <div className={`text-[9px] mt-1 flex items-center gap-1 ${isMe ? 'text-violet-200 justify-end' : 'text-[#94A3B8]'}`}>
                              <span className="font-mono">{new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                              {isMe && (
                                <span className="ml-1">
                                  {msg.isRead ? '✓✓' : '✓'}
                                </span>
                              )}
                            </div>
                            
                            {/* Delete Button (Only for me) */}
                            {isMe && (
                              <button 
                                onClick={() => deleteMessage(msg.id)}
                                className="absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-[#11152A] text-[#94A3B8] hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all shadow-sm border border-[#1E2442]"
                                title="Удалить"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
                
                {/* Input Area */}
                <div className="p-3 bg-[#11152A] border-t border-[#1E2442] shrink-0">
                  <form onSubmit={sendMessage} className="relative flex items-end gap-2">
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Сообщение..."
                      className="flex-1 bg-[#080A18] border border-[#1E2442] rounded-xl px-3 py-2.5 text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] resize-none max-h-32 min-h-[44px]"
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage(e);
                        }
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!newMessage.trim() || sending}
                      className="p-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white disabled:opacity-50 transition-all shrink-0 flex items-center justify-center h-[44px] w-[44px] shadow-md shadow-violet-950/40"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        id="mini-messenger-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="pointer-events-auto relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 shadow-xl shadow-violet-950/50 text-white flex items-center justify-center transition-transform hover:scale-105 active:scale-95 touch-manipulation focus:outline-none ring-2 ring-[#080A18] border border-violet-400/30"
        title={isOpen ? 'Скрыть мессенджер' : 'Открыть мессенджер'}
      >
        <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6" />
        
        {/* Total Unread Badge */}
        {!isOpen && dialogs.reduce((sum, d) => sum + d.unreadCount, 0) > 0 && (
          <div className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center border-2 border-[#080A18] shadow-sm">
            {dialogs.reduce((sum, d) => sum + d.unreadCount, 0)}
          </div>
        )}
      </button>
    </div>
  );
};
