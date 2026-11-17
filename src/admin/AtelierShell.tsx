import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Bell,
  Boxes,
  Clock3,
  Command,
  Download,
  FileText,
  FolderTree,
  Gauge,
  Image as ImageIcon,
  Layers,
  Lock,
  Menu,
  Network,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Percent,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
  Vote,
  X,
} from 'lucide-react';

export interface AtelierNavItem {
  id: string;
  group: 'Command' | 'Catalogue' | 'Commerce' | 'Clientele' | 'House';
  label: string;
  description: string;
  badge?: number;
}

interface AtelierShellProps {
  activeViewId: string;
  navItems: AtelierNavItem[];
  onNavigateView: (viewId: string) => void;
  onOpenPalette: () => void;
  onOpenNotifications: () => void;
  onCreateProduct: () => void;
  onExportOrdersCsv: () => void;
  onRefreshStore: () => void;
  onLockConsole: () => void;
  onBackToStorefront: () => void;
  notificationCount: number;
  adminName: string;
  adminEmail: string;
  adminRole: string;
  liveVisitors: number;
  controlStatus?: string;
  previewMode?: boolean;
  toastMessage?: string;
  children: React.ReactNode;
}

const VIEW_ICONS: Record<string, React.ElementType> = {
  dashboard: Gauge,
  control: Activity,
  health: Network,
  products: Package,
  collections: Layers,
  categories: FolderTree,
  media: ImageIcon,
  orders: ShoppingBag,
  inventory: Boxes,
  discounts: Percent,
  customers: Users,
  waitlist: Clock3,
  suggestions: Vote,
  content: FileText,
  analytics: TrendingUp,
  advisor: Sparkles,
  atlas: Network,
  security: ShieldCheck,
  settings: Settings,
};

const GROUPS: Array<AtelierNavItem['group']> = [
  'Command',
  'Catalogue',
  'Commerce',
  'Clientele',
  'House',
];

