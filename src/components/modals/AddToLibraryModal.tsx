import React, { useState } from 'react';
import { X, Star, Heart, BookmarkPlus, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface AddToLibraryModalProps {
  mediaItem: {
    provider?: string;
    externalId?: string;
    mediaId?: number;
    type: string;
    title: string;
    originalTitle?: string;
    posterUrl?: string;
    backdropUrl?: string;
    year?: number;
    rating?: number;
    description?: string;
  };
  onClose: () => void;
  onAdded?: () => void;
}

export const AddToLibraryModal: React.FC<AddToLibraryModalProps> = ({
  mediaItem,
  onClose,
  onAdded,
}) => {
  const { authFetch, dbUser, login } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine status options based on type
  const getStatusOptions = (type: string) => {
    if (type === 'GAME') {
      return [
        { value: 'PLAN_TO_PLAY', label: 'Хочу сыграть' },
        { value: 'PLAYING', label: 'Играю сейчас' },
        { value: 'COMPLETED', label: 'Пройдено' },
        { value: 'DROPPED', label: 'Дропнул' },
      ];
    }
    if (type === 'BOOK' || type === 'MANGA' || type === 'COMIC') {
      return [
        { value: 'PLAN_TO_READ', label: 'Хочу прочитать' },
        { value: 'READING', label: 'Читаю' },
        { value: 'COMPLETED', label: 'Прочитано' },
        { value: 'DROPPED', label: 'Дропнул' },
      ];
    }
    return [
      { value: 'PLAN_TO_WATCH', label: 'Буду смотреть' },
      { value: 'WATCHING', label: 'Смотрю' },
      { value: 'COMPLETED', label: 'Посмотрел' },
      { value: 'DROPPED', label: 'Дропнул' },
    ];
  };

  const statusOptions = getStatusOptions(mediaItem?.type || 'MOVIE');
  const [status, setStatus] = useState(statusOptions[0]?.value || 'PLAN_TO_WATCH');
  const [rating, setRating] = useState<number | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    if (!dbUser) {
      await login();
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: any = {
        status,
        rating: rating || null,
        isFavorite,
        notes: notes.trim() || null,
      };

      if (mediaItem.mediaId) {
        payload.mediaId = mediaItem.mediaId;
      } else {
        payload.mediaPayload = mediaItem;
      }

      const res = await authFetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Не удалось сохранить в библиотеку');
      }

      onAdded?.();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#080A18]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#11152A] border border-[#1E2442] rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-[#1E2442] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#F8FAFC] font-semibold text-sm">
            <div className="p-1.5 rounded-lg bg-[#151932] border border-[#8B5CF6]/30 text-[#A78BFA]">
              <BookmarkPlus className="w-4 h-4" />
            </div>
            <span>Добавить в библиотеку</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Media preview info */}
          <div className="flex gap-3.5 items-start">
            {mediaItem.posterUrl ? (
              <img
                src={mediaItem.posterUrl}
                alt={mediaItem.title}
                referrerPolicy="no-referrer"
                className="w-16 h-24 object-cover rounded-xl border border-[#1E2442] shrink-0 shadow-md"
              />
            ) : (
              <div className="w-16 h-24 bg-[#0B0D20] border border-[#1E2442] rounded-xl flex items-center justify-center text-xs text-[#64748B] shrink-0">
                Нет постера
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-[#F8FAFC] line-clamp-1">{mediaItem.title}</h3>
              {mediaItem.originalTitle && (
                <p className="text-xs text-[#94A3B8] line-clamp-1">{mediaItem.originalTitle}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-[#94A3B8] font-mono">
                {mediaItem.year && <span>{mediaItem.year}</span>}
                <span className="px-1.5 py-0.5 rounded-md bg-[#151932] text-[#A78BFA] border border-[#8B5CF6]/30">
                  {mediaItem.type}
                </span>
                {mediaItem.rating && (
                  <span className="flex items-center gap-0.5 text-amber-400">
                    <Star className="w-3 h-3 fill-amber-400" />
                    {mediaItem.rating}
                  </span>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Status selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#CBD5E1]">Статус в трекере</label>
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                    status === opt.value
                      ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white border-[#8B5CF6] shadow-md shadow-[#7C3AED]/25'
                      : 'bg-[#0B0D20] text-[#CBD5E1] border-[#1E2442] hover:border-[#8B5CF6]/40 hover:bg-[#151932]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rating (1-10) */}
          {/* Rating */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-[#CBD5E1]">Ваша оценка Dodik Tracker (0–100)</label>
              {rating !== null && (
                <button
                  type="button"
                  onClick={() => setRating(null)}
                  className="text-[11px] text-[#94A3B8] hover:text-rose-400 cursor-pointer"
                >
                  Сбросить
                </button>
              )}
            </div>

            {rating !== null ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-amber-300">★ {rating} / 100</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="w-3/5 h-2 bg-[#0B0D20] rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
                <div className="flex gap-1 justify-between">
                  {[25, 50, 60, 70, 80, 90, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRating(preset)}
                      className={`flex-1 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer font-mono ${
                        rating === preset
                          ? 'bg-purple-600 text-white border-purple-400'
                          : 'bg-[#0B0D20] text-[#64748B] border-[#1E2442] hover:text-white'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex gap-1 justify-between">
                {[25, 50, 60, 70, 80, 90, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRating(preset)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer font-mono bg-[#0B0D20] text-[#64748B] border-[#1E2442] hover:border-[#8B5CF6]/40 hover:text-[#F8FAFC]"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Favorite toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0B0D20] border border-[#1E2442]">
            <div className="flex items-center gap-2">
              <Heart
                className={`w-4 h-4 ${
                  isFavorite ? 'text-rose-400 fill-rose-400' : 'text-[#64748B]'
                }`}
              />
              <span className="text-xs font-medium text-[#F8FAFC]">Добавить в Избранное</span>
            </div>
            <input
              type="checkbox"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
              className="w-4 h-4 rounded text-[#8B5CF6] focus:ring-[#8B5CF6] focus:ring-offset-[#0B0D20] bg-[#11152A] border-[#1E2442] cursor-pointer"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#CBD5E1]">Личные заметки</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Мысли, где остановился или с кем смотрел..."
              className="w-full px-3 py-2 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-[#1E2442] flex justify-end gap-2 bg-[#0B0D20]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-semibold shadow-lg shadow-[#7C3AED]/25 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            {submitting ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
};
