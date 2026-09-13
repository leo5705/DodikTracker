import React from 'react';
import { ChevronRight, Gamepad2, Home } from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';

interface GameBreadcrumbsProps {
  items: Array<{ label: string; path?: string }>;
}

export const GameBreadcrumbs: React.FC<GameBreadcrumbsProps> = ({ items }) => {
  const { navigate } = useRouter();

  return (
    <nav className="flex items-center space-x-1.5 text-xs text-zinc-400 mb-4 overflow-x-auto py-1 scrollbar-none">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 hover:text-zinc-200 transition-colors shrink-0"
      >
        <Home className="w-3.5 h-3.5" />
        <span>Главная</span>
      </button>

      <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />

      <button
        onClick={() => navigate('/games/catalog')}
        className="flex items-center gap-1 hover:text-purple-400 transition-colors shrink-0"
      >
        <Gamepad2 className="w-3.5 h-3.5" />
        <span>Игры</span>
      </button>

      {items.map((item, index) => (
        <React.Fragment key={index}>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
          {item.path ? (
            <button
              onClick={() => navigate(item.path!)}
              className="hover:text-purple-400 transition-colors truncate max-w-[200px]"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-zinc-200 font-medium truncate max-w-[200px]">
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};
