import React from 'react';
import {
  Compass,
  Disc,
  Sparkles,
  Users,
  Radio,
  Search,
  Library,
  SlidersHorizontal,
  Music2,
  ListMusic,
} from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

export interface MusicNavProps {
  activeTab?: string;
}

export const MusicNav: React.FC<MusicNavProps> = ({ activeTab }) => {
  const { navigate, route } = useRouter();
  const { dbUser } = useAuth();

  const currentRoute = route.name;

  const isMusician = ['musician', 'SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(dbUser?.role || '');

  const items = [
    { id: 'home', label: 'Обзор', icon: Compass, path: '/music', routeName: 'music-home' },
    { id: 'releases', label: 'Все релизы', icon: Disc, path: '/music/releases', routeName: 'music-releases' },
    { id: 'new', label: 'Новинки', icon: Sparkles, path: '/music/new', routeName: 'music-new' },
    { id: 'artists', label: 'Исполнители', icon: Users, path: '/music/artists', routeName: 'music-artists' },
    { id: 'genres', label: 'Жанры', icon: Radio, path: '/music/genres', routeName: 'music-genres' },
    { id: 'search', label: 'Поиск', icon: Search, path: '/music/search', routeName: 'music-search' },
    { id: 'library', label: 'Медиатека', icon: Library, path: '/music/library', routeName: 'music-library' },
    {
      id: 'studio',
      label: isMusician ? 'Студия' : 'Стать музыкантом',
      icon: SlidersHorizontal,
      path: '/music/studio',
      routeName: 'music-studio',
      highlight: true,
    },
  ];

  const isTabActive = (item: (typeof items)[0]) => {
    if (activeTab) return activeTab === item.id;
    return currentRoute === item.routeName;
  };

  return (
    <div className="space-y-4 mb-6">
      {/* Portal Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#0F0A28] via-[#120D32] to-[#0B0D20] border border-[#231A52] relative overflow-hidden shadow-2xl">
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-600/30 border border-purple-400/30 shrink-0">
              <Music2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight leading-none">
                  МУЗЫКА
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 font-bold border border-purple-500/30">
                  DODIK TRACKER
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] font-medium leading-none mt-1">
                Авторская музыкальная экосистема с 100-балльными рецензиями
              </p>
            </div>
          </div>
        </div>

        {/* Quick action: Creative studio button */}
        <div className="relative z-10 flex items-center gap-2.5 self-start sm:self-center shrink-0">
          <button
            onClick={() => navigate('/music/studio')}
            className={`px-4 py-2.5 rounded-2xl font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg ${
              isMusician
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30'
                : 'bg-[#18123A] hover:bg-[#20184E] text-purple-300 border border-purple-500/30'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-purple-300" />
            <span>{isMusician ? 'Творческая студия' : 'Подать заявку музыканта'}</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] overflow-x-auto custom-scrollbar">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isTabActive(item);

          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 select-none cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-bold'
                  : item.highlight
                  ? 'bg-[#15122E] text-purple-300 hover:bg-[#1C183E] hover:text-white border border-purple-500/20'
                  : 'text-[#94A3B8] hover:text-white hover:bg-[#11152A]'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-[#8B5CF6]'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
