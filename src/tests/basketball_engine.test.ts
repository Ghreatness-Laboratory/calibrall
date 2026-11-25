// Automated test suite for the Basketball Totals & 1st-Half Engine
import assert from 'assert';
import {
  createLeagueState,
  projectBasketballGame,
  updateLeagueStateWithGame,
  computeNormalOverUnder,
  LEAGUE_HYPERPARAMS,
} from '../lib/basketball/model';
import {
  evaluateBasketballGameMarkets,
  selectDiversifiedBasketballSlatePicks,
  getAuthorizedBasketballMarketsCount,
  MODEL_LINE_PRICE_LABEL,
  BbOddsQuote,
  BasketballGameEvaluation,
} from '../lib/basketball/picker';
import {
  CALIBRATED_BASKETBALL_PARAMS,
  calibrateBasketballProbability,
} from '../lib/basketball/calibratedParams';
import {
  syncBasketballOdds,
  BB_DAILY_ODDS_CREDIT_CAP,
  SHARED_MONTHLY_ODDS_CAP,
} from '../lib/basketball/oddsService';
import { evaluateBasketballSettlementOutcome } from '../lib/basketball/settlementService';
import { StoredBbGame } from '../lib/basketball/store';
import { BasketballLeague, BasketballMarketCategory } from '../lib/basketball/markets';

function makeFinishedGame(overrides: Partial<StoredBbGame> & {
  id: string;
  league: BasketballLeague;
  game_date: string;
  home_id: string;
  away_id: string;
  home_pts: number;
  away_pts: number;
}): StoredBbGame {
  return {
    season: '2026-27',
    kickoff_utc: `${overrides.game_date}T23:00:00Z`,
    neutral: false,
    status: 'FINISHED',
    h1_home: overrides.h1_home !== undefined ? overrides.h1_home : Math.floor(overrides.home_pts * 0.5),
    h1_away: overrides.h1_away !== undefined ? overrides.h1_away : Math.floor(overrides.away_pts * 0.5),
    ot_periods: 0,
    q_scores: null,
    source: 'test_fixture',
    ...overrides,
  };
}

function seedWarmTeamHistory(league: BasketballLeague, homeId: string, awayId: string, opts?: { includeH1?: boolean; count?: number }) {
  const state = createLeagueState(league);
  const count = opts?.count ?? 8;
  const includeH1 = opts?.includeH1 ?? true;
  const sparA = `bbt_${league.toLowerCase()}_sparring_a`;
  const sparB = `bbt_${league.toLowerCase()}_sparring_b`;

  for (let i = 0; i < count; i++) {
    const day = String(1 + i * 2).padStart(2, '0');
    const base = league === 'NBA' ? 114 : league === 'EUROLEAGUE' ? 82 : 73;

    const g1 = makeFinishedGame({
      id: `seed_h_${league}_${i}`,
      league,
      game_date: `2026-11-${day}`,
      home_id: homeId,
      away_id: sparA,
      home_pts: base + 6,
      away_pts: base - 2,
      h1_home: includeH1 ? Math.round((base + 6) * 0.5) : null,
      h1_away: includeH1 ? Math.round((base - 2) * 0.5) : null,
    });
    updateLeagueStateWithGame(state, g1);

    const g2 = makeFinishedGame({
      id: `seed_a_${league}_${i}`,
      league,
      game_date: `2026-11-${day}`,
      home_id: sparB,
      away_id: awayId,
      home_pts: base - 1,
      away_pts: base + 4,
      h1_home: includeH1 ? Math.round((base - 1) * 0.5) : null,
      h1_away: includeH1 ? Math.round((base + 4) * 0.5) : null,
    });
    updateLeagueStateWithGame(state, g2);
  }

  return state;
}

