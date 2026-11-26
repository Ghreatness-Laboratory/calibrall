// ============================================================================
// UNIT TESTS: Deterministic Written Explanation Generator ("Why this pick")
// STRICTLY ISOLATED TEST FIXTURES — NEVER FOR PRODUCTION UI OR DATABASE
// ============================================================================

import assert from 'node:assert/strict';
import {
  generateFootballExplanation,
  generateBasketballExplanation,
} from '../lib/prediction/explanationGenerator';
import { redactExplanationForTier } from '../lib/auth/tierAccess';
import type {
  Competition,
  Fixture,
  FixtureContext,
  MarketPrediction,
} from '../types';
import type { BasketballGameEvaluation, BasketballPickCandidate } from '../lib/basketball/picker';
import type { GameProjection } from '../lib/basketball/model';

const TEST_FIXTURE_TAG = 'TEST_FIXTURE_NEVER_FOR_PRODUCTION_UI_OR_DB' as const;

function assertNoHyphensOrUnderscores(text: string, label: string) {
  assert.ok(!text.includes('-'), `[${label}] unexpected hyphen in: ${text}`);
  assert.ok(!text.includes('_'), `[${label}] unexpected underscore in: ${text}`);
}

function countSentences(text: string): number {
  const matches = text.trim().match(/[^.!?]+[.!?]+(?:\s|$)/g);
  return matches ? matches.length : 0;
}

function makeTestCompetition(code: string, name: string, country: string): Competition {
  return {
    id: `test_fixture_comp_${code.toLowerCase()}`,
    code,
    name,
    country,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.7,
    avgCornersPerGame: 10.1,
    avgCardsPerGame: 4.1,
    isActive: true,
  };
}

function makeTestFootballFixture(
  id: string,
  homeName: string,
  awayName: string,
  comp: Competition,
  options?: { insufficientData?: boolean; homeSamples?: number; awaySamples?: number; isDerby?: boolean }
): Fixture {
  return {
    id: `test_fixture_${id}`,
    providerId: `test_fixture_${id}`,
    providerName: TEST_FIXTURE_TAG,
    source: TEST_FIXTURE_TAG,
    isDemo: false,
    competitionId: comp.id,
    competition: comp,
    seasonYear: '2026/2027',
    homeTeam: {
      id: `test_fixture_home_${id}`,
      name: homeName,
      shortName: homeName,
      tla: homeName.slice(0, 3).toUpperCase(),
      crestUrl: '',
      storedMatchCount: options?.homeSamples,
    },
    awayTeam: {
      id: `test_fixture_away_${id}`,
      name: awayName,
      shortName: awayName,
      tla: awayName.slice(0, 3).toUpperCase(),
      crestUrl: '',
      storedMatchCount: options?.awaySamples,
    },
    kickoffTime: '2026-11-28T15:00:00Z',
    matchday: 14,
    status: 'TIMED',
    dataFreshness: '2026-11-26T08:00:00Z',
    insufficientData: options?.insufficientData,
    isDerby: options?.isDerby,
  };
}

function makeTestFootballPrediction(
  fixtureId: string,
  overrides: Partial<MarketPrediction>
): MarketPrediction {
  return {
    id: `test_fixture_pred_${overrides.marketCode || 'pick'}`,
    fixtureId,
    marketCode: 'TOTAL_GOALS_O25',
    optionType: 'over_under_goals',
    marketCategory: 'total_goals',
    marketName: 'Over / under goals',
    selection: 'Over 2.5 goals',
    line: 2.5,
    period: 'REGULAR_TIME',
    settlementRule: 'Regular time 90m goals',
    modelProbability: 0.642,
    modelConfidence: 'HIGH',
    qualificationStatus: 'QUALIFIED_PROBABILITY',
    rankingScore: 0.72,
    isTopPick: true,
    settlementStatus: 'PENDING',
    evidenceTier: 'Medium',
    dataQualityScore: 0.92,
    isProbabilityBasedAnalysis: !overrides.marketOdds,
    stateTags: [],
    lineupStatus: 'pre-lineup',
    topFactorContributions: [],
    confidenceTier: 'MEDIUM',
    isValidated: true,
    ...overrides,
  };
}

