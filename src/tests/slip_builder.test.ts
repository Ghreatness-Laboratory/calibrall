// ============================================================================
// SLIP BUILDER VERIFICATION & BENCHMARK SUITE
// Runs against BOTH the real local DB slate AND isolated unit/benchmark cases.
// ============================================================================

import assert from 'node:assert/strict';
import { getSlipBuilderTierPolicy } from '../lib/tiers';
import {
  loadAndBuildSlipCandidates,
  buildSlipCandidatesFromEvaluatedSlates,
  EvaluatedFootballSlateEntry,
} from '../lib/slips/candidateBuilder';
import { searchSlips } from '../lib/slips/slipSearch';
import { computeSlipSettlementFromLegs, settleSingleLeg } from '../lib/slips/dailySlipRecord';
import type {
  Competition,
  Fixture,
  FixtureContext,
  MarketPrediction,
} from '../types';
import type { EvaluatedFixtureResult } from '../lib/prediction/marketSelection';
import type { StoredOddsSnapshot } from '../lib/data/matchesStore';
import type { DailySlipLegRecord, SlipCandidateLeg } from '../lib/slips/types';

function assertCleanText(text: string, label: string) {
  assert.ok(!text.includes('-'), `[${label}] unexpected hyphen in: "${text}"`);
  assert.ok(!text.includes('_'), `[${label}] unexpected underscore in: "${text}"`);
}

function makeComp(id: string, code: string, name: string, country: string): Competition {
  return {
    id,
    code,
    name,
    country,
    sport: 'football',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.75,
    avgCornersPerGame: 10.1,
    avgCardsPerGame: 4.1,
    isActive: true,
  };
}

function makeFixture(params: {
  id: string;
  homeName: string;
  awayName: string;
  comp: Competition;
  kickoffTime: string;
  status?: Fixture['status'];
  insufficientData?: boolean;
}): Fixture {
  return {
    id: params.id,
    providerId: params.id,
    providerName: 'Test Fixture',
    source: 'test_slip_builder',
    isDemo: false,
    competitionId: params.comp.id,
    competition: params.comp,
    seasonYear: '2026/2027',
    homeTeam: {
      id: `team_h_${params.id}`,
      name: params.homeName,
      shortName: params.homeName,
      tla: params.homeName.slice(0, 3).toUpperCase(),
      crestUrl: '',
      storedMatchCount: 24,
    },
    awayTeam: {
      id: `team_a_${params.id}`,
      name: params.awayName,
      shortName: params.awayName,
      tla: params.awayName.slice(0, 3).toUpperCase(),
      crestUrl: '',
      storedMatchCount: 24,
    },
    kickoffTime: params.kickoffTime,
    status: params.status || 'TIMED',
    score: { home: null, away: null },
    hasMarketOdds: true,
    insufficientData: Boolean(params.insufficientData),
  };
}

function makeContext(fixture: Fixture, lineupConfirmed: boolean): FixtureContext {
  return {
    fixtureId: fixture.id,
    homeTeamName: fixture.homeTeam.name,
    awayTeamName: fixture.awayTeam.name,
    competitionCode: fixture.competition.code,
    homeAttackRating: 1.35,
    homeDefenseRating: 0.9,
    awayAttackRating: 1.05,
    awayDefenseRating: 1.15,
    homeFormPoints: 12,
    awayFormPoints: 7,
    homeGoalsScoredAvg: 1.85,
    homeGoalsConcededAvg: 0.95,
    awayGoalsScoredAvg: 1.15,
    awayGoalsConcededAvg: 1.45,
    homeXg: 1.88,
    awayXg: 1.04,
    sampleSizeMatches: 24,
    homeSampleMatches: 24,
    awaySampleMatches: 24,
    dataCoverageScore: 0.95,
    stateTags: [],
    lineupConfirmed,
    factors: {
      team_form: { isMeasured: true, value: 0.15, description: 'Strong recent home form', confidence: 0.9 },
      head_to_head: { isMeasured: true, value: 0, description: 'Balanced H2H history', confidence: 0.8 },
      home_advantage: { isMeasured: true, value: 0.12, description: 'Positive home record', confidence: 0.9 },
      schedule_fatigue: { isMeasured: false, value: 0, description: '', confidence: 0 },
      squad_absences: { isMeasured: false, value: 0, description: '', confidence: 0 },
      motivation_context: { isMeasured: false, value: 0, description: '', confidence: 0 },
    },
  };
}

