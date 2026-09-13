import { db } from '../db/index.ts';
import { systemSettings, users } from '../db/schema.ts';
import { eq, count } from 'drizzle-orm';
import { achievementService } from './achievements/service.ts';

export async function initDbSettings() {
  try {
    // 1. Initialize and seed Achievements table
    await achievementService.init();

    // 2. Registration mode
    const setting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'registration_mode'))
      .limit(1);

    if (setting.length === 0) {
      const userCountResult = await db.select({ value: count() }).from(users);
      const userCount = userCountResult[0].value;

      const initialMode = userCount > 0 ? 'INVITE_ONLY' : 'OPEN';

      await db.insert(systemSettings).values({
        key: 'registration_mode',
        value: initialMode,
        description: 'Режим доступа к регистрации в проекте',
      });
      console.log(`[Init] Registration mode initialized to ${initialMode}`);
    }
  } catch (err) {
    console.error('[Init] Failed to initialize DB settings:', err);
  }
}
