import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { useToast } from '../../context/NotificationContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { MusicTrackCard, AnyTrackItem } from './MusicTrackCard.tsx';

export interface SimilarTracksModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackId: string | number;
  artistName?: string;
  trackTitle?: string;
  coverUrl?: string | null;
}

export const SimilarTracksModal: React.FC<SimilarTracksModalProps> = ({
  isOpen,
  onClose,
  trackId,
  artistName,
  trackTitle,
  coverUrl,
}) => {
  const { playTrack } = useMusicPlayer();
  const { showToast } = useToast();
  const { navigate } = useRouter();

  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !trackId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const qParams = new URLSearchParams();
    if (artistName) qParams.set('artist', artistName);
    if (trackTitle) qParams.set('title', trackTitle);

    fetch(`/api/music/recommendations/similar/${encodeURIComponent(String(trackId))}?${qParams.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('Не удалось загрузить похожие треки');
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setTracks(data.tracks || []);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Ошибка загрузки');
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, trackId, artistName, trackTitle]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl bg-[#0B0D20] border border-[#1E2442] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#1E2442] flex items-center justify-between bg-gradient-to-r from-[#11152A] to-[#0B0D20]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold font-mono text-white truncate">Похожие треки</h3>
              <p className="text-xs text-slate-400 truncate">
                На основе {trackTitle ? `«${trackTitle}»` : 'выбранной композиции'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Закрыть"
            aria-label="Закрыть окно похожих треков"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-2 custom-scrollbar flex-1">
          {loading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              <span className="text-xs font-mono">Подбираем похожие композиции...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-rose-400 font-mono text-xs">{error}</div>
          ) : tracks.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-mono text-xs">
              Похожие треки не найдены
            </div>
          ) : (
            tracks.map((t, idx) => {
              const trackIdStr = String(t.id || t.trackId || '');
              const cleanVideoId = t.provider === 'youtube' && trackIdStr ? trackIdStr.replace(/^yt_/, '') : undefined;
              const trackItem: AnyTrackItem = {
                id: trackIdStr,
                kind: t.provider === 'youtube' ? 'external' : 'dodik',
                source: t.provider === 'youtube' ? 'youtube' : 'dodik',
                videoId: cleanVideoId,
                providerTrackId: cleanVideoId,
                title: t.title,
                artistName: t.artistName,
                artists: t.artists,
                releaseTitle: t.releaseTitle || null,
                releaseCover: t.releaseCover || null,
                thumbnail: t.releaseCover || null,
                durationSeconds: t.durationSeconds || null,
                explicit: Boolean(t.explicit),
                explanation: t.explanation,
              };

              const allQueueItems: AnyTrackItem[] = tracks.map((item) => {
                const itemIdStr = String(item.id || item.trackId || '');
                const itemCleanVideoId = item.provider === 'youtube' && itemIdStr ? itemIdStr.replace(/^yt_/, '') : undefined;
                return {
                  id: itemIdStr,
                  kind: item.provider === 'youtube' ? 'external' : 'dodik',
                  source: item.provider === 'youtube' ? 'youtube' : 'dodik',
                  videoId: itemCleanVideoId,
                  providerTrackId: itemCleanVideoId,
                  title: item.title,
                  artistName: item.artistName,
                  artists: item.artists,
                  releaseTitle: item.releaseTitle || null,
                  releaseCover: item.releaseCover || null,
                  thumbnail: item.releaseCover || null,
                  durationSeconds: item.durationSeconds || null,
                  explicit: Boolean(item.explicit),
                  explanation: item.explanation,
                };
              });

              return (
                <MusicTrackCard
                  key={trackIdStr || idx}
                  track={trackItem}
                  queueContext={allQueueItems}
                  variant="row"
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
