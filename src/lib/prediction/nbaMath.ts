// NBA Score Projection Engine
// Implements the exact Offensive/Defensive Efficiency and Possessions model.
// NO pace blending, NO home court adjustments, or external alterations.

export interface TeamEfficiencyInput {
  name: string;
  offensiveEfficiency: number; // e.g. 1.159 (points scored per possession)
  defensiveEfficiency: number; // e.g. 1.085 (points allowed per possession)
  possessions: number;          // e.g. 98.5 (possessions per game)
}

export interface SportsbookLineInput {
  totalLine?: number;          // e.g. 224.5
  spreadLineTeamA?: number;    // e.g. -4.5 (Team A favored by 4.5)
}

export interface StepByStepCalculation {
  // Step 1: Offense
  aOff: number;
  bOff: number;
  // Step 2: Defense
  aDef: number;
  bDef: number;
  // Step 3: Projected Score
  aProjected: number;
  bProjected: number;
  // Step 4: Totals & Margin
  total: number;
  margin: number;
  projectedWinner: string;
  projectedLoser: string;
  // Sportsbook Leans (optional)
  totalLean?: {
    line: number;
    diff: number; // projection - line
    lean: 'OVER' | 'UNDER' | 'PUSH';
    recommendation: string;
  };
  spreadLean?: {
    line: number; // Spread for Team A
    diff: number; // (A_proj - B_proj) + line
    leanTeam: string;
    recommendation: string;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: {
    teamA?: {
      offEff?: string;
      defEff?: string;
      poss?: string;
    };
    teamB?: {
      offEff?: string;
      defEff?: string;
      poss?: string;
    };
  };
}

export const EFFICIENCY_MIN = 0.8;
export const EFFICIENCY_MAX = 1.4;
export const POSSESSIONS_MIN = 85.0;
export const POSSESSIONS_MAX = 115.0;

export function validateTeamInputs(
  teamA: TeamEfficiencyInput,
  teamB: TeamEfficiencyInput
): ValidationResult {
  const errors: ValidationResult['errors'] = {
    teamA: {},
    teamB: {},
  };
  let isValid = true;

  // Validate Team A
  if (isNaN(teamA.offensiveEfficiency) || teamA.offensiveEfficiency < EFFICIENCY_MIN || teamA.offensiveEfficiency > EFFICIENCY_MAX) {
    errors.teamA!.offEff = `Offensive efficiency must be between ${EFFICIENCY_MIN.toFixed(1)} and ${EFFICIENCY_MAX.toFixed(1)}`;
    isValid = false;
  }
  if (isNaN(teamA.defensiveEfficiency) || teamA.defensiveEfficiency < EFFICIENCY_MIN || teamA.defensiveEfficiency > EFFICIENCY_MAX) {
    errors.teamA!.defEff = `Defensive efficiency must be between ${EFFICIENCY_MIN.toFixed(1)} and ${EFFICIENCY_MAX.toFixed(1)}`;
    isValid = false;
  }
  if (isNaN(teamA.possessions) || teamA.possessions < POSSESSIONS_MIN || teamA.possessions > POSSESSIONS_MAX) {
    errors.teamA!.poss = `Possessions must be between ${POSSESSIONS_MIN} and ${POSSESSIONS_MAX}`;
    isValid = false;
  }

  // Validate Team B
  if (isNaN(teamB.offensiveEfficiency) || teamB.offensiveEfficiency < EFFICIENCY_MIN || teamB.offensiveEfficiency > EFFICIENCY_MAX) {
    errors.teamB!.offEff = `Offensive efficiency must be between ${EFFICIENCY_MIN.toFixed(1)} and ${EFFICIENCY_MAX.toFixed(1)}`;
    isValid = false;
  }
  if (isNaN(teamB.defensiveEfficiency) || teamB.defensiveEfficiency < EFFICIENCY_MIN || teamB.defensiveEfficiency > EFFICIENCY_MAX) {
    errors.teamB!.defEff = `Defensive efficiency must be between ${EFFICIENCY_MIN.toFixed(1)} and ${EFFICIENCY_MAX.toFixed(1)}`;
    isValid = false;
  }
  if (isNaN(teamB.possessions) || teamB.possessions < POSSESSIONS_MIN || teamB.possessions > POSSESSIONS_MAX) {
    errors.teamB!.poss = `Possessions must be between ${POSSESSIONS_MIN} and ${POSSESSIONS_MAX}`;
    isValid = false;
  }

  return { isValid, errors };
}

/**
 * Calculates the exact NBA score projection according to user specifications:
 * 1. Offense:
 *    A_off = A offensive eff × A possessions
 *    B_off = B offensive eff × B possessions
 * 2. Defense:
 *    A_def = A defensive eff × B possessions (what A allows vs B)
 *    B_def = B defensive eff × A possessions (what B allows vs A)
 * 3. Projected score:
 *    A projected = (A_off + B_def) / 2
 *    B projected = (B_off + A_def) / 2
 * 4. Projected total = A projected + B projected. Margin & projected winner.
 */
export function calculateNBAScoreProjection(
  teamA: TeamEfficiencyInput,
  teamB: TeamEfficiencyInput,
  sportsbook?: SportsbookLineInput
): StepByStepCalculation {
  // Step 1: Offense
  const aOff = teamA.offensiveEfficiency * teamA.possessions;
  const bOff = teamB.offensiveEfficiency * teamB.possessions;

  // Step 2: Defense (each team's defensive eff × opponent's possessions)
  const aDef = teamA.defensiveEfficiency * teamB.possessions; // what A allows vs B
  const bDef = teamB.defensiveEfficiency * teamA.possessions; // what B allows vs A

  // Step 3: Projected score (average team's offense with what opponent allows)
  const aProjected = (aOff + bDef) / 2;
  const bProjected = (bOff + aDef) / 2;

  // Step 4: Projected total, margin, winner
  const total = aProjected + bProjected;
  const margin = Math.abs(aProjected - bProjected);
  const projectedWinner = aProjected >= bProjected ? teamA.name : teamB.name;
  const projectedLoser = aProjected >= bProjected ? teamB.name : teamA.name;

  const result: StepByStepCalculation = {
    aOff,
    bOff,
    aDef,
    bDef,
    aProjected,
    bProjected,
    total,
    margin,
    projectedWinner,
    projectedLoser,
  };

  // Step 5: Optional Sportsbook Comparisons
  if (sportsbook?.totalLine !== undefined && !isNaN(sportsbook.totalLine)) {
    const diff = total - sportsbook.totalLine;
    let lean: 'OVER' | 'UNDER' | 'PUSH' = 'PUSH';
    if (diff > 0.5) lean = 'OVER';
    else if (diff < -0.5) lean = 'UNDER';

    result.totalLean = {
      line: sportsbook.totalLine,
      diff,
      lean,
      recommendation:
        lean === 'OVER'
          ? `Over ${sportsbook.totalLine} (Projection +${diff.toFixed(2)} pts)`
          : lean === 'UNDER'
          ? `Under ${sportsbook.totalLine} (Projection ${diff.toFixed(2)} pts)`
          : `Even with line (${sportsbook.totalLine})`,
    };
  }

  if (sportsbook?.spreadLineTeamA !== undefined && !isNaN(sportsbook.spreadLineTeamA)) {
    // Model projected margin: (A_proj - B_proj)
    // Team A covers if (A_proj - B_proj) + spreadLineTeamA > 0
    // Example: A is favored by -4.5 (spreadLineTeamA = -4.5). Model has A winning by 8 (8 - 4.5 = +3.5 > 0 -> Team A covers).
    // If Model has B winning by 4.88 (A_proj - B_proj = -4.88) and A is +2.5: -4.88 + 2.5 = -2.38 -> Team B covers.
    const spreadDiff = (aProjected - bProjected) + sportsbook.spreadLineTeamA;
    const coverTeam = spreadDiff > 0 ? teamA.name : teamB.name;

    result.spreadLean = {
      line: sportsbook.spreadLineTeamA,
      diff: spreadDiff,
      leanTeam: coverTeam,
      recommendation: `${coverTeam} cover lean (${Math.abs(spreadDiff).toFixed(2)} pt edge vs ${sportsbook.spreadLineTeamA > 0 ? '+' : ''}${sportsbook.spreadLineTeamA} spread)`,
    };
  }

  return result;
}
