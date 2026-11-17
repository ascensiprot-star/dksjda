import { isServiceClient, isSupabaseConfigured, supabase } from '../supabase/config';
import type {
  ControlAnomalyDirection,
  ControlAnomalySeverity,
  ControlIntelligenceMetric,
  ControlIntelligenceResponse,
  ControlIntelligenceStatus,
  ControlMetricAnomaly,
  ControlMetricBaseline,
  ControlMetricDirection,
  ControlMetricForecast,
  ControlMetricPoint,
  ControlMetricUnit,
} from './types';

const DAY_MS = 86_400_000;
const MIN_BASELINE_SAMPLES = 5;
const DETECTION_DAYS = 7;
const ANOMALY_Z_THRESHOLD = 3.5;
const READ_TIMEOUT_MS = 7000;
const EVENT_LIMIT = 50_000;
const ORDER_LIMIT = 10_000;
const HEALTH_LIMIT = 20_000;
const JOB_LIMIT = 5_000;

const EXCLUDED_ORDER_STATUSES = new Set([
  'cancelled',
  'canceled',
  'refunded',
  'failed',
  'void',
]);

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

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const utcDay = (timestampMs: number) => new Date(timestampMs).toISOString().slice(0, 10);

const orderedValues = (values: number[]) => [...values].sort((a, b) => a - b);

const quantile = (sorted: number[], percentile: number): number | null => {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * clamp(percentile, 0, 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

export const computeBaseline = (values: number[]): ControlMetricBaseline => {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) {
    return {
      samples: 0,
      mean: null,
      median: null,
      stddev: null,
      mad: null,
      min: null,
      max: null,
      p10: null,
      p90: null,
    };
  }

  const sorted = orderedValues(clean);
  const n = clean.length;
  const mean = clean.reduce((sum, value) => sum + value, 0) / n;
  const median = quantile(sorted, 0.5) ?? mean;
  const variance =
    n > 1
      ? clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)
      : 0;
  const deviations = orderedValues(clean.map((value) => Math.abs(value - median)));

  return {
    samples: n,
    mean: round(mean),
    median: round(median),
    stddev: round(Math.sqrt(variance)),
    mad: round(quantile(deviations, 0.5) ?? 0),
    min: round(sorted[0]),
    max: round(sorted[n - 1]),
    p10: round(quantile(sorted, 0.1) ?? sorted[0]),
    p90: round(quantile(sorted, 0.9) ?? sorted[n - 1]),
  };
};

