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
import { AtelierShell, type AtelierNavItem } from './AtelierShell';

import { AdminDashboardView } from './dashboard/AdminDashboardView';
import { AdminControlPlaneView } from './control/AdminControlPlaneView';
import { AdminSystemHealthView } from './health/AdminSystemHealthView';
import { AdminProductsView } from './products/AdminProductsView';
import { AdminCollectionsView } from './collections/AdminCollectionsView';
import { AdminCategoriesView } from './categories/AdminCategoriesView';
import { AdminMediaView } from './media/AdminMediaView';
import { AdminOrdersView } from './orders/AdminOrdersView';
import { AdminInventoryView } from './inventory/AdminInventoryView';
import { AdminDiscountsView } from './discounts/AdminDiscountsView';
import { AdminCustomersView } from './customers/AdminCustomersView';
import { AdminWaitlistView } from './waitlist/AdminWaitlistView';
import { AdminSuggestionsView } from './suggestions/AdminSuggestionsView';
import { AdminContentView } from './content/AdminContentView';
import { AdminAnalyticsView } from './analytics/AdminAnalyticsView';
import { AdminAdvisorView } from './advisor/AdminAdvisorView';
import { AdminAtlasView } from './atlas/AdminAtlasView';
import { AdminSecurityView } from './security/AdminSecurityView';
import { AdminSettingsView } from './settings/AdminSettingsView';

