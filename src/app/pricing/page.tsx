'use client';

import React from 'react';
import Link from 'next/link';
import { Check, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';

export default function PricingPage() {
  const { user, isAdmin } = useAuth();
  const activeTier = isAdmin ? 'premium' : user?.tier || 'free';

  return (
    <div className="space-y-4 py-2">
      <header className="space-y-1">
        <h1 className="font-display text-[26px] font-[700] leading-[1.18] text-[var(--text)] tracking-[-0.02em]">
          Access tiers
        </h1>
        <p className="text-[12.5px] sm:text-[13px] text-[var(--text-2)]">
          Server verified entitlements for your Calibrall account.
        </p>
        {isAdmin && (
          <div className="p-3 bg-[var(--accent-soft)] border border-[var(--accent)]/30 rounded-[12px] text-[12.5px] text-[var(--accent)] mt-2 font-medium flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Admin account active: full non-expiring access is enabled across all markets.</span>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Free */}
        <div
          className={`p-4 bg-[var(--surface)] border rounded-[18px] flex flex-col justify-between space-y-4 ${
            activeTier === 'free' ? 'border-[var(--accent)]' : 'border-[var(--line)]'
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-2)]">Standard</span>
              {activeTier === 'free' && (
                <span className="text-[10.5px] bg-[var(--accent-soft)] text-[var(--accent)] px-2.5 py-0.5 rounded-full border border-[var(--accent)]/30 font-medium">
                  Active
                </span>
              )}
            </div>
            <div>
              <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">Free</h2>
              <p className="text-[12.5px] text-[var(--text-2)] mt-1 leading-[1.5]">
                Fixtures, calibrated probabilities, public track record, and 3 match summaries per day.
              </p>
            </div>

            <ul className="space-y-2 text-[12.5px] text-[var(--text-2)]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Daily fixture probabilities &amp; Record ledger</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">3 full match explanations per day</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Football &amp; basketball coverage</span>
              </li>
            </ul>
          </div>

          <Link
            href="/settings"
            className="w-full min-h-[44px] rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[13px] font-medium text-[var(--text)]"
          >
            {activeTier === 'free' ? 'Current tier' : 'Included'}
          </Link>
        </div>

        {/* Pro */}
        <div
          className={`p-4 bg-[var(--surface)] border rounded-[18px] flex flex-col justify-between space-y-4 ${
            activeTier === 'pro' ? 'border-[var(--accent)]' : 'border-[var(--line)]'
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--accent)]">Extended</span>
              {activeTier === 'pro' && (
                <span className="text-[10.5px] bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30 px-2.5 py-0.5 rounded-full font-semibold">
                  Active
                </span>
              )}
            </div>
            <div>
              <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">Pro</h2>
              <p className="text-[12.5px] text-[var(--text-2)] mt-1 leading-[1.5]">
                Unlimited match explanations, multi market comparisons, corners, and disciplinary factors.
              </p>
            </div>

            <ul className="space-y-2 text-[12.5px] text-[var(--text-2)]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Unlimited daily match explanations</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">All football &amp; basketball markets</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Referee &amp; situational context factors</span>
              </li>
            </ul>
          </div>

          <div className="w-full min-h-[44px] rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[12.5px] font-medium text-[var(--text-2)]">
            {activeTier === 'pro' ? 'Current tier' : 'Server managed'}
          </div>
        </div>

        {/* Premium */}
        <div
          className={`p-4 bg-[var(--surface)] border rounded-[18px] flex flex-col justify-between space-y-4 ${
            activeTier === 'premium' ? 'border-[var(--accent)]' : 'border-[var(--line)]'
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-2)]">Full research</span>
              {activeTier === 'premium' && (
                <span className="text-[10.5px] bg-[var(--accent-soft)] text-[var(--accent)] px-2.5 py-0.5 rounded-full border border-[var(--accent)]/30 font-medium">
                  {isAdmin ? 'Admin' : 'Active'}
                </span>
              )}
            </div>
            <div>
              <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">Premium</h2>
              <p className="text-[12.5px] text-[var(--text-2)] mt-1 leading-[1.5]">
                Complete access to every statistical breakdown, calibration curve, and API workflow.
              </p>
            </div>

            <ul className="space-y-2 text-[12.5px] text-[var(--text-2)]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Everything in Pro access</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Full Poisson matrix &amp; alternates</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                <span className="text-[var(--text)]">Priority calibration audit access</span>
              </li>
            </ul>
          </div>

          <div className="w-full min-h-[44px] rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[12.5px] font-medium text-[var(--text-2)]">
            {activeTier === 'premium' ? 'Current tier' : 'Server managed'}
          </div>
        </div>
      </div>
    </div>
  );
}
