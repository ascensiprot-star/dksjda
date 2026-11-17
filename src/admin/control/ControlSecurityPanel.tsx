import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ControlSecurityResponse } from '../../controlPlane/types';
import { controlFetch, formatControlDateTime } from './controlApi';

const severityTone = (severity: string) => {
  if (severity === 'high' || severity === 'critical') return 'border-paper bg-paper text-ink';
  if (severity === 'medium') return 'border-paper-a45 text-paper-a45';
  return 'border-paper-a18 text-paper-a45';
};

const isWithinDay = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= 24 * 60 * 60 * 1000;
};

export const ControlSecurityPanel: React.FC = () => {
  const [data, setData] = useState<ControlSecurityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await controlFetch<ControlSecurityResponse>('/api/control/security'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Security analytics could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeSessions = data?.sessions.filter((session) => session.active).length || 0;
  const deniedToday = data?.events.filter((event) => isWithinDay(event.occurredAt)).length || 0;
  const privilegedTotal =
    data?.privilegedActions.reduce((sum, action) => sum + action.count, 0) || 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Security analytics</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            Who is <em>acting</em>
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

      <section className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-paper-a18 pt-6 md:grid-cols-4">
        <div>
          <div className="micro-sm text-paper-a45">Active sessions</div>
          <div className="mt-2 font-display text-[clamp(28px,3.4vw,46px)] leading-none">
            {activeSessions}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
            Unexpired · not revoked
          </div>
        </div>
        <div>
          <div className="micro-sm text-paper-a45">Denied in 24h</div>
          <div className="mt-2 font-display text-[clamp(28px,3.4vw,46px)] leading-none">
            {deniedToday}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
            Invalid or forbidden access
          </div>
        </div>
        <div>
          <div className="micro-sm text-paper-a45">Privileged actions</div>
          <div className="mt-2 font-display text-[clamp(28px,3.4vw,46px)] leading-none">
            {privilegedTotal}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
            Last {data?.windowDays || 30} days
          </div>
        </div>
        <div>
          <div className="micro-sm text-paper-a45">Observed sessions</div>
          <div className="mt-2 font-display text-[clamp(28px,3.4vw,46px)] leading-none">
            {data?.sessions.length || 0}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
            Recorded by the API
          </div>
        </div>
      </section>

      <section className="mt-14">
        <div className="border-b border-paper-a18 pb-4">
          <div className="micro-sm text-paper-a45">Admin sessions</div>
          <h3 className="mt-2 font-display text-[clamp(22px,2.4vw,34px)] leading-none">
            Observed <em>sessions</em>
          </h3>
        </div>
        {!isLoading && (data?.sessions.length || 0) === 0 && (
          <div className="border-t border-paper-a18 py-5 text-[12px] leading-relaxed text-paper-a45">
            No admin sessions have been observed. Session recording starts with the next
            authenticated control-plane request.
          </div>
        )}
        {(data?.sessions || []).map((session) => (
          <div key={session.sessionId} className="grid grid-cols-1 gap-3 border-b border-paper-a18 py-5 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="truncate text-[12px] text-paper">{session.email}</span>
                <span
                  className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${
                    session.active ? 'border-paper text-paper' : 'border-paper-a18 text-paper-a45'
                  }`}
                >
                  {session.revokedAt ? 'revoked' : session.active ? 'active' : 'expired'}
                </span>
                <span className="micro-sm text-paper-a18">{session.role}</span>
              </div>
              <div className="mt-2 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                {session.sessionId}
              </div>
            </div>
            <div className="text-[11px] text-paper-a45">
              <div>First seen {formatControlDateTime(session.firstSeenAt)}</div>
              <div className="mt-1">Last seen {formatControlDateTime(session.lastSeenAt)}</div>
            </div>
            <div className="text-[11px] text-paper-a45">
              <div>Expires {formatControlDateTime(session.expiresAt)}</div>
              <div className="mt-1 truncate text-paper-a18">{session.userAgent || 'No user agent'}</div>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18 md:text-right">
              {session.ipHash ? session.ipHash.slice(0, 12) : 'no ip hash'}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-14 grid grid-cols-1 gap-10 xl:grid-cols-2">
        <div>
          <div className="flex items-center gap-2 border-b border-paper-a18 pb-4">
            <ShieldAlert className="h-3.5 w-3.5 text-paper-a45" strokeWidth={1.4} />
            <div className="micro-sm text-paper-a45">Denied access</div>
          </div>
          {!isLoading && (data?.events.length || 0) === 0 && (
            <div className="border-t border-paper-a18 py-5 text-[12px] leading-relaxed text-paper-a45">
              No denied access events. An empty log is not proof that no attempts occurred before
              session recording was enabled.
            </div>
          )}
          {(data?.events || []).map((event) => (
            <div key={event.id} className="border-b border-paper-a18 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[12px] text-paper">{event.eventType}</span>
                <span className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${severityTone(event.severity)}`}>
                  {event.severity}
                </span>
                <span className="micro-sm text-paper-a18">{event.outcome}</span>
              </div>
              <div className="mt-2 text-[11px] leading-relaxed text-paper-a45">
                {event.actorEmail || 'unidentified actor'} · {formatControlDateTime(event.occurredAt)}
              </div>
              {event.details?.reason ? (
                <div className="mt-1 text-[10px] leading-relaxed text-paper-a18">
                  {String(event.details.reason)}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center gap-2 border-b border-paper-a18 pb-4">
            <ShieldCheck className="h-3.5 w-3.5 text-paper-a45" strokeWidth={1.4} />
            <div className="micro-sm text-paper-a45">Privileged mutations</div>
          </div>
          {!isLoading && (data?.privilegedActions.length || 0) === 0 && (
            <div className="border-t border-paper-a18 py-5 text-[12px] leading-relaxed text-paper-a45">
              No privileged mutations have been recorded in the audit window.
            </div>
          )}
          {(data?.privilegedActions || []).map((action) => (
            <div key={`${action.actorEmail}-${action.action}`} className="grid grid-cols-[1fr_auto] gap-3 border-b border-paper-a18 py-4">
              <div className="min-w-0">
                <div className="truncate text-[12px] text-paper">{action.action}</div>
                <div className="mt-1 truncate text-[11px] text-paper-a45">
                  {action.actorEmail || 'unknown actor'}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-[22px] leading-none">{action.count}</div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  {formatControlDateTime(action.lastAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 flex items-center gap-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
        <ShieldCheck className="h-3 w-3" strokeWidth={1.4} />
        IP addresses are hashed. Session tokens are never stored.
      </div>
    </div>
  );
};
