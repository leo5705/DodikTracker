/**
 * Age Rating Normalization Utility for Dodik Tracker.
 * Standardizes raw age rating strings from external providers (TMDB, Kinopoisk, RAWG, IGDB, AniList, iTunes)
 * while preserving original ratings and provider context.
 */

export interface NormalizedAgeRating {
  original: string;
  displayText: string;
  minAge?: number;
  provider?: string;
}

export function normalizeAgeRating(
  rawRating?: string | null,
  provider?: string
): NormalizedAgeRating | null {
  if (!rawRating || typeof rawRating !== 'string') return null;
  const clean = rawRating.trim();
  if (
    !clean ||
    clean === 'null' ||
    clean === 'undefined' ||
    clean === 'NR' ||
    clean === 'Unrated' ||
    clean === 'Not Rated' ||
    clean === '0'
  ) {
    return null;
  }

  // Kinopoisk formats: age18 -> 18+, age16 -> 16+, age12 -> 12+, age6 -> 6+, age0 -> 0+
  if (/^age\d+$/i.test(clean)) {
    const num = parseInt(clean.replace(/age/i, ''), 10);
    return { original: clean, displayText: `${num}+`, minAge: num, provider };
  }

  // Russian standard formats: 18+, 16+, 18, 16, 12+, 6+, 0+
  if (/^\d+\+?$/.test(clean)) {
    const num = parseInt(clean.replace('+', ''), 10);
    return { original: clean, displayText: `${num}+`, minAge: num, provider };
  }

  const lower = clean.toLowerCase();

  // ESRB ratings (RAWG, IGDB, TheGamesDB)
  if (lower.includes('adults only') || lower === 'ao' || lower.includes('18+')) {
    return { original: clean, displayText: '18+ (AO)', minAge: 18, provider };
  }
  if (lower.includes('mature') || lower === 'm' || lower.includes('17+')) {
    return { original: clean, displayText: '17+ (M)', minAge: 17, provider };
  }
  if (lower === 'teen' || lower === 't') {
    return { original: clean, displayText: '13+ (T)', minAge: 13, provider };
  }
  if (lower.includes('everyone 10') || lower === 'e10+' || lower === 'e10') {
    return { original: clean, displayText: '10+ (E10+)', minAge: 10, provider };
  }
  if (lower === 'everyone' || lower === 'e' || lower === 'ec') {
    return { original: clean, displayText: '0+ (E)', minAge: 0, provider };
  }

  // MPAA Ratings (TMDB, Kinopoisk)
  if (clean === 'G') return { original: clean, displayText: 'G (0+)', minAge: 0, provider };
  if (clean === 'PG') return { original: clean, displayText: 'PG (6+)', minAge: 6, provider };
  if (clean === 'PG-13') return { original: clean, displayText: 'PG-13', minAge: 13, provider };
  if (clean === 'R') return { original: clean, displayText: 'R (17+)', minAge: 17, provider };
  if (clean === 'NC-17') return { original: clean, displayText: 'NC-17 (18+)', minAge: 18, provider };

  // TV Ratings (TMDB)
  if (clean.toUpperCase() === 'TV-MA') return { original: clean, displayText: 'TV-MA (17+)', minAge: 17, provider };
  if (clean.toUpperCase() === 'TV-14') return { original: clean, displayText: 'TV-14', minAge: 14, provider };
  if (clean.toUpperCase() === 'TV-PG') return { original: clean, displayText: 'TV-PG', minAge: 10, provider };
  if (
    clean.toUpperCase() === 'TV-G' ||
    clean.toUpperCase() === 'TV-Y' ||
    clean.toUpperCase() === 'TV-Y7'
  ) {
    return { original: clean, displayText: clean.toUpperCase(), minAge: 0, provider };
  }

  // PEGI Ratings (Games)
  if (/pegi\s*\d+/i.test(clean)) {
    const num = parseInt(clean.replace(/\D/g, ''), 10);
    return { original: clean, displayText: `PEGI ${num}`, minAge: num, provider };
  }

  // iTunes Music
  if (lower === 'explicit') return { original: clean, displayText: 'Explicit (18+)', minAge: 18, provider };
  if (lower === 'clean') return { original: clean, displayText: 'Clean', minAge: 0, provider };

  // Default fallback: return clean original text
  return { original: clean, displayText: clean, provider };
}
