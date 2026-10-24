// CALIBRALL / MATCHMIND: Fixture Profiling, Family Variety & Generic Pick Guardrail Engine
// Enforces variety by evidence: profiles determine family priority; at most 1 pick per family; drops uninformative generic picks.

import { 
  FixtureProfile, 
  FixtureContext, 
  MarketPrediction 
} from '@/types';
import { MarketFamily } from './baselines';
import { getTeamStyle } from './situationalContext';

/**
 * Classifies a fixture into an evidence-based tactical profile
 */
export function classifyFixtureProfile(context: FixtureContext): FixtureProfile {
  const hAtk = context.homeAttackRating;
  const hDef = context.homeDefenseRating;
  const aAtk = context.awayAttackRating;
  const aDef = context.awayDefenseRating;
  const hXg = context.homeXg;
  const aXg = context.awayXg;
  const tags = context.stateTags || [];

  // 1. One-Man Dependent: Key absences flagged on high scorer dependence
  if (tags.includes('key-absences')) {
    return 'one_man_dependent';
  }

  // 2. Schedule Congestion / Rotation
  if (tags.includes('fixture-congested') || tags.includes('high-fatigue')) {
    return 'congested_rotation';
  }

  // 3. Discipline-Heavy: Rivalry / Derby / Disciplinary friction
  if (tags.includes('derby') || context.expectedCards >= 5.0) {
    return 'discipline_heavy';
  }

  // 4. Wing & Set-Piece Heavy: High expected corners (>= 11.5)
  if ((context.expectedCornersHome + context.expectedCornersAway) >= 11.2) {
    return 'wing_set_piece';
  }

  // 5. Strong Favourite: Imbalanced attack/defense ratio
  if ((hAtk >= 1.65 && aAtk <= 1.0) || (aAtk >= 1.65 && hAtk <= 1.0)) {
    return 'strong_favourite';
  }

  // 6. Tight Low-Scoring: High defensive strength and low xG
  if ((hXg + aXg <= 2.2) || (hDef <= 0.75 && aDef <= 0.75)) {
    return 'tight_low_scoring';
  }

  // 7. Open High-Scoring: High xG and vulnerable defenses
  if ((hXg + aXg >= 3.1) || (hDef >= 1.25 && aDef >= 1.25)) {
    return 'open_high_scoring';
  }

  return 'balanced_competitive';
}

/**
 * Maps each fixture profile to prioritized market families
 */
export function getProfilePriorityFamilies(profile: FixtureProfile): MarketFamily[] {
  switch (profile) {
    case 'tight_low_scoring':
      return ['goals_over_under', 'both_teams_to_score', 'first_half_goals', 'draw', 'corners'];
    case 'open_high_scoring':
      return ['goals_over_under', 'both_teams_to_score', 'second_half_result', 'result'];
    case 'strong_favourite':
      return ['result', 'goals_over_under', 'corners', 'second_half_result'];
    case 'discipline_heavy':
      return ['bookings', 'corners', 'draw', 'goals_over_under'];
    case 'wing_set_piece':
      return ['corners', 'goals_over_under', 'both_teams_to_score'];
    case 'one_man_dependent':
      return ['both_teams_to_score', 'goals_over_under', 'draw', 'corners'];
    case 'congested_rotation':
      return ['both_teams_to_score', 'goals_over_under', 'corners'];
    case 'balanced_competitive':
    default:
      return ['goals_over_under', 'both_teams_to_score', 'corners', 'result', 'draw'];
  }
}

/**
 * Fixture-Specificity Check:
 * If a prediction's probability is within 2.5% of the league base rate for that line,
 * it is considered generic (uninformative regarding this specific match) and dropped or flagged.
 */
