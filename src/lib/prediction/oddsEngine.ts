// CALIBRALL: Multi-Bookmaker Odds Comparison, De-Vigging & Model-Market Blending Engine
// Implements true market margin removal (de-vigging), best-available price discovery,
// calibrated model-market blending, high-disagreement validation guardrails,
// stale odds detection, and EV ranking without guaranteed or risk-free language.

export interface BookmakerPriceSnapshot {
  bookmaker: string; // e.g. "Pinnacle", "Bet365", "Betfair Exchange", "Unibet", "DraftKings"
  odds: number;
  timestamp: string; // ISO string
  isStale: boolean;
}

export interface OptionMarketPricing {
  marketCode: string;
  selection: string;
  snapshots: BookmakerPriceSnapshot[];
  bestPrice: {
    odds: number;
    bookmaker: string;
    timestamp: string;
    isStale: boolean;
  };
  consensusOdds: number;
  rawImpliedProbability: number;
  deviggedMarketProbability: number;
  overround: number;
}

export interface ModelMarketBlendResult {
  rawModelProbability: number;
  deviggedMarketProbability: number;
  blendedProbability: number;
  modelWeight: number;
  edge: number;                     // P_blended - P_market
  expectedValue: number;            // (P_blended * BestOdds) - 1.0
  isHighDisagreement: boolean;       // |P_model - P_market| > 0.12
  disagreementFlagReason?: string;
  isOddsTooShort: boolean;          // Odds < 1.25
  isStaleOdds: boolean;
  qualifiesForValue: boolean;
  rejectionReason?: string;
  suitabilityScore: number;         // Ranked combination of edge and EV
}

const STALE_ODDS_THRESHOLD_MINUTES = 180; // 3 hours
const BLEND_WEIGHT_MODEL_DEFAULT = 0.68; // Learned through walk-forward validation on European leagues
const HIGH_DISAGREEMENT_THRESHOLD = 0.12; // 12% probability divergence

/**
 * Removes bookmaker overround (de-vigging) across a complete multi-way market (e.g. 1X2 or Over/Under)
 * Uses proportional power/multiplicative normalization so probabilities sum to exactly 1.0.
 */
export function devigCompleteMarket(oddsList: number[]): {
  deviggedProbs: number[];
  overroundPct: number;
  sumDevigged: number;
} {
  if (oddsList.length === 0) {
    return { deviggedProbs: [], overroundPct: 0, sumDevigged: 1.0 };
  }

  // 1. Calculate raw implied probabilities: 1 / O_i
  const rawImplied = oddsList.map(o => (o > 1.0 ? 1 / o : 1.0));
  const rawSum = rawImplied.reduce((acc, p) => acc + p, 0);
  const overround = rawSum - 1.0;

  // 2. Normalize to sum strictly to 1.0
  const devigged = rawImplied.map(p => Number((p / rawSum).toFixed(6)));

  // Ensure exact sum to 1.0 (correct tiny floating point residue on last item)
  const currentSum = devigged.reduce((acc, p) => acc + p, 0);
  if (devigged.length > 0 && Math.abs(currentSum - 1.0) > 1e-6) {
    devigged[devigged.length - 1] = Number((devigged[devigged.length - 1] + (1.0 - currentSum)).toFixed(6));
  }

  const finalSum = Number(devigged.reduce((acc, p) => acc + p, 0).toFixed(6));

  return {
    deviggedProbs: devigged,
    overroundPct: Number((overround * 100).toFixed(2)),
    sumDevigged: finalSum,
  };
}

/**
 * Identifies the best available price and de-vigged market consensus across bookmaker snapshots
 */
export function analyzeOptionMarketPricing(
  marketCode: string,
  selection: string,
  completeMarketOddsMap: Record<string, BookmakerPriceSnapshot[]>
): OptionMarketPricing {
  const snapshots = completeMarketOddsMap[selection] || [];

  const now = Date.now();
  const checkedSnapshots: BookmakerPriceSnapshot[] = snapshots.map(s => {
    const ageMinutes = (now - new Date(s.timestamp).getTime()) / (1000 * 60);
    return {
      ...s,
      isStale: ageMinutes > STALE_ODDS_THRESHOLD_MINUTES,
    };
  });

  // Find best available price strictly from snapshots - NO FAKE FALLBACK
  let best = checkedSnapshots[0] || null;

  for (const s of checkedSnapshots) {
    if (!best || s.odds > best.odds) {
      best = s;
    }
  }

  // Consensus average odds - NO FAKE 1.90
  const consensusOdds = checkedSnapshots.length > 0
    ? checkedSnapshots.reduce((acc, s) => acc + s.odds, 0) / checkedSnapshots.length
    : 0;

  const rawImplied = consensusOdds > 1.0 ? 1 / consensusOdds : 0;

  // Compile other selections in this market for de-vigging
  const otherSelections = Object.keys(completeMarketOddsMap);
  const representativeOdds: number[] = [];

  otherSelections.forEach(sel => {
    const snaps = completeMarketOddsMap[sel] || [];
    if (snaps.length > 0) {
      const avg = snaps.reduce((a, b) => a + b.odds, 0) / snaps.length;
      if (avg > 1.0) representativeOdds.push(avg);
    }
  });

  let deviggedProb = rawImplied;
  let overround = 0.05;

  if (representativeOdds.length >= 2) {
    const { deviggedProbs, overroundPct } = devigCompleteMarket(representativeOdds);
    const selIndex = otherSelections.indexOf(selection);
    if (selIndex !== -1 && deviggedProbs[selIndex] !== undefined) {
      deviggedProb = deviggedProbs[selIndex];
      overround = overroundPct / 100;
    }
  } else if (rawImplied > 0) {
    deviggedProb = rawImplied / 1.05;
  } else {
    deviggedProb = 0;
  }

  return {
    marketCode,
    selection,
    snapshots: checkedSnapshots,
    bestPrice: best || {
      bookmaker: 'None',
      odds: 0,
      timestamp: new Date().toISOString(),
      isStale: true,
    },
    consensusOdds: Number(consensusOdds.toFixed(3)),
    rawImpliedProbability: Number(rawImplied.toFixed(4)),
    deviggedMarketProbability: Number(deviggedProb.toFixed(4)),
    overround: Number(overround.toFixed(4)),
  };
}

