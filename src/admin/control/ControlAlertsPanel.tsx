import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Check, RefreshCw } from 'lucide-react';
import { ControlAlert, ControlAlertsResponse } from '../../controlPlane/types';
import { controlFetch, formatControlDateTime } from './controlApi';

const severityTone = (severity: string) => {
  if (severity === 'critical') return 'border-paper bg-paper text-ink';
  if (severity === 'warning') return 'border-paper-a45 text-paper-a45';
  return 'border-paper-a18 text-paper-a45';
};

export const ControlAlertsPanel: React.FC = () => {
  const [data, setData] = useState<ControlAlertsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await controlFetch<ControlAlertsResponse>('/api/control/alerts'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Alerts could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const acknowledge = async (alert: ControlAlert) => {
    setBusyId(alert.id);
    try {
      await controlFetch(`/api/control/alerts/${alert.id}/ack`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Alert acknowledgement failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Alert register</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            What needs <em>attention</em>
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
        {!isLoading && (data?.alerts.length || 0) === 0 && (
          <div className="mt-4 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
            No firing or acknowledged alerts. Alerts are created by diagnostics when a probe is
            down or degraded, and resolved when the probe recovers.
          </div>
        )}
        {(data?.alerts || []).map((alert) => (
          <div key={alert.id} className="border-b border-paper-a18 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[60ch]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13px] text-paper">{alert.title}</span>
                  <span className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${severityTone(alert.severity)}`}>
                    {alert.severity}
                  </span>
                  <span className="micro-sm text-paper-a45">{alert.status}</span>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-paper-a45">{alert.message}</p>
                <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  fired {formatControlDateTime(alert.firedAt)} · {alert.serviceId || 'unknown service'} · {alert.checkId || 'unknown check'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void acknowledge(alert)}
                disabled={busyId === alert.id || alert.status === 'acknowledged'}
                className="inline-flex h-9 items-center gap-2 border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.2em] text-paper-a45 transition-colors hover:border-paper hover:text-paper disabled:opacity-40"
              >
                <Check className="h-3 w-3" strokeWidth={1.4} />
                {alert.status === 'acknowledged' ? 'Acknowledged' : busyId === alert.id ? 'Saving' : 'Acknowledge'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
        <Bell className="h-3 w-3" strokeWidth={1.4} />
        Alert state is persisted. Acknowledgement does not resolve the underlying probe.
      </div>
    </div>
  );
};
