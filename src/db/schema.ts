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
  showAdultContent: boolean('show_adult_content').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  telegramIdIdx: uniqueIndex('users_telegram_id_unique').on(table.telegramId),
}));

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
  dodikRating: doublePrecision('dodik_rating'), // Dodik Tracker average community rating (0-100 scale)
  dodikRatingCount: integer('dodik_rating_count').notNull().default(0), // Dodik Tracker rating count
  totalSeasons: integer('total_seasons').default(0),
  totalEpisodes: integer('total_episodes').default(0),
  totalDurationMinutes: integer('total_duration_minutes'),
  isHidden: boolean('is_hidden').notNull().default(false),
  isAdult: boolean('is_adult').notNull().default(false),
  ageRating: text('age_rating'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  dodikRatingIdx: index('media_dodik_rating_idx').on(table.dodikRating),
  dodikRatingCountIdx: index('media_dodik_rating_count_idx').on(table.dodikRatingCount),
}));

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
}, (t) => ({
  unqUserMedia: uniqueIndex('user_media_user_media_unq').on(t.userId, t.mediaId),
}));

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
}, (t) => ({
  unqRequest: uniqueIndex('friend_requests_sender_receiver_unq').on(t.senderId, t.receiverId),
}));

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
}, (t) => ({
  unqLike: uniqueIndex('likes_user_target_unq').on(t.userId, t.targetType, t.targetId),
}));

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
  recipientUserId: integer('recipient_user_id').references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // FRIEND_REQUEST, FRIEND_ACCEPTED, REVIEW_LIKED, REVIEW_COMMENTED, FEEDBACK_REPLIED, CONTENT_COMPLETED, CONTENT_SHARED, TIER_LIST_INVITE, SYSTEM, ACHIEVEMENT, ADMIN_ANNOUNCEMENT, etc.
  title: text('title').notNull(),
  body: text('body').notNull(),
  message: text('message'),
  content: text('content'),
  link: text('link'),
  relatedEntity: text('related_entity'),
  entityType: text('entity_type'),
  relatedEntityId: text('related_entity_id'),
  entityId: text('entity_id'),
  senderId: integer('sender_id').references(() => users.id, { onDelete: 'set null' }),
  actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  senderAvatar: text('sender_avatar'),
  senderUsername: text('sender_username'),
  metadataJson: text('metadata_json'),
  metadata: text('metadata'),
  dedupKey: text('dedup_key'),
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('notifications_user_id_idx').on(table.userId),
    recipientUserIdIdx: index('notifications_recipient_user_id_idx').on(table.recipientUserId),
    actorUserIdIdx: index('notifications_actor_user_id_idx').on(table.actorUserId),
    dedupKeyIdx: index('notifications_dedup_key_idx').on(table.dedupKey),
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

// 23b. Review Reactions Table
export const reviewReactions = pgTable('review_reactions', {
  id: serial('id').primaryKey(),
  reviewId: integer('review_id').references(() => reviews.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: text('type').notNull().default('LIKE'), // 'LIKE', 'HEART', 'CLAP', etc.
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
  unqReaction: uniqueIndex('review_reactions_review_user_type_unq').on(t.reviewId, t.userId, t.type),
  reviewIdIdx: index('review_reactions_review_id_idx').on(t.reviewId),
  userIdIdx: index('review_reactions_user_id_idx').on(t.userId),
}));

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

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
  media: one(media, { fields: [reviews.mediaId], references: [media.id] }),
  reactions: many(reviewReactions),
}));

