import { action, defineSystem } from '../core/system';
import { db, intOrZero, numeric, windowStartIso } from '../core/repository';
import {
  customerMetrics,
  growthRate,
  loadOrders,
  productMetrics,
  revenueMetrics,
  isRevenueOrder,
} from '../core/metrics';
import { sumMinor } from '../core/money';

interface ProductRow {
  id: string;
  name?: unknown;
  stock?: number | null;
  status?: string | null;
  price?: number | null;
}

function localizedName(value: unknown): string {
  if (typeof value === 'string') return value;
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return String(record.en || record.fi || '');
}

/**
 * Executive system: one real, recorded view of the business.
 * Every number is derived from persisted orders/products/customers. Nothing is
 * estimated unless the response explicitly marks it as a projection.
 */
export const executiveSystem = defineSystem({
  id: 'executive',
  index: 1,
  name: 'Executive Overview',
  screen: 'dashboard',
  description: 'Recorded revenue, demand, customers and operational risk.',
  actions: {
    overview: action('governance.read', 'Executive overview for a rolling window.', async (_ctx, input) => {
      const days = Math.min(365, Math.max(7, intOrZero(input.days) || 30));
      const orders = await loadOrders(days * 2);
      const cutoff = Date.now() - days * 86_400_000;
      const current = orders.filter((order) => Date.parse(order.createdAt) >= cutoff);
      const previous = orders.filter((order) => Date.parse(order.createdAt) < cutoff);

      const currentRevenue = revenueMetrics(current);
      const previousRevenue = revenueMetrics(previous);
      const customers = customerMetrics(orders);
      const currentEmails = new Set(current.filter(isRevenueOrder).map((order) => order.email));
      const previousEmails = new Set(previous.filter(isRevenueOrder).map((order) => order.email));
      const returningCustomers = customers.filter(
        (customer) => customer.orders > 1 && currentEmails.has(customer.email)
      ).length;

      const products = await db.rows<ProductRow>(
        db.from('products').select('id, name, stock, status, price').limit(2000)
      );
      const settings = await db.one<{ lowStockThreshold?: number | null }>(
        db.from('settings').select('lowStockThreshold').eq('id', 'store').maybeSingle()
      );
      const threshold = Math.max(0, intOrZero(settings?.lowStockThreshold) || 5);
      const lowStock = products
        .filter((product) => numeric(product.stock, 0) <= threshold)
        .sort((a, b) => numeric(a.stock, 0) - numeric(b.stock, 0))
        .slice(0, 20)
        .map((product) => ({
          id: product.id,
          name: localizedName(product.name),
          stock: intOrZero(product.stock),
          status: product.status || 'draft',
        }));

      const topProducts = productMetrics(current).slice(0, 10);

      const openOrders = orders.filter((order) =>
        ['new', 'paid', 'packed'].includes(order.status.toLowerCase())
      );
      const staleUnpaid = openOrders.filter(
        (order) =>
          order.status.toLowerCase() === 'new' &&
          Date.now() - Date.parse(order.createdAt) > 24 * 3_600_000
      );

      const newCustomers = Array.from(currentEmails).filter((email) => !previousEmails.has(email))
        .length;
      const repeatRate = currentEmails.size
        ? Math.round((returningCustomers / currentEmails.size) * 1000) / 10
        : 0;

      return {
        windowDays: days,
        revenue: {
          netMinor: currentRevenue.netRevenueMinor,
          grossMinor: currentRevenue.grossRevenueMinor,
          vatMinor: currentRevenue.vatMinor,
          growthPercent: growthRate(
            currentRevenue.netRevenueMinor,
            previousRevenue.netRevenueMinor
          ),
        },
        orders: {
          count: currentRevenue.orders,
          growthPercent: growthRate(currentRevenue.orders, previousRevenue.orders),
          aovMinor: currentRevenue.aovMinor,
          units: currentRevenue.units,
          unitsPerOrder: currentRevenue.unitsPerOrder,
          open: openOrders.length,
          staleUnpaid: staleUnpaid.length,
        },
        customers: {
          active: currentEmails.size,
          new: newCustomers,
          returning: returningCustomers,
          repeatRatePercent: repeatRate,
          totalKnown: customers.length,
        },
        margin: {
          recorded: false,
          note: 'Product cost is not recorded for every product yet, so margin is not reported.',
        },
        topProducts,
        lowStock,
        alerts: [
          ...(staleUnpaid.length
            ? [
                {
                  severity: 'warning',
                  code: 'stale_unpaid_orders',
                  message: `${staleUnpaid.length} order(s) are unpaid for more than 24 hours.`,
                },
              ]
            : []),
          ...(lowStock.length
            ? [
                {
                  severity: 'info',
                  code: 'low_stock',
                  message: `${lowStock.length} product(s) are at or below the low-stock threshold.`,
                },
              ]
            : []),
        ],
        discountMinor: sumMinor(current.map((order) => order.discountMinor)),
        recordedAt: new Date().toISOString(),
      };
    }),

    activity: action('governance.read', 'Recent business events across every system.', async (_ctx, input) => {
      const limit = Math.min(200, Math.max(1, intOrZero(input.limit) || 50));
      const rows = await db.rows<Record<string, unknown>>(
        db
          .from('business_events')
          .select('id, type, occurred_at, actor_type, customer_id, order_id, amount_minor, payload')
          .order('occurred_at', { ascending: false })
          .limit(limit)
      );
      return { events: rows };
    }),

    readiness: action('governance.read', 'Checks whether each BOS dependency is present.', async () => {
      const checks = await Promise.all(
        [
          'business_events',
          'idempotency_keys',
          'inventory_movements',
          'order_lines',
          'payments',
          'shipments',
          'returns',
          'promotions',
          'crm_notes',
          'support_tickets',
          'ledger_accounts',
          'suppliers',
          'bos_employees',
          'automation_rules',
        ].map(async (table) => {
          const { error } = await db.from(table).select('*').limit(1);
          return {
            table,
            ready: !error,
            reason: error ? String(error.code || 'unavailable') : null,
          };
        })
      );
      return {
        ready: checks.filter((check) => check.ready).length,
        total: checks.length,
        checks,
        checkedAt: new Date().toISOString(),
      };
    }),
  },
});

/** Shared helper: ISO start for a rolling window. */
export function since(days: number): string {
  return windowStartIso(days);
}
