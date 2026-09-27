import { LyricsProvider, LyricsSearchInput, LyricsResult } from './lyricsProvider.ts';
import { calculateMatchConfidence, cleanSongTitle, cleanArtistName, normalizeText } from './lyricsMatcher.ts';
import { externalMusicConfig } from '../externalMusicConfig.ts';

/**
 * Sanitizes and validates Genius API Client Access Token.
 * Prevents ByteString crash when non-ASCII or Cyrillic characters are passed in headers.
 */
export function sanitizeGeniusToken(rawKey?: string | null): { token: string; error?: string } {
  if (!rawKey || typeof rawKey !== 'string') {
    return { token: '', error: 'API-токен не указан' };
  }

  let token = rawKey.trim();

  // Remove wrapping quotes if pasted with quotes
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    token = token.slice(1, -1).trim();
  }

  // Remove leading "Bearer " if user accidentally provided full auth header value
  if (token.toLowerCase().startsWith('bearer ')) {
    token = token.slice(7).trim();
  }

  // Strip control characters, line breaks
  token = token.replace(/[\r\n\t]/g, '').trim();

  if (!token) {
    return { token: '', error: 'API-токен не может быть пустым' };
  }

  // Check for non-ASCII characters (code point > 127) which cause ByteString TypeError in fetch headers
  for (let i = 0; i < token.length; i++) {
    if (token.charCodeAt(i) > 127) {
      return {
        token: '',
        error: `API-токен содержит недопустимые символы (символ "${token[i]}" на позиции ${i + 1}). Используйте оригинальный латинский Access Token из личного кабинета Genius.`,
      };
    }
  }

  return { token };
}

export interface GeniusAnnotation {
  id: number;
  fragment: string; // The annotated lyric line/phrase
  bodyPlain: string;
  bodyHtml?: string;
  verified: boolean;
  votesTotal?: number;
  author?: {
    name: string;
    avatarUrl?: string;
    url?: string;
  };
}

export interface GeniusCredit {
  role: string; // e.g. "Продюсеры", "Авторы", "При участии"
  artists: { name: string; url?: string; imageUrl?: string }[];
}

export interface GeniusTrackInfo {
  geniusSongId: number;
  url?: string;
  title: string;
  artistNames: string[];
  description?: string;
  releaseDate?: string;
  albumName?: string;
  albumCoverUrl?: string;
  primaryArtist?: {
    name: string;
    imageUrl?: string;
    url?: string;
    headerImageUrl?: string;
  };
  annotations?: GeniusAnnotation[];
  credits?: GeniusCredit[];
  verified?: boolean;
  headerImageUrl?: string;
  songArtImageUrl?: string;
  stats?: {
    pageviews?: number;
    unreviewedAnnotations?: number;
    hot?: boolean;
  };
  fetchedAt: string;
}

interface CachedInsights {
  data: GeniusTrackInfo | null;
  expiresAt: number;
}

export class GeniusProvider implements LyricsProvider {
  public readonly name = 'genius';

  private insightsCache = new Map<string, CachedInsights>();
  private pendingRequests = new Map<string, Promise<GeniusTrackInfo | null>>();
  private readonly CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
  private readonly MAX_CACHE_SIZE = 1000;

  /**
   * Search song on Genius with strict and fuzzy multi-artist candidate match
   */
  public async searchSongCandidate(
    input: { title: string; artists?: string[]; album?: string },
    overrideKey?: string
  ): Promise<any | null> {
    const rawApiKey = overrideKey || externalMusicConfig.getApiKey('genius');
    const { token: apiKey, error: tokenError } = sanitizeGeniusToken(rawApiKey);
    if (!apiKey || tokenError) {
      return null;
    }

    const expectedTitle = cleanSongTitle(input.title);
    const rawTitle = (input.title || '').trim();
    const primaryArtist = cleanArtistName(input.artists?.[0] || '');
    const rawArtist = (input.artists?.[0] || '').trim();

    if (!expectedTitle && !rawTitle) {
      return null;
    }

    // Build multi-stage search queries following STEP 25 specs:
    // Variant A: Artist - Title
    // Variant B: Artist Title
    // Variant C: Title Artist
    // Variant D: Clean Title
    const queryCandidates: string[] = [];

    if (primaryArtist && expectedTitle) {
      queryCandidates.push(`${primaryArtist} - ${expectedTitle}`); // Variant A
      queryCandidates.push(`${primaryArtist} ${expectedTitle}`);   // Variant B
      queryCandidates.push(`${expectedTitle} ${primaryArtist}`);   // Variant C
    } else if (rawArtist && rawTitle) {
      queryCandidates.push(`${rawArtist} - ${rawTitle}`);
      queryCandidates.push(`${rawArtist} ${rawTitle}`);
      queryCandidates.push(`${rawTitle} ${rawArtist}`);
    }

    if (input.artists && input.artists.length > 1 && expectedTitle) {
      const topArtists = input.artists.slice(0, 2).map((a) => cleanArtistName(a)).filter(Boolean).join(' ');
      if (topArtists) {
        queryCandidates.push(`${topArtists} ${expectedTitle}`);
      }
    }

    if (expectedTitle) {
      queryCandidates.push(expectedTitle); // Variant D
    }

    // Deduplicate queries while maintaining order
    const queries = Array.from(new Set(queryCandidates.map((q) => q.trim()))).filter(Boolean);

    let globalBestCandidate: any = null;
    let globalHighestScore = 0;

    for (const q of queries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const res = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(q)}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'User-Agent': 'DodikTracker/1.0',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          continue;
        }

