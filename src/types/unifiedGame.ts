export interface UnifiedPlatformRequirements {
  minimum?: string;
  recommended?: string;
}

export interface UnifiedPlatform {
  id: string | number;
  name: string;
  slug?: string;
  releasedAt?: string;
  requirements?: UnifiedPlatformRequirements;
}

export interface UnifiedGenre {
  id: string | number;
  name: string;
  slug?: string;
}

export interface UnifiedDeveloper {
  id: string | number;
  name: string;
  slug: string;
  image?: string;
  backdropUrl?: string;
  description?: string;
  country?: string;
  website?: string;
  gamesCount?: number;
  topGames?: UnifiedGameSummary[];
}

export interface UnifiedPublisher {
  id: string | number;
  name: string;
  slug: string;
  image?: string;
  backdropUrl?: string;
  description?: string;
  country?: string;
  website?: string;
  gamesCount?: number;
  topGames?: UnifiedGameSummary[];
}

export interface UnifiedStore {
  id: string | number;
  name: string;
  url?: string;
  domain?: string;
  storeId?: string;
}

export interface UnifiedScreenshot {
  id: string | number;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  isPrimary?: boolean;
}

export interface UnifiedVideo {
  id: string | number;
  title: string;
  url: string;
  site: 'YouTube' | 'RAWG' | 'Direct' | string;
  key?: string;
  type?: 'Trailer' | 'Teaser' | 'Gameplay' | 'Clip' | string;
  thumbnailUrl?: string;
}

export interface UnifiedDLC {
  id: string | number;
  title: string;
  slug?: string;
  coverUrl?: string;
  releaseDate?: string;
  rating?: number;
  type?: string;
  description?: string;
}

export interface UnifiedCreator {
  id: string | number;
  name: string;
  slug?: string;
  role: string;
  image?: string;
  gamesCount?: number;
}

export interface UnifiedSeries {
  id: string | number;
  name: string;
  slug: string;
  description?: string;
  gamesCount?: number;
  games?: UnifiedGameSummary[];
}

export interface UnifiedGameSummary {
  id: string | number;
  slug: string;
  title: string;
  originalTitle?: string;
  posterUrl?: string;
  backdropUrl?: string;
  coverUrl?: string;
  releaseDate?: string;
  year?: number;
  rating?: number;
  ratingCount?: number;
  metacritic?: number | null;
  genres?: string[];
  platforms?: string[];
  developers?: string[];
  publishers?: string[];
  mediaId?: number;
  isAdult?: boolean;
  ageRating?: string | null;
}

export interface UnifiedGame {
  id: string | number;
  mediaId?: number; // Internal media DB ID if synced
  slug: string;
  title: string;
  originalTitle?: string;
  description?: string;
  releaseDate?: string;
  year?: number;
  rating?: number; // Normalized public rating (0-10 or 0-5)
  rawgRating?: number; // RAWG 0-5 rating
  ratingCount?: number;
  metacritic?: number | null;
  metacriticUrl?: string | null;
  ageRating?: string | null;
  isAdult?: boolean;
  posterUrl?: string;
  backdropUrl?: string;
  coverUrl?: string;
  website?: string | null;
  playtime?: number | null; // Average hours
  multiplayer?: {
    coop?: boolean;
    players?: string;
  } | null;

  genres: UnifiedGenre[];
  tags: string[];
  platforms: UnifiedPlatform[];
  developers: UnifiedDeveloper[];
  publishers: UnifiedPublisher[];
  series?: UnifiedSeries | null;
  dlcs: UnifiedDLC[];
  stores: UnifiedStore[];
  screenshots: UnifiedScreenshot[];
  videos: UnifiedVideo[];
  creators: UnifiedCreator[];
  similar: UnifiedGameSummary[];

  externalIds: {
    rawg?: string | number;
    gmdb?: string | number;
    igdb?: string | number;
  };

  providerMeta: {
    sources: Record<string, 'RAWG' | 'GMDB' | 'LOCAL' | 'BOTH'>;
    lastSyncedAt: string;
    rawgAvailable: boolean;
    gmdbAvailable: boolean;
  };
}

export interface GameAdminDiagnostic {
  internalId: string | number;
  slug: string;
  mediaId?: number;
  externalIds: {
    rawg?: string | number;
    gmdb?: string | number;
  };
  providerHealth: {
    rawg: { ok: boolean; status: string; latencyMs?: number; lastError?: string };
    gmdb: { ok: boolean; status: string; latencyMs?: number; lastError?: string };
  };
  fieldProvenance: Record<string, { source: string; isFallback: boolean; originalValueSnippet?: string }>;
  cacheInfo: {
    isCached: boolean;
    cachedAt?: string;
    expiresAt?: string;
    ttlSecondsRemaining?: number;
  };
  matchingConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  matchingDetails?: string;
  lastSyncedAt: string;
}

export interface GameCatalogFilters {
  query?: string;
  developer?: string;
  publisher?: string;
  genre?: string;
  platform?: string;
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  ratingFrom?: number;
  ratingTo?: number;
  metacriticFrom?: number;
  metacriticTo?: number;
  multiplayer?: boolean;
  sortBy?: 'popularity' | 'rating' | 'metacritic' | 'release_date' | 'name';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
