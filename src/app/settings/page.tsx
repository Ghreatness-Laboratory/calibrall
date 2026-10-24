'use client';

import React, { useState, useEffect } from 'react';
import { 
  UserProfile, 
  UserPreferences, 
  SupportedOptionType 
} from '@/types';
import { 
  getStoredUser, 
  setStoredUser, 
  getStoredPreferences, 
  setStoredPreferences 
} from '@/lib/supabase/client';
import { COMPETITIONS } from '@/lib/data/seedData';
import { SUPPORTED_OPTIONS_CATALOGUE } from '@/lib/prediction/marketCatalog';
import { 
  User, 
  CheckCircle2, 
  Contrast,
  Sliders,
  Save
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
    setSaveStatus('Preferences saved successfully.');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const toggleCompetition = (code: string) => {
    const list = prefs.preferredCompetitions.includes(code)
      ? prefs.preferredCompetitions.filter(c => c !== code)
      : [...prefs.preferredCompetitions, code];
    setPrefs({ ...prefs, preferredCompetitions: list });
  };

  const toggleOptionType = (type: SupportedOptionType) => {
    const current = prefs.preferredOptionTypes || [
      'win', 'draw', 'double_chance', 'over_under_goals', 'both_teams_to_score',
      'corners', 'bookings', 'highest_scoring_half', 'first_half_goals', 'second_half_result'
    ];
    const list = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    setPrefs({ ...prefs, preferredOptionTypes: list });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 py-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/[0.07]">
        <div>
          <h2 className="text-[19px] font-bold leading-[1.25] tracking-[-0.02em] text-[#ECF1EE]">
            Account & Analytical Preferences
          </h2>
          <p className="text-[12px] text-[#8B9890] mt-0.5">
            Configure default statistical thresholds, competition scopes, model bounds, and catalog filters.
          </p>
        </div>

        {saveStatus && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#B6E63B] bg-[rgba(182,230,59,0.12)] border border-[#B6E63B]/30 px-2.5 py-1 rounded-[6px]">
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
            <span>{saveStatus}</span>
          </div>
        )}
      </div>

      {/* PWA Install in Account tab */}
      <AccountInstallRow />

      <form onSubmit={handleSave} className="space-y-4 text-[12px]">
        {/* Profile Card */}
        <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-3">
          <h3 className="text-[13px] font-semibold text-[#ECF1EE] flex items-center gap-2">
            <User className="w-4 h-4 text-[#B6E63B]" strokeWidth={2} />
            <span>Profile & account tier</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[#8B9890] mb-1 text-[11px] font-medium">Full name</label>
              <input
                type="text"
                value={user.fullName}
                onChange={(e) => setUser({ ...user, fullName: e.target.value })}
                className="w-full h-[40px] bg-[#151E19] border border-white/[0.07] px-3 rounded-[11px] text-[13px] text-[#ECF1EE] focus:outline-hidden focus:border-[#B6E63B]"
              />
            </div>
            <div>
              <label className="block text-[#8B9890] mb-1 text-[11px] font-medium">Email address</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full h-[40px] bg-[#151E19] border border-white/[0.07] px-3 rounded-[11px] text-[13px] text-[#5E6A63] cursor-not-allowed"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between text-[11.5px] text-[#8B9890] border-t border-white/[0.05]">
            <div>
              Role: <span className="font-mono text-[#ECF1EE] capitalize">{user.role}</span>
            </div>
            <div>
              Subscription: <span className="font-mono text-[#B6E63B] capitalize font-semibold">{user.subscriptionTier}</span>
            </div>
          </div>
        </div>

        {/* Display Mode */}
        <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-[#ECF1EE] flex items-center gap-2">
              <Contrast className="w-4 h-4 text-[#B6E63B]" strokeWidth={2} />
              <span>Terminal display mode</span>
            </h3>
            <span className="text-[10px] font-mono text-[#5E6A63]">
              {isMonochrome ? 'Noir active' : 'Color active'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleToggleMonochrome(false)}
              className={`p-3 rounded-[11px] border text-left transition-all touch-press ${
                !isMonochrome
                  ? 'bg-[#151E19] border-[#B6E63B]'
                  : 'bg-[#151E19] border-white/[0.07] opacity-60 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-[13px] text-[#ECF1EE]">Dark Green Palette</span>
                {!isMonochrome && <CheckCircle2 className="w-4 h-4 text-[#B6E63B]" strokeWidth={2} />}
              </div>
              <p className="text-[11.5px] text-[#8B9890] leading-normal">
                Fintech palette (#0A0F0D, #101713) with lime accents (#B6E63B) and official club crests.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleToggleMonochrome(true)}
              className={`p-3 rounded-[11px] border text-left transition-all touch-press ${
                isMonochrome
                  ? 'bg-white text-black border-white'
                  : 'bg-[#151E19] border-white/[0.07] opacity-60 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-semibold text-[13px] ${isMonochrome ? 'text-black' : 'text-[#ECF1EE]'}`}>
                  Noir Monochrome
                </span>
                {isMonochrome && <CheckCircle2 className="w-4 h-4 text-black" strokeWidth={2} />}
              </div>
              <p className={`text-[11.5px] leading-normal ${isMonochrome ? 'text-neutral-700' : 'text-[#8B9890]'}`}>
                High-contrast monochrome paper view with pure grayscale highlights.
              </p>
            </button>
          </div>
        </div>

        {/* Statistical Thresholds */}
        <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-3">
          <h3 className="text-[13px] font-semibold text-[#ECF1EE] flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#B6E63B]" strokeWidth={2} />
            <span>Model Gating & Edge Hurdles</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[#8B9890] text-[11px] font-medium">Min Model Probability</label>
                <span className="font-mono text-[#B6E63B] font-semibold tabular-nums">
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
                className="w-full accent-[#B6E63B] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[#8B9890] text-[11px] font-medium">Min Statistical Edge (vs Book)</label>
                <span className="font-mono text-[#B6E63B] font-semibold tabular-nums">
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
                className="w-full accent-[#B6E63B] cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Preferred Competitions */}
        <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-2.5">
          <label className="block text-[#ECF1EE] text-[13px] font-semibold">Active Competition Scopes</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {COMPETITIONS.map(c => {
              const active = prefs.preferredCompetitions.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggleCompetition(c.code)}
                  className={`h-[36px] px-3 rounded-[9px] border text-[11.5px] font-medium flex items-center justify-between transition-colors touch-press ${
                    active
                      ? 'bg-[rgba(182,230,59,0.12)] border-[#B6E63B] text-[#B6E63B]'
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

        {/* Save Button */}
        <div className="pt-2">
          <button
            type="submit"
            className="w-full h-[46px] rounded-[11px] bg-[#B6E63B] hover:bg-[#c8ee47] active:bg-[#a5cf30] text-[#0A0F0D] font-semibold text-[13px] flex items-center justify-center gap-2 transition-transform active:scale-[0.98] touch-press shadow-xs"
          >
            <Save className="w-4 h-4" strokeWidth={2} />
            <span>Save Preferences</span>
          </button>
        </div>
      </form>
    </div>
  );
}
