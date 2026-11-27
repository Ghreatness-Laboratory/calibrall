'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { UserPreferences } from '@/types';
import {
  getStoredPreferences,
  setStoredPreferences,
} from '@/lib/storage/userStorage';
import { CANONICAL_COMPETITIONS } from '@/lib/data/canonicalCompetitions';
import { useAuth, type AuthUserSummary } from '@/lib/context/AuthContext';
import {
  CheckCircle2,
  Contrast,
  Sliders,
  ShieldCheck,
  ChevronRight,
  LogOut,
  Trash2,
  AlertTriangle,
  Lock,
  Loader2,
  Calendar,
  Receipt,
  CreditCard,
} from 'lucide-react';
import AccountInstallRow from '@/components/pwa/AccountInstallRow';
import ChangePlanSheet from '@/components/ChangePlanSheet';
import {
  TIER_RULES,
  formatMonthlyPrice,
  formatNaira,
  getPaidRenewalBannerState,
} from '@/lib/tiers';
import type { UserPaymentReceipt } from '@/lib/payments/paystackService';

function formatPlanDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getAccountPlanStatusDisplay(
  user: AuthUserSummary | null,
  isAdmin: boolean
): { badge: string; detail: string; isExpired: boolean } {
  if (isAdmin || user?.entitlementStatus === 'admin') {
    return {
      badge: 'Admin: full access',
      detail: 'Admin: full access — Never expires',
      isExpired: false,
    };
  }

  if (!user) {
    return {
      badge: 'Trial',
      detail: 'Loading account status...',
      isExpired: false,
    };
  }

  if (user.entitlementStatus === 'paid') {
    const planName = (user.storedTier ?? user.tier) === 'premium' ? TIER_RULES.premium.name : TIER_RULES.pro.name;
    const untilDate = formatPlanDate(user.tierExpiresAt);
    return {
      badge: planName,
      detail: untilDate
        ? user.cancelAtPeriodEnd
          ? `${planName} active until ${untilDate} (not renewing)`
          : `${planName} until ${untilDate}`
        : `${planName} (Active)`,
      isExpired: false,
    };
  }

  if (user.entitlementStatus === 'trial') {
    const days = Math.max(1, user.trialDaysRemaining || 1);
    const dayWord = days === 1 ? 'day' : 'days';
    const endsDate = formatPlanDate(user.trialEndsAt);
    return {
      badge: `Trial (${days}d left)`,
      detail: endsDate
        ? `Trial: ${days} ${dayWord} left (ends ${endsDate})`
        : `Trial: ${days} ${dayWord} left`,
      isExpired: false,
    };
  }

  const endedDate = formatPlanDate(user.tierExpiresAt || user.trialEndsAt);
  return {
    badge: 'Expired',
    detail: endedDate ? `Expired on ${endedDate}` : 'Expired',
    isExpired: true,
  };
}

