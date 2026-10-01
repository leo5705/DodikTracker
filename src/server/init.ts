import { db, pool } from '../db/index.ts';
import { runAutoMigrations } from '../db/autoInit.ts';
import { systemSettings, users } from '../db/schema.ts';
import { eq, count } from 'drizzle-orm';
import { achievementService } from './achievements/service.ts';
import { externalMusicConfig } from './services/externalMusic/externalMusicConfig.ts';

export async function initDbSettings() {
  try {
    // 0. Auto-create all database tables if they don't exist
    await runAutoMigrations(pool);

    // 1. Initialize and seed Achievements table
    await achievementService.init();

    // 2. Initialize external music configuration (Genius, YouTube)
    await externalMusicConfig.initialize().catch((err) => {
      console.warn('[Init] External music config init warning:', err);
    });

    // 2. Registration mode
    const setting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'site_access_mode'))
      .limit(1);

    if (setting.length === 0) {
      const initialMode = 'OPEN';

      await db.insert(systemSettings).values({
        key: 'site_access_mode',
        value: initialMode,
        description: 'Режим доступа к регистрации в проекте',
      });
      console.log(`[Init] Registration mode initialized to ${initialMode}`);
    }

    // 3. Ensure configured admin has SUPER_ADMIN role if specified in environment
    const targetAdminUsername = process.env.INITIAL_ADMIN_USERNAME || process.env.ADMIN_USERNAME;
    const targetAdminEmail = process.env.INITIAL_ADMIN_EMAIL || process.env.ADMIN_EMAIL;

    if (targetAdminUsername) {
      const cleanUsername = targetAdminUsername.trim().toLowerCase();
      await db
        .update(users)
        .set({ role: 'SUPER_ADMIN', roles: '["user", "super_admin"]' })
        .where(eq(users.username, cleanUsername))
        .catch(() => {});
    }

    if (targetAdminEmail) {
      const cleanEmail = targetAdminEmail.trim().toLowerCase();
      if (cleanEmail.includes('@')) {
        await db
          .update(users)
          .set({ role: 'SUPER_ADMIN', roles: '["user", "super_admin"]' })
          .where(eq(users.email, cleanEmail))
          .catch(() => {});
      } else {
        // Fallback: if user provided username in INITIAL_ADMIN_EMAIL
        await db
          .update(users)
          .set({ role: 'SUPER_ADMIN', roles: '["user", "super_admin"]' })
          .where(eq(users.username, cleanEmail))
          .catch(() => {});
      }
    }
  } catch (err) {
    console.error('[Init] Failed to initialize DB settings:', err);
  }
}

