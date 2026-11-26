import calibratedParamsJson from './calibratedParams.json';
import { LeagueColumnCapabilities } from '@/types';

export interface CalibratedGoalsConfig {
  sampleSize: number;
  avgHomeGoals: number;
  avgAwayGoals: number;
  avgGoals: number;
  homeAdvantageRatio: number;
  dixonColesRho: number;
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  o15Rate: number;
  o25Rate: number;
  o35Rate: number;
  bttsRate: number;
}

export interface CalibratedHalvesConfig {
  sampleSize: number;
  avgHome1HGoals: number;
  avgAway1HGoals: number;
  avgHome2HGoals: number;
  avgAway2HGoals: number;
  firstHalfGoalShare: number;
  fhO05Rate: number;
  fhU15Rate: number;
  hsh1stRate: number;
  hsh2ndRate: number;
  hshEqualRate: number;
  shHomeWinRate: number;
  shDrawRate: number;
  shAwayWinRate: number;
}

export interface CalibratedCornersConfig {
  sampleSize: number;
  avgHomeCorners: number;
  avgAwayCorners: number;
  avgTotalCorners: number;
  varTotalCorners: number;
  overdispersionAlpha: number;
  o85Rate: number;
  o95Rate: number;
  o105Rate: number;
  o115Rate: number;
}

export interface CalibratedCardsConfig {
  sampleSize: number;
  avgTotalCards: number;
  varTotalCards: number;
  overdispersionAlpha: number;
  o35Rate: number;
  o45Rate: number;
  o55Rate: number;
}

export interface CalibratedLeagueConfig {
  competitionCode: string;
  leagueGroup: 'UK_WITH_REF' | 'EURO_NO_REF' | 'EXTRA_GOALS_ONLY';
  capabilities: LeagueColumnCapabilities;
  goals: CalibratedGoalsConfig;
  halves: CalibratedHalvesConfig | null;
  corners: CalibratedCornersConfig | null;
  cards: CalibratedCardsConfig | null;
}

export interface WalkForwardMarketValidation {
  leagueGroup: 'UK_WITH_REF' | 'EURO_NO_REF' | 'EXTRA_GOALS_ONLY';
  market: string;
  matches: number;
  samples: number;
  modelBrier: number;
  baseBrier: number;
  brierSkill: number;
  ci95Lower: number;
  ci95Upper: number;
  allowed: boolean;
  reason: string;
}

export interface CalibratedParamsData {
  generatedAt: string;
  totalFinishedMatches: number;
  totalRivalriesSeeded: number;
  aliasToCanonical: Record<string, string>;
  groupSampleSizes: Record<string, {
    leagues: string[];
    goalsMatches: number;
    asianHandicapModelMatches: number;
    asianHandicapOddsMatches: number;
    halfTimeMatches: number;
    cornersMatches: number;
    cardsMatches: number;
    refereeMatches: number;
  }>;
  h2hAblation: {
    enabled: boolean;
    selectedWeight: number;
    baseCombinedBrier: number;
    selectedCombinedBrier: number;
    deltaBrier: number;
    heldOutMatchesTested: number;
  };
  halvesValidation: {
    optimalHalfShrinkageK: number;
    heldOutMatchesTested: number;
  };
  cornersValidation: {
    heldOutMatchesTested: number;
    negBinomialO95Brier: number;
    poissonO95Brier: number;
    leagueBaselineO95Brier: number;
    negBinomialO95LogLoss: number;
    poissonO95LogLoss: number;
  };
  cardsAndRefereeValidation: {
    optimalRefShrinkageK: number;
    noRefereeHeldOutMatches: number;
    noRefereeNegBinomialBrier: number;
    noRefereePoissonBrier: number;
  };
  derbySignificance: {
    rivalriesTableCount: number;
    applyCardsAdjustment: boolean;
    cardsMultiplier: number;
    applyGoalsAdjustment: boolean;
    applyDrawAdjustment: boolean;
    applyCornersAdjustment: boolean;
    cardsExcessVsLeagueMean: {
      nA: number;
      nB: number;
      diff: number;
      tStat: number;
      pValue: number;
      significant05: boolean;
    };
    goalsExcessVsLeagueMean: {
      nA: number;
      nB: number;
      diff: number;
      tStat: number;
      pValue: number;
      significant05: boolean;
    };
    drawExcessVsLeagueMean: {
      nA: number;
      nB: number;
      diff: number;
      tStat: number;
      pValue: number;
      significant05: boolean;
    };
    cornersExcessVsLeagueMean: {
      nA: number;
      nB: number;
      diff: number;
      tStat: number;
      pValue: number;
      significant05: boolean;
    };
  };
  walkForwardMarketValidation: Record<
    'UK_WITH_REF' | 'EURO_NO_REF' | 'EXTRA_GOALS_ONLY',
    Record<string, WalkForwardMarketValidation>
  >;
  multiGoalsValidation?: {
    generatedAt?: string;
    heldOutMatches?: number;
    overall?: {
      samples: number;
      modelBrier: number;
      naiveBrier: number;
      brierSkill: number;
      modelLogLoss: number;
      naiveLogLoss: number;
      ece: number;
    };
    plattParams?: {
      global: MultiGoalsPlattParams;
      fullMatch: MultiGoalsPlattParams;
      team: MultiGoalsPlattParams;
      firstHalf: MultiGoalsPlattParams;
    };
    perLeague?: Record<string, MultiGoalsLeagueValidation>;
  };
  leagues: Record<string, CalibratedLeagueConfig>;
}

