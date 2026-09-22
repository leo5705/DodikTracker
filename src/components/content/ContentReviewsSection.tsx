import React, { useState } from 'react';
import {
  MessageSquare,
  Star,
  Plus,
  ThumbsUp,
  AlertTriangle,
  User,
  Edit2,
  Trash2,
  Calendar,
  Heart,
  Flame,
  Laugh,
  SmilePlus,
} from 'lucide-react';
import { ContentReview, ContentDodikRating } from '../../types/content.ts';
import { useAuth } from '../../context/AuthContext.tsx';

interface ContentReviewsSectionProps {
  reviews: ContentReview[];
  dodikRating?: ContentDodikRating;
  loading?: boolean;
  onOpenReviewModal: () => void;
  onEditReview?: (review: ContentReview) => void;
  onDeleteReview?: (reviewId: number) => Promise<void>;
  onLikeReview?: (reviewId: number) => Promise<void>;
  onReactReview?: (reviewId: number, type: string) => Promise<void>;
}

const REACTION_OPTIONS = [
  { type: 'LIKE', label: 'Класс', icon: ThumbsUp, color: 'text-purple-400', activeBg: 'bg-purple-950/70 border-purple-700/60 text-purple-300' },
  { type: 'HEART', label: 'Любовь', icon: Heart, color: 'text-rose-400', activeBg: 'bg-rose-950/70 border-rose-700/60 text-rose-300' },
  { type: 'FIRE', label: 'Огонь', icon: Flame, color: 'text-amber-400', activeBg: 'bg-amber-950/70 border-amber-700/60 text-amber-300' },
  { type: 'LAUGH', label: 'Ха-ха', icon: Laugh, color: 'text-emerald-400', activeBg: 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300' },
];

export const ContentReviewsSection: React.FC<ContentReviewsSectionProps> = ({
  reviews,
  dodikRating,
  loading = false,
  onOpenReviewModal,
  onEditReview,
  onDeleteReview,
  onLikeReview,
  onReactReview,
}) => {
  const { dbUser } = useAuth();
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<number>>(new Set());
  const [activePickerId, setActivePickerId] = useState<number | null>(null);

  const toggleSpoiler = (reviewId: number) => {
    setRevealedSpoilers((prev) => {
      const next = new Set(prev);
      if (next.has(reviewId)) next.delete(reviewId);
      else next.add(reviewId);
      return next;
    });
  };

  const handleReactionClick = (reviewId: number, type: string) => {
    setActivePickerId(null);
    if (onReactReview) {
      onReactReview(reviewId, type);
    } else if (onLikeReview) {
      onLikeReview(reviewId);
    }
  };

  // Rating distribution calculation
  const distribution = dodikRating?.distribution || {};
  const totalVotes = dodikRating?.ratingCount || reviews.length;

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Рецензии и отзывы сообщества</h2>
            <p className="text-xs text-zinc-400">
              {reviews.length > 0
                ? `${reviews.length} реценз${reviews.length === 1 ? 'ия' : reviews.length < 5 ? 'ии' : 'ий'} от пользователей Dodik Tracker`
                : 'Пока нет рецензий. Будьте первым!'}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenReviewModal}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-purple-600/25 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Написать рецензию</span>
        </button>
      </div>

      {/* Dodik Rating Breakdown (1 to 10 stars) */}
      {totalVotes > 0 && (
        <div className="p-5 rounded-2xl bg-zinc-950/60 border border-zinc-800/60 flex flex-col md:flex-row items-center gap-6">
          {/* Average Box */}
          <div className="text-center md:text-left shrink-0 md:pr-6 md:border-r border-zinc-800/80">
            <div className="text-4xl font-black text-zinc-100 flex items-baseline justify-center md:justify-start gap-1">
              <span>{dodikRating?.averageRating ? dodikRating.averageRating.toFixed(1) : '—'}</span>
              <span className="text-sm text-zinc-500 font-normal">/ 10</span>
            </div>
            <div className="flex items-center justify-center md:justify-start gap-1 text-amber-400 my-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3.5 h-3.5 ${
                    (dodikRating?.averageRating || 0) / 2 >= s
                      ? 'fill-amber-400'
                      : 'text-zinc-600'
                  }`}
                />
              ))}
            </div>
            <div className="text-[11px] text-zinc-400 font-medium">{totalVotes} оценок сообщества</div>
          </div>

          {/* Distribution Bars */}
          <div className="flex-1 w-full space-y-1">
            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => {
              const count = distribution[score] || 0;
              const percent = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
              return (
                <div key={score} className="flex items-center gap-2 text-xs">
                  <span className="w-4 font-mono font-bold text-zinc-400 text-right">{score}</span>
                  <div className="flex-1 h-2 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-8 font-mono text-[10px] text-zinc-500 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reviews List */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-zinc-950/60 border border-zinc-800" />
          ))}
        </div>
      ) : reviews.length > 0 ? (
        <div className="space-y-4">
          {reviews.map((rev) => {
            const isAuthor = dbUser && dbUser.id === rev.userId;
            const score = rev.score || rev.rating;
            const hasSpoilers = Boolean(rev.containsSpoilers);
            const isRevealed = revealedSpoilers.has(rev.id);

            return (
              <div
                key={rev.id}
                className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-3.5 hover:border-zinc-700/80 transition-all"
              >
                {/* Author Info & Rating */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-purple-950/50 border border-purple-800/40 flex items-center justify-center text-purple-300 font-bold shrink-0">
                      {rev.user?.avatarUrl ? (
                        <img
                          src={rev.user.avatarUrl}
                          alt={rev.user.displayName || rev.user.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        (rev.user?.displayName || rev.user?.username || 'U').charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-100">
                        {rev.user?.displayName || rev.user?.username || 'Пользователь'}
                      </div>
                      <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>
                          {new Date(rev.createdAt).toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Rating Badge */}
                  <div className="flex items-center gap-2">
                    {score && (
                      <div className="px-2.5 py-1 rounded-xl bg-amber-950/40 border border-amber-800/40 text-amber-400 font-bold text-xs flex items-center gap-1 font-mono">
                        <Star className="w-3 h-3 fill-amber-400" />
                        <span>{score} / 10</span>
                      </div>
                    )}

                    {/* Author controls */}
                    {isAuthor && (
                      <div className="flex items-center gap-1 pl-1">
                        {onEditReview && (
                          <button
                            onClick={() => onEditReview(rev)}
                            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                            title="Редактировать"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteReview && (
                          <button
                            onClick={() => onDeleteReview(rev.id)}
                            className="p-1.5 rounded-lg bg-zinc-800 text-rose-400 hover:text-rose-300 transition-colors"
                            title="Удалить"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Review Title */}
                {rev.title && (
                  <h4 className="text-sm font-bold text-zinc-100">{rev.title}</h4>
                )}

                {/* Review Text with Spoiler Shield */}
                {hasSpoilers && !isRevealed ? (
                  <div className="p-4 rounded-xl bg-zinc-900 border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-amber-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Рецензия содержит спойлеры к сюжету</span>
                    </div>
                    <button
                      onClick={() => toggleSpoiler(rev.id)}
                      className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                    >
                      Показать текст
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-line font-sans">
                      {rev.content}
                    </p>
                    {hasSpoilers && (
                      <button
                        onClick={() => toggleSpoiler(rev.id)}
                        className="text-[11px] text-zinc-500 hover:text-zinc-400 underline"
                      >
                        Скрыть спойлеры
                      </button>
                    )}
                  </div>
                )}

                {/* Reactions and Likes Bar */}
                {(onReactReview || onLikeReview) && (
                  <div className="pt-2 border-t border-zinc-800/60 flex flex-wrap items-center justify-between gap-2 relative">
                    {/* Existing Reactions Badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {REACTION_OPTIONS.map((opt) => {
                        const count = rev.reactions?.[opt.type] || (opt.type === 'LIKE' ? (rev.likesCount || 0) : 0);
                        if (count <= 0) return null;
                        const isSelected = rev.userReaction === opt.type || (opt.type === 'LIKE' && rev.isLiked && !rev.userReaction);
                        const Icon = opt.icon;

                        return (
                          <button
                            key={opt.type}
                            onClick={() => handleReactionClick(rev.id, opt.type)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all ${
                              isSelected
                                ? opt.activeBg
                                : 'bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                            }`}
                            title={opt.label}
                          >
                            <Icon className={`w-3.5 h-3.5 ${opt.color} ${isSelected ? 'fill-current' : ''}`} />
                            <span className="font-mono text-[11px]">{count}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Reaction trigger & popover picker */}
                    <div className="flex items-center gap-1 relative ml-auto">
                      {/* Quick Like / Toggle button */}
                      <button
                        onClick={() => handleReactionClick(rev.id, rev.userReaction || 'LIKE')}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl border transition-all ${
                          rev.isLiked || rev.userReaction
                            ? 'bg-purple-950/60 border-purple-800/50 text-purple-300'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                        title="Поставить реакцию"
                      >
                        <ThumbsUp className={`w-3.5 h-3.5 ${rev.isLiked || rev.userReaction === 'LIKE' ? 'fill-purple-400 text-purple-400' : ''}`} />
                        <span>{rev.likesCount || 0}</span>
                      </button>

                      {/* Reaction Picker Button */}
                      <button
                        onClick={() => setActivePickerId(activePickerId === rev.id ? null : rev.id)}
                        className={`p-1.5 rounded-xl border transition-all ${
                          activePickerId === rev.id
                            ? 'bg-purple-900/50 border-purple-700 text-purple-200'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                        title="Выбрать реакцию"
                      >
                        <SmilePlus className="w-3.5 h-3.5" />
                      </button>

                      {/* Popover Menu with reaction options */}
                      {activePickerId === rev.id && (
                        <div className="absolute right-0 bottom-full mb-2 p-1.5 rounded-2xl bg-zinc-900 border border-zinc-700/80 shadow-2xl flex items-center gap-1 z-30 animate-in fade-in zoom-in-95">
                          {REACTION_OPTIONS.map((opt) => {
                            const Icon = opt.icon;
                            const isSelected = rev.userReaction === opt.type;
                            return (
                              <button
                                key={opt.type}
                                onClick={() => handleReactionClick(rev.id, opt.type)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                                  isSelected
                                    ? opt.activeBg
                                    : 'hover:bg-zinc-800 text-zinc-300 hover:text-white'
                                }`}
                                title={opt.label}
                              >
                                <Icon className={`w-4 h-4 ${opt.color} ${isSelected ? 'fill-current' : ''}`} />
                                <span className="text-[11px] hidden sm:inline">{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-10 rounded-2xl bg-zinc-950/40 border border-zinc-800/40 text-center space-y-3">
          <MessageSquare className="w-10 h-10 text-zinc-600 mx-auto" />
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Оставьте свой первый отзыв или напишите развёрнутую рецензию, чтобы помочь другим пользователям определиться с выбором!
          </p>
          <button
            onClick={onOpenReviewModal}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold inline-flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Написать первый отзыв</span>
          </button>
        </div>
      )}
    </div>
  );
};
