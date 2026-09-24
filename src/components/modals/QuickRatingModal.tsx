import React, { useState } from 'react';
import { X, Star, Loader2, Check, Plus, Minus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface QuickRatingModalProps {
  mediaItem: {
    id?: number;
    mediaId?: number;
    externalId?: string;
    provider?: string;
    type?: string;
    title: string;
    posterUrl?: string;
    userRating?: number;
  };
  onClose: () => void;
  onSuccess?: (newRating: number, dodikData?: any) => void;
}

const PRESET_SCORES = [10, 25, 40, 50, 60, 70, 75, 80, 85, 90, 95, 100];

export const QuickRatingModal: React.FC<QuickRatingModalProps> = ({
  mediaItem,
  onClose,
  onSuccess,
}) => {
  const { authFetch } = useAuth();
  
  // Normalize if 1-10 was provided
  const initial = mediaItem.userRating
    ? mediaItem.userRating <= 10
      ? mediaItem.userRating * 10
      : mediaItem.userRating
    : 75;

  const [selectedRating, setSelectedRating] = useState<number>(initial);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const targetId =
    mediaItem.mediaId || mediaItem.id || mediaItem.externalId || '0';

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await authFetch(`/api/media/${targetId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: selectedRating,
          mediaPayload: mediaItem,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Не удалось сохранить оценку');
      }

      const data = await res.json();
      if (onSuccess) {
        onSuccess(selectedRating, data.dodikRating);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения оценки');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveRating = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await authFetch(`/api/media/${targetId}/rate`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (onSuccess) {
          onSuccess(0, data.dodikRating);
        }
        onClose();
      } else {
        throw new Error('Не удалось удалить оценку');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка удаления оценки');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getLabel = (val: number) => {
    if (val >= 90) return 'Шедевр';
    if (val >= 80) return 'Отлично';
    if (val >= 70) return 'Хорошо';
    if (val >= 60) return 'Неплохо';
    if (val >= 50) return 'Средне';
    if (val >= 40) return 'Посредственно';
    if (val >= 30) return 'Слабо';
    if (val >= 20) return 'Плохо';
    return 'Ужасно';
  };

  const adjust = (delta: number) => {
    setSelectedRating((prev) => Math.max(0, Math.min(100, prev + delta)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-2xl p-6 space-y-4 text-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#151932] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <div>
          <h3 className="text-base font-bold text-[#F8FAFC] line-clamp-1 px-4">
            {mediaItem.title}
          </h3>
          <p className="text-xs text-[#94A3B8] mt-0.5">Оценка Dodik Tracker (0–100)</p>
        </div>

        {/* Score Display */}
        <div className="py-1 flex flex-col items-center justify-center">
          <div className="text-4xl font-black font-mono text-amber-400 flex items-baseline gap-1">
            <Star className="w-6 h-6 fill-amber-400 text-amber-400 self-center" />
            <span>{selectedRating}</span>
            <span className="text-xs text-[#64748B]">/ 100</span>
          </div>
          <span className="text-xs text-[#A78BFA] font-medium mt-1">
            {getLabel(selectedRating)}
          </span>
        </div>

        {/* Slider & Step Controls */}
        <div className="space-y-3 px-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => adjust(-1)}
              className="p-1.5 rounded-xl bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-white hover:border-purple-500/40 transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={selectedRating}
              onChange={(e) => setSelectedRating(Number(e.target.value))}
              className="w-full h-2.5 bg-[#151932] rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <button
              type="button"
              onClick={() => adjust(1)}
              className="p-1.5 rounded-xl bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-white hover:border-purple-500/40 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Quick presets */}
          <div className="grid grid-cols-6 gap-1">
            {PRESET_SCORES.map((preset) => {
              const isSelected = selectedRating === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSelectedRating(preset)}
                  className={`py-1 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-600 border border-purple-400 text-white shadow-md'
                      : 'bg-[#151932] text-[#CBD5E1] hover:bg-[#1E2442] hover:text-amber-300'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
        </div>

        {error && <div className="text-xs text-rose-400 font-medium">{error}</div>}

        {/* Action Buttons */}
        <div className="pt-2 flex items-center gap-2">
          {mediaItem.userRating ? (
            <button
              type="button"
              onClick={handleRemoveRating}
              disabled={isSubmitting}
              className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/30 transition-colors cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:from-[#6D28D9] hover:to-[#4F46E5] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#7C3AED]/25 transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Сохранить оценку</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
