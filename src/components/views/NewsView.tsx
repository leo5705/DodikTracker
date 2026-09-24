import React, { useState, useEffect } from 'react';
import {
  Newspaper,
  Search,
  Calendar,
  Eye,
  Tag,
  ArrowRight,
  Pin,
  Star,
  RotateCw,
  User,
} from 'lucide-react';
import { useRouter } from '../../context/RouterContext.tsx';

export const NewsView: React.FC = () => {
  const { navigate } = useRouter();
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (selectedTag) params.set('tag', selectedTag);

      const res = await fetch(`/api/news?${params.toString()}`);
      if (!res.ok) throw new Error('Ошибка загрузки новостей');
      const data = await res.json();
      setArticles(data.items || []);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить новости');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, [selectedTag]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchNews();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fade-in">
      {/* Hero / Header */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0B0D20] border border-[#1E2442] p-6 sm:p-10 shadow-2xl">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[#A78BFA] text-xs font-bold uppercase tracking-wider font-mono">
            <Newspaper className="w-3.5 h-3.5" />
            <span>Новости & Анонсы</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-[#F8FAFC] tracking-tight">
            Новости Dodik Tracker
          </h1>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            Свежие обновления платформы, новости каталога, важные релизы и анонсы для сообщества.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442]">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по новостям и статьям..."
              className="w-full pl-9 pr-4 py-2 bg-[#11152A] border border-[#1E2442] rounded-xl text-xs text-[#F8FAFC] placeholder-[#64748B] outline-none focus:border-[#8B5CF6] transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#151932] hover:bg-[#8B5CF6]/20 border border-[#1E2442] hover:border-[#8B5CF6]/40 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Найти
          </button>
        </form>

        {selectedTag && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#94A3B8]">Тег:</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[#A78BFA] text-xs font-bold font-mono">
              #{selectedTag}
              <button onClick={() => setSelectedTag(null)} className="hover:text-white ml-1 cursor-pointer">
                ×
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Content List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3 bg-[#0B0D20] rounded-3xl border border-[#1E2442]">
          <RotateCw className="w-8 h-8 text-[#8B5CF6] animate-spin" />
          <span className="text-xs text-[#94A3B8] font-mono">Загрузка публикаций...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-400 text-xs bg-rose-500/10 rounded-2xl border border-rose-500/20">{error}</div>
      ) : articles.length === 0 ? (
        <div className="p-16 text-center rounded-3xl bg-[#0B0D20] border border-[#1E2442] text-[#64748B] space-y-3">
          <Newspaper className="w-12 h-12 mx-auto text-[#64748B]" />
          <p className="font-bold text-base text-[#F8FAFC]">Публикаций не найдено</p>
          <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
            {search || selectedTag
              ? 'Попробуйте изменить поисковый запрос или сбросить фильтр по тегу.'
              : 'В настоящий момент нет опубликованных новостей. Загляните позже!'}
          </p>
          {(search || selectedTag) && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedTag(null);
                fetchNews();
              }}
              className="px-4 py-2 rounded-xl bg-[#151932] text-white text-xs font-semibold mt-2 hover:bg-[#8B5CF6]/20 border border-[#1E2442] cursor-pointer"
            >
              Сбросить поиск
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((art) => {
            let tags: string[] = [];
            try {
              if (Array.isArray(art.tags)) tags = art.tags;
              else if (typeof art.tags === 'string') tags = JSON.parse(art.tags);
            } catch {}

            return (
              <div
                key={art.id}
                onClick={() => navigate(`/news/${art.slug}`)}
                className="group cursor-pointer rounded-2xl bg-[#0B0D20] border border-[#1E2442] hover:border-[#8B5CF6]/50 overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-xl space-y-0"
              >
                {/* Cover Image */}
                <div className="relative w-full h-48 bg-[#11152A] overflow-hidden">
                  {art.cover ? (
                    <img
                      src={art.cover}
                      alt={art.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#64748B]">
                      <Newspaper className="w-12 h-12" />
                    </div>
                  )}

                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                    {art.isPinned && (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500/90 text-black shadow-lg">
                        <Pin className="w-3 h-3 fill-black" /> Закреплено
                      </span>
                    )}
                    {art.isFeatured && (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-[#7C3AED]/90 text-white shadow-lg">
                        <Star className="w-3 h-3 fill-white" /> Главное
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-bold text-base text-[#F8FAFC] group-hover:text-[#A78BFA] transition-colors line-clamp-2">
                      {art.title}
                    </h3>
                    {art.excerpt && (
                      <p className="text-xs text-[#94A3B8] line-clamp-3 leading-relaxed">
                        {art.excerpt}
                      </p>
                    )}
                  </div>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {tags.slice(0, 3).map((tag, idx) => (
                        <span
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTag(tag);
                          }}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#151932] hover:bg-[#8B5CF6]/20 text-[#94A3B8] hover:text-[#A78BFA] border border-[#1E2442] transition-colors font-mono"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Meta footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-[#1E2442] text-[11px] text-[#94A3B8]">
                    <div className="flex items-center gap-2">
                      {art.authorAvatar ? (
                        <img
                          src={art.authorAvatar}
                          alt={art.authorUsername}
                          className="w-5 h-5 rounded-lg object-cover border border-[#1E2442]"
                        />
                      ) : (
                        <User className="w-4 h-4 text-[#64748B]" />
                      )}
                      <span className="font-medium text-[#F8FAFC]">@{art.authorUsername || 'admin'}</span>
                    </div>

                    <div className="flex items-center gap-3 font-mono">
                      <span className="flex items-center gap-1 text-[#64748B]">
                        <Eye className="w-3 h-3" />
                        {art.viewsCount || 0}
                      </span>
                      <span>
                        {art.publishedAt
                          ? new Date(art.publishedAt).toLocaleDateString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                          : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
