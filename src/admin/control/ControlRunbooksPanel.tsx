import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Check, Plus, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../../supabase/AuthContext';
import {
  ControlChangeRequest,
  ControlChangeRequestsResponse,
  ControlRunbook,
  ControlRunbookExecution,
  ControlRunbookExecutionsResponse,
  ControlRunbooksResponse,
} from '../../controlPlane/types';
import { controlFetch, formatControlDateTime } from './controlApi';

const requestTone = (status: string) => {
  if (status === 'approved') return 'border-paper text-paper';
  if (status === 'rejected') return 'border-paper bg-paper text-ink';
  return 'border-paper-a18 text-paper-a45';
};

export const ControlRunbooksPanel: React.FC = () => {
  const { isOwner } = useAuth();
  const [runbooks, setRunbooks] = useState<ControlRunbooksResponse | null>(null);
  const [requests, setRequests] = useState<ControlChangeRequestsResponse | null>(null);
  const [executions, setExecutions] = useState<ControlRunbookExecutionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('deployment');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [stepNotes, setStepNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [runbookResponse, requestResponse, executionResponse] = await Promise.all([
        controlFetch<ControlRunbooksResponse>('/api/control/runbooks'),
        controlFetch<ControlChangeRequestsResponse>('/api/control/change-requests'),
        controlFetch<ControlRunbookExecutionsResponse>('/api/control/runbook-executions'),
      ]);
      setRunbooks(runbookResponse);
      setRequests(requestResponse);
      setExecutions(executionResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Runbooks could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const requestChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!action.trim() || !reason.trim()) return;
    setIsSubmitting(true);
    setNotice(null);
    try {
      await controlFetch<ControlChangeRequest>('/api/control/change-requests', {
        method: 'POST',
        body: JSON.stringify({ action, targetType, targetId, reason }),
      });
      setAction('');
      setTargetId('');
      setReason('');
      setNotice('Change request recorded. The owner can decide it in this panel.');
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Change request failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const decide = async (request: ControlChangeRequest, decision: 'approved' | 'rejected') => {
    setBusyId(request.id);
    setNotice(null);
    try {
      await controlFetch(`/api/control/change-requests/${request.id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setNotice(`Change request ${decision}.`);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Decision failed.');
    } finally {
      setBusyId(null);
    }
  };

  const approvedForRunbook = (runbookId: string) => {
    const usedApprovals = new Set(
      (executions?.executions || []).map((execution) => execution.changeRequestId)
    );
    return (
      (requests?.requests || []).find(
        (request) =>
          request.status === 'approved' &&
          request.action === 'runbook.execute' &&
          request.targetType === 'runbook' &&
          request.targetId === runbookId &&
          !usedApprovals.has(request.id)
      ) || null
    );
  };

  const activeExecutionFor = (runbookId: string) =>
    (executions?.executions || []).find(
      (execution) => execution.runbookId === runbookId && execution.status === 'in_progress'
    ) || null;

  const startExecution = async (runbook: ControlRunbook) => {
    const approval = approvedForRunbook(runbook.id);
    if (!approval) {
      setNotice('Owner approval is required before this runbook can start.');
      return;
    }
    setBusyId(runbook.id);
    setNotice(null);
    try {
      await controlFetch(`/api/control/runbooks/${runbook.id}/execute`, {
        method: 'POST',
        body: JSON.stringify({ changeRequestId: approval.id }),
      });
      setNotice(`${runbook.name} started against approved request ${approval.id}.`);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Runbook could not start.');
    } finally {
      setBusyId(null);
    }
  };

  const advanceStep = async (
    execution: ControlRunbookExecution,
    stepIndex: number,
    result: 'done' | 'failed' | 'skipped'
  ) => {
    setBusyId(execution.id);
    setNotice(null);
    try {
      await controlFetch(`/api/control/runbook-executions/${execution.id}/step`, {
        method: 'POST',
        body: JSON.stringify({
          stepIndex,
          result,
          note: stepNotes[execution.id] || '',
        }),
      });
      setNotice(`Step ${stepIndex + 1} recorded as ${result}.`);
      setStepNotes((current) => ({ ...current, [execution.id]: '' }));
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Runbook step failed.');
    } finally {
      setBusyId(null);
    }
  };

  const abortExecution = async (execution: ControlRunbookExecution) => {
    setBusyId(execution.id);
    setNotice(null);
    try {
      await controlFetch(`/api/control/runbook-executions/${execution.id}/abort`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'abandoned',
          reason: 'Abandoned from the control plane.',
        }),
      });
      setNotice('Runbook execution abandoned.');
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Runbook execution could not be abandoned.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Runbooks and approvals</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            What to <em>do</em>
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
      {runbooks?.note && (
        <div className="mt-6 border-t border-paper-a18 pt-4 text-[12px] leading-relaxed text-paper-a45">
          {runbooks.note}
        </div>
      )}
      {requests?.note && (
        <div className="mt-6 border-t border-paper-a18 pt-4 text-[12px] leading-relaxed text-paper-a45">
          {requests.note}
        </div>
      )}
      {notice && (
        <div className="mt-6 border-t border-paper-a18 pt-4 text-[12px] leading-relaxed text-paper-a45">
          {notice}
        </div>
      )}

      <div className="mt-8">
        <div className="micro-sm text-paper-a45">Incident runbooks</div>
        {!isLoading && (runbooks?.runbooks.length || 0) === 0 && (
          <div className="mt-4 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
            No runbooks. Apply migration 0010 to seed the operational procedures.
          </div>
        )}
        {(runbooks?.runbooks || []).map((runbook) => {
          const approval = approvedForRunbook(runbook.id);
          const activeExecution = activeExecutionFor(runbook.id);
          return (
          <div key={runbook.id} className="border-b border-paper-a18 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[64ch]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13px] text-paper">{runbook.name}</span>
                  <span className="inline-flex border border-paper-a18 px-2 py-1 text-[9px] uppercase tracking-[0.2em] text-paper-a45">
                    {runbook.severity}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-paper-a45">{runbook.description}</p>
                <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  {runbook.serviceId || 'unassigned'} · {runbook.owner}
                </div>
              </div>
            </div>
            <ol className="mt-5 border-l border-paper-a18 pl-4">
              {runbook.steps.map((step, index) => (
                <li key={index} className="mb-2 flex gap-3 text-[11px] leading-relaxed text-paper-a45 last:mb-0">
                  <span className="font-mono text-[9px] text-paper-a18">{String(index + 1).padStart(2, '0')}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-paper-a18 pt-4">
              {activeExecution ? (
                <span className="inline-flex items-center gap-2 border border-paper-a45 px-3 py-2 text-[9px] uppercase tracking-[0.2em] text-paper-a45">
                  Execution in progress · step{' '}
                  {Math.min(activeExecution.currentStep + 1, runbook.steps.length)} of{' '}
                  {runbook.steps.length}
                </span>
              ) : approval ? (
                <button
                  type="button"
                  onClick={() => void startExecution(runbook)}
                  disabled={busyId === runbook.id}
                  className="inline-flex h-9 items-center gap-2 border border-paper px-3 text-[9px] uppercase tracking-[0.2em] text-paper transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
                >
                  <Check className="h-3 w-3" strokeWidth={1.4} />
                  {busyId === runbook.id ? 'Starting' : 'Start with approved request'}
                </button>
              ) : (
                <span className="text-[10px] uppercase tracking-[0.14em] text-paper-a18">
                  Owner approval required before start
                </span>
              )}
            </div>
          </div>
          );
        })}
      </div>

      <div className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
          <div>
            <div className="micro-sm text-paper-a45">Tracked execution</div>
            <h3 className="mt-2 font-display text-[clamp(22px,2.4vw,34px)] leading-none">
              Step <em>records</em>
            </h3>
          </div>
          <div className="micro-sm text-paper-a18">
            {executions?.executions.length || 0} execution
            {(executions?.executions.length || 0) === 1 ? '' : 's'}
          </div>
        </div>
        {executions?.note && (
          <div className="mt-4 border-t border-paper-a18 pt-4 text-[12px] leading-relaxed text-paper-a45">
            {executions.note}
          </div>
        )}
        {!isLoading && (executions?.executions.length || 0) === 0 && (
          <div className="mt-4 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
            No runbook executions. A runbook starts only after the owner approves a matching
            runbook.execute change request.
          </div>
        )}
        {(executions?.executions || []).map((execution) => {
          const runbook = runbooks?.runbooks.find((entry) => entry.id === execution.runbookId);
          const steps = runbook?.steps || [];
          const currentStep = execution.currentStep;
          const isOpen = execution.status === 'in_progress';
          return (
            <div key={execution.id} className="border-b border-paper-a18 py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-[64ch]">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[13px] text-paper">
                      {execution.runbookName || execution.runbookId}
                    </span>
                    <span className="inline-flex border border-paper-a18 px-2 py-1 text-[9px] uppercase tracking-[0.2em] text-paper-a45">
                      {execution.status}
                    </span>
                    <span className="micro-sm text-paper-a18">
                      step {Math.min(currentStep + (isOpen ? 1 : 0), steps.length || currentStep)} of{' '}
                      {steps.length || '—'}
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                    {execution.executedBy} · approved by {execution.approvedBy || 'unknown'} ·{' '}
                    {formatControlDateTime(execution.startedAt)}
                  </div>
                  {execution.error && (
                    <div className="mt-2 text-[11px] leading-relaxed text-paper-a45">
                      {execution.error}
                    </div>
                  )}
                </div>
                {isOpen && (
                  <button
                    type="button"
                    onClick={() => void abortExecution(execution)}
                    disabled={busyId === execution.id}
                    className="inline-flex h-9 items-center border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.2em] text-paper-a45 hover:border-paper hover:text-paper disabled:opacity-40"
                  >
                    Abandon
                  </button>
                )}
              </div>

              {isOpen && steps[currentStep] && (
                <div className="mt-5 border-l border-paper pl-4">
                  <div className="text-[11px] leading-relaxed text-paper">
                    <span className="font-mono text-[9px] text-paper-a18">
                      {String(currentStep + 1).padStart(2, '0')}
                    </span>{' '}
                    {steps[currentStep]}
                  </div>
                  <input
                    value={stepNotes[execution.id] || ''}
                    onChange={(event) =>
                      setStepNotes((current) => ({
                        ...current,
                        [execution.id]: event.target.value,
                      }))
                    }
                    className="mt-3 h-9 w-full border-b border-paper-a18 bg-transparent text-[12px] text-paper outline-none focus:border-paper"
                    placeholder="Observation for this step (optional)"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void advanceStep(execution, currentStep, 'done')}
                      disabled={busyId === execution.id}
                      className="inline-flex h-9 items-center gap-2 border border-paper px-3 text-[9px] uppercase tracking-[0.2em] text-paper hover:bg-paper hover:text-ink disabled:opacity-40"
                    >
                      <Check className="h-3 w-3" strokeWidth={1.4} /> Done
                    </button>
                    <button
                      type="button"
                      onClick={() => void advanceStep(execution, currentStep, 'skipped')}
                      disabled={busyId === execution.id}
                      className="inline-flex h-9 items-center border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.2em] text-paper-a45 hover:border-paper hover:text-paper disabled:opacity-40"
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      onClick={() => void advanceStep(execution, currentStep, 'failed')}
                      disabled={busyId === execution.id}
                      className="inline-flex h-9 items-center gap-2 border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.2em] text-paper-a45 hover:border-paper hover:text-paper disabled:opacity-40"
                    >
                      <X className="h-3 w-3" strokeWidth={1.4} /> Fail
                    </button>
                  </div>
                </div>
              )}

              {execution.stepResults.length > 0 && (
                <div className="mt-5 border-t border-paper-a18 pt-3">
                  {execution.stepResults.map((result, index) => (
                    <div key={index} className="flex gap-3 py-1.5 text-[10px] leading-relaxed text-paper-a45">
                      <span className="font-mono text-paper-a18">
                        {String(result.step || index + 1).padStart(2, '0')}
                      </span>
                      <span className="uppercase tracking-[0.14em] text-paper-a18">
                        {String(result.result || 'recorded')}
                      </span>
                      <span className="min-w-0 flex-1">
                        {String(result.note || '') || 'No observation recorded.'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={requestChange} className="mt-10 border-b border-paper-a18 pb-8">
        <div className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 text-paper-a45" strokeWidth={1.4} />
          <div className="micro-sm text-paper-a45">Request a change</div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-4">
          <label className="block md:col-span-2">
            <span className="micro-sm text-paper-a45">Action</span>
            <input
              value={action}
              onChange={(event) => setAction(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
              placeholder="Rollback production deployment"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Target type</span>
            <select
              value={targetType}
              onChange={(event) => setTargetType(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            >
              {['deployment', 'feature_flag', 'database', 'storage', 'configuration', 'runbook'].map((option) => (
                <option key={option} value={option} className="bg-ink text-paper">
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Target id</span>
            <input
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
              placeholder="dep-…"
            />
          </label>
        </div>
        <label className="mt-5 block">
          <span className="micro-sm text-paper-a45">Reason</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            placeholder="Why this change is needed"
          />
        </label>
        <p className="mt-4 text-[10px] leading-relaxed text-paper-a18">
          To start a runbook, use action <span className="font-mono">runbook.execute</span>, target
          type <span className="font-mono">runbook</span>, and the runbook id as the target. The
          owner must approve it before the start button appears.
        </p>
        <button
          type="submit"
          disabled={isSubmitting || !action.trim() || !reason.trim()}
          className="mt-6 inline-flex h-10 items-center gap-2 border border-paper px-4 text-[9px] uppercase tracking-[0.24em] text-paper transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
        >
          {isSubmitting ? 'Requesting' : 'Request change'}
        </button>
      </form>

      <div className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <div className="micro-sm text-paper-a45">Change requests</div>
          <div className="micro-sm text-paper-a18">{isOwner ? 'Owner decision enabled' : 'Owner approval required'}</div>
        </div>
        {!isLoading && (requests?.requests.length || 0) === 0 && (
          <div className="mt-4 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
            No change requests. Destructive actions should be proposed here before execution.
          </div>
        )}
        {(requests?.requests || []).map((request) => (
          <div key={request.id} className="border-b border-paper-a18 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[62ch]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13px] text-paper">{request.action}</span>
                  <span className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${requestTone(request.status)}`}>
                    {request.status}
                  </span>
                  <span className="micro-sm text-paper-a18">{request.targetType}</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-paper-a45">{request.reason}</p>
                <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  {request.requestedBy} · {formatControlDateTime(request.createdAt)}
                  {request.targetId ? ` · ${request.targetId}` : ''}
                </div>
              </div>
              {isOwner && request.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void decide(request, 'approved')}
                    disabled={busyId === request.id}
                    className="inline-flex h-9 items-center gap-2 border border-paper px-3 text-[9px] uppercase tracking-[0.2em] text-paper hover:bg-paper hover:text-ink disabled:opacity-40"
                  >
                    <Check className="h-3 w-3" strokeWidth={1.4} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void decide(request, 'rejected')}
                    disabled={busyId === request.id}
                    className="inline-flex h-9 items-center gap-2 border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.2em] text-paper-a45 hover:border-paper hover:text-paper disabled:opacity-40"
                  >
                    <X className="h-3 w-3" strokeWidth={1.4} /> Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
        <BookOpen className="h-3 w-3" strokeWidth={1.4} />
        Runbooks are guidance. Approvals are required before destructive actions.
      </div>
    </div>
  );
};
