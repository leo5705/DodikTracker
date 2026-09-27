import React, { useState, useEffect, useMemo } from 'react';
import { isLrc, parseLyrics, formatLrcTimestamp } from '../../utils/lyricsParser.ts';
import { LiveLyrics } from './LiveLyrics.tsx';
import { FileText, Sparkles, Play, Pause, RotateCcw, X, Sliders } from 'lucide-react';

interface LyricsEditorFieldProps {
  value: string;
  onChange: (value: string) => void;
  trackTitle?: string;
  artistName?: string;
}

export const LyricsEditorField: React.FC<LyricsEditorFieldProps> = ({
  value,
  onChange,
  trackTitle = 'Без названия',
  artistName = 'Исполнитель',
}) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);

  // Automatically detect mode from contents
  const currentMode = useMemo<'plain' | 'synced'>(() => {
    return isLrc(value) ? 'synced' : 'plain';
  }, [value]);

  const parsed = useMemo(() => {
    return parseLyrics(value);
  }, [value]);

  // Determine dynamic duration for preview slider based on parsed timestamps
  const maxTime = useMemo(() => {
    if (parsed.lines.length === 0) return 180;
    const lastTime = parsed.lines[parsed.lines.length - 1].startTime;
    return Math.max(180, Math.ceil(lastTime + 10));
  }, [parsed]);

  // Virtual playback timer
  useEffect(() => {
    let intervalId: any;
    if (isPlaying) {
      const stepMs = 100;
      intervalId = setInterval(() => {
        setPreviewTime((prev) => {
          const nextVal = prev + stepMs / 1000;
          if (nextVal >= maxTime) {
            setIsPlaying(false);
            return maxTime;
          }
          return Number(nextVal.toFixed(2));
        });
      }, stepMs);
    }
    return () => clearInterval(intervalId);
  }, [isPlaying, maxTime]);

  const handleModeChange = (mode: 'plain' | 'synced') => {
    if (mode === 'synced' && !isLrc(value)) {
      // Pre-populate with helper LRC structure to guide user
      const helpTemplate = `[00:00.00]Интро\n[00:05.00]Первая строка текста\n[00:10.00]Вторая строка текста\n[00:15.00]Припев песни`;
      onChange(helpTemplate);
    } else if (mode === 'plain' && isLrc(value)) {
      // Strip LRC timestamps to plain text
      const stripped = value
        .replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');
      onChange(stripped);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    const hunds = Math.floor((secs % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}.${hunds.toString().padStart(2, '0')}`;
  };

  const handleInsertTimestampAtCursor = () => {
    // Inserts a format placeholder at current cursor, or appends it
    const timestamp = formatLrcTimestamp(0);
    onChange(`${timestamp}${value}`);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-mono text-[#94A3B8] font-bold uppercase flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-purple-400" />
          <span>Текст трека / LRC</span>
        </label>

        {/* Mode Selector */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => handleModeChange('plain')}
            className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
              currentMode === 'plain'
                ? 'bg-slate-800 text-white border border-slate-700/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Обычный
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('synced')}
            className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer ${
              currentMode === 'synced'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-2.5 h-2.5 text-purple-400" />
            Синхронизированный (LRC)
          </button>
        </div>
      </div>

      <div className="relative">
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            currentMode === 'synced'
              ? '[00:12.30]Текст первой строки...\n[00:16.50]Текст второй строки...'
              : 'Слова песни...'
          }
          className="w-full p-3 pr-10 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono leading-relaxed"
        />

        {currentMode === 'synced' && (
          <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setIsPreviewOpen(true);
                setPreviewTime(0);
                setIsPlaying(false);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-mono font-bold transition-all shadow-md cursor-pointer flex items-center gap-1"
            >
              <Sliders className="w-3 h-3" />
              <span>Предпросмотр</span>
            </button>
          </div>
        )}
      </div>

      {currentMode === 'synced' && (
        <p className="text-[10px] text-slate-400 font-mono leading-normal">
          Режим LRC активен. Формат строки: <code className="text-purple-300 font-bold">[минуты:секунды.сотые]текст</code>.
        </p>
      )}

      {/* SYNCHRONIZATION PREVIEW MODAL */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl h-[80vh] flex flex-col bg-[#0A0D1F] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-800/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Предпросмотр синхронизации</h4>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {artistName} — {trackTitle}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsPreviewOpen(false);
                  setIsPlaying(false);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Lyrics Render Area */}
            <div className="flex-1 min-h-0 bg-slate-950/50">
              <LiveLyrics
                lyrics={parsed}
                currentTime={previewTime}
                isPlaying={isPlaying}
                onSeekToLine={(secs) => setPreviewTime(secs)}
              />
            </div>

            {/* Control Bar */}
            <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 shrink-0 space-y-4">
              {/* Progress Slider */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-purple-400 font-semibold w-14 text-right">
                  {formatTime(previewTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={maxTime}
                  step={0.1}
                  value={previewTime}
                  onChange={(e) => setPreviewTime(parseFloat(e.target.value))}
                  className="flex-1 accent-purple-500 h-1 rounded-lg bg-slate-800 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-slate-400 w-14 text-left">
                  {formatTime(maxTime)}
                </span>
              </div>

              {/* Playback Controls */}
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setPreviewTime(0)}
                  className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-800/80 transition cursor-pointer"
                  title="В начало"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-11 h-11 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg hover:shadow-purple-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>

                <div className="w-10" /> {/* Spacer to align Play button center */}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
