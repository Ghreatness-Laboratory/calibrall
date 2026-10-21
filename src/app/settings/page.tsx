'use client';

import React, { useState, useEffect } from 'react';
import { 
  UserProfile, 
  UserPreferences, 
  MarketCategory 
} from '@/types';
import { 
  getStoredUser, 
  setStoredUser, 
  getStoredPreferences, 
  setStoredPreferences 
} from '@/lib/supabase/client';
import { COMPETITIONS } from '@/lib/data/seedData';
import { 
  Sliders, 
  User, 
  Clock, 
  Bell, 
  ShieldCheck, 
  Save, 
  CheckCircle2, 
  Trash2,
  Lock
} from 'lucide-react';

export default function SettingsPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>('');

  useEffect(() => {
    setUser(getStoredUser());
    setPrefs(getStoredPreferences());
  }, []);

  if (!user || !prefs) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredUser(user);
    setStoredPreferences(prefs);
    setSaveStatus('Preferences saved successfully!');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const toggleCompetition = (code: string) => {
    const list = prefs.preferredCompetitions.includes(code)
      ? prefs.preferredCompetitions.filter(c => c !== code)
      : [...prefs.preferredCompetitions, code];
    setPrefs({ ...prefs, preferredCompetitions: list });
  };

  const toggleMarket = (cat: MarketCategory) => {
    const list = prefs.preferredMarkets.includes(cat)
      ? prefs.preferredMarkets.filter(m => m !== cat)
      : [...prefs.preferredMarkets, cat];
    setPrefs({ ...prefs, preferredMarkets: list });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-2">
            <Sliders className="w-6 h-6 text-brand-emerald" />
            <span>Analytical Settings & Preferences</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Configure default statistical thresholds, favorite leagues, model uncertainty bounds, and account profile.
          </p>
        </div>

        {saveStatus && (
          <div className="flex items-center space-x-1.5 text-xs font-mono text-brand-emerald bg-brand-emerald/10 border border-brand-emerald/30 px-3 py-1.5 rounded">
            <CheckCircle2 className="w-4 h-4" />
            <span>{saveStatus}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* Profile Card */}
        <div className="bg-surface-200 border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center space-x-2">
            <User className="w-4 h-4 text-brand-blue" />
            <span>Profile & Account Credentials</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-400 mb-1">Full Name</label>
              <input
                type="text"
                value={user.fullName}
                onChange={(e) => setUser({ ...user, fullName: e.target.value })}
                className="w-full bg-surface-100 border border-border px-3 py-2 rounded text-white focus:outline-hidden focus:border-brand-emerald"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-1">Email Address</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full bg-surface-100 border border-border px-3 py-2 rounded text-gray-400 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between text-[11px] text-gray-400 border-t border-border-subtle">
            <div className="flex items-center space-x-2">
              <span>Current Role:</span>
              <span className="font-mono uppercase font-bold text-brand-emerald">{user.role}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span>Subscription Tier:</span>
              <span className="font-mono uppercase font-bold text-brand-blue">{user.subscriptionTier}</span>
            </div>
          </div>
        </div>

        {/* Statistical Thresholds */}
        <div className="bg-surface-200 border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-brand-emerald" />
            <span>Model Qualification Thresholds</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-300 font-medium">Minimum Probability Cutoff</span>
                <span className="font-mono font-bold text-brand-emerald">{(prefs.minProbabilityThreshold * 100).toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0.50"
                max="0.80"
                step="0.01"
                value={prefs.minProbabilityThreshold}
                onChange={(e) => setPrefs({ ...prefs, minProbabilityThreshold: parseFloat(e.target.value) })}
                className="w-full accent-brand-emerald cursor-pointer"
              />
              <span className="text-[10px] text-gray-500 block mt-1">Markets below this model probability will be flagged as marginal.</span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-300 font-medium">Minimum Statistical Edge (EV Margin)</span>
                <span className="font-mono font-bold text-brand-blue">+{(prefs.minEdgeThreshold * 100).toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.10"
                step="0.005"
                value={prefs.minEdgeThreshold}
                onChange={(e) => setPrefs({ ...prefs, minEdgeThreshold: parseFloat(e.target.value) })}
                className="w-full accent-brand-blue cursor-pointer"
              />
              <span className="text-[10px] text-gray-500 block mt-1">Required margin over bookmaker implied probability for value qualification.</span>
            </div>
          </div>
        </div>

        {/* Preferred Competitions */}
        <div className="bg-surface-200 border border-border rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-bold text-white">Preferred Competitions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {COMPETITIONS.map(c => {
              const active = prefs.preferredCompetitions.includes(c.code);
              return (
                <button
                  type="button"
                  key={c.code}
                  onClick={() => toggleCompetition(c.code)}
                  className={`p-2.5 rounded border text-left flex items-center justify-between transition-colors ${
                    active ? 'bg-brand-emerald/10 border-brand-emerald text-white' : 'bg-surface-100 border-border text-gray-400'
                  }`}
                >
                  <span className="font-bold text-xs">{c.code}</span>
                  {active && <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notifications & Timezone */}
        <div className="bg-surface-200 border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center space-x-2">
            <Clock className="w-4 h-4 text-brand-amber" />
            <span>Timezone & Notification Dispatch</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-400 mb-1">Display Timezone</label>
              <select
                value={prefs.timezone}
                onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
                className="w-full bg-surface-100 border border-border px-3 py-2 rounded text-white focus:outline-hidden focus:border-brand-emerald"
              >
                <option value="UTC">UTC (Universal Coordinated Time)</option>
                <option value="Europe/London">Europe / London (BST/GMT)</option>
                <option value="America/New_York">America / New York (EST)</option>
                <option value="Europe/Berlin">Europe / Berlin (CET)</option>
                <option value="Asia/Tokyo">Asia / Tokyo (JST)</option>
              </select>
            </div>

            <div className="flex items-center space-x-3 pt-4 sm:pt-6">
              <input
                type="checkbox"
                id="emailNotifs"
                checked={prefs.emailNotificationsEnabled}
                onChange={(e) => setPrefs({ ...prefs, emailNotificationsEnabled: e.target.checked })}
                className="rounded bg-surface-100 border-border text-brand-emerald focus:ring-0 w-4 h-4"
              />
              <label htmlFor="emailNotifs" className="text-xs text-gray-300 cursor-pointer">
                Enable pre-match odds movement alerts for saved fixtures
              </label>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="submit"
            className="px-6 py-2.5 rounded bg-brand-emerald hover:bg-emerald-600 text-navy-950 font-bold text-xs flex items-center space-x-2 shadow-glow-emerald transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save Preferences</span>
          </button>
        </div>
      </form>
    </div>
  );
}
