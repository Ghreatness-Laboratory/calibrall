import assert from 'node:assert/strict';
import type { Fixture, FixtureContext, MarketPrediction } from '@/types';
import {
  resolveFootballMarketLabelAndScope,
  resolveBasketballMarketLabelAndScope,
} from '@/lib/prediction/marketCatalog';
import { evaluateV25Markets } from '@/lib/prediction/v25/v25Evaluator';
import { WhyPanelGenerator } from '@/lib/prediction/v25/whyPanel';
import {
  generateFootballExplanation,
  generateBasketballExplanation,
} from '@/lib/prediction/explanationGenerator';
import { validateExplanationConsistency } from '@/lib/prediction/explanationValidator';
import { evaluateBasketballGame, type BasketballGameEvaluation, type BasketballPickCandidate } from '@/lib/basketball/picker';
import type { BasketballGameProjection } from '@/lib/basketball/model';
import { buildSlipCandidatesFromEvaluatedSlates } from '@/lib/slips/candidateBuilder';

function assertCleanText(text: string | undefined | null, label: string) {
  const value = String(text || '');
  assert.ok(value.trim().length > 0, `${label} must be non-empty`);
  assert.ok(!value.includes('-'), `${label} must not contain ASCII hyphen: "${value}"`);
  assert.ok(!value.includes('_'), `${label} must not contain underscore: "${value}"`);
  assert.ok(!/\bbookings?\b/i.test(value), `${label} must not mention bookings: "${value}"`);
}

function makeElcheAtleticoFixture(): Fixture {
  return {
    id: 'fx_elche_atletico',
    kickoffTime: new Date(Date.now() + 86400000).toISOString(),
    status: 'TIMED',
    matchday: 29,
    competition: { id: 'PD', code: 'PD', name: 'La Liga', areaName: 'Spain' },
    homeTeam: { id: 'elche', name: 'Elche', shortName: 'Elche', crestUrl: '' },
    awayTeam: { id: 'atletico', name: 'Atlético', shortName: 'Atlético', crestUrl: '' },
    homeScore: null,
    awayScore: null,
    venue: 'Estadio Martínez Valero',
    isNeutralVenue: false,
    seasonYear: '2026 to 2027',
    lastUpdatedAt: new Date().toISOString(),
    verifiedOdds: null,
  };
}

function makeElcheAtleticoContext(): FixtureContext {
  return {
    fixtureId: 'fx_elche_atletico',
    homeTeamName: 'Elche',
    awayTeamName: 'Atlético',
    competitionCode: 'PD',
    competitionName: 'La Liga',
    homeAttackRating: 0.92,
    homeDefenseRating: 1.35,
    awayAttackRating: 1.52,
    awayDefenseRating: 0.72,
    homeXg: 0.98,
    awayXg: 2.07,
    expectedCornersHome: 4.1,
    expectedCornersAway: 6.2,
    expectedCards: 4.9,
    expectedCardsHome: 2.6,
    expectedCardsAway: 2.3,
    homeAvgScored: 0.95,
    homeAvgConceded: 1.55,
    awayAvgScored: 1.95,
    awayAvgConceded: 0.75,
    homeAvgCards: 2.55,
    awayAvgCards: 2.25,
    homeAvgYellowCards: 2.45,
    homeAvgRedCards: 0.1,
    awayAvgYellowCards: 2.15,
    awayAvgRedCards: 0.1,
    homeAvgCornersFor: 4.0,
    awayAvgCornersFor: 6.1,
    homeAvgCornersAgainst: 5.8,
    awayAvgCornersAgainst: 3.7,
    uncertaintyScore: 0.12,
    dataCoverageScore: 0.95,
    sampleSizeMatches: 22,
    homeSampleMatches: 22,
    awaySampleMatches: 22,
    leagueSampleMatches: 320,
    h2hMeetingsCount: 6,
    h2hAvgTotalGoals: 2.83,
    h2hBttsRate: 0.5,
    h2hCornersMeetingsCount: 6,
    h2hAvgTotalCorners: 10.3,
    h2hCardsMeetingsCount: 6,
    h2hAvgTotalCards: 5.1,
    hasRealTeamStrength: true,
    hasRealCornersData: true,
    hasRealCardsData: true,
    hasRealHalfTimeData: true,
    homeHtAvgScored: 0.45,
    homeHtAvgConceded: 0.72,
    awayHtAvgScored: 0.88,
    awayHtAvgConceded: 0.35,
    lineupConfirmed: false,
    refereeName: 'Mateu Lahoz',
    refereeAvgCards: 4.85,
    leagueAvgCardsBaseline: 4.45,
  };
}