export interface MultiGoalsPlattParams {
  a: number;
  b: number;
}

export interface MultiGoalsLeagueValidation {
  competitionCode: string;
  leagueGroup: 'UK_WITH_REF' | 'EURO_NO_REF' | 'EXTRA_GOALS_ONLY';
  matches: number;
  samples: number;
  modelBrier: number;
  baseBrier: number;
  modelLogLoss: number;
  baseLogLoss: number;
  brierSkill: number;
  ci95Lower: number;
  ci95Upper: number;
  beatsBaseline: boolean;
  tierMode: 'ENABLED' | 'SPECULATIVE_ONLY' | 'DISABLED';
}

const DATA = calibratedParamsJson as unknown as CalibratedParamsData;

export function getCalibratedParams(): CalibratedParamsData {
  return DATA;
}

export function getCanonicalLeagueKey(compCode?: string | null): string {
  if (!compCode) return '';
  let upper = compCode.trim().toUpperCase();
  if (upper.startsWith('COMP_')) {
    upper = upper.slice(5);
  }
  return DATA.aliasToCanonical[upper] || upper;
}

export function getLeagueCalibratedConfig(compCode?: string | null): CalibratedLeagueConfig | null {
  const canon = getCanonicalLeagueKey(compCode);
  if (!canon) return null;
  return DATA.leagues[canon] || null;
}

export function getLeagueCapabilities(compCode?: string | null): LeagueColumnCapabilities {
  const cfg = getLeagueCalibratedConfig(compCode);
  if (cfg) {
    return cfg.capabilities;
  }
  const canon = getCanonicalLeagueKey(compCode) || 'UNKNOWN';
  return {
    competitionCode: canon,
    leagueGroup: 'EXTRA_GOALS_ONLY',
    hasGoals: true,
    hasHalfTimeGoals: false,
    hasCorners: false,
    hasCards: false,
    hasReferee: false,
    hasAsianHandicapPrices: false,
    sampleSizeMatches: 0,
    cornersSampleSize: 0,
    cardsSampleSize: 0,
    halfTimeSampleSize: 0,
    refereeSampleSize: 0,
  };
}

export function getWalkForwardMarketValidation(
  compCode?: string | null,
  market?: string
): WalkForwardMarketValidation | null {
  const grp = getLeagueCapabilities(compCode).leagueGroup;
  if (!market) return null;
  return DATA.walkForwardMarketValidation?.[grp]?.[market] || null;
}

export function resolveLeagueGoalMeans(compCode?: string | null): {
  avgHomeGoals: number;
  avgAwayGoals: number;
  avgTotalGoals: number;
  dixonColesRho: number;
  sampleSize: number;
} {
  const cfg = getLeagueCalibratedConfig(compCode);
  if (cfg && cfg.goals) {
    return {
      avgHomeGoals: cfg.goals.avgHomeGoals,
      avgAwayGoals: cfg.goals.avgAwayGoals,
      avgTotalGoals: cfg.goals.avgGoals,
      dixonColesRho: cfg.goals.dixonColesRho,
      sampleSize: cfg.goals.sampleSize,
    };
  }
  // Empirical global average across all 79,061 finished database matches
  return {
    avgHomeGoals: 1.44,
    avgAwayGoals: 1.14,
    avgTotalGoals: 2.58,
    dixonColesRho: -0.05,
    sampleSize: 0,
  };
}

export function getMultiGoalsPlattParams(): {
  global: MultiGoalsPlattParams;
  fullMatch: MultiGoalsPlattParams;
  team: MultiGoalsPlattParams;
  firstHalf: MultiGoalsPlattParams;
} {
  const p = DATA.multiGoalsValidation?.plattParams;
  return {
    global: p?.global ?? { a: 0.9914, b: 0.0168 },
    fullMatch: p?.fullMatch ?? { a: 0.9821, b: 0.0255 },
    team: p?.team ?? { a: 1.0137, b: 0.003 },
    firstHalf: p?.firstHalf ?? { a: 0.8749, b: 0.0712 },
  };
}

export function getMultiGoalsLeagueValidation(compCode?: string | null): MultiGoalsLeagueValidation | null {
  const canon = getCanonicalLeagueKey(compCode);
  if (!canon) return null;
  return DATA.multiGoalsValidation?.perLeague?.[canon] || null;
}