export default function AccountSettingsView() {
  const { user, isAdmin, refreshProfile, signOutAndClearCaches } = useAuth();
  const [displayName, setDisplayName] = useState<string>('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<string>('');
  const [profileError, setProfileError] = useState<string>('');

  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [isMonochrome, setIsMonochrome] = useState<boolean>(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');
  const [signingOut, setSigningOut] = useState(false);

  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [planActionBusy, setPlanActionBusy] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [payments, setPayments] = useState<UserPaymentReceipt[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const loadPlanHistory = React.useCallback(async () => {
    if (!user || isAdmin) {
      setPayments([]);
      return;
    }
    setPaymentsLoading(true);
    try {
      const res = await fetch('/api/account/plan', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json.payments)) {
        setPayments(json.payments as UserPaymentReceipt[]);
      }
    } catch {
      // silent fallback
    } finally {
      setPaymentsLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    setPrefs(getStoredPreferences());
    try {
      const saved = localStorage.getItem('calibrall_monochrome_mode') === 'true';
      setIsMonochrome(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      void loadPlanHistory();
    }
  }, [user, loadPlanHistory]);

  const handleToggleMonochrome = (enabled: boolean) => {
    setIsMonochrome(enabled);
    try {
      if (enabled) {
        document.documentElement.classList.add('monochrome');
        localStorage.setItem('calibrall_monochrome_mode', 'true');
      } else {
        document.documentElement.classList.remove('monochrome');
        localStorage.setItem('calibrall_monochrome_mode', 'false');
      }
    } catch {}
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileStatus('');
    const trimmed = displayName.trim();
    if (!trimmed) {
      setProfileError('Display name cannot be empty.');
      return;
    }

    setProfileSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(json?.error || 'Could not update display name.');
        return;
      }
      await refreshProfile();
      setProfileStatus('Name updated');
      setTimeout(() => setProfileStatus(''), 2500);
    } catch {
      setProfileError('Could not update display name.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSavePrefs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefs) return;
    setStoredPreferences(prefs);
    setSaveStatus('Preferences saved');
    setTimeout(() => setSaveStatus(''), 2500);
  };

  const toggleCompetition = (code: string) => {
    if (!prefs) return;
    const list = prefs.preferredCompetitions.includes(code)
      ? prefs.preferredCompetitions.filter((c) => c !== code)
      : [...prefs.preferredCompetitions, code];
    setPrefs({ ...prefs, preferredCompetitions: list });
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOutAndClearCaches('/login');
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError('');
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm permanent account removal.');
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(json?.error || 'Account deletion failed.');
        setDeleting(false);
        return;
      }
      await signOutAndClearCaches('/');
    } catch {
      setDeleteError('Account deletion failed.');
      setDeleting(false);
    }
  };

  if (!prefs) return null;

  const planStatus = getAccountPlanStatusDisplay(user, isAdmin);
  const initialLetter = (user?.displayName || user?.email || 'U').trim().charAt(0).toUpperCase();
  const isPaidUser = !isAdmin && user?.entitlementStatus === 'paid';
  const paidRenewal = getPaidRenewalBannerState({
    entitlementStatus: user?.entitlementStatus,
    tier: user?.tier,
    tierExpiresAt: user?.tierExpiresAt,
    cancelAtPeriodEnd: user?.cancelAtPeriodEnd,
    isAdmin,
  });
  const pendingDateStr = formatPlanDate(user?.pendingTierEffectiveAt || user?.tierExpiresAt);
  const expiryDateStr = formatPlanDate(user?.tierExpiresAt);

  const handlePlanMutation = async (
    action: 'cancel_pending_downgrade' | 'resume_renewal',
    successMessage: string
  ) => {
    setPlanActionBusy(action);
    setPlanNotice(null);
    try {
      const res = await fetch('/api/account/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await refreshProfile();
        await loadPlanHistory();
        setPlanNotice(successMessage);
      }
    } finally {
      setPlanActionBusy(null);
    }
  };

  const handleQuickRenew = async () => {
    if (!user || isAdmin) return;
    const targetPlan = (user.storedTier ?? user.tier) === 'premium' ? 'premium' : 'pro';
    setPlanActionBusy('renew_now');
    setPlanNotice(null);
    try {
      const res = await fetch('/api/payments/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.authorizationUrl) {
        window.location.href = String(json.authorizationUrl);
        return;
      }
      setPlanNotice(json?.error || 'Could not start renewal checkout.');
    } catch {
      setPlanNotice('Unable to reach Paystack right now.');
    } finally {
      setPlanActionBusy(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 py-1">
      <div className="space-y-1">
        <h1 className="font-display text-[26px] font-bold leading-[1.15] text-[var(--text)] tracking-[-0.02em]">
          Account &amp; preferences
        </h1>
        <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
          Manage your account details, plan status, renewals, and preferences.
        </p>
      </div>

      {/* Authenticated Profile & Real Plan Status */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center font-display font-bold text-[15px] text-[var(--text)] shrink-0">
              {initialLetter}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-[14.5px] font-semibold text-[var(--text)] truncate">
                  {user?.displayName || user?.email || 'Signed in account'}
                </h2>
                <span
                  className={`text-[10.5px] px-2.5 py-0.5 rounded-full border font-semibold ${
                    planStatus.isExpired
                      ? 'border-[var(--danger)]/40 bg-[var(--danger-soft)] text-[var(--danger)]'
                      : 'border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]'
                  }`}
                >
                  {planStatus.badge}
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-2)] truncate mt-0.5">
                {user?.email || 'Authenticated session'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2.5 bg-[var(--surface-2)] border border-[var(--line)] rounded-[14px] p-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[12.5px]">
            <div className="flex items-center gap-2 text-[var(--text)] font-medium">
              <Calendar className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>{planStatus.detail}</span>
            </div>

            {!isAdmin && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {paidRenewal.showRenewButton && (
                  <button
                    type="button"
                    disabled={Boolean(planActionBusy)}
                    onClick={handleQuickRenew}
                    className="min-h-[44px] px-4 rounded-[10px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12.5px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 touch-press"
                  >
                    {planActionBusy === 'renew_now' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CreditCard className="w-3.5 h-3.5" />
                    )}
                    <span>Renew now</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setChangePlanOpen(true)}
                  className={`min-h-[44px] px-4 rounded-[10px] text-[12.5px] font-bold inline-flex items-center justify-center gap-1.5 touch-press ${
                    paidRenewal.showRenewButton
                      ? 'border border-[var(--line)] bg-[var(--surface)] text-[var(--text)]'
                      : 'bg-[var(--accent-fill)] text-[var(--accent-ink)]'
                  }`}
                >
                  <span>{isPaidUser ? 'Change plan' : 'Choose a plan'}</span>
                </button>
              </div>
            )}
          </div>

          {!isAdmin && isPaidUser && user?.pendingTier === 'pro' && (
            <div className="pt-2 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px]">
              <span className="text-[var(--medium)] font-medium">
                Switches to Pro on {pendingDateStr || 'period end'}
              </span>
              <button
                type="button"
                disabled={Boolean(planActionBusy)}
                onClick={() =>
                  handlePlanMutation('cancel_pending_downgrade', 'Scheduled switch to Pro cancelled.')
                }
                className="min-h-[44px] px-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] text-[12px] font-semibold text-[var(--text)] touch-press"
              >
                Cancel pending switch
              </button>
            </div>
          )}

          {!isAdmin && isPaidUser && user?.cancelAtPeriodEnd && (
            <div className="pt-2 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px]">
              <span className="text-[var(--medium)] font-medium">
                Renewal stopped. Plan ends on {expiryDateStr || 'expiry'} and moves to expired.
              </span>
              <button
                type="button"
                disabled={Boolean(planActionBusy)}
                onClick={() => handlePlanMutation('resume_renewal', 'Plan resumed.')}
                className="min-h-[44px] px-4 rounded-[10px] bg-[var(--accent-soft)] border border-[var(--accent)] text-[12px] font-bold text-[var(--accent)] touch-press"
              >
                Resume
              </button>
            </div>
          )}

          {!isAdmin && (
            <div className="pt-2 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--text-2)]">
              <span>
                Pro: <strong className="text-[var(--text)]">{formatMonthlyPrice('pro')}</strong> · Premium:{' '}
                <strong className="text-[var(--text)]">{formatMonthlyPrice('premium')}</strong>
              </span>
              <Link href="/pricing" className="text-[var(--accent)] font-semibold hover:underline">
                Compare plans
              </Link>
            </div>
          )}

          {planNotice && (
            <div className="text-[12px] text-[var(--accent)] font-medium">{planNotice}</div>
          )}
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-2.5 pt-1 border-t border-[var(--line)]">
          <label htmlFor="account-display-name" className="block text-[12px] font-medium text-[var(--text-2)]">
            Display name
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="account-display-name"
              type="text"
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              className="flex-1 min-h-[44px] px-3.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={profileSaving}
              className="min-h-[44px] px-4 rounded-[12px] bg-[var(--surface-2)] hover:border-[var(--accent)] border border-[var(--line)] text-[12.5px] font-semibold text-[var(--text)] flex items-center justify-center gap-1.5 disabled:opacity-50 touch-press"
            >
              {profileSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save name</span>
            </button>
          </div>
          {profileStatus && (
            <div className="text-[11.5px] text-[var(--accent)] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{profileStatus}</span>
            </div>
          )}
          {profileError && (
            <div className="text-[11.5px] text-[var(--danger)]">{profileError}</div>
          )}
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--line)]">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="min-h-[44px] px-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-[13px] font-semibold text-[var(--text)] flex items-center gap-2 touch-press disabled:opacity-50"
          >
            {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            <span>{signingOut ? 'Signing out...' : 'Sign out'}</span>
          </button>

          {isAdmin && (
            <Link
              href="/admin"
              className="min-h-[44px] px-4 rounded-[12px] bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[13px] font-semibold text-[var(--accent)] flex items-center gap-1.5 touch-press"
            >
              <Lock className="w-4 h-4" />
              <span>System admin</span>
            </Link>
          )}
        </div>
      </div>

      <AccountInstallRow />

      {/* Analytical Preferences */}
      {!planStatus.isExpired && (
        <form onSubmit={handleSavePrefs} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[12px] font-medium text-[var(--text-2)]">
                Analytical preferences
              </span>
              {saveStatus && (
                <span className="flex items-center gap-1 text-[11px] text-[var(--accent)] font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                  <span>{saveStatus}</span>
                </span>
              )}
            </div>

            <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] divide-y divide-[var(--line)] overflow-hidden">
              <div className="p-4 space-y-2.5">
                <div className="flex items-center justify-between text-[12.5px]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                      <Sliders className="w-4 h-4" strokeWidth={2} />
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-[var(--text)]">
                        Min model probability
                      </h3>
                      <p className="text-[11.5px] text-[var(--text-2)]">
                        Filter out predictions below this threshold
                      </p>
                    </div>
                  </div>
                  <span className="font-display text-[var(--accent)] font-bold tabular-nums text-[13px]">
                    {(prefs.minProbabilityThreshold * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.40"
                  max="0.80"
                  step="0.01"
                  value={prefs.minProbabilityThreshold}
                  onChange={(e) =>
                    setPrefs({ ...prefs, minProbabilityThreshold: parseFloat(e.target.value) })
                  }
                  className="w-full h-2 accent-[var(--accent-fill)] cursor-pointer bg-[var(--surface-2)] rounded-full"
                />
              </div>

              <div className="p-4 space-y-2.5">
                <h3 className="text-[13px] font-semibold text-[var(--text)]">
                  Preferred competitions
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.values(CANONICAL_COMPETITIONS)
                    .filter((c) => c.id !== 'comp_nba')
                    .map((c) => {
                      const active = prefs.preferredCompetitions.includes(c.code);
                      return (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => toggleCompetition(c.code)}
                          className={`min-h-[44px] px-3 rounded-[12px] border text-[12px] font-medium flex items-center justify-between transition-colors touch-press ${
                            active
                              ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                              : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                          }`}
                        >
                          <span className="truncate">{c.name}</span>
                          {active && (
                            <CheckCircle2
                              className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 ml-1"
                              strokeWidth={2}
                            />
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[12px] font-medium text-[var(--text-2)] px-1">
              Display theme
            </div>
            <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] overflow-hidden">
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <Contrast className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-[var(--text)] leading-tight">
                      {isMonochrome ? 'Noir monochrome mode' : 'System adaptive theme'}
                    </h3>
                    <p className="text-[11.5px] text-[var(--text-2)] leading-tight mt-0.5">
                      {isMonochrome
                        ? 'High contrast grayscale styling'
                        : 'Honors system light/dark appearance'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleMonochrome(!isMonochrome)}
                  className="min-h-[44px] px-3.5 rounded-[12px] bg-[var(--surface-2)] hover:border-[var(--border-strong)] border border-[var(--line)] text-[12px] font-medium text-[var(--text)] shrink-0 touch-press"
                >
                  {isMonochrome ? 'Color mode' : 'Monochrome'}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[46px] rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] font-bold text-[14px] flex items-center justify-center transition-all duration-150 touch-press"
          >
            <span>Save preferences</span>
          </button>
        </form>
      )}

      {/* Payment History Receipts */}
      {!isAdmin && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[12px] font-medium text-[var(--text-2)]">
              Payment history
            </span>
          </div>
          <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] p-4 space-y-2.5">
            {paymentsLoading && payments.length === 0 ? (
              <div className="text-[12px] text-[var(--text-2)] flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                <span>Loading receipts...</span>
              </div>
            ) : payments.length === 0 ? (
              <div className="text-[12px] text-[var(--text-2)] flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[var(--text-3)] shrink-0" />
                <span>No payment receipts recorded yet.</span>
              </div>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {payments.map((receipt) => {
                  const dateLabel = formatPlanDate(receipt.paidAt || receipt.createdAt) || 'Pending';
                  const amountLabel = receipt.isManualGrant
                    ? 'Manual grant'
                    : formatNaira(receipt.amountKobo / 100);
                  const isOk = receipt.status === 'success' || receipt.isManualGrant;
                  return (
                    <div
                      key={receipt.id}
                      className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px]"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--text)] capitalize">
                            {receipt.plan}
                          </span>
                          <span className="text-[var(--text-3)]">·</span>
                          <span className="text-[var(--text-2)]">{dateLabel}</span>
                        </div>
                        <div className="text-[11px] font-mono text-[var(--text-3)] truncate">
                          {receipt.reference}
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                        <span className="font-display font-bold text-[var(--text)] tabular-nums">
                          {amountLabel}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold uppercase ${
                            isOk
                              ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30'
                              : receipt.status === 'pending'
                              ? 'bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30'
                              : 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30'
                          }`}
                        >
                          {receipt.isManualGrant ? 'grant' : receipt.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Governance & Legal */}
      <div className="space-y-1.5">
        <div className="text-[12px] font-medium text-[var(--text-2)] px-1">
          Legal &amp; plans
        </div>
        <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] divide-y divide-[var(--line)] overflow-hidden">
          {!planStatus.isExpired && (
            <Link
              href="/methodology"
              className="min-h-[52px] p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)] transition-colors touch-press"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span className="text-[13px] font-semibold text-[var(--text)]">Model methodology</span>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--text-2)]" />
            </Link>
          )}
          <Link
            href="/pricing"
            className="min-h-[52px] p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)] transition-colors touch-press"
          >
            <span className="text-[13px] font-semibold text-[var(--text)]">Plans &amp; upgrade</span>
            <ChevronRight className="w-4 h-4 text-[var(--text-2)]" />
          </Link>
          <Link
            href="/terms"
            className="min-h-[52px] p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)] transition-colors touch-press"
          >
            <span className="text-[13px] font-semibold text-[var(--text)]">Terms of service</span>
            <ChevronRight className="w-4 h-4 text-[var(--text-2)]" />
          </Link>
          <Link
            href="/privacy"
            className="min-h-[52px] p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)] transition-colors touch-press"
          >
            <span className="text-[13px] font-semibold text-[var(--text)]">Privacy policy</span>
            <ChevronRight className="w-4 h-4 text-[var(--text-2)]" />
          </Link>
        </div>
      </div>

      {/* Delete Account */}
      <div className="border border-[var(--danger)]/30 bg-[var(--surface)] rounded-[18px] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[var(--danger)] shrink-0" />
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--text)]">Delete account</h3>
              <p className="text-[11.5px] text-[var(--text-2)]">
                Permanently remove your account and profile data.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDeleteOpen(!deleteOpen);
              setDeleteError('');
            }}
            className="min-h-[44px] px-3 rounded-[10px] border border-[var(--danger)]/40 text-[12px] font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)] shrink-0 touch-press"
          >
            {deleteOpen ? 'Cancel' : 'Delete account'}
          </button>
        </div>

        {deleteOpen && (
          <form onSubmit={handleDeleteAccount} className="space-y-2.5 pt-2 border-t border-[var(--line)]">
            <p className="text-[12px] text-[var(--text-2)]">
              Type <strong className="text-[var(--text)]">DELETE</strong> below to confirm permanent account deletion. This cannot be undone.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--danger)]"
            />
            {deleteError && (
              <div className="text-[12px] text-[var(--danger)]">{deleteError}</div>
            )}
            <button
              type="submit"
              disabled={deleting}
              className="w-full min-h-[44px] rounded-[12px] bg-[var(--danger)] text-white font-semibold text-[13px] flex items-center justify-center gap-2 disabled:opacity-50 touch-press"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>{deleting ? 'Deleting account...' : 'Permanently delete account'}</span>
            </button>
          </form>
        )}
      </div>

      <ChangePlanSheet
        open={changePlanOpen}
        onClose={() => setChangePlanOpen(false)}
        onPlanUpdated={async () => {
          await refreshProfile();
          await loadPlanHistory();
        }}
      />
    </div>
  );
}
