import { randomUUID } from 'crypto';
import { isServiceClient, isSupabaseConfigured, supabase } from '../supabase/config';
import { CONTROL_PROBES } from './catalog';
import {
  ControlAlert,
  ControlAlertsResponse,
  ControlCheckResult,
  ControlDataQualityResponse,
  ControlDataQualityResult,
  ControlDeployment,
  ControlDeploymentsResponse,
  ControlHistoryBucket,
  ControlHistoryResponse,
  ControlHistorySeries,
  ControlIncidentDetail,
  ControlIncidentEvent,
  ControlIncidentsResponse,
  ControlSloDefinition,
  ControlSloResponse,
  ControlSloState,
} from './types';

const READ_TIMEOUT_MS = 5000;

const withTimeout = async <T>(task: PromiseLike<T>, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown failure';
};

const DEFAULT_SLOS: ControlSloDefinition[] = [
  {
    id: 'storefront-availability',
    name: 'Storefront media availability',
    description: 'Published editorial media must remain reachable for customers.',
    serviceId: 'storefront',
    checkId: 'storefront.manifest',
    target: 0.999,
    windowDays: 30,
    owner: 'House Operations',
  },
  {
    id: 'api-availability',
    name: 'API availability',
    description: 'The API process must answer operator and customer requests.',
    serviceId: 'api',
    checkId: 'api.self',
    target: 0.999,
    windowDays: 30,
    owner: 'House Operations',
  },
  {
    id: 'postgres-availability',
    name: 'Postgres availability',
    description: 'The system of record must remain reachable.',
    serviceId: 'postgres',
    checkId: 'postgres.reachability',
    target: 0.999,
    windowDays: 30,
    owner: 'House Operations',
  },
  {
    id: 'auth-availability',
    name: 'Authentication availability',
    description: 'Operators must be able to sign in and verify sessions.',
    serviceId: 'auth',
    checkId: 'auth.health',
    target: 0.999,
    windowDays: 30,
    owner: 'House Operations',
  },
  {
    id: 'storage-availability',
    name: 'Media storage availability',
    description: 'Media bucket operations must remain available.',
    serviceId: 'storage',
    checkId: 'storage.list',
    target: 0.999,
    windowDays: 30,
    owner: 'House Operations',
  },
  {
    id: 'telemetry-freshness',
    name: 'Telemetry freshness',
    description: 'Consent-based events should arrive within five minutes.',
    serviceId: 'telemetry',
    checkId: 'telemetry.freshness',
    target: 0.99,
    windowDays: 30,
    owner: 'House Operations',
  },
];

const statusToBucket = (status: string): keyof Omit<ControlHistoryBucket, 'start' | 'total' | 'avgLatencyMs' | 'maxLatencyMs'> => {
  switch (status) {
    case 'healthy':
      return 'healthy';
    case 'degraded':
      return 'degraded';
    case 'no_data':
      return 'noData';
    case 'not_configured':
      return 'notConfigured';
    default:
      return 'down';
  }
};

const emptyBucket = (start: string): ControlHistoryBucket => ({
  start,
  healthy: 0,
  degraded: 0,
  down: 0,
  notConfigured: 0,
  noData: 0,
  total: 0,
  avgLatencyMs: null,
  maxLatencyMs: null,
});

const bucketStart = (value: string): string => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  return new Date(Math.floor(time / 3_600_000) * 3_600_000).toISOString();
};

