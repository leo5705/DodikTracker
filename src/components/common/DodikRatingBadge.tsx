import React from 'react';
import { Star, Sparkles } from 'lucide-react';

export interface DodikRatingBadgeProps {
  score?: number | string | null;
  ratingCount?: number | null;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
  className?: string;
}

export const DodikRatingBadge: React.FC<DodikRatingBadgeProps> = ({
  score,
  ratingCount,
  size = 'sm',
  showCount = false,
  className = '',
}) => {
  // If count is explicitly 0 or score is missing, do not show
  if (ratingCount === 0 || score === undefined || score === null || score === '') return null;
  const numScore = typeof score === 'number' ? score : parseFloat(String(score));
  if (isNaN(numScore) || numScore <= 0) return null;

  // Format 1-10 score
  const normScore = numScore > 10 ? numScore / 10 : numScore;
  const formatted = normScore.toFixed(normScore % 1 === 0 ? 0 : 1);

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-1.5',
  }[size];

  return (
    <span
      className={`inline-flex items-center font-bold font-mono rounded-lg backdrop-blur-md shadow-sm bg-gradient-to-r from-purple-950/90 to-indigo-950/90 border border-purple-500/50 text-amber-300 ${sizeClasses} ${className}`}
      title={ratingCount ? `Dodik Tracker: ${formatted}/10 (${ratingCount} оценок)` : `Dodik Tracker: ${formatted}/10`}
    >
      <Star className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} fill-amber-400 text-amber-400 shrink-0`} />
      <span>{formatted}</span>
      {showCount && ratingCount !== undefined && ratingCount !== null && ratingCount > 0 && (
        <span className="text-[10px] text-purple-300 font-normal opacity-80 border-l border-purple-500/40 pl-1.5">
          {ratingCount}
        </span>
      )}
    </span>
  );
};
