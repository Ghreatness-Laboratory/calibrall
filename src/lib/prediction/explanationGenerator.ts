// CALIBRALL: Deterministic Template-Based Written Match Explanations
// Builds 2 to 4 sentence explanations strictly from real model numbers at pick generation time.
// Zero LLM calls, zero invented facts, zero hyphens/underscores in user-facing output.
// If any numeric input is missing or non-finite, omit that clause/sentence rather than inventing a fallback number.

import {
  Fixture,
  FixtureContext,
  MarketPrediction,
  WrittenMatchAlternate,
  WrittenMatchExplanation,
} from '@/types';
import { cleanDisplayText, displayName } from '@/lib/utils/formatText';
import type { BasketballGameEvaluation, BasketballPickCandidate } from '@/lib/basketball/picker';

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function tierToDisplayLabel(tier?: string | null): string {
  const upper = String(tier || '').toUpperCase();
  if (upper === 'HIGH') return 'High';
  if (upper === 'MEDIUM') return 'Medium';
  if (upper === 'SPECULATIVE' || upper === 'LOW') return 'Low';
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

export function selectTopFootballAlternates(
  predictions: MarketPrediction[],
  topPick: MarketPrediction | null
): WrittenMatchAlternate[] {
  const seenCodes = new Set<string>();
  const seenSelections = new Set<string>();
  if (topPick) {
    seenCodes.add(topPick.marketCode);
    seenSelections.add(cleanDisplayText(topPick.selection).toLowerCase());
  }

  const sorted = [...predictions].sort((a, b) => {
    const valDiff = (b.isValidated ? 1 : 0) - (a.isValidated ? 1 : 0);
    if (valDiff !== 0) return valDiff;
    const rankDiff = (b.rankingScore ?? 0) - (a.rankingScore ?? 0);
    if (Math.abs(rankDiff) > 0.001) return rankDiff;
    return b.modelProbability - a.modelProbability;
  });

  const out: WrittenMatchAlternate[] = [];
  for (const p of sorted) {
    if (out.length >= 2) break;
    if (seenCodes.has(p.marketCode)) continue;
    const selClean = cleanDisplayText(p.selection);
    if (seenSelections.has(selClean.toLowerCase())) continue;
    if (!isFiniteNum(p.modelProbability) || p.modelProbability <= 0) continue;

    seenCodes.add(p.marketCode);
    seenSelections.add(selClean.toLowerCase());
    out.push({
      marketCode: p.marketCode,
      marketName: cleanDisplayText(p.marketName),
      selection: selClean,
      probability: Number(p.modelProbability.toFixed(4)),
      confidenceTier: p.confidenceTier,
    });
  }
  return out;
}

export function generateFootballExplanation(params: {
  fixture: Fixture;
  evaluation: {
    topPick: MarketPrediction | null;
    predictions: MarketPrediction[];
    noRecommendationReason?: string;
  };
  context?: FixtureContext;
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

  const rawHomeXg = context?.homeXg ?? fixture.serverStats?.homeXg;
  const rawAwayXg = context?.awayXg ?? fixture.serverStats?.awayXg;
  const hasXg = isFiniteNum(rawHomeXg) && isFiniteNum(rawAwayXg);
  const homeXg = hasXg ? rawHomeXg : null;
  const awayXg = hasXg ? rawAwayXg : null;
  const totalXg = homeXg !== null && awayXg !== null ? Number((homeXg + awayXg).toFixed(2)) : null;

  const rawHomeAvgScored = context?.homeAvgScored ?? fixture.serverStats?.homeAvgScored;
  const rawHomeAvgConceded = context?.homeAvgConceded ?? fixture.serverStats?.homeAvgConceded;
  const rawAwayAvgScored = context?.awayAvgScored ?? fixture.serverStats?.awayAvgScored;
  const rawAwayAvgConceded = context?.awayAvgConceded ?? fixture.serverStats?.awayAvgConceded;
  const hasTeamAverages =
    isFiniteNum(rawHomeAvgScored) &&
    isFiniteNum(rawHomeAvgConceded) &&
    isFiniteNum(rawAwayAvgScored) &&
    isFiniteNum(rawAwayAvgConceded);

  const rawH2hCount = context?.h2hMeetingsCount ?? fixture.serverStats?.h2hMeetingsCount;
  const rawH2hAvg = context?.h2hAvgTotalGoals ?? fixture.serverStats?.h2hAvgTotalGoals;
  const h2hMeetingsCount = isFiniteNum(rawH2hCount) ? rawH2hCount : 0;
  const h2hAvgTotalGoals = isFiniteNum(rawH2hAvg) ? rawH2hAvg : null;

  if (isThinHistory) {
    const sampleClause =
      homeSamples !== null && awaySamples !== null
        ? `: ${home} has ${homeSamples} stored matches and ${away} has ${awaySamples} stored matches`
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
    return {
      oneLineSummary: s1,
      fullSummary,
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
  const alternates = selectTopFootballAlternates(evaluation.predictions || [], topPick);

  let sentence1 = '';
  if (topPick && isFiniteNum(topPick.modelProbability)) {
    sentence1 = cleanDisplayText(
      `Model recommends ${cleanDisplayText(topPick.selection)} at ${pct(topPick.modelProbability)} (${tierToDisplayLabel(topPick.confidenceTier)} confidence).`
    );
  } else {
    sentence1 = cleanDisplayText(
      `No qualified pick for ${home} vs ${away} because evaluated lines stayed below probability and edge thresholds.`
    );
  }

  const isCornerPick = Boolean(
    topPick &&
      (topPick.optionType === 'corners' ||
        topPick.optionType === 'corner_handicap' ||
        topPick.marketCategory === 'total_corners' ||
        topPick.marketCategory === 'team_corners')
  );
  const isCardsPick = Boolean(
    topPick &&
      (topPick.optionType === 'bookings' ||
        topPick.optionType === 'team_bookings' ||
        topPick.optionType === 'booking_points' ||
        topPick.marketCategory === 'bookings')
  );

  const expCornersHome = isFiniteNum(context?.expectedCornersHome) ? context.expectedCornersHome : null;
  const expCornersAway = isFiniteNum(context?.expectedCornersAway) ? context.expectedCornersAway : null;
  const expCards = isFiniteNum(context?.expectedCards) ? context.expectedCards : null;

  let sentence2Body = '';
  if (isCornerPick && expCornersHome !== null && expCornersAway !== null) {
    const totalCornersProj = expCornersHome + expCornersAway;
    const cornerAvgParts: string[] = [];
    if (isFiniteNum(context?.homeCornerForRating)) {
      cornerAvgParts.push(`${home} winning ${context.homeCornerForRating.toFixed(1)} corners per match`);
    }
    if (isFiniteNum(context?.awayCornerForRating)) {
      cornerAvgParts.push(`${away} winning ${context.awayCornerForRating.toFixed(1)}`);
    }
    const avgClause = cornerAvgParts.length > 0 ? `, with ${cornerAvgParts.join(' and ')}` : '';
    sentence2Body = `Model projects ${expCornersHome.toFixed(1)} corners for ${home} and ${expCornersAway.toFixed(1)} for ${away} (${totalCornersProj.toFixed(1)} total corners)${avgClause}`;
  } else if (isCardsPick && expCards !== null) {
    const teamCardParts: string[] = [];
    if (isFiniteNum(context?.homeCardForRating)) {
      teamCardParts.push(`${home} averages ${context.homeCardForRating.toFixed(2)} cards`);
    }
    if (isFiniteNum(context?.awayCardForRating)) {
      teamCardParts.push(`${away} averages ${context.awayCardForRating.toFixed(2)}`);
    }
    const teamClause = teamCardParts.length > 0 ? `, as ${teamCardParts.join(' and ')}` : '';
    sentence2Body = `Model projects ${expCards.toFixed(1)} total cards${teamClause}`;
  } else if (hasTeamAverages) {
    const xgHomeClause = homeXg !== null ? ` (${homeXg.toFixed(2)} xG)` : '';
    const xgAwayClause =
      awayXg !== null && totalXg !== null
        ? ` (${awayXg.toFixed(2)} xG, ${totalXg.toFixed(2)} total xG)`
        : '';
    sentence2Body = `${home} averages ${rawHomeAvgScored.toFixed(1)} scored and ${rawHomeAvgConceded.toFixed(1)} conceded${xgHomeClause} while ${away} averages ${rawAwayAvgScored.toFixed(1)} scored and ${rawAwayAvgConceded.toFixed(1)} conceded${xgAwayClause}`;
  } else if (homeXg !== null && awayXg !== null && totalXg !== null) {
    sentence2Body = `Dixon Coles projections put expected goals at ${homeXg.toFixed(2)} for ${home} and ${awayXg.toFixed(2)} for ${away} (${totalXg.toFixed(2)} combined xG)`;
  }

  if (h2hMeetingsCount > 0 && h2hAvgTotalGoals !== null) {
    if (sentence2Body) {
      sentence2Body += `; ${h2hMeetingsCount} head to head meetings averaged ${h2hAvgTotalGoals.toFixed(2)} total goals`;
    } else {
      sentence2Body = `Across ${h2hMeetingsCount} head to head meetings, matches averaged ${h2hAvgTotalGoals.toFixed(2)} total goals`;
    }
  }

  if (
    topPick?.multiGoalsMeta &&
    isFiniteNum(topPick.multiGoalsMeta.last10Hits) &&
    isFiniteNum(topPick.multiGoalsMeta.last10Total) &&
    topPick.multiGoalsMeta.last10Total > 0
  ) {
    if (sentence2Body) {
      sentence2Body += `; recent matches landed in ${topPick.multiGoalsMeta.band} goals in ${topPick.multiGoalsMeta.last10Hits} of ${topPick.multiGoalsMeta.last10Total}`;
    } else {
      sentence2Body = `Recent matches landed in ${topPick.multiGoalsMeta.band} goals in ${topPick.multiGoalsMeta.last10Hits} of ${topPick.multiGoalsMeta.last10Total}`;
    }
  }

  const sentence2 = sentence2Body ? cleanDisplayText(`${sentence2Body}.`) : '';

  const stateTags = context?.stateTags || [];
  const hasScheduleCongestion =
    stateTags.includes('fixture-congested') || stateTags.includes('high-fatigue');
  const hasKeyAbsences = stateTags.includes('key-absences');
  const isLowScoringTendency = totalXg !== null && totalXg > 0 && totalXg < 2.2;
  const isModerateSample =
    homeSamples !== null && awaySamples !== null && (homeSamples < 15 || awaySamples < 15);

  const contextDrivers: string[] = [];
  if (
    context?.refereeAnnounced &&
    context.referee &&
    isFiniteNum(context.refereeShrunkRate) &&
    isFiniteNum(context.refereeLeagueBaseline)
  ) {
    contextDrivers.push(
      `referee ${cleanDisplayText(context.referee)} averages ${context.refereeShrunkRate.toFixed(2)} cards vs ${context.refereeLeagueBaseline.toFixed(2)} league baseline`
    );
  }
  if (context?.isDerby) {
    contextDrivers.push('derby rivalry intensity applies');
  }
  if (context?.factors?.schedule_fatigue?.isMeasured && context.factors.schedule_fatigue.description) {
    contextDrivers.push(cleanDisplayText(context.factors.schedule_fatigue.description).replace(/\.$/, ''));
  } else if (hasScheduleCongestion) {
    contextDrivers.push('fixture congestion raises rotation risk');
  }
  if (hasKeyAbsences) {
    contextDrivers.push('squad absences weigh on attacking output');
  }
  if (isLowScoringTendency && totalXg !== null) {
    contextDrivers.push(`low scoring projection (${totalXg.toFixed(2)} combined xG)`);
  }
  if (isModerateSample && homeSamples !== null && awaySamples !== null) {
    contextDrivers.push(`moderate sample depth (${homeSamples} vs ${awaySamples} matches)`);
  }

  let sentence3Context = '';
  if (contextDrivers.length > 0) {
    const joined = contextDrivers.slice(0, 3).join('; ');
    sentence3Context = cleanDisplayText(`${joined.charAt(0).toUpperCase() + joined.slice(1)}.`);
  }

  let sentence4Market = '';
  if (topPick) {
    const lineupKnown = context?.lineupConfirmed !== undefined;
    const lineupClause = lineupKnown
      ? context.lineupConfirmed
        ? ' on confirmed team news'
        : ' on pre lineup projections'
      : '';
    let marketBody = '';
    if (isFiniteNum(topPick.marketOdds) && topPick.marketOdds > 1 && isFiniteNum(topPick.expectedValue)) {
      const evPct = (topPick.expectedValue * 100).toFixed(1);
      const evSign = topPick.expectedValue >= 0 ? '+' : '\u2212';
      marketBody = `Backed by ${topPick.marketOdds.toFixed(2)} market odds (${evSign}${Math.abs(Number(evPct)).toFixed(1)}% EV)${lineupClause}`;
    } else {
      marketBody = `Model line, no market price published${lineupClause ? ` (${lineupClause.trim()})` : ''}`;
    }

    if (
      topPick.multiGoalsMeta &&
      isFiniteNum(topPick.multiGoalsMeta.span) &&
      isFiniteNum(topPick.multiGoalsMeta.expectedTotalGoals)
    ) {
      marketBody += `; selected band ${topPick.multiGoalsMeta.band} keeps range width at ${topPick.multiGoalsMeta.span} around ${topPick.multiGoalsMeta.expectedTotalGoals.toFixed(2)} expected goals`;
    } else if (!sentence3Context && topPick.evidence?.whyLineChosen) {
      const ladderSnippet = cleanDisplayText(topPick.evidence.whyLineChosen).split('.')[0]?.trim();
      if (ladderSnippet) {
        marketBody += `; ${ladderSnippet.charAt(0).toLowerCase() + ladderSnippet.slice(1)}`;
      }
    }
    sentence4Market = cleanDisplayText(`${marketBody}.`);
  } else {
    sentence4Market = cleanDisplayText(
      evaluation.noRecommendationReason ||
        'Market edge and data uncertainty checks kept this fixture in abstain mode.'
    );
  }

  const parts = [sentence1, sentence2, sentence3Context, sentence4Market].filter(Boolean);
  const fullSummary = parts.slice(0, 4).join(' ');

  return {
    oneLineSummary: splitFirstSentence(sentence1) || sentence1,
    fullSummary,
    reasoning: {
      sport: 'football',
      status: topPick ? 'recommended' : 'abstain',
      homeTeam: home,
      awayTeam: away,
      homeSampleMatches: homeSamples,
      awaySampleMatches: awaySamples,
      homeXg: homeXg !== null ? Number(homeXg.toFixed(2)) : null,
      awayXg: awayXg !== null ? Number(awayXg.toFixed(2)) : null,
      totalXg,
      expectedCornersHome: expCornersHome !== null ? Number(expCornersHome.toFixed(2)) : null,
      expectedCornersAway: expCornersAway !== null ? Number(expCornersAway.toFixed(2)) : null,
      expectedCards: expCards !== null ? Number(expCards.toFixed(2)) : null,
      homeAvgScored: hasTeamAverages ? rawHomeAvgScored : null,
      homeAvgConceded: hasTeamAverages ? rawHomeAvgConceded : null,
      awayAvgScored: hasTeamAverages ? rawAwayAvgScored : null,
      awayAvgConceded: hasTeamAverages ? rawAwayAvgConceded : null,
      h2hMeetingsCount,
      h2hAvgTotalGoals,
      referee: context?.refereeAnnounced && context.referee ? cleanDisplayText(context.referee) : null,
      refereeShrunkRate:
        context?.refereeAnnounced && isFiniteNum(context.refereeShrunkRate)
          ? context.refereeShrunkRate
          : null,
      refereeLeagueBaseline:
        context?.refereeAnnounced && isFiniteNum(context.refereeLeagueBaseline)
          ? context.refereeLeagueBaseline
          : null,
      isDerby: Boolean(context?.isDerby),
      lineupConfirmed: Boolean(context?.lineupConfirmed),
      stateTags,
      lowScoringTendency: isLowScoringTendency,
      moderateSampleRisk: isModerateSample,
      topPick: topPick
        ? {
            marketCode: topPick.marketCode,
            selection: cleanDisplayText(topPick.selection),
            probability: isFiniteNum(topPick.modelProbability)
              ? Number(topPick.modelProbability.toFixed(4))
              : null,
            confidenceTier: topPick.confidenceTier,
            priceSource: cleanDisplayText(
              topPick.priceSource || (topPick.marketOdds ? 'Verified Odds' : 'Model line, no market price')
            ),
            marketOdds: topPick.marketOdds ?? null,
            expectedValue: topPick.expectedValue ?? null,
            multiGoalsMeta: topPick.multiGoalsMeta ?? null,
          }
        : null,
    },
    alternates,
    generatedAt: new Date().toISOString(),
  };
}

export function selectTopBasketballAlternates(
  picks: BasketballPickCandidate[],
  topPick: BasketballPickCandidate | null
): WrittenMatchAlternate[] {
  const seenCodes = new Set<string>();
  const seenSelections = new Set<string>();
  if (topPick) {
    seenCodes.add(topPick.marketCode);
    seenSelections.add(cleanDisplayText(topPick.selection).toLowerCase());
  }

  const sorted = [...picks]
    .filter((p) => p.tier !== 'ABSTAIN')
    .sort((a, b) => {
      const evDiff = (b.expectedValue ?? -1) - (a.expectedValue ?? -1);
      if (b.expectedValue !== null && a.expectedValue !== null && Math.abs(evDiff) > 0.005) {
        return evDiff;
      }
      return b.calibratedProbability - a.calibratedProbability;
    });

  const out: WrittenMatchAlternate[] = [];
  for (const p of sorted) {
    if (out.length >= 2) break;
    if (seenCodes.has(p.marketCode)) continue;
    const selClean = cleanDisplayText(p.selection);
    if (seenSelections.has(selClean.toLowerCase())) continue;
    if (!isFiniteNum(p.calibratedProbability) || p.calibratedProbability <= 0) continue;

    seenCodes.add(p.marketCode);
    seenSelections.add(selClean.toLowerCase());
    out.push({
      marketCode: p.marketCode,
      marketName: cleanDisplayText(p.marketCategory),
      selection: selClean,
      probability: Number(p.calibratedProbability.toFixed(4)),
      confidenceTier: p.tier === 'SPECULATIVE' ? 'LOW' : (p.tier === 'HIGH' ? 'HIGH' : 'MEDIUM'),
    });
  }
  return out;
}

export function generateBasketballExplanation(params: {
  fixture: Fixture;
  evaluation: BasketballGameEvaluation;
}): WrittenMatchExplanation {
  const { fixture, evaluation } = params;
  const home = cleanDisplayText(displayName(fixture.homeTeam) || fixture.homeTeam.name);
  const away = cleanDisplayText(displayName(fixture.awayTeam) || fixture.awayTeam.name);
  const proj = evaluation.projection;

  const homeGames = isFiniteNum(proj?.homeGamesPlayed) ? proj.homeGamesPlayed : null;
  const awayGames = isFiniteNum(proj?.awayGamesPlayed) ? proj.awayGamesPlayed : null;

  if (evaluation.needsHistory) {
    const gamesClause =
      homeGames !== null && awayGames !== null
        ? `: ${home} has ${homeGames} stored games and ${away} has ${awayGames} stored games`
        : '';
    const s1 = cleanDisplayText(
      `Not enough history to recommend a pick for ${home} vs ${away}${gamesClause}.`
    );
    const s2 = cleanDisplayText(
      evaluation.abstentionReason ||
        'Additional verified season games are needed before publishing calibrated totals.'
    );
    return {
      oneLineSummary: s1,
      fullSummary: `${s1} ${s2}`,
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

  const topPick = evaluation.topPick;
  const alternates = selectTopBasketballAlternates(evaluation.picks || [], topPick);

  const sentence1 =
    topPick && isFiniteNum(topPick.calibratedProbability)
      ? cleanDisplayText(
          `Model recommends ${cleanDisplayText(topPick.selection)} at ${pct(topPick.calibratedProbability)} (${tierToDisplayLabel(topPick.tier)} confidence).`
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
      ? `, with ${home} averaging ${proj.homeAvgScored.toFixed(1)} scored vs ${away} allowing ${proj.awayAvgAllowed.toFixed(1)}`
      : '';
    sentence2 = cleanDisplayText(
      `Model projects ${home} ${proj.homeMean.toFixed(1)} pts and ${away} ${proj.awayMean.toFixed(1)} pts (${proj.gameTotalMean.toFixed(1)} total pts${stdClause})${avgClause}.`
    );
  } else if (hasTeamScoring) {
    sentence2 = cleanDisplayText(
      `${home} averages ${proj.homeAvgScored.toFixed(1)} points scored vs ${away} allowing ${proj.awayAvgAllowed.toFixed(1)}.`
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
    const detail = hasBothRest
      ? ` (${proj.homeRestDays}d rest vs ${proj.awayRestDays}d for ${away})`
      : '';
    contextParts.push(`${home} plays on a back to back${detail}`);
  } else if (proj?.awayIsB2B) {
    const detail = hasBothRest
      ? ` (${proj.awayRestDays}d rest vs ${proj.homeRestDays}d for ${home})`
      : '';
    contextParts.push(`${away} plays on a back to back${detail}`);
  } else if (hasBothRest) {
    const homeUnit = proj.homeRestDays === 1 ? 'day' : 'days';
    const awayUnit = proj.awayRestDays === 1 ? 'day' : 'days';
    contextParts.push(
      `rest stands at ${proj.homeRestDays} ${homeUnit} for ${home} and ${proj.awayRestDays} ${awayUnit} for ${away}`
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
    marketNote = `Model projects ${topPick.projectedMean.toFixed(1)} vs ${cleanDisplayText(topPick.priceSource)} line ${topPick.line.toFixed(1)}${gameTotalStr} at ${topPick.marketOdds.toFixed(2)} odds${evPart}.`;
  } else if (hasSportsbookTotal && isFiniteNum(proj?.gameTotalMean)) {
    marketNote = `Model total ${proj.gameTotalMean.toFixed(1)} pts vs ${fixture.basketballStats!.sportsbookTotal!.toFixed(1)} posted total; model line, no market price published.`;
  } else if (topPick && isFiniteNum(topPick.projectedMean) && isFiniteNum(topPick.line)) {
    marketNote = `Model projects ${topPick.projectedMean.toFixed(1)} vs ${topPick.line.toFixed(1)} line${gameTotalStr}; model line, no market price published.`;
  } else if (evaluation.abstentionReason) {
    marketNote = cleanDisplayText(evaluation.abstentionReason);
  }

  const fullSummary = [sentence1, sentence2, contextSentence, cleanDisplayText(marketNote)]
    .filter(Boolean)
    .slice(0, 4)
    .join(' ');

  return {
    oneLineSummary: splitFirstSentence(sentence1) || sentence1,
    fullSummary,
    reasoning: {
      sport: 'basketball',
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
            selection: cleanDisplayText(topPick.selection),
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
}