export const formatMetricValue = (value: number | null, unit: ControlMetricUnit): string => {
  if (value === null || !Number.isFinite(value)) return '—';
  if (unit === 'currency') return `€${value.toFixed(2)}`;
  if (unit === 'percent') return `${value.toFixed(2)}%`;
  if (unit === 'milliseconds') return `${Math.round(value)} ms`;
  return Number.isInteger(value)
    ? value.toLocaleString('en-US')
    : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

const severityFor = (
  direction: ControlMetricDirection,
  anomalyDirection: ControlAnomalyDirection,
  absoluteZ: number
): ControlAnomalySeverity => {
  const isBadDirection =
    direction === 'higher_is_bad'
      ? anomalyDirection === 'spike'
      : direction === 'higher_is_good'
        ? anomalyDirection === 'drop'
        : true;
  if (!isBadDirection) return 'info';
  return absoluteZ >= 6 ? 'critical' : 'warning';
};

export const evaluateAnomaly = (input: {
  metricId: string;
  metricLabel: string;
  unit: ControlMetricUnit;
  direction: ControlMetricDirection;
  date: string;
  observed: number;
  baselineValues: number[];
}): ControlMetricAnomaly | null => {
  if (input.baselineValues.length < MIN_BASELINE_SAMPLES) return null;
  if (!Number.isFinite(input.observed)) return null;

  const baseline = computeBaseline(input.baselineValues);
  const median = baseline.median;
  if (median === null) return null;

  const sigma =
    baseline.mad !== null && baseline.mad > 0
      ? baseline.mad * 1.4826
      : baseline.stddev ?? 0;

  let zScore = 0;
  if (sigma > 0) {
    zScore = (input.observed - median) / sigma;
  } else if (input.observed !== median) {
    zScore = input.observed > median ? 10 : -10;
  }

  const absoluteZ = Math.abs(zScore);
  if (absoluteZ < ANOMALY_Z_THRESHOLD) return null;

  const anomalyDirection: ControlAnomalyDirection = zScore > 0 ? 'spike' : 'drop';
  const severity = severityFor(input.direction, anomalyDirection, absoluteZ);
  const expected = median;
  const observedText = formatMetricValue(input.observed, input.unit);
  const expectedText = formatMetricValue(expected, input.unit);

  return {
    id: `${input.metricId}:${input.date}`,
    metricId: input.metricId,
    metricLabel: input.metricLabel,
    date: input.date,
    observed: round(input.observed),
    expected: round(expected),
    zScore: round(zScore),
    direction: anomalyDirection,
    severity,
    message: `${input.metricLabel} ${anomalyDirection === 'spike' ? 'rose' : 'fell'} to ${observedText} against a ${baseline.samples}-day median of ${expectedText} (z ${zScore.toFixed(1)}).`,
  };
};

export const forecastSeries = (
  values: number[],
  horizonDays = 7,
  unit: ControlMetricUnit = 'count'
): ControlMetricForecast => {
  const clean = values.filter((value) => Number.isFinite(value));
  const empty: ControlMetricForecast = {
    method: 'insufficient_data',
    horizonDays,
    nextValue: null,
    next7dTotal: null,
    slopePerDay: null,
    r2: null,
    confidence: null,
  };
  if (clean.length < 3) return empty;

  const window = clean.slice(-14);
  const n = window.length;
  const xMean = (n - 1) / 2;
  const yMean = window.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    numerator += (index - xMean) * (window[index] - yMean);
    denominator += (index - xMean) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  let squaredTotal = 0;
  let squaredResidual = 0;
  for (let index = 0; index < n; index += 1) {
    const predicted = intercept + slope * index;
    squaredTotal += (window[index] - yMean) ** 2;
    squaredResidual += (window[index] - predicted) ** 2;
  }
  const r2 = squaredTotal === 0 ? null : 1 - squaredResidual / squaredTotal;

  const clampPrediction = (value: number) => {
    if (unit === 'percent') return clamp(value, 0, 100);
    if (unit === 'milliseconds') return Math.max(0, value);
    return Math.max(0, value);
  };

  const predictions: number[] = [];
  for (let step = 1; step <= horizonDays; step += 1) {
    predictions.push(clampPrediction(intercept + slope * (n - 1 + step)));
  }

  return {
    method: 'linear_regression',
    horizonDays,
    nextValue: round(predictions[0]),
    next7dTotal:
      unit === 'count' || unit === 'currency'
        ? round(predictions.reduce((sum, value) => sum + value, 0))
        : null,
    slopePerDay: round(slope, 4),
    r2: r2 === null ? null : round(r2, 4),
    confidence:
      n >= 14 && r2 !== null && r2 >= 0.4
        ? 'high'
        : n >= 7
          ? 'medium'
          : 'low',
  };
};

interface MetricSpec {
  id: string;
  label: string;
  source: string;
  unit: ControlMetricUnit;
  direction: ControlMetricDirection;
  values: Map<string, number>;
  observations: number;
  includeZeroDays: boolean;
  note?: string;
}

const buildPoints = (
  spec: MetricSpec,
  days: string[],
  today: string
): ControlMetricPoint[] => {
  const points: ControlMetricPoint[] = [];
  for (const date of days) {
    const hasValue = spec.values.has(date);
    if (!hasValue && !spec.includeZeroDays) continue;
    points.push({
      date,
      value: hasValue ? (spec.values.get(date) as number) : 0,
      complete: date !== today,
    });
  }
  return points;
};

const latestPoint = (points: ControlMetricPoint[]): ControlMetricPoint | null => {
  const complete = points.filter((point) => point.complete);
  if (complete.length > 0) return complete[complete.length - 1];
  return points.length > 0 ? points[points.length - 1] : null;
};

const latestFromPoints = (points: ControlMetricPoint[]) => {
  const latest = latestPoint(points);
  if (!latest) return null;
  const previous = points
    .filter((point) => point.complete && point.date < latest.date)
    .slice(-1)[0];
  const delta = previous ? latest.value - previous.value : null;
  return {
    date: latest.date,
    value: round(latest.value),
    delta: delta === null ? null : round(delta),
    changePercent:
      previous && previous.value !== 0 && delta !== null
        ? round((delta / previous.value) * 100)
        : null,
    complete: latest.complete,
  };
};

const findAnomalies = (
  spec: MetricSpec,
  points: ControlMetricPoint[],
  baselineDays: number
): ControlMetricAnomaly[] => {
  const complete = points.filter((point) => point.complete);
  if (complete.length <= MIN_BASELINE_SAMPLES) return [];

  const anomalies: ControlMetricAnomaly[] = [];
  const start = Math.max(MIN_BASELINE_SAMPLES, complete.length - DETECTION_DAYS);
  for (let index = start; index < complete.length; index += 1) {
    const point = complete[index];
    const windowStart = Math.max(0, index - baselineDays);
    const baselineValues = complete
      .slice(windowStart, index)
      .map((entry) => entry.value);
    const anomaly = evaluateAnomaly({
      metricId: spec.id,
      metricLabel: spec.label,
      unit: spec.unit,
      direction: spec.direction,
      date: point.date,
      observed: point.value,
      baselineValues,
    });
    if (anomaly) anomalies.push(anomaly);
  }
  return anomalies;
};

const buildMetric = (
  spec: MetricSpec,
  days: string[],
  today: string,
  baselineDays: number
): ControlIntelligenceMetric => {
  const points = buildPoints(spec, days, today);
  const complete = points.filter((point) => point.complete);
  const baseline = computeBaseline(complete.map((point) => point.value));
  const anomalies = findAnomalies(spec, points, baselineDays);
  const forecast =
    spec.observations === 0
      ? {
          method: 'insufficient_data' as const,
          horizonDays: 7,
          nextValue: null,
          next7dTotal: null,
          slopePerDay: null,
          r2: null,
          confidence: null,
        }
      : forecastSeries(
          complete.map((point) => point.value),
          7,
          spec.unit
        );
  const note =
    spec.note ??
    (spec.observations === 0 ? `${spec.source} returned no rows in this window.` : null);

  return {
    id: spec.id,
    label: spec.label,
    source: spec.source,
    unit: spec.unit,
    direction: spec.direction,
    observations: spec.observations,
    note,
    points,
    baseline,
    latest: latestFromPoints(points),
    forecast,
    anomalies,
  };
};

interface ReadResult<T> {
  rows: T[];
  error: string | null;
}

const readRows = async <T>(
  task: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  label: string
): Promise<ReadResult<T>> => {
  try {
    const result = await withTimeout(task, label);
    if (result.error) return { rows: [], error: result.error.message };
    return {
      rows: Array.isArray(result.data) ? (result.data as T[]) : [],
      error: null,
    };
  } catch (err) {
    return { rows: [], error: errorMessage(err) };
  }
};

interface EventRow {
  type: string | null;
  timestamp: number | string | null;
}

interface OrderRow {
  status: string | null;
  totals: Record<string, unknown> | null;
  createdAt: string | null;
}

interface ProductRow {
  stock: number | null;
  status: string | null;
}

interface HealthRow {
  status: string | null;
  latency_ms: number | null;
  checked_at: string | null;
}

interface JobRow {
  status: string | null;
  started_at: string | null;
}

const emptyResponse = (
  generatedAt: string,
  windowDays: number,
  baselineDays: number,
  note: string,
  status: ControlIntelligenceStatus = 'not_configured'
): ControlIntelligenceResponse => ({
  generatedAt,
  windowDays,
  baselineDays,
  persisted: false,
  status,
  note,
  summary: {
    metrics: 0,
    withData: 0,
    anomalies: 0,
    critical: 0,
    warning: 0,
    info: 0,
    forecasted: 0,
  },
  metrics: [],
  anomalies: [],
  notes: [note],
});

export async function loadIntelligence(options: {
  windowDays?: number;
  baselineDays?: number;
} = {}): Promise<ControlIntelligenceResponse> {
  const generatedAt = new Date().toISOString();
  const windowDays = clamp(Math.round(options.windowDays ?? 30), 7, 90);
  const baselineDays = clamp(Math.round(options.baselineDays ?? 14), 5, 60);

  if (!isSupabaseConfigured || !isServiceClient) {
    return emptyResponse(
      generatedAt,
      windowDays,
      baselineDays,
      'Intelligence requires a configured Supabase server client with the service role.'
    );
  }

  const now = Date.now();
  const sinceMs = now - windowDays * DAY_MS;
  const sinceIso = new Date(sinceMs).toISOString();
  const today = utcDay(now);

  const [eventsResult, ordersResult, productsResult, healthResult, jobsResult] =
    await Promise.all([
      readRows<EventRow>(
        supabase
          .from('events')
          .select('type, timestamp')
          .gte('timestamp', sinceMs)
          .order('timestamp', { ascending: true })
          .limit(EVENT_LIMIT),
        'Event read'
      ),
      readRows<OrderRow>(
        supabase
          .from('orders')
          .select('status, totals, createdAt')
          .order('createdAt', { ascending: false })
          .limit(ORDER_LIMIT),
        'Order read'
      ),
      readRows<ProductRow>(
        supabase.from('products').select('stock, status').limit(10_000),
        'Product read'
      ),
      readRows<HealthRow>(
        supabase
          .from('system_health_results')
          .select('status, latency_ms, checked_at')
          .gte('checked_at', sinceIso)
          .order('checked_at', { ascending: true })
          .limit(HEALTH_LIMIT),
        'Health-result read'
      ),
      readRows<JobRow>(
        supabase
          .from('system_job_runs')
          .select('status, started_at')
          .gte('started_at', sinceIso)
          .order('started_at', { ascending: true })
          .limit(JOB_LIMIT),
        'Job-run read'
      ),
    ]);

  const notes: string[] = [];
  for (const [label, result] of [
    ['Events', eventsResult],
    ['Orders', ordersResult],
    ['Products', productsResult],
    ['Health results', healthResult],
    ['Job runs', jobsResult],
  ] as const) {
    if (result.error) notes.push(`${label}: ${result.error}`);
  }

  const pageViews = new Map<string, number>();
  const errorEvents = new Map<string, number>();
  let pageViewRows = 0;
  let errorRows = 0;

  for (const row of eventsResult.rows) {
    const timestamp = Number(row.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < sinceMs) continue;
    const day = utcDay(timestamp);
    const type = String(row.type || '').toLowerCase();
    if (type === 'page_view') {
      pageViews.set(day, (pageViews.get(day) ?? 0) + 1);
      pageViewRows += 1;
    } else if (type === 'error') {
      errorEvents.set(day, (errorEvents.get(day) ?? 0) + 1);
      errorRows += 1;
    }
  }

  const ordersByDay = new Map<string, number>();
  const revenueByDay = new Map<string, number>();
  let orderRows = 0;

  for (const row of ordersResult.rows) {
    const createdAt = Date.parse(String(row.createdAt || ''));
    if (!Number.isFinite(createdAt) || createdAt < sinceMs) continue;
    const status = String(row.status || '').toLowerCase();
    if (EXCLUDED_ORDER_STATUSES.has(status)) continue;
    const day = utcDay(createdAt);
    ordersByDay.set(day, (ordersByDay.get(day) ?? 0) + 1);
    orderRows += 1;

    const total = Number((row.totals || {}).total);
    if (Number.isFinite(total) && total >= 0) {
      revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + total);
    }
  }

  const conversionByDay = new Map<string, number>();
  for (const [day, views] of pageViews) {
    if (views <= 0) continue;
    conversionByDay.set(day, ((ordersByDay.get(day) ?? 0) / views) * 100);
  }

  const healthSamplesByDay = new Map<string, number>();
  const healthFailuresByDay = new Map<string, number>();
  const healthLatencyByDay = new Map<string, number>();
  const healthLatencyCountByDay = new Map<string, number>();
  let healthRows = 0;
  let latencyRows = 0;

  for (const row of healthResult.rows) {
    const checkedAt = Date.parse(String(row.checked_at || ''));
    if (!Number.isFinite(checkedAt) || checkedAt < sinceMs) continue;
    const status = String(row.status || '').toLowerCase();
    if (!['healthy', 'degraded', 'down'].includes(status)) continue;
    const day = utcDay(checkedAt);
    healthSamplesByDay.set(day, (healthSamplesByDay.get(day) ?? 0) + 1);
    healthRows += 1;
    if (status === 'degraded' || status === 'down') {
      healthFailuresByDay.set(day, (healthFailuresByDay.get(day) ?? 0) + 1);
    }
    const latency = Number(row.latency_ms);
    if (Number.isFinite(latency) && latency >= 0) {
      healthLatencyByDay.set(day, (healthLatencyByDay.get(day) ?? 0) + latency);
      healthLatencyCountByDay.set(day, (healthLatencyCountByDay.get(day) ?? 0) + 1);
      latencyRows += 1;
    }
  }

  const probeFailureRateByDay = new Map<string, number>();
  for (const [day, samples] of healthSamplesByDay) {
    if (samples <= 0) continue;
    probeFailureRateByDay.set(day, ((healthFailuresByDay.get(day) ?? 0) / samples) * 100);
  }

  const healthLatencyAvgByDay = new Map<string, number>();
  for (const [day, total] of healthLatencyByDay) {
    const count = healthLatencyCountByDay.get(day) ?? 0;
    if (count > 0) healthLatencyAvgByDay.set(day, total / count);
  }

  const jobFailuresByDay = new Map<string, number>();
  let jobRunRows = 0;
  let jobFailureRows = 0;
  for (const row of jobsResult.rows) {
    const startedAt = Date.parse(String(row.started_at || ''));
    if (!Number.isFinite(startedAt) || startedAt < sinceMs) continue;
    const day = utcDay(startedAt);
    jobRunRows += 1;
    const status = String(row.status || '').toLowerCase();
    if (status === 'failed' || status === 'error' || status === 'timeout') {
      jobFailuresByDay.set(day, (jobFailuresByDay.get(day) ?? 0) + 1);
      jobFailureRows += 1;
    }
  }

  let lowStockCount = 0;
  let productRows = 0;
  for (const row of productsResult.rows) {
    const stock = Number(row.stock);
    if (!Number.isFinite(stock)) continue;
    productRows += 1;
    if (stock < 4 && String(row.status || '').toLowerCase() === 'live') {
      lowStockCount += 1;
    }
  }

  const days: string[] = [];
  for (let index = windowDays - 1; index >= 0; index -= 1) {
    days.push(utcDay(now - index * DAY_MS));
  }

  const specs: MetricSpec[] = [
    {
      id: 'page_views',
      label: 'Page views',
      source: 'events.page_view',
      unit: 'count',
      direction: 'higher_is_good',
      values: pageViews,
      observations: pageViewRows,
      includeZeroDays: true,
    },
    {
      id: 'orders',
      label: 'Orders',
      source: 'orders excluding cancelled / refunded',
      unit: 'count',
      direction: 'higher_is_good',
      values: ordersByDay,
      observations: orderRows,
      includeZeroDays: true,
    },
    {
      id: 'revenue',
      label: 'Revenue',
      source: 'orders.totals.total',
      unit: 'currency',
      direction: 'higher_is_good',
      values: revenueByDay,
      observations: orderRows,
      includeZeroDays: true,
    },
    {
      id: 'conversion_rate',
      label: 'Conversion rate',
      source: 'orders ÷ events.page_view',
      unit: 'percent',
      direction: 'higher_is_good',
      values: conversionByDay,
      observations: conversionByDay.size,
      includeZeroDays: false,
    },
    {
      id: 'error_events',
      label: 'Client error events',
      source: 'events.error',
      unit: 'count',
      direction: 'higher_is_bad',
      values: errorEvents,
      observations: errorRows,
      includeZeroDays: true,
    },
    {
      id: 'probe_failure_rate',
      label: 'Probe failure rate',
      source: 'system_health_results degraded + down',
      unit: 'percent',
      direction: 'higher_is_bad',
      values: probeFailureRateByDay,
      observations: healthRows,
      includeZeroDays: false,
    },
    {
      id: 'health_latency',
      label: 'Probe latency',
      source: 'system_health_results.latency_ms',
      unit: 'milliseconds',
      direction: 'higher_is_bad',
      values: healthLatencyAvgByDay,
      observations: latencyRows,
      includeZeroDays: false,
    },
    {
      id: 'job_failures',
      label: 'Job failures',
      source: 'system_job_runs failed / error / timeout',
      unit: 'count',
      direction: 'higher_is_bad',
      values: jobFailuresByDay,
      observations: jobRunRows,
      includeZeroDays: true,
    },
    {
      id: 'low_stock',
      label: 'Low-stock live products',
      source: 'products.stock < 4',
      unit: 'count',
      direction: 'higher_is_bad',
      values: new Map([[today, lowStockCount]]),
      observations: productRows,
      includeZeroDays: false,
      note:
        'Current inventory snapshot only. A historical low-stock series is not stored yet, so this metric has no anomaly baseline.',
    },
  ];

  const metrics = specs.map((spec) => buildMetric(spec, days, today, baselineDays));
  const anomalies = metrics
    .flatMap((metric) => metric.anomalies)
    .sort((a, b) => {
      const severityOrder: Record<ControlAnomalySeverity, number> = {
        critical: 3,
        warning: 2,
        info: 1,
      };
      const severityDelta = severityOrder[b.severity] - severityOrder[a.severity];
      return severityDelta !== 0 ? severityDelta : b.date.localeCompare(a.date);
    });

  const critical = anomalies.filter((anomaly) => anomaly.severity === 'critical').length;
  const warning = anomalies.filter((anomaly) => anomaly.severity === 'warning').length;
  const info = anomalies.filter((anomaly) => anomaly.severity === 'info').length;
  const withData = metrics.filter((metric) => metric.observations > 0).length;
  const forecasted = metrics.filter((metric) => metric.forecast.nextValue !== null).length;

  const status: ControlIntelligenceStatus =
    withData === 0
      ? 'no_data'
      : critical > 0
        ? 'degraded'
        : warning > 0 || info > 0
          ? 'attention'
          : 'healthy';

  if (eventsResult.rows.length >= EVENT_LIMIT) {
    notes.push(`Event read was capped at ${EVENT_LIMIT} rows; shorten the window for full coverage.`);
  }
  if (ordersResult.rows.length >= ORDER_LIMIT) {
    notes.push(`Order read was capped at ${ORDER_LIMIT} rows; shorten the window for full coverage.`);
  }
  if (healthResult.rows.length >= HEALTH_LIMIT) {
    notes.push(`Health-result read was capped at ${HEALTH_LIMIT} rows; shorten the window for full coverage.`);
  }
  if (withData === 0) {
    notes.push('No measured source rows exist in this window. Intelligence stays in no-data until real activity arrives.');
  }
  if (lowStockCount > 0) {
    notes.push(`${lowStockCount} live product${lowStockCount === 1 ? '' : 's'} are below the low-stock threshold of four units.`);
  }
  notes.push('Baselines use complete UTC days; today is excluded from anomaly scoring.');
  notes.push('Intelligence is computed on request from live rows. No baseline or forecast is written back.');

  return {
    generatedAt,
    windowDays,
    baselineDays,
    persisted: false,
    status,
    note: notes.filter((note) => note.startsWith('Events:') || note.startsWith('Orders:') || note.startsWith('Products:') || note.startsWith('Health results:') || note.startsWith('Job runs:') || note.includes('capped')).join(' ') || null,
    summary: {
      metrics: metrics.length,
      withData,
      anomalies: anomalies.length,
      critical,
      warning,
      info,
      forecasted,
    },
    metrics,
    anomalies,
    notes,
  };
}
