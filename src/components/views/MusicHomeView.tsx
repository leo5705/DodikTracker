import React, { useState, useEffect, useCallback } from 'react';
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
  Search,
  X,
  AlertCircle,
  Headphones,
  Plus,
  Flame,
  Globe,
  Mic2,
  Compass,
  Clock,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { MusicNav } from '../music/MusicNav.tsx';
import { MusicReleaseCard, ReleaseCardData } from '../music/MusicReleaseCard.tsx';
import { MusicTrackCard, AnyTrackItem } from '../music/MusicTrackCard.tsx';
import { ArtistLinks } from '../music/ArtistLinks.tsx';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';
import { useRouter } from '../../context/RouterContext.tsx';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import {
  getStableTrackKey,
  getStableArtistKey,
  getStableReleaseKey,
  dedupeTracks,
  dedupeArtists,
  dedupeReleases,
} from '../../utils/musicIdentity.ts';
import { useAuth } from '../../context/AuthContext.tsx';

interface HomeData {
  stats: {
    totalReleases: number;
    totalTracks: number;
    totalArtists: number;
    totalReviews: number;
  };
  heroRelease: ReleaseCardData | null;
  popularTracks?: AnyTrackItem[];
  trendingHits?: AnyTrackItem[];
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

const GENRE_CARDS = [
  { name: 'Rock & Metal', query: 'Rock', color: 'from-amber-600/30 to-red-900/40', border: 'border-amber-500/30' },
  { name: 'Hip-Hop & Rap', query: 'Hip-Hop', color: 'from-purple-600/30 to-indigo-900/40', border: 'border-purple-500/30' },
  { name: 'Electronic & EDM', query: 'Electronic', color: 'from-cyan-600/30 to-blue-900/40', border: 'border-cyan-500/30' },
  { name: 'Synthwave & Retro', query: 'Synthwave', color: 'from-pink-600/30 to-rose-900/40', border: 'border-pink-500/30' },
  { name: 'Pop Hits', query: 'Pop', color: 'from-emerald-600/30 to-teal-900/40', border: 'border-emerald-500/30' },
  { name: 'Lo-Fi & Chill', query: 'Lo-Fi', color: 'from-violet-600/30 to-slate-900/40', border: 'border-violet-500/30' },
  { name: 'Gaming & OST', query: 'Game OST', color: 'from-orange-600/30 to-amber-900/40', border: 'border-orange-500/30' },
  { name: 'Anime Music', query: 'Anime OST', color: 'from-rose-600/30 to-purple-900/40', border: 'border-rose-500/30' },
];

export const MusicHomeView: React.FC = () => {
  const { navigate } = useRouter();
  const { dbUser } = useAuth();
  const { currentTrack, isPlaying, togglePlayPause, playTrack } = useMusicPlayer();

  const [data, setData] = useState<HomeData | null>(null);
  const [recommendations, setRecommendations] = useState<import('../../server/services/musicRecommendationService.ts').RecommendationResponse | null>(null);
  const [forYouData, setForYouData] = useState<import('../../server/services/musicRecommendationService.ts').ForYouResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingForYou, setRefreshingForYou] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingHero, setLoadingHero] = useState(false);

  // Dynamic regional trends state
  const [trendsRegion, setTrendsRegion] = useState<'global' | 'RU'>('global');
  const [trendsTracks, setTrendsTracks] = useState<AnyTrackItem[]>([]);
  const [trendsUpdatedAt, setTrendsUpdatedAt] = useState<number | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);

  // Format timestamp into clean Russian relative or time string
  const formatRussianTime = (timestamp: number | null) => {
    if (!timestamp) return '';
    const now = Date.now();
    const diffSec = Math.floor((now - timestamp) / 1000);
    if (diffSec < 60) {
      return 'Обновлено только что';
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return `Обновлено ${diffMin} ${
        diffMin === 1
          ? 'минуту'
          : [2, 3, 4].includes(diffMin % 10) && ![12, 13, 14].includes(diffMin % 100)
          ? 'минуты'
          : 'минут'
      } назад`;
    }
    const date = new Date(timestamp);
    const hrs = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `Обновлено сегодня в ${hrs}:${mins}`;
  };

  // Synchronize initial trends state when main home data loads
  useEffect(() => {
    if (data?.trendingHits && data.trendingHits.length > 0 && trendsTracks.length === 0) {
      setTrendsTracks(data.trendingHits);
      setTrendsUpdatedAt((data as any).trendingHitsUpdatedAt || Date.now());
    }
  }, [data]);

  // Load trends dynamically on region change or manual refresh
  useEffect(() => {
    let active = true;

    // Skip redundant network call if global is already preloaded from initial home load
    if (trendsRegion === 'global' && data?.trendingHits && trendsTracks.length > 0 && trendsUpdatedAt !== null) {
      return;
    }

    const loadRegionTrends = async () => {
      setTrendsLoading(true);
      setTrendsError(null);
      try {
        const res = await fetch(`/api/music/trends?region=${trendsRegion}`);
        if (!res.ok) {
          throw new Error('API failed');
        }
        const json = await res.json();
        if (active) {
          setTrendsTracks(json.tracks || []);
          setTrendsUpdatedAt(json.updatedAt || null);
        }
      } catch (err: any) {
        console.error('Failed to fetch regional trends:', err);
        if (active) {
          setTrendsError('Не удалось обновить тренды. Пожалуйста, попробуйте позже.');
        }
      } finally {
        if (active) {
          setTrendsLoading(false);
        }
      }
    };

    loadRegionTrends();

    return () => {
      active = false;
    };
  }, [trendsRegion]);

  const handleRefreshForYou = async () => {
    setRefreshingForYou(true);
    try {
      const res = await fetch(`/api/music/recommendations/for-you?limit=12&refresh=true&t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        setForYouData(json);
      }
    } catch (err) {
      console.warn('Failed to refresh recommendations:', err);
    } finally {
      setRefreshingForYou(false);
    }
  };

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    tracks?: AnyTrackItem[];
    externalTracks?: AnyTrackItem[];
    artists?: any[];
    externalArtists?: any[];
    releases?: ReleaseCardData[];
  } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const loadHomeData = useCallback(async (retryCount = 0) => {
    try {
      setError(null);
      const [resHome, resRec, resForYou] = await Promise.all([
        fetch('/api/music/home'),
        fetch('/api/music/recommendations').catch(() => null),
        fetch('/api/music/recommendations/for-you?limit=12').catch(() => null),
      ]);

      if (!resHome.ok) {
        throw new Error(`HTTP ${resHome.status}`);
      }
      const jsonHome = await resHome.json();
      setData(jsonHome);

      if (resRec && resRec.ok) {
        const jsonRec = await resRec.json();
        setRecommendations(jsonRec);
      }

      if (resForYou && resForYou.ok) {
        const jsonForYou = await resForYou.json();
        setForYouData(jsonForYou);
      }

      setLoading(false);
    } catch (err: any) {
      if (retryCount < 2) {
        setTimeout(() => {
          loadHomeData(retryCount + 1);
        }, 800 * (retryCount + 1));
      } else {
        console.warn('Music home fetch attempt completed with error:', err?.message || err);
        setError('Не удалось загрузить данные музыкального раздела');
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      setSearchLoading(true);
      fetch(`/api/music/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json) setSearchResults(json);
        })
        .catch((err) => console.warn('Failed to search music from home:', err))
        .finally(() => setSearchLoading(false));
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  if (error && !data) {
    return (
      <div className="space-y-8 pb-16">
        <MusicNav activeTab="home" />
        <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-4 bg-[#080A18] rounded-3xl border border-[#1E2442] p-8 shadow-xl max-w-lg mx-auto mt-6">
          <AlertCircle className="w-10 h-10 text-amber-400" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Не удалось загрузить раздел музыки</h3>
            <p className="text-xs text-slate-400">Проверьте соединение с сервером или попробуйте ещё раз</p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              loadHomeData(0);
            }}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold transition cursor-pointer shadow-lg shadow-purple-600/25"
          >
            Повторить попытку
          </button>
        </div>
      </div>
    );
  }

  const hero = data?.heroRelease;
  const trendingHits = data?.trendingHits || [];
  const popularDodikTracks = data?.popularTracks || [];
  const latestReleases = data?.latestReleases || [];
  const popularReleases = data?.popularReleases || [];
  const popularArtists = data?.popularArtists || [];

  return (
    <div className="space-y-8 pb-20">
      <MusicNav activeTab="home" />

      {/* SEARCH BAR & QUICK ACCESS */}
      <div className="p-5 sm:p-7 rounded-3xl bg-gradient-to-r from-[#0E0A28] via-[#0B0D20] to-[#080A18] border border-[#261E58] shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Search className="w-4 h-4 text-purple-400" />
            <span>Найти музыку</span>
          </label>
          <span className="text-[11px] font-mono text-purple-300 font-semibold hidden sm:inline">
            Любые треки, альбомы и профили исполнителей
          </span>
        </div>

        <div className="relative">
          <Search className="w-5 h-5 text-purple-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                navigate(`/music/search?q=${encodeURIComponent(searchQuery.trim())}`);
              }
            }}
            placeholder="Введите название трека, альбома или исполнителя (например: Linkin Park, Queen, КИНО)..."
            className="w-full pl-12 pr-28 py-3.5 sm:py-4 rounded-2xl bg-[#11152A] border border-[#1E2442] text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500 font-mono transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-24 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-lg"
              title="Очистить"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => {
              if (searchQuery.trim()) {
                navigate(`/music/search?q=${encodeURIComponent(searchQuery.trim())}`);
              }
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold transition shadow-md shadow-purple-950/50 cursor-pointer"
          >
            Найти
          </button>
        </div>

        {/* Quick query chips */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[11px] font-mono text-slate-500 mr-1 hidden sm:inline">
            Популярные запросы:
          </span>
          {['Linkin Park', 'Queen', 'The Weeknd', 'Nirvana', 'КИНО', 'Daft Punk', 'Imagine Dragons'].map((artist) => (
            <button
              key={artist}
              onClick={() => setSearchQuery(artist)}
              className="px-2.5 py-1 rounded-xl bg-[#11152A] hover:bg-purple-600/30 text-slate-300 hover:text-white border border-[#1E2442] hover:border-purple-500/40 text-[11px] font-mono transition cursor-pointer"
            >
              {artist}
            </button>
          ))}
        </div>

        {/* Live Search Quick Results */}
        {searchLoading && (
          <div className="py-6 flex items-center justify-center gap-2 text-xs font-mono text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            <span>Поиск по каталогу...</span>
          </div>
        )}

        {!searchLoading && searchResults && (
          <div className="pt-3 border-t border-[#1E2442]/60 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Результаты по запросу «{searchQuery}»</span>
              </span>
              <button
                onClick={() => navigate(`/music/search?q=${encodeURIComponent(searchQuery.trim())}`)}
                className="text-xs font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer font-bold"
              >
                <span>Все результаты</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick artists if found */}
            {searchResults.externalArtists && searchResults.externalArtists.length > 0 && (
              <div className="flex items-center gap-3 overflow-x-auto pb-2 custom-scrollbar">
                {searchResults.externalArtists.slice(0, 4).map((art: any, idx) => (
                  <div
                    key={`search-ext-art-${art.providerArtistId || art.id || idx}-${idx}`}
                    onClick={() => navigate(`/music/external/artist/youtube/${art.providerArtistId}`)}
                    className="p-2.5 rounded-xl bg-[#11152A] hover:bg-[#1A203F] border border-[#1E2442] hover:border-purple-500/40 flex items-center gap-2.5 cursor-pointer shrink-0 group transition"
                  >
                    {art.avatar ? (
                      <img src={art.avatar} alt="" className="w-8 h-8 rounded-lg object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-purple-950/40 text-purple-300 flex items-center justify-center text-xs font-bold font-mono">
                        {art.name?.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0 pr-2">
                      <span className="text-xs font-bold text-white group-hover:text-purple-300 transition block truncate max-w-[140px]">
                        {art.name}
                      </span>
                      <span className="text-[10px] text-rose-400 font-mono">YouTube Artist</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Combined tracks list */}
            {(() => {
              const dodikTracks = (searchResults?.tracks || []).map((t) => ({ ...t, kind: 'dodik' as const, source: 'dodik' as const }));
              const catalogTracks = (searchResults?.externalTracks || []).map((t) => ({ ...t, kind: 'external' as const, source: 'youtube' as const }));
              const totalFound = dodikTracks.length + catalogTracks.length;

              if (totalFound === 0) {
                return <p className="text-xs font-mono text-slate-400 py-2">Ничего не найдено</p>;
              }

              return (
                <div className="space-y-3">
                  {catalogTracks.slice(0, 4).map((tr, idx) => (
                    <MusicTrackCard key={`search-cat-tr-${tr.id || tr.providerTrackId || idx}-${idx}`} track={tr} queueContext={catalogTracks} variant="row" />
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* PLATFORM STATS BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-purple-950/40 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <Music2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-black text-white font-mono leading-none">
              {(data?.stats.totalTracks || 0) > 0 ? data?.stats.totalTracks : '10,000+'}
            </div>
            <div className="text-[11px] text-[#64748B] font-mono mt-0.5">Треков в каталоге</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Disc className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-black text-white font-mono leading-none">
              {(data?.stats.totalReleases || 0) > 0 ? data?.stats.totalReleases : '500+'}
            </div>
            <div className="text-[11px] text-[#64748B] font-mono mt-0.5">Альбомов и синглов</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-black text-white font-mono leading-none">
              {(data?.stats.totalArtists || 0) > 0 ? data?.stats.totalArtists : '1,000+'}
            </div>
            <div className="text-[11px] text-[#64748B] font-mono mt-0.5">Исполнителей</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Star className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-black text-white font-mono leading-none">
              {data?.stats.totalReviews || 0}
            </div>
            <div className="text-[11px] text-[#64748B] font-mono mt-0.5">Рецензий пользователей</div>
          </div>
        </div>
      </div>

      {/* HERO FEATURED BANNER */}
      {hero ? (
        <div className="relative rounded-3xl bg-gradient-to-r from-[#180E38] via-[#120B2D] to-[#0B0D20] border border-[#2B1F5C] p-6 sm:p-10 overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-purple-600/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
            {/* Hero Cover */}
            <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-[#11152A] border-2 border-purple-500/30 shadow-2xl shrink-0 group relative">
              {hero.cover ? (
                <img src={getBestMusicImageUrl(hero.cover, 'large')} alt={hero.title} className="w-full h-full object-cover" />
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
                <div className="mt-1">
                  <ArtistLinks
                    artistName={hero.stageName}
                    artistSlug={hero.artistSlug}
                    artistId={hero.artistId}
                    linkClassName="text-base text-purple-300 hover:text-white font-semibold transition-colors"
                  />
                </div>
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
                  className="px-5 py-3.5 rounded-2xl bg-[#11152A] hover:bg-[#181E3B] text-slate-200 hover:text-white font-mono text-xs font-bold border border-[#1E2442] transition cursor-pointer"
                >
                  Страница релиза
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Dynamic Spotlight Banner */
        <div className="relative rounded-3xl bg-gradient-to-r from-[#180E38] via-[#120B2D] to-[#0B0D20] border border-[#2B1F5C] p-6 sm:p-10 overflow-hidden shadow-2xl">
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-3 text-center md:text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/20 border border-purple-500/40 text-purple-300">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                <span>Мировые тренды и миллионы треков</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white font-mono">
                Музыка без ограничений
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-xl">
                Слушайте мировые хиты YouTube Music, синхронизируйте тексты песен караоке в реальном времени и открывайте релизы сообщества Dodik Tracker.
              </p>
            </div>
            <button
              onClick={() => navigate('/music/search')}
              className="px-6 py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition shadow-xl shadow-purple-600/30 flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Compass className="w-4 h-4" />
              <span>Исследовать каталог</span>
            </button>
          </div>
        </div>
      )}

      {/* PERSONAL RECOMMENDATIONS SECTIONS */}
      {recommendations && (
        <>
          {/* 1. CONTINUE LISTENING */}
          {recommendations.continueListening.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white font-mono flex items-center gap-2">
                    <Clock className="w-5 h-5 text-indigo-400" />
                    <span>Продолжить слушать</span>
                  </h3>
                  <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
                    Недавно прослушанные композиции
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recommendations.continueListening.map((item, idx) => (
                  <MusicTrackCard
                    key={`rec-cl-${item.trackId || idx}-${idx}`}
                    track={{
                      kind: item.provider === 'youtube' ? 'external' : 'dodik',
                      id: item.trackId,
                      providerTrackId: item.trackId.replace(/^yt_/, ''),
                      provider: item.provider as any,
                      title: item.title,
                      artist: item.artistName,
                      artists: [item.artistName],
                      album: item.releaseTitle || null,
                      durationSeconds: item.durationSeconds || null,
                      thumbnail: item.releaseCover || null,
                      lyrics: null,
                      explicit: null,
                      playable: true,
                    } as any}
                    variant="row"
                  />
                ))}
              </div>
            </div>
          )}

          {/* 2. PERSONALIZED RECOMMENDATIONS "ДЛЯ ВАС" / EMPTY STATE & FALLBACK */}
          {forYouData?.isPersonalized && forYouData.tracks.length > 0 ? (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white font-mono flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    <span>Для вас</span>
                  </h3>
                  <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
                    Персональные рекомендации на основе ваших прослушиваний, вкуса и подписок
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRefreshForYou}
                  disabled={refreshingForYou}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/30 text-purple-300 hover:text-purple-200 text-xs font-mono font-medium transition cursor-pointer disabled:opacity-50"
                  title="Обновить персональные рекомендации"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshingForYou ? 'animate-spin' : ''}`} />
                  <span>Обновить рекомендации</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {forYouData.tracks.map((item, idx) => (
                  <MusicTrackCard
                    key={`for-you-tr-${item.trackId || idx}-${idx}`}
                    track={{
                      kind: item.provider === 'youtube' ? 'external' : 'dodik',
                      id: item.trackId,
                      providerTrackId: item.trackId.replace(/^yt_/, ''),
                      provider: item.provider as any,
                      title: item.title,
                      artist: item.artistName,
                      artistName: item.artistName,
                      artists: [item.artistName],
                      album: item.releaseTitle || null,
                      durationSeconds: item.durationSeconds || null,
                      thumbnail: item.releaseCover || null,
                      releaseCover: item.releaseCover || null,
                      lyrics: null,
                      explicit: null,
                      playable: true,
                      explanation: item.explanation || 'Персональная рекомендация',
                    } as any}
                    variant="row"
                  />
                ))}
              </div>
            </div>
          ) : dbUser && forYouData && !forYouData.isPersonalized ? (
            <div className="space-y-6 pt-2">
              {/* Cold start state for users with insufficient history */}
              <div className="p-6 sm:p-8 rounded-2xl bg-[#0B0D20] border border-[#1E2442] text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-950/40 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-base font-bold text-white font-mono">
                    Для вас — персональные рекомендации
                  </h4>
                  <p className="text-xs text-[#94A3B8] max-w-lg mx-auto leading-relaxed">
                    У вас пока нет достаточной истории прослушиваний. Включайте треки, добавляйте понравившиеся песни в избранное и подписывайтесь на артистов — и здесь сформируются уникальные рекомендации специально для вашего вкуса!
                  </p>
                  <p className="text-[11px] text-purple-400 font-mono">
                    А пока мы подобрали популярные композиции и главные хиты каталога Dodik Tracker:
                  </p>
                </div>
              </div>

              {/* Honest fallback: Popular / New releases */}
              {forYouData.tracks.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-white font-mono flex items-center gap-2">
                        <Flame className="w-5 h-5 text-rose-400" />
                        <span>Популярно сейчас</span>
                      </h3>
                      <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
                        Популярные релизы и треки платформы
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleRefreshForYou}
                      disabled={refreshingForYou}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-300 hover:text-rose-200 text-xs font-mono font-medium transition cursor-pointer disabled:opacity-50"
                      title="Обновить список треков"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshingForYou ? 'animate-spin' : ''}`} />
                      <span>Обновить</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {forYouData.tracks.map((item, idx) => (
                      <MusicTrackCard
                        key={`fallback-pop-${item.trackId || idx}-${idx}`}
                        track={{
                          kind: item.provider === 'youtube' ? 'external' : 'dodik',
                          id: item.trackId,
                          providerTrackId: item.trackId.replace(/^yt_/, ''),
                          provider: item.provider as any,
                          title: item.title,
                          artist: item.artistName,
                          artistName: item.artistName,
                          artists: [item.artistName],
                          album: item.releaseTitle || null,
                          durationSeconds: item.durationSeconds || null,
                          thumbnail: item.releaseCover || null,
                          releaseCover: item.releaseCover || null,
                          lyrics: null,
                          explicit: null,
                          playable: true,
                          explanation: item.explanation || 'Популярно в Dodik Tracker',
                        } as any}
                        variant="row"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : recommendations?.forYou && recommendations.forYou.length > 0 ? (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white font-mono flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    <span>Для вас</span>
                  </h3>
                  <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
                    Персональные рекомендации на основе ваших прослушиваний
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRefreshForYou}
                  disabled={refreshingForYou}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/30 text-purple-300 hover:text-purple-200 text-xs font-mono font-medium transition cursor-pointer disabled:opacity-50"
                  title="Обновить персональные рекомендации"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshingForYou ? 'animate-spin' : ''}`} />
                  <span>Обновить рекомендации</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recommendations.forYou.map((item, idx) => (
                  <MusicTrackCard
                    key={`rec-fy-${item.trackId || idx}-${idx}`}
                    track={{
                      kind: item.provider === 'youtube' ? 'external' : 'dodik',
                      id: item.trackId,
                      providerTrackId: item.trackId.replace(/^yt_/, ''),
                      provider: item.provider as any,
                      title: item.title,
                      artist: item.artistName,
                      artistName: item.artistName,
                      artists: [item.artistName],
                      album: item.releaseTitle || null,
                      durationSeconds: item.durationSeconds || null,
                      thumbnail: item.releaseCover || null,
                      releaseCover: item.releaseCover || null,
                      lyrics: null,
                      explicit: null,
                      playable: true,
                      explanation: item.explanation || 'Рекомендация по вкусу',
                    } as any}
                    variant="row"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* 3. LONG TIME NO LISTEN */}
          {recommendations.longTimeNoListen.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white font-mono flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-amber-400" />
                    <span>Вы давно не слушали</span>
                  </h3>
                  <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
                    Треки, которые вы часто включали раньше
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recommendations.longTimeNoListen.map((item, idx) => (
                  <MusicTrackCard
                    key={`rec-ltnl-${item.trackId || idx}-${idx}`}
                    track={{
                      kind: item.provider === 'youtube' ? 'external' : 'dodik',
                      id: item.trackId,
                      providerTrackId: item.trackId.replace(/^yt_/, ''),
                      provider: item.provider as any,
                      title: item.title,
                      artist: item.artistName,
                      artists: [item.artistName],
                      album: item.releaseTitle || null,
                      durationSeconds: item.durationSeconds || null,
                      thumbnail: item.releaseCover || null,
                      lyrics: null,
                      explicit: null,
                      playable: true,
                    } as any}
                    variant="row"
                  />
                ))}
              </div>
            </div>
          )}

          {/* 4. BASED ON YOUR TASTE */}
          {recommendations.basedOnYourTaste.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white font-mono flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    <span>Похоже на то, что вам нравится</span>
                  </h3>
                  <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
                    На основе вашего музыкального вкуса
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {recommendations.basedOnYourTaste.map((item, idx) => (
                  <MusicTrackCard
                    key={`rec-[#]-${item.trackId || idx}-${idx}`}
                    track={{
                      kind: item.provider === 'youtube' ? 'external' : 'dodik',
                      id: item.trackId,
                      providerTrackId: item.trackId.replace(/^yt_/, ''),
                      provider: item.provider as any,
                      title: item.title,
                      artist: item.artistName,
                      artists: [item.artistName],
                      album: item.releaseTitle || null,
                      durationSeconds: item.durationSeconds || null,
                      thumbnail: item.releaseCover || null,
                      lyrics: null,
                      explicit: null,
                      playable: true,
                    } as any}
                    variant="row"
                  />
                ))}
              </div>
            </div>
          )}

          {/* 5. POPULAR NOW (COLD START) */}
          {recommendations.isColdStart && recommendations.popularNow.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white font-mono flex items-center gap-2">
                    <Flame className="w-5 h-5 text-rose-400" />
                    <span>Популярное сейчас</span>
                  </h3>
                  <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
                    Свежие хиты и популярная музыка
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recommendations.popularNow.map((item, idx) => (
                  <MusicTrackCard
                    key={`rec-pop-${item.trackId || idx}-${idx}`}
                    track={{
                      kind: item.provider === 'youtube' ? 'external' : 'dodik',
                      id: item.trackId,
                      providerTrackId: item.trackId.replace(/^yt_/, ''),
                      provider: item.provider as any,
                      title: item.title,
                      artist: item.artistName,
                      artists: [item.artistName],
                      album: item.releaseTitle || null,
                      durationSeconds: item.durationSeconds || null,
                      thumbnail: item.releaseCover || null,
                      lyrics: null,
                      explicit: null,
                      playable: true,
                    } as any}
                    variant="row"
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {/* DYNAMIC REGIONAL TRENDS */}
      <div className="space-y-5 p-5 sm:p-6 rounded-3xl bg-[#090C1F] border border-[#1E2442] shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2442]/60">
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-white font-mono flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-500 animate-pulse" />
              <span>Музыкальные тренды</span>
            </h3>
            <p className="text-xs text-[#94A3B8] font-mono">
              Самые актуальные и набирающие популярность композиции
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Region Switcher */}
            <div className="inline-flex rounded-xl bg-[#0F132C] p-1 border border-[#1E2442]">
              <button
                onClick={() => setTrendsRegion('global')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  trendsRegion === 'global'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🌍</span>
                <span>Мир</span>
              </button>
              <button
                onClick={() => setTrendsRegion('RU')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  trendsRegion === 'RU'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🇷🇺</span>
                <span>Россия</span>
              </button>
            </div>
          </div>
        </div>

        {/* Loader or Error or Tracks */}
        {trendsLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3 font-mono">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            <span className="text-xs">Загрузка трендов региона...</span>
          </div>
        ) : trendsError ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-white font-mono">{trendsError}</p>
              <p className="text-xs text-slate-400">Пожалуйста, проверьте соединение или повторите попытку</p>
            </div>
            <button
              onClick={() => {
                const current = trendsRegion;
                setTrendsRegion(current === 'global' ? 'RU' : 'global');
                setTimeout(() => setTrendsRegion(current), 50);
              }}
              className="px-4 py-1.5 rounded-xl bg-[#1E2442] hover:bg-[#262E53] text-slate-200 text-xs font-mono font-bold transition cursor-pointer"
            >
              Обновить
            </button>
          </div>
        ) : trendsTracks.length === 0 ? (
          <div className="text-center py-10 text-xs text-slate-500 font-mono">
            Нет доступных трендов для данного региона
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {dedupeTracks(trendsTracks.slice(0, 9)).map((track, idx) => {
                const rankNum = (track as any).rank || idx + 1;
                const movement = (track as any).trendMovement || 'stable';
                
                return (
                  <div key={getStableTrackKey(track, idx)} className="relative group">
                    {/* Rank Badge overlay on the top corner */}
                    <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 bg-[#090C1F]/90 backdrop-blur border border-[#1E2442] text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg text-slate-300">
                      <span>#{rankNum}</span>
                      {movement === 'up' && <span className="text-emerald-400">↑</span>}
                      {movement === 'down' && <span className="text-rose-400">↓</span>}
                      {movement === 'stable' && <span className="text-slate-400">•</span>}
                    </div>

                    <MusicTrackCard track={track} queueContext={trendsTracks} variant="row" />
                  </div>
                );
              })}
            </div>

            {/* Bottom row: Time stamp of the update */}
            {trendsUpdatedAt && (
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-2 border-t border-[#1E2442]/30">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{formatRussianTime(trendsUpdatedAt)}</span>
                </div>
                <span className="text-slate-500">Регион: {trendsRegion === 'global' ? 'Global' : 'Russia (RU)'}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* POPULAR DODIK COMMUNITY TRACKS (IF ANY) */}
      {popularDodikTracks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white font-mono flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <span>Эксклюзив Dodik Music</span>
              </h3>
              <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
                Треки, созданные и опубликованные музыкантами нашего сообщества
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {dedupeTracks(popularDodikTracks).map((track, idx) => (
              <MusicTrackCard key={getStableTrackKey(track, idx)} track={track} queueContext={popularDodikTracks} variant="row" />
            ))}
          </div>
        </div>
      )}

      {/* GENRES & MOODS CAROUSEL */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white font-mono flex items-center gap-2">
              <Radio className="w-5 h-5 text-indigo-400" />
              <span>Жанры и настроения</span>
            </h3>
            <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
              Быстрый переход к трекам любимого жанра
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {GENRE_CARDS.map((g) => (
            <div
              key={g.name}
              onClick={() => navigate(`/music/search?q=${encodeURIComponent(g.query)}`)}
              className={`p-4 rounded-2xl bg-gradient-to-br ${g.color} border ${g.border} hover:scale-102 transition-all duration-300 cursor-pointer group shadow-lg flex flex-col justify-between h-24`}
            >
              <span className="text-xs font-bold text-white font-mono group-hover:text-purple-200 transition">
                {g.name}
              </span>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                <span>Слушать</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* POPULAR DODIK RELEASES */}
      {popularReleases.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white font-mono flex items-center gap-2">
                <Disc className="w-5 h-5 text-purple-400" />
                <span>Популярные альбомы и релизы</span>
              </h3>
            </div>
            <button
              onClick={() => navigate('/music/releases')}
              className="text-xs font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1 font-bold cursor-pointer"
            >
              <span>Все релизы</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {popularReleases.slice(0, 6).map((rel, idx) => (
              <MusicReleaseCard key={getStableReleaseKey(rel, idx)} release={rel} />
            ))}
          </div>
        </div>
      )}

      {/* DODIK MUSICIANS SECTION */}
      {popularArtists.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white font-mono flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                <span>Музыканты платформы Dodik</span>
              </h3>
            </div>
            <button
              onClick={() => navigate('/music/artists')}
              className="text-xs font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1 font-bold cursor-pointer"
            >
              <span>Все музыканты</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {popularArtists.map((art, idx) => (
              <div
                key={getStableArtistKey(art, idx)}
                onClick={() => navigate(`/music/artist/${art.slug || art.id}`)}
                className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-purple-500/40 transition-all flex items-center gap-3.5 cursor-pointer group shadow-md"
              >
                {art.avatar ? (
                  <img
                    src={getBestMusicImageUrl(art.avatar, 'medium')}
                    alt={art.stageName}
                    className="w-14 h-14 rounded-2xl object-cover shrink-0 group-hover:scale-105 transition-transform border border-purple-500/20"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-purple-900/40 text-purple-300 font-mono font-bold flex items-center justify-center shrink-0 border border-purple-500/20 text-lg">
                    {art.stageName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-white font-mono truncate group-hover:text-purple-300 transition-colors">
                    {art.stageName}
                  </h4>
                  <div className="text-[11px] text-[#64748B] font-mono mt-0.5">
                    <span>{art.releasesCount} релизов</span> • <span>{art.tracksCount} треков</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DODIK STUDIO CTA BANNER */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-purple-950/40 via-[#0B0D20] to-[#10132B] border border-purple-500/30 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
        <div className="space-y-2 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/20 border border-purple-500/40 text-purple-300">
            <Mic2 className="w-3.5 h-3.5" />
            <span>Для авторов и музыкантов</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white font-mono">
            Публикуйте свою музыку на Dodik Tracker
          </h3>
          <p className="text-xs text-slate-400 max-w-lg">
            Создавайте альбомы, загружайте треки, получайте PTS за прослушивания и делитесь творчеством с аудиторией.
          </p>
        </div>
        <button
          onClick={() => navigate('/music/studio')}
          className="px-6 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition shadow-lg shadow-purple-600/30 shrink-0 cursor-pointer"
        >
          {dbUser?.role === 'ADMIN' || dbUser?.role === 'SUPER_ADMIN' ? 'Открыть Студию' : 'Подать заявку музыканта'}
        </button>
      </div>
    </div>
  );
};
