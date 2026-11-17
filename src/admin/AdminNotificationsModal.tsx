import React from 'react';
import { X, AlertTriangle, PackageCheck, Sparkles, Clock, ArrowRight } from 'lucide-react';
import { Product, Order, AiInsight } from '../types';

interface AdminNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  orders: Order[];
  insights: AiInsight[];
  onNavigateView: (view: string) => void;
}

export const AdminNotificationsModal: React.FC<AdminNotificationsModalProps> = ({
  isOpen,
  onClose,
  products,
  orders,
  insights,
  onNavigateView,
}) => {
  if (!isOpen) return null;

  // Derive low stock products (stock < 4)
  const lowStock = products.filter((p) => {
    const total = p.variants ? p.variants.reduce((a, v) => a + v.stock, 0) : (p.stock || 0);
    return total > 0 && total < 4;
  });

  // New pending orders
  const newOrders = orders.filter((o) => o.status === 'new' || o.status === 'paid').slice(0, 3);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-end p-4 sm:p-6">
      <div onClick={onClose} className="fixed inset-0 bg-ink/85" />

      <div className="relative w-full max-w-sm bg-[#050505] border border-[#ffa21f] z-10 animate-fadeIn flex flex-col max-h-[85vh] text-[12.5px]">
        <div className="px-4 py-3 bg-[#141414] border-b border-[#2c2c2c] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#ffa21f]">
              STUDIO ALERTS
            </span>
            <span className="text-[10.5px] font-mono bg-[#ffa21f] text-[#000000] px-1.5 font-semibold">
              {lowStock.length + newOrders.length + insights.length}
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-[#9a9a9a] hover:text-[#ffa21f] cursor-pointer transition-colors">
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-5">
          {/* Low Stock Warnings */}
          {lowStock.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#262626]">
                <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#ff4b43]">
                  <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Low Stock ({lowStock.length})</span>
                </span>
                <button
                  onClick={() => {
                    onNavigateView('inventory');
                    onClose();
                  }}
                  className="text-[11px] text-[#42c6ff] hover:text-[#ffa21f] transition-colors underline underline-offset-4"
                >
                  OPEN INV
                </button>
              </div>
              {lowStock.slice(0, 4).map((p) => (
                <div key={p.id} className="py-1 border-b border-[#141414]">
                  <div className="flex justify-between items-baseline">
                    <span className="font-mono text-[11px] text-[#ffa21f]">{p.nr}</span>
                    <span className="text-[11px] text-[#ff4b43]">{p.stock} units</span>
                  </div>
                  <div className="text-[11.5px] text-[#a0a0a0] truncate mt-0.5">{p.name.en || p.name.fi}</div>
                </div>
              ))}
            </div>
          )}

          {/* New Orders */}
          {newOrders.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#262626]">
                <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#42c6ff]">
                  <PackageCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Open Orders</span>
                </span>
                <button
                  onClick={() => {
                    onNavigateView('orders');
                    onClose();
                  }}
                  className="text-[11px] text-[#42c6ff] hover:text-[#ffa21f] transition-colors underline underline-offset-4"
                >
                  OPEN ORD
                </button>
              </div>
              {newOrders.map((o) => (
                <div key={o.id} className="py-1 border-b border-[#141414]">
                  <div className="flex justify-between items-baseline">
                    <span className="font-mono text-[11px] text-[#ffa21f]">{o.number}</span>
                    <span className="font-mono text-[11px] text-[#2fd35f]">{o.totals.total} €</span>
                  </div>
                  <div className="text-[11.5px] text-[#a0a0a0] truncate mt-0.5">{o.customer.name}</div>
                </div>
              ))}
            </div>
          )}

          {/* AI Insights */}
          {insights.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#262626]">
                <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#ffa21f]">
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Advisor Signals</span>
                </span>
                <button
                  onClick={() => {
                    onNavigateView('advisor');
                    onClose();
                  }}
                  className="text-[11px] text-[#42c6ff] hover:text-[#ffa21f] transition-colors underline underline-offset-4"
                >
                  OPEN ADV
                </button>
              </div>
              {insights.slice(0, 2).map((ins) => (
                <div key={ins.id} className="py-1 border-b border-[#141414]">
                  <div className="text-[10.5px] text-[#ffa21f]">
                    [{ins.priority} PRIORITY]
                  </div>
                  <div className="text-[12px] text-[#ececec] mt-0.5 line-clamp-1">{ins.title}</div>
                </div>
              ))}
            </div>
          )}

          {lowStock.length === 0 && newOrders.length === 0 && insights.length === 0 && (
            <div className="py-6 text-center text-[11.5px] text-[#7a7a7a]">
              ALL QUEUES NOMINAL · ZERO PENDING ALERTS
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
