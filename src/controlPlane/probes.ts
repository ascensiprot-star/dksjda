import {
  isServiceClient,
  isSupabaseConfigured,
  supabase,
  supabaseAnonKey,
  supabaseUrl,
} from '../supabase/config';
import {
  CONTROL_PROBES,
  CONTROL_PROBES_BY_SERVICE,
  CONTROL_SERVICES,
} from './catalog';
import {
  ControlCheckResult,
  ControlCheckStatus,
  ControlDeploymentSummary,
  ControlIncidentSummary,
  ControlJobSummary,
  ControlOverview,
  ControlOverallStatus,
  ControlServiceState,
} from './types';
import { loadAlerts } from './visibility';

const CHECK_TIMEOUT_MS = 3000;

const STATUS_RANK: Record<ControlCheckStatus, number> = {
  healthy: 0,
  no_data: 1,
  degraded: 2,
  not_configured: 3,
  down: 4,
};

const worst = (statuses: ControlCheckStatus[]): ControlCheckStatus =>
  statuses.reduce<ControlCheckStatus>(
    (acc, status) => (STATUS_RANK[status] > STATUS_RANK[acc] ? status : acc),
    'healthy'
  );

const withTimeout = async <T>(task: PromiseLike<T>, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), CHECK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const fetchWithTimeout = async (url: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const result = (
  probeId: string,
  serviceId: string,
  status: ControlCheckStatus,
  latencyMs: number | null,
  message: string,
  details?: Record<string, unknown>
): ControlCheckResult => {
  const probe = CONTROL_PROBES.find((entry) => entry.id === probeId);
  return {
    id: probeId,
    serviceId,
    name: probe?.name || probeId,
    kind: probe?.kind || 'http',
    status,
    latencyMs,
    checkedAt: new Date().toISOString(),
    message,
    details,
  };
};

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown failure';
};

async function checkPostgres(): Promise<ControlCheckResult> {
  const started = Date.now();
  if (!isSupabaseConfigured) {
    return result(
      'postgres.reachability',
      'postgres',
      'not_configured',
      null,
      'Supabase credentials are not configured on this environment.'
    );
  }

  try {
    const { error } = await withTimeout(
      supabase.from('products').select('id', { count: 'exact', head: true }),
      'Postgres probe'
    );
    const latency = Date.now() - started;
    if (error) {
      return result(
        'postgres.reachability',
        'postgres',
        'down',
        latency,
        error.message,
        { code: error.code }
      );
    }
    return result(
      'postgres.reachability',
      'postgres',
      'healthy',
      latency,
      'PostgREST answered the catalogue query.',
      { configured: true }
    );
  } catch (err) {
    return result(
      'postgres.reachability',
      'postgres',
      'down',
      Date.now() - started,
      errorMessage(err)
    );
  }
}

async function checkAuth(): Promise<ControlCheckResult> {
  const started = Date.now();
  if (!isSupabaseConfigured) {
    return result(
      'auth.health',
      'auth',
      'not_configured',
      null,
      'Supabase Auth is not configured on this environment.'
    );
  }

  try {
    const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseAnonKey },
    });
    const latency = Date.now() - started;
    if (response.ok) {
      return result(
        'auth.health',
        'auth',
        'healthy',
        latency,
        'Auth health endpoint answered.',
        { statusCode: response.status }
      );
    }
    return result(
      'auth.health',
      'auth',
      response.status >= 500 ? 'down' : 'degraded',
      latency,
      `Auth health endpoint returned HTTP ${response.status}.`,
      { statusCode: response.status }
    );
  } catch (err) {
    return result(
      'auth.health',
      'auth',
      'down',
      Date.now() - started,
      errorMessage(err)
    );
  }
}

