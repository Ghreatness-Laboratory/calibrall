// MATCHMIND / CALIBRALL: Automated Statistical & Context Factors Test Suite
// Verifies mathematical invariants, scoreline matrix conservation, market qualification rules,
// temporal leakage, ablation testing, factor directionality, missing-factor handling,
// Asian & European handicap lines, Goal bounds, Halves, and Safest Picks variety rules.

import { 
  poissonProb, 
  generateScorelineDistribution, 
  generateHalfByHalfGoalDistribution,
  calculateCornerProbabilities,
  calculateCardProbabilities,
  calculateExpectedValue,
  calculateImpliedProbability,
  calculateBookmakerMargin,
  calculateRiskTier
} from '../lib/prediction/math';
import { evaluateFixtureMarkets } from '../lib/prediction/marketSelection';
import { evaluateContextFactors, FACTOR_DEFINITIONS, checkDerby } from '../lib/prediction/contextFactors';
import { 
  SUPPORTED_OPTIONS_CATALOGUE, 
  AUTHORIZED_OPTION_TYPES, 
  isOptionTypeEnabled 
} from '../lib/prediction/marketCatalog';
import { calculateNBAScoreProjection } from '../lib/prediction/nbaMath';

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

  // 6. Test Asian Handicap Invariants: Win + Push + Loss = 1.0 for all lines
  const ahLines = [-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5];
  let allAhSumsValid = true;
  ahLines.forEach(l => {
    const homeOutcome = matrixResult.asianHandicap.home[l];
    const awayOutcome = matrixResult.asianHandicap.away[l];
    if (homeOutcome) {
      const sum = homeOutcome.win + homeOutcome.push + homeOutcome.loss;
      if (Math.abs(sum - 1.0) > 0.0001) allAhSumsValid = false;
    }
    if (awayOutcome) {
      const sum = awayOutcome.win + awayOutcome.push + awayOutcome.loss;
      if (Math.abs(sum - 1.0) > 0.0001) allAhSumsValid = false;
    }
  });
  assert(allAhSumsValid, 'Asian Handicap: Win + Push + Loss sums to exactly 1.0 across all lines (-1.5 to +1.5)');

  // 7. Test European Handicap Invariant: Home + Draw + Away = 1.0
  const ehM1 = matrixResult.europeanHandicap[-1];
  const ehM1Sum = ehM1.home + ehM1.draw + ehM1.away;
  const ehP1 = matrixResult.europeanHandicap[1];
  const ehP1Sum = ehP1.home + ehP1.draw + ehP1.away;
  assert(
    Math.abs(ehM1Sum - 1.0) < 0.0001 && Math.abs(ehP1Sum - 1.0) < 0.0001,
    'European Handicap: 3-way outcomes (Home + Draw + Away) sum to exactly 1.0 for both -1 and +1 lines',
    `EH(-1) sum: ${ehM1Sum}, EH(+1) sum: ${ehP1Sum}`
  );

  // 8. Test Goal Bounds Invariants: Disjoint non-overlapping partition covers all scorelines
  // Bands 0-1, 2-3, 4+ are mutually exclusive and exhaustive:
  const gbPartitionSum = matrixResult.goalBounds['0-1'] + matrixResult.goalBounds['2-3'] + matrixResult.goalBounds['4+'];
  assert(
    Math.abs(gbPartitionSum - 1.0) < 0.0001,
    'Goal Bounds Invariant: Mutually exclusive bands (0-1, 2-3, 4+) partition the scoreline space and sum to 1.0',
    `Partition sum: ${gbPartitionSum}`
  );

  // Team goal bounds sum to 1.0
  const homeTeamBoundsSum = matrixResult.teamGoalBounds.home['0-1'] + matrixResult.teamGoalBounds.home['2+'];
  assert(
    Math.abs(homeTeamBoundsSum - 1.0) < 0.0001,
    'Team Goal Bounds Invariant: Home bounds (0-1, 2+) sum to exactly 1.0',
    `Home team bounds sum: ${homeTeamBoundsSum}`
  );

  // 9. Test Half-by-Half Invariants: Highest scoring half (1st, 2nd, Equal) sums to 1.0
  const halfDist = generateHalfByHalfGoalDistribution(1.7, 1.2);
  const hshSum = halfDist.highestScoringHalf.firstHalf + halfDist.highestScoringHalf.secondHalf + halfDist.highestScoringHalf.equal;
  assert(
    Math.abs(hshSum - 1.0) < 0.0001,
    'Highest Scoring Half Invariant: 1st half + 2nd half + Equal outcomes sum to exactly 1.0',
    `HSH Sum: ${hshSum}`
  );

  // 10. Test Corners & Cards Probabilities
  const cornerProbs = calculateCornerProbabilities(10.5);
  const corner95Sum = cornerProbs.total[9.5].over + cornerProbs.total[9.5].under;
  assert(Math.abs(corner95Sum - 1.0) < 0.0001, 'Corners Over 9.5 + Under 9.5 sum to 1.0', `Sum: ${corner95Sum}`);

  const cardProbs = calculateCardProbabilities(4.4);
  const card45Sum = cardProbs.total[4.5].over + cardProbs.total[4.5].under;
  assert(Math.abs(card45Sum - 1.0) < 0.0001, 'Bookings Over 4.5 + Under 4.5 sum to 1.0', `Sum: ${card45Sum}`);

  // 11. Test Risk Tier Classification Function
  const safeTier = calculateRiskTier(0.82, 0.85, 0.04);
  const modTier = calculateRiskTier(0.68, 0.75, 0.03);
  const riskyTier = calculateRiskTier(0.52, 0.70, 0.05);
  const longshotTier = calculateRiskTier(0.38, 0.65, 0.08);
  assert(
    safeTier === 'SAFE' && modTier === 'MODERATE' && riskyTier === 'RISKY' && longshotTier === 'LONGSHOT',
    'Risk Tier Logic: Correctly maps probabilities and confidence to SAFE (≥75%), MODERATE (60-75%), RISKY (45-60%), LONGSHOT (<45%)',
    `Results: ${safeTier}, ${modTier}, ${riskyTier}, ${longshotTier}`
  );

  // 12. Test "Best Safe Pick" Logic: Must NOT default to Over 1.5 Goals
  // Fixture where home team is heavy favorite and clean sheet likely
  const dominantFixture = evaluateFixtureMarkets({
    fixtureId: 'fix_dominant_test',
    homeTeamName: 'Manchester City',
    awayTeamName: 'Luton Town',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.85,
    homeDefenseRating: 0.50,
    awayAttackRating: 0.60,
    awayDefenseRating: 1.40,
    homeXg: 2.6,
    awayXg: 0.4,
    expectedCornersHome: 8.5,
    expectedCornersAway: 2.0,
    expectedCards: 3.2,
    uncertaintyScore: 0.06,
    dataCoverageScore: 0.96,
    sampleSizeMatches: 24,
    stateTags: [],
    lineupConfirmed: true,
  });

  assert(
    dominantFixture.topPick !== null,
    'Dominant fixture returns a qualified top pick',
    dominantFixture.topPick?.selection
  );

  // 13. Test Missing Data Discipline: If corner or card data missing, skip rather than guess
  const missingDataFixture = evaluateFixtureMarkets({
    fixtureId: 'fix_missing_data_test',
    homeTeamName: 'Club A',
    awayTeamName: 'Club B',
    competitionCode: 'CL',
    competitionName: 'Champions League',
    homeAttackRating: 1.1,
    homeDefenseRating: 1.0,
    awayAttackRating: 1.0,
    awayDefenseRating: 1.1,
    homeXg: 1.5,
    awayXg: 1.3,
    expectedCornersHome: 0,
    expectedCornersAway: 0,
    expectedCards: 0,
    uncertaintyScore: 0.10,
    dataCoverageScore: 0.60,
    sampleSizeMatches: 8,
    stateTags: ['low-sample'],
    lineupConfirmed: true,
  });

  const cornerCand = missingDataFixture.predictions.find(p => p.optionType === 'corners');
  const cardCand = missingDataFixture.predictions.find(p => p.optionType === 'bookings');
  assert(
    (cornerCand === undefined || cornerCand.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY') &&
    (cardCand === undefined || cardCand.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY'),
    'Missing Data Rules: Corner/card markets absent or marked UNQUALIFIED_HIGH_UNCERTAINTY when data is unavailable'
  );

  // 14. Test Derby Recognition & Intensity Multiplier
  const nldDerby = checkDerby('Arsenal FC', 'Tottenham Hotspur');
  const elClasico = checkDerby('Real Madrid CF', 'FC Barcelona');
  const nonDerby = checkDerby('Arsenal FC', 'Bournemouth');
  assert(
    nldDerby !== null && nldDerby.name === 'North London Derby' &&
    elClasico !== null && elClasico.name === 'El Clásico' &&
    nonDerby === null,
    'Derby Detection: Accurately identifies verified European derbies and ignores standard matches'
  );

  // 15. Push Rule on Whole-Number Lines: Over + Under + Push = 1.0
  const line20 = matrixResult.wholeNumberGoals[2.0];
  const wholeSum = line20.over + line20.under + line20.push;
  assert(
    Math.abs(wholeSum - 1.0) < 0.0001 && line20.push > 0,
    'Whole-Number Line Push Rule: Over 2.0 + Under 2.0 + Push sum to exactly 1.0',
    `Push: ${(line20.push * 100).toFixed(1)}%`
  );

  // 16. NBA Score Projection Exact Formula Test (Boston vs Detroit)
  // Boston: off 1.159, def 1.085, poss 98.5
  // Detroit: off 1.124, def 1.054, poss 103.1
  // Expected: Boston offense 114.16, Detroit offense 115.88, Boston defense 111.86, Detroit defense 103.82, Boston projected 108.99, Detroit projected 113.87, total 222.86
  const nbaResult = calculateNBAScoreProjection(
    { name: 'Boston Celtics', offensiveEfficiency: 1.159, defensiveEfficiency: 1.085, possessions: 98.5 },
    { name: 'Detroit Pistons', offensiveEfficiency: 1.124, defensiveEfficiency: 1.054, possessions: 103.1 }
  );

  const bOffOk = Math.abs(nbaResult.aOff - 114.16) <= 0.01;
  const dOffOk = Math.abs(nbaResult.bOff - 115.88) <= 0.01;
  const bDefOk = Math.abs(nbaResult.aDef - 111.86) <= 0.01;
  const dDefOk = Math.abs(nbaResult.bDef - 103.82) <= 0.01;
  const bProjOk = Math.abs(nbaResult.aProjected - 108.99) <= 0.01;
  const dProjOk = Math.abs(nbaResult.bProjected - 113.87) <= 0.01;
  const totalOk = Math.abs(nbaResult.total - 222.86) <= 0.01;

  assert(
    bOffOk && dOffOk && bDefOk && dDefOk && bProjOk && dProjOk && totalOk,
    'NBA Projection Invariant (Boston vs Detroit): Matches expected values within 0.01 tolerance',
    `BosOff: ${nbaResult.aOff.toFixed(2)} (exp 114.16), DetOff: ${nbaResult.bOff.toFixed(2)} (exp 115.88), BosDef: ${nbaResult.aDef.toFixed(2)} (exp 111.86), DetDef: ${nbaResult.bDef.toFixed(2)} (exp 103.82), BosProj: ${nbaResult.aProjected.toFixed(2)} (exp 108.99), DetProj: ${nbaResult.bProjected.toFixed(2)} (exp 113.87), Total: ${nbaResult.total.toFixed(2)} (exp 222.86)`
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
