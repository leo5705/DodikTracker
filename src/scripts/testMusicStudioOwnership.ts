import { runMusicStudioOwnershipTests } from '../server/tests/musicStudioOwnership.ts';
import { pool } from '../db/index.ts';

async function main() {
  console.log('Running Music Studio Releases Ownership & Privacy Tests...');
  try {
    const report = await runMusicStudioOwnershipTests();
    console.log(`\n========================================`);
    console.log(`TEST SUMMARY: Total=${report.total}, Passed=${report.passed}, Failed=${report.failed}`);
    console.log(`========================================\n`);

    report.results.forEach((r, idx) => {
      console.log(`[${idx + 1}] ${r.passed ? 'PASSED ✅' : 'FAILED ❌'} - ${r.name}`);
      if (!r.passed && r.error) {
        console.log(`    Error: ${r.error}`);
      }
    });

    if (report.failed > 0) {
      console.error('\nSome tests failed!');
      process.exit(1);
    } else {
      console.log('\nAll Music Studio ownership tests passed successfully! 🎉');
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal error running tests:', err);
    process.exit(1);
  } finally {
    try {
      await pool.end();
    } catch {}
  }
}

main();
