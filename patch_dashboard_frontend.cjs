const fs = require('fs');

const path = 'src/components/admin/AdminDashboardTab.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'const { users, content, engagement, moderation, system, trends, recentAudit } = data;',
  'const { users, content: contentStats, engagement, moderation, system, trends, recentAudit, additionalStats } = data;'
);

content = content.replace(
  /{content\.total}/g,
  '{contentStats.total}'
);
content = content.replace(
  /{content\.hidden}/g,
  '{contentStats.hidden}'
);
content = content.replace(
  /content\.byCategory/g,
  'contentStats.byCategory'
);

content = content.replace(
  /<div className="text-\[10px\] text-\[\#9A94AA\] truncate">CMS публикации<\/div>/,
  '<div className="text-[10px] text-[#9A94AA] truncate">{additionalStats?.news?.published || 0} опубликовано, {additionalStats?.news?.drafts || 0} черновиков</div>'
);

content = content.replace(
  /<div className="text-\[10px\] text-\[\#9A94AA\] truncate">Баннеры платформы<\/div>/,
  '<div className="text-[10px] text-[#9A94AA] truncate">{additionalStats?.announcements?.active || 0} активных</div>'
);

content = content.replace(
  /<div className="text-\[10px\] text-\[\#9A94AA\] truncate">Рассылка сообщений<\/div>/,
  '<div className="text-[10px] text-[#9A94AA] truncate">{additionalStats?.notifications?.total || 0} отправлено</div>'
);

// Add Invites button
const invitesButton = `
        <button
          onClick={() => onNavigateTab('invites')}
          className="p-3.5 rounded-xl bg-[#191724] hover:bg-[#211E30] border border-[#2B273F] text-left transition-colors flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-300 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#F3F1F8] group-hover:text-pink-300 transition-colors truncate">
              Инвайты
            </div>
            <div className="text-[10px] text-[#9A94AA] truncate">{additionalStats?.invites?.active || 0} активных</div>
          </div>
        </button>
`;

content = content.replace(
  /<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">/,
  '<div className="grid grid-cols-2 sm:grid-cols-5 gap-3">'
);

content = content.replace(
  /<\/button>\s*<\/div>\s*\{\/\* Two Column Grid/,
  '</button>\n' + invitesButton + '\n      </div>\n\n      {/* Two Column Grid'
);

// Fix total users trend label
content = content.replace(
  /<span>\{trends\.registrations\?\.reduce[^<]+<\/span>/,
  '<span>{trends.registrations?.reduce((acc: number, r: any) => acc + (Number(r.count) || 0), 0) || 0} за 14 дн.</span>'
);

content = content.replace(
  /<span>\{trends\.userMedia\?\.reduce[^<]+<\/span>/,
  '<span>{trends.userMedia?.reduce((acc: number, r: any) => acc + (Number(r.count) || 0), 0) || 0} за 14 дн.</span>'
);

fs.writeFileSync(path, content);
console.log('Frontend patched.');
