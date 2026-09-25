# Dodik Tracker - Production Deployment & Operations Guide

Руководство по развертыванию, управлению процессами через PM2, безопасному обновлению, миграциям базы данных и резервному копированию для self-hosted инстанса Dodik Tracker.

---

## 1. Системные требования и окружение

- **ОС**: Ubuntu 24.04 LTS / Debian 12
- **Node.js**: v20.x LTS (рекомендуется v22.x LTS для `firebase-admin`)
- **npm**: 10.x+
- **PostgreSQL**: 15 или 16
- **Process Manager**: PM2 (имя процесса: `dodik-tracker`)
- **Reverse Proxy**: Nginx
- **Порт приложения**: `127.0.0.1:3000`
- **Ветка репозитория**: `main`

---

## 2. Конфигурация Nginx

Приложение работает на локальном порту `3000` за Nginx reverse proxy.

### Конфигурация виртуального хоста (`/etc/nginx/sites-enabled/track.blgcloud.ru`):
```nginx
server {
    server_name track.blgcloud.ru;

    # Важно: для загрузки аудиофайлов исполнителей
    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

> **Важно:** Обновление приложения Dodik Tracker **НЕ требует** перезапуска Nginx (`systemctl reload nginx`). Перезапускается только Node.js процесс в PM2. Nginx конфигурация сервера не изменяется скриптами обновления.

---

## 3. Запуск и управление через PM2

Имя production-процесса: **`dodik-tracker`**.

### Первоначальный запуск процесса:
```bash
cd /var/www/dodik-tracker
npm run build
pm2 start dist/server.cjs --name dodik-tracker --time
pm2 save
pm2 startup
```

### Команды мониторинга и диагностики:
```bash
# Проверка статуса процесса
pm2 status dodik-tracker

# Просмотр логов в реальном времени
pm2 logs dodik-tracker

# Просмотр последних 40 строк логов без стриминга
pm2 logs dodik-tracker --lines 40 --nostream

# Перезапуск сервиса вручную
pm2 restart dodik-tracker
```

---

## 4. Резервное копирование (PostgreSQL Backups)

В проекте реализован единый Backup Manager (`scripts/backup.sh`), используемый CLI, движком обновлений и панелью администратора.

### Где хранятся бэкапы:
Все резервные копии сохраняются в каталоге:
```text
/var/www/dodik-tracker/backups/
```
Формат файлов:
- `dodik_tracker_backup_YYYYMMDD_HHMMSS.sql` — полный SQL-дамп PostgreSQL.
- `dodik_tracker_backup_YYYYMMDD_HHMMSS.sql.meta.json` — метаданные (размер, дата, имя БД, коммит Git, версия ПО, без секретов).

Каталог `backups/` добавлен в `.gitignore` и защищён от попадания в Git.

### Создание бэкапа вручную через SSH / CLI:
```bash
npm run backup
# или напрямую:
bash scripts/backup.sh create
```

### Просмотр списка бэкапов:
```bash
npm run backup:list
# или в формате JSON:
bash scripts/backup.sh list --json
```

### Политика хранения (Retention Policy):
* По умолчанию сохраняются **10 последних резервных копий** (`BACKUP_RETENTION_COUNT=10` в `.env`).
* Ротация выполняется автоматически после каждого успешного бэкапа.
* Защитный барьер: система **никогда не удаляет единственный оставшийся бэкап**.

### Управление через Админ-панель:
Администраторы могут создавать, просматривать список, скачивать `.sql` файл на компьютер и безопасно удалять устаревшие копии в разделе:
**Админ-панель -> Обслуживание и система -> Резервные копии**.

---

## 5. Процесс обновления (Production Update Flow)

Движок обновления (`scripts/update.sh`) полностью автономен, идемпотентен и безопасен.

### Полная цепочка выполнения:
1. **Update Lock**: блокировка через `flock` (`/var/lock/dodik-tracker-update.lock`), предотвращающая одновременные запуски.
2. **Проверка окружения и Git**: проверка утилит (`git`, `npm`, `node`, `pg_dump`, `pm2`, `curl`) и чистоты рабочей копии (при незакоммиченных файлах процесс прерывается).
3. **Обязательный бэкап БД**: запуск `scripts/backup.sh`. Если дамп не удался — **обновление немедленно прекращается** (`UPDATE MUST STOP`).
4. **Git Fetch**: `git fetch origin main`. Сравнение локального и удалённого коммита. Если изменений нет — выход с кодом `0`.
5. **Git Pull**: `git pull --ff-only origin main` (только fast-forward, никаких авто-мерджей).
6. **npm install**: установка зависимостей.
7. **Миграции БД**: `npm run db:migrate` (Drizzle ORM).
8. **Сборка**: `npm run build` с верификацией наличия `dist/server.cjs`.
9. **Перезапуск**: `pm2 restart dodik-tracker`.
10. **Health Check**: опрос `http://localhost:3000/api/health` до 15 секунд с подтверждением `"status":"UP"`.

