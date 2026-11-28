// CALIBRALL: Browser-Safe Market Evidence Map & Runtime Explanation Consistency Guard
// Enforces a single source of truth between active pick, header/title, probabilities,
// tier labels, driver tiles, alternates ordering, and market-appropriate evidence.

import {
  ConfidenceTier,
  ExplanationDriverTile,
  MarketPrediction,
  MarketPeriod,
  MultiGoalsMeta,
  WrittenMatchAlternate,
  WrittenMatchExplanation,
} from '@/types';
import { cleanDisplayText } from '@/lib/utils/formatText';

export interface FootballTargetScope {
  scopeKind: 'match' | 'home' | 'away';
  isFirstHalf: boolean;
  isTeamScoped: boolean;
}

export function resolveFootballTargetScope(pick?: {
  marketCode?: string;
  optionType?: string;
  marketCategory?: string;
  selection?: string;
  period?: MarketPeriod | string;
  multiGoalsMeta?: MultiGoalsMeta;
} | null, homeTeam?: string, awayTeam?: string): FootballTargetScope {
  if (!pick) return { scopeKind: 'match', isFirstHalf: false, isTeamScoped: false };
  const code = String(pick.marketCode || '').toUpperCase();
  const opt = String(pick.optionType || '').toLowerCase();
  const cat = String(pick.marketCategory || '').toLowerCase();
  const sel = String(pick.selection || '').toLowerCase();

  const isFirstHalf =
    pick.period === 'FIRST_HALF' ||
    opt === 'first_half_goals' ||
    opt === 'first_half_multi_goals' ||
    code.startsWith('FH_') ||
    pick.multiGoalsMeta?.scope === 'first_half' ||
    /\b1st half\b/.test(sel);

  if (
    code.startsWith('TEAM_GOALS_HOME') ||
    code.startsWith('TEAM_MULTI_GOALS_HOME') ||
    code.startsWith('TEAM_CORNERS_HOME') ||
    code.startsWith('TEAM_CARDS_HOME') ||
    code.startsWith('TGB_HOME') ||
    pick.multiGoalsMeta?.scope === 'home'
  ) {
    return { scopeKind: 'home', isFirstHalf, isTeamScoped: true };
  }

  if (
    code.startsWith('TEAM_GOALS_AWAY') ||
    code.startsWith('TEAM_MULTI_GOALS_AWAY') ||
    code.startsWith('TEAM_CORNERS_AWAY') ||
    code.startsWith('TEAM_CARDS_AWAY') ||
    code.startsWith('TGB_AWAY') ||
    pick.multiGoalsMeta?.scope === 'away'
  ) {
    return { scopeKind: 'away', isFirstHalf, isTeamScoped: true };
  }

  const isTeamCat =
    cat === 'team_goals' ||
    opt === 'team_multi_goals' ||
    opt === 'team_bookings' ||
    opt === 'team_goal_bounds' ||
    (cat === 'team_corners' && opt !== 'corner_handicap') ||
    /\bteam\s+(?:goals|multi goals|corners|cards|goal bounds)\b/.test(sel);

  if (isTeamCat) {
    const awayLower = awayTeam ? cleanDisplayText(awayTeam).toLowerCase() : '';
    const homeLower = homeTeam ? cleanDisplayText(homeTeam).toLowerCase() : '';
    if (awayLower && sel.includes(awayLower) && !sel.includes(homeLower)) {
      return { scopeKind: 'away', isFirstHalf, isTeamScoped: true };
    }
    return { scopeKind: 'home', isFirstHalf, isTeamScoped: true };
  }

  return { scopeKind: 'match', isFirstHalf, isTeamScoped: false };
}

export interface BasketballTargetScope {
  scopeKind: 'game' | 'home' | 'away';
  isFirstHalf: boolean;
  isTeamScoped: boolean;
}

