import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Disc,
  Users,
  Music2,
  Loader2,
  X,
  Sparkles,
  ExternalLink,
  Headphones,
} from 'lucide-react';
import { MusicNav } from '../music/MusicNav.tsx';
import { MusicReleaseCard, ReleaseCardData } from '../music/MusicReleaseCard.tsx';
import { MusicTrackCard, AnyTrackItem } from '../music/MusicTrackCard.tsx';
import { ArtistLinks } from '../music/ArtistLinks.tsx';
import { getBestMusicImageUrl } from '../../utils/musicImageUtils.ts';
import { useRouter } from '../../context/RouterContext.tsx';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import {
  getStableTrackKey,
  getStableArtistKey,
  getStableReleaseKey,
  dedupeTracks,
  dedupeArtists,
  dedupeReleases,
} from '../../utils/musicIdentity.ts';

interface ArtistSearchResult {
  id: number;
  stageName: string;
  slug: string;
  avatar: string | null;
  description: string | null;
}

interface ExternalArtistSearchResult {
  provider: 'youtube';
  providerArtistId: string;
  name: string;
  avatar: string | null;
  subscribers?: string | null;
}

interface ExternalReleaseSearchResult {
  provider: 'youtube';
  providerReleaseId: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  releaseType?: string;
  year?: number | null;
}

interface SearchResults {
  releases: ReleaseCardData[];
  artists: ArtistSearchResult[];
  tracks: AnyTrackItem[];
  externalTracks?: AnyTrackItem[];
  externalArtists?: ExternalArtistSearchResult[];
  externalReleases?: ExternalReleaseSearchResult[];
}

type SearchTab = 'all' | 'tracks' | 'releases' | 'artists';

