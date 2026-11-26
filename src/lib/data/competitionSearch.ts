// CALIBRALL: Client-Safe Canonical Competitions Catalog, Accent/Alias Search & Day-Scoped Grouping
// Pure module with ZERO database or Node.js imports so Client Components and Server APIs share one truth.

import type { Competition, Fixture, Sport } from '@/types';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { matchesDayFilter, type DayFilterType } from '@/lib/utils/dateWindow';

export interface CompetitionWithCount extends Competition {
  sport: Sport;
  aliases: string[];
  sortOrder: number;
  fixtureCount: number;
  storedMatchCount?: number;
  hasFreeFixturesSource: boolean;
  freeFixturesProvider: string | null;
}

export interface CountryCompetitionGroup {
  country: string;
  competitions: CompetitionWithCount[];
}

export interface UnmappedFixtureEntry {
  id: string;
  providerId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  rawCompetitionId: string | null;
  rawCompetitionCode: string | null;
  source: string;
  kickoffTime: string | null;
  reason: string;
}

export const CANONICAL_COMPETITIONS_CATALOG: Record<string, Competition> = {
  comp_pl: {
    id: 'comp_pl',
    code: 'PL',
    name: 'Premier League',
    country: 'England',
    sport: 'football',
    aliases: ['epl', 'england', 'english premier league', 'premiership', 'barclays premier league', 'e0', 'eng.1'],
    sortOrder: 10,
    emblemUrl: 'https://crests.football-data.org/PL.png',
    tier: 1,
    avgGoalsPerGame: 2.88,
    avgCornersPerGame: 10.45,
    avgCardsPerGame: 4.12,
    isActive: true,
  },
  comp_cl: {
    id: 'comp_cl',
    code: 'CL',
    name: 'UEFA Champions League',
    country: 'Europe',
    sport: 'football',
    aliases: ['ucl', 'champions league', 'uefa cl', 'european cup', 'uefa.champions'],
    sortOrder: 12,
    emblemUrl: 'https://crests.football-data.org/CL.png',
    tier: 1,
    avgGoalsPerGame: 3.02,
    avgCornersPerGame: 9.85,
    avgCardsPerGame: 3.95,
    isActive: true,
  },
  comp_pd: {
    id: 'comp_pd',
    code: 'PD',
    name: 'La Liga',
    country: 'Spain',
    sport: 'football',
    aliases: ['laliga', 'spain', 'spanish la liga', 'primera division', 'laliga ea sports', 'sp1', 'esp.1'],
    sortOrder: 15,
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
    sport: 'football',
    aliases: ['bundes', 'germany', 'german bundesliga', '1. bundesliga', 'd1', 'ger.1', 'ger bi', 'ger b1'],
    sortOrder: 20,
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
    sport: 'football',
    aliases: ['italy', 'italian serie a', 'calcio', 'serie a enilive', 'i1', 'ita.1'],
    sortOrder: 25,
    emblemUrl: 'https://crests.football-data.org/SA.png',
    tier: 1,
    avgGoalsPerGame: 2.62,
    avgCornersPerGame: 9.60,
    avgCardsPerGame: 4.50,
    isActive: true,
  },
  comp_fl1: {
    id: 'comp_fl1',
    code: 'FL1',
    name: 'Ligue 1',
    country: 'France',
    sport: 'football',
    aliases: ['france', 'french ligue 1', 'ligue 1 mcdonalds', 'f1', 'fra.1'],
    sortOrder: 30,
    emblemUrl: 'https://crests.football-data.org/FL1.png',
    tier: 1,
    avgGoalsPerGame: 2.70,
    avgCornersPerGame: 9.75,
    avgCardsPerGame: 3.85,
    isActive: true,
  },
  comp_elc: {
    id: 'comp_elc',
    code: 'ELC',
    name: 'Championship',
    country: 'England',
    sport: 'football',
    aliases: ['efl championship', 'england', 'english championship', 'e1', 'eng.2'],
    sortOrder: 35,
    emblemUrl: 'https://crests.football-data.org/ELC.png',
    tier: 2,
    avgGoalsPerGame: 2.65,
    avgCornersPerGame: 10.20,
    avgCardsPerGame: 4.25,
    isActive: true,
  },
  comp_ded: {
    id: 'comp_ded',
    code: 'DED',
    name: 'Eredivisie',
    country: 'Netherlands',
    sport: 'football',
    aliases: ['netherlands', 'holland', 'dutch eredivisie', 'n1', 'ned.1'],
    sortOrder: 40,
    emblemUrl: 'https://crests.football-data.org/DED.png',
    tier: 1,
    avgGoalsPerGame: 3.05,
    avgCornersPerGame: 10.35,
    avgCardsPerGame: 3.65,
    isActive: true,
  },
  comp_ppl: {
    id: 'comp_ppl',
    code: 'PPL',
    name: 'Primeira Liga',
    country: 'Portugal',
    sport: 'football',
    aliases: ['portugal', 'liga portugal', 'p1', 'por.1'],
    sortOrder: 45,
    emblemUrl: 'https://crests.football-data.org/PPL.png',
    tier: 1,
    avgGoalsPerGame: 2.62,
    avgCornersPerGame: 9.90,
    avgCardsPerGame: 4.80,
    isActive: true,
  },
  comp_bsa: {
    id: 'comp_bsa',
    code: 'BSA',
    name: 'Campeonato Brasileiro Série A',
    country: 'Brazil',
    sport: 'football',
    aliases: [
      'brasileirao',
      'brasileirao serie a',
      'brazil',
      'brasil',
      'serie a brazil',
      'sao',
      'sao paulo',
      'rio',
      'bra',
      'bra.1',
    ],
    sortOrder: 50,
    emblemUrl: 'https://crests.football-data.org/BSA.png',
    tier: 1,
    avgGoalsPerGame: 2.48,
    avgCornersPerGame: 9.80,
    avgCardsPerGame: 4.90,
    isActive: true,
  },
  comp_cli: {
    id: 'comp_cli',
    code: 'CLI',
    name: 'Copa Libertadores',
    country: 'South America',
    sport: 'football',
    aliases: ['libertadores', 'conmebol libertadores', 'south america'],
    sortOrder: 55,
    emblemUrl: 'https://crests.football-data.org/CLI.svg',
    tier: 2,
    avgGoalsPerGame: 2.45,
    avgCornersPerGame: 9.60,
    avgCardsPerGame: 5.10,
    isActive: true,
  },
  comp_sc0: {
    id: 'comp_sc0',
    code: 'SC0',
    name: 'Scottish Premiership',
    country: 'Scotland',
    sport: 'football',
    aliases: ['scotland', 'spfl', 'scottish prem', 'sco.1', 'sco p', 'sp'],
    sortOrder: 60,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.74,
    avgCornersPerGame: 10.10,
    avgCardsPerGame: 4.05,
    isActive: true,
  },
  comp_dnk: {
    id: 'comp_dnk',
    code: 'DNK',
    name: 'Danish Superliga',
    country: 'Denmark',
    sport: 'football',
    aliases: ['denmark', 'superligaen', '3f superliga', 'den.1', 'dnk sl'],
    sortOrder: 65,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.82,
    avgCornersPerGame: 9.70,
    avgCardsPerGame: 3.85,
    isActive: true,
  },
  comp_tsl: {
    id: 'comp_tsl',
    code: 'TSL',
    name: 'Süper Lig',
    country: 'Turkey',
    sport: 'football',
    aliases: ['turkey', 'turkiye', 'super lig', 'trendyol super lig', 't1', 'tur.1'],
    sortOrder: 70,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.78,
    avgCornersPerGame: 9.60,
    avgCardsPerGame: 4.70,
    isActive: true,
  },
  comp_b1: {
    id: 'comp_b1',
    code: 'B1',
    name: 'Belgian Pro League',
    country: 'Belgium',
    sport: 'football',
    aliases: ['belgium', 'jupiler pro league', 'bel.1'],
    sortOrder: 75,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.85,
    avgCornersPerGame: 10.10,
    avgCardsPerGame: 4.00,
    isActive: true,
  },
  comp_aut: {
    id: 'comp_aut',
    code: 'AUT',
    name: 'Austrian Bundesliga',
    country: 'Austria',
    sport: 'football',
    aliases: ['austria', 'admiral bundesliga', 'aut.1'],
    sortOrder: 80,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.95,
    avgCornersPerGame: 9.80,
    avgCardsPerGame: 4.20,
    isActive: true,
  },
  comp_d2: {
    id: 'comp_d2',
    code: 'D2',
    name: '2. Bundesliga',
    country: 'Germany',
    sport: 'football',
    aliases: ['germany', 'zweite bundesliga', '2 bundesliga', 'ger.2'],
    sortOrder: 85,
    emblemUrl: '',
    tier: 2,
    avgGoalsPerGame: 3.00,
    avgCornersPerGame: 10.00,
    avgCardsPerGame: 4.10,
    isActive: true,
  },
  comp_sp2: {
    id: 'comp_sp2',
    code: 'SP2',
    name: 'Segunda División',
    country: 'Spain',
    sport: 'football',
    aliases: ['spain', 'laliga 2', 'segunda division', 'esp.2'],
    sortOrder: 90,
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
    sport: 'football',
    aliases: ['italy', 'ita.2'],
    sortOrder: 95,
    emblemUrl: '',
    tier: 2,
    avgGoalsPerGame: 2.45,
    avgCornersPerGame: 9.50,
    avgCardsPerGame: 4.75,
    isActive: true,
  },
  comp_f2: {
    id: 'comp_f2',
    code: 'F2',
    name: 'Ligue 2',
    country: 'France',
    sport: 'football',
    aliases: ['france', 'fra.2'],
    sortOrder: 100,
    emblemUrl: '',
    tier: 2,
    avgGoalsPerGame: 2.38,
    avgCornersPerGame: 9.30,
    avgCardsPerGame: 3.95,
    isActive: true,
  },
  comp_e2: {
    id: 'comp_e2',
    code: 'E2',
    name: 'League One',
    country: 'England',
    sport: 'football',
    aliases: ['england', 'efl league one', 'eng.3'],
    sortOrder: 105,
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
    sport: 'football',
    aliases: ['england', 'efl league two', 'eng.4'],
    sortOrder: 110,
    emblemUrl: 'https://crests.football-data.org/ED.png',
    tier: 4,
    avgGoalsPerGame: 2.58,
    avgCornersPerGame: 10.05,
    avgCardsPerGame: 4.20,
    isActive: true,
  },
  comp_eng_national_league: {
    id: 'comp_eng_national_league',
    code: 'EC',
    name: 'National League',
    country: 'England',
    sport: 'football',
    aliases: ['england', 'vanarama national league', 'eng.5', 'ec'],
    sortOrder: 115,
    emblemUrl: '',
    tier: 5,
    avgGoalsPerGame: 2.65,
    avgCornersPerGame: 9.90,
    avgCardsPerGame: 3.90,
    isActive: true,
  },
  comp_g1: {
    id: 'comp_g1',
    code: 'G1',
    name: 'Super League Greece',
    country: 'Greece',
    sport: 'football',
    aliases: ['greece', 'gre.1'],
    sortOrder: 120,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.42,
    avgCornersPerGame: 9.10,
    avgCardsPerGame: 4.85,
    isActive: true,
  },
  comp_nor: {
    id: 'comp_nor',
    code: 'NOR',
    name: 'Eliteserien',
    country: 'Norway',
    sport: 'football',
    aliases: ['norway', 'nor.1'],
    sortOrder: 125,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.95,
    avgCornersPerGame: 10.10,
    avgCardsPerGame: 3.60,
    isActive: true,
  },
  comp_swe: {
    id: 'comp_swe',
    code: 'SWE',
    name: 'Allsvenskan',
    country: 'Sweden',
    sport: 'football',
    aliases: ['sweden', 'swe.1'],
    sortOrder: 130,
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
    sport: 'football',
    aliases: ['switzerland', 'sui', 'sui.1'],
    sortOrder: 135,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.92,
    avgCornersPerGame: 9.90,
    avgCardsPerGame: 4.25,
    isActive: true,
  },
  comp_pol: {
    id: 'comp_pol',
    code: 'POL',
    name: 'Ekstraklasa',
    country: 'Poland',
    sport: 'football',
    aliases: ['poland', 'pol.1'],
    sortOrder: 140,
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
    sport: 'football',
    aliases: ['romania', 'superliga romania', 'rom', 'rou.1'],
    sortOrder: 145,
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
    sport: 'football',
    aliases: ['russia', 'rpl', 'rus.1'],
    sortOrder: 150,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.55,
    avgCornersPerGame: 9.50,
    avgCardsPerGame: 4.40,
    isActive: true,
  },
  comp_sc1: {
    id: 'comp_sc1',
    code: 'SC1',
    name: 'Scottish Championship',
    country: 'Scotland',
    sport: 'football',
    aliases: ['scotland', 'sco.2'],
    sortOrder: 155,
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
    sport: 'football',
    aliases: ['scotland', 'sco.3'],
    sortOrder: 160,
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
    sport: 'football',
    aliases: ['scotland', 'sco.4'],
    sortOrder: 165,
    emblemUrl: '',
    tier: 4,
    avgGoalsPerGame: 2.75,
    avgCornersPerGame: 9.75,
    avgCardsPerGame: 4.00,
    isActive: true,
  },
  comp_irl: {
    id: 'comp_irl',
    code: 'IRL',
    name: 'League of Ireland Premier Division',
    country: 'Ireland',
    sport: 'football',
    aliases: ['ireland', 'loi', 'irl.1'],
    sortOrder: 170,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.45,
    avgCornersPerGame: 9.60,
    avgCardsPerGame: 4.10,
    isActive: true,
  },
  comp_fin: {
    id: 'comp_fin',
    code: 'FIN',
    name: 'Veikkausliiga',
    country: 'Finland',
    sport: 'football',
    aliases: ['finland', 'fin.1'],
    sortOrder: 175,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.75,
    avgCornersPerGame: 9.40,
    avgCardsPerGame: 3.70,
    isActive: true,
  },
  comp_usa: {
    id: 'comp_usa',
    code: 'USA',
    name: 'Major League Soccer',
    country: 'USA',
    sport: 'football',
    aliases: ['mls', 'united states', 'america', 'usa.1'],
    sortOrder: 180,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.95,
    avgCornersPerGame: 9.80,
    avgCardsPerGame: 4.00,
    isActive: true,
  },
  comp_mex: {
    id: 'comp_mex',
    code: 'MEX',
    name: 'Liga MX',
    country: 'Mexico',
    sport: 'football',
    aliases: ['mexico', 'mex.1'],
    sortOrder: 185,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.70,
    avgCornersPerGame: 9.50,
    avgCardsPerGame: 4.50,
    isActive: true,
  },
  comp_arg: {
    id: 'comp_arg',
    code: 'ARG',
    name: 'Liga Profesional',
    country: 'Argentina',
    sport: 'football',
    aliases: ['argentina', 'primera division argentina', 'arg.1'],
    sortOrder: 190,
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
    sport: 'football',
    aliases: ['japan', 'j league', 'j1 league', 'jpn.1'],
    sortOrder: 195,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.60,
    avgCornersPerGame: 9.30,
    avgCardsPerGame: 3.10,
    isActive: true,
  },
  comp_chn: {
    id: 'comp_chn',
    code: 'CHN',
    name: 'Chinese Super League',
    country: 'China',
    sport: 'football',
    aliases: ['china', 'csl', 'chn.1'],
    sortOrder: 200,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 2.80,
    avgCornersPerGame: 9.50,
    avgCardsPerGame: 3.90,
    isActive: true,
  },
  comp_euro: {
    id: 'comp_euro',
    code: 'EURO',
    name: 'UEFA European Championship',
    country: 'Europe',
    sport: 'football',
    aliases: ['euro', 'euros', 'uefa euro', 'euro championship'],
    sortOrder: 205,
    emblemUrl: 'https://crests.football-data.org/ec.png',
    tier: 1,
    avgGoalsPerGame: 2.55,
    avgCornersPerGame: 9.80,
    avgCardsPerGame: 3.90,
    isActive: true,
  },
  comp_wc: {
    id: 'comp_wc',
    code: 'WC',
    name: 'FIFA World Cup',
    country: 'World',
    sport: 'football',
    aliases: ['world cup', 'fifa wc', 'mundial'],
    sortOrder: 210,
    emblemUrl: 'https://crests.football-data.org/qatar.png',
    tier: 1,
    avgGoalsPerGame: 2.65,
    avgCornersPerGame: 9.70,
    avgCardsPerGame: 3.80,
    isActive: true,
  },
  comp_nba: {
    id: 'comp_nba',
    code: 'NBA',
    name: 'National Basketball Association',
    country: 'USA',
    sport: 'basketball',
    aliases: ['nba', 'usa basketball', 'pro basketball', 'us'],
    sortOrder: 10,
    emblemUrl: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
    tier: 1,
    avgGoalsPerGame: 226.4,
    avgCornersPerGame: 0,
    avgCardsPerGame: 0,
    isActive: true,
  },
  comp_ncaab: {
    id: 'comp_ncaab',
    code: 'NCAAB',
    name: 'NCAA Men Division I',
    country: 'USA',
    sport: 'basketball',
    aliases: ['ncaab', 'ncaa', 'march madness', 'college basketball', 'ncaa men'],
    sortOrder: 20,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 149.8,
    avgCornersPerGame: 0,
    avgCardsPerGame: 0,
    isActive: true,
  },
  comp_euroleague: {
    id: 'comp_euroleague',
    code: 'EUROLEAGUE',
    name: 'EuroLeague',
    country: 'Europe',
    sport: 'basketball',
    aliases: ['euroleague', 'euro league', 'european basketball', 'el'],
    sortOrder: 30,
    emblemUrl: '',
    tier: 1,
    avgGoalsPerGame: 172.8,
    avgCornersPerGame: 0,
    avgCardsPerGame: 0,
    isActive: true,
  },
};

