import { db } from './repository';
import { bosId } from './ids';
import { badRequest } from './errors';

export const BUSINESS_EVENT_TYPES = [
  'product.impression',
  'product.viewed',
  'product.clicked',
  'cart.item_added',
  'cart.item_removed',
  'checkout.started',
  'checkout.completed',
  'customer.registered',
  'customer.updated',
  'order.created',
  'order.status_changed',
  'order.cancelled',
  'payment.pending',
  'payment.completed',
  'payment.failed',
  'shipment.dispatched',
  'shipment.delivered',
  'return.requested',
  'return.approved',
  'return.received',
  'refund.issued',
  'inventory.stock_changed',
  'inventory.reserved',
  'inventory.released',
  'review.submitted',
  'loyalty.points_earned',
  'loyalty.points_redeemed',
] as const;

export type BusinessEventType = (typeof BUSINESS_EVENT_TYPES)[number];

export const EVENT_SCHEMA_VERSION = 1;

export interface BusinessEventInput {
  type: BusinessEventType;
  idempotencyKey?: string;
  occurredAt?: string;
  actorType?: 'customer' | 'admin' | 'system' | 'integration' | 'anonymous';
  actorId?: string;
  actorEmail?: string;
  customerId?: string;
  anonymousId?: string;
  sessionId?: string;
  productId?: string;
  variantId?: string;
  sku?: string;
  orderId?: string;
  paymentId?: string;
  returnId?: string;
  channel?: string;
  campaignId?: string;
  currency?: string;
  amountMinor?: number;
  correlationId?: string;
  consentBasis?: string;
  payload?: Record<string, unknown>;
}

export interface BusinessEventRow extends BusinessEventInput {
  id: string;
  schemaVersion: number;
  occurredAt: string;
  recordedAt: string;
}

function assertEventType(type: string): BusinessEventType {
  if (!BUSINESS_EVENT_TYPES.includes(type as BusinessEventType)) {
    throw badRequest(`Unknown business event type: ${type}.`);
  }
  return type as BusinessEventType;
}

/**
 * Appends a canonical business event.
 *
 * Idempotency is enforced by the unique `idempotency_key`. A replay returns the
 * original event rather than writing a second fact.
 */
export async function emitBusinessEvent(input: BusinessEventInput): Promise<BusinessEventRow> {
  const type = assertEventType(input.type);
  const id = bosId('evt');

  if (input.idempotencyKey) {
    const existing = await db.one<BusinessEventRow>(
      db.from('business_events').select('*').eq('idempotency_key', input.idempotencyKey).maybeSingle()
    );
    if (existing) return existing;
  }

  const row = {
    id,
    type,
    schema_version: EVENT_SCHEMA_VERSION,
    occurred_at: input.occurredAt || new Date().toISOString(),
    actor_type: input.actorType || 'system',
    actor_id: input.actorId ?? null,
    actor_email: input.actorEmail ?? null,
    customer_id: input.customerId ?? null,
    anonymous_id: input.anonymousId ?? null,
    session_id: input.sessionId ?? null,
    product_id: input.productId ?? null,
    variant_id: input.variantId ?? null,
    sku: input.sku ?? null,
    order_id: input.orderId ?? null,
    payment_id: input.paymentId ?? null,
    return_id: input.returnId ?? null,
    channel: input.channel || 'website',
    campaign_id: input.campaignId ?? null,
    currency: input.currency ?? 'EUR',
    amount_minor: input.amountMinor ?? null,
    idempotency_key: input.idempotencyKey ?? null,
    correlation_id: input.correlationId ?? null,
    consent_basis: input.consentBasis ?? null,
    payload: input.payload || {},
  };

  const inserted = await db.write<BusinessEventRow>(
    db.from('business_events').insert(row).select('*').single()
  );
  if (inserted) return inserted;

  if (input.idempotencyKey) {
    const replay = await db.one<BusinessEventRow>(
      db.from('business_events').select('*').eq('idempotency_key', input.idempotencyKey).maybeSingle()
    );
    if (replay) return replay;
  }
  throw new Error('Business event insert returned no row.');
}

/**
 * Records an analytical exposure event in the legacy `events` table.
 * Separated from business events on purpose: analytics volume must never
 * pollute the transactional event log.
 */
export async function emitAnalyticsEvent(input: {
  type: string;
  visitorId: string;
  sessionId: string;
  page?: string;
  productId?: string;
  channel?: string;
  utm?: Record<string, string>;
  payload?: Record<string, unknown>;
  timestamp?: number;
}): Promise<void> {
  if (!input.visitorId || !input.sessionId) {
    throw badRequest('Analytics events require visitorId and sessionId.');
  }
  const row = {
    id: bosId('evt'),
    type: input.type,
    timestamp: input.timestamp ?? Date.now(),
    visitorId: input.visitorId,
    sessionId: input.sessionId,
    page: input.page || '/',
    deviceClass: 'desktop',
    viewport: '0x0',
    language: 'fi-FI',
    referrer: '',
    utm: input.utm || {},
    payload: { ...(input.payload || {}), ...(input.productId ? { productId: input.productId } : {}) },
    data: {},
    details: input.channel ? { channel: input.channel } : {},
  };
  const { error } = await db.from('events').insert(row);
  if (error) {
    // Analytics must never block a commerce write.
    console.warn('[bos] analytics event dropped:', error.message);
  }
}
