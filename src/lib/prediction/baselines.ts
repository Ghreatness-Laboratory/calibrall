// MATCHMIND: Empirical Market Baselines & Naive Frequency Benchmarks
// Provides real historical competition and team-adjusted frequencies for all 10 authorized market families.
// Used to compute true skill, edge-over-baseline, and prevent bias toward trivially high raw probabilities.

import { getLeagueCalibratedConfig, resolveLeagueGoalMeans } from './calibratedParams';
import { poissonProb } from './math';

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
  | 'bookings'
  | 'handicap'
  | 'multi_goals';

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
  'handicap',
  'multi_goals',
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
  cornersO75Rate: number;
  cornersO85Rate: number;
  cornersO95Rate: number;
  cornersO105Rate: number;
  cornersO115Rate: number;
  cardsO25Rate: number;
  cardsO35Rate: number;
  cardsO45Rate: number;
  cardsO55Rate: number;
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
    cornersO75Rate: 0.781,
    cornersO85Rate: 0.674,
    cornersO95Rate: 0.558,
    cornersO105Rate: 0.435,
    cornersO115Rate: 0.331,
    cardsO25Rate: 0.711,
    cardsO35Rate: 0.524,
    cardsO45Rate: 0.428,
    cardsO55Rate: 0.194,
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
    cornersO75Rate: 0.695,
    cornersO85Rate: 0.578,
    cornersO95Rate: 0.462,
    cornersO105Rate: 0.348,
    cornersO115Rate: 0.245,
    cardsO25Rate: 0.858,
    cardsO35Rate: 0.718,
    cardsO45Rate: 0.542,
    cardsO55Rate: 0.382,
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
    cornersO75Rate: 0.745,
    cornersO85Rate: 0.640,
    cornersO95Rate: 0.534,
    cornersO105Rate: 0.415,
    cornersO115Rate: 0.305,
    cardsO25Rate: 0.718,
    cardsO35Rate: 0.525,
    cardsO45Rate: 0.348,
    cardsO55Rate: 0.195,
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
    cornersO75Rate: 0.715,
    cornersO85Rate: 0.602,
    cornersO95Rate: 0.485,
    cornersO105Rate: 0.370,
    cornersO115Rate: 0.265,
    cardsO25Rate: 0.818,
    cardsO35Rate: 0.665,
    cardsO45Rate: 0.495,
    cardsO55Rate: 0.332,
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
    cornersO75Rate: 0.735,
    cornersO85Rate: 0.625,
    cornersO95Rate: 0.515,
    cornersO105Rate: 0.398,
    cornersO115Rate: 0.292,
    cardsO25Rate: 0.745,
    cardsO35Rate: 0.565,
    cardsO45Rate: 0.385,
    cardsO55Rate: 0.235,
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
    cornersO75Rate: 0.740,
    cornersO85Rate: 0.628,
    cornersO95Rate: 0.510,
    cornersO105Rate: 0.392,
    cornersO115Rate: 0.285,
    cardsO25Rate: 0.770,
    cardsO35Rate: 0.600,
    cardsO45Rate: 0.445,
    cardsO55Rate: 0.280,
  },
};

/**
 * Resolves historical competition baseline frequencies strictly from calibrated DB leagues first,
 * falling back to REAL_LEAGUE_HISTORICAL_FREQUENCIES when unavailable.
 */
