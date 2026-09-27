import { db } from '../../db/index.ts';
import { musicTracks, artistProfiles, musicReleases } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';

export interface RawParsedTrack {
  artist: string;
  title: string;
  album?: string;
  duration?: number;
  rawLine: string;
}

export interface MatchedTrackDTO {
  kind: 'dodik';
  id: number;
  numericTrackId: number;
  title: string;
  artistName: string;
  artists?: string[];
  artistSlug?: string;
  artistId?: number;
  releaseTitle?: string;
  coverUrl?: string | null;
  duration?: number | null;
  source: 'dodik';
}

export interface ParsedTrackResult {
  rawLine: string;
  artist: string;
  title: string;
  album?: string;
  matched: boolean;
  reason?: string;
  track: MatchedTrackDTO | null;
}

export interface ParsePlaylistResult {
  total: number;
  matchedCount: number;
  unmatchedCount: number;
  tracks: ParsedTrackResult[];
  unmatchedTracks: Array<{ artist: string; title: string; reason: string; rawLine: string }>;
}

/**
 * Normalizes text for comparison:
 * - lowercase
 * - replaces 'ё' with 'е'
 * - normalizes dashes, quotes, and punctuation
 * - removes extra spaces
 */
export function normalizeString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»“”„"'`]/g, '')
    .replace(/[–—−―_]/g, '-')
    .replace(/[\(\)\[\]\{\}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract primary artist tokens from multi-artist string
 * e.g. "Morgenshtern, Элджей feat. Slava Marlow" -> ["morgenshtern", "eldzhey", "slava marlow"]
 */
export function extractArtistTokens(artistStr: string): string[] {
  if (!artistStr) return [];
  const norm = normalizeString(artistStr);
  const parts = norm
    .split(/\s*(?:,|&|\+|\/|x|vs\.?|feat\.?|ft\.?|featuring|с уч\.?|с участием)\s*/gi)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts : [norm];
}

/**
 * Cleans track title by stripping out secondary noise:
 * e.g. "Song (feat. Artist)", "Song [Official Video]", "Song (Remix)", "01. Song", "OST ...", "Live"
 */
export function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let title = rawTitle;
  // Remove leading numbers: "01. ", "1 - ", "[01] ", "1.1 "
  title = title.replace(/^(\[\d+\]|\d+[\.\)\-\]\s]+)/, '');
  // Remove trailing bracketed info like [Official Audio], (Video), (Remix), [OST], (Live), (Explicit)
  title = title.replace(/\s*[\(\[](official\s*(audio|video|music\s*video)|audio|video|lyrics|клип|премьера|hd|hq|18\+|explicit|ost|саундтрек|soundtrack|live|концерт|remix|ремикс|edit|mix|acoustic|акустика|slowed|reverb)[\)\]]/gi, '');
  // Remove feat/ft in brackets
  title = title.replace(/\s*[\(\[](feat\.?|ft\.?|featuring|с уч\.?|с участием)\s+[^\)\]]+[\)\]]/gi, '');
  // Remove feat/ft in title string
  title = title.replace(/\s+(feat\.?|ft\.?|featuring|с уч\.?|с участием)\s+.+$/i, '');
  return title.trim();
}

/**
 * Calculates string similarity (Levenshtein-based Dice coefficient)
 */
export function calculateSimilarity(s1: string, s2: string): number {
  const norm1 = normalizeString(s1);
  const norm2 = normalizeString(s2);
  if (norm1 === norm2) return 1.0;
  if (!norm1 || !norm2) return 0.0;
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const minLen = Math.min(norm1.length, norm2.length);
    const maxLen = Math.max(norm1.length, norm2.length);
    return minLen / maxLen;
  }

  const bigrams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      set.set(bg, (set.get(bg) || 0) + 1);
    }
    return set;
  };

  const bg1 = bigrams(norm1);
  const bg2 = bigrams(norm2);
  let intersection = 0;

  for (const [bg, count1] of bg1.entries()) {
    const count2 = bg2.get(bg) || 0;
    intersection += Math.min(count1, count2);
  }

  const total = (norm1.length - 1) + (norm2.length - 1);
  return total > 0 ? (2 * intersection) / total : 0;
}

/**
 * Parser that extracts track entries from Raw Text, CSV (comma/semicolon/tab), TSV, or JSON
 * Specially tuned for YMusicExport (Яндекс Музыка экспорт) and other playlist tools
 */
