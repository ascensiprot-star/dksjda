import { action, defineSystem } from '../core/system';
import { db, intOrZero, windowStartIso } from '../core/repository';
import { loadOrders, productMetrics, revenueMetrics, isRevenueOrder } from '../core/metrics';

interface EventRow {
  type: string;
  timestamp: number;
  visitorId: string;
  sessionId: string;
  page: string;
  deviceClass?: string;
  utm?: Record<string, string> | null;
  payload?: Record<string, unknown> | null;
}

const FUNNEL_STEPS = [
  { key: 'session', label: 'Sessions', types: ['page_view'] },
  { key: 'product_view', label: 'Product viewed', types: ['product_view', 'product_dwell'] },
  { key: 'add_to_bag', label: 'Added to bag', types: ['add_to_bag'] },
  { key: 'checkout', label: 'Checkout started', types: ['checkout_step'] },
  { key: 'purchase', label: 'Purchased', types: ['purchase'] },
] as const;

async function loadEvents(days: number): Promise<EventRow[]> {
  const since = Date.now() - days * 86_400_000;
  return db.rows<EventRow>(
    db
      .from('events')
      .select('type, timestamp, visitorId, sessionId, page, "deviceClass", utm, payload')
      .gte('timestamp', since)
      .order('timestamp', { ascending: false })
      .limit(100000)
  );
}

/**
 * Analytics system: recorded behavioural events only.
 * Consent-gated events arrive from the storefront tracker; no synthetic
 * sessions or inferred identities are generated here.
 */
