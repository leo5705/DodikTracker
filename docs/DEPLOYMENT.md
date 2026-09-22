# Dodik Tracker - Production Deployment & Operations Guide

Руководство по развертыванию, безопасному обновлению, миграциям базы данных и резервному копированию для self-hosted инстанса Dodik Tracker.

---

## 1. Системные требования

- **ОС**: Ubuntu 22.04+ / Debian 12 / любой современный Linux
- **Node.js**: v20.x или v22.x LTS
- **PostgreSQL**: v15 или v16
- **RAM**: от 1 GB (рекомендуется 2 GB)
- **Диск**: от 10 GB SSD
- **Порт**: `3000` (стандартный HTTP порт приложения)

---

## 2. Первоначальное развертывание

### Вариант А: Standalone / Systemd на VPS (Рекомендуется)

1. **Клонируйте репозиторий**:
   ```bash
   git clone <URL_РЕПОЗИТОРИЯ> /var/www/dodik-tracker
   cd /var/www/dodik-tracker
   ```

2. **Настройте переменные окружения**:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Укажите параметры подключения к PostgreSQL (`DATABASE_URL` или `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`), а также сгенерируйте надежный `JWT_SECRET`.

3. **Установите зависимости и соберите проект**:
   ```bash
   npm install
   npm run db:migrate
   npm run build
   ```

4. **Настройте автозапуск через Systemd**:
   Создайте файл `/etc/systemd/system/dodik-tracker.service`:
   ```ini
   [Unit]
   Description=Dodik Tracker Web Application
   After=network.target postgresql.service

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/dodik-tracker
   ExecStart=/usr/bin/node dist/server.cjs
   Restart=always
   RestartSec=5
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```

   Запустите и включите сервис:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now dodik-tracker
   ```

---

### Вариант Б: Docker Compose

1. Заполните `.env` файл.
2. Запустите стек:
   ```bash
   docker compose up -d --build
   ```
3. Примените миграции:
   ```bash
   docker compose run --rm app npm run db:migrate
   ```

---

## 3. Регулярный процесс обновления (Production Update Flow)

В проекте реализована единая автоматизированная команда обновления, которая выполняет полную цепочку безопасности:
1. Проверка статуса Git.
2. Создание резервной копии PostgreSQL в `./backups/`.
3. Установка новых npm-зависимостей.
4. Автоматическое применение новых миграций БД (`npm run db:migrate`).
5. Сборка продакшн бандла (`npm run build`).
6. Проверка здоровья сервиса (`/api/health`).

### Запуск обновления:

```bash
cd /var/www/dodik-tracker

# Получите свежий код
git pull origin main

# Запустите единый скрипт обновления
npm run update
# или напрямую: ./scripts/update.sh

# Перезапустите сервис
sudo systemctl restart dodik-tracker
# (или pm2 restart dodik-tracker / docker compose restart app)
```

---

## 4. Работа с миграциями базы данных (Drizzle ORM)

При добавлении новых таблиц или изменении схемы данных в `src/db/schema.ts`:

1. **Сгенерировать SQL-миграцию**:
   ```bash
   npm run db:generate
   ```
   Drizzle-kit создаст новый файл в `drizzle/` (например `0002_user_favorites.sql`) и обновит `drizzle/meta/_journal.json`.

2. **Применить миграции на боевой БД**:
   ```bash
   npm run db:migrate
   ```
   Раннер миграций проверяет таблицу `__drizzle_migrations` и накатывает только новые миграции внутри транзакций `BEGIN ... COMMIT`.

3. **Проверить статус миграций**:
   ```bash
   npm run db:status
   ```

---

## 5. Резервное копирование и Восстановление

### Создание бэкапа вручную:
```bash
npm run backup
# или: ./scripts/backup.sh
```
Файл бэкапа сохраняется в `./backups/dodik_tracker_backup_YYYYMMDD_HHMMSS.sql`.

### Восстановление из бэкапа:
```bash
npm run restore
# или: ./scripts/restore.sh ./backups/dodik_tracker_backup_20260915_120000.sql
```
Скрипт запросит подтверждение перед перезаписью данных в БД.

---

## 6. Процедура отката (Rollback Procedure)

Если после выкатки релиза возникла критическая проблема:

1. **Откатите код на предыдущий стабильный коммит / тег**:
   ```bash
   git checkout v1.0.0
   ```
2. **Восстановите базу данных из бэкапа**, созданного перед обновлением:
   ```bash
   ./scripts/restore.sh ./backups/dodik_tracker_backup_ПРЕДЫДУЩИЙ.sql
   ```
3. **Пересоберите и перезапустите**:
   ```bash
   npm install
   npm run build
   sudo systemctl restart dodik-tracker
   ```

---

## 7. Мониторинг и Healthcheck

- **Эндпоинт проверки здоровья**: `http://localhost:3000/api/health`
  - Проверяет доступность сервера и выполняет `SELECT 1` к PostgreSQL.
  - Возвращает статус `UP` (HTTP 200) или `DOWN` (HTTP 503).
  - Безопасен для внешних мониторов (не содержит паролей).

- **Диагностика в панели администратора**:
  - В разделе **Панель управления -> Обновления** отображается текущая версия, количество примененных и ожидающих миграций, статус подключения и история релизов.
