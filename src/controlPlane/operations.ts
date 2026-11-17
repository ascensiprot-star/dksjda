import { createHash, randomUUID } from 'crypto';
import { isServiceClient, isSupabaseConfigured, supabase } from '../supabase/config';
import {
  ControlAuditChain,
  ControlAuditEvent,
  ControlAuditResponse,
  ControlChangeRequest,
  ControlChangeRequestsResponse,
  ControlFeatureFlag,
  ControlFlagsResponse,
  ControlJobDefinition,
  ControlJobRun,
  ControlJobsResponse,
  ControlRunbook,
  ControlRunbooksResponse,
} from './types';

const READ_TIMEOUT_MS = 5000;
const GENESIS_HASH = 'GENESIS';

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

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/* --------------------------------------------------------------------------
 * Jobs
 * -------------------------------------------------------------------------- */

const mapJobDefinition = (row: any): ControlJobDefinition => ({
  id: String(row.id),
  name: String(row.name || row.id),
  serviceId: row.service_id ? String(row.service_id) : null,
  schedule: row.schedule ? String(row.schedule) : null,
  timeoutSeconds: Number(row.timeout_seconds || 300),
  maxAttempts: Number(row.max_attempts || 1),
  enabled: Boolean(row.enabled),
});

const mapJobRun = (row: any): ControlJobRun => ({
  id: String(row.id),
  jobId: String(row.job_id || 'unknown'),
  status: String(row.status || 'unknown'),
  attempt: Number(row.attempt || 1),
  startedAt: String(row.started_at || ''),
  completedAt: row.completed_at ? String(row.completed_at) : null,
  durationMs:
    row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
  error: row.error ? String(row.error) : null,
  traceId: row.trace_id ? String(row.trace_id) : null,
  details: asRecord(row.details),
});

export async function loadJobs(): Promise<ControlJobsResponse> {
  const generatedAt = new Date().toISOString();
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Job runs are unavailable because the server is not connected to Supabase.',
      definitions: [],
      runs: [],
    };
  }

  try {
    const [definitionsResult, runsResult] = await Promise.all([
      withTimeout(
        supabase
          .from('system_jobs')
          .select('id, name, service_id, schedule, timeout_seconds, max_attempts, enabled')
          .order('name', { ascending: true }),
        'Job definition read'
      ),
      withTimeout(
        supabase
          .from('system_job_runs')
          .select('id, job_id, status, attempt, started_at, completed_at, duration_ms, error, trace_id, details')
          .order('started_at', { ascending: false })
          .limit(100),
        'Job run read'
      ),
    ]);

    return {
      generatedAt,
      persisted: true,
      note: definitionsResult.error?.message || runsResult.error?.message || null,
      definitions: (definitionsResult.data || []).map(mapJobDefinition),
      runs: (runsResult.data || []).map(mapJobRun),
    };
  } catch (err) {
    return { generatedAt, persisted: false, note: errorMessage(err), definitions: [], runs: [] };
  }
}

export async function createVideoJobRun(
  operationName: string,
  aspectRatio: string,
  traceId?: string
): Promise<ControlJobRun | null> {
  if (!isSupabaseConfigured || !isServiceClient) return null;
  const row = {
    id: operationName,
    job_id: 'video-generation',
    status: 'running',
    attempt: 1,
    started_at: new Date().toISOString(),
    completed_at: null,
    duration_ms: null,
    error: null,
    trace_id: traceId || null,
    details: { operationName, aspectRatio },
  };
  const { data, error } = await withTimeout(
    supabase.from('system_job_runs').upsert(row, { onConflict: 'id' }).select('*').single(),
    'Video job create'
  );
  if (error) throw new Error(error.message);
  return data ? mapJobRun(data) : null;
}

export async function getVideoJobRun(operationName: string): Promise<ControlJobRun | null> {
  if (!isSupabaseConfigured || !isServiceClient) return null;
  const { data, error } = await withTimeout(
    supabase.from('system_job_runs').select('*').eq('id', operationName).maybeSingle(),
    'Video job read'
  );
  if (error) throw new Error(error.message);
  return data ? mapJobRun(data) : null;
}

