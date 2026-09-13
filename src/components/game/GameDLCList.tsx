import React from 'react';
import { Package, Star, Calendar } from 'lucide-react';
import { UnifiedDLC } from '../../types/unifiedGame.ts';
import { useRouter } from '../../context/RouterContext.tsx';

interface GameDLCListProps {
  dlcs: UnifiedDLC[];
}

export const GameDLCList: React.FC<GameDLCListProps> = ({ dlcs }) => {
  const { navigate } = useRouter();

  if (dlcs.length === 0) return null;

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-5">
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
          <Package className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">DLC и дополнения</h2>
          <p className="text-xs text-zinc-400">Официальные расширения и дополнительный контент ({dlcs.length})</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
        {dlcs.map((dlc) => (
          <button
            key={dlc.id}
            onClick={() => navigate(`/games/${encodeURIComponent(dlc.slug || String(dlc.id))}`)}
            className="group p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-purple-500/50 hover:bg-zinc-950 transition-all flex items-center gap-3.5 text-left"
          >
            <div className="w-16 h-20 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-zinc-800">
              {dlc.coverUrl ? (
                <img
                  src={dlc.coverUrl}
                  alt={dlc.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px]">
                  DLC
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-zinc-200 group-hover:text-purple-300 transition-colors line-clamp-2">
                {dlc.title}
              </div>
              <div className="text-[10px] text-purple-400 font-medium mt-1">
                {dlc.type || 'Дополнение'}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-1">
                {dlc.releaseDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-zinc-500" />
                    <span>{dlc.releaseDate.split('-')[0]}</span>
                  </span>
                )}
                {dlc.rating && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <Star className="w-3 h-3 fill-amber-400/20" />
                    <span>{dlc.rating.toFixed(1)}</span>
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
