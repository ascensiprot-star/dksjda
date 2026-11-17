import React, { useCallback, useEffect, useState } from 'react';
import { Power, RefreshCw } from 'lucide-react';
import { ControlFeatureFlag, ControlFlagsResponse } from '../../controlPlane/types';
import { controlFetch, formatControlDateTime } from './controlApi';

export const ControlFlagsPanel: React.FC = () => {
  const [data, setData] = useState<ControlFlagsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await controlFetch<ControlFlagsResponse>('/api/control/flags'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feature flags could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (flag: ControlFeatureFlag) => {
    setBusyKey(flag.key);
    setNotice(null);
    try {
      const updated = await controlFetch<ControlFeatureFlag>(`/api/control/flags/${flag.key}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !flag.enabled }),
      });
      setData((current) =>
        current
          ? {
              ...current,
              flags: current.flags.map((entry) => (entry.key === updated.key ? updated : entry)),
            }
          : current
      );
      setNotice(`${updated.name} is now ${updated.enabled ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Feature-flag update failed.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Operational switches</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            What is <em>allowed</em>
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
      {notice && (
        <div className="mt-6 border-t border-paper-a18 pt-4 text-[12px] leading-relaxed text-paper-a45">
          {notice}
        </div>
      )}

      <div className="mt-2">
        {!isLoading && (data?.flags.length || 0) === 0 && (
          <div className="mt-4 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
            No feature flags. Apply migration 0010 to seed the operational switches.
          </div>
        )}
        {(data?.flags || []).map((flag) => (
          <div key={flag.key} className="border-b border-paper-a18 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[62ch]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13px] text-paper">{flag.name}</span>
                  <span className="micro-sm text-paper-a18">{flag.key}</span>
                  <span
                    className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${
                      flag.enabled ? 'border-paper text-paper' : 'border-paper-a18 text-paper-a45'
                    }`}
                  >
                    {flag.enabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-paper-a45">{flag.description}</p>
                <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  rollout {flag.rolloutPercent}% · {flag.environments.join(' · ') || 'all environments'}
                  {flag.updatedAt ? ` · updated ${formatControlDateTime(flag.updatedAt)}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void toggle(flag)}
                disabled={busyKey === flag.key}
                className={`inline-flex h-9 items-center gap-2 border px-3 text-[9px] uppercase tracking-[0.2em] transition-colors disabled:opacity-40 ${
                  flag.enabled
                    ? 'border-paper text-paper hover:bg-paper hover:text-ink'
                    : 'border-paper-a18 text-paper-a45 hover:border-paper hover:text-paper'
                }`}
              >
                <Power className="h-3 w-3" strokeWidth={1.4} />
                {busyKey === flag.key ? 'Saving' : flag.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
        <Power className="h-3 w-3" strokeWidth={1.4} />
        Only explicit disables stop traffic. An unavailable flag service fails open.
      </div>
    </div>
  );
};
