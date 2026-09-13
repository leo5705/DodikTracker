export type AchievementRarity =
  | 'COMMON'
  | 'UNCOMMON'
  | 'RARE'
  | 'EPIC'
  | 'LEGENDARY'
  | 'SECRET';

export type AchievementStatus = 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';

export type AchievementGrantType = 'AUTOMATIC' | 'ADMIN';

export type AchievementHistoryAction = 'GRANTED' | 'REVOKED' | 'RE_GRANTED';

export type AchievementTriggerType =
  | 'USER_REGISTERED'
  | 'USER_VERIFIED'
  | 'MEDIA_ADDED'
  | 'MEDIA_COMPLETED'
  | 'REVIEW_WRITTEN'
  | 'LIKE_RECEIVED'
  | 'FRIEND_ADDED'
  | 'MESSAGE_SENT'
  | 'MESSAGE_RECEIVED'
  | 'LIST_CREATED'
  | 'LIST_ITEM_ADDED'
  | 'TIER_LIST_CREATED'
  | 'TIER_LIST_COMPLETED'
  | 'DAYS_STREAK'
  | 'TOTAL_CONTENT_COUNT'
  | 'CUSTOM';

export interface AchievementConditionConfig {
  count?: number;
  mediaType?: string; // 'MOVIE' | 'TV' | 'ANIME' | 'GAME' | 'BOOK' | 'MANGA' | 'MUSIC' | 'ALL'
  status?: string; // 'COMPLETED' | 'ALL'
  days?: number;
  minItems?: number;
  reviewCount?: number;
  likeCount?: number;
  friendCount?: number;
  operator?: '>=' | '>' | '==' | '<=' | '<';
  targetValue?: number;
  metadataMatch?: Record<string, any>;
  [key: string]: any;
}

export interface AchievementItem {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  status: AchievementStatus;
  badgeStyle: string;
  isActive: boolean;
  conditionType: AchievementTriggerType | string;
  conditionConfig: AchievementConditionConfig;
  isSecret: boolean;
  points: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  // Computed fields when fetched for user
  isUnlocked?: boolean;
  unlockedAt?: Date | null;
  grantType?: AchievementGrantType;
  grantedByAdminId?: number | null;
  grantReason?: string | null;
  progress?: {
    current: number;
    target: number;
    percentage: number;
  };
}

export interface AchievementContext {
  userId: number;
  trigger: AchievementTriggerType;
  metadata?: Record<string, any>;
}

export interface ConditionEvaluationResult {
  eligible: boolean;
  currentValue?: number;
  targetValue?: number;
}