function makeTestBasketballFixture(
  id: string,
  homeName: string,
  awayName: string,
  league: 'NBA' | 'EUROLEAGUE' | 'NCAAB',
  sportsbookTotal?: number
): Fixture {
  return {
    id: `test_fixture_bb_${id}`,
    providerId: `test_fixture_bb_${id}`,
    providerName: TEST_FIXTURE_TAG,
    source: TEST_FIXTURE_TAG,
    sport: 'basketball',
    competitionId: `test_fixture_comp_${league.toLowerCase()}`,
    competition: makeTestCompetition(league, league, 'Test'),
    seasonYear: '2026/2027',
    homeTeam: {
      id: `test_fixture_bb_h_${id}`,
      name: homeName,
      shortName: homeName,
      tla: homeName.slice(0, 3).toUpperCase(),
      crestUrl: '',
    },
    awayTeam: {
      id: `test_fixture_bb_a_${id}`,
      name: awayName,
      shortName: awayName,
      tla: awayName.slice(0, 3).toUpperCase(),
      crestUrl: '',
    },
    kickoffTime: '2026-11-28T01:00:00Z',
    matchday: 1,
    status: 'SCHEDULED',
    dataFreshness: '2026-11-26T08:00:00Z',
    basketballStats: {
      league,
      sportsbookTotal,
    },
  };
}

function makeTestBbProjection(overrides: Partial<GameProjection>): GameProjection {
  return {
    gameId: 'test_fixture_bb_game',
    league: 'NBA',
    season: '2026-27',
    gameDate: '2026-11-28',
    neutral: false,
    needsHistory: false,
    needsH1History: false,
    abstentionReason: null,
    h1AbstentionReason: null,
    homeGamesPlayed: 18,
    awayGamesPlayed: 17,
    homeH1GamesPlayed: 18,
    awayH1GamesPlayed: 17,
    homeRestDays: 2,
    awayRestDays: 1,
    homeIsB2B: false,
    awayIsB2B: false,
    leagueRegTeamMean: 112.5,
    homeOffDelta: 4.1,
    homeDefDelta: -1.2,
    awayOffDelta: 2.3,
    awayDefDelta: 1.8,
    homeAvgScored: 118.4,
    homeAvgAllowed: 111.2,
    awayAvgScored: 114.6,
    awayAvgAllowed: 115.8,
    homePaceDelta: 1.9,
    awayPaceDelta: 1.4,
    paceAdjustment: 2.4,
    homeAdvantagePts: 2.6,
    restAdjustmentHome: 0.4,
    restAdjustmentAway: -0.2,
    otAdjustmentTotal: 1.25,
    homeRegMean: 116.8,
    awayRegMean: 110.9,
    homeMean: 117.4,
    awayMean: 111.5,
    gameTotalMean: 228.9,
    homeStd: 11.8,
    awayStd: 11.4,
    gameTotalStd: 17.6,
    teamCovariance: 24.0,
    h1HomeMean: 59.1,
    h1AwayMean: 56.0,
    h1TotalMean: 115.1,
    h1HomeStd: 8.1,
    h1AwayStd: 7.9,
    h1TotalStd: 12.1,
    h1Covariance: 10.0,
    h1ShareApplied: 0.503,
    h2hMeetings: 3,
    h2hAvgTotal: 226.0,
    ...overrides,
  };
}

function makeTestBbCandidate(overrides: Partial<BasketballPickCandidate>): BasketballPickCandidate {
  return {
    gameId: 'test_fixture_bb_game',
    league: 'NBA',
    season: '2026-27',
    kickoffUtc: '2026-11-28T01:00:00Z',
    marketCode: 'BB_GAME_TOTAL_OVER',
    marketCategory: 'game_total',
    side: 'game',
    selection: 'Over 224.5 pts',
    line: 224.5,
    projectedMean: 228.9,
    projectedStd: 17.6,
    rawProbability: 0.612,
    calibratedProbability: 0.608,
    marketOdds: 1.91,
    impliedProbability: 0.5236,
    expectedValue: 0.1613,
    isModelLine: false,
    priceSource: 'Pinnacle',
    tier: 'HIGH',
    modelConfidence: 'HIGH',
    qualificationStatus: 'QUALIFIED_VALUE',
    passedBaselineGate: true,
    isTopPick: true,
    evidenceLine: 'Test fixture evidence line',
    abstainReason: null,
    ...overrides,
  };
}

