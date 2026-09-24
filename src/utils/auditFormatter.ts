import { ReactNode } from 'react';

export interface RawAuditLog {
  id: number;
  action: string;
  details?: string | null;
  ip?: string | null;
  createdAt: string | Date;
  adminId?: number | null;
  adminUsername?: string | null;
  adminAvatar?: string | null;
  adminRole?: string | null;
}

export interface HighlightItem {
  label: string;
  value: string;
}

export interface FormattedAuditLog {
  id: number;
  action: string;
  title: string;
  category: string;
  categoryKey: 'SYSTEM' | 'USERS' | 'CONTENT' | 'MODERATION' | 'NEWS' | 'ANNOUNCEMENTS' | 'ACHIEVEMENTS' | 'INTEGRATIONS' | 'SETTINGS' | 'INVITES' | 'NOTIFICATIONS';
  badgeClass: string;
  formattedDate: string;
  relativeDate: string;
  actorName: string;
  isSystem: boolean;
  summary: string;
  highlights: HighlightItem[];
  parsedPayload: Record<string, any> | null;
  rawDetails: string;
  ip?: string;
}

const ACTION_DICTIONARY: Record<
  string,
  {
    title: string;
    category: string;
    categoryKey: FormattedAuditLog['categoryKey'];
    badgeClass: string;
  }
