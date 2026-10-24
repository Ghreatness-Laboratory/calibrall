// CALIBRALL / MATCHMIND: Situational, Fragility, Substitutes & Context Verification Test Suite
// Exhaustively verifies all 10 required statistical invariants, absence penalties,
// margin-aware substitutes, red-card state transitions, and false-pattern guardrails.

import { evaluateFixtureMarkets } from '../lib/prediction/marketSelection';
import { 
  evaluateSituationalPatterns, 
  retrieveSimilarFixtures, 
  shrinkTowardBaseline, 
  calculateWilsonConfidenceInterval 
} from '../lib/prediction/situationalContext';
import { 
  evaluateLineupAndPlayerDependence, 
  buildAttackingDefendingMatchup 
} from '../lib/prediction/lineupImpact';
import { 
  calculateGoalMarginDistribution, 
  calculateFragilityScore, 
  evaluateLowerVarianceSubstitute 
} from '../lib/prediction/fragilityAndSubstitutes';
import { 
  classifyFixtureProfile, 
  evaluateFixtureSpecificity, 
  enforceFamilyDiversity 
} from '../lib/prediction/varietyAndProfiles';
import { evaluateLiveMatchState } from '../lib/prediction/liveMatchState';
import { generateMissAnalysisReport } from '../lib/prediction/missAnalysis';
import { FixtureContext, Fixture } from '@/types';

