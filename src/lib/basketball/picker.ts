// CALIBRALL: Basketball Pick Evaluator, Half-Point Model Ladder & 40% Diversity Filter
// Strictly authorized markets ONLY:
//   game_total, home_total, away_total, h1_game_total, h1_team_total
// Zero spreads, zero moneyline, zero props, zero quarters.
// Never computes EV without a real bookmaker price.

import {
  BasketballLeague,
  BasketballMarketCategory,
  BasketballMarketCode,
  BASKETBALL_AUTHORIZED_MARKETS,
} from './markets';
import {
  GameProjection,
  computeNormalOverUnder,
  getDistributionForCategory,
} from './model';
import { calibrateBasketballProbability } from './calibratedParams';
import { cleanDisplayText } from '../utils/formatText';

export type BasketballPickTier = 'HIGH' | 'MEDIUM' | 'SPECULATIVE' | 'ABSTAIN';

export interface BbOddsQuote {
  id: string;
  game_id: string;
  league: BasketballLeague;
  market_category: BasketballMarketCategory;
  side: 'game' | 'home' | 'away';
  line: number;
  over_odds: number | null;
  under_odds: number | null;
  bookmaker: string;
  observed_at: string;
}

export interface BasketballPickCandidate {
  gameId: string;
  league: BasketballLeague;
  season: string;
  kickoffUtc: string | null;
  marketCode: BasketballMarketCode;
  marketCategory: BasketballMarketCategory;
  side: 'game' | 'home' | 'away';
  selection: string; // e.g. "Over 220.5 pts"
  line: number;
  projectedMean: number;
  projectedStd: number;
  rawProbability: number;
  calibratedProbability: number;
  marketOdds: number | null;
  impliedProbability: number | null;
  expectedValue: number | null; // Strictly null when isModelLine === true
  isModelLine: boolean;
  priceSource: string; // Bookmaker name or "model line - no market price"
  tier: BasketballPickTier;
  modelConfidence: 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'LOW';
  qualificationStatus:
    | 'QUALIFIED_VALUE'
    | 'QUALIFIED_PROBABILITY'
    | 'UNQUALIFIED_MARGINAL'
    | 'UNQUALIFIED_HIGH_UNCERTAINTY'
    | 'NO_RECOMMENDATION';
  passedBaselineGate: boolean;
  isTopPick: boolean;
  evidenceLine: string;
  abstainReason: string | null;
}

export interface BasketballGameEvaluation {
  gameId: string;
  league: BasketballLeague;
  projection: GameProjection;
  needsHistory: boolean;
  abstentionReason: string | null;
  topPick: BasketballPickCandidate | null;
  picks: BasketballPickCandidate[];
}

export const MODEL_LINE_PRICE_LABEL = 'model line - no market price';
export const BASKETBALL_MODEL_VERSION = 'bb_totals_v1.0';

function roundHalfPoint(x: number): number {
  return Math.round(x - 0.5) + 0.5;
}

