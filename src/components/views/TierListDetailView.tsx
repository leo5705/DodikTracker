import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Layers,
  Globe,
  Lock,
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useRouter } from '../../context/RouterContext.tsx';
import { ConfirmModal } from '../modals/ConfirmModal.tsx';
import { AddMediaModal } from '../tier-lists/AddMediaModal.tsx';
import {
  PrimaryButton,
  SecondaryButton,
  DestructiveButton,
} from '../design-system/index.ts';

interface TierListDetailViewProps {
  tierListId: number;
}

interface TierDefinition {
  id: string;
  label: string;
  color: string;
}

interface TierItem {
  id: number;
  mediaId?: number;
  title: string;
  type?: string;
  posterUrl?: string;
  tierId: string;
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

      let parsedItems: any[] = [];
      try {
        parsedItems = JSON.parse(data.itemsJson || '[]');
      } catch (_e) {}

      const map = new Map<number, any>();
      if (Array.isArray(data.resolvedMedia)) {
        data.resolvedMedia.forEach((m: any) => map.set(m.id, m));
      }
      setResolvedMediaMap(map);

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

  const isOwner =
    dbUser && (dbUser.id === tierList?.ownerId || dbUser.role === 'ADMIN' || dbUser.role === 'SUPER_ADMIN');
  const canEdit = Boolean(isOwner && isEditMode);

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

