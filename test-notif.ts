import { db } from './src/db/index.ts';
import { users } from './src/db/schema.ts';
import { notificationService } from './src/server/services/notificationService.ts';

async function main() {
  const allUsers = await db.select().from(users).limit(2);
  if (allUsers.length < 2) {
    console.log("Need at least 2 users");
    process.exit(0);
  }
  const sender = allUsers[0];
  const receiver = allUsers[1];

  console.log(`Sending from ${sender.username} to ${receiver.username}`);

  const res = await notificationService.notifyFriendRequest(sender, receiver.id);
  console.log("Result:", res);
  process.exit(0);
}
main().catch(console.error);
