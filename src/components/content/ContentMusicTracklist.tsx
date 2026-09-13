import React, { useState } from 'react';
import { Music, Play, Pause, Clock, Disc } from 'lucide-react';
import { ContentTrack } from '../../types/content.ts';

interface ContentMusicTracklistProps {
  tracks: ContentTrack[];
}

export const ContentMusicTracklist: React.FC<ContentMusicTracklistProps> = ({ tracks }) => {
  const [playingTrackId, setPlayingTrackId] = useState<number | string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  if (!tracks || tracks.length === 0) return null;

  const handleTogglePlay = (track: ContentTrack) => {
    if (!track.previewUrl) return;

    if (playingTrackId === (track.id || track.trackNumber)) {
      if (audioElement) {
        audioElement.pause();
      }
      setPlayingTrackId(null);
      setAudioElement(null);
      return;
    }

    if (audioElement) {
      audioElement.pause();
    }

    const audio = new Audio(track.previewUrl);
    audio.play();
    audio.onended = () => {
      setPlayingTrackId(null);
      setAudioElement(null);
    };
    setAudioElement(audio);
    setPlayingTrackId(track.id || track.trackNumber);
  };

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
          <Disc className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Треклист альбома</h2>
          <p className="text-xs text-zinc-400">Всего {tracks.length} композиций</p>
        </div>
      </div>

      {/* Tracks Table */}
      <div className="space-y-1.5">
        {tracks.map((track, idx) => {
          const trackKey = track.id || track.trackNumber || idx + 1;
          const isPlaying = playingTrackId === trackKey;

          return (
            <div
              key={trackKey}
              className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-4 group ${
                isPlaying
                  ? 'bg-purple-950/40 border-purple-800/60 text-purple-200'
                  : 'bg-zinc-950/60 border-zinc-800/60 hover:bg-zinc-950 hover:border-zinc-700 text-zinc-300'
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Number or Play button */}
                <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                  {track.previewUrl ? (
                    <button
                      onClick={() => handleTogglePlay(track)}
                      className="text-purple-400 hover:text-purple-300 transition-colors"
                      title={isPlaying ? 'Пауза' : 'Слушать превью'}
                    >
                      {isPlaying ? <Pause className="w-4 h-4 fill-purple-400" /> : <Play className="w-4 h-4 fill-purple-400" />}
                    </button>
                  ) : (
                    <span className="text-xs font-mono font-bold text-zinc-500">
                      {track.trackNumber || idx + 1}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-zinc-100 truncate group-hover:text-purple-300 transition-colors">
                    {track.title}
                  </div>
                  {track.artists && track.artists.length > 0 && (
                    <div className="text-[11px] text-zinc-400 truncate">
                      {track.artists.join(', ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Duration */}
              {track.duration && (
                <div className="flex items-center gap-1 text-xs font-mono text-zinc-500 shrink-0">
                  <Clock className="w-3 h-3 text-zinc-600" />
                  <span>{track.duration}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
