import React from 'react';
import { ReleaseItem } from '../types.ts';
import { ReleaseCard } from '../ReleaseCard.tsx';
import { formatDateRussian, getTodayDateString } from '../calendarUtils.ts';
import { Calendar, Sparkles, Loader2 } from 'lucide-react';

interface ListViewProps {
  items: ReleaseItem[];
  onOpenDetails?: (item: ReleaseItem) => void;
  onToggleFollow: (item: ReleaseItem) => Promise<boolean>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export const ListView: React.FC<ListViewProps> = ({
  items,
  onOpenDetails,
  onToggleFollow,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}) => {
  const todayStr = getTodayDateString();

  // Group items by date string
  const dateGroups: { dateStr: string; label: string; isToday: boolean; items: ReleaseItem[] }[] = [];
  const groupMap = new Map<string, ReleaseItem[]>();

  for (const item of items) {
    const d = item.releaseDate?.slice(0, 10) || 'no-date';
    if (!groupMap.has(d)) {
      groupMap.set(d, []);
    }
    groupMap.get(d)!.push(item);
  }

  // Iterate in order
  for (const [dateStr, groupItems] of groupMap.entries()) {
    let label = formatDateRussian(dateStr, true);
    const isToday = dateStr === todayStr;

    if (isToday) {
      label = `СЕГОДНЯ · ${formatDateRussian(dateStr, false)}`;
    } else if (itemIsTomorrow(dateStr, todayStr)) {
      label = `ЗАВТРА · ${formatDateRussian(dateStr, false)}`;
    }

    dateGroups.push({
      dateStr,
      label,
      isToday,
      items: groupItems,
    });
  }

  function itemIsTomorrow(targetDate: string, today: string): boolean {
    const t = new Date(today + 'T00:00:00Z');
    const tomorrow = new Date(t.getTime() + 86400000).toISOString().slice(0, 10);
    return targetDate === tomorrow;
  }

  if (items.length === 0) {
    return (
      <div className="py-20 text-center rounded-3xl bg-[#0B0D20] border border-dashed border-[#1E2442] p-8 space-y-3">
        <Sparkles className="w-8 h-8 text-[#64748B] mx-auto" />
        <h3 className="text-sm font-semibold text-[#CBD5E1] font-mono">
          Релизы не найдены
        </h3>
        <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
          Попробуйте изменить категорию, диапазон дат или сбросить фильтры
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dateGroups.map((group) => (
        <div key={group.dateStr} className="space-y-3">
          {/* Sticky section header */}
          <div className="sticky top-0 z-10 py-2 px-3.5 rounded-xl bg-[#080A18]/95 backdrop-blur border border-[#1E2442] flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#8B5CF6]" />
              <h3
                className={`text-xs sm:text-sm font-mono font-bold ${
                  group.isToday ? 'text-[#A78BFA]' : 'text-[#F8FAFC]'
                }`}
              >
                {group.label}
              </h3>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#8B5CF6]/20 text-[#A78BFA] font-semibold">
              {group.items.length} {group.items.length === 1 ? 'релиз' : 'релизов'}
            </span>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
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

      {/* Load More Button */}
      {hasMore && (
        <div className="pt-4 text-center">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="px-6 py-2.5 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-[#A78BFA] hover:text-white text-xs font-semibold font-mono transition-all inline-flex items-center gap-2 shadow-md cursor-pointer"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#8B5CF6]" />
                <span>Загрузка...</span>
              </>
            ) : (
              <span>Загрузить еще релизы</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
