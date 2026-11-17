export type ControlCheckStatus =
  | 'healthy'
  | 'degraded'
  | 'down'
  | 'not_configured'
  | 'no_data';

export type ControlOverallStatus =
  | 'operational'
  | 'degraded'
  | 'down'
  | 'not_configured';

export type ControlServiceTier = 1 | 2 | 3;

export interface ControlServiceDefinition {
  id: string;
  name: string;
  description: string;
  tier: ControlServiceTier;
  owner: string;
  dependencies: string[];
  runbook: string;
}

export interface ControlProbeDefinition {
  id: string;
  serviceId: string;
  name: string;
  kind: 'http' | 'sql' | 'storage' | 'auth' | 'config' | 'manifest';
  required: boolean;
}

export interface ControlCheckResult {
  id: string;
  serviceId: string;
  name: string;
  kind: ControlProbeDefinition['kind'];
  status: ControlCheckStatus;
  latencyMs: number | null;
  checkedAt: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ControlServiceState extends ControlServiceDefinition {
  status: ControlCheckStatus;
  lastCheckedAt: string | null;
  checks: ControlCheckResult[];
}

export interface ControlIncidentSummary {
  id: string;
  title: string;
  severity: string;
  status: string;
  startedAt: string;
  serviceIds: string[];
}

export interface ControlDeploymentSummary {
  id: string;
  environment: string;
  version: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

export interface ControlJobSummary {
  id: string;
  name: string;
  status: string;
  startedAt: string;
  durationMs: number | null;
  error: string | null;
}

export interface ControlOverview {
  generatedAt: string;
  environment: string;
  version: string;
  requestId: string;
  status: ControlOverallStatus;
  summary: {
    services: number;
    healthy: number;
    degraded: number;
    down: number;
    notConfigured: number;
    activeIncidents: number;
    activeAlerts: number;
    failingJobs: number;
  };
  services: ControlServiceState[];
  checks: ControlCheckResult[];
  incidents: ControlIncidentSummary[];
  deployments: ControlDeploymentSummary[];
  jobs: ControlJobSummary[];
  notes: string[];
}

/* --------------------------------------------------------------------------
 * Visibility layer
 * -------------------------------------------------------------------------- */

export interface ControlHistoryBucket {
  start: string;
  healthy: number;
  degraded: number;
  down: number;
  notConfigured: number;
  noData: number;
  total: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number | null;
}

export interface ControlHistorySeries {
  checkId: string;
  serviceId: string;
  name: string;
  buckets: ControlHistoryBucket[];
}

export interface ControlHistoryResponse {
  generatedAt: string;
  hours: number;
  persisted: boolean;
  note: string | null;
  series: ControlHistorySeries[];
}

export interface ControlSloDefinition {
  id: string;
  name: string;
  description: string;
  serviceId: string;
  checkId: string;
  target: number;
  windowDays: number;
  owner: string;
}

export interface ControlSloState extends ControlSloDefinition {
  status: 'healthy' | 'at_risk' | 'breached' | 'no_data';
  availability: number | null;
  good: number;
  total: number;
  errorBudget: number;
  remainingBudget: number | null;
  burnRate: number | null;
  windowStart: string;
  windowEnd: string;
}

export interface ControlSloResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  slos: ControlSloState[];
}

export interface ControlAlert {
  id: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  serviceId: string | null;
  checkId: string | null;
  dedupeKey: string | null;
  firedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

export interface ControlAlertsResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  alerts: ControlAlert[];
}

export interface ControlIncidentEvent {
  id: string;
  incidentId: string;
  eventType: string;
  actor: string | null;
  message: string;
  details: Record<string, unknown>;
  occurredAt: string;
}

export interface ControlIncidentDetail extends ControlIncidentSummary {
  summary: string;
  impact: string;
  commander: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  events: ControlIncidentEvent[];
}

export interface ControlIncidentsResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  incidents: ControlIncidentDetail[];
}

export interface ControlDeployment extends ControlDeploymentSummary {
  commitSha: string | null;
  actor: string | null;
  rollbackOf: string | null;
  details: Record<string, unknown>;
}

