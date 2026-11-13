import { lookupTeamStrength } from './teamDatabase';
import { lookupCanonicalTeam, recordUnresolvedTeam } from './canonicalTeams';

// CALIBRALL: Backfill Catalog, Timezone Parser & Idempotent ID Utility

export const DIVISION_MAP: Record<string, string> = {
  // England
  E0: 'E0',
  E1: 'E1',
  E2: 'E2',
  E3: 'E3',
  EC: 'EC',
  // Scotland
  SC0: 'SC0',
  SC1: 'SC1',
  SC2: 'SC2',
  SC3: 'SC3',
  // Spain, Italy, Germany, France
  SP1: 'SP1',
  SP2: 'SP2',
  I1: 'I1',
  I2: 'I2',
  D1: 'D1',
  D2: 'D2',
  F1: 'F1',
  F2: 'F2',
  // Other European seasonal divisions
  N1: 'N1',
  B1: 'B1',
  P1: 'P1',
  T1: 'T1',
  G1: 'G1',
  // Standard aliases
  PL: 'E0',
  ELC: 'E1',
  PD: 'SP1',
  BL1: 'D1',
  SA: 'I1',
  FL1: 'F1',
  DED: 'N1',
  PPL: 'P1',
  TSL: 'T1',
  SP: 'SC0',
};

// Clubs newly promoted from Brazil Série B into Brazil Série A 2026 (no free Série B CSV available)
export const PROMOTED_BRAZIL_2026_IDS = new Set<string>([
  'team_athleticopr',
  'team_chapecoense',
  'team_coritiba',
  'team_remo',
]);

// Extra Leagues hosted as single continuous CSV files at https://football-data.co.uk/new/{CODE}.csv
export const EXTRA_LEAGUES_MAP: Record<string, string> = {
  ARG: 'ARG',
  AUT: 'AUT',
  BSA: 'BRA',
  BRA: 'BRA',
  CHN: 'CHN',
  DNK: 'DNK',
  FIN: 'FIN',
  IRL: 'IRL',
  JPN: 'JPN',
  MEX: 'MEX',
  NOR: 'NOR',
  POL: 'POL',
  ROU: 'ROU',
  ROM: 'ROU',
  RUS: 'RUS',
  SWE: 'SWE',
  SWZ: 'SWZ',
  SUI: 'SWZ',
  USA: 'USA',
};

export interface LeagueMetadata {
  code: string;
  name: string;
  country: string;
  divisionCode: string;
  sourceType: 'seasonal' | 'extra_file';
  hasCorners: boolean;
  hasCards: boolean;
  hasHalfTimeGoals: boolean;
  hasReferee: boolean;
  hasAsianHandicapPrices: boolean;
  liveDataSource: string;
  coverageNotes: string;
}

