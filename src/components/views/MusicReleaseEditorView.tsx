import React, { useState, useEffect, useRef } from 'react';
import {
  Disc,
  ListMusic,
  CheckCircle2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Send,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Clock,
  Image as ImageIcon,
  Sparkles,
  Loader2,
  Info,
  Check,
  Upload,
  FileAudio,
  Play,
  Pause,
  RefreshCw,
  Volume2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';

interface Genre {
  id: number;
  name: string;
  slug: string;
}

interface EditorTrack {
  id?: number;
  title: string;
  trackNumber: number;
  audioFile: string;
  originalAudioName?: string;
  duration: number | string; // seconds or formatted string
  lyrics: string;
  authorNote: string;
  explicit: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadError?: string | null;
}

interface MusicReleaseEditorProps {
  mode: 'new' | 'edit';
  releaseId?: string;
}

/**
 * Uploads a file using XMLHttpRequest to track live upload progress %
 */
const uploadFileWithProgress = (
  endpoint: string,
  fieldName: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<{ url: string; originalName: string; size: number }> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append(fieldName, file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res);
        } catch {
          reject(new Error('Некорректный ответ сервера'));
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          reject(new Error(res.error || `Ошибка загрузки (${xhr.status})`));
        } catch {
          reject(new Error(`Ошибка загрузки (${xhr.status})`));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Сетевая ошибка при загрузке файла'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Загрузка отменена'));
    });

    xhr.open('POST', endpoint);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
};

/**
 * Calculates audio duration in seconds using HTML5 Audio element metadata
 */
const calculateAudioDuration = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;

    audio.addEventListener('loadedmetadata', () => {
      const dur = Math.round(audio.duration || 0);
      URL.revokeObjectURL(objectUrl);
      resolve(dur);
    });

    audio.addEventListener('error', () => {
      URL.revokeObjectURL(objectUrl);
      resolve(0);
    });
  });
};

