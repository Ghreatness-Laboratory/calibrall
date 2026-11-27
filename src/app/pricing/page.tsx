'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, ShieldCheck, AlertCircle, Loader2, ArrowRight, CheckCircle2, CreditCard } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import {
  TIER_RULES,
  ADMIN_OVERRIDE_RULE,
  TRIAL_DAYS,
  getDisplayBillingLabel,
} from '@/lib/tiers';

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
  const reference = searchParams.get('reference') || searchParams.get('trxref');
  const { user, isAdmin, refreshProfile } = useAuth();

  const [checkingOutPlan, setCheckingOutPlan] = useState<'pro' | 'premium' | null>(null);
  const [verifyingRef, setVerifyingRef] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [verifiedSuccess, setVerifiedSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;

    const verifyPayment = async () => {
      setVerifyingRef(true);
      setCheckoutError(null);
      try {
        const res = await fetch(
          `/api/payments/paystack/verify?reference=${encodeURIComponent(reference)}`,
          { cache: 'no-store' }
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json?.verified) {
          setCheckoutError(
            json?.error || `Payment verification returned status "${json?.status || 'pending'}".`
          );
          return;
        }
        await refreshProfile();
        setVerifiedSuccess(
          `${String(json.plan || 'Pro').toUpperCase()} access restored immediately.`
        );
      } catch (err: any) {
        if (!cancelled) {
          setCheckoutError(err?.message || 'Unable to verify Paystack transaction.');
        }
      } finally {
        if (!cancelled) setVerifyingRef(false);
      }
    };

    void verifyPayment();
    return () => {
      cancelled = true;
    };
  }, [reference, refreshProfile]);

  const handleCheckout = async (plan: 'pro' | 'premium') => {
    setCheckoutError(null);
    setCheckingOutPlan(plan);
    try {
      const res = await fetch('/api/payments/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.authorizationUrl) {
        setCheckoutError(json?.error || 'Could not start Paystack checkout.');
        setCheckingOutPlan(null);
        return;
      }
      window.location.href = String(json.authorizationUrl);
    } catch (err: any) {
      setCheckoutError(err?.message || 'Could not connect to Paystack checkout.');
      setCheckingOutPlan(null);
    }
  };

  const isExpired = !isAdmin && (user?.entitlementStatus === 'expired' || user?.isExpired || reason === 'trial_ended');
  const isTrial = !isAdmin && user?.entitlementStatus === 'trial';
  const activeTier = isAdmin ? 'premium' : user?.entitlementStatus === 'paid' ? user.tier : null;
  const paidTiers: Array<'pro' | 'premium'> = ['pro', 'premium'];

  return (
    <div className="space-y-4 py-2 max-w-4xl mx-auto">
      <header className="space-y-2">
        <h1 className="font-display text-[26px] font-[700] leading-[1.18] text-[var(--text)] tracking-[-0.02em]">
          {isExpired ? 'Choose a plan to continue' : 'Plans & access'}
        </h1>
        <p className="text-[12.5px] sm:text-[13px] text-[var(--text-2)]">
          Server-verified access for calibrated football and basketball models.
        </p>

        {isExpired && (
          <div className="p-3.5 bg-[var(--danger-soft)] border border-[var(--danger)]/35 rounded-[12px] text-[13px] text-[var(--danger)] font-medium flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Your 7-day free trial has ended. Choose a plan to continue</span>
          </div>
        )}

        {isTrial && user && (
          <div className="p-3 bg-[var(--surface)] border border-[var(--line)] rounded-[12px] text-[12.5px] text-[var(--text-2)] flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong className="text-[var(--text)]">Free trial:</strong>{' '}
              {user.trialDaysRemaining} {user.trialDaysRemaining === 1 ? 'day' : 'days'} left
              {user.trialEndsAt ? ` (ends ${formatShortDate(user.trialEndsAt)})` : ''}.
            </span>
            <Link href="/account" className="text-[var(--accent)] font-semibold hover:underline">
              Account status
            </Link>
          </div>
        )}

        {isAdmin && (
          <div className="p-3 bg-[var(--accent-soft)] border border-[var(--accent)]/30 rounded-[12px] text-[12.5px] text-[var(--accent)] font-medium flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{ADMIN_OVERRIDE_RULE.description}</span>
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
              className="px-3 py-1.5 rounded-[8px] bg-[var(--accent-fill)] text-[var(--accent-ink)] text-[12px] font-bold inline-flex items-center gap-1"
            >
              <span>Open fixtures</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {checkoutError && (
          <div className="p-3 bg-[var(--danger-soft)] border border-[var(--danger)]/35 rounded-[12px] text-[12.5px] text-[var(--danger)] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{checkoutError}</span>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {paidTiers.map((tierId) => {
          const rule = TIER_RULES[tierId];
          const isCurrent = activeTier === tierId;
          const billingLabel = getDisplayBillingLabel(tierId);
          const isBusy = checkingOutPlan === tierId;

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
                      {isAdmin && tierId === 'premium' ? 'Admin' : 'Active'}
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-display text-[18px] font-bold text-[var(--text)]">
                      {rule.name}
                    </h2>
                    <span className="text-[13px] font-mono tabular-nums text-[var(--text)] font-semibold">
                      {billingLabel}
                    </span>
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
                <div className="w-full min-h-[44px] rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[12.5px] font-medium text-[var(--text-2)]">
                  Included in admin access
                </div>
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
                      ? `Renew ${rule.name} with Paystack`
                      : `Upgrade to ${rule.name} with Paystack`}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!isExpired && !isAdmin && user?.entitlementStatus !== 'paid' && (
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
