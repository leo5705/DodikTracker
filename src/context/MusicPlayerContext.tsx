import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { useRouter } from './RouterContext.tsx';
import { useAuth } from './AuthContext.tsx';
import { loadYouTubeIframeAPI } from '../utils/youtubeIframeApi.ts';
import { LiveLyrics } from '../components/music/LiveLyrics.tsx';
import { ExpandedMusicPlayer } from '../components/music/ExpandedMusicPlayer.tsx';
import { FullscreenMusicPlayer } from '../components/music/FullscreenMusicPlayer.tsx';
import { FullscreenLyricsOverlay } from '../components/music/FullscreenLyricsOverlay.tsx';
import { getBestMusicImageUrl } from '../utils/musicImageUtils.ts';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  ChevronUp,
  ChevronDown,
  X,
  ListMusic,
  FileText,
  Info,
  Music2,
  Disc,
  Sparkles,
  ExternalLink,
  Heart,
  Loader2,
} from 'lucide-react';

export type TrackSource = 'dodik' | 'youtube';

export interface ExternalYouTubeTrack {
  source: 'youtube';
  videoId: string;
  title: string;
  artist: string;
  artists: string[];
  artistId?: string | null;
  album?: string | null;
  durationSeconds?: number | null;
  thumbnail: string | null;
  youtubeUrl: string;
  isExplicit?: boolean | null;
}

export interface Track {
  id: number | string;
  source?: TrackSource;
  videoId?: string;
  providerTrackId?: string;
  youtubeUrl?: string;
  thumbnail?: string | null;
  album?: string | null;
  releaseId?: number;
  releaseTitle?: string;
  releaseCover?: string | null;
  releaseSlug?: string;
  artistId?: number | string;
  externalArtistId?: string | null;
  artistName?: string;
  artistSlug?: string;
  title: string;
  slug?: string;
  trackNumber?: number;
  audioFile?: string;
  duration?: number | null;
  explicit?: boolean;
  playable?: boolean;
  lyrics?: string | null;
  authorNote?: string | null;
  listenCount?: number;
  isFavorite?: boolean;
}

export function convertYouTubeTrackToPlayerTrack(yt: ExternalYouTubeTrack): Track {
  return {
    id: `yt_${yt.videoId}`,
    source: 'youtube',
    videoId: yt.videoId,
    youtubeUrl: yt.youtubeUrl,
    title: yt.title,
    artistName: yt.artist || (yt.artists && yt.artists[0]) || 'Исполнитель',
    releaseTitle: yt.album || 'Сингл',
    releaseCover: yt.thumbnail || null,
    thumbnail: yt.thumbnail || null,
    album: yt.album || null,
    duration: yt.durationSeconds || null,
    explicit: Boolean(yt.isExplicit),
    audioFile: '',
    trackNumber: 1,
  };
}

export function normalizePlayerTrack(track: Track): Track {
  const isYt =
    track.source === 'youtube' ||
    (typeof track.id === 'string' && track.id.startsWith('yt_')) ||
    Boolean(track.videoId);

  const videoId =
    track.videoId ||
    (typeof track.id === 'string' && track.id.startsWith('yt_')
      ? track.id.replace(/^yt_/, '')
      : undefined);

  if (isYt && videoId) {
    return {
      ...track,
      id: typeof track.id === 'string' && track.id.startsWith('yt_') ? track.id : `yt_${videoId}`,
      source: 'youtube',
      videoId,
      youtubeUrl: track.youtubeUrl || `https://www.youtube.com/watch?v=${videoId}`,
      releaseCover: track.releaseCover || track.thumbnail || null,
      thumbnail: track.thumbnail || track.releaseCover || null,
      artistName: track.artistName || 'Исполнитель',
      releaseTitle: track.releaseTitle || track.album || 'Сингл',
    };
  }

  return {
    ...track,
    source: track.source || 'dodik',
  };
}

export interface ReleaseInfo {
  id?: number;
  title: string;
  cover?: string | null;
  slug: string;
  artistName: string;
  artistSlug: string;
}

export interface ArtistInfo {
  id?: number;
  stageName: string;
  slug: string;
}