interface AdminLayoutProps {
  onBackToStorefront: () => void;
  onViewProductInStore: (product: Product) => void;
  previewMode?: boolean;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  onBackToStorefront,
  onViewProductInStore,
  previewMode = false,
}) => {
  const { adminProfile, role } = useAuth();
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

  const [activeViewId, setActiveViewId] = useState<string>('dashboard');
  const [toastMessage, setToastMessage] = useState<string>('');
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('');
    }, 2800);
  }, []);

  // Operations console lock gate: unlocked on local previewMode unless operator clicks Lock
  const [isConsoleLocked, setIsConsoleLocked] = useState<boolean>(() => {
    if (previewMode) return false;
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

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const refreshAuditLogs = useCallback(async () => {
    if (previewMode) return;
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
  }, [previewMode]);

  useEffect(() => {
    if (previewMode) return;
    void refreshAuditLogs();
    try {
      const channel = supabase
        .channel('admin-audit-logs-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auditLog' }, () => {
          void refreshAuditLogs();
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('Audit log subscription failed:', err);
      return () => {};
    }
  }, [previewMode, refreshAuditLogs]);

  const handleUpdateAutoLock = (mins: number) => {
    setAutoLockMinutes(mins);
    localStorage.setItem('zejesh_sec_autolock_mins', mins.toString());
  };

  const handleLockConsoleNow = useCallback(() => {
    setIsConsoleLocked(true);
    sessionStorage.removeItem('zejesh_sec_unlocked_ts');
    if (!previewMode) {
      void logAuditEvent(adminProfile?.email || 'admin', 'TERMINAL_LOCKED', 'Console Manual Lockout').finally(() =>
        refreshAuditLogs()
      );
    }
  }, [adminProfile?.email, previewMode, refreshAuditLogs]);

  const handleUnlockConsole = () => {
    setIsConsoleLocked(false);
    sessionStorage.setItem('zejesh_sec_unlocked_ts', Date.now().toString());
    if (!previewMode) {
      void logAuditEvent(adminProfile?.email || 'admin', 'TERMINAL_UNLOCKED', 'Security Gate Clearance').finally(() =>
        refreshAuditLogs()
      );
    }
  };

  // Inactivity Auto-Lock Detector
  const lastActivityRef = useRef<number>(Date.now());
  useEffect(() => {
    if (autoLockMinutes === 0 || previewMode) return;

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));

    const checkInterval = setInterval(() => {
      if (!isConsoleLocked) {
        const elapsedMinutes = (Date.now() - lastActivityRef.current) / (1000 * 60);
        if (elapsedMinutes >= autoLockMinutes) {
          handleLockConsoleNow();
        }
      }
    }, 15000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      clearInterval(checkInterval);
    };
  }, [autoLockMinutes, isConsoleLocked, previewMode, handleLockConsoleNow]);

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
    if (previewMode) return;
    const unsubOrders = subscribeToOrders((liveOrders) => setOrders(liveOrders));
    const unsubCust = subscribeToCustomers((liveCust) => setCustomers(liveCust));
    const unsubWait = subscribeToWaitlist((liveWait) => setWaitlist(liveWait));

    return () => {
      unsubOrders();
      unsubCust();
      unsubWait();
    };
  }, [previewMode]);

  const [controlOverview, setControlOverview] = useState<{
    overallStatus?: string;
  } | null>(null);

  useEffect(() => {
    if (previewMode) return;
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
          setControlOverview({ overallStatus: json.overallStatus || json.status });
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
  }, [previewMode]);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isEditorDrawerOpen, setIsEditorDrawerOpen] = useState(false);
  const [liveVisitors, setLiveVisitors] = useState(0);

  useEffect(() => {
    if (previewMode) return;
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

    void loadLiveVisitors();
    const timer = window.setInterval(loadLiveVisitors, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [previewMode]);

  const openOrdersBadge = orders.filter(
    (o) => !['delivered', 'cancelled', 'refunded'].includes(o.status)
  ).length;

  const lowStockBadge = products.filter((p) => {
    const stk = p.variants?.length
      ? p.variants.reduce((s, v) => s + (v.stock || 0), 0)
      : p.stock || 0;
    return stk <= 4;
  }).length;

  const navItems: AtelierNavItem[] = useMemo(
    () => [
      { id: 'dashboard', group: 'Command', label: 'Overview', description: 'House command monitor, telemetry & live posture' },
      { id: 'control', group: 'Command', label: 'Control Plane', description: 'Infrastructure diagnostics, alerts & SLOs' },
      { id: 'health', group: 'Command', label: 'System Health', description: 'Live service probes & endpoint checks' },

      { id: 'products', group: 'Catalogue', label: 'Products & Archive', badge: products.length, description: 'Garment catalog, pricing & variant CRUD' },
      { id: 'collections', group: 'Catalogue', label: 'Collections & Drops', badge: collections.length, description: 'Seasons & numbered releases' },
      { id: 'categories', group: 'Catalogue', label: 'Categories', badge: categories.length, description: 'Catalogue taxonomy & routing' },
      { id: 'media', group: 'Catalogue', label: 'Media Library', description: 'Editorial imagery & campaign slots' },

      { id: 'orders', group: 'Commerce', label: 'Order Book', badge: openOrdersBadge, description: 'Fulfillment, tracking & settlement ledger' },
      { id: 'inventory', group: 'Commerce', label: 'Inventory Control', badge: lowStockBadge || undefined, description: 'Size matrix & stock adjustments' },
      { id: 'discounts', group: 'Commerce', label: 'Discounts', description: 'Promo codes & private client privileges' },

      { id: 'customers', group: 'Clientele', label: 'Clients', badge: customers.length, description: 'Client directory & LTV breakdown' },
      { id: 'waitlist', group: 'Clientele', label: 'Waitlists', badge: waitlist.length || undefined, description: 'Private archive demand queue' },
      { id: 'suggestions', group: 'Clientele', label: 'Suggestions & Votes', description: 'Client proposals & community poll governance' },

      { id: 'content', group: 'House', label: 'Hero Slides & CMS', badge: content?.heroSlides?.length, description: 'Editorial storytelling, journal & film slots' },
      { id: 'analytics', group: 'House', label: 'Analytics (40)', description: '40 live commercial trajectories' },
      { id: 'advisor', group: 'House', label: 'AI Advisor', description: 'Strategic decision intelligence' },
      { id: 'atlas', group: 'House', label: 'System Atlas', description: 'Registry of every surface, table & probe' },
      { id: 'security', group: 'House', label: 'Security & Audit', description: 'Auto-lock gate & audit trail' },
      { id: 'settings', group: 'House', label: 'Settings', description: 'House VAT, currency & shipping tiers' },
    ],
    [
      products.length,
      collections.length,
      categories.length,
      openOrdersBadge,
      lowStockBadge,
      customers.length,
      waitlist.length,
      content?.heroSlides?.length,
    ]
  );

  const handleExportOrdersCsv = useCallback(() => {
    const headers = ['Order_Ref', 'Date', 'Client', 'Email', 'Status', 'Total_EUR'];
    const rows = orders.map((o) => [
      o.number,
      (o.createdAt || '').slice(0, 10),
      `"${(o.customer?.name || 'Guest').replaceAll('"', '""')}"`,
      o.customer?.email || '',
      o.status,
      String(o.totals?.total || 0),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zejesh-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`Exported ${orders.length} orders to CSV`);
  }, [orders, showToast]);

  const operatorName = adminProfile?.name || (previewMode ? 'Atelier Preview' : 'Operator');
  const operatorEmail = adminProfile?.email || 'operator@zejesh.fi';
  const operatorRole = adminProfile?.role || role || 'Administrator';

  const renderActiveView = () => {
    switch (activeViewId) {
      case 'dashboard':
        return (
          <AdminDashboardView
            adminName={operatorName}
            role={operatorRole}
            products={products}
            orders={orders}
            customers={customers}
            waitlist={waitlist}
            collections={collections}
            liveVisitors={liveVisitors}
            onNavigateView={setActiveViewId}
          />
        );
      case 'control':
        return <AdminControlPlaneView />;
      case 'health':
        return <AdminSystemHealthView />;
      case 'products':
        return (
          <AdminProductsView
            products={products}
            onEditProduct={(p) => {
              setEditingProduct(p);
              setIsEditorDrawerOpen(true);
            }}
            onCreateProduct={() => {
              setEditingProduct(null);
              setIsEditorDrawerOpen(true);
            }}
            onViewProductInStore={onViewProductInStore}
            onRefresh={refreshProducts}
            onDeleteProduct={deleteProduct}
            onDeleteProducts={deleteProducts}
          />
        );
      case 'collections':
        return (
          <AdminCollectionsView
            collections={collections}
            products={products}
            onRefresh={refreshProducts}
          />
        );
      case 'categories':
        return (
          <AdminCategoriesView
            categories={categories}
            onRefresh={refreshProducts}
          />
        );
      case 'media':
        return <AdminMediaView products={products} />;
      case 'orders':
        return <AdminOrdersView orders={orders} onRefresh={refreshProducts} />;
      case 'inventory':
        return <AdminInventoryView products={products} onRefresh={refreshProducts} />;
      case 'discounts':
        return <AdminDiscountsView discounts={discounts} onRefresh={refreshProducts} />;
      case 'customers':
        return <AdminCustomersView customers={customers} />;
      case 'waitlist':
        return (
          <AdminWaitlistView
            waitlist={waitlist}
            collections={collections}
            onRefresh={refreshProducts}
          />
        );
      case 'suggestions':
        return <AdminSuggestionsView />;
      case 'content':
        return content ? (
          <AdminContentView content={content} onRefresh={refreshProducts} />
        ) : (
          <div className="border border-paper-a18 p-6 text-[13px] text-paper-a45">
            Loading storefront editorial slots…
          </div>
        );
      case 'analytics':
        return (
          <AdminAnalyticsView
            products={products}
            dailyStats={realDailyStats}
            orders={orders}
          />
        );
      case 'advisor':
        return (
          <AdminAdvisorView
            products={products}
            dailyStats={realDailyStats}
            insights={insights}
            onRefresh={refreshProducts}
            onNavigateView={setActiveViewId}
          />
        );
      case 'atlas':
        return (
          <AdminAtlasView
            products={products}
            orders={orders}
            customers={customers}
            waitlist={waitlist}
            collections={collections}
            onNavigateView={setActiveViewId}
          />
        );
      case 'security':
        return (
          <AdminSecurityView
            autoLockMinutes={autoLockMinutes}
            onUpdateAutoLock={handleUpdateAutoLock}
            onLockTerminalNow={handleLockConsoleNow}
            auditLogs={auditLogs}
          />
        );
      case 'settings':
        return settings ? (
          <AdminSettingsView settings={settings} onRefresh={refreshProducts} />
        ) : (
          <div className="border border-paper-a18 p-6 text-[13px] text-paper-a45">
            Loading store settings…
          </div>
        );
      default:
        return (
          <AdminDashboardView
            adminName={operatorName}
            role={operatorRole}
            products={products}
            orders={orders}
            customers={customers}
            waitlist={waitlist}
            collections={collections}
            liveVisitors={liveVisitors}
            onNavigateView={setActiveViewId}
          />
        );
    }
  };

  return (
    <>
      <AdminSecurityGate
        isLocked={isConsoleLocked}
        onUnlock={handleUnlockConsole}
        onExitToStore={onBackToStorefront}
      />

      <AtelierShell
        activeViewId={activeViewId}
        navItems={navItems}
        onNavigateView={setActiveViewId}
        onOpenPalette={() => setIsCommandPaletteOpen(true)}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onCreateProduct={() => {
          setEditingProduct(null);
          setIsEditorDrawerOpen(true);
        }}
        onExportOrdersCsv={handleExportOrdersCsv}
        onRefreshStore={() => {
          refreshProducts();
          showToast('Synced store data');
        }}
        onLockConsole={handleLockConsoleNow}
        onBackToStorefront={onBackToStorefront}
        notificationCount={openOrdersBadge + lowStockBadge}
        adminName={operatorName}
        adminEmail={operatorEmail}
        adminRole={operatorRole}
        liveVisitors={liveVisitors}
        controlStatus={controlOverview?.overallStatus}
        previewMode={previewMode}
        toastMessage={toastMessage}
      >
        {renderActiveView()}
      </AtelierShell>

      <div className="admin-scope">
        <AdminCommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          products={products}
          onSelectProduct={(p) => {
            setEditingProduct(p);
            setIsEditorDrawerOpen(true);
          }}
          onNavigateView={setActiveViewId}
        />

        <AdminNotificationsModal
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          products={products}
          orders={orders}
          insights={insights}
          onNavigateView={setActiveViewId}
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
