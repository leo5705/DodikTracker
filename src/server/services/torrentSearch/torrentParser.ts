/**
 * TorrentParser: Parses Torznab XML / Prowlarr JSON items into TorrentCandidate DTOs.
 * Extracts resolution, source, codec, infoHash, magnetUri, and matches metadata fields.
 */

import { TorrentCandidate, TorrentQualityInfo, TorrentSearchQuery } from './torrentSearchTypes.ts';
import { validateAndParseMagnet, formatByteSize } from '../../../utils/magnetValidator.ts';

/**
 * Extracts quality metadata from release title string.
 */
export function parseQualityFromTitle(title: string): TorrentQualityInfo {
  const lower = title.toLowerCase();

  // Resolution
  let resolution: TorrentQualityInfo['resolution'] = 'unknown';
  if (/2160p|4k|uhd/i.test(title)) resolution = '2160p';
  else if (/1080p|1080i|fullhd/i.test(title)) resolution = '1080p';
  else if (/720p|hd/i.test(title)) resolution = '720p';
  else if (/480p|576p|sd/i.test(title)) resolution = '480p';

  // Source
  let source: string | undefined;
  if (/bdremux|remux/i.test(title)) source = 'BDremux';
  else if (/\bweb-dl\b|\bwebdl\b/i.test(title)) source = 'WEB-DL';
  else if (/\bwebrip\b|\bweb\b/i.test(title)) source = 'WEBRip';
  else if (/\bbluray\b/i.test(title)) source = 'BluRay';
  else if (/\bbdrip\b|\bbrrip\b/i.test(title)) source = 'BDRip';
  else if (/hdtv|hdtvrip/i.test(title)) source = 'HDTV';
  else if (/dvdrip|dvd/i.test(title)) source = 'DVDRip';

  // Codec
  let codec: string | undefined;
  if (/hevc|h\.?265|x265/i.test(title)) codec = 'HEVC';
  else if (/avc|h\.?264|x264/i.test(title)) codec = 'x264';
  else if (/av1/i.test(title)) codec = 'AV1';

  // Audio Codec
  let audioCodec: string | undefined;
  if (/dts-hd|dtshd/i.test(title)) audioCodec = 'DTS-HD';
  else if (/\bdts\b/i.test(title)) audioCodec = 'DTS';
  else if (/atmos|truehd/i.test(title)) audioCodec = 'TrueHD';
  else if (/eac3|e-ac-3|dd\+|ddp/i.test(title)) audioCodec = 'E-AC-3';
  else if (/ac3|ac-3|dd5\.1/i.test(title)) audioCodec = 'AC3';
  else if (/\baac\b/i.test(title)) audioCodec = 'AAC';
  else if (/\bopus\b/i.test(title)) audioCodec = 'Opus';
  else if (/\bmp3\b/i.test(title)) audioCodec = 'MP3';
  else if (/flac/i.test(title)) audioCodec = 'FLAC';

  const isHDR = /hdr10\+|hdr10|hdr|vision/i.test(title);
  const is10Bit = /10bit|10-bit/i.test(title);

  // Subtitles
  const subtitles: string[] = [];
  if (/\b(rus\s?sub|русские субтитры|rus\s?subs)\b/i.test(title)) subtitles.push('ru');
  if (/\b(eng\s?sub|english subtitles|eng\s?subs)\b/i.test(title)) subtitles.push('en');
  if (/\b(forced|форсированные)\b/i.test(title)) subtitles.push('forced');
  if (subtitles.length === 0 && /\b(sub|subs|субтитры)\b/i.test(title)) subtitles.push('sub');

  return {
    resolution,
    source,
    codec,
    audioCodec,
    isHDR,
    is10Bit,
    subtitles: subtitles.length > 0 ? subtitles : undefined,
  };
}

/**
 * Checks matching keywords between release title and media query.
 */
export function checkMatchedMedia(
  releaseTitle: string,
  query: TorrentSearchQuery
): TorrentCandidate['matchedMedia'] {
  const lower = releaseTitle.toLowerCase();
  const cleanTitle = query.title.toLowerCase();
  const cleanOrig = query.originalTitle?.toLowerCase();

  // Match title or original title
  const matchesTitle =
    (cleanTitle.length > 2 && lower.includes(cleanTitle)) ||
    Boolean(cleanOrig && cleanOrig.length > 2 && lower.includes(cleanOrig));

  // Match year
  const matchesYear = query.year ? lower.includes(String(query.year)) : true;

  // Match season / episode for series
  let matchesSeason: boolean | undefined = undefined;
  let matchesEpisode: boolean | undefined = undefined;

  if (query.seasonNumber !== undefined) {
    const sStr = `s${String(query.seasonNumber).padStart(2, '0')}`;
    const sAlt = `${query.seasonNumber} сезон`;
    const sAlt2 = `season ${query.seasonNumber}`;
    matchesSeason = lower.includes(sStr) || lower.includes(sAlt) || lower.includes(sAlt2);
  }

  if (query.episodeNumber !== undefined && matchesSeason) {
    const epStr = `e${String(query.episodeNumber).padStart(2, '0')}`;
    const epAlt = `${query.episodeNumber} серия`;
    const epAlt2 = `episode ${query.episodeNumber}`;
    matchesEpisode = lower.includes(epStr) || lower.includes(epAlt) || lower.includes(epAlt2);
  }

  return {
    title: matchesTitle,
    year: matchesYear,
    season: matchesSeason,
    episode: matchesEpisode,
  };
}

