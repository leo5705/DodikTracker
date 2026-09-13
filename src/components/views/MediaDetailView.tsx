import React from 'react';
import { GameDetailView } from './GameDetailView.tsx';
import { ContentDetailView } from './ContentDetailView.tsx';

interface MediaDetailViewProps {
  mediaId: number;
  mediaType?: string;
  queryParams?: Record<string, string>;
}

export const MediaDetailView: React.FC<MediaDetailViewProps> = ({
  mediaId,
  mediaType,
  queryParams,
}) => {
  const isGame = (mediaType || '').toLowerCase() === 'game';

  if (isGame) {
    return (
      <GameDetailView
        idOrSlug={String(queryParams?.externalId || mediaId)}
      />
    );
  }

  return (
    <ContentDetailView
      mediaId={mediaId}
      mediaType={mediaType}
      queryParams={queryParams}
    />
  );
};
