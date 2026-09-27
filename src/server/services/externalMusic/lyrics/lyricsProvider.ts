/**
 * Lyrics Provider Interface
 * 
 * Clean abstraction allowing multiple pluggable lyrics providers (Genius, Musixmatch, etc.)
 * without leaking provider details or dependencies to UI components.
 */

export interface LyricsSearchInput {
  title: string;
  artists: string[];
  album?: string | null;
  durationSeconds?: number | null;
}

export interface LyricsResult {
  text: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  durationSeconds?: number | null;
  confidence?: number | null;
  provider: string; // Internal backend metadata - NEVER sent to public UI
}

export interface LyricsProvider {
  readonly name: string;
  searchLyrics(input: LyricsSearchInput): Promise<LyricsResult | null>;
  testConnection(): Promise<{ ok: boolean; message: string; latency?: number }>;
}