async function checkStorage(): Promise<ControlCheckResult> {
  const started = Date.now();
  if (!isSupabaseConfigured) {
    return result(
      'storage.list',
      'storage',
      'not_configured',
      null,
      'Supabase Storage is not configured on this environment.'
    );
  }

  try {
    const { error } = await withTimeout(
      supabase.storage.from('media').list('', { limit: 1 }),
      'Storage probe'
    );
    const latency = Date.now() - started;
    if (error) {
      return result(
        'storage.list',
        'storage',
        'down',
        latency,
        error.message
      );
    }
    return result(
      'storage.list',
      'storage',
      'healthy',
      latency,
      'Media bucket is reachable.',
      { bucket: 'media' }
    );
  } catch (err) {
    return result(
      'storage.list',
      'storage',
      'down',
      Date.now() - started,
      errorMessage(err)
    );
  }
}

async function checkRealtime(): Promise<ControlCheckResult> {
  const started = Date.now();
  if (!isSupabaseConfigured) {
    return result(
      'realtime.endpoint',
      'realtime',
      'not_configured',
      null,
      'Supabase Realtime is not configured on this environment.'
    );
  }

  try {
    const response = await fetchWithTimeout(`${supabaseUrl}/realtime/v1/`, {
      headers: { apikey: supabaseAnonKey },
    });
    const latency = Date.now() - started;
    if (response.status < 500) {
      return result(
        'realtime.endpoint',
        'realtime',
        'healthy',
        latency,
        'Realtime endpoint is reachable.',
        { statusCode: response.status }
      );
    }
    return result(
      'realtime.endpoint',
      'realtime',
      'down',
      latency,
      `Realtime endpoint returned HTTP ${response.status}.`,
      { statusCode: response.status }
    );
  } catch (err) {
    return result(
      'realtime.endpoint',
      'realtime',
      'down',
      Date.now() - started,
      errorMessage(err)
    );
  }
}

async function checkStorefront(baseUrl: string | null): Promise<ControlCheckResult> {
  const started = Date.now();
  if (!baseUrl) {
    return result(
      'storefront.manifest',
      'storefront',
      'not_configured',
      null,
      'The public origin could not be derived from this request.'
    );
  }

  try {
    const response = await fetchWithTimeout(`${baseUrl}/editorial/look-01.jpg`, {
      method: 'HEAD',
    });
    const latency = Date.now() - started;
    if (response.ok) {
      return result(
        'storefront.manifest',
        'storefront',
        'healthy',
        latency,
        'Published editorial media is reachable.',
        { statusCode: response.status }
      );
    }
    return result(
      'storefront.manifest',
      'storefront',
      'down',
      latency,
      `Editorial media returned HTTP ${response.status}.`,
      { statusCode: response.status }
    );
  } catch (err) {
    return result(
      'storefront.manifest',
      'storefront',
      'down',
      Date.now() - started,
      errorMessage(err)
    );
  }
}

async function checkTelemetry(): Promise<ControlCheckResult> {
  const started = Date.now();
  if (!isSupabaseConfigured) {
    return result(
      'telemetry.freshness',
      'telemetry',
      'not_configured',
      null,
      'Telemetry storage is not configured on this environment.'
    );
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('events')
        .select('timestamp')
        .order('timestamp', { ascending: false })
        .limit(1),
      'Telemetry probe'
    );
    const latency = Date.now() - started;
    if (error) {
      return result(
        'telemetry.freshness',
        'telemetry',
        'down',
        latency,
        error.message,
        { code: error.code }
      );
    }
    if (!data || data.length === 0) {
      return result(
        'telemetry.freshness',
        'telemetry',
        'no_data',
        latency,
        'No events have been recorded yet.'
      );
    }

    const raw = Number((data[0] as { timestamp?: number }).timestamp);
    const ageSeconds = Number.isFinite(raw) ? Math.max(0, Math.floor((Date.now() - raw) / 1000)) : null;
    if (ageSeconds === null) {
      return result(
        'telemetry.freshness',
        'telemetry',
        'degraded',
        latency,
        'Latest event has no usable timestamp.',
        { ageSeconds }
      );
    }
    if (ageSeconds <= 300) {
      return result(
        'telemetry.freshness',
        'telemetry',
        'healthy',
        latency,
        `Latest event is ${ageSeconds}s old.`,
        { ageSeconds }
      );
    }
    return result(
      'telemetry.freshness',
      'telemetry',
      'degraded',
      latency,
      `Latest event is ${Math.round(ageSeconds / 60)}m old.`,
      { ageSeconds }
    );
  } catch (err) {
    return result(
      'telemetry.freshness',
      'telemetry',
      'down',
      Date.now() - started,
      errorMessage(err)
    );
  }
}

