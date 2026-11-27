'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Check,
  CreditCard,
  Loader2,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  Calendar,
} from 'lucide-react';
import {
  TIER_RULES,
  formatMonthlyPrice,
  formatNaira,
  getPaidRenewalBannerState,
} from '@/lib/tiers';
import type { CheckoutQuoteResult } from '@/lib/payments/paystackService';

export interface PlanStateResponse {
  isAdmin: boolean;
  entitlementStatus: 'admin' | 'paid' | 'trial' | 'expired';
  effectiveTier: 'free' | 'pro' | 'premium';
  storedTier: 'free' | 'pro' | 'premium';
  tierExpiresAt: string | null;
  pendingTier: 'pro' | 'premium' | null;
  pendingTierEffectiveAt: string | null;
  cancelAtPeriodEnd: boolean;
  quotes: {
    pro: CheckoutQuoteResult;
    premium: CheckoutQuoteResult;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialFocusPlan?: 'pro' | 'premium' | null;
  onPlanUpdated?: () => Promise<void> | void;
}

function formatPlanDate(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function ChangePlanSheet({
  open,
  onClose,
  initialFocusPlan = null,
  onPlanUpdated,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [planState, setPlanState] = useState<PlanStateResponse | null>(null);
  const [confirmUpgrade, setConfirmUpgrade] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFailedPlan, setLastFailedPlan] = useState<'pro' | 'premium' | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchPlanState = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/account/plan', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Unable to load current plan details.');
      }
      setPlanState(json as PlanStateResponse);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load plan details right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setLastFailedPlan(null);
    setConfirmUpgrade(initialFocusPlan === 'premium');
    void fetchPlanState();
  }, [open, initialFocusPlan, fetchPlanState]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const startPaystackCheckout = async (plan: 'pro' | 'premium') => {
    setBusyAction(`checkout_${plan}`);
    setErrorMsg(null);
    setSuccessMsg(null);
    setLastFailedPlan(null);
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
        setLastFailedPlan(plan);
        setErrorMsg(json?.error || 'Payment could not be started. Your plan has not changed.');
        setBusyAction(null);
        return;
      }
      window.location.href = String(json.authorizationUrl);
    } catch (err: any) {
      setLastFailedPlan(plan);
      setErrorMsg(err?.message || 'Unable to reach Paystack right now. Your plan has not changed.');
      setBusyAction(null);
    }
  };

  const runPlanMutation = async (
    action: 'schedule_downgrade' | 'cancel_pending_downgrade' | 'cancel_renewal' | 'resume_renewal',
    successText: string
  ) => {
    setBusyAction(action);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/account/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetPlan: action === 'schedule_downgrade' ? 'pro' : undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Could not update your plan.');
      }
      await fetchPlanState();
      if (onPlanUpdated) await onPlanUpdated();
      setSuccessMsg(successText);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not update your plan.');
    } finally {
      setBusyAction(null);
    }
  };

  if (!mounted || !open) return null;

  const isAdmin = Boolean(planState?.isAdmin);
  const isPaidActive = !isAdmin && planState?.entitlementStatus === 'paid';
  const currentStoredTier = planState?.storedTier ?? 'free';
  const proQuote = planState?.quotes?.pro;
  const premiumQuote = planState?.quotes?.premium;
  const renewalState = planState
    ? getPaidRenewalBannerState({
        entitlementStatus: planState.entitlementStatus,
        tier: planState.effectiveTier,
        tierExpiresAt: planState.tierExpiresAt,
        cancelAtPeriodEnd: planState.cancelAtPeriodEnd,
        isAdmin: planState.isAdmin,
      })
    : null;

  const expiryLabel = formatPlanDate(planState?.tierExpiresAt);
  const pendingDateLabel = formatPlanDate(
    planState?.pendingTierEffectiveAt || planState?.tierExpiresAt
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/75 p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Change plan"
      data-testid="change-plan-sheet-backdrop"
      onClick={onClose}
    >
      <div
        data-testid="change-plan-sheet"
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-2xl bg-[var(--surface)] border-t md:border border-[var(--line)] rounded-t-[22px] md:rounded-[22px] max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 pt-3 pb-3 border-b border-[var(--line)] shrink-0">
          <div aria-hidden="true" className="w-10 h-1 rounded-full bg-[var(--line)] mx-auto mb-2.5 md:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-[18px] font-bold text-[var(--text)]">
                {isAdmin
                  ? 'Account access'
                  : isPaidActive
                  ? 'Change plan'
                  : 'Choose a plan'}
              </h2>
              <p className="text-[12px] text-[var(--text-2)] mt-0.5">
                {isAdmin
                  ? 'Admin: full access'
                  : isPaidActive
                  ? `Current plan: ${TIER_RULES[currentStoredTier]?.name || 'Pro'} · Expires ${expiryLabel}`
                  : '30-day manual monthly NGN plans verified securely via Paystack.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close plan sheet"
              className="min-w-[44px] min-h-[44px] -mr-2 -mt-1 rounded-[12px] flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] touch-press"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div
          className="flex-1 overflow-y-auto overscroll-y-contain p-5 space-y-4"
          style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
        >
          {loading && !planState ? (
            <div className="py-10 flex items-center justify-center gap-2 text-[13px] text-[var(--text-2)]">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
              <span>Loading plan options...</span>
            </div>
          ) : isAdmin ? (
            <div className="p-4 rounded-[14px] bg-[var(--accent-soft)] border border-[var(--accent)]/30 space-y-1.5">
              <div className="flex items-center gap-2 text-[14px] font-bold text-[var(--accent)]">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Admin: full access</span>
              </div>
              <p className="text-[12.5px] text-[var(--text)] leading-[1.5]">
                Admin accounts permanently receive full Premium access with no payment required.
              </p>
            </div>
          ) : (
            <>
              {/* Pending downgrade / cancellation notices */}
              {isPaidActive && planState?.pendingTier === 'pro' && (
                <div className="p-3.5 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[12.5px]">
                  <div className="flex items-center gap-2 text-[var(--text)] font-medium">
                    <Calendar className="w-4 h-4 text-[var(--medium)] shrink-0" />
                    <span>Switches to Pro on {pendingDateLabel}</span>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      runPlanMutation('cancel_pending_downgrade', 'Scheduled switch to Pro cancelled.')
                    }
                    className="min-h-[44px] px-3.5 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] text-[12px] font-semibold text-[var(--text)] hover:border-[var(--accent)] shrink-0 touch-press"
                  >
                    {busyAction === 'cancel_pending_downgrade' ? 'Cancelling...' : 'Cancel pending switch'}
                  </button>
                </div>
              )}

              {isPaidActive && planState?.cancelAtPeriodEnd && (
                <div className="p-3.5 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[12.5px]">
                  <div className="text-[var(--text)] font-medium">
                    Renewal stopped. Access stays active until {expiryLabel}, then expires without restarting trial.
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      runPlanMutation('resume_renewal', 'Plan resumed. You can renew before expiry.')
                    }
                    className="min-h-[44px] px-4 rounded-[10px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12px] font-bold shrink-0 touch-press"
                  >
                    {busyAction === 'resume_renewal' ? 'Resuming...' : 'Resume'}
                  </button>
                </div>
              )}

              {errorMsg && (
                <div className="p-3.5 rounded-[12px] bg-[var(--danger-soft)] border border-[var(--danger)]/35 text-[12.5px] text-[var(--danger)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                  {lastFailedPlan && (
                    <button
                      type="button"
                      onClick={() => startPaystackCheckout(lastFailedPlan)}
                      className="min-h-[44px] px-3.5 rounded-[10px] bg-[var(--danger)] text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 touch-press"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-[12px] bg-[var(--accent-soft)] border border-[var(--accent)]/35 text-[12.5px] text-[var(--accent)] font-medium">
                  {successMsg}
                </div>
              )}

              {/* Plan Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {(['pro', 'premium'] as const).map((tierId) => {
                  const rule = TIER_RULES[tierId];
                  const isCurrent = isPaidActive && currentStoredTier === tierId;
                  const priceLabel = formatMonthlyPrice(tierId);
                  const isUpgradeCase = isPaidActive && currentStoredTier === 'pro' && tierId === 'premium';
                  const isDowngradeCase = isPaidActive && currentStoredTier === 'premium' && tierId === 'pro';
                  const isPendingDowngradeTarget = isDowngradeCase && planState?.pendingTier === 'pro';

                  return (
                    <div
                      key={tierId}
                      className={`p-4 rounded-[16px] border flex flex-col justify-between space-y-4 ${
                        isCurrent
                          ? 'bg-[var(--surface-2)] border-[var(--accent)]'
                          : 'bg-[var(--surface-2)] border-[var(--line)]'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-[17px] font-bold text-[var(--text)]">
                            {rule.name}
                          </span>
                          {isCurrent && (
                            <span className="px-2.5 py-0.5 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[11px] font-semibold text-[var(--accent)]">
                              Current
                            </span>
                          )}
                        </div>

                        <div className="font-display text-[26px] font-bold text-[var(--text)] tabular-nums leading-none">
                          {priceLabel}
                        </div>

                        <ul className="space-y-1.5 text-[12px] text-[var(--text-2)]">
                          {rule.features.map((feat) => (
                            <li key={feat} className="flex items-start gap-2">
                              <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
                              <span className="text-[var(--text)]">{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-2 pt-1">
                        {isCurrent ? (
                          <>
                            <button
                              type="button"
                              disabled={Boolean(busyAction)}
                              onClick={() => startPaystackCheckout(tierId)}
                              className="w-full min-h-[44px] px-4 rounded-[12px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 touch-press"
                            >
                              {busyAction === `checkout_${tierId}` ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CreditCard className="w-4 h-4" />
                              )}
                              <span>
                                {renewalState?.showRenewButton
                                  ? `Renew now — ${formatNaira(rule.monthlyPriceNgn)}`
                                  : `Extend +30 days — ${formatNaira(rule.monthlyPriceNgn)}`}
                              </span>
                            </button>

                            {!planState?.cancelAtPeriodEnd ? (
                              <button
                                type="button"
                                disabled={Boolean(busyAction)}
                                onClick={() =>
                                  runPlanMutation(
                                    'cancel_renewal',
                                    `Renewal stopped. Your ${rule.name} plan stays active until ${expiryLabel}.`
                                  )
                                }
                                className="w-full min-h-[44px] px-3 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] text-[12px] font-semibold text-[var(--text-2)] hover:text-[var(--text)] touch-press"
                              >
                                {busyAction === 'cancel_renewal' ? 'Updating...' : 'Stop renewing at expiry'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={Boolean(busyAction)}
                                onClick={() =>
                                  runPlanMutation('resume_renewal', `${rule.name} plan resumed.`)
                                }
                                className="w-full min-h-[44px] px-3 rounded-[12px] border border-[var(--accent)] bg-[var(--accent-soft)] text-[12.5px] font-bold text-[var(--accent)] touch-press"
                              >
                                {busyAction === 'resume_renewal' ? 'Resuming...' : 'Resume'}
                              </button>
                            )}
                          </>
                        ) : isUpgradeCase && premiumQuote ? (
                          confirmUpgrade ? (
                            <div className="p-3 rounded-[12px] bg-[var(--surface)] border border-[var(--accent)]/40 space-y-2.5">
                              <div className="text-[12px] text-[var(--text)] leading-[1.45]">
                                <span className="font-bold text-[var(--accent)]">
                                  Due today: {formatNaira(premiumQuote.amountNgn)}
                                </span>{' '}
                                (includes {formatNaira(premiumQuote.creditNgn)} credit for{' '}
                                {premiumQuote.remainingWholeDays} unused Pro days). New expiry:{' '}
                                {formatPlanDate(premiumQuote.newExpiryIso)}.
                              </div>
                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  disabled={Boolean(busyAction)}
                                  onClick={() => startPaystackCheckout('premium')}
                                  className="w-full min-h-[44px] px-3.5 rounded-[10px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[13px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 touch-press"
                                >
                                  {busyAction === 'checkout_premium' ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CreditCard className="w-4 h-4" />
                                  )}
                                  <span>Confirm &amp; pay {formatNaira(premiumQuote.amountNgn)}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmUpgrade(false)}
                                  className="w-full min-h-[44px] px-3 rounded-[10px] border border-[var(--line)] text-[12px] font-medium text-[var(--text-2)] touch-press"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={Boolean(busyAction)}
                              onClick={() => setConfirmUpgrade(true)}
                              className="w-full min-h-[44px] px-4 rounded-[12px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[13px] font-bold flex items-center justify-center gap-1.5 touch-press"
                            >
                              <span>Upgrade to Premium — {formatNaira(premiumQuote.amountNgn)}</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          )
                        ) : isDowngradeCase ? (
                          isPendingDowngradeTarget ? (
                            <div className="space-y-2">
                              <div className="text-[12px] font-medium text-[var(--medium)] text-center">
                                Switches to Pro on {pendingDateLabel}
                              </div>
                              <button
                                type="button"
                                disabled={Boolean(busyAction)}
                                onClick={() =>
                                  runPlanMutation(
                                    'cancel_pending_downgrade',
                                    'Scheduled downgrade cancelled.'
                                  )
                                }
                                className="w-full min-h-[44px] px-3.5 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] text-[12.5px] font-semibold text-[var(--text)] touch-press"
                              >
                                Cancel pending switch
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={Boolean(busyAction)}
                              onClick={() =>
                                runPlanMutation(
                                  'schedule_downgrade',
                                  `Scheduled switch to Pro on ${expiryLabel}.`
                                )
                              }
                              className="w-full min-h-[44px] px-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)] text-[13px] font-semibold text-[var(--text)] flex items-center justify-center gap-1.5 touch-press"
                            >
                              {busyAction === 'schedule_downgrade' && (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              )}
                              <span>Switch to Pro on {expiryLabel}</span>
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            disabled={Boolean(busyAction)}
                            onClick={() => startPaystackCheckout(tierId)}
                            className={`w-full min-h-[44px] px-4 rounded-[12px] text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 touch-press ${
                              tierId === 'pro'
                                ? 'bg-[var(--accent-fill)] text-[var(--accent-ink)]'
                                : 'border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                            }`}
                          >
                            {busyAction === `checkout_${tierId}` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CreditCard className="w-4 h-4" />
                            )}
                            <span>
                              Choose {rule.name} ({formatNaira(proQuote && tierId === 'pro' ? proQuote.amountNgn : rule.monthlyPriceNgn)})
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
