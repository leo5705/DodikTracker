import React from 'react';
import { resolveAchievementIcon } from './iconResolver.tsx';

export interface RawActivityItem {
  id: number;
  type: string;
  details?: string | null;
  parsedDetails?: any;
  createdAt: string | Date;

  // New structured actor or legacy user
  actor?: {
    id?: number;
    username?: string;
    displayName?: string;
    avatar?: string | null;
    role?: string;
    bio?: string;
  } | null;
  user?: {
    id?: number;
    username?: string;
    displayName?: string;
    avatar?: string | null;
    role?: string;
    bio?: string;
  } | null;
  username?: string;
  avatar?: string | null;
  userId?: number;

  // Structured typed payloads
  achievement?: {
    id?: number;
    achievementId?: number;
    title?: string;
    description?: string;
    icon?: string;
    points?: number;
    rarity?: string;
  } | null;

  friend?: {
    id?: number;
    friendId?: number;
    username?: string;
    friendUsername?: string;
    displayName?: string;
    avatar?: string | null;
    friendAvatar?: string | null;
  } | null;

  review?: {
    id?: number;
    reviewId?: number;
    rating?: number | null;
    title?: string | null;
    snippet?: string;
    content?: string;
    containsSpoilers?: boolean;
  } | null;

  status?: string | null;
  rating?: number | null;
  reviewText?: string | null;

  // Media
  media?: {
    id: number;
    title: string;
    originalTitle?: string | null;
    posterUrl?: string | null;
    backdropUrl?: string | null;
    type?: string;
    year?: number | string | null;
    rating?: number | null;
    isAdult?: boolean;
    ageRating?: string | null;
  } | null;

  // Lists
  list?: {
    id: number;
    title: string;
    cover?: string | null;
    category?: string | null;
  } | null;

  tierList?: {
    id: number;
    title: string;
    category?: string | null;
  } | null;

  // Social
  likesCount?: number;
  userLiked?: boolean;
  commentsCount?: number;
  recentComments?: any[];
}

export interface FormattedActor {
  id: number;
  username: string;
  displayName: string;
  avatar: string | null;
  role?: string;
  bio?: string;
}

export interface FormattedAchievement {
  id: number;
  title: string;
  description: string;
  icon: string;
  points?: number;
  rarity?: string;
}

export interface FormattedFriend {
  id: number;
  username: string;
  displayName?: string;
  avatar: string | null;
}

export interface FormattedReview {
  id?: number;
  rating?: number | null;
  title?: string | null;
  snippet: string;
  containsSpoilers?: boolean;
}

export interface FormattedActivity {
  id: number;
  type: string;
  actor: FormattedActor;
  actionText: string;
  dotColor: string;
  createdAt: string;
  relativeTime: string;
  formattedDate: string;
  fullDateTime: string;

  // Primary plain-text summary (safe text without JSON/markdown/svg)
  detailsText: string;

  // Typed entities
  achievement?: FormattedAchievement;
  friend?: FormattedFriend;
  review?: FormattedReview;
  reviewSnippet?: string;
  userRating?: number | null;
  mediaStatus?: string | null;
  mediaStatusLabel?: string | null;

  // Media & Lists
  media?: RawActivityItem['media'];
  list?: RawActivityItem['list'];
  tierList?: RawActivityItem['tierList'];

  // Badge styling for feed display
  badgeLabel: string;
  badgeColor: string;
  badgeIconName: string;

  // Social metrics
  likesCount: number;
  userLiked: boolean;
  commentsCount: number;
  recentComments: any[];
}

/**
 * Removes presentation artifacts, markdown asterisks, raw JSON strings,
 * technical prefixes like 'svg{' or '<svg', and HTML markup.
 */
