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
  computePeriodDates,
} from '../calendar/calendarUtils.ts';
import { CalendarHeader } from '../calendar/CalendarHeader.tsx';
import { CalendarFilters } from '../calendar/CalendarFilters.tsx';
import { WeekView } from '../calendar/views/WeekView.tsx';
import { MonthView } from '../calendar/views/MonthView.tsx';
import { ListView } from '../calendar/views/ListView.tsx';
import { TimelineView } from '../calendar/views/TimelineView.tsx';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export const CalendarView: React.FC = () => {
  const { authFetch, dbUser } = useAuth();
  const { route, navigate } = useRouter();

  // Helper to read initial state from URL query params
  const getInitialFilters = (): CalendarFiltersType => {
    const p = route.params || {};
    const validViews: ViewMode[] = ['week', 'month', 'list', 'timeline'];
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
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
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
    if (filters.view === 'week') {
      const dayOfWeek = (baseDateObj.getUTCDay() + 6) % 7;
      const mon = new Date(baseDateObj.getTime() - dayOfWeek * 86400000);
      const sun = new Date(mon.getTime() + 6 * 86400000);
      const monStr = mon.toISOString().slice(0, 10);
      const sunStr = sun.toISOString().slice(0, 10);
      return `${formatDateRussian(monStr, false)} — ${formatDateRussian(sunStr, true)}`;
    }
    if (filters.period === 'today') {
      return `Сегодня (${formatDateRussian(getTodayDateString(), true)})`;
    }
    if (filters.dateFrom && filters.dateTo) {
      return `${formatDateRussian(filters.dateFrom, false)} — ${formatDateRussian(filters.dateTo, true)}`;
    }
    return `${MONTH_NAMES_RU[currentMonth]} ${currentYear}`;
  };

  // Synchronize filters to URL params (replace mode so history isn't bloated)
  const syncFiltersToUrl = useCallback(
    (currentFilters: CalendarFiltersType) => {
      const sp = new URLSearchParams();
      if (currentFilters.view !== 'week') sp.set('view', currentFilters.view);
      if (currentFilters.scope !== 'upcoming') sp.set('scope', currentFilters.scope);
      if (currentFilters.categories.length > 0 && !currentFilters.categories.includes('all')) {
        sp.set('category', currentFilters.categories.join(','));
      }
      if (currentFilters.period !== 'month') sp.set('period', currentFilters.period);
      if (currentFilters.dateFrom) sp.set('date_from', currentFilters.dateFrom);
      if (currentFilters.dateTo) sp.set('date_to', currentFilters.dateTo);
      if (currentFilters.followedOnly) sp.set('my', '1');
      if (currentFilters.genre) sp.set('genre', currentFilters.genre);
      if (currentFilters.platform) sp.set('platform', currentFilters.platform);
      if (currentFilters.search) sp.set('search', currentFilters.search);
      if (currentFilters.sort !== 'date') sp.set('sort', currentFilters.sort);
      if (currentFilters.order !== 'asc') sp.set('order', currentFilters.order);

      const qs = sp.toString();
      const newPath = qs ? `/calendar?${qs}` : '/calendar';
      if (window.location.search !== (qs ? `?${qs}` : '')) {
        navigate(newPath, { replace: true });
      }
    },
    [navigate]
  );

  // Fetch releases from API
  const fetchReleases = useCallback(
    async (isLoadMore = false, targetPage = 1) => {
      if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const query = new URLSearchParams();
        query.set('scope', filters.scope);

        if (filters.categories.length > 0 && !filters.categories.includes('all')) {
          query.set('category', filters.categories.join(','));
        }

        if (filters.followedOnly) {
          query.set('followed', 'true');
        }

        if (filters.search) {
          query.set('search', filters.search);
        }

        if (filters.genre) {
          query.set('genre', filters.genre);
        }

        if (filters.platform) {
          query.set('platform', filters.platform);
        }

        query.set('sort', filters.sort);
        query.set('order', filters.order);
        query.set('page', targetPage.toString());

        // View-specific date constraints
        if (filters.view === 'week') {
          // Fetch exact week
          const dayOfWeek = (baseDateObj.getUTCDay() + 6) % 7;
          const mon = new Date(baseDateObj.getTime() - dayOfWeek * 86400000);
          const sun = new Date(mon.getTime() + 6 * 86400000);
          query.set('date_from', mon.toISOString().slice(0, 10));
          query.set('date_to', sun.toISOString().slice(0, 10));
          query.set('limit', '100');
        } else if (filters.view === 'month') {
          // Fetch month (including week edges)
          const startM = new Date(Date.UTC(currentYear, currentMonth, 1));
          const endM = new Date(Date.UTC(currentYear, currentMonth + 1, 0));
          // Expand 7 days before and after to cover trailing grid cells
          const expandedStart = new Date(startM.getTime() - 7 * 86400000);
          const expandedEnd = new Date(endM.getTime() + 7 * 86400000);
          query.set('date_from', expandedStart.toISOString().slice(0, 10));
          query.set('date_to', expandedEnd.toISOString().slice(0, 10));
          query.set('limit', '200');
        } else {
          // List / Timeline views: respect custom dates or period
          if (filters.dateFrom && filters.dateTo) {
            query.set('date_from', filters.dateFrom);
            query.set('date_to', filters.dateTo);
          } else if (filters.period && filters.period !== 'custom') {
            query.set('period', filters.period);
          }
          query.set('limit', '30');
        }

        const res = await authFetch(`/api/releases?${query.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (isLoadMore) {
            setReleases((prev) => [...prev, ...(data.items || [])]);
          } else {
            setReleases(data.items || []);
          }
          setTotalCount(data.total || 0);
          setHasMore((data.page || 1) < (data.totalPages || 1));
          setPage(targetPage);
        }
      } catch (err) {
        console.error('Failed to load releases:', err);
        showFeedback('Не удалось загрузить календарь релизов', 'error');
      } finally {
        setLoading(false);
        setIsLoadingMore(false);
      }
    },
    [authFetch, filters, baseDate, currentYear, currentMonth]
  );

  // Debounce refetch when filters change
  useEffect(() => {
    syncFiltersToUrl(filters);
    const timer = setTimeout(() => {
      fetchReleases(false, 1);
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
    } else if (filters.view === 'month') {
      const prevMonth = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
      setBaseDate(prevMonth.toISOString().slice(0, 10));
    } else {
      // In list/timeline, shift window by 30 days
      const prevPeriod = new Date(baseDateObj.getTime() - 30 * 86400000);
      setBaseDate(prevPeriod.toISOString().slice(0, 10));
    }
  };

  const handleNext = () => {
    if (filters.view === 'week') {
      const nextWeek = new Date(baseDateObj.getTime() + 7 * 86400000);
      setBaseDate(nextWeek.toISOString().slice(0, 10));
    } else if (filters.view === 'month') {
      const nextMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 1));
      setBaseDate(nextMonth.toISOString().slice(0, 10));
    } else {
      // In list/timeline, shift window by 30 days
      const nextPeriod = new Date(baseDateObj.getTime() + 30 * 86400000);
      setBaseDate(nextPeriod.toISOString().slice(0, 10));
    }
  };

  const handleToday = () => {
    const today = getTodayDateString();
    setBaseDate(today);
  };

  // Follow / Unfollow toggle
  const handleToggleFollow = async (item: ReleaseItem): Promise<boolean> => {
    if (!dbUser) {
      showFeedback('Войдите в аккаунт, чтобы следить за релизами', 'error');
      return false;
    }

    const wasFollowed = item.isFollowed || item.isSubscribed;
    const method = wasFollowed ? 'DELETE' : 'POST';

    try {
      const res = await authFetch(`/api/releases/${item.mediaId}/follow`, { method });
      if (res.ok) {
        // Update local item
        setReleases((prev) =>
          prev.map((r) =>
            r.id === item.id || r.mediaId === item.mediaId
              ? { ...r, isFollowed: !wasFollowed, isSubscribed: !wasFollowed }
              : r
          )
        );
        showFeedback(
          wasFollowed
            ? `Вы больше не следите за релизом «${item.title}»`
            : `Вы подписались на уведомления о релизе «${item.title}»`,
          'success'
        );
        return true;
      } else {
        const data = await res.json().catch(() => ({}));
        showFeedback(data.error || 'Ошибка при обновлении подписки', 'error');
        return false;
      }
    } catch (err) {
      console.error('Toggle follow failed:', err);
      showFeedback('Ошибка соединения с сервером', 'error');
      return false;
    }
  };

  // Export iCalendar (.ics)
  const handleExportIcs = async () => {
    setIsExporting(true);
    try {
      const query = new URLSearchParams();
      query.set('scope', filters.scope);
      if (filters.categories.length > 0 && !filters.categories.includes('all')) {
        query.set('category', filters.categories.join(','));
      }
      if (filters.followedOnly) query.set('followed', 'true');
      if (filters.dateFrom) query.set('date_from', filters.dateFrom);
      if (filters.dateTo) query.set('date_to', filters.dateTo);

      const res = await authFetch(`/api/calendar/export.ics?${query.toString()}`);
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
        showFeedback('Календарь успешно экспортирован в .ics', 'success');
      } else {
        showFeedback('Не удалось экспортировать календарь', 'error');
      }
    } catch (err) {
      console.error('Export ICS failed:', err);
      showFeedback('Ошибка при экспорте', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Count followed in current list
  const followedCount = releases.filter((r) => r.isFollowed || r.isSubscribed).length;

  return (
    <div className="space-y-5 pb-16 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl border text-xs font-semibold shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700/50'
              : 'bg-rose-950/90 text-rose-200 border-rose-700/50'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Header with Navigation and View Mode selector */}
      <CalendarHeader
        view={filters.view}
        onViewChange={(view) => handleFiltersChange({ view })}
        periodLabel={getPeriodLabel()}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onExportIcs={handleExportIcs}
        isExporting={isExporting}
      />

      {/* Unified Filters Bar */}
      <CalendarFilters
        filters={filters}
        onChange={handleFiltersChange}
        onReset={handleResetFilters}
        totalCount={totalCount}
        followedCount={followedCount}
      />

      {/* Main Content Area */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center space-y-3 bg-[#13121B]/30 rounded-3xl border border-[#232032]">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-xs text-zinc-400 font-mono">
            Загрузка расписания релизов...
          </p>
        </div>
      ) : (
        <div>
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

          {filters.view === 'list' && (
            <ListView
              items={releases}
              onToggleFollow={handleToggleFollow}
              onLoadMore={() => fetchReleases(true, page + 1)}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
            />
          )}

          {filters.view === 'timeline' && (
            <TimelineView
              items={releases}
              onToggleFollow={handleToggleFollow}
            />
          )}
        </div>
      )}
    </div>
  );
};
