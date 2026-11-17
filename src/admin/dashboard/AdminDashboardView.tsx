import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  Clock3,
  Gauge,
  Layers,
  Package,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react';
import { supabase } from '../../supabase/config';
import { controlFetch } from '../control/controlApi';
import type { ControlOverview, ControlServiceState } from '../../controlPlane/types';
import type {
  Collection,
  Customer,
  Order,
  Product,
  WaitlistEntry,
} from '../../types';
import { SignalMap } from './SignalMap';
import { SignalRing, type RingSegment } from './SignalRing';
import { SignalTopology } from './SignalTopology';
import { SignalWave, type WavePoint } from './SignalWave';
import { countryPointsFromOrders } from './signalGeo';

interface AdminDashboardViewProps {
  adminName: string;
  role: string;
  products: Product[];
  orders: Order[];
  customers: Customer[];
  waitlist: WaitlistEntry[];
  collections: Collection[];
  liveVisitors: number;
  onNavigateView: (view: string) => void;
}

interface EventRow {
  timestamp: number;
  type: string;
  deviceClass: string;
  page: string;
}

const money = (value: number) =>
  new Intl.NumberFormat('en-FI', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value || 0);

const compactMoney = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 1_000) return `€${(value / 1_000).toFixed(1)}k`;
  return money(value);
};

const number = (value: number) => new Intl.NumberFormat('en-FI').format(value || 0);

const shortDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const fullDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const timeStamp = (value?: string | number | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const hourKey = (date: Date) =>
  `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}`;

const stockOf = (product: Product) =>
  product.variants && product.variants.length > 0
    ? product.variants.reduce((total, variant) => total + (variant.stock || 0), 0)
    : product.stock || 0;

const statusLabel: Record<string, string> = {
  new: 'Received',
  paid: 'Paid',
  packed: 'Packed',
  shipped: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const controlLabel: Record<string, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  not_configured: 'Not configured',
  healthy: 'Operational',
  no_data: 'No data',
};

const statusDot = (status: string) => {
  if (status === 'operational' || status === 'healthy' || status === 'delivered') {
    return 'bg-[var(--admin-green)]';
  }
  if (status === 'degraded' || status === 'packed' || status === 'shipped') {
    return 'bg-[var(--admin-amber)]';
  }
  if (status === 'down' || status === 'cancelled' || status === 'refunded') {
    return 'bg-[var(--admin-red)]';
  }
  return 'bg-[var(--admin-muted)]';
};

const statusColor = (status: string) => {
  if (status === 'operational' || status === 'healthy') return 'var(--admin-green)';
  if (status === 'degraded' || status === 'no_data') return 'var(--admin-amber)';
  if (status === 'down') return 'var(--admin-red)';
  return 'var(--admin-muted)';
};

const SectionLabel: React.FC<{
  index: string;
  title: string;
  note?: string;
  action?: React.ReactNode;
  accent?: string;
}> = ({ index, title, note, action, accent = 'var(--admin-blue)' }) => (
  <div className="mb-6 flex items-end justify-between gap-5">
    <div className="min-w-0">
      <span className="micro-sm inline-flex items-center gap-2 text-paper/55">
        <span className="h-1.5 w-1.5 shrink-0" style={{ background: accent }} />
        {index}
      </span>
      <h2 className="mt-2 font-display text-[clamp(25px,2.7vw,34px)] font-light leading-none tracking-[-0.03em] text-paper">
        {title}
      </h2>
      {note && <p className="mt-2 text-[11px] leading-relaxed text-paper/55">{note}</p>}
    </div>
    {action}
  </div>
);

const BigMetric: React.FC<{
  label: string;
  value: string;
  note: string;
  icon?: React.ElementType;
  accent?: string;
}> = ({ label, value, note, icon: Icon, accent = 'var(--admin-blue)' }) => (
  <div className="group relative">
    <div className="flex items-center justify-between gap-3">
      <span className="micro-sm inline-flex items-center gap-2 text-paper/55">
        <span className="h-1 w-1 shrink-0" style={{ background: accent }} />
        {label}
      </span>
      {Icon && <Icon className="h-3 w-3 text-paper/40" strokeWidth={1.3} style={{ color: accent }} />}
    </div>
    <p className="mt-4 font-display text-[clamp(30px,3.6vw,46px)] font-light leading-none tracking-[-0.04em] text-paper">
      {value}
    </p>
    <p className="mt-2 truncate micro-sm normal-case tracking-[0.04em] text-paper/50">{note}</p>
  </div>
);

const QuietEmpty: React.FC<{ icon: React.ElementType; title: string; note: string }> = ({
  icon: Icon,
  title,
  note,
}) => (
  <div className="flex min-h-[150px] flex-col items-start justify-center">
    <Icon className="h-4 w-4 text-paper/40" strokeWidth={1.2} />
    <p className="mt-3 micro-sm text-paper/60">{title}</p>
    <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-paper/50">{note}</p>
  </div>
);

const BarLine: React.FC<{
  label: string;
  value: string;
  percent: number;
  muted?: boolean;
  accent?: string;
}> = ({ label, value, percent, muted, accent = 'var(--admin-amber)' }) => (
  <div className="flex items-center gap-3">
    <span className="w-[74px] shrink-0 text-[11px] text-paper/65">{label}</span>
    <div className="h-px flex-1 bg-paper/10">
      <div
        className="h-px"
        style={{
          width: `${Math.max(2, Math.min(100, percent))}%`,
          background: muted ? 'var(--admin-muted)' : accent,
        }}
      />
    </div>
    <span className="w-8 shrink-0 text-right font-mono text-[9px] text-paper/60">{value}</span>
  </div>
);

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  adminName,
  role,
  products,
  orders,
  customers,
  waitlist,
  collections,
  liveVisitors,
  onNavigateView,
}) => {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [control, setControl] = useState<ControlOverview | null>(null);
  const [controlError, setControlError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [waveMode, setWaveMode] = useState<'events' | 'revenue'>('events');

  const loadLiveSignals = useCallback(async (quiet = false) => {
    if (!quiet) setIsRefreshing(true);
    const since = Date.now() - 24 * 60 * 60 * 1000;

    const eventsRequest = supabase
      .from('events')
      .select('timestamp,type,deviceClass,page')
      .gte('timestamp', since)
      .order('timestamp', { ascending: false })
      .limit(2500);

    const controlRequest = controlFetch<ControlOverview>('/api/control/overview');

    const [eventsResult, controlResult] = await Promise.allSettled([
      eventsRequest,
      controlRequest,
    ]);

    if (eventsResult.status === 'fulfilled' && !eventsResult.value.error && eventsResult.value.data) {
      setEvents(eventsResult.value.data as EventRow[]);
    } else {
      setEvents([]);
    }

    if (controlResult.status === 'fulfilled') {
      setControl(controlResult.value);
      setControlError('');
    } else {
      setControlError(
        controlResult.status === 'rejected'
          ? controlResult.reason?.message || 'Control plane unreachable.'
          : 'Control plane unreachable.'
      );
    }

    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadLiveSignals();
    const timer = window.setInterval(() => void loadLiveSignals(true), 60000);
    return () => window.clearInterval(timer);
  }, [loadLiveSignals]);

  useEffect(() => {
    if (control && control.services.length > 0) {
      const stillExists = control.services.some((service) => service.id === selectedServiceId);
      if (!stillExists) {
        setSelectedServiceId(control.services[0].id);
      }
    }
  }, [control, selectedServiceId]);

  const operator = adminName || 'Operator';
  const operatorFirstName = operator.includes('@')
    ? operator.split('@')[0]
    : operator.split(/\s+/)[0];

  const metrics = useMemo(() => {
    const sorted = [...orders].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    const revenue = sorted.reduce((sum, order) => sum + (order.totals?.total || 0), 0);
    const units = sorted.reduce(
      (sum, order) =>
        sum + (order.items || []).reduce((itemSum, item) => itemSum + (item.quantity || 0), 0),
      0
    );
    const active = sorted.filter(
      (order) => !['delivered', 'cancelled', 'refunded'].includes(order.status)
    );
    const today = dateKey(new Date());
    const todayOrders = sorted.filter(
      (order) => (order.createdAt || '').slice(0, 10) === today
    );
    const stockLevels = products.map((product) => ({
      product,
      stock: stockOf(product),
    }));
    const lowStock = stockLevels.filter((entry) => entry.stock > 0 && entry.stock <= 3);
    const outOfStock = stockLevels.filter((entry) => entry.stock <= 0);
    const stockUnits = stockLevels.reduce((sum, entry) => sum + Math.max(0, entry.stock), 0);
    const live = products.filter((product) => product.status === 'live').length;

    const salesMap = new Map<string, { product: Product; units: number; revenue: number }>();
    for (const order of sorted) {
      for (const item of order.items || []) {
        const product = products.find((entry) => entry.id === item.productId);
        if (!product) continue;
        const current = salesMap.get(item.productId) || { product, units: 0, revenue: 0 };
        current.units += item.quantity || 0;
        current.revenue += (item.price || 0) * (item.quantity || 0);
        salesMap.set(item.productId, current);
      }
    }
    const topProducts = Array.from(salesMap.values())
      .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
      .slice(0, 5);

    const days: Array<{ label: string; revenue: number; orders: number }> = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const key = dateKey(date);
      const dayOrders = sorted.filter((order) => (order.createdAt || '').slice(0, 10) === key);
      days.push({
        label: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        revenue: dayOrders.reduce((sum, order) => sum + (order.totals?.total || 0), 0),
        orders: dayOrders.length,
      });
    }

    const statuses = ['new', 'paid', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded']
      .map((status) => ({
        status,
        label: statusLabel[status] || status,
        count: sorted.filter((order) => order.status === status).length,
      }))
      .filter((entry) => entry.count > 0);

    const stockBands = [
      { label: 'Out', count: stockLevels.filter((entry) => entry.stock <= 0).length },
      {
        label: '1–3',
        count: stockLevels.filter((entry) => entry.stock > 0 && entry.stock <= 3).length,
      },
      {
        label: '4–10',
        count: stockLevels.filter((entry) => entry.stock > 3 && entry.stock <= 10).length,
      },
      { label: '10+', count: stockLevels.filter((entry) => entry.stock > 10).length },
    ];

    return {
      sorted,
      revenue,
      units,
      active,
      todayOrders,
      lowStock,
      outOfStock,
      stockUnits,
      live,
      topProducts,
      days,
      statuses,
      stockBands,
      aov: sorted.length > 0 ? revenue / sorted.length : 0,
    };
  }, [orders, products]);

  const eventSeries = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 24 }, (_, index) => {
      const date = new Date(now);
      date.setMinutes(0, 0, 0);
      date.setHours(date.getHours() - (23 - index));
      return {
        key: hourKey(date),
        label: `${String(date.getHours()).padStart(2, '0')}:00`,
        events: 0,
      };
    });
    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    for (const event of events) {
      const date = new Date(Number(event.timestamp));
      if (Number.isNaN(date.getTime())) continue;
      const bucket = byKey.get(hourKey(date));
      if (bucket) bucket.events += 1;
    }
    return buckets;
  }, [events]);

  const waveEvents: WavePoint[] = useMemo(
    () => eventSeries.map((point) => ({ label: point.label, value: point.events })),
    [eventSeries]
  );

  const waveRevenue: WavePoint[] = useMemo(
    () => metrics.days.map((point) => ({ label: point.label, value: point.revenue })),
    [metrics.days]
  );

  const countryPoints = useMemo(() => countryPointsFromOrders(orders), [orders]);

  const selectedService = useMemo<ControlServiceState | null>(
    () => control?.services.find((service) => service.id === selectedServiceId) || null,
    [control, selectedServiceId]
  );

  const postureSegments: RingSegment[] = useMemo(() => {
    if (!control) return [];
    return [
      { label: 'Operational', count: control.summary.healthy },
      { label: 'Degraded', count: control.summary.degraded },
      { label: 'Down', count: control.summary.down },
      { label: 'Unconfigured', count: control.summary.notConfigured },
    ];
  }, [control]);

  const overallStatus = control?.status || 'not_configured';
  const serviceChecks = control?.checks || [];
  const probeChecks = serviceChecks.slice(0, 6);
  const recentOrders = metrics.sorted.slice(0, 6);
  const recentEvents = events.slice(0, 6);
  const stockMax = Math.max(...metrics.stockBands.map((band) => band.count), 1);

  return (
    <div className="relative isolate text-paper">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.055) 0.6px, transparent 0.8px)',
          backgroundSize: '22px 22px',
          maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 82%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent, black 10%, black 82%, transparent)',
        }}
      />

      <header className="flex flex-col gap-10 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 micro-sm text-paper/55">
            <span className="inline-flex items-center gap-2">
              <span className={`h-1.5 w-1.5 ${liveVisitors > 0 ? 'bg-[var(--admin-green)]' : 'bg-paper/20'}`} />
              ZEJESH / control surface
            </span>
            <span className="h-px w-6 bg-paper/15" />
            <span>{fullDate(new Date().toISOString())}</span>
            <span className="h-px w-6 bg-paper/15" />
            <span>{role || 'Administrator'}</span>
          </div>

          <h1 className="mt-6 font-display text-[clamp(58px,7.5vw,106px)] font-light leading-[0.82] tracking-[-0.055em] text-paper">
            Signal
            <br />
            <em>room.</em>
          </h1>

          <p className="mt-7 max-w-xl text-[12px] leading-[1.9] text-paper/60">
            {operatorFirstName}, this is the operating picture: live infrastructure topology,
            actual service probes, consented telemetry, order geography and catalogue risk. No
            photography. No decoration. No invented readings.
          </p>
        </div>

        <div className="flex flex-col items-start gap-6 xl:items-end">
          <div className="text-left xl:text-right">
            <span className="micro-sm text-paper/50">System state</span>
            <p
              className="mt-2 font-display text-[clamp(36px,4.8vw,58px)] font-light leading-none tracking-[-0.04em]"
              style={{ color: control ? statusColor(overallStatus) : 'var(--admin-muted)' }}
            >
              {control ? controlLabel[overallStatus] || overallStatus : 'Awaiting telemetry'}
            </p>
            <p className="mt-3 micro-sm text-paper/55">
              {control
                ? `${control.summary.healthy}/${control.summary.services} services nominal`
                : controlError || 'Control plane offline'}
            </p>
            <p className="mt-1 micro-sm text-paper/45">
              {control
                ? `${control.summary.activeAlerts} alerts · ${control.summary.activeIncidents} incidents · ${control.summary.failingJobs} failing jobs`
                : 'No probe state received'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 micro-sm">
            <button
              type="button"
              onClick={() => void loadLiveSignals()}
              className="inline-flex items-center gap-2 text-paper/65 transition-colors hover:text-paper"
            >
              <RefreshCw
                className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`}
                strokeWidth={1.4}
              />
              Refresh signal
            </button>
            <button
              type="button"
              onClick={() => onNavigateView('control')}
              className="inline-flex items-center gap-2 text-paper/65 transition-colors hover:text-paper"
            >
              Control plane
              <ArrowUpRight className="h-3 w-3" strokeWidth={1.4} />
            </button>
            <span className="font-mono text-[8px] tracking-[0.1em] text-paper/45">
              {control?.generatedAt ? `SYNC ${timeStamp(control.generatedAt)}` : 'NO SYNC'}
            </span>
          </div>
        </div>
      </header>

      <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
        <BigMetric
          label="Recorded revenue"
          value={compactMoney(metrics.revenue)}
          note={`${metrics.sorted.length} orders · ${metrics.units} units`}
          icon={CircleDollarSign}
          accent="var(--admin-green)"
        />
        <BigMetric
          label="Orders today"
          value={String(metrics.todayOrders.length)}
          note={`${metrics.active.length} in progress`}
          icon={ShoppingBag}
          accent="var(--admin-blue)"
        />
        <BigMetric
          label="Average order"
          value={metrics.sorted.length > 0 ? money(metrics.aov) : 'n/a'}
          note="recorded order value"
          icon={TrendingUp}
          accent="var(--admin-violet)"
        />
        <BigMetric
          label="Live visitors"
          value={String(liveVisitors)}
          note="five-minute window"
          icon={Radio}
          accent="var(--admin-teal)"
        />
        <BigMetric
          label="Stock units"
          value={number(metrics.stockUnits)}
          note={`${metrics.live} live pieces`}
          icon={Boxes}
          accent="var(--admin-amber)"
        />
        <BigMetric
          label="Catalogue risk"
          value={String(metrics.lowStock.length + metrics.outOfStock.length)}
          note={`${metrics.outOfStock.length} out · ${metrics.lowStock.length} low`}
          icon={Package}
          accent="var(--admin-red)"
        />
      </div>

      <div className="mt-20 grid grid-cols-1 gap-x-10 gap-y-20 xl:grid-cols-12">
        <div className="space-y-16 xl:col-span-3">
          <section>
            <SectionLabel index="01 / Posture" title="System ring" accent="var(--admin-green)" />
            {control ? (
              <>
                <SignalRing
                  segments={postureSegments}
                  centerValue={`${control.summary.healthy}/${control.summary.services}`}
                  centerLabel="services nominal"
                />
                <div className="mt-7 space-y-3">
                  {[
                    { label: 'Operational', value: control.summary.healthy, color: 'var(--admin-green)' },
                    { label: 'Degraded', value: control.summary.degraded, color: 'var(--admin-amber)' },
                    { label: 'Down', value: control.summary.down, color: 'var(--admin-red)' },
                    { label: 'Unconfigured', value: control.summary.notConfigured, color: 'var(--admin-muted)' },
                  ].map((entry) => (
                    <div
                      key={entry.label}
                      className="flex items-center justify-between gap-4 text-[11px]"
                    >
                      <span className="inline-flex items-center gap-2 text-paper/65">
                        <span className="h-1 w-1" style={{ background: entry.color }} />
                        {entry.label}
                      </span>
                      <span className="font-mono text-[9px] text-paper/65">{entry.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-7 space-y-1.5 micro-sm text-paper/45">
                  <p>{control.environment} · {control.version}</p>
                  <p>Generated {timeStamp(control.generatedAt)}</p>
                </div>
              </>
            ) : (
              <QuietEmpty
                icon={Gauge}
                title="No posture received"
                note="The ring appears after the control plane returns live service summaries."
              />
            )}
          </section>

          <section>
            <SectionLabel index="02 / Inventory" title="Catalogue risk" accent="var(--admin-amber)" />
            <div className="space-y-4">
              {metrics.stockBands.map((band) => (
                <BarLine
                  key={band.label}
                  label={`${band.label} units`}
                  value={String(band.count)}
                  percent={(band.count / stockMax) * 100}
                  muted={band.count === 0}
                />
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 micro-sm text-paper/55">
              <span>{metrics.outOfStock.length} out</span>
              <span>{metrics.lowStock.length} low</span>
              <span>{products.length} pieces</span>
            </div>
          </section>

          <section>
            <SectionLabel
              index="03 / Probes"
              title="Signal matrix"
              accent="var(--admin-blue)"
              action={
                <button
                  type="button"
                  onClick={() => onNavigateView('health')}
                  className="inline-flex items-center gap-1.5 micro-sm text-paper/50 hover:text-paper"
                >
                  All
                  <ArrowRight className="h-3 w-3" strokeWidth={1.4} />
                </button>
              }
            />
            {probeChecks.length > 0 ? (
              <div className="space-y-0">
                {probeChecks.map((check) => (
                  <div
                    key={check.id}
                    className="flex items-center gap-3 py-2.5 text-[11px] last:pb-0"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 ${statusDot(check.status)}`} />
                    <span className="min-w-0 flex-1 truncate text-paper/70">{check.name}</span>
                    <span className="shrink-0 font-mono text-[9px] text-paper/50">
                      {check.latencyMs === null ? '—' : `${Math.round(check.latencyMs)}ms`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <QuietEmpty
                icon={Activity}
                title="No probe samples"
                note="Run diagnostics from the Control Plane to populate this matrix."
              />
            )}
          </section>
        </div>

        <div className="space-y-20 xl:col-span-6">
          <section>
            <SectionLabel
              index="04 / Infrastructure"
              title="Service topology"
              accent="var(--admin-indigo)"
              note="Actual dependencies from the control-plane service catalogue. Select a node to inspect its probes."
              action={
                <span className="inline-flex items-center gap-2 micro-sm text-paper/50">
                  <span className="h-1 w-1 bg-[var(--admin-indigo)]" />
                  Live graph
                </span>
              }
            />
            <SignalTopology
              services={control?.services || []}
              selectedId={selectedServiceId}
              onSelect={setSelectedServiceId}
            />

            <div className="mt-4 min-h-[142px]">
              {selectedService ? (
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                    <h3 className="font-display text-[clamp(26px,3vw,38px)] font-light leading-none tracking-[-0.03em] text-paper">
                      {selectedService.name}
                    </h3>
                    <span className="inline-flex items-center gap-2 micro-sm text-paper/60">
                      <span className={`h-1.5 w-1.5 ${statusDot(selectedService.status)}`} />
                      {controlLabel[selectedService.status] || selectedService.status}
                    </span>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-paper/60">
                    {selectedService.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 micro-sm text-paper/50">
                    <span>Tier {selectedService.tier}</span>
                    <span>{selectedService.checks.length} probes</span>
                    <span>
                      {selectedService.checks.filter((check) => check.status === 'healthy').length}{' '}
                      nominal
                    </span>
                    <span>Checked {timeStamp(selectedService.lastCheckedAt)}</span>
                  </div>
                  {selectedService.checks.length > 0 && (
                    <div className="mt-5 grid gap-x-6 sm:grid-cols-2">
                      {selectedService.checks.map((check) => (
                        <div
                          key={check.id}
                          className="flex items-center justify-between gap-4 py-1.5 text-[10px]"
                        >
                          <span className="inline-flex min-w-0 items-center gap-2 text-paper/60">
                            <span className={`h-1 w-1 shrink-0 ${statusDot(check.status)}`} />
                            <span className="truncate">{check.name}</span>
                          </span>
                          <span className="shrink-0 font-mono text-[8px] text-paper/45">
                            {check.latencyMs === null ? '—' : `${Math.round(check.latencyMs)}ms`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-paper/55">
                  {controlError || 'Select a service node to inspect its probes.'}
                </p>
              )}
            </div>
          </section>

          <section>
            <SectionLabel index="05 / Telemetry" title="Flow signature" accent="var(--admin-teal)" />
            <SignalWave
              mode={waveMode}
              onModeChange={setWaveMode}
              events={waveEvents}
              revenue={waveRevenue}
              eventTotal={events.length}
              revenueTotal={metrics.revenue}
            />
          </section>
        </div>

        <div className="space-y-16 xl:col-span-3">
          <section>
            <SectionLabel
              index="06 / Geography"
              title="Shipping field"
              accent="var(--admin-violet)"
              note="Actual countries from recorded order addresses."
            />
            <SignalMap points={countryPoints} />
            {countryPoints.length > 0 && (
              <div className="mt-5 space-y-2.5">
                {countryPoints.slice(0, 4).map((point) => (
                  <div
                    key={point.label}
                    className="flex items-center justify-between gap-4 text-[11px]"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2 text-paper/65">
                      <span className="h-1 w-1 shrink-0 bg-[var(--admin-violet)]" />
                      <span className="truncate">{point.label}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-paper/55">
                      {point.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionLabel
              index="07 / Orders"
              title="Order book"
              accent="var(--admin-blue)"
              action={
                <button
                  type="button"
                  onClick={() => onNavigateView('orders')}
                  className="inline-flex items-center gap-1.5 micro-sm text-paper/50 hover:text-paper"
                >
                  All
                  <ArrowRight className="h-3 w-3" strokeWidth={1.4} />
                </button>
              }
            />
            {recentOrders.length > 0 ? (
              <div className="space-y-0">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-start gap-3 py-3 transition-colors last:pb-0 hover:bg-paper/[0.02]"
                  >
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${statusDot(order.status)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-mono text-[9px] tracking-[0.06em] text-paper/70">
                          {order.number}
                        </span>
                        <span className="shrink-0 font-mono text-[9px] text-paper/65">
                          {compactMoney(order.totals?.total || 0)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-paper/55">
                        {order.customer?.name || order.customer?.email || 'Guest'}
                      </p>
                      <p className="mt-1 micro-sm text-paper/45">
                        {statusLabel[order.status] || order.status} · {shortDate(order.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <QuietEmpty
                icon={ShoppingBag}
                title="Order book clear"
                note="Completed checkouts will appear here."
              />
            )}
          </section>

          <section>
            <SectionLabel
              index="08 / Telemetry"
              title="Event stream"
              accent="var(--admin-teal)"
              action={
                <span className="inline-flex items-center gap-2 micro-sm text-paper/50">
                  <span className={`h-1 w-1 ${events.length > 0 ? 'bg-[var(--admin-teal)]' : 'bg-paper/20'}`} />
                  24h
                </span>
              }
            />
            {recentEvents.length > 0 ? (
              <div className="space-y-0">
                {recentEvents.map((event, index) => (
                  <div
                    key={`${event.timestamp}-${index}`}
                    className="flex items-start gap-3 py-2.5 last:pb-0"
                  >
                    <span className="mt-1 h-1 w-1 shrink-0 bg-[var(--admin-teal)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] capitalize text-paper/70">{event.type}</p>
                      <p className="mt-1 truncate micro-sm text-paper/45">{event.page || '/'}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[8px] text-paper/45">
                      {timeStamp(event.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <QuietEmpty
                icon={Radio}
                title="No consented events"
                note="Storefront events appear only after visitor consent."
              />
            )}
          </section>
        </div>
      </div>

      <div className="mt-24 grid grid-cols-1 gap-x-10 gap-y-14 xl:grid-cols-12">
        <section className="xl:col-span-5">
          <SectionLabel index="09 / Collected" title="Most collected" accent="var(--admin-amber)" />
          {metrics.topProducts.length > 0 ? (
            <div className="space-y-0">
              {metrics.topProducts.map((entry, index) => (
                <div
                  key={entry.product.id}
                  className="flex items-baseline gap-4 py-3.5 last:pb-0"
                >
                  <span className="w-5 shrink-0 font-mono text-[8px] text-paper/40">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-paper/75">
                      {entry.product.name?.en || entry.product.plateNumber}
                    </p>
                    <p className="mt-1 micro-sm text-paper/45">
                      {entry.product.plateNumber} · {entry.units} units
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[9px] text-paper/55">
                    {compactMoney(entry.revenue)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <QuietEmpty
              icon={Package}
              title="No sales ranking"
              note="The ranking appears once pieces are sold."
            />
          )}
        </section>

        <section className="xl:col-span-7">
          <SectionLabel index="10 / Console" title="Open the instrument" accent="var(--admin-green)" />
          <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
            {[
              { icon: CircleDollarSign, label: 'Analytics', note: 'Revenue intelligence', view: 'analytics', color: 'var(--admin-green)' },
              { icon: ShoppingBag, label: 'Orders', note: `${metrics.active.length} in progress`, view: 'orders', color: 'var(--admin-blue)' },
              { icon: Users, label: 'Clientele', note: `${customers.length} records`, view: 'customers', color: 'var(--admin-violet)' },
              { icon: Clock3, label: 'Waitlist', note: `${waitlist.length} entries`, view: 'waitlist', color: 'var(--admin-amber)' },
              { icon: Layers, label: 'Collections', note: `${collections.length} drops`, view: 'collections', color: 'var(--admin-teal)' },
              { icon: ShieldCheck, label: 'Control', note: 'Infrastructure', view: 'control', color: 'var(--admin-indigo)' },
            ].map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.label}
                  type="button"
                  onClick={() => onNavigateView(entry.view)}
                  className="group flex items-start gap-3 text-left"
                >
                  <Icon
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-paper/40 transition-colors group-hover:text-paper"
                    strokeWidth={1.3}
                    style={{ color: entry.color }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] text-paper/75 transition-colors group-hover:text-paper">
                      {entry.label}
                    </span>
                    <span className="mt-1 block micro-sm text-paper/45">{entry.note}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <footer className="mt-20 flex flex-wrap items-center justify-between gap-4 micro-sm text-paper/45">
        <span>ZEJESH operations surface · recorded data only</span>
        <span className="inline-flex items-center gap-2">
          <Server className="h-3 w-3" strokeWidth={1.4} />
          {control ? `${control.summary.services} services observed` : 'control plane offline'}
          <span className="h-1 w-1 bg-paper/20" />
          {role || 'Administrator'}
        </span>
      </footer>
    </div>
  );
};
