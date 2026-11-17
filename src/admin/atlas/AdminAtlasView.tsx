import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Boxes,
  Database,
  Gauge,
  Layers,
  Network,
  Search,
  Server,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { controlFetch } from '../control/controlApi';
import type { ControlOverview } from '../../controlPlane/types';
import type {
  Collection,
  Customer,
  Order,
  Product,
  WaitlistEntry,
} from '../../types';
import { ADMIN_MODULES, DATA_DOMAINS } from './atlasRegistry';

interface AdminAtlasViewProps {
  products: Product[];
  orders: Order[];
  customers: Customer[];
  waitlist: WaitlistEntry[];
  collections: Collection[];
  onNavigateView: (view: string) => void;
}

type AtlasRow = {
  id: string;
  code: string;
  name: string;
  group: string;
  surface: string;
  description: string;
  state: string;
  stateTone: 'live' | 'quiet' | 'down' | 'plain';
};

type AtlasFilter = 'all' | 'modules' | 'data' | 'services' | 'probes' | 'operations';

const FILTERS: Array<{ id: AtlasFilter; label: string }> = [
  { id: 'all', label: 'All surfaces' },
  { id: 'modules', label: 'Modules' },
  { id: 'data', label: 'Data domains' },
  { id: 'services', label: 'Services' },
  { id: 'probes', label: 'Probes' },
  { id: 'operations', label: 'Operations' },
];

const toneClass = (tone: AtlasRow['stateTone']) => {
  if (tone === 'live') return 'bg-[var(--admin-green)]';
  if (tone === 'quiet') return 'bg-[var(--admin-amber)]';
  if (tone === 'down') return 'bg-[var(--admin-red)]';
  return 'bg-[var(--admin-muted)]';
};

const controlStateTone = (status: string): AtlasRow['stateTone'] => {
  if (status === 'healthy' || status === 'operational') return 'live';
  if (status === 'degraded' || status === 'no_data') return 'quiet';
  if (status === 'down') return 'down';
  return 'plain';
};

