import { describe, expect, it } from 'vitest';
import { computeOrderTotals, percentageDiscountMinor, toMinor } from '../../src/bos/core/money';
import { evaluateDiscount, type DiscountRule } from '../../src/bos/core/pricingEngine';
import {
  assertTransition,
  canFulfil,
  canTransition,
  nextStatuses,
  reservationEffect,
} from '../../src/bos/core/orderState';
import { hasPermission, normalizeRole, requiresApproval } from '../../src/bos/core/authz';
import {
  cohortRetention,
  customerMetrics,
  normalizeOrder,
  productMetrics,
  revenueMetrics,
  type LegacyOrder,
} from '../../src/bos/core/metrics';

describe('money', () => {
  it('converts euros to integer minor units', () => {
    expect(toMinor(19.99)).toEqual({ amountMinor: 1999, currency: 'EUR' });
    expect(toMinor(0.1 + 0.2).amountMinor).toBe(30);
  });

  it('computes VAT-inclusive totals with shipping and discount', () => {
    const totals = computeOrderTotals({
      lines: [{ quantity: 2, unitPriceMinor: 5000 }],
      shippingMinor: 700,
      orderDiscountMinor: 1000,
      vatRatePercent: 24,
    });
    expect(totals.subtotalMinor).toBe(10000);
    expect(totals.totalMinor).toBe(9700);
    expect(totals.vatMinor).toBe(Math.round((9000 * 24) / 124));
  });

  it('rejects a discount exceeding the subtotal', () => {
    expect(() =>
      computeOrderTotals({
        lines: [{ quantity: 1, unitPriceMinor: 100 }],
        orderDiscountMinor: 200,
      })
    ).toThrow(/cannot exceed/i);
  });

  it('rejects non-integer quantity', () => {
    expect(() =>
      computeOrderTotals({ lines: [{ quantity: 1.5, unitPriceMinor: 100 }] })
    ).toThrow(/positive integer/i);
  });

  it('applies percentage discounts exactly', () => {
    expect(percentageDiscountMinor(1999, 10)).toBe(200);
    expect(percentageDiscountMinor(1999, 0)).toBe(0);
    expect(percentageDiscountMinor(1999, 150)).toBe(1999);
  });
});

describe('pricing engine', () => {
  const base: DiscountRule = {
    code: 'WELCOME10',
    type: 'percent',
    value: 10,
    minSpendMinor: 0,
    usageLimit: 0,
    used: 0,
    active: true,
  };

  it('accepts a valid percentage code', () => {
    const result = evaluateDiscount(base, 10000, 500);
    expect(result.valid).toBe(true);
    expect(result.discountMinor).toBe(1000);
  });

  it('rejects an expired code', () => {
    const result = evaluateDiscount(
      { ...base, endAt: '2020-01-01T00:00:00.000Z' },
      10000,
      500
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects a usage limit that is reached', () => {
    const result = evaluateDiscount({ ...base, usageLimit: 5, used: 5 }, 10000, 500);
    expect(result.reason).toBe('usage_limit_reached');
  });

  it('enforces a minimum spend', () => {
    const result = evaluateDiscount({ ...base, minSpendMinor: 20000 }, 10000, 500);
    expect(result.reason).toBe('min_spend_not_met');
  });

  it('caps a fixed discount at the subtotal', () => {
    const result = evaluateDiscount(
      { ...base, type: 'fixed', value: 200 },
      10000,
      500
    );
    expect(result.discountMinor).toBe(10000);
  });

  it('marks free shipping without a monetary discount', () => {
    const result = evaluateDiscount({ ...base, type: 'freeShipping', value: 0 }, 10000, 500);
    expect(result.freeShipping).toBe(true);
    expect(result.discountMinor).toBe(0);
  });
});

describe('order state machine', () => {
  it('allows the documented lifecycle', () => {
    expect(canTransition('new', 'paid')).toBe(true);
    expect(canTransition('paid', 'packed')).toBe(true);
    expect(canTransition('packed', 'shipped')).toBe(true);
    expect(canTransition('shipped', 'delivered')).toBe(true);
    expect(canTransition('delivered', 'refunded')).toBe(true);
  });

  it('blocks skipping payment or resurrection', () => {
    expect(canTransition('new', 'shipped')).toBe(false);
    expect(canTransition('cancelled', 'paid')).toBe(false);
    expect(canTransition('refunded', 'new')).toBe(false);
    expect(() => assertTransition('new', 'delivered')).toThrow(/cannot move/i);
  });

  it('maps stock effects to transitions', () => {
    expect(reservationEffect('new', 'paid')).toBe('commit');
    expect(reservationEffect('new', 'cancelled')).toBe('release');
    expect(reservationEffect('paid', 'cancelled')).toBe('restock');
    expect(reservationEffect('delivered', 'refunded')).toBe('restock');
    expect(reservationEffect('paid', 'packed')).toBe('none');
  });

  it('gates fulfilment on payment', () => {
    expect(canFulfil('paid', 1000, 1000)).toBe(true);
    expect(canFulfil('paid', 900, 1000)).toBe(false);
    expect(canFulfil('new', 1000, 1000)).toBe(false);
  });

  it('offers only valid next statuses', () => {
    expect(nextStatuses('new')).toEqual(['paid', 'cancelled']);
    expect(nextStatuses('cancelled')).toEqual([]);
  });
});

describe('permissions', () => {
  it('normalizes legacy and current roles', () => {
    expect(normalizeRole('OWNER')).toBe('owner');
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('unknown')).toBe('viewer');
  });

  it('grants owners everything and limits analysts to reads', () => {
    expect(hasPermission('owner', 'workforce.write')).toBe(true);
    expect(hasPermission('analyst', 'governance.read')).toBe(true);
    expect(hasPermission('analyst', 'catalog.write')).toBe(false);
    expect(hasPermission('support', 'order.refund')).toBe(false);
    expect(hasPermission('editor', 'order.refund')).toBe(false);
    expect(hasPermission('manager', 'order.refund')).toBe(true);
  });

  it('marks sensitive permissions as approval-gated', () => {
    expect(requiresApproval('order.refund')).toBe(true);
    expect(requiresApproval('finance.write')).toBe(true);
    expect(requiresApproval('catalog.read')).toBe(false);
  });
});

