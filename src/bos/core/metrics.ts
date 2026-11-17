import { db, numeric, asRecord, asArray, windowStartIso } from './repository';
import { totalsFromLegacy, sumMinor } from './money';

/** Shape of a legacy JSONB order row. Treated as a compatibility projection. */
export interface LegacyOrder {
  id: string;
  number?: string | null;
  customer?: unknown;
  items?: unknown;
  totals?: unknown;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  timeline?: unknown;
}

export interface NormalizedOrder {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  email: string;
  customerName: string;
  items: NormalizedOrderItem[];
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  vatMinor: number;
  totalMinor: number;
  currency: string;
}

export interface NormalizedOrderItem {
  productId: string;
  productNr: string;
  productName: string;
  size: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

const NON_REVENUE_STATUSES = new Set(['cancelled', 'refunded', 'failed', 'draft']);

export function normalizeOrder(row: LegacyOrder): NormalizedOrder {
  const customer = asRecord(row.customer);
  const totals = totalsFromLegacy(row.totals);
  const items = asArray(row.items).map((raw): NormalizedOrderItem => {
    const item = asRecord(raw);
    const quantity = Math.max(0, Math.trunc(numeric(item.quantity, 0)));
    const unitPriceMinor = Math.round(numeric(item.price, 0) * 100);
    return {
      productId: String(item.productId || ''),
      productNr: String(item.productNr || ''),
      productName:
        typeof item.productName === 'string'
          ? item.productName
          : String(asRecord(item.productName).en || asRecord(item.productName).fi || ''),
      size: String(item.size || ''),
      quantity,
      unitPriceMinor,
      lineTotalMinor: quantity * unitPriceMinor,
    };
  });

  return {
    id: row.id,
    number: row.number || row.id,
    status: String(row.status || 'new'),
    createdAt: row.createdAt || new Date(0).toISOString(),
    email: String(customer.email || '').toLowerCase(),
    customerName: String(customer.name || ''),
    items,
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.discountMinor,
    shippingMinor: totals.shippingMinor,
    vatMinor: totals.vatMinor,
    totalMinor: totals.totalMinor,
    currency: totals.currency,
  };
}

export function isRevenueOrder(order: NormalizedOrder): boolean {
  return !NON_REVENUE_STATUSES.has(order.status.toLowerCase());
}

export interface RevenueMetrics {
  orders: number;
  units: number;
  grossRevenueMinor: number;
  netRevenueMinor: number;
  vatMinor: number;
  discountMinor: number;
  shippingMinor: number;
  aovMinor: number;
  unitsPerOrder: number;
}

export function revenueMetrics(orders: NormalizedOrder[]): RevenueMetrics {
  const billable = orders.filter(isRevenueOrder);
  const netRevenueMinor = sumMinor(billable.map((order) => order.totalMinor));
  const vatMinor = sumMinor(billable.map((order) => order.vatMinor));
  const units = billable.reduce(
    (sum, order) => sum + order.items.reduce((line, item) => line + item.quantity, 0),
    0
  );
  return {
    orders: billable.length,
    units,
    grossRevenueMinor: netRevenueMinor + vatMinor,
    netRevenueMinor,
    vatMinor,
    discountMinor: sumMinor(billable.map((order) => order.discountMinor)),
    shippingMinor: sumMinor(billable.map((order) => order.shippingMinor)),
    aovMinor: billable.length ? Math.round(netRevenueMinor / billable.length) : 0,
    unitsPerOrder: billable.length ? Math.round((units / billable.length) * 100) / 100 : 0,
  };
}

export interface ProductMetric {
  productId: string;
  productNr: string;
  productName: string;
  units: number;
  orders: number;
  revenueMinor: number;
}

export function productMetrics(orders: NormalizedOrder[]): ProductMetric[] {
  const map = new Map<string, ProductMetric & { orderSet: Set<string> }>();
  for (const order of orders) {
    if (!isRevenueOrder(order)) continue;
    for (const item of order.items) {
      const key = item.productId || item.productNr || item.productName;
      if (!key) continue;
      const entry =
        map.get(key) ||
        ({
          productId: item.productId,
          productNr: item.productNr,
          productName: item.productName,
          units: 0,
          orders: 0,
          revenueMinor: 0,
          orderSet: new Set<string>(),
        } as ProductMetric & { orderSet: Set<string> });
      entry.units += item.quantity;
      entry.revenueMinor += item.lineTotalMinor;
      entry.orderSet.add(order.id);
      map.set(key, entry);
    }
  }
  return Array.from(map.values())
    .map(({ orderSet, ...metric }) => ({ ...metric, orders: orderSet.size }))
    .sort((a, b) => b.revenueMinor - a.revenueMinor);
}

export type RfmSegment =
  | 'champion'
  | 'loyal'
  | 'potential_loyalist'
  | 'new'
  | 'at_risk'
  | 'hibernating'
  | 'lost'
  | 'unknown';

export interface CustomerMetric {
  customerId: string;
  email: string;
  name: string;
  orders: number;
  totalSpentMinor: number;
  aovMinor: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  recencyDays: number;
  frequency: number;
  monetaryMinor: number;
  rfm: { recency: number; frequency: number; monetary: number };
  segment: RfmSegment;
}

function scoreQuintile(values: number[], value: number): number {
  if (!values.length) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((entry) => entry <= value).length;
  return Math.max(1, Math.min(5, Math.ceil((below / sorted.length) * 5)));
}

export function customerMetrics(
  orders: NormalizedOrder[],
  now = new Date()
): CustomerMetric[] {
  const billable = orders.filter((order) => isRevenueOrder(order) && order.email);
  const grouped = new Map<string, NormalizedOrder[]>();
  for (const order of billable) {
    const list = grouped.get(order.email) || [];
    list.push(order);
    grouped.set(order.email, list);
  }

  const base = Array.from(grouped.entries()).map(([email, list]) => {
    const sorted = [...list].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
    );
    const totalSpentMinor = sumMinor(sorted.map((order) => order.totalMinor));
    const last = sorted[sorted.length - 1];
    const recencyDays = Math.max(
      0,
      Math.floor((now.getTime() - Date.parse(last.createdAt)) / 86_400_000)
    );
    return {
      customerId: last.items.length ? last.id : last.id,
      email,
      name: last.customerName,
      orders: sorted.length,
      totalSpentMinor,
      aovMinor: Math.round(totalSpentMinor / sorted.length),
      firstOrderAt: sorted[0]?.createdAt || null,
      lastOrderAt: last?.createdAt || null,
      recencyDays,
      frequency: sorted.length,
      monetaryMinor: totalSpentMinor,
      rfm: { recency: 1, frequency: 1, monetary: 1 },
      segment: 'unknown' as RfmSegment,
    };
  });

