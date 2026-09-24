import React, { useState, useEffect } from 'react';
import { Radio, Disc, Loader2 } from 'lucide-react';
import { MusicNav } from '../music/MusicNav.tsx';
import { MusicReleaseCard, ReleaseCardData } from '../music/MusicReleaseCard.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

interface Genre {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

export const MusicGenresView: React.FC = () => {
  const { route } = useRouter();

  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null);
  const [releases, setReleases] = useState<ReleaseCardData[]>([]);
  const [loadingGenres, setLoadingGenres] = useState(true);
  const [loadingReleases, setLoadingReleases] = useState(false);

  useEffect(() => {
    fetch('/api/music/genres')
      .then((res) => res.json())
      .then((json) => {
        const list: Genre[] = json.genres || [];
        setGenres(list);

        const initialGenreId = route.params.genreId ? Number(route.params.genreId) : null;
        if (initialGenreId) {
          const match = list.find((g) => g.id === initialGenreId);
          if (match) setSelectedGenre(match);
        } else if (list.length > 0) {
          setSelectedGenre(list[0]);
        }
      })
      .catch((err) => console.error('Failed to load genres:', err))
      .finally(() => setLoadingGenres(false));
  }, []);

  useEffect(() => {
    if (!selectedGenre) return;

    setLoadingReleases(true);
    fetch(`/api/music/releases?status=PUBLISHED&genreId=${selectedGenre.id}`)
      .then((res) => res.json())
      .then((json) => setReleases(json.releases || []))
      .catch((err) => console.error('Failed to load genre releases:', err))
      .finally(() => setLoadingReleases(false));
  }, [selectedGenre]);

  if (loadingGenres) {
    return (
      <div className="py-20 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        <span className="text-xs font-mono font-semibold">Загрузка жанров...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <MusicNav activeTab="genres" />

      {/* GENRES PILLS */}
      <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-[#8B5CF6]" />
          <h2 className="text-base font-bold text-white font-mono">Жанры музыки</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {genres.map((g) => {
            const isSelected = selectedGenre?.id === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setSelectedGenre(g)}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'bg-[#11152A] border border-[#1E2442] text-[#CBD5E1] hover:text-white hover:bg-[#1C2240]'
                }`}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* SELECTED GENRE RELEASES */}
      {selectedGenre && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white font-mono flex items-center gap-2">
              <span>Жанр: «{selectedGenre.name}»</span>
            </h3>
          </div>

          {loadingReleases ? (
            <div className="py-16 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span className="text-xs font-mono">Загрузка релизов жанра...</span>
            </div>
          ) : releases.length === 0 ? (
            <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-2">
              <Disc className="w-10 h-10 text-purple-400 mx-auto" />
              <p className="text-sm font-semibold text-white">В жанре «{selectedGenre.name}» пока нет релизов</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {releases.map((rel) => (
                <MusicReleaseCard key={rel.id} release={rel} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
