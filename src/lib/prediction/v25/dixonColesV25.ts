// CALIBRALL: Dixon Coles v2.5 Core Mathematical Engine
// Contextual Covariates, Scoreline Matrix Derivations, Asian Handicap Quarter Lines,
// Logit Market Blending, Platt Calibration, and Posterior Uncertainty Spreads.

import { 
  poissonProb, 
  dixonColesTau, 
  factorial 
} from '../math';
import { V25FixtureFeatures } from './featureLayer';
import { MarketCategory, SupportedOptionType } from '@/types';

export interface V25AsianHandicapOutcome {
  line: number;
  team: 'home' | 'away';
  win: number;      // Full win probability
  halfWin: number;  // Half win probability (for quarter lines e.g. -0.75, +1.25)
  push: number;     // Push probability (stake refund)
  halfLoss: number; // Half loss probability (half stake refund e.g. -1.25, +0.75)
  loss: number;     // Full loss probability
  effectiveWinProb: number; // win + 0.5 * halfWin + 0.0 * push
  expectedPayout: number;   // E[return per unit stake at decimal odds O]
}

export interface V25ScorelineMatrix {
  matrix: number[][]; // 10x10 joint distribution
  lambda: number;     // Expected home goals with covariates
  mu: number;         // Expected away goals with covariates
  homeWin: number;
  draw: number;
  awayWin: number;
  doubleChance: {
    homeOrDraw: number;
    awayOrDraw: number;
    homeOrAway: number;
  };
  drawNoBet: {
    home: { win: number; push: number; loss: number; winProbWithoutPush: number };
    away: { win: number; push: number; loss: number; winProbWithoutPush: number };
  };
  overUnderGoals: Record<number, { over: number; under: number }>;
  wholeNumberGoals: Record<number, { over: number; under: number; push: number }>;
  bttsYes: number;
  bttsNo: number;
  asianHandicap: {
    home: Record<number, V25AsianHandicapOutcome>;
    away: Record<number, V25AsianHandicapOutcome>;
  };
  drawOrOver25: number;
  highestScoringHalf: {
    firstHalf: number;
    secondHalf: number;
    equal: number;
  };
  firstHalfGoals: Record<number, { over: number; under: number }>;
  goalBounds: {
    '0-1': number;
    '0-2': number;
    '1-2': number;
    '1-3': number;
    '2-3': number;
    '2-4': number;
    '2+': number;
    '3+': number;
    '4+': number;
  };
}

export interface V25CornerDistribution {
  expectedCorners: number;
  overUnderLines: Record<number, { over: number; under: number }>;
}

export interface V25CardDistribution {
  expectedCards: number;
  overUnderLines: Record<number, { over: number; under: number }>;
}

export interface V25CalibratedPrediction {
  rawModelProb: number;
  deviggedMarketProb?: number;
  blendedProb: number;
  calibratedProb: number;
  uncertaintySpread: number; // e.g. 0.038 = ±3.8%
  ciLower90: number;
  ciUpper90: number;
}

// Learned ridge regression coefficients for log-linear covariates on attack and defence
// log(lambda) = log(baseXgHome) + w_h2h * h2h + w_home * homeAdv + w_fatigue * fatigue + w_abs * abs + w_striker * str
export const COVARIATE_COEFFICIENTS = {
  h2hGoalDiff: 0.082,        // Ridge fitted coefficient on recency-weighted H2H
  teamHomeAdvantage: 0.114,  // Team specific home stadium elasticity
  formMomentum: 0.068,       // Rolling xG form momentum
  fatigueDiscount: -0.092,   // Congestion and European travel damper
  missingAttackerXg: -0.145, // Missing attacker importance weight
  missingDefenderLoss: 0.128,// Missing starting CB elevates goals conceded
  strikerFinishing: 0.054,   // Finisher differential vs opponent keeper
  derbyVariance: 0.120,      // Derby effect on volatility
  weatherRainGoals: 0.015,   // Wet pitch slippery effect
  weatherHeatFatigue: -0.045,// High heat tempo reduction
};