export function parseRawInput(content: string): RawParsedTrack[] {
  if (!content || typeof content !== 'string') return [];
  const cleanedContent = content.replace(/^\uFEFF/, '').trim();
  if (!cleanedContent) return [];

  // 1. Try JSON parsing
  if (cleanedContent.startsWith('[') || (cleanedContent.startsWith('{') && cleanedContent.endsWith('}'))) {
    try {
      const parsed = JSON.parse(cleanedContent);
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.tracks)
        ? parsed.tracks
        : Array.isArray(parsed.data)
        ? parsed.data
        : Array.isArray(parsed?.playlist?.tracks)
        ? parsed.playlist.tracks
        : Array.isArray(parsed?.items)
        ? parsed.items
        : [];

      if (items.length > 0) {
        return items
          .map((item: any, idx: number): RawParsedTrack | null => {
            const title = String(
              item.title || item.name || item.track || item.trackName || item['Название'] || item['Название трека'] || item['Трек'] || ''
            ).trim();
            const artist = String(
              item.artist || item.artistName || item.author || item.artists || item['Исполнитель'] || item['Исполнители'] || item['Артист'] || ''
            ).trim();
            const album = item.album || item['Альбом'] ? String(item.album || item['Альбом']).trim() : undefined;
            const duration = typeof item.duration === 'number' ? item.duration : typeof item.durationMs === 'number' ? Math.round(item.durationMs / 1000) : undefined;

            if (!title && !artist) return null;
            return {
              title: title || `Трек ${idx + 1}`,
              artist: artist || '',
              album,
              duration,
              rawLine: artist ? `${artist} - ${title}` : title,
            };
          })
          .filter((t): t is RawParsedTrack => t !== null);
      }
    } catch {
      // Not JSON, continue to CSV/TXT parsing
    }
  }

  // 2. Try CSV / TSV parsing
  const lines = cleanedContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect delimiter from first line
  const firstLine = lines[0];
  const delimiters = [';', '\t', ','];
  let detectedDelim: string | null = null;

  for (const d of delimiters) {
    if (firstLine.includes(d)) {
      const parts = splitCsvLine(firstLine, d).map((p) => normalizeString(p));
      const hasHeaderKeyword = parts.some((p) =>
        ['title', 'track', 'track title', 'song', 'название', 'название трека', 'трек', 'песня', 'artist', 'artists', 'artist name', 'исполнитель', 'исполнители', 'автор', 'артист', 'album', 'альбом'].includes(p)
      );
      if (hasHeaderKeyword) {
        detectedDelim = d;
        break;
      }
    }
  }

  if (detectedDelim) {
    const headerCols = splitCsvLine(lines[0], detectedDelim).map((c) => normalizeString(c));
    let titleIdx = headerCols.findIndex((c) =>
      ['title', 'track', 'track title', 'song', 'название', 'название трека', 'трек', 'песня'].includes(c)
    );
    let artistIdx = headerCols.findIndex((c) =>
      ['artist', 'artists', 'artist name', 'исполнитель', 'исполнители', 'автор', 'артист'].includes(c)
    );
    let albumIdx = headerCols.findIndex((c) => ['album', 'альбом'].includes(c));

    if (titleIdx !== -1 || artistIdx !== -1) {
      if (titleIdx === -1) titleIdx = 0;
      if (artistIdx === -1) artistIdx = 1;

      const results: RawParsedTrack[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const cols = splitCsvLine(line, detectedDelim);
        const rawTitle = (cols[titleIdx] || '').trim();
        const rawArtist = (cols[artistIdx] || '').trim();
        const album = albumIdx !== -1 && cols[albumIdx] ? cols[albumIdx].trim() : undefined;

        if (rawTitle || rawArtist) {
          results.push({
            title: rawTitle || rawArtist,
            artist: rawTitle ? rawArtist : '',
            album,
            rawLine: line,
          });
        }
      }
      if (results.length > 0) return results;
    }
  }

  // 3. Fallback: Parse line-by-line as TXT / TSV / custom format (including YMusicExport text list)
  const results: RawParsedTrack[] = [];
  for (const line of lines) {
    if (!line) continue;

    let artist = '';
    let title = '';
    let album: string | undefined = undefined;

    // Check tab separator first
    if (line.includes('\t')) {
      const parts = line.split('\t').map((p) => p.trim());
      if (parts.length >= 2) {
        artist = parts[0];
        title = parts[1];
        if (parts[2]) album = parts[2];
      }
    } else if (line.includes(';') && !line.includes(' - ')) {
      const parts = splitCsvLine(line, ';').map((p) => p.trim());
      if (parts.length >= 2) {
        artist = parts[0];
        title = parts[1];
        if (parts[2]) album = parts[2];
      }
    } else {
      // Look for dash separators: " - ", " – ", " — ", " : ", " — "
      const dashMatch = line.match(/\s+[\-–—−―]\s+/);
      const colonMatch = line.indexOf(': ');

      if (dashMatch && dashMatch.index !== undefined) {
        artist = line.substring(0, dashMatch.index).trim();
        title = line.substring(dashMatch.index + dashMatch[0].length).trim();
      } else if (colonMatch !== -1) {
        artist = line.substring(0, colonMatch).trim();
        title = line.substring(colonMatch + 2).trim();
      } else {
        title = line.trim();
      }
    }

    // Clean leading numbering like "1. ", "01 - " from artist or title
    artist = artist.replace(/^(\[\d+\]|\d+[\.\)\-\]\s]+)/, '').trim();
    title = title.replace(/^(\[\d+\]|\d+[\.\)\-\]\s]+)/, '').trim();

    // Check if album is in parentheses at the end: "Artist - Title (Album Name)"
    const albumEndMatch = title.match(/\(([^)]+)\)$/);
    if (albumEndMatch && !title.toLowerCase().includes('feat') && !title.toLowerCase().includes('remix') && !title.toLowerCase().includes('live')) {
      album = albumEndMatch[1];
    }

    if (artist || title) {
      results.push({
        artist,
        title: title || artist,
        album,
        rawLine: line,
      });
    }
  }

  return results;
}

