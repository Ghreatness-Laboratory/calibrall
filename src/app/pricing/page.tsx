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
      {/* Title 24/30 semibold */}
      <div className="space-y-0.5">
        <h1 className="text-[24px] font-semibold leading-[30px] text-[#EDF1F6] tracking-[-0.015em]">
          Subscription tiers
        </h1>
        <p className="text-[13px] text-[#8A95A5]">
          Select the analytical fidelity required for your research.
        </p>

        {notification && (
          <div className="p-2.5 bg-[#A8E05F]/[0.12] border border-[#A8E05F]/30 rounded-[14px] text-[12px] text-[#A8E05F] mt-2">
            {notification}
          </div>
        )}
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* FREE */}
        <div className={`p-4 bg-[#141A23] border rounded-[18px] flex flex-col justify-between space-y-4 ${
          user?.subscriptionTier === 'free' ? 'border-[#A8E05F]' : 'border-[#232C3A]'
        }`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#8A95A5]">Research tier</span>
              {user?.subscriptionTier === 'free' && (
                <span className="text-[10px] bg-[#1A222E] text-[#EDF1F6] px-2 py-0.5 rounded-full border border-[#232C3A]">Active</span>
              )}
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-[#EDF1F6]">Free</h3>
              <div className="text-[22px] font-semibold text-[#EDF1F6] mt-1 tabular-nums">$0 <span className="text-[12px] text-[#8A95A5] font-normal">/ mo</span></div>
              <p className="text-[12px] text-[#8A95A5] mt-1">Essential baseline match predictions and public performance dashboards.</p>
            </div>

            <ul className="space-y-2 text-[12px] text-[#8A95A5]">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#A8E05F] shrink-0" strokeWidth={2} />
                <span className="text-[#EDF1F6]">3 match analyses per day</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#A8E05F] shrink-0" strokeWidth={2} />
                <span className="text-[#EDF1F6]">Basic Poisson goals model</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#A8E05F] shrink-0" strokeWidth={2} />
                <span className="text-[#EDF1F6]">Historical calibration curves</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('free')}
            disabled={user?.subscriptionTier === 'free'}
            type="button"
            className="w-full h-[46px] rounded-[14px] bg-[#1A222E] hover:bg-white/[0.05] border border-[#232C3A] text-center text-[14px] font-medium text-[#EDF1F6] transition-transform active:scale-[0.98] disabled:opacity-40 touch-press"
          >
            {user?.subscriptionTier === 'free' ? 'Current tier' : 'Switch to Free'}
          </button>
        </div>

        {/* PRO */}
        <div className={`p-4 bg-[#141A23] border rounded-[18px] flex flex-col justify-between space-y-4 relative ${
          user?.subscriptionTier === 'pro' ? 'border-[#A8E05F]' : 'border-[#232C3A]'
        }`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#A8E05F]">Pro analyst</span>
              <span className="text-[10px] bg-[#E8B64A]/[0.15] text-[#E8B64A] border border-[#E8B64A]/30 px-2 py-0.5 rounded-full font-semibold">
                Popular
              </span>
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-[#EDF1F6]">Pro Terminal</h3>
              <div className="text-[22px] font-semibold text-[#EDF1F6] mt-1 tabular-nums">$29 <span className="text-[12px] text-[#8A95A5] font-normal">/ mo</span></div>
              <p className="text-[12px] text-[#8A95A5] mt-1">Complete multi market ranking, expected value analysis, corners & cards.</p>
            </div>

            <ul className="space-y-2 text-[12px] text-[#8A95A5]">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#A8E05F] shrink-0" strokeWidth={2} />
                <span className="text-[#EDF1F6]">All supported options catalog</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#A8E05F] shrink-0" strokeWidth={2} />
                <span className="text-[#EDF1F6]">Expected value (EV) & Edge</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#A8E05F] shrink-0" strokeWidth={2} />
                <span className="text-[#EDF1F6]">Negative binomial corner lines</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#A8E05F] shrink-0" strokeWidth={2} />
                <span className="text-[#EDF1F6]">Disciplinary cards & referee model</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#A8E05F] shrink-0" strokeWidth={2} />
                <span className="text-[#EDF1F6]">Watchlist bookmark alerts</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('pro')}
            disabled={user?.subscriptionTier === 'pro'}
            type="button"
            className="w-full h-[46px] rounded-[14px] bg-[#A8E05F] hover:bg-[#b5e870] text-[#0D1117] font-semibold text-[15px] transition-transform active:scale-[0.98] disabled:opacity-40 touch-press"
          >
            {user?.subscriptionTier === 'pro' ? 'Current tier' : 'Switch to Pro'}
          </button>
        </div>

        {/* PREMIUM */}
        <div className={`p-4 bg-[#141A23] border rounded-[18px] flex flex-col justify-between space-y-4 ${
          user?.subscriptionTier === 'premium' ? 'border-[#A8E05F]' : 'border-[#232C3A]'
        }`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#8A95A5]">Syndicate</span>
              {user?.subscriptionTier === 'premium' && (
                <span className="text-[10px] bg-[#1A222E] text-[#EDF1F6] px-2 py-0.5 rounded-full border border-[#232C3A]">Active</span>
              )}
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-[#EDF1F6]">Premium Terminal</h3>
              <div className="text-[22px] font-semibold text-[#EDF1F6] mt-1 tabular-nums">$79 <span className="text-[12px] text-[#8A95A5] font-normal">/ mo</span></div>
              <p className="text-[12px] text-[#8A95A5] mt-1">REST API endpoints, custom model tuning, and raw Poisson matrices.</p>
            </div>

            <ul className="space-y-2 text-[12px] text-[#8A95A5]">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#A8E05F] shrink-0" strokeWidth={2} />
                <span className="text-[#EDF1F6]">Everything in Pro terminal</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#A8E05F] shrink-0" strokeWidth={2} />
                <span className="text-[#EDF1F6]">REST API programmatic access</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#A8E05F] shrink-0" strokeWidth={2} />
                <span className="text-[#EDF1F6]">Custom shrinkage parameters</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#A8E05F] shrink-0" strokeWidth={2} />
                <span className="text-[#EDF1F6]">Historical raw CSV exports</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('premium')}
            disabled={user?.subscriptionTier === 'premium'}
            type="button"
            className="w-full h-[46px] rounded-[14px] bg-[#1A222E] hover:bg-white/[0.05] border border-[#232C3A] text-center text-[14px] font-medium text-[#EDF1F6] transition-transform active:scale-[0.98] disabled:opacity-40 touch-press"
          >
            {user?.subscriptionTier === 'premium' ? 'Current tier' : 'Switch to Premium'}
          </button>
        </div>
      </div>
    </div>
  );
}
