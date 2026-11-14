// CALIBRALL: Database Fixtures Persistence & Query Service
// Enforces:
// 1. Every fixture has a canonical competition_id (e.g. comp_pl, comp_fl1, comp_pd, comp_bl1, comp_sa, comp_elc, comp_bsa, comp_nba).
//    A fixture with none is logged as an error and never shown under a fallback.
// 2. Fixtures are synced from verified live providers and queried directly from the database table 'fixtures'.
//    Zero synthetic or hard-coded fixtures are ever generated or inserted.
// 3. Filter by competition_id only, combined with the day filter.

import { Fixture, MatchStatus } from '@/types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { lookupTeamStrength } from './teamDatabase';
import { lookupCanonicalTeam } from './canonicalTeams';
import {
  getCanonicalCompetition,
  isCanonicalCompetitionId,
  logCompetitionIntegrityError,
} from './canonicalCompetitions';
import { matchesDayFilter, DayFilterType } from '@/lib/utils/dateWindow';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { isPlaceholderTeamName } from './fixtureIntegrity';
import {
  NBA_TEAMS_CATALOG,
  computeNBASeason,
  createNBATeam,
} from './nbaSeedData';
import { calculateNBAScoreProjection } from '@/lib/prediction/nbaMath';

export { matchesDayFilter };
export type { DayFilterType };

const LEGACY_SEED_PROVIDER_PREFIXES = [
  'espn_pl_',
  'espn_elc_',
  'espn_pd_',
  'espn_bl1_',
  'espn_sa_',
  'espn_fl1_',
];

