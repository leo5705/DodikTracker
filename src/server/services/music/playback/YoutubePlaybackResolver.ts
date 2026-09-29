import { PlaybackResolver } from './PlaybackResolver.ts';
import { ResolvedPlaybackSource, AudioQuality, PlaybackError } from './types.ts';
import { extractYouTubeVideoId } from '../../../../utils/musicPlaybackResolver.ts';

export class YoutubePlaybackResolver implements PlaybackResolver {
  private resolverBaseUrl: string;

  constructor(resolverUrl?: string) {
    this.resolverBaseUrl = (resolverUrl || process.env.YOUTUBE_RESOLVER_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  }

  public async resolve(
    track: any,
    options?: { quality?: AudioQuality }
  ): Promise<ResolvedPlaybackSource> {
    const quality = options?.quality || 'high';

    // 1. Extract YouTube videoId from track object
    let videoId: string | null = null;
    if (track.videoId) {
      videoId = extractYouTubeVideoId(track.videoId) || track.videoId;
    } else if (track.providerTrackId) {
      videoId = extractYouTubeVideoId(track.providerTrackId) || track.providerTrackId;
    } else if (track.youtubeUrl) {
      videoId = extractYouTubeVideoId(track.youtubeUrl);
    } else if (track.audioFile) {
      videoId = extractYouTubeVideoId(track.audioFile);
    } else if (typeof track.id === 'string') {
      videoId = extractYouTubeVideoId(track.id);
    }

    if (!videoId) {
      throw new PlaybackError(
        'PLAYBACK_NOT_AVAILABLE',
        'No valid YouTube video ID found for this track',
        422
      );
    }

    // 2. Fetch direct stream URL from FastAPI microservice
    const endpoint = `${this.resolverBaseUrl}/api/resolve?videoId=${encodeURIComponent(videoId)}&quality=${quality}`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const errDetail = body?.detail || body?.error || {};
        const code = errDetail.code || (response.status === 404 ? 'TRACK_NOT_FOUND' : 'PLAYBACK_RESOLUTION_FAILED');
        const message = errDetail.message || `YouTube resolver service error (HTTP ${response.status})`;
        throw new PlaybackError(code, message, response.status);
      }

      if (!body || !body.streamUrl) {
        throw new PlaybackError('PLAYBACK_NOT_AVAILABLE', 'Resolver response missing streamUrl', 422);
      }

      // 3. Format into ResolvedPlaybackSource
      const trackIdStr = String(track.id || videoId);

      return {
        trackId: trackIdStr,
        sourceType: 'youtube',
        streamUrl: body.streamUrl,
        videoId: body.videoId || videoId,
        mimeType: body.mimeType || 'audio/webm',
        bitrate: body.bitrate || null,
        quality: body.quality || quality,
        expiresAt: body.expiresAt || null,
        isSeekable: body.isSeekable !== false,
        duration: body.duration ?? track.duration ?? null,
      };
    } catch (err: any) {
      if (err instanceof PlaybackError) {
        throw err;
      }
      throw new PlaybackError(
        'PLAYBACK_RESOLUTION_FAILED',
        `Failed to reach YouTube resolver microservice: ${err.message || 'Network error'}`,
        502
      );
    }
  }
}
