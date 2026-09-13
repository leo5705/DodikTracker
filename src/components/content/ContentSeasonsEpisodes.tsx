import React, { useState } from 'react';
import { Tv, Calendar, Clock, CheckCircle2, Play, ChevronDown } from 'lucide-react';
import { ContentSeason, ContentSeasonEpisode } from '../../types/content.ts';

interface ContentSeasonsEpisodesProps {
  seasons: ContentSeason[];
  onToggleEpisodeWatched?: (seasonNumber: number, episodeNumber: number, watched: boolean) => void;
  watchedEpisodes?: Set<string>; // key: `${seasonNumber}-${episodeNumber}`
}

export const ContentSeasonsEpisodes: React.FC<ContentSeasonsEpisodesProps> = ({
  seasons,
  onToggleEpisodeWatched,
  watchedEpisodes = new Set(),
}) => {
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);

  if (!seasons || seasons.length === 0) return null;

  const currentSeason = seasons[selectedSeasonIdx] || seasons[0];
  const episodes = currentSeason.episodes || [];

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Сезоны и серии</h2>
            <p className="text-xs text-zinc-400">
              Всего {seasons.length} сезон{seasons.length > 1 ? 'ов' : ''}
              {currentSeason.episodeCount ? ` • ${currentSeason.episodeCount} серий в сезоне` : ''}
            </p>
          </div>
        </div>

        {/* Season Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {seasons.map((s, idx) => {
            const isSelected = idx === selectedSeasonIdx;
            return (
              <button
                key={s.id || idx}
                onClick={() => setSelectedSeasonIdx(idx)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                    : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                {s.title || `Сезон ${s.seasonNumber}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Current Season Overview if present */}
      {currentSeason.overview && (
        <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/60 text-xs text-zinc-300 leading-relaxed">
          {currentSeason.overview}
        </div>
      )}

      {/* Episodes List */}
      {episodes.length > 0 ? (
        <div className="space-y-3">
          {episodes.map((ep) => {
            const epKey = `${currentSeason.seasonNumber}-${ep.episodeNumber}`;
            const isWatched = watchedEpisodes.has(epKey) || Boolean(ep.watched);

            return (
              <div
                key={ep.id || ep.episodeNumber}
                className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-zinc-700/80 transition-all flex flex-col md:flex-row gap-4 items-start"
              >
                {/* Thumbnail / Still */}
                <div className="w-full md:w-48 aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0 relative group">
                  {ep.stillUrl ? (
                    <img
                      src={ep.stillUrl}
                      alt={ep.title || `Серия ${ep.episodeNumber}`}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600">
                      <Play className="w-6 h-6 mb-1 text-zinc-700" />
                    </div>
                  )}

                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-mono font-bold text-zinc-200 border border-zinc-700">
                    Эп. {ep.episodeNumber}
                  </div>
                </div>

                {/* Info & Description */}
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-zinc-100 truncate">
                      {ep.title || `Серия ${ep.episodeNumber}`}
                    </h4>

                    {onToggleEpisodeWatched && (
                      <button
                        onClick={() =>
                          onToggleEpisodeWatched(
                            currentSeason.seasonNumber,
                            ep.episodeNumber,
                            !isWatched
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
                          isWatched
                            ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        <CheckCircle2 className={`w-3.5 h-3.5 ${isWatched ? 'text-emerald-400' : ''}`} />
                        <span>{isWatched ? 'Просмотрено' : 'Отметить'}</span>
                      </button>
                    )}
                  </div>

                  {/* Air date & Runtime badges */}
                  <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                    {ep.airDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-purple-400" />
                        <span>{ep.airDate}</span>
                      </span>
                    )}
                    {ep.duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-purple-400" />
                        <span>{ep.duration} мин.</span>
                      </span>
                    )}
                  </div>

                  {ep.overview && (
                    <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2 pt-1 font-sans">
                      {ep.overview}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-zinc-950/40 border border-zinc-800/40 text-center text-xs text-zinc-500">
          Информация о сериях данного сезона уточняется в базе данных.
        </div>
      )}
    </div>
  );
};
