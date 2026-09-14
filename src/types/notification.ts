export type NotificationType =
  | 'ACHIEVEMENT_UNLOCKED'
  | 'FRIEND_REQUEST'
  | 'FRIEND_ACCEPTED'
  | 'NEW_MESSAGE'
  | 'FRIEND_REVIEW'
  | 'FRIEND_ACTIVITY'
  | 'NEW_RELEASE'
  | 'MENTION'
  | 'SYSTEM'
  | 'ADMIN_ALERT'
  | 'LIKE'
  | 'COMMENT'
  | 'LIST_INVITE'
  | 'LIST_FOLLOW';

export interface NotificationItem {
  id: number;
  userId: number;
  type: NotificationType | string;
  title: string;
  body: string;
  content?: string | null;
  link?: string | null;
  relatedEntity?: string | null;
  relatedEntityId?: string | null;
  senderId?: number | null;
  senderAvatar?: string | null;
  senderUsername?: string | null;
  metadataJson?: string | null;
  metadata?: Record<string, any> | null;
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
  {
    type: 'ACHIEVEMENT_UNLOCKED',
    label: 'Новое достижение',
    description: 'Оповещения о разблокировке новых наград и трофеев',
    category: 'achievements',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
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
    type: 'NEW_MESSAGE',
    label: 'Новое сообщение',
    description: 'Личные сообщения и реплики от друзей',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'FRIEND_REVIEW',
    label: 'Новый отзыв друга',
    description: 'Когда ваш друг публикует рецензию или оценку на фильм, игру или книгу',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: false },
  },
  {
    type: 'FRIEND_ACTIVITY',
    label: 'Активность друга',
    description: 'Добавление в библиотеку, смена статуса просмотра или прохождения',
    category: 'social',
    defaultSettings: { inApp: true, toast: false, telegram: false },
  },
  {
    type: 'NEW_RELEASE',
    label: 'Новый релиз контента',
    description: 'Выход новой серии, сезона, фильма или книги из вашего трекера',
    category: 'content',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'MENTION',
    label: 'Упоминание (@вы)',
    description: 'Когда вас отмечают через @логин в комментариях, отзывах или списках',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'SYSTEM',
    label: 'Системное уведомление',
    description: 'Важные обновления платформы, технические работы и статус сервиса',
    category: 'system',
    defaultSettings: { inApp: true, toast: true, telegram: false },
  },
  {
    type: 'ADMIN_ALERT',
    label: 'Уведомление администратора',
    description: 'Прямые оповещения и объявления от команды модерации и администраторов',
    category: 'system',
    defaultSettings: { inApp: true, toast: true, telegram: true },
  },
  {
    type: 'LIKE',
    label: 'Лайки к записям',
    description: 'Когда кто-то ставит лайк вашей рецензии или тир-листу',
    category: 'social',
    defaultSettings: { inApp: true, toast: false, telegram: false },
  },
  {
    type: 'COMMENT',
    label: 'Комментарии и ответы',
    description: 'Ответы на ваши комментарии и обсуждения в списках',
    category: 'social',
    defaultSettings: { inApp: true, toast: true, telegram: false },
  },
  {
    type: 'LIST_INVITE',
    label: 'Приглашения в списки',
    description: 'Приглашения к совместному редактированию коллекций',
    category: 'content',
    defaultSettings: { inApp: true, toast: true, telegram: false },
  },
  {
    type: 'LIST_FOLLOW',
    label: 'Подписчики списков',
    description: 'Когда кто-то подписывается на созданные вами списки',
    category: 'content',
    defaultSettings: { inApp: true, toast: false, telegram: false },
  },
];

export function getDefaultNotificationPreferences(): NotificationPreferences {
  const prefs: NotificationPreferences = {};
  for (const def of NOTIFICATION_TYPE_DEFINITIONS) {
    prefs[def.type] = { ...def.defaultSettings };
  }
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
    result['FRIEND_REQUEST'].inApp = !!parsed.friendRequests;
    result['FRIEND_ACCEPTED'].inApp = !!parsed.friendRequests;
  }
  if (parsed.friendReviews !== undefined && typeof parsed.friendReviews === 'boolean') {
    result['FRIEND_REVIEW'].inApp = !!parsed.friendReviews;
  }
  if (parsed.likes !== undefined && typeof parsed.likes === 'boolean') {
    result['LIKE'].inApp = !!parsed.likes;
  }
  if (parsed.comments !== undefined && typeof parsed.comments === 'boolean') {
    result['COMMENT'].inApp = !!parsed.comments;
    result['MENTION'].inApp = !!parsed.comments;
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
