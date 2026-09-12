import React, { useEffect, useState } from 'react';
import { X, Sparkles, Star, Film, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface TasteComparisonModalProps {
  friendUsername: string;
  onClose: () => void;
}

export const TasteComparisonModal: React.FC<TasteComparisonModalProps> = ({
  friendUsername,
  onClose,
}) => {
  const { authFetch } = useAuth();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchComparison = async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/api/users/${friendUsername}/compare`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Не удалось сравнить вкусы');
        }
        const resData = await res.json();
        setData(resData);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchComparison();
  }, [friendUsername]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl custom-scrollbar">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900/90 backdrop-blur z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-base font-bold text-zinc-100 font-mono">
              СРАВНЕНИЕ ВКУСОВ С @{friendUsername}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
              <p className="text-xs text-zinc-400">Анализируем библиотеки и сопоставляем оценки...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-xs text-red-300">
              {error}
            </div>
          ) : data ? (
            <>
              {/* Score circle banner */}
              <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-950/60 via-zinc-900 to-fuchsia-950/60 border border-purple-800/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-zinc-200">Индекс совместимости</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Основан на общих просмотренных тайтлах и схожести поставленных оценок
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-purple-600/20 border-2 border-purple-500 flex items-center justify-center shadow-lg shadow-purple-950">
                    <span className="text-xl font-black text-purple-300 font-mono">
                      {data.matchPercentage}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Shared overlap */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
                  Общие тайтлы ({data.commonCount})
                </h4>
                {data.commonItems.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {data.commonItems.slice(0, 6).map((m: any) => (
                      <div
                        key={m.mediaId}
                        className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 flex gap-2.5 items-center"
                      >
                        {m.posterUrl ? (
                          <img
                            src={m.posterUrl}
                            alt={m.title}
                            referrerPolicy="no-referrer"
                            className="w-10 h-14 object-cover rounded-lg shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-14 bg-zinc-800 rounded-lg shrink-0 flex items-center justify-center text-xs text-zinc-400">
                            <Film className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-100 truncate">{m.title}</p>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-400">
                            <span>Вы: {m.myRating ? `${m.myRating}/10` : '—'}</span>
                            <span>•</span>
                            <span>Друг: {m.friendRating ? `${m.friendRating}/10` : '—'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">
                    Пока нет общих тайтлов в библиотеках.
                  </p>
                )}
              </div>

              {/* You liked, friend hasn't watched */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">
                  Вам понравилось, а друг ещё не смотрел
                </h4>
                {data.youLikedFriendHasntWatched.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {data.youLikedFriendHasntWatched.map((m: any) => (
                      <div
                        key={m.mediaId}
                        className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1"
                      >
                        <p className="text-xs font-semibold text-zinc-200 truncate">{m.title}</p>
                        <div className="flex items-center gap-1 text-[10px] text-amber-400">
                          <Star className="w-3 h-3 fill-amber-400" />
                          Ваша оценка: {m.rating}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">Нет рекомендаций в этой категории.</p>
                )}
              </div>

              {/* Friend liked, you haven't watched */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider font-mono">
                  Другу понравилось, а вы ещё не смотрели
                </h4>
                {data.friendLikedYouHaventWatched.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {data.friendLikedYouHaventWatched.map((m: any) => (
                      <div
                        key={m.mediaId}
                        className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1"
                      >
                        <p className="text-xs font-semibold text-zinc-200 truncate">{m.title}</p>
                        <div className="flex items-center gap-1 text-[10px] text-amber-400">
                          <Star className="w-3 h-3 fill-amber-400" />
                          Оценка друга: {m.rating}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">Нет рекомендаций в этой категории.</p>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
