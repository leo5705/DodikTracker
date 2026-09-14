import { db } from '../../../db/index.ts';
import { adminAuditLogs } from '../../../db/schema.ts';

export async function logAdminAction(params: {
  userId: number;
  action: string;
  details: string;
  ip?: string;
}) {
  try {
    await db.insert(adminAuditLogs).values({
      userId: params.userId,
      action: params.action,
      details: params.details,
      ip: params.ip || null,
    });
  } catch (err) {
    console.error('[AdminAudit] Failed to record audit log:', err);
  }
}
