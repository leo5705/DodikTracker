import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useWatchParty } from '../../context/WatchPartyContext.tsx';
import { WatchPartyControls } from './WatchPartyControls.tsx';
import { TorrentStatsOverlay } from './TorrentStatsOverlay.tsx';
import { TorrentFilePickerModal } from '../modals/TorrentFilePickerModal.tsx';
import { Loader2, Film } from 'lucide-react';
import { MediaSourceFactory } from '../../services/mediaSources/MediaSourceFactory.ts';
import { IMediaSourceAdapter } from '../../services/mediaSources/MediaSourceAdapter.ts';
import {
  WatchPartySourceType,
  MediaSourceConfig,
  TorrentLoadingState,
  TorrentMediaFile,
  TorrentPeerStats,
} from '../../types/watchParty.ts';
import { parseVideo } from '../../utils/videoUtils.ts';
import { validateAndParseMagnet } from '../../utils/magnetValidator.ts';

function isMatchingMediaSrc(currentVideoSrc: string, targetUrl: string): boolean {
  if (!currentVideoSrc || !targetUrl) return false;
  if (currentVideoSrc === targetUrl) return true;
  if (currentVideoSrc.endsWith(targetUrl)) return true;
  try {
    const fullTarget = typeof window !== 'undefined' ? new URL(targetUrl, window.location.href).href : targetUrl;
    return currentVideoSrc === fullTarget;
  } catch {
    return false;
  }
}

