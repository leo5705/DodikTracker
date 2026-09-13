import { db } from '../../db/index.ts';
import { directMessages, adminAuditLogs } from '../../db/schema.ts';
import { lte, inArray } from 'drizzle-orm';

// Configuration
const MESSAGE_RETENTION_DAYS = 7;
const CLEANUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // Automatically runs once a week
const BATCH_SIZE = 500; // Batch size to prevent long-running table locks / large transactions

// Concurrency lock to prevent simultaneous execution
let isCleanupRunning = false;

// Statistics and status for observability
export interface CleanupStatus {
  isRunning: boolean;
  lastRunStartTime: string | null;
  lastRunEndTime: string | null;
  lastDurationMs: number | null;
  lastDeletedCount: number;
  lastError: string | null;
  totalRuns: number;
}

const status: CleanupStatus = {
  isRunning: false,
  lastRunStartTime: null,
  lastRunEndTime: null,
  lastDurationMs: null,
  lastDeletedCount: 0,
  lastError: null,
  totalRuns: 0,
};

export function getCleanupStatus(): CleanupStatus {
  return { ...status };
}

/**
 * Starts the weekly automated message cleanup scheduler.
 */
export function startMessageCleanupCron() {
  console.log('[Message Cleanup Worker] Initializing weekly cleanup scheduler...');
  console.log(`[Message Cleanup Worker] Retention policy: ${MESSAGE_RETENTION_DAYS} days. Schedule: every 7 days.`);

  // Run initial cleanup after a short startup delay (10s)
  setTimeout(() => {
    runMessageCleanupJob().catch((err) => {
      console.error('[Message Cleanup Worker] Initial cleanup execution failed:', err);
    });
  }, 10000);

  // Run every 7 days (weekly)
  setInterval(() => {
    runMessageCleanupJob().catch((err) => {
      console.error('[Message Cleanup Worker] Scheduled weekly cleanup execution failed:', err);
    });
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Executes the cleanup job in batches with mutex lock, logging, and performance metrics.
 */
export async function runMessageCleanupJob(): Promise<{ deletedCount: number; durationMs: number }> {
  // Mutex lock check
  if (isCleanupRunning) {
    console.warn('[Message Cleanup Worker] Job is already running. Skipping concurrent invocation.');
    return { deletedCount: 0, durationMs: 0 };
  }

  isCleanupRunning = true;
  status.isRunning = true;
  const startTime = new Date();
  status.lastRunStartTime = startTime.toISOString();
  status.lastError = null;

  console.log(`[Message Cleanup Worker] === Starting message cleanup at ${startTime.toISOString()} ===`);
  console.log(`[Message Cleanup Worker] Finding direct messages older than ${MESSAGE_RETENTION_DAYS} days...`);

  let totalDeleted = 0;
  let batchIndex = 0;

  try {
    const cutoffDate = new Date(startTime.getTime() - MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    console.log(`[Message Cleanup Worker] Cutoff timestamp: ${cutoffDate.toISOString()}`);

    while (true) {
      batchIndex++;

      // 1. Fetch batch of message IDs older than cutoffDate
      const oldMessagesBatch = await db
        .select({ id: directMessages.id })
        .from(directMessages)
        .where(lte(directMessages.createdAt, cutoffDate))
        .limit(BATCH_SIZE);

      if (oldMessagesBatch.length === 0) {
        if (batchIndex === 1) {
          console.log('[Message Cleanup Worker] No messages older than 7 days found to delete.');
        }
        break;
      }

      const batchIds = oldMessagesBatch.map((m) => m.id);

      // 2. Delete batch of messages (PostgreSQL foreign keys on related tables cascade automatically if any)
      const deletedRows = await db
        .delete(directMessages)
        .where(inArray(directMessages.id, batchIds))
        .returning({ id: directMessages.id });

      totalDeleted += deletedRows.length;
      console.log(`[Message Cleanup Worker] Batch #${batchIndex}: deleted ${deletedRows.length} messages (Total so far: ${totalDeleted})`);

      // If batch was smaller than BATCH_SIZE, no more records remain
      if (oldMessagesBatch.length < BATCH_SIZE) {
        break;
      }

      // Small pause between batches to prevent starving database connections
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    status.lastRunEndTime = endTime.toISOString();
    status.lastDurationMs = durationMs;
    status.lastDeletedCount = totalDeleted;
    status.totalRuns++;

    console.log(`[Message Cleanup Worker] === Cleanup completed successfully ===`);
    console.log(`[Message Cleanup Worker] Start Time: ${startTime.toISOString()}`);
    console.log(`[Message Cleanup Worker] End Time: ${endTime.toISOString()}`);
    console.log(`[Message Cleanup Worker] Duration: ${durationMs}ms`);
    console.log(`[Message Cleanup Worker] Total Messages Deleted: ${totalDeleted}`);
    console.log(`[Message Cleanup Worker] =============================================`);

    // Record in system audit logs for administrative visibility
    try {
      await db.insert(adminAuditLogs).values({
        userId: null,
        action: 'MESSAGES_WEEKLY_CLEANUP',
        details: JSON.stringify({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          durationMs,
          deletedCount: totalDeleted,
          retentionDays: MESSAGE_RETENTION_DAYS,
        }),
        ip: '127.0.0.1 (system-worker)',
        createdAt: endTime,
      });
    } catch (auditErr) {
      console.warn('[Message Cleanup Worker] Failed to write audit log entry:', auditErr);
    }

    return { deletedCount: totalDeleted, durationMs };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    status.lastRunEndTime = endTime.toISOString();
    status.lastDurationMs = durationMs;
    status.lastError = errorMsg;

    console.error(`[Message Cleanup Worker] ERROR occurred during message cleanup after ${durationMs}ms:`, error);
    throw error;
  } finally {
    isCleanupRunning = false;
    status.isRunning = false;
  }
}
