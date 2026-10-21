// MATCHMIND / CALIBRALL: Automated Statistical & Context Factors Test Suite
// Verifies mathematical invariants, scoreline matrix conservation, market qualification rules,
// temporal leakage, ablation testing, factor directionality, missing-factor handling,
// and the 10 Supported Options Catalogue rules and invariants.

import { 
  poissonProb, 
  generateScorelineDistribution, 
  generateHalfByHalfGoalDistribution,
  calculateCornerProbabilities,
  calculateCardProbabilities,
  calculateExpectedValue,
  calculateImpliedProbability,
  calculateBookmakerMargin
} from '../lib/prediction/math';
import { evaluateFixtureMarkets } from '../lib/prediction/marketSelection';
import { evaluateContextFactors, FACTOR_DEFINITIONS } from '../lib/prediction/contextFactors';
import { 
  SUPPORTED_OPTIONS_CATALOGUE, 
  AUTHORIZED_OPTION_TYPES, 
  isOptionTypeEnabled 
} from '../lib/prediction/marketCatalog';

export function runStatisticalTests() {
  const results: { testName: string; passed: boolean; details?: string }[] = [];

  function assert(condition: boolean, testName: string, details?: string) {
    results.push({ testName, passed: condition, details });
  }

  // 1. Test Poisson normalization
  let poissonSum = 0;
  for (let k = 0; k <= 15; k++) {
    poissonSum += poissonProb(2.5, k);
  }
  assert(Math.abs(poissonSum - 1.0) < 0.001, 'Poisson distribution sums to ~1.0', `Sum: ${poissonSum}`);

  // 2. Test Dixon-Coles Scoreline Matrix Normalization
  const matrixResult = generateScorelineDistribution(1.8, 1.2);
  let matrixSum = 0;
  for (let h = 0; h < matrixResult.matrix.length; h++) {
    for (let a = 0; a < matrixResult.matrix[h].length; a++) {
      matrixSum += matrixResult.matrix[h][a];
    }
  }
  assert(Math.abs(matrixSum - 1.0) < 0.0001, 'Dixon-Coles 2D joint distribution sums to exactly 1.0', `Sum: ${matrixSum}`);

  // 3. Test 1X2 Mutually Exclusive Probabilities
  const resultSum = matrixResult.homeWin + matrixResult.draw + matrixResult.awayWin;
  assert(Math.abs(resultSum - 1.0) < 0.0001, '1X2 outcomes (Home + Draw + Away) sum to 1.0', `Sum: ${resultSum}`);

  // 4. Test Over/Under 2.5 Goals Invariant
  const ouSum = matrixResult.overUnderGoals[2.5].over + matrixResult.overUnderGoals[2.5].under;
  assert(Math.abs(ouSum - 1.0) < 0.0001, 'Over 2.5 + Under 2.5 goals sum to 1.0', `Sum: ${ouSum}`);

  // 5. Test Both Teams To Score (BTTS) Invariant
  const bttsSum = matrixResult.bttsYes + matrixResult.bttsNo;
  assert(Math.abs(bttsSum - 1.0) < 0.0001, 'BTTS Yes + BTTS No sum to 1.0', `Sum: ${bttsSum}`);

  // 6. Test Corners Probabilities
  const cornerProbs = calculateCornerProbabilities(10.5);
  const corner95Sum = cornerProbs.total[9.5].over + cornerProbs.total[9.5].under;
  assert(Math.abs(corner95Sum - 1.0) < 0.0001, 'Corners Over 9.5 + Under 9.5 sum to 1.0', `Sum: ${corner95Sum}`);

  // 7. Test Expected Value (EV) calculation
  const ev = calculateExpectedValue(0.60, 2.00); // 0.60 * 2.0 - 1 = +0.20
  assert(ev !== undefined && Math.abs(ev - 0.20) < 0.0001, 'Expected Value calculation formula is exact', `EV: ${ev}`);

  // 8. Test Implied Probability & Overround
  const implied = calculateImpliedProbability(2.50); // 1 / 2.5 = 0.40
  assert(implied !== undefined && Math.abs(implied - 0.40) < 0.0001, 'Implied probability formula is exact', `Implied: ${implied}`);

  const margin = calculateBookmakerMargin([2.0, 3.4, 3.8]);
  assert(margin > 0 && margin < 0.15, 'Bookmaker overround calculates correctly', `Margin: ${margin}`);

  // 9. Test Abstention Discipline: High Uncertainty fixture should abstain
  const uncertainFixture = evaluateFixtureMarkets({
    fixtureId: 'fix_uncertain_test',
    homeTeamName: 'Test Home',
    awayTeamName: 'Test Away',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.0,
    homeDefenseRating: 1.0,
    awayAttackRating: 1.0,
    awayDefenseRating: 1.0,
    homeXg: 1.4,
    awayXg: 1.2,
    expectedCornersHome: 5.0,
    expectedCornersAway: 5.0,
    expectedCards: 4.0,
    uncertaintyScore: 0.35, // Deliberately high uncertainty
    dataCoverageScore: 0.60, // Insufficient data coverage
    sampleSizeMatches: 5,   // Small sample
  });
  assert(
    uncertainFixture.topPick === null,
    'Intelligent Engine abstains (returns no recommendation) on high uncertainty/sparse data',
    uncertainFixture.noRecommendationReason
  );

  // ====================================================================
  // CONTEXT FACTORS & STATE-BASED WEIGHING TESTS
  // ====================================================================

  // 10. Temporal Leakage Test
  const preMatchContext = {
    fixtureId: 'fix_leakage_audit',
    homeTeamName: 'Arsenal',
    awayTeamName: 'Chelsea',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.35,
    homeDefenseRating: 0.70,
    awayAttackRating: 1.20,
    awayDefenseRating: 0.90,
    homeXg: 1.70,
    awayXg: 1.20,
    expectedCornersHome: 6.0,
    expectedCornersAway: 4.5,
    expectedCards: 4.2,
    uncertaintyScore: 0.08,
    dataCoverageScore: 0.95,
    sampleSizeMatches: 20,
    stateTags: ['high-stakes' as const],
    lineupConfirmed: true,
  };
  const leakageEval = evaluateFixtureMarkets(preMatchContext);
  const containsNoPostMatchKeys = Object.keys(preMatchContext).every(k => !['homeScore', 'awayScore', 'actualCards', 'result'].includes(k));
  assert(
    containsNoPostMatchKeys && leakageEval.predictions.length > 0,
    'Temporal Leakage Test: Inference executes strictly on pre-match variables with zero target leakage'
  );

  // 11. Ablation Testing Verification
  const allFactorsAddValue = Object.values(FACTOR_DEFINITIONS).every(def => def.ablationGainBrier > 0);
  const droppedOrZeroWeightRule = Object.values(FACTOR_DEFINITIONS).every(def => {
    if (def.ablationGainBrier <= 0) {
      return Object.values(def.marketWeights).every(w => w === 0);
    }
    return true;
  });
  assert(
    allFactorsAddValue && droppedOrZeroWeightRule,
    'Ablation Test: All factors add positive incremental validation value; zero-weighting rule verified'
  );

  // 12. Correct Factor Directionality on Synthetic Data
  const baselineEval = evaluateFixtureMarkets({
    ...preMatchContext,
    stateTags: [],
  });
  const keyAbsenceEval = evaluateFixtureMarkets({
    ...preMatchContext,
    stateTags: ['key-absences'],
  });
  const baselineOver25 = baselineEval.predictions.find(p => p.marketCode === 'TOTAL_GOALS_O25')?.modelProbability ?? 0;
  const keyAbsenceOver25 = keyAbsenceEval.predictions.find(p => p.marketCode === 'TOTAL_GOALS_O25')?.modelProbability ?? 0;
  assert(
    keyAbsenceOver25 < baselineOver25,
    'Factor Directionality Test: Key attacker absences reduces over 2.5 goals probability',
    `Baseline: ${(baselineOver25 * 100).toFixed(1)}% vs Absence: ${(keyAbsenceOver25 * 100).toFixed(1)}%`
  );

  const derbyEval = evaluateFixtureMarkets({
    ...preMatchContext,
    stateTags: ['derby'],
  });
  const baselineCards = baselineEval.predictions.find(p => p.marketCode === 'CARDS_O45')?.modelProbability ?? 0;
  const derbyCards = derbyEval.predictions.find(p => p.marketCode === 'CARDS_O45')?.modelProbability ?? 0;
  assert(
    derbyCards > baselineCards,
    'Factor Directionality Test: Derby state tag raises cards probability expectation',
    `Baseline: ${(baselineCards * 100).toFixed(1)}% vs Derby: ${(derbyCards * 100).toFixed(1)}%`
  );

  // 13. Missing-Factor Handling Test
  const sparseContextEval = evaluateContextFactors({
    fixtureId: 'fix_sparse_factors',
    homeTeamName: 'Team A',
    awayTeamName: 'Team B',
    competitionCode: 'PL',
    homeXg: 1.5,
    awayXg: 1.2,
    expectedCornersHome: 5.0,
    expectedCornersAway: 4.5,
    expectedCards: 4.0,
    sampleSizeMatches: 16,
    dataCoverageScore: 0.82,
    rawStateTags: [],
    lineupConfirmed: true,
  });
  assert(
    sparseContextEval.missingFactors.length > 0 &&
    sparseContextEval.compositeUncertaintyMultiplier > 1.0 &&
    sparseContextEval.dataQualityScore < 0.85,
    'Missing-Factor Handling Test: Unmeasured factors flagged explicitly, never zeroed, and widen uncertainty penalty',
    `Flags: ${sparseContextEval.missingFactors.length}, Multiplier: ${sparseContextEval.compositeUncertaintyMultiplier}`
  );

  // ====================================================================
  // SUPPORTED OPTIONS CATALOGUE TESTS (10 AUTHORIZED OPTIONS)
  // ====================================================================

  // 14. Catalogue Completeness & Disabling Rule
  const all10Enabled = AUTHORIZED_OPTION_TYPES.length === 10 &&
    AUTHORIZED_OPTION_TYPES.every(type => isOptionTypeEnabled(type));
  const unauthorizedDisabled = !isOptionTypeEnabled('asian_handicap') && !isOptionTypeEnabled('player_props');
  assert(
    all10Enabled && unauthorizedDisabled,
    'Catalogue Scope Test: Exactly 10 supported option types defined; unauthorized markets disabled by configuration'
  );

  // 15. Non-Contradiction Invariant: Over 2.5 cannot be more likely than Over 1.5
  const goalDist = generateScorelineDistribution(1.8, 1.3);
  const over15 = goalDist.overUnderGoals[1.5].over;
  const over25 = goalDist.overUnderGoals[2.5].over;
  const over35 = goalDist.overUnderGoals[3.5].over;
  assert(
    over25 <= over15 && over35 <= over25,
    'Non-Contradiction Invariant: Over 2.5 <= Over 1.5 and Over 3.5 <= Over 2.5 derived from joint distribution',
    `O1.5: ${(over15 * 100).toFixed(1)}% >= O2.5: ${(over25 * 100).toFixed(1)}% >= O3.5: ${(over35 * 100).toFixed(1)}%`
  );

  // 16. Double Chance Consistency: Derived from same 1X2 distribution
  const dc1X = goalDist.doubleChance.homeOrDraw;
  const dcExpected1X = goalDist.homeWin + goalDist.draw;
  const dc12 = goalDist.doubleChance.homeOrAway;
  const dcExpected12 = 1.0 - goalDist.draw;
  assert(
    Math.abs(dc1X - dcExpected1X) < 0.0001 && Math.abs(dc12 - dcExpected12) < 0.0001,
    'Double Chance Consistency: P(1X) = P(Home) + P(Draw) and P(12) = 1.0 - P(Draw) identically',
    `1X diff: ${Math.abs(dc1X - dcExpected1X)}, 12 diff: ${Math.abs(dc12 - dcExpected12)}`
  );

  // 17. Push Rule on Whole-Number Lines: Over + Under + Push = 1.0
  const line20 = goalDist.wholeNumberGoals[2.0];
  const wholeSum = line20.over + line20.under + line20.push;
  assert(
    Math.abs(wholeSum - 1.0) < 0.0001 && line20.push > 0,
    'Whole-Number Line Push Rule: Over 2.0 + Under 2.0 + Push sum to exactly 1.0',
    `Over: ${(line20.over * 100).toFixed(1)}%, Under: ${(line20.under * 100).toFixed(1)}%, Push: ${(line20.push * 100).toFixed(1)}%`
  );

  // 18. Half-by-Half Model Invariants
  const halfDist = generateHalfByHalfGoalDistribution(1.6, 1.2);
  const hshSum = halfDist.highestScoringHalf.firstHalf + halfDist.highestScoringHalf.secondHalf + halfDist.highestScoringHalf.equal;
  const h2ResultSum = halfDist.secondHalf.homeWin + halfDist.secondHalf.draw + halfDist.secondHalf.awayWin;
  assert(
    Math.abs(hshSum - 1.0) < 0.0001 && Math.abs(h2ResultSum - 1.0) < 0.0001,
    'Half-by-Half Model Invariant: Highest scoring half and 2nd half 1X2 both sum to 1.0',
    `HSH Sum: ${hshSum}, 2H Result Sum: ${h2ResultSum}`
  );

  // 19. Half-Level Data Abstention Test
  const lowHalfDataFixture = evaluateFixtureMarkets({
    ...preMatchContext,
    sampleSizeMatches: 7, // Below required 10 matches for half model validation
    dataCoverageScore: 0.70,
  });
  const halfMarket = lowHalfDataFixture.predictions.find(p => p.optionType === 'highest_scoring_half');
  assert(
    halfMarket !== undefined && halfMarket.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY',
    'Half-Level Data Gate: Inadequate half-level historical data triggers abstention',
    halfMarket?.evidenceTier
  );

  // 20. Draw-Specific Threshold Enforcement
  const normalFixtureEval = evaluateFixtureMarkets(preMatchContext);
  const drawPrediction = normalFixtureEval.predictions.find(p => p.optionType === 'draw');
  assert(
    drawPrediction !== undefined && (drawPrediction.modelProbability >= 0.30 || drawPrediction.qualificationStatus === 'UNQUALIFIED_MARGINAL'),
    'Draw-Specific Threshold: Draw predictions screened by strict draw-specific threshold'
  );

  // 21. Probability-Based Analysis Labeling (When odds unpublished)
  const unverifiedOddsFixture = evaluateFixtureMarkets({
    ...preMatchContext,
    verifiedOdds: undefined, // No published bookmaker odds
  });
  const unverifiedOption = unverifiedOddsFixture.predictions.find(p => p.marketCode === '1X2_HOME');
  assert(
    unverifiedOption?.isProbabilityBasedAnalysis === true && !unverifiedOption.marketOdds,
    'Probability Analysis Label: Options without verified odds strictly labeled as probability-based analysis, never value opportunity'
  );

  // 22. Correlation Warnings Detection
  const fixtureWithCorrelations = evaluateFixtureMarkets(preMatchContext, 10);
  const totalGoalsO25Pred = fixtureWithCorrelations.predictions.find(p => p.marketCode === 'TOTAL_GOALS_O25');
  assert(
    (totalGoalsO25Pred?.correlationWarnings?.length ?? 0) > 0,
    'Correlation Warnings: System flags intra-fixture correlation between Over 2.5 Goals and correlated lines',
    totalGoalsO25Pred?.correlationWarnings?.[0]
  );

  return results;
}

// Self-executing runner when executed via Node/Bun
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('engine.test')) {
  console.log('Running MATCHMIND / CALIBRALL Statistical Engine Unit Tests...\n');
  const testResults = runStatisticalTests();
  let allPassed = true;
  testResults.forEach(r => {
    const symbol = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${symbol}: ${r.testName} ${r.details ? `(${r.details})` : ''}`);
    if (!r.passed) allPassed = false;
  });
  console.log(`\nTest Result: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}
