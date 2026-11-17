import React, { useCallback, useEffect, useState } from 'react';
import { ArchiveRestore, Plus, RefreshCw } from 'lucide-react';
import { ControlBackupDrill, ControlBackupsResponse } from '../../controlPlane/types';
import { controlFetch, formatControlDateTime } from './controlApi';

const statusTone = (status: ControlBackupDrill['status']) => {
  if (status === 'passed') return 'border-paper text-paper';
  if (status === 'failed') return 'border-paper bg-paper text-ink';
  if (status === 'running') return 'border-paper-a45 text-paper-a45';
  return 'border-paper-a18 text-paper-a45';
};

const toIso = (value: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const optionalNumber = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const ControlBackupsPanel: React.FC = () => {
  const [data, setData] = useState<ControlBackupsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [environment, setEnvironment] = useState('production');
  const [backupSource, setBackupSource] = useState('supabase nightly backup');
  const [restoreTarget, setRestoreTarget] = useState('isolated drill project');
  const [status, setStatus] = useState<ControlBackupDrill['status']>('planned');
  const [startedAt, setStartedAt] = useState('');
  const [completedAt, setCompletedAt] = useState('');
  const [rpoMinutes, setRpoMinutes] = useState('');
  const [rtoMinutes, setRtoMinutes] = useState('');
  const [verifiedTables, setVerifiedTables] = useState('');
  const [verifiedRows, setVerifiedRows] = useState('');
  const [checksum, setChecksum] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await controlFetch<ControlBackupsResponse>('/api/control/backups'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup drills could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recordDrill = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!environment.trim() || !backupSource.trim() || !restoreTarget.trim()) {
      setNotice('Environment, backup source and restore target are required.');
      return;
    }
    setIsSubmitting(true);
    setNotice(null);
    try {
      await controlFetch('/api/control/backups', {
        method: 'POST',
        body: JSON.stringify({
          environment,
          backupSource,
          restoreTarget,
          status,
          startedAt: toIso(startedAt),
          completedAt: toIso(completedAt),
          rpoMinutes: optionalNumber(rpoMinutes),
          rtoMinutes: optionalNumber(rtoMinutes),
          verifiedTables: optionalNumber(verifiedTables),
          verifiedRows: optionalNumber(verifiedRows),
          checksum,
          notes,
        }),
      });
      setNotice('Backup drill recorded. Only measured values were stored.');
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Backup drill could not be recorded.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (drill: ControlBackupDrill, next: ControlBackupDrill['status']) => {
    setBusyId(drill.id);
    setNotice(null);
    try {
      await controlFetch(`/api/control/backups/${drill.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: next,
          completedAt: next === 'passed' || next === 'failed' ? new Date().toISOString() : undefined,
        }),
      });
      setNotice(`Backup drill marked ${next}.`);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Backup drill update failed.');
    } finally {
      setBusyId(null);
    }
  };

  const latestPassed = data?.drills.find((drill) => drill.status === 'passed') || null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Backup and restore</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            What <em>survives</em>
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

      <section className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-paper-a18 pt-6 md:grid-cols-4">
        <div>
          <div className="micro-sm text-paper-a45">Recorded drills</div>
          <div className="mt-2 font-display text-[clamp(28px,3.4vw,46px)] leading-none">
            {data?.drills.length || 0}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
            All environments
          </div>
        </div>
        <div>
          <div className="micro-sm text-paper-a45">Last passed</div>
          <div className="mt-2 text-[12px] leading-relaxed text-paper">
            {latestPassed ? formatControlDateTime(latestPassed.completedAt) : 'Never recorded'}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
            A pass requires a recorded drill
          </div>
        </div>
        <div>
          <div className="micro-sm text-paper-a45">Last RPO</div>
          <div className="mt-2 text-[12px] leading-relaxed text-paper">
            {latestPassed?.rpoMinutes === null || latestPassed?.rpoMinutes === undefined
              ? 'Not measured'
              : `${latestPassed.rpoMinutes} min`}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
            Recovery point objective
          </div>
        </div>
        <div>
          <div className="micro-sm text-paper-a45">Last RTO</div>
          <div className="mt-2 text-[12px] leading-relaxed text-paper">
            {latestPassed?.rtoMinutes === null || latestPassed?.rtoMinutes === undefined
              ? 'Not measured'
              : `${latestPassed.rtoMinutes} min`}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
            Recovery time objective
          </div>
        </div>
      </section>

      <section className="mt-14">
        <div className="border-b border-paper-a18 pb-4">
          <div className="micro-sm text-paper-a45">Drill register</div>
          <h3 className="mt-2 font-display text-[clamp(22px,2.4vw,34px)] leading-none">
            Restore <em>history</em>
          </h3>
        </div>
        {!isLoading && (data?.drills.length || 0) === 0 && (
          <div className="border-t border-paper-a18 py-5 text-[12px] leading-relaxed text-paper-a45">
            No backup or restore drills are recorded. The absence of a failed drill is not evidence
            that a restore would succeed.
          </div>
        )}
        {(data?.drills || []).map((drill) => (
          <div key={drill.id} className="border-b border-paper-a18 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[64ch]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13px] text-paper">{drill.environment}</span>
                  <span className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${statusTone(drill.status)}`}>
                    {drill.status}
                  </span>
                </div>
                <div className="mt-2 text-[11px] leading-relaxed text-paper-a45">
                  {drill.backupSource} → {drill.restoreTarget}
                </div>
                <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  {formatControlDateTime(drill.startedAt)} · {drill.performedBy || 'unknown operator'}
                  {drill.checksum ? ` · ${drill.checksum.slice(0, 24)}` : ' · no checksum'}
                </div>
                {drill.notes && (
                  <div className="mt-2 text-[11px] leading-relaxed text-paper-a45">{drill.notes}</div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {drill.status === 'planned' && (
                  <button
                    type="button"
                    onClick={() => void updateStatus(drill, 'running')}
                    disabled={busyId === drill.id}
                    className="inline-flex h-9 items-center border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.2em] text-paper-a45 hover:border-paper hover:text-paper disabled:opacity-40"
                  >
                    Start
                  </button>
                )}
                {drill.status === 'running' && (
                  <>
                    <button
                      type="button"
                      onClick={() => void updateStatus(drill, 'passed')}
                      disabled={busyId === drill.id}
                      className="inline-flex h-9 items-center border border-paper px-3 text-[9px] uppercase tracking-[0.2em] text-paper hover:bg-paper hover:text-ink disabled:opacity-40"
                    >
                      Pass
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateStatus(drill, 'failed')}
                      disabled={busyId === drill.id}
                      className="inline-flex h-9 items-center border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.2em] text-paper-a45 hover:border-paper hover:text-paper disabled:opacity-40"
                    >
                      Fail
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-paper-a18 pt-3 text-[10px] uppercase tracking-[0.12em] text-paper-a18 sm:grid-cols-4">
              <span>RPO {drill.rpoMinutes === null ? '—' : `${drill.rpoMinutes} min`}</span>
              <span>RTO {drill.rtoMinutes === null ? '—' : `${drill.rtoMinutes} min`}</span>
              <span>
                {drill.verifiedTables === null ? '—' : drill.verifiedTables} tables verified
              </span>
              <span>
                {drill.verifiedRows === null
                  ? '—'
                  : `${drill.verifiedRows.toLocaleString()} rows`}
              </span>
            </div>
          </div>
        ))}
      </section>

      <form onSubmit={recordDrill} className="mt-10 border-b border-paper-a18 pb-8">
        <div className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 text-paper-a45" strokeWidth={1.4} />
          <div className="micro-sm text-paper-a45">Record a backup or restore drill</div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
          <label className="block">
            <span className="micro-sm text-paper-a45">Environment</span>
            <input
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Backup source</span>
            <input
              value={backupSource}
              onChange={(event) => setBackupSource(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Restore target</span>
            <input
              value={restoreTarget}
              onChange={(event) => setRestoreTarget(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ControlBackupDrill['status'])}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            >
              {['planned', 'running', 'passed', 'failed'].map((option) => (
                <option key={option} value={option} className="bg-ink text-paper">
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Started at</span>
            <input
              type="datetime-local"
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Completed at</span>
            <input
              type="datetime-local"
              value={completedAt}
              onChange={(event) => setCompletedAt(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">RPO minutes</span>
            <input
              value={rpoMinutes}
              onChange={(event) => setRpoMinutes(event.target.value)}
              inputMode="numeric"
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">RTO minutes</span>
            <input
              value={rtoMinutes}
              onChange={(event) => setRtoMinutes(event.target.value)}
              inputMode="numeric"
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Verified tables</span>
            <input
              value={verifiedTables}
              onChange={(event) => setVerifiedTables(event.target.value)}
              inputMode="numeric"
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Verified rows</span>
            <input
              value={verifiedRows}
              onChange={(event) => setVerifiedRows(event.target.value)}
              inputMode="numeric"
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Checksum</span>
            <input
              value={checksum}
              onChange={(event) => setChecksum(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
              placeholder="sha256:…"
            />
          </label>
        </div>
        <label className="mt-5 block">
          <span className="micro-sm text-paper-a45">Notes</span>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            placeholder="What was restored and what was verified"
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 inline-flex h-10 items-center gap-2 border border-paper px-4 text-[9px] uppercase tracking-[0.24em] text-paper transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
        >
          <Plus className="h-3 w-3" strokeWidth={1.4} />
          {isSubmitting ? 'Recording' : 'Record drill'}
        </button>
      </form>

      <div className="mt-8 flex items-center gap-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
        <ArchiveRestore className="h-3 w-3" strokeWidth={1.4} />
        A recorded drill is evidence of a test, not a guarantee for the next restore.
      </div>
    </div>
  );
};
