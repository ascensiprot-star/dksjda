import { appendControlAudit } from '../../controlPlane/operations';
import { stableHash } from './ids';

/**
 * Commerce audit goes through the existing hash-chained control-plane trail.
 * One chain for every privileged mutation; no second, weaker log.
 */
export interface AuditInput {
  actorId?: string;
  actorEmail: string;
  role?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
  approvalId?: string;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await appendControlAudit({
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      role: input.role,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      before: input.before,
      after: input.after,
      requestId: input.requestId,
      approvalId: input.approvalId,
    });
  } catch (error) {
    // A privileged mutation must not silently succeed without a trail. The
    // caller receives the failure and can retry; the database write may need
    // an explicit compensating action.
    throw new Error(`Audit append failed: ${(error as Error).message}`);
  }
}

/** Stores a hash of the input instead of raw PII for high-volume read actions. */
export function auditInputHash(input: unknown): string {
  return stableHash(input).slice(0, 32);
}
