import {
  Fixture,
  FixtureContext,
  MarketPrediction,
  SupportedOptionType,
  WrittenMatchExplanation,
} from '@/types';
import { cleanDisplayText, displayName } from '@/lib/utils/formatText';
import { isDisabledRecommendationMarket } from '@/lib/markets';
import { resolveFootballMarketLabelAndScope } from './marketCatalog';
import {
  evaluateFixtureMarkets,
  selectDiversifiedSlatePicks,
  getMarketFamily,
  type EvaluatedFixtureResult,
  type SlatePickCandidate,
} from './marketSelection';

export interface CanonicalPickContainer {
  topPick: MarketPrediction | null;
  predictions: MarketPrediction[];
  noRecommendationReason?: string;
}

function isAbstainWrittenExplanation(expl?: WrittenMatchExplanation | null): boolean {
  if (!expl) return false;
  if (expl.activePickMarketCode) return false;
  const status = expl.reasoning?.status;
  if (status === 'abstain' || status === 'thin_history') return true;
  const summaryLower = (expl.oneLineSummary || expl.fullSummary || '').toLowerCase();
  if (
    summaryLower.startsWith('no qualified pick') ||
    summaryLower.startsWith('not enough history')
  ) {
    return true;
  }
  return false;
}

function inferOptionTypeFromMarketCode(code: string): SupportedOptionType {
  if (code.startsWith('TEAM_CARDS_')) return 'team_bookings';
  if (code.startsWith('BOOKING_POINTS_')) return 'booking_points';
  if (code.startsWith('CARDS_') || code.includes('BOOKING')) return 'bookings';
  if (code.startsWith('CORNER_HANDICAP_')) return 'corner_handicap';
  if (code.includes('CORNER')) return 'corners';
  if (code.startsWith('FH_MULTI_GOALS_')) return 'first_half_multi_goals';
  if (code.startsWith('TEAM_MULTI_GOALS_')) return 'team_multi_goals';
  if (code.startsWith('MULTI_GOALS_')) return 'multi_goals';
  if (code.startsWith('GOAL_RUN_')) return 'goal_runs';
  if (code.startsWith('FH_GOALS_')) return 'first_half_goals';
  if (code.startsWith('2H_')) return 'second_half_result';
  if (code.startsWith('HSH_')) return 'highest_scoring_half';
  if (code.startsWith('BTTS_')) return 'both_teams_to_score';
  if (code.startsWith('DC_')) return 'double_chance';
  if (code.startsWith('DNB_')) return 'draw_no_bet';
  if (code.startsWith('AH_')) return 'asian_handicap';
  if (code.startsWith('1X2_DRAW')) return 'draw';
  if (code.startsWith('1X2_')) return 'win';
  return 'over_under_goals';
}

function buildFallbackPredictionFromExplanation(
  fixtureId: string,
  expl: WrittenMatchExplanation
): MarketPrediction | null {
  if (!expl.activePickMarketCode || !expl.activePickSelection) return null;
  const prob =
    typeof expl.activePickProbability === 'number' && Number.isFinite(expl.activePickProbability)
      ? expl.activePickProbability
      : typeof expl.calibratedProbability === 'number' && Number.isFinite(expl.calibratedProbability)
      ? expl.calibratedProbability
      : null;
  if (prob === null) return null;

  const code = expl.activePickMarketCode;
  const optionType = inferOptionTypeFromMarketCode(code);
  const storedTop = expl.reasoning?.topPick;
  const marketCategory = storedTop?.marketCategory || 'total_goals';
  const tier = expl.activePickTier || expl.confidenceTier || 'MEDIUM';

  return {
    id: `${fixtureId}_${code}`,
    fixtureId,
    marketCode: code,
    optionType,
    marketCategory,
    marketFamily: getMarketFamily(optionType, code, marketCategory),
    marketScope: expl.activePickMarketScope
      ? cleanDisplayText(expl.activePickMarketScope)
      : storedTop?.marketScope
      ? cleanDisplayText(storedTop.marketScope)
      : undefined,
    marketName: storedTop?.marketName
      ? cleanDisplayText(storedTop.marketName)
      : cleanDisplayText(expl.activePickMarketScope || code),
    selection: cleanDisplayText(expl.activePickSelection),
    line: typeof storedTop?.line === 'number' ? storedTop.line : undefined,
    period: storedTop?.period || 'REGULAR_TIME',
    settlementRule: cleanDisplayText(expl.activePickSelection),
    modelProbability: Number(prob.toFixed(4)),
    rawModelProbability:
      typeof expl.rawProbability === 'number' && Number.isFinite(expl.rawProbability)
        ? Number(expl.rawProbability.toFixed(4))
        : Number(prob.toFixed(4)),
    calibratedProbability: Number(prob.toFixed(4)),
    baselineProbability: Number(prob.toFixed(4)),
    edgeOverBaseline: 0,
    isValidated: true,
    validationStatus: 'validated',
    riskTier: tier === 'HIGH' ? 'SAFE' : tier === 'MEDIUM' ? 'MODERATE' : 'RISKY',
    confidenceTier: tier,
    confidenceScore: Math.round(prob * 100),
    plainEnglishReason: cleanDisplayText(expl.oneLineSummary),
    isTopPick: true,
    headlineSelectionReason: expl.headlineSelectionReason
      ? cleanDisplayText(expl.headlineSelectionReason)
      : undefined,
    modelConfidence: tier === 'HIGH' ? 'HIGH' : tier === 'MEDIUM' ? 'MODERATE' : 'LOW',
    qualificationStatus: 'QUALIFIED_PROBABILITY',
    rankingScore: Number((prob * 100).toFixed(2)),
    settlementStatus: 'PENDING',
    evidenceTier: tier === 'HIGH' ? 'Tier 2: High Probability' : 'Tier 3: Qualified Probability',
    dataQualityScore: 0.85,
    isProbabilityBasedAnalysis: true,
    stateTags: [],
    lineupStatus: 'pre-lineup',
    topFactorContributions: [],
    writtenExplanation: expl,
  };
}

