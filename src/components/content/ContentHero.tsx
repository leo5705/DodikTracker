import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Star,
  Bookmark,
  Share2,
  Award,
  CheckCircle2,
  Play,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Globe,
  Heart,
  BookOpen,
  Film,
  Music,
  Headphones,
} from 'lucide-react';
import { UnifiedContentItem, ContentType } from '../../types/content.ts';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

interface ContentHeroProps {
  item: UnifiedContentItem;
  userTracking?: any;
  onStatusChange?: (status: string) => Promise<void>;
  onToggleFavorite?: () => Promise<void>;
  onOpenRatingModal?: () => void;
  onOpenReviewModal?: () => void;
  onOpenListModal?: () => void;
  onOpenShareModal?: () => void;
}

export const ContentHero: React.FC<ContentHeroProps> = ({
  item,
  userTracking,
  onStatusChange,
  onToggleFavorite,
  onOpenRatingModal,
  onOpenReviewModal,
  onOpenListModal,
  onOpenShareModal,
}) => {
  const { navigate } = useRouter();
  const { dbUser } = useAuth();
  const [statusLoading, setStatusLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [posterError, setPosterError] = useState(false);

  const currentStatus = userTracking?.status;
  const currentScore = userTracking?.score || userTracking?.rating;
  const isFavorite = Boolean(userTracking?.isFavorite);

  const handleStatusClick = async (status: string) => {
    if (!onStatusChange) return;
    setStatusLoading(true);
    try {
      await onStatusChange(status);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleShare = async () => {
    if (onOpenShareModal) {
      onOpenShareModal();
      return;
    }
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          text: `Смотри ${item.title} на Dodik Tracker!`,
          url,
        });
        return;
      } catch (_e) {}
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper for critic score badge colors
  const getCriticBadgeColor = (score: number, max: number = 100) => {
    const normalized = max === 10 ? score * 10 : score;
    if (normalized >= 75) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    if (normalized >= 50) return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
  };

  // Category-specific status labels & icons
  const getStatusButtonsConfig = (type: ContentType) => {
    switch (type) {
      case 'BOOK':
      case 'MANGA':
      case 'COMIC':
        return [
          { id: 'PLAN_TO_READ', fallbackId: 'PLANNING', label: 'Буду читать', icon: Bookmark, activeBg: 'bg-blue-600 border-blue-500 shadow-blue-500/20' },
          { id: 'READING', fallbackId: 'IN_PROGRESS', label: 'Читаю', icon: BookOpen, activeBg: 'bg-amber-600 border-amber-500 shadow-amber-500/20' },
          { id: 'COMPLETED', fallbackId: 'COMPLETED', label: 'Прочитано', icon: CheckCircle2, activeBg: 'bg-emerald-600 border-emerald-500 shadow-emerald-500/20' },
          { id: 'DROPPED', fallbackId: 'DROPPED', label: 'Дропнул', icon: RotateCcw, activeBg: 'bg-rose-600 border-rose-500 shadow-rose-500/20' },
        ];
      case 'MUSIC':
        return [
          { id: 'PLAN_TO_LISTEN', fallbackId: 'PLANNING', label: 'Буду слушать', icon: Bookmark, activeBg: 'bg-blue-600 border-blue-500 shadow-blue-500/20' },
          { id: 'LISTENING', fallbackId: 'IN_PROGRESS', label: 'Слушаю', icon: Headphones, activeBg: 'bg-amber-600 border-amber-500 shadow-amber-500/20' },
          { id: 'COMPLETED', fallbackId: 'COMPLETED', label: 'Прослушано', icon: CheckCircle2, activeBg: 'bg-emerald-600 border-emerald-500 shadow-emerald-500/20' },
          { id: 'DROPPED', fallbackId: 'DROPPED', label: 'Дропнул', icon: RotateCcw, activeBg: 'bg-rose-600 border-rose-500 shadow-rose-500/20' },
        ];
      case 'GAME':
        return [
          { id: 'PLANNING', fallbackId: 'PLAN_TO_PLAY', label: 'Буду играть', icon: Bookmark, activeBg: 'bg-blue-600 border-blue-500 shadow-blue-500/20' },
          { id: 'IN_PROGRESS', fallbackId: 'PLAYING', label: 'Играю', icon: Play, activeBg: 'bg-amber-600 border-amber-500 shadow-amber-500/20' },
          { id: 'COMPLETED', fallbackId: 'COMPLETED', label: 'Пройдено', icon: CheckCircle2, activeBg: 'bg-emerald-600 border-emerald-500 shadow-emerald-500/20' },
          { id: 'DROPPED', fallbackId: 'DROPPED', label: 'Дропнул', icon: RotateCcw, activeBg: 'bg-rose-600 border-rose-500 shadow-rose-500/20' },
        ];
      case 'MOVIE':
      case 'TV':
      case 'ANIME':
      default:
        return [
          { id: 'PLAN_TO_WATCH', fallbackId: 'PLANNING', label: 'Буду смотреть', icon: Bookmark, activeBg: 'bg-blue-600 border-blue-500 shadow-blue-500/20' },
          { id: 'WATCHING', fallbackId: 'IN_PROGRESS', label: 'Смотрю', icon: Play, activeBg: 'bg-amber-600 border-amber-500 shadow-amber-500/20' },
          { id: 'COMPLETED', fallbackId: 'COMPLETED', label: 'Посмотрел', icon: CheckCircle2, activeBg: 'bg-emerald-600 border-emerald-500 shadow-emerald-500/20' },
          { id: 'DROPPED', fallbackId: 'DROPPED', label: 'Дропнул', icon: RotateCcw, activeBg: 'bg-rose-600 border-rose-500 shadow-rose-500/20' },
        ];
    }
  };

  const statusButtons = getStatusButtonsConfig(item.type);
  const backdrop = item.backdropUrl || item.posterUrl;

  // Aspect ratio depends on type
  const isSquarePoster = item.type === 'MUSIC';
  const posterAspectClass = isSquarePoster ? 'aspect-square' : 'aspect-[2/3]';

  // Format genres
  const genresList: string[] = Array.isArray(item.genres)
    ? item.genres.map((g) => (typeof g === 'string' ? g : g.name))
    : typeof item.genres === 'string'
    ? (item.genres as string).split(',').map((g) => g.trim())
    : [];

  return (
    <div className="relative rounded-3xl overflow-hidden bg-zinc-900/90 border border-zinc-800 shadow-2xl mb-8">
      {/* Dynamic Ambient Backdrop */}
      {backdrop && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <img
            src={backdrop}
            alt={item.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-top opacity-20 filter blur-xl scale-110 transform"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
        </div>
      )}

      {/* Main Content Container */}
      <div className="relative z-10 p-6 md:p-8 lg:p-10 flex flex-col md:flex-row gap-8 items-start">
        {/* Poster Card */}
        <div className="w-full md:w-64 lg:w-72 shrink-0 flex flex-col items-center">
          <div className={`relative w-full ${posterAspectClass} rounded-2xl overflow-hidden border border-zinc-700/60 shadow-2xl bg-zinc-950 group`}>
            {item.posterUrl && !posterError ? (
              <img
                src={item.posterUrl}
                alt={item.title}
                referrerPolicy="no-referrer"
                onError={() => setPosterError(true)}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 p-4 text-center">
                <Sparkles className="w-12 h-12 mb-2 stroke-1" />
                <span className="text-xs">Нет обложки</span>
              </div>
            )}

            {/* Age Rating Badge */}
            {item.ageRating && (
              <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-zinc-700 text-[10px] font-bold text-zinc-200 tracking-wider font-mono">
                {item.ageRating}
              </div>
            )}
          </div>

          {/* Provider / Source Badges */}
          {item.provider && (
            <div className="mt-3 flex items-center gap-1.5 flex-wrap justify-center">
              <span className="px-2.5 py-0.5 rounded-full bg-purple-950/60 border border-purple-800/40 text-[10px] font-medium text-purple-300">
                {item.provider}
              </span>
              {item.format && (
                <span className="px-2.5 py-0.5 rounded-full bg-sky-950/60 border border-sky-800/40 text-[10px] font-medium text-sky-300">
                  {item.format}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Info & Action Controls */}
        <div className="flex-1 w-full flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            {/* Title block */}
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-zinc-100 tracking-tight leading-tight">
                {item.title}
              </h1>
              {item.originalTitle && item.originalTitle !== item.title && (
                <p className="text-sm md:text-base text-zinc-400 font-medium mt-1 italic">
                  {item.originalTitle}
                </p>
              )}
            </div>

            {/* Key Metadata Badges */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-zinc-300">
              {item.releaseDate && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/70 border border-zinc-700/50">
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  <span>
                    {(() => {
                      const d = new Date(item.releaseDate);
                      if (!isNaN(d.getTime())) {
                        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
                      }
                      return item.releaseDate;
                    })()}
                  </span>
                </div>
              )}

              {!item.releaseDate && item.year && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/70 border border-zinc-700/50">
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  <span>{item.year} год</span>
                </div>
              )}

              {item.durationText && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/70 border border-zinc-700/50">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span>{item.durationText}</span>
                </div>
              )}

              {item.totalEpisodes !== undefined && item.totalEpisodes > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/70 border border-zinc-700/50">
                  <Film className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {item.totalSeasons ? `${item.totalSeasons} сез. • ` : ''}
                    {item.totalEpisodes} эп.
                  </span>
                </div>
              )}

              {item.totalPages !== undefined && item.totalPages > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/70 border border-zinc-700/50">
                  <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>{item.totalPages} стр.</span>
                </div>
              )}

              {item.totalChapters !== undefined && item.totalChapters > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/70 border border-zinc-700/50">
                  <BookOpen className="w-3.5 h-3.5 text-pink-400" />
                  <span>
                    {item.totalVolumes ? `${item.totalVolumes} том. • ` : ''}
                    {item.totalChapters} глав
                  </span>
                </div>
              )}

              {item.countries && item.countries.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/70 border border-zinc-700/50">
                  <Globe className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{item.countries.slice(0, 2).join(', ')}</span>
                </div>
              )}

              {item.statusText && (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 font-semibold">
                  {item.statusText}
                </div>
              )}

              {item.website && (
                <a
                  href={item.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/70 border border-zinc-700/50 hover:text-purple-400 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
                  <span>Сайт</span>
                </a>
              )}
            </div>

            {/* Ratings Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              {/* 1. Global / Provider Rating */}
              {item.rating !== undefined && item.rating > 0 && (
                <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-950/50 border border-purple-800/50 flex items-center justify-center text-purple-400 shrink-0">
                    <Star className="w-5 h-5 fill-purple-400/20" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-zinc-100 flex items-baseline gap-1">
                      <span>{Number(item.rating).toFixed(1)}</span>
                      <span className="text-[10px] text-zinc-500 font-normal">/ 10</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      {item.ratingCount ? `${item.ratingCount} оценок` : `Рейтинг ${item.provider || 'базы'}`}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Critic Score / MAL / Metacritic if available */}
              {item.criticScore && (
                <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center font-black text-sm shrink-0 ${getCriticBadgeColor(item.criticScore.score, item.criticScore.maxScore)}`}>
                    {item.criticScore.score}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-zinc-200 truncate">{item.criticScore.source}</div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      {item.criticScore.url ? (
                        <a href={item.criticScore.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-purple-400">
                          Критики
                        </a>
                      ) : (
                        'Оценка критиков'
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Dodik Tracker User Rating */}
              <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg font-bold text-zinc-100">
                    {currentScore ? (
                      <span className="text-amber-400">{currentScore} / 10</span>
                    ) : item.dodikRating?.averageRating ? (
                      <span>{item.dodikRating.averageRating.toFixed(1)} <span className="text-[10px] text-zinc-500 font-normal">/ 10</span></span>
                    ) : (
                      <span className="text-zinc-500 text-xs">Не оценено</span>
                    )}
                  </div>
                  <button
                    onClick={onOpenRatingModal}
                    className="text-[10px] text-purple-400 hover:underline text-left block"
                  >
                    {currentScore ? 'Изменить оценку' : 'Оценить тайтл'}
                  </button>
                </div>
              </div>
            </div>

            {/* Genres & Tags Chips */}
            {genresList.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {genresList.map((genre, idx) => (
                  <button
                    key={idx}
                    onClick={() => navigate(`/search?type=${item.type}&genre=${encodeURIComponent(genre)}`)}
                    className="px-2.5 py-1 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-300 text-xs font-medium hover:bg-purple-900/60 transition-colors"
                  >
                    {genre}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Interactive Library Status & User Action Panel */}
          <div className="pt-4 border-t border-zinc-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Status Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
              {statusButtons.map((btn) => {
                const Icon = btn.icon;
                const isSelected = currentStatus === btn.id || currentStatus === btn.fallbackId;
                return (
                  <button
                    key={btn.id}
                    onClick={() => handleStatusClick(btn.id)}
                    disabled={statusLoading}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                      isSelected
                        ? `${btn.activeBg} text-white shadow-lg`
                        : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:border-zinc-500 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{btn.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Secondary Action Buttons */}
            <div className="flex items-center gap-2 justify-end">
              {onToggleFavorite && (
                <button
                  onClick={onToggleFavorite}
                  className={`p-2 rounded-xl border transition-all ${
                    isFavorite
                      ? 'bg-rose-950/60 border-rose-800/50 text-rose-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={isFavorite ? 'В избранном' : 'Добавить в избранное'}
                >
                  <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                </button>
              )}

              {onOpenReviewModal && (
                <button
                  onClick={onOpenReviewModal}
                  className="px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium hover:bg-zinc-700 transition-colors"
                >
                  Рецензия
                </button>
              )}

              {onOpenListModal && (
                <button
                  onClick={onOpenListModal}
                  className="px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium hover:bg-zinc-700 transition-colors"
                  title="Добавить в список"
                >
                  В список
                </button>
              )}

              <button
                onClick={handleShare}
                className="p-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                title="Поделиться"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {copied && (
            <p className="text-[11px] text-emerald-400 text-right">Ссылка скопирована в буфер обмена!</p>
          )}
        </div>
      </div>
    </div>
  );
};
