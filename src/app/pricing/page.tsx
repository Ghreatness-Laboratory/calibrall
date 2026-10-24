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
    <div className="space-y-3.5 py-1">
      {/* Title */}
      <div className="space-y-0.5">
        <h1 className="text-[23px] font-[700] leading-[1.2] text-[#ECF1EE] tracking-[-0.025em]">
          Subscription tiers
        </h1>
        <p className="text-[12px] text-[#8B9890]">
          Select the analytical fidelity required for your research.
        </p>

        {notification && (
          <div className="p-2.5 bg-[rgba(182,230,59,0.12)] border border-[#B6E63B]/30 rounded-[11px] text-[12px] text-[#B6E63B] mt-2 font-medium">
            {notification}
          </div>
        )}
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* FREE */}
        <div className={`p-4 bg-[#101713] border rounded-[14px] flex flex-col justify-between space-y-4 ${
          user?.subscriptionTier === 'free' ? 'border-[#B6E63B]' : 'border-white/[0.07]'
        }`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#8B9890]">Research tier</span>
              {user?.subscriptionTier === 'free' && (
                <span className="text-[10px] bg-[#151E19] text-[#ECF1EE] px-2 py-0.5 rounded-full border border-white/[0.07] font-mono">Active</span>
              )}
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[#ECF1EE]">Free</h3>
              <div className="text-[22px] font-bold text-[#ECF1EE] mt-1 tabular-nums">$0 <span className="text-[12px] text-[#8B9890] font-normal">/ mo</span></div>
              <p className="text-[12px] text-[#8B9890] mt-1">Essential baseline match predictions and public performance dashboards.</p>
            </div>

            <ul className="space-y-2 text-[12px] text-[#8B9890]">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
                <span className="text-[#ECF1EE]">3 match analyses per day</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
                <span className="text-[#ECF1EE]">Basic Poisson goals model</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
                <span className="text-[#ECF1EE]">Historical calibration curves</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('free')}
            disabled={user?.subscriptionTier === 'free'}
            type="button"
            className="w-full h-[46px] rounded-[11px] bg-[#151E19] hover:bg-white/[0.05] border border-white/[0.07] text-center text-[13.5px] font-medium text-[#ECF1EE] transition-transform active:scale-[0.98] disabled:opacity-40 touch-press"
          >
            {user?.subscriptionTier === 'free' ? 'Current tier' : 'Switch to Free'}
          </button>
        </div>

        {/* PRO */}
        <div className={`p-4 bg-[#101713] border rounded-[14px] flex flex-col justify-between space-y-4 relative ${
          user?.subscriptionTier === 'pro' ? 'border-[#B6E63B]' : 'border-white/[0.07]'
        }`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#B6E63B]">Pro analyst</span>
              <span className="text-[10px] bg-[rgba(226,174,69,0.12)] text-[#E2AE45] border border-[#E2AE45]/30 px-2 py-0.5 rounded-full font-semibold font-mono">
                POPULAR
              </span>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[#ECF1EE]">Pro Terminal</h3>
              <div className="text-[22px] font-bold text-[#ECF1EE] mt-1 tabular-nums">$29 <span className="text-[12px] text-[#8B9890] font-normal">/ mo</span></div>
              <p className="text-[12px] text-[#8B9890] mt-1">Complete multi market ranking, expected value analysis, corners & cards.</p>
            </div>

            <ul className="space-y-2 text-[12px] text-[#8B9890]">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
                <span className="text-[#ECF1EE]">All supported options catalog</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
                <span className="text-[#ECF1EE]">Expected value (EV) & Edge</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
                <span className="text-[#ECF1EE]">Negative binomial corner lines</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
                <span className="text-[#ECF1EE]">Disciplinary cards & referee model</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
                <span className="text-[#ECF1EE]">Watchlist bookmark alerts</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('pro')}
            disabled={user?.subscriptionTier === 'pro'}
            type="button"
            className="w-full h-[46px] rounded-[11px] bg-[#B6E63B] hover:bg-[#c3ed4e] text-[#0A0F0D] font-bold text-[14px] transition-transform active:scale-[0.98] disabled:opacity-40 touch-press shadow-sm"
          >
            {user?.subscriptionTier === 'pro' ? 'Current tier' : 'Switch to Pro'}
          </button>
        </div>

        {/* PREMIUM */}
        <div className={`p-4 bg-[#101713] border rounded-[14px] flex flex-col justify-between space-y-4 ${
          user?.subscriptionTier === 'premium' ? 'border-[#B6E63B]' : 'border-white/[0.07]'
        }`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#8B9890]">Syndicate</span>
              {user?.subscriptionTier === 'premium' && (
                <span className="text-[10px] bg-[#151E19] text-[#ECF1EE] px-2 py-0.5 rounded-full border border-white/[0.07] font-mono">Active</span>
              )}
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[#ECF1EE]">Premium Terminal</h3>
              <div className="text-[22px] font-bold text-[#ECF1EE] mt-1 tabular-nums">$79 <span className="text-[12px] text-[#8B9890] font-normal">/ mo</span></div>
              <p className="text-[12px] text-[#8B9890] mt-1">REST API endpoints, custom model tuning, and raw Poisson matrices.</p>
            </div>

            <ul className="space-y-2 text-[12px] text-[#8B9890]">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
                <span className="text-[#ECF1EE]">Everything in Pro terminal</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
                <span className="text-[#ECF1EE]">REST API programmatic access</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
                <span className="text-[#ECF1EE]">Custom shrinkage parameters</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
                <span className="text-[#ECF1EE]">Historical raw CSV exports</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('premium')}
            disabled={user?.subscriptionTier === 'premium'}
            type="button"
            className="w-full h-[46px] rounded-[11px] bg-[#151E19] hover:bg-white/[0.05] border border-white/[0.07] text-center text-[13.5px] font-medium text-[#ECF1EE] transition-transform active:scale-[0.98] disabled:opacity-40 touch-press"
          >
            {user?.subscriptionTier === 'premium' ? 'Current tier' : 'Switch to Premium'}
          </button>
        </div>
      </div>
    </div>
  );
}