/**
 * Single Source of Truth reconciler: aligns any fixture evaluation (`topPick` + `predictions`)
 * strictly to the stored/canonical `writtenExplanation.activePickMarketCode` (or abstention state).
 * Every UI surface, API route, slip builder, and detail page calls this instead of re-running
 * subset-dependent diversity swaps.
 */
export function applyCanonicalTopPick<T extends CanonicalPickContainer>(
  evaluation: T,
  writtenExplanation?: WrittenMatchExplanation | null,
  fixtureMeta?: Pick<Fixture, 'id' | 'homeTeam' | 'awayTeam'>
): T {
  const cleanPredictions = (evaluation.predictions || []).filter(
    (p) => !isDisabledRecommendationMarket(p)
  );

  if (writtenExplanation && isAbstainWrittenExplanation(writtenExplanation)) {
    const abstainReason =
      writtenExplanation.reasoning?.reason ||
      evaluation.noRecommendationReason ||
      'No qualified pick';
    return {
      ...evaluation,
      topPick: null,
      predictions: cleanPredictions.map((p) => ({ ...p, isTopPick: false })),
      noRecommendationReason: cleanDisplayText(String(abstainReason)),
    };
  }

  const targetCode = writtenExplanation?.activePickMarketCode;
  if (targetCode) {
    let matched = cleanPredictions.find((p) => p.marketCode === targetCode) || null;
    let nextPredictions = cleanPredictions;

    if (!matched && fixtureMeta) {
      const synthetic = buildFallbackPredictionFromExplanation(fixtureMeta.id, writtenExplanation);
      if (synthetic) {
        matched = synthetic;
        nextPredictions = [synthetic, ...cleanPredictions];
      }
    }

    if (matched && !isDisabledRecommendationMarket(matched)) {
      const home = fixtureMeta ? cleanDisplayText(displayName(fixtureMeta.homeTeam)) : undefined;
      const away = fixtureMeta ? cleanDisplayText(displayName(fixtureMeta.awayTeam)) : undefined;
      const scoped =
        home && away
          ? resolveFootballMarketLabelAndScope({
              marketCode: matched.marketCode,
              optionType: matched.optionType,
              marketCategory: matched.marketCategory,
              rawMarketName: matched.marketName,
              rawSelection: matched.selection,
              homeTeam: home,
              awayTeam: away,
              line: matched.line,
              period: matched.period,
              side: matched.side,
              multiGoalsMeta: matched.multiGoalsMeta,
            })
          : null;

      const canonicalProb =
        typeof writtenExplanation?.activePickProbability === 'number' &&
        Number.isFinite(writtenExplanation.activePickProbability) &&
        writtenExplanation.activePickProbability > 0
          ? Number(writtenExplanation.activePickProbability.toFixed(4))
          : matched.calibratedProbability ?? matched.modelProbability;

      const canonicalTop: MarketPrediction = {
        ...matched,
        marketScope: writtenExplanation?.activePickMarketScope
          ? cleanDisplayText(writtenExplanation.activePickMarketScope)
          : matched.marketScope || scoped?.marketScope,
        selection: writtenExplanation?.activePickSelection
          ? cleanDisplayText(writtenExplanation.activePickSelection)
          : scoped?.selection || matched.selection,
        calibratedProbability: canonicalProb,
        confidenceTier:
          writtenExplanation?.activePickTier || matched.confidenceTier,
        headlineSelectionReason:
          writtenExplanation?.headlineSelectionReason || matched.headlineSelectionReason,
        isTopPick: true,
        writtenExplanation: writtenExplanation || matched.writtenExplanation,
      };

      return {
        ...evaluation,
        topPick: canonicalTop,
        predictions: nextPredictions.map((p) =>
          p.marketCode === targetCode ? canonicalTop : { ...p, isTopPick: false }
        ),
        noRecommendationReason: undefined,
      };
    }
  }

  // Fallback when no canonical writtenExplanation is attached yet
  const fallbackTop =
    evaluation.topPick && !isDisabledRecommendationMarket(evaluation.topPick)
      ? evaluation.topPick
      : null;

  return {
    ...evaluation,
    topPick: fallbackTop ? { ...fallbackTop, isTopPick: true } : null,
    predictions: cleanPredictions.map((p) => ({
      ...p,
      isTopPick: fallbackTop ? p.marketCode === fallbackTop.marketCode : false,
    })),
  };
}

