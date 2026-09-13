import React from 'react';
import { Sparkles, Calendar, Star } from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';
import { formatMediaTypePath } from '../common/MediaCard.tsx';

interface ContentSimilarProps {
  items: any[];
  title?: string;
  subtitle?: string;
  onNavigateSimilar?: (item: any) => void;
}

export const ContentSimilar: React.FC<ContentSimilarProps> = ({
  items,
  title = 'Похожие произведения и рекомендации',
  subtitle = 'Рекомендуемые тайтлы в схожих жанрах и тематиках',
  onNavigateSimilar,
}) => {
  const { navigate } = useRouter();

  if (!items || items.length === 0) return null;

  const handleItemClick = (item: any) => {
    if (onNavigateSimilar) {
      onNavigateSimilar(item);
      return;
    }
    const typePath = formatMediaTypePath(item.type || 'MOVIE');
    if (item.id) {
      navigate(`/media/${typePath}/${item.id}`);
    } else if (item.externalId) {
      navigate(`/media/${typePath}/${item.externalId}?type=${item.type}&provider=${item.provider || ''}`);
    }
  };

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
          <p className="text-xs text-zinc-400">{subtitle}</p>
        </div>
      </div>

      {/* Grid of Similar Items */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
        {items.map((item, idx) => (
          <button
            key={item.id || item.externalId || idx}
            onClick={() => handleItemClick(item)}
            className="group p-2.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-purple-500/50 hover:bg-zinc-950 transition-all flex flex-col text-left"
          >
            {/* Poster */}
            <div className="aspect-[2/3] w-full rounded-xl overflow-hidden bg-zinc-900 mb-2 border border-zinc-800 relative">
              {item.posterUrl || item.poster || item.coverUrl ? (
                <img
                  src={item.posterUrl || item.poster || item.coverUrl}
                  alt={item.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                  Нет постера
                </div>
              )}

              {/* Rating badge if present */}
              {(item.rating || item.score) && (
                <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-zinc-700 text-[10px] font-bold text-amber-400 flex items-center gap-1 font-mono">
                  <Star className="w-2.5 h-2.5 fill-amber-400" />
                  <span>{Number(item.rating || item.score).toFixed(1)}</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 flex flex-col justify-between">
              <div className="text-xs font-bold text-zinc-200 group-hover:text-purple-300 transition-colors line-clamp-2">
                {item.title}
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2">
                {(item.year || item.releaseDate) && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-zinc-600" />
                    <span>
                      {item.year || (typeof item.releaseDate === 'string' ? item.releaseDate.slice(0, 4) : '')}
                    </span>
                  </span>
                )}
                {item.type && (
                  <span className="text-[10px] font-medium text-purple-400/80 uppercase">
                    {item.type}
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