export interface ControlDeploymentsResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  deployments: ControlDeployment[];
}

export interface ControlDataQualityResult {
  id: string;
  name: string;
  description: string;
  severity: string;
  status: 'healthy' | 'degraded' | 'down' | 'no_data' | 'not_configured';
  failingCount: number;
  totalCount: number;
  samples: Array<Record<string, unknown>>;
  message: string;
  checkedAt: string;
}

export interface ControlDataQualityResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  checks: ControlDataQualityResult[];
}

/* --------------------------------------------------------------------------
 * Operations layer
 * -------------------------------------------------------------------------- */

export interface ControlJobDefinition {
  id: string;
  name: string;
  serviceId: string | null;
  schedule: string | null;
  timeoutSeconds: number;
  maxAttempts: number;
  enabled: boolean;
}

export interface ControlJobRun {
  id: string;
  jobId: string;
  status: string;
  attempt: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  traceId: string | null;
  details: Record<string, unknown>;
}

export interface ControlJobsResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  definitions: ControlJobDefinition[];
  runs: ControlJobRun[];
}

export interface ControlFeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  environments: string[];
  updatedBy: string | null;
  updatedAt: string;
}

export interface ControlFlagsResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  flags: ControlFeatureFlag[];
}

export interface ControlRunbook {
  id: string;
  name: string;
  description: string;
  serviceId: string | null;
  severity: string;
  steps: string[];
  owner: string;
  enabled: boolean;
}

export interface ControlRunbooksResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  runbooks: ControlRunbook[];
}

export interface ControlChangeRequest {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  payload: Record<string, unknown>;
  status: string;
  requestedBy: string;
  approvedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
}

export interface ControlChangeRequestsResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  requests: ControlChangeRequest[];
}

export interface ControlAuditEvent {
  id: string;
  occurredAt: string;
  actorId: string | null;
  actorEmail: string | null;
  role: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  requestId: string | null;
  traceId: string | null;
  approvalId: string | null;
  previousHash: string | null;
  hash: string;
}

export interface ControlAuditChain {
  valid: boolean;
  checked: number;
  brokenAt: string | null;
  message: string;
}

export interface ControlAuditResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  events: ControlAuditEvent[];
  chain: ControlAuditChain;
}

/* --------------------------------------------------------------------------
 * Hardening layer
 * -------------------------------------------------------------------------- */

export type ControlCostStatus = 'ok' | 'warning' | 'breached' | 'no_data' | 'not_configured';

export interface ControlCostBudget {
  id: string;
  name: string;
  provider: string;
  serviceId: string | null;
  monthlyLimit: number;
  currency: string;
  alertThresholdPercent: number;
  enabled: boolean;
  owner: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface ControlCostSnapshot {
  id: string;
  capturedAt: string;
  provider: string;
  serviceId: string | null;
  periodStart: string;
  periodEnd: string;
  amount: number;
  currency: string;
  source: string;
  details: Record<string, unknown>;
  createdBy: string | null;
}

export interface ControlCostBudgetState extends ControlCostBudget {
  monthSpent: number | null;
  utilizationPercent: number | null;
  status: ControlCostStatus;
  snapshotCount: number;
  message: string;
}

export interface ControlCostResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  monthStart: string;
  monthEnd: string;
  budgets: ControlCostBudgetState[];
  snapshots: ControlCostSnapshot[];
  totals: {
    recordedSpend: number | null;
    currency: string | null;
    providers: number;
    message: string;
  };
}

export interface ControlAdminSession {
  sessionId: string;
  adminId: string | null;
  email: string;
  role: string;
  issuedAt: string | null;
  expiresAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  ipHash: string | null;
  userAgent: string | null;
  revokedAt: string | null;
  active: boolean;
}

export interface ControlSecurityEvent {
  id: string;
  occurredAt: string;
  eventType: string;
  actorEmail: string | null;
  actorId: string | null;
  role: string | null;
  outcome: string;
  severity: string;
  ipHash: string | null;
  userAgent: string | null;
  requestId: string | null;
  details: Record<string, unknown>;
}

