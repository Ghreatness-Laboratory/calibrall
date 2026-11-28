// CALIBRALL: Separate Basketball Pre-Tipoff Recording & Settlement Ledger
// Strictly uses bb_picks and bb_settlements (sport = 'basketball').
// NEVER mixes basketball picks, Brier scores, Log Loss, or ROI with football.
// Settlement rules:
//   - Only pre-tipoff picks recorded while game.status === 'SCHEDULED' and kickoff_utc > now (immutable hash)
//   - Marked PENDING until game reaches FINISHED (or POSTPONED/CANCELED -> VOID)
//   - Exact integer line hit (actual === line) -> PUSH (0 Brier/LogLoss penalty)
//   - H1 markets settle strictly from real h1_home / h1_away (never estimated; remains PENDING if missing, or VOID >72h post-game)

import crypto from 'crypto';
import {
  supabase,
  isSupabaseConfigured,
  assertPersistenceConfigured,
} from '@/lib/supabase/client';
import { fetchAllRows, chunkArray } from '@/lib/supabase/pagination';
import {
  BasketballLeague,
  BasketballMarketCategory,
  BasketballMarketCode,
} from './markets';
import { StoredBbGame } from './store';
import {
  BasketballGameEvaluation,
  BasketballPickCandidate,
  BASKETBALL_MODEL_VERSION,
} from './picker';
import { generateBasketballExplanation } from '@/lib/prediction/explanationGenerator';
import { resolveBasketballMarketLabelAndScope } from '@/lib/prediction/marketCatalog';
import { cleanDisplayText } from '@/lib/utils/formatText';
import type { Fixture, WrittenMatchAlternate } from '@/types';

export interface BasketballForwardLeagueBreakdown {
  league: BasketballLeague;
  totalPicks: number;
  gradedCount: number;
  won: number;
  lost: number;
  pushed: number;
  brierScore: number | null;
  logLoss: number | null;
}

export interface BasketballForwardMarketBreakdown {
  marketCategory: BasketballMarketCategory;
  totalPicks: number;
  gradedCount: number;
  won: number;
  lost: number;
  pushed: number;
  brierScore: number | null;
  logLoss: number | null;
}

export interface BasketballForwardSummary {
  sport: 'basketball';
  totalPicks: number;
  settledCount: number;
  pendingCount: number;
  wonCount: number;
  lostCount: number;
  pushCount: number;
  voidCount: number;
  brierScore: number | null;
  logLoss: number | null;
  pricedSettledCount: number;
  yieldRoi: number | null;
  byLeague: BasketballForwardLeagueBreakdown[];
  byMarketCategory: BasketballForwardMarketBreakdown[];
}

export interface BasketballForwardPickRow {
  id: string;
  gameId: string;
  sport: 'basketball';
  league: BasketballLeague;
  season: string;
  matchLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffUtc: string | null;
  recordedAt: string;
  marketCode: BasketballMarketCode;
  marketCategory: BasketballMarketCategory;
  selection: string;
  line: number;
  projectedMean: number | null;
  projectedStd: number | null;
  rawProbability: number | null;
  modelProbability: number;
  marketOdds: number | null;
  impliedProbability: number | null;
  expectedValue: number | null;
  isModelLine: boolean;
  priceSource: string;
  confidenceTier: string;
  qualificationStatus: string;
  isTopPick: boolean;
  recordHash: string;
  evidenceLine: string;
  summary?: string;
  reasoning?: Record<string, any>;
  alternates?: WrittenMatchAlternate[];
  settlementStatus: 'PENDING' | 'WON' | 'LOST' | 'PUSH' | 'VOID';
  actualValue: number | null;
  actualScore: string | null;
  brierError: number | null;
  logLoss: number | null;
  settledAt: string | null;
}

export function computeBasketballPickHash(payload: {
  gameId: string;
  kickoffUtc: string;
  recordedAt: string;
  modelVersion: string;
  marketCode: string;
  line: number;
  probability: number;
  marketOdds: number | null;
}): string {
  const canonical = [
    payload.gameId,
    payload.kickoffUtc,
    payload.recordedAt,
    payload.modelVersion,
    payload.marketCode,
    payload.line.toFixed(1),
    payload.probability.toFixed(4),
    payload.marketOdds !== null ? payload.marketOdds.toFixed(3) : 'NO_PRICE',
  ].join('|');

  return 'sha256_' + crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 32);
}

