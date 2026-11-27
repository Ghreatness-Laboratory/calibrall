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
  QualificationStatus,
  PickEvidence,
  VerifiedMatchOdds,
  MultiGoalsMeta,
} from '@/types';
import { FeatureLayerEngine, V25FixtureFeatures } from './featureLayer';
import { DixonColesV25Engine, V25ScorelineMatrix, COVARIATE_COEFFICIENTS } from './dixonColesV25';
import { ConfidenceEngine } from './confidenceEngine';
import { WhyPanelGenerator } from './whyPanel';
import { cleanDisplayText, displayName } from '@/lib/utils/formatText';
import { formatSelectionName, isOptionTypeEnabled } from '../marketCatalog';
import { isMultiGoalsEnabled } from './featureFlags';
import { getMarketBaseline } from '../baselines';
import { marketMonitor, getEquivalentCanonicalKey } from '../marketMonitor';
import { getMarketFamily } from '../marketSelection';
import { compareFootballPicksByRank } from '../explanationValidator';
import { calculateFragilityScore } from '../fragilityAndSubstitutes';
import { getCalibratedParams, getLeagueCalibratedConfig, getLeagueCapabilities } from '../calibratedParams';
import { checkMarketGating } from '../marketGating';
import { devigCompleteMarket } from '../oddsEngine';
import { isDisabledRecommendationMarket } from '@/lib/markets';

export const PICK_CONFIDENCE_THRESHOLD = 0.70;
export const MULTI_GOALS_HIGH_THRESHOLD = 0.60;

export function getConfidenceThresholdForOption(optionType: SupportedOptionType): number {
  if (
    optionType === 'multi_goals' ||
    optionType === 'team_multi_goals' ||
    optionType === 'first_half_multi_goals'
  ) {
    return MULTI_GOALS_HIGH_THRESHOLD;
  }
  return PICK_CONFIDENCE_THRESHOLD;
}

export interface V25EvaluatedFixtureResult {
  engineVersion: 'v25.0';
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
  deviggedProb?: number;
  pushProbability?: number;
  winProb?: number;
  halfWinProb?: number;
  pushProb?: number;
  halfLossProb?: number;
  lossProb?: number;
  handicapLine?: number;
  handicapType?: 'asian' | 'european';
  plainEnglishReason?: string;
  multiGoalsMeta?: MultiGoalsMeta;
  priceSource?: string;
}

type LadderKind = 'over' | 'under' | 'ah';

interface LadderInfo {
  ladderKey: string;
  kind: LadderKind;
  numericValue: number;
}

function getLadderInfo(p: Pick<MarketPrediction, 'marketCode' | 'marketCategory' | 'optionType' | 'line' | 'handicapLine'>): LadderInfo | null {
  const code = p.marketCode;
  if (code.startsWith('TOTAL_GOALS_O') && p.line !== undefined) {
    return { ladderKey: 'total_goals_over', kind: 'over', numericValue: p.line };
  }
  if (code.startsWith('TOTAL_GOALS_U') && p.line !== undefined) {
    return { ladderKey: 'total_goals_under', kind: 'under', numericValue: p.line };
  }
  if (code.startsWith('TEAM_GOALS_HOME_O') && p.line !== undefined) {
    return { ladderKey: 'team_goals_home_over', kind: 'over', numericValue: p.line };
  }
  if (code.startsWith('TEAM_GOALS_HOME_U') && p.line !== undefined) {
    return { ladderKey: 'team_goals_home_under', kind: 'under', numericValue: p.line };
  }
  if (code.startsWith('TEAM_GOALS_AWAY_O') && p.line !== undefined) {
    return { ladderKey: 'team_goals_away_over', kind: 'over', numericValue: p.line };
  }
  if (code.startsWith('TEAM_GOALS_AWAY_U') && p.line !== undefined) {
    return { ladderKey: 'team_goals_away_under', kind: 'under', numericValue: p.line };
  }
  if (code.startsWith('FH_GOALS_O') && p.line !== undefined) {
    return { ladderKey: 'fh_goals_over', kind: 'over', numericValue: p.line };
  }
  if (code.startsWith('FH_GOALS_U') && p.line !== undefined) {
    return { ladderKey: 'fh_goals_under', kind: 'under', numericValue: p.line };
  }
  if (code.startsWith('CORNERS_O') && p.line !== undefined) {
    return { ladderKey: 'corners_over', kind: 'over', numericValue: p.line };
  }
  if (code.startsWith('CORNERS_U') && p.line !== undefined) {
    return { ladderKey: 'corners_under', kind: 'under', numericValue: p.line };
  }
  if (code.startsWith('CARDS_O') && p.line !== undefined) {
    return { ladderKey: 'cards_over', kind: 'over', numericValue: p.line };
  }
  if (code.startsWith('CARDS_U') && p.line !== undefined) {
    return { ladderKey: 'cards_under', kind: 'under', numericValue: p.line };
  }
  if (p.optionType === 'asian_handicap' && p.handicapLine !== undefined) {
    const side = code.startsWith('AH_HOME_') ? 'home' : 'away';
    return { ladderKey: `ah_${side}`, kind: 'ah', numericValue: p.handicapLine };
  }
  if (p.optionType === 'multi_goals') {
    return { ladderKey: 'multi_goals_full', kind: 'over', numericValue: 0 };
  }
  if (p.optionType === 'team_multi_goals') {
    const side = code.startsWith('TEAM_MULTI_GOALS_HOME_') ? 'home' : 'away';
    return { ladderKey: `multi_goals_${side}`, kind: 'over', numericValue: 0 };
  }
  if (p.optionType === 'first_half_multi_goals') {
    return { ladderKey: 'multi_goals_first_half', kind: 'over', numericValue: 0 };
  }
  return null;
}

function resolveExactDeviggedProb(
  marketCode: string,
  marketOdds: number | undefined,
  odds: VerifiedMatchOdds,
  handicapLine?: number
): number | undefined {
  if (!marketOdds || marketOdds <= 1.0) return undefined;

  if (
    (marketCode === '1X2_HOME' || marketCode === '1X2_DRAW' || marketCode === '1X2_AWAY') &&
    odds.homeWin && odds.homeWin > 1.0 &&
    odds.draw && odds.draw > 1.0 &&
    odds.awayWin && odds.awayWin > 1.0
  ) {
    const { deviggedProbs } = devigCompleteMarket([odds.homeWin, odds.draw, odds.awayWin]);
    if (marketCode === '1X2_HOME') return deviggedProbs[0];
    if (marketCode === '1X2_DRAW') return deviggedProbs[1];
    return deviggedProbs[2];
  }

  if (
    (marketCode === 'TOTAL_GOALS_O25' || marketCode === 'TOTAL_GOALS_U25') &&
    odds.over25Goals && odds.over25Goals > 1.0 &&
    odds.under25Goals && odds.under25Goals > 1.0
  ) {
    const { deviggedProbs } = devigCompleteMarket([odds.over25Goals, odds.under25Goals]);
    return marketCode === 'TOTAL_GOALS_O25' ? deviggedProbs[0] : deviggedProbs[1];
  }

  if (
    (marketCode === 'BTTS_YES' || marketCode === 'BTTS_NO') &&
    odds.bttsYes && odds.bttsYes > 1.0 &&
    odds.bttsNo && odds.bttsNo > 1.0
  ) {
    const { deviggedProbs } = devigCompleteMarket([odds.bttsYes, odds.bttsNo]);
    return marketCode === 'BTTS_YES' ? deviggedProbs[0] : deviggedProbs[1];
  }

  if (
    (marketCode === 'CORNERS_O95' || marketCode === 'CORNERS_U95') &&
    odds.over95Corners && odds.over95Corners > 1.0 &&
    odds.under95Corners && odds.under95Corners > 1.0
  ) {
    const { deviggedProbs } = devigCompleteMarket([odds.over95Corners, odds.under95Corners]);
    return marketCode === 'CORNERS_O95' ? deviggedProbs[0] : deviggedProbs[1];
  }

  if (
    (marketCode === 'CARDS_O45' || marketCode === 'CARDS_U45') &&
    odds.over45Cards && odds.over45Cards > 1.0 &&
    odds.under45Cards && odds.under45Cards > 1.0
  ) {
    const { deviggedProbs } = devigCompleteMarket([odds.over45Cards, odds.under45Cards]);
    return marketCode === 'CARDS_O45' ? deviggedProbs[0] : deviggedProbs[1];
  }

  if (marketCode.startsWith('AH_') && handicapLine !== undefined) {
    const isHome = marketCode.startsWith('AH_HOME_');
    const hLine = isHome ? handicapLine : -handicapLine;
    const aLine = -hLine;
    const hPrice = odds.asianHandicapHome?.[String(hLine)] ?? (odds.asianHandicapHome as Record<number, number> | undefined)?.[hLine];
    const aPrice = odds.asianHandicapAway?.[String(aLine)] ?? (odds.asianHandicapAway as Record<number, number> | undefined)?.[aLine];
    if (hPrice && hPrice > 1.0 && aPrice && aPrice > 1.0) {
      const { deviggedProbs } = devigCompleteMarket([hPrice, aPrice]);
      return isHome ? deviggedProbs[0] : deviggedProbs[1];
    }
  }

  // Fallback when only one side of the book is available
  return Math.max(0.02, Math.min(0.98, (1 / marketOdds) / 1.05));
}

