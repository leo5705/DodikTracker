/**
 * Helper utilities for stable keys and deduplication across Dodik Music
 */

export function getStableTrackBaseKey(track: any): string {
  if (!track) return 'track-fallback';

  // Internal track with numeric or DB ID
  if (track.id !== undefined && track.id !== null) {
    const idStr = String(track.id).trim();
    if (idStr && idStr !== '0' && idStr !== 'undefined' && idStr !== 'null') {
      if (idStr.startsWith('yt_')) {
        return `yt-tr-${idStr.replace(/^yt_/, '')}`;
      }
      return `dodik-tr-${idStr}`;
    }
  }

  // External track video ID or providerTrackId
  const rawVideoId = track.videoId || track.providerTrackId;
  if (rawVideoId) {
    const cleanId = String(rawVideoId).replace(/^yt_/, '').trim();
    if (cleanId) {
      return `yt-tr-${cleanId}`;
    }
  }

  // Title and artist fallback
  const title = (track.title || track.name || '').trim().toLowerCase();
  const artist = (track.artist || track.artistName || '').trim().toLowerCase();
  if (title || artist) {
    return `meta-tr-${title}-${artist}`;
  }

  return 'track-fallback';
}

export function getStableTrackKey(track: any, index?: number): string {
  const baseKey = getStableTrackBaseKey(track);
  return index !== undefined ? `${baseKey}-${index}` : baseKey;
}

export function getStableArtistBaseKey(art: any): string {
  if (!art) return 'artist-fallback';

  if (art.id !== undefined && art.id !== null) {
    const idStr = String(art.id).trim();
    if (idStr && idStr !== '0') {
      if (idStr.startsWith('yt_') || idStr.startsWith('UC')) {
        return `yt-art-${idStr.replace(/^yt_/, '')}`;
      }
      return `dodik-art-${idStr}`;
    }
  }

  const providerId = art.providerArtistId || art.externalArtistId;
  if (providerId) {
    const cleanId = String(providerId).replace(/^yt_/, '').trim();
    if (cleanId) {
      return `yt-art-${cleanId}`;
    }
  }

  const name = (art.stageName || art.name || '').trim().toLowerCase();
  if (name) {
    return `meta-art-${name}`;
  }

  return 'artist-fallback';
}

export function getStableArtistKey(art: any, index?: number): string {
  const baseKey = getStableArtistBaseKey(art);
  return index !== undefined ? `${baseKey}-${index}` : baseKey;
}

export function getStableReleaseBaseKey(rel: any): string {
  if (!rel) return 'release-fallback';

  if (rel.id !== undefined && rel.id !== null) {
    const idStr = String(rel.id).trim();
    if (idStr && idStr !== '0') {
      if (idStr.startsWith('yt_') || idStr.startsWith('MPRE')) {
        return `yt-rel-${idStr.replace(/^yt_/, '')}`;
      }
      return `dodik-rel-${idStr}`;
    }
  }

  const providerId = rel.providerReleaseId || rel.externalReleaseId;
  if (providerId) {
    const cleanId = String(providerId).replace(/^yt_/, '').trim();
    if (cleanId) {
      return `yt-rel-${cleanId}`;
    }
  }

  const title = (rel.title || '').trim().toLowerCase();
  const artist = (rel.artist || rel.artistName || '').trim().toLowerCase();
  if (title || artist) {
    return `meta-rel-${title}-${artist}`;
  }

  return 'release-fallback';
}

export function getStableReleaseKey(rel: any, index?: number): string {
  const baseKey = getStableReleaseBaseKey(rel);
  return index !== undefined ? `${baseKey}-${index}` : baseKey;
}

/**
 * Deduplicate tracks in an array using stable track identity
 */
export function dedupeTracks<T>(tracks: T[], customKeyFn?: (item: T, idx: number) => string): T[] {
  if (!Array.isArray(tracks)) return [];
  const seen = new Set<string>();
  const result: T[] = [];

  tracks.forEach((item, idx) => {
    if (!item) return;
    const key = customKeyFn ? customKeyFn(item, idx) : getStableTrackBaseKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  });

  return result;
}

/**
 * Deduplicate artists in an array using stable artist identity
 */
export function dedupeArtists<T>(artists: T[]): T[] {
  if (!Array.isArray(artists)) return [];
  const seen = new Set<string>();
  const result: T[] = [];

  artists.forEach((item) => {
    if (!item) return;
    const key = getStableArtistBaseKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  });

  return result;
}

/**
 * Deduplicate releases in an array using stable release identity
 */
export function dedupeReleases<T>(releases: T[]): T[] {
  if (!Array.isArray(releases)) return [];
  const seen = new Set<string>();
  const result: T[] = [];

  releases.forEach((item) => {
    if (!item) return;
    const key = getStableReleaseBaseKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  });

  return result;
}
