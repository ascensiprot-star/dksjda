import { conflict, badRequest } from './errors';

/**
 * Canonical order lifecycle. The legacy screen uses the same status words, so
 * no translation layer is needed between the API and the existing UI.
 *
 *   new ──► paid ──► packed ──► shipped ──► delivered ──► refunded
 *    │       │         │
 *    └───────┴─────────┴──► cancelled
 *
 * A refund after delivery is a return outcome, not a cancellation.
 */
export const ORDER_STATUSES = [
  'new',
  'paid',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  new: ['paid', 'cancelled'],
  paid: ['packed', 'cancelled', 'refunded'],
  packed: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return ORDER_STATUSES.includes(String(value) as OrderStatus);
}

export function canTransition(from: string, to: string): boolean {
  if (!isOrderStatus(from) || !isOrderStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: string, to: string): void {
  if (!isOrderStatus(from) || !isOrderStatus(to)) {
    throw badRequest(`Unknown order status transition: ${from} → ${to}.`);
  }
  if (!canTransition(from, to)) {
    throw conflict(`An order cannot move from ${from} to ${to}.`, { from, to });
  }
}

export type ReservationEffect = 'none' | 'commit' | 'release' | 'restock';

/** What must happen to stock when a transition occurs. */
export function reservationEffect(from: string, to: string): ReservationEffect {
  if (to === 'paid' && from === 'new') return 'commit';
  if (to === 'cancelled') return from === 'new' ? 'release' : 'restock';
  if (to === 'refunded') return from === 'new' ? 'release' : 'restock';
  return 'none';
}

export function isTerminal(status: string): boolean {
  return status === 'cancelled' || status === 'refunded';
}

/**
 * Payment readiness for fulfilment. An order must never be packed before the
 * money is recorded as received.
 */
export function canFulfil(status: string, paidMinor: number, totalMinor: number): boolean {
  if (status !== 'paid' && status !== 'packed') return false;
  return paidMinor >= totalMinor;
}

export function nextStatuses(from: string): readonly OrderStatus[] {
  return isOrderStatus(from) ? TRANSITIONS[from] : [];
}
