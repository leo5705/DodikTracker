import React, { useState, useEffect } from 'react';
import { Radio, Heart, MessageSquare, Star, Film, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { formatMediaTypePath } from '../../utils/formatters.ts';

export const FeedView: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const { navigate } = useRouter();
  const [feed, setFeed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/feed');
      if (res.ok) {
        const data = await res.json();
        setFeed(data);
      }
    } catch (err) {
      console.error('Failed to load feed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, [dbUser]);

  const toggleLike = async (activityId: number, currentLiked: boolean) => {
    if (!dbUser) return;

    // Optimistic update
    setFeed((prev) =>
      prev.map((act) => {
        if (act.id === activityId) {
          return {
            ...act,
            userLiked: !currentLiked,
            likesCount: currentLiked ? act.likesCount - 1 : act.likesCount + 1,
          };
        }
        return act;
      })
    );

    try {
      await authFetch('/api/social/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'ACTIVITY', targetId: activityId }),
      });
    } catch (err) {
      console.error('Failed to toggle like:', err);
      // Revert on error
      fetchFeed();
    }
  };

  const getActivityLabel = (type: string, details?: string) => {
    switch (type) {
      case 'MEDIA_COMPLETED':
        return 'завершил(а) просмотр/прохождение';
      case 'MEDIA_RATED':
        return `поставил(а) оценку ${details || ''}`;
      default:
        return 'добавил(а) в библиотеку';
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-zinc-100 font-mono tracking-tight flex items-center gap-2">
          <Radio className="w-6 h-6 text-purple-400" />
          СОЦИАЛЬНАЯ ЛЕНТА
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Свежие действия ваших друзей и сообщества Dodik Tracker в реальном времени
        </p>
      </div>

      {/* Activities list */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-xs text-zinc-400">Загрузка ленты событий...</p>
        </div>
      ) : feed.length > 0 ? (
        <div className="space-y-4">
          {feed.map((act) => (
            <div
              key={act.id}
              className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 transition-all shadow-md space-y-3"
            >
              {/* User header */}
              <div className="flex items-center gap-3">
                {act.avatar ? (
                  <img
                    src={act.avatar}
                    alt={act.username}
                    referrerPolicy="no-referrer"
                    onClick={() => navigate(`/u/${act.username}`)}
                    className="w-9 h-9 rounded-full object-cover ring-2 ring-purple-500/30 cursor-pointer hover:opacity-80 transition-opacity"
                  />
                ) : (
                  <div
                    onClick={() => navigate(`/u/${act.username}`)}
                    className="w-9 h-9 rounded-full bg-purple-900/80 flex items-center justify-center text-xs font-bold text-purple-200 cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    {act.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-xs text-zinc-200">
                    <strong
                      onClick={() => navigate(`/u/${act.username}`)}
                      className="text-purple-300 font-semibold cursor-pointer hover:underline"
                    >
                      @{act.username}
                    </strong>{' '}
                    <span className="text-zinc-400">{getActivityLabel(act.type, act.details)}</span>
                  </p>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {new Date(act.createdAt).toLocaleString('ru-RU', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              </div>

              {/* Media card preview inside activity */}
              {act.mediaTitle && (
                <div
                  onClick={() => act.mediaId && navigate(`/media/${formatMediaTypePath(act.mediaType || 'MOVIE')}/${act.mediaId}`)}
                  className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex gap-3.5 items-center cursor-pointer hover:border-purple-500/50 transition-colors"
                >
                  {act.mediaPoster ? (
                    <img
                      src={act.mediaPoster}
                      alt={act.mediaTitle}
                      referrerPolicy="no-referrer"
                      className="w-12 h-16 object-cover rounded-lg shrink-0 shadow"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-zinc-900 rounded-lg flex items-center justify-center text-xs text-zinc-400 shrink-0">
                      <Film className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-zinc-100 line-clamp-1 hover:text-purple-400 transition-colors">
                      {act.mediaTitle}
                    </h4>
                    <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/30">
                      {act.mediaType}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions: Likes */}
              <div className="flex items-center gap-4 pt-1 text-xs text-zinc-400">
                <button
                  onClick={() => toggleLike(act.id, act.userLiked)}
                  className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg border transition-colors ${
                    act.userLiked
                      ? 'bg-red-950/40 text-red-400 border-red-800/40'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${
                      act.userLiked ? 'fill-red-400 text-red-400' : 'text-zinc-400'
                    }`}
                  />
                  <span>{act.likesCount || 0}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center space-y-3 bg-zinc-900/30 rounded-2xl border border-zinc-800 p-8">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
            <Radio className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-200 font-mono">Лента активности пуста</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Оценивайте фильмы, сериалы и игры в своей библиотеке, чтобы они появились в ленте!
          </p>
        </div>
      )}
    </div>
  );
};
