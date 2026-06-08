import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  target: string;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        target: entry.target,
        before: entry.before === undefined ? undefined : (entry.before as any),
        after: entry.after === undefined ? undefined : (entry.after as any),
      },
    });
  } catch (err) {
    logger.error({ err, entry }, 'failed to write audit log');
  }
}