        const json = (await res.json()) as any;
        const hits = json?.response?.hits;
        if (!Array.isArray(hits) || hits.length === 0) {
          continue;
        }

        for (const hit of hits.slice(0, 10)) {
          const result = hit?.result;
          if (!result) continue;

          const candidateTitle = result.title || '';
          const candidateArtist = result.primary_artist?.name || '';

          // Check primary artist match confidence
          let confidence = calculateMatchConfidence(
            input.title,
            input.artists?.[0] || '',
            candidateTitle,
            candidateArtist
          );

          // If multiple artists, check if candidate includes other featured artists
          if (input.artists && input.artists.length > 1 && confidence < 0.75) {
            for (const art of input.artists.slice(1)) {
              const subConf = calculateMatchConfidence(input.title, art, candidateTitle, candidateArtist);
              if (subConf > confidence) confidence = subConf;
            }
          }

          if (confidence > globalHighestScore) {
            globalHighestScore = confidence;
            globalBestCandidate = result;
          }
        }

        // If we found a high confidence match (>= 0.75), break early
        if (globalBestCandidate && globalHighestScore >= 0.75) {
          return globalBestCandidate;
        }
      } catch {
        // Try next query
      }
    }

    // Accept candidate if score is >= 0.55
    if (globalBestCandidate && globalHighestScore >= 0.55) {
      return globalBestCandidate;
    }

    return null;
  }

  /**
   * Search lyrics from Genius API with strict metadata verification
   */
  public async searchLyrics(input: LyricsSearchInput, overrideKey?: string): Promise<LyricsResult | null> {
    if (!externalMusicConfig.isLyricsEnabled('genius')) {
      return null;
    }

    const rawApiKey = overrideKey || externalMusicConfig.getApiKey('genius');
    const { token: apiKey, error: tokenError } = sanitizeGeniusToken(rawApiKey);
    if (!apiKey || tokenError) {
      return null;
    }

    const candidate = await this.searchSongCandidate(input, apiKey);
    if (!candidate || !candidate.url) {
      return null;
    }

    try {
      const lyricsText = await this.scrapeLyricsFromGenius(candidate.url);
      if (!lyricsText || !lyricsText.trim()) {
        return null;
      }

      externalMusicConfig.recordHealth('genius', true, null);

      return {
        text: lyricsText.trim(),
        title: candidate.title || input.title,
        artist: candidate.primary_artist?.name || input.artists?.[0] || null,
        album: candidate.album?.name || null,
        durationSeconds: null,
        confidence: 0.9,
        provider: 'genius',
      };
    } catch (err: any) {
      externalMusicConfig.recordHealth('genius', false, err.message);
      return null;
    }
  }

  /**
   * Fetch full track insights: description, verified annotations, credits, referents from Genius API
   */
  public async getTrackInsights(
    input: { title: string; artists?: string[]; album?: string },
    overrideKey?: string
  ): Promise<GeniusTrackInfo | null> {
    const cleanTitle = (input.title || '').trim().toLowerCase();
    const cleanArtist = (input.artists?.[0] || '').trim().toLowerCase();
    const cacheKey = `genius_insights:${cleanArtist}:${cleanTitle}`;

    const now = Date.now();
    const cached = this.insightsCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }

    // Deduplicate concurrent in-flight requests for the exact same track
    const existingPromise = this.pendingRequests.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    const fetchPromise = (async () => {
      try {
        const rawApiKey = overrideKey || externalMusicConfig.getApiKey('genius');
        const { token: apiKey, error: tokenError } = sanitizeGeniusToken(rawApiKey);
        if (!apiKey || tokenError) {
          this.setInsightsCache(cacheKey, null);
          return null;
        }

        const candidate = await this.searchSongCandidate(input, apiKey);
        if (!candidate || !candidate.id) {
          this.setInsightsCache(cacheKey, null);
          return null;
        }

        const songId = candidate.id;

        // Fetch song details and referents in parallel
        const [songDetails, referentsData] = await Promise.all([
          this.fetchSongDetails(songId, apiKey),
          this.fetchSongReferents(songId, apiKey),
        ]);

        if (!songDetails) {
          this.setInsightsCache(cacheKey, null);
          return null;
        }

        const song = songDetails;

        // Parse description
        let description = '';
        if (song.description?.plain && typeof song.description.plain === 'string') {
          description = song.description.plain.trim();
          if (description === '?' || description.toLowerCase().includes('there is no description yet')) {
            description = '';
          }
        }

        // Parse annotations from referents
        const annotations: GeniusAnnotation[] = [];
        if (Array.isArray(referentsData)) {
          for (const ref of referentsData) {
            const fragment = ref.fragment ? String(ref.fragment).trim() : '';
            const anns = ref.annotations;
            if (fragment && Array.isArray(anns) && anns.length > 0) {
              for (const ann of anns) {
                const bodyPlain = ann.body?.plain ? String(ann.body.plain).trim() : '';
                if (!bodyPlain || bodyPlain === '?') continue;

                annotations.push({
                  id: ann.id || ref.id,
                  fragment,
                  bodyPlain,
                  bodyHtml: ann.body?.html || undefined,
                  verified: Boolean(ann.verified),
                  votesTotal: ann.votes_total,
                  author: ann.authors?.[0]?.user
                    ? {
                        name: ann.authors[0].user.name,
                        avatarUrl: ann.authors[0].user.avatar?.medium?.url || ann.authors[0].user.avatar?.thumb?.url,
                        url: ann.authors[0].user.url,
                      }
                    : undefined,
                });
              }
            }
          }
        }

        // Parse credits
        const credits: GeniusCredit[] = [];

        if (Array.isArray(song.producer_artists) && song.producer_artists.length > 0) {
          credits.push({
            role: 'Продюсеры',
            artists: song.producer_artists.map((a: any) => ({
              name: a.name,
              url: a.url,
              imageUrl: a.image_url,
            })),
          });
        }

        if (Array.isArray(song.writer_artists) && song.writer_artists.length > 0) {
          credits.push({
            role: 'Авторы текста / музыки',
            artists: song.writer_artists.map((a: any) => ({
              name: a.name,
              url: a.url,
              imageUrl: a.image_url,
            })),
          });
        }

        if (Array.isArray(song.featured_artists) && song.featured_artists.length > 0) {
          credits.push({
            role: 'При участии (Feat)',
            artists: song.featured_artists.map((a: any) => ({
              name: a.name,
              url: a.url,
              imageUrl: a.image_url,
            })),
          });
        }

        if (Array.isArray(song.custom_performances) && song.custom_performances.length > 0) {
          for (const cp of song.custom_performances) {
            if (cp.label && Array.isArray(cp.artists) && cp.artists.length > 0) {
              credits.push({
                role: cp.label,
                artists: cp.artists.map((a: any) => ({
                  name: a.name,
                  url: a.url,
                  imageUrl: a.image_url,
                })),
              });
            }
          }
        }

        const artistNames: string[] = [];
        if (song.primary_artist?.name) artistNames.push(song.primary_artist.name);
        if (Array.isArray(song.featured_artists)) {
          for (const fa of song.featured_artists) {
            if (fa?.name && !artistNames.includes(fa.name)) artistNames.push(fa.name);
          }
        }

        const result: GeniusTrackInfo = {
          geniusSongId: song.id,
          url: song.url,
          title: song.title || input.title,
          artistNames: artistNames.length > 0 ? artistNames : [input.artists?.[0] || 'Исполнитель'],
          description: description || undefined,
          releaseDate: song.release_date_for_display || song.release_date || undefined,
          albumName: song.album?.name || undefined,
          albumCoverUrl: song.album?.cover_art_url || undefined,
          primaryArtist: song.primary_artist
            ? {
                name: song.primary_artist.name,
                imageUrl: song.primary_artist.image_url,
                url: song.primary_artist.url,
                headerImageUrl: song.primary_artist.header_image_url,
              }
            : undefined,
          annotations: annotations.length > 0 ? annotations : undefined,
          credits: credits.length > 0 ? credits : undefined,
          verified: Boolean(song.description_annotation?.verified || song.verified_annotations_count > 0),
          headerImageUrl: song.header_image_url || undefined,
          songArtImageUrl: song.song_art_image_url || undefined,
          stats: {
            pageviews: song.stats?.pageviews,
            unreviewedAnnotations: song.stats?.unreviewed_annotations,
            hot: song.stats?.hot,
          },
          fetchedAt: new Date().toISOString(),
        };

        this.setInsightsCache(cacheKey, result);
        return result;
      } catch (err: any) {
        console.error('[GeniusProvider] getTrackInsights error:', err.message);
        this.setInsightsCache(cacheKey, null);
        return null;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  private async fetchSongDetails(songId: number, apiKey: string): Promise<any | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const res = await fetch(`https://api.genius.com/songs/${songId}?text_format=plain,html`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'DodikTracker/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const json = (await res.json()) as any;
      return json?.response?.song || null;
    } catch {
      return null;
    }
  }

  private async fetchSongReferents(songId: number, apiKey: string): Promise<any[] | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const res = await fetch(`https://api.genius.com/referents?song_id=${songId}&text_format=plain,html`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'DodikTracker/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const json = (await res.json()) as any;
      return json?.response?.referents || null;
    } catch {
      return null;
    }
  }

  private setInsightsCache(key: string, data: GeniusTrackInfo | null): void {
    if (this.insightsCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.insightsCache.keys().next().value;
      if (firstKey) this.insightsCache.delete(firstKey);
    }
    this.insightsCache.set(key, {
      data,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }

  /**
   * Scrapes lyrics content from official Genius page
   */
  private async scrapeLyricsFromGenius(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const html = await res.text();

      // Genius lyrics containers: data-lyrics-container="true"
      const containerRegex = /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;
      let matches = Array.from(html.matchAll(containerRegex));

      if (matches.length === 0) {
        // Fallback older layout: <div class="lyrics">...</div>
        const oldRegex = /<div[^>]*class="lyrics"[^>]*>([\s\S]*?)<\/div>/i;
        const oldMatch = html.match(oldRegex);
        if (oldMatch && oldMatch[1]) {
          matches = [[oldMatch[0], oldMatch[1]] as any];
        }
      }

      if (matches.length === 0) return null;

      let extracted = '';
      for (const m of matches) {
        let block = m[1] || '';
        block = block.replace(/<br\s*[\/]?>/gi, '\n');
        block = block.replace(/<[^>]+>/g, '');
        block = block
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .replace(/&#39;/g, "'");

        extracted += block + '\n';
      }

      const cleaned = extracted
        .split('\n')
        .map((l) => l.trim())
        .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
        .join('\n')
        .trim();

      return cleaned.length > 20 ? cleaned : null;
    } catch {
      return null;
    }
  }

  /**
   * Admin connection test
   */
  public async testConnection(overrideKey?: string): Promise<{ ok: boolean; message: string; latency?: number }> {
    const rawApiKey = overrideKey || externalMusicConfig.getApiKey('genius');
    const { token: apiKey, error: tokenError } = sanitizeGeniusToken(rawApiKey);

    if (tokenError || !apiKey) {
      const errMsg = tokenError || 'API-токен не настроен. Введите действительный Access Token Genius.';
      externalMusicConfig.recordHealth('genius', false, errMsg);
      return { ok: false, message: errMsg };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('https://api.genius.com/search?q=Nirvana', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'DodikTracker/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latency = Date.now() - start;

      if (!res.ok) {
        let errMsg = `Genius API вернул статус ${res.status} (${res.statusText})`;
        if (res.status === 401 || res.status === 403) {
          errMsg = 'Неверный или отозванный Client Access Token Genius (401 Unauthorized)';
        } else if (res.status === 429) {
          errMsg = 'Превышен лимит запросов к Genius API (429 Too Many Requests)';
        } else if (res.status >= 500) {
          errMsg = `Сервер Genius временно недоступен (HTTP ${res.status})`;
        }
        externalMusicConfig.recordHealth('genius', false, errMsg, latency);
        return { ok: false, message: errMsg, latency };
      }

      const json = (await res.json()) as any;
      if (json?.meta?.status === 200) {
        externalMusicConfig.recordHealth('genius', true, null, latency);
        return { ok: true, message: `Соединение успешно установлено! Задержка: ${latency} мс.`, latency };
      }

      externalMusicConfig.recordHealth('genius', false, 'Неожиданный ответ API', latency);
      return { ok: false, message: 'Неожиданный формат ответа Genius API', latency };
    } catch (err: any) {
      const latency = Date.now() - start;
      const msg = err.name === 'AbortError' ? 'Таймаут соединения с Genius API (6с)' : err.message || 'Ошибка сети';
      externalMusicConfig.recordHealth('genius', false, msg, latency);
      return { ok: false, message: `Ошибка подключения к Genius: ${msg}`, latency };
    }
  }
}

export const geniusProvider = new GeniusProvider();
