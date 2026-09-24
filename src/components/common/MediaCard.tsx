import React from 'react';
import { useRouter } from '../../context/RouterContext.tsx';
import { formatMediaTypePath } from '../../utils/formatters.ts';
import {
  MediaItem,
  MediaCard as DesignSystemMediaCard,
  MediaPoster,
} from '../design-system/index.ts';

export type MediaCardItem = MediaItem;

export { formatMediaTypePath };

export interface MediaCardProps {
  media: MediaItem;
  size?: 'sm' | 'md' | 'lg';
  showQuickActions?: boolean;
  onQuickAdd?: (media: MediaItem) => void;
  onQuickBookmark?: (media: MediaItem) => void;
  onToggleFavorite?: (media: MediaItem) => void;
  className?: string;
}

export const MediaCard: React.FC<MediaCardProps> = (props) => {
  return <DesignSystemMediaCard {...props} />;
};

export { MediaPoster };
