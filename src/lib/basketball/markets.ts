// CALIBRALL: Basketball Scope, Seasons & Authorized Markets (Strictly Total Points Markets Only)

export type BasketballLeague = 'NBA' | 'NCAAB' | 'EUROLEAGUE';

export type BasketballMarketCategory =
  | 'game_total'
  | 'home_total'
  | 'away_total'
  | 'h1_game_total'
  | 'h1_team_total';

export type BasketballMarketCode =
  | 'GAME_TOTAL_OVER'
  | 'GAME_TOTAL_UNDER'
  | 'HOME_TOTAL_OVER'
  | 'HOME_TOTAL_UNDER'
  | 'AWAY_TOTAL_OVER'
  | 'AWAY_TOTAL_UNDER'
  | 'H1_TOTAL_OVER'
  | 'H1_TOTAL_UNDER'
  | 'H1_HOME_TOTAL_OVER'
  | 'H1_HOME_TOTAL_UNDER'
  | 'H1_AWAY_TOTAL_OVER'
  | 'H1_AWAY_TOTAL_UNDER';

export interface BasketballMarketSpec {
  code: BasketballMarketCode;
  category: BasketballMarketCategory;
  label: string;
  requiresHalfScores: boolean;
}

export const BASKETBALL_AUTHORIZED_MARKETS: BasketballMarketSpec[] = [
  { code: 'GAME_TOTAL_OVER', category: 'game_total', label: 'Game total over', requiresHalfScores: false },
  { code: 'GAME_TOTAL_UNDER', category: 'game_total', label: 'Game total under', requiresHalfScores: false },
  { code: 'HOME_TOTAL_OVER', category: 'home_total', label: 'Home team total over', requiresHalfScores: false },
  { code: 'HOME_TOTAL_UNDER', category: 'home_total', label: 'Home team total under', requiresHalfScores: false },
  { code: 'AWAY_TOTAL_OVER', category: 'away_total', label: 'Away team total over', requiresHalfScores: false },
  { code: 'AWAY_TOTAL_UNDER', category: 'away_total', label: 'Away team total under', requiresHalfScores: false },
  { code: 'H1_TOTAL_OVER', category: 'h1_game_total', label: '1st half game total over', requiresHalfScores: true },
  { code: 'H1_TOTAL_UNDER', category: 'h1_game_total', label: '1st half game total under', requiresHalfScores: true },
  { code: 'H1_HOME_TOTAL_OVER', category: 'h1_team_total', label: '1st half home team total over', requiresHalfScores: true },
  { code: 'H1_HOME_TOTAL_UNDER', category: 'h1_team_total', label: '1st half home team total under', requiresHalfScores: true },
  { code: 'H1_AWAY_TOTAL_OVER', category: 'h1_team_total', label: '1st half away team total over', requiresHalfScores: true },
  { code: 'H1_AWAY_TOTAL_UNDER', category: 'h1_team_total', label: '1st half away team total under', requiresHalfScores: true },
];

export const CURRENT_BASKETBALL_SEASON = '2026-27';

export const BASKETBALL_LEAGUE_SEASONS: Record<BasketballLeague, string[]> = {
  // Last 8 completed seasons + current (2026-27)
  NBA: [
    '2018-19',
    '2019-20',
    '2020-21',
    '2021-22',
    '2022-23',
    '2023-24',
    '2024-25',
    '2025-26',
    '2026-27',
  ],
  // Last 4 completed seasons + current (2026-27), Division I vs Division I only
  NCAAB: [
    '2022-23',
    '2023-24',
    '2024-25',
    '2025-26',
    '2026-27',
  ],
  // Last 8 completed seasons + current (2026-27), regular season & playoffs
  EUROLEAGUE: [
    '2018-19',
    '2019-20',
    '2020-21',
    '2021-22',
    '2022-23',
    '2023-24',
    '2024-25',
    '2025-26',
    '2026-27',
  ],
};

export interface BasketballBackfillItem {
  sport: 'basketball';
  league: BasketballLeague;
  season: string;
  source: 'hoopr' | 'espn' | 'euroleague';
  description: string;
}

export function generateBasketballBackfillCallList(): BasketballBackfillItem[] {
  const items: BasketballBackfillItem[] = [];

  for (const season of BASKETBALL_LEAGUE_SEASONS.NBA) {
    items.push({
      sport: 'basketball',
      league: 'NBA',
      season,
      source: 'hoopr',
      description: `NBA ${season} schedule & quarter scores (hoopR-nba-data)`,
    });
  }
  items.push({
    sport: 'basketball',
    league: 'NBA',
    season: CURRENT_BASKETBALL_SEASON,
    source: 'espn',
    description: `NBA ${CURRENT_BASKETBALL_SEASON} current-season scoreboard gap-fill (ESPN)`,
  });

  for (const season of BASKETBALL_LEAGUE_SEASONS.NCAAB) {
    items.push({
      sport: 'basketball',
      league: 'NCAAB',
      season,
      source: 'hoopr',
      description: `NCAAB D1-vs-D1 ${season} schedule & half scores (hoopR-mbb-data)`,
    });
  }
  items.push({
    sport: 'basketball',
    league: 'NCAAB',
    season: CURRENT_BASKETBALL_SEASON,
    source: 'espn',
    description: `NCAAB D1-vs-D1 ${CURRENT_BASKETBALL_SEASON} current-season scoreboard gap-fill (ESPN)`,
  });

  for (const season of BASKETBALL_LEAGUE_SEASONS.EUROLEAGUE) {
    items.push({
      sport: 'basketball',
      league: 'EUROLEAGUE',
      season,
      source: 'euroleague',
      description: `EuroLeague ${season} regular season & playoffs (Official API v2)`,
    });
  }

  return items;
}

export function seasonLabelToHoopRYear(season: string): number | null {
  const m = season.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const startYear = parseInt(m[1], 10);
  // hoopR names seasons by ending year: 2018-19 -> 2019, 2026-27 -> 2027
  return startYear + 1;
}

export function seasonLabelToEuroLeagueCode(season: string): string | null {
  const m = season.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  // EuroLeague names seasons by starting year: 2018-19 -> E2018, 2026-27 -> E2026
  return `E${m[1]}`;
}
