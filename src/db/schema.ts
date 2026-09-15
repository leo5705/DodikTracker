import { relations } from 'drizzle-orm';
import { index, boolean, doublePrecision, integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// 1. Users Table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID or internal auth UID
  email: text('email'), // Nullable - registration only requires username and password
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash'),
  avatar: text('avatar'),
  bio: text('bio'),
  role: text('role').notNull().default('USER'), // 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'
  isBlocked: boolean('is_blocked').notNull().default(false),
  bannedUntil: timestamp('banned_until'),
  banReason: text('ban_reason'),
  warningCount: integer('warning_count').notNull().default(0),
  lastWarningReason: text('last_warning_reason'),
  invitesLeft: integer('invites_left').notNull().default(3),
  profileVisibility: text('profile_visibility').notNull().default('PUBLIC'), // 'PUBLIC' | 'FRIENDS' | 'PRIVATE'
  libraryVisibility: text('library_visibility').notNull().default('PUBLIC'),
  activityVisibility: text('activity_visibility').notNull().default('PUBLIC'),
  ratingVisibility: text('rating_visibility').notNull().default('PUBLIC'),
  listVisibility: text('list_visibility').notNull().default('PUBLIC'),
  statisticsVisibility: text('statistics_visibility').notNull().default('PUBLIC'),
  telegramChatId: text('telegram_chat_id'),
  telegramId: text('telegram_id'),
  telegramUsername: text('telegram_username'),
  telegramAuthCode: text('telegram_auth_code'),
  telegramAuthExpires: timestamp('telegram_auth_expires'),
  notificationSettings: text('notification_settings').notNull().default('{"friendRequests":true,"friendReviews":true,"likes":true,"comments":true,"newReleases":true,"lists":true}'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 2. Media Table
export const media = pgTable('media', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(), // 'MOVIE' | 'TV' | 'ANIME' | 'MANGA' | 'GAME' | 'BOOK' | 'COMIC'
  title: text('title').notNull(),
  originalTitle: text('original_title'),
  description: text('description'),
  posterUrl: text('poster_url'),
  backdropUrl: text('backdrop_url'),
  releaseDate: text('release_date'),
  year: integer('year'),
  genres: text('genres'), // JSON array string or comma separated
  rating: doublePrecision('rating').default(0), // average public/external rating
  totalSeasons: integer('total_seasons').default(0),
  totalEpisodes: integer('total_episodes').default(0),
  totalDurationMinutes: integer('total_duration_minutes'),
  isHidden: boolean('is_hidden').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 3. Media External IDs Table
export const mediaExternalIds = pgTable('media_external_ids', {
  id: serial('id').primaryKey(),
  mediaId: integer('media_id').references(() => media.id, { onDelete: 'cascade' }).notNull(),
  provider: text('provider').notNull(), // TMDB, Kinopoisk, RAWG, AniList, OpenLibrary
  externalId: text('external_id').notNull(),
});

// 4. Seasons Table
export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  mediaId: integer('media_id').references(() => media.id, { onDelete: 'cascade' }).notNull(),
  seasonNumber: integer('season_number').notNull(),
  title: text('title'),
  episodeCount: integer('episode_count').default(0),
});

// 5. Episodes Table
export const episodes = pgTable('episodes', {
  id: serial('id').primaryKey(),
  seasonId: integer('season_id').references(() => seasons.id, { onDelete: 'cascade' }).notNull(),
  episodeNumber: integer('episode_number').notNull(),
  title: text('title'),
  airDate: text('air_date'),
});

// 6. User Episodes (Watched Progress) Table
export const userEpisodes = pgTable('user_episodes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  episodeId: integer('episode_id').references(() => episodes.id, { onDelete: 'cascade' }).notNull(),
  watched: boolean('watched').default(true),
  watchedAt: timestamp('watched_at').defaultNow(),
});