function makePickId(gameId: string, category: BasketballMarketCategory, side: string): string {
  return `bbp_${gameId}_${category}_${side}`;
}

/**
 * Records pre-tipoff diversified top picks strictly BEFORE scheduled kickoff.
 * Never overwrites an already-recorded immutable pick row.
 */
export async function recordPreTipoffBasketballPicks(params: {
  evaluations: BasketballGameEvaluation[];
  gamesById: Map<string, StoredBbGame>;
  nowMs?: number;
}): Promise<{ recordedCount: number; skippedExisting: number; skippedLiveOrStarted: number }> {
  assertPersistenceConfigured();
  if (!isSupabaseConfigured || !supabase) {
    return { recordedCount: 0, skippedExisting: 0, skippedLiveOrStarted: 0 };
  }

  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const candidatePicks: Array<{ ev: BasketballGameEvaluation; pick: BasketballPickCandidate; game: StoredBbGame; id: string }> = [];
  let skippedLiveOrStarted = 0;

  for (const ev of params.evaluations) {
    const pick = ev.topPick;
    if (!pick || pick.tier === 'ABSTAIN' || ev.needsHistory) continue;

    const game = params.gamesById.get(ev.gameId);
    if (!game || game.status !== 'SCHEDULED') {
      skippedLiveOrStarted++;
      continue;
    }

    const kickoffStr = game.kickoff_utc || `${game.game_date}T23:59:59Z`;
    const kickoffMs = Date.parse(kickoffStr);
    if (!Number.isFinite(kickoffMs) || kickoffMs <= nowMs) {
      skippedLiveOrStarted++;
      continue;
    }

    candidatePicks.push({
      id: makePickId(game.id, pick.marketCategory, pick.side),
      ev,
      pick,
      game,
    });
  }

  if (candidatePicks.length === 0) {
    return { recordedCount: 0, skippedExisting: 0, skippedLiveOrStarted };
  }

  // Query existing pick IDs in chunks so pre-tipoff rows remain strictly immutable
  const existingIds = new Set<string>();
  const candidateIds = candidatePicks.map((c) => c.id);
  for (const idChunk of chunkArray(candidateIds, 200)) {
    const { data } = await supabase
      .from('bb_picks')
      .select('id')
      .in('id', idChunk);
    if (Array.isArray(data)) {
      for (const row of data) {
        if (row?.id) existingIds.add(String(row.id));
      }
    }
  }

  const newEntries = candidatePicks.filter((c) => !existingIds.has(c.id));
  const skippedExisting = candidatePicks.length - newEntries.length;

  if (newEntries.length === 0) {
    return { recordedCount: 0, skippedExisting, skippedLiveOrStarted };
  }

  // Fetch team names for deterministic explanation templates when ev.writtenExplanation is absent
  const bbTeamNameMap = new Map<string, string>();
  const teamIdsNeeded = Array.from(new Set(newEntries.flatMap((e) => [e.game.home_id, e.game.away_id])));
  for (const chunk of chunkArray(teamIdsNeeded, 200)) {
    const { data: teamRows } = await supabase.from('bb_teams').select('id, name').in('id', chunk);
    for (const tr of teamRows || []) {
      bbTeamNameMap.set(String(tr.id), String(tr.name));
    }
  }

  const pickPayloads = newEntries.map(({ id, ev, pick, game }) => {
    const kickoffIso = game.kickoff_utc || `${game.game_date}T00:00:00Z`;
    const recordHash = computeBasketballPickHash({
      gameId: game.id,
      kickoffUtc: kickoffIso,
      recordedAt: nowIso,
      modelVersion: BASKETBALL_MODEL_VERSION,
      marketCode: pick.marketCode,
      line: pick.line,
      probability: pick.calibratedProbability,
      marketOdds: pick.marketOdds,
    });

    const homeLabel = bbTeamNameMap.get(game.home_id) || game.home_id;
    const awayLabel = bbTeamNameMap.get(game.away_id) || game.away_id;
    const stubFixture: Fixture = {
      id: game.id,
      providerId: game.id,
      providerName: game.source,
      fetchTime: nowIso,
      source: game.source,
      competitionId: `comp_${game.league.toLowerCase()}`,
      competition: {
        id: `comp_${game.league.toLowerCase()}`,
        code: game.league,
        name: game.league,
        country: game.league === 'EUROLEAGUE' ? 'Europe' : 'USA',
        emblemUrl: '',
        tier: 1,
        avgGoalsPerGame: 220,
        avgCornersPerGame: 0,
        avgCardsPerGame: 0,
        isActive: true,
      },
      seasonYear: game.season,
      sport: 'basketball',
      homeTeam: { id: game.home_id, name: homeLabel, shortName: homeLabel, tla: homeLabel.slice(0, 3).toUpperCase(), crestUrl: '' },
      awayTeam: { id: game.away_id, name: awayLabel, shortName: awayLabel, tla: awayLabel.slice(0, 3).toUpperCase(), crestUrl: '' },
      kickoffTime: kickoffIso,
      matchday: 1,
      status: game.status as any,
      homeScore: game.home_pts,
      awayScore: game.away_pts,
      dataFreshness: nowIso,
    };

    const expl = ev.writtenExplanation || generateBasketballExplanation({ fixture: stubFixture, evaluation: ev });

    return {
      id,
      game_id: game.id,
      sport: 'basketball',
      league: game.league,
      season: game.season,
      market_code: pick.marketCode,
      market_category: pick.marketCategory,
      selection: pick.selection,
      line: pick.line,
      projected_mean: pick.projectedMean,
      projected_std: pick.projectedStd,
      raw_probability: pick.rawProbability,
      model_probability: pick.calibratedProbability,
      market_odds: pick.marketOdds,
      implied_probability: pick.impliedProbability,
      expected_value: pick.isModelLine ? null : pick.expectedValue,
      model_version: BASKETBALL_MODEL_VERSION,
      model_confidence: pick.modelConfidence,
      confidence_tier: pick.tier,
      qualification_status: pick.qualificationStatus,
      is_top_pick: pick.isTopPick ? 1 : 0,
      is_model_line: pick.isModelLine ? 1 : 0,
      price_source: pick.priceSource,
      evidence_json: {
        evidenceLine: pick.evidenceLine,
        side: pick.side,
        passedBaselineGate: pick.passedBaselineGate,
      },
      summary: expl.fullSummary,
      reasoning_json: JSON.stringify(expl.reasoning || {}),
      alternates_json: JSON.stringify(expl.alternates || []),
      record_hash: recordHash,
      recorded_at: nowIso,
      kickoff_utc: kickoffIso,
    };
  });

  const settlementPayloads = newEntries.map(({ id, game }) => ({
    id: `bbs_${id}`,
    pick_id: id,
    game_id: game.id,
    sport: 'basketball',
    settlement_status: 'PENDING',
    actual_value: null,
    actual_score: null,
    brier_error: null,
    log_loss: null,
    settled_at: null,
    updated_at: nowIso,
  }));

  let recordedCount = 0;
  for (const chunk of chunkArray(pickPayloads, 200)) {
    const { error } = await supabase.from('bb_picks').upsert(chunk, { onConflict: 'id' });
    if (error) {
      throw new Error(`Failed recording bb_picks: ${error.message}`);
    }
    recordedCount += chunk.length;
  }

  for (const chunk of chunkArray(settlementPayloads, 200)) {
    const { error } = await supabase.from('bb_settlements').upsert(chunk, { onConflict: 'pick_id' });
    if (error) {
      throw new Error(`Failed recording bb_settlements: ${error.message}`);
    }
  }

  return { recordedCount, skippedExisting, skippedLiveOrStarted };
}

