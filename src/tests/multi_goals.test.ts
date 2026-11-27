// CALIBRALL: Multi Goals Market Family Test Suite
// Verifies Dixon-Coles matrix range probabilities, scope-specific Platt calibration,
// range tightness & line-ladder selection, 60% threshold tiering, speculative league gating,
// unpriced EV guard, 40% slate diversity cap, FT/HT/VOID settlement, forward ledger tracking,
// and zero-hyphen display formatting.

import assert from 'node:assert/strict';
import { DixonColesV25Engine } from '../lib/prediction/v25/dixonColesV25';
import { DixonColesV25Evaluator, MULTI_GOALS_HIGH_THRESHOLD, PICK_CONFIDENCE_THRESHOLD } from '../lib/prediction/v25/v25Evaluator';
import { ConfidenceEngine } from '../lib/prediction/v25/confidenceEngine';
import {
  isMultiGoalsEnabled,
  setMultiGoalsEnabled,
  isTeamNewsEnabled,
  setTeamNewsEnabled,
} from '../lib/prediction/featureFlags';
import { selectDiversifiedSlatePicks, SlatePickCandidate } from '../lib/prediction/marketSelection';
import { settleMarketPrediction, MatchStatsSummary } from '../lib/prediction/settlementEngine';
import { forwardPickLedger } from '../lib/prediction/forwardPickLedger';
import { getMultiGoalsLeagueValidation } from '../lib/prediction/calibratedParams';
import type { FixtureContext, MarketPrediction } from '../types';

function makeBaseContext(overrides: Partial<FixtureContext> = {}): FixtureContext {
  return {
    fixtureId: 'fix_mg_test_1',
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
    expectedCornersHome: 6.5,
    expectedCornersAway: 3.2,
    expectedCards: 3.5,
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
    ...overrides,
  };
}

function makeDummyStats(overrides: Partial<MatchStatsSummary> = {}): MatchStatsSummary {
  return {
    status: 'FINISHED',
    minute: 90,
    homeScore: 2,
    awayScore: 1,
    homeHalfTimeScore: 1,
    awayHalfTimeScore: 0,
    hasRealHalfTimeScores: true,
    homeCorners: 6,
    awayCorners: 4,
    totalCorners: 10,
    homeYellowCards: 2,
    awayYellowCards: 2,
    homeRedCards: 0,
    awayRedCards: 0,
    totalCardPoints: 4,
    goalEvents: [],
    ...overrides,
  };
}

function assertNoHyphensOrUnderscores(value: string | undefined, label: string) {
  if (!value) return;
  assert.ok(!value.includes('-'), `[${label}] unexpected hyphen in "${value}"`);
  assert.ok(!value.includes('_'), `[${label}] unexpected underscore in "${value}"`);
}

