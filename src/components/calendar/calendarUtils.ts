export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export const MONTH_NAMES_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export const MONTH_NAMES_GENITIVE_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export const WEEKDAY_SHORT_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const WEEKDAY_LONG_RU = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
];

/**
 * Formats YYYY-MM-DD into "14 сентября 2026"
 */
export function formatDateRussian(dateStr: string, includeYear = true): string {
  if (!dateStr) return '';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length < 3) return dateStr;
  const y = parts[0];
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const monthName = MONTH_NAMES_GENITIVE_RU[m] || parts[1];
  return includeYear ? `${d} ${monthName} ${y}` : `${d} ${monthName}`;
}

/**
 * Returns weekday long name and day for date
 */
export function formatDayHeader(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  const dayIndex = (d.getUTCDay() + 6) % 7; // Monday = 0
  const weekday = WEEKDAY_LONG_RU[dayIndex];
  return `${weekday}, ${formatDateRussian(dateStr, false)}`;
}

/**
 * Gets 7 days of the week containing targetDate (Monday to Sunday)
 */
export function getWeekDays(targetDate: string): { dateStr: string; dayNumber: number; weekdayShort: string; isToday: boolean }[] {
  const d = new Date(targetDate + 'T00:00:00Z');
  const dayOfWeek = (d.getUTCDay() + 6) % 7; // 0 = Mon, 6 = Sun
  const monday = new Date(d.getTime() - dayOfWeek * 86400000);
  const todayStr = getTodayDateString();

  const days = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(monday.getTime() + i * 86400000);
    const dateStr = current.toISOString().slice(0, 10);
    days.push({
      dateStr,
      dayNumber: current.getUTCDate(),
      weekdayShort: WEEKDAY_SHORT_RU[i],
      isToday: dateStr === todayStr,
    });
  }
  return days;
}

/**
 * Computes calendar grid for month view (weeks containing days)
 */
