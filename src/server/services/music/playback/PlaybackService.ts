import { PlaybackResolver } from './PlaybackResolver.ts';
import { YoutubePlaybackResolver } from './YoutubePlaybackResolver.ts';
import { DirectAudioPlaybackResolver } from './DirectAudioPlaybackResolver.ts';
import { globalPlaybackCache, PlaybackCache } from './PlaybackCache.ts';
import { ResolvedPlaybackSource, AudioQuality, PlaybackError } from './types.ts';
import { extractYouTubeVideoId } from '../../../../utils/musicPlaybackResolver.ts';

export class PlaybackService implements PlaybackResolver {
  private youtubeResolver: YoutubePlaybackResolver;
  private directAudioResolver: DirectAudioPlaybackResolver;
  private cache: PlaybackCache;

  constructor(cache: PlaybackCache = globalPlaybackCache) {
    this.cache = cache;
    this.youtubeResolver = new YoutubePlaybackResolver();
    this.directAudioResolver = new DirectAudioPlaybackResolver();
  }

  /**
   * Determines source type for a given track object
   */
  public detectSourceType(track: any): 'youtube' | 'direct_audio' | 'none' {
    if (!track) return 'none';

    // 1. Check for YouTube indicators
    let foundYtId: string | null = null;
    if (track.videoId) {
      foundYtId = extractYouTubeVideoId(track.videoId) || track.videoId;
    } else if (track.providerTrackId) {
      foundYtId = extractYouTubeVideoId(track.providerTrackId) || track.providerTrackId;
    } else if (track.youtubeUrl) {
      foundYtId = extractYouTubeVideoId(track.youtubeUrl);
    } else if (typeof track.audioFile === 'string' && (track.audioFile.startsWith('yt_') || track.audioFile.startsWith('youtube:'))) {
      foundYtId = extractYouTubeVideoId(track.audioFile);
    } else if (typeof track.id === 'string' && (track.id.startsWith('yt_') || track.id.startsWith('youtube:'))) {
      foundYtId = extractYouTubeVideoId(track.id);
    }

    if (foundYtId) {
      return 'youtube';
    }

    // 2. Check for direct audio indicators
    const directFile = track.audioFile || track.audioUrl || track.playbackUrl;
    if (directFile && typeof directFile === 'string' && directFile.trim() && !directFile.startsWith('yt_')) {
      return 'direct_audio';
    }

    return 'none';
  }

  /**
   * Main resolution method with caching and stampede protection
   */
  public async resolve(
    track: any,
    options?: { quality?: AudioQuality }
  ): Promise<ResolvedPlaybackSource> {
    if (!track) {
      throw new PlaybackError('TRACK_NOT_FOUND', 'Track object is empty or null', 404);
    }

    const quality: AudioQuality = options?.quality || 'high';
    const trackIdStr = String(track.id || track.videoId || 'unknown');

    const sourceType = this.detectSourceType(track);

    if (sourceType === 'none') {
      throw new PlaybackError(
        'PLAYBACK_NOT_AVAILABLE',
        'No valid playback source found for track',
        422
      );
    }

    // Resolve via cache with stampede protection
    const { source, cacheHit } = await this.cache.getOrFetch(
      trackIdStr,
      quality,
      async () => {
        if (sourceType === 'youtube') {
          return await this.youtubeResolver.resolve(track, { quality });
        } else {
          return await this.directAudioResolver.resolve(track, { quality });
        }
      }
    );

    // Structured logging requirement:
    // [music-playback] trackId=123 quality=high sourceType=youtube cache=hit
    console.log(
      `[music-playback] trackId=${trackIdStr} quality=${quality} sourceType=${source.sourceType} cache=${cacheHit ? 'hit' : 'miss'}`
    );

    return source;
  }
}

export const globalPlaybackService = new PlaybackService();