export function resolveBasketballTargetScope(pick?: {
  marketCode?: string;
  marketCategory?: string;
  side?: 'game' | 'home' | 'away';
  selection?: string;
} | null, homeTeam?: string, awayTeam?: string): BasketballTargetScope {
  if (!pick) return { scopeKind: 'game', isFirstHalf: false, isTeamScoped: false };
  const code = String(pick.marketCode || '').toUpperCase();
  const cat = String(pick.marketCategory || '').toLowerCase();
  const sel = String(pick.selection || '').toLowerCase();

  if (cat === 'home_total' || code.startsWith('HOME_TOTAL') || code.startsWith('BB_HOME_TOTAL')) {
    return { scopeKind: 'home', isFirstHalf: false, isTeamScoped: true };
  }
  if (cat === 'away_total' || code.startsWith('AWAY_TOTAL') || code.startsWith('BB_AWAY_TOTAL')) {
    return { scopeKind: 'away', isFirstHalf: false, isTeamScoped: true };
  }
  if (
    cat === 'h1_team_total' ||
    code.includes('H1_HOME_TOTAL') ||
    code.includes('H1_AWAY_TOTAL')
  ) {
    const isAway =
      pick.side === 'away' ||
      code.includes('AWAY') ||
      Boolean(awayTeam && sel.includes(cleanDisplayText(awayTeam).toLowerCase()) && !(homeTeam && sel.includes(cleanDisplayText(homeTeam).toLowerCase())));
    return { scopeKind: isAway ? 'away' : 'home', isFirstHalf: true, isTeamScoped: true };
  }
  if (cat === 'h1_game_total' || code.startsWith('H1_TOTAL') || code.startsWith('BB_H1_GAME_TOTAL')) {
    return { scopeKind: 'game', isFirstHalf: true, isTeamScoped: false };
  }
  return { scopeKind: 'game', isFirstHalf: false, isTeamScoped: false };
}

/**
 * Unified headline & alternates ranking comparator shared across v25Evaluator,
 * slate diversity selection, and alternates sorting:
 * 1. Validated picks rank ahead of unvalidated.
 * 2. Qualified real-odds +EV picks rank strictly ahead of unpriced picks by EV descending.
 * 3. Qualified unpriced picks rank primarily by calibrated probability descending,
 *    with bounded edgeOverBaseline as tie-breaker so alternates never outrank headline
 *    without a stated selection reason (e.g. +EV override or 40% diversity cap).
 */
export function computeFootballPickRankScore(p: MarketPrediction): number {
  const hasOddsEv = Boolean(
    p.marketOdds &&
      p.marketOdds > 1.0 &&
      p.expectedValue !== null &&
      p.expectedValue !== undefined &&
      p.expectedValue > 0
  );
  const prob = p.calibratedProbability ?? p.modelProbability ?? 0;
  const clampedEdge = Math.max(0, Math.min(0.20, p.edgeOverBaseline ?? 0));
  if (hasOddsEv) {
    return 1000 + (p.expectedValue ?? 0) * 100 + prob * 10 + clampedEdge;
  }
  return prob * 100 + clampedEdge * 10;
}

export function compareFootballPicksByRank(a: MarketPrediction, b: MarketPrediction): number {
  const aVal = a.isValidated ? 1 : 0;
  const bVal = b.isValidated ? 1 : 0;
  if (bVal !== aVal) return bVal - aVal;

  const aHasOdds = Boolean(
    a.marketOdds && a.marketOdds > 1.0 && a.expectedValue !== null && a.expectedValue !== undefined && a.expectedValue > 0
  );
  const bHasOdds = Boolean(
    b.marketOdds && b.marketOdds > 1.0 && b.expectedValue !== null && b.expectedValue !== undefined && b.expectedValue > 0
  );
  if (aHasOdds && !bHasOdds) return -1;
  if (!aHasOdds && bHasOdds) return 1;
  if (aHasOdds && bHasOdds) {
    const evDiff = (b.expectedValue ?? 0) - (a.expectedValue ?? 0);
    if (Math.abs(evDiff) > 1e-6) return evDiff;
  }

  const aProb = a.calibratedProbability ?? a.modelProbability ?? 0;
  const bProb = b.calibratedProbability ?? b.modelProbability ?? 0;
  if (Math.abs(bProb - aProb) > 1e-6) return bProb - aProb;

  const edgeDiff = (b.edgeOverBaseline ?? 0) - (a.edgeOverBaseline ?? 0);
  if (Math.abs(edgeDiff) > 1e-6) return edgeDiff;

  return (b.rankingScore ?? 0) - (a.rankingScore ?? 0);
}

export type MarketEvidenceFamily =
  | 'cards'
  | 'corners'
  | 'multi_goals'
  | 'goal_runs'
  | 'goals'
  | 'btts'
  | 'handicap'
  | 'result'
  | 'half_time'
  | 'basketball';

