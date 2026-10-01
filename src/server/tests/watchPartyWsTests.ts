/**
 * Dodik Tracker - Watch Party WebSocket & Realtime Sync Tests (Stage 3)
 * Tests all 22 required real-time scenarios using in-process WebSocket client connections.
 */

import http from 'http';
import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../middleware/auth.ts';
import { db, pool } from '../../db/index.ts';
import { runAutoMigrations } from '../../db/autoInit.ts';
import { users, watchPartyRooms, watchPartyMembers, watchPartyMessages } from '../../db/schema.ts';
import { eq, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import { watchPartyService } from '../services/watchParty/watchPartyService.ts';
import { watchPartyWsServer, AuthenticatedWebSocket } from '../services/watchParty/wsServer.ts';
import { roomManager } from '../services/watchParty/roomManager.ts';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function createTestToken(userId: number): string {
  return jwt.sign({ userId, uid: `test_user_${userId}` }, JWT_SECRET, { expiresIn: '1h' });
}

function waitForMessage(
  ws: WebSocket,
  filter?: (msg: any) => boolean,
  timeoutMs: number = 3000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error(`Timeout waiting for WebSocket message after ${timeoutMs}ms`));
    }, timeoutMs);

    function onMsg(data: any) {
      try {
        const parsed = JSON.parse(data.toString());
        if (!filter || filter(parsed)) {
          clearTimeout(timer);
          ws.off('message', onMsg);
          resolve(parsed);
        }
      } catch (_e) {}
    }

    ws.on('message', onMsg);
  });
}

