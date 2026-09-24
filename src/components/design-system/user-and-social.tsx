import React from 'react';
import { User, MessageSquare, TrendingUp, Sparkles, ExternalLink, Trophy, Award, UserPlus, BookOpen, Film, Gamepad2, Tv } from 'lucide-react';
import { PresenceIndicator } from '../ui/PresenceIndicator.tsx';
import { CategoryBadge } from './badges.tsx';
import { formatActivity, RawActivityItem } from '../../utils/activityFormatter.ts';
import { resolveAchievementIcon } from '../../utils/iconResolver.tsx';

export interface AvatarProps {
  src?: string | null;
  username?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  presence?: any;
  className?: string;
  onClick?: () => void;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  username = 'User',
  size = 'md',
  presence,
  className = '',
  onClick,
}) => {
  const sizeMap = {
    xs: 'w-7 h-7 text-[11px]',
    sm: 'w-9 h-9 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-18 h-18 text-xl',
  }[size];

  const firstLetter = (username || 'U').charAt(0).toUpperCase();

  return (
    <div
      onClick={onClick}
      className={`relative inline-block shrink-0 ${onClick ? 'cursor-pointer hover:opacity-90' : ''} ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={username}
          referrerPolicy="no-referrer"
          className={`${sizeMap} rounded-xl object-cover border border-[#1E2442] bg-[#11152A]`}
        />
      ) : (
        <div
          className={`${sizeMap} rounded-xl bg-gradient-to-tr from-[#7C3AED]/50 to-[#6366F1]/50 border border-[#8B5CF6]/30 flex items-center justify-center font-bold text-white shadow-sm`}
        >
          {firstLetter}
        </div>
      )}

      {presence && (
        <PresenceIndicator
          presence={presence}
          className="absolute -bottom-0.5 -right-0.5"
          size={size === 'xs' || size === 'sm' ? 'sm' : 'md'}
        />
      )}
    </div>
  );
};

export interface UserCardProps {
  user: {
    id: number;
    username: string;
    avatar?: string | null;
    bio?: string | null;
    role?: string;
    customTitle?: string | null;
    stats?: {
      completed?: number;
      favorites?: number;
    };
  };
  presence?: any;
  onNavigate?: (username: string) => void;
  onMessage?: (user: any) => void;
  actionButton?: React.ReactNode;
  className?: string;
}

