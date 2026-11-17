import React, { useState } from 'react';
import { WaitlistEntry, Collection } from '../../types';
import { Download, Send, Check, Mail, Clock } from 'lucide-react';
import { useAuth } from '../../supabase/AuthContext';
import { supabase } from '../../supabase/config';
import { logAuditEvent } from '../../supabase/dbService';

interface AdminWaitlistViewProps {
  waitlist: WaitlistEntry[];
  collections: Collection[];
  onRefresh?: () => void;
}

export const AdminWaitlistView: React.FC<AdminWaitlistViewProps> = ({ waitlist, collections, onRefresh }) => {
  const { isEditor, adminProfile } = useAuth();
  const [selectedDrop, setSelectedDrop] = useState<string>('all');
  const [invitedMap, setInvitedMap] = useState<Record<string, boolean>>({});

  const drops = collections.filter((c) => c.type === 'drop');

  const filteredEntries = waitlist.filter((w) => {
    if (selectedDrop !== 'all' && w.dropId !== selectedDrop) return false;
    return true;
  });

  const handleSendInvite = async (entry: WaitlistEntry) => {
    if (!isEditor) return;
    setInvitedMap((prev) => ({ ...prev, [entry.id]: true }));
    try {
      const { error } = await supabase
        .from('waitlist')
        .update({
          invited: true,
          invitedAt: new Date().toISOString(),
        })
        .eq('id', entry.id);
      if (error) throw error;
      await logAuditEvent(adminProfile?.name || 'admin', 'invite_waitlist', entry.id, {
        email: entry.email,
        dropId: entry.dropId,
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.warn('Waitlist invite error:', err);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Email', 'Drop ID', 'Source', 'Registered At', 'Invited'];
    const rows = filteredEntries.map((w) => [
      w.email,
      w.dropId,
      w.source,
      new Date(w.createdAt).toISOString(),
      w.invited || invitedMap[w.id] ? 'Yes' : 'No',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `zejesh_waitlist_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 text-[13px]">
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <h1 className="font-display text-[38px] font-light leading-[1.05] tracking-[-0.01em] text-paper">Private Waitlists & Drop Registrations</h1>
          <p className="text-[13px] font-light text-paper-a45 mt-1 max-w-2xl leading-relaxed">
            Pre-launch drop waitlists, early access pass dispatch, and subscriber export.
          </p>
        </div>

        {waitlist.length > 0 && (
          <button
            type="button"
            onClick={handleExportCSV}
            className="btn btn-secondary !min-h-[40px] !px-5 self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.4} />
            <span>Export CSV</span>
          </button>
        )}
      </div>

      {waitlist.length === 0 ? (
        <div className="p-16 border border-paper-a18 text-center space-y-5">
          <div className="w-12 h-12 mx-auto flex items-center justify-center text-paper-a45">
            <Clock className="w-6 h-6" strokeWidth={1.4} />
          </div>
          <div>
            <h3 className="font-display text-[24px] font-light text-paper mb-2">No waitlist subscribers yet</h3>
            <p className="text-[13px] font-light text-paper-a45 max-w-md mx-auto leading-relaxed">
              Drop invitations and waitlist signups submitted through the storefront will sync directly to this table.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Drop Filter */}
          <div className="flex flex-wrap gap-6 micro-sm border-b border-paper-a18 pb-3">
            <button
              type="button"
              onClick={() => setSelectedDrop('all')}
              className={`transition-colors cursor-pointer ${ selectedDrop === 'all' ? 'text-paper underline underline-offset-[6px]' : 'text-paper-a45 hover:text-paper'
              }`}
            >
              All Drops ({waitlist.length})
            </button>
            {drops.map((drop) => (
              <button
                key={drop.id}
                type="button"
                onClick={() => setSelectedDrop(drop.id)}
                className={`transition-colors cursor-pointer ${ selectedDrop === drop.id ? 'text-paper underline underline-offset-[6px]'
                    : 'text-paper-a45 hover:text-paper'
                }`}
              >
                {typeof drop.name === 'string' ? drop.name : drop.name.en}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="border border-paper-a18 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="micro-sm text-paper-a45 border-b border-paper-a18 select-none">
                  <th className="px-4 py-3 font-normal">Subscriber Email</th>
                  <th className="px-4 py-3 font-normal">Target Drop</th>
                  <th className="px-4 py-3 font-normal">Source</th>
                  <th className="px-4 py-3 font-normal">Registered At</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((w) => {
                  const isInvited = w.invited || invitedMap[w.id];
                  const dropObj = collections.find((c) => c.id === w.dropId);
                  const dropTitle = dropObj ? (typeof dropObj.name === 'string' ? dropObj.name : dropObj.name.en) : w.dropId;

                  return (
                    <tr key={w.id} className="group border-b border-paper-a18 last:border-b-0 transition-colors hover:bg-paper hover:text-ink">
                      <td className="px-4 py-4 font-mono text-[12px]">{w.email}</td>
                      <td className="px-4 py-4 text-paper-a72 group-hover:text-ink-a64">{dropTitle}</td>
                      <td className="px-4 py-4 micro-sm text-paper-a45 group-hover:text-ink-a40">{w.source || 'Storefront'}</td>
                      <td className="px-4 py-4 micro-sm font-mono text-paper-a45 group-hover:text-ink-a40">
                        {new Date(w.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-4">
                        {isInvited ? (
                          <span className="inline-flex items-center gap-1.5 micro-sm px-2 py-1 bg-paper text-ink group-hover:bg-ink group-hover:text-paper">
                            <Check className="w-3 h-3" strokeWidth={1.6} />
                            <span>Invited</span>
                          </span>
                        ) : (
                          <span className="micro-sm text-paper-a45 group-hover:text-ink-a40">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {!isInvited && (
                          <button
                            type="button"
                            onClick={() => handleSendInvite(w)}
                            disabled={!isEditor}
                            className="btn-text disabled:opacity-40 disabled:cursor-not-allowed justify-end"
                          >
                            <Send className="w-3 h-3" strokeWidth={1.4} />
                            <span>Send Pass</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
