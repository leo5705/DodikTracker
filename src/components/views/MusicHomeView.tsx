import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Disc,
  Star,
  Users,
  Radio,
  ChevronRight,
  Music2,
  Sparkles,
  Loader2,
  ListMusic,
  TrendingUp,
} from 'lucide-react';
import { MusicNav } from '../music/MusicNav.tsx';
import { MusicReleaseCard, ReleaseCardData } from '../music/MusicReleaseCard.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';

interface HomeData {
  stats: {
    totalReleases: number;
    totalTracks: number;
    totalArtists: number;
    totalReviews: number;
  };
  heroRelease: ReleaseCardData | null;
  latestReleases: ReleaseCardData[];
  popularReleases: ReleaseCardData[];
  popularArtists: {
    id: number;
    stageName: string;
    slug: string;
    avatar: string | null;
    description: string | null;
    releasesCount: number;
    tracksCount: number;
  }[];
  genres: { id: number; name: string; slug: string }[];
}

export const MusicHomeView: React.FC = () => {
  const { navigate } = useRouter();
  const { currentTrack, isPlaying, togglePlayPause, playTrack } = useMusicPlayer();

  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingHero, setLoadingHero] = useState(false);

  useEffect(() => {
    fetch('/api/music/home')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
      })
      .catch((err) => console.error('Failed to load music home:', err))
      .finally(() => setLoading(false));
  }, []);

  const handlePlayHero = async (hero: ReleaseCardData) => {
    const isHeroPlaying = currentTrack?.releaseId === hero.id;
    if (isHeroPlaying) {
      togglePlayPause();
      return;
    }

    setLoadingHero(true);
    try {
      const res = await fetch(`/api/music/releases/${hero.slug || hero.id}`);
      if (res.ok) {
        const releaseData = await res.json();
        if (releaseData.tracks && releaseData.tracks.length > 0) {
          const formatted = releaseData.tracks.map((t: any) => ({
            id: t.id,
            releaseId: hero.id,
            releaseTitle: hero.title,
            releaseCover: hero.cover,
            releaseSlug: hero.slug,
            artistId: hero.artistId,
            artistName: hero.stageName || 'Исполнитель',
            artistSlug: hero.artistSlug || '',
            title: t.title,
            slug: t.slug,
            trackNumber: t.trackNumber,
            audioFile: t.audioFile,
            duration: t.duration,
            explicit: t.explicit,
            lyrics: t.lyrics,
            authorNote: t.authorNote,
          }));

          playTrack(formatted[0], formatted, {
            id: hero.id,
            title: hero.title,
            cover: hero.cover,
            slug: hero.slug,
            artistName: hero.stageName || 'Исполнитель',
            artistSlug: hero.artistSlug || '',
          });
        } else {
          alert('В этом релизе пока нет аудиозаписей');
        }
      }
    } catch (err) {
      console.error('Error playing hero:', err);
    } finally {
      setLoadingHero(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        <span className="text-xs font-mono font-semibold">Загрузка главного музыкального раздела...</span>
      </div>
    );
  }

  const hero = data?.heroRelease;

  return (
    <div className="space-y-8 pb-16">
      <MusicNav activeTab="home" />

      {/* HERO FEATURED BANNER */}
      {hero ? (
        <div className="relative rounded-3xl bg-gradient-to-r from-[#180E38] via-[#120B2D] to-[#0B0D20] border border-[#2B1F5C] p-6 sm:p-10 overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-purple-600/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
            {/* Hero Cover */}
            <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-[#11152A] border-2 border-purple-500/30 shadow-2xl shrink-0 group relative">
              {hero.cover ? (
                <img src={hero.cover} alt={hero.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-purple-900/30 text-purple-300 flex items-center justify-center">
                  <Disc className="w-16 h-16" />
                </div>
              )}
            </div>

            {/* Hero Details */}
            <div className="space-y-4 text-center md:text-left min-w-0 flex-1">
              <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/20 border border-purple-500/40 text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Главный релиз</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-[#11152A] border border-[#1E2442] text-[#94A3B8]">
                  {hero.type}
                </span>
              </div>

              <div>
                <h2 className="text-2xl sm:text-4xl font-black text-white font-mono tracking-tight leading-tight">
                  {hero.title}
                </h2>
                <button
                  onClick={() => navigate(`/music/artist/${hero.artistSlug || hero.artistId}`)}
                  className="text-base text-purple-300 hover:text-white font-semibold mt-1 transition-colors inline-block"
                >
                  {hero.stageName || 'Исполнитель'}
                </button>
              </div>

              {/* Stats Bar */}
              <div className="flex items-center justify-center md:justify-start gap-4 text-xs font-mono text-[#94A3B8]">
                <div className="flex items-center gap-1 text-amber-300 font-bold">
                  <Star className="w-4 h-4 fill-amber-300" />
                  <span>{hero.avgScore ? `${hero.avgScore}/100` : 'Без оценок'}</span>
                </div>
                <span>·</span>
                <div>{hero.reviewsCount || 0} рецензий</div>
                <span>·</span>
                <div>{hero.tracksCount || 0} треков</div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-center md:justify-start gap-3 pt-2">
                <button
                  onClick={() => handlePlayHero(hero)}
                  disabled={loadingHero}
                  className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono text-xs font-bold transition-all shadow-xl shadow-purple-600/30 flex items-center gap-2 cursor-pointer"
                >
                  {loadingHero ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : currentTrack?.releaseId === hero.id && isPlaying ? (
                    <Pause className="w-4 h-4 fill-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-white" />
                  )}
                  <span>Слушать альбом</span>
                </button>

                <button
                  onClick={() => navigate(`/music/release/${hero.slug || hero.id}`)}
                  className="px-5 py-3.5 rounded-2xl bg-[#11152A] hover:bg-[#1A203F] border border-[#2B1F5C] text-slate-200 font-mono text-xs font-bold transition-all cursor-pointer"
                >
                  Открыть релиз
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* STATS STRIP */}
      {data?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-0.5">
            <span className="text-[11px] font-mono text-[#64748B] font-bold">Релизы</span>
            <div className="text-xl font-black text-white font-mono">{data.stats.totalReleases}</div>
          </div>
          <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-0.5">
            <span className="text-[11px] font-mono text-[#64748B] font-bold">Треки</span>
            <div className="text-xl font-black text-purple-400 font-mono">{data.stats.totalTracks}</div>
          </div>
          <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-0.5">
            <span className="text-[11px] font-mono text-[#64748B] font-bold">Исполнители</span>
            <div className="text-xl font-black text-indigo-400 font-mono">{data.stats.totalArtists}</div>
          </div>
          <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-0.5">
            <span className="text-[11px] font-mono text-[#64748B] font-bold">Рецензии</span>
            <div className="text-xl font-black text-amber-300 font-mono">{data.stats.totalReviews}</div>
          </div>
        </div>
      )}

      {/* SECTION: POPULAR RELEASES */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold text-white font-mono">Высокие оценки</h2>
          </div>

          <button
            onClick={() => navigate('/music/releases')}
            className="text-xs font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
          >
            <span>Все релизы</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {data?.popularReleases && data.popularReleases.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
            {data.popularReleases.map((rel) => (
              <MusicReleaseCard key={rel.id} release={rel} />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-[#0B0D20] border border-[#1E2442] rounded-2xl text-xs text-[#94A3B8]">
            Нет опубликованных релизов
          </div>
        )}
      </div>

      {/* SECTION: NEW RELEASES */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white font-mono">Свежие новинки</h2>
          </div>

          <button
            onClick={() => navigate('/music/new')}
            className="text-xs font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
          >
            <span>Все новинки</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {data?.latestReleases && data.latestReleases.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
            {data.latestReleases.map((rel) => (
              <MusicReleaseCard key={rel.id} release={rel} />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-[#0B0D20] border border-[#1E2442] rounded-2xl text-xs text-[#94A3B8]">
            Нет новых релизов
          </div>
        )}
      </div>

      {/* SECTION: POPULAR ARTISTS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold text-white font-mono">Исполнители Dodik Tracker</h2>
          </div>

          <button
            onClick={() => navigate('/music/artists')}
            className="text-xs font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
          >
            <span>Все исполнители</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {data?.popularArtists && data.popularArtists.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {data.popularArtists.map((artist) => (
              <div
                key={artist.id}
                onClick={() => navigate(`/music/artist/${artist.slug || artist.id}`)}
                className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-purple-500/40 transition-all text-center space-y-3 cursor-pointer group"
              >
                {artist.avatar ? (
                  <img
                    src={artist.avatar}
                    alt={artist.stageName}
                    className="w-20 h-20 rounded-2xl object-cover mx-auto border border-[#1E2442] group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-purple-900/40 text-purple-300 font-mono font-black text-xl flex items-center justify-center mx-auto border border-[#1E2442] group-hover:scale-105 transition-transform">
                    {artist.stageName.charAt(0).toUpperCase()}
                  </div>
                )}

                <div>
                  <h3 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors truncate font-mono">
                    {artist.stageName}
                  </h3>
                  <span className="text-[10px] text-[#64748B] font-mono">
                    {artist.releasesCount} релизов
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* SECTION: GENRES */}
      {data?.genres && data.genres.length > 0 && (
        <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white font-mono">Жанры музыки</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {data.genres.map((g) => (
              <button
                key={g.id}
                onClick={() => navigate(`/music/genres?genreId=${g.id}`)}
                className="px-3.5 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] hover:bg-purple-600 hover:text-white text-xs font-mono text-[#CBD5E1] transition-all cursor-pointer"
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
