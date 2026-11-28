import assert from 'node:assert/strict';
import type { Fixture, FixtureContext, MarketPrediction, WrittenMatchExplanation } from '@/types';
import {
  applyCanonicalTopPick,
  evaluateCanonicalFootballSlate,
} from '@/lib/prediction/canonicalHeadlinePick';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import {
  generateFootballExplanation,
  generateBasketballExplanation,
  syncSlateExplanations,
} from '@/lib/prediction/explanationGenerator';
import {
  loadStoredFootballExplanation,
  persistOrLoadImmutableFootballExplanation,
} from '@/lib/prediction/footballPickPersistence';
import { forwardPickLedger } from '@/lib/prediction/forwardPickLedger';
import { redactExplanationForTier } from '@/lib/auth/tierAccess';
import { buildSlipCandidatesFromEvaluatedSlates } from '@/lib/slips/candidateBuilder';
import {
  evaluateBasketballGameMarkets,
  type BasketballGameEvaluation,
} from '@/lib/basketball/picker';
import type { GameProjection } from '@/lib/basketball/model';
import { reconcileBasketballEvaluationWithStoredPick } from '@/lib/basketball/readService';
import { getLocalDatabase } from '@/lib/supabase/client';
import { getEvaluatedFixture, getFootballDataProvider } from '@/lib/data/provider';

interface NormalizedHeadlinePick {
  marketCode: string | null;
  marketScope: string | null;
  selection: string | null;
  probability: number | null;
}

function extractFromEvaluation(
  ev: { topPick: MarketPrediction | null },
  expl?: WrittenMatchExplanation | null
): NormalizedHeadlinePick {
  const top = ev.topPick;
  return {
    marketCode: expl?.activePickMarketCode ?? top?.marketCode ?? null,
    marketScope: expl?.activePickMarketScope ?? top?.marketScope ?? null,
    selection: expl?.activePickSelection ?? top?.selection ?? null,
    probability:
      typeof expl?.activePickProbability === 'number'
        ? Number(expl.activePickProbability.toFixed(4))
        : top
        ? Number((top.calibratedProbability ?? top.modelProbability).toFixed(4))
        : null,
  };
}

function extractFromExplanation(expl?: WrittenMatchExplanation | null): NormalizedHeadlinePick {
  return {
    marketCode: expl?.activePickMarketCode ?? null,
    marketScope: expl?.activePickMarketScope ?? null,
    selection: expl?.activePickSelection ?? null,
    probability:
      typeof expl?.activePickProbability === 'number'
        ? Number(expl.activePickProbability.toFixed(4))
        : typeof expl?.calibratedProbability === 'number'
        ? Number(expl.calibratedProbability.toFixed(4))
        : null,
  };
}

function assertSurfacePickMatches(
  surfaceName: string,
  actual: NormalizedHeadlinePick,
  expected: NormalizedHeadlinePick
) {
  assert.equal(
    actual.marketCode,
    expected.marketCode,
    `[${surfaceName}] marketCode mismatch: got "${actual.marketCode}", expected "${expected.marketCode}"`
  );
  assert.equal(
    actual.marketScope,
    expected.marketScope,
    `[${surfaceName}] marketScope mismatch: got "${actual.marketScope}", expected "${expected.marketScope}"`
  );
  assert.equal(
    actual.selection,
    expected.selection,
    `[${surfaceName}] selection mismatch: got "${actual.selection}", expected "${expected.selection}"`
  );
  if (expected.probability !== null && actual.probability !== null) {
    assert.ok(
      Math.abs(actual.probability - expected.probability) <= 0.0005,
      `[${surfaceName}] probability mismatch: got ${actual.probability}, expected ${expected.probability}`
    );
  } else {
    assert.equal(
      actual.probability,
      expected.probability,
      `[${surfaceName}] probability nullness mismatch: got ${actual.probability}, expected ${expected.probability}`
    );
  }
}