export interface CanonicalSlateInputItem {
  fixture: Fixture;
  context: FixtureContext;
  lockedWrittenExplanation?: WrittenMatchExplanation | null;
}

export interface CanonicalSlateOutputItem extends SlatePickCandidate {
  fixture: Fixture;
  context: FixtureContext;
  evaluation: EvaluatedFixtureResult;
}

/**
 * Evaluates a full football slate in deterministic kickoff/id order, runs the 40%
 * slate diversity cap ONCE over the upcoming/active subset, and honors any
 * already-locked pre-kickoff or immutable post-kickoff explanations.
 */
export function evaluateCanonicalFootballSlate(
  items: CanonicalSlateInputItem[],
  maxFamilyShare: number = 0.40
): CanonicalSlateOutputItem[] {
  const indexed = items.map((item, idx) => ({
    idx,
    fixture: item.fixture,
    context: item.context,
    lockedWrittenExplanation: item.lockedWrittenExplanation,
    evaluation: evaluateFixtureMarkets(item.context),
  }));

  // Deterministic ordering before slate-level diversity evaluation
  const sortedActive = indexed
    .filter((entry) => {
      const st = String(entry.fixture.status || '').toUpperCase();
      return st !== 'FINISHED' && st !== 'POSTPONED' && st !== 'CANCELED';
    })
    .sort((a, b) => {
      const ta = Date.parse(a.fixture.kickoffTime || '');
      const tb = Date.parse(b.fixture.kickoffTime || '');
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      return a.fixture.id.localeCompare(b.fixture.id);
    });

  // For upcoming fixtures that already have a locked stored explanation, preserve their
  // canonical pick inside the slate calculation so diversity counts reflect reality.
  const preLockedActive = sortedActive.map((entry) => {
    const reconciled = entry.lockedWrittenExplanation
      ? applyCanonicalTopPick(entry.evaluation, entry.lockedWrittenExplanation, entry.fixture)
      : entry.evaluation;
    return {
      fixtureId: entry.fixture.id,
      topPick: reconciled.topPick,
      predictions: reconciled.predictions,
      noRecommendationReason: reconciled.noRecommendationReason,
      locked: Boolean(entry.lockedWrittenExplanation),
      entry,
    };
  });

  const diversified = selectDiversifiedSlatePicks(preLockedActive, maxFamilyShare);
  const diversifiedById = new Map<string, (typeof diversified)[number]>();
  for (const d of diversified) {
    diversifiedById.set(d.fixtureId, d);
  }

  return indexed.map((entry) => {
    const div = diversifiedById.get(entry.fixture.id);
    let finalEval: EvaluatedFixtureResult = div
      ? {
          ...entry.evaluation,
          topPick: div.topPick,
          predictions: div.predictions,
          noRecommendationReason: div.noRecommendationReason,
        }
      : entry.evaluation;

    if (entry.lockedWrittenExplanation) {
      finalEval = applyCanonicalTopPick(finalEval, entry.lockedWrittenExplanation, entry.fixture);
    } else {
      finalEval = applyCanonicalTopPick(finalEval, null, entry.fixture);
    }

    return {
      fixtureId: entry.fixture.id,
      fixture: entry.fixture,
      context: entry.context,
      topPick: finalEval.topPick,
      predictions: finalEval.predictions,
      noRecommendationReason: finalEval.noRecommendationReason,
      evaluation: finalEval,
    };
  });
}
