// CALIBRALL: Deterministic Template-Based Written Match Explanations
// Builds 2 to 4 sentence explanations strictly from ONE active pick object and real model data.
// Zero LLM calls, zero invented facts, zero hyphens/underscores in user-facing output.
// Enforces market-specific evidence boundaries (MARKET_EVIDENCE_FIELDS) and runtime validation.

import {
  ConfidenceTier,
  ExplanationDriverTile,
  Fixture,
  FixtureContext,
  MarketPrediction,
  WrittenMatchAlternate,
  WrittenMatchExplanation,
} from '@/types';
import { cleanDisplayText, displayName } from '@/lib/utils/formatText';
import { getEquivalentCanonicalKey } from './marketMonitor';
import {
  compareFootballPicksByRank,
  getMarketEvidenceFamily,
  isEvidenceFieldAllowed,
  validateExplanationConsistency,
  type MarketEvidenceFamily,
} from './explanationValidator';
import type { BasketballGameEvaluation, BasketballPickCandidate } from '@/lib/basketball/picker';

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function plural(n: number, singular: string, pluralWord: string): string {
  return `${n} ${n === 1 ? singular : pluralWord}`;
}

function tierToDisplayLabel(tier?: string | null): string {
  const upper = String(tier || '').toUpperCase();
  if (upper === 'HIGH' || upper === 'SAFE') return 'High';
  if (upper === 'MEDIUM' || upper === 'MODERATE') return 'Medium';
  return 'Low';
}

