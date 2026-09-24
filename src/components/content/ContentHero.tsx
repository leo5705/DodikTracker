import React, { useState, useEffect } from 'react';
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
  Gamepad2,
  ChevronDown,
  Plus,
  MessageSquarePlus,
  Edit3,
  Check,
  Flame,
  X,
} from 'lucide-react';
import { UnifiedContentItem, ContentType } from '../../types/content.ts';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { normalizeAgeRating } from '../../utils/ageRating.ts';
import { parseVideo } from '../../utils/videoUtils.ts';
import { RatingBadge, CategoryBadge, RatingControl, DodikRatingData } from '../design-system/index.ts';

interface ContentHeroProps {
  item: UnifiedContentItem;
  userTracking?: any;
  onStatusChange?: (status: string) => Promise<void>;
  onProgressUpdate?: (newProgress: number) => Promise<void>;
  onToggleFavorite?: () => Promise<void>;
  onOpenRatingModal?: () => void;
  onOpenReviewModal?: () => void;
  onOpenListModal?: () => void;
  onOpenShareModal?: () => void;
  onRatingUpdated?: (newRating: number | null, newDodikData?: DodikRatingData) => void;
}

export const ContentHero: React.FC<ContentHeroProps> = ({
  item,
  userTracking,
  onStatusChange,
  onProgressUpdate,
  onToggleFavorite,
  onOpenRatingModal,
  onOpenReviewModal,
  onOpenListModal,
  onOpenShareModal,
  onRatingUpdated,
}) => {
  const { navigate } = useRouter();
  const { dbUser } = useAuth();
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [posterError, setPosterError] = useState(false);

  const currentStatus = userTracking?.status;
  const currentScore = userTracking?.score || userTracking?.rating;
  const isFavorite = Boolean(userTracking?.isFavorite);
  const progress = userTracking?.progress || 0;
  const progressTotal =
    userTracking?.progressTotal ||
    item.totalEpisodes ||
    item.totalChapters ||
    item.totalPages ||
    0;

  // Category-specific status configs
  const getStatusOptions = (type: ContentType) => {
    switch (type) {
      case 'BOOK':
      case 'MANGA':
      case 'COMIC':
        return [
          { id: 'PLAN_TO_READ', label: 'Буду читать', icon: Bookmark, color: 'text-sky-400' },
          { id: 'READING', label: 'Читаю', icon: BookOpen, color: 'text-amber-400' },
          { id: 'COMPLETED', label: 'Прочитано', icon: CheckCircle2, color: 'text-emerald-400' },
          { id: 'DROPPED', label: 'Брошено', icon: RotateCcw, color: 'text-rose-400' },
        ];
      case 'MUSIC':
        return [
          { id: 'PLAN_TO_LISTEN', label: 'Буду слушать', icon: Bookmark, color: 'text-sky-400' },
          { id: 'LISTENING', label: 'Слушаю', icon: Headphones, color: 'text-amber-400' },
          { id: 'COMPLETED', label: 'Прослушано', icon: CheckCircle2, color: 'text-emerald-400' },
          { id: 'DROPPED', label: 'Брошено', icon: RotateCcw, color: 'text-rose-400' },
        ];
      case 'GAME':
        return [
          { id: 'PLANNING', label: 'Буду играть', icon: Bookmark, color: 'text-sky-400' },
          { id: 'IN_PROGRESS', label: 'Прохожу', icon: Play, color: 'text-amber-400' },
          { id: 'COMPLETED', label: 'Пройдено', icon: CheckCircle2, color: 'text-emerald-400' },
          { id: 'DROPPED', label: 'Брошено', icon: RotateCcw, color: 'text-rose-400' },
        ];
      case 'MOVIE':
      case 'TV':
      case 'ANIME':
      default:
        return [
          { id: 'PLAN_TO_WATCH', label: 'Буду смотреть', icon: Bookmark, color: 'text-sky-400' },
          { id: 'WATCHING', label: 'Смотрю', icon: Play, color: 'text-amber-400' },
          { id: 'COMPLETED', label: 'Просмотрено', icon: CheckCircle2, color: 'text-emerald-400' },
          { id: 'DROPPED', label: 'Брошено', icon: RotateCcw, color: 'text-rose-400' },
        ];
    }
  };

  const statusOptions = getStatusOptions(item.type);
  const currentStatusObj = statusOptions.find(
    (s) => s.id === currentStatus || (s.id === 'PLAN_TO_WATCH' && currentStatus === 'PLANNING')
  );

  const handleStatusSelect = async (statusId: string) => {
    setStatusDropdownOpen(false);
    if (!onStatusChange) return;
    setStatusLoading(true);
    try {
      await onStatusChange(statusId);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleIncrementProgress = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onProgressUpdate) return;
    const nextVal = progressTotal > 0 ? Math.min(progressTotal, progress + 1) : progress + 1;
    await onProgressUpdate(nextVal);
  };

  const backdrop = item.backdropUrl || item.posterUrl;
  const isSquarePoster = item.type === 'MUSIC';
  const posterAspectClass = isSquarePoster ? 'aspect-square' : 'aspect-[2/3]';
  const rawTrailer = item.trailerUrl || (item.videos && item.videos[0]?.url) || (item.videos && item.videos[0]);
  const parsedTrailer = parseVideo(rawTrailer);
  const [showTrailerModal, setShowTrailerModal] = useState(false);

  // Close trailer modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTrailerModal(false);
      }
    };
    if (showTrailerModal) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTrailerModal]);

  const genresList: string[] = Array.isArray(item.genres)
    ? item.genres.map((g) => (typeof g === 'string' ? g : g.name))
    : typeof item.genres === 'string'
    ? (item.genres as string).split(',').map((g) => g.trim())
    : [];

  return (
    <div className="relative rounded-3xl overflow-hidden bg-[#0B0D20] border border-[#1E2442] shadow-2xl mb-8">
      {/* 1. Immersive Large Backdrop with Rich Gradient Overlay */}
      {backdrop && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <img
            src={backdrop}
            alt={item.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center opacity-25 filter blur-xs scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#080A18] via-[#080A18]/85 to-[#080A18]/40" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#080A18] via-[#080A18]/60 to-transparent" />
        </div>
      )}

      {/* 2. Hero Content: Poster on Left/Bottom, Rich Info & Actions on Right */}
      <div className="relative z-10 p-6 md:p-8 lg:p-10 flex flex-col md:flex-row gap-8 items-start">
        {/* Left: Poster */}
        <div className="w-full md:w-64 lg:w-72 shrink-0 flex flex-col items-center">
          <div
            className={`relative w-full ${posterAspectClass} rounded-2xl overflow-hidden border border-[#1E2442] shadow-2xl bg-[#080A18] group`}
          >
            {item.posterUrl && !posterError ? (
              <img
                src={item.posterUrl}
                alt={item.title}
                referrerPolicy="no-referrer"
                onError={() => setPosterError(true)}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[#64748B] p-4 text-center">
                <Sparkles className="w-12 h-12 mb-2 stroke-1" />
                <span className="text-xs">Нет постера</span>
              </div>
            )}

            {/* Category Tag (Top-left) */}
            <div className="absolute top-3 left-3 z-10">
              <CategoryBadge type={item.type} size="md" />
            </div>

            {/* Age Rating Badge (Top-right) */}
            {(() => {
              const norm = normalizeAgeRating(item.ageRating, item.provider);
              if (!norm) return null;
              return (
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-[#080A18]/90 backdrop-blur-md border border-[#1E2442] text-[10px] font-bold text-[#F8FAFC] tracking-wider font-mono shadow-md">
                  {norm.displayText}
                </div>
              );
            })()}
          </div>

          {/* Source / Platform / Provider Badges */}
          <div className="mt-3 flex items-center gap-1.5 flex-wrap justify-center">
            {item.provider && (
              <span className="px-2.5 py-0.5 rounded-lg bg-[#151932] border border-[#8B5CF6]/30 text-[10px] font-medium text-[#A78BFA]">
                {item.provider}
              </span>
            )}
            {item.format && (
              <span className="px-2.5 py-0.5 rounded-lg bg-[#151932] border border-sky-500/30 text-[10px] font-medium text-sky-300">
                {item.format}
              </span>
            )}
          </div>
        </div>

        {/* Right: Info, Ratings, User Status, Progress, and Action CTAs */}
        <div className="flex-1 w-full flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            {/* Title & Original Title */}
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-[#F8FAFC] tracking-tight leading-tight">
                {item.title}
              </h1>
              {item.originalTitle && item.originalTitle !== item.title && (
                <p className="text-sm md:text-base text-[#94A3B8] font-medium mt-1 italic">
                  {item.originalTitle}
                </p>
              )}
            </div>

            {/* Metadata Tags: Year, Country, Duration / Length */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#CBD5E1]">
              {item.year && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B0D20]/90 border border-[#1E2442]">
                  <Calendar className="w-3.5 h-3.5 text-[#A78BFA]" />
                  <span>{item.year}</span>
                </div>
              )}

              {item.countries && item.countries.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B0D20]/90 border border-[#1E2442]">
                  <Globe className="w-3.5 h-3.5 text-[#94A3B8]" />
                  <span>{item.countries.slice(0, 2).join(', ')}</span>
                </div>
              )}

              {item.durationText && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B0D20]/90 border border-[#1E2442]">
                  <Clock className="w-3.5 h-3.5 text-[#A78BFA]" />
                  <span>{item.durationText}</span>
                </div>
              )}

              {item.statusText && (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold text-xs">
                  {item.statusText}
                </div>
              )}
            </div>

            {/* Genres Chips */}
            {genresList.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {genresList.map((genre) => (
                  <span
                    key={genre}
                    className="px-2.5 py-1 rounded-lg bg-[#151932] border border-[#1E2442] text-[11px] font-medium text-[#CBD5E1] hover:border-[#8B5CF6]/40 transition-colors"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* Rating Display Block */}
            <div className="pt-2">
              <RatingControl
                mediaId={item.id}
                itemTitle={item.title}
                mediaPayload={item}
                externalRating={item.rating}
                externalRatings={item.externalRatings}
                dodikRating={item.dodikRating}
                userRating={currentScore}
                onRatingUpdated={(newRating, newDodikData) => {
                  onRatingUpdated?.(newRating, newDodikData);
                }}
              />
            </div>

            {/* User Tracking & Progress Banner */}
            {dbUser && (
              <div className="p-3.5 rounded-2xl bg-[#080A18]/80 border border-[#1E2442] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#94A3B8]">Ваш статус:</span>
                    {currentStatusObj ? (
                      <span className={`text-xs font-bold ${currentStatusObj.color} flex items-center gap-1.5`}>
                        <currentStatusObj.icon className="w-3.5 h-3.5" />
                        {currentStatusObj.label}
                      </span>
                    ) : (
                      <span className="text-xs text-[#64748B]">Не отслеживается</span>
                    )}
                  </div>

                  {currentScore && (
                    <div className="flex items-center gap-1 pl-3 border-l border-[#1E2442] text-xs font-mono font-bold text-amber-400">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      <span>{currentScore}/10</span>
                    </div>
                  )}
                </div>

                {/* Progress Tracker (e.g. 12 / 24 or Pages) */}
                {(progressTotal > 0 || progress > 0) && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#CBD5E1]">
                      Прогресс: <b className="text-white">{progress}</b>
                      {progressTotal > 0 ? ` / ${progressTotal}` : ''}
                    </span>
                    {onProgressUpdate && (
                      <button
                        onClick={handleIncrementProgress}
                        className="px-2 py-1 rounded-lg bg-[#151932] hover:bg-[#8B5CF6]/20 border border-[#1E2442] hover:border-[#8B5CF6]/50 text-xs font-bold text-[#A78BFA] transition-colors cursor-pointer"
                        title="Добавить +1"
                      >
                        +1
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Action Buttons & CTAs */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[#1E2442]">
            {/* Main CTA: «Изменить статус» (Dropdown) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setStatusDropdownOpen((prev) => !prev)}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:from-[#6D28D9] hover:to-[#4F46E5] text-white text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-[#7C3AED]/25 transition-all cursor-pointer"
              >
                {currentStatusObj ? (
                  <currentStatusObj.icon className="w-4 h-4" />
                ) : (
                  <Bookmark className="w-4 h-4" />
                )}
                <span>{currentStatusObj ? currentStatusObj.label : 'Изменить статус'}</span>
                <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70" />
              </button>

              {/* Status Dropdown Menu */}
              {statusDropdownOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-52 rounded-2xl bg-[#0B0D20] border border-[#1E2442] shadow-2xl p-1.5 z-50 space-y-1 animate-fadeIn">
                  {statusOptions.map((st) => {
                    const isCur = currentStatus === st.id;
                    const StIcon = st.icon;
                    return (
                      <button
                        key={st.id}
                        onClick={() => handleStatusSelect(st.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left ${
                          isCur
                            ? 'bg-[#151932] text-white border border-[#8B5CF6]/40'
                            : 'text-[#CBD5E1] hover:bg-[#11152A] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <StIcon className={`w-3.5 h-3.5 ${st.color}`} />
                          <span>{st.label}</span>
                        </div>
                        {isCur && <Check className="w-3.5 h-3.5 text-[#A78BFA]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Дополнительно: «Оценить» */}
            {onOpenRatingModal && (
              <button
                type="button"
                onClick={onOpenRatingModal}
                className="px-3.5 py-2.5 rounded-xl bg-[#11152A] hover:bg-[#151932] text-[#CBD5E1] hover:text-white border border-[#1E2442] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Star className="w-3.5 h-3.5 text-amber-400" />
                <span>{currentScore ? `Оценка: ${currentScore}` : 'Оценить'}</span>
              </button>
            )}

            {/* Дополнительно: «Добавить отзыв» */}
            {onOpenReviewModal && (
              <button
                type="button"
                onClick={onOpenReviewModal}
                className="px-3.5 py-2.5 rounded-xl bg-[#11152A] hover:bg-[#151932] text-[#CBD5E1] hover:text-white border border-[#1E2442] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#A78BFA]" />
                <span>Добавить отзыв</span>
              </button>
            )}

            {/* Дополнительно: «Добавить в список» */}
            {onOpenListModal && (
              <button
                type="button"
                onClick={onOpenListModal}
                className="px-3.5 py-2.5 rounded-xl bg-[#11152A] hover:bg-[#151932] text-[#CBD5E1] hover:text-white border border-[#1E2442] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5 text-indigo-400" />
                <span>В список</span>
              </button>
            )}

            {/* В избранное (Heart) */}
            {onToggleFavorite && (
              <button
                type="button"
                onClick={onToggleFavorite}
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                  isFavorite
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                    : 'bg-[#11152A] hover:bg-[#151932] border-[#1E2442] text-[#94A3B8] hover:text-rose-400'
                }`}
                title={isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
              >
                <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-400' : ''}`} />
              </button>
            )}

            {/* Поделиться (Share) */}
            {onOpenShareModal && (
              <button
                type="button"
                onClick={onOpenShareModal}
                className="p-2.5 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
                title="Поделиться"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}

            {/* Смотреть Трейлер */}
            {parsedTrailer.isValid && (
              <button
                type="button"
                onClick={() => setShowTrailerModal(true)}
                className="px-3.5 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                <span>Трейлер</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Trailer Modal Player */}
      {showTrailerModal && parsedTrailer.isValid && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
          <div className="relative w-full max-w-4xl bg-[#0B0D20] border border-[#1E2442] rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[#1E2442] bg-[#080A18]">
              <div className="flex items-center gap-2 overflow-hidden pr-4">
                <Play className="w-4 h-4 text-rose-500 fill-rose-500 shrink-0" />
                <h3 className="text-sm font-bold text-white truncate">
                  Трейлер — {item.title}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {parsedTrailer.canonicalUrl && (
                  <a
                    href={parsedTrailer.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-white transition-colors"
                    title="Открыть на внешнем сайте"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setShowTrailerModal(false)}
                  className="p-2 rounded-xl bg-[#151932] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
                  title="Закрыть (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="relative aspect-video w-full bg-black">
              {parsedTrailer.isDirectVideo ? (
                <video
                  src={parsedTrailer.canonicalUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                >
                  Ваш браузер не поддерживает воспроизведение видео.
                </video>
              ) : (
                <iframe
                  src={parsedTrailer.embedUrl}
                  title={`Трейлер ${item.title}`}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              )}
            </div>

            {/* Modal Footer / Fallback Banner */}
            {parsedTrailer.canonicalUrl && (
              <div className="p-3 bg-[#080A18] border-t border-[#1E2442] flex items-center justify-between gap-3 text-xs text-[#94A3B8] flex-wrap">
                <span>
                  {parsedTrailer.site === 'YouTube' ? 'Официальный YouTube-плеер.' : 'Официальный медиа-плеер.'} Если ролик заблокирован правообладателем:
                </span>
                <a
                  href={parsedTrailer.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#11152A] hover:bg-[#1E2442] text-[#A78BFA] hover:text-white font-medium transition-colors"
                >
                  <span>{parsedTrailer.site === 'YouTube' ? 'Открыть на YouTube' : 'Открыть на источнике'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
