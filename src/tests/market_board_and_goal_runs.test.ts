// CALIBRALL: Market Board & Goal Runs Test Suite
// Verifies Part 3 (Market board probabilities, exact 4 reasons, tier gating, single source of truth)
// and Part 4 (Goal runs DP + Poisson mixture, Experimental/Speculative gating, no EV/odds,
// 3-tier settlement order + Awaiting goal data, Slip Builder, and zero-hyphen text compliance).

import assert from 'node:assert/strict';
import { probRunAtLeastK, calculateGoalRunProbability } from '../lib/prediction/math';
import { DixonColesV25Evaluator } from '../lib/prediction/v25/v25Evaluator';
import { selectDiversifiedSlatePicks } from '../lib/prediction/marketSelection';
import { settleGoalRunMarket, settleMarketPrediction } from '../lib/prediction/settlementEngine';
import {
  buildFootballMarketBoard,
  generateFootballExplanation,
  syncSlateExplanations,
} from '../lib/prediction/explanationGenerator';
import { redactExplanationForTier } from '../lib/auth/tierAccess';
import { buildSlipCandidatesFromEvaluatedSlates } from '../lib/slips/candidateBuilder';
import { settleSingleLeg } from '../lib/slips/dailySlipRecord';
import { TIER_RULES } from '../lib/tiers';
import type { Fixture, FixtureContext, MarketBoardReason, MarketPrediction } from '../types';

const ALLOWED_MARKET_BOARD_REASONS = new Set<MarketBoardReason>([
  'below the confidence threshold',
  'not enough history',
  'no data for this market',
  'disabled by policy',
]);

function assertNoHyphensOrUnderscores(value: string | undefined | null, label: string) {
  if (!value) return;
  assert.ok(!value.includes('-'), `[${label}] unexpected hyphen in "${value}"`);
  assert.ok(!value.includes('_'), `[${label}] unexpected underscore in "${value}"`);
}

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'fix_mb_gr_1',
    sport: 'football',
    externalId: 'ext_1',
    competition: {
      id: 'comp_pl',
      name: 'Premier League',
      code: 'PL',
      country: 'England',
    },
    homeTeam: {
      id: 't_home',
      name: 'Arsenal',
      shortName: 'ARS',
      tla: 'ARS',
      crestUrl: '',
    },
    awayTeam: {
      id: 't_away',
      name: 'Brentford',
      shortName: 'BRE',
      tla: 'BRE',
      crestUrl: '',
    },
    kickoffTime: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'TIMED',
    matchday: 25,
    ...overrides,
  };
}

function makeContext(overrides: Partial<FixtureContext> = {}): FixtureContext {
  return {
    fixtureId: 'fix_mb_gr_1',
    homeTeamName: 'Arsenal',
    awayTeamName: 'Brentford',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.55,
    homeDefenseRating: 0.72,
    awayAttackRating: 0.85,
    awayDefenseRating: 1.25,
    homeXg: 2.15,
    awayXg: 0.78,
    expectedCornersHome: 6.4,
    expectedCornersAway: 3.1,
    expectedCards: 3.6,
    homeAvgScored: 2.2,
    homeAvgConceded: 0.8,
    awayAvgScored: 1.1,
    awayAvgConceded: 1.6,
    homeRecentTotals: [3, 2, 4, 2, 3, 1, 3, 2, 4, 2],
    awayRecentTotals: [2, 3, 2, 4, 3, 2, 1, 3, 2, 3],
    homeRecentGoals: [2, 1, 3, 2, 2, 1, 2, 2, 3, 1],
    awayRecentGoals: [1, 1, 0, 1, 1, 2, 0, 1, 1, 0],
    halfTimeSampleCount: 20,
    uncertaintyScore: 0.05,
    dataCoverageScore: 0.96,
    sampleSizeMatches: 22,
    homeSampleMatches: 22,
    awaySampleMatches: 22,
    lineupConfirmed: true,
    stateTags: [],
    verifiedOdds: {
      homeWin: 1.48,
      draw: 4.5,
      awayWin: 6.8,
      over25Goals: 1.78,
      under25Goals: 2.05,
      bttsYes: 1.95,
      bttsNo: 1.85,
      bookmakerName: 'EU Bookmaker Consensus',
      observedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    },
    ...overrides,
  };
}

