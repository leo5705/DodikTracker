import React from 'react';
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
  return (
    <ContentDetailView
      mediaId={mediaId}
      mediaType={mediaType}
      queryParams={queryParams}
    />
  );
};
