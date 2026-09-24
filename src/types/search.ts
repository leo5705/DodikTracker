export type MediaTypeCategory =
  | 'ALL'
  | 'MOVIE'
  | 'TV'
  | 'ANIME'
  | 'MANGA'
  | 'GAME'
  | 'BOOK'
  | 'COMIC'
  | 'MUSIC';

export type SortByOption =
  | 'relevance'
  | 'popularity'
  | 'rating'
  | 'dodik_rating'
  | 'dodik_votes'
  | 'release_date'
  | 'title';

export type SortOrderOption = 'desc' | 'asc';

export interface SearchQuery {
  query?: string;
  type?: MediaTypeCategory;
}

export interface SearchFilters {
  genres: string[];
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  ratingFrom?: number;
  ratingTo?: number;
  // Dodik Tracker Ratings
  dodikRatingFrom?: number;
  dodikRatingTo?: number;
  dodikRatingCountFrom?: number;
  votesFrom?: number;
  durationFrom?: number;
  durationTo?: number;
  episodesFrom?: number;
  episodesTo?: number;
  countries?: string[];
  // Age Ratings & 18+
  ageRatings?: string[];
  adultFilter?: 'all' | 'hide_adult' | 'only_adult';
  hideAdult?: boolean;
  hideNudity?: boolean;
  hideSexualContent?: boolean;
  hideViolence?: boolean;
  hideExplicitLanguage?: boolean;
  // User Personal Library Filters
  myStatus?: string; // 'WATCHING' | 'COMPLETED' | 'PLAN_TO_WATCH' | 'DROPPED' | 'ON_HOLD' | 'PLAYING' | 'READING' etc.
  inLibrary?: 'any' | 'in_library' | 'not_in_library';
  myRatingState?: 'any' | 'rated' | 'unrated';
  myRating?: number; // Exact rating 1-10
  myRatingFrom?: number;
  myRatingTo?: number;
  hasReview?: 'any' | 'with_review' | 'without_review';
  // Category-specific filters
  // Games
  platforms?: string[];
  developer?: string;
  publisher?: string;
  gameMode?: string;
  // Anime / Manga
  status?: string; // 'AIRING' | 'FINISHED' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS'
  season?: string; // 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'
  seasonYear?: number;
  animeFormat?: string; // 'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL'
  // Books & Comics
  author?: string;
  artist?: string;
  language?: string;
  // Music
  album?: string;
}

export interface SearchSort {
  sortBy: SortByOption;
  sortOrder: SortOrderOption;
}

export interface SearchState {
  query: string;
  type: MediaTypeCategory;
  filters: SearchFilters;
  sort: SearchSort;
  page: number;
  limit: number;
}

export interface ActiveFilterChip {
  id: string;
  label: string;
  field: keyof SearchFilters | 'type' | 'sort';
  value?: any;
}

// Genre dictionaries per category
export const CATEGORY_GENRES: Record<string, string[]> = {
  MOVIE: [
    'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
    'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music',
    'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western'
  ],
  TV: [
    'Action & Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
    'Drama', 'Family', 'Kids', 'Mystery', 'News', 'Reality',
    'Sci-Fi & Fantasy', 'Soap', 'Talk', 'War & Politics', 'Western'
  ],
  ANIME: [
    'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy',
    'Hentai', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery',
    'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports',
    'Supernatural', 'Thriller'
  ],
  MANGA: [
    'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
    'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life',
    'Sports', 'Supernatural', 'Thriller', 'Seinen', 'Shounen', 'Shoujo', 'Josei'
  ],
  GAME: [
    'Action', 'Adventure', 'RPG', 'Shooter', 'Puzzle', 'Strategy',
    'Simulation', 'Arcade', 'Massively Multiplayer', 'Platformer',
    'Racing', 'Sports', 'Fighting', 'Family', 'Casual', 'Indie'
  ],
  BOOK: [
    'Fiction', 'Non-fiction', 'Fantasy', 'Science Fiction', 'Mystery',
    'Thriller', 'Romance', 'Historical Fiction', 'Biography', 'History',
    'Philosophy', 'Psychology', 'Poetry', 'Horror'
  ],
  COMIC: [
    'Superhero', 'Sci-Fi', 'Fantasy', 'Horror', 'Manga', 'Action',
    'Crime', 'Humor', 'Adventure'
  ],
  MUSIC: [
    'Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'Metal', 'R&B'
  ],
};

