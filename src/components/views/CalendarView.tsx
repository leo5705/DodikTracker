import React, { useState, useEffect } from 'react';
import { CalendarDays, Download, Film, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export const CalendarView: React.FC = () => {
  const { authFetch, dbUser, login } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUser) {
      setLoading(false);
      return;
    }

    const fetchCalendar = async () => {
      setLoading(true);
      try {
        const res = await authFetch('/api/calendar');
        if (res.ok) {
          const data = await res.json();
          setEvents(data);
        }
      } catch (err) {
        console.error('Failed to load calendar:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCalendar();
  }, [dbUser]);

  const handleExportIcs = async () => {
    try {
      const res = await authFetch('/api/calendar/export.ics');
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dodik-releases.ics';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Export ICS failed:', err);
    }
  };

  if (!dbUser) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-purple-950/60 border border-purple-800/40 flex items-center justify-center mx-auto text-purple-400">
          <CalendarDays className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-zinc-100 font-mono">КАЛЕНДАРЬ РЕЛИЗОВ</h2>
        <p className="text-xs text-zinc-400">
          Войдите в аккаунт, чтобы отслеживать даты премьер фильмов, серий и игр из вашей библиотеки.
        </p>
        <button
          onClick={() => login()}
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/30"
        >
          Войти в аккаунт
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-100 font-mono tracking-tight flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-purple-400" />
            КАЛЕНДАРЬ РЕЛИЗОВ
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            График премьер и выхода новых серий из вашей библиотеки
          </p>
        </div>

        {events.length > 0 && (
          <button
            onClick={handleExportIcs}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold shadow-md transition-all self-start sm:self-auto"
          >
            <Download className="w-4 h-4 text-purple-400" />
            Экспорт в iCal (.ics)
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-xs text-zinc-400">Загрузка календаря...</p>
        </div>
      ) : events.length > 0 ? (
        <div className="space-y-3">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-4 shadow-md"
            >
              <div className="flex items-center gap-3.5">
                {ev.posterUrl ? (
                  <img
                    src={ev.posterUrl}
                    alt={ev.title}
                    referrerPolicy="no-referrer"
                    className="w-12 h-16 object-cover rounded-lg shrink-0"
                  />
                ) : (
                  <div className="w-12 h-16 bg-zinc-800 rounded-lg flex items-center justify-center text-xs text-zinc-400 shrink-0">
                    <Film className="w-4 h-4" />
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">{ev.title}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono mt-1 inline-block">
                    {ev.type}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <p className="text-xs font-bold text-purple-300 font-mono">
                  {new Date(ev.releaseDate).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                <span className="text-[10px] text-zinc-400">Дата премьеры</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center space-y-3 bg-zinc-900/30 rounded-2xl border border-zinc-800 p-8">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
            <CalendarDays className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-200 font-mono">
            В ближайшее время нет запланированных релизов
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Добавляйте ожидаемые тайтлы в статус «Буду смотреть» или «В планах», чтобы видеть даты выхода!
          </p>
        </div>
      )}
    </div>
  );
};
