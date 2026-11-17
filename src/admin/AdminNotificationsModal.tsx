import React from 'react';
import { AlertTriangle, PackageCheck, Sparkles, X } from 'lucide-react';
import { AiInsight, Order, Product } from '../types';

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

  const lowStock = products.filter((p) => {
    const total = p.variants
      ? p.variants.reduce((a, v) => a + v.stock, 0)
      : p.stock || 0;
    return total > 0 && total < 4;
  });

  const newOrders = orders
    .filter((o) => o.status === 'new' || o.status === 'paid')
    .slice(0, 3);

  const totalAlerts = lowStock.length + newOrders.length + insights.length;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-end p-4 sm:p-6">
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/35 backdrop-blur-[1px]"
      />

      <div className="relative z-10 flex max-h-[85vh] w-full max-w-sm flex-col border border-black bg-white text-[13px] text-black animate-fadeIn">
        <div className="flex items-center justify-between border-b border-black/15 bg-[#fafafa] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-black">
              Studio Alerts
            </span>
            <span className="bg-black px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white">
              {totalAlerts}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-black/45 transition-colors hover:text-black"
            aria-label="Close notifications"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-4">
          {lowStock.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-black/10 pb-2">
                <span className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#b91c1c]">
                  <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span>Low Stock ({lowStock.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateView('inventory');
                    onClose();
                  }}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/65 underline underline-offset-4 hover:text-black"
                >
                  Open Inventory
                </button>
              </div>
              {lowStock.slice(0, 4).map((p) => (
                <div key={p.id} className="border-b border-black/[0.06] py-1.5 last:border-b-0">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[11px] text-black/75">{p.nr}</span>
                    <span className="font-mono text-[11px] text-[#b91c1c]">{p.stock} units</span>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-black/60">
                    {p.name.en || p.name.fi}
                  </div>
                </div>
              ))}
            </div>
          )}

          {newOrders.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-black/10 pb-2">
                <span className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-black">
                  <PackageCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span>Open Orders</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateView('orders');
                    onClose();
                  }}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/65 underline underline-offset-4 hover:text-black"
                >
                  Open Orders
                </button>
              </div>
              {newOrders.map((o) => (
                <div key={o.id} className="border-b border-black/[0.06] py-1.5 last:border-b-0">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[11px] text-black">{o.number}</span>
                    <span className="font-mono text-[11px] tabular-nums text-black/75">
                      {o.totals.total} €
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-black/60">
                    {o.customer.name}
                  </div>
                </div>
              ))}
            </div>
          )}

          {insights.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-black/10 pb-2">
                <span className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-black">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span>Advisor Signals</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateView('advisor');
                    onClose();
                  }}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/65 underline underline-offset-4 hover:text-black"
                >
                  Open Advisor
                </button>
              </div>
              {insights.slice(0, 2).map((ins) => (
                <div key={ins.id} className="border-b border-black/[0.06] py-1.5 last:border-b-0">
                  <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-black/55">
                    {ins.priority} Priority
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[12.5px] text-black">
                    {ins.title}
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalAlerts === 0 && (
            <div className="py-8 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-black/45">
              All queues nominal · Zero pending alerts
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
