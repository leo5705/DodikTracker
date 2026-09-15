import React, { useEffect, useState } from 'react';

interface SystemInfo {
  appVersion: string;
  database: {
    appliedMigrations: number;
    pendingMigrations: number;
  };
  manifest: {
    version: string;
    releaseDate: string;
    notes: string;
    changes?: {
      added?: string[];
      changed?: string[];
      fixed?: string[];
    };
    migrations?: string[];
  } | null;
}

export function AdminUpdatesTab() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [dbHealth, setDbHealth] = useState<'LOADING' | 'UP' | 'DOWN'>('LOADING');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const [versionRes, healthRes] = await Promise.all([
          fetch('/api/system/version'),
          fetch('/api/health/ready')
        ]);
        
        if (versionRes.ok) {
          setSystemInfo(await versionRes.json());
        }
        
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setDbHealth(healthData.status === 'UP' ? 'UP' : 'DOWN');
        } else {
          setDbHealth('DOWN');
        }
      } catch (err) {
        console.error('Failed to fetch system info:', err);
        setDbHealth('DOWN');
      } finally {
        setLoading(false);
      }
    };
    
    fetchSystemInfo();
  }, []);

  if (loading) {
    return <div className="text-gray-400">Загрузка информации о системе...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 shadow-sm">
        <h3 className="text-xl font-bold text-white mb-4">Статус Системы</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
            <div className="text-sm text-gray-400 mb-1">Версия Приложения</div>
            <div className="text-2xl font-bold text-white">{systemInfo?.appVersion || 'Unknown'}</div>
          </div>
          <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
            <div className="text-sm text-gray-400 mb-1">Миграции Базы Данных</div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-white">{systemInfo?.database.appliedMigrations || 0}</span>
              <span className="text-sm text-gray-400">применено</span>
            </div>
            {systemInfo?.database.pendingMigrations !== undefined && systemInfo.database.pendingMigrations > 0 && (
              <div className="text-sm text-amber-400 mt-1">Ожидает: {systemInfo.database.pendingMigrations}</div>
            )}
          </div>
          <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
            <div className="text-sm text-gray-400 mb-1">Статус Backend / БД</div>
            <div className="flex items-center space-x-2 mt-1">
              <span className="flex h-3 w-3 rounded-full bg-green-500"></span>
              <span className="font-semibold text-green-400">API: OK</span>
            </div>
            <div className="flex items-center space-x-2 mt-2">
              <span className={`flex h-3 w-3 rounded-full ${dbHealth === 'UP' ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className={`font-semibold ${dbHealth === 'UP' ? 'text-green-400' : 'text-red-400'}`}>
                Database: {dbHealth === 'UP' ? 'OK' : 'ERROR'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {systemInfo?.manifest && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-white">Последнее Обновление</h3>
            <span className="text-sm text-gray-400 bg-gray-700 px-3 py-1 rounded-full">
              {systemInfo.manifest.releaseDate}
            </span>
          </div>
          
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-white mb-2">
              Версия {systemInfo.manifest.version}
            </h4>
            <p className="text-gray-300">{systemInfo.manifest.notes}</p>
          </div>

          <div className="space-y-4">
            {systemInfo.manifest.changes?.added && systemInfo.manifest.changes.added.length > 0 && (
              <div>
                <h5 className="text-sm font-bold text-green-400 uppercase tracking-wider mb-2">Добавлено</h5>
                <ul className="list-disc list-inside text-gray-300 space-y-1">
                  {systemInfo.manifest.changes.added.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            )}
            
            {systemInfo.manifest.changes?.changed && systemInfo.manifest.changes.changed.length > 0 && (
              <div>
                <h5 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-2">Изменено</h5>
                <ul className="list-disc list-inside text-gray-300 space-y-1">
                  {systemInfo.manifest.changes.changed.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            )}
            
            {systemInfo.manifest.changes?.fixed && systemInfo.manifest.changes.fixed.length > 0 && (
              <div>
                <h5 className="text-sm font-bold text-orange-400 uppercase tracking-wider mb-2">Исправлено</h5>
                <ul className="list-disc list-inside text-gray-300 space-y-1">
                  {systemInfo.manifest.changes.fixed.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 border-dashed">
         <h4 className="text-md font-semibold text-gray-300 mb-2">Управление обновлениями</h4>
         <p className="text-sm text-gray-400 mb-4">
           Для установки новых обновлений используйте консольные команды на сервере. Эта панель предназначена только для мониторинга текущего состояния системы.
         </p>
         <code className="block bg-black/50 p-3 rounded text-sm text-gray-300 font-mono">
           # Сделать бэкап БД<br/>
           ./scripts/backup.sh<br/><br/>
           # Применить миграции<br/>
           npm run db:migrate
         </code>
      </div>
    </div>
  );
}