### Вариант 1: Запуск через SSH (CLI)
```bash
cd /var/www/dodik-tracker
npm run update
```

### Вариант 2: Запуск через Web UI Админ-панели
1. Откройте **Панель управления -> Обслуживание и система**.
2. Нажмите **«Проверить обновления»**.
3. При обнаружении новых коммитов нажмите **«Создать backup и обновить»**.
4. Подтвердите действие в модальном окне.
5. Прогресс отслеживается в реальном времени с выводом консольных логов.

---

## 6. Проверка здоровья (Health Check)

Эндпоинт проверки:
```bash
curl -fsS http://localhost:3000/api/health
```

Ожидаемый ответ:
```json
{
  "status": "UP",
  "service": "Dodik Tracker",
  "version": "1.0.0",
  "environment": "production",
  "database": {
    "status": "connected",
    "latencyMs": 4
  },
  "uptime": 1284,
  "timestamp": "2026-09-24T18:40:00.000Z"
}
```

Если база данных недоступна или сервис не поднялся, эндпоинт возвращает HTTP 503 со статусом `"status": "DOWN"`, и обновление помечается как проваленное.

---

## 7. Процедура при ошибке обновления (Rollback Procedure)

Если обновление завершилось со сбоем:
1. База данных **не повреждена**, так как бэкап был снят до изменения файлов.
2. Проверьте журнал:
   ```bash
   tail -n 100 logs/update.log
   pm2 logs dodik-tracker --lines 40 --nostream
   ```
3. Для отката на стабильный коммит:
   ```bash
   git checkout <ПРЕДЫДУЩИЙ_СТАБИЛЬНЫЙ_ХЕШ>
   ```
4. При необходимости восстановите базу данных из созданного дампа:
   ```bash
   npm run restore backups/dodik_tracker_backup_YYYYMMDD_HHMMSS.sql
   # или с явным флагом подтверждения:
   bash scripts/restore.sh backups/dodik_tracker_backup_YYYYMMDD_HHMMSS.sql --confirm
   ```
5. Пересоберите и перезапустите приложение:
   ```bash
   npm install
   npm run build
   pm2 restart dodik-tracker
   ```

---

## 8. Операции, которые НЕ выполняются автоматически

В целях безопасности и стабильности операционной системы следующие действия **намеренно не выполняются автоматически**:
1. **Обновление Node.js на сервере**: скрипты выводят предупреждение, если версия Node.js ниже v22, но системные пакеты apt/nvm не затрагиваются.
2. **Перезагрузка или изменение Nginx**: конфигурации в `/etc/nginx/` являются серверными и не модифицируются приложением.
3. **Деструктивный сброс Git**: команды `git reset --hard` и `git clean -fd` заблокированы; локальные незакоммиченные файлы пользователя никогда не удаляются.
4. **Автоматический откат БД (Restore)**: восстановление базы данных из дампа заменяет все существующие данные и всегда требует явного осознанного подтверждения администратора (`--confirm`).