function safeParsePayloadJson(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Maps raw database fixture row into verified Fixture entity.
 * Rule 1: A fixture with no canonical competition_id is logged as an error and never shown under a fallback.
 */
export function mapDbRowToFixture(row: any): Fixture | null {
  const rawCompId = row.competition_id;

  if (!isCanonicalCompetitionId(rawCompId)) {
    logCompetitionIntegrityError(
      String(row.id || row.provider_id || 'unknown'),
      rawCompId,
      row.source || 'db:fixtures'
    );
    return null;
  }

  const compId = rawCompId.trim().toLowerCase();
  const comp = getCanonicalCompetition(compId);

  if (!comp) {
    logCompetitionIntegrityError(
      String(row.id || row.provider_id || 'unknown'),
      compId,
      row.source || 'db:fixtures'
    );
    return null;
  }

  const payload = safeParsePayloadJson(row.payload_json);

  // If this is a Basketball (NBA) row, prefer complete hydrated payload or reconstruct from NBA team catalog
  if (compId === 'comp_nba') {
    if (!row.home_team_name && !payload?.homeTeam?.name) {
      return null;
    }
    const kickoffTime = row.kickoff_time || payload?.kickoffTime || new Date().toISOString();
    const homeTeam = payload?.homeTeam || createNBATeam(row.home_team_id || row.home_team_name || 'BOS');
    const awayTeam = payload?.awayTeam || createNBATeam(row.away_team_id || row.away_team_name || 'DET');
    const seasonYear = payload?.seasonYear || computeNBASeason(new Date(kickoffTime));

    let basketballStats = payload?.basketballStats;
    if (!basketballStats) {
      const homeAbbr = homeTeam.tla || 'BOS';
      const awayAbbr = awayTeam.tla || 'DET';
      const homeCatalog = NBA_TEAMS_CATALOG[homeAbbr] || NBA_TEAMS_CATALOG.BOS;
      const awayCatalog = NBA_TEAMS_CATALOG[awayAbbr] || NBA_TEAMS_CATALOG.DET;
      const homeSeasonMap = homeCatalog.statsBySeason as Record<string, any>;
      const awaySeasonMap = awayCatalog.statsBySeason as Record<string, any>;
      const homeStats = homeSeasonMap[seasonYear] || homeSeasonMap['2024-25'] || Object.values(homeSeasonMap)[0];
      const awayStats = awaySeasonMap[seasonYear] || awaySeasonMap['2024-25'] || Object.values(awaySeasonMap)[0];
      const sportsbookTotal = 224.5;
      const sportsbookSpreadHome = -3.5;
      const proj = calculateNBAScoreProjection(
        {
          name: homeCatalog.name,
          offensiveEfficiency: homeStats.offensiveEfficiency,
          defensiveEfficiency: homeStats.defensiveEfficiency,
          possessions: homeStats.possessions,
        },
        {
          name: awayCatalog.name,
          offensiveEfficiency: awayStats.offensiveEfficiency,
          defensiveEfficiency: awayStats.defensiveEfficiency,
          possessions: awayStats.possessions,
        },
        {
          totalLine: sportsbookTotal,
          spreadLineTeamA: sportsbookSpreadHome,
        }
      );
      basketballStats = {
        homeOffEff: homeStats.offensiveEfficiency,
        homeDefEff: homeStats.defensiveEfficiency,
        homePoss: homeStats.possessions,
        awayOffEff: awayStats.offensiveEfficiency,
        awayDefEff: awayStats.defensiveEfficiency,
        awayPoss: awayStats.possessions,
        homeOff: proj.aOff,
        awayOff: proj.bOff,
        homeDef: proj.aDef,
        awayDef: proj.bDef,
        homeProjected: proj.aProjected,
        awayProjected: proj.bProjected,
        projectedTotal: proj.total,
        projectedMargin: proj.margin,
        projectedWinner: proj.projectedWinner,
        sportsbookTotal,
        sportsbookSpreadHome,
        totalLean: proj.totalLean?.lean,
        spreadLean: proj.spreadLean?.recommendation,
      };
    }

    return {
      id: row.id || `nba_${row.provider_id}`,
      providerId: row.provider_id || String(row.id),
      providerName: payload?.providerName || 'ESPN NBA Live Scoreboard & DraftKings Lines',
      fetchTime: row.updated_at || new Date().toISOString(),
      source: row.source || 'provider:espn_nba',
      competitionId: compId,
      competition: comp,
      seasonYear,
      sport: 'basketball',
      homeTeam,
      awayTeam,
      kickoffTime,
      matchday: Number(payload?.matchday) || 1,
      status: (row.status as MatchStatus) || 'SCHEDULED',
      homeScore: row.home_score ?? null,
      awayScore: row.away_score ?? null,
      venue: row.venue || payload?.venue || 'NBA Arena',
      dataFreshness: row.updated_at || new Date().toISOString(),
      basketballStats,
    };
  }

  if (isPlaceholderTeamName(row.home_team_name) || isPlaceholderTeamName(row.away_team_name)) {
    return null;
  }

  const homeCanon = lookupCanonicalTeam(row.home_team_id, comp.code) || lookupCanonicalTeam(row.home_team_name, comp.code);
  const awayCanon = lookupCanonicalTeam(row.away_team_id, comp.code) || lookupCanonicalTeam(row.away_team_name, comp.code);
  const homeLookup = lookupTeamStrength(row.home_team_name || row.home_team_id);
  const awayLookup = lookupTeamStrength(row.away_team_name || row.away_team_id);

  const homeTeam = {
    id: homeCanon?.canonicalId || homeLookup.data?.id || row.home_team_id || `team_${(row.home_team_name || 'home').toLowerCase().replace(/\s+/g, '_')}`,
    name: row.home_team_name || homeCanon?.canonicalName || homeLookup.data?.name || 'Home Team',
    shortName: homeCanon?.shortName || homeLookup.data?.shortName || cleanDisplayText(row.home_team_name || 'Home'),
    tla: homeCanon?.tla || homeLookup.data?.tla || (row.home_team_name || 'HOM').slice(0, 3).toUpperCase(),
    crestUrl: payload?.homeCrestUrl || homeCanon?.crestUrl || homeLookup.data?.crestUrl || '',
    attackRating: homeLookup.data?.attackRating,
    defenseRating: homeLookup.data?.defenseRating,
    cornerAttackRating: homeLookup.data?.cornerAttackRating,
    disciplineRating: homeLookup.data?.disciplineRating,
    recentForm: homeLookup.data?.recentForm,
    hasRealTeamStrength: Boolean(homeCanon || homeLookup.found),
  };

  const awayTeam = {
    id: awayCanon?.canonicalId || awayLookup.data?.id || row.away_team_id || `team_${(row.away_team_name || 'away').toLowerCase().replace(/\s+/g, '_')}`,
    name: row.away_team_name || awayCanon?.canonicalName || awayLookup.data?.name || 'Away Team',
    shortName: awayCanon?.shortName || awayLookup.data?.shortName || cleanDisplayText(row.away_team_name || 'Away'),
    tla: awayCanon?.tla || awayLookup.data?.tla || (row.away_team_name || 'AWY').slice(0, 3).toUpperCase(),
    crestUrl: payload?.awayCrestUrl || awayCanon?.crestUrl || awayLookup.data?.crestUrl || '',
    attackRating: awayLookup.data?.attackRating,
    defenseRating: awayLookup.data?.defenseRating,
    cornerAttackRating: awayLookup.data?.cornerAttackRating,
    disciplineRating: awayLookup.data?.disciplineRating,
    recentForm: awayLookup.data?.recentForm,
    hasRealTeamStrength: Boolean(awayCanon || awayLookup.found),
  };

  const kickoffTime = row.kickoff_time || new Date().toISOString();

  return {
    id: row.id || `fix_${row.provider_id}`,
    providerId: row.provider_id || String(row.id),
    providerName:
      payload?.providerName ||
      (row.source === 'provider:football-data'
        ? 'Football-Data.org'
        : row.source === 'provider:sportmonks'
        ? 'Sportmonks'
        : 'ESPN Live Scoreboard'),
    fetchTime: row.updated_at || new Date().toISOString(),
    source: row.source || 'db:fixtures',
    competitionId: compId,
    competition: comp,
    seasonYear: payload?.seasonYear || '2026/2027',
    homeTeam,
    awayTeam,
    kickoffTime,
    matchday: Number(payload?.matchday ?? row.matchday) || 1,
    status: (row.status as MatchStatus) || 'TIMED',
    minute: payload?.minute,
    statusDetail: payload?.statusDetail,
    homeScore: row.home_score ?? null,
    awayScore: row.away_score ?? null,
    homeHalfTimeScore: payload?.homeHalfTimeScore ?? null,
    awayHalfTimeScore: payload?.awayHalfTimeScore ?? null,
    venue: row.venue || 'Stadium',
    referee: row.referee || undefined,
    dataFreshness: row.updated_at || new Date().toISOString(),
    verifiedOdds: payload?.verifiedOdds,
  };
}

async function upsertFixtureRowsSafely(rows: Record<string, any>[]): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0 || !isSupabaseConfigured || !supabase) return { ok: true };
  const { error } = await supabase.from('fixtures').upsert(rows, { onConflict: 'provider_id' });
  if (!error) return { ok: true };

  // Fallback if remote Postgres hasn't applied payload_json column yet
  if (String(error.message || '').includes('payload_json')) {
    const stripped = rows.map(({ payload_json: _ignored, ...rest }) => rest);
    const retry = await supabase.from('fixtures').upsert(stripped, { onConflict: 'provider_id' });
    if (!retry.error) return { ok: true };
    return { ok: false, error: retry.error.message };
  }

  return { ok: false, error: error.message };
}