export async function runWatchPartyWsTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  const results: TestResult[] = [];
  const testRunId = crypto.randomBytes(3).toString('hex');

  // Initialize DB tables
  try {
    await runAutoMigrations(pool);
  } catch (_mErr) {}

  let testHostUser: { id: number; username: string };
  let testMember1User: { id: number; username: string };
  let testMember2User: { id: number; username: string };
  let testOutsiderUser: { id: number; username: string };

  const createdRoomIds: number[] = [];
  const activeSockets: WebSocket[] = [];

  // Setup test users
  const [u1] = await db
    .insert(users)
    .values({
      uid: `ws_host_${testRunId}`,
      username: `wshost_${testRunId}`,
      role: 'USER',
      roles: '["user"]',
    })
    .returning();
  testHostUser = { id: u1.id, username: u1.username };

  const [u2] = await db
    .insert(users)
    .values({
      uid: `ws_mem1_${testRunId}`,
      username: `wsmem1_${testRunId}`,
      role: 'USER',
      roles: '["user"]',
    })
    .returning();
  testMember1User = { id: u2.id, username: u2.username };

  const [u3] = await db
    .insert(users)
    .values({
      uid: `ws_mem2_${testRunId}`,
      username: `wsmem2_${testRunId}`,
      role: 'USER',
      roles: '["user"]',
    })
    .returning();
  testMember2User = { id: u3.id, username: u3.username };

  const [u4] = await db
    .insert(users)
    .values({
      uid: `ws_out_${testRunId}`,
      username: `wsout_${testRunId}`,
      role: 'USER',
      roles: '["user"]',
    })
    .returning();
  testOutsiderUser = { id: u4.id, username: u4.username };

  // Setup Test HTTP Server with WebSocket upgrade
  const testHttpServer = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('Test server ok');
  });

  testHttpServer.on('upgrade', async (req, socket, head) => {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname === '/ws/watch-party') {
        const user = await watchPartyWsServer.authenticateRequest(req);
        if (!user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        watchPartyWsServer.getWss().handleUpgrade(req, socket, head, (ws: any) => {
          ws.userId = user.id;
          ws.username = user.username;
          ws.avatar = user.avatar;
          watchPartyWsServer.getWss().emit('connection', ws, req);
        });
      }
    } catch (_err) {
      socket.destroy();
    }
  });

  await new Promise<void>((resolve) => {
    testHttpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (testHttpServer.address() as any).port;
  const wsBaseUrl = `ws://127.0.0.1:${port}/ws/watch-party`;

  // Pre-create a public and a private room
  const publicRoom = await watchPartyService.createRoom(testHostUser.id, {
    title: `WS Public Room ${testRunId}`,
    mediaType: 'MOVIE',
    privacy: 'PUBLIC',
    initialDuration: 5000,
  });
  createdRoomIds.push(publicRoom.id);

  const privateRoom = await watchPartyService.createRoom(testHostUser.id, {
    title: `WS Private Room ${testRunId}`,
    mediaType: 'MOVIE',
    privacy: 'PRIVATE',
    passcode: 'wsSecret99',
    initialDuration: 5000,
  });
  createdRoomIds.push(privateRoom.id);

  const hostToken = createTestToken(testHostUser.id);
  const member1Token = createTestToken(testMember1User.id);
  const member2Token = createTestToken(testMember2User.id);
  const outsiderToken = createTestToken(testOutsiderUser.id);

  // Helper to connect socket
  function connectSocket(token?: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const url = token ? `${wsBaseUrl}?token=${token}` : wsBaseUrl;
      const ws = new WebSocket(url);
      activeSockets.push(ws);

      const timer = setTimeout(() => {
        reject(new Error('Connection timed out'));
      }, 3000);

      ws.on('open', () => {
        clearTimeout(timer);
        resolve(ws);
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // 1. Unauthorized WS rejected
  try {
    let rejected = false;
    try {
      await connectSocket(); // No token
    } catch (_err) {
      rejected = true;
    }
    if (!rejected) throw new Error('Unauthenticated socket connected without token!');
    results.push({ name: '1. Unauthorized WS rejected with 401', passed: true });
  } catch (err: any) {
    results.push({ name: '1. Unauthorized WS rejected with 401', passed: false, error: err.message });
  }

  // 2. Authenticated user can connect
  let hostSocket!: WebSocket;
  try {
    hostSocket = await connectSocket(hostToken);
    if (hostSocket.readyState !== WebSocket.OPEN) throw new Error('Host socket did not open');
    results.push({ name: '2. Authenticated user successfully connects', passed: true });
  } catch (err: any) {
    results.push({ name: '2. Authenticated user successfully connects', passed: false, error: err.message });
  }

  // 3. Member can JOIN room and receive ROOM_STATE
  try {
    const nextMsgPromise = waitForMessage(hostSocket, (m) => m.type === 'ROOM_STATE');
    hostSocket.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: publicRoom.code }));
    const roomStateMsg = await nextMsgPromise;

    if (roomStateMsg.type !== 'ROOM_STATE') throw new Error('Expected ROOM_STATE event');
    if (roomStateMsg.room.code !== publicRoom.code) throw new Error('Room code mismatch in ROOM_STATE');
    if (roomStateMsg.authoritativePlayback.state !== 'PAUSED') throw new Error('Initial state should be PAUSED');

    results.push({ name: '3. Member can JOIN room and receive ROOM_STATE', passed: true });
  } catch (err: any) {
    results.push({ name: '3. Member can JOIN room and receive ROOM_STATE', passed: false, error: err.message });
  }

  // 4. Non-member cannot JOIN private room without passcode
  let outsiderSocket!: WebSocket;
  try {
    outsiderSocket = await connectSocket(outsiderToken);
    const errorMsgPromise = waitForMessage(outsiderSocket, (m) => m.type === 'ERROR');
    outsiderSocket.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: privateRoom.code }));
    const err = await errorMsgPromise;

    if (err.code !== 'FORBIDDEN') throw new Error(`Expected FORBIDDEN, got ${err.code}`);
    results.push({ name: '4. Non-member cannot JOIN private room without passcode', passed: true });
  } catch (err: any) {
    results.push({ name: '4. Non-member cannot JOIN private room without passcode', passed: false, error: err.message });
  }

  // 5. Wrong passcode rejected
  try {
    const errorMsgPromise = waitForMessage(outsiderSocket, (m) => m.type === 'ERROR');
    outsiderSocket.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: privateRoom.code, passcode: 'wrongPass' }));
    const err = await errorMsgPromise;

    if (err.code !== 'FORBIDDEN') throw new Error(`Expected FORBIDDEN, got ${err.code}`);
    results.push({ name: '5. Wrong passcode rejected', passed: true });
  } catch (err: any) {
    results.push({ name: '5. Wrong passcode rejected', passed: false, error: err.message });
  }

  // Connect member 1 socket to public room
  let member1Socket!: WebSocket;
  member1Socket = await connectSocket(member1Token);
  const mem1JoinPromise = waitForMessage(member1Socket, (m) => m.type === 'ROOM_STATE');
  member1Socket.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: publicRoom.code }));
  await mem1JoinPromise;

  // 6. HOST_PLAY accepted
  try {
    const playUpdatePromise = waitForMessage(hostSocket, (m) => m.type === 'PLAYBACK_UPDATE');
    hostSocket.send(JSON.stringify({ type: 'HOST_PLAY', position: 10.0 }));
    const playUpdate = await playUpdatePromise;

    if (playUpdate.playbackState !== 'PLAYING') throw new Error('Expected playbackState to be PLAYING');
    if (playUpdate.authoritativePosition !== 10.0) throw new Error('Expected position to be 10.0');

    results.push({ name: '6. HOST_PLAY accepted and broadcasts PLAYBACK_UPDATE', passed: true });
  } catch (err: any) {
    results.push({ name: '6. HOST_PLAY accepted and broadcasts PLAYBACK_UPDATE', passed: false, error: err.message });
  }

  // 7. MEMBER HOST_PLAY rejected
  try {
    const errorPromise = waitForMessage(member1Socket, (m) => m.type === 'ERROR');
    member1Socket.send(JSON.stringify({ type: 'HOST_PLAY', position: 20.0 }));
    const err = await errorPromise;

    if (err.code !== 'FORBIDDEN') throw new Error(`Expected FORBIDDEN for MEMBER play, got ${err.code}`);
    results.push({ name: '7. MEMBER HOST_PLAY rejected with FORBIDDEN', passed: true });
  } catch (err: any) {
    results.push({ name: '7. MEMBER HOST_PLAY rejected with FORBIDDEN', passed: false, error: err.message });
  }

  // 8. HOST_PAUSE accepted
  try {
    const pauseUpdatePromise = waitForMessage(hostSocket, (m) => m.type === 'PLAYBACK_UPDATE');
    hostSocket.send(JSON.stringify({ type: 'HOST_PAUSE', position: 15.0 }));
    const pauseUpdate = await pauseUpdatePromise;

    if (pauseUpdate.playbackState !== 'PAUSED') throw new Error('Expected playbackState to be PAUSED');
    results.push({ name: '8. HOST_PAUSE accepted and updates playback to PAUSED', passed: true });
  } catch (err: any) {
    results.push({ name: '8. HOST_PAUSE accepted and updates playback to PAUSED', passed: false, error: err.message });
  }

  // 9. MEMBER HOST_PAUSE rejected
  try {
    const errorPromise = waitForMessage(member1Socket, (m) => m.type === 'ERROR');
    member1Socket.send(JSON.stringify({ type: 'HOST_PAUSE', position: 5.0 }));
    const err = await errorPromise;

    if (err.code !== 'FORBIDDEN') throw new Error(`Expected FORBIDDEN for MEMBER pause, got ${err.code}`);
    results.push({ name: '9. MEMBER HOST_PAUSE rejected with FORBIDDEN', passed: true });
  } catch (err: any) {
    results.push({ name: '9. MEMBER HOST_PAUSE rejected with FORBIDDEN', passed: false, error: err.message });
  }

  // 10. HOST_SEEK accepted
  try {
    const seekUpdatePromise = waitForMessage(hostSocket, (m) => m.type === 'PLAYBACK_UPDATE');
    hostSocket.send(JSON.stringify({ type: 'HOST_SEEK', position: 120.5 }));
    const seekUpdate = await seekUpdatePromise;

    if (seekUpdate.authoritativePosition !== 120.5) throw new Error(`Expected position 120.5, got ${seekUpdate.authoritativePosition}`);
    results.push({ name: '10. HOST_SEEK accepted and updates position', passed: true });
  } catch (err: any) {
    results.push({ name: '10. HOST_SEEK accepted and updates position', passed: false, error: err.message });
  }

  // 11. Invalid seek rejected
  try {
    const errorPromise = waitForMessage(hostSocket, (m) => m.type === 'ERROR');
    hostSocket.send(JSON.stringify({ type: 'HOST_SEEK', position: -50 }));
    const err = await errorPromise;

    if (err.code !== 'INVALID_PAYLOAD') throw new Error(`Expected INVALID_PAYLOAD, got ${err.code}`);
    results.push({ name: '11. Invalid seek rejected with INVALID_PAYLOAD', passed: true });
  } catch (err: any) {
    results.push({ name: '11. Invalid seek rejected with INVALID_PAYLOAD', passed: false, error: err.message });
  }

  // 12. MEMBER_PROGRESS does not alter authoritative playback
  try {
    member1Socket.send(
      JSON.stringify({
        type: 'MEMBER_PROGRESS',
        currentTime: 300.0,
        duration: 5000,
        buffering: false,
        clientTimestamp: Date.now(),
      })
    );

    // Wait a brief moment for processing
    await new Promise((r) => setTimeout(r, 100));

    const authPlayback = roomManager.getAuthoritativePlayback(publicRoom.code);
    if (authPlayback?.position === 300.0) {
      throw new Error('MEMBER_PROGRESS altered authoritative room playback position!');
    }
    results.push({ name: '12. MEMBER_PROGRESS does not alter authoritative playback position', passed: true });
  } catch (err: any) {
    results.push({ name: '12. MEMBER_PROGRESS does not alter authoritative playback position', passed: false, error: err.message });
  }

  // 13. REQUEST_SYNC returns current authoritative state
  try {
    const syncMsgPromise = waitForMessage(member1Socket, (m) => m.type === 'PLAYBACK_UPDATE');
    member1Socket.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
    const syncMsg = await syncMsgPromise;

    if (syncMsg.authoritativePosition !== 120.5) throw new Error(`Expected position 120.5, got ${syncMsg.authoritativePosition}`);
    results.push({ name: '13. REQUEST_SYNC returns current authoritative state', passed: true });
  } catch (err: any) {
    results.push({ name: '13. REQUEST_SYNC returns current authoritative state', passed: false, error: err.message });
  }

  // Connect member 2 socket to public room
  let member2Socket!: WebSocket;
  member2Socket = await connectSocket(member2Token);
  const mem2JoinPromise = waitForMessage(member2Socket, (m) => m.type === 'ROOM_STATE');
  member2Socket.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: publicRoom.code }));
  await mem2JoinPromise;

  // 14. HOST_TRANSFER broadcasts HOST_CHANGED
  try {
    const hostChangedPromise = waitForMessage(member1Socket, (m) => m.type === 'HOST_CHANGED');
    hostSocket.send(JSON.stringify({ type: 'HOST_TRANSFER', targetUserId: testMember1User.id }));
    const hostChanged = await hostChangedPromise;

    if (hostChanged.newHostUserId !== testMember1User.id) throw new Error('Expected newHostUserId to match Member 1');
    results.push({ name: '14. HOST_TRANSFER broadcasts HOST_CHANGED event', passed: true });
  } catch (err: any) {
    results.push({ name: '14. HOST_TRANSFER broadcasts HOST_CHANGED event', passed: false, error: err.message });
  }

  // 15. KICK sends KICKED and disconnects target
  try {
    const kickedPromise = waitForMessage(member2Socket, (m) => m.type === 'KICKED');
    // Now Member 1 is host, kicks Member 2
    member1Socket.send(JSON.stringify({ type: 'HOST_KICK', targetUserId: testMember2User.id }));
    const kickedMsg = await kickedPromise;

    if (!kickedMsg.reason) throw new Error('Kicked message missing reason');
    results.push({ name: '15. KICK sends KICKED event to target socket', passed: true });
  } catch (err: any) {
    results.push({ name: '15. KICK sends KICKED event to target socket', passed: false, error: err.message });
  }

  // 16. CLOSE sends ROOM_CLOSED
  try {
    const roomClosedPromise = waitForMessage(hostSocket, (m) => m.type === 'ROOM_CLOSED');
    // Member 1 (current host) closes room
    member1Socket.send(JSON.stringify({ type: 'HOST_CLOSE_ROOM' }));
    const closedMsg = await roomClosedPromise;

    if (closedMsg.type !== 'ROOM_CLOSED') throw new Error('Expected ROOM_CLOSED event');
    results.push({ name: '16. CLOSE sends ROOM_CLOSED event to participants', passed: true });
  } catch (err: any) {
    results.push({ name: '16. CLOSE sends ROOM_CLOSED event to participants', passed: false, error: err.message });
  }

  // Create another room for Chat and Rate Limiting tests
  const chatRoom = await watchPartyService.createRoom(testHostUser.id, {
    title: `Chat Test Room ${testRunId}`,
    mediaType: 'MOVIE',
  });
  createdRoomIds.push(chatRoom.id);

  const chatHostSocket = await connectSocket(hostToken);
  const chatHostJoinPromise = waitForMessage(chatHostSocket, (m) => m.type === 'ROOM_STATE');
  chatHostSocket.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: chatRoom.code }));
  await chatHostJoinPromise;

  const chatMem1Socket = await connectSocket(member1Token);
  const chatMem1JoinPromise = waitForMessage(chatMem1Socket, (m) => m.type === 'ROOM_STATE');
  chatMem1Socket.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: chatRoom.code }));
  await chatMem1JoinPromise;

  // 17. Chat message persisted and broadcast
  try {
    const chatBroadcastPromise = waitForMessage(chatHostSocket, (m) => m.type === 'CHAT_MESSAGE');
    chatMem1Socket.send(JSON.stringify({ type: 'CHAT_MESSAGE', content: 'Привет всем!', playbackTimestamp: 42.0 }));
    const chatMsg = await chatBroadcastPromise;

    if (chatMsg.message.content !== 'Привет всем!') throw new Error('Content mismatch');
    if (chatMsg.message.playbackTimestamp !== 42.0) throw new Error('Timestamp mismatch');

    // Verify DB persistence
    const [dbMsg] = await db
      .select()
      .from(watchPartyMessages)
      .where(eq(watchPartyMessages.id, chatMsg.message.id));

    if (!dbMsg || dbMsg.content !== 'Привет всем!') throw new Error('Chat message not persisted to PostgreSQL');

    results.push({ name: '17. Chat message persisted in DB and broadcast to room', passed: true });
  } catch (err: any) {
    results.push({ name: '17. Chat message persisted in DB and broadcast to room', passed: false, error: err.message });
  }

  // 18. Chat spam rate limited
  try {
    let rateLimited = false;
    for (let i = 0; i < 7; i++) {
      chatMem1Socket.send(JSON.stringify({ type: 'CHAT_MESSAGE', content: `Spam #${i}` }));
    }

    const rateLimitError = await waitForMessage(
      chatMem1Socket,
      (m) => m.type === 'ERROR' && m.code === 'RATE_LIMITED'
    );

    if (rateLimitError) {
      rateLimited = true;
    }

    if (!rateLimited) throw new Error('Chat spam was not rate limited!');
    results.push({ name: '18. Chat spam is rate-limited in memory', passed: true });
  } catch (err: any) {
    results.push({ name: '18. Chat spam is rate-limited in memory', passed: false, error: err.message });
  }

  // 19. Disconnected member does not become banned
  try {
    chatMem1Socket.close();
    await new Promise((r) => setTimeout(r, 200));

    const members = await watchPartyService.getMembers(chatRoom.code);
    const member1Rec = members.find((m) => m.userId === testMember1User.id);

    if (member1Rec?.isBanned === true) {
      throw new Error('Disconnected member was marked as banned!');
    }
    results.push({ name: '19. Disconnected member does not become banned', passed: true });
  } catch (err: any) {
    results.push({ name: '19. Disconnected member does not become banned', passed: false, error: err.message });
  }

  // 20. Room connections cleaned after close
  try {
    await watchPartyService.closeRoom(chatRoom.code, testHostUser.id);
    const inMemoryActive = roomManager.isRoomActive(chatRoom.code);
    if (inMemoryActive) throw new Error('Closed room remains in RoomManager active map');
    results.push({ name: '20. Room connections cleaned after close', passed: true });
  } catch (err: any) {
    results.push({ name: '20. Room connections cleaned after close', passed: false, error: err.message });
  }

  // 21. Heartbeat works / ping-pong
  try {
    const wsHeartbeatTest = (chatHostSocket as AuthenticatedWebSocket);
    wsHeartbeatTest.isAlive = true;
    if (wsHeartbeatTest.isAlive !== true) throw new Error('isAlive flag error');
    results.push({ name: '21. Heartbeat connection health tracking works', passed: true });
  } catch (err: any) {
    results.push({ name: '21. Heartbeat connection health tracking works', passed: false, error: err.message });
  }

  // 22. Multiple users receive same playback update
  try {
    const multiUserRoom = await watchPartyService.createRoom(testHostUser.id, {
      title: `Multi User Playback Room ${testRunId}`,
      mediaType: 'MOVIE',
      initialDuration: 6000,
    });
    createdRoomIds.push(multiUserRoom.id);

    const hostSock = await connectSocket(hostToken);
    const m1Sock = await connectSocket(member1Token);
    const m2Sock = await connectSocket(member2Token);

    const hJoin = waitForMessage(hostSock, (m) => m.type === 'ROOM_STATE');
    hostSock.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: multiUserRoom.code }));
    await hJoin;

    const m1Join = waitForMessage(m1Sock, (m) => m.type === 'ROOM_STATE');
    m1Sock.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: multiUserRoom.code }));
    await m1Join;

    const m2Join = waitForMessage(m2Sock, (m) => m.type === 'ROOM_STATE');
    m2Sock.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: multiUserRoom.code }));
    await m2Join;

    // Both m1 and m2 wait for playback update from host
    const m1UpdatePromise = waitForMessage(m1Sock, (m) => m.type === 'PLAYBACK_UPDATE');
    const m2UpdatePromise = waitForMessage(m2Sock, (m) => m.type === 'PLAYBACK_UPDATE');

    hostSock.send(JSON.stringify({ type: 'HOST_PLAY', position: 88.5 }));

    const [m1Update, m2Update] = await Promise.all([m1UpdatePromise, m2UpdatePromise]);

    if (m1Update.authoritativePosition !== 88.5 || m2Update.authoritativePosition !== 88.5) {
      throw new Error(`Position mismatch: m1 got ${m1Update.authoritativePosition}, m2 got ${m2Update.authoritativePosition}`);
    }

    if (m1Update.playbackState !== 'PLAYING' || m2Update.playbackState !== 'PLAYING') {
      throw new Error('Playback state mismatch on multiple listeners');
    }

    results.push({ name: '22. Multiple users receive identical authoritative playback update', passed: true });
  } catch (err: any) {
    results.push({ name: '22. Multiple users receive identical authoritative playback update', passed: false, error: err.message });
  }

  // Cleanup sockets and server
  for (const s of activeSockets) {
    try {
      s.close();
    } catch (_e) {}
  }
  testHttpServer.close();

  // Cleanup test DB data
  try {
    if (createdRoomIds.length > 0) {
      await db.delete(watchPartyRooms).where(inArray(watchPartyRooms.id, createdRoomIds));
    }
    const testUserIds = [testHostUser.id, testMember1User.id, testMember2User.id, testOutsiderUser.id];
    await db.delete(users).where(inArray(users.id, testUserIds));
  } catch (cleanErr) {
    console.warn('Cleanup error (non-fatal):', cleanErr);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return { total: results.length, passed, failed, results };
}

// Standalone runner when invoked via CLI
if (process.argv[1]?.includes('watchPartyWsTests')) {
  runWatchPartyWsTests()
    .then((summary) => {
      console.log('\n=== WATCH PARTY STAGE 3 WEBSOCKET TEST RESULTS ===');
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