// Platform options for Games
export const GAME_PLATFORMS = [
  { id: 'PC', label: 'PC (Windows / Mac / Linux)' },
  { id: 'PlayStation 5', label: 'PlayStation 5' },
  { id: 'PlayStation 4', label: 'PlayStation 4' },
  { id: 'Xbox Series S/X', label: 'Xbox Series X/S' },
  { id: 'Xbox One', label: 'Xbox One' },
  { id: 'Nintendo Switch', label: 'Nintendo Switch' },
  { id: 'iOS', label: 'iOS (Mobile)' },
  { id: 'Android', label: 'Android (Mobile)' },
];

// Anime status options
export const ANIME_STATUSES = [
  { id: 'RELEASING', label: 'Онгоинг (Выходит)' },
  { id: 'FINISHED', label: 'Завершено' },
  { id: 'NOT_YET_RELEASED', label: 'Анонс (Не вышло)' },
  { id: 'CANCELLED', label: 'Отменено' },
];

// Anime seasons
export const ANIME_SEASONS = [
  { id: 'WINTER', label: 'Зима' },
  { id: 'SPRING', label: 'Весна' },
  { id: 'SUMMER', label: 'Лето' },
  { id: 'FALL', label: 'Осень' },
];

// Anime formats
export const ANIME_FORMATS = [
  { id: 'TV', label: 'ТВ Сериал' },
  { id: 'MOVIE', label: 'Полнометражный фильм' },
  { id: 'OVA', label: 'OVA' },
  { id: 'ONA', label: 'ONA / Веб' },
  { id: 'SPECIAL', label: 'Спешл' },
];

// Age Ratings
export const AGE_RATING_OPTIONS = [
  { id: '0+', label: '0+ (Для всех)' },
  { id: '6+', label: '6+ (Для детей)' },
  { id: '12+', label: '12+ (Подростки)' },
  { id: '16+', label: '16+ (Старшие подростки)' },
  { id: '18+', label: '18+ (Только для взрослых)' },
  { id: 'PG-13', label: 'PG-13' },
  { id: 'R', label: 'R (17+)' },
  { id: 'NC-17', label: 'NC-17' },
];

// User Library Status options based on media type
export const USER_STATUS_OPTIONS: Record<string, { id: string; label: string }[]> = {
  DEFAULT: [
    { id: 'PLAN_TO_WATCH', label: 'В планах' },
    { id: 'WATCHING', label: 'В процессе' },
    { id: 'COMPLETED', label: 'Завершено' },
    { id: 'ON_HOLD', label: 'Отложено' },
    { id: 'DROPPED', label: 'Брошено' },
  ],
  MOVIE: [
    { id: 'PLAN_TO_WATCH', label: 'Буду смотреть' },
    { id: 'WATCHING', label: 'Смотрю' },
    { id: 'COMPLETED', label: 'Посмотрел' },
    { id: 'ON_HOLD', label: 'Отложено' },
    { id: 'DROPPED', label: 'Брошено' },
  ],
  TV: [
    { id: 'PLAN_TO_WATCH', label: 'Буду смотреть' },
    { id: 'WATCHING', label: 'Смотрю' },
    { id: 'COMPLETED', label: 'Посмотрел' },
    { id: 'ON_HOLD', label: 'Отложено' },
    { id: 'DROPPED', label: 'Брошено' },
  ],
  ANIME: [
    { id: 'PLAN_TO_WATCH', label: 'Буду смотреть' },
    { id: 'WATCHING', label: 'Смотрю' },
    { id: 'COMPLETED', label: 'Посмотрел' },
    { id: 'ON_HOLD', label: 'Отложено' },
    { id: 'DROPPED', label: 'Брошено' },
  ],
  GAME: [
    { id: 'PLAN_TO_PLAY', label: 'Хочу сыграть' },
    { id: 'PLAYING', label: 'Играю / Прохожу' },
    { id: 'COMPLETED', label: 'Пройдено' },
    { id: 'ON_HOLD', label: 'Отложено' },
    { id: 'DROPPED', label: 'Брошено' },
  ],
  BOOK: [
    { id: 'PLAN_TO_READ', label: 'Буду читать' },
    { id: 'READING', label: 'Читаю' },
    { id: 'COMPLETED', label: 'Прочитано' },
    { id: 'ON_HOLD', label: 'Отложено' },
    { id: 'DROPPED', label: 'Брошено' },
  ],
  MANGA: [
    { id: 'PLAN_TO_READ', label: 'Буду читать' },
    { id: 'READING', label: 'Читаю' },
    { id: 'COMPLETED', label: 'Прочитано' },
    { id: 'ON_HOLD', label: 'Отложено' },
    { id: 'DROPPED', label: 'Брошено' },
  ],
  COMIC: [
    { id: 'PLAN_TO_READ', label: 'Буду читать' },
    { id: 'READING', label: 'Читаю' },
    { id: 'COMPLETED', label: 'Прочитано' },
    { id: 'ON_HOLD', label: 'Отложено' },
    { id: 'DROPPED', label: 'Брошено' },
  ],
  MUSIC: [
    { id: 'PLAN_TO_LISTEN', label: 'В планах' },
    { id: 'LISTENING', label: 'Слушаю' },
    { id: 'COMPLETED', label: 'Послушал' },
    { id: 'ON_HOLD', label: 'Отложено' },
    { id: 'DROPPED', label: 'Брошено' },
  ],
};

