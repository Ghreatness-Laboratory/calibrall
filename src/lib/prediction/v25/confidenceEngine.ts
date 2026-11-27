// CALIBRALL: Confidence Engine & Risk Flags Controller for Dixon Coles v2.5
// Eliminates the word "Safe". Implements honest, calibrated confidence tiers (High / Medium / Low),
// detects pre-kickoff risk flags, and enforces strict Asian Handicap gating.

import { ConfidenceTier, SupportedOptionType } from '@/types';
import { V25FixtureFeatures } from './featureLayer';
import { isTeamNewsEnabled } from './featureFlags';

export interface V25RiskFlagEvaluation {
  flags: string[];
  downgradesCount: number;
  hasVenueH2HContradiction: boolean;
  hasAdverseFormGap: boolean;
  hasKeyAbsences: boolean;
  hasScheduleCongestion: boolean;
  hasDerbyRivalry: boolean;
  hasNewManager: boolean;
  hasMissingLineup: boolean;
  summaryNote?: string;
}

export interface V25ConfidenceAssessment {
  confidenceTier: ConfidenceTier;
  confidenceScore: number; // 0.0 to 1.0
  isHandicapQualified: boolean;
  disqualificationReason?: string;
  confidenceReasons: string[];
}

export class ConfidenceEngine {
  /**
   * Detects all risk flags for a specific selection on a fixture.
   */
  public static evaluateRiskFlags(
    optionType: SupportedOptionType,
    selection: string,
    features: V25FixtureFeatures
  ): V25RiskFlagEvaluation {
    const flags: string[] = [];

    const isHomeSelection = selection.toLowerCase().includes('home') || 
      selection.toLowerCase().includes(features.homeTeam.toLowerCase()) ||
      selection.startsWith('1X2_HOME') ||
      selection.startsWith('DC_1X');

    const isAwaySelection = selection.toLowerCase().includes('away') || 
      selection.toLowerCase().includes(features.awayTeam.toLowerCase()) ||
      selection.startsWith('1X2_AWAY') ||
      selection.startsWith('DC_X2');

    // 1. Contradicting venue-specific H2H
    // If selecting Away team (or away handicap) and Home team won recent meeting(s) at this venue
    let hasVenueH2HContradiction = false;
    if (isAwaySelection && features.h2h.venueContradictionFlag) {
      flags.push('Contradicting venue H2H history');
      hasVenueH2HContradiction = true;
    } else if (isHomeSelection && features.h2h.lastMeetingWinner === 'away' && features.h2h.awayWins > features.h2h.homeWins) {
      flags.push('Contradicting venue H2H history');
      hasVenueH2HContradiction = true;
    }

    // 2. Big form gap against the pick
    let hasAdverseFormGap = false;
    if (isAwaySelection && (features.awayForm.formGapAdverse || (features.homeForm.momentumScore - features.awayForm.momentumScore > 0.40))) {
      flags.push('Adverse form and momentum gap');
      hasAdverseFormGap = true;
    } else if (isHomeSelection && (features.homeForm.formGapAdverse || (features.awayForm.momentumScore - features.homeForm.momentumScore > 0.40))) {
      flags.push('Adverse form and momentum gap');
      hasAdverseFormGap = true;
    }

    // 3. Key injuries or heavy squad rotation
    let hasKeyAbsences = false;
    if (isHomeSelection && (features.homeAbsences.missingXgShare > 0.15 || features.homeAbsences.keyCbAbsent)) {
      flags.push('Key home absences or defensive injuries');
      hasKeyAbsences = true;
    } else if (isAwaySelection && (features.awayAbsences.missingXgShare > 0.15 || features.awayAbsences.keyCbAbsent)) {
      flags.push('Key away absences or defensive injuries');
      hasKeyAbsences = true;
    }

    // 4. Schedule congestion / European midweek fatigue
    let hasScheduleCongestion = false;
    if (isHomeSelection && features.homeFatigue.hadMidweekEuropean) {
      flags.push('Midweek European travel and rest deficit');
      hasScheduleCongestion = true;
    } else if (isAwaySelection && features.awayFatigue.hadMidweekEuropean) {
      flags.push('Midweek European travel and rest deficit');
      hasScheduleCongestion = true;
    }

    // 5. Derby / rivalry (Raises variance across all markets)
    let hasDerbyRivalry = false;
    if (features.isDerby) {
      flags.push(`High variance rivalry match (${features.derbyName || 'Derby'})`);
      hasDerbyRivalry = true;
    }

    // 6. New manager window
    let hasNewManager = false;
    if (isHomeSelection && features.homeCoach.isNewManagerWindow) {
      flags.push('Unsettled tactical transition under new manager');
      hasNewManager = true;
    } else if (isAwaySelection && features.awayCoach.isNewManagerWindow) {
      flags.push('Unsettled tactical transition under new manager');
      hasNewManager = true;
    }

    // 7. Missing lineup data (pre-lineup)
    let hasMissingLineup = false;
    if (features.homeAbsences.lineupStatus === 'pre_lineup') {
      flags.push('Unconfirmed team sheets (pre lineup)');
      hasMissingLineup = true;
    }

    // When team news is globally disabled (free-tier data architecture), evaluateConfidence
    // already caps HIGH -> MEDIUM via !isTeamNewsEnabled(). Do not also count the ambient
    // pre-lineup status as an active match risk flag that inflates uncertainty/downgrades.
    const activeRiskCount = isTeamNewsEnabled()
      ? flags.length
      : flags.length - (hasMissingLineup ? 1 : 0);

    return {
      flags,
      downgradesCount: activeRiskCount,
      hasVenueH2HContradiction,
      hasAdverseFormGap,
      hasKeyAbsences,
      hasScheduleCongestion,
      hasDerbyRivalry,
      hasNewManager,
      hasMissingLineup,
      summaryNote: activeRiskCount > 0 ? `${activeRiskCount} active risk flag${activeRiskCount > 1 ? 's' : ''} detected.` : undefined,
    };
  }

