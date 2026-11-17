import type {
  AuditLog,
  Category,
  Collection,
  Customer,
  Discount,
  Order,
  Product,
  StoreSettings,
  WaitlistEntry,
} from '../../types';
import type { TerminalCurrency } from './terminalCharts';
import { CURRENCY_META, fmtN } from './terminalCharts';

export const TERMINAL_REGIONS = [
  'ZJ OPS Global',
  'ZJ Europe Region',
  'ZJ North America',
  'ZJ Asia-Pacific',
  'ZJ Middle East',
] as const;

export type TerminalRegion = (typeof TERMINAL_REGIONS)[number];
export type TerminalPeriodKind = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Annuals';

const REGION_COUNTRIES: Record<TerminalRegion, string[] | null> = {
  'ZJ OPS Global': null,
  'ZJ Europe Region': ['FI', 'SE', 'DE', 'FR', 'IT', 'NL', 'ES', 'DK', 'NO', 'IE', 'BE', 'AT', 'PL', 'PT', 'GB', 'UK', 'CH', 'CZ', 'GR', 'EE', 'LV', 'LT'],
  'ZJ North America': ['US', 'CA', 'MX'],
  'ZJ Asia-Pacific': ['JP', 'SG', 'AU', 'NZ', 'KR', 'CN', 'IN', 'HK', 'TW', 'TH', 'MY', 'ID', 'PH'],
  'ZJ Middle East': ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IL', 'JO'],
};

const REGION_SHORT_ID: Record<TerminalRegion, string> = {
  'ZJ OPS Global': 'ZJ OPS · GLOBAL',
  'ZJ Europe Region': 'ZJ EU · NORDIC/EU',
  'ZJ North America': 'ZJ NA · AMERICAS',
  'ZJ Asia-Pacific': 'ZJ APAC · PACIFIC',
  'ZJ Middle East': 'ZJ ME · MENA',
};

export function regionBadgeId(r: TerminalRegion): string {
  return REGION_SHORT_ID[r] || 'ZJ OPS';
}

const NET_EXCLUDED = new Set(['cancelled', 'refunded']);
const CAT_KEYS = ['naiset', 'miehet', 'asusteet', 'kokoelmat'] as const;
export const CAT_LABELS: Record<string, string> = {
  naiset: 'Women (Naiset)',
  miehet: 'Men (Miehet)',
  asusteet: 'Accessories',
  kokoelmat: 'Collections',
};

export const DAY_MS = 86_400_000;