// Common Countries for Filtering
export const COMMON_COUNTRIES = [
  'Япония',
  'США',
  'Южная Корея',
  'Великобритания',
  'Франция',
  'Германия',
  'Россия',
  'Канада',
  'Италия',
  'Китай',
  'Испания',
  'Австралия',
  'Швеция',
  'Польша',
];

// Quick Year ranges
export const QUICK_YEAR_PRESETS = [
  { label: '2026', from: 2026, to: 2026 },
  { label: '2025', from: 2025, to: 2025 },
  { label: '2024', from: 2024, to: 2024 },
  { label: '2020–2026', from: 2020, to: 2026 },
  { label: '2010–2019', from: 2010, to: 2019 },
  { label: '2000–2009', from: 2000, to: 2009 },
  { label: '90-е (1990–1999)', from: 1990, to: 1999 },
  { label: 'Классика (до 1990)', from: 1900, to: 1989 },
];

// Rating presets
export const RATING_PRESETS = [
  { label: 'Любой', value: undefined },
  { label: '6.0+', value: 6 },
  { label: '7.0+', value: 7 },
  { label: '8.0+', value: 8 },
  { label: '9.0+', value: 9 },
];

export const SORT_OPTIONS: { id: SortByOption; label: string }[] = [
  { id: 'relevance', label: 'По релевантности' },
  { id: 'dodik_rating', label: 'По рейтингу Dodik Tracker' },
  { id: 'popularity', label: 'По популярности' },
  { id: 'dodik_votes', label: 'По количеству оценок Dodik' },
  { id: 'release_date', label: 'По дате выхода' },
  { id: 'title', label: 'По алфавиту' },
  { id: 'rating', label: 'По внешнему рейтингу' },
];

export const INITIAL_SEARCH_FILTERS: SearchFilters = {
  genres: [],
  yearFrom: undefined,
  yearTo: undefined,
  year: undefined,
  ratingFrom: undefined,
  ratingTo: undefined,
  dodikRatingFrom: undefined,
  dodikRatingTo: undefined,
  dodikRatingCountFrom: undefined,
  countries: [],
  ageRatings: [],
  adultFilter: 'all',
  platforms: [],
  status: undefined,
  season: undefined,
  seasonYear: undefined,
  animeFormat: undefined,
  myStatus: undefined,
  inLibrary: 'any',
  myRatingState: 'any',
  myRating: undefined,
  myRatingFrom: undefined,
  myRatingTo: undefined,
  hasReview: 'any',
};

