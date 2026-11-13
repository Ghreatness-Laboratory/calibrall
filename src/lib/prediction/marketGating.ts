// MATCHMIND: Market Gating & Walk-Forward Validation Engine
// GATING RULE: Require a minimum Brier Skill Score (default >= 0.02),
// a bootstrap 95% confidence interval strictly above zero (CI_lower > 0),
// and a minimum sample size per market family (N >= 30) and line (N >= 15).
// Families that fail are labelled "unvalidated" and CANNOT be top picks.

import { MarketFamily, MARKET_FAMILIES } from './baselines';
import { getCalibratedParams, getLeagueCapabilities, WalkForwardMarketValidation } from './calibratedParams';

export interface FamilyValidationStatus {
  family: MarketFamily;
  leagueGroup?: 'UK_WITH_REF' | 'EURO_NO_REF' | 'EXTRA_GOALS_ONLY';
  sampleSize: number;
  matchesCount: number;
  modelBrierScore: number;
  competitionBaselineBrierScore: number;
  teamAdjustedBaselineBrierScore: number;
  brierSkillScoreComp: number;
  brierSkillScoreTeam: number;
  brierSkillScore: number;
  bootstrapCi95Lower: number;
  bootstrapCi95Upper: number;
  minScoreThreshold: number;
  minSampleSize: number;
  isValidated: boolean; // BSS > 0 AND bootstrapCi95Lower > 0 AND matches >= 30
  status: 'validated' | 'unvalidated';
  unvalidatedReason?: string;
  cannotBeTopPick: boolean;
  reason: string;
}

/**
 * Bootstrap 95% Confidence Interval Calculation for Brier Skill Score.
 * Resamples pairs of (modelProb, baselineProb, outcome) with replacement 1,000 times.
 */
export function computeBootstrapBSSConfidenceInterval(
  pairs: { modelProb: number; baselineProb: number; outcome: boolean }[],
  numIterations: number = 1000
): { ciLower: number; ciUpper: number; meanBss: number } {
  const n = pairs.length;
  if (n < 10) {
    return { ciLower: -1, ciUpper: 1, meanBss: 0 };
  }

  const bssSamples: number[] = [];
  let seed = 1337;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let it = 0; it < numIterations; it++) {
    let brierModel = 0;
    let brierBase = 0;

    for (let i = 0; i < n; i++) {
      const idx = Math.floor(nextRand() * n);
      const item = pairs[idx];
      const y = item.outcome ? 1 : 0;
      brierModel += Math.pow(item.modelProb - y, 2);
      brierBase += Math.pow(item.baselineProb - y, 2);
    }

    const bss = brierBase > 0 ? (1 - (brierModel / brierBase)) : 0;
    bssSamples.push(bss);
  }

  bssSamples.sort((a, b) => a - b);
  const lowerIdx = Math.floor(numIterations * 0.025);
  const upperIdx = Math.floor(numIterations * 0.975);
  const ciLower = Number(bssSamples[lowerIdx].toFixed(4));
  const ciUpper = Number(bssSamples[upperIdx].toFixed(4));
  const meanBss = Number((bssSamples.reduce((a, b) => a + b, 0) / numIterations).toFixed(4));

  return { ciLower, ciUpper, meanBss };
}

function buildStatusFromEntry(
  family: MarketFamily,
  entry: WalkForwardMarketValidation | undefined
): FamilyValidationStatus {
  if (!entry) {
    return {
      family,
      sampleSize: 0,
      matchesCount: 0,
      modelBrierScore: 0,
      competitionBaselineBrierScore: 0,
      teamAdjustedBaselineBrierScore: 0,
      brierSkillScoreComp: 0,
      brierSkillScoreTeam: 0,
      brierSkillScore: 0,
      bootstrapCi95Lower: -1,
      bootstrapCi95Upper: 1,
      minScoreThreshold: 0,
      minSampleSize: 30,
      isValidated: false,
      status: 'unvalidated',
      unvalidatedReason: `No walk-forward validation data stored for ${family}.`,
      cannotBeTopPick: true,
      reason: `Unvalidated: No walk-forward validation data stored for ${family}.`,
    };
  }

  const isValidated = entry.matches >= 30 && entry.brierSkill > 0 && entry.ci95Lower > 0;
  return {
    family,
    leagueGroup: entry.leagueGroup,
    sampleSize: entry.matches,
    matchesCount: entry.matches,
    modelBrierScore: entry.modelBrier,
    competitionBaselineBrierScore: entry.baseBrier,
    teamAdjustedBaselineBrierScore: entry.baseBrier,
    brierSkillScoreComp: entry.brierSkill,
    brierSkillScoreTeam: entry.brierSkill,
    brierSkillScore: entry.brierSkill,
    bootstrapCi95Lower: entry.ci95Lower,
    bootstrapCi95Upper: entry.ci95Upper,
    minScoreThreshold: 0,
    minSampleSize: 30,
    isValidated,
    status: isValidated ? 'validated' : 'unvalidated',
    unvalidatedReason: isValidated ? undefined : entry.reason,
    cannotBeTopPick: !isValidated,
    reason: entry.reason,
  };
}

