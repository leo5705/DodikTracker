import React, { useState } from 'react';
import { ReleaseItem } from '../types.ts';
import {
  getMonthCalendarGrid,
  WEEKDAY_SHORT_RU,
  getCategoryBadge,
  formatDateRussian,
} from '../calendarUtils.ts';
import { formatMediaTypePath } from '../../../utils/formatters.ts';
import { Film, Tv, Flame, Gamepad2, Sparkles, Star, Calendar, ChevronRight } from 'lucide-react';
import { useRouter } from '../../../context/RouterContext.tsx';
import { ReleaseCard } from '../ReleaseCard.tsx';

interface MonthViewProps {
  year: number;
  month: number; // 0-indexed (0 = Jan, 8 = Sep)
  items: ReleaseItem[];
  onToggleFollow: (item: ReleaseItem) => Promise<boolean>;
}

export const MonthView: React.FC<MonthViewProps> = ({
  year,
  month,
  items,
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

  const selectedDayItems = selectedDate ? itemsByDate[selectedDate] || [] : [];

  return (
    <div className="space-y-4">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center">
        {WEEKDAY_SHORT_RU.map((dayName, idx) => (
          <div
            key={dayName}
            className={`py-2 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-[11px] font-mono font-bold uppercase tracking-wider ${
              idx >= 5 ? 'text-[#A78BFA]' : 'text-[#94A3B8]'
            }`}
          >
            {dayName}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {grid.flat().map((cell, idx) => {
          const dayItems = itemsByDate[cell.dateStr] || [];
          const hasReleases = dayItems.length > 0;
          const isSelected = selectedDate === cell.dateStr;

          return (
            <div
              key={`${cell.dateStr}-${idx}`}
              onClick={() => {
                if (hasReleases) {
                  setSelectedDate(isSelected ? null : cell.dateStr);
                }
              }}
              className={`min-h-[90px] sm:min-h-[125px] p-1.5 sm:p-2.5 rounded-2xl border flex flex-col justify-between transition-all ${
                isSelected
                  ? 'bg-[#151932] border-[#8B5CF6] ring-2 ring-[#8B5CF6]/50 shadow-xl'
                  : cell.isToday
                  ? 'bg-[#0E1128] border-[#8B5CF6]/50 ring-1 ring-[#8B5CF6]/30'
                  : cell.isCurrentMonth
                  ? 'bg-[#0B0D20] border-[#1E2442] hover:border-[#8B5CF6]/40'
                  : 'bg-[#080A18]/60 border-[#151932] opacity-35'
              } ${hasReleases ? 'cursor-pointer hover:bg-[#11152A]' : ''}`}
            >
              {/* Day cell header */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs sm:text-sm font-mono font-bold ${
                    cell.isToday
                      ? 'text-[#A78BFA]'
                      : cell.isCurrentMonth
                      ? 'text-white'
                      : 'text-[#64748B]'
                  }`}
                >
                  {cell.dayNumber}
                </span>

                {hasReleases && (
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                      cell.isToday || isSelected
                        ? 'bg-[#8B5CF6] text-white shadow-sm'
                        : 'bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30'
                    }`}
                  >
                    {dayItems.length}
                  </span>
                )}
              </div>

              {/* Day mini preview items */}
              <div className="space-y-1 overflow-hidden my-auto">
                {dayItems.slice(0, 2).map((item) => {
                  const meta = getCategoryBadge(item.type);
                  const targetId = item.mediaId || item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/media/${formatMediaTypePath(item.type)}/${targetId}`);
                      }}
                      className="group/item flex items-center gap-1.5 px-1.5 py-1 rounded-lg bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/50 transition-all cursor-pointer truncate"
                      title={`${item.title} (${meta.label})`}
                    >
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt=""
                          className="w-3.5 h-4.5 rounded-sm object-cover shrink-0"
                        />
                      ) : (
                        <span className={`shrink-0 ${meta.text}`}>
                          {renderMiniIcon(meta.iconName)}
                        </span>
                      )}

                      <span className="text-[10px] font-semibold text-[#CBD5E1] group-hover/item:text-white truncate">
                        {item.title}
                      </span>
                    </div>
                  );
                })}

                {dayItems.length > 2 && (
                  <div className="text-[9px] font-mono text-[#A78BFA] px-1 font-semibold">
                    +{dayItems.length - 2} еще
                  </div>
                )}
              </div>

              {/* Today bottom label */}
              {cell.isToday && (
                <div className="text-[9px] font-mono text-[#A78BFA] font-bold text-center mt-1">
                  Сегодня
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Day Full List Section (Expands directly inline below grid, NO modal) */}
      {selectedDate && selectedDayItems.length > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-[#0B0D20] border border-[#8B5CF6]/40 shadow-2xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E2442]">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#8B5CF6]" />
              <h3 className="text-sm font-bold text-white font-mono">
                Релизы на {formatDateRussian(selectedDate, true)}
              </h3>
              <span className="px-2 py-0.5 rounded-md bg-[#8B5CF6]/20 text-[#A78BFA] text-[10px] font-mono font-bold">
                {selectedDayItems.length} тайтлов
              </span>
            </div>

            <button
              onClick={() => setSelectedDate(null)}
              className="text-xs text-[#94A3B8] hover:text-white font-medium"
            >
              Свернуть
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {selectedDayItems.map((item) => (
              <ReleaseCard
                key={item.id}
                item={item}
                onToggleFollow={onToggleFollow}
                compact={true}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
