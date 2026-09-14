export interface MediaSearchResult {
  provider: string;
  externalId: string;
  type: 'MOVIE' | 'TV' | 'ANIME' | 'MANGA' | 'GAME' | 'BOOK' | 'COMIC' | 'MUSIC' | 'BOARD_GAME' | string;
  title: string;
  originalTitle?: string;
  description?: string;
  posterUrl?: string;
  backdropUrl?: string;
  coverUrl?: string;
  releaseDate?: string;
  year?: number;
  genres?: string[];
  rating?: number;
  totalSeasons?: number;
  totalEpisodes?: number;
  platforms?: string[];
}

export interface MediaCastMember {
  id?: string | number;
  name: string;
  originalName?: string;
  character?: string;
  photoUrl?: string;
  order?: number;
  voiceActorName?: string;
  voiceActorPhoto?: string;
}

export interface MediaCrewMember {
  id?: string | number;
  name: string;
  role: string;
  department?: string;
  photoUrl?: string;
}

export interface MediaSeasonInfo {
  seasonNumber: number;
  title: string;
  episodeCount: number;
  airDate?: string;
  posterUrl?: string;
  overview?: string;
}

export interface CriticScoreInfo {
  source: string;
  score: number;
  max: number;
  count?: number;
}

export interface SimilarMediaItem {
  id?: number;
  externalId?: string;
  provider?: string;
  type: string;
  title: string;
  originalTitle?: string;
  posterUrl?: string;
  year?: number;
  rating?: number;
}

export interface MediaVideoItem {
  id?: string | number;
  title?: string;
  url: string;
  site?: string;
  key?: string;
  type?: string;
}

export interface MediaDetailExtended {
  cast?: MediaCastMember[];
  crew?: MediaCrewMember[];
  directors?: string[];
  writers?: string[];
  producers?: string[];
  cinematographers?: string[];
  composers?: string[];
  editors?: string[];
  creators?: string[];
  networks?: string[];
  studios?: string[];
  developers?: string[];
  publishers?: string[];
  platforms?: string[];
  tags?: string[];
  screenshots?: string[];
  website?: string;
  videos?: MediaVideoItem[];
  trailerUrl?: string;
  coverUrl?: string;
  seasons?: MediaSeasonInfo[];
  criticScore?: CriticScoreInfo | null;
  ageRating?: string;
  statusText?: string;
  countries?: string[];
  runtimeMinutes?: number;
  episodesCount?: number;
  durationText?: string;
  sourceText?: string;
  franchise?: string;
  similar?: SimilarMediaItem[];
}

export interface ProviderHealthResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  details?: string;
}

export interface UnifiedSearchFilters {
  query?: string;
  category?: string;
  type?: string;

  // Year & dates
  year?: number;
  yearFrom?: number;
  yearTo?: number;

  // Rating & Votes
  ratingFrom?: number;
  ratingTo?: number;
  votesFrom?: number;

  // Genres & Countries
  genres?: string[];
  countries?: string[];

  // Age & duration
  ageRating?: string;
  durationFrom?: number;
  durationTo?: number;
  seasonsCount?: number;
  episodesFrom?: number;
  episodesTo?: number;

  // Status & Sort
  status?: string;
  sortBy?: 'popularity' | 'rating' | 'votes' | 'release_date' | 'title' | 'relevance';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;

  // Specific to Anime / Manga
  animeFormat?: string;
  season?: string;
  seasonYear?: number;

  // Specific to Games
  platforms?: string[];
  gameMode?: string;
  developer?: string;

  // Specific to Books / Manga
  author?: string;
  publisher?: string;
  language?: string;

  // Specific to Music
  musicEntity?: string;
  artistName?: string;
  albumName?: string;
}

export interface PaginatedResult<T> {
  results: T[];
  hasMore: boolean;
  total?: number;
  page?: number;
}

export interface MediaProvider {
  name: string;
  supportedTypes: string[];
  requiresKey: boolean;
  healthCheck(credentials?: Record<string, any>): Promise<ProviderHealthResult>;
  search(
    query: string,
    credentials?: Record<string, any>,
    page?: number,
    limit?: number,
    filters?: UnifiedSearchFilters
  ): Promise<PaginatedResult<MediaSearchResult> | MediaSearchResult[]>;
  getDetails?(externalId: string, type?: string, credentials?: Record<string, any>): Promise<(MediaSearchResult & MediaDetailExtended) | null>;
  getTrending?(
    type?: string,
    credentials?: Record<string, any>,
    page?: number,
    limit?: number,
    filters?: UnifiedSearchFilters
  ): Promise<PaginatedResult<MediaSearchResult> | MediaSearchResult[]>;
}