export async function loadHealthHistory(hours = 24): Promise<ControlHistoryResponse> {
  const boundedHours = Math.min(Math.max(Math.round(hours), 1), 168);
  const generatedAt = new Date().toISOString();

  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      hours: boundedHours,
      persisted: false,
      note: 'Health history is unavailable because the server is not connected to Supabase.',
      series: [],
    };
  }

  const since = new Date(Date.now() - boundedHours * 3_600_000).toISOString();

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_health_results')
        .select('check_id, service_id, status, latency_ms, checked_at')
        .gte('checked_at', since)
        .order('checked_at', { ascending: true })
        .limit(20_000),
      'Health history read'
    );

    if (error) {
      return {
        generatedAt,
        hours: boundedHours,
        persisted: false,
        note: error.message,
        series: [],
      };
    }

    const seriesMap = new Map<string, ControlHistorySeries>();
    for (const probe of CONTROL_PROBES) {
      seriesMap.set(probe.id, {
        checkId: probe.id,
        serviceId: probe.serviceId,
        name: probe.name,
        buckets: [],
      });
    }

    const bucketMaps = new Map<
      string,
      Map<string, { bucket: ControlHistoryBucket; latencySum: number; latencyCount: number }>
    >();

    for (const row of (data || []) as Array<{
      check_id: string;
      service_id: string;
      status: string;
      latency_ms: number | null;
      checked_at: string;
    }>) {
      const checkId = String(row.check_id);
      if (!seriesMap.has(checkId)) {
        seriesMap.set(checkId, {
          checkId,
          serviceId: String(row.service_id || 'unknown'),
          name: checkId,
          buckets: [],
        });
      }

      const start = bucketStart(String(row.checked_at));
      let buckets = bucketMaps.get(checkId);
      if (!buckets) {
        buckets = new Map();
        bucketMaps.set(checkId, buckets);
      }
      let entry = buckets.get(start);
      if (!entry) {
        entry = { bucket: emptyBucket(start), latencySum: 0, latencyCount: 0 };
        buckets.set(start, entry);
      }
      entry.bucket[statusToBucket(String(row.status))] += 1;
      entry.bucket.total += 1;
      if (typeof row.latency_ms === 'number' && Number.isFinite(row.latency_ms)) {
        entry.latencySum += row.latency_ms;
        entry.latencyCount += 1;
        entry.bucket.maxLatencyMs =
          entry.bucket.maxLatencyMs === null
            ? row.latency_ms
            : Math.max(entry.bucket.maxLatencyMs, row.latency_ms);
      }
    }

    for (const series of seriesMap.values()) {
      const buckets = bucketMaps.get(series.checkId);
      if (!buckets) continue;
      series.buckets = [...buckets.values()]
        .sort((a, b) => a.bucket.start.localeCompare(b.bucket.start))
        .map((entry) => ({
          ...entry.bucket,
          avgLatencyMs:
            entry.latencyCount > 0
              ? Math.round((entry.latencySum / entry.latencyCount) * 100) / 100
              : null,
        }));
    }

    return {
      generatedAt,
      hours: boundedHours,
      persisted: true,
      note: (data || []).length === 0 ? 'No persisted health results in this window. Run diagnostics or wait for scheduled probes.' : null,
      series: [...seriesMap.values()],
    };
  } catch (err) {
    return {
      generatedAt,
      hours: boundedHours,
      persisted: false,
      note: errorMessage(err),
      series: [],
    };
  }
}

async function loadSloDefinitions(): Promise<{
  definitions: ControlSloDefinition[];
  note: string | null;
}> {
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      definitions: DEFAULT_SLOS,
      note: 'Using built-in SLO definitions because the control-plane database is not configured.',
    };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_slo_definitions')
        .select('id, name, description, service_id, check_id, target, window_days, owner')
        .eq('enabled', true)
        .order('name', { ascending: true }),
      'SLO definition read'
    );
    if (error || !data || data.length === 0) {
      return {
        definitions: DEFAULT_SLOS,
        note: error?.message || 'No SLO definitions found; using built-in defaults.',
      };
    }
    return {
      definitions: data.map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        description: String(row.description || ''),
        serviceId: String(row.service_id),
        checkId: String(row.check_id),
        target: Number(row.target),
        windowDays: Number(row.window_days || 30),
        owner: String(row.owner || 'House Operations'),
      })),
      note: null,
    };
  } catch (err) {
    return { definitions: DEFAULT_SLOS, note: errorMessage(err) };
  }
}

