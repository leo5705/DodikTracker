import React from 'react';
import { WatchPartySyncStatus } from '../../types/watchParty.ts';
import { Loader2 } from 'lucide-react';

interface WatchPartySyncBadgeProps {
  status: WatchPartySyncStatus;
  driftSeconds?: number;
  compact?: boolean;
}

export function formatDriftText(drift?: number): string {
  if (drift === undefined || isNaN(drift) || Math.abs(drift) < 1.0) {
    return '';
  }

  const sign = drift > 0 ? '+' : '−';
  const abs = Math.abs(drift);

  if (abs < 60) {
    return `${sign}${Math.round(abs)} сек`;
  }

  const minutes = Math.floor(abs / 60);
  const seconds = Math.floor(abs % 60);
  return `${sign}${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const WatchPartySyncBadge: React.FC<WatchPartySyncBadgeProps> = ({
  status,
  driftSeconds = 0,
  compact = false,
}) => {
  const driftText = formatDriftText(driftSeconds);

  switch (status) {
    case 'SYNCED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <span>Синхронизирован</span>
        </span>
      );

    case 'SLIGHT_LAG':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span>{compact ? (driftText || 'Отстаёт') : `Отстаёт ${driftText ? `(${driftText})` : ''}`}</span>
        </span>
      );

    case 'SEVERE_LAG':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-400">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
          <span>{compact ? (driftText || 'Сильно отстал') : `Сильно отстал ${driftText ? `(${driftText})` : ''}`}</span>
        </span>
      );

    case 'AHEAD':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-500/10 border border-sky-500/20 text-sky-400">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          <span>{compact ? (driftText || 'Впереди') : `Впереди ${driftText ? `(${driftText})` : ''}`}</span>
        </span>
      );

    case 'BUFFERING':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
          <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
          <span>Буферизация...</span>
        </span>
      );

    case 'PAUSED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-500/10 border border-slate-500/20 text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <span>Пауза</span>
        </span>
      );

    case 'DISCONNECTED':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-500/10 border border-zinc-500/20 text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
          <span>Отключён</span>
        </span>
      );
  }
};
