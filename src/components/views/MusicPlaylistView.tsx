import React, { useState, useEffect, useCallback } from 'react';
import {
  ListMusic,
  Play,
  Pause,
  Shuffle,
  Share2,
  Edit3,
  Trash2,
  ArrowLeft,
  Lock,
  Globe,
  Link as LinkIcon,
  Music2,
  Clock,
  Sparkles,
  Heart,
  FileText,
  Info,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Plus,
  Search,
  Users,
  User,
} from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useMusicPlayer, Track } from '../../context/MusicPlayerContext.tsx';
import { PlaylistModal, PlaylistData } from '../modals/PlaylistModal.tsx';
import { AddToPlaylistModal } from '../modals/AddToPlaylistModal.tsx';
import { PlaylistMembersModal } from '../modals/PlaylistMembersModal.tsx';
import { PlaylistAddTrackModal } from '../modals/PlaylistAddTrackModal.tsx';
import { LiveLyrics } from '../music/LiveLyrics.tsx';
import { TrackActionsMenu } from '../music/TrackActionsMenu.tsx';
import { ArtistLinks } from '../music/ArtistLinks.tsx';
import { MusicTrackRow } from '../music/MusicTrackRow.tsx';

interface PlaylistOwner {
  id: number;
  username: string;
  avatar: string | null;
}

interface PlaylistDetail {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  cover: string | null;
  customCover: string | null;
  firstTrackCover: string | null;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  isCollaborative: boolean;
  createdAt: string;
  updatedAt: string;
  tracksCount: number;
  totalDuration: number;
  owner: PlaylistOwner;
  members?: any[];
}

interface PlaylistTrackItem extends Track {
  junctionId: number;
  position: number;
  addedAt: string;
  releaseStatus?: string;
  addedBy?: {
    id: number;
    username: string;
    avatar: string | null;
  } | null;
  canRemove?: boolean;
}