export function evaluateBasketballSettlementOutcome(params: {
  marketCode: BasketballMarketCode | string;
  marketCategory: BasketballMarketCategory | string;
  line: number;
  calibratedProbability: number;
  game: Pick<
    StoredBbGame,
    'status' | 'home_pts' | 'away_pts' | 'h1_home' | 'h1_away' | 'game_date' | 'kickoff_utc'
  >;
  nowMs?: number;
}): {
  settlementStatus: 'PENDING' | 'WON' | 'LOST' | 'PUSH' | 'VOID';
  actualValue: number | null;
  actualScore: string | null;
  brierError: number | null;
  logLoss: number | null;
} {
  const { marketCode, marketCategory, line, calibratedProbability, game } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (game.status === 'POSTPONED' || game.status === 'CANCELED') {
    return {
      settlementStatus: 'VOID',
      actualValue: null,
      actualScore: game.status,
      brierError: null,
      logLoss: null,
    };
  }

  if (game.status !== 'FINISHED') {
    return {
      settlementStatus: 'PENDING',
      actualValue: null,
      actualScore: null,
      brierError: null,
      logLoss: null,
    };
  }

  const hPts = game.home_pts !== null && game.home_pts !== undefined ? Number(game.home_pts) : null;
  const aPts = game.away_pts !== null && game.away_pts !== undefined ? Number(game.away_pts) : null;
  const h1H = game.h1_home !== null && game.h1_home !== undefined ? Number(game.h1_home) : null;
  const h1A = game.h1_away !== null && game.h1_away !== undefined ? Number(game.h1_away) : null;

  let actualValue: number | null = null;
  let actualScore: string | null = hPts !== null && aPts !== null ? `${hPts} - ${aPts}` : null;

  if (marketCategory === 'game_total') {
    if (hPts !== null && aPts !== null) actualValue = hPts + aPts;
  } else if (marketCategory === 'home_total') {
    if (hPts !== null) actualValue = hPts;
  } else if (marketCategory === 'away_total') {
    if (aPts !== null) actualValue = aPts;
  } else if (marketCategory === 'h1_game_total') {
    if (h1H !== null && h1A !== null) {
      actualValue = h1H + h1A;
      actualScore = `1H ${h1H} - ${h1A} (FT ${hPts ?? '?'} - ${aPts ?? '?'})`;
    }
  } else if (marketCategory === 'h1_team_total') {
    const isAwaySide = String(marketCode).includes('AWAY');
    if (isAwaySide && h1A !== null) {
      actualValue = h1A;
      actualScore = `1H ${h1H ?? '?'} - ${h1A} (FT ${hPts ?? '?'} - ${aPts ?? '?'})`;
    } else if (!isAwaySide && h1H !== null) {
      actualValue = h1H;
      actualScore = `1H ${h1H} - ${h1A ?? '?'} (FT ${hPts ?? '?'} - ${aPts ?? '?'})`;
    }
  }

  // Never estimate missing half scores! Stay PENDING briefly in case scoreboard linescores lag, or VOID if >72h stale.
  if (actualValue === null || !Number.isFinite(actualValue)) {
    const gameMs = Date.parse(game.kickoff_utc || `${game.game_date}T23:59:59Z`);
    if (Number.isFinite(gameMs) && nowMs - gameMs > 72 * 3600_000) {
      return {
        settlementStatus: 'VOID',
        actualValue: null,
        actualScore: actualScore || 'Missing official period breakdown',
        brierError: null,
        logLoss: null,
      };
    }
    return {
      settlementStatus: 'PENDING',
      actualValue: null,
      actualScore,
      brierError: null,
      logLoss: null,
    };
  }

  // Exact integer line hit -> PUSH
  if (Math.abs(actualValue - line) < 1e-6) {
    return {
      settlementStatus: 'PUSH',
      actualValue,
      actualScore,
      brierError: null,
      logLoss: null,
    };
  }

  const isOver = String(marketCode).endsWith('_OVER');
  const won = isOver ? actualValue > line : actualValue < line;
  const outcome = won ? 1 : 0;
  const p = Math.max(0.001, Math.min(0.999, Number(calibratedProbability) || 0.5));
  const brierError = Math.round(Math.pow(p - outcome, 2) * 10000) / 10000;
  const logLoss = Math.round(-(outcome * Math.log(p) + (1 - outcome) * Math.log(1 - p)) * 10000) / 10000;

  return {
    settlementStatus: won ? 'WON' : 'LOST',
    actualValue,
    actualScore,
    brierError,
    logLoss,
  };
}

