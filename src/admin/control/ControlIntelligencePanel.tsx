import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import {
  ControlIntelligenceMetric,
  ControlIntelligenceResponse,
  ControlIntelligenceStatus,
  ControlMetricAnomaly,
  ControlMetricUnit,
} from '../../controlPlane/types';
import { controlFetch } from './controlApi';

const STATUS_LABEL: Record<ControlIntelligenceStatus, string> = {
  healthy: 'Within baseline',
  attention: 'Needs attention',
  degraded: 'Anomalous',
  no_data: 'No data',
  not_configured: 'Not configured',
};

const statusTone = (status: ControlIntelligenceStatus) => {
  if (status === 'healthy') return 'border-paper text-paper';
  if (status === 'attention') return 'border-paper-a45 text-paper-a45';
  if (status === 'degraded') return 'border-paper bg-paper text-ink';
  return 'border-paper-a18 text-paper-a45';
};

const severityTone = (severity: ControlMetricAnomaly['severity']) => {
  if (severity === 'critical') return 'border-paper bg-paper text-ink';
  if (severity === 'warning') return 'border-paper-a45 text-paper-a45';
  return 'border-paper-a18 text-paper-a45';
};

const formatValue = (value: number | null, unit: ControlMetricUnit) => {
  if (value === null || !Number.isFinite(value)) return '—';
  if (unit === 'currency') return `€${value.toFixed(2)}`;
  if (unit === 'percent') return `${value.toFixed(2)}%`;
  if (unit === 'milliseconds') return `${Math.round(value)} ms`;
  return Number.isInteger(value)
    ? value.toLocaleString('en-US')
    : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

const formatDate = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date);
};

const sparkline = (metric: ControlIntelligenceMetric) => {
  const points = metric.points.slice(-30);
  const max = Math.max(1, ...points.map((point) => Math.abs(point.value)));
  return (
    <div className="mt-4 flex h-10 items-end gap-[2px]" aria-label={`${metric.label} history`}>
      {points.map((point) => (
        <div
          key={point.date}
          title={`${point.date} · ${formatValue(point.value, metric.unit)}${point.complete ? '' : ' · partial'}`}
          className={`min-w-[2px] flex-1 ${point.complete ? 'bg-paper-a45' : 'bg-paper-a18'}`}
          style={{ height: `${Math.max(2, (Math.abs(point.value) / max) * 100)}%` }}
        />
      ))}
    </div>
  );
};

