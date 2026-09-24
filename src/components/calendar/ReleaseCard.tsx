import React, { useState } from 'react';
import {
  Film,
  Tv,
  Flame,
  Gamepad2,
  BookOpen,
  BookMarked,
  Shield,
  Music,
  Star,
  Bell,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { ReleaseItem } from './types.ts';
import { formatDateRussian, getCategoryBadge } from './calendarUtils.ts';
import { formatMediaTypePath } from '../../utils/formatters.ts';
import { useRouter } from '../../context/RouterContext.tsx';

interface ReleaseCardProps {
  item: ReleaseItem;
  onOpenDetails?: (item: ReleaseItem) => void;
  onToggleFollow?: (item: ReleaseItem) => Promise<boolean>;
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
  const targetId = item.mediaId || item.id;
  const targetRoute = `/media/${formatMediaTypePath(item.type)}/${targetId}`;

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(targetRoute);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      navigate(targetRoute);
    }
  };

  const handleFollowClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isToggling || !onToggleFollow) return;
    setIsToggling(true);
    const prev = isFollowed;
    setIsFollowed(!prev);
    try {
      const success = await onToggleFollow(item);
      if (!success) setIsFollowed(prev);
    } catch {
      setIsFollowed(prev);
    } finally {
      setIsToggling(false);
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

  // Format date display
  const releaseDateFormatted = formatDateRussian(item.releaseDate, false);

  // Countdown badge styling
  let countdownLabel = item.countdown;
  let countdownClass = 'bg-[#151932] text-[#94A3B8] border-[#1E2442]';
  if (item.daysUntil === 0) {
    countdownLabel = 'Сегодня';
    countdownClass = 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse font-bold';
  } else if (item.daysUntil === 1) {
    countdownLabel = 'Завтра';
    countdownClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold';
  } else if (item.daysUntil > 1 && item.daysUntil <= 7) {
    countdownClass = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
  }

  // Compact layout (used in Week view columns & Month view)
  if (compact) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        className="group relative flex flex-col w-full rounded-2xl bg-[#0B0D20] hover:bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/50 p-2.5 transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl hover:shadow-[#7C3AED]/10 select-none focus:outline-none focus:ring-1 focus:ring-[#8B5CF6]"
      >
        {/* Top Header: Category badge + Follow bell button */}
        <div className="flex items-center justify-between gap-1.5 w-full mb-2">
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${catMeta.bg} ${catMeta.text} ${catMeta.border} inline-flex items-center gap-1 shrink-0 max-w-[calc(100%-28px)] truncate`}
          >
            {renderIcon(catMeta.iconName, 'w-3 h-3 shrink-0')}
            <span className="truncate">{catMeta.label}</span>
          </span>

          {onToggleFollow && (
            <button
              type="button"
              onClick={handleFollowClick}
              disabled={isToggling}
              className={`p-1.5 rounded-xl border transition-all shrink-0 cursor-pointer ${
                isFollowed
                  ? 'bg-[#8B5CF6]/20 text-[#A78BFA] border-[#8B5CF6]/40 hover:bg-[#8B5CF6]/30'
                  : 'bg-[#151932] text-[#64748B] border-[#1E2442] hover:text-white hover:border-[#8B5CF6]/30'
              }`}
              title={isFollowed ? 'Вы следите за релизом' : 'Следить за релизом'}
            >
              <Bell className={`w-3 h-3 ${isFollowed ? 'fill-[#A78BFA] text-[#A78BFA]' : ''}`} />
            </button>
          )}
        </div>

        {/* Middle: Poster + Title + Rating */}
        <div className="flex items-start gap-2.5 w-full min-w-0 mb-2">
          <div className="relative w-11 h-15 rounded-xl overflow-hidden bg-[#151932] border border-[#1E2442] shrink-0">
            {item.posterUrl ? (
              <img
                src={item.posterUrl}
                alt={item.title}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#64748B]">
                {renderIcon(catMeta.iconName, 'w-5 h-5')}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-white group-hover:text-[#A78BFA] transition-colors line-clamp-2 leading-snug">
              {item.title}
            </h4>

            {item.episodeInfo && (
              <div className="text-[10px] text-purple-300 font-mono mt-0.5 truncate">
                S{item.episodeInfo.seasonNumber} E{item.episodeInfo.episodeNumber}
              </div>
            )}

            {typeof item.rating === 'number' && item.rating > 0 && (
              <div className="flex items-center gap-1 mt-1 text-[10px] font-mono text-amber-300 font-bold">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span>{item.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom: Release date + Countdown */}
        <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-[#1E2442] text-[10px] font-mono">
          <span className="text-[#94A3B8] flex items-center gap-1 truncate">
            <Calendar className="w-3 h-3 text-[#64748B] shrink-0" />
            <span className="truncate">{releaseDateFormatted}</span>
          </span>

          {countdownLabel && (
            <span className={`px-1.5 py-0.2 rounded-md border text-[9px] font-bold shrink-0 ${countdownClass}`}>
              {countdownLabel}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Standard full card layout
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className="group relative flex flex-col sm:flex-row items-stretch gap-3 rounded-2xl bg-[#0B0D20] hover:bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/50 p-3.5 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-2xl hover:shadow-[#7C3AED]/10 select-none focus:outline-none focus:ring-1 focus:ring-[#8B5CF6]"
    >
      {/* Poster */}
      <div className="relative w-full sm:w-20 sm:h-28 aspect-[2/3] sm:aspect-auto rounded-xl overflow-hidden bg-[#151932] border border-[#1E2442] shrink-0">
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#64748B]">
            {renderIcon(catMeta.iconName, 'w-8 h-8')}
          </div>
        )}

        {typeof item.rating === 'number' && item.rating > 0 && (
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-amber-500/40 text-amber-300 font-mono font-bold text-[10px] flex items-center gap-0.5 shadow-md">
            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
            <span>{item.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${catMeta.bg} ${catMeta.text} ${catMeta.border} inline-flex items-center gap-1`}
            >
              {renderIcon(catMeta.iconName, 'w-3 h-3')}
              <span>{catMeta.label}</span>
            </span>

            {onToggleFollow && (
              <button
                type="button"
                onClick={handleFollowClick}
                disabled={isToggling}
                className={`p-1.5 rounded-xl border transition-all shrink-0 cursor-pointer ${
                  isFollowed
                    ? 'bg-[#8B5CF6]/20 text-[#A78BFA] border-[#8B5CF6]/40 hover:bg-[#8B5CF6]/30'
                    : 'bg-[#151932] text-[#64748B] border-[#1E2442] hover:text-white'
                }`}
                title={isFollowed ? 'Вы следите за релизом' : 'Следить за релизом'}
              >
                <Bell className={`w-3.5 h-3.5 ${isFollowed ? 'fill-[#A78BFA] text-[#A78BFA]' : ''}`} />
              </button>
            )}
          </div>

          <h4 className="text-sm font-bold text-white group-hover:text-[#A78BFA] transition-colors line-clamp-1">
            {item.title}
          </h4>

          {item.originalTitle && item.originalTitle !== item.title && (
            <p className="text-[11px] text-[#64748B] truncate mt-0.5">{item.originalTitle}</p>
          )}

          {item.episodeInfo && (
            <p className="text-xs text-purple-300 font-mono mt-1">
              Сезон {item.episodeInfo.seasonNumber}, Серия {item.episodeInfo.episodeNumber}
              {item.episodeInfo.title ? `: ${item.episodeInfo.title}` : ''}
            </p>
          )}
        </div>

        {/* Release Date info */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#1E2442] mt-2 text-xs font-mono">
          <span className="text-[#94A3B8] flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#64748B]" />
            <span>{formatDateRussian(item.releaseDate, true)}</span>
          </span>

          {countdownLabel && (
            <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${countdownClass}`}>
              {countdownLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
