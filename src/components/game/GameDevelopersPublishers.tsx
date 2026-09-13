import React from 'react';
import { Code2, Building2 } from 'lucide-react';
import { UnifiedDeveloper, UnifiedPublisher } from '../../types/unifiedGame.ts';

interface GameDevelopersPublishersProps {
  developers: UnifiedDeveloper[];
  publishers: UnifiedPublisher[];
}

export const GameDevelopersPublishers: React.FC<GameDevelopersPublishersProps> = ({
  developers,
  publishers,
}) => {
  if (developers.length === 0 && publishers.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Developers Section */}
      {developers.length > 0 && (
        <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 text-zinc-300 font-bold text-sm border-b border-zinc-800/80 pb-3">
            <Code2 className="w-4 h-4 text-purple-400" />
            <span>Разработчик{developers.length > 1 ? 'и' : ''}</span>
          </div>

          <div className="space-y-2.5">
            {developers.map((dev) => (
              <div
                key={dev.id}
                className="w-full p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-purple-950/50 border border-purple-800/40 flex items-center justify-center text-purple-300 font-bold text-sm shrink-0 overflow-hidden">
                    {dev.image ? (
                      <img src={dev.image} alt={dev.name} className="w-full h-full object-cover" />
                    ) : (
                      dev.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-zinc-100 truncate">
                      {dev.name}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Студия разработки
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Publishers Section */}
      {publishers.length > 0 && (
        <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 text-zinc-300 font-bold text-sm border-b border-zinc-800/80 pb-3">
            <Building2 className="w-4 h-4 text-sky-400" />
            <span>Издател{publishers.length > 1 ? 'и' : 'ь'}</span>
          </div>

          <div className="space-y-2.5">
            {publishers.map((pub) => (
              <div
                key={pub.id}
                className="w-full p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-sky-950/50 border border-sky-800/40 flex items-center justify-center text-sky-300 font-bold text-sm shrink-0 overflow-hidden">
                    {pub.image ? (
                      <img src={pub.image} alt={pub.name} className="w-full h-full object-cover" />
                    ) : (
                      pub.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-zinc-100 truncate">
                      {pub.name}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Издательская компания
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
