import React, { useState } from 'react';
import { Star, X, Trash2, Check } from 'lucide-react';

interface ContentRatingModalProps {
  isOpen: boolean;
  currentRating?: number | null;
  itemTitle: string;
  onClose: () => void;
  onSaveRating: (rating: number | null) => Promise<void>;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Ужасно (1/10)',
  2: 'Очень плохо (2/10)',
  3: 'Плохо (3/10)',
  4: 'Ниже среднего (4/10)',
  5: 'Средне / Нормально (5/10)',
  6: 'Неплохо (6/10)',
  7: 'Хорошо (7/10)',
  8: 'Отлично (8/10)',
  9: 'Великолепно (9/10)',
  10: 'Шедевр (10/10)',
};

export const ContentRatingModal: React.FC<ContentRatingModalProps> = ({
  isOpen,
  currentRating,
  itemTitle,
  onClose,
  onSaveRating,
}) => {
  const [hoveredScore, setHoveredScore] = useState<number | null>(null);
  const [selectedScore, setSelectedScore] = useState<number | null>(currentRating || null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const activeScore = hoveredScore !== null ? hoveredScore : selectedScore;

  const handleSave = async (scoreToSave: number | null) => {
    setLoading(true);
    try {
      await onSaveRating(scoreToSave);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-zinc-100">Оценить тайтл</h3>
            <p className="text-xs text-zinc-400 truncate max-w-[280px]">{itemTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 10 Stars Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
              const isFilled = activeScore !== null && score <= activeScore;
              const isSelected = selectedScore === score;

              return (
                <button
                  key={score}
                  type="button"
                  onMouseEnter={() => setHoveredScore(score)}
                  onMouseLeave={() => setHoveredScore(null)}
                  onClick={() => setSelectedScore(score)}
                  className={`w-9 h-9 rounded-xl border flex flex-col items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-amber-500 border-amber-400 text-zinc-950 font-black shadow-lg shadow-amber-500/25 scale-105'
                      : isFilled
                      ? 'bg-amber-950/60 border-amber-700/60 text-amber-400'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-mono font-bold">{score}</span>
                </button>
              );
            })}
          </div>

          {/* Label indicator */}
          <div className="text-center h-5">
            {activeScore ? (
              <span className="text-xs font-bold text-amber-400">
                {RATING_LABELS[activeScore]}
              </span>
            ) : (
              <span className="text-xs text-zinc-500">Выберите балл от 1 до 10</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-800">
          {currentRating ? (
            <button
              onClick={() => handleSave(null)}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-rose-950/60 hover:text-rose-400 text-zinc-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить оценку</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={() => handleSave(selectedScore)}
              disabled={loading || selectedScore === null}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-purple-600/25 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Сохранить</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