export async function loadSloStates(): Promise<ControlSloResponse> {
  const generatedAt = new Date().toISOString();
  const { definitions, note } = await loadSloDefinitions();

  if (!isSupabaseConfigured || !isServiceClient) {
    return { generatedAt, persisted: false, note, slos: [] };
  }

  const longestWindow = Math.max(...definitions.map((definition) => definition.windowDays), 1);
  const since = new Date(Date.now() - longestWindow * 86_400_000).toISOString();

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_health_results')
        .select('check_id, status, checked_at')
        .in('check_id', definitions.map((definition) => definition.checkId))
        .gte('checked_at', since)
        .order('checked_at', { ascending: true })
        .limit(50_000),
      'SLO health read'
    );

    if (error) {
      return { generatedAt, persisted: false, note: error.message, slos: [] };
    }

    const rows = (data || []) as Array<{ check_id: string; status: string; checked_at: string }>;
    const slos: ControlSloState[] = definitions.map((definition) => {
      const windowStart = new Date(
        Date.now() - definition.windowDays * 86_400_000
      ).toISOString();
      const windowEnd = generatedAt;
      const relevant = rows.filter(
        (row) =>
          String(row.check_id) === definition.checkId &&
          String(row.checked_at) >= windowStart
      );
      const counted = relevant.filter((row) => String(row.status) !== 'no_data');
      const good = counted.filter((row) => String(row.status) === 'healthy').length;
      const total = counted.length;
      const bad = total - good;
      const target = definition.target;
      const errorBudget = Math.max(0, 1 - target);
      const allowedBad = errorBudget * total;
      const availability = total > 0 ? good / total : null;
      const remainingBudget =
        total > 0 && errorBudget > 0
          ? Math.max(0, Math.min(1, 1 - bad / allowedBad))
          : null;
      const burnRate =
        total > 0 && errorBudget > 0 ? (bad / total) / errorBudget : null;
      const status: ControlSloState['status'] =
        total === 0
          ? 'no_data'
          : availability !== null && availability < target
            ? 'breached'
            : remainingBudget !== null && remainingBudget < 0.25
              ? 'at_risk'
              : 'healthy';

      return {
        ...definition,
        status,
        availability,
        good,
        total,
        errorBudget,
        remainingBudget,
        burnRate,
        windowStart,
        windowEnd,
      };
    });

    return { generatedAt, persisted: true, note: note || null, slos };
  } catch (err) {
    return { generatedAt, persisted: false, note: errorMessage(err), slos: [] };
  }
}

const mapAlert = (row: any): ControlAlert => ({
  id: String(row.id),
  severity: String(row.severity || 'warning'),
  status: String(row.status || 'firing'),
  title: String(row.title || 'Alert'),
  message: String(row.message || ''),
  serviceId: row.service_id ? String(row.service_id) : null,
  checkId: row.details?.checkId ? String(row.details.checkId) : null,
  dedupeKey: row.dedupe_key ? String(row.dedupe_key) : null,
  firedAt: String(row.fired_at || ''),
  acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : null,
  resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
});

export async function loadAlerts(): Promise<ControlAlertsResponse> {
  const generatedAt = new Date().toISOString();
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Alert state is unavailable because the server is not connected to Supabase.',
      alerts: [],
    };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_alerts')
        .select('id, severity, status, title, message, service_id, dedupe_key, fired_at, acknowledged_at, resolved_at, details')
        .in('status', ['firing', 'acknowledged'])
        .order('fired_at', { ascending: false })
        .limit(100),
      'Alert read'
    );
    if (error) {
      return { generatedAt, persisted: false, note: error.message, alerts: [] };
    }
    return {
      generatedAt,
      persisted: true,
      note: null,
      alerts: (data || []).map(mapAlert),
    };
  } catch (err) {
    return { generatedAt, persisted: false, note: errorMessage(err), alerts: [] };
  }
}

export async function syncAlerts(checks: ControlCheckResult[]): Promise<void> {
  if (!isSupabaseConfigured || !isServiceClient) return;

  const { data, error } = await withTimeout(
    supabase
      .from('system_alerts')
      .select('id, status, dedupe_key, details')
      .in('status', ['firing', 'acknowledged'])
      .limit(500),
    'Alert sync read'
  );
  if (error) throw new Error(error.message);

  const open = new Map<string, any>();
  for (const row of (data || []) as any[]) {
    if (row.dedupe_key) open.set(String(row.dedupe_key), row);
  }

  const nextKeys = new Set<string>();
  const inserts: any[] = [];

  for (const check of checks) {
    if (check.status !== 'down' && check.status !== 'degraded') continue;
    const dedupeKey = `${check.id}:${check.status}`;
    nextKeys.add(dedupeKey);
    if (open.has(dedupeKey)) continue;
    inserts.push({
      id: `alert-${randomUUID()}`,
      rule_id: check.status === 'down' ? 'probe-down' : 'probe-degraded',
      service_id: check.serviceId,
      severity: check.status === 'down' ? 'critical' : 'warning',
      status: 'firing',
      title: `${check.name} ${check.status}`,
      message: check.message,
      dedupe_key: dedupeKey,
      fired_at: new Date().toISOString(),
      details: { checkId: check.id },
    });
  }

  if (inserts.length > 0) {
    await withTimeout(supabase.from('system_alerts').insert(inserts), 'Alert sync insert');
  }

  const toResolve = [...open.entries()]
    .filter(([key]) => !nextKeys.has(key))
    .map(([, row]) => String(row.id));
  if (toResolve.length > 0) {
    await withTimeout(
      supabase
        .from('system_alerts')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .in('id', toResolve),
      'Alert sync resolve'
    );
  }
}

