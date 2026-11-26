'use client';

import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { getStoredUser, setStoredUser } from '@/lib/supabase/client';
import { UserProfile } from '@/types';

export default function PricingPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [notification, setNotification] = useState<string>('');

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const handleSelectTier = (tier: 'free' | 'pro' | 'premium') => {
    if (!user) return;
    const updated: UserProfile = { ...user, subscriptionTier: tier };
    setUser(updated);
    setStoredUser(updated);
    setNotification(`Switched entitlement to ${tier.charAt(0).toUpperCase() + tier.slice(1)}`);
    setTimeout(() => setNotification(''), 3000);
  };

  return (
    <div className="space-y-4 py-2">
      <header className="space-y-1">
        <h1 className="font-display text-[26px] font-[700] leading-[1.18] text-[var(--text)] tracking-[-0.02em]">
          Subscription tiers
        </h1>
        <p className="text-[12.5px] sm:text-[13px] text-[var(--text-2)]">
          Select the analytical fidelity required for your research.
        </p>

        {notification && (
          <div className="p-3 bg-[var(--accent-soft)] border border-[var(--accent)]/30 rounded-[12px] text-[12.5px] text-[var(--accent)] mt-2 font-medium">
            {notification}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Free */}
        <div
          className={`p-4 bg-[var(--surface)] border rounded-[18px] flex flex-col justify-between space-y-4 ${
            user?.subscriptionTier === 'free' ? 'border-[var(--accent)]' : 'border-[var(--line)]'
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-2)]">Research tier</span>
              {user?.subscriptionTier === 'free' && (
                <span className="text-[10.5px] bg-[var(--surface-2)] text-[var(--text)] px-2.5 py-0.5 rounded-full border border-[var(--line)] font-medium">
                  Active
                </span>
              )}
            </div>
            <div>
              <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">Free</h2>
              <div className="font-display text-[24px] font-bold text-[var(--text)] mt-1 tabular-nums">
                $0 <span className="text-[12.5px] text-[var(--text-2)] font-normal">/ mo</span>
              </div>
              <p className="text-[12.5px] text-[var(--text-2)] mt-1 leading-[1.5]">
                Essential baseline match predictions and public calibration dashboards.
              </p>
            </div>

            <ul className="space-y-2 text-[12.5px] text-[var(--text-2)]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">3 match analyses per day</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Basic Poisson goals model</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Historical calibration curves</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('free')}
            disabled={user?.subscriptionTier === 'free'}
            type="button"
            className="w-full min-h-[44px] rounded-[12px] bg-[var(--surface-2)] hover:opacity-90 border border-[var(--line)] text-center text-[13px] font-medium text-[var(--text)] transition-opacity disabled:opacity-45 touch-press"
          >
            {user?.subscriptionTier === 'free' ? 'Current tier' : 'Switch to Free'}
          </button>
        </div>

        {/* Pro */}
        <div
          className={`p-4 bg-[var(--surface)] border rounded-[18px] flex flex-col justify-between space-y-4 ${
            user?.subscriptionTier === 'pro' ? 'border-[var(--accent)]' : 'border-[var(--line)]'
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--accent)]">Pro analyst</span>
              <span className="text-[10.5px] bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30 px-2.5 py-0.5 rounded-full font-semibold">
                Popular
              </span>
            </div>
            <div>
              <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">Pro Terminal</h2>
              <div className="font-display text-[24px] font-bold text-[var(--text)] mt-1 tabular-nums">
                $29 <span className="text-[12.5px] text-[var(--text-2)] font-normal">/ mo</span>
              </div>
              <p className="text-[12.5px] text-[var(--text-2)] mt-1 leading-[1.5]">
                Complete multi-market ranking, model probability analysis, corners, and cards.
              </p>
            </div>

            <ul className="space-y-2 text-[12.5px] text-[var(--text-2)]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">All supported markets catalog</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Model probability &amp; calibration status</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Negative binomial corner lines</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Disciplinary cards &amp; referee model</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Watchlist bookmark alerts</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('pro')}
            disabled={user?.subscriptionTier === 'pro'}
            type="button"
            className="w-full min-h-[44px] rounded-[12px] bg-[var(--accent-fill)] hover:opacity-90 text-[var(--accent-ink)] font-semibold text-[13.5px] transition-opacity disabled:opacity-45 touch-press"
          >
            {user?.subscriptionTier === 'pro' ? 'Current tier' : 'Switch to Pro'}
          </button>
        </div>

        {/* Premium */}
        <div
          className={`p-4 bg-[var(--surface)] border rounded-[18px] flex flex-col justify-between space-y-4 ${
            user?.subscriptionTier === 'premium' ? 'border-[var(--accent)]' : 'border-[var(--line)]'
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-2)]">Syndicate</span>
              {user?.subscriptionTier === 'premium' && (
                <span className="text-[10.5px] bg-[var(--surface-2)] text-[var(--text)] px-2.5 py-0.5 rounded-full border border-[var(--line)] font-medium">
                  Active
                </span>
              )}
            </div>
            <div>
              <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">Premium Terminal</h2>
              <div className="font-display text-[24px] font-bold text-[var(--text)] mt-1 tabular-nums">
                $79 <span className="text-[12.5px] text-[var(--text-2)] font-normal">/ mo</span>
              </div>
              <p className="text-[12.5px] text-[var(--text-2)] mt-1 leading-[1.5]">
                REST API endpoints, custom model tuning, and raw Poisson matrices.
              </p>
            </div>

            <ul className="space-y-2 text-[12.5px] text-[var(--text-2)]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Everything in Pro terminal</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">REST API programmatic access</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Custom shrinkage parameters</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Historical raw CSV exports</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('premium')}
            disabled={user?.subscriptionTier === 'premium'}
            type="button"
            className="w-full min-h-[44px] rounded-[12px] bg-[var(--surface-2)] hover:opacity-90 border border-[var(--line)] text-center text-[13px] font-medium text-[var(--text)] transition-opacity disabled:opacity-45 touch-press"
          >
            {user?.subscriptionTier === 'premium' ? 'Current tier' : 'Switch to Premium'}
          </button>
        </div>
      </div>
    </div>
  );
}
