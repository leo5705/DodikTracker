import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import { pool } from '../db/index.ts';

export interface FileInfo {
  filename: string;
  relativePath: string; // e.g. 'audio/track.mp3' or 'covers/cover.jpg'
  fullPath: string;
  category: 'audio' | 'covers' | 'other';
  sizeBytes: number;
  mtime: string;
  sha256: string;
}

export interface DbReference {
  table: string;
  column: string;
  recordId: string | number;
  url: string;
  relativePath: string;
  existsOnDisk: boolean;
  fileInfo?: FileInfo;
}

export interface UploadVerificationReport {
  timestamp: string;
  uploadsRoot: string;
  audioDir: string;
  coversDir: string;
  summary: {
    totalPhysicalFiles: number;
    audioFilesCount: number;
    coversFilesCount: number;
    totalSizeBytes: number;
    totalSizeHuman: string;
    totalDbReferences: number;
    validDbReferencesCount: number;
    brokenDbReferencesCount: number;
    orphanFilesCount: number;
    httpCheckPassed?: boolean;
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  };
  physicalFiles: FileInfo[];
  brokenReferences: DbReference[];
  orphanFiles: FileInfo[];
  validReferences: DbReference[];
  httpChecks?: {
    url: string;
    status: number;
    ok: boolean;
  }[];
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function calculateSha256(filePath: string): string {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    return hash.digest('hex');
  } catch {
    return 'unknown';
  }
}

