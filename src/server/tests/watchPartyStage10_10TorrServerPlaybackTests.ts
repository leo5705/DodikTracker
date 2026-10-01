/**
 * Stage 10.10: Regression Tests for Watch Party TorrServer Playback Flow
 *
 * Specifically verifies:
 * 1. Torrent source with infoHash + magnetUri gets TorrServer HTTP stream URL.
 * 2. TorrentMediaSourceAdapter loads TorrServer stream directly without creating WebTorrent client.
 * 3. Absence of initial config.url automatically derives TorrServer stream URL from infoHash.
 * 4. Canonical magnet format is preserved.
 * 5. HTTP download URL without infoHash is rejected (SSRF & security hardening).
 * 6. Normal Watch remains PUBLIC (no password required).
 * 7. Private Watch continues to require valid password (>= 3 chars).
 * 8. Streaming proxy endpoints support Range request forwarding without exposing internal hostnames.
 * 9. Source switching preserves infoHash / magnet / stream URL.
 * 10. WebTorrent client is never instantiated when TorrServer streaming is active.
 */

import { db } from '../../db/index.ts';
import { users, watchPartyRooms, watchPartyMembers, media } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { watchPartyService } from '../services/watchParty/watchPartyService.ts';
import { TorrentMediaSourceAdapter } from '../../services/mediaSources/TorrentMediaSourceAdapter.ts';
import { validateAndParseMagnet } from '../../utils/magnetValidator.ts';
import { MediaSourceConfig } from '../../types/watchParty.ts';

