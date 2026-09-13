# 🎮 Dodik Tracker

**Dodik Tracker** — это современный мультимедийный трекер и закрытое сообщество для каталогизации, отслеживания прогресса и обсуждения всех видов контента: **видеоигры, фильмы, сериалы, аниме, манга, книги, комиксы и музыка**.

---

## 📑 Оглавление
1. [Системные требования](#системные-требования)
2. [Быстрый старт на Localhost](#быстрый-старт-на-localhost)
3. [Развертывание на Сервере / VPS / VDS](#развертывание-на-сервере--vps--vds)
4. [Настройка роли Главного Администратора (SUPER_ADMIN)](#настройка-роли-главного-администратора-super_admin)
5. [Регистрация и Инвайт-коды](#регистрация-и-инвайт-коды)
6. [Интеграции (Gemini AI, Telegram Bot)](#интеграции)
7. [Решение частых проблем (FAQ / Troubleshooting)](#решение-частых-проблем-faq--troubleshooting)

---

## 💻 Системные требования

* **Node.js**: версия `18.x`, `20.x` или `22.x` (LTS рекомендуется)
* **npm** (поставляется вместе с Node.js) или **pnpm** / **yarn**
* **PostgreSQL**: версия `14.x`, `15.x` или `16.x` (или через Docker)
* **Операционная система**: Linux (Ubuntu, Debian, CentOS), macOS или Windows (с WSL2 / Docker)

---

## 🚀 Быстрый старт на Localhost

### Шаг 1: Клонирование и установка зависимостей
```bash
git clone <URL_ВАШЕГО_РЕПОЗИТОРИЯ>
cd dodik-tracker
npm install
```

### Шаг 2: Запуск базы данных PostgreSQL

#### Вариант А: Через Docker Compose (Самый простой способ)
В корне проекта уже есть готовый `docker-compose.yml`. Запустите базу одной командой:
```bash
docker compose up -d
```
Это запустит PostgreSQL с параметрами:
* **Хост:** `localhost`
* **Порт:** `5432`
* **Пользователь:** `dodik_user`
* **Пароль:** `dodik_password`
* **База данных:** `dodik_tracker`

#### Вариант Б: Через локально установленный PostgreSQL
Если у вас уже установлен PostgreSQL, создайте базу данных:
```sql
CREATE DATABASE dodik_tracker;
CREATE USER dodik_user WITH ENCRYPTED PASSWORD 'dodik_password';
GRANT ALL PRIVILEGES ON DATABASE dodik_tracker TO dodik_user;
```

---

### Шаг 3: Настройка файла переменных окружения (`.env`)
Скопируйте файл `.env.example` в `.env`:
```bash
cp .env.example .env
```

Откройте `.env` и настройте параметры:
```env
# Строка подключения к PostgreSQL
DATABASE_URL="postgres://dodik_user:dodik_password@localhost:5432/dodik_tracker"

# Или раздельные параметры:
SQL_HOST="localhost"
SQL_PORT="5432"
SQL_USER="dodik_user"
SQL_PASSWORD="dodik_password"
SQL_DB_NAME="dodik_tracker"

# Порт приложения
PORT=3000
APP_URL="http://localhost:3000"

# Ключи безопасности
JWT_SECRET="super-secret-key-change-it-to-your-own-random-string"
INTEGRATION_ENCRYPTION_KEY="dodik-master-secret-encryption-key-32b"

# Желаемый логин администратора
INITIAL_ADMIN_USERNAME="admin"
```

---

### Шаг 4: Инициализация таблиц базы данных
При первом запуске сервер **автоматически** создаст все необходимые таблицы и индексы. Вы также можете выполнить инициализацию вручную:
```bash
npm run db:init
```

---

### Шаг 5: Запуск проекта в режиме разработки
```bash
npm run dev
```
Откройте в браузере: **`http://localhost:3000`**

---

## 🌐 Развертывание на Сервере / VPS / VDS (Production)

Ниже приведена пошаговая инструкция для чистого сервера на **Ubuntu 22.04 / 24.04 LTS**.

### 1. Обновление пакетов и установка Node.js & PostgreSQL
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx postgresql postgresql-contrib

# Установка Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установка менеджера процессов PM2
sudo npm install -g pm2
```

### 2. Настройка PostgreSQL на сервере
```bash
sudo -u postgres psql
```
В терминале PostgreSQL выполните:
```sql
CREATE DATABASE dodik_tracker;
CREATE USER dodik_user WITH ENCRYPTED PASSWORD 'Ваш_Сложный_Пароль';
GRANT ALL PRIVILEGES ON DATABASE dodik_tracker TO dodik_user;
\q
```

### 3. Загрузка кода и сборка проекта
```bash
# Клонируем проект в /var/www/dodik-tracker
cd /var/www
git clone <URL_РЕПОЗИТОРИЯ> dodik-tracker
cd dodik-tracker

# Устанавливаем зависимости
npm install

# Создаем боевой .env файл
cp .env.example .env
nano .env # заполните DATABASE_URL, JWT_SECRET, INITIAL_ADMIN_USERNAME и т.д.

# Инициализируем таблицы базы
npm run db:init

# Собираем production-билд фронтенда и бэкенда
npm run build
```

### 4. Запуск через PM2 (Автозапуск при перезагрузке сервера)
```bash
# Запуск сервиса
pm2 start npm --name "dodik-tracker" -- run start

# Сохранение конфигурации для автозапуска
pm2 save
pm2 startup
```

### 5. Настройка Nginx и SSL-сертификата (HTTPS)

Создайте конфигурационный файл для Nginx:
```bash
sudo nano /etc/nginx/sites-available/dodik-tracker
```

Вставьте конфигурацию (замените `yourdomain.com` на ваш домен):
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

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
    }
}
```

Активируйте сайт и перезапустите Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/dodik-tracker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Установите бесплатный SSL-сертификат Let's Encrypt:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 👑 Настройка роли Главного Администратора (SUPER_ADMIN)

В Dodik Tracker действует строгая система безопасности: **обычная регистрация создает учетные записи со стандартным статусом `USER`**. 

Чтобы назначить главного администратора, используйте один из 3 способов:

### Способ 1: Через `.env` (Рекомендуется)
В файле `.env` укажите ваш логин:
```env
INITIAL_ADMIN_USERNAME="ваш_логин"
```
При регистрации (или первом входе) этот аккаунт автоматически получит статус `SUPER_ADMIN`.

### Способ 2: Через CLI-команду на сервере
Если вы уже зарегистрировались на сайте, выполните в терминале проекта:
```bash
npm run make-admin <ваш_логин>
```
*Пример: `npm run make-admin admin`*

### Способ 3: Напрямую через SQL-запрос
```sql
UPDATE users SET role = 'SUPER_ADMIN' WHERE username = 'ваш_логин';
```

---

## 🎟️ Регистрация и Инвайт-коды

* **Регистрация только по логину:** В форме регистрации требуется только **желаемый Username** и **пароль** (ввод email убран).
* **Вход:** Возможен как по Username, так и по Telegram-боту или Google.

### Режимы доступа к сайту:
В панели администратора (`/admin`) или в таблице `system_settings` доступно 3 режима регистрации (`registration_mode`):
1. **`OPEN` (Открытая):** Любой посетитель может зарегистрироваться по логину и паролю.
2. **`INVITE_ONLY` (По инвайтам):** Для регистрации требуется ввести действующий инвайт-код (каждому пользователю выдаются инвайты).
3. **`CLOSED` (Закрытая):** Регистрация новых участников приостановлена.

---

## 🤖 Интеграции и Базы Данных Контента

### 🎮 Игровые базы: IGDB и TheGamesDB

В Dodik Tracker встроена поддержка сразу нескольких игровых провайдеров (настраиваются в **Панели Администратора** -> вкладка **Интеграции**):

1. **IGDB (Twitch API v4) — Рекомендуется для 1080p постеров, скриншотов и трейлеров:**
   * **Где получить:** Перейдите в [Twitch Developer Console](https://dev.twitch.tv/console/apps), создайте приложение и нажмите **Manage**.
   * Скопируйте **Client ID** и нажмите кнопку **New Secret**, чтобы сгенерировать **Client Secret**.
   * Вставьте **Twitch Client ID** и **Twitch Client Secret** в соответствующие поля в панели Dodik Tracker (`/admin` -> Интеграции).
   * *Примечание:* Сервер автоматически обменивает Client ID и Secret на OAuth-токен Twitch и обновляет его без вашего участия.

2. **TheGamesDB (thegamesdb.net):**
   * **Где получить:** Зарегистрируйтесь на [thegamesdb.net](https://thegamesdb.net/) и сгенерируйте API ключ на странице [thegamesdb.net/user/apikeys](https://thegamesdb.net/user/apikeys).
   * Вставьте ключ в поле TheGamesDB в панели управления.
   * *Внимание:* Ключ от TheGamesDB не подходит к IGDB, так как это разные сервисы с разной схемой авторизации.

### 🎬 Фильмы и Сериалы: TMDB и Кинопоиск
* **TMDB:** Бесплатный ключ на [themoviedb.org](https://www.themoviedb.org/settings/api).
* **Кинопоиск (Неофициальный API):** Ключ на [kinopoiskapiunofficial.tech](https://kinopoiskapiunofficial.tech/).

### 🧠 Gemini AI (Умный помощник и автопереводы)
Получите бесплатный API ключ в [Google AI Studio](https://aistudio.google.com/) и добавьте в `.env`:
```env
GEMINI_API_KEY="AIzaSy..."
```

### 📱 Telegram Bot (Вход без пароля и уведомления)
1. Создайте бота через `@BotFather` в Telegram и получите токен.
2. В файле `.env` укажите:
```env
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHI..."
TELEGRAM_BOT_USERNAME="YourDodikBot"
```
3. Пользователи смогут мгновенно логиниться через одноразовые команды `/login <код>`.

---

## ❓ Решение частых проблем (FAQ / Troubleshooting)

### 1. Ошибка `Failed query: select ... from "system_settings"`
* **Причина:** База данных только что создана и таблицы еще не проинициализированы.
* **Решение:** Сервер теперь автоматически создаёт все таблицы при старте. Если вы хотите прогнать миграцию вручную, выполните `npm run db:init`.

### 2. Зарегистрировался новый пользователь, но он не стал админом
* **Причина:** Обычные пользователи получают роль `USER` в целях безопасности.
* **Решение:** Назначьте админа через `npm run make-admin <логин>` или укажите `INITIAL_ADMIN_USERNAME` в `.env`.

### 3. Порт 3000 уже занят
* Убедитесь, что предыдущий процесс остановлен:
```bash
# Посмотреть, кто слушает порт:
lsof -i :3000
# Или запустить на другом порту:
PORT=3005 npm run dev
```

---

## 📦 Доступные NPM-скрипты

| Скрипт | Назначение |
| :--- | :--- |
| `npm run dev` | Запуск сервера в режиме разработки с live-перезагрузкой |
| `npm run build` | Полная компиляция фронтенда (Vite) и бэкенда (esbuild) |
| `npm run start` | Запуск собранного production-сервера (`node dist/server.cjs`) |
| `npm run db:init` | Принудительное создание всех таблиц и индексов в PostgreSQL |
| `npm run make-admin <user>` | Повышение указанного пользователя до `SUPER_ADMIN` |
| `npm run lint` | Проверка типов TypeScript |

---

Лицензия: MIT. Разработано для сообщества **Dodik Tracker**.
