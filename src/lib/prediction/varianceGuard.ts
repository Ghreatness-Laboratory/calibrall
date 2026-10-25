// CALIBRALL: Matchday Probability Variance Guard & Anti-Fallback Tripwire
// Hard rule: across any single matchday, if more than 30% of home-win probabilities
// (or any market's probabilities) are identical to one decimal place, fail the run.
// This prevents silent fallback to league-average priors being displayed as picks.

import { MarketPrediction } from '@/types';

export interface VarianceViolation {
  marketCode: string;
  marketName: string;
  dominantProbPercent: string;
  identicalSharePct: number;
  identicalCount: number;
  matchdayTotal: number;
}

export interface MatchdayVarianceReport {
  passed: boolean;
  violations: VarianceViolation[];
  marketDistributions: Record<string, { prob: string; count: number }[]>;
}

export function evaluateMatchdayVariance(
  matchdayPredictions: { fixtureId: string; predictions: MarketPrediction[] }[]
): MatchdayVarianceReport {
  // If matchday has fewer than 4 matches, statistical sample is too small for 30% threshold
  if (matchdayPredictions.length < 4) {
    return { passed: true, violations: [], marketDistributions: {} };
  }

  const marketProbs: Record<string, { marketName: string; probs: number[] }> = {};

  for (const item of matchdayPredictions) {
    for (const p of item.predictions) {
      const key = p.marketCode;
      if (!marketProbs[key]) {
        marketProbs[key] = { marketName: p.marketName, probs: [] };
      }
      const val = p.calibratedProbability !== undefined ? p.calibratedProbability : p.modelProbability;
      marketProbs[key].probs.push(val);
    }
  }

  const violations: VarianceViolation[] = [];
  const marketDistributions: Record<string, { prob: string; count: number }[]> = {};

  for (const [code, { marketName, probs }] of Object.entries(marketProbs)) {
    if (probs.length < 4) continue;

    const countMap: Record<string, number> = {};
    for (const p of probs) {
      const rounded1Dec = (p * 100).toFixed(1) + '%';
      countMap[rounded1Dec] = (countMap[rounded1Dec] || 0) + 1;
    }

    const distList = Object.entries(countMap)
      .map(([prob, count]) => ({ prob, count }))
      .sort((a, b) => b.count - a.count);

    marketDistributions[code] = distList;

    const total = probs.length;
    for (const { prob, count } of distList) {
      const share = count / total;
      if (share > 0.30) {
        violations.push({
          marketCode: code,
          marketName,
          dominantProbPercent: prob,
          identicalSharePct: Number((share * 100).toFixed(1)),
          identicalCount: count,
          matchdayTotal: total,
        });
      }
    }
  }

  const passed = violations.length === 0;
  if (!passed) {
    console.error(`[VarianceGuard] INTEGRITY ERROR: ${violations.length} market(s) exceeded the 30% identical probability threshold:`, violations);
  }

  return {
    passed,
    violations,
    marketDistributions,
  };
}
