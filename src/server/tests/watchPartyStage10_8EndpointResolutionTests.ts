/**
 * Stage 10.8: Runtime Endpoint Resolution Tests
 *
 * Verifies:
 * 1. Default Prowlarr URL is canonical PM2-host loopback (http://127.0.0.1:9696) when PROWLARR_URL is unset.
 * 2. Default TorrServer URL is canonical PM2-host loopback (http://127.0.0.1:8090) when TORRSERVER_URL is unset.
 * 3. Never defaults to Docker internal hostnames (prowlarr:9696 / torrserver:8090) on host runtime.
 * 4. Explicit PROWLARR_URL environment override is respected.
 * 5. Explicit TORRSERVER_URL environment override is respected.
 * 6. TorznabClient and TorrServerClient instances resolve canonical URLs correctly.
 */

import { TorznabClient } from '../services/torrentSearch/torznabClient.ts';
import { TorrServerClient } from '../services/torrentSearch/torrServerClient.ts';

async function runStage10_8EndpointResolutionTests() {
  console.log('--- STARTING STAGE 10.8 RUNTIME ENDPOINT RESOLUTION TESTS ---');
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

  const origProwlarrUrl = process.env.PROWLARR_URL;
  const origTorrServerUrl = process.env.TORRSERVER_URL;

  try {
    // -------------------------------------------------------------------------
    // Test 1: Unset PROWLARR_URL defaults to http://127.0.0.1:9696
    // -------------------------------------------------------------------------
    delete process.env.PROWLARR_URL;
    const defaultTorznab = new TorznabClient();
    assert(
      defaultTorznab.prowlarrUrl === 'http://127.0.0.1:9696',
      '1. Default Prowlarr endpoint is http://127.0.0.1:9696 when env var is unset',
      `Got ${defaultTorznab.prowlarrUrl}`
    );

    // -------------------------------------------------------------------------
    // Test 2: Unset TORRSERVER_URL defaults to http://127.0.0.1:8090
    // -------------------------------------------------------------------------
    delete process.env.TORRSERVER_URL;
    const defaultTorrServer = new TorrServerClient();
    assert(
      defaultTorrServer.baseUrl === 'http://127.0.0.1:8090',
      '2. Default TorrServer endpoint is http://127.0.0.1:8090 when env var is unset',
      `Got ${defaultTorrServer.baseUrl}`
    );

    // -------------------------------------------------------------------------
    // Test 3 & 4: Never selects Docker internal DNS aliases by default
    // -------------------------------------------------------------------------
    assert(
      !defaultTorznab.prowlarrUrl.includes('prowlarr:9696'),
      '3. Prowlarr default does not use Docker alias http://prowlarr:9696'
    );
    assert(
      !defaultTorrServer.baseUrl.includes('torrserver:8090'),
      '4. TorrServer default does not use Docker alias http://torrserver:8090'
    );

    // -------------------------------------------------------------------------
    // Test 5: Explicit PROWLARR_URL environment override
    // -------------------------------------------------------------------------
    process.env.PROWLARR_URL = 'http://custom-prowlarr-host:9696/';
    const customTorznab = new TorznabClient();
    assert(
      customTorznab.prowlarrUrl === 'http://custom-prowlarr-host:9696',
      '5. Explicit PROWLARR_URL override is respected and sanitized (trailing slash stripped)',
      `Got ${customTorznab.prowlarrUrl}`
    );

    // -------------------------------------------------------------------------
    // Test 6: Explicit TORRSERVER_URL environment override
    // -------------------------------------------------------------------------
    process.env.TORRSERVER_URL = 'http://custom-torrserver-host:8090/';
    const customTorrServer = new TorrServerClient();
    assert(
      customTorrServer.baseUrl === 'http://custom-torrserver-host:8090',
      '6. Explicit TORRSERVER_URL override is respected and sanitized (trailing slash stripped)',
      `Got ${customTorrServer.baseUrl}`
    );

    // -------------------------------------------------------------------------
    // Test 7: Stream URL generation uses resolved endpoint
    // -------------------------------------------------------------------------
    const testHash = '0123456789abcdef0123456789abcdef01234567';
    const streamUrl = customTorrServer.getStreamUrl(testHash, 1);
    assert(
      streamUrl === `http://custom-torrserver-host:8090/stream?link=${testHash}&index=1&play=1`,
      '7. Stream URL generated using resolved TorrServer endpoint'
    );

    console.log('\n--- STAGE 10.8 TEST SUMMARY ---');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err: any) {
    console.error('Unhandled error in Stage 10.8 test suite:', err);
    process.exit(1);
  } finally {
    // Restore environment
    if (origProwlarrUrl !== undefined) {
      process.env.PROWLARR_URL = origProwlarrUrl;
    } else {
      delete process.env.PROWLARR_URL;
    }
    if (origTorrServerUrl !== undefined) {
      process.env.TORRSERVER_URL = origTorrServerUrl;
    } else {
      delete process.env.TORRSERVER_URL;
    }
  }
}

runStage10_8EndpointResolutionTests();
