import React, { useState } from 'react';
import {
  Crown,
  MoreVertical,
  UserCheck,
  UserX,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import { WatchPartyMemberLiveState } from '../../types/watchParty.ts';
import { useWatchParty } from '../../context/WatchPartyContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { WatchPartySyncBadge } from './WatchPartySyncBadge.tsx';
import { Avatar } from '../design-system/index.ts';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';

interface WatchPartyMemberRowProps {
  member: WatchPartyMemberLiveState;
}

function formatSecondsToTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const WatchPartyMemberRow: React.FC<WatchPartyMemberRowProps> = ({ member }) => {
  const { isHost, hostTransfer, hostKick } = useWatchParty();
  const { dbUser } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [showKickConfirm, setShowKickConfirm] = useState(false);
  const [showBanConfirm, setShowBanConfirm] = useState(false);

  const isCurrentUser = dbUser?.id === member.userId;
  const isMemberHost = member.role === 'HOST';

  const timeStr = formatSecondsToTime(member.currentTime);
  const durationStr = member.duration > 0 ? formatSecondsToTime(member.duration) : null;

  return (
    <>
      <div
        className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
          isCurrentUser
            ? 'bg-[#151932]/70 border-[#8B5CF6]/30 shadow-sm'
            : 'bg-[#080A18]/60 hover:bg-[#11152A] border-[#1E2442]'
        }`}
      >
        {/* Left: Avatar + Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <Avatar
              src={member.avatar || undefined}
              username={member.username}
              size="md"
              className="border border-[#1E2442]"
            />
            {isMemberHost && (
              <div
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-md"
                title="Создатель комнаты (HOST)"
              >
                <Crown className="w-2.5 h-2.5 fill-black" />
              </div>
            )}
          </div>

          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-[#F8FAFC] truncate">
                {member.username}
              </span>
              {isCurrentUser && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30">
                  Вы
                </span>
              )}
            </div>

            {/* Time string: 01:32:15 / 02:14:38 */}
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#94A3B8]">
              <Clock className="w-3 h-3 text-[#64748B]" />
              <span className="text-[#CBD5E1] font-semibold">{timeStr}</span>
              {durationStr && <span>/ {durationStr}</span>}
            </div>
          </div>
        </div>

        {/* Right: Sync Badge + Host Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <WatchPartySyncBadge
            status={member.isOnline ? member.syncStatus : 'DISCONNECTED'}
            driftSeconds={member.driftSeconds}
            compact={false}
          />

          {/* Host Kebab Menu (Only host can see this on other members) */}
          {isHost && !isCurrentUser && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#151932] transition-colors cursor-pointer"
                title="Управление участником"
                aria-label="Управление участником"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-48 rounded-2xl bg-[#0B0D20] border border-[#1E2442] shadow-2xl p-1.5 z-40 space-y-1 animate-fade-in"
                  onClick={() => setMenuOpen(false)}
                >
                  <button
                    onClick={() => setShowTransferConfirm(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-[#CBD5E1] hover:bg-[#151932] hover:text-white transition-colors cursor-pointer text-left"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Передать HOST</span>
                  </button>

                  <button
                    onClick={() => setShowKickConfirm(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer text-left"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Исключить</span>
                  </button>

                  <button
                    onClick={() => setShowBanConfirm(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-rose-500 hover:bg-rose-500/15 transition-colors cursor-pointer text-left"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Заблокировать</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Transfer Modal */}
      <ConfirmModal
        isOpen={showTransferConfirm}
        title="Передать права управления комнатой?"
        message={`Пользователь ${member.username} станет новым HOST и получит полный контроль над воспроизведением.`}
        confirmText="Передать права"
        cancelText="Отмена"
        variant="warning"
        onConfirm={() => {
          hostTransfer(member.userId);
          setShowTransferConfirm(false);
        }}
        onCancel={() => setShowTransferConfirm(false)}
      />

      {/* Confirm Kick Modal */}
      <ConfirmModal
        isOpen={showKickConfirm}
        title={`Исключить ${member.username}?`}
        message="Пользователь будет отключён от совместного просмотра."
        confirmText="Исключить"
        cancelText="Отмена"
        variant="danger"
        onConfirm={() => {
          hostKick(member.userId, false);
          setShowKickConfirm(false);
        }}
        onCancel={() => setShowKickConfirm(false)}
      />

      {/* Confirm Ban Modal */}
      <ConfirmModal
        isOpen={showBanConfirm}
        title={`Заблокировать ${member.username}?`}
        message="Пользователь будет исключён и не сможет повторно присоединиться к этой комнате."
        confirmText="Заблокировать"
        cancelText="Отмена"
        variant="danger"
        onConfirm={() => {
          hostKick(member.userId, true);
          setShowBanConfirm(false);
        }}
        onCancel={() => setShowBanConfirm(false)}
      />
    </>
  );
};
