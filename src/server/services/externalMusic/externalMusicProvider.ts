import { ExternalCatalogItem } from './types.ts';

export interface ExternalMusicProvider {
  name: string;
  searchSongs(query: string, limit?: number): Promise<ExternalCatalogItem[]>;
  getTrackDetails(providerTrackId: string): Promise<ExternalCatalogItem | null>;
  getLyrics(providerTrackId: string): Promise<string | null>;
}
