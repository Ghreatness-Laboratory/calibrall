import type { SlipBuildStyle } from '@/lib/tiers';
import { SLIP_BUILDER_GLOBAL_BOUNDS } from '@/lib/tiers';
import { cleanDisplayText } from '@/lib/utils/formatText';
import type { BuiltSlip, SlipCandidateLeg } from './types';

export interface SlipSearchOptions {
  targetOdds: number;
  maxLegs: number;
  style: SlipBuildStyle;
  toleranceRatio?: number;
  maxSameLeagueLegs?: number;
  maxResults?: number;
  beamWidth?: number;
  nowIso?: string;
}

interface SearchState {
  legs: SlipCandidateLeg[];
  combinedOdds: number;
  combinedProb: number;
  logProb: number;
  totalEdge: number;
  realPricedCount: number;
  modelFairCount: number;
}

function roundOdds(val: number): number {
  return Math.round(val * 100) / 100;
}

function roundProb(val: number): number {
  return Math.round(val * 10000) / 10000;
}

function computeMinimumBalancedCombinedProb(targetOdds: number): number {
  return Math.max(0.08, Math.min(0.40, 0.72 / Math.max(1.5, targetOdds)));
}

function scoreState(state: SearchState, style: SlipBuildStyle): number {
  const legCount = state.legs.length;
  if (style === 'safest') {
    // Highest combined probability with strong preference for FEWER legs at equal/close prob
    // because bookmaker margin compounds on every extra leg.
    return state.logProb - 0.035 * (legCount - 2);
  }
  // Balanced: maximize total market edge across legs, with tie-break on probability & fewer legs,
  // and penalizing model-fair legs that lack a real bookmaker edge.
  return (
    state.totalEdge * 10 -
    state.modelFairCount * 0.15 +
    state.logProb * 0.25 -
    0.015 * (legCount - 2)
  );
}

function canAppendLeg(
  prevLegs: SlipCandidateLeg[],
  candidate: SlipCandidateLeg,
  maxSameLeagueLegs: number
): boolean {
  let leagueCount = 0;
  const candMatch = candidate.matchId;
  const candComp = candidate.competitionId;
  const candH = candidate.homeTeamId;
  const candA = candidate.awayTeamId;

  for (let i = 0; i < prevLegs.length; i++) {
    const l = prevLegs[i];
    if (l.matchId === candMatch) return false;
    if (l.competitionId === candComp) {
      leagueCount++;
      if (leagueCount >= maxSameLeagueLegs) return false;
    }
    if (
      (candH && (l.homeTeamId === candH || l.awayTeamId === candH)) ||
      (candA && (l.homeTeamId === candA || l.awayTeamId === candA))
    ) {
      return false;
    }
  }
  return true;
}

function isDistinctFromSelected(candidateLegs: SlipCandidateLeg[], selected: SlipCandidateLeg[][]): boolean {
  for (const prev of selected) {
    let shared = 0;
    for (let i = 0; i < candidateLegs.length; i++) {
      const mId = candidateLegs[i].matchId;
      for (let j = 0; j < prev.length; j++) {
        if (prev[j].matchId === mId) {
          shared++;
          break;
        }
      }
    }
    const minLen = Math.min(candidateLegs.length, prev.length);
    if (minLen - shared < 2) {
      return false;
    }
  }
  return true;
}

function formatTargetProximity(combinedOdds: number, targetOdds: number): {
  deltaPct: number;
  label: string;
} {
  const pct = ((combinedOdds - targetOdds) / targetOdds) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (Math.abs(rounded) < 0.5) {
    return { deltaPct: rounded, label: 'Right on target' };
  }
  if (rounded > 0) {
    return { deltaPct: rounded, label: `${rounded.toFixed(1)}% above target` };
  }
  return { deltaPct: rounded, label: `${Math.abs(rounded).toFixed(1)}% below target` };
}

