import React, { useState } from 'react';
import { Download, ArrowLeft, Loader2, FileJson, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface Props {
  onBack: () => void;
}

export const LibraryExportView: React.FC<Props> = ({ onBack }) => {
  const { authFetch } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportJson = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch('/api/library-sync/export');
      if (!res.ok) throw new Error('Failed to fetch export data');
      const data = await res.json();
      
      downloadFile(JSON.stringify(data, null, 2), `dodik_tracker_export_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch('/api/library-sync/export');
      if (!res.ok) throw new Error('Failed to fetch export data');
      const data = await res.json();
      
      const csvRows = [];
      const headers = ['Title', 'Type', 'Year', 'Status', 'Progress', 'Rating', 'Favorite', 'Notes', 'Start Date', 'End Date'];
      csvRows.push(headers.join(','));
      
      for (const item of data.library || []) {
         const m = item.media || {};
         const u = item.userMedia || {};
         const row = [
            `"${(m.title || '').replace(/"/g, '""')}"`,
            m.type || '',
            m.year || '',
            u.status || '',
            u.progress || 0,
            u.rating || '',
            u.isFavorite ? 'Yes' : 'No',
            `"${(u.notes || '').replace(/"/g, '""')}"`,
            u.startedAt || '',
            u.completedAt || ''
         ];
         csvRows.push(row.join(','));
      }
      
      downloadFile(csvRows.join('\n'), `dodik_tracker_export_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-zinc-100 font-mono tracking-tight flex items-center gap-2">
            <Download className="w-6 h-6 text-purple-400" />
            ЭКСПОРТ БИБЛИОТЕКИ
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Скачайте свои данные в форматах Dodik JSON или CSV.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-900/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Dodik JSON */}
        <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-950/60 border border-purple-800/40 flex items-center justify-center text-purple-400">
            <FileJson className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-zinc-200">Dodik Tracker JSON</h3>
            <p className="text-xs text-zinc-400 mt-1">Полный бэкап библиотеки, включая рецензии, оценки, списки и метаданные.</p>
          </div>
          <button
            onClick={handleExportJson}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold shadow-lg shadow-purple-900/20 disabled:opacity-50 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Скачать JSON
          </button>
        </div>

        {/* CSV */}
        <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-950/60 border border-blue-800/40 flex items-center justify-center text-blue-400">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-zinc-200">CSV Export</h3>
            <p className="text-xs text-zinc-400 mt-1">Упрощенный формат (только библиотека и оценки) для таблиц Excel/Google.</p>
          </div>
          <button
            onClick={handleExportCsv}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-900/20 disabled:opacity-50 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Скачать CSV
          </button>
        </div>
      </div>
    </div>
  );
};
