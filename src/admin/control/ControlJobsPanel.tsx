import React, { useCallback, useEffect, useState } from 'react';
import { Boxes, RefreshCw } from 'lucide-react';
import { ControlJobsResponse } from '../../controlPlane/types';
import { controlFetch, formatControlDateTime, formatControlLatency } from './controlApi';

const statusTone = (status: string) => {
  if (status === 'completed') return 'border-paper text-paper';
  if (status === 'failed' || status === 'dead_lettered') return 'border-paper bg-paper text-ink';
  if (status === 'running') return 'border-paper-a45 text-paper-a45';
  return 'border-paper-a18 text-paper-a45';
};

export const ControlJobsPanel: React.FC = () => {
  const [data, setData] = useState<ControlJobsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await controlFetch<ControlJobsResponse>('/api/control/jobs'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Jobs could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Durable job register</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            What <em>ran</em>
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-8 items-center gap-2 border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.22em] text-paper-a45 transition-colors hover:border-paper hover:text-paper"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.4} />
          Refresh
        </button>
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

      <div className="mt-8">
        <div className="micro-sm text-paper-a45">Job definitions</div>
        {!isLoading && (data?.definitions.length || 0) === 0 && (
          <div className="mt-4 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
            No job definitions. Apply migration 0010 to seed the video-generation job.
          </div>
        )}
        {(data?.definitions || []).map((definition) => (
          <div
            key={definition.id}
            className="grid grid-cols-1 gap-3 border-b border-paper-a18 py-5 md:grid-cols-[1.2fr_1fr_auto] md:items-center"
          >
            <div>
              <div className="text-[13px] text-paper">{definition.name}</div>
              <div className="micro-sm mt-1 text-paper-a18">{definition.id}</div>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a45">
              {definition.serviceId || 'unassigned'} · timeout {definition.timeoutSeconds}s ·{' '}
              {definition.maxAttempts} attempt{definition.maxAttempts === 1 ? '' : 's'}
            </div>
            <span className="inline-flex border border-paper-a18 px-2 py-1 text-[9px] uppercase tracking-[0.2em] text-paper-a45">
              {definition.enabled ? 'enabled' : 'disabled'}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <div className="micro-sm text-paper-a45">Recent runs</div>
        {!isLoading && (data?.runs.length || 0) === 0 && (
          <div className="mt-4 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
            No job runs recorded. A video generation request will create the first durable run.
          </div>
        )}
        {(data?.runs || []).map((run) => (
          <div key={run.id} className="border-b border-paper-a18 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[62ch]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13px] text-paper">{run.jobId}</span>
                  <span className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${statusTone(run.status)}`}>
                    {run.status}
                  </span>
                  <span className="micro-sm text-paper-a45">attempt {run.attempt}</span>
                </div>
                <div className="mt-2 break-all font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  {run.id}
                </div>
                {run.error && (
                  <p className="mt-2 text-[11px] leading-relaxed text-paper-a45">{run.error}</p>
                )}
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a45 md:text-right">
                <div>{formatControlDateTime(run.startedAt)}</div>
                <div className="mt-1">{formatControlLatency(run.durationMs)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
        <Boxes className="h-3 w-3" strokeWidth={1.4} />
        Video operations are persisted here before the provider finishes.
      </div>
    </div>
  );
};
