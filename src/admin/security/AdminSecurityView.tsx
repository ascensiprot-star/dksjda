import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Key,
  Clock,
  Download,
  AlertCircle,
  CheckCircle2,
  Fingerprint,
} from 'lucide-react';
import { AuditLog } from '../../types';
import { useAuth } from '../../supabase/AuthContext';

interface AdminSecurityViewProps {
  autoLockMinutes: number;
  onUpdateAutoLock: (minutes: number) => void;
  onLockTerminalNow: () => void;
  auditLogs: AuditLog[];
}

export const AdminSecurityView: React.FC<AdminSecurityViewProps> = ({
  autoLockMinutes,
  onUpdateAutoLock,
  onLockTerminalNow,
  auditLogs,
}) => {
  const { changePassword, adminProfile, role } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passkeySuccess, setPasskeySuccess] = useState(false);
  const [passkeyError, setPasskeyError] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const handleSavePasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasskeyError('');

    if (newPassword.length < 8) {
      setPasskeyError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasskeyError('Passwords do not match.');
      return;
    }

    setIsSavingPassword(true);
    // Handed to Supabase Auth, which hashes it server-side. The plaintext is
    // never stored or logged by this application.
    const result = await changePassword(newPassword);
    setIsSavingPassword(false);

    if (!result.success) {
      setPasskeyError(result.error || 'Unable to update password.');
      return;
    }

    setNewPassword('');
    setConfirmPassword('');
    setPasskeySuccess(true);
    setTimeout(() => setPasskeySuccess(false), 3000);
  };

  const handleExportAuditLogs = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `zejesh-security-audit-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-10 max-w-5xl">
      {/* Title & Lock Terminal Action */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <h1 className="font-display text-[38px] font-light leading-[1.05] tracking-[-0.01em] text-paper">
            Security & Terminal Governance
          </h1>
          <p className="text-[13px] font-light text-paper-a45 mt-1 max-w-2xl leading-relaxed">
            Session controls, password management and the audit log recorded for this terminal. Only verified
            checks are reported.
          </p>
        </div>
        <button
          type="button"
          onClick={onLockTerminalNow}
          className="btn btn-primary !min-h-[42px] !px-6 shrink-0"
        >
          <Lock className="w-3.5 h-3.5" strokeWidth={1.4} />
          <span>Lock Terminal Now</span>
        </button>
      </div>

      {/* Security Level Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-paper-a18 border border-paper-a18">
        <div className="p-5 bg-ink">
          <div className="flex items-center gap-2 micro-sm text-paper-a45 mb-3">
            <ShieldCheck className="w-4 h-4 text-paper" strokeWidth={1.4} />
            <span>Assigned Role</span>
          </div>
          <div className="text-[14px] font-light text-paper break-words">
            {adminProfile?.role || role || 'No role assigned'}
          </div>
          <div className="micro-sm text-paper-a45 mt-2 leading-relaxed">
            Granted by your Supabase sign-in — inactivity auto-lock is {autoLockMinutes === 0 ? 'disabled' : `${autoLockMinutes}m`}
          </div>
        </div>

        <div className="p-5 bg-ink">
          <div className="flex items-center gap-2 micro-sm text-paper-a45 mb-3">
            <Fingerprint className="w-4 h-4 text-paper-a72" strokeWidth={1.4} />
            <span>Signed-In Operator</span>
          </div>
          <div className="text-[12px] font-normal text-paper break-words font-mono">
            {adminProfile?.email || 'Not signed in'}
          </div>
          <div className="micro-sm text-paper-a45 mt-2">Identity comes from the Supabase session</div>
        </div>

        <div className="p-5 bg-ink">
          <div className="flex items-center gap-2 micro-sm text-paper-a45 mb-3">
            <Clock className="w-4 h-4 text-paper-a72" strokeWidth={1.4} />
            <span>Auto-Lock Timeout</span>
          </div>
          <div className="text-[14px] font-light text-paper">
            {autoLockMinutes === 0 ? 'Disabled' : `${autoLockMinutes} Minutes Inactivity`}
          </div>
          <div className="micro-sm text-paper-a45 mt-2">Auto-locks when unattended</div>
        </div>
      </div>

      {/* Security Policies & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-paper-a18 border border-paper-a18">
        {/* Password Change Form */}
        <div className="bg-ink p-6 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-paper-a18">
            <Key className="w-4 h-4 text-paper-a72" strokeWidth={1.4} />
            <h2 className="micro-sm text-paper">
              Account Password
            </h2>
          </div>

          <p className="text-[12px] font-light text-paper-a45 leading-relaxed">
            Changes the password for <strong className="text-paper font-normal">{adminProfile?.email || 'your studio account'}</strong>.
            Credentials are hashed server-side by Supabase Auth — this application never stores them.
          </p>

          <form onSubmit={handleSavePasskey} className="space-y-5">
            <div>
              <label className="field-label">New Password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="field"
              />
            </div>

            <div>
              <label className="field-label">Confirm New Password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="field"
              />
            </div>

            {passkeyError && (
              <div className="p-3 border border-dashed border-paper-a18 micro-sm text-paper flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.4} />
                <span>{passkeyError}</span>
              </div>
            )}

            {passkeySuccess && (
              <div className="p-3 border border-paper-a18 micro-sm text-paper flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.4} />
                <span>Password updated successfully!</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingPassword}
              className="btn btn-primary !min-h-[42px] !px-6 disabled:opacity-50"
            >
              {isSavingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Access Policies & Timeout */}
        <div className="bg-ink p-6 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-paper-a18">
            <Fingerprint className="w-4 h-4 text-paper-a72" strokeWidth={1.4} />
            <h2 className="micro-sm text-paper">
              Session Governance & Policies
            </h2>
          </div>

          <div className="space-y-6">
            <div>
              <label className="field-label">
                Inactivity Auto-Lock Duration
              </label>
              <div className="grid grid-cols-4 gap-2 micro-sm">
                {[5, 15, 30, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => onUpdateAutoLock(mins)}
                    className={`py-2.5 text-center cursor-pointer transition-colors border font-mono ${ autoLockMinutes === mins ? 'bg-paper text-ink border-paper'
                        : 'border-paper-a18 text-paper-a72 hover:text-paper hover:border-paper'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 space-y-4 border-t border-paper-a18">
              <label className="flex items-start justify-between gap-4">
                <div>
                  <div className="micro-sm text-paper">Geofenced IP Restriction</div>
                  <div className="text-[12px] font-light text-paper-a45 mt-1 leading-relaxed">Not available — no IP allow-list is configured or enforced.</div>
                </div>
                <input
                  type="checkbox"
                  disabled
                  aria-label="Geofenced IP restriction — not available"
                  className="accent-paper w-4 h-4 cursor-not-allowed opacity-50 mt-1"
                />
              </label>

              <label className="flex items-start justify-between gap-4">
                <div>
                  <div className="micro-sm text-paper">Two-Factor Hardware Verification</div>
                  <div className="text-[12px] font-light text-paper-a45 mt-1 leading-relaxed">Not available — two-factor verification is not configured.</div>
                </div>
                <input
                  type="checkbox"
                  disabled
                  aria-label="Two-factor hardware verification — not available"
                  className="accent-paper w-4 h-4 cursor-not-allowed opacity-50 mt-1"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Immutable Security Audit Trail */}
      <div className="border border-paper-a18">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-paper-a18">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-paper-a72" strokeWidth={1.4} />
            <h2 className="micro-sm text-paper">
              Security Audit Trail ({auditLogs.length} Events)
            </h2>
          </div>
          <button
            type="button"
            onClick={handleExportAuditLogs}
            className="btn-text self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.4} />
            <span>Export Audit Log (JSON)</span>
          </button>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="micro-sm text-paper-a45 border-b border-paper-a18">
                <th className="px-4 py-3 font-normal">Timestamp</th>
                <th className="px-4 py-3 font-normal">Operator</th>
                <th className="px-4 py-3 font-normal">Action</th>
                <th className="px-4 py-3 font-normal">Target</th>
                <th className="px-4 py-3 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center micro-sm text-paper-a45">
                    No activity yet — audit entries appear here as soon as a real action is recorded.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => {
                  const status =
                    typeof log.details?.status === 'string' && log.details.status
                      ? log.details.status
                      : 'Unverified';
                  return (
                    <tr key={log.id} className="border-b border-paper-a18 last:border-b-0 hover:bg-paper-a06 transition-colors">
                      <td className="px-4 py-3 text-paper-a45 micro-sm font-mono whitespace-nowrap">
                        {new Date(log.at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 font-light text-paper">{log.who}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 border border-paper-a18 text-paper micro-sm">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-paper-a72 truncate max-w-[200px] font-mono text-[11px]">{log.target}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`micro-sm ${ status.toLowerCase() === 'verified' ? 'bg-paper text-ink px-2 py-0.5' : 'text-paper-a45'
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
