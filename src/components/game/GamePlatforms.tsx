import React, { useState, useEffect } from 'react';
import { Monitor, Cpu, Sparkles, CheckCircle2, ChevronRight } from 'lucide-react';
import { UnifiedPlatform } from '../../types/unifiedGame.ts';

interface GamePlatformsProps {
  platforms: UnifiedPlatform[];
}

// Clean and format requirements text into structured items
const formatRequirementText = (rawText: string) => {
  if (!rawText) return [];
  // Remove redundant starting headers like "Minimum:", "Recommended:", "Минимальные:", "Рекомендуемые:"
  let clean = rawText
    .replace(/^(Minimum|Recommended|Минимальные|Рекомендуемые)\s*:?\s*/i, '')
    .trim();

  // Split by newlines or standard delimiters
  const lines = clean
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines;
};

export const GamePlatforms: React.FC<GamePlatformsProps> = ({ platforms }) => {
  const getBestInitialPlatform = (list: UnifiedPlatform[]): UnifiedPlatform | null => {
    if (!list || list.length === 0) return null;
    const withReqs = list.find(
      (p) => Boolean(p.requirements?.minimum || p.requirements?.recommended)
    );
    if (withReqs) return withReqs;

    const pc = list.find((p) => {
      const lower = p.name.toLowerCase();
      return lower === 'pc' || lower.includes('windows') || lower.includes('pc (');
    });
    return pc || list[0];
  };

  const [selectedPlatform, setSelectedPlatform] = useState<UnifiedPlatform | null>(() =>
    getBestInitialPlatform(platforms)
  );

  useEffect(() => {
    if (platforms && platforms.length > 0) {
      setSelectedPlatform((prev) => {
        if (prev && platforms.some((p) => p.id === prev.id)) {
          // If previous platform exists in new list, keep it unless it has no requirements and another one does
          const currentHasReqs = Boolean(prev.requirements?.minimum || prev.requirements?.recommended);
          if (currentHasReqs) {
            const updated = platforms.find((p) => p.id === prev.id);
            return updated || prev;
          }
        }
        return getBestInitialPlatform(platforms);
      });
    }
  }, [platforms]);

  if (!platforms || platforms.length === 0) return null;

  const platformWithReqs = platforms.find(
    (p) => Boolean(p.requirements?.minimum || p.requirements?.recommended)
  );

  const selectedHasReqs = Boolean(
    selectedPlatform?.requirements?.minimum || selectedPlatform?.requirements?.recommended
  );

  const minLines = selectedPlatform?.requirements?.minimum
    ? formatRequirementText(selectedPlatform.requirements.minimum)
    : [];

  const recLines = selectedPlatform?.requirements?.recommended
    ? formatRequirementText(selectedPlatform.requirements.recommended)
    : [];

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-6">
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
          <Monitor className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Платформы и системные требования</h2>
          <p className="text-xs text-zinc-400">Доступные платформы и технические спецификации</p>
        </div>
      </div>

      {/* Platform Chips Bar */}
      <div className="flex flex-wrap gap-2">
        {platforms.map((p) => {
          const isSelected = selectedPlatform?.id === p.id;
          const hasReqs = Boolean(p.requirements?.minimum || p.requirements?.recommended);

          return (
            <button
              key={p.id}
              onClick={() => setSelectedPlatform(p)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-semibold border transition-all flex items-center gap-2 ${
                isSelected
                  ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : 'bg-zinc-950/80 border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white'
              }`}
            >
              <span>{p.name}</span>
              {hasReqs && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Есть системные требования" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Platform System Requirements Display */}
      {selectedHasReqs ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Minimum Requirements */}
          {minLines.length > 0 && (
            <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 pb-2 border-b border-zinc-800/60">
                <Cpu className="w-4 h-4" />
                <span>Минимальные требования</span>
              </div>
              <div className="space-y-2">
                {minLines.map((line, idx) => {
                  const colonIdx = line.indexOf(':');
                  if (colonIdx > 0 && colonIdx < 25) {
                    const label = line.slice(0, colonIdx).trim();
                    const value = line.slice(colonIdx + 1).trim();
                    return (
                      <div key={idx} className="text-xs text-zinc-300 flex flex-col sm:flex-row sm:gap-2 leading-relaxed">
                        <span className="text-zinc-400 font-semibold sm:w-28 shrink-0">{label}:</span>
                        <span className="text-zinc-200 font-medium">{value}</span>
                      </div>
                    );
                  }
                  return (
                    <p key={idx} className="text-xs text-zinc-300 leading-relaxed">
                      {line}
                    </p>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recommended Requirements */}
          {recLines.length > 0 && (
            <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 pb-2 border-b border-zinc-800/60">
                <Sparkles className="w-4 h-4" />
                <span>Рекомендуемые требования</span>
              </div>
              <div className="space-y-2">
                {recLines.map((line, idx) => {
                  const colonIdx = line.indexOf(':');
                  if (colonIdx > 0 && colonIdx < 25) {
                    const label = line.slice(0, colonIdx).trim();
                    const value = line.slice(colonIdx + 1).trim();
                    return (
                      <div key={idx} className="text-xs text-zinc-300 flex flex-col sm:flex-row sm:gap-2 leading-relaxed">
                        <span className="text-zinc-400 font-semibold sm:w-28 shrink-0">{label}:</span>
                        <span className="text-zinc-200 font-medium">{value}</span>
                      </div>
                    );
                  }
                  return (
                    <p key={idx} className="text-xs text-zinc-300 leading-relaxed">
                      {line}
                    </p>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 rounded-2xl bg-zinc-950/50 border border-zinc-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="text-xs text-zinc-400">
            Для платформы <span className="text-zinc-200 font-semibold">{selectedPlatform?.name}</span> системные требования не требуются или конфигурация фиксирована производителем.
          </div>
          {platformWithReqs && platformWithReqs.id !== selectedPlatform?.id && (
            <button
              onClick={() => setSelectedPlatform(platformWithReqs)}
              className="px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 border border-purple-800/40 text-purple-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
            >
              <span>Показать требования для {platformWithReqs.name}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
