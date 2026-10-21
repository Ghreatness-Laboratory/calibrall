// MATCHMIND: Supabase Client Integration & Local Development Adapter
import { createClient } from '@supabase/supabase-js';
import { UserProfile, UserPreferences } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('your-project-id')
);

// Real client when credentials exist
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Local persistent state keys for demonstration mode
const DEMO_USER_KEY = 'matchmind_demo_user';
const DEMO_PREFS_KEY = 'matchmind_demo_prefs';
const DEMO_SAVED_KEY = 'matchmind_demo_saved_fixtures';

export const DEFAULT_DEMO_USER: UserProfile = {
  id: 'usr_demo_7890',
  email: 'analyst@calibrall.app',
  fullName: 'Marcus Vance (Senior Quant)',
  role: 'admin',
  subscriptionTier: 'pro',
  subscriptionStatus: 'active',
  createdAt: '2025-01-10T10:00:00Z',
};

export const DEFAULT_DEMO_PREFERENCES: UserPreferences = {
  timezone: 'UTC',
  preferredCompetitions: ['PL', 'CL', 'PD', 'BL1', 'SA'],
  favoriteTeams: ['team_mancity', 'team_arsenal', 'team_realmadrid'],
  preferredMarkets: ['total_goals', 'btts', 'total_corners', 'match_result'],
  preferredOptionTypes: [
    'win',
    'draw',
    'double_chance',
    'over_under_goals',
    'both_teams_to_score',
    'corners',
    'bookings',
    'highest_scoring_half',
    'first_half_goals',
    'second_half_result'
  ],
  minProbabilityThreshold: 0.58,
  minEdgeThreshold: 0.035,
  emailNotificationsEnabled: true,
};

// Client-side authentication helpers with demo state synchronization
export function getStoredUser(): UserProfile {
  if (typeof window === 'undefined') return DEFAULT_DEMO_USER;
  try {
    const raw = localStorage.getItem(DEMO_USER_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_DEMO_USER;
  } catch {
    return DEFAULT_DEMO_USER;
  }
}

export function setStoredUser(user: UserProfile) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to store user profile', e);
  }
}

export function getStoredPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_DEMO_PREFERENCES;
  try {
    const raw = localStorage.getItem(DEMO_PREFS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_DEMO_PREFERENCES;
  } catch {
    return DEFAULT_DEMO_PREFERENCES;
  }
}

export function setStoredPreferences(prefs: UserPreferences) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEMO_PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to store preferences', e);
  }
}

export function getStoredSavedFixtures(): string[] {
  if (typeof window === 'undefined') return ['fix_ars_liv', 'fix_bar_rma'];
  try {
    const raw = localStorage.getItem(DEMO_SAVED_KEY);
    return raw ? JSON.parse(raw) : ['fix_ars_liv', 'fix_bar_rma'];
  } catch {
    return ['fix_ars_liv', 'fix_bar_rma'];
  }
}

export function toggleStoredSavedFixture(fixtureId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const existing = getStoredSavedFixtures();
    let updated: string[];
    let isSaved = false;
    if (existing.includes(fixtureId)) {
      updated = existing.filter(id => id !== fixtureId);
      isSaved = false;
    } else {
      updated = [...existing, fixtureId];
      isSaved = true;
    }
    localStorage.setItem(DEMO_SAVED_KEY, JSON.stringify(updated));
    return isSaved;
  } catch (e) {
    console.error('Failed to toggle saved fixture', e);
    return false;
  }
}
