import React from 'react';
import { Language, StoreSettings } from '../types';

interface FooterProps {
  language: Language;
  onSetLanguage: (lang: Language) => void;
  onSelectCategory: (cat: string, sub?: string) => void;
  onNavigatePage: (route: any) => void;
  onNavigateAdmin?: () => void;
  settings?: StoreSettings;
  dark?: boolean;
}

const columns = [
  {
    title: 'The house',
    links: [
      { label: 'Our story', route: { type: 'story' } },
      { label: 'Lookbook', route: { type: 'lookbook' } },
      { label: 'Journal', route: { type: 'journal' } },
      { label: 'Suggest a piece', route: { type: 'vote' } },
    ],
  },
  {
    title: 'Collection',
    links: [
      { label: 'New arrivals', category: 'all' },
      { label: 'Women', category: 'naiset' },
      { label: 'Men', category: 'miehet' },
      { label: 'Accessories', category: 'asusteet' },
    ],
  },
  {
    title: 'Client services',
    links: [
      { label: 'Contact', route: { type: 'service', slug: 'contact' } },
      { label: 'Shipping & returns', route: { type: 'service', slug: 'shipping-returns' } },
      { label: 'Track an order', route: { type: 'service', slug: 'tracking' } },
      { label: 'Size guide', route: { type: 'service', slug: 'size-guide' } },
    ],
  },
  {
    title: 'Care',
    links: [
      { label: 'Materials', route: { type: 'about', slug: 'materials' } },
      { label: 'Circular charter', route: { type: 'about', slug: 'sustainability' } },
      { label: 'Ateliers', route: { type: 'about', slug: 'workshops' } },
      { label: 'Account', route: { type: 'auth', mode: 'signin' } },
    ],
  },
];

export const Footer: React.FC<FooterProps> = ({ onSelectCategory, onNavigatePage, onNavigateAdmin, dark = false }) => {
  const year = new Date().getFullYear();
  const stroke = dark ? '1px rgba(255,255,255,0.55)' : '1px rgba(0,0,0,0.55)';

  return (
    <footer
      data-dark-section={dark || undefined}
      className={`footer ${
        dark ? 'footer--dark bg-ink text-paper' : 'border-t border-ink-a14 bg-paper text-ink'
      }`}
    >
      <div className="page-shell pt-16 md:pt-24">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <span className="label text-[8px] text-ink-a40">ZEJESH — House of modern clothing</span>
            <p className="mt-7 max-w-[22ch] font-display text-[clamp(30px,3vw,42px)] leading-[1.02] tracking-[-0.025em]">
              Dress the body.
              <br />
              Leave the <em>room quiet.</em>
            </p>
            <div className="mt-10 space-y-1.5 label text-[8px] leading-relaxed text-ink-a45">
              <p>Helsinki — Pursimiehenkatu 12</p>
              <p>Porto — Ribeira workshop</p>
              <p>Enquiries — house@zejesh.fi</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-4 lg:col-span-7 lg:col-start-6">
            {columns.map((col) => (
              <div key={col.title}>
                <span className="label text-[8px] text-ink-a40">{col.title}</span>
                <ul className="mt-6 space-y-3">
                  {col.links.map((link: any) => (
                    <li key={link.label}>
                      <button
                        type="button"
                        onClick={() =>
                          link.category
                            ? onSelectCategory(link.category)
                            : onNavigatePage(link.route)
                        }
                        className="group relative inline-flex min-h-[26px] items-center text-[13px] font-light text-ink-a72 transition-colors duration-300 hover:text-ink"
                      >
                        {link.label}
                      </button>
                    </li>
                  ))}
                  {col.title === 'Care' && onNavigateAdmin && (
                    <li>
                      <button
                        type="button"
                        onClick={onNavigateAdmin}
                        className="group relative inline-flex min-h-[26px] items-center text-[13px] font-light text-ink-a72 transition-colors duration-300 hover:text-ink"
                      >
                        Admin Console
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-5 border-t border-ink-a14 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5 label text-[8px] text-ink-a40">
            <span className="inline-flex items-center gap-2">
              <span className="block h-1 w-1 rounded-full bg-ink" />
              Open 2026
            </span>
            <span className="hidden sm:inline">Helsinki · Porto</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 label text-[8px] text-ink-a40">
            <span className="transition-colors hover:text-ink">Instagram</span>
            <span className="transition-colors hover:text-ink">Pinterest</span>
            <span className="transition-colors hover:text-ink">Are.na</span>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex min-h-[32px] items-center gap-2 text-ink-a64 transition-colors hover:text-ink"
              aria-label="Back to top"
            >
              Back to top <span aria-hidden="true">↑</span>
            </button>
          </div>
        </div>
      </div>

      {/* the mark, drawn at full width */}
      <div className="group relative select-none overflow-hidden pt-4">
        <h2
          className="cursor-default whitespace-nowrap text-center font-display text-[clamp(74px,19.2vw,368px)] leading-[0.72] tracking-[0.02em] transition-all duration-700"
          style={{ color: 'transparent', WebkitTextStroke: stroke }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = dark ? '#fff' : 'var(--ink)';
            e.currentTarget.style.setProperty('-webkit-text-stroke', `1px ${dark ? '#fff' : 'var(--ink)'}`);
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'transparent';
            e.currentTarget.style.setProperty('-webkit-text-stroke', stroke);
          }}
        >
          ZEJESH
        </h2>
      </div>

      <div className="page-shell flex flex-col gap-3 border-t border-ink-a14 py-5 sm:flex-row sm:items-center sm:justify-between">
        <span className="label text-[8px] text-ink-a40">
          © {year} ZEJESH. All rights reserved.
        </span>
        <div className="flex flex-wrap items-center gap-6 label text-[8px] text-ink-a40">
          <button type="button" onClick={() => onNavigatePage({ type: 'legal', slug: 'terms' })} className="hover:text-ink">
            Terms
          </button>
          <button type="button" onClick={() => onNavigatePage({ type: 'legal', slug: 'privacy' })} className="hover:text-ink">
            Privacy
          </button>
          <button type="button" onClick={() => onNavigatePage({ type: 'legal', slug: 'cookies' })} className="hover:text-ink">
            Cookies
          </button>
          <span>Sitemap</span>
        </div>
      </div>
    </footer>
  );
};
