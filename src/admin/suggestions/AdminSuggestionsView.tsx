import React, { useState, useEffect, useMemo } from 'react';
import { CommunitySuggestion } from '../../types';
import { useAuth } from '../../supabase/AuthContext';
import { supabase } from '../../supabase/config';
import { subscribeToSuggestions, logAuditEvent } from '../../supabase/dbService';
import {
  ThumbsUp,
  Sparkles,
  Scissors,
  CheckCircle2,
  Clock,
  Trash2,
  Edit2,
  Search,
  Layers,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';

export const AdminSuggestionsView: React.FC = () => {
  const { isOwner, isEditor, adminProfile } = useAuth();
  const [suggestions, setSuggestions] = useState<CommunitySuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CommunitySuggestion['status']>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [curatorNotes, setCuratorNotes] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToSuggestions((data) => {
      setSuggestions(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    return suggestions
      .filter((s) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = s.title.toLowerCase().includes(q);
          const matchFabric = s.desiredFabric.toLowerCase().includes(q);
          const matchCat = s.category.toLowerCase().includes(q);
          if (!matchTitle && !matchFabric && !matchCat) return false;
        }
        if (statusFilter !== 'all' && s.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => (b.votes || 0) - (a.votes || 0)); // Most voted at top
  }, [suggestions, searchQuery, statusFilter]);

  const topVotedPiece = suggestions[0];
  const commissionedCount = suggestions.filter((s) => s.status === 'commissioned').length;
  const inSamplingCount = suggestions.filter((s) => s.status === 'in_sampling').length;
  const totalVotesCount = suggestions.reduce((acc, s) => acc + (s.votes || 0), 0);

  const handleUpdateStatus = async (id: string, newStatus: CommunitySuggestion['status']) => {
    if (!isEditor) return;
    try {
      const { error } = await supabase
        .from('suggestions')
        .update({
          status: newStatus,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      await logAuditEvent(
        adminProfile?.name || 'admin',
        'update_suggestion_status',
        id,
        { status: newStatus }
      );
      setStatusMsg(`Status updated to ${newStatus.replace('_', ' ')}.`);
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err: any) {
      alert(`Error updating: ${err.message}`);
    }
  };

  const handleSaveCuratorNotes = async (id: string) => {
    if (!isEditor) return;
    try {
      const { error } = await supabase
        .from('suggestions')
        .update({
          curatorNotes: curatorNotes.trim(),
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      setEditingId(null);
      setStatusMsg('Curator notes saved.');
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err: any) {
      alert(`Error saving notes: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isOwner) return;
    if (!window.confirm('Delete this community suggestion permanently?')) return;
    try {
      const { error } = await supabase.from('suggestions').delete().eq('id', id);
      if (error) throw error;
      await logAuditEvent(adminProfile?.name || 'admin', 'delete_suggestion', id);
      setStatusMsg('Suggestion deleted.');
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err: any) {
      alert(`Error deleting: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8 text-[13px]">
      {/* Title Header */}
      <div className="border-b border-paper-a18 pb-5">
        <div className="flex items-center gap-3 mb-2">
          <span className="micro-sm text-paper-a45">Community Atelier & Voting</span>
          <span className="micro-sm border border-paper-a18 px-2 py-0.5 text-paper-a72">
            {suggestions.length} proposals
          </span>
        </div>
        <h1 className="font-display text-[38px] font-light leading-[1.05] tracking-[-0.01em] text-paper">
          Client Suggestions & Voting Governance
        </h1>
        <p className="text-[13px] font-light text-paper-a45 mt-2 max-w-2xl leading-relaxed">
          Review design ideas requested by clients. Proposals with the most votes are commissioned for tailoring and sampling in our Helsinki & Porto ateliers.
        </p>
      </div>

      {statusMsg && (
        <div className="py-3 border-b border-paper-a18 micro-sm text-paper flex items-center gap-2 animate-fadeIn">
          <Check className="w-4 h-4 shrink-0" strokeWidth={1.4} />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-paper-a18 border border-paper-a18">
        <div className="bg-ink p-5 space-y-2">
          <span className="micro-sm text-paper-a45">Top Voted Leader</span>
          <div className="font-display text-[24px] font-light text-paper truncate leading-tight">
            {topVotedPiece ? topVotedPiece.title : 'None yet'}
          </div>
          <span className="micro-sm font-mono text-paper">
            {topVotedPiece ? `${topVotedPiece.votes} client votes` : '0 votes'}
          </span>
        </div>

        <div className="bg-ink p-5 space-y-2">
          <span className="micro-sm text-paper-a45">Commissioned to Make</span>
          <div className="font-display text-[32px] font-light text-paper leading-none">
            {commissionedCount}
          </div>
          <span className="micro-sm text-paper-a45">Selected from client voting</span>
        </div>

        <div className="bg-ink p-5 space-y-2">
          <span className="micro-sm text-paper-a45">In Atelier Sampling</span>
          <div className="font-display text-[32px] font-light text-paper leading-none underline underline-offset-4 decoration-1">
            {inSamplingCount}
          </div>
          <span className="micro-sm text-paper-a45">Prototypes in construction</span>
        </div>

        <div className="bg-ink p-5 space-y-2">
          <span className="micro-sm text-paper-a45">Total Ballots Cast</span>
          <div className="font-mono text-[30px] font-light text-paper leading-none">
            {totalVotesCount}
          </div>
          <span className="micro-sm text-paper-a45">Verified community votes</span>
        </div>
      </div>

      {/* SEARCH & FILTER CONTROLS */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-4 border-b border-paper-a18 pb-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-0 top-1/2 -translate-y-1/2 text-paper-a45" strokeWidth={1.4} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search proposals, fabrics, categories..."
            className="field pl-6 !border-0"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="micro-sm text-paper-a45">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="field cursor-pointer !border-0 font-mono"
          >
            <option value="all">All Statuses</option>
            <option value="under_review">Under Review</option>
            <option value="in_sampling">In Sampling</option>
            <option value="commissioned">Commissioned</option>
            <option value="declined">Declined</option>
          </select>
        </div>
      </div>

      {/* SUGGESTIONS LIST (RANKED BY VOTES) */}
      <div className="border border-paper-a18">
        {filtered.map((item, idx) => (
          <div key={item.id} className="p-5 border-b border-paper-a18 last:border-b-0 space-y-4 transition-colors hover:bg-paper-a06">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="micro-sm bg-paper text-ink px-2 py-1 font-mono">
                    #{idx + 1} · {item.votes} Votes
                  </span>
                  <span className="micro-sm text-paper-a45 border border-paper-a18 px-2 py-1">
                    {item.category}
                  </span>
                  <span className="micro-sm text-paper-a45">
                    Fabric: <strong className="text-paper font-normal">{item.desiredFabric}</strong>
                  </span>
                </div>

                <h3 className="font-display text-[26px] font-light text-paper pt-1 leading-tight">
                  {item.title}
                </h3>

                <p className="text-[13px] font-light text-paper-a72 max-w-3xl leading-relaxed">
                  {item.description}
                </p>

                <div className="flex items-center gap-3 micro-sm text-paper-a45 pt-1 flex-wrap">
                  <span>Submitted by: {item.submittedBy || 'Anonymous Patron'}</span>
                  {item.submitterEmail && <span>· {item.submitterEmail}</span>}
                  <span>· {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Recent'}</span>
                </div>
              </div>

              {/* Status and Curator Controls */}
              <div className="flex flex-col items-start sm:items-end gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="micro-sm text-paper-a45">Production Status</span>
                  <select
                    value={item.status}
                    onChange={(e) => handleUpdateStatus(item.id, e.target.value as any)}
                    className={`px-2 py-1 micro-sm border cursor-pointer bg-ink ${ item.status === 'commissioned'
                        ? 'bg-paper text-ink border-paper'
                        : item.status === 'in_sampling'
                        ? 'border-paper text-paper underline underline-offset-2'
                        : item.status === 'declined'
                        ? 'border-dashed border-paper-a18 text-paper-a45'
                        : 'border-paper-a18 text-paper-a72'
                    }`}
                  >
                    <option value="under_review">Under Review</option>
                    <option value="in_sampling">In Sampling</option>
                    <option value="commissioned">Commissioned to Make</option>
                    <option value="declined">Declined</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(item.id);
                      setCuratorNotes(item.curatorNotes || '');
                    }}
                    className="btn-text"
                  >
                    {item.curatorNotes ? 'Edit Atelier Note' : '+ Add Atelier Note'}
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="micro-sm text-paper-a45 hover:text-paper hover:line-through transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* CURATOR NOTES DISPLAY */}
            {item.curatorNotes && editingId !== item.id && (
              <div className="p-4 border-l border-paper-a18 text-[12px] text-paper-a72 font-light">
                <span className="micro-sm text-paper-a45 block mb-1.5">
                  Atelier Curator Response (Visible to Public)
                </span>
                {item.curatorNotes}
              </div>
            )}

            {/* CURATOR NOTES EDITOR FORM */}
            {editingId === item.id && (
              <div className="p-4 border border-paper-a18 space-y-3 mt-2">
                <label className="block micro-sm text-paper-a45">
                  Atelier Curator Public Note for "{item.title}"
                </label>
                <textarea
                  rows={2}
                  value={curatorNotes}
                  onChange={(e) => setCuratorNotes(e.target.value)}
                  placeholder="e.g. Sampling completed in Helsinki. Scheduled for Winter 2026 release."
                  className="field"
                />
                <div className="flex justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="btn-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveCuratorNotes(item.id)}
                    className="btn btn-primary !min-h-[40px] !px-5"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && !loading && (
          <div className="p-14 text-center micro-sm text-paper-a45">
            No suggestions match the current filter.
          </div>
        )}
      </div>
    </div>
  );
};
