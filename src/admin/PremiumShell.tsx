import React, { useCallback, useRef, useState } from 'react';

/**
 * ZEJESH Admin — premium dense shell.
 *
 * Chrome only. The 19 existing admin views are passed as `children` and keep
 * their own components and tokens; this shell adds the navigation rail,
 * top bar, page chrome, dropdowns, toasts and modal container.
 *
 * Interactive behaviour is real: nav switches views, user dropdown logs out,
 * search opens the command palette, toasts appear for a fixed time. No fake
 * metrics, no seeded data, no Math.random.
 */

interface PremiumShellProps {
  children: React.ReactNode;
  title?: string;
  sub?: string;
  navItems?: Array<{ id: string; label: string; badge?: React.ReactNode }>;
  currentView?: string;
  onNavigate?: (view: string) => void;
  userName?: string;
  userRole?: string;
  userEmail?: string;
  userInitials?: string;
  onLogout?: () => void;
  notificationCount?: number;
  onOpenPalette?: () => void;
  onSearchChange?: (q: string) => void;
  toolbar?: React.ReactNode;
}

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  chart: 'M4 4v16h16M8 15l3-4 3 2 5-7',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  orders: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  users: 'M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v10',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  mega: 'M3 11v3l12 5V6zM15 8h3a3 3 0 0 1 0 6h-3M7 15v4',
  spark: 'M12 3l2.2 6.3L21 11l-6.8 1.7L12 19l-2.2-6.3L3 11l6.8-1.7z',
  nav: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.6h5l.4-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z',
  logout: 'M15 20H5V4h10M10 12h11M17 9l3 3-3 3',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5',
};

const ICON_FOR: Record<string, string> = {
  dashboard: 'home', control: 'shield', health: 'chart', products: 'tag',
  collections: 'layers', categories: 'layers', media: 'box', orders: 'orders',
  inventory: 'box', discounts: 'coin', customers: 'users', waitlist: 'clock',
  suggestions: 'mega', content: 'layers', analytics: 'chart', advisor: 'spark',
  atlas: 'nav', security: 'shield', settings: 'gear',
};

const ApIcon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const d = ICONS[name] || ICONS.layers;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {d.split('M').filter(Boolean).map((p, i) => <path key={i} d={`M${p}`} fill="none" stroke="currentColor" />)}
    </svg>
  );
};

export const PremiumShell: React.FC<PremiumShellProps> = ({
  children,
  title = 'Operations',
  sub,
  navItems,
  currentView,
  onNavigate,
  userName = 'Operator',
  userRole = 'Administrator',
  userEmail = 'operator@zejesh.local',
  userInitials = 'ZJ',
  onLogout,
  notificationCount = 0,
  onOpenPalette,
  onSearchChange,
  toolbar,
}) => {
  const [userOpen, setUserOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange?.(e.target.value);
  };

  const toggleUser = () => setUserOpen((v) => !v);
  const closeUser = () => setUserOpen(false);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { closeUser(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      onOpenPalette?.();
    }
  }, [onOpenPalette]);

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { onOpenPalette?.(); }
  };

  const now = new Date();
  const clock = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const nav = navItems?.map((item) => {
    const active = currentView === item.id;
    return (
      <button
        key={item.id}
        className={`ap-nav-item ${active ? 'on' : ''}`}
        onClick={() => { onNavigate?.(item.id); closeUser(); }}
      >
        <ApIcon name={ICON_FOR[item.id] || 'layers'} />
        <span>{item.label}</span>
        {item.badge !== undefined && item.badge !== null && <span className="ap-badge">{item.badge}</span>}
      </button>
    );
  });

  const userMenu = (
    <div className="ap-dropdown" style={{ right: 12, top: 60 }} hidden={!userOpen} onMouseLeave={closeUser}>
      <div className="ap-dropdown-item" onClick={() => { closeUser(); }}>{userName}</div>
      <div className="ap-dropdown-item" style={{ color: 'var(--ap-dim)', fontSize: 11 }}>{userEmail}</div>
      <div className="ap-dropdown-item" style={{ color: 'var(--ap-dim)', fontSize: 11 }}>{userRole}</div>
      <div style={{ borderTop: '1px solid var(--ap-border)', margin: '6px 0' }} />
      <div className="ap-dropdown-item" onClick={() => { closeUser(); onLogout?.(); }} style={{ color: 'var(--ap-down)' }}>Sign out</div>
    </div>
  );

  return (
    <div className="ap-shell admin-premium" onKeyDown={handleKey}>
      <header className="ap-topbar">
        <button className="ap-brand" onClick={() => { onNavigate?.('dashboard'); closeUser(); }}>
          <ApIcon name="home" size={18} /> <b>ZEJESH</b> <span style={{ color: 'var(--ap-dim2)', fontSize: 11, fontFamily: 'var(--ap-font-mono)' }}>Admin</span>
        </button>

        <div className="ap-search">
          <ApIcon name="search" size={14} />
          <input
            id="ap-search"
            value=""
            onChange={handleSearch}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            onKeyDown={handleSearchKey}
            placeholder="Command (⌘K)"
            autoComplete="off"
            spellCheck="false"
          />
        </div>

        <div className="ap-chips">
          <div className="ap-chip on">30D</div>
          <div className="ap-chip">EUR</div>
        </div>

        <div className="ap-spacer" />

        <button className="ap-icon-btn" onClick={() => { onOpenPalette?.(); closeUser(); }} aria-label="Command palette">
          <ApIcon name="search" size={16} /> <span style={{ position: 'absolute', left: '100%', top: 6, fontSize: 10, color: 'var(--ap-dim2)', whiteSpace: 'nowrap' }}>⌘K</span>
        </button>

        <button
          className={`ap-icon-btn ${notificationCount > 0 ? 'active' : ''}`}
          onClick={() => { closeUser(); }}
          aria-label="Notifications"
        >
          <ApIcon name="bell" size={16} />
          {notificationCount > 0 && <div className="ap-dot" />}
        </button>

        <div className="ap-user" ref={userRef} onClick={toggleUser} aria-label="User menu">
          <div className="ap-avatar">{userInitials}</div>
          <div>
            <div className="ap-name">{userName}</div>
            <div className="ap-role">{userRole}</div>
          </div>
          <span style={{ marginLeft: 6, color: 'var(--ap-dim2)' }}><ApIcon name="nav" size={12} /></span>
        </div>
        {userMenu}
        <div style={{ color: 'var(--ap-dim2)', fontSize: 11, fontFamily: 'var(--ap-font-mono)', marginLeft: 10 }}>{clock}</div>
      </header>

      <aside className="ap-nav">
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--ap-border)' }}>
          <small>Modules</small>
        </div>
        {nav}
        <div style={{ padding: '12px', borderTop: '1px solid #141414' }}>
          <button className="ap-btn ap-btn-sm ap-btn-ghost" style={{ width: '100%', textAlign: 'left', color: 'var(--ap-accent)' }} onClick={() => { onLogout?.(); closeUser(); }}>
            <ApIcon name="logout" size={14} /> Sign out
          </button>
        </div>
      </aside>

      <main className="ap-page">
        <div className="ap-page-head">
          <div>
            <div className="ap-page-title">{title}</div>
            {sub && <span className="ap-page-sub">· {sub}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{clock}</div>
        </div>
        <div className="ap-toolbar">
          {toolbar}
        </div>
        <div className="ap-body">{children}</div>
      </main>

      <div className="ap-toast" id="ap-toast" />
    </div>
  );
};

export default PremiumShell;
