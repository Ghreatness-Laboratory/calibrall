// CALIBRALL: Canonical Competition Registry & Database-Driven Competition Discovery
// Enforces:
// 1. Every fixture has a canonical competition_id (e.g. comp_pl, comp_fl1, comp_pd, comp_bl1, comp_sa, comp_elc, comp_ded, comp_cl, comp_bsa, comp_nba)
// 2. Competition discovery directly from active database fixtures (never a static hard-coded list)
// 3. Country grouping, search capability, and exact fixture counts per competition
// 4. Strict validation: fixtures with missing or non-canonical competition_id are logged as errors and rejected with 0 fallback

import { Competition, Sport } from '@/types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { matchesDayFilter, DayFilterType } from '@/lib/utils/dateWindow';

export interface CompetitionWithCount extends Competition {
  fixtureCount: number;
}

export interface CountryCompetitionGroup {
  country: string;
  competitions: CompetitionWithCount[];
}

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

export const CANONICAL_COMPETITIONS: Record<string, Competition> = {
  comp_pl: {
    id: 'comp_pl',
    code: 'PL',
    name: 'Premier League',
    country: 'England',
    emblemUrl: 'https://crests.football-data.org/PL.png',
    tier: 1,
    avgGoalsPerGame: 2.88,
    avgCornersPerGame: 10.45,
    avgCardsPerGame: 4.12,
    isActive: true,
  },
  comp_elc: {
    id: 'comp_elc',
    code: 'ELC',
    name: 'Championship',
    country: 'England',
    emblemUrl: 'https://crests.football-data.org/ELC.png',
    tier: 2,
    avgGoalsPerGame: 2.65,
    avgCornersPerGame: 10.20,
    avgCardsPerGame: 4.25,
    isActive: true,
  },
  comp_e2: {
    id: 'comp_e2',
    code: 'E2',
    name: 'League One',
    country: 'England',
    emblemUrl: 'https://crests.football-data.org/ED.png',
    tier: 3,
    avgGoalsPerGame: 2.60,
    avgCornersPerGame: 10.10,
    avgCardsPerGame: 4.15,
    isActive: true,
  },
  comp_e3: {
    id: 'comp_e3',
    code: 'E3',
    name: 'League Two',
    country: 'England',
    emblemUrl: 'https://crests.football-data.org/ED.png',
    tier: 4,
    avgGoalsPerGame: 2.58,
    avgCornersPerGame: 10.05,
    avgCardsPerGame: 4.20,
    isActive: true,
  },
  comp_fl1: {
    id: 'comp_fl1',
    code: 'FL1',
    name: 'Ligue 1',
    country: 'France',
    emblemUrl: 'https://crests.football-data.org/FL1.png',
    tier: 1,
    avgGoalsPerGame: 2.70,
    avgCornersPerGame: 9.75,
    avgCardsPerGame: 3.85,
    isActive: true,
  },
  comp_pd: {
    id: 'comp_pd',
    code: 'PD',
    name: 'La Liga',
    country: 'Spain',
    emblemUrl: 'https://crests.football-data.org/PD.png',
    tier: 1,
    avgGoalsPerGame: 2.54,
    avgCornersPerGame: 9.30,
    avgCardsPerGame: 4.88,
    isActive: true,
  },
  comp_bl1: {
    id: 'comp_bl1',
    code: 'BL1',
    name: 'Bundesliga',
    country: 'Germany',
    emblemUrl: 'https://crests.football-data.org/BL1.png',
    tier: 1,
    avgGoalsPerGame: 3.18,
    avgCornersPerGame: 10.15,
    avgCardsPerGame: 3.75,
    isActive: true,
  },
  comp_sa: {
    id: 'comp_sa',
    code: 'SA',
    name: 'Serie A',
    country: 'Italy',
    emblemUrl: 'https://crests.football-data.org/SA.png',
    tier: 1,
    avgGoalsPerGame: 2.62,
    avgCornersPerGame: 9.60,
    avgCardsPerGame: 4.50,
    isActive: true,
  },
  comp_ded: {
    id: 'comp_ded',
    code: 'DED',
    name: 'Eredivisie',
    country: 'Netherlands',
    emblemUrl: 'https://crests.football-data.org/DED.png',
    tier: 1,
    avgGoalsPerGame: 3.05,
    avgCornersPerGame: 10.35,
    avgCardsPerGame: 3.65,
    isActive: true,
  },
  comp_bsa: {
    id: 'comp_bsa',
    code: 'BSA',
    name: 'Campeonato Brasileiro Série A',
    country: 'Brazil',
    emblemUrl: 'https://crests.football-data.org/BSA.png',
    tier: 1,
    avgGoalsPerGame: 2.48,
    avgCornersPerGame: 9.80,
    avgCardsPerGame: 4.90,
    isActive: true,
  },
  comp_ppl: {
    id: 'comp_ppl',
    code: 'PPL',
    name: 'Primeira Liga',
    country: 'Portugal',
    emblemUrl: 'https://crests.football-data.org/PPL.png',
    tier: 1,
    avgGoalsPerGame: 2.62,
    avgCornersPerGame: 9.90,
    avgCardsPerGame: 4.80,
    isActive: true,
  },
  comp_tsl: {
    id: 'comp_tsl',
    code: 'TSL',
    name: 'Süper Lig',
    country: 'Turkey',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.78,
    avgCornersPerGame: 9.60,
    avgCardsPerGame: 4.70,
    isActive: true,
  },
  comp_sc0: {
    id: 'comp_sc0',
    code: 'SC0',
    name: 'Scottish Premiership',
    country: 'Scotland',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.74,
    avgCornersPerGame: 10.10,
    avgCardsPerGame: 4.05,
    isActive: true,
  },
  comp_arg: {
    id: 'comp_arg',
    code: 'ARG',
    name: 'Liga Profesional',
    country: 'Argentina',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.25,
    avgCornersPerGame: 9.40,
    avgCardsPerGame: 5.10,
    isActive: true,
  },
  comp_jpn: {
    id: 'comp_jpn',
    code: 'JPN',
    name: 'J1 League',
    country: 'Japan',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.60,
    avgCornersPerGame: 9.30,
    avgCardsPerGame: 3.10,
    isActive: true,
  },
  comp_ec: {
    id: 'comp_ec',
    code: 'EC',
    name: 'National League',
    country: 'England',
    emblemUrl: '',
    tier: 5,
    avgGoalsPerGame: 2.65,
    avgCornersPerGame: 9.90,
    avgCardsPerGame: 3.90,
    isActive: true,
  },
  comp_sc1: {
    id: 'comp_sc1',
    code: 'SC1',
    name: 'Scottish Championship',
    country: 'Scotland',
    emblemUrl: '',
    tier: 2,
    avgGoalsPerGame: 2.68,
    avgCornersPerGame: 10.00,
    avgCardsPerGame: 4.10,
    isActive: true,
  },
  comp_sc2: {
    id: 'comp_sc2',
    code: 'SC2',
    name: 'Scottish League One',
    country: 'Scotland',
    emblemUrl: '',
    tier: 3,
    avgGoalsPerGame: 2.72,
    avgCornersPerGame: 9.85,
    avgCardsPerGame: 4.05,
    isActive: true,
  },
  comp_sc3: {
    id: 'comp_sc3',
    code: 'SC3',
    name: 'Scottish League Two',
    country: 'Scotland',
    emblemUrl: '',
    tier: 4,
    avgGoalsPerGame: 2.75,
    avgCornersPerGame: 9.75,
    avgCardsPerGame: 4.00,
    isActive: true,
  },
  comp_sp2: {
    id: 'comp_sp2',
    code: 'SP2',
    name: 'Segunda División',
    country: 'Spain',
    emblemUrl: '',
    tier: 2,
    avgGoalsPerGame: 2.28,
    avgCornersPerGame: 9.20,
    avgCardsPerGame: 5.10,
    isActive: true,
  },
  comp_i2: {
    id: 'comp_i2',
    code: 'I2',
    name: 'Serie B',
    country: 'Italy',
    emblemUrl: '',
    tier: 2,
    avgGoalsPerGame: 2.45,
    avgCornersPerGame: 9.50,
    avgCardsPerGame: 4.75,
    isActive: true,
  },
  comp_d2: {
    id: 'comp_d2',
    code: 'D2',
    name: '2. Bundesliga',
    country: 'Germany',
    emblemUrl: '',
    tier: 2,
    avgGoalsPerGame: 3.00,
    avgCornersPerGame: 10.00,
    avgCardsPerGame: 4.10,
    isActive: true,
  },
  comp_f2: {
    id: 'comp_f2',
    code: 'F2',
    name: 'Ligue 2',
    country: 'France',
    emblemUrl: '',
    tier: 2,
    avgGoalsPerGame: 2.38,
    avgCornersPerGame: 9.30,
    avgCardsPerGame: 3.95,
    isActive: true,
  },
  comp_b1: {
    id: 'comp_b1',
    code: 'B1',
    name: 'Belgian Pro League',
    country: 'Belgium',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.85,
    avgCornersPerGame: 10.10,
    avgCardsPerGame: 4.00,
    isActive: true,
  },
  comp_g1: {
    id: 'comp_g1',
    code: 'G1',
    name: 'Super League Greece',
    country: 'Greece',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.42,
    avgCornersPerGame: 9.10,
    avgCardsPerGame: 4.85,
    isActive: true,
  },
  comp_aut: {
    id: 'comp_aut',
    code: 'AUT',
    name: 'Austrian Bundesliga',
    country: 'Austria',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.95,
    avgCornersPerGame: 9.80,
    avgCardsPerGame: 4.20,
    isActive: true,
  },
  comp_chn: {
    id: 'comp_chn',
    code: 'CHN',
    name: 'Chinese Super League',
    country: 'China',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.80,
    avgCornersPerGame: 9.50,
    avgCardsPerGame: 3.90,
    isActive: true,
  },
  comp_dnk: {
    id: 'comp_dnk',
    code: 'DNK',
    name: 'Danish Superliga',
    country: 'Denmark',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.82,
    avgCornersPerGame: 9.70,
    avgCardsPerGame: 3.85,
    isActive: true,
  },
  comp_fin: {
    id: 'comp_fin',
    code: 'FIN',
    name: 'Veikkausliiga',
    country: 'Finland',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.75,
    avgCornersPerGame: 9.40,
    avgCardsPerGame: 3.70,
    isActive: true,
  },
  comp_irl: {
    id: 'comp_irl',
    code: 'IRL',
    name: 'League of Ireland Premier Division',
    country: 'Ireland',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.45,
    avgCornersPerGame: 9.60,
    avgCardsPerGame: 4.10,
    isActive: true,
  },
  comp_mex: {
    id: 'comp_mex',
    code: 'MEX',
    name: 'Liga MX',
    country: 'Mexico',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.70,
    avgCornersPerGame: 9.50,
    avgCardsPerGame: 4.50,
    isActive: true,
  },
  comp_nor: {
    id: 'comp_nor',
    code: 'NOR',
    name: 'Eliteserien',
    country: 'Norway',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.95,
    avgCornersPerGame: 10.10,
    avgCardsPerGame: 3.60,
    isActive: true,
  },
  comp_pol: {
    id: 'comp_pol',
    code: 'POL',
    name: 'Ekstraklasa',
    country: 'Poland',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.58,
    avgCornersPerGame: 9.70,
    avgCardsPerGame: 4.30,
    isActive: true,
  },
  comp_rou: {
    id: 'comp_rou',
    code: 'ROU',
    name: 'Liga I',
    country: 'Romania',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.40,
    avgCornersPerGame: 9.30,
    avgCardsPerGame: 4.60,
    isActive: true,
  },
  comp_rus: {
    id: 'comp_rus',
    code: 'RUS',
    name: 'Russian Premier League',
    country: 'Russia',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.55,
    avgCornersPerGame: 9.50,
    avgCardsPerGame: 4.40,
    isActive: true,
  },
  comp_swe: {
    id: 'comp_swe',
    code: 'SWE',
    name: 'Allsvenskan',
    country: 'Sweden',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.80,
    avgCornersPerGame: 10.00,
    avgCardsPerGame: 3.70,
    isActive: true,
  },
  comp_swz: {
    id: 'comp_swz',
    code: 'SWZ',
    name: 'Swiss Super League',
    country: 'Switzerland',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.92,
    avgCornersPerGame: 9.90,
    avgCardsPerGame: 4.25,
    isActive: true,
  },
  comp_usa: {
    id: 'comp_usa',
    code: 'USA',
    name: 'Major League Soccer',
    country: 'USA',
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.95,
    avgCornersPerGame: 9.80,
    avgCardsPerGame: 4.00,
    isActive: true,
  },
  comp_cl: {
    id: 'comp_cl',
    code: 'CL',
    name: 'UEFA Champions League',
    country: 'Europe',
    emblemUrl: 'https://crests.football-data.org/CL.png',
    tier: 1,
    avgGoalsPerGame: 3.02,
    avgCornersPerGame: 9.85,
    avgCardsPerGame: 3.95,
    isActive: true,
  },
  comp_nba: {
    id: 'comp_nba',
    code: 'NBA',
    name: 'National Basketball Association',
    country: 'USA',
    emblemUrl: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
    tier: 1,
    avgGoalsPerGame: 0,
    avgCornersPerGame: 0,
    avgCardsPerGame: 0,
    isActive: true,
  },
};

