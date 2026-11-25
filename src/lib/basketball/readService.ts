// CALIBRALL: Basketball DB-Only Read, Projection & Slate Diversity Service
// Strictly ZERO external HTTP calls. Reads only from Supabase/SQLite bb_* tables + serverCache.
// Evaluates ONLY the 5 authorized basketball totals / 1st-half categories across NBA, NCAAB, and EuroLeague.

import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { fetchAllRows, chunkArray } from '@/lib/supabase/pagination';
import { serverCache } from '@/lib/cache/serverCache';
import {
  getProviderSyncState,
  formatUtcTimeStamp,
} from '@/lib/data/providerCallLogger';
import { FIXTURE_STALE_LIMIT_MINUTES } from '@/lib/data/providerBudget';
import { matchesDayFilter } from '@/lib/utils/dateWindow';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { Competition, Fixture, MatchStatus, Team } from '@/types';
import {
  BasketballLeague,
  CURRENT_BASKETBALL_SEASON,
} from './markets';
import { StoredBbGame } from './store';
import {
  createLeagueState,
  LeagueBaselineState,
  projectBasketballGame,
  updateLeagueStateWithGame,
} from './model';
import { CALIBRATED_BASKETBALL_PARAMS } from './calibratedParams';
import {
  BbOddsQuote,
  BasketballGameEvaluation,
  evaluateBasketballGameMarkets,
  selectDiversifiedBasketballSlatePicks,
} from './picker';

export const BASKETBALL_COMPETITIONS: Record<BasketballLeague, Competition> = {
  NBA: {
    id: 'comp_nba',
    code: 'NBA',
    name: 'National Basketball Association',
    country: 'USA',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 226.4,
    avgCornersPerGame: 0,
    avgCardsPerGame: 0,
    isActive: true,
    hasFreeFixturesSource: true,
    freeFixturesProvider: 'ESPN NBA Scoreboard',
  },
  NCAAB: {
    id: 'comp_ncaab',
    code: 'NCAAB',
    name: 'NCAA Men Division I',
    country: 'USA',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 149.8,
    avgCornersPerGame: 0,
    avgCardsPerGame: 0,
    isActive: true,
    hasFreeFixturesSource: true,
    freeFixturesProvider: 'ESPN Men Basketball Scoreboard',
  },
  EUROLEAGUE: {
    id: 'comp_euroleague',
    code: 'EUROLEAGUE',
    name: 'EuroLeague',
    country: 'Europe',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 172.8,
    avgCornersPerGame: 0,
    avgCardsPerGame: 0,
    isActive: true,
    hasFreeFixturesSource: true,
    freeFixturesProvider: 'EuroLeague Official API v2',
  },
};

export interface BbTeamRow {
  id: string;
  league: BasketballLeague;
  name: string;
  aliases: string[];
}

export interface EvaluatedBasketballSlate {
  builtAt: string;
  fixtures: Fixture[];
  evaluationsById: Record<string, BasketballGameEvaluation>;
  gamesById: Record<string, StoredBbGame>;
  leagueCounts: Record<BasketballLeague, { totalStored: number; windowCount: number }>;
}

const SLATE_CACHE_KEY = 'bb:slate:v1';
const SLATE_CACHE_TTL_SEC = 300; // 5 minutes, busted cleanly on sync

function parseTeamRow(row: any): BbTeamRow {
  let aliases: string[] = [];
  try {
    aliases = Array.isArray(row.aliases)
      ? row.aliases
      : typeof row.aliases === 'string'
      ? JSON.parse(row.aliases)
      : [];
  } catch {
    aliases = [];
  }
  return {
    id: String(row.id),
    league: row.league as BasketballLeague,
    name: String(row.name || row.id),
    aliases: aliases.map(String),
  };
}

function makeTeamTla(name: string, id: string): string {
  const fromId = id.split('_').pop() || '';
  if (fromId.length >= 2 && fromId.length <= 4 && /^[a-z0-9]+$/i.test(fromId)) {
    return fromId.toUpperCase();
  }
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'BBT').padEnd(3, 'X');
}