function resolveCompetitionFreq(competitionCode: string) {
  const cal = getLeagueCalibratedConfig(competitionCode);
  const fallback = REAL_LEAGUE_HISTORICAL_FREQUENCIES[competitionCode] || REAL_LEAGUE_HISTORICAL_FREQUENCIES.DEFAULT;
  if (!cal) {
    const gm = resolveLeagueGoalMeans(competitionCode);
    return {
      ...fallback,
      avgHomeGoals: gm.avgHomeGoals,
      avgAwayGoals: gm.avgAwayGoals,
    };
  }
  return {
    avgGoals: cal.goals.avgGoals,
    avgHomeGoals: cal.goals.avgHomeGoals,
    avgAwayGoals: cal.goals.avgAwayGoals,
    avgCorners: cal.corners?.avgTotalCorners ?? fallback.avgCorners,
    avgCards: cal.cards?.avgTotalCards ?? fallback.avgCards,
    homeWinRate: cal.goals.homeWinRate,
    drawRate: cal.goals.drawRate,
    awayWinRate: cal.goals.awayWinRate,
    o15Rate: cal.goals.o15Rate,
    o25Rate: cal.goals.o25Rate,
    o35Rate: cal.goals.o35Rate,
    bttsRate: cal.goals.bttsRate,
    fhO05Rate: cal.halves?.fhO05Rate ?? fallback.fhO05Rate,
    fhU15Rate: cal.halves?.fhU15Rate ?? fallback.fhU15Rate,
    hsh2ndRate: cal.halves?.hsh2ndRate ?? fallback.hsh2ndRate,
    hsh1stRate: cal.halves?.hsh1stRate ?? fallback.hsh1stRate,
    hshEqualRate: cal.halves?.hshEqualRate ?? fallback.hshEqualRate,
    shHomeWinRate: cal.halves?.shHomeWinRate ?? fallback.shHomeWinRate,
    shDrawRate: cal.halves?.shDrawRate ?? fallback.shDrawRate,
    shAwayWinRate: cal.halves?.shAwayWinRate ?? fallback.shAwayWinRate,
    cornersO75Rate: cal.corners?.o75Rate ?? fallback.cornersO75Rate,
    cornersO85Rate: cal.corners?.o85Rate ?? fallback.cornersO85Rate,
    cornersO95Rate: cal.corners?.o95Rate ?? fallback.cornersO95Rate,
    cornersO105Rate: cal.corners?.o105Rate ?? fallback.cornersO105Rate,
    cornersO115Rate: cal.corners?.o115Rate ?? fallback.cornersO115Rate,
    cardsO25Rate: cal.cards?.o25Rate ?? fallback.cardsO25Rate,
    cardsO35Rate: cal.cards?.o35Rate ?? fallback.cardsO35Rate,
    cardsO45Rate: cal.cards?.o45Rate ?? fallback.cardsO45Rate,
    cardsO55Rate: cal.cards?.o55Rate ?? fallback.cardsO55Rate,
  };
}

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
  const comp = resolveCompetitionFreq(competitionCode);

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
  } else if (marketCode === 'COMBO_DRAW_OR_O25') {
    marketFamily = 'double_chance';
    // Inclusion-exclusion: Draw OR Over 2.5 (~18.5% of draws are 2-2+ which are already in o25Rate)
    compRate = Number(Math.min(0.85, Math.max(0.35, 0.815 * comp.drawRate + comp.o25Rate)).toFixed(3));
    const hDraw = teamStats?.homeTeamDrawRate ?? comp.drawRate;
    const adjDraw = (hDraw + comp.drawRate) / 2;
    const avgTeamO25 = (teamStats?.homeTeamHomeO25Rate !== undefined && teamStats?.awayTeamAwayO25Rate !== undefined)
      ? (teamStats.homeTeamHomeO25Rate + teamStats.awayTeamAwayO25Rate) / 2
      : comp.o25Rate;
    teamRate = Number(Math.min(0.85, Math.max(0.35, 0.815 * adjDraw + avgTeamO25)).toFixed(3));
  }

  // 2b. Team Totals Over / Under Goals (Home or Away 0.5, 1.5, 2.5)
  else if (marketCode.startsWith('TEAM_GOALS_HOME_') || marketCode.startsWith('TEAM_GOALS_AWAY_')) {
    marketFamily = 'goals_over_under';
    const isHomeTeam = marketCode.startsWith('TEAM_GOALS_HOME_');
    const isOver = marketCode.includes('_O');
    const l = line ?? 1.5;
    const lambda = isHomeTeam ? comp.avgHomeGoals : comp.avgAwayGoals;
    let underProb = 0;
    for (let g = 0; g <= Math.floor(l); g++) {
      underProb += poissonProb(lambda, g);
    }
    underProb = Math.min(0.98, Math.max(0.02, underProb));
    compRate = Number((isOver ? (1 - underProb) : underProb).toFixed(3));
    teamRate = compRate;
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
    if (l <= 7.5) cOver = comp.cornersO75Rate;
    else if (l <= 8.5) cOver = comp.cornersO85Rate;
    else if (l <= 9.5) cOver = comp.cornersO95Rate;
    else if (l <= 10.5) cOver = comp.cornersO105Rate;
    else cOver = comp.cornersO115Rate;

    let tOver = cOver;
    if (teamStats?.homeTeamHomeCornersAvg && teamStats?.awayTeamAwayCornersAvg) {
      const expTotal = teamStats.homeTeamHomeCornersAvg + teamStats.awayTeamAwayCornersAvg;
      const cornerRatio = expTotal / comp.avgCorners;
      tOver = Math.min(0.92, Math.max(0.14, cOver * cornerRatio));
    }

    compRate = isOver ? cOver : (1 - cOver);
    teamRate = isOver ? Number(tOver.toFixed(3)) : Number((1 - tOver).toFixed(3));
  }

  // 9. Cards
  else if (marketCode.includes('CARD') || marketCode.includes('BOOKING')) {
    marketFamily = 'bookings';
    const isOver = marketCode.includes('_O');
    const l = line ?? 4.5;

    let cOver = comp.cardsO45Rate;
    if (l <= 2.5) cOver = comp.cardsO25Rate;
    else if (l <= 3.5) cOver = comp.cardsO35Rate;
    else if (l <= 4.5) cOver = comp.cardsO45Rate;
    else cOver = comp.cardsO55Rate;

    compRate = isOver ? cOver : (1 - cOver);
    teamRate = compRate;
  }

  // 10. Handicap (Asian & European)
  else if (marketCode.startsWith('AH_') || marketCode.includes('HANDICAP')) {
    marketFamily = 'handicap';
    const isHome = marketCode.includes('_HOME');
    const l = line ?? 0.0;
    let rate = 0.50;
    if (l >= 1.5) rate = isHome ? 0.745 : 0.695;
    else if (l >= 1.25) rate = isHome ? 0.700 : 0.640;
    else if (l >= 1.0) rate = isHome ? 0.650 : 0.590;
    else if (l >= 0.75) rate = isHome ? 0.665 : 0.570;
    else if (l >= 0.5) rate = isHome ? Math.min(0.85, comp.homeWinRate + comp.drawRate) : Math.min(0.85, comp.awayWinRate + comp.drawRate);
    else if (l >= 0.25) rate = isHome ? comp.homeWinRate + 0.5 * comp.drawRate : comp.awayWinRate + 0.5 * comp.drawRate;
    else if (l === 0) rate = isHome ? comp.homeWinRate : comp.awayWinRate;
    else if (l <= -1.5) rate = isHome ? 0.240 : 0.140;
    else if (l <= -1.25) rate = isHome ? 0.250 : 0.150;
    else if (l <= -1.0) rate = isHome ? 0.260 : 0.160;
    else if (l <= -0.75) rate = isHome ? 0.340 : 0.220;
    else if (l <= -0.5) rate = isHome ? comp.homeWinRate : comp.awayWinRate;
    else if (l <= -0.25) rate = isHome ? comp.homeWinRate * 0.92 : comp.awayWinRate * 0.92;
    compRate = Number(rate.toFixed(3));
    teamRate = compRate;
  }

  // 11. Multi Goals (Full match, Team Home/Away, First Half)
  else if (
    marketCode.startsWith('MULTI_GOALS_') ||
    marketCode.startsWith('TEAM_MULTI_GOALS_') ||
    marketCode.startsWith('FH_MULTI_GOALS_')
  ) {
    marketFamily = 'multi_goals';
    const matchRange = marketCode.match(/(\d+)_(\d+)$/);
    const minG = matchRange ? parseInt(matchRange[1], 10) : 2;
    const maxG = matchRange ? parseInt(matchRange[2], 10) : 4;
    let lambda = comp.avgGoals;
    if (marketCode.startsWith('TEAM_MULTI_GOALS_HOME_')) {
      lambda = comp.avgHomeGoals;
    } else if (marketCode.startsWith('TEAM_MULTI_GOALS_AWAY_')) {
      lambda = comp.avgAwayGoals;
    } else if (marketCode.startsWith('FH_MULTI_GOALS_')) {
      lambda = Math.max(0.5, comp.avgGoals * 0.439);
    }
    let sumP = 0;
    for (let g = minG; g <= maxG; g++) {
      sumP += poissonProb(lambda, g);
    }
    compRate = Number(Math.min(0.95, Math.max(0.05, sumP)).toFixed(4));
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
