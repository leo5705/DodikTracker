import React, { useState } from 'react';
import { X, User, Check, Shield, Lock, Globe } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface ProfileModalProps {
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ onClose }) => {
  const { dbUser, authFetch, refreshProfile } = useAuth();
  const [username, setUsername] = useState(dbUser?.username || '');
  const [bio, setBio] = useState(dbUser?.bio || '');
  const [profileVisibility, setProfileVisibility] = useState(dbUser?.profileVisibility || 'PUBLIC');
  const [libraryVisibility, setLibraryVisibility] = useState(dbUser?.libraryVisibility || 'PUBLIC');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await authFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          bio: bio.trim(),
          profileVisibility,
          libraryVisibility,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Не удалось обновить профиль');
      }

      await refreshProfile();
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-bold text-zinc-100 font-mono">НАСТРОЙКИ ПРОФИЛЯ</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">Имя пользователя (никнейм)</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">О себе (био)</label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Пара слов о ваших вкусах..."
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">Видимость библиотеки</label>
            <select
              value={libraryVisibility}
              onChange={(e) => setLibraryVisibility(e.target.value as any)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
            >
              <option value="PUBLIC">Публичная (видна всем)</option>
              <option value="FRIENDS">Только для друзей</option>
              <option value="PRIVATE">Приватная (только для меня)</option>
            </select>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-300">
              Профиль успешно сохранён!
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-zinc-200"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md transition-all disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
