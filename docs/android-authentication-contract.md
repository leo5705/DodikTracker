# Authentication Contract

Документ описывает фактический контракт авторизации и взаимодействия с API платформы Dodik Tracker (Production: `https://track.blgcloud.ru`) для интеграции с нативным Android-клиентом. Аудит проведен на основе фактического исходного кода backend (`server.ts`, `src/server/api.ts`, `src/middleware/auth.ts`) и frontend (`src/context/AuthContext.tsx`).

---

## Login

### 1. Логин по логину и паролю
* **URL:** `POST /api/auth/login`
* **Content-Type:** `application/json`
* **Rate Limit:** 20 запросов за 15 минут на IP
* **Request Body:**
```json
{
  "login": "string",
  "password": "string"
}
```
> *Примечание:* Поле называется именно `login` (не `username`), при этом сервер принимает в него как имя пользователя (username), так и email.

* **Успешный ответ (HTTP 200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "uid": "usr_1711234567_abc123",
    "username": "example_user",
    "email": "user@example.com",
    "avatar": "https://... or null",
    "bio": "string or null",
    "role": "USER",
    "roles": ["user"],
    "profileVisibility": "PUBLIC",
    "libraryVisibility": "PUBLIC",
    "ratingVisibility": "PUBLIC",
    "activityVisibility": "PUBLIC",
    "listVisibility": "PUBLIC",
    "statisticsVisibility": "PUBLIC",
    "showAdultContent": false,
    "telegramUsername": null,
    "telegramChatId": null,
    "telegramId": null,
    "notificationSettings": null,
    "musicLyricsProvider": "auto",
    "musicCrossfadeEnabled": false,
    "musicCrossfadeDuration": 0,
    "invitesLeft": 3,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "displayName": "example_user"
  }
}
```

* **Ошибки:**
  - `HTTP 400`: `{"error": "Укажите логин и пароль"}`
  - `HTTP 401`: `{"error": "Пользователь с таким логином не найден"}` или `{"error": "Неверный пароль"}`
  - `HTTP 403`: `{"error": "Ваш аккаунт заблокирован администратором"}`
  - `HTTP 503`: `{"error": "Сайт находится на техническом обслуживании. Вход доступен только для администрации."}`
  - `HTTP 429`: `{"error": "Слишком много попыток входа/регистрации. Попробуйте позже."}`

---

### 2. Регистрация (Username + Password)
* **URL:** `POST /api/auth/register`
* **Content-Type:** `application/json`
* **Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "inviteCode": "DODIK-XXXX-YYYY"
}
```
> *Примечание:* `inviteCode` опционален в режиме `OPEN`, но обязателен в режиме `INVITE_ONLY`.
* **Успешный ответ (HTTP 200 OK):** Возвращает `{ token, user }` аналогично `/api/auth/login`.

---

### 3. Авторизация через Telegram
* **Шаг 1:** `POST /api/auth/telegram/request-code` с `{ "telegramUsername": "optional_username" }` → возвращает `{ "code": "123456", "botUrl": "https://t.me/..." }`.
* **Шаг 2:** Пользователь подтверждает код в Telegram-боте.
* **Шаг 3:** `POST /api/auth/telegram/verify` с `{ "code": "123456", "inviteCode": "..." }` → возвращает `{ token, user }`.

---

## Session

1. **Возврат токена в JSON:**
   * **ДА**, эндпоинты `/api/auth/login`, `/api/auth/register`, `/api/auth/telegram/verify` и `/api/auth/session` возвращают JWT токен в теле ответа в поле `token`.

2. **Использование cookie `dodik_session`:**
   * Сервер параллельно отправляет заголовок `Set-Cookie: dodik_session=<token>; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax` для браузеров.

3. **Связка Bearer и Cookie на сервере:**
   * Middleware авторизации (`src/middleware/auth.ts`) проверяет источники токена в следующем порядке:
     1. `req.cookies?.dodik_session`
     2. `req.headers.authorization` (`Bearer <token>`)
     3. `req.query.token`
   * Наличие cookie **НЕ является обязательным**. Если передан `Authorization: Bearer <token>`, сервер успешно верифицирует запрос без cookie.

4. **Хранение состояния авторизации на клиенте:**
   * **Web-приложение:** хранит токен в памяти React State (`AuthContext`), а при перезагрузке страницы полагается на HTTP-only cookie через вызов `/api/auth/me`.
   * **Android-приложение:** сохраняет полученный `token` в `EncryptedSharedPreferences` / Jetpack DataStore и прикрепляет его ко всем запросам в заголовке `Authorization: Bearer <token>`.

---

## Authenticated Requests

Для всех защищенных эндпоинтов API Android-клиент отправляет:

```http
GET /api/users/profile HTTP/1.1
Host: track.blgcloud.ru
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Accept: application/json
```

