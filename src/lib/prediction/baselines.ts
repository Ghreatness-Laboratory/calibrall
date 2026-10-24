// MATCHMIND: Empirical Market Baselines & Naive Frequency Benchmarks
// Provides league-specific and European aggregate naive frequencies for all 10 authorized market families.
// Used to compute true skill, edge-over-baseline, and prevent bias toward trivially high raw probabilities.

export interface MarketBaseline {
  marketCode: string;
  optionType: string;
  marketFamily: MarketFamily;
  line?: number;
  baseRate: number; // Historical frequency [0.0, 1.0] in elite European competitions
  isTriviallySafe: boolean; // Base rate >= 0.85
  leagueAdjustments?: Record<string, number>;
}

export type MarketFamily = 
  | 'result' 
  | 'draw' 
  | 'double_chance' 
  | 'goals_over_under' 
  | 'both_teams_to_score' 
  | 'highest_scoring_half' 
  | 'first_half_goals' 
  | 'second_half_result' 
  | 'corners' 
  | 'bookings';

export const MARKET_FAMILIES: MarketFamily[] = [
  'result',
  'draw',
  'double_chance',
  'goals_over_under',
  'both_teams_to_score',
  'highest_scoring_half',
  'first_half_goals',
  'second_half_result',
  'corners',
  'bookings',
];

// League-level goal & event profiles
export const LEAGUE_PROFILES: Record<string, { avgGoals: number; avgCorners: number; avgCards: number; homeWinRate: number; drawRate: number; awayWinRate: number }> = {
  PL: { avgGoals: 2.88, avgCorners: 10.45, avgCards: 4.12, homeWinRate: 0.458, drawRate: 0.238, awayWinRate: 0.304 },
  PD: { avgGoals: 2.54, avgCorners: 9.30, avgCards: 4.88, homeWinRate: 0.442, drawRate: 0.264, awayWinRate: 0.294 },
  BL1: { avgGoals: 3.18, avgCorners: 10.15, avgCards: 3.75, homeWinRate: 0.452, drawRate: 0.235, awayWinRate: 0.313 },
  SA: { avgGoals: 2.62, avgCorners: 9.60, avgCards: 4.50, homeWinRate: 0.435, drawRate: 0.268, awayWinRate: 0.297 },
  CL: { avgGoals: 3.02, avgCorners: 9.85, avgCards: 3.95, homeWinRate: 0.465, drawRate: 0.225, awayWinRate: 0.310 },
  DEFAULT: { avgGoals: 2.78, avgCorners: 9.95, avgCards: 4.25, homeWinRate: 0.450, drawRate: 0.245, awayWinRate: 0.305 },
};

/**
 * Returns the naive empirical baseline frequency for any market line and competition
 */
