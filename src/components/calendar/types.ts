export type ViewMode = 'week' | 'month' | 'list' | 'timeline';
export type ScopeMode = 'upcoming' | 'past' | 'all';
export type PeriodType =
  | 'today'
  | 'week'
  | 'next_week'
  | 'month'
  | 'next_month'
  | '3months'
  | '6months'
  | 'year'
  | 'custom';

export interface ReleaseItem {
  id: number;
  mediaId: number;
  type: string;
  title: string;
  originalTitle?: string | null;
  description?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  releaseDate: string;
  releaseTime?: string | null;
  year?: number | null;
  genres: string[];
  rating?: number | null;
  platforms?: string[];
  totalSeasons?: number | null;
  totalEpisodes?: number | null;
  isFollowed: boolean;
  isSubscribed: boolean;
  userLibraryStatus?: string | null;
  isSoon: boolean;
  isPopular: boolean;
  countdown: string;
  daysUntil: number;
  episodeInfo?: {
    seasonNumber: number;
    episodeNumber: number;
    title?: string | null;
  } | null;
}

export interface CalendarFilters {
  view: ViewMode;
  scope: ScopeMode;
  categories: string[]; // ['MOVIE', 'TV', ...] or ['all']
  period: PeriodType;
  dateFrom: string;
  dateTo: string;
  followedOnly: boolean;
  genre: string;
  platform: string;
  search: string;
  sort: 'date' | 'popularity' | 'rating' | 'title';
  order: 'asc' | 'desc';
}

export interface CategoryOption {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export const CATEGORIES: CategoryOption[] = [
  { id: 'all', label: 'Все', icon: 'Sparkles', color: 'text-purple-400' },
  { id: 'MOVIE', label: 'Фильмы', icon: 'Film', color: 'text-rose-400' },
  { id: 'TV', label: 'Сериалы', icon: 'Tv', color: 'text-sky-400' },
  { id: 'ANIME', label: 'Аниме', icon: 'Flame', color: 'text-amber-400' },
  { id: 'GAME', label: 'Игры', icon: 'Gamepad2', color: 'text-emerald-400' },
  { id: 'BOOK', label: 'Книги', icon: 'BookOpen', color: 'text-amber-300' },
  { id: 'MANGA', label: 'Манга', icon: 'BookMarked', color: 'text-pink-400' },
  { id: 'COMIC', label: 'Комиксы', icon: 'Mask', color: 'text-indigo-400' },
  { id: 'MUSIC', label: 'Музыка', icon: 'Music', color: 'text-violet-400' },
];

export const PERIOD_OPTIONS: { id: PeriodType; label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Эта неделя' },
  { id: 'next_week', label: 'След. неделя' },
  { id: 'month', label: 'Этот месяц' },
  { id: 'next_month', label: 'След. месяц' },
  { id: '3months', label: '3 месяца' },
  { id: '6months', label: '6 месяцев' },
  { id: 'year', label: 'Год' },
  { id: 'custom', label: 'Свой диапазон' },
];
