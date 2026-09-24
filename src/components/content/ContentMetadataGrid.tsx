import React from 'react';
import {
  Info,
  Calendar,
  Clock,
  Globe,
  DollarSign,
  Building2,
  Tv,
  BookOpen,
  Film,
  Music,
  Award,
  Layers,
  Sparkles,
} from 'lucide-react';
import { UnifiedContentItem } from '../../types/content.ts';
import { useRouter } from '../../context/RouterContext.tsx';
import { normalizeAgeRating } from '../../utils/ageRating.ts';

interface ContentMetadataGridProps {
  item: UnifiedContentItem;
}

export const ContentMetadataGrid: React.FC<ContentMetadataGridProps> = ({ item }) => {
  const { navigate } = useRouter();

  const handlePersonClick = (name: string) => {
    navigate(`/search?q=${encodeURIComponent(name)}`);
  };

  const rows: Array<{
    label: string;
    icon: any;
    value: React.ReactNode;
  }> = [];

  // 1. Release Date / Year
  if (item.releaseDate) {
    const d = new Date(item.releaseDate);
    const dateFormatted = !isNaN(d.getTime())
      ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      : item.releaseDate;
    rows.push({
      label: 'Дата выхода',
      icon: Calendar,
      value: <span>{dateFormatted}</span>,
    });
  } else if (item.year) {
    rows.push({
      label: 'Год выпуска',
      icon: Calendar,
      value: <span>{item.year}</span>,
    });
  }

  // 2. Duration / Length
  if (item.durationText) {
    rows.push({
      label: 'Длительность',
      icon: Clock,
      value: <span>{item.durationText}</span>,
    });
  }

  // 3. Seasons & Episodes
  if (item.totalEpisodes !== undefined && item.totalEpisodes > 0) {
    rows.push({
      label: 'Количество серий',
      icon: Tv,
      value: (
        <span>
          {item.totalEpisodes} {item.totalSeasons ? `(${item.totalSeasons} сез.)` : 'эп.'}
        </span>
      ),
    });
  }

  // 4. Volumes & Chapters (Manga)
  if (item.totalChapters !== undefined && item.totalChapters > 0) {
    rows.push({
      label: 'Главы и тома',
      icon: BookOpen,
      value: (
        <span>
          {item.totalChapters} глав {item.totalVolumes ? `• ${item.totalVolumes} томов` : ''}
        </span>
      ),
    });
  }

  // 5. Pages & ISBN (Books / Comics)
  if (item.totalPages !== undefined && item.totalPages > 0) {
    rows.push({
      label: 'Количество страниц',
      icon: BookOpen,
      value: <span>{item.totalPages} стр.</span>,
    });
  }

  if (item.isbn) {
    rows.push({
      label: 'ISBN',
      icon: Info,
      value: <span className="font-mono text-zinc-300">{item.isbn}</span>,
    });
  }

  // 6. Countries
  if (item.countries && item.countries.length > 0) {
    rows.push({
      label: 'Страны производства',
      icon: Globe,
      value: <span>{item.countries.join(', ')}</span>,
    });
  }

  // 7. Original Language
  if (item.originalLanguage || item.language) {
    rows.push({
      label: 'Язык оригинала',
      icon: Globe,
      value: <span className="uppercase">{item.originalLanguage || item.language}</span>,
    });
  }

  // 8. Age Rating
  const normRating = normalizeAgeRating(item.ageRating, item.provider);
  rows.push({
    label: 'Возрастной рейтинг',
    icon: Award,
    value: normRating ? (
      <span className="px-2 py-0.5 rounded-lg bg-[#151932] border border-[#8B5CF6]/40 text-[#A78BFA] font-mono font-bold text-xs shadow-xs">
        {normRating.displayText}
      </span>
    ) : (
      <span className="text-[#64748B] italic text-xs">Возрастной рейтинг не указан</span>
    ),
  });

  // 9. Directors / Authors / Creators / Artists
  if (item.directors && item.directors.length > 0) {
    rows.push({
      label: 'Режиссёр' + (item.directors.length > 1 ? 'ы' : ''),
      icon: Film,
      value: (
        <div className="flex flex-wrap gap-1.5">
          {item.directors.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handlePersonClick(p.name)}
              className="text-purple-400 hover:text-purple-300 hover:underline text-left font-medium"
            >
              {p.name}{idx < item.directors!.length - 1 ? ',' : ''}
            </button>
          ))}
        </div>
      ),
    });
  }

  if (item.authors && item.authors.length > 0) {
    rows.push({
      label: 'Автор' + (item.authors.length > 1 ? 'ы' : ''),
      icon: BookOpen,
      value: (
        <div className="flex flex-wrap gap-1.5">
          {item.authors.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handlePersonClick(p.name)}
              className="text-purple-400 hover:text-purple-300 hover:underline text-left font-medium"
            >
              {p.name}{idx < item.authors!.length - 1 ? ',' : ''}
            </button>
          ))}
        </div>
      ),
    });
  }

  if (item.mangaka && item.mangaka.length > 0) {
    rows.push({
      label: 'Мангака / Сценарий',
      icon: Sparkles,
      value: (
        <div className="flex flex-wrap gap-1.5">
          {item.mangaka.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handlePersonClick(p.name)}
              className="text-purple-400 hover:text-purple-300 hover:underline text-left font-medium"
            >
              {p.name}{idx < item.mangaka!.length - 1 ? ',' : ''}
            </button>
          ))}
        </div>
      ),
    });
  }

  if (item.writers && item.writers.length > 0) {
    rows.push({
      label: 'Сценарий',
      icon: Info,
      value: (
        <div className="flex flex-wrap gap-1.5">
          {item.writers.slice(0, 3).map((p, idx) => (
            <button
              key={idx}
              onClick={() => handlePersonClick(p.name)}
              className="text-purple-400 hover:text-purple-300 hover:underline text-left font-medium"
            >
              {p.name}{idx < Math.min(3, item.writers!.length) - 1 ? ',' : ''}
            </button>
          ))}
        </div>
      ),
    });
  }

  if (item.producers && item.producers.length > 0) {
    rows.push({
      label: 'Продюсеры',
      icon: Info,
      value: (
        <div className="flex flex-wrap gap-1.5">
          {item.producers.slice(0, 3).map((p, idx) => (
            <button
              key={idx}
              onClick={() => handlePersonClick(p.name)}
              className="text-purple-400 hover:text-purple-300 hover:underline text-left font-medium"
            >
              {p.name}{idx < Math.min(3, item.producers!.length) - 1 ? ',' : ''}
            </button>
          ))}
        </div>
      ),
    });
  }

  // 10. Studios / Networks / Publishers / Labels
  if (item.studios && item.studios.length > 0) {
    rows.push({
      label: 'Студия' + (item.studios.length > 1 ? 'и' : ''),
      icon: Building2,
      value: (
        <div className="flex flex-wrap gap-1.5">
          {item.studios.map((s, idx) => (
            <button
              key={idx}
              onClick={() => handlePersonClick(s.name)}
              className="text-sky-400 hover:text-sky-300 hover:underline text-left font-medium"
            >
              {s.name}{idx < item.studios!.length - 1 ? ',' : ''}
            </button>
          ))}
        </div>
      ),
    });
  }

  if (item.publishers && item.publishers.length > 0) {
    rows.push({
      label: 'Издатель' + (item.publishers.length > 1 ? 'и' : ''),
      icon: Building2,
      value: (
        <div className="flex flex-wrap gap-1.5">
          {item.publishers.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handlePersonClick(p.name)}
              className="text-sky-400 hover:text-sky-300 hover:underline text-left font-medium"
            >
              {p.name}{idx < item.publishers!.length - 1 ? ',' : ''}
            </button>
          ))}
        </div>
      ),
    });
  }

  // Developers & Platforms for Games
  if (item.developers && item.developers.length > 0) {
    rows.push({
      label: 'Разработчик' + (item.developers.length > 1 ? 'и' : ''),
      icon: Building2,
      value: (
        <div className="flex flex-wrap gap-1.5">
          {item.developers.map((d, idx) => (
            <button
              key={idx}
              onClick={() => handlePersonClick(d.name)}
              className="text-[#A78BFA] hover:text-[#C4B5FD] hover:underline text-left font-medium"
            >
              {d.name}{idx < item.developers!.length - 1 ? ',' : ''}
            </button>
          ))}
        </div>
      ),
    });
  }

  if (item.platforms && item.platforms.length > 0) {
    rows.push({
      label: 'Платформы',
      icon: Layers,
      value: (
        <div className="flex flex-wrap gap-1">
          {item.platforms.map((plat, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded bg-[#151932] border border-[#1E2442] text-[11px] font-mono text-[#CBD5E1]"
            >
              {plat}
            </span>
          ))}
        </div>
      ),
    });
  }

  if (item.requirements) {
    rows.push({
      label: 'Системные требования',
      icon: Info,
      value: (
        <div className="space-y-1.5 text-[11px] leading-relaxed">
          {item.requirements.minimum && (
            <div>
              <span className="font-bold text-[#94A3B8]">Мин: </span>
              <span className="text-[#CBD5E1]">{item.requirements.minimum}</span>
            </div>
          )}
          {item.requirements.recommended && (
            <div>
              <span className="font-bold text-[#94A3B8]">Рек: </span>
              <span className="text-[#CBD5E1]">{item.requirements.recommended}</span>
            </div>
          )}
        </div>
      ),
    });
  }

  if (item.labels && item.labels.length > 0) {
    rows.push({
      label: 'Музыкальный лейбл',
      icon: Music,
      value: <span>{item.labels.map((l) => l.name).join(', ')}</span>,
    });
  }

  // 11. Budget & Box Office
  if (item.budget) {
    const budgetStr = typeof item.budget === 'number'
      ? `$${item.budget.toLocaleString('en-US')}`
      : String(item.budget);
    rows.push({
      label: 'Бюджет',
      icon: DollarSign,
      value: <span className="font-mono text-emerald-400 font-semibold">{budgetStr}</span>,
    });
  }

  if (item.boxOffice) {
    const boxOfficeStr = typeof item.boxOffice === 'number'
      ? `$${item.boxOffice.toLocaleString('en-US')}`
      : String(item.boxOffice);
    rows.push({
      label: 'Кассовые сборы',
      icon: DollarSign,
      value: <span className="font-mono text-emerald-400 font-semibold">{boxOfficeStr}</span>,
    });
  }

  // 12. Anime specific: Source material & Demographics & Season
  if (item.sourceMaterial) {
    rows.push({
      label: 'Первоисточник',
      icon: Layers,
      value: <span>{item.sourceMaterial}</span>,
    });
  }

  if (item.seasonYear) {
    rows.push({
      label: 'Сезон выхода',
      icon: Calendar,
      value: <span>{item.seasonYear}</span>,
    });
  }

  if (item.demographics && item.demographics.length > 0) {
    rows.push({
      label: 'Демография',
      icon: Sparkles,
      value: <span>{item.demographics.join(', ')}</span>,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-[#11152A] border border-[#1E2442] space-y-4">
      <div className="flex items-center gap-2.5 border-b border-[#1E2442] pb-4">
        <div className="p-2 rounded-xl bg-[#151932] border border-[#8B5CF6]/30 text-[#A78BFA]">
          <Info className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-[#F8FAFC]">Информация и детали</h2>
          <p className="text-xs text-[#94A3B8]">Спецификация, производство и выход</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
        {rows.map((row, idx) => {
          const Icon = row.icon;
          return (
            <div
              key={idx}
              className="p-3.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex items-start gap-3"
            >
              <div className="p-2 rounded-xl bg-[#151932] border border-[#1E2442] text-[#A78BFA] shrink-0 mt-0.5">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider font-mono">
                  {row.label}
                </div>
                <div className="text-xs font-semibold text-[#F8FAFC] leading-relaxed">
                  {row.value}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
