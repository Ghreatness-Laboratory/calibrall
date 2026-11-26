'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { UserProfile, UserPreferences } from '@/types';
import {
  getStoredUser,
  setStoredUser,
  getStoredPreferences,
  setStoredPreferences,
} from '@/lib/supabase/client';
import { CANONICAL_COMPETITIONS } from '@/lib/data/canonicalCompetitions';
import {
  CheckCircle2,
  Contrast,
  Sliders,
  CreditCard,
  FileText,
  ShieldCheck,
  ChevronRight,
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
      ? prefs.preferredCompetitions.filter((c) => c !== code)
      : [...prefs.preferredCompetitions, code];
    setPrefs({ ...prefs, preferredCompetitions: list });
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 py-1">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-display text-[26px] font-bold leading-[1.15] text-[var(--text)] tracking-[-0.02em]">
          Account &amp; preferences
        </h1>
        <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
          Manage your subscription tier, analytical thresholds, and app settings.
        </p>
      </div>

      {/* Profile Card */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center font-display font-bold text-[15px] text-[var(--text)] shrink-0">
            {user.fullName ? user.fullName[0].toUpperCase() : 'M'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[14px] font-semibold text-[var(--text)] truncate">
                {user.fullName || 'Analyst'}
              </h2>
              <span className="text-[10.5px] px-2 py-0.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-2)] font-medium capitalize">
                {user.subscriptionTier || 'pro'}
              </span>
            </div>
            <p className="text-[11.5px] text-[var(--text-2)] truncate mt-0.5">
              {user.email || 'analyst@calibrall.app'}
            </p>
          </div>
        </div>

        {saveStatus && (
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--accent)]/30 px-2.5 py-1 rounded-full shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
            <span>{saveStatus}</span>
          </div>
        )}
      </div>

      <AccountInstallRow />

      <form onSubmit={handleSave} className="space-y-4">
        {/* Subscription & Access */}
        <div className="space-y-1.5">
          <div className="text-[12px] font-medium text-[var(--text-2)] px-1">
            Subscription &amp; access
          </div>
          <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] overflow-hidden">
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-[var(--text)] leading-tight">
                    Calibrall Pro Terminal
                  </h3>
                  <p className="text-[11.5px] text-[var(--text-2)] leading-tight mt-0.5">
                    Full access to all markets, Poisson matrix, and NBA models
                  </p>
                </div>
              </div>

              <Link
                href="/pricing"
                className="min-h-[44px] px-2 text-[12.5px] font-semibold text-[var(--accent)] hover:underline flex items-center gap-0.5 shrink-0 touch-press"
              >
                <span>Manage</span>
                <ChevronRight className="w-4 h-4" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </div>

        {/* Analytical Preferences */}
        <div className="space-y-1.5">
          <div className="text-[12px] font-medium text-[var(--text-2)] px-1">
            Analytical preferences &amp; gating
          </div>
          <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] divide-y divide-[var(--line)] overflow-hidden">
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[12.5px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <Sliders className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-[var(--text)]">
                      Min model probability
                    </h3>
                    <p className="text-[11.5px] text-[var(--text-2)]">
                      Filter out predictions below this threshold
                    </p>
                  </div>
                </div>
                <span className="font-display text-[var(--accent)] font-bold tabular-nums text-[13px]">
                  {(prefs.minProbabilityThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0.40"
                max="0.80"
                step="0.01"
                value={prefs.minProbabilityThreshold}
                onChange={(e) =>
                  setPrefs({ ...prefs, minProbabilityThreshold: parseFloat(e.target.value) })
                }
                className="w-full h-2 accent-[var(--accent-fill)] cursor-pointer bg-[var(--surface-2)] rounded-full"
              />
            </div>

            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[12.5px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-[var(--text)]">
                      Data coverage threshold
                    </h3>
                    <p className="text-[11.5px] text-[var(--text-2)]">
                      Data coverage requirement for calibration validation
                    </p>
                  </div>
                </div>
                <span className="font-display text-[var(--accent)] font-bold tabular-nums text-[13px]">
                  +{(prefs.minEdgeThreshold * 100).toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.10"
                step="0.005"
                value={prefs.minEdgeThreshold}
                onChange={(e) =>
                  setPrefs({ ...prefs, minEdgeThreshold: parseFloat(e.target.value) })
                }
                className="w-full h-2 accent-[var(--accent-fill)] cursor-pointer bg-[var(--surface-2)] rounded-full"
              />
            </div>

            <div className="p-4 space-y-2.5">
              <h3 className="text-[13px] font-semibold text-[var(--text)]">
                Active competition scopes
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.values(CANONICAL_COMPETITIONS)
                  .filter((c) => c.id !== 'comp_nba')
                  .map((c) => {
                    const active = prefs.preferredCompetitions.includes(c.code);
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => toggleCompetition(c.code)}
                        className={`min-h-[44px] px-3 rounded-[12px] border text-[12px] font-medium flex items-center justify-between transition-colors touch-press ${
                          active
                            ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                            : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                        }`}
                      >
                        <span className="truncate">{c.name}</span>
                        {active && (
                          <CheckCircle2
                            className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 ml-1"
                            strokeWidth={2}
                          />
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* Display Theme */}
        <div className="space-y-1.5">
          <div className="text-[12px] font-medium text-[var(--text-2)] px-1">
            Display theme
          </div>
          <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] overflow-hidden">
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                  <Contrast className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-[var(--text)] leading-tight">
                    {isMonochrome ? 'Noir monochrome mode' : 'System adaptive theme'}
                  </h3>
                  <p className="text-[11.5px] text-[var(--text-2)] leading-tight mt-0.5">
                    {isMonochrome
                      ? 'High contrast grayscale styling'
                      : 'Honors system light/dark appearance'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggleMonochrome(!isMonochrome)}
                className="min-h-[44px] px-3.5 rounded-[12px] bg-[var(--surface-2)] hover:border-[var(--border-strong)] border border-[var(--line)] text-[12px] font-medium text-[var(--text)] shrink-0 touch-press"
              >
                {isMonochrome ? 'Color mode' : 'Monochrome'}
              </button>
            </div>
          </div>
        </div>

        {/* Governance & Methodology */}
        <div className="space-y-1.5">
          <div className="text-[12px] font-medium text-[var(--text-2)] px-1">
            Governance &amp; methodology
          </div>
          <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] divide-y divide-[var(--line)] overflow-hidden">
            <Link
              href="/responsible-use"
              className="min-h-[56px] p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)] transition-colors touch-press"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-[var(--text)]">
                    Responsible use &amp; policy
                  </h3>
                  <p className="text-[11.5px] text-[var(--text-2)]">
                    Non-wagering compliance, ethical standards, terms
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--text-2)]" strokeWidth={2} />
            </Link>

            <Link
              href="/methodology"
              className="min-h-[56px] p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)] transition-colors touch-press"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-[var(--text)]">
                    Model methodology
                  </h3>
                  <p className="text-[11.5px] text-[var(--text-2)]">
                    Dixon Coles parameters, Poisson distributions, NBA pace
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--text-2)]" strokeWidth={2} />
            </Link>
          </div>
        </div>

        {/* Data Sources & Attributions */}
        <div className="space-y-1.5">
          <div className="text-[12px] font-medium text-[var(--text-2)] px-1">
            Data sources &amp; attributions
          </div>
          <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] divide-y divide-[var(--line)] overflow-hidden text-[12px]">
            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[var(--text)]">football-data.co.uk</span>
                <span className="text-[10.5px] text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 rounded-full border border-[var(--accent)]/25">
                  Primary stats
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-2)] leading-[1.5]">
                Scores, half-time results, shots on target, corners, disciplinary cards, referee assignments, and closing consensus odds across European leagues.
              </p>
            </div>

            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[var(--text)]">
                  Sean Elvidge (England-football-results)
                </span>
                <span className="text-[10.5px] text-[var(--info)] bg-[var(--surface-2)] px-2 py-0.5 rounded-full border border-[var(--line)]">
                  CC BY 4.0
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-2)] leading-[1.5]">
                Historical English league results archive used for long-run home advantage baselines and venue-specific head-to-head records.
              </p>
            </div>

            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[var(--text)]">football-data.org</span>
                <span className="text-[10.5px] text-[var(--medium)] bg-[var(--medium-soft)] px-2 py-0.5 rounded-full border border-[var(--medium)]/25">
                  Free tier API
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-2)] leading-[1.5]">
                Live match fixtures, matchday schedules, and in-play status for Premier League and European competitions.
              </p>
            </div>

            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[var(--text)]">openfootball (football.json)</span>
                <span className="text-[10.5px] text-[var(--text-2)] bg-[var(--surface-2)] px-2 py-0.5 rounded-full border border-[var(--line)]">
                  CC0
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-2)] leading-[1.5]">
                Open public domain fixtures and match calendars utilized as an independent validation and fallback source.
              </p>
            </div>

            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[var(--text)]">TheSportsDB.com</span>
                <span className="text-[10.5px] text-[var(--text-2)] bg-[var(--surface-2)] px-2 py-0.5 rounded-full border border-[var(--line)]">
                  Badges
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-2)] leading-[1.5]">
                Club crest artwork, badge URLs, and stadium metadata sourced with local cache preservation.
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-2">
          <button
            type="submit"
            className="w-full min-h-[46px] rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] font-bold text-[14px] flex items-center justify-center transition-all duration-150 touch-press"
          >
            <span>Save analytical preferences</span>
          </button>
        </div>
      </form>
    </div>
  );
}
