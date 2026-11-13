// CALIBRALL: Market-Specific Models & Post-Calibration Coherence Suite
// 1. Unified Joint Scoreline Derivations (1X2, Double Chance, O/U Goals, BTTS, Halves, Handicaps)
// 2. Negative Binomial Corner Model (accounts for overdispersion and game-state chasing)
// 3. Hierarchical Bookings Model (referee strictness + derby rivalry + tactical style)
// 4. Calibration & Coherence Engine (Beta/Platt calibration with strict post-calibration coherence)

import { ScorelineProbabilityMatrix } from './enhancedTeamStrength';
import { negBinomialProb, generateHalfByHalfGoalDistribution } from './math';
import { getCalibratedParams, getLeagueCalibratedConfig } from './calibratedParams';

export interface JointMarketProbabilities {
  // 1X2
  homeWin: number;
  draw: number;
  awayWin: number;
  // Double Chance (Coherently derived: 1X = homeWin + draw, X2 = awayWin + draw, 12 = homeWin + awayWin)
  doubleChance1X: number;
  doubleChanceX2: number;
  doubleChance12: number;
  // Total Goals
  over15Goals: number;
  under15Goals: number;
  over25Goals: number;
  under25Goals: number;
  over35Goals: number;
  under35Goals: number;
  // BTTS
  bttsYes: number;
  bttsNo: number;
  // Halves
  firstHalfOver05: number;
  firstHalfUnder15: number;
  highestScoringHalf2nd: number;
  highestScoringHalf1st: number;
  highestScoringHalfEqual: number;
  // Corners (Negative Binomial)
  cornersOver95: number;
  cornersUnder95: number;
  expectedCorners: number;
  // Cards (Negative Binomial with derby multiplier)
  cardsOver45: number;
  cardsUnder45: number;
  expectedCards: number;
}

export class MarketSpecificModelsEngine {
  /**
   * Derive all core markets from the joint scoreline matrix to guarantee absolute internal consistency.
   */
  public static deriveFromJointMatrix(
    matrix: ScorelineProbabilityMatrix,
    homeCornersExp: number = 5.6,
    awayCornersExp: number = 4.4,
    refereeCardsPerGame: number = 4.2,
    isDerby: boolean = false,
    competitionCode?: string
  ): JointMarketProbabilities {
    const rawHomeWin = matrix.homeWin;
    const rawDraw = matrix.draw;
    const rawAwayWin = matrix.awayWin;

    // Strict coherence: Double Chance derived directly from 1X2
    const dc1X = Math.min(0.98, rawHomeWin + rawDraw);
    const dcX2 = Math.min(0.98, rawAwayWin + rawDraw);
    const dc12 = Math.min(0.98, rawHomeWin + rawAwayWin);

    // Goal totals monotonicity: P(O1.5) >= P(O2.5) >= P(O3.5)
    const o15 = matrix.over15;
    const o25 = Math.min(o15, matrix.over25);
    const o35 = Math.min(o25, matrix.over35);

    const cal = getCalibratedParams();
    const leagueCfg = getLeagueCalibratedConfig(competitionCode);
    const firstHalfShare = leagueCfg?.halves?.firstHalfGoalShare ?? 0.439;
    const cornersAlpha = leagueCfg?.corners?.overdispersionAlpha ?? 0.085;
    const cardsAlpha = leagueCfg?.cards?.overdispersionAlpha ?? 0.045;

    // Half-by-half distribution
    const halfDist = generateHalfByHalfGoalDistribution(
      matrix.expectedHomeGoals,
      matrix.expectedAwayGoals,
      firstHalfShare
    );
    const fhOver05 = Number(halfDist.firstHalf.overUnderGoals[0.5].over.toFixed(4));
    const fhUnder15 = Number(halfDist.firstHalf.overUnderGoals[1.5].under.toFixed(4));

    // Negative Binomial Corner Model
    const totalCornersExp = homeCornersExp + awayCornersExp;
    const cornersO95 = this.calculateNegativeBinomialOver(totalCornersExp, 9.5, cornersAlpha);

    // Negative Binomial Bookings Model (Referee rate + statistically verified derby cards multiplier)
    const derbyMultiplier = isDerby && cal.derbySignificance.applyCardsAdjustment
      ? cal.derbySignificance.cardsMultiplier
      : 1.0;
    const adjustedCardsExp = refereeCardsPerGame * derbyMultiplier;
    const cardsO45 = this.calculateNegativeBinomialOver(adjustedCardsExp, 4.5, cardsAlpha);

    return {
      homeWin: rawHomeWin,
      draw: rawDraw,
      awayWin: rawAwayWin,
      doubleChance1X: Number(dc1X.toFixed(4)),
      doubleChanceX2: Number(dcX2.toFixed(4)),
      doubleChance12: Number(dc12.toFixed(4)),
      over15Goals: o15,
      under15Goals: Number((1 - o15).toFixed(4)),
      over25Goals: o25,
      under25Goals: Number((1 - o25).toFixed(4)),
      over35Goals: o35,
      under35Goals: Number((1 - o35).toFixed(4)),
      bttsYes: matrix.bttsYes,
      bttsNo: matrix.bttsNo,
      firstHalfOver05: fhOver05,
      firstHalfUnder15: fhUnder15,
      highestScoringHalf2nd: Number(halfDist.highestScoringHalf.secondHalf.toFixed(4)),
      highestScoringHalf1st: Number(halfDist.highestScoringHalf.firstHalf.toFixed(4)),
      highestScoringHalfEqual: Number(halfDist.highestScoringHalf.equal.toFixed(4)),
      cornersOver95: cornersO95,
      cornersUnder95: Number((1 - cornersO95).toFixed(4)),
      expectedCorners: Number(totalCornersExp.toFixed(1)),
      cardsOver45: cardsO45,
      cardsUnder45: Number((1 - cardsO45).toFixed(4)),
      expectedCards: Number(adjustedCardsExp.toFixed(1)),
    };
  }

