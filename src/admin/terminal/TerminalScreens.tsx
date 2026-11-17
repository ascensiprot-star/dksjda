import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiInsight,
  AuditLog,
  Category,
  Collection,
  Customer,
  DailyStat,
  Discount,
  Order,
  Product,
  StoreContent,
  StoreSettings,
  WaitlistEntry,
} from '../../types';
import {
  barChartSvg,
  CURRENCY_META,
  escHtml,
  fmtMoney,
  fmtN,
  gaugeSvg,
  lineChartSvg,
  MiniBarIcon,
  nf,
  scatterSvg,
  sparkSvg,
  TERM_COLORS,
  TerminalChart,
  type TerminalCurrency,
} from './terminalCharts';
import {
  buildLiveWire,
  buildOrderTerminalRows,
  buildPeriodBuckets,
  buildProductTerminalRows,
  CAT_LABELS,
  computeRiskAssessment,
  DAY_MS,
  formatLedgerValue,
  getFaLedgerRows,
  getProductTotalStock,
  type LedgerRow,
  orderTime,
  type OrderTerminalRow,
  type PeriodBucket,
  type ProductTerminalRow,
  regionBadgeId,
  TERMINAL_REGIONS,
  type TerminalPeriodKind,
  type TerminalRegion,
} from './terminalMetrics';

import { AdminProductsView } from '../products/AdminProductsView';
import { AdminCollectionsView } from '../collections/AdminCollectionsView';
import { AdminCategoriesView } from '../categories/AdminCategoriesView';
import { AdminMediaView } from '../media/AdminMediaView';
import { AdminOrdersView } from '../orders/AdminOrdersView';
import { AdminInventoryView } from '../inventory/AdminInventoryView';
import { AdminCustomersView } from '../customers/AdminCustomersView';
import { AdminWaitlistView } from '../waitlist/AdminWaitlistView';
import { AdminDiscountsView } from '../discounts/AdminDiscountsView';
import { AdminSuggestionsView } from '../suggestions/AdminSuggestionsView';
import { AdminContentView } from '../content/AdminContentView';
import { AdminAnalyticsView } from '../analytics/AdminAnalyticsView';
import { AdminAdvisorView } from '../advisor/AdminAdvisorView';
import { AdminControlPlaneView } from '../control/AdminControlPlaneView';
import { AdminSystemHealthView } from '../health/AdminSystemHealthView';
import { AdminAtlasView } from '../atlas/AdminAtlasView';
import { AdminSecurityView } from '../security/AdminSecurityView';
import { AdminSettingsView } from '../settings/AdminSettingsView';

export type TerminalFnCode =
  | 'MON'
  | 'FA'
  | 'DES'
  | 'RSK'
  | 'ORD'
  | 'PRD'
  | 'INV'
  | 'CUS'
  | 'CTL'
  | 'SEC'
  | 'CMS'
  | 'ADV'
  | 'SET';

export interface TerminalScreensProps {
  fn: TerminalFnCode;
  onNavigateFn: (fn: TerminalFnCode) => void;
  onNavigateLegacyView: (viewId: string) => void;
  requestedSubTab?: { fn: TerminalFnCode; subTab: number; nonce: number } | null;
  onSubTabChange?: (fn: TerminalFnCode, subTab: number) => void;
  region: TerminalRegion;
  onChangeRegion: (r: TerminalRegion) => void;
  periodKind: TerminalPeriodKind;
  onChangePeriodKind: (k: TerminalPeriodKind) => void;
  periodCount: number;
  onChangePeriodCount: (n: number) => void;
  currency: TerminalCurrency;
  onChangeCurrency: (c: TerminalCurrency) => void;
  showPctCols: boolean;
  onPlotMetric: (title: string, labels: string[], values: number[]) => void;
  onToast: (msg: string) => void;

