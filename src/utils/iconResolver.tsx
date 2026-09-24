import React from 'react';
import {
  Trophy,
  Users,
  UserPlus,
  MessageSquare,
  MessageCircle,
  Heart,
  Star,
  Sparkles,
  Film,
  Tv,
  Gamepad2,
  Book,
  BookOpen,
  Bookmark,
  Flame,
  Shield,
  Award,
  Crown,
  Zap,
  Compass,
  CheckCircle2,
  CalendarDays,
  Medal,
  Clock,
  ListOrdered,
  ListPlus,
  Layers,
  Lock,
  Check,
  Eye,
  ThumbsUp,
  Share2,
  Radio,
  Quote,
  Smile,
  Target,
  Rocket,
  Gift,
  Activity,
  Bell,
  Play,
  HelpCircle,
  LucideIcon,
} from 'lucide-react';

/**
 * Standard registry mapping icon names (case-insensitive, normalized)
 * to Lucide React components.
 */
const ICON_REGISTRY: Record<string, LucideIcon> = {
  trophy: Trophy,
  users: Users,
  userplus: UserPlus,
  user_plus: UserPlus,
  user: Users,
  messagesquare: MessageSquare,
  message_square: MessageSquare,
  messagecircle: MessageCircle,
  message_circle: MessageCircle,
  comment: MessageSquare,
  review: MessageSquare,
  heart: Heart,
  like: Heart,
  star: Star,
  rating: Star,
  sparkles: Sparkles,
  sparkle: Sparkles,
  film: Film,
  movie: Film,
  tv: Tv,
  series: Tv,
  anime: Tv,
  gamepad: Gamepad2,
  gamepad2: Gamepad2,
  game: Gamepad2,
  book: Book,
  bookopen: BookOpen,
  book_open: BookOpen,
  manga: BookOpen,
  comic: BookOpen,
  bookmark: Bookmark,
  flame: Flame,
  fire: Flame,
  streak: Flame,
  shield: Shield,
  award: Award,
  crown: Crown,
  vip: Crown,
  zap: Zap,
  energy: Zap,
  compass: Compass,
  explore: Compass,
  checkcircle: CheckCircle2,
  checkcircle2: CheckCircle2,
  check_circle: CheckCircle2,
  completed: CheckCircle2,
  check: Check,
  calendardays: CalendarDays,
  calendar_days: CalendarDays,
  calendar: CalendarDays,
  medal: Medal,
  clock: Clock,
  time: Clock,
  listordered: ListOrdered,
  list_ordered: ListOrdered,
  listplus: ListPlus,
  list_plus: ListPlus,
  list: ListPlus,
  layers: Layers,
  collection: Layers,
  lock: Lock,
  eye: Eye,
  thumbsup: ThumbsUp,
  thumbs_up: ThumbsUp,
  share: Share2,
  share2: Share2,
  radio: Radio,
  quote: Quote,
  smile: Smile,
  target: Target,
  rocket: Rocket,
  gift: Gift,
  activity: Activity,
  bell: Bell,
  play: Play,
  help: HelpCircle,
  helpcircle: HelpCircle,
};

/**
 * Safely resolves an achievement icon identifier into a valid React component.
 *
 * Rules:
 * 1. Never throws on invalid input.
 * 2. Never outputs raw SVG or JSON or object representations as text.
 * 3. Strips technical prefixes (e.g. 'svg{', '<svg', 'icon:').
 * 4. Fallback is always a clean Trophy icon component.
 */
export function resolveAchievementIcon(iconName?: string | null): LucideIcon {
  if (!iconName || typeof iconName !== 'string') {
    return Trophy;
  }

  const trimmed = iconName.trim();

  // If technical payload was mistakenly passed, reject and fallback immediately
  if (
    trimmed.startsWith('<') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('svg') ||
    trimmed.includes('{') ||
    trimmed.includes('}')
  ) {
    return Trophy;
  }

  // Normalize: lower case and remove spaces, dashes, underscores
  const key = trimmed.toLowerCase().replace(/[\s\-_]/g, '');

  if (ICON_REGISTRY[key]) {
    return ICON_REGISTRY[key];
  }

  // Check exact key in registry
  if (ICON_REGISTRY[trimmed.toLowerCase()]) {
    return ICON_REGISTRY[trimmed.toLowerCase()];
  }

  // Default fallback
  return Trophy;
}

export interface AchievementIconProps {
  iconName?: string | null;
  className?: string;
  fallback?: LucideIcon;
}

/**
 * Safe component wrapper to render resolved achievement icon.
 */
export const AchievementIcon: React.FC<AchievementIconProps> = ({
  iconName,
  className = 'w-5 h-5',
  fallback = Trophy,
}) => {
  const IconComponent = resolveAchievementIcon(iconName) || fallback;
  return <IconComponent className={className} />;
};