export async function acknowledgeAlert(id: string): Promise<ControlAlert | null> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Alert acknowledgement requires a configured Supabase server client.');
  }
  const acknowledgedAt = new Date().toISOString();
  const { data, error } = await withTimeout(
    supabase
      .from('system_alerts')
      .update({ status: 'acknowledged', acknowledged_at: acknowledgedAt })
      .eq('id', id)
      .in('status', ['firing', 'acknowledged'])
      .select('id, severity, status, title, message, service_id, dedupe_key, fired_at, acknowledged_at, resolved_at, details')
      .maybeSingle(),
    'Alert acknowledgement'
  );
  if (error) throw new Error(error.message);
  return data ? mapAlert(data) : null;
}

const mapIncidentEvent = (row: any): ControlIncidentEvent => ({
  id: String(row.id),
  incidentId: String(row.incident_id),
  eventType: String(row.event_type || 'note'),
  actor: row.actor ? String(row.actor) : null,
  message: String(row.message || ''),
  details: row.details && typeof row.details === 'object' ? row.details : {},
  occurredAt: String(row.occurred_at || ''),
});

const mapIncident = (row: any, events: ControlIncidentEvent[]): ControlIncidentDetail => ({
  id: String(row.id),
  title: String(row.title || 'Incident'),
  severity: String(row.severity || 'SEV3'),
  status: String(row.status || 'investigating'),
  startedAt: String(row.started_at || ''),
  serviceIds: Array.isArray(row.service_ids) ? row.service_ids.map(String) : [],
  summary: String(row.summary || ''),
  impact: String(row.impact || ''),
  commander: row.commander ? String(row.commander) : null,
  acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : null,
  resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  events,
});

export async function loadIncidents(includeResolved = false): Promise<ControlIncidentsResponse> {
  const generatedAt = new Date().toISOString();
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Incident records are unavailable because the server is not connected to Supabase.',
      incidents: [],
    };
  }

  try {
    let query = supabase
      .from('system_incidents')
      .select('id, title, summary, severity, status, service_ids, commander, impact, started_at, acknowledged_at, resolved_at')
      .order('started_at', { ascending: false })
      .limit(50);
    if (!includeResolved) query = query.neq('status', 'resolved');

    const { data, error } = await withTimeout(query, 'Incident read');
    if (error) {
      return { generatedAt, persisted: false, note: error.message, incidents: [] };
    }

    const incidentRows = (data || []) as any[];
    if (incidentRows.length === 0) {
      return { generatedAt, persisted: true, note: null, incidents: [] };
    }

    const ids = incidentRows.map((row) => String(row.id));
    const eventsResult = await withTimeout(
      supabase
        .from('system_incident_events')
        .select('id, incident_id, event_type, actor, message, details, occurred_at')
        .in('incident_id', ids)
        .order('occurred_at', { ascending: true })
        .limit(1000),
      'Incident event read'
    );

    const events = (eventsResult.data || []).map(mapIncidentEvent);
    const byIncident = new Map<string, ControlIncidentEvent[]>();
    for (const event of events) {
      const current = byIncident.get(event.incidentId) || [];
      current.push(event);
      byIncident.set(event.incidentId, current);
    }

    return {
      generatedAt,
      persisted: true,
      note: eventsResult.error?.message || null,
      incidents: incidentRows.map((row) => mapIncident(row, byIncident.get(String(row.id)) || [])),
    };
  } catch (err) {
    return { generatedAt, persisted: false, note: errorMessage(err), incidents: [] };
  }
}

export interface CreateIncidentInput {
  title: string;
  summary?: string;
  severity?: string;
  serviceIds?: string[];
  impact?: string;
}

