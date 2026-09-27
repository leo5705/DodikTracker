export type DodikCatalogItem = {
  kind: 'dodik';
  id: number;
  title: string;
  artistName: string;
  artistSlug?: string;
  artistId?: number;
  releaseId?: number;
  releaseTitle?: string;
  releaseSlug?: string;
  releaseCover?: string | null;
  duration?: number | null;
  explicit?: boolean;
  audioFile?: string;
  lyrics?: string | null;
  authorNote?: string | null;
  listenCount?: number;
  isFavorite?: boolean;
};

export type ExternalCatalogItem = {
  kind: 'external';
  id: string; // 'yt_dQw4w9WgXcQ'
  providerTrackId: string;
  provider: 'youtube';
  title: string;
  artist: string;
  artists: string[];
  artistId?: string | null;
  album: string | null;
  albumId?: string | null;
  durationSeconds: number | null;
  thumbnail: string | null;
  youtubeUrl?: string; // For backward compatibility with player and existing youtube items
  lyrics: string | null;
  explicit: boolean | null;
  playable: boolean;
  profileUrl?: string | null;
  releaseType?: 'single' | 'ep' | 'album' | null;
};

export interface ExternalArtist {
  provider: 'youtube';
  providerArtistId: string;
  name: string;
  avatar: string | null;
  description: string | null;
  profileUrl: string | null;
  followersCount?: number | null;
  trackCount?: number | null;
  isSubscribed?: boolean;
}

export interface ExternalRelease {
  provider: 'youtube';
  providerReleaseId: string;
  title: string;
  artist: string;
  artistId?: string | null;
  coverUrl: string | null;
  releaseType?: 'single' | 'ep' | 'album' | 'compilation' | 'live' | 'other' | null;
  year?: number | null;
  tracksCount?: number | null;
  tracks?: ExternalCatalogItem[];
  description?: string | null;
  profileUrl?: string | null;
}

export interface ExternalArtistFullProfile {
  artist: ExternalArtist;
  popularTracks: ExternalCatalogItem[];
  latestRelease: ExternalRelease | null;
  popularReleases: ExternalRelease[];
  albums: ExternalRelease[];
  singlesAndEps: ExternalRelease[];
  compilations: ExternalRelease[];
  liveReleases: ExternalRelease[];
  featuring: ExternalCatalogItem[];
  similarArtists: ExternalArtist[];
}

export type MusicCatalogItem = DodikCatalogItem | ExternalCatalogItem;

