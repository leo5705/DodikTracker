import { PlaybackResolver } from './PlaybackResolver.ts';
import { ResolvedPlaybackSource, AudioQuality, PlaybackError } from './types.ts';
import path from 'path';

export class DirectAudioPlaybackResolver implements PlaybackResolver {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || process.env.PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '');
  }

  public async resolve(
    track: any,
    options?: { quality?: AudioQuality }
  ): Promise<ResolvedPlaybackSource> {
    const quality = options?.quality || 'standard';
    const rawAudio = track.audioFile || track.audioUrl || track.playbackUrl;

    if (!rawAudio || typeof rawAudio !== 'string' || !rawAudio.trim()) {
      throw new PlaybackError(
        'PLAYBACK_NOT_AVAILABLE',
        'Track has no direct audio file configured',
        422
      );
    }

    let cleanUrl = rawAudio.trim();

    // If it's just a file name (e.g. "song_123.mp3"), prefix with /uploads/audio/
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('/')) {
      if (cleanUrl.startsWith('uploads/')) {
        cleanUrl = '/' + cleanUrl;
      } else {
        cleanUrl = '/uploads/audio/' + cleanUrl;
      }
    }

    // Prepend base URL if available and cleanUrl is relative
    let fullStreamUrl = cleanUrl;
    if (this.baseUrl && cleanUrl.startsWith('/')) {
      fullStreamUrl = `${this.baseUrl}${cleanUrl}`;
    }

    // Determine MIME type
    const ext = path.extname(cleanUrl.split('?')[0]).toLowerCase();
    let mimeType = 'audio/mpeg';
    if (ext === '.wav') mimeType = 'audio/wav';
    else if (ext === '.flac') mimeType = 'audio/flac';
    else if (ext === '.ogg') mimeType = 'audio/ogg';
    else if (ext === '.m4a' || ext === '.aac') mimeType = 'audio/aac';
    else if (ext === '.webm') mimeType = 'audio/webm';

    return {
      trackId: String(track.id),
      sourceType: 'direct_audio',
      streamUrl: fullStreamUrl,
      videoId: null,
      mimeType,
      bitrate: 320, // Standard high quality for uploaded MP3s
      quality,
      expiresAt: null, // Direct static audio files do not expire
      isSeekable: true,
      duration: track.duration ?? null,
    };
  }
}
