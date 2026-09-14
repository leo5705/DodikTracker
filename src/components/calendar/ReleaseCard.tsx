import React, { useState } from 'react';
import {
  Film,
  Tv,
  Flame,
  Gamepad2,
  BookOpen,
  BookMarked,
  Music,
  Star,
  Bell,
  Check,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import { ReleaseItem } from './types.ts';
import { formatDateRussian, getCategoryBadge, getDetailRouteForRelease } from './calendarUtils.ts';
import { useRouter } from '../../context/RouterContext.tsx';

interface ReleaseCardProps {
  item: ReleaseItem;
  onOpenDetails?: (item: ReleaseItem) => void;
  onToggleFollow: (item: ReleaseItem) => Promise<boolean>;
  compact?: boolean;
}

export const ReleaseCard: React.FC<ReleaseCardProps> = ({
  item,
  onOpenDetails,
  onToggleFollow,
  compact = false,
}) => {
  const { navigate } = useRouter();
  const [isFollowed, setIsFollowed] = useState(item.isFollowed || item.isSubscribed);
  const [isToggling, setIsToggling] = useState(false);

  const catMeta = getCategoryBadge(item.type);

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onOpenDetails) {
      onOpenDetails(item);
    }
    const targetRoute = getDetailRouteForRelease(item);
    navigate(targetRoute);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onOpenDetails) {
        onOpenDetails(item);
      }
      const targetRoute = getDetailRouteForRelease(item);
      navigate(targetRoute);
    }
  };

  const renderIcon = (name: string, className: string) => {
    switch (name) {
      case 'Film':
        return <Film className={className} />;
      case 'Tv':
        return <Tv className={className} />;
      case 'Flame':
        return <Flame className={className} />;
      case 'Gamepad2':
        return <Gamepad2 className={className} />;
      case 'BookOpen':
        return <BookOpen className={className} />;
      case 'BookMarked':
        return <BookMarked className={className} />;
      case 'Music':
        return <Music className={className} />;
      default:
        return <Sparkles className={className} />;
    }
  };

  const handleFollowClick = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (isToggling) return;
    setIsToggling(true);
    const prev = isFollowed;
    setIsFollowed(!prev);
    try {
      const success = await onToggleFollow(item);
      if (!success) {
        setIsFollowed(prev);
      }
    } catch {
      setIsFollowed(prev);
    } finally {
      setIsToggling(false);
    }
  };

  // Badge styling for countdown
  let countdownBg = 'bg-zinc-800/80 text-zinc-300 border-zinc-700/50';
  if (item.daysUntil === 0) {
    countdownBg = 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse';
  } else if (item.daysUntil === 1) {
    countdownBg = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  } else if (item.daysUntil > 1 && item.daysUntil <= 7) {
    countdownBg = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
  } else if (item.daysUntil < 0) {
    countdownBg = 'bg-zinc-800/40 text-zinc-400 border-zinc-800';
  }

  // Compact layout (designed for vertical column layout in Week View without overlapping)
  if (compact) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        className="group relative flex flex-col w-full rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800/90 hover:border-purple-500/50 p-2.5 transition-all duration-150 cursor-pointer shadow-sm hover:shadow-md hover:shadow-purple-950/25 select-none focus:outline-none focus:ring-2 focus:ring-purple-500/40"
      >
        {/* Top: Category label + Follow button */}
        <div className="flex items-center justify-between gap-1.5 w-full mb-2">
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${catMeta.bg} ${catMeta.text} ${catMeta.border} inline-flex items-center gap-1 shrink-0 max-w-[calc(100%-28px)] truncate`}
          >
            {renderIcon(catMeta.iconName, 'w-2.5 h-2.5 shrink-0')}
            <span className="truncate">{catMeta.label}</span>
          </span>

          <button
            type="button"
            onClick={handleFollowClick}
            onKeyDown={(e) => e.stopPropagation()}
            disabled={isToggling}
            className={`p-1 rounded-lg border transition-all shrink-0 ${
              isFollowed
                ? 'bg-purple-600/30 text-purple-300 border-purple-500/50 hover:bg-purple-600/40'
                : 'bg-zinc-800/80 text-zinc-400 border-zinc-700/60 hover:text-zinc-200 hover:bg-zinc-700'
            }`}
            title={isFollowed ? 'Вы следите за релизом' : 'Следить за релизом'}
            aria-label={isFollowed ? 'Вы следите за релизом' : 'Следить за релизом'}
          >
            <Bell className={`w-3 h-3 ${isFollowed ? 'fill-purple-400 text-purple-400' : ''}`} />
          </button>
        </div>

        {/* Middle: Poster thumbnail + Title and Rating */}
        <div className="flex items-start gap-2 w-full min-w-0 mb-2">
          <div className="relative w-9 h-12 rounded-md overflow-hidden bg-zinc-950 border border-zinc-800/80 shrink-0">
            {item.posterUrl ? (
              <img
                src={item.posterUrl}
                alt={item.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600">
                {renderIcon(catMeta.iconName, 'w-4 h-4')}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h4
              className="text-xs font-semibold text-zinc-200 line-clamp-2 leading-snug group-hover:text-purple-300 transition-colors break-words"
              title={item.title}
            >
              {item.title}
            </h4>

            {item.rating != null && item.rating > 0 && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-400 font-mono font-semibold">
                <Star className="w-2.5 h-2.5 fill-amber-400 shrink-0" />
                <span>{item.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom: Status/Platform + Countdown Badge */}
        <div className="pt-1.5 border-t border-zinc-800/60 flex items-center justify-between gap-1 w-full text-[9px] font-mono mt-auto">
          {isFollowed ? (
            <span className="text-purple-300 font-semibold inline-flex items-center gap-0.5 truncate">
              <Check className="w-2.5 h-2.5 shrink-0" />
              <span>Следите</span>
            </span>
          ) : item.platforms && item.platforms.length > 0 ? (
            <span className="text-zinc-400 truncate max-w-[70px]" title={item.platforms.join(', ')}>
              {item.platforms[0]}
            </span>
          ) : (
            <span className="text-zinc-500">
              {item.year || ''}
            </span>
          )}

          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border shrink-0 ${countdownBg}`}>
            {item.countdown}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className="group relative flex flex-col justify-between p-3.5 sm:p-4 rounded-2xl bg-[#13121A] hover:bg-[#181622] border border-[#232032] hover:border-purple-500/40 transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl hover:shadow-purple-950/20 focus:outline-none focus:ring-2 focus:ring-purple-500/40 select-none"
    >
      <div>
        {/* Top bar: Category + Priority Badges */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${catMeta.bg} ${catMeta.text} ${catMeta.border} inline-flex items-center gap-1.5`}
            >
              {renderIcon(catMeta.iconName, 'w-3 h-3')}
              {catMeta.label}
            </span>

            {item.isSoon && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 inline-flex items-center gap-1">
                🔥 Скоро
              </span>
            )}

            {item.isPopular && !item.isSoon && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                ⭐ Топ
              </span>
            )}

            {isFollowed && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 inline-flex items-center gap-1">
                ❤️ Вы следите
              </span>
            )}
          </div>

          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${countdownBg}`}>
            {item.countdown}
          </span>
        </div>

        {/* Content: Poster + Details */}
        <div className="flex gap-3.5 mb-3">
          <div className="relative shrink-0 w-16 sm:w-20 h-24 sm:h-28 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 group-hover:border-purple-500/30 transition-colors">
            {item.posterUrl ? (
              <img
                src={item.posterUrl}
                alt={item.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 p-2">
                {renderIcon(catMeta.iconName, 'w-6 h-6 mb-1')}
                <span className="text-[9px] text-center text-zinc-500 font-mono">Dodik</span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-zinc-100 group-hover:text-purple-300 transition-colors line-clamp-2 leading-snug">
                {item.title}
              </h3>
              {item.originalTitle && item.originalTitle !== item.title && (
                <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-sans">
                  {item.originalTitle}
                </p>
              )}

              {/* Episode info if series */}
              {item.episodeInfo && (
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-sky-400 font-mono">
                  <Layers className="w-3.5 h-3.5" />
                  <span>
                    Сезон {item.episodeInfo.seasonNumber}, Эпизод {item.episodeInfo.episodeNumber}
                    {item.episodeInfo.title ? `: ${item.episodeInfo.title}` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Meta tags: Genres, Rating, Platforms */}
            <div className="space-y-1.5 mt-2">
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-zinc-400">
                {item.rating != null && item.rating > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-400 font-semibold font-mono bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                    <Star className="w-3 h-3 fill-amber-400" />
                    {item.rating.toFixed(1)}
                  </span>
                )}

                {item.year && <span className="font-mono text-zinc-400">{item.year}</span>}

                {item.genres && item.genres.length > 0 && (
                  <span className="text-zinc-500 truncate max-w-[140px] sm:max-w-[200px]">
                    {item.genres.slice(0, 2).join(' · ')}
                  </span>
                )}
              </div>

              {item.platforms && item.platforms.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {item.platforms.slice(0, 3).map((p) => (
                    <span
                      key={p}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 font-mono"
                    >
                      {p}
                    </span>
                  ))}
                  {item.platforms.length > 3 && (
                    <span className="text-[9px] text-zinc-500 font-mono">
                      +{item.platforms.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar: Date & Follow Button */}
      <div className="pt-2.5 border-t border-zinc-800/60 flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-300">
          <Calendar className="w-3.5 h-3.5 text-purple-400" />
          <span className="font-semibold text-purple-200">
            {formatDateRussian(item.releaseDate, true)}
          </span>
          {item.releaseTime && (
            <span className="text-zinc-400 text-[10px]">в {item.releaseTime}</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleFollowClick}
          onKeyDown={(e) => e.stopPropagation()}
          disabled={isToggling}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
            isFollowed
              ? 'bg-purple-600/25 hover:bg-purple-600/35 text-purple-300 border-purple-500/40 shadow-sm'
              : 'bg-zinc-800 hover:bg-zinc-700/90 text-zinc-300 border-zinc-700/60 hover:text-white'
          }`}
        >
          <Bell className={`w-3.5 h-3.5 ${isFollowed ? 'fill-purple-400 text-purple-400' : ''}`} />
          <span>{isFollowed ? 'Вы следите' : 'Следить'}</span>
        </button>
      </div>
    </div>
  );
};

