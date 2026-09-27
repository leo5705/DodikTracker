import { db } from '../../db/index.ts';
import { musicTracks, artistProfiles, musicReleases } from '../../db/schema.ts';
import { eq, ilike, or, and } from 'drizzle-orm';
import { youtubeMusicService, YouTubeTrackDTO } from './youtubeMusicService.ts';

export type MusicSourceType = 'dodik' | 'youtube' | 'custom' | string;

export type ImportMatchStatus =
  | 'LOCAL_FOUND'
  | 'LOCAL_NOT_FOUND'
  | 'EXTERNAL_FOUND'
  | 'EXTERNAL_NOT_FOUND'
  | 'SOURCE_UNAVAILABLE'
  | 'PLAYBACK_UNAVAILABLE'
  | 'AMBIGUOUS_RESULT';

export interface RawParsedTrack {
  artist: string;
  title: string;
  album?: string;
  duration?: number;
  rawLine: string;
}

export interface MatchedTrackDTO {
  kind: 'dodik' | 'external' | 'youtube';
  id: string | number;
  numericTrackId?: number;
  videoId?: string;
  youtubeUrl?: string;
  title: string;
  artistName: string;
  artists?: string[];
  artistSlug?: string;
  artistId?: number | string;
  releaseTitle?: string;
  album?: string;
  coverUrl?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  source: MusicSourceType;
  sourceLabel?: string;
  playable?: boolean;
}

export interface ParsedTrackResult {
  rawLine: string;
  artist: string;
  title: string;
  album?: string;
  status: ImportMatchStatus;
  matched: boolean;
  reason?: string;
  track: MatchedTrackDTO | null;
  candidates?: MatchedTrackDTO[];
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
 * e.g. "Song (feat. Artist)", "Song [Official Video]", "Song (Remix)", "01. Song", "OST ..."
 */
export function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let title = rawTitle;
  // Remove leading numbers: "01. ", "1 - ", "[01] ", "1.1 "
  title = title.replace(/^(\[\d+\]|\d+[\.\)\-\]\s]+)/, '');
  // Remove trailing bracketed info
  title = title.replace(/\s*[\(\[](official\s*(audio|video|music\s*video)|audio|video|lyrics|клип|премьера|hd|hq|18\+|explicit|ost|саундтрек|soundtrack|live|концерт|remix|ремикс|edit|mix|acoustic|акустика|slowed|reverb)[\)\]]/gi, '');
  // Remove feat/ft in brackets
  title = title.replace(/\s*[\(\[](feat\.?|ft\.?|featuring|с уч\.?|с участием)\s+[^\)\]]+[\)\]]/gi, '');
  // Remove feat/ft in title string
  title = title.replace(/\s+(feat\.?|ft\.?|featuring|с уч\.?|с участием)\s+.+$/i, '');
  return title.trim();
}

/**
 * Calculates string similarity (Levenshtein/Dice coefficient)
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
 * Parser that extracts track entries from Raw Text, CSV, TSV, or JSON
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
      // Continue
    }
  }

  // 2. Try CSV / TSV parsing
  const lines = cleanedContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

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

  // 3. Fallback: Line-by-line parser
  const results: RawParsedTrack[] = [];
  for (const line of lines) {
    if (!line) continue;

    let artist = '';
    let title = '';
    let album: string | undefined = undefined;

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

    artist = artist.replace(/^(\[\d+\]|\d+[\.\)\-\]\s]+)/, '').trim();
    title = title.replace(/^(\[\d+\]|\d+[\.\)\-\]\s]+)/, '').trim();

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
 * Convert external YouTubeDTO to MatchedTrackDTO
 */
function mapYouTubeDtoToCandidate(dto: YouTubeTrackDTO): MatchedTrackDTO {
  return {
    kind: 'youtube',
    id: `yt_${dto.videoId}`,
    videoId: dto.videoId,
    youtubeUrl: dto.youtubeUrl,
    title: dto.title,
    artistName: dto.artist || 'Исполнитель',
    artists: dto.artists,
    album: dto.album || undefined,
    releaseTitle: dto.album || undefined,
    coverUrl: dto.thumbnail,
    thumbnail: dto.thumbnail,
    duration: dto.durationSeconds || null,
    source: 'youtube',
    sourceLabel: 'YouTube Music',
    playable: true,
  };
}

/**
 * Searches external sources (e.g. YouTube Music) for a parsed track line.
 * Evaluates candidate scores to detect explicit matches vs AMBIGUOUS_RESULT.
 */
