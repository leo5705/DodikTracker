import React, { useState } from 'react';
import { FileText, Users, Tag, Globe, Sparkles } from 'lucide-react';
import { UnifiedGame } from '../../types/unifiedGame.ts';

interface GameOverviewProps {
  game: UnifiedGame;
}

export const GameOverview: React.FC<GameOverviewProps> = ({ game }) => {
  const [showFullDesc, setShowFullDesc] = useState(false);
  const description = game.description || 'Описание игры отсутствует.';
  const isLongDesc = description.length > 500;
  const displayDesc = isLongDesc && !showFullDesc ? `${description.slice(0, 500)}...` : description;

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
            <FileText className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-zinc-100">Об игре</h2>
        </div>
      </div>

      {/* Description Text */}
      <div className="space-y-3">
        <p className="text-sm md:text-base text-zinc-300 leading-relaxed whitespace-pre-line font-normal">
          {displayDesc}
        </p>
        {isLongDesc && (
          <button
            onClick={() => setShowFullDesc(!showFullDesc)}
            className="text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors"
          >
            {showFullDesc ? 'Свернуть описание' : 'Читать полностью'}
          </button>
        )}
      </div>

      {/* Multiplayer & Co-op info */}
      {game.multiplayer && (
        <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/70 flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-sky-950/40 border border-sky-800/40 text-sky-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-200">Сетевой режим / Кооператив</div>
            <div className="text-xs text-zinc-400">
              {game.multiplayer.coop ? 'Поддерживается совместная игра (Co-op)' : 'Мультиплеерный режим'}
              {game.multiplayer.players ? ` (${game.multiplayer.players})` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Tags Cloud */}
      {game.tags && game.tags.length > 0 && (
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
            <Tag className="w-3.5 h-3.5" />
            <span>Теги и особенности:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {game.tags.map((tag, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 rounded-xl bg-zinc-800/70 border border-zinc-700/50 text-zinc-400 text-xs hover:border-zinc-500 transition-colors"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