// 7. User Media (Personal Library) Table
export const userMedia = pgTable('user_media', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  mediaId: integer('media_id').references(() => media.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').notNull(), // PLAN_TO_WATCH, WATCHING, COMPLETED, DROPPED, PLAN_TO_PLAY, PLAYING, PLAN_TO_READ, READING
  progress: integer('progress').default(0),
  progressTotal: integer('progress_total').default(0),
  rating: integer('rating'), // 1 to 10
  isFavorite: boolean('is_favorite').default(false),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  rewatchCount: integer('rewatch_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 8. Media History Table
export const mediaHistory = pgTable('media_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  mediaId: integer('media_id').references(() => media.id, { onDelete: 'cascade' }).notNull(),
  action: text('action').notNull(), // ADDED, STATUS_CHANGED, PROGRESS_CHANGED, RATED, COMPLETED, DROPPED, REWATCHED, NOTE_ADDED
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 9. Friend Requests Table
export const friendRequests = pgTable('friend_requests', {
  id: serial('id').primaryKey(),
  senderId: integer('sender_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  receiverId: integer('receiver_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').notNull().default('PENDING'), // PENDING, ACCEPTED, DECLINED, BLOCKED
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 10. Social Activities Table
export const activities = pgTable('activities', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: text('type').notNull(), // MEDIA_ADDED, MEDIA_COMPLETED, MEDIA_RATED, MEDIA_DROPPED, LIST_CREATED, LIST_UPDATED, TIERLIST_CREATED, TIERLIST_UPDATED
  mediaId: integer('media_id').references(() => media.id, { onDelete: 'set null' }),
  listId: integer('list_id'),
  tierListId: integer('tier_list_id'),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 11. Likes Table
export const likes = pgTable('likes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  targetType: text('target_type').notNull(), // ACTIVITY, LIST, TIERLIST, COMMENT
  targetId: integer('target_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 12. Comments Table
export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  targetType: text('target_type').notNull(), // MEDIA, LIST, TIERLIST, ACTIVITY
  targetId: integer('target_id').notNull(),
  parentId: integer('parent_id'),
  content: text('content').notNull(),
  isHidden: boolean('is_hidden').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 13. Lists Table
export const lists = pgTable('lists', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull().default('MOVIES_TV'), // 'MOVIE' | 'TV' | 'ANIME' | 'MANGA' | 'GAME' | 'BOOK' | 'COMIC'
  cover: text('cover'),
  visibility: text('visibility').notNull().default('PUBLIC'), // PUBLIC, FRIENDS, PRIVATE
  isHidden: boolean('is_hidden').notNull().default(false),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 14. List Items Table
export const listItems = pgTable('list_items', {
  id: serial('id').primaryKey(),
  listId: integer('list_id').references(() => lists.id, { onDelete: 'cascade' }).notNull(),
  mediaId: integer('media_id').references(() => media.id, { onDelete: 'cascade' }).notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  notes: text('notes'),
  addedById: integer('added_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
  unqListMedia: uniqueIndex('list_items_list_id_media_id_unq').on(t.listId, t.mediaId),
}));

// 15. List Members (Collaborative Lists) Table
export const listMembers = pgTable('list_members', {
  id: serial('id').primaryKey(),
  listId: integer('list_id').references(() => lists.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull().default('EDITOR'), // OWNER, EDITOR, VIEWER
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
  unqListUser: uniqueIndex('list_members_list_id_user_id_unq').on(t.listId, t.userId),
}));

// 16. List Followers Table
export const listFollowers = pgTable('list_followers', {
  id: serial('id').primaryKey(),
  listId: integer('list_id').references(() => lists.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 16b. List Invitations Table
export const listInvitations = pgTable('list_invitations', {
  id: serial('id').primaryKey(),
  listId: integer('list_id').references(() => lists.id, { onDelete: 'cascade' }).notNull(),
  inviterId: integer('inviter_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  inviteeId: integer('invitee_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  permission: text('permission').notNull().default('EDITOR'), // 'EDITOR' | 'VIEWER'
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED'
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at'),
  respondedAt: timestamp('responded_at'),
}, (table) => {
  return {
    listIdIdx: index('list_invitations_list_id_idx').on(table.listId),
    inviteeIdIdx: index('list_invitations_invitee_id_idx').on(table.inviteeId),
    statusIdx: index('list_invitations_status_idx').on(table.status),
  };
});

// 17. Tier Lists Table
export const tierLists = pgTable('tier_lists', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').default('ALL'), // MOVIE, GAME, ANIME, etc.
  visibility: text('visibility').notNull().default('PUBLIC'), // PUBLIC, FRIENDS, PRIVATE
  isHidden: boolean('is_hidden').notNull().default(false),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tiersJson: text('tiers_json').notNull(), // JSON of tiers [{id: 's', name: 'S', color: '#ef4444'}]
  itemsJson: text('items_json').notNull().default('[]'), // JSON of [{mediaId: 1, tierId: 's', order: 0}]
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 18. Notifications Table
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: text('type').notNull(), // ACHIEVEMENT_UNLOCKED, FRIEND_REQUEST, FRIEND_ACCEPTED, NEW_MESSAGE, FRIEND_REVIEW, FRIEND_ACTIVITY, NEW_RELEASE, MENTION, SYSTEM, ADMIN_ALERT, LIKE, LIST_INVITE, LIST_FOLLOW
  title: text('title').notNull(),
  body: text('body').notNull(),
  content: text('content'),
  link: text('link'),
  relatedEntity: text('related_entity'),
  relatedEntityId: text('related_entity_id'),
  senderId: integer('sender_id').references(() => users.id, { onDelete: 'set null' }),
  senderAvatar: text('sender_avatar'),
  senderUsername: text('sender_username'),
  metadataJson: text('metadata_json'),
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('notifications_user_id_idx').on(table.userId),
    isReadIdx: index('notifications_is_read_idx').on(table.isRead),
    typeIdx: index('notifications_type_idx').on(table.type)
  };
});

// Direct Messages Table
export const directMessages = pgTable('direct_messages', {
  id: serial('id').primaryKey(),
  senderId: integer('sender_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  receiverId: integer('receiver_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    senderIdIdx: index('direct_messages_sender_id_idx').on(table.senderId),
    receiverIdIdx: index('direct_messages_receiver_id_idx').on(table.receiverId),
    createdAtIdx: index('direct_messages_created_at_idx').on(table.createdAt),
  };
});

// 19. System Integrations Table
export const systemIntegrations = pgTable('system_integrations', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull().unique(), // TMDB, KINOPOISK, RAWG, IGDB, ANILIST, MAL, GOOGLE_BOOKS, OPEN_LIBRARY
  enabled: boolean('enabled').notNull().default(false),
  encryptedCredentials: text('encrypted_credentials').notNull(), // AES-256-GCM ciphertext
  priority: integer('priority').notNull().default(1),
  settings: text('settings'), // JSON string
  lastCheckedAt: timestamp('last_checked_at'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 20. System Settings Table
export const systemSettings = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 21. Admin Audit Logs Table
export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  details: text('details'),
  ip: text('ip'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 22. API Logs Table
export const apiLogs = pgTable('api_logs', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull(),
  endpoint: text('endpoint').notNull(),
  status: integer('status').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 23. Reviews Table
export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  mediaId: integer('media_id').references(() => media.id, { onDelete: 'cascade' }).notNull(),
  rating: integer('rating'), // 1 to 10
  title: text('title'),
  content: text('content').notNull(),
  containsSpoilers: boolean('contains_spoilers').default(false),
  likesCount: integer('likes_count').default(0),
  isHidden: boolean('is_hidden').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 24. Invite Codes Table
export const inviteCodes = pgTable('invite_codes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  creatorId: integer('creator_id').references(() => users.id, { onDelete: 'set null' }),
  usedById: integer('used_by_id').references(() => users.id, { onDelete: 'set null' }),
  isUsed: boolean('is_used').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  usedAt: timestamp('used_at'),
});

// 25. Password Reset Tokens Table
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 26. Game Translations Cache Table (Server-side translation persistence)
export const gameTranslations = pgTable('game_translations', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull(), // 'RAWG' | 'THEGAMESDB' | 'IGDB' | 'ALL'
  externalId: text('external_id').notNull(),
  titleOriginal: text('title_original').notNull(),
  titleRu: text('title_ru'),
  descriptionRu: text('description_ru'),
  genresRu: text('genres_ru'), // JSON string array
  tagsRu: text('tags_ru'), // JSON string array
  source: text('source').default('OFFICIAL'), // 'OFFICIAL' | 'GEMINI' | 'DICTIONARY'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 27. Unified Game Entity Mappings Table (Mapping external entities across RAWG, GMDB, etc.)
export const gameEntityMappings = pgTable('game_entity_mappings', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(), // 'GAME' | 'DEVELOPER' | 'PUBLISHER' | 'SERIES' | 'DLC'
  internalId: text('internal_id').notNull(),
  provider: text('provider').notNull(), // 'RAWG' | 'THEGAMESDB' | 'GMDB'
  externalId: text('external_id').notNull(),
  confidence: text('confidence').default('HIGH'), // 'HIGH' | 'MEDIUM' | 'LOW'
  metadata: text('metadata'), // JSON string with matching criteria
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  typeInternalIdx: index('game_mappings_type_internal_idx').on(table.entityType, table.internalId),
  typeExtIdx: index('game_mappings_type_ext_idx').on(table.entityType, table.provider, table.externalId),
}));

// 28. Unified Game Data Cache Table
export const gameEntityCache = pgTable('game_entity_cache', {
  id: serial('id').primaryKey(),
  cacheKey: text('cache_key').notNull().unique(),
  entityType: text('entity_type').notNull(), // 'GAME' | 'DEVELOPER' | 'PUBLISHER' | 'SERIES' | 'DLC' | 'CATALOG'
  data: text('data').notNull(), // JSON string of UnifiedGame / UnifiedDeveloper etc.
  providerSources: text('provider_sources'), // JSON string of provenance and fallback diagnostics
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  cacheKeyIdx: uniqueIndex('game_cache_key_idx').on(table.cacheKey),
  expiresAtIdx: index('game_cache_expires_at_idx').on(table.expiresAt),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  userMedia: many(userMedia),
  activities: many(activities),
  lists: many(lists),
  tierLists: many(tierLists),
  notifications: many(notifications),
  reviews: many(reviews),
  createdInvites: many(inviteCodes, { relationName: 'creator' }),
  usedInvites: many(inviteCodes, { relationName: 'usedBy' }),
}));

export const inviteCodesRelations = relations(inviteCodes, ({ one }) => ({
  creator: one(users, { fields: [inviteCodes.creatorId], references: [users.id], relationName: 'creator' }),
  usedBy: one(users, { fields: [inviteCodes.usedById], references: [users.id], relationName: 'usedBy' }),
}));

export const mediaRelations = relations(media, ({ many }) => ({
  externalIds: many(mediaExternalIds),
  seasons: many(seasons),
  userMedia: many(userMedia),
  listItems: many(listItems),
  reviews: many(reviews),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
  media: one(media, { fields: [reviews.mediaId], references: [media.id] }),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  media: one(media, { fields: [seasons.mediaId], references: [media.id] }),
  episodes: many(episodes),
}));

export const episodesRelations = relations(episodes, ({ one, many }) => ({
  season: one(seasons, { fields: [episodes.seasonId], references: [seasons.id] }),
  userEpisodes: many(userEpisodes),
}));

export const userMediaRelations = relations(userMedia, ({ one }) => ({
  user: one(users, { fields: [userMedia.userId], references: [users.id] }),
  media: one(media, { fields: [userMedia.mediaId], references: [media.id] }),
}));

export const listsRelations = relations(lists, ({ one, many }) => ({
  owner: one(users, { fields: [lists.ownerId], references: [users.id] }),
  items: many(listItems),
  members: many(listMembers),
  followers: many(listFollowers),
}));

export const listItemsRelations = relations(listItems, ({ one }) => ({
  list: one(lists, { fields: [listItems.listId], references: [lists.id] }),
  media: one(media, { fields: [listItems.mediaId], references: [media.id] }),
}));

export const tierListsRelations = relations(tierLists, ({ one }) => ({
  owner: one(users, { fields: [tierLists.ownerId], references: [users.id] }),
}));

// 27. Achievements Table
export const achievements = pgTable('achievements', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  icon: text('icon').notNull().default('Trophy'),
  rarity: text('rarity').notNull().default('COMMON'), // COMMON | UNCOMMON | RARE | EPIC | LEGENDARY | SECRET
  status: text('status').notNull().default('ACTIVE'), // DRAFT | ACTIVE | HIDDEN | ARCHIVED
  badgeStyle: text('badge_style').notNull().default('purple'),
  isActive: boolean('is_active').notNull().default(true),
  conditionType: text('condition_type').notNull(),
  conditionConfig: text('condition_config').notNull().default('{}'), // JSON config
  isSecret: boolean('is_secret').notNull().default(false),
  points: integer('points').notNull().default(10),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  slugIdx: index('achievements_slug_idx').on(table.slug),
  statusIdx: index('achievements_status_idx').on(table.status),
  conditionTypeIdx: index('achievements_condition_type_idx').on(table.conditionType),
}));

// 28. User Achievements Table
export const userAchievements = pgTable('user_achievements', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  achievementId: integer('achievement_id').references(() => achievements.id, { onDelete: 'cascade' }).notNull(),
  grantType: text('grant_type').notNull().default('AUTOMATIC'), // AUTOMATIC | ADMIN
  adminId: integer('admin_id').references(() => users.id, { onDelete: 'set null' }),
  reason: text('reason'),
  isRevoked: boolean('is_revoked').notNull().default(false),
  revokedAt: timestamp('revoked_at'),
  revokedByAdminId: integer('revoked_by_admin_id').references(() => users.id, { onDelete: 'set null' }),
  revokeReason: text('revoke_reason'),
  grantedAt: timestamp('granted_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userAchievementUnq: uniqueIndex('user_achievements_user_id_achievement_id_unq').on(table.userId, table.achievementId),
  userIdx: index('user_achievements_user_id_idx').on(table.userId),
  achievementIdx: index('user_achievements_achievement_id_idx').on(table.achievementId),
}));

// 29. Achievement History (Audit & Issuance History) Table
export const achievementHistory = pgTable('achievement_history', {
  id: serial('id').primaryKey(),
  achievementId: integer('achievement_id').references(() => achievements.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  action: text('action').notNull(), // GRANTED | REVOKED | RE_GRANTED
  source: text('source').notNull().default('AUTOMATIC'), // AUTOMATIC | ADMIN
  adminId: integer('admin_id').references(() => users.id, { onDelete: 'set null' }),
  reason: text('reason'),
  metadata: text('metadata'), // JSON string
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('achievement_history_user_id_idx').on(table.userId),
  achievementIdx: index('achievement_history_achievement_id_idx').on(table.achievementId),
  actionIdx: index('achievement_history_action_idx').on(table.action),
}));

export const achievementsRelations = relations(achievements, ({ many }) => ({
  userAchievements: many(userAchievements),
  history: many(achievementHistory),
}));

export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
  user: one(users, { fields: [userAchievements.userId], references: [users.id] }),
  achievement: one(achievements, { fields: [userAchievements.achievementId], references: [achievements.id] }),
  admin: one(users, { fields: [userAchievements.adminId], references: [users.id] }),
}));

export const achievementHistoryRelations = relations(achievementHistory, ({ one }) => ({
  user: one(users, { fields: [achievementHistory.userId], references: [users.id] }),
  achievement: one(achievements, { fields: [achievementHistory.achievementId], references: [achievements.id] }),
  admin: one(users, { fields: [achievementHistory.adminId], references: [users.id] }),
}));

// 32. Release Subscriptions Table
export const releaseSubscriptions = pgTable('release_subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  mediaId: integer('media_id').references(() => media.id, { onDelete: 'cascade' }).notNull(),
  notified: boolean('notified').default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('release_sub_user_id_idx').on(table.userId),
  mediaIdx: index('release_sub_media_id_idx').on(table.mediaId),
  userMediaUnq: uniqueIndex('release_sub_user_media_unq').on(table.userId, table.mediaId),
}));

export const releaseSubscriptionsRelations = relations(releaseSubscriptions, ({ one }) => ({
  user: one(users, { fields: [releaseSubscriptions.userId], references: [users.id] }),
  media: one(media, { fields: [releaseSubscriptions.mediaId], references: [media.id] }),
}));

// 33. Reports (Moderation Queue) Table
export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  reporterId: integer('reporter_id').references(() => users.id, { onDelete: 'set null' }),
  targetType: text('target_type').notNull(), // 'REVIEW' | 'COMMENT' | 'MESSAGE' | 'USER' | 'LIST' | 'TIER_LIST' | 'MEDIA'
  targetId: text('target_id').notNull(),
  targetUserId: integer('target_user_id').references(() => users.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(), // 'SPAM' | 'HARASSMENT' | 'FRAUD' | 'NSFW' | 'RULES_VIOLATION' | 'OTHER'
  description: text('description'),
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED' | 'DISMISSED'
  moderatorId: integer('moderator_id').references(() => users.id, { onDelete: 'set null' }),
  moderatorComment: text('moderator_comment'),
  actionTaken: text('action_taken').default('NONE'), // 'NONE' | 'DELETE' | 'HIDE' | 'WARN_USER' | 'TEMP_BAN' | 'BAN' | 'DISMISS'
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  statusIdx: index('reports_status_idx').on(table.status),
  targetTypeIdx: index('reports_target_type_idx').on(table.targetType),
  targetUserIdIdx: index('reports_target_user_id_idx').on(table.targetUserId),
  createdAtIdx: index('reports_created_at_idx').on(table.createdAt),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, { fields: [reports.reporterId], references: [users.id], relationName: 'reportedReports' }),
  targetUser: one(users, { fields: [reports.targetUserId], references: [users.id], relationName: 'targetedReports' }),
  moderator: one(users, { fields: [reports.moderatorId], references: [users.id], relationName: 'moderatedReports' }),
}));

// 34. News (CMS) Table
export const news = pgTable('news', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  excerpt: text('excerpt'),
  content: text('content').notNull(),
  cover: text('cover'),
  authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
  tags: text('tags').notNull().default('[]'), // JSON string array
  status: text('status').notNull().default('DRAFT'), // 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED'
  isPinned: boolean('is_pinned').notNull().default(false),
  isFeatured: boolean('is_featured').notNull().default(false),
  publishedAt: timestamp('published_at'),
  scheduledAt: timestamp('scheduled_at'),
  viewsCount: integer('views_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex('news_slug_idx').on(table.slug),
  statusIdx: index('news_status_idx').on(table.status),
  publishedAtIdx: index('news_published_at_idx').on(table.publishedAt),
}));

export const newsRelations = relations(news, ({ one }) => ({
  author: one(users, { fields: [news.authorId], references: [users.id] }),
}));

// 35. Announcements (System Messages & Broadcasts) Table
export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'), // rich / markdown content
  message: text('message').notNull(), // alias/backward-compat content
  priority: text('priority').notNull().default('NORMAL'), // 'NORMAL' | 'IMPORTANT' | 'CRITICAL'
  severity: text('severity').notNull().default('INFO'), // 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL'
  status: text('status').notNull().default('PUBLISHED'), // 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  targetAudience: text('target_audience').notNull().default('ALL'), // 'ALL' | 'USERS' | 'ADMINS'
  isActive: boolean('is_active').notNull().default(true),
  publishedAt: timestamp('published_at'),
  startAt: timestamp('start_at').defaultNow(),
  endAt: timestamp('end_at'),
  showBanner: boolean('show_banner').notNull().default(true),
  sendTelegram: boolean('send_telegram').notNull().default(false),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  isActiveIdx: index('announcements_is_active_idx').on(table.isActive),
  statusIdx: index('announcements_status_idx').on(table.status),
  priorityIdx: index('announcements_priority_idx').on(table.priority),
  severityIdx: index('announcements_severity_idx').on(table.severity),
  publishedAtIdx: index('announcements_published_at_idx').on(table.publishedAt),
}));

export const announcementsRelations = relations(announcements, ({ one, many }) => ({
  creator: one(users, { fields: [announcements.createdBy], references: [users.id] }),
  reads: many(announcementReads),
}));

// 35b. Announcement Reads (Read & Dismissed Tracking) Table
export const announcementReads = pgTable('announcement_reads', {
  id: serial('id').primaryKey(),
  announcementId: integer('announcement_id').references(() => announcements.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  readAt: timestamp('read_at').defaultNow(),
}, (table) => ({
  announcementUserUnq: uniqueIndex('announcement_reads_ann_user_unq').on(table.announcementId, table.userId),
  userIdx: index('announcement_reads_user_id_idx').on(table.userId),
  announcementIdx: index('announcement_reads_ann_id_idx').on(table.announcementId),
}));

export const announcementReadsRelations = relations(announcementReads, ({ one }) => ({
  announcement: one(announcements, { fields: [announcementReads.announcementId], references: [announcements.id] }),
  user: one(users, { fields: [announcementReads.userId], references: [users.id] }),
}));

