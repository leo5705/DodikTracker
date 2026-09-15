import { db } from './src/db/index.ts';
import { users } from './src/db/schema.ts';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dodik_tracker_jwt_secret_key_2026_antigravity';

async function main() {
  const allUsers = await db.select().from(users).limit(2);
  const tokenA = jwt.sign({ userId: allUsers[0].id }, JWT_SECRET);
  const tokenB = jwt.sign({ userId: allUsers[1].id }, JWT_SECRET);
  console.log('User A:', allUsers[0].username, tokenA);
  console.log('User B:', allUsers[1].username, tokenB);
  process.exit(0);
}
main();
