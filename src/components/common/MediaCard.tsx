import React from 'react';
import { Star, Heart, Film, Tv, Sparkles, BookOpen, Gamepad2, Book, Flame, Plus, Bookmark } from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';

export interface MediaCardItem {
  id?: number;
  mediaId?: number;
  title: string;
  originalTitle?: string;
  type?: string;
  posterUrl?: string;
  year?: number;
  rating?: number;
  userStatus?: string;
  status?: string;
  userRating?: number;
  progress?: number;
  totalEpisodes?: number;
  isFavorite?: boolean;
  userMediaId?: number;
}

interface MediaCardProps {
  media: MediaCardItem;
  size?: 'sm' | 'md' | 'lg';
  showQuickActions?: boolean;
  onQuickAdd?: (media: MediaCardItem) => void;
  onQuickBookmark?: (media: MediaCardItem) => void;
  onToggleFavorite?: (media: MediaCardItem) => void;
  className?: string;
}

export const formatMediaTypePath = (type?: string): string => {
  if (!type) return 'item';
  return type.toLowerCase().replace(/_/g, '-');
};

export const MediaCard: React.FC<MediaCardProps> = ({
  media,
  size = 'md',
  showQuickActions = false,
  onQuickAdd,
  onQuickBookmark,
  onToggleFavorite,
  className = '',
}) => {
  const { navigate } = useRouter();
  const [imgError, setImgError] = React.useState(false);
  const mediaId = media.id || media.mediaId;
  const targetType = formatMediaTypePath(media.type);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (mediaId) {
      navigate(`/media/${targetType}/${mediaId}`);
    }
  };

  const getTypeIcon = () => {
    switch (media.type) {
      case 'MOVIE':
        return <Film className="w-3 h-3 text-purple-400" />;
      case 'TV':
        return <Tv className="w-3 h-3 text-indigo-400" />;
      case 'ANIME':
        return <Sparkles className="w-3 h-3 text-fuchsia-400" />;
      case 'MANGA':
        return <BookOpen className="w-3 h-3 text-pink-400" />;
      case 'GAME':
        return <Gamepad2 className="w-3 h-3 text-emerald-400" />;
      case 'BOOK':
        return <Book className="w-3 h-3 text-amber-400" />;
      case 'COMIC':
        return <Flame className="w-3 h-3 text-orange-400" />;
      default:
        return <Film className="w-3 h-3 text-zinc-400" />;
    }
  };

  const getStatusBadge = () => {
    const s = media.userStatus || media.status;
    if (!s) return null;
    if (s === 'COMPLETED') return { label: 'Завершено', bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60' };
    if (s === 'WATCHING' || s === 'PLAYING' || s === 'READING')
      return { label: 'В процессе', bg: 'bg-purple-950/80 text-purple-300 border-purple-800/60' };
    if (s === 'DROPPED') return { label: 'Дроп', bg: 'bg-red-950/80 text-red-300 border-red-800/60' };
    return { label: 'В планах', bg: 'bg-zinc-900/90 text-zinc-300 border-zinc-700' };
  };

  const statusBadge = getStatusBadge();

  return (
    <div
      onClick={handleClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick(e as any)}
      className={`group relative flex flex-col rounded-2xl bg-[#14131A] border border-[#252233] hover:border-[#AC82FF]/50 overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#9B6BFF]/10 text-left ${className}`}
    >
      {/* Poster image container */}
      <div className="relative aspect-[2/3] w-full bg-[#191724] overflow-hidden">
        {media.posterUrl && !imgError ? (
          <img
            src={media.posterUrl}
            alt={media.title}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : media.type === 'GAME' ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-[#15141C] text-[#9A94AA] border border-[#252233]">
            <Gamepad2 className="w-7 h-7 mb-1.5 text-[#AC82FF]/50" />
            <span className="text-[11px] font-semibold text-zinc-300 line-clamp-2 px-1">{media.title}</span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-600 font-mono mt-1">Игра</span>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-[#9A94AA] text-xs">
            <Film className="w-6 h-6 mb-1 text-zinc-600" />
            <span className="line-clamp-2">{media.title}</span>
          </div>
        )}

        {/* Top Rating Badge */}
        {media.rating ? (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-amber-500/30 text-amber-400 text-[10px] font-bold flex items-center gap-1 shadow">
            <Star className="w-3 h-3 fill-amber-400" />
            <span>{typeof media.rating === 'number' ? media.rating.toFixed(1) : media.rating}</span>
          </div>
        ) : null}

        {/* Favorite indicator / toggle */}
        {onToggleFavorite && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(media);
            }}
            className="absolute top-2 left-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 transition-colors"
            title={media.isFavorite ? 'В избранном' : 'Добавить в избранное'}
          >
            <Heart
              className={`w-3.5 h-3.5 ${
                media.isFavorite ? 'text-rose-500 fill-rose-500' : 'text-zinc-400 hover:text-rose-400'
              }`}
            />
          </button>
        )}

        {/* Status Badge overlay */}
        {statusBadge && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            <span
              className={`text-[9px] font-semibold px-2 py-0.5 rounded-md border backdrop-blur-md shadow ${statusBadge.bg}`}
            >
              {statusBadge.label}
            </span>
            {media.userRating && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/80 text-amber-400 border border-amber-500/30">
                ★ {media.userRating}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Info footer */}
      <div className="p-3 flex-1 flex flex-col justify-between space-y-1.5">
        <div>
          <h3 className="text-xs font-bold text-[#F3F1F8] line-clamp-1 group-hover:text-[#AC82FF] transition-colors">
            {media.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#9A94AA]">
            {media.year && <span>{media.year}</span>}
            {media.year && <span className="text-zinc-600">•</span>}
            <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-300">
              {getTypeIcon()}
              {media.type || 'Медиа'}
            </span>
          </div>
        </div>

        {/* Quick action buttons if requested */}
        {showQuickActions && (onQuickAdd || onQuickBookmark) && (
          <div className="flex items-center gap-1.5 pt-1 border-t border-[#252233]/60">
            {onQuickAdd && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickAdd(media);
                }}
                className="flex-1 py-1 px-2 rounded-lg bg-[#9B6BFF]/15 hover:bg-[#9B6BFF] text-[#AC82FF] hover:text-white border border-[#9B6BFF]/30 hover:border-[#9B6BFF] text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
                title="Добавить в библиотеку"
              >
                <Plus className="w-3 h-3" />
                Библиотека
              </button>
            )}
            {onQuickBookmark && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickBookmark(media);
                }}
                className="p-1 rounded-lg bg-[#191724] hover:bg-[#9B6BFF] text-[#9A94AA] hover:text-white border border-[#252233] hover:border-[#9B6BFF] transition-colors"
                title="В список"
              >
                <Bookmark className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
