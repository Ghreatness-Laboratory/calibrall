// CALIBRALL: Regression Test Suite for Dixon Coles v2.5
// Real case verification: Chelsea (+1) away at Tottenham Hotspur
// In v2.4, goals-only models labeled Chelsea +1 as "SAFE", yet Tottenham won the last meeting
// at home (2-0) and London derbies carry high variance.
// In v2.5:
// 1. Feature layer detects venue H2H contradiction and London derby volatility.
// 2. Flags are raised, widening uncertainty spread.
// 3. High tier is strictly prohibited.
// 4. Asian handicap gating rejects Chelsea +1 due to venue H2H contradiction.
// 5. The model honestly ABSTAINS rather than forcing an overconfident pick.

import { evaluateFixtureMarkets } from '../lib/prediction/marketSelection';
import { isDixonColesV25Active, setDixonColesV25Active } from '../lib/prediction/v25/featureFlags';
import { ConfidenceEngine } from '../lib/prediction/v25/confidenceEngine';
import { FeatureLayerEngine } from '../lib/prediction/v25/featureLayer';
import { DixonColesV25Evaluator } from '../lib/prediction/v25/v25Evaluator';

export function runChelseaTottenhamRegressionTest(): { passed: boolean; details: string[] } {
  const details: string[] = [];

  // Ensure v2.5 is active for this test
  setDixonColesV25Active(true);

  const fixtureContext = {
    fixtureId: 'pl_2324_tot_che',
    homeTeamName: 'Tottenham Hotspur',
    awayTeamName: 'Chelsea',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    kickoffTime: '2023-11-06T20:00:00Z',
    homeAttackRating: 1.35,
    homeDefenseRating: 1.05,
    awayAttackRating: 1.40,
    awayDefenseRating: 1.00,
    homeXg: 1.62,
    awayXg: 1.48,
    expectedCornersHome: 6.2,
    expectedCornersAway: 5.4,
    expectedCards: 4.8,
    uncertaintyScore: 0.12,
    dataCoverageScore: 0.94,
    sampleSizeMatches: 24,
    stateTags: ['derby' as const],
    lineupConfirmed: true,
    verifiedOdds: {
      homeWin: 2.35,
      draw: 3.60,
      awayWin: 2.80,
      over25Goals: 1.62,
      under25Goals: 2.30,
      bttsYes: 1.55,
      bttsNo: 2.40,
      over95Corners: 1.85,
      under95Corners: 1.95,
      over45Cards: 1.80,
      under45Cards: 1.95,
    }
  };

  // 1. Evaluate fixture using v2.5
  const result = DixonColesV25Evaluator.evaluateFixture(fixtureContext);

  // 2. Check Feature Layer output
  const features = result.features;
  const hasVenueH2H = features.h2h.venueContradictionFlag;
  const isDerby = features.isDerby;

  details.push(`Venue H2H contradiction detected: ${hasVenueH2H}`);
  details.push(`London derby rivalry detected: ${isDerby}`);

  if (!hasVenueH2H) {
    return { passed: false, details: [...details, 'FAILED: Expected venue H2H contradiction for Chelsea away at Tottenham'] };
  }
  if (!isDerby) {
    return { passed: false, details: [...details, 'FAILED: Expected derby flag to be set'] };
  }

  // 3. Locate Chelsea +1 Asian Handicap candidate
  const chelseaPlusOne = result.predictions.find(
    p => p.optionType === 'asian_handicap' && (p.selection.includes('Chelsea +1') || p.selection.includes('Chelsea +1.0'))
  );

  if (!chelseaPlusOne) {
    return { passed: false, details: [...details, 'FAILED: Could not find Chelsea +1 Asian Handicap candidate'] };
  }

  details.push(`Chelsea +1 Calibrated Probability: ${(chelseaPlusOne.modelProbability * 100).toFixed(1)}%`);
  details.push(`Chelsea +1 Confidence Tier: ${chelseaPlusOne.confidenceTier}`);
  details.push(`Chelsea +1 Qualification Status: ${chelseaPlusOne.qualificationStatus}`);
  details.push(`Chelsea +1 Risk Flags: ${chelseaPlusOne.riskFlags?.join('; ')}`);
  details.push(`Chelsea +1 Abstain Reason: ${chelseaPlusOne.abstainReason}`);

  // Test 1: Confidence Tier MUST NOT be 'HIGH' and word 'SAFE' must NOT exist
  if (chelseaPlusOne.confidenceTier === 'HIGH' || chelseaPlusOne.riskTier === 'SAFE') {
    return { passed: false, details: [...details, 'FAILED: Chelsea +1 was assigned HIGH or SAFE tier despite venue and derby risks!'] };
  }

  // Test 2: Chelsea +1 must be disqualified from Top Pick due to venue contradiction
  if (result.topPick && (result.topPick.selection.includes('Chelsea +1') || result.topPick.marketCode.includes('AH_AWAY_P1'))) {
    return { passed: false, details: [...details, 'FAILED: Chelsea +1 was selected as Top Pick! Engine must abstain or pick another validated market.'] };
  }

  // Test 3: Chelsea +1 status must be NO_RECOMMENDATION
  if (chelseaPlusOne.qualificationStatus === 'QUALIFIED_VALUE') {
    return { passed: false, details: [...details, 'FAILED: Chelsea +1 was marked QUALIFIED_VALUE despite failing handicap risk gating!'] };
  }

  // Test 4: Risk flags must include venue history and derby
  const flagText = (chelseaPlusOne.riskFlags || []).join(' ').toLowerCase();
  if (!flagText.includes('venue') || !flagText.includes('rivalry') && !flagText.includes('derby')) {
    return { passed: false, details: [...details, 'FAILED: Chelsea +1 risk flags missing venue or derby explanations'] };
  }

  details.push('PASSED: Chelsea +1 at Tottenham correctly flagged venue H2H history and London derby, downgraded tier, and abstained from recommendation.');

  return {
    passed: true,
    details,
  };
}

if (require.main === module) {
  const res = runChelseaTottenhamRegressionTest();
  console.log(res.details.join('\n'));
  if (!res.passed) {
    process.exit(1);
  }
}
