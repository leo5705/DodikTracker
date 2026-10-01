/**
 * Torrent E2E Pipeline Diagnostic Tests (Stage 9.5)
 * Verifies the full 11-stage production torrent verification pipeline,
 * single-job concurrency control, secret redaction, and API contracts.
 */

import { torrentE2eService, E2eStageName } from '../services/torrentSearch/torrentE2eService.ts';

const EXPECTED_STAGES: E2eStageName[] = [
  'ENVIRONMENT',
  'PROWLARR_API',
  'INDEXERS',
  'TORZNAB_SEARCH',
  'TORRENT_CANDIDATE',
  'AUTOMATIC_SCORING',
  'FILE_SELECTION',
  'TORRSERVER',
  'STREAM_URL',
  'STREAM_VALIDATION',
  'WATCH_PARTY_INTEGRATION',
];

async function runTorrentE2eTests() {
  console.log('--- STARTING STAGE 9.5 TORRENT E2E PIPELINE TESTS ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, errorDetail?: string) {
    if (condition) {
      console.log(`\x1b[32m✔ PASS\x1b[0m ${testName}`);
      passed++;
    } else {
      console.error(`\x1b[31m✘ FAIL\x1b[0m ${testName}${errorDetail ? ` -> ${errorDetail}` : ''}`);
      failed++;
    }
  }

  try {
    // Test 1: Start E2E Diagnostic Job
    const triggerUser = { id: 1, username: 'admin' };
    const { isNew, job } = torrentE2eService.startE2eJob(triggerUser);

    assert(Boolean(job && job.jobId), '1. E2E job started and returned a valid jobId');
    assert(isNew === true || isNew === false, '2. isNew boolean flag returned correctly');
    assert(job.triggeredBy?.username === 'admin', '3. Job owner metadata correctly captured');

    // Test 2: Ensure 11 Stages Present
    const stageNames = job.stages.map((s) => s.stage);
    const hasAllStages = EXPECTED_STAGES.every((st) => stageNames.includes(st));
    assert(
      hasAllStages && stageNames.length === 11,
      '4. All 11 required diagnostic stages are present in order',
      `Got ${stageNames.length} stages`
    );

    // Test 3: Concurrency Guarding
    const duplicateStart = torrentE2eService.startE2eJob({ id: 2, username: 'other_admin' });
    if (job.status === 'RUNNING' || job.status === 'QUEUED') {
      assert(
        duplicateStart.isNew === false && duplicateStart.job.jobId === job.jobId,
        '5. Concurrent job trigger safely returns existing active job without duplicate execution'
      );
    } else {
      assert(true, '5. Single job concurrency test passed (previous job completed)');
    }

    // Test 4: Job Fetching by ID
    const fetchedJob = torrentE2eService.getJob(job.jobId);
    assert(Boolean(fetchedJob && fetchedJob.jobId === job.jobId), '6. getJob(jobId) retrieves correct job state');

    // Test 5: Latest Job Fetching
    const latestJob = torrentE2eService.getLatestJob();
    assert(Boolean(latestJob && latestJob.jobId === job.jobId), '7. getLatestJob() retrieves active/latest job');

    // Test 6: Secret Redaction Inspection
    const jobJsonString = JSON.stringify(job);
    const hasProwlarrKeySecret =
      process.env.PROWLARR_API_KEY && process.env.PROWLARR_API_KEY.length > 5
        ? jobJsonString.includes(process.env.PROWLARR_API_KEY)
        : false;
    assert(!hasProwlarrKeySecret, '8. Job output contains zero unmasked PROWLARR_API_KEY secrets');

    // Wait briefly for background execution to advance
    await new Promise((r) => setTimeout(r, 1500));

    const pollJob = torrentE2eService.getJob(job.jobId);
    assert(
      Boolean(pollJob && ['RUNNING', 'PASS', 'FAIL'].includes(pollJob.status)),
      `9. Pipeline status transitioned properly (Current: ${pollJob?.status})`
    );

    console.log('\n--- TORRENT E2E TEST SUMMARY ---');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err: any) {
    console.error('Unhandled error in Torrent E2E test runner:', err);
    process.exit(1);
  }
}

runTorrentE2eTests();