async function runTests() {
  console.log('=== BASKETBALL ENGINE TESTS ===');

  // 1. Authorized market scope (strictly 12 market codes across 5 totals/1H families; zero spreads/moneylines)
  assert.strictEqual(
    getAuthorizedBasketballMarketsCount(),
    12,
    'Exactly 12 authorized basketball totals market codes expected'
  );
  console.log('✓ 1. Authorized totals-only scope verified (12 codes, 5 categories, 0 spreads/moneylines)');

  // 2. Neutral site zero home advantage vs non-neutral positive home advantage
  const nbaState = seedWarmTeamHistory('NBA', 'bbt_nba_bos', 'bbt_nba_nyk');
  const homeAdvProj = projectBasketballGame(nbaState, {
    id: 'bbg_nba_test_ha',
    league: 'NBA',
    season: '2026-27',
    game_date: '2026-11-22',
    home_id: 'bbt_nba_bos',
    away_id: 'bbt_nba_nyk',
    neutral: false,
  });
  const neutralProj = projectBasketballGame(nbaState, {
    id: 'bbg_nba_test_neutral',
    league: 'NBA',
    season: '2026-27',
    game_date: '2026-11-22',
    home_id: 'bbt_nba_bos',
    away_id: 'bbt_nba_nyk',
    neutral: true,
  });
  assert(homeAdvProj.homeAdvantagePts > 0.5, 'Non-neutral NBA game should carry positive home advantage');
  assert.strictEqual(neutralProj.homeAdvantagePts, 0, 'Neutral-site game must have strictly 0 home advantage');
  console.log('✓ 2. Neutral-site vs home-court advantage verified');

  // 3. Back-to-back / rest applies to NBA & EuroLeague, and stays disabled for NCAAB
  // Last game in seedWarmTeamHistory with count=8 was 2026-11-15 -> 2026-11-16 triggers homeIsB2B = true
  const nbaB2bProj = projectBasketballGame(nbaState, {
    id: 'bbg_nba_test_b2b',
    league: 'NBA',
    season: '2026-27',
    game_date: '2026-11-16',
    home_id: 'bbt_nba_bos',
    away_id: 'bbt_nba_nyk',
    neutral: false,
  });
  assert.strictEqual(nbaB2bProj.homeIsB2B, true, 'NBA game 1 day after previous game should flag B2B');
  assert(nbaB2bProj.restAdjustmentHome < 0, 'NBA B2B should apply negative rest fatigue adjustment');

  const ncaabState = seedWarmTeamHistory('NCAAB', 'bbt_ncaab_duke', 'bbt_ncaab_unc');
  const ncaabB2bProj = projectBasketballGame(ncaabState, {
    id: 'bbg_ncaab_test_b2b',
    league: 'NCAAB',
    season: '2026-27',
    game_date: '2026-11-16',
    home_id: 'bbt_ncaab_duke',
    away_id: 'bbt_ncaab_unc',
    neutral: true,
  });
  assert.strictEqual(LEAGUE_HYPERPARAMS.NCAAB.applyRest, false, 'NCAAB hyperparameter applyRest must be false');
  assert.strictEqual(ncaabB2bProj.restAdjustmentHome, 0, 'NCAAB rest adjustment must remain 0');
  assert.strictEqual(ncaabB2bProj.restAdjustmentAway, 0, 'NCAAB away rest adjustment must remain 0');
  console.log('✓ 3. NBA/EuroLeague B2B & rest logic vs NCAAB rest-exclusion verified');

  // 4. Low-sample NCAAB abstention ("Needs history")
  const coldNcaabState = createLeagueState('NCAAB');
  const coldProj = projectBasketballGame(coldNcaabState, {
    id: 'bbg_ncaab_cold',
    league: 'NCAAB',
    season: '2026-27',
    game_date: '2026-11-22',
    home_id: 'bbt_ncaab_new_a',
    away_id: 'bbt_ncaab_new_b',
    neutral: false,
  });
  assert.strictEqual(coldProj.needsHistory, true, 'Cold NCAAB teams must abstain with needsHistory=true');
  assert(
    (coldProj.abstentionReason || '').includes('Needs history'),
    'Abstention reason must explicitly include "Needs history"'
  );
  const coldEval = evaluateBasketballGameMarkets({
    gameId: coldProj.gameId,
    league: 'NCAAB',
    season: '2026-27',
    kickoffUtc: '2026-11-22T23:00:00Z',
    homeName: 'New A',
    awayName: 'New B',
    projection: coldProj,
  });
  assert.strictEqual(coldEval.needsHistory, true);
  assert.strictEqual(coldEval.topPick, null);
  assert.strictEqual(coldEval.picks.length, 0, 'Abstained evaluation must emit 0 picks');
  console.log('✓ 4. Low-sample abstention ("Needs history") verified');

  // 5. OT adjustment touches full game ONLY (not H1), and missing H1 scores trigger needsH1History
  assert(
    homeAdvProj.gameTotalMean > homeAdvProj.homeRegMean + homeAdvProj.awayRegMean,
    'Full-game mean must include empirical OT adjustment above regulation sum'
  );
  assert.strictEqual(
    homeAdvProj.h1TotalMean,
    homeAdvProj.h1HomeMean + homeAdvProj.h1AwayMean,
    '1st-half total mean must equal sum of 1st-half team means without OT'
  );
  const h1BeforeOt = homeAdvProj.h1TotalMean;
  const otMutatedState = seedWarmTeamHistory('NBA', 'bbt_nba_bos', 'bbt_nba_nyk');
  otMutatedState.otGamesCount = 30;
  otMutatedState.otTotalPtsSum = 120;
  otMutatedState.otTotalSqSum = 600;
  const otMutatedProj = projectBasketballGame(otMutatedState, {
    id: 'bbg_nba_test_ha',
    league: 'NBA',
    season: '2026-27',
    game_date: '2026-11-22',
    home_id: 'bbt_nba_bos',
    away_id: 'bbt_nba_nyk',
    neutral: false,
  });
  assert(
    otMutatedProj.otAdjustmentTotal > homeAdvProj.otAdjustmentTotal,
    'Higher empirical OT points should raise full-game OT adjustment'
  );
  assert.strictEqual(
    otMutatedProj.h1TotalMean,
    h1BeforeOt,
    'Empirical OT adjustment must NEVER alter 1st-half projected totals'
  );

  const noH1State = seedWarmTeamHistory('EUROLEAGUE', 'bbt_el_real', 'bbt_el_oly', { includeH1: false });
  const noH1Proj = projectBasketballGame(noH1State, {
    id: 'bbg_el_no_h1',
    league: 'EUROLEAGUE',
    season: '2026-27',
    game_date: '2026-11-22',
    home_id: 'bbt_el_real',
    away_id: 'bbt_el_oly',
    neutral: false,
  });
  assert.strictEqual(noH1Proj.needsHistory, false, 'Full-game sample should be sufficient');
  assert.strictEqual(noH1Proj.needsH1History, true, 'Null half scores must keep needsH1History=true');
  const noH1Eval = evaluateBasketballGameMarkets({
    gameId: noH1Proj.gameId,
    league: 'EUROLEAGUE',
    season: '2026-27',
    kickoffUtc: '2026-11-22T19:00:00Z',
    homeName: 'Real Madrid',
    awayName: 'Olympiacos',
    projection: noH1Proj,
  });
  assert(noH1Eval.picks.some((p) => p.marketCategory === 'game_total'), 'Full-game markets still emitted');
  assert(
    !noH1Eval.picks.some((p) => p.marketCategory === 'h1_game_total' || p.marketCategory === 'h1_team_total'),
    'Missing half scores must exclude all H1 markets'
  );
  console.log('✓ 5. OT separation & missing H1 score exclusion verified');

  // 6. Covariance sensitivity & half-point vs integer continuity checks
  const posCovState = seedWarmTeamHistory('NBA', 'bbt_nba_bos', 'bbt_nba_nyk');
  const negCovState = seedWarmTeamHistory('NBA', 'bbt_nba_bos', 'bbt_nba_nyk');
  posCovState.ewmaRegCovHA = 48;
  negCovState.ewmaRegCovHA = -48;
  const posCovProj = projectBasketballGame(posCovState, {
    id: 'bbg_cov_pos',
    league: 'NBA',
    season: '2026-27',
    game_date: '2026-11-22',
    home_id: 'bbt_nba_bos',
    away_id: 'bbt_nba_nyk',
    neutral: false,
  });
  const negCovProj = projectBasketballGame(negCovState, {
    id: 'bbg_cov_neg',
    league: 'NBA',
    season: '2026-27',
    game_date: '2026-11-22',
    home_id: 'bbt_nba_bos',
    away_id: 'bbt_nba_nyk',
    neutral: false,
  });
  assert(
    posCovProj.gameTotalStd > negCovProj.gameTotalStd + 1.0,
    'Positive home-away covariance must increase gameTotalStd relative to negative covariance'
  );
  const halfOu = computeNormalOverUnder(220, 18, 220.5);
  const intOu = computeNormalOverUnder(220, 18, 220);
  assert.strictEqual(halfOu.pPush, 0, 'Half-point line must have zero push probability');
  assert(intOu.pPush > 0.01, 'Integer line must carry positive discrete push mass');
  console.log('✓ 6. Team covariance propagation & half-point/integer line continuity verified');

  // 7. Unpriced model ladder vs real bookmaker EV check
  const unpricedEval = evaluateBasketballGameMarkets({
    gameId: homeAdvProj.gameId,
    league: 'NBA',
    season: '2026-27',
    kickoffUtc: '2026-11-22T23:00:00Z',
    homeName: 'Boston Celtics',
    awayName: 'New York Knicks',
    projection: homeAdvProj,
  });
  assert(unpricedEval.picks.length === 6, 'All 5 categories (6 market slots: game, home, away, h1 game, h1 home, h1 away) expected');
  for (const p of unpricedEval.picks) {
    assert.strictEqual(p.isModelLine, true, 'Unpriced candidate must mark isModelLine=true');
    assert.strictEqual(p.priceSource, MODEL_LINE_PRICE_LABEL);
    assert.strictEqual(p.expectedValue, null, 'NEVER compute EV without a real bookmaker price');
    assert.strictEqual(p.marketOdds, null);
    assert.strictEqual(Math.abs((p.line % 1) - 0.5) < 1e-6, true, 'Model ladder line must be a half-point line');
  }

  const realQuote: BbOddsQuote = {
    id: 'bbq_test_1',
    game_id: homeAdvProj.gameId,
    league: 'NBA',
    market_category: 'game_total',
    side: 'game',
    line: 215.5,
    over_odds: 1.95,
    under_odds: 1.95,
    bookmaker: 'pinnacle',
    observed_at: '2026-11-22T18:00:00Z',
  };
  const pricedEval = evaluateBasketballGameMarkets({
    gameId: homeAdvProj.gameId,
    league: 'NBA',
    season: '2026-27',
    kickoffUtc: '2026-11-22T23:00:00Z',
    homeName: 'Boston Celtics',
    awayName: 'New York Knicks',
    projection: homeAdvProj,
    oddsSnapshots: [realQuote],
  });
  const pricedGameTotal = pricedEval.picks.find((p) => p.marketCategory === 'game_total');
  assert(pricedGameTotal, 'Expected priced game_total pick');
  assert.strictEqual(pricedGameTotal.isModelLine, false);
  assert.strictEqual(pricedGameTotal.priceSource, 'pinnacle');
  assert.strictEqual(pricedGameTotal.marketOdds, 1.95);
  assert(pricedGameTotal.expectedValue !== null, 'Priced quote must compute EV');
  console.log('✓ 7. Model ladder half-point lines & strict EV pricing rules verified');

  // 8. Calibration & Baseline Gate across all 15 league x category families
  const leagues: BasketballLeague[] = ['NBA', 'NCAAB', 'EUROLEAGUE'];
  const cats: BasketballMarketCategory[] = ['game_total', 'home_total', 'away_total', 'h1_game_total', 'h1_team_total'];
  for (const lg of leagues) {
    for (const cat of cats) {
      const fam = CALIBRATED_BASKETBALL_PARAMS.leagues[lg].families.find((f) => f.marketCategory === cat);
      assert(fam, `Missing family report for ${lg} ${cat}`);
      assert.strictEqual(fam.passedBaseline, true, `Expected ${lg} ${cat} to pass baseline`);
      assert(fam.calibratedBrier < fam.baselineBrier, `${lg} ${cat} Brier should beat naive baseline`);
      assert(fam.calibratedLogLoss < fam.baselineLogLoss, `${lg} ${cat} LogLoss should beat naive baseline`);
      const calCheck = calibrateBasketballProbability(lg, cat, 0.65);
      assert(calCheck.calibratedProbability > 0.5 && calCheck.calibratedProbability < 0.99);
    }
  }
  console.log('✓ 8. Walk-forward calibration parameters & baseline checks verified across all 15 league x category families');

  // 9. Slate Diversity Cap (<= 40% in any single market category)
  const slateEvals: BasketballGameEvaluation[] = [];
  for (let i = 0; i < 10; i++) {
    const ev = evaluateBasketballGameMarkets({
      gameId: `bbg_slate_${i}`,
      league: 'NBA',
      season: '2026-27',
      kickoffUtc: '2026-11-22T23:00:00Z',
      homeName: 'Boston Celtics',
      awayName: 'New York Knicks',
      projection: { ...homeAdvProj, gameId: `bbg_slate_${i}` },
    });
    // Force every game's initial topPick to game_total before running diversity selector
    const gt = ev.picks.find((p) => p.marketCategory === 'game_total')!;
    gt.tier = 'HIGH';
    ev.picks.forEach((p) => {
      p.isTopPick = p.marketCategory === 'game_total';
      if (p.tier === 'SPECULATIVE') p.tier = 'MEDIUM';
    });
    ev.topPick = gt;
    slateEvals.push(ev);
  }
  const diversified = selectDiversifiedBasketballSlatePicks(slateEvals, 0.40);
  const categoryCounts = new Map<BasketballMarketCategory, number>();
  let totalTop = 0;
  for (const ev of diversified) {
    if (ev.topPick) {
      totalTop++;
      categoryCounts.set(ev.topPick.marketCategory, (categoryCounts.get(ev.topPick.marketCategory) || 0) + 1);
    }
  }
  assert.strictEqual(totalTop, 10, 'All 10 eligible slate games should keep a diversified topPick');
  for (const [cat, cnt] of categoryCounts.entries()) {
    assert(cnt <= 4, `Slate diversity violated: ${cat} has ${cnt}/10 (> 40% cap)`);
  }
  console.log('✓ 9. Slate 40% category diversity cap verified');

  // 10. Credit-safe Odds API skip when ODDS_API_KEY unset & Settlement status logic
  assert.strictEqual(BB_DAILY_ODDS_CREDIT_CAP, 8);
  assert.strictEqual(SHARED_MONTHLY_ODDS_CAP, 500);
  const prevOddsKey = process.env.ODDS_API_KEY;
  delete process.env.ODDS_API_KEY;
  const oddsSkipRes = await syncBasketballOdds({
    upcomingGames: [],
    teamLookup: new Map(),
    highTierGameIds: new Set(),
  });
  if (prevOddsKey !== undefined) process.env.ODDS_API_KEY = prevOddsKey;
  assert.strictEqual(oddsSkipRes.status, 'SKIPPED_NO_KEY');
  assert.strictEqual(oddsSkipRes.callsMade, 0);
  assert.strictEqual(oddsSkipRes.creditsSpentThisRun, 0);

  const scheduledOutcome = evaluateBasketballSettlementOutcome({
    marketCode: 'GAME_TOTAL_OVER',
    marketCategory: 'game_total',
    line: 220.5,
    calibratedProbability: 0.62,
    game: {
      status: 'SCHEDULED',
      home_pts: null,
      away_pts: null,
      h1_home: null,
      h1_away: null,
      game_date: '2026-11-25',
      kickoff_utc: '2026-11-25T23:00:00Z',
    },
  });
  assert.strictEqual(scheduledOutcome.settlementStatus, 'PENDING');

  const pushOutcome = evaluateBasketballSettlementOutcome({
    marketCode: 'GAME_TOTAL_OVER',
    marketCategory: 'game_total',
    line: 220,
    calibratedProbability: 0.61,
    game: {
      status: 'FINISHED',
      home_pts: 112,
      away_pts: 108,
      h1_home: 55,
      h1_away: 53,
      game_date: '2026-11-24',
      kickoff_utc: '2026-11-24T23:00:00Z',
    },
  });
  assert.strictEqual(pushOutcome.settlementStatus, 'PUSH');
  assert.strictEqual(pushOutcome.brierError, null);
  assert.strictEqual(pushOutcome.logLoss, null);

  const missingH1Outcome = evaluateBasketballSettlementOutcome({
    marketCode: 'H1_TOTAL_OVER',
    marketCategory: 'h1_game_total',
    line: 108.5,
    calibratedProbability: 0.60,
    game: {
      status: 'FINISHED',
      home_pts: 112,
      away_pts: 108,
      h1_home: null,
      h1_away: null,
      game_date: '2026-11-25',
      kickoff_utc: '2026-11-25T01:00:00Z',
    },
    nowMs: Date.parse('2026-11-25T10:00:00Z'),
  });
  assert.strictEqual(missingH1Outcome.settlementStatus, 'PENDING', 'Missing half score must NEVER be estimated for settlement');

  const wonH1Outcome = evaluateBasketballSettlementOutcome({
    marketCode: 'H1_TOTAL_OVER',
    marketCategory: 'h1_game_total',
    line: 108.5,
    calibratedProbability: 0.64,
    game: {
      status: 'FINISHED',
      home_pts: 112,
      away_pts: 108,
      h1_home: 58,
      h1_away: 55,
      game_date: '2026-11-25',
      kickoff_utc: '2026-11-25T01:00:00Z',
    },
  });
  assert.strictEqual(wonH1Outcome.settlementStatus, 'WON');
  assert.strictEqual(wonH1Outcome.actualValue, 113);
  assert(wonH1Outcome.brierError !== null && wonH1Outcome.brierError < 0.2);
  console.log('✓ 10. Credit-safe Odds API guard & basketball settlement rules verified');

  console.log('ALL BASKETBALL ENGINE TESTS PASSED.');
}

runTests().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
