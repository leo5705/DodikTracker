import React, { useState, useEffect } from 'react';
import { MessageSquare, Star, X, Check, AlertTriangle } from 'lucide-react';
import { ContentReview } from '../../types/content.ts';

interface ContentReviewModalProps {
  isOpen: boolean;
  itemTitle: string;
  existingReview?: ContentReview | null;
  onClose: () => void;
  onSubmit: (data: {
    title: string | null;
    content: string;
    score: number | null;
    containsSpoilers: boolean;
  }) => Promise<void>;
}

export const ContentReviewModal: React.FC<ContentReviewModalProps> = ({
  isOpen,
  itemTitle,
  existingReview,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [containsSpoilers, setContainsSpoilers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingReview) {
      setTitle(existingReview.title || '');
      setContent(existingReview.content || '');
      const rawScore = existingReview.score || existingReview.rating || null;
      setScore(rawScore !== null && rawScore <= 10 && rawScore > 0 ? rawScore * 10 : rawScore);
      setContainsSpoilers(Boolean(existingReview.containsSpoilers));
    } else {
      setTitle('');
      setContent('');
      setScore(null);
      setContainsSpoilers(false);
    }
    setError(null);
  }, [existingReview, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Пожалуйста, напишите текст отзыва');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim() || null,
        content: content.trim(),
        score,
        containsSpoilers,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Ошибка при сохранении отзыва');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">
                {existingReview ? 'Редактировать рецензию' : 'Написать рецензию'}
              </h3>
              <p className="text-xs text-zinc-400 truncate max-w-[320px]">{itemTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Score Selector (0 to 100) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300">Ваша оценка Dodik Tracker (0–100, необязательно)</label>
              {score !== null && (
                <button
                  type="button"
                  onClick={() => setScore(null)}
                  className="text-[11px] text-zinc-400 hover:text-rose-400 transition-colors"
                >
                  Сбросить
                </button>
              )}
            </div>

            {score !== null ? (
              <div className="space-y-2 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-amber-300">★ {score} / 100</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                    className="w-3/5 h-2 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
                <div className="flex gap-1 justify-between">
                  {[25, 50, 60, 70, 80, 90, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setScore(preset)}
                      className={`flex-1 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer font-mono ${
                        score === preset
                          ? 'bg-purple-600 text-white border-purple-400'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
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
                    onClick={() => setScore(preset)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer font-mono bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-purple-500/50 hover:text-zinc-100"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Title input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Заголовок отзыва (необязательно)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Невероятный шедевр с глубоким смыслом"
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* Content textarea */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Текст рецензии *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Поделитесь своими впечатлениями, плюсами и минусами произведения..."
              className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-purple-500 transition-colors resize-none leading-relaxed"
              required
            />
          </div>

          {/* Spoiler Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={containsSpoilers}
              onChange={(e) => setContainsSpoilers(e.target.checked)}
              className="rounded bg-zinc-950 border-zinc-700 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-xs text-zinc-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Рецензия содержит спойлеры к сюжету</span>
            </span>
          </label>

          {/* Error notice */}
          {error && <p className="text-xs text-rose-400">{error}</p>}

          {/* Submit buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-purple-600/25 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Публикация...' : existingReview ? 'Обновить' : 'Опубликовать'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
