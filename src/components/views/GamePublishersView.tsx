import React, { useState, useEffect } from 'react';
import { Building2, Search, Loader2, ChevronRight } from 'lucide-react';
import { UnifiedPublisher } from '../../types/unifiedGame.ts';
import { GameBreadcrumbs } from '../game/GameBreadcrumbs.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

export const GamePublishersView: React.FC = () => {
  const { navigate } = useRouter();
  const [publishers, setPublishers] = useState<UnifiedPublisher[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');

  const fetchPublishers = async (targetPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '24',
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/games/publishers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (append) {
          setPublishers((prev) => [...prev, ...(data.results || [])]);
        } else {
          setPublishers(data.results || []);
        }
        setHasMore(data.hasMore);
        setPage(targetPage);
      }
    } catch (err) {
      console.error('Error loading publishers:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchPublishers(1, false);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPublishers(1, false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <GameBreadcrumbs items={[{ label: 'Издатели' }]} />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-100 flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-sky-400" />
            <span>Издатели игр</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Каталог официальных игровых издательств и дистрибьюторов
          </p>
        </div>

        <form onSubmit={handleSearch} className="relative w-full md:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск издателя..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
          />
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
        </form>
      </div>

      {loading && publishers.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          <span className="text-sm">Загрузка издателей...</span>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {publishers.map((pub) => (
              <button
                key={pub.id}
                onClick={() => navigate(`/games/publishers/${encodeURIComponent(pub.slug || String(pub.id))}`)}
                className="group p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-sky-500/50 hover:bg-zinc-900 transition-all flex items-center justify-between text-left shadow-lg"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-sky-950/50 border border-sky-800/40 flex items-center justify-center text-sky-300 font-bold text-sm shrink-0 overflow-hidden">
                    {pub.image ? (
                      <img src={pub.image} alt={pub.name} className="w-full h-full object-cover" />
                    ) : (
                      pub.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-zinc-100 group-hover:text-sky-300 transition-colors truncate">
                      {pub.name}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      {pub.gamesCount ? `${pub.gamesCount} игр` : 'Смотреть проекты'}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-sky-400 transition-all shrink-0" />
              </button>
            ))}
          </div>

          {hasMore && (
            <div className="pt-4 flex justify-center">
              <button
                onClick={() => fetchPublishers(page + 1, true)}
                disabled={loadingMore}
                className="px-6 py-2.5 rounded-2xl bg-zinc-800 hover:bg-sky-600 text-white font-semibold text-xs transition-all flex items-center gap-2"
              >
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Загрузить ещё</span>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
