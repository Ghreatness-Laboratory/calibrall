// CALIBRALL: Canonical Competition Registry & Database-Driven Competition Discovery
// Enforces:
// 1. Canonical competitions source: competitions(id, code, name, country, sport, aliases, sort_order)
// 2. Every fixture has a valid canonical competition_id matching its competition_code.
// 3. Fixtures with missing, unknown, or conflicting competition_id are listed in unmappedFixtures and NEVER guessed.
// 4. Multi-sport support (football, basketball, all) + day-range filtering ('ALL' | 'today' | 'tomorrow' | 'weekend').

import { Competition, Sport } from '@/types';
import { supabase, isSupabaseConfigured, getLocalDatabase, isProductionRuntime } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { matchesDayFilter, DayFilterType } from '@/lib/utils/dateWindow';
import { hasFreeFixturesCoverage } from './providerBudget';
import {
  CANONICAL_COMPETITIONS_CATALOG,
  CompetitionWithCount,
  CountryCompetitionGroup,
  UnmappedFixtureEntry,
  isBasketballCompetitionId,
  normalizeSearchText,
  competitionMatchesSearch,
  fixtureMatchesSearchQuery,
  buildCompetitionGroupsFromFixtures,
} from './competitionSearch';

export {
  CANONICAL_COMPETITIONS_CATALOG,
  isBasketballCompetitionId,
  normalizeSearchText,
  competitionMatchesSearch,
  fixtureMatchesSearchQuery,
  buildCompetitionGroupsFromFixtures,
};
export type { CompetitionWithCount, CountryCompetitionGroup, UnmappedFixtureEntry };

export interface CompetitionIntegrityErrorEntry {
  timestamp: string;
  fixtureId: string;
  rawCompetitionId: string;
  source: string;
  message: string;
}

const competitionIntegrityErrors: CompetitionIntegrityErrorEntry[] = [];

export function logCompetitionIntegrityError(
  fixtureId: string,
  rawCompetitionId: unknown,
  source: string
): void {
  const rawStr = rawCompetitionId === undefined ? 'undefined' : String(rawCompetitionId);
  const message = `[Integrity Error] Fixture "${fixtureId}" (${source}) has no canonical competition_id (received: "${rawStr}"). Rejecting; never shown under fallback.`;
  console.error(message);
  competitionIntegrityErrors.unshift({
    timestamp: new Date().toISOString(),
    fixtureId,
    rawCompetitionId: rawStr,
    source,
    message,
  });
  if (competitionIntegrityErrors.length > 200) {
    competitionIntegrityErrors.length = 200;
  }
}

export function getCompetitionIntegrityErrors(): CompetitionIntegrityErrorEntry[] {
  return [...competitionIntegrityErrors];
}

export const CANONICAL_COMPETITIONS: Record<string, Competition> = CANONICAL_COMPETITIONS_CATALOG;

/**
 * Checks if a string is a valid canonical competition_id.
 * Must exist directly in CANONICAL_COMPETITIONS and never be a generic fallback.
 */
export function isCanonicalCompetitionId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const clean = id.trim().toLowerCase();
  if (!clean.startsWith('comp_')) return false;
  if (clean === 'comp_league' || clean === 'comp_sm_league' || clean === 'fallback') return false;
  if (clean === 'comp_ec') return true; // Legacy alias for comp_eng_national_league
  return Object.prototype.hasOwnProperty.call(CANONICAL_COMPETITIONS, clean);
}

/**
 * Resolves canonical Competition definition from canonical competition_id, provider code, or exact competition name.
 * Disambiguates 'EC': football-data.org uses 'EC' for UEFA European Championship (comp_euro),
 * whereas football-data.co.uk uses 'EC' for English National League (comp_eng_national_league).
 * Never guesses when ambiguous.
 */
