/**
 * TorrentFileSelector: Deterministic helper for selecting the correct video file
 * index from multi-file torrents (movies & series episode packs).
 * Ignores samples/trailers/promos and accurately matches season/episode numbers.
 */

import { isVideoFile } from '../../../utils/magnetValidator.ts';

export interface TorrentFileItem {
  index: number;
  name: string;
  path?: string;
  sizeBytes?: number;
}

export interface FileSelectionOptions {
  mediaType?: 'movie' | 'series' | string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface FileSelectionResult {
  selectedFile: TorrentFileItem | null;
  selectedIndex: number; // Defaults to 0 if no files found
  reason: string;
  totalVideoFilesFound: number;
}

/**
 * Checks if a filename is a sample, trailer, preview, or promo clip.
 */
export function isSampleFile(fileName: string): boolean {
  if (!fileName) return false;
  return /sample|trailer|preview|promo|bonus|extras|featurette/i.test(fileName);
}

/**
 * Deterministically selects the best video file item from a torrent file list.
 */
export function selectBestVideoFile(
  files: TorrentFileItem[],
  options: FileSelectionOptions = {}
): FileSelectionResult {
  if (!Array.isArray(files) || files.length === 0) {
    return { selectedFile: null, selectedIndex: 0, reason: 'Список файлов пуст', totalVideoFilesFound: 0 };
  }

  // 1. Filter playable video files
  const videoFiles = files.filter((f) => {
    const fn = f.path || f.name;
    return isVideoFile(fn);
  });

  if (videoFiles.length === 0) {
    // Fallback: pick first file if no video extensions recognized
    return {
      selectedFile: files[0],
      selectedIndex: files[0].index,
      reason: 'Видеофайлы не найдены по расширению, выбран первый файл',
      totalVideoFilesFound: 0,
    };
  }

  // 2. Exclude samples / trailers
  const mainVideoFiles = videoFiles.filter((f) => !isSampleFile(f.path || f.name));
  const candidatePool = mainVideoFiles.length > 0 ? mainVideoFiles : videoFiles;

  const { mediaType, seasonNumber, episodeNumber } = options;

  // 3. Series / Episode matching
  if ((mediaType === 'series' || seasonNumber !== undefined) && episodeNumber !== undefined) {
    const sStr = seasonNumber !== undefined ? String(seasonNumber).padStart(2, '0') : '';
    const eStr = String(episodeNumber).padStart(2, '0');

    // Regex patterns for episode matching
    const epPatterns: RegExp[] = [
      // S02E05 or s2e5 or s02.e05 or s02_e05
      new RegExp(`s${sStr || '\\d+'}[\._\\s-]*e${eStr}\\b`, 'i'),
      // 2x05 or 02x05
      new RegExp(`\\b${seasonNumber !== undefined ? seasonNumber : '\\d+'}x${eStr}\\b`, 'i'),
      // E05 or e05
      new RegExp(`\\be${eStr}\\b`, 'i'),
      // 05.mkv or _05.mp4 or - 05 -
      new RegExp(`[\\._\\s-]${eStr}[\\._\\s-]`, 'i'),
      // Ep 05 or Episode 05 or 05 серия
      new RegExp(`(ep|episode|серия|серии)[\\._\\s-]*${episodeNumber}\\b`, 'i'),
    ];

    for (const pattern of epPatterns) {
      const epMatches = candidatePool.filter((f) => pattern.test(f.path || f.name));
      if (epMatches.length > 0) {
        // If multiple matches (e.g. 720p & 1080p), pick largest
        const bestEp = epMatches.reduce((prev, cur) => ((cur.sizeBytes || 0) > (prev.sizeBytes || 0) ? cur : prev));
        return {
          selectedFile: bestEp,
          selectedIndex: bestEp.index,
          reason: `Точное совпадение серии S${seasonNumber || 1}E${eStr} (${bestEp.name})`,
          totalVideoFilesFound: videoFiles.length,
        };
      }
    }
  }

  // 4. Movie or Fallback: Pick largest non-sample video file
  const largestVideo = candidatePool.reduce((prev, cur) => ((cur.sizeBytes || 0) > (prev.sizeBytes || 0) ? cur : prev));

  return {
    selectedFile: largestVideo,
    selectedIndex: largestVideo.index,
    reason: `Выбран основной (наибольший) видеофайл: ${largestVideo.name}`,
    totalVideoFilesFound: videoFiles.length,
  };
}
