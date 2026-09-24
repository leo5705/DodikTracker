import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import {
  CalendarFilters as CalendarFiltersType,
  ReleaseItem,
  ViewMode,
  ScopeMode,
  PeriodType,
} from '../calendar/types.ts';
import {
  getTodayDateString,
  MONTH_NAMES_RU,
  formatDateRussian,
} from '../calendar/calendarUtils.ts';
import { CalendarHeader } from '../calendar/CalendarHeader.tsx';
import { CalendarFilters } from '../calendar/CalendarFilters.tsx';
import { WeekView } from '../calendar/views/WeekView.tsx';
import { MonthView } from '../calendar/views/MonthView.tsx';
import { Loader2, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';

export const CalendarView: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const { route, navigate } = useRouter();

  // Helper to read initial state from URL query params
  const getInitialFilters = (): CalendarFiltersType => {
    const p = route.params || {};
    const validViews: ViewMode[] = ['week', 'month'];
    const validScopes: ScopeMode[] = ['upcoming', 'past', 'all'];

    const view: ViewMode = validViews.includes(p.view as ViewMode) ? (p.view as ViewMode) : 'week';
    const scope: ScopeMode = validScopes.includes(p.scope as ScopeMode)
      ? (p.scope as ScopeMode)
      : 'upcoming';

    let categories: string[] = ['all'];
    if (p.category) {
      categories = p.category.split(',').filter(Boolean);
    }

    return {
      view,
      scope,
      categories: categories.length > 0 ? categories : ['all'],
      period: (p.period as PeriodType) || 'month',
      dateFrom: p.date_from || '',
      dateTo: p.date_to || '',
      followedOnly: p.followed === 'true' || p.my === 'true' || p.my === '1',
      genre: p.genre || '',
      platform: p.platform || '',
      search: p.search || '',
      sort: (p.sort as any) || 'date',
      order: (p.order as any) || 'asc',
    };
  };

  const [filters, setFilters] = useState<CalendarFiltersType>(getInitialFilters);
  const [baseDate, setBaseDate] = useState<string>(getTodayDateString);
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Toast feedback
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const feedbackTimeoutRef = useRef<any>(null);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setFeedback({ text, type });
    feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 3000);
  };

  // Derive month / year for month view
  const baseDateObj = new Date(baseDate + 'T00:00:00Z');
  const currentYear = baseDateObj.getUTCFullYear();
  const currentMonth = baseDateObj.getUTCMonth(); // 0-11

  // Compute period label for header
  const getPeriodLabel = (): string => {
    if (filters.view === 'month') {
      return `${MONTH_NAMES_RU[currentMonth]} ${currentYear}`;
    }
    // Week view
    const dayOfWeek = (baseDateObj.getUTCDay() + 6) % 7;
    const mon = new Date(baseDateObj.getTime() - dayOfWeek * 86400000);
    const sun = new Date(mon.getTime() + 6 * 86400000);
    const monStr = mon.toISOString().slice(0, 10);
    const sunStr = sun.toISOString().slice(0, 10);
    return `${formatDateRussian(monStr, false)} — ${formatDateRussian(sunStr, true)}`;
  };

  // Sync state to URL params cleanly
  const syncFiltersToUrl = useCallback(
    (f: CalendarFiltersType) => {
      const q = new URLSearchParams();
      if (f.view !== 'week') q.set('view', f.view);
      if (f.scope !== 'upcoming') q.set('scope', f.scope);
      if (f.categories.length > 0 && !f.categories.includes('all')) {
        q.set('category', f.categories.join(','));
      }
      if (f.followedOnly) q.set('followed', 'true');
      if (f.search.trim()) q.set('search', f.search.trim());

      const qs = q.toString();
      const newUrl = qs ? `/calendar?${qs}` : '/calendar';
      if (window.location.pathname + window.location.search !== newUrl) {
        window.history.replaceState(null, '', newUrl);
      }
    },
    []
  );

  // Core Data Fetcher
  const fetchReleases = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set('scope', filters.scope);
      if (filters.categories.length > 0 && !filters.categories.includes('all')) {
        query.set('categories', filters.categories.join(','));
      }
      if (filters.followedOnly) {
        query.set('followed_only', 'true');
      }
      if (filters.search.trim()) {
        query.set('search', filters.search.trim());
      }

      if (filters.view === 'week') {
        // Fetch full week window
        const dayOfWeek = (baseDateObj.getUTCDay() + 6) % 7;
        const mon = new Date(baseDateObj.getTime() - dayOfWeek * 86400000);
        const sun = new Date(mon.getTime() + 6 * 86400000);
        query.set('date_from', mon.toISOString().slice(0, 10));
        query.set('date_to', sun.toISOString().slice(0, 10));
        query.set('limit', '100');
      } else {
        // Month view
        const startM = new Date(Date.UTC(currentYear, currentMonth, 1));
        const endM = new Date(Date.UTC(currentYear, currentMonth + 1, 0));
        const expandedStart = new Date(startM.getTime() - 7 * 86400000);
        const expandedEnd = new Date(endM.getTime() + 7 * 86400000);
        query.set('date_from', expandedStart.toISOString().slice(0, 10));
        query.set('date_to', expandedEnd.toISOString().slice(0, 10));
        query.set('limit', '200');
      }

      let res: Response | null = null;
      try {
        res = await authFetch(`/api/releases?${query.toString()}`);
      } catch (_fetchErr) {
        try {
          res = await fetch(`/api/releases?${query.toString()}`);
        } catch (_fallbackErr) {
          console.warn('Network offline during releases fetch');
        }
      }

      if (res && res.ok) {
        const data = await res.json();
        setReleases(data.items || []);
        setTotalCount(data.total || 0);
      } else {
        setReleases([]);
      }
    } catch (err: any) {
      console.warn('Could not refresh releases calendar:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, filters, baseDate, currentYear, currentMonth]);

  // Debounce refetch when filters change
  useEffect(() => {
    syncFiltersToUrl(filters);
    const timer = setTimeout(() => {
      fetchReleases();
    }, 200);
    return () => clearTimeout(timer);
  }, [filters, baseDate, syncFiltersToUrl]);

  // Handle filter changes
  const handleFiltersChange = (updated: Partial<CalendarFiltersType>) => {
    setFilters((prev) => ({ ...prev, ...updated }));
  };

  const handleResetFilters = () => {
    setFilters({
      view: filters.view,
      scope: 'upcoming',
      categories: ['all'],
      period: 'month',
      dateFrom: '',
      dateTo: '',
      followedOnly: false,
      genre: '',
      platform: '',
      search: '',
      sort: 'date',
      order: 'asc',
    });
  };

  // Period Navigation
  const handlePrev = () => {
    if (filters.view === 'week') {
      const prevWeek = new Date(baseDateObj.getTime() - 7 * 86400000);
      setBaseDate(prevWeek.toISOString().slice(0, 10));
    } else {
      const prevMonth = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
      setBaseDate(prevMonth.toISOString().slice(0, 10));
    }
  };

  const handleNext = () => {
    if (filters.view === 'week') {
      const nextWeek = new Date(baseDateObj.getTime() + 7 * 86400000);
      setBaseDate(nextWeek.toISOString().slice(0, 10));
    } else {
      const nextMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 1));
      setBaseDate(nextMonth.toISOString().slice(0, 10));
    }
  };

  const handleToday = () => {
    setBaseDate(getTodayDateString());
  };

  // Follow / Unfollow Release Action
  const handleToggleFollow = async (item: ReleaseItem): Promise<boolean> => {
    if (!dbUser) {
      showFeedback('Войдите в аккаунт, чтобы следить за релизами', 'error');
      return false;
    }
    const willFollow = !(item.isFollowed || item.isSubscribed);
    try {
      const res = await authFetch('/api/releases/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: item.mediaId || item.id,
          targetType: item.type,
          enabled: willFollow,
        }),
      });
      if (res.ok) {
        setReleases((prev) =>
          prev.map((r) =>
            r.id === item.id || (r.mediaId === item.mediaId && r.type === item.type)
              ? { ...r, isFollowed: willFollow, isSubscribed: willFollow }
              : r
          )
        );
        showFeedback(
          willFollow ? `Вы подписались на «${item.title}»` : `Вы отписались от «${item.title}»`,
          'success'
        );
        return true;
      }
      showFeedback('Не удалось обновить подписку', 'error');
      return false;
    } catch {
      showFeedback('Ошибка сети при обновлении подписки', 'error');
      return false;
    }
  };

  // Export iCalendar (.ics)
  const handleExportIcs = async () => {
    setIsExporting(true);
    try {
      const query = new URLSearchParams();
      if (filters.categories.length > 0 && !filters.categories.includes('all')) {
        query.set('categories', filters.categories.join(','));
      }
      if (filters.followedOnly) {
        query.set('followed_only', 'true');
      }
      const res = await authFetch(`/api/releases/export/ics?${query.toString()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dodik-releases-${getTodayDateString()}.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showFeedback('Календарь успешно скачан (.ics)', 'success');
      } else {
        showFeedback('Не удалось экспортировать календарь', 'error');
      }
    } catch {
      showFeedback('Ошибка при скачивании .ics файла', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 space-y-5 pb-16 animate-in fade-in duration-300">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl border text-xs font-bold shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-3 ${
            feedback.type === 'success'
              ? 'bg-[#151932] border-emerald-500/40 text-emerald-300'
              : 'bg-[#151932] border-rose-500/40 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Header */}
      <CalendarHeader
        view={filters.view}
        onViewChange={(v) => handleFiltersChange({ view: v })}
        periodLabel={getPeriodLabel()}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onExportIcs={handleExportIcs}
        isExporting={isExporting}
      />

      {/* Category Filters & Search */}
      <CalendarFilters
        filters={filters}
        onChange={handleFiltersChange}
        onReset={handleResetFilters}
        totalCount={totalCount}
      />

      {/* Main Content View (Week or Month) */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center text-[#94A3B8] gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#8B5CF6]" />
          <span className="text-xs font-mono">Загрузка релизов...</span>
        </div>
      ) : releases.length === 0 && filters.view === 'week' ? (
        <div className="space-y-4">
          <WeekView
            baseDate={baseDate}
            items={[]}
            onToggleFollow={handleToggleFollow}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {filters.view === 'week' && (
            <WeekView
              baseDate={baseDate}
              items={releases}
              onToggleFollow={handleToggleFollow}
            />
          )}

          {filters.view === 'month' && (
            <MonthView
              year={currentYear}
              month={currentMonth}
              items={releases}
              onToggleFollow={handleToggleFollow}
            />
          )}
        </div>
      )}
    </div>
  );
};