export const reviewReactionsRelations = relations(reviewReactions, ({ one }) => ({
  review: one(reviews, { fields: [reviewReactions.reviewId], references: [reviews.id] }),
  user: one(users, { fields: [reviewReactions.userId], references: [users.id] }),
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

export const reportsRelations = relations(reports, ({ one, many }) => ({
  reporter: one(users, { fields: [reports.reporterId], references: [users.id], relationName: 'reportedReports' }),
  targetUser: one(users, { fields: [reports.targetUserId], references: [users.id], relationName: 'targetedReports' }),
  moderator: one(users, { fields: [reports.moderatorId], references: [users.id], relationName: 'moderatedReports' }),
  replies: many(reportReplies),
}));

// 33.1 Feedback / Report Replies Table
export const reportReplies = pgTable('report_replies', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id').notNull().references(() => reports.id, { onDelete: 'cascade' }),
  authorUserId: integer('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  message: text('message').notNull(),
  isAdminResponse: boolean('is_admin_response').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  reportIdIdx: index('report_replies_report_id_idx').on(table.reportId),
  authorIdx: index('report_replies_author_idx').on(table.authorUserId),
  createdAtIdx: index('report_replies_created_at_idx').on(table.createdAt),
}));

export const reportRepliesRelations = relations(reportReplies, ({ one }) => ({
  report: one(reports, { fields: [reportReplies.reportId], references: [reports.id] }),
  author: one(users, { fields: [reportReplies.authorUserId], references: [users.id] }),
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

// 36. Media Dodik Ratings Table
export const mediaRatings = pgTable('media_ratings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  mediaId: integer('media_id').references(() => media.id, { onDelete: 'cascade' }).notNull(),
  rating: doublePrecision('rating').notNull(), // 0.5 to 10.0
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  unqUserMediaRating: uniqueIndex('media_ratings_user_media_unq').on(table.userId, table.mediaId),
  mediaIdIdx: index('media_ratings_media_id_idx').on(table.mediaId),
  userIdx: index('media_ratings_user_id_idx').on(table.userId),
}));

export const mediaRatingsRelations = relations(mediaRatings, ({ one }) => ({
  user: one(users, { fields: [mediaRatings.userId], references: [users.id] }),
  media: one(media, { fields: [mediaRatings.mediaId], references: [media.id] }),
}));

// 37. News Comments Table
export const newsComments = pgTable('news_comments', {
  id: serial('id').primaryKey(),
  newsId: integer('news_id').references(() => news.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  parentId: integer('parent_id'),
  content: text('content').notNull(),
  isHidden: boolean('is_hidden').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  newsIdIdx: index('news_comments_news_id_idx').on(table.newsId),
  userIdx: index('news_comments_user_id_idx').on(table.userId),
}));

export const newsCommentsRelations = relations(newsComments, ({ one }) => ({
  news: one(news, { fields: [newsComments.newsId], references: [news.id] }),
  user: one(users, { fields: [newsComments.userId], references: [users.id] }),
}));

// 38. News Emoji Reactions Table
export const newsReactions = pgTable('news_reactions', {
  id: serial('id').primaryKey(),
  newsId: integer('news_id').references(() => news.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  emoji: text('emoji').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  unqNewsUserEmoji: uniqueIndex('news_reactions_news_user_emoji_unq').on(table.newsId, table.userId, table.emoji),
  newsIdIdx: index('news_reactions_news_id_idx').on(table.newsId),
  userIdIdx: index('news_reactions_user_id_idx').on(table.userId),
}));

export const newsReactionsRelations = relations(newsReactions, ({ one }) => ({
  news: one(news, { fields: [newsReactions.newsId], references: [news.id] }),
  user: one(users, { fields: [newsReactions.userId], references: [users.id] }),
}));

// ==========================================
// MUSIC MODULE TABLES
// ==========================================

// 39. Artist / Musician Profiles
export const artistProfiles = pgTable('artist_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  stageName: text('stage_name').notNull(),
  slug: text('slug').notNull().unique(),
  avatar: text('avatar'),
  description: text('description'),
  status: text('status').notNull().default('ACTIVE'), // 'ACTIVE' | 'PENDING' | 'SUSPENDED'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userIdIdx: uniqueIndex('artist_profiles_user_id_idx').on(table.userId),
  slugIdx: uniqueIndex('artist_profiles_slug_idx').on(table.slug),
}));

// 40. Music Genres
export const musicGenres = pgTable('music_genres', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex('music_genres_slug_idx').on(table.slug),
}));

// 41. Music Releases
export const musicReleases = pgTable('music_releases', {
  id: serial('id').primaryKey(),
  artistId: integer('artist_id').references(() => artistProfiles.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  type: text('type').notNull(), // 'SINGLE' | 'EP' | 'ALBUM'
  description: text('description'),
  cover: text('cover'),
  releaseDate: text('release_date'),
  status: text('status').notNull().default('DRAFT'), // 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED'
  rejectionReason: text('rejection_reason'),
  reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  artistIdIdx: index('music_releases_artist_id_idx').on(table.artistId),
  slugIdx: uniqueIndex('music_releases_slug_idx').on(table.slug),
  statusIdx: index('music_releases_status_idx').on(table.status),
  typeIdx: index('music_releases_type_idx').on(table.type),
}));