export type AllowedEvidenceField =
  | 'expectedCards'
  | 'homeAvgYellowCards'
  | 'homeAvgRedCards'
  | 'homeAvgCardsFor'
  | 'homeAvgCardsAgainst'
  | 'awayAvgYellowCards'
  | 'awayAvgRedCards'
  | 'awayAvgCardsFor'
  | 'awayAvgCardsAgainst'
  | 'homeAvgFoulsCommitted'
  | 'homeAvgFoulsDrawn'
  | 'awayAvgFoulsCommitted'
  | 'awayAvgFoulsDrawn'
  | 'referee'
  | 'refereeShrunkRate'
  | 'refereeLeagueBaseline'
  | 'isDerby'
  | 'h2hCardsMeetingsCount'
  | 'h2hAvgTotalCards'
  | 'expectedCornersHome'
  | 'expectedCornersAway'
  | 'homeAvgCornersFor'
  | 'homeAvgCornersAgainst'
  | 'awayAvgCornersFor'
  | 'awayAvgCornersAgainst'
  | 'wingHeavy'
  | 'h2hCornersMeetingsCount'
  | 'h2hAvgTotalCorners'
  | 'homeXg'
  | 'awayXg'
  | 'totalXg'
  | 'homeAvgScored'
  | 'homeAvgConceded'
  | 'awayAvgScored'
  | 'awayAvgConceded'
  | 'lowScoringTendency'
  | 'multiGoalsMeta'
  | 'goalRunsMeta'
  | 'h2hMeetingsCount'
  | 'h2hAvgTotalGoals'
  | 'homeProjected'
  | 'awayProjected'
  | 'projectedTotal'
  | 'projectedTotalStd'
  | 'homeAvgScoredBasketball'
  | 'awayAvgAllowedBasketball'
  | 'paceAdjustment'
  | 'restAndB2B'
  | 'sportsbookTotal'
  | 'sampleDepth'
  | 'scheduleFatigue'
  | 'squadAbsences'
  | 'lineupConfirmed'
  | 'marketPriceAndEv';

/**
 * Central map defining which evidence fields may appear in copy, reasoning payloads,
 * and driver tiles for each market family. Any field outside this allowlist is stripped/blocked.
 */
