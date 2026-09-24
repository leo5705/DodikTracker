import React, { useState, useEffect } from 'react';
import { Video, Play, X, ExternalLink, Film, Sparkles, Maximize2 } from 'lucide-react';
import { ContentVideo } from '../../types/content.ts';
import { parseVideo, formatVideoTypeLabel } from '../../utils/videoUtils.ts';

interface ContentVideosProps {
  videos: ContentVideo[];
  contentTitle?: string;
}

export const ContentVideos: React.FC<ContentVideosProps> = ({ videos, contentTitle }) => {
  const [selectedVideo, setSelectedVideo] = useState<ContentVideo | null>(null);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedVideo(null);
      }
    };
    if (selectedVideo) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedVideo]);

  if (!videos || videos.length === 0) return null;

  // Filter and parse valid videos
  const validVideos = videos
    .map((v) => ({ ...v, parsed: parseVideo(v) }))
    .filter((v) => v.parsed.isValid || v.url || v.key);

  if (validVideos.length === 0) return null;

  const selectedParsed = selectedVideo ? parseVideo(selectedVideo) : null;

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1E2442] pb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[#A78BFA]">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#F8FAFC]">Трейлеры и видеоматериалы</h2>
            <p className="text-xs text-[#94A3B8]">
              Официальные видеоролики, тизеры и промо ({validVideos.length})
            </p>
          </div>
        </div>

        {validVideos.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs font-mono text-[#A78BFA] bg-[#8B5CF6]/10 px-3 py-1.5 rounded-xl border border-[#8B5CF6]/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{validVideos.length} видео</span>
          </div>
        )}
      </div>

      {/* Video Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {validVideos.map((vid, idx) => {
          const parsed = vid.parsed;
          const typeLabel = formatVideoTypeLabel(vid.type);
          const title = vid.title || vid.name || typeLabel;
          const thumb = parsed.thumbnailUrl || vid.thumbnailUrl;

          return (
            <div
              key={vid.id || idx}
              onClick={() => setSelectedVideo(vid)}
              className="group cursor-pointer p-3 rounded-2xl bg-[#080A18] border border-[#1E2442] hover:border-[#8B5CF6]/60 hover:bg-[#11152A] transition-all flex flex-col justify-between"
            >
              {/* Thumbnail Container */}
              <div className="aspect-video w-full rounded-xl overflow-hidden bg-[#05060E] border border-[#1E2442] relative group">
                {thumb ? (
                  <img
                    src={thumb}
                    alt={title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[#64748B]">
                    <Video className="w-8 h-8 mb-1" />
                    <span className="text-[11px]">Видео</span>
                  </div>
                )}

                {/* Gradient and Play Overlay */}
                <div className="absolute inset-0 bg-[#080A18]/40 group-hover:bg-[#080A18]/20 transition-colors flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-[#8B5CF6]/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-[#8B5CF6] transition-all">
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  </div>
                </div>

                {/* Video Type Badge */}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-[#080A18]/85 backdrop-blur-md border border-[#1E2442] text-[10px] font-bold text-[#E2E8F0]">
                  {typeLabel}
                </div>

                {/* Video Platform Indicator */}
                {parsed.site && parsed.site !== 'Unknown' && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-[#080A18]/85 backdrop-blur-md border border-[#1E2442] text-[10px] font-mono text-[#94A3B8]">
                    {parsed.site}
                  </div>
                )}
              </div>

              {/* Title & Metadata */}
              <div className="pt-3">
                <h4 className="text-xs font-semibold text-[#F8FAFC] group-hover:text-[#A78BFA] transition-colors line-clamp-2">
                  {title}
                </h4>
                {vid.language && (
                  <span className="text-[10px] font-mono text-[#64748B] mt-1 inline-block uppercase">
                    Язык: {vid.language}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Video Modal Player (Theater Mode) */}
      {selectedVideo && selectedParsed && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl bg-[#0B0D20] border border-[#1E2442] rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#1E2442] bg-[#080A18]">
              <div className="flex items-center gap-2.5 overflow-hidden pr-4">
                <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                  <Play className="w-4 h-4 fill-rose-400" />
                </div>
                <div className="truncate">
                  <h3 className="text-sm font-bold text-[#F8FAFC] truncate">
                    {selectedVideo.title || selectedVideo.name || formatVideoTypeLabel(selectedVideo.type)}
                  </h3>
                  {contentTitle && (
                    <p className="text-xs text-[#94A3B8] truncate">{contentTitle}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedParsed.canonicalUrl && (
                  <a
                    href={selectedParsed.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-white transition-colors"
                    title="Открыть на внешнем сайте"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedVideo(null)}
                  className="p-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
                  title="Закрыть (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Video Frame */}
            <div className="relative aspect-video w-full bg-black">
              {selectedParsed.isDirectVideo ? (
                <video
                  src={selectedParsed.canonicalUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                >
                  Ваш браузер не поддерживает воспроизведение видео.
                </video>
              ) : selectedParsed.embedUrl ? (
                <iframe
                  src={selectedParsed.embedUrl}
                  title={selectedVideo.title || selectedVideo.name || 'Трейлер'}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-[#94A3B8] p-6 text-center">
                  <p className="text-sm mb-3">Не удалось загрузить встроенный плеер</p>
                  {selectedParsed.canonicalUrl && (
                    <a
                      href={selectedParsed.canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
                    >
                      <span>Смотреть на источнике</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer / Fallback Banner */}
            {selectedParsed.canonicalUrl && (
              <div className="p-3 bg-[#080A18] border-t border-[#1E2442] flex items-center justify-between gap-3 text-xs text-[#94A3B8] flex-wrap">
                <span>
                  {selectedParsed.site === 'YouTube' ? 'Официальный YouTube-плеер.' : 'Официальный медиа-плеер.'} Если ролик заблокирован правообладателем:
                </span>
                <a
                  href={selectedParsed.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#11152A] hover:bg-[#1E2442] text-[#A78BFA] hover:text-white font-medium transition-colors"
                >
                  <span>{selectedParsed.site === 'YouTube' ? 'Открыть на YouTube' : 'Открыть на источнике'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
