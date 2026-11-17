import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  HelpCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react';
import { supabase } from '../../supabase/config';
import {
  ControlCheckResult,
  ControlCheckStatus,
  ControlOverview,
  ControlOverallStatus,
} from '../../controlPlane/types';
import { ControlHistoryPanel } from './ControlHistoryPanel';
import { ControlSloPanel } from './ControlSloPanel';
import { ControlIncidentsPanel } from './ControlIncidentsPanel';
import { ControlDeploymentsPanel } from './ControlDeploymentsPanel';
import { ControlAlertsPanel } from './ControlAlertsPanel';
import { ControlDataQualityPanel } from './ControlDataQualityPanel';
import { ControlJobsPanel } from './ControlJobsPanel';
import { ControlFlagsPanel } from './ControlFlagsPanel';
import { ControlRunbooksPanel } from './ControlRunbooksPanel';
import { ControlAuditPanel } from './ControlAuditPanel';
import { ControlCostsPanel } from './ControlCostsPanel';
import { ControlSecurityPanel } from './ControlSecurityPanel';
import { ControlBackupsPanel } from './ControlBackupsPanel';
import { ControlIntelligencePanel } from './ControlIntelligencePanel';

type ControlTab =
  | 'overview'
  | 'intelligence'
  | 'history'
  | 'slo'
  | 'incidents'
  | 'alerts'
  | 'deployments'
  | 'jobs'
  | 'flags'
  | 'runbooks'
  | 'audit'
  | 'costs'
  | 'security'
  | 'backups'
  | 'data';

const STATUS_LABEL: Record<ControlCheckStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
  not_configured: 'Not configured',
  no_data: 'No data',
};

const OVERALL_LABEL: Record<ControlOverallStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  not_configured: 'Not configured',
};

const statusTone = (status: ControlCheckStatus | ControlOverallStatus) => {
  if (status === 'healthy' || status === 'operational') {
    return 'border-[var(--admin-green)] text-[var(--admin-green)]';
  }
  if (status === 'degraded' || status === 'no_data') {
    return 'border-[var(--admin-amber)] text-[var(--admin-amber)]';
  }
  if (status === 'not_configured') {
    return 'border-[var(--admin-muted)] text-[var(--admin-muted)]';
  }
  return 'border-[var(--admin-red)] bg-[var(--admin-red)] text-white';
};

const statusIcon = (status: ControlCheckStatus | ControlOverallStatus) => {
  if (status === 'healthy' || status === 'operational') {
    return <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.4} />;
  }
  if (status === 'degraded' || status === 'no_data') {
    return <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.4} />;
  }
  if (status === 'not_configured') {
    return <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.4} />;
  }
  return <XCircle className="h-3.5 w-3.5" strokeWidth={1.4} />;
};