export const INITIAL_SEARCH_STATE: SearchState = {
  query: '',
  type: 'ALL',
  filters: INITIAL_SEARCH_FILTERS,
  sort: {
    sortBy: 'relevance',
    sortOrder: 'desc',
  },
  page: 1,
  limit: 24,
};

/**
 * Cleans up filter parameters incompatible with the selected category
 */
export function sanitizeFiltersForCategory(filters: SearchFilters, category: MediaTypeCategory): SearchFilters {
  const sanitized = { ...filters };

  if (category !== 'GAME') {
    delete sanitized.platforms;
    delete sanitized.developer;
    delete sanitized.gameMode;
  }
  if (category !== 'ANIME' && category !== 'MANGA') {
    delete sanitized.season;
    delete sanitized.seasonYear;
    delete sanitized.animeFormat;
  }
  if (category !== 'BOOK' && category !== 'COMIC') {
    delete sanitized.author;
    delete sanitized.language;
  }
  if (category !== 'COMIC') {
    delete sanitized.artist;
  }
  if (category !== 'MUSIC') {
    delete sanitized.album;
  }
  return sanitized;
}

/**
 * Checks if any deep filter is active
 */
export function hasActiveFilters(filters: SearchFilters): boolean {
  return Boolean(
    (filters.genres && filters.genres.length > 0) ||
    filters.year !== undefined ||
    filters.yearFrom !== undefined ||
    filters.yearTo !== undefined ||
    filters.ratingFrom !== undefined ||
    filters.ratingTo !== undefined ||
    filters.dodikRatingFrom !== undefined ||
    filters.dodikRatingTo !== undefined ||
    filters.dodikRatingCountFrom !== undefined ||
    filters.votesFrom !== undefined ||
    (filters.countries && filters.countries.length > 0) ||
    (filters.ageRatings && filters.ageRatings.length > 0) ||
    (filters.adultFilter && filters.adultFilter !== 'all') ||
    (filters.platforms && filters.platforms.length > 0) ||
    filters.developer !== undefined ||
    filters.publisher !== undefined ||
    filters.author !== undefined ||
    filters.artist !== undefined ||
    filters.album !== undefined ||
    filters.language !== undefined ||
    filters.status !== undefined ||
    filters.season !== undefined ||
    filters.seasonYear !== undefined ||
    filters.animeFormat !== undefined ||
    (filters.myStatus !== undefined && filters.myStatus !== '') ||
    (filters.inLibrary && filters.inLibrary !== 'any') ||
    (filters.myRatingState && filters.myRatingState !== 'any') ||
    filters.myRating !== undefined ||
    filters.myRatingFrom !== undefined ||
    filters.myRatingTo !== undefined ||
    (filters.hasReview && filters.hasReview !== 'any') ||
    filters.hideAdult ||
    filters.hideNudity ||
    filters.hideSexualContent ||
    filters.hideViolence ||
    filters.hideExplicitLanguage
  );
}

/**
 * Converts SearchState into URLSearchParams string
 */
