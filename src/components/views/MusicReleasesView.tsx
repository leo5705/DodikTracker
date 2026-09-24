import React, { useState, useEffect, useCallback } from 'react';
import { Disc, Search, Filter, ArrowUpDown, Loader2 } from 'lucide-react';
import { MusicNav } from '../music/MusicNav.tsx';
import { MusicReleaseCard, ReleaseCardData } from '../music/MusicReleaseCard.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

export const MusicReleasesView: React.FC = () => {
  const { route } = useRouter();

  const [releases, setReleases] = useState<ReleaseCardData[]>([]);
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>('ALL');
  const [genreId, setGenreId] = useState<string>(route.params.genreId || '');
  const [sort, setSort] = useState<string>('newest');

  // Load genres for filter
  useEffect(() => {
    fetch('/api/music/genres')
      .then((res) => res.json())
      .then((json) => setGenres(json.genres || []))
      .catch((err) => console.error('Failed to load genres:', err));
  }, []);

  const fetchReleases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('status', 'PUBLISHED');
      params.set('limit', '40');
      if (search.trim()) params.set('search', search.trim());
      if (type !== 'ALL') params.set('type', type);
      if (genreId) params.set('genreId', genreId);
      if (sort) params.set('sort', sort);

      const res = await fetch(`/api/music/releases?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReleases(data.releases || []);
      }
    } catch (err) {
      console.error('Error fetching music releases:', err);
    } finally {
      setLoading(false);
    }
  }, [search, type, genreId, sort]);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  return (
    <div className="space-y-6 pb-16">
      <MusicNav activeTab="releases" />

      {/* FILTER BAR */}
      <div className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию релиза..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#11152A] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1 p-1 bg-[#11152A] border border-[#1E2442] rounded-2xl shrink-0 w-full sm:w-auto overflow-x-auto">
            {[
              { id: 'ALL', label: 'Все типы' },
              { id: 'ALBUM', label: 'Альбомы' },
              { id: 'EP', label: 'EP' },
              { id: 'SINGLE', label: 'Синглы' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer whitespace-nowrap ${
                  type === t.id
                    ? 'bg-purple-600 text-white font-bold'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#1E2442]">
          {/* Genre Dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-purple-400" />
            <select
              value={genreId}
              onChange={(e) => setGenreId(e.target.value)}
              className="p-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono cursor-pointer"
            >
              <option value="">Все жанры</option>
              {genres.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-3.5 h-3.5 text-purple-400" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="p-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono cursor-pointer"
            >
              <option value="newest">Сначала новые</option>
              <option value="highest">Сначала с высокой оценкой</option>
              <option value="popular">Сначала популярные (много отзывов)</option>
              <option value="oldest">Сначала старые</option>
            </select>
          </div>
        </div>
      </div>

      {/* RELEASES GRID */}
      {loading ? (
        <div className="py-20 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          <span className="text-xs font-mono font-semibold">Загрузка каталога релизов...</span>
        </div>
      ) : releases.length === 0 ? (
        <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-3">
          <Disc className="w-12 h-12 text-purple-400 mx-auto" />
          <h3 className="text-base font-bold text-white font-mono">Релизы не найдены</h3>
          <p className="text-xs text-[#94A3B8]">
            Попробуйте изменить параметры поиска или сбросить фильтры
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {releases.map((rel) => (
            <MusicReleaseCard key={rel.id} release={rel} />
          ))}
        </div>
      )}
    </div>
  );
};
