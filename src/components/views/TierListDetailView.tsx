import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Layers,
  Globe,
  Lock,
  User,
  Calendar,
  Loader2,
  Trash2,
  Share2,
  Check,
  Film,
  AlertTriangle,
  Users,
  Plus,
  Save,
  Edit3,
  Eye,
  ChevronUp,
  ChevronDown,
  Palette,
  ExternalLink,
  Sparkles,
  Gamepad2,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';
import { AddMediaModal } from '../tier-lists/AddMediaModal.tsx';

interface TierListDetailViewProps {
  tierListId: number;
}

interface TierDefinition {
  id: string;
  label: string;
  color: string; // Tailwind bg color class or hex
}

interface TierItem {
  id: number;
  mediaId?: number;
  title: string;
  type?: string;
  posterUrl?: string;
  tierId: string; // matches tier id or 'unranked'
  order?: number;
}

const TIER_COLOR_PRESETS = [
  { label: 'Красный (S)', value: 'bg-red-600 text-white' },
  { label: 'Оранжевый (A)', value: 'bg-orange-600 text-white' },
  { label: 'Желтый (B)', value: 'bg-amber-500 text-black' },
  { label: 'Зеленый (C)', value: 'bg-emerald-600 text-white' },
  { label: 'Синий (D)', value: 'bg-blue-600 text-white' },
  { label: 'Фиолетовый', value: 'bg-purple-600 text-white' },
  { label: 'Розовый', value: 'bg-pink-600 text-white' },
  { label: 'Темный (F)', value: 'bg-zinc-700 text-white' },
];

