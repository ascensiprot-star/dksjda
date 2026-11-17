import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Collection, Customer, Order, Product, WaitlistEntry } from '../../types';
import {
  PAL,
  barChart,
  chartLegend,
  cnt,
  donutChart,
  funnelChart,
  hbars,
  heatMap,
  legend,
  lineChart,
  progress,
  sparkChart,
} from './opsCharts';

/* --------------------------------------------------------------------------
   Real-data derivation. Nothing here invents a metric: every number is
   computed from the orders, products, customers and waitlist passed in.
   Metrics that need a source we do not have (sessions, traffic, margin) are
   shown as an em dash instead of a fabricated figure.
   -------------------------------------------------------------------------- */

const DAY = 86_400_000;
export type OpsRange = '7D' | '30D' | '90D' | '12M';
export type OpsCurrency = 'EUR' | 'USD' | 'GBP';

const CUR: Record<OpsCurrency, { s: string; f: number }> = {
  EUR: { s: '€', f: 1 },
  USD: { s: '$', f: 1.09 },
  GBP: { s: '£', f: 0.85 },
};

const RANGE_LABEL: Record<OpsRange, string> = {
  '7D': 'Last 7 days',
  '30D': 'Last 30 days',
  '90D': 'Last 90 days',
  '12M': 'Last 12 months',
};

export const OPS_REGIONS = ['Global', 'Europe', 'North America', 'Asia-Pacific', 'Middle East'] as const;

const REGION_COUNTRIES: Record<string, string[]> = {
  Europe: ['FI', 'SE', 'DE', 'FR', 'IT', 'NL', 'ES', 'DK', 'NO', 'IE', 'BE', 'AT', 'PL', 'PT', 'GB', 'UK', 'CH', 'CZ', 'GR', 'EE', 'LV', 'LT'],
  'North America': ['US', 'CA', 'MX'],
  'Asia-Pacific': ['JP', 'SG', 'AU', 'NZ', 'KR', 'CN', 'IN', 'HK', 'TW', 'TH', 'MY', 'ID', 'PH'],
  'Middle East': ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IL', 'JO'],
};

const NET_EXCLUDED = new Set(['cancelled', 'refunded']);

