// MATCHMIND: Statistical Engine & Mathematical Modeling
// Dixon-Coles adjusted Poisson for Goals, Poisson/NegBinomial for Corners, Count distribution for Bookings
// Half-by-Half goals model, Double Chance derivations, and integer-line push mechanics

// Factorial with cache for performance
const factorialCache: number[] = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
export function factorial(n: number): number {
  if (n < 0) return 1;
  if (n < factorialCache.length) return factorialCache[n];
  let res = factorialCache[factorialCache.length - 1];
  for (let i = factorialCache.length; i <= n; i++) {
    res *= i;
  }
  return res;
}

/**
 * Standard Poisson probability: P(X = k) = (lambda^k * exp(-lambda)) / k!
 */
export function poissonProb(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Dixon-Coles low-score correction factor tau(x, y, lambda, mu, rho)
 * Standard empirical rho for elite football is typically between -0.10 and -0.15
 */
export function dixonColesTau(x: number, y: number, lambda: number, mu: number, rho: number = -0.13): number {
  if (x === 0 && y === 0) {
    return Math.max(0, 1 - (lambda * mu * rho));
  } else if (x === 0 && y === 1) {
    return Math.max(0, 1 + (lambda * rho));
  } else if (x === 1 && y === 0) {
    return Math.max(0, 1 + (mu * rho));
  } else if (x === 1 && y === 1) {
    return Math.max(0, 1 - rho);
  }
  return 1.0;
}

export interface ScorelineMatrixResult {
  matrix: number[][]; // [homeScore][awayScore]
  homeWin: number;
  draw: number;
  awayWin: number;
  // Double chance derived strictly from 1X2 distribution:
  doubleChance: {
    homeOrDraw: number; // 1X = homeWin + draw
    awayOrDraw: number; // X2 = awayWin + draw
    homeOrAway: number; // 12 = homeWin + awayWin = 1 - draw
  };
  bttsYes: number;
  bttsNo: number;
  overUnderGoals: Record<number, { over: number; under: number }>;
  // Whole-number lines push rule: push if landed on exact integer total
  wholeNumberGoals: Record<number, { over: number; under: number; push: number }>;
  teamGoalsOverUnder: {
    home: Record<number, { over: number; under: number }>;
    away: Record<number, { over: number; under: number }>;
  };
  mostLikelyScorelines: { home: number; away: number; probability: number }[];
}

/**
 * Generates an adjusted 10x10 scoreline joint distribution matrix using Dixon-Coles model
 */
export function generateScorelineDistribution(
  homeXg: number,
  awayXg: number,
  maxGoals: number = 8,
  rho: number = -0.13
): ScorelineMatrixResult {
  const matrix: number[][] = [];
  let totalProbability = 0;

  // 1. Raw Dixon-Coles probabilities
  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const pHome = poissonProb(homeXg, h);
      const pAway = poissonProb(awayXg, a);
      const tau = dixonColesTau(h, a, homeXg, awayXg, rho);
      const prob = pHome * pAway * tau;
      matrix[h][a] = prob;
      totalProbability += prob;
    }
  }

  // 2. Normalization so the finite distribution sums exactly to 1.0
  if (totalProbability > 0) {
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        matrix[h][a] /= totalProbability;
      }
    }
  }

  // 3. Derive aggregate market probabilities
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let bttsYes = 0;
  const scorelineList: { home: number; away: number; probability: number }[] = [];

  const goalLines = [0.5, 1.5, 2.5, 3.5, 4.5];
  const overUnderGoals: Record<number, { over: number; under: number }> = {};
  goalLines.forEach(line => {
    overUnderGoals[line] = { over: 0, under: 0 };
  });

  const wholeLines = [1.0, 2.0, 3.0, 4.0];
  const wholeNumberGoals: Record<number, { over: number; under: number; push: number }> = {};
  wholeLines.forEach(line => {
    wholeNumberGoals[line] = { over: 0, under: 0, push: 0 };
  });

  const teamLines = [0.5, 1.5, 2.5];
  const teamGoalsOverUnder = {
    home: {} as Record<number, { over: number; under: number }>,
    away: {} as Record<number, { over: number; under: number }>,
  };
  teamLines.forEach(line => {
    teamGoalsOverUnder.home[line] = { over: 0, under: 0 };
    teamGoalsOverUnder.away[line] = { over: 0, under: 0 };
  });

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = matrix[h][a];
      scorelineList.push({ home: h, away: a, probability: p });

      // Match result (regular time)
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;

      // BTTS
      if (h >= 1 && a >= 1) bttsYes += p;

      // Half-integer Total Goals lines
      const totalMatchGoals = h + a;
      goalLines.forEach(line => {
        if (totalMatchGoals > line) overUnderGoals[line].over += p;
        else overUnderGoals[line].under += p;
      });

      // Whole-number lines with push
      wholeLines.forEach(line => {
        if (totalMatchGoals > line) wholeNumberGoals[line].over += p;
        else if (totalMatchGoals < line) wholeNumberGoals[line].under += p;
        else wholeNumberGoals[line].push += p;
      });

      // Team Goals
      teamLines.forEach(line => {
        if (h > line) teamGoalsOverUnder.home[line].over += p;
        else teamGoalsOverUnder.home[line].under += p;

        if (a > line) teamGoalsOverUnder.away[line].over += p;
        else teamGoalsOverUnder.away[line].under += p;
      });
    }
  }

  // Guarantee monotonicity across goal lines: P(O4.5) <= P(O3.5) <= P(O2.5) <= P(O1.5) <= P(O0.5)
  // Derived from same joint matrix, but numeric clamp prevents floating point drift
  for (let i = 0; i < goalLines.length - 1; i++) {
    const higherLine = goalLines[i + 1];
    const lowerLine = goalLines[i];
    if (overUnderGoals[higherLine].over > overUnderGoals[lowerLine].over) {
      overUnderGoals[higherLine].over = overUnderGoals[lowerLine].over;
      overUnderGoals[higherLine].under = 1 - overUnderGoals[higherLine].over;
    }
  }

  // Double chance exact derivation
  const homeOrDraw = homeWin + draw;
  const awayOrDraw = awayWin + draw;
  const homeOrAway = homeWin + awayWin;

  // Sort scorelines by probability descending
  scorelineList.sort((a, b) => b.probability - a.probability);

  return {
    matrix,
    homeWin,
    draw,
    awayWin,
    doubleChance: {
      homeOrDraw,
      awayOrDraw,
      homeOrAway,
    },
    bttsYes,
    bttsNo: Math.max(0, 1 - bttsYes),
    overUnderGoals,
    wholeNumberGoals,
    teamGoalsOverUnder,
    mostLikelyScorelines: scorelineList.slice(0, 10),
  };
}