export const TierListDetailView: React.FC<TierListDetailViewProps> = ({ tierListId }) => {
  const { authFetch, dbUser } = useAuth();
  const { navigate, goBack } = useRouter();

  const [tierList, setTierList] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mode & Editing state
  const [isEditMode, setIsEditMode] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [tiers, setTiers] = useState<TierDefinition[]>([]);
  const [items, setItems] = useState<TierItem[]>([]);
  const [resolvedMediaMap, setResolvedMediaMap] = useState<Map<number, any>>(new Map());

  // Operations state
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAddMediaModal, setShowAddMediaModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Drag and Drop State
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dragOverZone, setDragOverZone] = useState<string | null>(null);
  const [activeColorPickerTierId, setActiveColorPickerTierId] = useState<string | null>(null);

  const fetchTierList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/tier-lists/${tierListId}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Этот тир-лист приватный и доступен только автору');
        }
        if (res.status === 404) {
          throw new Error('Тир-лист не найден в базе данных');
        }
        throw new Error('Не удалось загрузить тир-лист');
      }

      const data = await res.json();
      setTierList(data);
      setTitle(data.title || '');
      setDescription(data.description || '');
      setVisibility(data.visibility || 'PUBLIC');

      // Parse tiers
      let parsedTiers: TierDefinition[] = [];
      try {
        parsedTiers = JSON.parse(data.tiersJson || '[]');
      } catch (_e) {}
      if (!parsedTiers || parsedTiers.length === 0) {
        parsedTiers = [
          { id: 's', label: 'S', color: 'bg-red-600 text-white' },
          { id: 'a', label: 'A', color: 'bg-orange-600 text-white' },
          { id: 'b', label: 'B', color: 'bg-amber-500 text-black' },
          { id: 'c', label: 'C', color: 'bg-emerald-600 text-white' },
          { id: 'd', label: 'D', color: 'bg-blue-600 text-white' },
        ];
      }
      setTiers(parsedTiers);

      // Parse items
      let parsedItems: any[] = [];
      try {
        parsedItems = JSON.parse(data.itemsJson || '[]');
      } catch (_e) {}

      // Build media map
      const map = new Map<number, any>();
      if (Array.isArray(data.resolvedMedia)) {
        data.resolvedMedia.forEach((m: any) => map.set(m.id, m));
      }
      setResolvedMediaMap(map);

      // Hydrate items with media details
      const hydratedItems: TierItem[] = parsedItems.map((it: any) => {
        const mId = it.id || it.mediaId;
        const mediaObj = map.get(mId);
        return {
          id: mId,
          mediaId: mId,
          title: it.title || mediaObj?.title || 'Без названия',
          type: it.type || mediaObj?.type,
          posterUrl: it.posterUrl || mediaObj?.posterUrl,
          tierId: it.tierId || 'unranked',
          order: it.order || 0,
        };
      });

      setItems(hydratedItems);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки тир-листа');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tierListId) {
      fetchTierList();
    }
  }, [tierListId]);

  const isOwner = dbUser && (dbUser.id === tierList?.ownerId || dbUser.role === 'ADMIN' || dbUser.role === 'SUPER_ADMIN');

  // Ensure edit mode is strictly disabled for non-owners
  const canEdit = Boolean(isOwner && isEditMode);

  // Save changes to backend
  const handleSaveChanges = async () => {
    if (!tierList || !isOwner) return;
    setSaving(true);
    setSavedSuccess(false);
    setSaveError(null);

    try {
      const payload = {
        title: title.trim(),
        description: description ? description.trim() : null,
        category: tierList.category,
        visibility,
        tiersJson: JSON.stringify(tiers),
        itemsJson: JSON.stringify(
          items.map((it) => ({
            id: it.id,
            mediaId: it.id,
            title: it.title,
            type: it.type,
            posterUrl: it.posterUrl,
            tierId: it.tierId,
            order: it.order || 0,
          }))
        ),
      };

      const res = await authFetch(`/api/tier-lists/${tierListId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Ошибка при сохранении тир-листа');
      }

      const updated = await res.json();
      setTierList((prev: any) => ({ ...prev, ...updated }));
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      console.error('Save error:', err);
      setSaveError(err.message || 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  // Add media to items list
  const handleAddMedia = (newMedia: {
    id: number;
    title: string;
    type: string;
    posterUrl?: string;
    year?: number;
  }) => {
    if (!isOwner || items.some((i) => i.id === newMedia.id)) return;

    setItems((prev) => [
      ...prev,
      {
        id: newMedia.id,
        mediaId: newMedia.id,
        title: newMedia.title,
        type: newMedia.type,
        posterUrl: newMedia.posterUrl,
        tierId: 'unranked',
      },
    ]);
  };

  // Move item to tier
  const handleMoveItem = (itemId: number, targetTierId: string) => {
    if (!isOwner) return;
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, tierId: targetTierId } : it))
    );
  };

  // Remove item from tier list
  const handleRemoveItem = (itemId: number) => {
    if (!isOwner) return;
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  // Native HTML5 Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, itemId: number) => {
    if (!canEdit) return;
    setDraggedItemId(itemId);
    e.dataTransfer.setData('text/plain', String(itemId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, tierId: string) => {
    if (!canEdit) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverZone !== tierId) {
      setDragOverZone(tierId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, tierId: string) => {
    if (!canEdit) return;
    if (dragOverZone === tierId) {
      setDragOverZone(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetTierId: string) => {
    if (!canEdit) return;
    e.preventDefault();
    setDragOverZone(null);
    const idStr = e.dataTransfer.getData('text/plain');
    const targetId = idStr ? parseInt(idStr, 10) : draggedItemId;
    if (targetId) {
      handleMoveItem(targetId, targetTierId);
    }
    setDraggedItemId(null);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverZone(null);
  };

  // Tier operations
  const handleUpdateTierLabel = (tierId: string, newLabel: string) => {
    if (!isOwner) return;
    setTiers((prev) =>
      prev.map((t) => (t.id === tierId ? { ...t, label: newLabel } : t))
    );
  };

  const handleUpdateTierColor = (tierId: string, newColor: string) => {
    if (!isOwner) return;
    setTiers((prev) =>
      prev.map((t) => (t.id === tierId ? { ...t, color: newColor } : t))
    );
    setActiveColorPickerTierId(null);
  };

  const handleAddTier = () => {
    if (!isOwner) return;
    const newId = `tier_${Date.now()}`;
    const nextColor =
      TIER_COLOR_PRESETS[tiers.length % TIER_COLOR_PRESETS.length].value;
    setTiers((prev) => [
      ...prev,
      {
        id: newId,
        label: 'NEW',
        color: nextColor,
      },
    ]);
  };

  const handleDeleteTier = (tierId: string) => {
    if (!isOwner) return;
    // Move all items in deleted tier to unranked
    setItems((prev) =>
      prev.map((it) => (it.tierId === tierId ? { ...it, tierId: 'unranked' } : it))
    );
    setTiers((prev) => prev.filter((t) => t.id !== tierId));
  };

  const handleMoveTierOrder = (index: number, direction: 'up' | 'down') => {
    if (!isOwner) return;
    const newTiers = [...tiers];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newTiers.length) return;

    const temp = newTiers[index];
    newTiers[index] = newTiers[targetIndex];
    newTiers[targetIndex] = temp;
    setTiers(newTiers);
  };

  // Delete tier list
  const handleDeleteTierList = async () => {
    if (!isOwner) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/tier-lists/${tierListId}`, { method: 'DELETE' });
      if (res.ok) {
        setShowDeleteModal(false);
        navigate('/tier-lists');
      } else {
        const errData = await res.json();
        setSaveError(errData.error || 'Ошибка при удалении');
      }
    } catch (err) {
      setSaveError('Не удалось удалить тир-лист');
    } finally {
      setDeleting(false);
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="py-32 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-10 h-10 text-fuchsia-400 animate-spin" />
        <p className="text-xs text-[#9A94AA] font-mono">Загрузка тир-листа...</p>
      </div>
    );
  }

  if (error || !tierList) {
    return (
      <div className="py-24 text-center space-y-4 max-w-lg mx-auto animate-fadeIn">
        <div className="w-14 h-14 rounded-2xl bg-fuchsia-950/40 border border-fuchsia-800/40 flex items-center justify-center mx-auto text-fuchsia-400">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-[#F3F1F8] font-mono">Доступ ограничен</h2>
        <p className="text-xs text-[#9A94AA] leading-relaxed">{error}</p>
        <div className="pt-2">
          <button
            onClick={() => navigate('/tier-lists')}
            className="px-5 py-2.5 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold font-mono shadow-md transition-all"
          >
            Все тир-листы
          </button>
        </div>
      </div>
    );
  }

  const unrankedItems = items.filter((it) => it.tierId === 'unranked');

  return (
    <div className="space-y-8 pb-16 animate-fadeIn">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={() => goBack()}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#14131A] hover:bg-[#1F1C2E] border border-[#252233] text-xs font-medium text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>К тир-листам</span>
        </button>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#14131A] hover:bg-[#1F1C2E] border border-[#252233] text-xs font-medium text-[#9A94AA] hover:text-[#F3F1F8] transition-colors"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Ссылка скопирована</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Поделиться</span>
              </>
            )}
          </button>

          {isOwner && (
            <>
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-bold font-mono transition-all ${
                  isEditMode
                    ? 'bg-[#252233] text-[#F3F1F8] border border-[#38334D]'
                    : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-950/40'
                }`}
              >
                {isEditMode ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Режим просмотра</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Редактировать тир-лист</span>
                  </>
                )}
              </button>

              {isEditMode && (
                <button
                  onClick={handleSaveChanges}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono shadow-lg shadow-emerald-950/40 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Сохранение...</span>
                    </>
                  ) : savedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>Сохранено!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Сохранить</span>
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => setShowDeleteModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-xs font-medium text-rose-300 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить</span>
              </button>
            </>
          )}
        </div>
      </div>

      {saveError && (
        <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-800/70 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#14131A] border border-[#252233] space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fuchsia-950/60 border border-fuchsia-800/50 text-xs font-bold font-mono text-fuchsia-300">
            <Layers className="w-3.5 h-3.5" />
            Категория: {tierList.category || 'МЕДИА'}
          </span>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 font-mono">
            {tierList.visibility === 'PUBLIC' ? (
              <>
                <Globe className="w-3 h-3 text-emerald-400" />
                <span>Публичный</span>
              </>
            ) : tierList.visibility === 'FRIENDS' ? (
              <>
                <Users className="w-3 h-3 text-amber-400" />
                <span>Для друзей</span>
              </>
            ) : (
              <>
                <Lock className="w-3 h-3 text-rose-400" />
                <span>Приватный</span>
              </>
            )}
          </span>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 font-mono">
            <Calendar className="w-3 h-3" />
            {new Date(tierList.createdAt).toLocaleDateString('ru-RU')}
          </span>
        </div>

        {isEditMode ? (
          <div className="space-y-3 pt-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название тир-листа..."
              className="w-full text-xl sm:text-2xl font-black font-mono text-[#F3F1F8] bg-[#191724] border border-[#252233] rounded-2xl px-4 py-2.5 focus:outline-none focus:border-fuchsia-500 transition-colors"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание тир-листа..."
              rows={2}
              className="w-full text-xs sm:text-sm text-[#F3F1F8] bg-[#191724] border border-[#252233] rounded-2xl px-4 py-2 focus:outline-none focus:border-fuchsia-500 transition-colors resize-none"
            />
          </div>
        ) : (
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#F3F1F8] font-mono tracking-tight">
              {tierList.title}
            </h1>
            {tierList.description && (
              <p className="text-xs sm:text-sm text-[#9A94AA] leading-relaxed max-w-3xl mt-2">
                {tierList.description}
              </p>
            )}
          </div>
        )}

        <div className="pt-2 flex items-center justify-between flex-wrap gap-3">
          <div
            onClick={() => navigate(`/u/${tierList.ownerUsername}`)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#191724] border border-[#252233] hover:border-fuchsia-500/50 cursor-pointer transition-colors group"
          >
            <div className="w-6 h-6 rounded-full bg-fuchsia-950 flex items-center justify-center text-[10px] font-bold text-fuchsia-300 overflow-hidden">
              {tierList.ownerAvatar ? (
                <img src={tierList.ownerAvatar} alt={tierList.ownerUsername} className="w-full h-full object-cover" />
              ) : (
                (tierList.ownerUsername?.[0] || 'U').toUpperCase()
              )}
            </div>
            <span className="text-xs text-[#9A94AA] group-hover:text-fuchsia-300 font-medium transition-colors">
              Автор: @{tierList.ownerUsername || 'anonymous'}
            </span>
          </div>

          {isEditMode && (
            <button
              onClick={() => setShowAddMediaModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold font-mono shadow-lg shadow-fuchsia-950/40 transition-all"
            >
              <Plus className="w-4 h-4" />
              Добавить медиа ({tierList.category})
            </button>
          )}
        </div>
      </div>

      {/* Main Tier Board */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#9A94AA] font-mono">
            Ранжирование тайтлов ({items.filter((i) => i.tierId !== 'unranked').length} в рангах)
          </h3>
          {isEditMode && (
            <button
              onClick={handleAddTier}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#191724] hover:bg-[#201D2C] border border-[#252233] text-xs font-bold font-mono text-fuchsia-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить ранг
            </button>
          )}
        </div>

        <div className="rounded-3xl bg-[#14131A] border border-[#252233] overflow-hidden shadow-2xl divide-y divide-[#252233]">
          {tiers.map((tier, tIdx) => {
            const tierItems = items.filter((it) => it.tierId === tier.id);
            const isDragOver = dragOverZone === tier.id;

            return (
              <div
                key={tier.id}
                id={`dropzone-${tier.id}`}
                onDragOver={(e) => handleDragOver(e, tier.id)}
                onDragLeave={(e) => handleDragLeave(e, tier.id)}
                onDrop={(e) => handleDrop(e, tier.id)}
                className={`tier-dropzone flex flex-col sm:flex-row min-h-[115px] transition-all duration-150 ${
                  isDragOver
                    ? 'bg-fuchsia-950/40 ring-2 ring-inset ring-fuchsia-500/60'
                    : 'bg-[#14131A] hover:bg-[#171522]'
                }`}
              >
                {/* Tier Rank Header Column */}
                <div
                  className={`w-full sm:w-36 md:w-44 shrink-0 p-4 flex sm:flex-col items-center justify-between sm:justify-center text-center shadow-inner relative select-none ${tier.color}`}
                >
                  {isEditMode ? (
                    <div className="flex sm:flex-col items-center justify-center gap-2 w-full">
                      <input
                        type="text"
                        value={tier.label}
                        onChange={(e) => handleUpdateTierLabel(tier.id, e.target.value)}
                        className="w-20 sm:w-full text-center font-black font-mono text-xl sm:text-2xl bg-black/35 text-white rounded-xl px-2 py-1 border border-white/20 focus:outline-none focus:border-white shadow-inner"
                      />

                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {/* Color preset toggle */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setActiveColorPickerTierId(
                                activeColorPickerTierId === tier.id ? null : tier.id
                              )
                            }
                            title="Изменить цвет"
                            className="p-1.5 rounded-lg bg-black/30 hover:bg-black/50 text-white transition-colors"
                          >
                            <Palette className="w-3.5 h-3.5" />
                          </button>

                          {activeColorPickerTierId === tier.id && (
                            <div className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-1 z-30 p-2 rounded-2xl bg-[#14131A] border border-[#252233] shadow-2xl flex flex-wrap gap-1.5 w-44">
                              {TIER_COLOR_PRESETS.map((preset, pIdx) => (
                                <button
                                  key={pIdx}
                                  onClick={() => handleUpdateTierColor(tier.id, preset.value)}
                                  className={`w-6 h-6 rounded-lg ${preset.value} border border-white/20 hover:scale-110 transition-transform`}
                                  title={preset.label}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Reorder buttons */}
                        <button
                          onClick={() => handleMoveTierOrder(tIdx, 'up')}
                          disabled={tIdx === 0}
                          title="Поднять ранг выше"
                          className="p-1.5 rounded-lg bg-black/30 hover:bg-black/50 text-white disabled:opacity-20 transition-colors"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveTierOrder(tIdx, 'down')}
                          disabled={tIdx === tiers.length - 1}
                          title="Опустить ранг ниже"
                          className="p-1.5 rounded-lg bg-black/30 hover:bg-black/50 text-white disabled:opacity-20 transition-colors"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete tier */}
                        <button
                          onClick={() => handleDeleteTier(tier.id)}
                          title="Удалить ранг"
                          className="p-1.5 rounded-lg bg-black/30 hover:bg-rose-900/60 text-rose-200 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="text-[10px] font-mono opacity-80 mt-0.5">
                        {tierItems.length} {tierItems.length === 1 ? 'тайтл' : tierItems.length < 5 ? 'тайтла' : 'тайтлов'}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <span className="font-black text-2xl sm:text-3xl font-mono tracking-tight block">
                        {tier.label}
                      </span>
                      <span className="text-[10px] font-mono font-medium opacity-80 block">
                        {tierItems.length} {tierItems.length === 1 ? 'тайтл' : tierItems.length < 5 ? 'тайтла' : 'тайтлов'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Tier Items Container Dropzone */}
                <div className="flex-1 p-3 sm:p-4 flex flex-wrap gap-3.5 items-center min-w-0 bg-[#161420]/70">
                  {tierItems.length === 0 ? (
                    <div className="w-full py-4 text-center text-xs text-[#6B667B] italic font-mono select-none pointer-events-none">
                      {isEditMode
                        ? 'Перетащите тайтлы сюда или кликните ранг на карточке'
                        : 'В этом ранге пока нет тайтлов'}
                    </div>
                  ) : (
                    tierItems.map((it) => {
                      const mediaObj = resolvedMediaMap.get(it.id || it.mediaId);
                      const poster = it.posterUrl || mediaObj?.posterUrl;
                      const title = it.title || mediaObj?.title || 'Без названия';
                      const targetId = it.id || it.mediaId;
                      const targetType = (it.type || mediaObj?.type || 'item')
                        .toLowerCase()
                        .replace(/_/g, '-');
                      const isBeingDragged = draggedItemId === targetId;

                      return (
                        <div
                          key={targetId}
                          id={`drag-item-${targetId}`}
                          draggable={isEditMode}
                          onDragStart={(e) => handleDragStart(e, targetId)}
                          onDragEnd={handleDragEnd}
                          className={`group relative w-20 sm:w-24 aspect-[2/3] rounded-2xl overflow-hidden bg-[#201D2C] border transition-all duration-150 shrink-0 border-[#2E2A40] hover:border-fuchsia-400 shadow-md hover:scale-105 hover:shadow-xl ${
                            isBeingDragged ? 'opacity-40 scale-95 border-fuchsia-500' : ''
                          } ${isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                        >
                          {poster ? (
                            <img
                              src={poster}
                              alt={title}
                              draggable={false}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover select-none pointer-events-none"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-zinc-900 select-none pointer-events-none">
                              <Film className="w-5 h-5 text-zinc-500 mb-1" />
                              <span className="text-[10px] text-zinc-300 line-clamp-3 leading-tight font-medium">
                                {title}
                              </span>
                            </div>
                          )}

                          {/* Item Hover / Controls Overlay */}
                          <div className="absolute inset-0 bg-[#0F0E13]/90 backdrop-blur-[2px] p-2 opacity-0 group-hover:opacity-100 flex flex-col justify-between transition-opacity text-left">
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-[10px] font-bold text-white line-clamp-2 leading-tight">
                                {title}
                              </span>
                              {isEditMode && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveItem(targetId);
                                  }}
                                  className="text-rose-400 hover:text-rose-300 p-0.5"
                                  title="Удалить из тир-листа"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {/* Controls in Edit Mode */}
                            {isEditMode ? (
                              <div className="space-y-1 pt-1">
                                <div className="grid grid-cols-4 gap-1">
                                  {tiers.map((t) => (
                                    <button
                                      key={t.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveItem(targetId, t.id);
                                      }}
                                      className={`text-[9px] font-black uppercase rounded py-0.5 transition-all ${
                                        it.tierId === t.id
                                          ? 'bg-fuchsia-600 text-white ring-1 ring-white/50'
                                          : 'bg-zinc-800 text-zinc-300 hover:bg-fuchsia-700 hover:text-white'
                                      }`}
                                    >
                                      {t.label.slice(0, 2)}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveItem(targetId, 'unranked');
                                  }}
                                  className="w-full text-[9px] text-zinc-400 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 rounded py-0.5 font-mono font-medium transition-colors text-center"
                                >
                                  В пул
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => navigate(`/media/${targetType}/${targetId}`)}
                                className="inline-flex items-center gap-1 text-[9px] text-fuchsia-300 font-mono font-semibold hover:text-fuchsia-200 mt-auto"
                              >
                                <span>Открыть</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unranked Tray / Pool (Shown in Edit Mode or if unranked items exist) */}
      {(isEditMode || unrankedItems.length > 0) && (
        <div
          id="dropzone-unranked"
          onDragOver={(e) => handleDragOver(e, 'unranked')}
          onDragLeave={(e) => handleDragLeave(e, 'unranked')}
          onDrop={(e) => handleDrop(e, 'unranked')}
          className={`tier-dropzone p-5 sm:p-6 rounded-3xl bg-[#14131A] border transition-all duration-150 space-y-4 shadow-xl ${
            dragOverZone === 'unranked'
              ? 'border-fuchsia-500 bg-fuchsia-950/30 ring-2 ring-inset ring-fuchsia-500/50'
              : 'border-[#252233]'
          }`}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <h4 className="text-xs font-bold text-[#F3F1F8] uppercase tracking-wider font-mono">
                Пул тайтлов без ранга ({unrankedItems.length})
              </h4>
              <span className="text-[11px] text-[#9A94AA] font-mono">
                • {tierList.category}
              </span>
            </div>

            {isEditMode && (
              <button
                onClick={() => setShowAddMediaModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold font-mono shadow-md shadow-fuchsia-950/40 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить тайтлы</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-3.5 min-h-[100px] p-4 rounded-2xl bg-[#191724]/70 border border-[#252233]">
            {unrankedItems.length === 0 ? (
              <div className="w-full flex items-center justify-center text-xs text-[#6B667B] font-mono py-6 select-none pointer-events-none">
                {isEditMode
                  ? 'Все добавленные тайтлы распределены по рангам! Нажмите «Добавить тайтлы», чтобы найти еще медиа.'
                  : 'Все тайтлы уже распределены по рангам'}
              </div>
            ) : (
              unrankedItems.map((it) => {
                const targetId = it.id || it.mediaId;
                const mediaObj = resolvedMediaMap.get(targetId);
                const poster = it.posterUrl || mediaObj?.posterUrl;
                const title = it.title || mediaObj?.title || 'Без названия';
                const targetType = (it.type || mediaObj?.type || 'item')
                  .toLowerCase()
                  .replace(/_/g, '-');
                const isBeingDragged = draggedItemId === targetId;

                return (
                  <div
                    key={targetId}
                    id={`drag-item-${targetId}`}
                    draggable={isEditMode}
                    onDragStart={(e) => handleDragStart(e, targetId)}
                    onDragEnd={handleDragEnd}
                    className={`group relative w-20 sm:w-24 aspect-[2/3] rounded-2xl overflow-hidden bg-[#201D2C] border transition-all duration-150 shrink-0 border-[#2E2A40] hover:border-fuchsia-400 shadow-md hover:scale-105 hover:shadow-xl ${
                      isBeingDragged ? 'opacity-40 scale-95 border-fuchsia-500' : ''
                    } ${isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                  >
                    {poster ? (
                      <img
                        src={poster}
                        alt={title}
                        draggable={false}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover select-none pointer-events-none"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-zinc-900 select-none pointer-events-none">
                        <Film className="w-5 h-5 text-zinc-500 mb-1" />
                        <span className="text-[10px] text-zinc-300 line-clamp-3 leading-tight font-medium">
                          {title}
                        </span>
                      </div>
                    )}

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-[#0F0E13]/90 backdrop-blur-[2px] p-2 opacity-0 group-hover:opacity-100 flex flex-col justify-between transition-opacity text-left">
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[10px] font-bold text-white line-clamp-2 leading-tight">
                          {title}
                        </span>
                        {isEditMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveItem(targetId);
                            }}
                            className="text-rose-400 hover:text-rose-300 p-0.5"
                            title="Удалить"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {isEditMode ? (
                        <div className="grid grid-cols-3 gap-1 pt-1">
                          {tiers.map((t) => (
                            <button
                              key={t.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveItem(targetId, t.id);
                              }}
                              className="text-[9px] font-black uppercase rounded py-0.5 bg-zinc-800 text-zinc-300 hover:bg-fuchsia-600 hover:text-white transition-colors text-center"
                            >
                              {t.label.slice(0, 2)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          onClick={() => navigate(`/media/${targetType}/${targetId}`)}
                          className="inline-flex items-center gap-1 text-[9px] text-fuchsia-300 font-mono font-semibold hover:text-fuchsia-200 mt-auto"
                        >
                          <span>Открыть</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Add Media Modal */}
      {showAddMediaModal && (
        <AddMediaModal
          category={tierList.category || 'MOVIES_TV'}
          existingMediaIds={items.map((i) => i.id)}
          onClose={() => setShowAddMediaModal(false)}
          onAddMedia={handleAddMedia}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        title="Удалить тир-лист?"
        message="Вы уверены, что хотите безвозвратно удалить этот тир-лист?"
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteTierList}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
};