export function getMarketBaseline(
  marketCode: string,
  competitionCode: string = 'PL',
  line?: number
): { baseRate: number; isTriviallySafe: boolean; marketFamily: MarketFamily } {
  const comp = LEAGUE_PROFILES[competitionCode] || LEAGUE_PROFILES.DEFAULT;

  // 1. Result (1X2)
  if (marketCode.startsWith('1X2_HOME')) {
    return { baseRate: comp.homeWinRate, isTriviallySafe: false, marketFamily: 'result' };
  }
  if (marketCode.startsWith('1X2_AWAY')) {
    return { baseRate: comp.awayWinRate, isTriviallySafe: false, marketFamily: 'result' };
  }

  // 2. Draw
  if (marketCode.startsWith('1X2_DRAW')) {
    return { baseRate: comp.drawRate, isTriviallySafe: false, marketFamily: 'draw' };
  }

  // 3. Double Chance
  if (marketCode === 'DC_1X') {
    return { baseRate: comp.homeWinRate + comp.drawRate, isTriviallySafe: false, marketFamily: 'double_chance' };
  }
  if (marketCode === 'DC_X2') {
    return { baseRate: comp.awayWinRate + comp.drawRate, isTriviallySafe: false, marketFamily: 'double_chance' };
  }
  if (marketCode === 'DC_12') {
    return { baseRate: 1 - comp.drawRate, isTriviallySafe: false, marketFamily: 'double_chance' };
  }

  // 4. Over/Under Goals
  if (marketCode.startsWith('TOTAL_GOALS_O') || marketCode.startsWith('TOTAL_GOALS_U')) {
    const isOver = marketCode.includes('_O');
    const l = line ?? 2.5;

    let baseOver = 0.52;
    if (l === 0.5) baseOver = 0.92;
    else if (l === 1.5) baseOver = 0.78;
    else if (l === 2.5) baseOver = comp.avgGoals > 2.8 ? 0.54 : 0.48;
    else if (l === 3.5) baseOver = 0.31;
    else if (l === 4.5) baseOver = 0.15;

    const baseRate = isOver ? baseOver : (1 - baseOver);
    return {
      baseRate,
      isTriviallySafe: baseRate >= 0.85,
      marketFamily: 'goals_over_under',
    };
  }

  // 5. BTTS
  if (marketCode === 'BTTS_YES') {
    return { baseRate: 0.515, isTriviallySafe: false, marketFamily: 'both_teams_to_score' };
  }
  if (marketCode === 'BTTS_NO') {
    return { baseRate: 0.485, isTriviallySafe: false, marketFamily: 'both_teams_to_score' };
  }

  // 6. Highest Scoring Half
  if (marketCode === 'HSH_2ND') {
    return { baseRate: 0.545, isTriviallySafe: false, marketFamily: 'highest_scoring_half' };
  }
  if (marketCode === 'HSH_1ST') {
    return { baseRate: 0.335, isTriviallySafe: false, marketFamily: 'highest_scoring_half' };
  }
  if (marketCode === 'HSH_EQUAL') {
    return { baseRate: 0.120, isTriviallySafe: false, marketFamily: 'highest_scoring_half' };
  }

  // 7. First-Half Goals
  if (marketCode === 'FH_GOALS_O05') {
    return { baseRate: 0.730, isTriviallySafe: false, marketFamily: 'first_half_goals' };
  }
  if (marketCode === 'FH_GOALS_U15') {
    return { baseRate: 0.690, isTriviallySafe: false, marketFamily: 'first_half_goals' };
  }

  // 8. Second-Half Result
  if (marketCode === '2H_RESULT_HOME') {
    return { baseRate: 0.420, isTriviallySafe: false, marketFamily: 'second_half_result' };
  }
  if (marketCode === '2H_RESULT_DRAW') {
    return { baseRate: 0.335, isTriviallySafe: false, marketFamily: 'second_half_result' };
  }
  if (marketCode === '2H_RESULT_AWAY') {
    return { baseRate: 0.245, isTriviallySafe: false, marketFamily: 'second_half_result' };
  }

  // 9. Corners
  if (marketCode.startsWith('TOTAL_CORNERS_O') || marketCode.startsWith('TOTAL_CORNERS_U') || marketCode.startsWith('TEAM_CORNERS_') || marketCode.startsWith('CORNER_HANDICAP_')) {
    const isOver = marketCode.includes('_O');
    const l = line ?? 9.5;

    let baseOver = 0.55;
    if (l <= 7.5) baseOver = 0.80;
    else if (l <= 8.5) baseOver = 0.68;
    else if (l <= 9.5) baseOver = comp.avgCorners > 10.0 ? 0.56 : 0.52;
    else if (l <= 10.5) baseOver = comp.avgCorners > 10.0 ? 0.44 : 0.40;
    else if (l <= 11.5) baseOver = 0.30;

    // Team corners base rates
    if (marketCode.startsWith('TEAM_CORNERS_')) {
      if (l <= 3.5) baseOver = 0.76;
      else if (l <= 4.5) baseOver = 0.57;
      else if (l <= 5.5) baseOver = 0.38;
      else baseOver = 0.22;
    }

    if (marketCode.includes('CORNER_HANDICAP_HOME_M15')) {
      return { baseRate: 0.50, isTriviallySafe: false, marketFamily: 'corners' };
    }
    if (marketCode.includes('CORNER_HANDICAP_AWAY_P15')) {
      return { baseRate: 0.50, isTriviallySafe: false, marketFamily: 'corners' };
    }

    const baseRate = isOver ? baseOver : (1 - baseOver);
    return {
      baseRate,
      isTriviallySafe: baseRate >= 0.85,
      marketFamily: 'corners',
    };
  }

  // 10. Bookings / Cards
  if (marketCode.startsWith('CARDS_O') || marketCode.startsWith('CARDS_U') || marketCode.startsWith('TEAM_CARDS_') || marketCode.startsWith('BOOKING_POINTS_')) {
    const isOver = marketCode.includes('_O');
    const l = line ?? 4.5;

    let baseOver = 0.45;
    if (l <= 2.5) baseOver = 0.81;
    else if (l <= 3.5) baseOver = 0.64;
    else if (l <= 4.5) baseOver = comp.avgCards > 4.5 ? 0.52 : 0.44;
    else if (l <= 5.5) baseOver = 0.27;

    if (marketCode.startsWith('TEAM_CARDS_')) {
      baseOver = l <= 1.5 ? 0.68 : 0.36;
    }

    if (marketCode.startsWith('BOOKING_POINTS_')) {
      baseOver = 0.64; // Equivalent to Over 3.5 yellow cards
    }

    const baseRate = isOver ? baseOver : (1 - baseOver);
    return {
      baseRate,
      isTriviallySafe: baseRate >= 0.85,
      marketFamily: 'bookings',
    };
  }

  // 11. Asian Handicap
  if (marketCode.startsWith('AH_HOME_')) {
    const l = line ?? 0.0;
    let baseRate = 0.50;
    if (l >= 1.5) baseRate = 0.86;
    else if (l >= 1.0) baseRate = 0.79;
    else if (l >= 0.5) baseRate = comp.homeWinRate + comp.drawRate; // ~0.696
    else if (l === 0.0) baseRate = comp.homeWinRate / (comp.homeWinRate + comp.awayWinRate); // ~0.60
    else if (l <= -1.5) baseRate = 0.23;
    else if (l <= -1.0) baseRate = 0.32;
    else if (l <= -0.5) baseRate = comp.homeWinRate; // ~0.458

    return {
      baseRate,
      isTriviallySafe: baseRate >= 0.85,
      marketFamily: 'result',
    };
  }

  if (marketCode.startsWith('AH_AWAY_')) {
    const l = line ?? 0.0;
    let baseRate = 0.50;
    if (l >= 1.5) baseRate = 0.77;
    else if (l >= 1.0) baseRate = 0.67;
    else if (l >= 0.5) baseRate = comp.awayWinRate + comp.drawRate; // ~0.542
    else if (l === 0.0) baseRate = comp.awayWinRate / (comp.homeWinRate + comp.awayWinRate); // ~0.40
    else if (l <= -1.5) baseRate = 0.13;
    else if (l <= -1.0) baseRate = 0.18;
    else if (l <= -0.5) baseRate = comp.awayWinRate; // ~0.304

    return {
      baseRate,
      isTriviallySafe: baseRate >= 0.85,
      marketFamily: 'result',
    };
  }

  // 12. European Handicap
  if (marketCode === 'EH_HOME_M1') {
    return { baseRate: 0.23, isTriviallySafe: false, marketFamily: 'result' };
  }
  if (marketCode === 'EH_AWAY_P1') {
    return { baseRate: comp.awayWinRate + comp.drawRate, isTriviallySafe: false, marketFamily: 'result' };
  }

  // 13. Draw No Bet
  if (marketCode === 'DNB_HOME') {
    const baseRate = comp.homeWinRate / (comp.homeWinRate + comp.awayWinRate);
    return { baseRate, isTriviallySafe: false, marketFamily: 'result' };
  }
  if (marketCode === 'DNB_AWAY') {
    const baseRate = comp.awayWinRate / (comp.homeWinRate + comp.awayWinRate);
    return { baseRate, isTriviallySafe: false, marketFamily: 'result' };
  }

  // 14. Goal Bands (Total and Team)
  if (marketCode.startsWith('GB_')) {
    let baseRate = 0.50;
    if (marketCode === 'GB_2_3') baseRate = 0.49;
    else if (marketCode === 'GB_2_4') baseRate = 0.68;
    else if (marketCode === 'GB_1_3') baseRate = 0.66;
    else if (marketCode === 'GB_2_') baseRate = 0.78;
    else if (marketCode === 'GB_3_') baseRate = 0.52;
    return {
      baseRate,
      isTriviallySafe: baseRate >= 0.85,
      marketFamily: 'goals_over_under',
    };
  }

  if (marketCode.startsWith('TGB_')) {
    let baseRate = 0.45;
    if (marketCode === 'TGB_HOME_1_2') baseRate = 0.55;
    else if (marketCode === 'TGB_HOME_2_') baseRate = 0.45;
    else if (marketCode === 'TGB_AWAY_1_2') baseRate = 0.48;
    else if (marketCode === 'TGB_AWAY_2_') baseRate = 0.32;
    return {
      baseRate,
      isTriviallySafe: false,
      marketFamily: 'goals_over_under',
    };
  }

  return { baseRate: 0.50, isTriviallySafe: false, marketFamily: 'goals_over_under' };
}
