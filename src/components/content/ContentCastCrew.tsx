import React, { useState } from 'react';
import { Users, User, ChevronRight, Sparkles } from 'lucide-react';
import { ContentPerson, ContentType } from '../../types/content.ts';
import { useRouter } from '../../context/RouterContext.tsx';

interface ContentCastCrewProps {
  cast?: ContentPerson[];
  crew?: ContentPerson[];
  type?: ContentType;
}

export const ContentCastCrew: React.FC<ContentCastCrewProps> = ({ cast = [], crew = [], type }) => {
  const { navigate } = useRouter();
  const [activeTab, setActiveTab] = useState<'cast' | 'crew'>('cast');

  const hasCast = cast.length > 0;
  const hasCrew = crew.length > 0;

  if (!hasCast && !hasCrew) return null;

  const currentList = activeTab === 'cast' && hasCast ? cast : crew;

  const handlePersonClick = (person: ContentPerson) => {
    navigate(`/search?q=${encodeURIComponent(person.name)}`);
  };

  const isAnime = type === 'ANIME';

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">
              {isAnime ? 'Сэйю и создатели' : 'Актёрский состав и создатели'}
            </h2>
            <p className="text-xs text-zinc-400">
              {hasCast ? `В главных ролях (${cast.length})` : ''}
              {hasCast && hasCrew ? ' • ' : ''}
              {hasCrew ? `Команда (${crew.length})` : ''}
            </p>
          </div>
        </div>

        {/* Tab switch if both cast and crew exist */}
        {hasCast && hasCrew && (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-950 border border-zinc-800">
            <button
              onClick={() => setActiveTab('cast')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'cast'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Актёры ({cast.length})
            </button>
            <button
              onClick={() => setActiveTab('crew')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'crew'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Создатели ({crew.length})
            </button>
          </div>
        )}
      </div>

      {/* Grid of Persons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {currentList.map((person, idx) => (
          <button
            key={person.id || idx}
            onClick={() => handlePersonClick(person)}
            className="group p-2.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-purple-500/50 hover:bg-zinc-950 transition-all flex flex-col text-left"
          >
            {/* Avatar Photo */}
            <div className="aspect-[3/4] w-full rounded-xl overflow-hidden bg-zinc-900 mb-2.5 border border-zinc-800/80 relative">
              {person.image ? (
                <img
                  src={person.image}
                  alt={person.name}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600">
                  <User className="w-8 h-8 mb-1" />
                  <span className="text-[10px]">Фото нет</span>
                </div>
              )}
            </div>

            {/* Names & Role */}
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="text-xs font-bold text-zinc-100 group-hover:text-purple-300 transition-colors line-clamp-1">
                  {person.name}
                </div>
                {person.character ? (
                  <div className="text-[11px] text-purple-400 font-medium line-clamp-1 mt-0.5">
                    {person.character}
                  </div>
                ) : person.role ? (
                  <div className="text-[11px] text-zinc-400 font-medium line-clamp-1 mt-0.5">
                    {person.role}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-2 group-hover:text-zinc-400">
                <span>Работы</span>
                <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