export const MARKET_EVIDENCE_FIELDS: Record<MarketEvidenceFamily, ReadonlySet<AllowedEvidenceField>> = {
  cards: new Set<AllowedEvidenceField>([
    'expectedCards',
    'homeAvgYellowCards',
    'homeAvgRedCards',
    'homeAvgCardsFor',
    'homeAvgCardsAgainst',
    'awayAvgYellowCards',
    'awayAvgRedCards',
    'awayAvgCardsFor',
    'awayAvgCardsAgainst',
    'homeAvgFoulsCommitted',
    'homeAvgFoulsDrawn',
    'awayAvgFoulsCommitted',
    'awayAvgFoulsDrawn',
    'referee',
    'refereeShrunkRate',
    'refereeLeagueBaseline',
    'isDerby',
    'h2hCardsMeetingsCount',
    'h2hAvgTotalCards',
    'sampleDepth',
    'lineupConfirmed',
    'marketPriceAndEv',
  ]),
  corners: new Set<AllowedEvidenceField>([
    'expectedCornersHome',
    'expectedCornersAway',
    'homeAvgCornersFor',
    'homeAvgCornersAgainst',
    'awayAvgCornersFor',
    'awayAvgCornersAgainst',
    'wingHeavy',
    'h2hCornersMeetingsCount',
    'h2hAvgTotalCorners',
    'sampleDepth',
    'squadAbsences',
    'lineupConfirmed',
    'marketPriceAndEv',
  ]),
  multi_goals: new Set<AllowedEvidenceField>([
    'homeXg',
    'awayXg',
    'totalXg',
    'homeAvgScored',
    'homeAvgConceded',
    'awayAvgScored',
    'awayAvgConceded',
    'lowScoringTendency',
    'multiGoalsMeta',
    'h2hMeetingsCount',
    'h2hAvgTotalGoals',
    'sampleDepth',
    'scheduleFatigue',
    'squadAbsences',
    'lineupConfirmed',
    'marketPriceAndEv',
  ]),
  goal_runs: new Set<AllowedEvidenceField>([
    'homeXg',
    'awayXg',
    'totalXg',
    'goalRunsMeta',
    'sampleDepth',
    'scheduleFatigue',
    'squadAbsences',
    'lineupConfirmed',
  ]),
  goals: new Set<AllowedEvidenceField>([
    'homeXg',
    'awayXg',
    'totalXg',
    'homeAvgScored',
    'homeAvgConceded',
    'awayAvgScored',
    'awayAvgConceded',
    'lowScoringTendency',
    'h2hMeetingsCount',
    'h2hAvgTotalGoals',
    'sampleDepth',
    'scheduleFatigue',
    'squadAbsences',
    'lineupConfirmed',
    'marketPriceAndEv',
  ]),
  btts: new Set<AllowedEvidenceField>([
    'homeXg',
    'awayXg',
    'totalXg',
    'homeAvgScored',
    'homeAvgConceded',
    'awayAvgScored',
    'awayAvgConceded',
    'lowScoringTendency',
    'h2hMeetingsCount',
    'h2hAvgTotalGoals',
    'sampleDepth',
    'scheduleFatigue',
    'squadAbsences',
    'lineupConfirmed',
    'marketPriceAndEv',
  ]),
  handicap: new Set<AllowedEvidenceField>([
    'homeXg',
    'awayXg',
    'totalXg',
    'homeAvgScored',
    'homeAvgConceded',
    'awayAvgScored',
    'awayAvgConceded',
    'h2hMeetingsCount',
    'h2hAvgTotalGoals',
    'sampleDepth',
    'scheduleFatigue',
    'squadAbsences',
    'lineupConfirmed',
    'marketPriceAndEv',
  ]),
  result: new Set<AllowedEvidenceField>([
    'homeXg',
    'awayXg',
    'totalXg',
    'homeAvgScored',
    'homeAvgConceded',
    'awayAvgScored',
    'awayAvgConceded',
    'h2hMeetingsCount',
    'h2hAvgTotalGoals',
    'sampleDepth',
    'scheduleFatigue',
    'squadAbsences',
    'lineupConfirmed',
    'marketPriceAndEv',
  ]),
  half_time: new Set<AllowedEvidenceField>([
    'homeXg',
    'awayXg',
    'totalXg',
    'homeAvgScored',
    'homeAvgConceded',
    'awayAvgScored',
    'awayAvgConceded',
    'lowScoringTendency',
    'multiGoalsMeta',
    'h2hMeetingsCount',
    'h2hAvgTotalGoals',
    'sampleDepth',
    'scheduleFatigue',
    'squadAbsences',
    'lineupConfirmed',
    'marketPriceAndEv',
  ]),
  basketball: new Set<AllowedEvidenceField>([
    'homeProjected',
    'awayProjected',
    'projectedTotal',
    'projectedTotalStd',
    'homeAvgScoredBasketball',
    'awayAvgAllowedBasketball',
    'paceAdjustment',
    'restAndB2B',
    'sportsbookTotal',
    'sampleDepth',
    'marketPriceAndEv',
  ]),
};

