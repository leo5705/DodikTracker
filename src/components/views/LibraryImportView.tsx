import React, { useState, useRef } from 'react';
import { Upload, ArrowLeft, Loader2, FileJson, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface Props {
  onBack: () => void;
}

export const LibraryImportView: React.FC<Props> = ({ onBack }) => {
  const { authFetch } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [fileData, setFileData] = useState<any | null>(null);
  const [previewData, setPreviewData] = useState<any | null>(null);
  
  const [importStrategy, setImportStrategy] = useState<'all' | 'new' | 'update'>('all');
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        
        let parsedLibrary: any[] = [];
        
        if (file.name.endsWith('.json')) {
           const json = JSON.parse(content);
           if (json.format === 'dodik-tracker' && json.library) {
              parsedLibrary = json.library;
           } else if (Array.isArray(json)) {
              // Try Watcharr parsing
              // Watcharr exports an array of items
              parsedLibrary = json.map((item: any) => {
                 let status = 'PLAN_TO_WATCH';
                 if (item.status === 'FINISHED') status = 'COMPLETED';
                 if (item.status === 'WATCHING') status = 'WATCHING';
                 if (item.status === 'DROPPED') status = 'DROPPED';
                 
                 const externalIds: any[] = [];
                 if (item.content?.tmdbId) externalIds.push({ provider: 'TMDB', externalId: String(item.content.tmdbId) });
                 if (item.content?.imdb_id) externalIds.push({ provider: 'IMDB', externalId: String(item.content.imdb_id) });
                 
                 let type = 'MOVIE';
                 if (item.content?.type === 'tv') type = 'TV';
                 if (item.content?.type === 'anime') type = 'ANIME';
                 if (item.content?.type === 'game') type = 'GAME';
                 
                 let posterUrl = null;
                 let backdropUrl = null;
                 if (item.content?.poster_path) {
                    posterUrl = `https://image.tmdb.org/t/p/w500${item.content.poster_path}`;
                 }
                 if (item.content?.backdrop_path) {
                    backdropUrl = `https://image.tmdb.org/t/p/w1280${item.content.backdrop_path}`;
                 }
                 if (!backdropUrl && posterUrl) backdropUrl = posterUrl;

                 return {
                    media: {
                       title: item.content?.title || item.title,
                       year: item.content?.release_date ? parseInt(item.content.release_date.substring(0, 4)) : null,
                       type,
                       posterUrl,
                       backdropUrl,
                       externalIds
                    },
                    userMedia: {
                       status,
                       rating: item.rating ? (item.rating > 10 ? 10 : item.rating) : null,
                       notes: item.thoughts || item.review || ''
                    }
                 };
              });
           } else {
              throw new Error('Неизвестный JSON формат.');
           }
        } else if (file.name.endsWith('.csv')) {
           // Basic Yamtrack / CSV parser
           const lines = content.split('\n').filter(l => l.trim().length > 0);
           const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
           
           for (let i = 1; i < lines.length; i++) {
              const parts = lines[i].split(',').map(p => p.replace(/^"|"$/g, '').trim());
              const row: Record<string, string> = {};
              headers.forEach((h, idx) => {
                 row[h] = parts[idx];
              });
              
              let status = 'COMPLETED';
              if (row.status && row.status.toLowerCase().includes('watch')) status = 'WATCHING';
              if (row.status && row.status.toLowerCase().includes('plan')) status = 'PLAN_TO_WATCH';
              if (row.status && row.status.toLowerCase().includes('drop')) status = 'DROPPED';
              
              let type = 'MOVIE';
              if (row.type && row.type.toLowerCase().includes('tv')) type = 'TV';
              if (row.type && row.type.toLowerCase().includes('anime')) type = 'ANIME';
              if (row.type && row.type.toLowerCase().includes('game')) type = 'GAME';
              
              let rating = row.rating ? parseFloat(row.rating) : null;
              // if out of 5, scale to 10
              if (rating && rating <= 5 && !row.rating.includes('/10')) rating = rating * 2;
              
              parsedLibrary.push({
                 media: {
                    title: row.title || row.name,
                    year: row.year ? parseInt(row.year) : null,
                    type
                 },
                 userMedia: {
                    status,
                    rating,
                    notes: row.notes || row.review || ''
                 }
              });
           }
        } else {
           throw new Error('Неподдерживаемый формат файла. Доступен только .json и .csv');
        }
        
        if (parsedLibrary.length === 0) {
           throw new Error('Файл пуст или имеет неверный формат.');
        }
        
        setFileData(parsedLibrary);
        await previewImport(parsedLibrary);
        
      } catch (err: any) {
         console.error('File parsing error:', err);
         setError(err.message || 'Ошибка обработки файла');
      }
    };
    reader.readAsText(file);
    
    // Reset input
    e.target.value = '';
  };
  
  const previewImport = async (library: any[]) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/library-sync/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ library })
      });
      if (!res.ok) throw new Error('Ошибка связи с сервером при анализе');
      
      const data = await res.json();
      setPreviewData(data);
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка при анализе импорта');
    } finally {
      setLoading(false);
    }
  };
  
  const executeImport = async () => {
    if (!previewData) return;
    setImporting(true);
    setError(null);
    
    try {
       const res = await authFetch('/api/library-sync/import/execute', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ 
            items: previewData.matchedItems.concat(previewData.notFoundItems), 
            strategy: importStrategy 
         })
       });
       if (!res.ok) throw new Error('Ошибка применения импорта');
       
       setImportSuccess(true);
    } catch (err: any) {
       setError(err.message || 'Произошла ошибка при импорте');
    } finally {
       setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Импорт медиа</h1>
          <p className="text-sm text-zinc-400">
            Загрузите файл из другого сервиса для быстрого восстановления библиотеки.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-900/50 text-red-400 text-sm flex gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {importSuccess ? (
        <div className="p-8 rounded-2xl bg-emerald-950/20 border border-emerald-900/50 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-950/50 border border-emerald-800 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-emerald-400">Импорт успешно завершён</h2>
          <p className="text-zinc-400 text-sm">Ваша библиотека была обновлена.</p>
          <button
            onClick={onBack}
            className="px-6 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium mt-4 inline-block"
          >
            Вернуться в библиотеку
          </button>
        </div>
      ) : !previewData ? (
        <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 text-center space-y-6">
           <div className="w-16 h-16 rounded-2xl bg-purple-950/30 border border-purple-800/30 flex items-center justify-center mx-auto text-purple-400">
             <FileJson className="w-8 h-8" />
           </div>
           <div>
             <h3 className="font-bold text-zinc-200 text-lg">Загрузите файл импорта</h3>
             <p className="text-xs text-zinc-400 mt-2 max-w-sm mx-auto">
               Поддерживаются оригинальный Dodik Tracker JSON и массивы Watcharr (JSON). Также поддерживаются Yamtrack и CSV..
             </p>
           </div>
           
           <input
             type="file"
             accept=".json,.csv"
             className="hidden"
             ref={fileInputRef}
             onChange={handleFileUpload}
           />
           
           <button
             onClick={() => fileInputRef.current?.click()}
             disabled={loading}
             className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold shadow-lg shadow-purple-900/20 disabled:opacity-50 transition-all"
           >
             {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
             Выбрать файл
           </button>
        </div>
      ) : (
        <div className="space-y-6">
           {/* Preview Results */}
           <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-6">
              <h3 className="font-bold text-lg text-zinc-200 border-b border-zinc-800 pb-3">Результаты анализа</h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                  <div className="text-2xl font-black text-zinc-100">{previewData.total}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mt-1">Всего найдено</div>
                </div>
                <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-900/30 text-center">
                  <div className="text-2xl font-black text-purple-400">{previewData.matched}</div>
                  <div className="text-[10px] text-purple-500/70 uppercase tracking-wider font-bold mt-1">Совпало (БД)</div>
                </div>
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/30 text-center">
                  <div className="text-2xl font-black text-emerald-400">{previewData.added}</div>
                  <div className="text-[10px] text-emerald-500/70 uppercase tracking-wider font-bold mt-1">Новые для вас</div>
                </div>
                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-900/30 text-center">
                  <div className="text-2xl font-black text-amber-400">{previewData.conflicts}</div>
                  <div className="text-[10px] text-amber-500/70 uppercase tracking-wider font-bold mt-1">Уже в библиотеке</div>
                </div>
              </div>
              
              {previewData.notFound > 0 && (
                <div className="p-3 rounded-lg bg-red-950/20 border border-red-900/30 text-red-400 text-xs flex gap-2 items-start">
                   <Info className="w-4 h-4 shrink-0 mt-0.5" />
                   <div>
                     <span className="font-bold">{previewData.notFound} тайтлов</span> не удалось сопоставить с базой Dodik Tracker. 
                     При импорте они будут добавлены как новые (по названию).
                   </div>
                </div>
              )}
           </div>
           
           {/* Strategy Selection */}
           <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-4">
              <h3 className="font-bold text-zinc-200">Режим импорта</h3>
              
              <div className="space-y-2">
                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-zinc-800/50 ${importStrategy === 'all' ? 'border-purple-500 bg-purple-950/10' : 'border-zinc-800'}`}
                       onClick={() => setImportStrategy('all')}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${importStrategy === 'all' ? 'border-purple-500' : 'border-zinc-600'}`}>
                    {importStrategy === 'all' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-zinc-200">Импортировать всё (с заменой)</div>
                    <div className="text-xs text-zinc-500">Добавит новые и обновит существующие тайтлы данными из файла.</div>
                  </div>
                </label>
                
                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-zinc-800/50 ${importStrategy === 'new' ? 'border-purple-500 bg-purple-950/10' : 'border-zinc-800'}`}
                       onClick={() => setImportStrategy('new')}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${importStrategy === 'new' ? 'border-purple-500' : 'border-zinc-600'}`}>
                    {importStrategy === 'new' && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-zinc-200">Только новые</div>
                    <div className="text-xs text-zinc-500">Добавит только те тайтлы, которых ещё нет в вашей библиотеке. Конфликты будут пропущены.</div>
                  </div>
                </label>
              </div>
              
              <div className="pt-4 flex items-center justify-between">
                 <button
                   onClick={() => setPreviewData(null)}
                   className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
                 >
                   Отмена
                 </button>
                 <button
                   onClick={executeImport}
                   disabled={importing || (previewData.matched === 0 && previewData.notFound === 0)}
                   className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold shadow-lg shadow-purple-900/20 disabled:opacity-50 transition-all"
                 >
                   {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                   Начать импорт
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};