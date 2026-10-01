import React, { useState, useEffect } from 'react';
import { useWatchParty } from '../../context/WatchPartyContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { WatchPartyHeader } from '../watch-party/WatchPartyHeader.tsx';
import { WatchPartyPlayer } from '../watch-party/WatchPartyPlayer.tsx';
import { WatchPartyRoomInfo } from '../watch-party/WatchPartyRoomInfo.tsx';
import { WatchPartyMemberList } from '../watch-party/WatchPartyMemberList.tsx';
import { WatchPartyChat } from '../watch-party/WatchPartyChat.tsx';
import { SourcePreparationScreen } from '../watch-party/SourcePreparationScreen.tsx';
import { WatchSourcePicker } from '../watch-party/WatchSourcePicker.tsx';
import { useToast } from '../../context/NotificationContext.tsx';
import {
  MessageSquare,
  Users,
  Lock,
  KeyRound,
  AlertCircle,
  Loader2,
  Tv,
  Film,
  Sparkles,
  Link,
  Youtube,
  RefreshCw,
  LogOut,
  Home,
  Check,
  Edit3,
  Download,
  Copy,
  X,
} from 'lucide-react';
import { MediaSourceConfig, WatchPartySourceType, TorrentMediaFile } from '../../types/watchParty.ts';
import { validateAndParseMagnet } from '../../utils/magnetValidator.ts';
import { MediaSourceFactory } from '../../services/mediaSources/MediaSourceFactory.ts';

interface WatchPartyViewProps {
  roomCode?: string;
}

