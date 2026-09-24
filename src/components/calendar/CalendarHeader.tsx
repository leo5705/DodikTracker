import React from 'react';
import {
  CalendarDays,
  Calendar,
  Grid3X3,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Sparkles,
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
    { id: 'week', label: 'Неделя', icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { id: 'month', label: 'Месяц', icon: <Grid3X3 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col gap-4 pb-4 border-b border-[#1E2442]">
      {/* Top row: Title + Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#7C3AED]/20 to-[#6366F1]/20 border border-[#8B5CF6]/40 flex items-center justify-center text-[#A78BFA] shadow-lg shadow-[#7C3AED]/10">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">
                Календарь релизов
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30 font-mono">
                Tracker
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Премьеры, даты выхода серий и новинки медиа
            </p>
          </div>
        </div>

        <button
          onClick={onExportIcs}
          disabled={isExporting}
          className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 text-[#CBD5E1] hover:text-white text-xs font-semibold transition-all self-start sm:self-auto cursor-pointer shadow-md"
          title="Скачать .ics файл для Apple Calendar, Google Calendar или Outlook"
        >
          <Download className="w-3.5 h-3.5 text-[#8B5CF6]" />
          <span>{isExporting ? 'Экспорт...' : 'Экспорт .ics'}</span>
        </button>
      </div>

      {/* Bottom row: Period navigation + View Mode Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Period Navigation */}
        <div className="flex items-center gap-2 bg-[#0B0D20] p-1.5 rounded-2xl border border-[#1E2442] self-start sm:self-auto shadow-md">
          <button
            onClick={onToday}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#151932] hover:bg-[#8B5CF6]/20 text-white text-xs font-bold border border-[#1E2442] hover:border-[#8B5CF6]/40 transition-all font-mono cursor-pointer"
            title="Перейти к сегодняшнему дню"
          >
            <RotateCcw className="w-3 h-3 text-[#A78BFA]" />
            <span>Сегодня</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              className="p-1.5 rounded-xl hover:bg-[#151932] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
              title="Предыдущий период"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onNext}
              className="p-1.5 rounded-xl hover:bg-[#151932] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
              title="Следующий период"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <span className="text-xs font-bold text-white font-mono px-2 truncate">
            {periodLabel}
          </span>
        </div>

        {/* View Mode Tabs (Неделя / Месяц) */}
        <div className="flex items-center gap-1 bg-[#0B0D20] p-1.5 rounded-2xl border border-[#1E2442] shadow-md">
          {views.map((v) => {
            const isActive = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => onViewChange(v.id)}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-lg shadow-[#7C3AED]/25'
                    : 'text-[#94A3B8] hover:text-white hover:bg-[#151932]'
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