export const MusicSearchView: React.FC = () => {
  const { navigate, route } = useRouter();
  const { currentTrack, isPlaying } = useMusicPlayer();

  const initialQuery = (route.params && route.params.q) || '';
  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync if route params changed
  useEffect(() => {
    if (route.params && typeof route.params.q === 'string' && route.params.q !== query) {
      setQuery(route.params.q);
    }
  }, [route.params?.q]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);

      fetch(`/api/music/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error('Не удалось выполнить поиск по музыке');
          }
          return res.json();
        })
        .then((json) => {
          setResults(json);
        })
        .catch((err) => {
          if (err.name !== 'AbortError' && !controller.signal.aborted) {
            console.error('Failed to search music:', err);
            setError('Ошибка при загрузке результатов поиска');
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Combine Dodik tracks and other tracks into seamless deduplicated lists
  const dodikTracks: AnyTrackItem[] = dedupeTracks(
    (results?.tracks || []).map((t) => ({
      ...t,
      kind: 'dodik' as const,
      source: 'dodik' as const,
    }))
  );

  const otherTracks: AnyTrackItem[] = dedupeTracks(
    (results?.externalTracks || []).map((t) => ({
      ...t,
      kind: 'external' as const,
      source: 'youtube' as const,
    }))
  );

  const allTracks: AnyTrackItem[] = dedupeTracks([...dodikTracks, ...otherTracks]);
  const internalReleases = dedupeReleases(results?.releases || []);
  const externalReleases = dedupeReleases(results?.externalReleases || []);
  const totalReleasesCount = internalReleases.length + externalReleases.length;

  const internalArtists = dedupeArtists(results?.artists || []);
  const externalArtists = dedupeArtists(results?.externalArtists || []);
  const totalArtistsCount = internalArtists.length + externalArtists.length;

  const tracksCount = allTracks.length;
  const totalResults = tracksCount + totalReleasesCount + totalArtistsCount;

  return (
    <div className="space-y-6 pb-20">
      <MusicNav activeTab="search" />

      {/* SEARCH HEADER & INPUT */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white font-mono flex items-center gap-2">
              <Search className="w-5 h-5 text-purple-400" />
              <span>Поиск музыки</span>
            </h2>
            <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
              Ищите треки, альбомы и любимых исполнителей
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="w-5 h-5 text-purple-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Введите название трека, альбома или исполнителя (например: Linkin Park, КИНО)..."
            className="w-full pl-12 pr-12 py-4 rounded-2xl bg-[#11152A] border border-[#1E2442] text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500 font-mono transition-all"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              title="Очистить"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Tabs if results exist */}
        {results && totalResults > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-[#1E2442]/60 overflow-x-auto custom-scrollbar">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-[#11152A] text-slate-400 hover:text-white'
              }`}
            >
              Все ({totalResults})
            </button>

            {tracksCount > 0 && (
              <button
                onClick={() => setActiveTab('tracks')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'tracks'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-[#11152A] text-slate-400 hover:text-white'
                }`}
              >
                <Music2 className="w-3.5 h-3.5" />
                <span>Треки ({tracksCount})</span>
              </button>
            )}

            {totalReleasesCount > 0 && (
              <button
                onClick={() => setActiveTab('releases')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'releases'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-[#11152A] text-slate-400 hover:text-white'
                }`}
              >
                <Disc className="w-3.5 h-3.5" />
                <span>Релизы ({totalReleasesCount})</span>
              </button>
            )}

            {totalArtistsCount > 0 && (
              <button
                onClick={() => setActiveTab('artists')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'artists'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-[#11152A] text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Исполнители ({totalArtistsCount})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* BODY CONTENT */}
      {loading ? (
        <div className="py-24 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          <span className="text-xs font-mono font-semibold">Поиск по музыкальной базе...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-[#0B0D20] border border-rose-500/30 rounded-3xl text-xs text-rose-300 font-mono">
          {error}
        </div>
      ) : results ? (
        totalResults === 0 ? (
          <div className="p-12 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-2">
            <Search className="w-10 h-10 text-purple-400 mx-auto" />
            <p className="text-base font-bold text-white font-mono">Ничего не найдено</p>
            <p className="text-xs text-[#94A3B8]">Попробуйте изменить запрос или имя исполнителя</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* TRACKS SECTION (DODIK & CATALOG SEPARATED) */}
            {(activeTab === 'all' || activeTab === 'tracks') && allTracks.length > 0 && (
              <div className="space-y-4">
                {dodikTracks.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                        <Music2 className="w-5 h-5 text-purple-400" />
                        <span>Музыка Dodik ({dodikTracks.length})</span>
                      </h3>
                      <span className="text-xs font-mono text-purple-300">Треки участников платформы</span>
                    </div>

                    <div className="space-y-2">
                      {dodikTracks.map((tr, idx) => (
                        <MusicTrackCard key={`dodik-tr-${tr.id}-${idx}`} track={tr} queueContext={allTracks} variant="row" />
                      ))}
                    </div>
                  </div>
                )}

                {otherTracks.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                        <Music2 className="w-5 h-5 text-indigo-400" />
                        <span>Музыкальный каталог ({otherTracks.length})</span>
                      </h3>
                      {activeTab === 'all' && (
                        <span className="text-xs font-mono text-slate-500">Нажмите для воспроизведения</span>
                      )}
                    </div>

                    <div className="space-y-2">
                      {otherTracks.map((tr, idx) => (
                        <MusicTrackCard key={`other-tr-${tr.id || tr.videoId || idx}-${idx}`} track={tr} queueContext={allTracks} variant="row" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ARTISTS SECTION (DODIK & YOUTUBE MUSIC ARTISTS) */}
            {(activeTab === 'all' || activeTab === 'artists') && totalArtistsCount > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-400" />
                    <span>Исполнители ({totalArtistsCount})</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Dodik Internal Artists */}
                  {internalArtists.map((art, idx) => (
                    <div
                      key={`dodik-artist-${art.id}-${idx}`}
                      onClick={() => navigate(`/music/artist/${art.slug || art.id}`)}
                      className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-purple-500/40 transition-all flex items-center gap-3.5 cursor-pointer group"
                    >
                      {art.avatar ? (
                        <img
                          src={getBestMusicImageUrl(art.avatar, 'medium')}
                          alt={art.stageName}
                          className="w-14 h-14 rounded-2xl object-cover shrink-0 group-hover:scale-105 transition-transform border border-purple-500/20"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-purple-900/40 text-purple-300 font-mono font-bold flex items-center justify-center shrink-0 border border-purple-500/20 text-lg">
                          {art.stageName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-bold text-white font-mono truncate group-hover:text-purple-300 transition-colors">
                            {art.stageName}
                          </h4>
                        </div>
                        <span className="text-[11px] text-purple-400 font-mono flex items-center gap-1 mt-0.5">
                          <Sparkles className="w-3 h-3" />
                          <span>Артист Dodik</span>
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* YouTube Music External Artists */}
                  {externalArtists.map((art, idx) => (
                    <div
                      key={`yt-artist-${art.providerArtistId || idx}-${idx}`}
                      onClick={() => navigate(`/music/external/artist/youtube/${art.providerArtistId}`)}
                      className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-rose-500/40 transition-all flex items-center gap-3.5 cursor-pointer group"
                    >
                      {art.avatar ? (
                        <img
                          src={getBestMusicImageUrl(art.avatar, 'medium')}
                          alt={art.name}
                          className="w-14 h-14 rounded-2xl object-cover shrink-0 group-hover:scale-105 transition-transform border border-rose-500/20"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-rose-950/40 text-rose-300 font-mono font-bold flex items-center justify-center shrink-0 border border-rose-500/20 text-lg">
                          {art.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-white font-mono truncate group-hover:text-rose-300 transition-colors">
                          {art.name}
                        </h4>
                        <span className="text-[11px] text-rose-400 font-mono flex items-center gap-1 mt-0.5">
                          <Sparkles className="w-3 h-3" />
                          <span>YouTube Music</span>
                          {art.subscribers && <span className="text-slate-400">• {art.subscribers}</span>}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RELEASES SECTION (DODIK & YOUTUBE MUSIC ALBUMS) */}
            {(activeTab === 'all' || activeTab === 'releases') && totalReleasesCount > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                    <Disc className="w-5 h-5 text-purple-400" />
                    <span>Релизы и альбомы ({totalReleasesCount})</span>
                  </h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {/* Dodik Releases */}
                  {internalReleases.map((rel, idx) => (
                    <MusicReleaseCard key={`dodik-rel-${rel.id}-${idx}`} release={rel} />
                  ))}

                  {/* YouTube Music External Releases */}
                  {externalReleases.map((rel, idx) => (
                    <div
                      key={`yt-rel-${rel.providerReleaseId || idx}-${idx}`}
                      onClick={() => navigate(`/music/external/release/youtube/${rel.providerReleaseId}`)}
                      className="p-3 sm:p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-purple-500/40 transition-all duration-200 cursor-pointer flex flex-col justify-between group"
                    >
                      <div className="space-y-3">
                        <div className="relative aspect-square rounded-xl overflow-hidden bg-[#11152A] border border-[#1E2442]">
                          {rel.coverUrl ? (
                            <img
                              src={getBestMusicImageUrl(rel.coverUrl, 'medium')}
                              alt={rel.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-rose-950/40 to-slate-900 flex items-center justify-center text-rose-400">
                              <Disc className="w-10 h-10 opacity-60" />
                            </div>
                          )}
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-rose-950/80 text-rose-300 border border-rose-500/30 uppercase">
                            {rel.releaseType === 'single' ? 'Сингл' : rel.releaseType === 'ep' ? 'EP' : 'Альбом'}
                          </span>
                        </div>

                        <div className="space-y-0.5">
                          <h4 className="text-sm font-bold text-white font-mono truncate group-hover:text-purple-300 transition-colors">
                            {rel.title}
                          </h4>
                          <div className="text-xs text-slate-400 truncate">
                            <ArtistLinks artistName={rel.artist} />
                          </div>
                          {rel.year && <p className="text-[10px] font-mono text-slate-500">{rel.year}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* Empty Prompt State */
        <div className="p-12 sm:p-16 text-center bg-[#0B0D20] border border-[#1E2442] rounded-3xl space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-purple-950/40 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400">
            <Sparkles className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white font-mono">Найдите любую музыку</h3>
          <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
            Введите название трека, альбома или любимого исполнителя в строку поиска выше для мгновенного прослушивания и открытия профиля артиста.
          </p>
        </div>
      )}
    </div>
  );
};
