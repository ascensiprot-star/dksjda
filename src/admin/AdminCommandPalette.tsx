import React, { useState } from 'react';
import {
  ArrowRight,
  FolderTree,
  Gauge,
  Image,
  Layers,
  Package,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { Product } from '../types';

interface AdminCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectProduct: (p: Product) => void;
  onNavigateView: (view: string) => void;
}

export const AdminCommandPalette: React.FC<AdminCommandPaletteProps> = ({
  isOpen,
  onClose,
  products,
  onSelectProduct,
  onNavigateView,
}) => {
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const quickNav = [
    { id: 'dashboard', group: 'Command', label: 'Overview · House Monitor', icon: Gauge },
    { id: 'control', group: 'Command', label: 'Control Plane', icon: Gauge },
    { id: 'health', group: 'Command', label: 'System Health', icon: Gauge },
    { id: 'products', group: 'Catalogue', label: 'Products & Archive', icon: Package },
    { id: 'collections', group: 'Catalogue', label: 'Collections & Drops', icon: Layers },
    { id: 'categories', group: 'Catalogue', label: 'Categories', icon: FolderTree },
    { id: 'media', group: 'Catalogue', label: 'Media Library', icon: Image },
    { id: 'orders', group: 'Commerce', label: 'Order Book', icon: ShoppingBag },
    { id: 'inventory', group: 'Commerce', label: 'Inventory Control', icon: Package },
    { id: 'discounts', group: 'Commerce', label: 'Discounts & Privileges', icon: Package },
    { id: 'customers', group: 'Clientele', label: 'Client Directory', icon: Package },
    { id: 'waitlist', group: 'Clientele', label: 'Waitlists', icon: Package },
    { id: 'suggestions', group: 'Clientele', label: 'Suggestions & Votes', icon: Sparkles },
    { id: 'content', group: 'House', label: 'Hero Slides & CMS', icon: Layers },
    { id: 'analytics', group: 'House', label: 'Analytics · 40 Trajectories', icon: Gauge },
    { id: 'advisor', group: 'House', label: 'AI Executive Advisor', icon: Sparkles },
    { id: 'atlas', group: 'House', label: 'System Atlas', icon: Layers },
    { id: 'security', group: 'House', label: 'Security & Audit', icon: Settings },
    { id: 'settings', group: 'House', label: 'Settings', icon: Settings },
  ];

  const filteredNav = quickNav.filter(
    (n) =>
      n.label.toLowerCase().includes(query.toLowerCase()) ||
      n.group.toLowerCase().includes(query.toLowerCase())
  );

  const filteredProducts = query.trim()
    ? products
        .filter(
          (p) =>
            p.nr?.toLowerCase().includes(query.toLowerCase()) ||
            p.name.fi.toLowerCase().includes(query.toLowerCase()) ||
            p.name.en.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 6)
    : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-16">
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/35 backdrop-blur-[1px]"
      />

      <div className="relative z-10 w-full max-w-2xl overflow-hidden border border-black bg-white text-black animate-fadeIn">
        {/* Search Input */}
        <div className="flex items-center border-b border-black/15 bg-[#fafafa] px-4 py-3.5">
          <Search className="mr-3 h-4 w-4 text-black/45" strokeWidth={1.5} />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to module, garment title, or SKU…"
            className="!h-auto !border-0 !bg-transparent !p-0 text-[13.5px] text-black placeholder:text-black/40 outline-none w-full"
          />
          <button
            type="button"
            onClick={onClose}
            className="ml-2 p-1 text-black/45 transition-colors hover:text-black"
            aria-label="Close command search"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto bg-white">
          {/* Matched Products */}
          {filteredProducts.length > 0 && (
            <div className="border-b border-black/12">
              <div className="border-b border-black/10 bg-[#fafafa] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-black/55">
                Matching Garments ({filteredProducts.length})
              </div>
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectProduct(p);
                    onClose();
                  }}
                  className="group flex w-full items-center justify-between border-b border-black/[0.06] px-4 py-2.5 text-left transition-colors hover:bg-[#fafafa] last:border-b-0"
                >
                  <div className="flex min-w-0 items-baseline gap-3">
                    <span className="shrink-0 font-mono text-[11px] text-black/55">
                      {p.nr || p.plateNumber}
                    </span>
                    <span className="truncate text-[13px] text-black">
                      {p.name.en || p.name.fi}
                    </span>
                    <span className="hidden truncate text-[11.5px] text-black/45 sm:inline">
                      {p.name.fi}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-[12px] tabular-nums text-black/75">
                      {p.price} €
                    </span>
                    <ArrowRight
                      className="h-3.5 w-3.5 text-black/35 transition-transform group-hover:translate-x-0.5 group-hover:text-black"
                      strokeWidth={1.5}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Navigation Shortcuts */}
          <div>
            <div className="border-b border-black/10 bg-[#fafafa] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-black/55">
              Atelier Modules ({filteredNav.length})
            </div>
            {filteredNav.map((n) => {
              const Icon = n.icon;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    onNavigateView(n.id);
                    onClose();
                  }}
                  className="group flex w-full items-center justify-between border-b border-black/[0.06] px-4 py-2.5 text-left transition-colors hover:bg-[#fafafa] last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="min-w-[74px] font-mono text-[10px] uppercase tracking-[0.12em] text-black/45">
                      {n.group}
                    </span>
                    <Icon
                      className="h-3.5 w-3.5 text-black/50 group-hover:text-black"
                      strokeWidth={1.4}
                    />
                    <span className="text-[13px] text-black">{n.label}</span>
                  </div>
                  <ArrowRight
                    className="h-3.5 w-3.5 text-black/30 transition-transform group-hover:translate-x-0.5 group-hover:text-black"
                    strokeWidth={1.5}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-black/10 bg-[#fafafa] px-4 py-2 font-mono text-[10.5px] text-black/55">
          <span>Select a module or garment</span>
          <button
            type="button"
            onClick={onClose}
            className="uppercase tracking-[0.12em] hover:text-black"
          >
            Esc · Close
          </button>
        </div>
      </div>
    </div>
  );
};
