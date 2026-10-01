/**
 * Dodik Tracker - Watch Party Lifecycle & RoomManager Tests (Stage 2)
 * Tests all 20 scenarios from the specification.
 */

import { watchPartyService } from '../services/watchParty/watchPartyService.ts';
import { roomManager } from '../services/watchParty/roomManager.ts';
import { db, pool } from '../../db/index.ts';
import { runAutoMigrations } from '../../db/autoInit.ts';
import { users, watchPartyRooms, watchPartyMembers } from '../../db/schema.ts';
import { eq, inArray } from 'drizzle-orm';
import crypto from 'crypto';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export async function runWatchPartyLifecycleTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  const results: TestResult[] = [];
  const testRunId = crypto.randomBytes(3).toString('hex');

  // Ensure tables are initialized
  try {
    await runAutoMigrations(pool);
  } catch (_mErr) {}

  let testUserHost: { id: number; username: string };
  let testUserMember1: { id: number; username: string };
  let testUserMember2: { id: number; username: string };
  let testUserOutsider: { id: number; username: string };

  const createdRoomIds: number[] = [];

  // Setup test users
  try {
    const [u1] = await db
      .insert(users)
      .values({
        uid: `wp_test_host_${testRunId}`,
        username: `wphost_${testRunId}`,
        role: 'USER',
        roles: '["user"]',
      })
      .returning();
    testUserHost = { id: u1.id, username: u1.username };

    const [u2] = await db
      .insert(users)
      .values({
        uid: `wp_test_mem1_${testRunId}`,
        username: `wpmem1_${testRunId}`,
        role: 'USER',
        roles: '["user"]',
      })
      .returning();
    testUserMember1 = { id: u2.id, username: u2.username };

    const [u3] = await db
      .insert(users)
      .values({
        uid: `wp_test_mem2_${testRunId}`,
        username: `wpmem2_${testRunId}`,
        role: 'USER',
        roles: '["user"]',
      })
      .returning();
    testUserMember2 = { id: u3.id, username: u3.username };

    const [u4] = await db
      .insert(users)
      .values({
        uid: `wp_test_out_${testRunId}`,
        username: `wpout_${testRunId}`,
        role: 'USER',
        roles: '["user"]',
      })
      .returning();
    testUserOutsider = { id: u4.id, username: u4.username };
  } catch (err: any) {
    console.error('Failed to create test users:', err);
    throw err;
  }

  // 1. Создание PUBLIC комнаты
  try {
    const publicRoom = await watchPartyService.createRoom(testUserHost.id, {
      title: `Public Movie Night ${testRunId}`,
      mediaType: 'MOVIE',
      privacy: 'PUBLIC',
      sourceType: 'DIRECT',
      sourceUrl: 'https://cdn.example.com/video.mp4',
      initialDuration: 7200,
    });

    createdRoomIds.push(publicRoom.id);

    if (publicRoom.privacy !== 'PUBLIC') throw new Error('Expected privacy to be PUBLIC');
    if (publicRoom.hostUserId !== testUserHost.id) throw new Error('Host user id mismatch');
    if (!publicRoom.code.startsWith('wtch-')) throw new Error('Invalid code prefix');
    if (publicRoom.hasPasscode !== false) throw new Error('Public room should not have passcode');

    results.push({ name: '1. Создание PUBLIC комнаты', passed: true });
  } catch (err: any) {
    results.push({ name: '1. Создание PUBLIC комнаты', passed: false, error: err.message });
  }

  // 2. Создание PRIVATE комнаты
  let privateRoomCode = '';
  let privateRoomId = 0;
  try {
    const privateRoom = await watchPartyService.createRoom(testUserHost.id, {
      title: `Private Anime Stream ${testRunId}`,
      mediaType: 'ANIME',
      privacy: 'PRIVATE',
      passcode: 'secret123',
      sourceType: 'HLS',
      sourceUrl: 'https://cdn.example.com/stream.m3u8',
      initialDuration: 1440,
    });

    privateRoomCode = privateRoom.code;
    privateRoomId = privateRoom.id;
    createdRoomIds.push(privateRoom.id);

    if (privateRoom.privacy !== 'PRIVATE') throw new Error('Expected privacy to be PRIVATE');
    if (privateRoom.hasPasscode !== true) throw new Error('Private room should indicate hasPasscode = true');

    results.push({ name: '2. Создание PRIVATE комнаты', passed: true });
  } catch (err: any) {
    results.push({ name: '2. Создание PRIVATE комнаты', passed: false, error: err.message });
  }

  // 3. Проверка, что пароль не возвращается в API DTO
  try {
    const roomDto: any = await watchPartyService.getRoom(privateRoomCode, testUserHost.id);
    if ('passcodeHash' in roomDto || 'passcode_hash' in roomDto || 'passcode' in roomDto) {
      throw new Error('Security violation: passcode or hash exposed in room DTO!');
    }
    results.push({ name: '3. Проверка скрытия пароля и хеша в DTO', passed: true });
  } catch (err: any) {
    results.push({ name: '3. Проверка скрытия пароля и хеша в DTO', passed: false, error: err.message });
  }

  // 4. Невозможность join PRIVATE без правильного пароля
  try {
    let rejected = false;
    try {
      await watchPartyService.joinRoom(privateRoomCode, testUserMember1.id, 'wrongpass');
    } catch (_err) {
      rejected = true;
    }
    if (!rejected) throw new Error('Joined private room with invalid password!');
    results.push({ name: '4. Невозможность join PRIVATE с неверным паролем', passed: true });
  } catch (err: any) {
    results.push({ name: '4. Невозможность join PRIVATE с неверным паролем', passed: false, error: err.message });
  }

  // 5. Успешный join PRIVATE с правильным паролем
  try {
    const joinResult = await watchPartyService.joinRoom(privateRoomCode, testUserMember1.id, 'secret123');
    if (joinResult.member.userId !== testUserMember1.id) throw new Error('Member userId mismatch');
    if (joinResult.member.role !== 'MEMBER') throw new Error('Joined member should receive MEMBER role');
    results.push({ name: '5. Успешный join PRIVATE с правильным паролем', passed: true });
  } catch (err: any) {
    results.push({ name: '5. Успешный join PRIVATE с правильным паролем', passed: false, error: err.message });
  }

  // 6. Duplicate join (Idempotent / re-activation)
  try {
    const secondJoin = await watchPartyService.joinRoom(privateRoomCode, testUserMember1.id);
    if (secondJoin.member.userId !== testUserMember1.id) throw new Error('Member userId mismatch on duplicate join');

    const members = await watchPartyService.getMembers(privateRoomCode);
    const user1Occurrences = members.filter((m) => m.userId === testUserMember1.id);
    if (user1Occurrences.length !== 1) throw new Error('Duplicate membership records found in DB!');

    results.push({ name: '6. Duplicate join не создаёт дубликатов', passed: true });
  } catch (err: any) {
    results.push({ name: '6. Duplicate join не создаёт дубликатов', passed: false, error: err.message });
  }

  // 7. Banned user не может войти
  try {
    await watchPartyService.kickMember(privateRoomCode, testUserHost.id, testUserMember1.id, true);

    let banBlocked = false;
    try {
      await watchPartyService.joinRoom(privateRoomCode, testUserMember1.id, 'secret123');
    } catch (_err) {
      banBlocked = true;
    }

    if (!banBlocked) throw new Error('Banned user was able to re-join!');
    results.push({ name: '7. Banned user блокируется при попытке join', passed: true });
  } catch (err: any) {
    results.push({ name: '7. Banned user блокируется при попытке join', passed: false, error: err.message });
  }

  // Let member 2 join for role and succession tests
  await watchPartyService.joinRoom(privateRoomCode, testUserMember2.id, 'secret123');

  // 8. MEMBER не может transfer HOST
  try {
    let memberForbidden = false;
    try {
      await watchPartyService.transferHost(privateRoomCode, testUserMember2.id, testUserHost.id);
    } catch (_err) {
      memberForbidden = true;
    }
    if (!memberForbidden) throw new Error('MEMBER was able to call transferHost!');
    results.push({ name: '8. Запрет передачи HOST обычным MEMBER', passed: true });
  } catch (err: any) {
    results.push({ name: '8. Запрет передачи HOST обычным MEMBER', passed: false, error: err.message });
  }

  // 9. MEMBER не может kick
  try {
    let memberForbidden = false;
    try {
      await watchPartyService.kickMember(privateRoomCode, testUserMember2.id, testUserHost.id);
    } catch (_err) {
      memberForbidden = true;
    }
    if (!memberForbidden) throw new Error('MEMBER was able to kick!');
    results.push({ name: '9. Запрет исключения участников обычным MEMBER', passed: true });
  } catch (err: any) {
    results.push({ name: '9. Запрет исключения участников обычным MEMBER', passed: false, error: err.message });
  }

  // 10. MEMBER не может close room
  try {
    let memberForbidden = false;
    try {
      await watchPartyService.closeRoom(privateRoomCode, testUserMember2.id);
    } catch (_err) {
      memberForbidden = true;
    }
    if (!memberForbidden) throw new Error('MEMBER was able to close room!');
    results.push({ name: '10. Запрет закрытия комнаты обычным MEMBER', passed: true });
  } catch (err: any) {
    results.push({ name: '10. Запрет закрытия комнаты обычным MEMBER', passed: false, error: err.message });
  }

  // 11. HOST может transfer HOST
  try {
    const updated = await watchPartyService.transferHost(privateRoomCode, testUserHost.id, testUserMember2.id);
    if (updated.hostUserId !== testUserMember2.id) throw new Error('hostUserId was not updated to new host');
    results.push({ name: '11. HOST может передать права другому участнику', passed: true });
  } catch (err: any) {
    results.push({ name: '11. HOST может передать права другому участнику', passed: false, error: err.message });
  }

  // 12. Старый HOST становится MEMBER
  // 13. Новый HOST становится HOST
  try {
    const members = await watchPartyService.getMembers(privateRoomCode);
    const oldHost = members.find((m) => m.userId === testUserHost.id);
    const newHost = members.find((m) => m.userId === testUserMember2.id);

    if (oldHost?.role !== 'MEMBER') throw new Error(`Old host role expected MEMBER, got ${oldHost?.role}`);
    if (newHost?.role !== 'HOST') throw new Error(`New host role expected HOST, got ${newHost?.role}`);

    results.push({ name: '12. Старый HOST стал MEMBER', passed: true });
    results.push({ name: '13. Новый HOST стал HOST', passed: true });
  } catch (err: any) {
    results.push({ name: '12-13. Проверка ролей после передачи HOST', passed: false, error: err.message });
  }

  // 14. Нельзя transfer HOST пользователю не из комнаты
  try {
    let rejected = false;
    try {
      await watchPartyService.transferHost(privateRoomCode, testUserMember2.id, testUserOutsider.id);
    } catch (_err) {
      rejected = true;
    }
    if (!rejected) throw new Error('Transferred host to outsider user not in room!');
    results.push({ name: '14. Нельзя передать HOST постороннему пользователю', passed: true });
  } catch (err: any) {
    results.push({ name: '14. Нельзя передать HOST постороннему пользователю', passed: false, error: err.message });
  }

  // 15. KICK (Новый хост исключает старого хоста)
  try {
    await watchPartyService.kickMember(privateRoomCode, testUserMember2.id, testUserHost.id, false);
    const inMemoryMember = roomManager.getMember(privateRoomCode, testUserHost.id);
    if (inMemoryMember) throw new Error('Kicked member still in active RoomManager memory!');
    results.push({ name: '15. KICK корректно удаляет участника', passed: true });
  } catch (err: any) {
    results.push({ name: '15. KICK корректно удаляет участника', passed: false, error: err.message });
  }

  // 16. CLOSE ROOM
  try {
    const closed = await watchPartyService.closeRoom(privateRoomCode, testUserMember2.id);
    if (closed.status !== 'CLOSED') throw new Error('Room status is not CLOSED');
    if (roomManager.isRoomActive(privateRoomCode)) throw new Error('Closed room remains in RoomManager memory!');
    results.push({ name: '16. CLOSE переводит статус в CLOSED и выгружает из памяти', passed: true });
  } catch (err: any) {
    results.push({ name: '16. CLOSE переводит статус в CLOSED и выгружает из памяти', passed: false, error: err.message });
  }

  // 17. Нельзя JOIN CLOSED room
  try {
    let rejected = false;
    try {
      await watchPartyService.joinRoom(privateRoomCode, testUserHost.id, 'secret123');
    } catch (_err) {
      rejected = true;
    }
    if (!rejected) throw new Error('Joined closed room!');
    results.push({ name: '17. Нельзя войти в закрытую комнату (JOIN CLOSED forbidden)', passed: true });
  } catch (err: any) {
    results.push({ name: '17. Нельзя войти в закрытую комнату (JOIN CLOSED forbidden)', passed: false, error: err.message });
  }

  // 18. RoomManager создаёт active state
  let testRoomCode3 = '';
  try {
    const room3 = await watchPartyService.createRoom(testUserHost.id, {
      title: `Playback Sync Room ${testRunId}`,
      mediaType: 'MOVIE',
      initialDuration: 3600,
    });
    testRoomCode3 = room3.code;
    createdRoomIds.push(room3.id);

    const active = roomManager.getActiveRoom(testRoomCode3);
    if (!active) throw new Error('RoomManager failed to register active room state');
    if (active.duration !== 3600) throw new Error(`Expected duration 3600, got ${active.duration}`);

    results.push({ name: '18. RoomManager создаёт active state в памяти', passed: true });
  } catch (err: any) {
    results.push({ name: '18. RoomManager создаёт active state в памяти', passed: false, error: err.message });
  }

  // 19. RoomManager корректно восстанавливает playback state из БД
  try {
    // Force clear memory to test lazy-load recovery from DB
    roomManager.unregisterRoom(testRoomCode3);
    if (roomManager.isRoomActive(testRoomCode3)) throw new Error('Failed to purge room for test');

    // Fetch via service -> triggers lazy loading
    const restored = await watchPartyService.getRoom(testRoomCode3);
    if (!roomManager.isRoomActive(testRoomCode3)) throw new Error('Room was not lazy-loaded into RoomManager');
    if (restored.status !== 'ACTIVE') throw new Error('Restored room status mismatch');

    results.push({ name: '19. RoomManager корректно lazy-load восстанавливает комнату из БД', passed: true });
  } catch (err: any) {
    results.push({ name: '19. RoomManager корректно lazy-load восстанавливает комнату из БД', passed: false, error: err.message });
  }

  // 20. Server-authoritative playback timestamp рассчитывается корректно
  try {
    const activeRoom = roomManager.getActiveRoom(testRoomCode3);
    if (!activeRoom) throw new Error('Active room not found for playback calculation test');

    // Simulate PLAY event at position 100.0
    const now = Date.now();
    activeRoom.playbackState = 'PLAYING';
    activeRoom.currentTime = 100.0;
    activeRoom.lastActionTimestamp = now - 5000; // 5 seconds ago

    const calculatedPos = roomManager.calculateAuthoritativePosition(activeRoom, now);
    if (Math.abs(calculatedPos - 105.0) > 0.1) {
      throw new Error(`Expected calculated position ~105.0s after 5s playback, got ${calculatedPos}`);
    }

    // Simulate PAUSE event
    activeRoom.playbackState = 'PAUSED';
    activeRoom.currentTime = 105.0;
    activeRoom.lastActionTimestamp = now;

    const pausedPos = roomManager.calculateAuthoritativePosition(activeRoom, now + 10000);
    if (pausedPos !== 105.0) {
      throw new Error(`Expected paused position to stay 105.0s, got ${pausedPos}`);
    }

    results.push({ name: '20. Server-authoritative playback расчет позиции по серверному времени', passed: true });
  } catch (err: any) {
    results.push({ name: '20. Server-authoritative playback расчет позиции по серверному времени', passed: false, error: err.message });
  }

  // Cleanup test data
  try {
    if (createdRoomIds.length > 0) {
      await db.delete(watchPartyRooms).where(inArray(watchPartyRooms.id, createdRoomIds));
    }
    const testUserIds = [testUserHost.id, testUserMember1.id, testUserMember2.id, testUserOutsider.id];
    await db.delete(users).where(inArray(users.id, testUserIds));
  } catch (cleanErr) {
    console.warn('Cleanup error (non-fatal):', cleanErr);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return { total: results.length, passed, failed, results };
}

// Standalone runner when invoked via CLI
if (process.argv[1]?.includes('watchPartyLifecycleTests')) {
  runWatchPartyLifecycleTests()
    .then((summary) => {
      console.log('\n=== WATCH PARTY STAGE 2 TEST RESULTS ===');
      for (const res of summary.results) {
        if (res.passed) {
          console.log(`\x1b[32m✔ PASS\x1b[0m ${res.name}`);
        } else {
          console.log(`\x1b[31m✘ FAIL\x1b[0m ${res.name}: ${res.error}`);
        }
      }
      console.log(`\nTotal: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}\n`);
      if (summary.failed > 0) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error('Test execution error:', err);
      process.exit(1);
    });
}
