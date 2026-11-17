import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ControlAuditResponse } from '../../controlPlane/types';
import { controlFetch, formatControlDateTime } from './controlApi';

export const ControlAuditPanel: React.FC = () => {
  const [data, setData] = useState<ControlAuditResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await controlFetch<ControlAuditResponse>('/api/control/audit?limit=100'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit events could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chain = data?.chain;
  const chainValid = chain?.valid ?? false;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Append-only audit chain</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            What was <em>recorded</em>
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-8 items-center gap-2 border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.22em] text-paper-a45 transition-colors hover:border-paper hover:text-paper"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.4} />
          Verify chain
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

      <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 border-b border-paper-a18 pb-6 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="flex items-center gap-3">
          {chainValid ? (
            <ShieldCheck className="h-5 w-5 text-paper" strokeWidth={1.3} />
          ) : (
            <ShieldAlert className="h-5 w-5 text-paper" strokeWidth={1.3} />
          )}
          <div>
            <div className="micro-sm text-paper-a45">Chain state</div>
            <div className="mt-1 text-[13px] text-paper">
              {isLoading ? 'Verifying…' : chainValid ? 'Verified' : 'Unverified or broken'}
            </div>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-paper-a45">
          {chain?.message || 'No chain result yet.'}
          {chain?.brokenAt ? ` Broken at ${chain.brokenAt}.` : ''}
        </p>
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a45 md:text-right">
          {chain?.checked ?? 0} events checked
        </div>
      </div>

      <div className="mt-8">
        <div className="micro-sm text-paper-a45">Recent events</div>
        {!isLoading && (data?.events.length || 0) === 0 && (
          <div className="mt-4 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
            No audit events. Control-plane mutations will append hash-linked records here.
          </div>
        )}
        {(data?.events || []).map((event) => (
          <div key={event.id} className="border-b border-paper-a18 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[62ch]">
                <div className="text-[13px] text-paper">{event.action}</div>
                <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  {event.actorEmail || 'unknown actor'}
                  {event.role ? ` · ${event.role}` : ''}
                  {event.targetType ? ` · ${event.targetType}` : ''}
                  {event.targetId ? ` · ${event.targetId}` : ''}
                </div>
                <div className="mt-2 break-all font-mono text-[9px] leading-relaxed text-paper-a18">
                  hash {event.hash.slice(0, 24)}… ← {event.previousHash?.slice(0, 12) || 'GENESIS'}…
                </div>
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a45 md:text-right">
                {formatControlDateTime(event.occurredAt)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
        <ShieldCheck className="h-3 w-3" strokeWidth={1.4} />
        Events are append-only. The chain verifier recomputes every link.
      </div>
    </div>
  );
};
