import type { SlipBuildStyle, AccountTierId } from '@/lib/tiers';

export type SlipDayFilter = 'today' | 'tomorrow';
export type SlipSportFilter = 'football' | 'basketball' | 'all';
export type SlipOddsBasis = 'real' | 'model_fair';

export type SlipMarketGroupKey =
  | 'match_result'
  | 'double_chance'
  | 'total_goals'
  | 'btts'
  | 'handicap'
  | 'multi_goals'
  | 'corners'
  | 'cards'
  | 'halves'
  | 'basketball_totals';

export interface SlipMarketOptionMeta {
  key: SlipMarketGroupKey;
  label: string;
  sport: 'football' | 'basketball';
}

export const SLIP_MARKET_OPTIONS: SlipMarketOptionMeta[] = [
  { key: 'match_result', label: 'Match result (1X2)', sport: 'football' },
  { key: 'double_chance', label: 'Double chance', sport: 'football' },
  { key: 'total_goals', label: 'Total goals', sport: 'football' },
  { key: 'btts', label: 'Both teams to score', sport: 'football' },
  { key: 'handicap', label: 'Handicap', sport: 'football' },
  { key: 'multi_goals', label: 'Multi goals', sport: 'football' },
  { key: 'corners', label: 'Corners', sport: 'football' },
  { key: 'cards', label: 'Cards', sport: 'football' },
  { key: 'halves', label: 'Halves', sport: 'football' },
  { key: 'basketball_totals', label: 'Basketball totals', sport: 'basketball' },
];

export interface SlipBookmakerQuote {
  bookmaker: string;
  decimalOdds: number;
  observedAt: string | null;
  ageMinutes: number | null;
  ageLabel: string;
  isConsensus: boolean;
}

export interface SlipCandidateLeg {
  matchId: string;
  sport: 'football' | 'basketball';
  matchLabel: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionId: string;
  competitionCode: string;
  competitionName: string;
  kickoffTime: string;
  marketCode: string;
  marketGroup: SlipMarketGroupKey;
  marketName: string;
  selection: string;
  line: number | null;
  decimalOdds: number;
  oddsSourceType: 'real_bookmaker' | 'model_fair';
  bookmakerName: string;
  observedAt: string | null;
  priceAgeMinutes: number | null;
  priceAgeLabel: string;
  calibratedProbability: number;
  impliedProbability: number | null;
  marketEdge: number | null;
  expectedValue: number | null;
  confidenceTier: 'HIGH' | 'MEDIUM';
  teamNewsLowered: boolean;
  teamNewsNote: string | null;
  oneLineWhy: string;
  bookmakerQuotes: SlipBookmakerQuote[];
  bestQuoteApplied: boolean;
}

export interface BuiltSlip {
  slipId: string;
  rank: number;
  style: SlipBuildStyle;
  legs: SlipCandidateLeg[];
  legsCount: number;
  combinedOdds: number;
  combinedProbability: number;
  estimatedHitChancePct: number;
  targetOdds: number;
  targetDeltaPct: number;
  targetProximityLabel: string;
  includesModelFairOdds: boolean;
  modelFairWarning: string | null;
  averageMarketEdge: number | null;
  weakestLegMatchId: string;
  weakestLegMarketCode: string;
  independenceNote: string;
  honestNotice: string;
  responsibleFooter: string;
  createdAt: string;
}

export interface SlipBuildRequest {
  targetOdds: number;
  day: SlipDayFilter;
  sport: SlipSportFilter;
  competitionIds: string[];
  markets: SlipMarketGroupKey[];
  maxLegs: number;
  style: SlipBuildStyle;
  oddsBasis: SlipOddsBasis;
  maxPriceAgeMinutes?: number;
}

export type SlipEmptyReasonCode =
  | 'NO_UPCOMING_GAMES'
  | 'NO_QUALIFIED_MATCHES'
  | 'NO_REAL_PRICES'
  | 'NO_COMBINATIONS_IN_BAND';

export interface SlipBuildDiagnostics {
  fixturesScanned: number;
  upcomingFixtures: number;
  qualifiedMatches: number;
  candidateLegs: number;
  realPricedLegs: number;
  modelFairLegs: number;
  rejectedStalePrices: number;
  rejectedFlaggedExplanations: number;
  rejectedAbstainedOrThin: number;
  searchDurationMs: number;
  realPricedMatches?: number;
  modelFairAvailableMatches?: number;
  combinationsInBand?: number;
  emptyReasonCode?: SlipEmptyReasonCode | null;
  canSuggestModelFair?: boolean;
}

export interface SlipBuildResponse {
  slips: BuiltSlip[];
  emptyMessage: string | null;
  request: SlipBuildRequest;
  diagnostics: SlipBuildDiagnostics;
  quota: {
    tier: AccountTierId;
    isAdmin: boolean;
    dailyBuildLimit: number | null;
    buildsUsedToday: number;
    buildsRemainingToday: number | null;
    maxTargetOdds: number;
    allowedStyles: SlipBuildStyle[];
    bestPriceComparison: boolean;
  };
  generatedAt: string;
}

export interface DailySlipLegRecord {
  matchId: string;
  sport: 'football' | 'basketball';
  matchLabel: string;
  competitionId: string;
  competitionCode: string;
  competitionName: string;
  kickoffTime: string;
  marketCode: string;
  marketName: string;
  selection: string;
  line: number | null;
  decimalOdds: number;
  oddsSourceType: 'real_bookmaker' | 'model_fair';
  bookmakerName: string;
  priceAgeLabel: string;
  calibratedProbability: number;
  confidenceTier: 'HIGH' | 'MEDIUM';
  oneLineWhy: string;
  legStatus: 'PENDING' | 'WON' | 'LOST' | 'VOID' | 'PUSH';
  settledScore?: string | null;
}

export interface DailySlipRecordRow {
  id: string;
  recordDate: string;
  targetOdds: number;
  style: SlipBuildStyle;
  oddsBasis: SlipOddsBasis;
  combinedOdds: number;
  combinedProbability: number;
  settledOdds: number | null;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  legsCount: number;
  activeLegsCount: number;
  voidedLegsCount: number;
  legs: DailySlipLegRecord[];
  createdAt: string;
  firstKickoffUtc: string;
  settledAt: string | null;
}

export interface SlipRecordSummary {
  totalSlips: number;
  settledSlips: number;
  wonSlips: number;
  lostSlips: number;
  voidSlips: number;
  pendingSlips: number;
  hitRatePct: number | null;
  smallSampleThreshold: number;
  isSmallSample: boolean;
  smallSampleCaveat: string;
  records: DailySlipRecordRow[];
  generatedAt: string;
}
