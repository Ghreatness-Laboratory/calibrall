'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Check,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Calendar,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import {
  TIER_RULES,
  ADMIN_OVERRIDE_RULE,
  TRIAL_DAYS,
  formatMonthlyPrice,
  formatNaira,
  getPaidRenewalBannerState,
} from '@/lib/tiers';
import ChangePlanSheet, { type PlanStateResponse } from '@/components/ChangePlanSheet';

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function PricingContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const cancelledParam = searchParams.get('cancelled');
  const reference = searchParams.get('reference') || searchParams.get('trxref');
  const { user, isAuthenticated, isAdmin, refreshProfile } = useAuth();

  const [planState, setPlanState] = useState<PlanStateResponse | null>(null);
  const [checkingOutPlan, setCheckingOutPlan] = useState<'pro' | 'premium' | null>(null);
  const [confirmUpgradeOpen, setConfirmUpgradeOpen] = useState(false);
  const [mutatingAction, setMutatingAction] = useState<string | null>(null);
  const [verifyingRef, setVerifyingRef] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [retryPlan, setRetryPlan] = useState<'pro' | 'premium' | null>(null);
  const [verifiedSuccess, setVerifiedSuccess] = useState<string | null>(null);
  const [planActionNotice, setPlanActionNotice] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetFocusPlan, setSheetFocusPlan] = useState<'pro' | 'premium' | null>(null);

  const loadPlanState = useCallback(async () => {
    if (!isAuthenticated) {
      setPlanState(null);
      return;
    }
    try {
      const res = await fetch('/api/account/plan', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.quotes) {
        setPlanState(json as PlanStateResponse);
      }
    } catch {
      // silent fallback to session summary
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void loadPlanState();
  }, [loadPlanState, user?.tier, user?.tierExpiresAt, user?.pendingTier, user?.cancelAtPeriodEnd]);

  useEffect(() => {
    if (cancelledParam === '1' && !reference) {
      let lastPlan: 'pro' | 'premium' = 'pro';
      try {
        const stored = sessionStorage.getItem('calibrall_last_checkout_plan');
        if (stored === 'premium') lastPlan = 'premium';
      } catch {}
      setRetryPlan(lastPlan);
      setCheckoutError('Payment was cancelled before completion. Your current plan has not changed.');
    }
  }, [cancelledParam, reference]);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;

    const verifyPayment = async () => {
      setVerifyingRef(true);
      setCheckoutError(null);
      setRetryPlan(null);
      try {
        const res = await fetch(
          `/api/payments/paystack/verify?reference=${encodeURIComponent(reference)}`,
          { cache: 'no-store' }
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.verified) {
          const attempted = String(json?.plan || '').toLowerCase() === 'premium' ? 'premium' : 'pro';
          setRetryPlan(attempted);
          setCheckoutError(
            json?.error ||
              'Payment could not be confirmed yet. Your current plan has not changed.'
          );
          return;
        }
        await refreshProfile();
        await loadPlanState();
        const planLabel = String(json.plan || 'pro').toLowerCase() === 'premium' ? 'Premium' : 'Pro';
        setVerifiedSuccess(
          `${planLabel} plan activated until ${formatShortDate(json.tierExpiresAt) || 'next cycle'}.`
        );
      } catch {
        if (!cancelled) {
          let lastPlan: 'pro' | 'premium' = 'pro';
          try {
            const stored = sessionStorage.getItem('calibrall_last_checkout_plan');
            if (stored === 'premium') lastPlan = 'premium';
          } catch {}
          setRetryPlan(lastPlan);
          setCheckoutError(
            'Unable to verify Paystack transaction right now. Your current plan has not changed.'
          );
        }
      } finally {
        if (!cancelled) setVerifyingRef(false);
      }
    };

    void verifyPayment();
    return () => {
      cancelled = true;
    };
  }, [reference, refreshProfile, loadPlanState]);

  const handleCheckout = async (plan: 'pro' | 'premium') => {
    setCheckoutError(null);
    setPlanActionNotice(null);
    setRetryPlan(null);
    setCheckingOutPlan(plan);
    try {
      try {
        sessionStorage.setItem('calibrall_last_checkout_plan', plan);
      } catch {}

      const res = await fetch('/api/payments/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.authorizationUrl) {
        setRetryPlan(plan);
        setCheckoutError(
          json?.error || 'Could not start Paystack checkout. Your plan has not changed.'
        );
        setCheckingOutPlan(null);
        return;
      }
      window.location.href = String(json.authorizationUrl);
    } catch {
      setRetryPlan(plan);
      setCheckoutError(
        'Could not connect to Paystack checkout. Your plan has not changed.'
      );
      setCheckingOutPlan(null);
    }
  };

  const handlePlanMutation = async (
    action: 'schedule_downgrade' | 'cancel_pending_downgrade' | 'cancel_renewal' | 'resume_renewal',
    successMessage: string
  ) => {
    setMutatingAction(action);
    setCheckoutError(null);
    setPlanActionNotice(null);
    try {
      const res = await fetch('/api/account/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          targetPlan: action === 'schedule_downgrade' ? 'pro' : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCheckoutError(json?.error || 'Could not update plan settings.');
        return;
      }
      await refreshProfile();
      await loadPlanState();
      setPlanActionNotice(successMessage);
    } catch {
      setCheckoutError('Could not update plan settings right now.');
    } finally {
      setMutatingAction(null);
    }
  };

  const effectiveEntitlementStatus = planState?.entitlementStatus ?? user?.entitlementStatus;
  const isExpired =
    !isAdmin &&
    (effectiveEntitlementStatus === 'expired' || user?.isExpired || reason === 'trial_ended');
  const isTrial = !isAdmin && effectiveEntitlementStatus === 'trial';
  const isPaid = !isAdmin && effectiveEntitlementStatus === 'paid';
  const storedTier = planState?.storedTier ?? user?.storedTier ?? user?.tier ?? 'free';
  const tierExpiresAt = planState?.tierExpiresAt ?? user?.tierExpiresAt ?? null;
  const pendingTier = planState?.pendingTier ?? user?.pendingTier ?? null;
  const pendingTierEffectiveAt =
    planState?.pendingTierEffectiveAt ?? user?.pendingTierEffectiveAt ?? tierExpiresAt;
  const cancelAtPeriodEnd = Boolean(planState?.cancelAtPeriodEnd ?? user?.cancelAtPeriodEnd);

  const activeTier = isAdmin ? 'premium' : isPaid ? storedTier : null;
  const paidTiers: Array<'pro' | 'premium'> = ['pro', 'premium'];
  const expiryLabel = formatShortDate(tierExpiresAt);
  const pendingDateLabel = formatShortDate(pendingTierEffectiveAt || tierExpiresAt);
  const renewalBanner = getPaidRenewalBannerState({
    entitlementStatus: effectiveEntitlementStatus,
    tier: storedTier,
    tierExpiresAt,
    cancelAtPeriodEnd,
    isAdmin,
  });

  const premiumQuote = planState?.quotes?.premium;

  return (
    <div className="space-y-4 py-2 max-w-4xl mx-auto">
      <header className="space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-[26px] font-[700] leading-[1.18] text-[var(--text)] tracking-[-0.02em]">
              {isExpired ? 'Choose a plan to continue' : 'Plans & pricing'}
            </h1>
            <p className="text-[12.5px] sm:text-[13px] text-[var(--text-2)] mt-1">
              30-day manual monthly NGN plans verified server-side via Paystack.
            </p>
          </div>
        </div>

        {/* Admin banner — "Admin: full access" and zero payment buttons */}
        {isAdmin && (
          <div className="p-3.5 bg-[var(--accent-soft)] border border-[var(--accent)]/30 rounded-[14px] text-[13px] text-[var(--accent)] font-semibold flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Admin: full access</span>
            </div>
            <span className="text-[12px] font-normal text-[var(--text)]">
              {ADMIN_OVERRIDE_RULE.description}
            </span>
          </div>
        )}

        {/* Active paid member summary with Change plan & renewal/downgrade/cancel controls */}
        {isAuthenticated && isPaid && (
          <div className="p-4 bg-[var(--surface)] border border-[var(--line)] rounded-[16px] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wide font-semibold text-[var(--accent)]">
                    Current plan
                  </span>
                  <span className="font-display text-[16px] font-bold text-[var(--text)]">
                    {storedTier === 'premium' ? TIER_RULES.premium.name : TIER_RULES.pro.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-2)]">
                  <Calendar className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>
                    {cancelAtPeriodEnd
                      ? `Stops on ${expiryLabel || 'period end'} (access remains active until then)`
                      : expiryLabel
                      ? `Current period ends on ${expiryLabel}`
                      : 'Active subscription'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {renewalBanner.showRenewButton && (
                  <button
                    type="button"
                    disabled={Boolean(checkingOutPlan) || Boolean(mutatingAction)}
                    onClick={() =>
                      handleCheckout(storedTier === 'premium' ? 'premium' : 'pro')
                    }
                    className="min-h-[44px] px-4 rounded-[12px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[13px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 touch-press"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Renew now</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSheetFocusPlan(null);
                    setSheetOpen(true);
                  }}
                  className={`min-h-[44px] px-4 rounded-[12px] text-[13px] font-bold inline-flex items-center justify-center gap-1.5 touch-press ${
                    renewalBanner.showRenewButton
                      ? 'border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]'
                      : 'bg-[var(--accent-fill)] text-[var(--accent-ink)]'
                  }`}
                >
                  <span>Change plan</span>
                </button>
              </div>
            </div>

            {pendingTier === 'pro' && (
              <div className="pt-2.5 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12.5px]">
                <span className="text-[var(--medium)] font-medium">
                  Switches to Pro on {pendingDateLabel || 'period end'}
                </span>
                <button
                  type="button"
                  disabled={Boolean(mutatingAction)}
                  onClick={() =>
                    handlePlanMutation(
                      'cancel_pending_downgrade',
                      'Scheduled switch to Pro cancelled.'
                    )
                  }
                  className="min-h-[44px] px-3.5 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] text-[12px] font-semibold text-[var(--text)] touch-press"
                >
                  Cancel pending switch
                </button>
              </div>
            )}

            {cancelAtPeriodEnd && (
              <div className="pt-2.5 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12.5px]">
                <span className="text-[var(--medium)] font-medium">
                  Cancellation scheduled: moves to expired on {expiryLabel || 'expiry'} (trial does not restart).
                </span>
                <button
                  type="button"
                  disabled={Boolean(mutatingAction)}
                  onClick={() => handlePlanMutation('resume_renewal', 'Plan resumed.')}
                  className="min-h-[44px] px-4 rounded-[10px] bg-[var(--accent-soft)] border border-[var(--accent)] text-[12.5px] font-bold text-[var(--accent)] touch-press"
                >
                  Resume
                </button>
              </div>
            )}
          </div>
        )}

        {/* Expired trial / expired paid notice */}
        {isExpired && (
          <div className="p-3.5 bg-[var(--danger-soft)] border border-[var(--danger)]/35 rounded-[12px] text-[13px] text-[var(--danger)] font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {user?.tier === 'free'
                  ? 'Your 7-day free trial has ended. Choose a plan to continue.'
                  : 'Your paid period has ended. Choose a plan to continue.'}
              </span>
            </div>
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => {
                  setSheetFocusPlan(null);
                  setSheetOpen(true);
                }}
                className="min-h-[44px] px-4 rounded-[10px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12.5px] font-bold shrink-0 touch-press"
              >
                Choose a plan
              </button>
            )}
          </div>
        )}

        {/* Trial notice */}
        {isTrial && user && (
          <div className="p-3.5 bg-[var(--surface)] border border-[var(--line)] rounded-[14px] text-[12.5px] text-[var(--text-2)] flex flex-wrap items-center justify-between gap-2.5">
            <span>
              <strong className="text-[var(--text)]">Free trial:</strong>{' '}
              {user.trialDaysRemaining} {user.trialDaysRemaining === 1 ? 'day' : 'days'} left
              {user.trialEndsAt ? ` (ends ${formatShortDate(user.trialEndsAt)})` : ''}.
            </span>
            <button
              type="button"
              onClick={() => {
                setSheetFocusPlan(null);
                setSheetOpen(true);
              }}
              className="min-h-[44px] px-4 rounded-[10px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12.5px] font-bold touch-press"
            >
              Choose a plan
            </button>
          </div>
        )}

        {verifyingRef && (
          <div className="p-3 bg-[var(--surface)] border border-[var(--line)] rounded-[12px] text-[12.5px] text-[var(--text)] flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
            <span>Verifying Paystack payment and activating your plan...</span>
          </div>
        )}

        {verifiedSuccess && (
          <div className="p-3.5 bg-[var(--accent-soft)] border border-[var(--accent)]/35 rounded-[12px] text-[13px] text-[var(--accent)] font-medium flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{verifiedSuccess}</span>
            </div>
            <Link
              href="/fixtures"
              className="min-h-[44px] px-3.5 rounded-[10px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12.5px] font-bold inline-flex items-center gap-1"
            >
              <span>Open fixtures</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {planActionNotice && (
          <div className="p-3 bg-[var(--accent-soft)] border border-[var(--accent)]/35 rounded-[12px] text-[12.5px] text-[var(--accent)] font-medium">
            {planActionNotice}
          </div>
        )}

        {checkoutError && (
          <div className="p-3.5 bg-[var(--danger-soft)] border border-[var(--danger)]/35 rounded-[12px] text-[12.5px] text-[var(--danger)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{checkoutError}</span>
            </div>
            {retryPlan && !isAdmin && (
              <button
                type="button"
                disabled={Boolean(checkingOutPlan)}
                onClick={() => handleCheckout(retryPlan)}
                className="min-h-[44px] px-4 rounded-[10px] bg-[var(--danger)] text-white text-[12px] font-bold inline-flex items-center justify-center gap-1.5 shrink-0 touch-press"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry payment</span>
              </button>
            )}
          </div>
        )}
      </header>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {paidTiers.map((tierId) => {
          const rule = TIER_RULES[tierId];
          const isCurrent = activeTier === tierId && (isAdmin || isPaid);
          const billingLabel = formatMonthlyPrice(tierId);
          const isBusy = checkingOutPlan === tierId;
          const isUpgradeFromPro = isPaid && storedTier === 'pro' && tierId === 'premium';
          const isDowngradeFromPremium = isPaid && storedTier === 'premium' && tierId === 'pro';

          return (
            <div
              key={tierId}
              className={`p-5 bg-[var(--surface)] border rounded-[18px] flex flex-col justify-between space-y-5 ${
                isCurrent ? 'border-[var(--accent)]' : 'border-[var(--line)]'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] uppercase tracking-wide ${
                      tierId === 'pro' ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-2)]'
                    }`}
                  >
                    {rule.badge}
                  </span>
                  {isCurrent && (
                    <span className="text-[10.5px] bg-[var(--accent-soft)] text-[var(--accent)] px-2.5 py-0.5 rounded-full border border-[var(--accent)]/30 font-semibold">
                      {isAdmin && tierId === 'premium' ? 'Admin' : 'Current'}
                    </span>
                  )}
                </div>

                <div>
                  <h2 className="font-display text-[18px] font-bold text-[var(--text)]">
                    {rule.name}
                  </h2>
                  <div className="font-display text-[28px] sm:text-[32px] font-bold tabular-nums text-[var(--text)] tracking-[-0.02em] mt-1">
                    {billingLabel}
                  </div>
                  <p className="text-[12.5px] text-[var(--text-2)] mt-1.5 leading-[1.5]">
                    {rule.summary}
                  </p>
                </div>

                <ul className="space-y-2 text-[12.5px] text-[var(--text-2)] pt-1">
                  {rule.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                      <span className="text-[var(--text)]">{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {isAdmin ? (
                <div className="w-full min-h-[44px] rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[12.5px] font-semibold text-[var(--accent)]">
                  Admin: full access
                </div>
              ) : !isAuthenticated ? (
                <Link
                  href="/signup"
                  className={`w-full min-h-[46px] rounded-[12px] font-bold text-[13.5px] flex items-center justify-center gap-2 transition-opacity touch-press ${
                    tierId === 'pro'
                      ? 'bg-[var(--accent-fill)] text-[var(--accent-ink)] hover:opacity-95'
                      : 'border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-90'
                  }`}
                >
                  <span>Choose {rule.name}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : isUpgradeFromPro && premiumQuote ? (
                confirmUpgradeOpen ? (
                  <div className="p-3.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--accent)]/40 space-y-2.5">
                    <div className="text-[12.5px] text-[var(--text)] leading-[1.45]">
                      <span className="font-bold text-[var(--accent)]">
                        Upgrade amount today: {formatNaira(premiumQuote.amountNgn)}
                      </span>{' '}
                      ({formatNaira(premiumQuote.creditNgn)} credit applied for{' '}
                      {premiumQuote.remainingWholeDays} unused Pro days). New expiry:{' '}
                      {formatShortDate(premiumQuote.newExpiryIso)}.
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        disabled={Boolean(checkingOutPlan) || verifyingRef}
                        onClick={() => handleCheckout('premium')}
                        className="flex-1 min-h-[44px] px-4 rounded-[10px] bg-[var(--accent-fill)] text-[var(--accent-ink)] font-bold text-[13px] flex items-center justify-center gap-2 disabled:opacity-50 touch-press"
                      >
                        {isBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CreditCard className="w-4 h-4" />
                        )}
                        <span>
                          {isBusy
                            ? 'Opening Paystack...'
                            : `Confirm & pay ${formatNaira(premiumQuote.amountNgn)}`}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmUpgradeOpen(false)}
                        className="min-h-[44px] px-3.5 rounded-[10px] border border-[var(--line)] text-[12.5px] font-medium text-[var(--text-2)] touch-press"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(checkingOutPlan) || verifyingRef}
                    onClick={() => setConfirmUpgradeOpen(true)}
                    className="w-full min-h-[46px] rounded-[12px] bg-[var(--accent-fill)] text-[var(--accent-ink)] font-bold text-[13.5px] flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50 touch-press"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Upgrade to Premium — {formatNaira(premiumQuote.amountNgn)}</span>
                  </button>
                )
              ) : isDowngradeFromPremium ? (
                pendingTier === 'pro' ? (
                  <div className="space-y-2">
                    <div className="text-[12px] font-medium text-[var(--medium)] text-center">
                      Switches to Pro on {pendingDateLabel || 'period end'}
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(mutatingAction)}
                      onClick={() =>
                        handlePlanMutation(
                          'cancel_pending_downgrade',
                          'Scheduled switch to Pro cancelled.'
                        )
                      }
                      className="w-full min-h-[44px] rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] text-[13px] font-semibold text-[var(--text)] touch-press"
                    >
                      Cancel pending switch
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(mutatingAction)}
                    onClick={() =>
                      handlePlanMutation(
                        'schedule_downgrade',
                        `Switches to Pro on ${expiryLabel || 'period end'}.`
                      )
                    }
                    className="w-full min-h-[46px] rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--accent)] text-[var(--text)] font-bold text-[13.5px] flex items-center justify-center gap-2 disabled:opacity-50 touch-press"
                  >
                    {mutatingAction === 'schedule_downgrade' && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    <span>Switch to Pro on {expiryLabel || 'period end'}</span>
                  </button>
                )
              ) : (
                <button
                  type="button"
                  disabled={Boolean(checkingOutPlan) || verifyingRef}
                  onClick={() => handleCheckout(tierId)}
                  className={`w-full min-h-[46px] rounded-[12px] font-bold text-[13.5px] flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 touch-press ${
                    tierId === 'pro'
                      ? 'bg-[var(--accent-fill)] text-[var(--accent-ink)] hover:opacity-95'
                      : 'border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-90'
                  }`}
                >
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  <span>
                    {isBusy
                      ? 'Opening Paystack...'
                      : isCurrent
                      ? renewalBanner.showRenewButton
                        ? `Renew now — ${formatNaira(rule.monthlyPriceNgn)}`
                        : `Renew ${rule.name} — ${formatNaira(rule.monthlyPriceNgn)}`
                      : `Choose ${rule.name} — ${formatNaira(rule.monthlyPriceNgn)}`}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!isExpired && !isAdmin && effectiveEntitlementStatus !== 'paid' && (
        <div className="p-4 rounded-[16px] bg-[var(--surface)] border border-[var(--line)] text-[12.5px] text-[var(--text-2)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-[var(--text)]">{TIER_RULES.free.name}:</span>{' '}
            Includes {TRIAL_DAYS} days after email confirmation with 3 daily match summaries.
          </div>
          <Link href="/account" className="text-[var(--accent)] font-semibold hover:underline shrink-0">
            Manage account
          </Link>
        </div>
      )}

      <ChangePlanSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initialFocusPlan={sheetFocusPlan}
        onPlanUpdated={async () => {
          await refreshProfile();
          await loadPlanState();
        }}
      />
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto py-8 text-center text-[13px] text-[var(--text-2)]">
          Loading plans...
        </div>
      }
    >
      <PricingContent />
    </Suspense>
  );
}