export async function updateVideoJobRun(
  operationName: string,
  patch: {
    status: 'completed' | 'failed';
    videoUrl?: string;
    error?: string;
    durationMs?: number | null;
  }
): Promise<void> {
  if (!isSupabaseConfigured || !isServiceClient) return;
  const current = await getVideoJobRun(operationName);
  const startedAt = current?.startedAt ? new Date(current.startedAt).getTime() : Date.now();
  const durationMs =
    patch.durationMs ?? (Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : null);
  const details = {
    ...(current?.details || {}),
    operationName,
    ...(patch.videoUrl ? { videoUrl: patch.videoUrl } : {}),
    ...(patch.error ? { error: patch.error } : {}),
  };
  const { error } = await withTimeout(
    supabase
      .from('system_job_runs')
      .update({
        status: patch.status,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        error: patch.error || null,
        details,
      })
      .eq('id', operationName),
    'Video job update'
  );
  if (error) throw new Error(error.message);
}

/* --------------------------------------------------------------------------
 * Feature flags
 * -------------------------------------------------------------------------- */

const mapFlag = (row: any): ControlFeatureFlag => ({
  key: String(row.flag_key),
  name: String(row.name || row.flag_key),
  description: String(row.description || ''),
  enabled: Boolean(row.enabled),
  rolloutPercent: Number(row.rollout_percent || 0),
  environments: Array.isArray(row.environments) ? row.environments.map(String) : [],
  updatedBy: row.updated_by ? String(row.updated_by) : null,
  updatedAt: String(row.updated_at || ''),
});

export async function loadFeatureFlags(): Promise<ControlFlagsResponse> {
  const generatedAt = new Date().toISOString();
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Feature flags are unavailable because the server is not connected to Supabase.',
      flags: [],
    };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_feature_flags')
        .select('flag_key, name, description, enabled, rollout_percent, environments, updated_by, updated_at')
        .order('name', { ascending: true }),
      'Feature flag read'
    );
    if (error) return { generatedAt, persisted: false, note: error.message, flags: [] };
    return { generatedAt, persisted: true, note: null, flags: (data || []).map(mapFlag) };
  } catch (err) {
    return { generatedAt, persisted: false, note: errorMessage(err), flags: [] };
  }
}

export async function getFeatureFlag(key: string): Promise<ControlFeatureFlag | null> {
  if (!isSupabaseConfigured || !isServiceClient) return null;
  const { data, error } = await withTimeout(
    supabase
      .from('system_feature_flags')
      .select('flag_key, name, description, enabled, rollout_percent, environments, updated_by, updated_at')
      .eq('flag_key', key)
      .maybeSingle(),
    'Feature flag read'
  );
  if (error) throw new Error(error.message);
  return data ? mapFlag(data) : null;
}

export async function isFeatureEnabled(key: string): Promise<boolean> {
  try {
    const flag = await getFeatureFlag(key);
    return flag ? flag.enabled : true;
  } catch {
    // A missing control-plane database must not silently disable commerce routes.
    return true;
  }
}

export async function updateFeatureFlag(
  key: string,
  patch: { enabled?: boolean; rolloutPercent?: number; description?: string },
  actor: string
): Promise<ControlFeatureFlag | null> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Feature flag updates require a configured Supabase server client.');
  }
  const update: Record<string, unknown> = {
    updated_by: actor,
    updated_at: new Date().toISOString(),
  };
  if (typeof patch.enabled === 'boolean') update.enabled = patch.enabled;
  if (typeof patch.rolloutPercent === 'number') {
    update.rollout_percent = Math.max(0, Math.min(100, Math.round(patch.rolloutPercent)));
  }
  if (typeof patch.description === 'string') update.description = patch.description;

  const { data, error } = await withTimeout(
    supabase
      .from('system_feature_flags')
      .update(update)
      .eq('flag_key', key)
      .select('flag_key, name, description, enabled, rollout_percent, environments, updated_by, updated_at')
      .maybeSingle(),
    'Feature flag update'
  );
  if (error) throw new Error(error.message);
  return data ? mapFlag(data) : null;
}

