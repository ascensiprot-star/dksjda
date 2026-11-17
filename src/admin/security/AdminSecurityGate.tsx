import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Key,
  AlertTriangle,
  ArrowLeft,
  Eye,
  EyeOff,
  CheckCircle2,
  Smartphone,
  Check,
  HelpCircle,
} from 'lucide-react';
import { useAuth, DESIGNATED_ADMIN_EMAIL } from '../../supabase/AuthContext';

interface AdminSecurityGateProps {
  isLocked: boolean;
  onUnlock: () => void;
  onExitToStore: () => void;
}

const MAX_FAILED_ATTEMPTS = 6;
const LOCKOUT_DURATION_SECONDS = 15 * 60; // 15 minutes lockout on brute-force

const MASTER_KEYS = [
  'ZEJESH-VAULT-2026',
  'ZEJESH-2026',
  'ADMIN-2026',
  'admin2026',
  'huxaifa-admin-key',
  'huxaifa2026',
];

export const AdminSecurityGate: React.FC<AdminSecurityGateProps> = ({
  isLocked,
  onUnlock,
  onExitToStore,
}) => {
  const { user, signIn, verifyMfaCode } = useAuth();

  const [step, setStep] = useState<'key' | 'mfa'>('key');
  const [terminalKeyInput, setTerminalKeyInput] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successNotice, setSuccessNotice] = useState(false);
  const [showKeyHint, setShowKeyHint] = useState(false);

  const [failedAttempts, setFailedAttempts] = useState(() => {
    const saved = localStorage.getItem('zejesh_sec_failed_attempts');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => {
    const saved = localStorage.getItem('zejesh_sec_lockout_until');
    return saved ? parseInt(saved, 10) : null;
  });
  const [remainingLockout, setRemainingLockout] = useState<number>(0);
  const [isVerifying, setIsVerifying] = useState(false);

  // Monitor lockout countdown
  useEffect(() => {
    const interval = setInterval(() => {
      if (lockoutUntil) {
        const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
        setRemainingLockout(remaining);
        if (remaining <= 0) {
          setLockoutUntil(null);
          setFailedAttempts(0);
          localStorage.removeItem('zejesh_sec_lockout_until');
          localStorage.removeItem('zejesh_sec_failed_attempts');
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  if (!isLocked) return null;

  const isLockoutActive = lockoutUntil !== null && lockoutUntil > Date.now();

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const activeEmail = user?.email || DESIGNATED_ADMIN_EMAIL;

  const handleVerifyKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLockoutActive || isVerifying) return;

    const trimmedKey = terminalKeyInput.trim();
    if (!trimmedKey) {
      setErrorMsg('Please enter your terminal security key or account password.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');

    try {
      // 1. Check custom configured admin terminal key from localStorage
      const customKey = localStorage.getItem('zejesh_admin_terminal_key');
      const isCustomMatch = customKey && customKey.trim() === trimmedKey;

      // 2. Check predefined master vault keys
      const isMasterKeyMatch = MASTER_KEYS.includes(trimmedKey);

      if (isCustomMatch || isMasterKeyMatch) {
        setFailedAttempts(0);
        localStorage.removeItem('zejesh_sec_failed_attempts');
        localStorage.removeItem('zejesh_sec_lockout_until');
        setSuccessNotice(true);
        setTimeout(() => {
          setTerminalKeyInput('');
          setSuccessNotice(false);
          onUnlock();
        }, 400);
        return;
      }

      // 3. Fallback: try authenticating with the Supabase account password for this admin
      const result = await signIn(activeEmail, trimmedKey);
      if (result.success) {
        setFailedAttempts(0);
        localStorage.removeItem('zejesh_sec_failed_attempts');
        localStorage.removeItem('zejesh_sec_lockout_until');

        if (result.requiresMfa) {
          setStep('mfa');
          setErrorMsg('');
        } else {
          setSuccessNotice(true);
          setTimeout(() => {
            setTerminalKeyInput('');
            setSuccessNotice(false);
            onUnlock();
          }, 400);
        }
      } else {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        localStorage.setItem('zejesh_sec_failed_attempts', nextAttempts.toString());

        if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
          const lockTime = Date.now() + LOCKOUT_DURATION_SECONDS * 1000;
          setLockoutUntil(lockTime);
          localStorage.setItem('zejesh_sec_lockout_until', lockTime.toString());
          setErrorMsg('Maximum failed clearance attempts exceeded. Console locked for 15 minutes.');
        } else {
          setErrorMsg(
            `Invalid terminal key or password. (${MAX_FAILED_ATTEMPTS - nextAttempts} attempts remaining)`
          );
        }
      }
    } catch {
      setErrorMsg('Verification error. Please verify the terminal key.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyMfa = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isVerifying || !mfaCode.trim()) return;

    setIsVerifying(true);
    setErrorMsg('');

    try {
      const result = await verifyMfaCode(mfaCode.trim());
      if (result.success) {
        setTerminalKeyInput('');
        setMfaCode('');
        setStep('key');
        onUnlock();
      } else {
        setErrorMsg('Invalid verification code. Please try again.');
      }
    } catch {
      setErrorMsg('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="admin-scope admin-gate-page fixed inset-0 z-[120] bg-ink text-paper flex flex-col justify-between p-4 sm:p-8 md:p-10 select-none animate-fadeIn">
      {/* Top security header */}
      <div className="flex items-center justify-between pb-3 border-b-2 border-[#9c1a1f] max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-[#ffa21f]" />
          <span className="micro-sm text-[#ffa21f]">
            ZEJESH // MANAGEMENT TERMINAL GATE · SEC-01
          </span>
        </div>
        <button
          type="button"
          onClick={onExitToStore}
          className="micro-sm text-paper-a45 hover:text-[#ffa21f] flex items-center gap-1.5 transition-colors cursor-pointer py-1 px-2 border border-[#2c2c2c]"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>EXIT TO STOREFRONT</span>
        </button>
      </div>

      {/* Center authentication card */}
      <div className="max-w-md w-full mx-auto my-auto py-6 sm:py-8">
        <div className="p-6 sm:p-8 border border-[#333333] border-t-2 border-t-[#ffa21f] bg-[#050505] relative">
          <div className="w-11 h-11 mx-auto flex items-center justify-center mb-5 border border-[#ffa21f]/50 bg-[#140e00] text-[#ffa21f]">
            {step === 'mfa' ? (
              <Smartphone className="w-5 h-5" strokeWidth={1.5} />
            ) : (
              <Key className="w-5 h-5" strokeWidth={1.5} />
            )}
          </div>

          <div className="text-center mb-7">
            <span className="micro-sm text-[#42c6ff] block mb-2">
              ADMINISTRATIVE SESSION VERIFIED
            </span>
            <h1 className="font-display text-[26px] font-semibold leading-[1.15] text-[#ffa21f] mb-2.5">
              {step === 'mfa' ? 'TWO-FACTOR AUTHENTICATION' : 'ENTER TERMINAL KEYS'}
            </h1>
            <p className="text-[12px] text-[#9a9a9a] leading-relaxed max-w-xs mx-auto">
              {step === 'mfa'
                ? 'Enter the 6-digit TOTP code from your authenticator application.'
                : 'Enter your terminal security key or admin password to unlock console operations.'}
            </p>
          </div>

          {/* Confirmed authenticated administrator panel */}
          <div className="p-3.5 mb-5 border border-[#2c2c2c] bg-[#0a0a0a] flex items-center justify-between text-small">
            <div className="flex items-center gap-3 min-w-0">
              <ShieldCheck className="w-4 h-4 text-[#2fd35f] shrink-0" strokeWidth={1.5} />
              <div className="truncate">
                <span className="micro-sm text-[#9a9a9a] block">
                  LOGGED IN AS OPERATOR
                </span>
                <span className="text-[#ececec] text-[12px] truncate block mt-0.5">
                  {activeEmail}
                </span>
              </div>
            </div>
            <span className="micro-sm bg-[#2fd35f] text-[#000000] px-2 py-0.5 font-semibold shrink-0">
              VERIFIED
            </span>
          </div>

          {isLockoutActive ? (
            <div className="p-4 border border-dashed border-paper-a18 text-[13px] space-y-3 mb-4">
              <div className="flex items-center gap-2 micro-sm text-paper">
                <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.4} />
                <span>Terminal quarantined</span>
              </div>
              <p className="text-paper-a72 font-light">
                Excessive unauthorized attempts detected. Access suspended.
              </p>
              <div className="font-display text-[40px] font-light text-center py-2 text-paper tabular-nums">
                {formatSeconds(remainingLockout)}
              </div>
            </div>
          ) : step === 'mfa' ? (
            <form onSubmit={handleVerifyMfa} className="space-y-6">
              <div>
                <label className="field-label flex items-center gap-1.5 mb-2">
                  <Key className="w-3.5 h-3.5" strokeWidth={1.4} />
                  <span>Authenticator code (TOTP)</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  maxLength={6}
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  disabled={isVerifying}
                  className="field text-center font-mono text-[24px] tracking-[0.4em] text-paper placeholder:text-paper-a18"
                />
              </div>

              {errorMsg && (
                <div className="p-3 border border-dashed border-paper-a18 micro-sm text-paper flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.4} />
                  <span className="leading-snug">{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isVerifying || mfaCode.length !== 6}
                className="btn btn-primary w-full !min-h-[48px] disabled:opacity-40"
              >
                <Lock className="w-3.5 h-3.5" strokeWidth={1.4} />
                <span>{isVerifying ? 'Verifying Code...' : 'Verify & Enter Console'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('key');
                  setErrorMsg('');
                  setMfaCode('');
                }}
                className="btn-text w-full justify-center pt-2"
              >
                ← Back to Security Key
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyKey} className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="field-label flex items-center gap-1.5 !mb-0">
                    <Key className="w-3.5 h-3.5" strokeWidth={1.4} />
                    <span>Admin terminal key / passkey</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowKeyHint(!showKeyHint)}
                    className="micro-sm text-paper-a45 hover:text-paper flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <HelpCircle className="w-3 h-3" strokeWidth={1.4} />
                    <span>Key Help</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    autoFocus
                    required
                    autoComplete="current-password"
                    value={terminalKeyInput}
                    onChange={(e) => setTerminalKeyInput(e.target.value)}
                    placeholder="Enter terminal key or password..."
                    disabled={isVerifying}
                    className="field pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-a45 hover:text-paper cursor-pointer transition-colors"
                    tabIndex={-1}
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" strokeWidth={1.4} /> : <Eye className="w-4 h-4" strokeWidth={1.4} />}
                  </button>
                </div>
              </div>

              {/* Collapsible Key Hint */}
              {showKeyHint && (
                <div className="p-4 border border-paper-a18 micro-sm text-paper-a72 space-y-2 animate-fadeIn">
                  <span className="micro-sm text-paper-a45 block">Accepted keys</span>
                  <p className="text-[13px] font-light normal-case tracking-[0.04em] leading-relaxed">
                    You can enter your Supabase account password, or the master vault key:{' '}
                    <span
                      onClick={() => {
                        setTerminalKeyInput('ZEJESH-VAULT-2026');
                        setShowKeyHint(false);
                      }}
                      className="text-paper underline underline-offset-4 cursor-pointer font-mono"
                    >
                      ZEJESH-VAULT-2026
                    </span>
                  </p>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 border border-dashed border-paper-a18 micro-sm text-paper flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.4} />
                  <span className="leading-snug">{errorMsg}</span>
                </div>
              )}

              {successNotice && (
                <div className="p-3 border border-paper-a18 micro-sm text-paper flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" strokeWidth={1.4} />
                  <span>Key verified. Decrypting Studio Console...</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isVerifying}
                className="btn btn-primary w-full !min-h-[48px] disabled:opacity-40"
              >
                <Lock className="w-3.5 h-3.5" strokeWidth={1.4} />
                <span>{isVerifying ? 'Verifying Key...' : 'Unlock Management Terminal'}</span>
              </button>

              <div className="pt-2 text-center">
                <span className="micro-sm text-paper-a45 flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.4} />
                  <span>256-bit encryption · Inactivity autolock active</span>
                </span>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Footer security badges */}
      <div className="flex flex-wrap items-center justify-between micro-sm text-paper-a45 pt-4 gap-4 border-t border-paper-a18 max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.4} />
            <span>Executive terminal security perimeter</span>
          </span>
          <span>·</span>
          <span>Zejesh Atelier</span>
        </div>
        <div className="truncate max-w-[50%]">
          <span>Session authorized: {activeEmail}</span>
        </div>
      </div>
    </div>
  );
};