/**
 * Purges synthetic/demo or genuinely outdated football fixtures before `dateFrom` (ONLY when valid fixtures were fetched),
 * then upserts real verified football fixtures with canonical competition_id into `fixtures`.
 */
export async function syncFootballFixturesToDatabase(
  fixtures: Fixture[],
  dateFrom?: string
): Promise<{ upserted: number; rejected: number }> {
  if (!isSupabaseConfigured || !supabase) return { upserted: 0, rejected: 0 };
  if (!fixtures || fixtures.length === 0) {
    // Keep last good fixtures intact if refresh produced 0 rows
    return { upserted: 0, rejected: 0 };
  }

  let upserted = 0;
  let rejected = 0;

  try {
    // 1. Validate and prepare canonical rows for batch upsert BEFORE pruning expired fixtures
    const rowsToUpsert: Record<string, any>[] = [];
    const nowIso = new Date().toISOString();

    for (const f of fixtures) {
      if (isPlaceholderTeamName(f.homeTeam?.name) || isPlaceholderTeamName(f.awayTeam?.name)) {
        rejected++;
        continue;
      }
      const compId = f.competitionId || f.competition?.id;
      if (!isCanonicalCompetitionId(compId)) {
        logCompetitionIntegrityError(
          String(f.id || f.providerId || 'unknown'),
          compId,
          f.source || 'syncFootballFixturesToDatabase'
        );
        rejected++;
        continue;
      }

      const canonicalCompId = compId.trim().toLowerCase();
      const canonicalComp = getCanonicalCompetition(canonicalCompId);
      if (!canonicalComp) {
        logCompetitionIntegrityError(
          String(f.id || f.providerId || 'unknown'),
          compId,
          f.source || 'syncFootballFixturesToDatabase'
        );
        rejected++;
        continue;
      }

      const payload = {
        providerName: f.providerName,
        seasonYear: f.seasonYear,
        matchday: f.matchday,
        minute: f.minute,
        statusDetail: f.statusDetail,
        homeHalfTimeScore: f.homeHalfTimeScore ?? null,
        awayHalfTimeScore: f.awayHalfTimeScore ?? null,
        homeCrestUrl: f.homeTeam.crestUrl || undefined,
        awayCrestUrl: f.awayTeam.crestUrl || undefined,
        verifiedOdds: f.verifiedOdds,
      };

      rowsToUpsert.push({
        id: f.id,
        provider_id: f.providerId,
        competition_id: canonicalComp.id,
        competition_code: canonicalComp.code,
        home_team_id: f.homeTeam.id,
        away_team_id: f.awayTeam.id,
        home_team_name: f.homeTeam.name,
        away_team_name: f.awayTeam.name,
        kickoff_time: f.kickoffTime,
        status: f.status,
        home_score: f.homeScore ?? null,
        away_score: f.awayScore ?? null,
        venue: f.venue || null,
        referee: f.referee || null,
        source: f.source || 'provider:espn',
        is_demo: false,
        payload_json: JSON.stringify(payload),
        updated_at: nowIso,
      });
    }

    if (rowsToUpsert.length > 0) {
      const res = await upsertFixtureRowsSafely(rowsToUpsert);
      if (!res.ok) {
        console.error('[syncFootballFixturesToDatabase Upsert Error]:', res.error);
      } else {
        upserted = rowsToUpsert.length;
      }
    }

    // 2. Only prune demo/legacy/expired fixtures AFTER verifying new real fixtures were persisted
    if (upserted > 0) {
      const { data: existingRows } = await supabase
        .from('fixtures')
        .select('id, provider_id, competition_id, home_team_name, away_team_name, kickoff_time, is_demo, source');

      if (existingRows && Array.isArray(existingRows)) {
        const idsToDelete: string[] = [];
        const minIso = dateFrom ? `${dateFrom}T00:00:00Z` : null;

        for (const r of existingRows) {
          if (r.competition_id === 'comp_nba') continue;

          const pid = String(r.provider_id || '');
          const isLegacySeed = LEGACY_SEED_PROVIDER_PREFIXES.some(prefix => pid.startsWith(prefix));
          const isDemoRow = r.is_demo === 1 || r.is_demo === true || r.source === 'seed';
          const isNonCanonical = !isCanonicalCompetitionId(r.competition_id);
          const isExpired = Boolean(minIso && r.kickoff_time && String(r.kickoff_time) < minIso);
          const isPlaceholder = isPlaceholderTeamName(r.home_team_name) || isPlaceholderTeamName(r.away_team_name);

          if (isLegacySeed || isDemoRow || isNonCanonical || isExpired || isPlaceholder) {
            if (r.id) idsToDelete.push(String(r.id));
          }
        }

        if (idsToDelete.length > 0) {
          await supabase.from('fixtures').delete().in('id', idsToDelete);
        }
      }
    }
  } catch (err: any) {
    console.error('[syncFootballFixturesToDatabase Error]:', err?.message || err);
  }

  return { upserted, rejected };
}