export interface GeniusAnnotation {
  id: number;
  fragment: string;
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
  role: string;
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

export type PlayerState = 'mini' | 'expanded' | 'fullscreen' | 'lyrics';
export type PlayerPlaybackStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'blocked' | 'error';
type RepeatMode = 'OFF' | 'ONE' | 'ALL';
type PlayerTab = 'queue' | 'lyrics' | 'note';

export interface PlaybackErrorState {
  trackId: string | number;
  trackTitle: string;
  reason: 'embed_restricted' | 'video_unavailable' | 'audio_missing' | 'network_error' | 'unplayable';
  message: string;
  youtubeUrl?: string;
  canOpenExternal?: boolean;
  provider?: TrackSource;
}

interface MusicPlayerContextType {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  releaseInfo: ReleaseInfo | null;
  artistInfo: ArtistInfo | null;
  geniusInfo: GeniusTrackInfo | null;
  isLoadingGenius: boolean;
  isGeniusConfigured: boolean;
  isInsightsOpen: boolean;
  setIsInsightsOpen: (open: boolean) => void;
  toggleInsights: () => void;
  focusedAnnotation: GeniusAnnotation | null;
  setFocusedAnnotation: (ann: GeniusAnnotation | null) => void;
  isPlaying: boolean;
  playbackStatus: PlayerPlaybackStatus;
  playbackError: PlaybackErrorState | null;
  clearPlaybackError: () => void;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playerState: PlayerState;
  previousPlayerState: PlayerState;
  isExpanded: boolean;
  isFullscreen: boolean;
  isLyricsOpen: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  activeTab: PlayerTab;
  setActiveTab: (tab: PlayerTab) => void;
  setPlayerState: (state: PlayerState) => void;
  openExpanded: () => void;
  openFullscreen: () => void;
  openLyrics: () => void;
  closeExpanded: () => void;
  closeFullscreen: () => void;
  closeLyrics: () => void;
  playTrack: (track: Track, newQueue?: Track[], newRelease?: ReleaseInfo | null) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (trackId: string | number) => void;
  togglePlayPause: () => void;
  playNext: () => void;
  playPrev: () => void;
  playQueueIndex: (index: number) => void;
  seek: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  closePlayer: () => void;
  isCurrentTrackFavorite: boolean;
  toggleFavoriteTrack: (trackId?: number | string) => Promise<boolean>;
  updateTrackLyrics: (lyrics: string) => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

export const MusicPlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { dbUser, authFetch } = useAuth();
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState<number>(-1);
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [artistInfo, setArtistInfo] = useState<ArtistInfo | null>(null);
  const [geniusInfo, setGeniusInfo] = useState<GeniusTrackInfo | null>(null);
  const [isLoadingGenius, setIsLoadingGenius] = useState<boolean>(false);
  const [isGeniusConfigured, setIsGeniusConfigured] = useState<boolean>(true);
  const [isInsightsOpen, setIsInsightsOpen] = useState<boolean>(false);
  const [focusedAnnotation, setFocusedAnnotation] = useState<GeniusAnnotation | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackStatus, setPlaybackStatus] = useState<PlayerPlaybackStatus>('idle');
  const [playbackError, setPlaybackError] = useState<PlaybackErrorState | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playerState, setPlayerStateInternal] = useState<PlayerState>('mini');
  const [previousPlayerState, setPreviousPlayerState] = useState<PlayerState>('expanded');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('OFF');
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<PlayerTab>('queue');

  const toggleInsights = () => {
    setIsInsightsOpen((prev) => !prev);
  };

  const previousStateRef = useRef<PlayerState>('expanded');
  const consecutiveErrorsRef = useRef<number>(0);

  const clearPlaybackError = () => {
    setPlaybackError(null);
  };

  const setPlayerState = (nextState: PlayerState) => {
    setPlayerStateInternal((prev) => {
      if (prev !== nextState && prev !== 'lyrics') {
        previousStateRef.current = prev;
        setPreviousPlayerState(prev);
      }
      return nextState;
    });
  };

  const isExpanded = playerState === 'expanded';
  const isFullscreen = playerState === 'fullscreen';
  const isLyricsOpen = playerState === 'lyrics';

  const openExpanded = () => setPlayerState('expanded');
  const openFullscreen = () => setPlayerState('fullscreen');
  const openLyrics = () => {
    setPlayerStateInternal((prev) => {
      if (prev !== 'lyrics') {
        const fallbackPrev = prev === 'mini' ? 'expanded' : prev;
        previousStateRef.current = fallbackPrev;
        setPreviousPlayerState(fallbackPrev);
      }
      return 'lyrics';
    });
  };

  const closeExpanded = () => setPlayerState('mini');
  const closeFullscreen = () => setPlayerState('expanded');
  const closeLyrics = () => {
    const target = previousStateRef.current && previousStateRef.current !== 'lyrics' ? previousStateRef.current : 'fullscreen';
    setPlayerState(target);
  };

  const setIsExpanded: React.Dispatch<React.SetStateAction<boolean>> = (value) => {
    setPlayerStateInternal((prev) => {
      const isExp = prev === 'expanded';
      const nextBool = typeof value === 'function' ? value(isExp) : value;
      return nextBool ? 'expanded' : 'mini';
    });
  };

  const setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>> = (value) => {
    setPlayerStateInternal((prev) => {
      const isFull = prev === 'fullscreen';
      const nextBool = typeof value === 'function' ? value(isFull) : value;
      return nextBool ? 'fullscreen' : 'expanded';
    });
  };

  // Scroll Lock & Scrollbar Compensation for Fullscreen and Lyrics modes
  const scrollYRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (playerState === 'fullscreen' || playerState === 'lyrics') {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      scrollYRef.current = scrollY;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      const origPosition = document.body.style.position;
      const origTop = document.body.style.top;
      const origWidth = document.body.style.width;
      const origOverflow = document.body.style.overflow;
      const origPaddingRight = document.body.style.paddingRight;
      const origTouchAction = document.body.style.touchAction;
      const origOverscroll = document.documentElement.style.overscrollBehavior;

      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      document.body.style.touchAction = 'none';
      document.documentElement.style.overscrollBehavior = 'none';

      return () => {
        document.body.style.position = origPosition || '';
        document.body.style.top = origTop || '';
        document.body.style.width = origWidth || '';
        document.body.style.overflow = origOverflow || '';
        document.body.style.paddingRight = origPaddingRight || '';
        document.body.style.touchAction = origTouchAction || '';
        document.documentElement.style.overscrollBehavior = origOverscroll || '';
        window.scrollTo({ top: scrollYRef.current, behavior: 'instant' });
      };
    }
  }, [playerState]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const currentTrackRef = useRef<Track | null>(null);
  const repeatModeRef = useRef<RepeatMode>('OFF');
  const isShuffleRef = useRef<boolean>(false);
  const queueRef = useRef<Track[]>([]);
  const queueIndexRef = useRef<number>(-1);
  const isMutedRef = useRef<boolean>(false);
  const volumeRef = useRef<number>(0.8);

  const playbackSessionRef = useRef<{
    sessionId: string;
    trackId: number | string;
    accumulatedSeconds: number;
    lastTick: number;
    reported: boolean;
  } | null>(null);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
    if (currentTrack && dbUser) {
      authFetch('/api/music/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackId: currentTrack.id,
          provider: currentTrack.source || 'dodik',
          title: currentTrack.title,
          artistName: currentTrack.artistName || 'Исполнитель',
          artistId: currentTrack.artistId || null,
          releaseTitle: currentTrack.releaseTitle || null,
          releaseCover: currentTrack.releaseCover || currentTrack.thumbnail || null,
          durationSeconds: currentTrack.duration || null,
        }),
      }).catch(() => {});
    }
  }, [currentTrack?.id, dbUser?.id]);

  // Fetch Genius Track Insights automatically when current track changes
  useEffect(() => {
    if (!currentTrack) {
      setGeniusInfo(null);
      setIsLoadingGenius(false);
      setFocusedAnnotation(null);
      return;
    }

    let isMounted = true;
    setIsLoadingGenius(true);
    setFocusedAnnotation(null);

    const title = currentTrack.title || '';
    const artist = currentTrack.artistName || releaseInfo?.artistName || '';
    const album = currentTrack.releaseTitle || releaseInfo?.title || '';

    const queryParams = new URLSearchParams();
    if (title) queryParams.set('title', title);
    if (artist) queryParams.set('artist', artist);
    if (album) queryParams.set('album', album);

    fetch(`/api/music/tracks/${encodeURIComponent(String(currentTrack.id))}/genius?${queryParams.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted) return;
        setGeniusInfo(data?.genius || null);
        if (typeof data?.configured === 'boolean') {
          setIsGeniusConfigured(data.configured);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setGeniusInfo(null);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoadingGenius(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artistName]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    queueIndexRef.current = queueIndex;
  }, [queueIndex]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Initialize single global audio element for Dodik tracks
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const generateSessionId = () => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      return 'sess_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    };

    const handlePlay = () => {
      const track = currentTrackRef.current;
      // CRITICAL: Skip listen sessions for YouTube tracks
      if (!track || track.source === 'youtube') return;

      if (!playbackSessionRef.current || playbackSessionRef.current.trackId !== track.id) {
        const sessionId = generateSessionId();
        playbackSessionRef.current = {
          sessionId,
          trackId: track.id,
          accumulatedSeconds: 0,
          lastTick: Date.now(),
          reported: false,
        };

        fetch(`/api/music/tracks/${track.id}/playback-start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playbackSessionId: sessionId }),
        }).catch(() => {});
      } else {
        playbackSessionRef.current.lastTick = Date.now();
      }
    };

    const handlePause = () => {
      if (playbackSessionRef.current) {
        playbackSessionRef.current.lastTick = 0;
      }
    };

    const handleSeeking = () => {
      if (playbackSessionRef.current) {
        playbackSessionRef.current.lastTick = 0;
      }
    };

    const handleSeeked = () => {
      if (playbackSessionRef.current && !audio.paused) {
        playbackSessionRef.current.lastTick = Date.now();
      }
    };

    const handleTimeUpdate = () => {
      const cur = currentTrackRef.current;
      const isExternal = cur?.source === 'youtube' || (typeof cur?.id === 'string' && cur.id.startsWith('yt_')) || Boolean(cur?.videoId);
      if (isExternal) return;

      setCurrentTime(audio.currentTime);
      setDuration(audio.duration || 0);

      const session = playbackSessionRef.current;
      const track = currentTrackRef.current;

      // CRITICAL: Check track.source !== 'youtube' and not external
      if (!audio.paused && !audio.ended && session && track && !isExternal && track.source !== 'youtube' && session.trackId === track.id) {
        const now = Date.now();
        if (session.lastTick > 0) {
          const delta = (now - session.lastTick) / 1000;
          if (delta > 0 && delta < 2) {
            session.accumulatedSeconds += delta;
          }
        }
        session.lastTick = now;

        if (!session.reported) {
          const dur = audio.duration || track.duration || 180;
          let threshold = 30;
          if (dur < 30) {
            threshold = Math.max(5, Math.floor(dur * 0.5));
          } else {
            threshold = Math.min(30, Math.max(10, Math.floor(dur * 0.5)));
          }

          if (session.accumulatedSeconds >= threshold) {
            session.reported = true;
            const tId = track.id;
            const sId = session.sessionId;
            const playedSec = Math.round(session.accumulatedSeconds);

            fetch(`/api/music/tracks/${tId}/listen`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playbackSessionId: sId, playedSeconds: playedSec }),
            })
              .then((res) => res.json())
              .then((data) => {
                if (data && data.counted) {
                  window.dispatchEvent(
                    new CustomEvent('music:listen_recorded', {
                      detail: {
                        trackId: tId,
                        trackListenCount: data.trackListenCount,
                        releaseListenCount: data.releaseListenCount,
                      },
                    })
                  );
                }
              })
              .catch(() => {});
          }
        }
      }
    };

    const handleEnded = () => {
      const cur = currentTrackRef.current;
      const isExternal = cur?.source === 'youtube' || (typeof cur?.id === 'string' && cur.id.startsWith('yt_')) || Boolean(cur?.videoId);
      if (!isExternal) {
        handleAutoAdvance();
      }
    };

    const handleError = (e: Event) => {
      const cur = currentTrackRef.current ? normalizePlayerTrack(currentTrackRef.current) : null;
      if (!cur || cur.source === 'youtube') return;
      const src = audio.getAttribute('src');
      // If external track or no audio file src was set, ignore HTMLAudioElement error event
      if (!src || src === '' || src === window.location.href) {
        return;
      }
      console.warn('[MusicPlayer] HTMLAudioElement error:', e);

      // Attempt YouTube fallback if track has a videoId or youtubeUrl
      const fallbackVideoId = cur.videoId || (cur.youtubeUrl ? extractYouTubeVideoId(cur.youtubeUrl) : null);
      if (fallbackVideoId) {
        console.info('[MusicPlayer] Direct audio failed, attempting YouTube fallback for:', cur.title);
        setCurrentTrack((prev) => (prev ? { ...prev, source: 'youtube', videoId: fallbackVideoId } : null));
        initOrGetYouTubePlayer(fallbackVideoId, true);
        return;
      }

      handleTrackPlaybackFailure(cur, 'audio_missing');
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('seeking', handleSeeking);
    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('seeking', handleSeeking);
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
    };
  }, []);

  // Helper to extract YouTube video ID if only URL is available
  function extractYouTubeVideoId(url?: string | null): string | null {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  }

  // Centralized playback failure handler
  const handleTrackPlaybackFailure = (track: Track, codeOrReason?: number | string) => {
    setIsPlaying(false);
    const isBlocked = codeOrReason === 150 || codeOrReason === 101 || codeOrReason === 'embed_restricted';
    const status: PlayerPlaybackStatus = isBlocked ? 'blocked' : 'error';
    setPlaybackStatus(status);

    let friendlyMessage = `Не удалось воспроизвести трек «${track.title}».`;
    let reasonType: 'embed_restricted' | 'video_unavailable' | 'audio_missing' | 'network_error' | 'unplayable' = 'video_unavailable';

    if (isBlocked) {
      friendlyMessage = `Правообладатель ограничил встроенное воспроизведение трека «${track.title}».`;
      reasonType = 'embed_restricted';
    } else if (codeOrReason === 100) {
      friendlyMessage = `Видео для трека «${track.title}» недоступно или удалено.`;
      reasonType = 'video_unavailable';
    } else if (codeOrReason === 'unplayable') {
      friendlyMessage = `Трек «${track.title}» временно недоступен для воспроизведения.`;
      reasonType = 'unplayable';
    } else if (codeOrReason === 'audio_missing') {
      friendlyMessage = `Не удалось загрузить аудиофайл для трека «${track.title}».`;
      reasonType = 'audio_missing';
    }

    const ytUrl = track.youtubeUrl || (track.videoId ? `https://www.youtube.com/watch?v=${track.videoId}` : undefined);

    setPlaybackError({
      trackId: track.id,
      trackTitle: track.title,
      reason: reasonType,
      message: friendlyMessage,
      youtubeUrl: ytUrl,
      canOpenExternal: Boolean(ytUrl),
      provider: track.source,
    });

    window.dispatchEvent(
      new CustomEvent('notification:toast', {
        detail: {
          type: isBlocked ? 'warning' : 'info',
          message: friendlyMessage,
        },
      })
    );

    consecutiveErrorsRef.current += 1;
    const currentQueue = queueRef.current;

    // Advance only if we haven't failed every track in the queue (prevents infinite loop)
    if (currentQueue.length > 1 && consecutiveErrorsRef.current < currentQueue.length) {
      setTimeout(() => {
        handleAutoAdvance(true);
      }, 1500);
    } else {
      setIsPlaying(false);
    }
  };

  // TimeUpdate Poller for YouTube Tracks
  useEffect(() => {
    if (!isPlaying || currentTrack?.source !== 'youtube') return;

    const interval = setInterval(() => {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
        try {
          const cur = ytPlayerRef.current.getCurrentTime() || 0;
          const dur = ytPlayerRef.current.getDuration() || 0;
          setCurrentTime(cur);
          if (dur > 0) {
            setDuration(dur);
          }
        } catch {
          // ignore
        }
      }
    }, 150);

    return () => clearInterval(interval);
  }, [isPlaying, currentTrack?.id, currentTrack?.source]);

  // Media Session API Sync
  useEffect(() => {
    if (!currentTrack || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    const cover = currentTrack.releaseCover || releaseInfo?.cover || currentTrack.thumbnail;
    const artistName = currentTrack.artistName || releaseInfo?.artistName || artistInfo?.stageName || 'Исполнитель';

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: artistName,
        album: currentTrack.releaseTitle || releaseInfo?.title || currentTrack.album || 'Dodik Music',
        artwork: cover
          ? [
              { src: cover, sizes: '96x96', type: 'image/jpeg' },
              { src: cover, sizes: '128x128', type: 'image/jpeg' },
              { src: cover, sizes: '192x192', type: 'image/jpeg' },
              { src: cover, sizes: '256x256', type: 'image/jpeg' },
              { src: cover, sizes: '384x384', type: 'image/jpeg' },
              { src: cover, sizes: '512x512', type: 'image/jpeg' },
            ]
          : [],
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          seek(details.seekTime);
        }
      });
    } catch {
      // Non-critical
    }
  }, [currentTrack?.id, currentTrack?.source, releaseInfo, artistInfo]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.code === 'Space' && currentTrack) {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'Escape') {
        const hasOpenModal = Boolean(document.querySelector('[role="dialog"], .portal-modal'));
        if (hasOpenModal) return;

        setPlayerStateInternal((prev) => {
          if (prev === 'lyrics') {
            return previousStateRef.current && previousStateRef.current !== 'lyrics' ? previousStateRef.current : 'fullscreen';
          }
          if (prev === 'fullscreen') {
            return 'expanded';
          }
          if (prev === 'expanded') {
            return 'mini';
          }
          return prev;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTrack, isPlaying]);

  // Initialize or get YouTube Player
  const initOrGetYouTubePlayer = (videoId: string, autoplay: boolean) => {
    setPlaybackStatus('loading');
    loadYouTubeIframeAPI()
      .then((YT) => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.loadVideoById === 'function') {
          try {
            ytPlayerRef.current.setVolume(Math.round((isMutedRef.current ? 0 : volumeRef.current) * 100));
            if (autoplay) {
              ytPlayerRef.current.loadVideoById(videoId);
              setIsPlaying(true);
              setPlaybackStatus('playing');
            } else {
              ytPlayerRef.current.cueVideoById(videoId);
              setPlaybackStatus('ready');
            }
            return;
          } catch (e) {
            console.warn('[YouTube Player] Re-instantiating player on load error:', e);
          }
        }

        let container = document.getElementById('dodik-yt-player-container');
        const wrapper = document.getElementById('dodik-yt-player-container-wrapper');
        if (!container && wrapper) {
          wrapper.innerHTML = '<div id="dodik-yt-player-container"></div>';
          container = document.getElementById('dodik-yt-player-container');
        }
        if (!container) return;

        const validOrigin =
          typeof window !== 'undefined' &&
          window.location &&
          window.location.origin &&
          window.location.origin !== 'null' &&
          (window.location.protocol === 'http:' || window.location.protocol === 'https:')
            ? window.location.origin
            : undefined;

        const playerVars: Record<string, any> = {
          autoplay: autoplay ? 1 : 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
        };
        if (validOrigin) {
          playerVars.origin = validOrigin;
        }

        ytPlayerRef.current = new YT.Player('dodik-yt-player-container', {
          height: '200',
          width: '200',
          host: 'https://www.youtube.com',
          videoId: videoId,
          playerVars,
          events: {
            onReady: (event: any) => {
              event.target.setVolume(Math.round((isMutedRef.current ? 0 : volumeRef.current) * 100));
              if (autoplay) {
                event.target.playVideo();
                setIsPlaying(true);
                setPlaybackStatus('playing');
              } else {
                setPlaybackStatus('ready');
              }
            },
            onStateChange: (event: any) => {
              if (event.data === YT.PlayerState.PLAYING) {
                setIsPlaying(true);
                setPlaybackStatus('playing');
                consecutiveErrorsRef.current = 0;
                setPlaybackError(null);
              } else if (event.data === YT.PlayerState.PAUSED) {
                setIsPlaying(false);
                setPlaybackStatus('paused');
              } else if (event.data === YT.PlayerState.BUFFERING) {
                setPlaybackStatus('loading');
              } else if (event.data === YT.PlayerState.CUED) {
                setPlaybackStatus('ready');
              } else if (event.data === YT.PlayerState.ENDED) {
                setPlaybackStatus('ready');
                handleAutoAdvance();
              }
            },
            onError: (event: any) => {
              const code = event?.data;
              const track = currentTrackRef.current ? normalizePlayerTrack(currentTrackRef.current) : null;
              if (!track) return;

              // Fallback check: If YouTube fails, check if track has an audioFile source (HTML5 Audio fallback)
              const directAudioSrc = (track.audioFile || '').trim();
              if (directAudioSrc && directAudioSrc !== '' && directAudioSrc !== window.location.href) {
                console.info('[MusicPlayer] YouTube error received, attempting HTML5 audio fallback for:', track.title);
                setCurrentTrack((prev) => (prev ? { ...prev, source: 'dodik' } : null));
                setPlaybackStatus('loading');
                if (audioRef.current) {
                  audioRef.current.src = directAudioSrc;
                  audioRef.current.currentTime = 0;
                  audioRef.current.volume = isMutedRef.current ? 0 : volumeRef.current;
                  audioRef.current
                    .play()
                    .then(() => {
                      setIsPlaying(true);
                      setPlaybackStatus('playing');
                      consecutiveErrorsRef.current = 0;
                      setPlaybackError(null);
                    })
                    .catch(() => {
                      handleTrackPlaybackFailure(track, code);
                    });
                }
                return;
              }

              // No alternative provider available -> dispatch error & advance if queue permits
              handleTrackPlaybackFailure(track, code);
            },
          },
        });
      })
      .catch((err) => {
        console.warn('[YouTube API Load Notice]', err);
        setIsPlaying(false);
        setPlaybackStatus('error');
      });
  };

  const handleAutoAdvance = (skipRepeatOne = false) => {
    const curRepeat = repeatModeRef.current;
    const curTrack = currentTrackRef.current ? normalizePlayerTrack(currentTrackRef.current) : null;

    if (!skipRepeatOne && curRepeat === 'ONE' && curTrack) {
      if (curTrack.source === 'youtube' && curTrack.videoId) {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
          ytPlayerRef.current.seekTo(0, true);
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
          setPlaybackStatus('playing');
        } else {
          initOrGetYouTubePlayer(curTrack.videoId, true);
        }
      } else if (audioRef.current && curTrack.audioFile) {
        audioRef.current.currentTime = 0;
        audioRef.current
          .play()
          .then(() => {
            setIsPlaying(true);
            setPlaybackStatus('playing');
          })
          .catch(console.error);
      }
      return;
    }

    const latestQueue = queueRef.current;
    const prevIndex = queueIndexRef.current;

    if (latestQueue.length === 0) {
      setIsPlaying(false);
      setPlaybackStatus('idle');
      return;
    }

    let nextIdx = -1;
    if (isShuffleRef.current && latestQueue.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * latestQueue.length);
      } while (nextIdx === prevIndex);
    } else if (prevIndex + 1 < latestQueue.length) {
      nextIdx = prevIndex + 1;
    } else if (curRepeat === 'ALL') {
      nextIdx = 0;
    }

    if (nextIdx >= 0) {
      const nextTrack = latestQueue[nextIdx];
      playTrackInternal(nextTrack, latestQueue);
    } else {
      setIsPlaying(false);
      setPlaybackStatus('idle');
    }
  };

  const playTrackInternal = (rawTrack: Track, rawQueue?: Track[], newRelease?: ReleaseInfo | null) => {
    const track = normalizePlayerTrack(rawTrack);
    const finalQueue = rawQueue && rawQueue.length > 0 ? rawQueue.map(normalizePlayerTrack) : [track];
    const trackIdx = finalQueue.findIndex((t) => t.id === track.id);

    setQueue(finalQueue);
    setQueueIndex(trackIdx >= 0 ? trackIdx : 0);

    if (newRelease !== undefined) {
      setReleaseInfo(newRelease);
    }
    if (track.artistName && track.artistSlug) {
      setArtistInfo({ stageName: track.artistName, slug: track.artistSlug });
    } else if (newRelease?.artistName && newRelease?.artistSlug) {
      setArtistInfo({ stageName: newRelease.artistName, slug: newRelease.artistSlug });
    }

    const isSameTrack = currentTrack?.id === track.id;
    if (isSameTrack) {
      togglePlayPause();
      return;
    }

    // Reset error state and start loading
    consecutiveErrorsRef.current = 0;
    setPlaybackError(null);
    setPlaybackStatus('loading');
    setCurrentTrack(track);
    setCurrentTime(0);
    setDuration(track.duration || 0);

    if (track.playable === false) {
      handleTrackPlaybackFailure(track, 'unplayable');
      return;
    }

    if (track.source === 'youtube' && track.videoId) {
      // Pause HTMLAudioElement and clear src so it never triggers playback errors
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
      initOrGetYouTubePlayer(track.videoId, true);
    } else {
      // Dodik / Direct Audio Track
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {}
      }

      const audioSrc = (track.audioFile || '').trim();
      if (!audioSrc) {
        // Fallback check: Does track have YouTube backup videoId or URL?
        const fallbackVideoId = track.videoId || (track.youtubeUrl ? extractYouTubeVideoId(track.youtubeUrl) : null);
        if (fallbackVideoId) {
          console.info('[MusicPlayer] Dodik track has no audio file, falling back to YouTube for:', track.title);
          setCurrentTrack((prev) => (prev ? { ...prev, source: 'youtube', videoId: fallbackVideoId } : null));
          initOrGetYouTubePlayer(fallbackVideoId, true);
          return;
        }

        handleTrackPlaybackFailure(track, 'audio_missing');
        return;
      }

      if (audioRef.current) {
        audioRef.current.src = audioSrc;
        audioRef.current.currentTime = 0;
        audioRef.current.volume = isMuted ? 0 : volume;
        audioRef.current
          .play()
          .then(() => {
            setIsPlaying(true);
            setPlaybackStatus('playing');
            consecutiveErrorsRef.current = 0;
          })
          .catch((e) => {
            console.warn('[MusicPlayer] Playback start error:', e);
            // Check if YouTube fallback is possible
            const fallbackVideoId = track.videoId || (track.youtubeUrl ? extractYouTubeVideoId(track.youtubeUrl) : null);
            if (fallbackVideoId) {
              setCurrentTrack((prev) => (prev ? { ...prev, source: 'youtube', videoId: fallbackVideoId } : null));
              initOrGetYouTubePlayer(fallbackVideoId, true);
              return;
            }
            handleTrackPlaybackFailure(track, 'audio_missing');
          });
      }
    }
  };

  const playQueueIndex = (index: number) => {
    if (index < 0 || index >= queue.length) return;
    const targetTrack = queue[index];
    playTrackInternal(targetTrack, queue);
  };

  const addToQueue = (rawTrack: Track) => {
    const track = normalizePlayerTrack(rawTrack);
    setQueue((prev) => {
      if (prev.length === 0 || queueIndexRef.current < 0) {
        playTrackInternal(track, [track]);
        return [track];
      }
      const updated = [...prev, track];
      window.dispatchEvent(
        new CustomEvent('notification:toast', {
          detail: {
            type: 'success',
            message: `Трек «${track.title}» добавлен в очередь`,
          },
        })
      );
      return updated;
    });
  };

  const removeFromQueue = (trackId: string | number) => {
    setQueue((prev) => {
      const targetStr = String(trackId);
      const indexToRemove = prev.findIndex((t) => String(t.id) === targetStr);
      if (indexToRemove === -1) return prev;

      const removedTrack = prev[indexToRemove];
      const updated = prev.filter((_, idx) => idx !== indexToRemove);

      if (indexToRemove < queueIndexRef.current) {
        setQueueIndex((i) => Math.max(0, i - 1));
      }

      window.dispatchEvent(
        new CustomEvent('notification:toast', {
          detail: {
            type: 'info',
            message: `Трек «${removedTrack?.title || 'Песня'}» удалён из очереди`,
          },
        })
      );

      return updated;
    });
  };

  const playNext = () => {
    handleAutoAdvance();
  };

  const playPrev = () => {
    if (currentTime > 3) {
      seek(0);
      return;
    }

    if (queue.length > 0 && queueIndex > 0) {
      const prevIdx = queueIndex - 1;
      const prevTrack = queue[prevIdx];
      playTrackInternal(prevTrack, queue);
    } else {
      seek(0);
    }
  };

  const togglePlayPause = () => {
    if (!currentTrack) return;
    const track = normalizePlayerTrack(currentTrack);

    if (track.source === 'youtube' && track.videoId) {
      if (!ytPlayerRef.current) {
        initOrGetYouTubePlayer(track.videoId, true);
        return;
      }
      if (isPlaying) {
        if (typeof ytPlayerRef.current.pauseVideo === 'function') {
          ytPlayerRef.current.pauseVideo();
        }
        setIsPlaying(false);
      } else {
        if (typeof ytPlayerRef.current.playVideo === 'function') {
          ytPlayerRef.current.playVideo();
        }
        setIsPlaying(true);
      }
    } else {
      if (!audioRef.current) return;
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        const audioSrc = (track.audioFile || '').trim();
        if (!audioSrc) {
          console.warn('[MusicPlayer] Dodik track has no audio source to play:', track.title);
          setIsPlaying(false);
          return;
        }
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch((e) => {
            console.error('Playback failed:', e);
            setIsPlaying(false);
          });
      }
    }
  };

  const seek = (seconds: number) => {
    setCurrentTime(seconds);
    const cur = currentTrackRef.current ? normalizePlayerTrack(currentTrackRef.current) : null;
    if (cur?.source === 'youtube') {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        ytPlayerRef.current.seekTo(seconds, true);
      }
    } else {
      if (audioRef.current) {
        audioRef.current.currentTime = seconds;
      }
    }
  };

  const setVolume = (vol: number) => {
    setVolumeState(vol);
    const muted = vol === 0;
    setIsMuted(muted);

    if (audioRef.current) {
      audioRef.current.volume = vol;
    }

    if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
      try {
        ytPlayerRef.current.setVolume(Math.round(vol * 100));
        if (muted && typeof ytPlayerRef.current.mute === 'function') {
          ytPlayerRef.current.mute();
        } else if (!muted && typeof ytPlayerRef.current.unMute === 'function') {
          ytPlayerRef.current.unMute();
        }
      } catch {}
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      const restoredVol = volume || 0.8;
      setVolume(restoredVol);
    } else {
      if (audioRef.current) audioRef.current.volume = 0;
      if (ytPlayerRef.current && typeof ytPlayerRef.current.mute === 'function') {
        try {
          ytPlayerRef.current.mute();
        } catch {}
      }
      setIsMuted(true);
    }
  };

  const toggleRepeat = () => {
    setRepeatMode((prev) => (prev === 'OFF' ? 'ALL' : prev === 'ALL' ? 'ONE' : 'OFF'));
  };

  const toggleShuffle = () => {
    setIsShuffle((prev) => !prev);
  };

  const closePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {}
    }
    setIsPlaying(false);
    setCurrentTrack(null);
    setPlayerState('mini');
  };

  // Fetch favorite status for Dodik tracks
  useEffect(() => {
    if (!currentTrack || !dbUser) return;
    if (currentTrack.source === 'youtube' || typeof currentTrack.id === 'string') return;
    if (currentTrack.isFavorite !== undefined) return;

    authFetch(`/api/music/my/tracks/${currentTrack.id}/status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.isFavorite === 'boolean') {
          setCurrentTrack((prev) => (prev && prev.id === currentTrack.id ? { ...prev, isFavorite: data.isFavorite } : prev));
        }
      })
      .catch(() => {});
  }, [currentTrack?.id, dbUser, authFetch]);

  // Sync with favorite track custom event
  useEffect(() => {
    const handleFavChange = (e: any) => {
      const { trackId, isFavorite } = e.detail || {};
      if (trackId) {
        setCurrentTrack((prev) => (prev && prev.id === trackId ? { ...prev, isFavorite } : prev));
        setQueue((prev) => prev.map((t) => (t.id === trackId ? { ...t, isFavorite } : t)));
      }
    };
    window.addEventListener('music:favorite_track_changed', handleFavChange);
    return () => window.removeEventListener('music:favorite_track_changed', handleFavChange);
  }, []);

  const toggleFavoriteTrack = async (trackId?: number | string): Promise<boolean> => {
    const targetId = trackId || currentTrack?.id;
    if (!targetId || !dbUser) return false;

    const targetTrack = targetId === currentTrack?.id ? currentTrack : queue.find((t) => t.id === targetId);

    if (targetTrack?.source === 'youtube' || typeof targetId === 'string') {
      const currentlyFav = Boolean(targetTrack?.isFavorite);
      const nextFav = !currentlyFav;
      if (currentTrack && currentTrack.id === targetId) {
        setCurrentTrack((prev) => (prev ? { ...prev, isFavorite: nextFav } : prev));
      }
      setQueue((prev) => prev.map((t) => (t.id === targetId ? { ...t, isFavorite: nextFav } : t)));
      return nextFav;
    }

    const numId = Number(targetId);
    if (isNaN(numId)) return false;

    const currentlyFav = Boolean(targetTrack?.isFavorite);
    const nextFav = !currentlyFav;

    if (currentTrack && currentTrack.id === targetId) {
      setCurrentTrack((prev) => (prev ? { ...prev, isFavorite: nextFav } : prev));
    }
    setQueue((prev) => prev.map((t) => (t.id === targetId ? { ...t, isFavorite: nextFav } : t)));

    window.dispatchEvent(
      new CustomEvent('music:favorite_track_changed', {
        detail: { trackId: targetId, isFavorite: nextFav },
      })
    );

    try {
      const res = await authFetch(`/api/music/my/tracks/${numId}`, {
        method: nextFav ? 'POST' : 'DELETE',
      });
      if (!res.ok) {
        if (currentTrack && currentTrack.id === targetId) {
          setCurrentTrack((prev) => (prev ? { ...prev, isFavorite: currentlyFav } : prev));
        }
        setQueue((prev) => prev.map((t) => (t.id === targetId ? { ...t, isFavorite: currentlyFav } : t)));
        return currentlyFav;
      }
      return nextFav;
    } catch {
      if (currentTrack && currentTrack.id === targetId) {
        setCurrentTrack((prev) => (prev ? { ...prev, isFavorite: currentlyFav } : prev));
      }
      setQueue((prev) => prev.map((t) => (t.id === targetId ? { ...t, isFavorite: currentlyFav } : t)));
      return currentlyFav;
    }
  };

  const updateTrackLyrics = (lyrics: string) => {
    setCurrentTrack((prev) => (prev ? { ...prev, lyrics } : prev));
  };

  return (
    <MusicPlayerContext.Provider
      value={{
        currentTrack,
        queue,
        queueIndex,
        releaseInfo,
        artistInfo,
        geniusInfo,
        isLoadingGenius,
        isGeniusConfigured,
        isInsightsOpen,
        setIsInsightsOpen,
        toggleInsights,
        focusedAnnotation,
        setFocusedAnnotation,
        isPlaying,
        playbackStatus,
        playbackError,
        clearPlaybackError,
        currentTime,
        duration,
        volume,
        isMuted,
        playerState,
        previousPlayerState,
        isExpanded,
        isFullscreen,
        isLyricsOpen,
        repeatMode,
        isShuffle,
        activeTab,
        setActiveTab,
        setPlayerState,
        openExpanded,
        openFullscreen,
        openLyrics,
        closeExpanded,
        closeFullscreen,
        closeLyrics,
        playTrack: playTrackInternal,
        addToQueue,
        removeFromQueue,
        togglePlayPause,
        playNext,
        playPrev,
        playQueueIndex,
        seek,
        setVolume,
        toggleMute,
        toggleRepeat,
        toggleShuffle,
        setIsExpanded,
        setIsFullscreen,
        closePlayer,
        isCurrentTrackFavorite: Boolean(currentTrack?.isFavorite),
        toggleFavoriteTrack,
        updateTrackLyrics,
      }}
    >
      {children}
      {/* Compliant off-screen container with valid dimensions for YouTube IFrame Player */}
      <div
        id="dodik-yt-player-container-wrapper"
        aria-hidden="true"
        style={{
          position: 'fixed',
          bottom: '8px',
          right: '8px',
          width: 200,
          height: 200,
          zIndex: -1,
          opacity: 0.001,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <div id="dodik-yt-player-container" />
      </div>
      <ExpandedMusicPlayer />
      <FullscreenMusicPlayer />
      <FullscreenLyricsOverlay />
    </MusicPlayerContext.Provider>
  );
};

export const useMusicPlayer = () => {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) {
    throw new Error('useMusicPlayer must be used within MusicPlayerProvider');
  }
  return ctx;
};