export const WatchPartyPlayer: React.FC = () => {
  const {
    room,
    isHost,
    authoritativePlayback,
    sendProgress,
    hostPlay,
    hostPause,
    hostSeek,
    forceSyncAll,
    hostChangeSource,
  } = useWatchParty();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<IMediaSourceAdapter | null>(null);

  // Synchronization, seek locking, and playback generation tokens
  const isSeekingRef = useRef<boolean>(false);
  const isApplyingRemoteSyncRef = useRef<boolean>(false);
  const wasPlayingBeforeSeekRef = useRef<boolean>(false);
  const stallTimerRef = useRef<NodeJS.Timeout | null>(null);
  const playGenerationRef = useRef<number>(0);
  const playRequestPendingRef = useRef<boolean>(false);
  const isBufferingRef = useRef<boolean>(false);
  const lastUserSeekTimestampRef = useRef<number>(0);
  const lastAssignedSrcRef = useRef<string | null>(null);

  // Controls auto-hide & interaction locks
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringControlsRef = useRef<boolean>(false);
  const isInteractingWithControlsRef = useRef<boolean>(false);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControlsInFullscreen, setShowControlsInFullscreen] = useState<boolean>(true);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Torrent specific state
  const [torrentState, setTorrentState] = useState<TorrentLoadingState>('IDLE');
  const [torrentStats, setTorrentStats] = useState<TorrentPeerStats | null>(null);
  const [discoveredFiles, setDiscoveredFiles] = useState<TorrentMediaFile[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);

  const sourceType: WatchPartySourceType = room?.sourceType || 'DIRECT';
  const sourceConfig: MediaSourceConfig = room?.sourceConfig || {
    type: sourceType,
    url: room?.sourceUrl || undefined,
  };
  const sourceUrl = room?.sourceUrl || sourceConfig?.url || '';

  const parsedVideo = sourceUrl ? parseVideo(sourceUrl) : null;
  const isYouTube = parsedVideo?.site === 'YouTube' || sourceType === 'YOUTUBE';
  const isTorrent = sourceType === 'TORRENT';

  // 1. Compute stable video stream URL for HTML5 video element with instant magnet fallback
  const streamSrc = React.useMemo(() => {
    if (isYouTube) return undefined;
    if (isTorrent) {
      if (sourceConfig.url && (sourceConfig.url.startsWith('/') || sourceConfig.url.startsWith('http://') || sourceConfig.url.startsWith('https://')) && !sourceConfig.url.startsWith('magnet:?')) {
        return sourceConfig.url;
      }
      if (sourceConfig.infoHash) {
        const fileIdx = typeof sourceConfig.torrentFileIndex === 'number' ? sourceConfig.torrentFileIndex : 0;
        return `/api/watch-party/torrents/stream?hash=${sourceConfig.infoHash}&index=${fileIdx}`;
      }
      const rawMagnet = sourceConfig.magnetUri || sourceUrl || '';
      if (rawMagnet.startsWith('magnet:?')) {
        const parsed = validateAndParseMagnet(rawMagnet);
        if (parsed.isValid && parsed.infoHash) {
          const fileIdx = typeof sourceConfig.torrentFileIndex === 'number' ? sourceConfig.torrentFileIndex : 0;
          return `/api/watch-party/torrents/stream?hash=${parsed.infoHash}&index=${fileIdx}`;
        }
      }
      return undefined;
    }
    return sourceUrl || undefined;
  }, [isYouTube, isTorrent, sourceConfig.url, sourceConfig.infoHash, sourceConfig.torrentFileIndex, sourceConfig.magnetUri, sourceUrl]);

  // 2. Calculate Authoritative Target Position in seconds
  const calculateTargetPosition = useCallback((): number => {
    if (!authoritativePlayback) return 0;
    if (authoritativePlayback.state === 'PAUSED') {
      return authoritativePlayback.position;
    }
    const elapsedSeconds = Math.max(0, (Date.now() - authoritativePlayback.serverTimestamp) / 1000);
    const target = authoritativePlayback.position + elapsedSeconds;
    if (duration > 0 && target >= duration) {
      return duration;
    }
    return target;
  }, [authoritativePlayback, duration]);

  // Keep stable refs for async callbacks to prevent adapter re-instantiation
  const calculateTargetPositionRef = useRef(calculateTargetPosition);
  calculateTargetPositionRef.current = calculateTargetPosition;

  const authoritativePlaybackRef = useRef(authoritativePlayback);
  authoritativePlaybackRef.current = authoritativePlayback;

  // 3. Centralized Play Coordinator: requestPlaybackStart(reason)
  const requestPlaybackStart = useCallback((reason: string) => {
    const video = videoRef.current;
    if (!video || isYouTube || isSeekingRef.current) return;
    if (authoritativePlaybackRef.current.state !== 'PLAYING') return;
    if (playRequestPendingRef.current) return;
    if (!video.paused) return; // already playing
    if (!streamSrc && !sourceUrl && !sourceConfig.magnetUri && !sourceConfig.infoHash) return;

    playRequestPendingRef.current = true;
    console.log(`[WatchPartyPlayer] PLAY_REQUEST (${reason})`);

    const curGen = ++playGenerationRef.current;
    video.volume = volume;
    video.muted = isMuted;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          playRequestPendingRef.current = false;
          if (curGen !== playGenerationRef.current) return;
          setIsBuffering(false);
          isBufferingRef.current = false;
          console.log(`[WatchPartyPlayer] PLAY_STARTED (${reason})`);
        })
        .catch((err) => {
          playRequestPendingRef.current = false;
          if (curGen !== playGenerationRef.current) return;
          if (err.name === 'NotAllowedError') {
            console.warn('[WatchPartyPlayer] Autoplay with sound prevented by browser policy');
          } else if (err.name === 'AbortError') {
            // Normal abort due to pause or quick switch
          } else {
            console.warn('[WatchPartyPlayer] Play attempt error:', err);
          }
        });
    } else {
      playRequestPendingRef.current = false;
    }
  }, [isYouTube, volume, isMuted, streamSrc, sourceUrl, sourceConfig.magnetUri, sourceConfig.infoHash]);

  const requestPlaybackStartRef = useRef(requestPlaybackStart);
  requestPlaybackStartRef.current = requestPlaybackStart;

  // 4. Authoritative Play / Pause Synchronization
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isYouTube || isSeekingRef.current) return;

    if (authoritativePlayback.state === 'PLAYING') {
      if (video.paused && torrentState !== 'FETCHING_METADATA' && torrentState !== 'CONNECTING_PEERS') {
        requestPlaybackStart('AUTHORITATIVE_PLAY');
      }
    } else if (authoritativePlayback.state === 'PAUSED') {
      playRequestPendingRef.current = false;
      if (!video.paused) {
        video.pause();
      }
    }
  }, [authoritativePlayback.state, isYouTube, torrentState, requestPlaybackStart]);

  // 5. Audio Settings Synchronization & Diagnostics
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = volume;
      video.muted = isMuted;
    }
  }, [volume, isMuted]);

  // 6. Drift Correction & Controlled Seek with BUFFERING & SEEK PROTECTION
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isYouTube || torrentState === 'FETCHING_METADATA') return;

    const isBufferingActive = isBuffering || isBufferingRef.current || video.readyState < 3;
    const isUserSeeking = isSeekingRef.current || video.seeking || (Date.now() - lastUserSeekTimestampRef.current < 1500);

    const targetPos = calculateTargetPosition();
    const currentLocal = video.currentTime;
    const drift = currentLocal - targetPos; // negative = lag, positive = ahead

    // CRITICAL STAGE 10.15: If player is actively buffering or seeking, DO NOT hard seek!
    if (isBufferingActive || isUserSeeking) {
      if (Math.abs(drift) >= 2.5) {
        console.log('[WatchPartyPlayer] DRIFT_SKIPPED_BUFFERING', { drift: drift.toFixed(2), isBuffering: isBufferingActive, isSeeking: isUserSeeking });
      }
      video.playbackRate = 1.0;
      return;
    }

    // Severe Lag (> 2.5s) -> Hard Seek (ONLY when NOT buffering and NOT seeking!)
    if (Math.abs(drift) >= 2.5) {
      isApplyingRemoteSyncRef.current = true;
      video.currentTime = Math.max(0, targetPos);
      video.playbackRate = 1.0;
      setTimeout(() => {
        isApplyingRemoteSyncRef.current = false;
      }, 400);
    }
    // Moderate Lag (0.8s - 2.5s) -> Soft acceleration
    else if (drift < -0.8 && drift >= -2.5) {
      video.playbackRate = 1.05;
    }
    // Ahead of Host (0.8s - 2.5s) -> Soft deceleration
    else if (drift > 0.8 && drift <= 2.5) {
      video.playbackRate = 0.95;
    }
    // In Sync (< 0.8s)
    else {
      video.playbackRate = 1.0;
    }
  }, [authoritativePlayback.position, authoritativePlayback.serverTimestamp, authoritativePlayback.state, isYouTube, torrentState, isBuffering, calculateTargetPosition]);

  // 7. Single Source Assignment & Stable MediaSourceAdapter Lifecycle
  const stableSourceKey = `${sourceType}:${sourceConfig.infoHash || sourceConfig.url || sourceUrl}:${sourceConfig.torrentFileIndex ?? 0}`;

  const initMediaAdapter = useCallback(async () => {
    setVideoError(null);
    if (!sourceUrl && !sourceConfig.magnetUri && !sourceConfig.infoHash) {
      setTorrentState('IDLE');
      return;
    }

    try {
      const adapter = await MediaSourceFactory.createAdapter(sourceType, {
        onStateChange: (st) => setTorrentState(st),
        onStatsUpdate: (stats) => setTorrentStats(stats),
        onFilesDiscovered: (files) => setDiscoveredFiles(files),
        onBuffering: (buffering) => {
          setIsBuffering(buffering);
          isBufferingRef.current = buffering;
          if (buffering) {
            console.log('[WatchPartyPlayer] BUFFERING_START');
          } else {
            console.log('[WatchPartyPlayer] BUFFERING_END');
          }
        },
        onError: (err) => {
          if (!streamSrc) {
            setVideoError(err);
          }
        },
        onDurationChange: (dur) => setDuration(dur),
        onReady: (elem) => {
          if (elem) {
            const target = calculateTargetPositionRef.current();
            if (target > 0) elem.currentTime = target;
            if (authoritativePlaybackRef.current.state === 'PLAYING') {
              requestPlaybackStartRef.current('ADAPTER_READY');
            }
          }
        },
      });

      adapterRef.current = adapter;
      const targetLoadUrl = streamSrc || sourceConfig.url;

      await adapter.load({
        ...sourceConfig,
        url: targetLoadUrl,
      });

      if (videoRef.current && !isYouTube) {
        await adapter.attach(videoRef.current);
      }
    } catch (err: any) {
      console.warn('[WatchPartyPlayer] Media adapter init error:', err);
      if (!streamSrc) {
        setVideoError(err?.message || 'Не удалось инициализировать источник медиа');
      }
    }
  }, [sourceType, stableSourceKey, streamSrc, isYouTube, sourceConfig, sourceUrl]);

  useEffect(() => {
    initMediaAdapter();

    return () => {
      MediaSourceFactory.destroyActiveAdapter();
      adapterRef.current = null;
    };
  }, [stableSourceKey]);

  // 8. Fullscreen API synchronization listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const currentFsElem =
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement;
      const isCurrentlyFs = Boolean(currentFsElem && currentFsElem === playerContainerRef.current);
      setIsFullscreen(isCurrentlyFs);
      if (!isCurrentlyFs) {
        setShowControlsInFullscreen(true);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // 9. Auto-hide controls in fullscreen after inactivity (protected against active hover & drag interactions)
  const resetHideControlsTimer = useCallback(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
    setShowControlsInFullscreen(true);

    if (isFullscreen && authoritativePlayback.state === 'PLAYING') {
      if (isHoveringControlsRef.current || isInteractingWithControlsRef.current) {
        return;
      }
      hideControlsTimerRef.current = setTimeout(() => {
        if (!isHoveringControlsRef.current && !isInteractingWithControlsRef.current) {
          setShowControlsInFullscreen(false);
        }
      }, 3500);
    }
  }, [isFullscreen, authoritativePlayback.state]);

  const handlePlayerMouseMove = () => {
    resetHideControlsTimer();
  };

  // 10. Local HTML5 Video Event Listeners
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || isSeekingRef.current) return;

    const cur = video.currentTime;
    const dur = video.duration || duration || 0;
    setCurrentTime(cur);

    // Send telemetry to server context
    sendProgress(cur, dur, isBuffering || torrentState === 'BUFFERING');
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    const dur = video.duration || 0;
    setDuration(dur);
    setVideoError(null);

    // Audio & media diagnostics
    video.volume = volume;
    video.muted = isMuted;

    // Align initial position
    const target = calculateTargetPosition();
    if (target > 0) {
      video.currentTime = target;
    }

    if (authoritativePlayback.state === 'PLAYING' && video.paused) {
      requestPlaybackStart('LOADED_METADATA');
    }
  };

  const handleWaiting = () => {
    setIsBuffering(true);
    isBufferingRef.current = true;
    console.log('[WatchPartyPlayer] BUFFERING_START');
    sendProgress(currentTime, duration, true);

    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    stallTimerRef.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && video.readyState < 2 && !video.error) {
        console.info('[WatchPartyPlayer] Buffering stream chunks from torrent swarm...');
      }
    }, 15000);
  };

  const handlePlaying = () => {
    setIsBuffering(false);
    isBufferingRef.current = false;
    console.log('[WatchPartyPlayer] BUFFERING_END');
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  };

  const handleCanPlay = () => {
    setIsBuffering(false);
    isBufferingRef.current = false;
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.volume = volume;
      video.muted = isMuted;
      if (authoritativePlayback.state === 'PLAYING' && video.paused) {
        requestPlaybackStart('CAN_PLAY');
      }
    }
  };

  const handleSeeked = () => {
    setIsBuffering(false);
    isBufferingRef.current = false;
    isSeekingRef.current = false;
    const video = videoRef.current;
    if (video) {
      setCurrentTime(video.currentTime);
      if (wasPlayingBeforeSeekRef.current && video.paused && authoritativePlayback.state === 'PLAYING') {
        requestPlaybackStart('SEEKED');
      }
    }
  };

  const handleTogglePlay = () => {
    if (!isHost) return;
    const video = videoRef.current;
    const curPos = video?.currentTime ?? currentTime;

    if (authoritativePlayback.state === 'PLAYING') {
      hostPause(curPos);
    } else {
      hostPlay(curPos);
    }
  };

  // Dedicated Seek Handler
  const handleSeek = (seconds: number) => {
    if (!isHost) return;
    lastUserSeekTimestampRef.current = Date.now();
    const video = videoRef.current;
    if (video) {
      wasPlayingBeforeSeekRef.current = !video.paused;
      isSeekingRef.current = true;
      setIsBuffering(true);
      isBufferingRef.current = true;
      video.currentTime = seconds;
      setCurrentTime(seconds);
    }

    // Send single authoritative seek to room
    hostSeek(seconds);
  };

  // Dedicated Force Sync All Handler
  const handleForceSyncAll = () => {
    const video = videoRef.current;
    const pos = video ? video.currentTime : currentTime;
    const isPlaying = video ? !video.paused : authoritativePlayback.state === 'PLAYING';
    forceSyncAll(pos, isPlaying ? 'PLAYING' : 'PAUSED');
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    setIsMuted(vol === 0);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
      if (!nextMuted && videoRef.current.volume === 0) {
        videoRef.current.volume = 1;
        setVolume(1);
      }
    }
  };

  const handleToggleFullscreen = () => {
    const container = playerContainerRef.current;
    if (!container) return;

    const isFs = Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

    if (!isFs) {
      if (container.requestFullscreen) {
        container.requestFullscreen().catch(() => {});
      } else if ((container as any).webkitRequestFullscreen) {
        (container as any).webkitRequestFullscreen();
      } else if ((container as any).mozRequestFullScreen) {
        (container as any).mozRequestFullScreen();
      } else if ((container as any).msRequestFullscreen) {
        (container as any).msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
  };

  const handleSelectTorrentFile = (fileName: string) => {
    if (!isHost) return;
    hostChangeSource(
      {
        ...sourceConfig,
        type: 'TORRENT',
        fileName,
      },
      room?.mediaId || undefined,
      room?.seasonNumber || undefined,
      room?.episodeNumber || undefined
    );
  };

  // Keyboard shortcut listener (Space, ArrowLeft, ArrowRight, M, F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (isHost) handleTogglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (isHost) handleSeek(Math.max(0, currentTime - 5));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (isHost) handleSeek(Math.min(duration, currentTime + 5));
      } else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') {
        e.preventDefault();
        handleToggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHost, authoritativePlayback.state, currentTime, duration, isMuted, volume]);

  return (
    <div
      ref={playerContainerRef}
      onMouseMove={handlePlayerMouseMove}
      className={`watch-party-fullscreen-container relative flex flex-col ${
        isFullscreen
          ? 'w-full h-full bg-black justify-center items-center overflow-hidden'
          : 'space-y-3'
      }`}
    >
      {/* Video Viewport Container */}
      <div
        className={`${
          isFullscreen
            ? 'w-full h-full bg-black flex items-center justify-center relative'
            : 'aspect-video w-full rounded-3xl bg-[#05060E] border border-[#1E2442] overflow-hidden relative shadow-2xl flex items-center justify-center'
        }`}
      >
        {/* Render Source: YouTube Iframe or HTML5 Video */}
        {isYouTube && parsedVideo?.embedUrl ? (
          <iframe
            src={parsedVideo.embedUrl}
            title={room?.title || 'Watch Party Video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0"
          />
        ) : streamSrc || isTorrent ? (
          <video
            ref={videoRef}
            poster={room?.mediaMetadata?.posterUrl || undefined}
            playsInline
            muted={isMuted}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onWaiting={handleWaiting}
            onPlaying={handlePlaying}
            onCanPlay={handleCanPlay}
            onSeeked={handleSeeked}
            onError={() => {
              if (!streamSrc) setVideoError('Не удалось загрузить видеопоток');
            }}
            className="w-full h-full object-contain cursor-pointer"
            onClick={isHost ? handleTogglePlay : undefined}
          />
        ) : (
          /* Empty source state */
          <div className="flex flex-col items-center justify-center p-8 text-center text-[#64748B] space-y-2">
            <Film className="w-12 h-12 text-[#8B5CF6]/50 mb-1" />
            <p className="text-sm font-semibold text-[#F8FAFC]">Ожидание источника медиа...</p>
            <p className="text-xs max-w-sm text-[#94A3B8]">
              {isHost
                ? 'Вы можете настроить видеопоток, ссылку или торрент в настройках комнаты.'
                : 'Создатель комнаты настраивает видеопоток.'}
            </p>
          </div>
        )}

        {/* Generic Buffering Spinner Overlay during seek / buffering */}
        {isBuffering && (
          <div className="absolute inset-0 bg-[#080A18]/50 backdrop-blur-xs flex items-center justify-center pointer-events-none z-20 animate-fade-in">
            <div className="p-4 rounded-2xl bg-[#0B0D20]/90 border border-[#1E2442] flex items-center gap-3 shadow-xl">
              <Loader2 className="w-5 h-5 animate-spin text-[#8B5CF6]" />
              <span className="text-xs font-semibold text-[#F8FAFC]">Буферизация...</span>
            </div>
          </div>
        )}

        {/* Torrent Live Overlay / File Picker banner */}
        {isTorrent && (
          <TorrentStatsOverlay
            state={torrentState}
            stats={torrentStats}
            errorMessage={videoError}
            onRetry={initMediaAdapter}
            fileName={sourceConfig.fileName}
            isHost={isHost}
            onOpenPicker={() => setShowFilePicker(true)}
            availableFilesCount={discoveredFiles.filter((f) => f.isVideo).length}
          />
        )}
      </div>

      {/* Media Player Controls Overlay (Fullscreen or Standard Inline) */}
      {isFullscreen ? (
        <div
          onMouseEnter={() => {
            isHoveringControlsRef.current = true;
            setShowControlsInFullscreen(true);
          }}
          onMouseLeave={() => {
            isHoveringControlsRef.current = false;
            resetHideControlsTimer();
          }}
          className={`absolute bottom-0 left-0 right-0 p-4 md:p-6 z-30 transition-all duration-300 pointer-events-auto bg-gradient-to-t from-black/95 via-black/60 to-transparent ${
            showControlsInFullscreen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          <WatchPartyControls
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            isMuted={isMuted}
            isFullscreen={isFullscreen}
            onSeek={handleSeek}
            onTogglePlay={handleTogglePlay}
            onVolumeChange={handleVolumeChange}
            onToggleMute={handleToggleMute}
            onToggleFullscreen={handleToggleFullscreen}
            onForceSyncAll={handleForceSyncAll}
            onInteractionStart={() => {
              isInteractingWithControlsRef.current = true;
              setShowControlsInFullscreen(true);
            }}
            onInteractionEnd={() => {
              isInteractingWithControlsRef.current = false;
              resetHideControlsTimer();
            }}
          />
        </div>
      ) : (
        <WatchPartyControls
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isMuted={isMuted}
          isFullscreen={isFullscreen}
          onSeek={handleSeek}
          onTogglePlay={handleTogglePlay}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onToggleFullscreen={handleToggleFullscreen}
          onForceSyncAll={handleForceSyncAll}
        />
      )}

      {/* Multi-file selector modal */}
      {showFilePicker && (
        <TorrentFilePickerModal
          isOpen={showFilePicker}
          onClose={() => setShowFilePicker(false)}
          files={discoveredFiles}
          selectedFileName={sourceConfig.fileName}
          onSelectFile={handleSelectTorrentFile}
          isHost={isHost}
        />
      )}
    </div>
  );
};