const STATUS_LABEL: Record<string, string> = {
  new: 'Received',
  paid: 'Paid',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const STATUS_CHIP: Record<string, string> = {
  new: '',
  paid: '',
  packed: 'hf',
  shipped: 'hf',
  delivered: 'f',
  cancelled: 'x',
  refunded: 'h',
};

const CATEGORY_LABEL: Record<string, string> = {
  naiset: 'Women',
  miehet: 'Men',
  asusteet: 'Accessories',
  kokoelmat: 'Collections',
  other: 'Other',
};

const moneyFmt = (currency: OpsCurrency) => {
  const { s, f } = CUR[currency];
  return {
    money: (n: number) => {
      const v = n * f;
      const a = Math.abs(v);
      if (a >= 1e6) return `${s}${(v / 1e6).toFixed(2)}M`;
      if (a >= 1e4) return `${s}${(v / 1e3).toFixed(1)}K`;
      return `${s}${Math.round(v).toLocaleString('en-US')}`;
    },
    moneyF: (n: number) => `${s}${Math.round(n * f).toLocaleString('en-US')}`,
  };
};

const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const tOf = (o: Order) => {
  const t = new Date(o.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const productCategory = (product: Product | undefined) =>
  product?.category && CATEGORY_LABEL[product.category] ? product.category : 'other';

interface Bucket { rev: number; orders: number }
interface WindowData {
  labels: string[];
  cur: Bucket[];
  prev: Bucket[];
  curOrders: Order[];
  prevOrders: Order[];
  days: number;
}

function buildWindow(orders: Order[], range: OpsRange): WindowData {
  const days = range === '7D' ? 7 : range === '30D' ? 30 : range === '90D' ? 90 : 365;
  const monthly = range === '12M';
  const n = monthly ? 12 : days;
  const now = Date.now();
  const from = now - days * DAY;
  const prevFrom = now - 2 * days * DAY;
  const width = (days * DAY) / n;

  const cur: Bucket[] = Array.from({ length: n }, () => ({ rev: 0, orders: 0 }));
  const prev: Bucket[] = Array.from({ length: n }, () => ({ rev: 0, orders: 0 }));
  const curOrders: Order[] = [];
  const prevOrders: Order[] = [];

  for (const o of orders) {
    const t = tOf(o);
    if (!t) continue;
    const net = !NET_EXCLUDED.has(o.status);
    if (t >= from && t <= now) {
      curOrders.push(o);
      if (!net) continue;
      const i = Math.min(n - 1, Math.max(0, Math.floor((t - from) / width)));
      cur[i].rev += o.totals?.total || 0;
      cur[i].orders += 1;
    } else if (t >= prevFrom && t < from) {
      prevOrders.push(o);
      if (!net) continue;
      const i = Math.min(n - 1, Math.max(0, Math.floor((t - prevFrom) / width)));
      prev[i].rev += o.totals?.total || 0;
      prev[i].orders += 1;
    }
  }

  const labels = Array.from({ length: n }, (_, i) => {
    const d = new Date(from + (i + 0.5) * width);
    return monthly
      ? d.toLocaleDateString('en-US', { month: 'short' })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  return { labels, cur, prev, curOrders, prevOrders, days };
}

const total = (a: Bucket[], k: keyof Bucket) => a.reduce((s, b) => s + b[k], 0);

interface OpsOverviewProps {
  orders: Order[];
  products: Product[];
  customers: Customer[];
  waitlist: WaitlistEntry[];
  collections: Collection[];
  range: OpsRange;
  currency: OpsCurrency;
  region: string;
  liveVisitors: number;
  onNavigate: (view: string) => void;
}

/* -------------------------------------------------------------------------- */

const Chart: React.FC<{ height: number; render: (w: number, h: number) => string }> = ({ height, render }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div className="ch" style={{ height }} ref={ref} dangerouslySetInnerHTML={{ __html: w ? render(w, height) : '' }} />;
};

const Panel: React.FC<{
  title: React.ReactNode;
  sub?: React.ReactNode;
  act?: React.ReactNode;
  cls?: string;
  flush?: boolean;
  children: React.ReactNode;
}> = ({ title, sub, act, cls = '', flush, children }) => (
  <section className={`p ${cls}`}>
    <header>
      <div>
        <h3>{title}</h3>
        {sub ? <p>{sub}</p> : null}
      </div>
      {act ? <div>{act}</div> : null}
    </header>
    <div className={`pb ${flush ? 'flush' : ''}`}>{children}</div>
  </section>
);

const Chip: React.FC<{ status: string }> = ({ status }) => (
  <span className={`chip ${STATUS_CHIP[status] || ''}`}>
    <i />
    {STATUS_LABEL[status] || status}
  </span>
);

const Ico: React.FC<{ d: string }> = ({ d }) => (
  <svg viewBox="0 0 24 24">
    {d
      .split('M')
      .filter(Boolean)
      .map((p, i) => (
        <path key={i} d={`M${p}`} />
      ))}
  </svg>
);

const ICONS = {
  dl: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  orders: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5',
};

export const OpsOverview: React.FC<OpsOverviewProps> = ({
  orders,
  products,
  customers,
  waitlist,
  collections,
  range,
  currency,
  region,
  liveVisitors,
  onNavigate,
}) => {
  const { money, moneyF } = useMemo(() => moneyFmt(currency), [currency]);

  const data = useMemo(() => {
    const scopedOrders =
      region === 'Global'
        ? orders
        : orders.filter((o) =>
            (REGION_COUNTRIES[region] || []).includes((o.customer?.address?.country || '').toUpperCase())
          );
    const W = buildWindow(scopedOrders, range);
    const curRev = total(W.cur, 'rev');
    const curOrders = total(W.cur, 'orders');
    const prevRev = total(W.prev, 'rev');
    const prevOrders = total(W.prev, 'orders');

    const delta = (a: number, b: number) => (b > 0 ? (a / b - 1) * 100 : null);

    const refunded = W.curOrders.filter((o) => o.status === 'refunded').length;
    const returnRate = W.curOrders.length ? (refunded / W.curOrders.length) * 100 : null;
    const prevRefunded = W.prevOrders.filter((o) => o.status === 'refunded').length;
    const prevReturnRate = W.prevOrders.length ? (prevRefunded / W.prevOrders.length) * 100 : null;

    const aov = curOrders ? curRev / curOrders : 0;
    const prevAov = prevOrders ? prevRev / prevOrders : 0;

    /* product lookup by id / number / name */
    const byId = new Map<string, Product>();
    const byName = new Map<string, Product>();
    products.forEach((p) => {
      byId.set(p.id, p);
      byName.set(p.name.en.toLowerCase(), p);
    });
    const orderProduct = (item: Order['items'][number]) =>
      byId.get(item.productId) || byName.get((item.productName || '').toLowerCase());

    /* revenue by category, stacked per bucket */
    const catKeys = ['naiset', 'miehet', 'asusteet', 'kokoelmat', 'other'];
    const catSeries = catKeys.map((k) => ({
      name: CATEGORY_LABEL[k],
      data: Array(W.cur.length).fill(0) as number[],
    }));
    for (const o of W.curOrders) {
      if (NET_EXCLUDED.has(o.status)) continue;
      const t = tOf(o);
      const width = (W.days * DAY) / W.cur.length;
      const from = Date.now() - W.days * DAY;
      const i = Math.min(W.cur.length - 1, Math.max(0, Math.floor((t - from) / width)));
      for (const item of o.items || []) {
        const product = orderProduct(item);
        const key = productCategory(product);
        const idx = Math.max(0, catKeys.indexOf(key));
        catSeries[idx].data[i] += (item.price || 0) * (item.quantity || 0);
      }
    }

    /* best sellers */
    const sellers = new Map<string, { l: string; v: number }>();
    for (const o of W.curOrders) {
      if (NET_EXCLUDED.has(o.status)) continue;
      for (const item of o.items || []) {
        const key = item.productName || item.productNr || item.productId;
        const row = sellers.get(key) || { l: key, v: 0 };
        row.v += (item.price || 0) * (item.quantity || 0);
        sellers.set(key, row);
      }
    }
    const best = [...sellers.values()].sort((a, b) => b.v - a.v).slice(0, 8);

    /* status mix */
    const mixMap = new Map<string, { l: string; v: number }>();
    for (const o of W.curOrders) {
      const row = mixMap.get(o.status) || { l: STATUS_LABEL[o.status] || o.status, v: 0 };
      row.v += o.totals?.total || 0;
      mixMap.set(o.status, row);
    }
    const mix = [...mixMap.values()].sort((a, b) => b.v - a.v);

    /* fulfilment funnel */
    const reached = (stages: string[]) => W.curOrders.filter((o) => stages.includes(o.status)).length;
    const funnel = [
      { l: 'Received', v: W.curOrders.length },
      { l: 'Paid', v: reached(['paid', 'packed', 'shipped', 'delivered']) },
      { l: 'Packed', v: reached(['packed', 'shipped', 'delivered']) },
      { l: 'Shipped', v: reached(['shipped', 'delivered']) },
      { l: 'Delivered', v: reached(['delivered']) },
    ];

    /* orders by weekday / 2-hour block */
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cols = ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22'];
    const heat: number[][] = weekdays.map(() => cols.map(() => 0));
    for (const o of W.curOrders) {
      const d = new Date(o.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const day = (d.getDay() + 6) % 7;
      const block = Math.min(11, Math.floor(d.getHours() / 2));
      heat[day][block] += 1;
    }

    /* revenue by country */
    const regions = new Map<string, number>();
    for (const o of W.curOrders) {
      if (NET_EXCLUDED.has(o.status)) continue;
      const c = o.customer?.address?.country || '—';
      regions.set(c, (regions.get(c) || 0) + (o.totals?.total || 0));
    }
    const regionRows = [...regions.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([l, v]) => ({ l, v }));

    /* recent orders */
    const recent = [...W.curOrders].sort((a, b) => tOf(b) - tOf(a)).slice(0, 7);

    /* recent clients */
    const topClients = [...customers].sort((a, b) => (b.totals?.spend || 0) - (a.totals?.spend || 0)).slice(0, 4);

    /* needs attention */
    const alerts: Array<{ gl: string; text: string; sub: string; time: string; view: string }> = [];
    const lowStock = products.filter((p) => (p.stock || 0) <= 4);
    if (lowStock.length) {
      alerts.push({
        gl: 'f',
        text: `${lowStock[0].name.en} is at ${lowStock[0].stock} in stock`,
        sub: lowStock.length > 1 ? `${lowStock.length - 1} more styles below the reorder line` : 'Below the reorder line',
        time: 'now',
        view: 'inventory',
      });
    }
    const pending = W.curOrders.filter((o) => ['new', 'paid', 'packed'].includes(o.status)).length;
    if (pending) {
      alerts.push({ gl: 'h', text: `${pending} orders wait for fulfilment`, sub: 'Open the order book to action them', time: '−', view: 'orders' });
    }
    if (refunded) {
      alerts.push({ gl: '', text: `${refunded} refunded orders in this period`, sub: 'Review settlement in the order book', time: '−', view: 'orders' });
    }
    if (waitlist.length) {
      alerts.push({ gl: '', text: `${waitlist.length} waitlist entries awaiting release`, sub: 'Private demand across drops', time: '−', view: 'waitlist' });
    }
    if (collections.length === 0) {
      alerts.push({ gl: '', text: 'No collections published', sub: 'Create a collection to open a drop', time: '−', view: 'collections' });
    }

    return {
      W,
      curRev,
      curOrders,
      aov,
      aovDelta: delta(aov, prevAov),
      revDelta: delta(curRev, prevRev),
      ordersDelta: delta(curOrders, prevOrders),
      returnRate,
      returnDelta: returnRate != null && prevReturnRate != null ? returnRate - prevReturnRate : null,
      catSeries,
      best,
      mix,
      funnel,
      weekdays,
      cols,
      heat,
      regionRows,
      recent,
      topClients,
      alerts,
      maxStock: Math.max(1, ...products.map((p) => p.stock || 0)),
    };
  }, [orders, products, customers, waitlist, collections, range, region]);

  const { W } = data;

  const kpis = [
    {
      l: 'Net revenue',
      v: money(data.curRev),
      d: data.revDelta,
      s: W.cur.map((b) => b.rev),
    },
    {
      l: 'Orders',
      v: cnt(data.curOrders),
      d: data.ordersDelta,
      s: W.cur.map((b) => b.orders),
    },
    {
      l: 'Average order value',
      v: data.curOrders ? moneyF(data.aov) : '—',
      d: data.aovDelta,
      s: W.cur.map((b) => (b.orders ? b.rev / b.orders : 0)),
    },
    {
      l: 'Conversion rate',
      v: '—',
      d: null as number | null,
      s: [] as number[],
      note: 'no traffic source',
    },
    {
      l: 'Gross margin',
      v: '—',
      d: null as number | null,
      s: [] as number[],
      note: 'no cost source',
    },
    {
      l: 'Return rate',
      v: data.returnRate == null ? '—' : `${data.returnRate.toFixed(1)}%`,
      d: data.returnDelta,
      pp: true,
      good: false,
      s: W.cur.map((b) => b.orders),
    },
  ];

  const dateLine = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const exportCsv = () => {
    const rows = [
      ['order', 'customer', 'country', 'status', 'created', 'total'],
      ...W.curOrders.map((o) => [
        o.number,
        o.customer?.name || '',
        o.customer?.address?.country || '',
        o.status,
        o.createdAt,
        String(o.totals?.total || 0),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `zejesh-orders-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="ph">
        <div>
          <h1>Overview</h1>
          <p>
            <i className="live" />
            {dateLine} · {RANGE_LABEL[range]} · All regions
          </p>
        </div>
        <div className="pa">
          <button className="b" onClick={exportCsv}>
            <Ico d={ICONS.dl} />
            Export
          </button>
          <button className="b dk" onClick={() => onNavigate('orders')}>
            <Ico d={ICONS.orders} />
            Open orders
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="g kp">
        {kpis.map((k) => (
          <div className="k" key={k.l}>
            <label>{k.l}</label>
            <div className="v">{k.v}</div>
            <div className="row">
              {k.d == null ? (
                <span className="mut" style={{ fontSize: 11.5 }}>
                  awaiting data
                </span>
              ) : (
                <>
                  <span className={`dl ${((k.d >= 0) === (k.good !== false)) ? '' : 'bad'}`}>
                    {k.d >= 0 ? '▲' : '▼'} {Math.abs(k.d).toFixed(1)}
                    {(k as { pp?: boolean }).pp ? ' pp' : '%'}
                  </span>
                  <span className="mut" style={{ fontSize: 11.5 }}>
                    vs prior
                  </span>
                </>
              )}
            </div>
            <div className="spk">
              {k.s.length > 0 ? (
                <Chart height={34} render={(w, h) => sparkChart(w, h, k.s)} />
              ) : (
                <div className="mut" style={{ fontSize: 11, height: 34, display: 'flex', alignItems: 'flex-end' }}>
                  {(k as { note?: string }).note || ''}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="g">
        <Panel
          title="Net revenue"
          sub="Current period against the one before it"
          cls="s8"
          act={
            <span
              dangerouslySetInnerHTML={{
                __html: chartLegend([
                  ['Current', 'ln'],
                  ['Previous', 'dn'],
                ]),
              }}
            />
          }
        >
          <Chart
            height={310}
            render={(w, h) =>
              lineChart(w, h, {
                labels: W.labels,
                series: [
                  { name: 'Current', data: W.cur.map((b) => b.rev) },
                  { name: 'Previous', data: W.prev.map((b) => b.rev), dash: true },
                ],
                fmt: moneyF,
                yf: money,
              })
            }
          />
        </Panel>
        <Panel title="Status mix" sub="Revenue by order status" cls="s4">
          {data.mix.length ? (
            <>
              <Chart
                height={200}
                render={(w, h) => donutChart(w, h, { items: data.mix, fmt: moneyF, center: money(data.curRev), sub: 'net revenue' })}
              />
              <div dangerouslySetInnerHTML={{ __html: legend(data.mix, moneyF) }} />
            </>
          ) : (
            <div className="mut" style={{ padding: '48px 0', textAlign: 'center' }}>
              No orders in this period.
            </div>
          )}
        </Panel>
      </div>

      <div className="g">
        <Panel
          title="Revenue by category"
          sub="Stacked by period"
          cls="s7"
          act={
            <span
              dangerouslySetInnerHTML={{
                __html: chartLegend(data.catSeries.map((s, i) => [s.name, '', PAL[i]])),
              }}
            />
          }
        >
          <Chart
            height={280}
            render={(w, h) =>
              barChart(w, h, {
                labels: W.labels,
                series: data.catSeries,
                stacked: true,
                fmt: moneyF,
                yf: money,
              })
            }
          />
        </Panel>
        <Panel title="Best sellers" sub="Revenue in period" cls="s5">
          <div dangerouslySetInnerHTML={{ __html: hbars(data.best, { fmt: money }) }} />
        </Panel>
      </div>

      <div className="g">
        <Panel title="Fulfilment funnel" sub="Orders reaching each stage" cls="s4">
          <div dangerouslySetInnerHTML={{ __html: funnelChart(data.funnel) }} />
        </Panel>
        <Panel title="When customers order" sub="Orders by weekday and time of day" cls="s4">
          <div dangerouslySetInnerHTML={{ __html: heatMap(data.weekdays, data.cols, data.heat, { lw: '34px' }) }} />
        </Panel>
        <Panel title="Revenue by region" sub="Top shipping countries" cls="s4">
          <div dangerouslySetInnerHTML={{ __html: hbars(data.regionRows, { fmt: money }) }} />
        </Panel>
      </div>

      <div className="g">
        <Panel
          title="Live activity"
          sub="New orders as they arrive"
          cls="s4"
          act={
            <span className="mut" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <i className="live" />
              <span>{liveVisitors}</span> browsing
            </span>
          }
        >
          <ul className="lst">
            {data.recent.length ? (
              data.recent.map((o) => (
                <li key={o.id} data-go="orders" onClick={() => onNavigate('orders')}>
                  <i className={`gl ${o.totals?.total > 400 ? 'f' : ''}`} />
                  <p>
                    {o.customer?.name || 'Guest'}
                    <small>
                      {o.customer?.address?.country || '—'} · {o.items?.length || 0} items
                    </small>
                  </p>
                  <b style={{ fontWeight: 500 }}>{moneyF(o.totals?.total || 0)}</b>
                  <time>
                    {(() => {
                      const mins = Math.round((Date.now() - tOf(o)) / 60000);
                      if (mins < 1) return 'now';
                      if (mins < 60) return `${mins}m`;
                      const hrs = Math.round(mins / 60);
                      return hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
                    })()}
                  </time>
                </li>
              ))
            ) : (
              <li>
                <p className="mut">No orders yet. New orders appear here as they arrive.</p>
              </li>
            )}
          </ul>
        </Panel>

        <Panel title="Needs attention" sub="Sorted by urgency" cls="s4">
          <ul className="lst">
            {data.alerts.length ? (
              data.alerts.map((a, i) => (
                <li key={i} data-go={a.view} onClick={() => onNavigate(a.view)}>
                  <i className={`gl ${a.gl}`} />
                  <p>
                    {a.text}
                    <small>{a.sub}</small>
                  </p>
                  <time>{a.time}</time>
                </li>
              ))
            ) : (
              <li>
                <i className="gl f" />
                <p>
                  Nothing needs attention
                  <small>The order book, stock and waitlists are clear</small>
                </p>
              </li>
            )}
          </ul>
        </Panel>

        <Panel title="Clientele" sub="Highest lifetime spend" cls="s4">
          {data.topClients.length ? (
            <ul className="lst">
              {data.topClients.map((c) => (
                <li key={c.id} data-go="customers" onClick={() => onNavigate('customers')}>
                  <i className="gl f" />
                  <p>
                    {c.name}
                    <small>
                      {c.totals?.orders || 0} orders · {c.email}
                    </small>
                  </p>
                  <b style={{ fontWeight: 500 }}>{moneyF(c.totals?.spend || 0)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mut" style={{ padding: '24px 0' }}>
              No client accounts yet.
            </div>
          )}
          {products.length > 0 && (
            <div className="pr" style={{ marginTop: 14 }}>
              <div dangerouslySetInnerHTML={{ __html: progress('Catalogue in stock', products.filter((p) => (p.stock || 0) > 0).length, products.length, cnt, Math.round((products.filter((p) => (p.stock || 0) > 0).length / products.length) * 100)) }} />
            </div>
          )}
        </Panel>
      </div>

      <div className="g">
        <Panel
          title="Recent orders"
          sub="Latest activity across the order book"
          cls="s12"
          flush
          act={
            <button className="b sm" onClick={() => onNavigate('orders')}>
              All orders
            </button>
          }
        >
          <div className="ts">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Country</th>
                  <th>Channel</th>
                  <th>Placed</th>
                  <th>Status</th>
                  <th className="r">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.length ? (
                  data.recent.map((o) => (
                    <tr key={o.id} data-row onClick={() => onNavigate('orders')}>
                      <td>
                        <b style={{ fontWeight: 500 }}>#{o.number}</b>
                      </td>
                      <td>{o.customer?.name || 'Guest'}</td>
                      <td>
                        <span className="mut">{o.customer?.address?.country || '—'}</span>
                      </td>
                      <td>{o.shippingMethod || '—'}</td>
                      <td>
                        {new Date(o.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <Chip status={o.status} />
                      </td>
                      <td className="r">{moneyF(o.totals?.total || 0)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="empty">
                      No orders in this period yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
};
