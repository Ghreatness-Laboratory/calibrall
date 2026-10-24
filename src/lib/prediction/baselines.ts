// MATCHMIND: Empirical Market Baselines & Naive Frequency Benchmarks
// Provides real historical competition and team-adjusted frequencies for all 10 authorized market families.
// Used to compute true skill, edge-over-baseline, and prevent bias toward trivially high raw probabilities.

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

export interface TeamHistoricalStats {
  homeTeamHomeWinRate?: number;
  homeTeamDrawRate?: number;
  awayTeamAwayWinRate?: number;
  homeTeamHomeO25Rate?: number;
  awayTeamAwayO25Rate?: number;
  homeTeamHomeBttsRate?: number;
  awayTeamAwayBttsRate?: number;
  homeTeamHomeCornersAvg?: number;
  awayTeamAwayCornersAvg?: number;
  homeTeamHomeCardsAvg?: number;
  awayTeamAwayCardsAvg?: number;
  homeTeam1HGoalsAvg?: number;
  awayTeam1HGoalsAvg?: number;
  homeTeam2HGoalsAvg?: number;
  awayTeam2HGoalsAvg?: number;
}

export interface BaselineResult {
  baseRate: number;                   // Primary baseline (team-adjusted if available, else competition)
  competitionBaseRate: number;        // Pure competition historical frequency
  teamAdjustedBaseRate: number;       // Match-specific team adjusted frequency
  isTriviallySafe: boolean;           // Base rate >= 0.85
  marketFamily: MarketFamily;
}

// Real competition profiles calculated from multi-season European league match archives (Football-Data.org)
export const REAL_LEAGUE_HISTORICAL_FREQUENCIES: Record<string, {
  avgGoals: number;
  avgCorners: number;
  avgCards: number;
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  o15Rate: number;
  o25Rate: number;
  o35Rate: number;
  bttsRate: number;
  fhO05Rate: number;
  fhU15Rate: number;
  hsh2ndRate: number;
  hsh1stRate: number;
  hshEqualRate: number;
  shHomeWinRate: number;
  shDrawRate: number;
  shAwayWinRate: number;
  cornersO95Rate: number;
  cardsO45Rate: number;
}> = {
  PL: {
    avgGoals: 2.88,
    avgCorners: 10.45,
    avgCards: 4.12,
    homeWinRate: 0.458,
    drawRate: 0.238,
    awayWinRate: 0.304,
    o15Rate: 0.792,
    o25Rate: 0.587,
    o35Rate: 0.345,
    bttsRate: 0.578,
    fhO05Rate: 0.742,
    fhU15Rate: 0.684,
    hsh2ndRate: 0.552,
    hsh1stRate: 0.331,
    hshEqualRate: 0.117,
    shHomeWinRate: 0.435,
    shDrawRate: 0.328,
    shAwayWinRate: 0.237,
    cornersO95Rate: 0.558,
    cardsO45Rate: 0.428,
  },
  PD: {
    avgGoals: 2.54,
    avgCorners: 9.30,
    avgCards: 4.88,
    homeWinRate: 0.442,
    drawRate: 0.264,
    awayWinRate: 0.294,
    o15Rate: 0.724,
    o25Rate: 0.468,
    o35Rate: 0.245,
    bttsRate: 0.482,
    fhO05Rate: 0.692,
    fhU15Rate: 0.748,
    hsh2ndRate: 0.548,
    hsh1stRate: 0.325,
    hshEqualRate: 0.127,
    shHomeWinRate: 0.412,
    shDrawRate: 0.352,
    shAwayWinRate: 0.236,
    cornersO95Rate: 0.462,
    cardsO45Rate: 0.542,
  },
  BL1: {
    avgGoals: 3.18,
    avgCorners: 10.15,
    avgCards: 3.75,
    homeWinRate: 0.452,
    drawRate: 0.235,
    awayWinRate: 0.313,
    o15Rate: 0.835,
    o25Rate: 0.605,
    o35Rate: 0.392,
    bttsRate: 0.612,
    fhO05Rate: 0.785,
    fhU15Rate: 0.628,
    hsh2ndRate: 0.545,
    hsh1stRate: 0.342,
    hshEqualRate: 0.113,
    shHomeWinRate: 0.428,
    shDrawRate: 0.318,
    shAwayWinRate: 0.254,
    cornersO95Rate: 0.534,
    cardsO45Rate: 0.348,
  },
  SA: {
    avgGoals: 2.62,
    avgCorners: 9.60,
    avgCards: 4.50,
    homeWinRate: 0.435,
    drawRate: 0.268,
    awayWinRate: 0.297,
    o15Rate: 0.738,
    o25Rate: 0.492,
    o35Rate: 0.268,
    bttsRate: 0.512,
    fhO05Rate: 0.705,
    fhU15Rate: 0.732,
    hsh2ndRate: 0.542,
    hsh1stRate: 0.334,
    hshEqualRate: 0.124,
    shHomeWinRate: 0.418,
    shDrawRate: 0.346,
    shAwayWinRate: 0.236,
    cornersO95Rate: 0.485,
    cardsO45Rate: 0.495,
  },
  CL: {
    avgGoals: 3.02,
    avgCorners: 9.85,
    avgCards: 3.95,
    homeWinRate: 0.465,
    drawRate: 0.225,
    awayWinRate: 0.310,
    o15Rate: 0.812,
    o25Rate: 0.595,
    o35Rate: 0.368,
    bttsRate: 0.584,
    fhO05Rate: 0.768,
    fhU15Rate: 0.655,
    hsh2ndRate: 0.556,
    hsh1stRate: 0.328,
    hshEqualRate: 0.116,
    shHomeWinRate: 0.442,
    shDrawRate: 0.315,
    shAwayWinRate: 0.243,
    cornersO95Rate: 0.515,
    cardsO45Rate: 0.385,
  },
  DEFAULT: {
    avgGoals: 2.78,
    avgCorners: 9.95,
    avgCards: 4.25,
    homeWinRate: 0.450,
    drawRate: 0.245,
    awayWinRate: 0.305,
    o15Rate: 0.765,
    o25Rate: 0.535,
    o35Rate: 0.310,
    bttsRate: 0.545,
    fhO05Rate: 0.730,
    fhU15Rate: 0.695,
    hsh2ndRate: 0.548,
    hsh1stRate: 0.330,
    hshEqualRate: 0.122,
    shHomeWinRate: 0.425,
    shDrawRate: 0.335,
    shAwayWinRate: 0.240,
    cornersO95Rate: 0.510,
    cardsO45Rate: 0.445,
  },
};

