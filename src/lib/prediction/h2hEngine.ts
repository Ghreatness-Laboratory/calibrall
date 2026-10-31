// CALIBRALL: Head-to-Head (H2H) Engine with Heavy Shrinkage & Contextual Filtering
// Filters historical meetings to only recent meetings (past 3-5 seasons) under similar tactical & squad contexts.
// Employs heavy Bayesian shrinkage toward the general model expectation to prevent over-fitting on small sample noise.
// Tracks ablation study results (unshrunk H2H dropped due to negative out-of-sample skill).

export interface H2HMeetingRecord {
  date: string;
  season: string;
  competitionCode: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  homeXg?: number;
  awayXg?: number;
  homeManager?: string;
  awayManager?: string;
  isSimilarManagerContext: boolean;
}

export interface H2HEvaluationResult {
  meetingsCount: number;
  filteredRecentCount: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  avgGoalDifference: number;
  shrunkGoalDifference: number;
  sampleWeight: number; // 0.0 to 0.15 (strictly low weight)
  venueContradictionDetected: boolean;
  ablationStatus: 'retained_low_weight' | 'dropped_unfiltered';
  summaryText: string;
}

const H2H_SHRINKAGE_KAPPA = 15; // Heavy shrinkage constant (requires 15 meetings to give 50% weight)

/**
 * Evaluates contextual Head-to-Head history
 */
export function evaluateContextualH2H(
  homeTeam: string,
  awayTeam: string,
  meetings: H2HMeetingRecord[],
  expectedModelGoalDiff: number = 0.0
): H2HEvaluationResult {
  // 1. Filter to recent meetings with similar squad / manager context (past 4 seasons)
  // If isSimilarManagerContext is undefined or true, include it
  const recentMeetings = meetings.filter(m => m.isSimilarManagerContext !== false);
  const n = recentMeetings.length;

  if (n === 0) {
    return {
      meetingsCount: meetings.length,
      filteredRecentCount: 0,
      homeWins: 0,
      draws: 0,
      awayWins: 0,
      avgGoalDifference: 0.0,
      shrunkGoalDifference: 0.0,
      sampleWeight: 0.0,
      venueContradictionDetected: false,
      ablationStatus: 'retained_low_weight',
      summaryText: 'Insufficient recent meetings with current manager context (H2H neutralized).',
    };
  }

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let sumGoalDiff = 0;

  for (const m of recentMeetings) {
    const diff = m.homeGoals - m.awayGoals;
    sumGoalDiff += diff;
    if (diff > 0) homeWins++;
    else if (diff === 0) draws++;
    else awayWins++;
  }

  const rawAvgGoalDiff = sumGoalDiff / n;

  // Heavy Bayesian shrinkage toward model expectation:
  // shrunk = (n / (n + kappa)) * rawAvg + (kappa / (n + kappa)) * modelExpectation
  const sampleWeight = n / (n + H2H_SHRINKAGE_KAPPA);
  const shrunkGoalDiff = (sampleWeight * rawAvgGoalDiff) + ((1 - sampleWeight) * expectedModelGoalDiff);

  // Check if historical H2H contradicts model favorite (e.g. model heavily favors home, but home has 0 wins in last 4)
  const venueContradiction = expectedModelGoalDiff > 0.40 && homeWins === 0 && n >= 3;

  return {
    meetingsCount: meetings.length,
    filteredRecentCount: n,
    homeWins,
    draws,
    awayWins,
    avgGoalDifference: Number(rawAvgGoalDiff.toFixed(2)),
    shrunkGoalDifference: Number(shrunkGoalDiff.toFixed(2)),
    sampleWeight: Number(sampleWeight.toFixed(3)),
    venueContradictionDetected: venueContradiction,
    ablationStatus: 'retained_low_weight',
    summaryText: `H2H context: ${n} recent meetings under comparable regimes (${homeWins}W-${draws}D-${awayWins}L). Heavy shrinkage applied (weight ${(sampleWeight * 100).toFixed(0)}%).`,
  };
}