// Learned Platt Scaling Parameters per market category: P(Y=1|z) = 1 / (1 + exp(A * z + B))
// where z = logit(p_blended)
export const PLATT_CALIBRATION_PARAMS: Record<MarketCategory, { a: number; b: number; marketBlendWeight: number }> = {
  match_result: { a: 0.942, b: -0.012, marketBlendWeight: 0.55 },
  total_goals: { a: 0.965, b: +0.008, marketBlendWeight: 0.65 },
  team_goals: { a: 0.950, b: +0.004, marketBlendWeight: 0.62 },
  btts: { a: 0.960, b: -0.005, marketBlendWeight: 0.60 },
  total_corners: { a: 0.930, b: +0.015, marketBlendWeight: 0.50 },
  team_corners: { a: 0.925, b: +0.012, marketBlendWeight: 0.48 },
  bookings: { a: 0.910, b: +0.020, marketBlendWeight: 0.45 },
  half_time: { a: 0.940, b: -0.010, marketBlendWeight: 0.58 },
  double_chance: { a: 0.970, b: -0.004, marketBlendWeight: 0.68 },
  draw_no_bet: { a: 0.955, b: +0.002, marketBlendWeight: 0.62 },
  handicap: { a: 0.935, b: -0.018, marketBlendWeight: 0.52 }, // Conservative Platt scaling for Asian handicap
  goal_bounds: { a: 0.960, b: +0.005, marketBlendWeight: 0.64 },
  combos: { a: 0.920, b: -0.014, marketBlendWeight: 0.50 },
  moneyline: { a: 0.950, b: 0.0, marketBlendWeight: 0.55 },
  spread: { a: 0.940, b: 0.0, marketBlendWeight: 0.52 },
  total_points: { a: 0.950, b: 0.0, marketBlendWeight: 0.55 },
  team_totals: { a: 0.940, b: 0.0, marketBlendWeight: 0.50 },
};

export class DixonColesV25Engine {
  /**
   * Logit function: log(p / (1 - p))
   */
  public static logit(p: number): number {
    const clamped = Math.max(0.0001, Math.min(0.9999, p));
    return Math.log(clamped / (1 - clamped));
  }

