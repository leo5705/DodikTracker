import {
  RawGameData,
} from './types.ts';
import {
  UnifiedGame,
  UnifiedGenre,
  UnifiedPlatform,
  UnifiedDeveloper,
  UnifiedPublisher,
  UnifiedStore,
  UnifiedScreenshot,
  UnifiedVideo,
  UnifiedDLC,
  UnifiedCreator,
  UnifiedGameSummary,
  UnifiedSeries,
} from '../../types/unifiedGame.ts';
import { deduplicateAndNormalizeStores } from '../../utils/storeNormalizer.ts';

export interface MatchScoreResult {
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  reasons: string[];
}

const EDITION_PATTERNS = [
  /\b(remake|remaster|remastered|goty|game of the year|deluxe|definitive|director'?s cut|vr|enhanced|anniversary|complete edition)\b/i,
];

export class GameMatcher {
  public static normalizeTitle(title: string): string {
    return (title || '')
      .toLowerCase()
      .trim()
      .replace(/[™®©]/g, '')
      .replace(/[:\-–—_]/g, ' ')
      .replace(/[^a-z0-9а-яё\s]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public static hasDistinctEdition(t1: string, t2: string): boolean {
    const norm1 = t1.toLowerCase();
    const norm2 = t2.toLowerCase();

    for (const pattern of EDITION_PATTERNS) {
      const match1 = pattern.test(norm1);
      const match2 = pattern.test(norm2);
      if (match1 !== match2) {
        // One has edition marker while the other does not -> DO NOT MERGE AUTOMATICALLY
        return true;
      }
    }
    return false;
  }

  public static evaluateMatch(g1: RawGameData, g2: RawGameData): MatchScoreResult {
    const reasons: string[] = [];
    let score = 0;

    // 1. Check distinct edition barrier
    if (this.hasDistinctEdition(g1.title, g2.title)) {
      return {
        confidence: 'LOW',
        score: 0.1,
        reasons: ['Разные версии издания (Remake / Remaster / Deluxe / Edition). Автоматическое слияние запрещено.'],
      };
    }

    // 2. Title comparison
    const norm1 = this.normalizeTitle(g1.title);
    const norm2 = this.normalizeTitle(g2.title);

    if (norm1 === norm2) {
      score += 0.5;
      reasons.push('Точное совпадение названий');
    } else if (norm1.includes(norm2) || norm2.includes(norm1)) {
      score += 0.25;
      reasons.push('Частичное совпадение названий');
    } else {
      return { confidence: 'LOW', score: 0, reasons: ['Названия не совпадают'] };
    }

    // 3. Year comparison
    if (g1.year && g2.year) {
      const diff = Math.abs(g1.year - g2.year);
      if (diff === 0) {
        score += 0.35;
        reasons.push(`Идентичный год релиза (${g1.year})`);
      } else if (diff === 1) {
        score += 0.2;
        reasons.push(`Близкий год релиза (${g1.year} vs ${g2.year})`);
      } else {
        score -= 0.3;
        reasons.push(`Существенная разница в годах (${g1.year} vs ${g2.year})`);
      }
    }

    // 4. Developer / Platform corroboration
    const devs1 = new Set(g1.developers.map((d) => d.slug || d.name.toLowerCase()));
    const devs2 = new Set(g2.developers.map((d) => d.slug || d.name.toLowerCase()));
    let hasMatchingDev = false;
    for (const d of devs1) {
      if (devs2.has(d)) {
        hasMatchingDev = true;
        break;
      }
    }

    if (hasMatchingDev) {
      score += 0.25;
      reasons.push('Совпадение разработчика');
    }

    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (score >= 0.75) {
      confidence = 'HIGH';
    } else if (score >= 0.45) {
      confidence = 'MEDIUM';
    }

    return { confidence, score, reasons };
  }

  public static mergeGames(
    rawgGame: RawGameData | null,
    gmdbGame: RawGameData | null,
    supplemental: {
      series?: UnifiedSeries | null;
      dlcs?: UnifiedDLC[];
      screenshots?: UnifiedScreenshot[];
      videos?: UnifiedVideo[];
      stores?: UnifiedStore[];
      creators?: UnifiedCreator[];
      similar?: UnifiedGameSummary[];
      translatedTitle?: string;
      translatedDesc?: string;
      internalId?: string | number;
      mediaId?: number;
    } = {}
  ): UnifiedGame {
    const sources: Record<string, 'RAWG' | 'GMDB' | 'LOCAL' | 'BOTH'> = {};

    // 1. Basic Info: Title & Description
    let title = rawgGame?.title || gmdbGame?.title || 'Без названия';
    if (supplemental.translatedTitle) {
      title = supplemental.translatedTitle;
      sources['title'] = 'LOCAL';
    } else if (rawgGame?.title) {
      sources['title'] = 'RAWG';
    } else {
      sources['title'] = 'GMDB';
    }

    const originalTitle = rawgGame?.originalTitle || gmdbGame?.originalTitle || rawgGame?.title || gmdbGame?.title;
    sources['originalTitle'] = rawgGame?.originalTitle ? 'RAWG' : 'GMDB';

    let description = supplemental.translatedDesc || rawgGame?.description || gmdbGame?.description || undefined;
    sources['description'] = supplemental.translatedDesc ? 'LOCAL' : (rawgGame?.description ? 'RAWG' : 'GMDB');

    // 2. Dates & Ratings (Separate, uncorrupted)
    const releaseDate = rawgGame?.releaseDate || gmdbGame?.releaseDate;
    const year = rawgGame?.year || gmdbGame?.year;
    sources['releaseDate'] = rawgGame?.releaseDate ? 'RAWG' : 'GMDB';

    const rawgRating = rawgGame?.rating; // 0-10 or 0-5
    const rating = rawgGame?.rating || gmdbGame?.rating;
    const ratingCount = rawgGame?.ratingCount;
    const metacritic = rawgGame?.metacritic ?? null;
    const metacriticUrl = rawgGame?.metacriticUrl ?? null;
    const ageRating = rawgGame?.ageRating ?? null;
    const playtime = rawgGame?.playtime ?? null;
    const website = rawgGame?.website || null;

    // 3. Media Imagery
    const posterUrl = rawgGame?.posterUrl || gmdbGame?.posterUrl;
    const backdropUrl = rawgGame?.backdropUrl || gmdbGame?.backdropUrl || posterUrl;
    const coverUrl = rawgGame?.coverUrl || gmdbGame?.coverUrl || posterUrl;

    // 4. Genres (Deduplicate)
    const genresMap = new Map<string, UnifiedGenre>();
    (rawgGame?.genres || []).forEach((g, idx) => {
      const key = (g.name || '').toLowerCase().trim();
      if (key && !genresMap.has(key)) {
        genresMap.set(key, { id: g.id || `rawg-g-${idx}`, name: g.name, slug: g.slug || key });
      }
    });
    (gmdbGame?.genres || []).forEach((g, idx) => {
      const key = (g.name || '').toLowerCase().trim();
      if (key && !genresMap.has(key)) {
        genresMap.set(key, { id: g.id || `gmdb-g-${idx}`, name: g.name, slug: g.slug || key });
      }
    });

    // 5. Tags
    const tagsSet = new Set<string>();
    (rawgGame?.tags || []).forEach((t) => tagsSet.add(t));
    (gmdbGame?.tags || []).forEach((t) => tagsSet.add(t));

    // 6. Platforms (Deduplicate and combine system requirements)
    const normalizePlatformKey = (name: string): string => {
      const clean = name.toLowerCase().trim();
      if (clean === 'pc' || clean.includes('windows') || clean.includes('pc (')) {
        return 'pc';
      }
      return clean;
    };

    const platformsMap = new Map<string, UnifiedPlatform>();
    (rawgGame?.platforms || []).forEach((p, idx) => {
      const key = normalizePlatformKey(p.name);
      if (key) {
        platformsMap.set(key, {
          id: p.id || `rawg-p-${idx}`,
          name: p.name,
          slug: p.slug || key.replace(/[^a-z0-9]/g, '-'),
          releasedAt: p.releasedAt,
          requirements: p.requirements,
        });
      }
    });

    (gmdbGame?.platforms || []).forEach((p, idx) => {
      const key = normalizePlatformKey(p.name);
      if (key) {
        const existing = platformsMap.get(key);
        if (existing) {
          if (!existing.requirements && p.requirements) {
            existing.requirements = p.requirements;
          }
        } else {
          platformsMap.set(key, {
            id: p.id || `gmdb-p-${idx}`,
            name: p.name,
            slug: p.slug || key.replace(/[^a-z0-9]/g, '-'),
            releasedAt: p.releasedAt,
            requirements: p.requirements,
          });
        }
      }
    });

    // 7. Developers & Publishers
    const devsMap = new Map<string, UnifiedDeveloper>();
    (rawgGame?.developers || []).forEach((d) => {
      const key = d.name.toLowerCase().trim();
      if (key) {
        devsMap.set(key, {
          id: String(d.id),
          name: d.name,
          slug: d.slug || key.replace(/[^a-z0-9]/g, '-'),
          image: d.image,
        });
      }
    });
    (gmdbGame?.developers || []).forEach((d) => {
      const key = d.name.toLowerCase().trim();
      if (key && !devsMap.has(key)) {
        devsMap.set(key, {
          id: String(d.id),
          name: d.name,
          slug: d.slug || key.replace(/[^a-z0-9]/g, '-'),
          image: d.image,
        });
      }
    });

    const pubsMap = new Map<string, UnifiedPublisher>();
    (rawgGame?.publishers || []).forEach((p) => {
      const key = p.name.toLowerCase().trim();
      if (key) {
        pubsMap.set(key, {
          id: String(p.id),
          name: p.name,
          slug: p.slug || key.replace(/[^a-z0-9]/g, '-'),
          image: p.image,
        });
      }
    });
    (gmdbGame?.publishers || []).forEach((p) => {
      const key = p.name.toLowerCase().trim();
      if (key && !pubsMap.has(key)) {
        pubsMap.set(key, {
          id: String(p.id),
          name: p.name,
          slug: p.slug || key.replace(/[^a-z0-9]/g, '-'),
          image: p.image,
        });
      }
    });

    // 8. Screenshots (Merged and deduplicated by URL)
    const screenshotsMap = new Map<string, UnifiedScreenshot>();
    (supplemental.screenshots || []).forEach((s) => screenshotsMap.set(s.url, s));
    (rawgGame?.screenshots || []).forEach((s, idx) => {
      if (!screenshotsMap.has(s.url)) {
        screenshotsMap.set(s.url, {
          id: s.id || `rawg-ss-${idx}`,
          url: s.url,
          width: s.width,
          height: s.height,
        });
      }
    });
    (gmdbGame?.screenshots || []).forEach((s, idx) => {
      if (!screenshotsMap.has(s.url)) {
        screenshotsMap.set(s.url, {
          id: s.id || `gmdb-ss-${idx}`,
          url: s.url,
          width: s.width,
          height: s.height,
        });
      }
    });

    // 9. Videos (Prioritize official YouTube trailers from GMDB + RAWG MP4 movies)
    const videosMap = new Map<string, UnifiedVideo>();
    (supplemental.videos || []).forEach((v) => videosMap.set(v.url, v));
    (gmdbGame?.videos || []).forEach((v, idx) => {
      videosMap.set(v.url, {
        id: v.id || `gmdb-vid-${idx}`,
        title: v.title || 'Official Trailer',
        url: v.url,
        site: v.site || 'YouTube',
        key: v.key,
        type: v.type || 'Trailer',
        thumbnailUrl: v.thumbnailUrl,
      });
    });
    (rawgGame?.videos || []).forEach((v, idx) => {
      if (!videosMap.has(v.url)) {
        videosMap.set(v.url, {
          id: v.id || `rawg-vid-${idx}`,
          title: v.title || 'Official Preview',
          url: v.url,
          site: v.site || 'RAWG',
          key: v.key,
          type: v.type || 'Trailer',
          thumbnailUrl: v.thumbnailUrl,
        });
      }
    });

    // 10. Stores (Normalized and deduplicated across providers)
    const combinedStores = [
      ...(rawgGame?.stores || []),
      ...(gmdbGame?.stores || []),
      ...(supplemental.stores || []),
    ];
    const stores = deduplicateAndNormalizeStores(combinedStores);

    // 11. Multiplayer
    const multiplayer = gmdbGame?.multiplayer || (tagsSet.has('Multiplayer') || tagsSet.has('Co-op') ? { coop: tagsSet.has('Co-op') } : null);

    const internalId = supplemental.internalId || rawgGame?.slug || rawgGame?.externalId || gmdbGame?.externalId || 'game';
    const slug = rawgGame?.slug || gmdbGame?.slug || String(internalId);

    return {
      id: internalId,
      mediaId: supplemental.mediaId,
      slug,
      title,
      originalTitle,
      description,
      releaseDate,
      year,
      rating,
      rawgRating,
      ratingCount,
      metacritic,
      metacriticUrl,
      ageRating,
      posterUrl,
      backdropUrl,
      coverUrl,
      website,
      playtime,
      multiplayer,
      genres: Array.from(genresMap.values()),
      tags: Array.from(tagsSet).slice(0, 20),
      platforms: Array.from(platformsMap.values()),
      developers: Array.from(devsMap.values()),
      publishers: Array.from(pubsMap.values()),
      series: supplemental.series || null,
      dlcs: supplemental.dlcs || [],
      stores,
      screenshots: Array.from(screenshotsMap.values()),
      videos: Array.from(videosMap.values()),
      creators: supplemental.creators || [],
      similar: supplemental.similar || [],
      externalIds: {
        rawg: rawgGame?.externalId,
        gmdb: gmdbGame?.externalId,
      },
      providerMeta: {
        sources,
        lastSyncedAt: new Date().toISOString(),
        rawgAvailable: Boolean(rawgGame),
        gmdbAvailable: Boolean(gmdbGame),
      },
    };
  }
}
