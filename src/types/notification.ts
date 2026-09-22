export type NotificationType =
  // Social
  | 'FRIEND_REQUEST'
  | 'FRIEND_ACCEPTED'
  | 'REVIEW_LIKED'
  | 'REVIEW_COMMENTED'
  | 'CONTENT_SHARED'
  | 'TIER_LIST_INVITE'
  | 'NEW_MESSAGE'
  | 'MENTION'
  | 'FRIEND_REVIEW'
  | 'FRIEND_ACTIVITY'
  | 'LIKE'
  | 'COMMENT'
  | 'LIST_INVITE'
  | 'LIST_FOLLOW'
  // Content & Progress
  | 'CONTENT_COMPLETED'
  | 'NEW_RELEASE'
  // System & Moderation
  | 'FEEDBACK_REPLIED'
  | 'ACHIEVEMENT'
  | 'ACHIEVEMENT_UNLOCKED'
  | 'SYSTEM'
  | 'ADMIN_ANNOUNCEMENT'
  | 'ADMIN_ALERT';

export interface NotificationItem {
  id: number;
  recipientUserId: number;
  userId: number;
  type: NotificationType | string;
  title: string;
  message: string;
  body: string;
  actorUserId?: number | null;
  senderId?: number | null;
  entityType?: string | null;
  relatedEntity?: string | null;
  entityId?: string | null;
  relatedEntityId?: string | null;
  metadata?: Record<string, any> | null;
  metadataJson?: string | null;
  dedupKey?: string | null;
  content?: string | null;
  link?: string | null;
  senderAvatar?: string | null;
  senderUsername?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export type AppNotification = NotificationItem;

export interface NotificationChannelSettings {
  inApp: boolean;
  toast: boolean;
  telegram: boolean;
}

export type NotificationPreferences = Record<string, NotificationChannelSettings>;

export interface NotificationTypeMeta {
  type: NotificationType;
  label: string;
  description: string;
  category: 'social' | 'content' | 'achievements' | 'system';
  defaultSettings: NotificationChannelSettings;
}

export const NOTIFICATION_TYPE_DEFINITIONS: NotificationTypeMeta[] = [
  // Social
  {
    type: 'FRIEND_REQUEST',
    label: 'Заявка в друзья',
    description: 'Когда другой пользователь отправляет вам запрос на добавление в друзья',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'FRIEND_ACCEPTED',
    label: 'Принятие заявки в друзья',
    description: 'Когда пользователь принял ваш запрос дружбы',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'REVIEW_LIKED',
    label: 'Лайк к рецензии',
    description: 'Когда кто-то оценивает или ставит лайк вашей рецензии',
    category: 'social',
    defaultSettings: { inApp: true, toast: false, telegram: false },
  },
  {
    type: 'REVIEW_COMMENTED',
    label: 'Комментарий к рецензии',
    description: 'Когда пользователь оставляет комментарий или ответ к вашей рецензии',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'CONTENT_SHARED',
    label: 'Поделились контентом',
    description: 'Когда друг или пользователь рекомендует вам фильм, сериал или игру',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'TIER_LIST_INVITE',
    label: 'Приглашение в тир-лист',
    description: 'Приглашение к просмотру или совместной оценке тир-листа',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'NEW_MESSAGE',
    label: 'Личное сообщение',
    description: 'Новые личные сообщения и реплики в чате',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'MENTION',
    label: 'Упоминание (@вы)',
    description: 'Когда вас упоминают через @username в комментариях или обсуждениях',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'FRIEND_REVIEW',
    label: 'Новый отзыв друга',
    description: 'Когда ваш друг публикует рецензию на фильм, сериал или игру',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: false },
  },
  {
    type: 'FRIEND_ACTIVITY',
    label: 'Активность друзей',
    description: 'Добавление в библиотеку, смена статуса просмотра или прохождения',
    category: 'social',
    defaultSettings: { inApp: true, toast: false, telegram: false },
  },
  {
    type: 'LIST_INVITE',
    label: 'Приглашение в список',
    description: 'Приглашение к совместному редактированию коллекции или списка',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: false },
  },
  {
    type: 'LIST_FOLLOW',
    label: 'Подписчики списка',
    description: 'Когда кто-то подписывается на созданные вами списки',
    category: 'social',
    defaultSettings: { inApp: true, toast: false, telegram: false },
  },
  // Content & Progress
  {
    type: 'CONTENT_COMPLETED',
    label: 'Контент завершен',
    description: 'Успешное завершение просмотра фильма, сериала или прохождения игры',
    category: 'content',
    defaultSettings: { inApp: true, toast: true, telegram: false },
  },
  {
    type: 'NEW_RELEASE',
    label: 'Новый релиз контента',
    description: 'Выход новой серии, сезона или премьера отслеживаемого релиза',
    category: 'content',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  // Achievements
  {
    type: 'ACHIEVEMENT',
    label: 'Достижение разблокировано',
    description: 'Получение новых значков, наград и достижений на платформе',
    category: 'achievements',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  // System & Moderation
  {
    type: 'FEEDBACK_REPLIED',
    label: 'Ответ на обратную связь',
    description: 'Ответ модератора или службы поддержки на ваш баг-репорт или предложение',
    category: 'system',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'ADMIN_ANNOUNCEMENT',
    label: 'Объявление администрации',
    description: 'Официальные объявления, системные релизы и важные новости сервиса',
    category: 'system',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'SYSTEM',
    label: 'Системное уведомление',
    description: 'Технические события, использование инвайтов и статус сервиса',
    category: 'system',
    defaultSettings: { inApp: true, toast: true, telegram: false },
  },
];

export function getDefaultNotificationPreferences(): NotificationPreferences {
  const prefs: NotificationPreferences = {};
  for (const def of NOTIFICATION_TYPE_DEFINITIONS) {
    prefs[def.type] = { ...def.defaultSettings };
  }
  // Aliases
  prefs['ACHIEVEMENT_UNLOCKED'] = { ...prefs['ACHIEVEMENT'] };
  prefs['LIKE'] = { ...prefs['REVIEW_LIKED'] };
  prefs['COMMENT'] = { ...prefs['REVIEW_COMMENTED'] };
  prefs['ADMIN_ALERT'] = { ...prefs['ADMIN_ANNOUNCEMENT'] };
  return prefs;
}

export function normalizeNotificationPreferences(raw: any): NotificationPreferences {
  const defaults = getDefaultNotificationPreferences();
  if (!raw) return defaults;

  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return defaults;
    }
  }

  const result: NotificationPreferences = { ...defaults };

  // If old flat boolean settings exist (e.g. { friendRequests: true })
  if (parsed.friendRequests !== undefined && typeof parsed.friendRequests === 'boolean') {
    const val = !!parsed.friendRequests;
    result['FRIEND_REQUEST'].inApp = val;
    result['FRIEND_ACCEPTED'].inApp = val;
  }
  if (parsed.friendReviews !== undefined && typeof parsed.friendReviews === 'boolean') {
    result['FRIEND_REVIEW'].inApp = !!parsed.friendReviews;
  }
  if (parsed.likes !== undefined && typeof parsed.likes === 'boolean') {
    const val = !!parsed.likes;
    result['LIKE'].inApp = val;
    result['REVIEW_LIKED'].inApp = val;
  }
  if (parsed.comments !== undefined && typeof parsed.comments === 'boolean') {
    const val = !!parsed.comments;
    result['COMMENT'].inApp = val;
    result['REVIEW_COMMENTED'].inApp = val;
    result['MENTION'].inApp = val;
  }
  if (parsed.newReleases !== undefined && typeof parsed.newReleases === 'boolean') {
    result['NEW_RELEASE'].inApp = !!parsed.newReleases;
  }

  // If structured per-type settings exist
  for (const type of Object.keys(defaults)) {
    if (parsed[type] && typeof parsed[type] === 'object') {
      result[type] = {
        inApp: parsed[type].inApp !== undefined ? !!parsed[type].inApp : defaults[type].inApp,
        toast: parsed[type].toast !== undefined ? !!parsed[type].toast : defaults[type].toast,
        telegram: parsed[type].telegram !== undefined ? !!parsed[type].telegram : defaults[type].telegram,
      };
    }
  }

  // Sync aliases
  if (result['ACHIEVEMENT']) result['ACHIEVEMENT_UNLOCKED'] = { ...result['ACHIEVEMENT'] };
  if (result['REVIEW_LIKED']) result['LIKE'] = { ...result['REVIEW_LIKED'] };
  if (result['REVIEW_COMMENTED']) result['COMMENT'] = { ...result['REVIEW_COMMENTED'] };
  if (result['ADMIN_ANNOUNCEMENT']) result['ADMIN_ALERT'] = { ...result['ADMIN_ANNOUNCEMENT'] };

  return result;
}

export interface ToastItem {
  id: string;
  notificationId?: number;
  type: NotificationType | string;
  title: string;
  body: string;
  link?: string | null;
  avatar?: string | null;
  durationMs?: number;
  createdAt: number;
}