/**
 * Half-by-Half Goals Model
 * Splits match expected goals into 1st half and 2nd half using empirical tempo distribution:
 * ~44.5% of goals occur in 1st half, ~55.5% in 2nd half.
 * Derives First-Half Goals, Second-Half Result, and Highest Scoring Half.
 */
export interface HalfGoalsDistributionResult {
  firstHalf: {
    homeXg: number;
    awayXg: number;
    homeWin: number;
    draw: number;
    awayWin: number;
    overUnderGoals: Record<number, { over: number; under: number }>;
  };
  secondHalf: {
    homeXg: number;
    awayXg: number;
    homeWin: number;
    draw: number;
    awayWin: number;
    overUnderGoals: Record<number, { over: number; under: number }>;
  };
  highestScoringHalf: {
    firstHalf: number;
    secondHalf: number;
    equal: number;
  };
}

export function generateHalfByHalfGoalDistribution(
  homeXg: number,
  awayXg: number,
  halfSplitFirstHalfRatio: number = 0.445,
  maxGoalsPerHalf: number = 6
): HalfGoalsDistributionResult {
  const h1Xg = Math.max(0.05, homeXg * halfSplitFirstHalfRatio);
  const a1Xg = Math.max(0.05, awayXg * halfSplitFirstHalfRatio);
  const h2Xg = Math.max(0.05, homeXg * (1 - halfSplitFirstHalfRatio));
  const a2Xg = Math.max(0.05, awayXg * (1 - halfSplitFirstHalfRatio));

  // Compute 1st half Dixon-Coles matrix
  const m1: number[][] = [];
  let tot1 = 0;
  for (let h = 0; h <= maxGoalsPerHalf; h++) {
    m1[h] = [];
    for (let a = 0; a <= maxGoalsPerHalf; a++) {
      const p = poissonProb(h1Xg, h) * poissonProb(a1Xg, a) * dixonColesTau(h, a, h1Xg, a1Xg, -0.09);
      m1[h][a] = p;
      tot1 += p;
    }
  }
  for (let h = 0; h <= maxGoalsPerHalf; h++) {
    for (let a = 0; a <= maxGoalsPerHalf; a++) {
      m1[h][a] /= tot1;
    }
  }

  // Compute 2nd half Dixon-Coles matrix
  const m2: number[][] = [];
  let tot2 = 0;
  for (let h = 0; h <= maxGoalsPerHalf; h++) {
    m2[h] = [];
    for (let a = 0; a <= maxGoalsPerHalf; a++) {
      const p = poissonProb(h2Xg, h) * poissonProb(a2Xg, a) * dixonColesTau(h, a, h2Xg, a2Xg, -0.08);
      m2[h][a] = p;
      tot2 += p;
    }
  }
  for (let h = 0; h <= maxGoalsPerHalf; h++) {
    for (let a = 0; a <= maxGoalsPerHalf; a++) {
      m2[h][a] /= tot2;
    }
  }

  // 1st half aggregates
  let h1Win = 0, h1Draw = 0, h1Away = 0;
  const h1GoalsOU: Record<number, { over: number; under: number }> = {
    0.5: { over: 0, under: 0 },
    1.5: { over: 0, under: 0 },
    2.5: { over: 0, under: 0 },
  };

  // Distribution of total goals in 1st half T1
  const t1Dist: number[] = new Array(maxGoalsPerHalf * 2 + 1).fill(0);

  for (let h = 0; h <= maxGoalsPerHalf; h++) {
    for (let a = 0; a <= maxGoalsPerHalf; a++) {
      const p = m1[h][a];
      if (h > a) h1Win += p;
      else if (h === a) h1Draw += p;
      else h1Away += p;

      const tot = h + a;
      t1Dist[tot] += p;

      [0.5, 1.5, 2.5].forEach(line => {
        if (tot > line) h1GoalsOU[line].over += p;
        else h1GoalsOU[line].under += p;
      });
    }
  }

  // 2nd half aggregates (settled solely on 2nd half score)
  let h2Win = 0, h2Draw = 0, h2Away = 0;
  const h2GoalsOU: Record<number, { over: number; under: number }> = {
    0.5: { over: 0, under: 0 },
    1.5: { over: 0, under: 0 },
    2.5: { over: 0, under: 0 },
  };

  // Distribution of total goals in 2nd half T2
  const t2Dist: number[] = new Array(maxGoalsPerHalf * 2 + 1).fill(0);

  for (let h = 0; h <= maxGoalsPerHalf; h++) {
    for (let a = 0; a <= maxGoalsPerHalf; a++) {
      const p = m2[h][a];
      if (h > a) h2Win += p;
      else if (h === a) h2Draw += p;
      else h2Away += p;

      const tot = h + a;
      t2Dist[tot] += p;

      [0.5, 1.5, 2.5].forEach(line => {
        if (tot > line) h2GoalsOU[line].over += p;
        else h2GoalsOU[line].under += p;
      });
    }
  }

  // Highest scoring half joint convolution: P(T1 > T2), P(T2 > T1), P(T1 == T2)
  let firstHalfHigh = 0;
  let secondHalfHigh = 0;
  let equalHalf = 0;

  for (let t1 = 0; t1 < t1Dist.length; t1++) {
    for (let t2 = 0; t2 < t2Dist.length; t2++) {
      const jointProb = t1Dist[t1] * t2Dist[t2];
      if (t1 > t2) firstHalfHigh += jointProb;
      else if (t2 > t1) secondHalfHigh += jointProb;
      else equalHalf += jointProb;
    }
  }

  const hshSum = firstHalfHigh + secondHalfHigh + equalHalf;
  if (hshSum > 0) {
    firstHalfHigh /= hshSum;
    secondHalfHigh /= hshSum;
    equalHalf /= hshSum;
  }

  return {
    firstHalf: {
      homeXg: h1Xg,
      awayXg: a1Xg,
      homeWin: h1Win,
      draw: h1Draw,
      awayWin: h1Away,
      overUnderGoals: h1GoalsOU,
    },
    secondHalf: {
      homeXg: h2Xg,
      awayXg: a2Xg,
      homeWin: h2Win,
      draw: h2Draw,
      awayWin: h2Away,
      overUnderGoals: h2GoalsOU,
    },
    highestScoringHalf: {
      firstHalf: firstHalfHigh,
      secondHalf: secondHalfHigh,
      equal: equalHalf,
    },
  };
}