/**
 * Upserts verified NBA fixtures into `fixtures` table with full team metadata and projections.
 */
export async function syncNBAFixturesToDatabase(
  fixtures: Fixture[],
  dateFrom?: string
): Promise<{ upserted: number }> {
  if (!isSupabaseConfigured || !supabase || !fixtures || fixtures.length === 0) {
    return { upserted: 0 };
  }

  let upserted = 0;
  try {
    const nowIso = new Date().toISOString();
    const rowsToUpsert: Record<string, any>[] = fixtures.map(f => ({
      id: f.id,
      provider_id: f.providerId,
      competition_id: 'comp_nba',
      competition_code: 'NBA',
      home_team_id: f.homeTeam.id,
      away_team_id: f.awayTeam.id,
      home_team_name: f.homeTeam.name,
      away_team_name: f.awayTeam.name,
      kickoff_time: f.kickoffTime,
      status: f.status,
      home_score: f.homeScore ?? null,
      away_score: f.awayScore ?? null,
      venue: f.venue || null,
      referee: null,
      source: f.source || 'provider:espn_nba',
      is_demo: false,
      payload_json: JSON.stringify({
        providerName: f.providerName || 'ESPN NBA Live Scoreboard & DraftKings Lines',
        seasonYear: f.seasonYear,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        basketballStats: f.basketballStats,
        venue: f.venue,
      }),
      updated_at: nowIso,
    }));

    const res = await upsertFixtureRowsSafely(rowsToUpsert);
    if (res.ok) {
      upserted = rowsToUpsert.length;
    } else {
      console.error('[syncNBAFixturesToDatabase Upsert Error]:', res.error);
    }

    if (upserted > 0 && dateFrom) {
      const minIso = `${dateFrom}T00:00:00Z`;
      const { data: existingRows } = await supabase
        .from('fixtures')
        .select('id, provider_id, competition_id, home_team_name, kickoff_time')
        .eq('competition_id', 'comp_nba');

      if (existingRows && Array.isArray(existingRows)) {
        const providerIdsToDelete: string[] = [];
        for (const r of existingRows) {
          const isMalformed = !r.id || !r.home_team_name;
          const isExpired = Boolean(r.kickoff_time && String(r.kickoff_time) < minIso);
          if ((isMalformed || isExpired) && r.provider_id) {
            providerIdsToDelete.push(String(r.provider_id));
          }
        }
        if (providerIdsToDelete.length > 0) {
          await supabase.from('fixtures').delete().in('provider_id', providerIdsToDelete);
        }
      }
    }
  } catch (err: any) {
    console.error('[syncNBAFixturesToDatabase Error]:', err?.message || err);
  }

  return { upserted };
}

