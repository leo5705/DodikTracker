import React, { useState } from 'react';
import { ReleaseItem } from '../types.ts';
import { ReleaseCard } from '../ReleaseCard.tsx';
import { getWeekDays, formatDateRussian, getTodayDateString } from '../calendarUtils.ts';
import { Calendar, Sparkles } from 'lucide-react';

interface WeekViewProps {
  baseDate: string; // Target date inside the week (YYYY-MM-DD)
  items: ReleaseItem[];
  onToggleFollow: (item: ReleaseItem) => Promise<boolean>;
}

export const WeekView: React.FC<WeekViewProps> = ({
  baseDate,
  items,
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
      {/* MOBILE / TABLET VIEW (< lg screen) */}
      <div className="block lg:hidden space-y-4">
        {/* Horizontal Day Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          {weekDays.map((day) => {
            const count = itemsByDate[day.dateStr]?.length || 0;
            const isSelected = activeMobileDay === day.dateStr;
            return (
              <button
                key={day.dateStr}
                onClick={() => setActiveMobileDay(day.dateStr)}
                className={`flex-1 min-w-[70px] flex flex-col items-center py-2.5 px-2 rounded-2xl border transition-all text-center cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-b from-[#7C3AED] to-[#6366F1] text-white border-[#8B5CF6] shadow-lg shadow-[#7C3AED]/25'
                    : day.isToday
                    ? 'bg-[#151932] border-[#8B5CF6]/50 text-purple-200'
                    : 'bg-[#0B0D20] border-[#1E2442] text-[#94A3B8] hover:text-white hover:border-[#8B5CF6]/40'
                }`}
              >
                <span className="text-[10px] font-mono uppercase font-bold tracking-wider">
                  {day.weekdayShort}
                </span>
                <span className="text-base font-black font-mono my-0.5">
                  {day.dayNumber}
                </span>
                {count > 0 ? (
                  <span
                    className={`text-[9px] px-2 py-0.2 rounded-full font-mono font-bold ${
                      isSelected
                        ? 'bg-white/25 text-white'
                        : 'bg-[#8B5CF6]/20 text-[#A78BFA]'
                    }`}
                  >
                    {count}
                  </span>
                ) : (
                  <span className="text-[9px] text-[#64748B] font-mono">—</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Day Content */}
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#1E2442]">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#8B5CF6]" />
              <span>{formatDateRussian(activeMobileDay, true)}</span>
            </h3>
            <span className="text-xs font-mono text-[#94A3B8]">
              {itemsByDate[activeMobileDay]?.length || 0} релизов
            </span>
          </div>

          {itemsByDate[activeMobileDay] && itemsByDate[activeMobileDay].length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {itemsByDate[activeMobileDay].map((item) => (
                <ReleaseCard
                  key={item.id}
                  item={item}
                  onToggleFollow={onToggleFollow}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center rounded-3xl bg-[#0B0D20] border border-dashed border-[#1E2442] p-6 space-y-2">
              <Sparkles className="w-6 h-6 text-[#64748B] mx-auto stroke-1" />
              <p className="text-xs text-[#94A3B8] font-mono">
                На этот день нет запланированных релизов
              </p>
            </div>
          )}
        </div>
      </div>

      {/* DESKTOP 7-COLUMN GRID (lg and above) */}
      {/* Strict non-overlapping layout: 7 distinct columns with standard document flow */}
      <div className="hidden lg:grid grid-cols-7 gap-3 items-start">
        {weekDays.map((day) => {
          const dayItems = itemsByDate[day.dateStr] || [];
          const monthShort = formatDateRussian(day.dateStr, false).split(' ')[1] || '';

          return (
            <div
              key={day.dateStr}
              className={`flex flex-col rounded-3xl border min-h-[460px] h-auto transition-all shadow-xl ${
                day.isToday
                  ? 'bg-[#0E1128] border-[#8B5CF6]/50 ring-1 ring-[#8B5CF6]/40'
                  : 'bg-[#0B0D20] border-[#1E2442]'
              }`}
            >
              {/* Day Header */}
              <div
                className={`p-3 rounded-t-3xl border-b flex items-center justify-between shrink-0 ${
                  day.isToday
                    ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/30'
                    : 'bg-[#11152A] border-[#1E2442]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-white font-mono uppercase">
                      {day.weekdayShort}
                    </span>
                    {day.isToday && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-[#8B5CF6] text-white font-mono shadow-sm">
                        СЕГОДНЯ
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-[#94A3B8] font-mono">
                    {day.dayNumber} {monthShort}
                  </span>
                </div>

                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                    dayItems.length > 0
                      ? 'bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30'
                      : 'text-[#64748B] bg-[#151932]'
                  }`}
                >
                  {dayItems.length}
                </span>
              </div>

              {/* Releases List: Normal vertical stacked items without absolute clipping */}
              <div className="p-2 flex flex-col gap-2.5 flex-1 w-full">
                {dayItems.length > 0 ? (
                  dayItems.map((item) => (
                    <ReleaseCard
                      key={item.id}
                      item={item}
                      onToggleFollow={onToggleFollow}
                      compact={true}
                    />
                  ))
                ) : (
                  <div className="flex-1 min-h-[160px] flex flex-col items-center justify-center text-center p-3">
                    <span className="text-xs text-[#64748B] font-mono">
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