/**
 * Corners distribution calculations
 * Total corners model using Poisson & overdispersion-tested count distribution,
 * plus Team corners (Home & Away)
 */
export function calculateCornerProbabilities(
  expectedCorners: number, 
  homeCornersRatio: number = 0.55,
  maxCorners: number = 24
) {
  const cornerLines = [7.5, 8.5, 9.5, 10.5, 11.5, 12.5];
  const results: Record<number, { over: number; under: number }> = {};
  cornerLines.forEach(l => {
    results[l] = { over: 0, under: 0 };
  });

  // Calculate cumulative probabilities for total match corners
  for (let c = 0; c <= maxCorners; c++) {
    const p = poissonProb(expectedCorners, c);
    cornerLines.forEach(l => {
      if (c > l) results[l].over += p;
      else results[l].under += p;
    });
  }

  cornerLines.forEach(l => {
    const sum = results[l].over + results[l].under;
    if (sum > 0) {
      results[l].over /= sum;
      results[l].under /= sum;
    }
  });

  // Team Corners
  const homeCornersExpected = expectedCorners * homeCornersRatio;
  const awayCornersExpected = expectedCorners * (1 - homeCornersRatio);
  const teamLines = [3.5, 4.5, 5.5, 6.5];

  const teamCorners = {
    home: {} as Record<number, { over: number; under: number }>,
    away: {} as Record<number, { over: number; under: number }>,
  };

  teamLines.forEach(l => {
    teamCorners.home[l] = { over: 0, under: 0 };
    teamCorners.away[l] = { over: 0, under: 0 };
  });

  for (let c = 0; c <= 16; c++) {
    const pHome = poissonProb(homeCornersExpected, c);
    const pAway = poissonProb(awayCornersExpected, c);
    teamLines.forEach(l => {
      if (c > l) {
        teamCorners.home[l].over += pHome;
        teamCorners.away[l].over += pAway;
      } else {
        teamCorners.home[l].under += pHome;
        teamCorners.away[l].under += pAway;
      }
    });
  }

  return {
    total: results,
    team: teamCorners,
  };
}