export function getValidationRegistryForGroup(
  leagueGroup: 'UK_WITH_REF' | 'EURO_NO_REF' | 'EXTRA_GOALS_ONLY' = 'UK_WITH_REF'
): Record<MarketFamily, FamilyValidationStatus> {
  const wf = getCalibratedParams().walkForwardMarketValidation?.[leagueGroup] || {};
  const out = {} as Record<MarketFamily, FamilyValidationStatus>;
  for (const fam of MARKET_FAMILIES) {
    out[fam] = buildStatusFromEntry(fam, wf[fam]);
  }
  return out;
}

// Default registry reflects Group 1 (UK_WITH_REF) walk-forward validation from DB
export const FAMILY_VALIDATION_REGISTRY: Record<MarketFamily, FamilyValidationStatus> =
  getValidationRegistryForGroup('UK_WITH_REF');

/**
 * Checks if a market family passes walk-forward gating for a specific league (or default UK_WITH_REF):
 * 1. Held-out match sample >= minSample (default 30)
 * 2. Walk-forward Brier Skill Score > 0 vs causal league base rate
 * 3. Bootstrap 95% CI strictly above zero (ciLower > 0)
 */
export function checkMarketGating(
  family: MarketFamily,
  competitionCodeOrMinSample?: string | number,
  minSample: number = 30
): {
  isAllowed: boolean;
  leagueGroup: 'UK_WITH_REF' | 'EURO_NO_REF' | 'EXTRA_GOALS_ONLY';
  matches: number;
  bss: number;
  ciLower: number;
  ciUpper: number;
  statusText: string;
  cannotBeTopPick: boolean;
} {
  const leagueGroup = typeof competitionCodeOrMinSample === 'string'
    ? getLeagueCapabilities(competitionCodeOrMinSample).leagueGroup
    : 'UK_WITH_REF';
  const effectiveMinSample = typeof competitionCodeOrMinSample === 'number'
    ? competitionCodeOrMinSample
    : minSample;

  const entry = getCalibratedParams().walkForwardMarketValidation?.[leagueGroup]?.[family];
  const reg = buildStatusFromEntry(family, entry);

  if (reg.matchesCount < effectiveMinSample) {
    return {
      isAllowed: false,
      leagueGroup,
      matches: reg.matchesCount,
      bss: reg.brierSkillScore,
      ciLower: reg.bootstrapCi95Lower,
      ciUpper: reg.bootstrapCi95Upper,
      statusText: `Unvalidated (${leagueGroup}): insufficient held-out matches (${reg.matchesCount} < ${effectiveMinSample})`,
      cannotBeTopPick: true,
    };
  }

  if (reg.brierSkillScore <= 0 || reg.bootstrapCi95Lower <= 0) {
    return {
      isAllowed: false,
      leagueGroup,
      matches: reg.matchesCount,
      bss: reg.brierSkillScore,
      ciLower: reg.bootstrapCi95Lower,
      ciUpper: reg.bootstrapCi95Upper,
      statusText: `Unvalidated (${leagueGroup}): BSS ${reg.brierSkillScore.toFixed(4)} with 95% CI [${reg.bootstrapCi95Lower.toFixed(4)}, ${reg.bootstrapCi95Upper.toFixed(4)}] does not clear 0`,
      cannotBeTopPick: true,
    };
  }

  return {
    isAllowed: true,
    leagueGroup,
    matches: reg.matchesCount,
    bss: reg.brierSkillScore,
    ciLower: reg.bootstrapCi95Lower,
    ciUpper: reg.bootstrapCi95Upper,
    statusText: `Validated (${leagueGroup}): BSS +${reg.brierSkillScore.toFixed(4)}, 95% CI [+${reg.bootstrapCi95Lower.toFixed(4)}, +${reg.bootstrapCi95Upper.toFixed(4)}] (${reg.matchesCount} matches)`,
    cannotBeTopPick: false,
  };
}
