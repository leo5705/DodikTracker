import React, { useState, useEffect, useCallback } from 'react';
import {
  ListMusic,
  Plus,
  Search,
  Play,
  Clock,
  Sparkles,
  Loader2,
  Globe,
  ArrowUpDown,
  Music2,
  Upload,
} from 'lucide-react';
import { MusicNav } from '../music/MusicNav.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { PlaylistModal } from '../modals/PlaylistModal.tsx';

interface PublicPlaylistItem {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  cover: string | null;
  customCover: string | null;
  firstTrackCover: string | null;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  createdAt: string;
  updatedAt: string;
  tracksCount: number;
  totalDuration: number;
  owner: {
    id: number;
    username: string;
    avatar: string | null;
  };
}

export const MusicPlaylistsView: React.FC = () => {
  const { navigate } = useRouter();
  const { dbUser, authFetch } = useAuth();
  const { playTrack } = useMusicPlayer();

  const [playlists, setPlaylists] = useState<PublicPlaylistItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [sort, setSort] = useState<'popular' | 'newest' | 'title_asc' | 'tracks_count'>('popular');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);

  const fetchPlaylists = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      sort,
    });
    if (search.trim()) {
      params.append('q', search.trim());
    }

    authFetch(`/api/music/playlists?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { playlists: [], pagination: { total: 0, totalPages: 1 } }))
      .then((data) => {
        setPlaylists(data.playlists || []);
        setTotal(data.pagination?.total || 0);
        setTotalPages(data.pagination?.totalPages || 1);
      })
      .catch((err) => console.error('Error fetching public playlists:', err))
      .finally(() => setLoading(false));
  }, [page, sort, search, authFetch]);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const handleQuickPlay = async (e: React.MouseEvent, pl: PublicPlaylistItem) => {
    e.stopPropagation();
    try {
      const res = await authFetch(`/api/music/playlists/${pl.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.tracks && data.tracks.length > 0) {
          playTrack(
            data.tracks[0],
            data.tracks,
            {
              id: pl.id,
              title: pl.title,
              cover: pl.cover,
              slug: `playlist-${pl.id}`,
              artistName: `Плейлист от ${pl.owner.username}`,
              artistSlug: pl.owner.username,
            }
          );
        }
      }
    } catch (err) {
      console.error('Failed to quick play playlist:', err);
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0 мин';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs} ч ${mins} мин`;
    return `${mins} мин`;
  };

  return (
    <div className="space-y-6 pb-20">
      <MusicNav activeTab="playlists" />

      {/* Header & Controls Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-6 rounded-3xl bg-[#11152A] border border-[#1E2442]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ListMusic className="w-5 h-5 text-purple-400" />
              <span>Публичные плейлисты</span>
            </h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 font-bold border border-purple-500/30">
              {total}
            </span>
          </div>
          <p className="text-xs text-[#94A3B8] mt-1">
            Коллекции музыки, составленные сообществом Dodik Tracker
          </p>
        </div>

        {/* Action: Create playlist & Import */}
        {dbUser && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate('/music/playlists/import')}
              className="px-4 py-2.5 rounded-2xl bg-[#151932] border border-[#1E2442] hover:bg-[#1C2045] text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Upload className="w-4 h-4 text-purple-400" />
              <span>Импорт плейлиста</span>
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Создать плейлист</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0B0E20] p-3 rounded-2xl border border-[#1E2442]">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Поиск по названию или автору..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <ArrowUpDown className="w-4 h-4 text-slate-500 shrink-0 hidden sm:inline" />
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as any);
              setPage(1);
            }}
            className="w-full sm:w-auto px-3 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="popular">По популярности</option>
            <option value="newest">Сначала новые</option>
            <option value="tracks_count">По количеству треков</option>
            <option value="title_asc">По названию (А-Я)</option>
          </select>
        </div>
      </div>

      {/* Playlist Grid */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <span className="text-xs font-semibold">Загрузка плейлистов...</span>
        </div>
      ) : playlists.length === 0 ? (
        <div className="py-20 text-center space-y-3 bg-[#11152A]/50 rounded-3xl border border-[#1E2442]">
          <div className="w-16 h-16 rounded-3xl bg-purple-950/40 border border-purple-500/20 mx-auto flex items-center justify-center text-purple-400">
            <ListMusic className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Плейлисты не найдены</h3>
            <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
              {search.trim()
                ? 'По вашему запросу ничего не нашлось. Попробуйте изменить поисковую фразу.'
                : 'Будьте первым, кто создаст публичный плейлист в Dodik Tracker!'}
            </p>
          </div>
          {dbUser && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-2 mx-auto cursor-pointer shadow-lg shadow-purple-600/30"
            >
              <Plus className="w-4 h-4" />
              <span>Создать плейлист</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => navigate(`/music/playlist/${pl.id}`)}
              className="group relative flex flex-col rounded-3xl bg-[#11152A] border border-[#1E2442] hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-600/10 transition-all duration-300 overflow-hidden cursor-pointer"
            >
              {/* Cover Artwork */}
              <div className="relative aspect-square w-full bg-[#0B0E20] overflow-hidden">
                {pl.cover ? (
                  <img
                    src={pl.cover}
                    alt={pl.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-900/40 via-indigo-950/60 to-slate-950 text-purple-400">
                    <ListMusic className="w-16 h-16 stroke-1 opacity-60" />
                  </div>
                )}

                {/* Quick play overlay on hover */}
                {pl.tracksCount > 0 && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      onClick={(e) => handleQuickPlay(e, pl)}
                      className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-xl shadow-purple-600/40 transform scale-90 group-hover:scale-100 transition-all cursor-pointer"
                      title="Слушать плейлист"
                    >
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </button>
                  </div>
                )}

                <div className="absolute top-3 left-3">
                  <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-bold text-white border border-white/10 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-purple-400" />
                    <span>{pl.tracksCount} {pl.tracksCount === 1 ? 'трек' : pl.tracksCount >= 2 && pl.tracksCount <= 4 ? 'трека' : 'треков'}</span>
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
                <div>
                  <h4 className="font-bold text-sm text-white group-hover:text-purple-300 transition line-clamp-1">
                    {pl.title}
                  </h4>
                  {pl.description && (
                    <p className="text-xs text-[#94A3B8] line-clamp-2 mt-1 leading-relaxed">
                      {pl.description}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-[#1E2442]/60 flex items-center justify-between text-xs text-[#94A3B8]">
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/u/${pl.owner.username}`);
                    }}
                    className="flex items-center gap-1.5 hover:text-white transition cursor-pointer"
                  >
                    <div className="w-5 h-5 rounded-full overflow-hidden bg-slate-800 border border-slate-700">
                      {pl.owner.avatar ? (
                        <img src={pl.owner.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-purple-300 bg-purple-950">
                          {pl.owner.username.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="truncate max-w-[100px] font-medium">{pl.owner.username}</span>
                  </div>

                  <span className="font-mono text-[11px] text-slate-400">
                    {formatDuration(pl.totalDuration)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl bg-[#11152A] hover:bg-[#181E44] disabled:opacity-30 text-xs font-bold text-slate-300 transition cursor-pointer"
          >
            Назад
          </button>
          <span className="text-xs font-mono text-slate-400 px-3">
            {page} из {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-xl bg-[#11152A] hover:bg-[#181E44] disabled:opacity-30 text-xs font-bold text-slate-300 transition cursor-pointer"
          >
            Вперёд
          </button>
        </div>
      )}

      {/* Create Playlist Modal */}
      <PlaylistModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSaved={(created) => {
          navigate(`/music/playlist/${created.id}`);
        }}
      />
    </div>
  );
};
