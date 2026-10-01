import React, { useState } from 'react';
import {
  ArrowLeft,
  Users,
  Lock,
  Globe,
  Share2,
  LogOut,
  PowerOff,
  Copy,
  Check,
  Crown,
  Sparkles,
} from 'lucide-react';
import { useWatchParty } from '../../context/WatchPartyContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { useShare } from '../../context/ShareContext.tsx';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';

export const WatchPartyHeader: React.FC = () => {
  const { room, isHost, members, hostCloseRoom, disconnect } = useWatchParty();
  const { navigate, goBack } = useRouter();
  const { openShareModal } = useShare();

  const [copied, setCopied] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  if (!room) return null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_e) {}
  };

  const handleShare = () => {
    if (room.mediaId) {
      openShareModal({
        id: room.mediaId,
        title: `Совместный просмотр: ${room.title}`,
        type: room.mediaType || 'movie',
        posterUrl: room.mediaMetadata?.posterUrl || null,
      });
    } else {
      handleCopyCode();
    }
  };

  const handleLeave = () => {
    disconnect();
    if (room.mediaId) {
      navigate(`/media/${room.mediaId}`);
    } else {
      goBack();
    }
  };

  const handleConfirmClose = () => {
    hostCloseRoom();
    setShowCloseConfirm(false);
    if (room.mediaId) {
      navigate(`/media/${room.mediaId}`);
    } else {
      navigate('/');
    }
  };

  return (
    <>
      <header className="p-4 md:px-6 rounded-3xl bg-[#0B0D20] border border-[#1E2442] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Side: Back + Title + Info */}
        <div className="flex items-center gap-3.5 min-w-0">
          <button
            onClick={() => (room.mediaId ? navigate(`/media/${room.mediaId}`) : goBack())}
            className="p-2.5 rounded-2xl bg-[#080A18] hover:bg-[#151932] border border-[#1E2442] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors shrink-0 cursor-pointer"
            title="Назад к произведению"
            aria-label="Назад к произведению"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base md:text-lg font-bold text-[#F8FAFC] truncate tracking-tight">
                {room.title}
              </h1>

              {room.seasonNumber && (
                <span className="px-2 py-0.5 rounded-lg bg-[#151932] border border-[#1E2442] text-[11px] font-mono text-[#A78BFA]">
                  Сезон {room.seasonNumber}
                  {room.episodeNumber ? `, Серия ${room.episodeNumber}` : ''}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 text-xs text-[#94A3B8] flex-wrap">
              {/* Privacy badge */}
              <span className="inline-flex items-center gap-1">
                {room.privacy === 'PRIVATE' ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-amber-300 font-medium">По паролю</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300 font-medium">Открытая</span>
                  </>
                )}
              </span>

              <span className="text-[#64748B]">•</span>

              {/* Room Code */}
              <button
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#080A18] hover:bg-[#151932] border border-[#1E2442] text-[11px] font-mono font-semibold text-[#CBD5E1] transition-colors cursor-pointer"
                title="Нажмите, чтобы скопировать код"
              >
                <span>{room.code}</span>
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#94A3B8]" />}
              </button>

              <span className="text-[#64748B]">•</span>

              {/* Participants count */}
              <span className="inline-flex items-center gap-1 text-[#CBD5E1]">
                <Users className="w-3.5 h-3.5 text-[#8B5CF6]" />
                <span>
                  {members.length} {members.length === 1 ? 'участник' : members.length < 5 ? 'участника' : 'участников'}
                </span>
              </span>

              {/* HOST indicator */}
              {isHost && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-300">
                  <Crown className="w-3 h-3 text-amber-400" />
                  <span>Вы — Создатель</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Quick Action Buttons */}
        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
          <button
            type="button"
            onClick={handleShare}
            className="px-3.5 py-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] hover:border-[#8B5CF6]/40 text-xs font-semibold text-[#CBD5E1] hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            aria-label="Поделиться ссылкой на комнату"
          >
            <Share2 className="w-4 h-4 text-[#A78BFA]" />
            <span>Пригласить</span>
          </button>

          {isHost ? (
            <button
              type="button"
              onClick={() => setShowCloseConfirm(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-semibold text-rose-400 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              aria-label="Закрыть комнату"
            >
              <PowerOff className="w-4 h-4" />
              <span>Закрыть комнату</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowLeaveConfirm(true)}
              className="px-3.5 py-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-semibold text-[#94A3B8] hover:text-rose-400 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              aria-label="Выйти из комнаты"
            >
              <LogOut className="w-4 h-4" />
              <span>Выйти</span>
            </button>
          )}
        </div>
      </header>

      {/* Confirm Close Modal (HOST) */}
      <ConfirmModal
        isOpen={showCloseConfirm}
        title="Закрыть комнату совместного просмотра?"
        message="Комната будет закрыта для всех участников. Текущее время просмотра сохранится в истории."
        confirmText="Закрыть комнату"
        cancelText="Отмена"
        variant="danger"
        onConfirm={handleConfirmClose}
        onCancel={() => setShowCloseConfirm(false)}
      />

      {/* Confirm Leave Modal (MEMBER) */}
      <ConfirmModal
        isOpen={showLeaveConfirm}
        title="Покинуть совместный просмотр?"
        message="Вы выйдете из сессии. Вы сможете присоединиться снова по коду комнаты в любое время."
        confirmText="Выйти"
        cancelText="Остаться"
        variant="warning"
        onConfirm={handleLeave}
        onCancel={() => setShowLeaveConfirm(false)}
      />
    </>
  );
};
