import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../supabase/AuthContext';
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
} from '../types';
import type { TerminalFnCode } from './terminal/TerminalScreens';
import {
  CURRENCY_META,
  fmtMoney,
  fmtN,
  lineChartSvg,
  sparkSvg,
  TerminalChart,
  type TerminalCurrency,
} from './terminal/terminalCharts';
import {
  buildLiveWire,
  DAY_MS,
  orderTime,
  regionBadgeId,
  TERMINAL_REGIONS,
  type TerminalPeriodKind,
  type TerminalRegion,
} from './terminal/terminalMetrics';

export interface TerminalNavItem {
  id: string;
  group: string;
  label: string;
  fn: TerminalFnCode;
  subTab?: number;
  badge?: string | number;
  description?: string;
}

export interface TerminalPlotData {
  title: string;
  labels: string[];
  values: number[];
}

export interface TerminalLayoutProps {
  children: React.ReactNode;
  fn: TerminalFnCode;
  activeSubTab: number;
  activeViewId: string;
  navItems: TerminalNavItem[];
  onNavigateFn: (fn: TerminalFnCode, subTab?: number) => void;
  onNavigateView: (viewId: string) => void;
  region: TerminalRegion;
  onChangeRegion: (r: TerminalRegion) => void;
  currency: TerminalCurrency;
  onChangeCurrency: (c: TerminalCurrency) => void;
  periodKind: TerminalPeriodKind;
  onChangePeriodKind: (k: TerminalPeriodKind) => void;
  showPctCols: boolean;
  onChangeShowPctCols: (v: boolean) => void;
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
  controlOverview: {
    overallStatus?: string;
    activeIncidents?: number;
    unacknowledgedAlerts?: number;
    failingProbes?: number;
  } | null;
  notificationCount: number;
  onOpenNotifications: () => void;
  onOpenPalette: () => void;
  onLockTerminal: () => void;
  onCreateProduct: () => void;
  onRefreshStore: () => void;
  onBackToStorefront: () => void;
  plotData: TerminalPlotData | null;
  onClearPlot: () => void;
  toastMessage: string;
  onToast: (msg: string) => void;
}

export const TERMINAL_FUNCTIONS: Array<[TerminalFnCode, string]> = [
  ['MON', 'Command Overview'],
  ['FA', 'Financial Analysis Ledger'],
  ['DES', 'House Description & Basis'],
  ['RSK', 'Fulfilment & Infra Risk'],
  ['ORD', 'Order Blotter & Book'],
  ['PRD', 'Product Analysis & Archive'],
  ['INV', 'Inventory Matrix & Control'],
  ['CUS', 'Clients, Waitlist & Discounts'],
  ['CTL', 'Control Plane, Health & Atlas'],
  ['SEC', 'Security Perimeter & Audit'],
  ['CMS', 'Storefront CMS & Analytics'],
  ['ADV', 'AI Executive Advisor'],
  ['SET', 'House Settings'],
];

const CURRENCIES: TerminalCurrency[] = ['EUR', 'USD', 'GBP'];

const sanitizeTipHtml = (raw: string): string => {
  const decoded = raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
  // Strip any tags other than <b>, </b>, <br>, <br/>, <i>, </i>, <div>, </div>
  return decoded.replace(/<(?!\/?(?:b|br|i|div)\b[^>]*>)[^>]+>/gi, '');
};