function pct(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`;
}

function splitFirstSentence(fullSummary: string): string {
  const cleaned = cleanDisplayText(fullSummary).trim();
  if (!cleaned) return '';
  const match = cleaned.match(/^(.+?[.!?])(?:\s+|$)/);
  return match ? match[1].trim() : cleaned;
}

function getEffectiveFootballProb(p: MarketPrediction): number {
  return isFiniteNum(p.calibratedProbability) ? p.calibratedProbability : p.modelProbability;
}

function deriveFootballHeadlineReason(
  topPick: MarketPrediction | null,
  predictions: MarketPrediction[],
  explicitReason?: string
): string | undefined {
  const raw = explicitReason || topPick?.headlineSelectionReason;
  if (raw && raw.trim().length > 0) return cleanDisplayText(raw.trim());
  if (!topPick) return undefined;

  const topProb = getEffectiveFootballProb(topPick);
  const hasPricedEv = Boolean(
    isFiniteNum(topPick.marketOdds) &&
      topPick.marketOdds > 1.0 &&
      isFiniteNum(topPick.expectedValue) &&
      topPick.expectedValue > 0
  );

  if (hasPricedEv) {
    const higherProbAlt = predictions.find(
      (p) =>
        p.marketCode !== topPick.marketCode &&
        isFiniteNum(getEffectiveFootballProb(p)) &&
        getEffectiveFootballProb(p) > topProb + 0.0025
    );
    if (higherProbAlt) {
      const evPct = ((topPick.expectedValue ?? 0) * 100).toFixed(1);
      return cleanDisplayText(
        `Selected ahead of higher probability alternates because verified market odds (${topPick.marketOdds!.toFixed(
          2
        )}) generate +${evPct}% expected value.`
      );
    }
  }
  return undefined;
}

export function selectTopFootballAlternates(
  predictions: MarketPrediction[],
  topPick: MarketPrediction | null,
  options?: { headlineSelectionReason?: string }
): WrittenMatchAlternate[] {
  const seenCodes = new Set<string>();
  const seenSelections = new Set<string>();
  const seenCanonicalKeys = new Set<string>();

  if (topPick) {
    seenCodes.add(topPick.marketCode);
    seenSelections.add(cleanDisplayText(topPick.selection).toLowerCase());
    seenCanonicalKeys.add(getEquivalentCanonicalKey(topPick.marketCode, topPick.selection));
  }

  const topProb = topPick ? getEffectiveFootballProb(topPick) : null;
  const hasSelectionReason = Boolean(
    options?.headlineSelectionReason || topPick?.headlineSelectionReason
  );

  const sorted = [...predictions].sort(compareFootballPicksByRank);

  const out: WrittenMatchAlternate[] = [];
  for (const p of sorted) {
    if (out.length >= 2) break;
    if (seenCodes.has(p.marketCode)) continue;

    const selClean = cleanDisplayText(p.selection);
    const selLower = selClean.toLowerCase();
    if (seenSelections.has(selLower)) continue;

    const canonKey = getEquivalentCanonicalKey(p.marketCode, selClean);
    if (canonKey && canonKey !== 'UNKNOWN' && seenCanonicalKeys.has(canonKey)) continue;

    const effProb = getEffectiveFootballProb(p);
    if (!isFiniteNum(effProb) || effProb <= 0) continue;

    // Never show an alternate that outranks headline probability unless an explicit selection reason is stated
    if (!hasSelectionReason && topProb !== null && effProb - topProb > 0.0025) {
      continue;
    }

    seenCodes.add(p.marketCode);
    seenSelections.add(selLower);
    if (canonKey && canonKey !== 'UNKNOWN') seenCanonicalKeys.add(canonKey);

    out.push({
      marketCode: p.marketCode,
      marketName: cleanDisplayText(p.marketName),
      selection: selClean,
      probability: Number(effProb.toFixed(4)),
      confidenceTier: p.confidenceTier,
    });
  }
  return out;
}

function buildFootballDriverTiles(params: {
  family: MarketEvidenceFamily;
  topPick: MarketPrediction | null;
  home: string;
  away: string;
  homeSamples: number | null;
  awaySamples: number | null;
  context?: FixtureContext;
  expCornersHome: number | null;
  expCornersAway: number | null;
  expCards: number | null;
  homeXg: number | null;
  awayXg: number | null;
  totalXg: number | null;
  rawHomeAvgScored: number | null;
  rawAwayAvgScored: number | null;
  h2hMeetingsCount: number;
  h2hAvgTotalGoals: number | null;
  h2hCardsMeetingsCount: number;
  h2hAvgTotalCards: number | null;
  h2hCornersMeetingsCount: number;
  h2hAvgTotalCorners: number | null;
  leagueCardsBaseline: number | null;
}): ExplanationDriverTile[] {
  const {
    family,
    topPick,
    homeSamples,
    awaySamples,
    context,
    expCornersHome,
    expCornersAway,
    expCards,
    homeXg,
    awayXg,
    totalXg,
    rawHomeAvgScored,
    rawAwayAvgScored,
    h2hMeetingsCount,
    h2hAvgTotalGoals,
    h2hCardsMeetingsCount,
    h2hAvgTotalCards,
    h2hCornersMeetingsCount,
    h2hAvgTotalCorners,
    leagueCardsBaseline,
  } = params;

  const tiles: ExplanationDriverTile[] = [];
  const sampleLabel =
    homeSamples !== null && awaySamples !== null
      ? `${homeSamples}H / ${awaySamples}A matches`
      : null;

  if (family === 'cards') {
    if (expCards !== null) {
      tiles.push({ label: 'Projected cards', value: `${expCards.toFixed(1)} total` });
    }
    if (context?.refereeAnnounced && context.referee && isFiniteNum(context.refereeShrunkRate)) {
      tiles.push({
        label: `Ref (${cleanDisplayText(context.referee)})`,
        value: `${context.refereeShrunkRate.toFixed(2)} cards/match`,
      });
    } else if (leagueCardsBaseline !== null) {
      tiles.push({
        label: 'Referee',
        value: `Unannounced (${leagueCardsBaseline.toFixed(2)} avg)`,
      });
    } else {
      tiles.push({ label: 'Referee', value: 'Unannounced' });
    }

    if (isFiniteNum(context?.homeAvgCardsFor) && isFiniteNum(context?.awayAvgCardsFor)) {
      const winSuffix =
        isFiniteNum(context?.homeCardsWindow) && context.homeCardsWindow > 0
          ? ` (${context.homeCardsWindow}m)`
          : '';
      tiles.push({
        label: `Team cards${winSuffix}`,
        value: `${context.homeAvgCardsFor.toFixed(2)} vs ${context.awayAvgCardsFor.toFixed(2)}`,
      });
    }

    if (h2hCardsMeetingsCount >= 3 && h2hAvgTotalCards !== null) {
      tiles.push({
        label: `H2H cards (${h2hCardsMeetingsCount})`,
        value: `${h2hAvgTotalCards.toFixed(2)} / match`,
      });
    } else if (context?.isDerby) {
      tiles.push({ label: 'Rivalry factor', value: 'Derby intensity active' });
    }

    if (sampleLabel) {
      tiles.push({ label: 'Sample depth', value: sampleLabel });
    }
    return tiles.slice(0, 4);
  }

  if (family === 'corners') {
    if (expCornersHome !== null && expCornersAway !== null) {
      tiles.push({
        label: 'Projected corners',
        value: `${(expCornersHome + expCornersAway).toFixed(1)} total`,
      });
    }
    if (isFiniteNum(context?.homeAvgCornersFor) && isFiniteNum(context?.awayAvgCornersFor)) {
      tiles.push({
        label: 'Corners won avg',
        value: `${context.homeAvgCornersFor.toFixed(1)} vs ${context.awayAvgCornersFor.toFixed(1)}`,
      });
    }
    if (h2hCornersMeetingsCount >= 3 && h2hAvgTotalCorners !== null) {
      tiles.push({
        label: `H2H corners (${h2hCornersMeetingsCount})`,
        value: `${h2hAvgTotalCorners.toFixed(2)} / match`,
      });
    } else if (expCornersHome !== null && expCornersAway !== null) {
      tiles.push({
        label: 'Corner split',
        value: `${expCornersHome.toFixed(1)}H / ${expCornersAway.toFixed(1)}A`,
      });
    }
    if (sampleLabel) {
      tiles.push({ label: 'Sample depth', value: sampleLabel });
    }
    return tiles.slice(0, 4);
  }

  // Goals, multi_goals, btts, handicap, result, half_time
  if (homeXg !== null && awayXg !== null && totalXg !== null) {
    tiles.push({
      label: 'Expected goals',
      value: `${homeXg.toFixed(2)} + ${awayXg.toFixed(2)} (${totalXg.toFixed(2)})`,
    });
  }

  if (
    family === 'multi_goals' &&
    topPick?.multiGoalsMeta &&
    isFiniteNum(topPick.multiGoalsMeta.last10Hits) &&
    isFiniteNum(topPick.multiGoalsMeta.last10Total) &&
    topPick.multiGoalsMeta.last10Total > 0
  ) {
    tiles.push({
      label: `Band ${cleanDisplayText(topPick.multiGoalsMeta.band)} hits`,
      value: `${topPick.multiGoalsMeta.last10Hits} of ${topPick.multiGoalsMeta.last10Total} matches`,
    });
  } else if (rawHomeAvgScored !== null && rawAwayAvgScored !== null) {
    tiles.push({
      label: 'Scoring avg',
      value: `${rawHomeAvgScored.toFixed(1)} vs ${rawAwayAvgScored.toFixed(1)} / match`,
    });
  }

  if (h2hMeetingsCount >= 3 && h2hAvgTotalGoals !== null) {
    tiles.push({
      label: `H2H goals (${h2hMeetingsCount})`,
      value: `${h2hAvgTotalGoals.toFixed(2)} / match`,
    });
  }

  if (sampleLabel) {
    tiles.push({ label: 'Sample depth', value: sampleLabel });
  }
  return tiles.slice(0, 4);
}

export function generateFootballExplanation(params: {
  fixture: Fixture;
  evaluation: {
    topPick: MarketPrediction | null;
    predictions: MarketPrediction[];
    noRecommendationReason?: string;
  };
  context?: FixtureContext;
  headlineSelectionReason?: string;
}): WrittenMatchExplanation {
  const { fixture, evaluation, context } = params;
  const home = cleanDisplayText(displayName(fixture.homeTeam) || fixture.homeTeam.name);
  const away = cleanDisplayText(displayName(fixture.awayTeam) || fixture.awayTeam.name);

  const rawHomeSamples =
    context?.homeSampleMatches ??
    fixture.homeTeam?.storedMatchCount ??
    fixture.serverStats?.homeSampleMatches ??
    context?.sampleSizeMatches;
  const rawAwaySamples =
    context?.awaySampleMatches ??
    fixture.awayTeam?.storedMatchCount ??
    fixture.serverStats?.awaySampleMatches ??
    context?.sampleSizeMatches;

  const homeSamples = isFiniteNum(rawHomeSamples) ? rawHomeSamples : null;
  const awaySamples = isFiniteNum(rawAwaySamples) ? rawAwaySamples : null;

  const isThinHistory =
    Boolean(fixture.insufficientData) ||
    Boolean(context?.insufficientData) ||
    (homeSamples !== null && homeSamples < 10) ||
    (awaySamples !== null && awaySamples < 10);

  if (isThinHistory) {
    const sampleClause =
      homeSamples !== null && awaySamples !== null
        ? `: ${home} has ${plural(homeSamples, 'stored match', 'stored matches')} and ${away} has ${plural(
            awaySamples,
            'stored match',
            'stored matches'
          )}`
        : '';
    const s1 = cleanDisplayText(
      `Not enough history to recommend a market for ${home} vs ${away}${sampleClause}.`
    );
    const s2 = cleanDisplayText(
      evaluation.noRecommendationReason ||
        context?.noRecommendationReason ||
        'At least 10 recent verified matches per club are required before publishing a calibrated recommendation or probability range.'
    );
    const fullSummary = `${s1} ${s2}`;
    const thinTiles: ExplanationDriverTile[] = [];
    if (homeSamples !== null && awaySamples !== null) {
      thinTiles.push({
        label: 'Sample depth',
        value: `${homeSamples}H / ${awaySamples}A (min 10 required)`,
      });
    }
    return {
      oneLineSummary: s1,
      fullSummary,
      driverTiles: thinTiles,
      validationPassed: true,
      fallbackApplied: false,
      reasoning: {
        sport: 'football',
        status: 'thin_history',
        homeTeam: home,
        awayTeam: away,
        homeSampleMatches: homeSamples,
        awaySampleMatches: awaySamples,
        minRequiredMatches: 10,
        reason: cleanDisplayText(
          evaluation.noRecommendationReason || context?.noRecommendationReason || 'Insufficient match history'
        ),
      },
      alternates: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const topPick = evaluation.topPick;
  const family: MarketEvidenceFamily = getMarketEvidenceFamily(topPick, 'football');
  const allow = (field: Parameters<typeof isEvidenceFieldAllowed>[1]) =>
    isEvidenceFieldAllowed(family, field);

  const headlineReason = deriveFootballHeadlineReason(
    topPick,
    evaluation.predictions || [],
    params.headlineSelectionReason
  );
  const alternates = selectTopFootballAlternates(evaluation.predictions || [], topPick, {
    headlineSelectionReason: headlineReason,
  });

  const rawProb = topPick
    ? isFiniteNum(topPick.rawModelProbability)
      ? topPick.rawModelProbability
      : topPick.modelProbability
    : undefined;
  const calProb = topPick ? getEffectiveFootballProb(topPick) : undefined;
  const probsDiffer =
    isFiniteNum(rawProb) && isFiniteNum(calProb) && Math.abs(rawProb - calProb) >= 0.001;

  let derivedConfidenceReason = topPick?.confidenceReason
    ? cleanDisplayText(topPick.confidenceReason)
    : undefined;
  if (!derivedConfidenceReason && topPick?.confidenceTier === 'LOW') {
    if (homeSamples !== null && homeSamples < 10) {
      derivedConfidenceReason = cleanDisplayText(`only ${plural(homeSamples, 'recent match', 'recent matches')} for ${home}`);
    } else if (awaySamples !== null && awaySamples < 10) {
      derivedConfidenceReason = cleanDisplayText(`only ${plural(awaySamples, 'recent match', 'recent matches')} for ${away}`);
    } else if (isFiniteNum(topPick.uncertaintySpread) && topPick.uncertaintySpread > 0.075) {
      derivedConfidenceReason = cleanDisplayText(
        `uncertainty spread ±${(topPick.uncertaintySpread * 100).toFixed(1)}%`
      );
    } else if (isFiniteNum(topPick.dataCompletenessScore) && topPick.dataCompletenessScore < 0.65) {
      derivedConfidenceReason = cleanDisplayText(
        `data coverage ${Math.round(topPick.dataCompletenessScore * 100)}%`
      );
    } else if (Array.isArray(topPick.riskFlags) && topPick.riskFlags.length > 0) {
      derivedConfidenceReason = cleanDisplayText(topPick.riskFlags[0]);
    }
  }

  let sentence1 = '';
  const cleanTopSel = topPick ? cleanDisplayText(topPick.selection) : '';
  if (topPick && isFiniteNum(calProb)) {
    const tierLabel = tierToDisplayLabel(topPick.confidenceTier);
    const tierClause =
      topPick.confidenceTier === 'LOW' && derivedConfidenceReason
        ? `${tierLabel} confidence: ${derivedConfidenceReason}`
        : `${tierLabel} confidence`;
    const calibrationClause =
      probsDiffer && isFiniteNum(rawProb)
        ? `; raw model ${pct(rawProb)} vs calibrated ${pct(calProb)}`
        : '';
    sentence1 = cleanDisplayText(
      `Model recommends ${cleanTopSel} at ${pct(calProb)} (${tierClause})${calibrationClause}.`
    );
  } else {
    sentence1 = cleanDisplayText(
      `No qualified pick for ${home} vs ${away} because evaluated lines stayed below probability and edge thresholds.`
    );
  }

  // Raw model metrics extracted carefully by market family
  const rawHomeXg = context?.homeXg ?? fixture.serverStats?.homeXg;
  const rawAwayXg = context?.awayXg ?? fixture.serverStats?.awayXg;
  const hasXg = isFiniteNum(rawHomeXg) && isFiniteNum(rawAwayXg);
  const homeXg = hasXg ? rawHomeXg : null;
  const awayXg = hasXg ? rawAwayXg : null;
  const totalXg = homeXg !== null && awayXg !== null ? Number((homeXg + awayXg).toFixed(2)) : null;

  const rawHomeAvgScored = isFiniteNum(context?.homeAvgScored ?? fixture.serverStats?.homeAvgScored)
    ? (context?.homeAvgScored ?? fixture.serverStats?.homeAvgScored)!
    : null;
  const rawHomeAvgConceded = isFiniteNum(context?.homeAvgConceded ?? fixture.serverStats?.homeAvgConceded)
    ? (context?.homeAvgConceded ?? fixture.serverStats?.homeAvgConceded)!
    : null;
  const rawAwayAvgScored = isFiniteNum(context?.awayAvgScored ?? fixture.serverStats?.awayAvgScored)
    ? (context?.awayAvgScored ?? fixture.serverStats?.awayAvgScored)!
    : null;
  const rawAwayAvgConceded = isFiniteNum(context?.awayAvgConceded ?? fixture.serverStats?.awayAvgConceded)
    ? (context?.awayAvgConceded ?? fixture.serverStats?.awayAvgConceded)!
    : null;
  const hasTeamAverages =
    rawHomeAvgScored !== null &&
    rawHomeAvgConceded !== null &&
    rawAwayAvgScored !== null &&
    rawAwayAvgConceded !== null;

  const h2hMeetingsCount = isFiniteNum(context?.h2hMeetingsCount ?? fixture.serverStats?.h2hMeetingsCount)
    ? (context?.h2hMeetingsCount ?? fixture.serverStats?.h2hMeetingsCount)!
    : 0;
  const h2hAvgTotalGoals = isFiniteNum(context?.h2hAvgTotalGoals ?? fixture.serverStats?.h2hAvgTotalGoals)
    ? (context?.h2hAvgTotalGoals ?? fixture.serverStats?.h2hAvgTotalGoals)!
    : null;

  const h2hCardsMeetingsCount = isFiniteNum(context?.h2hCardsMeetingsCount)
    ? context.h2hCardsMeetingsCount
    : 0;
  const h2hAvgTotalCards = isFiniteNum(context?.h2hAvgTotalCards)
    ? context.h2hAvgTotalCards
    : null;

  const h2hCornersMeetingsCount = isFiniteNum(context?.h2hCornersMeetingsCount)
    ? context.h2hCornersMeetingsCount
    : 0;
  const h2hAvgTotalCorners = isFiniteNum(context?.h2hAvgTotalCorners)
    ? context.h2hAvgTotalCorners
    : null;

  const expCornersHome = isFiniteNum(context?.expectedCornersHome) ? context.expectedCornersHome : null;
  const expCornersAway = isFiniteNum(context?.expectedCornersAway) ? context.expectedCornersAway : null;
  const expCards = isFiniteNum(context?.expectedCards) ? context.expectedCards : null;

  const leagueCardsBaseline = isFiniteNum(context?.refereeLeagueBaseline)
    ? context.refereeLeagueBaseline
    : isFiniteNum(fixture.competition?.avgCardsPerGame) && fixture.competition.avgCardsPerGame > 0
    ? fixture.competition.avgCardsPerGame
    : null;

  // Sentence 2: STRICTLY market-aware drivers using real unweighted per-match averages
  let sentence2Body = '';

  if (family === 'corners' && expCornersHome !== null && expCornersAway !== null) {
    const totalCornersProj = expCornersHome + expCornersAway;
    const cornerAvgParts: string[] = [];

    if (
      allow('homeAvgCornersFor') &&
      isFiniteNum(context?.homeAvgCornersFor) &&
      isFiniteNum(context?.homeCornersWindow) &&
      context.homeCornersWindow > 0
    ) {
      const againstClause = isFiniteNum(context.homeAvgCornersAgainst)
        ? ` and conceding ${context.homeAvgCornersAgainst.toFixed(1)}`
        : '';
      cornerAvgParts.push(
        `${home} winning ${context.homeAvgCornersFor.toFixed(1)}${againstClause} corners per match over the last ${context.homeCornersWindow}`
      );
    } else if (isFiniteNum(context?.homeCornerForRating) && context.homeCornerForRating > 2.2) {
      cornerAvgParts.push(`${home} winning ${context.homeCornerForRating.toFixed(1)} corners per match`);
    }

    if (
      allow('awayAvgCornersFor') &&
      isFiniteNum(context?.awayAvgCornersFor) &&
      isFiniteNum(context?.awayCornersWindow) &&
      context.awayCornersWindow > 0
    ) {
      const againstClause = isFiniteNum(context.awayAvgCornersAgainst)
        ? ` and conceding ${context.awayAvgCornersAgainst.toFixed(1)}`
        : '';
      cornerAvgParts.push(
        `${away} winning ${context.awayAvgCornersFor.toFixed(1)}${againstClause} over the last ${context.awayCornersWindow}`
      );
    } else if (isFiniteNum(context?.awayCornerForRating) && context.awayCornerForRating > 2.2) {
      cornerAvgParts.push(`${away} winning ${context.awayCornerForRating.toFixed(1)}`);
    }

    const avgClause = cornerAvgParts.length > 0 ? `, with ${cornerAvgParts.join(' and ')}` : '';
    sentence2Body = `Model projects ${expCornersHome.toFixed(1)} corners for ${home} and ${expCornersAway.toFixed(
      1
    )} for ${away} (${totalCornersProj.toFixed(1)} total corners)${avgClause}`;

    if (allow('h2hAvgTotalCorners') && h2hCornersMeetingsCount >= 3 && h2hAvgTotalCorners !== null) {
      sentence2Body += `; their last ${plural(
        h2hCornersMeetingsCount,
        'meeting',
        'meetings'
      )} averaged ${h2hAvgTotalCorners.toFixed(2)} corners`;
    }
  } else if (family === 'cards' && expCards !== null) {
    const teamCardParts: string[] = [];

    if (
      allow('homeAvgCardsFor') &&
      isFiniteNum(context?.homeAvgCardsFor) &&
      isFiniteNum(context?.homeCardsWindow) &&
      context.homeCardsWindow > 0
    ) {
      const yrClause =
        isFiniteNum(context.homeAvgYellowCards) && isFiniteNum(context.homeAvgRedCards)
          ? ` (${context.homeAvgYellowCards.toFixed(2)} yellow, ${context.homeAvgRedCards.toFixed(2)} red)`
          : '';
      teamCardParts.push(
        `${home} averages ${context.homeAvgCardsFor.toFixed(2)} cards per match over the last ${
          context.homeCardsWindow
        }${yrClause}`
      );
    } else if (isFiniteNum(context?.homeCardForRating) && context.homeCardForRating > 1.55) {
      teamCardParts.push(`${home} averages ${context.homeCardForRating.toFixed(2)} cards per match`);
    }

    if (
      allow('awayAvgCardsFor') &&
      isFiniteNum(context?.awayAvgCardsFor) &&
      isFiniteNum(context?.awayCardsWindow) &&
      context.awayCardsWindow > 0
    ) {
      const yrClause =
        isFiniteNum(context.awayAvgYellowCards) && isFiniteNum(context.awayAvgRedCards)
          ? ` (${context.awayAvgYellowCards.toFixed(2)} yellow, ${context.awayAvgRedCards.toFixed(2)} red)`
          : '';
      teamCardParts.push(
        `${away} averages ${context.awayAvgCardsFor.toFixed(2)} cards per match over the last ${
          context.awayCardsWindow
        }${yrClause}`
      );
    } else if (isFiniteNum(context?.awayCardForRating) && context.awayCardForRating > 1.55) {
      teamCardParts.push(`${away} averages ${context.awayCardForRating.toFixed(2)} cards per match`);
    }

    const teamClause = teamCardParts.length > 0 ? `, as ${teamCardParts.join(' and ')}` : '';
    sentence2Body = `Model projects ${expCards.toFixed(1)} total cards${teamClause}`;

    if (allow('h2hAvgTotalCards') && h2hCardsMeetingsCount >= 3 && h2hAvgTotalCards !== null) {
      sentence2Body += `; their last ${plural(
        h2hCardsMeetingsCount,
        'head to head meeting',
        'head to head meetings'
      )} averaged ${h2hAvgTotalCards.toFixed(2)} cards`;
    }
  } else {
    // Goals / Multi-goals / BTTS / AH / Result / Half-time
    if (allow('homeAvgScored') && hasTeamAverages) {
      const xgHomeClause = allow('homeXg') && homeXg !== null ? ` (${homeXg.toFixed(2)} xG)` : '';
      const xgAwayClause =
        allow('awayXg') && awayXg !== null && totalXg !== null
          ? ` (${awayXg.toFixed(2)} xG, ${totalXg.toFixed(2)} total xG)`
          : '';
      sentence2Body = `${home} averages ${rawHomeAvgScored!.toFixed(1)} scored and ${rawHomeAvgConceded!.toFixed(
        1
      )} conceded${xgHomeClause} while ${away} averages ${rawAwayAvgScored!.toFixed(
        1
      )} scored and ${rawAwayAvgConceded!.toFixed(1)} conceded${xgAwayClause}`;
    } else if (allow('homeXg') && homeXg !== null && awayXg !== null && totalXg !== null) {
      sentence2Body = `Dixon Coles projections put expected goals at ${homeXg.toFixed(
        2
      )} for ${home} and ${awayXg.toFixed(2)} for ${away} (${totalXg.toFixed(2)} combined xG)`;
    }

    if (allow('h2hAvgTotalGoals') && h2hMeetingsCount >= 3 && h2hAvgTotalGoals !== null) {
      const h2hClause = `${plural(
        h2hMeetingsCount,
        'head to head meeting',
        'head to head meetings'
      )} averaged ${h2hAvgTotalGoals.toFixed(2)} total goals`;
      if (sentence2Body) {
        sentence2Body += `; ${h2hClause}`;
      } else {
        sentence2Body = `Across ${h2hClause}`;
      }
    }

    if (
      allow('multiGoalsMeta') &&
      topPick?.multiGoalsMeta &&
      isFiniteNum(topPick.multiGoalsMeta.last10Hits) &&
      isFiniteNum(topPick.multiGoalsMeta.last10Total) &&
      topPick.multiGoalsMeta.last10Total > 0
    ) {
      const bandClause = `recent matches landed in ${topPick.multiGoalsMeta.band} goals in ${topPick.multiGoalsMeta.last10Hits} of ${topPick.multiGoalsMeta.last10Total}`;
      sentence2Body = sentence2Body
        ? `${sentence2Body}; ${bandClause}`
        : `${bandClause.charAt(0).toUpperCase() + bandClause.slice(1)}`;
    }
  }

  const sentence2 = sentence2Body ? cleanDisplayText(`${sentence2Body}.`) : '';

  // Sentence 3: STRICTLY market-aware context drivers
  const stateTags = context?.stateTags || [];
  const hasScheduleCongestion =
    stateTags.includes('fixture-congested') || stateTags.includes('high-fatigue');
  const hasKeyAbsences = stateTags.includes('key-absences');
  const isLowScoringTendency =
    allow('lowScoringTendency') && totalXg !== null && totalXg > 0 && totalXg < 2.2;
  const isModerateSample =
    homeSamples !== null && awaySamples !== null && (homeSamples < 15 || awaySamples < 15);

  const contextDrivers: string[] = [];

  if (allow('referee')) {
    if (
      context?.refereeAnnounced &&
      context.referee &&
      isFiniteNum(context.refereeShrunkRate) &&
      isFiniteNum(context.refereeLeagueBaseline)
    ) {
      contextDrivers.push(
        `referee ${cleanDisplayText(context.referee)} averages ${context.refereeShrunkRate.toFixed(
          2
        )} cards vs ${context.refereeLeagueBaseline.toFixed(2)} league baseline`
      );
    } else if (family === 'cards') {
      if (leagueCardsBaseline !== null) {
        contextDrivers.push(
          `referee is unannounced so the league baseline of ${leagueCardsBaseline.toFixed(
            2
          )} cards per match applies`
        );
      } else {
        contextDrivers.push('referee assignment is not announced yet');
      }
    }
  }

  if (allow('isDerby') && context?.isDerby) {
    contextDrivers.push('derby rivalry intensity applies');
  }

  if (
    allow('homeAvgFoulsCommitted') &&
    isFiniteNum(context?.homeAvgFoulsCommitted) &&
    isFiniteNum(context?.awayAvgFoulsCommitted) &&
    isFiniteNum(context?.foulsSampleCount) &&
    context.foulsSampleCount >= 5
  ) {
    contextDrivers.push(
      `clubs commit ${context.homeAvgFoulsCommitted.toFixed(1)} and ${context.awayAvgFoulsCommitted.toFixed(
        1
      )} fouls per match`
    );
  }

  if (allow('scheduleFatigue')) {
    if (context?.factors?.schedule_fatigue?.isMeasured && context.factors.schedule_fatigue.description) {
      contextDrivers.push(cleanDisplayText(context.factors.schedule_fatigue.description).replace(/\.$/, ''));
    } else if (hasScheduleCongestion) {
      contextDrivers.push('fixture congestion raises rotation risk');
    }
  }

  if (allow('squadAbsences') && hasKeyAbsences) {
    contextDrivers.push('squad absences weigh on attacking output');
  }

  if (isLowScoringTendency && totalXg !== null) {
    contextDrivers.push(`low scoring projection (${totalXg.toFixed(2)} combined xG)`);
  }

  if (allow('sampleDepth') && isModerateSample && homeSamples !== null && awaySamples !== null) {
    contextDrivers.push(`moderate sample depth (${homeSamples} vs ${awaySamples} matches)`);
  }

  let sentence3Context = '';
  if (contextDrivers.length > 0) {
    const joined = contextDrivers.slice(0, 3).join('; ');
    sentence3Context = cleanDisplayText(`${joined.charAt(0).toUpperCase() + joined.slice(1)}.`);
  }

  // Sentence 4: Complete, well-formed market price & team news sentence (NEVER truncated mid-sentence)
  let sentence4Market = '';
  if (topPick) {
    const lineupKnown = context?.lineupConfirmed !== undefined;
    const teamNewsClause = lineupKnown
      ? context.lineupConfirmed
        ? 'team news is confirmed'
        : 'team news is not confirmed yet'
      : '';

    const isMultiGoalsPick =
      topPick.optionType === 'multi_goals' ||
      topPick.optionType === 'team_multi_goals' ||
      topPick.optionType === 'first_half_multi_goals' ||
      topPick.marketCategory === 'multi_goals';
    const thresholdPct = isMultiGoalsPick ? '60.0%' : '70.0%';

    let marketBody = '';
    if (isFiniteNum(topPick.marketOdds) && topPick.marketOdds > 1 && isFiniteNum(topPick.expectedValue)) {
      const evPct = (topPick.expectedValue * 100).toFixed(1);
      const evSign = topPick.expectedValue >= 0 ? '+' : '\u2212';
      marketBody = `Backed by ${topPick.marketOdds.toFixed(2)} market odds (${evSign}${Math.abs(
        Number(evPct)
      ).toFixed(1)}% EV)`;
    } else {
      const ladderChosen = Boolean(
        topPick.evidence?.whyLineChosen && /highest line clearing/i.test(topPick.evidence.whyLineChosen)
      );
      marketBody = ladderChosen
        ? `No bookmaker price is available, so this is a model line only and is the highest line clearing our ${thresholdPct} confidence threshold`
        : `No bookmaker price is available, so this is a model line only clearing our ${thresholdPct} confidence threshold`;
    }

    if (
      allow('multiGoalsMeta') &&
      topPick.multiGoalsMeta &&
      isFiniteNum(topPick.multiGoalsMeta.span) &&
      isFiniteNum(topPick.multiGoalsMeta.expectedTotalGoals)
    ) {
      marketBody += `; selected band ${topPick.multiGoalsMeta.band} keeps range width at ${topPick.multiGoalsMeta.span} around ${topPick.multiGoalsMeta.expectedTotalGoals.toFixed(
        2
      )} expected goals`;
    }

    if (teamNewsClause) {
      marketBody += `; ${teamNewsClause}`;
    }
    sentence4Market = cleanDisplayText(`${marketBody}.`);
  } else {
    sentence4Market = cleanDisplayText(
      evaluation.noRecommendationReason ||
        'Market edge and data uncertainty checks kept this fixture in abstain mode.'
    );
    if (!/[.!?]$/.test(sentence4Market)) {
      sentence4Market += '.';
    }
  }

  const parts = [sentence1, sentence2, sentence3Context, sentence4Market].filter(Boolean);
  const fullSummary = parts.slice(0, 4).join(' ');

  const driverTiles = buildFootballDriverTiles({
    family,
    topPick,
    home,
    away,
    homeSamples,
    awaySamples,
    context,
    expCornersHome,
    expCornersAway,
    expCards,
    homeXg,
    awayXg,
    totalXg,
    rawHomeAvgScored,
    rawAwayAvgScored,
    h2hMeetingsCount,
    h2hAvgTotalGoals,
    h2hCardsMeetingsCount,
    h2hAvgTotalCards,
    h2hCornersMeetingsCount,
    h2hAvgTotalCorners,
    leagueCardsBaseline,
  });

  // Market-scoped reasoning payload (zero cross-market leakage)
  const reasoning: Record<string, any> = {
    sport: 'football',
    marketEvidenceFamily: family,
    status: topPick ? 'recommended' : 'abstain',
    homeTeam: home,
    awayTeam: away,
    homeSampleMatches: homeSamples,
    awaySampleMatches: awaySamples,
    lineupConfirmed: Boolean(context?.lineupConfirmed),
    stateTags,
    moderateSampleRisk: isModerateSample,
    topPick: topPick
      ? {
          marketCode: topPick.marketCode,
          selection: cleanTopSel,
          probability: isFiniteNum(calProb) ? Number(calProb.toFixed(4)) : null,
          rawProbability: isFiniteNum(rawProb) ? Number(rawProb.toFixed(4)) : null,
          calibratedProbability: isFiniteNum(calProb) ? Number(calProb.toFixed(4)) : null,
          confidenceTier: topPick.confidenceTier,
          confidenceReason: derivedConfidenceReason || null,
          priceSource: cleanDisplayText(
            topPick.priceSource || (topPick.marketOdds ? 'Verified Odds' : 'Model line, no market price')
          ),
          marketOdds: topPick.marketOdds ?? null,
          expectedValue: topPick.expectedValue ?? null,
          ...(allow('multiGoalsMeta') ? { multiGoalsMeta: topPick.multiGoalsMeta ?? null } : {}),
        }
      : null,
  };

  if (family === 'cards') {
    reasoning.expectedCards = expCards !== null ? Number(expCards.toFixed(2)) : null;
    reasoning.homeAvgCardsFor = isFiniteNum(context?.homeAvgCardsFor) ? context.homeAvgCardsFor : null;
    reasoning.awayAvgCardsFor = isFiniteNum(context?.awayAvgCardsFor) ? context.awayAvgCardsFor : null;
    reasoning.homeAvgYellowCards = isFiniteNum(context?.homeAvgYellowCards) ? context.homeAvgYellowCards : null;
    reasoning.awayAvgYellowCards = isFiniteNum(context?.awayAvgYellowCards) ? context.awayAvgYellowCards : null;
    reasoning.homeAvgRedCards = isFiniteNum(context?.homeAvgRedCards) ? context.homeAvgRedCards : null;
    reasoning.awayAvgRedCards = isFiniteNum(context?.awayAvgRedCards) ? context.awayAvgRedCards : null;
    reasoning.homeCardsWindow = context?.homeCardsWindow ?? null;
    reasoning.awayCardsWindow = context?.awayCardsWindow ?? null;
    reasoning.referee =
      context?.refereeAnnounced && context.referee ? cleanDisplayText(context.referee) : null;
    reasoning.refereeShrunkRate =
      context?.refereeAnnounced && isFiniteNum(context.refereeShrunkRate)
        ? context.refereeShrunkRate
        : null;
    reasoning.refereeLeagueBaseline = leagueCardsBaseline;
    reasoning.isDerby = Boolean(context?.isDerby);
    reasoning.h2hCardsMeetingsCount = h2hCardsMeetingsCount >= 3 ? h2hCardsMeetingsCount : 0;
    reasoning.h2hAvgTotalCards = h2hCardsMeetingsCount >= 3 ? h2hAvgTotalCards : null;
  } else if (family === 'corners') {
    reasoning.expectedCornersHome = expCornersHome !== null ? Number(expCornersHome.toFixed(2)) : null;
    reasoning.expectedCornersAway = expCornersAway !== null ? Number(expCornersAway.toFixed(2)) : null;
    reasoning.homeAvgCornersFor = isFiniteNum(context?.homeAvgCornersFor) ? context.homeAvgCornersFor : null;
    reasoning.homeAvgCornersAgainst = isFiniteNum(context?.homeAvgCornersAgainst)
      ? context.homeAvgCornersAgainst
      : null;
    reasoning.awayAvgCornersFor = isFiniteNum(context?.awayAvgCornersFor) ? context.awayAvgCornersFor : null;
    reasoning.awayAvgCornersAgainst = isFiniteNum(context?.awayAvgCornersAgainst)
      ? context.awayAvgCornersAgainst
      : null;
    reasoning.h2hCornersMeetingsCount = h2hCornersMeetingsCount >= 3 ? h2hCornersMeetingsCount : 0;
    reasoning.h2hAvgTotalCorners = h2hCornersMeetingsCount >= 3 ? h2hAvgTotalCorners : null;
  } else {
    reasoning.homeXg = homeXg !== null ? Number(homeXg.toFixed(2)) : null;
    reasoning.awayXg = awayXg !== null ? Number(awayXg.toFixed(2)) : null;
    reasoning.totalXg = totalXg;
    reasoning.homeAvgScored = hasTeamAverages ? rawHomeAvgScored : null;
    reasoning.homeAvgConceded = hasTeamAverages ? rawHomeAvgConceded : null;
    reasoning.awayAvgScored = hasTeamAverages ? rawAwayAvgScored : null;
    reasoning.awayAvgConceded = hasTeamAverages ? rawAwayAvgConceded : null;
    reasoning.lowScoringTendency = isLowScoringTendency;
    reasoning.h2hMeetingsCount = h2hMeetingsCount >= 3 ? h2hMeetingsCount : 0;
    reasoning.h2hAvgTotalGoals = h2hMeetingsCount >= 3 ? h2hAvgTotalGoals : null;
  }

  let output: WrittenMatchExplanation = {
    oneLineSummary: splitFirstSentence(sentence1) || sentence1,
    fullSummary,
    driverTiles,
    headlineSelectionReason: headlineReason,
    activePickMarketCode: topPick?.marketCode,
    activePickSelection: cleanTopSel || undefined,
    activePickProbability: isFiniteNum(calProb) ? Number(calProb.toFixed(4)) : undefined,
    activePickTier: topPick?.confidenceTier,
    confidenceTier: topPick?.confidenceTier,
    confidenceReason: derivedConfidenceReason,
    rawProbability: isFiniteNum(rawProb) ? Number(rawProb.toFixed(4)) : undefined,
    calibratedProbability: isFiniteNum(calProb) ? Number(calProb.toFixed(4)) : undefined,
    reasoning,
    alternates,
    generatedAt: new Date().toISOString(),
  };

  // Runtime consistency guard: never allow divergent header/text/tiles/evidence
  const validation = validateExplanationConsistency({
    sport: 'football',
    homeTeam: home,
    awayTeam: away,
    activePick:
      topPick && isFiniteNum(calProb)
        ? {
            marketCode: topPick.marketCode,
            selection: cleanTopSel,
            probability: calProb,
            confidenceTier: topPick.confidenceTier,
            optionType: topPick.optionType,
            marketCategory: topPick.marketCategory,
            marketFamily: topPick.marketFamily,
          }
        : null,
    explanation: output,
    isThinHistory: false,
  });

  if (!validation.valid && validation.safeFallbackOneLine && validation.safeFallbackFull) {
    output = {
      ...output,
      oneLineSummary: validation.safeFallbackOneLine,
      fullSummary: validation.safeFallbackFull,
      validationPassed: false,
      validationIssues: validation.issues.map((i) => i.code),
      fallbackApplied: true,
    };
  } else {
    output.validationPassed = true;
    output.fallbackApplied = false;
  }

  return output;
}

/**
 * Rebuilds `writtenExplanation` across a post-diversity slate so card, header,
 * explanation prose, driver tiles, and alternates always match the active pick.
 */
export function syncSlateExplanations<
  T extends {
    fixtureId: string;
    fixture: Fixture;
    topPick: MarketPrediction | null;
    predictions: MarketPrediction[];
    noRecommendationReason?: string;
    context?: FixtureContext;
    writtenExplanation?: WrittenMatchExplanation;
  }
>(items: T[]): T[] {
  return items.map((item) => {
    const existing = item.writtenExplanation ?? item.fixture.writtenExplanation;
    const regenerated = generateFootballExplanation({
      fixture: item.fixture,
      evaluation: {
        topPick: item.topPick,
        predictions: item.predictions,
        noRecommendationReason: item.noRecommendationReason,
      },
      context: item.context,
      headlineSelectionReason: item.topPick?.headlineSelectionReason,
    });

    const synced: WrittenMatchExplanation = existing?.tierLocked
      ? {
          ...regenerated,
          oneLineSummary: existing.dailySummaryLimitReached
            ? existing.oneLineSummary
            : regenerated.oneLineSummary,
          fullSummary: '',
          driverTiles: [],
          reasoning: {},
          alternates: [],
          tierLocked: true,
          dailySummaryLimitReached: Boolean(existing.dailySummaryLimitReached),
        }
      : existing
      ? {
          ...regenerated,
          tierLocked: existing.tierLocked,
          dailySummaryLimitReached: existing.dailySummaryLimitReached,
        }
      : regenerated;

    item.fixture.writtenExplanation = synced;
    return {
      ...item,
      writtenExplanation: synced,
    };
  });
}

function deriveBasketballHeadlineReason(
  topPick: BasketballPickCandidate | null,
  picks: BasketballPickCandidate[]
): string | undefined {
  if (!topPick) return undefined;
  const hasPricedEv = Boolean(
    !topPick.isModelLine &&
      isFiniteNum(topPick.marketOdds) &&
      topPick.marketOdds > 1.0 &&
      isFiniteNum(topPick.expectedValue) &&
      topPick.expectedValue > 0
  );
  if (hasPricedEv) {
    const higherProbAlt = picks.find(
      (p) =>
        p.marketCode !== topPick.marketCode &&
        p.tier !== 'ABSTAIN' &&
        isFiniteNum(p.calibratedProbability) &&
        p.calibratedProbability > topPick.calibratedProbability + 0.0025
    );
    if (higherProbAlt) {
      return cleanDisplayText(
        `Selected ahead of higher probability alternates because verified bookmaker odds (${topPick.marketOdds!.toFixed(
          2
        )}) generate +${(topPick.expectedValue! * 100).toFixed(1)}% expected value.`
      );
    }
  }
  return undefined;
}

export function selectTopBasketballAlternates(
  picks: BasketballPickCandidate[],
  topPick: BasketballPickCandidate | null,
  options?: { headlineSelectionReason?: string }
): WrittenMatchAlternate[] {
  const seenCodes = new Set<string>();
  const seenSelections = new Set<string>();
  if (topPick) {
    seenCodes.add(topPick.marketCode);
    seenSelections.add(cleanDisplayText(topPick.selection).toLowerCase());
  }

  const tierRank = (t: BasketballPickCandidate['tier']) =>
    t === 'HIGH' ? 3 : t === 'MEDIUM' ? 2 : t === 'SPECULATIVE' ? 1 : 0;

  const sorted = [...picks]
    .filter((p) => p.tier !== 'ABSTAIN')
    .sort((a, b) => {
      const tr = tierRank(b.tier) - tierRank(a.tier);
      if (tr !== 0) return tr;
      const evDiff = (b.expectedValue ?? -1) - (a.expectedValue ?? -1);
      if (b.expectedValue !== null && a.expectedValue !== null && Math.abs(evDiff) > 0.005) {
        return evDiff;
      }
      return b.calibratedProbability - a.calibratedProbability;
    });

  const hasReason = Boolean(options?.headlineSelectionReason);
  const topProb = topPick ? topPick.calibratedProbability : null;

  const out: WrittenMatchAlternate[] = [];
  for (const p of sorted) {
    if (out.length >= 2) break;
    if (seenCodes.has(p.marketCode)) continue;
    const selClean = cleanDisplayText(p.selection);
    if (seenSelections.has(selClean.toLowerCase())) continue;
    if (!isFiniteNum(p.calibratedProbability) || p.calibratedProbability <= 0) continue;
    if (!hasReason && topProb !== null && p.calibratedProbability - topProb > 0.0025) continue;

    seenCodes.add(p.marketCode);
    seenSelections.add(selClean.toLowerCase());
    out.push({
      marketCode: p.marketCode,
      marketName: cleanDisplayText(p.marketCategory),
      selection: selClean,
      probability: Number(p.calibratedProbability.toFixed(4)),
      confidenceTier: p.tier === 'HIGH' ? 'HIGH' : p.tier === 'MEDIUM' ? 'MEDIUM' : 'LOW',
    });
  }
  return out;
}

export function generateBasketballExplanation(params: {
  fixture: Fixture;
  evaluation: BasketballGameEvaluation;
  activePickOverride?: BasketballPickCandidate | null;
}): WrittenMatchExplanation {
  const { fixture, evaluation, activePickOverride } = params;
  const home = cleanDisplayText(displayName(fixture.homeTeam) || fixture.homeTeam.name);
  const away = cleanDisplayText(displayName(fixture.awayTeam) || fixture.awayTeam.name);
  const proj = evaluation.projection;

  const homeGames = isFiniteNum(proj?.homeGamesPlayed) ? proj.homeGamesPlayed : null;
  const awayGames = isFiniteNum(proj?.awayGamesPlayed) ? proj.awayGamesPlayed : null;

  if (evaluation.needsHistory) {
    const gamesClause =
      homeGames !== null && awayGames !== null
        ? `: ${home} has ${plural(homeGames, 'stored game', 'stored games')} and ${away} has ${plural(
            awayGames,
            'stored game',
            'stored games'
          )}`
        : '';
    const s1 = cleanDisplayText(
      `Not enough history to recommend a pick for ${home} vs ${away}${gamesClause}.`
    );
    const s2 = cleanDisplayText(
      evaluation.abstentionReason ||
        'Additional verified season games are needed before publishing calibrated totals.'
    );
    const thinTiles: ExplanationDriverTile[] = [];
    if (homeGames !== null && awayGames !== null) {
      thinTiles.push({ label: 'Sample depth', value: `${homeGames}H / ${awayGames}A games` });
    }
    return {
      oneLineSummary: s1,
      fullSummary: `${s1} ${s2}`,
      driverTiles: thinTiles,
      validationPassed: true,
      fallbackApplied: false,
      reasoning: {
        sport: 'basketball',
        status: 'thin_history',
        league: evaluation.league,
        homeTeam: home,
        awayTeam: away,
        homeGamesPlayed: homeGames,
        awayGamesPlayed: awayGames,
        reason: s2,
      },
      alternates: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const topPick = activePickOverride !== undefined ? activePickOverride : evaluation.topPick;
  const bbHeadlineReason = deriveBasketballHeadlineReason(topPick, evaluation.picks || []);
  const alternates = selectTopBasketballAlternates(evaluation.picks || [], topPick, {
    headlineSelectionReason: bbHeadlineReason,
  });

  const cleanTopSel = topPick ? cleanDisplayText(topPick.selection) : '';
  const sentence1 =
    topPick && isFiniteNum(topPick.calibratedProbability)
      ? cleanDisplayText(
          `Model recommends ${cleanTopSel} at ${pct(topPick.calibratedProbability)} (${tierToDisplayLabel(
            topPick.tier
          )} confidence).`
        )
      : cleanDisplayText(
          `No qualified pick for ${home} vs ${away}: calibrated totals sit too close to available lines.`
        );

  const hasMeans =
    isFiniteNum(proj?.homeMean) &&
    isFiniteNum(proj?.awayMean) &&
    isFiniteNum(proj?.gameTotalMean);
  const hasStd = isFiniteNum(proj?.gameTotalStd);
  const hasTeamScoring = isFiniteNum(proj?.homeAvgScored) && isFiniteNum(proj?.awayAvgAllowed);

  let sentence2 = '';
  if (hasMeans) {
    const stdClause = hasStd ? `, std ${proj.gameTotalStd.toFixed(1)}` : '';
    const avgClause = hasTeamScoring
      ? `, with ${home} averaging ${proj.homeAvgScored.toFixed(1)} scored vs ${away} allowing ${proj.awayAvgAllowed.toFixed(
          1
        )}`
      : '';
    sentence2 = cleanDisplayText(
      `Model projects ${home} ${proj.homeMean.toFixed(1)} pts and ${away} ${proj.awayMean.toFixed(
        1
      )} pts (${proj.gameTotalMean.toFixed(1)} total pts${stdClause})${avgClause}.`
    );
  } else if (hasTeamScoring) {
    sentence2 = cleanDisplayText(
      `${home} averages ${proj.homeAvgScored.toFixed(1)} points scored vs ${away} allowing ${proj.awayAvgAllowed.toFixed(
        1
      )}.`
    );
  }

  const contextParts: string[] = [];
  if (isFiniteNum(proj?.paceAdjustment)) {
    const paceDeltaStr =
      proj.paceAdjustment >= 0
        ? `+${proj.paceAdjustment.toFixed(1)}`
        : `\u2212${Math.abs(proj.paceAdjustment).toFixed(1)}`;
    contextParts.push(
      Math.abs(proj.paceAdjustment) >= 0.3
        ? `pace matchup shifts total by ${paceDeltaStr} pts`
        : `neutral pace matchup (${paceDeltaStr} pts)`
    );
  }

  const hasBothRest = isFiniteNum(proj?.homeRestDays) && isFiniteNum(proj?.awayRestDays);
  if (proj?.homeIsB2B && proj?.awayIsB2B) {
    contextParts.push(`both teams play on zero days rest in a back to back spot`);
  } else if (proj?.homeIsB2B) {
    const detail = hasBothRest ? ` (${proj.homeRestDays}d rest vs ${proj.awayRestDays}d for ${away})` : '';
    contextParts.push(`${home} plays on a back to back${detail}`);
  } else if (proj?.awayIsB2B) {
    const detail = hasBothRest ? ` (${proj.awayRestDays}d rest vs ${proj.homeRestDays}d for ${home})` : '';
    contextParts.push(`${away} plays on a back to back${detail}`);
  } else if (hasBothRest) {
    contextParts.push(
      `rest stands at ${plural(proj.homeRestDays!, 'day', 'days')} for ${home} and ${plural(
        proj.awayRestDays!,
        'day',
        'days'
      )} for ${away}`
    );
  }

  if (homeGames !== null && awayGames !== null && (homeGames < 10 || awayGames < 10)) {
    contextParts.push(`early sample risk (${homeGames} vs ${awayGames} games)`);
  }

  let contextSentence = '';
  if (contextParts.length > 0) {
    const joined = contextParts.join('; ');
    contextSentence = cleanDisplayText(`${joined.charAt(0).toUpperCase() + joined.slice(1)}.`);
  }

  let marketNote = '';
  const hasSportsbookTotal = isFiniteNum(fixture.basketballStats?.sportsbookTotal);
  const gameTotalStr = isFiniteNum(proj?.gameTotalMean) ? ` (game total ${proj.gameTotalMean.toFixed(1)})` : '';

  if (
    topPick &&
    !topPick.isModelLine &&
    isFiniteNum(topPick.marketOdds) &&
    isFiniteNum(topPick.projectedMean) &&
    isFiniteNum(topPick.line)
  ) {
    const evPart = isFiniteNum(topPick.expectedValue)
      ? ` (${topPick.expectedValue >= 0 ? '+' : '\u2212'}${Math.abs(topPick.expectedValue * 100).toFixed(1)}% EV)`
      : '';
    marketNote = `Model projects ${topPick.projectedMean.toFixed(1)} vs ${cleanDisplayText(
      topPick.priceSource
    )} line ${topPick.line.toFixed(1)}${gameTotalStr} at ${topPick.marketOdds.toFixed(2)} odds${evPart}.`;
  } else if (hasSportsbookTotal && isFiniteNum(proj?.gameTotalMean)) {
    marketNote = `Model total ${proj.gameTotalMean.toFixed(1)} pts vs ${fixture.basketballStats!.sportsbookTotal!.toFixed(
      1
    )} posted total; no bookmaker price is available, so this is a model line only.`;
  } else if (topPick && isFiniteNum(topPick.projectedMean) && isFiniteNum(topPick.line)) {
    marketNote = `Model projects ${topPick.projectedMean.toFixed(1)} vs ${topPick.line.toFixed(
      1
    )} line${gameTotalStr}; no bookmaker price is available, so this is a model line only.`;
  } else if (evaluation.abstentionReason) {
    marketNote = cleanDisplayText(evaluation.abstentionReason);
    if (marketNote && !/[.!?]$/.test(marketNote)) marketNote += '.';
  }

  const fullSummary = [sentence1, sentence2, contextSentence, cleanDisplayText(marketNote)]
    .filter(Boolean)
    .slice(0, 4)
    .join(' ');

  const bbConfidenceTier: ConfidenceTier | undefined = topPick
    ? topPick.tier === 'HIGH'
      ? 'HIGH'
      : topPick.tier === 'MEDIUM'
      ? 'MEDIUM'
      : 'LOW'
    : undefined;
  const bbConfidenceReason =
    topPick && bbConfidenceTier === 'LOW'
      ? homeGames !== null && homeGames < 10
        ? cleanDisplayText(`only ${plural(homeGames, 'recent game', 'recent games')} for ${home}`)
        : awayGames !== null && awayGames < 10
        ? cleanDisplayText(`only ${plural(awayGames, 'recent game', 'recent games')} for ${away}`)
        : cleanDisplayText('small edge or elevated total variance')
      : undefined;

  const bbTiles: ExplanationDriverTile[] = [];
  if (isFiniteNum(proj?.gameTotalMean)) {
    bbTiles.push({ label: 'Projected total', value: `${proj.gameTotalMean.toFixed(1)} pts` });
  }
  if (isFiniteNum(proj?.homeMean) && isFiniteNum(proj?.awayMean)) {
    bbTiles.push({
      label: 'Split projection',
      value: `${proj.homeMean.toFixed(1)} / ${proj.awayMean.toFixed(1)}`,
    });
  }
  if (isFiniteNum(proj?.paceAdjustment)) {
    const sign = proj.paceAdjustment >= 0 ? '+' : '\u2212';
    bbTiles.push({
      label: 'Pace shift',
      value: `${sign}${Math.abs(proj.paceAdjustment).toFixed(1)} pts`,
    });
  }
  if (homeGames !== null && awayGames !== null) {
    bbTiles.push({ label: 'Sample depth', value: `${homeGames}H / ${awayGames}A games` });
  }

  let output: WrittenMatchExplanation = {
    oneLineSummary: splitFirstSentence(sentence1) || sentence1,
    fullSummary,
    driverTiles: bbTiles.slice(0, 4),
    headlineSelectionReason: bbHeadlineReason,
    activePickMarketCode: topPick?.marketCode,
    activePickSelection: cleanTopSel || undefined,
    activePickProbability:
      topPick && isFiniteNum(topPick.calibratedProbability)
        ? Number(topPick.calibratedProbability.toFixed(4))
        : undefined,
    activePickTier: bbConfidenceTier,
    confidenceTier: bbConfidenceTier,
    confidenceReason: bbConfidenceReason,
    rawProbability:
      topPick && isFiniteNum(topPick.calibratedProbability)
        ? Number(topPick.calibratedProbability.toFixed(4))
        : undefined,
    calibratedProbability:
      topPick && isFiniteNum(topPick.calibratedProbability)
        ? Number(topPick.calibratedProbability.toFixed(4))
        : undefined,
    reasoning: {
      sport: 'basketball',
      marketEvidenceFamily: 'basketball',
      status: topPick ? 'recommended' : 'abstain',
      league: evaluation.league,
      homeTeam: home,
      awayTeam: away,
      homeGamesPlayed: homeGames,
      awayGamesPlayed: awayGames,
      homeProjected: isFiniteNum(proj?.homeMean) ? Number(proj.homeMean.toFixed(1)) : null,
      awayProjected: isFiniteNum(proj?.awayMean) ? Number(proj.awayMean.toFixed(1)) : null,
      projectedTotal: isFiniteNum(proj?.gameTotalMean) ? Number(proj.gameTotalMean.toFixed(1)) : null,
      projectedTotalStd: isFiniteNum(proj?.gameTotalStd) ? Number(proj.gameTotalStd.toFixed(1)) : null,
      homeAvgScored: isFiniteNum(proj?.homeAvgScored) ? Number(proj.homeAvgScored.toFixed(1)) : null,
      awayAvgAllowed: isFiniteNum(proj?.awayAvgAllowed) ? Number(proj.awayAvgAllowed.toFixed(1)) : null,
      homePaceDelta: isFiniteNum(proj?.homePaceDelta) ? Number(proj.homePaceDelta.toFixed(2)) : null,
      awayPaceDelta: isFiniteNum(proj?.awayPaceDelta) ? Number(proj.awayPaceDelta.toFixed(2)) : null,
      paceAdjustment: isFiniteNum(proj?.paceAdjustment) ? Number(proj.paceAdjustment.toFixed(2)) : null,
      homeRestDays: isFiniteNum(proj?.homeRestDays) ? proj.homeRestDays : null,
      awayRestDays: isFiniteNum(proj?.awayRestDays) ? proj.awayRestDays : null,
      homeIsB2B: Boolean(proj?.homeIsB2B),
      awayIsB2B: Boolean(proj?.awayIsB2B),
      sportsbookTotal: hasSportsbookTotal ? fixture.basketballStats!.sportsbookTotal! : null,
      topPick: topPick
        ? {
            marketCode: topPick.marketCode,
            selection: cleanTopSel,
            line: topPick.line,
            probability: isFiniteNum(topPick.calibratedProbability)
              ? Number(topPick.calibratedProbability.toFixed(4))
              : null,
            tier: topPick.tier,
            isModelLine: topPick.isModelLine,
            priceSource: cleanDisplayText(topPick.priceSource),
            marketOdds: topPick.marketOdds,
            expectedValue: topPick.expectedValue,
          }
        : null,
    },
    alternates,
    generatedAt: new Date().toISOString(),
  };

  const validation = validateExplanationConsistency({
    sport: 'basketball',
    homeTeam: home,
    awayTeam: away,
    activePick:
      topPick && isFiniteNum(topPick.calibratedProbability)
        ? {
            marketCode: topPick.marketCode,
            selection: cleanTopSel,
            probability: topPick.calibratedProbability,
            confidenceTier: bbConfidenceTier,
            marketCategory: topPick.marketCategory,
          }
        : null,
    explanation: output,
    isThinHistory: false,
  });

  if (!validation.valid && validation.safeFallbackOneLine && validation.safeFallbackFull) {
    output = {
      ...output,
      oneLineSummary: validation.safeFallbackOneLine,
      fullSummary: validation.safeFallbackFull,
      validationPassed: false,
      validationIssues: validation.issues.map((i) => i.code),
      fallbackApplied: true,
    };
  } else {
    output.validationPassed = true;
    output.fallbackApplied = false;
  }

  return output;
}

/**
 * Generates an explanation dynamically anchored to a specific active basketball pick
 * (e.g., when a card filter selects a category pick different from the slate topPick).
 */
export function generateBasketballExplanationForPick(params: {
  fixture: Fixture;
  evaluation?: BasketballGameEvaluation;
  activePick: BasketballPickCandidate | null;
}): WrittenMatchExplanation | undefined {
  if (!params.evaluation) return params.fixture.writtenExplanation;
  return generateBasketballExplanation({
    fixture: params.fixture,
    evaluation: params.evaluation,
    activePickOverride: params.activePick,
  });
}
