import React, { useState } from 'react';
import { Star, Heart, Film, Tv, Sparkles, BookOpen, Gamepad2, Book, Flame, Plus, Bookmark, Music2, Lock } from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatMediaTypePath } from '../../utils/formatters.ts';
import { StatusBadge, RatingBadge, CategoryBadge, getCategoryMeta } from './badges.tsx';

export interface MediaItem {
  id?: number;
  mediaId?: number;
  title: string;
  originalTitle?: string;
  type?: string;
  posterUrl?: string;
  year?: number;
  rating?: number;
  dodikRating?: number | null;
  dodikRatingCount?: number;
  userStatus?: string;
  status?: string;
  userRating?: number;
  progress?: number;
  totalEpisodes?: number;
  isFavorite?: boolean;
  userMediaId?: number;
  isAdult?: boolean;
  ageRating?: string;
  genres?: string[] | string;
}

export interface MediaPosterProps {
  posterUrl?: string;
  title: string;
  type?: string;
  rating?: number;
  dodikRating?: number | null;
  dodikRatingCount?: number;
  isAdult?: boolean;
  ageRating?: string;
  status?: string;
  userRating?: number;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  className?: string;
  aspectRatio?: 'poster' | 'square' | 'banner';
}

export const MediaPoster: React.FC<MediaPosterProps> = ({
  posterUrl,
  title,
  type,
  rating,
  dodikRating,
  dodikRatingCount,
  isAdult,
  ageRating,
  status,
  userRating,
  isFavorite,
  onToggleFavorite,
  className = '',
  aspectRatio = 'poster',
}) => {
  const { dbUser } = useAuth();
  const [imgError, setImgError] = useState(false);
  const meta = getCategoryMeta(type);
  const Icon = meta.icon;

  const isItemAdult = Boolean(
    isAdult ||
    ageRating === '18+' ||
    ageRating === '18' ||
    ageRating === 'AO' ||
    ageRating === 'NC-17' ||
    ageRating === 'R18+' ||
    ageRating === 'Explicit (18+)'
  );
  const shouldMaskAdult = isItemAdult && !dbUser?.showAdultContent;

  const aspectClass = {
    poster: 'aspect-[2/3]',
    square: 'aspect-square',
    banner: 'aspect-[16/9]',
  }[aspectRatio];

  return (
    <div className={`relative w-full ${aspectClass} rounded-2xl overflow-hidden bg-[#0B0D20] border border-[#1E2442] group-hover:border-[#8B5CF6]/50 transition-colors shadow-md ${className}`}>
      {posterUrl && !imgError ? (
        <img
          src={posterUrl}
          alt={title}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`w-full h-full object-cover transition-transform duration-300 ${
            shouldMaskAdult
              ? 'blur-lg scale-105 opacity-40 brightness-75 grayscale'
              : 'group-hover:scale-[1.03]'
          }`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-b from-[#151932] to-[#0B0D20] text-[#94A3B8]">
          <Icon className="w-9 h-9 mb-2 text-[#8B5CF6]/60" />
          <span className="text-xs sm:text-sm font-semibold text-[#F8FAFC] line-clamp-2 px-1">{title}</span>
          <span className="text-xs uppercase tracking-wider text-[#64748B] font-mono mt-1">
            {meta.label}
          </span>
        </div>
      )}

      {/* Mask overlay for 18+ content if not enabled by user */}
      {shouldMaskAdult && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-2 text-center bg-black/60 backdrop-blur-[2px] pointer-events-none">
          <div className="w-9 h-9 rounded-xl bg-rose-600/30 border border-rose-500/50 flex items-center justify-center text-rose-400 mb-1 shadow-md">
            <Lock className="w-4.5 h-4.5" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-rose-300 font-mono">
            18+ Контент
          </span>
        </div>
      )}

      {/* Subtle bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#080A18] via-[#080A18]/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity pointer-events-none" />

      {/* 18+ Adult Badge */}
      {isItemAdult && !shouldMaskAdult && (
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-rose-600/90 text-white text-xs font-black tracking-wider border border-rose-500/50 shadow z-10">
          18+
        </div>
      )}

      {/* Top Rating Badge */}
      {dodikRating && dodikRating > 0 ? (
        <div className="absolute top-2 right-2 z-10">
          <RatingBadge score={dodikRating} size="sm" isUserRating={false} className="!bg-gradient-to-r !from-purple-950/90 !to-indigo-950/90 !border-purple-500/60" />
        </div>
      ) : rating ? (
        <div className="absolute top-2 right-2 z-10">
          <RatingBadge score={rating} size="sm" />
        </div>
      ) : null}

      {/* Favorite Toggle Button */}
      {onToggleFavorite && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="absolute top-2 left-2 p-2 rounded-xl bg-[#080A18]/85 hover:bg-[#080A18] backdrop-blur-md border border-[#1E2442] hover:border-rose-500/50 transition-colors z-10 cursor-pointer"
          title={isFavorite ? 'В избранном' : 'Добавить в избранное'}
        >
          <Heart
            className={`w-4 h-4 ${
              isFavorite ? 'text-rose-500 fill-rose-500' : 'text-[#94A3B8] hover:text-rose-400'
            }`}
          />
        </button>
      )}

      {/* Status & User Rating bottom overlay */}
      {(status || userRating) && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10 gap-1.5">
          {status && <StatusBadge status={status} size="sm" />}
          {userRating ? (
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-lg bg-[#080A18]/90 text-amber-300 border border-amber-400/40">
              ★ {userRating}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
};

export interface MediaCardProps {
  media: MediaItem;
  size?: 'sm' | 'md' | 'lg';
  showQuickActions?: boolean;
  onQuickAdd?: (media: MediaItem) => void;
  onQuickBookmark?: (media: MediaItem) => void;
  onToggleFavorite?: (media: MediaItem) => void;
  onQuickStatus?: (media: MediaItem) => void;
  className?: string;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  media,
  size = 'md',
  showQuickActions = false,
  onQuickAdd,
  onQuickBookmark,
  onToggleFavorite,
  onQuickStatus,
  className = '',
}) => {
  const { navigate } = useRouter();
  const mediaId = media.id || media.mediaId;
  const targetType = formatMediaTypePath(media.type);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (mediaId) {
      navigate(`/media/${targetType}/${mediaId}`);
    }
  };

  const hasTracking = Boolean(media.userStatus || media.status || media.userMediaId);

  return (
    <div
      onClick={handleClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick(e as any)}
      className={`group relative flex flex-col rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 p-2.5 overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#7C3AED]/15 text-left select-none ${className}`}
    >
      {/* Poster */}
      <MediaPoster
        posterUrl={media.posterUrl}
        title={media.title}
        type={media.type}
        rating={media.rating}
        dodikRating={media.dodikRating}
        dodikRatingCount={media.dodikRatingCount}
        isAdult={media.isAdult}
        ageRating={media.ageRating}
        status={media.userStatus || media.status}
        userRating={media.userRating}
        isFavorite={media.isFavorite}
        onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(media) : undefined}
      />

      {/* Info Block */}
      <div className="pt-2.5 px-1 pb-0.5 flex-1 flex flex-col justify-between space-y-2">
        <div>
          <h3 className="text-sm font-bold text-[#F8FAFC] line-clamp-2 min-h-[2.5rem] group-hover:text-[#A78BFA] transition-colors leading-snug">
            {media.title}
          </h3>

          <div className="flex items-center gap-2 mt-1.5 text-xs text-[#94A3B8]">
            {media.year && <span className="font-mono tabular-nums">{media.year}</span>}
            {media.year && <span className="text-[#334155]">·</span>}
            {media.rating ? (
              <>
                <span className="font-mono text-amber-400 font-semibold flex items-center gap-1">
                  ★ {typeof media.rating === 'number' ? media.rating.toFixed(1) : media.rating}
                </span>
                <span className="text-[#334155]">·</span>
              </>
            ) : null}
            <span className="text-xs font-medium text-[#A78BFA] truncate">
              {getCategoryMeta(media.type).label}
            </span>
          </div>
        </div>

        {/* Progress bar if tracked and in progress */}
        {media.progress !== undefined && media.progress > 0 && (
          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between text-xs font-mono text-[#94A3B8]">
              <span>Прогресс:</span>
              <span className="text-[#A78BFA] font-bold tabular-nums">
                {media.progress}{media.totalEpisodes ? `/${media.totalEpisodes}` : ' пр.'}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#151932] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#7C3AED] to-[#6366F1] rounded-full"
                style={{
                  width: media.totalEpisodes
                    ? `${Math.min(100, Math.round((media.progress / media.totalEpisodes) * 100))}%`
                    : '45%',
                }}
              />
            </div>
          </div>
        )}

        {/* Quick action buttons if enabled */}
        {showQuickActions && (onQuickAdd || onQuickStatus || onQuickBookmark) && (
          <div className="flex items-center gap-1.5 pt-2 border-t border-[#1E2442]/70 mt-1">
            {(onQuickAdd || onQuickStatus) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasTracking && onQuickStatus) {
                    onQuickStatus(media);
                  } else if (onQuickAdd) {
                    onQuickAdd(media);
                  }
                }}
                className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#151932] hover:bg-[#7C3AED] text-[#A78BFA] hover:text-white border border-[#1E2442] hover:border-[#7C3AED] text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title={hasTracking ? 'Изменить статус' : 'В библиотеку'}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{hasTracking ? 'Статус' : 'Библиотека'}</span>
              </button>
            )}
            {onQuickBookmark && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickBookmark(media);
                }}
                className="p-1.5 rounded-xl bg-[#151932] hover:bg-[#191D38] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-colors cursor-pointer"
                title="В список"
              >
                <Bookmark className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export interface MediaHorizontalCardProps {
  media: MediaItem;
  onAction?: (media: MediaItem) => void;
  actionText?: string;
  className?: string;
}

export const MediaHorizontalCard: React.FC<MediaHorizontalCardProps> = ({
  media,
  onAction,
  actionText,
  className = '',
}) => {
  const { navigate } = useRouter();
  const mediaId = media.id || media.mediaId;
  const targetType = formatMediaTypePath(media.type);

  const handleClick = () => {
    if (mediaId) {
      navigate(`/media/${targetType}/${mediaId}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`group flex items-center gap-4 p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/40 hover:bg-[#151932] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 ${className}`}
    >
      <div className="w-16 h-22 rounded-xl overflow-hidden bg-[#0B0D20] border border-[#1E2442] shrink-0">
        {media.posterUrl ? (
          <img
            src={media.posterUrl}
            alt={media.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-[#64748B]">
            <Film className="w-6 h-6 text-[#8B5CF6]/60" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <CategoryBadge type={media.type} size="sm" />
          {media.rating ? <RatingBadge score={media.rating} size="sm" /> : null}
        </div>

        <h4 className="text-sm sm:text-base font-bold text-[#F8FAFC] group-hover:text-[#A78BFA] transition-colors truncate">
          {media.title}
        </h4>

        <div className="flex items-center gap-2.5 text-xs text-[#94A3B8]">
          {media.year && <span className="font-mono">{media.year}</span>}
          {media.userStatus && <StatusBadge status={media.userStatus} size="sm" />}
        </div>
      </div>

      {actionText && onAction && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction(media);
          }}
          className="px-4 py-2 rounded-xl bg-[#151932] hover:bg-[#7C3AED] text-xs sm:text-sm font-semibold text-[#A78BFA] hover:text-white border border-[#1E2442] hover:border-[#7C3AED] transition-all shrink-0"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
