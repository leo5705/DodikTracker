import React from 'react';
import {
  CalendarDays,
  Calendar,
  Grid3X3,
  ListFilter,
  Milestone,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
} from 'lucide-react';
import { ViewMode } from './types.ts';

interface CalendarHeaderProps {
  view: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  periodLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onExportIcs: () => void;
  isExporting?: boolean;
}

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  view,
  onViewChange,
  periodLabel,
  onPrev,
  onNext,
  onToday,
  onExportIcs,
  isExporting = false,
}) => {
  const views: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'week', label: 'Неделя', icon: <CalendarDays className="w-4 h-4" /> },
    { id: 'month', label: 'Месяц', icon: <Grid3X3 className="w-4 h-4" /> },
    { id: 'list', label: 'Список', icon: <ListFilter className="w-4 h-4" /> },
    { id: 'timeline', label: 'Timeline', icon: <Milestone className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col gap-4 pb-2 border-b border-[#232032]">
      {/* Top row: Title + Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-sm">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-zinc-100 font-mono tracking-tight">
                  КАЛЕНДАРЬ РЕЛИЗОВ
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                  LIVE
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Будущие премьеры контента, новинки и даты выхода серий
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onExportIcs}
          disabled={isExporting}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-semibold transition-all self-start sm:self-auto shadow-sm"
          title="Скачать файл iCalendar для Apple Calendar, Google Calendar или Outlook"
        >
          <Download className="w-3.5 h-3.5 text-purple-400" />
          <span>{isExporting ? 'Экспорт...' : 'Экспорт .ics'}</span>
        </button>
      </div>

      {/* Bottom row: Period navigation + View Mode selector */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
        {/* Period Navigation */}
        <div className="flex items-center gap-2 bg-[#12111A] p-1 rounded-xl border border-[#232032] self-start sm:self-auto">
          <button
            onClick={onToday}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold border border-zinc-750 transition-all font-mono"
            title="Перейти к сегодняшнему дню"
          >
            <RotateCcw className="w-3 h-3 text-purple-400" />
            <span>Сегодня</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              title="Предыдущий период"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onNext}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
              title="Следующий период"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="px-3 py-1 text-xs font-bold text-purple-200 font-mono select-none">
            {periodLabel}
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center gap-1 bg-[#12111A] p-1 rounded-xl border border-[#232032] self-start sm:self-auto overflow-x-auto max-w-full">
          {views.map((v) => {
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => onViewChange(v.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  active
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                }`}
              >
                {v.icon}
                <span>{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
