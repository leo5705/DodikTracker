import React from 'react';
import { GitFork, ChevronRight, Calendar, Sparkles } from 'lucide-react';
import { ContentRelation } from '../../types/content.ts';
import { useRouter } from '../../context/RouterContext.tsx';
import { formatMediaTypePath } from '../common/MediaCard.tsx';

interface ContentMangaRelationsProps {
  relations: ContentRelation[];
}

const getRelationBadge = (rel: ContentRelation) => {
  const typeLower = (rel.relationType || '').toLowerCase();
  const label = rel.relationLabel;

  if (label) return label;
  if (typeLower.includes('adaptation')) return 'Адаптация';
  if (typeLower.includes('prequel')) return 'Приквел';
  if (typeLower.includes('sequel')) return 'Сиквел';
  if (typeLower.includes('side_story') || typeLower.includes('spinoff')) return 'Спин-офф';
  if (typeLower.includes('parent')) return 'Основная история';
  if (typeLower.includes('character')) return 'Персонаж';
  return 'Связанное произведение';
};

export const ContentMangaRelations: React.FC<ContentMangaRelationsProps> = ({ relations }) => {
  const { navigate } = useRouter();

  if (!relations || relations.length === 0) return null;

  const handleClick = (rel: ContentRelation) => {
    const typePath = formatMediaTypePath(rel.type);
    navigate(`/media/${typePath}/${rel.mediaId || rel.id}`);
  };

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
          <GitFork className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Франшиза и связанные произведения</h2>
          <p className="text-xs text-zinc-400">Адаптации, сиквелы, приквелы и спин-оффы ({relations.length})</p>
        </div>
      </div>

      {/* Relations Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
        {relations.map((rel, idx) => (
          <button
            key={rel.id || idx}
            onClick={() => handleClick(rel)}
            className="group p-2.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-purple-500/50 hover:bg-zinc-950 transition-all flex flex-col text-left"
          >
            {/* Poster */}
            <div className="aspect-[2/3] w-full rounded-xl overflow-hidden bg-zinc-900 mb-2.5 border border-zinc-800/80 relative">
              {rel.posterUrl ? (
                <img
                  src={rel.posterUrl}
                  alt={rel.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                  Нет постера
                </div>
              )}

              {/* Relation badge on poster */}
              <div className="absolute top-1.5 left-1.5 right-1.5">
                <span className="block px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-zinc-700 text-[10px] font-bold text-purple-300 truncate text-center">
                  {getRelationBadge(rel)}
                </span>
              </div>
            </div>

            {/* Title & Year */}
            <div className="flex-1 flex flex-col justify-between">
              <div className="text-xs font-bold text-zinc-100 group-hover:text-purple-300 transition-colors line-clamp-2">
                {rel.title}
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2">
                {rel.year && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-zinc-600" />
                    <span>{rel.year}</span>
                  </span>
                )}
                <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all ml-auto" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