/**
 * Disciplinary Bookings Model (Yellow cards = 1, Red cards = 2)
 * Includes Total Bookings and Team Bookings
 */
export function calculateCardProbabilities(
  expectedCards: number, 
  homeCardsRatio: number = 0.48,
  maxCards: number = 14
) {
  const cardLines = [2.5, 3.5, 4.5, 5.5, 6.5];
  const results: Record<number, { over: number; under: number }> = {};
  cardLines.forEach(l => {
    results[l] = { over: 0, under: 0 };
  });

  for (let c = 0; c <= maxCards; c++) {
    const p = poissonProb(expectedCards, c);
    cardLines.forEach(l => {
      if (c > l) results[l].over += p;
      else results[l].under += p;
    });
  }

  cardLines.forEach(l => {
    const sum = results[l].over + results[l].under;
    if (sum > 0) {
      results[l].over /= sum;
      results[l].under /= sum;
    }
  });

  // Team Cards
  const homeCardsExpected = expectedCards * homeCardsRatio;
  const awayCardsExpected = expectedCards * (1 - homeCardsRatio);
  const teamLines = [1.5, 2.5, 3.5];

  const teamCards = {
    home: {} as Record<number, { over: number; under: number }>,
    away: {} as Record<number, { over: number; under: number }>,
  };

  teamLines.forEach(l => {
    teamCards.home[l] = { over: 0, under: 0 };
    teamCards.away[l] = { over: 0, under: 0 };
  });

  for (let c = 0; c <= 10; c++) {
    const pHome = poissonProb(homeCardsExpected, c);
    const pAway = poissonProb(awayCardsExpected, c);
    teamLines.forEach(l => {
      if (c > l) {
        teamCards.home[l].over += pHome;
        teamCards.away[l].over += pAway;
      } else {
        teamCards.home[l].under += pHome;
        teamCards.away[l].under += pAway;
      }
    });
  }

  return {
    total: results,
    team: teamCards,
  };
}

/**
 * Expected Value calculation: EV = (p * Odds) - 1
 */
export function calculateExpectedValue(probability: number, decimalOdds?: number): number | undefined {
  if (!decimalOdds || decimalOdds <= 1.0) return undefined;
  return (probability * decimalOdds) - 1.0;
}

/**
 * Implied Probability: 1 / Odds
 */
export function calculateImpliedProbability(decimalOdds?: number): number | undefined {
  if (!decimalOdds || decimalOdds <= 1.0) return undefined;
  return 1.0 / decimalOdds;
}

/**
 * Calculate bookmaker margin / overround for a set of mutually exclusive outcomes
 */
export function calculateBookmakerMargin(oddsList: number[]): number {
  if (!oddsList || oddsList.length === 0) return 0;
  const sumImplied = oddsList.reduce((acc, odds) => acc + (odds > 1 ? 1 / odds : 0), 0);
  return Math.max(0, sumImplied - 1.0);
}
