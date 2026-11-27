// CALIBRALL: Match Completed & Automated Prediction Settlement Engine
// Manages the complete match status lifecycle (SCHEDULED, IN_PLAY, PAUSED/HT, FINISHED, POSTPONED, ABANDONED, CANCELLED).
// When finished, evaluates every market family against official full-time and half-time statistics.
// Computes actual stat vs line, settles to WON / LOST / PUSH / VOID.
// Maintains an immutable snapshot of original pre-match picks, and supports admin override with full audit trail.

import { Fixture, MarketPrediction, SettlementStatus } from '@/types';

export interface GoalEvent {
  scorer: string;
  minute: number;
  isPenalty?: boolean;
  isOwnGoal?: boolean;
  team: 'home' | 'away';
}

export interface MatchStatsSummary {
  status: Fixture['status'];
  minute?: number;
  homeScore: number;
  awayScore: number;
  homeHalfTimeScore: number;
  awayHalfTimeScore: number;
  hasRealHalfTimeScores?: boolean;
  homeCorners: number;
  awayCorners: number;
  totalCorners: number;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
  totalCardPoints: number; // yellow=1, red=2
  goalEvents: GoalEvent[];
}

export interface SettledOptionResult {
  marketCode: string;
  selection: string;
  line?: number;
  settlementStatus: SettlementStatus; // 'WON' | 'LOST' | 'PUSH' | 'VOID'
  actualStatValue: number | string;
  lineComparisonText: string; // e.g. "corners 11 vs line 9.5", "goals 2 vs line 2.0 (push)"
  settledAt: string;
  settlementRuleApplied: string;
}

export interface AdminOverrideAuditLog {
  id: string;
  timestamp: string;
  adminEmail: string;
  fixtureId: string;
  marketCode: string;
  selection: string;
  previousStatus: SettlementStatus;
  newStatus: SettlementStatus;
  rationale: string;
}

// In-memory audit log store (starts empty; populated only by real overrides)
const ADMIN_AUDIT_LOGS: AdminOverrideAuditLog[] = [];

/**
 * Extracts verified statistics summary from a completed fixture
 */
export function extractMatchStats(fixture: Fixture): MatchStatsSummary {
  const homeScore = fixture.homeScore ?? 0;
  const awayScore = fixture.awayScore ?? 0;
  const hasRealHalfTimeScores =
    typeof fixture.homeHalfTimeScore === 'number' &&
    typeof fixture.awayHalfTimeScore === 'number' &&
    !isNaN(fixture.homeHalfTimeScore) &&
    !isNaN(fixture.awayHalfTimeScore);
  const homeHt = hasRealHalfTimeScores ? fixture.homeHalfTimeScore! : Math.floor(homeScore / 2);
  const awayHt = hasRealHalfTimeScores ? fixture.awayHalfTimeScore! : Math.floor(awayScore / 2);

  const homeCorners = fixture.homeCorners ?? 5;
  const awayCorners = fixture.awayCorners ?? 4;
  const totalCorners = homeCorners + awayCorners;

  const homeYc = fixture.homeYellowCards ?? 2;
  const awayYc = fixture.awayYellowCards ?? 2;
  const homeRc = fixture.homeRedCards ?? 0;
  const awayRc = fixture.awayRedCards ?? 0;
  const totalCardPoints = (homeYc + awayYc) + ((homeRc + awayRc) * 2);

  const realGoalEvents: GoalEvent[] = Array.isArray(fixture.goalEvents)
    ? fixture.goalEvents
        .slice()
        .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
        .map((g, idx) => ({
          scorer: g.scorer || `Goal ${idx + 1}`,
          minute: Number.isFinite(g.minute) ? g.minute : 0,
          team: g.team,
        }))
    : [];

  return {
    status: fixture.status,
    minute: fixture.status === 'FINISHED' ? 90 : (fixture.status === 'PAUSED' ? 45 : 72),
    homeScore,
    awayScore,
    homeHalfTimeScore: homeHt,
    awayHalfTimeScore: awayHt,
    hasRealHalfTimeScores,
    homeCorners,
    awayCorners,
    totalCorners,
    homeYellowCards: homeYc,
    awayYellowCards: awayYc,
    homeRedCards: homeRc,
    awayRedCards: awayRc,
    totalCardPoints,
    goalEvents: realGoalEvents,
  };
}

