import { db, pool } from '../db/index.ts';
import { runAutoMigrations } from '../db/autoInit.ts';
import { systemSettings, users } from '../db/schema.ts';
import { eq, count } from 'drizzle-orm';
import { achievementService } from './achievements/service.ts';

export async function initDbSettings() {
  try {
    // 0. Auto-create all database tables if they don't exist
    await runAutoMigrations(pool);

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
      const userCount = Number(userCountResult[0]?.value || 0);

      const initialMode = userCount > 0 ? 'INVITE_ONLY' : 'OPEN';

      await db.insert(systemSettings).values({
        key: 'registration_mode',
        value: initialMode,
        description: 'Режим доступа к регистрации в проекте',
      });
      console.log(`[Init] Registration mode initialized to ${initialMode}`);
    }

    // 3. Ensure configured admin has SUPER_ADMIN role if specified in environment
    const targetAdminUsername = process.env.INITIAL_ADMIN_USERNAME || process.env.ADMIN_USERNAME;
    const targetAdminEmail = process.env.INITIAL_ADMIN_EMAIL || process.env.ADMIN_EMAIL;

    if (targetAdminUsername) {
      await db
        .update(users)
        .set({ role: 'SUPER_ADMIN' })
        .where(eq(users.username, targetAdminUsername.trim().toLowerCase()))
        .catch(() => {});
    }

    if (targetAdminEmail) {
      await db
        .update(users)
        .set({ role: 'SUPER_ADMIN' })
        .where(eq(users.email, targetAdminEmail.trim().toLowerCase()))
        .catch(() => {});
    }
  } catch (err) {
    console.error('[Init] Failed to initialize DB settings:', err);
  }
}

