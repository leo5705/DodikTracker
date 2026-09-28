export interface TasteProfile {
  userId: number;
  computedAt: number;
  totalSignals: number;
  // Long-term genres with normalized affinity weights [0.0 - 1.0]
  genres: Record<string, { weight: number; count: number; name: string }>;
  // Long-term top artists with weights [0.0 - 1.0]
  artists: Record<string, { weight: number; playCount: number; likeCount: number; skipCount: number; artistId?: number | string }>;
  // Negative signals: Disliked / heavily skipped artists & genres
  negativeArtists: Set<string>;
  negativeGenres: Set<string>;
  // Short-term recent interest (last 20 plays / last 3 days)
  shortTermArtists: string[];
  shortTermGenres: string[];
  recentTrackIds: Set<string>;
  // Preferred duration & explicit profile
  averageDuration: number;
  explicitRatio: number; // 0.0 - 1.0
  // List of favorite track IDs and release IDs
  favoriteTrackIds: Set<string>;
  favoriteReleaseIds: Set<number>;
  subscribedArtistNames: Set<string>;
}

export interface CandidateTrack {
  id: string; // "123" (Dodik) or "yt_xyz" (YouTube)
  trackId?: string; // Compatibility alias
  provider: 'dodik' | 'youtube';
  title: string;
  artistName: string;
  artistId?: string | number | null;
  releaseTitle?: string | null;
  releaseCover?: string | null;
  durationSeconds?: number | null;
  genres?: string[];
  releaseYear?: number | null;
  explicit?: boolean | null;
  listenCount?: number;
  avgScore?: number;
  source: 'favorite' | 'loved_artist' | 'genre_match' | 'recent_session' | 'discovery' | 'transition' | 'underrated' | 'new_release' | 'popular' | 'cold_start';
  sourceReason?: string;
}

export interface ScoredTrack extends CandidateTrack {
  score: number;
  explanation: string;
  shelfTag?: 'forYou' | 'tasteAffinity' | 'discover' | 'recentContext' | 'longTimeNoListen' | 'underrated';
  lastListenedAt?: string;
  listenCountUser?: number;
}

export interface RecommendationArtistItem {
  artistId?: number | string | null;
  provider: 'dodik' | 'youtube';
  stageName: string;
  avatar?: string | null;
  genres?: string[];
  explanation: string;
  topTrack?: ScoredTrack | null;
}

export interface RecommendationReleaseItem {
  releaseId: string | number;
  provider: 'dodik' | 'youtube';
  title: string;
  artistName: string;
  cover?: string | null;
  year?: number | null;
  releaseType?: string;
  explanation?: string;
}

export interface RecommendationResponse {
  isColdStart: boolean;
  forYou: ScoredTrack[];
  tasteAffinity: ScoredTrack[];
  discoverNew: ScoredTrack[];
  recentContext: ScoredTrack[];
  longTimeNoListen: ScoredTrack[];
  underratedGems: ScoredTrack[];
  recommendedArtists: RecommendationArtistItem[];
  continueListening: ScoredTrack[];
  newForYou: RecommendationReleaseItem[];
  popularNow: ScoredTrack[];
}

export interface ForYouResponse {
  isPersonalized: boolean;
  totalSignals: number;
  fallbackReason: 'unauthenticated' | 'insufficient_history' | null;
  tracks: ScoredTrack[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PlaybackInteractionEvent {
  userId: number;
  trackId: string;
  provider?: 'dodik' | 'youtube';
  title: string;
  artistName: string;
  artistId?: string | null;
  releaseTitle?: string | null;
  releaseCover?: string | null;
  durationSeconds?: number | null;
  playedSeconds?: number | null;
  completionRatio?: number | null;
  isCompleted?: boolean;
  isSkipped?: boolean;
  isQuickSkip?: boolean;
  contextSource?: 'manual' | 'recommendation' | 'queue' | 'playlist' | 'radio' | 'album';
  fromTrackId?: string | null;
}
