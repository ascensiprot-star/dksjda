import { randomUUID } from 'crypto';
import { isServiceClient, isSupabaseConfigured, supabase } from '../supabase/config';
import {
  ControlAdminSession,
  ControlBackupDrill,
  ControlBackupsResponse,
  ControlCostBudget,
  ControlCostBudgetState,
  ControlCostResponse,
  ControlCostSnapshot,
  ControlCostStatus,
  ControlPrivilegedActionSummary,
  ControlRunbookExecution,
  ControlRunbookExecutionsResponse,
  ControlSecurityEvent,
  ControlSecurityResponse,
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

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const optionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const monthBounds = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
};

/* --------------------------------------------------------------------------
 * Costs
 * -------------------------------------------------------------------------- */

const mapCostBudget = (row: any): ControlCostBudget => ({
  id: String(row.id),
  name: String(row.name || row.id),
  provider: String(row.provider || 'unknown'),
  serviceId: row.service_id ? String(row.service_id) : null,
  monthlyLimit: Number(row.monthly_limit || 0),
  currency: String(row.currency || 'USD'),
  alertThresholdPercent: Number(row.alert_threshold_percent || 80),
  enabled: Boolean(row.enabled),
  owner: String(row.owner || 'House Operations'),
  updatedBy: row.updated_by ? String(row.updated_by) : null,
  updatedAt: String(row.updated_at || ''),
});

const mapCostSnapshot = (row: any): ControlCostSnapshot => ({
  id: String(row.id),
  capturedAt: String(row.captured_at || ''),
  provider: String(row.provider || 'unknown'),
  serviceId: row.service_id ? String(row.service_id) : null,
  periodStart: String(row.period_start || ''),
  periodEnd: String(row.period_end || ''),
  amount: Number(row.amount || 0),
  currency: String(row.currency || 'USD'),
  source: String(row.source || 'manual'),
  details: asRecord(row.details),
  createdBy: row.created_by ? String(row.created_by) : null,
});