export function orderTime(o: Order): number {
  const t = new Date(o.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function getProductTotalStock(p: Product): number {
  if (p.variants && p.variants.length > 0) {
    return p.variants.reduce((acc, v) => acc + (v.stock || 0), 0);
  }
  return p.stock || 0;
}

export function getProductSizeMap(p: Product): Record<string, number> {
  const out: Record<string, number> = {};
  if (p.variants && p.variants.length > 0) {
    for (const v of p.variants) {
      const sz = (v.size || 'OS').toUpperCase();
      out[sz] = (out[sz] || 0) + (v.stock || 0);
    }
  } else if (p.sizes && p.sizes.length > 0) {
    const perSize = Math.floor((p.stock || 0) / p.sizes.length);
    p.sizes.forEach((s, idx) => {
      const sz = s.toUpperCase();
      out[sz] = perSize + (idx === 0 ? (p.stock || 0) % p.sizes.length : 0);
    });
  } else {
    out['OS'] = p.stock || 0;
  }
  return out;
}

export interface PeriodBucket {
  id: string;
  label: string;
  endLabel: string;
  startMs: number;
  endMs: number;
  grossSales: number;
  discounts: number;
  shipping: number;
  vat: number;
  netRevenue: number;
  orders: number;
  units: number;
  aov: number;
  cancelledCount: number;
  refundedCount: number;
  refundedValue: number;
  deliveredCount: number;
  pendingCount: number;
  returnRate: number;
  catRev: [number, number, number, number];
  catUnits: [number, number, number, number];
  audits: number;
  waitlistSignups: number;
  newCustomers: number;
  // Snapshot stock valuation & governance metrics
  inventoryRetailVal: number;
  totalUnitsOnHand: number;
  activeSkus: number;
  lowStockSkus: number;
  outOfStockSkus: number;
  revGrowthPct: number | null;
}

export interface LedgerRow {
  id: string;
  label: string;
  lvl: 0 | 1 | 2;
  grp?: boolean;
  kids?: boolean;
  closed?: boolean;
  nov?: boolean;
  p100?: boolean;
  of?: string;
  fmt?: 'cur' | 'int' | 'dec' | 'pct' | 'x';
  fn: (b: PeriodBucket) => number | null;
}

export interface ProductTerminalRow {
  id: string;
  sku: string;
  name: string;
  catKey: string;
  catLabel: string;
  status: string;
  price: number;
  vatRate: number;
  stock: number;
  stockVal: number;
  sizeMap: Record<string, number>;
  units30: number;
  rev30: number;
  unitsPrev30: number;
  wowPct: number | null;
  coverDays: number | null;
  sellThruPct: number;
  spark14: number[];
  raw: Product;
}

export interface OrderTerminalRow {
  id: string;
  number: string;
  ts: number;
  customerName: string;
  customerEmail: string;
  country: string;
  qty: number;
  channel: string;
  status: string;
  tracking: string;
  subtotal: number;
  vat: number;
  shipping: number;
  discount: number;
  total: number;
  ageHours: number;
  raw: Order;
}

export interface WireEvent {
  source: string;
  ts: number;
  text: string;
  severity: 'dn' | 'am' | 'cy' | 'up';
  view?: string;
}

export interface TerminalWorkspaceInput {
  products: Product[];
  orders: Order[];
  customers: Customer[];
  waitlist: WaitlistEntry[];
  collections: Collection[];
  categories: Category[];
  discounts: Discount[];
  auditLogs: AuditLog[];
  settings: StoreSettings | null;
  liveVisitors: number;
  region: TerminalRegion;
  periodKind: TerminalPeriodKind;
  periodCount: number;
  currency: TerminalCurrency;
  controlOverview?: {
    overallStatus?: string;
    activeIncidents?: number;
    unacknowledgedAlerts?: number;
    failingProbes?: number;
    services?: Array<{
      id: string;
      name: string;
      status: string;
      latencyMs?: number | null;
      uptime24h?: number | null;
    }>;
  } | null;
}

export function buildPeriodBuckets(input: TerminalWorkspaceInput): PeriodBucket[] {
  const { products, orders, customers, waitlist, auditLogs, region, periodKind, periodCount } = input;
  const now = new Date();
  const buckets: PeriodBucket[] = [];
  const allowedCountries = REGION_COUNTRIES[region];

  const scopedOrders = allowedCountries
    ? orders.filter((o) => allowedCountries.includes((o.customer?.address?.country || '').toUpperCase()))
    : orders;

  const prodById = new Map<string, Product>();
  const prodByName = new Map<string, Product>();
  products.forEach((p) => {
    prodById.set(p.id, p);
    if (p.name?.en) prodByName.set(p.name.en.toLowerCase(), p);
  });

  const totalUnitsOnHand = products.reduce((s, p) => s + getProductTotalStock(p), 0);
  const inventoryRetailVal = products.reduce((s, p) => s + getProductTotalStock(p) * (p.price || 0), 0);
  const activeSkus = products.filter((p) => p.status !== 'archived').length;
  const lowStockSkus = products.filter((p) => {
    const st = getProductTotalStock(p);
    return st > 0 && st <= 4;
  }).length;
  const outOfStockSkus = products.filter((p) => getProductTotalStock(p) === 0).length;

  const makeSpan = (idxFromEnd: number): { id: string; label: string; endLabel: string; startMs: number; endMs: number } => {
    if (periodKind === 'Daily') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - idxFromEnd);
      const startMs = d.getTime();
      const endMs = startMs + DAY_MS - 1;
      const lbl = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      const endLbl = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
      return { id: `d-${idxFromEnd}`, label: lbl, endLabel: endLbl, startMs, endMs };
    }
    if (periodKind === 'Weekly') {
      const endDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - idxFromEnd * 7);
      const endMs = endDay.getTime() + DAY_MS - 1;
      const startMs = endMs - 7 * DAY_MS + 1;
      const dStart = new Date(startMs);
      const lbl = `W-${dStart.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}`;
      const endLbl = `${String(endDay.getMonth() + 1).padStart(2, '0')}/${String(endDay.getDate()).padStart(2, '0')}/${endDay.getFullYear()}`;
      return { id: `w-${idxFromEnd}`, label: lbl, endLabel: endLbl, startMs, endMs };
    }
    if (periodKind === 'Monthly') {
      const start = new Date(now.getFullYear(), now.getMonth() - idxFromEnd, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
      const lbl = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const endLbl = `${String(end.getMonth() + 1).padStart(2, '0')}/${String(end.getDate()).padStart(2, '0')}/${end.getFullYear()}`;
      return { id: `m-${idxFromEnd}`, label: lbl, endLabel: endLbl, startMs: start.getTime(), endMs: end.getTime() };
    }
    if (periodKind === 'Quarterly') {
      const curQ = Math.floor(now.getMonth() / 3);
      const targetQIndex = now.getFullYear() * 4 + curQ - idxFromEnd;
      const y = Math.floor(targetQIndex / 4);
      const q = ((targetQIndex % 4) + 4) % 4;
      const start = new Date(y, q * 3, 1);
      const end = new Date(y, q * 3 + 3, 0, 23, 59, 59, 999);
      const lbl = `Q${q + 1} ${y}`;
      const endLbl = `${String(end.getMonth() + 1).padStart(2, '0')}/${String(end.getDate()).padStart(2, '0')}/${end.getFullYear()}`;
      return { id: `q-${idxFromEnd}`, label: lbl, endLabel: endLbl, startMs: start.getTime(), endMs: end.getTime() };
    }
    // Annuals
    const y = now.getFullYear() - idxFromEnd;
    const start = new Date(y, 0, 1);
    const end = new Date(y, 11, 31, 23, 59, 59, 999);
    return { id: `y-${y}`, label: `${y} Y`, endLabel: `12/31/${y}`, startMs: start.getTime(), endMs: end.getTime() };
  };

  for (let i = periodCount - 1; i >= 0; i--) {
    const sp = makeSpan(i);
    let grossSales = 0;
    let discounts = 0;
    let shipping = 0;
    let vat = 0;
    let netRevenue = 0;
    let ordCount = 0;
    let units = 0;
    let cancelledCount = 0;
    let refundedCount = 0;
    let refundedValue = 0;
    let deliveredCount = 0;
    let pendingCount = 0;
    const catRev: [number, number, number, number] = [0, 0, 0, 0];
    const catUnits: [number, number, number, number] = [0, 0, 0, 0];

    for (const o of scopedOrders) {
      const t = orderTime(o);
      if (t < sp.startMs || t > sp.endMs) continue;
      if (o.status === 'cancelled') cancelledCount += 1;
      if (o.status === 'refunded') {
        refundedCount += 1;
        refundedValue += o.totals?.total || 0;
      }
      if (o.status === 'delivered') deliveredCount += 1;
      if (['new', 'paid', 'packed'].includes(o.status)) pendingCount += 1;
      if (NET_EXCLUDED.has(o.status)) continue;

      ordCount += 1;
      grossSales += o.totals?.subtotal || 0;
      discounts += o.totals?.discount || 0;
      shipping += o.totals?.shipping || 0;
      vat += o.totals?.vat || 0;
      netRevenue += o.totals?.total || 0;

      for (const item of o.items || []) {
        const qty = item.quantity || 0;
        const val = (item.price || 0) * qty;
        units += qty;
        const matched = prodById.get(item.productId) || prodByName.get((item.productName || '').toLowerCase());
        const cIdx = Math.max(0, CAT_KEYS.indexOf((matched?.category as (typeof CAT_KEYS)[number]) || 'kokoelmat'));
        catRev[cIdx] += val;
        catUnits[cIdx] += qty;
      }
    }

    const totalPlaced = ordCount + cancelledCount + refundedCount;
    const audits = auditLogs.filter((a) => {
      const t = new Date(a.at).getTime();
      return t >= sp.startMs && t <= sp.endMs;
    }).length;
    const waitlistSignups = waitlist.filter((w) => {
      const t = new Date(w.createdAt).getTime();
      return t >= sp.startMs && t <= sp.endMs;
    }).length;
    const newCustomers = customers.filter((c) => {
      const t = new Date(c.firstSeen).getTime();
      return t >= sp.startMs && t <= sp.endMs;
    }).length;

    buckets.push({
      ...sp,
      grossSales,
      discounts,
      shipping,
      vat,
      netRevenue,
      orders: ordCount,
      units,
      aov: ordCount > 0 ? netRevenue / ordCount : 0,
      cancelledCount,
      refundedCount,
      refundedValue,
      deliveredCount,
      pendingCount,
      returnRate: totalPlaced > 0 ? (refundedCount / totalPlaced) * 100 : 0,
      catRev,
      catUnits,
      audits,
      waitlistSignups,
      newCustomers,
      inventoryRetailVal,
      totalUnitsOnHand,
      activeSkus,
      lowStockSkus,
      outOfStockSkus,
      revGrowthPct: null,
    });
  }

  for (let i = 1; i < buckets.length; i++) {
    const prev = buckets[i - 1].netRevenue;
    const cur = buckets[i].netRevenue;
    buckets[i].revGrowthPct = prev > 0 ? ((cur / prev) - 1) * 100 : null;
  }

  return buckets;
}