* Если токен валиден: запрос выполняется от имени `req.dbUser`.
* Если токен отсутствует: `HTTP 401 Unauthorized` `{"error": "Необходима авторизация"}`.
* Если токен невалиден / истек: `HTTP 401 Unauthorized` `{"error": "Недействительный токен сессии"}` или `{"error": "Срок действия токена истек", "code": "auth/id-token-expired"}`.
* Если пользователь заблокирован: `HTTP 403 Forbidden` `{"error": "Ваш аккаунт заблокирован администратором"}`.

---

## Current User

* **URL:** `GET /api/auth/me`
* **Авторизация:** Обязательна (`Authorization: Bearer <token>` или cookie)
* **Request Body:** отсутствует
* **Успешный ответ (HTTP 200 OK):**
```json
{
  "user": {
    "id": 1,
    "uid": "usr_1711234567_abc123",
    "username": "example_user",
    "email": "user@example.com",
    "avatar": null,
    "bio": null,
    "role": "USER",
    "roles": ["user"],
    "profileVisibility": "PUBLIC",
    "libraryVisibility": "PUBLIC",
    "ratingVisibility": "PUBLIC",
    "activityVisibility": "PUBLIC",
    "listVisibility": "PUBLIC",
    "statisticsVisibility": "PUBLIC",
    "showAdultContent": false,
    "telegramUsername": null,
    "telegramChatId": null,
    "telegramId": null,
    "notificationSettings": null,
    "musicLyricsProvider": "auto",
    "musicCrossfadeEnabled": false,
    "musicCrossfadeDuration": 0,
    "invitesLeft": 3,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "displayName": "example_user",
    "pts": 150
  },
  "counts": {
    "total": 42,
    "movies": 15,
    "tv": 8,
    "anime": 10,
    "games": 5,
    "books": 2,
    "manga": 1,
    "comics": 1,
    "completed": 28,
    "pts": 150
  }
}
```

---

## Logout

* **URL:** `POST /api/auth/logout`
* **Request Body:** пустое
* **Действие сервера:** очищает cookie `dodik_session`.
* **Ответ сервера (HTTP 200 OK):**
```json
{
  "ok": true
}
```
* **Поведение Android-клиента:**
  1. Вызывает `POST /api/auth/logout` (опционально, для очистки серверных сессионных cookie).
  2. Локально удаляет сохраненный токен из безопасного хранилища (`EncryptedSharedPreferences` / DataStore).
  3. Переводит UI в неавторизованное состояние.

---

## Token Refresh

1. **Срок жизни токена:**
   * JWT-токен подписывается сервером (`jsonwebtoken`) со сроком жизни **30 дней** (`{ expiresIn: '30d' }`).
2. **Refresh Token:**
   * Для стандартной авторизации (логин/пароль, Telegram) отдельный Refresh Token механизм **отсутствует**.
   * Сессия поддерживается 30 дней. При истечении токена сервер возвращает `401 Unauthorized`, после чего Android-клиент запрашивает повторный логин пользователя.
3. **Google Sign-In / Firebase:**
   * Если используется Firebase Auth, клиент обновляет Firebase ID Token средствами Firebase SDK (`getIdToken(forceRefresh = true)`) и передает его на `POST /api/auth/session` для получения нового JWT токена Dodik Tracker.

---

## Required Headers

Для взаимодействия Android-приложения с backend необходимы следующие HTTP заголовки:

| Заголовок | Значение | Обязательность |
|---|---|---|
| `Authorization` | `Bearer <JWT_TOKEN>` | Обязателен для всех защищенных запросов |
| `Content-Type` | `application/json` | Обязателен для запросов с телом (`POST`, `PUT`, `PATCH`) |
| `Accept` | `application/json` | Рекомендуется для всех запросов |

---

## CSRF

* В приложении **полностью отсутствует CSRF-защита** на уровне backend (отсутствуют middleware типа `csurf`, проверки заголовков `X-CSRF-Token`, Origin/Referer guard).
* Запросы, передающие `Authorization: Bearer <token>`, не подвержены CSRF-атакам браузера.
* Android-клиенту **не требуется** получать, сохранять или передавать CSRF-токены.

---

## Android Compatibility

* **Полная совместимость с REST / JSON клиентами:** Retrofit, OkHttp, Ktor.
* **Non-browser клиенты:** Сервер не накладывает ограничений на `User-Agent`, не требует прохождения браузерных проверок (Cloudflare JS challenge / Turnstile в базовом API отсутствуют).
* **Cross-Origin / CORS:** Не влияет на мобильные приложения, так как OkHttp / HttpURLConnection не подчиняются browser-only Same-Origin Policy.
* **Rate Limits:**
  * Общий лимит API: 1000 запросов / 15 минут на IP.
  * Лимит авторизации (`/api/auth/login`, `/api/auth/register`): 20 запросов / 15 минут на IP.
  * Лимит сообщений: 30 запросов / 1 минуту на IP.

---

## Required Backend Changes

Никаких изменений на backend не требуется. Существующий API полностью поддерживает аутентификацию нативных мобильных клиентов через заголовок `Authorization: Bearer <token>`.

---

## Вывод

**ANDROID CAN USE EXISTING AUTH**
