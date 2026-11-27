// CALIBRALL: Canonical Subscription Tier Rules & Entitlements
// Single source of truth consumed by tierAccess.ts, /pricing, and the Admin Tier Configuration viewer.

export type AccountTierId = 'free' | 'pro' | 'premium';

export const TRIAL_DAYS = 7;
export const PLAN_PERIOD_DAYS = 30;
export const MS_PER_DAY = 86_400_000;
export const FREE_DAILY_SUMMARY_LIMIT = 3;

export type SlipBuildStyle = 'safest' | 'balanced';

export interface SlipBuilderTierPolicy {
  tier: AccountTierId;
  isAdmin: boolean;
  dailyBuildLimit: number | null; // null = unlimited
  minTargetOdds: number;
  maxTargetOdds: number;
  minLegs: number;
  maxLegs: number;
  allowedStyles: SlipBuildStyle[];
  balancedStyleAllowed: boolean;
  bestPriceComparison: boolean;
}

export const SLIP_BUILDER_GLOBAL_BOUNDS = {
  minTargetOdds: 1.5,
  maxTargetOdds: 10.0,
  minLegs: 2,
  maxLegs: 6,
  defaultMaxLegs: 4,
  targetToleranceRatio: 0.08,
  maxSameLeagueLegs: 2,
  maxPriceAgeMinutes: 180,
} as const;

export interface TierRuleConfig {
  id: AccountTierId;
  name: string;
  badge: string;
  monthlyPriceNgn: number;
  amountKobo: number;
  periodDays: number;
  billingLabel: string;
  dailySummaryLimit: number | null; // null = unlimited
  fullExplanationsEnabled: boolean;
  alternatePicksVisible: number;
  modelDriversVisible: boolean;
  allSportsAccess: boolean;
  allMarketsAccess: boolean;
  scorelineMatrixAccess: boolean;
  apiWorkflowAccess: boolean;
  slipBuilderDailyLimit: number | null; // null = unlimited
  slipBuilderMaxTargetOdds: number;
  slipBuilderAllowedStyles: SlipBuildStyle[];
  slipBuilderBestPriceComparison: boolean;
  summary: string;
  features: string[];
  limitations: string[];
}

export const TIER_ORDER: AccountTierId[] = ['free', 'pro', 'premium'];

export function formatNaira(amountNgn: number): string {
  const safe = Math.max(0, Math.round(Number(amountNgn) || 0));
  return `₦${safe.toLocaleString('en-US')}`;
}

