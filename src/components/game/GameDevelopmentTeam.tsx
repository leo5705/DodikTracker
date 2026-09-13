import React from 'react';
import { UserCheck } from 'lucide-react';
import { UnifiedCreator } from '../../types/unifiedGame.ts';

interface GameDevelopmentTeamProps {
  creators: UnifiedCreator[];
}

export const GameDevelopmentTeam: React.FC<GameDevelopmentTeamProps> = ({ creators }) => {
  if (creators.length === 0) return null;

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-5">
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
          <UserCheck className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Команда создателей</h2>
          <p className="text-xs text-zinc-400">Ключевые авторы, режиссёры и дизайнеры игры</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
        {creators.map((creator) => (
          <div
            key={creator.id}
            className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700/60 overflow-hidden shrink-0 flex items-center justify-center text-zinc-400 font-bold text-xs">
              {creator.image ? (
                <img src={creator.image} alt={creator.name} className="w-full h-full object-cover" />
              ) : (
                creator.name.charAt(0)
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-zinc-200 truncate">{creator.name}</div>
              <div className="text-[11px] text-purple-400 truncate font-medium">{creator.role}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