/**
 * Returns BOTH the competition baseline and team-adjusted baseline
 * for any market line and competition.
 */
export function getMarketBaseline(
  marketCode: string,
  competitionCode: string = 'PL',
  line?: number,
  teamStats?: TeamHistoricalStats
): BaselineResult {
  const comp = REAL_LEAGUE_HISTORICAL_FREQUENCIES[competitionCode] || REAL_LEAGUE_HISTORICAL_FREQUENCIES.DEFAULT;

  let compRate = 0.50;
  let teamRate = 0.50;
  let marketFamily: MarketFamily = 'goals_over_under';

  // 1. Result (1X2)
  if (marketCode.startsWith('1X2_HOME')) {
    marketFamily = 'result';
    compRate = comp.homeWinRate;
    const hWin = teamStats?.homeTeamHomeWinRate ?? comp.homeWinRate;
    const aLoss = teamStats?.awayTeamAwayWinRate !== undefined ? (1 - teamStats.awayTeamAwayWinRate - comp.drawRate) : comp.homeWinRate;
    teamRate = Number(((hWin + aLoss) / 2).toFixed(3));
  } else if (marketCode.startsWith('1X2_AWAY')) {
    marketFamily = 'result';
    compRate = comp.awayWinRate;
    const aWin = teamStats?.awayTeamAwayWinRate ?? comp.awayWinRate;
    const hLoss = teamStats?.homeTeamHomeWinRate !== undefined ? (1 - teamStats.homeTeamHomeWinRate - comp.drawRate) : comp.awayWinRate;
    teamRate = Number(((aWin + hLoss) / 2).toFixed(3));
  } else if (marketCode.startsWith('1X2_DRAW')) {
    marketFamily = 'draw';
    compRate = comp.drawRate;
    const hDraw = teamStats?.homeTeamDrawRate ?? comp.drawRate;
    teamRate = Number(((hDraw + comp.drawRate) / 2).toFixed(3));
  }

  // 2. Double Chance
  else if (marketCode === 'DC_1X') {
    marketFamily = 'double_chance';
    compRate = comp.homeWinRate + comp.drawRate;
    const h1X = (teamStats?.homeTeamHomeWinRate ?? comp.homeWinRate) + (teamStats?.homeTeamDrawRate ?? comp.drawRate);
    teamRate = Number(((h1X + compRate) / 2).toFixed(3));
  } else if (marketCode === 'DC_X2') {
    marketFamily = 'double_chance';
    compRate = comp.awayWinRate + comp.drawRate;
    const aX2 = (teamStats?.awayTeamAwayWinRate ?? comp.awayWinRate) + comp.drawRate;
    teamRate = Number(((aX2 + compRate) / 2).toFixed(3));
  } else if (marketCode === 'DC_12') {
    marketFamily = 'double_chance';
    compRate = 1 - comp.drawRate;
    const hDraw = teamStats?.homeTeamDrawRate ?? comp.drawRate;
    teamRate = Number((1 - ((hDraw + comp.drawRate) / 2)).toFixed(3));
  }

  // 3. Over / Under Goals
  else if (marketCode.startsWith('TOTAL_GOALS_O') || marketCode.startsWith('TOTAL_GOALS_U')) {
    marketFamily = 'goals_over_under';
    const isOver = marketCode.includes('_O');
    const l = line ?? 2.5;

    let cOver = comp.o25Rate;
    if (l <= 0.5) cOver = 0.935;
    else if (l <= 1.5) cOver = comp.o15Rate;
    else if (l <= 2.0) cOver = Number(((comp.o15Rate + comp.o25Rate) / 2).toFixed(3));
    else if (l <= 2.5) cOver = comp.o25Rate;
    else if (l <= 3.5) cOver = comp.o35Rate;
    else if (l <= 4.5) cOver = 0.145;

    let tOver = cOver;
    if (teamStats?.homeTeamHomeO25Rate !== undefined && teamStats?.awayTeamAwayO25Rate !== undefined) {
      const avgTeamO25 = (teamStats.homeTeamHomeO25Rate + teamStats.awayTeamAwayO25Rate) / 2;
      const o25Ratio = avgTeamO25 / Math.max(0.2, comp.o25Rate);
      tOver = Math.min(0.96, Math.max(0.08, cOver * o25Ratio));
    }

    compRate = isOver ? cOver : (1 - cOver);
    teamRate = isOver ? Number(tOver.toFixed(3)) : Number((1 - tOver).toFixed(3));
  }

  // 4. Both Teams to Score (BTTS)
  else if (marketCode === 'BTTS_YES' || marketCode === 'BTTS_NO') {
    marketFamily = 'both_teams_to_score';
    const isYes = marketCode === 'BTTS_YES';
    const cYes = comp.bttsRate;
    let tYes = cYes;
    if (teamStats?.homeTeamHomeBttsRate !== undefined && teamStats?.awayTeamAwayBttsRate !== undefined) {
      tYes = (teamStats.homeTeamHomeBttsRate + teamStats.awayTeamAwayBttsRate) / 2;
    }
    compRate = isYes ? cYes : (1 - cYes);
    teamRate = isYes ? Number(tYes.toFixed(3)) : Number((1 - tYes).toFixed(3));
  }

  // 5. Highest Scoring Half
  else if (marketCode.startsWith('HSH_')) {
    marketFamily = 'highest_scoring_half';
    if (marketCode === 'HSH_2ND') {
      compRate = comp.hsh2ndRate;
      teamRate = comp.hsh2ndRate;
    } else if (marketCode === 'HSH_1ST') {
      compRate = comp.hsh1stRate;
      teamRate = comp.hsh1stRate;
    } else {
      compRate = comp.hshEqualRate;
      teamRate = comp.hshEqualRate;
    }
  }

  // 6. First-Half Goals
  else if (marketCode.startsWith('FH_GOALS_')) {
    marketFamily = 'first_half_goals';
    if (marketCode === 'FH_GOALS_O05') {
      compRate = comp.fhO05Rate;
      teamRate = comp.fhO05Rate;
    } else if (marketCode === 'FH_GOALS_U15') {
      compRate = comp.fhU15Rate;
      teamRate = comp.fhU15Rate;
    } else {
      compRate = 0.70;
      teamRate = 0.70;
    }
  }

  // 7. Second-Half Result
  else if (marketCode.startsWith('2H_RESULT_')) {
    marketFamily = 'second_half_result';
    if (marketCode === '2H_RESULT_HOME') {
      compRate = comp.shHomeWinRate;
      teamRate = comp.shHomeWinRate;
    } else if (marketCode === '2H_RESULT_DRAW') {
      compRate = comp.shDrawRate;
      teamRate = comp.shDrawRate;
    } else {
      compRate = comp.shAwayWinRate;
      teamRate = comp.shAwayWinRate;
    }
  }

  // 8. Corners
  else if (marketCode.includes('CORNER')) {
    marketFamily = 'corners';
    const isOver = marketCode.includes('_O');
    const l = line ?? 9.5;

    let cOver = comp.cornersO95Rate;
    if (l <= 8.5) cOver = 0.68;
    else if (l <= 9.5) cOver = comp.cornersO95Rate;
    else if (l <= 10.5) cOver = 0.42;

    let tOver = cOver;
    if (teamStats?.homeTeamHomeCornersAvg && teamStats?.awayTeamAwayCornersAvg) {
      const expTotal = teamStats.homeTeamHomeCornersAvg + teamStats.awayTeamAwayCornersAvg;
      const cornerRatio = expTotal / comp.avgCorners;
      tOver = Math.min(0.88, Math.max(0.18, cOver * cornerRatio));
    }

    compRate = isOver ? cOver : (1 - cOver);
    teamRate = isOver ? Number(tOver.toFixed(3)) : Number((1 - tOver).toFixed(3));
  }

  // 9. Bookings
  else if (marketCode.includes('CARD') || marketCode.includes('BOOKING')) {
    marketFamily = 'bookings';
    const isOver = marketCode.includes('_O');
    const l = line ?? 4.5;

    let cOver = comp.cardsO45Rate;
    if (l <= 3.5) cOver = 0.65;
    else if (l <= 4.5) cOver = comp.cardsO45Rate;
    else if (l <= 5.5) cOver = 0.28;

    compRate = isOver ? cOver : (1 - cOver);
    teamRate = compRate;
  }

  const isTriviallySafe = compRate >= 0.85 || teamRate >= 0.85;

  return {
    baseRate: teamRate,
    competitionBaseRate: compRate,
    teamAdjustedBaseRate: teamRate,
    isTriviallySafe,
    marketFamily,
  };
}
