/**
 * Unified Media Image Service & Normalizer
 * Handles TMDB, AniList, OpenLibrary, RAWG, Kinopoisk, and custom uploads.
 * Provides fallback category badges/placeholders when no image is available.
 */

export type MediaImageSize = 'thumb' | 'poster' | 'backdrop' | 'original';

export function normalizeMediaImage(
  url?: string | null,
  options?: {
    size?: MediaImageSize;
    provider?: string;
    type?: string;
    useProxy?: boolean;
  }
): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return null;
  }

  const clean = url.trim();
  const size = options?.size || 'poster';

  // 1. TMDB relative paths (e.g. /qJ2tW6WMUDux911r6m7haRef0WH.jpg)
  if (clean.startsWith('/') && !clean.startsWith('//')) {
    const tmdbSize =
      size === 'thumb' ? 'w185' : size === 'backdrop' ? 'w1280' : size === 'original' ? 'original' : 'w500';
    return `https://image.tmdb.org/t/p/${tmdbSize}${clean}`;
  }

  // 2. OpenLibrary covers
  if (clean.includes('covers.openlibrary.org')) {
    const letter = size === 'thumb' ? 'S' : size === 'backdrop' || size === 'original' ? 'L' : 'M';
    return clean.replace(/-[SML]\.jpg$/i, `-${letter}.jpg`);
  }

  // 3. RAWG images: media.rawg.io
  if (clean.includes('media.rawg.io') && size === 'thumb' && clean.includes('/media/games/')) {
    return clean.replace('/media/games/', '/media/crop/600/400/games/');
  }

  // 4. Kinopoisk or domains with strict hotlink protection
  if (clean.includes('kinopoisk.ru') || clean.includes('kp.yandex.net') || options?.useProxy) {
    return `/api/proxy/image?url=${encodeURIComponent(clean)}`;
  }

  return clean;
}

export function getFallbackCategoryIcon(type?: string): string {
  switch (type?.toUpperCase()) {
    case 'MOVIE':
      return '🎬';
    case 'TV':
      return '📺';
    case 'ANIME':
      return '⛩️';
    case 'MANGA':
      return '📖';
    case 'GAME':
      return '🎮';
    case 'BOOK':
      return '📚';
    case 'COMIC':
      return '💥';
    default:
      return '✨';
  }
}
