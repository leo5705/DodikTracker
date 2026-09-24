import React, { useState } from 'react';
import { BookOpen, AlertTriangle, Eye, EyeOff, Sparkles, Quote } from 'lucide-react';
import { UnifiedContentItem } from '../../types/content.ts';

interface ContentPlotProps {
  item: UnifiedContentItem;
}

export const ContentPlot: React.FC<ContentPlotProps> = ({ item }) => {
  const [showSpoilers, setShowSpoilers] = useState(false);

  const hasDescription = Boolean(item.description);
  const hasTagline = Boolean(item.tagline);

  if (!hasDescription && !hasTagline) {
    return (
      <div className="p-8 rounded-3xl bg-[#11152A] border border-[#1E2442] text-center space-y-2">
        <BookOpen className="w-8 h-8 text-[#64748B] mx-auto stroke-1" />
        <p className="text-xs text-[#94A3B8]">Описание сюжета ещё не добавлено</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-[#11152A] border border-[#1E2442] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E2442] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#151932] border border-[#8B5CF6]/30 text-[#A78BFA]">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#F8FAFC]">Сюжет и синопсис</h2>
            <p className="text-xs text-[#94A3B8]">История, ключевые события и лейтмотив</p>
          </div>
        </div>

        {/* Spoilers toggle */}
        <button
          onClick={() => setShowSpoilers(!showSpoilers)}
          className="px-3 py-1.5 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs font-medium text-[#CBD5E1] hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer w-fit"
        >
          {showSpoilers ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5 text-[#A78BFA]" />}
          <span>{showSpoilers ? 'Скрыть детали' : 'Показать спойлеры'}</span>
        </button>
      </div>

      {/* Tagline Callout */}
      {item.tagline && (
        <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#8B5CF6]/30 flex items-start gap-3">
          <Quote className="w-5 h-5 text-[#A78BFA] shrink-0 mt-0.5" />
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#A78BFA] font-mono">
              Слоган произведения
            </span>
            <p className="text-sm font-medium text-[#F8FAFC] italic mt-0.5">
              «{item.tagline}»
            </p>
          </div>
        </div>
      )}

      {/* Main Synopsis */}
      {item.description && (
        <div className="space-y-4">
          <div className="text-xs sm:text-sm text-[#CBD5E1] leading-relaxed whitespace-pre-line space-y-3 font-sans">
            {item.description}
          </div>
        </div>
      )}

      {/* Source Material Note */}
      {item.sourceMaterial && (
        <div className="pt-4 border-t border-[#1E2442] flex items-center gap-2 text-xs text-[#94A3B8]">
          <Sparkles className="w-3.5 h-3.5 text-[#A78BFA]" />
          <span>
            Первоисточник / Основа сюжета: <b className="text-[#F8FAFC]">{item.sourceMaterial}</b>
          </span>
        </div>
      )}
    </div>
  );
};
