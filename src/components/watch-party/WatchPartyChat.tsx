import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, ArrowDown, Sparkles } from 'lucide-react';
import { useWatchParty } from '../../context/WatchPartyContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { Avatar } from '../design-system/index.ts';

export const WatchPartyChat: React.FC = () => {
  const { chatMessages, sendChatMessage, authoritativePlayback } = useWatchParty();
  const { dbUser } = useAuth();

  const [inputVal, setInputVal] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Check scroll position to determine if we should auto-scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 80;
    setShowScrollBottom(!isNearBottom);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setShowScrollBottom(false);
  };

  useEffect(() => {
    if (!showScrollBottom) {
      scrollToBottom('smooth');
    }
  }, [chatMessages.length]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) return;

    sendChatMessage(trimmed, authoritativePlayback.position);
    setInputVal('');
    scrollToBottom('smooth');
  };

  const formatMessageTime = (isoString?: string): string => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3 relative">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1E2442]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#6366F1]/15 text-[#818CF8]">
            <MessageSquare className="w-4 h-4" />
          </div>
          <h2 className="text-xs font-bold text-[#F8FAFC] tracking-wide uppercase">
            Чат комнаты
          </h2>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto space-y-3 max-h-[360px] min-h-[220px] custom-scrollbar pr-1 relative"
      >
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#64748B] space-y-2">
            <MessageSquare className="w-8 h-8 opacity-40" />
            <p className="text-xs">В чате пока нет сообщений. Напишите первым!</p>
          </div>
        ) : (
          chatMessages.map((msg) => {
            const isOwn = dbUser && msg.userId === dbUser.id;
            const isSystem = msg.type === 'SYSTEM' || msg.type === 'ACTION';

            if (isSystem) {
              return (
                <div key={`msg-${msg.id}`} className="flex justify-center my-1">
                  <div className="px-3 py-1 rounded-full bg-[#151932] border border-[#1E2442] text-[11px] text-[#A78BFA] flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    <span>{msg.content}</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={`msg-${msg.id}`}
                className={`flex items-start gap-2.5 ${isOwn ? 'flex-row-reverse' : ''}`}
              >
                {!isOwn && (
                  <Avatar
                    src={msg.user?.avatar || undefined}
                    username={msg.user?.username || 'User'}
                    size="sm"
                    className="shrink-0 mt-0.5 border border-[#1E2442]"
                  />
                )}

                <div
                  className={`max-w-[82%] rounded-2xl p-2.5 text-xs space-y-1 ${
                    isOwn
                      ? 'bg-gradient-to-br from-[#7C3AED] to-[#6366F1] text-white rounded-tr-none shadow-md shadow-[#7C3AED]/20'
                      : 'bg-[#151932] border border-[#1E2442] text-[#F8FAFC] rounded-tl-none'
                  }`}
                >
                  {!isOwn && (
                    <div className="text-[11px] font-bold text-[#A78BFA] leading-none">
                      {msg.user?.username || 'Участник'}
                    </div>
                  )}

                  <p className="leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>

                  <div
                    className={`flex items-center justify-end gap-1.5 text-[10px] ${
                      isOwn ? 'text-white/70' : 'text-[#64748B]'
                    }`}
                  >
                    <span>{formatMessageTime(msg.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating "New Messages" Pill */}
      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-semibold shadow-xl flex items-center gap-1.5 transition-all z-20 cursor-pointer animate-bounce"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>Новые сообщения</span>
        </button>
      )}

      {/* Chat Input Bar */}
      <form onSubmit={handleSend} className="pt-2 border-t border-[#1E2442] flex items-center gap-2">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Напишите сообщение..."
          maxLength={2000}
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#080A18] border border-[#1E2442] focus:border-[#8B5CF6]/50 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none transition-colors"
        />

        <button
          type="submit"
          disabled={!inputVal.trim()}
          className="p-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:from-[#6D28D9] hover:to-[#4F46E5] text-white disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer shrink-0 shadow-md shadow-[#7C3AED]/20"
          title="Отправить (Enter)"
          aria-label="Отправить сообщение"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
