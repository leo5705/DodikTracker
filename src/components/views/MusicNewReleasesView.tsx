import React, { useState, useEffect } from 'react';
import { Sparkles, Disc, Loader2 } from 'lucide-react';
import { MusicNav } from '../music/MusicNav.tsx';
import { MusicReleaseCard, ReleaseCardData } from '../music/MusicReleaseCard.tsx';

export const MusicNewReleasesView: React.FC = () => {
  const [releases, setReleases] = useState<ReleaseCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/music/releases?status=PUBLISHED&sort=newest&limit=30')
      .then((res) => res.json())
      .then((json) => setReleases(json.releases || []))
      .catch((err) => console.error('Failed to load new releases:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 pb-16">
      <MusicNav activeTab="new" />

      <div className="flex items-center gap-2.5">
        <Sparkles className="w-5 h-5 text-purple-400" />
        <h2 className="text-lg font-bold text-white font-mono">Музыкальные новинки</h2>
      </div>

      {loading ? (
        <div className="py-20 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          <span className="text-xs font-mono font-semibold">Загрузка новинок...</span>
        </div>
      ) : releases.length === 0 ? (
        <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-2">
          <Disc className="w-12 h-12 text-purple-400 mx-auto" />
          <p className="text-base font-bold text-white font-mono">Новинок пока нет</p>
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
