import React, { useState, useEffect } from 'react';
import { Search, X, Package, Layers, FolderTree, Image, ShoppingBag, Settings, Sparkles, ArrowRight, Gauge } from 'lucide-react';
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
    { id: 'dashboard', code: 'MON', label: 'Overview · Command Monitor', icon: Gauge },
    { id: 'control', code: 'CTL', label: 'Control Plane', icon: Gauge },
    { id: 'health', code: 'CTL', label: 'System Health', icon: Gauge },
    { id: 'products', code: 'PRD', label: 'Products & Archive', icon: Package },
    { id: 'collections', code: 'PRD', label: 'Collections & Drops', icon: Layers },
    { id: 'categories', code: 'PRD', label: 'Categories', icon: FolderTree },
    { id: 'media', code: 'PRD', label: 'Media Library', icon: Image },
    { id: 'orders', code: 'ORD', label: 'Order Book', icon: ShoppingBag },
    { id: 'inventory', code: 'INV', label: 'Inventory Control', icon: Package },
    { id: 'discounts', code: 'CUS', label: 'Discounts & Privileges', icon: Package },
    { id: 'customers', code: 'CUS', label: 'Client Directory', icon: Package },
    { id: 'waitlist', code: 'CUS', label: 'Waitlists', icon: Package },
    { id: 'suggestions', code: 'CUS', label: 'Suggestions & Votes', icon: Sparkles },
    { id: 'content', code: 'CMS', label: 'Hero Slides & CMS', icon: Layers },
    { id: 'analytics', code: 'CMS', label: 'Analytics · 40 Trajectories', icon: Gauge },
    { id: 'advisor', code: 'ADV', label: 'AI Executive Advisor', icon: Sparkles },
    { id: 'atlas', code: 'CTL', label: 'System Atlas', icon: Layers },
    { id: 'security', code: 'SEC', label: 'Security & Audit', icon: Settings },
    { id: 'settings', code: 'SET', label: 'Settings', icon: Settings },
  ];

  const filteredNav = quickNav.filter(
    (n) =>
      n.label.toLowerCase().includes(query.toLowerCase()) ||
      n.code.toLowerCase().includes(query.toLowerCase())
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
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 px-4">
      <div onClick={onClose} className="fixed inset-0 bg-ink/85" />

      <div className="relative w-full max-w-2xl bg-[#050505] border border-[#ffa21f] z-10 overflow-hidden animate-fadeIn">
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 bg-[#111111] border-b border-[#2c2c2c]">
          <span className="text-[11px] font-semibold text-[#ffa21f] mr-3 px-1.5 py-0.5 bg-[#241600] border border-[#5a3a00]">
            CMD
          </span>
          <Search className="w-4 h-4 text-[#9a9a9a] mr-2.5" strokeWidth={1.5} />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to screen, code (ORD, PRD, CTL...) or SKU..."
            className="w-full text-[13px] !bg-transparent !border-0 text-[#ececec] placeholder:text-[#666666] outline-none"
          />
          <button onClick={onClose} className="p-1 text-[#9a9a9a] hover:text-[#ffa21f] cursor-pointer transition-colors">
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto bg-[#050505]">
          {/* Matched Products */}
          {filteredProducts.length > 0 && (
            <div className="border-b border-[#262626] py-1">
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-[#ffa21f] bg-[#141414]">
                MATCHING SKUs ({filteredProducts.length})
              </div>
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelectProduct(p);
                    onClose();
                  }}
                  className="w-full px-4 py-2 text-left flex items-center justify-between hover:bg-[#10223f] group transition-colors cursor-pointer border-b border-[#141414]"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="text-[11px] font-mono text-[#ffa21f]">{p.nr || p.plateNumber}</span>
                    <span className="text-[12.5px] text-[#ececec]">{p.name.en || p.name.fi}</span>
                    <span className="text-[11px] text-[#7a7a7a]">({p.name.fi})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] font-mono text-[#42c6ff]">{p.price} €</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#7a7a7a] group-hover:text-[#ffa21f]" strokeWidth={1.5} />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Navigation Shortcuts */}
          <div className="py-1">
            <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-[#9a9a9a] bg-[#101010] border-b border-[#1c1c1c]">
              TERMINAL MODULES ({filteredNav.length})
            </div>
            {filteredNav.map((n) => {
              const Icon = n.icon;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    onNavigateView(n.id);
                    onClose();
                  }}
                  className="w-full px-4 py-2 text-left flex items-center justify-between hover:bg-[#10223f] group transition-colors cursor-pointer border-b border-[#141414]"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[10.5px] font-mono font-semibold text-[#ffa21f] min-w-[30px]">
                      {n.code}
                    </span>
                    <Icon className="w-3.5 h-3.5 text-[#9a9a9a] group-hover:text-[#ececec]" strokeWidth={1.5} />
                    <span className="text-[12.5px] text-[#ececec]">{n.label}</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[#555555] group-hover:text-[#ffa21f]" strokeWidth={1.5} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-2 border-t border-[#262626] bg-[#0d0d0d] flex items-center justify-between text-[11px] text-[#9a9a9a]">
          <span>Select a module or SKU · Esc to dismiss</span>
          <button onClick={onClose} className="hover:text-[#ffa21f] cursor-pointer transition-colors">
            [ESC] CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