> = {
  // 1. System & Background Jobs
  MESSAGES_WEEKLY_CLEANUP: {
    title: 'Еженедельная очистка сообщений',
    category: 'Система',
    categoryKey: 'SYSTEM',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  SYSTEM_CLEANUP: {
    title: 'Автоматическая очистка системы',
    category: 'Система',
    categoryKey: 'SYSTEM',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  SYSTEM_BACKGROUND_JOB: {
    title: 'Фоновая системная задача',
    category: 'Система',
    categoryKey: 'SYSTEM',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },

  // 2. User Management
  CHANGE_ROLE: {
    title: 'Смена роли пользователя',
    category: 'Пользователи',
    categoryKey: 'USERS',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  BAN_USER: {
    title: 'Заполнение блокировки пользователя',
    category: 'Пользователи',
    categoryKey: 'USERS',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  UNBAN_USER: {
    title: 'Снятие блокировки пользователя',
    category: 'Пользователи',
    categoryKey: 'USERS',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  TEMP_BAN_USER: {
    title: 'Временный бан пользователя',
    category: 'Пользователи',
    categoryKey: 'USERS',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  },
  WARN_USER: {
    title: 'Вынесение предупреждения',
    category: 'Пользователи',
    categoryKey: 'USERS',
    badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  },
  RESET_PASSWORD: {
    title: 'Сброс пароля пользователя',
    category: 'Пользователи',
    categoryKey: 'USERS',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  },
  UPDATE_USER_INVITES: {
    title: 'Изменение лимита инвайтов',
    category: 'Пользователи',
    categoryKey: 'USERS',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },
  UPDATE_REGISTRATION_MODE: {
    title: 'Изменение режима регистрации',
    category: 'Настройки',
    categoryKey: 'SETTINGS',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },

  // 3. Content Catalog
  UPDATE_MEDIA: {
    title: 'Редактирование карточки произведения',
    category: 'Контент',
    categoryKey: 'CONTENT',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  HIDE_MEDIA: {
    title: 'Сокрытие произведения из каталога',
    category: 'Контент',
    categoryKey: 'CONTENT',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  UNHIDE_MEDIA: {
    title: 'Восстановление произведения в каталоге',
    category: 'Контент',
    categoryKey: 'CONTENT',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  DELETE_MEDIA: {
    title: 'Удаление произведения из базы',
    category: 'Контент',
    categoryKey: 'CONTENT',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/30',
  },

  // 4. Moderation & Reports
  RESOLVE_REPORT: {
    title: 'Обработка жалобы',
    category: 'Модерация',
    categoryKey: 'MODERATION',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  UPDATE_REPORT_STATUS: {
    title: 'Изменение статуса жалобы',
    category: 'Модерация',
    categoryKey: 'MODERATION',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  REPLY_FEEDBACK: {
    title: 'Ответ на тикет обратной связи',
    category: 'Модерация',
    categoryKey: 'MODERATION',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },

  // 5. News
  CREATE_NEWS: {
    title: 'Создание новости',
    category: 'Новости',
    categoryKey: 'NEWS',
    badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  },
  UPDATE_NEWS: {
    title: 'Редактирование новости',
    category: 'Новости',
    categoryKey: 'NEWS',
    badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  },
  UPDATE_NEWS_STATUS: {
    title: 'Изменение статуса новости',
    category: 'Новости',
    categoryKey: 'NEWS',
    badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  },
  DELETE_NEWS: {
    title: 'Удаление новости',
    category: 'Новости',
    categoryKey: 'NEWS',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },

  // 6. Announcements
  CREATE_ANNOUNCEMENT: {
    title: 'Создание объявления',
    category: 'Объявления',
    categoryKey: 'ANNOUNCEMENTS',
    badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  },
  UPDATE_ANNOUNCEMENT: {
    title: 'Редактирование объявления',
    category: 'Объявления',
    categoryKey: 'ANNOUNCEMENTS',
    badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  },
  PUBLISH_ANNOUNCEMENT: {
    title: 'Публикация объявления',
    category: 'Объявления',
    categoryKey: 'ANNOUNCEMENTS',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  UNPUBLISH_ANNOUNCEMENT: {
    title: 'Снятие объявления с публикации',
    category: 'Объявления',
    categoryKey: 'ANNOUNCEMENTS',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  DELETE_ANNOUNCEMENT: {
    title: 'Удаление объявления',
    category: 'Объявления',
    categoryKey: 'ANNOUNCEMENTS',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },

  // 7. Notifications
  SEND_NOTIFICATION: {
    title: 'Отправка системного уведомления',
    category: 'Уведомления',
    categoryKey: 'NOTIFICATIONS',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  },

  // 8. Achievements
  ACHIEVEMENT_CREATE: {
    title: 'Создание достижения',
    category: 'Достижения',
    categoryKey: 'ACHIEVEMENTS',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  ACHIEVEMENT_UPDATE: {
    title: 'Редактирование достижения',
    category: 'Достижения',
    categoryKey: 'ACHIEVEMENTS',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  ACHIEVEMENT_GRANT: {
    title: 'Ручная выдача достижения',
    category: 'Достижения',
    categoryKey: 'ACHIEVEMENTS',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  ACHIEVEMENT_REVOKE: {
    title: 'Отзыв достижения у пользователя',
    category: 'Достижения',
    categoryKey: 'ACHIEVEMENTS',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  ACHIEVEMENT_REGRANT: {
    title: 'Повторное вычисление достижения',
    category: 'Достижения',
    categoryKey: 'ACHIEVEMENTS',
    badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  },

  // 9. Integrations & Keys
  UPDATE_INTEGRATION_KEY: {
    title: 'Обновление API-ключа',
    category: 'Интеграции',
    categoryKey: 'INTEGRATIONS',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
  DELETE_INTEGRATION_KEY: {
    title: 'Удаление API-ключа',
    category: 'Интеграции',
    categoryKey: 'INTEGRATIONS',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  TOGGLE_INTEGRATION: {
    title: 'Переключение состояния интеграции',
    category: 'Интеграции',
    categoryKey: 'INTEGRATIONS',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },

  // 10. Invites
  GENERATE_INVITES: {
    title: 'Массовая генерация инвайт-кодов',
    category: 'Инвайты',
    categoryKey: 'INVITES',
    badgeClass: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  },
  ENABLE_INVITE: {
    title: 'Включение инвайт-кода',
    category: 'Инвайты',
    categoryKey: 'INVITES',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  DISABLE_INVITE: {
    title: 'Деактивация инвайт-кода',
    category: 'Инвайты',
    categoryKey: 'INVITES',
    badgeClass: 'bg-zinc-700/40 text-zinc-300 border-zinc-600/30',
  },
  DELETE_INVITE: {
    title: 'Удаление инвайт-кода',
    category: 'Инвайты',
    categoryKey: 'INVITES',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },

  // 11. Settings
  UPDATE_SETTINGS: {
    title: 'Изменение системных настроек',
    category: 'Настройки',
    categoryKey: 'SETTINGS',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
};

/**
 * Format a Date or ISO string to Russian date format (e.g. "24 сентября 2026, 10:29:39")
 */
export function formatRussianDateTime(dateInput: string | Date | number): string {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

/**
 * Format a Date to short relative time or date
 */
export function formatRelativeTime(dateInput: string | Date | number): string {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return 'Только что';
  if (diffMin < 60) return `${diffMin} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays === 1) return `Вчера в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays < 7) return `${diffDays} дн. назад`;

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * Parses details JSON string if valid, otherwise returns string or null
 */
function parseDetailsJson(rawDetails?: string | null): Record<string, any> | null {
  if (!rawDetails || typeof rawDetails !== 'string') return null;
  const trimmed = rawDetails.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
  } catch {}
  return null;
}

/**
 * Formats key-value pairs from parsed JSON into clean human readable Russian labels and values
 */
function extractHighlights(parsed: Record<string, any>, actionKey: string): HighlightItem[] {
  const highlights: HighlightItem[] = [];

  if (parsed.deletedCount !== undefined) {
    highlights.push({ label: 'Удалено сообщений', value: String(parsed.deletedCount) });
  }
  if (parsed.retentionDays !== undefined) {
    highlights.push({ label: 'Срок хранения', value: `${parsed.retentionDays} дн.` });
  }
  if (parsed.durationMs !== undefined) {
    highlights.push({ label: 'Время выполнения', value: `${parsed.durationMs} мс` });
  }
  if (parsed.count !== undefined) {
    highlights.push({ label: 'Количество', value: String(parsed.count) });
  }
  if (parsed.role !== undefined) {
    const roleNames: Record<string, string> = {
      SUPER_ADMIN: 'Суперадмин',
      ADMIN: 'Администратор',
      MODERATOR: 'Модератор',
      CONTENT_MANAGER: 'Контент-менеджер',
      NEWS_EDITOR: 'Редактор новостей',
      USER: 'Пользователь',
    };
    highlights.push({ label: 'Новая роль', value: roleNames[parsed.role] || String(parsed.role) });
  }
  if (parsed.username) {
    highlights.push({ label: 'Пользователь', value: `@${parsed.username}` });
  }
  if (parsed.targetUsername) {
    highlights.push({ label: 'Целевой юзер', value: `@${parsed.targetUsername}` });
  }
  if (parsed.banHours !== undefined) {
    highlights.push({ label: 'Длительность бана', value: `${parsed.banHours} ч.` });
  }
  if (parsed.reason) {
    highlights.push({ label: 'Причина', value: String(parsed.reason) });
  }
  if (parsed.provider) {
    highlights.push({ label: 'Провайдер', value: String(parsed.provider) });
  }
  if (parsed.action) {
    highlights.push({ label: 'Действие модератора', value: String(parsed.action) });
  }
  if (parsed.mediaTitle || parsed.title) {
    highlights.push({ label: 'Название', value: String(parsed.mediaTitle || parsed.title) });
  }

  return highlights;
}

/**
 * Main Formatter function: turns a raw audit database record into a clean, human-readable FormattedAuditLog
 */
export function formatAuditLog(raw: RawAuditLog): FormattedAuditLog {
  const rawAction = raw.action || 'UNKNOWN_ACTION';
  const knownDict = ACTION_DICTIONARY[rawAction];

  // Determine fallback category & title if not in dictionary
  let title = knownDict?.title;
  let category = knownDict?.category || 'Система';
  let categoryKey = knownDict?.categoryKey || 'SYSTEM';
  let badgeClass = knownDict?.badgeClass || 'bg-[#1E2442] text-[#94A3B8] border-[#1E2442]';

  if (!title) {
    if (rawAction.startsWith('USER_') || rawAction.includes('BAN') || rawAction.includes('ROLE')) {
      category = 'Пользователи';
      categoryKey = 'USERS';
      badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    } else if (rawAction.startsWith('CONTENT_') || rawAction.includes('MEDIA')) {
      category = 'Контент';
      categoryKey = 'CONTENT';
      badgeClass = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    } else if (rawAction.startsWith('REPORT_') || rawAction.includes('MODERAT')) {
      category = 'Модерация';
      categoryKey = 'MODERATION';
      badgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    }
    // Prettify action name
    title = rawAction
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Parse details JSON
  const rawDetailsStr = raw.details || '';
  const parsedPayload = parseDetailsJson(rawDetailsStr);

  // Determine if this is a system background task
  const isSystem =
    !raw.adminUsername ||
    raw.adminId === null ||
    rawAction.startsWith('SYSTEM_') ||
    rawAction === 'MESSAGES_WEEKLY_CLEANUP';

  const actorName = isSystem ? 'Система' : `@${raw.adminUsername}`;

  // Extract highlights
  const highlights = parsedPayload ? extractHighlights(parsedPayload, rawAction) : [];

  // Build primary summary string
  let summary = '';
  if (rawAction === 'MESSAGES_WEEKLY_CLEANUP') {
    const deletedCount = parsedPayload?.deletedCount ?? 0;
    const retention = parsedPayload?.retentionDays ?? 7;
    summary = `Автоматическая очистка старых личных сообщений (удалено: ${deletedCount}, срок хранения: ${retention} дн.)`;
  } else if (parsedPayload && parsedPayload.description) {
    summary = String(parsedPayload.description);
  } else if (parsedPayload && parsedPayload.message) {
    summary = String(parsedPayload.message);
  } else if (rawDetailsStr && !parsedPayload) {
    summary = rawDetailsStr;
  } else if (highlights.length > 0) {
    summary = highlights.map((h) => `${h.label}: ${h.value}`).join(' • ');
  } else {
    summary = title;
  }

  const formattedDate = formatRussianDateTime(raw.createdAt);
  const relativeDate = formatRelativeTime(raw.createdAt);

  return {
    id: raw.id,
    action: rawAction,
    title,
    category,
    categoryKey,
    badgeClass,
    formattedDate,
    relativeDate,
    actorName,
    isSystem,
    summary,
    highlights,
    parsedPayload,
    rawDetails: rawDetailsStr,
    ip: raw.ip || undefined,
  };
}