export interface ControlPrivilegedActionSummary {
  actorEmail: string | null;
  action: string;
  count: number;
  lastAt: string;
}

export interface ControlSecurityResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  sessions: ControlAdminSession[];
  events: ControlSecurityEvent[];
  privilegedActions: ControlPrivilegedActionSummary[];
  windowDays: number;
}

export interface ControlRunbookExecution {
  id: string;
  runbookId: string;
  runbookName: string | null;
  changeRequestId: string;
  status: string;
  currentStep: number;
  stepResults: Array<Record<string, unknown>>;
  startedAt: string;
  completedAt: string | null;
  executedBy: string;
  approvedBy: string | null;
  error: string | null;
  details: Record<string, unknown>;
}

export interface ControlRunbookExecutionsResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  executions: ControlRunbookExecution[];
}

export interface ControlBackupDrill {
  id: string;
  environment: string;
  backupSource: string;
  restoreTarget: string;
  status: 'planned' | 'running' | 'passed' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  rpoMinutes: number | null;
  rtoMinutes: number | null;
  verifiedTables: number | null;
  verifiedRows: number | null;
  checksum: string | null;
  performedBy: string | null;
  notes: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ControlBackupsResponse {
  generatedAt: string;
  persisted: boolean;
  note: string | null;
  drills: ControlBackupDrill[];
}

/* --------------------------------------------------------------------------
 * Intelligence layer
 * -------------------------------------------------------------------------- */

export type ControlIntelligenceStatus =
  | 'healthy'
  | 'attention'
  | 'degraded'
  | 'no_data'
  | 'not_configured';

export type ControlMetricUnit = 'count' | 'currency' | 'percent' | 'milliseconds';

export type ControlMetricDirection = 'higher_is_bad' | 'higher_is_good' | 'neutral';

export type ControlAnomalySeverity = 'critical' | 'warning' | 'info';

export type ControlAnomalyDirection = 'spike' | 'drop';

export interface ControlMetricPoint {
  date: string;
  value: number;
  complete: boolean;
}

export interface ControlMetricBaseline {
  samples: number;
  mean: number | null;
  median: number | null;
  stddev: number | null;
  mad: number | null;
  min: number | null;
  max: number | null;
  p10: number | null;
  p90: number | null;
}

export interface ControlMetricLatest {
  date: string;
  value: number;
  delta: number | null;
  changePercent: number | null;
  complete: boolean;
}

export type ControlForecastMethod = 'linear_regression' | 'moving_average' | 'insufficient_data';

export interface ControlMetricForecast {
  method: ControlForecastMethod;
  horizonDays: number;
  nextValue: number | null;
  next7dTotal: number | null;
  slopePerDay: number | null;
  r2: number | null;
  confidence: 'low' | 'medium' | 'high' | null;
}

export interface ControlMetricAnomaly {
  id: string;
  metricId: string;
  metricLabel: string;
  date: string;
  observed: number;
  expected: number;
  zScore: number;
  direction: ControlAnomalyDirection;
  severity: ControlAnomalySeverity;
  message: string;
}

export interface ControlIntelligenceMetric {
  id: string;
  label: string;
  source: string;
  unit: ControlMetricUnit;
  direction: ControlMetricDirection;
  observations: number;
  note: string | null;
  points: ControlMetricPoint[];
  baseline: ControlMetricBaseline;
  latest: ControlMetricLatest | null;
  forecast: ControlMetricForecast;
  anomalies: ControlMetricAnomaly[];
}

export interface ControlIntelligenceResponse {
  generatedAt: string;
  windowDays: number;
  baselineDays: number;
  persisted: boolean;
  status: ControlIntelligenceStatus;
  note: string | null;
  summary: {
    metrics: number;
    withData: number;
    anomalies: number;
    critical: number;
    warning: number;
    info: number;
    forecasted: number;
  };
  metrics: ControlIntelligenceMetric[];
  anomalies: ControlMetricAnomaly[];
  notes: string[];
}