function buildSlipObject(
  legs: SlipCandidateLeg[],
  rank: number,
  targetOdds: number,
  style: SlipBuildStyle,
  nowIso: string
): BuiltSlip {
  const sortedLegs = [...legs].sort(
    (a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime()
  );
  const rawCombinedOdds = sortedLegs.reduce((acc, l) => acc * l.decimalOdds, 1);
  const rawCombinedProb = sortedLegs.reduce((acc, l) => acc * l.calibratedProbability, 1);
  const combinedOdds = roundOdds(rawCombinedOdds);
  const combinedProbability = roundProb(rawCombinedProb);
  const estimatedHitChancePct = Math.round(combinedProbability * 1000) / 10;

  let weakestLeg = sortedLegs[0];
  for (const l of sortedLegs) {
    if (l.calibratedProbability < weakestLeg.calibratedProbability) {
      weakestLeg = l;
    }
  }

  const includesModelFairOdds = sortedLegs.some((l) => l.oddsSourceType === 'model_fair');
  const realLegs = sortedLegs.filter(
    (l) => l.oddsSourceType === 'real_bookmaker' && l.marketEdge !== null
  );
  const averageMarketEdge =
    !includesModelFairOdds && realLegs.length === sortedLegs.length && realLegs.length > 0
      ? Math.round(
          (realLegs.reduce((s, l) => s + (l.marketEdge || 0), 0) / realLegs.length) * 10000
        ) / 10000
      : null;

  const fairChancePct = Math.round((1 / Math.max(1.01, combinedOdds)) * 1000) / 10;
  const prox = formatTargetProximity(combinedOdds, targetOdds);

  return {
    slipId: `slip_${rank}_${sortedLegs
      .map((l) => `${l.matchId}_${l.marketCode}`)
      .join('_')
      .slice(0, 48)}`,
    rank,
    style,
    legs: sortedLegs,
    legsCount: sortedLegs.length,
    combinedOdds,
    combinedProbability,
    estimatedHitChancePct,
    targetOdds: roundOdds(targetOdds),
    targetDeltaPct: prox.deltaPct,
    targetProximityLabel: prox.label,
    includesModelFairOdds,
    modelFairWarning: includesModelFairOdds
      ? "Includes model fair odds: your bookmaker's price will differ (usually lower)"
      : null,
    averageMarketEdge,
    weakestLegMatchId: weakestLeg.matchId,
    weakestLegMarketCode: weakestLeg.marketCode,
    independenceNote:
      'Combined odds and hit chance multiply match probabilities assuming outcomes across separate games are independent.',
    honestNotice: cleanDisplayText(
      `No slip is safe. At combined odds of ${combinedOdds.toFixed(
        2
      )}, a fair chance of winning is about ${fairChancePct.toFixed(0)}%.`
    ),
    responsibleFooter: '18+ · Gamble responsibly',
    createdAt: nowIso,
  };
}

/**
 * Pure deterministic Slip Builder combinatorial search.
 * Allocation-light layered beam search optimized for 200+ game slates (<50ms).
 */
export interface SlipSearchResultWithStats {
  slips: BuiltSlip[];
  combinationsInBand: number;
}

export function searchSlips(
  rawCandidates: SlipCandidateLeg[],
  options: SlipSearchOptions
): BuiltSlip[] {
  return searchSlipsWithStats(rawCandidates, options).slips;
}

export function searchSlipsWithStats(
  rawCandidates: SlipCandidateLeg[],
  options: SlipSearchOptions
): SlipSearchResultWithStats {
  const targetOdds = Math.max(
    SLIP_BUILDER_GLOBAL_BOUNDS.minTargetOdds,
    Math.min(SLIP_BUILDER_GLOBAL_BOUNDS.maxTargetOdds, Number(options.targetOdds) || 2.0)
  );
  const maxLegs = Math.max(2, Math.min(6, Math.round(Number(options.maxLegs) || 4)));
  const style: SlipBuildStyle = options.style === 'balanced' ? 'balanced' : 'safest';
  const toleranceRatio = options.toleranceRatio ?? SLIP_BUILDER_GLOBAL_BOUNDS.targetToleranceRatio;
  const maxSameLeagueLegs =
    options.maxSameLeagueLegs ?? SLIP_BUILDER_GLOBAL_BOUNDS.maxSameLeagueLegs;
  const maxResults = Math.max(1, Math.min(5, options.maxResults ?? 3));
  const beamWidth = Math.max(60, options.beamWidth ?? 180);
  const nowIso = options.nowIso || new Date().toISOString();

  const lowerBound = targetOdds * (1 - toleranceRatio);
  const upperBound = targetOdds * (1 + toleranceRatio);
  const minBalancedProb = computeMinimumBalancedCombinedProb(targetOdds);

  const validCandidates = rawCandidates.filter(
    (c) =>
      Number.isFinite(c.decimalOdds) &&
      c.decimalOdds >= 1.02 &&
      c.decimalOdds <= upperBound &&
      Number.isFinite(c.calibratedProbability) &&
      c.calibratedProbability > 0 &&
      c.calibratedProbability <= 1
  );

  if (validCandidates.length < 2) return { slips: [], combinationsInBand: 0 };

  const byMatch = new Map<string, SlipCandidateLeg[]>();
  for (let i = 0; i < validCandidates.length; i++) {
    const c = validCandidates[i];
    let arr = byMatch.get(c.matchId);
    if (!arr) {
      arr = [];
      byMatch.set(c.matchId, arr);
    }
    arr.push(c);
  }

  const maxPerMatch = byMatch.size > 60 ? 2 : 4;
  const prunedPool: SlipCandidateLeg[] = [];
  for (const matchLegs of byMatch.values()) {
    matchLegs.sort((a, b) => {
      if (style === 'balanced') {
        const ea = a.marketEdge ?? -0.15;
        const eb = b.marketEdge ?? -0.15;
        if (Math.abs(eb - ea) > 0.004) return eb - ea;
      }
      if (Math.abs(b.calibratedProbability - a.calibratedProbability) > 0.004) {
        return b.calibratedProbability - a.calibratedProbability;
      }
      return b.decimalOdds - a.decimalOdds;
    });

    const chosenForMatch: SlipCandidateLeg[] = [];
    for (const leg of matchLegs) {
      if (chosenForMatch.length >= maxPerMatch) break;
      const tooClose = chosenForMatch.some(
        (existing) =>
          Math.abs(existing.decimalOdds - leg.decimalOdds) < 0.05 &&
          existing.calibratedProbability >= leg.calibratedProbability
      );
      if (!tooClose) chosenForMatch.push(leg);
    }
    for (const l of chosenForMatch) prunedPool.push(l);
  }

  prunedPool.sort((a, b) => {
    if (style === 'balanced') {
      const sa = (a.marketEdge ?? -0.1) * 10 + Math.log(a.calibratedProbability) * 0.25;
      const sb = (b.marketEdge ?? -0.1) * 10 + Math.log(b.calibratedProbability) * 0.25;
      return sb - sa;
    }
    return (
      b.calibratedProbability - a.calibratedProbability ||
      (b.marketEdge ?? 0) - (a.marketEdge ?? 0)
    );
  });

  const pool = prunedPool.slice(0, 220);

  let minOddsGlobal = Infinity;
  let maxOddsGlobal = 0;
  for (let i = 0; i < pool.length; i++) {
    const o = pool[i].decimalOdds;
    if (o < minOddsGlobal) minOddsGlobal = o;
    if (o > maxOddsGlobal) maxOddsGlobal = o;
  }

  const completedStates: Array<{ state: SearchState; score: number }> = [];
  let frontier: Array<{ lastIdx: number; state: SearchState; rankScore: number }> = [];

  for (let i = 0; i < pool.length; i++) {
    const leg = pool[i];
    if (leg.decimalOdds * minOddsGlobal > upperBound) continue;
    if (leg.decimalOdds * Math.pow(maxOddsGlobal, maxLegs - 1) < lowerBound) continue;

    const state: SearchState = {
      legs: [leg],
      combinedOdds: leg.decimalOdds,
      combinedProb: leg.calibratedProbability,
      logProb: Math.log(leg.calibratedProbability),
      totalEdge: leg.marketEdge ?? 0,
      realPricedCount: leg.oddsSourceType === 'real_bookmaker' ? 1 : 0,
      modelFairCount: leg.oddsSourceType === 'model_fair' ? 1 : 0,
    };
    frontier.push({
      lastIdx: i,
      state,
      rankScore: scoreState(state, style),
    });
  }

  if (frontier.length > beamWidth) {
    frontier.sort((a, b) => b.rankScore - a.rankScore);
    frontier = frontier.slice(0, beamWidth);
  }

  for (let k = 2; k <= maxLegs; k++) {
    const nextFrontier: Array<{ lastIdx: number; state: SearchState; rankScore: number }> = [];
    const remainingMaxLegs = maxLegs - k;
    const maxRemainingFactor = Math.pow(maxOddsGlobal, remainingMaxLegs);
    const minProbFloor = style === 'balanced' ? minBalancedProb : 0.03;

    for (let fIdx = 0; fIdx < frontier.length; fIdx++) {
      const node = frontier[fIdx];
      const prev = node.state;

      for (let j = node.lastIdx + 1; j < pool.length; j++) {
        const leg = pool[j];
        const nextOdds = prev.combinedOdds * leg.decimalOdds;
        if (nextOdds > upperBound) continue;
        if (nextOdds * maxRemainingFactor < lowerBound) continue;

        const nextProb = prev.combinedProb * leg.calibratedProbability;
        if (nextProb < minProbFloor) continue;

        if (!canAppendLeg(prev.legs, leg, maxSameLeagueLegs)) continue;

        const nextState: SearchState = {
          legs: [...prev.legs, leg],
          combinedOdds: nextOdds,
          combinedProb: nextProb,
          logProb: prev.logProb + Math.log(leg.calibratedProbability),
          totalEdge: prev.totalEdge + (leg.marketEdge ?? 0),
          realPricedCount:
            prev.realPricedCount + (leg.oddsSourceType === 'real_bookmaker' ? 1 : 0),
          modelFairCount:
            prev.modelFairCount + (leg.oddsSourceType === 'model_fair' ? 1 : 0),
        };

        const rankScore = scoreState(nextState, style);
        if (nextOdds >= lowerBound && nextOdds <= upperBound) {
          completedStates.push({ state: nextState, score: rankScore });
        }

        if (k < maxLegs && nextOdds * minOddsGlobal <= upperBound) {
          nextFrontier.push({ lastIdx: j, state: nextState, rankScore });
        }
      }
    }

    if (nextFrontier.length === 0) break;
    if (nextFrontier.length > beamWidth) {
      nextFrontier.sort((a, b) => b.rankScore - a.rankScore);
      frontier = nextFrontier.slice(0, beamWidth);
    } else {
      frontier = nextFrontier;
    }
  }

  if (completedStates.length === 0) return { slips: [], combinationsInBand: 0 };

  completedStates.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-6) return b.score - a.score;
    if (a.state.legs.length !== b.state.legs.length) {
      return a.state.legs.length - b.state.legs.length;
    }
    return (
      Math.abs(a.state.combinedOdds - targetOdds) -
      Math.abs(b.state.combinedOdds - targetOdds)
    );
  });

  const selectedLegsList: SlipCandidateLeg[][] = [];
  const results: BuiltSlip[] = [];

  for (let i = 0; i < completedStates.length; i++) {
    if (results.length >= maxResults) break;
    const entry = completedStates[i];
    if (!isDistinctFromSelected(entry.state.legs, selectedLegsList)) continue;
    selectedLegsList.push(entry.state.legs);
    results.push(buildSlipObject(entry.state.legs, results.length + 1, targetOdds, style, nowIso));
  }

  return {
    slips: results,
    combinationsInBand: completedStates.length,
  };
}