const latestSnapshotsByPeriod = (snapshots: ControlCostSnapshot[]): ControlCostSnapshot[] => {
  const latest = new Map<string, ControlCostSnapshot>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.provider}|${snapshot.serviceId || '*'}|${snapshot.periodStart}|${snapshot.periodEnd}|${snapshot.currency}`;
    const current = latest.get(key);
    if (!current || snapshot.capturedAt > current.capturedAt) latest.set(key, snapshot);
  }
  return [...latest.values()];
};

const costStatus = (
  spent: number | null,
  limit: number,
  thresholdPercent: number
): ControlCostStatus => {
  if (spent === null) return 'no_data';
  if (limit <= 0) return 'warning';
  if (spent > limit) return 'breached';
  if (spent >= (limit * thresholdPercent) / 100) return 'warning';
  return 'ok';
};

export async function loadCosts(): Promise<ControlCostResponse> {
  const generatedAt = new Date().toISOString();
  const { start, end } = monthBounds();
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Cost data is unavailable because the server is not connected to Supabase.',
      monthStart: start,
      monthEnd: end,
      budgets: [],
      snapshots: [],
      totals: {
        recordedSpend: null,
        currency: null,
        providers: 0,
        message: 'No provider cost data has been recorded.',
      },
    };
  }

  try {
    const [budgetsResult, snapshotsResult] = await Promise.all([
      withTimeout(
        supabase.from('system_cost_budgets').select('*').order('name', { ascending: true }),
        'Cost budget read'
      ),
      withTimeout(
        supabase
          .from('system_cost_snapshots')
          .select('*')
          .order('captured_at', { ascending: false })
          .limit(300),
        'Cost snapshot read'
      ),
    ]);
    if (budgetsResult.error || snapshotsResult.error) {
      return {
        generatedAt,
        persisted: false,
        note: budgetsResult.error?.message || snapshotsResult.error?.message || 'Cost read failed.',
        monthStart: start,
        monthEnd: end,
        budgets: [],
        snapshots: [],
        totals: {
          recordedSpend: null,
          currency: null,
          providers: 0,
          message: 'No provider cost data has been recorded.',
        },
      };
    }

    const snapshots = (snapshotsResult.data || []).map(mapCostSnapshot);
    const uniqueSnapshots = latestSnapshotsByPeriod(snapshots);
    const currentMonth = uniqueSnapshots.filter(
      (snapshot) => snapshot.periodStart >= start && snapshot.periodStart <= end
    );

    const budgets: ControlCostBudgetState[] = (budgetsResult.data || [])
      .map(mapCostBudget)
      .map((budget) => {
        const matching = currentMonth.filter(
          (snapshot) =>
            snapshot.provider === budget.provider &&
            (!budget.serviceId || snapshot.serviceId === budget.serviceId) &&
            snapshot.currency === budget.currency
        );
        const monthSpent =
          matching.length > 0
            ? matching.reduce((sum, snapshot) => sum + snapshot.amount, 0)
            : null;
        const utilizationPercent =
          monthSpent === null || budget.monthlyLimit <= 0
            ? null
            : (monthSpent / budget.monthlyLimit) * 100;
        const status = costStatus(monthSpent, budget.monthlyLimit, budget.alertThresholdPercent);
        const message =
          monthSpent === null
            ? `No ${budget.provider} snapshot has been recorded for ${start} to ${end}.`
            : status === 'breached'
              ? `Recorded spend is above the ${budget.currency} ${budget.monthlyLimit.toFixed(2)} ceiling.`
              : status === 'warning'
                ? `Recorded spend has crossed the ${budget.alertThresholdPercent}% warning threshold.`
                : 'Recorded spend is inside the monthly ceiling.';
        return {
          ...budget,
          monthSpent,
          utilizationPercent,
          status,
          snapshotCount: matching.length,
          message,
        };
      });

    const currencies = new Set(currentMonth.map((snapshot) => snapshot.currency));
    const providers = new Set(currentMonth.map((snapshot) => snapshot.provider));
    const totals =
      currencies.size === 1
        ? {
            recordedSpend: currentMonth.reduce((sum, snapshot) => sum + snapshot.amount, 0),
            currency: [...currencies][0],
            providers: providers.size,
            message: 'Current-month totals use the latest snapshot per provider, service and period.',
          }
        : {
            recordedSpend: null,
            currency: null,
            providers: providers.size,
            message:
              currencies.size === 0
                ? 'No current-month cost snapshots have been recorded.'
                : 'Multiple currencies are present; totals are shown per budget.',
          };

    return {
      generatedAt,
      persisted: true,
      note: null,
      monthStart: start,
      monthEnd: end,
      budgets,
      snapshots: snapshots.slice(0, 100),
      totals,
    };
  } catch (err) {
    return {
      generatedAt,
      persisted: false,
      note: errorMessage(err),
      monthStart: start,
      monthEnd: end,
      budgets: [],
      snapshots: [],
      totals: {
        recordedSpend: null,
        currency: null,
        providers: 0,
        message: 'No provider cost data has been recorded.',
      },
    };
  }
}

export async function createCostSnapshot(
  input: {
    provider: string;
    serviceId?: string;
    periodStart: string;
    periodEnd: string;
    amount: number;
    currency?: string;
    source?: string;
    details?: Record<string, unknown>;
  },
  actor: string
): Promise<ControlCostSnapshot> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Cost snapshots require a configured Supabase server client.');
  }
  const row = {
    id: `cost-${randomUUID()}`,
    provider: input.provider.trim().toLowerCase(),
    service_id: input.serviceId?.trim() || null,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    amount: input.amount,
    currency: (input.currency || 'USD').trim().toUpperCase(),
    source: (input.source || 'manual').trim(),
    details: input.details || {},
    created_by: actor,
  };
  const { data, error } = await withTimeout(
    supabase.from('system_cost_snapshots').insert(row).select('*').single(),
    'Cost snapshot insert'
  );
  if (error) throw new Error(error.message);
  return mapCostSnapshot(data);
}

export async function saveCostBudget(
  input: {
    id?: string;
    name: string;
    provider: string;
    serviceId?: string;
    monthlyLimit: number;
    currency?: string;
    alertThresholdPercent?: number;
    enabled?: boolean;
    owner?: string;
  },
  actor: string
): Promise<ControlCostBudget> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Cost budgets require a configured Supabase server client.');
  }
  const row = {
    id: input.id || `budget-${randomUUID()}`,
    name: input.name.trim(),
    provider: input.provider.trim().toLowerCase(),
    service_id: input.serviceId?.trim() || null,
    monthly_limit: input.monthlyLimit,
    currency: (input.currency || 'USD').trim().toUpperCase(),
    alert_threshold_percent: Math.max(1, Math.min(100, Math.round(input.alertThresholdPercent ?? 80))),
    enabled: input.enabled !== false,
    owner: input.owner?.trim() || 'House Operations',
    updated_by: actor,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await withTimeout(
    supabase.from('system_cost_budgets').upsert(row, { onConflict: 'id' }).select('*').single(),
    'Cost budget save'
  );
  if (error) throw new Error(error.message);
  return mapCostBudget(data);
}

/* --------------------------------------------------------------------------
 * Security analytics
 * -------------------------------------------------------------------------- */

const mapAdminSession = (row: any): ControlAdminSession => {
  const expiresAt = row.expires_at ? String(row.expires_at) : null;
  const revokedAt = row.revoked_at ? String(row.revoked_at) : null;
  const active =
    !revokedAt && (!expiresAt || new Date(expiresAt).getTime() > Date.now());
  return {
    sessionId: String(row.session_id),
    adminId: row.admin_id ? String(row.admin_id) : null,
    email: String(row.email || ''),
    role: String(row.role || ''),
    issuedAt: row.issued_at ? String(row.issued_at) : null,
    expiresAt,
    firstSeenAt: String(row.first_seen_at || ''),
    lastSeenAt: String(row.last_seen_at || ''),
    ipHash: row.ip_hash ? String(row.ip_hash) : null,
    userAgent: row.user_agent ? String(row.user_agent) : null,
    revokedAt,
    active,
  };
};

const mapSecurityEvent = (row: any): ControlSecurityEvent => ({
  id: String(row.id),
  occurredAt: String(row.occurred_at || ''),
  eventType: String(row.event_type || ''),
  actorEmail: row.actor_email ? String(row.actor_email) : null,
  actorId: row.actor_id ? String(row.actor_id) : null,
  role: row.role ? String(row.role) : null,
  outcome: String(row.outcome || 'denied'),
  severity: String(row.severity || 'low'),
  ipHash: row.ip_hash ? String(row.ip_hash) : null,
  userAgent: row.user_agent ? String(row.user_agent) : null,
  requestId: row.request_id ? String(row.request_id) : null,
  details: asRecord(row.details),
});

export async function recordAdminSession(input: {
  sessionId: string;
  adminId?: string;
  email: string;
  role: string;
  issuedAt?: string;
  expiresAt?: string;
  ipHash?: string;
  userAgent?: string;
}): Promise<void> {
  if (!isSupabaseConfigured || !isServiceClient) return;
  const now = new Date().toISOString();
  const { error } = await withTimeout(
    supabase.from('system_admin_sessions').upsert(
      {
        session_id: input.sessionId,
        admin_id: input.adminId || null,
        email: input.email,
        role: input.role,
        issued_at: input.issuedAt || null,
        expires_at: input.expiresAt || null,
        last_seen_at: now,
        ip_hash: input.ipHash || null,
        user_agent: input.userAgent?.slice(0, 500) || null,
      },
      { onConflict: 'session_id' }
    ),
    'Admin session upsert'
  );
  if (error) throw new Error(error.message);
}

export async function recordSecurityEvent(input: {
  eventType: string;
  actorEmail?: string;
  actorId?: string;
  role?: string;
  outcome?: string;
  severity?: string;
  ipHash?: string;
  userAgent?: string;
  requestId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  if (!isSupabaseConfigured || !isServiceClient) return;
  const { error } = await withTimeout(
    supabase.from('system_security_events').insert({
      id: `sec-${randomUUID()}`,
      event_type: input.eventType,
      actor_email: input.actorEmail || null,
      actor_id: input.actorId || null,
      role: input.role || null,
      outcome: input.outcome || 'denied',
      severity: input.severity || 'low',
      ip_hash: input.ipHash || null,
      user_agent: input.userAgent?.slice(0, 500) || null,
      request_id: input.requestId || null,
      details: input.details || {},
    }),
    'Security event insert'
  );
  if (error) throw new Error(error.message);
}

export async function loadSecurity(): Promise<ControlSecurityResponse> {
  const generatedAt = new Date().toISOString();
  const windowDays = 30;
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Security analytics are unavailable because the server is not connected to Supabase.',
      sessions: [],
      events: [],
      privilegedActions: [],
      windowDays,
    };
  }

  try {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const [sessionsResult, eventsResult, auditResult] = await Promise.all([
      withTimeout(
        supabase
          .from('system_admin_sessions')
          .select('*')
          .order('last_seen_at', { ascending: false })
          .limit(50),
        'Admin session read'
      ),
      withTimeout(
        supabase
          .from('system_security_events')
          .select('*')
          .order('occurred_at', { ascending: false })
          .limit(100),
        'Security event read'
      ),
      withTimeout(
        supabase
          .from('system_audit_events')
          .select('actor_email, action, occurred_at')
          .gte('occurred_at', since)
          .order('occurred_at', { ascending: false })
          .limit(1000),
        'Privileged action read'
      ),
    ]);

    const note =
      sessionsResult.error?.message ||
      eventsResult.error?.message ||
      auditResult.error?.message ||
      null;
    const sessions = (sessionsResult.data || []).map(mapAdminSession);
    const events = (eventsResult.data || []).map(mapSecurityEvent);
    const actionMap = new Map<string, ControlPrivilegedActionSummary>();
    for (const row of auditResult.data || []) {
      const key = `${row.actor_email || 'unknown'}|${row.action}`;
      const existing = actionMap.get(key);
      if (existing) {
        existing.count += 1;
        if (String(row.occurred_at) > existing.lastAt) existing.lastAt = String(row.occurred_at);
      } else {
        actionMap.set(key, {
          actorEmail: row.actor_email ? String(row.actor_email) : null,
          action: String(row.action || ''),
          count: 1,
          lastAt: String(row.occurred_at || ''),
        });
      }
    }

    return {
      generatedAt,
      persisted: !note,
      note,
      sessions,
      events,
      privilegedActions: [...actionMap.values()].sort((a, b) => b.count - a.count).slice(0, 25),
      windowDays,
    };
  } catch (err) {
    return {
      generatedAt,
      persisted: false,
      note: errorMessage(err),
      sessions: [],
      events: [],
      privilegedActions: [],
      windowDays,
    };
  }
}

/* --------------------------------------------------------------------------
 * Runbook executions
 * -------------------------------------------------------------------------- */

const mapExecution = (row: any): ControlRunbookExecution => {
  const runbook = Array.isArray(row.system_runbooks)
    ? row.system_runbooks[0]
    : row.system_runbooks;
  return {
    id: String(row.id),
    runbookId: String(row.runbook_id),
    runbookName: runbook?.name ? String(runbook.name) : null,
    changeRequestId: String(row.change_request_id),
    status: String(row.status || 'in_progress'),
    currentStep: Number(row.current_step || 0),
    stepResults: Array.isArray(row.step_results)
      ? row.step_results.map((step: unknown) => asRecord(step))
      : [],
    startedAt: String(row.started_at || ''),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    executedBy: String(row.executed_by || ''),
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    error: row.error ? String(row.error) : null,
    details: asRecord(row.details),
  };
};

export async function loadRunbookExecutions(): Promise<ControlRunbookExecutionsResponse> {
  const generatedAt = new Date().toISOString();
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Runbook executions are unavailable because the server is not connected to Supabase.',
      executions: [],
    };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_runbook_executions')
        .select('*, system_runbooks(name)')
        .order('started_at', { ascending: false })
        .limit(50),
      'Runbook execution read'
    );
    if (error) return { generatedAt, persisted: false, note: error.message, executions: [] };
    return {
      generatedAt,
      persisted: true,
      note: null,
      executions: (data || []).map(mapExecution),
    };
  } catch (err) {
    return { generatedAt, persisted: false, note: errorMessage(err), executions: [] };
  }
}

export async function startRunbookExecution(
  runbookId: string,
  changeRequestId: string,
  actor: string
): Promise<ControlRunbookExecution> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Runbook execution requires a configured Supabase server client.');
  }
  const [runbookResult, requestResult, activeResult, usedResult] = await Promise.all([
    withTimeout(
      supabase.from('system_runbooks').select('id, steps, enabled').eq('id', runbookId).maybeSingle(),
      'Runbook read'
    ),
    withTimeout(
      supabase
        .from('system_change_requests')
        .select('id, action, target_type, target_id, status, approved_by, expires_at')
        .eq('id', changeRequestId)
        .maybeSingle(),
      'Change request read'
    ),
    withTimeout(
      supabase
        .from('system_runbook_executions')
        .select('id')
        .eq('runbook_id', runbookId)
        .eq('status', 'in_progress')
        .limit(1)
        .maybeSingle(),
      'Active runbook execution read'
    ),
    withTimeout(
      supabase
        .from('system_runbook_executions')
        .select('id')
        .eq('change_request_id', changeRequestId)
        .limit(1)
        .maybeSingle(),
      'Used approval read'
    ),
  ]);
  if (runbookResult.error) throw new Error(runbookResult.error.message);
  if (requestResult.error) throw new Error(requestResult.error.message);
  if (activeResult.error) throw new Error(activeResult.error.message);
  if (usedResult.error) throw new Error(usedResult.error.message);
  if (!runbookResult.data || !runbookResult.data.enabled) {
    throw new Error('Runbook is missing or disabled.');
  }
  if (activeResult.data) {
    throw new Error('This runbook already has an execution in progress.');
  }
  if (usedResult.data) {
    throw new Error('This change request has already been used for a runbook execution.');
  }
  const request = requestResult.data;
  if (!request || request.status !== 'approved') {
    throw new Error('An approved change request is required before a runbook can start.');
  }
  if (request.action !== 'runbook.execute') {
    throw new Error('The change request action must be runbook.execute.');
  }
  if (request.target_type !== 'runbook' || request.target_id !== runbookId) {
    throw new Error('The change request does not target this runbook.');
  }
  if (request.expires_at && new Date(String(request.expires_at)).getTime() < Date.now()) {
    throw new Error('The approved change request has expired.');
  }

  const { data, error } = await withTimeout(
    supabase
      .from('system_runbook_executions')
      .insert({
        id: `rbx-${randomUUID()}`,
        runbook_id: runbookId,
        change_request_id: changeRequestId,
        status: 'in_progress',
        current_step: 0,
        step_results: [],
        executed_by: actor,
        approved_by: request.approved_by || null,
      })
      .select('*, system_runbooks(name)')
      .single(),
    'Runbook execution insert'
  );
  if (error) throw new Error(error.message);
  return mapExecution(data);
}

export async function advanceRunbookExecution(
  id: string,
  input: { stepIndex: number; result: 'done' | 'failed' | 'skipped'; note?: string },
  actor: string
): Promise<ControlRunbookExecution> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Runbook execution requires a configured Supabase server client.');
  }
  const { data: execution, error: executionError } = await withTimeout(
    supabase.from('system_runbook_executions').select('*').eq('id', id).maybeSingle(),
    'Runbook execution read'
  );
  if (executionError) throw new Error(executionError.message);
  if (!execution) throw new Error('Runbook execution not found.');
  if (execution.status !== 'in_progress') throw new Error('Runbook execution is not in progress.');

  const { data: runbook, error: runbookError } = await withTimeout(
    supabase.from('system_runbooks').select('steps').eq('id', execution.runbook_id).maybeSingle(),
    'Runbook steps read'
  );
  if (runbookError) throw new Error(runbookError.message);
  const steps = Array.isArray(runbook?.steps) ? runbook.steps : [];
  const currentStep = Number(execution.current_step || 0);
  if (input.stepIndex !== currentStep) {
    throw new Error(`Step ${input.stepIndex + 1} cannot be completed before step ${currentStep + 1}.`);
  }
  if (input.stepIndex >= steps.length) {
    throw new Error('Runbook has no remaining steps.');
  }

  const stepResults = Array.isArray(execution.step_results)
    ? execution.step_results.map((step: unknown) => asRecord(step))
    : [];
  stepResults.push({
    step: input.stepIndex + 1,
    result: input.result,
    note: input.note || '',
    at: new Date().toISOString(),
    by: actor,
  });

  const failed = input.result === 'failed';
  const completed = !failed && input.stepIndex + 1 >= steps.length;
  const { data, error } = await withTimeout(
    supabase
      .from('system_runbook_executions')
      .update({
        status: failed ? 'failed' : completed ? 'completed' : 'in_progress',
        current_step: failed ? currentStep : currentStep + 1,
        step_results: stepResults,
        completed_at: failed || completed ? new Date().toISOString() : null,
        error: failed ? input.note || 'A runbook step failed.' : null,
      })
      .eq('id', id)
      .select('*, system_runbooks(name)')
      .single(),
    'Runbook execution advance'
  );
  if (error) throw new Error(error.message);
  return mapExecution(data);
}

export async function abortRunbookExecution(
  id: string,
  status: 'failed' | 'abandoned',
  reason: string,
  actor: string
): Promise<ControlRunbookExecution> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Runbook execution requires a configured Supabase server client.');
  }
  const { data: current, error: currentError } = await withTimeout(
    supabase.from('system_runbook_executions').select('details').eq('id', id).maybeSingle(),
    'Runbook execution read'
  );
  if (currentError) throw new Error(currentError.message);
  const { data, error } = await withTimeout(
    supabase
      .from('system_runbook_executions')
      .update({
        status,
        completed_at: new Date().toISOString(),
        error: reason || null,
        details: {
          ...asRecord(current?.details),
          abortedBy: actor,
          abortReason: reason,
        },
      })
      .eq('id', id)
      .eq('status', 'in_progress')
      .select('*, system_runbooks(name)')
      .maybeSingle(),
    'Runbook execution abort'
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Runbook execution not found or already closed.');
  return mapExecution(data);
}

/* --------------------------------------------------------------------------
 * Backup and restore drills
 * -------------------------------------------------------------------------- */

const mapBackupDrill = (row: any): ControlBackupDrill => ({
  id: String(row.id),
  environment: String(row.environment || ''),
  backupSource: String(row.backup_source || ''),
  restoreTarget: String(row.restore_target || ''),
  status: String(row.status || 'planned') as ControlBackupDrill['status'],
  startedAt: row.started_at ? String(row.started_at) : null,
  completedAt: row.completed_at ? String(row.completed_at) : null,
  rpoMinutes: optionalNumber(row.rpo_minutes),
  rtoMinutes: optionalNumber(row.rto_minutes),
  verifiedTables: optionalNumber(row.verified_tables),
  verifiedRows: optionalNumber(row.verified_rows),
  checksum: row.checksum ? String(row.checksum) : null,
  performedBy: row.performed_by ? String(row.performed_by) : null,
  notes: String(row.notes || ''),
  details: asRecord(row.details),
  createdAt: String(row.created_at || ''),
});

export async function loadBackupDrills(): Promise<ControlBackupsResponse> {
  const generatedAt = new Date().toISOString();
  if (!isSupabaseConfigured || !isServiceClient) {
    return {
      generatedAt,
      persisted: false,
      note: 'Backup drills are unavailable because the server is not connected to Supabase.',
      drills: [],
    };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('system_backup_drills')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      'Backup drill read'
    );
    if (error) return { generatedAt, persisted: false, note: error.message, drills: [] };
    return {
      generatedAt,
      persisted: true,
      note: null,
      drills: (data || []).map(mapBackupDrill),
    };
  } catch (err) {
    return { generatedAt, persisted: false, note: errorMessage(err), drills: [] };
  }
}

export async function createBackupDrill(
  input: {
    environment: string;
    backupSource: string;
    restoreTarget: string;
    status?: ControlBackupDrill['status'];
    startedAt?: string;
    completedAt?: string;
    rpoMinutes?: number | null;
    rtoMinutes?: number | null;
    verifiedTables?: number | null;
    verifiedRows?: number | null;
    checksum?: string;
    notes?: string;
    details?: Record<string, unknown>;
  },
  actor: string
): Promise<ControlBackupDrill> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Backup drills require a configured Supabase server client.');
  }
  const status = input.status || 'planned';
  const row = {
    id: `bkdrill-${randomUUID()}`,
    environment: input.environment.trim(),
    backup_source: input.backupSource.trim(),
    restore_target: input.restoreTarget.trim(),
    status,
    started_at: input.startedAt || (status !== 'planned' ? new Date().toISOString() : null),
    completed_at:
      input.completedAt ||
      (status === 'passed' || status === 'failed' ? new Date().toISOString() : null),
    rpo_minutes: optionalNumber(input.rpoMinutes),
    rto_minutes: optionalNumber(input.rtoMinutes),
    verified_tables: optionalNumber(input.verifiedTables),
    verified_rows: optionalNumber(input.verifiedRows),
    checksum: input.checksum?.trim() || null,
    performed_by: actor,
    notes: input.notes?.trim() || '',
    details: input.details || {},
  };
  const { data, error } = await withTimeout(
    supabase.from('system_backup_drills').insert(row).select('*').single(),
    'Backup drill insert'
  );
  if (error) throw new Error(error.message);
  return mapBackupDrill(data);
}

export async function updateBackupDrill(
  id: string,
  patch: {
    status?: ControlBackupDrill['status'];
    completedAt?: string;
    rpoMinutes?: number | null;
    rtoMinutes?: number | null;
    verifiedTables?: number | null;
    verifiedRows?: number | null;
    checksum?: string;
    notes?: string;
    details?: Record<string, unknown>;
  },
  actor: string
): Promise<ControlBackupDrill> {
  if (!isSupabaseConfigured || !isServiceClient) {
    throw new Error('Backup drills require a configured Supabase server client.');
  }
  const { data: current, error: currentError } = await withTimeout(
    supabase.from('system_backup_drills').select('details').eq('id', id).maybeSingle(),
    'Backup drill read'
  );
  if (currentError) throw new Error(currentError.message);
  if (!current) throw new Error('Backup drill not found.');

  const update: Record<string, unknown> = {};
  if (patch.status) update.status = patch.status;
  if (patch.completedAt) update.completed_at = patch.completedAt;
  if (patch.rpoMinutes !== undefined) update.rpo_minutes = optionalNumber(patch.rpoMinutes);
  if (patch.rtoMinutes !== undefined) update.rto_minutes = optionalNumber(patch.rtoMinutes);
  if (patch.verifiedTables !== undefined) {
    update.verified_tables = optionalNumber(patch.verifiedTables);
  }
  if (patch.verifiedRows !== undefined) update.verified_rows = optionalNumber(patch.verifiedRows);
  if (patch.checksum !== undefined) update.checksum = patch.checksum.trim() || null;
  if (patch.notes !== undefined) update.notes = patch.notes.trim();
  if (patch.details !== undefined) update.details = patch.details;
  if (patch.status === 'passed' || patch.status === 'failed') {
    update.completed_at = patch.completedAt || new Date().toISOString();
  } else if (patch.status === 'planned' || patch.status === 'running') {
    update.completed_at = null;
  }
  if (Object.keys(update).length === 0) {
    throw new Error('No backup drill fields were provided.');
  }
  update.details = {
    ...asRecord(current.details),
    ...asRecord(patch.details),
    lastEditedBy: actor,
    lastEditedAt: new Date().toISOString(),
  };
  const { data, error } = await withTimeout(
    supabase.from('system_backup_drills').update(update).eq('id', id).select('*').maybeSingle(),
    'Backup drill update'
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Backup drill not found.');
  return mapBackupDrill(data);
}