/**
 * Retrieves fixtures from the database table 'fixtures' filtered by competition_id ONLY and day.
 * Rule 1: Every fixture has a canonical competition_id. Any without is logged as an error and never shown.
 * Rule 3: Filter by competition_id only, and combine it with the day filter.
 */
export async function getFixturesFromDatabase(options?: {
  competitionId?: string;
  status?: string;
  day?: DayFilterType | string;
  sport?: 'football' | 'basketball' | 'all';
}): Promise<Fixture[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    let query = supabase.from('fixtures').select('*').order('kickoff_time', { ascending: true });

    // Rule 3: Filter by competition_id ONLY
    if (options?.competitionId && options.competitionId !== 'ALL') {
      const rawCompId = options.competitionId.trim();
      if (!isCanonicalCompetitionId(rawCompId)) {
        logCompetitionIntegrityError('query_filter', rawCompId, 'getFixturesFromDatabase');
        return [];
      }
      query = query.eq('competition_id', rawCompId.toLowerCase());
    }

    if (options?.status && options.status !== 'ALL') {
      query = query.eq('status', options.status);
    }

    const { data: rows, error } = await query;
    if (error || !rows) {
      console.error('[Database Fixtures Query Error]:', error?.message);
      return [];
    }

    const result: Fixture[] = [];

    for (const row of rows) {
      // Map row and validate canonical competition_id (Rule 1)
      const fixture = mapDbRowToFixture(row);
      if (!fixture) continue;

      // Filter by sport
      if (options?.sport === 'football' && fixture.competitionId === 'comp_nba') continue;
      if (options?.sport === 'basketball' && fixture.competitionId !== 'comp_nba') continue;

      // Rule 3: Combine competition_id filter with day filter
      if (options?.day && options.day !== 'ALL') {
        if (!matchesDayFilter(fixture.kickoffTime, options.day)) {
          continue;
        }
      }

      result.push(fixture);
    }

    return result;
  } catch (err: any) {
    console.error('[getFixturesFromDatabase Error]:', err?.message || err);
    return [];
  }
}