  /**
   * Evaluates honest confidence tier (HIGH, MEDIUM, LOW) based on:
   * calibrated probability, uncertainty spread, data completeness, agreement with market,
   * and absence of risk flags.
   */
  public static evaluateConfidence(
    calibratedProb: number,
    uncertaintySpread: number,
    dataCompleteness: number,
    edgeOverMarket: number,
    riskEvaluation: V25RiskFlagEvaluation,
    optionType: SupportedOptionType
  ): V25ConfidenceAssessment {
    const isAsianHandicap = optionType === 'asian_handicap' || optionType === 'european_handicap';
    const isMultiGoals =
      optionType === 'multi_goals' ||
      optionType === 'team_multi_goals' ||
      optionType === 'first_half_multi_goals';

    // Base score computed from probability and data completeness minus uncertainty
    let confidenceScore = (calibratedProb * 0.55) + (dataCompleteness * 0.25) + (Math.max(0, edgeOverMarket) * 0.20) - (uncertaintySpread * 0.8);
    confidenceScore = Math.max(0.20, Math.min(0.98, Number(confidenceScore.toFixed(3))));

    // Strict rule: If ANY risk flag is present, HIGH tier is strictly impossible!
    let tier: ConfidenceTier = 'LOW';
    const hasAdverseNegativeEdge = edgeOverMarket !== undefined && edgeOverMarket < -0.05;
    const confidenceReasons: string[] = [];

    if (isMultiGoals) {
      if (
        isTeamNewsEnabled() &&
        calibratedProb >= 0.60 &&
        uncertaintySpread <= 0.065 &&
        dataCompleteness >= 0.80 &&
        riskEvaluation.downgradesCount === 0
      ) {
        tier = 'HIGH';
      } else if (
        calibratedProb >= 0.48 &&
        uncertaintySpread <= 0.085 &&
        dataCompleteness >= 0.65 &&
        riskEvaluation.downgradesCount <= 1
      ) {
        tier = 'MEDIUM';
      } else {
        tier = 'LOW';
        if (calibratedProb < 0.48) confidenceReasons.push(`calibrated probability ${(calibratedProb * 100).toFixed(1)}% below 48.0%`);
        if (uncertaintySpread > 0.085) confidenceReasons.push(`uncertainty spread ±${(uncertaintySpread * 100).toFixed(1)}% above 8.5%`);
        if (dataCompleteness < 0.65) confidenceReasons.push(`data coverage ${Math.round(dataCompleteness * 100)}% below 65%`);
        if (riskEvaluation.downgradesCount > 1) confidenceReasons.push(`${riskEvaluation.downgradesCount} active risk flags`);
      }
    } else if (
      isTeamNewsEnabled() &&
      calibratedProb >= 0.70 &&
      uncertaintySpread <= 0.055 &&
      dataCompleteness >= 0.85 &&
      !hasAdverseNegativeEdge &&
      riskEvaluation.downgradesCount === 0 &&
      !isAsianHandicap // Asian handicap is never labeled HIGH tier due to inherent variance
    ) {
      tier = 'HIGH';
    } else if (
      calibratedProb >= 0.55 &&
      uncertaintySpread <= 0.075 &&
      dataCompleteness >= 0.65 &&
      riskEvaluation.downgradesCount <= 1 &&
      (!isAsianHandicap || !riskEvaluation.hasVenueH2HContradiction) && // Venue contradiction forbids MEDIUM on handicaps
      !riskEvaluation.hasAdverseFormGap
    ) {
      tier = 'MEDIUM';
      if (!isTeamNewsEnabled() && calibratedProb >= 0.70) {
        confidenceReasons.push('capped at Medium without confirmed team news');
      }
    } else {
      tier = 'LOW';
      if (calibratedProb < 0.55) confidenceReasons.push(`calibrated probability ${(calibratedProb * 100).toFixed(1)}% below 55.0%`);
      if (uncertaintySpread > 0.075) confidenceReasons.push(`uncertainty spread ±${(uncertaintySpread * 100).toFixed(1)}% above 7.5%`);
      if (dataCompleteness < 0.65) confidenceReasons.push(`data coverage ${Math.round(dataCompleteness * 100)}% below 65%`);
      if (riskEvaluation.downgradesCount > 1) confidenceReasons.push(`${riskEvaluation.downgradesCount} active risk flags`);
      if (isAsianHandicap && riskEvaluation.hasVenueH2HContradiction) confidenceReasons.push('contradicting venue head to head history');
      if (riskEvaluation.hasAdverseFormGap) confidenceReasons.push('adverse recent form gap');
    }

    // MANDATORY CAP: No High tier allowed when team news is absent or on experimental goal_runs market
    if ((!isTeamNewsEnabled() || optionType === 'goal_runs') && tier === 'HIGH') {
      tier = 'MEDIUM';
      if (optionType === 'goal_runs') {
        confidenceReasons.push('experimental market capped below High tier');
      } else if (!confidenceReasons.some((r) => r.includes('team news'))) {
        confidenceReasons.push('capped at Medium without confirmed team news');
      }
    }

    // Specialized Asian Handicap gating rule:
    // Asian handicap picks require:
    // 1. Min calibrated probability >= 0.60
    // 2. Min edge >= +3.0% over devigged market line
    // 3. Minimum tier: MUST be at least MEDIUM (LOW is rejected)
    // 4. ZERO contradicting venue-specific H2H and ZERO adverse form gap
    let isHandicapQualified = true;
    let disqualificationReason: string | undefined = undefined;

    if (isAsianHandicap) {
      if (calibratedProb < 0.60) {
        isHandicapQualified = false;
        disqualificationReason = `Asian handicap probability ${(calibratedProb * 100).toFixed(1)}% fails the required 60.0% threshold.`;
      } else if (edgeOverMarket < 0.030) {
        isHandicapQualified = false;
        disqualificationReason = `Asian handicap edge +${(edgeOverMarket * 100).toFixed(1)}% fails the required +3.0% safety hurdle.`;
      } else if (tier === 'LOW') {
        isHandicapQualified = false;
        disqualificationReason = `Asian handicap confidence tier is LOW due to elevated risk flags or uncertainty; model abstains.`;
      } else if (riskEvaluation.hasVenueH2HContradiction) {
        isHandicapQualified = false;
        disqualificationReason = `Contradicting venue H2H history indicates elevated underdog fragility; model abstains.`;
      } else if (riskEvaluation.hasAdverseFormGap) {
        isHandicapQualified = false;
        disqualificationReason = `Adverse form momentum gap against selection; model abstains.`;
      }
    }

    return {
      confidenceTier: tier,
      confidenceScore,
      isHandicapQualified,
      disqualificationReason,
      confidenceReasons,
    };
  }
}