/**
 * Split CSV line respecting quotes
 */
function splitCsvLine(line: string, delim: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === delim && !inQuotes) {
      result.push(current.replace(/^["']|["']$/g, '').trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^["']|["']$/g, '').trim());
  return result;
}

/**
 * Matches raw parsed tracks against local published Dodik Tracker catalog.
 * Follows exact hierarchy:
 * 1. Exact match
 * 2. Normalized match (cleaning feat, brackets, punctuation, e/e)
 * 3. Careful fuzzy match with confidence threshold (>= 0.82)
 *
 * CRITICAL: If not found in catalog, it remains "not matched" (no fake tracks created).
 */
export async function matchParsedTracks(rawTracks: RawParsedTrack[]): Promise<ParsePlaylistResult> {
  const parsedResults: ParsedTrackResult[] = [];
  const unmatchedList: Array<{ artist: string; title: string; reason: string; rawLine: string }> = [];

  // Pre-fetch all local published tracks and releases for fast and robust matching
  const allLocalTracks = await db
    .select({
      id: musicTracks.id,
      title: musicTracks.title,
      slug: musicTracks.slug,
      trackNumber: musicTracks.trackNumber,
      audioFile: musicTracks.audioFile,
      duration: musicTracks.duration,
      explicit: musicTracks.explicit,
      listenCount: musicTracks.listenCount,
      artistId: musicTracks.artistId,
      artistName: artistProfiles.stageName,
      artistSlug: artistProfiles.slug,
      releaseId: musicTracks.releaseId,
      releaseTitle: musicReleases.title,
      releaseCover: musicReleases.cover,
      releaseSlug: musicReleases.slug,
    })
    .from(musicTracks)
    .innerJoin(musicReleases, eq(musicTracks.releaseId, musicReleases.id))
    .innerJoin(artistProfiles, eq(musicTracks.artistId, artistProfiles.id))
    .where(eq(musicTracks.status, 'PUBLISHED'));

  for (const item of rawTracks) {
    const rawArtist = item.artist || '';
    const rawTitle = item.title || '';
    const normArtist = normalizeString(rawArtist);
    const normTitle = normalizeString(rawTitle);
    const cleanNormTitle = normalizeString(cleanTitle(rawTitle));
    const artistTokens = extractArtistTokens(rawArtist);

    if (!normTitle && !normArtist) {
      parsedResults.push({
        rawLine: item.rawLine,
        artist: rawArtist,
        title: rawTitle,
        album: item.album,
        matched: false,
        reason: 'Пустая строка или не распознано название трека',
        track: null,
      });
      unmatchedList.push({
        artist: rawArtist,
        title: rawTitle,
        reason: 'Пустая строка или не распознано название трека',
        rawLine: item.rawLine,
      });
      continue;
    }

    let localCandidate: typeof allLocalTracks[0] | null = null;

    // 1. Exact match (Title and Artist)
    localCandidate = allLocalTracks.find((lt) => {
      const ltTitleNorm = normalizeString(lt.title);
      const ltArtistNorm = normalizeString(lt.artistName || '');
      if (normArtist) {
        return ltTitleNorm === normTitle && ltArtistNorm === normArtist;
      }
      return ltTitleNorm === normTitle;
    }) || null;

    // 2. Normalized match with cleaned title and artist tokens
    if (!localCandidate) {
      localCandidate = allLocalTracks.find((lt) => {
        const ltTitleNorm = normalizeString(lt.title);
        const ltCleanTitle = normalizeString(cleanTitle(lt.title));
        const ltArtistNorm = normalizeString(lt.artistName || '');
        const ltArtistTokens = extractArtistTokens(lt.artistName || '');

        const titleMatches =
          ltTitleNorm === normTitle ||
          ltCleanTitle === cleanNormTitle ||
          ltTitleNorm === cleanNormTitle ||
          ltCleanTitle === normTitle;

        if (!titleMatches) return false;

        if (!normArtist) return true;

        // Check if any artist token matches
        const artistMatches =
          ltArtistNorm === normArtist ||
          ltArtistNorm.includes(normArtist) ||
          normArtist.includes(ltArtistNorm) ||
          artistTokens.some((t) => ltArtistTokens.includes(t) || ltArtistNorm.includes(t) || t.includes(ltArtistNorm));

        return artistMatches;
      }) || null;
    }

    // 3. Inverted match (Title - Artist swapped)
    if (!localCandidate && normArtist && normTitle) {
      localCandidate = allLocalTracks.find((lt) => {
        const ltTitleNorm = normalizeString(lt.title);
        const ltArtistNorm = normalizeString(lt.artistName || '');
        return ltTitleNorm === normArtist && ltArtistNorm === normTitle;
      }) || null;
    }

    // 4. Careful fuzzy match (high similarity >= 0.82)
    if (!localCandidate) {
      let bestSim = 0;
      let bestCandidate: typeof allLocalTracks[0] | null = null;

      for (const lt of allLocalTracks) {
        const ltTitleNorm = normalizeString(lt.title);
        const ltCleanTitle = normalizeString(cleanTitle(lt.title));
        const ltArtistNorm = normalizeString(lt.artistName || '');

        const titleSim = Math.max(
          calculateSimilarity(normTitle, ltTitleNorm),
          calculateSimilarity(cleanNormTitle, ltCleanTitle),
          calculateSimilarity(cleanNormTitle, ltTitleNorm)
        );

        if (titleSim >= 0.82) {
          if (normArtist) {
            const artistSim = calculateSimilarity(normArtist, ltArtistNorm);
            const artistHasCommonToken = artistTokens.some((t) => ltArtistNorm.includes(t) || t.includes(ltArtistNorm));
            if (artistSim >= 0.65 || artistHasCommonToken) {
              const combinedScore = titleSim * 0.7 + (artistSim || 0.7) * 0.3;
              if (combinedScore > bestSim) {
                bestSim = combinedScore;
                bestCandidate = lt;
              }
            }
          } else {
            if (titleSim > bestSim) {
              bestSim = titleSim;
              bestCandidate = lt;
            }
          }
        }
      }

      if (bestCandidate && bestSim >= 0.80) {
        localCandidate = bestCandidate;
      }
    }

    if (localCandidate) {
      const matchedTrack: MatchedTrackDTO = {
        kind: 'dodik',
        id: localCandidate.id,
        numericTrackId: localCandidate.id,
        title: localCandidate.title,
        artistName: localCandidate.artistName || 'Исполнитель',
        artistSlug: localCandidate.artistSlug || undefined,
        artistId: localCandidate.artistId || undefined,
        releaseTitle: localCandidate.releaseTitle || undefined,
        coverUrl: localCandidate.releaseCover || null,
        duration: localCandidate.duration || null,
        source: 'dodik',
      };

      parsedResults.push({
        rawLine: item.rawLine,
        artist: rawArtist,
        title: rawTitle,
        album: item.album,
        matched: true,
        track: matchedTrack,
      });
    } else {
      const reason = rawArtist
        ? 'Трек отсутствует в каталоге Dodik Tracker'
        : 'Не указан исполнитель / трек отсутствует в каталоге';

      parsedResults.push({
        rawLine: item.rawLine,
        artist: rawArtist,
        title: rawTitle,
        album: item.album,
        matched: false,
        reason,
        track: null,
      });

      unmatchedList.push({
        artist: rawArtist || 'Неизвестный исполнитель',
        title: rawTitle || item.rawLine,
        reason,
        rawLine: item.rawLine,
      });
    }
  }

  const matchedCount = parsedResults.filter((p) => p.matched).length;
  const unmatchedCount = parsedResults.length - matchedCount;

  return {
    total: parsedResults.length,
    matchedCount,
    unmatchedCount,
    tracks: parsedResults,
    unmatchedTracks: unmatchedList,
  };
}
