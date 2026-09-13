import { db, pool } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  const username = process.argv[2]?.trim().toLowerCase();
  if (!username) {
    console.error('Пожалуйста, укажите username пользователя: npm run make-admin <username>');
    process.exit(1);
  }

  const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing.length === 0) {
    console.error(`Пользователь с логином "${username}" не найден в базе данных.`);
    process.exit(1);
  }

  await db.update(users).set({ role: 'SUPER_ADMIN' }).where(eq(users.username, username));
  console.log(`✅ Пользователь "${username}" успешно повышен до роли SUPER_ADMIN (Главный Администратор)!`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Ошибка при назначении администратора:', err);
  process.exit(1);
});
