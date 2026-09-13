import React from 'react';
import { ShoppingBag, ExternalLink } from 'lucide-react';
import { UnifiedStore } from '../../types/unifiedGame.ts';

interface GameStoreListProps {
  stores: UnifiedStore[];
}

export const GameStoreList: React.FC<GameStoreListProps> = ({ stores }) => {
  if (stores.length === 0) return null;

  const getStoreName = (s: UnifiedStore) => {
    const domain = (s.domain || s.url || '').toLowerCase();
    if (domain.includes('steampowered.com') || domain.includes('steam')) return 'Steam';
    if (domain.includes('epicgames.com')) return 'Epic Games Store';
    if (domain.includes('gog.com')) return 'GOG';
    if (domain.includes('playstation.com')) return 'PlayStation Store';
    if (domain.includes('microsoft.com') || domain.includes('xbox.com')) return 'Xbox Store';
    if (domain.includes('nintendo.com')) return 'Nintendo eShop';
    if (domain.includes('ea.com') || domain.includes('origin.com')) return 'EA App';
    if (domain.includes('ubisoft.com')) return 'Ubisoft Store';
    return s.name || 'Магазин';
  };

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-5">
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
          <ShoppingBag className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Где купить и скачать</h2>
          <p className="text-xs text-zinc-400">Официальные цифровые витрины и магазины</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {stores.map((store) => {
          const name = getStoreName(store);
          return (
            <a
              key={store.id}
              href={store.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-purple-500/50 hover:bg-zinc-950 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-purple-950/40 border border-purple-800/40 flex items-center justify-center text-purple-400 font-bold text-xs shrink-0">
                  {name.charAt(0)}
                </div>
                <div className="text-xs font-bold text-zinc-200 group-hover:text-purple-300 transition-colors truncate">
                  {name}
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-600 group-hover:text-purple-400 transition-colors shrink-0" />
            </a>
          );
        })}
      </div>
    </div>
  );
};