function makeBasketballFixture(id: string, homeName: string, awayName: string): Fixture {
  return {
    id,
    sport: 'basketball',
    kickoffTime: new Date(Date.now() + 86400000).toISOString(),
    status: 'SCHEDULED',
    matchday: 1,
    competition: { id: 'NBA', code: 'NBA', name: 'NBA', areaName: 'USA' },
    homeTeam: { id: `${id}_h`, name: homeName, shortName: homeName, crestUrl: '' },
    awayTeam: { id: `${id}_a`, name: awayName, shortName: awayName, crestUrl: '' },
    homeScore: null,
    awayScore: null,
    seasonYear: '2026 to 2027',
    lastUpdatedAt: new Date().toISOString(),
  };
}

function makeBasketballProjection(overrides: Partial<BasketballGameProjection>): BasketballGameProjection {
  return {
    league: 'NBA',
    homeGamesPlayed: 20,
    awayGamesPlayed: 20,
    homeH1GamesPlayed: 20,
    awayH1GamesPlayed: 20,
    homeMean: 120.2,
    awayMean: 112.4,
    gameTotalMean: 232.6,
    gameTotalStd: 17.6,
    homeTeamStd: 11.4,
    awayTeamStd: 11.2,
    h1HomeMean: 60.4,
    h1AwayMean: 55.6,
    h1TotalMean: 116.0,
    h1TotalStd: 11.8,
    h1TeamStd: 8.2,
    h1ShareApplied: 0.499,
    paceAdjustment: 2.1,
    homePaceDelta: 1.2,
    awayPaceDelta: 0.9,
    homeAvgScored: 119.5,
    homeAvgAllowed: 111.0,
    awayAvgScored: 110.8,
    awayAvgAllowed: 117.8,
    homeRestDays: 2,
    awayRestDays: 1,
    homeIsB2B: false,
    awayIsB2B: false,
    neutral: false,
    needsHistory: false,
    needsH1History: false,
    abstentionReason: null,
    ...overrides,
  };
}

