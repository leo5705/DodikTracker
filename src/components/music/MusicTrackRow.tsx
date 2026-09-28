import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Music2,
  Heart,
  Sparkles,
  Headphones,
} from 'lucide-react';
import { useMusicPlayer, Track } from '../../context/MusicPlayerContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';
import { resolvePlaybackSource } from '../../utils/musicPlaybackResolver.ts';
import { TrackActionsMenu } from './TrackActionsMenu.tsx';
import { ArtistLinks } from './ArtistLinks.tsx';

export interface AnyTrackItem {
  id: number | string;
  kind?: 'dodik' | 'external' | 'internal';
  source?: 'dodik' | 'youtube' | 'external';
  videoId?: string;
  providerTrackId?: string;
  youtubeUrl?: string;
  title: string;
  artistName?: string;
  artist?: string;
  artists?: string[];
  stageName?: string;
  artistSlug?: string;
  artistId?: number | string;
  releaseId?: number;
  releaseTitle?: string;
  album?: string | null;
  releaseCover?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  durationSeconds?: number | null;
  explicit?: boolean | null;
  isExplicit?: boolean | null;
  isFavorite?: boolean;
  lyrics?: string | null;
  authorNote?: string | null;
  releaseSlug?: string;
  slug?: string;
  audioFile?: string;
  trackNumber?: number;
  listenCount?: number;
  listensCount?: number;
  explanation?: string | null;
  reason?: string | null;
  addedBy?: {
    id: string | number;
    username: string;
    avatar?: string | null;
  } | null;
}

export function normalizeToPlayerTrack(item: AnyTrackItem): Track {
  const resolution = resolvePlaybackSource(item);

  const artistName =
    item.artist ||
    item.artistName ||
    item.stageName ||
    (item.artists && item.artists[0]) ||
    'Исполнитель';

  const releaseTitle = item.album || item.releaseTitle || null;
  const coverUrl = item.thumbnail || item.releaseCover || null;

  if (resolution.sourceType === 'youtube' && resolution.videoId) {
    return {
      id: item.id,
      source: 'youtube',
      videoId: resolution.videoId,
      youtubeUrl: item.youtubeUrl || resolution.url || `https://www.youtube.com/watch?v=${resolution.videoId}`,
      title: item.title,
      artistName,
      artistId: item.artistId ? String(item.artistId) : undefined,
      artistSlug: item.artistSlug || '',
      releaseId: item.releaseId,
      releaseTitle,
      releaseCover: coverUrl,
      thumbnail: coverUrl,
      releaseSlug: item.releaseSlug || '',
      album: releaseTitle,
      duration: item.durationSeconds || item.duration || null,
      explicit: Boolean(item.explicit || item.isExplicit),
      audioFile: item.audioFile || `yt_${resolution.videoId}`,
      slug: item.slug || `yt_${resolution.videoId}`,
      trackNumber: item.trackNumber || 1,
      lyrics: item.lyrics || null,
      isFavorite: item.isFavorite,
      playable: true,
    };
  }

  if (resolution.playable && resolution.url) {
    return {
      id: item.id,
      source: resolution.sourceType === 'external' ? 'external' : 'dodik',
      title: item.title,
      artistName,
      artistSlug: item.artistSlug || '',
      artistId: item.artistId ? String(item.artistId) : undefined,
      releaseId: item.releaseId,
      releaseTitle: releaseTitle || '',
      releaseCover: coverUrl,
      releaseSlug: item.releaseSlug || '',
      thumbnail: coverUrl,
      album: releaseTitle,
      audioFile: resolution.url,
      slug: item.slug || '',
      videoId: item.videoId || item.providerTrackId,
      youtubeUrl: item.youtubeUrl,
      duration: item.duration || item.durationSeconds || null,
      explicit: Boolean(item.explicit || item.isExplicit),
      lyrics: item.lyrics || null,
      trackNumber: item.trackNumber || 1,
      isFavorite: item.isFavorite,
      playable: true,
    };
  }

  return {
    id: item.id,
    source: (item.source as any) || 'dodik',
    title: item.title,
    artistName,
    artistSlug: item.artistSlug || '',
    artistId: item.artistId ? String(item.artistId) : undefined,
    releaseId: item.releaseId,
    releaseTitle: releaseTitle || '',
    releaseCover: coverUrl,
    releaseSlug: item.releaseSlug || '',
    thumbnail: coverUrl,
    album: releaseTitle,
    audioFile: item.audioFile || '',
    slug: item.slug || '',
    videoId: item.videoId || item.providerTrackId,
    youtubeUrl: item.youtubeUrl,
    duration: item.duration || item.durationSeconds || null,
    explicit: Boolean(item.explicit || item.isExplicit),
    lyrics: item.lyrics || null,
    trackNumber: item.trackNumber || 1,
    isFavorite: item.isFavorite,
    playable: false,
  };
}

