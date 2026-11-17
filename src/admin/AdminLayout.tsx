import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Product, Order, Customer, WaitlistEntry, Discount, AiInsight, DailyStat, AuditLog } from '../types';
import { useAuth } from '../supabase/AuthContext';
import { supabase } from '../supabase/config';
import {
  subscribeToOrders,
  subscribeToCustomers,
  subscribeToWaitlist,
  logAuditEvent,
} from '../supabase/dbService';
import { AdminCommandPalette } from './AdminCommandPalette';
import { AdminNotificationsModal } from './AdminNotificationsModal';
import { AdminProductEditorDrawer } from './products/AdminProductEditorDrawer';
import { AdminSecurityGate } from './security/AdminSecurityGate';
import { useStorefrontData } from '../context/StorefrontDataContext';
import { TerminalLayout, type TerminalNavItem, type TerminalPlotData } from './TerminalLayout';
import { TerminalScreens, type TerminalFnCode } from './terminal/TerminalScreens';
import type { TerminalCurrency } from './terminal/terminalCharts';
import type { TerminalPeriodKind, TerminalRegion } from './terminal/terminalMetrics';

interface AdminLayoutProps {
  onBackToStorefront: () => void;
  onViewProductInStore: (product: Product) => void;
}

const VIEW_TO_TERMINAL: Record<string, { fn: TerminalFnCode; subTab?: number }> = {
  dashboard: { fn: 'MON' },
  control: { fn: 'CTL', subTab: 1 },
  health: { fn: 'CTL', subTab: 2 },
  atlas: { fn: 'CTL', subTab: 3 },
  products: { fn: 'PRD', subTab: 2 },
  collections: { fn: 'PRD', subTab: 3 },
  categories: { fn: 'PRD', subTab: 4 },
  media: { fn: 'PRD', subTab: 5 },
  orders: { fn: 'ORD', subTab: 2 },
  inventory: { fn: 'INV', subTab: 2 },
  customers: { fn: 'CUS', subTab: 2 },
  waitlist: { fn: 'CUS', subTab: 3 },
  suggestions: { fn: 'CUS', subTab: 4 },
  discounts: { fn: 'CUS', subTab: 5 },
  content: { fn: 'CMS', subTab: 1 },
  analytics: { fn: 'CMS', subTab: 2 },
  advisor: { fn: 'ADV' },
  security: { fn: 'SEC', subTab: 1 },
  settings: { fn: 'SET' },
};

