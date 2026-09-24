import React, { useState } from 'react';
import { Film, Tv, Sparkles, BookOpen, Book, Flame, Music, ChevronDown, ChevronUp, AlignLeft } from 'lucide-react';
import { UnifiedContentItem, ContentType } from '../../types/content.ts';

interface ContentOverviewProps {
  item: UnifiedContentItem;
}

const getOverviewHeading = (type: ContentType) => {
  switch (type) {
    case 'MOVIE':
      return { title: 'О фильме', icon: Film };
    case 'TV':
      return { title: 'О сериале', icon: Tv };
    case 'ANIME':
      return { title: 'Об аниме', icon: Sparkles };
    case 'MANGA':
      return { title: 'О манге', icon: BookOpen };
    case 'BOOK':
      return { title: 'О книге', icon: Book };
    case 'COMIC':
      return { title: 'О комиксе', icon: Flame };
    case 'MUSIC':
      return { title: 'О релизе', icon: Music };
    case 'GAME':
    default:
      return { title: 'Об игре', icon: AlignLeft };
  }
};

export const ContentOverview: React.FC<ContentOverviewProps> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const heading = getOverviewHeading(item.type);
  const Icon = heading.icon;

  if (!item.description && !item.tagline) return null;

  const description = item.description || '';
  const isLong = description.length > 450;
  const displayText = expanded || !isLong ? description : description.slice(0, 450) + '...';

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-[#11152A] border border-[#1E2442] space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-[#1E2442] pb-4">
        <div className="p-2 rounded-xl bg-[#151932] border border-[#8B5CF6]/30 text-[#A78BFA]">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-[#F8FAFC]">{heading.title}</h2>
          <p className="text-xs text-[#94A3B8]">Сюжет, синопсис и основная идея</p>
        </div>
      </div>

      {/* Tagline if available */}
      {item.tagline && (
        <blockquote className="text-sm font-medium text-[#A78BFA] italic border-l-2 border-[#8B5CF6] pl-3 py-0.5">
          «{item.tagline}»
        </blockquote>
      )}

      {/* Body text */}
      {description && (
        <div className="space-y-3">
          <p className="text-xs sm:text-sm text-[#CBD5E1] leading-relaxed whitespace-pre-line font-sans">
            {displayText}
          </p>

          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A78BFA] hover:text-white transition-colors pt-1 cursor-pointer"
            >
              <span>{expanded ? 'Свернуть' : 'Читать полностью'}</span>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