function runTests() {
  console.log('--- RUNNING WRITTEN EXPLANATION GENERATOR UNIT TESTS (ISOLATED HAND-BUILT TEST FIXTURES) ---');
  const pl = makeTestCompetition('PL', 'Premier League', 'England');
  const bl1 = makeTestCompetition('BL1', 'Bundesliga', 'Germany');
  const sa = makeTestCompetition('SA', 'Serie A', 'Italy');

  // -------------------------------------------------------------------------
  // 5 FOOTBALL TEST FIXTURES
  // -------------------------------------------------------------------------

  // Football Case 1: Normal Goals Pick (Over 2.5 goals)
  const fb1Fixture = makeTestFootballFixture('fb1', 'Arsenal', 'Newcastle', pl);
  const fb1Top = makeTestFootballPrediction(fb1Fixture.id, {
    marketCode: 'TOTAL_GOALS_O25',
    optionType: 'over_under_goals',
    marketCategory: 'total_goals',
    marketName: 'Over / under goals',
    selection: 'Over 2.5 goals',
    line: 2.5,
    modelProbability: 0.638,
    confidenceTier: 'MEDIUM',
    marketOdds: 1.76,
    expectedValue: 0.123,
  });
  const fb1Alts = [
    makeTestFootballPrediction(fb1Fixture.id, {
      marketCode: 'BTTS_YES',
      optionType: 'both_teams_to_score',
      marketCategory: 'btts',
      marketName: 'Both teams to score',
      selection: 'BTTS Yes',
      modelProbability: 0.604,
      confidenceTier: 'MEDIUM',
      isTopPick: false,
      rankingScore: 0.62,
    }),
    makeTestFootballPrediction(fb1Fixture.id, {
      marketCode: 'MULTI_GOALS_2_4',
      optionType: 'multi_goals',
      marketCategory: 'multi_goals',
      marketName: 'Multi goals',
      selection: 'Multi goals 2-4',
      modelProbability: 0.692,
      confidenceTier: 'HIGH',
      isTopPick: false,
      rankingScore: 0.58,
    }),
  ];
  const fb1Ctx: FixtureContext = {
    fixtureId: fb1Fixture.id,
    homeTeamName: 'Arsenal',
    awayTeamName: 'Newcastle',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.28,
    homeDefenseRating: 0.85,
    awayAttackRating: 1.12,
    awayDefenseRating: 1.09,
    homeXg: 1.92,
    awayXg: 1.18,
    expectedCornersHome: 6.3,
    expectedCornersAway: 4.4,
    expectedCards: 4.1,
    homeAvgScored: 2.1,
    homeAvgConceded: 0.9,
    awayAvgScored: 1.5,
    awayAvgConceded: 1.4,
    h2hMeetingsCount: 6,
    h2hAvgTotalGoals: 3.17,
    uncertaintyScore: 0.08,
    dataCoverageScore: 0.94,
    sampleSizeMatches: 22,
    homeSampleMatches: 22,
    awaySampleMatches: 21,
    lineupConfirmed: false,
    stateTags: ['high-stakes'],
  };
  const fb1Exp = generateFootballExplanation({
    fixture: fb1Fixture,
    evaluation: { topPick: fb1Top, predictions: [fb1Top, ...fb1Alts] },
    context: fb1Ctx,
  });

  // Football Case 2: Multi Goals Pick (Multi goals 2-4)
  const fb2Fixture = makeTestFootballFixture('fb2', 'Bayern', 'Dortmund', bl1, { isDerby: true });
  const fb2Top = makeTestFootballPrediction(fb2Fixture.id, {
    marketCode: 'MULTI_GOALS_2_4',
    optionType: 'multi_goals',
    marketCategory: 'multi_goals',
    marketName: 'Multi goals',
    selection: 'Multi goals 2-4',
    modelProbability: 0.714,
    confidenceTier: 'HIGH',
    priceSource: 'model line - no market price',
    expectedValue: null,
    multiGoalsMeta: {
      scope: 'full_match',
      minGoals: 2,
      maxGoals: 4,
      span: 3,
      band: '2-4',
      expectedTotalGoals: 2.95,
      last10Hits: 15,
      last10Total: 20,
    },
  });
  const fb2Alts = [
    makeTestFootballPrediction(fb2Fixture.id, {
      marketCode: 'TOTAL_GOALS_O25',
      optionType: 'over_under_goals',
      marketCategory: 'total_goals',
      marketName: 'Over / under goals',
      selection: 'Over 2.5 goals',
      modelProbability: 0.651,
      confidenceTier: 'MEDIUM',
      isTopPick: false,
      rankingScore: 0.64,
    }),
    makeTestFootballPrediction(fb2Fixture.id, {
      marketCode: 'TEAM_MULTI_GOALS_HOME_1_3',
      optionType: 'team_multi_goals',
      marketCategory: 'multi_goals',
      marketName: 'Team multi goals',
      selection: 'Bayern multi goals 1-3',
      modelProbability: 0.728,
      confidenceTier: 'HIGH',
      isTopPick: false,
      rankingScore: 0.59,
    }),
  ];
  const fb2Ctx: FixtureContext = {
    fixtureId: fb2Fixture.id,
    homeTeamName: 'Bayern',
    awayTeamName: 'Dortmund',
    competitionCode: 'BL1',
    competitionName: 'Bundesliga',
    homeAttackRating: 1.45,
    homeDefenseRating: 0.96,
    awayAttackRating: 1.24,
    awayDefenseRating: 1.11,
    homeXg: 1.85,
    awayXg: 1.10,
    expectedCornersHome: 6.1,
    expectedCornersAway: 4.2,
    expectedCards: 4.3,
    homeAvgScored: 2.3,
    homeAvgConceded: 1.0,
    awayAvgScored: 1.6,
    awayAvgConceded: 1.3,
    isDerby: true,
    uncertaintyScore: 0.09,
    dataCoverageScore: 0.91,
    sampleSizeMatches: 24,
    homeSampleMatches: 24,
    awaySampleMatches: 24,
    lineupConfirmed: false,
    stateTags: ['derby', 'fixture-congested'],
  };
  const fb2Exp = generateFootballExplanation({
    fixture: fb2Fixture,
    evaluation: { topPick: fb2Top, predictions: [fb2Top, ...fb2Alts] },
    context: fb2Ctx,
  });

  // Football Case 3: Corners Pick (Over 9.5 corners)
  const fb3Fixture = makeTestFootballFixture('fb3', 'Liverpool', 'Brentford', pl);
  const fb3Top = makeTestFootballPrediction(fb3Fixture.id, {
    marketCode: 'TOTAL_CORNERS_O95',
    optionType: 'corners',
    marketCategory: 'total_corners',
    marketName: 'Corners',
    selection: 'Over 9.5 corners',
    line: 9.5,
    modelProbability: 0.675,
    confidenceTier: 'MEDIUM',
    marketOdds: 1.83,
    expectedValue: 0.235,
  });
  const fb3Alts = [
    makeTestFootballPrediction(fb3Fixture.id, {
      marketCode: 'TEAM_CORNERS_HOME_O55',
      optionType: 'corners',
      marketCategory: 'team_corners',
      marketName: 'Corners',
      selection: 'Liverpool Over 5.5 corners',
      modelProbability: 0.640,
      confidenceTier: 'MEDIUM',
      isTopPick: false,
      rankingScore: 0.63,
    }),
    makeTestFootballPrediction(fb3Fixture.id, {
      marketCode: 'MULTI_GOALS_2_5',
      optionType: 'multi_goals',
      marketCategory: 'multi_goals',
      marketName: 'Multi goals',
      selection: 'Multi goals 2-5',
      modelProbability: 0.742,
      confidenceTier: 'MEDIUM',
      isTopPick: false,
      rankingScore: 0.55,
    }),
  ];
  const fb3Ctx: FixtureContext = {
    fixtureId: fb3Fixture.id,
    homeTeamName: 'Liverpool',
    awayTeamName: 'Brentford',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.35,
    homeDefenseRating: 0.89,
    awayAttackRating: 1.05,
    awayDefenseRating: 1.15,
    homeXg: 1.98,
    awayXg: 0.94,
    expectedCornersHome: 7.4,
    expectedCornersAway: 3.9,
    homeCornerForRating: 6.9,
    awayCornerForRating: 4.3,
    expectedCards: 3.6,
    uncertaintyScore: 0.07,
    dataCoverageScore: 0.95,
    sampleSizeMatches: 26,
    homeSampleMatches: 26,
    awaySampleMatches: 25,
    lineupConfirmed: true,
    stateTags: ['wing-heavy'],
  };
  const fb3Exp = generateFootballExplanation({
    fixture: fb3Fixture,
    evaluation: { topPick: fb3Top, predictions: [fb3Top, ...fb3Alts] },
    context: fb3Ctx,
  });

  // Football Case 4: Cards Pick with Referee Data (Over 4.5 bookings)
  const fb4Fixture = makeTestFootballFixture('fb4', 'Inter', 'Milan', sa, { isDerby: true });
  const fb4Top = makeTestFootballPrediction(fb4Fixture.id, {
    marketCode: 'CARDS_O45',
    optionType: 'bookings',
    marketCategory: 'bookings',
    marketName: 'Bookings',
    selection: 'Over 4.5 cards',
    line: 4.5,
    modelProbability: 0.662,
    confidenceTier: 'MEDIUM',
    marketOdds: 1.92,
    expectedValue: 0.271,
  });
  const fb4Alts = [
    makeTestFootballPrediction(fb4Fixture.id, {
      marketCode: 'TEAM_BOOKINGS_AWAY_O25',
      optionType: 'team_bookings',
      marketCategory: 'bookings',
      marketName: 'Team bookings',
      selection: 'Milan Over 2.5 cards',
      modelProbability: 0.598,
      confidenceTier: 'MEDIUM',
      isTopPick: false,
      rankingScore: 0.60,
    }),
    makeTestFootballPrediction(fb4Fixture.id, {
      marketCode: 'MULTI_GOALS_1_3',
      optionType: 'multi_goals',
      marketCategory: 'multi_goals',
      marketName: 'Multi goals',
      selection: 'Multi goals 1-3',
      modelProbability: 0.701,
      confidenceTier: 'HIGH',
      isTopPick: false,
      rankingScore: 0.57,
    }),
  ];
  const fb4Ctx: FixtureContext = {
    fixtureId: fb4Fixture.id,
    homeTeamName: 'Inter',
    awayTeamName: 'Milan',
    competitionCode: 'SA',
    competitionName: 'Serie A',
    homeAttackRating: 1.25,
    homeDefenseRating: 0.88,
    awayAttackRating: 1.18,
    awayDefenseRating: 0.98,
    homeXg: 1.48,
    awayXg: 1.12,
    expectedCornersHome: 5.5,
    expectedCornersAway: 4.6,
    expectedCards: 5.4,
    homeCardForRating: 2.35,
    awayCardForRating: 2.65,
    referee: 'Daniele Orsato',
    refereeAnnounced: true,
    refereeShrunkRate: 5.18,
    refereeLeagueBaseline: 4.35,
    isDerby: true,
    uncertaintyScore: 0.11,
    dataCoverageScore: 0.90,
    sampleSizeMatches: 20,
    homeSampleMatches: 20,
    awaySampleMatches: 20,
    lineupConfirmed: true,
    stateTags: ['derby'],
  };
  const fb4Exp = generateFootballExplanation({
    fixture: fb4Fixture,
    evaluation: { topPick: fb4Top, predictions: [fb4Top, ...fb4Alts] },
    context: fb4Ctx,
  });

  // Football Case 5: "Not enough history"
  const fb5Fixture = makeTestFootballFixture('fb5', 'Burnley', 'Sunderland', pl, {
    insufficientData: true,
    homeSamples: 6,
    awaySamples: 19,
  });
  const fb5Ctx: FixtureContext = {
    fixtureId: fb5Fixture.id,
    homeTeamName: 'Burnley',
    awayTeamName: 'Sunderland',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.0,
    homeDefenseRating: 1.0,
    awayAttackRating: 1.0,
    awayDefenseRating: 1.0,
    homeXg: 0,
    awayXg: 0,
    expectedCornersHome: 0,
    expectedCornersAway: 0,
    expectedCards: 0,
    uncertaintyScore: null,
    dataCoverageScore: 0.35,
    sampleSizeMatches: 6,
    homeSampleMatches: 6,
    awaySampleMatches: 19,
    insufficientData: true,
    noRecommendationReason: 'Burnley has only 6 verified matches stored; minimum 10 required.',
  };
  const fb5Exp = generateFootballExplanation({
    fixture: fb5Fixture,
    evaluation: {
      topPick: null,
      predictions: [],
      noRecommendationReason: fb5Ctx.noRecommendationReason,
    },
    context: fb5Ctx,
  });

  // Assert all 5 football outputs
  const footballSamples = [
    { label: 'FB-1 Normal Goals (Over 2.5)', exp: fb1Exp, minSentences: 3 },
    { label: 'FB-2 Multi Goals (2-4)', exp: fb2Exp, minSentences: 3 },
    { label: 'FB-3 Corners (Over 9.5)', exp: fb3Exp, minSentences: 3 },
    { label: 'FB-4 Cards + Referee Data', exp: fb4Exp, minSentences: 3 },
    { label: 'FB-5 Not Enough History', exp: fb5Exp, minSentences: 2 },
  ];

  for (const s of footballSamples) {
    assert.ok(s.exp.oneLineSummary.length > 10, `${s.label} missing oneLineSummary`);
    assert.ok(s.exp.fullSummary.length > 20, `${s.label} missing fullSummary`);
    const nSent = countSentences(s.exp.fullSummary);
    assert.ok(nSent >= s.minSentences && nSent <= 4, `${s.label} sentence count ${nSent} out of [2..4]`);
    assertNoHyphensOrUnderscores(s.exp.oneLineSummary, `${s.label} oneLine`);
    assertNoHyphensOrUnderscores(s.exp.fullSummary, `${s.label} full`);
    for (const alt of s.exp.alternates) {
      assertNoHyphensOrUnderscores(alt.selection, `${s.label} alt selection`);
      assertNoHyphensOrUnderscores(alt.marketName, `${s.label} alt marketName`);
    }
  }
  assert.ok(fb1Exp.fullSummary.includes('Over 2.5 goals') && fb1Exp.fullSummary.includes('1.76 market odds'));
  assert.ok(fb2Exp.fullSummary.includes('Multi goals 2 to 4') && fb2Exp.fullSummary.includes('range width at 3'));
  assert.ok(fb3Exp.fullSummary.includes('Over 9.5 corners') && fb3Exp.fullSummary.includes('11.3 total corners'));
  assert.ok(fb4Exp.fullSummary.includes('Orsato') && fb4Exp.fullSummary.includes('5.18 cards vs 4.35 league baseline'));
  assert.ok(fb5Exp.oneLineSummary.startsWith('Not enough history to recommend'));
  assert.equal(fb5Exp.alternates.length, 0);

  // Strict "missing values must be omitted, never invented" check for Football
  const fbMissingCtx = {
    fixtureId: fb1Fixture.id,
    homeTeamName: 'Arsenal',
    awayTeamName: 'Newcastle',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    homeAttackRating: 1.1,
    homeDefenseRating: 1.0,
    awayAttackRating: 1.0,
    awayDefenseRating: 1.0,
    expectedCornersHome: 5.0,
    expectedCornersAway: 4.0,
    expectedCards: 4.0,
    uncertaintyScore: 0.1,
    dataCoverageScore: 0.85,
    sampleSizeMatches: 20,
    homeSampleMatches: 20,
    awaySampleMatches: 20,
  } as unknown as FixtureContext;
  const fbMissingExp = generateFootballExplanation({
    fixture: fb1Fixture,
    evaluation: { topPick: fb1Top, predictions: [fb1Top] },
    context: fbMissingCtx,
  });
  assert.ok(!fbMissingExp.fullSummary.includes('0.00'), 'Must omit missing xG instead of inventing 0.00');
  assert.ok(!fbMissingExp.fullSummary.includes('N/A'), 'Must never print N/A for missing football fields');

  // -------------------------------------------------------------------------
  // 5 BASKETBALL TEST FIXTURES
  // -------------------------------------------------------------------------

  // Basketball Case 1: NBA Game Total Over
  const bb1Fix = makeTestBasketballFixture('bb1', 'Boston Celtics', 'New York Knicks', 'NBA', 224.5);
  const bb1Top = makeTestBbCandidate({
    marketCode: 'BB_GAME_TOTAL_OVER',
    marketCategory: 'game_total',
    selection: 'Over 224.5 pts',
    line: 224.5,
    projectedMean: 228.9,
    calibratedProbability: 0.608,
    tier: 'HIGH',
    marketOdds: 1.91,
    expectedValue: 0.1613,
    priceSource: 'Pinnacle',
  });
  const bb1Eval: BasketballGameEvaluation = {
    gameId: bb1Fix.id,
    league: 'NBA',
    projection: makeTestBbProjection({}),
    needsHistory: false,
    abstentionReason: null,
    topPick: bb1Top,
    picks: [
      bb1Top,
      makeTestBbCandidate({
        marketCode: 'BB_HOME_TOTAL_OVER',
        marketCategory: 'home_total',
        side: 'home',
        selection: 'Boston Celtics Over 115.5 pts',
        line: 115.5,
        projectedMean: 117.4,
        calibratedProbability: 0.576,
        tier: 'MEDIUM',
        isModelLine: true,
        marketOdds: null,
        expectedValue: null,
        isTopPick: false,
      }),
      makeTestBbCandidate({
        marketCode: 'BB_H1_GAME_TOTAL_OVER',
        marketCategory: 'h1_game_total',
        side: 'game',
        selection: '1st Half Over 112.5 pts',
        line: 112.5,
        projectedMean: 115.1,
        calibratedProbability: 0.585,
        tier: 'MEDIUM',
        isModelLine: true,
        marketOdds: null,
        expectedValue: null,
        isTopPick: false,
      }),
    ],
  };
  const bb1Exp = generateBasketballExplanation({ fixture: bb1Fix, evaluation: bb1Eval });

  // Basketball Case 2: Team Total (Model line, B2B + early sample note)
  const bb2Fix = makeTestBasketballFixture('bb2', 'Denver Nuggets', 'Sacramento Kings', 'NBA');
  const bb2Top = makeTestBbCandidate({
    marketCode: 'BB_HOME_TOTAL_OVER',
    marketCategory: 'home_total',
    side: 'home',
    selection: 'Denver Nuggets Over 116.5 pts',
    line: 116.5,
    projectedMean: 120.2,
    projectedStd: 11.4,
    calibratedProbability: 0.625,
    tier: 'HIGH',
    isModelLine: true,
    marketOdds: null,
    expectedValue: null,
    priceSource: 'model line - no market price',
  });
  const bb2Eval: BasketballGameEvaluation = {
    gameId: bb2Fix.id,
    league: 'NBA',
    projection: makeTestBbProjection({
      homeGamesPlayed: 8,
      awayGamesPlayed: 9,
      homeMean: 120.2,
      awayMean: 112.4,
      gameTotalMean: 232.6,
      homeAvgScored: 119.5,
      awayAvgAllowed: 117.8,
      paceAdjustment: 3.1,
      homeIsB2B: false,
      awayIsB2B: true,
      homeRestDays: 2,
      awayRestDays: 0,
    }),
    needsHistory: false,
    abstentionReason: null,
    topPick: bb2Top,
    picks: [
      bb2Top,
      makeTestBbCandidate({
        marketCode: 'BB_GAME_TOTAL_OVER',
        marketCategory: 'game_total',
        side: 'game',
        selection: 'Over 227.5 pts',
        line: 227.5,
        projectedMean: 232.6,
        calibratedProbability: 0.601,
        tier: 'MEDIUM',
        isModelLine: true,
        marketOdds: null,
        expectedValue: null,
        isTopPick: false,
      }),
      makeTestBbCandidate({
        marketCode: 'BB_H1_HOME_TOTAL_OVER',
        marketCategory: 'h1_team_total',
        side: 'home',
        selection: '1st Half Denver Nuggets Over 58.5 pts',
        line: 58.5,
        projectedMean: 60.4,
        calibratedProbability: 0.569,
        tier: 'MEDIUM',
        isModelLine: true,
        marketOdds: null,
        expectedValue: null,
        isTopPick: false,
      }),
    ],
  };
  const bb2Exp = generateBasketballExplanation({ fixture: bb2Fix, evaluation: bb2Eval });

  // Basketball Case 3: EuroLeague 1st Half Total Under
  const bb3Fix = makeTestBasketballFixture('bb3', 'Real Madrid', 'Olympiacos', 'EUROLEAGUE', 162.5);
  const bb3Top = makeTestBbCandidate({
    league: 'EUROLEAGUE',
    marketCode: 'BB_H1_GAME_TOTAL_UNDER',
    marketCategory: 'h1_game_total',
    side: 'game',
    selection: '1st Half Under 82.5 pts',
    line: 82.5,
    projectedMean: 78.4,
    projectedStd: 9.8,
    calibratedProbability: 0.644,
    tier: 'HIGH',
    isModelLine: false,
    marketOdds: 1.88,
    expectedValue: 0.2107,
    priceSource: 'Bet365',
  });
  const bb3Eval: BasketballGameEvaluation = {
    gameId: bb3Fix.id,
    league: 'EUROLEAGUE',
    projection: makeTestBbProjection({
      league: 'EUROLEAGUE',
      homeGamesPlayed: 14,
      awayGamesPlayed: 14,
      homeMean: 80.2,
      awayMean: 77.9,
      gameTotalMean: 158.1,
      gameTotalStd: 13.9,
      h1TotalMean: 78.4,
      homeAvgScored: 82.1,
      awayAvgAllowed: 76.4,
      paceAdjustment: -1.6,
      homeRestDays: 3,
      awayRestDays: 3,
      homeIsB2B: false,
      awayIsB2B: false,
    }),
    needsHistory: false,
    abstentionReason: null,
    topPick: bb3Top,
    picks: [
      bb3Top,
      makeTestBbCandidate({
        league: 'EUROLEAGUE',
        marketCode: 'BB_GAME_TOTAL_UNDER',
        marketCategory: 'game_total',
        side: 'game',
        selection: 'Under 162.5 pts',
        line: 162.5,
        projectedMean: 158.1,
        calibratedProbability: 0.619,
        tier: 'HIGH',
        isModelLine: false,
        marketOdds: 1.85,
        expectedValue: 0.145,
        priceSource: 'Bet365',
        isTopPick: false,
      }),
      makeTestBbCandidate({
        league: 'EUROLEAGUE',
        marketCode: 'BB_AWAY_TOTAL_UNDER',
        marketCategory: 'away_total',
        side: 'away',
        selection: 'Olympiacos Under 79.5 pts',
        line: 79.5,
        projectedMean: 77.9,
        calibratedProbability: 0.562,
        tier: 'MEDIUM',
        isModelLine: true,
        marketOdds: null,
        expectedValue: null,
        isTopPick: false,
      }),
    ],
  };
  const bb3Exp = generateBasketballExplanation({ fixture: bb3Fix, evaluation: bb3Eval });

  // Basketball Case 4: Missing Optional Fields / Abstain Case
  const bb4Fix = makeTestBasketballFixture('bb4', 'Duke', 'North Carolina', 'NCAAB');
  const bb4ProjPartial = makeTestBbProjection({
    league: 'NCAAB',
    homeGamesPlayed: 12,
    awayGamesPlayed: 12,
    homeMean: 76.2,
    awayMean: 74.1,
    gameTotalMean: 150.3,
    homeRestDays: null,
    awayRestDays: null,
    homeIsB2B: false,
    awayIsB2B: false,
  });
  // Intentionally strip optional paceAdjustment / averages in test object to prove missing values are omitted
  delete (bb4ProjPartial as any).paceAdjustment;
  delete (bb4ProjPartial as any).homeAvgScored;
  delete (bb4ProjPartial as any).awayAvgAllowed;
  const bb4Eval: BasketballGameEvaluation = {
    gameId: bb4Fix.id,
    league: 'NCAAB',
    projection: bb4ProjPartial,
    needsHistory: false,
    abstentionReason: 'Calibrated edge below threshold against sportsbook lines.',
    topPick: null,
    picks: [],
  };
  const bb4Exp = generateBasketballExplanation({ fixture: bb4Fix, evaluation: bb4Eval });

  // Basketball Case 5: "Not enough history"
  const bb5Fix = makeTestBasketballFixture('bb5', 'Paris Basketball', 'ASVEL', 'EUROLEAGUE');
  const bb5Eval: BasketballGameEvaluation = {
    gameId: bb5Fix.id,
    league: 'EUROLEAGUE',
    projection: makeTestBbProjection({
      league: 'EUROLEAGUE',
      homeGamesPlayed: 3,
      awayGamesPlayed: 15,
      needsHistory: true,
    }),
    needsHistory: true,
    abstentionReason: 'Paris Basketball has only 3 stored EuroLeague games; minimum 5 required.',
    topPick: null,
    picks: [],
  };
  const bb5Exp = generateBasketballExplanation({ fixture: bb5Fix, evaluation: bb5Eval });

  const bbSamples = [
    { label: 'BB-1 NBA Game Total Over', exp: bb1Exp, minSentences: 3 },
    { label: 'BB-2 NBA Team Total + B2B', exp: bb2Exp, minSentences: 3 },
    { label: 'BB-3 EuroLeague 1st Half Under', exp: bb3Exp, minSentences: 3 },
    { label: 'BB-4 Missing Optional Fields Abstain', exp: bb4Exp, minSentences: 2 },
    { label: 'BB-5 Not Enough History', exp: bb5Exp, minSentences: 2 },
  ];

  for (const s of bbSamples) {
    assert.ok(s.exp.oneLineSummary.length > 10, `${s.label} missing oneLineSummary`);
    assert.ok(s.exp.fullSummary.length > 20, `${s.label} missing fullSummary`);
    const nSent = countSentences(s.exp.fullSummary);
    assert.ok(nSent >= s.minSentences && nSent <= 4, `${s.label} sentence count ${nSent} out of [2..4]`);
    assertNoHyphensOrUnderscores(s.exp.oneLineSummary, `${s.label} oneLine`);
    assertNoHyphensOrUnderscores(s.exp.fullSummary, `${s.label} full`);
  }
  assert.ok(!bb4Exp.fullSummary.includes('N/A'), 'BB-4 must omit missing rest days instead of printing N/A');
  assert.ok(!bb4Exp.fullSummary.includes('pace'), 'BB-4 must omit pace sentence when paceAdjustment is missing');
  assert.ok(bb5Exp.oneLineSummary.startsWith('Not enough history to recommend'));

  // -------------------------------------------------------------------------
  // TIER GATING CHECK (Free 3 daily 1-liners vs Pro/Premium full access)
  // -------------------------------------------------------------------------
  const freeFirst = redactExplanationForTier(fb1Exp, 'free', 0)!;
  assert.equal(freeFirst.tierLocked, true);
  assert.equal(freeFirst.dailySummaryLimitReached, false);
  assert.equal(freeFirst.oneLineSummary, fb1Exp.oneLineSummary);
  assert.equal(freeFirst.fullSummary, '');
  assert.deepEqual(freeFirst.reasoning, {});
  assert.equal(freeFirst.alternates.length, 0);

  const freeFourth = redactExplanationForTier(fb1Exp, 'free', 3)!;
  assert.equal(freeFourth.tierLocked, true);
  assert.equal(freeFourth.dailySummaryLimitReached, true);
  assert.equal(freeFourth.fullSummary, '');
  assert.ok(freeFourth.oneLineSummary.includes('Daily free summary limit reached'));

  const proUnlocked = redactExplanationForTier(fb1Exp, 'pro', 5)!;
  assert.equal(proUnlocked.tierLocked, false);
  assert.equal(proUnlocked.fullSummary, fb1Exp.fullSummary);
  assert.equal(proUnlocked.alternates.length, 2);

  // Print generated text for inspection
  console.log('\n================ 5 FOOTBALL TEST OUTPUTS ================');
  for (const s of footballSamples) {
    console.log(`\n[${s.label}]`);
    console.log(`  1-liner: ${s.exp.oneLineSummary}`);
    console.log(`  Full:    ${s.exp.fullSummary}`);
    console.log(
      `  Alts:    ${
        s.exp.alternates.length > 0
          ? s.exp.alternates.map((a) => `${a.selection} (${(a.probability * 100).toFixed(1)}%)`).join(' | ')
          : 'None'
      }`
    );
  }

  console.log('\n================ 5 BASKETBALL TEST OUTPUTS ================');
  for (const s of bbSamples) {
    console.log(`\n[${s.label}]`);
    console.log(`  1-liner: ${s.exp.oneLineSummary}`);
    console.log(`  Full:    ${s.exp.fullSummary}`);
    console.log(
      `  Alts:    ${
        s.exp.alternates.length > 0
          ? s.exp.alternates.map((a) => `${a.selection} (${(a.probability * 100).toFixed(1)}%)`).join(' | ')
          : 'None'
      }`
    );
  }

  console.log('\nALL EXPLANATION GENERATOR UNIT TESTS PASSED SUCCESSFULLY.');
}

runTests();