// 42. Music Release Genres (Junction)
export const musicReleaseGenres = pgTable('music_release_genres', {
  id: serial('id').primaryKey(),
  releaseId: integer('release_id').references(() => musicReleases.id, { onDelete: 'cascade' }).notNull(),
  genreId: integer('genre_id').references(() => musicGenres.id, { onDelete: 'cascade' }).notNull(),
}, (table) => ({
  unqReleaseGenre: uniqueIndex('music_release_genres_unq').on(table.releaseId, table.genreId),
  releaseIdIdx: index('music_release_genres_release_id_idx').on(table.releaseId),
  genreIdIdx: index('music_release_genres_genre_id_idx').on(table.genreId),
}));

// 43. Music Tracks
export const musicTracks = pgTable('music_tracks', {
  id: serial('id').primaryKey(),
  releaseId: integer('release_id').references(() => musicReleases.id, { onDelete: 'cascade' }).notNull(),
  artistId: integer('artist_id').references(() => artistProfiles.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  slug: text('slug'),
  trackNumber: integer('track_number').notNull().default(1),
  audioFile: text('audio_file').notNull(),
  duration: integer('duration'),
  lyrics: text('lyrics'),
  authorNote: text('author_note'),
  explicit: boolean('explicit').notNull().default(false),
  status: text('status').notNull().default('PUBLISHED'), // 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  releaseIdIdx: index('music_tracks_release_id_idx').on(table.releaseId),
  artistIdIdx: index('music_tracks_artist_id_idx').on(table.artistId),
  trackNumberIdx: index('music_tracks_release_track_no_idx').on(table.releaseId, table.trackNumber),
}));

// 44. Music Reviews (100-Point Scoring System)
export const musicReviews = pgTable('music_reviews', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  releaseId: integer('release_id').references(() => musicReleases.id, { onDelete: 'cascade' }).notNull(),
  musicScore: integer('music_score').notNull(),
  performanceScore: integer('performance_score').notNull(),
  productionScore: integer('production_score').notNull(),
  lyricsScore: integer('lyrics_score').notNull(),
  atmosphereScore: integer('atmosphere_score').notNull(),
  cohesionScore: integer('cohesion_score').notNull(),
  overallScore: doublePrecision('overall_score').notNull(),
  text: text('text'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  unqUserReleaseReview: uniqueIndex('music_reviews_user_release_unq').on(table.userId, table.releaseId),
  releaseIdIdx: index('music_reviews_release_id_idx').on(table.releaseId),
  userIdIdx: index('music_reviews_user_id_idx').on(table.userId),
}));

// Music Relations
export const artistProfilesRelations = relations(artistProfiles, ({ one, many }) => ({
  user: one(users, { fields: [artistProfiles.userId], references: [users.id] }),
  releases: many(musicReleases),
  tracks: many(musicTracks),
}));

export const musicReleasesRelations = relations(musicReleases, ({ one, many }) => ({
  artist: one(artistProfiles, { fields: [musicReleases.artistId], references: [artistProfiles.id] }),
  tracks: many(musicTracks),
  genres: many(musicReleaseGenres),
  reviews: many(musicReviews),
}));

export const musicGenresRelations = relations(musicGenres, ({ many }) => ({
  releases: many(musicReleaseGenres),
}));

export const musicReleaseGenresRelations = relations(musicReleaseGenres, ({ one }) => ({
  release: one(musicReleases, { fields: [musicReleaseGenres.releaseId], references: [musicReleases.id] }),
  genre: one(musicGenres, { fields: [musicReleaseGenres.genreId], references: [musicGenres.id] }),
}));

export const musicTracksRelations = relations(musicTracks, ({ one }) => ({
  release: one(musicReleases, { fields: [musicTracks.releaseId], references: [musicReleases.id] }),
  artist: one(artistProfiles, { fields: [musicTracks.artistId], references: [artistProfiles.id] }),
}));

export const musicReviewsRelations = relations(musicReviews, ({ one }) => ({
  user: one(users, { fields: [musicReviews.userId], references: [users.id] }),
  release: one(musicReleases, { fields: [musicReviews.releaseId], references: [musicReleases.id] }),
}));

// 45. Musician Status Applications
export const musicianApplications = pgTable('musician_applications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'APPROVED' | 'REJECTED'
  message: text('message'),
  reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userIdIdx: index('musician_applications_user_id_idx').on(table.userId),
  statusIdx: index('musician_applications_status_idx').on(table.status),
}));

export const musicianApplicationsRelations = relations(musicianApplications, ({ one }) => ({
  user: one(users, { fields: [musicianApplications.userId], references: [users.id] }),
  reviewer: one(users, { fields: [musicianApplications.reviewedBy], references: [users.id] }),
}));