export const MusicReleaseEditorView: React.FC<MusicReleaseEditorProps> = ({
  mode,
  releaseId,
}) => {
  const { authFetch, dbUser } = useAuth();
  const { navigate } = useRouter();

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(mode === 'edit');
  const [availableGenres, setAvailableGenres] = useState<Genre[]>([]);

  // Step 1 State: Basic Info
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'SINGLE' | 'EP' | 'ALBUM'>('SINGLE');
  const [description, setDescription] = useState('');
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [cover, setCover] = useState('');
  const [coverMode, setCoverMode] = useState<'upload' | 'url'>('upload');
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [coverProgress, setCoverProgress] = useState(0);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverFileName, setCoverFileName] = useState<string | null>(null);
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>([]);

  // Step 2 State: Tracks
  const [tracks, setTracks] = useState<EditorTrack[]>([
    {
      title: '',
      trackNumber: 1,
      audioFile: '',
      duration: '',
      lyrics: '',
      authorNote: '',
      explicit: false,
    },
  ]);

  // Saving state
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [artistProfile, setArtistProfile] = useState<any>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);

  // Fetch Genres & Artist Profile & Existing Release
  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
      try {
        // Genres
        const genRes = await authFetch('/api/music/genres');
        if (genRes.ok && isMounted) {
          const gData = await genRes.json();
          setAvailableGenres(gData.genres || []);
        }

        // Artist Stats / Profile
        const stRes = await authFetch('/api/music/studio/stats');
        if (stRes.ok && isMounted) {
          const stData = await stRes.json();
          setArtistProfile(stData.artist);
        }

        // Existing release data for Edit mode
        if (mode === 'edit' && releaseId) {
          const relRes = await authFetch(`/api/music/releases/${releaseId}`);
          if (relRes.ok && isMounted) {
            const data = await relRes.json();
            const rel = data.release;
            setTitle(rel.title || '');
            setType(rel.type || 'SINGLE');
            setDescription(rel.description || '');
            setReleaseDate(rel.releaseDate || '');
            setCover(rel.cover || '');
            if (rel.cover) setCoverMode('upload');

            if (data.genres) {
              setSelectedGenreIds(data.genres.map((g: any) => g.id));
            }

            if (data.tracks && data.tracks.length > 0) {
              setTracks(
                data.tracks.map((t: any, idx: number) => ({
                  id: t.id,
                  title: t.title,
                  trackNumber: t.trackNumber || idx + 1,
                  audioFile: t.audioFile,
                  duration: t.duration || '',
                  lyrics: t.lyrics || '',
                  authorNote: t.authorNote || '',
                  explicit: Boolean(t.explicit),
                }))
              );
            }
          }
        }
      } catch (err) {
        console.error('Error loading release editor data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadInitialData();
    return () => {
      isMounted = false;
    };
  }, [authFetch, mode, releaseId]);

  // Cover upload handler
  const handleCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!allowedMime.includes(file.type) && !['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
      setCoverError('Разрешены только изображения JPG, JPEG, PNG, WebP');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setCoverError('Размер файла превышает лимит 15 МБ');
      return;
    }

    setCoverError(null);
    setIsCoverUploading(true);
    setCoverProgress(0);

    try {
      const res = await uploadFileWithProgress('/api/upload/cover', 'cover', file, (pct) => {
        setCoverProgress(pct);
      });
      setCover(res.url);
      setCoverFileName(file.name);
    } catch (err: any) {
      setCoverError(err.message || 'Не удалось загрузить обложку');
    } finally {
      setIsCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const handleRemoveCover = () => {
    setCover('');
    setCoverFileName(null);
    setCoverError(null);
  };

  // Genre selection toggle
  const toggleGenre = (genreId: number) => {
    setSelectedGenreIds((prev) =>
      prev.includes(genreId) ? prev.filter((g) => g !== genreId) : [...prev, genreId]
    );
  };

  // Track manipulation handlers
  const handleAddTrack = () => {
    setTracks((prev) => [
      ...prev,
      {
        title: '',
        trackNumber: prev.length + 1,
        audioFile: '',
        duration: '',
        lyrics: '',
        authorNote: '',
        explicit: false,
      },
    ]);
  };

  const handleUpdateTrack = (index: number, fields: Partial<EditorTrack>) => {
    setTracks((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...fields };
      return updated;
    });
  };

  const handleDeleteTrack = (index: number) => {
    if (tracks.length <= 1) {
      alert('В релизе должен оставаться хотя бы один трек');
      return;
    }
    setTracks((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((t, idx) => ({ ...t, trackNumber: idx + 1 }));
    });
  };

  const handleMoveTrack = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === tracks.length - 1)
    ) {
      return;
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    setTracks((prev) => {
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return updated.map((t, idx) => ({ ...t, trackNumber: idx + 1 }));
    });
  };

  // Audio file upload handler for track
  const handleAudioSelect = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowedExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'];

    if (!allowedExts.includes(ext || '') && !file.type.startsWith('audio/')) {
      handleUpdateTrack(index, {
        uploadError: 'Формат не поддерживается. Разрешены MP3, WAV, FLAC, AAC, OGG.',
      });
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      handleUpdateTrack(index, {
        uploadError: 'Файл слишком большой. Максимальный размер — 100 МБ.',
      });
      return;
    }

    // Clear previous error & set uploading state
    handleUpdateTrack(index, {
      isUploading: true,
      uploadProgress: 0,
      uploadError: null,
      originalAudioName: file.name,
    });

    // Auto-calculate duration in parallel using Audio element
    let calculatedDuration = 0;
    try {
      calculatedDuration = await calculateAudioDuration(file);
    } catch {
      calculatedDuration = 0;
    }

    try {
      const res = await uploadFileWithProgress('/api/upload/audio', 'audio', file, (pct) => {
        handleUpdateTrack(index, { uploadProgress: pct });
      });

      // Auto-fill track title if current title is empty
      const currentTitle = tracks[index]?.title || '';
      const autoTitle = currentTitle.trim()
        ? currentTitle
        : file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

      handleUpdateTrack(index, {
        audioFile: res.url,
        title: autoTitle,
        duration: calculatedDuration > 0 ? calculatedDuration : tracks[index]?.duration || '',
        isUploading: false,
        uploadProgress: 100,
        uploadError: null,
      });
    } catch (err: any) {
      handleUpdateTrack(index, {
        isUploading: false,
        uploadError: err.message || 'Ошибка загрузки аудиофайла',
      });
    } finally {
      e.target.value = '';
    }
  };

  // Validation checks
  const getValidationErrors = () => {
    const errors: string[] = [];
    if (!title.trim()) errors.push('Название релиза не указано');
    if (tracks.length === 0) errors.push('Не добавлено ни одного трека');
    tracks.forEach((tr, idx) => {
      if (!tr.title.trim()) errors.push(`Трек #${idx + 1}: не заполнено название`);
      if (!tr.audioFile.trim()) errors.push(`Трек #${idx + 1}: не загружен аудиофайл`);
    });
    return errors;
  };

  // Calculate total duration formatted
  const getTotalDurationFormatted = () => {
    let totalSeconds = 0;
    tracks.forEach((t) => {
      const sec = parseInt(String(t.duration), 10);
      if (!isNaN(sec) && sec > 0) totalSeconds += sec;
    });

    if (totalSeconds === 0) return '—';
    const mins = Math.floor(totalSeconds / 60);
    const remainder = totalSeconds % 60;
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder} мин.`;
  };

  // Save / Submit logic
  const handleSave = async (targetStatus: 'DRAFT' | 'PENDING_REVIEW') => {
    if (targetStatus === 'PENDING_REVIEW') {
      const errors = getValidationErrors();
      if (errors.length > 0) {
        alert(`Пожалуйста, исправьте ошибки перед отправкой на модерацию:\n\n• ${errors.join('\n• ')}`);
        return;
      }
    }

    if (!title.trim()) {
      alert('Укажите название релиза');
      return;
    }

    if (targetStatus === 'DRAFT') setSavingDraft(true);
    else setSubmittingReview(true);

    try {
      const payload = {
        artistId: artistProfile?.id,
        title: title.trim(),
        type,
        description: description.trim() || null,
        releaseDate: releaseDate || null,
        cover: cover.trim() || null,
        status: targetStatus,
        genreIds: selectedGenreIds,
        tracks: tracks.map((t) => ({
          id: t.id,
          title: t.title.trim(),
          trackNumber: t.trackNumber,
          audioFile: t.audioFile.trim(),
          duration: t.duration ? parseInt(String(t.duration), 10) : null,
          lyrics: t.lyrics.trim() || null,
          authorNote: t.authorNote.trim() || null,
          explicit: t.explicit,
        })),
      };

      const url = mode === 'edit' && releaseId ? `/api/music/releases/${releaseId}` : '/api/music/releases';
      const method = mode === 'edit' && releaseId ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        alert(
          targetStatus === 'PENDING_REVIEW'
            ? 'Релиз успешно отправлен на модерацию!'
            : 'Черновик релиза успешно сохранён!'
        );
        navigate('/music/studio');
      } else {
        const err = await res.json();
        alert(err.error || 'Ошибка при сохранении релиза');
      }
    } catch {
      alert('Ошибка соединения с сервером');
    } finally {
      setSavingDraft(false);
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="py-28 text-center text-[#94A3B8] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        <span className="text-xs font-mono font-semibold">Загрузка редактора релиза...</span>
      </div>
    );
  }

  const validationErrors = getValidationErrors();

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Top Breadcrumb & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={() => navigate('/music/studio')}
            className="text-xs font-mono text-[#94A3B8] hover:text-white transition-colors flex items-center gap-1 mb-2 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Вернуться в Студию</span>
          </button>
          <h1 className="text-2xl font-black text-white font-mono tracking-tight flex items-center gap-3">
            <Disc className="w-7 h-7 text-purple-400" />
            <span>{mode === 'edit' ? 'Редактирование релиза' : 'Создание нового релиза'}</span>
          </h1>
        </div>

        {/* Action Buttons in Header */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={() => handleSave('DRAFT')}
            disabled={savingDraft || submittingReview || !title.trim()}
            className="px-4 py-2.5 rounded-2xl bg-[#11152A] border border-[#1E2442] hover:bg-[#1A203C] text-xs font-mono font-bold text-white transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {savingDraft ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : <Save className="w-4 h-4 text-purple-400" />}
            <span>Сохранить черновик</span>
          </button>
          <button
            onClick={() => handleSave('PENDING_REVIEW')}
            disabled={savingDraft || submittingReview || validationErrors.length > 0}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-mono font-bold text-white transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {submittingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>На модерацию</span>
          </button>
        </div>
      </div>

      {/* STEP INDICATOR WIZARD BAR */}
      <div className="grid grid-cols-3 gap-2 p-2 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
        {[
          { step: 1, label: '1. Основное', subtitle: 'Инфо и обложка' },
          { step: 2, label: '2. Треклист', subtitle: 'Аудио и порядок' },
          { step: 3, label: '3. Проверка', subtitle: 'Превью и отправка' },
        ].map((item) => {
          const isActive = currentStep === item.step;
          const isDone = currentStep > item.step;
          return (
            <button
              key={item.step}
              onClick={() => setCurrentStep(item.step as any)}
              className={`p-3 rounded-xl transition-all cursor-pointer text-left flex items-center gap-3 ${
                isActive
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-bold'
                  : isDone
                  ? 'bg-[#11152A] text-purple-300 border border-purple-500/20'
                  : 'bg-[#11152A]/50 text-[#64748B]'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg font-mono text-xs font-black flex items-center justify-center shrink-0 ${
                  isActive
                    ? 'bg-white text-purple-600'
                    : isDone
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-[#1E2442] text-[#64748B]'
                }`}
              >
                {isDone ? <Check className="w-4 h-4" /> : item.step}
              </div>
              <div className="min-w-0 hidden sm:block">
                <span className="text-xs font-mono font-extrabold block truncate">{item.label}</span>
                <span className="text-[10px] opacity-80 block truncate font-mono">{item.subtitle}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* STEP 1: MAIN RELEASE INFO */}
      {currentStep === 1 && (
        <div className="p-6 sm:p-8 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-6">
          <h2 className="text-base font-bold text-white font-mono flex items-center gap-2 border-b border-[#1E2442] pb-3">
            <Info className="w-5 h-5 text-purple-400" />
            <span>Шаг 1: Основная информация о релизе</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left Cover Upload Box */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-bold text-white uppercase tracking-wider block">
                  Обложка релиза *
                </label>
                <div className="flex items-center gap-1 bg-[#11152A] p-0.5 rounded-lg border border-[#1E2442]">
                  <button
                    type="button"
                    onClick={() => setCoverMode('upload')}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                      coverMode === 'upload' ? 'bg-purple-600 text-white' : 'text-[#64748B] hover:text-white'
                    }`}
                  >
                    Загрузка
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoverMode('url')}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                      coverMode === 'url' ? 'bg-purple-600 text-white' : 'text-[#64748B] hover:text-white'
                    }`}
                  >
                    URL
                  </button>
                </div>
              </div>

              {coverMode === 'upload' ? (
                <div className="space-y-3">
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleCoverSelect}
                    className="hidden"
                    id="cover-file-input"
                  />

                  {/* Preview or Upload Dropzone */}
                  {cover.trim() ? (
                    <div className="space-y-2">
                      <div className="w-full aspect-square rounded-3xl bg-[#11152A] border border-[#1E2442] overflow-hidden relative group">
                        <img
                          src={cover.trim()}
                          alt="Cover Preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2 p-4">
                          <button
                            type="button"
                            onClick={() => coverInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-xl bg-purple-600 text-white font-mono text-xs font-bold hover:bg-purple-500 transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Заменить</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveCover}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-mono text-xs font-bold hover:bg-rose-500 transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Удалить</span>
                          </button>
                        </div>
                      </div>
                      {coverFileName && (
                        <span className="text-[10px] font-mono text-[#94A3B8] block truncate text-center">
                          {coverFileName}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      onClick={() => !isCoverUploading && coverInputRef.current?.click()}
                      className={`w-full aspect-square rounded-3xl bg-[#11152A] border-2 border-dashed border-[#1E2442] hover:border-purple-500/50 transition-all flex flex-col items-center justify-center p-4 text-center cursor-pointer group relative overflow-hidden ${
                        isCoverUploading ? 'opacity-75 pointer-events-none' : ''
                      }`}
                    >
                      {isCoverUploading ? (
                        <div className="space-y-3 w-full px-4">
                          <Loader2 className="w-8 h-8 animate-spin text-purple-400 mx-auto" />
                          <div className="space-y-1">
                            <span className="text-xs font-mono font-bold text-white block">
                              Загрузка обложки... {coverProgress}%
                            </span>
                            <div className="w-full h-1.5 bg-[#0B0D20] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-200"
                                style={{ width: `${coverProgress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 text-[#64748B] group-hover:text-purple-300 transition-colors">
                          <Upload className="w-10 h-10 mx-auto text-[#1E2442] group-hover:text-purple-400 transition-colors" />
                          <div>
                            <span className="text-xs font-mono font-bold block text-white">
                              Загрузить обложку
                            </span>
                            <span className="text-[10px] font-mono block text-[#64748B] mt-1">
                              JPG, PNG, WebP (до 15 МБ)
                            </span>
                            <span className="text-[9px] font-mono block text-[#475569] mt-0.5">
                              Квадратный формат (1:1)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {coverError && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{coverError}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={cover}
                    onChange={(e) => setCover(e.target.value)}
                    placeholder="https://.../cover.jpg"
                    className="w-full p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500 font-mono"
                  />
                  {cover.trim() && (
                    <div className="w-full aspect-square rounded-2xl bg-[#11152A] border border-[#1E2442] overflow-hidden">
                      <img src={cover.trim()} alt="Cover" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Main Fields */}
            <div className="md:col-span-2 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Название релиза *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Cyberpunk Horizons"
                  className="w-full p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] text-sm font-bold text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500 font-mono"
                  required
                />
              </div>

              {/* Type Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Тип релиза *
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'SINGLE', label: 'SINGLE', desc: '1-3 трека' },
                    { id: 'EP', label: 'EP', desc: 'Мини-альбом' },
                    { id: 'ALBUM', label: 'ALBUM', desc: 'Полноценный альбом' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setType(t.id as any)}
                      className={`p-3 rounded-2xl border text-center transition-all cursor-pointer font-mono ${
                        type === t.id
                          ? 'bg-purple-600/20 border-purple-500 text-white font-bold'
                          : 'bg-[#11152A] border-[#1E2442] text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-extrabold block">{t.label}</span>
                      <span className="text-[10px] opacity-75 block">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                    Дата релиза
                  </label>
                  <input
                    type="date"
                    value={releaseDate}
                    onChange={(e) => setReleaseDate(e.target.value)}
                    className="w-full p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                    Исполнитель
                  </label>
                  <div className="p-3 rounded-2xl bg-[#11152A] border border-[#1E2442] text-xs font-mono font-bold text-purple-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>{artistProfile?.stageName || dbUser?.username}</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Описание / Концепция релиза
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Расскажите об истории создания или идеи релиза..."
                  className="w-full p-3.5 rounded-2xl bg-[#11152A] border border-[#1E2442] text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-purple-500 resize-none leading-relaxed font-mono"
                />
              </div>

              {/* Genres */}
              {availableGenres.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                    Жанры
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableGenres.map((g) => {
                      const isSel = selectedGenreIds.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleGenre(g.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                            isSel
                              ? 'bg-purple-600 text-white border-purple-500'
                              : 'bg-[#11152A] text-[#94A3B8] border-[#1E2442] hover:text-white'
                          }`}
                        >
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-[#1E2442]">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-6 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 cursor-pointer"
            >
              <span>Далее: Список треков</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: TRACKS & AUDIO UPLOAD */}
      {currentStep === 2 && (
        <div className="p-6 sm:p-8 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-6">
          <div className="flex items-center justify-between border-b border-[#1E2442] pb-4">
            <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
              <ListMusic className="w-5 h-5 text-purple-400" />
              <span>Шаг 2: Управление треками ({tracks.length})</span>
            </h2>

            <button
              type="button"
              onClick={handleAddTrack}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Добавить трек</span>
            </button>
          </div>

          <div className="space-y-4">
            {tracks.map((tr, idx) => (
              <div
                key={idx}
                className="p-5 rounded-3xl bg-[#11152A] border border-[#1E2442] hover:border-[#2E365C] transition-all space-y-4"
              >
                {/* Track Card Header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-300 font-mono text-xs font-black flex items-center justify-center border border-purple-500/30 shrink-0">
                      #{idx + 1}
                    </span>
                    <h3 className="text-sm font-bold text-white font-mono truncate">
                      {tr.title.trim() || `Трек #${idx + 1}`}
                    </h3>
                  </div>

                  {/* Reorder and Delete Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMoveTrack(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1.5 rounded-lg bg-[#0B0D20] border border-[#1E2442] text-[#94A3B8] hover:text-white disabled:opacity-30 cursor-pointer"
                      title="Поднять выше"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveTrack(idx, 'down')}
                      disabled={idx === tracks.length - 1}
                      className="p-1.5 rounded-lg bg-[#0B0D20] border border-[#1E2442] text-[#94A3B8] hover:text-white disabled:opacity-30 cursor-pointer"
                      title="Опустить ниже"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTrack(idx)}
                      className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white cursor-pointer ml-2"
                      title="Удалить трек"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Track Fields Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] font-mono text-[#94A3B8] font-bold uppercase">
                      Название трека *
                    </label>
                    <input
                      type="text"
                      value={tr.title}
                      onChange={(e) => handleUpdateTrack(idx, { title: e.target.value })}
                      placeholder="Например: Neon Sunset"
                      className="w-full p-3 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-[#94A3B8] font-bold uppercase">
                      Длительность (сек)
                    </label>
                    <input
                      type="number"
                      value={tr.duration}
                      onChange={(e) => handleUpdateTrack(idx, { duration: e.target.value })}
                      placeholder="Вычисляется автоматически"
                      className="w-full p-3 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>
                </div>

                {/* Audio Upload Area */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-[#94A3B8] font-bold uppercase block">
                    Аудиофайл трека (MP3, WAV, FLAC, AAC, OGG) *
                  </label>

                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.flac,.aac,.ogg,.m4a"
                    onChange={(e) => handleAudioSelect(idx, e)}
                    className="hidden"
                    id={`track-audio-input-${idx}`}
                  />

                  {tr.isUploading ? (
                    <div className="p-4 rounded-xl bg-[#0B0D20] border border-purple-500/40 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-purple-300 font-bold flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                          <span>Загрузка аудиофайла: {tr.originalAudioName}</span>
                        </span>
                        <span className="text-white font-bold">{tr.uploadProgress}%</span>
                      </div>
                      <div className="w-full h-2 bg-[#11152A] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-150"
                          style={{ width: `${tr.uploadProgress || 0}%` }}
                        />
                      </div>
                    </div>
                  ) : tr.audioFile ? (
                    <div className="p-4 rounded-xl bg-[#0B0D20] border border-[#1E2442] space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <FileAudio className="w-4 h-4 text-purple-400 shrink-0" />
                          <span className="text-xs font-mono font-bold text-white truncate">
                            {tr.originalAudioName || tr.audioFile.split('/').pop()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const el = document.getElementById(`track-audio-input-${idx}`);
                              if (el) el.click();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#11152A] border border-[#1E2442] hover:bg-[#1A203C] text-[10px] font-mono text-purple-300 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Заменить файл</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateTrack(idx, { audioFile: '', originalAudioName: '' })}
                            className="p-1 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white cursor-pointer"
                            title="Удалить файл"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Embedded Audio Preview Player */}
                      <div className="pt-2 border-t border-[#1E2442]/50">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-[10px] font-mono text-[#94A3B8] font-bold">
                            Предпрослушивание трека:
                          </span>
                        </div>
                        <audio
                          controls
                          src={tr.audioFile}
                          className="w-full h-8 rounded-lg outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        const el = document.getElementById(`track-audio-input-${idx}`);
                        if (el) el.click();
                      }}
                      className="p-5 rounded-2xl bg-[#0B0D20] border-2 border-dashed border-[#1E2442] hover:border-purple-500/50 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer text-center group"
                    >
                      <Upload className="w-6 h-6 text-[#64748B] group-hover:text-purple-400 transition-colors" />
                      <div>
                        <span className="text-xs font-mono font-bold text-white block">
                          Загрузить аудиофайл
                        </span>
                        <span className="text-[10px] font-mono text-[#64748B] block mt-0.5">
                          MP3, WAV, FLAC, AAC, OGG (до 100 МБ)
                        </span>
                      </div>
                    </div>
                  )}

                  {tr.uploadError && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{tr.uploadError}</span>
                    </div>
                  )}
                </div>

                {/* Lyrics & Author Note Expandable */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-[#94A3B8] font-bold uppercase">
                      Текст трека (Lyrics)
                    </label>
                    <textarea
                      rows={2}
                      value={tr.lyrics}
                      onChange={(e) => handleUpdateTrack(idx, { lyrics: e.target.value })}
                      placeholder="Слова песни..."
                      className="w-full p-3 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 resize-none font-mono leading-relaxed"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-[#94A3B8] font-bold uppercase">
                      Авторская заметка
                    </label>
                    <textarea
                      rows={2}
                      value={tr.authorNote}
                      onChange={(e) => handleUpdateTrack(idx, { authorNote: e.target.value })}
                      placeholder="Комментарий исполнителя о создании трека..."
                      className="w-full p-3 rounded-xl bg-[#0B0D20] border border-[#1E2442] text-xs text-white focus:outline-none focus:border-purple-500 resize-none font-mono leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs font-mono text-[#CBD5E1] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tr.explicit}
                      onChange={(e) => handleUpdateTrack(idx, { explicit: e.target.checked })}
                      className="rounded border-[#1E2442] text-purple-600 focus:ring-0"
                    />
                    <span>Explicit (содержит нецензурную лексику)</span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#1E2442]">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="px-5 py-2.5 rounded-xl bg-[#11152A] text-xs font-mono text-[#94A3B8] hover:text-white cursor-pointer"
            >
              Назад
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="px-6 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 cursor-pointer"
            >
              <span>Далее: Проверка релиза</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PREVIEW & FINAL SUBMISSION */}
      {currentStep === 3 && (
        <div className="space-y-6">
          {/* Release Preview Card */}
          <div className="p-6 sm:p-8 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-6">
            <h2 className="text-base font-bold text-white font-mono flex items-center gap-2 border-b border-[#1E2442] pb-3">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <span>Шаг 3: Предпросмотр карточки релиза</span>
            </h2>

            <div className="flex flex-col sm:flex-row items-start gap-6 bg-[#11152A] p-6 rounded-3xl border border-[#1E2442]">
              {cover.trim() ? (
                <img
                  src={cover.trim()}
                  alt={title}
                  className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl object-cover border border-[#1E2442] shadow-xl shrink-0"
                />
              ) : (
                <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-purple-900/40 text-purple-300 flex items-center justify-center shrink-0 border border-[#1E2442]">
                  <Disc className="w-12 h-12" />
                </div>
              )}

              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-purple-600/20 text-purple-300 border border-purple-500/30">
                    {type}
                  </span>
                  <span className="text-xs font-mono text-[#64748B]">
                    Дата: {releaseDate || 'Не указана'}
                  </span>
                  <span className="text-xs font-mono text-[#64748B]">
                    • Длительность: {getTotalDurationFormatted()}
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl font-black text-white font-mono">{title || 'Без названия'}</h3>
                <p className="text-sm font-bold text-purple-300 font-mono">
                  {artistProfile?.stageName || dbUser?.username}
                </p>

                {description && (
                  <p className="text-xs text-[#94A3B8] leading-relaxed line-clamp-3 font-mono">
                    {description}
                  </p>
                )}
              </div>
            </div>

            {/* Tracklist Preview & Players */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                Треклист ({tracks.length} треков)
              </h3>

              <div className="space-y-3">
                {tracks.map((t, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-[#0B0D20] text-purple-300 font-mono text-xs font-bold flex items-center justify-center shrink-0 border border-[#1E2442]">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-white font-mono block truncate">
                            {t.title || `Трек #${idx + 1}`}
                          </span>
                          {t.originalAudioName && (
                            <span className="text-[10px] text-[#64748B] font-mono block truncate">
                              {t.originalAudioName}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-xs font-mono text-[#94A3B8]">
                        {t.duration && <span>{t.duration} сек.</span>}
                        {t.explicit && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300">
                            E
                          </span>
                        )}
                      </div>
                    </div>

                    {t.audioFile && (
                      <audio controls src={t.audioFile} className="w-full h-8 rounded-lg outline-none" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Validation Checklist */}
            <div className="p-5 rounded-2xl bg-[#11152A] border border-[#1E2442] space-y-2">
              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                Проверка перед отправкой
              </h4>

              {validationErrors.length === 0 ? (
                <div className="text-xs text-emerald-400 font-mono flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Все обязательные поля и аудиофайлы загружены корректно. Релиз готов к отправке!</span>
                </div>
              ) : (
                <div className="space-y-1">
                  {validationErrors.map((err, i) => (
                    <div key={i} className="text-xs text-rose-400 font-mono flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Final Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-[#1E2442]">
              <button
                type="button"
                onClick={() => handleSave('DRAFT')}
                disabled={savingDraft || submittingReview || !title.trim()}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#11152A] border border-[#1E2442] hover:bg-[#1A203C] text-xs font-mono font-bold text-white transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {savingDraft ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : <Save className="w-4 h-4 text-purple-400" />}
                <span>Сохранить черновик</span>
              </button>

              <button
                type="button"
                onClick={() => handleSave('PENDING_REVIEW')}
                disabled={savingDraft || submittingReview || validationErrors.length > 0}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-mono font-bold text-white transition-all shadow-xl shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submittingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Отправить на модерацию</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