export const AdminAtlasView: React.FC<AdminAtlasViewProps> = ({
  products,
  orders,
  customers,
  waitlist,
  collections,
  onNavigateView,
}) => {
  const [control, setControl] = useState<ControlOverview | null>(null);
  const [controlError, setControlError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AtlasFilter>('all');

  const loadControl = useCallback(async () => {
    try {
      const overview = await controlFetch<ControlOverview>('/api/control/overview');
      setControl(overview);
      setControlError('');
    } catch (error) {
      setControl(null);
      setControlError(
        error instanceof Error ? error.message : 'The control plane did not respond.'
      );
    }
  }, []);

  useEffect(() => {
    void loadControl();
  }, [loadControl]);

  const moduleState = useCallback(
    (id: string) => {
      if (id === 'products') return `${products.length} records`;
      if (id === 'orders') return `${orders.length} records`;
      if (id === 'customers') return `${customers.length} records`;
      if (id === 'waitlist') return `${waitlist.length} entries`;
      if (id === 'collections') return `${collections.length} drops`;
      if (id === 'health') return `${control?.summary.healthy ?? 0}/${control?.summary.services ?? 0} nominal`;
      if (id === 'control') {
        return control ? `${control.summary.services} services` : 'offline';
      }
      if (id.startsWith('control.')) {
        if (!control) return 'offline';
        if (id === 'control.overview') {
          return `${control.summary.healthy}/${control.summary.services} nominal`;
        }
        if (id === 'control.intelligence') return 'computed';
        if (id === 'control.history') return 'rolling';
        if (id === 'control.slo') return 'defined';
        if (id === 'control.incidents') return `${control.summary.activeIncidents} active`;
        if (id === 'control.alerts') return `${control.summary.activeAlerts} active`;
        if (id === 'control.deployments') return `${control.deployments.length} observed`;
        if (id === 'control.jobs') return `${control.summary.failingJobs} failing`;
        if (id === 'control.flags') return 'runtime';
        if (id === 'control.runbooks') return 'procedures';
        if (id === 'control.audit') return 'recorded';
        if (id === 'control.costs') return 'tracked';
        if (id === 'control.security') return 'monitored';
        if (id === 'control.backups') return 'drills';
        if (id === 'control.data') return 'checks';
        return 'ready';
      }
      if (id === 'dashboard') return `${orders.length} orders · ${products.length} pieces`;
      return 'surface';
    },
    [collections.length, control, customers.length, orders.length, products.length, waitlist.length]
  );

  const rows = useMemo<AtlasRow[]>(() => {
    const moduleRows: AtlasRow[] = ADMIN_MODULES.map((module) => ({
      id: `module:${module.id}`,
      code: module.id.toUpperCase(),
      name: module.name,
      group: module.group,
      surface: module.surface,
      description: module.description,
      state: moduleState(module.id),
      stateTone: module.surface === 'control panel' && !control ? 'plain' : 'live',
    }));

    const dataRows: AtlasRow[] = DATA_DOMAINS.map((domain) => ({
      id: `domain:${domain.name}`,
      code: domain.name.toUpperCase(),
      name: domain.name,
      group: domain.group,
      surface: domain.kind,
      description: domain.description,
      state: domain.kind === 'table' ? 'relation' : 'external',
      stateTone: domain.kind === 'external service' ? 'quiet' : 'plain',
    }));

    const serviceRows: AtlasRow[] = (control?.services || []).map((service) => ({
      id: `service:${service.id}`,
      code: service.id.toUpperCase(),
      name: service.name,
      group: `Tier ${service.tier}`,
      surface: 'service',
      description: service.description,
      state: service.status.replaceAll('_', ' '),
      stateTone: controlStateTone(service.status),
    }));

    const probeRows: AtlasRow[] = (control?.checks || []).map((check) => ({
      id: `probe:${check.id}`,
      code: check.id.toUpperCase(),
      name: check.name,
      group: check.kind,
      surface: 'probe',
      description: `${check.serviceId} · ${check.message || 'probe result'}`,
      state: check.latencyMs === null ? check.status.replaceAll('_', ' ') : `${Math.round(check.latencyMs)}ms`,
      stateTone: controlStateTone(check.status),
    }));

    const operationRows: AtlasRow[] = [
      ...(control?.incidents || []).map((incident) => ({
        id: `incident:${incident.id}`,
        code: 'INCIDENT',
        name: incident.title,
        group: incident.severity,
        surface: 'incident',
        description: `${incident.status} · ${incident.serviceIds.join(', ') || 'unscoped'}`,
        state: incident.status,
        stateTone: controlStateTone(incident.status === 'resolved' ? 'healthy' : 'down'),
      })),
      ...(control?.jobs || []).map((job) => ({
        id: `job:${job.id}`,
        code: 'JOB',
        name: job.name,
        group: job.status,
        surface: 'job',
        description: job.error || 'Scheduled operation',
        state: job.durationMs === null ? job.status : `${Math.round(job.durationMs)}ms`,
        stateTone: controlStateTone(job.status === 'failed' ? 'down' : 'healthy'),
      })),
      ...(control?.deployments || []).map((deployment) => ({
        id: `deployment:${deployment.id}`,
        code: 'DEPLOY',
        name: deployment.version,
        group: deployment.environment,
        surface: 'deployment',
        description: `${deployment.status} · ${new Date(deployment.startedAt).toLocaleString('en-GB')}`,
        state: deployment.status,
        stateTone: controlStateTone(deployment.status === 'failed' ? 'down' : 'healthy'),
      })),
    ];

    return [...moduleRows, ...dataRows, ...serviceRows, ...probeRows, ...operationRows];
  }, [control, moduleState]);

  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'modules' && row.id.startsWith('module:')) ||
        (filter === 'data' && row.id.startsWith('domain:')) ||
        (filter === 'services' && row.id.startsWith('service:')) ||
        (filter === 'probes' && row.id.startsWith('probe:')) ||
        (filter === 'operations' &&
          (row.id.startsWith('incident:') ||
            row.id.startsWith('job:') ||
            row.id.startsWith('deployment:')));
      if (!matchesFilter) return false;
      if (!search) return true;
      return [row.code, row.name, row.group, row.surface, row.description, row.state]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }, [filter, query, rows]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.group, (counts.get(row.group) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const moduleCount = rows.filter((row) => row.id.startsWith('module:')).length;
  const domainCount = rows.filter((row) => row.id.startsWith('domain:')).length;
  const serviceCount = rows.filter((row) => row.id.startsWith('service:')).length;
  const probeCount = rows.filter((row) => row.id.startsWith('probe:')).length;
  const operationCount = rows.filter(
    (row) =>
      row.id.startsWith('incident:') ||
      row.id.startsWith('job:') ||
      row.id.startsWith('deployment:')
  ).length;

  return (
    <div className="relative isolate text-paper">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,162,31,0.16) 0.55px, transparent 0.7px)',
          backgroundSize: '20px 20px',
          maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 88%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent, black 10%, black 88%, transparent)',
        }}
      />

      <header className="flex flex-col gap-10 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 micro-sm text-paper/55">
            <span className="inline-flex items-center gap-2">
              <Network className="h-3 w-3 text-[var(--admin-blue)]" strokeWidth={1.4} />
              System atlas / index 01
            </span>
            <span className="h-px w-6 bg-paper/15" />
            <span>{rows.length} indexed surfaces</span>
          </div>
          <h1 className="mt-6 font-display text-[clamp(58px,7.5vw,106px)] font-light leading-[0.82] tracking-[-0.055em] text-paper">
            Atlas
            <span className="text-paper/40">.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-[12px] leading-[1.9] text-paper/60">
            Every module, page, control panel, service, probe, table, bucket and operating
            artifact in the house, indexed in one place. This register is generated from the
            live system; unsupported entries are absent, not implied.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 xl:text-right">
          {[
            { label: 'Modules', value: moduleCount, color: 'var(--admin-blue)' },
            { label: 'Domains', value: domainCount, color: 'var(--admin-green)' },
            { label: 'Services', value: serviceCount, color: 'var(--admin-indigo)' },
            { label: 'Probes', value: probeCount, color: 'var(--admin-amber)' },
            { label: 'Ops objects', value: operationCount, color: 'var(--admin-violet)' },
            { label: 'Control', value: control ? 'live' : 'offline', color: control ? 'var(--admin-teal)' : 'var(--admin-red)' },
          ].map((entry) => (
            <div key={entry.label}>
              <p
                className="font-display text-[clamp(28px,3.4vw,42px)] font-light leading-none tracking-[-0.04em]"
                style={{ color: entry.color }}
              >
                {entry.value}
              </p>
              <p className="mt-2 micro-sm text-paper/45">{entry.label}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="mt-16 flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-3 micro-sm">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setFilter(entry.id)}
              className={`inline-flex items-center gap-2 transition-colors ${
                filter === entry.id ? 'text-paper' : 'text-paper/50 hover:text-paper/82'
              }`}
            >
              <span
                className={`h-1 w-1 ${
                  filter === entry.id ? 'bg-[var(--admin-blue)]' : 'bg-paper/20'
                }`}
              />
              {entry.label}
            </button>
          ))}
        </div>

        <label className="flex min-w-0 flex-1 items-center gap-3 micro-sm text-paper/50 xl:max-w-md">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--admin-blue)]" strokeWidth={1.4} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search every surface"
            className="min-w-0 flex-1 bg-transparent py-2 text-[12px] text-paper outline-none placeholder:text-paper/40"
          />
          <span className="shrink-0 font-mono text-[8px] text-paper/40">
            {filteredRows.length} / {rows.length}
          </span>
        </label>
      </div>

      <div className="mt-12 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4 xl:grid-cols-8">
        {groupCounts.slice(0, 12).map(([group, count], index) => (
          <div key={group}>
            <p
              className="font-mono text-[8px] tracking-[0.12em]"
              style={{
                color: [
                  'var(--admin-blue)',
                  'var(--admin-green)',
                  'var(--admin-violet)',
                  'var(--admin-amber)',
                  'var(--admin-teal)',
                  'var(--admin-indigo)',
                ][index % 6],
              }}
            >
              {group.toUpperCase()}
            </p>
            <p className="mt-1.5 font-display text-[24px] font-light leading-none text-paper/75">
              {count}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-14">
        <div className="grid grid-cols-[92px_1fr_auto] gap-4 micro-sm text-paper/40 sm:grid-cols-[130px_1.4fr_.8fr_.7fr_auto]">
          <span>Code</span>
          <span>Surface</span>
          <span className="hidden sm:block">Sector</span>
          <span className="hidden sm:block">Class</span>
          <span className="text-right">State</span>
        </div>

        <div className="mt-4">
          {filteredRows.map((row) => (
            <div
              key={row.id}
              className="group grid grid-cols-[92px_1fr_auto] items-baseline gap-4 border-b border-paper-a18/60 py-3 px-2 transition-colors hover:bg-[#10223f]/65 sm:grid-cols-[130px_1.4fr_.8fr_.7fr_auto]"
            >
              <span className="truncate font-mono text-[8px] tracking-[0.06em] text-paper/50">
                {row.code}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] text-paper/82 transition-colors group-hover:text-paper">
                  {row.name}
                </span>
                <span className="mt-1 block truncate text-[10px] text-paper/45">
                  {row.description}
                </span>
              </span>
              <span className="hidden truncate text-[10px] text-paper/55 sm:block">{row.group}</span>
              <span className="hidden truncate micro-sm text-paper/45 sm:block">{row.surface}</span>
              <span className="inline-flex items-center justify-end gap-2 text-right micro-sm text-paper/60">
                <span className={`h-1 w-1 shrink-0 ${toneClass(row.stateTone)}`} />
                <span className="max-w-[110px] truncate">{row.state}</span>
              </span>
            </div>
          ))}
          {filteredRows.length === 0 && (
            <div className="py-16 text-center">
              <Terminal className="mx-auto h-5 w-5 text-paper/40" strokeWidth={1.2} />
              <p className="mt-4 micro-sm text-paper/60">No surface matches this query</p>
              <p className="mt-2 text-[11px] text-paper/45">
                Clear the search or choose another sector.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-20 grid grid-cols-1 gap-x-10 gap-y-14 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <div className="mb-6">
            <span className="micro-sm text-paper/45">Surface index</span>
            <h2 className="mt-2 font-display text-[34px] font-light leading-none tracking-[-0.03em] text-paper">
              Open an instrument
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {[
              { icon: Gauge, label: 'Control plane', view: 'control', color: 'var(--admin-blue)' },
              { icon: Activity, label: 'System health', view: 'health', color: 'var(--admin-green)' },
              { icon: Boxes, label: 'Inventory', view: 'inventory', color: 'var(--admin-amber)' },
              { icon: Layers, label: 'Collections', view: 'collections', color: 'var(--admin-violet)' },
              { icon: Server, label: 'Service topology', view: 'control', color: 'var(--admin-indigo)' },
              { icon: ShieldCheck, label: 'Security', view: 'security', color: 'var(--admin-red)' },
              { icon: Database, label: 'Data quality', view: 'control', color: 'var(--admin-teal)' },
              { icon: Network, label: 'Overview', view: 'dashboard', color: 'var(--admin-blue)' },
            ].map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={`${entry.label}-${entry.view}`}
                  type="button"
                  onClick={() => onNavigateView(entry.view)}
                  className="group flex items-center gap-2.5 text-left micro-sm text-paper/60 transition-colors hover:text-paper"
                >
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    strokeWidth={1.3}
                    style={{ color: entry.color }}
                  />
                  <span className="truncate">{entry.label}</span>
                  <ArrowUpRight className="ml-auto h-3 w-3 shrink-0 text-paper/20 group-hover:text-paper/75" strokeWidth={1.3} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="xl:col-span-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <span className="micro-sm text-paper/45">Control plane</span>
              <h2 className="mt-2 font-display text-[34px] font-light leading-none tracking-[-0.03em] text-paper">
                Dependency spine
              </h2>
            </div>
            <span className="micro-sm text-paper/45">
              {control ? `${control.services.length} observed services` : controlError || 'offline'}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            {(control?.services || []).map((service) => (
              <div key={service.id} className="flex min-w-0 items-start gap-3 py-2.5">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${toneClass(controlStateTone(service.status))}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[12px] text-paper/78">{service.name}</span>
                    <span className="shrink-0 micro-sm text-paper/45">T{service.tier}</span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[8px] text-paper/40">
                    {service.dependencies.length > 0
                      ? `DEPENDS ON ${service.dependencies.join(' / ')}`
                      : 'ROOT SERVICE'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="mt-20 flex flex-wrap items-center justify-between gap-4 micro-sm text-paper/40">
        <span>System atlas · {rows.length} indexed surfaces · live registry</span>
        <span className="inline-flex items-center gap-2">
          <Database className="h-3 w-3" strokeWidth={1.4} />
          {DATA_DOMAINS.length} data domains
          <span className="h-1 w-1 bg-[var(--admin-teal)]" />
          {control ? `${control.checks.length} probes` : 'control offline'}
        </span>
      </footer>
    </div>
  );
};
