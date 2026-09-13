import React, { useState, useEffect } from 'react';
import { Layers, Calendar, Star, Loader2, AlertCircle } from 'lucide-react';
import { UnifiedSeries } from '../../types/unifiedGame.ts';
import { GameBreadcrumbs } from '../game/GameBreadcrumbs.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

interface GameSeriesDetailViewProps {
  seriesIdOrSlug: string;
}

export const GameSeriesDetailView: React.FC<GameSeriesDetailViewProps> = ({
  seriesIdOrSlug,
}) => {
  const { navigate } = useRouter();

  const [series, setSeries] = useState<UnifiedSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSeries = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/series/${encodeURIComponent(seriesIdOrSlug)}`);
      if (!res.ok) {
        throw new Error(`Серия не найдена: HTTP ${res.status}`);
      }
      const data = await res.json();
      setSeries(data);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки серии');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeries();
  }, [seriesIdOrSlug]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-zinc-400 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
        <p className="text-sm font-medium">Загрузка серии игр...</p>
      </div>
    );
  }

  if (error || !series) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-950/50 border border-rose-800/40 text-rose-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100">Серия игр не найдена</h2>
        <p className="text-sm text-zinc-400">{error || 'Информация о франшизе отсутствует'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      <GameBreadcrumbs
        items={[
          { label: 'Серии игр' },
          { label: series.name },
        ]}
      />

      {/* Series Hero */}
      <div className="relative rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-2xl p-6 md:p-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-purple-950/50 border border-purple-800/40 flex items-center justify-center text-purple-400">
            <Layers className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-100">
              {series.name}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Все игры серии и хронология франшизы ({series.games?.length || 0} игр)
            </p>
          </div>
        </div>
      </div>

      {/* Series Games List */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {series.games?.map((g) => (
          <button
            key={g.id}
            onClick={() => navigate(`/games/${encodeURIComponent(g.slug || String(g.id))}`)}
            className="group p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-purple-500/50 hover:bg-zinc-900 transition-all flex flex-col text-left shadow-lg"
          >
            <div className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-zinc-950 mb-3 border border-zinc-800">
              {g.posterUrl || g.coverUrl ? (
                <img
                  src={g.posterUrl || g.coverUrl}
                  alt={g.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                  Нет обложки
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col justify-between">
              <div className="text-xs font-bold text-zinc-200 group-hover:text-purple-300 transition-colors line-clamp-2">
                {g.title}
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-2.5">
                {g.year && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-zinc-500" />
                    <span>{g.year}</span>
                  </span>
                )}
                {g.rating && (
                  <span className="flex items-center gap-1 text-purple-400 font-semibold">
                    <Star className="w-3 h-3 fill-purple-400/20" />
                    <span>{g.rating.toFixed(1)}</span>
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