export async function verifyUploadsAndDatabase(options: {
  checkHttp?: boolean;
  httpBaseUrl?: string;
} = {}): Promise<UploadVerificationReport> {
  const uploadsRoot = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(process.cwd(), 'public', 'uploads');

  const audioDir = path.join(uploadsRoot, 'audio');
  const coversDir = path.join(uploadsRoot, 'covers');

  // Ensure directories exist
  [uploadsRoot, audioDir, coversDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // 1. Scan physical filesystem files
  const physicalFiles: FileInfo[] = [];

  const scanDir = (dir: string, category: 'audio' | 'covers') => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === '.gitkeep' || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        const relPath = `${category}/${entry.name}`;
        physicalFiles.push({
          filename: entry.name,
          relativePath: relPath,
          fullPath,
          category,
          sizeBytes: stat.size,
          mtime: stat.mtime.toISOString(),
          sha256: calculateSha256(fullPath),
        });
      }
    }
  };

  scanDir(audioDir, 'audio');
  scanDir(coversDir, 'covers');

  const physicalMap = new Map<string, FileInfo>();
  physicalFiles.forEach((f) => {
    physicalMap.set(f.relativePath, f);
    // Also index with leading slash e.g. /uploads/audio/xxx
    physicalMap.set(`/uploads/${f.relativePath}`, f);
    physicalMap.set(`uploads/${f.relativePath}`, f);
  });

  // 2. Query Database references
  const dbReferences: DbReference[] = [];
  let dbAvailable = false;

  try {
    const client = await pool.connect();
    dbAvailable = true;

    try {
      // Check tables and extract upload URLs
      const queries = [
        {
          table: 'music_tracks',
          idCol: 'id',
          urlCol: 'audio_file',
          sql: `SELECT id, audio_file AS url FROM music_tracks WHERE audio_file IS NOT NULL AND audio_file != ''`,
        },
        {
          table: 'music_releases',
          idCol: 'id',
          urlCol: 'cover',
          sql: `SELECT id, cover AS url FROM music_releases WHERE cover IS NOT NULL AND cover != ''`,
        },
        {
          table: 'artist_profiles',
          idCol: 'id',
          urlCol: 'avatar',
          sql: `SELECT id, avatar AS url FROM artist_profiles WHERE avatar IS NOT NULL AND avatar != ''`,
        },
        {
          table: 'users',
          idCol: 'id',
          urlCol: 'avatar',
          sql: `SELECT id, avatar AS url FROM users WHERE avatar IS NOT NULL AND avatar != ''`,
        },
        {
          table: 'news',
          idCol: 'id',
          urlCol: 'cover',
          sql: `SELECT id, cover AS url FROM news WHERE cover IS NOT NULL AND cover != ''`,
        },
        {
          table: 'lists',
          idCol: 'id',
          urlCol: 'cover',
          sql: `SELECT id, cover AS url FROM lists WHERE cover IS NOT NULL AND cover != ''`,
        },
      ];

      for (const q of queries) {
        try {
          const { rows } = await client.query(q.sql);
          for (const row of rows) {
            const rawUrl = String(row.url).trim();
            // Only examine local uploads
            if (rawUrl.startsWith('/uploads/') || rawUrl.startsWith('uploads/')) {
              const relPath = rawUrl.replace(/^\/?uploads\//, '');
              const fileObj = physicalMap.get(relPath);
              const exists = !!fileObj;

              dbReferences.push({
                table: q.table,
                column: q.urlCol,
                recordId: row.id,
                url: rawUrl,
                relativePath: relPath,
                existsOnDisk: exists,
                fileInfo: fileObj,
              });
            }
          }
        } catch {
          // Table might not exist yet or empty
        }
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.warn('[VerifyUploads] Database connection note:', err.message);
  }

  // 3. Classify Broken references vs Valid references vs Orphan files
  const referencedPaths = new Set<string>();
  const brokenReferences: DbReference[] = [];
  const validReferences: DbReference[] = [];

  for (const ref of dbReferences) {
    referencedPaths.add(ref.relativePath);
    if (ref.existsOnDisk) {
      validReferences.push(ref);
    } else {
      brokenReferences.push(ref);
    }
  }

  const orphanFiles: FileInfo[] = [];
  for (const file of physicalFiles) {
    if (!referencedPaths.has(file.relativePath)) {
      orphanFiles.push(file);
    }
  }

  // 4. Optional HTTP 200 Verification
  let httpChecksResult: { url: string; status: number; ok: boolean }[] | undefined;
  let allHttpOk = true;

  if (options.checkHttp && validReferences.length > 0) {
    const baseUrl = options.httpBaseUrl || 'http://localhost:3000';
    httpChecksResult = [];

    // Test a sample of up to 10 existing files
    const sample = validReferences.slice(0, 10);
    for (const item of sample) {
      const targetUrl = `${baseUrl}${item.url.startsWith('/') ? '' : '/'}${item.url}`;
      try {
        const statusCode = await new Promise<number>((resolve) => {
          const req = http.get(targetUrl, { timeout: 3000 }, (res) => {
            resolve(res.statusCode || 0);
            res.resume();
          });
          req.on('error', () => resolve(0));
          req.on('timeout', () => {
            req.destroy();
            resolve(0);
          });
        });

        const ok = statusCode >= 200 && statusCode < 400;
        if (!ok) allHttpOk = false;
        httpChecksResult.push({
          url: item.url,
          status: statusCode,
          ok,
        });
      } catch {
        allHttpOk = false;
        httpChecksResult.push({
          url: item.url,
          status: 0,
          ok: false,
        });
      }
    }
  }

  const totalBytes = physicalFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
  const audioCount = physicalFiles.filter((f) => f.category === 'audio').length;
  const coversCount = physicalFiles.filter((f) => f.category === 'covers').length;

  let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
  if (brokenReferences.length > 0) {
    status = 'CRITICAL';
  } else if (!dbAvailable || (options.checkHttp && !allHttpOk)) {
    status = 'WARNING';
  }

  return {
    timestamp: new Date().toISOString(),
    uploadsRoot,
    audioDir,
    coversDir,
    summary: {
      totalPhysicalFiles: physicalFiles.length,
      audioFilesCount: audioCount,
      coversFilesCount: coversCount,
      totalSizeBytes: totalBytes,
      totalSizeHuman: formatBytes(totalBytes),
      totalDbReferences: dbReferences.length,
      validDbReferencesCount: validReferences.length,
      brokenDbReferencesCount: brokenReferences.length,
      orphanFilesCount: orphanFiles.length,
      httpCheckPassed: options.checkHttp ? allHttpOk : undefined,
      status,
    },
    physicalFiles,
    brokenReferences,
    orphanFiles,
    validReferences,
    httpChecks: httpChecksResult,
  };
}

// CLI Execution Support
if (process.argv[1] && (process.argv[1].endsWith('verifyUploads.ts') || process.argv[1].endsWith('verifyUploads.js'))) {
  const isJson = process.argv.includes('--json');
  const checkHttp = process.argv.includes('--http');
  const failOnBroken = process.argv.includes('--fail-on-broken');

  verifyUploadsAndDatabase({ checkHttp })
    .then((report) => {
      if (isJson) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log('================================================================================');
        console.log('  Dodik Tracker - Uploads & Database Cross-Verification Diagnostic');
        console.log(`  Location:  ${report.uploadsRoot}`);
        console.log(`  Timestamp: ${report.timestamp}`);
        console.log('================================================================================');
        console.log(`  Physical Audio Files:  ${report.summary.audioFilesCount}`);
        console.log(`  Physical Cover Files:  ${report.summary.coversFilesCount}`);
        console.log(`  Total Uploads Size:    ${report.summary.totalSizeHuman} (${report.summary.totalSizeBytes} bytes)`);
        console.log('--------------------------------------------------------------------------------');
        console.log(`  Database References:   ${report.summary.totalDbReferences}`);
        console.log(`  Valid Matched Files:   ${report.summary.validDbReferencesCount}`);
        console.log(`  Broken DB References:  ${report.summary.brokenDbReferencesCount}`);
        console.log(`  Orphan Files (on disk): ${report.summary.orphanFilesCount} (informational report - NEVER deleted)`);

        if (report.summary.brokenDbReferencesCount > 0) {
          console.log('\n❌ BROKEN DB REFERENCES (files missing on disk):');
          report.brokenReferences.forEach((b) => {
            console.log(`   • [Table: ${b.table}, ID: ${b.recordId}] -> URL: ${b.url}`);
          });
        }

        if (report.summary.orphanFilesCount > 0) {
          console.log(`\nℹ️  ORPHAN FILES ON DISK (${report.summary.orphanFilesCount} files):`);
          report.orphanFiles.slice(0, 5).forEach((o) => {
            console.log(`   • ${o.relativePath} (${formatBytes(o.sizeBytes)})`);
          });
          if (report.summary.orphanFilesCount > 5) {
            console.log(`   ... and ${report.summary.orphanFilesCount - 5} more files`);
          }
        }

        if (report.httpChecks && report.httpChecks.length > 0) {
          console.log('\n🌐 HTTP ACCESSIBILITY CHECK:');
          report.httpChecks.forEach((h) => {
            console.log(`   • ${h.url} -> HTTP ${h.status} [${h.ok ? 'OK' : 'FAIL'}]`);
          });
        }

        console.log('================================================================================');
        console.log(`  DIAGNOSTIC STATUS: ${report.summary.status}`);
        console.log('================================================================================');
      }

      if (failOnBroken && report.summary.brokenDbReferencesCount > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('[VerifyUploads] Fatal error:', err);
      process.exit(1);
    });
}