  // Real data props from AdminLayout
  products: Product[];
  orders: Order[];
  customers: Customer[];
  waitlist: WaitlistEntry[];
  collections: Collection[];
  categories: Category[];
  discounts: Discount[];
  content: StoreContent | null;
  settings: StoreSettings | null;
  auditLogs: AuditLog[];
  liveVisitors: number;
  realDailyStats: DailyStat[];
  insights: AiInsight[];
  autoLockMinutes: number;
  onUpdateAutoLock: (mins: number) => void;
  onLockTerminalNow: () => void;
  onEditProduct: (p: Product) => void;
  onCreateProduct: () => void;
  onViewProductInStore: (p: Product) => void;
  onRefreshProducts: () => void;
  onDeleteProduct: (id: string) => Promise<boolean>;
  onDeleteProducts: (ids: string[]) => Promise<boolean>;
  controlOverview: {
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

/* --------------------------------------------------------------------------
   Shared Bloomberg Terminal Primitives
   -------------------------------------------------------------------------- */

const Panel: React.FC<{
  title: string;
  code?: string;
  onCodeClick?: () => void;
  rightSlot?: React.ReactNode;
  style?: React.CSSProperties;
  flush?: boolean;
  children: React.ReactNode;
}> = ({ title, code, onCodeClick, rightSlot, style, flush, children }) => (
  <section className="t-pn" style={style}>
    <h4>
      <span>{title}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {rightSlot}
        {code ? (
          <u onClick={onCodeClick} title={`Jump to ${code}`}>
            {code} &gt;
          </u>
        ) : null}
      </span>
    </h4>
    <div className={`t-pb ${flush ? 'fx' : ''}`}>{children}</div>
  </section>
);

const KvGrid: React.FC<{ rows: Array<[string, React.ReactNode]> }> = ({ rows }) => (
  <div className="t-kv">
    {rows.map(([k, v], i) => (
      <React.Fragment key={`${k}-${i}`}>
        <div>{k}</div>
        <div>{v}</div>
      </React.Fragment>
    ))}
  </div>
);

interface SortCol<T> {
  key: string;
  label: string;
  align?: 'r' | 'c';
  sortVal?: (row: T) => number | string;
  render: (row: T) => React.ReactNode;
}

function SortableTable<T>({
  cols,
  rows,
  defaultSortKey,
  defaultDir = -1,
  selectedId,
  getRowId,
  onSelectRow,
  emptyText = 'No records in current scope.',
}: {
  cols: SortCol<T>[];
  rows: T[];
  defaultSortKey?: string;
  defaultDir?: 1 | -1;
  selectedId?: string | null;
  getRowId: (r: T) => string;
  onSelectRow?: (r: T) => void;
  emptyText?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey || null);
  const [sortDir, setSortDir] = useState<1 | -1>(defaultDir);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = cols.find((c) => c.key === sortKey);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortVal ? col.sortVal(a) : (a as Record<string, unknown>)[col.key];
      const bv = col.sortVal ? col.sortVal(b) : (b as Record<string, unknown>)[col.key];
      const ax = typeof av === 'number' ? av : String(av ?? '').toLowerCase();
      const bx = typeof bv === 'number' ? bv : String(bv ?? '').toLowerCase();
      if (ax > bx) return sortDir;
      if (ax < bx) return -sortDir;
      return 0;
    });
  }, [rows, cols, sortKey, sortDir]);

  const handleSort = (key: string, sortable: boolean) => {
    if (!sortable) return;
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  return (
    <table className="t-dt">
      <thead>
        <tr>
          {cols.map((c) => {
            const sortable = Boolean(c.sortVal || c.key);
            return (
              <th
                key={c.key}
                className={c.align || ''}
                onClick={() => handleSort(c.key, sortable)}
              >
                {c.label}
                {sortKey === c.key ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 ? (
          <tr>
            <td colSpan={cols.length} className="dim" style={{ padding: '12px 8px' }}>
              {emptyText}
            </td>
          </tr>
        ) : (
          sorted.map((r) => {
            const id = getRowId(r);
            return (
              <tr
                key={id}
                className={selectedId === id ? 'sel' : ''}
                onClick={() => onSelectRow?.(r)}
                style={onSelectRow ? { cursor: 'pointer' } : undefined}
              >
                {cols.map((c) => (
                  <td key={c.key} className={c.align || ''}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

const PctBar: React.FC<{ value: number; max?: number; color?: string }> = ({
  value,
  max = 100,
  color = '#ffa21f',
}) => {
  const pct = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100));
  return (
    <span className="t-mb">
      <i style={{ width: `${pct}%`, background: color }} />
    </span>
  );
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  new: 'cy',
  paid: 'cy',
  packed: 'yl',
  shipped: 'am',
  delivered: 'up',
  refunded: 'dn',
  cancelled: 'dim',
};

const TrapezoidTabs: React.FC<{
  tabs: string[];
  active: number;
  onSelect: (idx: number) => void;
}> = ({ tabs, active, onSelect }) => (
  <div className="t-tabs">
    {tabs.map((label, i) => (
      <button
        key={label}
        type="button"
        className={active === i + 1 ? 'on' : ''}
        onClick={() => onSelect(i + 1)}
      >
        {label}
      </button>
    ))}
  </div>
);

const SubRibbon: React.FC<{
  items?: Array<{ id: number; label: string }>;
  active?: number;
  onSelect?: (id: number) => void;
}> = ({ items, active, onSelect }) => {
  if (!items || items.length === 0) {
    return <div className="t-sub" style={{ height: 6 }} />;
  }
  return (
    <div className="t-sub">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={active === it.id ? 'on' : ''}
          onClick={() => onSelect?.(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
};

function useTerminalSubTab(
  fnCode: TerminalFnCode,
  requestedSubTab?: { fn: TerminalFnCode; subTab: number; nonce: number } | null,
  onSubTabChange?: (fn: TerminalFnCode, subTab: number) => void
): [number, (id: number) => void] {
  const [subTab, setSubTabState] = useState<number>(() =>
    requestedSubTab && requestedSubTab.fn === fnCode ? requestedSubTab.subTab : 1
  );

  useEffect(() => {
    if (requestedSubTab && requestedSubTab.fn === fnCode) {
      setSubTabState(requestedSubTab.subTab);
    }
  }, [fnCode, requestedSubTab?.nonce, requestedSubTab?.fn, requestedSubTab?.subTab]);

  const setSubTab = (next: number) => {
    setSubTabState(next);
    onSubTabChange?.(fnCode, next);
  };

  return [subTab, setSubTab];
}

/* --------------------------------------------------------------------------
   1) MON — Monitor · Command Overview
   -------------------------------------------------------------------------- */
const MonScreen: React.FC<TerminalScreensProps & { buckets: PeriodBucket[]; prodRows: ProductTerminalRow[]; orderRows: OrderTerminalRow[] }> = (props) => {
  const { buckets, prodRows, orderRows, currency, region, liveVisitors, onNavigateFn, onEditProduct } = props;
  const curMeta = CURRENCY_META[currency];

  // Daily 60D comparison: last 30D vs prior 30D from real orders
  const dailySeries = useMemo(() => {
    const now = new Date();
    const curDays = Array(30).fill(0);
    const prevDays = Array(30).fill(0);
    const labels: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    const d30Start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).getTime();
    const d60Start = d30Start - 30 * DAY_MS;

    for (const o of orderRows) {
      if (o.status === 'cancelled' || o.status === 'refunded') continue;
      if (o.ts >= d30Start) {
        const idx = Math.min(29, Math.max(0, Math.floor((o.ts - d30Start) / DAY_MS)));
        curDays[idx] += o.total * curMeta.rate;
      } else if (o.ts >= d60Start) {
        const idx = Math.min(29, Math.max(0, Math.floor((o.ts - d60Start) / DAY_MS)));
        prevDays[idx] += o.total * curMeta.rate;
      }
    }
    return { labels, curDays, prevDays };
  }, [orderRows, curMeta.rate]);

  // Order arrival heatmap (7 days × 12 2-hour windows)
  const heatData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cols = ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22'];
    const mat: number[][] = days.map(() => cols.map(() => 0));
    for (const o of orderRows) {
      if (!o.ts) continue;
      const d = new Date(o.ts);
      const day = (d.getDay() + 6) % 7;
      const blk = Math.min(11, Math.floor(d.getHours() / 2));
      mat[day][blk] += 1;
    }
    const flat = mat.flat();
    const mx = Math.max(1, ...flat);
    return { days, cols, mat, mx };
  }, [orderRows]);

  const movers = useMemo(() => {
    return [...prodRows].sort((a, b) => (b.units30 - a.units30) || (b.stockVal - a.stockVal)).slice(0, 14);
  }, [prodRows]);

  const catTotals = useMemo(() => {
    const sums = [0, 0, 0, 0];
    buckets.forEach((b) => {
      b.catRev.forEach((v, idx) => {
        sums[idx] += v * curMeta.rate;
      });
    });
    return {
      labels: ['Women', 'Men', 'Acc.', 'Coll.'],
      data: sums,
    };
  }, [buckets, curMeta.rate]);

  const wire = useMemo(
    () =>
      buildLiveWire({
        products: props.products,
        orders: props.orders,
        customers: props.customers,
        waitlist: props.waitlist,
        collections: props.collections,
        categories: props.categories,
        discounts: props.discounts,
        auditLogs: props.auditLogs,
        settings: props.settings,
        liveVisitors,
        region,
        periodKind: props.periodKind,
        periodCount: props.periodCount,
        currency,
        controlOverview: props.controlOverview,
      }),
    [props, liveVisitors, region, currency]
  );

  const ctlServices = props.controlOverview?.services || [];

  return (
    <>
      <div className="t-sr">
        <span className="am">COMMAND OVERVIEW</span>
        <span className="dim">SCOPE</span>
        <b className="cy">{region}</b>
        <span className="dim">CUR</span>
        <b className="wh">{currency}</b>
        <span className="dim">LIVE 5M EVENTS</span>
        <b className="up">{fmtN(liveVisitors, 0)}</b>
        <span className="dim">CONTROL PLANE</span>
        <b className={props.controlOverview?.overallStatus === 'healthy' ? 'up' : 'am'}>
          {(props.controlOverview?.overallStatus || 'ACTIVE').toUpperCase()}
        </b>
      </div>
      <SubRibbon />
      <div className="t-body">
        <div
          className="t-gr"
          style={{
            gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
            gridTemplateRows: 'minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 0.9fr)',
          }}
        >
          <Panel
            title={`Net Revenue Per Day · 30D vs Prior 30D (${curMeta.sym})`}
            code="FA"
            onCodeClick={() => onNavigateFn('FA')}
            style={{ gridColumn: 'span 7' }}
            flush
          >
            <TerminalChart
              render={(w, h) =>
                lineChartSvg(w, h, {
                  labels: dailySeries.labels,
                  series: [
                    { name: 'Current 30D', data: dailySeries.curDays, area: true },
                    { name: 'Prior 30D', data: dailySeries.prevDays, c: '#9a9a9a', dash: true },
                  ],
                  fmt: (v) => `${curMeta.sym}${fmtN(v, 0)}`,
                  yf: (v) => `${curMeta.sym}${nf(v)}`,
                })
              }
            />
          </Panel>

          <Panel
            title="Catalog Velocity & Stock Valuation"
            code="PRD"
            onCodeClick={() => onNavigateFn('PRD')}
            style={{ gridColumn: 'span 5' }}
          >
            <SortableTable<ProductTerminalRow>
              defaultSortKey="units30"
              getRowId={(r) => r.id}
              onSelectRow={(r) => onEditProduct(r.raw)}
              rows={movers}
              cols={[
                { key: 'sku', label: 'SKU', sortVal: (r) => r.sku, render: (r) => <span className="am">{r.sku}</span> },
                { key: 'name', label: 'Style', sortVal: (r) => r.name, render: (r) => <span title={r.name}>{r.name.slice(0, 22)}</span> },
                { key: 'units30', label: '30D U', align: 'r', sortVal: (r) => r.units30, render: (r) => fmtN(r.units30, 0) },
                { key: 'stock', label: 'Stk', align: 'r', sortVal: (r) => r.stock, render: (r) => <span className={r.stock <= 4 ? 'dn' : ''}>{r.stock}</span> },
                {
                  key: 'sp',
                  label: '14D',
                  render: (r) => (
                    <span dangerouslySetInnerHTML={{ __html: sparkSvg(54, 14, r.spark14, '#ffa21f') }} />
                  ),
                },
              ]}
            />
          </Panel>

          <Panel
            title="Live Order Blotter"
            code="ORD"
            onCodeClick={() => onNavigateFn('ORD')}
            style={{ gridColumn: 'span 7' }}
          >
            <SortableTable<OrderTerminalRow>
              defaultSortKey="ts"
              getRowId={(r) => r.id}
              onSelectRow={() => onNavigateFn('ORD')}
              rows={orderRows.slice(0, 35)}
              emptyText="No orders recorded in this scope."
              cols={[
                {
                  key: 'ts',
                  label: 'Time',
                  sortVal: (r) => r.ts,
                  render: (r) => (
                    <span className="dim">
                      {r.ts ? new Date(r.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                    </span>
                  ),
                },
                { key: 'number', label: 'Order', sortVal: (r) => r.number, render: (r) => <span className="am">{r.number}</span> },
                { key: 'customerName', label: 'Client', sortVal: (r) => r.customerName, render: (r) => r.customerName.slice(0, 18) },
                { key: 'country', label: 'Ctry', sortVal: (r) => r.country, render: (r) => r.country },
                { key: 'qty', label: 'Qty', align: 'r', sortVal: (r) => r.qty, render: (r) => r.qty },
                { key: 'total', label: 'Total', align: 'r', sortVal: (r) => r.total, render: (r) => fmtMoney(r.total, currency) },
                {
                  key: 'status',
                  label: 'Status',
                  sortVal: (r) => r.status,
                  render: (r) => <span className={ORDER_STATUS_COLOR[r.status] || ''}>{r.status.toUpperCase()}</span>,
                },
              ]}
            />
          </Panel>

          <Panel
            title="Live Alerts & Audit Telemetry"
            code="SEC"
            onCodeClick={() => onNavigateFn('SEC')}
            style={{ gridColumn: 'span 5' }}
          >
            <ul className="t-lst">
              {wire.length === 0 ? (
                <li className="dim">All queues nominal. Zero active alerts.</li>
              ) : (
                wire.slice(0, 14).map((w, idx) => (
                  <li
                    key={idx}
                    onClick={() => w.view && onNavigateFn(w.view as TerminalFnCode)}
                    style={{ cursor: w.view ? 'pointer' : 'default' }}
                  >
                    <span className={w.severity}>●</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.text}</span>
                    <time>{new Date(w.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                  </li>
                ))
              )}
            </ul>
          </Panel>

          <Panel
            title={`Category Revenue Mix (${curMeta.sym})`}
            code="DES"
            onCodeClick={() => onNavigateFn('DES')}
            style={{ gridColumn: 'span 4' }}
            flush
          >
            <TerminalChart
              render={(w, h) =>
                barChartSvg(w, h, {
                  labels: catTotals.labels,
                  series: [{ name: 'Revenue', data: catTotals.data }],
                  fmt: (v) => `${curMeta.sym}${fmtN(v, 0)}`,
                  yf: (v) => `${curMeta.sym}${nf(v)}`,
                })
              }
            />
          </Panel>

          <Panel title="Order Frequency · Weekday × 2H" code="ORD" onCodeClick={() => onNavigateFn('ORD')} style={{ gridColumn: 'span 4' }}>
            <div
              className="t-hm"
              style={{ gridTemplateColumns: `34px repeat(${heatData.cols.length}, minmax(0, 1fr))` }}
            >
              <i />
              {heatData.cols.map((c) => (
                <b key={c}>{c}</b>
              ))}
              {heatData.days.map((day, di) => (
                <React.Fragment key={day}>
                  <b style={{ textAlign: 'left' }}>{day}</b>
                  {heatData.mat[di].map((val, ci) => {
                    const alpha = val > 0 ? 0.18 + (val / heatData.mx) * 0.78 : 0.05;
                    return (
                      <span
                        key={ci}
                        style={{
                          background: `rgba(255, 162, 31, ${alpha.toFixed(2)})`,
                          color: alpha > 0.55 ? '#000' : '#fff',
                        }}
                        data-tip={escHtml(`<b>${day} · ${heatData.cols[ci]}:00</b><br>${val} orders`)}
                      >
                        {val > 0 ? val : ''}
                      </span>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </Panel>

          <Panel
            title="Control Plane Service Matrix"
            code="CTL"
            onCodeClick={() => onNavigateFn('CTL')}
            style={{ gridColumn: 'span 4' }}
          >
            {ctlServices.length > 0 ? (
              <table className="t-dt">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Status</th>
                    <th className="r">Latency</th>
                    <th className="r">24H</th>
                  </tr>
                </thead>
                <tbody>
                  {ctlServices.slice(0, 8).map((sv) => (
                    <tr key={sv.id} onClick={() => onNavigateFn('CTL')} style={{ cursor: 'pointer' }}>
                      <td>{sv.name}</td>
                      <td className={sv.status === 'healthy' ? 'up' : sv.status === 'degraded' ? 'yl' : 'dn'}>
                        {sv.status.toUpperCase()}
                      </td>
                      <td className="r dim">{sv.latencyMs != null ? `${Math.round(sv.latencyMs)}ms` : '—'}</td>
                      <td className="r">{sv.uptime24h != null ? `${fmtN(sv.uptime24h, 2)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <KvGrid
                rows={[
                  ['Products Indexed', fmtN(props.products.length, 0)],
                  ['Collections Live', fmtN(props.collections.filter((c) => c.status === 'live').length, 0)],
                  ['Client Directory', fmtN(props.customers.length, 0)],
                  ['Waitlist Demand', fmtN(props.waitlist.length, 0)],
                  ['Audit Trail Events', fmtN(props.auditLogs.length, 0)],
                  ['Auto-Lock Window', props.autoLockMinutes === 0 ? 'OFF' : `${props.autoLockMinutes}m`],
                ]}
              />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
};

/* --------------------------------------------------------------------------
   2) FA — Financial Analysis General Ledger
   -------------------------------------------------------------------------- */
const FA_TABS = ['1) Key Stats', '2) P&L', '3) Stock & Cat', '4) Fulfilment', '5) Ratios', '6) Segments', '7) Telemetry', '8) Custom'];

const FaScreen: React.FC<TerminalScreensProps & { buckets: PeriodBucket[] }> = (props) => {
  const {
    buckets,
    periodKind,
    onChangePeriodKind,
    periodCount,
    onChangePeriodCount,
    currency,
    onChangeCurrency,
    region,
    showPctCols,
    onPlotMetric,
  } = props;

  const [tab, setTab] = useState(1);
  const [sub, setSub] = useState(11);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [customIds, setCustomIds] = useState<string[]>(['rev', 'orders', 'aov', 'units', 'inv_val', 'low_sku']);
  const faScrollRef = useRef<HTMLDivElement>(null);

  const wsInput = useMemo(
    () => ({
      products: props.products,
      orders: props.orders,
      customers: props.customers,
      waitlist: props.waitlist,
      collections: props.collections,
      categories: props.categories,
      discounts: props.discounts,
      auditLogs: props.auditLogs,
      settings: props.settings,
      liveVisitors: props.liveVisitors,
      region,
      periodKind,
      periodCount,
      currency,
      controlOverview: props.controlOverview,
    }),
    [props, region, periodKind, periodCount, currency]
  );

  const catalogRows = useMemo(() => {
    const map = new Map<string, LedgerRow>();
    [1, 2, 3, 4, 5, 6, 7].forEach((t) => {
      getFaLedgerRows(t, 11, wsInput).forEach((r) => {
        if (!r.nov && !map.has(r.id)) map.set(r.id, r);
      });
    });
    return map;
  }, [wsInput]);

  const rows = useMemo(() => {
    if (tab === 8) {
      return customIds
        .map((id) => catalogRows.get(id))
        .filter((r): r is LedgerRow => Boolean(r))
        .map((r) => ({ ...r, lvl: 0 as const, grp: true, kids: false, p100: false, of: undefined }));
    }
    return getFaLedgerRows(tab, sub, wsInput);
  }, [tab, sub, customIds, catalogRows, wsInput]);

  const rowMap = useMemo(() => {
    const m = new Map<string, LedgerRow>();
    rows.forEach((r) => m.set(r.id, r));
    return m;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const out: LedgerRow[] = [];
    let skipLvl = -1;
    for (const r of rows) {
      if (skipLvl >= 0) {
        if (r.lvl > skipLvl) continue;
        skipLvl = -1;
      }
      const isClosed = Boolean(r.kids && (collapsed[r.id] !== undefined ? collapsed[r.id] : r.closed));
      if (isClosed) skipLvl = r.lvl;
      out.push(r);
    }
    return out;
  }, [rows, collapsed]);

  const span = showPctCols ? 2 : 1;
  const periodOptions = periodKind === 'Annuals' ? [3, 4, 6, 8] : periodKind === 'Quarterly' ? [4, 8, 12, 16] : [6, 12, 18, 24];

  const handleToggle = (id: string, defaultClosed?: boolean) => {
    setCollapsed((prev) => ({
      ...prev,
      [id]: !(prev[id] !== undefined ? prev[id] : Boolean(defaultClosed)),
    }));
  };

  return (
    <>
      <div className="t-sr">
        <span className="dim">39)</span>
        <b className="t-adj">ADJ</b>
        <span className="cy">Zejesh House / {regionBadgeId(region)}</span>
        <span>IFRS <i className="t-qm">?</i></span>
        <span className="am">Periods</span>
        <select className="t-ob" value={periodCount} onChange={(e) => onChangePeriodCount(Number(e.target.value))}>
          {periodOptions.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <select className="t-ob w" value={periodKind} onChange={(e) => onChangePeriodKind(e.target.value as TerminalPeriodKind)}>
          {(['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annuals'] as TerminalPeriodKind[]).map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <span className="am">Cur</span>
        <select className="t-ob" value={currency} onChange={(e) => onChangeCurrency(e.target.value as TerminalCurrency)}>
          {(['EUR', 'USD', 'GBP'] as TerminalCurrency[]).map((c) => (
            <option key={c} value={c}>FRC ({c})</option>
          ))}
        </select>
      </div>

      <TrapezoidTabs tabs={FA_TABS} active={tab} onSelect={setTab} />
      {tab === 6 ? (
        <SubRibbon
          items={[
            { id: 11, label: '11) By Category' },
            { id: 12, label: '12) By Region Scope' },
          ]}
          active={sub}
          onSelect={setSub}
        />
      ) : (
        <SubRibbon />
      )}

      <div className="t-body">
        <div className="t-fa" ref={faScrollRef}>
          {tab === 8 && (
            <div style={{ padding: '4px 8px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', left: 0, background: '#070707', borderBottom: '1px solid #333' }}>
              <span className="am">Add Metric</span>
              <select
                className="t-ob w"
                value=""
                onChange={(e) => {
                  if (e.target.value && !customIds.includes(e.target.value)) {
                    setCustomIds((prev) => [...prev, e.target.value]);
                  }
                }}
              >
                <option value="">Select series...</option>
                {Array.from(catalogRows.values())
                  .filter((r) => !customIds.includes(r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
              </select>
              {customIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCustomIds((prev) => prev.filter((x) => x !== id))}
                  style={{ border: '1px solid #5a3a00', padding: '1px 8px', color: '#ffa21f', background: '#140e00', cursor: 'pointer', fontSize: 12 }}
                >
                  {catalogRows.get(id)?.label || id} ×
                </button>
              ))}
            </div>
          )}

          <table>
            <thead>
              <tr>
                <th className="c1" style={{ width: 30 }} />
                <th className="c2">In {currency} ({periodKind})</th>
                {buckets.map((b) => (
                  <th key={b.id} colSpan={span}>{b.label}</th>
                ))}
              </tr>
              <tr className="h2">
                <th className="c1" />
                <th className="c2">Period Ending</th>
                {buckets.map((b) => (
                  <th key={b.id} colSpan={span}>{b.endLabel}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const isClosed = Boolean(r.kids && (collapsed[r.id] !== undefined ? collapsed[r.id] : r.closed));
                const vals = buckets.map((b) => r.fn(b));
                return (
                  <tr key={r.id} className={r.grp ? 'g' : ''}>
                    <td className="ic">
                      {!r.nov && (
                        <button
                          type="button"
                          className="ib"
                          title="Plot Series"
                          onClick={() =>
                            onPlotMetric(
                              `${r.label} (${periodKind})`,
                              buckets.map((b) => b.label),
                              vals.map((v) =>
                                v == null ? 0 : r.fmt === 'cur' ? v * CURRENCY_META[currency].rate : v
                              )
                            )
                          }
                        >
                          <MiniBarIcon />
                        </button>
                      )}
                    </td>
                    <td className="lb" style={{ paddingLeft: 8 + r.lvl * 16 }}>
                      {r.kids ? (
                        <button
                          type="button"
                          className="tg"
                          onClick={() => handleToggle(r.id, r.closed)}
                        >
                          {isClosed ? '▸' : '▾'}
                        </button>
                      ) : (
                        <span className="tg" />
                      )}
                      {r.label}
                    </td>
                    {vals.map((v, i) => {
                      let pctStr = '';
                      if (showPctCols && v != null) {
                        if (r.p100) pctStr = '100.0%';
                        else if (r.of && rowMap.has(r.of)) {
                          const base = rowMap.get(r.of)!.fn(buckets[i]);
                          if (base && base !== 0) pctStr = `${fmtN((v / base) * 100, 1)}%`;
                        }
                      }
                      return (
                        <React.Fragment key={buckets[i].id}>
                          <td className="v">{formatLedgerValue(v, r.fmt, currency)}</td>
                          {showPctCols && <td className="pc">{pctStr}</td>}
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="t-fanav">
          <button type="button" onClick={() => faScrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' })}>&lt;&lt;</button>
          <button type="button" onClick={() => faScrollRef.current?.scrollBy({ left: -360, behavior: 'smooth' })}>&lt;</button>
          <button type="button" onClick={() => faScrollRef.current?.scrollBy({ left: 360, behavior: 'smooth' })}>&gt;</button>
          <button type="button" onClick={() => faScrollRef.current && faScrollRef.current.scrollTo({ left: faScrollRef.current.scrollWidth, behavior: 'smooth' })}>&gt;&gt;</button>
          <span className="dim" style={{ fontSize: 12 }}>
            Click ▾ ▸ to collapse/expand tree nodes · click blue chart icon on any row to plot period distribution
          </span>
        </div>
      </div>
    </>
  );
};

/* --------------------------------------------------------------------------
   3) DES — House & Telemetry Description
   -------------------------------------------------------------------------- */
const DES_TABS = ['1) Profile', '2) Commerce Basis', '3) Ratios', '4) Period Splits', '5) Category Matrix'];

const DesScreen: React.FC<TerminalScreensProps & { buckets: PeriodBucket[]; prodRows: ProductTerminalRow[]; orderRows: OrderTerminalRow[] }> = (props) => {
  const [tab, setTab] = useState(1);
  const { buckets, prodRows, orderRows, currency, settings, products, collections, categories, customers } = props;
  const curMeta = CURRENCY_META[currency];
  const totRev = buckets.reduce((s, b) => s + b.netRevenue, 0);
  const totOrders = buckets.reduce((s, b) => s + b.orders, 0);
  const totStock = prodRows.reduce((s, r) => s + r.stock, 0);
  const totVal = prodRows.reduce((s, r) => s + r.stockVal, 0);
  const latest = buckets[buckets.length - 1];

  return (
    <>
      <div className="t-sr">
        <span className="am">HOUSE DESCRIPTION &amp; LEDGER BASIS</span>
        <span className="dim">ENTITY</span>
        <b className="cy">{settings?.storeInfo?.name || 'ZEJESH HOUSE'}</b>
        <span className="dim">VAT BASE</span>
        <b className="wh">{settings?.vatRate ?? 24}%</b>
      </div>
      <TrapezoidTabs tabs={DES_TABS} active={tab} onSelect={setTab} />
      <SubRibbon />
      <div className="t-body">
        {tab === 1 && (
          <div className="t-gr" style={{ gridTemplateColumns: '1.4fr 1fr', gridTemplateRows: 'auto minmax(0,1fr) minmax(0,0.9fr)' }}>
            <Panel title="House Profile" style={{ gridColumn: '1/2' }}>
              <div className="t-desc">
                <h2>ZEJESH // HOUSE OF MODERN CLOTHING</h2>
                Monochrome numbered atelier garments &amp; leather goods operated on live Supabase PostgreSQL + BOS transactional core. All analytics, ledger trees, order books and risk vectors derive strictly from live store records without synthetic estimates.
                <br />
                <small>Contact: {settings?.storeInfo?.email || '—'} · Address: {settings?.storeInfo?.address || '—'}</small>
              </div>
            </Panel>
            <Panel title="Structural Summary" code="CIX" style={{ gridColumn: '2/3', gridRow: '1/3' }}>
              <KvGrid
                rows={[
                  ['Operator Email', settings?.storeInfo?.email || '—'],
                  ['Dispatch Desk', settings?.storeInfo?.dispatchEmail || '—'],
                  ['Active Styles', fmtN(products.length, 0)],
                  ['Collections Published', fmtN(collections.length, 0)],
                  ['Categories Configured', fmtN(categories.length, 0)],
                  ['Registered Clients', fmtN(customers.length, 0)],
                  ['Total Physical Units', fmtN(totStock, 0)],
                  ['Catalog Retail Exposure', fmtMoney(totVal, currency)],
                ]}
              />
            </Panel>
            <Panel title={`Period Net Revenue Curve (${curMeta.sym})`} code="GP" onCodeClick={() => props.onNavigateFn('FA')} style={{ gridColumn: '1/2' }} flush>
              <TerminalChart
                render={(w, h) =>
                  lineChartSvg(w, h, {
                    labels: buckets.map((b) => b.label),
                    series: [
                      { name: 'Net Revenue', data: buckets.map((b) => b.netRevenue * curMeta.rate), area: true },
                      { name: 'Orders × 100', data: buckets.map((b) => b.orders * 100), c: '#42c6ff' },
                    ],
                    fmt: (v) => fmtN(v, 0),
                  })
                }
              />
            </Panel>
            <Panel title="Key Ledger Aggregates" style={{ gridColumn: '1/2', gridRow: '3' }}>
              <KvGrid
                rows={[
                  ['Window Net Revenue', fmtMoney(totRev, currency)],
                  ['Window Settled Orders', fmtN(totOrders, 0)],
                  ['Average Order Value', totOrders > 0 ? fmtMoney(totRev / totOrders, currency) : '—'],
                  ['Low-Stock Alert Threshold', `${settings?.lowStockThreshold ?? 4} units`],
                ]}
              />
            </Panel>
            <Panel title="Latest Closed/Active Period" code="EE" style={{ gridColumn: '2/3', gridRow: '3' }}>
              <KvGrid
                rows={[
                  ['Period Label', latest?.label || '—'],
                  ['Period Net Revenue', latest ? fmtMoney(latest.netRevenue, currency) : '—'],
                  ['Period Orders', latest ? fmtN(latest.orders, 0) : '—'],
                  ['Return Share', latest ? `${fmtN(latest.returnRate, 1)}%` : '—'],
                ]}
              />
            </Panel>
          </div>
        )}

        {tab === 2 && (
          <div className="t-gr" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Panel title="Accounting & Tax Basis" code="ISS">
              <KvGrid
                rows={[
                  ['Reporting Currency', currency],
                  ['Base Store Currency', settings?.storeInfo?.currency || 'EUR'],
                  ['Default VAT Rate', `${settings?.vatRate ?? 24}%`],
                  ['Complimentary Shipping Over', fmtMoney(settings?.freeShippingThreshold ?? 100, currency)],
                  ['Low Stock Alert Line', `${settings?.lowStockThreshold ?? 4} units`],
                  ['Shipping Tiers Defined', fmtN(settings?.shippingRates?.length || 0, 0)],
                  ['Live Orders Loaded', fmtN(orderRows.length, 0)],
                ]}
              />
            </Panel>
            <Panel title="Active Drops & Collections Calendar" code="CAL">
              <ul className="t-lst">
                {collections.length === 0 ? (
                  <li className="dim">No collections defined.</li>
                ) : (
                  collections.map((c) => (
                    <li key={c.id}>
                      <span className="am">{(c.status || 'draft').toUpperCase()}</span>
                      <span>{typeof c.name === 'string' ? c.name : c.name?.en || c.name?.fi}</span>
                      <time>{c.startAt ? c.startAt.slice(0, 10) : c.type.toUpperCase()}</time>
                    </li>
                  ))
                )}
              </ul>
            </Panel>
          </div>
        )}

        {tab === 3 && (
          <div className="t-gr">
            <Panel title="Period-by-Period Ratio Matrix" code="FA">
              <table className="t-dt">
                <thead>
                  <tr>
                    <th>Ratio</th>
                    {buckets.map((b) => (
                      <th key={b.id} className="r">{b.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Net Revenue</td>
                    {buckets.map((b) => <td key={b.id} className="r">{fmtMoney(b.netRevenue, currency)}</td>)}
                  </tr>
                  <tr>
                    <td>Orders</td>
                    {buckets.map((b) => <td key={b.id} className="r">{fmtN(b.orders, 0)}</td>)}
                  </tr>
                  <tr>
                    <td>AOV</td>
                    {buckets.map((b) => <td key={b.id} className="r">{fmtMoney(b.aov, currency)}</td>)}
                  </tr>
                  <tr>
                    <td>Units / Order</td>
                    {buckets.map((b) => <td key={b.id} className="r">{b.orders > 0 ? `${fmtN(b.units / b.orders, 2)}x` : '—'}</td>)}
                  </tr>
                  <tr>
                    <td>Return Rate</td>
                    {buckets.map((b) => <td key={b.id} className="r">{fmtN(b.returnRate, 1)}%</td>)}
                  </tr>
                  <tr>
                    <td>Delivery Completion</td>
                    {buckets.map((b) => <td key={b.id} className="r">{b.orders > 0 ? `${fmtN((b.deliveredCount / b.orders) * 100, 1)}%` : '—'}</td>)}
                  </tr>
                </tbody>
              </table>
            </Panel>
          </div>
        )}

        {tab === 4 && (
          <div className="t-gr" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
            <Panel title={`Revenue & Units Split (${curMeta.sym})`} code="BQ" flush>
              <TerminalChart
                render={(w, h) =>
                  barChartSvg(w, h, {
                    labels: buckets.map((b) => b.label),
                    series: [
                      { name: 'Net Revenue', data: buckets.map((b) => b.netRevenue * curMeta.rate) },
                      { name: 'VAT', data: buckets.map((b) => b.vat * curMeta.rate), c: '#42c6ff' },
                    ],
                  })
                }
              />
            </Panel>
            <Panel title="Period Breakdown Table">
              <table className="t-dt">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th className="r">Net Rev</th>
                    <th className="r">VAT</th>
                    <th className="r">Orders</th>
                    <th className="r">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr key={b.id}>
                      <td>{b.label}</td>
                      <td className="r">{fmtMoney(b.netRevenue, currency)}</td>
                      <td className="r">{fmtMoney(b.vat, currency)}</td>
                      <td className="r">{fmtN(b.orders, 0)}</td>
                      <td className="r">{fmtN(b.units, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        )}

        {tab === 5 && (
          <div className="t-gr">
            <Panel title="Category Exposure & Inventory Footprint" code="CAT">
              <SortableTable
                defaultSortKey="stockVal"
                getRowId={(r: { key: string }) => r.key}
                rows={['naiset', 'miehet', 'asusteet', 'kokoelmat'].map((k, idx) => {
                  const catProds = prodRows.filter((p) => p.catKey === k);
                  const rev = buckets.reduce((s, b) => s + b.catRev[idx], 0);
                  const units = buckets.reduce((s, b) => s + b.catUnits[idx], 0);
                  const stockU = catProds.reduce((s, p) => s + p.stock, 0);
                  const stockVal = catProds.reduce((s, p) => s + p.stockVal, 0);
                  return { key: k, name: CAT_LABELS[k], skus: catProds.length, stockU, stockVal, rev, units };
                })}
                cols={[
                  { key: 'name', label: 'Category', render: (r) => <span className="am">{r.name}</span> },
                  { key: 'skus', label: 'SKUs', align: 'r', sortVal: (r) => r.skus, render: (r) => r.skus },
                  { key: 'stockU', label: 'On Hand U', align: 'r', sortVal: (r) => r.stockU, render: (r) => fmtN(r.stockU, 0) },
                  { key: 'stockVal', label: 'Stock Retail Value', align: 'r', sortVal: (r) => r.stockVal, render: (r) => fmtMoney(r.stockVal, currency) },
                  { key: 'units', label: 'Units Sold', align: 'r', sortVal: (r) => r.units, render: (r) => fmtN(r.units, 0) },
                  { key: 'rev', label: 'Window Revenue', align: 'r', sortVal: (r) => r.rev, render: (r) => fmtMoney(r.rev, currency) },
                ]}
              />
            </Panel>
          </div>
        )}
      </div>
    </>
  );
};

/* --------------------------------------------------------------------------
   4) RSK — Quantitative Fulfilment Risk & Control Model
   -------------------------------------------------------------------------- */
const RskScreen: React.FC<TerminalScreensProps & { buckets: PeriodBucket[]; orderRows: OrderTerminalRow[] }> = (props) => {
  const { buckets, orderRows, products, controlOverview, onNavigateFn } = props;
  const risk = useMemo(
    () =>
      computeRiskAssessment({
        products,
        orders: props.orders,
        customers: props.customers,
        waitlist: props.waitlist,
        collections: props.collections,
        categories: props.categories,
        discounts: props.discounts,
        auditLogs: props.auditLogs,
        settings: props.settings,
        liveVisitors: props.liveVisitors,
        region: props.region,
        periodKind: props.periodKind,
        periodCount: props.periodCount,
        currency: props.currency,
        controlOverview,
      }),
    [props, products, controlOverview]
  );

  // Order SLA latency buckets (hours since creation for pending/open orders, or processing window)
  const ageBuckets = useMemo(() => {
    const bins = Array(8).fill(0);
    orderRows.forEach((o) => {
      const idx = Math.min(7, Math.floor(o.ageHours / 12));
      bins[idx] += 1;
    });
    return { labels: ['0-12h', '12-24h', '24-36h', '36-48h', '48-60h', '60-72h', '72-84h', '84h+'], bins };
  }, [orderRows]);

  const modelInputs = [
    { name: 'Out-of-Stock SKU Ratio', val: `${fmtN(risk.oosPct, 1)}%`, count: `${risk.oosCount}/${products.length}`, pct: risk.oosPct },
    { name: 'Low-Stock Critical Ratio (<=4)', val: `${fmtN(risk.lowPct, 1)}%`, count: `${risk.lowCount}/${products.length}`, pct: risk.lowPct },
    { name: 'Overdue Open Orders (>24h)', val: `${fmtN(risk.overduePct, 1)}%`, count: `${risk.overdueOrders}/${risk.pendingCount}`, pct: risk.overduePct },
    { name: 'Refund & Cancel Incidence', val: `${fmtN(risk.refundPct, 1)}%`, count: `${risk.refundedCount}/${props.orders.length}`, pct: risk.refundPct },
    { name: 'Control Plane Probes Failing', val: String(controlOverview?.failingProbes || 0), count: controlOverview?.overallStatus || 'OK', pct: Math.min(100, risk.probePenalty) },
  ];

  return (
    <>
      <div className="t-sr">
        <span className="am">FULFILMENT &amp; INFRASTRUCTURE RISK MODEL</span>
        <span className="dim">COMPOSITE INDEX</span>
        <b className={risk.compositeRisk > 35 ? 'dn' : risk.compositeRisk > 15 ? 'am' : 'up'}>
          {fmtN(risk.compositeRisk, 2)}%
        </b>
        <span className="dim">ACTIVE INCIDENTS</span>
        <b className={controlOverview?.activeIncidents ? 'dn' : 'up'}>{controlOverview?.activeIncidents || 0}</b>
      </div>
      <SubRibbon
        items={[
          { id: 1, label: '1) Quantitative Risk Desk' },
          { id: 2, label: '2) Live System Health Console' },
        ]}
        active={1}
        onSelect={(id) => {
          if (id === 2) onNavigateFn('CTL');
        }}
      />
      <div className="t-body">
        <div className="t-gr" style={{ gridTemplateColumns: '1fr 1.4fr 1fr', gridTemplateRows: 'minmax(0,1.1fr) minmax(0,1fr)' }}>
          <Panel title="Composite Operational Risk Score" code="CTL" onCodeClick={() => onNavigateFn('CTL')} flush>
            <div className="t-big">{fmtN(risk.compositeRisk, 2)}%</div>
            <div className="dim" style={{ padding: '0 12px', fontSize: 11.5 }}>
              Weighted across stock depletion, SLA backlog, refunds &amp; probes
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 72 }}>
              <TerminalChart render={(w, h) => gaugeSvg(w, h, risk.compositeRisk, 100, `${fmtN(risk.compositeRisk, 1)}%`, 'composite operational risk index')} />
            </div>
          </Panel>

          <Panel title="Return Rate & Order Trend by Period" code="FA" onCodeClick={() => onNavigateFn('FA')} flush>
            <TerminalChart
              render={(w, h) =>
                lineChartSvg(w, h, {
                  labels: buckets.map((b) => b.label),
                  series: [
                    { name: 'Return Rate %', data: buckets.map((b) => b.returnRate), area: true, c: '#ff4b43' },
                    { name: 'Pending Orders', data: buckets.map((b) => b.pendingCount), c: '#42c6ff' },
                  ],
                  fmt: (v) => fmtN(v, 1),
                })
              }
            />
          </Panel>

          <Panel title="Order Age Distribution (Hours)" code="ORD" onCodeClick={() => onNavigateFn('ORD')} flush>
            <TerminalChart
              render={(w, h) =>
                barChartSvg(w, h, {
                  labels: ageBuckets.labels,
                  series: [{ name: 'Orders', data: ageBuckets.bins }],
                })
              }
            />
          </Panel>

          <Panel title="Quantitative Risk Inputs" code="MI">
            <SortableTable
              defaultSortKey="pct"
              getRowId={(r: { name: string }) => r.name}
              rows={modelInputs}
              cols={[
                { key: 'name', label: 'Vector', render: (r) => r.name },
                { key: 'count', label: 'Count', align: 'r', render: (r) => <span className="dim">{r.count}</span> },
                { key: 'val', label: 'Rate', align: 'r', render: (r) => r.val },
                {
                  key: 'pct',
                  label: 'Exposure',
                  align: 'r',
                  sortVal: (r) => r.pct,
                  render: (r) => (
                    <>
                      <PctBar value={r.pct} color={r.pct > 25 ? '#ff4b43' : '#ffa21f'} />
                      {fmtN(r.pct, 0)}%
                    </>
                  ),
                },
              ]}
            />
          </Panel>

          <Panel title="Low / Depleted Styles Requiring Action" code="INV" onCodeClick={() => onNavigateFn('INV')}>
            <SortableTable
              defaultSortKey="stock"
              defaultDir={1}
              getRowId={(r: Product) => r.id}
              rows={products.filter((p) => getProductTotalStock(p) <= 4)}
              emptyText="No SKUs below reorder threshold."
              cols={[
                { key: 'nr', label: 'SKU', render: (p) => <span className="am">{p.nr || p.plateNumber}</span> },
                { key: 'name', label: 'Style', render: (p) => p.name.en.slice(0, 20) },
                { key: 'stock', label: 'Stk', align: 'r', sortVal: (p) => getProductTotalStock(p), render: (p) => <span className="dn">{getProductTotalStock(p)}</span> },
              ]}
            />
          </Panel>

          <Panel title="Active Control Plane Services" code="CTL" onCodeClick={() => onNavigateFn('CTL')}>
            <ul className="t-lst">
              {(controlOverview?.services || []).length === 0 ? (
                <li className="dim">Open CTL &gt; to execute live service probes.</li>
              ) : (
                controlOverview!.services!.map((sv) => (
                  <li key={sv.id}>
                    <span className={sv.status === 'healthy' ? 'up' : 'dn'}>●</span>
                    <span>{sv.name}</span>
                    <time>{sv.status.toUpperCase()}</time>
                  </li>
                ))
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
};

/* --------------------------------------------------------------------------
   5) ORD — Order Blotter + Full Order Book Manager
   -------------------------------------------------------------------------- */
const OrdScreen: React.FC<TerminalScreensProps & { orderRows: OrderTerminalRow[] }> = (props) => {
  const { orderRows, currency, orders, onNavigateLegacyView, requestedSubTab, onSubTabChange } = props;
  const [subTab, setSubTab] = useTerminalSubTab('ORD', requestedSubTab, onSubTabChange);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(orderRows[0]?.id || null);

  const selected = orderRows.find((r) => r.id === selectedOrderId) || orderRows[0] || null;
  const openCount = orderRows.filter((r) => ['new', 'paid', 'packed'].includes(r.status)).length;
  const shippedCount = orderRows.filter((r) => r.status === 'shipped').length;
  const problemCount = orderRows.filter((r) => ['refunded', 'cancelled'].includes(r.status)).length;
  const totalVol = orderRows.filter((r) => !['cancelled', 'refunded'].includes(r.status)).reduce((s, r) => s + r.total, 0);

  const statuses = ['new', 'paid', 'packed', 'shipped', 'delivered', 'refunded', 'cancelled'];
  const statusCounts = statuses.map((s) => orderRows.filter((r) => r.status === s).length);

  return (
    <>
      <div className="t-sr">
        <span className="am">ORDER BLOTTER</span>
        <span className="dim">Open</span><b className="wh">{openCount}</b>
        <span className="dim">Shipped</span><b className="wh">{shippedCount}</b>
        <span className="dim">Problems</span><b className="dn">{problemCount}</b>
        <span className="dim">Gross Scoped Value</span><b className="up">{fmtMoney(totalVol, currency)}</b>
      </div>
      <SubRibbon
        items={[
          { id: 1, label: '11) Live Order Blotter' },
          { id: 2, label: '12) Order Book Manager [Fulfilment CRUD]' },
        ]}
        active={subTab}
        onSelect={setSubTab}
      />
      <div className="t-body">
        {subTab === 2 ? (
          <div className="t-legacy-wrap">
            <div className="admin-scope">
              <AdminOrdersView orders={orders} onRefresh={() => onNavigateLegacyView('orders')} />
            </div>
          </div>
        ) : (
          <div className="t-gr" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(0,1.15fr)', gridTemplateRows: 'minmax(0,1.3fr) minmax(0,0.75fr)' }}>
            <Panel title="All Orders · Click Row for Detail Inspector" code="MGR" onCodeClick={() => setSubTab(2)} style={{ gridRow: '1/3' }}>
              <SortableTable<OrderTerminalRow>
                defaultSortKey="ts"
                selectedId={selected?.id || null}
                getRowId={(r) => r.id}
                onSelectRow={(r) => setSelectedOrderId(r.id)}
                rows={orderRows}
                emptyText="No orders present in scoped region."
                cols={[
                  {
                    key: 'ts',
                    label: 'Timestamp',
                    sortVal: (r) => r.ts,
                    render: (r) => <span className="dim">{r.ts ? new Date(r.ts).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span>,
                  },
                  { key: 'number', label: 'Order', sortVal: (r) => r.number, render: (r) => <span className="am">{r.number}</span> },
                  { key: 'customerName', label: 'Client', sortVal: (r) => r.customerName, render: (r) => r.customerName },
                  { key: 'country', label: 'Ctry', sortVal: (r) => r.country, render: (r) => r.country },
                  { key: 'qty', label: 'Qty', align: 'r', sortVal: (r) => r.qty, render: (r) => r.qty },
                  { key: 'channel', label: 'Method', sortVal: (r) => r.channel, render: (r) => r.channel },
                  { key: 'tracking', label: 'Track', render: (r) => <span className="dim">{r.tracking}</span> },
                  { key: 'ageHours', label: 'Age h', align: 'r', sortVal: (r) => r.ageHours, render: (r) => <span className={r.ageHours > 24 && ['new', 'paid', 'packed'].includes(r.status) ? 'dn' : ''}>{fmtN(r.ageHours, 1)}</span> },
                  { key: 'total', label: 'Total', align: 'r', sortVal: (r) => r.total, render: (r) => fmtMoney(r.total, currency) },
                  { key: 'status', label: 'Status', sortVal: (r) => r.status, render: (r) => <span className={ORDER_STATUS_COLOR[r.status] || ''}>{r.status.toUpperCase()}</span> },
                ]}
              />
            </Panel>

            <Panel title="Selected Order Detail" code="CRUD" onCodeClick={() => setSubTab(2)}>
              {selected ? (
                <KvGrid
                  rows={[
                    ['Order Ref', <span className="am">{selected.number}</span>],
                    ['Client', selected.customerName],
                    ['Email', selected.customerEmail],
                    ['Country', selected.country],
                    ['Shipping Method', selected.channel],
                    ['Tracking', selected.tracking],
                    ['Status', <span className={ORDER_STATUS_COLOR[selected.status] || ''}>{selected.status.toUpperCase()}</span>],
                    ['Subtotal', fmtMoney(selected.subtotal, currency)],
                    ['VAT', fmtMoney(selected.vat, currency)],
                    ['Total', <b className="wh">{fmtMoney(selected.total, currency)}</b>],
                    ...(selected.raw.items || []).slice(0, 4).map((it): [string, React.ReactNode] => [
                      `${it.productName} (${it.size}) ×${it.quantity}`,
                      fmtMoney(it.price * it.quantity, currency),
                    ]),
                  ]}
                />
              ) : (
                <div className="dim" style={{ padding: 12 }}>Select any order row to inspect line items &amp; settlement breakdown.</div>
              )}
            </Panel>

            <Panel title="Order Status Distribution" code="MIX" flush>
              <TerminalChart
                render={(w, h) =>
                  barChartSvg(w, h, {
                    labels: statuses.map((s) => s.slice(0, 4).toUpperCase()),
                    series: [{ name: 'Orders', data: statusCounts }],
                  })
                }
              />
            </Panel>
          </div>
        )}
      </div>
    </>
  );
};

/* --------------------------------------------------------------------------
   6) PRD — Product Analysis + Archive / Collections / Categories / Media CRUD
   -------------------------------------------------------------------------- */
const PRD_SUBS = [
  { id: 1, label: '11) Style Matrix & Scatter' },
  { id: 2, label: '12) Products & Archive [CRUD]' },
  { id: 3, label: '13) Collections & Drops' },
  { id: 4, label: '14) Categories' },
  { id: 5, label: '15) Media Vault' },
];

const PrdScreen: React.FC<TerminalScreensProps & { prodRows: ProductTerminalRow[] }> = (props) => {
  const {
    prodRows,
    currency,
    products,
    collections,
    categories,
    onEditProduct,
    onCreateProduct,
    onViewProductInStore,
    onRefreshProducts,
    onDeleteProduct,
    onDeleteProducts,
    requestedSubTab,
    onSubTabChange,
  } = props;
  const [subTab, setSubTab] = useTerminalSubTab('PRD', requestedSubTab, onSubTabChange);
  const totalUnits = prodRows.reduce((s, p) => s + p.stock, 0);
  const totalStockVal = prodRows.reduce((s, p) => s + p.stockVal, 0);

  return (
    <>
      <div className="t-sr">
        <span className="am">PRODUCT &amp; CATALOG TERMINAL</span>
        <span className="dim">SKUs</span><b className="wh">{prodRows.length}</b>
        <span className="dim">On Hand Units</span><b className="wh">{fmtN(totalUnits, 0)}</b>
        <span className="dim">Catalog Retail Exposure</span><b className="am">{fmtMoney(totalStockVal, currency)}</b>
        <button
          type="button"
          className="t-ob"
          style={{ marginLeft: 'auto', fontWeight: 600 }}
          onClick={onCreateProduct}
        >
          + NEW STYLE / ARCHIVE PIECE
        </button>
      </div>
      <SubRibbon items={PRD_SUBS} active={subTab} onSelect={setSubTab} />
      <div className="t-body">
        {subTab === 1 && (
          <div className="t-gr" style={{ gridTemplateColumns: 'minmax(0,2.4fr) minmax(0,1fr)', gridTemplateRows: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
            <Panel title="Style Valuation & Velocity Matrix · Click Row to Open Drawer" code="EDIT" onCodeClick={() => setSubTab(2)} style={{ gridRow: '1/3' }}>
              <SortableTable<ProductTerminalRow>
                defaultSortKey="stockVal"
                getRowId={(r) => r.id}
                onSelectRow={(r) => onEditProduct(r.raw)}
                rows={prodRows}
                cols={[
                  { key: 'sku', label: 'SKU', sortVal: (r) => r.sku, render: (r) => <span className="am">{r.sku}</span> },
                  { key: 'name', label: 'Style', sortVal: (r) => r.name, render: (r) => r.name },
                  { key: 'catLabel', label: 'Category', sortVal: (r) => r.catLabel, render: (r) => r.catLabel },
                  { key: 'status', label: 'Status', sortVal: (r) => r.status, render: (r) => <span className={r.status === 'LIVE' ? 'up' : r.status === 'SOLD_OUT' ? 'dn' : 'dim'}>{r.status}</span> },
                  { key: 'price', label: 'Price', align: 'r', sortVal: (r) => r.price, render: (r) => fmtMoney(r.price, currency) },
                  { key: 'units30', label: '30D U', align: 'r', sortVal: (r) => r.units30, render: (r) => fmtN(r.units30, 0) },
                  { key: 'rev30', label: '30D Rev', align: 'r', sortVal: (r) => r.rev30, render: (r) => fmtMoney(r.rev30, currency) },
                  {
                    key: 'sellThruPct',
                    label: 'Sell-Thru',
                    sortVal: (r) => r.sellThruPct,
                    render: (r) => (
                      <>
                        <PctBar value={r.sellThruPct} />
                        {fmtN(r.sellThruPct, 0)}%
                      </>
                    ),
                  },
                  { key: 'stock', label: 'Stock', align: 'r', sortVal: (r) => r.stock, render: (r) => <span className={r.stock <= 4 ? 'dn' : ''}>{r.stock}</span> },
                  { key: 'coverDays', label: 'Cover d', align: 'r', sortVal: (r) => r.coverDays ?? 999, render: (r) => (r.coverDays === 999 ? '∞' : String(r.coverDays ?? '—')) },
                  { key: 'sp', label: '14D', render: (r) => <span dangerouslySetInnerHTML={{ __html: sparkSvg(54, 14, r.spark14, '#ffa21f') }} /> },
                ]}
              />
            </Panel>

            <Panel title="Price vs Stock Scatter" code="SCT" flush>
              <TerminalChart
                render={(w, h) =>
                  scatterSvg(
                    w,
                    h,
                    prodRows.map((p, i) => ({
                      x: p.price * CURRENCY_META[currency].rate,
                      y: p.stock,
                      r: Math.max(3.5, Math.min(11, 3 + p.units30 * 0.5)),
                      color: TERM_COLORS[i % TERM_COLORS.length],
                      tip: `<b>${p.name}</b><br>Price: ${fmtMoney(p.price, currency)}<br>Stock: ${p.stock} units<br>30D Sold: ${p.units30}`,
                    })),
                    {
                      xFmt: (v) => `${CURRENCY_META[currency].sym}${fmtN(v, 0)}`,
                      yFmt: (v) => `${fmtN(v, 0)}u`,
                    }
                  )
                }
              />
            </Panel>

            <Panel title="Stock Exposure by Category" code="CAT" flush>
              <TerminalChart
                render={(w, h) => {
                  const cats = ['naiset', 'miehet', 'asusteet', 'kokoelmat'];
                  return barChartSvg(w, h, {
                    labels: ['Women', 'Men', 'Acc.', 'Coll.'],
                    series: [
                      {
                        name: 'Units',
                        data: cats.map((k) => prodRows.filter((p) => p.catKey === k).reduce((s, p) => s + p.stock, 0)),
                      },
                    ],
                  });
                }}
              />
            </Panel>
          </div>
        )}

        {subTab === 2 && (
          <div className="t-legacy-wrap">
            <div className="admin-scope">
              <AdminProductsView
                products={products}
                onEditProduct={onEditProduct}
                onCreateProduct={onCreateProduct}
                onViewProductInStore={onViewProductInStore}
                onRefresh={onRefreshProducts}
                onDeleteProduct={onDeleteProduct}
                onDeleteProducts={onDeleteProducts}
              />
            </div>
          </div>
        )}

        {subTab === 3 && (
          <div className="t-legacy-wrap">
            <div className="admin-scope">
              <AdminCollectionsView collections={collections} products={products} onRefresh={onRefreshProducts} />
            </div>
          </div>
        )}

        {subTab === 4 && (
          <div className="t-legacy-wrap">
            <div className="admin-scope">
              <AdminCategoriesView categories={categories} onRefresh={onRefreshProducts} />
            </div>
          </div>
        )}

        {subTab === 5 && (
          <div className="t-legacy-wrap">
            <div className="admin-scope">
              <AdminMediaView products={products} />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

/* --------------------------------------------------------------------------
   7) INV — Inventory Size Run Matrix + Stock Ledger Editor
   -------------------------------------------------------------------------- */
const InvScreen: React.FC<TerminalScreensProps & { prodRows: ProductTerminalRow[] }> = (props) => {
  const { prodRows, currency, products, onEditProduct, onRefreshProducts, requestedSubTab, onSubTabChange } = props;
  const [subTab, setSubTab] = useTerminalSubTab('INV', requestedSubTab, onSubTabChange);

  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'OS'];
  const totalUnits = prodRows.reduce((s, p) => s + p.stock, 0);
  const criticalCount = prodRows.filter((p) => p.stock <= 4).length;
  const reorderRows = prodRows.filter((p) => p.stock <= 8 || (p.coverDays !== null && p.coverDays < 30));

  const sizeCell = (v: number | undefined) => {
    if (v === undefined) return <span className="dim">—</span>;
    if (v <= 4) return <span className="t-hatch">{v}</span>;
    const alpha = Math.min(0.75, 0.08 + (v / 50) * 0.65);
    return (
      <span
        style={{
          display: 'block',
          textAlign: 'center',
          background: `rgba(255, 162, 31, ${alpha.toFixed(2)})`,
          color: alpha > 0.48 ? '#000' : '#fff',
        }}
      >
        {v}
      </span>
    );
  };

  return (
    <>
      <div className="t-sr">
        <span className="am">INVENTORY MATRIX</span>
        <span className="dim">Units on Hand</span><b className="wh">{fmtN(totalUnits, 0)}</b>
        <span className="dim">Critical (&lt;= 4)</span><b className="dn">{criticalCount}</b>
        <span className="dim">Hatched red cells = 4 or fewer units</span>
      </div>
      <SubRibbon
        items={[
          { id: 1, label: '11) Size Run & Reorder Matrix' },
          { id: 2, label: '12) Inventory Ledger Manager [Adjust Stock]' },
        ]}
        active={subTab}
        onSelect={setSubTab}
      />
      <div className="t-body">
        {subTab === 2 ? (
          <div className="t-legacy-wrap">
            <div className="admin-scope">
              <AdminInventoryView products={products} onRefresh={onRefreshProducts} />
            </div>
          </div>
        ) : (
          <div className="t-gr" style={{ gridTemplateColumns: 'minmax(0,2.2fr) minmax(0,1fr)', gridTemplateRows: 'minmax(0,1.25fr) minmax(0,1fr)' }}>
            <Panel title="Size Run Allocation Grid · Click Row to Edit Style" code="MGR" onCodeClick={() => setSubTab(2)}>
              <SortableTable<ProductTerminalRow>
                defaultSortKey="stock"
                defaultDir={1}
                getRowId={(r) => r.id}
                onSelectRow={(r) => onEditProduct(r.raw)}
                rows={prodRows}
                cols={[
                  { key: 'sku', label: 'SKU', sortVal: (r) => r.sku, render: (r) => <span className="am">{r.sku}</span> },
                  { key: 'name', label: 'Style', sortVal: (r) => r.name, render: (r) => r.name.slice(0, 22) },
                  ...sizes.map((sz): SortCol<ProductTerminalRow> => ({
                    key: `sz_${sz}`,
                    label: sz,
                    align: 'c',
                    sortVal: (r) => r.sizeMap[sz] ?? -1,
                    render: (r) => sizeCell(r.sizeMap[sz]),
                  })),
                  { key: 'stock', label: 'Total', align: 'r', sortVal: (r) => r.stock, render: (r) => fmtN(r.stock, 0) },
                  { key: 'coverDays', label: 'Cover d', align: 'r', sortVal: (r) => r.coverDays ?? 999, render: (r) => (r.coverDays === 999 ? '∞' : String(r.coverDays ?? '—')) },
                ]}
              />
            </Panel>

            <Panel title="Stock Depth by Category" code="CAT" flush>
              <TerminalChart
                render={(w, h) => {
                  const cats = ['naiset', 'miehet', 'asusteet', 'kokoelmat'];
                  return barChartSvg(w, h, {
                    labels: ['Women', 'Men', 'Acc.', 'Coll.'],
                    series: [
                      {
                        name: 'Healthy (>4)',
                        data: cats.map((k) => prodRows.filter((p) => p.catKey === k && p.stock > 4).length),
                        c: '#ffa21f',
                      },
                      {
                        name: 'Critical (<=4)',
                        data: cats.map((k) => prodRows.filter((p) => p.catKey === k && p.stock <= 4).length),
                        c: '#ff4b43',
                      },
                    ],
                    stacked: true,
                  });
                }}
              />
            </Panel>

            <Panel title="Reorder Queue" code="PO">
              <SortableTable<ProductTerminalRow>
                defaultSortKey="stock"
                defaultDir={1}
                getRowId={(r) => r.id}
                onSelectRow={(r) => setSubTab(2)}
                rows={reorderRows}
                emptyText="No styles currently triggered for reorder."
                cols={[
                  { key: 'name', label: 'Style', render: (r) => r.name },
                  { key: 'stock', label: 'On Hand', align: 'r', sortVal: (r) => r.stock, render: (r) => <span className="dn">{r.stock}</span> },
                  { key: 'units30', label: '30D Sold', align: 'r', sortVal: (r) => r.units30, render: (r) => r.units30 },
                  { key: 'stockVal', label: 'Retail Val', align: 'r', sortVal: (r) => r.stockVal, render: (r) => fmtMoney(r.stockVal, currency) },
                ]}
              />
            </Panel>

            <Panel title="Status Distribution" code="ST">
              <KvGrid
                rows={[
                  ['LIVE Styles', fmtN(prodRows.filter((p) => p.status === 'LIVE').length, 0)],
                  ['DRAFT Styles', fmtN(prodRows.filter((p) => p.status === 'DRAFT').length, 0)],
                  ['COMING_SOON Styles', fmtN(prodRows.filter((p) => p.status === 'COMING_SOON').length, 0)],
                  ['SOLD_OUT Styles', fmtN(prodRows.filter((p) => p.status === 'SOLD_OUT').length, 0)],
                  ['ARCHIVED Styles', fmtN(prodRows.filter((p) => p.status === 'ARCHIVED').length, 0)],
                ]}
              />
            </Panel>
          </div>
        )}
      </div>
    </>
  );
};

/* --------------------------------------------------------------------------
   8) CUS — Customer Intelligence + Directory / Waitlist / Votes / Discounts
   -------------------------------------------------------------------------- */
const CUS_SUBS = [
  { id: 1, label: '11) Client Intelligence' },
  { id: 2, label: '12) Client Directory' },
  { id: 3, label: '13) Waitlists' },
  { id: 4, label: '14) Suggestions & Votes' },
  { id: 5, label: '15) Discounts & Privileges' },
];

const CusScreen: React.FC<TerminalScreensProps> = (props) => {
  const { customers, waitlist, collections, discounts, currency, onNavigateLegacyView, requestedSubTab, onSubTabChange } = props;
  const [subTab, setSubTab] = useTerminalSubTab('CUS', requestedSubTab, onSubTabChange);

  const totalSpend = customers.reduce((s, c) => s + (c.totals?.spend || 0), 0);
  const repeatCount = customers.filter((c) => (c.totals?.orders || 0) > 1).length;
  const avgLtv = customers.length ? totalSpend / customers.length : 0;

  const tiers = useMemo(() => {
    const groups = [
      { n: 'ATELIER (>5K)', rows: customers.filter((c) => (c.totals?.spend || 0) >= 5000) },
      { n: 'LOYAL (1.5K-5K)', rows: customers.filter((c) => (c.totals?.spend || 0) >= 1500 && (c.totals?.spend || 0) < 5000) },
      { n: 'MEMBER (<1.5K)', rows: customers.filter((c) => (c.totals?.spend || 0) > 0 && (c.totals?.spend || 0) < 1500) },
      { n: 'PROSPECT (0)', rows: customers.filter((c) => (c.totals?.spend || 0) === 0) },
    ];
    return groups.map((g) => {
      const rev = g.rows.reduce((s, c) => s + (c.totals?.spend || 0), 0);
      return {
        tier: g.n,
        count: g.rows.length,
        avg: g.rows.length ? rev / g.rows.length : 0,
        share: totalSpend > 0 ? (rev / totalSpend) * 100 : 0,
      };
    });
  }, [customers, totalSpend]);

  return (
    <>
      <div className="t-sr">
        <span className="am">CLIENT &amp; DEMAND INTELLIGENCE</span>
        <span className="dim">Clients</span><b className="wh">{customers.length}</b>
        <span className="dim">Repeat Rate</span><b className="up">{customers.length ? `${fmtN((repeatCount / customers.length) * 100, 1)}%` : '—'}</b>
        <span className="dim">Avg LTV</span><b className="wh">{fmtMoney(avgLtv, currency)}</b>
        <span className="dim">Waitlist Queue</span><b className="cy">{waitlist.length}</b>
      </div>
      <SubRibbon items={CUS_SUBS} active={subTab} onSelect={setSubTab} />
      <div className="t-body">
        {subTab === 1 && (
          <div className="t-gr" style={{ gridTemplateColumns: '1fr 1.6fr', gridTemplateRows: 'minmax(0,1fr) minmax(0,1fr)' }}>
            <Panel title="Client Segments" code="SEG">
              <SortableTable
                defaultSortKey="share"
                getRowId={(r: { tier: string }) => r.tier}
                rows={tiers}
                cols={[
                  { key: 'tier', label: 'Tier', render: (r) => <span className="am">{r.tier}</span> },
                  { key: 'count', label: 'Clients', align: 'r', sortVal: (r) => r.count, render: (r) => r.count },
                  { key: 'avg', label: 'Avg LTV', align: 'r', sortVal: (r) => r.avg, render: (r) => fmtMoney(r.avg, currency) },
                  {
                    key: 'share',
                    label: 'Rev Share',
                    sortVal: (r) => r.share,
                    render: (r) => (
                      <>
                        <PctBar value={r.share} />
                        {fmtN(r.share, 1)}%
                      </>
                    ),
                  },
                ]}
              />
            </Panel>

            <Panel title="Top Clients by Lifetime Spend" code="DIR" onCodeClick={() => setSubTab(2)} style={{ gridRow: '1/3' }}>
              <SortableTable<Customer>
                defaultSortKey="spend"
                getRowId={(c) => c.id}
                rows={customers}
                emptyText="No registered client accounts yet."
                cols={[
                  { key: 'name', label: 'Client', sortVal: (c) => c.name, render: (c) => c.name },
                  { key: 'email', label: 'Email', sortVal: (c) => c.email, render: (c) => <span className="dim">{c.email}</span> },
                  { key: 'orders', label: 'Ord', align: 'r', sortVal: (c) => c.totals?.orders || 0, render: (c) => c.totals?.orders || 0 },
                  { key: 'spend', label: 'LTV', align: 'r', sortVal: (c) => c.totals?.spend || 0, render: (c) => fmtMoney(c.totals?.spend || 0, currency) },
                  { key: 'marketingConsent', label: 'Opt-In', align: 'c', render: (c) => <span className={c.marketingConsent ? 'up' : 'dim'}>{c.marketingConsent ? 'YES' : 'NO'}</span> },
                ]}
              />
            </Panel>

            <Panel title="Spend Distribution Histogram" code="LTV" flush>
              <TerminalChart
                render={(w, h) => {
                  const bins = [0, 0, 0, 0, 0];
                  customers.forEach((c) => {
                    const s = c.totals?.spend || 0;
                    if (s === 0) bins[0]++;
                    else if (s < 300) bins[1]++;
                    else if (s < 1000) bins[2]++;
                    else if (s < 3000) bins[3]++;
                    else bins[4]++;
                  });
                  return barChartSvg(w, h, {
                    labels: ['0', '<300', '<1K', '<3K', '3K+'],
                    series: [{ name: 'Clients', data: bins }],
                  });
                }}
              />
            </Panel>
          </div>
        )}

        {subTab === 2 && (
          <div className="t-legacy-wrap">
            <div className="admin-scope">
              <AdminCustomersView customers={customers} />
            </div>
          </div>
        )}

        {subTab === 3 && (
          <div className="t-legacy-wrap">
            <div className="admin-scope">
              <AdminWaitlistView waitlist={waitlist} collections={collections} onRefresh={() => onNavigateLegacyView('waitlist')} />
            </div>
          </div>
        )}

        {subTab === 4 && (
          <div className="t-legacy-wrap">
            <div className="admin-scope">
              <AdminSuggestionsView />
            </div>
          </div>
        )}

        {subTab === 5 && (
          <div className="t-legacy-wrap">
            <div className="admin-scope">
              <AdminDiscountsView discounts={discounts} onRefresh={() => onNavigateLegacyView('discounts')} />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

/* --------------------------------------------------------------------------
   9) CTL — Control Plane, Health & System Atlas
   -------------------------------------------------------------------------- */
const CTL_SUBS = [
  { id: 1, label: '11) Control Plane [Operations]' },
  { id: 2, label: '12) System Health Probes' },
  { id: 3, label: '13) System Atlas Registry' },
];

const CtlScreen: React.FC<TerminalScreensProps> = (props) => {
  const [subTab, setSubTab] = useTerminalSubTab('CTL', props.requestedSubTab, props.onSubTabChange);

  return (
    <>
      <div className="t-sr">
        <span className="am">INFRASTRUCTURE CONTROL PLANE</span>
        <span className="dim">OVERALL STATUS</span>
        <b className={props.controlOverview?.overallStatus === 'healthy' ? 'up' : 'am'}>
          {(props.controlOverview?.overallStatus || 'ACTIVE').toUpperCase()}
        </b>
        <span className="dim">INCIDENTS</span><b className={props.controlOverview?.activeIncidents ? 'dn' : 'wh'}>{props.controlOverview?.activeIncidents ?? 0}</b>
        <span className="dim">FAILING PROBES</span><b className={props.controlOverview?.failingProbes ? 'dn' : 'up'}>{props.controlOverview?.failingProbes ?? 0}</b>
      </div>
      <SubRibbon items={CTL_SUBS} active={subTab} onSelect={setSubTab} />
      <div className="t-body">
        <div className="t-legacy-wrap">
          <div className="admin-scope">
            {subTab === 1 && <AdminControlPlaneView />}
            {subTab === 2 && <AdminSystemHealthView />}
            {subTab === 3 && (
              <AdminAtlasView
                products={props.products}
                orders={props.orders}
                customers={props.customers}
                waitlist={props.waitlist}
                collections={props.collections}
                onNavigateView={props.onNavigateLegacyView}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

/* --------------------------------------------------------------------------
   10) SEC, CMS, ADV, SET — Security Perimeter, Storefront CMS, AI Advisor, Settings
   -------------------------------------------------------------------------- */
const SecScreen: React.FC<TerminalScreensProps> = (props) => {
  const [subTab, setSubTab] = useTerminalSubTab('SEC', props.requestedSubTab, props.onSubTabChange);
  return (
    <>
      <div className="t-sr">
        <span className="am">SECURITY PERIMETER &amp; AUDIT LOG</span>
        <span className="dim">AUTO-LOCK</span>
        <b className="cy">{props.autoLockMinutes === 0 ? 'DISABLED' : `${props.autoLockMinutes} MIN`}</b>
        <span className="dim">EVENTS RECORDED</span>
        <b className="wh">{props.auditLogs.length}</b>
        <button
          type="button"
          className="t-ob"
          style={{ marginLeft: 'auto', background: '#b3191f', color: '#fff', borderColor: '#000' }}
          onClick={props.onLockTerminalNow}
        >
          LOCK TERMINAL NOW
        </button>
      </div>
      <SubRibbon
        items={[
          { id: 1, label: '11) Security & Lock Controls' },
          { id: 2, label: '12) Raw Audit Matrix' },
        ]}
        active={subTab}
        onSelect={setSubTab}
      />
      <div className="t-body">
        {subTab === 2 ? (
          <div className="t-gr">
            <Panel title="Immutable Audit Log Matrix" code="SEC">
              <SortableTable<AuditLog>
                defaultSortKey="at"
                getRowId={(r) => r.id}
                rows={props.auditLogs}
                emptyText="No audit records logged."
                cols={[
                  { key: 'at', label: 'Timestamp', sortVal: (r) => r.at, render: (r) => <span className="dim">{new Date(r.at).toLocaleString()}</span> },
                  { key: 'action', label: 'Action', sortVal: (r) => r.action, render: (r) => <span className="am">{r.action}</span> },
                  { key: 'who', label: 'Operator', sortVal: (r) => r.who, render: (r) => r.who },
                  { key: 'target', label: 'Target', sortVal: (r) => r.target, render: (r) => r.target },
                ]}
              />
            </Panel>
          </div>
        ) : (
          <div className="t-legacy-wrap">
            <div className="admin-scope">
              <AdminSecurityView
                autoLockMinutes={props.autoLockMinutes}
                onUpdateAutoLock={props.onUpdateAutoLock}
                onLockTerminalNow={props.onLockTerminalNow}
                auditLogs={props.auditLogs}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const CmsScreen: React.FC<TerminalScreensProps> = (props) => {
  const [subTab, setSubTab] = useTerminalSubTab('CMS', props.requestedSubTab, props.onSubTabChange);
  return (
    <>
      <div className="t-sr">
        <span className="am">STOREFRONT CMS &amp; COMMERCIAL ANALYTICS</span>
        <span className="dim">HERO SLIDES</span>
        <b className="wh">{props.content?.heroSlides?.length || 0}</b>
        <span className="dim">JOURNAL POSTS</span>
        <b className="wh">{props.content?.journalPosts?.length || 0}</b>
      </div>
      <SubRibbon
        items={[
          { id: 1, label: '11) Hero Slides & CMS' },
          { id: 2, label: '12) Commercial Analytics' },
        ]}
        active={subTab}
        onSelect={setSubTab}
      />
      <div className="t-body">
        <div className="t-legacy-wrap">
          <div className="admin-scope">
            {subTab === 1 ? (
              props.content ? (
                <AdminContentView content={props.content} onRefresh={props.onRefreshProducts} />
              ) : (
                <div className="p-4 text-paper-a45">Loading house editorial &amp; CMS slots…</div>
              )
            ) : (
              <AdminAnalyticsView products={props.products} dailyStats={props.realDailyStats} orders={props.orders} />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

const AdvScreen: React.FC<TerminalScreensProps> = (props) => (
  <>
    <div className="t-sr">
      <span className="am">STRATEGIC DECISION INTELLIGENCE</span>
      <span className="dim">SERVER PROXY</span>
      <b className="up">/API/ADVISOR</b>
    </div>
    <SubRibbon />
    <div className="t-body">
      <div className="t-legacy-wrap">
        <div className="admin-scope">
          <AdminAdvisorView
            products={props.products}
            dailyStats={props.realDailyStats}
            insights={props.insights}
            onRefresh={props.onRefreshProducts}
            onNavigateView={props.onNavigateLegacyView}
          />
        </div>
      </div>
    </div>
  </>
);

const SetScreen: React.FC<TerminalScreensProps> = (props) => (
  <>
    <div className="t-sr">
      <span className="am">HOUSE CONFIGURATION &amp; SETTINGS</span>
      <span className="dim">STORE</span>
      <b className="wh">{props.settings?.storeInfo?.name || 'ZEJESH'}</b>
    </div>
    <SubRibbon />
    <div className="t-body">
      <div className="t-legacy-wrap">
        <div className="admin-scope">
          {props.settings ? (
            <AdminSettingsView settings={props.settings} onRefresh={props.onRefreshProducts} />
          ) : (
            <div className="p-4 text-paper-a45">Loading store settings…</div>
          )}
        </div>
      </div>
    </div>
  </>
);

/* --------------------------------------------------------------------------
   Dispatcher
   -------------------------------------------------------------------------- */
export const TerminalScreens: React.FC<TerminalScreensProps> = (props) => {
  const buckets = useMemo(
    () =>
      buildPeriodBuckets({
        products: props.products,
        orders: props.orders,
        customers: props.customers,
        waitlist: props.waitlist,
        collections: props.collections,
        categories: props.categories,
        discounts: props.discounts,
        auditLogs: props.auditLogs,
        settings: props.settings,
        liveVisitors: props.liveVisitors,
        region: props.region,
        periodKind: props.periodKind,
        periodCount: props.periodCount,
        currency: props.currency,
        controlOverview: props.controlOverview,
      }),
    [props]
  );

  const prodRows = useMemo(
    () => buildProductTerminalRows(props.products, props.orders),
    [props.products, props.orders]
  );

  const orderRows = useMemo(
    () => buildOrderTerminalRows(props.orders, props.region),
    [props.orders, props.region]
  );

  switch (props.fn) {
    case 'MON':
      return <MonScreen {...props} buckets={buckets} prodRows={prodRows} orderRows={orderRows} />;
    case 'FA':
      return <FaScreen {...props} buckets={buckets} />;
    case 'DES':
      return <DesScreen {...props} buckets={buckets} prodRows={prodRows} orderRows={orderRows} />;
    case 'RSK':
      return <RskScreen {...props} buckets={buckets} orderRows={orderRows} />;
    case 'ORD':
      return <OrdScreen {...props} orderRows={orderRows} />;
    case 'PRD':
      return <PrdScreen {...props} prodRows={prodRows} />;
    case 'INV':
      return <InvScreen {...props} prodRows={prodRows} />;
    case 'CUS':
      return <CusScreen {...props} />;
    case 'CTL':
      return <CtlScreen {...props} />;
    case 'SEC':
      return <SecScreen {...props} />;
    case 'CMS':
      return <CmsScreen {...props} />;
    case 'ADV':
      return <AdvScreen {...props} />;
    case 'SET':
      return <SetScreen {...props} />;
    default:
      return <MonScreen {...props} buckets={buckets} prodRows={prodRows} orderRows={orderRows} />;
  }
};
