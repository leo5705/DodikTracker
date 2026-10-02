/**
 * Types & models for Stage 9: Automatic Torrent Source Discovery & TorrServer Integration.
 */

export interface TorrentSearchQuery {
  mediaId?: number | string;
  mediaType: 'movie' | 'series' | 'anime' | string;

  title: string;
  originalTitle?: string;
  year?: number;
  durationMinutes?: number;

  tmdbId?: number;
  imdbId?: string;

  seasonNumber?: number;
  episodeNumber?: number;
}

export interface TorrentQualityInfo {
  resolution: '2160p' | '1080p' | '720p' | '480p' | 'unknown';
  source?: string; // 'WEB-DL', 'BDRip', 'HDRip', 'BDremux', 'WEBRip', 'BluRay', 'HDTV', etc.
  codec?: string; // 'HEVC', 'x264', 'x265', 'AVC', 'AV1', etc.
  audioCodec?: string; // 'AAC', 'DTS', 'AC3', 'E-AC-3', 'FLAC', etc.
  isHDR?: boolean;
  is10Bit?: boolean;
  subtitles?: string[];
}

export interface TorrentCandidate {
  id: string;
  name: string;

  infoHash?: string;
  magnetUri?: string;

  sizeBytes?: number;
  formattedSize?: string;
  estimatedBitrateMbps?: number;
  seedEfficiency?: number;

  seeders: number;
  leechers: number;

  indexer?: string;
  publishDate?: string;
  category?: string;
  downloadUrl?: string;

  quality: TorrentQualityInfo;
  languages?: string[];

  matchedMedia?: {
    title: boolean;
    year: boolean;
    season?: boolean;
    episode?: boolean;
  };

  score?: number; // Computed suitability score (higher = better)
}

export type TorrentSearchStatus =
  | 'SUCCESS'
  | 'NO_RESULTS'
  | 'NO_INDEXERS'
  | 'NO_PLAYABLE_FILES'
  | 'RESULTS_BUT_NO_PLAYABLE_FILE'
  | 'TORRSERVER_UNAVAILABLE'
  | 'TORRSERVER_LOAD_FAILED'
  | 'STREAM_VALIDATION_FAILED'
  | 'PROWLARR_UNAVAILABLE'
  | 'PROWLARR_AUTH_FAILED'
  | 'INVALID_MEDIA_METADATA'
  | 'METADATA_INCOMPLETE'
  | 'SEARCH_ERROR'
  | 'ERROR';

export interface TorrentSearchResult {
  status: TorrentSearchStatus;
  query: TorrentSearchQuery;
  candidates: TorrentCandidate[];
  bestCandidate?: TorrentCandidate;
  totalFound: number;
  executionTimeMs: number;
  error?: string;
  reason?: string;
}

export interface TorrServerStatus {
  isAvailable: boolean;
  version?: string;
  uptimeSeconds?: number;
  activeTorrentsCount?: number;
  error?: string;
}

export interface TorrServerStreamInfo {
  streamUrl: string;
  infoHash: string;
  title: string;
  status: 'PENDING' | 'PRELOADING' | 'READY' | 'ERROR';
  bytesDownloaded?: number;
  downloadSpeed?: number;
  numPeers?: number;
}
