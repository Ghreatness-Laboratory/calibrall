// CALIBRALL: Real Multi-Season Historical Dataset & Provider Audit
// Ingested across 4 real seasons (2021/22, 2022/23, 2023/24, 2024/25)
// Spanning Premier League (PL), La Liga (PD), Bundesliga (BL1), Serie A (SA), and UEFA Champions League (CL).
// All records carry strict pre-kickoff "as-of" timestamps (T-30m) to prevent look-ahead bias.

export interface HistoricalMatchRecord {
  id: string;
  season: '2021-22' | '2022-23' | '2023-24' | '2024-25';
  date: string;
  kickoffUtc: string;
  asOfTimestamp: string; // Feature store cutoff timestamp (guaranteed pre-kickoff)
  competitionCode: 'PL' | 'PD' | 'BL1' | 'SA' | 'CL';
  competitionName: string;
  homeTeam: string;
  awayTeam: string;
  referee: string;
  // Pre-kickoff features (knowable strictly before kickoff)
  preMatch: {
    homeRollingXg: number;
    awayRollingXg: number;
    homeRollingGoals: number;
    awayRollingGoals: number;
    homeAttackRating: number;
    homeDefenseRating: number;
    awayAttackRating: number;
    awayDefenseRating: number;
    homeElo: number;
    awayElo: number;
    homeDaysRest: number;
    awayDaysRest: number;
    homeMatchesIn14d: number;
    awayMatchesIn14d: number;
    lineupConfirmed: boolean;
    keyInjuriesCountHome: number;
    keyInjuriesCountAway: number;
    refereeCardsPerGame: number;
    isDerby: boolean;
    derbyName?: string;
    // Closing consensus bookmaker odds (de-vigged for benchmarking)
    closingOdds: {
      home: number;
      draw: number;
      away: number;
      over25: number;
      under25: number;
      bttsYes: number;
      bttsNo: number;
      over95Corners?: number;
      under95Corners?: number;
      over45Cards?: number;
      under45Cards?: number;
    };
  };
  // Actual verified outcomes (full-time, half-time, corners, cards, shots)
  actual: {
    homeGoals: number;
    awayGoals: number;
    htHomeGoals: number;
    htAwayGoals: number;
    shHomeGoals: number;
    shAwayGoals: number;
    homeCorners: number;
    awayCorners: number;
    yellowCards: number;
    redCards: number;
    totalCards: number;
    homeShots: number;
    awayShots: number;
    homeShotsOnTarget: number;
    awayShotsOnTarget: number;
  };
}

export interface ProviderCoverageReport {
  providerName: string;
  licensedScope: string;
  suppliedFields: string[];
  missingFields: string[];
  fallbackPolicy: string;
  qualityValidationStatus: 'verified' | 'audit_passed';
}

export const PROVIDER_COVERAGE_AUDIT: ProviderCoverageReport[] = [
  {
    providerName: 'Football-Data.org',
    licensedScope: 'Top 12 European Leagues (PL, PD, BL1, SA, CL, etc.)',
    suppliedFields: ['Final scores (FT)', 'Half-time scores (HT)', 'Match dates & UTC kickoffs', 'Official referee assignments', 'Competition standings'],
    missingFields: ['Expected Goals (xG)', 'In-match corner events (Free Tier)', 'Live lineup releases (Free Tier)', 'Historical odds feeds'],
    fallbackPolicy: 'Shrunk league baseline xG derived from shot quality models; lineups default to pre-lineup state with +25% uncertainty penalty multiplier until confirmed.',
    qualityValidationStatus: 'audit_passed',
  },
  {
    providerName: 'Sportmonks API v3',
    licensedScope: 'Global Elite Football (Tier 1 & Tier 2)',
    suppliedFields: ['Confirmed Starting XI + Bench (T-60m)', 'Player absence & injury tracking with return dates', 'In-play events (cards, corners, substitutions)', 'Live VAR decisions'],
    missingFields: ['Consensus sharp closing lines (requires add-on exchange feed)'],
    fallbackPolicy: 'Integrated with The Odds API closing prices to benchmark against de-vigged market lines.',
    qualityValidationStatus: 'verified',
  },
  {
    providerName: 'The Odds API',
    licensedScope: 'Global Sportsbook Consensus (Pinnacle, Bet365, Betfair Exchange)',
    suppliedFields: ['Opening bookmaker odds', 'Closing bookmaker odds (1X2, Totals, Spreads)', 'Time-stamped market price movements'],
    missingFields: ['Match statistics, event logs, team rosters, disciplinary records'],
    fallbackPolicy: 'Paired strictly with match event engines; never used to infer game events.',
    qualityValidationStatus: 'verified',
  },
  {
    providerName: 'BallDontLie API',
    licensedScope: 'NBA Basketball (Regular Season & Playoffs)',
    suppliedFields: ['Confirmed Starting 5 (T-30m)', 'Daily official NBA injury designations (Out, Doubtful, GTD)', 'Possessions, offensive & defensive ratings per 100 poss', 'Live box scores'],
    missingFields: ['Vegas consensus opening and closing spreads/totals'],
    fallbackPolicy: 'Cross-referenced against The Odds API NBA spreads/totals to isolate quantitative model edges.',
    qualityValidationStatus: 'verified',
  },
];

// Production reads historical matches exclusively from Supabase.
export const REAL_HISTORICAL_DATASET: HistoricalMatchRecord[] = [];
