'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  UserProfile, 
  UserPreferences 
} from '@/types';
import { 
  getStoredUser, 
  setStoredUser, 
  getStoredPreferences, 
  setStoredPreferences 
} from '@/lib/supabase/client';
import { COMPETITIONS } from '@/lib/data/seedData';
import { 
  CheckCircle2, 
  Contrast, 
  Sliders, 
  CreditCard, 
  FileText, 
  ShieldCheck, 
  ChevronRight 
} from 'lucide-react';
import AccountInstallRow from '@/components/pwa/AccountInstallRow';

export default function SettingsPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [isMonochrome, setIsMonochrome] = useState<boolean>(false);

  useEffect(() => {
    setUser(getStoredUser());
    setPrefs(getStoredPreferences());
    try {
      const saved = localStorage.getItem('calibrall_monochrome_mode') === 'true';
      setIsMonochrome(saved);
    } catch {}
  }, []);

  if (!user || !prefs) return null;

  const handleToggleMonochrome = (enabled: boolean) => {
    setIsMonochrome(enabled);
    try {
      if (enabled) {
        document.documentElement.classList.add('monochrome');
        localStorage.setItem('calibrall_monochrome_mode', 'true');
      } else {
        document.documentElement.classList.remove('monochrome');
        localStorage.setItem('calibrall_monochrome_mode', 'false');
      }
    } catch {}
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredUser(user);
    setStoredPreferences(prefs);
    setSaveStatus('Preferences saved');
    setTimeout(() => setSaveStatus(''), 2500);
  };

  const toggleCompetition = (code: string) => {
    const list = prefs.preferredCompetitions.includes(code)
      ? prefs.preferredCompetitions.filter(c => c !== code)
      : [...prefs.preferredCompetitions, code];
    setPrefs({ ...prefs, preferredCompetitions: list });
  };

  return (
    <div className="max-w-xl mx-auto space-y-3.5 py-1">
      {/* Title 24/30 semibold */}
      <div className="space-y-0.5">
        <h1 className="text-[24px] font-semibold leading-[30px] text-[#EDF1F6] tracking-[-0.015em]">
          Account & preferences
        </h1>
        <p className="text-[13px] text-[#8A95A5]">
          Manage your subscription tier, analytical thresholds, and app settings.
        </p>
      </div>

      {/* Profile Header */}
      <div className="bg-[#141A23] border border-[#232C3A] rounded-[18px] p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-[36px] h-[36px] rounded-full bg-[#1A222E] border border-[#232C3A] flex items-center justify-center font-semibold text-[15px] text-[#EDF1F6]">
            {user.fullName ? user.fullName[0].toUpperCase() : 'M'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-[#EDF1F6] truncate">
                {user.fullName || 'Analyst'}
              </h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#A8E05F] text-[#A8E05F] bg-[#A8E05F]/[0.08]">
                {user.subscriptionTier ? user.subscriptionTier.toUpperCase() : 'PRO'}
              </span>
            </div>
            <p className="text-[12px] text-[#8A95A5] truncate mt-0.5">
              {user.email || 'analyst@calibrall.app'}
            </p>
          </div>
        </div>

        {saveStatus && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#A8E05F] bg-[#A8E05F]/[0.12] border border-[#A8E05F]/30 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
            <span>{saveStatus}</span>
          </div>
        )}
      </div>

      {/* PWA Install Row */}
      <AccountInstallRow />

      <form onSubmit={handleSave} className="space-y-3.5">
        {/* Subscription & Access */}
        <div className="space-y-1.5">
          <div className="text-[12px] font-medium text-[#8A95A5] px-1">
            Subscription & access
          </div>
          <div className="border border-[#232C3A] bg-[#141A23] rounded-[18px] overflow-hidden">
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-[32px] h-[32px] rounded-[10px] bg-[#A8E05F]/[0.12] text-[#A8E05F] flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[#EDF1F6] leading-tight">
                    Calibrall Pro Terminal
                  </h3>
                  <p className="text-[12px] text-[#8A95A5] leading-tight mt-0.5">
                    Unrestricted access to all markets, Poisson matrix and NBA models
                  </p>
                </div>
              </div>

              <Link
                href="/pricing"
                className="text-[12px] font-semibold text-[#A8E05F] hover:underline flex items-center gap-0.5 shrink-0"
              >
                <span>Manage</span>
                <ChevronRight className="w-4 h-4" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </div>

        {/* Analytical Preferences */}
        <div className="space-y-1.5">
          <div className="text-[12px] font-medium text-[#8A95A5] px-1">
            Analytical preferences & gating
          </div>
          <div className="border border-[#232C3A] bg-[#141A23] rounded-[18px] divide-y divide-[#232C3A] overflow-hidden">
            {/* Probability Threshold Slider */}
            <div className="p-3.5 space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-[32px] h-[32px] rounded-[10px] bg-[#A8E05F]/[0.12] text-[#A8E05F] flex items-center justify-center shrink-0">
                    <Sliders className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[13.5px] font-semibold text-[#EDF1F6]">Min model probability</h3>
                    <p className="text-[12px] text-[#8A95A5]">Filter out predictions below this threshold</p>
                  </div>
                </div>
                <span className="text-[#A8E05F] font-semibold tabular-nums text-[13px]">
                  {(prefs.minProbabilityThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0.40"
                max="0.80"
                step="0.01"
                value={prefs.minProbabilityThreshold}
                onChange={(e) => setPrefs({ ...prefs, minProbabilityThreshold: parseFloat(e.target.value) })}
                className="w-full h-[4px] accent-[#A8E05F] cursor-pointer bg-[#1A222E] rounded-full"
              />
            </div>

            {/* Edge Threshold Slider */}
            <div className="p-3.5 space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-[32px] h-[32px] rounded-[10px] bg-[#A8E05F]/[0.12] text-[#A8E05F] flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[13.5px] font-semibold text-[#EDF1F6]">Min statistical edge</h3>
                    <p className="text-[12px] text-[#8A95A5]">Safety hurdle required against bookmaker implied odds</p>
                  </div>
                </div>
                <span className="text-[#A8E05F] font-semibold tabular-nums text-[13px]">
                  +{(prefs.minEdgeThreshold * 100).toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.10"
                step="0.005"
                value={prefs.minEdgeThreshold}
                onChange={(e) => setPrefs({ ...prefs, minEdgeThreshold: parseFloat(e.target.value) })}
                className="w-full h-[4px] accent-[#A8E05F] cursor-pointer bg-[#1A222E] rounded-full"
              />
            </div>

            {/* Active Competitions Scope */}
            <div className="p-3.5 space-y-2">
              <h3 className="text-[13.5px] font-semibold text-[#EDF1F6]">Active competition scopes</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {COMPETITIONS.map(c => {
                  const active = prefs.preferredCompetitions.includes(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => toggleCompetition(c.code)}
                      className={`h-[36px] px-3 rounded-[12px] border text-[12px] font-medium flex items-center justify-between transition-colors touch-press ${
                        active
                          ? 'bg-[#A8E05F]/[0.12] border-[#A8E05F] text-[#A8E05F]'
                          : 'bg-[#1A222E] border-[#232C3A] text-[#8A95A5] hover:text-[#EDF1F6]'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      {active && <CheckCircle2 className="w-3.5 h-3.5 text-[#A8E05F] shrink-0 ml-1" strokeWidth={2} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Display Theme */}
        <div className="space-y-1.5">
          <div className="text-[12px] font-medium text-[#8A95A5] px-1">
            Display theme
          </div>
          <div className="border border-[#232C3A] bg-[#141A23] rounded-[18px] overflow-hidden">
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-[32px] h-[32px] rounded-[10px] bg-[#A8E05F]/[0.12] text-[#A8E05F] flex items-center justify-center shrink-0">
                  <Contrast className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-[13.5px] font-semibold text-[#EDF1F6] leading-tight">
                    {isMonochrome ? 'Noir Monochrome Mode' : 'Calibrall Native Dark Theme'}
                  </h3>
                  <p className="text-[12px] text-[#8A95A5] leading-tight mt-0.5">
                    {isMonochrome ? 'High contrast grayscale styling' : 'Calibrall signature #0D1117 canvas with soft lime accents'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggleMonochrome(!isMonochrome)}
                className="h-[32px] px-3 rounded-[10px] bg-[#1A222E] hover:bg-white/[0.05] border border-[#232C3A] text-[12px] font-medium text-[#EDF1F6] transition-transform active:scale-[0.98] shrink-0 touch-press"
              >
                Switch to {isMonochrome ? 'Color' : 'Monochrome'}
              </button>
            </div>
          </div>
        </div>

        {/* Legal & Methodology */}
        <div className="space-y-1.5">
          <div className="text-[12px] font-medium text-[#8A95A5] px-1">
            Governance & methodology
          </div>
          <div className="border border-[#232C3A] bg-[#141A23] rounded-[18px] divide-y divide-[#232C3A] overflow-hidden">
            <Link
              href="/responsible-use"
              className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#1A222E]/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-[32px] h-[32px] rounded-[10px] bg-[#A8E05F]/[0.12] text-[#A8E05F] flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-[13.5px] font-semibold text-[#EDF1F6]">Responsible use & policy</h3>
                  <p className="text-[12px] text-[#8A95A5]">Non wagering compliance, ethical standards, terms</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8A95A5]" strokeWidth={2} />
            </Link>

            <Link
              href="/methodology"
              className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#1A222E]/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-[32px] h-[32px] rounded-[10px] bg-[#A8E05F]/[0.12] text-[#A8E05F] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-[13.5px] font-semibold text-[#EDF1F6]">Model methodology</h3>
                  <p className="text-[12px] text-[#8A95A5]">Dixon Coles parameters, Poisson distributions, NBA pace</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8A95A5]" strokeWidth={2} />
            </Link>
          </div>
        </div>

        {/* Save Button: 46px high, accent background, dark text, 15px font-semibold */}
        <div className="pt-2">
          <button
            type="submit"
            className="w-full h-[46px] rounded-[14px] bg-[#A8E05F] hover:bg-[#b5e870] active:scale-[0.98] text-[#0D1117] font-semibold text-[15px] flex items-center justify-center transition-all duration-120 touch-press"
          >
            <span>Save analytical preferences</span>
          </button>
        </div>
      </form>
    </div>
  );
}