export function getMarketEvidenceFamily(pick?: {
  marketCode?: string;
  optionType?: string;
  marketCategory?: string;
  marketFamily?: string;
} | null, sport: 'football' | 'basketball' = 'football'): MarketEvidenceFamily {
  if (sport === 'basketball') return 'basketball';
  if (!pick) return 'goals';

  const code = String(pick.marketCode || '').toUpperCase();
  const opt = String(pick.optionType || '').toLowerCase();
  const cat = String(pick.marketCategory || '').toLowerCase();
  const fam = String(pick.marketFamily || '').toLowerCase();

  if (
    opt === 'bookings' ||
    opt === 'team_bookings' ||
    opt === 'booking_points' ||
    cat === 'bookings' ||
    fam === 'bookings' ||
    fam === 'cards' ||
    code.includes('CARD') ||
    code.includes('BOOKING')
  ) {
    return 'cards';
  }
  if (
    opt === 'corners' ||
    opt === 'corner_handicap' ||
    cat === 'total_corners' ||
    cat === 'team_corners' ||
    fam === 'corners' ||
    code.includes('CORNER')
  ) {
    return 'corners';
  }
  if (
    opt === 'goal_runs' ||
    cat === 'goal_runs' ||
    fam === 'goal_runs' ||
    code.startsWith('GOAL_RUN_')
  ) {
    return 'goal_runs';
  }
  if (
    opt === 'multi_goals' ||
    opt === 'team_multi_goals' ||
    opt === 'first_half_multi_goals' ||
    cat === 'multi_goals' ||
    fam === 'multi_goals' ||
    code.includes('MULTI_GOALS')
  ) {
    return 'multi_goals';
  }
  if (
    opt === 'both_teams_to_score' ||
    cat === 'btts' ||
    fam === 'both_teams_to_score' ||
    code.startsWith('BTTS_')
  ) {
    return 'btts';
  }
  if (
    opt === 'asian_handicap' ||
    opt === 'european_handicap' ||
    cat === 'handicap' ||
    fam === 'handicap' ||
    code.startsWith('AH_') ||
    code.startsWith('EH_')
  ) {
    return 'handicap';
  }
  if (
    opt === 'first_half_goals' ||
    opt === 'second_half_result' ||
    opt === 'highest_scoring_half' ||
    cat === 'half_time' ||
    fam === 'first_half_goals' ||
    fam === 'second_half_result' ||
    fam === 'highest_scoring_half' ||
    code.startsWith('FH_') ||
    code.startsWith('2H_') ||
    code.startsWith('HSH_')
  ) {
    return 'half_time';
  }
  if (
    opt === 'win' ||
    opt === 'draw' ||
    opt === 'double_chance' ||
    opt === 'draw_no_bet' ||
    opt === 'win_draw_combo' ||
    cat === 'match_result' ||
    cat === 'double_chance' ||
    cat === 'draw_no_bet' ||
    fam === 'result' ||
    fam === 'draw' ||
    fam === 'double_chance'
  ) {
    return 'result';
  }
  return 'goals';
}

export function isEvidenceFieldAllowed(
  family: MarketEvidenceFamily,
  field: AllowedEvidenceField
): boolean {
  return MARKET_EVIDENCE_FIELDS[family].has(field);
}

export interface ExplanationIssueItem {
  code: string;
  detail: string;
  severity: 'error' | 'warning';
}

export interface ExplanationValidationResult {
  valid: boolean;
  issues: ExplanationIssueItem[];
  safeFallbackOneLine?: string;
  safeFallbackFull?: string;
}

function tierToWord(tier?: ConfidenceTier | string | null): string {
  const u = String(tier || '').toUpperCase();
  if (u === 'HIGH' || u === 'SAFE') return 'High';
  if (u === 'MEDIUM' || u === 'MODERATE') return 'Medium';
  return 'Low';
}

export function buildSafeFallbackExplanation(params: {
  sport: 'football' | 'basketball';
  homeTeam: string;
  awayTeam: string;
  selection?: string | null;
  probability?: number | null;
  tier?: ConfidenceTier | string | null;
  noRecommendationReason?: string | null;
}): { oneLineSummary: string; fullSummary: string } {
  const home = cleanDisplayText(params.homeTeam);
  const away = cleanDisplayText(params.awayTeam);
  if (!params.selection || typeof params.probability !== 'number' || !Number.isFinite(params.probability)) {
    const s1 = cleanDisplayText(
      `No qualified market pick is active for ${home} vs ${away}.`
    );
    const s2 = cleanDisplayText(
      params.noRecommendationReason ||
        'Evaluated lines remained below qualification thresholds.'
    );
    return { oneLineSummary: s1, fullSummary: `${s1} ${s2}` };
  }
  const sel = cleanDisplayText(params.selection);
  const pctText = `${(params.probability * 100).toFixed(1)}%`;
  const tierWord = tierToWord(params.tier);
  const s1 = cleanDisplayText(
    `Model recommends ${sel} at ${pctText} (${tierWord} confidence) for ${home} vs ${away}.`
  );
  const s2 = cleanDisplayText(
    'Supporting breakdown is held back pending consistency validation.'
  );
  return { oneLineSummary: s1, fullSummary: `${s1} ${s2}` };
}

/**
 * Validates that header/card pick, text summary, probability, tier, driver tiles,
 * market-specific evidence, and alternates form a single consistent truth.
 */