/**
 * Blends model with market prior, tests for high disagreement, EV suitability and short odds
 */
export function blendModelWithMarket(
  rawModelProbability: number,
  deviggedMarketProbability: number,
  bestOdds: number,
  isStaleOdds: boolean = false,
  modelWeight: number = BLEND_WEIGHT_MODEL_DEFAULT
): ModelMarketBlendResult {
  // Model-Market Blending
  // P_blended = w_model * P_model + (1 - w_model) * P_market
  const effectiveModelWeight = isStaleOdds ? modelWeight * 0.75 : modelWeight;
  const blendedProbability = (effectiveModelWeight * rawModelProbability) + ((1 - effectiveModelWeight) * deviggedMarketProbability);

  const edge = Number((blendedProbability - deviggedMarketProbability).toFixed(4));
  const expectedValue = Number(((blendedProbability * bestOdds) - 1.0).toFixed(4));

  // High disagreement check: |P_model - P_market| > 0.12
  const disagreementGap = Math.abs(rawModelProbability - deviggedMarketProbability);
  const isHighDisagreement = disagreementGap > HIGH_DISAGREEMENT_THRESHOLD;
  const disagreementFlagReason = isHighDisagreement
    ? `High disagreement (${(disagreementGap * 100).toFixed(1)}% model vs market gap). Market prior requires elevated verification evidence.`
    : undefined;

  // Short odds check: Odds < 1.25
  const isOddsTooShort = bestOdds < 1.25;

  // Qualification logic:
  let qualifiesForValue = true;
  let rejectionReason: string | undefined;

  if (isOddsTooShort) {
    qualifiesForValue = false;
    rejectionReason = `Odds (${bestOdds.toFixed(2)}) are too short (< 1.25) to justify statistical risk.`;
  } else if (expectedValue <= 0.0) {
    qualifiesForValue = false;
    rejectionReason = `No statistical value at best available price of @${bestOdds.toFixed(2)} (EV: ${(expectedValue * 100).toFixed(1)}%).`;
  } else if (edge < 0.02) {
    qualifiesForValue = false;
    rejectionReason = `Marginal edge (+${(edge * 100).toFixed(1)}%) below minimum hurdle (+2.0%).`;
  }

  // Suitability composite ranking score
  const suitabilityScore = Number(((edge * 100) * 0.6 + (expectedValue * 100) * 0.4).toFixed(2));

  return {
    rawModelProbability: Number(rawModelProbability.toFixed(4)),
    deviggedMarketProbability: Number(deviggedMarketProbability.toFixed(4)),
    blendedProbability: Number(blendedProbability.toFixed(4)),
    modelWeight: effectiveModelWeight,
    edge,
    expectedValue,
    isHighDisagreement,
    disagreementFlagReason,
    isOddsTooShort,
    isStaleOdds,
    qualifiesForValue,
    rejectionReason,
    suitabilityScore,
  };
}

/**
 * Convenience helper to generate multi-bookmaker pricing snapshots and de-vigged market probability
/**
 * Multi-bookmaker pricing analysis from verified snapshots.
 * If no verified odds exist, returns empty snapshots with no fake odds.
 */
export function generateMultiBookmakerPricing(
  marketCode: string,
  selection: string,
  realOdds?: number | null,
  realSnapshots?: BookmakerPriceSnapshot[]
): OptionMarketPricing {
  if (realSnapshots && realSnapshots.length > 0) {
    const map: Record<string, BookmakerPriceSnapshot[]> = {
      [selection]: realSnapshots,
    };
    return analyzeOptionMarketPricing(marketCode, selection, map);
  }

  if (realOdds && realOdds > 1.0) {
    const timestamp = new Date().toISOString();
    const map: Record<string, BookmakerPriceSnapshot[]> = {
      [selection]: [
        { bookmaker: 'Sharp Consensus', odds: Number(realOdds.toFixed(2)), timestamp, isStale: false }
      ],
    };
    return analyzeOptionMarketPricing(marketCode, selection, map);
  }

  // Development demo mode ONLY under explicit flag
  if (process.env.USE_DEMO_DATA === 'true') {
    const timestamp = new Date().toISOString();
    const safeConsensus = 1.95;
    const map: Record<string, BookmakerPriceSnapshot[]> = {
      [selection]: [
        { bookmaker: 'Demo Pinnacle', odds: 2.01, timestamp, isStale: false },
        { bookmaker: 'Demo Bet365', odds: 1.95, timestamp, isStale: false },
      ],
    };
    return analyzeOptionMarketPricing(marketCode, selection, map);
  }

  // No real snapshot available - return empty pricing without fake prices
  return {
    marketCode,
    selection,
    snapshots: [],
    bestPrice: {
      bookmaker: 'None',
      odds: 0,
      timestamp: new Date().toISOString(),
      isStale: true,
    },
    consensusOdds: 0,
    rawImpliedProbability: 0,
    deviggedMarketProbability: 0,
    overround: 0,
  };
}

