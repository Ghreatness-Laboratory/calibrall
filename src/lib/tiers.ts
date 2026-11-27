// CALIBRALL: Canonical Subscription Tier Rules & Entitlements
// Single source of truth consumed by tierAccess.ts, /pricing, and the Admin Tier Configuration viewer.

export type AccountTierId = 'free' | 'pro' | 'premium';

export const FREE_DAILY_SUMMARY_LIMIT = 3;

export interface TierRuleConfig {
  id: AccountTierId;
  name: string;
  badge: string;
  monthlyPriceUsd: number;
  monthlyPriceNgn: number;
  billingLabel: string;
  dailySummaryLimit: number | null; // null = unlimited
  fullExplanationsEnabled: boolean;
  alternatePicksVisible: number;
  modelDriversVisible: boolean;
  allSportsAccess: boolean;
  allMarketsAccess: boolean;
  scorelineMatrixAccess: boolean;
  apiWorkflowAccess: boolean;
  summary: string;
  features: string[];
  limitations: string[];
}

export const TIER_ORDER: AccountTierId[] = ['free', 'pro', 'premium'];

export const TIER_RULES: Record<AccountTierId, TierRuleConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    badge: 'Standard',
    monthlyPriceUsd: 0,
    monthlyPriceNgn: 0,
    billingLabel: 'Free forever',
    dailySummaryLimit: FREE_DAILY_SUMMARY_LIMIT,
    fullExplanationsEnabled: false,
    alternatePicksVisible: 0,
    modelDriversVisible: false,
    allSportsAccess: true,
    allMarketsAccess: true,
    scorelineMatrixAccess: false,
    apiWorkflowAccess: false,
    summary:
      'Fixtures, calibrated probabilities, public track record, and 3 match summaries per day.',
    features: [
      'Daily fixture probabilities & Record ledger',
      '3 full match summary lines per day',
      'Football & basketball coverage',
    ],
    limitations: [
      'Full written explanation locked behind upgrade',
      'Model drivers & 2 alternate picks hidden',
      'Poisson scoreline matrix restricted',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    badge: 'Extended',
    monthlyPriceUsd: 19,
    monthlyPriceNgn: 29000,
    billingLabel: '$19 per month',
    dailySummaryLimit: null,
    fullExplanationsEnabled: true,
    alternatePicksVisible: 2,
    modelDriversVisible: true,
    allSportsAccess: true,
    allMarketsAccess: true,
    scorelineMatrixAccess: true,
    apiWorkflowAccess: false,
    summary:
      'Unlimited match explanations, multi market comparisons, corners, and disciplinary factors.',
    features: [
      'Unlimited daily match explanations',
      'All football & basketball markets',
      'Model drivers & 2 alternate picks delivered by API',
      'Referee & situational context factors',
    ],
    limitations: ['Priority research & calibration export workflows reserved for Premium'],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    badge: 'Full research',
    monthlyPriceUsd: 49,
    monthlyPriceNgn: 75000,
    billingLabel: '$49 per month',
    dailySummaryLimit: null,
    fullExplanationsEnabled: true,
    alternatePicksVisible: 2,
    modelDriversVisible: true,
    allSportsAccess: true,
    allMarketsAccess: true,
    scorelineMatrixAccess: true,
    apiWorkflowAccess: true,
    summary:
      'Complete access to every statistical breakdown, calibration curve, and API workflow.',
    features: [
      'Everything in Pro access',
      'Full Poisson matrix & alternates',
      'Priority calibration audit access',
      'Full league & market research coverage',
    ],
    limitations: [],
  },
};

export const ADMIN_OVERRIDE_RULE = {
  role: 'admin' as const,
  effectiveTier: 'premium' as AccountTierId,
  neverExpires: true,
  allSportsAccess: true,
  allMarketsAccess: true,
  allLeaguesAccess: true,
  description:
    'Admin accounts permanently receive Premium access across every page, market, league, and sport with no expiry.',
};
