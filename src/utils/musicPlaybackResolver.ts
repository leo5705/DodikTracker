/**
 * Universal playback source resolution for Dodik Tracker music system.
 * Resolves whether a track is playable, what playback engine should handle it,
 * and extracts validated media URLs or YouTube video IDs.
 */

export interface PlaybackSourceResolution {
  playable: boolean;
  sourceType: 'dodik' | 'youtube' | 'external' | 'none';
  url?: string;
  videoId?: string;
  reason?: 'OK' | 'NO_PLAYBACK_SOURCE' | 'EXPLICITLY_UNPLAYABLE' | 'EMPTY_TRACK';
}

export function extractYouTubeVideoId(urlOrId?: string | null): string | null {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const str = urlOrId.trim();

  // If prefixed with yt_
  if (str.startsWith('yt_')) {
    const clean = str.replace(/^yt_/, '').trim();
    return clean.length >= 5 ? clean : null;
  }

  // If prefixed with youtube:
  if (str.startsWith('youtube:')) {
    const clean = str.replace(/^youtube:/, '').trim();
    return clean.length >= 5 ? clean : null;
  }

  // If standard 11-char YouTube ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  // If standard YouTube URL format
  try {
    const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    if (match && match[1]) {
      return match[1];
    }
  } catch {
    // Ignore regex error
  }

  return null;
}

/**
 * Universal Playback Resolver for all Music Player components, queues, and playlists.
 */
export function resolvePlaybackSource(track: any): PlaybackSourceResolution {
  if (!track || typeof track !== 'object') {
    return {
      playable: false,
      sourceType: 'none',
      reason: 'EMPTY_TRACK',
    };
  }

  // 1. Explicit unplayable flag (e.g. metadata-only track)
  if (track.playable === false) {
    return {
      playable: false,
      sourceType: 'none',
      reason: 'EXPLICITLY_UNPLAYABLE',
    };
  }

  const rawAudioFile = typeof track.audioFile === 'string' ? track.audioFile.trim() : typeof track.audio_file === 'string' ? track.audio_file.trim() : '';
  const rawAudioUrl = typeof track.audioUrl === 'string' ? track.audioUrl.trim() : typeof track.audio_url === 'string' ? track.audio_url.trim() : '';
  const rawPlaybackUrl = typeof track.playbackUrl === 'string' ? track.playbackUrl.trim() : typeof track.playback_url === 'string' ? track.playback_url.trim() : '';
  const rawId = typeof track.id === 'string' ? track.id.trim() : '';
  const rawSlug = typeof track.slug === 'string' ? track.slug.trim() : '';
  const rawVideoId = typeof track.videoId === 'string' ? track.videoId.trim() : typeof track.video_id === 'string' ? track.video_id.trim() : '';
  const rawProviderTrackId = typeof track.providerTrackId === 'string' ? track.providerTrackId.trim() : typeof track.provider_track_id === 'string' ? track.provider_track_id.trim() : '';
  const rawYtUrl = typeof track.youtubeUrl === 'string' ? track.youtubeUrl.trim() : typeof track.youtube_url === 'string' ? track.youtube_url.trim() : '';

  // 2. Check for YouTube videoId across all possible fields
  let foundVideoId: string | null = null;

  if (rawVideoId) {
    foundVideoId = extractYouTubeVideoId(rawVideoId) || (rawVideoId.length >= 5 ? rawVideoId : null);
  } else if (rawProviderTrackId) {
    foundVideoId = extractYouTubeVideoId(rawProviderTrackId) || (rawProviderTrackId.length >= 5 ? rawProviderTrackId : null);
  } else if (rawAudioFile.startsWith('yt_') || rawAudioFile.startsWith('youtube:')) {
    foundVideoId = extractYouTubeVideoId(rawAudioFile);
  } else if (rawSlug.startsWith('yt_') || rawSlug.startsWith('youtube:')) {
    foundVideoId = extractYouTubeVideoId(rawSlug);
  } else if (rawId.startsWith('yt_') || rawId.startsWith('youtube:')) {
    foundVideoId = extractYouTubeVideoId(rawId);
  } else if (rawYtUrl) {
    foundVideoId = extractYouTubeVideoId(rawYtUrl);
  } else if (rawAudioUrl.startsWith('yt_') || rawAudioUrl.startsWith('youtube:') || rawAudioUrl.includes('youtube.com') || rawAudioUrl.includes('youtu.be')) {
    foundVideoId = extractYouTubeVideoId(rawAudioUrl);
  } else if (rawPlaybackUrl.startsWith('yt_') || rawPlaybackUrl.startsWith('youtube:') || rawPlaybackUrl.includes('youtube.com') || rawPlaybackUrl.includes('youtu.be')) {
    foundVideoId = extractYouTubeVideoId(rawPlaybackUrl);
  }

  if (foundVideoId) {
    return {
      playable: true,
      sourceType: 'youtube',
      videoId: foundVideoId,
      url: `https://www.youtube.com/watch?v=${foundVideoId}`,
      reason: 'OK',
    };
  }

  // 3. Check for direct audio file URL (for HTML5 <audio>)
  const directCandidate = rawAudioFile || rawAudioUrl || rawPlaybackUrl;
  if (directCandidate && !directCandidate.startsWith('yt_') && !directCandidate.startsWith('youtube:')) {
    let cleanUrl = directCandidate;
    if (
      !cleanUrl.startsWith('http://') &&
      !cleanUrl.startsWith('https://') &&
      !cleanUrl.startsWith('/') &&
      !cleanUrl.startsWith('blob:') &&
      !cleanUrl.startsWith('data:')
    ) {
      cleanUrl = '/' + cleanUrl;
    }

    const isExternal = track.source === 'external' || cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://');

    return {
      playable: true,
      sourceType: isExternal ? 'external' : 'dodik',
      url: cleanUrl,
      reason: 'OK',
    };
  }

  // 4. No valid audio source
  return {
    playable: false,
    sourceType: 'none',
    reason: 'NO_PLAYBACK_SOURCE',
  };
}
