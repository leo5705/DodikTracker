import React, { useState } from 'react';
import { Users, Search, Sparkles } from 'lucide-react';
import { useWatchParty } from '../../context/WatchPartyContext.tsx';
import { WatchPartyMemberRow } from './WatchPartyMemberRow.tsx';

export const WatchPartyMemberList: React.FC = () => {
  const { members } = useWatchParty();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMembers = members.filter((m) =>
    m.username.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

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
          filteredMembers.map((member) => (
            <WatchPartyMemberRow key={member.userId} member={member} />
          ))
        ) : (
          <div className="py-8 text-center text-xs text-[#64748B]">
            {searchQuery ? 'Участники не найдены' : 'В комнате пока нет других участников'}
          </div>
        )}
      </div>
    </div>
  );
};