export const TIER_RULES: Record<AccountTierId, TierRuleConfig> = {
  free: {
    id: 'free',
    name: 'Free Trial',
    badge: `${TRIAL_DAYS}-Day Trial`,
    monthlyPriceNgn: 0,
    amountKobo: 0,
    periodDays: TRIAL_DAYS,
    billingLabel: `${TRIAL_DAYS}-day free trial`,
    dailySummaryLimit: FREE_DAILY_SUMMARY_LIMIT,
    fullExplanationsEnabled: false,
    alternatePicksVisible: 0,
    modelDriversVisible: false,
    allSportsAccess: true,
    allMarketsAccess: true,
    scorelineMatrixAccess: false,
    apiWorkflowAccess: false,
    slipBuilderDailyLimit: 1,
    slipBuilderMaxTargetOdds: 3.0,
    slipBuilderAllowedStyles: ['safest'],
    slipBuilderBestPriceComparison: false,
    summary:
      `Active for ${TRIAL_DAYS} days after email confirmation: fixtures, calibrated probabilities, public track record, 3 match summaries per day, and 1 slip build per day up to 3.0 odds.`,
    features: [
      `${TRIAL_DAYS}-day trial access upon email confirmation`,
      'Daily fixture probabilities & Record ledger',
      '3 full match summary lines per day',
      '1 Slip Builder run per day (Safest style, up to 3.0 odds)',
      'Football & basketball coverage',
    ],
    limitations: [
      'Requires Pro or Premium after 7 days',
      'Slip Builder capped at 1 build/day, 3.0 target odds, and Safest style',
      'Full written explanation locked behind paid plan',
      'Model drivers & 2 alternate picks hidden',
      'Poisson scoreline matrix restricted',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    badge: 'Extended',
    monthlyPriceNgn: 500,
    amountKobo: 50000,
    periodDays: PLAN_PERIOD_DAYS,
    billingLabel: `${formatNaira(500)}/month`,
    dailySummaryLimit: null,
    fullExplanationsEnabled: true,
    alternatePicksVisible: 2,
    modelDriversVisible: true,
    allSportsAccess: true,
    allMarketsAccess: true,
    scorelineMatrixAccess: true,
    apiWorkflowAccess: false,
    slipBuilderDailyLimit: 5,
    slipBuilderMaxTargetOdds: 10.0,
    slipBuilderAllowedStyles: ['safest'],
    slipBuilderBestPriceComparison: false,
    summary:
      'Unlimited match explanations, multi market comparisons, corners, disciplinary factors, and 5 Slip Builder runs per day.',
    features: [
      'Unlimited daily match explanations',
      '5 Slip Builder runs per day (Safest style, targets up to 10.0)',
      'All football & basketball markets',
      'Multi goals ranges (full match, team and 1st half)',
      'Model drivers & 2 alternate picks delivered by API',
      'Referee & situational context factors',
    ],
    limitations: [
      'Balanced slip style, unlimited slip builds & bookmaker best price comparison reserved for Premium',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    badge: 'Full research',
    monthlyPriceNgn: 2500,
    amountKobo: 250000,
    periodDays: PLAN_PERIOD_DAYS,
    billingLabel: `${formatNaira(2500)}/month`,
    dailySummaryLimit: null,
    fullExplanationsEnabled: true,
    alternatePicksVisible: 2,
    modelDriversVisible: true,
    allSportsAccess: true,
    allMarketsAccess: true,
    scorelineMatrixAccess: true,
    apiWorkflowAccess: true,
    slipBuilderDailyLimit: null,
    slipBuilderMaxTargetOdds: 10.0,
    slipBuilderAllowedStyles: ['safest', 'balanced'],
    slipBuilderBestPriceComparison: true,
    summary:
      'Complete access to every statistical breakdown, calibration curve, unlimited Slip Builder with Balanced style & bookmaker price comparison, and API workflow.',
    features: [
      'Everything in Pro access',
      'Unlimited Slip Builder runs (Safest & Balanced styles, targets up to 10.0)',
      'Best price comparison across stored bookmakers',
      'Full Poisson matrix & alternates',
      'Priority calibration audit access',
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
  slipBuilderDailyLimit: null as number | null,
  slipBuilderMaxTargetOdds: 10.0,
  slipBuilderAllowedStyles: ['safest', 'balanced'] as SlipBuildStyle[],
  slipBuilderBestPriceComparison: true,
  description:
    'Admin accounts permanently receive Premium access across every page, market, league, and sport with no expiry.',
};

export function getSlipBuilderTierPolicy(
  tier: AccountTierId | string | undefined,
  isAdmin: boolean = false
): SlipBuilderTierPolicy {
  const effectiveTier: AccountTierId = isAdmin
    ? ADMIN_OVERRIDE_RULE.effectiveTier
    : tier === 'premium' || tier === 'pro'
    ? tier
    : 'free';
  const cfg = TIER_RULES[effectiveTier];
  const allowedStyles = isAdmin
    ? [...ADMIN_OVERRIDE_RULE.slipBuilderAllowedStyles]
    : [...cfg.slipBuilderAllowedStyles];

  return {
    tier: effectiveTier,
    isAdmin,
    dailyBuildLimit: isAdmin ? ADMIN_OVERRIDE_RULE.slipBuilderDailyLimit : cfg.slipBuilderDailyLimit,
    minTargetOdds: SLIP_BUILDER_GLOBAL_BOUNDS.minTargetOdds,
    maxTargetOdds: isAdmin ? ADMIN_OVERRIDE_RULE.slipBuilderMaxTargetOdds : cfg.slipBuilderMaxTargetOdds,
    minLegs: SLIP_BUILDER_GLOBAL_BOUNDS.minLegs,
    maxLegs: SLIP_BUILDER_GLOBAL_BOUNDS.maxLegs,
    allowedStyles,
    balancedStyleAllowed: allowedStyles.includes('balanced'),
    bestPriceComparison: isAdmin
      ? ADMIN_OVERRIDE_RULE.slipBuilderBestPriceComparison
      : cfg.slipBuilderBestPriceComparison,
  };
}

export function formatMonthlyPrice(tierId: AccountTierId): string {
  if (tierId === 'free') return TIER_RULES.free.billingLabel;
  return `${formatNaira(TIER_RULES[tierId].monthlyPriceNgn)}/month`;
}

export function getDisplayBillingLabel(tierId: AccountTierId): string {
  return formatMonthlyPrice(tierId);
}

export interface ProToPremiumUpgradeQuote {
  remainingDays: number;
  remainingWholeDays: number;
  basePriceNgn: number;
  creditNgn: number;
  chargeNgn: number;
  chargeKobo: number;
  newExpiryIso: string;
}

/**
 * Computes prorated upgrade charge from active Pro to Premium:
 * charge = max(0, 2500 - (remaining_days / 30) * 500) rounded to nearest Naira.
 * New expiry = now + 30 days.
 */
export function calculateProToPremiumUpgradeQuote(params: {
  tierExpiresAt: string | null | undefined;
  nowMs?: number;
}): ProToPremiumUpgradeQuote {
  const nowMs = params.nowMs ?? Date.now();
  const proPriceNgn = TIER_RULES.pro.monthlyPriceNgn;
  const premiumPriceNgn = TIER_RULES.premium.monthlyPriceNgn;

  let remainingDays = 0;
  if (params.tierExpiresAt) {
    const expMs = Date.parse(params.tierExpiresAt);
    if (Number.isFinite(expMs) && expMs > nowMs) {
      const clampedMs = Math.min(PLAN_PERIOD_DAYS * MS_PER_DAY, Math.max(0, expMs - nowMs));
      remainingDays = clampedMs / MS_PER_DAY;
    }
  }

  const rawCharge = Math.max(0, premiumPriceNgn - (remainingDays / PLAN_PERIOD_DAYS) * proPriceNgn);
  const chargeNgn = Math.round(rawCharge);
  const creditNgn = Math.max(0, premiumPriceNgn - chargeNgn);
  const chargeKobo = chargeNgn * 100;
  const newExpiryIso = new Date(nowMs + PLAN_PERIOD_DAYS * MS_PER_DAY).toISOString();

  return {
    remainingDays,
    remainingWholeDays: Math.ceil(remainingDays),
    basePriceNgn: premiumPriceNgn,
    creditNgn,
    chargeNgn,
    chargeKobo,
    newExpiryIso,
  };
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

export interface PaidRenewalBannerState {
  daysLeft: number;
  showRenewButton: boolean;
  showRenewalBanner: boolean;
  tone: TrialBannerTone;
  label: string;
}

export function getPaidRenewalBannerState(input: {
  entitlementStatus?: 'admin' | 'paid' | 'trial' | 'expired';
  tier?: AccountTierId;
  tierExpiresAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  isAdmin?: boolean;
  nowMs?: number;
}): PaidRenewalBannerState {
  if (
    input.isAdmin ||
    input.entitlementStatus !== 'paid' ||
    !input.tierExpiresAt ||
    input.cancelAtPeriodEnd
  ) {
    return {
      daysLeft: 0,
      showRenewButton: false,
      showRenewalBanner: false,
      tone: 'normal',
      label: '',
    };
  }

  const nowMs = input.nowMs ?? Date.now();
  const expMs = Date.parse(input.tierExpiresAt);
  if (!Number.isFinite(expMs) || expMs <= nowMs) {
    return {
      daysLeft: 0,
      showRenewButton: false,
      showRenewalBanner: false,
      tone: 'normal',
      label: '',
    };
  }

  const daysLeft = Math.max(1, Math.ceil((expMs - nowMs) / MS_PER_DAY));
  const showRenewButton = daysLeft <= 5;
  const showRenewalBanner = daysLeft <= 3;
  const planName = input.tier === 'premium' ? TIER_RULES.premium.name : TIER_RULES.pro.name;
  const dayWord = daysLeft === 1 ? 'day' : 'days';

  return {
    daysLeft,
    showRenewButton,
    showRenewalBanner,
    tone: daysLeft <= 1 ? 'red' : 'amber',
    label: `${planName} plan ends in ${daysLeft} ${dayWord}. Renew now to keep access`,
  };
}

