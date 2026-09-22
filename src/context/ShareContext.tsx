import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ShareContentModal, ShareContentMedia } from '../components/modals/ShareContentModal.tsx';
import { CompletionCelebrationModal, CompletionItem } from '../components/modals/CompletionCelebrationModal.tsx';

interface ShareContextType {
  openShareModal: (media: ShareContentMedia, isCompletion?: boolean) => void;
  openCompletionModal: (item: CompletionItem) => void;
}

const ShareContext = createContext<ShareContextType | undefined>(undefined);

export const ShareProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [shareMedia, setShareMedia] = useState<ShareContentMedia | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isShareCompletion, setIsShareCompletion] = useState(false);

  const [completionItem, setCompletionItem] = useState<CompletionItem | null>(null);
  const [isCompletionOpen, setIsCompletionOpen] = useState(false);

  const openShareModal = (media: ShareContentMedia, isCompletion = false) => {
    setShareMedia(media);
    setIsShareCompletion(isCompletion);
    setIsShareOpen(true);
  };

  const openCompletionModal = (item: CompletionItem) => {
    setCompletionItem(item);
    setIsCompletionOpen(true);
  };

  return (
    <ShareContext.Provider value={{ openShareModal, openCompletionModal }}>
      {children}

      <ShareContentModal
        isOpen={isShareOpen}
        onClose={() => {
          setIsShareOpen(false);
          setShareMedia(null);
        }}
        media={shareMedia}
        isCompletion={isShareCompletion}
      />

      <CompletionCelebrationModal
        isOpen={isCompletionOpen}
        onClose={() => {
          setIsCompletionOpen(false);
          setCompletionItem(null);
        }}
        item={completionItem}
      />
    </ShareContext.Provider>
  );
};

export const useShare = (): ShareContextType => {
  const context = useContext(ShareContext);
  if (!context) {
    throw new Error('useShare must be used within a ShareProvider');
  }
  return context;
};