export function getFaLedgerRows(tab: number, sub: number, input: TerminalWorkspaceInput): LedgerRow[] {
  const { collections, categories, discounts, liveVisitors } = input;

  if (tab === 1) {
    return [
      { id: 'rev', label: 'Net Revenue (Settled + Open)', lvl: 0, grp: true, kids: true, p100: true, fmt: 'cur', fn: (b) => b.netRevenue },
      { id: 'rev_g', label: 'Period-over-Period Growth', lvl: 1, fmt: 'pct', fn: (b) => b.revGrowthPct },
      { id: 'gross', label: 'Gross Merchandise Sales', lvl: 0, grp: true, kids: true, of: 'rev', fmt: 'cur', fn: (b) => b.grossSales },
      { id: 'vat', label: 'VAT / Tax Liability', lvl: 1, of: 'rev', fmt: 'cur', fn: (b) => b.vat },
      { id: 'ship', label: 'Shipping & Handling Collected', lvl: 1, of: 'rev', fmt: 'cur', fn: (b) => b.shipping },
      { id: 'disc', label: 'Promotional Discounts Granted', lvl: 1, of: 'rev', fmt: 'cur', fn: (b) => -b.discounts },
      { id: 'com', label: 'Commerce Volume & Efficiency', lvl: 0, grp: true, kids: true, nov: true, fn: () => null },
      { id: 'orders', label: 'Settled / Active Orders', lvl: 1, fmt: 'int', fn: (b) => b.orders },
      { id: 'aov', label: 'Average Order Value (AOV)', lvl: 1, fmt: 'cur', fn: (b) => b.aov },
      { id: 'units', label: 'Units Dispatched / Ordered', lvl: 1, fmt: 'int', fn: (b) => b.units },
      { id: 'upt', label: 'Units Per Order (UPT)', lvl: 1, fmt: 'x', fn: (b) => (b.orders > 0 ? b.units / b.orders : 0) },
      { id: 'ret', label: 'Refund / Return Rate', lvl: 1, fmt: 'pct', fn: (b) => b.returnRate },
      { id: 'newc', label: 'New Client Acquisitions', lvl: 1, fmt: 'int', fn: (b) => b.newCustomers },
      { id: 'wait', label: 'Private Drop Waitlist Signups', lvl: 1, fmt: 'int', fn: (b) => b.waitlistSignups },
      { id: 'inv_g', label: 'Current Balance & Risk Footprint', lvl: 0, grp: true, kids: true, nov: true, fn: () => null },
      { id: 'inv_val', label: 'On-Hand Catalogue Retail Valuation', lvl: 1, fmt: 'cur', fn: (b) => b.inventoryRetailVal },
      { id: 'inv_u', label: 'On-Hand Physical Units', lvl: 1, fmt: 'int', fn: (b) => b.totalUnitsOnHand },
      { id: 'low_sku', label: 'Low Stock SKUs (<= 4 units)', lvl: 1, fmt: 'int', fn: (b) => b.lowStockSkus },
    ];
  }

  if (tab === 2) {
    return [
      { id: 'rev', label: 'Net Revenue', lvl: 0, grp: true, kids: true, p100: true, fmt: 'cur', fn: (b) => b.netRevenue },
      ...CAT_KEYS.map((ck, idx): LedgerRow => ({
        id: `cat_${ck}`,
        label: CAT_LABELS[ck],
        lvl: 1,
        of: 'rev',
        fmt: 'cur',
        fn: (b) => b.catRev[idx],
      })),
      { id: 'gross', label: 'Merchandise Subtotal', lvl: 0, grp: true, of: 'rev', fmt: 'cur', fn: (b) => b.grossSales },
      { id: 'vat', label: 'VAT Included in Ledger', lvl: 1, of: 'rev', fmt: 'cur', fn: (b) => b.vat },
      { id: 'ship', label: 'Outbound Logistics Fee Recovered', lvl: 1, of: 'rev', fmt: 'cur', fn: (b) => b.shipping },
      { id: 'disc', label: 'Privilege & Code Rebates', lvl: 1, of: 'rev', fmt: 'cur', fn: (b) => b.discounts },
      { id: 'refv', label: 'Refunded / Voided Settlement', lvl: 0, grp: true, of: 'rev', fmt: 'cur', fn: (b) => b.refundedValue },
    ];
  }

  if (tab === 3) {
    return [
      { id: 'inv_val', label: 'Total Stock Retail Exposure', lvl: 0, grp: true, kids: true, p100: true, fmt: 'cur', fn: (b) => b.inventoryRetailVal },
      { id: 'inv_u', label: 'Total Physical Pieces on Hand', lvl: 1, fmt: 'int', fn: (b) => b.totalUnitsOnHand },
      { id: 'skus', label: 'Active Non-Archived Styles', lvl: 1, fmt: 'int', fn: (b) => b.activeSkus },
      { id: 'low_sku', label: 'Critical Reorder Styles (1-4 units)', lvl: 1, fmt: 'int', fn: (b) => b.lowStockSkus },
      { id: 'oos_sku', label: 'Sold-Out / Depleted Styles (0 units)', lvl: 1, fmt: 'int', fn: (b) => b.outOfStockSkus },
      { id: 'colls', label: 'Active Collections & Drops', lvl: 0, grp: true, fmt: 'int', fn: () => collections.length },
      { id: 'cats', label: 'Taxonomy Categories', lvl: 1, fmt: 'int', fn: () => categories.length },
      { id: 'prvs', label: 'Active Privilege Codes', lvl: 1, fmt: 'int', fn: () => discounts.filter((d) => d.active).length },
    ];
  }

  if (tab === 4) {
    return [
      { id: 'ord_t', label: 'Total Orders Captured', lvl: 0, grp: true, kids: true, p100: true, fmt: 'int', fn: (b) => b.orders + b.cancelledCount + b.refundedCount },
      { id: 'ord_deliv', label: 'Delivered & Closed', lvl: 1, of: 'ord_t', fmt: 'int', fn: (b) => b.deliveredCount },
      { id: 'ord_pend', label: 'Open / Packing Queue', lvl: 1, of: 'ord_t', fmt: 'int', fn: (b) => b.pendingCount },
      { id: 'ord_ref', label: 'Refunded Orders', lvl: 1, of: 'ord_t', fmt: 'int', fn: (b) => b.refundedCount },
      { id: 'ord_canc', label: 'Cancelled Orders', lvl: 1, of: 'ord_t', fmt: 'int', fn: (b) => b.cancelledCount },
    ];
  }

  if (tab === 5) {
    return [
      { id: 'eff', label: 'Commercial Ratios', lvl: 0, grp: true, kids: true, nov: true, fn: () => null },
      { id: 'aov', label: 'Average Order Value', lvl: 1, fmt: 'cur', fn: (b) => b.aov },
      { id: 'upt', label: 'Units Per Transaction', lvl: 1, fmt: 'x', fn: (b) => (b.orders > 0 ? b.units / b.orders : 0) },
      { id: 'ret', label: 'Refund / Return Share', lvl: 1, fmt: 'pct', fn: (b) => b.returnRate },
      { id: 'disc_r', label: 'Discount Erosion Rate', lvl: 1, fmt: 'pct', fn: (b) => (b.grossSales > 0 ? (b.discounts / b.grossSales) * 100 : 0) },
      { id: 'fulf_r', label: 'Completion Rate (Delivered / Placed)', lvl: 1, fmt: 'pct', fn: (b) => (b.orders > 0 ? (b.deliveredCount / b.orders) * 100 : 0) },
      { id: 'stk_cov', label: 'In-Stock Catalog Ratio', lvl: 1, fmt: 'pct', fn: (b) => (b.activeSkus > 0 ? ((b.activeSkus - b.outOfStockSkus) / b.activeSkus) * 100 : 0) },
    ];
  }

  if (tab === 6) {
    if (sub === 12) {
      // Regional share
      return [
        { id: 'rev', label: 'Scoped Region Net Revenue', lvl: 0, grp: true, p100: true, fmt: 'cur', fn: (b) => b.netRevenue },
        { id: 'orders', label: 'Scoped Region Orders', lvl: 1, fmt: 'int', fn: (b) => b.orders },
        { id: 'units', label: 'Scoped Region Units', lvl: 1, fmt: 'int', fn: (b) => b.units },
        { id: 'aov', label: 'Scoped Region AOV', lvl: 1, fmt: 'cur', fn: (b) => b.aov },
      ];
    }
    return [
      { id: 'rev', label: 'Revenue by House Category', lvl: 0, grp: true, kids: true, p100: true, fmt: 'cur', fn: (b) => b.netRevenue },
      ...CAT_KEYS.map((ck, idx): LedgerRow => ({
        id: `seg_rev_${ck}`,
        label: CAT_LABELS[ck],
        lvl: 1,
        of: 'rev',
        fmt: 'cur',
        fn: (b) => b.catRev[idx],
      })),
      { id: 'units', label: 'Units by House Category', lvl: 0, grp: true, kids: true, p100: true, fmt: 'int', fn: (b) => b.units },
      ...CAT_KEYS.map((ck, idx): LedgerRow => ({
        id: `seg_u_${ck}`,
        label: CAT_LABELS[ck],
        lvl: 1,
        of: 'units',
        fmt: 'int',
        fn: (b) => b.catUnits[idx],
      })),
    ];
  }

  if (tab === 7) {
    return [
      { id: 'sys', label: 'Governance & Live Telemetry', lvl: 0, grp: true, kids: true, nov: true, fn: () => null },
      { id: 'aud', label: 'Logged Security / Audit Mutations', lvl: 1, fmt: 'int', fn: (b) => b.audits },
      { id: 'wait', label: 'Waitlist Signups Captured', lvl: 1, fmt: 'int', fn: (b) => b.waitlistSignups },
      { id: 'newc', label: 'New Patron Accounts Registered', lvl: 1, fmt: 'int', fn: (b) => b.newCustomers },
      { id: 'live', label: 'Live Telemetry Events (5m Window)', lvl: 1, fmt: 'int', fn: () => liveVisitors },
    ];
  }

  return [];
}

