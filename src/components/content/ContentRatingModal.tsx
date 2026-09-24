import React, { useState } from 'react';
import { Star, X, Trash2, Check } from 'lucide-react';

interface ContentRatingModalProps {
  isOpen: boolean;
  currentRating?: number | null;
  itemTitle: string;
  onClose: () => void;
  onSaveRating: (rating: number | null) => Promise<void>;
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

export const ContentRatingModal: React.FC<ContentRatingModalProps> = ({
  isOpen,
  currentRating,
  itemTitle,
  onClose,
  onSaveRating,
}) => {
  // Normalize if legacy was passed
  const initial = currentRating
    ? currentRating > 10
      ? Math.min(10, Math.max(1, Math.round(currentRating / 10)))
      : Math.min(10, Math.max(1, Math.round(currentRating)))
    : 8;

  const [selectedScore, setSelectedScore] = useState<number>(initial);
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (scoreToSave: number | null) => {
    setLoading(true);
    try {
      await onSaveRating(scoreToSave);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const activeScore = hoverScore || selectedScore;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0B0D20] border border-[#1E2442] rounded-3xl p-6 shadow-2xl space-y-5 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1E2442] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#F8FAFC]">Оценка Dodik Tracker</h3>
              <p className="text-xs text-[#94A3B8] truncate max-w-[280px]">{itemTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-[#151932] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Big Score Display */}
        <div className="flex flex-col items-center justify-center py-2 space-y-1">
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-5xl font-black text-amber-300">{activeScore}</span>
            <span className="text-sm font-semibold text-[#64748B]">/ 10</span>
          </div>
          <div className="text-xs font-bold text-amber-400 font-mono">
            {SCORE_LABELS[activeScore] || ''}
          </div>
        </div>

        {/* 10 Score Selector Buttons */}
        <div className="grid grid-cols-5 gap-2 py-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
            const isSelected = selectedScore === score;
            const isHovered = hoverScore !== null && score <= hoverScore;

            return (
              <button
                key={score}
                type="button"
                onClick={() => setSelectedScore(score)}
                onMouseEnter={() => setHoverScore(score)}
                onMouseLeave={() => setHoverScore(null)}
                className={`py-2.5 rounded-xl border font-mono font-bold text-sm transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500 text-black border-amber-300 shadow-lg shadow-amber-500/30 scale-105'
                    : isHovered
                    ? 'bg-purple-600/60 text-white border-purple-400 scale-105'
                    : 'bg-[#151932] border-[#1E2442] text-[#CBD5E1] hover:text-white hover:border-purple-500/40'
                }`}
              >
                {score}
              </button>
            );
          })}
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[#1E2442]">
          {currentRating ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSave(null)}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить оценку</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#151932] hover:bg-[#1E2442] text-xs font-bold text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSave(selectedScore)}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-purple-500/25 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Сохранить</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