function buildEvidenceLine(
  proj: GameProjection,
  homeName: string,
  awayName: string,
  cat: BasketballMarketCategory,
  side: 'game' | 'home' | 'away',
  line: number,
  mean: number,
  isOver: boolean,
  marketOdds: number | null
): string {
  const parts: string[] = [];

  if (cat === 'h1_game_total' || cat === 'h1_team_total') {
    const sharePct = (proj.h1ShareApplied * 100).toFixed(1);
    if (cat === 'h1_game_total') {
      parts.push(
        `1st half project ${proj.h1HomeMean.toFixed(1)} to ${proj.h1AwayMean.toFixed(1)} (${sharePct}% league H1 share)`
      );
    } else if (side === 'home') {
      parts.push(
        `${cleanDisplayText(homeName)} 1st half projects ${mean.toFixed(1)} pts across ${proj.homeH1GamesPlayed} H1 games (${sharePct}% share)`
      );
    } else {
      parts.push(
        `${cleanDisplayText(awayName)} 1st half projects ${mean.toFixed(1)} pts across ${proj.awayH1GamesPlayed} H1 games (${sharePct}% share)`
      );
    }
  } else if (cat === 'home_total') {
    parts.push(
      `${cleanDisplayText(homeName)} averages ${proj.homeAvgScored.toFixed(1)} pts scored across ${proj.homeGamesPlayed} games vs ${cleanDisplayText(awayName)} allowing ${proj.awayAvgAllowed.toFixed(1)}`
    );
  } else if (cat === 'away_total') {
    parts.push(
      `${cleanDisplayText(awayName)} averages ${proj.awayAvgScored.toFixed(1)} pts scored across ${proj.awayGamesPlayed} games vs ${cleanDisplayText(homeName)} allowing ${proj.homeAvgAllowed.toFixed(1)}`
    );
  } else {
    parts.push(
      `${cleanDisplayText(homeName)} (${proj.homeAvgScored.toFixed(1)} for, ${proj.homeAvgAllowed.toFixed(1)} against) vs ${cleanDisplayText(awayName)} (${proj.awayAvgScored.toFixed(1)} for, ${proj.awayAvgAllowed.toFixed(1)} against)`
    );
  }

  if (Math.abs(proj.paceAdjustment) >= 0.4) {
    parts.push(
      `tempo adjustment ${proj.paceAdjustment > 0 ? '+' : ''}${proj.paceAdjustment.toFixed(1)} pts`
    );
  }

  if (proj.neutral) {
    parts.push('neutral court (0 home edge)');
  }

  if (proj.homeIsB2B || proj.awayIsB2B) {
    const b2bTeams = [
      proj.homeIsB2B ? cleanDisplayText(homeName) : null,
      proj.awayIsB2B ? cleanDisplayText(awayName) : null,
    ].filter(Boolean);
    parts.push(`back to back spot for ${b2bTeams.join(' and ')}`);
  } else if (proj.homeRestDays !== null && proj.awayRestDays !== null) {
    parts.push(`rest ${proj.homeRestDays}d vs ${proj.awayRestDays}d`);
  }

  if (proj.h2hMeetings >= 2 && proj.h2hAvgTotal !== null && cat === 'game_total') {
    parts.push(`${proj.h2hMeetings} H2H meetings average ${proj.h2hAvgTotal.toFixed(1)} pts`);
  }

  const directionWord = isOver ? 'above' : 'below';
  parts.push(
    `model projects ${mean.toFixed(1)} ${directionWord} ${line.toFixed(1)} line${
      marketOdds ? ` at ${marketOdds.toFixed(2)} decimal odds` : ''
    }`
  );

  return parts.join('; ');
}

function getMarketCodeForCategory(
  cat: BasketballMarketCategory,
  side: 'game' | 'home' | 'away',
  isOver: boolean
): BasketballMarketCode {
  switch (cat) {
    case 'game_total':
      return isOver ? 'GAME_TOTAL_OVER' : 'GAME_TOTAL_UNDER';
    case 'home_total':
      return isOver ? 'HOME_TOTAL_OVER' : 'HOME_TOTAL_UNDER';
    case 'away_total':
      return isOver ? 'AWAY_TOTAL_OVER' : 'AWAY_TOTAL_UNDER';
    case 'h1_game_total':
      return isOver ? 'H1_TOTAL_OVER' : 'H1_TOTAL_UNDER';
    case 'h1_team_total':
      if (side === 'away') {
        return isOver ? 'H1_AWAY_TOTAL_OVER' : 'H1_AWAY_TOTAL_UNDER';
      }
      return isOver ? 'H1_HOME_TOTAL_OVER' : 'H1_HOME_TOTAL_UNDER';
  }
}

