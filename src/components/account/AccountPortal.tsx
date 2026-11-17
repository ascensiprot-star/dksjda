import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Heart,
  Key,
  LogOut,
  MapPin,
  Package,
  RefreshCw,
  Save,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../../supabase/AuthContext';
import { fetchAccountOverview, saveAccountProfile } from '../../supabase/accountService';
import type { AccountAddress, AccountOverview, Order, OrderStatus, Product } from '../../types';

interface AccountPortalProps {
  user: User;
  onNavigateHome: () => void;
  onNavigateAdmin: () => void;
  onNavigateArchive: () => void;
  wishlistProducts: Product[];
  onSelectProduct: (product: Product) => void;
  onOpenWishlist: () => void;
  onRemoveWishlist: (productId: string) => void;
}

type AccountTab = 'overview' | 'orders' | 'profile' | 'addresses' | 'wishlist' | 'security';

const tabs: Array<{ id: AccountTab; index: string; label: string; icon: React.ElementType }> = [
  { id: 'overview', index: '01', label: 'Overview', icon: UserRound },
  { id: 'orders', index: '02', label: 'Orders', icon: Package },
  { id: 'profile', index: '03', label: 'Profile', icon: UserRound },
  { id: 'addresses', index: '04', label: 'Addresses', icon: MapPin },
  { id: 'wishlist', index: '05', label: 'Wishlist', icon: Heart },
  { id: 'security', index: '06', label: 'Security', icon: ShieldCheck },
];

const money = (value: number | undefined) =>
  new Intl.NumberFormat('en-FI', { style: 'currency', currency: 'EUR' }).format(value || 0);

const shortDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const dateTime = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusCopy: Record<OrderStatus | string, string> = {
  new: 'Received',
  paid: 'Paid',
  packed: 'Packed',
  shipped: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const statusTone = (status: OrderStatus | string) => {
  if (status === 'delivered' || status === 'paid') return 'bg-ink text-paper';
  if (status === 'shipped' || status === 'packed') return 'border border-ink text-ink';
  if (status === 'cancelled' || status === 'refunded') return 'text-ink-a45 line-through';
  return 'border border-ink-a18 text-ink-a64';
};

const addressLine = (address: AccountAddress) =>
  [address.street, address.postalCode, address.city, address.country].filter(Boolean).join(', ');

const emptyAddress = (): AccountAddress => ({
  street: '',
  postalCode: '',
  city: '',
  country: '',
});

export const AccountPortal: React.FC<AccountPortalProps> = ({
  user,
  onNavigateHome,
  onNavigateAdmin,
  onNavigateArchive,
  wishlistProducts,
  onSelectProduct,
  onOpenWishlist,
  onRemoveWishlist,
}) => {
  const { signOut, changePassword, isAdmin, isOwner } = useAuth();
  const [activeTab, setActiveTab] = useState<AccountTab>('overview');
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'delivered'>('all');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<AccountAddress>(emptyAddress);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchAccountOverview();
      setOverview(data);
      setFullName(data.user.fullName || data.customer?.name || '');
      setPhone(data.user.phone || '');
      setAddress(data.user.address || data.addresses[0] || emptyAddress());
      setMarketingConsent(Boolean(data.customer?.marketingConsent));
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load your account.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview, user.id]);

  const isExecutive =
    user.email?.toLowerCase().trim() === 'huxaifa0fficial@gmail.com' || isAdmin || isOwner;

  const orders = overview?.orders || [];
  const orderCount = orders.length;
  const pieceCount = useMemo(
    () => orders.reduce((sum, order) => sum + (order.items || []).reduce((s, item) => s + (item.quantity || 0), 0), 0),
    [orders]
  );
  const lifetimeSpend = useMemo(
    () => orders.reduce((sum, order) => sum + (order.totals?.total || 0), 0),
    [orders]
  );
  const latestOrder = orders[0];

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'active') {
      return orders.filter((order) => !['delivered', 'cancelled', 'refunded'].includes(order.status));
    }
    if (statusFilter === 'delivered') {
      return orders.filter((order) => order.status === 'delivered');
    }
    return orders;
  }, [orders, statusFilter]);

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage('');
    setProfileError('');
    try {
      const saved = await saveAccountProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
        address,
        marketingConsent,
      });
      setOverview((current) =>
        current
          ? {
              ...current,
              user: {
                ...current.user,
                ...saved.user,
              },
              customer: current.customer
                ? {
                    ...current.customer,
                    name: saved.user.fullName || current.customer.name,
                    marketingConsent,
                  }
                : current.customer,
            }
          : current
      );
      setProfileMessage('Account details saved.');
    } catch (err: any) {
      setProfileError(err?.message || 'Could not save account details.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage('');
    setPasswordError('');

    if (newPassword.length < 8) {
      setPasswordError('Password must contain at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The passwords provided do not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      const result = await changePassword(newPassword);
      if (result.success) {
        setPasswordMessage('Password updated.');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(result.error || 'Could not update password.');
      }
    } catch (err: any) {
      setPasswordError(err?.message || 'Could not update password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const accountNumber = overview?.user.id
    ? `ZJ-${overview.user.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}`
    : 'ZJ-ACCOUNT';

  return (
    <main className="flex-1 w-full">
      <div className="mx-auto max-w-[1480px] px-5 sm:px-10 lg:px-16 py-10 sm:py-14 lg:py-20">
        <div className="flex flex-col gap-4 border-b border-ink-a18 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="label text-ink-a45">Patron account / {accountNumber}</span>
            <h1 className="mt-2 font-display text-[clamp(42px,6vw,84px)] font-light leading-[0.92] tracking-[-0.03em]">
              Your <em>account</em>
            </h1>
          </div>
          <div className="flex items-center gap-5 label text-ink-a45">
            <span className="hidden sm:inline">{user.email}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-2 text-ink transition-opacity hover:opacity-60"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-10 pt-8 lg:grid-cols-12 lg:gap-14">
          <aside className="lg:col-span-3">
            <div className="lg:sticky lg:top-24 space-y-8">
              <div className="space-y-2">
                <span className="label text-ink-a45 block">Account file</span>
                <p className="font-display text-[28px] font-light leading-none">
                  {overview?.user.fullName || user.email?.split('@')[0] || 'Patron'}
                </p>
                <p className="break-all font-mono text-[11px] tracking-[0.08em] text-ink-a45">
                  {user.email}
                </p>
              </div>

              <nav className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex min-w-max items-center gap-3 border border-ink-a18 px-4 py-3 text-left transition-colors lg:min-w-0 lg:border-x-0 lg:border-t-0 lg:px-0 lg:py-3.5 ${
                        active
                          ? 'bg-ink text-paper border-ink lg:bg-transparent lg:text-ink'
                          : 'text-ink-a45 hover:text-ink'
                      }`}
                    >
                      <span className="font-mono text-[10px] tracking-[0.16em]">{tab.index}</span>
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.4} />
                      <span className="label flex-1">{tab.label}</span>
                      {active && <ArrowRight className="hidden h-3.5 w-3.5 lg:block" />}
                    </button>
                  );
                })}
              </nav>

              <div className="hidden border-t border-ink-a18 pt-5 lg:block">
                <button
                  type="button"
                  onClick={onNavigateHome}
                  className="label text-ink-a45 transition-colors hover:text-ink"
                >
                  Return to storefront
                </button>
              </div>
            </div>
          </aside>

          <section className="min-w-0 lg:col-span-9">
            {loadError && (
              <div className="mb-8 flex flex-col gap-3 border border-ink-a18 p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="label text-ink">{loadError}</p>
                <button type="button" onClick={() => void loadOverview()} className="btn btn-secondary">
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry</span>
                </button>
              </div>
            )}

            {activeTab === 'overview' && (
              <div className="space-y-12 animate-fadeIn">
                <div className="space-y-4">
                  <span className="label text-ink-a45">01 / Overview</span>
                  <p className="max-w-2xl font-display text-[clamp(28px,3.6vw,48px)] font-light leading-[1.02] tracking-[-0.02em]">
                    A record of what you have collected, saved, and chosen to keep.
                  </p>
                </div>

                {isExecutive && (
                  <div className="border border-ink p-6 sm:p-8">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="h-5 w-5" />
                        <span className="label">Executive console ready</span>
                      </div>
                      <span className="label text-ink-a45">Owner authorisation</span>
                    </div>
                    <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-ink-a45">
                      Master administrator authorisation recognised. Open the management terminal for
                      catalogue, orders, inventory, telemetry, and control-plane operations.
                    </p>
                    <button
                      type="button"
                      onClick={onNavigateAdmin}
                      className="mt-6 inline-flex items-center gap-2 label border-b border-ink pb-1 transition-opacity hover:opacity-60"
                    >
                      Enter management terminal
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-px bg-ink-a18 border border-ink-a18 md:grid-cols-4">
                  {[
                    { label: 'Orders', value: loading ? '—' : String(orderCount) },
                    { label: 'Pieces', value: loading ? '—' : String(pieceCount) },
                    { label: 'Lifetime spend', value: loading ? '—' : money(lifetimeSpend) },
                    { label: 'Saved pieces', value: String(wishlistProducts.length) },
                  ].map((metric) => (
                    <div key={metric.label} className="bg-paper p-5 sm:p-6">
                      <span className="label block text-ink-a45">{metric.label}</span>
                      <span className="mt-3 block font-display text-[clamp(28px,3vw,42px)] font-light leading-none">
                        {metric.value}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="grid gap-8 lg:grid-cols-2">
                  <div className="border-t border-ink pt-5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="label text-ink-a45">Latest order</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('orders')}
                        className="label text-ink-a45 hover:text-ink"
                      >
                        All orders
                      </button>
                    </div>

                    {loading ? (
                      <p className="mt-8 label text-ink-a45">Loading order record...</p>
                    ) : latestOrder ? (
                      <div className="mt-5 space-y-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-mono text-[12px] tracking-[0.08em]">
                              {latestOrder.number}
                            </p>
                            <p className="mt-1 label text-ink-a45">
                              {shortDate(latestOrder.createdAt)}
                            </p>
                          </div>
                          <span
                            className={`label px-2 py-1 ${statusTone(latestOrder.status)}`}
                          >
                            {statusCopy[latestOrder.status] || latestOrder.status}
                          </span>
                        </div>
                        <div className="space-y-3">
                          {(latestOrder.items || []).slice(0, 3).map((item) => (
                            <div
                              key={`${item.productId}-${item.size}`}
                              className="flex items-baseline justify-between gap-4 text-[13px]"
                            >
                              <span className="truncate">
                                {item.productName} <span className="text-ink-a45">/ {item.size}</span>
                              </span>
                              <span className="font-mono text-[11px]">×{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                        {latestOrder.items.length > 3 && (
                          <p className="label text-ink-a45">
                            + {latestOrder.items.length - 3} more pieces
                          </p>
                        )}
                        <div className="flex items-center justify-between border-t border-ink-a18 pt-4">
                          <span className="label text-ink-a45">Total</span>
                          <span className="font-mono text-[12px]">{money(latestOrder.totals?.total)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 space-y-4">
                        <p className="text-[13px] leading-relaxed text-ink-a45">
                          No orders are attached to this account yet. New checkout activity will appear
                          here automatically.
                        </p>
                        <button
                          type="button"
                          onClick={onNavigateArchive}
                          className="label inline-flex items-center gap-2 border-b border-ink pb-1"
                        >
                          Browse the archive
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-ink pt-5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="label text-ink-a45">Default address</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('addresses')}
                        className="label text-ink-a45 hover:text-ink"
                      >
                        Address book
                      </button>
                    </div>
                    {overview?.user.address ? (
                      <div className="mt-5 space-y-1.5 text-[13px] leading-relaxed text-ink-a72">
                        <p className="text-ink">{overview.user.fullName || fullName || 'Patron'}</p>
                        <p>{overview.user.address.street}</p>
                        <p>
                          {overview.user.address.postalCode} {overview.user.address.city}
                        </p>
                        <p>{overview.user.address.country}</p>
                        {overview.user.phone && <p className="pt-2 label text-ink-a45">{overview.user.phone}</p>}
                      </div>
                    ) : (
                      <div className="mt-5 space-y-4">
                        <p className="text-[13px] leading-relaxed text-ink-a45">
                          No delivery address is stored yet.
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('profile')}
                          className="label inline-flex items-center gap-2 border-b border-ink pb-1"
                        >
                          Add an address
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-ink-a18 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <span className="label text-ink-a45 block">Saved pieces</span>
                      <p className="mt-2 text-[13px] text-ink-a45">
                        {wishlistProducts.length > 0
                          ? `${wishlistProducts.length} piece${wishlistProducts.length === 1 ? '' : 's'} in your private wishlist.`
                          : 'Nothing saved yet.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenWishlist}
                      className="label inline-flex items-center gap-2 border-b border-ink pb-1"
                    >
                      Open wishlist
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'orders' && (
              <div className="space-y-8 animate-fadeIn">
                <div className="space-y-4">
                  <span className="label text-ink-a45">02 / Orders</span>
                  <h2 className="font-display text-[clamp(34px,4.4vw,58px)] font-light leading-[0.98] tracking-[-0.02em]">
                    Orders & <em>allocations</em>
                  </h2>
                </div>

                <div className="flex flex-wrap gap-5 border-b border-ink-a18 pb-4">
                  {[
                    { id: 'all', label: `All (${orders.length})` },
                    { id: 'active', label: 'In progress' },
                    { id: 'delivered', label: 'Delivered' },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setStatusFilter(filter.id as typeof statusFilter)}
                      className={`label pb-1 transition-colors ${
                        statusFilter === filter.id
                          ? 'border-b border-ink text-ink'
                          : 'text-ink-a45 hover:text-ink'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                {loading ? (
                  <p className="label text-ink-a45">Loading order record...</p>
                ) : filteredOrders.length === 0 ? (
                  <div className="border border-ink-a18 p-10 text-center">
                    <Package className="mx-auto h-6 w-6 text-ink-a45" />
                    <p className="mt-4 font-display text-[24px] font-light">No orders recorded</p>
                    <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-a45">
                      {orders.length === 0
                        ? 'Your first completed checkout will appear here with its full allocation and delivery record.'
                        : 'No orders match this filter.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredOrders.map((order) => (
                      <OrderRecord
                        key={order.id}
                        order={order}
                        expanded={expandedOrder === order.id}
                        onToggle={() =>
                          setExpandedOrder((current) => (current === order.id ? null : order.id))
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'addresses' && (
              <div className="space-y-8 animate-fadeIn">
                <div className="space-y-4">
                  <span className="label text-ink-a45">04 / Addresses</span>
                  <h2 className="font-display text-[clamp(34px,4.4vw,58px)] font-light leading-[0.98] tracking-[-0.02em]">
                    Address <em>book</em>
                  </h2>
                  <p className="max-w-2xl text-[13px] leading-relaxed text-ink-a45">
                    Delivery addresses recorded from your orders and your saved account profile.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {overview?.addresses.length ? (
                    overview.addresses.map((entry, index) => (
                      <div key={`${entry.street}-${entry.postalCode}-${index}`} className="border border-ink-a18 p-6">
                        <div className="flex items-center justify-between gap-4">
                          <span className="label text-ink-a45">
                            {index === 0 ? 'Primary / latest' : `Address ${index + 1}`}
                          </span>
                          {index === 0 && <CheckCircle2 className="h-4 w-4" />}
                        </div>
                        <p className="mt-5 text-[13px] leading-relaxed text-ink-a72">
                          {entry.street}
                          <br />
                          {entry.postalCode} {entry.city}
                          <br />
                          {entry.country}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="border border-ink-a18 p-10 text-center sm:col-span-2">
                      <MapPin className="mx-auto h-6 w-6 text-ink-a45" />
                      <p className="mt-4 font-display text-[24px] font-light">No addresses stored</p>
                      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-a45">
                        Add a delivery address to your profile. It will be available at checkout.
                      </p>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="btn btn-secondary"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span>Edit profile address</span>
                </button>
              </div>
            )}

            {activeTab === 'wishlist' && (
              <div className="space-y-8 animate-fadeIn">
                <div className="space-y-4">
                  <span className="label text-ink-a45">05 / Wishlist</span>
                  <h2 className="font-display text-[clamp(34px,4.4vw,58px)] font-light leading-[0.98] tracking-[-0.02em]">
                    Saved <em>pieces</em>
                  </h2>
                  <p className="max-w-2xl text-[13px] leading-relaxed text-ink-a45">
                    A private list of pieces you are considering. It stays on this device until you
                    remove an item.
                  </p>
                </div>

                {wishlistProducts.length === 0 ? (
                  <div className="border border-ink-a18 p-10 text-center">
                    <Heart className="mx-auto h-6 w-6 text-ink-a45" />
                    <p className="mt-4 font-display text-[24px] font-light">Wishlist is empty</p>
                    <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-a45">
                      Save pieces from the archive to keep them here.
                    </p>
                    <button type="button" onClick={onNavigateArchive} className="btn btn-primary mt-6">
                      Browse archive
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
                    {wishlistProducts.map((product) => (
                      <div key={product.id} className="group space-y-4">
                        <button
                          type="button"
                          onClick={() => onSelectProduct(product)}
                          className="block w-full overflow-hidden bg-ink-a06"
                        >
                          <div className="aspect-[3/4] overflow-hidden">
                            <img
                              src={product.image || product.images?.[0]?.url || '/placeholder.svg'}
                              alt={product.name.en}
                              className="h-full w-full object-cover grayscale transition-transform duration-700 group-hover:scale-[1.03]"
                            />
                          </div>
                        </button>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="label text-ink-a45">{product.plateNumber}</p>
                            <button
                              type="button"
                              onClick={() => onSelectProduct(product)}
                              className="mt-1 text-left font-display text-[22px] font-light leading-tight"
                            >
                              {product.name.en}
                            </button>
                            <p className="mt-1 font-mono text-[11px] text-ink-a45">
                              {money(product.price)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveWishlist(product.id)}
                            className="label text-ink-a45 underline underline-offset-4 hover:text-ink"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-10 animate-fadeIn">
                <div className="space-y-4">
                  <span className="label text-ink-a45">06 / Security</span>
                  <h2 className="font-display text-[clamp(34px,4.4vw,58px)] font-light leading-[0.98] tracking-[-0.02em]">
                    Credentials & <em>session</em>
                  </h2>
                </div>

                <div className="grid gap-px bg-ink-a18 border border-ink-a18 sm:grid-cols-2">
                  <div className="bg-paper p-6">
                    <span className="label text-ink-a45 block">Email</span>
                    <p className="mt-3 break-all font-mono text-[12px]">{user.email}</p>
                  </div>
                  <div className="bg-paper p-6">
                    <span className="label text-ink-a45 block">Last sign-in</span>
                    <p className="mt-3 font-mono text-[12px]">
                      {dateTime(overview?.user.lastSignInAt)}
                    </p>
                  </div>
                  <div className="bg-paper p-6">
                    <span className="label text-ink-a45 block">Member since</span>
                    <p className="mt-3 font-mono text-[12px]">{shortDate(overview?.user.createdAt)}</p>
                  </div>
                  <div className="bg-paper p-6">
                    <span className="label text-ink-a45 block">Session</span>
                    <p className="mt-3 inline-flex items-center gap-2 font-mono text-[12px]">
                      <span className="h-1.5 w-1.5 bg-ink" />
                      Encrypted token
                    </p>
                  </div>
                </div>

                <div className="border-t border-ink pt-8">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    <h3 className="label">Change password</h3>
                  </div>
                  <form onSubmit={handlePasswordSave} className="mt-6 max-w-md space-y-5">
                    <div>
                      <label htmlFor="account-new-password" className="field-label">
                        New password
                      </label>
                      <input
                        id="account-new-password"
                        type="password"
                        required
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="Minimum 8 characters"
                        className="field"
                      />
                    </div>
                    <div>
                      <label htmlFor="account-confirm-password" className="field-label">
                        Confirm new password
                      </label>
                      <input
                        id="account-confirm-password"
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Repeat password"
                        className="field"
                      />
                    </div>

                    {passwordError && (
                      <p className="label border-b border-dashed border-ink pb-1 text-ink">
                        {passwordError}
                      </p>
                    )}
                    {passwordMessage && (
                      <p className="label border-b border-ink pb-1 text-ink">{passwordMessage}</p>
                    )}

                    <button type="submit" disabled={passwordSaving} className="btn btn-primary">
                      {passwordSaving ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5" />
                          <span>Update password</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {isExecutive && (
                  <div className="border-t border-ink-a18 pt-8">
                    <button
                      type="button"
                      onClick={onNavigateAdmin}
                      className="label inline-flex items-center gap-2 border-b border-ink pb-1"
                    >
                      Open management terminal
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <div className="border-t border-ink-a18 pt-8">
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="inline-flex items-center gap-2 label text-ink-a45 hover:text-ink"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign out of this device</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="space-y-8 animate-fadeIn">
                <div className="space-y-4">
                  <span className="label text-ink-a45">03 / Profile</span>
                  <h2 className="font-display text-[clamp(34px,4.4vw,58px)] font-light leading-[0.98] tracking-[-0.02em]">
                    Identity & <em>delivery</em>
                  </h2>
                  <p className="max-w-2xl text-[13px] leading-relaxed text-ink-a45">
                    Your name, contact number, default delivery address, and communication preference.
                  </p>
                </div>

                <form onSubmit={handleProfileSave} className="max-w-2xl space-y-8">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <label htmlFor="account-full-name" className="field-label">
                        Full name
                      </label>
                      <input
                        id="account-full-name"
                        type="text"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder="Your name"
                        className="field"
                      />
                    </div>
                    <div>
                      <label htmlFor="account-phone" className="field-label">
                        Phone
                      </label>
                      <input
                        id="account-phone"
                        type="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="+358"
                        className="field"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="account-email" className="field-label">
                      Email
                    </label>
                    <input
                      id="account-email"
                      type="email"
                      value={user.email || ''}
                      readOnly
                      className="field opacity-60"
                    />
                    <p className="mt-2 label text-ink-a45">
                      Email changes require a verification step. Contact the atelier.
                    </p>
                  </div>

                  <div className="border-t border-ink-a18 pt-8">
                    <span className="label text-ink-a45 block">Default delivery address</span>
                    <div className="mt-5 grid gap-6 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label htmlFor="account-street" className="field-label">
                          Street address
                        </label>
                        <input
                          id="account-street"
                          type="text"
                          value={address.street}
                          onChange={(event) =>
                            setAddress((current) => ({ ...current, street: event.target.value }))
                          }
                          placeholder="Street and number"
                          className="field"
                        />
                      </div>
                      <div>
                        <label htmlFor="account-postal" className="field-label">
                          Postal code
                        </label>
                        <input
                          id="account-postal"
                          type="text"
                          value={address.postalCode}
                          onChange={(event) =>
                            setAddress((current) => ({ ...current, postalCode: event.target.value }))
                          }
                          placeholder="00100"
                          className="field"
                        />
                      </div>
                      <div>
                        <label htmlFor="account-city" className="field-label">
                          City
                        </label>
                        <input
                          id="account-city"
                          type="text"
                          value={address.city}
                          onChange={(event) =>
                            setAddress((current) => ({ ...current, city: event.target.value }))
                          }
                          placeholder="Helsinki"
                          className="field"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor="account-country" className="field-label">
                          Country
                        </label>
                        <input
                          id="account-country"
                          type="text"
                          value={address.country}
                          onChange={(event) =>
                            setAddress((current) => ({ ...current, country: event.target.value }))
                          }
                          placeholder="Finland"
                          className="field"
                        />
                      </div>
                    </div>
                  </div>

                  <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-ink-a72">
                    <input
                      type="checkbox"
                      checked={marketingConsent}
                      onChange={(event) => setMarketingConsent(event.target.checked)}
                      className="mt-0.5 h-4 w-4 cursor-pointer accent-paper"
                    />
                    <span>
                      Receive atelier notes, archival release notices, and private client invitations.
                    </span>
                  </label>

                  {profileError && (
                    <p className="label border-b border-dashed border-ink pb-1 text-ink">{profileError}</p>
                  )}
                  {profileMessage && (
                    <p className="label border-b border-ink pb-1 text-ink">{profileMessage}</p>
                  )}

                  <button type="submit" disabled={profileSaving} className="btn btn-primary">
                    {profileSaving ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5" />
                        <span>Save account details</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};

const OrderRecord: React.FC<{
  order: Order;
  expanded: boolean;
  onToggle: () => void;
}> = ({ order, expanded, onToggle }) => (
  <article className="border border-ink-a18">
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full flex-col gap-4 p-5 text-left sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-ink-a18">
          {order.status === 'shipped' ? (
            <Truck className="h-4 w-4" strokeWidth={1.4} />
          ) : order.status === 'delivered' ? (
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.4} />
          ) : (
            <ShoppingBag className="h-4 w-4" strokeWidth={1.4} />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-[12px] tracking-[0.08em]">{order.number}</span>
            <span className={`label px-2 py-0.5 ${statusTone(order.status)}`}>
              {statusCopy[order.status] || order.status}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] text-ink-a45">
            {shortDate(order.createdAt)} · {order.items.length} piece
            {order.items.length === 1 ? '' : 's'} · {money(order.totals?.total)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 self-end sm:self-auto">
        {order.tracking && (
          <span className="label text-ink-a45">Tracked</span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-ink-a45 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </div>
    </button>

    {expanded && (
      <div className="border-t border-ink-a18 px-5 pb-6 pt-5 sm:px-6 animate-fadeIn">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <span className="label text-ink-a45">Allocated pieces</span>
            <div className="mt-4 space-y-3">
              {order.items.map((item) => (
                <div
                  key={`${item.productId}-${item.size}`}
                  className="flex items-baseline justify-between gap-4 border-b border-ink-a18 pb-3 text-[13px]"
                >
                  <span className="min-w-0 truncate">
                    {item.productName} <span className="text-ink-a45">/ {item.size}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px]">
                    ×{item.quantity} · {money(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-2 text-[12px]">
              <div className="flex justify-between text-ink-a45">
                <span>Subtotal</span>
                <span className="font-mono">{money(order.totals?.subtotal)}</span>
              </div>
              <div className="flex justify-between text-ink-a45">
                <span>Shipping</span>
                <span className="font-mono">{money(order.totals?.shipping)}</span>
              </div>
              <div className="flex justify-between border-t border-ink-a18 pt-2 text-ink">
                <span className="label">Total</span>
                <span className="font-mono">{money(order.totals?.total)}</span>
              </div>
            </div>
          </div>
          <div className="lg:col-span-5">
            <span className="label text-ink-a45">Delivery</span>
            <p className="mt-4 text-[13px] leading-relaxed text-ink-a72">
              {order.shippingMethod || 'Standard delivery'}
            </p>
            {order.tracking && (
              <p className="mt-2 break-all font-mono text-[11px] text-ink-a45">
                Tracking: {order.tracking}
              </p>
            )}
            {order.customer?.address && (
              <p className="mt-4 text-[13px] leading-relaxed text-ink-a72">
                {order.customer.address.street}
                <br />
                {order.customer.address.postalCode} {order.customer.address.city}
                <br />
                {order.customer.address.country}
              </p>
            )}

            {order.timeline?.length > 0 && (
              <>
                <span className="mt-8 block label text-ink-a45">Timeline</span>
                <div className="mt-4 space-y-4">
                  {order.timeline.map((event, index) => (
                    <div key={`${event.at}-${index}`} className="flex gap-3">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 bg-ink" />
                      <div>
                        <p className="label text-ink">{statusCopy[event.status] || event.status}</p>
                        <p className="mt-1 font-mono text-[10px] text-ink-a45">
                          {dateTime(event.at)}
                        </p>
                        {event.note && (
                          <p className="mt-1 text-[12px] leading-relaxed text-ink-a45">{event.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )}
  </article>
);