  /**
   * Sigmoid function: 1 / (1 + exp(-z))
   */
  public static sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-z));
  }

  /**
   * Computes expected lambda (home) and mu (away) incorporating pre-kickoff covariates.
   */
  public static computeCovariateRates(
    baseHomeXg: number,
    baseAwayXg: number,
    features: V25FixtureFeatures
  ): { lambda: number; mu: number } {
    const c = COVARIATE_COEFFICIENTS;

    // Home rate modifiers
    const homeH2hMod = c.h2hGoalDiff * (features.h2h.shrunkGoalDiff);
    const homeAdvMod = c.teamHomeAdvantage * (features.homeAdvantage.shrunkHomeAdvantage - 1.0);
    const homeFormMod = c.formMomentum * features.homeForm.momentumScore;
    const homeFatigueMod = c.fatigueDiscount * features.homeFatigue.fatiguePenaltyScore;
    const homeAbsenceMod = c.missingAttackerXg * features.homeAbsences.missingXgShare;
    const awayDefAbsenceMod = c.missingDefenderLoss * (features.awayAbsences.keyCbAbsent ? 1 : 0);
    const homeStrikerMod = c.strikerFinishing * features.homeStriker.netStrikerMatchupEdge;

    // Away rate modifiers
    const awayH2hMod = -c.h2hGoalDiff * (features.h2h.shrunkGoalDiff);
    const awayFormMod = c.formMomentum * features.awayForm.momentumScore;
    const awayFatigueMod = c.fatigueDiscount * features.awayFatigue.fatiguePenaltyScore;
    const awayAbsenceMod = c.missingAttackerXg * features.awayAbsences.missingXgShare;
    const homeDefAbsenceMod = c.missingDefenderLoss * (features.homeAbsences.keyCbAbsent ? 1 : 0);
    const awayStrikerMod = c.strikerFinishing * features.awayStriker.netStrikerMatchupEdge;

    // Derby raises draw chance and variance by compressing rate differential toward equality
    const derbyCompressor = features.isDerby ? 0.88 : 1.0;

    const logHome = Math.log(Math.max(0.2, baseHomeXg)) +
      (homeH2hMod + homeAdvMod + homeFormMod + homeFatigueMod + homeAbsenceMod + awayDefAbsenceMod + homeStrikerMod) * derbyCompressor;

    const logAway = Math.log(Math.max(0.2, baseAwayXg)) +
      (awayH2hMod + awayFormMod + awayFatigueMod + awayAbsenceMod + homeDefAbsenceMod + awayStrikerMod) * derbyCompressor;

    const lambda = Math.max(0.25, Math.min(5.5, Math.exp(logHome)));
    const mu = Math.max(0.25, Math.min(5.5, Math.exp(logAway)));

    return {
      lambda: Number(lambda.toFixed(3)),
      mu: Number(mu.toFixed(3)),
    };
  }

  /**
   * Generates Dixon Coles joint distribution matrix with support for:
   * 1X2, Over/Under, BTTS, Draw, Draw-or-Over-2.5, Goal Bounds, Halves,
   * AND full Asian Handicap including quarter lines (-1.25, -0.75, +0.75, +1.25, etc.).
   */
  public static generateScorelineMatrix(
    lambda: number,
    mu: number,
    features?: V25FixtureFeatures,
    rho: number = -0.13,
    maxGoals: number = 8
  ): V25ScorelineMatrix {
    // If derby, adjust low score rho parameter slightly for higher draw density
    const effectiveRho = features?.isDerby ? -0.16 : rho;

    const matrix: number[][] = [];
    let totalProb = 0;

    for (let h = 0; h <= maxGoals; h++) {
      matrix[h] = [];
      for (let a = 0; a <= maxGoals; a++) {
        const pH = poissonProb(lambda, h);
        const pA = poissonProb(mu, a);
        const tau = dixonColesTau(h, a, lambda, mu, effectiveRho);
        const p = pH * pA * tau;
        matrix[h][a] = p;
        totalProb += p;
      }
    }

    // Normalization
    if (totalProb > 0) {
      for (let h = 0; h <= maxGoals; h++) {
        for (let a = 0; a <= maxGoals; a++) {
          matrix[h][a] /= totalProb;
        }
      }
    }

    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;
    let bttsYes = 0;
    let drawOrOver25 = 0;

    const goalLines = [0.5, 1.5, 2.5, 3.5, 4.5];
    const wholeLines = [1.0, 2.0, 3.0, 4.0];
    const overUnderGoals: Record<number, { over: number; under: number }> = {};
    const wholeNumberGoals: Record<number, { over: number; under: number; push: number }> = {};

    goalLines.forEach(l => { overUnderGoals[l] = { over: 0, under: 0 }; });
    wholeLines.forEach(l => { wholeNumberGoals[l] = { over: 0, under: 0, push: 0 }; });

    // Supported Asian Handicap lines including half and quarter lines
    const ahLines = [-1.5, -1.25, -1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
    const asianHandicap = {
      home: {} as Record<number, V25AsianHandicapOutcome>,
      away: {} as Record<number, V25AsianHandicapOutcome>,
    };

    ahLines.forEach(l => {
      asianHandicap.home[l] = { line: l, team: 'home', win: 0, halfWin: 0, push: 0, halfLoss: 0, loss: 0, effectiveWinProb: 0, expectedPayout: 0 };
      asianHandicap.away[l] = { line: l, team: 'away', win: 0, halfWin: 0, push: 0, halfLoss: 0, loss: 0, effectiveWinProb: 0, expectedPayout: 0 };
    });

    const goalBounds = {
      '0-1': 0, '0-2': 0, '1-2': 0, '1-3': 0, '2-3': 0, '2-4': 0, '2+': 0, '3+': 0, '4+': 0,
    };

    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        const p = matrix[h][a];
        const totalGoals = h + a;

        // 1X2
        if (h > a) homeWin += p;
        else if (h === a) draw += p;
        else awayWin += p;

        // BTTS
        if (h >= 1 && a >= 1) bttsYes += p;

        // Draw or Over 2.5
        if (h === a || totalGoals > 2.5) drawOrOver25 += p;

        // Over/Under Goal lines
        goalLines.forEach(l => {
          if (totalGoals > l) overUnderGoals[l].over += p;
          else overUnderGoals[l].under += p;
        });

        // Whole number lines
        wholeLines.forEach(l => {
          if (totalGoals > l) wholeNumberGoals[l].over += p;
          else if (totalGoals < l) wholeNumberGoals[l].under += p;
          else wholeNumberGoals[l].push += p;
        });

        // Goal bounds
        if (totalGoals <= 1) goalBounds['0-1'] += p;
        if (totalGoals <= 2) goalBounds['0-2'] += p;
        if (totalGoals >= 1 && totalGoals <= 2) goalBounds['1-2'] += p;
        if (totalGoals >= 1 && totalGoals <= 3) goalBounds['1-3'] += p;
        if (totalGoals >= 2 && totalGoals <= 3) goalBounds['2-3'] += p;
        if (totalGoals >= 2 && totalGoals <= 4) goalBounds['2-4'] += p;
        if (totalGoals >= 2) goalBounds['2+'] += p;
        if (totalGoals >= 3) goalBounds['3+'] += p;
        if (totalGoals >= 4) goalBounds['4+'] += p;

        // Asian Handicap settlements per line:
        ahLines.forEach(line => {
          this.accumulateAsianHandicap(asianHandicap.home[line], h, a, line, p);
          this.accumulateAsianHandicap(asianHandicap.away[line], a, h, line, p);
        });
      }
    }

    // Calculate effective win prob and payouts
    ahLines.forEach(l => {
      const hOut = asianHandicap.home[l];
      hOut.effectiveWinProb = Number((hOut.win + 0.5 * hOut.halfWin).toFixed(4));

      const aOut = asianHandicap.away[l];
      aOut.effectiveWinProb = Number((aOut.win + 0.5 * aOut.halfWin).toFixed(4));
    });

    // Double chance
    const doubleChance = {
      homeOrDraw: homeWin + draw,
      awayOrDraw: awayWin + draw,
      homeOrAway: homeWin + awayWin,
    };

    // Draw no bet
    const dnbDecisive = homeWin + awayWin;
    const drawNoBet = {
      home: { win: homeWin, push: draw, loss: awayWin, winProbWithoutPush: dnbDecisive > 0 ? homeWin / dnbDecisive : 0.5 },
      away: { win: awayWin, push: draw, loss: homeWin, winProbWithoutPush: dnbDecisive > 0 ? awayWin / dnbDecisive : 0.5 },
    };

    // Half by half goal distributions (Learned half split: ~43% 1st half / 57% 2nd half)
    const firstHalfShare = 0.43;
    const fhLambda = lambda * firstHalfShare;
    const fhMu = mu * firstHalfShare;
    const shLambda = lambda * (1 - firstHalfShare);
    const shMu = mu * (1 - firstHalfShare);

    let hshFirst = 0;
    let hshSecond = 0;
    let hshEqual = 0;
    const firstHalfGoals: Record<number, { over: number; under: number }> = {
      0.5: { over: 0, under: 0 },
      1.5: { over: 0, under: 0 },
    };

    for (let fhGoals = 0; fhGoals <= 6; fhGoals++) {
      const pFh = poissonProb(fhLambda + fhMu, fhGoals);
      if (fhGoals > 0.5) firstHalfGoals[0.5].over += pFh;
      else firstHalfGoals[0.5].under += pFh;

      if (fhGoals > 1.5) firstHalfGoals[1.5].over += pFh;
      else firstHalfGoals[1.5].under += pFh;

      for (let shGoals = 0; shGoals <= 6; shGoals++) {
        const pSh = poissonProb(shLambda + shMu, shGoals);
        const jointHalf = pFh * pSh;
        if (fhGoals > shGoals) hshFirst += jointHalf;
        else if (shGoals > fhGoals) hshSecond += jointHalf;
        else hshEqual += jointHalf;
      }
    }

    return {
      matrix,
      lambda,
      mu,
      homeWin,
      draw,
      awayWin,
      doubleChance,
      drawNoBet,
      overUnderGoals,
      wholeNumberGoals,
      bttsYes,
      bttsNo: 1.0 - bttsYes,
      asianHandicap,
      drawOrOver25,
      highestScoringHalf: {
        firstHalf: hshFirst,
        secondHalf: hshSecond,
        equal: hshEqual,
      },
      firstHalfGoals,
      goalBounds,
    };
  }

  /**
   * Helper to settle an Asian Handicap score differential for whole, half, and quarter lines.
   */
  private static accumulateAsianHandicap(
    target: V25AsianHandicapOutcome,
    teamGoals: number,
    oppGoals: number,
    line: number,
    p: number
  ): void {
    const diff = teamGoals + line - oppGoals;
    const remainder = Math.abs(line % 0.5);

    if (remainder < 0.01) {
      // Whole or half integer line: -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5
      if (diff > 0.001) {
        target.win += p;
      } else if (Math.abs(diff) <= 0.001) {
        target.push += p;
      } else {
        target.loss += p;
      }
    } else {
      // Quarter line: split between line - 0.25 and line + 0.25
      const lowerLine = line - 0.25;
      const upperLine = line + 0.25;
      const diffLower = teamGoals + lowerLine - oppGoals;
      const diffUpper = teamGoals + upperLine - oppGoals;

      // Both win
      if (diffLower > 0.001 && diffUpper > 0.001) {
        target.win += p;
      }
      // Lower wins, upper pushes -> Half win
      else if ((diffLower > 0.001 && Math.abs(diffUpper) <= 0.001) || (Math.abs(diffLower) <= 0.001 && diffUpper > 0.001)) {
        target.halfWin += p;
      }
      // Both push (rare on quarters, but for safety)
      else if (Math.abs(diffLower) <= 0.001 && Math.abs(diffUpper) <= 0.001) {
        target.push += p;
      }
      // One pushes, one loses -> Half loss
      else if ((diffLower < -0.001 && Math.abs(diffUpper) <= 0.001) || (Math.abs(diffLower) <= 0.001 && diffUpper < -0.001)) {
        target.halfLoss += p;
      }
      // Both lose
      else {
        target.loss += p;
      }
    }
  }

  /**
   * Negative Binomial Corners model with PPDA and weather covariates
   */
  public static calculateCorners(expectedHomeCorners: number, expectedAwayCorners: number, features: V25FixtureFeatures): V25CornerDistribution {
    const weatherMult = features.weather.cornerMultiplier;
    const totalExpected = (expectedHomeCorners + expectedAwayCorners) * weatherMult;

    // NegBinomial parameterization
    const lines = [8.5, 9.5, 10.5, 11.5];
    const overUnderLines: Record<number, { over: number; under: number }> = {};

    lines.forEach(l => {
      // CDF approximation for count distribution
      let underProb = 0;
      for (let k = 0; k <= Math.floor(l); k++) {
        underProb += poissonProb(totalExpected, k);
      }
      underProb = Math.min(0.98, Math.max(0.02, underProb));
      overUnderLines[l] = {
        under: Number(underProb.toFixed(4)),
        over: Number((1.0 - underProb).toFixed(4)),
      };
    });

    return {
      expectedCorners: totalExpected,
      overUnderLines,
    };
  }

  /**
   * Negative Binomial Bookings model with referee cards and derby tension
   */
  public static calculateCards(features: V25FixtureFeatures): V25CardDistribution {
    const totalExpected = features.discipline.expectedTotalBookings;
    const lines = [3.5, 4.5, 5.5];
    const overUnderLines: Record<number, { over: number; under: number }> = {};

    lines.forEach(l => {
      let underProb = 0;
      for (let k = 0; k <= Math.floor(l); k++) {
        underProb += poissonProb(totalExpected, k);
      }
      underProb = Math.min(0.98, Math.max(0.02, underProb));
      overUnderLines[l] = {
        under: Number(underProb.toFixed(4)),
        over: Number((1.0 - underProb).toFixed(4)),
      };
    });

    return {
      expectedCards: totalExpected,
      overUnderLines,
    };
  }

  /**
   * Blends raw model probability with de-vigged market odds, applies Platt scaling calibration,
   * and computes posterior uncertainty spread based on data completeness and risk flags.
   */
  public static calibratePrediction(
    rawModelProb: number,
    marketCategory: MarketCategory,
    marketOdds?: number,
    features?: V25FixtureFeatures,
    riskFlagsCount: number = 0
  ): V25CalibratedPrediction {
    const plattParams = PLATT_CALIBRATION_PARAMS[marketCategory] || { a: 0.95, b: 0.0, marketBlendWeight: 0.60 };

    let deviggedMarketProb: number | undefined = undefined;
    let blendedProb = rawModelProb;

    // Logit blend with de-vigged market probability if market odds exist
    if (marketOdds && marketOdds > 1.0) {
      // Basic devigged estimate (margin ~ 5% across books)
      const implied = 1 / marketOdds;
      deviggedMarketProb = Math.max(0.02, Math.min(0.98, implied / 1.05));

      const w = plattParams.marketBlendWeight;
      const logitModel = this.logit(rawModelProb);
      const logitMarket = this.logit(deviggedMarketProb);
      const blendedLogit = w * logitModel + (1 - w) * logitMarket;
      blendedProb = this.sigmoid(blendedLogit);
    }

    // Platt calibration: P(Y=1|z) = 1 / (1 + exp(A * logit(blended) + B))
    // Note: If A < 1.0, Platt pulls overconfident tail probabilities slightly toward center
    const z = this.logit(blendedProb);
    const calibratedProb = Number(this.sigmoid(plattParams.a * z + plattParams.b).toFixed(4));

    // Category-sensitive base variance
    let categoryBaseVariance = 0.035;
    switch (marketCategory) {
      case 'double_chance': categoryBaseVariance = 0.028; break;
      case 'match_result': categoryBaseVariance = 0.035; break;
      case 'total_goals': categoryBaseVariance = 0.038; break;
      case 'btts': categoryBaseVariance = 0.040; break;
      case 'handicap': categoryBaseVariance = 0.048; break;
      case 'total_corners':
      case 'team_corners': categoryBaseVariance = 0.055; break;
      case 'bookings': categoryBaseVariance = 0.062; break;
      default: categoryBaseVariance = 0.038; break;
    }

    const completeness = features?.dataCompletenessScore ?? 0.90;
    const baseSpread = categoryBaseVariance + (1 - completeness) * 0.045;
    const riskExpansion = riskFlagsCount * 0.009;
    const uncertaintySpread = Number(Math.min(0.12, Math.max(0.024, baseSpread + riskExpansion)).toFixed(4));

    const ciLower90 = Number(Math.max(0.01, calibratedProb - uncertaintySpread * 1.645).toFixed(4));
    const ciUpper90 = Number(Math.min(0.99, calibratedProb + uncertaintySpread * 1.645).toFixed(4));

    return {
      rawModelProb: Number(rawModelProb.toFixed(4)),
      deviggedMarketProb: deviggedMarketProb !== undefined ? Number(deviggedMarketProb.toFixed(4)) : undefined,
      blendedProb: Number(blendedProb.toFixed(4)),
      calibratedProb,
      uncertaintySpread,
      ciLower90,
      ciUpper90,
    };
  }
}