/**
 * Checks if a string is a valid canonical competition_id.
 * Must exist directly in CANONICAL_COMPETITIONS and never be a generic fallback.
 */
export function isCanonicalCompetitionId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const clean = id.trim().toLowerCase();
  if (!clean.startsWith('comp_')) return false;
  if (clean === 'comp_league' || clean === 'comp_sm_league' || clean === 'fallback') return false;
  return Object.prototype.hasOwnProperty.call(CANONICAL_COMPETITIONS, clean);
}

/**
 * Resolves canonical Competition definition from canonical competition_id or known league code.
 */
export function getCanonicalCompetition(idOrCode: string): Competition | null {
  if (!idOrCode || typeof idOrCode !== 'string') return null;
  const normalized = idOrCode.trim().toLowerCase();

  // 1. Direct canonical key match (e.g. comp_fl1, comp_pl)
  if (Object.prototype.hasOwnProperty.call(CANONICAL_COMPETITIONS, normalized)) {
    return CANONICAL_COMPETITIONS[normalized];
  }

  // 2. Prefix match (e.g. fl1 -> comp_fl1)
  const prefixed = `comp_${normalized}`;
  if (Object.prototype.hasOwnProperty.call(CANONICAL_COMPETITIONS, prefixed)) {
    return CANONICAL_COMPETITIONS[prefixed];
  }

  // 3. Exact code aliases across providers (football-data.co.uk / ESPN / Sportmonks)
  const codeUpper = idOrCode.trim().toUpperCase();
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

  const byCode = Object.values(CANONICAL_COMPETITIONS).find(c => c.code.toUpperCase() === codeUpper);
  if (byCode) {
    return byCode;
  }

  return null;
}

