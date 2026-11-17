import React, { useEffect, useRef, useState } from 'react';
import type { OpsCurrency, OpsRange } from './OpsOverview';

/* Reference icon paths (24×24, stroked) so the console chrome matches 1:1. */
const PATHS: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  orders: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  users: 'M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1a3.5 3.5 0 0 0-2.5-3.3',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  factory: 'M3 21V10l6 4v-4l6 4V6h6v15zM7 17h2M13 17h2',
  chart: 'M4 4v16h16M8 15l3-4 3 2 5-7',
  mega: 'M3 11v3l12 5V6zM15 8h3a3 3 0 0 1 0 6h-3M7 15v4',
  store: 'M4 9l1-5h14l1 5M4 9v11h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M10 20v-5h4v5',
  ret: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v10M9.5 9.5C9.5 8.5 10.5 8 12 8s2.5.6 2.5 1.6S13.3 11 12 11.3 9.5 12 9.5 13.4 10.5 16 12 16s2.5-.6 2.5-1.5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M6 6l12 12M18 6L6 18',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.6h5l.4-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z',
  spark: 'M12 3l2.2 6.3L21 11l-6.8 1.7L12 19l-2.2-6.3L3 11l6.8-1.7z',
  logout: 'M15 20H5V4h10M10 12h11M17 9l3 3-3 3',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  nav: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
};

/** Map app section ids onto the reference icon set. */
const ICON_FOR: Record<string, string> = {
  dashboard: 'home',
  control: 'shield',
  health: 'chart',
  products: 'tag',
  collections: 'layers',
  categories: 'layers',
  media: 'box',
  orders: 'orders',
  inventory: 'box',
  discounts: 'coin',
  customers: 'users',
  waitlist: 'clock',
  suggestions: 'mega',
  content: 'layers',
  analytics: 'chart',
  advisor: 'spark',
  atlas: 'nav',
  security: 'shield',
  settings: 'gear',
};

export const OpsIcon: React.FC<{ name: string; className?: string }> = ({ name, className }) => {
  const d = PATHS[name] || PATHS.layers;
  return (
    <svg viewBox="0 0 24 24" className={className}>
      {d
        .split('M')
        .filter(Boolean)
        .map((p, i) => (
          <path key={i} d={`M${p}`} />
        ))}
    </svg>
  );
};

export interface OpsNavItem {
  id: string;
  label: string;
  badge?: React.ReactNode;
}

export interface OpsNavGroup {
  group: string;
  items: OpsNavItem[];
}

interface OperationsShellProps {
  groups: OpsNavGroup[];
  currentView: string;
  onNavigate: (view: string) => void;
  range: OpsRange;
  onRangeChange: (r: OpsRange) => void;
  region: string;
  regions: string[];
  onRegionChange: (r: string) => void;
  currency: OpsCurrency;
  onCurrencyChange: (c: OpsCurrency) => void;
  onOpenPalette: () => void;
  onOpenNotifications: () => void;
  onLock: () => void;
  onBackToStorefront: () => void;
  operatorName: string;
  role: string;
  initials: string;
  notificationCount: number;
  children: React.ReactNode;
}

const RANGES: OpsRange[] = ['7D', '30D', '90D', '12M'];
const CURRENCIES: OpsCurrency[] = ['EUR', 'USD', 'GBP'];

export const OperationsShell: React.FC<OperationsShellProps> = ({
  groups,
  currentView,
  onNavigate,
  range,
  onRangeChange,
  region,
  regions,
  onRegionChange,
  currency,
  onCurrencyChange,
  onOpenPalette,
  onOpenNotifications,
  onLock,
  onBackToStorefront,
  operatorName,
  role,
  initials,
  notificationCount,
  children,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);

  /* tooltip for chart hit areas — same behaviour as the reference */
  useEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    let timer = 0;
    const over = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null;
      if (!target) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!tipRef.current) return;
        tipRef.current.innerHTML = target.dataset.tip || '';
        const r = target.getBoundingClientRect();
        const x = Math.min(window.innerWidth - 280, Math.max(12, r.left + r.width / 2 - 100));
        const y = r.top - 52;
        tipRef.current.style.left = `${x}px`;
        tipRef.current.style.top = `${Math.max(12, y)}px`;
        tipRef.current.style.opacity = '1';
      }, 40);
    };
    const out = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-tip]');
      if (!target) return;
      window.clearTimeout(timer);
      if (tipRef.current) tipRef.current.style.opacity = '0';
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
    };
  }, []);

  return (
    <div className="app">
      <div className={`scrim ${mobileOpen ? 'on' : ''}`} onClick={() => setMobileOpen(false)} />

      <aside id="nav" className={mobileOpen ? 'on' : ''}>
        <div className="brand">
          <b>ZEJESH</b>
          <span>Operations</span>
        </div>

        <nav className="nav">
          {groups.map((g) => (
            <div className="ng" key={g.group}>
              <small>{g.group}</small>
              {g.items.map((item) => {
                const active = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    className={`ni ${active ? 'on' : ''}`}
                    data-go={item.id}
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileOpen(false);
                    }}
                  >
                    <OpsIcon name={ICON_FOR[item.id] || 'layers'} />
                    {item.label}
                    {item.badge !== undefined && item.badge !== null && <em>{item.badge}</em>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="me">
          <span className="av">{initials || 'ZJ'}</span>
          <p>
            {operatorName}
            <br />
            <small>{role}</small>
          </p>
          <button
            type="button"
            onClick={onLock}
            title="Lock terminal"
            style={{ marginLeft: 'auto', border: 0, background: 'none', color: 'inherit', opacity: 0.5 }}
          >
            <OpsIcon name="shield" />
          </button>
        </div>
      </aside>

      <main>
        <header className="top">
          <button className="ib" id="menu" aria-label="Menu" onClick={() => setMobileOpen((v) => !v)}>
            <OpsIcon name={mobileOpen ? 'x' : 'menu'} />
          </button>

          <button className="find" aria-label="Search" onClick={onOpenPalette}>
            <OpsIcon name="search" />
            <span>Search console</span>
            <kbd>Ctrl K</kbd>
          </button>

          <div className="grow" />

          <div className="seg hide-m">
            {RANGES.map((r) => (
              <button key={r} className={range === r ? 'on' : ''} onClick={() => onRangeChange(r)}>
                {r}
              </button>
            ))}
          </div>

          <select className="sel hide-m" aria-label="Region" value={region} onChange={(e) => onRegionChange(e.target.value)}>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <select
            className="sel hide-m"
            aria-label="Currency"
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value as OpsCurrency)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button className="ib" aria-label="Notifications" onClick={onOpenNotifications}>
            <OpsIcon name="bell" />
            {notificationCount > 0 && <span className="dot" />}
          </button>
        </header>

        <div className="pg-wrap">
          {children}
          <div className="foot">
            <span>ZEJESH Operations · live console</span>
            <span>
              <button
                type="button"
                onClick={onBackToStorefront}
                style={{ border: 0, background: 'none', color: 'inherit', textDecoration: 'underline' }}
              >
                Storefront
              </button>{' '}
              · {role}
            </span>
          </div>
        </div>
      </main>

      <div id="tip" ref={tipRef} />
    </div>
  );
};