/**
 * Settles all PENDING basketball picks whose games have finished or been postponed/canceled.
 */
export async function settlePendingBasketballPicks(): Promise<{
  checked: number;
  settledWon: number;
  settledLost: number;
  settledPush: number;
  settledVoid: number;
  stillPending: number;
}> {
  assertPersistenceConfigured();
  if (!isSupabaseConfigured || !supabase) {
    return { checked: 0, settledWon: 0, settledLost: 0, settledPush: 0, settledVoid: 0, stillPending: 0 };
  }

  const { data: pendingRows, error } = await fetchAllRows<any>((from, to) =>
    supabase
      .from('bb_settlements')
      .select('id, pick_id, game_id, settlement_status')
      .eq('settlement_status', 'PENDING')
      .order('id', { ascending: true })
      .range(from, to)
  );

  if (error || !Array.isArray(pendingRows) || pendingRows.length === 0) {
    return { checked: 0, settledWon: 0, settledLost: 0, settledPush: 0, settledVoid: 0, stillPending: 0 };
  }

  const pickIds = Array.from(new Set(pendingRows.map((r) => String(r.pick_id))));
  const gameIds = Array.from(new Set(pendingRows.map((r) => String(r.game_id))));

  const pickMap = new Map<string, any>();
  for (const chunk of chunkArray(pickIds, 200)) {
    const { data } = await supabase
      .from('bb_picks')
      .select('id, market_code, market_category, line, model_probability')
      .in('id', chunk);
    if (Array.isArray(data)) {
      for (const p of data) pickMap.set(String(p.id), p);
    }
  }

  const gameMap = new Map<string, StoredBbGame>();
  for (const chunk of chunkArray(gameIds, 200)) {
    const { data } = await supabase
      .from('bb_games')
      .select('id, status, home_pts, away_pts, h1_home, h1_away, game_date, kickoff_utc')
      .in('id', chunk);
    if (Array.isArray(data)) {
      for (const g of data) gameMap.set(String(g.id), g as StoredBbGame);
    }
  }

  const nowIso = new Date().toISOString();
  const updates: any[] = [];
  let settledWon = 0;
  let settledLost = 0;
  let settledPush = 0;
  let settledVoid = 0;
  let stillPending = 0;

  for (const row of pendingRows) {
    const pick = pickMap.get(String(row.pick_id));
    const game = gameMap.get(String(row.game_id));
    if (!pick || !game) {
      stillPending++;
      continue;
    }

    const grade = evaluateBasketballSettlementOutcome({
      marketCode: pick.market_code,
      marketCategory: pick.market_category,
      line: Number(pick.line),
      calibratedProbability: Number(pick.model_probability),
      game,
    });

    if (grade.settlementStatus === 'PENDING') {
      stillPending++;
      continue;
    }

    if (grade.settlementStatus === 'WON') settledWon++;
    else if (grade.settlementStatus === 'LOST') settledLost++;
    else if (grade.settlementStatus === 'PUSH') settledPush++;
    else if (grade.settlementStatus === 'VOID') settledVoid++;

    updates.push({
      id: row.id,
      pick_id: row.pick_id,
      game_id: row.game_id,
      sport: 'basketball',
      settlement_status: grade.settlementStatus,
      actual_value: grade.actualValue,
      actual_score: grade.actualScore,
      brier_error: grade.brierError,
      log_loss: grade.logLoss,
      settled_at: nowIso,
      updated_at: nowIso,
    });
  }

  for (const chunk of chunkArray(updates, 200)) {
    const { error: upErr } = await supabase.from('bb_settlements').upsert(chunk, { onConflict: 'pick_id' });
    if (upErr) {
      throw new Error(`Failed settling bb_settlements: ${upErr.message}`);
    }
  }

  return {
    checked: pendingRows.length,
    settledWon,
    settledLost,
    settledPush,
    settledVoid,
    stillPending,
  };
}