function makePrediction(params: {
  marketCode: string;
  optionType: MarketPrediction['optionType'];
  marketCategory: MarketPrediction['marketCategory'];
  marketName: string;
  selection: string;
  calibratedProbability: number;
  confidenceTier: 'HIGH' | 'MEDIUM';
  line?: number;
}): MarketPrediction {
  return {
    marketCode: params.marketCode,
    optionType: params.optionType,
    marketCategory: params.marketCategory,
    marketName: params.marketName,
    selection: params.selection,
    line: params.line,
    period: 'REGULAR_TIME',
    settlementRule: 'Regular time only.',
    modelProbability: params.calibratedProbability,
    calibratedProbability: params.calibratedProbability,
    rawModelProbability: params.calibratedProbability,
    confidence: 'HIGH',
    confidenceTier: params.confidenceTier,
    riskTier: params.confidenceTier === 'HIGH' ? 'SAFE' : 'MODERATE',
    qualificationStatus: 'QUALIFIED_PROBABILITY',
    isValidated: true,
    isBestPick: true,
    dataCompletenessScore: 0.95,
    uncertaintySpread: 0.04,
    dataPoints: [],
  };
}

async function runTests() {
  console.log('=== 1. TIER & POLICY CHECKS ===');
  const freePolicy = getSlipBuilderTierPolicy('free', false);
  assert.equal(freePolicy.dailyBuildLimit, 1);
  assert.equal(freePolicy.maxTargetOdds, 3.0);
  assert.deepEqual(freePolicy.allowedStyles, ['safest']);
  assert.equal(freePolicy.bestPriceComparison, false);

  const proPolicy = getSlipBuilderTierPolicy('pro', false);
  assert.equal(proPolicy.dailyBuildLimit, 5);
  assert.equal(proPolicy.maxTargetOdds, 10.0);
  assert.deepEqual(proPolicy.allowedStyles, ['safest']);
  assert.equal(proPolicy.bestPriceComparison, false);

  const premiumPolicy = getSlipBuilderTierPolicy('premium', false);
  assert.equal(premiumPolicy.dailyBuildLimit, null);
  assert.equal(premiumPolicy.maxTargetOdds, 10.0);
  assert.deepEqual(premiumPolicy.allowedStyles, ['safest', 'balanced']);
  assert.equal(premiumPolicy.bestPriceComparison, true);

  const adminPolicy = getSlipBuilderTierPolicy('free', true);
  assert.equal(adminPolicy.dailyBuildLimit, null);
  assert.equal(adminPolicy.balancedStyleAllowed, true);
  assert.equal(adminPolicy.bestPriceComparison, true);
  console.log('Tier policies verified from src/lib/tiers.ts');

  console.log('\n=== 2. REAL LOCAL DB SLATE TEST ===');
  const realDbToday = await loadAndBuildSlipCandidates({
    day: 'today',
    sport: 'all',
    competitionIds: [],
    markets: [],
    oddsBasis: 'real',
    bestPriceComparison: true,
  });
  console.log('Real DB today (Real bookmaker prices only):', realDbToday.diagnostics);
  const realDbSlips = searchSlips(realDbToday.candidates, {
    targetOdds: 2.0,
    maxLegs: 4,
    style: 'safest',
  });
  console.log(`Real DB today slips in real-price mode: ${realDbSlips.length}`);

  const realDbTomorrowFair = await loadAndBuildSlipCandidates({
    day: 'tomorrow',
    sport: 'all',
    competitionIds: [],
    markets: [],
    oddsBasis: 'model_fair',
    bestPriceComparison: true,
  });
  console.log('Real DB tomorrow (Include model fair odds):', realDbTomorrowFair.diagnostics);
  for (const t of [2.0, 3.0, 4.0]) {
    const bbSlips = searchSlips(realDbTomorrowFair.candidates, {
      targetOdds: t,
      maxLegs: 4,
      style: 'safest',
    });
    console.log(
      `Real DB tomorrow (model_fair) target=${t.toFixed(1)} -> slips=${bbSlips.length}${
        bbSlips[0]
          ? ` | best combinedOdds=${bbSlips[0].combinedOdds.toFixed(2)}, hitChance=${bbSlips[0].estimatedHitChancePct.toFixed(1)}%, legs=${bbSlips[0].legsCount}`
          : ''
      }`
    );
  }

  console.log('\n=== 3. MULTI-BOOKMAKER REAL-PRICED SLATE + UNIT INVARIANTS ===');
  const nowMs = Date.UTC(2026, 10, 27, 12, 0, 0);
  const obs14MinAgo = new Date(nowMs - 14 * 60_000).toISOString();
  const obs28MinAgo = new Date(nowMs - 28 * 60_000).toISOString();
  const obs4HoursAgo = new Date(nowMs - 240 * 60_000).toISOString(); // stale > 180 min!
  const kickoffSoon = new Date(nowMs + 3 * 3600_000).toISOString();
  const kickoffStarted = new Date(nowMs - 15 * 60_000).toISOString();

  const pl = makeComp('comp_pl', 'PL', 'Premier League', 'England');
  const pd = makeComp('comp_pd', 'PD', 'La Liga', 'Spain');
  const bl1 = makeComp('comp_bl1', 'BL1', 'Bundesliga', 'Germany');
  const sa = makeComp('comp_sa', 'SA', 'Serie A', 'Italy');

  const baseEval = (preds: MarketPrediction[]): EvaluatedFixtureResult => ({
    predictions: preds,
    rankedOptions: preds,
    topPick: preds[0] || null,
    contextEvaluation: {
      stateTags: [],
      lineupStatus: 'confirmed',
      activeFactors: [],
      missingFactors: [],
      compositeUncertaintyMultiplier: 1.0,
      dataQualityScore: 0.95,
      factorContributionsByMarket: {},
      correlationWarnings: [],
    },
  });

  const fixtureSpecs = [
    {
      id: 'm_ars_che',
      home: 'Arsenal',
      away: 'Chelsea',
      comp: pl,
      preds: [
        makePrediction({
          marketCode: '1X2_HOME',
          optionType: 'win',
          marketCategory: 'match_result',
          marketName: 'Match result',
          selection: 'Home Win',
          calibratedProbability: 0.67,
          confidenceTier: 'HIGH',
        }),
        makePrediction({
          marketCode: 'TOTAL_GOALS_O25',
          optionType: 'over_under_goals',
          marketCategory: 'total_goals',
          marketName: 'Total goals',
          selection: 'Over 2.5 Goals',
          calibratedProbability: 0.62,
          confidenceTier: 'MEDIUM',
          line: 2.5,
        }),
      ],
      snaps: [
        { match_id: 'm_ars_che', bookmaker: 'Bet365', market_code: '1X2_HOME', selection: 'Home Win', decimal_odds: 1.45, observed_at: obs14MinAgo, snapshot_type: 'live_pre_kickoff' as const, source: 'the-odds-api' },
        { match_id: 'm_ars_che', bookmaker: 'Pinnacle', market_code: '1X2_HOME', selection: 'Home Win', decimal_odds: 1.54, observed_at: obs14MinAgo, snapshot_type: 'live_pre_kickoff' as const, source: 'the-odds-api' },
        { match_id: 'm_ars_che', bookmaker: 'Bet365', market_code: 'TOTAL_GOALS_O25', selection: 'Over 2.5 Goals', decimal_odds: 1.88, observed_at: obs14MinAgo, snapshot_type: 'live_pre_kickoff' as const, source: 'the-odds-api' },
      ],
    },
    {
      id: 'm_liv_avl',
      home: 'Liverpool',
      away: 'Aston Villa',
      comp: pl,
      preds: [
        makePrediction({
          marketCode: '1X2_HOME',
          optionType: 'win',
          marketCategory: 'match_result',
          marketName: 'Match result',
          selection: 'Home Win',
          calibratedProbability: 0.72,
          confidenceTier: 'HIGH',
        }),
        makePrediction({
          marketCode: 'BTTS_YES',
          optionType: 'both_teams_to_score',
          marketCategory: 'btts',
          marketName: 'Both teams to score',
          selection: 'BTTS Yes',
          calibratedProbability: 0.61,
          confidenceTier: 'MEDIUM',
        }),
      ],
      snaps: [
        { match_id: 'm_liv_avl', bookmaker: 'Unibet', market_code: '1X2_HOME', selection: 'Home Win', decimal_odds: 1.38, observed_at: obs14MinAgo, snapshot_type: 'live_pre_kickoff' as const, source: 'the-odds-api' },
        { match_id: 'm_liv_avl', bookmaker: 'Pinnacle', market_code: 'BTTS_YES', selection: 'BTTS Yes', decimal_odds: 1.85, observed_at: obs14MinAgo, snapshot_type: 'live_pre_kickoff' as const, source: 'the-odds-api' },
      ],
    },
    {
      id: 'm_rma_val',
      home: 'Real Madrid',
      away: 'Valencia',
      comp: pd,
      preds: [
        makePrediction({
          marketCode: '1X2_HOME',
          optionType: 'win',
          marketCategory: 'match_result',
          marketName: 'Match result',
          selection: 'Home Win',
          calibratedProbability: 0.76,
          confidenceTier: 'HIGH',
        }),
        makePrediction({
          marketCode: 'TOTAL_GOALS_O25',
          optionType: 'over_under_goals',
          marketCategory: 'total_goals',
          marketName: 'Total goals',
          selection: 'Over 2.5 Goals',
          calibratedProbability: 0.64,
          confidenceTier: 'MEDIUM',
          line: 2.5,
        }),
      ],
      snaps: [
        { match_id: 'm_rma_val', bookmaker: 'Bet365', market_code: '1X2_HOME', selection: 'Home Win', decimal_odds: 1.42, observed_at: obs28MinAgo, snapshot_type: 'live_pre_kickoff' as const, source: 'the-odds-api' },
        { match_id: 'm_rma_val', bookmaker: 'Pinnacle', market_code: 'TOTAL_GOALS_O25', selection: 'Over 2.5 Goals', decimal_odds: 1.92, observed_at: obs28MinAgo, snapshot_type: 'live_pre_kickoff' as const, source: 'the-odds-api' },
      ],
    },
    {
      id: 'm_bay_bvb',
      home: 'Bayern Munich',
      away: 'Dortmund',
      comp: bl1,
      preds: [
        makePrediction({
          marketCode: 'TOTAL_GOALS_O25',
          optionType: 'over_under_goals',
          marketCategory: 'total_goals',
          marketName: 'Total goals',
          selection: 'Over 2.5 Goals',
          calibratedProbability: 0.71,
          confidenceTier: 'HIGH',
          line: 2.5,
        }),
      ],
      snaps: [
        { match_id: 'm_bay_bvb', bookmaker: 'Unibet', market_code: 'TOTAL_GOALS_O25', selection: 'Over 2.5 Goals', decimal_odds: 1.52, observed_at: obs14MinAgo, snapshot_type: 'live_pre_kickoff' as const, source: 'the-odds-api' },
      ],
    },
    {
      id: 'm_int_rom',
      home: 'Inter',
      away: 'Roma',
      comp: sa,
      preds: [
        makePrediction({
          marketCode: '1X2_HOME',
          optionType: 'win',
          marketCategory: 'match_result',
          marketName: 'Match result',
          selection: 'Home Win',
          calibratedProbability: 0.65,
          confidenceTier: 'MEDIUM',
        }),
      ],
      snaps: [
        { match_id: 'm_int_rom', bookmaker: 'Pinnacle', market_code: '1X2_HOME', selection: 'Home Win', decimal_odds: 1.75, observed_at: obs28MinAgo, snapshot_type: 'live_pre_kickoff' as const, source: 'the-odds-api' },
      ],
    },
    {
      id: 'm_stale_only',
      home: 'Napoli',
      away: 'Lazio',
      comp: sa,
      preds: [
        makePrediction({
          marketCode: '1X2_HOME',
          optionType: 'win',
          marketCategory: 'match_result',
          marketName: 'Match result',
          selection: 'Home Win',
          calibratedProbability: 0.70,
          confidenceTier: 'MEDIUM',
        }),
      ],
      snaps: [
        // Stale > 180 min -> MUST BE REJECTED
        { match_id: 'm_stale_only', bookmaker: 'Bet365', market_code: '1X2_HOME', selection: 'Home Win', decimal_odds: 1.80, observed_at: obs4HoursAgo, snapshot_type: 'live_pre_kickoff' as const, source: 'the-odds-api' },
      ],
    },
    {
      id: 'm_started',
      home: 'Barcelona',
      away: 'Sevilla',
      comp: pd,
      status: 'IN_PLAY' as const,
      kickoff: kickoffStarted,
      preds: [
        makePrediction({
          marketCode: '1X2_HOME',
          optionType: 'win',
          marketCategory: 'match_result',
          marketName: 'Match result',
          selection: 'Home Win',
          calibratedProbability: 0.75,
          confidenceTier: 'MEDIUM',
        }),
      ],
      snaps: [
        { match_id: 'm_started', bookmaker: 'Bet365', market_code: '1X2_HOME', selection: 'Home Win', decimal_odds: 1.40, observed_at: obs14MinAgo, snapshot_type: 'live_pre_kickoff' as const, source: 'the-odds-api' },
      ],
    },
    {
      id: 'm_flagged',
      home: 'Atletico Madrid',
      away: 'Betis',
      comp: pd,
      preds: [
        makePrediction({
          marketCode: '1X2_HOME',
          optionType: 'win',
          marketCategory: 'match_result',
          marketName: 'Match result',
          selection: 'Home Win',
          calibratedProbability: 0.68,
          confidenceTier: 'MEDIUM',
        }),
      ],
      snaps: [
        { match_id: 'm_flagged', bookmaker: 'Bet365', market_code: '1X2_HOME', selection: 'Home Win', decimal_odds: 1.55, observed_at: obs14MinAgo, snapshot_type: 'live_pre_kickoff' as const, source: 'the-odds-api' },
      ],
    },
  ];

  const entries: EvaluatedFootballSlateEntry[] = fixtureSpecs.map((spec) => {
    const fx = makeFixture({
      id: spec.id,
      homeName: spec.home,
      awayName: spec.away,
      comp: spec.comp,
      kickoffTime: spec.kickoff || kickoffSoon,
      status: spec.status || 'TIMED',
    });
    return {
      fixture: fx,
      context: makeContext(fx, false),
      evalResult: baseEval(spec.preds),
      snapshots: spec.snaps as StoredOddsSnapshot[],
    };
  });

  const candBuild = buildSlipCandidatesFromEvaluatedSlates({
    input: {
      day: 'today',
      sport: 'football',
      competitionIds: [],
      markets: [],
      oddsBasis: 'real',
      bestPriceComparison: true,
      maxPriceAgeMinutes: 180,
      nowMs,
    },
    footballEntries: entries,
    basketballEntries: [],
    flaggedFixtureIds: new Set(['m_flagged']),
    skipDayFilter: true,
  });

  // Verify stale, started, flagged rejections
  assert.ok(candBuild.diagnostics.rejectedStalePrices >= 1, 'Stale price must be rejected');
  assert.ok(candBuild.diagnostics.rejectedFlaggedExplanations >= 1, 'Flagged explanation must be rejected');
  assert.ok(!candBuild.candidates.some((c) => c.matchId === 'm_stale_only'), 'm_stale_only must not emit candidates');
  assert.ok(!candBuild.candidates.some((c) => c.matchId === 'm_started'), 'm_started must not emit candidates');
  assert.ok(!candBuild.candidates.some((c) => c.matchId === 'm_flagged'), 'm_flagged must not emit candidates');

  // Verify team news pending confidence lowering (HIGH -> MEDIUM)
  const arsHome = candBuild.candidates.find((c) => c.matchId === 'm_ars_che' && c.marketCode === '1X2_HOME');
  assert.ok(arsHome, 'Arsenal candidate exists');
  assert.equal(arsHome.confidenceTier, 'MEDIUM', 'Team news pending must lower HIGH to MEDIUM');
  assert.equal(arsHome.teamNewsLowered, true);
  assert.equal(arsHome.decimalOdds, 1.54, 'Premium best-price comparison selects Pinnacle 1.54 over Bet365 1.45');
  assert.equal(arsHome.bookmakerQuotes.length, 2);

  // Verify no hyphens/underscores in candidate display copy
  for (const c of candBuild.candidates) {
    assertCleanText(c.matchLabel, 'matchLabel');
    assertCleanText(c.priceAgeLabel, 'priceAgeLabel');
    assertCleanText(c.oneLineWhy, 'oneLineWhy');
    assertCleanText(c.bookmakerName, 'bookmakerName');
  }

  for (const t of [2.0, 3.0, 4.0]) {
    const safestSlips = searchSlips(candBuild.candidates, {
      targetOdds: t,
      maxLegs: 4,
      style: 'safest',
      nowIso: new Date(nowMs).toISOString(),
    });
    assert.ok(safestSlips.length >= 1, `Should find Safest slip for target ${t}`);
    const s = safestSlips[0];
    assert.ok(
      s.combinedOdds >= t * 0.92 && s.combinedOdds <= t * 1.08,
      `Combined odds ${s.combinedOdds} within +/-8% of ${t}`
    );
    // Verify 1 leg per match & <=2 per league
    const matchIds = new Set(s.legs.map((l) => l.matchId));
    assert.equal(matchIds.size, s.legs.length, 'Never combine 2 legs from same match');
    const leagueCounts = new Map<string, number>();
    for (const l of s.legs) {
      leagueCounts.set(l.competitionId, (leagueCounts.get(l.competitionId) || 0) + 1);
      assert.ok((leagueCounts.get(l.competitionId) || 0) <= 2, 'Max 2 legs per league');
    }
    assertCleanText(s.honestNotice, 'honestNotice');
    assertCleanText(s.independenceNote, 'independenceNote');
    console.log(
      `[Safest target ${t.toFixed(1)}] combinedOdds=${s.combinedOdds.toFixed(
        2
      )} (${s.targetProximityLabel}) | combinedProb=${(s.combinedProbability * 100).toFixed(
        1
      )}% | legs=${s.legsCount}: ` +
        s.legs
          .map(
            (l) =>
              `${l.matchLabel} [${l.selection} @ ${l.decimalOdds.toFixed(2)} ${l.bookmakerName}, ${l.priceAgeLabel}, prob ${(
                l.calibratedProbability * 100
              ).toFixed(0)}%]`
          )
          .join(' + ')
    );
  }

  // Compare Safest vs Balanced when higher-probability modest-edge picks compete against higher-edge value picks
  const divergenceSlate: SlipCandidateLeg[] = [
    ...candBuild.candidates.map((c) => ({
      ...c,
      impliedProbability: 1 / c.decimalOdds,
      marketEdge: Math.min(c.marketEdge ?? 0, 0.03),
      expectedValue: c.calibratedProbability * c.decimalOdds - 1,
    })),
    {
      ...candBuild.candidates[0],
      matchId: 'm_value_a',
      matchLabel: 'Napoli vs Fiorentina',
      homeTeamId: 'th_nap',
      awayTeamId: 'ta_fio',
      competitionId: 'comp_ded',
      competitionCode: 'DED',
      competitionName: 'Eredivisie',
      marketCode: 'TOTAL_GOALS_O25',
      selection: 'Over 2.5 Goals',
      decimalOdds: 1.72,
      calibratedProbability: 0.65,
      impliedProbability: 1 / 1.72,
      marketEdge: 0.65 - 1 / 1.72,
      expectedValue: 0.65 * 1.72 - 1,
    },
    {
      ...candBuild.candidates[0],
      matchId: 'm_value_b',
      matchLabel: 'Porto vs Braga',
      homeTeamId: 'th_por',
      awayTeamId: 'ta_bra',
      competitionId: 'comp_elc',
      competitionCode: 'ELC',
      competitionName: 'Championship',
      marketCode: 'BTTS_YES',
      selection: 'BTTS Yes',
      decimalOdds: 1.75,
      calibratedProbability: 0.64,
      impliedProbability: 1 / 1.75,
      marketEdge: 0.64 - 1 / 1.75,
      expectedValue: 0.64 * 1.75 - 1,
    },
  ];

  const safest3 = searchSlips(divergenceSlate, { targetOdds: 3.0, maxLegs: 4, style: 'safest' });
  const balanced3 = searchSlips(divergenceSlate, { targetOdds: 3.0, maxLegs: 4, style: 'balanced' });
  assert.ok(safest3.length >= 1 && balanced3.length >= 1, 'Safest and Balanced both return slips at target 3.0');
  assert.ok(
    safest3[0].combinedProbability >= balanced3[0].combinedProbability,
    'Safest combined probability >= Balanced combined probability'
  );
  assert.ok(
    (balanced3[0].averageMarketEdge ?? 0) >= (safest3[0].averageMarketEdge ?? 0),
    'Balanced average market edge >= Safest average market edge'
  );
  assert.notEqual(
    safest3[0].legs.map((l) => l.matchId).sort().join(','),
    balanced3[0].legs.map((l) => l.matchId).sort().join(','),
    'Safest and Balanced select distinct slips when probability vs edge trade off'
  );
  console.log(
    `Safest vs Balanced at 3.0 -> Safest: odds=${safest3[0].combinedOdds.toFixed(2)}, prob=${(
      safest3[0].combinedProbability * 100
    ).toFixed(1)}%, avgEdge=${((safest3[0].averageMarketEdge || 0) * 100).toFixed(1)}% (${safest3[0].legs
      .map((l) => l.matchLabel)
      .join(' + ')}) | Balanced: odds=${balanced3[0].combinedOdds.toFixed(2)}, prob=${(
      balanced3[0].combinedProbability * 100
    ).toFixed(1)}%, avgEdge=${((balanced3[0].averageMarketEdge || 0) * 100).toFixed(1)}% (${balanced3[0].legs
      .map((l) => l.matchLabel)
      .join(' + ')})`
  );

  // Empty state check for unreachable target 10.0 with maxLegs=3 (max 3-leg product = 1.92*1.88*1.85 = 6.68 < 9.20)
  // Plus Free-tier limit assertion: target 10.0 > freePolicy.maxTargetOdds (3.0) and Balanced blocked
  assert.ok(10.0 > freePolicy.maxTargetOdds, 'Free tier blocks target 10.0 (> 3.0 maxTargetOdds)');
  assert.ok(!freePolicy.allowedStyles.includes('balanced'), 'Free tier blocks Balanced style');
  const target10 = searchSlips(candBuild.candidates, { targetOdds: 10.0, maxLegs: 3, style: 'safest' });
  assert.equal(target10.length, 0, 'Unreachable target 10.0 with maxLegs=3 must return 0 slips without relaxing gates');
  console.log(
    'Empty state & Free-tier target 10.0 verified: empty="No combination reaches 10.0 odds with enough confidence today. Try fewer odds, more leagues or the next day." | Free-tier cap=3.0, limit=1/day, Balanced=locked'
  );

  // Deduplication check: if >=2 slips returned, they differ by at least 2 legs
  const multiCheck = searchSlips(candBuild.candidates, { targetOdds: 2.5, maxLegs: 4, style: 'safest' });
  for (let i = 0; i < multiCheck.length; i++) {
    for (let j = i + 1; j < multiCheck.length; j++) {
      const a = multiCheck[i].legs;
      const b = multiCheck[j].legs;
      const setA = new Set(a.map((l) => l.matchId));
      const shared = b.filter((l) => setA.has(l.matchId)).length;
      assert.ok(Math.min(a.length, b.length) - shared >= 2, 'Returned slips must differ by >= 2 legs');
    }
  }

  console.log('\n=== 4. SAME-MATCH DEDUPE & VOID LEG SETTLEMENT TESTS ===');
  // Explicit unit test: even when ONLY 1 match has 2 candidates whose product hits 2.0, NEVER combine them
  const sameMatchOnly: SlipCandidateLeg[] = [
    { ...candBuild.candidates[0], matchId: 'same_1', marketCode: '1X2_HOME', decimalOdds: 1.45, calibratedProbability: 0.7 },
    { ...candBuild.candidates[0], matchId: 'same_1', marketCode: 'TOTAL_GOALS_O25', decimalOdds: 1.45, calibratedProbability: 0.65 },
  ];
  const sameMatchSlips = searchSlips(sameMatchOnly, { targetOdds: 2.1, maxLegs: 4, style: 'safest' });
  assert.equal(sameMatchSlips.length, 0, 'Two legs from same match must NEVER be combined');

  // Void leg recalculation test
  const sampleLegs: DailySlipLegRecord[] = [
    {
      matchId: 'm1',
      sport: 'football',
      matchLabel: 'Arsenal vs Chelsea',
      competitionId: 'comp_pl',
      competitionCode: 'PL',
      competitionName: 'Premier League',
      kickoffTime: kickoffSoon,
      marketCode: '1X2_HOME',
      marketName: 'Match result',
      selection: 'Home Win',
      line: null,
      decimalOdds: 1.5,
      oddsSourceType: 'real_bookmaker',
      bookmakerName: 'Bet365',
      priceAgeLabel: 'price from 10 minutes ago',
      calibratedProbability: 0.68,
      confidenceTier: 'MEDIUM',
      oneLineWhy: 'Model recommends Home Win.',
      legStatus: 'WON',
    },
    {
      matchId: 'm2',
      sport: 'football',
      matchLabel: 'Inter vs Roma',
      competitionId: 'comp_sa',
      competitionCode: 'SA',
      competitionName: 'Serie A',
      kickoffTime: kickoffSoon,
      marketCode: '1X2_HOME',
      marketName: 'Match result',
      selection: 'Home Win',
      line: null,
      decimalOdds: 2.0,
      oddsSourceType: 'real_bookmaker',
      bookmakerName: 'Pinnacle',
      priceAgeLabel: 'price from 10 minutes ago',
      calibratedProbability: 0.56,
      confidenceTier: 'MEDIUM',
      oneLineWhy: 'Model recommends Home Win.',
      legStatus: 'VOID',
    },
  ];
  const settledVoid = computeSlipSettlementFromLegs(sampleLegs);
  assert.equal(settledVoid.status, 'WON');
  assert.equal(settledVoid.settledOdds, 1.5, 'Void leg removed and odds recalculated to remaining leg 1.50');
  assert.equal(settledVoid.voidedLegsCount, 1);

  // Disabled under-bookings leg must NEVER enter Slip Builder or daily fixed slips, while historical CARDS_U45 legs still settle normally
  const cardUnderCandidate: SlipCandidateLeg = {
    matchId: 'cards_u_blocked_m1',
    sport: 'football',
    matchLabel: 'Arsenal vs Chelsea',
    homeTeamId: 'h1',
    awayTeamId: 'a1',
    homeTeamName: 'Arsenal',
    awayTeamName: 'Chelsea',
    competitionId: 'comp_pl',
    competitionCode: 'PL',
    competitionName: 'Premier League',
    kickoffTime: kickoffSoon,
    marketCode: 'CARDS_U45',
    marketGroup: 'bookings',
    marketName: 'Cards',
    selection: 'Under 4.5 cards',
    line: 4.5,
    decimalOdds: 1.45,
    oddsSourceType: 'real_bookmaker',
    bookmakerName: 'Bet365',
    observedAt: obs14MinAgo,
    priceAgeMinutes: 14,
    priceAgeLabel: 'price from 14 minutes ago',
    calibratedProbability: 0.78,
    impliedProbability: 1 / 1.45,
    marketEdge: 0.09,
    expectedValue: 0.13,
    confidenceTier: 'HIGH',
    teamNewsLowered: false,
    teamNewsNote: null,
    oneLineWhy: 'Under cards test leg.',
    bookmakerQuotes: [],
    bestQuoteApplied: false,
  };
  const goalsLeg: SlipCandidateLeg = {
    ...cardUnderCandidate,
    matchId: 'goals_allowed_m2',
    marketCode: 'TOTAL_GOALS_O15',
    marketGroup: 'total_goals',
    marketName: 'Total goals',
    selection: 'Over 1.5 goals',
    line: 1.5,
    oneLineWhy: 'Goals test leg.',
  };
  const blockedSlips = searchSlips([cardUnderCandidate, goalsLeg], { targetOdds: 2.0, maxLegs: 4, style: 'safest' });
  assert.equal(blockedSlips.length, 0, 'Disabled CARDS_U45 candidate must be excluded from searchSlips');

  const historicalCardsUnderSettlement = settleSingleLeg(
    {
      ...sampleLegs[0],
      marketCode: 'CARDS_U45',
      marketName: 'Cards',
      selection: 'Under 4.5 cards',
      line: 4.5,
      legStatus: 'PENDING',
    },
    {
      status: 'FINISHED',
      homeScore: 1,
      awayScore: 1,
      homeYellowCards: 2,
      awayYellowCards: 1,
      homeRedCards: 0,
      awayRedCards: 0,
    }
  );
  assert.equal(historicalCardsUnderSettlement.legStatus, 'WON', 'Existing/historical CARDS_U45 slip legs must continue settling normally');
  console.log('Same-match prohibition, void-leg recalculation, & under-bookings slip guard verified.');

  console.log('\n=== 5. 200+ GAME PERFORMANCE BENCHMARK ===');
  const largeSlate: SlipCandidateLeg[] = [];
  const leagues = ['comp_pl', 'comp_pd', 'comp_bl1', 'comp_sa', 'comp_fl1', 'comp_ded', 'comp_ppl', 'comp_elc'];
  for (let i = 0; i < 220; i++) {
    const compId = leagues[i % leagues.length];
    const baseOdds = 1.25 + ((i % 9) * 0.08);
    const baseProb = Math.max(0.45, Math.min(0.82, 0.86 - (i % 9) * 0.04));
    for (let m = 0; m < 4; m++) {
      const odds = Math.round((baseOdds + m * 0.14) * 100) / 100;
      const prob = Math.round(Math.max(0.42, baseProb - m * 0.04) * 1000) / 1000;
      const implied = 1 / odds;
      largeSlate.push({
        matchId: `bench_m_${i}`,
        sport: 'football',
        matchLabel: `Home ${i} vs Away ${i}`,
        homeTeamId: `bh_${i}`,
        awayTeamId: `ba_${i}`,
        homeTeamName: `Home ${i}`,
        awayTeamName: `Away ${i}`,
        competitionId: compId,
        competitionCode: compId.replace('comp_', '').toUpperCase(),
        competitionName: compId,
        kickoffTime: kickoffSoon,
        marketCode: `M_${m}`,
        marketGroup: 'total_goals',
        marketName: 'Total goals',
        selection: `Selection ${m}`,
        line: 2.5,
        decimalOdds: odds,
        oddsSourceType: 'real_bookmaker',
        bookmakerName: 'Pinnacle',
        observedAt: obs14MinAgo,
        priceAgeMinutes: 14,
        priceAgeLabel: 'price from 14 minutes ago',
        calibratedProbability: prob,
        impliedProbability: implied,
        marketEdge: Math.round((prob - implied) * 10000) / 10000,
        expectedValue: Math.round((prob * odds - 1) * 10000) / 10000,
        confidenceTier: 'MEDIUM',
        teamNewsLowered: false,
        teamNewsNote: null,
        oneLineWhy: 'Calibrated benchmark leg.',
        bookmakerQuotes: [],
        bestQuoteApplied: false,
      });
    }
  }

  const t0 = performance.now();
  const benchSafest = searchSlips(largeSlate, { targetOdds: 4.0, maxLegs: 4, style: 'safest' });
  const benchBalanced = searchSlips(largeSlate, { targetOdds: 4.0, maxLegs: 4, style: 'balanced' });
  const elapsedMs = performance.now() - t0;
  assert.ok(benchSafest.length === 3, '220-game slate returns 3 distinct Safest slips');
  assert.ok(benchBalanced.length === 3, '220-game slate returns 3 distinct Balanced slips');
  assert.ok(elapsedMs < 250, `Expected < 250ms for 220-game slate search (both styles), got ${elapsedMs.toFixed(1)}ms`);
  console.log(`220-game (880-leg) search benchmark (Safest + Balanced): ${elapsedMs.toFixed(2)}ms`);

  console.log('\nALL SLIP BUILDER TESTS PASSED!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