/**
 * Queries database fixtures and builds active competitions dynamically.
 * Rule 1: Every fixture must have a canonical competition_id. Those without are logged as errors and rejected.
 * Rule 2: Built from database, not hard-coded list. Shows every competition that has fixtures, grouped by country, with counts.
 */
export async function getCompetitionsFromDatabase(
  sport: Sport | 'all' = 'football',
  options?: { day?: DayFilterType | string }
): Promise<{
  competitions: CompetitionWithCount[];
  groupedByCountry: CountryCompetitionGroup[];
  total: number;
  totalFixtures: number;
}> {
  const countsByCompId = new Map<string, number>();

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: dbFixtures, error } = await supabase
        .from('fixtures')
        .select('id, provider_id, competition_id, competition_code, kickoff_time, status');

      if (error) {
        console.error('[Competitions Database Query Error]:', error.message);
      } else if (dbFixtures && Array.isArray(dbFixtures)) {
        for (const row of dbFixtures) {
          const rawId = row.competition_id;

          // Rule 1 Enforcement: Every fixture has a canonical competition_id.
          // A fixture with none is logged as an error and never shown under a fallback.
          if (!isCanonicalCompetitionId(rawId)) {
            logCompetitionIntegrityError(
              String(row.id || row.provider_id || 'unknown'),
              rawId,
              'db:fixtures'
            );
            continue;
          }

          const compId = rawId.trim().toLowerCase();

          // Sport filter check
          if (sport === 'football' && compId === 'comp_nba') continue;
          if (sport === 'basketball' && compId !== 'comp_nba') continue;

          // Optional day filter check
          if (options?.day && options.day !== 'ALL') {
            if (!matchesDayFilter(row.kickoff_time, options.day)) {
              continue;
            }
          }

          countsByCompId.set(compId, (countsByCompId.get(compId) || 0) + 1);
        }
      }

      // Include canonical competitions present in stored historical matches (even if 0 upcoming fixtures, e.g. CHN)
      if ((!options?.day || options.day === 'ALL') && sport !== 'basketball') {
        const { data: dbMatches, error: matchErr } = await supabase
          .from('matches')
          .select('competition_code');

        if (!matchErr && dbMatches && Array.isArray(dbMatches)) {
          const seenCodes = new Set<string>();
          for (const row of dbMatches) {
            const rawCode = String(row.competition_code || '').trim().toUpperCase();
            if (!rawCode || seenCodes.has(rawCode)) continue;
            seenCodes.add(rawCode);
            const mapped = getCanonicalCompetition(rawCode);
            if (!mapped || !isCanonicalCompetitionId(mapped.id)) continue;
            if (mapped.id === 'comp_nba') continue;
            if (!countsByCompId.has(mapped.id)) {
              countsByCompId.set(mapped.id, 0);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[Competitions Service Error]:', err?.message || err);
    }
  }

  // Construct active competitions list with counts (all DB competitions with fixtures or stored matches)
  const activeCompetitions: CompetitionWithCount[] = [];
  let totalFixtures = 0;

  for (const [compId, count] of countsByCompId.entries()) {
    if (count < 0) continue;
    const canonical = getCanonicalCompetition(compId);
    if (!canonical) {
      logCompetitionIntegrityError('aggregate', compId, 'db:fixtures');
      continue;
    }
    totalFixtures += count;
    activeCompetitions.push({
      ...canonical,
      name: cleanDisplayText(canonical.name),
      fixtureCount: count,
    });
  }

  // Sort competitions: tier ascending, then name ascending
  activeCompetitions.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

  // Group by country
  const countryMap = new Map<string, CompetitionWithCount[]>();
  for (const comp of activeCompetitions) {
    const list = countryMap.get(comp.country) || [];
    list.push(comp);
    countryMap.set(comp.country, list);
  }

  const groupedByCountry: CountryCompetitionGroup[] = Array.from(countryMap.entries())
    .map(([country, competitions]) => ({
      country,
      competitions,
    }))
    .sort((a, b) => a.country.localeCompare(b.country));

  return {
    competitions: activeCompetitions,
    groupedByCountry,
    total: activeCompetitions.length,
    totalFixtures,
  };
}