export function formatLedgerValue(v: number | null, fmt: LedgerRow['fmt'], cur: TerminalCurrency): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const { sym, rate } = CURRENCY_META[cur];
  if (fmt === 'cur') {
    const val = v * rate;
    return `${sym}${fmtN(val, Math.abs(val) < 100 && val !== 0 ? 2 : 0)}`;
  }
  if (fmt === 'int') return fmtN(v, 0);
  if (fmt === 'pct') return `${fmtN(v, 1)}%`;
  if (fmt === 'x') return `${fmtN(v, 2)}x`;
  return fmtN(v, 1);
}

export function buildProductTerminalRows(products: Product[], orders: Order[]): ProductTerminalRow[] {
  const now = Date.now();
  const d30 = now - 30 * DAY_MS;
  const d60 = now - 60 * DAY_MS;
  const unitsByProd = new Map<string, { u30: number; rev30: number; uPrev: number; days14: number[] }>();

  const touch = (key: string) => {
    let cur = unitsByProd.get(key);
    if (!cur) {
      cur = { u30: 0, rev30: 0, uPrev: 0, days14: Array(14).fill(0) };
      unitsByProd.set(key, cur);
    }
    return cur;
  };

  for (const o of orders) {
    if (NET_EXCLUDED.has(o.status)) continue;
    const t = orderTime(o);
    if (!t) continue;
    for (const item of o.items || []) {
      const qty = item.quantity || 0;
      const val = (item.price || 0) * qty;
      const idKey = item.productId;
      const nameKey = (item.productName || '').toLowerCase();
      const apply = (rec: { u30: number; rev30: number; uPrev: number; days14: number[] }) => {
        if (t >= d30) {
          rec.u30 += qty;
          rec.rev30 += val;
          const ageDays = Math.floor((now - t) / DAY_MS);
          if (ageDays >= 0 && ageDays < 14) {
            rec.days14[13 - ageDays] += qty;
          }
        } else if (t >= d60) {
          rec.uPrev += qty;
        }
      };
      if (idKey) apply(touch(idKey));
      if (nameKey && nameKey !== idKey) apply(touch(nameKey));
    }
  }

  return products.map((p) => {
    const stock = getProductTotalStock(p);
    const sales = unitsByProd.get(p.id) || unitsByProd.get((p.name?.en || '').toLowerCase()) || {
      u30: 0,
      rev30: 0,
      uPrev: 0,
      days14: Array(14).fill(0),
    };
    const velocityDaily = sales.u30 / 30;
    const coverDays = velocityDaily > 0 ? Math.round(stock / velocityDaily) : stock > 0 ? 999 : 0;
    const sellThruPct = sales.u30 + stock > 0 ? (sales.u30 / (sales.u30 + stock)) * 100 : 0;
    const wowPct = sales.uPrev > 0 ? ((sales.u30 / sales.uPrev) - 1) * 100 : null;
    const catKey = p.category || 'kokoelmat';

    return {
      id: p.id,
      sku: p.nr || p.plateNumber || p.id.slice(0, 8).toUpperCase(),
      name: p.name?.en || p.name?.fi || 'Untitled Piece',
      catKey,
      catLabel: CAT_LABELS[catKey] || catKey,
      status: (p.status || 'live').toUpperCase(),
      price: p.price || 0,
      vatRate: p.vatRate ?? 24,
      stock,
      stockVal: stock * (p.price || 0),
      sizeMap: getProductSizeMap(p),
      units30: sales.u30,
      rev30: sales.rev30,
      unitsPrev30: sales.uPrev,
      wowPct,
      coverDays,
      sellThruPct,
      spark14: sales.days14,
      raw: p,
    };
  });
}

