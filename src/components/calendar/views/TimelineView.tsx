import React from 'react';
import { ReleaseItem } from '../types.ts';
import { ReleaseCard } from '../ReleaseCard.tsx';
import { formatDateRussian, getTodayDateString } from '../calendarUtils.ts';
import { Milestone, Sparkles, Calendar, Clock } from 'lucide-react';

interface TimelineViewProps {
  items: ReleaseItem[];
  onOpenDetails?: (item: ReleaseItem) => void;
  onToggleFollow: (item: ReleaseItem) => Promise<boolean>;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  items,
  onOpenDetails,
  onToggleFollow,
}) => {
  const todayStr = getTodayDateString();

  // Group items by date
  const dateGroups: { dateStr: string; items: ReleaseItem[]; isToday: boolean }[] = [];
  const groupMap = new Map<string, ReleaseItem[]>();

  for (const item of items) {
    const d = item.releaseDate?.slice(0, 10) || 'no-date';
    if (!groupMap.has(d)) groupMap.set(d, []);
    groupMap.get(d)!.push(item);
  }

  for (const [dateStr, groupItems] of groupMap.entries()) {
    dateGroups.push({
      dateStr,
      items: groupItems,
      isToday: dateStr === todayStr,
    });
  }

  if (items.length === 0) {
    return (
      <div className="py-20 text-center rounded-3xl bg-[#13121B]/40 border border-dashed border-[#232032] p-8 space-y-3">
        <Sparkles className="w-8 h-8 text-zinc-600 mx-auto" />
        <h3 className="text-sm font-semibold text-zinc-300 font-mono">
          На временной шкале нет релизов
        </h3>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto">
          Измените фильтры или выберите другой период
        </p>
      </div>
    );
  }

  return (
    <div className="relative py-4 pl-4 sm:pl-8">
      {/* Vertical continuous line */}
      <div className="absolute top-0 bottom-0 left-4 sm:left-8 w-0.5 bg-gradient-to-b from-purple-500 via-purple-500/40 to-transparent -translate-x-1/2" />

      <div className="space-y-8">
        {dateGroups.map((group) => (
          <div key={group.dateStr} className="relative pl-6 sm:pl-8">
            {/* Timeline node */}
            <div
              className={`absolute left-0 -translate-x-1/2 w-4 h-4 rounded-full border-2 transition-all ${
                group.isToday
                  ? 'bg-purple-500 border-white ring-4 ring-purple-500/30 scale-125'
                  : 'bg-[#151422] border-purple-400'
              }`}
            />

            {/* Date Milestone Label */}
            <div className="mb-3 flex items-center gap-2.5 flex-wrap">
              <span
                className={`text-xs sm:text-sm font-bold font-mono px-3 py-1 rounded-xl border flex items-center gap-2 ${
                  group.isToday
                    ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-900/40'
                    : 'bg-[#12111A] text-zinc-200 border-[#232032]'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{formatDateRussian(group.dateStr, true)}</span>
              </span>

              {group.isToday && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                  СЕГОДНЯ
                </span>
              )}

              <span className="text-[11px] font-mono text-zinc-500">
                {group.items.length} {group.items.length === 1 ? 'релиз' : 'релизов'}
              </span>
            </div>

            {/* Release Cards under node */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {group.items.map((item) => (
                <ReleaseCard
                  key={item.id}
                  item={item}
                  onOpenDetails={onOpenDetails}
                  onToggleFollow={onToggleFollow}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
