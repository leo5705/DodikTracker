/**
 * Dodik Tracker - Live Lyrics & LRC Parser Utility
 * Clean, standard-compliant LRC parsing, plain/synced mode detection,
 * and high-performance binary search for active lyric lines.
 */

export interface LyricsLine {
  id: string;
  startTime: number; // in seconds (e.g. 12.35)
  text: string;
}

export interface LyricsData {
  mode: 'plain' | 'synced';
  text: string;
  lines: LyricsLine[];
}

// Matches metadata tags such as [ar:Artist], [ti:Title], [al:Album], [by:Author], [offset:+200], etc.
const METADATA_TAG_REGEX = /^\[[a-zA-Z]+:[^\]]*\]$/;

// Matches one or more timestamp tags at the beginning: [mm:ss], [mm:ss.xx], [mm:ss.xxx]
const TIMESTAMP_REGEX = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;

/**
 * Check if the provided text contains valid LRC timestamp patterns
 */
export function isLrc(content: string | null | undefined): boolean {
  if (!content || typeof content !== 'string') return false;
  const regex = /\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/;
  return regex.test(content);
}

/**
 * Parse a single timestamp match into seconds
 */
function parseTimestampToSeconds(minStr: string, secStr: string, fracStr?: string): number {
  const minutes = parseInt(minStr, 10) || 0;
  const seconds = parseInt(secStr, 10) || 0;
  let fractionMs = 0;

  if (fracStr) {
    if (fracStr.length === 1) {
      fractionMs = parseInt(fracStr, 10) * 100;
    } else if (fracStr.length === 2) {
      fractionMs = parseInt(fracStr, 10) * 10;
    } else {
      fractionMs = parseInt(fracStr.slice(0, 3), 10);
    }
  }

  return minutes * 60 + seconds + fractionMs / 1000;
}

/**
 * Parses raw LRC string into a sorted array of timed LyricsLine entries.
 * Handles multiple timestamps per line, ignores metadata tags, and strips empty entries.
 */
export function parseLrc(lrcText: string): LyricsLine[] {
  if (!lrcText || typeof lrcText !== 'string') return [];

  const rawLines = lrcText.split(/\r?\n/);
  const parsedItems: { startTime: number; text: string; origIndex: number }[] = [];

  let lineCounter = 0;

  for (const rawLine of rawLines) {
    lineCounter++;
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Ignore metadata tags like [ar:Artist], [ti:Title], [offset:0]
    if (METADATA_TAG_REGEX.test(trimmed)) {
      continue;
    }

    // Extract all timestamps from the line
    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    TIMESTAMP_REGEX.lastIndex = 0;

    while ((match = TIMESTAMP_REGEX.exec(trimmed)) !== null) {
      const timeInSec = parseTimestampToSeconds(match[1], match[2], match[3]);
      timestamps.push(timeInSec);
    }

    if (timestamps.length === 0) {
      continue;
    }

    // Strip all timestamps to get the lyric text
    const lyricText = trimmed.replace(TIMESTAMP_REGEX, '').trim();

    // Ignore empty lines if they don't have text
    if (!lyricText) continue;

    for (const time of timestamps) {
      parsedItems.push({
        startTime: time,
        text: lyricText,
        origIndex: lineCounter,
      });
    }
  }

  // Sort chronologically
  parsedItems.sort((a, b) => {
    if (a.startTime !== b.startTime) {
      return a.startTime - b.startTime;
    }
    return a.origIndex - b.origIndex;
  });

  return parsedItems.map((item, idx) => ({
    id: `lrc-${idx}-${item.startTime.toFixed(2)}`,
    startTime: item.startTime,
    text: item.text,
  }));
}

/**
 * Universal lyrics parser: detects whether lyrics are LRC (synced) or plain text.
 * Never fabricates timestamps or synchronizations.
 */
export function parseLyrics(content: string | null | undefined): LyricsData {
  if (!content || typeof content !== 'string' || !content.trim()) {
    return {
      mode: 'plain',
      text: '',
      lines: [],
    };
  }

  const cleanContent = content.trim();

  if (isLrc(cleanContent)) {
    const lines = parseLrc(cleanContent);
    if (lines.length > 0) {
      return {
        mode: 'synced',
        text: cleanContent,
        lines,
      };
    }
  }

  return {
    mode: 'plain',
    text: cleanContent,
    lines: [],
  };
}

/**
 * High-performance Binary Search to find the active lyric line index.
 * Returns -1 if playback is before the first timestamp.
 * O(log N) complexity for smooth 60fps playback without lag.
 */
export function findActiveLineIndex(lines: LyricsLine[], currentTime: number): number {
  if (!lines || lines.length === 0) return -1;
  if (currentTime < lines[0].startTime) return -1;

  let low = 0;
  let high = lines.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lines[mid].startTime <= currentTime) {
      result = mid;
      low = mid + 1; // Look for a later starting line that is still <= currentTime
    } else {
      high = mid - 1;
    }
  }

  return result;
}

/**
 * Helper to format seconds into standard LRC timestamp [mm:ss.xx]
 */
export function formatLrcTimestamp(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '[00:00.00]';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const hundredths = Math.floor((totalSeconds % 1) * 100);

  const minStr = String(mins).padStart(2, '0');
  const secStr = String(secs).padStart(2, '0');
  const hundStr = String(hundredths).padStart(2, '0');

  return `[${minStr}:${secStr}.${hundStr}]`;
}
