// CALIBRALL: Live Basketball Sync Pipeline (NBA, NCAAB D1-vs-D1, EuroLeague)
// Executed ONLY inside /api/v1/sync cron / admin syncs — NEVER on visitor reads.
// Folds cleanly into existing sync route without adding new Vercel cron entries.

import { SyncMode, BASKETBALL_SYNC_ENABLED } from '@/lib/data/providerBudget';
import {
  recordProviderCall,
  upsertProviderSyncState,
} from '@/lib/data/providerCallLogger';
import {
  CURRENT_BASKETBALL_SEASON,
  seasonLabelToEuroLeagueCode,
} from './markets';
import { fetchEspnScoreboardDates } from './sources/espnScoreboardSource';
import { fetchEuroLeagueSeason } from './sources/euroleagueSource';
import { upsertBasketballData, StoredBbGame } from './store';
import { CanonicalBasketballTeam } from './canonicalTeams';
import {
  buildEvaluatedBasketballSlate,
  bustBasketballSlateCache,
} from './readService';
import { syncBasketballOdds, BasketballOddsSyncResult } from './oddsService';
import {
  recordPreTipoffBasketballPicks,
  settlePendingBasketballPicks,
} from './settlementService';

export interface BasketballLiveSyncResult {
  enabled: boolean;
  mode: SyncMode;
  status: 'ONLINE' | 'DISABLED' | 'ERROR';
  callsMade: number;
  nbaGamesUpserted: number;
  ncaabGamesUpserted: number;
  euroleagueGamesUpserted: number;
  totalGamesUpserted: number;
  unresolvedTeamsCount: number;
  oddsResult: BasketballOddsSyncResult | null;
  picksRecorded: number;
  picksSkippedExisting: number;
  settlementResult: {
    checked: number;
    settledWon: number;
    settledLost: number;
    settledPush: number;
    settledVoid: number;
    stillPending: number;
  } | null;
  latencyMs: number;
  error?: string;
}

