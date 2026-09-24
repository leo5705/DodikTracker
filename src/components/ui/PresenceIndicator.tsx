import React from 'react';
import { UserPresenceInfo } from '../../hooks/usePresence.ts';

interface PresenceIndicatorProps {
  presence?: UserPresenceInfo;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({
  presence,
  showText = false,
  size = 'md',
  className = ''
}) => {
  const isOnline = presence?.status === 'online';
  const statusColor = isOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-zinc-500';
  
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3'
  };

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="relative inline-flex items-center justify-center">
        <span
          className={`inline-block rounded-full ${sizeClasses[size]} ${statusColor} ring-2 ring-[#0B0D20]`}
        />
      </span>
      {showText && (
        <span className="text-[11px] text-[#94A3B8] font-medium leading-none">
          {isOnline ? 'В сети' : presence?.statusText || 'Не в сети'}
        </span>
      )}
    </div>
  );
};
