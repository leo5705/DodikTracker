import React from 'react';
import { X, Calendar, Sparkles } from 'lucide-react';
import { ReleaseItem } from './types.ts';
import { ReleaseCard } from './ReleaseCard.tsx';
import { formatDateRussian } from './calendarUtils.ts';

interface DayDetailModalProps {
  dateStr: string | null;
  items: ReleaseItem[];
  onClose: () => void;
  onOpenDetails: (item: ReleaseItem) => void;
  onToggleFollow: (item: ReleaseItem) => Promise<boolean>;
}

export const DayDetailModal: React.FC<DayDetailModalProps> = ({
  dateStr,
  items,
  onClose,
  onOpenDetails,
  onToggleFollow,
}) => {
  if (!dateStr) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#12111A] border border-[#232032] rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#232032] flex items-center justify-between bg-[#151422]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 font-mono">
                {formatDateRussian(dateStr, true)}
              </h2>
              <p className="text-xs text-zinc-400">
                Релизы на этот день: <span className="text-purple-300 font-semibold">{items.length}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 scrollbar-thin">
          {items.length > 0 ? (
            items.map((item) => (
              <ReleaseCard
                key={item.id}
                item={item}
                onOpenDetails={(clickedItem) => {
                  onClose();
                  if (onOpenDetails) onOpenDetails(clickedItem);
                }}
                onToggleFollow={onToggleFollow}
              />
            ))
          ) : (
            <div className="py-16 text-center text-zinc-400">
              <Sparkles className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
              <p className="text-sm font-mono">На этот день нет релизов</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-[#232032] bg-[#151422] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-all"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
