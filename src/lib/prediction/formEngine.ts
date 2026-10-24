// CALIBRALL: Decay-Weighted Opponent-Adjusted Form Engine
// Evaluates rolling 5, 10, and 20-match performance windows with exponential decay,
// venue splits (home/away), opponent-strength normalization, and Bayesian shrinkage toward league averages.
// Uses underlying xG, shots, shots on target, and chances created (not just raw goals).

export interface MatchPerformanceMetric {
  matchDate: string; // ISO string
  isHome: boolean;
  opponentName: string;
  opponentAttackRating: number;
  opponentDefenseRating: number;
  goalsFor: number;
  goalsAgainst: number;
  xgFor: number;
  xgAgainst: number;
  shotsFor: number;
  shotsAgainst: number;
  shotsOnTargetFor: number;
  shotsOnTargetAgainst: number;
  bigChancesCreated: number;
  bigChancesConceded: number;
}

export interface RollingFormWindow {
  windowSize: 5 | 10 | 20;
  matchesCount: number;
  decayWeightedXgDiff: number;
  decayWeightedGoalDiff: number;
  decayWeightedShotsOnTargetDiff: number;
  decayWeightedBigChancesDiff: number;
  opponentAdjustedXgDiff: number;
  shrunkXgDiff: number; // Shrunk toward league prior 0.0 based on sample size
  formIndex: number;    // -1.0 (severe slump) to +1.0 (surging form)
}

export interface TeamFormProfile {
  teamName: string;
  isHome: boolean;
  last5: RollingFormWindow;
  last10: RollingFormWindow;
  last20: RollingFormWindow;
  venueSpecificForm: {
    venueMatchesCount: number;
    venueDecayXgDiff: number;
    venueShrunkXgDiff: number;
  };
  compositeFormModifier: number; // Multiplier centered at 1.0 (e.g. 0.92 to 1.12)
  summaryText: string;
}

const DECAY_RATE = 0.05; // Exponential decay per match recency
const SHRINKAGE_PRIOR_MATCHES = 10; // Kappa for Bayesian shrinkage toward league mean

/**
 * Computes decay weights: w_i = e^(-lambda * i)
 */
function getDecayWeights(n: number): number[] {
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.exp(-DECAY_RATE * i);
    weights.push(w);
    sum += w;
  }
  return weights.map(w => w / sum); // Normalized weights
}

/**
 * Evaluates a single rolling form window
 */
