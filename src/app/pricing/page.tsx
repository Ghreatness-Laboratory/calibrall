'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2, ShieldCheck, Zap, ArrowRight, HelpCircle, AlertCircle } from 'lucide-react';
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
    setNotification(`Successfully switched subscription entitlement to ${tier.toUpperCase()}`);
    setTimeout(() => setNotification(''), 4000);
  };

  return (
    <div className="space-y-12 py-4">
      {/* Title */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <span className="text-xs font-mono uppercase tracking-widest text-brand-emerald">Configurable Subscription Plans</span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
          Institutional Football Intelligence
        </h1>
        <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
          Select the analytical fidelity required for your research. Switch tiers instantly to experience role entitlements.
        </p>

        {notification && (
          <div className="p-3 bg-brand-emerald/10 border border-brand-emerald/30 rounded text-xs font-mono text-brand-emerald flex items-center justify-center space-x-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{notification}</span>
          </div>
        )}
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {/* FREE */}
        <div className={`p-6 bg-surface-200 border rounded-lg flex flex-col justify-between space-y-6 ${
          user?.subscriptionTier === 'free' ? 'border-brand-emerald ring-1 ring-brand-emerald' : 'border-border'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-gray-400 uppercase font-bold">Research Tier</span>
              {user?.subscriptionTier === 'free' && (
                <span className="text-[10px] bg-brand-emerald/20 text-brand-emerald px-2 py-0.5 rounded font-mono font-bold">ACTIVE</span>
              )}
            </div>
            <h3 className="text-xl font-bold text-white mt-1">Free Tier</h3>
            <div className="text-3xl font-extrabold text-white mt-4 font-mono">$0 <span className="text-xs text-gray-400 font-normal">/ mo</span></div>
            <p className="text-xs text-gray-400 mt-2">Essential baseline match predictions and public performance dashboards.</p>

            <ul className="mt-6 space-y-3 text-xs text-gray-300">
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                <span>3 match analyses per day</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                <span>Basic Poisson goals model</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                <span>Historical calibration curves</span>
              </li>
              <li className="flex items-center space-x-2 text-gray-500">
                <span className="w-3.5 h-3.5 flex items-center justify-center text-xs">—</span>
                <span>Corner & card market lines (Locked)</span>
              </li>
              <li className="flex items-center space-x-2 text-gray-500">
                <span className="w-3.5 h-3.5 flex items-center justify-center text-xs">—</span>
                <span>Expected value margin alerts (Locked)</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('free')}
            disabled={user?.subscriptionTier === 'free'}
            className="w-full py-2.5 rounded bg-surface-100 hover:bg-surface-50 border border-border text-center text-xs font-semibold text-white transition-colors disabled:opacity-50"
          >
            {user?.subscriptionTier === 'free' ? 'Current Active Tier' : 'Switch to Free'}
          </button>
        </div>

        {/* PRO */}
        <div className={`p-6 bg-surface-200 border-2 rounded-lg flex flex-col justify-between space-y-6 relative shadow-glow-emerald ${
          user?.subscriptionTier === 'pro' ? 'border-brand-emerald' : 'border-border'
        }`}>
          <div className="absolute -top-3 right-6 bg-brand-emerald text-navy-950 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider">
            Most Popular
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-brand-emerald uppercase font-bold">Analyst Suite</span>
              {user?.subscriptionTier === 'pro' && (
                <span className="text-[10px] bg-brand-emerald/20 text-brand-emerald px-2 py-0.5 rounded font-mono font-bold">ACTIVE</span>
              )}
            </div>
            <h3 className="text-xl font-bold text-white mt-1">Pro Terminal</h3>
            <div className="text-3xl font-extrabold text-white mt-4 font-mono">$29 <span className="text-xs text-gray-400 font-normal">/ mo</span></div>
            <p className="text-xs text-gray-400 mt-2">Comprehensive market evaluation, corner & disciplinary models, and edge discovery.</p>

            <ul className="mt-6 space-y-3 text-xs text-gray-300">
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                <span>Unlimited European match analyses</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                <span>Dixon-Coles bivariate goal distribution</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                <span>Total & Team Corner count models</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                <span>Expected Value (EV) & Edge calculation</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                <span>Saved fixtures watchlist & notifications</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('pro')}
            disabled={user?.subscriptionTier === 'pro'}
            className="w-full py-2.5 rounded bg-brand-emerald hover:bg-emerald-600 text-center text-xs font-bold text-navy-950 transition-colors disabled:opacity-50"
          >
            {user?.subscriptionTier === 'pro' ? 'Current Active Tier' : 'Switch to Pro'}
          </button>
        </div>

        {/* PREMIUM */}
        <div className={`p-6 bg-surface-200 border rounded-lg flex flex-col justify-between space-y-6 ${
          user?.subscriptionTier === 'premium' ? 'border-brand-blue ring-1 ring-brand-blue' : 'border-border'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-brand-blue uppercase font-bold">Quantitative API</span>
              {user?.subscriptionTier === 'premium' && (
                <span className="text-[10px] bg-brand-blue/20 text-brand-blue px-2 py-0.5 rounded font-mono font-bold">ACTIVE</span>
              )}
            </div>
            <h3 className="text-xl font-bold text-white mt-1">Premium Terminal</h3>
            <div className="text-3xl font-extrabold text-white mt-4 font-mono">$79 <span className="text-xs text-gray-400 font-normal">/ mo</span></div>
            <p className="text-xs text-gray-400 mt-2">Programmatic access, raw Poisson matrices, and custom model parameter tuning.</p>

            <ul className="mt-6 space-y-3 text-xs text-gray-300">
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-blue shrink-0" />
                <span>Everything in Pro Terminal</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-blue shrink-0" />
                <span>REST API programmatic access (/api/v1)</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-blue shrink-0" />
                <span>Raw 10x10 scoreline probability matrices</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-blue shrink-0" />
                <span>Direct CSV data exports</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleSelectTier('premium')}
            disabled={user?.subscriptionTier === 'premium'}
            className="w-full py-2.5 rounded bg-surface-100 hover:bg-surface-50 border border-border text-center text-xs font-semibold text-white transition-colors disabled:opacity-50"
          >
            {user?.subscriptionTier === 'premium' ? 'Current Active Tier' : 'Switch to Premium'}
          </button>
        </div>
      </div>

      {/* Stripe Payment Integration Status Box */}
      <div className="max-w-3xl mx-auto p-4 bg-surface-100 border border-border rounded flex items-start space-x-3 text-xs text-gray-400">
        <AlertCircle className="w-4 h-4 text-brand-amber shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-white">Stripe Integration Sandbox Status:</p>
          <p>
            Payment processing is currently configured for development sandbox mode. In accordance with Section 16 of the master specification, billing webhooks verify cryptographic signatures on the server before updating database entitlements.
          </p>
        </div>
      </div>
    </div>
  );
}