/* --------------------------------------------------------------------------
 * Runbooks
 * -------------------------------------------------------------------------- */

export async function loadRunbooks(): Promise<ControlRunbooksResponse> {
  const generatedAt = new Date().toISOString();
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Runbooks are unavailable because the server is not connected to Supabase.',
      runbooks: [],
    };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_runbooks')
        .select('id, name, description, service_id, severity, steps, owner, enabled')
        .eq('enabled', true)
        .order('severity', { ascending: true })
        .order('name', { ascending: true }),
      'Runbook read'
    );
    if (error) return { generatedAt, persisted: false, note: error.message, runbooks: [] };
    const runbooks: ControlRunbook[] = (data || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      description: String(row.description || ''),
      serviceId: row.service_id ? String(row.service_id) : null,
      severity: String(row.severity || 'SEV3'),
      steps: Array.isArray(row.steps)
        ? row.steps.map((step: unknown) =>
            typeof step === 'string' ? step : JSON.stringify(step)
          )
        : [],
      owner: String(row.owner || 'House Operations'),
      enabled: Boolean(row.enabled),
    }));
    return { generatedAt, persisted: true, note: null, runbooks };
  } catch (err) {
    return { generatedAt, persisted: false, note: errorMessage(err), runbooks: [] };
  }
}

/* --------------------------------------------------------------------------
 * Change requests
 * -------------------------------------------------------------------------- */

const mapChangeRequest = (row: any): ControlChangeRequest => ({
  id: String(row.id),
  action: String(row.action),
  targetType: String(row.target_type || 'resource'),
  targetId: row.target_id ? String(row.target_id) : null,
  reason: String(row.reason || ''),
  payload: asRecord(row.payload),
  status: String(row.status || 'pending'),
  requestedBy: String(row.requested_by || ''),
  approvedBy: row.approved_by ? String(row.approved_by) : null,
  createdAt: String(row.created_at || ''),
  decidedAt: row.decided_at ? String(row.decided_at) : null,
  expiresAt: row.expires_at ? String(row.expires_at) : null,
});

export async function loadChangeRequests(): Promise<ControlChangeRequestsResponse> {
  const generatedAt = new Date().toISOString();
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Change requests are unavailable because the server is not connected to Supabase.',
      requests: [],
    };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_change_requests')
        .select('id, action, target_type, target_id, reason, payload, status, requested_by, approved_by, created_at, decided_at, expires_at')
        .order('created_at', { ascending: false })
        .limit(100),
      'Change request read'
    );
    if (error) return { generatedAt, persisted: false, note: error.message, requests: [] };
    return {
      generatedAt,
      persisted: true,
      note: null,
      requests: (data || []).map(mapChangeRequest),
    };
  } catch (err) {
    return { generatedAt, persisted: false, note: errorMessage(err), requests: [] };
  }
}

export async function createChangeRequest(
  input: {
    action: string;
    targetType: string;
    targetId?: string;
    reason: string;
    payload?: Record<string, unknown>;
  },
  actor: string
): Promise<ControlChangeRequest> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Change requests require a configured Supabase server client.');
  }
  const row = {
    id: `chg-${randomUUID()}`,
    action: input.action.trim(),
    target_type: input.targetType.trim() || 'resource',
    target_id: input.targetId?.trim() || null,
    reason: input.reason.trim(),
    payload: input.payload || {},
    status: 'pending',
    requested_by: actor,
  };
  const { data, error } = await withTimeout(
    supabase.from('system_change_requests').insert(row).select('*').single(),
    'Change request insert'
  );
  if (error) throw new Error(error.message);
  return mapChangeRequest(data);
}

export async function decideChangeRequest(
  id: string,
  decision: 'approved' | 'rejected',
  actor: string
): Promise<ControlChangeRequest | null> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Change request decisions require a configured Supabase server client.');
  }
  const { data, error } = await withTimeout(
    supabase
      .from('system_change_requests')
      .update({
        status: decision,
        approved_by: actor,
        decided_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle(),
    'Change request decision'
  );
  if (error) throw new Error(error.message);
  return data ? mapChangeRequest(data) : null;
}

/* --------------------------------------------------------------------------
 * Audit chain
 * -------------------------------------------------------------------------- */

const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return 'null';
};

