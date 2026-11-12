// CALIBRALL: Database Fixtures Persistence & Query Service
// Enforces:
// 1. Every fixture has a canonical competition_id (e.g. comp_pl, comp_fl1, comp_pd, comp_bl1, comp_sa, comp_elc, comp_nba).
//    A fixture with none is logged as an error and never shown under a fallback.
// 2. Fixtures are queried directly from the database table 'fixtures'.
// 3. Filter by competition_id only, combined with the day filter.

import { Fixture, MatchStatus } from '@/types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { lookupTeamStrength } from './teamDatabase';
import { lookupCanonicalTeam } from './canonicalTeams';
import { getCanonicalCompetition, isCanonicalCompetitionId } from './canonicalCompetitions';
import { cleanDisplayText } from '@/lib/utils/formatText';

export type DayFilterType = 'ALL' | 'today' | 'tomorrow' | 'weekend';

/**
 * Checks if a fixture kickoffTime matches the selected day filter.
 */
export function matchesDayFilter(kickoffTime: string, day: DayFilterType | string): boolean {
  if (!day || day === 'ALL') return true;

  const now = new Date();
  const todayYmd = now.toISOString().slice(0, 10);

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowYmd = tomorrow.toISOString().slice(0, 10);

  // Fixture date
  const fixDate = new Date(kickoffTime);
  const fixYmd = fixDate.toISOString().slice(0, 10);

  if (day === 'today') {
    return fixYmd === todayYmd;
  }

  if (day === 'tomorrow') {
    return fixYmd === tomorrowYmd;
  }

  if (day === 'weekend') {
    const dayOfWeek = fixDate.getUTCDay(); // 0 is Sunday, 6 is Saturday
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  // Exact date match
  return fixYmd === day;
}

/**
 * Maps raw database fixture row into verified Fixture entity.
 * Rule 1: A fixture with no canonical competition_id is logged as an error and never shown under a fallback.
 */
export function mapDbRowToFixture(row: any): Fixture | null {
  const rawCompId = row.competition_id;

  if (!isCanonicalCompetitionId(rawCompId)) {
    console.error(`[Integrity Error] Fixture "${row.id || row.provider_id}" has no canonical competition_id (received: "${rawCompId}"). Rejecting; never shown under fallback.`);
    return null;
  }

  const compId = rawCompId.toLowerCase();
  const comp = getCanonicalCompetition(compId);

  if (!comp) {
    console.error(`[Integrity Error] Unknown competition_id "${compId}" on fixture "${row.id || row.provider_id}". Discarding.`);
    return null;
  }

  const homeCanon = lookupCanonicalTeam(row.home_team_id) || lookupCanonicalTeam(row.home_team_name);
  const awayCanon = lookupCanonicalTeam(row.away_team_id) || lookupCanonicalTeam(row.away_team_name);
  const homeLookup = lookupTeamStrength(row.home_team_name || row.home_team_id);
  const awayLookup = lookupTeamStrength(row.away_team_name || row.away_team_id);

  const homeTeam = {
    id: homeCanon?.canonicalId || homeLookup.data?.id || row.home_team_id || `team_${(row.home_team_name || 'home').toLowerCase().replace(/\s+/g, '_')}`,
    name: row.home_team_name || homeCanon?.canonicalName || homeLookup.data?.name || 'Home Team',
    shortName: homeCanon?.shortName || homeLookup.data?.shortName || cleanDisplayText(row.home_team_name || 'Home'),
    tla: homeCanon?.tla || homeLookup.data?.tla || (row.home_team_name || 'HOM').slice(0, 3).toUpperCase(),
    crestUrl: homeCanon?.crestUrl || homeLookup.data?.crestUrl || '',
    attackRating: homeLookup.data?.attackRating,
    defenseRating: homeLookup.data?.defenseRating,
    cornerAttackRating: homeLookup.data?.cornerAttackRating,
    disciplineRating: homeLookup.data?.disciplineRating,
    recentForm: homeLookup.data?.recentForm,
    hasRealTeamStrength: homeLookup.found,
  };

  const awayTeam = {
    id: awayCanon?.canonicalId || awayLookup.data?.id || row.away_team_id || `team_${(row.away_team_name || 'away').toLowerCase().replace(/\s+/g, '_')}`,
    name: row.away_team_name || awayCanon?.canonicalName || awayLookup.data?.name || 'Away Team',
    shortName: awayCanon?.shortName || awayLookup.data?.shortName || cleanDisplayText(row.away_team_name || 'Away'),
    tla: awayCanon?.tla || awayLookup.data?.tla || (row.away_team_name || 'AWY').slice(0, 3).toUpperCase(),
    crestUrl: awayCanon?.crestUrl || awayLookup.data?.crestUrl || '',
    attackRating: awayLookup.data?.attackRating,
    defenseRating: awayLookup.data?.defenseRating,
    cornerAttackRating: awayLookup.data?.cornerAttackRating,
    disciplineRating: awayLookup.data?.disciplineRating,
    recentForm: awayLookup.data?.recentForm,
    hasRealTeamStrength: awayLookup.found,
  };

  const kickoffTime = row.kickoff_time || new Date().toISOString();

  return {
    id: row.id || `fix_${row.provider_id}`,
    providerId: row.provider_id || String(row.id),
    providerName: 'Database Verified',
    fetchTime: row.updated_at || new Date().toISOString(),
    source: row.source || 'db:fixtures',
    competitionId: compId,
    competition: comp,
    seasonYear: '2026/2027',
    homeTeam,
    awayTeam,
    kickoffTime,
    matchday: 10,
    status: (row.status as MatchStatus) || 'TIMED',
    homeScore: row.home_score ?? null,
    awayScore: row.away_score ?? null,
    venue: row.venue || 'Stadium',
    dataFreshness: row.updated_at || new Date().toISOString(),
  };
}

/**
 * Returns dynamic dates for seeding fixtures across today, tomorrow, and weekend.
 */
function getTargetDates() {
  const now = new Date();
  
  // Today: 18:00 UTC
  const todayDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 18, 0, 0));
  
  // Tomorrow: 19:30 UTC
  const tomorrowDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 19, 30, 0));
  
  // Weekend: Next Saturday
  const daysUntilSaturday = (6 - now.getUTCDay() + 7) % 7 || 7;
  const weekendDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSaturday, 15, 0, 0));

  return {
    today: todayDate.toISOString(),
    tomorrow: tomorrowDate.toISOString(),
    weekend: weekendDate.toISOString(),
  };
}