  const recencies = base.map((customer) => customer.recencyDays);
  const frequencies = base.map((customer) => customer.frequency);
  const monetary = base.map((customer) => customer.monetaryMinor);
  // Lower recency is better, so invert the quintile for the R score.
  const maxRecency = Math.max(0, ...recencies);

  for (const customer of base) {
    const r = maxRecency === 0 ? 5 : 6 - scoreQuintile(recencies, customer.recencyDays);
    const f = scoreQuintile(frequencies, customer.frequency);
    const m = scoreQuintile(monetary, customer.monetaryMinor);
    customer.rfm = { recency: r, frequency: f, monetary: m };
    customer.segment = classifyRfm(r, f, m, customer.recencyDays);
  }

  return base.sort((a, b) => b.monetaryMinor - a.monetaryMinor);
}

function classifyRfm(r: number, f: number, m: number, recencyDays: number): RfmSegment {
  if (r >= 4 && f >= 4 && m >= 4) return 'champion';
  if (r >= 3 && f >= 3) return 'loyal';
  if (r >= 4 && f <= 2) return 'new';
  if (r >= 3 && f <= 2) return 'potential_loyalist';
  if (r <= 2 && f >= 3) return 'at_risk';
  if (r <= 2 && recencyDays <= 180) return 'hibernating';
  if (recencyDays > 180) return 'lost';
  return 'unknown';
}

export interface CohortRetention {
  cohort: string;
  size: number;
  periods: Array<{ monthOffset: number; customers: number; rate: number }>;
}

export function cohortRetention(orders: NormalizedOrder[]): CohortRetention[] {
  const firstOrder = new Map<string, string>();
  for (const order of orders) {
    if (!isRevenueOrder(order) || !order.email) continue;
    const current = firstOrder.get(order.email);
    if (!current || Date.parse(order.createdAt) < Date.parse(current)) {
      firstOrder.set(order.email, order.createdAt);
    }
  }
  const cohorts = new Map<string, { members: Set<string>; active: Map<number, Set<string>> }>();
  const monthKey = (iso: string) => iso.slice(0, 7);

  for (const [email, first] of firstOrder) {
    const key = monthKey(first);
    const cohort = cohorts.get(key) || { members: new Set<string>(), active: new Map() };
    cohort.members.add(email);
    cohorts.set(key, cohort);
  }
  for (const order of orders) {
    if (!isRevenueOrder(order) || !order.email) continue;
    const first = firstOrder.get(order.email);
    if (!first) continue;
    const cohort = cohorts.get(monthKey(first));
    if (!cohort) continue;
    const offset = monthOffset(first, order.createdAt);
    if (offset < 0 || offset > 24) continue;
    const set = cohort.active.get(offset) || new Set<string>();
    set.add(order.email);
    cohort.active.set(offset, set);
  }

  return Array.from(cohorts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohortKey, cohort]) => ({
      cohort: cohortKey,
      size: cohort.members.size,
      periods: Array.from({ length: 13 }, (_, monthOffset) => {
        const customers = cohort.active.get(monthOffset)?.size || 0;
        return {
          monthOffset,
          customers,
          rate: cohort.members.size
            ? Math.round((customers / cohort.members.size) * 1000) / 10
            : 0,
        };
      }),
    }));
}

export function monthOffset(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return -1;
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
}

export interface DailySeriesPoint {
  date: string;
  orders: number;
  units: number;
  revenueMinor: number;
}

export function dailySeries(orders: NormalizedOrder[], days = 30): DailySeriesPoint[] {
  const buckets = new Map<string, DailySeriesPoint>();
  const now = new Date();
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(now.getTime() - index * 86_400_000).toISOString().slice(0, 10);
    buckets.set(date, { date, orders: 0, units: 0, revenueMinor: 0 });
  }
  for (const order of orders) {
    if (!isRevenueOrder(order)) continue;
    const date = order.createdAt.slice(0, 10);
    const bucket = buckets.get(date);
    if (!bucket) continue;
    bucket.orders += 1;
    bucket.units += order.items.reduce((sum, item) => sum + item.quantity, 0);
    bucket.revenueMinor += order.totalMinor;
  }
  return Array.from(buckets.values());
}

export async function loadOrders(days = 365): Promise<NormalizedOrder[]> {
  const rows = await db.rows<LegacyOrder>(
    db
      .from('orders')
      .select('*')
      .gte('createdAt', windowStartIso(days))
      .order('createdAt', { ascending: false })
      .limit(20000)
  );
  return rows.map(normalizeOrder);
}

export function growthRate(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