export const LEAGUE_METADATA: Record<string, LeagueMetadata> = {
  E0: { code: 'E0', name: 'Premier League', country: 'England', divisionCode: 'E0', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: true, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Full match stats + corners + cards + HT goals + referee + AH prices' },
  E1: { code: 'E1', name: 'Championship', country: 'England', divisionCode: 'E1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: true, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Full match stats + corners + cards + HT goals + referee + AH prices' },
  E2: { code: 'E2', name: 'League One', country: 'England', divisionCode: 'E2', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: true, hasAsianHandicapPrices: true, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Full match stats + corners + cards + HT goals + referee + AH prices' },
  E3: { code: 'E3', name: 'League Two', country: 'England', divisionCode: 'E3', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: true, hasAsianHandicapPrices: true, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Full match stats + corners + cards + HT goals + referee + AH prices' },
  EC: { code: 'EC', name: 'National League', country: 'England', divisionCode: 'EC', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: true, hasAsianHandicapPrices: true, liveDataSource: 'ESPN', coverageNotes: 'Cards + HT goals + referee + AH prices across all seasons; corners in 2627 only' },
  SC0: { code: 'SC0', name: 'Scottish Premiership', country: 'Scotland', divisionCode: 'SC0', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: true, hasAsianHandicapPrices: true, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Full match stats + corners + cards + HT goals + referee + AH prices' },
  SC1: { code: 'SC1', name: 'Scottish Championship', country: 'Scotland', divisionCode: 'SC1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: true, hasAsianHandicapPrices: true, liveDataSource: 'ESPN', coverageNotes: 'Full match stats + corners + cards + HT goals + referee + AH prices' },
  SC2: { code: 'SC2', name: 'Scottish League One', country: 'Scotland', divisionCode: 'SC2', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: true, hasAsianHandicapPrices: true, liveDataSource: 'ESPN (limited/stale)', coverageNotes: 'Full match stats + corners + cards + HT goals + referee + AH prices' },
  SC3: { code: 'SC3', name: 'Scottish League Two', country: 'Scotland', divisionCode: 'SC3', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: true, hasAsianHandicapPrices: true, liveDataSource: 'ESPN (limited/stale)', coverageNotes: 'Full match stats + corners + cards + HT goals + referee + AH prices' },
  SP1: { code: 'SP1', name: 'La Liga', country: 'Spain', divisionCode: 'SP1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  SP2: { code: 'SP2', name: 'Segunda División', country: 'Spain', divisionCode: 'SP2', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  I1: { code: 'I1', name: 'Serie A', country: 'Italy', divisionCode: 'I1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  I2: { code: 'I2', name: 'Serie B', country: 'Italy', divisionCode: 'I2', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  D1: { code: 'D1', name: 'Bundesliga', country: 'Germany', divisionCode: 'D1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  D2: { code: 'D2', name: '2. Bundesliga', country: 'Germany', divisionCode: 'D2', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  F1: { code: 'F1', name: 'Ligue 1', country: 'France', divisionCode: 'F1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  F2: { code: 'F2', name: 'Ligue 2', country: 'France', divisionCode: 'F2', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  N1: { code: 'N1', name: 'Eredivisie', country: 'Netherlands', divisionCode: 'N1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  B1: { code: 'B1', name: 'Belgian Pro League', country: 'Belgium', divisionCode: 'B1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  P1: { code: 'P1', name: 'Primeira Liga (Liga Portugal)', country: 'Portugal', divisionCode: 'P1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org (PPL) / ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  T1: { code: 'T1', name: 'Süper Lig', country: 'Turkey', divisionCode: 'T1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  G1: { code: 'G1', name: 'Super League Greece', country: 'Greece', divisionCode: 'G1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  PL: { code: 'PL', name: 'Premier League', country: 'England', divisionCode: 'E0', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: true, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Full match stats + corners + cards + HT goals + referee + AH prices' },
  ELC: { code: 'ELC', name: 'Championship', country: 'England', divisionCode: 'E1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: true, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Full match stats + corners + cards + HT goals + referee + AH prices' },
  PD: { code: 'PD', name: 'La Liga', country: 'Spain', divisionCode: 'SP1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  BL1: { code: 'BL1', name: 'Bundesliga', country: 'Germany', divisionCode: 'D1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  SA: { code: 'SA', name: 'Serie A', country: 'Italy', divisionCode: 'I1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  FL1: { code: 'FL1', name: 'Ligue 1', country: 'France', divisionCode: 'F1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  DED: { code: 'DED', name: 'Eredivisie', country: 'Netherlands', divisionCode: 'N1', sourceType: 'seasonal', hasCorners: true, hasCards: true, hasHalfTimeGoals: true, hasReferee: false, hasAsianHandicapPrices: true, liveDataSource: 'Football-Data.org / ESPN / The Odds API', coverageNotes: 'Corners + cards + HT goals + AH prices; NO referee column' },
  // 16 Extra Leagues (/new/*.csv)
  ARG: { code: 'ARG', name: 'Liga Profesional', country: 'Argentina', divisionCode: 'ARG', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  AUT: { code: 'AUT', name: 'Austrian Bundesliga', country: 'Austria', divisionCode: 'AUT', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  BSA: { code: 'BSA', name: 'Campeonato Brasileiro Série A', country: 'Brazil', divisionCode: 'BRA', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'Football-Data.org (BSA) / ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  BRA: { code: 'BRA', name: 'Campeonato Brasileiro Série A', country: 'Brazil', divisionCode: 'BRA', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'Football-Data.org (BSA) / ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  CHN: { code: 'CHN', name: 'Chinese Super League', country: 'China', divisionCode: 'CHN', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  DNK: { code: 'DNK', name: 'Superliga', country: 'Denmark', divisionCode: 'DNK', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  FIN: { code: 'FIN', name: 'Veikkausliiga', country: 'Finland', divisionCode: 'FIN', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  IRL: { code: 'IRL', name: 'League of Ireland Premier Division', country: 'Ireland', divisionCode: 'IRL', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  JPN: { code: 'JPN', name: 'J1 League', country: 'Japan', divisionCode: 'JPN', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  MEX: { code: 'MEX', name: 'Liga MX', country: 'Mexico', divisionCode: 'MEX', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  NOR: { code: 'NOR', name: 'Eliteserien', country: 'Norway', divisionCode: 'NOR', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  POL: { code: 'POL', name: 'Ekstraklasa', country: 'Poland', divisionCode: 'POL', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'The Odds API (Not on ESPN)', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  ROU: { code: 'ROU', name: 'Liga I', country: 'Romania', divisionCode: 'ROU', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN (limited/stale)', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  RUS: { code: 'RUS', name: 'Russian Premier League', country: 'Russia', divisionCode: 'RUS', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only (19 cols, no BFE/B365 closing); NO cards, corners, HT goals, referee, or AH prices' },
  SWE: { code: 'SWE', name: 'Allsvenskan', country: 'Sweden', divisionCode: 'SWE', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  SWZ: { code: 'SWZ', name: 'Swiss Super League', country: 'Switzerland', divisionCode: 'SWZ', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN (limited/stale) / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
  USA: { code: 'USA', name: 'Major League Soccer', country: 'USA', divisionCode: 'USA', sourceType: 'extra_file', hasCorners: false, hasCards: false, hasHalfTimeGoals: false, hasReferee: false, hasAsianHandicapPrices: false, liveDataSource: 'ESPN / The Odds API', coverageNotes: 'Scores and 1X2 odds only; NO cards, corners, HT goals, referee, or AH prices' },
};

// Authoritative Backfill Matrix: Seasons 2021..2627 for Europe, 2020..2026 for extra leagues.
export const SUPPORTED_EUROPEAN_SEASONS = [
  '2021',
  '2122',
  '2223',
  '2324',
  '2425',
  '2526',
  '2627',
] as const;

export const SUPPORTED_BRAZIL_SEASONS = [
  '2020',
  '2021',
  '2022',
  '2023',
  '2024',
  '2025',
  '2026',
] as const;

export interface BackfillCallItem {
  league: string;
  season: string;
  division: string;
  description: string;
  hasCorners: boolean;
  hasCards: boolean;
  liveDataSource: string;
  exampleCommand: string;
}

export function generateBackfillCallList(baseUrl: string = 'https://calibrall.vercel.app'): BackfillCallItem[] {
  const calls: BackfillCallItem[] = [];

  const seasonalLeagues = [
    { code: 'E0', name: 'Premier League', div: 'E0' },
    { code: 'E1', name: 'English Championship', div: 'E1' },
    { code: 'E2', name: 'English League One', div: 'E2' },
    { code: 'E3', name: 'English League Two', div: 'E3' },
    { code: 'EC', name: 'English National League', div: 'EC' },
    { code: 'SC0', name: 'Scottish Premiership', div: 'SC0' },
    { code: 'SC1', name: 'Scottish Championship', div: 'SC1' },
    { code: 'SC2', name: 'Scottish League One', div: 'SC2' },
    { code: 'SC3', name: 'Scottish League Two', div: 'SC3' },
    { code: 'SP1', name: 'La Liga', div: 'SP1' },
    { code: 'SP2', name: 'Segunda División', div: 'SP2' },
    { code: 'I1', name: 'Serie A', div: 'I1' },
    { code: 'I2', name: 'Serie B', div: 'I2' },
    { code: 'D1', name: 'Bundesliga', div: 'D1' },
    { code: 'D2', name: '2. Bundesliga', div: 'D2' },
    { code: 'F1', name: 'Ligue 1', div: 'F1' },
    { code: 'F2', name: 'Ligue 2', div: 'F2' },
    { code: 'N1', name: 'Eredivisie', div: 'N1' },
    { code: 'B1', name: 'Belgian Pro League', div: 'B1' },
    { code: 'P1', name: 'Liga Portugal', div: 'P1' },
    { code: 'T1', name: 'Turkish Süper Lig', div: 'T1' },
    { code: 'G1', name: 'Super League Greece', div: 'G1' },
  ];

  for (const league of seasonalLeagues) {
    const meta = LEAGUE_METADATA[league.code] || { hasCorners: true, hasCards: true, liveDataSource: 'Configured API' };
    for (const season of SUPPORTED_EUROPEAN_SEASONS) {
      calls.push({
        league: league.code,
        season,
        division: league.div,
        description: `${league.name} ${season} (${season === '2627' ? 'Current In-Play' : 'Completed/Historical'})`,
        hasCorners: meta.hasCorners,
        hasCards: meta.hasCards,
        liveDataSource: meta.liveDataSource,
        exampleCommand: `curl -X POST "${baseUrl}/api/admin/backfill?league=${league.code}&season=${season}" -H "x-admin-secret: $ADMIN_SECRET"`,
      });
    }
  }

  const extraLeagues = [
    { code: 'ARG', name: 'Argentina Liga Profesional', div: 'ARG' },
    { code: 'AUT', name: 'Austrian Bundesliga', div: 'AUT' },
    { code: 'BSA', name: 'Brazil Série A', div: 'BRA' },
    { code: 'CHN', name: 'Chinese Super League', div: 'CHN' },
    { code: 'DNK', name: 'Denmark Superliga', div: 'DNK' },
    { code: 'FIN', name: 'Finland Veikkausliiga', div: 'FIN' },
    { code: 'IRL', name: 'Ireland Premier Division', div: 'IRL' },
    { code: 'JPN', name: 'Japan J1 League', div: 'JPN' },
    { code: 'MEX', name: 'Mexico Liga MX', div: 'MEX' },
    { code: 'NOR', name: 'Norway Eliteserien', div: 'NOR' },
    { code: 'POL', name: 'Poland Ekstraklasa', div: 'POL' },
    { code: 'ROU', name: 'Romania Liga I', div: 'ROU' },
    { code: 'RUS', name: 'Russian Premier League', div: 'RUS' },
    { code: 'SWE', name: 'Sweden Allsvenskan', div: 'SWE' },
    { code: 'SWZ', name: 'Swiss Super League', div: 'SWZ' },
    { code: 'USA', name: 'USA Major League Soccer', div: 'USA' },
  ];

  for (const league of extraLeagues) {
    const meta = LEAGUE_METADATA[league.code] || { hasCorners: false, hasCards: false, liveDataSource: 'Configured API' };
    for (const season of SUPPORTED_BRAZIL_SEASONS) {
      calls.push({
        league: league.code,
        season,
        division: league.div,
        description: `${league.name} ${season} (${season === '2026' ? 'Current/Upcoming' : 'Historical'})`,
        hasCorners: false,
        hasCards: false,
        liveDataSource: meta.liveDataSource,
        exampleCommand: `curl -X POST "${baseUrl}/api/admin/backfill?league=${league.code}&season=${season}" -H "x-admin-secret: $ADMIN_SECRET"`,
      });
    }
  }

  return calls;
}

/**
 * Sanitizes a raw team name from CSV for deterministic, idempotent provider_id generation.
 * Strips accents, punctuation, and spaces into underscores.
 */
export function sanitizeRawTeamForId(raw: string): string {
  if (!raw) return 'unknown';
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Robust date and Europe/London time parser:
 * 1. Skips invalid dates (never defaults to new Date() or now).
 * 2. If Time column is missing/empty, stores date with a null time (e.g. "YYYY-MM-DD", no 15:00 default).
 * 3. Interprets CSV time as Europe/London (observing GMT/BST) and converts to UTC ISO string.
 */
export function parseLondonCsvDateTime(dateStr: string, timeStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const cleanDate = dateStr.trim();
  const parts = cleanDate.split('/');
  if (parts.length !== 3) return null;

  let [dStr, mStr, yStr] = parts;
  const d = parseInt(dStr, 10);
  const m = parseInt(mStr, 10);
  let y = parseInt(yStr, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;

  if (yStr.length === 2) {
    y = y > 50 ? 1900 + y : 2000 + y;
  }
  const day = String(d).padStart(2, '0');
  const month = String(m).padStart(2, '0');
  const year = String(y);

  // If Time column is missing, empty, or lacks colon, store the date with a null time (no 15:00 default)
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.trim() || !timeStr.includes(':')) {
    return `${year}-${month}-${day}`;
  }

  const [hStr, minStr] = timeStr.trim().split(':');
  const hours = parseInt(hStr, 10);
  const minutes = parseInt(minStr, 10);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return `${year}-${month}-${day}`;
  }

  const candidateUtc = new Date(Date.UTC(y, m - 1, d, hours, minutes, 0));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    timeZoneName: 'shortOffset',
  });
  const partsTz = formatter.formatToParts(candidateUtc);
  const tzPart = partsTz.find(p => p.type === 'timeZoneName')?.value || 'GMT';
  let offsetHours = 0;
  if (tzPart.includes('+')) {
    offsetHours = parseInt(tzPart.split('+')[1], 10) || 0;
  } else if (tzPart.includes('-')) {
    offsetHours = -(parseInt(tzPart.split('-')[1], 10) || 0);
  }

  const actualUtcMs = Date.UTC(y, m - 1, d, hours - offsetHours, minutes, 0);
  return new Date(actualUtcMs).toISOString();
}

/**
 * Brazil Serie A matches from football-data.co.uk (BRA.csv):
 * Kickoff times are frequently missing or inconsistently collated.
 * Official timezone is America/Sao_Paulo (UTC-3), but Calibrall stores Brazil matches
 * strictly date-only (YYYY-MM-DD with null time) to avoid inventing kickoff hours.
 */
export function parseBrazilCsvDate(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const cleanDate = dateStr.trim();
  const parts = cleanDate.split('/');
  if (parts.length !== 3) return null;

  let [dStr, mStr, yStr] = parts;
  const d = parseInt(dStr, 10);
  const m = parseInt(mStr, 10);
  let y = parseInt(yStr, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;

  if (yStr.length === 2) {
    y = y > 50 ? 1900 + y : 2000 + y;
  }
  const day = String(d).padStart(2, '0');
  const month = String(m).padStart(2, '0');
  const year = String(y);

  // Strictly date-only format: YYYY-MM-DD
  return `${year}-${month}-${day}`;
}

export interface CanonicalCsvTeamResolution {
  id: string;
  name: string;
  shortName: string;
  competitionCode: string;
  isPromoted: boolean;
}

/**
 * Strict exact-alias team resolver for CSV ingestion.
 * Never invents / auto-slugifies unresolved names: logs them in unresolved_teams and returns null.
 */
export function getCanonicalTeamForCsv(league: string, rawCsvName: string): CanonicalCsvTeamResolution | null {
  const cleanName = rawCsvName.trim();
  const canon = lookupCanonicalTeam(cleanName);
  if (canon) {
    return {
      id: canon.canonicalId,
      name: canon.canonicalName,
      shortName: canon.shortName,
      competitionCode: canon.competitionCode !== 'GENERIC' ? canon.competitionCode : league,
      isPromoted: PROMOTED_BRAZIL_2026_IDS.has(canon.canonicalId),
    };
  }
  const lookup = lookupTeamStrength(cleanName);
  if (lookup.found && lookup.data) {
    return {
      id: lookup.data.id,
      name: lookup.data.name,
      shortName: lookup.data.shortName,
      competitionCode: league,
      isPromoted: Boolean(lookup.data.isPromoted) || PROMOTED_BRAZIL_2026_IDS.has(lookup.data.id),
    };
  }
  // Exact-alias only rule: record unresolved source name and reject auto-slugification
  recordUnresolvedTeam(cleanName, `football-data.co.uk:${league}`);
  return null;
}
