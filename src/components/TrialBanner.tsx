'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, AlertTriangle, X, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { getPaidRenewalBannerState, getTrialBannerState } from '@/lib/tiers';

export default function TrialBanner() {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const [dismissedReminder, setDismissedReminder] = useState(false);

  const trialState = getTrialBannerState({
    entitlementStatus: user?.entitlementStatus,
    trialDaysRemaining: user?.trialDaysRemaining,
    isAdmin,
  });

  const paidRenewalState = getPaidRenewalBannerState({
    entitlementStatus: user?.entitlementStatus,
    tier: user?.tier,
    tierExpiresAt: user?.tierExpiresAt,
    cancelAtPeriodEnd: user?.cancelAtPeriodEnd,
    isAdmin,
  });

  const showPaidRenewalBanner = Boolean(
    isAuthenticated && user && !isAdmin && !trialState.visible && paidRenewalState.showRenewalBanner
  );

  useEffect(() => {
    if (!trialState.reminderStage || typeof window === 'undefined') {
      setDismissedReminder(false);
      return;
    }
    try {
      const key = `calibrall_trial_notice_dismissed_${user?.id || 'anon'}_${trialState.reminderStage}`;
      setDismissedReminder(sessionStorage.getItem(key) === 'true');
    } catch {
      setDismissedReminder(false);
    }
  }, [trialState.reminderStage, user?.id]);

  if (!isAuthenticated || !user || (!trialState.visible && !showPaidRenewalBanner)) {
    return null;
  }

  if (showPaidRenewalBanner) {
    const toneClass =
      paidRenewalState.tone === 'red'
        ? 'bg-[var(--danger-soft)] border-t border-[var(--danger)]/35 text-[var(--danger)]'
        : 'bg-amber-500/15 border-t border-amber-500/35 text-amber-700 dark:text-amber-300';
    const ctaClass =
      paidRenewalState.tone === 'red'
        ? 'bg-[var(--danger)] text-white'
        : 'bg-amber-500 text-slate-950';

    return (
      <div className={toneClass} data-testid="paid-renewal-banner" data-tone={paidRenewalState.tone}>
        <div className="max-w-[430px] md:max-w-4xl lg:max-w-7xl mx-auto px-4 py-1.5 flex items-center justify-between gap-2 text-[12px]">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <div className="min-w-0 truncate font-semibold">{paidRenewalState.label}</div>
          </div>

          <Link
            href="/pricing"
            className={`min-h-[28px] px-2.5 rounded-[8px] text-[11.5px] font-bold inline-flex items-center gap-1 transition-opacity hover:opacity-90 shrink-0 ${ctaClass}`}
          >
            <span>Renew now</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    );
  }

  const dismissNotice = () => {
    setDismissedReminder(true);
    try {
      if (trialState.reminderStage) {
        const key = `calibrall_trial_notice_dismissed_${user.id}_${trialState.reminderStage}`;
        sessionStorage.setItem(key, 'true');
      }
    } catch {}
  };

  const containerToneClass =
    trialState.tone === 'red'
      ? 'bg-[var(--danger-soft)] border-t border-[var(--danger)]/35 text-[var(--danger)]'
      : trialState.tone === 'amber'
      ? 'bg-amber-500/15 border-t border-amber-500/35 text-amber-700 dark:text-amber-300'
      : 'bg-[var(--surface)] border-t border-[var(--line)] text-[var(--text-2)]';

  const badgeToneClass =
    trialState.tone === 'red'
      ? 'bg-[var(--danger)] text-white'
      : trialState.tone === 'amber'
      ? 'bg-amber-500 text-slate-950'
      : 'bg-[var(--accent-fill)] text-[var(--accent-ink)]';

  const Icon = trialState.tone === 'normal' ? Clock : AlertTriangle;

  return (
    <div className={containerToneClass} data-testid="trial-banner" data-tone={trialState.tone}>
      <div className="max-w-[430px] md:max-w-4xl lg:max-w-7xl mx-auto px-4 py-1.5 flex items-center justify-between gap-2 text-[12px]">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <div className="min-w-0 truncate">
            <span className="font-semibold">{trialState.label}</span>
            {trialState.isReminderDay && !dismissedReminder && (
              <span className="hidden sm:inline ml-2 opacity-90">
                {user.entitlementStatus === 'expired'
                  ? '— Choose Pro or Premium to restore model access.'
                  : trialState.reminderStage === 'day7'
                  ? '— Final day of your trial. Choose Pro or Premium to keep access.'
                  : '— Reminder: your trial ends soon. Choose a plan to stay uninterrupted.'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            href={trialState.tone === 'red' ? '/pricing?reason=trial_ended' : '/pricing'}
            className={`min-h-[28px] px-2.5 rounded-[8px] text-[11.5px] font-bold inline-flex items-center gap-1 transition-opacity hover:opacity-90 ${badgeToneClass}`}
          >
            <span>{user.entitlementStatus === 'expired' ? 'Choose a plan' : 'Upgrade'}</span>
            <ArrowRight className="w-3 h-3" />
          </Link>

          {trialState.isReminderDay && !dismissedReminder && (
            <button
              type="button"
              onClick={dismissNotice}
              aria-label="Dismiss trial reminder"
              className="w-6 h-6 rounded-[6px] flex items-center justify-center opacity-75 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
