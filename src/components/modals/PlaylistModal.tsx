import React, { useState, useEffect } from 'react';
import {
  X,
  ListMusic,
  Globe,
  Link as LinkIcon,
  Lock,
  Loader2,
  Image as ImageIcon,
  AlertCircle,
  Sparkles,
  Users,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export interface PlaylistData {
  id: number;
  title: string;
  description?: string | null;
  cover?: string | null;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  isCollaborative?: boolean;
}

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist?: PlaylistData | null; // If provided, mode is 'edit', otherwise 'create'
  onSaved: (savedPlaylist: any) => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  onClose,
  playlist,
  onSaved,
}) => {
  const { authFetch } = useAuth();

  const isEdit = Boolean(playlist && playlist.id);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cover, setCover] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>('PUBLIC');
  const [isCollaborative, setIsCollaborative] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (playlist) {
        setTitle(playlist.title || '');
        setDescription(playlist.description || '');
        setCover(playlist.cover || '');
        setVisibility(playlist.visibility || 'PUBLIC');
        setIsCollaborative(Boolean(playlist.isCollaborative));
      } else {
        setTitle('');
        setDescription('');
        setCover('');
        setVisibility('PUBLIC');
        setIsCollaborative(false);
      }
      setError(null);
    }
  }, [isOpen, playlist]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();

    if (!trimmedTitle || trimmedTitle.length < 1) {
      setError('Введите название плейлиста');
      return;
    }

    if (trimmedTitle.length > 100) {
      setError('Название не должно превышать 100 символов');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = isEdit ? `/api/music/playlists/${playlist!.id}` : '/api/music/playlists';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim() || null,
          cover: cover.trim() || null,
          visibility,
          isCollaborative,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Не удалось сохранить плейлист');
      }

      onSaved(data.playlist);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения плейлиста');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080A18]/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-3xl bg-[#0F1328] border border-[#232B54] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[#1E2442] flex items-center justify-between bg-[#131835]/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <ListMusic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-tight">
                {isEdit ? 'Редактировать плейлист' : 'Создать новый плейлист'}
              </h3>
              <p className="text-xs text-[#94A3B8]">
                {isEdit ? 'Измените параметры, доступ и участников' : 'Соберите персональную или совместную коллекцию'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">
              Название плейлиста <span className="text-purple-400">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={100}
              placeholder="Например: Мой ночной плейлист, Вайб осени, Лучшее"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-[#090C1B] border border-[#232B54] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">
              Описание <span className="text-slate-500 text-[11px] font-normal">(опционально)</span>
            </label>
            <textarea
              rows={2}
              maxLength={1000}
              placeholder="Расскажите, о чём этот плейлист, для какого настроения или повода..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-[#090C1B] border border-[#232B54] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none custom-scrollbar"
            />
          </div>

          {/* Cover URL */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center justify-between">
              <span>Прямая ссылка на обложку (URL)</span>
              <span className="text-slate-500 text-[11px] font-normal">Опционально</span>
            </label>
            <div className="relative">
              <input
                type="url"
                maxLength={500}
                placeholder="https://example.com/playlist-cover.jpg"
                value={cover}
                onChange={(e) => setCover(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#090C1B] border border-[#232B54] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
              <ImageIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Если обложка не указана, будет автоматически использован коллаж из треков.
            </p>
          </div>

          {/* Who can add tracks (Collaborative setting) */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center justify-between">
              <span>Кто может добавлять треки</span>
              <span className="text-purple-400 text-[11px] font-medium">Совместный доступ</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsCollaborative(false)}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                  !isCollaborative
                    ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                    : 'bg-[#090C1B] border-[#232B54] text-slate-400 hover:text-white hover:bg-[#121633]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <User className="w-4 h-4 text-purple-400" />
                  {!isCollaborative && (
                    <span className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_#a855f7]" />
                  )}
                </div>
                <div>
                  <h5 className="text-xs font-bold text-white">Только я</h5>
                  <p className="text-[10px] text-slate-400 leading-tight">Только владелец добавляет треки</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIsCollaborative(true)}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                  isCollaborative
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200'
                    : 'bg-[#090C1B] border-[#232B54] text-slate-400 hover:text-white hover:bg-[#121633]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Users className="w-4 h-4 text-emerald-400" />
                  {isCollaborative && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                  )}
                </div>
                <div>
                  <h5 className="text-xs font-bold text-white">Участники плейлиста</h5>
                  <p className="text-[10px] text-slate-400 leading-tight">Несколько пользователей могут наполнять плейлист</p>
                </div>
              </button>
            </div>
          </div>

          {/* Visibility Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">
              Уровень доступа (видимость)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setVisibility('PUBLIC')}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                  visibility === 'PUBLIC'
                    ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                    : 'bg-[#090C1B] border-[#232B54] text-slate-400 hover:text-white hover:bg-[#121633]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Globe className="w-4 h-4 text-purple-400" />
                  {visibility === 'PUBLIC' && (
                    <span className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_#a855f7]" />
                  )}
                </div>
                <div>
                  <h5 className="text-xs font-bold text-white">Публичный</h5>
                  <p className="text-[10px] text-slate-400 leading-tight">Виден всем в каталоге</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setVisibility('UNLISTED')}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                  visibility === 'UNLISTED'
                    ? 'bg-cyan-600/20 border-cyan-500 text-cyan-200'
                    : 'bg-[#090C1B] border-[#232B54] text-slate-400 hover:text-white hover:bg-[#121633]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <LinkIcon className="w-4 h-4 text-cyan-400" />
                  {visibility === 'UNLISTED' && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#06b6d4]" />
                  )}
                </div>
                <div>
                  <h5 className="text-xs font-bold text-white">По ссылке</h5>
                  <p className="text-[10px] text-slate-400 leading-tight">Только с прямой ссылкой</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setVisibility('PRIVATE')}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                  visibility === 'PRIVATE'
                    ? 'bg-amber-600/20 border-amber-500 text-amber-200'
                    : 'bg-[#090C1B] border-[#232B54] text-slate-400 hover:text-white hover:bg-[#121633]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Lock className="w-4 h-4 text-amber-400" />
                  {visibility === 'PRIVATE' && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b]" />
                  )}
                </div>
                <div>
                  <h5 className="text-xs font-bold text-white">Приватный</h5>
                  <p className="text-[10px] text-slate-400 leading-tight">Виден только вам и участникам</p>
                </div>
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#1E2442]">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition cursor-pointer"
            >
              Отмена
            </button>

            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{isEdit ? 'Сохранить изменения' : 'Создать плейлист'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
