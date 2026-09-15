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
} from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';

interface NewsDetailViewProps {
  slug: string;
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
      <div className="space-y-4 text-sm sm:text-base text-zinc-200 leading-relaxed font-sans">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <div key={idx} className="h-2" />;
          }
          if (trimmed.startsWith('### ')) {
            return (
              <h3 key={idx} className="text-lg font-bold text-[#F3F1F8] pt-3 pb-1">
                {trimmed.replace(/^###\s+/, '')}
              </h3>
            );
          }
          if (trimmed.startsWith('## ')) {
            return (
              <h2 key={idx} className="text-xl font-bold text-[#F3F1F8] pt-4 pb-1 border-b border-[#252233]">
                {trimmed.replace(/^##\s+/, '')}
              </h2>
            );
          }
          if (trimmed.startsWith('# ')) {
            return (
              <h1 key={idx} className="text-2xl font-extrabold text-[#F3F1F8] pt-4 pb-2">
                {trimmed.replace(/^#\s+/, '')}
              </h1>
            );
          }
          if (trimmed.startsWith('> ')) {
            return (
              <blockquote
                key={idx}
                className="p-4 my-2 border-l-4 border-[#9B6BFF] bg-[#14131A] rounded-r-xl text-zinc-300 italic"
              >
                {trimmed.replace(/^>\s+/, '')}
              </blockquote>
            );
          }
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            return (
              <div key={idx} className="flex items-start gap-2.5 pl-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#9B6BFF] mt-2 shrink-0" />
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
        <RotateCw className="w-8 h-8 text-[#9B6BFF] animate-spin" />
        <span className="text-sm text-[#9A94AA]">Загрузка новости...</span>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
        <Newspaper className="w-12 h-12 mx-auto text-zinc-600" />
        <h2 className="text-xl font-bold text-zinc-200">Новость недоступна</h2>
        <p className="text-xs text-zinc-400">{error || 'Публикация не найдена'}</p>
        <button
          onClick={() => navigate('/news')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#9B6BFF] text-white text-xs font-bold"
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
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#14131A] hover:bg-[#252233] border border-[#252233] text-xs font-semibold text-[#F3F1F8] transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-[#9A94AA]" />
          Все новости
        </button>

        <button
          onClick={handleCopyLink}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#14131A] hover:bg-[#252233] border border-[#252233] text-xs font-semibold text-[#F3F1F8] transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400">Ссылка скопирована!</span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4 text-[#9A94AA]" />
              <span>Поделиться</span>
            </>
          )}
        </button>
      </div>

      {/* Main Card */}
      <article className="rounded-3xl bg-[#14131A] border border-[#252233] overflow-hidden shadow-2xl">
        {/* Cover Image */}
        {article.cover && (
          <div className="relative w-full max-h-96 overflow-hidden bg-[#0F0E12] border-b border-[#252233]">
            <img
              src={article.cover}
              alt={article.title}
              className="w-full h-full object-cover max-h-96"
            />
          </div>
        )}

        <div className="p-6 sm:p-10 space-y-6">
          {/* Badges & Meta Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#9A94AA]">
            <div className="flex items-center gap-2">
              {article.isPinned && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <Pin className="w-3 h-3 fill-amber-400" /> Закреплено
                </span>
              )}
              {article.isFeatured && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-500/15 border border-purple-500/30 text-purple-400">
                  <Star className="w-3 h-3 fill-purple-400" /> Главная новость
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
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
          <h1 className="text-2xl sm:text-4xl font-extrabold text-[#F3F1F8] leading-tight tracking-tight">
            {article.title}
          </h1>

          {/* Author Badge */}
          <div className="flex items-center gap-3 py-3 border-y border-[#252233]">
            {article.authorAvatar ? (
              <img
                src={article.authorAvatar}
                alt={article.authorUsername}
                className="w-10 h-10 rounded-full object-cover border border-[#252233]"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#1C1A27] border border-[#252233] flex items-center justify-center text-zinc-400">
                <User className="w-5 h-5" />
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-[#F3F1F8]">@{article.authorUsername || 'admin'}</p>
              <p className="text-[11px] text-[#9A94AA]">Команда Dodik Tracker</p>
            </div>
          </div>

          {/* Excerpt if present */}
          {article.excerpt && (
            <p className="text-base text-zinc-300 font-medium italic border-l-4 border-[#9B6BFF] pl-4 py-1 leading-relaxed bg-[#191724]/40 rounded-r-xl">
              {article.excerpt}
            </p>
          )}

          {/* Content */}
          <div className="pt-2">
            {renderFormattedContent(article.content)}
          </div>

          {/* Tags Footer */}
          {tags.length > 0 && (
            <div className="pt-6 border-t border-[#252233] flex flex-wrap items-center gap-2">
              <Tag className="w-4 h-4 text-[#9A94AA]" />
              {tags.map((tag, idx) => (
                <span
                  key={idx}
                  onClick={() => navigate(`/news?tag=${encodeURIComponent(tag)}`)}
                  className="px-3 py-1 rounded-xl text-xs font-semibold bg-[#1C1A27] hover:bg-[#9B6BFF]/20 text-[#9A94AA] hover:text-[#C9A9FF] border border-[#252233] cursor-pointer transition-colors"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  );
};