const formatTime = (value: string | null) => {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatLatency = (value: number | null) => {
  if (value === null || value === undefined) return '—';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
};

const serviceIcon = (serviceId: string) => {
  if (serviceId === 'postgres') return <Database className="h-4 w-4" strokeWidth={1.3} />;
  if (serviceId === 'admin') return <ShieldCheck className="h-4 w-4" strokeWidth={1.3} />;
  if (serviceId === 'storefront') return <Terminal className="h-4 w-4" strokeWidth={1.3} />;
  return <Server className="h-4 w-4" strokeWidth={1.3} />;
};

const CheckRow: React.FC<{ check: ControlCheckResult }> = ({ check }) => (
  <div className="grid grid-cols-1 gap-3 border-t border-paper-a18 py-4 sm:grid-cols-[1.4fr_.8fr_.6fr_.7fr] sm:items-center">
    <div className="min-w-0">
      <div className="text-[12px] tracking-[0.04em] text-paper">{check.name}</div>
      <div className="micro-sm mt-1 text-paper-a45">{check.id}</div>
    </div>
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[9px] uppercase tracking-[0.22em] ${statusTone(check.status)}`}>
        {statusIcon(check.status)}
        {STATUS_LABEL[check.status]}
      </span>
    </div>
    <div className="font-mono text-[10px] tracking-[0.12em] text-paper-a45">
      {formatLatency(check.latencyMs)}
    </div>
    <div className="text-[11px] leading-relaxed text-paper-a45">
      <span className="block">{check.message}</span>
      <span className="micro-sm mt-1 block text-paper-a18">{formatTime(check.checkedAt)}</span>
    </div>
  </div>
);

const EmptyLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="border-t border-paper-a18 py-5 text-[12px] leading-relaxed text-paper-a45">
    {children}
  </div>
);

export const AdminControlPlaneView: React.FC = () => {
  const [overview, setOverview] = useState<ControlOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ControlTab>('overview');

  const loadOverview = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error('No active operator session. Sign in again to read the control plane.');
      }

      const response = await fetch('/api/control/overview', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Control plane returned HTTP ${response.status}.`);
      }
      setOverview(payload as ControlOverview);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The control plane could not be reached.');
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    const timer = window.setInterval(() => void loadOverview(true), 30_000);
    return () => window.clearInterval(timer);
  }, [loadOverview]);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setNotice(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active operator session.');

      const response = await fetch('/api/control/health/run', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Diagnostics returned HTTP ${response.status}.`);
      }
      const persistence = payload?.persistence;
      setNotice(
        persistence?.persisted
          ? `Diagnostics recorded. ${persistence.message}`
          : `Diagnostics completed without persistence. ${persistence?.message || ''}`.trim()
      );
      await loadOverview(true);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Diagnostics failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const overall = overview?.status || 'not_configured';
  const checks = overview?.checks || [];
  const failingChecks = checks.filter(
    (check) => check.status === 'down' || check.status === 'degraded' || check.status === 'not_configured'
  );

  const tabs: Array<{ id: ControlTab; label: string; badge?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'intelligence', label: 'Intelligence' },
    { id: 'history', label: 'History' },
    { id: 'slo', label: 'SLOs' },
    { id: 'incidents', label: 'Incidents', badge: overview?.summary.activeIncidents },
    { id: 'alerts', label: 'Alerts', badge: overview?.summary.activeAlerts },
    { id: 'deployments', label: 'Deployments' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'flags', label: 'Flags' },
    { id: 'runbooks', label: 'Runbooks' },
    { id: 'audit', label: 'Audit' },
    { id: 'costs', label: 'Costs' },
    { id: 'security', label: 'Security' },
    { id: 'backups', label: 'Backups' },
    { id: 'data', label: 'Data quality' },
  ];

  return (
    <div className="max-w-[1500px]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-paper-a18 pb-5">
        <div className="flex items-center gap-3">
          <Gauge className="h-4 w-4 text-paper-a72" strokeWidth={1.3} />
          <span className="micro-sm text-paper-a45">Operations / Control Plane</span>
          <span className="micro-sm text-paper-a18">Operations</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="inline-flex h-9 items-center gap-2 border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.24em] text-paper-a72 transition-colors hover:border-paper hover:text-paper"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.4} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void runDiagnostics()}
            disabled={isRunning}
            className="inline-flex h-9 items-center gap-2 border border-paper px-3 text-[9px] uppercase tracking-[0.24em] text-paper transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
          >
            <Activity className={`h-3 w-3 ${isRunning ? 'animate-pulse' : ''}`} strokeWidth={1.4} />
            {isRunning ? 'Running' : 'Run diagnostics'}
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-[clamp(42px,6vw,86px)] leading-[0.86] tracking-[-0.035em]">
            Control <em>Plane</em>
          </h1>
          <p className="mt-5 max-w-[52ch] text-[13px] leading-[1.8] text-paper-a45">
            Live service health, dependency checks and operator diagnostics. Every value on this page
            is measured. Missing configuration is reported as missing, never as a healthy system.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <span className={`inline-flex items-center gap-2 border px-3 py-2 text-[9px] uppercase tracking-[0.24em] ${statusTone(overall)}`}>
            {statusIcon(overall)}
            {OVERALL_LABEL[overall]}
          </span>
          {overview && (
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper-a45">
              {overview.environment} · {overview.version} · {formatTime(overview.generatedAt)}
            </div>
          )}
        </div>
      </div>

      {activeTab === 'overview' && error && (
        <div className="mt-8 border border-paper-a18 p-5">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-paper" strokeWidth={1.3} />
            <div>
              <div className="text-[12px] text-paper">Control plane unreachable</div>
              <p className="mt-2 text-[12px] leading-relaxed text-paper-a45">{error}</p>
              <button
                type="button"
                onClick={() => void loadOverview()}
                className="mt-4 inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.24em] text-paper underline-offset-4 hover:underline"
              >
                Try again <ArrowUpRight className="h-3 w-3" strokeWidth={1.4} />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'overview' && notice && (
        <div className="mt-6 border-t border-paper-a18 pt-4 text-[12px] leading-relaxed text-paper-a45">
          {notice}
        </div>
      )}

      <div className="mt-8 flex flex-nowrap gap-x-6 overflow-x-auto border-b border-paper-a18">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`relative -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b px-0 pb-3 pt-2 text-[9px] uppercase tracking-[0.24em] transition-colors ${
              activeTab === tab.id
                ? 'border-paper text-paper'
                : 'border-transparent text-paper-a45 hover:text-paper'
            }`}
          >
            {tab.label}
            {typeof tab.badge === 'number' && tab.badge > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center border border-paper-a18 px-1 text-[8px] text-paper-a45">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          {!overview && isLoading && !error && (
            <div className="mt-10 border-t border-paper-a18 pt-6 text-[12px] text-paper-a45">
              Reading the control plane…
            </div>
          )}

          {overview && (
        <>
          <section className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-paper-a18 pt-6 md:grid-cols-3 xl:grid-cols-7">
            {[
              { label: 'Services', value: overview.summary.services, hint: `${overview.summary.healthy} healthy` },
              { label: 'Degraded', value: overview.summary.degraded, hint: 'Needs attention' },
              { label: 'Down', value: overview.summary.down, hint: 'Tier-one failures' },
              { label: 'Unconfigured', value: overview.summary.notConfigured, hint: 'Probe unavailable' },
              { label: 'Alerts', value: overview.summary.activeAlerts, hint: 'Open' },
              { label: 'Incidents', value: overview.summary.activeIncidents, hint: 'Active' },
              { label: 'Failing jobs', value: overview.summary.failingJobs, hint: 'Recent runs' },
            ].map((metric) => (
              <div key={metric.label}>
                <div className="micro-sm text-paper-a45">{metric.label}</div>
                <div className="mt-2 font-display text-[clamp(30px,3.4vw,48px)] leading-none">
                  {metric.value}
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-paper-a18">
                  {metric.hint}
                </div>
              </div>
            ))}
          </section>

          <section className="mt-14">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
              <div>
                <div className="micro-sm text-paper-a45">Service catalogue</div>
                <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
                  What is <em>running</em>
                </h2>
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper-a45">
                {overview.services.length} services · {checks.length} probes
              </div>
            </div>

            <div className="mt-2">
              {overview.services.map((service) => (
                <div
                  key={service.id}
                  className="grid grid-cols-1 gap-4 border-b border-paper-a18 py-5 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-center"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-paper-a45">{serviceIcon(service.id)}</span>
                    <div>
                      <div className="text-[13px] tracking-[0.02em] text-paper">{service.name}</div>
                      <div className="mt-1 max-w-[42ch] text-[11px] leading-relaxed text-paper-a45">
                        {service.description}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-paper-a45">
                    <div>
                      Tier {service.tier} · {service.owner}
                    </div>
                    <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-paper-a18">
                      {service.dependencies.length ? service.dependencies.join(' · ') : 'No dependencies'}
                    </div>
                  </div>
                  <div className="text-[11px] text-paper-a45">
                    <div>{service.checks.length} {service.checks.length === 1 ? 'probe' : 'probes'}</div>
                    <div className="mt-1 text-paper-a18">Checked {formatTime(service.lastCheckedAt)}</div>
                  </div>
                  <div className="md:text-right">
                    <span className={`inline-flex items-center gap-2 border px-3 py-1.5 text-[9px] uppercase tracking-[0.22em] ${statusTone(service.status)}`}>
                      {statusIcon(service.status)}
                      {STATUS_LABEL[service.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-14">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
              <div>
                <div className="micro-sm text-paper-a45">Probe results</div>
                <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
                  What is <em>answering</em>
                </h2>
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper-a45">
                {failingChecks.length} need attention
              </div>
            </div>
            <div>
              {checks.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </div>
          </section>

          <section className="mt-14 grid grid-cols-1 gap-10 xl:grid-cols-3">
            <div>
              <div className="flex items-center gap-2 border-b border-paper-a18 pb-4">
                <AlertTriangle className="h-3.5 w-3.5 text-paper-a45" strokeWidth={1.4} />
                <div className="micro-sm text-paper-a45">Active incidents</div>
              </div>
              {overview.incidents.length === 0 ? (
                <EmptyLine>
                  No active incidents are recorded. An empty list is not a guarantee; it means no
                  incident has been declared in the control plane.
                </EmptyLine>
              ) : (
                overview.incidents.map((incident) => (
                  <div key={incident.id} className="border-t border-paper-a18 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[12px] text-paper">{incident.title}</div>
                      <span className="micro-sm shrink-0 text-paper-a45">{incident.severity}</span>
                    </div>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a45">
                      {incident.status} · {formatDateTime(incident.startedAt)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 border-b border-paper-a18 pb-4">
                <ArrowUpRight className="h-3.5 w-3.5 text-paper-a45" strokeWidth={1.4} />
                <div className="micro-sm text-paper-a45">Recent deployments</div>
              </div>
              {overview.deployments.length === 0 ? (
                <EmptyLine>
                  No deployment records have been written yet. Release tracking starts when a
                  deployment is recorded by the control plane.
                </EmptyLine>
              ) : (
                overview.deployments.map((deployment) => (
                  <div key={deployment.id} className="border-t border-paper-a18 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[12px] text-paper">{deployment.version}</div>
                      <span className="micro-sm shrink-0 text-paper-a45">{deployment.status}</span>
                    </div>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a45">
                      {deployment.environment} · {formatDateTime(deployment.startedAt)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 border-b border-paper-a18 pb-4">
                <Clock className="h-3.5 w-3.5 text-paper-a45" strokeWidth={1.4} />
                <div className="micro-sm text-paper-a45">Failing jobs</div>
              </div>
              {overview.jobs.length === 0 ? (
                <EmptyLine>
                  No failed job runs are recorded. Durable job tracking arrives with the job
                  orchestrator. Video generation runs are persisted as durable job runs.
                </EmptyLine>
              ) : (
                overview.jobs.map((job) => (
                  <div key={job.id} className="border-t border-paper-a18 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[12px] text-paper">{job.name}</div>
                      <span className="micro-sm shrink-0 text-paper-a45">{job.status}</span>
                    </div>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a45">
                      {formatDateTime(job.startedAt)} · {formatLatency(job.durationMs)}
                    </div>
                    {job.error && (
                      <div className="mt-2 text-[10px] leading-relaxed text-paper-a45">{job.error}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {overview.notes.length > 0 && (
            <section className="mt-14 border-t border-paper-a18 pt-5">
              <div className="micro-sm text-paper-a45">Operator notes</div>
              <ul className="mt-3 space-y-2">
                {overview.notes.map((note) => (
                  <li key={note} className="flex gap-3 text-[11px] leading-relaxed text-paper-a45">
                    <span className="mt-2 h-1 w-1 shrink-0 bg-paper-a45" />
                    {note}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-paper-a18 pt-4 font-mono text-[9px] uppercase tracking-[0.14em] text-paper-a18">
            <span>Request {overview.requestId}</span>
            <span>Auto-refresh 30s · persisted diagnostics only on explicit run</span>
          </div>
        </>
      )}
        </>
      )}

      {activeTab === 'intelligence' && (
        <div className="mt-10">
          <ControlIntelligencePanel />
        </div>
      )}

      {activeTab === 'history' && (
        <div className="mt-10">
          <ControlHistoryPanel />
        </div>
      )}

      {activeTab === 'slo' && (
        <div className="mt-10">
          <ControlSloPanel />
        </div>
      )}

      {activeTab === 'incidents' && (
        <div className="mt-10">
          <ControlIncidentsPanel />
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="mt-10">
          <ControlAlertsPanel />
        </div>
      )}

      {activeTab === 'deployments' && (
        <div className="mt-10">
          <ControlDeploymentsPanel />
        </div>
      )}

      {activeTab === 'jobs' && (
        <div className="mt-10">
          <ControlJobsPanel />
        </div>
      )}

      {activeTab === 'flags' && (
        <div className="mt-10">
          <ControlFlagsPanel />
        </div>
      )}

      {activeTab === 'runbooks' && (
        <div className="mt-10">
          <ControlRunbooksPanel />
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="mt-10">
          <ControlAuditPanel />
        </div>
      )}

      {activeTab === 'costs' && (
        <div className="mt-10">
          <ControlCostsPanel />
        </div>
      )}

      {activeTab === 'security' && (
        <div className="mt-10">
          <ControlSecurityPanel />
        </div>
      )}

      {activeTab === 'backups' && (
        <div className="mt-10">
          <ControlBackupsPanel />
        </div>
      )}

      {activeTab === 'data' && (
        <div className="mt-10">
          <ControlDataQualityPanel />
        </div>
      )}
    </div>
  );
};
