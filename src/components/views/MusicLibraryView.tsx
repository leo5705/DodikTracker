import React, { useState, useEffect, useCallback } from 'react';
import {
  Library,
  Star,
  Disc,
  Loader2,
  Heart,
  Play,
  Pause,
  Shuffle,
  Search,
  Clock,
  Music2,
  Calendar,
  Headphones,
  Sparkles,
  SlidersHorizontal,
  ChevronRight,
  ExternalLink,
  Flame,
  CheckCircle2,
  ArrowUpDown,
  History,
} from 'lucide-react';
import { MusicNav } from '../music/MusicNav.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useMusicPlayer, Track } from '../../context/MusicPlayerContext.tsx';

type LibraryTab = 'tracks' | 'releases' | 'recent' | 'reviews';

interface SummaryData {
  favoriteTracksCount: number;
  favoriteReleasesCount: number;
  recentTracksCount: number;
  totalListeningSeconds: number;
  reviewsCount: number;
}

interface FavoriteReleaseItem {
  id: number;
  artistId: number;
  title: string;
  slug: string;
  type: 'SINGLE' | 'EP' | 'ALBUM';
  description?: string | null;
  cover?: string | null;
  releaseDate?: string | null;
  status: string;
  listenCount: number;
  createdAt: string;
  addedAt: string;
  stageName: string;
  artistSlug: string;
  artistAvatar?: string | null;
  avgScore: number;
  reviewsCount: number;
  tracksCount: number;
  isFavorite: boolean;
}

interface RecentTrackItem extends Track {
  releaseTitle?: string;
  releaseCover?: string | null;
  releaseSlug?: string;
  releaseType?: string;
  artistName?: string;
  artistSlug?: string;
  lastListenedAt: string;
  userListenCount?: number;
}

interface UserReviewItem {
  id: number;
  releaseId: number;
  userId: number;
  musicScore: number;
  performanceScore: number;
  productionScore: number;
  lyricsScore: number;
  atmosphereScore: number;
  cohesionScore: number;
  overallScore: number;
  text?: string | null;
  createdAt: string;
  updatedAt: string;
  releaseTitle: string;
  releaseSlug: string;
  releaseCover?: string | null;
  releaseType?: string;
  releaseDate?: string | null;
  releaseListenCount?: number;
  artistId: number;
  artistStageName: string;
  artistSlug: string;
  artistAvatar?: string | null;
}