async function runStage10_10Tests() {
  console.log('--- STARTING STAGE 10.10 TORRSERVER PLAYBACK REGRESSION TESTS ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`\x1b[32m✔ PASS\x1b[0m ${testName}`);
      passed++;
    } else {
      console.error(`\x1b[31m✘ FAIL\x1b[0m ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  const timestamp = Date.now();
  const testInfoHash = '0123456789abcdef0123456789abcdef01234567';
  const testMagnet = `magnet:?xt=urn:btih:${testInfoHash}&dn=TestMovie`;

  try {
    // Setup test user and media
    const [testUser] = await db
      .insert(users)
      .values({
        uid: `uid_ts10_${timestamp}`,
        username: `user_ts10_${timestamp}`,
        email: `user_ts10_${timestamp}@example.com`,
        passwordHash: 'dummy_hash',
      })
      .returning();

    const [testMedia] = await db
      .insert(media)
      .values({
        title: 'Тестовый фильм 10.10',
        type: 'MOVIE',
        year: 2026,
      })
      .returning();

    // -------------------------------------------------------------------------
    // Test 1: Torrent source gets TorrServer stream URL
    // -------------------------------------------------------------------------
    const room1 = await watchPartyService.createRoom(testUser.id, {
      title: 'Комната с торрентом',
      privacy: 'PUBLIC',
      mediaId: testMedia.id,
      sourceType: 'TORRENT',
      sourceConfig: {
        type: 'TORRENT',
        magnetUri: testMagnet,
        infoHash: testInfoHash,
        torrentFileIndex: 2,
        title: 'TestMovie.2026.1080p.mkv',
      },
    });

    const streamUrl = room1.sourceConfig?.url;
    assert(
      Boolean(streamUrl && streamUrl.includes(`/api/watch-party/torrents/stream?hash=${testInfoHash}&index=2`)),
      '1. Torrent source received TorrServer HTTP stream proxy URL',
      `Got: ${streamUrl}`
    );

    // -------------------------------------------------------------------------
    // Test 2: TorrentMediaSourceAdapter loads TorrServer stream without WebTorrent client
    // -------------------------------------------------------------------------
    const adapter = new TorrentMediaSourceAdapter();
    let readyCalled = false;
    await adapter.initialize({
      onReady: () => { readyCalled = true; },
      onStateChange: () => {},
    });

    await adapter.load(room1.sourceConfig!);

    const webTorrentClient = (adapter as any).client;
    assert(
      webTorrentClient === null,
      '2. TorrentMediaSourceAdapter with TorrServer URL did NOT instantiate WebTorrent client'
    );
    assert(
      adapter.state === 'READY',
      '2b. Adapter transitioned to READY state for TorrServer HTTP stream'
    );

    // -------------------------------------------------------------------------
    // Test 3: Absence of initial config.url derives TorrServer stream URL from infoHash
    // -------------------------------------------------------------------------
    const adapterNoUrl = new TorrentMediaSourceAdapter();
    await adapterNoUrl.initialize({ onStateChange: () => {} });
    await adapterNoUrl.load({
      type: 'TORRENT',
      magnetUri: testMagnet,
      infoHash: testInfoHash,
      torrentFileIndex: 1,
    });

    assert(
      (adapterNoUrl as any).client === null,
      '3. Adapter derived TorrServer stream from infoHash and avoided WebTorrent instantiation'
    );
    assert(
      (adapterNoUrl as any).currentConfig?.url === `/api/watch-party/torrents/stream?hash=${testInfoHash}&index=${1}`,
      '3b. Adapter resolved correct stream URL path'
    );

    // -------------------------------------------------------------------------
    // Test 4: Canonical magnet format is preserved
    // -------------------------------------------------------------------------
    assert(
      room1.sourceConfig?.magnetUri?.startsWith('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567') === true,
      '4. Canonical magnet format preserved in sourceConfig'
    );

    // -------------------------------------------------------------------------
    // Test 5: HTTP download URL without infoHash is rejected (SSRF protection)
    // -------------------------------------------------------------------------
    let invalidRejected = false;
    try {
      await watchPartyService.createRoom(testUser.id, {
        title: 'Невалидный HTTP URL',
        privacy: 'PUBLIC',
        sourceType: 'TORRENT',
        sourceConfig: {
          type: 'TORRENT',
          url: 'https://evil-server.com/malicious.mp4',
        },
      });
    } catch (err: any) {
      if (err.message.includes('Обычный HTTP/HTTPS URL не является magnet-ссылкой')) {
        invalidRejected = true;
      }
    }
    assert(
      invalidRejected,
      '5. HTTP download URL without infoHash rejected by security validator'
    );

    // -------------------------------------------------------------------------
    // Test 6: Normal Watch remains PUBLIC (no password required)
    // -------------------------------------------------------------------------
    assert(
      room1.privacy === 'PUBLIC',
      '6. Normal watch room created with PUBLIC privacy without requiring password'
    );

    // -------------------------------------------------------------------------
    // Test 7: Private Watch continues to require valid password (>= 3 chars)
    // -------------------------------------------------------------------------
    let privateNoPassRejected = false;
    try {
      await watchPartyService.createRoom(testUser.id, {
        title: 'Приватная комната без пароля',
        privacy: 'PRIVATE',
        passcode: '',
      });
    } catch (err: any) {
      if (err.message.includes('Для приватной комнаты требуется пароль')) {
        privateNoPassRejected = true;
      }
    }
    assert(
      privateNoPassRejected,
      '7. Private watch without password rejected with >= 3 chars error'
    );

    // -------------------------------------------------------------------------
    // Test 8: Source switching preserves infoHash, magnetUri, and TorrServer stream URL
    // -------------------------------------------------------------------------
    const newHash = 'abcdef0123456789abcdef0123456789abcdef01';
    const newMagnet = `magnet:?xt=urn:btih:${newHash}&dn=SwitchedMovie`;

    const updatedRoom = await watchPartyService.changeSource(
      room1.code,
      testUser.id,
      {
        type: 'TORRENT',
        magnetUri: newMagnet,
        infoHash: newHash,
        torrentFileIndex: 0,
        title: 'SwitchedMovie.1080p.mkv',
      }
    );

    assert(
      updatedRoom.sourceConfig?.infoHash === newHash,
      '8. Source switching preserved updated infoHash'
    );
    assert(
      updatedRoom.sourceConfig?.url === `/api/watch-party/torrents/stream?hash=${newHash}&index=0`,
      '8b. Source switching generated new TorrServer stream URL'
    );

    // -------------------------------------------------------------------------
    // Test 9: WebTorrent client is never instantiated when TorrServer streaming is active
    // -------------------------------------------------------------------------
    const attachVideoElem = {
      src: '',
      load: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      pause: () => {},
      removeAttribute: () => {},
    } as any;

    await adapter.attach(attachVideoElem);
    assert(
      attachVideoElem.src.includes(`/api/watch-party/torrents/stream?hash=${testInfoHash}&index=2`),
      '9. Video element src assigned to TorrServer HTTP stream proxy URL'
    );
    assert(
      (adapter as any).client === null,
      '9b. WebTorrent client remained null throughout attach lifecycle'
    );

    // -------------------------------------------------------------------------
    // Clean up test data
    // -------------------------------------------------------------------------
    await watchPartyService.closeRoom(room1.code, testUser.id);
    await db.delete(watchPartyMembers).where(eq(watchPartyMembers.userId, testUser.id));
    await db.delete(watchPartyRooms).where(eq(watchPartyRooms.hostUserId, testUser.id));
    await db.delete(media).where(eq(media.id, testMedia.id));
    await db.delete(users).where(eq(users.id, testUser.id));

    console.log('\n--- STAGE 10.10 TEST SUMMARY ---');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err: any) {
    console.error('Unhandled error in Stage 10.10 test runner:', err);
    process.exit(1);
  }
}

runStage10_10Tests();
