import React from 'react';
import {
  Users,
  Download,
  Upload,
  HardDrive,
  Loader2,
  RefreshCw,
  AlertCircle,
  Film,
  Sparkles,
  Wifi,
} from 'lucide-react';
import { TorrentLoadingState, TorrentPeerStats } from '../../types/watchParty.ts';
import { formatByteSize } from '../../utils/magnetValidator.ts';

interface TorrentStatsOverlayProps {
  state: TorrentLoadingState;
  stats: TorrentPeerStats | null;
  errorMessage?: string | null;
  onRetry?: () => void;
  fileName?: string;
  isHost?: boolean;
  onOpenPicker?: () => void;
  availableFilesCount?: number;
}

export function formatSpeed(bytesPerSec?: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  const kb = bytesPerSec / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB/s`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB/s`;
}

export const TorrentStatsOverlay: React.FC<TorrentStatsOverlayProps> = ({
  state,
  stats,
  errorMessage,
  onRetry,
  fileName,
  isHost,
  onOpenPicker,
  availableFilesCount = 0,
}) => {
  // 1. Full Loading Screen for non-ready states
  const isLoading =
    state === 'PARSING' ||
    state === 'FETCHING_METADATA' ||
    state === 'CONNECTING_PEERS' ||
    (state === 'BUFFERING' && (!stats || stats.downloaded === 0));

  if (state === 'ERROR' || errorMessage) {
    return (
      <div className="absolute inset-0 bg-[#080A18]/90 backdrop-blur-xs flex items-center justify-center p-6 text-center z-30 animate-fadeIn">
        <div className="max-w-md w-full p-6 rounded-3xl bg-[#0B0D20] border border-rose-500/40 text-white space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">
              {isHost ? 'Источник временно недоступен' : 'Ведущий пытается восстановить источник…'}
            </h3>
            <p className="text-xs text-[#94A3B8]">
              {isHost ? 'Пытаемся восстановить воспроизведение…' : 'Пожалуйста, подождите, пока вещание восстановится.'}
            </p>
          </div>
          {onRetry && isHost && (
            <button
              onClick={onRetry}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 mx-auto cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Попробовать восстановить</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    let stateLabel = 'Инициализация торрента...';
    if (state === 'PARSING') stateLabel = 'Разбор magnet-ссылки...';
    else if (state === 'FETCHING_METADATA') stateLabel = 'Поиск источников и получение метаданных...';
    else if (state === 'CONNECTING_PEERS') stateLabel = 'Подключение к WebRTC пирам...';
    else if (state === 'BUFFERING') stateLabel = 'Буферизация первого сегмента видео...';

    return (
      <div className="absolute inset-0 bg-[#080A18]/90 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-20 animate-fadeIn space-y-4">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 flex items-center justify-center text-[#A78BFA]">
            <Film className="w-7 h-7" />
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-[#8B5CF6] absolute -bottom-1 -right-1" />
        </div>

        <div className="space-y-1 max-w-sm">
          <h4 className="text-sm font-bold text-[#F8FAFC]">{stateLabel}</h4>
          <p className="text-xs text-[#94A3B8]">
            {stats && stats.numPeers > 0
              ? `Подключено пиров: ${stats.numPeers}`
              : 'Ожидание пиров в WebRTC рое...'}
          </p>
        </div>

        {/* Live Mini Stats during connect */}
        {stats && (
          <div className="flex items-center gap-3 text-xs font-mono text-[#CBD5E1] bg-[#11152A] px-3.5 py-1.5 rounded-xl border border-[#1E2442]">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#A78BFA]" />
              <span>{stats.numPeers} пиров</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <Download className="w-3.5 h-3.5" />
              <span>{formatSpeed(stats.downloadSpeed)}</span>
            </span>
          </div>
        )}
      </div>
    );
  }

  // 2. Compact Bottom Bar Overlay during Active Playback
  return (
    <div className="absolute bottom-4 left-4 right-4 z-20 p-2.5 rounded-2xl bg-[#080A18]/90 backdrop-blur-md border border-[#1E2442] flex flex-wrap items-center justify-between gap-2.5 text-xs text-[#94A3B8] shadow-2xl transition-all">
      {/* Left: Active File Info + Multi-file badge */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span className="text-xs font-semibold text-white truncate max-w-xs" title={fileName}>
          {fileName || 'Торрент-поток'}
        </span>

        {availableFilesCount > 1 && isHost && onOpenPicker && (
          <button
            onClick={onOpenPicker}
            className="px-2 py-0.5 rounded-lg bg-[#151932] hover:bg-[#8B5CF6]/20 border border-[#1E2442] hover:border-[#8B5CF6]/50 text-[11px] font-bold text-[#A78BFA] transition-colors cursor-pointer"
          >
            Файлы ({availableFilesCount})
          </button>
        )}
      </div>

      {/* Right: Peer Metrics */}
      {stats && (
        <div className="flex items-center gap-3 font-mono text-[11px] flex-wrap">
          {/* Peers Count */}
          <div className="flex items-center gap-1 text-[#CBD5E1]" title="Активные WebRTC пиры">
            <Users className="w-3.5 h-3.5 text-[#A78BFA]" />
            <span>{stats.numPeers} пиров</span>
          </div>

          {/* Download Speed */}
          <div className="flex items-center gap-1 text-emerald-400" title="Скорость загрузки">
            <Download className="w-3.5 h-3.5" />
            <span>{formatSpeed(stats.downloadSpeed)}</span>
          </div>

          {/* Upload Speed */}
          <div className="flex items-center gap-1 text-sky-400" title="Скорость раздачи">
            <Upload className="w-3.5 h-3.5" />
            <span>{formatSpeed(stats.uploadSpeed)}</span>
          </div>

          {/* Downloaded / Total */}
          {stats.total > 0 && (
            <div className="flex items-center gap-1 text-[#94A3B8]" title="Загружено в буфер">
              <HardDrive className="w-3.5 h-3.5" />
              <span>
                {formatByteSize(stats.downloaded)} / {formatByteSize(stats.total)} (
                {Math.round(stats.progress * 100)}%)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
