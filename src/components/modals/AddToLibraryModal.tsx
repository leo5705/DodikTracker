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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
            <BookmarkPlus className="w-4 h-4 text-purple-400" />
            Добавить в библиотеку
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
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
                className="w-16 h-24 object-cover rounded-lg ring-1 ring-zinc-700 shrink-0"
              />
            ) : (
              <div className="w-16 h-24 bg-zinc-800 rounded-lg flex items-center justify-center text-xs text-zinc-400 shrink-0">
                Нет постера
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-zinc-100 line-clamp-1">{mediaItem.title}</h3>
              {mediaItem.originalTitle && (
                <p className="text-xs text-zinc-400 line-clamp-1">{mediaItem.originalTitle}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-zinc-400">
                {mediaItem.year && <span>{mediaItem.year}</span>}
                <span className="px-1.5 py-0.2 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
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
            <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-800/50 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Status selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Статус в трекере</label>
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition-all ${
                    status === opt.value
                      ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-950'
                      : 'bg-zinc-800/60 text-zinc-300 border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rating (1-10) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-zinc-300">Ваша оценка (1-10)</label>
              {rating && (
                <button
                  onClick={() => setRating(null)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200"
                >
                  Сбросить
                </button>
              )}
            </div>
            <div className="flex gap-1 justify-between">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setRating(rating === num ? null : num)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    rating && rating >= num
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-zinc-800/40 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Favorite toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-800/40 border border-zinc-800">
            <div className="flex items-center gap-2">
              <Heart
                className={`w-4 h-4 ${
                  isFavorite ? 'text-red-400 fill-red-400' : 'text-zinc-400'
                }`}
              />
              <span className="text-xs font-medium text-zinc-200">Добавить в Избранное</span>
            </div>
            <input
              type="checkbox"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 focus:ring-offset-zinc-900"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Личные заметки</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Мысли, где остановился или с кем смотрел..."
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-zinc-800 flex justify-end gap-2 bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            {submitting ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
};
