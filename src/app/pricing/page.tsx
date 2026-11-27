'use client';

import React from 'react';
import Link from 'next/link';
import { Check, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { TIER_ORDER, TIER_RULES, ADMIN_OVERRIDE_RULE } from '@/lib/tiers';

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
            <span>{ADMIN_OVERRIDE_RULE.description}</span>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TIER_ORDER.map((tierId) => {
          const rule = TIER_RULES[tierId];
          const isCurrent = activeTier === tierId;
          return (
            <div
              key={tierId}
              className={`p-4 bg-[var(--surface)] border rounded-[18px] flex flex-col justify-between space-y-4 ${
                isCurrent ? 'border-[var(--accent)]' : 'border-[var(--line)]'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] ${
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
                    <h2 className="font-display text-[15px] font-semibold text-[var(--text)]">
                      {rule.name}
                    </h2>
                    <span className="text-[11.5px] font-mono tabular-nums text-[var(--text-2)]">
                      {rule.billingLabel}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-[var(--text-2)] mt-1 leading-[1.5]">
                    {rule.summary}
                  </p>
                </div>

                <ul className="space-y-2 text-[12.5px] text-[var(--text-2)]">
                  {rule.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
                      <span className="text-[var(--text)]">{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {tierId === 'free' ? (
                <Link
                  href="/settings"
                  className="w-full min-h-[44px] rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[13px] font-medium text-[var(--text)]"
                >
                  {isCurrent ? 'Current tier' : 'Included'}
                </Link>
              ) : (
                <div className="w-full min-h-[44px] rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[12.5px] font-medium text-[var(--text-2)]">
                  {isCurrent ? 'Current tier' : 'Server managed'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