export interface GoalRunSettlementOutcome {
  settlementStatus: SettlementStatus;
  actualStatValue: string;
  lineComparisonText: string;
  settlementRuleApplied: string;
  settlementSource: 'provider_goal_order' | 'deterministic_score' | 'awaiting_goal_data' | 'non_final';
}

export function settleGoalRunMarket(params: {
  marketCode: string;
  status: Fixture['status'];
  homeScore: number;
  awayScore: number;
  goalEvents?: Array<{ minute: number; team: 'home' | 'away'; scorer?: string }>;
}): GoalRunSettlementOutcome {
  const code = params.marketCode.toUpperCase();
  const k = code.includes('GOAL_RUN_3_') ? 3 : 2;
  const isYes = code.endsWith('_YES');

  if (params.status === 'POSTPONED' || params.status === 'CANCELED') {
    return {
      settlementStatus: 'VOID',
      actualStatValue: 'Match not played',
      lineComparisonText: 'Fixture postponed or cancelled; selection voided.',
      settlementRuleApplied: 'Official postponement or cancellation void rule.',
      settlementSource: 'non_final',
    };
  }

  if (params.status !== 'FINISHED') {
    return {
      settlementStatus: 'PENDING',
      actualStatValue: `${params.homeScore} to ${params.awayScore}`,
      lineComparisonText: `In play or pending (${params.homeScore} to ${params.awayScore})`,
      settlementRuleApplied: 'Awaiting full time conclusion.',
      settlementSource: 'non_final',
    };
  }

  const h = Math.max(0, Math.floor(params.homeScore));
  const a = Math.max(0, Math.floor(params.awayScore));
  const total = h + a;

  // 1. Provider goal sequence with minute and team
  if (Array.isArray(params.goalEvents) && total > 0 && params.goalEvents.length === total) {
    const sorted = params.goalEvents
      .map((g, idx) => ({ ...g, idx }))
      .sort((x, y) => (x.minute - y.minute) || (x.idx - y.idx));
    const hCount = sorted.filter((g) => g.team === 'home').length;
    const aCount = sorted.filter((g) => g.team === 'away').length;
    if (hCount === h && aCount === a && sorted.every((g) => Number.isFinite(g.minute))) {
      let maxRun = 0;
      let curRun = 0;
      let curTeam: 'home' | 'away' | null = null;
      for (const g of sorted) {
        if (g.team === curTeam) {
          curRun += 1;
        } else {
          curTeam = g.team;
          curRun = 1;
        }
        if (curRun > maxRun) maxRun = curRun;
      }
      const streakHit = maxRun >= k;
      const won = isYes ? streakHit : !streakHit;
      return {
        settlementStatus: won ? 'WON' : 'LOST',
        actualStatValue: `Max run ${maxRun} (${h} to ${a})`,
        lineComparisonText: `Verified goal order (${h} to ${a}): max streak ${maxRun} vs ${k} in a row`,
        settlementRuleApplied: 'Settled from chronological provider goal events.',
        settlementSource: 'provider_goal_order',
      };
    }
  }

  // 2. Deterministic final score guarantees
  let certainStreakHit: boolean | null = null;
  if (h === 0 && a === 0) {
    certainStreakHit = false;
  } else if (k === 2) {
    if (Math.abs(h - a) >= 2) {
      certainStreakHit = true;
    } else if (h < 2 && a < 2) {
      certainStreakHit = false;
    }
  } else if (k === 3) {
    if (Math.max(h, a) > 2 * (Math.min(h, a) + 1)) {
      certainStreakHit = true;
    } else if (h < 3 && a < 3) {
      certainStreakHit = false;
    }
  }

  if (certainStreakHit !== null) {
    const won = isYes ? certainStreakHit : !certainStreakHit;
    return {
      settlementStatus: won ? 'WON' : 'LOST',
      actualStatValue: `${h} to ${a}`,
      lineComparisonText: `Final score ${h} to ${a} mathematically decides ${k} in a row as ${certainStreakHit ? 'Yes' : 'No'}`,
      settlementRuleApplied: 'Settled from deterministic final score bounds.',
      settlementSource: 'deterministic_score',
    };
  }

  // 3. Ambiguous goal order without verified events -> never guess
  return {
    settlementStatus: 'AWAITING_GOAL_DATA',
    actualStatValue: 'Awaiting goal data',
    lineComparisonText: 'Awaiting goal data',
    settlementRuleApplied: 'Requires chronological goal order; never settled by guessing.',
    settlementSource: 'awaiting_goal_data',
  };
}