function order(overrides: Partial<LegacyOrder> & { id: string; email?: string }): LegacyOrder {
  return {
    number: `ZE-${overrides.id}`,
    status: 'paid',
    createdAt: overrides.createdAt || '2026-01-10T10:00:00.000Z',
    customer: { email: overrides.email || 'a@example.com', name: 'A' },
    items: [
      { productId: 'p1', productNr: '1', productName: 'Coat', size: 'M', quantity: 2, price: 100 },
    ],
    totals: { subtotal: 200, shipping: 10, vat: 38.71, discount: 0, total: 210 },
    ...overrides,
  };
}

describe('recorded metrics', () => {
  it('normalizes legacy orders and excludes cancelled revenue', () => {
    const normalized = [
      normalizeOrder(order({ id: '1' })),
      normalizeOrder(order({ id: '2', status: 'cancelled' })),
    ];
    const metrics = revenueMetrics(normalized);
    expect(metrics.orders).toBe(1);
    expect(metrics.netRevenueMinor).toBe(21000);
    expect(metrics.units).toBe(2);
    expect(metrics.aovMinor).toBe(21000);
  });

  it('attributes product revenue', () => {
    const products = productMetrics([normalizeOrder(order({ id: '1' }))]);
    expect(products[0].productId).toBe('p1');
    expect(products[0].units).toBe(2);
    expect(products[0].revenueMinor).toBe(20000);
  });

  it('computes repeat customers and RFM segments', () => {
    const customers = customerMetrics([
      normalizeOrder(order({ id: '1', email: 'a@example.com' })),
      normalizeOrder(order({ id: '2', email: 'a@example.com', createdAt: '2026-03-01T10:00:00.000Z' })),
      normalizeOrder(order({ id: '3', email: 'b@example.com' })),
    ]);
    expect(customers).toHaveLength(2);
    const repeat = customers.find((entry) => entry.email === 'a@example.com')!;
    expect(repeat.orders).toBe(2);
    expect(repeat.segment).toBeTruthy();
  });

  it('builds acquisition cohorts', () => {
    const cohorts = cohortRetention([
      normalizeOrder(order({ id: '1', email: 'a@example.com' })),
      normalizeOrder(order({ id: '2', email: 'a@example.com', createdAt: '2026-02-10T10:00:00.000Z' })),
    ]);
    expect(cohorts[0].cohort).toBe('2026-01');
    expect(cohorts[0].periods[1].customers).toBe(1);
  });
});