export const MusicPlaylistView: React.FC<{ id: string }> = ({ id }) => {
  const playlistId = parseInt(id, 10);
  const { navigate } = useRouter();
  const { dbUser, authFetch } = useAuth();
  const { playTrack, currentTrack, isPlaying, currentTime, seek } = useMusicPlayer();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPrivateDenied, setIsPrivateDenied] = useState<boolean>(false);

  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [tracks, setTracks] = useState<PlaylistTrackItem[]>([]);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [isCollaborator, setIsCollaborator] = useState<boolean>(false);
  const [canAddTracks, setCanAddTracks] = useState<boolean>(false);
  const [canManageMembers, setCanManageMembers] = useState<boolean>(false);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState<boolean>(false);
  const [isAddTrackModalOpen, setIsAddTrackModalOpen] = useState<boolean>(false);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Track accordion toggles
  const [expandedLyricsTrackId, setExpandedLyricsTrackId] = useState<number | string | null>(null);
  const [expandedNoteTrackId, setExpandedNoteTrackId] = useState<number | string | null>(null);

  // UI state
  const [copied, setCopied] = useState<boolean>(false);
  const [reordering, setReordering] = useState<boolean>(false);

  const fetchPlaylistData = useCallback(() => {
    if (isNaN(playlistId) || playlistId <= 0) {
      setError('Неверный идентификатор плейлиста');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setIsPrivateDenied(false);

    authFetch(`/api/music/playlists/${playlistId}`)
      .then(async (res) => {
        if (res.status === 403) {
          setIsPrivateDenied(true);
          throw new Error('Этот плейлист приватный и доступен только его создателю и участникам');
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Плейлист не найден');
        }
        return res.json();
      })
      .then((data) => {
        setPlaylist(data.playlist);
        setTracks(data.tracks || []);
        setIsOwner(Boolean(data.isOwner));
        setIsCollaborator(Boolean(data.isCollaborator));
        setCanAddTracks(Boolean(data.canAddTracks));
        setCanManageMembers(Boolean(data.canManageMembers));
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [playlistId, authFetch]);

  useEffect(() => {
    fetchPlaylistData();
  }, [fetchPlaylistData]);

  // Play whole playlist
  const handlePlayAll = (shuffleMode = false) => {
    if (tracks.length === 0) return;

    let playlistQueue = [...tracks];
    if (shuffleMode) {
      playlistQueue = [...tracks].sort(() => Math.random() - 0.5);
    }

    const first = playlistQueue[0];
    playTrack(
      first,
      playlistQueue,
      playlist
        ? {
            id: playlist.id,
            title: playlist.title,
            cover: playlist.cover,
            slug: `playlist-${playlist.id}`,
            artistName: `Плейлист от ${playlist.owner.username}`,
            artistSlug: playlist.owner.username,
          }
        : null
    );
  };

  // Play specific track in playlist
  const handlePlayTrack = (trackItem: PlaylistTrackItem) => {
    playTrack(
      trackItem,
      tracks,
      playlist
        ? {
            id: playlist.id,
            title: playlist.title,
            cover: playlist.cover,
            slug: `playlist-${playlist.id}`,
            artistName: `Плейлист от ${playlist.owner.username}`,
            artistSlug: playlist.owner.username,
          }
        : null
    );
  };

  // Move track up or down
  const handleMoveTrack = async (index: number, direction: 'up' | 'down') => {
    if (!isOwner || reordering) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tracks.length) return;

    const newTracks = [...tracks];
    const [moved] = newTracks.splice(index, 1);
    newTracks.splice(targetIndex, 0, moved);

    setTracks(newTracks);
    setReordering(true);

    try {
      const trackIds = newTracks.map((t) => t.id);
      await authFetch(`/api/music/playlists/${playlistId}/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds }),
      });
    } catch (err) {
      console.error('Failed to save track order:', err);
      fetchPlaylistData();
    } finally {
      setReordering(false);
    }
  };

  // Remove track from playlist
  const handleRemoveTrack = async (trackItem: PlaylistTrackItem) => {
    try {
      const res = await authFetch(`/api/music/playlists/${playlistId}/tracks/${trackItem.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setTracks((prev) => prev.filter((t) => t.id !== trackItem.id));
        setPlaylist((prev) =>
          prev
            ? {
                ...prev,
                tracksCount: Math.max(0, prev.tracksCount - 1),
                totalDuration: Math.max(0, prev.totalDuration - (trackItem.duration || 0)),
              }
            : null
        );
      }
    } catch (err) {
      console.error('Failed to remove track:', err);
    }
  };

  // Toggle favorite on track
  const handleToggleFavoriteTrack = async (trk: PlaylistTrackItem) => {
    if (!dbUser) return;
    const method = trk.isFavorite ? 'DELETE' : 'POST';
    try {
      const res = await authFetch(`/api/music/my/tracks/${trk.id}`, { method });
      if (res.ok) {
        setTracks((prev) =>
          prev.map((t) => (t.id === trk.id ? { ...t, isFavorite: !trk.isFavorite } : t))
        );
      }
    } catch (err) {
      console.error('Error toggling favorite track:', err);
    }
  };

  // Share playlist
  const handleShare = () => {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Delete playlist
  const handleDeletePlaylist = async () => {
    if (!isOwner || deleting) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/music/playlists/${playlistId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        navigate('/music/library?tab=playlists');
      }
    } catch (err) {
      console.error('Error deleting playlist:', err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const formatDurationMinutes = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0 мин';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs} ч ${mins} мин`;
    }
    return `${mins} мин ${secs > 0 ? `${secs} сек` : ''}`;
  };

  const formatTrackDuration = (seconds?: number | null) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const getVisibilityBadge = (vis: string) => {
    switch (vis) {
      case 'PRIVATE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Lock className="w-3.5 h-3.5" />
            <span>Приватный</span>
          </span>
        );
      case 'UNLISTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Доступ по ссылке</span>
          </span>
        );
      case 'PUBLIC':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <Globe className="w-3.5 h-3.5" />
            <span>Публичный</span>
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 space-y-4 animate-pulse">
        <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
        <span className="text-sm font-semibold text-slate-400">Загрузка плейлиста...</span>
      </div>
    );
  }

  if (isPrivateDenied) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-4 shadow-xl">
          <Lock className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Этот плейлист приватный</h2>
        <p className="text-slate-400 text-sm max-w-md mb-6">
          Создатель ограничил доступ к этому плейлисту. Только владелец и приглашённые участники могут просматривать его содержимое.
        </p>
        <button
          onClick={() => navigate('/music')}
          className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-600/30"
        >
          <ArrowLeft className="w-4 h-4" /> Вернуться в музыку
        </button>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4">
          <AlertTriangle className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{error || 'Плейлист не найден'}</h2>
        <p className="text-slate-400 text-sm max-w-md mb-6">
          Возможно, плейлист был удален владельцем или ссылка недействительна.
        </p>
        <button
          onClick={() => navigate('/music')}
          className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-600/30"
        >
          <ArrowLeft className="w-4 h-4" /> В раздел музыки
        </button>
      </div>
    );
  }

  const existingTrackIds = new Set(tracks.map((t) => Number(t.id)));

  return (
    <div className="relative min-h-screen text-slate-100 pb-24">
      {/* Background Visual Effect based on Playlist Cover */}
      {playlist.cover && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <img
            src={playlist.cover}
            alt=""
            className="w-full h-full object-cover scale-125 blur-3xl opacity-15"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#080A18]/80 via-[#080A18]/95 to-[#080A18]" />
        </div>
      )}

      <div className="relative z-10 space-y-8 max-w-5xl mx-auto">
        {/* Navigation Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <button
            onClick={() => navigate('/music')}
            className="hover:text-purple-400 transition cursor-pointer"
          >
            Музыка
          </button>
          <span>/</span>
          <button
            onClick={() => navigate('/music/library?tab=playlists')}
            className="hover:text-purple-400 transition cursor-pointer"
          >
            Плейлисты
          </button>
          <span>/</span>
          <span className="text-white font-semibold truncate max-w-[200px]">{playlist.title}</span>
        </nav>

        {/* HERO SECTION */}
        <section className="p-6 md:p-8 rounded-3xl bg-[#11152A]/80 backdrop-blur-2xl border border-[#1E2442] shadow-2xl flex flex-col md:flex-row gap-8 items-center md:items-start">
          {/* Cover image / collage */}
          <div className="relative group w-56 h-56 md:w-64 md:h-64 rounded-3xl overflow-hidden shrink-0 shadow-2xl border border-white/10 bg-slate-900">
            {playlist.cover ? (
              <img
                src={playlist.cover}
                alt={playlist.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-900/40 via-indigo-950/60 to-slate-950 text-purple-400 p-4 text-center">
                <ListMusic className="w-20 h-20 mb-2 stroke-1 opacity-70" />
                <span className="text-xs font-mono font-bold text-slate-300">ПЛЕЙЛИСТ</span>
              </div>
            )}
          </div>

          {/* Playlist Information */}
          <div className="flex-1 min-w-0 space-y-4 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 text-[11px] font-bold tracking-wider rounded-md border bg-purple-500/20 text-purple-300 border-purple-500/30 uppercase font-mono">
                Плейлист
              </span>
              {getVisibilityBadge(playlist.visibility)}

              {/* Collaborative badge */}
              {playlist.isCollaborative ? (
                <button
                  onClick={() => setIsMembersModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition cursor-pointer"
                  title="Открыть список участников"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Совместный плейлист</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
                  <User className="w-3.5 h-3.5" />
                  <span>Личный</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight leading-tight">
              {playlist.title}
            </h1>

            {playlist.description && (
              <p className="text-sm text-slate-300 max-w-2xl leading-relaxed whitespace-pre-line">
                {playlist.description}
              </p>
            )}

            {/* Author / Creator row */}
            <div className="flex items-center justify-center md:justify-start gap-3 pt-1 flex-wrap text-xs text-slate-300">
              <div
                onClick={() => navigate(`/u/${playlist.owner.username}`)}
                className="flex items-center gap-2 hover:text-purple-300 transition cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-800 border border-slate-700">
                  {playlist.owner.avatar ? (
                    <img src={playlist.owner.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-purple-300 bg-purple-950">
                      {playlist.owner.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="font-bold text-white group-hover:text-purple-300 underline-offset-2 group-hover:underline">
                  {playlist.owner.username}
                </span>
              </div>

              <span className="text-slate-600">•</span>
              <span className="text-slate-400">{tracks.length} треков</span>

              <span className="text-slate-600">•</span>
              <span className="text-slate-400">{formatDurationMinutes(playlist.totalDuration)}</span>

              {playlist.createdAt && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400">Создан {formatDate(playlist.createdAt)}</span>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-4 flex items-center justify-center md:justify-start gap-3 flex-wrap">
              <button
                onClick={() => handlePlayAll(false)}
                disabled={tracks.length === 0}
                className={`px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2.5 shadow-xl transition-all cursor-pointer ${
                  tracks.length === 0
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-500/25 hover:scale-102 active:scale-98'
                }`}
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Слушать</span>
              </button>

              <button
                onClick={() => handlePlayAll(true)}
                disabled={tracks.length === 0}
                className="px-4 py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 font-medium text-sm flex items-center gap-2 transition cursor-pointer"
                title="Слушать в случайном порядке"
              >
                <Shuffle className="w-4 h-4 text-purple-400" />
                <span>Перемешать</span>
              </button>

              {/* Add Track Button for Owner or Collaborator */}
              {canAddTracks && (
                <button
                  onClick={() => setIsAddTrackModalOpen(true)}
                  className="px-4 py-3 rounded-2xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 hover:text-white border border-purple-500/30 font-semibold text-sm flex items-center gap-2 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-purple-400" />
                  <span>Добавить трек</span>
                </button>
              )}

              {/* Collaborative Members Button */}
              {playlist.isCollaborative && (
                <button
                  onClick={() => setIsMembersModalOpen(true)}
                  className="px-4 py-3 rounded-2xl bg-[#1C1642] hover:bg-[#251D5A] text-emerald-300 hover:text-white border border-emerald-500/30 font-semibold text-sm flex items-center gap-2 transition cursor-pointer"
                >
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>Участники</span>
                </button>
              )}

              <button
                onClick={handleShare}
                className="px-4 py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 font-medium text-sm flex items-center gap-2 transition cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>{copied ? 'Ссылка скопирована' : 'Поделиться'}</span>
              </button>

              {/* Owner Edit / Delete */}
              {isOwner && (
                <>
                  <button
                    onClick={() => setIsEditModalOpen(true)}
                    className="px-4 py-3 rounded-2xl bg-[#1C1642] hover:bg-[#251D5A] text-purple-300 hover:text-white border border-purple-500/30 font-semibold text-sm flex items-center gap-2 transition cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4 text-purple-400" />
                    <span>Редактировать</span>
                  </button>

                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 transition cursor-pointer"
                    title="Удалить плейлист"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* TRACKLIST SECTION */}
        <section className="p-6 md:p-8 rounded-3xl bg-[#11152A]/80 backdrop-blur-xl border border-[#1E2442] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Music2 className="w-5 h-5 text-purple-400" />
              <span>Список треков</span>
            </h2>

            <div className="flex items-center gap-3">
              {canAddTracks && (
                <button
                  onClick={() => setIsAddTrackModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-semibold border border-purple-500/30 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить</span>
                </button>
              )}

              <span className="text-xs text-slate-400 font-mono">
                {tracks.length} {tracks.length === 1 ? 'трек' : tracks.length >= 2 && tracks.length <= 4 ? 'трека' : 'треков'}
              </span>
            </div>
          </div>

          {tracks.length === 0 ? (
            <div className="py-16 text-center space-y-4 bg-slate-900/40 rounded-3xl border border-slate-800">
              <div className="w-16 h-16 rounded-3xl bg-purple-950/40 border border-purple-500/20 mx-auto flex items-center justify-center text-purple-400">
                <Music2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">В плейлисте пока нет треков</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {canAddTracks
                    ? 'Нажмите «Добавить трек», чтобы наполнить плейлист из каталога Dodik Tracker.'
                    : 'Владелец пока не добавил треки в этот плейлист.'}
                </p>
              </div>
              {canAddTracks && (
                <button
                  onClick={() => setIsAddTrackModalOpen(true)}
                  className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center gap-2 mx-auto cursor-pointer shadow-lg shadow-purple-600/30"
                >
                  <Plus className="w-4 h-4" />
                  <span>Добавить первый трек</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {tracks.map((trk, index) => {
                const canDeleteTrack =
                  trk.canRemove ??
                  (isOwner || (playlist.isCollaborative && trk.addedBy?.id === dbUser?.id));

                const reorderArrows = isOwner ? (
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => handleMoveTrack(index, 'up')}
                      disabled={index === 0 || reordering}
                      className="p-1 rounded text-slate-500 hover:text-white disabled:opacity-20 disabled:hover:text-slate-500 cursor-pointer"
                      title="Переместить выше"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveTrack(index, 'down')}
                      disabled={index === tracks.length - 1 || reordering}
                      className="p-1 rounded text-slate-500 hover:text-white disabled:opacity-20 disabled:hover:text-slate-500 cursor-pointer"
                      title="Переместить ниже"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : null;

                return (
                  <MusicTrackRow
                    key={`${trk.id}-${index}`}
                    track={{
                      ...trk,
                      audioFile: trk.audioFile,
                      slug: trk.slug,
                      videoId: trk.videoId,
                      providerTrackId: trk.providerTrackId,
                      youtubeUrl: trk.youtubeUrl,
                      thumbnail: trk.releaseCover || trk.thumbnail,
                      trackNumber: index + 1,
                      addedBy: trk.addedBy
                        ? {
                            id: String(trk.addedBy.id),
                            username: trk.addedBy.username,
                            avatar: trk.addedBy.avatar || null,
                          }
                        : null,
                    }}
                    index={index + 1}
                    showIndex={true}
                    showCover={true}
                    onPlay={() => handlePlayTrack(trk)}
                    extraActions={reorderArrows}
                    onRemove={canDeleteTrack ? () => handleRemoveTrack(trk) : undefined}
                    removeLabel="Удалить из этого плейлиста"
                    queueContext={tracks.map((t, i) => ({
                      ...t,
                      audioFile: t.audioFile,
                      slug: t.slug,
                      videoId: t.videoId,
                      providerTrackId: t.providerTrackId,
                      youtubeUrl: t.youtubeUrl,
                      thumbnail: t.releaseCover || t.thumbnail,
                      trackNumber: i + 1,
                    }))}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Edit Playlist Modal */}
      {isOwner && playlist && (
        <PlaylistModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          playlist={playlist}
          onSaved={(updated) => {
            setPlaylist((prev) => (prev ? { ...prev, ...updated } : updated));
          }}
        />
      )}

      {/* Collaborative Members Modal */}
      {playlist && (
        <PlaylistMembersModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          playlistId={playlist.id}
          playlistTitle={playlist.title}
          isOwner={isOwner}
          ownerUser={playlist.owner}
          onMembersUpdated={fetchPlaylistData}
        />
      )}

      {/* Add Track Modal */}
      {playlist && (
        <PlaylistAddTrackModal
          isOpen={isAddTrackModalOpen}
          onClose={() => setIsAddTrackModalOpen(false)}
          playlistId={playlist.id}
          playlistTitle={playlist.title}
          existingTrackIds={existingTrackIds}
          onTrackAdded={() => fetchPlaylistData()}
        />
      )}

      {/* Add To Playlist Modal */}
      {addToPlaylistTrack && (
        <AddToPlaylistModal
          isOpen={Boolean(addToPlaylistTrack)}
          onClose={() => setAddToPlaylistTrack(null)}
          track={addToPlaylistTrack}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080A18]/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-[#0F1328] border border-[#232B54] p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Удалить плейлист?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Плейлист «{playlist.title}» будет удалён без возможности восстановления. Треки из каталога затронуты не будут.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDeletePlaylist}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Удалить</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