export const MusicLibraryView: React.FC = () => {
  const { dbUser, authFetch } = useAuth();
  const { navigate, route } = useRouter();
  const { playTrack, currentTrack, isPlaying, togglePlayPause, toggleFavoriteTrack } = useMusicPlayer();

  // Tab State
  const initialTab = (route.params?.tab as LibraryTab) || 'tracks';
  const [activeTab, setActiveTab] = useState<LibraryTab>(initialTab);

  // Summary counts
  const [summary, setSummary] = useState<SummaryData>({
    favoriteTracksCount: 0,
    favoriteReleasesCount: 0,
    recentTracksCount: 0,
    totalListeningSeconds: 0,
    reviewsCount: 0,
  });

  // Tracks tab state
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [tracksSearch, setTracksSearch] = useState('');
  const [tracksSort, setTracksSort] = useState<'recent_added' | 'title_asc' | 'popular' | 'duration'>('recent_added');
  const [tracksPage, setTracksPage] = useState(1);
  const [tracksTotalPages, setTracksTotalPages] = useState(1);
  const [tracksTotal, setTracksTotal] = useState(0);

  // Releases tab state
  const [releases, setReleases] = useState<FavoriteReleaseItem[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(true);
  const [releasesSearch, setReleasesSearch] = useState('');
  const [releasesType, setReleasesType] = useState<'ALL' | 'ALBUM' | 'EP' | 'SINGLE'>('ALL');
  const [releasesSort, setReleasesSort] = useState<'recent_added' | 'title_asc' | 'release_date_desc' | 'popular' | 'rating'>('recent_added');
  const [releasesPage, setReleasesPage] = useState(1);
  const [releasesTotalPages, setReleasesTotalPages] = useState(1);
  const [releasesTotal, setReleasesTotal] = useState(0);

  // Recent tab state
  const [recentTracks, setRecentTracks] = useState<RecentTrackItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [recentSearch, setRecentSearch] = useState('');
  const [recentPage, setRecentPage] = useState(1);
  const [recentTotalPages, setRecentTotalPages] = useState(1);
  const [recentTotal, setRecentTotal] = useState(0);

  // Reviews tab state
  const [reviews, setReviews] = useState<UserReviewItem[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  // Fetch summary
  const fetchSummary = useCallback(() => {
    if (!dbUser) return;
    authFetch('/api/music/my/summary')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setSummary(data);
        }
      })
      .catch((err) => console.error('Error fetching library summary:', err));
  }, [dbUser, authFetch]);

  // Fetch favorite tracks
  const fetchFavoriteTracks = useCallback(() => {
    if (!dbUser) {
      setLoadingTracks(false);
      return;
    }
    setLoadingTracks(true);
    const params = new URLSearchParams({
      page: String(tracksPage),
      limit: '30',
      sort: tracksSort,
    });
    if (tracksSearch.trim()) {
      params.append('q', tracksSearch.trim());
    }

    authFetch(`/api/music/my/tracks?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { tracks: [], pagination: { total: 0, totalPages: 1 } }))
      .then((data) => {
        setTracks(data.tracks || []);
        setTracksTotal(data.pagination?.total || 0);
        setTracksTotalPages(data.pagination?.totalPages || 1);
      })
      .catch((err) => console.error('Error fetching favorite tracks:', err))
      .finally(() => setLoadingTracks(false));
  }, [dbUser, authFetch, tracksPage, tracksSort, tracksSearch]);

  // Fetch favorite releases
  const fetchFavoriteReleases = useCallback(() => {
    if (!dbUser) {
      setLoadingReleases(false);
      return;
    }
    setLoadingReleases(true);
    const params = new URLSearchParams({
      page: String(releasesPage),
      limit: '24',
      sort: releasesSort,
      type: releasesType,
    });
    if (releasesSearch.trim()) {
      params.append('q', releasesSearch.trim());
    }

    authFetch(`/api/music/my/releases?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { releases: [], pagination: { total: 0, totalPages: 1 } }))
      .then((data) => {
        setReleases(data.releases || []);
        setReleasesTotal(data.pagination?.total || 0);
        setReleasesTotalPages(data.pagination?.totalPages || 1);
      })
      .catch((err) => console.error('Error fetching favorite releases:', err))
      .finally(() => setLoadingReleases(false));
  }, [dbUser, authFetch, releasesPage, releasesSort, releasesType, releasesSearch]);

  // Fetch recent tracks
  const fetchRecentTracks = useCallback(() => {
    if (!dbUser) {
      setLoadingRecent(false);
      return;
    }
    setLoadingRecent(true);
    const params = new URLSearchParams({
      page: String(recentPage),
      limit: '30',
    });
    if (recentSearch.trim()) {
      params.append('q', recentSearch.trim());
    }

    authFetch(`/api/music/my/recent?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { tracks: [], pagination: { total: 0, totalPages: 1 } }))
      .then((data) => {
        setRecentTracks(data.tracks || []);
        setRecentTotal(data.pagination?.total || 0);
        setRecentTotalPages(data.pagination?.totalPages || 1);
      })
      .catch((err) => console.error('Error fetching recent tracks:', err))
      .finally(() => setLoadingRecent(false));
  }, [dbUser, authFetch, recentPage, recentSearch]);

  // Fetch user reviews
  const fetchUserReviews = useCallback(() => {
    if (!dbUser) {
      setLoadingReviews(false);
      return;
    }
    setLoadingReviews(true);
    authFetch('/api/music/reviews/my')
      .then((res) => (res.ok ? res.json() : { reviews: [] }))
      .then((data) => {
        setReviews(data.reviews || []);
      })
      .catch((err) => console.error('Error fetching user reviews:', err))
      .finally(() => setLoadingReviews(false));
  }, [dbUser, authFetch]);

  // Initial and reactive loads
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (activeTab === 'tracks') fetchFavoriteTracks();
    if (activeTab === 'releases') fetchFavoriteReleases();
    if (activeTab === 'recent') fetchRecentTracks();
    if (activeTab === 'reviews') fetchUserReviews();
  }, [activeTab, fetchFavoriteTracks, fetchFavoriteReleases, fetchRecentTracks, fetchUserReviews]);

  // Global event listeners to keep UI synchronized in real-time
  useEffect(() => {
    const handleFavTrackChanged = (e: any) => {
      const { trackId, isFavorite } = e.detail || {};
      if (trackId) {
        setTracks((prev) => {
          if (!isFavorite) {
            return prev.filter((t) => t.id !== trackId);
          }
          return prev.map((t) => (t.id === trackId ? { ...t, isFavorite } : t));
        });
        setRecentTracks((prev) =>
          prev.map((t) => (t.id === trackId ? { ...t, isFavorite } : t))
        );
        fetchSummary();
      }
    };

    const handleFavReleaseChanged = (e: any) => {
      const { releaseId, isFavorite } = e.detail || {};
      if (releaseId) {
        setReleases((prev) => {
          if (!isFavorite) {
            return prev.filter((r) => r.id !== releaseId);
          }
          return prev.map((r) => (r.id === releaseId ? { ...r, isFavorite } : r));
        });
        fetchSummary();
      }
    };

    window.addEventListener('music:favorite_track_changed', handleFavTrackChanged);
    window.addEventListener('music:favorite_release_changed', handleFavReleaseChanged);
    return () => {
      window.removeEventListener('music:favorite_track_changed', handleFavTrackChanged);
      window.removeEventListener('music:favorite_release_changed', handleFavReleaseChanged);
    };
  }, [fetchSummary]);

  // Toggle favorite for a track from list
  const handleRemoveFavoriteTrack = async (trk: Track) => {
    if (!dbUser) return;
    // Optimistic removal from favorite tracks list
    setTracks((prev) => prev.filter((t) => t.id !== trk.id));
    setTracksTotal((prev) => Math.max(0, prev - 1));
    setRecentTracks((prev) =>
      prev.map((t) => (t.id === trk.id ? { ...t, isFavorite: false } : t))
    );

    window.dispatchEvent(
      new CustomEvent('music:favorite_track_changed', {
        detail: { trackId: trk.id, isFavorite: false },
      })
    );

    try {
      await authFetch(`/api/music/my/tracks/${trk.id}`, { method: 'DELETE' });
      fetchSummary();
    } catch {
      fetchFavoriteTracks();
    }
  };

  // Toggle favorite for a track from recent list
  const handleToggleRecentTrackFavorite = async (trk: RecentTrackItem) => {
    if (!dbUser) return;
    const nextFav = !trk.isFavorite;
    setRecentTracks((prev) =>
      prev.map((t) => (t.id === trk.id ? { ...t, isFavorite: nextFav } : t))
    );

    window.dispatchEvent(
      new CustomEvent('music:favorite_track_changed', {
        detail: { trackId: trk.id, isFavorite: nextFav },
      })
    );

    try {
      await authFetch(`/api/music/my/tracks/${trk.id}`, {
        method: nextFav ? 'POST' : 'DELETE',
      });
      fetchSummary();
      if (activeTab === 'tracks') {
        fetchFavoriteTracks();
      }
    } catch {
      fetchRecentTracks();
    }
  };

  // Toggle favorite for release
  const handleRemoveFavoriteRelease = async (releaseId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dbUser) return;
    setReleases((prev) => prev.filter((r) => r.id !== releaseId));
    setReleasesTotal((prev) => Math.max(0, prev - 1));

    window.dispatchEvent(
      new CustomEvent('music:favorite_release_changed', {
        detail: { releaseId, isFavorite: false },
      })
    );

    try {
      await authFetch(`/api/music/my/releases/${releaseId}`, { method: 'DELETE' });
      fetchSummary();
    } catch {
      fetchFavoriteReleases();
    }
  };

  // Play entire list of tracks
  const handlePlayAllTracks = (trackList: Track[], shuffle: boolean = false) => {
    if (trackList.length === 0) return;
    const queueToPlay = shuffle ? [...trackList].sort(() => Math.random() - 0.5) : trackList;
    playTrack(queueToPlay[0], queueToPlay);
  };

  // Format seconds to mm:ss
  const formatDuration = (secs?: number | null) => {
    if (!secs || isNaN(secs) || secs <= 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Format relative time (e.g. 5 минут назад, вчера)
  const formatRelativeTime = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24 && date.getDate() === now.getDate()) {
      return `сегодня в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth()) {
      return `вчера в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  // Format listening hours
  const formatListeningHours = (totalSecs: number) => {
    if (!totalSecs || totalSecs <= 0) return '0 мин';
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    if (hours > 0) {
      return `${hours} ч ${mins > 0 ? `${mins} м` : ''}`;
    }
    return `${mins} мин`;
  };

  // Score color badge
  const getScoreColorClass = (score: number) => {
    if (score >= 85) return 'text-purple-300 bg-purple-500/20 border-purple-500/40';
    if (score >= 70) return 'text-cyan-300 bg-cyan-500/20 border-cyan-500/40';
    if (score >= 50) return 'text-amber-300 bg-amber-500/20 border-amber-500/40';
    return 'text-rose-300 bg-rose-500/20 border-rose-500/40';
  };

  return (
    <div className="space-y-6 pb-24 max-w-7xl mx-auto px-2 sm:px-4">
      <MusicNav activeTab="library" />

      {/* Hero Header */}
      <div className="relative overflow-hidden p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-[#130D35] via-[#101432] to-[#0A0D20] border border-[#261E58] shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-600/30 border border-purple-400/30 shrink-0">
                <Library className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
                МОЯ МУЗЫКА
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
              Ваша личная медиатека: любимые треки, сохранённые альбомы, история воспроизведений и оценки релизов.
            </p>
          </div>

          {/* Quick Stats Grid */}
          {dbUser && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 shrink-0">
              <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-slate-400 font-semibold">
                  <Heart className="w-3 h-3 text-rose-400" />
                  <span>Треки</span>
                </div>
                <div className="text-lg font-black text-white font-mono mt-0.5">
                  {summary.favoriteTracksCount}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-slate-400 font-semibold">
                  <Disc className="w-3 h-3 text-purple-400" />
                  <span>Релизы</span>
                </div>
                <div className="text-lg font-black text-white font-mono mt-0.5">
                  {summary.favoriteReleasesCount}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-slate-400 font-semibold">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  <span>История</span>
                </div>
                <div className="text-lg font-black text-white font-mono mt-0.5">
                  {summary.recentTracksCount}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-slate-400 font-semibold">
                  <Headphones className="w-3 h-3 text-indigo-400" />
                  <span>Время</span>
                </div>
                <div className="text-lg font-black text-white font-mono mt-0.5 truncate" title={`${summary.totalListeningSeconds} секунд`}>
                  {formatListeningHours(summary.totalListeningSeconds)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {!dbUser ? (
        <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-4 shadow-xl">
          <Library className="w-12 h-12 text-purple-400 mx-auto opacity-70" />
          <h3 className="text-base font-bold text-white font-mono">Авторизуйтесь для доступа к медиатеке</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Войдите в свой аккаунт Dodik Tracker, чтобы сохранять любимые треки и релизы, возвращаться к истории прослушиваний и ставить рецензии.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] overflow-x-auto custom-scrollbar">
            <button
              onClick={() => setActiveTab('tracks')}
              className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                activeTab === 'tracks'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${activeTab === 'tracks' ? 'fill-current' : ''}`} />
              <span>Любимые треки ({summary.favoriteTracksCount})</span>
            </button>

            <button
              onClick={() => setActiveTab('releases')}
              className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                activeTab === 'releases'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Disc className="w-3.5 h-3.5" />
              <span>Избранные релизы ({summary.favoriteReleasesCount})</span>
            </button>

            <button
              onClick={() => setActiveTab('recent')}
              className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                activeTab === 'recent'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Недавно слушал ({summary.recentTracksCount})</span>
            </button>

            <button
              onClick={() => setActiveTab('reviews')}
              className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                activeTab === 'reviews'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Star className="w-3.5 h-3.5" />
              <span>Мои оценки ({summary.reviewsCount})</span>
            </button>
          </div>

          {/* TAB 1: FAVORITE TRACKS */}
          {activeTab === 'tracks' && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => handlePlayAllTracks(tracks, false)}
                    disabled={tracks.length === 0}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-mono text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-600/20 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Слушать всё</span>
                  </button>

                  <button
                    onClick={() => handlePlayAllTracks(tracks, true)}
                    disabled={tracks.length === 0}
                    className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white border border-slate-700/60 transition-all cursor-pointer"
                    title="Перемешать и слушать"
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  {/* Search input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Поиск по названию или исполнителю..."
                      value={tracksSearch}
                      onChange={(e) => {
                        setTracksSearch(e.target.value);
                        setTracksPage(1);
                      }}
                      className="w-full sm:w-64 pl-8 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  {/* Sort dropdown */}
                  <select
                    value={tracksSort}
                    onChange={(e) => {
                      setTracksSort(e.target.value as any);
                      setTracksPage(1);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="recent_added">Сначала новые добавленные</option>
                    <option value="title_asc">По названию (А-Я)</option>
                    <option value="popular">По популярности</option>
                    <option value="duration">По длительности</option>
                  </select>
                </div>
              </div>

              {/* Tracks List */}
              {loadingTracks ? (
                <div className="py-20 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                  <span className="text-xs font-mono font-semibold">Загрузка любимых треков...</span>
                </div>
              ) : tracks.length === 0 ? (
                <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-4">
                  <Heart className="w-12 h-12 text-rose-500/40 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white font-mono">
                      {tracksSearch ? 'Ничего не найдено' : 'У вас пока нет любимых треков'}
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      {tracksSearch
                        ? 'Попробуйте изменить поисковый запрос.'
                        : 'Нажимайте на сердечко у любых треков в релизах или в плеере, чтобы сохранить их в свою коллекцию.'}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/music/releases')}
                    className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all cursor-pointer inline-block"
                  >
                    Перейти в каталог музыки
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {tracks.map((trk, index) => {
                    const isCurrent = currentTrack?.id === trk.id;
                    const isCurrentPlaying = isCurrent && isPlaying;

                    return (
                      <div
                        key={trk.id}
                        className={`group p-3 sm:p-4 rounded-2xl border transition-all flex items-center gap-3 sm:gap-4 ${
                          isCurrent
                            ? 'bg-purple-950/30 border-purple-500/40 shadow-lg shadow-purple-900/10'
                            : 'bg-[#0B0D20] hover:bg-[#121630] border-[#1E2442]/80'
                        }`}
                      >
                        {/* Play/Pause Button */}
                        <button
                          onClick={() => {
                            if (isCurrent) {
                              togglePlayPause();
                            } else {
                              playTrack(trk, tracks);
                            }
                          }}
                          className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-purple-600 text-slate-300 hover:text-white flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-md"
                        >
                          {isCurrentPlaying ? (
                            <Pause className="w-4 h-4 fill-current text-purple-400 group-hover:text-white" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5 text-slate-400 group-hover:text-white" />
                          )}
                        </button>

                        {/* Cover Image */}
                        <div
                          onClick={() => {
                            if (trk.releaseSlug) navigate(`/music/release/${trk.releaseSlug}`);
                            else if (trk.releaseId) navigate(`/music/release/${trk.releaseId}`);
                          }}
                          className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden shrink-0 cursor-pointer border border-slate-700/50 hover:scale-105 transition-transform"
                        >
                          {trk.releaseCover ? (
                            <img src={trk.releaseCover} alt={trk.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-purple-950/40 text-purple-400">
                              <Music2 className="w-4 h-4" />
                            </div>
                          )}
                        </div>

                        {/* Title & Artist */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              onClick={() => {
                                if (isCurrent) togglePlayPause();
                                else playTrack(trk, tracks);
                              }}
                              className={`text-xs sm:text-sm font-bold truncate cursor-pointer hover:underline ${
                                isCurrent ? 'text-purple-300' : 'text-white'
                              }`}
                            >
                              {trk.title}
                            </span>
                            {trk.explicit && (
                              <span className="px-1.5 py-0.2 text-[9px] font-black rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                                18+
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-400 truncate mt-0.5">
                            <span
                              onClick={() => {
                                if (trk.artistSlug) navigate(`/music/artist/${trk.artistSlug}`);
                              }}
                              className="hover:text-purple-300 hover:underline cursor-pointer"
                            >
                              {trk.artistName || 'Исполнитель'}
                            </span>
                            {trk.releaseTitle && (
                              <>
                                <span className="text-slate-600">·</span>
                                <span
                                  onClick={() => {
                                    if (trk.releaseSlug) navigate(`/music/release/${trk.releaseSlug}`);
                                    else if (trk.releaseId) navigate(`/music/release/${trk.releaseId}`);
                                  }}
                                  className="hover:text-purple-300 hover:underline cursor-pointer truncate hidden sm:inline"
                                >
                                  {trk.releaseTitle}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Listen counter */}
                        {trk.listenCount !== undefined && trk.listenCount > 0 && (
                          <div className="hidden md:flex items-center gap-1 text-[11px] font-mono text-purple-300/80 shrink-0">
                            <Headphones className="w-3.5 h-3.5 text-purple-400" />
                            <span>{trk.listenCount.toLocaleString('ru-RU')}</span>
                          </div>
                        )}

                        {/* Duration */}
                        <div className="text-xs font-mono text-slate-400 w-12 text-right shrink-0">
                          {formatDuration(trk.duration)}
                        </div>

                        {/* Favorite button */}
                        <button
                          onClick={() => handleRemoveFavoriteTrack(trk)}
                          className="p-2 rounded-xl text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-all cursor-pointer shrink-0"
                          title="Удалить из любимых"
                        >
                          <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
                        </button>
                      </div>
                    );
                  })}

                  {/* Pagination */}
                  {tracksTotalPages > 1 && (
                    <div className="pt-4 flex items-center justify-center gap-2">
                      <button
                        onClick={() => setTracksPage((p) => Math.max(1, p - 1))}
                        disabled={tracksPage <= 1}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 disabled:opacity-40 text-xs font-mono text-white cursor-pointer"
                      >
                        Назад
                      </button>
                      <span className="text-xs font-mono text-slate-400">
                        Страница {tracksPage} из {tracksTotalPages}
                      </span>
                      <button
                        onClick={() => setTracksPage((p) => Math.min(tracksTotalPages, p + 1))}
                        disabled={tracksPage >= tracksTotalPages}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 disabled:opacity-40 text-xs font-mono text-white cursor-pointer"
                      >
                        Вперёд
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: FAVORITE RELEASES */}
          {activeTab === 'releases' && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
                {/* Type filters */}
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto">
                  {(['ALL', 'ALBUM', 'EP', 'SINGLE'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setReleasesType(t);
                        setReleasesPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer shrink-0 ${
                        releasesType === t
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t === 'ALL' ? 'Все' : t === 'ALBUM' ? 'Альбомы' : t === 'EP' ? 'EP' : 'Синглы'}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  {/* Search input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Поиск по релизу или автору..."
                      value={releasesSearch}
                      onChange={(e) => {
                        setReleasesSearch(e.target.value);
                        setReleasesPage(1);
                      }}
                      className="w-full sm:w-64 pl-8 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  {/* Sort dropdown */}
                  <select
                    value={releasesSort}
                    onChange={(e) => {
                      setReleasesSort(e.target.value as any);
                      setReleasesPage(1);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="recent_added">Сначала новые добавленные</option>
                    <option value="release_date_desc">По дате выхода</option>
                    <option value="popular">По прослушиваниям</option>
                    <option value="rating">По оценке сообщества</option>
                    <option value="title_asc">По названию (А-Я)</option>
                  </select>
                </div>
              </div>

              {/* Releases Grid */}
              {loadingReleases ? (
                <div className="py-20 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                  <span className="text-xs font-mono font-semibold">Загрузка избранных релизов...</span>
                </div>
              ) : releases.length === 0 ? (
                <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-4">
                  <Disc className="w-12 h-12 text-purple-400/40 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white font-mono">
                      {releasesSearch ? 'Ничего не найдено' : 'У вас пока нет сохранённых релизов'}
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      {releasesSearch
                        ? 'Попробуйте изменить параметры поиска или фильтр типа.'
                        : 'Нажимайте кнопку «В избранное» на страницах альбомов и синглов, чтобы сохранить их в медиатеку.'}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/music/releases')}
                    className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all cursor-pointer inline-block"
                  >
                    Каталог релизов
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {releases.map((rel) => (
                    <div
                      key={rel.id}
                      onClick={() => navigate(`/music/release/${rel.slug || rel.id}`)}
                      className="group p-3 rounded-2xl bg-[#0B0D20] hover:bg-[#121632] border border-[#1E2442] hover:border-purple-500/40 transition-all cursor-pointer flex flex-col justify-between relative shadow-lg"
                    >
                      {/* Cover */}
                      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                        {rel.cover ? (
                          <img
                            src={rel.cover}
                            alt={rel.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-950/40 to-slate-900 text-purple-400">
                            <Disc className="w-10 h-10 opacity-60" />
                          </div>
                        )}

                        {/* Top Badges */}
                        <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
                          <span className="px-2 py-0.5 text-[9px] font-black tracking-wider rounded-md bg-black/70 backdrop-blur-md text-white border border-white/20 uppercase">
                            {rel.type}
                          </span>

                          {/* Quick Remove Favorite Button */}
                          <button
                            onClick={(e) => handleRemoveFavoriteRelease(rel.id, e)}
                            className="p-1.5 rounded-lg bg-black/70 hover:bg-rose-600/80 backdrop-blur-md text-rose-400 hover:text-white transition-all cursor-pointer shadow-md"
                            title="Удалить из избранного"
                          >
                            <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                          </button>
                        </div>

                        {/* Community score badge */}
                        {rel.avgScore > 0 && (
                          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-purple-300 border border-purple-500/40 text-[10px] font-mono font-bold">
                            ★ {rel.avgScore.toFixed(1)}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="mt-2.5 space-y-1">
                        <h4 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-purple-300 transition-colors" title={rel.title}>
                          {rel.title}
                        </h4>

                        <p className="text-[11px] text-slate-400 truncate hover:text-slate-200">
                          {rel.stageName}
                        </p>

                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                          <span>{rel.releaseDate ? rel.releaseDate.substring(0, 4) : ''}</span>
                          <span>{rel.tracksCount} трек.</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {releasesTotalPages > 1 && (
                <div className="pt-4 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setReleasesPage((p) => Math.max(1, p - 1))}
                    disabled={releasesPage <= 1}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 disabled:opacity-40 text-xs font-mono text-white cursor-pointer"
                  >
                    Назад
                  </button>
                  <span className="text-xs font-mono text-slate-400">
                    Страница {releasesPage} из {releasesTotalPages}
                  </span>
                  <button
                    onClick={() => setReleasesPage((p) => Math.min(releasesTotalPages, p + 1))}
                    disabled={releasesPage >= releasesTotalPages}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 disabled:opacity-40 text-xs font-mono text-white cursor-pointer"
                  >
                    Вперёд
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RECENTLY PLAYED */}
          {activeTab === 'recent' && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePlayAllTracks(recentTracks, false)}
                    disabled={recentTracks.length === 0}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-mono text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-600/20 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Слушать недавние</span>
                  </button>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Поиск по истории..."
                    value={recentSearch}
                    onChange={(e) => {
                      setRecentSearch(e.target.value);
                      setRecentPage(1);
                    }}
                    className="w-full sm:w-64 pl-8 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Recent Tracks List */}
              {loadingRecent ? (
                <div className="py-20 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                  <span className="text-xs font-mono font-semibold">Загрузка истории прослушиваний...</span>
                </div>
              ) : recentTracks.length === 0 ? (
                <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-4">
                  <Clock className="w-12 h-12 text-cyan-400/40 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white font-mono">
                      {recentSearch ? 'Ничего не найдено' : 'История прослушиваний пока пуста'}
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Включайте треки в каталоге — они автоматически отобразятся здесь с датой последнего прослушивания.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/music/releases')}
                    className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all cursor-pointer inline-block"
                  >
                    Открыть каталог музыки
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentTracks.map((trk) => {
                    const isCurrent = currentTrack?.id === trk.id;
                    const isCurrentPlaying = isCurrent && isPlaying;

                    return (
                      <div
                        key={trk.id}
                        className={`group p-3 sm:p-4 rounded-2xl border transition-all flex items-center gap-3 sm:gap-4 ${
                          isCurrent
                            ? 'bg-purple-950/30 border-purple-500/40 shadow-lg shadow-purple-900/10'
                            : 'bg-[#0B0D20] hover:bg-[#121630] border-[#1E2442]/80'
                        }`}
                      >
                        {/* Play button */}
                        <button
                          onClick={() => {
                            if (isCurrent) {
                              togglePlayPause();
                            } else {
                              playTrack(trk, recentTracks);
                            }
                          }}
                          className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-purple-600 text-slate-300 hover:text-white flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-md"
                        >
                          {isCurrentPlaying ? (
                            <Pause className="w-4 h-4 fill-current text-purple-400 group-hover:text-white" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5 text-slate-400 group-hover:text-white" />
                          )}
                        </button>

                        {/* Cover Image */}
                        <div
                          onClick={() => {
                            if (trk.releaseSlug) navigate(`/music/release/${trk.releaseSlug}`);
                            else if (trk.releaseId) navigate(`/music/release/${trk.releaseId}`);
                          }}
                          className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden shrink-0 cursor-pointer border border-slate-700/50 hover:scale-105 transition-transform"
                        >
                          {trk.releaseCover ? (
                            <img src={trk.releaseCover} alt={trk.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-purple-950/40 text-purple-400">
                              <Music2 className="w-4 h-4" />
                            </div>
                          )}
                        </div>

                        {/* Title & Artist */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              onClick={() => {
                                if (isCurrent) togglePlayPause();
                                else playTrack(trk, recentTracks);
                              }}
                              className={`text-xs sm:text-sm font-bold truncate cursor-pointer hover:underline ${
                                isCurrent ? 'text-purple-300' : 'text-white'
                              }`}
                            >
                              {trk.title}
                            </span>
                            {trk.explicit && (
                              <span className="px-1.5 py-0.2 text-[9px] font-black rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                                18+
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-400 truncate mt-0.5">
                            <span
                              onClick={() => {
                                if (trk.artistSlug) navigate(`/music/artist/${trk.artistSlug}`);
                              }}
                              className="hover:text-purple-300 hover:underline cursor-pointer"
                            >
                              {trk.artistName || 'Исполнитель'}
                            </span>
                            {trk.releaseTitle && (
                              <>
                                <span className="text-slate-600">·</span>
                                <span
                                  onClick={() => {
                                    if (trk.releaseSlug) navigate(`/music/release/${trk.releaseSlug}`);
                                    else if (trk.releaseId) navigate(`/music/release/${trk.releaseId}`);
                                  }}
                                  className="hover:text-purple-300 hover:underline cursor-pointer truncate hidden sm:inline"
                                >
                                  {trk.releaseTitle}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Last Listened Date Badge */}
                        <div className="flex flex-col items-end shrink-0 text-right">
                          <span className="text-xs font-mono text-purple-300 flex items-center gap-1 font-medium">
                            <Clock className="w-3 h-3 text-purple-400" />
                            {formatRelativeTime(trk.lastListenedAt)}
                          </span>
                          {trk.userListenCount && trk.userListenCount > 1 && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              прослушан {trk.userListenCount} раз
                            </span>
                          )}
                        </div>

                        {/* Duration */}
                        <div className="text-xs font-mono text-slate-400 w-10 text-right shrink-0 hidden sm:block">
                          {formatDuration(trk.duration)}
                        </div>

                        {/* Favorite button (adds/removes to favorites) */}
                        <button
                          onClick={() => handleToggleRecentTrackFavorite(trk)}
                          className={`p-2 rounded-xl transition-all cursor-pointer shrink-0 ${
                            trk.isFavorite
                              ? 'text-rose-400 bg-rose-500/15 border border-rose-500/30'
                              : 'text-slate-500 hover:text-rose-400 hover:bg-slate-800'
                          }`}
                          title={trk.isFavorite ? 'Удалить из любимых' : 'Добавить в любимые'}
                        >
                          <Heart className={`w-4 h-4 ${trk.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                        </button>
                      </div>
                    );
                  })}

                  {/* Pagination */}
                  {recentTotalPages > 1 && (
                    <div className="pt-4 flex items-center justify-center gap-2">
                      <button
                        onClick={() => setRecentPage((p) => Math.max(1, p - 1))}
                        disabled={recentPage <= 1}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 disabled:opacity-40 text-xs font-mono text-white cursor-pointer"
                      >
                        Назад
                      </button>
                      <span className="text-xs font-mono text-slate-400">
                        Страница {recentPage} из {recentTotalPages}
                      </span>
                      <button
                        onClick={() => setRecentPage((p) => Math.min(recentTotalPages, p + 1))}
                        disabled={recentPage >= recentTotalPages}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 disabled:opacity-40 text-xs font-mono text-white cursor-pointer"
                      >
                        Вперёд
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MY REVIEWS */}
          {activeTab === 'reviews' && (
            <div className="space-y-4">
              {loadingReviews ? (
                <div className="py-20 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                  <span className="text-xs font-mono font-semibold">Загрузка ваших рецензий...</span>
                </div>
              ) : reviews.length === 0 ? (
                <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-4">
                  <Star className="w-12 h-12 text-amber-400/40 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white font-mono">Вы еще не оценивали музыкальные релизы</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Слушайте альбомы и синглы в Dodik Tracker и ставьте свои 100-балльные оценки по 6 критериям качества.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/music/releases')}
                    className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all cursor-pointer inline-block"
                  >
                    Перейти в каталог музыки
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {reviews.map((rev) => (
                    <div
                      key={rev.id}
                      onClick={() => navigate(`/music/release/${rev.releaseSlug || rev.releaseId}`)}
                      className="p-5 rounded-2xl bg-[#0B0D20] hover:bg-[#121632] border border-[#1E2442] hover:border-purple-500/40 transition-all cursor-pointer space-y-4 shadow-lg"
                    >
                      {/* Release header info */}
                      <div className="flex items-center gap-3.5">
                        <div className="w-14 h-14 rounded-xl bg-slate-800 overflow-hidden shrink-0 border border-slate-700/50">
                          {rev.releaseCover ? (
                            <img src={rev.releaseCover} alt={rev.releaseTitle} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-purple-950/40 text-purple-400">
                              <Disc className="w-6 h-6" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-white truncate hover:text-purple-300">
                            {rev.releaseTitle}
                          </h4>
                          <p className="text-xs text-slate-400 truncate">
                            {rev.artistStageName}
                          </p>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {formatRelativeTime(rev.createdAt)}
                          </span>
                        </div>

                        {/* Overall score badge */}
                        <div className={`px-3 py-1.5 rounded-xl font-mono text-base font-black border shrink-0 ${getScoreColorClass(rev.overallScore)}`}>
                          {rev.overallScore.toFixed(1)}
                        </div>
                      </div>

                      {/* 6 Scores Grid */}
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
                        <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[9px] text-slate-500 block uppercase">Музыка</span>
                          <span className="text-xs font-mono font-bold text-white">{rev.musicScore}</span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[9px] text-slate-500 block uppercase">Вокал</span>
                          <span className="text-xs font-mono font-bold text-white">{rev.performanceScore}</span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[9px] text-slate-500 block uppercase">Звук</span>
                          <span className="text-xs font-mono font-bold text-white">{rev.productionScore}</span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[9px] text-slate-500 block uppercase">Текст</span>
                          <span className="text-xs font-mono font-bold text-white">{rev.lyricsScore}</span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[9px] text-slate-500 block uppercase">Вайб</span>
                          <span className="text-xs font-mono font-bold text-white">{rev.atmosphereScore}</span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                          <span className="text-[9px] text-slate-500 block uppercase">Концепт</span>
                          <span className="text-xs font-mono font-bold text-white">{rev.cohesionScore}</span>
                        </div>
                      </div>

                      {/* Review text if provided */}
                      {rev.text && (
                        <p className="text-xs text-slate-300 line-clamp-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60 italic">
                          «{rev.text}»
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
