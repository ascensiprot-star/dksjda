import React, { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { ControlHistoryResponse, ControlHistorySeries } from '../../controlPlane/types';
import { controlFetch, formatControlLatency, formatControlTime } from './controlApi';

const bucketTone = (series: ControlHistorySeries['buckets'][number]) => {
  if (series.total === 0) return 'bg-paper-a06';
  if (series.down > 0) return 'bg-paper';
  if (series.degraded > 0) return 'bg-paper-a64';
  if (series.notConfigured > 0) return 'bg-paper-a18';
  if (series.noData > 0) return 'bg-paper-a10';
  return 'bg-paper-a45';
};

const bucketLabel = (series: ControlHistorySeries['buckets'][number]) =>
  `${new Date(series.start).toLocaleString()} · healthy ${series.healthy} · degraded ${series.degraded} · down ${series.down} · unconfigured ${series.notConfigured} · no data ${series.noData} · avg ${formatControlLatency(series.avgLatencyMs)}`;

export const ControlHistoryPanel: React.FC = () => {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<ControlHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (range: number) => {
    setIsLoading(true);
    try {
      const response = await controlFetch<ControlHistoryResponse>(
        `/api/control/history?hours=${range}`
      );
      setData(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'History could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(hours);
  }, [hours, load]);

  const series = (data?.series || []).filter((entry) => entry.buckets.length > 0);
  const emptySeries = (data?.series || []).filter((entry) => entry.buckets.length === 0);
  const totalSamples = series.reduce(
    (sum, entry) => sum + entry.buckets.reduce((inner, bucket) => inner + bucket.total, 0),
    0
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Persisted probe history</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            What <em>happened</em>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {[6, 24, 72].map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setHours(range)}
              className={`h-8 border px-3 text-[9px] uppercase tracking-[0.22em] transition-colors ${
                hours === range
                  ? 'border-paper bg-paper text-ink'
                  : 'border-paper-a18 text-paper-a45 hover:border-paper hover:text-paper'
              }`}
            >
              {range}h
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load(hours)}
            className="inline-flex h-8 items-center gap-2 border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.22em] text-paper-a45 transition-colors hover:border-paper hover:text-paper"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.4} />
            Refresh
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

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a45">
        <span className="flex items-center gap-2"><span className="h-2 w-3 bg-paper-a45" /> healthy</span>
        <span className="flex items-center gap-2"><span className="h-2 w-3 bg-paper-a64" /> degraded</span>
        <span className="flex items-center gap-2"><span className="h-2 w-3 bg-paper" /> down</span>
        <span className="flex items-center gap-2"><span className="h-2 w-3 bg-paper-a18" /> unconfigured</span>
        <span className="flex items-center gap-2"><span className="h-2 w-3 bg-paper-a10" /> no data</span>
        <span className="ml-auto font-mono normal-case tracking-[0.08em]">
          {totalSamples} samples · {series.length} probes
        </span>
      </div>

      {!isLoading && series.length === 0 && (
        <div className="mt-8 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
          No persisted samples in this window. Run diagnostics from the overview, or let the
          scheduled probe write results after migration 0009 and the Supabase environment are set.
        </div>
      )}

      <div className="mt-2">
        {series.map((entry) => {
          const latest = entry.buckets[entry.buckets.length - 1];
          return (
            <div key={entry.checkId} className="border-b border-paper-a18 py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <div className="text-[12px] text-paper">{entry.name}</div>
                  <div className="micro-sm mt-1 text-paper-a45">
                    {entry.checkId} · {entry.serviceId}
                  </div>
                </div>
                <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a45">
                  latest {formatControlTime(latest?.start || null)} · avg {formatControlLatency(latest?.avgLatencyMs ?? null)}
                </div>
              </div>
              <div className="mt-4 flex h-9 items-stretch gap-[2px]">
                {entry.buckets.map((bucket) => (
                  <div
                    key={bucket.start}
                    title={bucketLabel(bucket)}
                    className={`min-w-[2px] flex-1 ${bucketTone(bucket)}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {emptySeries.length > 0 && (
        <div className="mt-8 border-t border-paper-a18 pt-4">
          <div className="micro-sm text-paper-a45">No samples yet</div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {emptySeries.map((entry) => (
              <span key={entry.checkId} className="font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                {entry.checkId}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center gap-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
        <Activity className="h-3 w-3" strokeWidth={1.4} />
        History is written only by diagnostics or the scheduled probe.
      </div>
    </div>
  );
};
