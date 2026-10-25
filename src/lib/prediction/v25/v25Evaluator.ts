// CALIBRALL: Dixon Coles v2.5 Fixture Evaluator
// Evaluates all authorized markets per fixture using contextual covariates,
// Platt calibration, match-specific competitive Asian handicaps, honest confidence tiers,
// per-prediction data completeness and uncertainty, sanity tripwires, and zero-force pick selection.

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
import { getMarketBaseline } from '../baselines';
import { marketMonitor } from '../marketMonitor';
import { getMarketFamily } from '../marketSelection';

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

    // 3. Generate 10x10 scoreline joint distribution matrix with Asian Handicaps
    const matrixResult = DixonColesV25Engine.generateScorelineMatrix(
      lambda,
      mu,
      features
    );

    // 4. Generate candidate markets using match-specific competitive lines (NO fake odds)
    const candidates = this.buildCandidateList(context, matrixResult, features, lambda, mu);

    // 5. Calibrate, compute PER-PREDICTION values, evaluate risk flags, and assign honest confidence tiers
    const processed: MarketPrediction[] = [];

    for (const cand of candidates) {
      // Risk flags check
      const riskEval = ConfidenceEngine.evaluateRiskFlags(
        cand.optionType,
        cand.selection,
        features
      );

      // REAL PER-PREDICTION DATA COMPLETENESS (Not a constant!)
      let predCompleteness = 0.88;
      if (context.lineupConfirmed) predCompleteness += 0.04;
      if (context.sampleSizeMatches >= 18) predCompleteness += 0.03;
      else if (context.sampleSizeMatches < 12) predCompleteness -= 0.06;

      if (cand.marketOdds !== undefined) predCompleteness += 0.04;
      else predCompleteness -= 0.04;

      if (cand.marketCategory === 'total_corners' || cand.marketCategory === 'team_corners') {
        predCompleteness -= 0.05;
      } else if (cand.marketCategory === 'bookings') {
        predCompleteness -= 0.06;
      } else if (cand.marketCategory === 'handicap') {
        predCompleteness -= 0.03;
      } else if (cand.marketCategory === 'match_result') {
        predCompleteness += 0.02;
      }
      predCompleteness = Math.max(0.65, Math.min(0.98, Number(predCompleteness.toFixed(3))));

      // REAL PER-PREDICTION UNCERTAINTY SPREAD (Not a constant!)
      let baseMarketSpread = 0.038;
      switch (cand.marketCategory) {
        case 'double_chance': baseMarketSpread = 0.032; break;
        case 'match_result': baseMarketSpread = 0.038; break;
        case 'total_goals': baseMarketSpread = 0.041; break;
        case 'btts': baseMarketSpread = 0.043; break;
        case 'half_time': baseMarketSpread = 0.051; break;
        case 'handicap': baseMarketSpread = 0.054; break;
        case 'combos': baseMarketSpread = 0.056; break;
        case 'total_corners':
        case 'team_corners': baseMarketSpread = 0.062; break;
        case 'bookings': baseMarketSpread = 0.068; break;
        default: baseMarketSpread = 0.045; break;
      }

      const samplePenalty = Math.max(0, 16 - context.sampleSizeMatches) * 0.003;
      const weatherPenalty = features.weather.isMissing ? 0.008 : 0;
      const riskPenalty = riskEval.downgradesCount * 0.008;
      const completenessPenalty = (1.0 - predCompleteness) * 0.055;

      const uncertaintySpread = Number(Math.min(0.12, Math.max(0.024,
        baseMarketSpread + completenessPenalty + samplePenalty + weatherPenalty + riskPenalty
      )).toFixed(4));

      // Platt calibration and market devigging
      let deviggedMarketProb: number | undefined = undefined;
      let calProb = cand.rawProb;

      if (cand.marketOdds && cand.marketOdds > 1.0) {
        const implied = 1 / cand.marketOdds;
        deviggedMarketProb = Math.max(0.02, Math.min(0.98, implied / 1.05));
        const calibration = DixonColesV25Engine.calibratePrediction(
          cand.rawProb,
          cand.marketCategory,
          cand.marketOdds,
          features,
          riskEval.downgradesCount
        );
        calProb = calibration.calibratedProb;
      } else {
        const calibration = DixonColesV25Engine.calibratePrediction(
          cand.rawProb,
          cand.marketCategory,
          undefined,
          features,
          riskEval.downgradesCount
        );
        calProb = calibration.calibratedProb;
      }

      // Expected Value and Sanity Tripwire (NO FAKE ODDS OR EV)
      let ev: number | null = null;
      let edge: number | undefined = undefined;
      let implied: number | undefined = undefined;
      let sanityTripwire = false;
      let tripwireReason: string | undefined = undefined;

      if (cand.marketOdds && cand.marketOdds > 1.0) {
        implied = Number((1 / cand.marketOdds).toFixed(4));
        ev = Number(((calProb * cand.marketOdds) - 1.0).toFixed(4));
        edge = Number((calProb - implied).toFixed(4));

        // Sanity Tripwires:
        // 1. Any EV above 15%
        // 2. Any model probability differing from de-vigged market probability by > 15 points
        if (ev > 0.15 || (deviggedMarketProb !== undefined && Math.abs(calProb - deviggedMarketProb) > 0.15)) {
          sanityTripwire = true;
          tripwireReason = ev > 0.15
            ? `EV (+${(ev * 100).toFixed(1)}%) exceeds 15% credibility limit. Check data.`
            : `Model probability (${(calProb * 100).toFixed(1)}%) differs from de-vigged market (${((deviggedMarketProb ?? 0) * 100).toFixed(1)}%) by >15 points. Check data.`;
        }
      } else {
        // If odds missing, EV is strictly NULL (probability analysis only)
        ev = null;
        edge = undefined;
        implied = undefined;
      }

      // Baseline comparison & Fixture-specificity check
      const baselineResult = getMarketBaseline(cand.marketCode, context.competitionCode, cand.line, (context as any).teamStats);
      const baseRate = baselineResult.baseRate;
      const edgeOverBaseline = Number((calProb - baseRate).toFixed(4));
      // Generic check: If probability is within 2.5% of baseline rate, it is generic
      const isGenericPick = Math.abs(calProb - baseRate) <= 0.025;

      // Wide handicap check: Wide cushion lines (|line| >= 1.5 or baseRate >= 0.70) cannot get cheap probability credit
      const isWideHandicap = cand.optionType === 'asian_handicap' && (Math.abs(cand.handicapLine ?? 0) >= 1.5 || baseRate >= 0.70 || calProb >= 0.72);

      // Confidence Assessment using per-prediction values
      const confAssessment = ConfidenceEngine.evaluateConfidence(
        calProb,
        uncertaintySpread,
        predCompleteness,
        edge ?? (edgeOverBaseline > 0 ? edgeOverBaseline : 0.0),
        riskEval,
        cand.optionType
      );

      // Qualification & Abstain status
      let qualStatus: QualificationStatus = 'UNQUALIFIED_MARGINAL';
      if (sanityTripwire) {
        qualStatus = 'UNQUALIFIED_MARGINAL';
      } else if (!confAssessment.isHandicapQualified) {
        qualStatus = 'NO_RECOMMENDATION';
      } else if (cand.marketOdds && (edge ?? 0) >= 0.025 && (ev ?? 0) > 0.015 && calProb >= 0.28) {
        qualStatus = 'QUALIFIED_VALUE';
      } else if (edgeOverBaseline >= 0.030 && calProb >= 0.35 && uncertaintySpread <= 0.075 && !isGenericPick) {
        qualStatus = 'QUALIFIED_PROBABILITY';
      } else if (uncertaintySpread > 0.078) {
        qualStatus = 'UNQUALIFIED_HIGH_UNCERTAINTY';
      }

      // Ranking score: strictly edge & EV driven
      let rankingScore = 0;
      if (cand.marketOdds && !sanityTripwire) {
        const edgeVal = Math.max(0, edge ?? 0);
        if (edgeVal >= 0.015) {
          rankingScore = Number((edgeVal * 60 * confAssessment.confidenceScore + (ev ?? 0) * 20).toFixed(3));
        }
      } else {
        // Without real odds: ranking must be strictly driven by edge over baseline!
        // Never reward raw high probability on wide/easy lines (baseRate >= 0.68 or calProb >= 0.70)
        const edgeVal = edgeOverBaseline;
        if (edgeVal >= 0.030 && !isGenericPick && baseRate < 0.68 && calProb < 0.70) {
          const uncertaintyFactor = Math.max(0.4, 1.0 - uncertaintySpread * 2.5);
          rankingScore = Number((edgeVal * 45 * confAssessment.confidenceScore * uncertaintyFactor).toFixed(3));
        }
      }

      // Penalize generic picks, high-variance secondary markets, and wide handicaps
      if (isGenericPick) rankingScore *= 0.3;
      if (cand.optionType === 'corners') rankingScore *= 0.85;
      if (cand.optionType === 'bookings') rankingScore *= 0.85;
      if (cand.optionType === 'asian_handicap') rankingScore *= 0.75;

      // Generate "Why" panel data
      const whyData = WhyPanelGenerator.generateWhyPanel(
        cand.optionType,
        cand.selection,
        calProb,
        uncertaintySpread,
        features,
        riskEval
      );

      const prediction: MarketPrediction = {
        id: `pred_v25_${context.fixtureId}_${cand.marketCode}`,
        fixtureId: context.fixtureId,
        marketCode: cand.marketCode,
        optionType: cand.optionType,
        marketCategory: cand.marketCategory,
        marketFamily: getMarketFamily(cand.optionType, cand.marketCode, cand.marketCategory),
        marketName: cand.marketName,
        selection: formatSelectionName(cand.selection),
        line: cand.line,
        period: cand.period,
        settlementRule: cand.settlementRule,
        modelProbability: calProb,
        marketOdds: cand.marketOdds,
        impliedProbability: implied,
        expectedValue: ev,
        edge: edge,
        confidenceTier: confAssessment.confidenceTier,
        riskTier: confAssessment.confidenceTier,
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
        dataQualityScore: predCompleteness,
        dataCompletenessScore: predCompleteness,
        isProbabilityBasedAnalysis: !cand.marketOdds,
        pushProbability: cand.pushProbability,
        stateTags: context.stateTags || [],
        lineupStatus: context.lineupConfirmed ? 'confirmed' : 'pre-lineup',
        topFactorContributions: [],
        handicapType: cand.handicapType,
        handicapLine: cand.handicapLine,
        calibratedProbability: calProb,
        rawModelProbability: cand.rawProb,
        uncertaintySpread,
        ci90: [Number((calProb - uncertaintySpread * 1.645).toFixed(4)), Number((calProb + uncertaintySpread * 1.645).toFixed(4))],
        riskFlags: whyData.riskFlags,
        whyPanel: {
          factorsFor: whyData.factorsFor,
          factorsAgainst: whyData.factorsAgainst,
          riskFlags: whyData.riskFlags,
        },
        engineVersion: 'v2.5.0',
        abstainReason: confAssessment.disqualificationReason,
        baselineProbability: baseRate,
        edgeOverBaseline,
        isGenericPick,
        sanityTripwire,
        tripwireReason,
      };

      processed.push(prediction);
    }

    // 6. Rank candidates & Select Top Pick
    // When the fixture has verified odds, top pick must be a qualified value bet with real verified odds!
    const hasAnyVerifiedOdds = Boolean(context.verifiedOdds && Object.values(context.verifiedOdds).some(v => typeof v === 'number' && v > 1.0));

    const eligibleTopPicks = processed.filter(p => {
      if (p.sanityTripwire) return false;
      if (p.isGenericPick) return false;
      // Wide handicaps (|line| >= 1.5) cannot be top pick!
      if (p.optionType === 'asian_handicap' && Math.abs(p.handicapLine ?? 0) >= 1.5) return false;
      if (p.qualificationStatus === 'NO_RECOMMENDATION' || p.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY') return false;

      if (hasAnyVerifiedOdds) {
        // When real bookmaker odds exist, top pick MUST have verified odds and positive EV!
        return Boolean(p.marketOdds && p.qualificationStatus === 'QUALIFIED_VALUE' && (p.expectedValue ?? 0) > 0.015);
      }

      // Offline / probability-only mode (when no verified odds exist on fixture)
      if ((p.baselineProbability ?? 0) >= 0.68) return false;
      return (p.edgeOverBaseline ?? 0) >= 0.030 && (p.uncertaintySpread ?? 1.0) <= 0.068;
    }).sort((a, b) => b.rankingScore - a.rankingScore);

    let topPick: MarketPrediction | null = null;
    let alternativePicks: MarketPrediction[] = [];
    let noRecommendationReason: string | undefined = undefined;

    if (eligibleTopPicks.length > 0) {
      topPick = eligibleTopPicks[0];
      topPick.isTopPick = true;

      // Record recommendation in telemetry monitor
      const fam = getMarketFamily(topPick.optionType, topPick.marketCode, topPick.marketCategory);
      marketMonitor.recordRecommendation(
        context.fixtureId,
        fam,
        topPick.marketCode,
        topPick.selection
      );

      // Up to 2 alternatives from distinct market categories
      const pickedCategories = new Set<string>([topPick.marketCategory]);
      for (let i = 1; i < eligibleTopPicks.length && alternativePicks.length < 2; i++) {
        const alt = eligibleTopPicks[i];
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
   * Real odds are assigned strictly from context.verifiedOdds. NO MOCK ODDS.
   */
  private static buildCandidateList(
    context: FixtureContext,
    matrix: V25ScorelineMatrix,
    features: V25FixtureFeatures,
    lambda: number,
    mu: number
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
      if (g) {
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
      }
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

    // 5. Draw or Over 2.5 Goals (Combo) - NO fake odds
    list.push({
      marketCode: 'COMBO_DRAW_OR_O25',
      optionType: 'double_chance',
      marketCategory: 'combos',
      marketName: 'Draw or Over 2.5 Goals',
      selection: 'Draw or Over 2.5 goals',
      period: 'REGULAR_TIME',
      settlementRule: 'Settles won if match ends in a draw OR if total match goals exceed 2.5.',
      rawProb: matrix.drawOrOver25,
      marketOdds: undefined,
    });

    // 6. Asian Handicap: Select competitive lines per match from margin distribution (lambda - mu)
    // Never use a fixed +1.5 for the home team on every match!
    const goalDiff = lambda - mu; // positive = home favored, negative = away favored

    // Determine the 1 or 2 competitive lines for this specific fixture matchup
    const competitiveLines: number[] = [];
    if (goalDiff >= 1.35) {
      competitiveLines.push(-1.5, -1.25);
    } else if (goalDiff >= 0.85) {
      competitiveLines.push(-1.0, -0.75);
    } else if (goalDiff >= 0.35) {
      competitiveLines.push(-0.5, -0.25);
    } else if (goalDiff >= -0.35) {
      competitiveLines.push(0.0);
    } else if (goalDiff >= -0.85) {
      competitiveLines.push(0.25, 0.5);
    } else if (goalDiff >= -1.35) {
      competitiveLines.push(0.75, 1.0);
    } else {
      competitiveLines.push(1.25, 1.5);
    }

    // Include -1.0 and 1.0 when teams are close so both Home +1 and Away +1 remain auditable
    if (!competitiveLines.includes(-1.0) && Math.abs(goalDiff) <= 1.2) {
      competitiveLines.push(-1.0);
    }
    if (!competitiveLines.includes(1.0) && Math.abs(goalDiff) <= 1.2) {
      competitiveLines.push(1.0);
    }

    competitiveLines.forEach(line => {
      // Home candidate
      const hOutcome = matrix.asianHandicap.home[line];
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
          marketOdds: (odds as any)?.asianHandicapHome?.[line] ?? undefined, // NO FAKE ODDS!
        });
      }

      // Symmetrical away candidate with opposite line: -line
      const oppLine = -line;
      const aOutcome = matrix.asianHandicap.away[oppLine];
      if (aOutcome) {
        list.push({
          marketCode: `AH_AWAY_${oppLine >= 0 ? `P${oppLine}` : `M${Math.abs(oppLine)}`}`.replace('.', '_'),
          optionType: 'asian_handicap',
          marketCategory: 'handicap',
          marketName: `Asian Handicap ${oppLine > 0 ? `+${oppLine}` : oppLine}`,
          selection: `${away} ${oppLine > 0 ? `+${oppLine}` : oppLine}`,
          handicapLine: oppLine,
          handicapType: 'asian',
          period: 'REGULAR_TIME',
          settlementRule: `Asian handicap line ${oppLine}. Full win/half win/push/half loss.`,
          rawProb: aOutcome.effectiveWinProb,
          pushProbability: aOutcome.push,
          marketOdds: (odds as any)?.asianHandicapAway?.[oppLine] ?? undefined, // NO FAKE ODDS!
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

    // 9. Highest Scoring Half - NO fake odds
    list.push({
      marketCode: 'HSH_2ND',
      optionType: 'highest_scoring_half',
      marketCategory: 'half_time',
      marketName: 'Highest Scoring Half: 2nd Half',
      selection: 'Highest scoring half: 2nd half',
      period: 'FULL_TIME',
      settlementRule: '2nd half goals exceed 1st half goals.',
      rawProb: matrix.highestScoringHalf.secondHalf,
      marketOdds: undefined,
    });

    // 10. First Half Over 0.5 Goals - NO fake odds
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
      marketOdds: undefined,
    });

    return list;
  }
}