export function getMonthCalendarGrid(year: number, month: number): {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}[][] {
  const todayStr = getTodayDateString();
  const firstDayOfMonth = new Date(Date.UTC(year, month, 1));
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0));

  // Monday = 0, Sunday = 6
  const startDayOfWeek = (firstDayOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = lastDayOfMonth.getUTCDate();

  const weeks: { dateStr: string; dayNumber: number; isCurrentMonth: boolean; isToday: boolean }[][] = [];
  let currentWeek: { dateStr: string; dayNumber: number; isCurrentMonth: boolean; isToday: boolean }[] = [];

  // Previous month trailing days
  const prevMonthLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const prevDay = prevMonthLastDay - i;
    const prevDate = new Date(Date.UTC(year, month - 1, prevDay));
    const dateStr = prevDate.toISOString().slice(0, 10);
    currentWeek.push({
      dateStr,
      dayNumber: prevDay,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const currDate = new Date(Date.UTC(year, month, day));
    const dateStr = currDate.toISOString().slice(0, 10);
    currentWeek.push({
      dateStr,
      dayNumber: day,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Next month leading days
  if (currentWeek.length > 0) {
    let nextDay = 1;
    while (currentWeek.length < 7) {
      const nextDate = new Date(Date.UTC(year, month + 1, nextDay));
      const dateStr = nextDate.toISOString().slice(0, 10);
      currentWeek.push({
        dateStr,
        dayNumber: nextDay,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
      });
      nextDay++;
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

/**
 * Returns [dateFrom, dateTo] based on period preset
 */
export function computePeriodDates(period: string, baseDateStr?: string): { from: string; to: string } {
  const today = baseDateStr || getTodayDateString();
  const now = new Date(today + 'T00:00:00Z');

  if (period === 'today') {
    return { from: today, to: today };
  }

  if (period === 'week') {
    const dayOfWeek = (now.getUTCDay() + 6) % 7;
    const mon = new Date(now.getTime() - dayOfWeek * 86400000);
    const sun = new Date(mon.getTime() + 6 * 86400000);
    return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
  }

  if (period === 'next_week') {
    const dayOfWeek = (now.getUTCDay() + 6) % 7;
    const nextMon = new Date(now.getTime() + (7 - dayOfWeek) * 86400000);
    const nextSun = new Date(nextMon.getTime() + 6 * 86400000);
    return { from: nextMon.toISOString().slice(0, 10), to: nextSun.toISOString().slice(0, 10) };
  }

  if (period === 'month') {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const startM = new Date(Date.UTC(y, m, 1));
    const endM = new Date(Date.UTC(y, m + 1, 0));
    return { from: startM.toISOString().slice(0, 10), to: endM.toISOString().slice(0, 10) };
  }

  if (period === 'next_month') {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    const startM = new Date(Date.UTC(y, m, 1));
    const endM = new Date(Date.UTC(y, m + 1, 0));
    return { from: startM.toISOString().slice(0, 10), to: endM.toISOString().slice(0, 10) };
  }

  if (period === '3months') {
    const target = new Date(now.getTime() + 90 * 86400000);
    return { from: today, to: target.toISOString().slice(0, 10) };
  }

  if (period === '6months') {
    const target = new Date(now.getTime() + 180 * 86400000);
    return { from: today, to: target.toISOString().slice(0, 10) };
  }

  if (period === 'year') {
    const target = new Date(now.getTime() + 365 * 86400000);
    return { from: today, to: target.toISOString().slice(0, 10) };
  }

  return { from: '', to: '' };
}

/**
 * Category styling metadata
 */
export function getCategoryBadge(type: string): {
  label: string;
  bg: string;
  text: string;
  border: string;
  iconName: string;
} {
  switch (type?.toUpperCase()) {
    case 'MOVIE':
      return {
        label: 'Фильм',
        bg: 'bg-rose-500/10',
        text: 'text-rose-400',
        border: 'border-rose-500/20',
        iconName: 'Film',
      };
    case 'TV':
      return {
        label: 'Сериал',
        bg: 'bg-sky-500/10',
        text: 'text-sky-400',
        border: 'border-sky-500/20',
        iconName: 'Tv',
      };
    case 'ANIME':
      return {
        label: 'Аниме',
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500/20',
        iconName: 'Flame',
      };
    case 'GAME':
      return {
        label: 'Игра',
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        border: 'border-emerald-500/20',
        iconName: 'Gamepad2',
      };
    case 'BOOK':
      return {
        label: 'Книга',
        bg: 'bg-amber-400/10',
        text: 'text-amber-300',
        border: 'border-amber-400/20',
        iconName: 'BookOpen',
      };
    case 'MANGA':
      return {
        label: 'Манга',
        bg: 'bg-pink-500/10',
        text: 'text-pink-400',
        border: 'border-pink-500/20',
        iconName: 'BookMarked',
      };
    case 'COMIC':
      return {
        label: 'Комикс',
        bg: 'bg-indigo-500/10',
        text: 'text-indigo-400',
        border: 'border-indigo-500/20',
        iconName: 'Mask',
      };
    case 'MUSIC':
      return {
        label: 'Музыка',
        bg: 'bg-violet-500/10',
        text: 'text-violet-400',
        border: 'border-violet-500/20',
        iconName: 'Music',
      };
    default:
      return {
        label: type || 'Медиа',
        bg: 'bg-zinc-800/60',
        text: 'text-zinc-300',
        border: 'border-zinc-700/40',
        iconName: 'Sparkles',
      };
  }
}

/**
 * Returns existing application detail route for a release item.
 * Strictly uses existing routes:
 * - /movies/:id
 * - /games/:id
 * - /series/:id
 * - /anime/:id
 * - /books/:id
 * - /manga/:id
 * - /comics/:id
 * - /music/:id
 */
export function getDetailRouteForRelease(item: { type?: string; mediaId?: number; id?: number }): string {
  const targetId = item.mediaId || item.id;
  const rawType = (item.type || '').toUpperCase();
  switch (rawType) {
    case 'GAME':
      return `/games/${targetId}`;
    case 'MOVIE':
      return `/movies/${targetId}`;
    case 'TV':
    case 'SERIES':
      return `/series/${targetId}`;
    case 'ANIME':
      return `/anime/${targetId}`;
    case 'BOOK':
    case 'BOOKS':
      return `/books/${targetId}`;
    case 'MANGA':
      return `/manga/${targetId}`;
    case 'COMIC':
    case 'COMICS':
      return `/comics/${targetId}`;
    case 'MUSIC':
      return `/music/${targetId}`;
    default:
      return `/media/${(item.type || 'movie').toLowerCase().replace(/_/g, '-')}/${targetId}`;
  }
}
