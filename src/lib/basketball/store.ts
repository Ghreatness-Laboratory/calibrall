// CALIBRALL: Basketball Persistence Store & Data Status Reporting
// Strictly enforces:
// 1. Teams rows (bb_teams) are always upserted BEFORE games (bb_games) so FKs cannot fail
// 2. Paginated reads (fetchAllRows, page size 1,000) & RPC aggregates (get_bb_data_status_aggregates)
// 3. Unresolved team names are logged in unresolved_teams with 'bb:' provider prefix, never guessed
// 4. Production writes fail loudly if Supabase Postgres is unconfigured or errors

import {
  supabase,
  isSupabaseConfigured,
  isProductionRuntime,
  persistenceBackendInfo,
  assertPersistenceConfigured,
} from '@/lib/supabase/client';
import { fetchAllRows, chunkArray } from '@/lib/supabase/pagination';
import {
  BasketballLeague,
  BASKETBALL_LEAGUE_SEASONS,
} from './markets';
import { CanonicalBasketballTeam } from './canonicalTeams';

export type BasketballGameStatus =
  | 'SCHEDULED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'FINISHED'
  | 'POSTPONED'
  | 'CANCELED';

export interface StoredBbQuarterScores {
  h: number[];
  a: number[];
}

export interface StoredBbGame {
  id: string;
  league: BasketballLeague;
  season: string;
  game_date: string; // YYYY-MM-DD
  kickoff_utc: string | null;
  home_id: string;
  away_id: string;
  neutral: boolean;
  status: BasketballGameStatus;
  home_pts: number | null;
  away_pts: number | null;
  h1_home: number | null;
  h1_away: number | null;
  ot_periods: number;
  q_scores: StoredBbQuarterScores | null;
  source: string;
  updated_at?: string;
}

export interface BasketballUnresolvedEntry {
  sourceName: string;
  sourceProvider: string; // e.g. 'bb:hoopr_nba', 'bb:hoopr_ncaab', 'bb:espn_nba', 'bb:euroleague'
  count: number;
  firstSeen?: string;
  lastSeen?: string;
}

export interface BasketballLeagueSeasonStats {
  league: BasketballLeague;
  season: string;
  count: number;
  finishedCount: number;
  withHalfScoresCount: number;
  halfScoresPct: number;
  earliestDate: string | null;
  latestDate: string | null;
}

export interface BasketballLeagueSummary {
  league: BasketballLeague;
  count: number;
  finishedCount: number;
  withHalfScoresCount: number;
  halfScoresPct: number;
  earliestDate: string | null;
  latestDate: string | null;
  daysAgo: number | null;
}

export interface BasketballDataStatusReport {
  totalGames: number;
  totalTeams: number;
  earliestDate: string | null;
  latestDate: string | null;
  gamesPerLeagueAndSeason: BasketballLeagueSeasonStats[];
  leagueSummary: BasketballLeagueSummary[];
  unresolvedTeamsCount: number;
  unresolvedTeams: BasketballUnresolvedEntry[];
  aggregationMethod: 'rpc' | 'paginated';
  storeUsed: 'supabase' | 'local-sqlite';
}

export interface UpsertBasketballResult {
  fetched: number;
  inserted: number;
  teamsUpserted: number;
  errors: string[];
}

function makeUnresolvedId(sourceProvider: string, sourceName: string): string {
  const cleanProv = sourceProvider.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const cleanName = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  return `bb_unres:${cleanProv}:${cleanName || 'unknown'}`;
}