function runTests() {
  console.log('--- RUNNING MARKET LABELS (TEAM VS MATCH) SCOPE TESTS ---');

  // 1. Direct Market Catalog resolution checks
  const elcheHomeU25 = resolveFootballMarketLabelAndScope({
    marketCode: 'TEAM_GOALS_HOME_U25',
    rawMarketName: 'Home Team Goals Under 2.5',
    rawSelection: 'Elche Under 2.5 goals',
    homeTeam: 'Elche',
    awayTeam: 'Atlético',
    side: 'home',
    line: 2.5,
  });
  assert.equal(elcheHomeU25.marketScope, 'Elche goals');
  assert.equal(elcheHomeU25.marketName, 'Elche team goals');
  assert.equal(elcheHomeU25.selection, 'Elche team goals: Under 2.5');
  assertCleanText(elcheHomeU25.selection, 'Elche Home U2.5 selection');

  const matchO25 = resolveFootballMarketLabelAndScope({
    marketCode: 'TOTAL_GOALS_O25',
    rawMarketName: 'Total Goals',
    rawSelection: 'Over 2.5 goals',
    homeTeam: 'Elche',
    awayTeam: 'Atlético',
    line: 2.5,
  });
  assert.equal(matchO25.marketScope, 'Match goals');
  assert.equal(matchO25.selection, 'Match goals: Over 2.5 goals');

  const fhO05 = resolveFootballMarketLabelAndScope({
    marketCode: 'FH_GOALS_O05',
    rawMarketName: '1st Half Goals',
    rawSelection: '1st Half Over 0.5 goals',
    homeTeam: 'Elche',
    awayTeam: 'Atlético',
    period: 'first_half',
    line: 0.5,
  });
  assert.equal(fhO05.marketScope, '1st half match goals');
  assert.equal(fhO05.selection, '1st half match goals: Over 0.5');

  const awayMg = resolveFootballMarketLabelAndScope({
    marketCode: 'TEAM_MULTI_GOALS_AWAY_1_2',
    rawMarketName: 'Atlético multi goals',
    rawSelection: 'Atlético multi goals: 1 to 2',
    homeTeam: 'Elche',
    awayTeam: 'Atlético',
    side: 'away',
    multiGoalsMeta: { band: '1-2', minGoals: 1, maxGoals: 2, span: 2, scope: 'away' },
  });
  assert.equal(awayMg.marketScope, 'Atlético multi goals');
  assert.equal(awayMg.selection, 'Atlético team multi goals: 1 to 2');

  const homeCorners = resolveFootballMarketLabelAndScope({
    marketCode: 'TEAM_CORNERS_HOME_O45',
    rawMarketName: 'Home Team Corners',
    rawSelection: 'Elche Over 4.5 corners',
    homeTeam: 'Elche',
    awayTeam: 'Atlético',
    side: 'home',
    line: 4.5,
  });
  assert.equal(homeCorners.marketScope, 'Elche corners');
  assert.equal(homeCorners.selection, 'Elche team corners: Over 4.5');

  const awayCards = resolveFootballMarketLabelAndScope({
    marketCode: 'TEAM_CARDS_AWAY_O15',
    rawMarketName: 'Away Team Cards',
    rawSelection: 'Atlético Over 1.5 cards',
    homeTeam: 'Elche',
    awayTeam: 'Atlético',
    side: 'away',
    line: 1.5,
  });
  assert.equal(awayCards.marketScope, 'Atlético cards');
  assert.equal(awayCards.selection, 'Atlético team cards: Over 1.5');

  const bbAwayTotal = resolveBasketballMarketLabelAndScope({
    marketCode: 'BB_AWAY_TOTAL_UNDER',
    marketCategory: 'away_total',
    side: 'away',
    rawSelection: 'Sacramento Kings Under 114.5 pts',
    line: 114.5,
    homeTeam: 'Denver Nuggets',
    awayTeam: 'Sacramento Kings',
  });
  assert.equal(bbAwayTotal.marketScope, 'Sacramento Kings points');
  assert.equal(bbAwayTotal.selection, 'Sacramento Kings team total: Under 114.5 pts');

  // 2. End-to-End Football V2.5 Evaluator + Explanation Generator (Elche vs Atlético)
  const fixture = makeElcheAtleticoFixture();
  const context = makeElcheAtleticoContext();
  const v25Preds = evaluateV25Markets(context);
  const elcheU25Pred = v25Preds.find((p) => p.marketCode === 'TEAM_GOALS_HOME_U25');
  assert.ok(elcheU25Pred, 'V2.5 evaluator must produce TEAM_GOALS_HOME_U25');
  assert.equal(elcheU25Pred!.marketScope, 'Elche goals');
  assert.equal(elcheU25Pred!.selection, 'Elche team goals: Under 2.5');
  assertCleanText(elcheU25Pred!.plainEnglishReason, 'TEAM_GOALS_HOME_U25 plainEnglishReason');
  assert.ok(elcheU25Pred!.plainEnglishReason!.includes('0.98'), 'Elche team total reason must cite Elche 0.98 xG');
  assert.ok(!elcheU25Pred!.plainEnglishReason!.includes('3.05'), 'Elche team total reason must NOT cite combined 3.05 xG');
  assert.ok(!elcheU25Pred!.plainEnglishReason!.toLowerCase().includes('total xg'), 'Must NOT cite total xG');

  const elcheWhy = WhyPanelGenerator.generateWhyPanel(context, elcheU25Pred!);
  for (const f of elcheWhy.factorsFor) {
    assertCleanText(f, 'Elche U2.5 whyPanel factorFor');
    assert.ok(!f.includes('3.05'), `whyPanel factorFor leaked combined xG: ${f}`);
  }

  const elcheExp = generateFootballExplanation({
    fixture,
    evaluation: {
      topPick: elcheU25Pred!,
      predictions: v25Preds,
    },
    context,
  });
  assert.equal(elcheExp.validationPassed, true, `Elche explanation failed validation: ${elcheExp.validationIssues}`);
  assert.equal(elcheExp.activePickMarketScope, 'Elche goals');
  assert.equal(elcheExp.activePickSelection, 'Elche team goals: Under 2.5');
  assertCleanText(elcheExp.oneLineSummary, 'Elche oneLineSummary');
  assertCleanText(elcheExp.fullSummary, 'Elche fullSummary');
  assert.ok(elcheExp.fullSummary.includes('Elche team goals: Under 2.5'), 'Must use scoped title');
  assert.ok(elcheExp.fullSummary.includes('0.98'), 'Must cite Elche expected goals 0.98');
  assert.ok(elcheExp.fullSummary.includes('0.75'), 'Must cite Atlético conceding 0.75');
  assert.ok(!elcheExp.fullSummary.includes('3.05'), 'Must NOT mix in match 3.05 combined xG');
  assert.ok(!elcheExp.fullSummary.toLowerCase().includes('total xg'), 'Must NOT mention total xG');
  assert.ok(!elcheExp.fullSummary.toLowerCase().includes('low scoring projection'), 'Team total must NOT be mislabeled as low scoring match projection');
  for (const tile of elcheExp.driverTiles || []) {
    assertCleanText(tile.label, 'Elche tile label');
    assertCleanText(tile.value, 'Elche tile value');
    assert.ok(!tile.value.includes('3.05'), `Tile leaked combined xG: ${tile.label}=${tile.value}`);
  }
  assert.ok(elcheExp.driverTiles?.some((t) => t.label.includes('Elche') && t.value.includes('0.98')));

  // 3. Away Team Multi Goals (no home fallback leak, no 3.05 combined xG leak)
  const awayMgPred: MarketPrediction = {
    id: 'test_away_mg',
    marketCode: 'TEAM_MULTI_GOALS_AWAY_1_2',
    marketCategory: 'multi_goals',
    marketScope: 'Atlético multi goals',
    marketName: 'Atlético multi goals',
    selection: 'Atlético team multi goals: 1 to 2',
    optionType: 'team_multi_goals',
    period: 'regular',
    side: 'away',
    modelProbability: 0.685,
    calibratedProbability: 0.672,
    confidenceScore: 0.82,
    riskTier: 'MODERATE',
    confidenceTier: 'MEDIUM',
    isValidated: true,
    settlementRule: 'Atlético scores 1 or 2 goals in regular time.',
    multiGoalsMeta: {
      band: '1 to 2',
      minGoals: 1,
      maxGoals: 2,
      span: 2,
      scope: 'away',
      last10Hits: 7,
      last10Total: 10,
      expectedTotalGoals: 2.07,
    },
  };
  const awayMgExp = generateFootballExplanation({
    fixture,
    evaluation: { topPick: awayMgPred, predictions: [awayMgPred, ...v25Preds] },
    context,
  });
  assert.equal(awayMgExp.validationPassed, true, `Away MG validation failed: ${awayMgExp.validationIssues}`);
  assert.equal(awayMgExp.activePickMarketScope, 'Atlético multi goals');
  assertCleanText(awayMgExp.fullSummary, 'Away MG fullSummary');
  assert.ok(awayMgExp.fullSummary.includes('2.07'), 'Away MG must cite Atlético 2.07 xG');
  assert.ok(awayMgExp.fullSummary.includes('1.55'), 'Away MG must cite Elche conceding 1.55 (NOT Atlético defence!)');
  assert.ok(!awayMgExp.fullSummary.includes('3.05'), 'Away MG must NOT cite combined 3.05 xG');
  assert.ok(!awayMgExp.fullSummary.includes('0.98'), 'Away MG must NOT cite Elche 0.98 xG');

  // 4. First-half match goals (must NOT cite full-match combined 3.05 xG or full-match H2H)
  const fhGoalPred: MarketPrediction = {
    id: 'test_fh_o05',
    marketCode: 'FH_GOALS_O05',
    marketCategory: 'half_time',
    marketScope: '1st half match goals',
    marketName: '1st half match goals',
    selection: '1st half match goals: Over 0.5',
    optionType: 'first_half_goals',
    period: 'first_half',
    line: 0.5,
    modelProbability: 0.74,
    calibratedProbability: 0.73,
    confidenceScore: 0.85,
    riskTier: 'SAFE',
    confidenceTier: 'HIGH',
    isValidated: true,
    settlementRule: 'At least 1 goal scored in 1st half.',
  };
  const fhGoalExp = generateFootballExplanation({
    fixture,
    evaluation: { topPick: fhGoalPred, predictions: [fhGoalPred] },
    context,
  });
  assert.equal(fhGoalExp.validationPassed, true, `1H goal validation failed: ${fhGoalExp.validationIssues}`);
  assert.equal(fhGoalExp.activePickMarketScope, '1st half match goals');
  assertCleanText(fhGoalExp.fullSummary, '1H goal fullSummary');
  assert.ok(fhGoalExp.fullSummary.includes('1st half'), 'Must state 1st half scope');
  assert.ok(!fhGoalExp.fullSummary.includes('3.05 total xG'), '1H goal must NOT leak full match 3.05 total xG');
  assert.ok(!fhGoalExp.fullSummary.includes('2.83 total goals'), '1H goal must NOT leak full match H2H goal average');

  // 5. Team Corners & Team Cards (synthetic team-scoped picks)
  const homeCornersPred: MarketPrediction = {
    id: 'test_home_corners',
    marketCode: 'TEAM_CORNERS_HOME_O45',
    marketCategory: 'team_corners',
    marketScope: 'Elche corners',
    marketName: 'Elche corners',
    selection: 'Elche team corners: Over 4.5',
    optionType: 'corners',
    period: 'regular',
    side: 'home',
    line: 4.5,
    modelProbability: 0.64,
    calibratedProbability: 0.635,
    confidenceScore: 0.8,
    riskTier: 'MODERATE',
    confidenceTier: 'MEDIUM',
    isValidated: true,
    settlementRule: 'Elche takes 5 or more corners in regular time.',
  };
  const hcWhy = WhyPanelGenerator.generateWhyPanel(context, homeCornersPred);
  assert.ok(hcWhy.factorsFor.every((f) => !f.includes('10.3')), 'Home corners whyPanel must NOT leak combined 10.3 corners');
  const hcExp = generateFootballExplanation({
    fixture,
    evaluation: { topPick: homeCornersPred, predictions: [homeCornersPred] },
    context,
  });
  assert.equal(hcExp.validationPassed, true, `Home corners validation failed: ${hcExp.validationIssues}`);
  assertCleanText(hcExp.fullSummary, 'Home corners fullSummary');
  assert.ok(hcExp.fullSummary.includes('4.1'), 'Must cite Elche expected corners 4.1');
  assert.ok(!hcExp.fullSummary.includes('10.3'), 'Must NOT leak combined 10.3 match corners');

  const awayCardsPred: MarketPrediction = {
    id: 'test_away_cards',
    marketCode: 'TEAM_CARDS_AWAY_O15',
    marketCategory: 'bookings',
    marketScope: 'Atlético cards',
    marketName: 'Atlético cards',
    selection: 'Atlético team cards: Over 1.5',
    optionType: 'team_bookings',
    period: 'regular',
    side: 'away',
    line: 1.5,
    modelProbability: 0.69,
    calibratedProbability: 0.68,
    confidenceScore: 0.82,
    riskTier: 'MODERATE',
    confidenceTier: 'MEDIUM',
    isValidated: true,
    settlementRule: 'Atlético receives 2 or more cards in regular time.',
  };
  const acWhy = WhyPanelGenerator.generateWhyPanel(context, awayCardsPred);
  assert.ok(acWhy.factorsFor.every((f) => !f.includes('4.90')), 'Away cards whyPanel must NOT leak combined 4.90 cards');
  const acExp = generateFootballExplanation({
    fixture,
    evaluation: { topPick: awayCardsPred, predictions: [awayCardsPred] },
    context,
  });
  assert.equal(acExp.validationPassed, true, `Away cards validation failed: ${acExp.validationIssues}`);
  assertCleanText(acExp.fullSummary, 'Away cards fullSummary');
  assert.ok(acExp.fullSummary.includes('2.3'), 'Must cite Atlético expected cards 2.3');
  assert.ok(!acExp.fullSummary.includes('4.9'), 'Must NOT leak combined 4.9 total cards');

  // 6. Basketball Away Team Total & 1st Half Team Total (using evaluateBasketballGame + generateBasketballExplanation)
  const bbFixture = makeBasketballFixture('bb_den_sac', 'Denver Nuggets', 'Sacramento Kings');
  const bbProj = makeBasketballProjection({
    homeMean: 120.2,
    awayMean: 109.1,
    gameTotalMean: 229.3,
    homeAvgScored: 119.5,
    homeAvgAllowed: 110.2,
    awayAvgScored: 108.4,
    awayAvgAllowed: 118.6,
  });
  const bbAwayPick: BasketballPickCandidate = {
    marketCode: 'BB_AWAY_TOTAL_UNDER',
    marketCategory: 'away_total',
    marketScope: 'Sacramento Kings points',
    side: 'away',
    selection: 'Sacramento Kings team total: Under 114.5 pts',
    line: 114.5,
    projectedMean: 109.1,
    projectedStd: 11.2,
    rawProbability: 0.685,
    calibratedProbability: 0.662,
    marketOdds: 1.91,
    impliedProbability: 0.5236,
    expectedValue: 0.264,
    isModelLine: false,
    priceSource: 'Pinnacle',
    league: 'NBA',
    tier: 'HIGH',
    qualificationStatus: 'QUALIFIED',
    uncertaintySpread: 0.04,
    isTopPick: true,
    evidenceLine: 'Sacramento Kings projected at 109.1 pts against Denver Nuggets allowing 110.2 pts.',
  };
  const bbEval: BasketballGameEvaluation = {
    gameId: bbFixture.id,
    league: 'NBA',
    projection: bbProj,
    needsHistory: false,
    abstentionReason: null,
    topPick: bbAwayPick,
    picks: [bbAwayPick],
  };
  const bbAwayExp = generateBasketballExplanation({ fixture: bbFixture, evaluation: bbEval });
  assert.equal(bbAwayExp.validationPassed, true, `BB away team total failed validation: ${bbAwayExp.validationIssues}`);
  assert.equal(bbAwayExp.activePickMarketScope, 'Sacramento Kings points');
  assertCleanText(bbAwayExp.fullSummary, 'BB away team total fullSummary');
  assert.ok(bbAwayExp.fullSummary.includes('108.4'), 'Away team total MUST use awayAvgScored (108.4)');
  assert.ok(bbAwayExp.fullSummary.includes('110.2'), 'Away team total MUST use homeAvgAllowed (110.2)');
  assert.ok(!bbAwayExp.fullSummary.includes('229.3'), 'Away team total must NOT leak gameTotalMean 229.3');
  assert.ok(!bbAwayExp.fullSummary.includes('119.5'), 'Away team total must NOT cite homeAvgScored 119.5');
  assert.ok(!bbAwayExp.fullSummary.toLowerCase().includes('total pts'), 'Away team total must NOT cite total pts');
  assert.ok(
    bbAwayExp.driverTiles?.every((t) => t.label !== 'Projected total' && t.label !== 'Split projection'),
    'Away team total driver tiles must NOT emit Projected total or Split projection'
  );

  // Check evaluateBasketballGame emits marketScope and scoped selection names
  const evaluatedBb = evaluateBasketballGame({
    gameId: 'bb_eval_scope',
    league: 'NBA',
    homeTeamName: 'Denver Nuggets',
    awayTeamName: 'Sacramento Kings',
    projection: bbProj,
    quotes: [
      {
        id: 'q1',
        game_id: 'bb_eval_scope',
        league: 'NBA',
        market_category: 'away_total',
        side: 'away',
        line: 114.5,
        over_odds: 1.9,
        under_odds: 1.91,
        bookmaker: 'Pinnacle',
        observed_at: new Date().toISOString(),
      },
    ],
  });
  assert.ok(evaluatedBb.picks.length > 0, 'Basketball picker should emit scoped picks');
  const pickedAway = evaluatedBb.picks.find((p) => p.marketCategory === 'away_total');
  assert.ok(pickedAway, 'Should include away_total pick');
  assert.equal(pickedAway!.marketScope, 'Sacramento Kings points');
  assert.ok(pickedAway!.selection.startsWith('Sacramento Kings team total:'), `Unexpected BB selection: ${pickedAway!.selection}`);

  // 7. Validator explicitly catches combined-total leaks on scoped markets
  const leakedFbValidation = validateExplanationConsistency({
    sport: 'football',
    homeTeam: 'Elche',
    awayTeam: 'Atlético',
    activePick: {
      marketCode: 'TEAM_GOALS_HOME_U25',
      selection: 'Elche team goals: Under 2.5',
      probability: 0.85,
      confidenceTier: 'HIGH',
      side: 'home',
    },
    explanation: {
      oneLineSummary: 'Model recommends Elche team goals: Under 2.5 at 85.0% (High confidence).',
      fullSummary:
        'Model recommends Elche team goals: Under 2.5 at 85.0% (High confidence). Match carries 3.05 total xG with a low scoring projection. Team news is not confirmed yet.',
    },
  });
  assert.equal(leakedFbValidation.valid, false);
  assert.ok(
    leakedFbValidation.issues.some((i) => i.code === 'TEAM_SCOPE_LEAK_COMBINED_TOTAL'),
    'Validator must catch combined total leak on football team total'
  );

  const leakedBbValidation = validateExplanationConsistency({
    sport: 'basketball',
    homeTeam: 'Denver Nuggets',
    awayTeam: 'Sacramento Kings',
    activePick: {
      marketCode: 'BB_HOME_TOTAL_OVER',
      marketCategory: 'home_total',
      side: 'home',
      selection: 'Denver Nuggets team total: Over 116.5 pts',
      probability: 0.625,
      confidenceTier: 'HIGH',
    },
    explanation: {
      oneLineSummary: 'Model recommends Denver Nuggets team total: Over 116.5 pts at 62.5% (High confidence).',
      fullSummary:
        'Model recommends Denver Nuggets team total: Over 116.5 pts at 62.5% (High confidence). Model projects 232.6 total pts overall.',
    },
  });
  assert.equal(leakedBbValidation.valid, false);
  assert.ok(
    leakedBbValidation.issues.some((i) => i.code === 'BB_TEAM_SCOPE_LEAK_GAME_TOTAL'),
    'Validator must catch combined game total leak on NBA team total'
  );

  // 8. Slip Candidate Builder carries marketScope cleanly on both sports
  const slipOutput = buildSlipCandidatesFromEvaluatedSlates({
    input: {
      day: 'today',
      sport: 'all',
      competitionIds: [],
      markets: [],
      oddsBasis: 'model_fair',
      bestPriceComparison: false,
      nowMs: Date.now(),
    },
    footballEntries: [
      {
        fixture,
        context,
        evalResult: {
          topPick: elcheU25Pred!,
          predictions: [elcheU25Pred!],
          rankedOptions: [elcheU25Pred!],
          contextEvaluation: {
            allSignals: [],
            activeMultiplier: 1,
            summaryText: 'No unusual situational shifts.',
          },
          noRecommendationReason: undefined,
        },
        snapshots: [],
      },
    ],
    basketballEntries: [
      {
        fixture: bbFixture,
        evaluation: bbEval,
        quotes: [],
      },
    ],
    flaggedFixtureIds: new Set<string>(),
    skipDayFilter: true,
  });
  const fbSlipLeg = slipOutput.candidates.find((c) => c.sport === 'football');
  const bbSlipLeg = slipOutput.candidates.find((c) => c.sport === 'basketball');
  assert.ok(fbSlipLeg, 'Expected football slip candidate leg');
  assert.equal(fbSlipLeg!.marketScope, 'Elche goals');
  assertCleanText(fbSlipLeg!.selection, 'Football slip leg selection');
  assert.ok(bbSlipLeg, 'Expected basketball slip candidate leg');
  assert.equal(bbSlipLeg!.marketScope, 'Sacramento Kings points');
  assertCleanText(bbSlipLeg!.selection, 'Basketball slip leg selection');

  console.log('ALL MARKET LABELS (TEAM VS MATCH) SCOPE TESTS PASSED.');
}

runTests();
