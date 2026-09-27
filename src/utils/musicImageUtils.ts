/**
 * Dodik Tracker - Music Image Resolution Normalizer
 * Provides the highest available crisp image URL for YouTube Music,
 * Google CDN, and internal Dodik uploads with graceful fallbacks.
 */

export type MusicImageSize = 'small' | 'medium' | 'large' | 'original';

export function getBestMusicImageUrl(
  url: string | null | undefined,
  size: MusicImageSize = 'large'
): string {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return '';
  }

  const cleanUrl = url.trim();

  // Internal uploads and data URLs
  if (cleanUrl.startsWith('/') || cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:')) {
    return cleanUrl;
  }

  // 1. Google / YouTube UserContent (lh3.googleusercontent.com, yt3.ggpht.com, etc.)
  if (cleanUrl.includes('googleusercontent.com') || cleanUrl.includes('ggpht.com')) {
    const dim = size === 'small' ? 160 : size === 'medium' ? 320 : size === 'large' ? 544 : 800;

    if (/=w\d+-h\d+[^?#]*/.test(cleanUrl)) {
      return cleanUrl.replace(/=w\d+-h\d+[^?#]*/, `=w${dim}-h${dim}-l90-rj`);
    }
    if (/=s\d+[^?#]*/.test(cleanUrl)) {
      return cleanUrl.replace(/=s\d+[^?#]*/, `=s${dim}-c`);
    }
  }

  // 2. YouTube static video thumbnails
  if (cleanUrl.includes('i.ytimg.com') || cleanUrl.includes('img.youtube.com')) {
    if (size === 'large' || size === 'original') {
      if (cleanUrl.includes('/default.jpg') || cleanUrl.includes('/mqdefault.jpg')) {
        return cleanUrl.replace(/\/(default|mqdefault)\.jpg/, '/hqdefault.jpg');
      }
    }
  }

  return cleanUrl;
}