function checkVideoConfig(): ControlCheckResult {
  return process.env.GEMINI_API_KEY
    ? result(
        'video.config',
        'video',
        'healthy',
        null,
        'Video provider key is configured. The provider is not exercised by this probe.'
      )
    : result(
        'video.config',
        'video',
        'not_configured',
        null,
        'GEMINI_API_KEY is not configured on this environment.'
      );
}

function checkAdminPrivilege(): ControlCheckResult {
  return isServiceClient
    ? result(
        'admin.privilege',
        'admin',
        'healthy',
        null,
        'Server-side service role is available for privileged verification.'
      )
    : result(
        'admin.privilege',
        'admin',
        'not_configured',
        null,
        'SUPABASE_SERVICE_ROLE_KEY is missing. Privileged API routes fail closed.'
      );
}

export interface RunProbeOptions {
  baseUrl: string | null;
  requestId: string;
}

export async function runControlProbes(options: RunProbeOptions): Promise<ControlCheckResult[]> {
  const checks = await Promise.all([
    Promise.resolve(
      result('api.self', 'api', 'healthy', 0, 'The API process answered this request.', {
        requestId: options.requestId,
      })
    ),
    checkPostgres(),
    checkAuth(),
    checkStorage(),
    checkRealtime(),
    checkStorefront(options.baseUrl),
    checkTelemetry(),
    Promise.resolve(checkVideoConfig()),
    Promise.resolve(checkAdminPrivilege()),
  ]);

  return checks;
}

const serviceState = (
  serviceId: string,
  checks: ControlCheckResult[]
): ControlServiceState | null => {
  const definition = CONTROL_SERVICES.find((service) => service.id === serviceId);
  if (!definition) return null;
  const serviceChecks = checks.filter((check) => check.serviceId === serviceId);
  const probeIds = CONTROL_PROBES_BY_SERVICE.get(serviceId);
  if (!serviceChecks.length && !probeIds?.length) return null;

  const status = worst(serviceChecks.map((check) => check.status));
  const lastCheckedAt =
    serviceChecks
      .map((check) => check.checkedAt)
      .sort()
      .at(-1) || null;

  return {
    ...definition,
    status,
    lastCheckedAt,
    checks: serviceChecks,
  };
};

async function loadIncidents(): Promise<ControlIncidentSummary[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_incidents')
        .select('id, title, severity, status, started_at, service_ids')
        .neq('status', 'resolved')
        .order('started_at', { ascending: false })
        .limit(5),
      'Incident read'
    );
    if (error || !data) return [];
    return data.map((row: any) => ({
      id: String(row.id),
      title: String(row.title || 'Untitled incident'),
      severity: String(row.severity || 'SEV3'),
      status: String(row.status || 'investigating'),
      startedAt: String(row.started_at || ''),
      serviceIds: Array.isArray(row.service_ids) ? row.service_ids : [],
    }));
  } catch {
    return [];
  }
}

