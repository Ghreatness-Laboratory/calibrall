'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, AlertTriangle, X, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { getTrialBannerState } from '@/lib/tiers';

export default function TrialBanner() {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const [dismissedReminder, setDismissedReminder] = useState(false);

  const state = getTrialBannerState({
    entitlementStatus: user?.entitlementStatus,
    trialDaysRemaining: user?.trialDaysRemaining,
    isAdmin,
  });

  useEffect(() => {
    if (!state.reminderStage || typeof window === 'undefined') {
      setDismissedReminder(false);
      return;
    }
    try {
      const key = `calibrall_trial_notice_dismissed_${user?.id || 'anon'}_${state.reminderStage}`;
      setDismissedReminder(sessionStorage.getItem(key) === 'true');
    } catch {
      setDismissedReminder(false);
    }
  }, [state.reminderStage, user?.id]);

  if (!isAuthenticated || !user || !state.visible) {
    return null;
  }

  const dismissNotice = () => {
    setDismissedReminder(true);
    try {
      if (state.reminderStage) {
        const key = `calibrall_trial_notice_dismissed_${user.id}_${state.reminderStage}`;
        sessionStorage.setItem(key, 'true');
      }
    } catch {}
  };

  const containerToneClass =
    state.tone === 'red'
      ? 'bg-[var(--danger-soft)] border-t border-[var(--danger)]/35 text-[var(--danger)]'
      : state.tone === 'amber'
      ? 'bg-amber-500/15 border-t border-amber-500/35 text-amber-700 dark:text-amber-300'
      : 'bg-[var(--surface)] border-t border-[var(--line)] text-[var(--text-2)]';

  const badgeToneClass =
    state.tone === 'red'
      ? 'bg-[var(--danger)] text-white'
      : state.tone === 'amber'
      ? 'bg-amber-500 text-slate-950'
      : 'bg-[var(--accent-fill)] text-[var(--accent-ink)]';

  const Icon = state.tone === 'normal' ? Clock : AlertTriangle;

  return (
    <div className={containerToneClass} data-testid="trial-banner" data-tone={state.tone}>
      <div className="max-w-[430px] md:max-w-4xl lg:max-w-7xl mx-auto px-4 py-1.5 flex items-center justify-between gap-2 text-[12px]">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <div className="min-w-0 truncate">
            <span className="font-semibold">{state.label}</span>
            {state.isReminderDay && !dismissedReminder && (
              <span className="hidden sm:inline ml-2 opacity-90">
                {user.entitlementStatus === 'expired'
                  ? '— Upgrade to Pro or Premium to restore model access.'
                  : state.reminderStage === 'day7'
                  ? '— Final day of your trial. Choose Pro or Premium to keep access.'
                  : '— Reminder: your trial ends soon. Choose a plan to stay uninterrupted.'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            href={state.tone === 'red' ? '/pricing?reason=trial_ended' : '/pricing'}
            className={`min-h-[28px] px-2.5 rounded-[8px] text-[11.5px] font-bold inline-flex items-center gap-1 transition-opacity hover:opacity-90 ${badgeToneClass}`}
          >
            <span>Upgrade</span>
            <ArrowRight className="w-3 h-3" />
          </Link>

          {state.isReminderDay && !dismissedReminder && (
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
