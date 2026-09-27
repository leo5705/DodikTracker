/**
 * Lyrics Metadata Matcher
 * 
 * Enforces strict matching between expected song metadata and candidate lyrics results.
 * Prevents wrong song lyrics from ever being associated with a track.
 * Follows strict anti-fabrication rules: returns 0 confidence when confidence is insufficient.
 */

export function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    // Replace punctuation and special characters with spaces
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    // Collapse multiple whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Removes typical title noise such as:
 * - (feat. Artist) / [ft. Artist]
 * - (Official Music Video) / [Lyric Video]
 * - (Remastered 2021) / [Radio Edit]
 * - (Live at ...)
 */
export function cleanSongTitle(title: string): string {
  if (!title) return '';
  let cleaned = title
    // Remove (feat. ...) or [feat. ...] or (with ...)
    .replace(/[\(\[\{]\s*(?:feat|ft|featuring|with)\.?\s+[^)\]\}]+[\)\]\}]/gi, '')
    // Remove (Remix ...), [Remix], (Acoustic ...)
    .replace(/[\(\[\{]\s*(?:remix|acoustic|vip|club\s+mix|extended\s+mix|deluxe|bonus|live|mono|stereo|album\s+version|radio\s+edit)[^\)\]\}]*[\)\]\}]/gi, '')
    // Remove (Official Video), [Official Audio], (Lyric Video), etc.
    .replace(/[\(\[\{]\s*(?:official\s+)?(?:music\s+)?(?:video|audio|lyric\s+video|visualizer|clip)[\)\]\}]/gi, '')
    // Remove (Remastered ...)
    .replace(/[\(\[\{]\s*remaster(?:ed)?(?:\s+\d{4})?[^\)\]\}]*[\)\]\}]/gi, '')
    // Remove trailing "- Single", "- EP"
    .replace(/\s*-\s*(?:single|ep|remastered|live|remix)\s*$/i, '');

  return normalizeText(cleaned);
}

/**
 * Extracts primary artist name and removes noise:
 * - Topic channel suffix ("Artist - Topic")
 * - feat. / ft. secondary artists
 */
export function cleanArtistName(artist: string): string {
  if (!artist) return '';
  let cleaned = artist
    // Remove " - Topic" suffix from YouTube auto-generated channels
    .replace(/\s*-\s*Topic$/i, '')
    // Split by feat / ft / with / & and take primary artist
    .split(/\s+(?:feat|ft|featuring|with|&)\.?\s+/i)[0];

  return normalizeText(cleaned);
}

/**
 * Calculates matching confidence score between 0 and 1.
 * 1.0 = Perfect match
 * >= 0.7 = Acceptable match
 * < 0.7 = Reject (return null)
 */
export function calculateMatchConfidence(
  expectedTitle: string,
  expectedArtist: string,
  candidateTitle: string,
  candidateArtist: string
): number {
  const normExpTitle = cleanSongTitle(expectedTitle);
  const normCandTitle = cleanSongTitle(candidateTitle);

  const normExpArtist = cleanArtistName(expectedArtist);
  const normCandArtist = cleanArtistName(candidateArtist);

  if (!normExpTitle || !normCandTitle) return 0;

  // 1. Title match evaluation
  let titleScore = 0;
  if (normExpTitle === normCandTitle) {
    titleScore = 1.0;
  } else if (normExpTitle.includes(normCandTitle) || normCandTitle.includes(normExpTitle)) {
    const longer = Math.max(normExpTitle.length, normCandTitle.length);
    const shorter = Math.min(normExpTitle.length, normCandTitle.length);
    titleScore = shorter / longer;
  } else {
    // Check word intersection
    const expWords = new Set(normExpTitle.split(' ').filter((w) => w.length > 2));
    const candWords = new Set(normCandTitle.split(' ').filter((w) => w.length > 2));
    if (expWords.size > 0 && candWords.size > 0) {
      let intersection = 0;
      for (const w of expWords) {
        if (candWords.has(w)) intersection++;
      }
      titleScore = (intersection * 2) / (expWords.size + candWords.size);
    }
  }

  // 2. Artist match evaluation
  let artistScore = 0;
  if (!normExpArtist || !normCandArtist) {
    // If artist information is completely absent, rely solely on title but penalize score
    artistScore = 0.5;
  } else if (normExpArtist === normCandArtist) {
    artistScore = 1.0;
  } else if (normExpArtist.includes(normCandArtist) || normCandArtist.includes(normExpArtist)) {
    artistScore = 0.85;
  } else {
    // Check if artist words overlap (e.g. "Daft Punk" vs "Daft")
    const expArtWords = normExpArtist.split(' ');
    const candArtWords = normCandArtist.split(' ');
    const hasOverlap = expArtWords.some((w) => w.length > 2 && candArtWords.includes(w));
    artistScore = hasOverlap ? 0.6 : 0;
  }

  // Total weighted confidence (Title: 55%, Artist: 45%)
  const totalConfidence = titleScore * 0.55 + artistScore * 0.45;

  return Math.round(totalConfidence * 100) / 100;
}
