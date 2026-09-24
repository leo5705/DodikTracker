import React, { useState } from 'react';
import { Star, Trash2, X, BarChart2, Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export interface DodikRatingData {
  averageRating: number | null;
  ratingCount: number;
  distribution?: Record<string, number>;
  userRating?: number | null;
}

export interface ExternalRatingItem {
  source: string;
  score: number;
  max?: number;
}

export interface RatingControlProps {
  mediaId: number | string;
  itemTitle: string;
  mediaPayload?: any;
  externalRating?: number | null;
  externalRatings?: ExternalRatingItem[];
  dodikRating?: DodikRatingData | null;
  userRating?: number | null;
  onRatingUpdated?: (newRating: number | null, newDodikData?: DodikRatingData) => void;
  size?: 'sm' | 'md' | 'lg';
  showDistribution?: boolean;
  className?: string;
}

const SCORE_LABELS: Record<number, string> = {
  10: 'Шедевр (10)',
  9: 'Великолепно (9)',
  8: 'Отлично (8)',
  7: 'Хорошо (7)',
  6: 'Неплохо (6)',
  5: 'Средне (5)',
  4: 'Посредственно (4)',
  3: 'Слабо (3)',
  2: 'Плохо (2)',
  1: 'Ужасно (1)',
};

export const RatingControl: React.FC<RatingControlProps> = ({
  mediaId,
  itemTitle,
  mediaPayload,
  externalRating,
  externalRatings = [],
  dodikRating,
  userRating: initialUserRating,
  onRatingUpdated,
  size = 'md',
  showDistribution = true,
  className = '',
}) => {
  const { authFetch, dbUser, login } = useAuth();

  const [distribOpen, setDistribOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Normalize rating to 1..10 scale
  const normalizeRating = (val?: number | null): number | null => {
    if (val === undefined || val === null) return null;
    const num = Number(val);
    if (isNaN(num) || num <= 0) return null;
    if (num > 10) return Math.min(10, Math.max(1, Math.round(num / 10)));
    return Math.min(10, Math.max(1, Math.round(num)));
  };

  const [currentMyRating, setCurrentMyRating] = useState<number | null | undefined>(
    normalizeRating(initialUserRating !== undefined ? initialUserRating : dodikRating?.userRating)
  );
  const [dodikData, setDodikData] = useState<DodikRatingData | null | undefined>(dodikRating);

  React.useEffect(() => {
    if (initialUserRating !== undefined) {
      setCurrentMyRating(normalizeRating(initialUserRating));
    } else if (dodikRating?.userRating !== undefined) {
      setCurrentMyRating(normalizeRating(dodikRating.userRating));
    }
  }, [initialUserRating, dodikRating?.userRating]);

  React.useEffect(() => {
    if (dodikRating) {
      setDodikData(dodikRating);
    }
  }, [dodikRating]);

  const handleRate = async (score: number) => {
    if (!dbUser) {
      login();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/media/${mediaId}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: score,
          mediaPayload,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Не удалось сохранить оценку');
      }

      const data = await res.json();
      setCurrentMyRating(score);
      if (data.dodikRating) {
        setDodikData(data.dodikRating);
      }
      onRatingUpdated?.(score, data.dodikRating);
      setModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRating = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!dbUser) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/media/${mediaId}/rating`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Не удалось удалить оценку');
      }

      const data = await res.json();
      setCurrentMyRating(null);
      if (data.dodikRating) {
        setDodikData(data.dodikRating);
      }
      onRatingUpdated?.(null, data.dodikRating);
      setModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Ошибка удаления');
    } finally {
      setLoading(false);
    }
  };

  // Build 1..10 distribution counts
  const distributionCounts: Record<string, number> = {};
  for (let s = 10; s >= 1; s--) {
    distributionCounts[String(s)] = 0;
  }

  if (dodikData?.distribution) {
    Object.entries(dodikData.distribution).forEach(([k, count]) => {
      const num = Number(k);
      if (!isNaN(num)) {
        const normKey = String(num > 10 ? Math.round(num / 10) : Math.round(num));
        if (distributionCounts[normKey] !== undefined) {
          distributionCounts[normKey] += count;
        }
      }
    });
  }

  const maxDistribCount = Math.max(1, ...Object.values(distributionCounts));
  const hasDodikRatings = dodikData && dodikData.averageRating !== null && dodikData.ratingCount > 0;

  const currentDisplayLabel = hoverScore
    ? `Оценить: ${hoverScore} (${SCORE_LABELS[hoverScore] || ''})`
    : currentMyRating
    ? `Моя оценка: ${currentMyRating}`
    : 'Не оценено';

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {/* Top Row: External Ratings + Dodik Community Rating */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* 1. External Ratings */}
        {externalRatings.length > 0 ? (
          externalRatings.map((ext) => (
            <div
              key={ext.source}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B0D20] border border-[#1E2442] shadow-sm"
              title={`Внешний рейтинг: ${ext.source}`}
            >
              <span className="text-xs font-semibold text-[#94A3B8]">{ext.source}:</span>
              <div className="flex items-center gap-1 font-mono font-bold text-xs text-[#F8FAFC]">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>{typeof ext.score === 'number' ? ext.score.toFixed(1) : ext.score}</span>
                {ext.max && ext.max !== 10 && <span className="text-[10px] text-[#64748B]">/{ext.max}</span>}
              </div>
            </div>
          ))
        ) : externalRating ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B0D20] border border-[#1E2442] shadow-sm">
            <span className="text-xs font-semibold text-[#94A3B8]">Рейтинг:</span>
            <div className="flex items-center gap-1 font-mono font-bold text-xs text-[#F8FAFC]">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>{typeof externalRating === 'number' ? externalRating.toFixed(1) : externalRating}</span>
            </div>
          </div>
        ) : null}

        {/* 2. Dodik Tracker Community Rating */}
        <div
          onClick={() => (hasDodikRatings ? setDistribOpen(true) : setModalOpen(true))}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-950/60 to-indigo-950/60 border border-purple-500/40 shadow-sm transition-all cursor-pointer hover:border-purple-400/80 hover:shadow-purple-500/10"
          title={hasDodikRatings ? 'Нажмите для просмотра распределения оценок Dodik Tracker' : 'Оценить на Dodik Tracker'}
        >
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-lg bg-purple-500/25 flex items-center justify-center text-purple-300">
              <Sparkles className="w-3.5 h-3.5 text-purple-300" />
            </div>
            <span className="text-xs font-bold text-purple-200">Dodik Tracker:</span>
          </div>

          {hasDodikRatings ? (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 font-mono font-black text-xs text-amber-300">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>{dodikData!.averageRating!.toFixed(1)}</span>
              </div>
              <span className="text-xs text-purple-300/80 font-mono border-l border-purple-500/30 pl-1.5">
                {dodikData!.ratingCount} {dodikData!.ratingCount === 1 ? 'оценка' : dodikData!.ratingCount < 5 ? 'оценки' : 'оценок'}
              </span>
              {showDistribution && (
                <BarChart2 className="w-3.5 h-3.5 text-purple-400 hover:text-purple-200 transition-colors ml-0.5" />
              )}
            </div>
          ) : (
            <span className="text-xs text-purple-300/70 font-medium italic">
              Нет оценок
            </span>
          )}
        </div>
      </div>

      {/* Interactive 1–10 Rating Bar */}
      <div className="p-3 rounded-2xl bg-[#0B0D20]/90 border border-[#1E2442] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">
              {currentMyRating ? 'Ваша оценка' : 'Оценить контент'}
            </span>
            <span className={`text-xs font-bold font-mono ${currentMyRating ? 'text-amber-300' : 'text-[#64748B]'}`}>
              {currentDisplayLabel}
            </span>
          </div>

          {currentMyRating && (
            <button
              type="button"
              onClick={(e) => handleDeleteRating(e)}
              disabled={loading}
              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 transition-colors cursor-pointer"
              title="Удалить мою оценку"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 1 to 10 Buttons */}
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-0.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
            const isSelected = currentMyRating === score;
            const isHovered = hoverScore !== null && score <= hoverScore;

            return (
              <button
                key={score}
                type="button"
                disabled={loading}
                onClick={() => handleRate(score)}
                onMouseEnter={() => setHoverScore(score)}
                onMouseLeave={() => setHoverScore(null)}
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center font-mono font-bold text-xs transition-all cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-black shadow-md shadow-amber-500/30 scale-105 border border-amber-300'
                    : isHovered
                    ? 'bg-purple-600/60 text-white border border-purple-400/80 scale-105'
                    : 'bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-white hover:border-purple-500/40'
                }`}
                title={SCORE_LABELS[score]}
              >
                {score}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Distribution Modal */}
      {distribOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-[#1E2442] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                  <BarChart2 className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#F8FAFC]">Оценки Dodik Tracker</h3>
                  <p className="text-xs text-[#94A3B8] truncate max-w-[260px]">{itemTitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDistribOpen(false)}
                className="p-2 rounded-full bg-[#151932] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary Stat */}
            <div className="p-4 rounded-2xl bg-[#151932]/70 border border-[#1E2442] flex items-center justify-between">
              <div>
                <span className="text-xs text-[#94A3B8]">Средний рейтинг:</span>
                <div className="flex items-center gap-2 font-mono mt-0.5">
                  <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
                  <span className="text-3xl font-black text-amber-300">
                    {dodikData?.averageRating !== null ? dodikData!.averageRating!.toFixed(1) : '—'}
                  </span>
                  <span className="text-sm text-[#64748B]">/ 10</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-[#94A3B8]">Всего оценок:</span>
                <div className="text-xl font-bold font-mono text-white mt-0.5">
                  {dodikData?.ratingCount || 0}
                </div>
              </div>
            </div>

            {/* Score Breakdown (10 down to 1) */}
            <div className="space-y-1.5 py-1">
              {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((s) => {
                const count = distributionCounts[String(s)] || 0;
                const percent = dodikData?.ratingCount ? Math.round((count / dodikData.ratingCount) * 100) : 0;
                const barWidth = maxDistribCount > 0 ? (count / maxDistribCount) * 100 : 0;
                const isUserChoice = currentMyRating === s;

                return (
                  <div key={s} className="flex items-center gap-2.5 text-xs font-mono">
                    <span className={`w-6 text-right font-bold ${isUserChoice ? 'text-amber-300' : 'text-[#CBD5E1]'}`}>
                      ★ {s}
                    </span>
                    <div className="flex-1 h-3.5 bg-[#151932] rounded-full overflow-hidden p-0.5 border border-[#1E2442]/60">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isUserChoice
                            ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                            : s >= 8
                            ? 'bg-gradient-to-r from-purple-500 to-indigo-500'
                            : s >= 5
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                            : 'bg-gradient-to-r from-rose-500 to-amber-500'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-[11px] text-[#94A3B8]">
                      {count} <span className="text-[9px] text-[#64748B]">({percent}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-[#1E2442] flex justify-end">
              <button
                type="button"
                onClick={() => setDistribOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#151932] hover:bg-[#1E2442] text-xs font-bold text-white transition-colors cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