function toUiTeam(team: BbTeamRow | undefined, fallbackId: string, competitionId: string): Team {
  const rawName = team?.name || fallbackId;
  const cleanName = cleanDisplayText(rawName);
  return {
    id: fallbackId,
    name: cleanName,
    shortName: cleanName,
    tla: makeTeamTla(rawName, fallbackId),
    crestUrl: '',
    competitionId,
  };
}

function parseGameRow(row: any): StoredBbGame {
  let qScores = null;
  try {
    if (row.q_scores) {
      qScores = typeof row.q_scores === 'string' ? JSON.parse(row.q_scores) : row.q_scores;
    }
  } catch {
    qScores = null;
  }

  return {
    id: String(row.id),
    league: row.league as BasketballLeague,
    season: String(row.season),
    game_date: String(row.game_date).slice(0, 10),
    kickoff_utc: row.kickoff_utc || null,
    home_id: String(row.home_id),
    away_id: String(row.away_id),
    neutral: Boolean(row.neutral === 1 || row.neutral === true),
    status: (row.status || 'SCHEDULED') as StoredBbGame['status'],
    home_pts: row.home_pts !== null && row.home_pts !== undefined ? Number(row.home_pts) : null,
    away_pts: row.away_pts !== null && row.away_pts !== undefined ? Number(row.away_pts) : null,
    h1_home: row.h1_home !== null && row.h1_home !== undefined ? Number(row.h1_home) : null,
    h1_away: row.h1_away !== null && row.h1_away !== undefined ? Number(row.h1_away) : null,
    ot_periods: Number(row.ot_periods) || 0,
    q_scores: qScores,
    source: String(row.source || 'bb_games'),
    updated_at: row.updated_at || undefined,
  };
}

function createSeededLeagueState(league: BasketballLeague): LeagueBaselineState {
  const state = createLeagueState(league);
  const empirical = CALIBRATED_BASKETBALL_PARAMS.leagues?.[league]?.empiricalLeagueStats;
  if (empirical) {
    state.ewmaRegTeamMean = empirical.regTeamMean;
    state.ewmaHomeAdv = empirical.homeAdv;
    state.ewmaRegVarH = empirical.regVarH;
    state.ewmaRegVarA = empirical.regVarA;
    state.ewmaRegCovHA = empirical.regCovHA;
    state.ewmaH1Share = empirical.h1Share;
    state.ewmaH1CovHA = empirical.h1CovHA;
  }
  return state;
}

