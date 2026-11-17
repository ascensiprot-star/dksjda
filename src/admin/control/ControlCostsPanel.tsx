import React, { useCallback, useEffect, useState } from 'react';
import { CircleDollarSign, Plus, RefreshCw } from 'lucide-react';
import { ControlCostBudgetState, ControlCostResponse } from '../../controlPlane/types';
import { controlFetch, formatControlDateTime } from './controlApi';

const statusTone = (status: ControlCostBudgetState['status']) => {
  if (status === 'breached') return 'border-paper bg-paper text-ink';
  if (status === 'warning') return 'border-paper-a45 text-paper-a45';
  if (status === 'ok') return 'border-paper text-paper';
  return 'border-paper-a18 text-paper-a45';
};

const statusLabel = (status: ControlCostBudgetState['status']) => {
  if (status === 'breached') return 'Over budget';
  if (status === 'warning') return 'Warning';
  if (status === 'ok') return 'Inside budget';
  return 'No spend data';
};

const money = (value: number | null, currency: string | null) => {
  if (value === null || !currency) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};

const currentMonth = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
};

export const ControlCostsPanel: React.FC = () => {
  const [data, setData] = useState<ControlCostResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<'budget' | 'snapshot' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [budgetEditId, setBudgetEditId] = useState<string | null>(null);
  const [budgetName, setBudgetName] = useState('');
  const [budgetProvider, setBudgetProvider] = useState('supabase');
  const [budgetService, setBudgetService] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('USD');
  const [threshold, setThreshold] = useState('80');

  const [snapshotProvider, setSnapshotProvider] = useState('supabase');
  const [snapshotService, setSnapshotService] = useState('');
  const [periodStart, setPeriodStart] = useState(currentMonth().start);
  const [periodEnd, setPeriodEnd] = useState(currentMonth().end);
  const [amount, setAmount] = useState('');
  const [snapshotCurrency, setSnapshotCurrency] = useState('USD');
  const [source, setSource] = useState('manual');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await controlFetch<ControlCostResponse>('/api/control/costs'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cost data could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveBudget = async (event: React.FormEvent) => {
    event.preventDefault();
    const limit = Number(monthlyLimit);
    if (!budgetName.trim() || !budgetProvider.trim() || !Number.isFinite(limit) || limit < 0) {
      setNotice('Budget name, provider and a non-negative monthly limit are required.');
      return;
    }
    setBusy('budget');
    setNotice(null);
    try {
      await controlFetch('/api/control/costs/budgets', {
        method: 'POST',
        body: JSON.stringify({
          id: budgetEditId || undefined,
          name: budgetName,
          provider: budgetProvider,
          serviceId: budgetService || undefined,
          monthlyLimit: limit,
          currency: budgetCurrency,
          alertThresholdPercent: Number(threshold) || 80,
        }),
      });
      setBudgetEditId(null);
      setBudgetName('');
      setMonthlyLimit('');
      setNotice('Budget saved. Spend stays unavailable until a snapshot is recorded.');
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Budget could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const saveSnapshot = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!snapshotProvider.trim() || !periodStart || !periodEnd) {
      setNotice('Provider and both period dates are required.');
      return;
    }
    if (!Number.isFinite(value) || value < 0) {
      setNotice('Amount must be a non-negative number.');
      return;
    }
    setBusy('snapshot');
    setNotice(null);
    try {
      await controlFetch('/api/control/costs/snapshots', {
        method: 'POST',
        body: JSON.stringify({
          provider: snapshotProvider,
          serviceId: snapshotService || undefined,
          periodStart,
          periodEnd,
          amount: value,
          currency: snapshotCurrency,
          source,
        }),
      });
      setAmount('');
      setNotice('Cost snapshot recorded against the provider period.');
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Snapshot could not be recorded.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Cost and usage</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            What is <em>spent</em>
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
          <div className="micro-sm text-paper-a45">Current month spend</div>
          <div className="mt-2 font-display text-[clamp(24px,3vw,40px)] leading-none">
            {money(data?.totals.recordedSpend ?? null, data?.totals.currency ?? null)}
          </div>
          <div className="mt-2 text-[10px] leading-relaxed text-paper-a18">
            {data?.totals.message || 'No provider snapshots recorded.'}
          </div>
        </div>
        <div>
          <div className="micro-sm text-paper-a45">Budgets</div>
          <div className="mt-2 font-display text-[clamp(24px,3vw,40px)] leading-none">
            {data?.budgets.length ?? 0}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
            {data?.budgets.filter((budget) => budget.status === 'breached').length ?? 0} over ceiling
          </div>
        </div>
        <div>
          <div className="micro-sm text-paper-a45">Providers</div>
          <div className="mt-2 font-display text-[clamp(24px,3vw,40px)] leading-none">
            {data?.totals.providers ?? 0}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
            With current-month snapshots
          </div>
        </div>
        <div>
          <div className="micro-sm text-paper-a45">Window</div>
          <div className="mt-2 font-mono text-[11px] leading-relaxed text-paper">
            {data?.monthStart || '—'}
            <br />
            {data?.monthEnd || '—'}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
            Latest snapshot per provider and period
          </div>
        </div>
      </section>

      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
          <div>
            <div className="micro-sm text-paper-a45">Monthly ceilings</div>
            <h3 className="mt-2 font-display text-[clamp(22px,2.4vw,34px)] leading-none">
              Budgets
            </h3>
          </div>
        </div>
        {!isLoading && (data?.budgets.length || 0) === 0 && (
          <div className="border-t border-paper-a18 py-5 text-[12px] leading-relaxed text-paper-a45">
            No budgets are configured. A missing budget is not a healthy budget.
          </div>
        )}
        {(data?.budgets || []).map((budget) => (
          <div key={budget.id} className="grid grid-cols-1 gap-4 border-b border-paper-a18 py-5 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-paper">{budget.name}</span>
                <span className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${statusTone(budget.status)}`}>
                  {statusLabel(budget.status)}
                </span>
              </div>
              <div className="mt-2 text-[11px] leading-relaxed text-paper-a45">
                {budget.provider} · {budget.serviceId || 'all services'} · {budget.owner}
              </div>
              <div className="mt-1 text-[10px] leading-relaxed text-paper-a18">{budget.message}</div>
            </div>
            <div className="text-[11px] text-paper-a45">
              <div>Spent {money(budget.monthSpent, budget.currency)}</div>
              <div className="mt-1">Ceiling {money(budget.monthlyLimit, budget.currency)}</div>
            </div>
            <div className="text-[11px] text-paper-a45">
              <div>
                {budget.utilizationPercent === null
                  ? 'Utilization unavailable'
                  : `${budget.utilizationPercent.toFixed(1)}% used`}
              </div>
              <div className="mt-1 text-paper-a18">
                {budget.snapshotCount} snapshot{budget.snapshotCount === 1 ? '' : 's'} · warning at{' '}
                {budget.alertThresholdPercent}%
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                {formatControlDateTime(budget.updatedAt)}
              </div>
              <button
                type="button"
                onClick={() => {
                  setBudgetEditId(budget.id);
                  setBudgetName(budget.name);
                  setBudgetProvider(budget.provider);
                  setBudgetService(budget.serviceId || '');
                  setMonthlyLimit(String(budget.monthlyLimit));
                  setBudgetCurrency(budget.currency);
                  setThreshold(String(budget.alertThresholdPercent));
                }}
                className="text-[9px] uppercase tracking-[0.2em] text-paper-a45 underline-offset-4 hover:text-paper hover:underline"
              >
                Edit
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-14 grid grid-cols-1 gap-10 xl:grid-cols-2">
        <form onSubmit={saveBudget} className="border-b border-paper-a18 pb-8">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-3.5 w-3.5 text-paper-a45" strokeWidth={1.4} />
            <div className="micro-sm text-paper-a45">
              {budgetEditId ? 'Edit budget' : 'Add a budget'}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="micro-sm text-paper-a45">Name</span>
              <input
                value={budgetName}
                onChange={(event) => setBudgetName(event.target.value)}
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
                placeholder="Supabase production"
              />
            </label>
            <label className="block">
              <span className="micro-sm text-paper-a45">Provider</span>
              <input
                value={budgetProvider}
                onChange={(event) => setBudgetProvider(event.target.value)}
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
                placeholder="supabase"
              />
            </label>
            <label className="block">
              <span className="micro-sm text-paper-a45">Service id</span>
              <input
                value={budgetService}
                onChange={(event) => setBudgetService(event.target.value)}
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
                placeholder="postgres"
              />
            </label>
            <label className="block">
              <span className="micro-sm text-paper-a45">Monthly limit</span>
              <input
                value={monthlyLimit}
                onChange={(event) => setMonthlyLimit(event.target.value)}
                inputMode="decimal"
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
                placeholder="25.00"
              />
            </label>
            <label className="block">
              <span className="micro-sm text-paper-a45">Currency</span>
              <input
                value={budgetCurrency}
                onChange={(event) => setBudgetCurrency(event.target.value.toUpperCase())}
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
                placeholder="USD"
              />
            </label>
            <label className="block">
              <span className="micro-sm text-paper-a45">Warning threshold %</span>
              <input
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                inputMode="numeric"
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
                placeholder="80"
              />
            </label>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy === 'budget'}
              className="inline-flex h-10 items-center gap-2 border border-paper px-4 text-[9px] uppercase tracking-[0.24em] text-paper transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
            >
              <Plus className="h-3 w-3" strokeWidth={1.4} />
              {busy === 'budget' ? 'Saving' : budgetEditId ? 'Update budget' : 'Save budget'}
            </button>
            {budgetEditId && (
              <button
                type="button"
                onClick={() => {
                  setBudgetEditId(null);
                  setBudgetName('');
                  setMonthlyLimit('');
                }}
                className="inline-flex h-10 items-center border border-paper-a18 px-4 text-[9px] uppercase tracking-[0.24em] text-paper-a45 transition-colors hover:border-paper hover:text-paper"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <form onSubmit={saveSnapshot} className="border-b border-paper-a18 pb-8">
          <div className="micro-sm text-paper-a45">Record a provider or invoice snapshot</div>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="micro-sm text-paper-a45">Provider</span>
              <input
                value={snapshotProvider}
                onChange={(event) => setSnapshotProvider(event.target.value)}
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
                placeholder="supabase"
              />
            </label>
            <label className="block">
              <span className="micro-sm text-paper-a45">Service id</span>
              <input
                value={snapshotService}
                onChange={(event) => setSnapshotService(event.target.value)}
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
                placeholder="postgres"
              />
            </label>
            <label className="block">
              <span className="micro-sm text-paper-a45">Period start</span>
              <input
                type="date"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
              />
            </label>
            <label className="block">
              <span className="micro-sm text-paper-a45">Period end</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
              />
            </label>
            <label className="block">
              <span className="micro-sm text-paper-a45">Amount</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
                placeholder="18.40"
              />
            </label>
            <label className="block">
              <span className="micro-sm text-paper-a45">Currency</span>
              <input
                value={snapshotCurrency}
                onChange={(event) => setSnapshotCurrency(event.target.value.toUpperCase())}
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
                placeholder="USD"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="micro-sm text-paper-a45">Source</span>
              <select
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
              >
                {['manual', 'provider_api', 'invoice', 'estimate'].map((option) => (
                  <option key={option} value={option} className="bg-ink text-paper">
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={busy === 'snapshot'}
            className="mt-6 inline-flex h-10 items-center gap-2 border border-paper px-4 text-[9px] uppercase tracking-[0.24em] text-paper transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
          >
            <Plus className="h-3 w-3" strokeWidth={1.4} />
            {busy === 'snapshot' ? 'Recording' : 'Record snapshot'}
          </button>
        </form>
      </section>

      <section className="mt-12">
        <div className="micro-sm text-paper-a45">Recent snapshots</div>
        {!isLoading && (data?.snapshots.length || 0) === 0 && (
          <div className="mt-4 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
            No cost snapshots. Provider spend is unavailable until an invoice or provider figure is
            recorded.
          </div>
        )}
        {(data?.snapshots || []).map((snapshot) => (
          <div key={snapshot.id} className="grid grid-cols-1 gap-3 border-t border-paper-a18 py-4 sm:grid-cols-[1.2fr_1fr_1fr_.8fr] sm:items-center">
            <div className="text-[12px] text-paper">
              {snapshot.provider} · {snapshot.serviceId || 'all services'}
            </div>
            <div className="text-[11px] text-paper-a45">
              {snapshot.periodStart} → {snapshot.periodEnd}
            </div>
            <div className="text-[11px] text-paper-a45">
              {money(snapshot.amount, snapshot.currency)} · {snapshot.source}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18 sm:text-right">
              {formatControlDateTime(snapshot.capturedAt)}
            </div>
          </div>
        ))}
      </section>

      <div className="mt-8 flex items-center gap-2 border-t border-paper-a18 pt-4 text-[10px] uppercase tracking-[0.14em] text-paper-a18">
        <CircleDollarSign className="h-3 w-3" strokeWidth={1.4} />
        No spend is inferred. Every figure comes from a recorded snapshot.
      </div>
    </div>
  );
};