export function getCanonicalCompetition(
  idOrCode: string,
  sourceProvider?: string
): Competition | null {
  if (!idOrCode || typeof idOrCode !== 'string') return null;
  const normalized = idOrCode.trim().toLowerCase();
  const codeUpper = idOrCode.trim().toUpperCase();
  const providerNorm = (sourceProvider || '').trim().toLowerCase();

  if (
    providerNorm.includes('football-data.org') &&
    (codeUpper === 'EC' || codeUpper === 'EURO' || normalized === 'comp_euro')
  ) {
    return CANONICAL_COMPETITIONS.comp_euro;
  }

  if (
    providerNorm.includes('football-data.co.uk') &&
    (codeUpper === 'EC' || normalized === 'comp_ec' || normalized === 'comp_eng_national_league')
  ) {
    return CANONICAL_COMPETITIONS.comp_eng_national_league;
  }

  // Legacy comp_ec key maps cleanly to comp_eng_national_league
  if (normalized === 'comp_ec') {
    return CANONICAL_COMPETITIONS.comp_eng_national_league;
  }

  // 1. Direct canonical key match (e.g. comp_fl1, comp_pl, comp_nba, comp_ncaab, comp_euroleague)
  if (Object.prototype.hasOwnProperty.call(CANONICAL_COMPETITIONS, normalized)) {
    return CANONICAL_COMPETITIONS[normalized];
  }

  // 2. Prefix match (e.g. fl1 -> comp_fl1)
  const prefixed = `comp_${normalized}`;
  if (Object.prototype.hasOwnProperty.call(CANONICAL_COMPETITIONS, prefixed)) {
    return CANONICAL_COMPETITIONS[prefixed];
  }

  // 3. Exact code aliases across providers (football-data.co.uk / ESPN / Sportmonks)
  if (codeUpper === 'BRA') return CANONICAL_COMPETITIONS.comp_bsa;
  if (codeUpper === 'E0') return CANONICAL_COMPETITIONS.comp_pl;
  if (codeUpper === 'E1') return CANONICAL_COMPETITIONS.comp_elc;
  if (codeUpper === 'SP1') return CANONICAL_COMPETITIONS.comp_pd;
  if (codeUpper === 'I1') return CANONICAL_COMPETITIONS.comp_sa;
  if (codeUpper === 'D1') return CANONICAL_COMPETITIONS.comp_bl1;
  if (codeUpper === 'F1') return CANONICAL_COMPETITIONS.comp_fl1;
  if (codeUpper === 'N1') return CANONICAL_COMPETITIONS.comp_ded;
  if (codeUpper === 'P1') return CANONICAL_COMPETITIONS.comp_ppl;
  if (codeUpper === 'T1') return CANONICAL_COMPETITIONS.comp_tsl;
  if (codeUpper === 'SP') return CANONICAL_COMPETITIONS.comp_sc0;
  if (codeUpper === 'ROM') return CANONICAL_COMPETITIONS.comp_rou;
  if (codeUpper === 'SUI') return CANONICAL_COMPETITIONS.comp_swz;
  if (codeUpper === 'EC') return CANONICAL_COMPETITIONS.comp_eng_national_league;

  const byCode = Object.values(CANONICAL_COMPETITIONS).find((c) => c.code.toUpperCase() === codeUpper);
  if (byCode) {
    return byCode;
  }

  // 4. Exact normalized name match (never substring-guessed so e.g. 'Austrian Bundesliga' !== 'Bundesliga')
  const searchNorm = normalizeSearchText(idOrCode);
  if (searchNorm) {
    const byExactName = Object.values(CANONICAL_COMPETITIONS).find(
      (c) => normalizeSearchText(c.name) === searchNorm
    );
    if (byExactName) {
      return byExactName;
    }

    // Exact unique alias match only
    const aliasMatches = Object.values(CANONICAL_COMPETITIONS).filter((c) =>
      (c.aliases || []).some((a) => normalizeSearchText(a) === searchNorm)
    );
    if (aliasMatches.length === 1) {
      return aliasMatches[0];
    }
  }

  return null;
}

