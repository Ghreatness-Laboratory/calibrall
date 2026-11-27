'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { UserPreferences } from '@/types';
import {
  getStoredPreferences,
  setStoredPreferences,
} from '@/lib/storage/userStorage';
import { CANONICAL_COMPETITIONS } from '@/lib/data/canonicalCompetitions';
import { useAuth } from '@/lib/context/AuthContext';
import {
  CheckCircle2,
  Contrast,
  Sliders,
  ShieldCheck,
  ChevronRight,
  LogOut,
  Trash2,
  AlertTriangle,
  Lock,
  Loader2,
  Calendar,
} from 'lucide-react';
import AccountInstallRow from '@/components/pwa/AccountInstallRow';

function formatExpiryLabel(
  isAdmin: boolean,
  tier: string,
  tierExpiresAt: string | null,
  isExpired: boolean
): string {
  if (isAdmin) return 'Never expires (Admin access)';
  if (tier === 'free') {
    return isExpired ? 'Previous tier expired (on Free tier)' : 'No expiry (Free tier)';
  }
  if (!tierExpiresAt) return 'No expiry date set';
  const parsed = new Date(tierExpiresAt);
  if (Number.isNaN(parsed.getTime())) return tierExpiresAt;
  return `Expires ${parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

export default function SettingsPage() {
  const { user, isAdmin, refreshProfile, signOutAndClearCaches } = useAuth();
  const [displayName, setDisplayName] = useState<string>('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<string>('');
  const [profileError, setProfileError] = useState<string>('');

  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [isMonochrome, setIsMonochrome] = useState<boolean>(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setPrefs(getStoredPreferences());
    try {
      const saved = localStorage.getItem('calibrall_monochrome_mode') === 'true';
      setIsMonochrome(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
    }
  }, [user]);

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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileStatus('');
    const trimmed = displayName.trim();
    if (!trimmed) {
      setProfileError('Display name cannot be empty.');
      return;
    }

    setProfileSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(json?.error || 'Could not update display name.');
        return;
      }
      await refreshProfile();
      setProfileStatus('Name updated');
      setTimeout(() => setProfileStatus(''), 2500);
    } catch {
      setProfileError('Could not update display name.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSavePrefs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefs) return;
    setStoredPreferences(prefs);
    setSaveStatus('Preferences saved');
    setTimeout(() => setSaveStatus(''), 2500);
  };

  const toggleCompetition = (code: string) => {
    if (!prefs) return;
    const list = prefs.preferredCompetitions.includes(code)
      ? prefs.preferredCompetitions.filter((c) => c !== code)
      : [...prefs.preferredCompetitions, code];
    setPrefs({ ...prefs, preferredCompetitions: list });
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOutAndClearCaches('/login');
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError('');
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm permanent account removal.');
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(json?.error || 'Account deletion failed.');
        setDeleting(false);
        return;
      }
      await signOutAndClearCaches('/');
    } catch {
      setDeleteError('Account deletion failed.');
      setDeleting(false);
    }
  };

  if (!prefs) return null;

  const activeTier = isAdmin ? 'premium' : user?.tier || 'free';
  const tierLabel = isAdmin
    ? 'Admin (Full access)'
    : activeTier.charAt(0).toUpperCase() + activeTier.slice(1);
  const expiryText = formatExpiryLabel(
    isAdmin,
    activeTier,
    user?.tierExpiresAt || null,
    Boolean(user?.isExpired)
  );
  const initialLetter = (user?.displayName || user?.email || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="max-w-xl mx-auto space-y-4 py-1">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-display text-[26px] font-bold leading-[1.15] text-[var(--text)] tracking-[-0.02em]">
          Account &amp; preferences
        </h1>
        <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
          Manage your account details, access tier, analytical thresholds, and app settings.
        </p>
      </div>

      {/* Real Authenticated Profile Card */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center font-display font-bold text-[15px] text-[var(--text)] shrink-0">
              {initialLetter}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-[14.5px] font-semibold text-[var(--text)] truncate">
                  {user?.displayName || user?.email || 'Signed in account'}
                </h2>
                <span className="text-[10.5px] px-2.5 py-0.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)] font-semibold">
                  {tierLabel}
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-2)] truncate mt-0.5">
                {user?.email || 'Authenticated session'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[12px] text-[var(--text-2)] bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] px-3 py-2">
          <Calendar className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
          <span>{expiryText}</span>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-2.5 pt-1 border-t border-[var(--line)]">
          <label htmlFor="account-display-name" className="block text-[12px] font-medium text-[var(--text-2)]">
            Display name
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="account-display-name"
              type="text"
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              className="flex-1 min-h-[44px] px-3.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={profileSaving}
              className="min-h-[44px] px-4 rounded-[12px] bg-[var(--surface-2)] hover:border-[var(--accent)] border border-[var(--line)] text-[12.5px] font-semibold text-[var(--text)] flex items-center justify-center gap-1.5 disabled:opacity-50 touch-press"
            >
              {profileSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save name</span>
            </button>
          </div>
          {profileStatus && (
            <div className="text-[11.5px] text-[var(--accent)] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{profileStatus}</span>
            </div>
          )}
          {profileError && (
            <div className="text-[11.5px] text-[var(--danger)]">{profileError}</div>
          )}
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--line)]">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="min-h-[44px] px-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-[13px] font-semibold text-[var(--text)] flex items-center gap-2 touch-press disabled:opacity-50"
          >
            {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            <span>{signingOut ? 'Signing out...' : 'Sign out'}</span>
          </button>

          {isAdmin && (
            <Link
              href="/admin"
              className="min-h-[44px] px-4 rounded-[12px] bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[13px] font-semibold text-[var(--accent)] flex items-center gap-1.5 touch-press"
            >
              <Lock className="w-4 h-4" />
              <span>System admin</span>
            </Link>
          )}
        </div>
      </div>

      <AccountInstallRow />

      {/* Analytical Preferences */}
      <form onSubmit={handleSavePrefs} className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[12px] font-medium text-[var(--text-2)]">
              Analytical preferences
            </span>
            {saveStatus && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--accent)] font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                <span>{saveStatus}</span>
              </span>
            )}
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
              <h3 className="text-[13px] font-semibold text-[var(--text)]">
                Preferred competitions
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

        <button
          type="submit"
          className="w-full min-h-[46px] rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] font-bold text-[14px] flex items-center justify-center transition-all duration-150 touch-press"
        >
          <span>Save preferences</span>
        </button>
      </form>

      {/* Governance & Legal */}
      <div className="space-y-1.5">
        <div className="text-[12px] font-medium text-[var(--text-2)] px-1">
          Legal &amp; methodology
        </div>
        <div className="border border-[var(--line)] bg-[var(--surface)] rounded-[18px] divide-y divide-[var(--line)] overflow-hidden">
          <Link
            href="/methodology"
            className="min-h-[52px] p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)] transition-colors touch-press"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span className="text-[13px] font-semibold text-[var(--text)]">Model methodology</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--text-2)]" />
          </Link>
          <Link
            href="/terms"
            className="min-h-[52px] p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)] transition-colors touch-press"
          >
            <span className="text-[13px] font-semibold text-[var(--text)]">Terms of service</span>
            <ChevronRight className="w-4 h-4 text-[var(--text-2)]" />
          </Link>
          <Link
            href="/privacy"
            className="min-h-[52px] p-4 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)] transition-colors touch-press"
          >
            <span className="text-[13px] font-semibold text-[var(--text)]">Privacy policy</span>
            <ChevronRight className="w-4 h-4 text-[var(--text-2)]" />
          </Link>
        </div>
      </div>

      {/* Delete Account */}
      <div className="border border-[var(--danger)]/30 bg-[var(--surface)] rounded-[18px] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[var(--danger)] shrink-0" />
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--text)]">Delete account</h3>
              <p className="text-[11.5px] text-[var(--text-2)]">
                Permanently remove your account and profile data.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDeleteOpen(!deleteOpen);
              setDeleteError('');
            }}
            className="min-h-[40px] px-3 rounded-[10px] border border-[var(--danger)]/40 text-[12px] font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)] shrink-0 touch-press"
          >
            {deleteOpen ? 'Cancel' : 'Delete account'}
          </button>
        </div>

        {deleteOpen && (
          <form onSubmit={handleDeleteAccount} className="space-y-2.5 pt-2 border-t border-[var(--line)]">
            <p className="text-[12px] text-[var(--text-2)]">
              Type <strong className="text-[var(--text)]">DELETE</strong> below to confirm permanent account deletion. This cannot be undone.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--danger)]"
            />
            {deleteError && (
              <div className="text-[12px] text-[var(--danger)]">{deleteError}</div>
            )}
            <button
              type="submit"
              disabled={deleting}
              className="w-full min-h-[44px] rounded-[12px] bg-[var(--danger)] text-white font-semibold text-[13px] flex items-center justify-center gap-2 disabled:opacity-50 touch-press"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>{deleting ? 'Deleting account...' : 'Permanently delete account'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