function resolveViewId(fn: TerminalFnCode, subTab: number): string {
  if (fn === 'MON') return 'dashboard';
  if (fn === 'CTL') return subTab === 2 ? 'health' : subTab === 3 ? 'atlas' : 'control';
  if (fn === 'PRD') {
    if (subTab === 3) return 'collections';
    if (subTab === 4) return 'categories';
    if (subTab === 5) return 'media';
    return 'products';
  }
  if (fn === 'ORD') return 'orders';
  if (fn === 'INV') return 'inventory';
  if (fn === 'CUS') {
    if (subTab === 3) return 'waitlist';
    if (subTab === 4) return 'suggestions';
    if (subTab === 5) return 'discounts';
    return 'customers';
  }
  if (fn === 'CMS') return subTab === 2 ? 'analytics' : 'content';
  if (fn === 'ADV') return 'advisor';
  if (fn === 'SEC') return 'security';
  if (fn === 'SET') return 'settings';
  return 'dashboard';
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  onBackToStorefront,
  onViewProductInStore,
}) => {
  const { adminProfile } = useAuth();
  const {
    products,
    collections,
    categories,
    content,
    settings,
    deleteProduct,
    deleteProducts,
    saveProduct,
    refreshProducts,
  } = useStorefrontData();

  // Terminal Function & Sub-Tab State
  const [fn, setFn] = useState<TerminalFnCode>('MON');
  const [activeSubTab, setActiveSubTab] = useState<number>(1);
  const [requestedSubTab, setRequestedSubTab] = useState<{
    fn: TerminalFnCode;
    subTab: number;
    nonce: number;
  } | null>(null);

  // Terminal Workspace Controls
  const [region, setRegion] = useState<TerminalRegion>('ZJ OPS Global');
  const [periodKind, setPeriodKind] = useState<TerminalPeriodKind>('Monthly');
  const [periodCount, setPeriodCount] = useState<number>(12);
  const [currency, setCurrency] = useState<TerminalCurrency>('EUR');
  const [showPctCols, setShowPctCols] = useState<boolean>(true);
  const [plotData, setPlotData] = useState<TerminalPlotData | null>(null);
  const [toastMessage, setToastMessage] = useState<string>('');
  const toastTimerRef = useRef<number | null>(null);
  const navNonceRef = useRef<number>(0);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('');
    }, 2800);
  }, []);

  // Operations console lock gate
  const [isTerminalLocked, setIsTerminalLocked] = useState<boolean>(() => {
    const unlockedTs = sessionStorage.getItem('zejesh_sec_unlocked_ts');
    if (unlockedTs) {
      const elapsed = (Date.now() - parseInt(unlockedTs, 10)) / 1000 / 60;
      if (elapsed < 15) return false;
    }
    return true;
  });

  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('zejesh_sec_autolock_mins');
    return saved ? parseInt(saved, 10) : 15;
  });

  // Security Audit Logs — real activity only
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const refreshAuditLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('auditLog')
        .select('*')
        .order('at', { ascending: false })
        .limit(100);
      if (!error && data) {
        setAuditLogs(data as AuditLog[]);
      }
    } catch (err) {
      console.warn('Audit log load failed:', err);
    }
  }, []);

  useEffect(() => {
    refreshAuditLogs();
    try {
      const channel = supabase
        .channel('admin-audit-logs-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auditLog' }, () => {
          refreshAuditLogs();
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('Audit log subscription failed:', err);
      return () => {};
    }
  }, [refreshAuditLogs]);

  const handleUpdateAutoLock = (mins: number) => {
    setAutoLockMinutes(mins);
    localStorage.setItem('zejesh_sec_autolock_mins', mins.toString());
  };

  const handleLockTerminalNow = useCallback(() => {
    setIsTerminalLocked(true);
    sessionStorage.removeItem('zejesh_sec_unlocked_ts');
    void logAuditEvent(adminProfile?.email || 'admin', 'TERMINAL_LOCKED', 'Console Manual Lockout').finally(() =>
      refreshAuditLogs()
    );
  }, [adminProfile?.email, refreshAuditLogs]);

  const handleUnlockTerminal = () => {
    setIsTerminalLocked(false);
    sessionStorage.setItem('zejesh_sec_unlocked_ts', Date.now().toString());
    void logAuditEvent(adminProfile?.email || 'admin', 'TERMINAL_UNLOCKED', 'Security Gate Clearance').finally(() =>
      refreshAuditLogs()
    );
  };

  // Inactivity Auto-Lock Detector
  const lastActivityRef = useRef<number>(Date.now());
  useEffect(() => {
    if (autoLockMinutes === 0) return;

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));

    const checkInterval = setInterval(() => {
      if (!isTerminalLocked) {
        const elapsedMinutes = (Date.now() - lastActivityRef.current) / (1000 * 60);
        if (elapsedMinutes >= autoLockMinutes) {
          handleLockTerminalNow();
        }
      }
    }, 15000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      clearInterval(checkInterval);
    };
  }, [autoLockMinutes, isTerminalLocked, handleLockTerminalNow]);

  // Real production datasets
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [discounts] = useState<Discount[]>(() => {
    try {
      const saved = localStorage.getItem('zejesh_discounts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [insights] = useState<AiInsight[]>([]);

  // Daily statistics computed from real orders only.
  const realDailyStats: DailyStat[] = useMemo(() => {
    if (orders.length === 0) return [];
    const map: Record<string, DailyStat> = {};
    for (const o of orders) {
      const d = (o.createdAt || new Date().toISOString()).slice(0, 10);
      if (!map[d]) {
        map[d] = {
          id: `stat-${d}`,
          date: d,
          revenue: 0,
          orders: 0,
          visitors: 0,
          sessions: 0,
          addToBags: 0,
          pageViews: 0,
        };
      }
      map[d].revenue += o.totals?.total || 0;
      map[d].orders += 1;
      map[d].addToBags += (o.items || []).reduce((s, it) => s + (it.quantity || 0), 0);
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [orders]);

  useEffect(() => {
    const unsubOrders = subscribeToOrders((liveOrders) => setOrders(liveOrders));
    const unsubCust = subscribeToCustomers((liveCust) => setCustomers(liveCust));
    const unsubWait = subscribeToWaitlist((liveWait) => setWaitlist(liveWait));

    return () => {
      unsubOrders();
      unsubCust();
      unsubWait();
    };
  }, []);

  // Control Plane Live Telemetry Overview
  const [controlOverview, setControlOverview] = useState<{
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
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadControl = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return;
        const res = await fetch('/api/control/overview', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json && typeof json === 'object') {
          setControlOverview({
            overallStatus: json.overallStatus,
            activeIncidents: json.activeIncidents,
            unacknowledgedAlerts: json.unacknowledgedAlerts,
            failingProbes: json.failingProbes,
            services: json.services,
          });
        }
      } catch {
        // Silently degrade if control plane endpoint is offline
      }
    };

    void loadControl();
    const iv = window.setInterval(loadControl, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  // Command palette & notifications state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Product Editor Drawer State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isEditorDrawerOpen, setIsEditorDrawerOpen] = useState(false);

  // Live operator presence
  const [liveVisitors, setLiveVisitors] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadLiveVisitors = async () => {
      try {
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const { count, error } = await supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .gte('timestamp', fiveMinutesAgo);
        if (!cancelled) {
          setLiveVisitors(!error && typeof count === 'number' ? count : 0);
        }
      } catch (err) {
        console.warn('Live visitor count failed:', err);
        if (!cancelled) setLiveVisitors(0);
      }
    };

    loadLiveVisitors();
    const timer = window.setInterval(loadLiveVisitors, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const openOrdersBadge = orders.filter(
    (o) => !['delivered', 'cancelled', 'refunded'].includes(o.status)
  ).length;
  const lowStockBadge = products.filter((p) => {
    const stk = p.variants?.length
      ? p.variants.reduce((s, v) => s + (v.stock || 0), 0)
      : p.stock || 0;
    return stk <= 4;
  }).length;

  const navItems: TerminalNavItem[] = useMemo(
    () => [
      { id: 'dashboard', group: 'Command', label: 'Overview', fn: 'MON', description: 'Live house monitor & command overview' },
      { id: 'control', group: 'Command', label: 'Control Plane', fn: 'CTL', subTab: 1, description: 'Infrastructure & operational intelligence' },
      { id: 'health', group: 'Command', label: 'System Health', fn: 'CTL', subTab: 2, description: 'Live service probes & diagnostics' },
      { id: 'products', group: 'Product', label: 'Products & Archive', fn: 'PRD', subTab: 2, badge: products.length, description: 'Garment catalog & pricing CRUD' },
      { id: 'collections', group: 'Product', label: 'Collections & Drops', fn: 'PRD', subTab: 3, badge: collections.length, description: 'Seasons & numbered releases' },
      { id: 'categories', group: 'Product', label: 'Categories', fn: 'PRD', subTab: 4, description: 'Catalogue taxonomy & routing' },
      { id: 'media', group: 'Product', label: 'Media Library', fn: 'PRD', subTab: 5, description: 'Cinematic campaign storage & targets' },
      { id: 'orders', group: 'Product', label: 'Order Book', fn: 'ORD', subTab: 2, badge: openOrdersBadge, description: 'Fulfilment, tracking & settlement CRUD' },
      { id: 'inventory', group: 'Product', label: 'Inventory Control', fn: 'INV', subTab: 2, badge: lowStockBadge || undefined, description: 'Size matrix & stock adjustments' },
      { id: 'discounts', group: 'Product', label: 'Discounts', fn: 'CUS', subTab: 5, description: 'Promo codes & private client privileges' },
      { id: 'customers', group: 'Growth', label: 'Clients', fn: 'CUS', subTab: 2, badge: customers.length, description: 'Client directory & LTV breakdown' },
      { id: 'waitlist', group: 'Growth', label: 'Waitlists', fn: 'CUS', subTab: 3, badge: waitlist.length || undefined, description: 'Private archive demand queue' },
      { id: 'suggestions', group: 'Growth', label: 'Suggestions & Votes', fn: 'CUS', subTab: 4, description: 'Client proposals & community poll governance' },
      { id: 'content', group: 'Studio', label: 'Hero Slides & CMS', fn: 'CMS', subTab: 1, badge: content?.heroSlides?.length, description: 'Editorial storytelling & film slots' },
      { id: 'analytics', group: 'Studio', label: 'Analytics (40)', fn: 'CMS', subTab: 2, description: '40 live commercial trajectories' },
      { id: 'advisor', group: 'Studio', label: 'AI Advisor', fn: 'ADV', description: 'Strategic decision support' },
      { id: 'atlas', group: 'Control', label: 'System Atlas', fn: 'CTL', subTab: 3, description: 'Every operating surface' },
      { id: 'security', group: 'Control', label: 'Security & Audit', fn: 'SEC', subTab: 1, description: 'Auto-lock gate & audit trail' },
      { id: 'settings', group: 'Control', label: 'Settings', fn: 'SET', description: 'House VAT, currency & shipping tiers' },
    ],
    [products.length, collections.length, openOrdersBadge, lowStockBadge, customers.length, waitlist.length, content?.heroSlides?.length]
  );

  const navigateFn = useCallback((nextFn: TerminalFnCode, subTab?: number) => {
    setFn(nextFn);
    if (typeof subTab === 'number') {
      setActiveSubTab(subTab);
      navNonceRef.current += 1;
      setRequestedSubTab({ fn: nextFn, subTab, nonce: navNonceRef.current });
    } else {
      setActiveSubTab(1);
    }
  }, []);

  const navigateView = useCallback((viewId: string) => {
    const target = VIEW_TO_TERMINAL[viewId] || { fn: 'MON' as TerminalFnCode };
    setFn(target.fn);
    const sub = target.subTab ?? 1;
    setActiveSubTab(sub);
    navNonceRef.current += 1;
    setRequestedSubTab({
      fn: target.fn,
      subTab: sub,
      nonce: navNonceRef.current,
    });
  }, []);

  const activeViewId = useMemo(() => resolveViewId(fn, activeSubTab), [fn, activeSubTab]);

  return (
    <>
      <AdminSecurityGate
        isLocked={isTerminalLocked}
        onUnlock={handleUnlockTerminal}
        onExitToStore={onBackToStorefront}
      />

      <TerminalLayout
        fn={fn}
        activeSubTab={activeSubTab}
        activeViewId={activeViewId}
        navItems={navItems}
        onNavigateFn={navigateFn}
        onNavigateView={navigateView}
        region={region}
        onChangeRegion={setRegion}
        currency={currency}
        onChangeCurrency={setCurrency}
        periodKind={periodKind}
        onChangePeriodKind={setPeriodKind}
        showPctCols={showPctCols}
        onChangeShowPctCols={setShowPctCols}
        products={products}
        orders={orders}
        customers={customers}
        waitlist={waitlist}
        collections={collections}
        categories={categories}
        discounts={discounts}
        auditLogs={auditLogs}
        settings={settings}
        liveVisitors={liveVisitors}
        controlOverview={controlOverview}
        notificationCount={openOrdersBadge + lowStockBadge}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenPalette={() => setIsCommandPaletteOpen(true)}
        onLockTerminal={handleLockTerminalNow}
        onCreateProduct={() => {
          setEditingProduct(null);
          setIsEditorDrawerOpen(true);
        }}
        onRefreshStore={refreshProducts}
        onBackToStorefront={onBackToStorefront}
        plotData={plotData}
        onClearPlot={() => setPlotData(null)}
        toastMessage={toastMessage}
        onToast={showToast}
      >
        <TerminalScreens
          fn={fn}
          onNavigateFn={(nextFn) => navigateFn(nextFn)}
          onNavigateLegacyView={navigateView}
          requestedSubTab={requestedSubTab}
          onSubTabChange={(changedFn, nextSub) => {
            if (changedFn === fn) setActiveSubTab(nextSub);
          }}
          region={region}
          onChangeRegion={setRegion}
          periodKind={periodKind}
          onChangePeriodKind={setPeriodKind}
          periodCount={periodCount}
          onChangePeriodCount={setPeriodCount}
          currency={currency}
          onChangeCurrency={setCurrency}
          showPctCols={showPctCols}
          onPlotMetric={(title, labels, values) => setPlotData({ title, labels, values })}
          onToast={showToast}
          products={products}
          orders={orders}
          customers={customers}
          waitlist={waitlist}
          collections={collections}
          categories={categories}
          discounts={discounts}
          content={content}
          settings={settings}
          auditLogs={auditLogs}
          liveVisitors={liveVisitors}
          realDailyStats={realDailyStats}
          insights={insights}
          autoLockMinutes={autoLockMinutes}
          onUpdateAutoLock={handleUpdateAutoLock}
          onLockTerminalNow={handleLockTerminalNow}
          onEditProduct={(p) => {
            setEditingProduct(p);
            setIsEditorDrawerOpen(true);
          }}
          onCreateProduct={() => {
            setEditingProduct(null);
            setIsEditorDrawerOpen(true);
          }}
          onViewProductInStore={onViewProductInStore}
          onRefreshProducts={refreshProducts}
          onDeleteProduct={deleteProduct}
          onDeleteProducts={deleteProducts}
          controlOverview={controlOverview}
        />
      </TerminalLayout>

      {/* Global Command Palette (Cmd+K), Notifications & Product Drawer in Terminal Scope */}
      <div className="admin-scope">
        <AdminCommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          products={products}
          onSelectProduct={(p) => {
            setEditingProduct(p);
            setIsEditorDrawerOpen(true);
          }}
          onNavigateView={navigateView}
        />

        <AdminNotificationsModal
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          products={products}
          orders={orders}
          insights={insights}
          onNavigateView={navigateView}
        />

        <AdminProductEditorDrawer
          isOpen={isEditorDrawerOpen}
          product={editingProduct}
          onClose={() => setIsEditorDrawerOpen(false)}
          onSaveSuccess={(updated) => {
            void saveProduct(updated);
          }}
          onDeleteProduct={deleteProduct}
          categories={categories}
          collections={collections}
        />
      </div>
    </>
  );
};
