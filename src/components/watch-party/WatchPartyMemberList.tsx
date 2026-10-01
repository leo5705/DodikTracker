import React, { useState } from 'react';
import { Users, Search, Sparkles, Copy, Check } from 'lucide-react';
import { useWatchParty } from '../../context/WatchPartyContext.tsx';
import { useToast } from '../../context/NotificationContext.tsx';
import { WatchPartyMemberRow } from './WatchPartyMemberRow.tsx';

export const WatchPartyMemberList: React.FC = () => {
  const { members, room } = useWatchParty();
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const filteredMembers = members.filter((m) =>
    m.username.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const handleCopyLink = async () => {
    if (!room?.code) return;
    try {
      const shareUrl = `${window.location.protocol}//${window.location.host}/watch/${room.code}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast('Ссылка приглашения скопирована!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (_e) {
      showToast('Не удалось скопировать ссылку', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1E2442]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#8B5CF6]/15 text-[#A78BFA]">
            <Users className="w-4 h-4" />
          </div>
          <h2 className="text-xs font-bold text-[#F8FAFC] tracking-wide uppercase">
            Участники ({members.length})
          </h2>
        </div>

        {members.length > 3 && (
          <div className="relative w-32">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск..."
              className="w-full pl-7 pr-2 py-1 rounded-lg bg-[#080A18] border border-[#1E2442] text-[11px] text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]/50"
            />
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2 top-1.5" />
          </div>
        )}
      </div>

      {/* List */}
      <div className="space-y-2 overflow-y-auto max-h-[380px] custom-scrollbar pr-1">
        {filteredMembers.length > 0 ? (
          <>
            {filteredMembers.map((member) => (
              <WatchPartyMemberRow key={member.userId} member={member} />
            ))}
            {members.length <= 1 && !searchQuery && (
              <div className="pt-4 pb-2 text-center space-y-2.5">
                <p className="text-xs text-[#94A3B8]">Пока в комнате только вы</p>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3.5 py-1.5 rounded-xl bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 border border-[#8B5CF6]/40 text-[#A78BFA] hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '✓ Скопировано' : 'Пригласить друзей'}</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="py-8 text-center text-xs text-[#64748B]">
            {searchQuery ? 'Участники не найдены' : 'В комнате пока нет других участников'}
          </div>
        )}
      </div>
    </div>
  );
};