/**
 * Converts a raw Prowlarr JSON item into TorrentCandidate.
 */
export function parseProwlarrJsonItem(
  item: any,
  query: TorrentSearchQuery
): TorrentCandidate | null {
  if (!item || !item.title) return null;

  const rawTitle = String(item.title).trim();
  const sizeBytes = typeof item.size === 'number' ? item.size : 0;
  const seeders = typeof item.seeders === 'number' ? item.seeders : 0;
  const leechers = typeof item.leechers === 'number' ? item.leechers : 0;

  // Magnet URI, InfoHash, and Download URL resolution
  let infoHash: string | undefined = undefined;
  let magnetUri: string | undefined = undefined;
  const downloadUrl: string | undefined = item.downloadUrl ? String(item.downloadUrl).trim() : undefined;

  // 1. Extract infoHash from item.infoHash if valid hex40 or base32
  if (item.infoHash && typeof item.infoHash === 'string') {
    const cleanHash = item.infoHash.trim();
    if (/^[0-9a-fA-F]{40}$/i.test(cleanHash) || /^[2-7a-zA-Z]{32}$/i.test(cleanHash)) {
      infoHash = cleanHash.toLowerCase();
    }
  }

  // 2. Validate magnetUrl if provided directly
  const rawMagnet = item.magnetUrl || item.magnetUri;
  if (rawMagnet && typeof rawMagnet === 'string') {
    const parsed = validateAndParseMagnet(rawMagnet);
    if (parsed.isValid) {
      magnetUri = parsed.magnetUri;
      if (parsed.infoHash) {
        infoHash = parsed.infoHash.toLowerCase();
      }
    }
  }

  // 3. If magnetUri is not yet resolved, inspect downloadUrl & guid for infoHash or magnet
  if (!magnetUri && downloadUrl) {
    if (downloadUrl.startsWith('magnet:?')) {
      const parsed = validateAndParseMagnet(downloadUrl);
      if (parsed.isValid) {
        magnetUri = parsed.magnetUri;
        if (parsed.infoHash) infoHash = parsed.infoHash.toLowerCase();
      }
    } else {
      const hashMatch = downloadUrl.match(/(?:urn:btih:|info_hash=|hash=|\/)([0-9a-fA-F]{40})/i);
      if (hashMatch && hashMatch[1] && !infoHash) {
        infoHash = hashMatch[1].toLowerCase();
      }
    }
  }

  if (!infoHash && item.guid && typeof item.guid === 'string') {
    if (item.guid.startsWith('magnet:?')) {
      const parsed = validateAndParseMagnet(item.guid);
      if (parsed.isValid) {
        magnetUri = parsed.magnetUri;
        if (parsed.infoHash) infoHash = parsed.infoHash.toLowerCase();
      }
    } else {
      const guidMatch = item.guid.match(/(?:urn:btih:|hash=|\/)([0-9a-fA-F]{40})/i);
      if (guidMatch && guidMatch[1]) {
        infoHash = guidMatch[1].toLowerCase();
      }
    }
  }

  // 4. Synthesize valid magnetUri from infoHash if item had only infoHash/downloadUrl
  if (!magnetUri && infoHash && (/^[0-9a-fA-F]{40}$/i.test(infoHash) || /^[2-7a-zA-Z]{32}$/i.test(infoHash))) {
    magnetUri = `magnet:?xt=urn:btih:${infoHash.toLowerCase()}&dn=${encodeURIComponent(rawTitle)}`;
  }

  const quality = parseQualityFromTitle(rawTitle);
  const matchedMedia = checkMatchedMedia(rawTitle, query);

  return {
    id: infoHash || `prowlarr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: rawTitle,
    infoHash: infoHash ? infoHash.toLowerCase() : undefined,
    magnetUri: magnetUri || undefined,
    sizeBytes,
    formattedSize: formatByteSize(sizeBytes),
    seeders,
    leechers,
    indexer: item.indexer || item.indexerName || 'Torznab',
    publishDate: item.publishDate || item.added || new Date().toISOString(),
    category: Array.isArray(item.categories) ? item.categories.map((c: any) => c.name || c).join(', ') : undefined,
    downloadUrl: item.downloadUrl || undefined,
    quality,
    languages: Array.isArray(item.languages) ? item.languages : undefined,
    matchedMedia,
    score: 0, // Scorer will assign numerical score
  };
}