export function isBasketballCompetitionId(compId: string): boolean {
  const clean = compId.trim().toLowerCase();
  const entry = CANONICAL_COMPETITIONS_CATALOG[clean];
  if (entry?.sport) return entry.sport === 'basketball';
  return clean === 'comp_nba' || clean === 'comp_ncaab' || clean === 'comp_euroleague';
}

/**
 * Case- and accent-insensitive normalization for search queries, team names, countries, and aliases.
 */
export function normalizeSearchText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[._\-\/'’`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function competitionMatchesSearch(
  comp: Pick<Competition, 'id' | 'code' | 'name' | 'country'> & { aliases?: string[] },
  rawQuery: string
): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;

  const catalogMeta = CANONICAL_COMPETITIONS_CATALOG[comp.id?.toLowerCase() || ''];
  const aliases = Array.from(
    new Set([...(comp.aliases || []), ...(catalogMeta?.aliases || [])])
  );

  const fields = [comp.name, comp.country, comp.code, comp.id, ...aliases]
    .map((f) => normalizeSearchText(f))
    .filter(Boolean);

  if (fields.some((f) => f.includes(q))) {
    return true;
  }

  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    const joined = fields.join(' ');
    return tokens.every((t) => joined.includes(t));
  }

  return false;
}

export function fixtureMatchesSearchQuery(fixture: Fixture, rawQuery: string): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;

  const comp = fixture.competition;
  const catalogMeta = CANONICAL_COMPETITIONS_CATALOG[(fixture.competitionId || comp?.id || '').toLowerCase()];
  const compAliases = Array.from(
    new Set([...(comp?.aliases || []), ...(catalogMeta?.aliases || [])])
  );

  const candidateFields = [
    fixture.homeTeam?.name,
    fixture.homeTeam?.shortName,
    fixture.homeTeam?.tla,
    fixture.awayTeam?.name,
    fixture.awayTeam?.shortName,
    fixture.awayTeam?.tla,
    comp?.name,
    comp?.country,
    comp?.code,
    fixture.basketballStats?.league,
    ...compAliases,
  ]
    .map((v) => normalizeSearchText(v))
    .filter(Boolean);

  if (candidateFields.some((f) => f.includes(q))) {
    return true;
  }

  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    const joined = candidateFields.join(' ');
    return tokens.every((t) => joined.includes(t));
  }

  return false;
}

