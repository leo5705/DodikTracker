# Инструкция по обновлению Dodik Tracker

Руководство по процедуре безопасного обновления Dodik Tracker в рабочей среде с гарантией 100% сохранности базы данных и пользовательских файлов (Audio & Covers).

---

## 1. Архитектура изоляции данных (Zero-Data-Loss Architecture)

В проекте Dodik Tracker данные строго разделены по уровням владения:

```text
┌───────────────────────────────┐
│     Git Repository (GitHub)   │ -> ИСКЛЮЧИТЕЛЬНО исходный код приложения
│     leo5705/DodikTracker      │    (public/uploads/* игнорируются, в Git только .gitkeep)
└──────────────┬────────────────┘
               │  git pull --ff-only
               ▼
┌───────────────────────────────┐
│    Production Deployment      │ -> /var/www/dodik-tracker
└──────────────┬────────────────┘
               │
       ┌───────┴───────────────────────────────┐
       ▼                                       ▼
┌───────────────────────────────┐   ┌─────────────────────────────────────────┐
│     PostgreSQL Database       │   │       Persistent User Uploads           │
│     (dodik_tracker)           │   │       /public/uploads/                  │
│  - Пользователи, Музыка       │   │       ├── audio/ (*.mp3, *.wav, etc.)   │
│  - Отзывы, Оценки 0-100       │   │       └── covers/ (*.jpg, *.webp, etc.) │
└───────────────────────────────┘   └─────────────────────────────────────────┘
```

---

## 2. Единый цикл безопасного обновления (Safe Update Engine)

Процесс обновления спроектирован по принципу абсолютной защиты данных:

```text
Admin Web UI / SSH CLI (npm run update)
  ↓
1. Update Lock (/var/lock/dodik-tracker-update.lock)
  ↓
2. Preflight: проверка окружения (Git, Node, PM2, tar, curl, pg_dump)
  ↓
3. Git Safety Guard: проверка .gitignore и отсутствия реальных media-файлов в Git-индексе
  ↓
4. Резервная копия PostgreSQL: backups/db/dodik_tracker_backup_*.sql
  ↓
5. Снимок Uploads: манифест (SHA-256, размер) + архив backups/uploads/dodik_tracker_uploads_*.tar.gz
  ↓
6. Git fetch origin main & Git pull --ff-only origin main
  ↓
7. Установка зависимостей: npm install
  ↓
8. Миграции базы данных: npm run db:migrate (Drizzle ORM)
  ↓
9. Production сборка: npm run build (Vite + esbuild -> dist/server.cjs)
  ↓
10. Перезапуск PM2: pm2 restart dodik-tracker
  ↓
11. Health Check: опрос /api/health (до 20 сек, статус HTTP 200 UP)
  ↓
12. Контроль целостности Uploads: пофайловая сверка с pre-update снимком (SHA-256 + размер)
    └─ При обнаружении пропажи: АВТОМАТИЧЕСКОЕ ВОССТАНОВЛЕНИЕ из архива
  ↓
13. Диагностика БД ↔ Filesystem (проверка битых ссылок и orphan-файлов)
  ↓
14. Итоговый статус (SUCCESS / FAILURE / RECOVERED)
```

---

## 3. Способы обновления

### Способ А: Через Web UI в Панели администратора (Рекомендуется)
1. Авторизуйтесь под учетной записью с ролью `ADMIN` или `SUPER_ADMIN`.
2. Перейдите в раздел **«Обслуживание и система»**.
3. Нажмите кнопку **«Проверить обновления»**.
4. При наличии новых коммитов нажмите **«Создать backup и обновить»** и подтвердите действие.
5. Наблюдайте за ходом выполнения через встроенную консоль журнала в реальном времени.

### Способ Б: Через терминал SSH
```bash
cd /var/www/dodik-tracker
npm run update
```

Команда автоматически выполнит создание снимка uploads, бэкапа БД, fast-forward pull, миграции, сборку, перезапуск PM2, верификацию целостности и диагностику.

---

## 4. Резервные копии и восстановление

### Создание резервной копии базы данных (PostgreSQL):
```bash
npm run backup:db
# или просто:
npm run backup
```

### Создание архива пользовательских файлов (Audio & Covers):
```bash
npm run backup:uploads
```

### Создание полного бэкапа (БД + Uploads):
```bash
npm run backup:all
```

### Просмотр списка существующих копий:
```bash
npm run backup:list
```

### Восстановление:
```bash
# Восстановление базы данных:
npm run restore backups/db/dodik_tracker_backup_YYYYMMDD_HHMMSS.sql
# или для скрипта:
bash scripts/restore.sh backups/db/dodik_tracker_backup_YYYYMMDD_HHMMSS.sql --confirm

# Восстановление файлов uploads:
npm run restore backups/uploads/dodik_tracker_uploads_YYYYMMDD_HHMMSS.tar.gz --confirm
```

---

## 5. Диагностика базы данных и файлов (DB ↔ Filesystem)

Для проверки соответствия ссылок в БД реальным файлам на диске:

```bash
npm run db:verify-files
# или с выводом в формате JSON:
npx tsx src/scripts/verifyUploads.ts --json
```

Диагностика проверяет:
- **Broken DB references**: ссылки в таблицах `music_tracks`, `music_releases`, `artist_profiles`, `users`, `news`, `lists`, файлы которых отсутствуют на диске.
- **Orphan files**: файлы в `public/uploads/audio` и `public/uploads/covers`, на которые нет ссылок в БД (выводятся информационно, **никогда не удаляются автоматически**).
- **HTTP accessibility**: проверяет отдачу файлов через Express (`HTTP 200`).

---

## 6. Тестирование защищенности обновлений (E2E Test)

Для проведения автономного изолированного теста сохранности файлов:

```bash
npm run test:safety
```