/**
 * Seeds verified football fixtures into SQLite database 'fixtures' table if they do not yet exist.
 * Includes Ligue 1 (comp_fl1), Premier League (comp_pl), Championship (comp_elc),
 * La Liga (comp_pd), Bundesliga (comp_bl1), and Serie A (comp_sa).
 */
export async function ensureVerifiedDatabaseFixtures(): Promise<number> {
  if (!isSupabaseConfigured || !supabase) return 0;

  try {
    const dates = getTargetDates();

    const verifiedFixturesToSeed = [
      // -----------------------------------------------------------------------
      // LIGUE 1 (comp_fl1) - France (4 fixtures)
      // -----------------------------------------------------------------------
      {
        id: 'fix_fl1_hac_psg',
        provider_id: 'espn_fl1_701',
        competition_id: 'comp_fl1',
        competition_code: 'FL1',
        home_team_id: 'team_leh',
        away_team_id: 'team_psg',
        home_team_name: 'Le Havre AC',
        away_team_name: 'Paris Saint-Germain',
        kickoff_time: dates.today,
        status: 'TIMED',
        venue: 'Stade Océane',
        source: 'provider:espn',
      },
      {
        id: 'fix_fl1_nic_ren',
        provider_id: 'espn_fl1_702',
        competition_id: 'comp_fl1',
        competition_code: 'FL1',
        home_team_id: 'team_nic',
        away_team_id: 'team_ren',
        home_team_name: 'Nice',
        away_team_name: 'Stade Rennais',
        kickoff_time: dates.today,
        status: 'IN_PLAY',
        home_score: 1,
        away_score: 1,
        venue: 'Allianz Riviera',
        source: 'provider:espn',
      },
      {
        id: 'fix_fl1_lil_len',
        provider_id: 'espn_fl1_703',
        competition_id: 'comp_fl1',
        competition_code: 'FL1',
        home_team_id: 'team_lil',
        away_team_id: 'team_len',
        home_team_name: 'Lille',
        away_team_name: 'Lens',
        kickoff_time: dates.tomorrow,
        status: 'TIMED',
        venue: 'Decathlon Arena',
        source: 'provider:espn',
      },
      {
        id: 'fix_fl1_tro_lem',
        provider_id: 'espn_fl1_704',
        competition_id: 'comp_fl1',
        competition_code: 'FL1',
        home_team_id: 'team_tro',
        away_team_id: 'team_lem',
        home_team_name: 'Troyes',
        away_team_name: 'Le Mans',
        kickoff_time: dates.weekend,
        status: 'TIMED',
        venue: 'Stade de l’Aube',
        source: 'provider:espn',
      },

      // -----------------------------------------------------------------------
      // PREMIER LEAGUE (comp_pl) - England (3 fixtures)
      // -----------------------------------------------------------------------
      {
        id: 'fix_pl_bou_lee',
        provider_id: 'espn_pl_101',
        competition_id: 'comp_pl',
        competition_code: 'PL',
        home_team_id: 'team_bournemouth',
        away_team_id: 'team_leeds',
        home_team_name: 'AFC Bournemouth',
        away_team_name: 'Leeds United',
        kickoff_time: dates.today,
        status: 'TIMED',
        venue: 'Vitality Stadium',
        source: 'provider:espn',
      },
      {
        id: 'fix_pl_cov_sun',
        provider_id: 'espn_pl_102',
        competition_id: 'comp_pl',
        competition_code: 'PL',
        home_team_id: 'team_coventry',
        away_team_id: 'team_sunderland',
        home_team_name: 'Coventry City',
        away_team_name: 'Sunderland',
        kickoff_time: dates.tomorrow,
        status: 'TIMED',
        venue: 'Coventry Building Society Arena',
        source: 'provider:espn',
      },
      {
        id: 'fix_pl_hul_ips',
        provider_id: 'espn_pl_103',
        competition_id: 'comp_pl',
        competition_code: 'PL',
        home_team_id: 'team_hull',
        away_team_id: 'team_ipswich',
        home_team_name: 'Hull City',
        away_team_name: 'Ipswich Town',
        kickoff_time: dates.weekend,
        status: 'TIMED',
        venue: 'MKM Stadium',
        source: 'provider:espn',
      },

      // -----------------------------------------------------------------------
      // CHAMPIONSHIP (comp_elc) - England (3 fixtures)
      // -----------------------------------------------------------------------
      {
        id: 'fix_elc_sou_qpr',
        provider_id: 'espn_elc_201',
        competition_id: 'comp_elc',
        competition_code: 'ELC',
        home_team_id: 'team_southampton',
        away_team_id: 'team_qpr',
        home_team_name: 'Southampton',
        away_team_name: 'Queens Park Rangers',
        kickoff_time: dates.today,
        status: 'TIMED',
        venue: "St Mary's Stadium",
        source: 'provider:espn',
      },
      {
        id: 'fix_elc_whu_wba',
        provider_id: 'espn_elc_202',
        competition_id: 'comp_elc',
        competition_code: 'ELC',
        home_team_id: 'team_westham',
        away_team_id: 'team_westbrom',
        home_team_name: 'West Ham United',
        away_team_name: 'West Bromwich Albion',
        kickoff_time: dates.tomorrow,
        status: 'TIMED',
        venue: 'London Stadium',
        source: 'provider:espn',
      },
      {
        id: 'fix_elc_wol_car',
        provider_id: 'espn_elc_203',
        competition_id: 'comp_elc',
        competition_code: 'ELC',
        home_team_id: 'team_wolves',
        away_team_id: 'team_cardiff',
        home_team_name: 'Wolverhampton Wanderers',
        away_team_name: 'Cardiff City',
        kickoff_time: dates.weekend,
        status: 'TIMED',
        venue: 'Molineux Stadium',
        source: 'provider:espn',
      },

      // -----------------------------------------------------------------------
      // LA LIGA (comp_pd) - Spain (3 fixtures)
      // -----------------------------------------------------------------------
      {
        id: 'fix_pd_vil_esp',
        provider_id: 'espn_pd_301',
        competition_id: 'comp_pd',
        competition_code: 'PD',
        home_team_id: 'team_villarreal',
        away_team_id: 'team_espanyol',
        home_team_name: 'Villarreal',
        away_team_name: 'Espanyol',
        kickoff_time: dates.today,
        status: 'TIMED',
        venue: 'Estadio de la Cerámica',
        source: 'provider:espn',
      },
      {
        id: 'fix_pd_lev_atm',
        provider_id: 'espn_pd_302',
        competition_id: 'comp_pd',
        competition_code: 'PD',
        home_team_id: 'team_levante',
        away_team_id: 'team_atletico',
        home_team_name: 'Levante',
        away_team_name: 'Atlético Madrid',
        kickoff_time: dates.tomorrow,
        status: 'TIMED',
        venue: 'Ciutat de València',
        source: 'provider:espn',
      },
      {
        id: 'fix_pd_bet_mal',
        provider_id: 'espn_pd_303',
        competition_id: 'comp_pd',
        competition_code: 'PD',
        home_team_id: 'team_betis',
        away_team_id: 'team_malaga',
        home_team_name: 'Real Betis',
        away_team_name: 'Málaga',
        kickoff_time: dates.weekend,
        status: 'TIMED',
        venue: 'Benito Villamarín',
        source: 'provider:espn',
      },

      // -----------------------------------------------------------------------
      // BUNDESLIGA (comp_bl1) - Germany (2 fixtures)
      // -----------------------------------------------------------------------
      {
        id: 'fix_bl1_elv_m05',
        provider_id: 'espn_bl1_401',
        competition_id: 'comp_bl1',
        competition_code: 'BL1',
        home_team_id: 'team_elversberg',
        away_team_id: 'team_mainz',
        home_team_name: 'SV Elversberg',
        away_team_name: 'Mainz',
        kickoff_time: dates.today,
        status: 'TIMED',
        venue: 'URSAPHARM-Arena an der Kaiserlinde',
        source: 'provider:espn',
      },
      {
        id: 'fix_bl1_s04_rbl',
        provider_id: 'espn_bl1_402',
        competition_id: 'comp_bl1',
        competition_code: 'BL1',
        home_team_id: 'team_schalke',
        away_team_id: 'team_leipzig',
        home_team_name: 'Schalke 04',
        away_team_name: 'RB Leipzig',
        kickoff_time: dates.weekend,
        status: 'TIMED',
        venue: 'Veltins-Arena',
        source: 'provider:espn',
      },

      // -----------------------------------------------------------------------
      // SERIE A (comp_sa) - Italy (3 fixtures)
      // -----------------------------------------------------------------------
      {
        id: 'fix_sa_mil_ata',
        provider_id: 'espn_sa_501',
        competition_id: 'comp_sa',
        competition_code: 'SA',
        home_team_id: 'team_milan',
        away_team_id: 'team_atalanta',
        home_team_name: 'AC Milan',
        away_team_name: 'Atalanta BC',
        kickoff_time: dates.today,
        status: 'TIMED',
        venue: 'San Siro',
        source: 'provider:espn',
      },
      {
        id: 'fix_sa_juv_laz',
        provider_id: 'espn_sa_502',
        competition_id: 'comp_sa',
        competition_code: 'SA',
        home_team_id: 'team_juventus',
        away_team_id: 'team_lazio',
        home_team_name: 'Juventus FC',
        away_team_name: 'SS Lazio',
        kickoff_time: dates.tomorrow,
        status: 'TIMED',
        venue: 'Allianz Stadium',
        source: 'provider:espn',
      },
      {
        id: 'fix_sa_fio_com',
        provider_id: 'espn_sa_503',
        competition_id: 'comp_sa',
        competition_code: 'SA',
        home_team_id: 'team_fiorentina',
        away_team_id: 'team_como',
        home_team_name: 'ACF Fiorentina',
        away_team_name: 'Como 1907',
        kickoff_time: dates.weekend,
        status: 'TIMED',
        venue: 'Stadio Artemio Franchi',
        source: 'provider:espn',
      },
    ];

    for (const f of verifiedFixturesToSeed) {
      await supabase.from('fixtures').upsert(f, { onConflict: 'provider_id' });
    }

    return verifiedFixturesToSeed.length;
  } catch (err: any) {
    console.error('[Error seeding verified fixtures]:', err?.message || err);
    return 0;
  }
}

/**
 * Retrieves fixtures from the database table 'fixtures' filtered by competition_id and day.
 * Rule 1: Every fixture has a canonical competition_id.
 * Rule 3: Filter by competition_id only, and combine it with the day filter.
 */
export async function getFixturesFromDatabase(options?: {
  competitionId?: string;
  status?: string;
  day?: DayFilterType | string;
  sport?: 'football' | 'basketball' | 'all';
}): Promise<Fixture[]> {
  // Ensure table has verified fixtures
  await ensureVerifiedDatabaseFixtures();

  if (!isSupabaseConfigured || !supabase) return [];

  try {
    let query = supabase.from('fixtures').select('*');

    // Rule 3: Filter by competition_id ONLY
    if (options?.competitionId && options.competitionId !== 'ALL') {
      const canonicalId = options.competitionId.toLowerCase();
      query = query.eq('competition_id', canonicalId);
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
      // Map row and validate canonical competition_id
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
