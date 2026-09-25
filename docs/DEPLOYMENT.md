# Dodik Tracker - Production Deployment & Operations Guide

Руководство по развертыванию, управлению процессами через PM2, безопасному обновлению, миграциям базы данных, persistent uploads и резервному копированию для self-hosted инстанса Dodik Tracker.

---

## 1. Системные требования и окружение

- **ОС**: Ubuntu 24.04 LTS / Debian 12
- **Node.js**: v20.x LTS (рекомендуется v22.x LTS)
- **npm**: 10.x+
- **PostgreSQL**: 15 или 16
- **Process Manager**: PM2 (имя процесса: `dodik-tracker`)
- **Reverse Proxy**: Nginx
- **Порт приложения**: `127.0.0.1:3000`
- **Ветка репозитория**: `main`
- **Каталог постоянных загрузок**: `/var/www/dodik-tracker/public/uploads` (или внешний путь через переменную `UPLOADS_DIR`)

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

> **Важно:** Обновление приложения Dodik Tracker **НЕ требует** перезапуска Nginx (`systemctl reload nginx`). Перезапускается только Node.js процесс в PM2.

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

### Команды мониторинга:
```bash
pm2 status dodik-tracker
pm2 logs dodik-tracker --lines 40 --nostream
pm2 restart dodik-tracker
```

---

## 4. Резервное копирование (Database & Uploads Backups)

В проекте реализован единый Backup Manager (`scripts/backup.sh`), разделяющий дамп базы данных и архивацию пользовательских файлов:

### Структура каталога `backups/`:
```text
/var/www/dodik-tracker/backups/
├── db/                     # Дампы PostgreSQL (.sql + .meta.json)
├── uploads/                # Архивы пользовательских audio/covers (.tar.gz + .meta.json)
└── snapshots/              # Pre-update JSON манифесты файлов
```

Каталог `backups/` добавлен в `.gitignore` и защищён от попадания в Git.

### Команды создания бэкапов:
```bash
# Дамп базы данных:
npm run backup:db

# Архив пользовательских загрузок (Audio & Covers):
npm run backup:uploads

# Полный бэкап (БД + Uploads):
npm run backup:all

# Просмотр списка бэкапов:
npm run backup:list
```

---

## 5. Защита пользовательских файлов (Uploads Persistence)

1. **Git Protection**: В `.gitignore` настроены строгие правила игнорирования содержимого `public/uploads/*`. В Git хранятся только маркеры `.gitkeep`.
2. **Pre-update Snapshot**: Перед любым изменением кода скрипт `scripts/update.sh` создает снимок всех файлов с контрольными суммами SHA-256 и архив `dodik_tracker_uploads_*.tar.gz`.
3. **Integrity Check & Auto-Recovery**: После завершения сборки и миграций скрипт сверяет каждый файл. Если обнаружена пропажа файла, запускается автоматическое восстановление из архива.
4. **Запрет деструктивных команд**: Команды `git clean -fd` и `git reset --hard` категорически запрещены в процедуре обновления.
