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
  if (item.ageRating) {
    rows.push({
      label: 'Возрастной рейтинг',
      icon: Award,
      value: <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono font-bold text-xs">{item.ageRating}</span>,
    });
  }

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
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
          <Info className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Информация и детали</h2>
          <p className="text-xs text-zinc-400">Спецификация, производство и выход</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
        {rows.map((row, idx) => {
          const Icon = row.icon;
          return (
            <div
              key={idx}
              className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-start gap-3"
            >
              <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 shrink-0 mt-0.5">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  {row.label}
                </div>
                <div className="text-xs font-medium text-zinc-200 leading-relaxed">
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
