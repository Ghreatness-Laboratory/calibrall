'use client';

import { UserPreferences } from '@/types';

const PREFS_KEY = 'calibrall_user_prefs_v1';
const LEGACY_PREFS_KEY = 'matchmind_demo_prefs';
const SAVED_KEY = 'calibrall_saved_watchlist_v1';
const LEGACY_SAVED_KEY = 'matchmind_demo_saved_fixtures';
const LEGACY_DEMO_USER_KEY = 'matchmind_demo_user';
const SAVED_FIXTURES_CACHE_PREFIX = 'calibrall_saved_fixtures_v1:';

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  timezone: 'UTC',
  preferredCompetitions: ['BSA', 'PL', 'PD', 'SA', 'BL1', 'FL1'],
  favoriteTeams: [],
  preferredMarkets: ['total_goals', 'multi_goals', 'btts', 'total_corners', 'match_result'],
  preferredOptionTypes: [
    'win',
    'draw',
    'double_chance',
    'over_under_goals',
    'multi_goals',
    'both_teams_to_score',
    'corners',
    'bookings',
    'highest_scoring_half',
    'first_half_goals',
    'second_half_result',
  ],
  minProbabilityThreshold: 0.58,
  minEdgeThreshold: 0.035,
  emailNotificationsEnabled: false,
};

export function getStoredPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_USER_PREFERENCES;
  try {
    const raw = localStorage.getItem(PREFS_KEY) || localStorage.getItem(LEGACY_PREFS_KEY);
    return raw ? { ...DEFAULT_USER_PREFERENCES, ...JSON.parse(raw) } : DEFAULT_USER_PREFERENCES;
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

export function setStoredPreferences(prefs: UserPreferences) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to store preferences', e);
  }
}

export function getStoredSavedFixtures(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearStoredSavedFixtures(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify([]));
    localStorage.removeItem(LEGACY_SAVED_KEY);
  } catch {}
}

export function toggleStoredSavedFixture(fixtureId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const existing = getStoredSavedFixtures();
    let updated: string[];
    let isSaved = false;
    if (existing.includes(fixtureId)) {
      updated = existing.filter((id) => id !== fixtureId);
      isSaved = false;
    } else {
      updated = [...existing, fixtureId];
      isSaved = true;
    }
    localStorage.setItem(SAVED_KEY, JSON.stringify(updated));
    return isSaved;
  } catch (e) {
    console.error('Failed to toggle saved fixture', e);
    return false;
  }
}

/**
 * Purges all cached user data on logout or account deletion:
 * - localStorage & sessionStorage entries (saved fixtures, cached slates, legacy demo keys, preferences)
 * - Cache Storage entries (all service worker caches)
 * - Notifies active Service Worker to clear data/static caches
 * - Expires any residual tier cookie
 */
export async function clearAllClientUserCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith(SAVED_FIXTURES_CACHE_PREFIX) ||
        key.startsWith('calibrall_') ||
        key.startsWith('matchmind_') ||
        key.startsWith('sb-')
      ) {
        // Keep purely visual monochrome toggle preference? User requested clearing all cached data so users never see each other's data.
        if (key !== 'calibrall_monochrome_mode') {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.push(LEGACY_DEMO_USER_KEY, LEGACY_PREFS_KEY, LEGACY_SAVED_KEY, PREFS_KEY, SAVED_KEY);
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }
  } catch {}

  try {
    window.sessionStorage.clear();
  } catch {}

  try {
    document.cookie = 'calibrall_tier=; path=/; max-age=0; samesite=lax';
  } catch {}

  try {
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
    }
  } catch {}

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.active) {
        reg.active.postMessage({ type: 'CLEAR_USER_CACHES' });
      }
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_USER_CACHES' });
      }
    }
  } catch {}
}