export function getUncoveredFootballCompetitions(): Array<{
  id: string;
  code: string;
  name: string;
  country: string;
  tier: number;
}> {
  return Object.values(CANONICAL_COMPETITIONS)
    .filter((c) => (c.sport || 'football') === 'football')
    .filter((c) => !hasFreeFixturesCoverage(c.code).hasFreeSource)
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      country: c.country,
      tier: c.tier,
    }))
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

function parseAliasesField(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
      } catch {
        // fallback below
      }
    }
    return trimmed
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((s) => s.replace(/^"|"$/g, '').trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Loads the canonical competitions catalog from `competitions` table (id, code, name, country, sport, aliases, sort_order),
 * merging safely with CANONICAL_COMPETITIONS_CATALOG defaults if any row hasn't been migrated yet.
 */
export async function loadCanonicalCompetitionCatalog(
  sport: Sport | 'all' = 'all'
): Promise<Map<string, Competition>> {
  const map = new Map<string, Competition>();

  for (const base of Object.values(CANONICAL_COMPETITIONS)) {
    const compSport: Sport = base.sport || (isBasketballCompetitionId(base.id) ? 'basketball' : 'football');
    if (sport !== 'all' && compSport !== sport) continue;
    map.set(base.id, { ...base, sport: compSport, aliases: base.aliases || [], sortOrder: base.sortOrder ?? 100 });
  }

  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase
        .from('competitions')
        .select('id, code, name, country, sport, aliases, sort_order, emblem_url, tier, avg_goals_per_game, avg_corners_per_game, avg_cards_per_game, is_active')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (sport !== 'all') {
        query = query.eq('sport', sport);
      }

      const { data: rows, error } = await query;
      if (!error && Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          const id = String(row.id || '').trim().toLowerCase();
          if (!isCanonicalCompetitionId(id)) continue;
          const compSport: Sport =
            row.sport === 'basketball' || isBasketballCompetitionId(id) ? 'basketball' : 'football';
          if (sport !== 'all' && compSport !== sport) continue;

          const base = CANONICAL_COMPETITIONS[id];
          const dbAliases = parseAliasesField(row.aliases);
          const mergedAliases = Array.from(new Set([...(base?.aliases || []), ...dbAliases]));

          map.set(id, {
            id,
            code: String(row.code || base?.code || '').trim().toUpperCase(),
            name: String(row.name || base?.name || '').trim(),
            country: String(row.country || base?.country || '').trim(),
            sport: compSport,
            aliases: mergedAliases,
            sortOrder:
              row.sort_order !== null && row.sort_order !== undefined
                ? Number(row.sort_order)
                : base?.sortOrder ?? 100,
            emblemUrl: String(row.emblem_url || base?.emblemUrl || ''),
            tier: row.tier !== null && row.tier !== undefined ? Number(row.tier) : base?.tier ?? 1,
            avgGoalsPerGame:
              row.avg_goals_per_game !== null && row.avg_goals_per_game !== undefined
                ? Number(row.avg_goals_per_game)
                : base?.avgGoalsPerGame ?? 0,
            avgCornersPerGame:
              row.avg_corners_per_game !== null && row.avg_corners_per_game !== undefined
                ? Number(row.avg_corners_per_game)
                : base?.avgCornersPerGame ?? 0,
            avgCardsPerGame:
              row.avg_cards_per_game !== null && row.avg_cards_per_game !== undefined
                ? Number(row.avg_cards_per_game)
                : base?.avgCardsPerGame ?? 0,
            isActive: row.is_active === undefined ? true : Boolean(row.is_active === 1 || row.is_active === true),
          });
        }
      }
    } catch {
      // Fall back safely to in-code canonical catalog when legacy DB hasn't applied migration yet
    }
  }

  return map;
}

