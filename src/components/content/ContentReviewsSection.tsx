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
  { type: 'LIKE', label: 'Класс', icon: ThumbsUp, color: 'text-[#A78BFA]', activeBg: 'bg-[#8B5CF6]/20 border-[#8B5CF6]/50 text-[#A78BFA]' },
  { type: 'HEART', label: 'Любовь', icon: Heart, color: 'text-rose-400', activeBg: 'bg-rose-500/20 border-rose-500/50 text-rose-300' },
  { type: 'FIRE', label: 'Огонь', icon: Flame, color: 'text-amber-400', activeBg: 'bg-amber-500/20 border-amber-500/50 text-amber-300' },
  { type: 'LAUGH', label: 'Ха-ха', icon: Laugh, color: 'text-emerald-400', activeBg: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' },
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
    <div className="p-6 md:p-8 rounded-3xl bg-[#11152A] border border-[#1E2442] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E2442] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#151932] border border-[#8B5CF6]/30 text-[#A78BFA]">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#F8FAFC]">Рецензии и отзывы сообщества</h2>
            <p className="text-xs text-[#94A3B8]">
              {reviews.length > 0
                ? `${reviews.length} реценз${reviews.length === 1 ? 'ия' : reviews.length < 5 ? 'ии' : 'ий'} от пользователей Dodik Tracker`
                : 'Пока нет рецензий. Будьте первым!'}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenReviewModal}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-[#7C3AED]/25 transition-all shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Написать рецензию</span>
        </button>
      </div>

      {/* Dodik Rating Breakdown (0 to 100 scale) */}
      {totalVotes > 0 && (
        <div className="p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex flex-col md:flex-row items-center gap-6">
          {/* Average Box */}
          <div className="text-center md:text-left shrink-0 md:pr-6 md:border-r border-[#1E2442]">
            <div className="text-4xl font-black text-[#F8FAFC] flex items-baseline justify-center md:justify-start gap-1 font-mono">
              <span>{dodikRating?.averageRating ? dodikRating.averageRating.toFixed(dodikRating.averageRating % 1 === 0 ? 0 : 1) : '—'}</span>
              <span className="text-sm text-[#64748B] font-normal font-sans">/ 100</span>
            </div>
            <div className="text-[11px] text-[#94A3B8] font-medium font-mono mt-1">
              {totalVotes} {totalVotes === 1 ? 'оценка' : totalVotes < 5 ? 'оценки' : 'оценок'} Dodik Tracker
            </div>
          </div>

          {/* Distribution Bars (deciles) */}
          <div className="flex-1 w-full space-y-1">
            {[
              { label: '91-100', min: 91, max: 100 },
              { label: '81-90', min: 81, max: 90 },
              { label: '71-80', min: 71, max: 80 },
              { label: '61-70', min: 61, max: 70 },
              { label: '51-60', min: 51, max: 60 },
              { label: '41-50', min: 41, max: 50 },
              { label: '0-40', min: 0, max: 40 },
            ].map((range) => {
              let count = 0;
              Object.entries(distribution).forEach(([k, cnt]) => {
                const num = Number(k);
                const norm = num <= 10 && num > 0 ? num * 10 : num;
                if (norm >= range.min && norm <= range.max) {
                  count += cnt;
                }
              });
              const percent = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
              return (
                <div key={range.label} className="flex items-center gap-2 text-xs">
                  <span className="w-12 font-mono font-bold text-[#64748B] text-right text-[11px]">{range.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-[#080A18] border border-[#1E2442] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#7C3AED] to-[#A78BFA] rounded-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-8 font-mono text-[10px] text-[#64748B] text-right">{count}</span>
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
            <div key={i} className="h-32 rounded-2xl bg-[#0B0D20] border border-[#1E2442]" />
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
                className="p-5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-3.5 hover:border-[#8B5CF6]/40 transition-all"
              >
                {/* Author Info & Rating */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#151932] border border-[#8B5CF6]/30 flex items-center justify-center text-[#A78BFA] font-bold shrink-0">
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
                      <div className="text-xs font-bold text-[#F8FAFC]">
                        {rev.user?.displayName || rev.user?.username || 'Пользователь'}
                      </div>
                      <div className="text-[10px] text-[#64748B] flex items-center gap-1.5 mt-0.5 font-mono">
                        <Calendar className="w-3 h-3 text-[#A78BFA]" />
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
                      <div className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center gap-1 font-mono">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span>{score <= 10 && score > 0 ? score * 10 : score} / 100</span>
                      </div>
                    )}

                    {/* Author controls */}
                    {isAuthor && (
                      <div className="flex items-center gap-1 pl-1">
                        {onEditReview && (
                          <button
                            onClick={() => onEditReview(rev)}
                            className="p-1.5 rounded-lg bg-[#151932] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                            title="Редактировать"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteReview && (
                          <button
                            onClick={() => onDeleteReview(rev.id)}
                            className="p-1.5 rounded-lg bg-rose-500/15 text-rose-300 hover:text-rose-200 transition-colors cursor-pointer"
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
                  <h4 className="text-sm font-bold text-[#F8FAFC]">{rev.title}</h4>
                )}

                {/* Review Text with Spoiler Shield */}
                {hasSpoilers && !isRevealed ? (
                  <div className="p-4 rounded-xl bg-[#080A18] border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>Рецензия содержит спойлеры к сюжету</span>
                    </div>
                    <button
                      onClick={() => toggleSpoiler(rev.id)}
                      className="px-3 py-1 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-[#CBD5E1] text-xs font-medium transition-colors cursor-pointer"
                    >
                      Показать текст
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs sm:text-sm text-[#CBD5E1] leading-relaxed whitespace-pre-line font-sans">
                      {rev.content}
                    </p>
                    {hasSpoilers && (
                      <button
                        onClick={() => toggleSpoiler(rev.id)}
                        className="text-[11px] text-[#64748B] hover:text-[#94A3B8] underline cursor-pointer"
                      >
                        Скрыть спойлеры
                      </button>
                    )}
                  </div>
                )}

                {/* Reactions and Likes Bar */}
                {(onReactReview || onLikeReview) && (
                  <div className="pt-2 border-t border-[#1E2442] flex flex-wrap items-center justify-between gap-2 relative">
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
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                              isSelected
                                ? opt.activeBg
                                : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#8B5CF6]/40'
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
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl border transition-all cursor-pointer ${
                          rev.isLiked || rev.userReaction
                            ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/50 text-[#A78BFA]'
                            : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#8B5CF6]/40'
                        }`}
                        title="Поставить реакцию"
                      >
                        <ThumbsUp className={`w-3.5 h-3.5 ${rev.isLiked || rev.userReaction === 'LIKE' ? 'fill-[#8B5CF6] text-[#A78BFA]' : ''}`} />
                        <span className="font-mono">{rev.likesCount || 0}</span>
                      </button>

                      {/* Reaction Picker Button */}
                      <button
                        onClick={() => setActivePickerId(activePickerId === rev.id ? null : rev.id)}
                        className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                          activePickerId === rev.id
                            ? 'bg-[#151932] border-[#8B5CF6] text-[#A78BFA]'
                            : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#8B5CF6]/40'
                        }`}
                        title="Выбрать реакцию"
                      >
                        <SmilePlus className="w-3.5 h-3.5" />
                      </button>

                      {/* Popover Menu with reaction options */}
                      {activePickerId === rev.id && (
                        <div className="absolute right-0 bottom-full mb-2 p-1.5 rounded-2xl bg-[#11152A] border border-[#1E2442] shadow-2xl flex items-center gap-1 z-30 animate-in fade-in zoom-in-95">
                          {REACTION_OPTIONS.map((opt) => {
                            const Icon = opt.icon;
                            const isSelected = rev.userReaction === opt.type;
                            return (
                              <button
                                key={opt.type}
                                onClick={() => handleReactionClick(rev.id, opt.type)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                                  isSelected
                                    ? opt.activeBg
                                    : 'hover:bg-[#151932] text-[#CBD5E1] hover:text-white'
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
        <div className="p-10 rounded-2xl bg-[#0B0D20] border border-[#1E2442] text-center space-y-3">
          <MessageSquare className="w-10 h-10 text-[#64748B] mx-auto" />
          <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
            Оставьте свой первый отзыв или напишите развёрнутую рецензию, чтобы помочь другим пользователям определиться с выбором!
          </p>
          <button
            onClick={onOpenReviewModal}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-semibold inline-flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-[#7C3AED]/25"
          >
            <Plus className="w-4 h-4" />
            <span>Написать первый отзыв</span>
          </button>
        </div>
      )}
    </div>
  );
};