export async function createIncident(
  input: CreateIncidentInput,
  actor: string
): Promise<ControlIncidentDetail> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Incident declaration requires a configured Supabase server client.');
  }
  const id = `inc-${randomUUID()}`;
  const now = new Date().toISOString();
  const row = {
    id,
    title: input.title.trim(),
    summary: input.summary?.trim() || '',
    severity: input.severity || 'SEV3',
    status: 'investigating',
    service_ids: input.serviceIds || [],
    commander: actor,
    impact: input.impact?.trim() || '',
    started_at: now,
    acknowledged_at: null,
    resolved_at: null,
  };
  const { data, error } = await withTimeout(
    supabase.from('system_incidents').insert(row).select('*').single(),
    'Incident insert'
  );
  if (error) throw new Error(error.message);

  await withTimeout(
    supabase.from('system_incident_events').insert({
      incident_id: id,
      event_type: 'declared',
      actor,
      message: input.summary?.trim() || 'Incident declared.',
      details: { severity: row.severity, serviceIds: row.service_ids },
      occurred_at: now,
    }),
    'Incident event insert'
  );

  return mapIncident(data, [
    {
      id: 'pending',
      incidentId: id,
      eventType: 'declared',
      actor,
      message: input.summary?.trim() || 'Incident declared.',
      details: { severity: row.severity, serviceIds: row.service_ids },
      occurredAt: now,
    },
  ]);
}

export interface UpdateIncidentInput {
  status?: string;
  summary?: string;
  impact?: string;
  commander?: string;
}

export async function updateIncident(
  id: string,
  input: UpdateIncidentInput,
  actor: string
): Promise<ControlIncidentDetail | null> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Incident updates require a configured Supabase server client.');
  }
  const patch: Record<string, unknown> = {};
  if (input.status) {
    patch.status = input.status;
    if (input.status === 'resolved') patch.resolved_at = new Date().toISOString();
    if (input.status === 'acknowledged') patch.acknowledged_at = new Date().toISOString();
  }
  if (input.summary !== undefined) patch.summary = input.summary;
  if (input.impact !== undefined) patch.impact = input.impact;
  if (input.commander !== undefined) patch.commander = input.commander;
  patch.updated_at = new Date().toISOString();

  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await withTimeout(
    supabase.from('system_incidents').update(patch).eq('id', id).select('*').maybeSingle(),
    'Incident update'
  );
  if (error) throw new Error(error.message);
  if (!data) return null;

  await withTimeout(
    supabase.from('system_incident_events').insert({
      incident_id: id,
      event_type: input.status ? 'status_changed' : 'updated',
      actor,
      message: input.summary || (input.status ? `Status changed to ${input.status}.` : 'Incident updated.'),
      details: patch,
      occurred_at: new Date().toISOString(),
    }),
    'Incident event insert'
  );

  const events = await withTimeout(
    supabase
      .from('system_incident_events')
      .select('id, incident_id, event_type, actor, message, details, occurred_at')
      .eq('incident_id', id)
      .order('occurred_at', { ascending: true })
      .limit(500),
    'Incident event read'
  );

  return mapIncident(data, (events.data || []).map(mapIncidentEvent));
}

export async function addIncidentEvent(
  id: string,
  message: string,
  actor: string
): Promise<ControlIncidentEvent | null> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Incident notes require a configured Supabase server client.');
  }
  const { data, error } = await withTimeout(
    supabase
      .from('system_incident_events')
      .insert({
        incident_id: id,
        event_type: 'note',
        actor,
        message,
        details: {},
        occurred_at: new Date().toISOString(),
      })
      .select('id, incident_id, event_type, actor, message, details, occurred_at')
      .single(),
    'Incident note insert'
  );
  if (error) throw new Error(error.message);
  return data ? mapIncidentEvent(data) : null;
}

const mapDeployment = (row: any): ControlDeployment => ({
  id: String(row.id),
  environment: String(row.environment || 'unknown'),
  version: String(row.version || 'unknown'),
  status: String(row.status || 'unknown'),
  startedAt: String(row.started_at || ''),
  completedAt: row.completed_at ? String(row.completed_at) : null,
  commitSha: row.commit_sha ? String(row.commit_sha) : null,
  actor: row.actor ? String(row.actor) : null,
  rollbackOf: row.rollback_of ? String(row.rollback_of) : null,
  details: row.details && typeof row.details === 'object' ? row.details : {},
});