export function buildOrderTerminalRows(orders: Order[], region: TerminalRegion): OrderTerminalRow[] {
  const allowedCountries = REGION_COUNTRIES[region];
  const now = Date.now();
  return orders
    .filter((o) =>
      allowedCountries ? allowedCountries.includes((o.customer?.address?.country || '').toUpperCase()) : true
    )
    .map((o) => {
      const ts = orderTime(o);
      const qty = (o.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0);
      return {
        id: o.id,
        number: o.number || o.id.slice(0, 8).toUpperCase(),
        ts,
        customerName: o.customer?.name || 'Guest Client',
        customerEmail: o.customer?.email || '—',
        country: (o.customer?.address?.country || '—').toUpperCase(),
        qty,
        channel: o.shippingMethod || 'WEB-DIRECT',
        status: o.status || 'new',
        tracking: o.tracking || '—',
        subtotal: o.totals?.subtotal || 0,
        vat: o.totals?.vat || 0,
        shipping: o.totals?.shipping || 0,
        discount: o.totals?.discount || 0,
        total: o.totals?.total || 0,
        ageHours: ts > 0 ? Math.max(0, (now - ts) / 3_600_000) : 0,
        raw: o,
      };
    })
    .sort((a, b) => b.ts - a.ts);
}

export function buildLiveWire(input: TerminalWorkspaceInput): WireEvent[] {
  const events: WireEvent[] = [];

  for (const log of input.auditLogs.slice(0, 12)) {
    const t = new Date(log.at).getTime();
    events.push({
      source: 'SEC',
      ts: Number.isNaN(t) ? Date.now() : t,
      text: `${log.action.toUpperCase()} · ${log.target || 'SYSTEM'} · OPERATOR ${log.who || 'ADMIN'}`,
      severity: log.action.includes('LOCK') || log.action.includes('FAIL') ? 'dn' : 'cy',
      view: 'SEC',
    });
  }

  for (const o of input.orders.slice(0, 8)) {
    const t = orderTime(o);
    events.push({
      source: 'ORD',
      ts: t || Date.now(),
      text: `ORDER ${o.number} [${o.status.toUpperCase()}] · ${o.customer?.name || 'CLIENT'} (${o.customer?.address?.country || '—'}) · EUR ${fmtN(o.totals?.total || 0, 2)}`,
      severity: o.status === 'refunded' || o.status === 'cancelled' ? 'dn' : o.status === 'delivered' ? 'up' : 'am',
      view: 'ORD',
    });
  }

  const lowStock = input.products.filter((p) => getProductTotalStock(p) <= 4);
  if (lowStock.length > 0) {
    events.push({
      source: 'INV',
      ts: Date.now(),
      text: `CRITICAL STOCK ALERT · ${lowStock[0].nr || lowStock[0].name.en} AT ${getProductTotalStock(lowStock[0])} UNITS (${lowStock.length} TOTAL SKUS <= 4)`,
      severity: 'dn',
      view: 'INV',
    });
  }

  if (input.controlOverview && (input.controlOverview.failingProbes || input.controlOverview.unacknowledgedAlerts)) {
    events.push({
      source: 'CTL',
      ts: Date.now(),
      text: `CONTROL PLANE · STATUS ${(input.controlOverview.overallStatus || 'DEGRADED').toUpperCase()} · ${input.controlOverview.failingProbes || 0} PROBES FAILING · ${input.controlOverview.unacknowledgedAlerts || 0} ALERTS`,
      severity: 'dn',
      view: 'CTL',
    });
  }

  if (input.waitlist.length > 0) {
    const w = input.waitlist[0];
    events.push({
      source: 'CUS',
      ts: new Date(w.createdAt).getTime() || Date.now(),
      text: `WAITLIST QUEUE · ${input.waitlist.length} ENTRIES · LATEST DROP ${w.dropId || 'ARCHIVE'}`,
      severity: 'cy',
      view: 'CUS',
    });
  }

  return events.sort((a, b) => b.ts - a.ts);
}

