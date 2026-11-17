import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, RefreshCw } from 'lucide-react';
import { ControlDeployment, ControlDeploymentsResponse } from '../../controlPlane/types';
import { controlFetch, formatControlDateTime } from './controlApi';

const statusTone = (status: string) => {
  if (status === 'succeeded') return 'border-paper text-paper';
  if (status === 'failed' || status === 'rolled_back') return 'border-paper bg-paper text-ink';
  return 'border-paper-a18 text-paper-a45';
};

export const ControlDeploymentsPanel: React.FC = () => {
  const [data, setData] = useState<ControlDeploymentsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [commitSha, setCommitSha] = useState('');
  const [status, setStatus] = useState('succeeded');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await controlFetch<ControlDeploymentsResponse>('/api/control/deployments'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deployments could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const record = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!version.trim()) return;
    setIsSubmitting(true);
    setNotice(null);
    try {
      await controlFetch<ControlDeployment>('/api/control/deployments', {
        method: 'POST',
        body: JSON.stringify({ version, environment, commitSha, status }),
      });
      setVersion('');
      setCommitSha('');
      setNotice('Deployment recorded.');
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Deployment record failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Release tracking</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            What <em>changed</em>
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

      <form onSubmit={record} className="mt-8 border-b border-paper-a18 pb-8">
        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-paper-a45" strokeWidth={1.4} />
          <div className="micro-sm text-paper-a45">Record a deployment</div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-4">
          <label className="block">
            <span className="micro-sm text-paper-a45">Version</span>
            <input
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
              placeholder="2026.11.15"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Environment</span>
            <select
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            >
              {['production', 'preview', 'staging', 'development'].map((option) => (
                <option key={option} value={option} className="bg-ink text-paper">
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Commit</span>
            <input
              value={commitSha}
              onChange={(event) => setCommitSha(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
              placeholder="abc1234"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            >
              {['started', 'succeeded', 'failed', 'rolled_back'].map((option) => (
                <option key={option} value={option} className="bg-ink text-paper">
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={isSubmitting || !version.trim()}
          className="mt-6 inline-flex h-10 items-center gap-2 border border-paper px-4 text-[9px] uppercase tracking-[0.24em] text-paper transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
        >
          {isSubmitting ? 'Recording' : 'Record deployment'}
        </button>
      </form>

      <div className="mt-10">
        <div className="micro-sm text-paper-a45">Deployment register</div>
        {!isLoading && (data?.deployments.length || 0) === 0 && (
          <div className="mt-4 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
            No deployment records. Release history starts when a deployment is recorded here or by
            a deploy hook.
          </div>
        )}
        {(data?.deployments || []).map((deployment) => (
          <div key={deployment.id} className="grid grid-cols-1 gap-3 border-b border-paper-a18 py-5 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center">
            <div>
              <div className="text-[13px] text-paper">{deployment.version}</div>
              <div className="micro-sm mt-1 text-paper-a18">{deployment.id}</div>
            </div>
            <div className="text-[11px] text-paper-a45">
              <div>{deployment.environment}</div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                {deployment.commitSha || 'No commit'}
              </div>
            </div>
            <div className="text-[11px] text-paper-a45">
              <div>{formatControlDateTime(deployment.startedAt)}</div>
              <div className="mt-1 text-paper-a18">{deployment.actor || 'Unknown actor'}</div>
            </div>
            <span className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${statusTone(deployment.status)}`}>
              {deployment.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