export async function loadDeployments(): Promise<ControlDeploymentsResponse> {
  const generatedAt = new Date().toISOString();
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Deployment records are unavailable because the server is not connected to Supabase.',
      deployments: [],
    };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_deployments')
        .select('id, environment, version, status, started_at, completed_at, commit_sha, actor, rollback_of, details')
        .order('started_at', { ascending: false })
        .limit(100),
      'Deployment read'
    );
    if (error) {
      return { generatedAt, persisted: false, note: error.message, deployments: [] };
    }
    return {
      generatedAt,
      persisted: true,
      note: null,
      deployments: (data || []).map(mapDeployment),
    };
  } catch (err) {
    return { generatedAt, persisted: false, note: errorMessage(err), deployments: [] };
  }
}

export interface CreateDeploymentInput {
  environment?: string;
  version: string;
  commitSha?: string;
  status?: string;
}

export async function createDeployment(
  input: CreateDeploymentInput,
  actor: string
): Promise<ControlDeployment> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Deployment recording requires a configured Supabase server client.');
  }
  const now = new Date().toISOString();
  const status = input.status || 'succeeded';
  const row = {
    id: `dep-${randomUUID()}`,
    environment: input.environment || process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    version: input.version.trim(),
    commit_sha: input.commitSha?.trim() || null,
    actor,
    status,
    started_at: now,
    completed_at: status === 'started' ? null : now,
    details: {},
  };
  const { data, error } = await withTimeout(
    supabase.from('system_deployments').insert(row).select('*').single(),
    'Deployment insert'
  );
  if (error) throw new Error(error.message);
  return mapDeployment(data);
}

const statusForQuality = (failingCount: number, severity: string): ControlDataQualityResult['status'] => {
  if (failingCount <= 0) return 'healthy';
  return severity === 'critical' ? 'down' : 'degraded';
};

const quality = (
  id: string,
  name: string,
  description: string,
  severity: string,
  failingCount: number,
  totalCount: number,
  samples: Array<Record<string, unknown>>,
  message: string
): ControlDataQualityResult => ({
  id,
  name,
  description,
  severity,
  status: statusForQuality(failingCount, severity),
  failingCount,
  totalCount,
  samples: samples.slice(0, 10),
  message,
  checkedAt: new Date().toISOString(),
});

