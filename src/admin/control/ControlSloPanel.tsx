import React, { useCallback, useEffect, useState } from 'react';
import { Gauge, RefreshCw } from 'lucide-react';
import { ControlSloResponse, ControlSloState } from '../../controlPlane/types';
import { controlFetch, formatControlDateTime } from './controlApi';

const statusLabel: Record<ControlSloState['status'], string> = {
  healthy: 'Within budget',
  at_risk: 'At risk',
  breached: 'Breached',
  no_data: 'No data',
};

const statusTone = (status: ControlSloState['status']) => {
  if (status === 'healthy') return 'border-paper text-paper';
  if (status === 'at_risk') return 'border-paper-a45 text-paper-a45';
  if (status === 'breached') return 'border-paper bg-paper text-ink';
  return 'border-paper-a18 text-paper-a45';
};

const percent = (value: number | null, digits = 2) =>
  value === null ? '—' : `${(value * 100).toFixed(digits)}%`;

export const ControlSloPanel: React.FC = () => {
  const [data, setData] = useState<ControlSloResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await controlFetch<ControlSloResponse>('/api/control/slo'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SLOs could not be read.');
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
          <div className="micro-sm text-paper-a45">Service level objectives</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            What must <em>hold</em>
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

      <div className="mt-2">
        {(data?.slos || []).map((slo) => (
          <div key={slo.id} className="border-b border-paper-a18 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[56ch]">
                <div className="text-[13px] text-paper">{slo.name}</div>
                <p className="mt-2 text-[11px] leading-relaxed text-paper-a45">{slo.description}</p>
                <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  {slo.checkId} · target {percent(slo.target, 3)} / {slo.windowDays}d · {slo.owner}
                </div>
              </div>
              <span className={`inline-flex items-center gap-2 border px-3 py-1.5 text-[9px] uppercase tracking-[0.22em] ${statusTone(slo.status)}`}>
                {statusLabel[slo.status]}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
              <div>
                <div className="micro-sm text-paper-a45">Availability</div>
                <div className="mt-2 font-display text-[clamp(24px,2.6vw,36px)] leading-none">
                  {percent(slo.availability)}
                </div>
              </div>
              <div>
                <div className="micro-sm text-paper-a45">Samples</div>
                <div className="mt-2 font-display text-[clamp(24px,2.6vw,36px)] leading-none">
                  {slo.total}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
                  {slo.good} healthy
                </div>
              </div>
              <div>
                <div className="micro-sm text-paper-a45">Error budget</div>
                <div className="mt-2 font-display text-[clamp(24px,2.6vw,36px)] leading-none">
                  {slo.remainingBudget === null ? '—' : `${Math.round(slo.remainingBudget * 100)}%`}
                </div>
                <div className="mt-2 h-1 w-full bg-paper-a10">
                  <div
                    className="h-1 bg-paper"
                    style={{ width: `${Math.round((slo.remainingBudget ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="micro-sm text-paper-a45">Burn rate</div>
                <div className="mt-2 font-display text-[clamp(24px,2.6vw,36px)] leading-none">
                  {slo.burnRate === null ? '—' : `${slo.burnRate.toFixed(2)}×`}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
                  budget {percent(slo.errorBudget, 2)}
                </div>
              </div>
            </div>

            <div className="mt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
              Window {formatControlDateTime(slo.windowStart)} → {formatControlDateTime(slo.windowEnd)}
            </div>
          </div>
        ))}
      </div>

      {!isLoading && (!data || data.slos.length === 0) && !error && (
        <div className="mt-8 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
          No SLO definitions are available. Apply migration 0009 and run diagnostics to start
          collecting samples.
        </div>
      )}

      <div className="mt-8 flex items-center gap-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
        <Gauge className="h-3 w-3" strokeWidth={1.4} />
        Availability is computed from persisted probe results, not from a synthetic score.
      </div>
    </div>
  );
};
