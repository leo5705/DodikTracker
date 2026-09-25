# Инструкция по обновлению Dodik Tracker

Руководство по процедуре безопасного обновления Dodik Tracker в рабочей среде.

---

## 1. Единый цикл обновления (Unified Update Engine)

Процесс обновления спроектирован по принципу абсолютной сохранности пользовательских данных:

```text
Admin / SSH (npm run update)
  ↓
Update Lock (/var/lock/dodik-tracker-update.lock)
  ↓
Проверка окружения (Git, Node, PM2, pg_dump, curl)
  ↓
Резервная копия PostgreSQL (backups/dodik_tracker_backup_*.sql)
  ↓
Git fetch origin main
  ↓
Git pull --ff-only origin main
  ↓
npm install
  ↓
Миграции базы данных (npm run db:migrate)
  ↓
Production сборка (npm run build)
  ↓
Перезапуск PM2 (pm2 restart dodik-tracker)
  ↓
Health Check (/api/health -> "status":"UP")
  ↓
Итоговый статус (SUCCESS / FAILURE)
```

---

## 2. Способы обновления

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

Команда автоматически выполнит создание бэкапа, fast-forward pull, миграции, сборку, перезапуск PM2 и верификацию работоспособности.

---

## 3. Резервные копии и восстановление

### Создание резервной копии:
```bash
npm run backup
```

### Просмотр списка существующих копий:
```bash
npm run backup:list
```

### Восстановление при необходимости отката:
```bash
npm run restore backups/dodik_tracker_backup_YYYYMMDD_HHMMSS.sql
# или для скриптов:
bash scripts/restore.sh backups/dodik_tracker_backup_YYYYMMDD_HHMMSS.sql --confirm
```

---

## 4. Что делать при сбое обновления

Если обновление завершилось ошибкой:
1. База данных сохранена в пред-обновленческом состоянии благодаря обязательному предварительному дампу в каталоге `backups/`.
2. Изучите причины ошибки:
   ```bash
   cat logs/update.log | tail -n 50
   pm2 logs dodik-tracker --lines 40 --nostream
   ```
3. При необходимости вернитесь на предыдущую версию кода:
   ```bash
   git checkout <предыдущий_коммит>
   npm run restore backups/dodik_tracker_backup_ПРЕДЫДУЩИЙ.sql
   npm install && npm run build
   pm2 restart dodik-tracker
   ```