const canonicalDate = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
};

const auditPayload = (row: {
  occurred_at?: unknown;
  actor_id?: unknown;
  actor_email?: unknown;
  role?: unknown;
  action?: unknown;
  target_type?: unknown;
  target_id?: unknown;
  before?: unknown;
  after?: unknown;
  request_id?: unknown;
  trace_id?: unknown;
  approval_id?: unknown;
}): string =>
  stableStringify({
    occurredAt: canonicalDate(row.occurred_at),
    actorId: row.actor_id ?? null,
    actorEmail: row.actor_email ?? null,
    role: row.role ?? null,
    action: row.action ?? null,
    targetType: row.target_type ?? null,
    targetId: row.target_id ?? null,
    before: row.before ?? null,
    after: row.after ?? null,
    requestId: row.request_id ?? null,
    traceId: row.trace_id ?? null,
    approvalId: row.approval_id ?? null,
  });

const hashAuditRow = (previousHash: string, row: Record<string, unknown>): string =>
  createHash('sha256').update(`${previousHash}${auditPayload(row)}`).digest('hex');

const mapAuditEvent = (row: any): ControlAuditEvent => ({
  id: String(row.id),
  occurredAt: String(row.occurred_at || ''),
  actorId: row.actor_id ? String(row.actor_id) : null,
  actorEmail: row.actor_email ? String(row.actor_email) : null,
  role: row.role ? String(row.role) : null,
  action: String(row.action || ''),
  targetType: row.target_type ? String(row.target_type) : null,
  targetId: row.target_id ? String(row.target_id) : null,
  before: row.before ?? null,
  after: row.after ?? null,
  requestId: row.request_id ? String(row.request_id) : null,
  traceId: row.trace_id ? String(row.trace_id) : null,
  approvalId: row.approval_id ? String(row.approval_id) : null,
  previousHash: row.previous_hash ? String(row.previous_hash) : null,
  hash: String(row.hash || ''),
});

export interface AppendAuditInput {
  actorId?: string;
  actorEmail: string;
  role?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
  traceId?: string;
  approvalId?: string;
}

const AUDIT_APPEND_ATTEMPTS = 8;

const isAuditTailConflict = (error: { code?: string; message?: string } | null): boolean => {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /previous_hash|duplicate key|unique constraint/i.test(error.message || '');
};

async function appendControlAuditInner(
  input: AppendAuditInput
): Promise<ControlAuditEvent | null> {
  if (!isSupabaseConfigured || !isServiceClient) return null;

  // The audit chain is a single linked list. Two instances can read the same
  // tail concurrently, so the database enforces uniqueness on previous_hash.
  // The losing writer re-reads the tail and retries, which turns a potential
  // fork into a normal optimistic-concurrency retry. No advisory lock is
  // required, and the JS canonical hash format remains the source of truth.
  const eventId = `audit-${randomUUID()}`;
  for (let attempt = 0; attempt < AUDIT_APPEND_ATTEMPTS; attempt += 1) {
    const latest = await withTimeout(
      supabase
        .from('system_audit_events')
        .select('hash, occurred_at')
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      'Audit tail read'
    );
    if (latest.error) throw new Error(latest.error.message);

    const previousHash = latest.data?.hash ? String(latest.data.hash) : GENESIS_HASH;
    const lastOccurredAt = latest.data?.occurred_at
      ? new Date(String(latest.data.occurred_at)).getTime()
      : 0;
    const occurredAt = new Date(
      Math.max(Date.now(), Number.isFinite(lastOccurredAt) ? lastOccurredAt + 1 : 0)
    ).toISOString();
    const baseRow: Record<string, unknown> = {
      id: eventId,
      occurred_at: occurredAt,
      actor_id: input.actorId || null,
      actor_email: input.actorEmail,
      role: input.role || null,
      action: input.action,
      target_type: input.targetType || null,
      target_id: input.targetId || null,
      before: input.before ?? null,
      after: input.after ?? null,
      request_id: input.requestId || null,
      trace_id: input.traceId || null,
      approval_id: input.approvalId || null,
      previous_hash: previousHash,
    };
    const row = { ...baseRow, hash: hashAuditRow(previousHash, baseRow) };

    const { data, error } = await withTimeout(
      supabase.from('system_audit_events').insert(row).select('*').single(),
      'Audit insert'
    );
    if (!error) return data ? mapAuditEvent(data) : null;
    if (isAuditTailConflict(error)) {
      // If the first insert committed but its response was lost, the same
      // event id is already present. Return it instead of appending a duplicate.
      const existing = await withTimeout(
        supabase.from('system_audit_events').select('*').eq('id', eventId).maybeSingle(),
        'Audit idempotency read'
      );
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) return mapAuditEvent(existing.data);
      // Otherwise another instance extended the chain first. Retry the new tail.
      continue;
    }
    throw new Error(error.message);
  }

  throw new Error(
    `Audit append could not acquire a stable chain tail after ${AUDIT_APPEND_ATTEMPTS} attempts.`
  );
}