export async function searchExternalSources(
  artist: string,
  title: string,
  album?: string
): Promise<{ status: ImportMatchStatus; reason?: string; selected: MatchedTrackDTO | null; candidates: MatchedTrackDTO[] }> {
  const searchQuery = artist ? `${artist} - ${title}` : title;
  if (!searchQuery.trim()) {
    return {
      status: 'EXTERNAL_NOT_FOUND',
      reason: 'Пустой запрос для поиска во внешнем источнике',
      selected: null,
      candidates: [],
    };
  }

  try {
    const ytSongs = await youtubeMusicService.searchSongs(searchQuery, 6);
    if (!ytSongs || ytSongs.length === 0) {
      return {
        status: 'EXTERNAL_NOT_FOUND',
        reason: 'Трек не найден ни локально, ни в YouTube Music',
        selected: null,
        candidates: [],
      };
    }

    const candidates = ytSongs.map(mapYouTubeDtoToCandidate);

    if (candidates.length === 1) {
      return {
        status: 'EXTERNAL_FOUND',
        selected: candidates[0],
        candidates,
      };
    }

    // Evaluate similarity scores across candidates
    const normTargetTitle = normalizeString(cleanTitle(title));
    const normTargetArtist = normalizeString(artist);

    const scoredCandidates = candidates.map((cand) => {
      const candTitleSim = calculateSimilarity(normTargetTitle, cleanTitle(cand.title));
      const candArtistSim = normTargetArtist ? calculateSimilarity(normTargetArtist, cand.artistName) : 1;
      const totalScore = candTitleSim * 0.65 + candArtistSim * 0.35;
      return { cand, totalScore, titleSim: candTitleSim, artistSim: candArtistSim };
    });

    scoredCandidates.sort((a, b) => b.totalScore - a.totalScore);

    const top = scoredCandidates[0];
    const second = scoredCandidates[1];

    // If top candidate is very confident and significantly better than #2 candidate
    if (top.totalScore >= 0.82 && (!second || top.totalScore - second.totalScore >= 0.18)) {
      return {
        status: 'EXTERNAL_FOUND',
        selected: top.cand,
        candidates: scoredCandidates.map((sc) => sc.cand),
      };
    }

    // Otherwise, multiple close candidates exist -> AMBIGUOUS_RESULT
    return {
      status: 'AMBIGUOUS_RESULT',
      reason: 'Найдено несколько похожих вариантов. Пожалуйста, выберите нужный трек.',
      selected: top.cand, // Default pre-selected candidate
      candidates: scoredCandidates.map((sc) => sc.cand),
    };
  } catch (err: any) {
    console.warn('[PlaylistImportService] External search failed for query:', searchQuery, err?.message);
    return {
      status: 'SOURCE_UNAVAILABLE',
      reason: 'Внешний музыкальный источник (YouTube Music) временно недоступен',
      selected: null,
      candidates: [],
    };
  }
}

/**
 * Multi-source playlist track matching:
 * 1. Local Dodik Tracker catalog
 * 2. External YouTube Music catalog
 * 3. Handles status classification (LOCAL_FOUND, EXTERNAL_FOUND, EXTERNAL_NOT_FOUND, AMBIGUOUS_RESULT, SOURCE_UNAVAILABLE)
 */
/**
 * Executes async tasks with a limit on concurrent operations.
 */
async function pooledMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const promises: Promise<void>[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      try {
        results[currentIndex] = await fn(item, currentIndex);
      } catch (err) {
        console.error(`pooledMap worker error at index ${currentIndex}:`, err);
      }
    }
  }

  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    promises.push(worker());
  }

  await Promise.all(promises);
  return results;
}

/**
 * Multi-source playlist track matching:
 * 1. Local Dodik Tracker catalog
 * 2. External YouTube Music catalog
 * 3. Handles status classification (LOCAL_FOUND, EXTERNAL_FOUND, EXTERNAL_NOT_FOUND, AMBIGUOUS_RESULT, SOURCE_UNAVAILABLE)
 * Runs external queries in parallel with controlled concurrency limit (5) and de-duplicates identical tracks.
 */