function computeTierAndQualification(
  calibratedProb: number,
  passedBaseline: boolean,
  needsHistory: boolean,
  expectedValue: number | null,
  hasRealOdds: boolean
): {
  tier: BasketballPickTier;
  modelConfidence: 'VERY_HIGH' | 'HIGH' | 'MODERATE' | 'LOW';
  qualificationStatus: BasketballPickCandidate['qualificationStatus'];
} {
  if (needsHistory) {
    return {
      tier: 'ABSTAIN',
      modelConfidence: 'LOW',
      qualificationStatus: 'NO_RECOMMENDATION',
    };
  }

  if (!passedBaseline) {
    return {
      tier: 'SPECULATIVE',
      modelConfidence: 'LOW',
      qualificationStatus: 'UNQUALIFIED_MARGINAL',
    };
  }

  if (calibratedProb >= 0.60) {
    const modelConfidence = calibratedProb >= 0.66 ? 'VERY_HIGH' : 'HIGH';
    const qualificationStatus =
      hasRealOdds && expectedValue !== null && expectedValue >= 0.02
        ? 'QUALIFIED_VALUE'
        : 'QUALIFIED_PROBABILITY';
    return {
      tier: 'HIGH',
      modelConfidence,
      qualificationStatus,
    };
  }

  if (calibratedProb >= 0.54) {
    return {
      tier: 'MEDIUM',
      modelConfidence: 'MODERATE',
      qualificationStatus:
        hasRealOdds && expectedValue !== null && expectedValue >= 0.02
          ? 'QUALIFIED_VALUE'
          : 'QUALIFIED_PROBABILITY',
    };
  }

  return {
    tier: 'SPECULATIVE',
    modelConfidence: 'LOW',
    qualificationStatus: 'UNQUALIFIED_MARGINAL',
  };
}

/**
 * Evaluates a single basketball game across all 5 authorized totals/1st-half categories.
 * Picks from real bookmaker quotes when present in bb_odds_snapshots, else uses a half-point model line ladder.
 */