export function sanitizeActivityText(input?: string | null): string {
  if (!input || typeof input !== 'string') return '';

  let cleaned = input.trim();

  // Strip markdown formatting: bold, italic, code, etc.
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*(.*?)\*/g, '$1');
  cleaned = cleaned.replace(/__(.*?)__/g, '$1');
  cleaned = cleaned.replace(/_(.*?)_/g, '$1');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // Strip technical svg prefixes or html
  cleaned = cleaned.replace(/^(?:svg\s*\{|<svg[^>]*>|svg:)/i, '');
  cleaned = cleaned.replace(/<[^>]*>?/gm, '');

  // Detect and unwrap JSON if mistakenly passed as text
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.title === 'string') return sanitizeActivityText(parsed.title);
        if (typeof parsed.description === 'string') return sanitizeActivityText(parsed.description);
        if (typeof parsed.snippet === 'string') return sanitizeActivityText(parsed.snippet);
        if (typeof parsed.message === 'string') return sanitizeActivityText(parsed.message);
        if (typeof parsed.text === 'string') return sanitizeActivityText(parsed.text);
        return '';
      }
    } catch {
      // Regex recovery for truncated JSON
      const titleMatch = cleaned.match(/"title"\s*:\s*"([^"]+)"/);
      if (titleMatch) return sanitizeActivityText(titleMatch[1]);
      const descMatch = cleaned.match(/"description"\s*:\s*"([^"]+)"/);
      if (descMatch) return sanitizeActivityText(descMatch[1]);
      const snippetMatch = cleaned.match(/"snippet"\s*:\s*"([^"]+)"/);
      if (snippetMatch) return sanitizeActivityText(snippetMatch[1]);
      return '';
    }
  }

  // If after cleaning it still looks like raw JSON / SVG payload remnants, never expose raw code
  if (
    cleaned.includes('{"') ||
    cleaned.includes('":') ||
    cleaned.includes('svg{') ||
    cleaned.startsWith('{') ||
    cleaned.endsWith('}') ||
    cleaned.startsWith('<')
  ) {
    // Attempt regex recovery of any title/name
    const titleMatch = cleaned.match(/"title"\s*:\s*"([^"]+)"/);
    if (titleMatch) return sanitizeActivityText(titleMatch[1]);
    return '';
  }

  return cleaned.trim();
}

/**
 * Format relative time (e.g. "только что", "15 мин назад", "2 ч назад", "вчера", "15 сен")
 */