export function stateToQueryString(state: Partial<SearchState>): string {
  const params = new URLSearchParams();

  if (state.query && state.query.trim()) {
    params.set('q', state.query.trim());
  }

  if (state.type && state.type !== 'ALL') {
    params.set('type', state.type);
  }

  const f = state.filters ? sanitizeFiltersForCategory(state.filters, state.type || 'ALL') : undefined;
  if (f) {
    if (f.genres && f.genres.length > 0) params.set('genres', f.genres.join(','));
    if (f.countries && f.countries.length > 0) params.set('countries', f.countries.join(','));
    if (f.ageRatings && f.ageRatings.length > 0) params.set('age_ratings', f.ageRatings.join(','));
    if (f.adultFilter && f.adultFilter !== 'all') params.set('adult_filter', f.adultFilter);
    if (f.year) params.set('year', String(f.year));
    if (f.yearFrom) params.set('year_from', String(f.yearFrom));
    if (f.yearTo) params.set('year_to', String(f.yearTo));
    if (f.ratingFrom !== undefined) params.set('rating_from', String(f.ratingFrom));
    if (f.ratingTo !== undefined) params.set('rating_to', String(f.ratingTo));
    if (f.dodikRatingFrom !== undefined) params.set('dodik_rating_from', String(f.dodikRatingFrom));
    if (f.dodikRatingTo !== undefined) params.set('dodik_rating_to', String(f.dodikRatingTo));
    if (f.dodikRatingCountFrom !== undefined) params.set('dodik_votes_from', String(f.dodikRatingCountFrom));
    if (f.status) params.set('status', f.status);
    if (f.platforms && f.platforms.length > 0) params.set('platforms', f.platforms.join(','));
    if (f.developer) params.set('developer', f.developer);
    if (f.publisher) params.set('publisher', f.publisher);
    if (f.author) params.set('author', f.author);
    if (f.artist) params.set('artist', f.artist);
    if (f.album) params.set('album', f.album);
    if (f.language) params.set('language', f.language);
    if (f.season) params.set('season', f.season);
    if (f.seasonYear) params.set('season_year', String(f.seasonYear));
    if (f.animeFormat) params.set('anime_format', f.animeFormat);
    if (f.myStatus) params.set('my_status', f.myStatus);
    if (f.inLibrary && f.inLibrary !== 'any') params.set('in_library', f.inLibrary);
    if (f.myRatingState && f.myRatingState !== 'any') params.set('my_rating_state', f.myRatingState);
    if (f.myRating !== undefined) params.set('my_rating', String(f.myRating));
    if (f.myRatingFrom !== undefined) params.set('my_rating_from', String(f.myRatingFrom));
    if (f.myRatingTo !== undefined) params.set('my_rating_to', String(f.myRatingTo));
    if (f.hasReview && f.hasReview !== 'any') params.set('has_review', f.hasReview);
    if (f.hideAdult) params.set('hide_adult', '1');
    if (f.hideNudity) params.set('hide_nudity', '1');
    if (f.hideSexualContent) params.set('hide_sexual_content', '1');
    if (f.hideViolence) params.set('hide_violence', '1');
    if (f.hideExplicitLanguage) params.set('hide_explicit_language', '1');
  }

  if (state.sort) {
    if (state.sort.sortBy && state.sort.sortBy !== 'relevance') {
      params.set('sort_by', state.sort.sortBy);
    }
    if (state.sort.sortOrder && state.sort.sortOrder !== 'desc') {
      params.set('sort_order', state.sort.sortOrder);
    }
  }

  return params.toString();
}

/**
 * Parses URL query parameters into partial SearchState
 */