/**
 * Validates whether a raw DB fixture row maps cleanly and unambiguously to a canonical competition.
 * Never guesses: returns { competitionId } on clean match or { unmapped } with exact diagnostic reason.
 */
export function resolveAndVerifyFixtureCompetition(row: {
  id?: unknown;
  provider_id?: unknown;
  home_team_name?: unknown;
  away_team_name?: unknown;
  competition_id?: unknown;
  competition_code?: unknown;
  kickoff_time?: unknown;
  source?: unknown;
}): { competitionId: string; competition: Competition } | { unmapped: UnmappedFixtureEntry } {
  const idStr = String(row.id || row.provider_id || 'unknown');
  const rawId = row.competition_id !== undefined && row.competition_id !== null ? String(row.competition_id).trim() : null;
  const rawCode =
    row.competition_code !== undefined && row.competition_code !== null
      ? String(row.competition_code).trim()
      : null;
  const sourceStr = String(row.source || 'db:fixtures');

  if (!rawId || !isCanonicalCompetitionId(rawId)) {
    return {
      unmapped: {
        id: idStr,
        providerId: row.provider_id ? String(row.provider_id) : null,
        homeTeamName: String(row.home_team_name || 'Unknown Home'),
        awayTeamName: String(row.away_team_name || 'Unknown Away'),
        rawCompetitionId: rawId,
        rawCompetitionCode: rawCode,
        source: sourceStr,
        kickoffTime: row.kickoff_time ? String(row.kickoff_time) : null,
        reason: rawId ? `Non-canonical competition_id "${rawId}"` : 'Missing competition_id',
      },
    };
  }

  const canonicalById = getCanonicalCompetition(rawId, sourceStr);
  if (!canonicalById) {
    return {
      unmapped: {
        id: idStr,
        providerId: row.provider_id ? String(row.provider_id) : null,
        homeTeamName: String(row.home_team_name || 'Unknown Home'),
        awayTeamName: String(row.away_team_name || 'Unknown Away'),
        rawCompetitionId: rawId,
        rawCompetitionCode: rawCode,
        source: sourceStr,
        kickoffTime: row.kickoff_time ? String(row.kickoff_time) : null,
        reason: `Unknown canonical competition_id "${rawId}"`,
      },
    };
  }

  // Guard against wrong-league assignment where competition_id and competition_code disagree
  if (rawCode && rawCode.toUpperCase() !== canonicalById.code.toUpperCase()) {
    const canonicalByCode = getCanonicalCompetition(rawCode, sourceStr);
    if (canonicalByCode && canonicalByCode.id !== canonicalById.id) {
      return {
        unmapped: {
          id: idStr,
          providerId: row.provider_id ? String(row.provider_id) : null,
          homeTeamName: String(row.home_team_name || 'Unknown Home'),
          awayTeamName: String(row.away_team_name || 'Unknown Away'),
          rawCompetitionId: rawId,
          rawCompetitionCode: rawCode,
          source: sourceStr,
          kickoffTime: row.kickoff_time ? String(row.kickoff_time) : null,
          reason: `Competition mismatch: competition_id="${canonicalById.id}" conflicts with competition_code="${rawCode}" (${canonicalByCode.id})`,
        },
      };
    }
  }

  return {
    competitionId: canonicalById.id,
    competition: canonicalById,
  };
}

/**
 * Queries canonical `competitions` table + active DB fixtures/games and builds dynamic counts grouped by country/region.
 * Fast path: NEVER blocks on full-table historical `matches` pagination scans.
 */
