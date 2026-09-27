import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ListMusic,
  Plus,
  Check,
  Loader2,
  Lock,
  Globe,
  Link as LinkIcon,
  Music2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export interface AddToPlaylistTrackInfo {
  id: number | string;
  title: string;
  releaseTitle?: string;
  releaseCover?: string | null;
  artistName?: string;
  duration?: number | null;
}

interface UserPlaylistOption {
  id: number;
  title: string;
  cover: string | null;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  isCollaborative?: boolean;
  isOwner?: boolean;
  tracksCount: number;
  containsTrack: boolean;
}

interface AddToPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: AddToPlaylistTrackInfo | null;
  onPlaylistChanged?: () => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({
  isOpen,
  onClose,
  track,
  onPlaylistChanged,
}) => {
  const { authFetch, dbUser } = useAuth();

  const [playlists, setPlaylists] = useState<UserPlaylistOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [togglingPlaylistId, setTogglingPlaylistId] = useState<number | null>(null);

  // New playlist creation inline state
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newVisibility, setNewVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>('PUBLIC');
  const [creating, setCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const fetchUserPlaylists = useCallback(() => {
    if (!track || !dbUser) return;
    setLoading(true);
    authFetch(`/api/music/playlists/my/for-track/${track.id}`)
      .then((res) => (res.ok ? res.json() : { playlists: [] }))
      .then((data) => {
        setPlaylists(data.playlists || []);
      })
      .catch((err) => console.error('Error fetching user playlists for track:', err))
      .finally(() => setLoading(false));
  }, [track, dbUser, authFetch]);

  useEffect(() => {
    if (isOpen && track && dbUser) {
      fetchUserPlaylists();
      setShowCreateForm(false);
      setNewTitle('');
      setNewDescription('');
      setNewVisibility('PUBLIC');
      setCreateError(null);
      setSuccessToast(null);
    }
  }, [isOpen, track, dbUser, fetchUserPlaylists]);

  if (!isOpen || !track) return null;

  const handleToggleTrackInPlaylist = async (playlist: UserPlaylistOption) => {
    if (togglingPlaylistId) return;
    setTogglingPlaylistId(playlist.id);
    setCreateError(null);

    try {
      if (playlist.containsTrack) {
        // Remove track
        const res = await authFetch(`/api/music/playlists/${playlist.id}/tracks/${track.id}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (res.ok) {
          setPlaylists((prev) =>
            prev.map((p) =>
              p.id === playlist.id
                ? { ...p, containsTrack: false, tracksCount: Math.max(0, p.tracksCount - 1) }
                : p
            )
          );
          setSuccessToast(`Удалено из «${playlist.title}»`);
          setTimeout(() => setSuccessToast(null), 2500);
          onPlaylistChanged?.();
        } else {
          setCreateError(data.error || 'Не удалось удалить трек из плейлиста');
        }
      } else {
        // Add track
        const res = await authFetch(`/api/music/playlists/${playlist.id}/tracks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackId: track.id }),
        });
        const data = await res.json();
        if (res.ok) {
          setPlaylists((prev) =>
            prev.map((p) =>
              p.id === playlist.id
                ? { ...p, containsTrack: true, tracksCount: p.tracksCount + 1 }
                : p
            )
          );
          setSuccessToast(`Добавлено в «${playlist.title}»`);
          setTimeout(() => setSuccessToast(null), 2500);
          onPlaylistChanged?.();
        } else {
          setCreateError(data.error || 'Не удалось добавить трек в плейлист');
        }
      }
    } catch (err: any) {
      setCreateError(err.message || 'Сетевая ошибка');
    } finally {
      setTogglingPlaylistId(null);
    }
  };

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setCreateError('Введите название плейлиста');
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      // 1. Create playlist
      const createRes = await authFetch('/api/music/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
          visibility: newVisibility,
        }),
      });
      const createData = await createRes.json();

      if (!createRes.ok || !createData.playlist) {
        throw new Error(createData.error || 'Ошибка при создании плейлиста');
      }

      const createdId = createData.playlist.id;

      // 2. Add track to new playlist
      const addRes = await authFetch(`/api/music/playlists/${createdId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: track.id }),
      });
      const addData = await addRes.json();

      if (!addRes.ok) {
        throw new Error(addData.error || 'Плейлист создан, но не удалось добавить трек');
      }

      setSuccessToast(`Плейлист «${newTitle.trim()}» создан с треком!`);
      setTimeout(() => setSuccessToast(null), 2500);

      // Refresh list
      setShowCreateForm(false);
      setNewTitle('');
      setNewDescription('');
      fetchUserPlaylists();
      onPlaylistChanged?.();
    } catch (err: any) {
      setCreateError(err.message || 'Не удалось создать плейлист');
    } finally {
      setCreating(false);
    }
  };

  const getVisibilityIcon = (vis: string) => {
    switch (vis) {
      case 'PRIVATE':
        return <span title="Приватный"><Lock className="w-3 h-3 text-amber-400" /></span>;
      case 'UNLISTED':
        return <span title="Доступен по ссылке"><LinkIcon className="w-3 h-3 text-cyan-400" /></span>;
      case 'PUBLIC':
      default:
        return <span title="Публичный"><Globe className="w-3 h-3 text-purple-400" /></span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080A18]/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-3xl bg-[#0F1328] border border-[#232B54] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#1E2442] flex items-center justify-between bg-[#131835]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <ListMusic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Добавить в плейлист</h3>
              <p className="text-[11px] text-[#94A3B8]">Выберите плейлист или создайте новый</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Track Preview */}
        <div className="px-5 py-3.5 bg-[#0B0E20] border-b border-[#1E2442] flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0">
            {track.releaseCover ? (
              <img src={track.releaseCover} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600">
                <Music2 className="w-5 h-5" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-white truncate">{track.title}</h4>
            <p className="text-[11px] text-[#94A3B8] truncate">
              {track.artistName} {track.releaseTitle ? `• ${track.releaseTitle}` : ''}
            </p>
          </div>
        </div>

        {/* Feedback / Toast */}
        {successToast && (
          <div className="mx-5 mt-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {createError && (
          <div className="mx-5 mt-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{createError}</span>
          </div>
        )}

        {/* Playlists List */}
        <div className="p-5 flex-1 overflow-y-auto space-y-2.5 custom-scrollbar min-h-[160px]">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              <span className="text-xs font-medium">Загрузка плейлистов...</span>
            </div>
          ) : playlists.length === 0 && !showCreateForm ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-950/30 border border-purple-500/20 mx-auto flex items-center justify-center text-purple-400">
                <ListMusic className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-white">У вас ещё нет плейлистов</p>
                <p className="text-[11px] text-[#94A3B8] max-w-xs mx-auto">
                  Создайте первый плейлист, чтобы сохранять понравившиеся треки
                </p>
              </div>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-1.5 mx-auto cursor-pointer shadow-md shadow-purple-600/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Создать плейлист</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {playlists.map((pl) => {
                const isToggling = togglingPlaylistId === pl.id;
                return (
                  <div
                    key={pl.id}
                    onClick={() => handleToggleTrackInPlaylist(pl)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer group select-none ${
                      pl.containsTrack
                        ? 'bg-purple-950/30 border-purple-500/40 text-white'
                        : 'bg-[#121633]/60 hover:bg-[#161B3D] border-[#1E2442] text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0">
                        {pl.cover ? (
                          <img src={pl.cover} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-purple-400/60 bg-purple-950/40">
                            <ListMusic className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h5 className="text-xs font-bold truncate group-hover:text-purple-300 transition">
                            {pl.title}
                          </h5>
                          {pl.isCollaborative && (
                            <span title="Совместный плейлист">
                              <Users className="w-3 h-3 text-emerald-400" />
                            </span>
                          )}
                          {getVisibilityIcon(pl.visibility)}
                        </div>
                        <p className="text-[10px] text-[#94A3B8]">
                          {pl.tracksCount} {pl.tracksCount === 1 ? 'трек' : pl.tracksCount >= 2 && pl.tracksCount <= 4 ? 'трека' : 'треков'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isToggling}
                      className={`w-7 h-7 rounded-xl flex items-center justify-center transition shrink-0 ${
                        pl.containsTrack
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                          : 'bg-slate-800/80 group-hover:bg-slate-700 text-slate-400 group-hover:text-white'
                      }`}
                    >
                      {isToggling ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : pl.containsTrack ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Inline Create Form */}
          {showCreateForm ? (
            <form
              onSubmit={handleCreateAndAdd}
              className="p-4 rounded-2xl bg-[#141A3C] border border-purple-500/30 space-y-3 mt-3 animate-in fade-in"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  Новый плейлист
                </span>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  Отмена
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Название <span className="text-purple-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  placeholder="Например, Любимый фон или Вайб"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#090C1B] border border-[#232B54] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Видимость
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNewVisibility('PUBLIC')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer border ${
                      newVisibility === 'PUBLIC'
                        ? 'bg-purple-600 text-white border-purple-400'
                        : 'bg-[#090C1B] text-slate-400 border-[#232B54] hover:text-white'
                    }`}
                  >
                    <Globe className="w-3 h-3" />
                    <span>Публичный</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewVisibility('UNLISTED')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer border ${
                      newVisibility === 'UNLISTED'
                        ? 'bg-cyan-600 text-white border-cyan-400'
                        : 'bg-[#090C1B] text-slate-400 border-[#232B54] hover:text-white'
                    }`}
                  >
                    <LinkIcon className="w-3 h-3" />
                    <span>По ссылке</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewVisibility('PRIVATE')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer border ${
                      newVisibility === 'PRIVATE'
                        ? 'bg-amber-600 text-white border-amber-400'
                        : 'bg-[#090C1B] text-slate-400 border-[#232B54] hover:text-white'
                    }`}
                  >
                    <Lock className="w-3 h-3" />
                    <span>Приватный</span>
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-600/30"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Создать и добавить трек</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            playlists.length > 0 && (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="w-full py-2.5 rounded-xl bg-[#121633] hover:bg-[#181E44] border border-[#232B54] text-purple-300 hover:text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <Plus className="w-4 h-4 text-purple-400" />
                <span>Создать новый плейлист</span>
              </button>
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0B0E20] border-t border-[#1E2442] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