export const WatchPartyView: React.FC<WatchPartyViewProps> = ({ roomCode: propCode }) => {
  const { route, navigate } = useRouter();
  const { dbUser } = useAuth();
  const {
    connectionState,
    room,
    members,
    isHost,
    error,
    kickedReason,
    roomClosedReason,
    connect,
    disconnect,
    clearError,
    hostChangeSource,
    torrentState,
    torrentFile,
    torrentErrorCode,
    torrentErrorMessage,
    torrentFallbackCount,
    torrentRetryCount,
    hostTriggerAutoTorrent,
    hostCancelAutoTorrent,
  } = useWatchParty();

  const activeCode = propCode || route.params?.code || route.params?.id || '';

  const { showToast } = useToast();
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [hideInviteBanner, setHideInviteBanner] = useState(false);

  const handleCopyInviteLink = async () => {
    try {
      const inviteUrl = `${window.location.protocol}//${window.location.host}/watch/${room?.code || activeCode}`;
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      showToast('Ссылка приглашения скопирована в буфер обмена!', 'success');
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch (_e) {
      showToast('Не удалось скопировать ссылку', 'error');
    }
  };

  const [passcode, setPasscode] = useState('');
  const [passcodeSubmitted, setPasscodeSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'members'>('chat');

  // Source change modal state for HOST
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [newSourceType, setNewSourceType] = useState<WatchPartySourceType>('DIRECT');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newMagnetUri, setNewMagnetUri] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [newSeason, setNewSeason] = useState<string>('');
  const [newEpisode, setNewEpisode] = useState<string>('');

  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectedFiles, setInspectedFiles] = useState<TorrentMediaFile[]>([]);

  // Initial connection trigger
  useEffect(() => {
    if (activeCode) {
      connect(activeCode);
    }
    return () => {
      // Cleanup happens inside WatchPartyContext when leaving
    };
  }, [activeCode]);

  // Inspect torrent metadata in modal
  const handleInspectTorrentInModal = async () => {
    if (!newMagnetUri.trim()) {
      setInspectError('Введите magnet-ссылку');
      return;
    }
    const val = validateAndParseMagnet(newMagnetUri.trim());
    if (!val.isValid) {
      setInspectError(val.error || 'Некорректная magnet-ссылка');
      return;
    }

    setInspecting(true);
    setInspectError(null);
    try {
      const res = await MediaSourceFactory.inspectTorrentMetadata(newMagnetUri.trim(), 25000);
      setInspectedFiles(res.files);
      const firstVid = res.files.find((f) => f.isVideo);
      if (firstVid && !newFileName) {
        setNewFileName(firstVid.name);
      }
    } catch (err: any) {
      setInspectError(err?.message || 'Не удалось прочитать торрент');
    } finally {
      setInspecting(false);
    }
  };

  // Handle source change submission
  const handleUpdateSource = (e: React.FormEvent) => {
    e.preventDefault();

    if (newSourceType === 'TORRENT') {
      if (!newMagnetUri.trim()) return;
      const val = validateAndParseMagnet(newMagnetUri.trim());
      if (!val.isValid) {
        setInspectError(val.error || 'Неверная magnet-ссылка');
        return;
      }
    } else {
      if (!newSourceUrl.trim()) return;
    }

    const sourceConfig: MediaSourceConfig = {
      type: newSourceType,
      url: newSourceType === 'TORRENT' ? undefined : newSourceUrl.trim() || undefined,
      magnetUri: newSourceType === 'TORRENT' ? newMagnetUri.trim() : undefined,
      fileName: newSourceType === 'TORRENT' ? newFileName.trim() || undefined : undefined,
    };

    const sNum = newSeason ? parseInt(newSeason, 10) : undefined;
    const epNum = newEpisode ? parseInt(newEpisode, 10) : undefined;

    hostChangeSource(sourceConfig, room?.mediaId || undefined, sNum, epNum);
    setShowSourceModal(false);
  };

  // Open source modal prefilled with current room info
  const handleOpenSourceModal = () => {
    if (room?.mediaId) {
      setShowSourcePicker(true);
      return;
    }
    if (room) {
      setNewSourceType(room.sourceType || 'DIRECT');
      setNewSourceUrl(room.sourceUrl || room.sourceConfig?.url || '');
      setNewMagnetUri(room.sourceConfig?.magnetUri || '');
      setNewFileName(room.sourceConfig?.fileName || '');
      setNewSeason(room.seasonNumber ? String(room.seasonNumber) : '');
      setNewEpisode(room.episodeNumber ? String(room.episodeNumber) : '');
      setInspectedFiles([]);
      setInspectError(null);
    }
    setShowSourceModal(true);
  };

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;
    setPasscodeSubmitted(true);
    clearError();
    connect(activeCode, passcode.trim());
  };

  // 1. Kicked out state
  if (kickedReason) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[#0B0D20] border border-rose-500/30 shadow-2xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">Вы были исключены</h2>
          <p className="text-sm text-[#94A3B8]">{kickedReason}</p>
          <div className="pt-2">
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 rounded-xl bg-[#151932] hover:bg-[#1E2442] text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              <span>Вернуться на главную</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Room closed state
  if (roomClosedReason) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-2xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#8B5CF6]/15 text-[#A78BFA] flex items-center justify-center mx-auto">
            <Film className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">Комната закрыта</h2>
          <p className="text-sm text-[#94A3B8]">{roomClosedReason}</p>
          <div className="pt-2">
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white font-bold text-xs shadow-lg shadow-[#7C3AED]/25 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              <span>На главную страницу</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Passcode required dialog if private
  const isPasscodeRequired =
    error?.includes('пароль') ||
    error?.includes('Пароль') ||
    error?.includes('passcode') ||
    (connectionState === 'ERROR' && !passcodeSubmitted);

  if (isPasscodeRequired && connectionState !== 'CONNECTED_TO_ROOM') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[#0B0D20] border border-amber-500/30 shadow-2xl space-y-4 text-left">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Приватная комната</h2>
              <p className="text-xs text-[#94A3B8]">Для входа требуется ввести пин-код</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handlePasscodeSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#CBD5E1] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Пароль комнаты</span>
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Введите пароль..."
                autoFocus
                required
                className="w-full px-4 py-3 rounded-xl bg-[#080A18] border border-[#1E2442] text-white font-mono tracking-widest text-center text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex-1 py-3 rounded-xl bg-[#151932] hover:bg-[#1E2442] text-[#94A3B8] hover:text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-xs shadow-lg transition-all cursor-pointer"
              >
                Войти в комнату
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // 4. Fatal error (e.g. Not Found or Banned)
  if (connectionState === 'ERROR' && error && !isPasscodeRequired) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[#0B0D20] border border-rose-500/30 shadow-2xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">Не удалось войти в комнату</h2>
          <p className="text-sm text-[#94A3B8]">{error}</p>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                clearError();
                connect(activeCode, passcode);
              }}
              className="flex-1 py-3 rounded-xl bg-[#151932] hover:bg-[#1E2442] text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Повторить</span>
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-3 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
            >
              В каталог
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5. Connecting loading screen
  if (connectionState === 'CONNECTING' || connectionState === 'JOINING' || (!room && connectionState !== 'ERROR')) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center animate-fadeIn space-y-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-3xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 flex items-center justify-center text-[#A78BFA]">
            <Film className="w-8 h-8" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-[#8B5CF6] absolute -bottom-1 -right-1" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white">Подключение к комнате</h3>
          <p className="text-xs text-[#94A3B8] font-mono">Код: {activeCode}</p>
        </div>
      </div>
    );
  }

  // 6. Active Watch Party Room View
  return (
    <div className="space-y-4 pb-12 animate-fadeIn max-w-7xl mx-auto px-2 sm:px-4">
      {/* Reconnecting Banner */}
      {connectionState === 'RECONNECTING' && (
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between shadow-xl animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
            <span className="font-semibold">Соединение потеряно. Переподключение к комнате...</span>
          </div>
          <button
            onClick={() => connect(activeCode, passcode)}
            className="px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold transition-colors cursor-pointer"
          >
            Повторить
          </button>
        </div>
      )}

      {/* Top Bar Header */}
      <WatchPartyHeader />

      {/* Quick Invite Friends Banner when host is alone in the room */}
      {isHost && members.length <= 1 && !hideInviteBanner && (
        <div className="p-4 rounded-3xl bg-gradient-to-r from-[#11152A] via-[#0E1226] to-[#0B0D20] border border-[#1E2442] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#7C3AED] to-[#6366F1] flex items-center justify-center text-white shrink-0 shadow-lg shadow-[#7C3AED]/20">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-white tracking-tight">Пригласить друга</h4>
              <p className="text-xs text-[#94A3B8] truncate font-mono mt-0.5">
                {`${window.location.protocol}//${window.location.host}/watch/${room?.code || activeCode}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:from-[#6D28D9] hover:to-[#4F46E5] text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-[#7C3AED]/20"
            >
              {copiedInvite ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              <span>{copiedInvite ? '✓ Ссылка скопирована' : 'Скопировать'}</span>
            </button>
            <button
              type="button"
              onClick={() => setHideInviteBanner(true)}
              className="p-2 rounded-xl text-[#64748B] hover:text-white hover:bg-[#151932] transition-colors cursor-pointer"
              title="Скрыть"
              aria-label="Скрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Player on Left, Side Panel (Chat & Members) on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Area: Content Info Card + Video Player + Host Quick Controls (8 cols on lg) */}
        <div className="lg:col-span-8 space-y-3">
          <WatchPartyRoomInfo />

          {torrentState && torrentState !== 'READY' ? (
            <SourcePreparationScreen
              torrentState={torrentState}
              torrentFile={torrentFile}
              torrentErrorMessage={torrentErrorMessage}
              isHost={isHost}
              onRetry={hostTriggerAutoTorrent}
              onCancel={hostCancelAutoTorrent}
              onOpenSourceModal={handleOpenSourceModal}
              torrentFallbackCount={torrentFallbackCount}
              torrentRetryCount={torrentRetryCount}
            />
          ) : (
            <WatchPartyPlayer />
          )}

          {/* Source Control Banner */}
          {isHost ? (
            <div className="p-3.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#8B5CF6]/15 text-[#A78BFA] shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>Источник воспроизведения</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#151932] text-[#A78BFA] border border-[#1E2442]">
                      {room?.sourceType || 'DIRECT'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8] truncate max-w-xs sm:max-w-md">
                    {room?.sourceConfig?.title || room?.sourceConfig?.fileName || room?.sourceUrl || 'Источник не настроен'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {room?.mediaId ? (
                  <button
                    type="button"
                    onClick={() => setShowSourcePicker(true)}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:brightness-110 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Выбрать другой источник</span>
                  </button>
                ) : (
                  <button
                    onClick={handleOpenSourceModal}
                    className="px-3 py-2 rounded-xl bg-[#151932] hover:bg-[#8B5CF6]/20 border border-[#1E2442] hover:border-[#8B5CF6]/50 text-xs font-semibold text-[#A78BFA] hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Изменить медиа</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-[#0B0D20] border border-[#1E2442] flex items-center justify-between text-xs text-[#94A3B8] shadow-sm">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-[#8B5CF6]" />
                <span>Источник видеопотока</span>
              </div>
              <span className="text-[11px] text-[#64748B] italic">Источник выбирает ведущий</span>
            </div>
          )}
        </div>

        {/* Right Area: Sidebar Panel with Tabs (4 cols on lg) */}
        <div className="lg:col-span-4 rounded-3xl bg-[#0B0D20] border border-[#1E2442] p-4 shadow-xl flex flex-col min-h-[540px]">
          {/* Tabs Selector */}
          <div className="grid grid-cols-2 p-1 rounded-2xl bg-[#080A18] border border-[#1E2442] mb-3">
            <button
              onClick={() => setActiveTab('chat')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'chat'
                  ? 'bg-[#8B5CF6] text-white shadow-md'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Чат</span>
            </button>

            <button
              onClick={() => setActiveTab('members')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === 'members'
                  ? 'bg-[#8B5CF6] text-white shadow-md'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Участники ({members.length})</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {activeTab === 'chat' ? <WatchPartyChat /> : <WatchPartyMemberList />}
          </div>
        </div>
      </div>

      {/* HOST Edit Source Modal */}
      {showSourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
          <div
            className="w-full max-w-md bg-[#0B0D20] border border-[#1E2442] rounded-3xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1E2442] pb-3">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-[#A78BFA]" />
                <h3 className="text-sm font-bold text-white">Изменить источник видео</h3>
              </div>
              <button
                onClick={() => setShowSourceModal(false)}
                className="text-[#64748B] hover:text-white text-xs font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSource} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#CBD5E1]">Тип источника</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewSourceType('DIRECT')}
                    className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      newSourceType === 'DIRECT'
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white shadow-sm'
                        : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8]'
                    }`}
                  >
                    <Link className="w-3.5 h-3.5" />
                    <span>Ссылка</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewSourceType('YOUTUBE')}
                    className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      newSourceType === 'YOUTUBE'
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white shadow-sm'
                        : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8]'
                    }`}
                  >
                    <Youtube className="w-3.5 h-3.5 text-rose-400" />
                    <span>YouTube</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewSourceType('TORRENT')}
                    className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      newSourceType === 'TORRENT'
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white shadow-sm'
                        : 'bg-[#080A18] border-[#1E2442] text-[#94A3B8]'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Торрент</span>
                  </button>
                </div>
              </div>

              {/* Direct / YouTube URL */}
              {newSourceType !== 'TORRENT' ? (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#CBD5E1]">Ссылка на видео</label>
                  <input
                    type="url"
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    placeholder={
                      newSourceType === 'YOUTUBE'
                        ? 'https://www.youtube.com/watch?v=...'
                        : 'https://example.com/video.mp4'
                    }
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-white font-mono placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              ) : (
                /* Torrent Magnet Input */
                <div className="space-y-2 animate-fadeIn">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#CBD5E1]">Magnet-ссылка торрента</label>
                    <input
                      type="text"
                      value={newMagnetUri}
                      onChange={(e) => {
                        setNewMagnetUri(e.target.value);
                        setInspectError(null);
                      }}
                      placeholder="magnet:?xt=urn:btih:..."
                      required={newSourceType === 'TORRENT'}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-white font-mono placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={inspecting || !newMagnetUri.trim()}
                      onClick={handleInspectTorrentInModal}
                      className="px-3 py-1.5 rounded-xl bg-[#151932] hover:bg-[#1E2442] border border-[#1E2442] text-xs font-semibold text-[#A78BFA] transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {inspecting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>{inspecting ? 'Опрос...' : 'Проверить файлы'}</span>
                    </button>
                  </div>

                  {inspectError && (
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{inspectError}</span>
                    </div>
                  )}

                  {inspectedFiles.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-[#080A18] border border-[#1E2442] space-y-1.5">
                      <div className="text-[11px] font-bold text-[#A78BFA] uppercase">Файл для запуска:</div>
                      <div className="space-y-1 max-h-28 overflow-y-auto custom-scrollbar">
                        {inspectedFiles
                          .filter((f) => f.isVideo)
                          .map((f) => (
                            <button
                              key={`modal-file-${f.index}-${f.name}`}
                              type="button"
                              onClick={() => setNewFileName(f.name)}
                              className={`w-full px-2 py-1 rounded-lg text-left text-xs flex items-center justify-between border cursor-pointer ${
                                newFileName === f.name
                                  ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                                  : 'bg-[#11152A] border-[#1E2442] text-[#94A3B8]'
                              }`}
                            >
                              <span className="truncate max-w-[200px]">{f.name}</span>
                              <span className="font-mono text-[10px]">{f.formattedSize}</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Season & Episode */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#CBD5E1]">Сезон (опц.)</label>
                  <input
                    type="number"
                    value={newSeason}
                    onChange={(e) => setNewSeason(e.target.value)}
                    placeholder="1"
                    className="w-full px-3 py-2 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#CBD5E1]">Серия (опц.)</label>
                  <input
                    type="number"
                    value={newEpisode}
                    onChange={(e) => setNewEpisode(e.target.value)}
                    placeholder="1"
                    className="w-full px-3 py-2 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSourceModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-[#151932] hover:bg-[#1E2442] text-[#94A3B8] font-bold text-xs cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white font-bold text-xs shadow-md cursor-pointer"
                >
                  Применить для всех
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* HOST Automatic Source Picker Modal */}
      {showSourcePicker && room && (
        <WatchSourcePicker
          isOpen={showSourcePicker}
          onClose={() => setShowSourcePicker(false)}
          mediaId={room.mediaId || 0}
          mediaTitle={room.title || 'Медиа'}
          mediaType={room.mediaType || 'movie'}
          seasonNumber={room.seasonNumber || undefined}
          episodeNumber={room.episodeNumber || undefined}
          mode="switch-source"
          onSourceSelected={(config) => {
            hostChangeSource(
              config,
              room.mediaId || undefined,
              room.seasonNumber || undefined,
              room.episodeNumber || undefined
            );
            setShowSourcePicker(false);
          }}
        />
      )}
    </div>
  );
};
