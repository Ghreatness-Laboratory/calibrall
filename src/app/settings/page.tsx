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
      {/* Title 23px font-700 */}
      <div className="space-y-0.5">
        <h1 className="text-[23px] font-[700] leading-[1.2] text-[#ECF1EE] tracking-[-0.025em]">
          Account & preferences
        </h1>
        <p className="text-[12px] text-[#8B9890]">
          Manage your subscription tier, analytical thresholds, and app settings.
        </p>
      </div>

      {/* Profile Header */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-[34px] h-[34px] rounded-full bg-[#151E19] border border-white/[0.07] flex items-center justify-center font-semibold text-[14px] text-[#ECF1EE]">
            {user.fullName ? user.fullName[0].toUpperCase() : 'M'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-[600] text-[#ECF1EE] truncate">
                {user.fullName || 'Analyst'}
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/[0.15] text-[#8B9890]">
                {user.subscriptionTier ? user.subscriptionTier.toUpperCase() : 'PRO'}
              </span>
            </div>
            <p className="text-[11.5px] text-[#8B9890] truncate mt-0.5">
              {user.email || 'analyst@calibrall.app'}
            </p>
          </div>
        </div>

        {saveStatus && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#B6E63B] bg-[#B6E63B]/[0.12] border border-[#B6E63B]/30 px-2.5 py-1 rounded-full">
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
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#8B9890] px-1">
            Subscription & access
          </div>
          <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] overflow-hidden">
            <div className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B6E63B]/[0.12] text-[#B6E63B] flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-[13px] font-[600] text-[#ECF1EE] leading-tight">
                    Calibrall Pro Terminal
                  </h3>
                  <p className="text-[11.5px] text-[#8B9890] leading-tight mt-0.5">
                    Unrestricted access to all markets, Poisson matrix and NBA models
                  </p>
                </div>
              </div>

              <Link
                href="/pricing"
                className="text-[12px] font-semibold text-[#B6E63B] hover:underline flex items-center gap-0.5 shrink-0"
              >
                <span>Manage</span>
                <ChevronRight className="w-4 h-4" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </div>

        {/* Analytical Preferences */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#8B9890] px-1">
            Analytical preferences & gating
          </div>
          <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] divide-y divide-white/[0.07] overflow-hidden">
            {/* Probability Threshold Slider */}
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B6E63B]/[0.12] text-[#B6E63B] flex items-center justify-center shrink-0">
                    <Sliders className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-[600] text-[#ECF1EE]">Min model probability</h3>
                    <p className="text-[11.5px] text-[#8B9890]">Filter out predictions below this threshold</p>
                  </div>
                </div>
                <span className="text-[#B6E63B] font-semibold tabular-nums text-[12.5px]">
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
                className="w-full h-[4px] accent-[#B6E63B] cursor-pointer bg-[#151E19] rounded-full"
              />
            </div>

            {/* Edge Threshold Slider */}
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B6E63B]/[0.12] text-[#B6E63B] flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-[600] text-[#ECF1EE]">Min statistical edge</h3>
                    <p className="text-[11.5px] text-[#8B9890]">Safety hurdle required against bookmaker implied odds</p>
                  </div>
                </div>
                <span className="text-[#B6E63B] font-semibold tabular-nums text-[12.5px]">
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
                className="w-full h-[4px] accent-[#B6E63B] cursor-pointer bg-[#151E19] rounded-full"
              />
            </div>

            {/* Active Competitions Scope */}
            <div className="p-3 space-y-2">
              <h3 className="text-[13px] font-[600] text-[#ECF1EE]">Active competition scopes</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {COMPETITIONS.map(c => {
                  const active = prefs.preferredCompetitions.includes(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => toggleCompetition(c.code)}
                      className={`h-[34px] px-2.5 rounded-[10px] border text-[11.5px] font-medium flex items-center justify-between transition-colors touch-press ${
                        active
                          ? 'bg-[#B6E63B]/[0.12] border-[#B6E63B] text-[#B6E63B]'
                          : 'bg-[#151E19] border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      {active && <CheckCircle2 className="w-3.5 h-3.5 text-[#B6E63B] shrink-0 ml-1" strokeWidth={2} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Display Theme */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#8B9890] px-1">
            Display theme
          </div>
          <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] overflow-hidden">
            <div className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B6E63B]/[0.12] text-[#B6E63B] flex items-center justify-center shrink-0">
                  <Contrast className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-[13px] font-[600] text-[#ECF1EE] leading-tight">
                    {isMonochrome ? 'Noir Monochrome Mode' : 'Calibrall Native Dark Theme'}
                  </h3>
                  <p className="text-[11.5px] text-[#8B9890] leading-tight mt-0.5">
                    {isMonochrome ? 'High contrast grayscale styling' : 'Calibrall signature #0A0F0D canvas with lime accents'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggleMonochrome(!isMonochrome)}
                className="h-[32px] px-3 rounded-[10px] bg-[#151E19] hover:bg-white/[0.05] border border-white/[0.07] text-[11.5px] font-medium text-[#ECF1EE] transition-transform active:scale-[0.98] shrink-0 touch-press"
              >
                Switch to {isMonochrome ? 'Color' : 'Monochrome'}
              </button>
            </div>
          </div>
        </div>

        {/* Legal & Methodology */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#8B9890] px-1">
            Governance & methodology
          </div>
          <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] divide-y divide-white/[0.07] overflow-hidden">
            <Link
              href="/responsible-use"
              className="p-3 flex items-center justify-between gap-3 hover:bg-[#151E19]/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B6E63B]/[0.12] text-[#B6E63B] flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-[13px] font-[600] text-[#ECF1EE]">Responsible use & policy</h3>
                  <p className="text-[11.5px] text-[#8B9890]">Non wagering compliance, ethical standards, terms</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8B9890]" strokeWidth={2} />
            </Link>

            <Link
              href="/methodology"
              className="p-3 flex items-center justify-between gap-3 hover:bg-[#151E19]/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-[30px] h-[30px] rounded-[8px] bg-[#B6E63B]/[0.12] text-[#B6E63B] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-[13px] font-[600] text-[#ECF1EE]">Model methodology</h3>
                  <p className="text-[11.5px] text-[#8B9890]">Dixon Coles parameters, Poisson distributions, NBA pace</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8B9890]" strokeWidth={2} />
            </Link>
          </div>
        </div>

        {/* Data Sources & Attributions */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#8B9890] px-1">
            Data sources & attributions
          </div>
          <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] divide-y divide-white/[0.07] overflow-hidden text-[12px]">
            <div className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#ECF1EE]">football-data.co.uk</span>
                <span className="text-[10px] font-mono text-[#B6E63B] bg-[#B6E63B]/10 px-1.5 py-0.5 rounded border border-[#B6E63B]/20">Primary Stats</span>
              </div>
              <p className="text-[11.5px] text-[#8B9890] leading-relaxed">
                Scores, half-time results, shots on target, corners, disciplinary cards, referee assignments, and closing consensus market odds across European leagues. Free for research, personal, and statistical analysis with attribution.
              </p>
            </div>

            <div className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#ECF1EE]">Sean Elvidge (England-football-results)</span>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">CC BY 4.0</span>
              </div>
              <p className="text-[11.5px] text-[#8B9890] leading-relaxed">
                Comprehensive historical English league results archive used strictly for long-run home advantage baselines and venue-specific head-to-head records. Licensed under Creative Commons Attribution 4.0 International.
              </p>
            </div>

            <div className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#ECF1EE]">football-data.org</span>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Free Tier API</span>
              </div>
              <p className="text-[11.5px] text-[#8B9890] leading-relaxed">
                Live match fixtures, matchday schedules, and in-play status for Premier League and Tier 1 European competitions under free plan token limits.
              </p>
            </div>

            <div className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#ECF1EE]">openfootball (football.json)</span>
                <span className="text-[10px] font-mono text-[#8B9890] bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/[0.1]">Public Domain (CC0)</span>
              </div>
              <p className="text-[11.5px] text-[#8B9890] leading-relaxed">
                Open public domain fixtures and match calendars utilized as an independent validation and fallback source.
              </p>
            </div>

            <div className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#ECF1EE]">TheSportsDB.com</span>
                <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">Art & Badges</span>
              </div>
              <p className="text-[11.5px] text-[#8B9890] leading-relaxed">
                Club crest artwork, badge URLs, and stadium metadata sourced via free community access (key 123) with local cache preservation.
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-2">
          <button
            type="submit"
            className="w-full h-[46px] rounded-[11px] bg-[#B6E63B] hover:bg-[#c5f34e] active:scale-[0.98] text-[#0A0F0D] font-[650] text-[14px] flex items-center justify-center transition-all duration-150 touch-press"
          >
            <span>Save analytical preferences</span>
          </button>
        </div>
      </form>
    </div>
  );
}
