/**
 * Magnet URI validation & parsing utility for Dodik Tracker Watch Party.
 * Strictly verifies schema, infoHash format (hex40/base32), parameters, and rejects malicious schemes.
 */

export interface ParsedMagnetUri {
  isValid: boolean;
  magnetUri: string;
  infoHash?: string;
  displayName?: string;
  trackers: string[];
  error?: string;
}

const HEX_40_REGEX = /^[0-9a-fA-F]{40}$/;
const BASE32_32_REGEX = /^[2-7a-zA-Z]{32}$/;
const FORBIDDEN_SCHEMES = ['javascript:', 'data:', 'blob:', 'file:', 'vbscript:'];

/**
 * Validates and safely parses a magnet URI.
 */
export function validateAndParseMagnet(rawUri: string | null | undefined): ParsedMagnetUri {
  if (!rawUri || typeof rawUri !== 'string') {
    return { isValid: false, magnetUri: '', trackers: [], error: 'Ссылка magnet не указана' };
  }

  const trimmed = rawUri.trim();
  const lower = trimmed.toLowerCase();

  // 1. Reject non-magnet or dangerous schemes immediately
  for (const scheme of FORBIDDEN_SCHEMES) {
    if (lower.startsWith(scheme)) {
      return { isValid: false, magnetUri: trimmed, trackers: [], error: `Запрещённая схема URI: ${scheme}` };
    }
  }

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return { isValid: false, magnetUri: trimmed, trackers: [], error: 'Обычный HTTP/HTTPS URL не является magnet-ссылкой' };
  }

  if (!lower.startsWith('magnet:?')) {
    return { isValid: false, magnetUri: trimmed, trackers: [], error: 'URI должен начинаться с magnet:?' };
  }

  // 2. Length check
  if (trimmed.length < 20) {
    return { isValid: false, magnetUri: trimmed, trackers: [], error: 'Слишком короткая magnet-ссылка' };
  }
  if (trimmed.length > 8192) {
    return { isValid: false, magnetUri: trimmed, trackers: [], error: 'Превышена максимальная длина magnet-ссылки' };
  }

  try {
    const queryString = trimmed.slice(8); // remove 'magnet:?'
    const params = new URLSearchParams(queryString);

    // 3. Find and validate exact topic (xt=urn:btih:...)
    const xtList = params.getAll('xt');
    let infoHash: string | undefined;

    for (const xt of xtList) {
      const match = xt.match(/^urn:btih:([a-zA-Z0-9]+)$/i);
      if (match && match[1]) {
        const candidate = match[1];
        if (HEX_40_REGEX.test(candidate) || BASE32_32_REGEX.test(candidate)) {
          infoHash = candidate.toLowerCase();
          break;
        }
      }
    }

    if (!infoHash) {
      return {
        isValid: false,
        magnetUri: trimmed,
        trackers: [],
        error: 'В magnet-ссылке отсутствует валидный xt=urn:btih (хэш торрента)',
      };
    }

    // 4. Extract display name (dn)
    const dn = params.get('dn') || undefined;
    const sanitizedDn = dn ? dn.replace(/[<>"]/g, '').trim() : undefined;

    // 5. Extract trackers (tr)
    const trackers: string[] = [];
    const trList = params.getAll('tr');
    for (const tr of trList) {
      try {
        const trUrl = decodeURIComponent(tr.trim());
        const trLower = trUrl.toLowerCase();
        if (
          (trLower.startsWith('udp://') ||
            trLower.startsWith('http://') ||
            trLower.startsWith('https://') ||
            trLower.startsWith('wss://') ||
            trLower.startsWith('ws://')) &&
          !trackers.includes(trUrl)
        ) {
          trackers.push(trUrl);
          if (trackers.length >= 20) break; // limit to 20 trackers
        }
      } catch {
        // Skip malformed tracker
      }
    }

    return {
      isValid: true,
      magnetUri: trimmed,
      infoHash,
      displayName: sanitizedDn,
      trackers,
    };
  } catch (err: any) {
    return {
      isValid: false,
      magnetUri: trimmed,
      trackers: [],
      error: `Ошибка разбора magnet-ссылки: ${err?.message || 'Некорректный формат'}`,
    };
  }
}

/**
 * Format raw byte sizes into human-readable strings (e.g. 1.45 GB, 720 MB).
 */
export function formatByteSize(bytes: number): string {
  if (isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const num = bytes / Math.pow(1024, i);
  return `${num.toFixed(i === 0 ? 0 : 1)} ${units[i] || 'B'}`;
}

/**
 * Checks if a file name or extension represents a playable video file in browser.
 */
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.mov', '.ogv', '.ogg', '.m4v', '.avi'];

export function isVideoFile(fileName: string): boolean {
  if (!fileName || typeof fileName !== 'string') return false;
  const lower = fileName.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
