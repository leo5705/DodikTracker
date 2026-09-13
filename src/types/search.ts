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

export type SortByOption = 'popularity' | 'rating' | 'release_date' | 'title';
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
  votesFrom?: number;
  durationFrom?: number;
  durationTo?: number;
  episodesFrom?: number;
  episodesTo?: number;
  countries?: string[];
  platforms?: string[];
  status?: string; // 'AIRING' | 'FINISHED' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS'
  season?: string; // 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'
  seasonYear?: number;
  animeFormat?: string; // 'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL'
  gameMode?: string;
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

// Quick Year ranges
export const QUICK_YEAR_PRESETS = [
  { label: '2025', from: 2025, to: 2025 },
  { label: '2024', from: 2024, to: 2024 },
  { label: '2020–2025', from: 2020, to: 2025 },
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
  { id: 'popularity', label: 'По популярности' },
  { id: 'rating', label: 'По рейтингу' },
  { id: 'release_date', label: 'По дате выхода' },
  { id: 'title', label: 'По алфавиту' },
];

export const INITIAL_SEARCH_FILTERS: SearchFilters = {
  genres: [],
  yearFrom: undefined,
  yearTo: undefined,
  year: undefined,
  ratingFrom: undefined,
  ratingTo: undefined,
  platforms: [],
  status: undefined,
  season: undefined,
  seasonYear: undefined,
  animeFormat: undefined,
};

export const INITIAL_SEARCH_STATE: SearchState = {
  query: '',
  type: 'ALL',
  filters: INITIAL_SEARCH_FILTERS,
  sort: {
    sortBy: 'popularity',
    sortOrder: 'desc',
  },
  page: 1,
  limit: 20,
};

/**
 * Checks if any deep filter is active
 */
export function hasActiveFilters(filters: SearchFilters): boolean {
  return Boolean(
    filters.genres.length > 0 ||
    filters.year !== undefined ||
    filters.yearFrom !== undefined ||
    filters.yearTo !== undefined ||
    filters.ratingFrom !== undefined ||
    filters.ratingTo !== undefined ||
    (filters.platforms && filters.platforms.length > 0) ||
    filters.status !== undefined ||
    filters.season !== undefined ||
    filters.seasonYear !== undefined ||
    filters.animeFormat !== undefined ||
    filters.durationFrom !== undefined ||
    filters.durationTo !== undefined
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

  const f = state.filters;
  if (f) {
    if (f.genres && f.genres.length > 0) {
      params.set('genres', f.genres.join(','));
    }
    if (f.year) params.set('year', String(f.year));
    if (f.yearFrom) params.set('year_from', String(f.yearFrom));
    if (f.yearTo) params.set('year_to', String(f.yearTo));
    if (f.ratingFrom !== undefined) params.set('rating_from', String(f.ratingFrom));
    if (f.ratingTo !== undefined) params.set('rating_to', String(f.ratingTo));
    if (f.status) params.set('status', f.status);
    if (f.platforms && f.platforms.length > 0) {
      params.set('platforms', f.platforms.join(','));
    }
    if (f.season) params.set('season', f.season);
    if (f.seasonYear) params.set('season_year', String(f.seasonYear));
    if (f.animeFormat) params.set('anime_format', f.animeFormat);
  }

  if (state.sort) {
    if (state.sort.sortBy && state.sort.sortBy !== 'popularity') {
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

  const query = sp.get('q') || sp.get('query') || '';
  const rawType = (sp.get('type') || 'ALL').toUpperCase() as MediaTypeCategory;

  const filters: SearchFilters = {
    genres: parseList('genres'),
    year: parseNum('year'),
    yearFrom: parseNum('year_from'),
    yearTo: parseNum('year_to'),
    ratingFrom: parseNum('rating_from'),
    ratingTo: parseNum('rating_to'),
    platforms: parseList('platforms'),
    status: sp.get('status') || undefined,
    season: sp.get('season') || undefined,
    seasonYear: parseNum('season_year'),
    animeFormat: sp.get('anime_format') || undefined,
  };

  const rawSortBy = sp.get('sort_by') as SortByOption;
  const sortBy = (['popularity', 'rating', 'release_date', 'title'].includes(rawSortBy)
    ? rawSortBy
    : 'popularity') as SortByOption;
  const sortOrder = (sp.get('sort_order') === 'asc' ? 'asc' : 'desc') as SortOrderOption;

  return {
    query,
    type: rawType,
    filters,
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

  // Rating
  if (filters.ratingFrom !== undefined && filters.ratingTo !== undefined) {
    chips.push({
      id: 'rating-range',
      label: `Рейтинг: ${filters.ratingFrom} – ${filters.ratingTo}`,
      field: 'ratingFrom',
    });
  } else if (filters.ratingFrom !== undefined) {
    chips.push({
      id: 'rating-from',
      label: `Рейтинг: ${filters.ratingFrom}+`,
      field: 'ratingFrom',
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
      label: `Статус: ${statusObj ? statusObj.label : filters.status}`,
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

  // Sort if not default
  if (sort.sortBy !== 'popularity' || sort.sortOrder !== 'desc') {
    const sortLabel = SORT_OPTIONS.find((s) => s.id === sort.sortBy)?.label || sort.sortBy;
    const orderLabel = sort.sortOrder === 'asc' ? ' (по возрастанию)' : '';
    chips.push({
      id: 'sort',
      label: `${sortLabel}${orderLabel}`,
      field: 'sort',
    });
  }

  return chips;
}