/**
 * Pure client/server helper to compute canonical country-grouped competition counts directly from loaded fixtures
 * plus the canonical competition catalog, scoped to `sport` and `day`.
 */
export function buildCompetitionGroupsFromFixtures(options: {
  fixtures: Fixture[];
  sport?: Sport | 'all';
  day?: DayFilterType | string;
  existingCatalog?: CompetitionWithCount[];
  hideZeroFixtures?: boolean;
}): {
  competitions: CompetitionWithCount[];
  groupedByCountry: CountryCompetitionGroup[];
  totalFixtures: number;
} {
  const { fixtures, sport = 'football', day = 'ALL', existingCatalog, hideZeroFixtures = true } = options;

  const countsById = new Map<string, number>();
  for (const f of fixtures) {
    const rawId = (f.competitionId || f.competition?.id || '').trim().toLowerCase();
    if (!rawId || !CANONICAL_COMPETITIONS_CATALOG[rawId]) continue;
    const isBb = isBasketballCompetitionId(rawId) || f.sport === 'basketball';
    if (sport === 'football' && isBb) continue;
    if (sport === 'basketball' && !isBb) continue;
    if (day && day !== 'ALL' && !matchesDayFilter(f.kickoffTime, day)) continue;
    countsById.set(rawId, (countsById.get(rawId) || 0) + 1);
  }

  const catalogById = new Map<string, CompetitionWithCount>();
  if (Array.isArray(existingCatalog)) {
    for (const item of existingCatalog) {
      catalogById.set(item.id.toLowerCase(), item);
    }
  }

  for (const base of Object.values(CANONICAL_COMPETITIONS_CATALOG)) {
    const compSport: Sport = base.sport || (isBasketballCompetitionId(base.id) ? 'basketball' : 'football');
    if (sport === 'football' && compSport !== 'football') continue;
    if (sport === 'basketball' && compSport !== 'basketball') continue;

    const existing = catalogById.get(base.id.toLowerCase());
    if (!existing) {
      catalogById.set(base.id.toLowerCase(), {
        ...base,
        sport: compSport,
        aliases: base.aliases || [],
        sortOrder: base.sortOrder ?? 100,
        name: cleanDisplayText(base.name),
        fixtureCount: 0,
        hasFreeFixturesSource: true,
        freeFixturesProvider: null,
      });
    }
  }

  const competitions: CompetitionWithCount[] = [];
  let totalFixtures = 0;

  for (const [id, meta] of catalogById.entries()) {
    const compSport: Sport = meta.sport || (isBasketballCompetitionId(id) ? 'basketball' : 'football');
    if (sport === 'football' && compSport !== 'football') continue;
    if (sport === 'basketball' && compSport !== 'basketball') continue;

    const fixtureCount = countsById.get(id) ?? 0;
    if (hideZeroFixtures && fixtureCount === 0) continue;

    totalFixtures += fixtureCount;
    competitions.push({
      ...meta,
      sport: compSport,
      aliases: Array.from(new Set([...(meta.aliases || []), ...(CANONICAL_COMPETITIONS_CATALOG[id]?.aliases || [])])),
      sortOrder: meta.sortOrder ?? CANONICAL_COMPETITIONS_CATALOG[id]?.sortOrder ?? 100,
      name: cleanDisplayText(meta.name),
      fixtureCount,
    });
  }

  competitions.sort((a, b) => {
    if ((a.fixtureCount > 0) !== (b.fixtureCount > 0)) {
      return a.fixtureCount > 0 ? -1 : 1;
    }
    return (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.tier - b.tier || a.name.localeCompare(b.name);
  });

  const byCountry = new Map<string, CompetitionWithCount[]>();
  for (const comp of competitions) {
    const arr = byCountry.get(comp.country) || [];
    arr.push(comp);
    byCountry.set(comp.country, arr);
  }

  const groupedByCountry: CountryCompetitionGroup[] = Array.from(byCountry.entries())
    .map(([country, list]) => ({
      country,
      competitions: list.sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const minA = Math.min(...a.competitions.map((c) => c.sortOrder ?? 100));
      const minB = Math.min(...b.competitions.map((c) => c.sortOrder ?? 100));
      if (minA !== minB) return minA - minB;
      return a.country.localeCompare(b.country);
    });

  return {
    competitions,
    groupedByCountry,
    totalFixtures,
  };
}
