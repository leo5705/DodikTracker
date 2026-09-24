import React, { useState, useEffect } from 'react';
import { Search, Disc, Users, Music2, Play, Pause, Loader2 } from 'lucide-react';
import { MusicNav } from '../music/MusicNav.tsx';
import { MusicReleaseCard, ReleaseCardData } from '../music/MusicReleaseCard.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';

interface TrackSearchResult {
  id: number;
  releaseId: number;
  title: string;
  slug: string | null;
  audioFile: string;
  duration: number | null;
  trackNumber: number;
  releaseTitle: string;
  releaseCover: string | null;
  releaseSlug: string;
  stageName: string;
}

interface ArtistSearchResult {
  id: number;
  stageName: string;
  slug: string;
  avatar: string | null;
  description: string | null;
}

interface SearchResults {
  releases: ReleaseCardData[];
  artists: ArtistSearchResult[];
  tracks: TrackSearchResult[];
}

export const MusicSearchView: React.FC = () => {
  const { navigate } = useRouter();
  const { currentTrack, isPlaying, togglePlayPause, playTrack } = useMusicPlayer();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/music/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => res.json())
        .then((json) => setResults(json))
        .catch((err) => console.error('Failed to search music:', err))
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handlePlayTrackResult = (t: TrackSearchResult) => {
    const isThisTrackPlaying = currentTrack?.id === t.id;
    if (isThisTrackPlaying) {
      togglePlayPause();
      return;
    }

    const formattedTrack = {
      id: t.id,
      releaseId: t.releaseId,
      releaseTitle: t.releaseTitle,
      releaseCover: t.releaseCover,
      releaseSlug: t.releaseSlug,
      artistName: t.stageName,
      title: t.title,
      slug: t.slug || '',
      trackNumber: t.trackNumber,
      audioFile: t.audioFile,
      duration: t.duration,
    };

    playTrack(formattedTrack, [formattedTrack], {
      id: t.releaseId,
      title: t.releaseTitle,
      cover: t.releaseCover,
      slug: t.releaseSlug,
      artistName: t.stageName,
      artistSlug: '',
    });
  };

  return (
    <div className="space-y-6 pb-16">
      <MusicNav activeTab="search" />

      {/* SEARCH INPUT */}
      <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-3">
        <label className="text-xs font-mono font-bold text-[#64748B] uppercase tracking-wider">
          Поиск по музыке Dodik Tracker
        </label>
        <div className="relative">
          <Search className="w-5 h-5 text-purple-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Введите название трека, альбома или исполнителя..."
            className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500 font-mono"
            autoFocus
          />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          <span className="text-xs font-mono font-semibold">Поиск по музыкальной базе...</span>
        </div>
      ) : results ? (
        <div className="space-y-8">
          {/* TRACKS RESULTS */}
          {results.tracks && results.tracks.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <Music2 className="w-5 h-5 text-purple-400" />
                <span>Найденные треки ({results.tracks.length})</span>
              </h2>

              <div className="space-y-2">
                {results.tracks.map((t) => {
                  const isThisPlaying = currentTrack?.id === t.id && isPlaying;
                  return (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-purple-500/40 transition-all flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <button
                          onClick={() => handlePlayTrackResult(t)}
                          className="w-10 h-10 rounded-xl bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shrink-0 cursor-pointer shadow-md shadow-purple-950/40"
                        >
                          {isThisPlaying ? (
                            <Pause className="w-4 h-4 fill-white" />
                          ) : (
                            <Play className="w-4 h-4 fill-white ml-0.5" />
                          )}
                        </button>

                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-white truncate font-mono">{t.title}</h3>
                          <p className="text-xs text-[#94A3B8] truncate">
                            {t.stageName} · {t.releaseTitle}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => navigate(`/music/release/${t.releaseSlug}`)}
                        className="text-xs font-mono text-purple-400 hover:text-purple-300 shrink-0 cursor-pointer"
                      >
                        Перейти к релизу
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* RELEASES RESULTS */}
          {results.releases && results.releases.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <Disc className="w-5 h-5 text-purple-400" />
                <span>Релизы ({results.releases.length})</span>
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {results.releases.map((rel) => (
                  <MusicReleaseCard key={rel.id} release={rel} />
                ))}
              </div>
            </div>
          )}

          {/* ARTISTS RESULTS */}
          {results.artists && results.artists.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <span>Исполнители ({results.artists.length})</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {results.artists.map((art) => (
                  <div
                    key={art.id}
                    onClick={() => navigate(`/music/artist/${art.slug || art.id}`)}
                    className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-purple-500/40 transition-all flex items-center gap-3.5 cursor-pointer"
                  >
                    {art.avatar ? (
                      <img src={art.avatar} alt={art.stageName} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-purple-900/40 text-purple-300 font-mono font-bold flex items-center justify-center shrink-0">
                        {art.stageName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white font-mono truncate">{art.stageName}</h3>
                      <span className="text-[10px] text-[#64748B] font-mono">Перейти в профиль</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.tracks.length === 0 && results.releases.length === 0 && results.artists.length === 0 && (
            <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-2">
              <Search className="w-10 h-10 text-purple-400 mx-auto" />
              <p className="text-base font-bold text-white font-mono">Ничего не найдено</p>
              <p className="text-xs text-[#94A3B8]">Попробуйте другой поисковый запрос</p>
            </div>
          )}
        </div>
      ) : (
        <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl text-xs text-[#94A3B8] font-mono">
          Введите текст выше для мгновенного поиска по музыке
        </div>
      )}
    </div>
  );
};
