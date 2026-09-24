import { ContentVideo } from '../types/content.ts';

export interface ParsedVideoInfo {
  isValid: boolean;
  site: 'YouTube' | 'Vimeo' | 'Dailymotion' | 'Direct' | 'Unknown';
  videoId?: string;
  embedUrl?: string;
  canonicalUrl?: string;
  thumbnailUrl?: string;
  isDirectVideo?: boolean;
}

/**
 * Extracts a clean 11-character YouTube video ID from various YouTube URL formats or keys
 */
export function extractYouTubeVideoId(input?: string | null): string | null {
  if (!input) return null;
  const str = String(input).trim();
  if (!str) return null;

  // 1. Direct 11-char alphanumeric key (e.g., 'dQw4w9WgXcQ')
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  // 2. Standard regex for all known YouTube URL variants (watch, youtu.be, embed, shorts, live, v)
  const ytRegex = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?v=|watch\?.+?&v=))([\w-]{11})/i;
  const match = str.match(ytRegex);
  if (match && match[1] && /^[a-zA-Z0-9_-]{11}$/.test(match[1])) {
    return match[1];
  }

  // 3. Fallback search via URL query parameters
  try {
    if (str.includes('youtube.com') || str.includes('youtu.be')) {
      const urlObj = new URL(str.startsWith('http') ? str : `https://${str}`);
      const vParam = urlObj.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }
      const segments = urlObj.pathname.split('/').filter(Boolean);
      for (const seg of segments) {
        if (/^[a-zA-Z0-9_-]{11}$/.test(seg)) {
          return seg;
        }
      }
    }
  } catch (_e) {}

  return null;
}

/**
 * Validates and extracts secure embed and video details from a video URL or key
 */
export function parseVideo(video?: ContentVideo | string | null): ParsedVideoInfo {
  if (!video) {
    return { isValid: false, site: 'Unknown' };
  }

  const rawUrl = typeof video === 'string' ? video : video.url || '';
  const rawKey = typeof video === 'object' && video.key ? String(video.key).trim() : undefined;
  const customThumb = typeof video === 'object' && video.thumbnailUrl ? video.thumbnailUrl : undefined;

  // 1. Check for YouTube via Key or URL
  const ytId = extractYouTubeVideoId(rawKey) || extractYouTubeVideoId(rawUrl);
  if (ytId) {
    return {
      isValid: true,
      site: 'YouTube',
      videoId: ytId,
      // Official clean embed format with playsinline and rel=0 (avoids Error 153)
      embedUrl: `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&playsinline=1`,
      canonicalUrl: `https://www.youtube.com/watch?v=${ytId}`,
      thumbnailUrl: customThumb || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      isDirectVideo: false,
    };
  }

  // 2. Vimeo Matcher
  if (rawUrl) {
    const vimeoMatch = rawUrl.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/i);
    if (vimeoMatch && vimeoMatch[1]) {
      const vidId = vimeoMatch[1];
      return {
        isValid: true,
        site: 'Vimeo',
        videoId: vidId,
        embedUrl: `https://player.vimeo.com/video/${vidId}?autoplay=1`,
        canonicalUrl: `https://vimeo.com/${vidId}`,
        thumbnailUrl: customThumb,
        isDirectVideo: false,
      };
    }

    // 3. Dailymotion Matcher
    const dmMatch = rawUrl.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/i);
    if (dmMatch && dmMatch[1]) {
      const vidId = dmMatch[1];
      return {
        isValid: true,
        site: 'Dailymotion',
        videoId: vidId,
        embedUrl: `https://www.dailymotion.com/embed/video/${vidId}?autoplay=1`,
        canonicalUrl: `https://www.dailymotion.com/video/${vidId}`,
        thumbnailUrl: customThumb,
        isDirectVideo: false,
      };
    }

    // 4. Direct MP4 / WebM video streams (e.g. RAWG Video CDN)
    if (rawUrl.match(/\.(mp4|webm|m4v)(\?.*)?$/i) || rawUrl.includes('media.rawg.io')) {
      return {
        isValid: true,
        site: 'Direct',
        canonicalUrl: rawUrl,
        embedUrl: rawUrl,
        thumbnailUrl: customThumb,
        isDirectVideo: true,
      };
    }
  }

  return { isValid: false, site: 'Unknown' };
}

/**
 * Returns localized video type badge
 */
export function formatVideoTypeLabel(type?: string): string {
  if (!type) return 'Официальный трейлер';
  const t = type.toLowerCase().trim();

  if (t.includes('gameplay') || t.includes('геймплей')) return 'Геймплейный трейлер';
  if (t.includes('teaser') || t.includes('тизер')) return 'Тизер';
  if (t.includes('trailer') || t.includes('трейлер')) return 'Официальный трейлер';
  if (t.includes('launch') || t.includes('релиз')) return 'Релизный трейлер';
  if (t.includes('announcement') || t.includes('анонс')) return 'Анонсирующий трейлер';
  if (t.includes('pv') || t.includes('promo') || t.includes('промо')) return 'Промо-видео (PV)';
  if (t.includes('clip') || t.includes('клип') || t.includes('фрагмент')) return 'Фрагмент / Клип';
  if (t.includes('featurette') || t.includes('о создании')) return 'О создании';
  if (t.includes('behind') || t.includes('за кадром')) return 'За кадром';

  return type;
}
