// CALIBRALL: Canonical Subscription Tier Rules & Entitlements
// Single source of truth consumed by tierAccess.ts, /pricing, and the Admin Tier Configuration viewer.

export type AccountTierId = 'free' | 'pro' | 'premium';

export const TRIAL_DAYS = 7;
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
    name: 'Free Trial',
    badge: `${TRIAL_DAYS}-Day Trial`,
    monthlyPriceUsd: 0,
    monthlyPriceNgn: 0,
    billingLabel: `${TRIAL_DAYS}-day free trial`,
    dailySummaryLimit: FREE_DAILY_SUMMARY_LIMIT,
    fullExplanationsEnabled: false,
    alternatePicksVisible: 0,
    modelDriversVisible: false,
    allSportsAccess: true,
    allMarketsAccess: true,
    scorelineMatrixAccess: false,
    apiWorkflowAccess: false,
    summary:
      `Active for ${TRIAL_DAYS} days after email confirmation: fixtures, calibrated probabilities, public track record, and 3 match summaries per day.`,
    features: [
      `${TRIAL_DAYS}-day trial access upon email confirmation`,
      'Daily fixture probabilities & Record ledger',
      '3 full match summary lines per day',
      'Football & basketball coverage',
    ],
    limitations: [
      'Requires Pro or Premium after 7 days',
      'Full written explanation locked behind paid plan',
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

export function getDisplayBillingLabel(tierId: AccountTierId): string {
  if (tierId === 'pro') {
    return process.env.NEXT_PUBLIC_PRO_PRICE_LABEL?.trim() || TIER_RULES.pro.billingLabel;
  }
  if (tierId === 'premium') {
    return process.env.NEXT_PUBLIC_PREMIUM_PRICE_LABEL?.trim() || TIER_RULES.premium.billingLabel;
  }
  return TIER_RULES.free.billingLabel;
}

export type TrialBannerTone = 'normal' | 'amber' | 'red';

export interface TrialBannerState {
  visible: boolean;
  tone: TrialBannerTone;
  daysLeft: number;
  label: string;
  isReminderDay: boolean;
  reminderStage: 'day5' | 'day7' | null;
}

export function getTrialBannerState(input: {
  entitlementStatus?: 'admin' | 'paid' | 'trial' | 'expired';
  trialDaysRemaining?: number;
  isAdmin?: boolean;
}): TrialBannerState {
  if (input.isAdmin || input.entitlementStatus === 'admin' || input.entitlementStatus === 'paid') {
    return {
      visible: false,
      tone: 'normal',
      daysLeft: 0,
      label: '',
      isReminderDay: false,
      reminderStage: null,
    };
  }

  if (input.entitlementStatus === 'expired') {
    return {
      visible: true,
      tone: 'red',
      daysLeft: 0,
      label: 'Free trial ended. Choose a plan to continue',
      isReminderDay: true,
      reminderStage: 'day7',
    };
  }

  if (input.entitlementStatus === 'trial') {
    const daysLeft = Math.max(1, Math.min(TRIAL_DAYS, Number(input.trialDaysRemaining) || 1));
    const tone: TrialBannerTone = daysLeft <= 1 ? 'red' : daysLeft <= 2 ? 'amber' : 'normal';
    const dayWord = daysLeft === 1 ? 'day' : 'days';
    return {
      visible: true,
      tone,
      daysLeft,
      label: `Free trial: ${daysLeft} ${dayWord} left`,
      isReminderDay: daysLeft <= 2,
      reminderStage: daysLeft <= 1 ? 'day7' : daysLeft <= 2 ? 'day5' : null,
    };
  }

  return {
    visible: false,
    tone: 'normal',
    daysLeft: 0,
    label: '',
    isReminderDay: false,
    reminderStage: null,
  };
}