export function computeRiskAssessment(input: TerminalWorkspaceInput) {
  const totalSkus = Math.max(1, input.products.length);
  const oosCount = input.products.filter((p) => getProductTotalStock(p) === 0).length;
  const lowCount = input.products.filter((p) => {
    const st = getProductTotalStock(p);
    return st > 0 && st <= 4;
  }).length;
  const pendingOrders = input.orders.filter((o) => ['new', 'paid', 'packed'].includes(o.status));
  const overdueOrders = pendingOrders.filter((o) => {
    const ageH = (Date.now() - orderTime(o)) / 3_600_000;
    return ageH > 24;
  }).length;
  const refundedCount = input.orders.filter((o) => o.status === 'refunded' || o.status === 'cancelled').length;
  const totalOrd = Math.max(1, input.orders.length);

  const oosPct = (oosCount / totalSkus) * 100;
  const lowPct = (lowCount / totalSkus) * 100;
  const overduePct = pendingOrders.length > 0 ? (overdueOrders / pendingOrders.length) * 100 : 0;
  const refundPct = (refundedCount / totalOrd) * 100;
  const probePenalty = (input.controlOverview?.failingProbes || 0) * 8 + (input.controlOverview?.activeIncidents || 0) * 10;

  const compositeRisk = Math.min(
    99.9,
    oosPct * 0.28 + lowPct * 0.14 + overduePct * 0.32 + refundPct * 0.26 + probePenalty
  );

  return {
    compositeRisk,
    oosCount,
    lowCount,
    overdueOrders,
    pendingCount: pendingOrders.length,
    refundedCount,
    oosPct,
    lowPct,
    overduePct,
    refundPct,
    probePenalty,
  };
}
