// MATCHMIND: Automated Statistical Test Suite
// Verifies mathematical invariants, scoreline matrix conservation, and market qualification rules

import { 
  poissonProb, 
  generateScorelineDistribution, 
  calculateCornerProbabilities,
  calculateCardProbabilities,
  calculateExpectedValue,
  calculateImpliedProbability,
  calculateBookmakerMargin
} from '../lib/prediction/math';
import { evaluateFixtureMarkets } from '../lib/prediction/marketSelection';

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
  const corner95Sum = cornerProbs[9.5].over + cornerProbs[9.5].under;
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

  return results;
}

// Self-executing runner when executed via Node/Bun
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('engine.test')) {
  console.log('Running MATCHMIND Statistical Engine Unit Tests...\n');
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
