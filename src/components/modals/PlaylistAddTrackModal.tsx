import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Plus,
  Check,
  Music2,
  Loader2,
  AlertCircle,
  Play,
  Pause,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { dedupeTracks, getStableTrackKey } from '../../utils/musicIdentity.ts';

interface TrackItem {
  id: number;
  title: string;
  artistName: string;
  artistSlug?: string;
  releaseTitle?: string;
  releaseCover?: string | null;
  duration?: number | null;
  explicit?: boolean;
}

interface PlaylistAddTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlistId: number;
  playlistTitle: string;
  existingTrackIds: Set<number>;
  onTrackAdded: (track: TrackItem) => void;
}

export const PlaylistAddTrackModal: React.FC<PlaylistAddTrackModalProps> = ({
  isOpen,
  onClose,
  playlistId,
  playlistTitle,
  existingTrackIds,
  onTrackAdded,
}) => {
  const { authFetch } = useAuth();
  const { playTrack, currentTrack, isPlaying } = useMusicPlayer();

  const [query, setQuery] = useState<string>('');
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Load initial popular/recent tracks or search
  useEffect(() => {
    if (!isOpen) return;
    setAddedIds(new Set());
    setError(null);

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const url = query.trim()
          ? `/api/music/search?q=${encodeURIComponent(query.trim())}&limit=20`
          : `/api/music/search?limit=15`;
        const res = await authFetch(url);
        if (res.ok) {
          const data = await res.json();
          const list = data.tracks || data.items || data || [];
          setTracks(dedupeTracks(list));
        }
      } catch (err: any) {
        console.error('Error fetching tracks for playlist modal:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [isOpen, query, authFetch]);

  if (!isOpen) return null;

  const handleAddTrack = async (trk: TrackItem) => {
    setAddingId(trk.id);
    setError(null);
    try {
      const res = await authFetch(`/api/music/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: trk.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось добавить трек');
      }

      setAddedIds((prev) => new Set([...prev, trk.id]));
      onTrackAdded(trk);
    } catch (err: any) {
      setError(err.message || 'Ошибка добавления трека');
    } finally {
      setAddingId(null);
    }
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080A18]/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-3xl bg-[#0F1328] border border-[#232B54] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[#1E2442] flex items-center justify-between bg-[#131835]/50 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-white leading-tight">Добавить треки</h3>
            <p className="text-xs text-[#94A3B8] truncate max-w-[280px]">
              В плейлист «{playlistTitle}»
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-[#1E2442] bg-[#090C1B] shrink-0 space-y-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Поиск треков по названию или исполнителю..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#11152A] border border-[#232B54] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              autoFocus
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Track List */}
        <div className="p-4 space-y-2 overflow-y-auto custom-scrollbar flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span className="text-xs font-medium">Поиск треков...</span>
            </div>
          ) : tracks.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Music2 className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-xs">Треки не найдены</p>
            </div>
          ) : (
            tracks.map((trk, idx) => {
              const inPlaylist = existingTrackIds.has(trk.id) || addedIds.has(trk.id);
              const isAdding = addingId === trk.id;
              const isCurrentPlaying = currentTrack?.id === trk.id && isPlaying;

              return (
                <div
                  key={getStableTrackKey(trk, idx)}
                  className="p-2.5 rounded-2xl bg-[#121633]/60 hover:bg-[#181E44] border border-[#1E2442] flex items-center justify-between gap-3 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0">
                      {trk.releaseCover ? (
                        <img src={trk.releaseCover} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <Music2 className="w-4 h-4" />
                        </div>
                      )}
                      <button
                        onClick={() =>
                          playTrack(
                            { ...trk, source: 'dodik' } as any,
                            [{ ...trk, source: 'dodik' }] as any,
                            null
                          )
                        }
                        className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                      >
                        {isCurrentPlaying ? (
                          <Pause className="w-4 h-4 fill-white" />
                        ) : (
                          <Play className="w-4 h-4 fill-white" />
                        )}
                      </button>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">{trk.title}</span>
                        {trk.explicit && (
                          <span className="px-1 text-[8px] font-bold rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            18+
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {trk.artistName} {trk.releaseTitle ? `• ${trk.releaseTitle}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-slate-500">
                      {formatDuration(trk.duration)}
                    </span>

                    <button
                      onClick={() => handleAddTrack(trk)}
                      disabled={inPlaylist || isAdding}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        inPlaylist
                          ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 cursor-default'
                          : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20'
                      }`}
                    >
                      {isAdding ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : inPlaylist ? (
                        <>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>В плейлисте</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Добавить</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0B0E20] border-t border-[#1E2442] flex justify-end shrink-0">
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
