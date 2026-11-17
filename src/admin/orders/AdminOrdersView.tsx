import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  Filter,
  Mail,
  MapPin,
  Package,
  Phone,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  User,
} from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { useAuth } from '../../supabase/AuthContext';
import { bosFetch } from '../../bos/client';

interface AdminOrdersViewProps {
  orders: Order[];
  onRefresh: () => void;
}

type RangeFilter = 'all' | '7' | '30' | '90';
type SortKey = 'newest' | 'oldest' | 'value-desc' | 'value-asc' | 'customer';

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'New',
  paid: 'Paid',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const STATUS_ORDER: OrderStatus[] = [
  'new',
  'paid',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

const FULFILMENT_FLOW: OrderStatus[] = ['new', 'paid', 'packed', 'shipped', 'delivered'];

const RANGE_LABELS: Record<RangeFilter, string> = {
  all: 'All time',
  '7': 'Last 7 days',
  '30': 'Last 30 days',
  '90': 'Last 90 days',
};

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  'value-desc': 'Highest value',
  'value-asc': 'Lowest value',
  customer: 'Customer A–Z',
};

const money = (value: number) =>
  `€${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const shortDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const dateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const orderUnits = (order: Order) =>
  order.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

const isRevenueOrder = (order: Order) =>
  order.status !== 'cancelled' && order.status !== 'refunded';

export const AdminOrdersView: React.FC<AdminOrdersViewProps> = ({ orders, onRefresh }) => {
  const { isEditor, adminProfile } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [range, setRange] = useState<RangeFilter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    orders[0]?.id ?? null
  );
  const [trackingNumber, setTrackingNumber] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>('packed');
  const [notice, setNotice] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedOrderId && orders.length > 0) {
      setSelectedOrderId(orders[0].id);
    } else if (selectedOrderId && !orders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(orders[0]?.id ?? null);
    }
  }, [orders, selectedOrderId]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, range, sort, pageSize]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const highValueThreshold = useMemo(() => {
    const values = orders
      .filter(isRevenueOrder)
      .map((order) => order.totals.total)
      .sort((a, b) => a - b);
    if (values.length === 0) return 0;
    const index = Math.min(values.length - 1, Math.floor(values.length * 0.75));
    return values[index];
  }, [orders]);

  const flagsFor = useCallback(
    (order: Order): Array<{ label: string; strong: boolean }> => {
      const flags: Array<{ label: string; strong: boolean }> = [];
      const ageDays =
        (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (['new', 'paid', 'packed'].includes(order.status) && ageDays > 3) {
        flags.push({ label: 'Aging', strong: true });
      }
      if (order.status === 'shipped' && !order.tracking) {
        flags.push({ label: 'No tracking', strong: true });
      }
      if (!order.customer.address) {
        flags.push({ label: 'No address', strong: false });
      }
      if (!order.customer.phone) {
        flags.push({ label: 'No phone', strong: false });
      }
      if (highValueThreshold > 0 && order.totals.total >= highValueThreshold) {
        flags.push({ label: 'High value', strong: false });
      }
      return flags;
    },
    [highValueThreshold]
  );

  const customerStats = useMemo(() => {
    const map = new Map<
      string,
      { orders: number; spend: number; first: string; last: string }
    >();
    orders.forEach((order) => {
      const key = order.customer.email.toLowerCase();
      const current = map.get(key);
      const revenue = isRevenueOrder(order) ? order.totals.total : 0;
      if (!current) {
        map.set(key, {
          orders: 1,
          spend: revenue,
          first: order.createdAt,
          last: order.createdAt,
        });
      } else {
        map.set(key, {
          orders: current.orders + 1,
          spend: current.spend + revenue,
          first:
            new Date(order.createdAt).getTime() < new Date(current.first).getTime()
              ? order.createdAt
              : current.first,
          last:
            new Date(order.createdAt).getTime() > new Date(current.last).getTime()
              ? order.createdAt
              : current.last,
        });
      }
    });
    return map;
  }, [orders]);

  const rangeScoped = useMemo(() => {
    const cutoff =
      range === 'all' ? null : Date.now() - Number(range) * 24 * 60 * 60 * 1000;
    const query = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      if (cutoff && new Date(order.createdAt).getTime() < cutoff) return false;
      if (!query) return true;
      const haystack = [
        order.number,
        order.customer.name,
        order.customer.email,
        order.customer.phone,
        order.tracking,
        ...order.items.map((item) => `${item.productName} ${item.productNr}`),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [orders, range, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<'all' | OrderStatus, number> = {
      all: rangeScoped.length,
      new: 0,
      paid: 0,
      packed: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      refunded: 0,
    };
    rangeScoped.forEach((order) => {
      counts[order.status] += 1;
    });
    return counts;
  }, [rangeScoped]);

  const filteredOrders = useMemo(() => {
    const list = rangeScoped.filter(
      (order) => statusFilter === 'all' || order.status === statusFilter
    );
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'value-desc':
          return b.totals.total - a.totals.total;
        case 'value-asc':
          return a.totals.total - b.totals.total;
        case 'customer':
          return a.customer.name.localeCompare(b.customer.name);
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [rangeScoped, sort, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedOrders = filteredOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  const metrics = useMemo(() => {
    const revenue = rangeScoped
      .filter(isRevenueOrder)
      .reduce((sum, order) => sum + order.totals.total, 0);
    const revenueOrders = rangeScoped.filter(isRevenueOrder);
    const open = rangeScoped.filter((order) =>
      ['new', 'paid', 'packed', 'shipped'].includes(order.status)
    ).length;
    const delivered = rangeScoped.filter((order) => order.status === 'delivered').length;
    const units = rangeScoped
      .filter(isRevenueOrder)
      .reduce((sum, order) => sum + orderUnits(order), 0);
    const attention = rangeScoped.filter((order) =>
      flagsFor(order).some((flag) => flag.strong)
    ).length;
    return {
      revenue,
      orders: rangeScoped.length,
      open,
      delivered,
      units,
      aov: revenueOrders.length ? revenue / revenueOrders.length : 0,
      attention,
    };
  }, [rangeScoped, flagsFor]);

  const selectedCustomer = selectedOrder?.customer ?? null;
  const selectedCustomerStats = selectedCustomer
    ? customerStats.get(selectedCustomer.email.toLowerCase()) ?? null
    : null;
  const selectedFlags = selectedOrder ? flagsFor(selectedOrder) : [];

  const nextStatus = useMemo(() => {
    if (!selectedOrder) return null;
    const index = FULFILMENT_FLOW.indexOf(selectedOrder.status);
    if (index < 0 || index >= FULFILMENT_FLOW.length - 1) return null;
    return FULFILMENT_FLOW[index + 1];
  }, [selectedOrder]);

  const pageAllSelected =
    pagedOrders.length > 0 && pagedOrders.every((order) => selectedIds.has(order.id));
  const pageSomeSelected = pagedOrders.some((order) => selectedIds.has(order.id));

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePageSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (pageAllSelected) {
        pagedOrders.forEach((order) => next.delete(order.id));
      } else {
        pagedOrders.forEach((order) => next.add(order.id));
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredOrders.map((order) => order.id)));
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label} copied to clipboard.`);
    } catch {
      setNotice('Clipboard is unavailable in this browser.');
    }
  };

  const updateOrdersStatus = async (
    orderIds: string[],
    nextStatusValue: OrderStatus,
    bulk = false
  ) => {
    if (!isEditor || orderIds.length === 0) return;
    setIsUpdating(true);
    setNotice('');
    const failures: string[] = [];

    for (const id of orderIds) {
      const order = orders.find((entry) => entry.id === id);
      if (!order) {
        failures.push(`${id}: not found in the current view`);
        continue;
      }
      try {
        await bosFetch('orders', 'transition', {
          id,
          status: nextStatusValue,
          expectedStatus: order.status,
          tracking: order.tracking || '',
          note: bulk
            ? `Status updated to ${nextStatusValue} (bulk action)`
            : `Status updated to ${nextStatusValue}`,
          idempotencyKey: `order-status:${id}:${nextStatusValue}:${crypto.randomUUID()}`,
        });
      } catch (err) {
        failures.push(
          `${order.number || id}: ${err instanceof Error ? err.message : 'transition rejected'}`
        );
      }
    }

    if (failures.length) {
      setNotice(
        `${orderIds.length - failures.length} of ${orderIds.length} orders updated. ${failures
          .slice(0, 2)
          .join(' · ')}`
      );
    } else {
      setNotice(
        bulk
          ? `${orderIds.length} order${orderIds.length === 1 ? '' : 's'} moved to ${
              STATUS_LABELS[nextStatusValue]
            }.`
          : `Order moved to ${STATUS_LABELS[nextStatusValue]}.`
      );
    }
    if (bulk) setSelectedIds(new Set());
    onRefresh();
    setIsUpdating(false);
  };

  const saveTracking = async () => {
    if (!isEditor || !selectedOrder || !trackingNumber.trim()) return;
    setIsUpdating(true);
    try {
      await bosFetch('orders', 'tracking', {
        id: selectedOrder.id,
        tracking: trackingNumber.trim(),
      });
      setTrackingNumber('');
      setNotice('Tracking code saved.');
      onRefresh();
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : 'Tracking could not be saved. No change was made.'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const saveNote = async () => {
    if (!isEditor || !selectedOrder || !internalNote.trim()) return;
    setIsUpdating(true);
    try {
      await bosFetch('orders', 'note', {
        id: selectedOrder.id,
        note: internalNote.trim(),
      });
      setInternalNote('');
      setNotice('Internal note added to the order timeline.');
      onRefresh();
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : 'The internal note could not be saved.'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const exportOrders = (rows: Order[], scopeLabel: string) => {
    if (rows.length === 0) {
      setNotice('There are no orders in this view to export.');
      return;
    }
    const header = [
      'Order',
      'Placed',
      'Status',
      'Customer',
      'Email',
      'Phone',
      'Items',
      'Units',
      'Subtotal',
      'Shipping',
      'VAT',
      'Discount',
      'Total',
      'Tracking',
      'Street',
      'Postal code',
      'City',
      'Country',
    ];
    const lines = rows.map((order) =>
      [
        order.number,
        order.createdAt,
        order.status,
        order.customer.name,
        order.customer.email,
        order.customer.phone ?? '',
        order.items.map((item) => `${item.productName} (${item.size}) x${item.quantity}`).join(' | '),
        orderUnits(order),
        order.totals.subtotal,
        order.totals.shipping,
        order.totals.vat,
        order.totals.discount,
        order.totals.total,
        order.tracking ?? '',
        order.customer.address?.street ?? '',
        order.customer.address?.postalCode ?? '',
        order.customer.address?.city ?? '',
        order.customer.address?.country ?? '',
      ]
        .map(csvCell)
        .join(',')
    );
    const blob = new Blob([[header.map(csvCell).join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `order-book-${scopeLabel}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`${rows.length} order${rows.length === 1 ? '' : 's'} exported to CSV.`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const writing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (writing) return;
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === 'Escape') {
        setSelectedIds(new Set());
        setSearchQuery('');
        return;
      }
      if (event.key === 'j' || event.key === 'k') {
        if (filteredOrders.length === 0) return;
        event.preventDefault();
        const currentIndex = filteredOrders.findIndex((order) => order.id === selectedOrderId);
        const delta = event.key === 'j' ? 1 : -1;
        const nextIndex = Math.min(
          filteredOrders.length - 1,
          Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + delta)
        );
        setSelectedOrderId(filteredOrders[nextIndex].id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filteredOrders, selectedOrderId]);

  const statusPill = (status: OrderStatus) => {
    const base =
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] whitespace-nowrap';
    if (status === 'delivered') {
      return (
        <span className={`${base} border-paper bg-paper text-ink`}>
          <CheckCircle2 className="h-3 w-3" strokeWidth={1.6} />
          {STATUS_LABELS[status]}
        </span>
      );
    }
    if (status === 'cancelled' || status === 'refunded') {
      return (
        <span className={`${base} border-paper-a18 text-paper-a45 line-through`}>
          {STATUS_LABELS[status]}
        </span>
      );
    }
    if (status === 'shipped') {
      return (
        <span className={`${base} border-paper-a18 bg-paper-a06 text-paper`}>
          <Truck className="h-3 w-3" strokeWidth={1.6} />
          {STATUS_LABELS[status]}
        </span>
      );
    }
    return (
      <span className={`${base} border-paper-a18 text-paper-a72`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {STATUS_LABELS[status]}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 border-b border-paper-a18 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="micro-sm flex items-center gap-2 text-paper-a45">
            <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.5} />
            Commerce / Order Book
          </div>
          <h1 className="mt-3 font-display text-[46px] font-light leading-none tracking-[-0.01em] text-paper">
            Order Book
          </h1>
          <p className="mt-3 max-w-[70ch] text-[13px] font-light leading-relaxed text-paper-a45">
            Every verified checkout, fulfilment stage, dispatch record and operator note in one
            ledger. Search, filter, bulk-move and export the exact orders you need.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="btn btn-secondary"
            title="Refresh orders"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => exportOrders(filteredOrders, 'filtered')}
            className="btn btn-secondary"
            disabled={filteredOrders.length === 0}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
            Export view
          </button>
          <button
            type="button"
            onClick={() => selectedOrder && exportOrders([selectedOrder], selectedOrder.number)}
            className="btn btn-primary"
            disabled={!selectedOrder}
          >
            <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
            Export order
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-paper-a18 bg-paper px-4 py-3 text-[12.5px] text-paper-a72">
          <Check className="h-3.5 w-3.5" strokeWidth={1.8} />
          {notice}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Recorded revenue', value: money(metrics.revenue), hint: 'Excludes cancelled and refunded' },
          { label: 'Orders in scope', value: metrics.orders.toLocaleString(), hint: `${statusCounts.new} new` },
          { label: 'Open fulfilment', value: metrics.open.toLocaleString(), hint: 'New to shipped' },
          { label: 'Delivered', value: metrics.delivered.toLocaleString(), hint: 'Completed handovers' },
          { label: 'Average order value', value: money(metrics.aov), hint: `${metrics.units.toLocaleString()} units sold` },
          { label: 'Needs attention', value: metrics.attention.toLocaleString(), hint: 'Aging or untracked' },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-paper-a18 bg-paper p-4"
          >
            <div className="micro-sm text-paper-a45">{metric.label}</div>
            <div className="mt-2 font-display text-[32px] font-light leading-none text-paper">
              {metric.value}
            </div>
            <div className="mt-2 text-[11.5px] text-paper-a45">{metric.hint}</div>
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-paper-a18 bg-paper px-8 py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-paper-a18 text-paper-a45">
            <ShoppingBag className="h-5 w-5" strokeWidth={1.4} />
          </div>
          <h2 className="mt-5 font-display text-[28px] font-light text-paper">
            No customer orders yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-paper-a45">
            Verified storefront checkouts sync here automatically. There is nothing to filter or
            export until the first order is placed.
          </p>
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="btn btn-primary mt-6"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
            Check again
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto border-b border-paper-a18">
            {(['all', ...STATUS_ORDER] as Array<'all' | OrderStatus>).map((status) => {
              const active = statusFilter === status;
              const label = status === 'all' ? 'All orders' : STATUS_LABELS[status];
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`relative -mb-px flex shrink-0 items-center gap-2 border-b px-3 pb-3 pt-2 text-[12.5px] transition-colors ${
                    active
                      ? 'border-paper text-paper'
                      : 'border-transparent text-paper-a45 hover:text-paper'
                  }`}
                >
                  {label}
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[10.5px] tabular-nums ${
                      active
                        ? 'border-paper text-paper'
                        : 'border-paper-a18 text-paper-a45'
                    }`}
                  >
                    {statusCounts[status]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-paper-a18 bg-paper p-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr_1fr_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-paper-a45" strokeWidth={1.5} />
                <input
                  ref={searchRef}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search order, customer, email, tracking or product…"
                  className="field pl-9"
                />
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-paper-a18 px-1.5 py-0.5 text-[10px] text-paper-a45">
                  /
                </kbd>
              </div>
              <label className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-paper-a45" strokeWidth={1.5} />
                <select
                  value={range}
                  onChange={(event) => setRange(event.target.value as RangeFilter)}
                  className="field cursor-pointer pl-9"
                >
                  {(Object.keys(RANGE_LABELS) as RangeFilter[]).map((key) => (
                    <option key={key} value={key}>
                      {RANGE_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="relative">
                <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-paper-a45" strokeWidth={1.5} />
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  className="field cursor-pointer pl-9"
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <option key={key} value={key}>
                      {SORT_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setRange('all');
                    setStatusFilter('all');
                    setSort('newest');
                    setSelectedIds(new Set());
                  }}
                  className="btn btn-secondary"
                  title="Reset all filters"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Reset
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-paper-a18 pt-3">
              <div className="flex items-center gap-2 text-[12px] text-paper-a45">
                <button
                  type="button"
                  onClick={togglePageSelection}
                  className="btn btn-secondary !h-7 !min-h-7 !px-3 !text-[11.5px]"
                >
                  <ClipboardCheck className="h-3 w-3" strokeWidth={1.6} />
                  {pageAllSelected ? 'Unselect page' : 'Select page'}
                </button>
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="btn btn-secondary !h-7 !min-h-7 !px-3 !text-[11.5px]"
                  disabled={filteredOrders.length === 0}
                >
                  Select all {filteredOrders.length}
                </button>
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="btn-text !text-[11.5px]"
                  >
                    Clear selection
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11.5px] text-paper-a45">
                <span>
                  {filteredOrders.length.toLocaleString()} order
                  {filteredOrders.length === 1 ? '' : 's'} in view
                </span>
                <span className="text-paper-a18">·</span>
                <span>{range === 'all' ? 'All time' : RANGE_LABELS[range]}</span>
              </div>
            </div>

            {selectedIds.size > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-paper-a18 bg-paper-a06 px-3 py-3">
                <span className="text-[12px] font-medium text-paper">
                  {selectedIds.size} selected
                </span>
                <span className="text-paper-a18">|</span>
                <select
                  value={bulkStatus}
                  onChange={(event) => setBulkStatus(event.target.value as OrderStatus)}
                  className="field h-8 w-auto cursor-pointer !text-[12px]"
                >
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void updateOrdersStatus(Array.from(selectedIds), bulkStatus, true)}
                  disabled={!isEditor || isUpdating}
                  className="btn btn-primary !h-8 !min-h-8 !px-3 !text-[12px]"
                >
                  {isUpdating ? (
                    <RefreshCw className="h-3 w-3 animate-spin" strokeWidth={1.6} />
                  ) : (
                    <ArrowRight className="h-3 w-3" strokeWidth={1.6} />
                  )}
                  Apply status
                </button>
                <button
                  type="button"
                  onClick={() => exportOrders(Array.from(selectedIds).map((id) => orders.find((order) => order.id === id)).filter((order): order is Order => Boolean(order)), 'selected')}
                  className="btn btn-secondary !h-8 !min-h-8 !px-3 !text-[12px]"
                >
                  <Download className="h-3 w-3" strokeWidth={1.6} />
                  Export selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="btn-text !text-[12px]"
                >
                  Deselect
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-4">
              <div
                ref={listRef}
                className="overflow-hidden rounded-lg border border-paper-a18 bg-paper"
              >
                <div className="flex items-center justify-between border-b border-paper-a18 px-4 py-3">
                  <span className="text-[12px] font-medium text-paper">Order queue</span>
                  <span className="text-[11.5px] text-paper-a45">
                    Page {currentPage} of {totalPages}
                  </span>
                </div>
                <div className="max-h-[760px] overflow-y-auto">
                  {pagedOrders.length === 0 && (
                    <div className="px-4 py-12 text-center text-[12.5px] text-paper-a45">
                      No orders match the current filters.
                    </div>
                  )}
                  {pagedOrders.map((order) => {
                    const isSelected = selectedOrderId === order.id;
                    const flags = flagsFor(order);
                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                        className={`group cursor-pointer border-b border-paper-a18 px-4 py-3.5 transition-colors last:border-b-0 ${
                          isSelected ? 'bg-paper-a06' : 'hover:bg-paper-a06'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div
                            className="pt-0.5"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.has(order.id)}
                              onChange={() => toggleSelection(order.id)}
                              aria-label={`Select ${order.number}`}
                              className="h-3.5 w-3.5 cursor-pointer accent-black"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[12px] tracking-[0.04em] text-paper">
                                {order.number}
                              </span>
                              <span className="font-mono text-[12px] text-paper">
                                {money(order.totals.total)}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-[13px] text-paper">
                              {order.customer.name}
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <span className="truncate text-[11.5px] text-paper-a45">
                                {order.items.length} line{order.items.length === 1 ? '' : 's'} ·{' '}
                                {orderUnits(order)} unit{orderUnits(order) === 1 ? '' : 's'}
                              </span>
                              <span className="shrink-0 text-[11.5px] text-paper-a45">
                                {shortDate(order.createdAt)}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {statusPill(order.status)}
                              {flags.slice(0, 2).map((flag) => (
                                <span
                                  key={flag.label}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] ${
                                    flag.strong
                                      ? 'border-paper text-paper'
                                      : 'border-paper-a18 text-paper-a45'
                                  }`}
                                >
                                  {flag.strong && (
                                    <AlertTriangle className="h-2.5 w-2.5" strokeWidth={1.8} />
                                  )}
                                  {flag.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-paper-a18 px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPage(1)}
                      disabled={currentPage === 1}
                      className="hidden h-7 w-7 items-center justify-center rounded-full border border-paper-a18 text-paper-a72 hover:border-paper disabled:opacity-30 sm:flex"
                      aria-label="First page"
                    >
                      <ChevronsLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                      disabled={currentPage === 1}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-paper-a18 text-paper-a72 hover:border-paper disabled:opacity-30"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </button>
                    <span className="whitespace-nowrap px-1 text-[10.5px] text-paper-a45">
                      {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredOrders.length)} / {filteredOrders.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                      disabled={currentPage === totalPages}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-paper-a18 text-paper-a72 hover:border-paper disabled:opacity-30"
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="hidden h-7 w-7 items-center justify-center rounded-full border border-paper-a18 text-paper-a72 hover:border-paper disabled:opacity-30 sm:flex"
                      aria-label="Last page"
                    >
                      <ChevronsRight className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </button>
                  </div>
                  <select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                    className="field h-7 w-[84px] shrink-0 cursor-pointer !px-2 !text-[10.5px]"
                    aria-label="Rows per page"
                  >
                    {[10, 20, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size} / page
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 px-1 text-[11px] text-paper-a45">
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="rounded border border-paper-a18 px-1.5 py-0.5 text-[10px]">J</kbd>
                  next
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="rounded border border-paper-a18 px-1.5 py-0.5 text-[10px]">K</kbd>
                  previous
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="rounded border border-paper-a18 px-1.5 py-0.5 text-[10px]">/</kbd>
                  search
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="rounded border border-paper-a18 px-1.5 py-0.5 text-[10px]">Esc</kbd>
                  clear
                </span>
              </div>
            </div>

            <div className="xl:col-span-8">
              {!selectedOrder ? (
                <div className="rounded-lg border border-paper-a18 bg-paper px-8 py-16 text-center text-[13px] text-paper-a45">
                  Select an order from the queue to open its full record.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-paper-a18 bg-paper p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="micro-sm text-paper-a45">Order record</div>
                        <div className="mt-1 flex items-center gap-2">
                          <h2 className="font-display text-[32px] font-light leading-none text-paper">
                            {selectedOrder.number}
                          </h2>
                          <button
                            type="button"
                            onClick={() => void copyText(selectedOrder.number, 'Order number')}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-paper-a18 text-paper-a45 hover:border-paper hover:text-paper"
                            title="Copy order number"
                          >
                            <Copy className="h-3 w-3" strokeWidth={1.6} />
                          </button>
                        </div>
                        <div className="mt-2 text-[12px] text-paper-a45">
                          Placed {dateTime(selectedOrder.createdAt)} · Updated{' '}
                          {selectedOrder.updatedAt ? dateTime(selectedOrder.updatedAt) : 'not yet'}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="font-display text-[28px] font-light leading-none text-paper">
                          {money(selectedOrder.totals.total)}
                        </div>
                        {statusPill(selectedOrder.status)}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 border-t border-paper-a18 pt-4">
                      {nextStatus && (
                        <button
                          type="button"
                          onClick={() => void updateOrdersStatus([selectedOrder.id], nextStatus)}
                          disabled={!isEditor || isUpdating}
                          className="btn btn-primary"
                        >
                          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.6} />
                          Advance to {STATUS_LABELS[nextStatus]}
                        </button>
                      )}
                      {selectedOrder.status !== 'delivered' &&
                        selectedOrder.status !== 'cancelled' &&
                        selectedOrder.status !== 'refunded' && (
                          <button
                            type="button"
                            onClick={() => void updateOrdersStatus([selectedOrder.id], 'delivered')}
                            disabled={!isEditor || isUpdating}
                            className="btn btn-secondary"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                            Mark delivered
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="btn btn-secondary"
                      >
                        <Printer className="h-3.5 w-3.5" strokeWidth={1.6} />
                        Print slip
                      </button>
                      {selectedOrder.customer.address && (
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(
                              [
                                selectedOrder.customer.address?.street,
                                `${selectedOrder.customer.address?.postalCode} ${selectedOrder.customer.address?.city}`,
                                selectedOrder.customer.address?.country,
                              ]
                                .filter(Boolean)
                                .join(', '),
                              'Delivery address'
                            )
                          }
                          className="btn btn-secondary"
                        >
                          <MapPin className="h-3.5 w-3.5" strokeWidth={1.6} />
                          Copy address
                        </button>
                      )}
                      {selectedOrder.customer.phone && (
                        <a
                          href={`tel:${selectedOrder.customer.phone}`}
                          className="btn btn-secondary"
                        >
                          <Phone className="h-3.5 w-3.5" strokeWidth={1.6} />
                          Call
                        </a>
                      )}
                      <a
                        href={`mailto:${selectedOrder.customer.email}?subject=${encodeURIComponent(
                          `Order ${selectedOrder.number}`
                        )}`}
                        className="btn btn-secondary"
                      >
                        <Mail className="h-3.5 w-3.5" strokeWidth={1.6} />
                        Email
                      </a>
                    </div>
                  </div>

                  {selectedFlags.length > 0 && (
                    <div className="rounded-lg border border-paper-a18 bg-paper p-4">
                      <div className="flex items-center gap-2 text-[12px] font-medium text-paper">
                        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.7} />
                        Operator attention
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedFlags.map((flag) => (
                          <span
                            key={flag.label}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] ${
                              flag.strong
                                ? 'border-paper text-paper'
                                : 'border-paper-a18 text-paper-a45'
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {flag.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-paper-a18 bg-paper p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[12px] font-medium text-paper">
                          <User className="h-3.5 w-3.5" strokeWidth={1.7} />
                          Customer
                        </div>
                        <button
                          type="button"
                          onClick={() => void copyText(selectedOrder.customer.email, 'Email address')}
                          className="text-[11px] text-paper-a45 underline underline-offset-2 hover:text-paper"
                        >
                          Copy email
                        </button>
                      </div>
                      <div className="mt-3 text-[13px] text-paper">{selectedOrder.customer.name}</div>
                      <div className="mt-1 text-[12px] text-paper-a72">{selectedOrder.customer.email}</div>
                      {selectedOrder.customer.phone && (
                        <div className="mt-1 font-mono text-[12px] text-paper-a45">
                          {selectedOrder.customer.phone}
                        </div>
                      )}
                      {selectedCustomerStats && (
                        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-paper-a18 pt-3">
                          <div>
                            <div className="text-[10.5px] text-paper-a45">Orders</div>
                            <div className="mt-1 font-mono text-[13px] text-paper">
                              {selectedCustomerStats.orders}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10.5px] text-paper-a45">Lifetime</div>
                            <div className="mt-1 font-mono text-[13px] text-paper">
                              {money(selectedCustomerStats.spend)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10.5px] text-paper-a45">Last order</div>
                            <div className="mt-1 text-[11.5px] text-paper">
                              {shortDate(selectedCustomerStats.last)}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-paper-a18 bg-paper p-4">
                      <div className="flex items-center gap-2 text-[12px] font-medium text-paper">
                        <MapPin className="h-3.5 w-3.5" strokeWidth={1.7} />
                        Delivery
                      </div>
                      {selectedOrder.customer.address ? (
                        <div className="mt-3 space-y-0.5 text-[12px] leading-relaxed text-paper-a72">
                          <div>{selectedOrder.customer.address.street}</div>
                          <div>
                            {selectedOrder.customer.address.postalCode}{' '}
                            {selectedOrder.customer.address.city}
                          </div>
                          <div>{selectedOrder.customer.address.country}</div>
                        </div>
                      ) : (
                        <div className="mt-3 text-[12px] text-paper-a45">
                          No delivery address on this order.
                        </div>
                      )}
                      <div className="mt-3 border-t border-paper-a18 pt-3 text-[11.5px] text-paper-a45">
                        Shipping method:{' '}
                        <span className="text-paper">{selectedOrder.shippingMethod || 'Not recorded'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-paper-a18 bg-paper">
                    <div className="flex items-center justify-between border-b border-paper-a18 px-4 py-3">
                      <div className="flex items-center gap-2 text-[12px] font-medium text-paper">
                        <Package className="h-3.5 w-3.5" strokeWidth={1.7} />
                        Line items
                      </div>
                      <span className="text-[11.5px] text-paper-a45">
                        {selectedOrder.items.length} line{selectedOrder.items.length === 1 ? '' : 's'} ·{' '}
                        {orderUnits(selectedOrder)} unit{orderUnits(selectedOrder) === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div>
                      {selectedOrder.items.map((item, index) => (
                        <div
                          key={`${item.productId}-${item.size}-${index}`}
                          className="flex items-center justify-between gap-4 border-b border-paper-a18 px-4 py-3 last:border-b-0"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[12.5px] text-paper">{item.productName}</div>
                            <div className="mt-0.5 text-[11.5px] text-paper-a45">
                              {item.productNr} · Size {item.size} · Qty {item.quantity}
                            </div>
                          </div>
                          <div className="shrink-0 font-mono text-[12px] text-paper">
                            {money(item.price * item.quantity)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5 border-t border-paper-a18 px-4 py-3 text-right text-[12px]">
                      <div className="flex justify-between text-paper-a45">
                        <span>Subtotal</span>
                        <span className="font-mono">{money(selectedOrder.totals.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-paper-a45">
                        <span>Shipping</span>
                        <span className="font-mono">{money(selectedOrder.totals.shipping)}</span>
                      </div>
                      <div className="flex justify-between text-paper-a45">
                        <span>VAT</span>
                        <span className="font-mono">{money(selectedOrder.totals.vat)}</span>
                      </div>
                      {selectedOrder.totals.discount > 0 && (
                        <div className="flex justify-between text-paper-a45">
                          <span>Discount</span>
                          <span className="font-mono">−{money(selectedOrder.totals.discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-paper-a18 pt-2 text-[13px] text-paper">
                        <span>Total</span>
                        <span className="font-mono">{money(selectedOrder.totals.total)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-paper-a18 bg-paper p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[12px] font-medium text-paper">
                        <Truck className="h-3.5 w-3.5" strokeWidth={1.7} />
                        Tracking & dispatch
                      </div>
                      {selectedOrder.tracking && (
                        <button
                          type="button"
                          onClick={() => void copyText(selectedOrder.tracking || '', 'Tracking code')}
                          className="inline-flex items-center gap-1.5 text-[11px] text-paper-a45 hover:text-paper"
                        >
                          <Copy className="h-3 w-3" strokeWidth={1.6} />
                          Copy code
                        </button>
                      )}
                    </div>
                    {selectedOrder.tracking && (
                      <div className="mt-2 font-mono text-[12.5px] text-paper">
                        {selectedOrder.tracking}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={trackingNumber}
                        onChange={(event) => setTrackingNumber(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void saveTracking();
                        }}
                        placeholder={selectedOrder.tracking ? 'Replace tracking code…' : 'Enter carrier tracking code…'}
                        className="field flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => void saveTracking()}
                        disabled={!isEditor || isUpdating || !trackingNumber.trim()}
                        className="btn btn-primary"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-paper-a18 bg-paper p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[12px] font-medium text-paper">
                        <FileText className="h-3.5 w-3.5" strokeWidth={1.7} />
                        Internal note
                      </div>
                      <span className="text-[11px] text-paper-a45">{internalNote.length} characters</span>
                    </div>
                    <textarea
                      value={internalNote}
                      onChange={(event) => setInternalNote(event.target.value)}
                      placeholder="Record a packing instruction, customer request or handover note…"
                      className="field mt-3 min-h-[84px] resize-y"
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      {internalNote.trim() && (
                        <button
                          type="button"
                          onClick={() => setInternalNote('')}
                          className="btn-text !text-[12px]"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void saveNote()}
                        disabled={!isEditor || isUpdating || !internalNote.trim()}
                        className="btn btn-primary"
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={1.6} />
                        Add to timeline
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-paper-a18 bg-paper p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[12px] font-medium text-paper">
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.7} />
                        Timeline
                      </div>
                      <span className="text-[11px] text-paper-a45">
                        {(selectedOrder.timeline || []).length} event
                        {(selectedOrder.timeline || []).length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {(selectedOrder.timeline || []).length === 0 ? (
                      <div className="mt-3 text-[12px] text-paper-a45">
                        No timeline events recorded for this order.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {[...(selectedOrder.timeline || [])]
                          .sort(
                            (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
                          )
                          .map((event, index) => (
                            <div key={`${event.at}-${index}`} className="flex gap-3">
                              <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-paper-a18">
                                <span className="h-1.5 w-1.5 rounded-full bg-paper" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[12px] text-paper">
                                    {STATUS_LABELS[event.status as OrderStatus] || event.status}
                                  </span>
                                  <span className="font-mono text-[10.5px] text-paper-a45">
                                    {dateTime(event.at)}
                                  </span>
                                </div>
                                {event.note && (
                                  <div className="mt-0.5 text-[11.5px] leading-relaxed text-paper-a45">
                                    {event.note}
                                  </div>
                                )}
                                {event.by && (
                                  <div className="mt-0.5 text-[10.5px] text-paper-a45">
                                    by {event.by}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
