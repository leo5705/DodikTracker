import {
  UnifiedGame,
  UnifiedGameSummary,
  UnifiedDeveloper,
  UnifiedPublisher,
  UnifiedSeries,
  UnifiedDLC,
  UnifiedScreenshot,
  UnifiedVideo,
  UnifiedStore,
  UnifiedCreator,
  GameCatalogFilters,
} from '../../types/unifiedGame.ts';

export interface ProviderHealthResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  details?: string;
}

export interface RawGameData {
  externalId: string;
  provider: 'RAWG' | 'GMDB';
  slug: string;
  title: string;
  originalTitle?: string;
  description?: string;
  releaseDate?: string;
  year?: number;
  rating?: number;
  ratingCount?: number;
  metacritic?: number | null;
  metacriticUrl?: string | null;
  ageRating?: string | null;
  posterUrl?: string;
  backdropUrl?: string;
  coverUrl?: string;
  website?: string | null;
  playtime?: number | null;
  genres: Array<{ id?: string | number; name: string; slug?: string }>;
  tags: string[];
  platforms: Array<{
    id?: string | number;
    name: string;
    slug?: string;
    releasedAt?: string;
    requirements?: { minimum?: string; recommended?: string };
  }>;
  developers: Array<{
    id?: string | number;
    name: string;
    slug: string;
    image?: string;
  }>;
  publishers: Array<{
    id?: string | number;
    name: string;
    slug: string;
    image?: string;
  }>;
  stores?: Array<{
    id?: string | number;
    name: string;
    url?: string;
    domain?: string;
    storeId?: string;
  }>;
  screenshots?: Array<{
    id?: string | number;
    url: string;
    width?: number;
    height?: number;
  }>;
  videos?: Array<{
    id?: string | number;
    title: string;
    url: string;
    site: string;
    key?: string;
    type?: string;
    thumbnailUrl?: string;
  }>;
  multiplayer?: {
    coop?: boolean;
    players?: string;
  } | null;
}

export interface IGameProvider {
  name: 'RAWG' | 'GMDB';
  healthCheck(credentials?: Record<string, any>): Promise<ProviderHealthResult>;
  getGame(externalId: string, credentials?: Record<string, any>): Promise<RawGameData | null>;
  searchGames(
    query: string,
    filters?: GameCatalogFilters,
    credentials?: Record<string, any>
  ): Promise<{ results: RawGameData[]; total?: number; hasMore: boolean }>;
  getCatalog(
    filters: GameCatalogFilters,
    credentials?: Record<string, any>
  ): Promise<{ results: RawGameData[]; total?: number; hasMore: boolean }>;
  getDeveloper(idOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedDeveloper | null>;
  getPublisher(idOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedPublisher | null>;
  getGamesByDeveloper(
    developerIdOrSlug: string,
    page?: number,
    limit?: number,
    sort?: string,
    credentials?: Record<string, any>
  ): Promise<{ results: RawGameData[]; total?: number; hasMore: boolean }>;
  getGamesByPublisher(
    publisherIdOrSlug: string,
    page?: number,
    limit?: number,
    sort?: string,
    credentials?: Record<string, any>
  ): Promise<{ results: RawGameData[]; total?: number; hasMore: boolean }>;
  getSeries(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedSeries | null>;
  getDLCs(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedDLC[]>;
  getScreenshots(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedScreenshot[]>;
  getVideos(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedVideo[]>;
  getStores(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedStore[]>;
  getCreators(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedCreator[]>;
  getSimilar(gameIdOrSlug: string, credentials?: Record<string, any>): Promise<UnifiedGameSummary[]>;
  getDevelopersList(
    page?: number,
    limit?: number,
    search?: string,
    credentials?: Record<string, any>
  ): Promise<{ results: UnifiedDeveloper[]; total?: number; hasMore: boolean }>;
  getPublishersList(
    page?: number,
    limit?: number,
    search?: string,
    credentials?: Record<string, any>
  ): Promise<{ results: UnifiedPublisher[]; total?: number; hasMore: boolean }>;
}
