import React, { useState } from 'react';
import {
  X,
  Users,
  Lock,
  Globe,
  Film,
  Sparkles,
  Link,
  Youtube,
  Tv,
  Loader2,
  AlertCircle,
  Play,
  KeyRound,
  Download,
  Check,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useToast } from '../../context/NotificationContext.tsx';
import { WatchPartyPrivacy, WatchPartySourceType, TorrentMediaFile } from '../../types/watchParty.ts';
import { validateAndParseMagnet } from '../../utils/magnetValidator.ts';
import { MediaSourceFactory } from '../../services/mediaSources/MediaSourceFactory.ts';

interface CreateWatchPartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaId?: number;
  mediaTitle?: string;
  mediaType?: string;
  posterUrl?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  onRoomCreated?: (roomCode: string) => void;
}

export const CreateWatchPartyModal: React.FC<CreateWatchPartyModalProps> = ({
  isOpen,
  onClose,
  mediaId,
  mediaTitle,
  mediaType,
  posterUrl,
  seasonNumber,
  episodeNumber,
  onRoomCreated,
}) => {
  const { authFetch } = useAuth();
  const { navigate } = useRouter();
  const { showToast } = useToast();

  const [title, setTitle] = useState(
    mediaTitle ? `Просмотр «${mediaTitle}»` : 'Комната совместного просмотра'
  );
  const [privacy, setPrivacy] = useState<WatchPartyPrivacy>('PUBLIC');
  const [passcode, setPasscode] = useState('');
  const [sourceType, setSourceType] = useState<WatchPartySourceType>(
    mediaId ? 'TORRENT' : 'DIRECT'
  );
  const [sourceUrl, setSourceUrl] = useState('');
  const [magnetUri, setMagnetUri] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  // Torrent Inspection state
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectedFiles, setInspectedFiles] = useState<TorrentMediaFile[]>([]);
  const [torrentDisplayName, setTorrentDisplayName] = useState<string | undefined>(undefined);

  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(seasonNumber);
  const [selectedEpisode, setSelectedEpisode] = useState<number | undefined>(episodeNumber);
  const [maxMembers, setMaxMembers] = useState<number>(20);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Post creation success state
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    if (!createdRoomCode) return;
    try {
      await navigator.clipboard.writeText(createdRoomCode);
      setCopiedCode(true);
      showToast(`Код комнаты ${createdRoomCode} скопирован!`, 'success');
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (_e) {
      showToast('Не удалось скопировать код', 'error');
    }
  };

  const handleCopyLink = async () => {
    if (!createdRoomCode) return;
    try {
      const shareUrl = `${window.location.protocol}//${window.location.host}/watch/${createdRoomCode}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      showToast('Ссылка приглашения скопирована в буфер обмена!', 'success');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (_e) {
      showToast('Не удалось скопировать ссылку', 'error');
    }
  };

  const handleOpenCreatedRoom = () => {
    if (!createdRoomCode) return;
    if (onRoomCreated) {
      onRoomCreated(createdRoomCode);
    } else {
      navigate(`/watch/${createdRoomCode}`);
    }
    onClose();
  };

  const handleInspectTorrent = async () => {
    if (!magnetUri.trim()) {
      setInspectError('Введите magnet-ссылку');
      return;
    }

    const validation = validateAndParseMagnet(magnetUri);
    if (!validation.isValid) {
      setInspectError(validation.error || 'Некорректная magnet-ссылка');
      return;
    }

    setInspecting(true);
    setInspectError(null);
    setInspectedFiles([]);

    try {
      const res = await MediaSourceFactory.inspectTorrentMetadata(magnetUri.trim(), 30000);
      setInspectedFiles(res.files);
      setTorrentDisplayName(res.displayName);

      // Auto-select first video file if not yet chosen
      const firstVid = res.files.find((f) => f.isVideo);
      if (firstVid && !selectedFileName) {
        setSelectedFileName(firstVid.name);
      }
    } catch (err: any) {
      setInspectError(err?.message || 'Не удалось получить метаданные торрента');
    } finally {
      setInspecting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Введите название комнаты');
      return;
    }
    if (privacy === 'PRIVATE' && (!passcode || passcode.length < 4)) {
      setError('Пароль для приватной комнаты должен быть не менее 4 символов');
      return;
    }

    if (sourceType === 'TORRENT') {
      if (!magnetUri.trim()) {
        if (!mediaId) {
          setError('Укажите magnet-ссылку торрента');
          return;
        }
      } else {
        const val = validateAndParseMagnet(magnetUri.trim());
        if (!val.isValid) {
          setError(val.error || 'Некорректная magnet-ссылка');
          return;
        }
      }
    }

    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        title: title.trim(),
        privacy,
        passcode: privacy === 'PRIVATE' ? passcode : undefined,
        maxMembers: maxMembers || 20,
        mediaId: mediaId || undefined,
        mediaType: mediaType || undefined,
        seasonNumber: selectedSeason || undefined,
        episodeNumber: selectedEpisode || undefined,
        source: {
          type: sourceType,
          url: sourceType === 'TORRENT' ? undefined : sourceUrl.trim() || undefined,
          magnetUri: sourceType === 'TORRENT' ? magnetUri.trim() : undefined,
          fileName: sourceType === 'TORRENT' ? selectedFileName || undefined : undefined,
        },
      };

      const res = await authFetch('/api/watch-party/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Не удалось создать комнату');
      }

      const created = await res.json();
      const code = created.room?.code || created.code;
      setCreatedRoomCode(code);
    } catch (err: any) {
      setError(err?.message || 'Ошибка создания комнаты');
    } finally {
      setLoading(false);
    }
  };

  if (createdRoomCode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
        <div
          className="w-full max-w-md bg-[#0B0D20] border border-[#1E2442] rounded-3xl shadow-2xl p-6 text-center space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">Комната создана!</h2>
            <p className="text-xs text-[#94A3B8] truncate">{title}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#080A18] border border-[#1E2442] space-y-2.5 text-left">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#94A3B8]">Код комнаты:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[#A78BFA]">{createdRoomCode}</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-2.5 py-1 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-[11px] font-bold text-white transition-colors cursor-pointer"
                >
                  {copiedCode ? '✓ Скопировано' : 'Скопировать код'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#1E2442]">
              <span className="text-xs text-[#94A3B8]">Ссылка для друзей:</span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-2.5 py-1 rounded-lg bg-[#151932] hover:bg-[#1E2442] text-[11px] font-bold text-white transition-colors cursor-pointer"
              >
                {copiedLink ? '✓ Скопировано' : 'Скопировать ссылку'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenCreatedRoom}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:from-[#6D28D9] hover:to-[#4F46E5] text-white font-bold text-sm shadow-xl shadow-[#7C3AED]/25 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Открыть комнату</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-lg bg-[#0B0D20] border border-[#1E2442] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#1E2442] flex items-center justify-between bg-gradient-to-r from-[#11152A] to-[#0B0D20]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] flex items-center justify-center text-white shadow-lg shadow-[#7C3AED]/25">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Создать комнату просмотра
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Синхронный просмотр с друзьями в реальном времени
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#64748B] hover:text-white hover:bg-[#151932] transition-colors cursor-pointer"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto custom-scrollbar space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Media preview card if associated */}
          {mediaTitle && (
            <div className="p-3 rounded-2xl bg-[#080A18] border border-[#1E2442] flex items-center gap-3">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={mediaTitle}
                  className="w-12 h-16 object-cover rounded-xl border border-[#1E2442]"
                />
              ) : (
                <div className="w-12 h-16 rounded-xl bg-[#151932] flex items-center justify-center text-[#64748B]">
                  <Film className="w-6 h-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#A78BFA]">
                  Привязанное произведение
                </span>
                <h4 className="text-sm font-bold text-[#F8FAFC] truncate">{mediaTitle}</h4>
                {(seasonNumber || episodeNumber) && (
                  <p className="text-xs text-[#94A3B8] font-mono">
                    {seasonNumber ? `Сезон ${seasonNumber}` : ''}
                    {episodeNumber ? `, Серия ${episodeNumber}` : ''}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Room Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#CBD5E1]">Название комнаты</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Пятничный кинопросмотр"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#080A18] border border-[#1E2442] text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] transition-colors"
            />
          </div>

          {/* Privacy Choice */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#CBD5E1]">Доступность комнаты</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPrivacy('PUBLIC')}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                  privacy === 'PUBLIC'
                    ? 'bg-[#8B5CF6]/15 border-[#8B5CF6] text-white shadow-sm'
                    : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8] hover:border-[#2D3766]'
                }`}
              >
                <Globe className="w-4 h-4 mt-0.5 text-[#A78BFA] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white">Публичная</div>
                  <div className="text-[11px] text-[#94A3B8]">Доступ по прямой ссылке или коду</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPrivacy('PRIVATE')}
                className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                  privacy === 'PRIVATE'
                    ? 'bg-[#8B5CF6]/15 border-[#8B5CF6] text-white shadow-sm'
                    : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8] hover:border-[#2D3766]'
                }`}
              >
                <Lock className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white">По паролю</div>
                  <div className="text-[11px] text-[#94A3B8]">Только для тех, кто знает пин-код</div>
                </div>
              </button>
            </div>
          </div>

          {/* Passcode input if private */}
          {privacy === 'PRIVATE' && (
            <div className="space-y-1.5 animate-fadeIn">
              <label className="text-xs font-semibold text-[#CBD5E1] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Пароль / Пин-код комнаты</span>
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Минимум 4 символа (например: 1234)"
                required={privacy === 'PRIVATE'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#080A18] border border-[#1E2442] text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-amber-400 font-mono tracking-wider transition-colors"
              />
            </div>
          )}

          {/* Source Type & URL / Magnet */}
          <div className="space-y-2 pt-2 border-t border-[#1E2442]">
            <label className="text-xs font-semibold text-[#CBD5E1]">Источник видео</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSourceType('DIRECT')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  sourceType === 'DIRECT'
                    ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white shadow-sm'
                    : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8] hover:text-white'
                }`}
              >
                <Link className="w-3.5 h-3.5" />
                <span>Ссылка</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceType('YOUTUBE')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  sourceType === 'YOUTUBE'
                    ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white shadow-sm'
                    : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8] hover:text-white'
                }`}
              >
                <Youtube className="w-3.5 h-3.5 text-rose-400" />
                <span>YouTube</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceType('TORRENT')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  sourceType === 'TORRENT'
                    ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white shadow-sm'
                    : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8] hover:text-white'
                }`}
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Торрент</span>
              </button>
            </div>

            {/* Direct / YouTube URL input */}
            {sourceType !== 'TORRENT' ? (
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder={
                  sourceType === 'YOUTUBE'
                    ? 'https://www.youtube.com/watch?v=...'
                    : 'https://example.com/video.mp4'
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] font-mono transition-colors"
              />
            ) : (
              /* Torrent Magnet Input & Inspection */
              <div className="space-y-2.5 animate-fadeIn">
                {mediaId ? (
                  <div className="space-y-2">
                    <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2.5">
                      <Sparkles className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>
                        Dodik Tracker автоматически подберёт лучший проверенный источник с высокой скоростью загрузки.
                      </span>
                    </div>

                    <details className="group text-left">
                      <summary className="text-[11px] font-semibold text-[#8B5CF6] hover:text-[#A78BFA] cursor-pointer select-none">
                        Указать свой источник вручную (необязательно)
                      </summary>
                      <div className="mt-2 space-y-2 pt-1">
                        <input
                          type="text"
                          value={magnetUri}
                          onChange={(e) => {
                            setMagnetUri(e.target.value);
                            setInspectError(null);
                          }}
                          placeholder="magnet:?xt=urn:btih:..."
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] font-mono transition-colors"
                        />
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={magnetUri}
                      onChange={(e) => {
                        setMagnetUri(e.target.value);
                        setInspectError(null);
                      }}
                      placeholder="magnet:?xt=urn:btih:..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6] font-mono transition-colors"
                    />
                    <p className="text-[11px] text-[#64748B]">
                      Вставьте magnet-ссылку для P2P-стриминга в браузере.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={inspecting || !magnetUri.trim()}
                    onClick={handleInspectTorrent}
                    className="px-3 py-1.5 rounded-xl bg-[#151932] hover:bg-[#1E2442] border border-[#1E2442] text-xs font-semibold text-[#A78BFA] transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {inspecting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{inspecting ? 'Опрос пиров...' : 'Проверить файлы'}</span>
                  </button>

                  {torrentDisplayName && (
                    <span className="text-[11px] text-[#CBD5E1] truncate font-semibold">
                      {torrentDisplayName}
                    </span>
                  )}
                </div>

                {inspectError && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{inspectError}</span>
                  </div>
                )}

                {/* Discovered Video Files Selector */}
                {inspectedFiles.length > 0 && (
                  <div className="p-3 rounded-2xl bg-[#080A18] border border-[#1E2442] space-y-2">
                    <div className="text-[11px] font-bold text-[#A78BFA] uppercase tracking-wider">
                      Выберите файл для воспроизведения:
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                      {inspectedFiles
                        .filter((f) => f.isVideo)
                        .map((f) => {
                          const isSel = selectedFileName === f.name;
                          return (
                            <button
                              key={`insp-${f.index}-${f.name}`}
                              type="button"
                              onClick={() => setSelectedFileName(f.name)}
                              className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs flex items-center justify-between border transition-all cursor-pointer ${
                                isSel
                                  ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                                  : 'bg-[#11152A] border-[#1E2442] text-[#94A3B8] hover:text-white'
                              }`}
                            >
                              <span className="truncate max-w-xs">{f.name}</span>
                              <span className="font-mono text-[10px] shrink-0">{f.formattedSize}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Max participants */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#CBD5E1] flex items-center justify-between">
              <span>Лимит участников</span>
              <span className="font-mono text-[#A78BFA]">{maxMembers} чел.</span>
            </label>
            <input
              type="range"
              min={2}
              max={50}
              step={1}
              value={maxMembers}
              onChange={(e) => setMaxMembers(parseInt(e.target.value, 10))}
              className="w-full accent-[#8B5CF6] cursor-pointer"
            />
          </div>

          {/* Submit */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:from-[#6D28D9] hover:to-[#4F46E5] text-white font-bold text-sm shadow-xl shadow-[#7C3AED]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Создание комнаты...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Запустить совместный просмотр</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