function computeDaysAgo(latestDate: string | null): number | null {
  if (!latestDate) return null;
  const ms = Date.parse(`${latestDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  const diff = Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : 0;
}

/**
 * Deduplicate games by ID within a batch, preferring entries that have half-scores or FINISHED status.
 */
function deduplicateGames(games: StoredBbGame[]): StoredBbGame[] {
  const byId = new Map<string, StoredBbGame>();
  for (const g of games) {
    const prev = byId.get(g.id);
    if (!prev) {
      byId.set(g.id, g);
      continue;
    }
    const prevHasHalf = prev.h1_home !== null && prev.h1_away !== null;
    const nextHasHalf = g.h1_home !== null && g.h1_away !== null;
    if (nextHasHalf && !prevHasHalf) {
      byId.set(g.id, g);
    } else if (g.status === 'FINISHED' && prev.status !== 'FINISHED') {
      byId.set(g.id, g);
    } else if (nextHasHalf === prevHasHalf) {
      byId.set(g.id, g);
    }
  }
  return Array.from(byId.values());
}

export async function upsertBasketballData(
  teams: CanonicalBasketballTeam[],
  games: StoredBbGame[],
  unresolvedEntries: BasketballUnresolvedEntry[] = [],
  dryRun: boolean = false
): Promise<UpsertBasketballResult> {
  const uniqueGames = deduplicateGames(games);
  const uniqueTeamsMap = new Map<string, CanonicalBasketballTeam>();
  for (const t of teams) {
    uniqueTeamsMap.set(t.id, t);
  }
  const uniqueTeams = Array.from(uniqueTeamsMap.values());

  if (dryRun) {
    return {
      fetched: uniqueGames.length,
      inserted: uniqueGames.length,
      teamsUpserted: uniqueTeams.length,
      errors: [],
    };
  }

  assertPersistenceConfigured();
  if (!isSupabaseConfigured || !supabase) {
    return {
      fetched: uniqueGames.length,
      inserted: 0,
      teamsUpserted: 0,
      errors: [persistenceBackendInfo().message],
    };
  }

  const errors: string[] = [];
  const nowIso = new Date().toISOString();

  // 1. Upsert canonical bb_teams first so bb_games foreign keys cannot fail
  const teamPayloads = uniqueTeams.map((t) => ({
    id: t.id,
    league: t.league,
    name: t.name,
    aliases: t.aliases,
    provider_ids: t.provider_ids,
    updated_at: nowIso,
  }));

  for (const chunk of chunkArray(teamPayloads, 200)) {
    const { error } = await supabase
      .from('bb_teams')
      .upsert(chunk, { onConflict: 'id' });
    if (error) {
      errors.push(`bb_teams upsert failed: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    return {
      fetched: uniqueGames.length,
      inserted: 0,
      teamsUpserted: 0,
      errors,
    };
  }

  // 2. Upsert bb_games in chunks of 250
  let inserted = 0;
  const gamePayloads = uniqueGames.map((g) => ({
    id: g.id,
    league: g.league,
    season: g.season,
    game_date: g.game_date,
    kickoff_utc: g.kickoff_utc,
    home_id: g.home_id,
    away_id: g.away_id,
    neutral: g.neutral,
    status: g.status,
    home_pts: g.home_pts,
    away_pts: g.away_pts,
    h1_home: g.h1_home,
    h1_away: g.h1_away,
    ot_periods: g.ot_periods,
    q_scores: g.q_scores,
    source: g.source,
    updated_at: g.updated_at || nowIso,
  }));

  for (const chunk of chunkArray(gamePayloads, 250)) {
    const { error } = await supabase
      .from('bb_games')
      .upsert(chunk, { onConflict: 'id' });
    if (error) {
      errors.push(`bb_games upsert failed: ${error.message}`);
    } else {
      inserted += chunk.length;
    }
  }

  // 3. Log any unresolved team names cleanly (never guessed)
  if (unresolvedEntries.length > 0) {
    const unresPayloads = unresolvedEntries.map((u) => ({
      id: makeUnresolvedId(u.sourceProvider, u.sourceName),
      source_name: u.sourceName,
      source_provider: u.sourceProvider,
      count: Math.max(1, u.count || 1),
      first_seen: u.firstSeen || nowIso,
      last_seen: u.lastSeen || nowIso,
      resolved: 0,
    }));

    for (const chunk of chunkArray(unresPayloads, 100)) {
      const { error } = await supabase
        .from('unresolved_teams')
        .upsert(chunk, { onConflict: 'source_name,source_provider' });
      if (error) {
        errors.push(`unresolved_teams log failed: ${error.message}`);
      }
    }
  }

  return {
    fetched: uniqueGames.length,
    inserted,
    teamsUpserted: teamPayloads.length,
    errors,
  };
}

