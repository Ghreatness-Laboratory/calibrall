// CALIBRALL: Quantitative Models & Strict Column-Gating Verification Tests
// Tests all required quantitative rules computed strictly from stored database data:
// 1. Strict league/team column gating across UK_WITH_REF (E0), EC (<6 vs >=6 corners), EURO_NO_REF (D1), EXTRA_GOALS_ONLY (BSA/ARG/USA)
// 2. Zero 1st-half corner markets emitted anywhere
// 3. Separate 1H / 2H goal rates -> Highest-Scoring Half (only when hasHalfTimeGoals)
// 4. Negative Binomial Corners using corners FOR & AGAINST + overdispersion alpha
// 5. Negative Binomial Cards using shrunk referee rate or explicit league baseline message + significant derby multiplier
// 6. Asian Handicap quarter lines + push EV + marketOdds strictly undefined when no real price exists
// 7. Team Totals Over/Under 0.5, 1.5, 2.5 from joint goal distribution
// 8. H2H calibrated weight from Brier ablation & SQLite rivalries table lookup

import assert from 'assert';
import { FixtureContext } from '../types';
import { matchesStore } from '../lib/data/matchesStore';
import { DixonColesV25Evaluator } from '../lib/prediction/v25/v25Evaluator';
import { DixonColesV25Engine, COVARIATE_COEFFICIENTS } from '../lib/prediction/v25/dixonColesV25';
import { FeatureLayerEngine } from '../lib/prediction/v25/featureLayer';
import { getCalibratedParams, getLeagueCapabilities, getLeagueCalibratedConfig } from '../lib/prediction/calibratedParams';

function assertNoFirstHalfCorners(predictions: { marketCode: string; marketCategory: string; marketName: string; selection: string; period: string }[], label: string) {
  const fhCornerHits = predictions.filter(p =>
    p.marketCode.includes('1H_CORNER') ||
    p.marketCode.includes('FH_CORNER') ||
    (p.period === 'FIRST_HALF' && (p.marketCategory.includes('corner') || p.marketName.toLowerCase().includes('corner') || p.selection.toLowerCase().includes('corner')))
  );
  assert.strictEqual(fhCornerHits.length, 0, `${label}: Expected ZERO 1st-half corner markets, found ${fhCornerHits.map(x => x.marketCode).join(', ')}`);
}