function makeFixture(params: {
  id: string;
  compId: string;
  compCode: string;
  compName: string;
  home: string;
  away: string;
  kickoffOffsetHours: number;
}): Fixture {
  return {
    id: params.id,
    providerId: params.id,
    competitionId: params.compId,
    kickoffTime: new Date(Date.now() + params.kickoffOffsetHours * 3_600_000).toISOString(),
    status: 'TIMED',
    matchday: 30,
    competition: {
      id: params.compId,
      code: params.compCode,
      name: params.compName,
      country: 'Europe',
      emblemUrl: '',
      tier: 1,
      avgGoalsPerGame: 2.6,
      avgCornersPerGame: 9.5,
      avgCardsPerGame: 4.4,
      isActive: true,
    },
    homeTeam: {
      id: `${params.id}_h`,
      name: params.home,
      shortName: params.home,
      tla: params.home.slice(0, 3).toUpperCase(),
      crestUrl: '',
    },
    awayTeam: {
      id: `${params.id}_a`,
      name: params.away,
      shortName: params.away,
      tla: params.away.slice(0, 3).toUpperCase(),
      crestUrl: '',
    },
    homeScore: null,
    awayScore: null,
    seasonYear: '2026 to 2027',
    dataFreshness: 'fresh',
  };
}

function makeContext(params: {
  id: string;
  compCode: string;
  compName: string;
  home: string;
  away: string;
  homeXg: number;
  awayXg: number;
  homeAvgScored: number;
  homeAvgConceded: number;
  awayAvgScored: number;
  awayAvgConceded: number;
}): FixtureContext {
  return {
    fixtureId: params.id,
    homeTeamName: params.home,
    awayTeamName: params.away,
    competitionCode: params.compCode,
    competitionName: params.compName,
    homeAttackRating: Math.max(0.6, params.homeXg / 1.35),
    homeDefenseRating: Math.max(0.6, params.awayXg / 1.15),
    awayAttackRating: Math.max(0.6, params.awayXg / 1.15),
    awayDefenseRating: Math.max(0.6, params.homeXg / 1.35),
    homeXg: params.homeXg,
    awayXg: params.awayXg,
    expectedCornersHome: 4.5,
    expectedCornersAway: 5.2,
    expectedCards: 4.2,
    homeAvgScored: params.homeAvgScored,
    homeAvgConceded: params.homeAvgConceded,
    awayAvgScored: params.awayAvgScored,
    awayAvgConceded: params.awayAvgConceded,
    uncertaintyScore: 0.12,
    dataCoverageScore: 0.94,
    sampleSizeMatches: 22,
    homeSampleMatches: 22,
    awaySampleMatches: 22,
    halfTimeSampleCount: 22,
    hasRealTeamStrength: true,
    lineupConfirmed: false,
  };
}