export class DixonColesV25Evaluator {
  public static evaluateFixture(context: FixtureContext): V25EvaluatedFixtureResult {
    // 0. HARD RULE: If a fixture has no real team-strength input or data is stale (> 21 days), abstains.
    if (context.insufficientData || context.hasRealTeamStrength === false || context.noRecommendationReason?.startsWith('Data out of date')) {
      const features = FeatureLayerEngine.computeFixtureFeatures(context);
      return {
        engineVersion: 'v25.0',
        fixtureId: context.fixtureId,
        features,
        scorelineMatrix: DixonColesV25Engine.generateScorelineMatrix(1.0, 1.0, features),
        predictions: [],
        topPick: null,
        alternativePicks: [],
        noRecommendationReason: context.noRecommendationReason || cleanDisplayText(`Insufficient data: ${displayName(context.homeTeamName)} (${context.homeSampleMatches ?? context.sampleSizeMatches ?? 0} matches stored) and ${displayName(context.awayTeamName)} (${context.awaySampleMatches ?? context.sampleSizeMatches ?? 0} matches stored) lack sufficient historical match depth for projection.`),
        dataCompletenessScore: 0,
      };
    }

    // 1. Pre-kickoff features (Zero temporal leakage)
    const features = FeatureLayerEngine.computeFixtureFeatures(context);

    // 2. Covariate-adjusted lambda and mu
    const { lambda, mu } = DixonColesV25Engine.computeCovariateRates(
      context.homeXg,
      context.awayXg,
      features
    );

    // 2b. League parameters and separate 1H/2H team goal rates
    const calParams = getCalibratedParams();
    const leagueCfg = getLeagueCalibratedConfig(context.competitionCode);
    const cap = context.leagueCapabilities || getLeagueCapabilities(context.competitionCode);
    const rho = leagueCfg?.goals.dixonColesRho ?? -0.05;

    let explicitHalfXg: { h1HomeXg: number; h1AwayXg: number; h2HomeXg: number; h2AwayXg: number } | undefined = undefined;
    if (cap.hasHalfTimeGoals && leagueCfg?.halves) {
      const hv = leagueCfg.halves;
      const homeScale = lambda / Math.max(0.2, context.homeXg || lambda);
      const awayScale = mu / Math.max(0.2, context.awayXg || mu);
      const h1Att = context.home1HAttackRating ?? 1.0;
      const a1Def = context.away1HDefenseRating ?? 1.0;
      const a1Att = context.away1HAttackRating ?? 1.0;
      const h1Def = context.home1HDefenseRating ?? 1.0;
      const h2Att = context.home2HAttackRating ?? 1.0;
      const a2Def = context.away2HDefenseRating ?? 1.0;
      const a2Att = context.away2HAttackRating ?? 1.0;
      const h2Def = context.home2HDefenseRating ?? 1.0;

      explicitHalfXg = {
        h1HomeXg: Math.max(0.08, hv.avgHome1HGoals * h1Att * a1Def * homeScale),
        h1AwayXg: Math.max(0.08, hv.avgAway1HGoals * a1Att * h1Def * awayScale),
        h2HomeXg: Math.max(0.08, hv.avgHome2HGoals * h2Att * a2Def * homeScale),
        h2AwayXg: Math.max(0.08, hv.avgAway2HGoals * a2Att * h2Def * awayScale),
      };
    }

    // 3. Scoreline joint distribution matrix
    const matrixResult = DixonColesV25Engine.generateScorelineMatrix(
      lambda,
      mu,
      features,
      rho,
      8,
      explicitHalfXg
    );

    // 4. Generate candidate markets across EVERY enabled market & line
    const candidates = this.buildCandidateList(context, matrixResult, features, lambda, mu);

    // Pre-compute common sample sizes & feature context for PickEvidence
    const homeSamples = context.homeSampleMatches ?? context.sampleSizeMatches ?? 0;
    const awaySamples = context.awaySampleMatches ?? context.sampleSizeMatches ?? 0;
    const leagueSamples = leagueCfg?.goals.sampleSize ?? cap.sampleSizeMatches ?? 0;
    const h2hMeetingsCount = features.h2h.meetingsCount;
    const h2hSummaryText = h2hMeetingsCount >= 3
      ? cleanDisplayText(`${h2hMeetingsCount} prior meetings (${features.h2h.homeWins}W ${features.h2h.draws}D ${features.h2h.awayWins}L), shrunk goal diff ${features.h2h.shrunkGoalDiff >= 0 ? '+' : ''}${features.h2h.shrunkGoalDiff.toFixed(2)}`)
      : 'No qualifying head to head sample of 3 or more meetings in stored window';

    // 5. Calibrate, gate by walk-forward BSS, compute EV only on real odds
    const processed: MarketPrediction[] = [];
    const verifiedOdds = context.verifiedOdds || {};

    for (const cand of candidates) {
      const riskEval = ConfidenceEngine.evaluateRiskFlags(
        cand.optionType,
        cand.selection,
        features
      );

      // Per-prediction data completeness
      const baseCoverage = context.dataCoverageScore ?? 0.88;
      let predCompleteness = baseCoverage * 0.94;
      if (context.lineupConfirmed) predCompleteness += 0.035;
      if (context.sampleSizeMatches >= 20) predCompleteness += 0.035;
      else if (homeSamples < 10 || awaySamples < 10) predCompleteness -= 0.05;
      if (cand.marketOdds !== undefined) predCompleteness += 0.035;
      if (cand.marketCategory === 'total_corners' || cand.marketCategory === 'team_corners') predCompleteness -= 0.045;
      else if (cand.marketCategory === 'bookings') predCompleteness -= 0.055;
      else if (cand.marketCategory === 'handicap') predCompleteness -= 0.025;
      else if (cand.marketCategory === 'match_result') predCompleteness += 0.02;
      predCompleteness = Math.max(0.60, Math.min(0.98, Number(predCompleteness.toFixed(3))));

      // Per-prediction uncertainty spread
      const baseUncertainty = context.uncertaintyScore ?? 0.08;
      let categoryMultiplier = 1.0;
      switch (cand.marketCategory) {
        case 'double_chance': categoryMultiplier = 0.75; break;
        case 'match_result': categoryMultiplier = 0.90; break;
        case 'total_goals': categoryMultiplier = 0.95; break;
        case 'btts': categoryMultiplier = 1.00; break;
        case 'half_time': categoryMultiplier = 1.15; break;
        case 'handicap': categoryMultiplier = 1.20; break;
        case 'combos': categoryMultiplier = 1.25; break;
        case 'total_corners':
        case 'team_corners': categoryMultiplier = 1.40; break;
        case 'bookings': categoryMultiplier = 1.55; break;
        default: categoryMultiplier = 1.05; break;
      }
      const baseMarketSpread = (baseUncertainty * 0.32 * categoryMultiplier) + 0.012;
      const samplePenalty = Math.max(0, 16 - context.sampleSizeMatches) * 0.003;
      const weatherPenalty = features.weather.isMissing ? 0.004 : 0;
      const riskPenalty = riskEval.downgradesCount * 0.008;
      const completenessPenalty = (1.0 - predCompleteness) * 0.055;
      const uncertaintySpread = Number(Math.min(0.12, Math.max(0.024,
        baseMarketSpread + completenessPenalty + samplePenalty + weatherPenalty + riskPenalty
      )).toFixed(4));

      // Market de-vigging and Platt calibration
      let deviggedMarketProb: number | undefined = cand.deviggedProb;
      let skillVsDeviggedMarket: number | null | undefined = undefined;
      let calProb = cand.rawProb;

      if (cand.marketCategory === 'multi_goals' && cand.multiGoalsMeta) {
        const calibration = DixonColesV25Engine.calibrateMultiGoalsPrediction(
          cand.rawProb,
          cand.multiGoalsMeta.scope,
          features,
          riskEval.downgradesCount
        );
        calProb = calibration.calibratedProb;
        deviggedMarketProb = undefined;
        skillVsDeviggedMarket = null;
      } else if (cand.marketOdds && cand.marketOdds > 1.0) {
        if (deviggedMarketProb === undefined) {
          deviggedMarketProb = resolveExactDeviggedProb(cand.marketCode, cand.marketOdds, verifiedOdds, cand.handicapLine);
        }
        const calibration = DixonColesV25Engine.calibratePrediction(
          cand.rawProb,
          cand.marketCategory,
          cand.marketOdds,
          features,
          riskEval.downgradesCount,
          deviggedMarketProb
        );
        calProb = calibration.calibratedProb;
        deviggedMarketProb = calibration.deviggedMarketProb;
        if (deviggedMarketProb !== undefined) {
          skillVsDeviggedMarket = Number((calProb - deviggedMarketProb).toFixed(4));
        }
      } else {
        const calibration = DixonColesV25Engine.calibratePrediction(
          cand.rawProb,
          cand.marketCategory,
          undefined,
          features,
          riskEval.downgradesCount
        );
        calProb = calibration.calibratedProb;
        deviggedMarketProb = undefined;
        skillVsDeviggedMarket = null;
      }

      // Expected Value (p * odds - 1, or exact AH settlement when quarter/push applies) — strictly null without real odds
      let ev: number | null = null;
      let edge: number | undefined = undefined;
      let implied: number | undefined = undefined;
      let sanityTripwire = false;
      let tripwireReason: string | undefined = undefined;

      if (cand.marketOdds && cand.marketOdds > 1.0) {
        implied = Number((1 / cand.marketOdds).toFixed(4));
        if (cand.handicapType === 'asian' && cand.winProb !== undefined) {
          const o = cand.marketOdds;
          const exactEv =
            (cand.winProb * (o - 1)) +
            ((cand.halfWinProb ?? 0) * (o - 1) * 0.5) -
            ((cand.halfLossProb ?? 0) * 0.5) -
            (cand.lossProb ?? 0);
          ev = Number(exactEv.toFixed(4));
        } else {
          ev = Number(((calProb * cand.marketOdds) - 1.0).toFixed(4));
        }
        edge = deviggedMarketProb !== undefined
          ? Number((calProb - deviggedMarketProb).toFixed(4))
          : Number((calProb - implied).toFixed(4));

        if (ev > 0.15 || (deviggedMarketProb !== undefined && Math.abs(calProb - deviggedMarketProb) > 0.15)) {
          sanityTripwire = true;
          tripwireReason = ev > 0.15
            ? `EV (+${(ev * 100).toFixed(1)}%) exceeds 15% credibility limit. Check data.`
            : `Model probability (${(calProb * 100).toFixed(1)}%) differs from devigged market (${((deviggedMarketProb ?? 0) * 100).toFixed(1)}%) by >15 points. Check data.`;
        }
      } else {
        ev = null;
        edge = undefined;
        implied = undefined;
      }

      // Baseline comparison
      const baselineResult = getMarketBaseline(cand.marketCode, context.competitionCode, cand.line, (context as any).teamStats);
      const baseRate = baselineResult.baseRate;
      const edgeOverBaseline = Number((calProb - baseRate).toFixed(4));
      const isGenericPick = Math.abs(calProb - baseRate) <= 0.020;

      // Walk-Forward Brier Skill Gate per (leagueGroup, marketFamily) and Multi Goals scope
      const fam = getMarketFamily(cand.optionType, cand.marketCode, cand.marketCategory);
      const gate = checkMarketGating(fam, context.competitionCode, 30, cand.multiGoalsMeta?.scope);

      // Confidence assessment
      const confAssessment = ConfidenceEngine.evaluateConfidence(
        calProb,
        uncertaintySpread,
        predCompleteness,
        edge ?? (edgeOverBaseline > 0 ? edgeOverBaseline : 0.0),
        riskEval,
        cand.optionType
      );

      // Multi goals league-level speculative override & span tightness rule
      const candThreshold = getConfidenceThresholdForOption(cand.optionType);
      const isMultiGoalsCand = cand.marketCategory === 'multi_goals' && Boolean(cand.multiGoalsMeta);
      const mgSpan = cand.multiGoalsMeta?.span ?? 0;
      const passesMultiGoalsTightness = !isMultiGoalsCand || (mgSpan <= 3 || (mgSpan === 4 && calProb > 0.80));
      const isSpeculativeOnlyLeague = isMultiGoalsCand && gate.tierMode === 'SPECULATIVE_ONLY';

      if (isSpeculativeOnlyLeague) {
        confAssessment.confidenceTier = 'LOW';
        confAssessment.confidenceReasons.unshift(`speculative only league gate in ${gate.leagueGroup}`);
      }

      const homeCleanName = displayName(context.homeTeamName);
      const awayCleanName = displayName(context.awayTeamName);
      let confidenceReasonText: string | undefined = undefined;
      if (confAssessment.confidenceTier === 'LOW') {
        if (homeSamples < 10) {
          confidenceReasonText = cleanDisplayText(`only ${homeSamples} recent matches for ${homeCleanName}`);
        } else if (awaySamples < 10) {
          confidenceReasonText = cleanDisplayText(`only ${awaySamples} recent matches for ${awayCleanName}`);
        } else if (confAssessment.confidenceReasons.length > 0) {
          confidenceReasonText = cleanDisplayText(confAssessment.confidenceReasons[0]);
        }
      } else if (confAssessment.confidenceReasons.length > 0) {
        confidenceReasonText = cleanDisplayText(confAssessment.confidenceReasons[0]);
      }

      // Qualification Status
      let qualStatus: QualificationStatus = 'UNQUALIFIED_MARGINAL';
      const hasNonPositiveSkillVsMarket = Boolean(
        cand.marketOdds && cand.marketOdds > 1.0 && deviggedMarketProb !== undefined && (skillVsDeviggedMarket ?? 0) <= 0
      );

      if (!gate.isAllowed) {
        qualStatus = 'NO_RECOMMENDATION';
      } else if (sanityTripwire || !passesMultiGoalsTightness) {
        qualStatus = 'UNQUALIFIED_MARGINAL';
      } else if (isSpeculativeOnlyLeague) {
        qualStatus = 'PROBABILITY_ANALYSIS_ONLY';
      } else if (hasNonPositiveSkillVsMarket || (cand.marketOdds && (ev ?? 0) <= 0)) {
        qualStatus = 'PROBABILITY_ANALYSIS_ONLY';
      } else if (!confAssessment.isHandicapQualified) {
        qualStatus = 'NO_RECOMMENDATION';
      } else if (calProb < candThreshold) {
        qualStatus = 'UNQUALIFIED_MARGINAL';
      } else if (cand.marketOdds && (ev ?? 0) > 0) {
        qualStatus = 'QUALIFIED_VALUE';
      } else if (edgeOverBaseline > 0.010 && !isGenericPick) {
        qualStatus = 'QUALIFIED_PROBABILITY';
      }

      // Ranking score (used for ordering; actual topPick prioritizes real-odds +EV first, then unpriced edge)
      let rankingScore = 0;
      if (!gate.isAllowed || sanityTripwire || hasNonPositiveSkillVsMarket || calProb < candThreshold || !passesMultiGoalsTightness || isSpeculativeOnlyLeague) {
        rankingScore = 0;
      } else if (cand.marketOdds && (ev ?? 0) > 0) {
        // Real odds present: EV dominates ranking!
        rankingScore = Number((1000 + (ev ?? 0) * 1000 + (edge ?? 0) * 100).toFixed(3));
      } else if (!cand.marketOdds && edgeOverBaseline > 0.010 && !isGenericPick) {
        // Probability-only mode (no odds on this line)
        const uncertaintyFactor = Math.max(0.5, 1.0 - uncertaintySpread * 2.0);
        rankingScore = Number((edgeOverBaseline * 100 * confAssessment.confidenceScore * uncertaintyFactor + calProb * 10).toFixed(3));
      }

      const whyData = WhyPanelGenerator.generateWhyPanel(
        cand.optionType,
        cand.selection,
        calProb,
        uncertaintySpread,
        features,
        riskEval
      );

      const fragility = calculateFragilityScore({
        prediction: {
          id: `pred_v25_${context.fixtureId}_${cand.marketCode}`,
          fixtureId: context.fixtureId,
          marketCode: cand.marketCode,
          optionType: cand.optionType,
          marketCategory: cand.marketCategory,
          marketName: cand.marketName,
          selection: formatSelectionName(cand.selection),
          period: cand.period,
          settlementRule: cand.settlementRule,
          modelProbability: calProb,
          rankingScore: 0,
          isTopPick: false,
          settlementStatus: 'PENDING',
          evidenceTier: '',
          dataQualityScore: predCompleteness,
          isProbabilityBasedAnalysis: !cand.marketOdds,
          stateTags: context.stateTags || [],
          lineupStatus: context.lineupConfirmed ? 'confirmed' : 'pre-lineup',
          modelConfidence: 'MODERATE',
          qualificationStatus: 'UNQUALIFIED_MARGINAL',
          topFactorContributions: [],
        },
        context,
        scorerDependence: features.homeAbsences.missingXgShare,
        hasKeyAttackerAbsent: features.homeAbsences.missingXgShare > 0.15,
      });

      const candThresholdPct = (candThreshold * 100).toFixed(1);
      let multiGoalsEvidenceStr: string | undefined;
      let multiGoalsMetaWithHits = cand.multiGoalsMeta ? { ...cand.multiGoalsMeta } : undefined;
      if (isMultiGoalsCand && multiGoalsMetaWithHits) {
        const meta = multiGoalsMetaWithHits;
        const expGoals = meta.expectedTotalGoals.toFixed(1);
        const bandText = `${meta.minGoals} to ${meta.maxGoals} goals`;
        const pPct = (calProb * 100).toFixed(1);
        const hAvg = typeof context.homeAvgScored === 'number' && context.homeAvgScored > 0
          ? context.homeAvgScored.toFixed(1)
          : lambda.toFixed(1);
        const aCon = typeof context.awayAvgConceded === 'number' && context.awayAvgConceded > 0
          ? context.awayAvgConceded.toFixed(1)
          : lambda.toFixed(1);
        const hTotals = meta.scope === 'home'
          ? (context.homeRecentGoals || [])
          : meta.scope === 'away'
          ? (context.awayRecentGoals || [])
          : (context.homeRecentTotals || []);
        const aTotals = meta.scope === 'home' || meta.scope === 'away'
          ? []
          : (context.awayRecentTotals || []);
        let recentClause = '';
        if (meta.scope === 'full_match' && hTotals.length > 0 && aTotals.length > 0) {
          const hHits = hTotals.filter(g => g >= meta.minGoals && g <= meta.maxGoals).length;
          const aHits = aTotals.filter(g => g >= meta.minGoals && g <= meta.maxGoals).length;
          meta.last10Hits = hHits + aHits;
          meta.last10Total = hTotals.length + aTotals.length;
          recentClause = ` Home last ${hTotals.length} landed in ${bandText} in ${hHits} of ${hTotals.length}, away in ${aHits} of ${aTotals.length}.`;
        } else if (meta.scope === 'home' && hTotals.length > 0) {
          const hits = hTotals.filter(g => g >= meta.minGoals && g <= meta.maxGoals).length;
          meta.last10Hits = hits;
          meta.last10Total = hTotals.length;
          recentClause = ` ${displayName(context.homeTeamName)} scored ${bandText} in ${hits} of last ${hTotals.length} matches.`;
        } else if (meta.scope === 'away' && hTotals.length > 0) {
          const hits = hTotals.filter(g => g >= meta.minGoals && g <= meta.maxGoals).length;
          meta.last10Hits = hits;
          meta.last10Total = hTotals.length;
          recentClause = ` ${displayName(context.awayTeamName)} scored ${bandText} in ${hits} of last ${hTotals.length} matches.`;
        }
        const scopeLabel = meta.scope === 'home'
          ? `${displayName(context.homeTeamName)} expects ${expGoals} goals`
          : meta.scope === 'away'
          ? `${displayName(context.awayTeamName)} expects ${expGoals} goals`
          : meta.scope === 'first_half'
          ? `Model expects ${expGoals} first half goals`
          : `Model expects ${expGoals} total goals`;
        const spanLabel = `range width ${meta.span}`;
        multiGoalsEvidenceStr = `${scopeLabel}. P(${bandText}) = ${pPct}% (${spanLabel}). Home averages ${hAvg} scored, away concedes ${aCon}.${recentClause} Model line, no market price.`;
      }

      const whyLineDefault = cleanDisplayText(
        !gate.isAllowed
          ? `Rejected: ${fam} failed walk forward Brier skill gate in ${gate.leagueGroup} (BSS ${gate.bss >= 0 ? '+' : ''}${gate.bss.toFixed(4)}, 95% CI [${gate.ciLower.toFixed(4)}, ${gate.ciUpper.toFixed(4)}]).`
          : !passesMultiGoalsTightness
          ? `Rejected: range width ${mgSpan} fails tightness rule (max width 3, or width 4 above 80.0% calibrated).`
          : multiGoalsEvidenceStr
          ? multiGoalsEvidenceStr
          : calProb < candThreshold
          ? `Below ${candThresholdPct}% confidence threshold (${(calProb * 100).toFixed(1)}% calibrated).`
          : cand.marketOdds
          ? `Cleared ${candThresholdPct}% threshold (${(calProb * 100).toFixed(1)}%) with real price @${cand.marketOdds.toFixed(2)} (devigged ${((deviggedMarketProb ?? 0) * 100).toFixed(1)}%, EV ${(ev ?? 0) >= 0 ? '+' : ''}${((ev ?? 0) * 100).toFixed(1)}%).`
          : `Cleared ${candThresholdPct}% threshold (${(calProb * 100).toFixed(1)}% vs ${(baseRate * 100).toFixed(1)}% baseline, +${(edgeOverBaseline * 100).toFixed(1)}% edge); no bookmaker odds stored so no EV claimed.`
      );

      const evidence: PickEvidence = {
        fittedStrengths: {
          homeAttack: Number((context.homeAttackRating ?? 1.0).toFixed(2)),
          homeDefense: Number((context.homeDefenseRating ?? 1.0).toFixed(2)),
          awayAttack: Number((context.awayAttackRating ?? 1.0).toFixed(2)),
          awayDefense: Number((context.awayDefenseRating ?? 1.0).toFixed(2)),
          homeXg: Number(lambda.toFixed(2)),
          awayXg: Number(mu.toFixed(2)),
          ...(cap.hasCorners && context.expectedCornersHome > 0 ? {
            expectedCornersHome: Number(context.expectedCornersHome.toFixed(2)),
            expectedCornersAway: Number(context.expectedCornersAway.toFixed(2)),
          } : {}),
          ...(cap.hasCards && features.discipline.expectedTotalBookings > 0 ? {
            expectedCards: Number(features.discipline.expectedTotalBookings.toFixed(2)),
          } : {}),
        },
        expectedValue: ev,
        deviggedMarketProb: cand.marketOdds && deviggedMarketProb !== undefined ? Number(deviggedMarketProb.toFixed(4)) : null,
        sampleSizes: {
          homeMatches: homeSamples,
          awayMatches: awaySamples,
          leagueMatches: leagueSamples,
          walkForwardMatches: gate.matches,
          h2hMeetings: h2hMeetingsCount,
          ...(cap.hasCorners ? { cornersMatches: Math.min(context.homeCornerSampleCount ?? leagueCfg?.corners?.sampleSize ?? 0, context.awayCornerSampleCount ?? leagueCfg?.corners?.sampleSize ?? 0) || leagueCfg?.corners?.sampleSize } : {}),
          ...(cap.hasCards ? { cardsMatches: leagueCfg?.cards?.sampleSize } : {}),
          ...(features.discipline.refereeAnnounced ? { refereeMatches: features.discipline.refereeSampleSize } : {}),
        },
        referee: {
          announced: features.discipline.refereeAnnounced,
          name: features.discipline.refereeAnnounced ? cleanDisplayText(features.discipline.refereeName) : undefined,
          shrunkCardsPerMatch: features.discipline.refereeAnnounced ? Number(features.discipline.refereeCardsPerMatch.toFixed(2)) : undefined,
          leagueBaseline: features.discipline.refereeLeagueBaseline > 0 ? Number(features.discipline.refereeLeagueBaseline.toFixed(2)) : undefined,
          explanation: cleanDisplayText(features.discipline.refereeExplanation),
        },
        h2h: {
          meetingsCount: h2hMeetingsCount,
          shrunkGoalDiff: Number(features.h2h.shrunkGoalDiff.toFixed(3)),
          weightApplied: COVARIATE_COEFFICIENTS.h2hGoalDiff,
          summary: h2hSummaryText,
        },
        derby: {
          isDerby: features.isDerby,
          name: features.derbyName ? cleanDisplayText(features.derbyName) : undefined,
          source: features.derbySource ? cleanDisplayText(features.derbySource) : undefined,
          cardsMultiplierApplied: features.isDerby && calParams.derbySignificance.applyCardsAdjustment
            ? calParams.derbySignificance.cardsMultiplier
            : 1.0,
        },
        whyLineChosen: whyLineDefault,
        walkForwardValidation: {
          leagueGroup: gate.leagueGroup,
          market: fam,
          brierSkill: gate.bss,
          ci95Lower: gate.ciLower,
          ci95Upper: gate.ciUpper,
          matches: gate.matches,
          allowed: gate.isAllowed,
        },
      };

      const homeLabel = displayName(context.homeTeamName);
      const awayLabel = displayName(context.awayTeamName);
      const teamContextPrefix = `${homeLabel} (${homeSamples} ${homeSamples === 1 ? 'match' : 'matches'} stored) vs ${awayLabel} (${awaySamples} ${awaySamples === 1 ? 'match' : 'matches'} stored)`;
      const abstainReasonText = !gate.isAllowed
        ? `${teamContextPrefix}: ${gate.statusText}`
        : !passesMultiGoalsTightness
        ? `${teamContextPrefix}: Multi goals band width ${mgSpan} rejected by tightness filter.`
        : confAssessment.disqualificationReason
        ? `${teamContextPrefix}: ${confAssessment.disqualificationReason}`
        : calProb < candThreshold
        ? `${teamContextPrefix}: Calibrated probability ${(calProb * 100).toFixed(1)}% below ${candThresholdPct}% threshold.`
        : undefined;

      const prediction: MarketPrediction = {
        id: `pred_v25_${context.fixtureId}_${cand.marketCode}`,
        fixtureId: context.fixtureId,
        marketCode: cand.marketCode,
        optionType: cand.optionType,
        marketCategory: cand.marketCategory,
        marketFamily: fam,
        marketName: cleanDisplayText(cand.marketName),
        selection: formatSelectionName(cand.selection),
        line: cand.line,
        period: cand.period,
        settlementRule: cleanDisplayText(cand.settlementRule),
        modelProbability: calProb,
        marketOdds: cand.marketOdds,
        impliedProbability: implied,
        expectedValue: ev,
        edge,
        confidenceTier: confAssessment.confidenceTier,
        confidenceReason: confidenceReasonText,
        riskTier: confAssessment.confidenceTier,
        confidenceScore: confAssessment.confidenceScore,
        modelConfidence: confAssessment.confidenceTier === 'HIGH' ? 'HIGH' : confAssessment.confidenceTier === 'MEDIUM' ? 'MODERATE' : 'LOW',
        qualificationStatus: qualStatus,
        rankingScore,
        isTopPick: false,
        settlementStatus: 'PENDING',
        evidenceTier: isSpeculativeOnlyLeague
          ? 'Speculative (Backtest Unvalidated)'
          : confAssessment.confidenceTier === 'HIGH'
          ? 'High Confidence Projection'
          : confAssessment.confidenceTier === 'MEDIUM'
          ? 'Medium Confidence Projection'
          : 'Low Confidence Projection',
        dataQualityScore: predCompleteness,
        dataCompletenessScore: predCompleteness,
        isProbabilityBasedAnalysis: !cand.marketOdds,
        pushProbability: cand.pushProbability,
        winProb: cand.winProb,
        pushProb: cand.pushProb,
        lossProb: cand.lossProb,
        plainEnglishReason: multiGoalsEvidenceStr
          ? cleanDisplayText(multiGoalsEvidenceStr)
          : (cand.plainEnglishReason ? cleanDisplayText(cand.plainEnglishReason) : undefined),
        stateTags: context.stateTags || [],
        lineupStatus: context.lineupConfirmed ? 'confirmed' : 'pre-lineup',
        topFactorContributions: [],
        handicapType: cand.handicapType,
        handicapLine: cand.handicapLine,
        calibratedProbability: calProb,
        rawModelProbability: cand.rawProb,
        uncertaintySpread,
        ci90: [Number((calProb - uncertaintySpread * 1.645).toFixed(4)), Number((calProb + uncertaintySpread * 1.645).toFixed(4))],
        riskFlags: whyData.riskFlags.map(f => cleanDisplayText(f)),
        whyPanel: {
          factorsFor: whyData.factorsFor.map(f => cleanDisplayText(f)),
          factorsAgainst: whyData.factorsAgainst.map(f => cleanDisplayText(f)),
          riskFlags: whyData.riskFlags.map(f => cleanDisplayText(f)),
        },
        engineVersion: 'v25.0',
        abstainReason: abstainReasonText ? cleanDisplayText(abstainReasonText) : undefined,
        baselineProbability: baseRate,
        edgeOverBaseline,
        isGenericPick,
        isValidated: gate.isAllowed && !isSpeculativeOnlyLeague,
        isSpeculative: isSpeculativeOnlyLeague,
        validationStatus: gate.isAllowed && !isSpeculativeOnlyLeague ? 'validated' : 'unvalidated',
        brierSkillScore: gate.bss,
        sanityTripwire,
        tripwireReason: tripwireReason ? cleanDisplayText(tripwireReason) : undefined,
        fragilityScore: fragility.fragilityScore,
        fragilityFlags: whyData.riskFlags.concat(fragility.fragilityFlags).map(f => cleanDisplayText(f)),
        skillVsDeviggedMarket,
        deviggedMarketProb,
        equivalentCanonicalKey: getEquivalentCanonicalKey(cand.marketCode, cand.selection),
        evidence,
        multiGoalsMeta: multiGoalsMetaWithHits,
        priceSource: cand.priceSource,
      };

      processed.push(prediction);
    }

    // 6. Strict Selection:
    //    - Must pass Walk-Forward Brier Skill Gate (CI lower > 0) for this leagueGroup
    //    - Must clear >= 70% calibrated probability threshold
    //    - Must not trigger sanity tripwire or handicap contradictions
    //    - Real odds picks must have positive EV (> 0) and positive skill vs devigged market
    //    - No-odds picks must beat baseline (> 0.01) and not be generic
    //    - No wide +1.5 cushion handicaps when tighter lines exist (never allow handicapLine >= 1.5 as recommendation)
    const rawEligible = processed.filter(p => {
      if (isDisabledRecommendationMarket(p)) return false;
      if (!p.isValidated) return false;
      if (p.sanityTripwire) return false;
      if (p.qualificationStatus === 'NO_RECOMMENDATION' || p.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY' || p.qualificationStatus === 'PROBABILITY_ANALYSIS_ONLY') {
        return false;
      }
      if (p.optionType === 'asian_handicap' && (p.handicapLine ?? 0) >= 1.5) return false;

      const pickProb = p.calibratedProbability ?? p.modelProbability;
      const threshold = getConfidenceThresholdForOption(p.optionType);
      if (pickProb < threshold) return false;

      if (p.multiGoalsMeta) {
        const span = p.multiGoalsMeta.span;
        if (span >= 5) return false;
        if (span === 4 && pickProb <= 0.80) return false;
      }

      if (p.marketOdds && p.marketOdds > 1.0) {
        return (p.expectedValue ?? 0) > 0 && (p.skillVsDeviggedMarket ?? 0) > 0;
      }

      if (p.isGenericPick) return false;
      return (p.edgeOverBaseline ?? 0) > 0.010;
    });

    // 7. No Default Lines: Collapse each directional ladder to ONLY the highest/strictest line clearing hurdle
    const allLadderCandidates = new Map<string, MarketPrediction[]>();
    for (const p of processed) {
      const li = getLadderInfo(p);
      if (li) {
        if (!allLadderCandidates.has(li.ladderKey)) allLadderCandidates.set(li.ladderKey, []);
        allLadderCandidates.get(li.ladderKey)!.push(p);
      }
    }

    const ladderWinners = new Map<string, MarketPrediction>();
    const nonLadderEligible: MarketPrediction[] = [];

    const scoreMultiGoalsCandidate = (p: MarketPrediction): number => {
      const span = p.multiGoalsMeta?.span ?? 3;
      const prob = p.calibratedProbability ?? p.modelProbability;
      const edge = p.edgeOverBaseline ?? 0;
      // Strongly prefer span <= 3 over span === 4; reward tighter span === 2 at >= 60%
      if (span >= 5) return -10;
      if (span === 4) return prob > 0.80 ? (prob * 0.5 + edge) : -10;
      const tightnessBonus = span === 2 ? 0.06 : 0.0;
      return 10 + prob + tightnessBonus + edge * 0.5;
    };

    for (const p of rawEligible) {
      const li = getLadderInfo(p);
      if (!li) {
        nonLadderEligible.push(p);
        continue;
      }
      const existing = ladderWinners.get(li.ladderKey);
      if (!existing) {
        ladderWinners.set(li.ladderKey, p);
        continue;
      }
      if (li.ladderKey.startsWith('multi_goals_')) {
        if (scoreMultiGoalsCandidate(p) > scoreMultiGoalsCandidate(existing)) {
          ladderWinners.set(li.ladderKey, p);
        }
        continue;
      }
      const existLi = getLadderInfo(existing)!;
      if (li.kind === 'over') {
        // Highest line wins (e.g. Over 2.5 beats Over 1.5 and Over 0.5)
        if (li.numericValue > existLi.numericValue) {
          ladderWinners.set(li.ladderKey, p);
        }
      } else {
        // Strictest / lowest line wins for Under (Under 2.5 beats Under 3.5) and AH (-0.5 beats +0.5)
        if (li.numericValue < existLi.numericValue) {
          ladderWinners.set(li.ladderKey, p);
        }
      }
    }

    // Annotate exact whyLineChosen on winning ladder picks showing rejected stricter & omitted easier lines
    for (const [ladderKey, winner] of ladderWinners.entries()) {
      if (ladderKey.startsWith('multi_goals_')) {
        const meta = winner.multiGoalsMeta;
        const wProbPct = ((winner.calibratedProbability ?? winner.modelProbability) * 100).toFixed(1);
        const text = cleanDisplayText(
          `${winner.plainEnglishReason || `Best tight Multi goals band clearing 60.0% (${wProbPct}%, range width ${meta?.span ?? 3}).`}`
        );
        if (winner.evidence) {
          winner.evidence.whyLineChosen = text;
        }
        continue;
      }
      const wLi = getLadderInfo(winner)!;
      const siblings = allLadderCandidates.get(ladderKey) || [];
      let nextStricter: MarketPrediction | null = null;
      for (const s of siblings) {
        const sLi = getLadderInfo(s)!;
        const isStricter = wLi.kind === 'over'
          ? sLi.numericValue > wLi.numericValue
          : sLi.numericValue < wLi.numericValue;
        if (!isStricter) continue;
        if (!nextStricter) {
          nextStricter = s;
        } else {
          const nsLi = getLadderInfo(nextStricter)!;
          const isCloser = wLi.kind === 'over'
            ? sLi.numericValue < nsLi.numericValue
            : sLi.numericValue > nsLi.numericValue;
          if (isCloser) nextStricter = s;
        }
      }

      const wProbPct = ((winner.calibratedProbability ?? winner.modelProbability) * 100).toFixed(1);
      let stricterNote = ' (strictest line on ladder)';
      if (nextStricter) {
        const nsProb = nextStricter.calibratedProbability ?? nextStricter.modelProbability;
        const nsProbPct = (nsProb * 100).toFixed(1);
        if (nsProb < PICK_CONFIDENCE_THRESHOLD) {
          stricterNote = `; next stricter line ${nextStricter.selection} fell below 70.0% (${nsProbPct}%)`;
        } else {
          let rejectReason = 'did not clear qualification rules';
          if (!nextStricter.isValidated) {
            rejectReason = 'failed walk forward validation gate';
          } else if (nextStricter.sanityTripwire) {
            rejectReason = 'triggered sanity check';
          } else if (nextStricter.optionType === 'asian_handicap' && (nextStricter.handicapLine ?? 0) >= 1.5) {
            rejectReason = 'exceeded handicap cushion limit';
          } else if (nextStricter.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY') {
            rejectReason = 'exceeded uncertainty cap';
          } else if (nextStricter.marketOdds && nextStricter.marketOdds > 1.0 && (nextStricter.expectedValue ?? 0) <= 0) {
            rejectReason = `had non positive EV (${((nextStricter.expectedValue ?? 0) * 100).toFixed(1)}%)`;
          } else if (nextStricter.marketOdds && nextStricter.marketOdds > 1.0 && (nextStricter.skillVsDeviggedMarket ?? 0) <= 0) {
            rejectReason = 'trailed devigged market price';
          } else if ((nextStricter.edgeOverBaseline ?? 0) <= 0.010) {
            rejectReason = `lacked +1.0% edge over baseline (+${((nextStricter.edgeOverBaseline ?? 0) * 100).toFixed(1)}%)`;
          } else if (nextStricter.isGenericPick) {
            rejectReason = 'was excluded as a generic line';
          }
          stricterNote = `; next stricter line ${nextStricter.selection} (${nsProbPct}%) ${rejectReason}`;
        }
      }
      const oddsNote = winner.marketOdds && winner.expectedValue !== null && winner.expectedValue !== undefined
        ? ` Priced @${winner.marketOdds.toFixed(2)} vs ${((winner.deviggedMarketProb ?? 0) * 100).toFixed(1)}% devigged prob (EV +${(winner.expectedValue * 100).toFixed(1)}%).`
        : ' Probability analysis only (no odds stored).';
      const text = cleanDisplayText(
        `Highest line clearing 70.0% (${wProbPct}%)${stricterNote}.${oddsNote}`
      );
      if (winner.evidence) {
        winner.evidence.whyLineChosen = text;
      }
      winner.plainEnglishReason = winner.plainEnglishReason
        ? cleanDisplayText(`${winner.plainEnglishReason} Highest line clearing 70.0% (${wProbPct}%)${stricterNote}.`)
        : text;
    }

    // Also update whyLineChosen on non-ladder eligible picks
    for (const p of nonLadderEligible) {
      const pPct = ((p.calibratedProbability ?? p.modelProbability) * 100).toFixed(1);
      const text = p.marketOdds && p.expectedValue !== null && p.expectedValue !== undefined
        ? cleanDisplayText(`Cleared 70.0% confidence threshold (${pPct}%) with real odds @${p.marketOdds.toFixed(2)} vs ${((p.deviggedMarketProb ?? 0) * 100).toFixed(1)}% devigged market prob (EV +${(p.expectedValue * 100).toFixed(1)}%).`)
        : cleanDisplayText(`Cleared 70.0% confidence threshold (${pPct}% vs ${((p.baselineProbability ?? 0) * 100).toFixed(1)}% causal baseline, +${((p.edgeOverBaseline ?? 0) * 100).toFixed(1)}% edge); no bookmaker odds stored so no EV claimed.`);
      if (p.evidence) {
        p.evidence.whyLineChosen = text;
      }
    }

    // 8. Rank surviving picks using the unified comparator shared with alternates & slate diversity:
    // qualified real-odds +EV picks rank first by EV descending; unpriced picks rank by calibratedProbability descending.
    const eligibleTopPicks = [...ladderWinners.values(), ...nonLadderEligible].sort(compareFootballPicksByRank);

    // Zero rankingScore on non-eligible or defeated ladder rungs, then assign strictly ordered rankingScore to eligible winners
    processed.forEach(p => { p.rankingScore = 0; });
    eligibleTopPicks.forEach((p, idx) => {
      p.rankingScore = Number((2000 - idx).toFixed(3));
    });

    let topPick: MarketPrediction | null = null;
    const alternativePicks: MarketPrediction[] = [];
    let noRecommendationReason: string | undefined = undefined;

    if (eligibleTopPicks.length > 0) {
      topPick = eligibleTopPicks[0];
      topPick.isTopPick = true;
      const topProb = topPick.calibratedProbability ?? topPick.modelProbability;
      const higherProbAlt = eligibleTopPicks.slice(1).find(
        (alt) => (alt.calibratedProbability ?? alt.modelProbability) > topProb + 0.0025
      );
      if (higherProbAlt && topPick.marketOdds && (topPick.expectedValue ?? 0) > 0) {
        topPick.headlineSelectionReason = `Selected ahead of higher probability alternates because verified bookmaker odds (${topPick.marketOdds.toFixed(2)}) yield +${((topPick.expectedValue ?? 0) * 100).toFixed(1)}% expected value.`;
      }

      const fam = getMarketFamily(topPick.optionType, topPick.marketCode, topPick.marketCategory);
      marketMonitor.recordRecommendation(
        context.fixtureId,
        fam,
        topPick.marketCode,
        topPick.selection
      );

      const pickedCategories = new Set<string>([topPick.marketCategory]);
      const pickedEquivKeys = new Set<string>([getEquivalentCanonicalKey(topPick.marketCode, topPick.selection)]);

      for (let i = 1; i < eligibleTopPicks.length && alternativePicks.length < 4; i++) {
        const alt = eligibleTopPicks[i];
        const altEquivKey = getEquivalentCanonicalKey(alt.marketCode, alt.selection);
        if (!pickedCategories.has(alt.marketCategory) && !pickedEquivKeys.has(altEquivKey)) {
          alternativePicks.push(alt);
          pickedCategories.add(alt.marketCategory);
          pickedEquivKeys.add(altEquivKey);
        }
      }
    } else {
      noRecommendationReason = cleanDisplayText(`No pick selected for ${displayName(context.homeTeamName)} (${homeSamples} ${homeSamples === 1 ? 'match' : 'matches'} stored) vs ${displayName(context.awayTeamName)} (${awaySamples} ${awaySamples === 1 ? 'match' : 'matches'} stored): no evaluated market cleared the calibrated probability hurdles and walk forward Brier skill validation.`);
    }

    // Sort all processed predictions: eligible first in exact EV/edge rank, then remaining by calProb
    processed.sort((a, b) => {
      if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
      return (b.calibratedProbability ?? b.modelProbability) - (a.calibratedProbability ?? a.modelProbability);
    });

    return {
      engineVersion: 'v25.0',
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
   * Builds candidate options across EVERY enabled market & line, strictly gated by league/team column availability.
   * Real odds are assigned ONLY when stored on context.verifiedOdds (NO synthetic or fake odds).
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
    const cap = context.leagueCapabilities || getLeagueCapabilities(context.competitionCode);

    const home = displayName(context.homeTeamName);
    const away = displayName(context.awayTeamName);

    // 1. 1X2 Match Result
    list.push({
      marketCode: '1X2_HOME',
      optionType: 'win',
      marketCategory: 'match_result',
      marketName: 'Match Result',
      selection: `${home} win`,
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
      selection: `${away} win`,
      period: 'REGULAR_TIME',
      settlementRule: 'Regular time 90 mins.',
      rawProb: matrix.awayWin,
      marketOdds: odds.awayWin,
    });

    // 2. Double Chance (NO synthetic derived bookmaker odds!)
    list.push({
      marketCode: 'DC_1X',
      optionType: 'double_chance',
      marketCategory: 'double_chance',
      marketName: 'Double Chance',
      selection: `${home} or Draw`,
      period: 'REGULAR_TIME',
      settlementRule: 'Wins if home victory or draw.',
      rawProb: matrix.doubleChance.homeOrDraw,
      marketOdds: undefined,
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
      marketOdds: undefined,
    });
    list.push({
      marketCode: 'DC_12',
      optionType: 'double_chance',
      marketCategory: 'double_chance',
      marketName: 'Double Chance',
      selection: `${home} or ${away}`,
      period: 'REGULAR_TIME',
      settlementRule: 'Wins if match does not end in a draw.',
      rawProb: matrix.doubleChance.homeOrAway,
      marketOdds: undefined,
    });

    // 3. Over / Under Goals across ALL lines [0.5, 1.5, 2.5, 3.5, 4.5]
    [0.5, 1.5, 2.5, 3.5, 4.5].forEach(line => {
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

    // 3b. Team Totals Over / Under Goals (0.5, 1.5, 2.5)
    [0.5, 1.5, 2.5].forEach(line => {
      const codeSuffix = String(line).replace('.', '');
      const hTeam = matrix.teamGoalsOverUnder.home[line];
      if (hTeam) {
        list.push({
          marketCode: `TEAM_GOALS_HOME_O${codeSuffix}`,
          optionType: 'over_under_goals',
          marketCategory: 'team_goals',
          marketName: `${home} Team Total Goals`,
          selection: `${home} Over ${line} goals`,
          line,
          period: 'REGULAR_TIME',
          settlementRule: `${home} regular time goals > ${line}.`,
          rawProb: hTeam.over,
          marketOdds: undefined,
          plainEnglishReason: `${home} projected ${lambda.toFixed(2)} xG in joint Dixon Coles distribution yields ${(hTeam.over * 100).toFixed(1)}% chance of over ${line} goals.`,
        });
        list.push({
          marketCode: `TEAM_GOALS_HOME_U${codeSuffix}`,
          optionType: 'over_under_goals',
          marketCategory: 'team_goals',
          marketName: `${home} Team Total Goals`,
          selection: `${home} Under ${line} goals`,
          line,
          period: 'REGULAR_TIME',
          settlementRule: `${home} regular time goals < ${line}.`,
          rawProb: hTeam.under,
          marketOdds: undefined,
          plainEnglishReason: `${home} projected ${lambda.toFixed(2)} xG in joint Dixon Coles distribution yields ${(hTeam.under * 100).toFixed(1)}% chance of under ${line} goals.`,
        });
      }

      const aTeam = matrix.teamGoalsOverUnder.away[line];
      if (aTeam) {
        list.push({
          marketCode: `TEAM_GOALS_AWAY_O${codeSuffix}`,
          optionType: 'over_under_goals',
          marketCategory: 'team_goals',
          marketName: `${away} Team Total Goals`,
          selection: `${away} Over ${line} goals`,
          line,
          period: 'REGULAR_TIME',
          settlementRule: `${away} regular time goals > ${line}.`,
          rawProb: aTeam.over,
          marketOdds: undefined,
          plainEnglishReason: `${away} projected ${mu.toFixed(2)} xG in joint Dixon Coles distribution yields ${(aTeam.over * 100).toFixed(1)}% chance of over ${line} goals.`,
        });
        list.push({
          marketCode: `TEAM_GOALS_AWAY_U${codeSuffix}`,
          optionType: 'over_under_goals',
          marketCategory: 'team_goals',
          marketName: `${away} Team Total Goals`,
          selection: `${away} Under ${line} goals`,
          line,
          period: 'REGULAR_TIME',
          settlementRule: `${away} regular time goals < ${line}.`,
          rawProb: aTeam.under,
          marketOdds: undefined,
          plainEnglishReason: `${away} projected ${mu.toFixed(2)} xG in joint Dixon Coles distribution yields ${(aTeam.under * 100).toFixed(1)}% chance of under ${line} goals.`,
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

    // 6. Asian Handicap: Compute ALL 13 half, whole, and quarter lines [-1.5 .. +1.5]
    // Price is populated ONLY when a real bookmaker price exists for that exact line.
    const allAhLines = [-1.5, -1.25, -1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
    allAhLines.forEach(line => {
      const hOutcome = matrix.asianHandicap.home[line];
      if (hOutcome) {
        const realHomeAhPrice =
          odds.asianHandicapHome?.[String(line)] ??
          (odds.asianHandicapHome as Record<number, number> | undefined)?.[line] ??
          undefined;
        list.push({
          marketCode: `AH_HOME_${line >= 0 ? `P${line}` : `M${Math.abs(line)}`}`.replace('.', '_'),
          optionType: 'asian_handicap',
          marketCategory: 'handicap',
          marketName: `Asian Handicap ${line > 0 ? `+${line}` : line}`,
          selection: `${home} ${line > 0 ? `+${line}` : line}`,
          line,
          handicapLine: line,
          handicapType: 'asian',
          period: 'REGULAR_TIME',
          settlementRule: `Asian handicap line ${line}. Win ${(hOutcome.win * 100).toFixed(1)}%, Half win ${(hOutcome.halfWin * 100).toFixed(1)}%, Push ${(hOutcome.push * 100).toFixed(1)}%, Half loss ${(hOutcome.halfLoss * 100).toFixed(1)}%.`,
          rawProb: hOutcome.effectiveWinProb,
          pushProbability: hOutcome.push,
          winProb: hOutcome.win,
          halfWinProb: hOutcome.halfWin,
          pushProb: hOutcome.push,
          halfLossProb: hOutcome.halfLoss,
          lossProb: hOutcome.loss,
          marketOdds: realHomeAhPrice && realHomeAhPrice > 1.0 ? realHomeAhPrice : undefined,
        });
      }

      const oppLine = -line === 0 ? 0 : -line;
      const aOutcome = matrix.asianHandicap.away[oppLine];
      if (aOutcome) {
        const realAwayAhPrice =
          odds.asianHandicapAway?.[String(oppLine)] ??
          (odds.asianHandicapAway as Record<number, number> | undefined)?.[oppLine] ??
          undefined;
        list.push({
          marketCode: `AH_AWAY_${oppLine >= 0 ? `P${oppLine}` : `M${Math.abs(oppLine)}`}`.replace('.', '_'),
          optionType: 'asian_handicap',
          marketCategory: 'handicap',
          marketName: `Asian Handicap ${oppLine > 0 ? `+${oppLine}` : oppLine}`,
          selection: `${away} ${oppLine > 0 ? `+${oppLine}` : oppLine}`,
          line: oppLine,
          handicapLine: oppLine,
          handicapType: 'asian',
          period: 'REGULAR_TIME',
          settlementRule: `Asian handicap line ${oppLine}. Win ${(aOutcome.win * 100).toFixed(1)}%, Half win ${(aOutcome.halfWin * 100).toFixed(1)}%, Push ${(aOutcome.push * 100).toFixed(1)}%, Half loss ${(aOutcome.halfLoss * 100).toFixed(1)}%.`,
          rawProb: aOutcome.effectiveWinProb,
          pushProbability: aOutcome.push,
          winProb: aOutcome.win,
          halfWinProb: aOutcome.halfWin,
          pushProb: aOutcome.push,
          halfLossProb: aOutcome.halfLoss,
          lossProb: aOutcome.loss,
          marketOdds: realAwayAhPrice && realAwayAhPrice > 1.0 ? realAwayAhPrice : undefined,
        });
      }
    });

    // 7. Corners (Full Match ONLY, Negative Binomial across [7.5, 8.5, 9.5, 10.5, 11.5])
    // NEVER builds first-half corners.
    const hasCornerSample =
      (context.homeCornerSampleCount === undefined || context.homeCornerSampleCount >= 6) &&
      (context.awayCornerSampleCount === undefined || context.awayCornerSampleCount >= 6);
    const totalCornersExpected = context.expectedCornersHome + context.expectedCornersAway;

    if (cap.hasCorners && hasCornerSample && totalCornersExpected > 0) {
      const corners = DixonColesV25Engine.calculateCorners(context.expectedCornersHome, context.expectedCornersAway, features);
      [7.5, 8.5, 9.5, 10.5, 11.5].forEach(cLine => {
        const dist = corners.overUnderLines[cLine];
        const codeSuf = String(cLine).replace('.', '');
        if (dist) {
          list.push({
            marketCode: `CORNERS_O${codeSuf}`,
            optionType: 'corners',
            marketCategory: 'total_corners',
            marketName: `Total Corners Over ${cLine}`,
            selection: `Over ${cLine} corners`,
            line: cLine,
            period: 'REGULAR_TIME',
            settlementRule: `Full match corners > ${cLine}.`,
            rawProb: dist.over,
            marketOdds: cLine === 9.5 ? odds.over95Corners : undefined,
            plainEnglishReason: `Negative Binomial corner model projects ${corners.expectedCorners.toFixed(1)} total corners from team corners for and against ratings.`,
          });
          list.push({
            marketCode: `CORNERS_U${codeSuf}`,
            optionType: 'corners',
            marketCategory: 'total_corners',
            marketName: `Total Corners Under ${cLine}`,
            selection: `Under ${cLine} corners`,
            line: cLine,
            period: 'REGULAR_TIME',
            settlementRule: `Full match corners < ${cLine}.`,
            rawProb: dist.under,
            marketOdds: cLine === 9.5 ? odds.under95Corners : undefined,
            plainEnglishReason: `Negative Binomial corner model projects ${corners.expectedCorners.toFixed(1)} total corners from team corners for and against ratings.`,
          });
        }
      });
    }

    // 8. Total & Disciplinary Cards (Negative Binomial across [2.5, 3.5, 4.5, 5.5])
    if (cap.hasCards && features.discipline.expectedTotalBookings > 0) {
      const cards = DixonColesV25Engine.calculateCards(features);
      const refReason = features.discipline.refereeExplanation;
      [2.5, 3.5, 4.5, 5.5].forEach(kLine => {
        const dist = cards.overUnderLines[kLine];
        const codeSuf = String(kLine).replace('.', '');
        if (dist) {
          list.push({
            marketCode: `CARDS_O${codeSuf}`,
            optionType: 'bookings',
            marketCategory: 'bookings',
            marketName: `Total Cards Over ${kLine}`,
            selection: `Over ${kLine} cards`,
            line: kLine,
            period: 'REGULAR_TIME',
            settlementRule: `Yellow card = 1, Red card = 2. Total cards > ${kLine}.`,
            rawProb: dist.over,
            marketOdds: kLine === 4.5 ? odds.over45Cards : undefined,
            plainEnglishReason: `Negative Binomial cards model expects ${cards.expectedCards.toFixed(2)} cards. ${refReason}`,
          });
        }
      });
    }

    // 9 & 10. Half-time & Highest Scoring Half (Gated strictly on hasHalfTimeGoals)
    if (cap.hasHalfTimeGoals) {
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
        plainEnglishReason: `Separate 1st half and 2nd half goal rates project ${(matrix.highestScoringHalf.secondHalf * 100).toFixed(1)}% probability of more goals after the interval.`,
      });
      list.push({
        marketCode: 'HSH_1ST',
        optionType: 'highest_scoring_half',
        marketCategory: 'half_time',
        marketName: 'Highest Scoring Half: 1st Half',
        selection: 'Highest scoring half: 1st half',
        period: 'FULL_TIME',
        settlementRule: '1st half goals exceed 2nd half goals.',
        rawProb: matrix.highestScoringHalf.firstHalf,
        marketOdds: undefined,
        plainEnglishReason: `Separate 1st half and 2nd half goal rates project ${(matrix.highestScoringHalf.firstHalf * 100).toFixed(1)}% probability of a higher scoring first half.`,
      });
      list.push({
        marketCode: 'HSH_EQUAL',
        optionType: 'highest_scoring_half',
        marketCategory: 'half_time',
        marketName: 'Highest Scoring Half: Equal',
        selection: 'Highest scoring half: Equal',
        period: 'FULL_TIME',
        settlementRule: 'Equal goals scored in 1st and 2nd halves.',
        rawProb: matrix.highestScoringHalf.equal,
        marketOdds: undefined,
      });

      [0.5, 1.5].forEach(fhLine => {
        const fh = matrix.firstHalfGoals[fhLine];
        const codeSuf = String(fhLine).replace('.', '');
        if (fh) {
          list.push({
            marketCode: `FH_GOALS_O${codeSuf}`,
            optionType: 'first_half_goals',
            marketCategory: 'half_time',
            marketName: `1st Half Over ${fhLine} Goals`,
            selection: `1st half over ${fhLine} goals`,
            line: fhLine,
            period: 'FIRST_HALF',
            settlementRule: `Goals scored in 1st half > ${fhLine}.`,
            rawProb: fh.over,
            marketOdds: undefined,
          });
          list.push({
            marketCode: `FH_GOALS_U${codeSuf}`,
            optionType: 'first_half_goals',
            marketCategory: 'half_time',
            marketName: `1st Half Under ${fhLine} Goals`,
            selection: `1st half under ${fhLine} goals`,
            line: fhLine,
            period: 'FIRST_HALF',
            settlementRule: `Goals scored in 1st half < ${fhLine}.`,
            rawProb: fh.under,
            marketOdds: undefined,
          });
        }
      });

      list.push({
        marketCode: '2H_RESULT_HOME',
        optionType: 'second_half_result',
        marketCategory: 'half_time',
        marketName: '2nd Half Result',
        selection: `2nd half: ${home} win`,
        period: 'SECOND_HALF',
        settlementRule: `${home} scores more goals than ${away} in 2nd half.`,
        rawProb: matrix.secondHalfResult.homeWin,
        marketOdds: undefined,
      });
      list.push({
        marketCode: '2H_RESULT_DRAW',
        optionType: 'second_half_result',
        marketCategory: 'half_time',
        marketName: '2nd Half Result',
        selection: '2nd half: Draw',
        period: 'SECOND_HALF',
        settlementRule: 'Equal goals scored by both teams in 2nd half.',
        rawProb: matrix.secondHalfResult.draw,
        marketOdds: undefined,
      });
      list.push({
        marketCode: '2H_RESULT_AWAY',
        optionType: 'second_half_result',
        marketCategory: 'half_time',
        marketName: '2nd Half Result',
        selection: `2nd half: ${away} win`,
        period: 'SECOND_HALF',
        settlementRule: `${away} scores more goals than ${home} in 2nd half.`,
        rawProb: matrix.secondHalfResult.awayWin,
        marketOdds: undefined,
      });
    }

    // 11. MULTI GOALS (Full match 12 ranges, Team Home/Away 4 ranges each, optional 1st Half 2 ranges)
    if (isMultiGoalsEnabled()) {
      if (isOptionTypeEnabled('multi_goals')) {
        const fullMatchBands: [number, number][] = [
          [1, 2], [1, 3], [1, 4], [1, 5],
          [2, 3], [2, 4], [2, 5], [2, 6],
          [3, 4], [3, 5], [3, 6], [4, 6],
        ];
        for (const [minG, maxG] of fullMatchBands) {
          const bandKey = `${minG}-${maxG}`;
          const rawP = matrix.multiGoals.fullMatch[bandKey] ?? 0;
          const span = maxG - minG + 1;
          list.push({
            marketCode: `MULTI_GOALS_${minG}_${maxG}`,
            optionType: 'multi_goals',
            marketCategory: 'multi_goals',
            marketName: 'Multi goals',
            selection: `Multi goals ${minG} to ${maxG}`,
            period: 'REGULAR_TIME',
            settlementRule: `Regular time 90m total goals between ${minG} and ${maxG} inclusive excluding extra time.`,
            rawProb: rawP,
            marketOdds: undefined,
            priceSource: 'model line - no market price',
            multiGoalsMeta: {
              scope: 'full_match',
              minGoals: minG,
              maxGoals: maxG,
              span,
              band: `${minG} to ${maxG}`,
              expectedTotalGoals: Number((lambda + mu).toFixed(2)),
            },
          });
        }
      }

      if (isOptionTypeEnabled('team_multi_goals')) {
        const teamBands: [number, number][] = [[0, 1], [1, 2], [1, 3], [2, 3]];
        for (const [minG, maxG] of teamBands) {
          const bandKey = `${minG}-${maxG}`;
          const span = maxG - minG + 1;
          list.push({
            marketCode: `TEAM_MULTI_GOALS_HOME_${minG}_${maxG}`,
            optionType: 'team_multi_goals',
            marketCategory: 'multi_goals',
            marketName: `${home} multi goals`,
            selection: `${home} multi goals ${minG} to ${maxG}`,
            period: 'REGULAR_TIME',
            settlementRule: `${home} 90m regular time goals between ${minG} and ${maxG} inclusive excluding extra time.`,
            rawProb: matrix.multiGoals.home[bandKey] ?? 0,
            marketOdds: undefined,
            priceSource: 'model line - no market price',
            multiGoalsMeta: {
              scope: 'home',
              minGoals: minG,
              maxGoals: maxG,
              span,
              band: `${minG} to ${maxG}`,
              expectedTotalGoals: Number(lambda.toFixed(2)),
            },
          });
          list.push({
            marketCode: `TEAM_MULTI_GOALS_AWAY_${minG}_${maxG}`,
            optionType: 'team_multi_goals',
            marketCategory: 'multi_goals',
            marketName: `${away} multi goals`,
            selection: `${away} multi goals ${minG} to ${maxG}`,
            period: 'REGULAR_TIME',
            settlementRule: `${away} 90m regular time goals between ${minG} and ${maxG} inclusive excluding extra time.`,
            rawProb: matrix.multiGoals.away[bandKey] ?? 0,
            marketOdds: undefined,
            priceSource: 'model line - no market price',
            multiGoalsMeta: {
              scope: 'away',
              minGoals: minG,
              maxGoals: maxG,
              span,
              band: `${minG} to ${maxG}`,
              expectedTotalGoals: Number(mu.toFixed(2)),
            },
          });
        }
      }

      const hasExplicitHalfSample =
        cap.hasHalfTimeGoals &&
        (context.halfTimeSampleCount === undefined || context.halfTimeSampleCount >= 6);
      if (isOptionTypeEnabled('first_half_multi_goals') && hasExplicitHalfSample) {
        const halfBands: [number, number][] = [[0, 1], [1, 2]];
        const leagueHalvesShare = getLeagueCalibratedConfig(context.competitionCode)?.halves?.firstHalfGoalShare ?? 0.439;
        const expectedFirstHalfGoals = Number(((lambda + mu) * leagueHalvesShare).toFixed(2));
        for (const [minG, maxG] of halfBands) {
          const bandKey = `${minG}-${maxG}`;
          const span = maxG - minG + 1;
          list.push({
            marketCode: `FH_MULTI_GOALS_${minG}_${maxG}`,
            optionType: 'first_half_multi_goals',
            marketCategory: 'multi_goals',
            marketName: '1st half multi goals',
            selection: `1st half multi goals ${minG} to ${maxG}`,
            period: 'FIRST_HALF',
            settlementRule: `First half goals between ${minG} and ${maxG} inclusive.`,
            rawProb: matrix.multiGoals.firstHalf[bandKey] ?? 0,
            marketOdds: undefined,
            priceSource: 'model line - no market price',
            multiGoalsMeta: {
              scope: 'first_half',
              minGoals: minG,
              maxGoals: maxG,
              span,
              band: `${minG} to ${maxG}`,
              expectedTotalGoals: expectedFirstHalfGoals,
            },
          });
        }
      }
    }

    return list.filter(candidate => !isDisabledRecommendationMarket(candidate));
  }
}