  const handleMoveItem = (itemId: number, targetTierId: string) => {
    if (!isOwner) return;
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, tierId: targetTierId } : it))
    );
  };

  const handleRemoveItem = (itemId: number) => {
    if (!isOwner) return;
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  };

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
        <Loader2 className="w-10 h-10 text-[#8B5CF6] animate-spin" />
        <p className="text-xs text-[#94A3B8] font-mono">Загрузка тир-листа...</p>
      </div>
    );
  }

  if (error || !tierList) {
    return (
      <div className="py-24 text-center space-y-4 max-w-lg mx-auto animate-fadeIn">
        <div className="w-14 h-14 rounded-2xl bg-rose-950/40 border border-rose-800/40 flex items-center justify-center mx-auto text-rose-400">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-[#F8FAFC] font-mono">Доступ ограничен</h2>
        <p className="text-xs text-[#94A3B8] leading-relaxed">{error}</p>
        <div className="pt-2">
          <PrimaryButton onClick={() => navigate('/tier-lists')}>
            Все тир-листы
          </PrimaryButton>
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
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>К тир-листам</span>
        </button>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
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
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isEditMode
                    ? 'bg-[#151932] text-[#F8FAFC] border border-[#1E2442]'
                    : 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white shadow-md shadow-[#7C3AED]/25'
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
                    <span>Редактировать</span>
                  </>
                )}
              </button>

              {isEditMode && (
                <button
                  onClick={handleSaveChanges}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950/40 transition-all disabled:opacity-50 cursor-pointer"
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

              <DestructiveButton
                onClick={() => setShowDeleteModal(true)}
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Удалить
              </DestructiveButton>
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
      <div className="p-6 sm:p-8 rounded-3xl bg-[#0B0D20] border border-[#1E2442] space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#151932] border border-[#1E2442] text-xs font-bold text-[#A78BFA]">
            <Layers className="w-3.5 h-3.5 text-[#8B5CF6]" />
            Категория: {tierList.category || 'МЕДИА'}
          </span>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#11152A] border border-[#1E2442] text-[11px] text-[#94A3B8] font-mono">
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

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#11152A] border border-[#1E2442] text-[11px] text-[#94A3B8] font-mono">
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
              className="w-full text-xl sm:text-2xl font-black text-[#F8FAFC] bg-[#11152A] border border-[#1E2442] rounded-2xl px-4 py-2.5 focus:outline-none focus:border-[#8B5CF6] transition-colors"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание тир-листа..."
              rows={2}
              className="w-full text-xs sm:text-sm text-[#F8FAFC] bg-[#11152A] border border-[#1E2442] rounded-2xl px-4 py-2 focus:outline-none focus:border-[#8B5CF6] transition-colors resize-none"
            />
          </div>
        ) : (
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight">
              {tierList.title}
            </h1>
            {tierList.description && (
              <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed max-w-3xl mt-2">
                {tierList.description}
              </p>
            )}
          </div>
        )}

        <div className="pt-2 flex items-center justify-between flex-wrap gap-3">
          <div
            onClick={() => navigate(`/u/${tierList.ownerUsername}`)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#11152A] border border-[#1E2442] hover:border-[#8B5CF6]/50 cursor-pointer transition-colors group"
          >
            <div className="w-6 h-6 rounded-full bg-[#151932] border border-[#1E2442] flex items-center justify-center text-[10px] font-bold text-[#A78BFA] overflow-hidden">
              {tierList.ownerAvatar ? (
                <img src={tierList.ownerAvatar} alt={tierList.ownerUsername} className="w-full h-full object-cover" />
              ) : (
                (tierList.ownerUsername?.[0] || 'U').toUpperCase()
              )}
            </div>
            <span className="text-xs text-[#94A3B8] group-hover:text-[#A78BFA] font-medium transition-colors">
              Автор: @{tierList.ownerUsername || 'anonymous'}
            </span>
          </div>

          {isEditMode && (
            <PrimaryButton
              onClick={() => setShowAddMediaModal(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              Добавить медиа ({tierList.category})
            </PrimaryButton>
          )}
        </div>
      </div>

      {/* Main Tier Board */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#1E2442] pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] font-mono">
            Ранжирование тайтлов ({items.filter((i) => i.tierId !== 'unranked').length} в рангах)
          </h3>
          {isEditMode && (
            <button
              onClick={handleAddTier}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#11152A] hover:bg-[#151932] border border-[#1E2442] text-xs font-bold text-[#A78BFA] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить ранг
            </button>
          )}
        </div>

        <div className="rounded-3xl bg-[#0B0D20] border border-[#1E2442] overflow-hidden shadow-2xl divide-y divide-[#1E2442]">
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
                    ? 'bg-[#8B5CF6]/15 ring-2 ring-inset ring-[#8B5CF6]/60'
                    : 'bg-[#0B0D20] hover:bg-[#11152A]'
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
                        className="w-20 sm:w-full text-center font-black text-xl sm:text-2xl bg-black/35 text-white rounded-xl px-2 py-1 border border-white/20 focus:outline-none focus:border-white shadow-inner"
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
                            className="p-1.5 rounded-lg bg-black/30 hover:bg-black/50 text-white transition-colors cursor-pointer"
                          >
                            <Palette className="w-3.5 h-3.5" />
                          </button>

                          {activeColorPickerTierId === tier.id && (
                            <div className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-1 z-30 p-2.5 rounded-2xl bg-[#0B0D20] border border-[#1E2442] shadow-2xl flex flex-wrap gap-1.5 w-44">
                              {TIER_COLOR_PRESETS.map((preset, pIdx) => (
                                <button
                                  key={pIdx}
                                  onClick={() => handleUpdateTierColor(tier.id, preset.value)}
                                  className={`w-6 h-6 rounded-lg ${preset.value} border border-white/20 hover:scale-110 transition-transform cursor-pointer`}
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
                          className="p-1.5 rounded-lg bg-black/30 hover:bg-black/50 text-white disabled:opacity-20 transition-colors cursor-pointer"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveTierOrder(tIdx, 'down')}
                          disabled={tIdx === tiers.length - 1}
                          title="Опустить ранг ниже"
                          className="p-1.5 rounded-lg bg-black/30 hover:bg-black/50 text-white disabled:opacity-20 transition-colors cursor-pointer"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete tier */}
                        <button
                          onClick={() => handleDeleteTier(tier.id)}
                          title="Удалить ранг"
                          className="p-1.5 rounded-lg bg-black/30 hover:bg-rose-900/60 text-rose-200 transition-colors cursor-pointer"
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
                      <span className="font-black text-2xl sm:text-3xl tracking-tight block">
                        {tier.label}
                      </span>
                      <span className="text-[10px] font-mono font-medium opacity-80 block">
                        {tierItems.length} {tierItems.length === 1 ? 'тайтл' : tierItems.length < 5 ? 'тайтла' : 'тайтлов'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Tier Items Container Dropzone */}
                <div className="flex-1 p-3 sm:p-4 flex flex-wrap gap-3.5 items-center min-w-0 bg-[#11152A]">
                  {tierItems.length === 0 ? (
                    <div className="w-full py-4 text-center text-xs text-[#64748B] italic font-mono select-none pointer-events-none">
                      {isEditMode
                        ? 'Перетащите тайтлы сюда или кликните ранг на карточке'
                        : 'В этом ранге пока нет тайтлов'}
                    </div>
                  ) : (
                    tierItems.map((it) => {
                      const mediaObj = resolvedMediaMap.get(it.id || it.mediaId);
                      const poster = it.posterUrl || mediaObj?.posterUrl;
                      const itemTitle = it.title || mediaObj?.title || 'Без названия';
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
                          className={`group relative w-20 sm:w-24 aspect-[2/3] rounded-2xl overflow-hidden bg-[#151932] border transition-all duration-150 shrink-0 border-[#1E2442] hover:border-[#8B5CF6] shadow-md hover:scale-105 hover:shadow-xl ${
                            isBeingDragged ? 'opacity-40 scale-95 border-[#8B5CF6]' : ''
                          } ${isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                        >
                          {poster ? (
                            <img
                              src={poster}
                              alt={itemTitle}
                              draggable={false}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover select-none pointer-events-none"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-[#151932] select-none pointer-events-none">
                              <Film className="w-5 h-5 text-[#64748B] mb-1" />
                              <span className="text-[10px] text-[#CBD5E1] line-clamp-3 leading-tight font-medium">
                                {itemTitle}
                              </span>
                            </div>
                          )}

                          {/* Hover Overlay */}
                          <div className="absolute inset-0 bg-black/85 backdrop-blur-[2px] p-2 opacity-0 group-hover:opacity-100 flex flex-col justify-between transition-opacity text-left">
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-[10px] font-bold text-white line-clamp-2 leading-tight">
                                {itemTitle}
                              </span>
                              {isEditMode && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveItem(targetId);
                                  }}
                                  className="text-rose-400 hover:text-rose-300 p-0.5 cursor-pointer"
                                  title="Удалить из тир-листа"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {isEditMode ? (
                              <div className="space-y-1 pt-1">
                                <div className="grid grid-cols-3 gap-1">
                                  {tiers.map((t) => (
                                    <button
                                      key={t.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveItem(targetId, t.id);
                                      }}
                                      className={`text-[9px] font-black uppercase rounded py-0.5 transition-all cursor-pointer ${
                                        it.tierId === t.id
                                          ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white ring-1 ring-white/50'
                                          : 'bg-[#151932] text-[#CBD5E1] hover:bg-[#8B5CF6] hover:text-white'
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
                                  className="w-full text-[9px] text-[#94A3B8] hover:text-white bg-[#0B0D20] hover:bg-[#151932] rounded py-0.5 font-medium transition-colors text-center cursor-pointer"
                                >
                                  В пул
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => navigate(`/media/${targetType}/${targetId}`)}
                                className="inline-flex items-center gap-1 text-[9px] text-[#A78BFA] font-semibold hover:text-white mt-auto cursor-pointer"
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

      {/* Unranked Tray / Pool */}
      {(isEditMode || unrankedItems.length > 0) && (
        <div
          id="dropzone-unranked"
          onDragOver={(e) => handleDragOver(e, 'unranked')}
          onDragLeave={(e) => handleDragLeave(e, 'unranked')}
          onDrop={(e) => handleDrop(e, 'unranked')}
          className={`tier-dropzone p-5 sm:p-6 rounded-3xl bg-[#0B0D20] border transition-all duration-150 space-y-4 shadow-xl ${
            dragOverZone === 'unranked'
              ? 'border-[#8B5CF6] bg-[#8B5CF6]/15 ring-2 ring-inset ring-[#8B5CF6]/50'
              : 'border-[#1E2442]'
          }`}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <h4 className="text-xs font-bold text-[#F8FAFC] uppercase tracking-wider font-mono">
                Пул тайтлов без ранга ({unrankedItems.length})
              </h4>
              <span className="text-[11px] text-[#94A3B8] font-mono">
                • {tierList.category}
              </span>
            </div>

            {isEditMode && (
              <button
                onClick={() => setShowAddMediaModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить тайтлы</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-3.5 min-h-[100px] p-4 rounded-2xl bg-[#11152A] border border-[#1E2442]">
            {unrankedItems.length === 0 ? (
              <div className="w-full flex items-center justify-center text-xs text-[#64748B] font-mono py-6 select-none pointer-events-none">
                {isEditMode
                  ? 'Все добавленные тайтлы распределены по рангам! Нажмите «Добавить тайтлы», чтобы найти еще медиа.'
                  : 'Все тайтлы уже распределены по рангам'}
              </div>
            ) : (
              unrankedItems.map((it) => {
                const targetId = it.id || it.mediaId;
                const mediaObj = resolvedMediaMap.get(targetId);
                const poster = it.posterUrl || mediaObj?.posterUrl;
                const itemTitle = it.title || mediaObj?.title || 'Без названия';
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
                    className={`group relative w-20 sm:w-24 aspect-[2/3] rounded-2xl overflow-hidden bg-[#151932] border transition-all duration-150 shrink-0 border-[#1E2442] hover:border-[#8B5CF6] shadow-md hover:scale-105 hover:shadow-xl ${
                      isBeingDragged ? 'opacity-40 scale-95 border-[#8B5CF6]' : ''
                    } ${isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                  >
                    {poster ? (
                      <img
                        src={poster}
                        alt={itemTitle}
                        draggable={false}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover select-none pointer-events-none"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-[#151932] select-none pointer-events-none">
                        <Film className="w-5 h-5 text-[#64748B] mb-1" />
                        <span className="text-[10px] text-[#CBD5E1] line-clamp-3 leading-tight font-medium">
                          {itemTitle}
                        </span>
                      </div>
                    )}

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/85 backdrop-blur-[2px] p-2 opacity-0 group-hover:opacity-100 flex flex-col justify-between transition-opacity text-left">
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[10px] font-bold text-white line-clamp-2 leading-tight">
                          {itemTitle}
                        </span>
                        {isEditMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveItem(targetId);
                            }}
                            className="text-rose-400 hover:text-rose-300 p-0.5 cursor-pointer"
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
                              className="text-[9px] font-black uppercase rounded py-0.5 bg-[#0B0D20] text-[#CBD5E1] hover:bg-[#8B5CF6] hover:text-white transition-colors text-center cursor-pointer"
                            >
                              {t.label.slice(0, 2)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          onClick={() => navigate(`/media/${targetType}/${targetId}`)}
                          className="inline-flex items-center gap-1 text-[9px] text-[#A78BFA] font-semibold hover:text-white mt-auto cursor-pointer"
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
