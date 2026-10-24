// CALIBRALL: Dixon Coles v2.5 Fixture Evaluator
// Evaluates all authorized markets per fixture using contextual covariates,
// Platt calibration, quarter-line Asian handicaps, honest confidence tiers,
// and zero-force pick selection (abstains when edge or confidence fails).

import { 
  FixtureContext, 
  MarketPrediction, 
  SupportedOptionType, 
  MarketCategory, 
  MarketPeriod, 
  ConfidenceTier,
  QualificationStatus
} from '@/types';
import { FeatureLayerEngine, V25FixtureFeatures } from './featureLayer';
import { DixonColesV25Engine, V25ScorelineMatrix } from './dixonColesV25';
import { ConfidenceEngine, V25RiskFlagEvaluation } from './confidenceEngine';
import { WhyPanelGenerator } from './whyPanel';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { formatSelectionName } from '../marketCatalog';

export interface V25EvaluatedFixtureResult {
  engineVersion: 'v2.5.0';
  fixtureId: string;
  features: V25FixtureFeatures;
  scorelineMatrix: V25ScorelineMatrix;
  predictions: MarketPrediction[];
  topPick: MarketPrediction | null;
  alternativePicks: MarketPrediction[];
  noRecommendationReason?: string;
  dataCompletenessScore: number;
}

interface RawOptionCandidate {
  marketCode: string;
  optionType: SupportedOptionType;
  marketCategory: MarketCategory;
  marketName: string;
  selection: string;
  line?: number;
  period: MarketPeriod;
  settlementRule: string;
  rawProb: number;
  marketOdds?: number;
  pushProbability?: number;
  handicapLine?: number;
  handicapType?: 'asian' | 'european';
}