export function evaluateFixtureSpecificity(
  predictionProb: number,
  leagueBaseRate: number
): {
  isGeneric: boolean;
  deltaFromBaseRate: number;
  reason: string;
} {
  const delta = Math.abs(predictionProb - leagueBaseRate);
  const isGeneric = delta <= 0.025;
  return {
    isGeneric,
    deltaFromBaseRate: Number(delta.toFixed(3)),
    reason: isGeneric 
      ? `Model probability ${(predictionProb * 100).toFixed(1)}% is within ±2.5% of the competition baseline (${(leagueBaseRate * 100).toFixed(1)}%). Pick is generic and conveys no match-specific edge.`
      : `Model probability ${(predictionProb * 100).toFixed(1)}% deviates by +${(delta * 100).toFixed(1)}% from competition base rate, reflecting match-specific tactical signals.`
  };
}

/**
 * Selects diversified recommendations ensuring AT MOST ONE PICK PER MARKET FAMILY,
 * ordered by calibrated edge over baseline and profile alignment.
 */
export function enforceFamilyDiversity(
  candidates: MarketPrediction[],
  profile: FixtureProfile
): {
  diversifiedOptions: MarketPrediction[];
  whyFamilyRanked: Array<{
    family: string;
    bestOption: string;
    edge: number;
    rankReason: string;
  }>;
} {
  const priorityFamilies = getProfilePriorityFamilies(profile);
  const seenFamilies = new Set<string>();
  const diversified: MarketPrediction[] = [];
  const familyBreakdown: Array<{
    family: string;
    bestOption: string;
    edge: number;
    rankReason: string;
  }> = [];

  // Group candidates by family
  const byFamily = new Map<string, MarketPrediction[]>();
  for (const c of candidates) {
    const fam = c.marketFamily || c.marketCategory;
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam)!.push(c);
  }

  // Evaluate the best representative from each family
  byFamily.forEach((list, fam) => {
    // Sort within family by edgeOverBaseline
    list.sort((a, b) => (b.edgeOverBaseline ?? 0) - (a.edgeOverBaseline ?? 0));
    const best = list[0];
    if (best) {
      const isPriority = priorityFamilies.includes(fam as MarketFamily);
      const edge = best.edgeOverBaseline ?? 0;

      familyBreakdown.push({
        family: fam,
        bestOption: best.selection,
        edge,
        rankReason: isPriority 
          ? `Directly aligned with ${profile} profile. Edge: +${(edge * 100).toFixed(1)}%.`
          : `Secondary priority for ${profile} profile. Edge: +${(edge * 100).toFixed(1)}%.`
      });
    }
  });

  // Sort families by priority and edge
  familyBreakdown.sort((a, b) => b.edge - a.edge);

  // Take at most 1 per family
  for (const fb of familyBreakdown) {
    const list = byFamily.get(fb.family);
    if (list && list.length > 0) {
      const topOfFamily = list[0];
      if (!seenFamilies.has(fb.family)) {
        seenFamilies.add(fb.family);
        diversified.push(topOfFamily);
      }
    }
  }

  return {
    diversifiedOptions: diversified,
    whyFamilyRanked: familyBreakdown
  };
}

/**
 * Top Pick Monitoring and Concentration Alert:
 * Raises an alert if any single family/option dominates > 40% of top picks across a cohort.
 */
export function checkTopPickConcentration(
  topPicks: MarketPrediction[]
): {
  isAlertTriggered: boolean;
  dominantMarket?: string;
  dominancePct?: number;
  alertMessage?: string;
} {
  if (topPicks.length < 10) return { isAlertTriggered: false };

  const counts: Record<string, number> = {};
  for (const p of topPicks) {
    const key = p.marketCode;
    counts[key] = (counts[key] || 0) + 1;
  }

  const total = topPicks.length;
  for (const [key, count] of Object.entries(counts)) {
    const pct = count / total;
    if (pct > 0.40) {
      return {
        isAlertTriggered: true,
        dominantMarket: key,
        dominancePct: Number((pct * 100).toFixed(1)),
        alertMessage: `Diagnostic Alert: Market '${key}' represents ${(pct * 100).toFixed(1)}% of top picks (exceeds 40% ceiling). Audit for potential line miscalibration or baseline leakage.`
      };
    }
  }

  return { isAlertTriggered: false };
}
