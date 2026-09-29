import { ResolvedPlaybackSource, AudioQuality } from './types.ts';

export interface PlaybackResolver {
  resolve(
    track: any,
    options?: { quality?: AudioQuality }
  ): Promise<ResolvedPlaybackSource>;
}
