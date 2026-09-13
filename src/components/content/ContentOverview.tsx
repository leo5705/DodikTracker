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
    <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-4">
        <div className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-400">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">{heading.title}</h2>
          <p className="text-xs text-zinc-400">Сюжет, синопсис и основная идея</p>
        </div>
      </div>

      {/* Tagline if available */}
      {item.tagline && (
        <blockquote className="text-sm font-medium text-purple-300 italic border-l-2 border-purple-500/60 pl-3 py-0.5">
          «{item.tagline}»
        </blockquote>
      )}

      {/* Body text */}
      {description && (
        <div className="space-y-3">
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-line font-sans">
            {displayText}
          </p>

          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors pt-1"
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
