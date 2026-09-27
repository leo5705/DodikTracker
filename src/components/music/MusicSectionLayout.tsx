import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { TrackInsightsPanel } from './TrackInsightsPanel.tsx';
import { Sparkles, PanelRightClose, PanelRightOpen, X } from 'lucide-react';

export const MusicSectionLayout: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { currentTrack, isInsightsOpen, toggleInsights, setIsInsightsOpen } = useMusicPlayer();
  const [isMobileInsightsSheet, setIsMobileInsightsSheet] = useState(false);

  // Auto open insights on extra large desktop if a track is playing and insights wasn't closed
  useEffect(() => {
    if (currentTrack && window.innerWidth >= 1280 && !isInsightsOpen) {
      setIsInsightsOpen(true);
    }
  }, [Boolean(currentTrack)]);

  return (
    <div className="relative w-full">
      <div className="flex gap-6 items-start">
        {/* Main Music Content Area */}
        <div
          className={`flex-1 min-w-0 transition-all duration-300 ${
            currentTrack && isInsightsOpen
              ? 'xl:max-w-[calc(100%-350px)] 2xl:max-w-[calc(100%-390px)]'
              : 'w-full'
          }`}
        >
          {children}
        </div>

        {/* Desktop Sticky Contextual Genius Panel (Right Side) */}
        {currentTrack && isInsightsOpen && (
          <aside className="hidden xl:block w-[330px] 2xl:w-[370px] shrink-0 sticky top-24 h-[calc(100vh-140px)] z-20 transition-all duration-300">
            <TrackInsightsPanel onClose={toggleInsights} />
          </aside>
        )}
      </div>

      {/* Mobile / Tablet Bottom Sheet for Track Insights */}
      <AnimatePresence>
        {isMobileInsightsSheet && currentTrack && (
          <div className="xl:hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileInsightsSheet(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative z-10 w-full max-w-lg max-h-[85vh] h-[650px] rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
            >
              <TrackInsightsPanel isFloating onClose={() => setIsMobileInsightsSheet(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
