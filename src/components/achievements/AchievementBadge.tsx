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
  Clock,
  CircleDot,
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
  {
    label: string;
    bg: string;
    text: string;
    border: string;
    glow: string;
    badgeBg: string;
    iconColor: string;
  }
> = {
  COMMON: {
    label: 'Обычное',
    bg: 'bg-[#0B0D20]',
    text: 'text-[#94A3B8]',
    border: 'border-[#1E2442]',
    glow: 'hover:border-[#8B5CF6]/40 hover:shadow-lg hover:shadow-[#7C3AED]/10',
    badgeBg: 'bg-[#151932] text-[#94A3B8] border-[#1E2442]',
    iconColor: 'text-[#94A3B8]',
  },
  RARE: {
    label: 'Редкое',
    bg: 'bg-[#0B0D20]',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
    glow: 'hover:border-sky-400/60 shadow-md shadow-sky-950/40 hover:shadow-sky-500/20',
    badgeBg: 'bg-sky-950/60 text-sky-300 border-sky-500/40',
    iconColor: 'text-sky-400',
  },
  EPIC: {
    label: 'Эпическое',
    bg: 'bg-[#0D0B24]',
    text: 'text-purple-300',
    border: 'border-purple-500/40',
    glow: 'hover:border-purple-400/70 shadow-lg shadow-[#7C3AED]/20 hover:shadow-purple-500/30',
    badgeBg: 'bg-purple-950/60 text-purple-300 border-purple-500/40',
    iconColor: 'text-[#A78BFA]',
  },
  LEGENDARY: {
    label: 'Легендарное',
    bg: 'bg-[#181109]',
    text: 'text-amber-300',
    border: 'border-amber-500/40',
    glow: 'hover:border-amber-400/70 shadow-lg shadow-amber-950/50 hover:shadow-amber-500/25',
    badgeBg: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
    iconColor: 'text-amber-400',
  },
  MYTHIC: {
    label: 'Мифическое',
    bg: 'bg-[#180918]',
    text: 'text-rose-300',
    border: 'border-rose-500/40',
    glow: 'hover:border-rose-400/80 shadow-lg shadow-rose-950/60 hover:shadow-rose-500/30',
    badgeBg: 'bg-rose-950/60 text-rose-300 border-rose-500/40',
    iconColor: 'text-rose-400',
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

  // Has progress in progress
  const hasProgress = progress && progress.target > 1;
  const progressPct = progress ? Math.min(100, Math.max(0, progress.percentage)) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`group relative flex flex-col justify-between p-4 rounded-3xl border transition-all duration-200 cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-[#8B5CF6] ${
        isUnlocked
          ? `${rarityInfo.bg} ${rarityInfo.border} ${rarityInfo.glow} shadow-xl shadow-[#7C3AED]/10 hover:-translate-y-0.5`
          : 'bg-[#0B0D20]/75 border-[#1E2442] hover:border-[#8B5CF6]/40 hover:bg-[#11152A] opacity-85 hover:opacity-100'
      }`}
    >
      {/* Top row: Icon + Rarity Badge + PTS Reward */}
      <div className="flex items-start justify-between gap-3">
        {/* Icon Container with Rarity glow */}
        <div className="relative">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-300 group-hover:scale-105 ${
              isUnlocked
                ? `${rarityInfo.badgeBg} shadow-lg shadow-[#7C3AED]/15 ring-1 ring-[#8B5CF6]/30`
                : 'bg-[#151932] text-[#64748B] border-[#1E2442]'
            }`}
          >
            <IconComponent
              className={`w-6 h-6 ${isUnlocked ? rarityInfo.iconColor : 'text-[#64748B]'}`}
            />
          </div>

          {/* Unlocked check badge on icon corner */}
          {isUnlocked && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center border-2 border-[#0B0D20] shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          )}
        </div>

        {/* Right side: Rarity badge & PTS reward */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-lg border uppercase tracking-wider ${
                isUnlocked ? rarityInfo.badgeBg : 'bg-[#151932] text-[#64748B] border-[#1E2442]'
              }`}
            >
              {rarityInfo.label}
            </span>
            <span
              className={`text-[11px] font-mono font-black px-2 py-0.5 rounded-lg border ${
                isUnlocked
                  ? 'bg-[#8B5CF6]/20 text-[#A78BFA] border-[#8B5CF6]/40 shadow-sm'
                  : 'bg-[#151932] text-[#94A3B8] border-[#1E2442]'
              }`}
            >
              +{points} PTS
            </span>
          </div>

          {/* Status Label */}
          {isUnlocked ? (
            <span className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1">
              Получено
            </span>
          ) : hasProgress && progress.current > 0 ? (
            <span className="text-[10px] font-mono text-purple-300 font-bold flex items-center gap-1">
              <CircleDot className="w-3 h-3 text-[#A78BFA] animate-pulse" />
              В процессе
            </span>
          ) : (
            <span className="text-[10px] font-mono text-[#64748B] flex items-center gap-1">
              <Lock className="w-3 h-3" />
              {isSecret ? 'Секрет' : 'Закрыто'}
            </span>
          )}
        </div>
      </div>

      {/* Middle: Title & Description */}
      <div className="my-3 space-y-1 flex-1 min-w-0">
        <h4
          className={`text-sm font-bold tracking-tight line-clamp-1 group-hover:text-[#A78BFA] transition-colors ${
            isUnlocked ? 'text-white' : 'text-[#CBD5E1]'
          }`}
        >
          {isSecret && !isUnlocked ? 'Секретное достижение' : title}
        </h4>
        <p className="text-xs text-[#94A3B8] line-clamp-2 leading-relaxed">
          {isSecret && !isUnlocked
            ? 'Условия получения скрыты. Исследуйте трекер, чтобы открыть это достижение!'
            : description}
        </p>
      </div>

      {/* Bottom: Progress Bar or Unlock Date */}
      <div className="pt-3 border-t border-[#1E2442] flex items-center justify-between text-[11px] font-mono">
        {isUnlocked ? (
          <div className="flex items-center justify-between w-full text-[#94A3B8]">
            <span className="flex items-center gap-1.5 text-[10px]">
              <Clock className="w-3 h-3 text-[#64748B]" />
              {unlockedAt
                ? new Date(unlockedAt).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Разблокировано'}
            </span>
            <span className="text-emerald-400 font-bold text-[10px]">100%</span>
          </div>
        ) : hasProgress ? (
          <div className="w-full space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-[#94A3B8]">
              <span>Прогресс</span>
              <span className="text-[#A78BFA] font-bold">
                {progress.current} / {progress.target} ({progressPct}%)
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#151932] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#7C3AED] to-[#6366F1] transition-all duration-300 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full text-[#64748B] text-[10px]">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-[#64748B]" />
              Не начато
            </span>
            <span>0%</span>
          </div>
        )}
      </div>
    </div>
  );
};
