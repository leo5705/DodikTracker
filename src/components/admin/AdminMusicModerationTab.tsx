import React, { useState, useEffect, useCallback } from 'react';
import {
  Music,
  Disc,
  Play,
  Pause,
  Check,
  X,
  Eye,
  FileText,
  MessageSquare,
  AlertTriangle,
  Clock,
  User,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Search,
  Filter,
  Sparkles,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useMusicPlayer, Track as PlayerTrack } from '../../context/MusicPlayerContext.tsx';

interface PendingReleaseCard {
  id: number;
  artistId: number;
  title: string;
  slug: string;
  type: 'SINGLE' | 'EP' | 'ALBUM';
  description: string | null;
  cover: string | null;
  releaseDate: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  stageName: string;
  artistSlug: string;
  artistAvatar: string | null;
  artistUserId: number;
  username: string;
  tracksCount: number;
  hasExplicit: boolean;
  totalDuration: number;
}

interface DetailedTrack {
  id: number;
  releaseId: number;
  artistId: number;
  title: string;
  slug: string;
  trackNumber: number;
  audioFile: string;
  duration: number | null;
  lyrics: string | null;
  authorNote: string | null;
  explicit: boolean;
  status: string;
}

interface DetailedGenre {
  id: number;
  name: string;
  slug: string;
}

interface DetailedReleaseData {
  release: PendingReleaseCard;
  tracks: DetailedTrack[];
  genres: DetailedGenre[];
}