function bruteForceRunAtLeastK(n: number, p: number, k: number): number {
  if (n < k) return 0;
  let total = 0;
  const maxMask = 1 << n;
  for (let mask = 0; mask < maxMask; mask++) {
    let run = 0;
    let bestRun = 0;
    let lastBit = -1;
    let prob = 1;
    for (let i = 0; i < n; i++) {
      const bit = (mask >> i) & 1;
      prob *= bit === 1 ? p : 1 - p;
      if (bit === lastBit) {
        run += 1;
      } else {
        lastBit = bit;
        run = 1;
      }
      if (run > bestRun) bestRun = run;
    }
    if (bestRun >= k) total += prob;
  }
  return total;
}

function runTests() {
  console.log('--- RUNNING MARKET BOARD & GOAL RUNS TESTS ---');

  // 1. Exact DP vs brute-force sequence enumeration
  for (const n of [0, 1, 2, 3, 4, 5, 8]) {
    for (const k of [2, 3]) {
      for (const p of [0.5, 0.72, 0.25, 0.99]) {
        const dpVal = probRunAtLeastK(n, p, k);
        const bfVal = bruteForceRunAtLeastK(n, p, k);
        assert.ok(
          Math.abs(dpVal - bfVal) < 1e-12,
          `DP mismatch for n=${n}, p=${p}, k=${k}: dp=${dpVal}, bf=${bfVal}`
        );
      }
    }
  }

  const run2 = calculateGoalRunProbability(2.15, 0.78, 2);
  const run3 = calculateGoalRunProbability(2.15, 0.78, 3);
  assert.ok(run2.yesProb > 0 && run2.yesProb < 1, 'Run 2 probability in (0, 1)');
  assert.ok(Math.abs(run2.yesProb + run2.noProb - 1) < 1e-6, 'Run 2 Yes/No probabilities sum to 1');
  assert.ok(run3.yesProb > 0 && run3.yesProb < run2.yesProb, 'P(run>=3) < P(run>=2)');
  assert.ok(Math.abs(run2.totalLambda - 2.93) < 1e-9, 'Total expected goals matches sum');

  // 2. Evaluator emits Goal Runs as Speculative/Experimental, never HIGH, no bookmaker odds or EV
  const ctx = makeContext();
  const evalRes = DixonColesV25Evaluator.evaluateFixture(ctx);
  const goalRunPicks = evalRes.predictions.filter((p) => p.optionType === 'goal_runs');
  assert.equal(goalRunPicks.length, 4, 'Emits 4 Goal Runs lines (2 Yes/No, 3 Yes/No)');

  for (const gp of goalRunPicks) {
    assert.equal(gp.isSpeculative, true, `${gp.marketCode} must be speculative`);
    assert.equal(gp.experimentalLabel, 'Experimental', `${gp.marketCode} must be labelled Experimental`);
    assert.equal(gp.isValidated, false, `${gp.marketCode} unvalidated before 100 settled`);
    assert.equal(gp.rankingScore, 0, `${gp.marketCode} rankingScore 0 so not topPick`);
    assert.notEqual(gp.confidenceTier, 'HIGH', `${gp.marketCode} must never be HIGH tier`);
    assert.equal(gp.marketOdds, undefined, `${gp.marketCode} has no marketOdds`);
    assert.equal(gp.expectedValue, null, `${gp.marketCode} has no EV`);
    assert.equal(gp.priceSource, 'Probability only, no market price');
    assert.ok(
      gp.plainEnglishReason?.toLowerCase().includes('no in game score effects'),
      `${gp.marketCode} states independent goal assumption`
    );
    assertNoHyphensOrUnderscores(gp.selection, `${gp.marketCode}.selection`);
    assertNoHyphensOrUnderscores(gp.marketName, `${gp.marketCode}.marketName`);
    assertNoHyphensOrUnderscores(gp.plainEnglishReason, `${gp.marketCode}.plainEnglishReason`);
  }

  assert.notEqual(evalRes.topPick?.optionType, 'goal_runs', 'Goal runs cannot be default topPick');

  // Extreme lopsided xG: even when Goal Run 2 Yes > 90%, confidenceTier must still not be HIGH
  const lopsidedEval = DixonColesV25Evaluator.evaluateFixture(
    makeContext({ homeXg: 4.5, awayXg: 0.25 })
  );
  const lopsidedGr = lopsidedEval.predictions.filter((p) => p.optionType === 'goal_runs');
  for (const gp of lopsidedGr) {
    assert.notEqual(gp.confidenceTier, 'HIGH', 'Goal runs capped below HIGH even at extreme probability');
  }

  // 3. Settlement 3-tier order of reliability
  // 3a. Chronological goalEvents
  const sGoalOrderHit = settleGoalRunMarket({
    marketCode: 'GOAL_RUN_2_YES',
    status: 'FINISHED',
    homeScore: 2,
    awayScore: 2,
    goalEvents: [
      { minute: 12, team: 'away' },
      { minute: 30, team: 'home' },
      { minute: 55, team: 'home' },
      { minute: 70, team: 'away' },
    ],
  });
  assert.equal(sGoalOrderHit.settlementStatus, 'WON');
  assert.equal(sGoalOrderHit.settlementSource, 'provider_goal_order');

  const sGoalOrderAltMiss = settleGoalRunMarket({
    marketCode: 'GOAL_RUN_2_YES',
    status: 'FINISHED',
    homeScore: 2,
    awayScore: 2,
    goalEvents: [
      { minute: 10, team: 'home' },
      { minute: 20, team: 'away' },
      { minute: 40, team: 'home' },
      { minute: 80, team: 'away' },
    ],
  });
  assert.equal(sGoalOrderAltMiss.settlementStatus, 'LOST');
  assert.equal(sGoalOrderAltMiss.settlementSource, 'provider_goal_order');

  // 3b. Deterministic final score rules
  const det2Diff = settleGoalRunMarket({
    marketCode: 'GOAL_RUN_2_YES',
    status: 'FINISHED',
    homeScore: 3,
    awayScore: 1,
  });
  assert.equal(det2Diff.settlementStatus, 'WON');
  assert.equal(det2Diff.settlementSource, 'deterministic_score');

  const det00 = settleGoalRunMarket({
    marketCode: 'GOAL_RUN_2_NO',
    status: 'FINISHED',
    homeScore: 0,
    awayScore: 0,
  });
  assert.equal(det00.settlementStatus, 'WON');
  assert.equal(det00.settlementSource, 'deterministic_score');

  const det11 = settleGoalRunMarket({
    marketCode: 'GOAL_RUN_2_YES',
    status: 'FINISHED',
    homeScore: 1,
    awayScore: 1,
  });
  assert.equal(det11.settlementStatus, 'LOST');
  assert.equal(det11.settlementSource, 'deterministic_score');

  const det3Yes = settleGoalRunMarket({
    marketCode: 'GOAL_RUN_3_YES',
    status: 'FINISHED',
    homeScore: 5,
    awayScore: 1,
  });
  assert.equal(det3Yes.settlementStatus, 'WON');
  assert.equal(det3Yes.settlementSource, 'deterministic_score');

  const det3NoLow = settleGoalRunMarket({
    marketCode: 'GOAL_RUN_3_NO',
    status: 'FINISHED',
    homeScore: 2,
    awayScore: 2,
  });
  assert.equal(det3NoLow.settlementStatus, 'WON');
  assert.equal(det3NoLow.settlementSource, 'deterministic_score');

  // 3c. Ambiguous scores WITHOUT goalEvents -> AWAITING_GOAL_DATA, never guessed
  const ambig21 = settleGoalRunMarket({
    marketCode: 'GOAL_RUN_2_YES',
    status: 'FINISHED',
    homeScore: 2,
    awayScore: 1,
  });
  assert.equal(ambig21.settlementStatus, 'AWAITING_GOAL_DATA');
  assert.equal(ambig21.settlementSource, 'awaiting_goal_data');
  assertNoHyphensOrUnderscores(ambig21.lineComparisonText, 'ambig21.lineComparisonText');

  const ambig31For3 = settleGoalRunMarket({
    marketCode: 'GOAL_RUN_3_NO',
    status: 'FINISHED',
    homeScore: 3,
    awayScore: 1,
  });
  assert.equal(ambig31For3.settlementStatus, 'AWAITING_GOAL_DATA');
  assert.equal(ambig31For3.settlementSource, 'awaiting_goal_data');

  const goalRun2YesPick = goalRunPicks.find((p) => p.marketCode === 'GOAL_RUN_2_YES');
  assert.ok(goalRun2YesPick, 'GOAL_RUN_2_YES prediction exists');
  const predSettled = settleMarketPrediction(goalRun2YesPick, {
    status: 'FINISHED',
    minute: 90,
    homeScore: 2,
    awayScore: 1,
    homeHalfTimeScore: 1,
    awayHalfTimeScore: 1,
    hasRealHalfTimeScores: true,
    homeCorners: 5,
    awayCorners: 4,
    totalCorners: 9,
    homeYellowCards: 2,
    awayYellowCards: 2,
    homeRedCards: 0,
    awayRedCards: 0,
    totalCardPoints: 4,
    goalEvents: [],
  });
  assert.equal(predSettled.settlementStatus, 'AWAITING_GOAL_DATA');

  // 4. Market board & tier redaction & Pro feature list & single source of truth
  assert.ok(
    TIER_RULES.pro.features.some((f) => f.toLowerCase().includes('market board')),
    'Pro feature list includes Market board'
  );
  assert.ok(
    TIER_RULES.pro.features.some((f) => f.toLowerCase().includes('goal runs')),
    'Pro feature list includes Goal runs'
  );

  const fixture = makeFixture();
  const fullExplanation = generateFootballExplanation({
    fixture,
    evaluation: evalRes,
    context: ctx,
  });

  assert.ok(
    Array.isArray(fullExplanation.marketBoard) && fullExplanation.marketBoard.length > 10,
    'Market board populated on full explanation'
  );

  const board = fullExplanation.marketBoard!;
  assert.ok(
    board.some((b) => b.marketCode === 'CARDS_UNDER' && !b.recommended && b.reasonNotRecommended === 'disabled by policy'),
    'Market board includes CARDS_UNDER with disabled by policy'
  );
  assert.ok(
    board.some((b) => b.marketCode === 'GOAL_RUN_2_YES' && b.isExperimental),
    'Market board includes Goal Runs entries marked Experimental'
  );
  for (const entry of board) {
    assertNoHyphensOrUnderscores(entry.selection, `board.${entry.marketCode}.selection`);
    assertNoHyphensOrUnderscores(entry.marketName, `board.${entry.marketCode}.marketName`);
    assertNoHyphensOrUnderscores(entry.reasonNotRecommended, `board.${entry.marketCode}.reason`);
    if (!entry.recommended) {
      assert.ok(
        entry.reasonNotRecommended && ALLOWED_MARKET_BOARD_REASONS.has(entry.reasonNotRecommended),
        `Invalid non-recommended reason on ${entry.marketCode}: ${entry.reasonNotRecommended}`
      );
    }
  }

  // Thin sample -> "not enough history"
  const thinCtx = makeContext({
    insufficientData: true,
    sampleSizeMatches: 4,
    homeSampleMatches: 4,
    awaySampleMatches: 4,
  });
  const thinEval = DixonColesV25Evaluator.evaluateFixture(thinCtx);
  const thinBoard = buildFootballMarketBoard({
    fixture,
    predictions: thinEval.predictions,
    topPick: thinEval.topPick,
    context: thinCtx,
    isThinHistory: true,
  });
  assert.ok(
    thinBoard.some((b) => b.reasonNotRecommended === 'not enough history'),
    'Thin history reports "not enough history"'
  );

  // Missing corners/cards/half-time league data -> "no data for this market"
  const noMarketDataCtx = makeContext({
    leagueCapabilities: {
      leagueCode: 'PL',
      hasHalfTimeGoals: false,
      hasCorners: false,
      hasCards: false,
      hasReferee: false,
      hasAsianHandicapPrices: false,
      sampleSizeMatches: 22,
    },
  });
  const noDataEval = DixonColesV25Evaluator.evaluateFixture(noMarketDataCtx);
  const noDataBoard = buildFootballMarketBoard({
    fixture,
    predictions: noDataEval.predictions,
    topPick: noDataEval.topPick,
    context: noMarketDataCtx,
  });
  assert.ok(
    noDataBoard.some((b) => b.reasonNotRecommended === 'no data for this market'),
    'Missing corners/cards/half data reports "no data for this market"'
  );

  // Free tier hides Market board, Pro unlocks it
  const freeRedacted = redactExplanationForTier(fullExplanation, 'free', 0)!;
  assert.equal(freeRedacted.tierLocked, true);
  assert.deepEqual(freeRedacted.marketBoard, [], 'Free users must never receive Market board');

  const proUnlocked = redactExplanationForTier(fullExplanation, 'pro', 5)!;
  assert.equal(proUnlocked.tierLocked, false);
  assert.equal(proUnlocked.marketBoard?.length, board.length, 'Pro receives full Market board');

  // Single source of truth: when slate diversification swaps topPick, marketBoard stays synced
  const swappedAlt = evalRes.predictions.find(
    (p) =>
      p.marketCode !== evalRes.topPick?.marketCode &&
      p.optionType !== 'goal_runs' &&
      !p.isSpeculative &&
      (p.calibratedProbability ?? p.modelProbability) >= 0.55
  ) as MarketPrediction;
  assert.ok(swappedAlt, 'Alternate non-speculative pick available for swap test');
  const synced = syncSlateExplanations([
    {
      fixture,
      context: ctx,
      topPick: swappedAlt,
      predictions: evalRes.predictions,
      noRecommendationReason: undefined,
      writtenExplanation: fullExplanation,
    },
  ]);
  const syncedExpl = synced[0].writtenExplanation!;
  assert.equal(syncedExpl.activePickMarketCode, swappedAlt.marketCode);
  assert.ok(
    syncedExpl.marketBoard?.some(
      (b) => b.marketCode === swappedAlt.marketCode && b.recommended === true
    ),
    'Synced Market board marks active swapped pick as recommended'
  );

  // Also test selectDiversifiedSlatePicks does not select goal_runs as topPick/alternative
  const divRes = selectDiversifiedSlatePicks([
    {
      fixtureId: fixture.id,
      topPick: evalRes.topPick,
      predictions: evalRes.predictions,
      noRecommendationReason: evalRes.noRecommendationReason,
    },
  ]);
  assert.notEqual(divRes[0].topPick?.optionType, 'goal_runs', 'Diversification never swaps in goal_runs');

  // 5. Slip Builder: Goal runs included only in model_fair (never in real), and Awaiting goal data settlement
  const realBasis = buildSlipCandidatesFromEvaluatedSlates({
    input: {
      day: 'today',
      sport: 'football',
      competitionIds: [],
      markets: ['goal_runs'],
      oddsBasis: 'real',
      bestPriceComparison: false,
      nowMs: Date.now(),
    },
    footballEntries: [
      {
        fixture,
        context: ctx,
        evalResult: evalRes,
        snapshots: [],
      },
    ],
    basketballEntries: [],
    flaggedFixtureIds: new Set(),
    skipDayFilter: true,
  });
  assert.equal(realBasis.candidates.length, 0, 'Goal runs excluded when oddsBasis === real');

  const modelFairBasis = buildSlipCandidatesFromEvaluatedSlates({
    input: {
      day: 'today',
      sport: 'football',
      competitionIds: [],
      markets: ['goal_runs'],
      oddsBasis: 'model_fair',
      bestPriceComparison: false,
      nowMs: Date.now(),
    },
    footballEntries: [
      {
        fixture,
        context: ctx,
        evalResult: evalRes,
        snapshots: [],
      },
    ],
    basketballEntries: [],
    flaggedFixtureIds: new Set(),
    skipDayFilter: true,
  });
  assert.ok(modelFairBasis.candidates.length >= 1, 'Goal runs included in model_fair mode');
  for (const leg of modelFairBasis.candidates) {
    assert.equal(leg.marketGroup, 'goal_runs');
    assert.equal(leg.isExperimental, true);
    assert.equal(leg.oddsSourceType, 'model_fair');
    assert.equal(leg.expectedValue, null);
    assert.equal(leg.confidenceTier, 'MEDIUM');
  }

  const slipLegAmbig = settleSingleLeg(
    {
      matchId: fixture.id,
      sport: 'football',
      matchLabel: 'Arsenal vs Brentford',
      competitionId: 'pl',
      competitionCode: 'PL',
      competitionName: 'Premier League',
      kickoffTime: fixture.kickoffTime,
      marketCode: 'GOAL_RUN_2_YES',
      marketName: 'Goal runs',
      selection: 'Any team scores 2 goals in a row: Yes',
      line: 2,
      decimalOdds: 1.55,
      oddsSourceType: 'model_fair',
      bookmakerName: 'Model fair price',
      priceAgeLabel: 'Model fair odds, not a bookmaker price',
      calibratedProbability: 0.65,
      confidenceTier: 'MEDIUM',
      isExperimental: true,
      oneLineWhy: 'Expected goals 2.15 vs 0.78.',
      legStatus: 'PENDING',
    },
    {
      id: fixture.id,
      sport: 'football',
      status: 'FINISHED',
      homeScore: 2,
      awayScore: 1,
    }
  );
  assert.equal(slipLegAmbig.legStatus, 'PENDING', 'Ambiguous 2-1 slip leg stays PENDING without goalEvents');
  assert.equal(slipLegAmbig.settledScore, 'Awaiting goal data');

  console.log('✅ All Market Board & Goal Runs tests passed!');
}

runTests();
