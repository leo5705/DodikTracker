import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, ChevronLeft, ChevronRight, X, Maximize2 } from 'lucide-react';
import { ContentImage } from '../../types/content.ts';

interface ContentGalleryProps {
  images: ContentImage[];
  title?: string;
  subtitle?: string;
}

export const ContentGallery: React.FC<ContentGalleryProps> = ({
  images,
  title = 'Кадры, фото и постеры',
  subtitle,
}) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeIdx === null) return;
      if (e.key === 'Escape') setActiveIdx(null);
      if (e.key === 'ArrowRight') setActiveIdx((prev) => (prev !== null && prev < images.length - 1 ? prev + 1 : 0));
      if (e.key === 'ArrowLeft') setActiveIdx((prev) => (prev !== null && prev > 0 ? prev - 1 : images.length - 1));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIdx, images.length]);

  if (!images || images.length === 0) return null;

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
            <p className="text-xs text-zinc-400">
              {subtitle || `Всего ${images.length} изображений в высоком разрешении`}
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Screenshots */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {images.map((img, idx) => (
          <button
            key={img.id || idx}
            onClick={() => setActiveIdx(idx)}
            className="group relative aspect-video rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 hover:border-purple-500/60 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <img
              src={img.thumbnailUrl || img.url}
              alt={img.caption || `Изображение #${idx + 1}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 className="w-5 h-5 text-white drop-shadow-md" />
            </div>
          </button>
        ))}
      </div>

      {/* Fullscreen Lightbox Modal */}
      {activeIdx !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
          {/* Header Bar */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
            <div className="text-xs font-semibold text-zinc-400 font-mono">
              {activeIdx + 1} / {images.length}
            </div>
            <button
              onClick={() => setActiveIdx(null)}
              className="p-2.5 rounded-full bg-zinc-900/80 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Image */}
          <div className="relative max-w-6xl max-h-[85vh] w-full flex items-center justify-center">
            <img
              src={images[activeIdx].url}
              alt={images[activeIdx].caption || `Изображение #${activeIdx + 1}`}
              referrerPolicy="no-referrer"
              className="max-h-[80vh] max-w-full object-contain rounded-2xl shadow-2xl border border-zinc-800"
            />

            {/* Left Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveIdx(activeIdx > 0 ? activeIdx - 1 : images.length - 1);
              }}
              className="absolute left-2 md:-left-12 p-3 rounded-full bg-zinc-900/80 border border-zinc-700 text-white hover:bg-purple-600 transition-all shadow-xl"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Right Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveIdx(activeIdx < images.length - 1 ? activeIdx + 1 : 0);
              }}
              className="absolute right-2 md:-right-12 p-3 rounded-full bg-zinc-900/80 border border-zinc-700 text-white hover:bg-purple-600 transition-all shadow-xl"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          {/* Caption */}
          {images[activeIdx].caption && (
            <div className="absolute bottom-6 text-center text-xs text-zinc-300 bg-black/60 px-4 py-2 rounded-xl backdrop-blur-md border border-zinc-800 max-w-xl">
              {images[activeIdx].caption}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