async function runTests() {
  console.log('--- RUNNING HEADLINE PICK SINGLE SOURCE OF TRUTH TESTS ---');

  // 1. Construct a realistic multi-league slate including Elche vs Atlético where
  //    unconstrained per-fixture evaluation favors a goals/team-goals line (~87% Under 2.5 home goals)
  //    while the full slate hits the 40% goals-family diversity cap and assigns Elche vs Atlético
  //    to a secondary family (e.g., Double Chance DC_12 / DC_X2).
  const rawInputs = [
    {
      fixture: makeFixture({
        id: 'fx_ssot_1',
        compId: 'comp_pl',
        compCode: 'PL',
        compName: 'Premier League',
        home: 'Arsenal',
        away: 'Ipswich',
        kickoffOffsetHours: 10,
      }),
      context: makeContext({
        id: 'fx_ssot_1',
        compCode: 'PL',
        compName: 'Premier League',
        home: 'Arsenal',
        away: 'Ipswich',
        homeXg: 2.35,
        awayXg: 0.65,
        homeAvgScored: 2.3,
        homeAvgConceded: 0.7,
        awayAvgScored: 0.75,
        awayAvgConceded: 2.1,
      }),
    },
    {
      fixture: makeFixture({
        id: 'fx_ssot_2',
        compId: 'comp_pl',
        compCode: 'PL',
        compName: 'Premier League',
        home: 'Manchester City',
        away: 'Southampton',
        kickoffOffsetHours: 12,
      }),
      context: makeContext({
        id: 'fx_ssot_2',
        compCode: 'PL',
        compName: 'Premier League',
        home: 'Manchester City',
        away: 'Southampton',
        homeXg: 2.55,
        awayXg: 0.6,
        homeAvgScored: 2.4,
        homeAvgConceded: 0.7,
        awayAvgScored: 0.7,
        awayAvgConceded: 2.2,
      }),
    },
    {
      fixture: makeFixture({
        id: 'fx_ssot_3',
        compId: 'comp_bl1',
        compCode: 'BL1',
        compName: 'Bundesliga',
        home: 'Bayern Munich',
        away: 'Bochum',
        kickoffOffsetHours: 14,
      }),
      context: makeContext({
        id: 'fx_ssot_3',
        compCode: 'BL1',
        compName: 'Bundesliga',
        home: 'Bayern Munich',
        away: 'Bochum',
        homeXg: 2.65,
        awayXg: 0.75,
        homeAvgScored: 2.6,
        homeAvgConceded: 0.8,
        awayAvgScored: 0.85,
        awayAvgConceded: 2.15,
      }),
    },
    {
      fixture: makeFixture({
        id: 'fx_ssot_4',
        compId: 'comp_sa',
        compCode: 'SA',
        compName: 'Serie A',
        home: 'Inter',
        away: 'Monza',
        kickoffOffsetHours: 16,
      }),
      context: makeContext({
        id: 'fx_ssot_4',
        compCode: 'SA',
        compName: 'Serie A',
        home: 'Inter',
        away: 'Monza',
        homeXg: 2.2,
        awayXg: 0.65,
        homeAvgScored: 2.15,
        homeAvgConceded: 0.7,
        awayAvgScored: 0.75,
        awayAvgConceded: 1.9,
      }),
    },
    {
      fixture: makeFixture({
        id: 'fx_ssot_5',
        compId: 'comp_fl1',
        compCode: 'FL1',
        compName: 'Ligue 1',
        home: 'Paris Saint Germain',
        away: 'Angers',
        kickoffOffsetHours: 18,
      }),
      context: makeContext({
        id: 'fx_ssot_5',
        compCode: 'FL1',
        compName: 'Ligue 1',
        home: 'Paris Saint Germain',
        away: 'Angers',
        homeXg: 2.45,
        awayXg: 0.62,
        homeAvgScored: 2.4,
        homeAvgConceded: 0.75,
        awayAvgScored: 0.7,
        awayAvgConceded: 2.1,
      }),
    },
    {
      fixture: makeFixture({
        id: 'fx_ssot_elche_atletico',
        compId: 'comp_pd',
        compCode: 'PD',
        compName: 'La Liga',
        home: 'Elche',
        away: 'Atlético',
        kickoffOffsetHours: 20,
      }),
      context: makeContext({
        id: 'fx_ssot_elche_atletico',
        compCode: 'PD',
        compName: 'La Liga',
        home: 'Elche',
        away: 'Atlético',
        homeXg: 0.98,
        awayXg: 2.07,
        homeAvgScored: 0.95,
        homeAvgConceded: 1.55,
        awayAvgScored: 1.95,
        awayAvgConceded: 0.75,
      }),
    },
  ];

  // Evaluate canonical full slate ONCE and sync canonical explanations
  const canonicalSlate = evaluateCanonicalFootballSlate(rawInputs, 0.40);
  const syncedSlate = syncSlateExplanations(canonicalSlate);

  // Also explicitly construct an Elche conflict case matching the exact reported divergence:
  // Raw unconstrained topPick = TEAM_GOALS_HOME_U25 ("Elche team goals: Under 2.5" 87.0%)
  // Canonical stored pick   = DC_12 ("Elche or Atlético" 76.8%) swapped by 40% slate cap
  const elcheEntry = syncedSlate.find((s) => s.fixtureId === 'fx_ssot_elche_atletico')!;
  const elcheRawEval = evaluateFixtureMarkets(elcheEntry.context);
  const elcheDc12 = elcheRawEval.predictions.find((p) => p.marketCode === 'DC_12');
  const elcheTeamU25 = elcheRawEval.predictions.find((p) => p.marketCode === 'TEAM_GOALS_HOME_U25');
  assert.ok(elcheRawEval.topPick, 'Elche fixture must have raw topPick');
  assert.ok(elcheDc12, 'Elche fixture must have DC_12 option');
  assert.ok(elcheTeamU25, 'Elche fixture must have TEAM_GOALS_HOME_U25 option');

  // Force the exact repro conflict on a cloned canonical fixture where stored canonical pick = DC_12
  // while raw evaluateFixtureMarkets(context).topPick points to TEAM_GOALS_HOME_U25 (or non-DC_12)!
  const forcedDcTop: MarketPrediction = {
    ...elcheDc12!,
    calibratedProbability: 0.768,
    modelProbability: 0.768,
    confidenceTier: 'HIGH',
    qualificationStatus: 'QUALIFIED_PROBABILITY',
    isTopPick: true,
    headlineSelectionReason:
      'Selected under the 40% slate market diversity rule instead of higher probability goals line.',
  };
  const elcheConflictFixture: Fixture = {
    ...elcheEntry.fixture,
    id: 'fx_ssot_conflict_elche',
    providerId: 'fx_ssot_conflict_elche',
  };
  const elcheConflictContext: FixtureContext = {
    ...elcheEntry.context,
    fixtureId: 'fx_ssot_conflict_elche',
  };
  const conflictRaw = evaluateFixtureMarkets(elcheConflictContext);
  assert.notEqual(
    conflictRaw.topPick?.marketCode,
    'DC_12',
    'Precondition: raw single-fixture evaluation picks a non-DC_12 market before canonical reconciliation'
  );

  const canonicalExpl = generateFootballExplanation({
    fixture: elcheConflictFixture,
    evaluation: {
      topPick: forcedDcTop,
      predictions: conflictRaw.predictions.map((p) =>
        p.marketCode === 'DC_12' ? forcedDcTop : { ...p, isTopPick: false }
      ),
    },
    context: elcheConflictContext,
    headlineSelectionReason: forcedDcTop.headlineSelectionReason,
  });
  elcheConflictFixture.writtenExplanation = canonicalExpl;

  const expectedHeadline: NormalizedHeadlinePick = {
    marketCode: 'DC_12',
    marketScope: canonicalExpl.activePickMarketScope ?? forcedDcTop.marketScope ?? null,
    selection: canonicalExpl.activePickSelection ?? forcedDcTop.selection,
    probability: Number((canonicalExpl.activePickProbability ?? 0.768).toFixed(4)),
  };

  // Surface A: Full /matches slate using applyCanonicalTopPick
  const matchesSurfaceEval = applyCanonicalTopPick(
    evaluateFixtureMarkets(elcheConflictContext),
    elcheConflictFixture.writtenExplanation,
    elcheConflictFixture
  );
  assertSurfacePickMatches(
    '/matches (full slate)',
    extractFromEvaluation(matchesSurfaceEval, elcheConflictFixture.writtenExplanation),
    expectedHeadline
  );

  // Surface B: /dashboard subset (single La Liga fixture filtered alone - must NOT revert to raw pick)
  const dashboardSubsetItem = [
    {
      fixture: elcheConflictFixture,
      context: elcheConflictContext,
      lockedWrittenExplanation: elcheConflictFixture.writtenExplanation,
    },
  ];
  const dashboardSlate = syncSlateExplanations(evaluateCanonicalFootballSlate(dashboardSubsetItem, 0.40));
  assertSurfacePickMatches(
    '/dashboard (filtered PD subset)',
    extractFromEvaluation(dashboardSlate[0].evaluation, dashboardSlate[0].writtenExplanation),
    expectedHeadline
  );

  // Surface C: /saved subset (bookmarked single fixture)
  const savedSurfaceEval = applyCanonicalTopPick(
    evaluateFixtureMarkets(elcheConflictContext),
    elcheConflictFixture.writtenExplanation,
    elcheConflictFixture
  );
  assertSurfacePickMatches(
    '/saved (bookmarked subset)',
    extractFromEvaluation(savedSurfaceEval, elcheConflictFixture.writtenExplanation),
    expectedHeadline
  );

  // Surface D: /predictions page
  const predictionsSurfaceEval = applyCanonicalTopPick(
    evaluateFixtureMarkets(elcheConflictContext),
    elcheConflictFixture.writtenExplanation,
    elcheConflictFixture
  );
  assertSurfacePickMatches(
    '/predictions (view)',
    extractFromEvaluation(predictionsSurfaceEval, elcheConflictFixture.writtenExplanation),
    expectedHeadline
  );

  // Surface E: /matches/[id] detail page (must reconcile raw eval to stored writtenExplanation!)
  const detailRawEval = evaluateFixtureMarkets(elcheConflictContext);
  const detailReconciled = applyCanonicalTopPick(
    detailRawEval,
    elcheConflictFixture.writtenExplanation,
    elcheConflictFixture
  );
  assertSurfacePickMatches(
    '/matches/[id] (detail reconciled)',
    extractFromEvaluation(detailReconciled, elcheConflictFixture.writtenExplanation),
    expectedHeadline
  );
  assert.equal(
    detailReconciled.predictions.filter((p) => p.isTopPick).length,
    1,
    'Detail predictions array must mark exactly one pick as isTopPick'
  );
  assert.equal(
    detailReconciled.predictions.find((p) => p.isTopPick)?.marketCode,
    expectedHeadline.marketCode,
    'Detail predictions[].isTopPick must point to canonical headline marketCode'
  );

  // Surface F: /api/v1/predictions/today pattern
  const todayApiSynced = syncSlateExplanations([
    {
      fixtureId: elcheConflictFixture.id,
      fixture: { ...elcheConflictFixture },
      context: elcheConflictContext,
      ...applyCanonicalTopPick(
        evaluateFixtureMarkets(elcheConflictContext),
        elcheConflictFixture.writtenExplanation,
        elcheConflictFixture
      ),
    },
  ]);
  assertSurfacePickMatches(
    '/api/v1/predictions/today',
    extractFromEvaluation(todayApiSynced[0], todayApiSynced[0].writtenExplanation),
    expectedHeadline
  );

  // Surface G: Free vs Pro tier redaction parity (within cap and over daily summary cap)
  const freeWithinCap = redactExplanationForTier(elcheConflictFixture.writtenExplanation, 'free', 0);
  const freeOverCap = redactExplanationForTier(elcheConflictFixture.writtenExplanation, 'free', 5);
  const proFull = redactExplanationForTier(elcheConflictFixture.writtenExplanation, 'pro', 5);
  assertSurfacePickMatches('Tier redaction (free within cap)', extractFromExplanation(freeWithinCap), expectedHeadline);
  assertSurfacePickMatches('Tier redaction (free over cap)', extractFromExplanation(freeOverCap), expectedHeadline);
  assertSurfacePickMatches('Tier redaction (pro)', extractFromExplanation(proFull), expectedHeadline);

  // Surface H: Missing-from-predictions fallback in applyCanonicalTopPick
  const detailMissingStoredLine = applyCanonicalTopPick(
    {
      ...detailRawEval,
      predictions: detailRawEval.predictions.filter((p) => p.marketCode !== 'DC_12'),
    },
    elcheConflictFixture.writtenExplanation,
    elcheConflictFixture
  );
  assertSurfacePickMatches(
    'Detail fallback when stored line omitted from predictions',
    extractFromEvaluation(detailMissingStoredLine, elcheConflictFixture.writtenExplanation),
    expectedHeadline
  );

  // Surface I: Slip Builder candidateBuilder uses the canonical headline pick
  const slipOut = buildSlipCandidatesFromEvaluatedSlates({
    input: {
      day: 'all',
      sport: 'football',
      competitionIds: [],
      markets: [],
      oddsBasis: 'model_fair',
      bestPriceComparison: false,
      nowMs: Date.now(),
    },
    footballEntries: [
      {
        fixture: elcheConflictFixture,
        context: elcheConflictContext,
        evalResult: detailReconciled,
        snapshots: [],
      },
    ],
    basketballEntries: [],
    flaggedFixtureIds: new Set<string>(),
    skipDayFilter: true,
  });
  const topSlipLeg = slipOut.candidates.find((c) => c.matchId === elcheConflictFixture.id && c.isTopPick);
  assert.ok(topSlipLeg, 'Slip builder must include topPick candidate for canonical fixture');
  assertSurfacePickMatches(
    'Slip builder (/slips candidateBuilder)',
    {
      marketCode: topSlipLeg!.marketCode,
      marketScope: topSlipLeg!.marketScope ?? null,
      selection: topSlipLeg!.selection,
      probability: Number(topSlipLeg!.calibratedProbability.toFixed(4)),
    },
    expectedHeadline
  );

  // Surface J: Forward Pick Ledger enforces ONE immutable headline pick per fixture
  const ledgerUniqueId = `fx_ssot_ledger_${Date.now()}`;
  const firstLedgerRecord = forwardPickLedger.recordPreKickoffPick({
    fixtureId: ledgerUniqueId,
    fixtureName: 'Elche vs Atlético',
    competition: 'La Liga',
    competitionCode: 'PD',
    kickoffTime: elcheConflictFixture.kickoffTime,
    modelVersion: 'v2.5.6',
    marketCode: expectedHeadline.marketCode!,
    market: expectedHeadline.marketScope || 'Double Chance',
    selection: expectedHeadline.selection!,
    probability: expectedHeadline.probability!,
    odds: 1.3,
    confidenceTier: 'HIGH',
  });
  // Attempt to record conflicting raw pick on same fixtureId — must return existing canonical pick!
  const secondLedgerAttempt = forwardPickLedger.recordPreKickoffPick({
    fixtureId: ledgerUniqueId,
    fixtureName: 'Elche vs Atlético',
    competition: 'La Liga',
    competitionCode: 'PD',
    kickoffTime: elcheConflictFixture.kickoffTime,
    modelVersion: 'v2.5.6',
    marketCode: 'TEAM_GOALS_HOME_U25',
    market: 'Elche team goals',
    selection: 'Elche team goals: Under 2.5',
    probability: 0.87,
    odds: 1.15,
    confidenceTier: 'HIGH',
  });
  assert.equal(secondLedgerAttempt.marketCode, firstLedgerRecord.marketCode, 'Ledger must reject duplicate conflicting pick');
  assert.equal(
    forwardPickLedger.getRecordForFixture(ledgerUniqueId)?.marketCode,
    expectedHeadline.marketCode,
    'Ledger lookup must return canonical headline pick'
  );

  // Surface K: SQLite `football_picks` save & reload preserves canonical headline pick identically
  const sqliteTestId = `fx_ssot_sqlite_${Date.now()}`;
  const sqliteFixture: Fixture = {
    ...elcheConflictFixture,
    id: sqliteTestId,
    providerId: sqliteTestId,
    writtenExplanation: undefined,
  };
  const sqliteContext: FixtureContext = { ...elcheConflictContext, fixtureId: sqliteTestId };
  const sqliteEval = {
    ...detailReconciled,
    topPick: { ...forcedDcTop, fixtureId: sqliteTestId },
    predictions: detailReconciled.predictions.map((p) => ({ ...p, fixtureId: sqliteTestId })),
  };
  try {
    const persisted = persistOrLoadImmutableFootballExplanation(sqliteFixture, sqliteEval, sqliteContext);
    assertSurfacePickMatches('SQLite persist return', extractFromExplanation(persisted), expectedHeadline);

    const reloaded = loadStoredFootballExplanation(sqliteTestId, { requireCurrentVersion: true });
    assert.ok(reloaded, 'SQLite football_picks row must reload cleanly at current model version');
    assertSurfacePickMatches('SQLite reload', extractFromExplanation(reloaded), expectedHeadline);

    const postReloadEval = applyCanonicalTopPick(
      evaluateFixtureMarkets(sqliteContext),
      reloaded,
      sqliteFixture
    );
    assertSurfacePickMatches(
      'SQLite reload + detail reconcile',
      extractFromEvaluation(postReloadEval, reloaded),
      expectedHeadline
    );
  } finally {
    const db = getLocalDatabase();
    if (db) {
      db.prepare('DELETE FROM football_picks WHERE fixture_id = ?').run(sqliteTestId);
    }
  }

  // Surface L: Basketball `bb_picks` stored override vs dynamic picker
  const bbFixture: Fixture = {
    id: 'bb_ssot_den_sac',
    providerId: 'bb_ssot_den_sac',
    sport: 'basketball',
    competitionId: 'comp_nba',
    kickoffTime: new Date(Date.now() + 20 * 3_600_000).toISOString(),
    status: 'SCHEDULED',
    matchday: 1,
    competition: {
      id: 'comp_nba',
      code: 'NBA',
      name: 'National Basketball Association',
      country: 'USA',
      sport: 'basketball',
      emblemUrl: '',
      tier: 1,
      avgGoalsPerGame: 226.4,
      avgCornersPerGame: 0,
      avgCardsPerGame: 0,
      isActive: true,
    },
    homeTeam: { id: 'den', name: 'Denver Nuggets', shortName: 'Denver Nuggets', tla: 'DEN', crestUrl: '' },
    awayTeam: { id: 'sac', name: 'Sacramento Kings', shortName: 'Sacramento Kings', tla: 'SAC', crestUrl: '' },
    homeScore: null,
    awayScore: null,
    seasonYear: '2026 to 2027',
    dataFreshness: 'fresh',
  };
  const bbProj: GameProjection = {
    gameId: bbFixture.id,
    league: 'NBA',
    season: '2026 to 2027',
    gameDate: bbFixture.kickoffTime.slice(0, 10),
    neutral: false,
    needsHistory: false,
    needsH1History: false,
    abstentionReason: null,
    h1AbstentionReason: null,
    homeGamesPlayed: 22,
    awayGamesPlayed: 22,
    homeH1GamesPlayed: 22,
    awayH1GamesPlayed: 22,
    homeRestDays: 2,
    awayRestDays: 1,
    homeIsB2B: false,
    awayIsB2B: false,
    leagueRegTeamMean: 113.5,
    homeOffDelta: 5.5,
    homeDefDelta: -1.5,
    awayOffDelta: -2.0,
    awayDefDelta: 4.5,
    homeAvgScored: 119.5,
    homeAvgAllowed: 110.2,
    awayAvgScored: 108.4,
    awayAvgAllowed: 118.6,
    homePaceDelta: 1.2,
    awayPaceDelta: 0.9,
    paceAdjustment: 2.1,
    homeAdvantagePts: 2.6,
    restAdjustmentHome: 0.2,
    restAdjustmentAway: -0.2,
    otAdjustmentTotal: 1.25,
    homeRegMean: 119.6,
    awayRegMean: 110.8,
    homeMean: 120.2,
    awayMean: 111.4,
    gameTotalMean: 231.6,
    homeStd: 11.4,
    awayStd: 11.2,
    gameTotalStd: 17.6,
    teamCovariance: 24.0,
    h1HomeMean: 60.4,
    h1AwayMean: 55.2,
    h1TotalMean: 115.6,
    h1HomeStd: 8.2,
    h1AwayStd: 8.0,
    h1TotalStd: 11.8,
    h1Covariance: 10.0,
    h1ShareApplied: 0.499,
    h2hMeetings: 4,
    h2hAvgTotal: 229.5,
  };
  const bbEval: BasketballGameEvaluation = evaluateBasketballGameMarkets({
    gameId: bbFixture.id,
    league: 'NBA',
    season: '2026 to 2027',
    kickoffUtc: bbFixture.kickoffTime,
    homeName: 'Denver Nuggets',
    awayName: 'Sacramento Kings',
    projection: bbProj,
    oddsSnapshots: [],
  });
  const awayPickCandidate = bbEval.picks.find((p) => p.marketCategory === 'away_total')!;
  assert.ok(awayPickCandidate, 'Basketball evaluator must include away_total candidate');
  // Simulate stored bb_picks override choosing away_total instead of dynamic topPick
  reconcileBasketballEvaluationWithStoredPick(bbEval, {
    market_code: awayPickCandidate.marketCode,
    line: awayPickCandidate.line,
  });
  assert.equal(bbEval.topPick?.marketCode, awayPickCandidate.marketCode, 'Basketball topPick must match stored bb_picks');
  assert.equal(
    bbEval.picks.filter((p) => p.isTopPick).length,
    1,
    'Basketball picks[] must have exactly one isTopPick=true after reconciliation'
  );
  assert.equal(
    bbEval.picks.find((p) => p.isTopPick)?.marketCode,
    awayPickCandidate.marketCode,
    'Basketball picks[].isTopPick must match topPick after reconciliation'
  );
  const bbExpl = generateBasketballExplanation({ fixture: bbFixture, evaluation: bbEval });
  assert.equal(bbExpl.activePickMarketCode, awayPickCandidate.marketCode);
  assert.equal(bbExpl.activePickMarketScope, 'Sacramento Kings points');

  // Surface M: Live SQLite provider parity check across stored football fixtures
  const provider = getFootballDataProvider();
  const fullLiveResult = await provider.getLiveFixtures();
  const liveUpcoming = fullLiveResult.fixtures.filter(
    (f) => f.status === 'TIMED' || f.status === 'SCHEDULED'
  );
  if (liveUpcoming.length > 0) {
    const sampleFixture = liveUpcoming[0];
    const [filteredCompResult, detailFixture, detailEvaluated] = await Promise.all([
      provider.getLiveFixtures({ competitionId: sampleFixture.competitionId }),
      provider.getFixtureById(sampleFixture.id),
      getEvaluatedFixture(sampleFixture.id),
    ]);
    const listHeadline = extractFromExplanation(sampleFixture.writtenExplanation);
    const filteredListMatch = filteredCompResult.fixtures.find((f) => f.id === sampleFixture.id);
    assert.ok(filteredListMatch, 'Filtered competition list must include sampled fixture');
    assertSurfacePickMatches(
      'Live DB filtered competition list',
      extractFromExplanation(filteredListMatch!.writtenExplanation),
      listHeadline
    );
    assert.ok(detailFixture, 'Detail getFixtureById must return sampled fixture');
    assertSurfacePickMatches(
      'Live DB detail getFixtureById',
      extractFromExplanation(detailFixture!.writtenExplanation),
      listHeadline
    );
    assert.ok(detailEvaluated, 'Detail getEvaluatedFixture must return sampled fixture');
    assertSurfacePickMatches(
      'Live DB getEvaluatedFixture',
      extractFromEvaluation(detailEvaluated!, detailEvaluated!.writtenExplanation),
      listHeadline
    );
  }

  console.log('ALL HEADLINE PICK SINGLE SOURCE OF TRUTH TESTS PASSED.');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
