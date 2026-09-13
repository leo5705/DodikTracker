import React from 'react';
import { Layers, Star, Calendar } from 'lucide-react';
import { UnifiedSeries } from '../../types/unifiedGame.ts';
import { useRouter } from '../../context/RouterContext.tsx';

interface GameSeriesProps {
  series: UnifiedSeries | null;
}

export const GameSeries: React.FC<GameSeriesProps> = ({ series }) => {
  const { navigate } = useRouter();

  if (!series || !series.games || series.games.length === 0) return null;

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Франшиза и серия игр</h2>
            <p className="text-xs text-zinc-400">{series.name} ({series.games.length} игр в серии)</p>
          </div>
        </div>
      </div>

      {/* Series Games Carousel / Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
        {series.games.map((g) => (
          <button
            key={g.id}
            onClick={() => navigate(`/games/${encodeURIComponent(g.slug || String(g.id))}`)}
            className="group p-2.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-purple-500/50 hover:bg-zinc-950 transition-all flex flex-col text-left"
          >
            <div className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-zinc-900 mb-2.5 border border-zinc-800">
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

              <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-2">
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
