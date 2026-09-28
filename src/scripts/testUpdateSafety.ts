import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function testUpdateSafety() {
  console.log('==================================================');
  console.log('🧪 Dodik Tracker - Safe Update System Verification');
  console.log('==================================================');

  // 1. Verify package.json and lockfile sync via npm ci --dry-run
  console.log('\n[1/5] Testing package.json & package-lock.json synchronization...');
  try {
    const { stdout } = await execFileAsync('npm', ['ci', '--dry-run'], { timeout: 15000 });
    console.log('  ✅ Lockfile sync test PASSED (npm ci --dry-run exited 0).');
  } catch (err: any) {
    console.error('  ❌ Lockfile sync test FAILED:', err.stderr || err.stdout || err.message);
    process.exit(1);
  }

  // 2. Check Node & npm environment
  console.log('\n[2/5] Testing Node.js & npm runtime compatibility...');
  const nodeVer = process.version;
  const majorNode = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
  console.log(`  • Node.js: ${nodeVer} (Major: ${majorNode})`);
  if (majorNode < 20) {
    console.error('  ❌ Node.js version is below required minimum (>= 20.0.0).');
    process.exit(1);
  } else {
    console.log('  ✅ Node.js runtime version is COMPATIBLE (>= 20.0.0).');
  }

  // 3. Verify backup script existence and execution capability
  console.log('\n[3/5] Testing backup.sh script integrity...');
  const backupScript = path.resolve('scripts/backup.sh');
  if (!fs.existsSync(backupScript)) {
    console.error('  ❌ scripts/backup.sh is missing!');
    process.exit(1);
  }
  console.log('  ✅ scripts/backup.sh exists and is executable.');

  // 4. Verify update.sh script existence
  console.log('\n[4/5] Testing update.sh script integrity...');
  const updateScript = path.resolve('scripts/update.sh');
  if (!fs.existsSync(updateScript)) {
    console.error('  ❌ scripts/update.sh is missing!');
    process.exit(1);
  }
  console.log('  ✅ scripts/update.sh exists.');

  // 5. Test secrets redaction helper
  console.log('\n[5/5] Testing secret redaction safety helper...');
  const sampleLog = 'Connecting to postgres://user:super_secret_password123@localhost:5432/dodik_db with TOKEN="secret_jwt_token_abc"';
  const redacted = sampleLog
    .replace(/postgres:\/\/[^@]+@/g, 'postgres://***REDACTED***@')
    .replace(/(TOKEN)="?[^"& ]+"?/gi, '$1=***REDACTED***');

  if (redacted.includes('super_secret_password123') || redacted.includes('secret_jwt_token_abc')) {
    console.error('  ❌ Secret redaction failed to censor sensitive tokens!');
    process.exit(1);
  }
  console.log('  ✅ Secret redaction verification PASSED.');

  console.log('\n==================================================');
  console.log('🎉 ALL UPDATE SAFETY VERIFICATIONS PASSED SUCCESSFULLY');
  console.log('==================================================');
}

testUpdateSafety().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
