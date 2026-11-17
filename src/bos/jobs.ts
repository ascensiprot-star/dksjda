import { db } from './core/repository';
import { emitBusinessEvent } from './core/events';
import { audit } from './core/audit';

export interface JobResult {
  job: string;
  processed: number;
  failed: number;
  candidates: number;
  errors: string[];
  ranAt: string;
}

/**
 * Releases stock reservations whose checkout window expired.
 *
 * This is deliberately a real database job, not a timer inside a request. It
 * is safe to run repeatedly: `bos_release_order_stock` is idempotent per order
 * and the business event key is derived from the order id.
 */
export async function releaseExpiredReservations(limit = 500): Promise<JobResult> {
  const ranAt = new Date().toISOString();
  const rows = await db.rows<{ order_id: string; expires_at?: string | null }>(
    db
      .from('stock_reservations')
      .select('order_id, expires_at')
      .eq('status', 'active')
      .lt('expires_at', ranAt)
      .limit(Math.min(5000, Math.max(1, limit)))
  );

  const orderIds = Array.from(new Set(rows.map((row) => row.order_id).filter(Boolean)));
  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const orderId of orderIds) {
    try {
      await db.rpc('bos_release_order_stock', {
        p_order_id: orderId,
        p_reason: 'reservation_expired',
        p_idempotency_key: `reservation-expired:${orderId}`,
      });
      await emitBusinessEvent({
        type: 'inventory.released',
        idempotencyKey: `reservation.expired:${orderId}`,
        actorType: 'system',
        actorEmail: 'system@bos',
        orderId,
        payload: { reason: 'reservation_expired' },
      });
      try {
        await audit({
          actorId: 'system',
          actorEmail: 'system@bos',
          role: 'system',
          action: 'inventory.reservation.expire',
          targetType: 'order',
          targetId: orderId,
          after: { reason: 'reservation_expired' },
          requestId: 'bos-job:reservation-expiry',
        });
      } catch (auditError) {
        // The release succeeded; surface the missing audit trail without
        // pretending the stock operation failed.
        errors.push(
          `${orderId}: released but audit failed: ${(auditError as Error).message}`
        );
      }
      processed += 1;
    } catch (error) {
      failed += 1;
      errors.push(`${orderId}: ${(error as Error).message}`);
    }
  }

  return {
    job: 'release_expired_reservations',
    processed,
    failed,
    candidates: rows.length,
    errors,
    ranAt,
  };
}

/** Runs every idempotent maintenance job that is safe to schedule. */
export async function runBosMaintenance(): Promise<JobResult[]> {
  return [await releaseExpiredReservations()];
}
