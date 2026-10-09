import type { Request } from 'express';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../utils/logger';

export interface AuditEntry {
  action: string;
  userId?: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}

/** Enregistre une trace d'audit. Ne doit jamais faire échouer l'opération métier. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      action: entry.action,
      userId: entry.userId,
      entity: entry.entity,
      entityId: entry.entityId,
      metadata: entry.metadata,
      ip: entry.req?.ip,
    });
  } catch (err) {
    logger.error('Échec écriture audit', { action: entry.action, error: String(err) });
  }
}