export const ControlIntelligencePanel: React.FC = () => {
  const [data, setData] = useState<ControlIntelligenceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(
        await controlFetch<ControlIntelligenceResponse>(
          '/api/control/intelligence?days=30&baselineDays=14'
        )
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Intelligence could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const status = data?.status ?? 'no_data';

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Intelligence</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            What is <em>changing</em>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-8 items-center border px-3 text-[9px] uppercase tracking-[0.22em] ${statusTone(status)}`}
          >
            {STATUS_LABEL[status]}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-8 items-center gap-2 border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.22em] text-paper-a45 transition-colors hover:border-paper hover:text-paper"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.4} />
            Recompute
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-6 border-t border-paper-a18 pt-4 text-[12px] leading-relaxed text-paper-a45">
          {error}
        </div>
      )}

      {data?.note && (
        <div className="mt-6 border-t border-paper-a18 pt-4 text-[12px] leading-relaxed text-paper-a45">
          {data.note}
        </div>
      )}

      {data && (
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-5 border-b border-paper-a18 py-6 md:grid-cols-4">
          <div>
            <div className="micro-sm text-paper-a45">Measured</div>
            <div className="mt-2 font-display text-[clamp(24px,2.6vw,36px)] leading-none">
              {data.summary.withData}/{data.summary.metrics}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
              metrics with rows
            </div>
          </div>
          <div>
            <div className="micro-sm text-paper-a45">Anomalies</div>
            <div className="mt-2 font-display text-[clamp(24px,2.6vw,36px)] leading-none">
              {data.summary.anomalies}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
              {data.summary.critical} critical · {data.summary.warning} warning
            </div>
          </div>
          <div>
            <div className="micro-sm text-paper-a45">Forecastable</div>
            <div className="mt-2 font-display text-[clamp(24px,2.6vw,36px)] leading-none">
              {data.summary.forecasted}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
              metrics with 3+ days
            </div>
          </div>
          <div>
            <div className="micro-sm text-paper-a45">Window / baseline</div>
            <div className="mt-2 font-display text-[clamp(24px,2.6vw,36px)] leading-none">
              {data.windowDays}d
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
              {data.baselineDays}-day rolling baseline
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="border-b border-paper-a18 py-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-paper-a45" strokeWidth={1.4} />
            <div className="micro-sm text-paper-a45">Detected anomalies</div>
          </div>
          {data.anomalies.length === 0 ? (
            <p className="mt-4 max-w-[70ch] text-[12px] leading-relaxed text-paper-a45">
              No measured series crossed the 3.5σ threshold in the detection window. This means the
              series stayed inside its baseline, not that the store is guaranteed healthy.
            </p>
          ) : (
            <div className="mt-2">
              {data.anomalies.map((anomaly) => (
                <div
                  key={anomaly.id}
                  className="flex flex-wrap items-start justify-between gap-4 border-b border-paper-a18 py-5 last:border-0"
                >
                  <div className="max-w-[72ch]">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[13px] text-paper">{anomaly.metricLabel}</span>
                      <span
                        className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[8px] uppercase tracking-[0.2em] ${severityTone(anomaly.severity)}`}
                      >
                        {anomaly.direction === 'spike' ? (
                          <TrendingUp className="h-3 w-3" strokeWidth={1.4} />
                        ) : (
                          <TrendingDown className="h-3 w-3" strokeWidth={1.4} />
                        )}
                        {anomaly.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-paper-a45">
                      {anomaly.message}
                    </p>
                    <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                      {anomaly.date} · observed {anomaly.observed} · expected {anomaly.expected} · z{' '}
                      {anomaly.zScore}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-2">
        {(data?.metrics || []).map((metric) => (
          <div key={metric.id} className="border-b border-paper-a18 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[58ch]">
                <div className="text-[13px] text-paper">{metric.label}</div>
                <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  {metric.source} · {metric.observations} source rows
                </div>
                {metric.note && (
                  <p className="mt-2 text-[11px] leading-relaxed text-paper-a45">{metric.note}</p>
                )}
              </div>
              <div className="text-right">
                <div className="micro-sm text-paper-a45">
                  {metric.latest?.complete === false ? 'Latest snapshot' : 'Latest complete'}
                </div>
                <div className="mt-1 font-display text-[clamp(24px,2.8vw,38px)] leading-none">
                  {formatValue(metric.latest?.value ?? null, metric.unit)}
                </div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  {metric.latest ? formatDate(metric.latest.date) : 'No complete day'}
                  {metric.latest?.changePercent !== null &&
                  metric.latest?.changePercent !== undefined
                    ? ` · ${metric.latest.changePercent > 0 ? '+' : ''}${metric.latest.changePercent.toFixed(1)}%`
                    : ''}
                </div>
              </div>
            </div>

            {sparkline(metric)}

            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              <div>
                <div className="micro-sm text-paper-a45">Median</div>
                <div className="mt-1 font-mono text-[11px] text-paper">
                  {formatValue(metric.baseline.median, metric.unit)}
                </div>
              </div>
              <div>
                <div className="micro-sm text-paper-a45">P10 – P90</div>
                <div className="mt-1 font-mono text-[11px] text-paper">
                  {formatValue(metric.baseline.p10, metric.unit)} –{' '}
                  {formatValue(metric.baseline.p90, metric.unit)}
                </div>
              </div>
              <div>
                <div className="micro-sm text-paper-a45">Baseline samples</div>
                <div className="mt-1 font-mono text-[11px] text-paper">
                  {metric.baseline.samples} complete days
                </div>
              </div>
              <div>
                <div className="micro-sm text-paper-a45">Next day</div>
                <div className="mt-1 font-mono text-[11px] text-paper">
                  {metric.forecast.nextValue === null
                    ? 'Insufficient history'
                    : `${formatValue(metric.forecast.nextValue, metric.unit)} · ${metric.forecast.confidence ?? 'low'} confidence`}
                </div>
                {metric.forecast.next7dTotal !== null &&
                  (metric.unit === 'count' || metric.unit === 'currency') && (
                    <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                      7-day total {formatValue(metric.forecast.next7dTotal, metric.unit)}
                    </div>
                  )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!isLoading && !data && !error && (
        <div className="mt-8 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
          No intelligence data is available yet. The layer needs real events, orders or probe
          results before it can establish a baseline.
        </div>
      )}

      {data?.notes && data.notes.length > 0 && (
        <div className="mt-8 border-t border-paper-a18 pt-4">
          <div className="micro-sm text-paper-a45">Method</div>
          <ul className="mt-3 space-y-1.5">
            {data.notes.map((note) => (
              <li key={note} className="text-[11px] leading-relaxed text-paper-a45">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 flex items-center gap-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
        <Sparkles className="h-3 w-3" strokeWidth={1.4} />
        Baselines are computed from live rows. No baseline or forecast is written back.
      </div>
    </div>
  );
};