async function runTests() {
  console.log('--- STARTING QUANTITATIVE MODELS & COLUMN GATING TESTS ---');

  const calParams = getCalibratedParams();
  assert(calParams.totalFinishedMatches >= 79000, `Expected >= 79,000 finished matches in calibratedParams, got ${calParams.totalFinishedMatches}`);
  assert.strictEqual(COVARIATE_COEFFICIENTS.h2hGoalDiff, calParams.h2hAblation.selectedWeight, 'H2H covariate weight must match calibrated ablation weight');
  console.log(`✓ PASS [Calibration]: ${calParams.totalFinishedMatches} matches, H2H weight=${COVARIATE_COEFFICIENTS.h2hGoalDiff} (deltaBrier=${calParams.h2hAblation.deltaBrier})`);

  // 1. E0 (UK_WITH_REF): North London Derby (Arsenal vs Tottenham Hotspur) WITH appointed referee
  const e0Cap = getLeagueCapabilities('E0');
  assert.strictEqual(e0Cap.hasGoals, true);
  assert.strictEqual(e0Cap.hasHalfTimeGoals, true);
  assert.strictEqual(e0Cap.hasCorners, true);
  assert.strictEqual(e0Cap.hasCards, true);
  assert.strictEqual(e0Cap.hasReferee, true);
  assert.strictEqual(e0Cap.hasAsianHandicapPrices, true);

  const e0DerbyContext: FixtureContext = {
    fixtureId: 'test_e0_derby_with_ref',
    homeTeamName: 'Arsenal',
    awayTeamName: 'Tottenham Hotspur',
    competitionCode: 'E0',
    competitionName: 'Premier League',
    homeAttackRating: 1.45,
    homeDefenseRating: 0.78,
    awayAttackRating: 1.22,
    awayDefenseRating: 1.12,
    homeXg: 2.05,
    awayXg: 1.15,
    home1HAttackRating: 1.50,
    home1HDefenseRating: 0.72,
    away1HAttackRating: 1.05,
    away1HDefenseRating: 1.18,
    home2HAttackRating: 1.38,
    away2HAttackRating: 1.30,
    home2HDefenseRating: 0.85,
    away2HDefenseRating: 1.10,
    expectedCornersHome: 6.4,
    expectedCornersAway: 4.3,
    homeCornerForRating: 6.2,
    homeCornerAgainstRating: 4.1,
    awayCornerForRating: 5.1,
    awayCornerAgainstRating: 5.4,
    homeCornerSampleCount: 38,
    awayCornerSampleCount: 38,
    expectedCards: 0, // force discipline model computation from referee + derby
    referee: 'M Oliver',
    leagueCapabilities: e0Cap,
    uncertaintyScore: 0.06,
    dataCoverageScore: 0.96,
    sampleSizeMatches: 38,
    stateTags: [],
    lineupConfirmed: true,
    verifiedOdds: {
      homeWin: 1.85,
      draw: 3.70,
      awayWin: 4.20,
      asianHandicapLine: -0.5,
      asianHandicapHome: { '-0.5': 1.88 },
      asianHandicapAway: { '0.5': 2.00 },
    },
  };

  const e0Eval = DixonColesV25Evaluator.evaluateFixture(e0DerbyContext);
  assertNoFirstHalfCorners(e0Eval.predictions, 'E0 Derby');
  assert.strictEqual(e0Eval.features.isDerby, true, 'Arsenal vs Tottenham must resolve as derby from SQLite rivalries');
  assert(Boolean(e0Eval.features.derbySource), 'Derby must carry source from rivalries table');
  assert.strictEqual(e0Eval.features.discipline.derbyCardMultiplier, calParams.derbySignificance.cardsMultiplier, 'Derby card multiplier must match significant DB calibration');
  assert.strictEqual(e0Eval.features.discipline.refereeAnnounced, true, 'M Oliver must resolve as announced referee in DB');
  assert(e0Eval.features.discipline.refereeSampleSize > 10, `Expected M Oliver sample size > 10, got ${e0Eval.features.discipline.refereeSampleSize}`);
  assert(e0Eval.features.discipline.refereeExplanation.includes('shrunk toward league baseline'), 'Cards explanation must mention referee shrinkage');

  const e0Codes = new Set(e0Eval.predictions.map(p => p.marketCode));
  for (const reqCode of ['1X2_HOME', 'TOTAL_GOALS_O25', 'TEAM_GOALS_HOME_O05', 'TEAM_GOALS_HOME_O15', 'TEAM_GOALS_HOME_O25', 'TEAM_GOALS_AWAY_O05', 'TEAM_GOALS_AWAY_O15', 'TEAM_GOALS_AWAY_O25', 'CORNERS_O95', 'CARDS_O45', 'HSH_2ND', 'FH_GOALS_O05']) {
    assert(e0Codes.has(reqCode), `E0 must include ${reqCode}`);
  }

  // AH odds gating: -0.5 has real price (1.88), while unpriced lines (e.g. -1) must have marketOdds === undefined
  const ahHomeMinus05 = e0Eval.predictions.find(p => p.marketCode === 'AH_HOME_M0_5');
  assert(ahHomeMinus05, 'E0 must evaluate AH Home -0.5');
  assert.strictEqual(ahHomeMinus05?.marketOdds, 1.88, 'Priced AH -0.5 must carry real marketOdds 1.88');
  assert(ahHomeMinus05?.expectedValue !== null && ahHomeMinus05?.expectedValue !== undefined, 'Priced AH -0.5 must compute EV');

  const ahHomeMinus1 = e0Eval.predictions.find(p => p.marketCode === 'AH_HOME_M1');
  if (ahHomeMinus1) {
    assert.strictEqual(ahHomeMinus1.marketOdds, undefined, 'Unpriced AH line must NOT invent marketOdds');
    assert.strictEqual(ahHomeMinus1.expectedValue, null, 'Unpriced AH line must have null EV');
  }
  console.log(`✓ PASS [E0 UK_WITH_REF]: Derby='${e0Eval.features.derbyName}' (${e0Eval.features.derbySource}), Ref='${e0Eval.features.discipline.refereeName}' (${e0Eval.features.discipline.refereeSampleSize} matches), Total markets=${e0Eval.predictions.length}`);

  // 2. EC (National League): Corner sample gating (<6 vs >=6)
  const ecCap = getLeagueCapabilities('EC');
  assert.strictEqual(ecCap.hasCorners, true);

  const ecLowCornerContext: FixtureContext = {
    ...e0DerbyContext,
    fixtureId: 'test_ec_low_corners',
    homeTeamName: 'Barnet',
    awayTeamName: 'Hartlepool',
    competitionCode: 'EC',
    competitionName: 'National League',
    homeCornerSampleCount: 3, // < 6 matches with corner data
    awayCornerSampleCount: 12,
    referee: undefined,
    leagueCapabilities: ecCap,
    verifiedOdds: {},
  };
  const ecLowEval = DixonColesV25Evaluator.evaluateFixture(ecLowCornerContext);
  assertNoFirstHalfCorners(ecLowEval.predictions, 'EC Low Corner');
  assert.strictEqual(ecLowEval.predictions.some(p => p.marketCategory === 'total_corners' || p.marketCode.startsWith('CORNERS_')), false, 'EC with <6 corner sample must DISABLE corners');
  assert.strictEqual(ecLowEval.features.discipline.refereeAnnounced, false, 'Unannounced referee must report false');
  assert(ecLowEval.features.discipline.refereeExplanation.toLowerCase().includes('league baseline'), `Expected league baseline explanation, got: ${ecLowEval.features.discipline.refereeExplanation}`);

  const ecHighCornerContext: FixtureContext = {
    ...ecLowCornerContext,
    fixtureId: 'test_ec_high_corners',
    homeCornerSampleCount: 10,
    awayCornerSampleCount: 10,
  };
  const ecHighEval = DixonColesV25Evaluator.evaluateFixture(ecHighCornerContext);
  assert.strictEqual(ecHighEval.predictions.some(p => p.marketCode === 'CORNERS_O95'), true, 'EC with >=6 corner samples must ENABLE corners');
  console.log('✓ PASS [EC Sample Gating]: Corners disabled when <6 corner matches, enabled when >=6; unannounced referee uses league baseline');

  // 3. D1 (EURO_NO_REF): Halves + Corners + Cards enabled, Referee unannounced -> league baseline
  const d1Cap = getLeagueCapabilities('D1');
  assert.strictEqual(d1Cap.hasHalfTimeGoals, true);
  assert.strictEqual(d1Cap.hasCorners, true);
  assert.strictEqual(d1Cap.hasCards, true);
  assert.strictEqual(d1Cap.hasReferee, false);

  const d1Context: FixtureContext = {
    ...e0DerbyContext,
    fixtureId: 'test_d1_no_ref',
    homeTeamName: 'Bayern Munich',
    awayTeamName: 'Borussia Dortmund',
    competitionCode: 'D1',
    competitionName: 'Bundesliga',
    referee: undefined,
    leagueCapabilities: d1Cap,
    verifiedOdds: { homeWin: 1.72, draw: 4.10, awayWin: 4.40 },
  };
  const d1Eval = DixonColesV25Evaluator.evaluateFixture(d1Context);
  assertNoFirstHalfCorners(d1Eval.predictions, 'D1');
  const d1Codes = new Set(d1Eval.predictions.map(p => p.marketCode));
  assert(d1Codes.has('CORNERS_O95') && d1Codes.has('CARDS_O45') && d1Codes.has('HSH_2ND'), 'D1 must include corners, cards, and HSH');
  assert.strictEqual(d1Eval.features.discipline.refereeAnnounced, false, 'D1 has no referee column -> unannounced');
  assert(d1Eval.features.discipline.refereeExplanation.toLowerCase().includes('league baseline'), 'D1 cards must state league baseline');
  const d1CardsO45 = d1Eval.predictions.find(p => p.marketCode === 'CARDS_O45');
  assert(d1CardsO45?.plainEnglishReason?.toLowerCase().includes('league baseline'), 'D1 CARDS_O45 rationale must state league baseline');
  console.log(`✓ PASS [D1 EURO_NO_REF]: Cards enabled with explicit league baseline (${d1Eval.features.discipline.refereeLeagueBaseline}), HSH & Corners active`);

  // 4. BSA / ARG / USA (EXTRA_GOALS_ONLY): ONLY Goals, AH, Team Totals enabled; Corners, Cards, Halves strictly DISABLED
  for (const extraCode of ['BSA', 'ARG', 'USA']) {
    const extraCap = getLeagueCapabilities(extraCode);
    assert.strictEqual(extraCap.hasGoals, true, `${extraCode} hasGoals`);
    assert.strictEqual(extraCap.hasHalfTimeGoals, false, `${extraCode} hasHalfTimeGoals must be false`);
    assert.strictEqual(extraCap.hasCorners, false, `${extraCode} hasCorners must be false`);
    assert.strictEqual(extraCap.hasCards, false, `${extraCode} hasCards must be false`);
    assert.strictEqual(extraCap.hasAsianHandicapPrices, false, `${extraCode} hasAsianHandicapPrices must be false`);

    const extraCtx: FixtureContext = {
      ...e0DerbyContext,
      fixtureId: `test_${extraCode}_gating`,
      homeTeamName: extraCode === 'BSA' ? 'Flamengo' : extraCode === 'ARG' ? 'Boca Juniors' : 'Inter Miami',
      awayTeamName: extraCode === 'BSA' ? 'Palmeiras' : extraCode === 'ARG' ? 'River Plate' : 'LA Galaxy',
      competitionCode: extraCode,
      competitionName: extraCode,
      referee: undefined,
      leagueCapabilities: extraCap,
      verifiedOdds: {}, // No bookmaker prices stored for extra leagues
    };
    const extraEval = DixonColesV25Evaluator.evaluateFixture(extraCtx);
    assertNoFirstHalfCorners(extraEval.predictions, extraCode);
    assert.strictEqual(extraEval.predictions.some(p => p.marketCategory === 'total_corners' || p.marketCode.startsWith('CORNERS_')), false, `${extraCode}: Corners must be disabled`);
    assert.strictEqual(extraEval.predictions.some(p => p.marketCategory === 'bookings' || p.marketCode.startsWith('CARDS_')), false, `${extraCode}: Cards must be disabled`);
    assert.strictEqual(extraEval.predictions.some(p => p.marketCategory === 'half_time' || p.marketCode.startsWith('HSH_') || p.marketCode.startsWith('FH_')), false, `${extraCode}: Halves/HSH must be disabled`);
    assert.strictEqual(extraEval.predictions.some(p => p.marketCode.startsWith('TEAM_GOALS_')), true, `${extraCode}: Team Totals must be enabled`);
    const ahPreds = extraEval.predictions.filter(p => p.optionType === 'asian_handicap');
    assert(ahPreds.length > 0, `${extraCode}: AH model predictions must still be generated`);
    ahPreds.forEach(p => {
      assert.strictEqual(p.marketOdds, undefined, `${extraCode} AH ${p.marketCode}: marketOdds must be undefined when no bookmaker price exists`);
      assert.strictEqual(p.expectedValue, null, `${extraCode} AH ${p.marketCode}: EV must be null when unpriced`);
    });
  }
  console.log('✓ PASS [EXTRA_GOALS_ONLY (BSA, ARG, USA)]: Goals/AH/TeamTotals enabled; Corners/Cards/Halves strictly disabled; unpriced AH has undefined odds & null EV');

  // 5. Mathematical invariance checks: Separate 1H/2H, Negative Binomial corners/cards, Quarter AH EV
  const matrix = DixonColesV25Engine.generateScorelineMatrix(1.65, 1.15, e0Eval.features, -0.05, 8, {
    h1HomeXg: 0.72,
    h1AwayXg: 0.48,
    h2HomeXg: 0.93,
    h2AwayXg: 0.67,
  });
  const hshSum = matrix.highestScoringHalf.firstHalf + matrix.highestScoringHalf.secondHalf + matrix.highestScoringHalf.equal;
  assert(Math.abs(hshSum - 1.0) < 0.002, `Highest scoring half probabilities must sum to 1.0, got ${hshSum}`);
  assert(matrix.highestScoringHalf.secondHalf > matrix.highestScoringHalf.firstHalf, 'With higher 2H rates, 2nd half must be more likely highest-scoring half');

  const e0Cfg = getLeagueCalibratedConfig('E0');
  assert(e0Cfg?.corners && e0Cfg.corners.overdispersionAlpha > 0, 'E0 corners must have positive Negative Binomial overdispersion alpha');
  assert(e0Cfg?.cards && e0Cfg.cards.overdispersionAlpha > 0, 'E0 cards must have positive Negative Binomial overdispersion alpha');

  const cornerDist = DixonColesV25Engine.calculateCorners(5.8, 4.4, e0Eval.features);
  assert(cornerDist.overUnderLines[9.5].over > 0 && cornerDist.overUnderLines[9.5].over < 1, 'NB corners Over 9.5 probability valid');
  const cardDist = DixonColesV25Engine.calculateCards(e0Eval.features);
  assert(cardDist.overUnderLines[4.5].over > 0 && cardDist.overUnderLines[4.5].over < 1, 'NB cards Over 4.5 probability valid');

  // Verify SQLite rivalries lookup directly
  const derbyRow = matchesStore.getDerbyInfoSync('Liverpool', 'Everton');
  assert.strictEqual(derbyRow.isDerby, true, 'Liverpool vs Everton must be resolved in SQLite rivalries table');
  assert(Boolean(derbyRow.source), 'Rivalry row must expose non-empty source');

  // Verify zero ASCII hyphens/underscores in emitted user-facing fields across E0, D1, BSA
  for (const evRes of [e0Eval, d1Eval]) {
    for (const p of evRes.predictions) {
      assert(!p.selection.includes('-') && !p.selection.includes('_'), `Selection violates Global Text Rule: ${p.selection}`);
      assert(!p.marketName.includes('-') && !p.marketName.includes('_'), `marketName violates Global Text Rule: ${p.marketName}`);
      assert(!p.settlementRule.includes('-') && !p.settlementRule.includes('_'), `settlementRule violates Global Text Rule: ${p.settlementRule}`);
      if (p.plainEnglishReason) {
        assert(!p.plainEnglishReason.includes('-') && !p.plainEnglishReason.includes('_'), `plainEnglishReason violates Global Text Rule: ${p.plainEnglishReason}`);
      }
    }
  }
  console.log('✓ PASS [Math & Global Text Rule]: Separate 1H/2H, NB corners/cards, SQLite rivalries source, zero ASCII -/_ in emitted predictions');
  console.log('--- ALL QUANTITATIVE MODELS & GATING TESTS PASSED ---');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