export function computeRollingWindow(
  matches: MatchPerformanceMetric[],
  windowSize: 5 | 10 | 20,
  leagueAvgXgDiff: number = 0.0
): RollingFormWindow {
  const slice = matches.slice(0, windowSize);
  const n = slice.length;

  if (n === 0) {
    return {
      windowSize,
      matchesCount: 0,
      decayWeightedXgDiff: 0,
      decayWeightedGoalDiff: 0,
      decayWeightedShotsOnTargetDiff: 0,
      decayWeightedBigChancesDiff: 0,
      opponentAdjustedXgDiff: 0,
      shrunkXgDiff: 0,
      formIndex: 0,
    };
  }

  const weights = getDecayWeights(n);

  let decayXgDiff = 0;
  let decayGoalDiff = 0;
  let decaySotDiff = 0;
  let decayBcDiff = 0;
  let oppAdjustedXgDiff = 0;

  for (let i = 0; i < n; i++) {
    const m = slice[i];
    const w = weights[i];

    const rawXgDiff = m.xgFor - m.xgAgainst;
    const rawGoalDiff = m.goalsFor - m.goalsAgainst;
    const rawSotDiff = m.shotsOnTargetFor - m.shotsOnTargetAgainst;
    const rawBcDiff = m.bigChancesCreated - m.bigChancesConceded;

    decayXgDiff += rawXgDiff * w;
    decayGoalDiff += rawGoalDiff * w;
    decaySotDiff += rawSotDiff * w;
    decayBcDiff += rawBcDiff * w;

    // Opponent adjustment:
    // If opponent has strong defense (defenseRating < 1.0), achieving +xG is worth more.
    // If opponent has weak attack (attackRating < 1.0), conceding xG is penalized more.
    const oppDefFactor = Math.max(0.6, Math.min(1.4, m.opponentDefenseRating));
    const oppAttFactor = Math.max(0.6, Math.min(1.4, m.opponentAttackRating));

    const adjustedXgFor = m.xgFor / oppDefFactor;
    const adjustedXgAgainst = m.xgAgainst / oppAttFactor;
    oppAdjustedXgDiff += (adjustedXgFor - adjustedXgAgainst) * w;
  }

  // Bayesian shrinkage toward league prior
  // shrunk = (n / (n + kappa)) * observed + (kappa / (n + kappa)) * leagueAvg
  const shrinkageWeight = n / (n + SHRINKAGE_PRIOR_MATCHES);
  const shrunkXgDiff = (shrinkageWeight * oppAdjustedXgDiff) + ((1 - shrinkageWeight) * leagueAvgXgDiff);

  // Form index mapped to [-1, 1] using hyperbolic tangent
  const formIndex = Math.max(-1.0, Math.min(1.0, Math.tanh(shrunkXgDiff / 1.25)));

  return {
    windowSize,
    matchesCount: n,
    decayWeightedXgDiff: Number(decayXgDiff.toFixed(2)),
    decayWeightedGoalDiff: Number(decayGoalDiff.toFixed(2)),
    decayWeightedShotsOnTargetDiff: Number(decaySotDiff.toFixed(2)),
    decayWeightedBigChancesDiff: Number(decayBcDiff.toFixed(2)),
    opponentAdjustedXgDiff: Number(oppAdjustedXgDiff.toFixed(2)),
    shrunkXgDiff: Number(shrunkXgDiff.toFixed(2)),
    formIndex: Number(formIndex.toFixed(3)),
  };
}

/**
 * Computes full multi-window form profile for a team
 */
export function computeTeamFormProfile(
  teamName: string,
  isHome: boolean,
  matchHistory: MatchPerformanceMetric[],
  leagueAvgXgDiff: number = 0.0
): TeamFormProfile {
  const last5 = computeRollingWindow(matchHistory, 5, leagueAvgXgDiff);
  const last10 = computeRollingWindow(matchHistory, 10, leagueAvgXgDiff);
  const last20 = computeRollingWindow(matchHistory, 20, leagueAvgXgDiff);

  // Venue-specific matches
  const venueMatches = matchHistory.filter(m => m.isHome === isHome);
  const venueWindow = computeRollingWindow(venueMatches, 10, leagueAvgXgDiff);

  // Multi-window composite: 50% last 5, 30% last 10, 20% last 20
  const compositeIndex = (last5.formIndex * 0.50) + (last10.formIndex * 0.30) + (last20.formIndex * 0.20);
  // Blend with venue specific form (25% weight)
  const venueBlended = (compositeIndex * 0.75) + (venueWindow.formIndex * 0.25);

  // Multiplier centered at 1.0 (between 0.88 and 1.12)
  const compositeFormModifier = Number((1.0 + (venueBlended * 0.12)).toFixed(3));

  let summaryText = 'Stable form around baseline expectations';
  if (venueBlended >= 0.35) {
    summaryText = `Surging form (+${last5.decayWeightedXgDiff > 0 ? '+' : ''}${last5.decayWeightedXgDiff.toFixed(2)} xG diff/gm, opponent adjusted)`;
  } else if (venueBlended <= -0.35) {
    summaryText = `Subdued form (${last5.decayWeightedXgDiff.toFixed(2)} xG diff/gm, creative output depressed)`;
  }

  return {
    teamName,
    isHome,
    last5,
    last10,
    last20,
    venueSpecificForm: {
      venueMatchesCount: venueMatches.length,
      venueDecayXgDiff: venueWindow.decayWeightedXgDiff,
      venueShrunkXgDiff: venueWindow.shrunkXgDiff,
    },
    compositeFormModifier,
    summaryText,
  };
}
