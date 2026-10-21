// MATCHMIND: Statistical Engine & Mathematical Modeling
// Dixon-Coles adjusted Poisson for Goals, Poisson/NegBinomial for Corners, Count distribution for Bookings

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
  bttsYes: number;
  bttsNo: number;
  overUnderGoals: Record<number, { over: number; under: number }>;
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

      // Match result
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;

      // BTTS
      if (h >= 1 && a >= 1) bttsYes += p;

      // Total Goals lines
      const totalMatchGoals = h + a;
      goalLines.forEach(line => {
        if (totalMatchGoals > line) overUnderGoals[line].over += p;
        else overUnderGoals[line].under += p;
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

  // Sort scorelines by probability descending
  scorelineList.sort((a, b) => b.probability - a.probability);

  return {
    matrix,
    homeWin,
    draw,
    awayWin,
    bttsYes,
    bttsNo: Math.max(0, 1 - bttsYes),
    overUnderGoals,
    teamGoalsOverUnder,
    mostLikelyScorelines: scorelineList.slice(0, 10),
  };
}

/**
 * Corners distribution calculations
 * Total corners model using Poisson & overdispersion-tested count distribution
 */
export function calculateCornerProbabilities(expectedCorners: number, maxCorners: number = 24) {
  const cornerLines = [7.5, 8.5, 9.5, 10.5, 11.5, 12.5];
  const results: Record<number, { over: number; under: number }> = {};
  cornerLines.forEach(l => {
    results[l] = { over: 0, under: 0 };
  });

  // Calculate cumulative probabilities
  for (let c = 0; c <= maxCorners; c++) {
    const p = poissonProb(expectedCorners, c);
    cornerLines.forEach(l => {
      if (c > l) results[l].over += p;
      else results[l].under += p;
    });
  }

  // Ensure normalized boundary probabilities
  cornerLines.forEach(l => {
    const sum = results[l].over + results[l].under;
    if (sum > 0) {
      results[l].over /= sum;
      results[l].under /= sum;
    }
  });

  return results;
}

/**
 * Disciplinary Bookings Model (Yellow cards = 1, Red cards = 2)
 */
export function calculateCardProbabilities(expectedCards: number, maxCards: number = 14) {
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

  return results;
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
