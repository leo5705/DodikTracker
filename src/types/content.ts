export type ContentType =
  | 'MOVIE'
  | 'TV'
  | 'ANIME'
  | 'MANGA'
  | 'GAME'
  | 'BOOK'
  | 'COMIC'
  | 'MUSIC';

export interface ContentPerson {
  id?: string | number;
  name: string;
  originalName?: string;
  role?: string;
  character?: string;
  image?: string;
  url?: string;
}

export interface ContentSeasonEpisode {
  id?: number | string;
  episodeNumber: number;
  title?: string;
  overview?: string;
  airDate?: string;
  stillUrl?: string;
  duration?: number | string;
  watched?: boolean;
}

export interface ContentSeason {
  id?: number | string;
  seasonNumber: number;
  title?: string;
  overview?: string;
  posterUrl?: string;
  airDate?: string;
  episodeCount?: number;
  episodes?: ContentSeasonEpisode[];
}

export interface ContentTrack {
  id?: number | string;
  trackNumber: number;
  title: string;
  duration?: string | number;
  previewUrl?: string;
  artists?: string[];
  diskNumber?: number;
}

export interface ContentRelation {
  id: number | string;
  mediaId?: number;
  title: string;
  type: string;
  relationType: string; // 'ADAPTATION' | 'PREQUEL' | 'SEQUEL' | 'SIDE_STORY' | 'PARENT' | 'CHARACTER' | 'OTHER'
  relationLabel?: string;
  posterUrl?: string;
  year?: number;
}

export interface ContentVideo {
  id?: string | number;
  name: string;
  title?: string;
  url?: string;
  embedUrl?: string;
  key?: string;
  site?: string;
  type?: string;
  thumbnailUrl?: string;
  language?: string;
  official?: boolean;
  publishedAt?: string;
}

export interface ContentImage {
  id?: string | number;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  caption?: string;
}

export interface ContentReview {
  id: number;
  userId: number;
  user?: {
    id: number;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  score?: number;
  rating?: number;
  title?: string;
  content: string;
  containsSpoilers?: boolean;
  likesCount?: number;
  isLiked?: boolean;
  userReaction?: string | null;
  reactions?: Record<string, number>;
  createdAt: string;
  updatedAt?: string;
}

export interface ContentCriticScore {
  score: number;
  maxScore?: number;
  source: string;
  url?: string;
}

export interface ContentDodikRating {
  averageRating: number | null;
  ratingCount: number;
  distribution?: Record<string, number> | Record<number, number>;
  userRating?: number | null;
}

export interface ContentExternalRating {
  source: string;
  score: number;
  max?: number;
}

export interface ContentUserTracking {
  id?: number;
  status?: string;
  score?: number;
  rating?: number;
  progress?: number;
  progressTotal?: number;
  isFavorite?: boolean;
  notes?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface UnifiedContentItem {
  id: number | string;
  mediaId?: number;
  type: ContentType;
  title: string;
  originalTitle?: string;
  description?: string;
  tagline?: string;
  posterUrl?: string;
  backdropUrl?: string;
  releaseDate?: string;
  year?: number;
  ageRating?: string;
  genres?: Array<{ id?: string | number; name: string }> | string[];
  tags?: string[];
  countries?: string[];
  language?: string;
  originalLanguage?: string;
  status?: string;
  statusText?: string;
  duration?: number;
  durationText?: string;
  website?: string;
  provider?: string;
  externalId?: string;

  // Ratings
  rating?: number; // 0-10
  ratingCount?: number;
  criticScore?: ContentCriticScore;
  dodikRating?: ContentDodikRating;
  externalRatings?: ContentExternalRating[];
  trailerUrl?: string;

  // Metadata specific to categories
  directors?: ContentPerson[];
  writers?: ContentPerson[];
  producers?: ContentPerson[];
  composers?: ContentPerson[];
  cinematographers?: ContentPerson[];
  creators?: ContentPerson[];
  authors?: ContentPerson[];
  artists?: ContentPerson[];
  mangaka?: ContentPerson[];
  cast?: ContentPerson[];
  studios?: Array<{ id?: string | number; name: string; url?: string; image?: string }>;
  publishers?: Array<{ id?: string | number; name: string; url?: string; image?: string }>;
  developers?: Array<{ id?: string | number; name: string; url?: string; image?: string }>;
  platforms?: string[];
  requirements?: {
    minimum?: string;
    recommended?: string;
  };
  achievements?: Array<{ id?: string | number; name: string; description?: string; icon?: string; percent?: number }>;
  networks?: Array<{ id?: string | number; name: string }>;
  labels?: Array<{ id?: string | number; name: string }>;

  // Numerical/Specific metadata
  budget?: number | string;
  boxOffice?: number | string;
  totalSeasons?: number;
  totalEpisodes?: number;
  totalChapters?: number;
  totalVolumes?: number;
  totalPages?: number;
  isbn?: string;
  format?: string; // TV, Movie, OVA, ONA, Album, Single, EP
  seasonYear?: string;
  sourceMaterial?: string;
  demographics?: string[];

  // Sub-items
  seasons?: ContentSeason[];
  tracks?: ContentTrack[];
  relations?: ContentRelation[];
  screenshots?: ContentImage[];
  videos?: ContentVideo[];
  similar?: any[];

  // User state
  userTracking?: ContentUserTracking;
}