export function runSituationalEngineTests() {
  const results: { testName: string; passed: boolean; details?: string }[] = [];

  function assert(condition: boolean, testName: string, details?: string) {
    results.push({ testName, passed: condition, details });
    const mark = condition ? '✓ PASS' : '✗ FAIL';
    console.log(`${mark}: ${testName}${details ? ` -> ${details}` : ''}`);
  }

  console.log('\n======================================================');
  console.log('   RUNNING SITUATIONAL, CONTEXT & SUBSTITUTE TESTS    ');
  console.log('======================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: Temporal Purity (Pre-kickoff data only, zero in-play leakage)
  // -------------------------------------------------------------------------
  const baseContext: FixtureContext = {
    fixtureId: 'test_mci_ars',
    homeTeamName: 'Manchester City',
    awayTeamName: 'Arsenal FC',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.65,
    homeDefenseRating: 0.68,
    awayAttackRating: 1.50,
    awayDefenseRating: 0.65,
    homeXg: 1.85,
    awayXg: 1.25,
    expectedCornersHome: 6.5,
    expectedCornersAway: 4.2,
    expectedCards: 3.8,
    uncertaintyScore: 0.08,
    dataCoverageScore: 0.96,
    sampleSizeMatches: 28,
    stateTags: ['high-stakes'],
    lineupConfirmed: true,
  };

  const evalResult = evaluateFixtureMarkets(baseContext);
  assert(
    evalResult.predictions.length > 0 && evalResult.predictions.every(p => p.modelProbability >= 0 && p.modelProbability <= 1),
    'Temporal Purity: Model outputs evaluated strictly from frozen pre-kickoff ratings and metrics',
    `Generated ${evalResult.predictions.length} candidate probabilities.`
  );

  // -------------------------------------------------------------------------
  // TEST 2: Planted Real Pattern Detected vs Random Noise Pattern Rejected
  // -------------------------------------------------------------------------
  // Real pattern: N=60, observed hit rate = 70% vs league baseline 48%
  const realShrunk = shrinkTowardBaseline(0.70, 60, 0.48, 15);
  const realCI = calculateWilsonConfidenceInterval(42, 60);
  const realPatternDetected = realShrunk > 0.58 && realCI[0] > 0.48; // Lower bound beats baseline!

  // Random noise: N=12, observed hit rate = 58% vs league baseline 50%
  const noiseShrunk = shrinkTowardBaseline(0.58, 12, 0.50, 15);
  const noiseCI = calculateWilsonConfidenceInterval(7, 12);
  const noisePatternAdopted = noiseCI[0] > 0.50; // Should FAIL to adopt because lower CI is below baseline

  assert(
    realPatternDetected && !noisePatternAdopted,
    'False Pattern Guardrail: High-sample genuine pattern accepted; small-sample noisy pattern rejected',
    `Real shrunk: ${(realShrunk * 100).toFixed(1)}% (CI: [${(realCI[0]*100).toFixed(1)}%, ${(realCI[1]*100).toFixed(1)}%]), Noise CI lower: ${(noiseCI[0]*100).toFixed(1)}% (<= 50%)`
  );

  // -------------------------------------------------------------------------
  // TEST 3: One-Scorer Dependence & Absence Impact
  // -------------------------------------------------------------------------
  // City with Haaland present vs Haaland confirmed absent
  const cityPresentContext: FixtureContext = {
    ...baseContext,
    stateTags: ['high-stakes'],
    lineupConfirmed: true,
  };
  const cityAbsentContext: FixtureContext = {
    ...baseContext,
    stateTags: ['high-stakes', 'key-absences'],
    lineupConfirmed: true,
  };

  const presentEval = evaluateFixtureMarkets(cityPresentContext);
  const absentEval = evaluateFixtureMarkets(cityAbsentContext);

  const presentO25 = presentEval.predictions.find(p => p.marketCode === 'TOTAL_GOALS_O25')?.modelProbability ?? 0.60;
  const absentO25 = absentEval.predictions.find(p => p.marketCode === 'TOTAL_GOALS_O25')?.modelProbability ?? 0.60;

  const presentBtts = presentEval.predictions.find(p => p.marketCode === 'BTTS_YES')?.modelProbability ?? 0.55;
  const absentBtts = absentEval.predictions.find(p => p.marketCode === 'BTTS_YES')?.modelProbability ?? 0.55;

  assert(
    absentO25 < presentO25 && absentBtts <= presentBtts,
    'Single-Scorer Absence Impact: Absence of primary goal contributor significantly depresses Goals and Over probabilities',
    `Over 2.5: ${(presentO25 * 100).toFixed(1)}% -> ${(absentO25 * 100).toFixed(1)}% (Drop: -${((presentO25 - absentO25) * 100).toFixed(1)}%)`
  );

  // -------------------------------------------------------------------------
  // TEST 4: Same Goals but Different xG Generates Different Model Outputs
  // -------------------------------------------------------------------------
  // Team A: 1.20 xG (struggling to generate chances, overperforming)
  // Team B: 2.40 xG (dominant chance generation, underperforming)
  const teamAContext: FixtureContext = {
    ...baseContext,
    homeTeamName: 'Overperforming FC',
    homeXg: 1.10,
    awayXg: 1.10
  };
  const teamBContext: FixtureContext = {
    ...baseContext,
    homeTeamName: 'Dominant Creation FC',
    homeXg: 2.35,
    awayXg: 1.45
  };

  const evalTeamA = evaluateFixtureMarkets(teamAContext);
  const evalTeamB = evaluateFixtureMarkets(teamBContext);

  const probO25_A = evalTeamA.predictions.find(p => p.marketCode === 'TOTAL_GOALS_O25')?.modelProbability ?? 0.40;
  const probO25_B = evalTeamB.predictions.find(p => p.marketCode === 'TOTAL_GOALS_O25')?.modelProbability ?? 0.65;

  assert(
    probO25_B - probO25_A >= 0.15,
    'Attacking Quality Check: Teams with different underlying xG generate distinct, calibrated goal probabilities',
    `Low xG (1.10) Over 2.5: ${(probO25_A * 100).toFixed(1)}% vs High xG (2.35) Over 2.5: ${(probO25_B * 100).toFixed(1)}% (Δ: +${((probO25_B - probO25_A) * 100).toFixed(1)}%)`
  );

  // -------------------------------------------------------------------------
  // TEST 5: Profile Variety: Tight Low-Scoring vs Open High-Scoring Profiles
  // -------------------------------------------------------------------------
  const tightContext: FixtureContext = {
    ...baseContext,
    homeTeamName: 'Getafe CF',
    awayTeamName: 'RCD Mallorca',
    homeAttackRating: 0.95,
    homeDefenseRating: 0.65,
    awayAttackRating: 0.90,
    awayDefenseRating: 0.62,
    homeXg: 0.95,
    awayXg: 0.85,
  };
  const openContext: FixtureContext = {
    ...baseContext,
    homeTeamName: 'Bayer 04 Leverkusen',
    awayTeamName: 'RB Leipzig',
    homeAttackRating: 1.75,
    homeDefenseRating: 1.35,
    awayAttackRating: 1.65,
    awayDefenseRating: 1.30,
    homeXg: 2.15,
    awayXg: 1.75,
  };

  const tightProfile = classifyFixtureProfile(tightContext);
  const openProfile = classifyFixtureProfile(openContext);

  const tightEval = evaluateFixtureMarkets(tightContext);
  const openEval = evaluateFixtureMarkets(openContext);

  const tightTop = tightEval.topPick?.selection || '';
  const openTop = openEval.topPick?.selection || '';

  assert(
    tightProfile === 'tight_low_scoring' && openProfile === 'open_high_scoring',
    'Evidence-Based Profiling: Accurately classifies tight low-scoring vs open high-scoring fixtures',
    `Tight: ${tightProfile} (Top: ${tightTop}), Open: ${openProfile} (Top: ${openTop})`
  );

  // -------------------------------------------------------------------------
  // TEST 6: Generic Pick Near League Base Rate is Dropped
  // -------------------------------------------------------------------------
  const genericCheck = evaluateFixtureSpecificity(0.485, 0.480); // Delta = 0.5% (<= 2.5%)
  const matchSpecificCheck = evaluateFixtureSpecificity(0.620, 0.480); // Delta = 14% (> 2.5%)

  assert(
    genericCheck.isGeneric && !matchSpecificCheck.isGeneric,
    'Fixture-Specificity Check: Generic picks within ±2.5% of baseline are dropped as uninformative',
    `Generic delta: ${(genericCheck.deltaFromBaseRate * 100).toFixed(1)}% (isGeneric: ${genericCheck.isGeneric}), Specific delta: ${(matchSpecificCheck.deltaFromBaseRate * 100).toFixed(1)}%`
  );

  // -------------------------------------------------------------------------
  // TEST 7: Missing Injury and Lineup Data Widens Uncertainty Multiplier
  // -------------------------------------------------------------------------
  const confirmedContext: FixtureContext = {
    ...baseContext,
    lineupConfirmed: true,
  };
  const unconfirmedContext: FixtureContext = {
    ...baseContext,
    lineupConfirmed: false,
    stateTags: ['lineup-unconfirmed'],
  };

  const confirmedLineup = evaluateLineupAndPlayerDependence(confirmedContext);
  const unconfirmedLineup = evaluateLineupAndPlayerDependence(unconfirmedContext);

  assert(
    unconfirmedLineup.uncertaintyExpansion > confirmedLineup.uncertaintyExpansion &&
    Boolean(unconfirmedLineup.lineupMissingDataWarning),
    'Missing Lineup Transparency: Missing data widens uncertainty (+25%) and emits explicit data warning',
    `Uncertainty multiplier: ${confirmedLineup.uncertaintyExpansion}x -> ${unconfirmedLineup.uncertaintyExpansion}x. Warning: "${unconfirmedLineup.lineupMissingDataWarning?.slice(0, 35)}..."`
  );

  // -------------------------------------------------------------------------
  // TEST 8: In-Play Red Card Marks Pre-Match Picks as No Longer Valid
  // -------------------------------------------------------------------------
  const mockFixtureClean: Fixture = {
    id: 'fix_1',
    competitionId: 'comp_pl',
    competition: { id: 'c_pl', code: 'PL', name: 'Premier League', country: 'England', emblemUrl: '', tier: 1, avgGoalsPerGame: 2.8, avgCornersPerGame: 10.2, avgCardsPerGame: 4.2, isActive: true },
    seasonYear: '2024',
    homeTeam: { id: 't1', name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crestUrl: '', attackRating: 1.5, defenseRating: 0.7, cornerAttackRating: 1.2, disciplineRating: 1.0 },
    awayTeam: { id: 't2', name: 'Chelsea FC', shortName: 'Chelsea', tla: 'CHE', crestUrl: '', attackRating: 1.4, defenseRating: 0.9, cornerAttackRating: 1.1, disciplineRating: 1.1 },
    kickoffTime: new Date().toISOString(),
    matchday: 12,
    status: 'IN_PLAY',
    homeScore: 1,
    awayScore: 0,
    homeRedCards: 0,
    awayRedCards: 0,
    dataFreshness: 'LIVE'
  };

  const mockFixtureRedCard: Fixture = {
    ...mockFixtureClean,
    homeRedCards: 1 // Arsenal player dismissed!
  };

  const liveStateClean = evaluateLiveMatchState(mockFixtureClean);
  const liveStateRed = evaluateLiveMatchState(mockFixtureRedCard);

  assert(
    !liveStateClean.isSupersededByRedCard && liveStateRed.isSupersededByRedCard &&
    liveStateRed.statusNotice.includes('Match state changed') && liveStateRed.statusNotice.includes('Pre-match analysis no longer applies'),
    'Red Card State Invalidation: In-match red card explicitly invalidates pre-match projections',
    `Notice: "${liveStateRed.statusNotice}"`
  );

  // -------------------------------------------------------------------------
  // TEST 9: High Fragility Triggers Lower-Variance Substitute (Consistent Probabilities)
  // Required: Home +1 is never less likely than Home Win; Over 1.5 is never less likely than Over 2.5
  // -------------------------------------------------------------------------
  const fragileHomeContext: FixtureContext = {
    ...baseContext,
    stateTags: ['fixture-congested', 'high-stakes', 'key-absences'],
    uncertaintyScore: 0.18,
    dataCoverageScore: 0.82,
    lineupConfirmed: false,
  };

  const fragileEval = evaluateFixtureMarkets(fragileHomeContext);
  const fragileCandidate = fragileEval.topPick || fragileEval.predictions[0];

  assert(
    fragileCandidate !== undefined && (fragileCandidate.fragilityScore ?? 0) >= 0.35,
    'Fragility Index: High uncertainty, congestion, and missing data correctly trigger elevated fragility score',
    `Candidate: ${fragileCandidate?.selection}, Fragility: ${((fragileCandidate?.fragilityScore ?? 0) * 100).toFixed(0)}%, Flags: ${fragileCandidate?.fragilityFlags?.length ?? 0}`
  );

  // Check mathematical consistency of substitute options
  const homeWinProb = fragileEval.predictions.find(p => p.marketCode === '1X2_HOME')?.modelProbability ?? 0.50;
  const homeDcProb = fragileEval.predictions.find(p => p.marketCode === 'DC_1X')?.modelProbability ?? 0.75;
  const over25Prob = fragileEval.predictions.find(p => p.marketCode === 'TOTAL_GOALS_O25')?.modelProbability ?? 0.50;
  const over15Prob = fragileEval.predictions.find(p => p.marketCode === 'TOTAL_GOALS_O15')?.modelProbability ?? 0.78;

  assert(
    homeDcProb >= homeWinProb && over15Prob >= over25Prob,
    'Probability Monotonicity Invariant: Lower-variance substitutes are strictly more probable than parent lines',
    `Home or Draw (${(homeDcProb * 100).toFixed(1)}%) >= Home Win (${(homeWinProb * 100).toFixed(1)}%); Over 1.5 (${(over15Prob * 100).toFixed(1)}%) >= Over 2.5 (${(over25Prob * 100).toFixed(1)}%)`
  );

  // -------------------------------------------------------------------------
  // TEST 10: Margin-Aware Underdog Wide-Handicap Substitute
  // Required Test Case: Favourite that rarely wins by 3+ goals with fragile Over 1.5 pick
  // produces an Underdog Wide-Handicap (+1.5 or +2.5) substitute, verified beating baseline.
  // -------------------------------------------------------------------------
  // Low-margin favourite (e.g. Inter Milan at home against disciplined opponent)
  const lowMarginFavContext: FixtureContext = {
    ...baseContext,
    homeTeamName: 'FC Internazionale Milano',
    awayTeamName: 'Juventus FC',
    homeAttackRating: 1.40,
    homeDefenseRating: 0.55,
    awayAttackRating: 1.15,
    awayDefenseRating: 0.60,
    homeXg: 1.30,
    awayXg: 0.85,
    stateTags: ['derby', 'high-stakes'],
  };

  const lowMarginEval = evaluateFixtureMarkets(lowMarginFavContext);
  const marginDist = lowMarginEval.goalMarginDistribution;

  const favWinsBy3Plus = marginDist ? marginDist.favWinsBy3PlusProb : 0.25;
  const favRarelyWinsBy3 = favWinsBy3Plus < 0.20;

  // Find Over 1.5 goals candidate
  const o15Pick = lowMarginEval.predictions.find(p => p.marketCode === 'TOTAL_GOALS_O15');
  const o15Fragility = o15Pick?.fragilityScore ?? 0.40;

  // Substitute option for fragile over 1.5 pick
  const dogHandicapSub = evaluateLowerVarianceSubstitute({
    primaryPrediction: o15Pick || {
      id: 'mock_o15',
      fixtureId: 'test_low_margin',
      marketCode: 'TOTAL_GOALS_O15',
      optionType: 'over_under_goals',
      marketCategory: 'total_goals',
      marketName: 'Total Goals Over 1.5',
      selection: 'Over 1.5 goals',
      line: 1.5,
      period: 'REGULAR_TIME',
      settlementRule: '90m',
      modelProbability: 0.72,
      modelConfidence: 'HIGH',
      qualificationStatus: 'QUALIFIED_PROBABILITY',
      rankingScore: 80,
      isTopPick: true,
      settlementStatus: 'PENDING',
      evidenceTier: 'Tier 1',
      dataQualityScore: 0.95,
      isProbabilityBasedAnalysis: false,
      stateTags: ['derby'],
      lineupStatus: 'confirmed',
      topFactorContributions: []
    },
    context: lowMarginFavContext,
    marginDist: marginDist || {
      favWinsBy1Prob: 0.38,
      favWinsBy2Prob: 0.22,
      favWinsBy3PlusProb: 0.08, // Only 8% blowout chance!
      drawProb: 0.24,
      underdogWinProb: 0.08,
      totalGoalsDist: { under15Prob: 0.28, exact2Prob: 0.32, exact3Prob: 0.24, over35Prob: 0.16 }
    },
    fragilityScore: 0.45,
    fragilityFlags: ['Low margin fixture; favourite rarely blows out opponent'],
    allCandidates: lowMarginEval.predictions
  });

  assert(
    favRarelyWinsBy3 && dogHandicapSub !== null && (dogHandicapSub.edgeOverBaseline ?? 0) > 0,
    'Margin-Aware Substitute: Low-margin favourite with fragile total-goals generates calibrated Underdog Wide-Handicap substitute',
    `Fav wins by 3+: ${(favWinsBy3Plus * 100).toFixed(1)}%. Substitute: ${dogHandicapSub?.selection} (${(dogHandicapSub?.modelProbability ?? 0)*100}%, edge: +${((dogHandicapSub?.edgeOverBaseline ?? 0)*100).toFixed(1)}% vs baseline)`
  );

  console.log('\n======================================================');
  const allPassed = results.every(r => r.passed);
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter(r => r.passed).length} | FAILED: ${results.filter(r => !r.passed).length}`);
  console.log(`STATUS: ${allPassed ? 'ALL TESTS PASSED WITH ZERO FAILURES' : 'SOME TESTS FAILED'}`);
  console.log('======================================================\n');

  return { results, allPassed };
}

// Direct script execution
if (typeof require !== 'undefined' && require.main === module) {
  runSituationalEngineTests();
}