export const UserCard: React.FC<UserCardProps> = ({
  user,
  presence,
  onNavigate,
  onMessage,
  actionButton,
  className = '',
}) => {
  const handleClick = () => {
    if (onNavigate) onNavigate(user.username);
  };

  return (
    <div
      className={`flex items-center justify-between p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0 cursor-pointer flex-1" onClick={handleClick}>
        <Avatar
          src={user.avatar}
          username={user.username}
          presence={presence}
          size="md"
        />

        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-[#F8FAFC] truncate hover:text-[#A78BFA] transition-colors">
              @{user.username}
            </h4>
            {user.role && user.role !== 'USER' && (
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-violet-500/20 text-[#C4B5FD] border border-violet-500/30">
                {user.role}
              </span>
            )}
          </div>

          <p className="text-xs text-[#94A3B8] truncate max-w-xs">
            {user.customTitle || user.bio || 'Участник Dodik Tracker'}
          </p>

          {user.stats && (
            <div className="flex items-center gap-2 text-[11px] text-[#64748B] font-mono pt-0.5">
              <span>{user.stats.completed || 0} завершено</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-3">
        {onMessage && (
          <button
            type="button"
            onClick={() => onMessage(user)}
            className="p-2 rounded-xl bg-[#151932] hover:bg-[#191D38] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2442] hover:border-[#2E3660] transition-colors"
            title="Написать сообщение"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        )}
        {actionButton}
      </div>
    </div>
  );
};

export interface ActivityCardProps {
  activity: RawActivityItem | any;
  onUserClick?: (username: string) => void;
  onMediaClick?: (type: string, id: number) => void;
  onListClick?: (id: number) => void;
  onAchievementClick?: () => void;
  onMessageClick?: (user: any) => void;
  className?: string;
}

export const ActivityCard: React.FC<ActivityCardProps> = ({
  activity,
  onUserClick,
  onMediaClick,
  onListClick,
  onAchievementClick,
  onMessageClick,
  className = '',
}) => {
  const item = formatActivity(activity);
  const user = item.actor;
  const media = item.media;
  const list = item.list || item.tierList;
  const AchIcon = item.achievement ? resolveAchievementIcon(item.achievement.icon) : Trophy;

  return (
    <div
      className={`p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] hover:border-[#1E2442]/80 flex items-start gap-3.5 transition-all ${className}`}
    >
      {/* Visual Avatar or Poster or Achievement Icon */}
      {item.achievement ? (
        <div
          onClick={() => onAchievementClick && onAchievementClick()}
          className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 cursor-pointer shadow-md"
        >
          <AchIcon className="w-6 h-6 fill-amber-400/20" />
        </div>
      ) : item.friend ? (
        <div
          onClick={() => onUserClick && onUserClick(item.friend!.username)}
          className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400 shrink-0 cursor-pointer"
        >
          <UserPlus className="w-5 h-5" />
        </div>
      ) : media?.posterUrl ? (
        <div
          onClick={() =>
            media.id &&
            onMediaClick &&
            onMediaClick(media.type || 'MOVIE', media.id)
          }
          className="w-12 h-16 rounded-xl overflow-hidden bg-[#080A18] border border-[#1E2442] shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
        >
          <img
            src={media.posterUrl}
            alt={media.title || 'Media'}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
      ) : list ? (
        <div
          onClick={() => onListClick && onListClick(list.id)}
          className="w-12 h-12 rounded-xl bg-cyan-950/60 border border-cyan-800/40 flex items-center justify-center text-cyan-400 shrink-0 cursor-pointer"
        >
          <Sparkles className="w-5 h-5" />
        </div>
      ) : (
        <div className="w-12 h-12 rounded-xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[#64748B] shrink-0">
          <Sparkles className="w-5 h-5 text-[#8B5CF6]/60" />
        </div>
      )}

      {/* Activity Details */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span
              onClick={() => onUserClick && onUserClick(user.username)}
              className="text-xs font-bold text-[#A78BFA] hover:text-white cursor-pointer truncate transition-colors"
            >
              @{user.username}
            </span>
            <span className="text-xs text-[#94A3B8]">{item.actionText}</span>
          </div>

          <span
            title={item.fullDateTime}
            className="text-[10px] text-[#64748B] font-mono shrink-0 cursor-default"
          >
            {item.relativeTime}
          </span>
        </div>

        {/* Achievement Content */}
        {item.achievement && (
          <div
            onClick={() => onAchievementClick && onAchievementClick()}
            className="cursor-pointer group/ach"
          >
            <h4 className="text-xs sm:text-sm font-bold text-amber-300 group-hover/ach:text-amber-200 truncate transition-colors">
              🏆 {item.achievement.title}
            </h4>
            {item.achievement.description && (
              <p className="text-xs text-[#94A3B8] line-clamp-2 mt-0.5">
                {item.achievement.description}
              </p>
            )}
          </div>
        )}

        {/* Friend Content */}
        {item.friend && (
          <div
            onClick={() => onUserClick && onUserClick(item.friend!.username)}
            className="text-xs text-[#F8FAFC] cursor-pointer hover:underline"
          >
            Подружились с <strong className="text-emerald-400">@{item.friend.username}</strong>
          </div>
        )}

        {/* Media Content */}
        {media && (
          <div>
            <div className="flex items-center gap-2">
              <h4
                onClick={() =>
                  media.id &&
                  onMediaClick &&
                  onMediaClick(media.type || 'MOVIE', media.id)
                }
                className="text-xs sm:text-sm font-bold text-[#F8FAFC] hover:text-[#A78BFA] cursor-pointer truncate transition-colors"
              >
                {media.title || 'Медиа'}
              </h4>
              {media.type && (
                <CategoryBadge type={media.type} size="sm" showIcon={false} />
              )}
            </div>

            {item.userRating ? (
              <div className="text-[11px] text-amber-300 font-mono font-semibold flex items-center gap-1">
                ★ {item.userRating} / 100
              </div>
            ) : media.rating ? (
              <div className="text-[11px] text-amber-300 font-mono flex items-center gap-1">
                ★ {media.rating}
              </div>
            ) : null}
          </div>
        )}

        {/* List Content */}
        {list && !media && !item.achievement && !item.friend && (
          <div
            onClick={() => onListClick && onListClick(list.id)}
            className="cursor-pointer"
          >
            <h4 className="text-xs sm:text-sm font-bold text-[#F8FAFC] hover:text-[#A78BFA] truncate">
              «{list.title}»
            </h4>
          </div>
        )}

        {/* Review snippet */}
        {item.reviewSnippet && (
          <p className="text-xs text-[#94A3B8] italic line-clamp-2 bg-[#0B0D20] p-2 rounded-xl border border-[#1E2442]/60 mt-1">
            «{item.reviewSnippet}»
          </p>
        )}

        {/* Fallback details */}
        {!item.achievement && !item.friend && !media && !list && !item.reviewSnippet && item.detailsText && (
          <p className="text-xs text-[#94A3B8] bg-[#0B0D20] p-2 rounded-xl border border-[#1E2442]/60 mt-1">
            {item.detailsText}
          </p>
        )}
      </div>

      {onMessageClick && user.id && (
        <button
          type="button"
          onClick={() =>
            onMessageClick({
              id: user.id,
              username: user.username,
              avatar: user.avatar,
            })
          }
          className="p-1.5 rounded-lg text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#151932] transition-colors shrink-0"
          title="Ответить лично"
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export interface ActivityTimelineItemProps {
  activity: RawActivityItem | any;
  onUserClick?: (username: string) => void;
  onMediaClick?: (type: string, id: number) => void;
  onListClick?: (id: number) => void;
  onAchievementClick?: () => void;
  isLast?: boolean;
  className?: string;
}

export const ActivityTimelineItem: React.FC<ActivityTimelineItemProps> = ({
  activity,
  onUserClick,
  onMediaClick,
  onListClick,
  onAchievementClick,
  isLast = false,
  className = '',
}) => {
  const item = formatActivity(activity);
  const user = item.actor;
  const media = item.media;
  const list = item.list || item.tierList;
  const AchIcon = item.achievement ? resolveAchievementIcon(item.achievement.icon) : Trophy;

  return (
    <div className={`relative flex items-start gap-3.5 py-3 group ${className}`}>
      {/* Vertical Timeline Track */}
      {!isLast && (
        <span
          className="absolute left-4 top-10 bottom-0 w-[1px] bg-[#1E2442] group-hover:bg-[#8B5CF6]/30 transition-colors pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* User Avatar with Presence */}
      <div
        onClick={() => onUserClick && onUserClick(user.username)}
        className="relative shrink-0 cursor-pointer"
      >
        <Avatar src={user.avatar} username={user.username} size="sm" />
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0B0D20] ${item.dotColor}`}
        />
      </div>

      {/* Activity Main Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Header Row: Username + Action + Timestamp */}
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span
              onClick={() => onUserClick && onUserClick(user.username)}
              className="font-bold text-[#F8FAFC] hover:text-[#A78BFA] transition-colors cursor-pointer truncate"
            >
              @{user.username}
            </span>
            <span className="text-[#94A3B8] font-normal">{item.actionText}</span>
          </div>

          <span
            title={item.fullDateTime}
            className="text-[10px] text-[#64748B] font-mono shrink-0 cursor-default"
          >
            {item.relativeTime}
          </span>
        </div>

        {/* Achievement Card */}
        {item.achievement && (
          <div
            onClick={() => onAchievementClick && onAchievementClick()}
            className="p-3 rounded-xl bg-[#151932]/90 border border-amber-500/40 hover:border-amber-500/70 transition-all cursor-pointer flex items-center gap-3 shadow-md group/ach"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <AchIcon className="w-5 h-5 fill-amber-400/20" />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-xs font-bold text-amber-300 group-hover/ach:text-amber-200 transition-colors truncate">
                  🏆 {item.achievement.title}
                </h4>
                {item.achievement.points && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    +{item.achievement.points} XP
                  </span>
                )}
                {item.achievement.rarity && (
                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-[#0B0D20] text-amber-400/80 border border-amber-500/20">
                    {item.achievement.rarity}
                  </span>
                )}
              </div>
              {item.achievement.description && (
                <p className="text-[11px] text-[#CBD5E1] line-clamp-2">
                  {item.achievement.description}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Friend Card */}
        {item.friend && (
          <div
            onClick={() => onUserClick && onUserClick(item.friend!.username)}
            className="p-2.5 rounded-xl bg-[#11152A] border border-[#1E2442] hover:border-emerald-500/40 transition-all cursor-pointer flex items-center gap-2.5"
          >
            <Avatar src={item.friend.avatar} username={item.friend.username} size="xs" />
            <span className="text-xs text-[#F8FAFC]">
              Подружились с <strong className="text-emerald-400">@{item.friend.username}</strong>
            </span>
          </div>
        )}

        {/* Media Thumbnail & Title Row */}
        {media && (
          <div
            onClick={() => onMediaClick && onMediaClick(media.type || 'MOVIE', media.id)}
            className="flex items-center gap-3 p-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-all cursor-pointer group/media"
          >
            <div className="w-10 h-14 rounded-lg overflow-hidden bg-[#080A18] border border-[#1E2442] shrink-0">
              {media.posterUrl ? (
                <img
                  src={media.posterUrl}
                  alt={media.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover/media:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#64748B]">
                  <Sparkles className="w-4 h-4 text-[#8B5CF6]/40" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-0.5">
              <h4 className="text-xs font-bold text-[#F8FAFC] group-hover/media:text-[#A78BFA] transition-colors truncate">
                {media.title}
              </h4>
              <div className="flex items-center gap-2 text-[10px] text-[#94A3B8] font-mono">
                {media.type && <span className="uppercase">{media.type}</span>}
                {media.year && <span>· {media.year}</span>}
                {item.userRating ? (
                  <span className="text-amber-400 font-bold">★ {item.userRating}/100</span>
                ) : media.rating ? (
                  <span className="text-amber-400">★ {media.rating}</span>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* List / TierList Attachment */}
        {list && !media && !item.achievement && !item.friend && (
          <div
            onClick={() => onListClick && onListClick(list.id)}
            className="flex items-center gap-2.5 p-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-all cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[#A78BFA] shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-[#F8FAFC] truncate hover:text-[#A78BFA] transition-colors">
                «{list.title}»
              </h4>
              {list.category && (
                <span className="text-[10px] text-[#94A3B8] uppercase font-mono">{list.category}</span>
              )}
            </div>
          </div>
        )}

        {/* Review Snippet Quote */}
        {item.reviewSnippet && (
          <p className="text-[11px] text-[#CBD5E1] italic bg-[#0B0D20] p-2 rounded-lg border border-[#1E2442]/60 line-clamp-2 leading-relaxed">
            «{item.reviewSnippet}»
          </p>
        )}

        {/* Fallback Details */}
        {!media && !item.achievement && !item.friend && !list && !item.reviewSnippet && item.detailsText && (
          <p className="text-[11px] text-[#94A3B8] bg-[#0B0D20] p-2 rounded-lg border border-[#1E2442]/60 leading-relaxed">
            {item.detailsText}
          </p>
        )}
      </div>
    </div>
  );
};

export interface NewsCardProps {
  image?: string | null;
  title: string;
  excerpt?: string | null;
  category?: string | null;
  date?: string | Date | null;
  slug?: string | number;
  authorUsername?: string | null;
  viewsCount?: number;
  isPinned?: boolean;
  isFeatured?: boolean;
  onClick?: () => void;
  className?: string;
}

export const NewsCard: React.FC<NewsCardProps> = ({
  image,
  title,
  excerpt,
  category = 'Новости',
  date,
  authorUsername,
  isPinned = false,
  isFeatured = false,
  onClick,
  className = '',
}) => {
  const formattedDate = date
    ? new Date(date).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
      })
    : '';

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 shadow-lg cursor-pointer ${className}`}
    >
      <div>
        {/* News Cover Image */}
        <div className="relative w-full h-32 sm:h-36 bg-[#11152A] overflow-hidden">
          {image ? (
            <img
              src={image}
              alt={title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#64748B] bg-gradient-to-br from-[#151932] to-[#0B0D20]">
              <Sparkles className="w-6 h-6 text-[#8B5CF6]/40 mb-1" />
              <span className="text-[10px] font-medium text-[#94A3B8]">Dodik News</span>
            </div>
          )}

          {/* Badges Overlay */}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
            {isPinned && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/90 text-black shadow-sm flex items-center gap-1">
                Закреплено
              </span>
            )}
            {isFeatured && !isPinned && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#8B5CF6]/90 text-white shadow-sm flex items-center gap-1">
                Главное
              </span>
            )}
            {category && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#0B0D20]/80 backdrop-blur-md text-[#A78BFA] border border-[#1E2442]">
                {category}
              </span>
            )}
          </div>
        </div>

        {/* News Content */}
        <div className="p-3.5 sm:p-4 space-y-1.5">
          <h3 className="font-bold text-xs sm:text-sm text-[#F8FAFC] group-hover:text-[#A78BFA] transition-colors line-clamp-2 leading-snug">
            {title}
          </h3>

          {excerpt && (
            <p className="text-[11px] sm:text-xs text-[#94A3B8] line-clamp-2 leading-relaxed">
              {excerpt}
            </p>
          )}
        </div>
      </div>

      {/* Footer Row */}
      <div className="px-3.5 sm:px-4 py-2.5 border-t border-[#1E2442] flex items-center justify-between text-[10px] text-[#64748B] bg-[#080A18]/40 font-mono">
        <span>@{authorUsername || 'admin'}</span>
        {formattedDate && <span>{formattedDate}</span>}
      </div>
    </div>
  );
};

export const ActivityItemSkeleton: React.FC = () => (
  <div className="flex items-start gap-3 py-3 animate-pulse">
    <div className="w-8 h-8 rounded-xl bg-[#151932] shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-3 bg-[#151932] rounded w-2/5" />
      <div className="h-12 bg-[#11152A] rounded-xl w-full" />
    </div>
  </div>
);

export const NewsCardSkeleton: React.FC = () => (
  <div className="rounded-2xl bg-[#0B0D20] border border-[#1E2442] animate-pulse overflow-hidden space-y-3">
    <div className="w-full h-32 bg-[#151932]" />
    <div className="p-4 space-y-2">
      <div className="h-4 bg-[#151932] rounded w-3/4" />
      <div className="h-3 bg-[#151932] rounded w-full" />
      <div className="h-3 bg-[#151932] rounded w-1/2" />
    </div>
  </div>
);

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: string;
  subtitle?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  trend,
  subtitle,
  className = '',
}) => {
  return (
    <div
      className={`p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-2 hover:border-[#8B5CF6]/30 transition-all ${className}`}
    >
      <div className="flex items-center justify-between text-xs text-[#94A3B8]">
        <span className="font-medium truncate">{label}</span>
        {icon && <span className="text-[#8B5CF6] shrink-0">{icon}</span>}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-black text-[#F8FAFC] font-mono tabular-nums tracking-tight">
          {value}
        </span>
        {trend && (
          <span className="text-xs font-mono text-emerald-400 font-semibold flex items-center gap-0.5">
            <TrendingUp className="w-3 h-3" />
            {trend}
          </span>
        )}
      </div>

      {subtitle && <p className="text-[11px] text-[#64748B]">{subtitle}</p>}
    </div>
  );
};
