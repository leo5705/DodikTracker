import React, { useState, useEffect } from 'react';
import { useRouter } from '../../context/RouterContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useMusicPlayer } from '../../context/MusicPlayerContext.tsx';
import { MusicNav } from '../music/MusicNav.tsx';
import {
  ListMusic,
  ArrowLeft,
  Upload,
  FileText,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Loader2,
  Sparkles,
  Save,
  Music2,
  ExternalLink,
  Users,
  User,
  Globe,
  Lock,
  Link as LinkIcon,
  RefreshCw,
  Info,
  Plus,
} from 'lucide-react';

interface MatchedTrack {
  kind: 'dodik';
  id: number;
  numericTrackId: number;
  title: string;
  artistName: string;
  artistSlug?: string;
  releaseTitle?: string;
  coverUrl?: string | null;
  duration?: number | null;
  source: 'dodik';
}

interface ParsedLine {
  rawLine: string;
  artist: string;
  title: string;
  album?: string;
  matched: boolean;
  reason?: string;
  track: MatchedTrack | null;
}

interface ExistingPlaylistOption {
  id: number;
  title: string;
  tracksCount: number;
  visibility: string;
  cover: string | null;
}

export const MusicPlaylistImportView: React.FC = () => {
  const { navigate, goBack } = useRouter();
  const { authFetch, dbUser } = useAuth();
  const { playTrack, currentTrack, isPlaying } = useMusicPlayer();

  // Wizard state: 1: Input/Upload -> 2: Preview & Configure -> 3: Complete Summary
  const [step, setStep] = useState<'input' | 'preview' | 'summary'>('input');

  const [inputText, setInputText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsing, setParsing] = useState<boolean>(false);
  const [executing, setExecuting] = useState<boolean>(false);
  const [parsedResults, setParsedResults] = useState<ParsedLine[]>([]);
  const [unmatchedTracks, setUnmatchedTracks] = useState<Array<{ artist: string; title: string; reason: string; rawLine: string }>>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [matchedCount, setMatchedCount] = useState<number>(0);
  const [unmatchedCount, setUnmatchedCount] = useState<number>(0);

  // Preview tab filter
  const [previewFilter, setPreviewFilter] = useState<'all' | 'matched' | 'unmatched'>('all');

  // Destination configuration
  const [importTarget, setImportTarget] = useState<'new' | 'existing'>('new');
  const [selectedExistingPlaylistId, setSelectedExistingPlaylistId] = useState<number | null>(null);
  const [myPlaylists, setMyPlaylists] = useState<ExistingPlaylistOption[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState<boolean>(false);

  // New Playlist details state
  const [playlistTitle, setPlaylistTitle] = useState<string>('');
  const [playlistDesc, setPlaylistDescription] = useState<string>('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>('PUBLIC');
  const [isCollaborative, setIsCollaborative] = useState<boolean>(false);

  // Execution result state
  const [successPlaylistId, setSuccessPlaylistId] = useState<number | null>(null);
  const [addedTracksCount, setAddedTracksCount] = useState<number>(0);
  const [skippedTracksCount, setSkippedTracksCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Load user playlists for "add to existing" option
  useEffect(() => {
    if (dbUser) {
      setLoadingPlaylists(true);
      authFetch('/api/music/playlists/my?limit=50')
        .then((res) => (res.ok ? res.json() : { playlists: [] }))
        .then((data) => {
          setMyPlaylists(data.playlists || []);
          if (data.playlists && data.playlists.length > 0) {
            setSelectedExistingPlaylistId(data.playlists[0].id);
          }
        })
        .catch((err) => console.error('Error fetching user playlists:', err))
        .finally(() => setLoadingPlaylists(false));
    }
  }, [dbUser, authFetch]);

  // Handle file upload (.txt, .csv, .tsv, .json)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setInputText(text);
        // Pre-fill playlist title from file name without extension
        const cleanName = file.name.replace(/\.[^/.]+$/, '');
        if (cleanName) {
          setPlaylistTitle(cleanName);
        }
      }
    };
    reader.readAsText(file);
  };

  // Parse playlist text/file
  const handleParse = async () => {
    if (!inputText.trim()) {
      setError('Пожалуйста, вставьте список треков или загрузите файл');
      return;
    }

    setParsing(true);
    setError(null);

    try {
      const res = await authFetch('/api/music/playlists/import/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: inputText }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось распознать плейлист. Пожалуйста, проверьте формат файла.');
      }

      setParsedResults(data.tracks || []);
      setUnmatchedTracks(data.unmatchedTracks || []);
      setTotalCount(data.total || 0);
      setMatchedCount(data.matchedCount || 0);
      setUnmatchedCount(data.unmatchedCount || 0);

      // Default title if still empty
      if (!playlistTitle) {
        const dateStr = new Date().toLocaleDateString('ru-RU');
        setPlaylistTitle(`Импортированный плейлист (${dateStr})`);
      }

      setStep('preview');
    } catch (err: any) {
      setError(err.message || 'Ошибка при распознавании плейлиста');
    } finally {
      setParsing(false);
    }
  };

  // Play preview track
  const handlePlayPreview = (track: MatchedTrack) => {
    const playerTrack = {
      id: track.id,
      source: 'dodik',
      title: track.title,
      artistName: track.artistName,
      releaseTitle: track.releaseTitle || 'Сингл',
      releaseCover: track.coverUrl || null,
      thumbnail: track.coverUrl || null,
      duration: track.duration || null,
      explicit: false,
      playable: true,
    };

    playTrack(playerTrack as any, [playerTrack] as any, {
      title: track.releaseTitle || 'Сингл',
      cover: track.coverUrl || null,
      slug: '',
      artistName: track.artistName,
      artistSlug: track.artistSlug || '',
    });
  };

  // Execute import creation
  const handleExecuteImport = async () => {
    if (!dbUser) {
      setError('Для создания плейлиста необходимо авторизоваться');
      return;
    }

    if (importTarget === 'new' && !playlistTitle.trim()) {
      setError('Название нового плейлиста обязательно');
      return;
    }

    if (importTarget === 'existing' && !selectedExistingPlaylistId) {
      setError('Выберите существующий плейлист для добавления треков');
      return;
    }

    // Filter only matched local Dodik tracks
    const matchedTrackIds = parsedResults
      .filter((r) => r.matched && r.track && r.track.id)
      .map((r) => r.track!.id);

    if (matchedTrackIds.length === 0) {
      setError('В загруженном списке не найдено треков из каталога Dodik Tracker. Импорт не может быть выполнен без совпадающих треков.');
      return;
    }

    setExecuting(true);
    setError(null);

    try {
      const payload: Record<string, any> = {
        mode: importTarget === 'new' ? 'NEW' : 'EXISTING',
        trackIds: matchedTrackIds,
      };

      if (importTarget === 'new') {
        payload.title = playlistTitle.trim();
        payload.description = playlistDesc.trim() || undefined;
        payload.visibility = visibility;
        payload.isCollaborative = isCollaborative;
      } else {
        payload.playlistId = selectedExistingPlaylistId;
      }

      const res = await authFetch('/api/music/playlists/import/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при сохранении плейлиста.');
      }

      setSuccessPlaylistId(data.playlistId);
      setAddedTracksCount(data.added || matchedTrackIds.length);
      setSkippedTracksCount(data.skipped || 0);
      setStep('summary');
    } catch (err: any) {
      setError(err.message || 'Ошибка импорта плейлиста');
    } finally {
      setExecuting(false);
    }
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const filteredPreviewTracks = parsedResults.filter((item) => {
    if (previewFilter === 'matched') return item.matched;
    if (previewFilter === 'unmatched') return !item.matched;
    return true;
  });

  return (
    <div className="space-y-6 pb-24 max-w-5xl mx-auto">
      <MusicNav activeTab="playlists" />

      {/* Header card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-[#11152A] border border-[#1E2442]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (step === 'preview') setStep('input');
              else if (step === 'summary') setStep('input');
              else goBack();
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition text-xs font-semibold backdrop-blur-md cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Назад
          </button>

          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <ListMusic className="w-5 h-5 text-purple-400" />
              <span>Импорт плейлиста</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Импортируйте треки из Яндекс Музыки (YMusicExport), TXT, CSV или JSON файлов
            </p>
          </div>
        </div>

        {/* Wizard Steps indicator */}
        <div className="flex items-center gap-2 bg-[#090A17] p-1.5 rounded-2xl border border-[#1E2442] text-xs font-semibold">
          <span
            className={`px-3 py-1 rounded-xl transition ${
              step === 'input'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400'
            }`}
          >
            1. Файл / Текст
          </span>
          <span className="text-slate-600">→</span>
          <span
            className={`px-3 py-1 rounded-xl transition ${
              step === 'preview'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400'
            }`}
          >
            2. Анализ и Превью
          </span>
          <span className="text-slate-600">→</span>
          <span
            className={`px-3 py-1 rounded-xl transition ${
              step === 'summary'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400'
            }`}
          >
            3. Результат
          </span>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3 animate-in fade-in">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
          <div className="space-y-0.5">
            <h5 className="font-bold text-rose-200">Ошибка</h5>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 1: INPUT / FILE UPLOAD & YMUSICEXPORT HELPER BANNER */}
      {/* ========================================================================= */}
      {step === 'input' && (
        <div className="space-y-6">
          {/* YMusicExport Helper Card */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-[#191438] via-[#10132B] to-[#0A0D1F] border border-purple-500/30 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold font-mono uppercase">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  Яндекс Музыка экспорт
                </div>
                <h3 className="text-base md:text-lg font-bold text-white">
                  Не знаете, как получить список треков из Яндекс Музыки?
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Для экспорта плейлиста из Яндекс Музыки можно использовать сторонний сервис{' '}
                  <strong className="text-purple-300">YMusicExport</strong>. После завершения экспорта скачайте полученный файл (TXT или CSV) и загрузите его сюда.
                </p>
                <p className="text-[11px] text-slate-400">
                  ⚠️ <span className="font-medium">Примечание:</span> YMusicExport является независимым сторонним инструментом и не является официальным сервисом Яндекс Музыки.
                </p>
              </div>

              <a
                href="https://ymusicexport.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-purple-600/30 cursor-pointer hover:scale-102"
              >
                <span>Экспортировать из Яндекс Музыки</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Main Upload Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            {/* Left Col: Upload Card (2 cols) */}
            <div className="lg:col-span-2 space-y-4 bg-[#0F1123] border border-[#1E2442] p-6 rounded-3xl shadow-xl">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-purple-400" />
                  <span>Загрузка файла</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Поддерживаются форматы <span className="text-purple-300 font-mono font-bold">.TXT</span>, <span className="text-purple-300 font-mono font-bold">.CSV</span>, <span className="text-purple-300 font-mono font-bold">.TSV</span> и <span className="text-purple-300 font-mono font-bold">.JSON</span>.
                </p>
              </div>

              {/* File dropzone */}
              <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#1E2442] hover:border-purple-500/50 rounded-2xl cursor-pointer hover:bg-purple-950/10 transition group text-center">
                <Upload className="w-8 h-8 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-slate-200">
                  {fileName ? fileName : 'Выберите или перетащите файл'}
                </span>
                <span className="text-[10px] text-slate-500 mt-1">
                  TXT, CSV (Яндекс Музыка экспорт), TSV, JSON
                </span>
                <input
                  type="file"
                  accept=".txt,.csv,.tsv,.json,text/plain,text/csv,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {/* Format hints */}
              <div className="p-4 rounded-2xl bg-[#080A18] border border-[#1E2442] text-[11px] text-slate-400 space-y-2">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-purple-400" />
                  <span>Поддерживаемые форматы:</span>
                </div>
                <div className="font-mono text-[10px] space-y-1 text-slate-400">
                  <div>• Исполнитель - Название трека</div>
                  <div>• Исполнитель: Название (Альбом)</div>
                  <div>• CSV файл с заголовками или без</div>
                  <div>• JSON список объектов</div>
                </div>
              </div>
            </div>

            {/* Right Col: Textarea Paste Card (3 cols) */}
            <div className="lg:col-span-3 space-y-4 bg-[#0F1123] border border-[#1E2442] p-6 rounded-3xl shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-400" />
                    <span>Текст плейлиста</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Или просто вставьте список треков в поле ниже
                  </p>
                </div>

                {inputText && (
                  <button
                    onClick={() => {
                      setInputText('');
                      setFileName('');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition cursor-pointer"
                  >
                    Очистить
                  </button>
                )}
              </div>

              <textarea
                rows={12}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Вставьте список треков сюда...&#10;Например:&#10;Morgenshtern - Cadillac&#10;Макс Корж - 2 типа людей&#10;Linkin Park - Numb"
                className="w-full p-4 rounded-2xl bg-[#080A18] border border-[#1E2442] text-xs text-white placeholder-slate-600 font-mono focus:outline-none focus:border-purple-500 transition focus:ring-1 focus:ring-purple-500/20 custom-scrollbar"
              />

              <button
                onClick={handleParse}
                disabled={parsing || !inputText.trim()}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-600/25"
              >
                {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{parsing ? 'Распознавание треков...' : 'Анализировать и перейти к превью'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: PREVIEW & CONFIGURE IMPORT */}
      {/* ========================================================================= */}
      {step === 'preview' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* Left Side: Destination & Playlist Options (2 cols) */}
          <div className="lg:col-span-2 space-y-5 bg-[#0F1123] border border-[#1E2442] p-6 rounded-3xl shadow-xl">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Save className="w-4 h-4 text-purple-400" />
                <span>Параметры импорта</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Куда сохранить распознанные треки
              </p>
            </div>

            {/* Target mode toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setImportTarget('new')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  importTarget === 'new'
                    ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20'
                    : 'bg-[#090C1B] border-[#1E2442] text-slate-400 hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Новый плейлист</span>
              </button>

              <button
                type="button"
                onClick={() => setImportTarget('existing')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  importTarget === 'existing'
                    ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20'
                    : 'bg-[#090C1B] border-[#1E2442] text-slate-400 hover:text-white'
                }`}
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span>В существующий</span>
              </button>
            </div>

            {importTarget === 'new' ? (
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200">
                    Название плейлиста <span className="text-purple-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={playlistTitle}
                    onChange={(e) => setPlaylistTitle(e.target.value)}
                    placeholder="Введите название..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200">
                    Описание <span className="text-slate-500 font-normal text-[11px]">(опционально)</span>
                  </label>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={playlistDesc}
                    onChange={(e) => setPlaylistDescription(e.target.value)}
                    placeholder="Краткое описание коллекции..."
                    className="w-full px-3.5 py-2 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 custom-scrollbar"
                  />
                </div>

                {/* Who can add tracks (Collaboration Setting) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                    <span>Кто может добавлять треки</span>
                    <span className="text-purple-400 text-[10px] font-mono uppercase">Совместный доступ</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCollaborative(false)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                        !isCollaborative
                          ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                          : 'bg-[#080A18] border-[#1E2442] text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <User className="w-3.5 h-3.5 text-purple-400" />
                        <span>Только я</span>
                      </div>
                      <span className="text-[10px] text-slate-400 leading-tight">Личный плейлист</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCollaborative(true)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                        isCollaborative
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200'
                          : 'bg-[#080A18] border-[#1E2442] text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Участники</span>
                      </div>
                      <span className="text-[10px] text-slate-400 leading-tight">Совместный плейлист</span>
                    </button>
                  </div>
                </div>

                {/* Visibility */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200">Уровень видимости</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setVisibility('PUBLIC')}
                      className={`p-2 rounded-xl text-[11px] font-bold border flex items-center justify-center gap-1 transition cursor-pointer ${
                        visibility === 'PUBLIC'
                          ? 'bg-purple-600 text-white border-purple-500'
                          : 'bg-[#080A18] border-[#1E2442] text-slate-400 hover:text-white'
                      }`}
                    >
                      <Globe className="w-3 h-3" />
                      <span>Публичный</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVisibility('UNLISTED')}
                      className={`p-2 rounded-xl text-[11px] font-bold border flex items-center justify-center gap-1 transition cursor-pointer ${
                        visibility === 'UNLISTED'
                          ? 'bg-cyan-600 text-white border-cyan-500'
                          : 'bg-[#080A18] border-[#1E2442] text-slate-400 hover:text-white'
                      }`}
                    >
                      <LinkIcon className="w-3 h-3" />
                      <span>По ссылке</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVisibility('PRIVATE')}
                      className={`p-2 rounded-xl text-[11px] font-bold border flex items-center justify-center gap-1 transition cursor-pointer ${
                        visibility === 'PRIVATE'
                          ? 'bg-amber-600 text-white border-amber-500'
                          : 'bg-[#080A18] border-[#1E2442] text-slate-400 hover:text-white'
                      }`}
                    >
                      <Lock className="w-3 h-3" />
                      <span>Приватный</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-slate-200">Выберите плейлист</label>
                {loadingPlaylists ? (
                  <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    <span>Загрузка плейлистов...</span>
                  </div>
                ) : myPlaylists.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-slate-400 text-center">
                    У вас пока нет плейлистов. Создайте новый плейлист с помощью опции выше.
                  </div>
                ) : (
                  <select
                    value={selectedExistingPlaylistId || ''}
                    onChange={(e) => setSelectedExistingPlaylistId(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#080A18] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    {myPlaylists.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.title} ({pl.tracksCount} треков)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Catalog info note */}
            <div className="p-3.5 rounded-2xl bg-[#080A18] border border-[#1E2442] text-[11px] text-slate-400 space-y-1">
              <div className="font-bold text-slate-300">Сопоставление с каталогом Dodik Tracker:</div>
              <p className="leading-relaxed">
                В базу данных будут добавлены только треки, найденные в верифицированном каталоге Dodik Tracker (<span className="text-emerald-400 font-bold">{matchedCount} из {totalCount}</span>). Не найденные треки не создают ложных записей.
              </p>
            </div>

            {/* Execute Import Button */}
            <button
              onClick={handleExecuteImport}
              disabled={executing || matchedCount === 0 || (importTarget === 'new' && !playlistTitle.trim())}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-slate-950 text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/20"
            >
              {executing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
              )}
              <span>
                {executing
                  ? 'Сохранение плейлиста...'
                  : `Импортировать найденные треки (${matchedCount})`}
              </span>
            </button>
          </div>

          {/* Right Side: Detailed Matching Preview List (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Header / Stats row */}
            <div className="p-4 rounded-3xl bg-[#0F1123] border border-[#1E2442] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xl">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPreviewFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    previewFilter === 'all'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                      : 'bg-[#080A18] text-slate-400 hover:text-white'
                  }`}
                >
                  Все ({totalCount})
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewFilter('matched')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    previewFilter === 'matched'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'bg-[#080A18] text-emerald-400 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Найдено ({matchedCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewFilter('unmatched')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    previewFilter === 'unmatched'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                      : 'bg-[#080A18] text-rose-400 hover:text-white'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Не найдено ({unmatchedCount})</span>
                </button>
              </div>

              <span className="text-[11px] font-mono text-slate-400 self-end sm:self-auto">
                Совпадение: {totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 0}%
              </span>
            </div>

            {/* List */}
            <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1 custom-scrollbar">
              {filteredPreviewTracks.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-2xl border transition flex items-center justify-between gap-4 ${
                    item.matched
                      ? 'bg-[#090A17]/80 border-[#1E2442] hover:bg-[#151932]/30'
                      : 'bg-rose-950/10 border-rose-900/30'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.matched && item.track ? (
                      <div className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-[#1E2442] bg-slate-950">
                        {item.track.coverUrl ? (
                          <img
                            src={item.track.coverUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500">
                            <Music2 className="w-5 h-5" />
                          </div>
                        )}
                        <button
                          onClick={() => handlePlayPreview(item.track!)}
                          className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                        >
                          {currentTrack && currentTrack.id === item.track.id && isPlaying ? (
                            <Pause className="w-4 h-4 fill-white" />
                          ) : (
                            <Play className="w-4 h-4 fill-white" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-xl border border-rose-500/20 bg-rose-500/10 flex items-center justify-center text-rose-400 shrink-0">
                        <HelpCircle className="w-5 h-5" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-mono">#{idx + 1}</span>
                        <span className="text-xs font-semibold text-slate-300 truncate">
                          {item.rawLine}
                        </span>
                      </div>

                      {item.matched && item.track ? (
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs font-bold text-white truncate max-w-[200px]">
                            {item.track.title}
                          </span>
                          <span className="text-[11px] text-slate-400">·</span>
                          <span className="text-xs font-semibold text-purple-300 truncate max-w-[150px]">
                            {item.track.artistName}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-rose-400/90 mt-0.5 font-medium">
                          {item.reason || 'Трек отсутствует в каталоге Dodik Tracker'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="shrink-0 font-mono text-[10px] font-bold">
                    {item.matched && item.track ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Найдено
                        </span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          {formatDuration(item.track.duration)}
                        </span>
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 uppercase">
                        Не найдено
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: SUMMARY & FINAL REPORT */}
      {/* ========================================================================= */}
      {step === 'summary' && (
        <div className="space-y-6">
          <div className="p-8 rounded-3xl bg-gradient-to-br from-[#10241A] via-[#0D1822] to-[#0A0D1F] border border-emerald-500/30 shadow-2xl space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-black text-white">Импорт плейлиста завершён!</h3>
                <p className="text-xs text-slate-300">
                  Все найденные треки были успешно импортированы и сохранены в вашей коллекции.
                </p>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-4 rounded-2xl bg-[#080A18]/80 border border-[#1E2442] space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Всего в файле</span>
                <div className="text-xl font-black text-white font-mono">{totalCount}</div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-400 font-mono">Найдено в каталоге</span>
                <div className="text-xl font-black text-emerald-300 font-mono">{matchedCount}</div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-300 font-mono">Импортировано</span>
                <div className="text-xl font-black text-emerald-200 font-mono">{addedTracksCount}</div>
              </div>

              <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-1">
                <span className="text-[10px] uppercase font-bold text-rose-400 font-mono">Не найдено</span>
                <div className="text-xl font-black text-rose-300 font-mono">{unmatchedCount}</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 flex-wrap">
              {successPlaylistId && (
                <button
                  onClick={() => navigate(`/music/playlist/${successPlaylistId}`)}
                  className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs transition flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/30 hover:scale-102"
                >
                  <ListMusic className="w-4 h-4" />
                  <span>Перейти к плейлисту</span>
                </button>
              )}

              <button
                onClick={() => {
                  setStep('input');
                  setInputText('');
                  setFileName('');
                  setParsedResults([]);
                  setUnmatchedTracks([]);
                }}
                className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Импортировать ещё один плейлист</span>
              </button>
            </div>
          </div>

          {/* Unmatched Tracks Report Section */}
          {unmatchedTracks.length > 0 && (
            <div className="p-6 rounded-3xl bg-[#0F1123] border border-[#1E2442] space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Список не найденных треков ({unmatchedTracks.length})</span>
                </h4>
                <span className="text-[11px] text-slate-400">
                  Треки отсутствуют в каталоге Dodik Tracker
                </span>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                {unmatchedTracks.map((unm, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#080A18] border border-rose-500/20 flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">{unm.title}</div>
                      <div className="text-slate-400 text-[11px] truncate mt-0.5">
                        {unm.artist || 'Неизвестный исполнитель'}
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium text-[10px] shrink-0">
                      {unm.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