export class DixonColesV25Evaluator {
  public static evaluateFixture(context: FixtureContext): V25EvaluatedFixtureResult {
    // 1. Compute pre-kickoff features (Zero temporal leakage)
    const features = FeatureLayerEngine.computeFixtureFeatures(context);

    // 2. Compute covariate-adjusted lambda and mu
    const { lambda, mu } = DixonColesV25Engine.computeCovariateRates(
      context.homeXg,
      context.awayXg,
      features
    );

    // 3. Generate 10x10 scoreline joint distribution matrix with quarter-line Asian Handicaps
    const matrixResult = DixonColesV25Engine.generateScorelineMatrix(
      lambda,
      mu,
      features
    );

    // 4. Generate candidate markets
    const candidates = this.buildCandidateList(context, matrixResult, features);

    // 5. Calibrate, evaluate risk flags, and assign honest confidence tiers
    const processed: MarketPrediction[] = [];

    for (const cand of candidates) {
      // Risk flags check
      const riskEval = ConfidenceEngine.evaluateRiskFlags(
        cand.optionType,
        cand.selection,
        features
      );

      // Platt calibration & uncertainty spread
      const calibration = DixonColesV25Engine.calibratePrediction(
        cand.rawProb,
        cand.marketCategory,
        cand.marketOdds,
        features,
        riskEval.downgradesCount
      );

      // Expected Value and Edge
      const calProb = calibration.calibratedProb;
      const odds = cand.marketOdds;
      const implied = odds && odds > 1 ? Number((1 / odds).toFixed(4)) : undefined;
      const edge = implied !== undefined ? Number((calProb - implied).toFixed(4)) : undefined;
      const ev = odds && odds > 1 ? Number(((calProb * odds) - 1.0).toFixed(4)) : undefined;

      // Confidence Assessment
      const confAssessment = ConfidenceEngine.evaluateConfidence(
        calProb,
        calibration.uncertaintySpread,
        features.dataCompletenessScore,
        edge ?? 0.0,
        riskEval,
        cand.optionType
      );

      // Qualification & Abstain status
      let qualStatus: QualificationStatus = 'UNQUALIFIED_MARGINAL';
      const meetsEdge = edge !== undefined && edge >= 0.030; // +3.0% edge rule
      const meetsProb = calProb >= 0.50;

      if (!confAssessment.isHandicapQualified) {
        qualStatus = 'NO_RECOMMENDATION';
      } else if (meetsEdge && meetsProb) {
        qualStatus = 'QUALIFIED_VALUE';
      } else if (meetsProb && calProb >= 0.65) {
        qualStatus = 'QUALIFIED_PROBABILITY';
      } else if (calibration.uncertaintySpread > 0.08) {
        qualStatus = 'UNQUALIFIED_HIGH_UNCERTAINTY';
      }

      // Ranking score = edge * confidence * prob
      const edgeWeight = Math.max(0, edge ?? 0.01) * 35;
      const rankingScore = Number((edgeWeight * confAssessment.confidenceScore + (calProb * 2.5)).toFixed(3));

      // Generate "Why" panel data
      const whyData = WhyPanelGenerator.generateWhyPanel(
        cand.optionType,
        cand.selection,
        calProb,
        calibration.uncertaintySpread,
        features,
        riskEval
      );

      const prediction: MarketPrediction = {
        id: `pred_v25_${context.fixtureId}_${cand.marketCode}`,
        fixtureId: context.fixtureId,
        marketCode: cand.marketCode,
        optionType: cand.optionType,
        marketCategory: cand.marketCategory,
        marketName: cand.marketName,
        selection: formatSelectionName(cand.selection),
        line: cand.line,
        period: cand.period,
        settlementRule: cand.settlementRule,
        modelProbability: calProb,
        marketOdds: odds,
        impliedProbability: implied,
        expectedValue: ev,
        edge: edge,
        // Confidence & Honest Tiering (No "Safe")
        confidenceTier: confAssessment.confidenceTier,
        riskTier: confAssessment.confidenceTier, // Maps directly to HIGH / MEDIUM / LOW
        confidenceScore: confAssessment.confidenceScore,
        modelConfidence: confAssessment.confidenceTier === 'HIGH' ? 'HIGH' : confAssessment.confidenceTier === 'MEDIUM' ? 'MODERATE' : 'LOW',
        qualificationStatus: qualStatus,
        rankingScore,
        isTopPick: false,
        settlementStatus: 'PENDING',
        evidenceTier: confAssessment.confidenceTier === 'HIGH' 
          ? 'High Confidence Projection' 
          : confAssessment.confidenceTier === 'MEDIUM' 
          ? 'Medium Confidence Projection' 
          : 'Low Confidence / Speculative',
        dataQualityScore: features.dataCompletenessScore,
        isProbabilityBasedAnalysis: !cand.marketOdds,
        pushProbability: cand.pushProbability,
        stateTags: context.stateTags || [],
        lineupStatus: context.lineupConfirmed ? 'confirmed' : 'pre-lineup',
        topFactorContributions: [],
        handicapType: cand.handicapType,
        handicapLine: cand.handicapLine,
        calibratedProbability: calProb,
        rawModelProbability: cand.rawProb,
        uncertaintySpread: calibration.uncertaintySpread,
        ci90: [calibration.ciLower90, calibration.ciUpper90],
        riskFlags: whyData.riskFlags,
        whyPanel: {
          factorsFor: whyData.factorsFor,
          factorsAgainst: whyData.factorsAgainst,
          riskFlags: whyData.riskFlags,
        },
        engineVersion: 'v2.5.0',
        dataCompletenessScore: features.dataCompletenessScore,
        abstainReason: confAssessment.disqualificationReason,
      };

      processed.push(prediction);
    }

    // 6. Rank candidates
    // Top candidates must be QUALIFIED_VALUE or high probability with positive edge
    const qualifiedCandidates = processed
      .filter(p => (p.qualificationStatus === 'QUALIFIED_VALUE' || p.qualificationStatus === 'QUALIFIED_PROBABILITY') && (p.edge ?? 0) >= 0.01)
      .sort((a, b) => b.rankingScore - a.rankingScore);

    let topPick: MarketPrediction | null = null;
    let alternativePicks: MarketPrediction[] = [];
    let noRecommendationReason: string | undefined = undefined;

    if (qualifiedCandidates.length > 0) {
      topPick = qualifiedCandidates[0];
      topPick.isTopPick = true;
      // Up to 2 alternatives from distinct market categories
      const pickedCategories = new Set<string>([topPick.marketCategory]);
      alternativePicks = [];

      for (let i = 1; i < qualifiedCandidates.length && alternativePicks.length < 2; i++) {
        const alt = qualifiedCandidates[i];
        if (!pickedCategories.has(alt.marketCategory)) {
          alternativePicks.push(alt);
          pickedCategories.add(alt.marketCategory);
        }
      }
    } else {
      noRecommendationReason = cleanDisplayText(
        "No recommended pick: pre match contextual factors, adverse risk flags, or market efficiency indicate insufficient statistical edge. Abstaining on this fixture."
      );
    }

    // Sort all predictions by ranking score for consistent UI rendering
    processed.sort((a, b) => b.rankingScore - a.rankingScore);

    return {
      engineVersion: 'v2.5.0',
      fixtureId: context.fixtureId,
      features,
      scorelineMatrix: matrixResult,
      predictions: processed,
      topPick,
      alternativePicks,
      noRecommendationReason,
      dataCompletenessScore: features.dataCompletenessScore,
    };
  }

