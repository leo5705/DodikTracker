import React from 'react';
import { Trophy, Award, CheckCircle2, Lock, Sparkles } from 'lucide-react';

interface Achievement {
  id?: string | number;
  name: string;
  description?: string;
  icon?: string;
  percent?: number;
  unlocked?: boolean;
}

interface ContentAchievementsProps {
  achievements?: Achievement[];
  criticScore?: any;
}

export const ContentAchievements: React.FC<ContentAchievementsProps> = ({
  achievements,
  criticScore,
}) => {
  const hasAchievements = achievements && achievements.length > 0;

  if (!hasAchievements && !criticScore) {
    return (
      <div className="p-8 rounded-3xl bg-[#11152A] border border-[#1E2442] text-center space-y-2">
        <Trophy className="w-8 h-8 text-[#64748B] mx-auto stroke-1" />
        <p className="text-xs text-[#94A3B8]">Информация о достижениях и наградах отсутствует для этого тайтла</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 rounded-3xl bg-[#11152A] border border-[#1E2442] space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1E2442] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#151932] border border-amber-500/30 text-amber-400">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#F8FAFC]">Достижения и награды</h2>
            <p className="text-xs text-[#94A3B8]">
              {hasAchievements ? `Всего достижений: ${achievements.length}` : 'Признание критиков'}
            </p>
          </div>
        </div>

        {criticScore && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0B0D20] border border-amber-500/30 text-xs font-bold text-amber-300">
            <Award className="w-4 h-4 text-amber-400" />
            <span>{criticScore.source}: {criticScore.score}</span>
          </div>
        )}
      </div>

      {/* Achievements List */}
      {hasAchievements ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {achievements.map((ach, idx) => (
            <div
              key={ach.id || idx}
              className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                ach.unlocked
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-[#0B0D20] border-[#1E2442] hover:border-[#8B5CF6]/30'
              }`}
            >
              {ach.icon ? (
                <img
                  src={ach.icon}
                  alt={ach.name}
                  className="w-10 h-10 rounded-xl object-cover bg-[#151932] border border-[#1E2442] shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-[#151932] border border-[#1E2442] flex items-center justify-center text-amber-400 shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-[#F8FAFC] truncate">{ach.name}</span>
                  {ach.percent !== undefined && (
                    <span className="text-[10px] font-mono text-[#94A3B8] shrink-0">
                      {ach.percent}%
                    </span>
                  )}
                </div>
                {ach.description && (
                  <p className="text-[11px] text-[#94A3B8] line-clamp-2 leading-relaxed">
                    {ach.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-[#0B0D20] border border-[#1E2442] text-xs text-[#94A3B8]">
          Официальные достижения синхронизируются через игровые платформы (Steam, RAWG).
        </div>
      )}
    </div>
  );
};