export const AdminMusicModerationTab: React.FC = () => {
  const { authFetch } = useAuth();
  const { navigate } = useRouter();
  const { playTrack, currentTrack, isPlaying, togglePlayPause } = useMusicPlayer();

  const [releases, setReleases] = useState<PendingReleaseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'ALBUM' | 'EP' | 'SINGLE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected release for deep inspection
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | null>(null);
  const [detailedData, setDetailedData] = useState<DetailedReleaseData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Expanded accordions for lyrics and notes in detail view
  const [expandedLyrics, setExpandedLyrics] = useState<Record<number, boolean>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<number, boolean>>({});

  // Reject modal state
  const [rejectingReleaseId, setRejectingReleaseId] = useState<number | null>(null);
  const [rejectingTitle, setRejectingTitle] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Action status toast/message
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchPendingReleases = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await authFetch('/api/music/admin/releases?status=PENDING_REVIEW');
      if (res.ok) {
        const data = await res.json();
        setReleases(data.releases || []);
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({ type: 'error', text: err.error || 'Ошибка загрузки очереди модерации' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Ошибка соединения с сервером' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchPendingReleases();
  }, [fetchPendingReleases]);

  // Load detail view when selectedReleaseId changes
  useEffect(() => {
    if (!selectedReleaseId) {
      setDetailedData(null);
      return;
    }

    let isMounted = true;
    setLoadingDetail(true);

    const loadDetail = async () => {
      try {
        const res = await authFetch(`/api/music/admin/releases/${selectedReleaseId}`);
        if (res.ok && isMounted) {
          const data = await res.json();
          setDetailedData(data);
        } else if (isMounted) {
          setActionMessage({ type: 'error', text: 'Не удалось загрузить данные релиза' });
          setSelectedReleaseId(null);
        }
      } catch (err) {
        if (isMounted) {
          setActionMessage({ type: 'error', text: ' Ошибка при загрузке деталей релиза' });
          setSelectedReleaseId(null);
        }
      } finally {
        if (isMounted) setLoadingDetail(false);
      }
    };

    loadDetail();
    return () => {
      isMounted = false;
    };
  }, [selectedReleaseId, authFetch]);

  const handleApprove = async (releaseId: number, releaseTitle: string) => {
    if (!window.confirm(`Вы действительно хотите одобрить и опубликовать релиз «${releaseTitle}»?`)) {
      return;
    }

    try {
      const res = await authFetch(`/api/music/admin/releases/${releaseId}/approve`, {
        method: 'POST',
      });

      if (res.ok) {
        setActionMessage({ type: 'success', text: `Релиз «${releaseTitle}» успешно одобрен и опубликован!` });
        if (selectedReleaseId === releaseId) {
          setSelectedReleaseId(null);
        }
        fetchPendingReleases(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setActionMessage({ type: 'error', text: data.error || 'Ошибка при одобрении релиза' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Ошибка отправки запроса' });
    }
  };

  const openRejectModal = (releaseId: number, title: string) => {
    setRejectingReleaseId(releaseId);
    setRejectingTitle(title);
    setRejectionReason('');
    setRejectError(null);
  };

  const handleConfirmReject = async () => {
    if (!rejectingReleaseId) return;

    const reasonClean = rejectionReason.trim();
    if (!reasonClean) {
      setRejectError('Укажите причину отклонения для музыканта');
      return;
    }

    setSubmittingReject(true);
    setRejectError(null);

    try {
      const res = await authFetch(`/api/music/admin/releases/${rejectingReleaseId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: reasonClean }),
      });

      if (res.ok) {
        setActionMessage({ type: 'success', text: `Релиз «${rejectingTitle}» отклонён. Уведомление отправлено автору.` });
        if (selectedReleaseId === rejectingReleaseId) {
          setSelectedReleaseId(null);
        }
        setRejectingReleaseId(null);
        fetchPendingReleases(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setRejectError(data.error || 'Ошибка при отклонении релиза');
      }
    } catch (err) {
      setRejectError('Ошибка сети при попытке отклонить релиз');
    } finally {
      setSubmittingReject(false);
    }
  };

  const handlePlayTrack = (track: DetailedTrack) => {
    if (!detailedData) return;

    const formattedTracks: PlayerTrack[] = detailedData.tracks.map((t) => ({
      id: t.id,
      releaseId: detailedData.release.id,
      releaseTitle: detailedData.release.title,
      releaseCover: detailedData.release.cover,
      releaseSlug: detailedData.release.slug,
      artistId: detailedData.release.artistId,
      artistName: detailedData.release.stageName,
      artistSlug: detailedData.release.artistSlug,
      title: t.title,
      slug: t.slug,
      trackNumber: t.trackNumber,
      audioFile: t.audioFile,
      duration: t.duration,
      explicit: t.explicit,
      lyrics: t.lyrics,
      authorNote: t.authorNote,
    }));

    if (currentTrack?.id === track.id) {
      togglePlayPause();
    } else {
      const playerTrack = formattedTracks.find((t) => t.id === track.id) || formattedTracks[0];
      playTrack(playerTrack, formattedTracks, {
        id: detailedData.release.id,
        title: detailedData.release.title,
        cover: detailedData.release.cover,
        slug: detailedData.release.slug,
        artistName: detailedData.release.stageName,
        artistSlug: detailedData.release.artistSlug,
      });
    }
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const filteredReleases = releases.filter((rel) => {
    if (typeFilter !== 'ALL' && rel.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = rel.title.toLowerCase().includes(q);
      const matchArtist = rel.stageName.toLowerCase().includes(q);
      const matchUsername = rel.username.toLowerCase().includes(q);
      if (!matchTitle && !matchArtist && !matchUsername) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* ACTION MESSAGE TOAST */}
      {actionMessage && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 font-semibold text-sm transition-all animate-fadeIn ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionMessage.type === 'success' ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* HEADER BAR & CONTROLS */}
      {!selectedReleaseId && (
        <div className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">
                <Clock className="w-4 h-4 animate-pulse" />
                <span>Очередь модерации релизов</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Музыкальная модерация</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {releases.length} PENDING
                </span>
              </h2>
            </div>

            <button
              onClick={() => fetchPendingReleases(true)}
              disabled={refreshing}
              className="self-start sm:self-center px-4 py-2.5 rounded-xl bg-[#11152A] hover:bg-[#1A1F3B] border border-[#1E2442] text-xs font-mono font-bold text-purple-300 hover:text-white flex items-center gap-2 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-purple-400' : ''}`} />
              <span>Обновить очередь</span>
            </button>
          </div>

          {/* Search & Type Filters */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-[#1E2442]">
            {/* Type Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 md:pb-0">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                  typeFilter === 'ALL'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'bg-[#11152A] text-slate-400 hover:text-white border border-[#1E2442]'
                }`}
              >
                Все ({releases.length})
              </button>
              <button
                onClick={() => setTypeFilter('ALBUM')}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                  typeFilter === 'ALBUM'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'bg-[#11152A] text-slate-400 hover:text-white border border-[#1E2442]'
                }`}
              >
                Альбомы ({releases.filter((r) => r.type === 'ALBUM').length})
              </button>
              <button
                onClick={() => setTypeFilter('EP')}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                  typeFilter === 'EP'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'bg-[#11152A] text-slate-400 hover:text-white border border-[#1E2442]'
                }`}
              >
                EP ({releases.filter((r) => r.type === 'EP').length})
              </button>
              <button
                onClick={() => setTypeFilter('SINGLE')}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                  typeFilter === 'SINGLE'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'bg-[#11152A] text-slate-400 hover:text-white border border-[#1E2442]'
                }`}
              >
                Синглы ({releases.filter((r) => r.type === 'SINGLE').length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Поиск по названию или автору..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
              />
            </div>
          </div>
        </div>
      )}

      {/* DETAIL INSPECTION VIEW */}
      {selectedReleaseId ? (
        <div className="space-y-6">
          {/* Top Bar for Detail View */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
            <button
              onClick={() => setSelectedReleaseId(null)}
              className="px-4 py-2 rounded-xl bg-[#11152A] hover:bg-[#1A1F3B] border border-[#1E2442] text-xs font-mono font-bold text-white flex items-center gap-2 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-purple-400" />
              <span>Вернуться к очереди</span>
            </button>

            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>НА МОДЕРАЦИИ</span>
            </span>
          </div>

          {loadingDetail || !detailedData ? (
            <div className="p-16 text-center rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto" />
              <p className="text-sm font-mono text-slate-400">Загрузка деталей релиза...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* LEFT COLUMN: RELEASE METADATA & ARTIST CARD */}
              <div className="lg:col-span-5 space-y-5">
                {/* Release Main Card */}
                <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-5 shadow-xl">
                  {/* Cover Art */}
                  <div className="relative aspect-square rounded-2xl overflow-hidden bg-[#11152A] border border-[#1E2442] shadow-2xl group">
                    {detailedData.release.cover ? (
                      <img
                        src={detailedData.release.cover}
                        alt={detailedData.release.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                        <Disc className="w-16 h-16" />
                        <span className="text-xs font-mono">Обложка отсутствует</span>
                      </div>
                    )}

                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-xl bg-black/80 backdrop-blur-md text-xs font-mono font-bold text-purple-300 border border-purple-500/30">
                        {detailedData.release.type}
                      </span>
                      {detailedData.release.hasExplicit && (
                        <span className="px-2.5 py-1 rounded-xl bg-rose-600/90 text-white font-black text-xs border border-rose-500/40">
                          18+
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Info */}
                  <div>
                    <h1 className="text-2xl font-black text-white tracking-tight leading-snug">
                      {detailedData.release.title}
                    </h1>
                    <p className="text-sm font-mono text-purple-300 font-semibold mt-1">
                      {detailedData.release.stageName}
                    </p>
                  </div>

                  {/* Concept / Description */}
                  <div className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                      Концепция / Описание релиза
                    </span>
                    <p className="text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-line">
                      {detailedData.release.description || 'Описание не указано автором.'}
                    </p>
                  </div>

                  {/* Additional Metadata Grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-xl bg-[#11152A] border border-[#1E2442]">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Дата релиза</span>
                      <span className="text-slate-200 font-bold mt-0.5 block">
                        {detailedData.release.releaseDate || 'Не указана'}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#11152A] border border-[#1E2442]">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Отправлен на проверку</span>
                      <span className="text-slate-200 font-bold mt-0.5 block">
                        {formatDate(detailedData.release.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Genres */}
                  {detailedData.genres.length > 0 && (
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-2">
                        Жанры
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {detailedData.genres.map((g) => (
                          <span
                            key={g.id}
                            className="px-2.5 py-1 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs font-mono font-bold text-slate-300"
                          >
                            #{g.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Artist Profile Card */}
                <div className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] flex items-center justify-between gap-4 shadow-xl">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[#11152A] border border-[#1E2442] shrink-0">
                      {detailedData.release.artistAvatar ? (
                        <img
                          src={detailedData.release.artistAvatar}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-purple-400 font-mono font-bold text-lg">
                          {detailedData.release.stageName.charAt(0)}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <span className="text-[10px] font-mono font-bold uppercase text-slate-500">Исполнитель</span>
                      <h4 className="text-base font-extrabold text-white truncate">
                        {detailedData.release.stageName}
                      </h4>
                      <p className="text-xs font-mono text-slate-400 truncate">
                        @{detailedData.release.username}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/music/artist/${detailedData.release.artistSlug || detailedData.release.artistId}`)}
                    className="px-3 py-2 rounded-xl bg-[#11152A] hover:bg-[#1A1F3B] border border-[#1E2442] text-xs font-mono font-bold text-purple-300 hover:text-white flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                  >
                    <span>Профиль</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* MODERATION DECISION ACTIONS */}
                <div className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-3 shadow-xl">
                  <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
                    Принять решение
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => openRejectModal(detailedData.release.id, detailedData.release.title)}
                      className="w-full py-3 px-4 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-mono font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      <span>Отклонить</span>
                    </button>

                    <button
                      onClick={() => handleApprove(detailedData.release.id, detailedData.release.title)}
                      className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Одобрить</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: TRACKLIST WITH AUDIO PLAYER & LYRICS */}
              <div className="lg:col-span-7 space-y-4">
                <div className="p-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
                  <div className="flex items-center justify-between pb-3 border-b border-[#1E2442]">
                    <div className="flex items-center gap-2 text-sm font-mono font-bold text-white">
                      <Music className="w-4 h-4 text-purple-400" />
                      <span>Треклист ({detailedData.tracks.length})</span>
                    </div>

                    <span className="text-xs font-mono text-slate-400">
                      Общая длительность: {formatDuration(detailedData.tracks.reduce((acc, t) => acc + (t.duration || 0), 0))}
                    </span>
                  </div>

                  {detailedData.tracks.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 font-mono text-xs">
                      В этом релизе ещё нет загруженных треков.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {detailedData.tracks.map((track) => {
                        const isCurrentPlaying = currentTrack?.id === track.id && isPlaying;
                        const hasLyrics = Boolean(track.lyrics && track.lyrics.trim());
                        const hasNote = Boolean(track.authorNote && track.authorNote.trim());
                        const lyricsExpanded = Boolean(expandedLyrics[track.id]);
                        const noteExpanded = Boolean(expandedNotes[track.id]);

                        return (
                          <div
                            key={track.id}
                            className={`p-4 rounded-2xl border transition-all ${
                              isCurrentPlaying
                                ? 'bg-purple-950/30 border-purple-500/50 shadow-md shadow-purple-500/10'
                                : 'bg-[#11152A] border-[#1E2442] hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              {/* Left: Play Button + Track Info */}
                              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                <button
                                  onClick={() => handlePlayTrack(track)}
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition cursor-pointer ${
                                    isCurrentPlaying
                                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40'
                                      : 'bg-[#0B0D20] text-purple-400 hover:text-white hover:bg-purple-600 border border-[#1E2442]'
                                  }`}
                                  title={isCurrentPlaying ? 'Пауза' : 'Слушать'}
                                >
                                  {isCurrentPlaying ? (
                                    <Pause className="w-4 h-4 fill-current" />
                                  ) : (
                                    <Play className="w-4 h-4 fill-current ml-0.5" />
                                  )}
                                </button>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono font-bold text-slate-500">
                                      #{track.trackNumber}
                                    </span>
                                    <h4 className="text-sm font-extrabold text-white truncate">
                                      {track.title}
                                    </h4>
                                    {track.explicit && (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                                        18+
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mt-1">
                                    <span>{formatDuration(track.duration)}</span>
                                    {hasLyrics && (
                                      <span className="text-purple-400 text-[10px]">● Текст есть</span>
                                    )}
                                    {hasNote && (
                                      <span className="text-amber-400 text-[10px]">● Заметка есть</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Right: Toggle Lyrics / Note Buttons */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() =>
                                    setExpandedLyrics((prev) => ({ ...prev, [track.id]: !prev[track.id] }))
                                  }
                                  className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center gap-1 transition cursor-pointer ${
                                    lyricsExpanded
                                      ? 'bg-purple-600 text-white'
                                      : 'bg-[#0B0D20] text-slate-400 hover:text-white border border-[#1E2442]'
                                  }`}
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Текст</span>
                                  {lyricsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>

                                <button
                                  onClick={() =>
                                    setExpandedNotes((prev) => ({ ...prev, [track.id]: !prev[track.id] }))
                                  }
                                  className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center gap-1 transition cursor-pointer ${
                                    noteExpanded
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-[#0B0D20] text-slate-400 hover:text-white border border-[#1E2442]'
                                  }`}
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Заметка</span>
                                  {noteExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>

                            {/* Expandable Lyrics Box */}
                            {lyricsExpanded && (
                              <div className="mt-3 p-4 rounded-xl bg-[#0B0D20] border border-[#1E2442] space-y-1.5 animate-fadeIn">
                                <span className="text-[10px] font-mono font-bold uppercase text-purple-400 block">
                                  Текст песни
                                </span>
                                {hasLyrics ? (
                                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-line">
                                    {track.lyrics}
                                  </p>
                                ) : (
                                  <p className="text-xs font-mono italic text-slate-500">
                                    Текст песни не указан
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Expandable Author Note Box */}
                            {noteExpanded && (
                              <div className="mt-3 p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-1.5 animate-fadeIn">
                                <span className="text-[10px] font-mono font-bold uppercase text-amber-300 block">
                                  Заметка автора
                                </span>
                                {hasNote ? (
                                  <p className="text-xs sm:text-sm text-amber-100 leading-relaxed font-sans whitespace-pre-line">
                                    {track.authorNote}
                                  </p>
                                ) : (
                                  <p className="text-xs font-mono italic text-slate-500">
                                    Заметка от исполнителя отсутствует
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* PENDING RELEASES LIST GRID */
        <div>
          {loading ? (
            <div className="p-16 text-center rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto" />
              <p className="text-sm font-mono text-slate-400">Загрузка очереди модерации...</p>
            </div>
          ) : filteredReleases.length === 0 ? (
            <div className="p-16 text-center rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-3 max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <Check className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-white font-mono">Нет релизов на модерации</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Все поступившие музыкальные релизы проверены. На данный момент очереди нет.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredReleases.map((rel) => (
                <div
                  key={rel.id}
                  className="p-5 rounded-3xl bg-[#0B0D20] border border-[#1E2442] hover:border-purple-500/40 transition-all flex flex-col justify-between space-y-4 shadow-xl group"
                >
                  <div className="space-y-3">
                    {/* Top row: Cover + Basic Info */}
                    <div className="flex items-start gap-4">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden bg-[#11152A] border border-[#1E2442] shrink-0 relative">
                        {rel.cover ? (
                          <img src={rel.cover} alt={rel.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-600">
                            <Disc className="w-8 h-8" />
                          </div>
                        )}

                        {rel.hasExplicit && (
                          <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded text-[9px] font-black bg-rose-600 text-white">
                            18+
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-bold">
                            {rel.type}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                            PENDING
                          </span>
                        </div>

                        <h3 className="text-base font-extrabold text-white truncate leading-snug group-hover:text-purple-300 transition">
                          {rel.title}
                        </h3>

                        <p className="text-xs font-mono text-slate-400 truncate mt-0.5">
                          {rel.stageName} (@{rel.username})
                        </p>
                      </div>
                    </div>

                    {/* Stats & Date info */}
                    <div className="p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>{rel.tracksCount} {rel.tracksCount === 1 ? 'трек' : 'треков'}</span>
                      <span>{formatDuration(rel.totalDuration)}</span>
                      <span className="text-slate-500">{formatDate(rel.createdAt)}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-[#1E2442] grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setSelectedReleaseId(rel.id)}
                      className="py-2 px-3 rounded-xl bg-[#11152A] hover:bg-[#1A1F3B] border border-[#1E2442] text-xs font-mono font-bold text-purple-300 hover:text-white flex items-center justify-center gap-1.5 transition cursor-pointer col-span-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Обзор</span>
                    </button>

                    <button
                      onClick={() => openRejectModal(rel.id, rel.title)}
                      className="py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-mono font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer col-span-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Отклонить</span>
                    </button>

                    <button
                      onClick={() => handleApprove(rel.id, rel.title)}
                      className="py-2 px-3 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white font-mono font-bold text-xs flex items-center justify-center gap-1 shadow-md shadow-emerald-600/20 transition cursor-pointer col-span-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Одобрить</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectingReleaseId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B0D20] border border-[#1E2442] rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E2442]">
              <div className="flex items-center gap-2 text-rose-400 font-mono font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Отклонение релиза</span>
              </div>

              <button
                onClick={() => setRejectingReleaseId(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-[#11152A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="text-base font-extrabold text-white">
                Релиз: «{rejectingTitle}»
              </h4>
              <p className="text-xs font-mono text-slate-400 leading-relaxed">
                Укажите подробную и понятную причину отклонения. Музыкант получит эту причину в уведомлении и сможет исправить релиз в своей творческой студии.
              </p>
            </div>

            {rejectError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs font-mono">
                {rejectError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                Причина отклонения *
              </label>
              <textarea
                rows={4}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Например: Обложка содержит некорректный текст / Трек №2 поврежден / Отсутствует разрешение на сэмпл..."
                className="w-full p-3 rounded-xl bg-[#11152A] border border-[#1E2442] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRejectingReleaseId(null)}
                disabled={submittingReject}
                className="px-4 py-2.5 rounded-xl bg-[#11152A] hover:bg-[#1A1F3B] border border-[#1E2442] text-xs font-mono font-bold text-slate-300 hover:text-white transition cursor-pointer"
              >
                Отмена
              </button>

              <button
                onClick={handleConfirmReject}
                disabled={submittingReject}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/30 transition cursor-pointer disabled:opacity-50"
              >
                {submittingReject ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                <span>Отклонить релиз</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
