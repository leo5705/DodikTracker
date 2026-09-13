import React from 'react';
import {
  Trophy,
  Sparkles,
  Shield,
  Film,
  Tv,
  Gamepad2,
  Book,
  BookOpen,
  Flame,
  Star,
  Award,
  Heart,
  Users,
  ListOrdered,
  Layers,
  Lock,
  Crown,
  Zap,
  Compass,
  CheckCircle2,
  Bookmark,
  CalendarDays,
  Medal,
} from 'lucide-react';

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Trophy,
  Sparkles,
  Shield,
  Film,
  Tv,
  Gamepad2,
  Book,
  BookOpen,
  Flame,
  Star,
  Award,
  Heart,
  Users,
  ListOrdered,
  Layers,
  Lock,
  Crown,
  Zap,
  Compass,
  CheckCircle2,
  Bookmark,
  CalendarDays,
  Medal,
};

export interface AchievementItemProps {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC' | string;
  status: string;
  badgeStyle: string;
  points: number;
  isUnlocked: boolean;
  unlockedAt?: string | null;
  isSecret?: boolean;
  progress?: {
    current: number;
    target: number;
    percentage: number;
  };
  grantType?: string;
  grantedByAdminId?: number;
  grantReason?: string;
  onClick?: () => void;
}

export const RARITY_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; glow: string; badgeBg: string }
> = {
  COMMON: {
    label: 'Обычное',
    bg: 'bg-[#14131A]',
    text: 'text-zinc-300',
    border: 'border-zinc-800',
    glow: 'group-hover:border-zinc-700',
    badgeBg: 'bg-zinc-800/80 text-zinc-300 border-zinc-700',
  },
  RARE: {
    label: 'Редкое',
    bg: 'bg-[#0e1626]',
    text: 'text-sky-300',
    border: 'border-sky-800/40',
    glow: 'group-hover:border-sky-500/60 shadow-sky-950/30',
    badgeBg: 'bg-sky-950/80 text-sky-300 border-sky-700/50',
  },
  EPIC: {
    label: 'Эпическое',
    bg: 'bg-[#171026]',
    text: 'text-purple-300',
    border: 'border-purple-800/50',
    glow: 'group-hover:border-purple-500/70 shadow-purple-950/40',
    badgeBg: 'bg-purple-950/80 text-purple-300 border-purple-700/60',
  },
  LEGENDARY: {
    label: 'Легендарное',
    bg: 'bg-[#221808]',
    text: 'text-amber-300',
    border: 'border-amber-700/50',
    glow: 'group-hover:border-amber-500/80 shadow-amber-950/50',
    badgeBg: 'bg-amber-950/90 text-amber-300 border-amber-600/60',
  },
  MYTHIC: {
    label: 'Мифическое',
    bg: 'bg-[#240c1d]',
    text: 'text-rose-300',
    border: 'border-rose-700/60',
    glow: 'group-hover:border-rose-500/90 shadow-rose-950/60',
    badgeBg: 'bg-rose-950/90 text-rose-300 border-rose-600/70',
  },
};

export const AchievementBadge: React.FC<AchievementItemProps> = ({
  title,
  description,
  icon,
  rarity,
  points,
  isUnlocked,
  unlockedAt,
  isSecret,
  progress,
  onClick,
}) => {
  const IconComponent = isUnlocked || !isSecret ? ICON_MAP[icon] || Trophy : Lock;
  const rarityInfo = RARITY_CONFIG[rarity] || RARITY_CONFIG.COMMON;

  return (
    <div
      id={`achievement-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
      onClick={onClick}
      className={`group relative flex flex-col justify-between p-4 rounded-2xl border transition-all duration-200 cursor-pointer select-none ${
        isUnlocked
          ? `${rarityInfo.bg} ${rarityInfo.border} ${rarityInfo.glow} shadow-md`
          : 'bg-[#111015] border-[#252233]/70 opacity-60 hover:opacity-80 hover:border-[#3A344E]'
      }`}
    >
      {/* Top Header: Icon + Rarity & Points */}
      <div className="flex items-start justify-between gap-3">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-transform duration-200 group-hover:scale-105 ${
            isUnlocked
              ? `${rarityInfo.badgeBg} shadow-inner`
              : 'bg-[#1A1822] text-[#656075] border-[#2B273C]'
          }`}
        >
          <IconComponent className={`w-6 h-6 ${isUnlocked ? rarityInfo.text : 'text-zinc-500'}`} />
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${rarityInfo.badgeBg}`}
            >
              {rarityInfo.label}
            </span>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-[#1C1A24] text-[#AC82FF] border border-[#2F2B42]">
              +{points}
            </span>
          </div>

          {isUnlocked && (
            <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Открыто</span>
            </div>
          )}
        </div>
      </div>

      {/* Title & Description */}
      <div className="mt-3 space-y-1 flex-1">
        <h4
          className={`text-sm font-bold tracking-tight line-clamp-1 ${
            isUnlocked ? 'text-[#F3F1F8]' : 'text-zinc-400'
          }`}
        >
          {isSecret && !isUnlocked ? 'Секретное достижение' : title}
        </h4>
        <p className="text-xs text-[#9A94AA] line-clamp-2 leading-relaxed">
          {isSecret && !isUnlocked
            ? 'Условия получения скрыты до момента открытия.'
            : description}
        </p>
      </div>

      {/* Progress or Unlock Date */}
      <div className="mt-4 pt-3 border-t border-[#252233]/50 flex items-center justify-between text-[11px]">
        {isUnlocked ? (
          <span className="text-[#656075] font-mono">
            {unlockedAt
              ? new Date(unlockedAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Получено'}
          </span>
        ) : progress && progress.target > 1 ? (
          <div className="w-full space-y-1">
            <div className="flex items-center justify-between text-[10px] text-[#9A94AA] font-mono">
              <span>Прогресс</span>
              <span>
                {progress.current} / {progress.target} ({progress.percentage}%)
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#1F1C2B] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#9B6BFF] to-[#AC82FF] transition-all duration-300"
                style={{ width: `${Math.min(100, progress.percentage)}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-zinc-500 flex items-center gap-1 font-mono">
            <Lock className="w-3 h-3" />
            Заблокировано
          </span>
        )}
      </div>
    </div>
  );
};
