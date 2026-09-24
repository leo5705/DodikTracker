import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  Eye,
  User,
  Share2,
  Check,
  RotateCw,
  Newspaper,
  Tag,
  Pin,
  Star,
  MessageSquare,
  CornerDownRight,
  Edit2,
  Trash2,
  Smile,
  Send,
  X,
  ShieldAlert,
  LogIn,
} from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

interface NewsDetailViewProps {
  slug: string;
}

const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const formatCommentTime = (dateStr?: string | Date | null): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 45) return 'только что';
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    if (mins % 10 === 1 && mins % 100 !== 11) return `${mins} минуту назад`;
    if ([2, 3, 4].includes(mins % 10) && ![12, 13, 14].includes(mins % 100)) return `${mins} минуты назад`;
    return `${mins} минут назад`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    if (hours % 10 === 1 && hours % 100 !== 11) return `${hours} час назад`;
    if ([2, 3, 4].includes(hours % 10) && ![12, 13, 14].includes(hours % 100)) return `${hours} часа назад`;
    return `${hours} часов назад`;
  }
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
  });
};

interface CommentItem {
  id: number;
  newsId: number;
  userId: number;
  parentId: number | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorUsername: string;
  authorAvatar: string | null;
  authorRole: string;
  reactionCounts: Record<string, number>;
  userEmoji: string | null;
  replies?: CommentItem[];
}