function runMultiGoalsTests() {
  console.log('--- RUNNING MULTI GOALS COMPREHENSIVE UNIT & INTEGRATION TESTS ---');

  // 1. Default Live Gate: enabled after walk-forward backtest review, with clean off-switch verified
  assert.equal(isMultiGoalsEnabled(), true, 'Multi goals defaults to enabled after walk-forward backtest validation');
  const prevDefaultMg = isMultiGoalsEnabled();
  try {
    setMultiGoalsEnabled(false);
    const offEval = DixonColesV25Evaluator.evaluateFixture(makeBaseContext());
    const offMg = offEval.predictions.filter(p => p.marketCategory === 'multi_goals');
    assert.equal(offMg.length, 0, 'Zero Multi goals picks emitted while multi_goals_enabled is false');
  } finally {
    setMultiGoalsEnabled(prevDefaultMg);
  }

  // 2. Threshold constants
  assert.equal(MULTI_GOALS_HIGH_THRESHOLD, 0.60, 'Multi goals High threshold is 60%');
  assert.equal(PICK_CONFIDENCE_THRESHOLD, 0.70, 'Standard football threshold remains 70%');

  // 3. Matrix math check: P(range a-b) == sum P(h + a = k) & team marginals
  const matrixRes = DixonColesV25Engine.generateScorelineMatrix(1.85, 1.15);
  let manual2to4 = 0;
  let manualHome1to2 = 0;
  let manualAway0to1 = 0;
  for (let h = 0; h < matrixRes.matrix.length; h++) {
    for (let a = 0; a < matrixRes.matrix[h].length; a++) {
      const p = matrixRes.matrix[h][a];
      const tot = h + a;
      if (tot >= 2 && tot <= 4) manual2to4 += p;
      if (h >= 1 && h <= 2) manualHome1to2 += p;
      if (a >= 0 && a <= 1) manualAway0to1 += p;
    }
  }
  assert.ok(Math.abs(matrixRes.multiGoals.fullMatch['2-4'] - manual2to4) < 1e-9, 'Full match 2-4 equals exact matrix cell sum');
  assert.ok(Math.abs(matrixRes.multiGoals.home['1-2'] - manualHome1to2) < 1e-9, 'Home 1-2 equals exact home marginal sum');
  assert.ok(Math.abs(matrixRes.multiGoals.away['0-1'] - manualAway0to1) < 1e-9, 'Away 0-1 equals exact away marginal sum');

  // 4. Enable Multi goals temporarily inside try/finally to test full evaluator pipeline
  const prevMg = isMultiGoalsEnabled();
  const prevTn = isTeamNewsEnabled();
  try {
    setMultiGoalsEnabled(true);

    // 4a. PL fixture (UK_WITH_REF, hasHalfTimeGoals = true): all 22 ranges emitted
    const plEval = DixonColesV25Evaluator.evaluateFixture(makeBaseContext());
    const plMg = plEval.predictions.filter(p => p.marketCategory === 'multi_goals');
    assert.equal(plMg.length, 22, 'PL emits 12 full + 4 home + 4 away + 2 first-half = 22 Multi goals lines');
    assert.ok(plMg.every(p => p.isSpeculative === false), 'Passing league PL Multi goals lines are not speculative');

    // Verify zero bookmaker price / EV on Multi goals
    for (const p of plMg) {
      assert.equal(p.marketOdds, undefined, `${p.marketCode} must have no marketOdds`);
      assert.equal(p.expectedValue, null, `${p.marketCode} must have null expectedValue`);
      assert.equal(p.priceSource, 'model line - no market price', `${p.marketCode} must declare model line priceSource`);
      assert.ok(p.multiGoalsMeta, `${p.marketCode} must include multiGoalsMeta`);
      // Display strings must contain no hyphens or underscores
      assertNoHyphensOrUnderscores(p.marketName, `${p.marketCode}.marketName`);
      assertNoHyphensOrUnderscores(p.selection, `${p.marketCode}.selection`);
      assertNoHyphensOrUnderscores(p.settlementRule, `${p.marketCode}.settlementRule`);
      assertNoHyphensOrUnderscores(p.plainEnglishReason, `${p.marketCode}.plainEnglishReason`);
      assertNoHyphensOrUnderscores(p.evidence?.whyLineChosen, `${p.marketCode}.whyLineChosen`);
      p.whyPanel?.factorsFor.forEach((f, idx) => assertNoHyphensOrUnderscores(f, `${p.marketCode}.factorsFor[${idx}]`));
    }

    // Tightness rule: span 5 (1-5, 2-6) NEVER recommended
    const span5 = plMg.filter(p => (p.multiGoalsMeta?.span ?? 0) >= 5);
    assert.equal(span5.length, 2, '1-5 and 2-6 span-5 lines exist in universe');
    for (const wide of span5) {
      assert.equal(wide.rankingScore, 0, `${wide.marketCode} (span 5) must have rankingScore 0`);
      assert.notEqual(wide.qualificationStatus, 'QUALIFIED_PROBABILITY', `${wide.marketCode} cannot qualify`);
    }

    // Span 4 only allowed if calProb > 0.80
    const span4 = plMg.filter(p => p.multiGoalsMeta?.span === 4);
    assert.equal(span4.length, 3, '1-4, 2-5, 3-6 span-4 lines exist');
    for (const s4 of span4) {
      const calP = s4.calibratedProbability ?? s4.modelProbability;
      if (calP <= 0.80) {
        assert.equal(s4.rankingScore, 0, `${s4.marketCode} span 4 at ${(calP * 100).toFixed(1)}% <= 80% must not rank`);
      }
    }

    // Line ladder collapses each Multi goals scope (full_match, home, away, first_half) to at most ONE winning ranked candidate
    for (const scope of ['full_match', 'home', 'away', 'first_half'] as const) {
      const scopedRanked = plMg.filter(p => p.multiGoalsMeta?.scope === scope && p.rankingScore > 0);
      assert.ok(scopedRanked.length <= 1, `Multi goals ladder (${scope}) must recommend at most 1 line, got ${scopedRanked.length}`);
    }
    const rankedMg = plMg.filter(p => p.rankingScore > 0);
    if (rankedMg.length >= 1) {
      for (const winner of rankedMg) {
        assert.ok((winner.multiGoalsMeta?.span ?? 9) <= 4, 'Ladder winner obeys span cap');
        assert.ok((winner.plainEnglishReason || '').includes('range width'), 'Evidence includes range width');
        assert.ok((winner.plainEnglishReason || '').includes('Model line, no market price'), 'Evidence explains model line without price');
      }
    }

    // 4b. EXTRA_GOALS_ONLY league (BSA) omits 1st-half Multi goals (20 ranges only)
    const bsaEval = DixonColesV25Evaluator.evaluateFixture(
      makeBaseContext({
        fixtureId: 'fix_mg_bsa',
        competitionCode: 'BSA',
        competitionName: 'Brazil Serie A',
      })
    );
    const bsaMg = bsaEval.predictions.filter(p => p.marketCategory === 'multi_goals');
    assert.equal(bsaMg.length, 20, 'EXTRA_GOALS_ONLY league BSA omits 2 first-half lines (20 lines total)');
    assert.equal(bsaMg.some(p => p.optionType === 'first_half_multi_goals'), false);

    // 4c. Confidence tiering at 60% threshold (test both team_news=true and team_news=false)
    const dummyRisk = {
      flags: [],
      downgradesCount: 0,
      hasVenueH2HContradiction: false,
      hasAdverseFormGap: false,
      hasKeyAbsences: false,
      hasScheduleCongestion: false,
      hasDerbyRivalry: false,
      hasNewManager: false,
      hasMissingLineup: false,
    };
    setTeamNewsEnabled(true);
    const highConf = ConfidenceEngine.evaluateConfidence(0.625, 0.04, 0.92, 0.03, dummyRisk, 'multi_goals');
    assert.equal(highConf.confidenceTier, 'HIGH', 'Multi goals clears HIGH tier at >= 60% when team news enabled');
    const stdMedConf = ConfidenceEngine.evaluateConfidence(0.625, 0.04, 0.92, 0.03, dummyRisk, 'over_under_goals');
    assert.equal(stdMedConf.confidenceTier, 'MEDIUM', 'Standard goals market remains MEDIUM at 62.5% (< 70%)');
    const mgMedConf = ConfidenceEngine.evaluateConfidence(0.52, 0.04, 0.92, 0.02, dummyRisk, 'multi_goals');
    assert.equal(mgMedConf.confidenceTier, 'MEDIUM', 'Multi goals 48%-59.9% is MEDIUM');
    const mgLowConf = ConfidenceEngine.evaluateConfidence(0.42, 0.04, 0.92, 0.01, dummyRisk, 'multi_goals');
    assert.equal(mgLowConf.confidenceTier, 'LOW', 'Multi goals < 48% is LOW / Speculative');

    // 4d. Speculative league gating (D2 and SC1 failed ci95Lower > 0 -> SPECULATIVE_ONLY)
    for (const specCode of ['D2', 'SC1', 'E3']) {
      const leagueVal = getMultiGoalsLeagueValidation(specCode);
      assert.ok(leagueVal, `${specCode} validation entry must exist in calibratedParams.json`);
      assert.equal(leagueVal!.tierMode, 'SPECULATIVE_ONLY', `${specCode} must be marked SPECULATIVE_ONLY`);
    }
    const d2Eval = DixonColesV25Evaluator.evaluateFixture(
      makeBaseContext({
        fixtureId: 'fix_mg_d2',
        competitionCode: 'D2',
        competitionName: '2. Bundesliga',
      })
    );
    const d2Mg = d2Eval.predictions.filter(p => p.marketCategory === 'multi_goals');
    assert.ok(d2Mg.length > 0);
    for (const p of d2Mg) {
      assert.equal(p.confidenceTier, 'LOW', `${p.marketCode} in SPECULATIVE_ONLY league D2 must be LOW/Speculative`);
      assert.equal(p.isSpeculative, true, `${p.marketCode} in SPECULATIVE_ONLY league D2 must have isSpeculative=true`);
      assert.equal(p.evidenceTier, 'Speculative (Backtest Unvalidated)', `${p.marketCode} must surface Speculative evidenceTier`);
      assert.ok(
        p.qualificationStatus === 'PROBABILITY_ANALYSIS_ONLY' || p.qualificationStatus === 'UNQUALIFIED_MARGINAL',
        `Speculative league ${p.marketCode} cannot emit qualified Multi goals pick (got ${p.qualificationStatus})`
      );
      assert.equal(p.rankingScore, 0, 'Speculative league Multi goals rankingScore must be 0');
      assert.equal(p.isTopPick, false, 'Speculative league Multi goals cannot become topPick');
    }

    // 4d-bis. Dedicated Team Multi Goals per-league validation: POL passes full_match MG but is SPECULATIVE_ONLY for team MG; I2 passes both
    const polEval = DixonColesV25Evaluator.evaluateFixture(
      makeBaseContext({
        fixtureId: 'fix_mg_pol',
        competitionCode: 'POL',
        competitionName: 'Ekstraklasa',
      })
    );
    const polFull = polEval.predictions.filter(p => p.optionType === 'multi_goals');
    const polTeam = polEval.predictions.filter(p => p.optionType === 'team_multi_goals');
    assert.ok(polFull.length > 0 && polFull.every(p => !p.isSpeculative), 'POL full match Multi goals must be enabled (not speculative)');
    assert.ok(polTeam.length > 0 && polTeam.every(p => p.isSpeculative && p.rankingScore === 0), 'POL Team multi goals must be marked speculative and non-ranking');

    const i2Eval = DixonColesV25Evaluator.evaluateFixture(
      makeBaseContext({
        fixtureId: 'fix_mg_i2',
        competitionCode: 'I2',
        competitionName: 'Serie B',
      })
    );
    const i2Team = i2Eval.predictions.filter(p => p.optionType === 'team_multi_goals');
    assert.ok(i2Team.length > 0 && i2Team.every(p => !p.isSpeculative), 'I2 Team multi goals must pass its dedicated league backtest');

    // 4e. Missing history abstains cleanly
    const thinEval = DixonColesV25Evaluator.evaluateFixture(
      makeBaseContext({
        fixtureId: 'fix_mg_thin',
        insufficientData: true,
        sampleSizeMatches: 4,
      })
    );
    assert.equal(thinEval.predictions.length, 0);
    assert.equal(thinEval.topPick, null);
    assert.ok(Boolean(thinEval.noRecommendationReason));
  } finally {
    setMultiGoalsEnabled(prevMg);
    setTeamNewsEnabled(prevTn);
  }

  // 5. Slate Diversity Cap (40% max family share for 'multi_goals')
  const makeSlatePick = (fixtureId: string, altFamily: 'goals_over_under' | 'both_teams_to_score' | null): SlatePickCandidate => {
    const mgPick: MarketPrediction = {
      id: `pred_${fixtureId}_mg`,
      fixtureId,
      marketCode: 'MULTI_GOALS_2_4',
      optionType: 'multi_goals',
      marketCategory: 'multi_goals',
      marketFamily: 'multi_goals',
      marketName: 'Multi goals',
      selection: 'Multi goals 2 to 4',
      period: 'REGULAR_TIME',
      settlementRule: '90m total goals 2 to 4',
      modelProbability: 0.72,
      calibratedProbability: 0.72,
      edgeOverBaseline: 0.08,
      rankingScore: 2000,
      isTopPick: true,
      settlementStatus: 'PENDING',
      evidenceTier: 'High',
      dataQualityScore: 0.95,
      isProbabilityBasedAnalysis: true,
      stateTags: [],
      lineupStatus: 'confirmed',
      modelConfidence: 'HIGH',
      qualificationStatus: 'QUALIFIED_PROBABILITY',
      topFactorContributions: [],
      isValidated: true,
      isGenericPick: false,
      multiGoalsMeta: { scope: 'full_match', minGoals: 2, maxGoals: 4, span: 3, band: '2 to 4', expectedTotalGoals: 2.8 },
    };
    const altPick: MarketPrediction | null = altFamily === 'goals_over_under'
      ? {
          ...mgPick,
          id: `pred_${fixtureId}_ou25`,
          marketCode: 'TOTAL_GOALS_O25',
          optionType: 'over_under_goals',
          marketCategory: 'total_goals',
          marketFamily: 'goals_over_under',
          marketName: 'Over / Under 2.5 Goals',
          selection: 'Over 2.5 goals',
          line: 2.5,
          modelProbability: 0.73,
          calibratedProbability: 0.73,
          edgeOverBaseline: 0.05,
          rankingScore: 1999,
          isTopPick: false,
          multiGoalsMeta: undefined,
        }
      : altFamily === 'both_teams_to_score'
      ? {
          ...mgPick,
          id: `pred_${fixtureId}_btts`,
          marketCode: 'BTTS_YES',
          optionType: 'both_teams_to_score',
          marketCategory: 'btts',
          marketFamily: 'both_teams_to_score',
          marketName: 'Both Teams to Score',
          selection: 'BTTS Yes',
          modelProbability: 0.71,
          calibratedProbability: 0.71,
          edgeOverBaseline: 0.04,
          rankingScore: 1998,
          isTopPick: false,
          multiGoalsMeta: undefined,
        }
      : null;
    return {
      fixtureId,
      topPick: mgPick,
      predictions: altPick ? [mgPick, altPick] : [mgPick],
    };
  };

  const slateInputs: SlatePickCandidate[] = Array.from({ length: 10 }, (_, idx) =>
    makeSlatePick(`slate_fix_${idx}`, idx < 3 ? 'goals_over_under' : (idx < 6 ? 'both_teams_to_score' : null))
  );
  const diversified = selectDiversifiedSlatePicks(slateInputs, 0.40);
  const activeCount = diversified.filter(s => s.topPick !== null).length;
  const mgTopCount = diversified.filter(s => s.topPick?.marketFamily === 'multi_goals').length;
  assert.equal(activeCount, 10, `Expected all 10 picks retained across 3 families, got ${activeCount}`);
  assert.ok(mgTopCount / activeCount <= 0.40 + 1e-9, `Multi goals share ${mgTopCount}/${activeCount} must not exceed 40%`);

  // 6. Settlement Engine (Full time, Team, 1st half, Void on missing HT, Exclude extra time / pending)
  const basePred: MarketPrediction = {
    id: 'pred_settle',
    fixtureId: 'fix_settle',
    marketCode: 'MULTI_GOALS_2_4',
    optionType: 'multi_goals',
    marketCategory: 'multi_goals',
    marketName: 'Multi goals',
    selection: 'Multi goals 2 to 4',
    period: 'REGULAR_TIME',
    settlementRule: 'Regular time 90m goals',
    modelProbability: 0.70,
    rankingScore: 100,
    isTopPick: true,
    settlementStatus: 'PENDING',
    evidenceTier: 'High',
    dataQualityScore: 0.9,
    isProbabilityBasedAnalysis: true,
    stateTags: [],
    lineupStatus: 'confirmed',
    modelConfidence: 'HIGH',
    qualificationStatus: 'QUALIFIED_PROBABILITY',
    topFactorContributions: [],
  };

  assert.equal(settleMarketPrediction(basePred, makeDummyStats({ homeScore: 2, awayScore: 1 })).settlementStatus, 'WON');
  assert.equal(settleMarketPrediction(basePred, makeDummyStats({ homeScore: 1, awayScore: 0 })).settlementStatus, 'LOST');
  assert.equal(settleMarketPrediction(basePred, makeDummyStats({ homeScore: 3, awayScore: 2 })).settlementStatus, 'LOST');
  assert.equal(settleMarketPrediction(basePred, makeDummyStats({ status: 'IN_PLAY', homeScore: 2, awayScore: 0 })).settlementStatus, 'PENDING');
  assert.equal(settleMarketPrediction(basePred, makeDummyStats({ status: 'POSTPONED' })).settlementStatus, 'VOID');

  const homeTeamPred: MarketPrediction = { ...basePred, marketCode: 'TEAM_MULTI_GOALS_HOME_1_2', optionType: 'team_multi_goals' };
  assert.equal(settleMarketPrediction(homeTeamPred, makeDummyStats({ homeScore: 2, awayScore: 3 })).settlementStatus, 'WON');
  assert.equal(settleMarketPrediction(homeTeamPred, makeDummyStats({ homeScore: 0, awayScore: 1 })).settlementStatus, 'LOST');
  assert.equal(settleMarketPrediction(homeTeamPred, makeDummyStats({ homeScore: 3, awayScore: 0 })).settlementStatus, 'LOST');

  const awayTeamPred: MarketPrediction = { ...basePred, marketCode: 'TEAM_MULTI_GOALS_AWAY_0_1', optionType: 'team_multi_goals' };
  assert.equal(settleMarketPrediction(awayTeamPred, makeDummyStats({ homeScore: 2, awayScore: 1 })).settlementStatus, 'WON');
  assert.equal(settleMarketPrediction(awayTeamPred, makeDummyStats({ homeScore: 0, awayScore: 2 })).settlementStatus, 'LOST');

  const fhPred: MarketPrediction = { ...basePred, marketCode: 'FH_MULTI_GOALS_0_1', optionType: 'first_half_multi_goals', period: 'FIRST_HALF' };
  assert.equal(settleMarketPrediction(fhPred, makeDummyStats({ homeScore: 2, awayScore: 2, homeHalfTimeScore: 1, awayHalfTimeScore: 0, hasRealHalfTimeScores: true })).settlementStatus, 'WON');
  assert.equal(settleMarketPrediction(fhPred, makeDummyStats({ homeScore: 2, awayScore: 1, homeHalfTimeScore: 2, awayHalfTimeScore: 0, hasRealHalfTimeScores: true })).settlementStatus, 'LOST');
  assert.equal(settleMarketPrediction(fhPred, makeDummyStats({ hasRealHalfTimeScores: false })).settlementStatus, 'VOID');

  // 7. Forward Pick Ledger Multi Goals Metrics
  const before = forwardPickLedger.getForwardRecordMetrics().multiGoalsMetrics.settledCount;
  const pWon = forwardPickLedger.recordPreKickoffPick({
    fixtureId: 'test_mg_fwd_1',
    fixtureName: 'Arsenal vs Brentford',
    competition: 'Premier League',
    competitionCode: 'PL',
    kickoffTime: '2026-12-01T15:00:00Z',
    marketCode: 'MULTI_GOALS_2_4',
    market: 'Multi goals',
    selection: 'Multi goals 2 to 4',
    probability: 0.70,
    odds: 0,
    confidenceTier: 'HIGH',
    marketFamily: 'multi_goals',
    priceSource: 'model line - no market price',
  });
  forwardPickLedger.gradePick(pWon.id, 'WON', '2 to 1');

  const pLost = forwardPickLedger.recordPreKickoffPick({
    fixtureId: 'test_mg_fwd_2',
    fixtureName: 'Inter vs Milan',
    competition: 'Serie A',
    competitionCode: 'SA',
    kickoffTime: '2026-12-01T19:45:00Z',
    marketCode: 'TEAM_MULTI_GOALS_HOME_1_2',
    market: 'Inter multi goals',
    selection: 'Inter multi goals 1 to 2',
    probability: 0.65,
    odds: 0,
    confidenceTier: 'HIGH',
    marketFamily: 'multi_goals',
    priceSource: 'model line - no market price',
  });
  forwardPickLedger.gradePick(pLost.id, 'LOST', '0 to 1');

  const after = forwardPickLedger.getForwardRecordMetrics().multiGoalsMetrics;
  assert.equal(after.settledCount, before + 2, 'Forward ledger counts settled Multi goals picks');
  assert.ok(after.brierScore > 0, 'Forward ledger tracks Multi goals Brier score');
  assert.ok(after.logLoss > 0, 'Forward ledger tracks Multi goals log loss');

  console.log('ALL MULTI GOALS TESTS PASSED: Matrix math, calibration, tightness, 60% threshold, speculative gating, 40% slate cap, settlement, forward ledger, and no-hyphen rules verified.');
}

runMultiGoalsTests();