export function formatActivityRelativeTime(dateInput?: string | Date): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн назад`;

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * Format human-readable date (e.g. "15 сентября" or "15 сентября 2025")
 */
export function formatActivityDate(dateInput?: string | Date): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isCurrentYear = date.getFullYear() === now.getFullYear();

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(isCurrentYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Full localized date & time for tooltip (e.g. "15 сентября 2026 г., 14:30")
 */
export function formatActivityFullDateTime(dateInput?: string | Date): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Helper to safely extract JSON or object from activity details.
 * Supports complete JSON and handles truncated / markdown-wrapped JSON payloads safely.
 */
function extractPayload(raw: RawActivityItem): any {
  if (raw.parsedDetails && typeof raw.parsedDetails === 'object') {
    return raw.parsedDetails;
  }

  if (raw.details && typeof raw.details === 'string') {
    let str = raw.details.trim();

    // Strip markdown formatting like ** or __ or `
    str = str.replace(/\*\*/g, '').replace(/__/g, '').replace(/`/g, '').trim();

    // Strip technical svg prefixes
    if (str.startsWith('svg{') || str.startsWith('svg {"') || str.startsWith('svg:')) {
      const idx = str.indexOf('{');
      if (idx !== -1) str = str.substring(idx);
    }

    // 1. Try finding complete JSON between first { and last }
    const firstBrace = str.indexOf('{');
    const lastBrace = str.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(str.substring(firstBrace, lastBrace + 1));
      } catch {
        // Fall through to regex extraction below
      }
    }

    // 2. Resilient regex extraction for truncated / corrupted payloads:
    // e.g. **svg{"achievementId":24,"title":"Вместе веселее","description":"Добавлен первый друг в Dodik Tracker.","icon":"Users","r**
    const titleMatch = str.match(/"title"\s*:\s*"([^"]+)"/);
    const descMatch = str.match(/"description"\s*:\s*"([^"]+)"/);
    const iconMatch = str.match(/"icon"\s*:\s*"([^"]+)"/);
    const achIdMatch = str.match(/"(?:achievementId|id)"\s*:\s*(\d+)/);
    const rarityMatch = str.match(/"rarity"\s*:\s*"([^"]+)"/);
    const pointsMatch = str.match(/"points"\s*:\s*(\d+)/);

    const friendIdMatch = str.match(/"(?:friendId)"\s*:\s*(\d+)/);
    const friendUserMatch = str.match(/"(?:friendUsername|username)"\s*:\s*"([^"]+)"/);
    const friendAvatarMatch = str.match(/"(?:friendAvatar|avatar)"\s*:\s*"([^"]+)"/);

    const ratingMatch = str.match(/"rating"\s*:\s*(\d+(?:\.\d+)?)/);
    const statusMatch = str.match(/"status"\s*:\s*"([^"]+)"/);
    const snippetMatch = str.match(/"(?:snippet|content|text|review)"\s*:\s*"([^"]+)"/);

    const result: any = {};
    let foundAny = false;

    if (achIdMatch || titleMatch) {
      if (achIdMatch) result.achievementId = parseInt(achIdMatch[1], 10);
      if (titleMatch) result.title = titleMatch[1];
      if (descMatch) result.description = descMatch[1];
      if (iconMatch) result.icon = iconMatch[1];
      if (rarityMatch) result.rarity = rarityMatch[1];
      if (pointsMatch) result.points = parseInt(pointsMatch[1], 10);
      foundAny = true;
    }

    if (friendUserMatch || friendIdMatch) {
      if (friendIdMatch) result.friendId = parseInt(friendIdMatch[1], 10);
      if (friendUserMatch) result.friendUsername = friendUserMatch[1];
      if (friendAvatarMatch) result.friendAvatar = friendAvatarMatch[1];
      foundAny = true;
    }

    if (ratingMatch) {
      result.rating = parseFloat(ratingMatch[1]);
      foundAny = true;
    }
    if (statusMatch) {
      result.status = statusMatch[1];
      foundAny = true;
    }
    if (snippetMatch) {
      result.snippet = snippetMatch[1];
      foundAny = true;
    }

    if (foundAny) return result;
  }

  return null;
}

/**
 * Extracts clean actor from raw activity item.
 */
function extractActor(raw: RawActivityItem): FormattedActor {
  const actorObj = raw.actor || raw.user;
  let username = actorObj?.username || raw.username || 'Пользователь';
  let displayName = actorObj?.displayName || username || 'Пользователь';
  const avatar = actorObj?.avatar !== undefined ? actorObj.avatar : raw.avatar || null;
  const id = actorObj?.id || raw.userId || 0;
  const role = actorObj?.role;
  const bio = actorObj?.bio;

  // Clean username: strip markdown and leading @
  username = sanitizeActivityText(username).replace(/^@+/, '');
  displayName = sanitizeActivityText(displayName).replace(/^@+/, '');

  return {
    id,
    username: username || 'Пользователь',
    displayName: displayName || username || 'Пользователь',
    avatar,
    role,
    bio,
  };
}

/**
 * Formatter for ACHIEVEMENT_UNLOCKED
 */
function formatAchievementActivity(raw: RawActivityItem, payload: any): Partial<FormattedActivity> {
  const achObj = raw.achievement || payload;
  const achievement: FormattedAchievement = {
    id: achObj?.achievementId || achObj?.id || 0,
    title: sanitizeActivityText(achObj?.title || 'Новое достижение'),
    description: sanitizeActivityText(achObj?.description || ''),
    icon: (typeof achObj?.icon === 'string' && !achObj.icon.startsWith('{') && !achObj.icon.startsWith('<'))
      ? achObj.icon
      : 'Trophy',
    points: typeof achObj?.points === 'number' ? achObj.points : undefined,
    rarity: achObj?.rarity || 'COMMON',
  };

  return {
    actionText: 'получил(а) достижение',
    dotColor: 'bg-amber-400',
    achievement,
    badgeLabel: 'Достижение',
    badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    badgeIconName: 'Trophy',
    detailsText: `${achievement.title}${achievement.description ? ` — ${achievement.description}` : ''}`,
  };
}

/**
 * Formatter for FRIEND_ADDED
 */
function formatFriendActivity(raw: RawActivityItem, payload: any): Partial<FormattedActivity> {
  const friendObj = raw.friend || payload;
  const friend: FormattedFriend = {
    id: friendObj?.friendId || friendObj?.id || 0,
    username: sanitizeActivityText(friendObj?.friendUsername || friendObj?.username || 'друг'),
    displayName: friendObj?.displayName ? sanitizeActivityText(friendObj.displayName) : undefined,
    avatar: friendObj?.friendAvatar !== undefined ? friendObj.friendAvatar : friendObj?.avatar || null,
  };

  return {
    actionText: 'добавил(а) друга',
    dotColor: 'bg-emerald-400',
    friend,
    badgeLabel: 'Новый друг',
    badgeColor: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40',
    badgeIconName: 'UserPlus',
    detailsText: `Подружились с @${friend.username}`,
  };
}

/**
 * Formatter for REVIEW_ADDED
 */
function formatReviewActivity(raw: RawActivityItem, payload: any): Partial<FormattedActivity> {
  const revObj = raw.review || payload;
  let snippet = '';

  if (raw.reviewText) {
    snippet = sanitizeActivityText(raw.reviewText);
  } else if (revObj) {
    snippet = sanitizeActivityText(
      revObj.snippet || revObj.content || revObj.review || revObj.text || ''
    );
  } else if (typeof raw.details === 'string') {
    // Legacy review string in details: e.g. 'Отзыв: "..."'
    const match = raw.details.match(/["«]([^"»]+)["»]/);
    if (match) {
      snippet = sanitizeActivityText(match[1]);
    }
  }

  const review: FormattedReview = {
    id: revObj?.reviewId || revObj?.id,
    rating: revObj?.rating !== undefined ? Number(revObj.rating) : null,
    title: revObj?.title ? sanitizeActivityText(revObj.title) : null,
    snippet,
    containsSpoilers: !!revObj?.containsSpoilers,
  };

  return {
    actionText: 'написал(а) рецензию на',
    dotColor: 'bg-sky-400',
    review,
    reviewSnippet: snippet,
    userRating: review.rating,
    badgeLabel: 'Рецензия',
    badgeColor: 'bg-pink-950/60 text-pink-300 border-pink-800/40',
    badgeIconName: 'MessageSquare',
    detailsText: snippet ? `«${snippet}»` : 'Опубликована рецензия',
  };
}

/**
 * Formatter for MEDIA_RATED
 */
function formatRatingActivity(raw: RawActivityItem, payload: any): Partial<FormattedActivity> {
  let userRating: number | null = null;

  if (raw.rating !== undefined && raw.rating !== null) {
    userRating = Number(raw.rating);
  } else if (payload && payload.rating !== undefined) {
    userRating = Number(payload.rating);
  } else if (typeof raw.details === 'string') {
    const match = raw.details.match(/(\d+)(?:\s*★|\/100|\/10)/);
    if (match) {
      userRating = parseInt(match[1], 10);
    }
  } else if (raw.media?.rating) {
    userRating = raw.media.rating;
  }

  // Normalize legacy 1-10 scores to 0-100
  const normalizedRating = (userRating !== null && userRating <= 10 && userRating > 0)
    ? userRating * 10
    : userRating;

  return {
    actionText: 'оценил(а)',
    dotColor: 'bg-amber-400',
    userRating: normalizedRating,
    badgeLabel: 'Оценка',
    badgeColor: 'bg-amber-950/60 text-amber-300 border-amber-800/40',
    badgeIconName: 'Star',
    detailsText: normalizedRating !== null ? `Оценка: ${normalizedRating} / 100` : 'Оценил(а) контент',
  };
}

/**
 * Formatter for Media Status (ADDED, COMPLETED, STATUS_CHANGED, WATCHING, etc.)
 */
function formatMediaStatusActivity(
  type: string,
  raw: RawActivityItem,
  payload: any
): Partial<FormattedActivity> {
  let status = raw.status || payload?.status;
  if (!status && typeof raw.details === 'string' && !raw.details.startsWith('{')) {
    status = raw.details.trim();
  }

  const mediaType = raw.media?.type || 'MOVIE';
  let actionText = 'добавил(а) в библиотеку';
  let dotColor = 'bg-[#8B5CF6]';
  let badgeLabel = 'В библиотеке';
  let badgeColor = 'bg-purple-950/60 text-purple-300 border-purple-800/40';
  let badgeIconName = 'Bookmark';
  let mediaStatusLabel = 'Запланировано';

  if (type === 'MEDIA_COMPLETED' || status === 'COMPLETED') {
    if (mediaType === 'GAME') actionText = 'прошел(ла)';
    else if (mediaType === 'BOOK' || mediaType === 'MANGA') actionText = 'прочитал(а)';
    else actionText = 'завершил(а)';

    dotColor = 'bg-emerald-400';
    badgeLabel = 'Завершено';
    badgeColor = 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40';
    badgeIconName = 'CheckCircle2';
    mediaStatusLabel = 'Завершено';
  } else if (status === 'WATCHING' || status === 'PLAYING' || status === 'READING') {
    if (mediaType === 'GAME') actionText = 'играет в';
    else if (mediaType === 'BOOK' || mediaType === 'MANGA') actionText = 'читает';
    else actionText = 'смотрит';

    dotColor = 'bg-indigo-400';
    badgeLabel = 'В процессе';
    badgeColor = 'bg-indigo-950/60 text-indigo-300 border-indigo-800/40';
    badgeIconName = 'Play';
    mediaStatusLabel = 'В процессе';
  } else if (status === 'PLAN_TO_WATCH' || status === 'PLAN_TO_READ' || status === 'PLANNING') {
    actionText = 'запланировал(а)';
    dotColor = 'bg-[#8B5CF6]';
    badgeLabel = 'Запланировано';
    badgeColor = 'bg-purple-950/60 text-purple-300 border-purple-800/40';
    badgeIconName = 'Bookmark';
    mediaStatusLabel = 'Запланировано';
  } else if (status === 'ON_HOLD') {
    actionText = 'отложил(а)';
    dotColor = 'bg-amber-400';
    badgeLabel = 'Отложено';
    badgeColor = 'bg-amber-950/60 text-amber-300 border-amber-800/40';
    badgeIconName = 'Clock';
    mediaStatusLabel = 'Отложено';
  } else if (status === 'DROPPED') {
    actionText = 'бросил(а)';
    dotColor = 'bg-rose-400';
    badgeLabel = 'Брошено';
    badgeColor = 'bg-rose-950/60 text-rose-300 border-rose-800/40';
    badgeIconName = 'Radio';
    mediaStatusLabel = 'Брошено';
  } else if (type === 'MEDIA_STATUS_CHANGED' || type === 'STATUS_CHANGED') {
    actionText = 'обновил(а) статус';
    dotColor = 'bg-[#8B5CF6]';
    badgeLabel = 'Статус';
    badgeColor = 'bg-purple-950/60 text-purple-300 border-purple-800/40';
    badgeIconName = 'Bookmark';
  }

  return {
    actionText,
    dotColor,
    mediaStatus: status || null,
    mediaStatusLabel,
    badgeLabel,
    badgeColor,
    badgeIconName,
    detailsText: raw.media?.title ? `${actionText} «${raw.media.title}»` : actionText,
  };
}

/**
 * Formatter for LIST_CREATED / LIST_UPDATED
 */
function formatListActivity(type: string, raw: RawActivityItem, payload: any): Partial<FormattedActivity> {
  const isCreated = type === 'LIST_CREATED';
  const listTitle = sanitizeActivityText(raw.list?.title || payload?.title || (typeof raw.details === 'string' ? raw.details : ''));

  return {
    actionText: isCreated ? 'создал(а) список' : 'обновил(а) список',
    dotColor: 'bg-cyan-400',
    badgeLabel: isCreated ? 'Новый список' : 'Список',
    badgeColor: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/40',
    badgeIconName: 'ListPlus',
    detailsText: listTitle ? `Список «${listTitle}»` : 'Пользовательский список',
  };
}

/**
 * Formatter for TIERLIST_CREATED / TIERLIST_UPDATED
 */
function formatTierListActivity(type: string, raw: RawActivityItem, payload: any): Partial<FormattedActivity> {
  const isCreated = type === 'TIERLIST_CREATED';
  const tierTitle = sanitizeActivityText(raw.tierList?.title || payload?.title || (typeof raw.details === 'string' ? raw.details : ''));

  return {
    actionText: isCreated ? 'создал(а) тир-лист' : 'обновил(а) тир-лист',
    dotColor: 'bg-violet-400',
    badgeLabel: 'Тир-лист',
    badgeColor: 'bg-violet-950/60 text-violet-300 border-violet-800/40',
    badgeIconName: 'Sparkles',
    detailsText: tierTitle ? `Тир-лист «${tierTitle}»` : 'Тир-лист',
  };
}

/**
 * Formatter for CONTENT_SHARED
 */
function formatContentSharedActivity(raw: RawActivityItem): Partial<FormattedActivity> {
  return {
    actionText: 'поделился(лась) контентом',
    dotColor: 'bg-purple-400',
    badgeLabel: 'Поделился',
    badgeColor: 'bg-purple-950/60 text-purple-300 border-purple-800/40',
    badgeIconName: 'Share2',
    detailsText: raw.media?.title ? `Поделился «${raw.media.title}»` : 'Поделился контентом',
  };
}

/**
 * Fallback formatter for unknown / corrupt activities
 */
function formatFallbackActivity(type: string, raw: RawActivityItem): Partial<FormattedActivity> {
  return {
    actionText: 'обновил(а) активность',
    dotColor: 'bg-slate-400',
    badgeLabel: 'Активность',
    badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
    badgeIconName: 'Activity',
    detailsText: 'Новое действие',
  };
}

/**
 * Unified Activity Formatter.
 * Transforms any backend activity item into a structured, presentation-ready object.
 */
export function formatActivity(raw: RawActivityItem): FormattedActivity {
  const actor = extractActor(raw);
  const payload = extractPayload(raw);

  const createdAtStr = String(raw.createdAt);
  const relativeTime = formatActivityRelativeTime(raw.createdAt);
  const formattedDate = formatActivityDate(raw.createdAt);
  const fullDateTime = formatActivityFullDateTime(raw.createdAt);

  let formattedPartial: Partial<FormattedActivity>;

  switch (raw.type) {
    case 'ACHIEVEMENT_UNLOCKED':
      formattedPartial = formatAchievementActivity(raw, payload);
      break;

    case 'FRIEND_ADDED':
      formattedPartial = formatFriendActivity(raw, payload);
      break;

    case 'REVIEW_ADDED':
    case 'REVIEW_CREATED':
    case 'MEDIA_REVIEWED':
      formattedPartial = formatReviewActivity(raw, payload);
      break;

    case 'MEDIA_RATED':
    case 'RATING_ADDED':
      formattedPartial = formatRatingActivity(raw, payload);
      break;

    case 'MEDIA_ADDED':
    case 'MEDIA_COMPLETED':
    case 'MEDIA_STATUS_CHANGED':
    case 'STATUS_CHANGED':
    case 'MEDIA_STARTED':
    case 'MEDIA_WATCHING':
    case 'MEDIA_PLAYING':
    case 'MEDIA_READING':
    case 'MEDIA_DROPPED':
      formattedPartial = formatMediaStatusActivity(raw.type, raw, payload);
      break;

    case 'LIST_CREATED':
    case 'LIST_UPDATED':
    case 'LIST_ITEM_ADDED':
      formattedPartial = formatListActivity(raw.type, raw, payload);
      break;

    case 'TIERLIST_CREATED':
    case 'TIERLIST_UPDATED':
      formattedPartial = formatTierListActivity(raw.type, raw, payload);
      break;

    case 'CONTENT_SHARED':
      formattedPartial = formatContentSharedActivity(raw);
      break;

    default:
      formattedPartial = formatFallbackActivity(raw.type, raw);
      break;
  }

  // Final assembly
  return {
    id: raw.id,
    type: raw.type,
    actor,
    actionText: formattedPartial.actionText || 'активность',
    dotColor: formattedPartial.dotColor || 'bg-[#8B5CF6]',
    createdAt: createdAtStr,
    relativeTime,
    formattedDate,
    fullDateTime,
    detailsText: formattedPartial.detailsText || '',
    achievement: formattedPartial.achievement,
    friend: formattedPartial.friend,
    review: formattedPartial.review,
    reviewSnippet: formattedPartial.reviewSnippet,
    userRating: formattedPartial.userRating,
    mediaStatus: formattedPartial.mediaStatus,
    mediaStatusLabel: formattedPartial.mediaStatusLabel,
    media: raw.media,
    list: raw.list,
    tierList: raw.tierList,
    badgeLabel: formattedPartial.badgeLabel || 'Активность',
    badgeColor: formattedPartial.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700',
    badgeIconName: formattedPartial.badgeIconName || 'Activity',
    likesCount: typeof raw.likesCount === 'number' ? raw.likesCount : 0,
    userLiked: !!raw.userLiked,
    commentsCount: typeof raw.commentsCount === 'number' ? raw.commentsCount : 0,
    recentComments: Array.isArray(raw.recentComments) ? raw.recentComments : [],
  };
}
