import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Copy,
  CheckCircle2,
  RefreshCw,
  LogOut,
  ShoppingBag,
  Heart,
  Key,
} from 'lucide-react';
import { useAuth, DESIGNATED_ADMIN_EMAIL } from '../supabase/AuthContext';
import { ADMIN_SECRET_PATH } from '../App';
import { editorialAt } from '../editorial';
import type { Product } from '../types';

interface AuthPageProps {
  initialMode?: 'signin' | 'signup' | 'forgot';
  adminIntent?: boolean;
  onNavigateHome: () => void;
  onNavigateAdmin: () => void;
  onOpenCart?: () => void;
  onOpenWishlist?: () => void;
  onNavigateArchive?: () => void;
  wishlistProducts?: Product[];
  onSelectProduct?: (product: Product) => void;
  onRemoveWishlist?: (productId: string) => void;
  cartCount?: number;
  wishlistCount?: number;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialMode = 'signin',
  adminIntent = false,
  onNavigateHome,
  onNavigateAdmin,
  onOpenCart,
  onOpenWishlist,
  cartCount = 0,
  wishlistCount = 0,
}) => {
  const {
    user,
    isAdmin,
    isOwner,
    passwordRecovery,
    clearPasswordRecovery,
    signIn,
    signUp,
    resetPassword,
    resendVerification,
    signOut,
    changePassword,
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [verificationSent, setVerificationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [recoveryComplete, setRecoveryComplete] = useState(false);

  // Status Feedback States
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [resendMessage, setResendMessage] = useState('');
  const [copiedPath, setCopiedPath] = useState(false);

  // Password change state (for logged in patrons)
  const [newPassword, setNewPassword] = useState('');
  const [changePassLoading, setChangePassLoading] = useState(false);
  const [changePassSuccess, setChangePassSuccess] = useState('');
  const [changePassError, setChangePassError] = useState('');

  // Auto-fill saved email if remembered
  useEffect(() => {
    const saved = localStorage.getItem('zejesh_patron_email');
    if (saved) setEmail(saved);
  }, []);

  useEffect(() => {
    setMode(initialMode);
    setVerificationSent(false);
    setResetSent(false);
    setErrorMessage('');
    setSuccessMessage('');
  }, [initialMode]);

  useEffect(() => {
    if (passwordRecovery) {
      setMode('signin');
      setVerificationSent(false);
      setResetSent(false);
      setRecoveryComplete(false);
      setErrorMessage('');
      setSuccessMessage('');
    }
  }, [passwordRecovery]);

  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
    setResendMessage('');
  };

  const handleModeSwitch = (nextMode: 'signin' | 'signup' | 'forgot') => {
    setMode(nextMode);
    setVerificationSent(false);
    setResetSent(false);
    clearMessages();
    if (typeof window !== 'undefined') {
      const nextPath = nextMode === 'signup' ? '/signup' : nextMode === 'forgot' ? '/forgot' : '/auth';
      window.history.replaceState({ route: { type: 'auth', mode: nextMode } }, '', nextPath);
    }
  };

  // Sign in submit
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!email.trim() || !password) {
      setErrorMessage('Please provide your registered email address and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await signIn(email.trim(), password);
      if (res.success) {
        if (rememberMe) {
          localStorage.setItem('zejesh_patron_email', email.trim());
        } else {
          localStorage.removeItem('zejesh_patron_email');
        }
        setSuccessMessage('Authentication verified. Welcome to the Atelier.');
      } else {
        setErrorMessage(res.error || 'Authentication failed. Please verify your credentials.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected authentication error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Sign up submit
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!email.trim() || !password) {
      setErrorMessage('Please specify an email address and password.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must contain at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('The passwords provided do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await signUp(email.trim(), password, fullName.trim());
      if (res.success) {
        setSuccessMessage(res.message || 'Patron registration completed. You may now sign in.');
        if (res.requiresVerification) setVerificationSent(true);
        if (rememberMe) {
          localStorage.setItem('zejesh_patron_email', email.trim());
        }
      } else {
        setErrorMessage(res.error || 'Registration could not be completed.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected registration error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Password reset request
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!email.trim()) {
      setErrorMessage('Please enter your email to receive recovery instructions.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetPassword(email.trim());
      if (res.success) {
        setSuccessMessage(res.message || 'Password reset link dispatched to your inbox.');
        setResetSent(true);
      } else {
        setErrorMessage(res.error || 'Unable to process reset request.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to dispatch password recovery link.');
    } finally {
      setLoading(false);
    }
  };

  // In-session password update
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePassError('');
    setChangePassSuccess('');

    if (!newPassword || newPassword.length < 8) {
      setChangePassError('New password must be at least 8 characters long.');
      return;
    }

    setChangePassLoading(true);
    try {
      const res = await changePassword(newPassword);
      if (res.success) {
        setChangePassSuccess('Password successfully updated.');
        setNewPassword('');
      } else {
        setChangePassError(res.error || 'Could not update credentials.');
      }
    } catch (err: any) {
      setChangePassError(err.message || 'Failed to update credentials.');
    } finally {
      setChangePassLoading(false);
    }
  };

  // Complete the password recovery flow after the email link signs the patron in.
  const handleRecoveryPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePassError('');
    setChangePassSuccess('');

    if (!newPassword || newPassword.length < 8) {
      setChangePassError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangePassError('The passwords provided do not match.');
      return;
    }

    setChangePassLoading(true);
    try {
      const res = await changePassword(newPassword);
      if (res.success) {
        setChangePassSuccess('Password successfully updated.');
        setRecoveryComplete(true);
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setChangePassError(res.error || 'Could not update credentials.');
      }
    } catch (err: any) {
      setChangePassError(err.message || 'Failed to update credentials.');
    } finally {
      setChangePassLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim() || resendLoading) return;
    setResendLoading(true);
    setResendMessage('');
    setErrorMessage('');
    try {
      const res = await resendVerification(email.trim());
      if (res.success) {
        setResendMessage(res.message || 'Verification email sent.');
      } else {
        setErrorMessage(res.error || 'Could not resend the verification email.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not resend the verification email.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleCopyAdminPath = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(ADMIN_SECRET_PATH);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2500);
    }
  };

  const isUserDesignatedAdmin =
    user?.email?.toLowerCase().trim() === DESIGNATED_ADMIN_EMAIL.toLowerCase() || isAdmin || isOwner;

  const modeHeading = {
    signin: adminIntent ? (
      <>
        Administrator <em>sign-in</em>
      </>
    ) : (
      <>
        Enter the <em>archive</em>
      </>
    ),
    signup: (
      <>
        Establish <em>access</em>
      </>
    ),
    forgot: (
      <>
        Recover your <em>access</em>
      </>
    ),
  };

  return (
    <div
      className={
        adminIntent
          ? 'admin-scope admin-auth-page'
          : 'storefront min-h-screen bg-paper text-ink selection:bg-ink selection:text-paper flex flex-col'
      }
    >
      {/* Top bar — hairline only */}
      <header
        className={
          adminIntent
            ? 'admin-auth-bar'
            : 'w-full border-b border-ink-a18 px-5 sm:px-10 lg:px-16 h-16 sm:h-20 flex items-center justify-between shrink-0 z-20'
        }
      >
        <button
          type="button"
          onClick={onNavigateHome}
          className="group flex items-center gap-2.5 label text-ink-a45 hover:text-ink transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span>Return to Storefront</span>
        </button>

        <span className="label text-ink-a45">
          {adminIntent ? 'ZEJESH // ADMINISTRATOR ACCESS · SEC-01' : 'Patron Access'}
        </span>
      </header>

      {/* Split portal: editorial statement left, form right */}
      <main className={adminIntent ? 'admin-auth-main' : 'flex-1 grid grid-cols-1 lg:grid-cols-2'}>
        {!adminIntent && (
          <section className="relative hidden overflow-hidden bg-ink text-paper lg:flex lg:flex-col lg:px-16 lg:py-16">
          <img
            src={editorialAt(0)}
            alt="Zejesh campaign still"
            className="absolute inset-0 h-full w-full object-cover object-[center_18%] grayscale contrast-[1.08]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/15 to-black/85"
          />

          <div className="relative z-10 flex flex-1 flex-col justify-between gap-24">
            <div className="max-w-md space-y-6 pt-10">
              <span className="label text-white/55">
                {adminIntent ? 'Zejesh — Management Terminal' : 'Zejesh — Private Client Portal'}
              </span>
              <p className="font-display font-light text-[clamp(44px,4.6vw,78px)] leading-[0.92] tracking-tight">
                {adminIntent ? (
                  <>
                    Quiet control of the <em className="italic">house.</em>
                  </>
                ) : (
                  <>
                    A quiet archive of <em className="italic">considered</em> garments.
                  </>
                )}
              </p>
              <p className="body-copy max-w-[34ch] text-white/60">
                {adminIntent
                  ? 'Sign in with the designated administrator account to unlock studio operations and telemetry.'
                  : 'Sign in to view allocations, reserve pieces, and keep permanent records of every acquisition.'}
              </p>
            </div>

            <div className="max-w-md space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="label text-white/45">Helsinki</span>
                <span className="font-mono text-[11px] tracking-[0.18em] text-white/45">60.1699° N</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="label text-white/45">Porto</span>
                <span className="font-mono text-[11px] tracking-[0.18em] text-white/45">41.1579° N</span>
              </div>
            </div>
          </div>
        </section>
        )}

        <section
          className={
            adminIntent
              ? 'admin-auth-panel'
              : 'flex items-center justify-center px-5 sm:px-10 lg:px-16 py-12 sm:py-16'
          }
        >
          <div className={adminIntent ? 'admin-auth-card' : 'w-full max-w-md'}>
            {/* Password recovery session opened from the email link */}
            {passwordRecovery ? (
              <div className="space-y-8 animate-fadeIn">
                <div className="space-y-3">
                  <span className="label text-ink-a45">Secure Recovery</span>
                  <h1 className="font-display font-light text-[clamp(38px,5.4vw,62px)] leading-[1.0] tracking-tight">
                    Set a new <em>password</em>
                  </h1>
                  <p className="body-copy text-ink-a45">
                    {recoveryComplete
                      ? 'Your password has been updated. The recovery session is complete.'
                      : 'Choose a new password for your patron account. Minimum eight characters.'}
                  </p>
                </div>

                {!recoveryComplete ? (
                  <form onSubmit={handleRecoveryPassword} className="space-y-6">
                    <div>
                      <label htmlFor="auth-recovery-password" className="field-label">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          id="auth-recovery-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="field pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-ink-a45 hover:text-ink cursor-pointer"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="auth-recovery-confirm" className="field-label">
                        Confirm New Password
                      </label>
                      <input
                        id="auth-recovery-confirm"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="field"
                      />
                    </div>

                    {changePassError && (
                      <p className="label inline-flex items-start gap-2 text-ink border-b border-dashed border-ink pb-1">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-[1px]" />
                        <span>{changePassError}</span>
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={changePassLoading}
                      className="w-full btn btn-primary btn-lg justify-between"
                    >
                      {changePassLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <span>Update Password</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-6">
                    <div className="border border-ink-a18 p-6 space-y-3">
                      <CheckCircle2 className="w-5 h-5 text-ink" />
                      <p className="label text-ink">Password updated</p>
                      <p className="body-copy text-ink-a45">
                        Your credentials are current. Continue to your patron dashboard.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryComplete(false);
                        clearPasswordRecovery();
                      }}
                      className="w-full btn btn-primary btn-lg justify-between"
                    >
                      <span>Continue to Dashboard</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="pt-4 border-t border-ink-a18">
                  <button
                    type="button"
                    onClick={async () => {
                      setRecoveryComplete(false);
                      await signOut();
                    }}
                    className="label text-ink-a45 hover:text-ink underline underline-offset-4 cursor-pointer"
                  >
                    Cancel recovery and sign out
                  </button>
                </div>
              </div>
            ) : user ? (
              <div className="space-y-10 animate-fadeIn">
                {/* Header */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="label text-ink-a45">Authenticated Session</span>
                    <span className="inline-flex items-center gap-2 label text-ink">
                      <span className="w-1.5 h-1.5 bg-ink" />
                      Active
                    </span>
                  </div>
                  <h1 className="font-display font-light text-[clamp(36px,5vw,56px)] leading-[1.02] tracking-tight">
                    Patron <em>dashboard</em>
                  </h1>
                  <p className="font-mono text-[12px] tracking-[0.12em] text-ink-a45 break-all">
                    {user.email}
                  </p>
                </div>

                {/* VIP Executive Access: Only visible when signed in as huxaifa0fficial@gmail.com */}
                {isUserDesignatedAdmin && (
                  <div className="border border-ink-a18 p-6 sm:p-8 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="w-5 h-5 text-ink" />
                        <span className="label text-ink">Executive Console Ready</span>
                      </div>
                      <span className="label text-ink-a45">Owner Authorization</span>
                    </div>

                    <p className="body-copy text-ink-a45">
                      Master administrator authorization recognized. Access catalog engineering,
                      inventory stock, orders, and studio telemetry.
                    </p>

                    <button
                      type="button"
                      onClick={onNavigateAdmin}
                      className="w-full btn btn-primary group"
                    >
                      <span>Enter Atelier Management Terminal</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>

                    {/* Direct Terminal URL */}
                    <div className="pt-4 border-t border-ink-a18 space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <span className="label text-ink-a45">Direct Terminal Path</span>
                        <button
                          type="button"
                          onClick={handleCopyAdminPath}
                          className="flex items-center gap-1.5 label text-ink-a72 hover:text-ink underline underline-offset-4 cursor-pointer"
                        >
                          {copiedPath ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy Path</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="font-mono text-[12px] tracking-[0.1em] break-all select-all text-ink-a72">
                        {ADMIN_SECRET_PATH}
                      </div>
                    </div>
                  </div>
                )}

                {/* Patron Metrics: borderless typographic grid */}
                <div className="grid grid-cols-2 gap-6 py-6 border-y border-ink-a18">
                  <div className="space-y-2">
                    <span className="label text-ink-a45 block">Patron Status</span>
                    <span className="text-[13px] tracking-[0.04em] text-ink">
                      {isUserDesignatedAdmin ? 'Executive Administrator' : 'Verified Patron'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <span className="label text-ink-a45 block">Session Clearance</span>
                    <span className="text-[13px] tracking-[0.04em] text-ink-a72">
                      Encrypted Token
                    </span>
                  </div>
                  <div
                    onClick={onOpenWishlist}
                    className="space-y-2 cursor-pointer group"
                  >
                    <span className="label text-ink-a45 block group-hover:text-ink transition-colors">
                      Archival Wishlist
                    </span>
                    <span className="text-[13px] tracking-[0.04em] text-ink flex items-center gap-2">
                      <span>{wishlistCount} Pieces</span>
                      <Heart className="w-3.5 h-3.5 text-ink-a45 group-hover:text-ink transition-colors" />
                    </span>
                  </div>
                  <div
                    onClick={onOpenCart}
                    className="space-y-2 cursor-pointer group"
                  >
                    <span className="label text-ink-a45 block group-hover:text-ink transition-colors">
                      Shopping Bag
                    </span>
                    <span className="text-[13px] tracking-[0.04em] text-ink flex items-center gap-2">
                      <span>{cartCount} Items</span>
                      <ShoppingBag className="w-3.5 h-3.5 text-ink-a45 group-hover:text-ink transition-colors" />
                    </span>
                  </div>
                </div>

                {/* Change Password Panel */}
                <div className="space-y-4">
                  <h3 className="label text-ink flex items-center gap-2">
                    <Key className="w-3.5 h-3.5" />
                    <span>Update Credentials</span>
                  </h3>
                  <form onSubmit={handleChangePassword} className="space-y-6">
                    <div>
                      <label htmlFor="auth-new-password" className="field-label">
                        New Password
                      </label>
                      <input
                        id="auth-new-password"
                        type="password"
                        placeholder="New password (minimum 8 characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="field"
                      />
                    </div>
                    {changePassError && (
                      <p className="label inline-block text-ink border-b border-dashed border-ink pb-1">
                        {changePassError}
                      </p>
                    )}
                    {changePassSuccess && (
                      <p className="label text-ink border-b border-ink pb-1 inline-block">
                        {changePassSuccess}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={changePassLoading}
                      className="w-full btn btn-primary"
                    >
                      {changePassLoading ? 'Updating...' : 'Update Password'}
                    </button>
                  </form>
                </div>

                {/* Return / Sign Out Actions */}
                <div className="pt-6 border-t border-ink-a18 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={onNavigateHome}
                    className="label text-ink-a45 hover:text-ink underline underline-offset-4 cursor-pointer"
                  >
                    Return to Storefront
                  </button>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="flex items-center gap-2 label text-ink-a45 hover:text-ink transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : verificationSent ? (
              <div className="space-y-8 animate-fadeIn">
                <div className="space-y-3">
                  <span className="label text-ink-a45">Registration received</span>
                  <h1 className="font-display font-light text-[clamp(38px,5.4vw,62px)] leading-[1.0] tracking-tight">
                    Check your <em>inbox</em>
                  </h1>
                  <p className="body-copy text-ink-a45">
                    We sent a verification link to{' '}
                    <span className="text-ink break-all">{email}</span>. Confirm your address to
                    activate the patron account.
                  </p>
                </div>

                {resendMessage && (
                  <p className="label inline-flex items-start gap-2 text-ink border-b border-ink pb-1">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-[1px]" />
                    <span>{resendMessage}</span>
                  </p>
                )}
                {errorMessage && (
                  <p className="label inline-flex items-start gap-2 text-ink border-b border-dashed border-ink pb-1">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-[1px]" />
                    <span>{errorMessage}</span>
                  </p>
                )}

                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendLoading}
                    className="w-full btn btn-primary btn-lg justify-between"
                  >
                    {resendLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Resending...</span>
                      </>
                    ) : (
                      <>
                        <span>Resend Verification Link</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('signin')}
                    className="label text-ink-a45 hover:text-ink underline underline-offset-4 cursor-pointer"
                  >
                    ← Return to Sign In
                  </button>
                </div>
              </div>
            ) : resetSent ? (
              <div className="space-y-8 animate-fadeIn">
                <div className="space-y-3">
                  <span className="label text-ink-a45">Recovery dispatched</span>
                  <h1 className="font-display font-light text-[clamp(38px,5.4vw,62px)] leading-[1.0] tracking-tight">
                    Check your <em>inbox</em>
                  </h1>
                  <p className="body-copy text-ink-a45">
                    If an account exists for{' '}
                    <span className="text-ink break-all">{email}</span>, a password reset link is on
                    its way. Open it on this device to set a new password.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleModeSwitch('signin')}
                  className="w-full btn btn-primary btn-lg justify-between"
                >
                  <span>Return to Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* If user is NOT authenticated: Show Sign In / Sign Up / Forgot Password */
              <div className="space-y-8 animate-fadeIn">
                {/* Mode switcher */}
                <div className="flex items-center gap-4 sm:gap-6">
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('signin')}
                    className={`label transition-colors cursor-pointer py-2 border-b ${
                      mode === 'signin'
                        ? 'text-ink border-ink'
                        : 'text-ink-a45 border-transparent hover:text-ink'
                    }`}
                  >
                    Sign In
                  </button>
                  {!adminIntent && (
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('signup')}
                      className={`label transition-colors cursor-pointer py-2 border-b ${
                        mode === 'signup'
                          ? 'text-ink border-ink'
                          : 'text-ink-a45 border-transparent hover:text-ink'
                      }`}
                    >
                      Register
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('forgot')}
                    className={`label transition-colors cursor-pointer py-2 border-b ${
                      mode === 'forgot'
                        ? 'text-ink border-ink'
                        : 'text-ink-a45 border-transparent hover:text-ink'
                    }`}
                  >
                    Recovery
                  </button>
                </div>

                {/* Heading & Subtitle */}
                <div className="space-y-3">
                  <h1 className="font-display font-light text-[clamp(38px,5.4vw,62px)] leading-[1.0] tracking-tight">
                    {modeHeading[mode]}
                  </h1>
                  <p className="body-copy text-ink-a45">
                    {mode === 'signin' &&
                      (adminIntent
                        ? 'Sign in with the designated administrator account to open the management terminal.'
                        : 'Sign in with your email to view order allocations, reserve pieces, and access your patron profile.')}
                    {mode === 'signup' &&
                      'Register with the atelier to establish your patron credentials and access archival drops.'}
                    {mode === 'forgot' &&
                      'Enter your registered email address to receive password reset instructions.'}
                  </p>
                </div>

                {/* Status messages — typography only */}
                {errorMessage && (
                  <div role="alert" className="animate-fadeIn">
                    <p className="label inline-flex items-start gap-2 text-ink border-b border-dashed border-ink pb-1 leading-relaxed">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-[1px]" />
                      <span>{errorMessage}</span>
                    </p>
                  </div>
                )}

                {successMessage && (
                  <div className="animate-fadeIn">
                    <p className="label inline-flex items-start gap-2 text-ink border-b border-ink pb-1 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-[1px]" />
                      <span>{successMessage}</span>
                    </p>
                  </div>
                )}

                {/* FORMS */}
                {mode === 'signin' && (
                  <form onSubmit={handleSignIn} className="space-y-6 pt-2">
                    <div>
                      <label htmlFor="auth-signin-email" className="field-label">
                        Email Address
                      </label>
                      <input
                        id="auth-signin-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="patron@example.com"
                        className="field"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-4">
                        <label htmlFor="auth-signin-password" className="field-label">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => handleModeSwitch('forgot')}
                          className="label text-ink-a45 hover:text-ink underline underline-offset-4 cursor-pointer mb-2"
                        >
                          Forgot?
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          id="auth-signin-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="field pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-ink-a45 hover:text-ink cursor-pointer"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px] text-[13px] tracking-[0.04em] text-ink-a72">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 accent-paper cursor-pointer"
                        />
                        <span>Remember credentials</span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full btn btn-primary btn-lg justify-between"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Authenticating...</span>
                        </>
                      ) : (
                        <>
                          <span>Sign In to Atelier</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                )}

                {mode === 'signup' && (
                  <form onSubmit={handleSignUp} className="space-y-6 pt-2">
                    <div>
                      <label htmlFor="auth-signup-name" className="field-label">
                        Full Name / Patron Alias
                      </label>
                      <input
                        id="auth-signup-name"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Full name"
                        className="field"
                      />
                    </div>

                    <div>
                      <label htmlFor="auth-signup-email" className="field-label">
                        Email Address
                      </label>
                      <input
                        id="auth-signup-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="patron@example.com"
                        className="field"
                      />
                    </div>

                    <div>
                      <label htmlFor="auth-signup-password" className="field-label">
                        Password (Min. 8 Characters)
                      </label>
                      <div className="relative">
                        <input
                          id="auth-signup-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="field pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-ink-a45 hover:text-ink cursor-pointer"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="auth-signup-confirm" className="field-label">
                        Confirm Password
                      </label>
                      <input
                        id="auth-signup-confirm"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="field"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full btn btn-primary btn-lg justify-between"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Registering...</span>
                        </>
                      ) : (
                        <>
                          <span>Create Account</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                )}

                {mode === 'forgot' && (
                  <form onSubmit={handleResetPassword} className="space-y-6 pt-2">
                    <div>
                      <label htmlFor="auth-forgot-email" className="field-label">
                        Registered Email Address
                      </label>
                      <input
                        id="auth-forgot-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="patron@example.com"
                        className="field"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full btn btn-primary btn-lg justify-between"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Sending Instructions...</span>
                        </>
                      ) : (
                        <>
                          <span>Dispatch Reset Link</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => handleModeSwitch('signin')}
                        className="label text-ink-a45 hover:text-ink underline underline-offset-4 cursor-pointer"
                      >
                        ← Return to Sign In
                      </button>
                    </div>
                  </form>
                )}

                {/* Patron privileges */}
                {!adminIntent && (
                  <div className="pt-8 space-y-4 border-t border-ink-a18">
                    <span className="label text-ink-a45 block">Discerning Patron Benefits</span>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] tracking-[0.04em] text-ink-a72">
                      <li className="flex items-center gap-2">
                        <span className="w-1 h-1 shrink-0 bg-ink-a45" />
                        <span>Seasonal archival allocations</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1 h-1 shrink-0 bg-ink-a45" />
                        <span>Live restock notifications</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1 h-1 shrink-0 bg-ink-a45" />
                        <span>Private curated wishlist</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1 h-1 shrink-0 bg-ink-a45" />
                        <span>Permanent garment care records</span>
                      </li>
                    </ul>
                  </div>
                )}

                {/* Micro footnote */}
                <div className="pt-4">
                  <p className="label text-ink-a45">
                    Zejesh Atelier · Helsinki · Porto
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {adminIntent && (
        <footer className="admin-auth-foot">
          <span>Zejesh Atelier</span>
          <span>Helsinki · Porto</span>
        </footer>
      )}
    </div>
  );
};