/**
 * Reads separate basketball forward ledger summary strictly from bb_picks + bb_settlements via RPC (with paginated fallback).
 */
export async function getBasketballForwardSummary(): Promise<BasketballForwardSummary> {
  const empty: BasketballForwardSummary = {
    sport: 'basketball',
    totalPicks: 0,
    settledCount: 0,
    pendingCount: 0,
    wonCount: 0,
    lostCount: 0,
    pushCount: 0,
    voidCount: 0,
    brierScore: null,
    logLoss: null,
    pricedSettledCount: 0,
    yieldRoi: null,
    byLeague: [],
    byMarketCategory: [],
  };

  if (!isSupabaseConfigured || !supabase) return empty;

  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_bb_forward_summary');
    if (!rpcErr && rpcData) {
      const parsed = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
      return {
        sport: 'basketball',
        totalPicks: Number(parsed.totalPicks) || 0,
        settledCount: Number(parsed.settledCount) || 0,
        pendingCount: Number(parsed.pendingCount) || 0,
        wonCount: Number(parsed.wonCount) || 0,
        lostCount: Number(parsed.lostCount) || 0,
        pushCount: Number(parsed.pushCount) || 0,
        voidCount: Number(parsed.voidCount) || 0,
        brierScore: parsed.brierScore !== null && parsed.brierScore !== undefined ? Number(parsed.brierScore) : null,
        logLoss: parsed.logLoss !== null && parsed.logLoss !== undefined ? Number(parsed.logLoss) : null,
        pricedSettledCount: Number(parsed.pricedSettledCount) || 0,
        yieldRoi: parsed.yieldRoi !== null && parsed.yieldRoi !== undefined ? Number(parsed.yieldRoi) : null,
        byLeague: Array.isArray(parsed.byLeague) ? parsed.byLeague : [],
        byMarketCategory: Array.isArray(parsed.byMarketCategory) ? parsed.byMarketCategory : [],
      };
    }
  } catch {
    // Fall back cleanly to paginated reads if RPC not yet applied
  }

  try {
    const [{ data: picks }, { data: settlements }] = await Promise.all([
      fetchAllRows<any>((from, to) =>
        supabase.from('bb_picks').select('*').order('id', { ascending: true }).range(from, to)
      ),
      fetchAllRows<any>((from, to) =>
        supabase.from('bb_settlements').select('*').order('id', { ascending: true }).range(from, to)
      ),
    ]);

    if (!picks || picks.length === 0) return empty;
    const settMap = new Map<string, any>();
    for (const s of settlements || []) settMap.set(String(s.pick_id), s);

    let settledCount = 0;
    let pendingCount = 0;
    let wonCount = 0;
    let lostCount = 0;
    let pushCount = 0;
    let voidCount = 0;
    let brierSum = 0;
    let brierN = 0;
    let llSum = 0;
    let llN = 0;
    let pricedSettledCount = 0;
    let pricedProfit = 0;

    const leagueAgg = new Map<BasketballLeague, BasketballForwardLeagueBreakdown & { brierSum: number; llSum: number }>();
    const catAgg = new Map<BasketballMarketCategory, BasketballForwardMarketBreakdown & { brierSum: number; llSum: number }>();

    for (const p of picks) {
      const s = settMap.get(String(p.id));
      const status = (s?.settlement_status || 'PENDING') as 'PENDING' | 'WON' | 'LOST' | 'PUSH' | 'VOID';
      const lg = p.league as BasketballLeague;
      const cat = p.market_category as BasketballMarketCategory;

      const lRow = leagueAgg.get(lg) || {
        league: lg,
        totalPicks: 0,
        gradedCount: 0,
        won: 0,
        lost: 0,
        pushed: 0,
        brierScore: null,
        logLoss: null,
        brierSum: 0,
        llSum: 0,
      };
      const cRow = catAgg.get(cat) || {
        marketCategory: cat,
        totalPicks: 0,
        gradedCount: 0,
        won: 0,
        lost: 0,
        pushed: 0,
        brierScore: null,
        logLoss: null,
        brierSum: 0,
        llSum: 0,
      };

      lRow.totalPicks++;
      cRow.totalPicks++;

      if (status === 'PENDING') pendingCount++;
      else if (status === 'VOID') voidCount++;
      else if (status === 'PUSH') {
        settledCount++;
        pushCount++;
        lRow.pushed++;
        cRow.pushed++;
        if (p.market_odds !== null && p.market_odds !== undefined) pricedSettledCount++;
      } else if (status === 'WON' || status === 'LOST') {
        settledCount++;
        if (status === 'WON') {
          wonCount++;
          lRow.won++;
          cRow.won++;
        } else {
          lostCount++;
          lRow.lost++;
          cRow.lost++;
        }
        lRow.gradedCount++;
        cRow.gradedCount++;

        if (s?.brier_error !== null && s?.brier_error !== undefined) {
          const be = Number(s.brier_error);
          brierSum += be;
          brierN++;
          lRow.brierSum += be;
          cRow.brierSum += be;
        }
        if (s?.log_loss !== null && s?.log_loss !== undefined) {
          const ll = Number(s.log_loss);
          llSum += ll;
          llN++;
          lRow.llSum += ll;
          cRow.llSum += ll;
        }
        if (p.market_odds !== null && p.market_odds !== undefined && Number(p.market_odds) > 1.01) {
          pricedSettledCount++;
          pricedProfit += status === 'WON' ? Number(p.market_odds) - 1 : -1;
        }
      }

      leagueAgg.set(lg, lRow);
      catAgg.set(cat, cRow);
    }

    return {
      sport: 'basketball',
      totalPicks: picks.length,
      settledCount,
      pendingCount,
      wonCount,
      lostCount,
      pushCount,
      voidCount,
      brierScore: brierN > 0 ? Math.round((brierSum / brierN) * 10000) / 10000 : null,
      logLoss: llN > 0 ? Math.round((llSum / llN) * 10000) / 10000 : null,
      pricedSettledCount,
      yieldRoi: pricedSettledCount > 0 ? Math.round(((pricedProfit * 100) / pricedSettledCount) * 100) / 100 : null,
      byLeague: Array.from(leagueAgg.values()).map((r) => ({
        league: r.league,
        totalPicks: r.totalPicks,
        gradedCount: r.gradedCount,
        won: r.won,
        lost: r.lost,
        pushed: r.pushed,
        brierScore: r.gradedCount > 0 ? Math.round((r.brierSum / r.gradedCount) * 10000) / 10000 : null,
        logLoss: r.gradedCount > 0 ? Math.round((r.llSum / r.gradedCount) * 10000) / 10000 : null,
      })),
      byMarketCategory: Array.from(catAgg.values()).map((r) => ({
        marketCategory: r.marketCategory,
        totalPicks: r.totalPicks,
        gradedCount: r.gradedCount,
        won: r.won,
        lost: r.lost,
        pushed: r.pushed,
        brierScore: r.gradedCount > 0 ? Math.round((r.brierSum / r.gradedCount) * 10000) / 10000 : null,
        logLoss: r.gradedCount > 0 ? Math.round((r.llSum / r.gradedCount) * 10000) / 10000 : null,
      })),
    };
  } catch {
    return empty;
  }
}

