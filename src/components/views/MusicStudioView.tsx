import React, { useState, useEffect, useCallback } from 'react';
import {
  Music,
  Plus,
  Disc,
  ListMusic,
  Star,
  FileText,
  BarChart3,
  Settings,
  Clock,
  CheckCircle,
  XCircle,
  Edit3,
  Trash2,
  Send,
  Eye,
  AlertCircle,
  Loader2,
  Save,
  Image as ImageIcon,
  Radio,
  User,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Headphones,
  Coins,
  TrendingUp,
  Award,
  ArrowUpDown,
  Calendar,
  Users,
  UserCheck,
  UserPlus,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Activity,
  Info,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

interface ArtistProfile {
  id: number;
  userId: number;
  stageName: string;
  slug: string;
  avatar: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Release {
  id: number;
  artistId: number;
  title: string;
  slug: string;
  type: 'SINGLE' | 'EP' | 'ALBUM';
  description: string | null;
  cover: string | null;
  releaseDate: string | null;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
  rejectionReason?: string | null;
  listenCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface ReleaseStatItem {
  id: number;
  artistId: number;
  title: string;
  slug: string;
  type: string;
  cover: string | null;
  status: string;
  releaseDate: string | null;
  listenCount: number;
  tracksCount: number;
  reviewsCount: number;
  createdAt: string;
  sharePct: number;
}

interface TrackStatItem {
  id: number;
  releaseId: number;
  releaseTitle: string;
  releaseCover?: string | null;
  title: string;
  slug: string | null;
  trackNumber: number;
  duration: number | null;
  listenCount: number;
  status: string;
  createdAt: string;
}

interface DailyStatItem {
  date: string;
  label: string;
  listens: number;
  uniqueListeners: number;
  newListeners: number;
  returningListeners: number;
}

interface DayOfWeekStatItem {
  dow: number;
  label: string;
  name: string;
  listens: number;
}

interface HourlyStatItem {
  hour: number;
  label: string;
  listens: number;
}

interface TopTrackItem {
  id: number;
  title: string;
  releaseTitle: string;
  listenCount: number;
}

interface PtsRewardItem {
  id: number;
  amount: number;
  type: string;
  source: string;
  referenceId: string;
  description: string;
  createdAt: string;
}

interface Track {
  id: number;
  releaseId: number;
  artistId: number;
  title: string;
  slug: string | null;
  trackNumber: number;
  audioFile: string;
  duration: number | null;
  lyrics: string | null;
  authorNote: string | null;
  explicit: boolean;
  status: string;
}

interface Review {
  id: number;
  releaseId: number;
  releaseTitle: string;
  overallScore: number;
  musicScore: number;
  performanceScore: number;
  productionScore: number;
  lyricsScore: number;
  atmosphereScore: number;
  cohesionScore: number;
  text: string | null;
  createdAt: string;
  username: string;
  userAvatar: string | null;
}

interface MusicianApplication {
  id: number;
  userId: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  message: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

type StudioTab = 'overview' | 'releases' | 'drafts' | 'reviews' | 'stats' | 'settings';

export const MusicStudioView: React.FC = () => {
  const { dbUser, authFetch } = useAuth();
  const { navigate } = useRouter();

  const [activeTab, setActiveTab] = useState<StudioTab>('overview');
  const [loading, setLoading] = useState(true);

  // Application state for non-musician users
  const [application, setApplication] = useState<MusicianApplication | null>(null);
  const [isMusician, setIsMusician] = useState(false);
  const [appMessage, setAppMessage] = useState('');
  const [submittingApp, setSubmittingApp] = useState(false);

  // Studio Data
  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [stats, setStats] = useState({
    totalReleases: 0,
    totalTracks: 0,
    totalReviews: 0,
    avgOverallScore: 0,
    draftsCount: 0,
    pendingCount: 0,
    publishedCount: 0,
    totalListens: 0,
    uniqueListeners: 0,
    avgListensPerListener: 0,
    periodListens: 0,
    periodUniqueListeners: 0,
    periodChangePct: null as number | null,
    periodChangeLabel: 'Нет данных для сравнения',
    ptsEarned: 0,
  });
  const [releases, setReleases] = useState<Release[]>([]);
  const [releasesStats, setReleasesStats] = useState<ReleaseStatItem[]>([]);
  const [tracksStats, setTracksStats] = useState<TrackStatItem[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStatItem[]>([]);
  const [topTrack, setTopTrack] = useState<TopTrackItem | null>(null);
  const [newListenersCount, setNewListenersCount] = useState(0);
  const [returningListenersCount, setReturningListenersCount] = useState(0);
  const [peakDay, setPeakDay] = useState('Недостаточно данных');
  const [peakHour, setPeakHour] = useState('Недостаточно данных');
  const [dayOfWeekStats, setDayOfWeekStats] = useState<DayOfWeekStatItem[]>([]);
  const [hourlyStats, setHourlyStats] = useState<HourlyStatItem[]>([]);
  const [chartMetric, setChartMetric] = useState<'listens' | 'unique' | 'cohort'>('listens');
  const [ptsRewardsHistory, setPtsRewardsHistory] = useState<PtsRewardItem[]>([]);
  const [statsDays, setStatsDays] = useState<7 | 30 | 90>(30);
  const [loadingChart, setLoadingChart] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<DailyStatItem | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);

  // Release Modal
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const [editingRelease, setEditingRelease] = useState<Release | null>(null);
  const [releaseForm, setReleaseForm] = useState({
    title: '',
    type: 'SINGLE' as 'SINGLE' | 'EP' | 'ALBUM',
    cover: '',
    description: '',
    releaseDate: '',
    status: 'DRAFT' as 'DRAFT' | 'PENDING_REVIEW',
  });
  const [savingRelease, setSavingRelease] = useState(false);

  // Tracks Manager Drawer
  const [selectedReleaseForTracks, setSelectedReleaseForTracks] = useState<Release | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [isTrackModalOpen, setIsTrackModalOpen] = useState(false);
  const [trackForm, setTrackForm] = useState({
    title: '',
    trackNumber: 1,
    audioFile: '',
    duration: '',
    lyrics: '',
    authorNote: '',
    explicit: false,
  });
  const [savingTrack, setSavingTrack] = useState(false);

  // Profile Settings Form
  const [profileForm, setProfileForm] = useState({
    stageName: '',
    slug: '',
    avatar: '',
    description: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Fetch Studio Data or Application Status
  const fetchStudioData = useCallback(async (days = 30) => {
    setLoading(true);
    try {
      // 1. Check Application
      const appRes = await authFetch('/api/music/applications/my');
      if (appRes.ok) {
        const appData = await appRes.json();
        setApplication(appData.application);
        setIsMusician(Boolean(appData.isMusician));
      }

      // 2. Fetch Studio Stats & Releases
      const statsRes = await authFetch(`/api/music/studio/stats?days=${days}`);
      if (statsRes.ok) {
        const data = await statsRes.json();
        setArtist(data.artist);
        setStats(data.stats || {
          totalReleases: 0,
          totalTracks: 0,
          totalReviews: 0,
          avgOverallScore: 0,
          draftsCount: 0,
          pendingCount: 0,
          publishedCount: 0,
          totalListens: 0,
          uniqueListeners: 0,
          avgListensPerListener: 0,
          periodListens: 0,
          periodUniqueListeners: 0,
          periodChangePct: null,
          periodChangeLabel: 'Нет данных для сравнения',
          ptsEarned: 0,
        });
        setReleases(data.recentReleases || []);
        setReleasesStats(data.releasesStats || []);
        setTracksStats(data.tracksStats || []);
        setDailyStats(data.dailyStats || []);
        if (data.topTrack !== undefined) setTopTrack(data.topTrack);
        if (data.newListenersCount !== undefined) setNewListenersCount(data.newListenersCount);
        if (data.returningListenersCount !== undefined) setReturningListenersCount(data.returningListenersCount);
        if (data.peakDay) setPeakDay(data.peakDay);
        if (data.peakHour) setPeakHour(data.peakHour);
        if (data.dayOfWeekStats) setDayOfWeekStats(data.dayOfWeekStats);
        if (data.hourlyStats) setHourlyStats(data.hourlyStats);
        setPtsRewardsHistory(data.ptsRewardsHistory || []);
        setReviews(data.reviews || []);

        if (data.artist) {
          setProfileForm({
            stageName: data.artist.stageName || '',
            slug: data.artist.slug || '',
            avatar: data.artist.avatar || '',
            description: data.artist.description || '',
          });
        }
      }
    } catch (err) {
      console.error('Error loading studio data:', err);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  const handleChangeStatsDays = async (days: 7 | 30 | 90) => {
    setStatsDays(days);
    setLoadingChart(true);
    try {
      const res = await authFetch(`/api/music/studio/stats?days=${days}`);
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
        if (data.dailyStats) setDailyStats(data.dailyStats);
        if (data.topTrack !== undefined) setTopTrack(data.topTrack);
        if (data.newListenersCount !== undefined) setNewListenersCount(data.newListenersCount);
        if (data.returningListenersCount !== undefined) setReturningListenersCount(data.returningListenersCount);
        if (data.peakDay) setPeakDay(data.peakDay);
        if (data.peakHour) setPeakHour(data.peakHour);
        if (data.dayOfWeekStats) setDayOfWeekStats(data.dayOfWeekStats);
        if (data.hourlyStats) setHourlyStats(data.hourlyStats);
        if (data.releasesStats) setReleasesStats(data.releasesStats);
        if (data.tracksStats) setTracksStats(data.tracksStats);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingChart(false);
    }
  };

  useEffect(() => {
    fetchStudioData(30);
  }, [fetchStudioData]);

  // Fetch all releases for Releases tab
  const fetchAllReleases = useCallback(async () => {
    try {
      const res = await authFetch('/api/music/releases?limit=100');
      if (res.ok) {
        const data = await res.json();
        setReleases(data.releases || []);
      }
    } catch (err) {
      console.error('Error fetching all releases:', err);
    }
  }, [authFetch]);

  useEffect(() => {
    if (activeTab === 'releases' || activeTab === 'drafts') {
      fetchAllReleases();
    }
  }, [activeTab, fetchAllReleases]);

  // Handle Application Submit
  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appMessage.trim()) return;

    setSubmittingApp(true);
    try {
      const res = await authFetch('/api/music/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: appMessage }),
      });

      if (res.ok) {
        const data = await res.json();
        setApplication(data.application);
        setAppMessage('');
      } else {
        const err = await res.json();
        alert(err.error || 'Ошибка при отправке заявки');
      }
    } catch (err) {
      alert('Не удалось отправить заявку');
    } finally {
      setSubmittingApp(false);
    }
  };

  // Open Create Release Page
  const handleOpenCreateRelease = () => {
    navigate('/music/studio/releases/new');
  };

  // Open Edit Release Page
  const handleOpenEditRelease = (rel: Release) => {
    navigate(`/music/studio/releases/edit/${rel.id}`);
  };

  // Save Release
  const handleSaveRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!releaseForm.title.trim()) return;

    setSavingRelease(true);
    try {
      const url = editingRelease
        ? `/api/music/releases/${editingRelease.id}`
        : '/api/music/releases';
      const method = editingRelease ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...releaseForm, artistId: artist?.id }),
      });

      if (res.ok) {
        setIsReleaseModalOpen(false);
        fetchStudioData();
        fetchAllReleases();
      } else {
        const err = await res.json();
        alert(err.error || 'Ошибка при сохранении релиза');
      }
    } catch (err) {
      alert('Ошибка соединения');
    } finally {
      setSavingRelease(false);
    }
  };

  // Send Release to Review
  const handleSendToReview = async (relId: number) => {
    try {
      const res = await authFetch(`/api/music/releases/${relId}/submit`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchStudioData();
        fetchAllReleases();
      } else {
        const err = await res.json();
        alert(err.error || 'Не удалось отправить на модерацию');
      }
    } catch (err) {
      alert('Ошибка запроса');
    }
  };

  // Delete Release
  const handleDeleteRelease = async (relId: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот релиз со всеми треками?')) return;
    try {
      const res = await authFetch(`/api/music/releases/${relId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchStudioData();
        fetchAllReleases();
      } else {
        const err = await res.json();
        alert(err.error || 'Не удалось удалить релиз');
      }
    } catch (err) {
      alert('Ошибка запроса');
    }
  };

  // Tracks Management
  const fetchReleaseTracks = async (rel: Release) => {
    setSelectedReleaseForTracks(rel);
    setLoadingTracks(true);
    try {
      const res = await authFetch(`/api/music/releases/${rel.id}`);
      if (res.ok) {
        const data = await res.json();
        setTracks(data.tracks || []);
      }
    } catch (err) {
      console.error('Error fetching tracks:', err);
    } finally {
      setLoadingTracks(false);
    }
  };

  const handleSaveTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReleaseForTracks || !trackForm.title.trim() || !trackForm.audioFile.trim()) return;

    setSavingTrack(true);
    try {
      const res = await authFetch(`/api/music/releases/${selectedReleaseForTracks.id}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...trackForm,
          duration: trackForm.duration ? parseInt(trackForm.duration, 10) : null,
        }),
      });

      if (res.ok) {
        setIsTrackModalOpen(false);
        setTrackForm({
          title: '',
          trackNumber: tracks.length + 2,
          audioFile: '',
          duration: '',
          lyrics: '',
          authorNote: '',
          explicit: false,
        });
        fetchReleaseTracks(selectedReleaseForTracks);
        fetchStudioData();
      } else {
        const err = await res.json();
        alert(err.error || 'Ошибка при добавлении трека');
      }
    } catch (err) {
      alert('Ошибка соединения');
    } finally {
      setSavingTrack(false);
    }
  };

  const handleDeleteTrack = async (trackId: number) => {
    if (!confirm('Удалить этот трек?')) return;
    try {
      const res = await authFetch(`/api/music/tracks/${trackId}`, { method: 'DELETE' });
      if (res.ok && selectedReleaseForTracks) {
        fetchReleaseTracks(selectedReleaseForTracks);
        fetchStudioData();
      }
    } catch (err) {
      alert('Ошибка при удалении трека');
    }
  };

  // Save Profile Settings
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.stageName.trim()) return;

    setSavingProfile(true);
    try {
      const url = artist ? `/api/music/artists/${artist.id}` : '/api/music/artists';
      const method = artist ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });

      if (res.ok) {
        alert('Профиль исполнителя успешно обновлён!');
        fetchStudioData();
      } else {
        const err = await res.json();
        alert(err.error || 'Не удалось сохранить профиль');
      }
    } catch (err) {
      alert('Ошибка соединения');
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <div className="py-28 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        <span className="text-xs font-mono font-semibold">Загрузка Студии Музыканта...</span>
      </div>
    );
  }

  // ==========================================
  // VIEW FOR NON-MUSICIAN USERS (APPLICATION FORM)
  // ==========================================
  if (!isMusician) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 pb-16">
        <div className="p-8 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-2xl text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#7C3AED] to-[#6366F1] text-white flex items-center justify-center mx-auto shadow-xl shadow-purple-600/30">
            <Music className="w-8 h-8" />
          </div>

          <div>
            <h1 className="text-2xl font-black text-white font-mono tracking-tight">
              Студия музыканта Dodik Tracker
            </h1>
            <p className="text-sm text-[#94A3B8] max-w-lg mx-auto mt-2 leading-relaxed">
              Получите статус авторского исполнителя, чтобы публиковать собственные альбомы, треки,
              тексты и получать независимые 100-балльные рецензии от сообщества.
            </p>
          </div>

          {/* APPLICATION STATUS DISPLAY */}
          {application ? (
            <div className="p-6 rounded-2xl bg-[#11152A] border border-[#1E2442] text-left space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#64748B] font-bold uppercase tracking-wider">
                  Статус вашей заявки
                </span>

                {application.status === 'PENDING' && (
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>На рассмотрении</span>
                  </span>
                )}
                {application.status === 'REJECTED' && (
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Отклонено</span>
                  </span>
                )}
              </div>

              {application.message && (
                <div className="text-xs text-[#CBD5E1] bg-[#0B0D20] p-3 rounded-xl border border-[#1E2442]">
                  {application.message}
                </div>
              )}

              {application.status === 'PENDING' && (
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Администрация рассматривает вашу заявку. После одобрения вы получите статус музыканта и доступ к инструментам публикации.
                </p>
              )}

              {application.status === 'REJECTED' && (
                <div className="space-y-3 pt-2">
                  <div className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 font-mono">
                    <strong>Причина отклонения:</strong> {application.rejectionReason || 'Информация не указана.'}
                  </div>
                  <p className="text-xs text-[#94A3B8]">
                    Вы можете подать обновлённую заявку с дополнительной информацией или ссылками.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {/* FORM TO SUBMIT NEW APPLICATION */}
          {(!application || application.status === 'REJECTED') && (
            <form onSubmit={handleApply} className="text-left space-y-4 pt-4 border-t border-[#1E2442]">
              <div className="space-y-2">
                <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Расскажите о своём творчестве / Ссылки на портфолио
                </label>
                <textarea
                  rows={4}
                  value={appMessage}
                  onChange={(e) => setAppMessage(e.target.value)}
                  placeholder="Укажите ваши соцсети, ссылки на SoundCloud/Bandcamp/Яндекс Музыку, либо кратко опишите жанр и опыт..."
                  className="w-full p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500 resize-none leading-relaxed"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submittingApp || !appMessage.trim()}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono text-xs font-bold transition-all shadow-xl shadow-purple-600/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submittingApp ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Подать заявку на статус музыканта</span>
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW FOR MUSICIAN / ADMIN USERS (FULL MUSIC STUDIO)
  // ==========================================
  return (
    <div className="space-y-6 pb-16">
      {/* Studio Banner & Artist Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          {artist?.avatar ? (
            <img
              src={artist.avatar}
              alt={artist.stageName}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-purple-500/40 shadow-xl"
            />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white font-black text-2xl font-mono flex items-center justify-center border-2 border-purple-500/40 shadow-xl">
              {artist?.stageName?.charAt(0).toUpperCase() || 'M'}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-white font-mono">
                {artist?.stageName || dbUser?.username}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>Исполнитель</span>
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] font-mono">
              dodik.me/artist/{artist?.slug || 'artist'}
            </p>
            {artist?.description && (
              <p className="text-xs text-[#CBD5E1] line-clamp-2 max-w-xl">
                {artist.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center shrink-0">
          {artist && (
            <button
              onClick={() => navigate(`/music/artist/${artist.slug || artist.id}`)}
              className="px-4 py-3 rounded-2xl bg-[#151932] hover:bg-[#1E2442] border border-[#1E2442] text-slate-200 font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
            >
              <Eye className="w-4 h-4 text-cyan-400" />
              <span>Публичная страница</span>
            </button>
          )}

          <button
            onClick={handleOpenCreateRelease}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono text-xs font-bold transition-all shadow-xl shadow-purple-600/30 flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Создать релиз</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] overflow-x-auto">
        {[
          { id: 'overview', label: 'Обзор', icon: BarChart3 },
          { id: 'releases', label: 'Релизы', icon: Disc, count: stats.totalReleases },
          { id: 'drafts', label: 'Черновики', icon: Edit3, count: stats.draftsCount },
          { id: 'reviews', label: 'Рецензии', icon: Star, count: stats.totalReviews },
          { id: 'stats', label: 'Статистика', icon: FileText },
          { id: 'settings', label: 'Профиль', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as StudioTab)}
              className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-[#94A3B8] hover:text-white hover:bg-[#11152A]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                    isActive ? 'bg-white/20 text-white' : 'bg-[#1E2442] text-purple-300'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Real Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1">
              <span className="text-[11px] font-mono text-[#64748B] font-bold flex items-center gap-1">
                <Headphones className="w-3.5 h-3.5 text-purple-400" /> Прослушивания
              </span>
              <div className="text-xl font-black text-white font-mono">{(stats.totalListens || 0).toLocaleString('ru-RU')}</div>
              <span className="text-[10px] text-[#94A3B8]">квалифицированных</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1">
              <span className="text-[11px] font-mono text-[#64748B] font-bold flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-indigo-400" /> Слушатели
              </span>
              <div className="text-xl font-black text-indigo-300 font-mono">{(stats.uniqueListeners || 0).toLocaleString('ru-RU')}</div>
              <span className="text-[10px] text-[#94A3B8]">уникальных</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1">
              <span className="text-[11px] font-mono text-[#64748B] font-bold flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-emerald-400" /> В среднем
              </span>
              <div className="text-xl font-black text-emerald-400 font-mono">{stats.avgListensPerListener || 0}</div>
              <span className="text-[10px] text-[#94A3B8]">на слушателя</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1">
              <span className="text-[11px] font-mono text-[#64748B] font-bold flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-amber-400" /> Награды PTS
              </span>
              <div className="text-xl font-black text-amber-400 font-mono">+{stats.ptsEarned || 0} PTS</div>
              <span className="text-[10px] text-[#94A3B8]">за музыку</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1">
              <span className="text-[11px] font-mono text-[#64748B] font-bold flex items-center gap-1">
                <Disc className="w-3.5 h-3.5 text-cyan-400" /> Релизы
              </span>
              <div className="text-xl font-black text-white font-mono">{stats.totalReleases}</div>
              <span className="text-[10px] text-[#94A3B8]">
                {stats.publishedCount} опубл. / {stats.draftsCount} черн.
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] space-y-1">
              <span className="text-[11px] font-mono text-[#64748B] font-bold flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-400" /> Ср. Оценка
              </span>
              <div className="text-xl font-black text-purple-400 font-mono">
                {stats.avgOverallScore > 0 ? `${stats.avgOverallScore}/100` : '—'}
              </div>
              <span className="text-[10px] text-[#94A3B8]">{stats.totalReviews} рецензий</span>
            </div>
          </div>

          {/* Recent Releases */}
          <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <Disc className="w-5 h-5 text-purple-400" />
                <span>Последние релизы</span>
              </h2>
              <button
                onClick={() => setActiveTab('releases')}
                className="text-xs font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
              >
                <span>Все релизы</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {releases.length === 0 ? (
              <div className="p-8 text-center bg-[#11152A] border border-[#1E2442] rounded-2xl space-y-2">
                <p className="text-xs text-[#94A3B8]">У вас пока нет созданных релизов</p>
                <button
                  onClick={handleOpenCreateRelease}
                  className="px-4 py-2 rounded-xl bg-purple-600 text-white font-mono text-xs font-bold cursor-pointer"
                >
                  Создать первый релиз
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {releases.map((rel) => (
                  <div
                    key={rel.id}
                    className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {rel.cover ? (
                        <img
                          src={rel.cover}
                          alt={rel.title}
                          className="w-12 h-12 rounded-xl object-cover border border-[#1E2442] shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-purple-900/40 text-purple-300 flex items-center justify-center shrink-0 border border-[#1E2442]">
                          <Disc className="w-6 h-6" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white truncate font-mono">{rel.title}</h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#1E2442] text-purple-300">
                            {rel.type}
                          </span>
                        </div>
                        <p className="text-xs text-[#64748B] font-mono">
                          Статус: {rel.status}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => fetchReleaseTracks(rel)}
                        className="px-3 py-1.5 rounded-xl bg-[#1E2442] text-xs font-mono text-white hover:bg-purple-600 transition-all cursor-pointer flex items-center gap-1"
                      >
                        <ListMusic className="w-3.5 h-3.5" />
                        <span>Треки</span>
                      </button>
                      <button
                        onClick={() => handleOpenEditRelease(rel)}
                        className="p-1.5 text-[#94A3B8] hover:text-white cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2 & 3: RELEASES / DRAFTS */}
      {(activeTab === 'releases' || activeTab === 'drafts') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white font-mono">
              {activeTab === 'drafts' ? 'Черновики релизов' : 'Все релизы'}
            </h2>
            <button
              onClick={handleOpenCreateRelease}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Новый релиз</span>
            </button>
          </div>

          {releases.filter(r => activeTab === 'drafts' ? r.status === 'DRAFT' : true).length === 0 ? (
            <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-3">
              <Disc className="w-10 h-10 text-purple-400 mx-auto" />
              <p className="text-sm font-semibold text-white">Релизов не найдено</p>
            </div>
          ) : (
            <div className="space-y-3">
              {releases
                .filter(r => activeTab === 'drafts' ? r.status === 'DRAFT' : true)
                .map((rel) => (
                  <div
                    key={rel.id}
                    className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#2E365C] transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {rel.cover ? (
                        <img
                          src={rel.cover}
                          alt={rel.title}
                          className="w-14 h-14 rounded-2xl object-cover border border-[#1E2442] shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-purple-900/40 text-purple-300 flex items-center justify-center shrink-0 border border-[#1E2442]">
                          <Disc className="w-7 h-7" />
                        </div>
                      )}

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-extrabold text-white font-mono truncate">{rel.title}</h3>
                          <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-[#11152A] border border-[#1E2442] text-purple-300">
                            {rel.type}
                          </span>

                          {/* Status Badge */}
                          {rel.status === 'DRAFT' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                              Черновик
                            </span>
                          )}
                          {rel.status === 'PENDING_REVIEW' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/15 border border-blue-500/30 text-blue-300">
                              На модерации
                            </span>
                          )}
                          {rel.status === 'PUBLISHED' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                              Опубликовано
                            </span>
                          )}
                          {rel.status === 'REJECTED' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 border border-rose-500/30 text-rose-300">
                              Отклонён
                            </span>
                          )}
                        </div>

                        {rel.description && (
                          <p className="text-xs text-[#94A3B8] line-clamp-1">{rel.description}</p>
                        )}

                        {rel.status === 'REJECTED' && rel.rejectionReason && (
                          <div className="mt-2 p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs font-mono text-rose-200">
                            <span className="text-rose-400 font-bold">Причина отклонения:</span> {rel.rejectionReason}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => fetchReleaseTracks(rel)}
                        className="px-3.5 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] hover:bg-purple-600 text-xs font-mono text-white transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <ListMusic className="w-4 h-4 text-purple-400" />
                        <span>Управление треками</span>
                      </button>

                      {(rel.status === 'DRAFT' || rel.status === 'REJECTED') && (
                        <button
                          onClick={() => handleSendToReview(rel.id)}
                          className="px-3 py-2 rounded-xl bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600 text-blue-300 hover:text-white text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1"
                          title="Отправить релиз на модерацию"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{rel.status === 'REJECTED' ? 'Повторно на модерацию' : 'На модерацию'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenEditRelease(rel)}
                        className="p-2 text-[#94A3B8] hover:text-white cursor-pointer"
                        title="Редактировать релиз"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteRelease(rel.id)}
                        className="p-2 text-[#94A3B8] hover:text-rose-400 cursor-pointer"
                        title="Удалить релиз"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: REVIEWS */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-white font-mono">
            Полученные 100-балльные рецензии
          </h2>

          {reviews.length === 0 ? (
            <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-2">
              <Star className="w-10 h-10 text-amber-400 mx-auto" />
              <p className="text-sm font-semibold text-white">Рецензий пока нет</p>
              <p className="text-xs text-[#94A3B8]">
                После публикации релизов слушатели смогут оставлять подробные 100-балльные оценки.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono font-bold text-white">@{rev.username}</span>
                      <span className="text-xs text-[#64748B]">на релиз «{rev.releaseTitle}»</span>
                    </div>

                    <div className="px-3 py-1 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono font-black text-sm">
                      {rev.overallScore}/100
                    </div>
                  </div>

                  {/* 6 criteria breakdown */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center font-mono text-[11px] bg-[#11152A] p-3 rounded-2xl border border-[#1E2442]">
                    <div><span className="text-[#64748B] block text-[9px]">МУЗЫКА</span><strong className="text-white">{rev.musicScore}</strong></div>
                    <div><span className="text-[#64748B] block text-[9px]">ИСПОЛНЕНИЕ</span><strong className="text-white">{rev.performanceScore}</strong></div>
                    <div><span className="text-[#64748B] block text-[9px]">ПРОДАКШН</span><strong className="text-white">{rev.productionScore}</strong></div>
                    <div><span className="text-[#64748B] block text-[9px]">ТЕКСТЫ</span><strong className="text-white">{rev.lyricsScore}</strong></div>
                    <div><span className="text-[#64748B] block text-[9px]">АТМОСФЕРА</span><strong className="text-white">{rev.atmosphereScore}</strong></div>
                    <div><span className="text-[#64748B] block text-[9px]">ЦЕЛОСТНОСТЬ</span><strong className="text-white">{rev.cohesionScore}</strong></div>
                  </div>

                  {rev.text && (
                    <p className="text-xs text-[#CBD5E1] leading-relaxed italic bg-[#11152A] p-3 rounded-xl border border-[#1E2442]">
                      "{rev.text}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: STATS */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Header & Period Switcher */}
          <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-bold text-white font-mono">Расширенная аналитика музыканта</h2>
              </div>
              <p className="text-xs text-[#94A3B8]">
                Реальные показатели прослушиваний из PostgreSQL. Авторские прослушивания исключены. Персональные данные слушателей защищены.
              </p>
            </div>

            {/* Time Period Selector */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#11152A] border border-[#1E2442] self-start sm:self-center">
              {[
                { label: '7 дней', value: 7 },
                { label: '30 дней', value: 30 },
                { label: '90 дней', value: 90 },
              ].map((p) => (
                <button
                  key={p.value}
                  onClick={() => handleChangeStatsDays(p.value as 7 | 30 | 90)}
                  disabled={loadingChart}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    statsDays === p.value
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 6 Key Metrics KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* 1. Всего прослушиваний */}
            <div className="p-4 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#64748B] font-bold uppercase tracking-wider">
                  Всего прослушиваний
                </span>
                <div className="p-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                  <Headphones className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-white font-mono">
                  {(stats.totalListens || 0).toLocaleString('ru-RU')}
                </div>
                <div className="text-[10px] text-purple-300 font-mono">
                  {stats.periodListens.toLocaleString('ru-RU')} за {statsDays} дн.
                </div>
              </div>
              {/* Period Comparison Badge */}
              <div className="pt-1 border-t border-[#1E2442]/60">
                {stats.periodChangePct !== null ? (
                  <div
                    className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                      stats.periodChangePct >= 0
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {stats.periodChangePct >= 0 ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    <span>{stats.periodChangeLabel}</span>
                  </div>
                ) : (
                  <span className="text-[10px] text-[#64748B] font-mono">
                    Нет данных для сравнения
                  </span>
                )}
              </div>
            </div>

            {/* 2. Уникальные слушатели */}
            <div className="p-4 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#64748B] font-bold uppercase tracking-wider">
                  Уникальные слушатели
                </span>
                <div className="p-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Users className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-indigo-300 font-mono">
                  {(stats.uniqueListeners || 0).toLocaleString('ru-RU')}
                </div>
                <div className="text-[10px] text-indigo-300/80 font-mono">
                  {stats.periodUniqueListeners.toLocaleString('ru-RU')} за {statsDays} дн.
                </div>
              </div>
              <div className="pt-1 border-t border-[#1E2442]/60 text-[10px] text-[#64748B] font-mono truncate">
                1 слушатель = 1 запись (все треки)
              </div>
            </div>

            {/* 3. Прослушиваний на слушателя */}
            <div className="p-4 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#64748B] font-bold uppercase tracking-wider">
                  В среднем на слушателя
                </span>
                <div className="p-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Activity className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-400 font-mono">
                  {stats.avgListensPerListener || 0}
                </div>
                <div className="text-[10px] text-emerald-300 font-mono">
                  треков на слушателя
                </div>
              </div>
              <div className="pt-1 border-t border-[#1E2442]/60 text-[10px] text-[#64748B] font-mono truncate">
                прослушивания ÷ слушатели
              </div>
            </div>

            {/* 4. Самый популярный трек */}
            <div className="p-4 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#64748B] font-bold uppercase tracking-wider">
                  Самый популярный трек
                </span>
                <div className="p-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Music className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <div className="text-sm font-bold text-white font-mono truncate" title={topTrack?.title || 'Нет данных'}>
                  {topTrack ? topTrack.title : 'Нет данных'}
                </div>
                <div className="text-[10px] text-cyan-300 font-mono truncate">
                  {topTrack ? `${topTrack.listenCount.toLocaleString('ru-RU')} просл.` : 'Нет прослушиваний'}
                </div>
              </div>
              <div className="pt-1 border-t border-[#1E2442]/60 text-[10px] text-[#64748B] font-mono truncate">
                {topTrack ? topTrack.releaseTitle : 'Каталог пуст'}
              </div>
            </div>

            {/* 5. Заработано PTS */}
            <div className="p-4 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#64748B] font-bold uppercase tracking-wider">
                  Заработано PTS
                </span>
                <div className="p-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Coins className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-amber-400 font-mono">
                  +{stats.ptsEarned || 0}
                </div>
                <div className="text-[10px] text-amber-300/80 font-mono">
                  награды за музыку
                </div>
              </div>
              <div className="pt-1 border-t border-[#1E2442]/60 text-[10px] text-[#64748B] font-mono truncate">
                1 PTS за 10 прослушиваний
              </div>
            </div>

            {/* 6. Каталог музыки */}
            <div className="p-4 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#64748B] font-bold uppercase tracking-wider">
                  Каталог музыки
                </span>
                <div className="p-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <Disc className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-white font-mono">
                  {stats.publishedCount} <span className="text-xs font-normal text-slate-400">релизов</span>
                </div>
                <div className="text-[10px] text-slate-300 font-mono">
                  {stats.totalTracks} опубликованных треков
                </div>
              </div>
              <div className="pt-1 border-t border-[#1E2442]/60 text-[10px] text-[#64748B] font-mono truncate">
                {stats.avgOverallScore > 0 ? `Ср. оценка ${stats.avgOverallScore}/100` : 'Без рецензий'}
              </div>
            </div>
          </div>

          {/* New vs Returning Listeners Cohort Card */}
          <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  <span>Структура аудитории за {statsDays} дней (Новые и возвращающиеся)</span>
                </h3>
                <p className="text-xs text-[#94A3B8]">
                  Разделение слушателей по истории взаимодействий с вашим каталогом без раскрытия персональных данных.
                </p>
              </div>

              <div className="px-3 py-1.5 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs font-mono text-slate-300 self-start sm:self-center">
                Всего активно за период: <strong className="text-white">{stats.periodUniqueListeners}</strong> слушателей
              </div>
            </div>

            {(() => {
              const activeCount = Math.max(1, newListenersCount + returningListenersCount);
              const newPct = Math.round((newListenersCount / activeCount) * 100);
              const retPct = Math.max(0, 100 - newPct);

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* New Listeners */}
                    <div className="p-4 rounded-2xl bg-[#11152A] border border-indigo-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-indigo-300 flex items-center gap-1.5">
                          <UserPlus className="w-4 h-4 text-indigo-400" />
                          <span>Новые слушатели</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-200 text-xs font-mono font-bold">
                          {newPct}%
                        </span>
                      </div>
                      <div className="text-3xl font-black text-white font-mono">
                        {newListenersCount.toLocaleString('ru-RU')}
                      </div>
                      <p className="text-[11px] text-[#94A3B8] font-mono">
                        Впервые прослушали треки данного автора за последние {statsDays} дней.
                      </p>
                    </div>

                    {/* Returning Listeners */}
                    <div className="p-4 rounded-2xl bg-[#11152A] border border-emerald-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-emerald-300 flex items-center gap-1.5">
                          <UserCheck className="w-4 h-4 text-emerald-400" />
                          <span>Возвращающиеся слушатели</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200 text-xs font-mono font-bold">
                          {retPct}%
                        </span>
                      </div>
                      <div className="text-3xl font-black text-white font-mono">
                        {returningListenersCount.toLocaleString('ru-RU')}
                      </div>
                      <p className="text-[11px] text-[#94A3B8] font-mono">
                        Слушали музыку автора до текущего периода и вернулись в последние {statsDays} дней.
                      </p>
                    </div>
                  </div>

                  {/* Segmented Dual Bar */}
                  <div className="space-y-1.5">
                    <div className="w-full h-3 rounded-full bg-[#080915] overflow-hidden flex border border-[#1E2442]">
                      <div
                        style={{ width: `${newPct}%` }}
                        className="bg-indigo-500 h-full transition-all"
                        title={`Новые: ${newPct}%`}
                      />
                      <div
                        style={{ width: `${retPct}%` }}
                        className="bg-emerald-500 h-full transition-all"
                        title={`Возвращающиеся: ${retPct}%`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#64748B]">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                        <span>Новые: {newListenersCount} ({newPct}%)</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        <span>Возвращающиеся: {returningListenersCount} ({retPct}%)</span>
                      </span>
                    </div>
                  </div>

                  {/* Transparency Notice */}
                  <div className="p-3 rounded-xl bg-[#080915]/60 border border-[#1E2442] flex items-start gap-2.5 text-[11px] text-[#94A3B8] font-mono">
                    <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <span>
                      Определение новых и возвращающихся слушателей основано на зафиксированных qualifying сессиях прослушивания. Пользователи идентифицируются по аккаунту или анонимной гостевой сессии, исключая автора.
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Interactive Dynamic Listening Chart with 3 Modes */}
          <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  <span>
                    Динамика за {statsDays} дней:{' '}
                    {chartMetric === 'listens'
                      ? 'Прослушивания'
                      : chartMetric === 'unique'
                      ? 'Уникальные слушатели'
                      : 'Новые и возвращающиеся'}
                  </span>
                </h3>
                <p className="text-xs text-[#94A3B8]">
                  Реальные данные за каждый календарный день. Дни без активности отображаются с нулевым значением.
                </p>
              </div>

              {/* Chart Metric Mode Switcher */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#11152A] border border-[#1E2442] self-start sm:self-center">
                <button
                  onClick={() => setChartMetric('listens')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    chartMetric === 'listens'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  Прослушивания
                </button>
                <button
                  onClick={() => setChartMetric('unique')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    chartMetric === 'unique'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  Уникальные
                </button>
                <button
                  onClick={() => setChartMetric('cohort')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    chartMetric === 'cohort'
                      ? 'bg-gradient-to-r from-indigo-600 to-emerald-600 text-white shadow-sm'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  Когорта
                </button>
              </div>
            </div>

            {/* Hover Tooltip Preview Bar */}
            {hoveredDay && (
              <div className="p-2.5 rounded-xl bg-[#11152A] border border-purple-500/30 flex items-center justify-between text-xs font-mono flex-wrap gap-2">
                <span className="text-slate-300 font-bold">{hoveredDay.label} ({hoveredDay.date}):</span>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span>Прослушиваний: <strong className="text-purple-300">{hoveredDay.listens}</strong></span>
                  <span>Уникальных: <strong className="text-indigo-300">{hoveredDay.uniqueListeners}</strong></span>
                  <span>Новых: <strong className="text-cyan-300">{hoveredDay.newListeners}</strong></span>
                  <span>Возвращающихся: <strong className="text-emerald-300">{hoveredDay.returningListeners}</strong></span>
                </div>
              </div>
            )}

            {loadingChart ? (
              <div className="h-48 flex items-center justify-center text-purple-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : dailyStats.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-[#94A3B8] font-mono">
                Нет данных за выбранный период
              </div>
            ) : (
              (() => {
                const values = dailyStats.map((d) =>
                  chartMetric === 'listens'
                    ? d.listens
                    : chartMetric === 'unique'
                    ? d.uniqueListeners
                    : d.uniqueListeners
                );
                const maxValue = Math.max(1, ...values);
                const totalInWindow = values.reduce((sum, v) => sum + v, 0);
                const avgInWindow = Math.round((totalInWindow / dailyStats.length) * 10) / 10;

                return (
                  <div className="space-y-4">
                    {/* Visual Bar Histogram */}
                    <div className="h-48 w-full flex items-end gap-1 sm:gap-2 pt-6 pb-2 px-2 bg-[#080915] rounded-2xl border border-[#1E2442]/50">
                      {dailyStats.map((item, idx) => {
                        const val =
                          chartMetric === 'listens'
                            ? item.listens
                            : chartMetric === 'unique'
                            ? item.uniqueListeners
                            : item.uniqueListeners;

                        const heightPct = Math.max(6, Math.round((val / maxValue) * 100));
                        const isHovered = hoveredDay?.date === item.date;

                        return (
                          <div
                            key={idx}
                            onMouseEnter={() => setHoveredDay(item)}
                            onMouseLeave={() => setHoveredDay(null)}
                            className="flex-1 h-full flex flex-col justify-end items-center group cursor-pointer relative"
                          >
                            {/* Hover tooltip overlay */}
                            <div className="absolute -top-10 bg-purple-950 border border-purple-500/40 text-purple-200 text-[10px] font-mono px-2.5 py-1 rounded-md pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 shadow-xl">
                              {item.label}:{' '}
                              {chartMetric === 'listens'
                                ? `${item.listens} просл.`
                                : chartMetric === 'unique'
                                ? `${item.uniqueListeners} слуш.`
                                : `${item.newListeners} нов. / ${item.returningListeners} возвр.`}
                            </div>

                            {/* Bar Rendering */}
                            {chartMetric === 'cohort' ? (
                              <div
                                style={{ height: `${heightPct}%` }}
                                className={`w-full max-w-[24px] rounded-t-md overflow-hidden flex flex-col-reverse transition-all ${
                                  isHovered ? 'scale-105 shadow-lg shadow-indigo-500/30' : ''
                                }`}
                              >
                                {val > 0 ? (
                                  <>
                                    <div
                                      style={{
                                        height: `${item.uniqueListeners > 0 ? (item.newListeners / item.uniqueListeners) * 100 : 0}%`,
                                      }}
                                      className="bg-indigo-500 w-full"
                                    />
                                    <div
                                      style={{
                                        height: `${item.uniqueListeners > 0 ? (item.returningListeners / item.uniqueListeners) * 100 : 0}%`,
                                      }}
                                      className="bg-emerald-500 w-full"
                                    />
                                  </>
                                ) : (
                                  <div className="bg-[#1E2442]/40 h-full w-full" />
                                )}
                              </div>
                            ) : (
                              <div
                                style={{ height: `${heightPct}%` }}
                                className={`w-full max-w-[24px] rounded-t-md transition-all ${
                                  val > 0
                                    ? isHovered
                                      ? chartMetric === 'listens'
                                        ? 'bg-purple-400 shadow-lg shadow-purple-500/50 scale-105'
                                        : 'bg-indigo-400 shadow-lg shadow-indigo-500/50 scale-105'
                                      : chartMetric === 'listens'
                                      ? 'bg-gradient-to-t from-purple-800 to-purple-500 hover:from-purple-700 hover:to-purple-400'
                                      : 'bg-gradient-to-t from-indigo-800 to-indigo-500 hover:from-indigo-700 hover:to-indigo-400'
                                    : 'bg-[#1E2442]/40'
                                }`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Chart Footer with Timeline labels & summary */}
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#64748B] flex-wrap gap-2">
                      <span>{dailyStats[0]?.label}</span>
                      <div className="flex items-center gap-4 text-xs font-mono">
                        <span>Суммарно: <strong className="text-white">{totalInWindow}</strong></span>
                        <span>В среднем: <strong className="text-purple-300">{avgInWindow}/день</strong></span>
                        <span>Пик дня: <strong className="text-emerald-400">{maxValue}</strong></span>
                      </div>
                      <span>{dailyStats[dailyStats.length - 1]?.label}</span>
                    </div>
                  </div>
                );
              })()
            )}
          </div>

          {/* Activity Peaks & Time Breakdowns Grid (2 Columns) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Column 1: Activity by Day of Week */}
            <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-400" />
                    <span>Активность по дням недели</span>
                  </h3>
                  <p className="text-xs text-[#94A3B8]">
                    Распределение квалифицированных прослушиваний по дням недели
                  </p>
                </div>

                <div className="px-3 py-1 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-mono font-bold">
                  {peakDay}
                </div>
              </div>

              {dayOfWeekStats.length === 0 ? (
                <p className="text-xs text-[#94A3B8] font-mono">Недостаточно данных</p>
              ) : (
                <div className="space-y-2.5">
                  {(() => {
                    const maxDow = Math.max(1, ...dayOfWeekStats.map((d) => d.listens));
                    return dayOfWeekStats.map((d) => {
                      const pct = maxDow > 0 ? Math.round((d.listens / maxDow) * 100) : 0;
                      return (
                        <div key={d.dow} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-slate-300 font-bold">{d.name} ({d.label})</span>
                            <span className="text-purple-300 font-bold">
                              {d.listens.toLocaleString('ru-RU')} просл.
                            </span>
                          </div>
                          <div className="w-full bg-[#11152A] h-2 rounded-full overflow-hidden border border-[#1E2442]">
                            <div
                              style={{ width: `${pct}%` }}
                              className="bg-gradient-to-r from-purple-700 to-indigo-500 h-full rounded-full transition-all"
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* Column 2: Activity by Hours of Day (00:00 - 23:00) */}
            <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <span>Активность по часам (00:00 - 23:00)</span>
                  </h3>
                  <p className="text-xs text-[#94A3B8]">
                    Часовые пики прослушиваний по серверному времени
                  </p>
                </div>

                <div className="px-3 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono font-bold">
                  {peakHour}
                </div>
              </div>

              {hourlyStats.length === 0 ? (
                <p className="text-xs text-[#94A3B8] font-mono">Недостаточно данных</p>
              ) : (
                (() => {
                  const maxHour = Math.max(1, ...hourlyStats.map((h) => h.listens));
                  return (
                    <div className="space-y-3">
                      {/* 24-Bar Histogram */}
                      <div className="h-32 w-full flex items-end gap-1 pt-4 pb-1 px-2 bg-[#080915] rounded-2xl border border-[#1E2442]">
                        {hourlyStats.map((h) => {
                          const heightPct = Math.max(6, Math.round((h.listens / maxHour) * 100));
                          return (
                            <div
                              key={h.hour}
                              className="flex-1 h-full flex flex-col justify-end items-center group cursor-pointer relative"
                            >
                              <div className="absolute -top-7 bg-cyan-950 border border-cyan-500/40 text-cyan-200 text-[9px] font-mono px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                {h.label}: {h.listens}
                              </div>
                              <div
                                style={{ height: `${heightPct}%` }}
                                className={`w-full rounded-t-sm transition-all ${
                                  h.listens > 0
                                    ? 'bg-gradient-to-t from-cyan-800 to-cyan-400 group-hover:bg-cyan-300'
                                    : 'bg-[#1E2442]/30'
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-[#64748B]">
                        <span>00:00</span>
                        <span>06:00</span>
                        <span>12:00</span>
                        <span>18:00</span>
                        <span>23:00</span>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          {/* Breakdown: Popular Releases & Popular Tracks Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Popular Releases Breakdown */}
            <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                  <Disc className="w-4 h-4 text-purple-400" />
                  <span>Популярные релизы</span>
                </h3>
                <span className="text-xs text-[#94A3B8] font-mono">
                  Доля от общего числа
                </span>
              </div>

              {releasesStats.length === 0 ? (
                <div className="p-8 text-center bg-[#11152A] rounded-2xl border border-[#1E2442] text-xs text-[#94A3B8] font-mono">
                  Опубликованные релизы отсутствуют
                </div>
              ) : (
                <div className="space-y-3">
                  {releasesStats.map((rel) => {
                    const pct = rel.sharePct || 0;

                    return (
                      <div
                        key={rel.id}
                        className="p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] hover:border-purple-500/40 transition-all space-y-2"
                      >
                        <div className="flex items-center gap-3">
                          {rel.cover ? (
                            <img
                              src={rel.cover}
                              alt={rel.title}
                              className="w-12 h-12 rounded-xl object-cover shrink-0 border border-[#1E2442]"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-purple-900/30 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                              <Disc className="w-5 h-5" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-white font-mono truncate">{rel.title}</h4>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#1E2442] text-slate-300">
                                {rel.type}
                              </span>
                            </div>
                            <span className="text-[11px] text-[#64748B] font-mono">
                              {rel.tracksCount || 0} треков · {rel.releaseDate || 'Дата не указана'}
                            </span>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="flex items-center gap-1.5 text-purple-300 font-mono font-bold text-xs">
                              <Headphones className="w-3.5 h-3.5 text-purple-400" />
                              <span>{(rel.listenCount || 0).toLocaleString('ru-RU')}</span>
                            </div>
                            <span className="text-[10px] text-purple-400 font-mono font-bold">
                              {pct}% от общих
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-[#0B0D20] h-1.5 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${pct}%` }}
                            className="bg-gradient-to-r from-purple-600 to-indigo-500 h-full rounded-full transition-all"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Popular Tracks Breakdown */}
            <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                  <Music className="w-4 h-4 text-purple-400" />
                  <span>Популярные треки</span>
                </h3>
                <span className="text-xs text-[#94A3B8] font-mono">
                  Сортировка по прослушиваниям
                </span>
              </div>

              {tracksStats.length === 0 ? (
                <div className="p-8 text-center bg-[#11152A] rounded-2xl border border-[#1E2442] text-xs text-[#94A3B8] font-mono">
                  Треки в опубликованных релизах отсутствуют
                </div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {tracksStats.slice(0, 15).map((trk, idx) => (
                    <div
                      key={trk.id}
                      className="p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center gap-3 hover:border-purple-500/30 transition-all"
                    >
                      <span className="text-xs font-mono font-black text-[#64748B] w-6 text-center shrink-0">
                        #{idx + 1}
                      </span>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-white font-mono truncate">{trk.title}</h4>
                        <p className="text-[10px] text-[#64748B] font-mono truncate">Релиз: {trk.releaseTitle}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1.5 text-purple-300 font-mono font-bold text-xs">
                          <Headphones className="w-3.5 h-3.5 text-purple-400" />
                          <span>{(trk.listenCount || 0).toLocaleString('ru-RU')}</span>
                        </div>
                        {trk.duration ? (
                          <span className="text-[10px] text-[#64748B] font-mono">
                            {Math.floor(trk.duration / 60)}:{String(trk.duration % 60).padStart(2, '0')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Engagement & Measurement Transparency Block */}
          <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
            <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Вовлеченность слушателей и прозрачность метрик</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-1">
                <span className="text-[11px] font-mono text-[#64748B] font-bold">Конверсия в рецензии</span>
                <div className="text-xl font-black text-amber-400 font-mono">
                  {stats.totalListens > 0
                    ? `${Math.round(((stats.totalReviews || 0) / stats.totalListens) * 1000) / 10}%`
                    : '0%'}
                </div>
                <p className="text-[10px] text-[#94A3B8] font-mono">
                  {stats.totalReviews} рецензий на {stats.totalListens} прослушиваний
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-1">
                <span className="text-[11px] font-mono text-[#64748B] font-bold">Удержание аудитории</span>
                <div className="text-xl font-black text-emerald-400 font-mono">
                  {stats.periodUniqueListeners > 0
                    ? `${Math.round((returningListenersCount / stats.periodUniqueListeners) * 1000) / 10}%`
                    : '0%'}
                </div>
                <p className="text-[10px] text-[#94A3B8] font-mono">
                  доля возвращающихся слушателей за {statsDays} дн.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-1">
                <span className="text-[11px] font-mono text-[#64748B] font-bold">Глубина каталога</span>
                <div className="text-xl font-black text-cyan-400 font-mono">
                  {stats.publishedCount > 0
                    ? `${Math.round((stats.totalTracks / stats.publishedCount) * 10) / 10}`
                    : '0'}{' '}
                  <span className="text-xs font-normal text-slate-400">треков/релиз</span>
                </div>
                <p className="text-[10px] text-[#94A3B8] font-mono">
                  среднее число треков на опубликованный релиз
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#11152A] border border-emerald-500/20 text-xs text-slate-300 font-mono space-y-1">
              <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                <span>Честная статистика без искусственных накруток:</span>
              </div>
              <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                Просмотры страниц релизов не логируются в структуре базы данных Dodik Tracker. Мы не придумываем ложные проценты конверсий страниц — вся статистика строится исключительно на реальных сессиях воспроизведения из таблиц <code className="text-purple-300">music_listens</code> и <code className="text-purple-300">music_playback_sessions</code>.
              </p>
            </div>
          </div>

          {/* PTS Ledger & Rewards Log */}
          <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span>Реестр начислений наград PTS за музыку</span>
                </h3>
                <p className="text-xs text-[#94A3B8]">
                  Прозрачная экономика наград Dodik Tracker. 1 PTS начисляется за каждые 10 квалифицированных прослушиваний.
                </p>
              </div>

              <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-xs font-bold">
                Суммарно: +{stats.ptsEarned || 0} PTS
              </div>
            </div>

            {/* Anti-cheat & Economics rules banner */}
            <div className="p-4 rounded-2xl bg-[#11152A] border border-purple-500/20 text-xs text-slate-300 space-y-1 font-mono">
              <div className="text-purple-300 font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Правила фиксации прослушиваний и наград:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[#94A3B8] pt-1">
                <li>Прослушивание засчитывается после 30 секунд или 50% длительности трека.</li>
                <li>Защита от накрутки: перемотка, спам-клики и повторные вызовы игнорируются сервером.</li>
                <li>Собственные воспроизведения автора сохраняются в личную историю, но исключаются из всех публичных счетчиков и не начисляют PTS.</li>
                <li>Награды начисляются автоматически в неизменяемый PostgreSQL-реестр баланса (PTS Ledger).</li>
              </ul>
            </div>

            {/* Rewards Transactions Table */}
            {ptsRewardsHistory.length === 0 ? (
              <div className="p-6 text-center bg-[#11152A] border border-[#1E2442] rounded-2xl text-xs text-[#94A3B8] font-mono">
                Пока нет начислений наград. Когда ваши треки наберут первые 10 прослушиваний, здесь появится первая транзакция!
              </div>
            ) : (
              <div className="space-y-2">
                {ptsRewardsHistory.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-between gap-4 text-xs font-mono"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                        <Award className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-white font-bold">{tx.description}</div>
                        <div className="text-[10px] text-[#64748B]">
                          ID транзакции: #{tx.id} · Ref: {tx.referenceId}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-black text-amber-400">+{tx.amount} PTS</span>
                      <div className="text-[10px] text-[#64748B]">
                        {new Date(tx.createdAt).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: SETTINGS */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveProfile} className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-5 max-w-2xl">
          <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-400" />
            <span>Настройки профиля музыканта</span>
          </h2>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                Сценическое имя / Название группы
              </label>
              <input
                type="text"
                value={profileForm.stageName}
                onChange={(e) => setProfileForm({ ...profileForm, stageName: e.target.value })}
                placeholder="Сценическое имя..."
                className="w-full p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                URL Slug (dodik.me/artist/slug)
              </label>
              <input
                type="text"
                value={profileForm.slug}
                onChange={(e) => setProfileForm({ ...profileForm, slug: e.target.value })}
                placeholder="my-artist-slug"
                className="w-full p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                Ссылка на аватар исполнителя
              </label>
              <input
                type="text"
                value={profileForm.avatar}
                onChange={(e) => setProfileForm({ ...profileForm, avatar: e.target.value })}
                placeholder="https://..."
                className="w-full p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                Описание / Биография
              </label>
              <textarea
                rows={4}
                value={profileForm.description}
                onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
                placeholder="Описание музыкального проекта..."
                className="w-full p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 resize-none leading-relaxed"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingProfile || !profileForm.stageName.trim()}
            className="px-6 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Сохранить профиль</span>
          </button>
        </form>
      )}

      {/* CREATE / EDIT RELEASE MODAL */}
      {isReleaseModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRelease}
            className="bg-[#0B0D20] border border-[#1E2442] rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2442]">
              <h3 className="text-base font-extrabold text-white font-mono">
                {editingRelease ? 'Редактировать релиз' : 'Создать новый релиз'}
              </h3>
              <button
                type="button"
                onClick={() => setIsReleaseModalOpen(false)}
                className="p-1 text-[#64748B] hover:text-white cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-mono font-bold text-white uppercase">
                  Название релиза *
                </label>
                <input
                  type="text"
                  value={releaseForm.title}
                  onChange={(e) => setReleaseForm({ ...releaseForm, title: e.target.value })}
                  placeholder="Например: Cyberpunk Dreams"
                  className="w-full p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono font-bold text-white uppercase">
                    Тип релиза
                  </label>
                  <select
                    value={releaseForm.type}
                    onChange={(e) =>
                      setReleaseForm({ ...releaseForm, type: e.target.value as any })
                    }
                    className="w-full p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                  >
                    <option value="SINGLE">Single</option>
                    <option value="EP">EP</option>
                    <option value="ALBUM">Album</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-mono font-bold text-white uppercase">
                    Дата релиза
                  </label>
                  <input
                    type="date"
                    value={releaseForm.releaseDate}
                    onChange={(e) => setReleaseForm({ ...releaseForm, releaseDate: e.target.value })}
                    className="w-full p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono font-bold text-white uppercase">
                  Ссылка на обложку (URL)
                </label>
                <input
                  type="text"
                  value={releaseForm.cover}
                  onChange={(e) => setReleaseForm({ ...releaseForm, cover: e.target.value })}
                  placeholder="https://..."
                  className="w-full p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono font-bold text-white uppercase">
                  Описание / Заметка автора
                </label>
                <textarea
                  rows={3}
                  value={releaseForm.description}
                  onChange={(e) => setReleaseForm({ ...releaseForm, description: e.target.value })}
                  placeholder="Концепция релиза..."
                  className="w-full p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E2442]">
              <button
                type="button"
                onClick={() => setIsReleaseModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#11152A] text-xs font-mono font-bold text-[#94A3B8] hover:text-white cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={savingRelease || !releaseForm.title.trim()}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {savingRelease ? 'Сохранение...' : 'Сохранить релиз'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TRACKS MANAGEMENT DRAWER / MODAL */}
      {selectedReleaseForTracks && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B0D20] border border-[#1E2442] rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2442] shrink-0">
              <div>
                <h3 className="text-base font-extrabold text-white font-mono">
                  Управление треками релиза «{selectedReleaseForTracks.title}»
                </h3>
                <span className="text-xs text-[#94A3B8]">
                  {tracks.length} треков в релизе
                </span>
              </div>
              <button
                onClick={() => setSelectedReleaseForTracks(null)}
                className="p-1 text-[#64748B] hover:text-white cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Track List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-[200px]">
              {loadingTracks ? (
                <div className="py-12 text-center text-xs font-mono text-[#64748B]">Загрузка треков...</div>
              ) : tracks.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#94A3B8]">В этом релизе пока нет треков</div>
              ) : (
                tracks.map((trk) => (
                  <div
                    key={trk.id}
                    className="p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-[#1E2442] text-purple-300 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                        {trk.trackNumber}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-white truncate font-mono">{trk.title}</h4>
                          {trk.explicit && (
                            <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300">
                              E
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#64748B] truncate">{trk.audioFile}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleDeleteTrack(trk.id)}
                        className="p-1.5 text-[#94A3B8] hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add Track Button / Form */}
            {!isTrackModalOpen ? (
              <button
                onClick={() => setIsTrackModalOpen(true)}
                className="w-full py-3 rounded-2xl bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600 text-purple-300 hover:text-white font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить трек к релизу</span>
              </button>
            ) : (
              <form onSubmit={handleSaveTrack} className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-3 shrink-0">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="text-[10px] font-mono text-white font-bold uppercase">Название трека *</label>
                    <input
                      type="text"
                      value={trackForm.title}
                      onChange={(e) => setTrackForm({ ...trackForm, title: e.target.value })}
                      placeholder="Название трека..."
                      className="w-full p-2.5 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-white font-bold uppercase">№ Трека</label>
                    <input
                      type="number"
                      value={trackForm.trackNumber}
                      onChange={(e) => setTrackForm({ ...trackForm, trackNumber: parseInt(e.target.value, 10) || 1 })}
                      className="w-full p-2.5 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-white font-bold uppercase">Ссылка на аудиофайл (MP3/FLAC/WAV URL) *</label>
                  <input
                    type="text"
                    value={trackForm.audioFile}
                    onChange={(e) => setTrackForm({ ...trackForm, audioFile: e.target.value })}
                    placeholder="https://..."
                    className="w-full p-2.5 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono text-white font-bold uppercase">Текст трека (Lyrics)</label>
                  <textarea
                    rows={2}
                    value={trackForm.lyrics}
                    onChange={(e) => setTrackForm({ ...trackForm, lyrics: e.target.value })}
                    placeholder="Текст песни..."
                    className="w-full p-2.5 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 resize-none font-mono"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 text-xs font-mono text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={trackForm.explicit}
                      onChange={(e) => setTrackForm({ ...trackForm, explicit: e.target.checked })}
                      className="rounded border-[#1E2442] text-purple-600 focus:ring-0"
                    />
                    <span>Explicit (содержит ненормативную лексику)</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsTrackModalOpen(false)}
                      className="px-3 py-1.5 rounded-xl bg-[#0B0D20] text-xs font-mono text-[#94A3B8] cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={savingTrack || !trackForm.title.trim() || !trackForm.audioFile.trim()}
                      className="px-3.5 py-1.5 rounded-xl bg-purple-600 text-white font-mono text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {savingTrack ? 'Добавление...' : 'Сохранить трек'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