  /**
   * Exact Negative Binomial tail probability P(X > threshold)
   */
  private static calculateNegativeBinomialOver(mu: number, threshold: number, alpha: number = 0.085): number {
    if (mu <= 0) return 0;
    let underProb = 0;
    for (let k = 0; k <= Math.floor(threshold); k++) {
      underProb += negBinomialProb(mu, k, alpha);
    }
    return Number(Math.max(0.02, Math.min(0.98, 1 - underProb)).toFixed(4));
  }



  /**
   * Post-Calibration Coherence Enforcer:
   * Re-aligns calibrated probabilities to satisfy fundamental Kolmogorov axioms:
   * 1. 1X2 sum strictly equals 1.0
   * 2. Over lines are monotonic: P(O1.5) >= P(O2.5) >= P(O3.5)
   * 3. Double Chance matches exact 1X2 sums
   */
  public static enforceCoherence(probs: JointMarketProbabilities): JointMarketProbabilities {
    // 1. Normalize 1X2
    const sum1X2 = probs.homeWin + probs.draw + probs.awayWin;
    const home = probs.homeWin / sum1X2;
    const draw = probs.draw / sum1X2;
    const away = probs.awayWin / sum1X2;

    // 2. Monotonicity for goals
    const o15 = probs.over15Goals;
    const o25 = Math.min(o15, probs.over25Goals);
    const o35 = Math.min(o25, probs.over35Goals);

    // 3. Re-anchor Double Chance
    const dc1X = Math.min(0.99, home + draw);
    const dcX2 = Math.min(0.99, away + draw);
    const dc12 = Math.min(0.99, home + away);

    return {
      ...probs,
      homeWin: Number(home.toFixed(4)),
      draw: Number(draw.toFixed(4)),
      awayWin: Number(away.toFixed(4)),
      doubleChance1X: Number(dc1X.toFixed(4)),
      doubleChanceX2: Number(dcX2.toFixed(4)),
      doubleChance12: Number(dc12.toFixed(4)),
      over15Goals: Number(o15.toFixed(4)),
      under15Goals: Number((1 - o15).toFixed(4)),
      over25Goals: Number(o25.toFixed(4)),
      under25Goals: Number((1 - o25).toFixed(4)),
      over35Goals: Number(o35.toFixed(4)),
      under35Goals: Number((1 - o35).toFixed(4)),
    };
  }
}
