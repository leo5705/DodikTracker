import React from 'react';
import { Home, ChevronRight, Film, Tv, Sparkles, BookOpen, Gamepad2, Book, Flame, Music } from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';
import { ContentType } from '../../types/content.ts';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface ContentBreadcrumbsProps {
  type: ContentType;
  items?: BreadcrumbItem[];
}

export const getCategoryMeta = (type: ContentType) => {
  switch (type) {
    case 'MOVIE':
      return { label: 'Фильмы', icon: Film, path: '/search?type=MOVIE', color: 'text-purple-400' };
    case 'TV':
      return { label: 'Сериалы', icon: Tv, path: '/search?type=TV', color: 'text-indigo-400' };
    case 'ANIME':
      return { label: 'Аниме', icon: Sparkles, path: '/search?type=ANIME', color: 'text-fuchsia-400' };
    case 'MANGA':
      return { label: 'Манга', icon: BookOpen, path: '/search?type=MANGA', color: 'text-pink-400' };
    case 'GAME':
      return { label: 'Игры', icon: Gamepad2, path: '/games/catalog', color: 'text-emerald-400' };
    case 'BOOK':
      return { label: 'Книги', icon: Book, path: '/search?type=BOOK', color: 'text-amber-400' };
    case 'COMIC':
      return { label: 'Комиксы', icon: Flame, path: '/search?type=COMIC', color: 'text-orange-400' };
    case 'MUSIC':
      return { label: 'Музыка', icon: Music, path: '/search?type=MUSIC', color: 'text-cyan-400' };
    default:
      return { label: 'Каталог', icon: Film, path: '/search', color: 'text-purple-400' };
  }
};

export const ContentBreadcrumbs: React.FC<ContentBreadcrumbsProps> = ({ type, items = [] }) => {
  const { navigate } = useRouter();
  const category = getCategoryMeta(type);
  const CategoryIcon = category.icon;

  return (
    <nav className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 overflow-x-auto py-1 scrollbar-none">
      {/* Home link */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 hover:text-purple-400 transition-colors shrink-0 p-1 rounded-lg hover:bg-zinc-800/50"
        title="Главная"
      >
        <Home className="w-3.5 h-3.5 text-zinc-500" />
      </button>

      <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />

      {/* Category Link */}
      <button
        onClick={() => navigate(category.path)}
        className="flex items-center gap-1.5 hover:text-purple-300 transition-colors shrink-0 px-2 py-0.5 rounded-lg hover:bg-zinc-800/50"
      >
        <CategoryIcon className={`w-3.5 h-3.5 ${category.color}`} />
        <span>{category.label}</span>
      </button>

      {/* Custom Sub Items */}
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={idx}>
            <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
            {item.path && !isLast ? (
              <button
                onClick={() => navigate(item.path!)}
                className="hover:text-purple-300 transition-colors truncate max-w-[200px] shrink-0 px-2 py-0.5 rounded-lg hover:bg-zinc-800/50"
              >
                {item.label}
              </button>
            ) : (
              <span className={`truncate max-w-[240px] shrink-0 ${isLast ? 'text-zinc-200 font-bold' : ''}`}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
