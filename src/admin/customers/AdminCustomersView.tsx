import React, { useState } from 'react';
import { Customer } from '../../types';
import { Search, Mail, ShoppingBag, Heart, User, Check, X, Users, Plus } from 'lucide-react';

interface AdminCustomersViewProps {
  customers: Customer[];
}

export const AdminCustomersView: React.FC<AdminCustomersViewProps> = ({ customers }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'vip' | 'returning' | 'new' | 'wishlisters'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(customers[0] || null);

  // Keep selectedCustomer in sync
  React.useEffect(() => {
    if (!selectedCustomer && customers.length > 0) {
      setSelectedCustomer(customers[0]);
    } else if (selectedCustomer && !customers.some((c) => c.id === selectedCustomer.id)) {
      setSelectedCustomer(customers[0] || null);
    }
  }, [customers, selectedCustomer]);

  const filteredCustomers = customers.filter((c) => {
    if (segmentFilter === 'vip' && (c.totals?.spend || 0) < 1000) return false;
    if (segmentFilter === 'returning' && (c.totals?.orders || 0) <= 1) return false;
    if (segmentFilter === 'new' && (c.totals?.orders || 0) > 1) return false;
    if (segmentFilter === 'wishlisters' && (!c.wishlist || c.wishlist.length === 0)) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="border-b border-paper-a18 pb-4">
        <h1 className="font-display text-[38px] font-light leading-[1.05] tracking-[-0.01em] text-paper">Customer Directory & CRM</h1>
        <p className="text-[13px] font-light text-paper-a45 mt-1 max-w-2xl leading-relaxed">
          Archival patron profiles, lifetime valuation, verified order cadence, and privacy consent.
        </p>
      </div>

      {customers.length === 0 ? (
        <div className="p-16 border border-paper-a18 text-center space-y-5">
          <div className="w-12 h-12 mx-auto flex items-center justify-center text-paper-a45">
            <Users className="w-6 h-6" strokeWidth={1.4} />
          </div>
          <div>
            <h3 className="font-display text-[24px] font-light text-paper mb-2">No customer profiles recorded yet</h3>
            <p className="text-[13px] font-light text-paper-a45 max-w-md mx-auto leading-relaxed">
              Real customer profiles will be automatically created and enriched here as shoppers complete checkout or create accounts.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Segment filters */}
          <div className="flex flex-wrap gap-6 micro-sm border-b border-paper-a18 pb-3">
            {[
              { id: 'all', label: `All Patrons (${customers.length})` },
              { id: 'vip', label: 'VIP (> 1,000 € spend)' },
              { id: 'returning', label: 'Repeat Collectors' },
              { id: 'new', label: 'First-Time' },
              { id: 'wishlisters', label: 'Wishlisters' },
            ].map((seg) => (
              <button
                key={seg.id}
                type="button"
                onClick={() => setSegmentFilter(seg.id as any)}
                className={`transition-colors cursor-pointer py-1 ${ segmentFilter === seg.id ? 'text-paper underline underline-offset-[6px]'
                    : 'text-paper-a45 hover:text-paper'
                }`}
              >
                {seg.label}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative border-b border-paper-a18">
            <Search className="w-3.5 h-3.5 absolute left-0 top-1/2 -translate-y-1/2 text-paper-a45" strokeWidth={1.4} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by customer name or email..."
              className="field pl-7 !border-0"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Customer Table */}
            <div className="lg:col-span-6 border border-paper-a18 overflow-y-auto max-h-[700px]">
              {filteredCustomers.length === 0 ? (
                <div className="p-10 text-center micro-sm text-paper-a45">No customers match criteria.</div>
              ) : (
                filteredCustomers.map((cust) => {
                  const isSelected = selectedCustomer?.id === cust.id;
                  return (
                    <div
                      key={cust.id}
                      onClick={() => setSelectedCustomer(cust)}
                      className={`p-5 border-b border-paper-a18 last:border-b-0 transition-colors cursor-pointer text-[13px] ${ isSelected ? 'bg-paper text-ink' : 'hover:bg-paper-a06'
                      }`}
                    >
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className={`font-normal ${isSelected ? 'text-ink' : 'text-paper'}`}>{cust.name}</span>
                        <span className="font-mono text-[12px]">{cust.totals?.spend || 0} €</span>
                      </div>
                      <div className={`text-[12px] font-light truncate ${isSelected ? 'text-ink-a64' : 'text-paper-a45'}`}>{cust.email}</div>
                      <div className={`micro-sm mt-2 flex justify-between ${isSelected ? 'text-ink-a40' : 'text-paper-a45'}`}>
                        <span>{cust.totals?.orders || 0} orders placed</span>
                        <span>Wishlist: {cust.wishlist?.length || 0} items</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right Column: Customer Dossier */}
            {selectedCustomer && (
              <div className="lg:col-span-6 border border-paper-a18 p-6 space-y-8 text-[13px]">
                <div className="border-b border-paper-a18 pb-5">
                  <div className="flex items-center justify-between">
                    <span className="micro-sm text-paper-a45">Patron Dossier</span>
                    <span className={`micro-sm px-2 py-1 border ${ (selectedCustomer.totals?.spend || 0) >= 1000 ? 'bg-paper text-ink border-paper' : 'border-paper-a18 text-paper-a72'}`}>
                      {(selectedCustomer.totals?.spend || 0) >= 1000 ? 'VIP Patron' : 'Standard'}
                    </span>
                  </div>
                  <h2 className="font-display text-[30px] font-light text-paper mt-2">{selectedCustomer.name}</h2>
                  <div className="text-paper-a45 text-[12px] flex items-center gap-2 mt-1.5">
                    <Mail className="w-3 h-3" strokeWidth={1.4} />
                    <span>{selectedCustomer.email}</span>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-px bg-paper-a18 border border-paper-a18">
                  <div className="bg-ink p-5">
                    <span className="micro-sm text-paper-a45 block mb-2">Lifetime Valuation</span>
                    <span className="font-display text-[32px] font-light leading-none">{selectedCustomer.totals?.spend || 0} €</span>
                  </div>
                  <div className="bg-ink p-5">
                    <span className="micro-sm text-paper-a45 block mb-2">Orders Completed</span>
                    <span className="font-display text-[32px] font-light leading-none">{selectedCustomer.totals?.orders || 0}</span>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="space-y-3 border-t border-paper-a18 pt-5 micro-sm">
                  <div className="flex justify-between">
                    <span className="text-paper-a45">First Interaction</span>
                    <span className="font-mono text-paper">{new Date(selectedCustomer.firstSeen).toLocaleDateString('en-US')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-paper-a45">Latest Activity</span>
                    <span className="font-mono text-paper">{new Date(selectedCustomer.lastSeen).toLocaleDateString('en-US')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-paper-a45">GDPR Marketing Consent</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-paper text-ink">
                      <Check className="w-3 h-3" strokeWidth={1.6} />
                      <span>Granted</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
