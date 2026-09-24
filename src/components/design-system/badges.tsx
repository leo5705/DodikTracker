import React from 'react';
import { Star, Film, Tv, Sparkles, BookOpen, Gamepad2, Book, Flame, Music2 } from 'lucide-react';

export interface StatusBadgeProps {
  status?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '', size = 'sm' }) => {
  if (!status) return null;

  const getStatusInfo = (s: string) => {
    switch (s.toUpperCase()) {
      case 'COMPLETED':
        return {
          label: 'Завершено',
          classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          dot: 'bg-emerald-400',
        };
      case 'WATCHING':
      case 'PLAYING':
      case 'READING':
        return {
          label: 'В процессе',
          classes: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
          dot: 'bg-violet-400',
        };
      case 'PLAN_TO_WATCH':
      case 'PLAN_TO_PLAY':
      case 'PLAN_TO_READ':
      case 'PLANNED':
        return {
          label: 'В планах',
          classes: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
          dot: 'bg-indigo-400',
        };
      case 'DROPPED':
        return {
          label: 'Брошено',
          classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
          dot: 'bg-rose-400',
        };
      case 'ON_HOLD':
        return {
          label: 'На паузе',
          classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          dot: 'bg-amber-400',
        };
      default:
        return {
          label: status,
          classes: 'bg-[#151932] text-[#94A3B8] border-[#1E2442]',
          dot: 'bg-[#94A3B8]',
        };
    }
  };

  const info = getStatusInfo(status);
  const sizeClasses = size === 'sm' ? 'text-xs px-2.5 py-1 gap-1.5' : 'text-xs sm:text-sm px-3 py-1.5 gap-2 font-semibold';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-lg border backdrop-blur-md ${info.classes} ${sizeClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${info.dot}`} />
      <span className="truncate">{info.label}</span>
    </span>
  );
};

export interface RatingBadgeProps {
  score?: number | string | null;
  rating?: number | string | null;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  isUserRating?: boolean;
  className?: string;
}

export const RatingBadge: React.FC<RatingBadgeProps> = ({
  score,
  rating,
  size = 'sm',
  isUserRating = false,
  className = '',
}) => {
  const effectiveScore = score !== undefined ? score : rating;
  if (effectiveScore === undefined || effectiveScore === null || effectiveScore === '' || effectiveScore === 0) return null;
  const numScore = typeof effectiveScore === 'number' ? effectiveScore : parseFloat(String(effectiveScore));
  if (isNaN(numScore)) return null;

  const formatted = numScore.toFixed(numScore % 1 === 0 ? 0 : 1);

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1.5 rounded-lg',
    md: 'text-sm px-2.5 py-1 gap-2 rounded-xl',
    lg: 'text-base px-3.5 py-1.5 gap-2 rounded-xl',
  }[size];

  const starSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-4.5 h-4.5',
  }[size];

  return (
    <span
      className={`inline-flex items-center font-bold font-mono rounded-lg backdrop-blur-md shadow-sm ${
        isUserRating
          ? 'bg-violet-500/20 text-violet-200 border border-violet-400/40'
          : 'bg-[#0B0D20]/85 text-amber-300 border border-amber-400/30'
      } ${sizeClasses} ${className}`}
    >
      <Star className={`${starSizes} fill-amber-400 text-amber-400 shrink-0`} />
      <span>{formatted}</span>
    </span>
  );
};

export interface CategoryBadgeProps {
  type?: string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export const getCategoryMeta = (type?: string) => {
  const t = (type || '').toUpperCase();
  switch (t) {
    case 'MOVIE':
      return { label: 'Фильм', icon: Film, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20 text-purple-300' };
    case 'TV':
      return { label: 'Сериал', icon: Tv, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' };
    case 'ANIME':
      return { label: 'Аниме', icon: Sparkles, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-300' };
    case 'MANGA':
      return { label: 'Манга', icon: BookOpen, color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/20 text-pink-300' };
    case 'GAME':
      return { label: 'Игра', icon: Gamepad2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' };
    case 'BOOK':
      return { label: 'Книга', icon: Book, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20 text-amber-300' };
    case 'COMIC':
      return { label: 'Комикс', icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20 text-orange-300' };
    case 'MUSIC':
      return { label: 'Музыка', icon: Music2, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300' };
    default:
      return { label: type || 'Медиа', icon: Film, color: 'text-[#94A3B8]', bg: 'bg-[#151932] border-[#1E2442] text-[#94A3B8]' };
  }
};

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  type,
  size = 'sm',
  showIcon = true,
  className = '',
}) => {
  const meta = getCategoryMeta(type);
  const Icon = meta.icon;
  const sizeClasses = size === 'sm' ? 'text-xs px-2.5 py-1 gap-1.5' : 'text-sm px-3 py-1.5 gap-2 font-semibold';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-lg border backdrop-blur-md ${meta.bg} ${sizeClasses} ${className}`}
    >
      {showIcon && <Icon className={`${iconSize} shrink-0 ${meta.color}`} />}
      <span className="truncate">{meta.label}</span>
    </span>
  );
};
