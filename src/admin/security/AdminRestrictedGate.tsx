import React from 'react';
import { ShieldAlert, Lock, ArrowLeft, ArrowRight, UserCheck, LogOut } from 'lucide-react';
import { useAuth, DESIGNATED_ADMIN_EMAIL } from '../../supabase/AuthContext';

interface AdminRestrictedGateProps {
  onGoToAuth: () => void;
  onBackToStorefront: () => void;
}

export const AdminRestrictedGate: React.FC<AdminRestrictedGateProps> = ({
  onGoToAuth,
  onBackToStorefront,
}) => {
  const { user, signOut } = useAuth();

  const handleSignOutAndAuth = async () => {
    try {
      await signOut();
    } catch {
      // Ignore
    }
    onGoToAuth();
  };

  return (
    <div className="admin-scope min-h-screen bg-ink text-paper flex flex-col justify-between p-6 sm:p-12 selection:bg-[#ffa21f] selection:text-ink animate-fadeIn">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b-2 border-[#9c1a1f] max-w-4xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 bg-[#ff4b43]" />
          <span className="micro-sm text-[#ffa21f]">
            ZEJESH // SECURITY PERIMETER · ACCESS CONTROL
          </span>
        </div>
        <button
          type="button"
          onClick={onBackToStorefront}
          className="micro-sm text-paper-a45 hover:text-[#ffa21f] flex items-center gap-1.5 transition-colors cursor-pointer py-1 px-2 border border-[#2c2c2c]"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>RETURN TO STOREFRONT</span>
        </button>
      </div>

      {/* Main Card */}
      <div className="max-w-md w-full mx-auto my-auto py-10">
        <div className="border border-[#333333] border-t-2 border-t-[#ff4b43] bg-[#050505] p-8 sm:p-10 relative text-center">
          {/* Top lock icon */}
          <div className="w-12 h-12 border border-[#ff4b43]/60 bg-[#1c0708] text-[#ff4b43] mx-auto flex items-center justify-center mb-5">
            <Lock className="w-5 h-5" strokeWidth={1.5} />
          </div>

          <span className="micro-sm text-[#ff4b43] block mb-2">
            RESTRICTED TERMINAL LINK
          </span>

          <h1 className="font-display text-[24px] font-semibold leading-[1.15] text-[#ffa21f] mb-3">
            ADMINISTRATIVE ACCESS DENIED
          </h1>

          <p className="text-[12px] text-[#9a9a9a] leading-relaxed mb-7">
            This management terminal link cannot be opened without an active executive administrator session.
            Only the designated administrator (<span className="text-[#42c6ff] select-all font-mono text-[11px]">{DESIGNATED_ADMIN_EMAIL}</span>) is permitted to access this panel.
          </p>

          {user ? (
            <div className="p-4 border border-paper-a18 text-left text-small space-y-3 mb-6">
              <div className="flex items-center justify-between">
                <span className="micro-sm text-paper-a45">
                  Current session
                </span>
                <span className="micro-sm border border-paper-a18 text-paper-a72 px-2 py-0.5">
                  Patron account
                </span>
              </div>
              <p className="text-paper text-[12px] break-all font-mono">
                {user.email}
              </p>
              <p className="micro-sm text-paper-a45 leading-relaxed normal-case tracking-[0.04em]">
                This account does not have executive clearance. Please sign out and log in with{' '}
                <span className="text-paper">{DESIGNATED_ADMIN_EMAIL}</span> on the main website.
              </p>
            </div>
          ) : (
            <div className="p-4 border border-dashed border-paper-a18 text-left text-small space-y-3 mb-6">
              <div className="flex items-center gap-2 text-paper micro-sm">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" strokeWidth={1.4} />
                <span>No active admin session detected</span>
              </div>
              <p className="text-[12px] font-light text-paper-a72 leading-relaxed">
                You must first log in with{' '}
                <span className="text-paper">{DESIGNATED_ADMIN_EMAIL}</span> on the main website.
                Once logged in, revisit this link to enter your terminal keys.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3 pt-2">
            {user ? (
              <button
                type="button"
                onClick={handleSignOutAndAuth}
                className="btn btn-primary w-full !min-h-[48px]"
              >
                <LogOut className="w-3.5 h-3.5" strokeWidth={1.4} />
                <span>Sign Out & Log In as Admin</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onGoToAuth}
                className="btn btn-primary w-full !min-h-[48px] group"
              >
                <UserCheck className="w-3.5 h-3.5" strokeWidth={1.4} />
                <span>Log In on Website First</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" strokeWidth={1.4} />
              </button>
            )}

            <button
              type="button"
              onClick={onBackToStorefront}
              className="btn-text w-full justify-center"
            >
              Return to Storefront
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-paper-a18 max-w-4xl w-full mx-auto flex items-center justify-between micro-sm text-paper-a45">
        <span>Security enforcement protocol: strict owner validation</span>
        <span className="hidden sm:inline">Zejesh enterprise perimeter</span>
      </div>
    </div>
  );
};