  /**
   * Builds raw candidate options across all authorized market types.
   */
  private static buildCandidateList(
    context: FixtureContext,
    matrix: V25ScorelineMatrix,
    features: V25FixtureFeatures
  ): RawOptionCandidate[] {
    const list: RawOptionCandidate[] = [];
    const odds = context.verifiedOdds || {};

    const home = context.homeTeamName;
    const away = context.awayTeamName;

    // 1. 1X2 Match Result
    list.push({
      marketCode: '1X2_HOME',
      optionType: 'win',
      marketCategory: 'match_result',
      marketName: 'Match Result',
      selection: `${home} to win`,
      period: 'REGULAR_TIME',
      settlementRule: 'Regular time 90 mins.',
      rawProb: matrix.homeWin,
      marketOdds: odds.homeWin,
    });
    list.push({
      marketCode: '1X2_DRAW',
      optionType: 'draw',
      marketCategory: 'match_result',
      marketName: 'Match Result (Draw)',
      selection: 'Draw',
      period: 'REGULAR_TIME',
      settlementRule: 'Regular time draw.',
      rawProb: matrix.draw,
      marketOdds: odds.draw,
    });
    list.push({
      marketCode: '1X2_AWAY',
      optionType: 'win',
      marketCategory: 'match_result',
      marketName: 'Match Result',
      selection: `${away} to win`,
      period: 'REGULAR_TIME',
      settlementRule: 'Regular time 90 mins.',
      rawProb: matrix.awayWin,
      marketOdds: odds.awayWin,
    });

    // 2. Double Chance
    list.push({
      marketCode: 'DC_1X',
      optionType: 'double_chance',
      marketCategory: 'double_chance',
      marketName: 'Double Chance',
      selection: `${home} or Draw`,
      period: 'REGULAR_TIME',
      settlementRule: 'Wins if home victory or draw.',
      rawProb: matrix.doubleChance.homeOrDraw,
      marketOdds: odds.homeWin && odds.draw ? Number((1 / ((1 / odds.homeWin) + (1 / odds.draw))).toFixed(2)) : undefined,
    });
    list.push({
      marketCode: 'DC_X2',
      optionType: 'double_chance',
      marketCategory: 'double_chance',
      marketName: 'Double Chance',
      selection: `${away} or Draw`,
      period: 'REGULAR_TIME',
      settlementRule: 'Wins if away victory or draw.',
      rawProb: matrix.doubleChance.awayOrDraw,
      marketOdds: odds.awayWin && odds.draw ? Number((1 / ((1 / odds.awayWin) + (1 / odds.draw))).toFixed(2)) : undefined,
    });

    // 3. Over / Under Goals
    [1.5, 2.5, 3.5].forEach(line => {
      const g = matrix.overUnderGoals[line];
      list.push({
        marketCode: `TOTAL_GOALS_O${String(line).replace('.', '')}`,
        optionType: 'over_under_goals',
        marketCategory: 'total_goals',
        marketName: `Over / Under ${line} Goals`,
        selection: `Over ${line} goals`,
        line,
        period: 'REGULAR_TIME',
        settlementRule: `Combined match goals > ${line}.`,
        rawProb: g.over,
        marketOdds: line === 2.5 ? odds.over25Goals : undefined,
      });
      list.push({
        marketCode: `TOTAL_GOALS_U${String(line).replace('.', '')}`,
        optionType: 'over_under_goals',
        marketCategory: 'total_goals',
        marketName: `Over / Under ${line} Goals`,
        selection: `Under ${line} goals`,
        line,
        period: 'REGULAR_TIME',
        settlementRule: `Combined match goals < ${line}.`,
        rawProb: g.under,
        marketOdds: line === 2.5 ? odds.under25Goals : undefined,
      });
    });

    // 4. Both Teams to Score (BTTS)
    list.push({
      marketCode: 'BTTS_YES',
      optionType: 'both_teams_to_score',
      marketCategory: 'btts',
      marketName: 'Both Teams to Score',
      selection: 'BTTS: Yes',
      period: 'REGULAR_TIME',
      settlementRule: 'Both teams score at least 1 goal.',
      rawProb: matrix.bttsYes,
      marketOdds: odds.bttsYes,
    });
    list.push({
      marketCode: 'BTTS_NO',
      optionType: 'both_teams_to_score',
      marketCategory: 'btts',
      marketName: 'Both Teams to Score',
      selection: 'BTTS: No',
      period: 'REGULAR_TIME',
      settlementRule: 'At least one team clean sheet.',
      rawProb: matrix.bttsNo,
      marketOdds: odds.bttsNo,
    });

    // 5. Draw or Over 2.5 Goals
    list.push({
      marketCode: 'COMBO_DRAW_OR_O25',
      optionType: 'double_chance',
      marketCategory: 'combos',
      marketName: 'Draw or Over 2.5 Goals',
      selection: 'Draw or Over 2.5 goals',
      period: 'REGULAR_TIME',
      settlementRule: 'Settles won if match ends in a draw OR if total match goals exceed 2.5.',
      rawProb: matrix.drawOrOver25,
      marketOdds: 1.34,
    });

    // 6. Asian Handicap including Quarter Lines (-1.25, -0.75, +0.75, +1.25, etc.)
    const ahLines = [-1.5, -1.25, -1.0, -0.75, -0.5, 0.0, 0.5, 0.75, 1.0, 1.25, 1.5];
    ahLines.forEach(line => {
      const hOutcome = matrix.asianHandicap.home[line];
      const aOutcome = matrix.asianHandicap.away[line];

      if (hOutcome) {
        list.push({
          marketCode: `AH_HOME_${line >= 0 ? `P${line}` : `M${Math.abs(line)}`}`.replace('.', '_'),
          optionType: 'asian_handicap',
          marketCategory: 'handicap',
          marketName: `Asian Handicap ${line > 0 ? `+${line}` : line}`,
          selection: `${home} ${line > 0 ? `+${line}` : line}`,
          handicapLine: line,
          handicapType: 'asian',
          period: 'REGULAR_TIME',
          settlementRule: `Asian handicap line ${line}. Full win/half win/push/half loss.`,
          rawProb: hOutcome.effectiveWinProb,
          pushProbability: hOutcome.push,
          marketOdds: line === -1.0 ? 2.10 : line === 1.0 ? 1.78 : line === 0.0 ? odds.homeWin : 1.90,
        });
      }

      if (aOutcome) {
        list.push({
          marketCode: `AH_AWAY_${line >= 0 ? `P${line}` : `M${Math.abs(line)}`}`.replace('.', '_'),
          optionType: 'asian_handicap',
          marketCategory: 'handicap',
          marketName: `Asian Handicap ${line > 0 ? `+${line}` : line}`,
          selection: `${away} ${line > 0 ? `+${line}` : line}`,
          handicapLine: line,
          handicapType: 'asian',
          period: 'REGULAR_TIME',
          settlementRule: `Asian handicap line ${line}. Full win/half win/push/half loss.`,
          rawProb: aOutcome.effectiveWinProb,
          pushProbability: aOutcome.push,
          marketOdds: line === 1.0 ? 1.82 : line === -1.0 ? 2.05 : line === 0.0 ? odds.awayWin : 1.92,
        });
      }
    });

    // 7. Corners (NegBinomial with PPDA & weather)
    const corners = DixonColesV25Engine.calculateCorners(context.expectedCornersHome, context.expectedCornersAway, features);
    list.push({
      marketCode: 'CORNERS_O95',
      optionType: 'corners',
      marketCategory: 'total_corners',
      marketName: 'Total Corners Over 9.5',
      selection: 'Over 9.5 corners',
      line: 9.5,
      period: 'REGULAR_TIME',
      settlementRule: 'Total match corners > 9.5.',
      rawProb: corners.overUnderLines[9.5]?.over ?? 0.52,
      marketOdds: odds.over95Corners,
    });
    list.push({
      marketCode: 'CORNERS_U95',
      optionType: 'corners',
      marketCategory: 'total_corners',
      marketName: 'Total Corners Under 9.5',
      selection: 'Under 9.5 corners',
      line: 9.5,
      period: 'REGULAR_TIME',
      settlementRule: 'Total match corners < 9.5.',
      rawProb: corners.overUnderLines[9.5]?.under ?? 0.48,
      marketOdds: odds.under95Corners,
    });

    // 8. Bookings / Disciplinary Cards
    const cards = DixonColesV25Engine.calculateCards(features);
    list.push({
      marketCode: 'CARDS_O45',
      optionType: 'bookings',
      marketCategory: 'bookings',
      marketName: 'Total Cards Over 4.5',
      selection: 'Over 4.5 bookings',
      line: 4.5,
      period: 'REGULAR_TIME',
      settlementRule: 'Yellow card = 1, Red card = 2. Total bookings > 4.5.',
      rawProb: cards.overUnderLines[4.5]?.over ?? 0.46,
      marketOdds: odds.over45Cards,
    });

    // 9. Highest Scoring Half
    list.push({
      marketCode: 'HSH_2ND',
      optionType: 'highest_scoring_half',
      marketCategory: 'half_time',
      marketName: 'Highest Scoring Half: 2nd Half',
      selection: 'Highest scoring half: 2nd half',
      period: 'FULL_TIME',
      settlementRule: '2nd half goals exceed 1st half goals.',
      rawProb: matrix.highestScoringHalf.secondHalf,
      marketOdds: 2.05,
    });

    // 10. First Half Over 0.5 Goals
    list.push({
      marketCode: 'FH_GOALS_O05',
      optionType: 'first_half_goals',
      marketCategory: 'half_time',
      marketName: '1st Half Over 0.5 Goals',
      selection: '1st half over 0.5 goals',
      line: 0.5,
      period: 'FIRST_HALF',
      settlementRule: 'At least 1 goal scored in first half.',
      rawProb: matrix.firstHalfGoals[0.5]?.over ?? 0.72,
      marketOdds: 1.40,
    });

    return list;
  }
}
