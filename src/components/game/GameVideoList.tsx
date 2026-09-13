import React, { useState } from 'react';
import { Video as VideoIcon, Play, Film } from 'lucide-react';
import { UnifiedVideo } from '../../types/unifiedGame.ts';

interface GameVideoListProps {
  videos: UnifiedVideo[];
}

export const GameVideoList: React.FC<GameVideoListProps> = ({ videos }) => {
  const [activeVideo, setActiveVideo] = useState<UnifiedVideo | null>(videos[0] || null);

  if (videos.length === 0) return null;

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-6">
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
          <Film className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Видео и официальные трейлеры</h2>
          <p className="text-xs text-zinc-400">Геймплейные ролики и тизеры</p>
        </div>
      </div>

      {/* Main Video Player */}
      {activeVideo && (
        <div className="space-y-3">
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-zinc-800 shadow-2xl">
            {activeVideo.site === 'YouTube' ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${activeVideo.key || activeVideo.url.replace(/.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#&?]*).*/, '$1')}`}
                title={activeVideo.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video
                src={activeVideo.url}
                controls
                poster={activeVideo.thumbnailUrl}
                className="w-full h-full object-contain"
              />
            )}
          </div>
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-zinc-200">{activeVideo.title}</h3>
            <span className="text-xs font-semibold text-purple-400 px-2 py-0.5 rounded-lg bg-purple-950/50 border border-purple-800/40">
              {activeVideo.site}
            </span>
          </div>
        </div>
      )}

      {/* Video Selector Carousel if multiple */}
      {videos.length > 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
          {videos.map((vid, idx) => {
            const isSelected = activeVideo?.id === vid.id;
            return (
              <button
                key={vid.id || idx}
                onClick={() => setActiveVideo(vid)}
                className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col gap-2 ${
                  isSelected
                    ? 'bg-purple-950/40 border-purple-500 ring-1 ring-purple-500/50'
                    : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 flex items-center justify-center">
                  {vid.thumbnailUrl ? (
                    <img src={vid.thumbnailUrl} alt={vid.title} className="w-full h-full object-cover" />
                  ) : (
                    <VideoIcon className="w-6 h-6 text-zinc-600" />
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Play className="w-5 h-5 text-white fill-white/80" />
                  </div>
                </div>
                <div className="text-xs font-bold text-zinc-200 truncate">{vid.title}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
