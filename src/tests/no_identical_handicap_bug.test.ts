// CALIBRALL: Regression and Invariant Test Suite for Bug Fix
// Ensures no identical top picks, no fake odds or EV, dynamic handicap lines,
// per-prediction real metrics, sanity tripwires, and slate concentration alerts.

import { DixonColesV25Evaluator } from '../lib/prediction/v25/v25Evaluator';
import { marketMonitor } from '../lib/prediction/marketMonitor';
import { REAL_250_MATCHES } from '../lib/data/realMatchArchive';
import { FixtureContext } from '@/types';

export function runNoIdenticalHandicapBugTests(): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  function assert(condition: boolean, testName: string, detail?: string) {
    if (!condition) {
      failures.push(`FAILED: ${testName} - ${detail || ''}`);
    }
  }

  // -------------------------------------------------------------
  // Test 1: Distinct fixtures cannot produce identical fingerprints
  // -------------------------------------------------------------
  const fixtureA: FixtureContext = {
    fixtureId: 'test_arsenal_chelsea',
    homeTeamName: 'Arsenal FC',
    awayTeamName: 'Chelsea FC',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.55,
    homeDefenseRating: 0.65,
    awayAttackRating: 1.25,
    awayDefenseRating: 0.95,
    homeXg: 2.10,
    awayXg: 0.90,
    expectedCornersHome: 6.8,
    expectedCornersAway: 3.8,
    expectedCards: 3.5,
    uncertaintyScore: 0.06,
    dataCoverageScore: 0.96,
    sampleSizeMatches: 28,
    lineupConfirmed: true,
    verifiedOdds: {
      homeWin: 1.62,
      draw: 4.10,
      awayWin: 5.50,
      over25Goals: 1.68,
      under25Goals: 2.20,
      bttsYes: 1.72,
      bttsNo: 2.15,
      over95Corners: 1.85,
      under95Corners: 1.95,
      over45Cards: 2.20,
      under45Cards: 1.65,
    },
  };

  const fixtureB: FixtureContext = {
    fixtureId: 'test_wolves_everton',
    homeTeamName: 'Wolverhampton Wanderers',
    awayTeamName: 'Everton FC',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 0.95,
    homeDefenseRating: 1.15,
    awayAttackRating: 0.92,
    awayDefenseRating: 1.10,
    homeXg: 1.05,
    awayXg: 1.02,
    expectedCornersHome: 4.5,
    expectedCornersAway: 4.8,
    expectedCards: 4.6,
    uncertaintyScore: 0.12,
    dataCoverageScore: 0.88,
    sampleSizeMatches: 18,
    lineupConfirmed: true,
    verifiedOdds: {
      homeWin: 2.65,
      draw: 3.10,
      awayWin: 2.95,
      over25Goals: 2.25,
      under25Goals: 1.82,
      bttsYes: 1.95,
      bttsNo: 1.85,
      over95Corners: 2.05,
      under95Corners: 1.75,
      over45Cards: 1.72,
      under45Cards: 2.10,
    },
  };

  const evalA = DixonColesV25Evaluator.evaluateFixture(fixtureA);
  const evalB = DixonColesV25Evaluator.evaluateFixture(fixtureB);

  assert(evalA.topPick !== null, 'Fixture A generates a top pick');
  assert(evalB.topPick !== null, 'Fixture B generates a top pick');

  const fpA = `${evalA.topPick?.selection}|${evalA.topPick?.calibratedProbability?.toFixed(3)}|${evalA.topPick?.uncertaintySpread?.toFixed(3)}|${evalA.topPick?.dataCompletenessScore?.toFixed(2)}|${evalA.topPick?.marketOdds?.toFixed(2)}`;
  const fpB = `${evalB.topPick?.selection}|${evalB.topPick?.calibratedProbability?.toFixed(3)}|${evalB.topPick?.uncertaintySpread?.toFixed(3)}|${evalB.topPick?.dataCompletenessScore?.toFixed(2)}|${evalB.topPick?.marketOdds?.toFixed(2)}`;

  assert(
    fpA !== fpB,
    'Fixtures with different inputs produce distinct statistical fingerprints',
    `Fixture A: ${fpA} vs Fixture B: ${fpB}`
  );

  // Assert neither top pick is the fake Home +1.5 @1.90 with 74.6% prob
  assert(
    evalA.topPick?.marketOdds !== 1.90 || evalA.topPick?.selection !== 'Arsenal FC (+1.5)',
    'Fixture A does not output hardcoded Home +1.5 @1.90'
  );
  assert(
    evalB.topPick?.marketOdds !== 1.90 || evalB.topPick?.selection !== 'Wolverhampton Wanderers (+1.5)',
    'Fixture B does not output hardcoded Home +1.5 @1.90'
  );

  // -------------------------------------------------------------
  // Test 2: Missing odds must set EV to null and provide probability analysis only
  // -------------------------------------------------------------
  const fixtureNoOdds: FixtureContext = {
    fixtureId: 'test_no_odds',
    homeTeamName: 'Brentford FC',
    awayTeamName: 'Brighton & Hove Albion',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.25,
    homeDefenseRating: 1.10,
    awayAttackRating: 1.30,
    awayDefenseRating: 1.05,
    homeXg: 1.45,
    awayXg: 1.50,
    expectedCornersHome: 5.2,
    expectedCornersAway: 5.5,
    expectedCards: 3.8,
    uncertaintyScore: 0.10,
    dataCoverageScore: 0.90,
    sampleSizeMatches: 20,
    verifiedOdds: undefined, // NO ODDS
  };

  const evalNoOdds = DixonColesV25Evaluator.evaluateFixture(fixtureNoOdds);
  evalNoOdds.predictions.forEach(p => {
    assert(
      p.marketOdds === undefined,
      'When odds are missing, marketOdds is undefined',
      `${p.selection} had marketOdds=${p.marketOdds}`
    );
    assert(
      p.expectedValue === null,
      'When odds are missing, expectedValue is strictly null',
      `${p.selection} had expectedValue=${p.expectedValue}`
    );
  });

  // -------------------------------------------------------------
  // Test 3: Sanity Tripwires (EV > 15% or Market Divergence > 15 percentage points)
  // -------------------------------------------------------------
  const fixtureAbnormalOdds: FixtureContext = {
    fixtureId: 'test_abnormal_odds',
    homeTeamName: 'Bayern München',
    awayTeamName: 'Mainz 05',
    competitionCode: 'BL1',
    competitionName: 'Bundesliga',
    homeAttackRating: 1.75,
    homeDefenseRating: 0.60,
    awayAttackRating: 0.85,
    awayDefenseRating: 1.35,
    homeXg: 2.80,
    awayXg: 0.70,
    expectedCornersHome: 7.5,
    expectedCornersAway: 3.2,
    expectedCards: 3.0,
    uncertaintyScore: 0.06,
    dataCoverageScore: 0.96,
    sampleSizeMatches: 24,
    verifiedOdds: {
      homeWin: 3.50, // Insanely mispriced bookmaker odds for Bayern at home against Mainz -> EV will explode >15%!
      draw: 4.00,
      awayWin: 1.40,
    },
  };

  const evalTripwire = DixonColesV25Evaluator.evaluateFixture(fixtureAbnormalOdds);
  const bayernWin = evalTripwire.predictions.find(p => p.selection.includes('Bayern') && p.marketCategory === 'match_result');

  assert(bayernWin !== undefined, 'Bayern win prediction exists');
  if (bayernWin) {
    assert(
      bayernWin.sanityTripwire === true,
      'Sanity tripwire triggered for abnormal EV (>15%) or market divergence (>15 points)',
      `sanityTripwire: ${bayernWin.sanityTripwire}, EV: ${bayernWin.expectedValue}, Reason: ${bayernWin.tripwireReason}`
    );
    assert(
      bayernWin.isTopPick !== true,
      'Prediction triggering sanity tripwire is DISQUALIFIED from top pick',
      `isTopPick: ${bayernWin.isTopPick}`
    );
  }

  // -------------------------------------------------------------
  // Test 4: Dynamic Handicap Selection & Wide Handicap Penalty
  // -------------------------------------------------------------
  // On a competitive match (e.g. Liverpool vs Man City), handicap line must be tight (-0.5, 0.0, or +0.5), NOT fixed +1.5!
  const fixtureCompetitive: FixtureContext = {
    fixtureId: 'test_competitive_derby',
    homeTeamName: 'Liverpool FC',
    awayTeamName: 'Manchester City',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.48,
    homeDefenseRating: 0.70,
    awayAttackRating: 1.50,
    awayDefenseRating: 0.68,
    homeXg: 1.65,
    awayXg: 1.60,
    expectedCornersHome: 6.0,
    expectedCornersAway: 5.5,
    expectedCards: 4.2,
    uncertaintyScore: 0.08,
    dataCoverageScore: 0.95,
    sampleSizeMatches: 26,
    verifiedOdds: { homeWin: 2.70, draw: 3.60, awayWin: 2.50 },
  };

  const evalComp = DixonColesV25Evaluator.evaluateFixture(fixtureCompetitive);
  const zeroHandicap = evalComp.predictions.find(p => p.marketCategory === 'handicap' && p.handicapLine === 0.0);
  assert(zeroHandicap !== undefined, 'Dynamic handicap generates level line 0.0 for evenly matched fixtures');
  // Confirm that fixed +1.5 was NOT forced as the only handicap
  const plusOnePointFive = evalComp.predictions.find(p => p.marketCategory === 'handicap' && p.handicapLine === 1.5);
  assert(plusOnePointFive === undefined, 'Evenly matched fixture does not generate wide +1.5 cushion handicap line');

  // Wide handicaps (>=1.5 cushion) must NOT receive high probability ranking bonus as top pick
  const wideHandicapFixture: FixtureContext = {
    fixtureId: 'test_wide_handicap',
    homeTeamName: 'Sheffield United',
    awayTeamName: 'Arsenal FC',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 0.80,
    homeDefenseRating: 1.50,
    awayAttackRating: 1.60,
    awayDefenseRating: 0.65,
    homeXg: 0.65,
    awayXg: 2.45,
    expectedCornersHome: 3.5,
    expectedCornersAway: 7.2,
    expectedCards: 4.5,
    uncertaintyScore: 0.09,
    dataCoverageScore: 0.92,
    sampleSizeMatches: 22,
    verifiedOdds: { homeWin: 9.00, draw: 5.50, awayWin: 1.30 },
  };

  const evalWide = DixonColesV25Evaluator.evaluateFixture(wideHandicapFixture);
  if (evalWide.topPick) {
    assert(
      evalWide.topPick.selection !== 'Sheffield United (+1.5)',
      'Wide handicap (+1.5 cushion) does not automatically dominate as top pick',
      `Selected top pick: ${evalWide.topPick.selection}`
    );
  }

  // -------------------------------------------------------------
  // Test 5: Slate Concentration & Identical Metrics Monitor
  // -------------------------------------------------------------
  // Test that slate checker triggers failure if >20% share same line/side or identical metrics
  const badSlate = [
    { selection: 'Home (+1.5)', calibratedProbability: 0.748, uncertaintySpread: 0.032, dataCompletenessScore: 0.92, marketOdds: 1.90 },
    { selection: 'Home (+1.5)', calibratedProbability: 0.748, uncertaintySpread: 0.032, dataCompletenessScore: 0.92, marketOdds: 1.90 },
    { selection: 'Home (+1.5)', calibratedProbability: 0.748, uncertaintySpread: 0.032, dataCompletenessScore: 0.92, marketOdds: 1.90 },
    { selection: 'Over 2.5 Goals', calibratedProbability: 0.582, uncertaintySpread: 0.041, dataCompletenessScore: 0.94, marketOdds: 1.85 },
    { selection: 'Both Teams to Score', calibratedProbability: 0.610, uncertaintySpread: 0.038, dataCompletenessScore: 0.91, marketOdds: 1.75 },
  ];

  const slateCheckBad = marketMonitor.checkSlateConcentrationAndIdenticalMetrics(badSlate);
  assert(slateCheckBad.hasAlert === true, 'Slate concentration check detects violation when 60% share Home (+1.5)');
  assert(
    slateCheckBad.alerts.some(a => a.includes('Slate Concentration Violation')),
    'Alert mentions Slate Concentration Violation'
  );
  assert(
    slateCheckBad.alerts.some(a => a.includes('Identical Numbers Alert')),
    'Alert detects Identical Numbers when 3+ matches share identical metrics'
  );

  // -------------------------------------------------------------
  // Test 6: Slate Audit Across 40 Real European Matches from Archive
  // -------------------------------------------------------------
  const sampleMatches = REAL_250_MATCHES.slice(0, 40);
  const evaluatedPicks: any[] = [];
  const familyTally: Record<string, number> = {};

  sampleMatches.forEach(m => {
    const ctx = { ...m.context, teamStats: m.teamStats };
    const res = DixonColesV25Evaluator.evaluateFixture(ctx);
    if (res.topPick) {
      evaluatedPicks.push(res.topPick);
      const fam = res.topPick.marketFamily || res.topPick.marketCategory || 'other';
      familyTally[fam] = (familyTally[fam] || 0) + 1;
    }
  });

  assert(evaluatedPicks.length >= 15, 'Evaluated real fixtures with qualified recommendations', `Count: ${evaluatedPicks.length}`);

  // Slate concentration on real dataset: NO line/side can dominate (>30%) of the slate
  const lineTally: Record<string, number> = {};
  evaluatedPicks.forEach(p => {
    lineTally[p.selection] = (lineTally[p.selection] || 0) + 1;
  });

  Object.entries(lineTally).forEach(([selection, count]) => {
    const share = count / sampleMatches.length;
    assert(
      share <= 0.30,
      `No single line/side exceeds 30% on real slate: "${selection}" is ${(share * 100).toFixed(1)}% of slate (${count}/${sampleMatches.length})`
    );
  });

  // Verify multiple distinct market families are represented in real top picks
  const distinctFamilies = Object.keys(familyTally);
  assert(
    distinctFamilies.length >= 3,
    `Real match audit shows diverse market families represented (found ${distinctFamilies.length}: ${distinctFamilies.join(', ')})`
  );

  // Verify that Home (+1.5) does not appear on more than 1 match in the entire 25-match slate
  const homePlus15Count = evaluatedPicks.filter(p => p.selection?.includes('(+1.5)')).length;
  assert(
    homePlus15Count <= 1,
    `Home +1.5 does not dominate (found on ${homePlus15Count}/${evaluatedPicks.length} matches)`
  );

  return {
    passed: failures.length === 0,
    failures,
  };
}

if (require.main === module) {
  const res = runNoIdenticalHandicapBugTests();
  if (res.passed) {
    console.log('✅ ALL ANTI-IDENTICAL-HANDICAP TESTS PASSED!');
    console.log('- Distinct statistical fingerprints per fixture');
    console.log('- No fake odds 1.90 or fake EV');
    console.log('- Missing odds return EV null & probability analysis only');
    console.log('- Sanity tripwires block abnormal EV / market divergence');
    console.log('- Dynamic handicap line selection verified');
    console.log('- Slate concentration & identical number alerts operational');
    console.log('- Real historical match audit confirmed diverse families');
  } else {
    console.error('❌ TESTS FAILED:\n' + res.failures.join('\n'));
    process.exit(1);
  }
}
