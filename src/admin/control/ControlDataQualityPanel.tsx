import React, { useCallback, useEffect, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import { ControlDataQualityResponse, ControlDataQualityResult } from '../../controlPlane/types';
import { controlFetch } from './controlApi';

const statusLabel: Record<ControlDataQualityResult['status'], string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Failing',
  no_data: 'No data',
  not_configured: 'Not configured',
};

const statusTone = (status: ControlDataQualityResult['status']) => {
  if (status === 'healthy') return 'border-paper text-paper';
  if (status === 'degraded') return 'border-paper-a45 text-paper-a45';
  if (status === 'down') return 'border-paper bg-paper text-ink';
  return 'border-paper-a18 text-paper-a45';
};

export const ControlDataQualityPanel: React.FC = () => {
  const [data, setData] = useState<ControlDataQualityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await controlFetch<ControlDataQualityResponse>('/api/control/data-quality'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Data-quality checks could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAndRecord = async () => {
    setIsRunning(true);
    setNotice(null);
    try {
      const result = await controlFetch<ControlDataQualityResponse>('/api/control/data-quality/run', {
        method: 'POST',
      });
      setData(result);
      setNotice(result.persisted ? 'Checks recorded.' : result.note || 'Checks completed without persistence.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Data-quality run failed.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Data quality</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            Can we <em>trust</em> it
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-8 items-center gap-2 border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.22em] text-paper-a45 transition-colors hover:border-paper hover:text-paper"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.4} />
            Recheck
          </button>
          <button
            type="button"
            onClick={() => void runAndRecord()}
            disabled={isRunning}
            className="inline-flex h-8 items-center gap-2 border border-paper px-3 text-[9px] uppercase tracking-[0.22em] text-paper transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
          >
            <Database className={`h-3 w-3 ${isRunning ? 'animate-pulse' : ''}`} strokeWidth={1.4} />
            {isRunning ? 'Running' : 'Run and record'}
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
      {notice && (
        <div className="mt-6 border-t border-paper-a18 pt-4 text-[12px] leading-relaxed text-paper-a45">
          {notice}
        </div>
      )}

      <div className="mt-2">
        {(data?.checks || []).map((check) => (
          <div key={check.id} className="border-b border-paper-a18 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[62ch]">
                <div className="text-[13px] text-paper">{check.name}</div>
                <p className="mt-2 text-[11px] leading-relaxed text-paper-a45">{check.description}</p>
                <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  {check.id} · {check.severity}
                </div>
              </div>
              <span className={`inline-flex border px-3 py-1.5 text-[9px] uppercase tracking-[0.22em] ${statusTone(check.status)}`}>
                {statusLabel[check.status]}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-paper-a45">
              <span>{check.failingCount} failing</span>
              <span>{check.totalCount} checked</span>
              <span className="normal-case tracking-normal text-paper-a45">{check.message}</span>
            </div>

            {check.samples.length > 0 && (
              <div className="mt-4 border-l border-paper-a18 pl-4">
                {check.samples.slice(0, 5).map((sample, index) => (
                  <div key={index} className="mb-1 break-all font-mono text-[9px] leading-relaxed text-paper-a18">
                    {JSON.stringify(sample)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {!isLoading && (!data || data.checks.length === 0) && !error && (
        <div className="mt-8 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
          No checks ran. Apply migration 0009 and configure Supabase to inspect real rows.
        </div>
      )}

      <div className="mt-8 flex items-center gap-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
        <Database className="h-3 w-3" strokeWidth={1.4} />
        Checks are read-only. Samples are capped and redacted before persistence.
      </div>
    </div>
  );
};
