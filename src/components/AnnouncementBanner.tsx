import React, { useState, useEffect, useCallback } from 'react';
import {
  Megaphone,
  AlertTriangle,
  Flame,
  X,
  Check,
  ChevronRight,
  ChevronDown,
  Info,
  Clock,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

export interface ActiveAnnouncement {
  id: number;
  title: string;
  content: string;
  message?: string;
  priority: 'NORMAL' | 'IMPORTANT' | 'CRITICAL';
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  showBanner: boolean;
  publishedAt: string;
  createdAt: string;
  author?: {
    id?: number;
    username: string;
    avatar?: string | null;
    role?: string;
  };
  isRead?: boolean;
}

export const AnnouncementBanner: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const [announcements, setAnnouncements] = useState<ActiveAnnouncement[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dismissingId, setDismissingId] = useState<number | null>(null);

  const fetchActiveAnnouncements = useCallback(async () => {
    try {
      const fetchFn = dbUser ? authFetch : fetch;
      const res = await fetchFn('/api/announcements/active');
      if (!res.ok) return;
      const data: ActiveAnnouncement[] = await res.json();
      // Filter out any already marked as read
      setAnnouncements(Array.isArray(data) ? data.filter((a) => !a.isRead && a.showBanner) : []);
    } catch (_err) {
      // Non-blocking error
    }
  }, [authFetch, dbUser]);

  useEffect(() => {
    fetchActiveAnnouncements();
    // Periodically refresh every 60s so newly published/unpublished announcements update cleanly
    const interval = setInterval(fetchActiveAnnouncements, 60000);
    return () => clearInterval(interval);
  }, [fetchActiveAnnouncements]);

  const handleMarkAsRead = async (id: number) => {
    setDismissingId(id);
    try {
      if (dbUser) {
        // Send persistent read status to server database (announcement_reads table)
        await authFetch(`/api/announcements/${id}/read`, {
          method: 'POST',
        });
      }
      // Remove from active state in memory
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (_err) {
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDismissingId(null);
    }
  };

  if (announcements.length === 0) {
    return null;
  }

  return (
    <div className="w-full space-y-3 mb-6 animate-fade-in">
      {announcements.map((ann) => {
        const isCritical = ann.priority === 'CRITICAL';
        const isImportant = ann.priority === 'IMPORTANT';
        const isExpanded = expandedId === ann.id;
        const textContent = ann.content || ann.message || '';
        const isLongText = textContent.length > 140;

        return (
          <div
            key={ann.id}
            className={`relative overflow-hidden rounded-2xl border transition-all shadow-lg ${
              isCritical
                ? 'bg-gradient-to-r from-rose-950/60 via-[#181116] to-[#120F14] border-rose-500/50 shadow-rose-950/30'
                : isImportant
                ? 'bg-gradient-to-r from-amber-950/50 via-[#191512] to-[#131110] border-amber-500/40 shadow-amber-950/20'
                : 'bg-gradient-to-r from-[#1B1728]/90 via-[#14121C] to-[#100F14] border-[#9B6BFF]/40 shadow-purple-950/20'
            }`}
          >
            {/* Ambient accent light */}
            <div
              className={`absolute -top-12 -left-12 w-36 h-36 rounded-full blur-3xl pointer-events-none opacity-25 ${
                isCritical
                  ? 'bg-rose-500'
                  : isImportant
                  ? 'bg-amber-500'
                  : 'bg-[#9B6BFF]'
              }`}
            />

            <div className="relative z-10 p-3.5 sm:p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                {/* Left: Icon & Title */}
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                      isCritical
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : isImportant
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-[#9B6BFF]/20 text-[#C9A9FF] border border-[#9B6BFF]/30'
                    }`}
                  >
                    {isCritical ? (
                      <Flame className="w-4 h-4 text-rose-400 animate-pulse" />
                    ) : isImportant ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Megaphone className="w-4 h-4 text-[#9B6BFF]" />
                    )}
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          isCritical
                            ? 'bg-rose-500/30 text-rose-200 border border-rose-500/40'
                            : isImportant
                            ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40'
                            : 'bg-[#9B6BFF]/30 text-[#E2D4FF] border border-[#9B6BFF]/40'
                        }`}
                      >
                        {isCritical
                          ? 'Критическое объявление'
                          : isImportant
                          ? 'Важное объявление'
                          : 'Системное объявление'}
                      </span>
                      <span className="text-[11px] text-[#7E7890] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(ann.publishedAt || ann.createdAt).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm sm:text-base text-[#F3F1F8] tracking-tight">
                      {ann.title}
                    </h4>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleMarkAsRead(ann.id)}
                    disabled={dismissingId === ann.id}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#D8D4E2] hover:text-white border border-white/10 transition-colors flex items-center gap-1.5"
                    title="Отметить как прочитанное"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden sm:inline">Понятно</span>
                  </button>

                  <button
                    onClick={() => handleMarkAsRead(ann.id)}
                    className="p-1.5 rounded-xl hover:bg-white/10 text-[#7E7890] hover:text-[#F3F1F8] transition-colors"
                    title="Закрыть"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Message content */}
              <div className="text-xs sm:text-sm text-[#C9C4D6] leading-relaxed pl-1 sm:pl-11 pr-2">
                <div className={!isExpanded && isLongText ? 'line-clamp-2' : ''}>
                  {textContent}
                </div>

                {isLongText && (
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : ann.id)}
                    className="mt-1 text-xs font-semibold text-[#AC82FF] hover:underline flex items-center gap-1"
                  >
                    {isExpanded ? (
                      <>
                        <span>Свернуть</span>
                        <ChevronDown className="w-3.5 h-3.5 rotate-180 transition-transform" />
                      </>
                    ) : (
                      <>
                        <span>Читать полностью</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Author footer if expanded */}
              {isExpanded && ann.author?.username && (
                <div className="pt-2 mt-1 border-t border-white/10 flex items-center gap-2 pl-1 sm:pl-11 text-[11px] text-[#8E88A0]">
                  <User className="w-3 h-3 text-[#9B6BFF]" />
                  <span>
                    Администрация: <strong className="text-[#F3F1F8]">@{ann.author.username}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