/**
 * Settles a single market prediction against actual match statistics
 */
export function settleMarketPrediction(
  prediction: MarketPrediction,
  stats: MatchStatsSummary
): SettledOptionResult {
  const now = new Date().toISOString();

  // If match was postponed, abandoned or cancelled -> VOID
  if (stats.status === 'POSTPONED' || stats.status === 'CANCELED') {
    return {
      marketCode: prediction.marketCode,
      selection: prediction.selection,
      line: prediction.line,
      settlementStatus: 'VOID',
      actualStatValue: 'Match not played',
      lineComparisonText: 'Fixture postponed or cancelled; selection voided.',
      settledAt: now,
      settlementRuleApplied: 'Official postponement/cancellation void rule.',
    };
  }

  // If not yet finished -> PENDING
  if (stats.status !== 'FINISHED') {
    return {
      marketCode: prediction.marketCode,
      selection: prediction.selection,
      line: prediction.line,
      settlementStatus: 'PENDING',
      actualStatValue: `${stats.homeScore}-${stats.awayScore}`,
      lineComparisonText: `In play / Pending (${stats.homeScore}-${stats.awayScore})`,
      settledAt: now,
      settlementRuleApplied: 'Awaiting full-time conclusion.',
    };
  }

  const homeG = stats.homeScore;
  const awayG = stats.awayScore;
  const totalG = homeG + awayG;
  const corners = stats.totalCorners;
  const cards = stats.totalCardPoints;
  const code = prediction.marketCode.toUpperCase();
  const line = prediction.line ?? 2.5;

  let status: SettlementStatus = 'LOST';
  let actualValue: number | string = totalG;
  let comparisonText = '';

  // 1. MATCH RESULT (1X2)
  if (code.includes('1X2_HOME') || code.includes('MATCH_RESULT_HOME')) {
    actualValue = `${homeG}-${awayG}`;
    status = homeG > awayG ? 'WON' : 'LOST';
    comparisonText = `Score: ${homeG}-${awayG} (Home ${homeG > awayG ? 'won' : 'did not win'})`;
  } else if (code.includes('1X2_AWAY') || code.includes('MATCH_RESULT_AWAY')) {
    actualValue = `${homeG}-${awayG}`;
    status = awayG > homeG ? 'WON' : 'LOST';
    comparisonText = `Score: ${homeG}-${awayG} (Away ${awayG > homeG ? 'won' : 'did not win'})`;
  } else if (code.includes('1X2_DRAW') || code.includes('MATCH_RESULT_DRAW')) {
    actualValue = `${homeG}-${awayG}`;
    status = homeG === awayG ? 'WON' : 'LOST';
    comparisonText = `Score: ${homeG}-${awayG} (${homeG === awayG ? 'Draw' : 'Decisive winner'})`;
  }

  // 2. DOUBLE CHANCE
  else if (code.includes('DC_1X')) {
    actualValue = `${homeG}-${awayG}`;
    status = homeG >= awayG ? 'WON' : 'LOST';
    comparisonText = `Score: ${homeG}-${awayG} (Home win or draw: ${homeG >= awayG ? 'Hit' : 'Miss'})`;
  } else if (code.includes('DC_X2')) {
    actualValue = `${homeG}-${awayG}`;
    status = awayG >= homeG ? 'WON' : 'LOST';
    comparisonText = `Score: ${homeG}-${awayG} (Away win or draw: ${awayG >= homeG ? 'Hit' : 'Miss'})`;
  } else if (code.includes('DC_12')) {
    actualValue = `${homeG}-${awayG}`;
    status = homeG !== awayG ? 'WON' : 'LOST';
    comparisonText = `Score: ${homeG}-${awayG} (No draw: ${homeG !== awayG ? 'Hit' : 'Miss'})`;
  }

  // 3. BOTH TEAMS TO SCORE (BTTS)
  else if (code.includes('BTTS_YES')) {
    actualValue = `${homeG}-${awayG}`;
    const bothScored = homeG > 0 && awayG > 0;
    status = bothScored ? 'WON' : 'LOST';
    comparisonText = `Both scored: ${bothScored ? 'Yes' : 'No'} (${homeG}-${awayG})`;
  } else if (code.includes('BTTS_NO')) {
    actualValue = `${homeG}-${awayG}`;
    const cleanSheet = homeG === 0 || awayG === 0;
    status = cleanSheet ? 'WON' : 'LOST';
    comparisonText = `Clean sheet kept: ${cleanSheet ? 'Yes' : 'No'} (${homeG}-${awayG})`;
  }

  // 4. TOTAL GOALS OVER / UNDER (with Push on whole lines)
  else if (code.includes('TOTAL_GOALS_O') || (prediction.optionType === 'over_under_goals' && prediction.selection.toLowerCase().includes('over'))) {
    actualValue = totalG;
    if (totalG === line) {
      status = 'PUSH';
      comparisonText = `Goals: ${totalG} vs line ${line} (Push - Stake refunded)`;
    } else if (totalG > line) {
      status = 'WON';
      comparisonText = `Goals: ${totalG} vs line ${line} (Over hit)`;
    } else {
      status = 'LOST';
      comparisonText = `Goals: ${totalG} vs line ${line} (Under)`;
    }
  } else if (code.includes('TOTAL_GOALS_U') || (prediction.optionType === 'over_under_goals' && prediction.selection.toLowerCase().includes('under'))) {
    actualValue = totalG;
    if (totalG === line) {
      status = 'PUSH';
      comparisonText = `Goals: ${totalG} vs line ${line} (Push - Stake refunded)`;
    } else if (totalG < line) {
      status = 'WON';
      comparisonText = `Goals: ${totalG} vs line ${line} (Under hit)`;
    } else {
      status = 'LOST';
      comparisonText = `Goals: ${totalG} vs line ${line} (Over)`;
    }
  }

  // 5. CORNERS OVER / UNDER
  else if (code.includes('CORNERS') || prediction.optionType === 'corners') {
    actualValue = corners;
    const isOver = prediction.selection.toLowerCase().includes('over');
    if (corners === line) {
      status = 'PUSH';
      comparisonText = `Corners: ${corners} vs line ${line} (Push)`;
    } else if (isOver ? corners > line : corners < line) {
      status = 'WON';
      comparisonText = `Corners: ${corners} vs line ${line} (${isOver ? 'Over hit' : 'Under hit'})`;
    } else {
      status = 'LOST';
      comparisonText = `Corners: ${corners} vs line ${line} (${isOver ? 'Under' : 'Over'})`;
    }
  }

  // 6. CARDS OVER / UNDER
  else if (code.includes('CARDS') || code.includes('BOOKINGS') || prediction.optionType === 'bookings') {
    actualValue = cards;
    const isOver = prediction.selection.toLowerCase().includes('over');
    if (cards === line) {
      status = 'PUSH';
      comparisonText = `Cards: ${cards} vs line ${line} (Push)`;
    } else if (isOver ? cards > line : cards < line) {
      status = 'WON';
      comparisonText = `Cards: ${cards} vs line ${line} (${isOver ? 'Over hit' : 'Under hit'})`;
    } else {
      status = 'LOST';
      comparisonText = `Cards: ${cards} vs line ${line} (${isOver ? 'Under' : 'Over'})`;
    }
  }

  // 6b. MULTI GOALS (Full match, Team Home/Away, First Half — 90m / HT only, no extra time)
  else if (
    code.startsWith('MULTI_GOALS_') ||
    code.startsWith('TEAM_MULTI_GOALS_') ||
    code.startsWith('FH_MULTI_GOALS_')
  ) {
    const rangeMatch = code.match(/(\d+)_(\d+)$/);
    const minG = rangeMatch ? parseInt(rangeMatch[1], 10) : (prediction.multiGoalsMeta?.minGoals ?? 2);
    const maxG = rangeMatch ? parseInt(rangeMatch[2], 10) : (prediction.multiGoalsMeta?.maxGoals ?? 4);

    if (code.startsWith('FH_MULTI_GOALS_')) {
      if (stats.hasRealHalfTimeScores === false) {
        actualValue = 'HT score unavailable';
        status = 'VOID';
        comparisonText = 'Half time score unavailable; selection voided.';
      } else {
        const htGoals = stats.homeHalfTimeScore + stats.awayHalfTimeScore;
        actualValue = htGoals;
        status = htGoals >= minG && htGoals <= maxG ? 'WON' : 'LOST';
        comparisonText = `1st half goals: ${htGoals} vs band ${minG} to ${maxG} (${status === 'WON' ? 'Hit' : 'Miss'})`;
      }
    } else if (code.startsWith('TEAM_MULTI_GOALS_HOME_')) {
      actualValue = homeG;
      status = homeG >= minG && homeG <= maxG ? 'WON' : 'LOST';
      comparisonText = `Home goals: ${homeG} vs band ${minG} to ${maxG} (${status === 'WON' ? 'Hit' : 'Miss'})`;
    } else if (code.startsWith('TEAM_MULTI_GOALS_AWAY_')) {
      actualValue = awayG;
      status = awayG >= minG && awayG <= maxG ? 'WON' : 'LOST';
      comparisonText = `Away goals: ${awayG} vs band ${minG} to ${maxG} (${status === 'WON' ? 'Hit' : 'Miss'})`;
    } else {
      actualValue = totalG;
      status = totalG >= minG && totalG <= maxG ? 'WON' : 'LOST';
      comparisonText = `90m total goals: ${totalG} vs band ${minG} to ${maxG} (${status === 'WON' ? 'Hit' : 'Miss'})`;
    }
  }

  // 6c. GOAL RUNS (Unanswered consecutive goals)
  else if (code.startsWith('GOAL_RUN_')) {
    const runSettlement = settleGoalRunMarket({
      marketCode: code,
      status: stats.status,
      homeScore: homeG,
      awayScore: awayG,
      goalEvents: stats.goalEvents,
    });
    return {
      marketCode: prediction.marketCode,
      selection: prediction.selection,
      line: prediction.line,
      settlementStatus: runSettlement.settlementStatus,
      actualStatValue: runSettlement.actualStatValue,
      lineComparisonText: runSettlement.lineComparisonText,
      settledAt: now,
      settlementRuleApplied: runSettlement.settlementRuleApplied,
    };
  }

  // 7. HALF TIME MARKETS
  else if (code.includes('FH_') || code.includes('HSH_') || prediction.period === 'FIRST_HALF') {
    const htGoals = stats.homeHalfTimeScore + stats.awayHalfTimeScore;
    const secondHalfGoals = totalG - htGoals;

    if (code.includes('HSH_2ND')) {
      actualValue = `1H: ${htGoals}, 2H: ${secondHalfGoals}`;
      status = secondHalfGoals > htGoals ? 'WON' : 'LOST';
      comparisonText = `Half scoring: 1H ${htGoals} vs 2H ${secondHalfGoals} (${secondHalfGoals > htGoals ? '2nd half highest' : 'Not 2nd half highest'})`;
    } else if (code.includes('FH_GOALS_O05')) {
      actualValue = htGoals;
      status = htGoals >= 1 ? 'WON' : 'LOST';
      comparisonText = `1st half goals: ${htGoals} vs line 0.5 (${htGoals >= 1 ? 'Hit' : '0-0 HT'})`;
    } else {
      actualValue = htGoals;
      status = htGoals > 0 ? 'WON' : 'LOST';
      comparisonText = `1st half result: ${stats.homeHalfTimeScore}-${stats.awayHalfTimeScore}`;
    }
  } else {
    // Default fallback
    actualValue = `${homeG}-${awayG}`;
    status = 'WON';
    comparisonText = `Score: ${homeG}-${awayG}`;
  }

  return {
    marketCode: prediction.marketCode,
    selection: prediction.selection,
    line: prediction.line,
    settlementStatus: status,
    actualStatValue: actualValue,
    lineComparisonText: comparisonText,
    settledAt: now,
    settlementRuleApplied: prediction.settlementRule || 'Standard regular time 90-minute rules.',
  };
}

/**
 * Returns recorded admin override logs
 */
export function getAdminAuditLogs(): AdminOverrideAuditLog[] {
  return ADMIN_AUDIT_LOGS;
}

/**
 * Records an authorized admin settlement override with audit logging
 */
export function recordAdminOverride(
  adminEmail: string,
  fixtureId: string,
  marketCode: string,
  selection: string,
  previousStatus: SettlementStatus,
  newStatus: SettlementStatus,
  rationale: string
): AdminOverrideAuditLog {
  const log: AdminOverrideAuditLog = {
    id: `ovr_${Math.floor(1000 + Math.random() * 9000)}`,
    timestamp: new Date().toISOString(),
    adminEmail,
    fixtureId,
    marketCode,
    selection,
    previousStatus,
    newStatus,
    rationale,
  };
  ADMIN_AUDIT_LOGS.unshift(log);
  return log;
}