export const AtelierShell: React.FC<AtelierShellProps> = ({
  activeViewId,
  navItems,
  onNavigateView,
  onOpenPalette,
  onOpenNotifications,
  onCreateProduct,
  onExportOrdersCsv,
  onRefreshStore,
  onLockConsole,
  onBackToStorefront,
  notificationCount,
  adminName,
  adminEmail,
  adminRole,
  liveVisitors,
  controlStatus,
  previewMode = false,
  toastMessage,
  children,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeItem = useMemo(
    () => navItems.find((item) => item.id === activeViewId) || navItems[0],
    [activeViewId, navItems]
  );

  // Global Cmd+K / Ctrl+K shortcut for Quick Command Search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenPalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenPalette]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefreshStore();
    window.setTimeout(() => setIsRefreshing(false), 600);
  };

  const initials = useMemo(() => {
    const clean = (adminName || adminEmail || 'ZJ').trim();
    if (!clean) return 'ZJ';
    const parts = clean.split(/[\s@._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }, [adminName, adminEmail]);

  const renderSidebarContent = (isMobile = false) => {
    const compact = !isMobile && sidebarCollapsed;
    return (
      <div className="flex h-full flex-col bg-[#fafafa] text-[#000000]">
        {/* Brand Header */}
        <div
          className={`flex h-14 shrink-0 items-center border-b border-black/10 ${
            compact ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          {!compact && (
            <button
              type="button"
              onClick={() => {
                onNavigateView('dashboard');
                if (isMobile) setMobileNavOpen(false);
              }}
              className="flex min-w-0 items-baseline gap-2.5 text-left"
            >
              <span className="font-display text-[19px] font-normal tracking-[0.14em] text-black">
                ZEJESH
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45">
                Atelier
              </span>
            </button>
          )}
          {isMobile ? (
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="flex h-8 w-8 items-center justify-center text-black/60 hover:text-black"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="hidden h-8 w-8 items-center justify-center text-black/55 transition-colors hover:bg-black/5 hover:text-black lg:flex"
              aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
              title={compact ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {compact ? (
                <PanelLeftOpen className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
          )}
        </div>

        {/* Navigation Groups */}
        <nav
          aria-label="Admin modules"
          className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4"
        >
          {GROUPS.map((group) => {
            const items = navItems.filter((item) => item.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                {!compact ? (
                  <div className="mb-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
                    {group}
                  </div>
                ) : (
                  <div className="mx-2 my-2 border-t border-black/10" />
                )}
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = VIEW_ICONS[item.id] || Layers;
                    const active = item.id === activeViewId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onNavigateView(item.id);
                          if (isMobile) setMobileNavOpen(false);
                        }}
                        title={compact ? `${item.label} — ${item.description}` : undefined}
                        className={`group flex w-full items-center gap-3 px-2.5 py-2 text-left text-[13px] transition-colors ${
                          compact ? 'justify-center' : 'justify-between'
                        } ${
                          active
                            ? 'bg-black font-normal text-white'
                            : 'font-light text-black/75 hover:bg-black/[0.045] hover:text-black'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              active ? 'text-white' : 'text-black/50 group-hover:text-black'
                            }`}
                            strokeWidth={1.4}
                          />
                          {!compact && <span className="truncate">{item.label}</span>}
                        </span>
                        {!compact && typeof item.badge === 'number' && item.badge > 0 && (
                          <span
                            className={`shrink-0 font-mono text-[11px] tabular-nums ${
                              active ? 'text-white/75' : 'text-black/45'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Operator Footer */}
        <div className="shrink-0 border-t border-black/10 bg-[#fafafa] p-3">
          {!compact ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 px-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-black font-mono text-[11px] font-medium text-white">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-normal text-black">
                    {adminName}
                  </div>
                  <div className="truncate font-mono text-[10px] text-black/50">
                    {adminRole}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={onLockConsole}
                  className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap border border-black/15 bg-white px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-black/75 transition-colors hover:border-black hover:text-black"
                >
                  <Lock className="h-3 w-3 shrink-0" strokeWidth={1.4} />
                  <span>Lock</span>
                </button>
                <button
                  type="button"
                  onClick={onBackToStorefront}
                  className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap border border-black/15 bg-white px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-black/75 transition-colors hover:border-black hover:text-black"
                >
                  <ArrowLeft className="h-3 w-3 shrink-0" strokeWidth={1.4} />
                  <span>Storefront</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onLockConsole}
                className="flex h-8 w-8 items-center justify-center border border-black/15 bg-white text-black/70 hover:border-black hover:text-black"
                title="Lock Console"
                aria-label="Lock Console"
              >
                <Lock className="h-3.5 w-3.5" strokeWidth={1.4} />
              </button>
              <button
                type="button"
                onClick={onBackToStorefront}
                className="flex h-8 w-8 items-center justify-center border border-black/15 bg-white text-black/70 hover:border-black hover:text-black"
                title="Return to Storefront"
                aria-label="Return to Storefront"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.4} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="admin-scope flex min-h-screen w-full bg-white text-black">
      {/* Desktop Rail */}
      <aside
        className={`admin-rail hidden shrink-0 border-r border-black/10 transition-[width] duration-200 lg:sticky lg:top-0 lg:block lg:h-screen ${
          sidebarCollapsed ? 'lg:w-[68px]' : 'lg:w-[252px]'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[90] flex lg:hidden">
          <div
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 bg-black/35 backdrop-blur-[1px]"
          />
          <aside className="relative z-10 h-full w-[272px] max-w-[85vw] border-r border-black/15 bg-[#fafafa]">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        {/* Top Utility Header */}
        <header className="admin-masthead sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-black/10 bg-white px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center border border-black/15 text-black/75 hover:border-black hover:text-black lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" strokeWidth={1.5} />
            </button>

            <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] tracking-[0.06em]">
              <span className="hidden text-black/45 sm:inline">{activeItem?.group || 'Command'}</span>
              <span className="hidden text-black/25 sm:inline">/</span>
              <span className="truncate font-medium text-black">{activeItem?.label || 'Overview'}</span>
              {previewMode && (
                <span className="hidden border border-black/15 bg-[#fafafa] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-black/65 md:inline-block whitespace-nowrap">
                  Local Workspace
                </span>
              )}
            </div>
          </div>

          {/* Command Search & Action Controls */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenPalette}
              className="hidden h-8 items-center gap-3 border border-black/15 bg-[#fafafa] px-3 text-[12px] text-black/60 transition-colors hover:border-black hover:text-black md:inline-flex whitespace-nowrap shrink-0"
              aria-label="Quick search"
            >
              <Command className="h-3.5 w-3.5 text-black/50" strokeWidth={1.5} />
              <span>Search modules, SKUs…</span>
              <kbd className="border border-black/15 bg-white px-1.5 py-0.5 font-mono text-[10px] text-black/55">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={onOpenPalette}
              className="flex h-8 w-8 items-center justify-center border border-black/15 text-black/70 hover:border-black hover:text-black md:hidden shrink-0"
              aria-label="Search"
            >
              <Command className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              className="hidden h-8 items-center gap-1.5 border border-black/15 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-black/70 transition-colors hover:border-black hover:text-black sm:inline-flex whitespace-nowrap shrink-0"
              title="Refresh house data"
            >
              <RefreshCw
                className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`}
                strokeWidth={1.5}
              />
              <span className="hidden xl:inline">Sync</span>
            </button>

            <button
              type="button"
              onClick={onExportOrdersCsv}
              className="hidden h-8 items-center gap-1.5 border border-black/15 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-black/70 transition-colors hover:border-black hover:text-black xl:inline-flex whitespace-nowrap shrink-0"
              title="Export order book CSV"
            >
              <Download className="h-3 w-3" strokeWidth={1.5} />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={onOpenNotifications}
              className="relative inline-flex h-8 items-center gap-1.5 border border-black/15 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-black/75 transition-colors hover:border-black hover:text-black whitespace-nowrap shrink-0"
              aria-label="Alerts"
            >
              <Bell className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span className="tabular-nums">{notificationCount}</span>
            </button>

            <button
              type="button"
              onClick={onCreateProduct}
              className="inline-flex h-8 items-center gap-1.5 bg-black px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white transition-opacity hover:opacity-85 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
              <span className="hidden sm:inline">New Garment</span>
            </button>

            <button
              type="button"
              onClick={onBackToStorefront}
              className="inline-flex h-8 items-center gap-1.5 border border-black/15 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-black/80 transition-colors hover:border-black hover:bg-black hover:text-white whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
              <span className="hidden sm:inline">Storefront</span>
            </button>
          </div>
        </header>

        {/* Quiet Sub-Header Context Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.07] bg-[#fafafa] px-4 py-2 sm:px-8">
          <span className="text-[12px] font-light text-black/65">
            {activeItem?.description}
          </span>
          <div className="flex items-center gap-5 font-mono text-[10.5px] tabular-nums text-black/55 whitespace-nowrap shrink-0">
            <span>{liveVisitors} live window</span>
            <span>
              Posture:{' '}
              <strong className="font-medium text-black">
                {controlStatus ? controlStatus.replaceAll('_', ' ') : previewMode ? 'local' : 'active'}
              </strong>
            </span>
          </div>
        </div>

        {/* View Body */}
        <main className="mx-auto w-full max-w-[1620px] flex-1 px-4 py-7 sm:px-8 sm:py-9">
          {children}
        </main>
      </div>

      {/* Clean Minimal Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[130] border border-black bg-black px-4 py-2.5 font-mono text-[11px] tracking-[0.06em] text-white">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
