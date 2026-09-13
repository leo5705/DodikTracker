import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Star,
  Bookmark,
  Share2,
  ShieldAlert,
  Activity,
  Award,
  CheckCircle2,
  Play,
  RotateCcw,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { UnifiedGame } from '../../types/unifiedGame.ts';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

interface GameHeroProps {
  game: UnifiedGame;
  userTracking?: any;
  onStatusChange?: (status: string) => Promise<void>;
  onOpenRatingModal?: () => void;
  onOpenReviewModal?: () => void;
  onOpenListModal?: () => void;
  onOpenDiagnosticModal?: () => void;
}

export const GameHero: React.FC<GameHeroProps> = ({
  game,
  userTracking,
  onStatusChange,
  onOpenRatingModal,
  onOpenReviewModal,
  onOpenListModal,
  onOpenDiagnosticModal,
}) => {
  const { navigate } = useRouter();
  const { dbUser } = useAuth();
  const [statusLoading, setStatusLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentStatus = userTracking?.status;
  const currentScore = userTracking?.score;

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
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: game.title,
          text: `Смотри игру ${game.title} на Dodik Tracker!`,
          url,
        });
        return;
      } catch (_e) {}
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Metacritic color badge helper
  const getMetacriticColor = (score: number) => {
    if (score >= 75) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    if (score >= 50) return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
  };

  const backdrop = game.backdropUrl || game.posterUrl;

  return (
    <div className="relative rounded-3xl overflow-hidden bg-zinc-900/90 border border-zinc-800 shadow-2xl mb-8">
      {/* Dynamic Ambient Backdrop */}
      {backdrop && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <img
            src={backdrop}
            alt={game.title}
            className="w-full h-full object-cover object-top opacity-20 filter blur-xl scale-110 transform"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
        </div>
      )}

      {/* Main Content Container */}
      <div className="relative z-10 p-6 md:p-8 lg:p-10 flex flex-col md:flex-row gap-8 items-start">
        {/* Poster / Boxart */}
        <div className="w-full md:w-64 lg:w-72 shrink-0 flex flex-col items-center">
          <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden border border-zinc-700/60 shadow-2xl bg-zinc-950 group">
            {game.posterUrl ? (
              <img
                src={game.posterUrl}
                alt={game.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 p-4 text-center">
                <Sparkles className="w-12 h-12 mb-2 stroke-1" />
                <span className="text-xs">Нет обложки</span>
              </div>
            )}

            {/* Age Rating Badge */}
            {game.ageRating && (
              <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-zinc-700 text-[10px] font-bold text-zinc-200 tracking-wider">
                {game.ageRating}
              </div>
            )}
          </div>

          {/* Source Badges */}
          <div className="mt-3 flex items-center gap-1.5 flex-wrap justify-center">
            {game.providerMeta.rawgAvailable && (
              <span className="px-2 py-0.5 rounded-full bg-purple-950/60 border border-purple-800/40 text-[10px] font-medium text-purple-300">
                RAWG
              </span>
            )}
            {game.providerMeta.gmdbAvailable && (
              <span className="px-2 py-0.5 rounded-full bg-sky-950/60 border border-sky-800/40 text-[10px] font-medium text-sky-300">
                TheGamesDB
              </span>
            )}
          </div>
        </div>

        {/* Info & Action Controls */}
        <div className="flex-1 w-full flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            {/* Title block */}
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-zinc-100 tracking-tight leading-tight">
                {game.title}
              </h1>
              {game.originalTitle && game.originalTitle !== game.title && (
                <p className="text-sm md:text-base text-zinc-400 font-medium mt-1">
                  {game.originalTitle}
                </p>
              )}
            </div>

            {/* Key Metadata Badges */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
              {game.releaseDate && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/70 border border-zinc-700/50">
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  <span>{new Date(game.releaseDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
              )}

              {game.playtime && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/70 border border-zinc-700/50">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span>~{game.playtime} ч. прохождение</span>
                </div>
              )}

              {game.website && (
                <a
                  href={game.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/70 border border-zinc-700/50 hover:text-purple-400 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
                  <span>Официальный сайт</span>
                </a>
              )}
            </div>

            {/* Ratings Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              {/* RAWG / Global Rating */}
              {game.rating !== undefined && (
                <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-950/50 border border-purple-800/50 flex items-center justify-center text-purple-400 shrink-0">
                    <Star className="w-5 h-5 fill-purple-400/20" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-zinc-100 flex items-baseline gap-1">
                      <span>{game.rating.toFixed(1)}</span>
                      <span className="text-[10px] text-zinc-500 font-normal">/ 10</span>
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {game.ratingCount ? `${game.ratingCount} оценок` : 'Рейтинг базы'}
                    </div>
                  </div>
                </div>
              )}

              {/* Metacritic Score */}
              {game.metacritic !== null && game.metacritic !== undefined && (
                <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center font-black text-sm shrink-0 ${getMetacriticColor(game.metacritic)}`}>
                    {game.metacritic}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-200">Metacritic</div>
                    <div className="text-[10px] text-zinc-400">
                      {game.metacriticUrl ? (
                        <a href={game.metacriticUrl} target="_blank" rel="noopener noreferrer" className="hover:underline text-purple-400">
                          Критики
                        </a>
                      ) : (
                        'Оценка критиков'
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* User Score (if rated) */}
              <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg font-bold text-zinc-100">
                    {currentScore ? (
                      <span className="text-amber-400">{currentScore} / 10</span>
                    ) : (
                      <span className="text-zinc-500 text-xs">Не оценено</span>
                    )}
                  </div>
                  <button
                    onClick={onOpenRatingModal}
                    className="text-[10px] text-purple-400 hover:underline text-left block"
                  >
                    {currentScore ? 'Изменить оценку' : 'Оценить игру'}
                  </button>
                </div>
              </div>
            </div>

            {/* Genres & Tags Chips */}
            {game.genres && game.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {game.genres.map((genre) => (
                  <button
                    key={genre.id}
                    onClick={() => navigate(`/games/catalog?genre=${encodeURIComponent(genre.name)}`)}
                    className="px-2.5 py-1 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-300 text-xs font-medium hover:bg-purple-900/60 transition-colors"
                  >
                    {genre.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Interactive Library Status & User Action Panel */}
          <div className="pt-4 border-t border-zinc-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Status Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
              <button
                onClick={() => handleStatusClick('PLANNING')}
                disabled={statusLoading}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                  currentStatus === 'PLANNING'
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:border-zinc-500 hover:text-white'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Буду играть</span>
              </button>

              <button
                onClick={() => handleStatusClick('IN_PROGRESS')}
                disabled={statusLoading}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                  currentStatus === 'IN_PROGRESS'
                    ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-500/20'
                    : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:border-zinc-500 hover:text-white'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Играю</span>
              </button>

              <button
                onClick={() => handleStatusClick('COMPLETED')}
                disabled={statusLoading}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                  currentStatus === 'COMPLETED'
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:border-zinc-500 hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Пройдено</span>
              </button>

              <button
                onClick={() => handleStatusClick('DROPPED')}
                disabled={statusLoading}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                  currentStatus === 'DROPPED'
                    ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-500/20'
                    : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:border-zinc-500 hover:text-white'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Дропнул</span>
              </button>
            </div>

            {/* Secondary Action Buttons */}
            <div className="flex items-center gap-2">
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