export async function matchParsedTracks(rawTracks: RawParsedTrack[]): Promise<ParsePlaylistResult> {
  const parsedResults: ParsedTrackResult[] = new Array(rawTracks.length);
  const unmatchedList: Array<{ artist: string; title: string; reason: string; rawLine: string }> = [];

  // Pre-fetch all local published tracks and releases
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

  const externalSearchIndices: number[] = [];

  // Step 1: Perform in-memory local matching (extremely fast)
  for (let i = 0; i < rawTracks.length; i++) {
    const item = rawTracks[i];
    const rawArtist = item.artist || '';
    const rawTitle = item.title || '';
    const normArtist = normalizeString(rawArtist);
    const normTitle = normalizeString(rawTitle);
    const cleanNormTitle = normalizeString(cleanTitle(rawTitle));
    const artistTokens = extractArtistTokens(rawArtist);

    if (!normTitle && !normArtist) {
      parsedResults[i] = {
        rawLine: item.rawLine,
        artist: rawArtist,
        title: rawTitle,
        album: item.album,
        status: 'EXTERNAL_NOT_FOUND',
        matched: false,
        reason: 'Пустая строка или не распознано название трека',
        track: null,
        candidates: [],
      } as any;
      (parsedResults[i] as any).matchStatus = 'EXTERNAL_NOT_FOUND';
      continue;
    }

    let localCandidate: typeof allLocalTracks[0] | null = null;

    // Exact local match
    localCandidate = allLocalTracks.find((lt) => {
      const ltTitleNorm = normalizeString(lt.title);
      const ltArtistNorm = normalizeString(lt.artistName || '');
      if (normArtist) {
        return ltTitleNorm === normTitle && ltArtistNorm === normArtist;
      }
      return ltTitleNorm === normTitle;
    }) || null;

    // Normalized local match with clean titles
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

        return (
          ltArtistNorm === normArtist ||
          ltArtistNorm.includes(normArtist) ||
          normArtist.includes(ltArtistNorm) ||
          artistTokens.some((t) => ltArtistTokens.includes(t) || ltArtistNorm.includes(t) || t.includes(ltArtistNorm))
        );
      }) || null;
    }

    // Inverted local match
    if (!localCandidate && normArtist && normTitle) {
      localCandidate = allLocalTracks.find((lt) => {
        const ltTitleNorm = normalizeString(lt.title);
        const ltArtistNorm = normalizeString(lt.artistName || '');
        return ltTitleNorm === normArtist && ltArtistNorm === normTitle;
      }) || null;
    }

    // Local fuzzy match
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

    // IF LOCAL MATCH FOUND
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
        album: localCandidate.releaseTitle || undefined,
        coverUrl: localCandidate.releaseCover || null,
        thumbnail: localCandidate.releaseCover || null,
        duration: localCandidate.duration || null,
        source: 'dodik',
        sourceLabel: 'Dodik Tracker',
        playable: true,
      };

      parsedResults[i] = {
        rawLine: item.rawLine,
        artist: rawArtist,
        title: rawTitle,
        album: item.album,
        status: 'LOCAL_FOUND',
        matched: true,
        track: matchedTrack,
        candidates: [matchedTrack],
      } as any;
      (parsedResults[i] as any).matchStatus = 'LOCAL_FOUND';
    } else {
      externalSearchIndices.push(i);
    }
  }

  // Step 2: Group and deduplicate external searches within this import session
  const CONCURRENCY_LIMIT = 5;
  const searchGroups = new Map<string, number[]>();

  for (const idx of externalSearchIndices) {
    const item = rawTracks[idx];
    const key = `${normalizeString(item.artist || '')}::${normalizeString(item.title || '')}`;
    if (!searchGroups.has(key)) {
      searchGroups.set(key, []);
    }
    searchGroups.get(key)!.push(idx);
  }

  const uniqueKeys = Array.from(searchGroups.keys());
  const externalSearchResults = new Map<string, any>();

  // Run searches in parallel with controlled concurrency limit
  await pooledMap(uniqueKeys, CONCURRENCY_LIMIT, async (key) => {
    const indices = searchGroups.get(key)!;
    const firstIdx = indices[0];
    const item = rawTracks[firstIdx];
    const result = await searchExternalSources(item.artist || '', item.title || '', item.album);
    externalSearchResults.set(key, result);
  });

  // Apply resolved external candidates back to parsed results
  for (const [key, indices] of searchGroups.entries()) {
    const extSearchResult = externalSearchResults.get(key)!;

    for (const idx of indices) {
      const item = rawTracks[idx];
      const rawArtist = item.artist || '';
      const rawTitle = item.title || '';

      if (extSearchResult.status === 'AMBIGUOUS_RESULT' || extSearchResult.status === 'EXTERNAL_FOUND') {
        const isMatched = extSearchResult.status === 'EXTERNAL_FOUND';
        parsedResults[idx] = {
          rawLine: item.rawLine,
          artist: rawArtist,
          title: rawTitle,
          album: item.album,
          status: extSearchResult.status,
          matched: isMatched,
          reason: extSearchResult.reason,
          track: extSearchResult.selected,
          candidates: extSearchResult.candidates,
        } as any;
        (parsedResults[idx] as any).matchStatus = extSearchResult.status;
      } else {
        parsedResults[idx] = {
          rawLine: item.rawLine,
          artist: rawArtist,
          title: rawTitle,
          album: item.album,
          status: extSearchResult.status,
          matched: false,
          reason: extSearchResult.reason || 'Трек отсутствует в каталогах',
          track: null,
          candidates: extSearchResult.candidates || [],
        } as any;
        (parsedResults[idx] as any).matchStatus = extSearchResult.status;
      }
    }
  }

  // Compile unmatched track listings
  for (let i = 0; i < parsedResults.length; i++) {
    const res = parsedResults[i];
    if (!res.matched) {
      unmatchedList.push({
        artist: res.artist || 'Неизвестный исполнитель',
        title: res.title || res.rawLine,
        reason: res.reason || 'Трек отсутствует в каталогах',
        rawLine: res.rawLine,
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
