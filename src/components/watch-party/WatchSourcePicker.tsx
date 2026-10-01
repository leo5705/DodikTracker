import React, { useState, useEffect } from 'react';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  X,
  Play,
  Users,
  Film,
  Check,
  CheckCircle2,
  HardDrive,
  Globe,
  Lock,
  Eye,
  Loader2,
  AlertCircle,
  Copy,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { TorrentCandidate } from '../../server/services/torrentSearch/torrentSearchTypes.ts';
import { MediaSourceConfig } from '../../types/watchParty.ts';

export type WatchPickerMode = 'watch' | 'watch-party' | 'switch-source';

export interface WatchSourcePickerProps {
  isOpen: boolean;
  onClose: () => void;
  mediaId: number;
  mediaTitle: string;
  mediaOriginalTitle?: string;
  mediaYear?: number;
  mediaType: string;
  posterUrl?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  mode?: WatchPickerMode;
  onSourceSelected?: (source: MediaSourceConfig) => void;
}

export const WatchSourcePicker: React.FC<WatchSourcePickerProps> = ({
  isOpen,
  onClose,
  mediaId,
  mediaTitle,
  mediaOriginalTitle,
  mediaYear,
  mediaType,
  posterUrl,
  seasonNumber,
  episodeNumber,
  mode = 'watch',
  onSourceSelected,
}) => {
  const { navigate } = useRouter();
  const { authFetch } = useAuth();

  // Active mode state (can switch between solo and watch-party unless switch-source)
  const [activeMode, setActiveMode] = useState<WatchPickerMode>(mode);
  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  // Source candidates
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<TorrentCandidate[]>([]);
  const [bestCandidateId, setBestCandidateId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [discoveryStatus, setDiscoveryStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Watch Party room configuration states
  const [roomTitle, setRoomTitle] = useState(mediaTitle || 'Совместный просмотр');
  const [privacy, setPrivacy] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [passcode, setPasscode] = useState('');
  const [maxMembers, setMaxMembers] = useState(10);
  const [submitting, setSubmitting] = useState(false);

  // Success state after watch party creation
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const isSeries = mediaType === 'TV' || mediaType === 'ANIME' || mediaType === 'series';

  // Load sources when modal opens
  useEffect(() => {
    if (!isOpen || !mediaId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setDiscoveryStatus(null);
    setCreatedRoomCode(null);

    const loadSources = async () => {
      try {
        const res = await authFetch('/api/watch-party/torrents/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaId,
            title: mediaTitle,
            originalTitle: mediaOriginalTitle,
            year: mediaYear,
            mediaType: isSeries ? 'series' : 'movie',
            seasonNumber,
            episodeNumber,
          }),
        });

        if (!isMounted) return;

        if (!res.ok) {
          throw new Error('Не удалось найти источники для воспроизведения');
        }

        const data = await res.json();
        const candList: TorrentCandidate[] = data.candidates || [];
        setDiscoveryStatus(data.reason || data.status || null);

        setCandidates(candList);
        if (candList.length > 0) {
          const bestId = data.bestCandidate?.id || candList[0].id;
          setBestCandidateId(bestId);
          setSelectedCandidateId(bestId);
        } else {
          setBestCandidateId(null);
          setSelectedCandidateId(null);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || 'Ошибка загрузки источников');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadSources();

    return () => {
      isMounted = false;
    };
  }, [isOpen, mediaId, mediaTitle, mediaOriginalTitle, mediaYear, seasonNumber, episodeNumber, isSeries]);

  if (!isOpen) return null;

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId) || candidates[0];

  const handleCopyCode = () => {
    if (!createdRoomCode) return;
    navigator.clipboard.writeText(createdRoomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!createdRoomCode) return;
    const url = `${window.location.origin}/watch/${createdRoomCode}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleEnterCreatedRoom = () => {
    if (!createdRoomCode) return;
    const code = createdRoomCode;
    onClose();
    navigate(`/watch/${code}`);
  };

  const handleProceed = async () => {
    if (!selectedCandidate) return;

    const resolvedMagnet = selectedCandidate.magnetUri?.startsWith('magnet:?')
      ? selectedCandidate.magnetUri
      : selectedCandidate.infoHash && /^[0-9a-fA-F]{40}$/i.test(selectedCandidate.infoHash)
      ? `magnet:?xt=urn:btih:${selectedCandidate.infoHash.toLowerCase()}&dn=${encodeURIComponent(selectedCandidate.name || mediaTitle)}`
      : selectedCandidate.magnetUri;

    const fileIndex = typeof (selectedCandidate as any).selectedFile?.index === 'number'
      ? (selectedCandidate as any).selectedFile.index
      : 0;
    const streamUrl = selectedCandidate.infoHash
      ? `/api/watch-party/torrents/stream?hash=${selectedCandidate.infoHash}&index=${fileIndex}`
      : undefined;

    const sourceConfig: MediaSourceConfig = {
      type: 'TORRENT',
      url: streamUrl,
      magnetUri: resolvedMagnet,
      fileName: (selectedCandidate as any).selectedFile?.name,
      infoHash: selectedCandidate.infoHash,
      torrentFileIndex: fileIndex,
      title: selectedCandidate.name,
    };

    // 1. In-room source change by host
    if (activeMode === 'switch-source') {
      if (onSourceSelected) {
        onSourceSelected(sourceConfig);
      }
      onClose();
      return;
    }

    // 2. Solo Watch or Watch Party creation
    setSubmitting(true);
    setError(null);

    try {
      const isSolo = activeMode === 'watch';
      const payload = {
        title: isSolo
          ? `${mediaTitle}${isSeries && seasonNumber && episodeNumber ? ` — S${seasonNumber}E${episodeNumber}` : ''}`
          : roomTitle.trim() || mediaTitle,
        privacy: isSolo ? 'PUBLIC' : privacy,
        passcode: isSolo ? undefined : privacy === 'PRIVATE' ? passcode : undefined,
        maxMembers: isSolo ? 1 : maxMembers,
        mediaId,
        mediaType: isSeries ? 'TV' : 'MOVIE',
        seasonNumber: seasonNumber || undefined,
        episodeNumber: episodeNumber || undefined,
        source: {
          type: 'TORRENT',
          url: streamUrl,
          magnetUri: resolvedMagnet,
          infoHash: selectedCandidate.infoHash,
          downloadUrl: selectedCandidate.downloadUrl,
          torrentFileIndex: fileIndex,
          fileName: (selectedCandidate as any).selectedFile?.name,
          title: selectedCandidate.name,
        },
      };

      const res = await authFetch('/api/watch-party/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Не удалось создать комнату');
      }

      const created = await res.json();
      const code = created.room?.code || created.code;

      if (!code) {
        throw new Error('Сервер не вернул код комнаты');
      }

      if (isSolo) {
        // Direct seamless navigation for solo watching without detour
        onClose();
        navigate(`/watch/${code}`);
      } else {
        // Show success state with invite link ready for sharing
        setCreatedRoomCode(code);
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка запуска просмотра');
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Render Success View when Watch Party was created
  if (createdRoomCode) {
    const inviteUrl = `${window.location.origin}/watch/${createdRoomCode}`;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
        <div
          className="w-full max-w-md bg-[#0B0D20] border border-[#1E2442] rounded-3xl shadow-2xl p-6 text-center space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white">Комната создана!</h2>
            <p className="text-xs text-[#94A3B8]">{roomTitle}</p>
          </div>

          {/* Invite Block */}
          <div className="p-4 rounded-2xl bg-[#080A18] border border-[#1E2442] space-y-3 text-left">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#94A3B8]">Код комнаты:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[#A78BFA] tracking-wider">{createdRoomCode}</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-2.5 py-1 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-[11px] font-bold text-white transition-colors cursor-pointer inline-flex items-center gap-1 border border-[#1E2442]"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedCode ? 'Скопировано' : 'Код'}</span>
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-[#1E2442] space-y-1.5">
              <span className="text-xs text-[#94A3B8]">Ссылка для приглашения:</span>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs font-mono text-[#CBD5E1] truncate select-all">
                  {inviteUrl}
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black font-bold text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-md shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedLink ? '✓ Скопировано' : 'Скопировать'}</span>
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleEnterCreatedRoom}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:from-[#6D28D9] hover:to-[#4F46E5] text-white font-bold text-sm shadow-xl shadow-[#7C3AED]/25 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Войти в комнату</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-2xl bg-[#0B0D20] border border-[#1E2442] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#1E2442] flex items-center justify-between bg-gradient-to-r from-[#11152A] to-[#0B0D20]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#7C3AED]/20 to-[#6366F1]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[#A78BFA] shrink-0">
              {activeMode === 'watch-party' ? <Users className="w-5 h-5" /> : <Film className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                {activeMode === 'switch-source'
                  ? 'Смена источника'
                  : activeMode === 'watch-party'
                  ? 'Совместный просмотр'
                  : 'Выбор источника'}
              </h2>
              <p className="text-xs text-[#94A3B8] truncate">
                {mediaTitle}
                {isSeries && seasonNumber && episodeNumber ? ` • Сезон ${seasonNumber}, Серия ${episodeNumber}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#1E2442] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs (Only when NOT in switch-source mode) */}
        {activeMode !== 'switch-source' && (
          <div className="px-5 pt-3 pb-0 flex gap-2 border-b border-[#1E2442]/60 bg-[#0E1224]/50">
            <button
              type="button"
              onClick={() => setActiveMode('watch')}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeMode === 'watch'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-[#94A3B8] hover:text-[#CBD5E1]'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Только я</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('watch-party')}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeMode === 'watch-party'
                  ? 'border-[#8B5CF6] text-[#A78BFA]'
                  : 'border-transparent text-[#94A3B8] hover:text-[#CBD5E1]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Смотреть вместе</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#8B5CF6] animate-spin" />
              <p className="text-xs font-semibold text-[#94A3B8]">Поиск и проверка доступных источников…</p>
            </div>
          ) : candidates.length === 0 ? (
            /* Empty State: No sources available */
            <div className="py-14 px-4 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[#64748B]">
                <Film className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">
                  {discoveryStatus === 'PROWLARR_UNAVAILABLE'
                    ? 'Служба поиска торрентов временно недоступна'
                    : discoveryStatus === 'PROWLARR_AUTH_FAILED'
                    ? 'Ошибка авторизации в службе поиска торрентов'
                    : discoveryStatus === 'NO_INDEXERS'
                    ? 'В поисковой службе не настроены трекеры'
                    : discoveryStatus === 'TORRSERVER_UNAVAILABLE' || discoveryStatus === 'TORRSERVER_LOAD_FAILED'
                    ? 'Сервер воспроизведения временно недоступен'
                    : discoveryStatus === 'RESULTS_BUT_NO_PLAYABLE_FILE' || discoveryStatus === 'NO_PLAYABLE_FILES'
                    ? 'Подходящие видеофайлы не найдены'
                    : discoveryStatus === 'STREAM_VALIDATION_FAILED'
                    ? 'Видеопоток временно недоступен'
                    : discoveryStatus === 'INVALID_MEDIA_METADATA'
                    ? 'Недостаточно данных для поиска произведения'
                    : isSeries
                    ? 'Эта серия сейчас недоступна для просмотра.'
                    : 'Сейчас этот фильм недоступен для просмотра.'}
                </p>
                <p className="text-xs text-[#94A3B8] max-w-sm">
                  {discoveryStatus === 'PROWLARR_UNAVAILABLE'
                    ? 'Не удалось связаться с Prowlarr. Проверьте настройки подключения в панели управления.'
                    : discoveryStatus === 'PROWLARR_AUTH_FAILED'
                    ? 'Неверный API ключ Prowlarr. Проверьте конфигурацию PROWLARR_API_KEY.'
                    : discoveryStatus === 'NO_INDEXERS'
                    ? 'В Prowlarr не включены активные торрент-индексаторы.'
                    : discoveryStatus === 'TORRSERVER_UNAVAILABLE' || discoveryStatus === 'TORRSERVER_LOAD_FAILED'
                    ? 'TorrServer не отвечает или не смог инициализировать раздачу.'
                    : discoveryStatus === 'RESULTS_BUT_NO_PLAYABLE_FILE' || discoveryStatus === 'NO_PLAYABLE_FILES'
                    ? 'Раздачи найдены, но ни одна из них не содержит подходящий видеофайл для выбранного эпизода или фильма.'
                    : discoveryStatus === 'STREAM_VALIDATION_FAILED'
                    ? 'Найденные источники не отдают стабильный видеопоток. Попробуйте другой источник позже.'
                    : discoveryStatus === 'INVALID_MEDIA_METADATA'
                    ? 'В каталоге отсутствуют точные метаданные (название или год) для поиска раздач.'
                    : 'Доступный источник видеопотока не найден. Попробуйте позже или проверьте другие серии.'}
                </p>
              </div>
            </div>
          ) : (
            /* Sources List */
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <span>Доступные источники ({candidates.length})</span>
                <span className="text-[11px] text-[#64748B]">Отсортировано по качеству</span>
              </div>

              <div className="space-y-2">
                {candidates.map((cand) => {
                  const isSelected = cand.id === selectedCandidateId;
                  const isRecommended = cand.id === bestCandidateId;
                  const q = cand.quality;

                  return (
                    <div
                      key={cand.id}
                      onClick={() => setSelectedCandidateId(cand.id)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? 'bg-[#151932] border-[#8B5CF6] shadow-lg shadow-[#8B5CF6]/10'
                          : 'bg-[#0B0D20] border-[#1E2442] hover:bg-[#11152A] hover:border-[#2A335E]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Resolution badge */}
                            {q?.resolution && q.resolution !== 'unknown' && (
                              <span className="px-2 py-0.5 rounded-lg bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30 text-[11px] font-bold">
                                {q.resolution}
                              </span>
                            )}

                            {/* Source badge */}
                            {q?.source && (
                              <span className="px-2 py-0.5 rounded-lg bg-[#1E2442] text-[#CBD5E1] text-[11px] font-semibold">
                                {q.source}
                              </span>
                            )}

                            {/* Codec badge */}
                            {q?.codec && (
                              <span className="px-2 py-0.5 rounded-lg bg-[#11152A] border border-[#1E2442] text-[#94A3B8] text-[11px] font-mono">
                                {q.codec}
                              </span>
                            )}

                            {/* Recommended badge (only if score indicates) */}
                            {isRecommended && (
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                <span>Рекомендуемый</span>
                              </span>
                            )}
                          </div>

                          <p className="text-xs font-semibold text-[#CBD5E1] mt-1.5 line-clamp-1 break-all">
                            {cand.name}
                          </p>
                        </div>

                        {/* Selection Radio / Check Indicator */}
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected
                              ? 'bg-[#8B5CF6] border-[#8B5CF6] text-white'
                              : 'border-[#334155] bg-transparent'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>

                      {/* Bottom Candidate Metadata (Real data only) */}
                      <div className="flex items-center gap-4 text-[11px] text-[#64748B] pt-1 border-t border-[#1E2442]/60">
                        {cand.formattedSize && (
                          <div className="flex items-center gap-1">
                            <HardDrive className="w-3 h-3" />
                            <span>{cand.formattedSize}</span>
                          </div>
                        )}

                        {cand.seeders !== undefined && cand.seeders >= 0 && (
                          <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>Раздают: {cand.seeders}</span>
                          </div>
                        )}

                        {cand.languages && cand.languages.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            <span>{cand.languages.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Watch Party Privacy Options (Only in watch-party mode) */}
              {activeMode === 'watch-party' && (
                <div className="pt-3 border-t border-[#1E2442] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Параметры комнаты</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-[#94A3B8]">Название комнаты:</label>
                    <input
                      type="text"
                      value={roomTitle}
                      onChange={(e) => setRoomTitle(e.target.value)}
                      placeholder="Название комнаты"
                      className="w-full px-3 py-2 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPrivacy('PUBLIC')}
                      className={`p-3 rounded-2xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                        privacy === 'PUBLIC'
                          ? 'bg-[#151932] border-[#8B5CF6] text-white'
                          : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8] hover:bg-[#11152A]'
                      }`}
                    >
                      <Eye className="w-4 h-4 text-[#A78BFA] shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold">Публичная</div>
                        <div className="text-[10px] text-[#64748B]">Видна в общем списке</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPrivacy('PRIVATE')}
                      className={`p-3 rounded-2xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                        privacy === 'PRIVATE'
                          ? 'bg-[#151932] border-[#8B5CF6] text-white'
                          : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8] hover:bg-[#11152A]'
                      }`}
                    >
                      <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold">Приватная</div>
                        <div className="text-[10px] text-[#64748B]">Вход по паролю / ссылке</div>
                      </div>
                    </button>
                  </div>

                  {privacy === 'PRIVATE' && (
                    <div className="space-y-1.5 animate-fadeIn">
                      <label className="text-[11px] text-[#94A3B8]">Пароль комнаты:</label>
                      <input
                        type="password"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        placeholder="Минимум 4 символа"
                        className="w-full px-3 py-2 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-[#1E2442] flex items-center justify-between gap-3 bg-[#0E1224]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-[#151932] hover:bg-[#1E2442] text-[#94A3B8] hover:text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Отмена
          </button>

          {candidates.length > 0 && (
            <button
              type="button"
              disabled={submitting || !selectedCandidate}
              onClick={handleProceed}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                activeMode === 'watch-party'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black shadow-lg shadow-emerald-500/20'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black shadow-lg shadow-amber-500/20'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Подготовка…</span>
                </>
              ) : activeMode === 'switch-source' ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Применить источник</span>
                </>
              ) : activeMode === 'watch-party' ? (
                <>
                  <Users className="w-4 h-4" />
                  <span>Создать комнату совместного просмотра</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-black" />
                  <span>Смотреть</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
