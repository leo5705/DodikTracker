import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { useRouter } from './RouterContext.tsx';
import { useAuth } from './AuthContext.tsx';
import { loadYouTubeIframeAPI } from '../utils/youtubeIframeApi.ts';
import { LiveLyrics } from '../components/music/LiveLyrics.tsx';
import { FullscreenMusicPlayer } from '../components/music/FullscreenMusicPlayer.tsx';
import { FullscreenLyricsOverlay } from '../components/music/FullscreenLyricsOverlay.tsx';
import { getBestMusicImageUrl } from '../utils/musicImageUtils.ts';
import {
  resolvePlaybackSource,
  extractYouTubeVideoId,
  type PlaybackSourceResolution,
} from '../utils/musicPlaybackResolver.ts';

export { resolvePlaybackSource, extractYouTubeVideoId, type PlaybackSourceResolution };
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

export type TrackSource = 'dodik' | 'youtube' | 'external';

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
  const resolution = resolvePlaybackSource(track);

  if (resolution.sourceType === 'youtube' && resolution.videoId) {
    return {
      ...track,
      source: 'youtube',
      videoId: resolution.videoId,
      youtubeUrl: track.youtubeUrl || resolution.url || `https://www.youtube.com/watch?v=${resolution.videoId}`,
      releaseCover: track.releaseCover || track.thumbnail || null,
      thumbnail: track.thumbnail || track.releaseCover || null,
      artistName: track.artistName || 'Исполнитель',
      releaseTitle: track.releaseTitle || track.album || 'Сингл',
      audioFile: track.audioFile || `yt_${resolution.videoId}`,
      playable: true,
    };
  }

  if (resolution.playable && resolution.url) {
    return {
      ...track,
      source: resolution.sourceType === 'external' ? 'external' : 'dodik',
      audioFile: resolution.url,
      playable: true,
    };
  }

  return {
    ...track,
    source: track.source || 'dodik',
    audioFile: track.audioFile || '',
    playable: false,
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

export type PlayerState = 'mini' | 'fullscreen' | 'lyrics';
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
  toggleFavoriteTrack: (trackId?: number | string, isFavOverride?: boolean) => Promise<boolean>;
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
  const [previousPlayerState, setPreviousPlayerState] = useState<PlayerState>('mini');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('OFF');
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<PlayerTab>('queue');

  const toggleInsights = () => {
    setIsInsightsOpen((prev) => !prev);
  };

  const previousStateRef = useRef<PlayerState>('mini');
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

  const isExpanded = false;
  const isFullscreen = playerState === 'fullscreen';
  const isLyricsOpen = playerState === 'lyrics';

  const openExpanded = () => setPlayerState('mini');
  const openFullscreen = () => setPlayerState('fullscreen');
  const openLyrics = () => {
    setPlayerStateInternal((prev) => {
      if (prev !== 'lyrics') {
        previousStateRef.current = 'mini';
        setPreviousPlayerState('mini');
      }
      return 'lyrics';
    });
  };

  const closeExpanded = () => setPlayerState('mini');
  const closeFullscreen = () => setPlayerState('mini');
  const closeLyrics = () => {
    const target = previousStateRef.current && previousStateRef.current !== 'lyrics' ? previousStateRef.current : 'mini';
    setPlayerState(target);
  };

  const setIsExpanded: React.Dispatch<React.SetStateAction<boolean>> = () => {
    setPlayerState('mini');
  };

  const setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>> = (value) => {
    setPlayerStateInternal((prev) => {
      const isFull = prev === 'fullscreen';
      const nextBool = typeof value === 'function' ? value(isFull) : value;
      return nextBool ? 'fullscreen' : 'mini';
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
  const crossfadeAudioRef = useRef<HTMLAudioElement | null>(null);
  const crossfadeStartedRef = useRef<boolean>(false);
  const crossfadeTimerRef = useRef<any>(null);
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

  const previousTrackDataRef = useRef<{
    track: Track;
    startTime: number;
    playedSeconds: number;
  } | null>(null);

  useEffect(() => {
    // When track transitions or finishes, report outcome of previous track
    if (previousTrackDataRef.current && dbUser) {
      const prev = previousTrackDataRef.current;
      const elapsed = Math.max(0, (Date.now() - prev.startTime) / 1000);
      const played = Math.max(prev.playedSeconds, elapsed);
      const totalDur = prev.track.duration && prev.track.duration > 0 ? prev.track.duration : 180;
      const ratio = Math.min(1.0, played / totalDur);
      const isCompleted = ratio >= 0.85 || played >= 180;
      const isQuickSkip = !isCompleted && played < 15;
      const isSkipped = !isCompleted && played < totalDur * 0.6;

      authFetch('/api/music/history/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackId: prev.track.id,
          provider: prev.track.source || 'dodik',
          title: prev.track.title,
          artistName: prev.track.artistName || 'Исполнитель',
          artistId: prev.track.artistId || null,
          releaseTitle: prev.track.releaseTitle || null,
          releaseCover: prev.track.releaseCover || prev.track.thumbnail || null,
          durationSeconds: prev.track.duration || null,
          playedSeconds: Math.round(played),
          completionRatio: Number(ratio.toFixed(3)),
          isCompleted,
          isSkipped,
          isQuickSkip,
          contextSource: 'queue',
          fromTrackId: null,
        }),
      }).catch(() => {});
    }

    const previousId = previousTrackDataRef.current?.track.id ? String(previousTrackDataRef.current.track.id) : null;

    currentTrackRef.current = currentTrack;
    if (currentTrack) {
      previousTrackDataRef.current = {
        track: currentTrack,
        startTime: Date.now(),
        playedSeconds: 0,
      };

      if (dbUser) {
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
            fromTrackId: previousId,
          }),
        }).catch(() => {});
      }
    } else {
      previousTrackDataRef.current = null;
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

    const audio2 = new Audio();
    crossfadeAudioRef.current = audio2;

    const generateSessionId = () => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      return 'sess_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    };

    const handlePlay = (e: Event) => {
      const audioNode = e.currentTarget as HTMLAudioElement;
      if (audioNode !== audioRef.current) return;

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

    const handlePause = (e: Event) => {
      const audioNode = e.currentTarget as HTMLAudioElement;
      if (audioNode !== audioRef.current) return;

      if (playbackSessionRef.current) {
        playbackSessionRef.current.lastTick = 0;
      }
    };

    const handleSeeking = (e: Event) => {
      const audioNode = e.currentTarget as HTMLAudioElement;
      if (audioNode !== audioRef.current) return;

      if (playbackSessionRef.current) {
        playbackSessionRef.current.lastTick = 0;
      }
    };

    const handleSeeked = (e: Event) => {
      const audioNode = e.currentTarget as HTMLAudioElement;
      if (audioNode !== audioRef.current) return;

      if (playbackSessionRef.current && !audioNode.paused) {
        playbackSessionRef.current.lastTick = Date.now();
      }
    };

    const handleTimeUpdate = (e: Event) => {
      const audioNode = e.currentTarget as HTMLAudioElement;
      if (audioNode !== audioRef.current) return;

      const cur = currentTrackRef.current;
      const isExternal = cur?.source === 'youtube' || (typeof cur?.id === 'string' && cur.id.startsWith('yt_')) || Boolean(cur?.videoId);
      if (isExternal) return;

      setCurrentTime(audioNode.currentTime);
      setDuration(audioNode.duration || 0);

      // Check crossfade trigger conditions:
      const isCrossfadeEnabled = Boolean((dbUser as any)?.musicCrossfadeEnabled);
      const crossfadeDuration = (dbUser as any)?.musicCrossfadeDuration !== undefined ? Number((dbUser as any)?.musicCrossfadeDuration) : 4;
      
      const curTime = audioNode.currentTime;
      const dur = audioNode.duration || 0;

      if (
        isCrossfadeEnabled &&
        dur > 0 &&
        dur - curTime <= crossfadeDuration &&
        !crossfadeStartedRef.current &&
        queueRef.current.length > 0
      ) {
        triggerCrossfadeTransition();
      }

      const session = playbackSessionRef.current;
      const track = currentTrackRef.current;

      // CRITICAL: Check track.source !== 'youtube' and not external
      if (!audioNode.paused && !audioNode.ended && session && track && !isExternal && track.source !== 'youtube' && session.trackId === track.id) {
        const now = Date.now();
        if (session.lastTick > 0) {
          const delta = (now - session.lastTick) / 1000;
          if (delta > 0 && delta < 2) {
            session.accumulatedSeconds += delta;
          }
        }
        session.lastTick = now;

        if (!session.reported) {
          const durSec = audioNode.duration || track.duration || 180;
          let threshold = 30;
          if (durSec < 30) {
            threshold = Math.max(5, Math.floor(durSec * 0.5));
          } else {
            threshold = Math.min(30, Math.max(10, Math.floor(durSec * 0.5)));
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

    const handleEnded = (e: Event) => {
      const audioNode = e.currentTarget as HTMLAudioElement;
      if (audioNode !== audioRef.current) return;

      const cur = currentTrackRef.current;
      const isExternal = cur?.source === 'youtube' || (typeof cur?.id === 'string' && cur.id.startsWith('yt_')) || Boolean(cur?.videoId);
      if (!isExternal) {
        handleAutoAdvance();
      }
    };

    const handleError = (e: Event) => {
      const audioNode = e.currentTarget as HTMLAudioElement;
      if (audioNode !== audioRef.current) return;

      const cur = currentTrackRef.current ? normalizePlayerTrack(currentTrackRef.current) : null;
      if (!cur || cur.source === 'youtube') return;
      const src = audioNode.getAttribute('src') || audioNode.src || '';
      // If external track or no audio file src was set, ignore HTMLAudioElement error event
      if (!src || src === '' || src === window.location.href || src.endsWith('/')) {
        return;
      }
      console.warn('[MusicPlayer] HTMLAudioElement error:', e);

      // Attempt YouTube fallback if track has a videoId or youtubeUrl
      const fallbackVideoId = cur.videoId || (cur.youtubeUrl ? extractYouTubeVideoId(cur.youtubeUrl) : null);
      if (fallbackVideoId) {
        console.info('[MusicPlayer] Direct audio failed, attempting YouTube fallback for:', cur.title);
        const resolved = { ...cur, source: 'youtube' as const, videoId: fallbackVideoId, playable: true };
        currentTrackRef.current = resolved;
        setCurrentTrack(resolved);
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

    audio2.addEventListener('play', handlePlay);
    audio2.addEventListener('pause', handlePause);
    audio2.addEventListener('seeking', handleSeeking);
    audio2.addEventListener('seeked', handleSeeked);
    audio2.addEventListener('timeupdate', handleTimeUpdate);
    audio2.addEventListener('ended', handleEnded);
    audio2.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('seeking', handleSeeking);
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();

      audio2.removeEventListener('play', handlePlay);
      audio2.removeEventListener('pause', handlePause);
      audio2.removeEventListener('seeking', handleSeeking);
      audio2.removeEventListener('seeked', handleSeeked);
      audio2.removeEventListener('timeupdate', handleTimeUpdate);
      audio2.removeEventListener('ended', handleEnded);
      audio2.removeEventListener('error', handleError);
      audio2.pause();
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
            return previousStateRef.current && previousStateRef.current !== 'lyrics' ? previousStateRef.current : 'mini';
          }
          if (prev === 'fullscreen') {
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

        const wrapper = document.getElementById('dodik-yt-player-container-wrapper');
        if (wrapper) {
          if (ytPlayerRef.current) {
            try {
              if (typeof ytPlayerRef.current.destroy === 'function') {
                ytPlayerRef.current.destroy();
              }
            } catch {}
            ytPlayerRef.current = null;
          }
          wrapper.innerHTML = '<div id="dodik-yt-player-container"></div>';
        }

        const container = document.getElementById('dodik-yt-player-container');
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

              // Fallback check: If YouTube fails, check if track has a direct audioFile source (HTML5 Audio fallback)
              const directAudioSrc = (track.audioFile || '').trim();
              if (directAudioSrc && !directAudioSrc.startsWith('yt_') && directAudioSrc !== '' && directAudioSrc !== window.location.href) {
                console.info('[MusicPlayer] YouTube error received, attempting HTML5 audio fallback for:', track.title);
                const resolved = { ...track, source: 'dodik' as const };
                currentTrackRef.current = resolved;
                setCurrentTrack(resolved);
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

  const getNextTrackIndex = () => {
    const latestQueue = queueRef.current;
    const prevIndex = queueIndexRef.current;
    const curRepeat = repeatModeRef.current;

    if (latestQueue.length === 0) return -1;

    let nextIdx = -1;
    if (isShuffleRef.current && latestQueue.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * latestQueue.length);
      } while (nextIdx === prevIndex);
    } else if (prevIndex + 1 < latestQueue.length) {
      nextIdx = prevIndex + 1;
    } else if (curRepeat === 'ALL') {
      nextIdx = 0;
    } else if (curRepeat === 'ONE') {
      nextIdx = prevIndex;
    }
    return nextIdx;
  };

  const triggerCrossfadeTransition = () => {
    if (crossfadeStartedRef.current) return;

    const nextIdx = getNextTrackIndex();
    if (nextIdx < 0) return;

    const rawNextTrack = queueRef.current[nextIdx];
    const nextTrack = normalizePlayerTrack(rawNextTrack);

    const isNextExternal = nextTrack.source === 'youtube' || (typeof nextTrack.id === 'string' && nextTrack.id.startsWith('yt_')) || Boolean(nextTrack.videoId);
    if (isNextExternal) {
      return; // crossfade only local/dodik files
    }

    const nextAudioSrc = (nextTrack.audioFile || '').trim();
    if (!nextAudioSrc || nextAudioSrc.startsWith('yt_')) return;

    crossfadeStartedRef.current = true;
    console.info(`[MusicPlayer] Initiating crossfade from current track to next track: «${nextTrack.title}»`);

    const fadeOutAudio = audioRef.current;
    const fadeInAudio = crossfadeAudioRef.current;

    if (!fadeOutAudio || !fadeInAudio) return;

    fadeInAudio.src = nextAudioSrc;
    fadeInAudio.currentTime = 0;
    fadeInAudio.volume = 0;

    fadeInAudio.play()
      .then(() => {
        const crossfadeDuration = (dbUser as any)?.musicCrossfadeDuration !== undefined ? Number((dbUser as any)?.musicCrossfadeDuration) : 4;
        const steps = 20;
        const intervalTime = (crossfadeDuration * 1000) / steps;
        let currentStep = 0;

        const maxVolume = isMutedRef.current ? 0 : volumeRef.current;

        if (crossfadeTimerRef.current) {
          clearInterval(crossfadeTimerRef.current);
        }

        crossfadeTimerRef.current = setInterval(() => {
          currentStep++;
          const ratio = currentStep / steps;

          // Fade out old track
          fadeOutAudio.volume = Math.max(0, maxVolume * (1 - ratio));

          // Fade in new track
          fadeInAudio.volume = Math.min(maxVolume, maxVolume * ratio);

          if (currentStep >= steps) {
            clearInterval(crossfadeTimerRef.current);
            crossfadeTimerRef.current = null;

            fadeOutAudio.pause();
            fadeOutAudio.removeAttribute('src');

            // Swap active node references
            audioRef.current = fadeInAudio;
            crossfadeAudioRef.current = fadeOutAudio;

            fadeInAudio.volume = maxVolume;

            currentTrackRef.current = nextTrack;
            setCurrentTrack(nextTrack);
            setQueueIndex(nextIdx);
            setCurrentTime(0);
            setDuration(nextTrack.duration || 0);

            crossfadeStartedRef.current = false;
            console.info(`[MusicPlayer] Crossfade completed. Active track is now «${nextTrack.title}»`);
          }
        }, intervalTime);
      })
      .catch((err) => {
        console.warn('[MusicPlayer] Failed to play crossfade track:', err);
        crossfadeStartedRef.current = false;
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
      } else if (audioRef.current && curTrack.audioFile && !curTrack.audioFile.startsWith('yt_')) {
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

  const handleUnplayable = (track: Track) => {
    console.warn(`[MusicPlayer] Track "${track.title}" has no playable audio source.`);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {}
    }
    setPlaybackStatus('error');
    setPlaybackError({
      trackId: track.id,
      trackTitle: track.title,
      reason: 'unplayable',
      message: `Источник воспроизведения для трека «${track.title}» недоступен`,
      canOpenExternal: false,
      provider: track.source,
    });
    setIsPlaying(false);
    window.dispatchEvent(
      new CustomEvent('notification:toast', {
        detail: {
          type: 'warning',
          message: `Источник воспроизведения для трека «${track.title}» недоступен`,
        },
      })
    );
  };

  const playTrackInternal = (rawTrack: Track, rawQueue?: Track[], newRelease?: ReleaseInfo | null) => {
    // Clear crossfade timers and stop fading-in audio to prevent bleeding
    if (crossfadeTimerRef.current) {
      clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    if (crossfadeAudioRef.current) {
      crossfadeAudioRef.current.pause();
      crossfadeAudioRef.current.removeAttribute('src');
    }
    crossfadeStartedRef.current = false;

    const track = normalizePlayerTrack(rawTrack);
    const playbackRes = resolvePlaybackSource(track);

    console.log(
      `[MusicPlayer] Resolving playback for track #${track.id}: "${track.title}" by "${track.artistName}". SourceType: ${playbackRes.sourceType}, Playable: ${playbackRes.playable}`
    );

    const finalQueue = rawQueue && rawQueue.length > 0 ? rawQueue.map(normalizePlayerTrack) : [track];
    const trackIdx = finalQueue.findIndex((t) => String(t.id) === String(track.id));

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
    if (isSameTrack && currentTrack?.source === track.source && playbackRes.playable) {
      togglePlayPause();
      return;
    }

    // Reset error state and start loading
    consecutiveErrorsRef.current = 0;
    setPlaybackError(null);
    currentTrackRef.current = track;
    setCurrentTrack(track);
    setCurrentTime(0);
    setDuration(track.duration || 0);

    // If unplayable, attempt dynamic on-the-fly resolution
    if (!playbackRes.playable) {
      const title = track.title || '';
      const artist = track.artistName || newRelease?.artistName || '';
      const album = track.releaseTitle || track.album || newRelease?.title || '';

      if (title) {
        console.info(`[MusicPlayer] Attempting on-the-fly source resolution for «${title}» by «${artist}»...`);
        setPlaybackStatus('loading');

        const queryParams = new URLSearchParams();
        queryParams.set('title', title);
        if (artist) queryParams.set('artist', artist);
        if (album) queryParams.set('album', album);
        if (track.id && (typeof track.id === 'number' || /^\d+$/.test(String(track.id)))) {
          queryParams.set('trackId', String(track.id));
        }

        fetch(`/api/music/resolve-source?${queryParams.toString()}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.playable && data.videoId) {
              const resolvedTrack: Track = {
                ...track,
                source: 'youtube',
                videoId: data.videoId,
                youtubeUrl: `https://www.youtube.com/watch?v=${data.videoId}`,
                audioFile: `yt_${data.videoId}`,
                duration: track.duration || data.duration || null,
                playable: true,
              };
              currentTrackRef.current = resolvedTrack;
              setCurrentTrack(resolvedTrack);
              setPlaybackStatus('loading');
              initOrGetYouTubePlayer(data.videoId, true);
              return;
            }
            handleUnplayable(track);
          })
          .catch(() => {
            handleUnplayable(track);
          });
        return;
      }

      handleUnplayable(track);
      return;
    }

    setPlaybackStatus('loading');

    if (playbackRes.sourceType === 'youtube' && playbackRes.videoId) {
      // Pause HTMLAudioElement and clear src so it never triggers playback errors
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      initOrGetYouTubePlayer(playbackRes.videoId, true);
    } else if (playbackRes.url) {
      // Dodik / Direct Audio Track
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {}
      }

      if (audioRef.current) {
        audioRef.current.src = playbackRes.url;
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
    const resolution = resolvePlaybackSource(track);

    if (resolution.sourceType === 'youtube' && resolution.videoId) {
      if (!ytPlayerRef.current) {
        initOrGetYouTubePlayer(resolution.videoId, true);
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
    } else if (resolution.playable && resolution.url) {
      if (!audioRef.current) return;
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        if (!audioRef.current.src || audioRef.current.src !== resolution.url) {
          audioRef.current.src = resolution.url;
        }
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch((e) => {
            console.error('Playback failed:', e);
            setIsPlaying(false);
          });
      }
    } else {
      playTrackInternal(track, queue);
    }
  };

  const seek = (seconds: number) => {
    crossfadeStartedRef.current = false;
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

  const toggleFavoriteTrack = async (trackId?: number | string, isFavOverride?: boolean): Promise<boolean> => {
    const targetId = trackId || currentTrack?.id;
    if (!targetId || !dbUser) return false;

    const targetTrack = targetId === currentTrack?.id ? currentTrack : queue.find((t) => t.id === targetId);

    if (targetTrack?.source === 'youtube' || typeof targetId === 'string') {
      const currentlyFav = isFavOverride !== undefined ? isFavOverride : Boolean(targetTrack?.isFavorite);
      const nextFav = !currentlyFav;
      if (currentTrack && currentTrack.id === targetId) {
        setCurrentTrack((prev) => (prev ? { ...prev, isFavorite: nextFav } : prev));
      }
      setQueue((prev) => prev.map((t) => (t.id === targetId ? { ...t, isFavorite: nextFav } : t)));
      return nextFav;
    }

    const numId = Number(targetId);
    if (isNaN(numId)) return false;

    const currentlyFav = isFavOverride !== undefined ? isFavOverride : Boolean(targetTrack?.isFavorite);
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