export function validateExplanationConsistency(params: {
  sport: 'football' | 'basketball';
  homeTeam: string;
  awayTeam: string;
  activePick: {
    marketCode: string;
    selection: string;
    probability: number;
    confidenceTier?: ConfidenceTier;
    optionType?: string;
    marketCategory?: string;
    marketFamily?: string;
    period?: MarketPeriod | string;
    multiGoalsMeta?: MultiGoalsMeta;
    side?: 'game' | 'home' | 'away';
  } | null;
  explanation: WrittenMatchExplanation;
  isThinHistory?: boolean;
}): ExplanationValidationResult {
  const { sport, homeTeam, awayTeam, activePick, explanation, isThinHistory } = params;
  const issues: ExplanationIssueItem[] = [];
  const full = String(explanation.fullSummary || '').trim();
  const oneLine = String(explanation.oneLineSummary || '').trim();

  const tiles: ExplanationDriverTile[] = explanation.driverTiles || [];
  const alts = explanation.alternates || [];
  const tilesText = tiles.map((t) => `${t.label} ${t.value}`).join(' ');
  const altsText = alts.map((a) => `${a.marketName} ${a.selection}`).join(' ');
  const combinedDisplay = `${homeTeam} ${awayTeam} ${full} ${activePick?.selection || ''} ${tilesText} ${altsText}`;

  // 1. Broken/dirty tokens check
  if (!full || !oneLine) {
    issues.push({ code: 'EMPTY_SUMMARY', detail: 'Generated explanation text is empty.', severity: 'error' });
  }
  if (/\b(undefined|NaN|null|Infinity)\b/i.test(`${full} ${tilesText} ${altsText}`)) {
    issues.push({ code: 'INVALID_LITERAL', detail: `Summary contains invalid literal: ${full}`, severity: 'error' });
  }
  if (full && !/[.!?]$/.test(full)) {
    issues.push({ code: 'TRUNCATED_SENTENCE', detail: `Summary does not end cleanly with terminal punctuation: "${full.slice(-40)}"`, severity: 'error' });
  }
  if (
    /\bclears?\s+\d+(?:\.\d+)?(?!\d)(?!\.\d)(?!\s*%)/i.test(full) ||
    /\bclearing\s+(?:our\s+)?\d+(?:\.\d+)?(?!\d)(?!\.\d)(?!\s*%)/i.test(full)
  ) {
    issues.push({ code: 'MISSING_PERCENT_UNIT', detail: 'Threshold number appears without % unit.', severity: 'error' });
  }
  if (
    /\b(?:projects?|projected|averages?|averaging)\s+\d+(?:\.\d+)?(?!\d)(?!\.\d)\s*(?:[.;,]|$)/i.test(full) ||
    /\bstd\s+\d+(?:\.\d+)?(?!\d)(?!\.\d)(?!\s*(?:pts|points|%))/i.test(full)
  ) {
    issues.push({ code: 'DANGLING_NUMBER_UNITLESS', detail: 'Projected or averaged number appears without an explicit unit.', severity: 'error' });
  }
  const sanitizedPluralCheck = `${full} ${tilesText}`
    .replace(/\b(?:to|and)\s+1\s+goals\b/gi, 'to 1')
    .replace(/\d+\.1\s+(?:meetings|matches|days|games|cards|corners|goals)\b/gi, '');
  if (/\b1\s+(?:meetings|matches|days|games|cards|corners|goals)\b/i.test(sanitizedPluralCheck)) {
    issues.push({ code: 'PLURALIZATION_BUG', detail: 'Singular count used with plural noun.', severity: 'error' });
  }
  if (/\bbookings?\b/i.test(combinedDisplay)) {
    issues.push({ code: 'TERMINOLOGY_BOOKINGS', detail: 'Legacy term "bookings" found instead of canonical "cards".', severity: 'error' });
  }
  if (/(?:Nott['’]?m\s+Forest|Sheffield\s+Utd|Sheffield\s+Weds|Bristol\s+Rvs)/i.test(combinedDisplay)) {
    issues.push({ code: 'NON_CANONICAL_TEAM_NAME', detail: 'Non-canonical provider team alias leaked into display output.', severity: 'error' });
  }

  // 2. Single source of truth check against activePick
  if (activePick && !isThinHistory) {
    const cleanSel = cleanDisplayText(activePick.selection);
    const cleanSelLower = cleanSel.toLowerCase();
    if (!full.toLowerCase().includes(cleanSelLower)) {
      issues.push({
        code: 'PICK_TEXT_MISMATCH',
        detail: `Active pick selection "${cleanSel}" does not appear in explanation text.`,
        severity: 'error',
      });
    }

    const rPick = explanation.reasoning?.topPick;
    if (rPick) {
      if (rPick.marketCode && rPick.marketCode !== activePick.marketCode) {
        issues.push({
          code: 'REASONING_PICK_MISMATCH',
          detail: `reasoning.topPick.marketCode (${rPick.marketCode}) != activePick (${activePick.marketCode}).`,
          severity: 'error',
        });
      }
      if (typeof rPick.probability === 'number' && Math.abs(rPick.probability - activePick.probability) > 0.002) {
        issues.push({
          code: 'PROBABILITY_MISMATCH',
          detail: `reasoning probability ${(rPick.probability * 100).toFixed(1)}% != activePick ${(activePick.probability * 100).toFixed(1)}%.`,
          severity: 'error',
        });
      }
    }

    const expectedPct = `${(activePick.probability * 100).toFixed(1)}%`;
    if (!oneLine.includes(expectedPct)) {
      issues.push({
        code: 'HEADLINE_PROBABILITY_MISMATCH',
        detail: `Headline sentence missing active pick probability ${expectedPct}.`,
        severity: 'error',
      });
    }

    if (activePick.confidenceTier) {
      const expectedTierWord = `${tierToWord(activePick.confidenceTier)} confidence`;
      if (!oneLine.toLowerCase().includes(expectedTierWord.toLowerCase())) {
        issues.push({
          code: 'TIER_LABEL_MISMATCH',
          detail: `Headline sentence missing tier label "${expectedTierWord}".`,
          severity: 'error',
        });
      }
    }

    // 3. Alternates outranking headline without reason
    const hasReason = Boolean(explanation.headlineSelectionReason && explanation.headlineSelectionReason.trim().length > 0);
    for (const alt of alts) {
      if (alt.marketCode === activePick.marketCode) {
        issues.push({
          code: 'DUPLICATE_HEADLINE_IN_ALTERNATES',
          detail: `Alternate duplicates active headline market ${alt.marketCode}.`,
          severity: 'error',
        });
      }
      if (!hasReason && typeof alt.probability === 'number' && alt.probability - activePick.probability > 0.0025) {
        issues.push({
          code: 'ALTERNATE_OUTRANKS_HEADLINE',
          detail: `Alternate "${alt.selection}" (${(alt.probability * 100).toFixed(1)}%) outranks headline "${cleanSel}" (${(activePick.probability * 100).toFixed(1)}%) with no stated selection reason.`,
          severity: 'error',
        });
      }
    }

    // 4. Market-specific evidence boundary checks (prose + driver tiles)
    const family = getMarketEvidenceFamily(activePick, sport);
    if (family === 'cards') {
      if (/\b(?:xG|expected goals|scored and .* conceded|total goals)\b/i.test(`${full} ${tilesText}`)) {
        issues.push({
          code: 'MARKET_EVIDENCE_LEAK_GOALS_IN_CARDS',
          detail: 'Goals/xG evidence leaked into a cards explanation.',
          severity: 'error',
        });
      }
      if (/\bcorners\b/i.test(`${full} ${tilesText}`)) {
        issues.push({
          code: 'MARKET_EVIDENCE_LEAK_CORNERS_IN_CARDS',
          detail: 'Corners evidence leaked into a cards explanation.',
          severity: 'error',
        });
      }
      if (/\baverages\s+\d+(?:\.\d+)?\s+cards\s+per\s+match(?!\s+over\s+the\s+last\s+\d+)/i.test(full)) {
        issues.push({
          code: 'UNSCALED_CARD_RATE',
          detail: 'Team card rate printed without measured sample window.',
          severity: 'error',
        });
      }
    } else if (family === 'corners') {
      if (/\b(?:xG|expected goals|scored and .* conceded|total goals)\b/i.test(`${full} ${tilesText}`)) {
        issues.push({
          code: 'MARKET_EVIDENCE_LEAK_GOALS_IN_CORNERS',
          detail: 'Goals/xG evidence leaked into a corners explanation.',
          severity: 'error',
        });
      }
      if (/\b(?:cards|referee|yellow|red card)\b/i.test(`${full} ${tilesText}`)) {
        issues.push({
          code: 'MARKET_EVIDENCE_LEAK_CARDS_IN_CORNERS',
          detail: 'Cards/referee evidence leaked into a corners explanation.',
          severity: 'error',
        });
      }
    }

    // 4b. Team vs match scope integrity checks
    const fullAndTiles = `${full} ${tilesText}`;
    if (sport === 'football') {
      const fbScope = resolveFootballTargetScope(activePick, homeTeam, awayTeam);
      if (fbScope.isTeamScoped) {
        if (/\b(?:total xG|combined xG|total corners|total cards|combined goals|low scoring projection)\b/i.test(fullAndTiles)) {
          issues.push({
            code: 'TEAM_SCOPE_LEAK_COMBINED_TOTAL',
            detail: `Team-scoped pick (${activePick.selection}) leaked combined match totals into explanation or driver tiles.`,
            severity: 'error',
          });
        }
      } else if (fbScope.isFirstHalf) {
        if (/\blow scoring projection\b/i.test(fullAndTiles)) {
          issues.push({
            code: 'FIRST_HALF_SCOPE_LEAK_FULL_MATCH',
            detail: `First-half pick (${activePick.selection}) leaked full-match combined low scoring projection.`,
            severity: 'error',
          });
        }
      }
    } else if (sport === 'basketball') {
      const bbScope = resolveBasketballTargetScope(activePick, homeTeam, awayTeam);
      if (bbScope.isTeamScoped) {
        if (/\b(?:total pts|game total|Projected total|Split projection)\b/i.test(fullAndTiles)) {
          issues.push({
            code: 'BB_TEAM_SCOPE_LEAK_GAME_TOTAL',
            detail: `Basketball team total (${activePick.selection}) leaked full-game total into explanation or driver tiles.`,
            severity: 'error',
          });
        }
      } else if (bbScope.isFirstHalf) {
        if (/\bProjected total\b/i.test(tilesText)) {
          issues.push({
            code: 'BB_H1_SCOPE_LEAK_FULL_GAME',
            detail: `1st half basketball total leaked full-game Projected total tile.`,
            severity: 'error',
          });
        }
      }
    }

    // 5. H2H < 3 check
    const h2hMention = full.match(/(\d+)\s+(?:head to head\s+)?meetings?/i);
    if (h2hMention && /head to head|last \d+ meetings/i.test(full)) {
      const count = Number(h2hMention[1]);
      if (Number.isFinite(count) && count < 3) {
        issues.push({
          code: 'H2H_BELOW_MIN_SAMPLE',
          detail: `H2H cited with sample size ${count} (< 3 minimum).`,
          severity: 'error',
        });
      }
    }
    const h2hTileMatch = tilesText.match(/\bH2H\b[^()]*\((\d+)\)/i);
    if (h2hTileMatch && Number(h2hTileMatch[1]) < 3) {
      issues.push({
        code: 'H2H_BELOW_MIN_SAMPLE',
        detail: `H2H driver tile cited with sample size ${h2hTileMatch[1]} (< 3 minimum).`,
        severity: 'error',
      });
    }
  } else if (!isThinHistory && (explanation.alternates?.length || 0) > 0) {
    // Abstained fixture shouldn't carry a fake recommended topPick in reasoning
    if (explanation.reasoning?.topPick) {
      issues.push({
        code: 'ABSTAIN_WITH_REASONING_TOPPICK',
        detail: 'No active pick, yet reasoning.topPick is populated.',
        severity: 'error',
      });
    }
  }

  // 6. Driver tile sanity check
  for (const tile of tiles) {
    if (/\b(undefined|NaN|null)\b/i.test(`${tile.label} ${tile.value}`)) {
      issues.push({
        code: 'INVALID_TILE_VALUE',
        detail: `Driver tile "${tile.label}" has invalid value "${tile.value}".`,
        severity: 'error',
      });
    }
  }

  const valid = issues.filter((i) => i.severity === 'error').length === 0;
  if (valid) {
    return { valid: true, issues };
  }

  const fallback = buildSafeFallbackExplanation({
    sport,
    homeTeam,
    awayTeam,
    selection: activePick?.selection || null,
    probability: activePick?.probability ?? null,
    tier: activePick?.confidenceTier ?? explanation.confidenceTier ?? null,
    noRecommendationReason: explanation.reasoning?.reason || null,
  });

  return {
    valid: false,
    issues,
    safeFallbackOneLine: fallback.oneLineSummary,
    safeFallbackFull: fallback.fullSummary,
  };
}
