import React, { useState } from 'react';
import { ReleaseItem } from '../types.ts';
import {
  getMonthCalendarGrid,
  WEEKDAY_SHORT_RU,
  getCategoryBadge,
  getDetailRouteForRelease,
} from '../calendarUtils.ts';
import { DayDetailModal } from '../DayDetailModal.tsx';
import { Film, Tv, Flame, Gamepad2, Sparkles } from 'lucide-react';
import { useRouter } from '../../../context/RouterContext.tsx';

interface MonthViewProps {
  year: number;
  month: number; // 0-indexed (0 = Jan, 8 = Sep)
  items: ReleaseItem[];
  onOpenDetails?: (item: ReleaseItem) => void;
  onToggleFollow: (item: ReleaseItem) => Promise<boolean>;
}

export const MonthView: React.FC<MonthViewProps> = ({
  year,
  month,
  items,
  onOpenDetails,
  onToggleFollow,
}) => {
  const { navigate } = useRouter();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const grid = getMonthCalendarGrid(year, month);

  // Group items by YYYY-MM-DD
  const itemsByDate: Record<string, ReleaseItem[]> = {};
  for (const item of items) {
    const d = item.releaseDate?.slice(0, 10);
    if (d) {
      if (!itemsByDate[d]) itemsByDate[d] = [];
      itemsByDate[d].push(item);
    }
  }

  const renderMiniIcon = (name: string) => {
    switch (name) {
      case 'Film':
        return <Film className="w-2.5 h-2.5 shrink-0" />;
      case 'Tv':
        return <Tv className="w-2.5 h-2.5 shrink-0" />;
      case 'Flame':
        return <Flame className="w-2.5 h-2.5 shrink-0" />;
      case 'Gamepad2':
        return <Gamepad2 className="w-2.5 h-2.5 shrink-0" />;
      default:
        return <Sparkles className="w-2.5 h-2.5 shrink-0" />;
    }
  };

  return (
    <div className="space-y-2">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
        {WEEKDAY_SHORT_RU.map((dayName, idx) => (
          <div
            key={dayName}
            className={`py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider ${
              idx >= 5 ? 'text-purple-400/80' : 'text-zinc-400'
            }`}
          >
            {dayName}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {grid.flat().map((cell, idx) => {
          const dayItems = itemsByDate[cell.dateStr] || [];
          const hasReleases = dayItems.length > 0;

          return (
            <div
              key={`${cell.dateStr}-${idx}`}
              onClick={() => {
                if (hasReleases) {
                  setSelectedDate(cell.dateStr);
                }
              }}
              className={`min-h-[85px] sm:min-h-[115px] p-1.5 sm:p-2 rounded-xl sm:rounded-2xl border flex flex-col justify-between transition-all ${
                cell.isToday
                  ? 'bg-[#181528] border-purple-500/60 ring-1 ring-purple-500/30'
                  : cell.isCurrentMonth
                  ? 'bg-[#12111A] border-[#232032] hover:border-zinc-700'
                  : 'bg-[#0E0D14]/60 border-[#1B1925] opacity-40'
              } ${hasReleases ? 'cursor-pointer hover:bg-[#191724]' : ''}`}
            >
              {/* Day header */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs sm:text-sm font-mono font-bold ${
                    cell.isToday
                      ? 'w-5 sm:w-6 h-5 sm:h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] sm:text-xs'
                      : cell.isCurrentMonth
                      ? 'text-zinc-200'
                      : 'text-zinc-600'
                  }`}
                >
                  {cell.dayNumber}
                </span>

                {hasReleases && (
                  <span className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 font-bold">
                    {dayItems.length}
                  </span>
                )}
              </div>

              {/* Release chips (up to 3) */}
              <div className="space-y-1 my-1 overflow-hidden">
                {dayItems.slice(0, 2).map((item) => {
                  const meta = getCategoryBadge(item.type);
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenDetails) onOpenDetails(item);
                        navigate(getDetailRouteForRelease(item));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          e.preventDefault();
                          if (onOpenDetails) onOpenDetails(item);
                          navigate(getDetailRouteForRelease(item));
                        }
                      }}
                      className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-medium border truncate flex items-center gap-1 transition-all ${meta.bg} ${meta.text} ${meta.border} hover:scale-[1.02] cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400`}
                      title={`${item.title} (${meta.label})`}
                    >
                      {renderMiniIcon(meta.iconName)}
                      <span className="truncate">{item.title}</span>
                    </div>
                  );
                })}

                {dayItems.length > 2 && (
                  <div className="text-[9px] font-mono text-purple-400 font-semibold px-1">
                    +{dayItems.length - 2} еще
                  </div>
                )}
              </div>

              {/* Bottom indicator */}
              <div className="h-1">
                {hasReleases && (
                  <div className="w-full h-0.5 rounded-full bg-purple-500/40" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day Details Modal */}
      {selectedDate && (
        <DayDetailModal
          dateStr={selectedDate}
          items={itemsByDate[selectedDate] || []}
          onClose={() => setSelectedDate(null)}
          onOpenDetails={() => setSelectedDate(null)}
          onToggleFollow={onToggleFollow}
        />
      )}
    </div>
  );
};