export async function getBasketballForwardRecords(limit = 50): Promise<BasketballForwardPickRow[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { data: picks, error } = await supabase
      .from('bb_picks')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error || !Array.isArray(picks) || picks.length === 0) return [];

    const pickIds = picks.map((p: any) => String(p.id));
    const gameIds = Array.from(new Set(picks.map((p: any) => String(p.game_id))));

    const settMap = new Map<string, any>();
    for (const chunk of chunkArray(pickIds, 200)) {
      const { data: setts } = await supabase.from('bb_settlements').select('*').in('pick_id', chunk);
      for (const s of setts || []) settMap.set(String(s.pick_id), s);
    }

    const gameMap = new Map<string, any>();
    const teamIds = new Set<string>();
    for (const chunk of chunkArray(gameIds, 200)) {
      const { data: games } = await supabase
        .from('bb_games')
        .select('id, home_id, away_id, game_date')
        .in('id', chunk);
      for (const g of games || []) {
        gameMap.set(String(g.id), g);
        teamIds.add(String(g.home_id));
        teamIds.add(String(g.away_id));
      }
    }

    const teamMap = new Map<string, string>();
    for (const chunk of chunkArray(Array.from(teamIds), 200)) {
      const { data: teams } = await supabase.from('bb_teams').select('id, name').in('id', chunk);
      for (const t of teams || []) teamMap.set(String(t.id), String(t.name));
    }

    return picks.map((p: any) => {
      const s = settMap.get(String(p.id));
      const g = gameMap.get(String(p.game_id));
      const homeName = g ? teamMap.get(String(g.home_id)) || String(g.home_id) : 'Home';
      const awayName = g ? teamMap.get(String(g.away_id)) || String(g.away_id) : 'Away';
      let evObj: any = {};
      try {
        evObj = typeof p.evidence_json === 'string' ? JSON.parse(p.evidence_json) : p.evidence_json || {};
      } catch {
        evObj = {};
      }
      let reasoningObj: Record<string, any> | undefined = undefined;
      try {
        if (p.reasoning_json) {
          reasoningObj = typeof p.reasoning_json === 'string' ? JSON.parse(p.reasoning_json) : p.reasoning_json;
        }
      } catch {
        reasoningObj = undefined;
      }
      let alternatesArr: WrittenMatchAlternate[] | undefined = undefined;
      try {
        if (p.alternates_json) {
          const parsedAlt = typeof p.alternates_json === 'string' ? JSON.parse(p.alternates_json) : p.alternates_json;
          if (Array.isArray(parsedAlt)) alternatesArr = parsedAlt;
        }
      } catch {
        alternatesArr = undefined;
      }

      const side =
        p.market_category === 'home_total'
          ? 'home'
          : p.market_category === 'away_total'
          ? 'away'
          : /home|1st half .*home/i.test(String(p.market_code || ''))
          ? 'home'
          : /away/i.test(String(p.market_code || ''))
          ? 'away'
          : 'game';
      const scopedBb = resolveBasketballMarketLabelAndScope({
        marketCode: String(p.market_code || ''),
        marketCategory: p.market_category as BasketballMarketCategory,
        side,
        rawSelection: String(p.selection || ''),
        line: Number(p.line),
        homeTeam: cleanDisplayText(homeName),
        awayTeam: cleanDisplayText(awayName),
      });

      return {
        id: String(p.id),
        gameId: String(p.game_id),
        sport: 'basketball',
        league: p.league as BasketballLeague,
        season: String(p.season),
        matchLabel: cleanDisplayText(`${homeName} vs ${awayName}`),
        homeTeamName: cleanDisplayText(homeName),
        awayTeamName: cleanDisplayText(awayName),
        kickoffUtc: p.kickoff_utc || null,
        recordedAt: String(p.recorded_at || ''),
        marketCode: p.market_code as BasketballMarketCode,
        marketCategory: p.market_category as BasketballMarketCategory,
        selection: cleanDisplayText(scopedBb.selection || String(p.selection)),
        line: Number(p.line),
        projectedMean: p.projected_mean !== null && p.projected_mean !== undefined ? Number(p.projected_mean) : null,
        projectedStd: p.projected_std !== null && p.projected_std !== undefined ? Number(p.projected_std) : null,
        rawProbability: p.raw_probability !== null && p.raw_probability !== undefined ? Number(p.raw_probability) : null,
        modelProbability: Number(p.model_probability),
        marketOdds: p.market_odds !== null && p.market_odds !== undefined ? Number(p.market_odds) : null,
        impliedProbability: p.implied_probability !== null && p.implied_probability !== undefined ? Number(p.implied_probability) : null,
        expectedValue: p.expected_value !== null && p.expected_value !== undefined ? Number(p.expected_value) : null,
        isModelLine: Boolean(p.is_model_line === 1 || p.is_model_line === true),
        priceSource: String(p.price_source || 'model line - no market price'),
        confidenceTier: String(p.confidence_tier || 'MEDIUM'),
        qualificationStatus: String(p.qualification_status || ''),
        isTopPick: Boolean(p.is_top_pick === 1 || p.is_top_pick === true),
        recordHash: String(p.record_hash || ''),
        evidenceLine: String(evObj.evidenceLine || ''),
        summary: p.summary ? String(p.summary) : undefined,
        reasoning: reasoningObj,
        alternates: alternatesArr,
        settlementStatus: (s?.settlement_status || 'PENDING') as 'PENDING' | 'WON' | 'LOST' | 'PUSH' | 'VOID',
        actualValue: s?.actual_value !== null && s?.actual_value !== undefined ? Number(s.actual_value) : null,
        actualScore: s?.actual_score || null,
        brierError: s?.brier_error !== null && s?.brier_error !== undefined ? Number(s.brier_error) : null,
        logLoss: s?.log_loss !== null && s?.log_loss !== undefined ? Number(s.log_loss) : null,
        settledAt: s?.settled_at || null,
      };
    });
  } catch {
    return [];
  }
}