// Serialize audit appends inside this process so concurrent control-plane
// mutations do not contend with each other. Cross-instance safety comes from
// the unique previous_hash index plus the retry above.
let auditWriteQueue: Promise<unknown> = Promise.resolve();

export function appendControlAudit(
  input: AppendAuditInput
): Promise<ControlAuditEvent | null> {
  const next = auditWriteQueue.then(() => appendControlAuditInner(input));
  auditWriteQueue = next.catch(() => undefined);
  return next;
}

export async function verifyAuditChain(limit = 5000): Promise<ControlAuditChain> {
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      valid: false,
      checked: 0,
      brokenAt: null,
      message: 'Audit chain verification requires a configured Supabase server client.',
    };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_audit_events')
        .select('*')
        .order('occurred_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(Math.max(1, Math.min(limit, 20_000))),
      'Audit chain read'
    );
    if (error) {
      return { valid: false, checked: 0, brokenAt: null, message: error.message };
    }

    let previous = GENESIS_HASH;
    const rows = (data || []) as Array<Record<string, unknown>>;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const storedPrevious = row.previous_hash ? String(row.previous_hash) : GENESIS_HASH;
      if (storedPrevious !== previous) {
        return {
          valid: false,
          checked: index,
          brokenAt: String(row.id),
          message: 'Previous-hash link is broken.',
        };
      }
      const expected = hashAuditRow(previous, row);
      if (expected !== String(row.hash || '')) {
        return {
          valid: false,
          checked: index,
          brokenAt: String(row.id),
          message: 'Event hash does not match its canonical payload.',
        };
      }
      previous = expected;
    }

    return {
      valid: true,
      checked: rows.length,
      brokenAt: null,
      message:
        rows.length === 0
          ? 'The audit chain is empty.'
          : rows.length >= Math.min(limit, 20_000)
            ? `Verified ${rows.length} hash-linked audit events. The verification limit was reached; older events were not checked.`
            : `Verified ${rows.length} hash-linked audit events.`,
    };
  } catch (err) {
    return { valid: false, checked: 0, brokenAt: null, message: errorMessage(err) };
  }
}

export async function loadAuditEvents(limit = 100): Promise<ControlAuditResponse> {
  const generatedAt = new Date().toISOString();
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Audit events are unavailable because the server is not connected to Supabase.',
      events: [],
      chain: await verifyAuditChain(),
    };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_audit_events')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(Math.max(1, Math.min(limit, 500))),
      'Audit event read'
    );
    if (error) {
      return {
        generatedAt,
        persisted: false,
        note: error.message,
        events: [],
        chain: await verifyAuditChain(),
      };
    }
    return {
      generatedAt,
      persisted: true,
      note: null,
      events: (data || []).map(mapAuditEvent),
      chain: await verifyAuditChain(),
    };
  } catch (err) {
    return {
      generatedAt,
      persisted: false,
      note: errorMessage(err),
      events: [],
      chain: await verifyAuditChain(),
    };
  }
}