export const analyticsSystem = defineSystem({
  id: 'analytics',
  index: 15,
  name: 'Analytics',
  screen: 'analytics',
  description: 'Traffic, funnel and product engagement from recorded events.',
  actions: {
    overview: action('governance.read', 'Traffic and conversion overview.', async (_ctx, input) => {
      const days = Math.min(365, Math.max(1, intOrZero(input.days) || 30));
      const [events, orders] = await Promise.all([loadEvents(days), loadOrders(days)]);
      const revenue = revenueMetrics(orders);
      const sessions = new Set<string>();
      const visitors = new Set<string>();
      const purchasers = new Set<string>();
      const typeCounts = new Map<string, number>();
      const pageCounts = new Map<string, number>();
      const devices = new Map<string, number>();
      const sources = new Map<string, number>();
      const productViews = new Map<string, number>();
      const addToBag = new Map<string, number>();

      for (const event of events) {
        sessions.add(event.sessionId);
        visitors.add(event.visitorId);
        typeCounts.set(event.type, (typeCounts.get(event.type) || 0) + 1);
        devices.set(event.deviceClass || 'unknown', (devices.get(event.deviceClass || 'unknown') || 0) + 1);
        if (event.type === 'page_view') {
          pageCounts.set(event.page, (pageCounts.get(event.page) || 0) + 1);
        }
        if (event.type === 'purchase') purchasers.add(event.sessionId);
        const productId = String(event.payload?.productId || '');
        if (productId && (event.type === 'product_view' || event.type === 'product_dwell')) {
          productViews.set(productId, (productViews.get(productId) || 0) + 1);
        }
        if (productId && event.type === 'add_to_bag') {
          addToBag.set(productId, (addToBag.get(productId) || 0) + 1);
        }
        const source = event.utm?.source || event.utm?.utm_source || 'direct';
        sources.set(source, (sources.get(source) || 0) + 1);
      }

      const conversionRate = sessions.size
        ? Math.round((purchasers.size / sessions.size) * 10000) / 100
        : null;

      return {
        windowDays: days,
        traffic: {
          sessions: sessions.size,
          visitors: visitors.size,
          pageViews: typeCounts.get('page_view') || 0,
          events: events.length,
          consentGated: true,
        },
        commerce: {
          orders: revenue.orders,
          netRevenueMinor: revenue.netRevenueMinor,
          aovMinor: revenue.aovMinor,
          conversionRatePercent: conversionRate,
          source: 'orders',
        },
        topPages: Array.from(pageCounts.entries())
          .map(([page, views]) => ({ page, views }))
          .sort((a, b) => b.views - a.views)
          .slice(0, 15),
        devices: Array.from(devices.entries()).map(([device, count]) => ({ device, count })),
        sources: Array.from(sources.entries())
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15),
        eventTypes: Array.from(typeCounts.entries())
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
        productEngagement: Array.from(
          new Set([...productViews.keys(), ...addToBag.keys()])
        ).map((productId) => ({
          productId,
          views: productViews.get(productId) || 0,
          addToBag: addToBag.get(productId) || 0,
          viewToBagPercent: productViews.get(productId)
            ? Math.round(((addToBag.get(productId) || 0) / productViews.get(productId)!) * 1000) / 10
            : null,
        })),
      };
    }),

    funnel: action('governance.read', 'Distinct-session funnel.', async (_ctx, input) => {
      const days = Math.min(365, Math.max(1, intOrZero(input.days) || 30));
      const events = await loadEvents(days);
      const reached = new Map<string, Set<string>>();
      for (const step of FUNNEL_STEPS) reached.set(step.key, new Set());

      for (const event of events) {
        for (const step of FUNNEL_STEPS) {
          if ((step.types as readonly string[]).includes(event.type)) {
            reached.get(step.key)!.add(event.sessionId);
          }
        }
      }

      const base = reached.get('session')?.size || 0;
      return {
        windowDays: days,
        steps: FUNNEL_STEPS.map((step, index) => {
          const count = reached.get(step.key)!.size;
          const previous = index === 0 ? count : reached.get(FUNNEL_STEPS[index - 1].key)!.size;
          return {
            step: step.key,
            label: step.label,
            sessions: count,
            fromStartPercent: base ? Math.round((count / base) * 1000) / 10 : 0,
            stepConversionPercent: previous ? Math.round((count / previous) * 1000) / 10 : 0,
          };
        }),
      };
    }),

    productPerformance: action('governance.read', 'Sold vs viewed by product.', async (_ctx, input) => {
      const days = Math.min(365, Math.max(1, intOrZero(input.days) || 30));
      const [events, orders] = await Promise.all([loadEvents(days), loadOrders(days)]);
      const views = new Map<string, number>();
      for (const event of events) {
        if (event.type !== 'product_view' && event.type !== 'product_dwell') continue;
        const productId = String(event.payload?.productId || '');
        if (productId) views.set(productId, (views.get(productId) || 0) + 1);
      }
      return {
        windowDays: days,
        products: productMetrics(orders).map((metric) => ({
          ...metric,
          views: views.get(metric.productId) || 0,
          conversionPercent: views.get(metric.productId)
            ? Math.round((metric.units / views.get(metric.productId)!) * 1000) / 10
            : null,
        })),
      };
    }),

    events: action('governance.read', 'Most recent recorded analytics events.', async (_ctx, input) => {
      const limit = Math.min(500, Math.max(1, intOrZero(input.limit) || 100));
      const since = windowStartIso(Math.min(30, Math.max(1, intOrZero(input.days) || 1)));
      const rows = await db.rows<EventRow>(
        db
          .from('events')
          .select('type, timestamp, visitorId, sessionId, page, "deviceClass", utm, payload')
          .gte('timestamp', Date.parse(since))
          .order('timestamp', { ascending: false })
          .limit(limit)
      );
      return { events: rows };
    }),

    reportOrders: action('report.export', 'Order report with a CSV export.', async (_ctx, input) => {
      const days = Math.min(365, Math.max(1, intOrZero(input.days) || 30));
      const orders = await loadOrders(days);
      const rows = orders.map((order) => ({
        order: order.number,
        created: order.createdAt,
        status: order.status,
        customer: order.email,
        items: order.items.reduce((sum, item) => sum + item.quantity, 0),
        netMinor: order.totalMinor,
        vatMinor: order.vatMinor,
        totalMinor: order.totalMinor,
      }));
      const header = ['Order', 'Created', 'Status', 'Customer', 'Items', 'Net minor', 'VAT minor', 'Total minor'];
      const escape = (value: unknown) => {
        const text = String(value ?? '');
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const csv = [header.join(','), ...rows.map((row) => Object.values(row).map(escape).join(','))].join('\n');
      return {
        windowDays: days,
        rows,
        csv,
        generatedAt: new Date().toISOString(),
        note: 'Amounts are integer minor units. CSV is generated from recorded orders only.',
      };
    }),

    revenueSeries: action('governance.read', 'Daily recorded revenue series.', async (_ctx, input) => {
      const days = Math.min(365, Math.max(7, intOrZero(input.days) || 30));
      const orders = await loadOrders(days);
      const buckets = new Map<string, { date: string; orders: number; netMinor: number }>();
      for (let index = days - 1; index >= 0; index -= 1) {
        const date = new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10);
        buckets.set(date, { date, orders: 0, netMinor: 0 });
      }
      for (const order of orders) {
        if (!isRevenueOrder(order)) continue;
        const bucket = buckets.get(order.createdAt.slice(0, 10));
        if (!bucket) continue;
        bucket.orders += 1;
        bucket.netMinor += order.totalMinor;
      }
      return { days, series: Array.from(buckets.values()) };
    }),
  },
});