export const formatDuration = (secs?: number | null) => {
  if (!secs || isNaN(secs) || secs < 0) return '--:--';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export interface MusicTrackRowProps {
  track: AnyTrackItem;
  index?: number;
  queueContext?: AnyTrackItem[];
  variant?: 'row' | 'card';
  showCover?: boolean;
  showArtist?: boolean;
  showAlbum?: boolean;
  showDuration?: boolean;
  showPlayCount?: boolean;
  showIndex?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
  extraActions?: React.ReactNode;
  className?: string;
  explanation?: string | null;
  reason?: string | null;
  onPlay?: (track: AnyTrackItem) => void;
}

export const MusicTrackRow: React.FC<MusicTrackRowProps> = ({
  track,
  index,
  queueContext,
  variant = 'row',
  showCover = true,
  showArtist = true,
  showAlbum = true,
  showDuration = true,
  showPlayCount = true,
  showIndex = false,
  onRemove,
  removeLabel = 'Удалить из плейлиста',
  extraActions,
  className = '',
  explanation,
  reason,
  onPlay,
}) => {
  const { navigate } = useRouter();
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    playTrack,
    toggleFavoriteTrack,
  } = useMusicPlayer();

  const [isFav, setIsFav] = useState<boolean>(Boolean(track.isFavorite));

  useEffect(() => {
    setIsFav(Boolean(track.isFavorite));
  }, [track.isFavorite]);

  // Sync reactive favorite status
  useEffect(() => {
    const handleFavChange = (e: any) => {
      const { trackId, isFavorite } = e.detail || {};
      if (String(trackId) === String(track.id)) {
        setIsFav(isFavorite);
      }
    };
    window.addEventListener('music:favorite_track_changed', handleFavChange);
    return () => window.removeEventListener('music:favorite_track_changed', handleFavChange);
  }, [track.id]);

  const playerTrack = normalizeToPlayerTrack(track);
  const isCurrentLoaded = String(currentTrack?.id) === String(playerTrack.id);
  const isCurrentPlaying = isCurrentLoaded && isPlaying;

  const rawCoverUrl = playerTrack.releaseCover || playerTrack.thumbnail || null;
  const coverUrl = getBestMusicImageUrl(rawCoverUrl, variant === 'card' ? 'medium' : 'small');
  const artistName = playerTrack.artistName || 'Исполнитель';
  const albumTitle = playerTrack.releaseTitle || playerTrack.album || null;
  const listenCount = track.listenCount ?? track.listensCount;

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPlay) {
      onPlay(track);
      return;
    }

    if (isCurrentLoaded) {
      togglePlayPause();
      return;
    }

    const fullQueue =
      queueContext && queueContext.length > 0
        ? queueContext.map(normalizeToPlayerTrack)
        : [playerTrack];

    playTrack(playerTrack, fullQueue, {
      id: typeof playerTrack.releaseId === 'number' ? playerTrack.releaseId : undefined,
      title: albumTitle || playerTrack.title,
      cover: coverUrl,
      slug: playerTrack.releaseSlug || '',
      artistName: artistName,
      artistSlug: playerTrack.artistSlug || '',
    });
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = await toggleFavoriteTrack(playerTrack.id, isFav);
    setIsFav(next);
  };

  const handleReleaseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playerTrack.releaseSlug) {
      navigate(`/music/release/${playerTrack.releaseSlug}`);
    } else if (playerTrack.releaseId) {
      navigate(`/music/release/${playerTrack.releaseId}`);
    } else if (albumTitle) {
      navigate(`/music/search?q=${encodeURIComponent(albumTitle)}`);
    }
  };

  // GRID CARD VARIANT
  if (variant === 'card') {
    return (
      <div
        onClick={handlePlayToggle}
        className={`group relative p-3 sm:p-4 rounded-2xl bg-[#0B0D20] border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
          isCurrentLoaded
            ? 'border-purple-500/60 bg-purple-950/20 shadow-xl shadow-purple-900/20'
            : 'border-[#1E2442] hover:border-purple-500/40 hover:shadow-xl hover:shadow-purple-900/10'
        } ${className}`}
      >
        <div className="space-y-3">
          {/* Cover Art */}
          <div className="relative aspect-square rounded-xl overflow-hidden bg-[#11152A] border border-[#1E2442] group-hover:shadow-md transition-all">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={playerTrack.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-950/40 to-slate-900 flex items-center justify-center text-purple-400">
                <Music2 className="w-10 h-10 opacity-60" />
              </div>
            )}

            {/* Play Button Overlay */}
            <div
              className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center transition-opacity duration-200 ${
                isCurrentPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <button
                type="button"
                onClick={handlePlayToggle}
                className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-950/60 transform active:scale-95 transition cursor-pointer"
                title={isCurrentPlaying ? 'Пауза' : 'Воспроизвести'}
                aria-label={isCurrentPlaying ? 'Пауза' : 'Воспроизвести'}
              >
                {isCurrentPlaying ? (
                  <Pause className="w-5 h-5 fill-white" />
                ) : (
                  <Play className="w-5 h-5 fill-white ml-0.5" />
                )}
              </button>
            </div>

            {/* Explicit Badge */}
            {playerTrack.explicit && (
              <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-black rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase">
                18+
              </span>
            )}

            {/* Duration Tag */}
            {showDuration && playerTrack.duration && (
              <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-black/70 backdrop-blur-md text-slate-300 border border-white/10">
                {formatDuration(playerTrack.duration)}
              </span>
            )}
          </div>

          {/* Details */}
          <div className="space-y-1 min-w-0">
            <h4
              className={`text-sm font-bold truncate font-mono transition-colors ${
                isCurrentLoaded ? 'text-purple-300' : 'text-white group-hover:text-purple-300'
              }`}
            >
              {playerTrack.title}
            </h4>

            {showArtist && (
              <p className="text-xs text-[#94A3B8] truncate">
                <ArtistLinks
                  artistName={artistName}
                  artists={track.artists}
                  artistSlug={playerTrack.artistSlug}
                  artistId={playerTrack.artistId}
                />
                {showAlbum && albumTitle && (
                  <>
                    <span className="mx-1 text-slate-600">·</span>
                    <span
                      onClick={handleReleaseClick}
                      className="hover:text-purple-300 hover:underline cursor-pointer"
                    >
                      {albumTitle}
                    </span>
                  </>
                )}
              </p>
            )}

            {(track.explanation || track.reason || explanation || reason) && (
              <p className="text-[11px] text-purple-300 font-medium truncate flex items-center gap-1.5 pt-0.5">
                <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                <span className="truncate">{track.explanation || track.reason || explanation || reason}</span>
              </p>
            )}
          </div>
        </div>

        {/* Minimal clean action bar: Favorite + TrackActionsMenu */}
        <div className="pt-3 mt-2 border-t border-[#1E2442]/60 flex items-center justify-between gap-1 text-xs">
          <button
            type="button"
            onClick={handleToggleFavorite}
            className={`p-2 rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
              isFav
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                : 'bg-[#11152A] border-[#1E2442] text-slate-400 hover:text-white hover:bg-[#1A203F]'
            }`}
            title={isFav ? 'Удалить из любимых' : 'Добавить в любимые'}
            aria-label={isFav ? 'Удалить из любимых' : 'Добавить в любимые'}
          >
            <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : 'text-slate-400'}`} />
          </button>

          <TrackActionsMenu
            track={{
              id: track.id,
              source: track.source,
              videoId: track.videoId,
              providerTrackId: track.providerTrackId,
              title: playerTrack.title,
              artistName: artistName,
              artists: track.artists,
              artistSlug: playerTrack.artistSlug,
              artistId: playerTrack.artistId,
              releaseTitle: albumTitle || undefined,
              releaseCover: coverUrl,
              thumbnail: coverUrl,
              releaseId: playerTrack.releaseId,
              releaseSlug: playerTrack.releaseSlug,
              duration: playerTrack.duration,
              explicit: playerTrack.explicit,
              isFavorite: isFav,
            }}
            onRemoveFromPlaylist={onRemove}
            removeFromPlaylistLabel={removeLabel}
            btnClassName="p-2 rounded-xl border border-[#1E2442] bg-[#11152A] hover:bg-[#1A203F] text-slate-400 hover:text-white transition cursor-pointer"
          />
        </div>
      </div>
    );
  }

  // ROW VARIANT (Standard unified horizontal track row)
  return (
    <div
      onClick={handlePlayToggle}
      className={`group p-2.5 sm:p-3 rounded-2xl bg-[#0B0D20] border transition-all duration-200 flex items-center justify-between gap-3 sm:gap-4 cursor-pointer ${
        isCurrentLoaded
          ? 'border-purple-500/50 bg-purple-950/20 shadow-md shadow-purple-950/30'
          : 'border-[#1E2442] hover:border-purple-500/30 hover:bg-[#0E1128]'
      } ${className}`}
    >
      {/* Left Side: Optional Index, Artwork & Track Info */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
        {/* Optional Extra Controls (e.g. Playlist Reorder Arrows) */}
        {extraActions && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {extraActions}
          </div>
        )}

        {/* Index / Track Number */}
        {(showIndex || index !== undefined) && (
          <div className="w-6 text-center shrink-0">
            {isCurrentPlaying ? (
              <div className="flex items-center justify-center gap-0.5 text-purple-400">
                <span className="w-1 h-3.5 bg-purple-400 animate-pulse rounded-full" />
                <span className="w-1 h-4.5 bg-purple-300 animate-bounce rounded-full" />
                <span className="w-1 h-2.5 bg-purple-400 animate-pulse rounded-full" />
              </div>
            ) : (
              <span className="text-xs font-mono text-slate-500 group-hover:text-slate-300 transition-colors">
                {index !== undefined ? String(index).padStart(2, '0') : '#'}
              </span>
            )}
          </div>
        )}

        {/* Artwork Thumbnail */}
        {showCover && (
          <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-[#11152A] border border-[#1E2442] shrink-0">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={playerTrack.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-purple-950/40 flex items-center justify-center text-purple-400">
                <Music2 className="w-5 h-5 opacity-60" />
              </div>
            )}

            {/* Mini Play Button Overlay */}
            <div
              className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                isCurrentPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              {isCurrentPlaying ? (
                <Pause className="w-4 h-4 fill-white text-white" />
              ) : (
                <Play className="w-4 h-4 fill-white text-white ml-0.5" />
              )}
            </div>
          </div>
        )}

        {/* Fallback Play button if cover is hidden and no index */}
        {!showCover && !showIndex && index === undefined && (
          <button
            type="button"
            onClick={handlePlayToggle}
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition ${
              isCurrentPlaying
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-purple-600/80 hover:bg-purple-600 text-white'
            }`}
          >
            {isCurrentPlaying ? (
              <Pause className="w-4 h-4 fill-white" />
            ) : (
              <Play className="w-4 h-4 fill-white ml-0.5" />
            )}
          </button>
        )}

        {/* Title & Multi-artist details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4
              className={`text-sm font-bold truncate font-mono transition-colors ${
                isCurrentLoaded ? 'text-purple-300' : 'text-white group-hover:text-purple-300'
              }`}
            >
              {playerTrack.title}
            </h4>
            {playerTrack.explicit && (
              <span className="px-1.5 py-0.2 text-[9px] font-black rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase shrink-0">
                18+
              </span>
            )}
          </div>

          {showArtist && (
            <p className="text-xs text-[#94A3B8] truncate mt-0.5">
              <ArtistLinks
                artistName={artistName}
                artists={track.artists}
                artistSlug={playerTrack.artistSlug}
                artistId={playerTrack.artistId}
              />
              {showAlbum && albumTitle && (
                <>
                  <span className="mx-1.5 text-slate-600">·</span>
                  <span
                    onClick={handleReleaseClick}
                    className="hover:text-purple-300 hover:underline cursor-pointer"
                  >
                    {albumTitle}
                  </span>
                </>
              )}
              {track.addedBy && (
                <>
                  <span className="mx-1.5 text-slate-600">·</span>
                  <span className="text-[10px] text-slate-500">
                    @{track.addedBy.username}
                  </span>
                </>
              )}
            </p>
          )}

          {(track.explanation || track.reason || explanation || reason) && (
            <p className="text-[11px] text-purple-300 font-medium truncate flex items-center gap-1.5 mt-0.5">
              <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
              <span className="truncate">{track.explanation || track.reason || explanation || reason}</span>
            </p>
          )}
        </div>
      </div>

      {/* Right Side: Play Count, Duration, Favorite, and TrackActionsMenu */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {showPlayCount && typeof listenCount === 'number' && listenCount > 0 && (
          <span
            className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-950/40 border border-purple-500/20 text-[11px] font-mono text-purple-300/90"
            title="Прослушивания"
          >
            <Headphones className="w-3 h-3 text-purple-400" />
            <span>{listenCount.toLocaleString('ru-RU')}</span>
          </span>
        )}

        {showDuration && (
          <span className="text-xs font-mono text-slate-400 select-none hidden sm:inline mr-1">
            {formatDuration(playerTrack.duration)}
          </span>
        )}

        {/* Essential Action: Favorite */}
        <button
          type="button"
          onClick={handleToggleFavorite}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            isFav
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
              : 'bg-[#11152A] border-[#1E2442] text-slate-400 hover:text-white hover:bg-[#1A203F]'
          }`}
          title={isFav ? 'Удалить из любимых' : 'Добавить в любимые'}
          aria-label={isFav ? 'Удалить из любимых' : 'Добавить в любимые'}
        >
          <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : 'text-slate-400'}`} />
        </button>

        {/* Essential Action: Unified Track Actions Menu */}
        <TrackActionsMenu
          track={{
            id: track.id,
            source: track.source,
            videoId: track.videoId,
            providerTrackId: track.providerTrackId,
            title: playerTrack.title,
            artistName: artistName,
            artists: track.artists,
            artistSlug: playerTrack.artistSlug,
            artistId: playerTrack.artistId,
            releaseTitle: albumTitle || undefined,
            releaseCover: coverUrl,
            thumbnail: coverUrl,
            releaseId: playerTrack.releaseId,
            releaseSlug: playerTrack.releaseSlug,
            duration: playerTrack.duration,
            explicit: playerTrack.explicit,
            isFavorite: isFav,
          }}
          onRemoveFromPlaylist={onRemove}
          removeFromPlaylistLabel={removeLabel}
          btnClassName="p-2 rounded-xl border border-[#1E2442] bg-[#11152A] hover:bg-[#1A203F] text-slate-400 hover:text-white transition cursor-pointer"
        />
      </div>
    </div>
  );
};
