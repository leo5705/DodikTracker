import fs from 'fs';
const FILE = 'src/components/auth/AuthGatekeeper.tsx';
let code = fs.readFileSync(FILE, 'utf-8');

code = code.replace(
`            {regMode === 'CLOSED' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Shield className="w-3 h-3" />
                Новая регистрация закрыта администрацией
              </span>
            )}`,
`            {regMode === 'CLOSED' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Shield className="w-3 h-3" />
                Новая регистрация закрыта администрацией
              </span>
            )}
            {regMode === 'MAINTENANCE' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <AlertCircle className="w-3 h-3" />
                Технические работы. Вход только для администраторов.
              </span>
            )}`
);

code = code.replace(
`              {regMode === 'CLOSED' ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-center">
                  Регистрация новых участников временно приостановлена.
                </div>
              ) : (`,
`              {regMode === 'CLOSED' || regMode === 'MAINTENANCE' ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-center">
                  {regMode === 'MAINTENANCE' ? 'Регистрация отключена на время проведения технических работ.' : 'Регистрация новых участников временно приостановлена.'}
                </div>
              ) : (`
);

code = code.replace(
`    if (regMode === 'CLOSED') {
      setError('Регистрация временно закрыта администратором.');
      return;
    }`,
`    if (regMode === 'CLOSED' || regMode === 'MAINTENANCE') {
      setError('Регистрация временно закрыта.');
      return;
    }`
);

fs.writeFileSync(FILE, code);
