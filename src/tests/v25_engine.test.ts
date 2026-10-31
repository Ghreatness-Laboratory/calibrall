// CALIBRALL: Dixon Coles v2.5 Engine Comprehensive Test Suite
// Verifies Asian handicap quarter-line invariants, Platt calibration, logit blend,
// honest confidence tiering (High/Medium/Low), and complete elimination of the word "Safe".

import { DixonColesV25Engine } from '../lib/prediction/v25/dixonColesV25';
import { ConfidenceEngine } from '../lib/prediction/v25/confidenceEngine';
import { FeatureLayerEngine } from '../lib/prediction/v25/featureLayer';
import { DixonColesV25Evaluator } from '../lib/prediction/v25/v25Evaluator';
import { getRiskTierBadge } from '../lib/prediction/marketCatalog';
import { isTeamNewsEnabled } from '../lib/prediction/featureFlags';

export function runDixonColesV25Tests(): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  function assert(condition: boolean, testName: string, detail?: string) {
    if (!condition) {
      failures.push(`FAILED: ${testName} - ${detail || ''}`);
    }
  }

  // 1. Asian Handicap Quarter-Line Partition Test:
  // For any quarter line (e.g. -1.25, -0.75, +0.75, +1.25),
  // Win + HalfWin + Push + HalfLoss + Loss MUST sum to exactly 1.0!
  const matrix = DixonColesV25Engine.generateScorelineMatrix(1.85, 1.15);
  const quarterLines = [-1.25, -0.75, 0.25, 0.75, 1.25];

  quarterLines.forEach(line => {
    const homeOutcome = matrix.asianHandicap.home[line];
    const awayOutcome = matrix.asianHandicap.away[line];

    const sumHome = homeOutcome.win + homeOutcome.halfWin + homeOutcome.push + homeOutcome.halfLoss + homeOutcome.loss;
    const sumAway = awayOutcome.win + awayOutcome.halfWin + awayOutcome.push + awayOutcome.halfLoss + awayOutcome.loss;

    assert(
      Math.abs(sumHome - 1.0) < 0.0001,
      `Asian Handicap Quarter Line ${line} (Home) sums to 1.0`,
      `Sum: ${sumHome}`
    );
    assert(
      Math.abs(sumAway - 1.0) < 0.0001,
      `Asian Handicap Quarter Line ${line} (Away) sums to 1.0`,
      `Sum: ${sumAway}`
    );
  });

  // 2. Platt Calibration Test: Output probability is bounded in (0, 1) and continuous
  const cal1 = DixonColesV25Engine.calibratePrediction(0.85, 'match_result', 1.25);
  const cal2 = DixonColesV25Engine.calibratePrediction(0.50, 'total_goals', 2.05);
  const cal3 = DixonColesV25Engine.calibratePrediction(0.20, 'draw', 4.50);

  assert(cal1.calibratedProb > 0.50 && cal1.calibratedProb < 1.0, 'Platt calibration maintains reasonable upper bound');
  assert(cal2.calibratedProb > 0.40 && cal2.calibratedProb < 0.65, 'Platt calibration centers mid probabilities');
  assert(cal3.calibratedProb > 0.05 && cal3.calibratedProb < 0.35, 'Platt calibration handles low probabilities smoothly');

  // 3. Logit Function Invariant: sigmoid(logit(p)) == p
  const testProbs = [0.15, 0.33, 0.50, 0.68, 0.92];
  testProbs.forEach(p => {
    const roundtrip = DixonColesV25Engine.sigmoid(DixonColesV25Engine.logit(p));
    assert(Math.abs(roundtrip - p) < 0.0001, `Sigmoid-Logit roundtrip invariant for p=${p}`, `Got: ${roundtrip}`);
  });

  // 4. "Safe" Absence Test: getRiskTierBadge NEVER produces the word "SAFE"
  const badgeSafe = getRiskTierBadge('SAFE' as any);
  const badgeHigh = getRiskTierBadge('HIGH' as any);
  assert(badgeSafe.label === 'HIGH', 'Badge label for SAFE tier is converted to HIGH', `Got: ${badgeSafe.label}`);
  assert(badgeHigh.label === 'HIGH', 'Badge label for HIGH tier is HIGH', `Got: ${badgeHigh.label}`);
  assert(!badgeSafe.label.toLowerCase().includes('safe'), 'The word "Safe" does not exist in any badge label');

  // 5. Fixture Evaluation: Confidence Tiering and Absence of "Safe" across all predictions
  const fixtureContext = {
    fixtureId: 'fix_test_man_luton',
    homeTeamName: 'Manchester City',
    awayTeamName: 'Luton Town',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.85,
    homeDefenseRating: 0.50,
    awayAttackRating: 0.60,
    awayDefenseRating: 1.40,
    homeXg: 2.70,
    awayXg: 0.45,
    expectedCornersHome: 8.5,
    expectedCornersAway: 2.1,
    expectedCards: 2.8,
    uncertaintyScore: 0.05,
    dataCoverageScore: 0.98,
    sampleSizeMatches: 24,
    stateTags: [],
    lineupConfirmed: true,
    verifiedOdds: {
      homeWin: 1.15,
      draw: 8.50,
      awayWin: 18.00,
      over25Goals: 1.40,
      under25Goals: 3.10,
      bttsYes: 2.10,
      bttsNo: 1.75,
    }
  };

  const evalResult = DixonColesV25Evaluator.evaluateFixture(fixtureContext);

  assert(evalResult.predictions.length > 0, 'Dixon Coles v2.5 generates candidate predictions');

  let safeLabelFound = false;
  evalResult.predictions.forEach(p => {
    if (p.riskTier === 'SAFE' || (p.confidenceTier as any) === 'SAFE') {
      safeLabelFound = true;
    }
  });
  assert(!safeLabelFound, 'No prediction in v2.5 carries the label "SAFE"');

  // High tier pick in dominant fixture when team news enabled, or capped to Medium when team news absent (Phase 4 rule)
  if (isTeamNewsEnabled()) {
    const highTierPicks = evalResult.predictions.filter(p => p.confidenceTier === 'HIGH');
    assert(highTierPicks.length > 0, 'Dominant Manchester City fixture contains High confidence selections');
    highTierPicks.forEach(p => {
      assert((p.riskFlags || []).length === 0, 'High confidence pick has zero risk flags', p.selection);
      assert((p.uncertaintySpread ?? 1.0) <= 0.05, 'High confidence pick has narrow uncertainty spread <= 5%', p.selection);
    });
  } else {
    const highTierPicks = evalResult.predictions.filter(p => p.confidenceTier === 'HIGH');
    assert(highTierPicks.length === 0, 'No High confidence selections when team news is absent (Phase 4 rule)');
    const mediumTierPicks = evalResult.predictions.filter(p => p.confidenceTier === 'MEDIUM');
    assert(mediumTierPicks.length > 0, 'Dominant Manchester City fixture contains Medium confidence selections when capped');
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

if (require.main === module) {
  const res = runDixonColesV25Tests();
  if (res.passed) {
    console.log('ALL DIXON COLES V2.5 CORE TESTS PASSED: Quarter lines, Platt calibration, and Safe elimination verified.');
  } else {
    console.error('TESTS FAILED:\n' + res.failures.join('\n'));
    process.exit(1);
  }
}
