import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Volume1,
  Maximize2,
  Minimize2,
  RefreshCw,
  Check,
  Users,
} from 'lucide-react';
import { useWatchParty } from '../../context/WatchPartyContext.tsx';

interface WatchPartyControlsProps {
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  onSeek: (seconds: number) => void;
  onTogglePlay: () => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onForceSyncAll?: () => void;
}

export function formatSecondsToTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const WatchPartyControls: React.FC<WatchPartyControlsProps> = ({
  currentTime,
  duration,
  volume,
  isMuted,
  isFullscreen,
  onSeek,
  onTogglePlay,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
  onForceSyncAll,
}) => {
  const { isHost, authoritativePlayback, requestSync, forceSyncAll } = useWatchParty();
  const [syncFeedback, setSyncFeedback] = useState(false);
  const [forceSyncFeedback, setForceSyncFeedback] = useState(false);

  // Timeline dragging & hover state
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  const trackRef = useRef<HTMLDivElement | null>(null);

  const isPlaying = authoritativePlayback.state === 'PLAYING';
  const displayTime = isDragging ? dragTime : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0;
  const hoverPercent = duration > 0 && hoverTime !== null ? Math.min(100, Math.max(0, (hoverTime / duration) * 100)) : null;

  // Calculate time from pointer event
  const getTimeFromPointer = useCallback(
    (e: React.PointerEvent | PointerEvent): number => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const clientX = e.clientX;
      const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const fraction = offsetX / rect.width;
      return Math.max(0, Math.min(duration, fraction * duration));
    },
    [duration]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isHost && !onForceSyncAll) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const targetTime = getTimeFromPointer(e);
    setIsDragging(true);
    setDragTime(targetTime);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (track && duration > 0) {
      const rect = track.getBoundingClientRect();
      const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      setHoverX(offsetX);
      setHoverTime((offsetX / rect.width) * duration);
    }

    if (isDragging) {
      const targetTime = getTimeFromPointer(e);
      setDragTime(targetTime);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      const targetTime = getTimeFromPointer(e);
      setIsDragging(false);
      onSeek(targetTime);
    }
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHoverTime(null);
    }
  };

  // Force Sync All handler (HOST)
  const handleForceSyncAll = () => {
    if (onForceSyncAll) {
      onForceSyncAll();
    } else {
      forceSyncAll(currentTime, isPlaying ? 'PLAYING' : 'PAUSED');
    }
    setForceSyncFeedback(true);
    setTimeout(() => setForceSyncFeedback(false), 2000);
  };

  // Member Sync handler
  const handleManualSync = () => {
    requestSync();
    setSyncFeedback(true);
    setTimeout(() => setSyncFeedback(false), 2000);
  };

  return (
    <div className="p-4 rounded-2xl bg-[#080A18]/90 border border-[#1E2442] space-y-3 shadow-lg select-none">
      {/* 1. Interactive Timeline Progress Bar */}
      <div className="space-y-1.5">
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className={`relative h-6 flex items-center group touch-none ${
            isHost ? 'cursor-pointer' : 'cursor-default'
          }`}
        >
          {/* Track Bar Background */}
          <div className="w-full h-1.5 group-hover:h-2.5 rounded-full bg-[#151932] overflow-hidden relative transition-all duration-150">
            {/* Hover preview marker */}
            {hoverPercent !== null && isHost && (
              <div
                className="absolute inset-y-0 left-0 bg-white/20 rounded-full"
                style={{ width: `${hoverPercent}%` }}
              />
            )}

            {/* Active playback progress */}
            <div
              className="h-full bg-gradient-to-r from-[#7C3AED] to-[#6366F1] rounded-full transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Scrubber Thumb (HOST only) */}
          {isHost && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white shadow-md border border-[#8B5CF6] transition-transform pointer-events-none ${
                isDragging ? 'scale-125' : 'group-hover:scale-110 opacity-0 group-hover:opacity-100'
              }`}
              style={{ left: `${progressPercent}%` }}
            />
          )}

          {/* Hover Time Tooltip */}
          {hoverTime !== null && isHost && (
            <div
              className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-lg bg-[#0F132A] border border-[#1E2442] text-[10px] font-mono text-white shadow-lg pointer-events-none z-30"
              style={{ left: `${hoverX}px` }}
            >
              {formatSecondsToTime(hoverTime)}
            </div>
          )}
        </div>

        {/* Time Labels: 00:15:30 / 01:45:00 */}
        <div className="flex items-center justify-between text-[11px] font-mono text-[#94A3B8] px-0.5">
          <span>{formatSecondsToTime(displayTime)}</span>
          <span>{formatSecondsToTime(duration)}</span>
        </div>
      </div>

      {/* 2. Controls Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Left: Play/Pause, Skips, Sync Buttons */}
        <div className="flex items-center gap-2">
          {isHost ? (
            <>
              {/* Skip -10s */}
              <button
                type="button"
                onClick={() => onSeek(Math.max(0, currentTime - 10))}
                className="p-2 rounded-xl bg-[#11152A] hover:bg-[#151932] text-[#CBD5E1] hover:text-white transition-colors cursor-pointer"
                title="Назад на 10 секунд (←)"
                aria-label="Назад на 10 секунд"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Play / Pause Toggle (HOST) */}
              <button
                type="button"
                onClick={onTogglePlay}
                className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white flex items-center justify-center shadow-lg shadow-[#7C3AED]/25 transition-all cursor-pointer"
                title={isPlaying ? 'Пауза (Space)' : 'Воспроизведение (Space)'}
                aria-label={isPlaying ? 'Пауза' : 'Воспроизведение'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
              </button>

              {/* Skip +10s */}
              <button
                type="button"
                onClick={() => onSeek(Math.min(duration, currentTime + 10))}
                className="p-2 rounded-xl bg-[#11152A] hover:bg-[#151932] text-[#CBD5E1] hover:text-white transition-colors cursor-pointer"
                title="Вперёд на 10 секунд (→)"
                aria-label="Вперёд на 10 секунд"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* HOST: Sync All Button */}
              <button
                type="button"
                onClick={handleForceSyncAll}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ml-1 ${
                  forceSyncFeedback
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                    : 'bg-[#11152A] hover:bg-[#1A203E] border border-[#1E2442] hover:border-[#8B5CF6]/50 text-[#CBD5E1] hover:text-white'
                }`}
                title="Принудительно синхронизировать всех участников на текущую позицию"
              >
                {forceSyncFeedback ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden sm:inline">Синхронизировано у всех!</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span className="hidden sm:inline">Синхронизировать всех</span>
                  </>
                )}
              </button>
            </>
          ) : (
            /* MEMBER View: Sync button */
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleManualSync}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  syncFeedback
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                    : 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white shadow-md shadow-[#7C3AED]/25'
                }`}
                title="Запросить синхронизацию с хостом"
                aria-label="Синхронизироваться с хостом"
              >
                {syncFeedback ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Синхронизировано!</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Синхронизироваться</span>
                  </>
                )}
              </button>

              <span className="hidden sm:inline text-xs text-[#94A3B8] font-medium">
                👥 Воспроизведением управляет ведущий
              </span>
            </div>
          )}
        </div>

        {/* Right: Volume & Fullscreen */}
        <div className="flex items-center gap-3">
          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              className="p-2 rounded-xl bg-[#11152A] hover:bg-[#151932] text-[#CBD5E1] hover:text-white transition-colors cursor-pointer"
              title={isMuted ? 'Включить звук (M)' : 'Выключить звук (M)'}
              aria-label="Громкость"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : volume < 0.5 ? (
                <Volume1 className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-20 md:w-24 accent-[#8B5CF6] cursor-pointer"
              title="Громкость"
            />
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="p-2 rounded-xl bg-[#11152A] hover:bg-[#151932] text-[#CBD5E1] hover:text-white transition-colors cursor-pointer"
            title={isFullscreen ? 'Выйти из полноэкранного режима (F)' : 'На весь экран (F)'}
            aria-label="Полноэкранный режим"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