export async function runDataQualityChecks(persist = false): Promise<ControlDataQualityResponse> {
  const generatedAt = new Date().toISOString();
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Data-quality checks require a configured Supabase server client.',
      checks: ['products.completeness', 'orders.integrity', 'media.alt_text', 'content.hero'].map(
        (id) =>
          quality(
            id,
            id,
            '',
            'warning',
            0,
            0,
            [],
            'Not configured: the server cannot read the database.'
          )
      ).map((check) => ({ ...check, status: 'not_configured' as const })),
    };
  }

  const checks: ControlDataQualityResult[] = [];
  const notes: string[] = [];

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('products')
        .select('id, name, price, images, image, status')
        .limit(2000),
      'Product quality read'
    );
    if (error) {
      notes.push(`Product check: ${error.message}`);
      checks.push(quality('products.completeness', 'Product completeness', 'Products need a name, price and at least one image.', 'warning', 0, 0, [], error.message));
    } else {
      const rows = (data || []) as any[];
      const failing = rows.filter((row) => {
        const name = row.name && typeof row.name === 'object' ? row.name : {};
        const hasName = Boolean(name.en || name.fi || name.sv);
        const hasPrice = typeof row.price === 'number' && row.price > 0;
        const hasImage = (Array.isArray(row.images) && row.images.length > 0) || Boolean(row.image);
        return !hasName || !hasPrice || !hasImage;
      });
      checks.push(
        quality(
          'products.completeness',
          'Product completeness',
          'Products need a name, price and at least one image.',
          'warning',
          failing.length,
          rows.length,
          failing.map((row) => ({ id: row.id, name: row.name, price: row.price, hasImage: Boolean(row.image || row.images?.length) })),
          failing.length ? `${failing.length} of ${rows.length} products are incomplete.` : 'All products are complete.'
        )
      );
    }
  } catch (err) {
    notes.push(`Product check: ${errorMessage(err)}`);
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('orders')
        .select('id, number, customer, items, totals, createdAt')
        .limit(2000),
      'Order quality read'
    );
    if (error) {
      notes.push(`Order check: ${error.message}`);
      checks.push(quality('orders.integrity', 'Order integrity', 'Orders need a customer email, items and a positive total.', 'critical', 0, 0, [], error.message));
    } else {
      const rows = (data || []) as any[];
      const failing = rows.filter((row) => {
        const email = row.customer?.email;
        const hasItems = Array.isArray(row.items) && row.items.length > 0;
        const total = row.totals?.total;
        return !email || !hasItems || typeof total !== 'number' || total <= 0;
      });
      checks.push(
        quality(
          'orders.integrity',
          'Order integrity',
          'Orders need a customer email, items and a positive total.',
          'critical',
          failing.length,
          rows.length,
          failing.map((row) => ({ id: row.id, number: row.number, hasEmail: Boolean(row.customer?.email), hasItems: Boolean(row.items?.length), total: row.totals?.total })),
          failing.length ? `${failing.length} of ${rows.length} orders are incomplete.` : 'All orders are complete.'
        )
      );
    }
  } catch (err) {
    notes.push(`Order check: ${errorMessage(err)}`);
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('media_assets')
        .select('id, path, alt, kind')
        .limit(2000),
      'Media quality read'
    );
    if (error) {
      notes.push(`Media check: ${error.message}`);
      checks.push(quality('media.alt_text', 'Media alt text', 'Archived media should carry descriptive alt text.', 'warning', 0, 0, [], error.message));
    } else {
      const rows = (data || []) as any[];
      const images = rows.filter((row) => String(row.kind || 'image') === 'image');
      const failing = images.filter((row) => !String(row.alt || '').trim());
      checks.push(
        quality(
          'media.alt_text',
          'Media alt text',
          'Archived media should carry descriptive alt text.',
          'warning',
          failing.length,
          images.length,
          failing.map((row) => ({ id: row.id, path: row.path })),
          failing.length ? `${failing.length} of ${images.length} images have no alt text.` : 'All archived images have alt text.'
        )
      );
    }
  } catch (err) {
    notes.push(`Media check: ${errorMessage(err)}`);
  }

  try {
    const { data, error } = await withTimeout(
      supabase.from('content').select('id, heroSlides, heroMedia').limit(10),
      'Content quality read'
    );
    if (error) {
      notes.push(`Content check: ${error.message}`);
      checks.push(quality('content.hero', 'Hero content', 'The storefront needs at least one hero slide or hero media source.', 'critical', 0, 0, [], error.message));
    } else {
      const rows = (data || []) as any[];
      const failing = rows.filter((row) => {
        const slides = Array.isArray(row.heroSlides) ? row.heroSlides : [];
        const media = row.heroMedia && typeof row.heroMedia === 'object' ? row.heroMedia : {};
        return slides.length === 0 && !media.desktopSrc && !media.mobileSrc;
      });
      checks.push(
        quality(
          'content.hero',
          'Hero content',
          'The storefront needs at least one hero slide or hero media source.',
          'critical',
          rows.length === 0 ? 1 : failing.length,
          rows.length,
          failing.map((row) => ({ id: row.id })),
          rows.length === 0 ? 'No content row exists.' : failing.length ? `${failing.length} content rows have no hero media.` : 'Hero content is present.'
        )
      );
    }
  } catch (err) {
    notes.push(`Content check: ${errorMessage(err)}`);
  }

  let persisted = false;
  if (persist && checks.length > 0) {
    try {
      const { error } = await withTimeout(
        supabase.from('system_data_quality_results').insert(
          checks.map((check) => ({
            check_id: check.id,
            status: check.status,
            failing_count: check.failingCount,
            total_count: check.totalCount,
            samples: check.samples,
            message: check.message,
            checked_at: check.checkedAt,
          }))
        ),
        'Data-quality persist'
      );
      persisted = !error;
      if (error) notes.push(`Persistence: ${error.message}`);
    } catch (err) {
      notes.push(`Persistence: ${errorMessage(err)}`);
    }
  }

  return {
    generatedAt,
    persisted,
    note: notes.length ? notes.join(' ') : null,
    checks,
  };
}
