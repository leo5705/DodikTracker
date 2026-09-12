import React, { useState, useEffect } from 'react';
import {
  Compass,
  Play,
  Flame,
  Radio,
  Dice5,
  BarChart3,
  Sparkles,
  ArrowRight,
  Plus,
  Star,
  Film,
  Tv,
  Gamepad2,
  Book,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { AddToLibraryModal } from '../modals/AddToLibraryModal.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { formatMediaTypePath } from '../../utils/formatters.ts';

interface HomeViewProps {
  onNavigate: (tab: any) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const { dbUser, counts, authFetch } = useAuth();
  const { navigate } = useRouter();
  const [inProgress, setInProgress] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [recentFeed, setRecentFeed] = useState<any[]>([]);
  const [modalItem, setModalItem] = useState<any | null>(null);

  const handleTrendingClick = async (item: any) => {
    if (item.mediaId || (typeof item.id === 'number' && !item.provider)) {
      const id = item.mediaId || item.id;
      navigate(`/media/${formatMediaTypePath(item.type)}/${id}`);
      return;
    }
    try {
      const res = await fetch('/api/media/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaPayload: item }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.media?.id) {
          navigate(`/media/${formatMediaTypePath(data.media.type)}/${data.media.id}`);
        }
      }
    } catch (err) {
      console.error('Failed to resolve trending media:', err);
    }
  };

  useEffect(() => {
    // 1. Fetch in-progress media if logged in
    if (dbUser) {
      authFetch('/api/library?status=WATCHING')
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setInProgress(data.slice(0, 6)))
        .catch(() => {});
    }

    // 2. Fetch trending
    fetch('/api/media/trending?type=MOVIE')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTrending(data.slice(0, 6)))
      .catch(() => {});

    // 3. Fetch recent activities
    fetch('/api/feed')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRecentFeed(data.slice(0, 4)))
      .catch(() => {});
  }, [dbUser]);

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-950/70 via-zinc-900 to-zinc-950 border border-purple-900/40 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Социальный медиатрекер нового поколения
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
            {dbUser ? `С возвращением, ${dbUser.username}!` : 'Добро пожаловать в Dodik Tracker!'}
          </h1>

          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            Отслеживайте кино, сериалы, игры, аниме и книги. Делитесь впечатлениями с друзьями,
            создавайте Tier Lists и используйте умную рулетку выбора контента.
          </p>

          {/* Quick Metrics Bar */}
          {counts && (
            <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-zinc-400 block text-[11px]">Фильмы & ТВ</span>
                <span className="text-base font-bold text-white font-mono">
                  {counts.movies + counts.tv}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-zinc-400 block text-[11px]">Аниме</span>
                <span className="text-base font-bold text-white font-mono">{counts.anime}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-zinc-400 block text-[11px]">Игры</span>
                <span className="text-base font-bold text-white font-mono">{counts.games}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-zinc-400 block text-[11px]">Завершено</span>
                <span className="text-base font-bold text-emerald-400 font-mono">
                  {counts.completed}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2.5 pt-2">
            <button
              onClick={() => onNavigate('search')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/40 transition-all"
            >
              Искать медиа
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigate('roulette')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-all"
            >
              <Dice5 className="w-3.5 h-3.5 text-purple-400" />
              Рулетка выбора
            </button>
          </div>
        </div>
      </div>

      {/* In-Progress Section */}
      {dbUser && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-100 font-mono flex items-center gap-2">
              <Play className="w-4 h-4 text-purple-400 fill-purple-400" />
              СЕЙЧАС СМОТРЮ / ИГРАЮ
            </h2>
            <button
              onClick={() => onNavigate('library')}
              className="text-xs text-purple-400 hover:text-purple-300 font-medium"
            >
              Вся библиотека →
            </button>
          </div>

          {inProgress.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {inProgress.map((item) => (
                <div
                  key={item.userMediaId}
                  className="rounded-xl bg-zinc-900 border border-zinc-800 p-2 space-y-2 hover:border-purple-500/40 transition-all"
                >
                  <div
                    onClick={() => navigate(`/media/${formatMediaTypePath(item.type)}/${item.mediaId}`)}
                    className="aspect-[2/3] rounded-lg bg-zinc-950 overflow-hidden relative cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    {item.posterUrl ? (
                      <img
                        src={item.posterUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400">
                        Нет постера
                      </div>
                    )}
                  </div>
                  <div
                    onClick={() => navigate(`/media/${formatMediaTypePath(item.type)}/${item.mediaId}`)}
                    className="cursor-pointer"
                  >
                    <p className="text-xs font-bold text-zinc-100 line-clamp-1 hover:text-purple-400 transition-colors">{item.title}</p>
                    <p className="text-[10px] text-zinc-400">Серия {item.progress || 0}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center space-y-2">
              <p className="text-xs text-zinc-400">
                У вас пока нет активных тайтлов в статусе «В процессе».
              </p>
              <button
                onClick={() => onNavigate('search')}
                className="text-xs font-semibold text-purple-400 hover:text-purple-300"
              >
                Найти что посмотреть или сыграть
              </button>
            </div>
          )}
        </div>
      )}

      {/* Trending Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-100 font-mono flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
            ТРЕНДЫ & ПОПУЛЯРНОЕ
          </h2>
          <button
            onClick={() => onNavigate('search')}
            className="text-xs text-purple-400 hover:text-purple-300 font-medium"
          >
            Смотреть каталог →
          </button>
        </div>

        {trending.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {trending.map((item, idx) => (
              <div
                key={idx}
                className="group rounded-xl bg-zinc-900 border border-zinc-800 hover:border-purple-500/50 p-2 flex flex-col justify-between space-y-2 transition-all"
              >
                <div
                  onClick={() => handleTrendingClick(item)}
                  className="aspect-[2/3] rounded-lg bg-zinc-950 overflow-hidden relative cursor-pointer hover:opacity-90 transition-opacity"
                >
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">
                      Нет постера
                    </div>
                  )}
                  {item.rating && (
                    <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-amber-400 text-[10px] font-bold flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-400" />
                      {item.rating}
                    </div>
                  )}
                </div>

                <div
                  onClick={() => handleTrendingClick(item)}
                  className="space-y-1 cursor-pointer"
                >
                  <p className="text-xs font-bold text-zinc-100 line-clamp-1 hover:text-purple-400 transition-colors">{item.title}</p>
                  <p className="text-[10px] text-zinc-400">{item.year || ''}</p>
                </div>

                <button
                  onClick={() => setModalItem(item)}
                  className="w-full py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus className="w-3 h-3" /> В список
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800 text-center text-xs text-zinc-400">
            Подключение к API каталога...
          </div>
        )}
      </div>

      {/* Recent Activity Snapshot */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-100 font-mono flex items-center gap-2">
            <Radio className="w-4 h-4 text-purple-400" />
            СОЦИАЛЬНАЯ ЛЕНТА
          </h2>
          <button
            onClick={() => onNavigate('feed')}
            className="text-xs text-purple-400 hover:text-purple-300 font-medium"
          >
            Вся лента →
          </button>
        </div>

        {recentFeed.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentFeed.map((act) => (
              <div
                key={act.id}
                className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-3"
              >
                {act.mediaPoster ? (
                  <img
                    src={act.mediaPoster}
                    alt={act.mediaTitle || 'Media'}
                    referrerPolicy="no-referrer"
                    className="w-10 h-14 object-cover rounded-lg shrink-0"
                  />
                ) : (
                  <div className="w-10 h-14 bg-zinc-800 rounded-lg flex items-center justify-center text-xs text-zinc-400 shrink-0">
                    <Film className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-200">
                    <strong
                      onClick={() => navigate(`/u/${act.username}`)}
                      className="text-purple-300 hover:text-purple-200 cursor-pointer"
                    >
                      @{act.username}
                    </strong>{' '}
                    {act.type === 'MEDIA_COMPLETED' ? 'завершил(а)' : 'добавил(а) в библиотеку'}
                  </p>
                  <p
                    onClick={() => act.mediaId && navigate(`/media/${formatMediaTypePath(act.mediaType || 'MOVIE')}/${act.mediaId}`)}
                    className="text-xs font-bold text-zinc-100 truncate mt-0.5 hover:text-purple-400 cursor-pointer transition-colors"
                  >
                    {act.mediaTitle || 'Медиа'}
                  </p>
                  <span className="text-[10px] text-zinc-400">
                    {new Date(act.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center text-xs text-zinc-400">
            В социальной ленте пока нет записей. Добавьте свой первый фильм или пригласите друзей!
          </div>
        )}
      </div>

      {modalItem && (
        <AddToLibraryModal mediaItem={modalItem} onClose={() => setModalItem(null)} />
      )}
    </div>
  );
};
