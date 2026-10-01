import React, { useState } from 'react';
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
  Sparkles,
  Check,
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
}

function formatSecondsToTime(seconds: number): string {
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
}) => {
  const { isHost, authoritativePlayback, requestSync } = useWatchParty();
  const [syncFeedback, setSyncFeedback] = useState(false);

  const isPlaying = authoritativePlayback.state === 'PLAYING';
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isHost) return;
    const val = parseFloat(e.target.value);
    onSeek(val);
  };

  const handleManualSync = () => {
    requestSync();
    setSyncFeedback(true);
    setTimeout(() => setSyncFeedback(false), 2000);
  };

  return (
    <div className="p-4 rounded-2xl bg-[#080A18]/90 border border-[#1E2442] space-y-3 shadow-lg">
      {/* 1. Timeline Progress Bar */}
      <div className="space-y-1">
        <div className="relative flex items-center group">
          {/* Custom Track Background */}
          <div className="w-full h-1.5 rounded-full bg-[#151932] overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-[#7C3AED] to-[#6366F1] rounded-full transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Interactive Range Input (Interactive for HOST only) */}
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.5}
            value={currentTime}
            onChange={handleTimelineChange}
            disabled={!isHost}
            className={`absolute inset-0 w-full h-full opacity-0 ${
              isHost ? 'cursor-pointer' : 'cursor-default'
            }`}
            title={isHost ? 'Перемотка (HOST)' : 'Таймлайн синхронизируется с хостом'}
          />
        </div>

        {/* Time display: 00:15:30 / 01:45:00 */}
        <div className="flex items-center justify-between text-[11px] font-mono text-[#94A3B8] px-0.5">
          <span>{formatSecondsToTime(currentTime)}</span>
          <span>{formatSecondsToTime(duration)}</span>
        </div>
      </div>

      {/* 2. Controls Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Left: Play/Pause, Skips, or Sync Button */}
        <div className="flex items-center gap-2">
          {isHost ? (
            <>
              {/* Skip -10s */}
              <button
                type="button"
                onClick={() => onSeek(Math.max(0, currentTime - 10))}
                className="p-2 rounded-xl bg-[#11152A] hover:bg-[#151932] text-[#CBD5E1] hover:text-white transition-colors cursor-pointer"
                title="Назад на 10 секунд"
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
                title="Вперёд на 10 секунд"
                aria-label="Вперёд на 10 секунд"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </>
          ) : (
            /* MEMBER View: Sync button & host control notice */
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

        {/* Right: Volume, Fullscreen, Settings */}
        <div className="flex items-center gap-3">
          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              className="p-2 rounded-xl bg-[#11152A] hover:bg-[#151932] text-[#CBD5E1] hover:text-white transition-colors cursor-pointer"
              title={isMuted ? 'Включить звук' : 'Выключить звук'}
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
            title={isFullscreen ? 'Выйти из полноэкранного режима (Esc)' : 'На весь экран'}
            aria-label="Полноэкранный режим"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
