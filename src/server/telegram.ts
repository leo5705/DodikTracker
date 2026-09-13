import { db } from '../db/index.ts';
import { users, systemSettings } from '../db/schema.ts';
import { eq, or } from 'drizzle-orm';

// In-memory verification codes map shared with apiRouter
export interface TelegramAuthCodeEntry {
  code: string;
  expiresAt: number;
  telegramUsername?: string;
  telegramId?: string;
  telegramChatId?: string;
  userId?: number; // If linking from settings
  isVerified?: boolean;
  resolvedUserId?: number;
}

export const telegramAuthCodes = new Map<string, TelegramAuthCodeEntry>();

class TelegramBotManager {
  private token: string | null = null;
  private botUsername: string = 'DodikTrackerBot';
  private pollingActive: boolean = false;
  private pollOffset: number = 0;
  private pollAbortController: AbortController | null = null;
  private retryDelayMs: number = 5000;

  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN || null;
  }

  public isReady(): boolean {
    return !!(this.token && this.pollingActive);
  }

  public getUsername(): string {
    return this.botUsername;
  }

  public async getBotToken(): Promise<string | null> {
    if (this.token) return this.token;
    try {
      const setting = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'telegram_bot_token'))
        .limit(1);
      if (setting.length > 0 && setting[0].value && setting[0].value.trim()) {
        this.token = setting[0].value.trim();
        return this.token;
      }
    } catch (err) {
      console.error('[Telegram] Failed to load token from database:', err);
    }
    return null;
  }

  public setToken(token: string | null) {
    this.token = token ? token.trim() : null;
  }

  public async init() {
    const token = await this.getBotToken();
    if (!token) {
      console.log('[Telegram] No Telegram Bot Token configured. Waiting for admin configuration.');
      return;
    }

    try {
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const meData = await meRes.json();
      if (meData.ok && meData.result) {
        this.botUsername = meData.result.username || 'DodikTrackerBot';
        console.log(`[Telegram] Bot authenticated as @${this.botUsername}`);
        this.startPolling();
      } else {
        console.warn('[Telegram] Invalid token response:', meData.description || 'Unknown error');
      }
    } catch (err) {
      console.error('[Telegram] Failed to connect to Telegram API:', err);
    }
  }

  public async restart() {
    this.stopPolling();
    this.token = null;
    await this.init();
  }

  public stopPolling() {
    this.pollingActive = false;
    if (this.pollAbortController) {
      this.pollAbortController.abort();
      this.pollAbortController = null;
    }
    console.log('[Telegram] Polling stopped');
  }

  public startPolling() {
    if (this.pollingActive) return;
    this.pollingActive = true;
    console.log('[Telegram] Starting long polling...');
    this.pollLoop();
  }

  private async pollLoop() {
    while (this.pollingActive) {
      const token = await this.getBotToken();
      if (!token) {
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }

      this.pollAbortController = new AbortController();
      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${this.pollOffset}&timeout=20&allowed_updates=["message","callback_query"]`;
        const res = await fetch(url, { signal: this.pollAbortController.signal });

        if (!res.ok) {
          if (res.status === 401 || res.status === 404) {
            console.warn('[Telegram] Bot token rejected by Telegram API (401/404). Pausing polling.');
            await new Promise((r) => setTimeout(r, 30000));
            continue;
          }
          await new Promise((r) => setTimeout(r, this.retryDelayMs));
          continue;
        }

        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.pollOffset = update.update_id + 1;
            await this.handleUpdate(update);
          }
        }
        this.retryDelayMs = 3000;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          break;
        }
        this.retryDelayMs = Math.min(this.retryDelayMs * 1.5, 30000);
        await new Promise((r) => setTimeout(r, this.retryDelayMs));
      }
    }
  }

  public async handleUpdate(update: any) {
    if (!update.message || !update.message.text) return;
    const msg = update.message;
    const chatId = String(msg.chat.id);
    const fromId = String(msg.from.id);
    const fromUsername = msg.from.username ? msg.from.username.replace('@', '').toLowerCase() : undefined;
    const text = msg.text.trim();

    try {
      // Command parsing
      if (text.startsWith('/start')) {
        const parts = text.split(' ');
        const payload = parts[1]?.trim();
        await this.handleStartCommand(chatId, fromId, fromUsername, payload);
      } else if (text.startsWith('/link')) {
        const parts = text.split(' ');
        const code = parts[1]?.trim();
        await this.handleLinkCommand(chatId, fromId, fromUsername, code);
      } else if (text.startsWith('/login')) {
        const parts = text.split(' ');
        const code = parts[1]?.trim();
        await this.handleLoginCommand(chatId, fromId, fromUsername, code);
      } else if (text.startsWith('/status')) {
        await this.handleStatusCommand(chatId, fromId, fromUsername);
      } else if (text.startsWith('/disconnect') || text.startsWith('/unlink')) {
        await this.handleDisconnectCommand(chatId, fromId);
      } else if (text.startsWith('/notifications')) {
        const parts = text.split(' ');
        const state = parts[1]?.toLowerCase().trim();
        await this.handleNotificationsToggle(chatId, fromId, state);
      } else if (text.startsWith('/help')) {
        await this.handleHelpCommand(chatId);
      } else {
        // Unrecognized text or raw 6-digit code
        if (/^\d{6}$/.test(text)) {
          await this.handleLinkCommand(chatId, fromId, fromUsername, text);
        } else {
          await this.sendMessage(
            chatId,
            `👋 Привет! Я официальный бот *Dodik Tracker*.\n\nИспользуйте команду /help, чтобы увидеть список доступных команд, или отправьте 6-значный код из профиля для привязки аккаунта.`
          );
        }
      }
    } catch (err) {
      console.error('[Telegram] Error handling message:', err);
    }
  }

  private async handleStartCommand(chatId: string, fromId: string, fromUsername: string | undefined, payload?: string) {
    if (payload) {
      // User clicked a deep link with a code (e.g. t.me/bot?start=123456)
      await this.handleLinkCommand(chatId, fromId, fromUsername, payload);
      return;
    }

    // Check if user is already linked
    const user = await this.findUserByTelegram(chatId, fromId, fromUsername);
    if (user) {
      await this.sendMessage(
        chatId,
        `👋 С возвращением, *${user.username}*!\n\nВаш Telegram-аккаунт успешно привязан к Dodik Tracker.\n\n` +
          `• /status — текущий статус профиля и библиотека\n` +
          `• /notifications — настройки уведомлений\n` +
          `• /disconnect — отвязать Telegram\n` +
          `• /help — помощь по командам`
      );
    } else {
      await this.sendMessage(
        chatId,
        `👋 Привет! Я бот *Dodik Tracker* — социального медиатрекера для кино, сериалов, аниме, игр и книг.\n\n` +
          `Чтобы привязать ваш Telegram к аккаунту Dodik Tracker:\n` +
          `1. Откройте Dodik Tracker в браузере\n` +
          `2. Перейдите в *Настройки → Telegram*\n` +
          `3. Нажмите *«Сгенерировать код привязки»*\n` +
          `4. Отправьте сюда полученный 6-значный код командой:\n` +
          `\`/link КОД\` (или просто отправьте 6 цифр)\n\n` +
          `После привязки вы будете получать важные уведомления о заявках в друзья, отзывах и релизах!`
      );
    }
  }

  private async handleLinkCommand(chatId: string, fromId: string, fromUsername: string | undefined, code?: string) {
    if (!code) {
      await this.sendMessage(
        chatId,
        `⚠️ Пожалуйста, укажите 6-значный код подтверждения.\nПример: \`/link 123456\``
      );
      return;
    }

    const cleanCode = code.trim();
    const stored = telegramAuthCodes.get(cleanCode);

    if (!stored || Date.now() > stored.expiresAt) {
      await this.sendMessage(
        chatId,
        `❌ Код \`${cleanCode}\` недействителен или срок его действия истек (15 минут).\n` +
          `Пожалуйста, запросите новый код в настройках Dodik Tracker.`
      );
      return;
    }

    // If code was created for a specific logged-in user
    if (stored.userId) {
      await db
        .update(users)
        .set({
          telegramChatId: chatId,
          telegramId: fromId,
          telegramUsername: fromUsername || null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, stored.userId));

      stored.isVerified = true;
      stored.resolvedUserId = stored.userId;

      const updatedUser = (await db.select().from(users).where(eq(users.id, stored.userId)).limit(1))[0];

      await this.sendMessage(
        chatId,
        `✅ *Успешно привязано!*\n\nАккаунт Dodik Tracker: *${updatedUser.username}*\n` +
          `Теперь вы будете получать уведомления в этот чат.`
      );
      return;
    }

    // If code was generated from login page
    stored.isVerified = true;
    stored.telegramUsername = fromUsername;
    stored.telegramId = fromId;
    stored.telegramChatId = chatId;
    stored.resolvedUserId = undefined;

    // Check if user exists by telegram username
    if (fromUsername) {
      const existingUser = (
        await db
          .select()
          .from(users)
          .where(or(eq(users.telegramUsername, fromUsername), eq(users.username, `tg_${fromUsername}`)))
          .limit(1)
      )[0];

      if (existingUser) {
        await db
          .update(users)
          .set({
            telegramChatId: chatId,
            telegramId: fromId,
            telegramUsername: fromUsername,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id));

        stored.resolvedUserId = existingUser.id;
      }
    }

    await this.sendMessage(
      chatId,
      `✅ Код подтвержден! Вернитесь на сайт Dodik Tracker — авторизация завершена.`
    );
  }

  private async handleLoginCommand(chatId: string, fromId: string, fromUsername: string | undefined, code?: string) {
    await this.handleLinkCommand(chatId, fromId, fromUsername, code);
  }

  private async handleStatusCommand(chatId: string, fromId: string, fromUsername: string | undefined) {
    const user = await this.findUserByTelegram(chatId, fromId, fromUsername);
    if (!user) {
      await this.sendMessage(
        chatId,
        `⚠️ Ваш Telegram не привязан к аккаунту Dodik Tracker.\nОтправьте команду \`/link КОД\` для привязки.`
      );
      return;
    }

    await this.sendMessage(
      chatId,
      `👤 *Профиль Dodik Tracker*\n\n` +
        `• Имя: *${user.username}*\n` +
        `• Email: ${user.email || 'не указан'}\n` +
        `• Роль: ${user.role}\n` +
        `• Уведомления в Telegram: ${user.telegramChatId ? 'Включены ✅' : 'Выключены ❌'}\n\n` +
        `Управлять настройками и приватностью можно на сайте в разделе «Настройки».`
    );
  }

  private async handleDisconnectCommand(chatId: string, fromId: string) {
    const user = await this.findUserByTelegram(chatId, fromId);
    if (!user) {
      await this.sendMessage(chatId, `⚠️ Ваш Telegram не привязан ни к какому аккаунту.`);
      return;
    }

    await db
      .update(users)
      .set({
        telegramChatId: null,
        telegramId: null,
        telegramUsername: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await this.sendMessage(
      chatId,
      `🔌 Ваш аккаунт Dodik Tracker (*${user.username}*) успешно отключен от Telegram.\n` +
        `Вы больше не будете получать уведомления в этот чат.`
    );
  }

  private async handleNotificationsToggle(chatId: string, fromId: string, state?: string) {
    const user = await this.findUserByTelegram(chatId, fromId);
    if (!user) {
      await this.sendMessage(chatId, `⚠️ Ваш Telegram не привязан к аккаунту Dodik Tracker.`);
      return;
    }

    if (state === 'off') {
      await db.update(users).set({ telegramChatId: null }).where(eq(users.id, user.id));
      await this.sendMessage(chatId, `🔕 Уведомления в Telegram отключены.`);
    } else {
      await db.update(users).set({ telegramChatId: chatId }).where(eq(users.id, user.id));
      await this.sendMessage(chatId, `🔔 Уведомления в Telegram включены.`);
    }
  }

  private async handleHelpCommand(chatId: string) {
    await this.sendMessage(
      chatId,
      `📖 *Команды бота Dodik Tracker:*\n\n` +
        `• \`/link <код>\` — привязать Telegram к аккаунту Dodik Tracker\n` +
        `• \`/status\` — статус вашего профиля и привязки\n` +
        `• \`/notifications on|off\` — включить или выключить уведомления\n` +
        `• \`/disconnect\` — отвязать Telegram от аккаунта\n` +
        `• \`/help\` — показать эту справку`
    );
  }

  private async findUserByTelegram(chatId: string, fromId: string, fromUsername?: string) {
    const conditions = [eq(users.telegramChatId, chatId), eq(users.telegramId, fromId)];
    if (fromUsername) {
      conditions.push(eq(users.telegramUsername, fromUsername.toLowerCase()));
    }

    const rows = await db
      .select()
      .from(users)
      .where(or(...conditions))
      .limit(1);

    return rows.length > 0 ? rows[0] : null;
  }

  public async sendMessage(chatId: string | number, text: string, parseMode: string = 'Markdown') {
    const token = await this.getBotToken();
    if (!token) return { ok: false, error: 'Token not configured' };

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode,
          disable_web_page_preview: true,
        }),
      });

      const data = await res.json();
      if (!data.ok && (data.error_code === 403 || data.description?.includes('blocked'))) {
        // User blocked bot -> clear telegramChatId to avoid repeated errors
        console.log(`[Telegram] User ${chatId} blocked the bot, clearing chat ID.`);
        await db.update(users).set({ telegramChatId: null }).where(eq(users.telegramChatId, String(chatId)));
      }
      return data;
    } catch (err: any) {
      console.error('[Telegram] Failed to send message:', err.message);
      return { ok: false, error: err.message };
    }
  }

  public async sendNotification(
    userId: number,
    notification: {
      type: string;
      title: string;
      body: string;
      relatedEntity?: string;
      relatedEntityId?: string;
      link?: string;
    }
  ) {
    try {
      const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
      if (!user || !user.telegramChatId) return false;

      // Icon mapping
      let icon = '🔔';
      if (notification.type === 'FRIEND_REQUEST') icon = '👥';
      else if (notification.type === 'FRIEND_ACCEPTED') icon = '🤝';
      else if (notification.type === 'COMMENT' || notification.type === 'COMMENT_REPLY') icon = '💬';
      else if (notification.type === 'LIKE') icon = '❤️';
      else if (notification.type === 'NEW_RELEASE') icon = '🎬';
      else if (notification.type.includes('TIERLIST')) icon = '📊';
      else if (notification.type.includes('LIST')) icon = '📋';

      const lines = [
        `${icon} *${this.escapeMarkdown(notification.title)}*`,
        '',
        this.escapeMarkdown(notification.body),
      ];

      if (notification.link) {
        lines.push('');
        lines.push(`🔗 [Открыть в приложении](${notification.link})`);
      }

      const text = lines.join('\n');
      const res = await this.sendMessage(user.telegramChatId, text);
      return res.ok;
    } catch (err) {
      console.error('[Telegram] Notification error:', err);
      return false;
    }
  }

  private escapeMarkdown(text: string): string {
    // Preserve basic text, replace lone markdown characters that can break formatting
    return text.replace(/([_*\[\]()~`>#+-=|{}.!])/g, '\\$1');
  }
}

export const telegramBot = new TelegramBotManager();
