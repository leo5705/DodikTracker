export type AudioQuality = 'low' | 'standard' | 'high' | 'maximum';

export type PlaybackSourceType = 'direct_audio' | 'youtube';

export interface ResolvedPlaybackSource {
  trackId: string;
  sourceType: PlaybackSourceType;
  streamUrl?: string | null;
  videoId?: string | null;
  mimeType?: string | null;
  bitrate?: number | null;
  quality?: AudioQuality | null;
  expiresAt?: string | null;
  isSeekable?: boolean;
  duration?: number | null;
}

export type PlaybackErrorCode =
  | 'TRACK_NOT_FOUND'
  | 'PLAYBACK_NOT_AVAILABLE'
  | 'PLAYBACK_RESOLUTION_FAILED'
  | 'PLAYBACK_SOURCE_EXPIRED';

export class PlaybackError extends Error {
  code: PlaybackErrorCode;
  statusCode: number;

  constructor(code: PlaybackErrorCode, message: string, statusCode: number = 422) {
    super(message);
    this.name = 'PlaybackError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