const downloadTextFile = (filename: string, mime: string, body: string) => {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const TerminalLayout: React.FC<TerminalLayoutProps> = ({
  children,
  fn,
  activeViewId,
  navItems,
  onNavigateFn,
  onNavigateView,
  region,
  onChangeRegion,
  currency,
  onChangeCurrency,
  showPctCols,
  onChangeShowPctCols,
  products,
  orders,
  customers,
  waitlist,
  collections,
  categories,
  discounts,
  auditLogs,
  settings,
  liveVisitors,
  controlOverview,
  notificationCount,
  onOpenNotifications,
  onOpenPalette,
  onLockTerminal,
  onCreateProduct,
  onRefreshStore,
  onBackToStorefront,
  plotData,
  onClearPlot,
  toastMessage,
  onToast,
}) => {
  const { adminProfile, signOut } = useAuth();

  const [cmdInput, setCmdInput] = useState<string>(fn);
  const [history, setHistory] = useState<TerminalFnCode[]>(['MON']);
  const [histIdx, setHistIdx] = useState(0);
  const [compact, setCompact] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [wireExpanded, setWireExpanded] = useState(false);
  const [ovl, setOvl] = useState<'help' | 'set' | null>(null);
  const [menu, setMenu] = useState<{
    left: number;
    top: number;
    items: Array<{ label: string; tag?: string; action: () => void }>;
  } | null>(null);

  const fnInputRef = useRef<HTMLInputElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCmdInput(fn);
  }, [fn]);

  const activeFnMeta = useMemo(
    () => TERMINAL_FUNCTIONS.find(([code]) => code === fn) || TERMINAL_FUNCTIONS[0],
    [fn]
  );

  const activeNavMeta = useMemo(
    () => navItems.find((item) => item.id === activeViewId),
    [navItems, activeViewId]
  );

  // Real store ticker metrics
  const metrics = useMemo(() => {
    const now = Date.now();
    const d30 = now - 30 * DAY_MS;
    const d60 = now - 60 * DAY_MS;
    const curDayBuckets = Array(30).fill(0);
    let rev30 = 0;
    let revPrev30 = 0;
    let totalOrders = 0;
    let openOrders = 0;

    for (const o of orders) {
      totalOrders += 1;
      if (['new', 'paid', 'packed', 'shipped'].includes(o.status)) {
        openOrders += 1;
      }
      if (o.status === 'cancelled' || o.status === 'refunded') continue;
      const t = orderTime(o);
      const val = o.totals?.total || 0;
      if (t >= d30) {
        rev30 += val;
        const idx = Math.min(29, Math.max(0, Math.floor((t - d30) / DAY_MS)));
        curDayBuckets[idx] += val;
      } else if (t >= d60) {
        revPrev30 += val;
      }
    }

    const delta = revPrev30 > 0 ? rev30 - revPrev30 : rev30;
    const deltaPct = revPrev30 > 0 ? ((rev30 - revPrev30) / revPrev30) * 100 : 0;
    const lowStockSkus = products.filter((p) => {
      const stk = p.variants?.length
        ? p.variants.reduce((s, v) => s + (v.stock || 0), 0)
        : p.stock || 0;
      return stk <= 4;
    }).length;
    const catalogUnits = products.reduce(
      (s, p) =>
        s +
        (p.variants?.length
          ? p.variants.reduce((vs, v) => vs + (v.stock || 0), 0)
          : p.stock || 0),
      0
    );

    return {
      rev30,
      delta,
      deltaPct,
      curDayBuckets,
      totalOrders,
      openOrders,
      lowStockSkus,
      catalogUnits,
    };
  }, [orders, products]);

  const liveWire = useMemo(
    () =>
      buildLiveWire({
        products,
        orders,
        customers,
        waitlist,
        collections,
        categories,
        discounts,
        auditLogs,
        settings,
        liveVisitors,
        region,
        periodKind: 'Monthly',
        periodCount: 12,
        currency,
        controlOverview,
      }),
    [
      products,
      orders,
      customers,
      waitlist,
      collections,
      categories,
      discounts,
      auditLogs,
      settings,
      liveVisitors,
      region,
      currency,
      controlOverview,
    ]
  );

  const goCode = useCallback(
    (rawCode: string, push = true) => {
      const token = rawCode.trim().toUpperCase();
      if (!token) return;

      const exactFn = TERMINAL_FUNCTIONS.find(([code]) => code === token);
      if (exactFn) {
        if (push && exactFn[0] !== fn) {
          setHistory((prev) => prev.slice(0, histIdx + 1).concat(exactFn[0]));
          setHistIdx((i) => i + 1);
        }
        onNavigateFn(exactFn[0]);
        setMenu(null);
        setOvl(null);
        return;
      }

      // Match any of the 19 views by id or label prefix
      const matchedView = navItems.find(
        (item) =>
          item.id.toUpperCase() === token ||
          item.label.toUpperCase().startsWith(token) ||
          item.label.toUpperCase().includes(token)
      );
      if (matchedView) {
        if (push && matchedView.fn !== fn) {
          setHistory((prev) => prev.slice(0, histIdx + 1).concat(matchedView.fn));
          setHistIdx((i) => i + 1);
        }
        onNavigateView(matchedView.id);
        setMenu(null);
        setOvl(null);
        return;
      }

      onToast(`Unknown command "${token}". Try MON, FA, DES, RSK, ORD, PRD, INV, CUS, CTL, SEC, CMS, ADV, SET.`);
    },
    [fn, histIdx, navItems, onNavigateFn, onNavigateView, onToast]
  );

  const goBack = () => {
    if (histIdx <= 0) return;
    const nextIdx = histIdx - 1;
    setHistIdx(nextIdx);
    onNavigateFn(history[nextIdx]);
  };

  const goForward = () => {
    if (histIdx >= history.length - 1) return;
    const nextIdx = histIdx + 1;
    setHistIdx(nextIdx);
    onNavigateFn(history[nextIdx]);
  };

  const openDropdown = (
    el: HTMLElement,
    items: Array<{ label: string; tag?: string; action: () => void }>
  ) => {
    const r = el.getBoundingClientRect();
    setMenu({
      left: Math.max(4, Math.min(r.left, window.innerWidth - 280)),
      top: r.bottom + 2,
      items,
    });
  };

  // Global keyboard shortcuts (type to focus command field, Esc to close popups)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMenu(null);
        setOvl(null);
        onOpenPalette();
        return;
      }
      if (e.key === 'Escape') {
        setMenu(null);
        setOvl(null);
        onClearPlot();
        return;
      }
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.length === 1 &&
        /[a-zA-Z]/.test(e.key) &&
        !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')
      ) {
        fnInputRef.current?.focus();
        fnInputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClearPlot, onOpenPalette]);

  // Close menus on outside click
  useEffect(() => {
    if (!menu) return;
    const onDocClick = () => setMenu(null);
    window.addEventListener('click', onDocClick);
    return () => window.removeEventListener('click', onDocClick);
  }, [menu]);

  // Global [data-tip] tooltip tracking
  useEffect(() => {
    const moveTip = (e: MouseEvent) => {
      const tipEl = tipRef.current;
      if (!tipEl) return;
      const target = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      const raw = target?.getAttribute('data-tip');
      if (!raw) {
        tipEl.style.opacity = '0';
        return;
      }
      tipEl.innerHTML = sanitizeTipHtml(raw);
      tipEl.style.opacity = '1';
      const pad = 12;
      const left = Math.min(window.innerWidth - 310, e.clientX + pad);
      const top = Math.max(8, Math.min(window.innerHeight - 90, e.clientY + pad));
      tipEl.style.left = `${left}px`;
      tipEl.style.top = `${top}px`;
    };
    document.addEventListener('mousemove', moveTip);
    return () => document.removeEventListener('mousemove', moveTip);
  }, []);

  const exportOrdersCsv = () => {
    const header = ['OrderNumber', 'CreatedAt', 'Customer', 'Email', 'Country', 'Status', 'TotalEUR'];
    const rows = orders.map((o) => [
      o.number,
      o.createdAt || '',
      `"${(o.customer?.name || '').replace(/"/g, '""')}"`,
      o.customer?.email || '',
      o.customer?.address?.country || '',
      o.status,
      String(o.totals?.total ?? 0),
    ]);
    downloadTextFile(
      `zejesh_orders_${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv;charset=utf-8',
      [header.join(','), ...rows.map((r) => r.join(','))].join('\n')
    );
    onToast(`Exported ${orders.length} orders to CSV`);
  };

  const exportProductsCsv = () => {
    const header = ['SKU', 'Title', 'Category', 'Status', 'PriceEUR', 'Stock'];
    const rows = products.map((p) => {
      const stk = p.variants?.length
        ? p.variants.reduce((s, v) => s + (v.stock || 0), 0)
        : p.stock || 0;
      return [
        p.nr || p.plateNumber || p.id,
        `"${(p.name?.en || p.name?.fi || '').replace(/"/g, '""')}"`,
        p.category || '',
        p.status || '',
        String(p.price || 0),
        String(stk),
      ];
    });
    downloadTextFile(
      `zejesh_catalog_${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv;charset=utf-8',
      [header.join(','), ...rows.map((r) => r.join(','))].join('\n')
    );
    onToast(`Exported ${products.length} SKUs to CSV`);
  };

  const exportAuditJson = () => {
    downloadTextFile(
      `zejesh_audit_${new Date().toISOString().slice(0, 10)}.json`,
      'application/json;charset=utf-8',
      JSON.stringify(auditLogs, null, 2)
    );
    onToast(`Exported ${auditLogs.length} audit events to JSON`);
  };

  const groupedNav = useMemo(() => {
    const groups = ['Command', 'Product', 'Growth', 'Studio', 'Control'];
    return groups
      .map((g) => ({
        group: g,
        items: navItems.filter((item) => item.group === g),
      }))
      .filter((g) => g.items.length > 0);
  }, [navItems]);

  const plotSvg = useMemo(() => {
    if (!plotData) return null;
    return (w: number, h: number) =>
      lineChartSvg(w, h, {
        labels: plotData.labels,
        series: [{ name: plotData.title, data: plotData.values, area: true }],
        fmt: (v) => fmtN(v, 1),
      });
  }, [plotData]);

  const bannerTitle = activeNavMeta
    ? `${fn} · ${activeNavMeta.label.toUpperCase()}`
    : `${fn} · ${activeFnMeta[1].toUpperCase()}`;

  return (
    <>
      <div className={`t-terminal ${compact ? 't-compact' : ''}`}>
        <div className="t-app">
          {/* BAR 1 — Terminal Command & Session Strip */}
          <div className="t-bar1">
            <button
              type="button"
              className="t-navbtn"
              onClick={goBack}
              disabled={histIdx <= 0}
              title="Previous terminal screen"
              aria-label="Back"
            >
              &lt;
            </button>
            <button
              type="button"
              className="t-navbtn"
              onClick={goForward}
              disabled={histIdx >= history.length - 1}
              title="Next terminal screen"
              aria-label="Forward"
            >
              &gt;
            </button>

            <div className="t-fld sec">
              <span>{regionBadgeId(region)} · {currency}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openDropdown(e.currentTarget, [
                    ...TERMINAL_REGIONS.map((r) => ({
                      label: `Scope: ${r}`,
                      tag: r === region ? 'ON' : undefined,
                      action: () => {
                        onChangeRegion(r);
                        onToast(`Region scope set to ${r}`);
                      },
                    })),
                    ...CURRENCIES.map((c) => ({
                      label: `Currency: ${c}`,
                      tag: c === currency ? 'ON' : undefined,
                      action: () => {
                        onChangeCurrency(c);
                        onToast(`Reporting currency set to ${c}`);
                      },
                    })),
                  ]);
                }}
                aria-label="Region & Currency Scope"
              >
                ▾
              </button>
            </div>

            <div className="t-fld fn" title="Type any function code (MON, FA, ORD, PRD...) or screen name and press Enter">
              <input
                ref={fnInputRef}
                id="t-fn"
                value={cmdInput}
                maxLength={16}
                autoComplete="off"
                spellCheck={false}
                placeholder="CODE"
                onChange={(e) => setCmdInput(e.target.value.toUpperCase())}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    goCode(cmdInput);
                  }
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openDropdown(
                    e.currentTarget,
                    TERMINAL_FUNCTIONS.map(([code, label]) => ({
                      label,
                      tag: code,
                      action: () => goCode(code),
                    }))
                  );
                }}
                aria-label="Terminal Functions"
              >
                ▾
              </button>
            </div>

            <div className="t-fld rel t-hide-s">
              <span>19 Screens</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openDropdown(
                    e.currentTarget,
                    navItems.map((item, idx) => ({
                      label: `${idx + 1}) ${item.label}`,
                      tag: item.fn,
                      action: () => onNavigateView(item.id),
                    }))
                  );
                }}
                aria-label="All 19 Screens"
              >
                ≫
              </button>
            </div>

            <div className="t-sp" />

            <button
              type="button"
              className={`t-hb ${!railCollapsed ? 'active' : ''}`}
              onClick={() => setRailCollapsed((v) => !v)}
              title="Toggle left screen navigator rail"
            >
              NAV
            </button>

            <button
              type="button"
              className="t-hb"
              onClick={onOpenPalette}
              title="Command Palette (Cmd/Ctrl + K)"
            >
              ⌘K
            </button>

            <button
              type="button"
              className="t-hb"
              onClick={onOpenNotifications}
              title="Studio Alerts & Pending Notifications"
            >
              ALERTS
              {notificationCount > 0 && <span className="t-badge-num">{notificationCount}</span>}
            </button>

            <button
              type="button"
              className={`t-hb t-hide-s ${compact ? 'active' : ''}`}
              onClick={() => setCompact((v) => !v)}
              title="Toggle row density"
            >
              {compact ? 'DENSE' : 'NORMAL'}
            </button>

            <button
              type="button"
              className="t-hb"
              onClick={() => setOvl((cur) => (cur === 'set' ? null : 'set'))}
              title="Terminal Preferences"
            >
              PREF
            </button>

            <button
              type="button"
              className="t-hb"
              onClick={onLockTerminal}
              title="Lock Management Terminal Now"
            >
              LOCK
            </button>

            <button
              type="button"
              className="t-hb t-hide-s"
              onClick={onBackToStorefront}
              title="Exit to Customer Storefront"
            >
              STORE
            </button>

            <button
              type="button"
              className="t-hb t-hide-s"
              onClick={() => void signOut()}
              title={`Sign out (${adminProfile?.email || 'Operator'})`}
            >
              EXIT
            </button>

            <button
              type="button"
              className="t-qb"
              onClick={() => setOvl((cur) => (cur === 'help' ? null : 'help'))}
              title="Terminal Shortcut Reference"
            >
              ?
            </button>
          </div>

          {/* TICKER 1 — Real Storefront Commercial Readout */}
          <div className="t-tick1">
            <i className="t-cur" />
            <span className="t-tk">ZEJESH 30D</span>
            <span className="t-am">{fmtMoney(metrics.rev30, currency)}</span>
            <span className={metrics.delta >= 0 ? 't-up' : 't-dn'}>
              {metrics.delta >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(metrics.delta), currency)}
              {orders.length > 0 ? ` (${metrics.deltaPct >= 0 ? '+' : ''}${fmtN(metrics.deltaPct, 1)}%)` : ''}
            </span>
            <span
              className="t-hide-s"
              dangerouslySetInnerHTML={{
                __html: sparkSvg(136, 20, metrics.curDayBuckets, '#ffa21f'),
              }}
            />
            <span className="t-ba t-hide-s">
              SKUs <b className="t-cy">{products.length}</b> · UNITS <b className="t-wh">{metrics.catalogUnits}</b>
            </span>
          </div>

          {/* TICKER 2 — Live Queues & Control Telemetry */}
          <div className="t-tick2">
            <span className="t-gl">ZJ</span>
            <span>OPEN ORD <b>{metrics.openOrders}</b>/{metrics.totalOrders}</span>
            <span>LOW STK <b className={metrics.lowStockSkus > 0 ? 't-dn' : 't-up'}>{metrics.lowStockSkus}</b></span>
            <span>CLIENTS <b>{customers.length}</b></span>
            <span>WAITLIST <b>{waitlist.length}</b></span>
            <span className="t-hide-s">5M EVENTS <b className="t-up">{liveVisitors}</b></span>
            <span className="t-hide-s">
              PLANE{' '}
              <b className={controlOverview?.overallStatus === 'healthy' ? 't-up' : 't-am'}>
                {(controlOverview?.overallStatus || 'ACTIVE').toUpperCase()}
              </b>
            </span>
            <span className="t-hide-s t-dim" style={{ marginLeft: 'auto' }}>
              OP: {adminProfile?.email || 'ADMIN'}
            </span>
          </div>

          {/* BAR 2 — Red Operational Action Ribbon */}
          <div className="t-bar2">
            <span className="t-id">{regionBadgeId(region)}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openDropdown(e.currentTarget, [
                  { label: '+ New Product / Archive Piece', tag: 'PRD', action: onCreateProduct },
                  { label: 'Refresh Storefront & Catalog', tag: 'SYNC', action: () => { onRefreshStore(); onToast('Catalog synced from Supabase'); } },
                  { label: 'Open Command Palette (⌘K)', tag: 'CMD', action: onOpenPalette },
                  { label: 'Lock Security Gate', tag: 'SEC', action: onLockTerminal },
                  { label: 'Exit to Storefront', tag: 'WEB', action: onBackToStorefront },
                ]);
              }}
            >
              Actions<i>▼</i>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openDropdown(
                  e.currentTarget,
                  navItems.map((item) => ({
                    label: item.label,
                    tag: item.fn,
                    action: () => onNavigateView(item.id),
                  }))
                );
              }}
            >
              Screens ({navItems.length})<i>▼</i>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openDropdown(e.currentTarget, [
                  { label: 'Download Scoped Orders (CSV)', tag: 'CSV', action: exportOrdersCsv },
                  { label: 'Download Product Catalog (CSV)', tag: 'CSV', action: exportProductsCsv },
                  { label: 'Download Audit Trail (JSON)', tag: 'JSON', action: exportAuditJson },
                ]);
              }}
            >
              Export<i>▼</i>
            </button>
            <span className="t-ttl">ZEJESH // {bannerTitle}</span>
          </div>

          {/* MAIN WORKSPACE: Left 19-Screen Rail + Terminal Function Canvas */}
          <div className="t-main">
            <div className="t-workspace-split">
              <aside className={`t-nav ${railCollapsed ? 'collapsed' : ''}`} aria-label="Terminal Modules">
                <div className="t-top">
                  <span className="t-am" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em' }}>
                    MODULES (19)
                  </span>
                  <span className="t-dim" style={{ fontSize: 10 }}>
                    {fn}
                  </span>
                </div>
                {groupedNav.map((grp) => (
                  <div key={grp.group} className="t-ng">
                    <small>{grp.group}</small>
                    {grp.items.map((item) => {
                      const isActive = activeViewId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`t-nav-item ${isActive ? 'on' : ''}`}
                          onClick={() => onNavigateView(item.id)}
                          title={item.description || item.label}
                        >
                          <span className="t-nav-code">{item.fn}</span>
                          <span className="t-nav-label">{item.label}</span>
                          {item.badge !== undefined && item.badge !== 0 && (
                            <em>{item.badge}</em>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </aside>

              <div className="t-stage">{children}</div>
            </div>
          </div>

          {/* BOTTOM LIVE WIRE */}
          <div className={`t-news ${wireExpanded ? 't-big' : ''}`}>
            <div className="t-hd">
              <span>LIVE STORE TELEMETRY WIRE · {liveWire.length} EVENTS</span>
              <div>
                <button type="button" onClick={() => onOpenNotifications()}>
                  300) Open Alerts
                </button>
                <button type="button" onClick={() => setWireExpanded((v) => !v)}>
                  {wireExpanded ? '301) Collapse Wire' : '301) Expand Wire'}
                </button>
              </div>
            </div>
            <div id="t-nl">
              {liveWire.length === 0 ? (
                <div>
                  <span className="t-s">SYS</span>
                  <span className="t-m">LIVE</span>
                  <span className="t-x">All operational queues nominal. Live events appear here as orders, stock updates, and audits occur.</span>
                </div>
              ) : (
                liveWire.slice(0, wireExpanded ? 24 : 3).map((ev, i) => (
                  <div
                    key={i}
                    onClick={() => ev.view && onNavigateFn(ev.view as TerminalFnCode)}
                    title={ev.view ? `Jump to ${ev.view}` : undefined}
                  >
                    <span className="t-s">{ev.source}</span>
                    <span className="t-m">
                      {new Date(ev.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="t-x">{ev.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dropdown Menu */}
      {menu && (
        <div
          id="t-mn"
          className="t-mn on"
          style={{ left: menu.left, top: menu.top }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setMenu(null);
                item.action();
              }}
            >
              <span>{item.label}</span>
              {item.tag && <span className="t-am" style={{ fontSize: 10.5 }}>{item.tag}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Help / Preferences Overlay */}
      {ovl && (
        <div className="t-ovl on">
          <h3>
            <span>{ovl === 'help' ? 'ZEJESH TERMINAL // KEYBOARD & FUNCTION CODES' : 'TERMINAL PREFERENCES'}</span>
            <button type="button" onClick={() => setOvl(null)}>✕</button>
          </h3>
          <div className="t-in">
            {ovl === 'help' ? (
              <>
                <div className="t-rw">
                  <span className="t-am">Type + Enter</span>
                  <span className="t-dim">Run any code (FA, ORD, PRD...) or view name</span>
                </div>
                <div className="t-rw">
                  <span className="t-am">⌘K / Ctrl+K</span>
                  <span className="t-dim">Open global Command Palette</span>
                </div>
                <div className="t-rw">
                  <span className="t-am">Esc</span>
                  <span className="t-dim">Close overlays, plots, and dropdown menus</span>
                </div>
                {TERMINAL_FUNCTIONS.map(([code, desc]) => (
                  <div
                    key={code}
                    className="t-rw"
                    style={{ cursor: 'pointer' }}
                    onClick={() => goCode(code)}
                  >
                    <span className="t-am">{code}</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="t-rw">
                  <span>Row Density</span>
                  <select
                    value={compact ? '1' : '0'}
                    onChange={(e) => setCompact(e.target.value === '1')}
                  >
                    <option value="0">Normal (21px)</option>
                    <option value="1">Compact (18px)</option>
                  </select>
                </div>
                <div className="t-rw">
                  <span>FA % Columns</span>
                  <select
                    value={showPctCols ? '1' : '0'}
                    onChange={(e) => onChangeShowPctCols(e.target.value === '1')}
                  >
                    <option value="1">Shown</option>
                    <option value="0">Hidden</option>
                  </select>
                </div>
                <div className="t-rw">
                  <span>Currency</span>
                  <select
                    value={currency}
                    onChange={(e) => onChangeCurrency(e.target.value as TerminalCurrency)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="t-rw">
                  <span>Region Scope</span>
                  <select
                    value={region}
                    onChange={(e) => onChangeRegion(e.target.value as TerminalRegion)}
                  >
                    {TERMINAL_REGIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* FA Metric Plot Popup */}
      {plotData && plotSvg && (
        <div className="t-pop on">
          <h3>
            <span>SERIES PLOT // {plotData.title}</span>
            <button type="button" onClick={onClearPlot}>✕</button>
          </h3>
          <div className="t-pb t-fx">
            <TerminalChart render={plotSvg} />
          </div>
        </div>
      )}

      {/* Floating Tooltip */}
      <div className="t-tip" ref={tipRef} />

      {/* Toast */}
      <div className={`t-toast ${toastMessage ? 'on' : ''}`}>{toastMessage}</div>
    </>
  );
};

export default TerminalLayout;
