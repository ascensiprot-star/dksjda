import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Plus, RefreshCw } from 'lucide-react';
import { ControlIncidentsResponse, ControlIncidentDetail } from '../../controlPlane/types';
import { CONTROL_SERVICES } from '../../controlPlane/catalog';
import { controlFetch, formatControlDateTime } from './controlApi';

const STATUS_OPTIONS = ['investigating', 'identified', 'monitoring', 'resolved'];
const SEVERITY_OPTIONS = ['SEV1', 'SEV2', 'SEV3', 'SEV4'];

const statusTone = (status: string) => {
  if (status === 'resolved') return 'border-paper-a18 text-paper-a45';
  if (status === 'monitoring') return 'border-paper-a45 text-paper-a45';
  return 'border-paper text-paper';
};

export const ControlIncidentsPanel: React.FC = () => {
  const [data, setData] = useState<ControlIncidentsResponse | null>(null);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [impact, setImpact] = useState('');
  const [severity, setSeverity] = useState('SEV3');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (withResolved: boolean) => {
    setIsLoading(true);
    try {
      const response = await controlFetch<ControlIncidentsResponse>(
        `/api/control/incidents?includeResolved=${withResolved ? '1' : '0'}`
      );
      setData(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incidents could not be read.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(includeResolved);
  }, [includeResolved, load]);

  const declareIncident = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    setNotice(null);
    try {
      await controlFetch<ControlIncidentDetail>('/api/control/incidents', {
        method: 'POST',
        body: JSON.stringify({ title, summary, impact, severity, serviceIds }),
      });
      setTitle('');
      setSummary('');
      setImpact('');
      setServiceIds([]);
      setNotice('Incident declared. Timeline entry written.');
      await load(includeResolved);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Incident declaration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (incident: ControlIncidentDetail, status: string) => {
    try {
      await controlFetch(`/api/control/incidents/${incident.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load(includeResolved);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Incident update failed.');
    }
  };

  const addNote = async (incident: ControlIncidentDetail) => {
    const message = (notes[incident.id] || '').trim();
    if (!message) return;
    try {
      await controlFetch(`/api/control/incidents/${incident.id}/events`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      setNotes((current) => ({ ...current, [incident.id]: '' }));
      await load(includeResolved);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Incident note failed.');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <div className="micro-sm text-paper-a45">Incident command</div>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,42px)] leading-none">
            What is <em>broken</em>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIncludeResolved((value) => !value)}
            className={`h-8 border px-3 text-[9px] uppercase tracking-[0.22em] transition-colors ${
              includeResolved
                ? 'border-paper bg-paper text-ink'
                : 'border-paper-a18 text-paper-a45 hover:border-paper hover:text-paper'
            }`}
          >
            {includeResolved ? 'Resolved shown' : 'Include resolved'}
          </button>
          <button
            type="button"
            onClick={() => void load(includeResolved)}
            className="inline-flex h-8 items-center gap-2 border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.22em] text-paper-a45 transition-colors hover:border-paper hover:text-paper"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.4} />
            Refresh
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

      <form onSubmit={declareIncident} className="mt-8 border-b border-paper-a18 pb-8">
        <div className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 text-paper-a45" strokeWidth={1.4} />
          <div className="micro-sm text-paper-a45">Declare incident</div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className="block">
            <span className="micro-sm text-paper-a45">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
              placeholder="Checkout latency spike"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Severity</span>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="mt-2 h-10 w-full border-b border-paper-a18 bg-transparent text-[13px] text-paper outline-none focus:border-paper"
            >
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option} value={option} className="bg-ink text-paper">
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className="block">
            <span className="micro-sm text-paper-a45">Summary</span>
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={3}
              className="mt-2 w-full resize-none border-b border-paper-a18 bg-transparent text-[12px] leading-relaxed text-paper outline-none focus:border-paper"
              placeholder="What is happening, and since when?"
            />
          </label>
          <label className="block">
            <span className="micro-sm text-paper-a45">Customer impact</span>
            <textarea
              value={impact}
              onChange={(event) => setImpact(event.target.value)}
              rows={3}
              className="mt-2 w-full resize-none border-b border-paper-a18 bg-transparent text-[12px] leading-relaxed text-paper outline-none focus:border-paper"
              placeholder="Which journeys or orders are affected?"
            />
          </label>
        </div>
        <div className="mt-5">
          <span className="micro-sm text-paper-a45">Affected services</span>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {CONTROL_SERVICES.map((service) => (
              <label key={service.id} className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-paper-a45">
                <input
                  type="checkbox"
                  checked={serviceIds.includes(service.id)}
                  onChange={(event) =>
                    setServiceIds((current) =>
                      event.target.checked
                        ? [...current, service.id]
                        : current.filter((id) => id !== service.id)
                    )
                  }
                  className="h-3 w-3 accent-white"
                />
                {service.name}
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={isSubmitting || !title.trim()}
          className="mt-6 inline-flex h-10 items-center gap-2 border border-paper px-4 text-[9px] uppercase tracking-[0.24em] text-paper transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
        >
          <AlertTriangle className="h-3 w-3" strokeWidth={1.4} />
          {isSubmitting ? 'Declaring' : 'Declare incident'}
        </button>
      </form>

      <div className="mt-10">
        <div className="micro-sm text-paper-a45">Incident register</div>
        {!isLoading && (data?.incidents.length || 0) === 0 && (
          <div className="mt-4 border-t border-paper-a18 pt-5 text-[12px] leading-relaxed text-paper-a45">
            No incidents recorded. An empty register means no incident has been declared here.
          </div>
        )}
        {(data?.incidents || []).map((incident) => (
          <div key={incident.id} className="border-b border-paper-a18 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[58ch]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-display text-[22px] leading-none">{incident.title}</span>
                  <span className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${statusTone(incident.status)}`}>
                    {incident.status}
                  </span>
                  <span className="micro-sm text-paper-a45">{incident.severity}</span>
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-paper-a45">{incident.summary || 'No summary.'}</p>
                <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                  {formatControlDateTime(incident.startedAt)} · {incident.serviceIds.join(' · ') || 'No services'} · {incident.commander || 'Unassigned'}
                </div>
              </div>
              <select
                value={incident.status}
                onChange={(event) => void updateStatus(incident, event.target.value)}
                className="h-9 border border-paper-a18 bg-transparent px-3 text-[9px] uppercase tracking-[0.18em] text-paper outline-none focus:border-paper"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option} className="bg-ink text-paper">
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {incident.events.length > 0 && (
              <div className="mt-5 border-l border-paper-a18 pl-4">
                {incident.events.map((event) => (
                  <div key={event.id} className="mb-3 last:mb-0">
                    <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-paper-a18">
                      {formatControlDateTime(event.occurredAt)} · {event.eventType} · {event.actor || 'system'}
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-paper-a45">{event.message}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={notes[incident.id] || ''}
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [incident.id]: event.target.value }))
                }
                className="h-9 flex-1 border-b border-paper-a18 bg-transparent text-[12px] text-paper outline-none focus:border-paper"
                placeholder="Add a timeline note"
              />
              <button
                type="button"
                onClick={() => void addNote(incident)}
                className="h-9 border border-paper-a18 px-3 text-[9px] uppercase tracking-[0.2em] text-paper-a45 hover:border-paper hover:text-paper"
              >
                Add note
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