export function parseQueryStringToState(searchString: string): Partial<SearchState> {
  const clean = searchString.startsWith('?') ? searchString.slice(1) : searchString;
  const sp = new URLSearchParams(clean);

  const parseNum = (key: string): number | undefined => {
    const v = sp.get(key);
    if (!v) return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
  };

  const parseList = (key: string): string[] => {
    const v = sp.get(key);
    if (!v) return [];
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  };

  const parseBool = (key: string): boolean | undefined => {
    const v = sp.get(key);
    if (v === '1' || v === 'true') return true;
    return undefined;
  };

  const query = sp.get('q') || sp.get('query') || '';
  const rawTypeParam = (sp.get('type') || sp.get('category') || 'ALL').toUpperCase();
  let rawType: MediaTypeCategory = 'ALL';
  if (['MOVIE', 'TV', 'ANIME', 'MANGA', 'GAME', 'BOOK', 'COMIC', 'MUSIC'].includes(rawTypeParam)) {
    rawType = rawTypeParam as MediaTypeCategory;
  } else if (rawTypeParam === 'MOVIES' || rawTypeParam === 'FILMS') {
    rawType = 'MOVIE';
  } else if (rawTypeParam === 'SERIES') {
    rawType = 'TV';
  } else if (rawTypeParam === 'GAMES') {
    rawType = 'GAME';
  } else if (rawTypeParam === 'BOOKS') {
    rawType = 'BOOK';
  } else if (rawTypeParam === 'COMICS') {
    rawType = 'COMIC';
  }

  const filters: SearchFilters = {
    genres: parseList('genres').length > 0 ? parseList('genres') : parseList('genre'),
    countries: parseList('countries').length > 0 ? parseList('countries') : parseList('country'),
    ageRatings: parseList('age_ratings').length > 0 ? parseList('age_ratings') : parseList('ageRatings'),
    adultFilter: (sp.get('adult_filter') || sp.get('adultFilter') || 'all') as any,
    year: parseNum('year'),
    yearFrom: parseNum('year_from') ?? parseNum('yearFrom'),
    yearTo: parseNum('year_to') ?? parseNum('yearTo'),
    ratingFrom: parseNum('rating_from') ?? parseNum('ratingFrom'),
    ratingTo: parseNum('rating_to') ?? parseNum('ratingTo'),
    dodikRatingFrom: parseNum('dodik_rating_from') ?? parseNum('dodikRatingFrom'),
    dodikRatingTo: parseNum('dodik_rating_to') ?? parseNum('dodikRatingTo'),
    dodikRatingCountFrom: parseNum('dodik_votes_from') ?? parseNum('dodikRatingCountFrom'),
    platforms: parseList('platforms').length > 0 ? parseList('platforms') : parseList('platform'),
    developer: sp.get('developer') || undefined,
    publisher: sp.get('publisher') || undefined,
    author: sp.get('author') || undefined,
    artist: sp.get('artist') || undefined,
    album: sp.get('album') || undefined,
    language: sp.get('language') || undefined,
    status: sp.get('status') || undefined,
    season: sp.get('season') || undefined,
    seasonYear: parseNum('season_year') ?? parseNum('seasonYear'),
    animeFormat: sp.get('anime_format') || sp.get('animeFormat') || undefined,
    myStatus: sp.get('my_status') || sp.get('myStatus') || undefined,
    inLibrary: (sp.get('in_library') || sp.get('inLibrary') || 'any') as any,
    myRatingState: (sp.get('my_rating_state') || sp.get('myRatingState') || 'any') as any,
    myRating: parseNum('my_rating') ?? parseNum('myRating'),
    myRatingFrom: parseNum('my_rating_from') ?? parseNum('myRatingFrom'),
    myRatingTo: parseNum('my_rating_to') ?? parseNum('myRatingTo'),
    hasReview: (sp.get('has_review') || sp.get('hasReview') || 'any') as any,
    hideAdult: parseBool('hide_adult') ?? parseBool('hideAdult'),
    hideNudity: parseBool('hide_nudity') ?? parseBool('hideNudity'),
    hideSexualContent: parseBool('hide_sexual_content') ?? parseBool('hideSexualContent'),
    hideViolence: parseBool('hide_violence') ?? parseBool('hideViolence'),
    hideExplicitLanguage: parseBool('hide_explicit_language') ?? parseBool('hideExplicitLanguage'),
  };

  const sanitizedFilters = sanitizeFiltersForCategory(filters, rawType);

  const rawSortBy = sp.get('sort_by') as SortByOption;
  const sortBy = (['relevance', 'popularity', 'rating', 'dodik_rating', 'dodik_votes', 'release_date', 'title'].includes(rawSortBy)
    ? rawSortBy
    : (query ? 'relevance' : 'popularity')) as SortByOption;
  const sortOrder = (sp.get('sort_order') === 'asc' ? 'asc' : 'desc') as SortOrderOption;

  return {
    query,
    type: rawType,
    filters: sanitizedFilters,
    sort: {
      sortBy,
      sortOrder,
    },
  };
}

/**
 * Returns user-friendly active filter chips for display
 */