export const NewsDetailView: React.FC<NewsDetailViewProps> = ({ slug }) => {
  const { navigate } = useRouter();
  const [article, setArticle] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchArticle = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/news/${slug}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Статья не найдена или еще не опубликована');
          }
          throw new Error('Ошибка загрузки статьи');
        }
        const data = await res.json();
        setArticle(data);
      } catch (err: any) {
        setError(err.message || 'Не удалось загрузить новость');
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchArticle();
    }
  }, [slug]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderFormattedContent = (content: string) => {
    if (!content) return null;
    const lines = content.split('\n');
    return (
      <div className="space-y-4 text-sm sm:text-base text-[#CBD5E1] leading-relaxed font-sans">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <div key={idx} className="h-2" />;
          }
          if (trimmed.startsWith('### ')) {
            return (
              <h3 key={idx} className="text-lg font-bold text-[#F8FAFC] pt-3 pb-1">
                {trimmed.replace(/^###\s+/, '')}
              </h3>
            );
          }
          if (trimmed.startsWith('## ')) {
            return (
              <h2 key={idx} className="text-xl font-bold text-[#F8FAFC] pt-4 pb-1 border-b border-[#1E2442]">
                {trimmed.replace(/^##\s+/, '')}
              </h2>
            );
          }
          if (trimmed.startsWith('# ')) {
            return (
              <h1 key={idx} className="text-2xl font-extrabold text-[#F8FAFC] pt-4 pb-2">
                {trimmed.replace(/^#\s+/, '')}
              </h1>
            );
          }
          if (trimmed.startsWith('> ')) {
            return (
              <blockquote
                key={idx}
                className="p-4 my-2 border-l-4 border-[#8B5CF6] bg-[#11152A] rounded-r-xl text-[#CBD5E1] italic"
              >
                {trimmed.replace(/^>\s+/, '')}
              </blockquote>
            );
          }
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            return (
              <div key={idx} className="flex items-start gap-2.5 pl-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] mt-2 shrink-0" />
                <span>{trimmed.replace(/^[-*]\s+/, '')}</span>
              </div>
            );
          }
          return <p key={idx}>{trimmed}</p>;
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 flex flex-col items-center justify-center space-y-4">
        <RotateCw className="w-8 h-8 text-[#8B5CF6] animate-spin" />
        <span className="text-sm text-[#94A3B8] font-mono">Загрузка новости...</span>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
        <Newspaper className="w-12 h-12 mx-auto text-[#64748B]" />
        <h2 className="text-xl font-bold text-[#F8FAFC]">Новость недоступна</h2>
        <p className="text-xs text-[#94A3B8]">{error || 'Публикация не найдена'}</p>
        <button
          onClick={() => navigate('/news')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white text-xs font-bold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Вернуться ко всем новостям
        </button>
      </div>
    );
  }

  let tags: string[] = [];
  try {
    if (Array.isArray(article.tags)) tags = article.tags;
    else if (typeof article.tags === 'string') tags = JSON.parse(article.tags);
  } catch {}

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fade-in">
      {/* Back Button & Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/news')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0B0D20] hover:bg-[#151932] border border-[#1E2442] text-xs font-semibold text-[#F8FAFC] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#94A3B8]" />
          Все новости
        </button>

        <button
          onClick={handleCopyLink}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0B0D20] hover:bg-[#151932] border border-[#1E2442] text-xs font-semibold text-[#F8FAFC] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 font-mono">Ссылка скопирована!</span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4 text-[#94A3B8]" />
              <span>Поделиться</span>
            </>
          )}
        </button>
      </div>

      {/* Main Card */}
      <article className="rounded-3xl bg-[#0B0D20] border border-[#1E2442] overflow-hidden shadow-2xl">
        {/* Cover Image */}
        {article.cover && (
          <div className="relative w-full max-h-96 overflow-hidden bg-[#11152A] border-b border-[#1E2442]">
            <img
              src={article.cover}
              alt={article.title}
              className="w-full h-full object-cover max-h-96"
            />
          </div>
        )}

        <div className="p-6 sm:p-10 space-y-6">
          {/* Badges & Meta Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#94A3B8]">
            <div className="flex items-center gap-2">
              {article.isPinned && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400 font-mono">
                  <Pin className="w-3 h-3 fill-amber-400" /> Закреплено
                </span>
              )}
              {article.isFeatured && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[#A78BFA] font-mono">
                  <Star className="w-3 h-3 fill-[#8B5CF6]" /> Главная новость
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 font-mono">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {article.publishedAt
                  ? new Date(article.publishedAt).toLocaleDateString('ru-RU', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })
                  : 'Сегодня'}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                {article.viewsCount || 1}
              </span>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-4xl font-extrabold text-[#F8FAFC] leading-tight tracking-tight">
            {article.title}
          </h1>

          {/* Author Badge */}
          <div className="flex items-center gap-3 py-3 border-y border-[#1E2442]">
            {article.authorAvatar ? (
              <img
                src={article.authorAvatar}
                alt={article.authorUsername}
                className="w-10 h-10 rounded-xl object-cover border border-[#1E2442]"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[#A78BFA] font-bold">
                {article.authorUsername ? article.authorUsername[0].toUpperCase() : <User className="w-5 h-5" />}
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-[#F8FAFC]">@{article.authorUsername || 'admin'}</p>
              <p className="text-[11px] text-[#94A3B8]">Команда Dodik Tracker</p>
            </div>
          </div>

          {/* Excerpt if present */}
          {article.excerpt && (
            <p className="text-base text-[#CBD5E1] font-medium italic border-l-4 border-[#8B5CF6] pl-4 py-1 leading-relaxed bg-[#11152A] rounded-r-xl">
              {article.excerpt}
            </p>
          )}

          {/* Content */}
          <div className="pt-2">
            {renderFormattedContent(article.content)}
          </div>

          {/* Tags Footer */}
          {tags.length > 0 && (
            <div className="pt-6 border-t border-[#1E2442] flex flex-wrap items-center gap-2">
              <Tag className="w-4 h-4 text-[#94A3B8]" />
              {tags.map((tag, idx) => (
                <span
                  key={idx}
                  onClick={() => navigate(`/news?tag=${encodeURIComponent(tag)}`)}
                  className="px-3 py-1 rounded-xl text-xs font-semibold bg-[#151932] hover:bg-[#8B5CF6]/20 text-[#94A3B8] hover:text-[#A78BFA] border border-[#1E2442] cursor-pointer transition-colors font-mono"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Emoji Reactions Section */}
          <NewsReactionsSection newsId={article.id} />

          {/* Comments Section */}
          <NewsCommentsSection newsId={article.id} />
        </div>
      </article>
    </div>
  );
};

// ==========================================
// Subcomponent: News Emoji Reactions Section
// ==========================================
const NewsReactionsSection: React.FC<{ newsId: number }> = ({ newsId }) => {
  const { dbUser, authFetch, login } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [userEmoji, setUserEmoji] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReactions = async () => {
    try {
      const res = await fetch(`/api/news/${newsId}/reactions`);
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts || {});
        setUserEmoji(data.userEmoji || null);
      }
    } catch (_e) {}
  };

  useEffect(() => {
    if (newsId) fetchReactions();
  }, [newsId, dbUser?.id]);

  const handleToggleEmoji = async (emoji: string) => {
    if (!dbUser) {
      login();
      return;
    }
    if (loading) return;

    // Optimistic UI update
    const prevCounts = { ...counts };
    const prevUserEmoji = userEmoji;

    const newCounts = { ...counts };
    let newUserEmoji: string | null = null;

    if (prevUserEmoji === emoji) {
      // Toggle off
      newCounts[emoji] = Math.max(0, (newCounts[emoji] || 1) - 1);
      newUserEmoji = null;
    } else {
      // If had previous reaction, decrement it
      if (prevUserEmoji && newCounts[prevUserEmoji]) {
        newCounts[prevUserEmoji] = Math.max(0, newCounts[prevUserEmoji] - 1);
      }
      newCounts[emoji] = (newCounts[emoji] || 0) + 1;
      newUserEmoji = emoji;
    }

    setCounts(newCounts);
    setUserEmoji(newUserEmoji);
    setLoading(true);

    try {
      const res = await authFetch(`/api/news/${newsId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts || {});
        setUserEmoji(data.userEmoji || null);
      } else {
        // Rollback on error
        setCounts(prevCounts);
        setUserEmoji(prevUserEmoji);
      }
    } catch (_e) {
      setCounts(prevCounts);
      setUserEmoji(prevUserEmoji);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-6 border-t border-[#1E2442] space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1.5">
          <Smile className="w-3.5 h-3.5 text-[#8B5CF6]" />
          Реакции к новости
        </h3>
        {userEmoji && (
          <span className="text-[11px] text-[#A78BFA] font-mono">
            Ваша реакция: {userEmoji}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {ALLOWED_EMOJIS.map((emoji) => {
          const count = counts[emoji] || 0;
          const isSelected = userEmoji === emoji;

          return (
            <button
              key={emoji}
              type="button"
              disabled={loading}
              onClick={() => handleToggleEmoji(emoji)}
              className={`px-3.5 py-2 rounded-2xl border text-sm font-bold inline-flex items-center gap-2 transition-all cursor-pointer select-none active:scale-95 ${
                isSelected
                  ? 'bg-[#1E1B4B] border-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/20 ring-1 ring-[#8B5CF6]'
                  : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8] hover:text-white hover:border-[#8B5CF6]/50 hover:bg-[#11152A]'
              }`}
              title={isSelected ? 'Нажмите, чтобы убрать реакцию' : `Поставить ${emoji}`}
            >
              <span className="text-base leading-none">{emoji}</span>
              <span
                className={`font-mono text-xs ${
                  isSelected ? 'text-[#C4B5FD] font-extrabold' : 'text-[#94A3B8]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ==========================================
// Subcomponent: News Comments Section
// ==========================================
const NewsCommentsSection: React.FC<{ newsId: number }> = ({ newsId }) => {
  const { dbUser, authFetch, login } = useAuth();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Replying state
  const [replyTarget, setReplyTarget] = useState<{ id: number; username: string } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  // Editing state
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Deleting confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const res = await (dbUser ? authFetch(`/api/news/${newsId}/comments`) : fetch(`/api/news/${newsId}/comments`));
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
        setTotalCount(data.totalCount ?? (data.comments || []).length);
      }
    } catch (_e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (newsId) fetchComments();
  }, [newsId, dbUser?.id]);

  // Create Root Comment
  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbUser) {
      login();
      return;
    }
    const cleanText = commentText.trim();
    if (!cleanText) return;

    setSubmitting(true);
    try {
      const res = await authFetch(`/api/news/${newsId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: cleanText }),
      });
      if (res.ok) {
        setCommentText('');
        fetchComments();
      }
    } catch (_e) {
    } finally {
      setSubmitting(false);
    }
  };

  // Create Reply
  const handleSendReply = async (parentId: number) => {
    if (!dbUser) {
      login();
      return;
    }
    const cleanText = replyText.trim();
    if (!cleanText) return;

    setReplySubmitting(true);
    try {
      const res = await authFetch(`/api/news/${newsId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId,
          content: cleanText,
        }),
      });
      if (res.ok) {
        setReplyTarget(null);
        setReplyText('');
        fetchComments();
      }
    } catch (_e) {
    } finally {
      setReplySubmitting(false);
    }
  };

  // Edit Comment / Reply
  const handleSaveEdit = async (commentId: number) => {
    if (!dbUser) return;
    const cleanText = editText.trim();
    if (!cleanText) return;

    setEditSubmitting(true);
    try {
      const res = await authFetch(`/api/news/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: cleanText }),
      });
      if (res.ok) {
        setEditingCommentId(null);
        setEditText('');
        fetchComments();
      }
    } catch (_e) {
    } finally {
      setEditSubmitting(false);
    }
  };

  // Delete Comment / Reply
  const handleDeleteComment = async (commentId: number) => {
    if (!dbUser) return;
    try {
      const res = await authFetch(`/api/news/comments/${commentId}`, { method: 'DELETE' });
      if (res.ok) {
        setConfirmDeleteId(null);
        fetchComments();
      }
    } catch (_e) {}
  };

  // Comment Reaction toggle
  const handleCommentReaction = async (commentId: number, emoji: string) => {
    if (!dbUser) {
      login();
      return;
    }

    // Helper to update reaction on a comment node
    const updateNodeReaction = (item: CommentItem): CommentItem => {
      if (item.id === commentId) {
        const prevEmoji = item.userEmoji;
        const newCounts = { ...(item.reactionCounts || {}) };
        let nextUserEmoji: string | null = null;

        if (prevEmoji === emoji) {
          newCounts[emoji] = Math.max(0, (newCounts[emoji] || 1) - 1);
          nextUserEmoji = null;
        } else {
          if (prevEmoji && newCounts[prevEmoji]) {
            newCounts[prevEmoji] = Math.max(0, newCounts[prevEmoji] - 1);
          }
          newCounts[emoji] = (newCounts[emoji] || 0) + 1;
          nextUserEmoji = emoji;
        }

        return {
          ...item,
          reactionCounts: newCounts,
          userEmoji: nextUserEmoji,
        };
      }
      if (item.replies && item.replies.length > 0) {
        return {
          ...item,
          replies: item.replies.map(updateNodeReaction),
        };
      }
      return item;
    };

    // Optimistic update
    setComments((prev) => prev.map(updateNodeReaction));

    try {
      const res = await authFetch(`/api/news/comments/${commentId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const data = await res.json();
        const applyServerReactions = (item: CommentItem): CommentItem => {
          if (item.id === commentId) {
            return {
              ...item,
              reactionCounts: data.reactionCounts || {},
              userEmoji: data.userEmoji || null,
            };
          }
          if (item.replies && item.replies.length > 0) {
            return {
              ...item,
              replies: item.replies.map(applyServerReactions),
            };
          }
          return item;
        };
        setComments((prev) => prev.map(applyServerReactions));
      } else {
        fetchComments();
      }
    } catch (_e) {
      fetchComments();
    }
  };

  const renderRoleBadge = (role?: string) => {
    if (!role || role === 'USER') return null;
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
          Админ
        </span>
      );
    }
    if (role === 'MODERATOR') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
          Модератор
        </span>
      );
    }
    if (role === 'NEWS_EDITOR' || role === 'CONTENT_MANAGER') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30 font-mono">
          Редактор
        </span>
      );
    }
    return null;
  };

  // Render individual comment row (root or reply)
  const renderCommentCard = (comment: CommentItem, isReply: boolean = false, rootParentId?: number) => {
    const isOwner = dbUser?.id === comment.userId;
    const canModerate =
      dbUser?.role === 'ADMIN' || dbUser?.role === 'SUPER_ADMIN' || dbUser?.role === 'MODERATOR';
    const canDelete = isOwner || canModerate;
    const isEditing = editingCommentId === comment.id;
    const isReplyingToThis = replyTarget?.id === comment.id;
    const isConfirmingDelete = confirmDeleteId === comment.id;
    const isEdited =
      comment.updatedAt &&
      comment.createdAt &&
      new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 1500;

    return (
      <div
        key={comment.id}
        className={`group rounded-2xl border transition-all ${
          isReply
            ? 'bg-[#060814]/80 border-[#1E2442]/80 p-3.5 space-y-2.5'
            : 'bg-[#080A18] border-[#1E2442] p-4 sm:p-5 space-y-3'
        }`}
      >
        {/* Header: Author + Meta + Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {comment.authorAvatar ? (
              <img
                src={comment.authorAvatar}
                alt={comment.authorUsername}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl object-cover border border-[#1E2442] shrink-0"
              />
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-xs font-bold text-[#A78BFA] shrink-0">
                {comment.authorUsername ? comment.authorUsername[0].toUpperCase() : 'U'}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-xs font-bold text-[#F8FAFC] truncate">
                @{comment.authorUsername}
              </span>
              {renderRoleBadge(comment.authorRole)}
              <span className="text-[11px] text-[#64748B] font-mono shrink-0">
                {formatCommentTime(comment.createdAt)}
              </span>
              {isEdited && (
                <span className="text-[10px] text-[#64748B] italic font-mono shrink-0">
                  (изм.)
                </span>
              )}
            </div>
          </div>

          {/* Edit / Delete Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {isOwner && !isEditing && (
              <button
                type="button"
                onClick={() => {
                  setEditingCommentId(comment.id);
                  setEditText(comment.content);
                  setReplyTarget(null);
                }}
                className="p-1 rounded-lg hover:bg-[#151932] text-[#64748B] hover:text-[#CBD5E1] transition-colors cursor-pointer"
                title="Редактировать"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {canDelete && !isEditing && (
              <>
                {isConfirmingDelete ? (
                  <div className="flex items-center gap-1.5 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-lg">
                    <span className="text-[10px] text-rose-300 font-medium">Удалить?</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteComment(comment.id)}
                      className="text-[10px] font-bold text-rose-400 hover:text-rose-200 cursor-pointer underline"
                    >
                      Да
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-[10px] text-[#94A3B8] hover:text-white cursor-pointer"
                    >
                      Нет
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(comment.id)}
                    className="p-1 rounded-lg hover:bg-rose-500/15 text-[#64748B] hover:text-rose-400 transition-colors cursor-pointer"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Content or Edit Form */}
        {isEditing ? (
          <div className="space-y-2 pt-1 pl-9 sm:pl-10">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={2}
              maxLength={3000}
              className="w-full p-3 rounded-xl bg-[#0B0D20] text-xs text-[#F8FAFC] border border-[#8B5CF6] focus:outline-none resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#64748B] font-mono">
                {editText.length} / 3000
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCommentId(null)}
                  className="px-3 py-1 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-[#94A3B8] hover:text-white text-xs font-semibold cursor-pointer transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={editSubmitting || !editText.trim()}
                  onClick={() => handleSaveEdit(comment.id)}
                  className="px-3.5 py-1 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#6366F1] disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-all shadow-md"
                >
                  {editSubmitting ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs sm:text-sm text-[#CBD5E1] leading-relaxed pl-9 sm:pl-10 whitespace-pre-wrap break-words">
            {comment.content}
          </p>
        )}

        {/* Bottom Bar: Reactions & Reply Action */}
        {!isEditing && (
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1 pl-9 sm:pl-10">
            {/* Emoji Reactions Toolbar */}
            <div className="flex items-center flex-wrap gap-1.5">
              {ALLOWED_EMOJIS.map((emoji) => {
                const count = comment.reactionCounts?.[emoji] || 0;
                const isSelected = comment.userEmoji === emoji;

                // Show button if count > 0 OR if hovering toolbar / user reacted
                if (count === 0 && !isSelected) {
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleCommentReaction(comment.id, emoji)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-[#151932] text-xs cursor-pointer active:scale-95"
                      title={`Поставить ${emoji}`}
                    >
                      {emoji}
                    </button>
                  );
                }

                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleCommentReaction(comment.id, emoji)}
                    className={`px-2 py-0.5 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer select-none active:scale-95 ${
                      isSelected
                        ? 'bg-[#1E1B4B] border-[#8B5CF6] text-white ring-1 ring-[#8B5CF6]'
                        : 'bg-[#0B0D20] border-[#1E2442] text-[#94A3B8] hover:text-white hover:border-[#8B5CF6]/40'
                    }`}
                  >
                    <span>{emoji}</span>
                    <span className="font-mono text-[10px]">{count}</span>
                  </button>
                );
              })}

              {/* Quick Add Reaction Icon if no reaction yet */}
              <div className="group/picker relative inline-block">
                <button
                  type="button"
                  className="p-1 rounded-lg text-[#64748B] hover:text-[#A78BFA] hover:bg-[#151932] transition-colors cursor-pointer"
                  title="Добавить реакцию"
                >
                  <Smile className="w-3.5 h-3.5" />
                </button>
                {/* Hover Popover */}
                <div className="absolute left-0 bottom-full mb-1 hidden group-hover/picker:flex items-center gap-1 p-1.5 rounded-xl bg-[#0B0D20] border border-[#1E2442] shadow-xl z-20 animate-fade-in">
                  {ALLOWED_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleCommentReaction(comment.id, emoji)}
                      className="p-1 rounded hover:bg-[#151932] text-base hover:scale-125 transition-transform cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Reply Button */}
            <button
              type="button"
              onClick={() => {
                if (!dbUser) {
                  login();
                  return;
                }
                const threadId = rootParentId || comment.id;
                setReplyTarget({ id: threadId, username: comment.authorUsername });
                setReplyText(`@${comment.authorUsername}, `);
                setEditingCommentId(null);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold text-[#94A3B8] hover:text-[#A78BFA] hover:bg-[#151932] transition-colors cursor-pointer"
            >
              <CornerDownRight className="w-3 h-3" />
              <span>Ответить</span>
            </button>
          </div>
        )}

        {/* Inline Reply Form (Shown if replying to this specific card) */}
        {isReplyingToThis && (
          <div className="pt-2 pl-9 sm:pl-10 space-y-2 animate-fade-in">
            <div className="flex items-center justify-between text-[11px] text-[#A78BFA]">
              <span className="flex items-center gap-1">
                <CornerDownRight className="w-3.5 h-3.5" />
                Ответ для @{replyTarget.username}
              </span>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="text-[#64748B] hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Напишите ответ...`}
              rows={2}
              maxLength={3000}
              autoFocus
              className="w-full p-3 rounded-xl bg-[#0B0D20] text-xs text-[#F8FAFC] border border-[#8B5CF6] focus:outline-none resize-none leading-relaxed"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="px-3 py-1 rounded-lg bg-[#151932] text-[#94A3B8] hover:text-white text-xs font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={replySubmitting || !replyText.trim()}
                onClick={() => handleSendReply(rootParentId || comment.id)}
                className="px-3.5 py-1 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#6366F1] disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-all shadow-md"
              >
                {replySubmitting ? 'Отправка...' : 'Ответить'}
              </button>
            </div>
          </div>
        )}

        {/* Nested Replies List (1 level of visual hierarchy) */}
        {!isReply && comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 ml-2 sm:ml-8 pl-3 sm:pl-4 border-l-2 border-[#1E2442] space-y-2.5 pt-2">
            {comment.replies.map((reply) => renderCommentCard(reply, true, comment.id))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pt-8 border-t border-[#1E2442] space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-[#F8FAFC] flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#8B5CF6]" />
          Комментарии
          <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[#151932] text-[#A78BFA] border border-[#1E2442]">
            {totalCount}
          </span>
        </h3>
      </div>

      {/* Input box / Auth Gate */}
      {dbUser ? (
        <form onSubmit={handleSendComment} className="space-y-3 bg-[#080A18] p-4 sm:p-5 rounded-2xl border border-[#1E2442]">
          <div className="flex items-center gap-2.5">
            {dbUser.avatar ? (
              <img
                src={dbUser.avatar}
                alt={dbUser.username}
                className="w-8 h-8 rounded-xl object-cover border border-[#1E2442]"
              />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-xs font-bold text-[#A78BFA]">
                {dbUser.username ? dbUser.username[0].toUpperCase() : 'U'}
              </div>
            )}
            <span className="text-xs font-bold text-[#F8FAFC]">
              @{dbUser.username}
            </span>
          </div>

          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Поделитесь своим мнением о новости..."
            rows={3}
            maxLength={3000}
            className="w-full p-3.5 rounded-2xl bg-[#0B0D20] text-xs sm:text-sm text-[#F8FAFC] placeholder-[#64748B] border border-[#1E2442] focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#8B5CF6] outline-none transition-all resize-none leading-relaxed"
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#64748B] font-mono">
              {commentText.length} / 3000
            </span>
            <button
              type="submit"
              disabled={submitting || !commentText.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:from-[#6D28D9] hover:to-[#4F46E5] disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-[#8B5CF6]/20"
            >
              {submitting ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Отправка...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Отправить</span>
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="p-5 rounded-2xl bg-[#080A18] border border-[#1E2442] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="space-y-1">
            <p className="text-xs sm:text-sm font-bold text-[#F8FAFC]">
              Хотите оставить комментарий или реакцию?
            </p>
            <p className="text-xs text-[#94A3B8]">
              Войдите в свой профиль Dodik Tracker, чтобы участвовать в обсуждении.
            </p>
          </div>
          <button
            type="button"
            onClick={login}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:from-[#6D28D9] hover:to-[#4F46E5] text-white text-xs font-bold transition-all cursor-pointer shadow-md shrink-0"
          >
            <LogIn className="w-4 h-4" />
            Войти в аккаунт
          </button>
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-4 pt-2">
        {comments.map((comment) => renderCommentCard(comment, false))}

        {comments.length === 0 && !loading && (
          <div className="p-8 rounded-2xl bg-[#080A18]/50 border border-[#1E2442]/50 text-center space-y-2">
            <MessageSquare className="w-8 h-8 mx-auto text-[#64748B]" />
            <p className="text-xs font-medium text-[#94A3B8]">
              Комментариев пока нет. Будьте первым, кто выскажет своё мнение!
            </p>
          </div>
        )}

        {loading && (
          <div className="py-6 flex justify-center">
            <RotateCw className="w-6 h-6 text-[#8B5CF6] animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
};