/**
 * Returns unique YYYY-MM-DD game_dates where FINISHED games exist in bb_games without half-scores.
 * Uses paginated reads (1,000 rows per page).
 */
export async function getGameDatesMissingHalfScores(
  league: BasketballLeague,
  season: string
): Promise<{ dates: string[]; totalGamesMissing: number }> {
  if (!isSupabaseConfigured || !supabase) {
    return { dates: [], totalGamesMissing: 0 };
  }

  const { data, error } = await fetchAllRows<{
    id: string;
    game_date: string;
    h1_home: number | null;
    h1_away: number | null;
  }>((from, to) =>
    supabase
      .from('bb_games')
      .select('id, game_date, h1_home, h1_away')
      .eq('league', league)
      .eq('season', season)
      .eq('status', 'FINISHED')
      .order('id', { ascending: true })
      .range(from, to)
  );

  if (error) {
    throw new Error(`Failed reading bb_games missing half-scores: ${error.message}`);
  }

  const dateSet = new Set<string>();
  let totalGamesMissing = 0;
  for (const row of data) {
    if (row.h1_home === null || row.h1_home === undefined || row.h1_away === null || row.h1_away === undefined) {
      totalGamesMissing++;
      if (row.game_date) {
        dateSet.add(String(row.game_date).slice(0, 10));
      }
    }
  }

  return {
    dates: Array.from(dateSet).sort(),
    totalGamesMissing,
  };
}

/**
 * Returns basketball storage & coverage status using RPC aggregates (with paginated fallback).
 */
