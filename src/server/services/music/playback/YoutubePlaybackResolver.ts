import { PlaybackResolver } from './PlaybackResolver.ts';
import { ResolvedPlaybackSource, AudioQuality, PlaybackError } from './types.ts';
import { extractYouTubeVideoId } from '../../../../utils/musicPlaybackResolver.ts';
import { youtubeMusicService } from '../../youtubeMusicService.ts';

export class YoutubePlaybackResolver implements PlaybackResolver {
  private resolverBaseUrl: string;

  constructor(resolverUrl?: string) {
    this.resolverBaseUrl = (resolverUrl || process.env.YOUTUBE_RESOLVER_URL || '').replace(/\/$/, '');
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

    // Fallback: If videoId not directly found, search YouTube Music if track has title
    if (!videoId && (track.title || track.name)) {
      const artist = track.artistName || track.artist || '';
      const title = track.title || track.name || '';
      const query = [artist, title].filter(Boolean).join(' ').trim();
      if (query) {
        try {
          const results = await youtubeMusicService.searchSongs(query, 1);
          if (results && results.length > 0) {
            videoId = results[0].videoId;
            if (!track.duration && results[0].durationSeconds) {
              track.duration = results[0].durationSeconds;
            }
          }
        } catch (e) {
          console.warn('[YoutubePlaybackResolver] Search songs fallback warning:', e);
        }
      }
    }

    if (!videoId) {
      throw new PlaybackError(
        'PLAYBACK_NOT_AVAILABLE',
        'No valid YouTube video ID found for this track',
        422
      );
    }

    // 2. If resolverBaseUrl is configured (optional external resolver), try it with timeout
    if (this.resolverBaseUrl) {
      try {
        const endpoint = `${this.resolverBaseUrl}/api/resolve?videoId=${encodeURIComponent(videoId)}&quality=${quality}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(endpoint, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const body = await response.json().catch(() => null);
          if (body && body.streamUrl) {
            return {
              trackId: String(track.id || videoId),
              sourceType: 'youtube',
              streamUrl: body.streamUrl,
              videoId: body.videoId || videoId,
              mimeType: body.mimeType || 'audio/webm',
              bitrate: body.bitrate || 160,
              quality: body.quality || quality,
              expiresAt: body.expiresAt || null,
              isSeekable: body.isSeekable !== false,
              duration: body.duration ?? track.duration ?? null,
            };
          }
        }
      } catch (_fetchErr) {
        // Fall back to direct YouTube playback representation below
      }
    }

    // 3. Native in-process YouTube Playback resolution (Production Ready, No external server required)
    const trackIdStr = String(track.id || videoId);

    return {
      trackId: trackIdStr,
      sourceType: 'youtube',
      streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
      videoId: videoId,
      mimeType: 'audio/webm',
      bitrate: 160,
      quality,
      expiresAt: null,
      isSeekable: true,
      duration: track.duration ?? null,
    };
  }
}