function buildFixtureFromEvaluation(
  game: StoredBbGame,
  ev: BasketballGameEvaluation,
  homeTeam: BbTeamRow | undefined,
  awayTeam: BbTeamRow | undefined,
  quotes: BbOddsQuote[]
): Fixture {
  const comp = BASKETBALL_COMPETITIONS[game.league];
  const uiHome = toUiTeam(homeTeam, game.home_id, comp.id);
  const uiAway = toUiTeam(awayTeam, game.away_id, comp.id);
  const proj = ev.projection;
  const gameTotalQuote = quotes.find((q) => q.market_category === 'game_total');
  const gameTotalPick = ev.picks.find((p) => p.marketCategory === 'game_total');

  const kickoffTime = game.kickoff_utc || `${game.game_date}T19:00:00Z`;
  const projectedMargin = Math.round(Math.abs(proj.homeMean - proj.awayMean) * 10) / 10;

  return {
    id: game.id,
    providerId: game.id,
    providerName: comp.freeFixturesProvider || game.source,
    fetchTime: game.updated_at || kickoffTime,
    source: game.source,
    competitionId: comp.id,
    competition: {
      ...comp,
      name: cleanDisplayText(comp.name),
    },
    seasonYear: game.season,
    sport: 'basketball',
    homeTeam: uiHome,
    awayTeam: uiAway,
    kickoffTime,
    matchday: 1,
    status: game.status as MatchStatus,
    homeScore: game.home_pts,
    awayScore: game.away_pts,
    homeHalfTimeScore: game.h1_home,
    awayHalfTimeScore: game.h1_away,
    venue: game.neutral ? 'Neutral Court' : `${uiHome.shortName} Home Court`,
    dataFreshness: game.updated_at || new Date().toISOString(),
    insufficientData: ev.needsHistory,
    hasRealTeamStrength: !ev.needsHistory,
    missingDataFlags: {
      halves: proj.needsH1History,
    },
    basketballStats: {
      league: game.league,
      neutral: game.neutral,
      needsHistory: ev.needsHistory,
      needsH1History: proj.needsH1History,
      abstentionReason: ev.abstentionReason,
      homeOffEff: Math.round((proj.homeAvgScored / Math.max(40, proj.leagueRegTeamMean)) * 1000) / 1000,
      homeDefEff: Math.round((proj.homeAvgAllowed / Math.max(40, proj.leagueRegTeamMean)) * 1000) / 1000,
      homePoss: Math.round((proj.leagueRegTeamMean + proj.homePaceDelta) * 10) / 10,
      awayOffEff: Math.round((proj.awayAvgScored / Math.max(40, proj.leagueRegTeamMean)) * 1000) / 1000,
      awayDefEff: Math.round((proj.awayAvgAllowed / Math.max(40, proj.leagueRegTeamMean)) * 1000) / 1000,
      awayPoss: Math.round((proj.leagueRegTeamMean + proj.awayPaceDelta) * 10) / 10,
      homeOff: Math.round(proj.homeAvgScored * 10) / 10,
      awayOff: Math.round(proj.awayAvgScored * 10) / 10,
      homeDef: Math.round(proj.homeAvgAllowed * 10) / 10,
      awayDef: Math.round(proj.awayAvgAllowed * 10) / 10,
      homeProjected: Math.round(proj.homeMean * 10) / 10,
      awayProjected: Math.round(proj.awayMean * 10) / 10,
      projectedTotal: Math.round(proj.gameTotalMean * 10) / 10,
      projectedMargin,
      projectedWinner: proj.homeMean >= proj.awayMean ? uiHome.name : uiAway.name,
      projectedTotalStd: Math.round(proj.gameTotalStd * 10) / 10,
      h1HomeProjected: Math.round(proj.h1HomeMean * 10) / 10,
      h1AwayProjected: Math.round(proj.h1AwayMean * 10) / 10,
      h1ProjectedTotal: Math.round(proj.h1TotalMean * 10) / 10,
      h1ProjectedTotalStd: Math.round(proj.h1TotalStd * 10) / 10,
      homeRestDays: proj.homeRestDays,
      awayRestDays: proj.awayRestDays,
      homeIsB2B: proj.homeIsB2B,
      awayIsB2B: proj.awayIsB2B,
      sportsbookTotal: gameTotalQuote ? Number(gameTotalQuote.line) : undefined,
      sportsbookTotalBookmaker: gameTotalQuote?.bookmaker,
      totalLean: gameTotalPick
        ? gameTotalPick.marketCode.endsWith('_OVER')
          ? 'OVER'
          : 'UNDER'
        : undefined,
    },
  };
}

/**
 * Loads prior + current season games from DB, warms per-league chronological models,
 * evaluates upcoming + recent window games, applies 40% slate diversity per day, and caches.
 */
