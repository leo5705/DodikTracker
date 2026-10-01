import React, { useState, useEffect } from 'react';
import { Film, Tv, Sparkles, ChevronDown, Play, Info, Layers } from 'lucide-react';
import { useWatchParty } from '../../context/WatchPartyContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { normalizeMediaToUnified } from '../../utils/contentAdapter.ts';
import { ContentSeason } from '../../types/content.ts';

export const WatchPartyRoomInfo: React.FC = () => {
  const { room, isHost, hostChangeSource } = useWatchParty();
  const { authFetch } = useAuth();

  const [seasons, setSeasons] = useState<ContentSeason[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [mediaTitle, setMediaTitle] = useState<string>('');

  const mediaId = room?.mediaId;
  const mediaType = room?.mediaType || 'MOVIE';
  const currentSeasonNum = room?.seasonNumber || 1;
  const currentEpisodeNum = room?.episodeNumber || 1;

  // Load seasons / poster if mediaId present
  useEffect(() => {
    if (!room) return;

    let metadata: any = null;
    if (room.mediaMetadata) {
      try {
        metadata = typeof room.mediaMetadata === 'string' ? JSON.parse(room.mediaMetadata) : room.mediaMetadata;
      } catch (_e) {}
    }

    if (metadata?.posterUrl) setPosterUrl(metadata.posterUrl);
    if (metadata?.title) setMediaTitle(metadata.title);

    if (metadata?.seasons && Array.isArray(metadata.seasons)) {
      setSeasons(metadata.seasons);
      return;
    }

    if (mediaId && (mediaType === 'TV' || mediaType === 'ANIME' || room.seasonNumber)) {
      setLoadingSeasons(true);
      authFetch(`/api/media/${mediaId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            const unified = normalizeMediaToUnified(data);
            if (unified.posterUrl) setPosterUrl(unified.posterUrl);
            if (unified.title) setMediaTitle(unified.title);
            if (unified.seasons && unified.seasons.length > 0) {
              setSeasons(unified.seasons);
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingSeasons(false));
    }
  }, [room?.mediaId, room?.mediaType, room?.mediaMetadata, authFetch]);

  if (!room) return null;

  const currentSeason = seasons.find((s) => s.seasonNumber === currentSeasonNum) || seasons[0];
  const currentEpisode = currentSeason?.episodes?.find((e) => e.episodeNumber === currentEpisodeNum);

  const handleSelectEpisode = (seasonNum: number, epNum: number) => {
    if (!isHost || !room) return;
    const epObj = seasons.find((s) => s.seasonNumber === seasonNum)?.episodes?.find((e) => e.episodeNumber === epNum);
    const newTitle = mediaTitle
      ? `${mediaTitle} — S${String(seasonNum).padStart(2, '0')} E${String(epNum).padStart(2, '0')}`
      : room.title;

    const sourceConfig = room.sourceConfig || { type: room.sourceType || 'DIRECT' };

    hostChangeSource(
      { ...sourceConfig, title: newTitle },
      room.mediaId || undefined,
      seasonNum,
      epNum
    );
  };

  const isSeriesOrAnime = mediaType === 'TV' || mediaType === 'ANIME' || Boolean(room.seasonNumber);

  return (
    <div className="p-4 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl space-y-4">
      <div className="flex items-start gap-3.5">
        {/* Content Poster */}
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={room.title}
            className="w-14 h-20 rounded-2xl object-cover border border-[#1E2442] shrink-0 shadow-md"
          />
        ) : (
          <div className="w-14 h-20 rounded-2xl bg-[#11152A] border border-[#1E2442] shrink-0 flex items-center justify-center text-[#64748B]">
            {isSeriesOrAnime ? <Tv className="w-6 h-6" /> : <Film className="w-6 h-6" />}
          </div>
        )}

        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30">
              {mediaType === 'ANIME' ? 'Аниме' : mediaType === 'TV' ? 'Сериал' : 'Фильм'}
            </span>

            {room.seasonNumber && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-[#151932] text-[#CBD5E1] border border-[#1E2442]">
                S{String(room.seasonNumber).padStart(2, '0')} · E{String(room.episodeNumber || 1).padStart(2, '0')}
              </span>
            )}
          </div>

          <h2 className="text-sm font-bold text-white truncate">
            {mediaTitle || room.title}
          </h2>

          {currentEpisode && (
            <p className="text-xs text-[#94A3B8] truncate">
              {currentEpisode.episodeNumber}. {currentEpisode.title}
            </p>
          )}
        </div>
      </div>

      {/* Episode Selector (For TV series & Anime) */}
      {isSeriesOrAnime && seasons.length > 0 && (
        <div className="pt-2 border-t border-[#1E2442] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span className="font-semibold text-[#CBD5E1] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#8B5CF6]" />
               Выбор серии {isHost ? '(HOST)' : ''}
            </span>
            {!isHost && (
              <span className="text-[10px] text-[#64748B]">Управляет хост</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Season Selector */}
            <select
              value={currentSeasonNum}
              onChange={(e) => {
                const sNum = Number(e.target.value);
                const firstEp = seasons.find((s) => s.seasonNumber === sNum)?.episodes?.[0]?.episodeNumber || 1;
                handleSelectEpisode(sNum, firstEp);
              }}
              disabled={!isHost}
              className={`w-full px-3 py-2 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs font-semibold text-white focus:outline-none focus:border-[#8B5CF6] ${
                !isHost ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-[#11152A]'
              }`}
            >
              {seasons.map((s) => (
                <option key={s.seasonNumber} value={s.seasonNumber}>
                  {s.title || `Сезон ${s.seasonNumber}`} ({s.episodes?.length || 0} сер.)
                </option>
              ))}
            </select>

            {/* Episode Selector */}
            <select
              value={currentEpisodeNum}
              onChange={(e) => handleSelectEpisode(currentSeasonNum, Number(e.target.value))}
              disabled={!isHost}
              className={`w-full px-3 py-2 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs font-semibold text-white focus:outline-none focus:border-[#8B5CF6] ${
                !isHost ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-[#11152A]'
              }`}
            >
              {(currentSeason?.episodes || []).map((ep) => (
                <option key={ep.episodeNumber} value={ep.episodeNumber}>
                  Серия {ep.episodeNumber}: {ep.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