async function loadDeployments(): Promise<ControlDeploymentSummary[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_deployments')
        .select('id, environment, version, status, started_at, completed_at')
        .order('started_at', { ascending: false })
        .limit(5),
      'Deployment read'
    );
    if (error || !data) return [];
    return data.map((row: any) => ({
      id: String(row.id),
      environment: String(row.environment || 'unknown'),
      version: String(row.version || 'unknown'),
      status: String(row.status || 'unknown'),
      startedAt: String(row.started_at || ''),
      completedAt: row.completed_at ? String(row.completed_at) : null,
    }));
  } catch {
    return [];
  }
}

async function loadFailingJobs(): Promise<ControlJobSummary[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_job_runs')
        .select('id, job_id, status, started_at, duration_ms, error')
        .in('status', ['failed', 'dead_lettered'])
        .order('started_at', { ascending: false })
        .limit(5),
      'Job read'
    );
    if (error || !data) return [];
    return data.map((row: any) => ({
      id: String(row.id),
      name: String(row.job_id || 'job'),
      status: String(row.status || 'failed'),
      startedAt: String(row.started_at || ''),
      durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
      error: row.error ? String(row.error) : null,
    }));
  } catch {
    return [];
  }
}

export async function buildControlOverview(
  options: RunProbeOptions
): Promise<ControlOverview> {
  const checks = await runControlProbes(options);
  const services = CONTROL_SERVICES.map((service) => serviceState(service.id, checks)).filter(
    (service): service is ControlServiceState => Boolean(service)
  );

  const tierOne = services.filter((service) => service.tier === 1);
  const anyTierOneDown = tierOne.some((service) => service.status === 'down');
  const anyDegraded = services.some(
    (service) => service.status === 'degraded' || service.status === 'down'
  );
  const allConfigured = isSupabaseConfigured && isServiceClient;

  const status: ControlOverallStatus = !allConfigured
    ? 'not_configured'
    : anyTierOneDown
      ? 'down'
      : anyDegraded
        ? 'degraded'
        : 'operational';

  const [incidents, deployments, jobs, alertState] = await Promise.all([
    loadIncidents(),
    loadDeployments(),
    loadFailingJobs(),
    loadAlerts(),
  ]);

  const notes: string[] = [];
  if (!isSupabaseConfigured) {
    notes.push('Supabase credentials are missing. Database, auth, storage and telemetry probes cannot run.');
  }
  if (!isServiceClient) {
    notes.push('The service role key is missing. Privileged API routes and persisted control metadata are unavailable.');
  }
  if (isSupabaseConfigured && isServiceClient) {
    notes.push('Control metadata is stored in Supabase when migration 0008_control_plane.sql has been applied.');
  }

  return {
    generatedAt: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || process.env.APP_VERSION || 'dev',
    requestId: options.requestId,
    status,
    summary: {
      services: services.length,
      healthy: services.filter((service) => service.status === 'healthy').length,
      degraded: services.filter((service) => service.status === 'degraded').length,
      down: services.filter((service) => service.status === 'down').length,
      notConfigured: services.filter((service) => service.status === 'not_configured').length,
      activeIncidents: incidents.length,
      activeAlerts: alertState.alerts.length,
      failingJobs: jobs.length,
    },
    services,
    checks,
    incidents,
    deployments,
    jobs,
    notes,
  };
}

export async function persistHealthResults(
  checks: ControlCheckResult[]
): Promise<{ persisted: boolean; message: string }> {
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      persisted: false,
      message: 'Persistence is unavailable because the server is not connected to Supabase.',
    };
  }

  try {
    const rows = checks.map((check) => ({
      check_id: check.id,
      service_id: check.serviceId,
      status: check.status,
      latency_ms: check.latencyMs,
      message: check.message,
      details: check.details || {},
      checked_at: check.checkedAt,
    }));
    const { error } = await supabase.from('system_health_results').insert(rows);
    if (error) {
      return { persisted: false, message: error.message };
    }
    return { persisted: true, message: `${rows.length} health results recorded.` };
  } catch (err) {
    return { persisted: false, message: errorMessage(err) };
  }
}