export function evaluateBasketballGameMarkets(params: {
  gameId: string;
  league: BasketballLeague;
  season: string;
  kickoffUtc: string | null;
  homeName: string;
  awayName: string;
  projection: GameProjection;
  oddsSnapshots?: BbOddsQuote[];
}): BasketballGameEvaluation {
  const { gameId, league, season, kickoffUtc, homeName, awayName, projection, oddsSnapshots = [] } = params;

  if (projection.needsHistory) {
    return {
      gameId,
      league,
      projection,
      needsHistory: true,
      abstentionReason: projection.abstentionReason || 'Needs history',
      topPick: null,
      picks: [],
    };
  }

  const slotList: Array<{ category: BasketballMarketCategory; side: 'game' | 'home' | 'away'; labelPrefix: string }> = [
    { category: 'game_total', side: 'game', labelPrefix: 'Game total' },
    { category: 'home_total', side: 'home', labelPrefix: `${cleanDisplayText(homeName)} total` },
    { category: 'away_total', side: 'away', labelPrefix: `${cleanDisplayText(awayName)} total` },
    { category: 'h1_game_total', side: 'game', labelPrefix: '1st half game total' },
    { category: 'h1_team_total', side: 'home', labelPrefix: `1st half ${cleanDisplayText(homeName)}` },
    { category: 'h1_team_total', side: 'away', labelPrefix: `1st half ${cleanDisplayText(awayName)}` },
  ];

  const picks: BasketballPickCandidate[] = [];

  for (const slot of slotList) {
    const dist = getDistributionForCategory(projection, slot.category, slot.side);
    if (dist.abstained) {
      continue;
    }

    // Check if a real bookmaker quote exists for this (category, side)
    const matchingQuotes = oddsSnapshots.filter(
      (q) => q.market_category === slot.category && q.side === slot.side
    );

    if (matchingQuotes.length > 0) {
      // Evaluate OVER and UNDER on the real bookmaker line and pick best side
      const bestQuote = matchingQuotes[0];
      const ou = computeNormalOverUnder(dist.mean, dist.std, Number(bestQuote.line));

      const calOver = calibrateBasketballProbability(league, slot.category, ou.pOverCond);
      const calUnder = calibrateBasketballProbability(league, slot.category, ou.pUnderCond);

      const candidates: Array<{
        isOver: boolean;
        rawProb: number;
        calProb: number;
        odds: number | null;
        ev: number | null;
        impliedProb: number | null;
        passedBaseline: boolean;
      }> = [];

      const buildEV = (pCond: number, pPush: number, decOdds: number | null): number | null => {
        if (!decOdds || !Number.isFinite(decOdds) || decOdds <= 1.01) return null;
        const pWin = pCond * (1 - pPush);
        return Math.round((pWin * decOdds + pPush - 1) * 10000) / 10000;
      };

      candidates.push({
        isOver: true,
        rawProb: ou.pOverCond,
        calProb: calOver.calibratedProbability,
        odds: bestQuote.over_odds,
        ev: buildEV(calOver.calibratedProbability, ou.pPush, bestQuote.over_odds),
        impliedProb: bestQuote.over_odds && bestQuote.over_odds > 1.01 ? Math.round((1 / bestQuote.over_odds) * 10000) / 10000 : null,
        passedBaseline: calOver.passedBaseline,
      });

      candidates.push({
        isOver: false,
        rawProb: ou.pUnderCond,
        calProb: calUnder.calibratedProbability,
        odds: bestQuote.under_odds,
        ev: buildEV(calUnder.calibratedProbability, ou.pPush, bestQuote.under_odds),
        impliedProb: bestQuote.under_odds && bestQuote.under_odds > 1.01 ? Math.round((1 / bestQuote.under_odds) * 10000) / 10000 : null,
        passedBaseline: calUnder.passedBaseline,
      });

      // Rank side by highest EV if both priced, else calibrated probability
      candidates.sort((a, b) => {
        if (a.ev !== null && b.ev !== null && Math.abs(b.ev - a.ev) > 0.015) {
          return b.ev - a.ev;
        }
        return b.calProb - a.calProb;
      });

      const chosen = candidates[0];
      const hasPrice = chosen.odds !== null && chosen.odds > 1.01;
      const tierInfo = computeTierAndQualification(
        chosen.calProb,
        chosen.passedBaseline,
        false,
        chosen.ev,
        hasPrice
      );

      picks.push({
        gameId,
        league,
        season,
        kickoffUtc,
        marketCode: getMarketCodeForCategory(slot.category, slot.side, chosen.isOver),
        marketCategory: slot.category,
        side: slot.side,
        selection: `${slot.labelPrefix} ${chosen.isOver ? 'Over' : 'Under'} ${Number(bestQuote.line).toFixed(1)}`,
        line: Number(bestQuote.line),
        projectedMean: Math.round(dist.mean * 100) / 100,
        projectedStd: Math.round(dist.std * 100) / 100,
        rawProbability: Math.round(chosen.rawProb * 10000) / 10000,
        calibratedProbability: chosen.calProb,
        marketOdds: hasPrice ? chosen.odds : null,
        impliedProbability: hasPrice ? chosen.impliedProb : null,
        expectedValue: hasPrice ? chosen.ev : null,
        isModelLine: !hasPrice,
        priceSource: hasPrice ? bestQuote.bookmaker : MODEL_LINE_PRICE_LABEL,
        tier: tierInfo.tier,
        modelConfidence: tierInfo.modelConfidence,
        qualificationStatus: tierInfo.qualificationStatus,
        passedBaselineGate: chosen.passedBaseline,
        isTopPick: false,
        evidenceLine: buildEvidenceLine(
          projection,
          homeName,
          awayName,
          slot.category,
          slot.side,
          Number(bestQuote.line),
          dist.mean,
          chosen.isOver,
          hasPrice ? chosen.odds : null
        ),
        abstainReason: null,
      });
    } else {
      // Build a half-point line ladder from the model's distribution.
      // Select the balanced half-point line that clears the threshold cleanly without drifting too deep into extreme tail lines.
      const baseLine = roundHalfPoint(dist.mean);
      const stepOffsets = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6];
      const ladderChoices: Array<{
        line: number;
        isOver: boolean;
        rawProb: number;
        calProb: number;
        passedBaseline: boolean;
        score: number;
      }> = [];

      for (const offset of stepOffsets) {
        const line = baseLine + offset;
        if (line <= 5) continue;
        const ou = computeNormalOverUnder(dist.mean, dist.std, line);

        for (const isOver of [true, false] as const) {
          const rawP = isOver ? ou.pOver : ou.pUnder;
          const cal = calibrateBasketballProbability(league, slot.category, rawP);
          // Favor lines in the realistic actionable window [0.58, 0.72] where calibrated confidence clears 60% cleanly
          // without pushing artificially to 90%+ deep-tail lines
          if (cal.calibratedProbability < 0.52 || cal.calibratedProbability > 0.72) continue;

          // Score balances calibrated certainty (~0.62-0.68 sweet spot) while penalizing distance away from projected mean
          const distFromMean = Math.abs(line - dist.mean) / Math.max(2, dist.std);
          const clears60Bonus = cal.calibratedProbability >= 0.60 ? 0.12 : 0;
          const score = cal.calibratedProbability + clears60Bonus - 0.18 * distFromMean;

          ladderChoices.push({
            line,
            isOver,
            rawProb: rawP,
            calProb: cal.calibratedProbability,
            passedBaseline: cal.passedBaseline,
            score,
          });
        }
      }

      if (ladderChoices.length === 0) {
        // Fallback single nearest line around distribution center
        const fallbackLine = dist.mean >= baseLine ? baseLine - 1 : baseLine + 1;
        const ou = computeNormalOverUnder(dist.mean, dist.std, Math.max(5.5, fallbackLine));
        const isOver = ou.pOver >= ou.pUnder;
        const rawP = Math.max(ou.pOver, ou.pUnder);
        const cal = calibrateBasketballProbability(league, slot.category, rawP);
        ladderChoices.push({
          line: Math.max(5.5, fallbackLine),
          isOver,
          rawProb: rawP,
          calProb: cal.calibratedProbability,
          passedBaseline: cal.passedBaseline,
          score: cal.calibratedProbability,
        });
      }

      ladderChoices.sort((a, b) => b.score - a.score || b.calProb - a.calProb);
      const best = ladderChoices[0];
      const tierInfo = computeTierAndQualification(
        best.calProb,
        best.passedBaseline,
        false,
        null,
        false
      );

      picks.push({
        gameId,
        league,
        season,
        kickoffUtc,
        marketCode: getMarketCodeForCategory(slot.category, slot.side, best.isOver),
        marketCategory: slot.category,
        side: slot.side,
        selection: `${slot.labelPrefix} ${best.isOver ? 'Over' : 'Under'} ${best.line.toFixed(1)}`,
        line: best.line,
        projectedMean: Math.round(dist.mean * 100) / 100,
        projectedStd: Math.round(dist.std * 100) / 100,
        rawProbability: Math.round(best.rawProb * 10000) / 10000,
        calibratedProbability: best.calProb,
        marketOdds: null,
        impliedProbability: null,
        expectedValue: null, // Strictly NEVER compute EV without a real bookmaker price
        isModelLine: true,
        priceSource: MODEL_LINE_PRICE_LABEL,
        tier: tierInfo.tier,
        modelConfidence: tierInfo.modelConfidence,
        qualificationStatus: tierInfo.qualificationStatus,
        passedBaselineGate: best.passedBaseline,
        isTopPick: false,
        evidenceLine: buildEvidenceLine(
          projection,
          homeName,
          awayName,
          slot.category,
          slot.side,
          best.line,
          dist.mean,
          best.isOver,
          null
        ),
        abstainReason: null,
      });
    }
  }

  // Sort picks: priced HIGH -> HIGH -> MEDIUM -> SPECULATIVE, then calibratedProbability DESC
  const tierRank = (t: BasketballPickTier) =>
    t === 'HIGH' ? 3 : t === 'MEDIUM' ? 2 : t === 'SPECULATIVE' ? 1 : 0;

  picks.sort((a, b) => {
    const tr = tierRank(b.tier) - tierRank(a.tier);
    if (tr !== 0) return tr;
    if (a.expectedValue !== null && b.expectedValue !== null) {
      if (Math.abs(b.expectedValue - a.expectedValue) > 0.02) {
        return b.expectedValue - a.expectedValue;
      }
    }
    return b.calibratedProbability - a.calibratedProbability;
  });

  // Top pick must pass baseline gate (if all fail baseline or are ABSTAIN, no promoted top pick)
  const eligibleTop = picks.find((p) => p.passedBaselineGate && (p.tier === 'HIGH' || p.tier === 'MEDIUM')) || null;
  if (eligibleTop) {
    eligibleTop.isTopPick = true;
  }

  return {
    gameId,
    league,
    projection,
    needsHistory: false,
    abstentionReason: null,
    topPick: eligibleTop,
    picks,
  };
}

