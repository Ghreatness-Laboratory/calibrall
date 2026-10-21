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
    <div className="space-y-6 sm:space-y-7 py-2">
      {/* Title */}
      <div className="max-w-xl space-y-1 text-left">
        <span className="text-[11px] font-[500] text-[#b8e63a] block">Subscription plans</span>
        <h1 className="text-[22px] font-[500] text-[#e8efe9]">
          Institutional football intelligence
        </h1>
        <p className="text-[13px] text-[#8fa69a] leading-[1.65]">
          Select the analytical fidelity required for your research. Switch tiers instantly to experience model entitlements.
        </p>

        {notification && (
          <div className="p-2.5 bg-[#b8e63a]/15 border border-[#b8e63a]/30 rounded-[8px] text-[12px] font-mono text-[#b8e63a] mt-2">
            {notification}
          </div>
        )}
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl">
        {/* FREE */}
        <div className={`p-5 bg-[#0f2219] border rounded-[12px] flex flex-col justify-between space-y-5 ${
          user?.subscriptionTier === 'free' ? 'border-[#b8e63a]' : 'border-white/[0.08]'
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#8fa69a]">Research tier</span>
              {user?.subscriptionTier === 'free' && (
                <span className="text-[10px] bg-white/10 text-[#e8efe9] px-2 py-0.5 rounded-[4px]">Active</span>
              )}
            </div>
            <div>
              <h3 className="text-[16px] font-[500] text-[#e8efe9]">Free</h3>
              <div className="text-[24px] font-[500] text-[#e8efe9] mt-1 font-mono tabular-nums">$0 <span className="text-[12px] text-[#8fa69a] font-normal">/ mo</span></div>
              <p className="text-[12px] text-[#8fa69a] mt-1">Essential baseline match predictions and public performance dashboards.</p>
            </div>

            <ul className="space-y-2 text-[12px] text-[#8fa69a]">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />
                <span className="text-[#e8efe9]">3 match analyses per day</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />
                <span className="text-[#e8efe9]">Basic Poisson goals model</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />
                <span className="text-[#e8efe9]">Historical calibration curves</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('free')}
            disabled={user?.subscriptionTier === 'free'}
            type="button"
            className="w-full h-[40px] rounded-[8px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-center text-[13px] font-[500] text-[#e8efe9] transition-colors disabled:opacity-40"
          >
            {user?.subscriptionTier === 'free' ? 'Current tier' : 'Switch to Free'}
          </button>
        </div>

        {/* PRO */}
        <div className={`p-5 bg-[#0f2219] border rounded-[12px] flex flex-col justify-between space-y-5 relative ${
          user?.subscriptionTier === 'pro' ? 'border-[#b8e63a]' : 'border-white/[0.15]'
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#b8e63a]">Pro analyst</span>
              <span className="text-[10px] bg-[#e3b341]/15 text-[#e3b341] border border-[#e3b341]/40 px-2 py-0.5 rounded-[4px]">
                Popular
              </span>
            </div>
            <div>
              <h3 className="text-[16px] font-[500] text-[#e8efe9]">Pro terminal</h3>
              <div className="text-[24px] font-[500] text-[#e8efe9] mt-1 font-mono tabular-nums">$29 <span className="text-[12px] text-[#8fa69a] font-normal">/ mo</span></div>
              <p className="text-[12px] text-[#8fa69a] mt-1">Complete multi-market ranking, expected value analysis, corners & cards.</p>
            </div>

            <ul className="space-y-2 text-[12px] text-[#8fa69a]">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />
                <span className="text-[#e8efe9]">All 10 supported options catalog</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />
                <span className="text-[#e8efe9]">Expected value (EV) & Edge</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />
                <span className="text-[#e8efe9]">Negative binomial corner lines</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />
                <span className="text-[#e8efe9]">Disciplinary cards & referee model</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />
                <span className="text-[#e8efe9]">Watchlist bookmark alerts</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('pro')}
            disabled={user?.subscriptionTier === 'pro'}
            type="button"
            className="w-full h-[40px] rounded-[8px] bg-[#b8e63a] hover:bg-[#c8ee47] text-[#0a1812] font-[500] text-[13px] transition-colors disabled:opacity-40"
          >
            {user?.subscriptionTier === 'pro' ? 'Current tier' : 'Switch to Pro'}
          </button>
        </div>

        {/* PREMIUM */}
        <div className={`p-5 bg-[#0f2219] border rounded-[12px] flex flex-col justify-between space-y-5 ${
          user?.subscriptionTier === 'premium' ? 'border-[#b8e63a]' : 'border-white/[0.08]'
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#8fa69a]">Syndicate</span>
              {user?.subscriptionTier === 'premium' && (
                <span className="text-[10px] bg-white/10 text-[#e8efe9] px-2 py-0.5 rounded-[4px]">Active</span>
              )}
            </div>
            <div>
              <h3 className="text-[16px] font-[500] text-[#e8efe9]">Premium terminal</h3>
              <div className="text-[24px] font-[500] text-[#e8efe9] mt-1 font-mono tabular-nums">$79 <span className="text-[12px] text-[#8fa69a] font-normal">/ mo</span></div>
              <p className="text-[12px] text-[#8fa69a] mt-1">REST API endpoints, custom model tuning, and raw Poisson matrices.</p>
            </div>

            <ul className="space-y-2 text-[12px] text-[#8fa69a]">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />
                <span className="text-[#e8efe9]">Everything in Pro terminal</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />
                <span className="text-[#e8efe9]">REST API programmatic access</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />
                <span className="text-[#e8efe9]">Custom shrinkage parameters</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />
                <span className="text-[#e8efe9]">Historical raw CSV exports</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('premium')}
            disabled={user?.subscriptionTier === 'premium'}
            type="button"
            className="w-full h-[40px] rounded-[8px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-center text-[13px] font-[500] text-[#e8efe9] transition-colors disabled:opacity-40"
          >
            {user?.subscriptionTier === 'premium' ? 'Current tier' : 'Switch to Premium'}
          </button>
        </div>
      </div>
    </div>
  );
}