export function getActiveFilterChips(
  filters: SearchFilters,
  sort: SearchSort,
  type: MediaTypeCategory
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  // Genres
  filters.genres.forEach((genre) => {
    chips.push({
      id: `genre-${genre}`,
      label: `Жанр: ${genre}`,
      field: 'genres',
      value: genre,
    });
  });

  // Countries
  (filters.countries || []).forEach((country) => {
    chips.push({
      id: `country-${country}`,
      label: `Страна: ${country}`,
      field: 'countries',
      value: country,
    });
  });

  // Age Ratings
  (filters.ageRatings || []).forEach((age) => {
    chips.push({
      id: `age-${age}`,
      label: `Возраст: ${age}`,
      field: 'ageRatings',
      value: age,
    });
  });

  // Adult filter
  if (filters.adultFilter === 'hide_adult') {
    chips.push({ id: 'adultFilter-hide', label: 'Скрыть 18+', field: 'adultFilter' });
  } else if (filters.adultFilter === 'only_adult') {
    chips.push({ id: 'adultFilter-only', label: 'Только 18+', field: 'adultFilter' });
  }

  // Year range or exact year
  if (filters.year) {
    chips.push({
      id: 'year',
      label: `Год: ${filters.year}`,
      field: 'year',
    });
  } else if (filters.yearFrom && filters.yearTo) {
    chips.push({
      id: 'year-range',
      label: `Года: ${filters.yearFrom} – ${filters.yearTo}`,
      field: 'yearFrom',
    });
  } else if (filters.yearFrom) {
    chips.push({
      id: 'year-from',
      label: `С ${filters.yearFrom} года`,
      field: 'yearFrom',
    });
  } else if (filters.yearTo) {
    chips.push({
      id: 'year-to',
      label: `До ${filters.yearTo} года`,
      field: 'yearTo',
    });
  }

  // Dodik Tracker Rating Range
  if (filters.dodikRatingFrom !== undefined && filters.dodikRatingTo !== undefined) {
    chips.push({
      id: 'dodik-rating-range',
      label: `Dodik Рейтинг: ${filters.dodikRatingFrom} – ${filters.dodikRatingTo}`,
      field: 'dodikRatingFrom',
    });
  } else if (filters.dodikRatingFrom !== undefined) {
    chips.push({
      id: 'dodik-rating-from',
      label: `Dodik Рейтинг: ${filters.dodikRatingFrom}+`,
      field: 'dodikRatingFrom',
    });
  } else if (filters.dodikRatingTo !== undefined) {
    chips.push({
      id: 'dodik-rating-to',
      label: `Dodik Рейтинг: до ${filters.dodikRatingTo}`,
      field: 'dodikRatingTo',
    });
  }

  if (filters.dodikRatingCountFrom) {
    chips.push({
      id: 'dodik-votes-from',
      label: `Оценок от: ${filters.dodikRatingCountFrom}`,
      field: 'dodikRatingCountFrom',
    });
  }

  // External Rating
  if (filters.ratingFrom !== undefined && filters.ratingTo !== undefined) {
    chips.push({
      id: 'rating-range',
      label: `Внешний рейтинг: ${filters.ratingFrom} – ${filters.ratingTo}`,
      field: 'ratingFrom',
    });
  } else if (filters.ratingFrom !== undefined) {
    chips.push({
      id: 'rating-from',
      label: `Внешний рейтинг: ${filters.ratingFrom}+`,
      field: 'ratingFrom',
    });
  }

  // User Library Status & Personal filters
  if (filters.myStatus) {
    const statusCategoryList = USER_STATUS_OPTIONS[type] || USER_STATUS_OPTIONS.DEFAULT;
    const foundStatus = statusCategoryList.find((s) => s.id === filters.myStatus);
    chips.push({
      id: 'myStatus',
      label: `Статус: ${foundStatus ? foundStatus.label : filters.myStatus}`,
      field: 'myStatus',
    });
  }

  if (filters.inLibrary === 'in_library') {
    chips.push({ id: 'inLibrary', label: 'В моей библиотеке', field: 'inLibrary' });
  } else if (filters.inLibrary === 'not_in_library') {
    chips.push({ id: 'inLibrary', label: 'Не в библиотеке', field: 'inLibrary' });
  }

  if (filters.myRatingState === 'rated') {
    chips.push({ id: 'myRatingState', label: 'Оценено мной', field: 'myRatingState' });
  } else if (filters.myRatingState === 'unrated') {
    chips.push({ id: 'myRatingState', label: 'Не оценено мной', field: 'myRatingState' });
  }

  if (filters.myRating !== undefined) {
    chips.push({
      id: 'myRatingExact',
      label: `Моя оценка: ★ ${filters.myRating}`,
      field: 'myRating',
    });
  } else if (filters.myRatingFrom !== undefined || filters.myRatingTo !== undefined) {
    chips.push({
      id: 'myRatingRange',
      label: `Моя оценка: ${filters.myRatingFrom || 1} – ${filters.myRatingTo || 10}`,
      field: 'myRatingFrom',
    });
  }

  if (filters.hasReview === 'with_review') {
    chips.push({ id: 'hasReview', label: 'С моей рецензией', field: 'hasReview' });
  } else if (filters.hasReview === 'without_review') {
    chips.push({ id: 'hasReview', label: 'Без моей рецензии', field: 'hasReview' });
  }

  // Creator filters
  if (filters.author) {
    chips.push({ id: 'author', label: `Автор: ${filters.author}`, field: 'author' });
  }
  if (filters.artist) {
    chips.push({ id: 'artist', label: `Художник/Артист: ${filters.artist}`, field: 'artist' });
  }
  if (filters.album) {
    chips.push({ id: 'album', label: `Альбом: ${filters.album}`, field: 'album' });
  }
  if (filters.language) {
    chips.push({ id: 'language', label: `Язык: ${filters.language}`, field: 'language' });
  }

  // Developer & Publisher
  if (filters.developer) {
    chips.push({
      id: 'developer',
      label: `Разработчик: ${filters.developer}`,
      field: 'developer',
    });
  }
  if (filters.publisher) {
    chips.push({
      id: 'publisher',
      label: `Издатель: ${filters.publisher}`,
      field: 'publisher',
    });
  }

  // Platforms
  if (filters.platforms && filters.platforms.length > 0) {
    filters.platforms.forEach((p) => {
      chips.push({
        id: `platform-${p}`,
        label: `Платформа: ${p}`,
        field: 'platforms',
        value: p,
      });
    });
  }

  // Status
  if (filters.status) {
    const statusObj = ANIME_STATUSES.find((s) => s.id === filters.status);
    chips.push({
      id: 'status',
      label: `Релиз: ${statusObj ? statusObj.label : filters.status}`,
      field: 'status',
    });
  }

  // Season
  if (filters.season) {
    const seasonObj = ANIME_SEASONS.find((s) => s.id === filters.season);
    chips.push({
      id: 'season',
      label: `Сезон: ${seasonObj ? seasonObj.label : filters.season}${filters.seasonYear ? ` ${filters.seasonYear}` : ''}`,
      field: 'season',
    });
  }

  // Format
  if (filters.animeFormat) {
    const formatObj = ANIME_FORMATS.find((f) => f.id === filters.animeFormat);
    chips.push({
      id: 'animeFormat',
      label: `Формат: ${formatObj ? formatObj.label : filters.animeFormat}`,
      field: 'animeFormat',
    });
  }

  // Content safety chips
  if (filters.hideAdult) {
    chips.push({ id: 'hideAdult', label: 'Скрывать 18+', field: 'hideAdult' });
  }
  if (filters.hideNudity) {
    chips.push({ id: 'hideNudity', label: 'Скрывать наготу', field: 'hideNudity' });
  }
  if (filters.hideSexualContent) {
    chips.push({ id: 'hideSexualContent', label: 'Скрывать секс. контент', field: 'hideSexualContent' });
  }
  if (filters.hideViolence) {
    chips.push({ id: 'hideViolence', label: 'Скрывать жестокость', field: 'hideViolence' });
  }
  if (filters.hideExplicitLanguage) {
    chips.push({ id: 'hideExplicitLanguage', label: 'Скрывать ненормативную лексику', field: 'hideExplicitLanguage' });
  }

  // Sort if not default
  if (sort.sortBy !== 'relevance' && (sort.sortBy !== 'popularity' || sort.sortOrder !== 'desc')) {
    const sortLabel = SORT_OPTIONS.find((s) => s.id === sort.sortBy)?.label || sort.sortBy;
    const orderLabel = sort.sortOrder === 'asc' ? ' (▲ возр.)' : ' (▼ убыв.)';
    chips.push({
      id: 'sort',
      label: `${sortLabel}${orderLabel}`,
      field: 'sort',
    });
  }

  return chips;
}
