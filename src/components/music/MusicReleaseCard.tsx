import React, { useState } from 'react';
import { Play, Pause, Disc, Star, Music2, Loader2 } from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';

export interface ReleaseCardData {
  id: number;
  artistId: number;
  title: string;
  slug: string;
  type: 'SINGLE' | 'EP' | 'ALBUM';
  cover?: string | null;
  releaseDate?: string | null;
  stageName?: string | null;
  artistSlug?: string | null;
  avgScore?: number;
  reviewsCount?: number;
  tracksCount?: number;
}

export interface MusicReleaseCardProps {
  release: ReleaseCardData;
}

export const MusicReleaseCard: React.FC<MusicReleaseCardProps> = ({ release }) => {
  const { navigate } = useRouter();
  const { currentTrack, isPlaying, togglePlayPause, playTrack } = useMusicPlayer();
  const [loadingAudio, setLoadingAudio] = useState(false);

  const isCurrentReleasePlaying =
    currentTrack?.releaseId === release.id ||
    currentTrack?.releaseSlug === release.slug;

  const handlePlayClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isCurrentReleasePlaying) {
      togglePlayPause();
      return;
    }

    setLoadingAudio(true);
    try {
      const res = await fetch(`/api/music/releases/${release.slug || release.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.tracks && data.tracks.length > 0) {
          const formattedTracks = data.tracks.map((t: any) => ({
            id: t.id,
            releaseId: release.id,
            releaseTitle: release.title,
            releaseCover: release.cover,
            releaseSlug: release.slug,
            artistId: release.artistId,
            artistName: release.stageName || 'Исполнитель',
            artistSlug: release.artistSlug || '',
            title: t.title,
            slug: t.slug,
            trackNumber: t.trackNumber,
            audioFile: t.audioFile,
            duration: t.duration,
            explicit: t.explicit,
            lyrics: t.lyrics,
            authorNote: t.authorNote,
          }));

          playTrack(formattedTracks[0], formattedTracks, {
            id: release.id,
            title: release.title,
            cover: release.cover,
            slug: release.slug,
            artistName: release.stageName || 'Исполнитель',
            artistSlug: release.artistSlug || '',
          });
        } else {
          alert('В этом релизе пока нет загруженных аудиозаписей');
        }
      }
    } catch (err) {
      console.error('Failed to load release tracks:', err);
    } finally {
      setLoadingAudio(false);
    }
  };

  return (
    <div
      onClick={() => navigate(`/music/release/${release.slug || release.id}`)}
      className="group p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#382B73] transition-all duration-300 hover:shadow-2xl hover:shadow-purple-900/20 cursor-pointer flex flex-col justify-between"
    >
      <div className="space-y-3">
        {/* Cover Art Container */}
        <div className="relative aspect-square rounded-xl overflow-hidden bg-[#11152A] border border-[#1E2442] group-hover:shadow-lg transition-all">
          {release.cover ? (
            <img
              src={release.cover}
              alt={release.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1C143F] to-[#0D1022] text-purple-400 flex items-center justify-center">
              <Disc className="w-12 h-12 opacity-60" />
            </div>
          )}

          {/* Type Badge */}
          <div className="absolute top-2.5 left-2.5">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-black/70 backdrop-blur-md text-purple-300 border border-white/10 uppercase tracking-wider">
              {release.type}
            </span>
          </div>

          {/* Hover Play Button */}
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center transition-opacity duration-300 ${
              isCurrentReleasePlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <button
              onClick={handlePlayClick}
              disabled={loadingAudio}
              className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-xl shadow-purple-950/60 transition-transform transform active:scale-95 hover:scale-105 cursor-pointer"
            >
              {loadingAudio ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isCurrentReleasePlaying && isPlaying ? (
                <Pause className="w-5 h-5 fill-white" />
              ) : (
                <Play className="w-5 h-5 fill-white ml-0.5" />
              )}
            </button>
          </div>
        </div>

        {/* Info Area */}
        <div className="space-y-1 min-w-0">
          <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors truncate font-mono">
            {release.title}
          </h3>

          <p className="text-xs text-[#94A3B8] hover:text-white truncate">
            {release.stageName || 'Исполнитель'}
          </p>
        </div>
      </div>

      {/* Footer Metadata */}
      <div className="pt-3 mt-2 border-t border-[#1E2442]/60 flex items-center justify-between text-[11px] font-mono text-[#64748B]">
        <div className="flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30 shrink-0" />
          <span className="font-bold text-white">{release.avgScore ? `${release.avgScore}` : '—'}</span>
          {Boolean(release.reviewsCount) && (
            <span className="text-[#64748B]">({release.reviewsCount})</span>
          )}
        </div>

        {release.tracksCount !== undefined && (
          <div className="flex items-center gap-1 text-[#64748B]">
            <Music2 className="w-3 h-3" />
            <span>{release.tracksCount} треков</span>
          </div>
        )}
      </div>
    </div>
  );
};