export async function getCompetitionsFromDatabase(
  sport: Sport | 'all' = 'football',
  options?: { day?: DayFilterType | string; includeEmpty?: boolean }
): Promise<{
  competitions: CompetitionWithCount[];
  groupedByCountry: CountryCompetitionGroup[];
  total: number;
  totalFixtures: number;
  unmappedFixtures: UnmappedFixtureEntry[];
}> {
  const catalog = await loadCanonicalCompetitionCatalog(sport);
  const countsByCompId = new Map<string, number>();
  const storedMatchCountsByCompId = new Map<string, number>();
  const unmappedFixtures: UnmappedFixtureEntry[] = [];

  for (const compId of catalog.keys()) {
    countsByCompId.set(compId, 0);
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: dbFixtures, error } = await fetchAllRows((from, to) =>
        supabase
          .from('fixtures')
          .select('id, provider_id, home_team_name, away_team_name, competition_id, competition_code, kickoff_time, status, source')
          .order('id', { ascending: true })
          .range(from, to)
      );

      if (error) {
        console.error('[Competitions Database Query Error]:', error.message);
      } else if (dbFixtures && dbFixtures.length > 0) {
        for (const row of dbFixtures) {
          const verified = resolveAndVerifyFixtureCompetition(row);
          if ('unmapped' in verified) {
            logCompetitionIntegrityError(verified.unmapped.id, verified.unmapped.rawCompetitionId, verified.unmapped.source);
            unmappedFixtures.push(verified.unmapped);
            continue;
          }

          const { competitionId, competition } = verified;
          const compSport: Sport = competition.sport || (isBasketballCompetitionId(competitionId) ? 'basketball' : 'football');
          if (sport === 'football' && compSport !== 'football') continue;
          if (sport === 'basketball' && compSport !== 'basketball') continue;

          if (options?.day && options.day !== 'ALL') {
            if (!matchesDayFilter(row.kickoff_time, options.day)) {
              continue;
            }
          }

          countsByCompId.set(competitionId, (countsByCompId.get(competitionId) || 0) + 1);
        }
      }

      // Basketball active window from bb_games when querying 'basketball' or 'all'
      if (sport === 'basketball' || sport === 'all') {
        const now = new Date();
        const startDt = new Date(now.getTime() - 10 * 86400_000).toISOString().slice(0, 10);
        const endDt = new Date(now.getTime() + 14 * 86400_000).toISOString().slice(0, 10);

        const { data: bbRows } = await fetchAllRows((from, to) =>
          supabase
            .from('bb_games')
            .select('id, league, game_date, kickoff_utc, home_id, away_id, source')
            .gte('game_date', startDt)
            .lte('game_date', endDt)
            .order('game_date', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
        );

        for (const r of bbRows || []) {
          const rawLeague = String(r.league || '').trim();
          const mapped = getCanonicalCompetition(rawLeague);
          if (!mapped || (mapped.sport || 'football') !== 'basketball') {
            unmappedFixtures.push({
              id: String(r.id || 'unknown'),
              providerId: String(r.id || ''),
              homeTeamName: String(r.home_id || 'Unknown Home'),
              awayTeamName: String(r.away_id || 'Unknown Away'),
              rawCompetitionId: null,
              rawCompetitionCode: rawLeague || null,
              source: String(r.source || 'db:bb_games'),
              kickoffTime: r.kickoff_utc ? String(r.kickoff_utc) : r.game_date ? `${String(r.game_date).slice(0, 10)}T19:00:00Z` : null,
              reason: `Unmapped basketball league "${rawLeague}"`,
            });
            continue;
          }

          const kickoff = r.kickoff_utc ? String(r.kickoff_utc) : `${String(r.game_date).slice(0, 10)}T19:00:00Z`;
          if (options?.day && options.day !== 'ALL') {
            if (!matchesDayFilter(kickoff, options.day)) continue;
          }

          countsByCompId.set(mapped.id, (countsByCompId.get(mapped.id) || 0) + 1);
        }
      }

      // Lightweight local SQLite historical storedMatchCount summary only (never runs slow multi-page scans over HTTP!)
      if (sport !== 'basketball' && !isProductionRuntime() && typeof window === 'undefined') {
        try {
          const db = getLocalDatabase();
          if (db) {
            const rows = db
              .prepare('SELECT UPPER(competition_code) AS code, COUNT(*) AS cnt FROM matches GROUP BY UPPER(competition_code)')
              .all() as Array<{ code: string; cnt: number }>;
            for (const r of rows) {
              const rawCode = String(r.code || '').trim().toUpperCase();
              if (!rawCode) continue;
              const mapped = getCanonicalCompetition(rawCode);
              if (!mapped || !isCanonicalCompetitionId(mapped.id) || isBasketballCompetitionId(mapped.id)) continue;
              storedMatchCountsByCompId.set(
                mapped.id,
                (storedMatchCountsByCompId.get(mapped.id) || 0) + Number(r.cnt || 0)
              );
            }
          }
        } catch {
          // Non-fatal
        }
      }
    } catch (err: any) {
      console.error('[Competitions Service Error]:', err?.message || err);
    }
  }

  const allCompetitions: CompetitionWithCount[] = [];
  let totalFixtures = 0;

  for (const [compId, meta] of catalog.entries()) {
    const count = countsByCompId.get(compId) || 0;
    const compSport: Sport = meta.sport || (isBasketballCompetitionId(compId) ? 'basketball' : 'football');
    if (sport === 'football' && compSport !== 'football') continue;
    if (sport === 'basketball' && compSport !== 'basketball') continue;

    const coverage =
      compSport === 'basketball'
        ? { hasFreeSource: true, provider: compId === 'comp_euroleague' ? 'EuroLeague Official API v2' : 'ESPN Scoreboard' }
        : hasFreeFixturesCoverage(meta.code);

    totalFixtures += count;

    const includeRow = options?.includeEmpty !== false ? true : count > 0;
    if (!includeRow) continue;

    allCompetitions.push({
      ...meta,
      sport: compSport,
      aliases: meta.aliases || [],
      sortOrder: meta.sortOrder ?? 100,
      name: cleanDisplayText(meta.name),
      fixtureCount: count,
      storedMatchCount: storedMatchCountsByCompId.get(compId) || 0,
      hasFreeFixturesSource: coverage.hasFreeSource,
      freeFixturesProvider: coverage.provider,
    });
  }

  allCompetitions.sort((a, b) => {
    if ((a.fixtureCount > 0) !== (b.fixtureCount > 0)) {
      return a.fixtureCount > 0 ? -1 : 1;
    }
    return (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.tier - b.tier || a.name.localeCompare(b.name);
  });

  // Grouped by country/region: sort groups by highest-priority competition inside each country
  const countryMap = new Map<string, CompetitionWithCount[]>();
  for (const comp of allCompetitions) {
    const list = countryMap.get(comp.country) || [];
    list.push(comp);
    countryMap.set(comp.country, list);
  }

  const groupedByCountry: CountryCompetitionGroup[] = Array.from(countryMap.entries())
    .map(([country, competitions]) => ({
      country,
      competitions: competitions.sort(
        (a, b) =>
          ((b.fixtureCount > 0 ? 1 : 0) - (a.fixtureCount > 0 ? 1 : 0)) ||
          (a.sortOrder ?? 100) - (b.sortOrder ?? 100) ||
          a.name.localeCompare(b.name)
      ),
    }))
    .sort((a, b) => {
      const aActive = a.competitions.some((c) => c.fixtureCount > 0) ? 0 : 1;
      const bActive = b.competitions.some((c) => c.fixtureCount > 0) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const minA = Math.min(...a.competitions.map((c) => c.sortOrder ?? 100));
      const minB = Math.min(...b.competitions.map((c) => c.sortOrder ?? 100));
      if (minA !== minB) return minA - minB;
      return a.country.localeCompare(b.country);
    });

  return {
    competitions: allCompetitions,
    groupedByCountry,
    total: allCompetitions.length,
    totalFixtures,
    unmappedFixtures,
  };
}
