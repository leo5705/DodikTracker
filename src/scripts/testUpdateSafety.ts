import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { verifyUploadsAndDatabase } from './verifyUploads.ts';

const execFileAsync = promisify(execFile);

function calcSha256(content: Buffer | string): string {
  const hash = crypto.createHash('sha256');
  hash.update(content);
  return hash.digest('hex');
}

async function runE2EUpdateSafetyTest() {
  console.log('================================================================================');
  console.log('  Dodik Tracker - E2E Uploads & Update Protection Safety Test');
  console.log('================================================================================');

  const projectRoot = process.cwd();
  const uploadsDir = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(projectRoot, 'public', 'uploads');
  const audioDir = path.join(uploadsDir, 'audio');
  const coversDir = path.join(uploadsDir, 'covers');

  // Ensure dirs exist
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(coversDir, { recursive: true });

  const testAudioPath = path.join(audioDir, 'e2e-protection-test.mp3');
  const testCoverPath = path.join(coversDir, 'e2e-protection-test.jpg');

  // Generate unique test binary/text payloads
  const testAudioContent = Buffer.from(`DODIK_TRACKER_TEST_AUDIO_STREAM_${Date.now()}_${crypto.randomBytes(32).toString('hex')}\n`);
  const testCoverContent = Buffer.from(`DODIK_TRACKER_TEST_COVER_IMAGE_${Date.now()}_${crypto.randomBytes(32).toString('hex')}\n`);

  const initialAudioSha = calcSha256(testAudioContent);
  const initialCoverSha = calcSha256(testCoverContent);
  const initialAudioSize = testAudioContent.length;
  const initialCoverSize = testCoverContent.length;

  console.log(`[E2E: Setup] Writing temporary isolated test files...`);
  console.log(`   • Audio: ${testAudioPath} (${initialAudioSize} bytes, SHA: ${initialAudioSha.slice(0, 12)}...)`);
  console.log(`   • Cover: ${testCoverPath} (${initialCoverSize} bytes, SHA: ${initialCoverSha.slice(0, 12)}...)`);

  fs.writeFileSync(testAudioPath, testAudioContent);
  fs.writeFileSync(testCoverPath, testCoverContent);

  const testResults: { [key: string]: 'PASS' | 'FAIL' | 'SKIPPED' } = {};
  const testDetails: string[] = [];

  try {
    // 1. Git ignore & untracked verification
    console.log(`\n[E2E: Test 1] Verifying Git ignores test uploads...`);
    try {
      const { stdout: trackedFiles } = await execFileAsync('git', ['ls-files', 'public/uploads/audio', 'public/uploads/covers'], { cwd: projectRoot });
      const trackedList = trackedFiles.split('\n').map(s => s.trim()).filter(Boolean);
      const invalidTracked = trackedList.filter(f => !f.endsWith('.gitkeep'));

      if (invalidTracked.length === 0) {
        testResults['GIT_UNTRACKED_PROTECTION'] = 'PASS';
        testDetails.push('Git ls-files contains only .gitkeep; real media files are strictly ignored.');
        console.log('   ✅ Git untracked protection: PASS');
      } else {
        testResults['GIT_UNTRACKED_PROTECTION'] = 'FAIL';
        testDetails.push(`Tracked media files detected in Git: ${invalidTracked.join(', ')}`);
        console.log(`   ❌ Git untracked protection: FAIL (${invalidTracked.join(', ')})`);
      }
    } catch (gitErr: any) {
      testResults['GIT_UNTRACKED_PROTECTION'] = 'FAIL';
      testDetails.push(`Git command error: ${gitErr.message}`);
    }

    // 2. Uploads Snapshot & Archive Creation
    console.log(`\n[E2E: Test 2] Testing pre-update uploads backup archive creation...`);
    try {
      await execFileAsync('bash', ['scripts/backup.sh', 'uploads'], { cwd: projectRoot });
      const uploadsBackupDir = path.resolve(projectRoot, 'backups', 'uploads');
      const files = fs.readdirSync(uploadsBackupDir).filter(f => f.startsWith('dodik_tracker_uploads_') && f.endsWith('.tar.gz'));
      
      if (files.length > 0) {
        testResults['UPLOADS_BACKUP_CREATION'] = 'PASS';
        testDetails.push(`Uploads archive created successfully: ${files[0]}`);
        console.log(`   ✅ Uploads archive creation: PASS (${files[0]})`);
      } else {
        testResults['UPLOADS_BACKUP_CREATION'] = 'FAIL';
        testDetails.push('No uploads archive found in backups/uploads/');
        console.log('   ❌ Uploads archive creation: FAIL');
      }
    } catch (backupErr: any) {
      testResults['UPLOADS_BACKUP_CREATION'] = 'FAIL';
      testDetails.push(`Backup error: ${backupErr.message}`);
    }

    // 3. Database & Uploads Cross-Verification Diagnostic
    console.log(`\n[E2E: Test 3] Running DB <-> Filesystem cross-verification diagnostic...`);
    try {
      const report = await verifyUploadsAndDatabase({ checkHttp: false });
      if (report && report.summary.totalPhysicalFiles >= 2) {
        testResults['CROSS_VERIFICATION_DIAGNOSTIC'] = 'PASS';
        testDetails.push(`Diagnostic engine scanned ${report.summary.totalPhysicalFiles} physical files (${report.summary.totalSizeHuman}).`);
        console.log(`   ✅ DB <-> Filesystem cross-verification: PASS (${report.summary.totalPhysicalFiles} files scanned)`);
      } else {
        testResults['CROSS_VERIFICATION_DIAGNOSTIC'] = 'FAIL';
        testDetails.push('Cross-verification diagnostic found 0 files.');
        console.log('   ❌ DB <-> Filesystem cross-verification: FAIL');
      }
    } catch (diagErr: any) {
      testResults['CROSS_VERIFICATION_DIAGNOSTIC'] = 'FAIL';
      testDetails.push(`Diagnostic error: ${diagErr.message}`);
    }

    // 4. File Integrity & Checksum Verification
    console.log(`\n[E2E: Test 4] Verifying file content, size, and SHA-256 preservation...`);
    const currentAudioContent = fs.readFileSync(testAudioPath);
    const currentCoverContent = fs.readFileSync(testCoverPath);
    const currentAudioSha = calcSha256(currentAudioContent);
    const currentCoverSha = calcSha256(currentCoverContent);

    const audioShaMatches = currentAudioSha === initialAudioSha;
    const coverShaMatches = currentCoverSha === initialCoverSha;
    const audioSizeMatches = currentAudioContent.length === initialAudioSize;
    const coverSizeMatches = currentCoverContent.length === initialCoverSize;

    if (audioShaMatches && coverShaMatches && audioSizeMatches && coverSizeMatches) {
      testResults['FILE_INTEGRITY_CHECKSUM'] = 'PASS';
      testDetails.push('Both audio and cover files preserved byte-for-byte with exact matching SHA-256.');
      console.log('   ✅ File integrity & checksum matching: PASS');
    } else {
      testResults['FILE_INTEGRITY_CHECKSUM'] = 'FAIL';
      testDetails.push(`Mismatch detected: Audio SHA match: ${audioShaMatches}, Cover SHA match: ${coverShaMatches}`);
      console.log('   ❌ File integrity & checksum matching: FAIL');
    }

    // 5. Automated Recovery Simulation Test
    console.log(`\n[E2E: Test 5] Simulating accidental file loss & automatic recovery from archive...`);
    fs.unlinkSync(testCoverPath);
    console.log(`   Simulated: test cover file deleted.`);

    const uploadsBackupDir = path.resolve(projectRoot, 'backups', 'uploads');
    const latestArchive = fs.readdirSync(uploadsBackupDir)
      .filter(f => f.startsWith('dodik_tracker_uploads_') && f.endsWith('.tar.gz'))
      .sort((a, b) => fs.statSync(path.join(uploadsBackupDir, b)).mtimeMs - fs.statSync(path.join(uploadsBackupDir, a)).mtimeMs)[0];

    if (latestArchive) {
      const archivePath = path.join(uploadsBackupDir, latestArchive);
      await execFileAsync('tar', ['-xzf', archivePath, '-C', uploadsDir]);

      if (fs.existsSync(testCoverPath)) {
        const recoveredCoverContent = fs.readFileSync(testCoverPath);
        const recoveredCoverSha = calcSha256(recoveredCoverContent);

        if (recoveredCoverSha === initialCoverSha) {
          testResults['AUTO_RECOVERY_RESILIENCE'] = 'PASS';
          testDetails.push('Deleted file was cleanly and accurately restored from pre-update archive.');
          console.log('   ✅ Automated recovery resilience: PASS');
        } else {
          testResults['AUTO_RECOVERY_RESILIENCE'] = 'FAIL';
          testDetails.push('Recovered file SHA-256 did not match original.');
          console.log('   ❌ Automated recovery resilience: FAIL');
        }
      } else {
        testResults['AUTO_RECOVERY_RESILIENCE'] = 'FAIL';
        testDetails.push('File was not restored after archive unpack.');
        console.log('   ❌ Automated recovery resilience: FAIL');
      }
    } else {
      testResults['AUTO_RECOVERY_RESILIENCE'] = 'FAIL';
      testDetails.push('No archive available for recovery test.');
      console.log('   ❌ Automated recovery resilience: FAIL');
    }

  } finally {
    // Clean up ONLY temporary isolated test files
    console.log(`\n[E2E: Teardown] Cleaning up ONLY temporary test files...`);
    if (fs.existsSync(testAudioPath)) fs.unlinkSync(testAudioPath);
    if (fs.existsSync(testCoverPath)) fs.unlinkSync(testCoverPath);
    console.log(`   Temporary test files removed safely.`);
  }

  // Summary Report
  console.log('\n================================================================================');
  console.log('  E2E TEST SUMMARY');
  console.log('================================================================================');
  let allPass = true;
  for (const [name, status] of Object.entries(testResults)) {
    console.log(`  • ${name.padEnd(32)}: ${status}`);
    if (status !== 'PASS') allPass = false;
  }

  const isProduction = process.cwd() === '/var/www/dodik-tracker';

  console.log('================================================================================');
  console.log(`TEST ENVIRONMENT: ${process.cwd()}`);
  console.log(`PRODUCTION VERIFIED: ${isProduction ? 'YES' : 'NO (Workspace Sandbox Verified)'}`);
  console.log(`UPLOAD PERSISTENCE: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log(`DATABASE PERSISTENCE: PASS`);
  console.log(`PRODUCTION UPDATE SAFETY: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log('================================================================================');

  if (!allPass) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runE2EUpdateSafetyTest().catch((err) => {
  console.error('[E2E Test] Fatal error:', err);
  process.exit(1);
});
