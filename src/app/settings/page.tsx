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
  Sliders, 
  User, 
  Clock, 
  Save, 
  CheckCircle2, 
  Contrast,
  ShieldCheck
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <h1 className="text-[18px] font-[500] text-[#e8efe9]">
            Analytical settings & preferences
          </h1>
          <p className="text-[12px] text-[#8fa69a] mt-0.5">
            Configure default statistical thresholds, competition scopes, model bounds, and catalog filters.
          </p>
        </div>

        {saveStatus && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#b8e63a] bg-[#b8e63a]/15 border border-[#b8e63a]/30 px-2.5 py-1 rounded-[6px]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{saveStatus}</span>
          </div>
        )}
      </div>

      {/* PWA Install in Account tab */}
      <AccountInstallRow />

      <form onSubmit={handleSave} className="space-y-5 text-[12px]">
        {/* Profile Card */}
        <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-3">
          <h2 className="text-[14px] font-[500] text-[#e8efe9] flex items-center gap-2">
            <User className="w-4 h-4 text-[#e8efe9]" />
            <span>Profile & account tier</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[#8fa69a] mb-1 text-[11px] font-[500]">Full name</label>
              <input
                type="text"
                value={user.fullName}
                onChange={(e) => setUser({ ...user, fullName: e.target.value })}
                className="w-full bg-[#0a1812] border border-white/[0.08] px-3 py-1.5 rounded-[8px] text-[#e8efe9] focus:outline-hidden focus:border-[#b8e63a]"
              />
            </div>
            <div>
              <label className="block text-[#8fa69a] mb-1 text-[11px] font-[500]">Email address</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full bg-[#0a1812] border border-white/[0.08] px-3 py-1.5 rounded-[8px] text-[#8fa69a] opacity-70 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between text-[11px] text-[#8fa69a] border-t border-white/[0.06]">
            <div>
              Role: <span className="font-mono text-[#e8efe9] capitalize">{user.role}</span>
            </div>
            <div>
              Subscription: <span className="font-mono text-[#b8e63a] capitalize">{user.subscriptionTier}</span>
            </div>
          </div>
        </div>

        {/* Display Mode */}
        <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-[500] text-[#e8efe9] flex items-center gap-2">
              <Contrast className="w-4 h-4 text-[#b8e63a]" />
              <span>Terminal display mode</span>
            </h2>
            <span className="text-[11px] font-mono text-[#8fa69a]">
              {isMonochrome ? 'Black & white active' : 'Color active'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleToggleMonochrome(false)}
              className={`p-3 rounded-[8px] border text-left transition-all ${
                !isMonochrome
                  ? 'bg-[#0a1812] border-[#b8e63a] ring-1 ring-[#b8e63a]'
                  : 'bg-[#0a1812] border-white/[0.08] opacity-70 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-[500] text-[13px] text-[#e8efe9]">Color mode</span>
                {!isMonochrome && <CheckCircle2 className="w-3.5 h-3.5 text-[#b8e63a]" />}
              </div>
              <p className="text-[11px] text-[#8fa69a] leading-normal">
                Fintech dark green palette (#0a1812, #0f2219) with lime accents (#b8e63a) and official club crests.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleToggleMonochrome(true)}
              className={`p-3 rounded-[8px] border text-left transition-all ${
                isMonochrome
                  ? 'bg-white text-black border-white'
                  : 'bg-[#0a1812] border-white/[0.08] opacity-70 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-[500] text-[13px] ${isMonochrome ? 'text-black' : 'text-[#e8efe9]'}`}>
                  Black & white (Noir terminal)
                </span>
                {isMonochrome && <CheckCircle2 className="w-3.5 h-3.5 text-black" />}
              </div>
              <p className={`text-[11px] leading-normal ${isMonochrome ? 'text-gray-700' : 'text-[#8fa69a]'}`}>
                High-contrast monochrome paper view with pure grayscale highlights.
              </p>
            </button>
          </div>
        </div>

        {/* Statistical Thresholds */}
        <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-3">
          <h2 className="text-[14px] font-[500] text-[#e8efe9] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#b8e63a]" />
            <span>Model qualification thresholds</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#8fa69a] font-[500]">Minimum probability cutoff</span>
                <span className="font-mono font-[500] text-[#b8e63a]">{(prefs.minProbabilityThreshold * 100).toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0.50"
                max="0.80"
                step="0.01"
                value={prefs.minProbabilityThreshold}
                onChange={(e) => setPrefs({ ...prefs, minProbabilityThreshold: parseFloat(e.target.value) })}
                className="w-full accent-[#b8e63a] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#8fa69a] font-[500]">Minimum statistical edge (EV margin)</span>
                <span className="font-mono font-[500] text-[#e8efe9]">+{(prefs.minEdgeThreshold * 100).toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.10"
                step="0.005"
                value={prefs.minEdgeThreshold}
                onChange={(e) => setPrefs({ ...prefs, minEdgeThreshold: parseFloat(e.target.value) })}
                className="w-full accent-[#b8e63a] cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Preferred Competitions */}
        <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-3">
          <h2 className="text-[14px] font-[500] text-[#e8efe9]">Preferred competitions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {COMPETITIONS.map(c => {
              const active = prefs.preferredCompetitions.includes(c.code);
              return (
                <button
                  type="button"
                  key={c.code}
                  onClick={() => toggleCompetition(c.code)}
                  className={`p-2.5 rounded-[8px] border text-left flex items-center justify-between transition-colors ${
                    active ? 'bg-[#b8e63a]/15 border-[#b8e63a] text-[#e8efe9]' : 'bg-[#0a1812] border-white/[0.08] text-[#8fa69a]'
                  }`}
                >
                  <span className="font-[500] text-[12px]">{c.code}</span>
                  {active && <CheckCircle2 className="w-3.5 h-3.5 text-[#b8e63a]" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Supported Options Catalogue */}
        <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-[500] text-[#e8efe9] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#b8e63a]" />
              <span>Supported options catalogue</span>
            </h2>
            <span className="text-[11px] font-mono text-[#8fa69a]">
              10 authorized launch types
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Object.entries(SUPPORTED_OPTIONS_CATALOGUE).map(([key, opt]) => {
              const optType = key as SupportedOptionType;
              const activeList = prefs.preferredOptionTypes || [
                'win', 'draw', 'double_chance', 'over_under_goals', 'both_teams_to_score',
                'corners', 'bookings', 'highest_scoring_half', 'first_half_goals', 'second_half_result'
              ];
              const isSelected = activeList.includes(optType);

              return (
                <button
                  type="button"
                  key={optType}
                  onClick={() => toggleOptionType(optType)}
                  className={`p-2.5 rounded-[8px] border text-left transition-all ${
                    isSelected
                      ? 'bg-[#0a1812] border-[#b8e63a] ring-1 ring-[#b8e63a]/40 text-[#e8efe9]'
                      : 'bg-[#0a1812]/50 border-white/[0.06] text-[#8fa69a] opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <div>
                      <div className="font-[500] text-[12px] text-[#e8efe9]">
                        {opt.title}
                      </div>
                      <span className="text-[10px] font-mono text-[#b8e63a]">
                        Period: {opt.period}
                      </span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#b8e63a] shrink-0" />}
                  </div>
                  <p className="text-[11px] text-[#8fa69a] line-clamp-2 mt-0.5">
                    {opt.settlementRule}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notifications & Timezone */}
        <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-3">
          <h2 className="text-[14px] font-[500] text-[#e8efe9] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#e3b341]" />
            <span>Timezone & alerts</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[#8fa69a] mb-1 text-[11px] font-[500]">Display timezone</label>
              <select
                value={prefs.timezone}
                onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
                className="w-full bg-[#0a1812] border border-white/[0.08] px-3 py-1.5 rounded-[8px] text-[#e8efe9] focus:outline-hidden focus:border-[#b8e63a]"
              >
                <option value="UTC">UTC (Universal Coordinated Time)</option>
                <option value="Europe/London">Europe / London (BST/GMT)</option>
                <option value="America/New_York">America / New York (EST)</option>
                <option value="Europe/Berlin">Europe / Berlin (CET)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-4 sm:pt-6">
              <input
                type="checkbox"
                id="emailNotifs"
                checked={prefs.emailNotificationsEnabled}
                onChange={(e) => setPrefs({ ...prefs, emailNotificationsEnabled: e.target.checked })}
                className="rounded bg-[#0a1812] border-white/20 text-[#b8e63a] focus:ring-0 w-3.5 h-3.5"
              />
              <label htmlFor="emailNotifs" className="text-[12px] text-[#8fa69a] cursor-pointer">
                Enable line movement alerts for saved fixtures
              </label>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="submit"
            className="h-[42px] px-5 rounded-[8px] bg-[#b8e63a] hover:bg-[#c8ee47] text-[#0a1812] font-[500] text-[14px] flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save preferences</span>
          </button>
        </div>
      </form>
    </div>
  );
}