function buildUtcDateOffsets(minOffset: number, maxOffset: number): string[] {
  const now = new Date();
  const baseMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: string[] = [];
  for (let d = minOffset; d <= maxOffset; d++) {
    out.push(new Date(baseMs + d * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

export async function syncBasketballLivePipeline(
  mode: SyncMode = 'full'
): Promise<BasketballLiveSyncResult> {
  const t0 = Date.now();
  const attemptIso = new Date().toISOString();

  if (!BASKETBALL_SYNC_ENABLED) {
    return {
      enabled: false,
      mode,
      status: 'DISABLED',
      callsMade: 0,
      nbaGamesUpserted: 0,
      ncaabGamesUpserted: 0,
      euroleagueGamesUpserted: 0,
      totalGamesUpserted: 0,
      unresolvedTeamsCount: 0,
      oddsResult: null,
      picksRecorded: 0,
      picksSkippedExisting: 0,
      settlementResult: null,
      latencyMs: Date.now() - t0,
    };
  }

  let callsMade = 0;
  let nbaGamesUpserted = 0;
  let ncaabGamesUpserted = 0;
  let euroleagueGamesUpserted = 0;
  let totalUnresolved = 0;
  const errors: string[] = [];

  // Keep ESPN date span compact so sync finishes well within 60s maxDuration
  const espnDates =
    mode === 'live'
      ? buildUtcDateOffsets(-1, 1) // yesterday, today, tomorrow
      : buildUtcDateOffsets(-2, 3); // -2..+3 days

  const allTeams: CanonicalBasketballTeam[] = [];
  const allGames: StoredBbGame[] = [];
  const allUnresolved: Array<{ sourceName: string; sourceProvider: string; count: number }> = [];

  // 1. NBA Scoreboard (ESPN)
  try {
    const tNba = Date.now();
    const nbaRes = await fetchEspnScoreboardDates({
      league: 'NBA',
      season: CURRENT_BASKETBALL_SEASON,
      dates: espnDates,
      delayMs: 80,
      concurrency: 2,
    });
    callsMade += nbaRes.datesQueried;
    allTeams.push(...nbaRes.teams);
    allGames.push(...nbaRes.games);
    allUnresolved.push(...nbaRes.unresolvedTeams);
    nbaGamesUpserted = nbaRes.games.length;

    await recordProviderCall({
      timestamp: new Date().toISOString(),
      provider: 'espn_nba',
      endpoint: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard (${nbaRes.datesQueried} dates)`,
      method: 'GET',
      statusCode: 200,
      ok: true,
      latencyMs: Date.now() - tNba,
      leagueCode: 'NBA',
      syncMode: mode,
      quotaHeaders: {},
      quotaRemaining: null,
      responseBody: `Synced ${nbaRes.games.length} NBA games`,
    });

    await upsertProviderSyncState('provider:espn_nba', {
      sport: 'basketball',
      providerName: 'ESPN NBA Scoreboard',
      status: 'ONLINE',
      lastAttemptAt: attemptIso,
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
      lastHttpStatus: 200,
      callsUsedLastRun: nbaRes.datesQueried,
    });
  } catch (err: any) {
    const msg = err?.message || 'ESPN NBA scoreboard failed';
    errors.push(`NBA: ${msg}`);
    await upsertProviderSyncState('provider:espn_nba', {
      sport: 'basketball',
      providerName: 'ESPN NBA Scoreboard',
      status: 'ERROR',
      lastAttemptAt: attemptIso,
      lastError: msg,
      callsUsedLastRun: espnDates.length,
    });
  }

  // 2. NCAAB Scoreboard (ESPN Men's D1)
  try {
    const tNcaab = Date.now();
    const ncaabRes = await fetchEspnScoreboardDates({
      league: 'NCAAB',
      season: CURRENT_BASKETBALL_SEASON,
      dates: espnDates,
      delayMs: 80,
      concurrency: 2,
    });
    callsMade += ncaabRes.datesQueried;
    allTeams.push(...ncaabRes.teams);
    allGames.push(...ncaabRes.games);
    allUnresolved.push(...ncaabRes.unresolvedTeams);
    ncaabGamesUpserted = ncaabRes.games.length;

    await recordProviderCall({
      timestamp: new Date().toISOString(),
      provider: 'espn_ncaab',
      endpoint: `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard (${ncaabRes.datesQueried} dates)`,
      method: 'GET',
      statusCode: 200,
      ok: true,
      latencyMs: Date.now() - tNcaab,
      leagueCode: 'NCAAB',
      syncMode: mode,
      quotaHeaders: {},
      quotaRemaining: null,
      responseBody: `Synced ${ncaabRes.games.length} NCAAB D1 games`,
    });
  } catch (err: any) {
    const msg = err?.message || 'ESPN NCAAB scoreboard failed';
    errors.push(`NCAAB: ${msg}`);
  }

  // 3. EuroLeague Current Season v2 (on schedule/full syncs, or live)
  try {
    const tEl = Date.now();
    const elCode = seasonLabelToEuroLeagueCode(CURRENT_BASKETBALL_SEASON) || 'E2026';
    const elRes = await fetchEuroLeagueSeason(CURRENT_BASKETBALL_SEASON);
    callsMade += 1;
    allTeams.push(...elRes.teams);
    allGames.push(...elRes.games);
    allUnresolved.push(...elRes.unresolvedTeams);
    euroleagueGamesUpserted = elRes.games.length;

    await recordProviderCall({
      timestamp: new Date().toISOString(),
      provider: 'euroleague',
      endpoint: `https://api-live.euroleague.net/v2/competitions/E/seasons/${elCode}/games`,
      method: 'GET',
      statusCode: 200,
      ok: true,
      latencyMs: Date.now() - tEl,
      leagueCode: 'EUROLEAGUE',
      syncMode: mode,
      quotaHeaders: {},
      quotaRemaining: null,
      responseBody: `Synced ${elRes.games.length} EuroLeague games`,
    });
  } catch (err: any) {
    const msg = err?.message || 'EuroLeague v2 API failed';
    errors.push(`EuroLeague: ${msg}`);
  }

  // 4. Batched DB upsert of teams & games
  let totalGamesUpserted = 0;
  if (allGames.length > 0) {
    const upRes = await upsertBasketballData(allTeams, allGames, allUnresolved, false);
    totalGamesUpserted = upRes.inserted;
    totalUnresolved = allUnresolved.length;
    if (upRes.errors.length > 0) {
      errors.push(...upRes.errors);
    }
  }

  await bustBasketballSlateCache();

  // 5. Evaluate current slate, sync credit-safe Odds API (schedule/full only), record pre-tipoff picks & settle finished games
  let oddsResult: BasketballOddsSyncResult | null = null;
  let picksRecorded = 0;
  let picksSkippedExisting = 0;

  try {
    let slate = await buildEvaluatedBasketballSlate(true);

    if (mode !== 'live') {
      const teamLookup = new Map<string, { id: string; name: string; aliases: string[] }>();
      for (const f of slate.fixtures) {
        teamLookup.set(f.homeTeam.id, { id: f.homeTeam.id, name: f.homeTeam.name, aliases: [] });
        teamLookup.set(f.awayTeam.id, { id: f.awayTeam.id, name: f.awayTeam.name, aliases: [] });
      }

      const upcomingGames = Object.values(slate.gamesById).filter((g) => g.status === 'SCHEDULED');
      const highTierIds = new Set<string>();
      for (const ev of Object.values(slate.evaluationsById)) {
        if ((ev.league === 'NBA' || ev.league === 'EUROLEAGUE') && ev.topPick?.tier === 'HIGH') {
          highTierIds.add(ev.gameId);
        }
      }

      oddsResult = await syncBasketballOdds({
        upcomingGames,
        teamLookup,
        highTierGameIds: highTierIds,
        syncMode: mode,
      });

      if (oddsResult.quotesUpserted > 0) {
        await bustBasketballSlateCache();
        slate = await buildEvaluatedBasketballSlate(true);
      }
    }

    const gamesByIdMap = new Map<string, StoredBbGame>(Object.entries(slate.gamesById));
    const recRes = await recordPreTipoffBasketballPicks({
      evaluations: Object.values(slate.evaluationsById),
      gamesById: gamesByIdMap,
    });
    picksRecorded = recRes.recordedCount;
    picksSkippedExisting = recRes.skippedExisting;
  } catch (err: any) {
    errors.push(`Pick/Odds pipeline: ${err?.message || err}`);
  }

  let settlementResult: BasketballLiveSyncResult['settlementResult'] = null;
  try {
    settlementResult = await settlePendingBasketballPicks();
  } catch (err: any) {
    errors.push(`Settlement: ${err?.message || err}`);
  }

  const ok = errors.length === 0 || totalGamesUpserted > 0;
  const finishIso = new Date().toISOString();

  await upsertProviderSyncState('basketball', {
    sport: 'basketball',
    providerName: 'ESPN NBA/NCAAB + EuroLeague v2 + Totals Engine',
    status: ok ? 'ONLINE' : 'ERROR',
    lastAttemptAt: attemptIso,
    ...(ok
      ? { lastSuccessAt: finishIso, lastError: errors.length > 0 ? errors.join('; ') : null, lastHttpStatus: 200 }
      : { lastError: errors.join('; '), lastHttpStatus: 500 }),
    callsUsedLastRun: callsMade + (oddsResult?.callsMade || 0),
    skippedLeagues: [],
  });

  return {
    enabled: true,
    mode,
    status: ok ? 'ONLINE' : 'ERROR',
    callsMade: callsMade + (oddsResult?.callsMade || 0),
    nbaGamesUpserted,
    ncaabGamesUpserted,
    euroleagueGamesUpserted,
    totalGamesUpserted,
    unresolvedTeamsCount: totalUnresolved,
    oddsResult,
    picksRecorded,
    picksSkippedExisting,
    settlementResult,
    latencyMs: Date.now() - t0,
    ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
  };
}
