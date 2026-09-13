import React, { useState } from 'react';
import { Video, Play, X, ExternalLink } from 'lucide-react';
import { ContentVideo } from '../../types/content.ts';

interface ContentVideosProps {
  videos: ContentVideo[];
}

export const ContentVideos: React.FC<ContentVideosProps> = ({ videos }) => {
  const [selectedVideo, setSelectedVideo] = useState<ContentVideo | null>(null);

  if (!videos || videos.length === 0) return null;

  const getVideoEmbedUrl = (v: ContentVideo) => {
    if (v.key) {
      return `https://www.youtube.com/embed/${v.key}?autoplay=1`;
    }
    if (v.url) {
      if (v.url.includes('youtube.com/watch?v=')) {
        const id = v.url.split('v=')[1]?.split('&')[0];
        return `https://www.youtube.com/embed/${id}?autoplay=1`;
      }
      if (v.url.includes('youtu.be/')) {
        const id = v.url.split('youtu.be/')[1]?.split('?')[0];
        return `https://www.youtube.com/embed/${id}?autoplay=1`;
      }
      return v.url;
    }
    return '';
  };

  const getVideoThumbnail = (v: ContentVideo) => {
    if (v.thumbnailUrl) return v.thumbnailUrl;
    if (v.key) return `https://img.youtube.com/vi/${v.key}/hqdefault.jpg`;
    if (v.url) {
      if (v.url.includes('youtube.com/watch?v=')) {
        const id = v.url.split('v=')[1]?.split('&')[0];
        return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
      }
      if (v.url.includes('youtu.be/')) {
        const id = v.url.split('youtu.be/')[1]?.split('?')[0];
        return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
      }
    }
    return '';
  };

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
          <Video className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Трейлеры и видеоматериалы</h2>
          <p className="text-xs text-zinc-400">Официальные ролики, тизеры и промо ({videos.length})</p>
        </div>
      </div>

      {/* Grid of Video Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {videos.map((vid, idx) => {
          const thumb = getVideoThumbnail(vid);
          return (
            <button
              key={vid.id || idx}
              onClick={() => setSelectedVideo(vid)}
              className="group p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-purple-500/50 hover:bg-zinc-950 transition-all flex flex-col text-left"
            >
              {/* Thumbnail with Play Overlay */}
              <div className="aspect-video w-full rounded-xl overflow-hidden bg-zinc-900 mb-2.5 border border-zinc-800 relative">
                {thumb ? (
                  <img
                    src={thumb}
                    alt={vid.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    <Video className="w-8 h-8" />
                  </div>
                )}

                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <div className="w-11 h-11 rounded-full bg-purple-600/90 text-white flex items-center justify-center shadow-xl group-hover:scale-110 group-hover:bg-purple-500 transition-all">
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  </div>
                </div>

                {vid.type && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-zinc-700 text-[10px] font-bold text-zinc-200">
                    {vid.type}
                  </div>
                )}
              </div>

              {/* Title */}
              <div className="text-xs font-bold text-zinc-100 group-hover:text-purple-300 transition-colors line-clamp-1">
                {vid.name}
              </div>
            </button>
          );
        })}
      </div>

      {/* Video Modal Player */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-4xl flex flex-col gap-3">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100 truncate pr-4">{selectedVideo.name}</h3>
              <button
                onClick={() => setSelectedVideo(null)}
                className="p-2 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Frame */}
            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black border border-zinc-800 shadow-2xl">
              <iframe
                src={getVideoEmbedUrl(selectedVideo)}
                title={selectedVideo.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
