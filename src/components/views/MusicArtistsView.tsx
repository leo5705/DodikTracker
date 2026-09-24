import React, { useState, useEffect } from 'react';
import { Users, Search, Loader2, Sparkles, ExternalLink, Disc } from 'lucide-react';
import { MusicNav } from '../music/MusicNav.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

interface ArtistItem {
  id: number;
  stageName: string;
  slug: string;
  avatar: string | null;
  description: string | null;
  releasesCount?: number;
  tracksCount?: number;
}

export const MusicArtistsView: React.FC = () => {
  const { navigate } = useRouter();
  const [artists, setArtists] = useState<ArtistItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/music/artists')
      .then((res) => res.json())
      .then((json) => setArtists(json.artists || []))
      .catch((err) => console.error('Failed to load artists:', err))
      .finally(() => setLoading(false));
  }, []);

  const filteredArtists = artists.filter((a) =>
    a.stageName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-16">
      <MusicNav activeTab="artists" />

      {/* SEARCH BAR */}
      <div className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск исполнителя по имени..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#11152A] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500 font-mono"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          <span className="text-xs font-mono font-semibold">Загрузка музыкантов...</span>
        </div>
      ) : filteredArtists.length === 0 ? (
        <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-2">
          <Users className="w-12 h-12 text-purple-400 mx-auto" />
          <p className="text-base font-bold text-white font-mono">Исполнители не найдены</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredArtists.map((artist) => (
            <div
              key={artist.id}
              onClick={() => navigate(`/music/artist/${artist.slug || artist.id}`)}
              className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] hover:border-purple-500/40 transition-all flex items-start gap-4 cursor-pointer group"
            >
              {artist.avatar ? (
                <img
                  src={artist.avatar}
                  alt={artist.stageName}
                  className="w-16 h-16 rounded-2xl object-cover border border-[#1E2442] shrink-0 group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white font-mono font-black text-xl flex items-center justify-center shrink-0 border border-[#1E2442] group-hover:scale-105 transition-transform">
                  {artist.stageName.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white group-hover:text-purple-300 transition-colors truncate font-mono">
                    {artist.stageName}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center gap-1 shrink-0">
                    <Sparkles className="w-3 h-3" />
                    <span>Исполнитель</span>
                  </span>
                </div>

                {artist.description && (
                  <p className="text-xs text-[#94A3B8] line-clamp-2 leading-relaxed">
                    {artist.description}
                  </p>
                )}

                <div className="pt-2 text-[11px] font-mono text-[#64748B] flex items-center gap-2">
                  <span>dodik.me/artist/{artist.slug || artist.id}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