export async function getBasketballDataStatus(): Promise<BasketballDataStatusReport> {
  const backend = persistenceBackendInfo();
  const storeUsed: 'supabase' | 'local-sqlite' = backend.isRemoteSupabase ? 'supabase' : 'local-sqlite';

  if (isProductionRuntime() && !backend.isRemoteSupabase) {
    throw new Error(backend.message);
  }

  // 1. Fetch basketball unresolved teams via paginated read (filtered to bb: prefix)
  let unresolvedTeams: BasketballUnresolvedEntry[] = [];
  if (isSupabaseConfigured && supabase) {
    const { data: unresRows } = await fetchAllRows<any>((from, to) =>
      supabase
        .from('unresolved_teams')
        .select('id, source_name, source_provider, count, first_seen, last_seen')
        .eq('resolved', 0)
        .order('id', { ascending: true })
        .range(from, to)
    );
    unresolvedTeams = (unresRows || [])
      .filter((r) => String(r.source_provider || '').startsWith('bb:'))
      .map((r) => ({
        sourceName: String(r.source_name),
        sourceProvider: String(r.source_provider),
        count: Number(r.count) || 1,
        firstSeen: r.first_seen,
        lastSeen: r.last_seen,
      }))
      .sort((a, b) => b.count - a.count || a.sourceName.localeCompare(b.sourceName));
  }

  // 2. Prefer RPC aggregate get_bb_data_status_aggregates()
  if (isSupabaseConfigured && supabase) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_bb_data_status_aggregates');
    if (!rpcError && rpcData) {
      const payload = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
      const gamesPerLeagueAndSeason: BasketballLeagueSeasonStats[] = Array.isArray(payload.gamesPerLeagueAndSeason)
        ? payload.gamesPerLeagueAndSeason.map((r: any) => ({
            league: r.league as BasketballLeague,
            season: String(r.season),
            count: Number(r.count) || 0,
            finishedCount: Number(r.finishedCount) || 0,
            withHalfScoresCount: Number(r.withHalfScoresCount) || 0,
            halfScoresPct: Number(r.halfScoresPct) || 0,
            earliestDate: r.earliestDate || null,
            latestDate: r.latestDate || null,
          }))
        : [];

      const byLeagueMap = new Map<BasketballLeague, BasketballLeagueSummary>();
      for (const l of ['NBA', 'NCAAB', 'EUROLEAGUE'] as BasketballLeague[]) {
        byLeagueMap.set(l, {
          league: l,
          count: 0,
          finishedCount: 0,
          withHalfScoresCount: 0,
          halfScoresPct: 0,
          earliestDate: null,
          latestDate: null,
          daysAgo: null,
        });
      }
      if (Array.isArray(payload.leagueSummary)) {
        for (const r of payload.leagueSummary) {
          const lg = r.league as BasketballLeague;
          const latest = r.latestDate || null;
          byLeagueMap.set(lg, {
            league: lg,
            count: Number(r.count) || 0,
            finishedCount: Number(r.finishedCount) || 0,
            withHalfScoresCount: Number(r.withHalfScoresCount) || 0,
            halfScoresPct: Number(r.halfScoresPct) || 0,
            earliestDate: r.earliestDate || null,
            latestDate: latest,
            daysAgo: computeDaysAgo(latest),
          });
        }
      }

      return {
        totalGames: Number(payload.totalGames) || 0,
        totalTeams: Number(payload.totalTeams) || 0,
        earliestDate: payload.earliestDate || null,
        latestDate: payload.latestDate || null,
        gamesPerLeagueAndSeason,
        leagueSummary: Array.from(byLeagueMap.values()),
        unresolvedTeamsCount: unresolvedTeams.length,
        unresolvedTeams,
        aggregationMethod: 'rpc',
        storeUsed,
      };
    }

    // 3. Paginated fallback if RPC is not deployed yet
    const [{ data: gamesRows, error: gamesErr }, { count: teamsCount }] = await Promise.all([
      fetchAllRows<{
        id: string;
        league: BasketballLeague;
        season: string;
        game_date: string;
        status: string;
        h1_home: number | null;
        h1_away: number | null;
      }>((from, to) =>
        supabase
          .from('bb_games')
          .select('id, league, season, game_date, status, h1_home, h1_away')
          .order('id', { ascending: true })
          .range(from, to)
      ),
      supabase.from('bb_teams').select('id', { count: 'exact', head: true }),
    ]);

    if (gamesErr) {
      // If table does not exist yet in Postgres before migration is applied, report cleanly
      const msg = gamesErr.message || '';
      if (msg.includes('bb_games') && (msg.includes('does not exist') || msg.includes('schema cache'))) {
        return {
          totalGames: 0,
          totalTeams: 0,
          earliestDate: null,
          latestDate: null,
          gamesPerLeagueAndSeason: [],
          leagueSummary: (['NBA', 'NCAAB', 'EUROLEAGUE'] as BasketballLeague[]).map((league) => ({
            league,
            count: 0,
            finishedCount: 0,
            withHalfScoresCount: 0,
            halfScoresPct: 0,
            earliestDate: null,
            latestDate: null,
            daysAgo: null,
          })),
          unresolvedTeamsCount: unresolvedTeams.length,
          unresolvedTeams,
          aggregationMethod: 'paginated',
          storeUsed,
        };
      }
      throw new Error(`Failed loading basketball status: ${msg}`);
    }

    const lsMap = new Map<
      string,
      {
        league: BasketballLeague;
        season: string;
        count: number;
        finishedCount: number;
        withHalfScoresCount: number;
        earliestDate: string | null;
        latestDate: string | null;
      }
    >();
    const lMap = new Map<
      BasketballLeague,
      {
        league: BasketballLeague;
        count: number;
        finishedCount: number;
        withHalfScoresCount: number;
        earliestDate: string | null;
        latestDate: string | null;
      }
    >();

    for (const lg of ['NBA', 'NCAAB', 'EUROLEAGUE'] as BasketballLeague[]) {
      lMap.set(lg, {
        league: lg,
        count: 0,
        finishedCount: 0,
        withHalfScoresCount: 0,
        earliestDate: null,
        latestDate: null,
      });
    }

    let earliestDate: string | null = null;
    let latestFinishedDate: string | null = null;
    let latestAnyDate: string | null = null;

    for (const r of gamesRows) {
      const d = r.game_date ? String(r.game_date).slice(0, 10) : null;
      const isFin = r.status === 'FINISHED';
      if (d) {
        if (!earliestDate || d < earliestDate) earliestDate = d;
        if (!latestAnyDate || d > latestAnyDate) latestAnyDate = d;
        if (isFin && (!latestFinishedDate || d > latestFinishedDate)) latestFinishedDate = d;
      }
      const hasHalf = r.h1_home !== null && r.h1_home !== undefined && r.h1_away !== null && r.h1_away !== undefined;

      const lsKey = `${r.league}:${r.season}`;
      const ls = lsMap.get(lsKey) || {
        league: r.league,
        season: r.season,
        count: 0,
        finishedCount: 0,
        withHalfScoresCount: 0,
        earliestDate: null,
        latestDate: null,
      };
      ls.count++;
      if (isFin) ls.finishedCount++;
      if (hasHalf) ls.withHalfScoresCount++;
      if (d) {
        if (!ls.earliestDate || d < ls.earliestDate) ls.earliestDate = d;
        if (isFin && (!ls.latestDate || d > ls.latestDate)) ls.latestDate = d;
      }
      lsMap.set(lsKey, ls);

      const lb = lMap.get(r.league)!;
      lb.count++;
      if (isFin) lb.finishedCount++;
      if (hasHalf) lb.withHalfScoresCount++;
      if (d) {
        if (!lb.earliestDate || d < lb.earliestDate) lb.earliestDate = d;
        if (isFin && (!lb.latestDate || d > lb.latestDate)) lb.latestDate = d;
      }
    }
    const latestDate = latestFinishedDate || latestAnyDate;

    const gamesPerLeagueAndSeason: BasketballLeagueSeasonStats[] = Array.from(lsMap.values())
      .map((r) => ({
        ...r,
        halfScoresPct: r.count > 0 ? Math.round((r.withHalfScoresCount * 1000) / r.count) / 10 : 0,
      }))
      .sort((a, b) => a.league.localeCompare(b.league) || b.season.localeCompare(a.season));

    const leagueSummary: BasketballLeagueSummary[] = Array.from(lMap.values()).map((r) => ({
      ...r,
      halfScoresPct: r.count > 0 ? Math.round((r.withHalfScoresCount * 1000) / r.count) / 10 : 0,
      daysAgo: computeDaysAgo(r.latestDate),
    }));

    return {
      totalGames: gamesRows.length,
      totalTeams: Number(teamsCount) || 0,
      earliestDate,
      latestDate,
      gamesPerLeagueAndSeason,
      leagueSummary,
      unresolvedTeamsCount: unresolvedTeams.length,
      unresolvedTeams,
      aggregationMethod: 'paginated',
      storeUsed,
    };
  }

  return {
    totalGames: 0,
    totalTeams: 0,
    earliestDate: null,
    latestDate: null,
    gamesPerLeagueAndSeason: [],
    leagueSummary: (['NBA', 'NCAAB', 'EUROLEAGUE'] as BasketballLeague[]).map((league) => ({
      league,
      count: 0,
      finishedCount: 0,
      withHalfScoresCount: 0,
      halfScoresPct: 0,
      earliestDate: null,
      latestDate: null,
      daysAgo: null,
    })),
    unresolvedTeamsCount: 0,
    unresolvedTeams: [],
    aggregationMethod: 'paginated',
    storeUsed,
  };
}

export function getExpectedBasketballSeasons(): Record<BasketballLeague, string[]> {
  return BASKETBALL_LEAGUE_SEASONS;
}