export async function buildEvaluatedBasketballSlate(forceRefresh = false): Promise<EvaluatedBasketballSlate> {
  if (!forceRefresh) {
    const cached = await serverCache.get<EvaluatedBasketballSlate>(SLATE_CACHE_KEY);
    if (cached && Array.isArray(cached.fixtures)) {
      return cached;
    }
  }

  const emptyCounts: Record<BasketballLeague, { totalStored: number; windowCount: number }> = {
    NBA: { totalStored: 0, windowCount: 0 },
    NCAAB: { totalStored: 0, windowCount: 0 },
    EUROLEAGUE: { totalStored: 0, windowCount: 0 },
  };

  if (!isSupabaseConfigured || !supabase) {
    return {
      builtAt: new Date().toISOString(),
      fixtures: [],
      evaluationsById: {},
      gamesById: {},
      leagueCounts: emptyCounts,
    };
  }

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const windowStartIso = new Date(now.getTime() - 10 * 86_400_000).toISOString().slice(0, 10);
  const windowEndIso = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);

  // Warmup starts 14 months back (covers complete prior season + current season for accurate shrinkage/carryover)
  const warmupStartIso = new Date(Date.UTC(now.getUTCFullYear() - 1, 8, 1)).toISOString().slice(0, 10);

  const [{ data: teamRows }, { data: rawGames }] = await Promise.all([
    fetchAllRows<any>((from, to) =>
      supabase.from('bb_teams').select('id, league, name, aliases').order('id', { ascending: true }).range(from, to)
    ),
    fetchAllRows<any>((from, to) =>
      supabase
        .from('bb_games')
        .select('*')
        .gte('game_date', warmupStartIso)
        .lte('game_date', windowEndIso)
        .order('game_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

  const teamMap = new Map<string, BbTeamRow>();
  for (const r of teamRows || []) {
    const t = parseTeamRow(r);
    teamMap.set(t.id, t);
  }

  const allGames = (rawGames || []).map(parseGameRow);
  const states: Record<BasketballLeague, LeagueBaselineState> = {
    NBA: createSeededLeagueState('NBA'),
    NCAAB: createSeededLeagueState('NCAAB'),
    EUROLEAGUE: createSeededLeagueState('EUROLEAGUE'),
  };

  // Identify display window games
  let windowGames = allGames.filter(
    (g) =>
      (g.game_date >= windowStartIso && g.game_date <= windowEndIso) ||
      g.status === 'IN_PLAY' ||
      g.status === 'PAUSED'
  );

  // If offseason / quiet period leaves very few games in [-10d..+14d], include last 60 finished games
  if (windowGames.length < 6 && allGames.length > 0) {
    const recentFinished = allGames.filter((g) => g.status === 'FINISHED').slice(-60);
    const idSet = new Set(windowGames.map((g) => g.id));
    for (const rf of recentFinished) {
      if (!idSet.has(rf.id)) windowGames.push(rf);
    }
  }

  const windowIdSet = new Set(windowGames.map((g) => g.id));

  // Fetch stored bookmaker odds snapshots for display window games
  const oddsByGameId = new Map<string, BbOddsQuote[]>();
  const windowIds = Array.from(windowIdSet);
  for (const idChunk of chunkArray(windowIds, 200)) {
    const { data: oddsRows } = await supabase
      .from('bb_odds_snapshots')
      .select('*')
      .in('game_id', idChunk);
    for (const r of oddsRows || []) {
      const q: BbOddsQuote = {
        id: String(r.id),
        game_id: String(r.game_id),
        league: r.league as BasketballLeague,
        market_category: r.market_category,
        side: r.side || 'game',
        line: Number(r.line),
        over_odds: r.over_odds !== null && r.over_odds !== undefined ? Number(r.over_odds) : null,
        under_odds: r.under_odds !== null && r.under_odds !== undefined ? Number(r.under_odds) : null,
        bookmaker: String(r.bookmaker || 'Bookmaker'),
        observed_at: String(r.observed_at || ''),
      };
      const arr = oddsByGameId.get(q.game_id) || [];
      arr.push(q);
      oddsByGameId.set(q.game_id, arr);
    }
  }

  // Replay chronologically: project BEFORE updating state on FINISHED games (zero data leakage)
  const evalMap = new Map<string, BasketballGameEvaluation>();
  const gamesById: Record<string, StoredBbGame> = {};

  for (const g of allGames) {
    const state = states[g.league];
    if (!state) continue;

    if (windowIdSet.has(g.id)) {
      const proj = projectBasketballGame(state, g);
      const homeName = teamMap.get(g.home_id)?.name || g.home_id;
      const awayName = teamMap.get(g.away_id)?.name || g.away_id;
      const ev = evaluateBasketballGameMarkets({
        gameId: g.id,
        league: g.league,
        season: g.season,
        kickoffUtc: g.kickoff_utc,
        homeName,
        awayName,
        projection: proj,
        oddsSnapshots: oddsByGameId.get(g.id) || [],
      });
      evalMap.set(g.id, ev);
      gamesById[g.id] = g;
      if (g.status === 'FINISHED') {
        updateLeagueStateWithGame(state, g, proj);
      }
    } else if (g.status === 'FINISHED') {
      updateLeagueStateWithGame(state, g);
    }
  }

  // Apply 40% slate category diversity per date on SCHEDULED games
  const scheduledByDate = new Map<string, BasketballGameEvaluation[]>();
  for (const g of windowGames) {
    if (g.status !== 'SCHEDULED') continue;
    const ev = evalMap.get(g.id);
    if (!ev) continue;
    const arr = scheduledByDate.get(g.game_date) || [];
    arr.push(ev);
    scheduledByDate.set(g.game_date, arr);
  }
  for (const [, dayEvals] of scheduledByDate.entries()) {
    const diversified = selectDiversifiedBasketballSlatePicks(dayEvals, 0.40);
    for (const d of diversified) {
      evalMap.set(d.gameId, d);
    }
  }

  const fixtures: Fixture[] = [];
  const evaluationsById: Record<string, BasketballGameEvaluation> = {};

  for (const g of windowGames) {
    const ev = evalMap.get(g.id);
    if (!ev) continue;
    evaluationsById[g.id] = ev;
    emptyCounts[g.league].windowCount++;
    fixtures.push(
      buildFixtureFromEvaluation(
        g,
        ev,
        teamMap.get(g.home_id),
        teamMap.get(g.away_id),
        oddsByGameId.get(g.id) || []
      )
    );
  }

  // Sort: live/today upcoming first, then upcoming ascending, then finished descending
  fixtures.sort((a, b) => {
    const aLive = a.status === 'IN_PLAY' || a.status === 'PAUSED' ? 0 : 1;
    const bLive = b.status === 'IN_PLAY' || b.status === 'PAUSED' ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;

    const aFin = a.status === 'FINISHED' ? 1 : 0;
    const bFin = b.status === 'FINISHED' ? 1 : 0;
    if (aFin !== bFin) return aFin - bFin;

    const aMs = new Date(a.kickoffTime).getTime();
    const bMs = new Date(b.kickoffTime).getTime();
    return aFin === 1 ? bMs - aMs : aMs - bMs;
  });

  // Also fetch overall stored league totals via RPC for accurate competition counts
  try {
    const { data: rpcData } = await supabase.rpc('get_bb_data_status_aggregates');
    if (rpcData && Array.isArray(rpcData.leagueSummary)) {
      for (const r of rpcData.leagueSummary) {
        const lg = r.league as BasketballLeague;
        if (emptyCounts[lg]) {
          emptyCounts[lg].totalStored = Number(r.count) || 0;
        }
      }
    }
  } catch {
    // Non-fatal
  }

  const result: EvaluatedBasketballSlate = {
    builtAt: now.toISOString(),
    fixtures,
    evaluationsById,
    gamesById,
    leagueCounts: emptyCounts,
  };

  if (fixtures.length > 0 && todayIso) {
    await serverCache.set(SLATE_CACHE_KEY, result, SLATE_CACHE_TTL_SEC);
  }

  return result;
}

export async function bustBasketballSlateCache(): Promise<void> {
  await serverCache.bust(SLATE_CACHE_KEY);
}

function normalizeLeagueFilter(raw?: string): BasketballLeague | 'ALL' {
  if (!raw || raw === 'ALL') return 'ALL';
  const u = raw.trim().toUpperCase();
  if (u === 'NBA' || u === 'COMP_NBA') return 'NBA';
  if (u === 'NCAAB' || u === 'COMP_NCAAB') return 'NCAAB';
  if (u === 'EUROLEAGUE' || u === 'COMP_EUROLEAGUE') return 'EUROLEAGUE';
  return 'ALL';
}

export async function getBasketballFixturesAndEvaluations(options?: {
  league?: string;
  competitionId?: string;
  status?: string;
  day?: string;
}): Promise<{
  fixtures: Fixture[];
  evaluationsById: Record<string, BasketballGameEvaluation>;
  gamesById: Record<string, StoredBbGame>;
  lastUpdated: string;
  lastSyncTimestamp: string | null;
  liveDataAvailable: boolean;
  isDelayed: boolean;
  staleLimitMinutes: number;
  error?: string;
  failedProvider?: string;
  season: string;
}> {
  const slate = await buildEvaluatedBasketballSlate(false);
  const leagueFilter = normalizeLeagueFilter(options?.competitionId || options?.league);

  let filtered = slate.fixtures;

  if (leagueFilter !== 'ALL') {
    filtered = filtered.filter((f) => f.basketballStats?.league === leagueFilter || f.competition.code === leagueFilter);
  }

  if (options?.day && options.day !== 'ALL') {
    filtered = filtered.filter((f) => matchesDayFilter(f.kickoffTime, options.day!));
  }

  if (options?.status && options.status !== 'ALL') {
    const st = options.status.toUpperCase();
    if (st === 'FINISHED') {
      filtered = filtered.filter((f) => f.status === 'FINISHED');
    } else if (st === 'TIMED' || st === 'SCHEDULED') {
      filtered = filtered.filter((f) => f.status !== 'FINISHED' && f.status !== 'POSTPONED' && f.status !== 'CANCELED');
    } else {
      filtered = filtered.filter((f) => f.status === st);
    }
  }

  const evaluationsById: Record<string, BasketballGameEvaluation> = {};
  const gamesById: Record<string, StoredBbGame> = {};
  for (const f of filtered) {
    if (slate.evaluationsById[f.id]) evaluationsById[f.id] = slate.evaluationsById[f.id];
    if (slate.gamesById[f.id]) gamesById[f.id] = slate.gamesById[f.id];
  }

  const syncState = await getProviderSyncState('basketball');
  const newestTs = syncState?.lastSuccessAt || slate.builtAt;
  const ageMinutes = newestTs ? Math.max(0, Math.round((Date.now() - Date.parse(newestTs)) / 60000)) : null;
  const isDelayed =
    slate.fixtures.length === 0 ||
    (syncState?.lastSuccessAt !== null && ageMinutes !== null && ageMinutes > FIXTURE_STALE_LIMIT_MINUTES);

  return {
    fixtures: filtered,
    evaluationsById,
    gamesById,
    lastUpdated: formatUtcTimeStamp(newestTs),
    lastSyncTimestamp: newestTs,
    liveDataAvailable: slate.fixtures.length > 0,
    isDelayed,
    staleLimitMinutes: FIXTURE_STALE_LIMIT_MINUTES,
    error:
      isDelayed && (syncState?.status === 'ERROR' || slate.fixtures.length === 0)
        ? `Basketball data unavailable or stale beyond ${FIXTURE_STALE_LIMIT_MINUTES}m. Last updated ${formatUtcTimeStamp(newestTs)}.`
        : undefined,
    failedProvider: isDelayed && syncState?.status === 'ERROR' ? syncState.providerName : undefined,
    season: CURRENT_BASKETBALL_SEASON,
  };
}

export async function getBasketballFixtureByIdFromDb(gameId: string): Promise<{
  fixture: Fixture;
  evaluation: BasketballGameEvaluation;
  game: StoredBbGame;
} | null> {
  const slate = await buildEvaluatedBasketballSlate(false);
  const directFixture = slate.fixtures.find((f) => f.id === gameId);
  if (directFixture && slate.evaluationsById[gameId] && slate.gamesById[gameId]) {
    return {
      fixture: directFixture,
      evaluation: slate.evaluationsById[gameId],
      game: slate.gamesById[gameId],
    };
  }

  if (!isSupabaseConfigured || !supabase) return null;

  // Fallback for older historical game IDs outside the [-10d..+14d] window
  const { data: rows } = await supabase.from('bb_games').select('*').eq('id', gameId).limit(1);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const game = parseGameRow(rows[0]);

  const [{ data: teamRows }, { data: oddsRows }, { data: priorRawGames }] = await Promise.all([
    supabase.from('bb_teams').select('id, league, name, aliases').in('id', [game.home_id, game.away_id]),
    supabase.from('bb_odds_snapshots').select('*').eq('game_id', game.id),
    fetchAllRows<any>((from, to) =>
      supabase
        .from('bb_games')
        .select('*')
        .eq('league', game.league)
        .eq('status', 'FINISHED')
        .lt('game_date', game.game_date)
        .order('game_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

  const teamMap = new Map<string, BbTeamRow>();
  for (const r of teamRows || []) {
    const t = parseTeamRow(r);
    teamMap.set(t.id, t);
  }

  const state = createSeededLeagueState(game.league);
  for (const rg of priorRawGames || []) {
    updateLeagueStateWithGame(state, parseGameRow(rg));
  }

  const quotes: BbOddsQuote[] = (oddsRows || []).map((r: any) => ({
    id: String(r.id),
    game_id: String(r.game_id),
    league: r.league as BasketballLeague,
    market_category: r.market_category,
    side: r.side || 'game',
    line: Number(r.line),
    over_odds: r.over_odds !== null && r.over_odds !== undefined ? Number(r.over_odds) : null,
    under_odds: r.under_odds !== null && r.under_odds !== undefined ? Number(r.under_odds) : null,
    bookmaker: String(r.bookmaker || 'Bookmaker'),
    observed_at: String(r.observed_at || ''),
  }));

  const proj = projectBasketballGame(state, game);
  const homeTeam = teamMap.get(game.home_id);
  const awayTeam = teamMap.get(game.away_id);
  const evaluation = evaluateBasketballGameMarkets({
    gameId: game.id,
    league: game.league,
    season: game.season,
    kickoffUtc: game.kickoff_utc,
    homeName: homeTeam?.name || game.home_id,
    awayName: awayTeam?.name || game.away_id,
    projection: proj,
    oddsSnapshots: quotes,
  });

  return {
    fixture: buildFixtureFromEvaluation(game, evaluation, homeTeam, awayTeam, quotes),
    evaluation,
    game,
  };
}

export async function getBasketballCompetitionsSummary(day?: string) {
  const slate = await buildEvaluatedBasketballSlate(false);
  const list = (['NBA', 'NCAAB', 'EUROLEAGUE'] as BasketballLeague[]).map((league) => {
    const comp = BASKETBALL_COMPETITIONS[league];
    const windowFixtures = slate.fixtures.filter((f) => {
      if ((f.basketballStats?.league || f.competition.code) !== league) return false;
      if (day && day !== 'ALL') return matchesDayFilter(f.kickoffTime, day);
      return true;
    });
    return {
      ...comp,
      name: cleanDisplayText(comp.name),
      fixtureCount: windowFixtures.length,
      storedMatchCount: slate.leagueCounts[league]?.totalStored || windowFixtures.length,
      hasFreeFixturesSource: true,
      freeFixturesProvider: comp.freeFixturesProvider || 'Free Public API',
    };
  });

  return {
    competitions: list,
    groupedByCountry: [
      { country: 'Europe', competitions: list.filter((c) => c.country === 'Europe') },
      { country: 'USA', competitions: list.filter((c) => c.country === 'USA') },
    ].filter((g) => g.competitions.length > 0),
    total: list.length,
    totalFixtures: list.reduce((s, c) => s + c.fixtureCount, 0),
  };
}
