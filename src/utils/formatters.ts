export const formatMediaTypePath = (type?: string): string => {
  if (!type) return 'item';
  return type.toLowerCase().replace(/_/g, '-');
};

export const formatDuration = (minutes?: number | null): string => {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} ч ${m} мин`;
  if (h > 0) return `${h} ч`;
  return `${m} мин`;
};

export const formatDate = (dateStr?: string | Date | null): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};
