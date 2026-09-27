import React from 'react';
import {
  MusicTrackRow,
  MusicTrackRowProps,
  AnyTrackItem,
  normalizeToPlayerTrack,
  formatDuration,
} from './MusicTrackRow.tsx';

export type { AnyTrackItem };
export { normalizeToPlayerTrack, formatDuration, MusicTrackRow };

export interface MusicTrackCardProps extends MusicTrackRowProps {}

export const MusicTrackCard: React.FC<MusicTrackCardProps> = (props) => {
  return <MusicTrackRow {...props} />;
};

export default MusicTrackRow;
