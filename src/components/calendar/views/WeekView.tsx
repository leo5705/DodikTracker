import React, { useState } from 'react';
import { ReleaseItem } from '../types.ts';
import { ReleaseCard } from '../ReleaseCard.tsx';
import { getWeekDays, formatDateRussian, getTodayDateString } from '../calendarUtils.ts';
import { Calendar, Sparkles } from 'lucide-react';

interface WeekViewProps {
  baseDate: string; // Target date inside the week (YYYY-MM-DD)
  items: ReleaseItem[];
  onOpenDetails?: (item: ReleaseItem) => void;
  onToggleFollow: (item: ReleaseItem) => Promise<boolean>;
}

export const WeekView: React.FC<WeekViewProps> = ({
  baseDate,
  items,
  onOpenDetails,
  onToggleFollow,
}) => {
  const weekDays = getWeekDays(baseDate);
  const todayStr = getTodayDateString();

  // Mobile active tab: default to today if in this week, else monday
  const [activeMobileDay, setActiveMobileDay] = useState<string>(() => {
    const todayInWeek = weekDays.find((d) => d.dateStr === todayStr);
    return todayInWeek ? todayInWeek.dateStr : weekDays[0].dateStr;
  });

  // Group items by date
  const itemsByDate: Record<string, ReleaseItem[]> = {};
  for (const day of weekDays) {
    itemsByDate[day.dateStr] = [];
  }
  for (const item of items) {
    const d = item.releaseDate?.slice(0, 10);
    if (d && itemsByDate[d]) {
      itemsByDate[d].push(item);
    }
  }

  return (
    <div className="space-y-4">
      {/* Mobile Day Selector (Visible only on sm and below) */}
      <div className="block lg:hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
          {weekDays.map((day) => {
            const count = itemsByDate[day.dateStr]?.length || 0;
            const isSelected = activeMobileDay === day.dateStr;
            return (
              <button
                key={day.dateStr}
                onClick={() => setActiveMobileDay(day.dateStr)}
                className={`flex-1 min-w-[68px] flex flex-col items-center py-2 px-1 rounded-xl border transition-all text-center ${
                  isSelected
                    ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-900/30'
                    : day.isToday
                    ? 'bg-purple-950/30 border-purple-500/40 text-purple-200'
                    : 'bg-[#13121B] border-[#232032] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className="text-[10px] font-mono uppercase tracking-wider">
                  {day.weekdayShort}
                </span>
                <span className="text-base font-bold font-mono my-0.5">
                  {day.dayNumber}
                </span>
                {count > 0 ? (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-purple-500/20 text-purple-300'
                    }`}
                  >
                    {count}
                  </span>
                ) : (
                  <span className="text-[9px] text-zinc-600 font-mono">-</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Day Content on Mobile / Tablet */}
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#232032]">
            <h3 className="text-sm font-bold text-zinc-200 font-mono flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-400" />
              <span>{formatDateRussian(activeMobileDay, true)}</span>
            </h3>
            <span className="text-xs font-mono text-zinc-400">
              {itemsByDate[activeMobileDay]?.length || 0} релизов
            </span>
          </div>

          {itemsByDate[activeMobileDay] && itemsByDate[activeMobileDay].length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {itemsByDate[activeMobileDay].map((item) => (
                <ReleaseCard
                  key={item.id}
                  item={item}
                  onOpenDetails={onOpenDetails}
                  onToggleFollow={onToggleFollow}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center rounded-2xl bg-[#13121B]/40 border border-dashed border-[#232032] p-6 space-y-2">
              <p className="text-xs text-zinc-400 font-mono">
                На этот день нет запланированных релизов
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Desktop 7-Column Layout (Visible on lg and above) */}
      <div className="hidden lg:grid grid-cols-7 gap-2.5 items-start">
        {weekDays.map((day) => {
          const dayItems = itemsByDate[day.dateStr] || [];
          return (
            <div
              key={day.dateStr}
              className={`flex flex-col rounded-2xl border min-h-[460px] h-auto transition-colors ${
                day.isToday
                  ? 'bg-[#151322] border-purple-500/50 ring-1 ring-purple-500/30'
                  : 'bg-[#12111A] border-[#232032]'
              }`}
            >
              {/* Day Header */}
              <div
                className={`p-2.5 rounded-t-2xl border-b flex items-center justify-between shrink-0 ${
                  day.isToday
                    ? 'bg-purple-600/15 border-purple-500/30'
                    : 'bg-[#151420]/80 border-[#232032]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-zinc-300 font-mono">
                      {day.weekdayShort}
                    </span>
                    {day.isToday && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500 text-white font-mono">
                        СЕГОДНЯ
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-zinc-400 font-mono">
                    {day.dayNumber} {formatDateRussian(day.dateStr, false).split(' ')[1]}
                  </span>
                </div>

                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                    dayItems.length > 0
                      ? 'bg-purple-500/20 text-purple-300 font-bold'
                      : 'text-zinc-600'
                  }`}
                >
                  {dayItems.length}
                </span>
              </div>

              {/* Releases for Day: Normal vertical flow with gap-2.5, no fixed clipping */}
              <div className="p-2 flex flex-col gap-2.5 flex-1 w-full">
                {dayItems.length > 0 ? (
                  dayItems.map((item) => (
                    <ReleaseCard
                      key={item.id}
                      item={item}
                      onOpenDetails={onOpenDetails}
                      onToggleFollow={onToggleFollow}
                      compact={true}
                    />
                  ))
                ) : (
                  <div className="flex-1 min-h-[140px] flex flex-col items-center justify-center text-center p-3">
                    <span className="text-xs text-zinc-500 font-mono">
                      Нет релизов
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
