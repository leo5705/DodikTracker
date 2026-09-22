import React from 'react';
import { ShoppingBag, ExternalLink } from 'lucide-react';
import { UnifiedStore } from '../../types/unifiedGame.ts';
import { deduplicateAndNormalizeStores } from '../../utils/storeNormalizer.ts';

interface GameStoreListProps {
  stores: UnifiedStore[];
}

export const GameStoreList: React.FC<GameStoreListProps> = ({ stores }) => {
  // Defensive deduplication & normalization
  const normalizedStores = deduplicateAndNormalizeStores(stores || []);

  if (normalizedStores.length === 0) return null;

  return (
    <div id="game-store-list-section" className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-5">
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
          <ShoppingBag className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Где купить и получить игру</h2>
          <p className="text-xs text-zinc-400">Официальные цифровые магазины и площадки</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {normalizedStores.map((store) => {
          const storeKey = String(store.id || store.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
          return (
            <div
              key={store.id || store.name}
              id={`game-store-card-${storeKey}`}
              className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-purple-500/50 hover:bg-zinc-950 transition-all flex items-center justify-between gap-3 group shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-purple-950/40 border border-purple-800/40 flex items-center justify-center text-purple-400 font-bold text-xs shrink-0 group-hover:scale-105 transition-transform">
                  {store.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-zinc-200 group-hover:text-purple-300 transition-colors truncate">
                    {store.name}
                  </div>
                  {store.domain && (
                    <div className="text-[11px] text-zinc-500 truncate">
                      {store.domain}
                    </div>
                  )}
                </div>
              </div>

              <a
                id={`game-store-buy-btn-${storeKey}`}
                href={store.url || (store.domain ? `https://${store.domain}` : '#')}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600 border border-purple-500/30 hover:border-purple-500 text-purple-300 hover:text-white font-semibold text-xs transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
              >
                <span>Купить</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
};

