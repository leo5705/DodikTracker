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
  const statusColor = isOnline ? 'bg-green-500' : 'bg-gray-400';
  
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="relative flex items-center justify-center">
        {isOnline && (
          <span className={`absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping`} />
        )}
        <span className={`relative inline-flex rounded-full ${sizeClasses[size]} ${statusColor} border-2 border-white dark:border-gray-800`} />
      </span>
      {showText && presence?.statusText && (
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
          {presence.statusText}
        </span>
      )}
    </div>
  );
};