/**
 * Enforces max 40% of the slate's top picks in any single market category.
 */
export function selectDiversifiedBasketballSlatePicks(
  evaluations: BasketballGameEvaluation[],
  maxCategoryShare: number = 0.40
): BasketballGameEvaluation[] {
  const withTop = evaluations.filter((e) => e.topPick !== null && e.picks.length > 0);
  if (withTop.length <= 2) return evaluations;

  const maxPerCategory = Math.max(1, Math.floor(withTop.length * maxCategoryShare));
  const counts = new Map<BasketballMarketCategory, number>();

  for (const ev of withTop) {
    if (!ev.topPick) continue;
    counts.set(ev.topPick.marketCategory, (counts.get(ev.topPick.marketCategory) || 0) + 1);
  }

  // Reset top picks cleanly and re-assign respecting cap
  const cloned = evaluations.map((e) => ({
    ...e,
    picks: e.picks.map((p) => ({ ...p, isTopPick: false })),
    topPick: null as BasketballPickCandidate | null,
  }));

  const activeCounts = new Map<BasketballMarketCategory, number>();
  // Sort evaluations by strongest candidate first so best edges keep priority
  const rankedIndices = cloned
    .map((ev, idx) => ({
      idx,
      bestProb: ev.picks.find((p) => p.passedBaselineGate && (p.tier === 'HIGH' || p.tier === 'MEDIUM'))?.calibratedProbability || 0,
    }))
    .filter((x) => x.bestProb > 0)
    .sort((a, b) => b.bestProb - a.bestProb)
    .map((x) => x.idx);

  for (const idx of rankedIndices) {
    const ev = cloned[idx];
    const eligible = ev.picks.filter(
      (p) => p.passedBaselineGate && (p.tier === 'HIGH' || p.tier === 'MEDIUM')
    );
    if (eligible.length === 0) continue;

    // Try best candidate that does not violate the 40% category cap
    let chosen = eligible.find(
      (p) => (activeCounts.get(p.marketCategory) || 0) < maxPerCategory
    );
    // If all categories for this game would hit cap (rare small slate), fallback to lowest-count category
    if (!chosen) {
      chosen = [...eligible].sort(
        (a, b) =>
          (activeCounts.get(a.marketCategory) || 0) - (activeCounts.get(b.marketCategory) || 0) ||
          b.calibratedProbability - a.calibratedProbability
      )[0];
    }

    if (chosen) {
      chosen.isTopPick = true;
      ev.topPick = chosen;
      activeCounts.set(chosen.marketCategory, (activeCounts.get(chosen.marketCategory) || 0) + 1);
    }
  }

  return cloned;
}

export function getAuthorizedBasketballMarketsCount(): number {
  return BASKETBALL_AUTHORIZED_MARKETS.length;
}
