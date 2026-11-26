// CALIBRALL: Deterministic Template-Based Written Match Explanations
// Builds 2 to 4 sentence explanations strictly from real model numbers at pick generation time.
// Zero LLM calls, zero invented facts, zero hyphens/underscores in user-facing output.

import {
  Fixture,
  FixtureContext,
  MarketPrediction,
  WrittenMatchAlternate,
  WrittenMatchExplanation,
} from '@/types';
import { cleanDisplayText, displayName } from '@/lib/utils/formatText';
import type { BasketballGameEvaluation, BasketballPickCandidate } from '@/lib/basketball/picker';

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
    if (!Number.isFinite(p.modelProbability) || p.modelProbability <= 0) continue;

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

  const homeSamples =
    context?.homeSampleMatches ??
    fixture.homeTeam?.storedMatchCount ??
    fixture.serverStats?.homeSampleMatches ??
    context?.sampleSizeMatches ??
    0;
  const awaySamples =
    context?.awaySampleMatches ??
    fixture.awayTeam?.storedMatchCount ??
    fixture.serverStats?.awaySampleMatches ??
    context?.sampleSizeMatches ??
    0;

  const isThinHistory =
    Boolean(fixture.insufficientData) ||
    Boolean(context?.insufficientData) ||
    homeSamples < 10 ||
    awaySamples < 10;

  const homeXg = context?.homeXg ?? fixture.serverStats?.homeXg ?? 0;
  const awayXg = context?.awayXg ?? fixture.serverStats?.awayXg ?? 0;
  const totalXg = Number((homeXg + awayXg).toFixed(2));
  const homeAvgScored = context?.homeAvgScored ?? fixture.serverStats?.homeAvgScored;
  const homeAvgConceded = context?.homeAvgConceded ?? fixture.serverStats?.homeAvgConceded;
  const awayAvgScored = context?.awayAvgScored ?? fixture.serverStats?.awayAvgScored;
  const awayAvgConceded = context?.awayAvgConceded ?? fixture.serverStats?.awayAvgConceded;
  const h2hMeetingsCount = context?.h2hMeetingsCount ?? fixture.serverStats?.h2hMeetingsCount ?? 0;
  const h2hAvgTotalGoals = context?.h2hAvgTotalGoals ?? fixture.serverStats?.h2hAvgTotalGoals;

  if (isThinHistory) {
    const s1 = cleanDisplayText(
      `Not enough history to recommend a market for ${home} vs ${away}: ${home} has ${homeSamples} stored matches and ${away} has ${awaySamples} stored matches.`
    );
    const s2 = cleanDisplayText(
      `At least 10 recent verified matches per club are required before publishing a calibrated recommendation or probability range.`
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
        reason: cleanDisplayText(evaluation.noRecommendationReason || context?.noRecommendationReason || 'Insufficient match history'),
      },
      alternates: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const topPick = evaluation.topPick;
  const alternates = selectTopFootballAlternates(evaluation.predictions || [], topPick);

  let sentence1 = '';
  if (topPick) {
    sentence1 = cleanDisplayText(
      `Model recommends ${cleanDisplayText(topPick.selection)} at ${pct(topPick.modelProbability)} (${tierToDisplayLabel(topPick.confidenceTier)} confidence).`
    );
  } else {
    sentence1 = cleanDisplayText(
      `No qualified pick for ${home} vs ${away} because evaluated lines stayed below probability and edge thresholds.`
    );
  }

  let sentence2 = '';
  if (
    homeAvgScored !== undefined &&
    homeAvgConceded !== undefined &&
    awayAvgScored !== undefined &&
    awayAvgConceded !== undefined
  ) {
    sentence2 = cleanDisplayText(
      `${home} averages ${homeAvgScored.toFixed(1)} scored and ${homeAvgConceded.toFixed(1)} conceded (${homeXg.toFixed(2)} xG) while ${away} averages ${awayAvgScored.toFixed(1)} scored and ${awayAvgConceded.toFixed(1)} conceded (${awayXg.toFixed(2)} xG, ${totalXg.toFixed(2)} total xG).`
    );
  } else {
    sentence2 = cleanDisplayText(
      `Dixon Coles projections put expected goals at ${homeXg.toFixed(2)} for ${home} and ${awayXg.toFixed(2)} for ${away} (${totalXg.toFixed(2)} combined xG).`
    );
  }

  if (h2hMeetingsCount > 0 && h2hAvgTotalGoals !== undefined) {
    sentence2 += ` ${cleanDisplayText(`Across ${h2hMeetingsCount} head to head meetings, matches averaged ${h2hAvgTotalGoals.toFixed(2)} total goals.`)}`;
  }

  if (topPick?.multiGoalsMeta?.last10Hits !== undefined && topPick.multiGoalsMeta.last10Total) {
    sentence2 += ` ${cleanDisplayText(`Both clubs landed in ${topPick.multiGoalsMeta.band} goals in ${topPick.multiGoalsMeta.last10Hits} of ${topPick.multiGoalsMeta.last10Total} recent matches.`)}`;
  }

  const contextDrivers: string[] = [];
  if (
    context?.refereeAnnounced &&
    context.referee &&
    context.refereeShrunkRate !== undefined &&
    context.refereeLeagueBaseline !== undefined
  ) {
    contextDrivers.push(
      `Referee ${cleanDisplayText(context.referee)} averages ${context.refereeShrunkRate.toFixed(2)} shrunk cards vs ${context.refereeLeagueBaseline.toFixed(2)} league baseline.`
    );
  }
  if (context?.isDerby) {
    contextDrivers.push('Fixture carries derby rivalry intensity.');
  }

  let sentence3 = '';
  if (topPick) {
    const lineupText = context?.lineupConfirmed ? 'confirmed team news' : 'pre lineup projections';
    if (topPick.marketOdds && topPick.marketOdds > 1 && topPick.expectedValue !== undefined && topPick.expectedValue !== null) {
      const evPct = (topPick.expectedValue * 100).toFixed(1);
      const evSign = topPick.expectedValue >= 0 ? '+' : '\u2212';
      sentence3 = cleanDisplayText(
        `Backed by ${topPick.marketOdds.toFixed(2)} market odds (${evSign}${Math.abs(Number(evPct)).toFixed(1)}% EV) on ${lineupText}.`
      );
    } else {
      sentence3 = cleanDisplayText(`Model line, no market price published; evaluated on ${lineupText}.`);
    }
    if (topPick.multiGoalsMeta) {
      sentence3 += ` ${cleanDisplayText(`Selected band ${topPick.multiGoalsMeta.band} keeps range width at ${topPick.multiGoalsMeta.span} around ${topPick.multiGoalsMeta.expectedTotalGoals.toFixed(2)} expected goals.`)}`;
    }
  } else {
    sentence3 = cleanDisplayText(
      evaluation.noRecommendationReason || 'Market edge and data uncertainty checks kept this fixture in abstain mode.'
    );
  }

  const parts = [sentence1, sentence2, ...contextDrivers.map(cleanDisplayText), sentence3].filter(Boolean);
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
      homeXg: Number(homeXg.toFixed(2)),
      awayXg: Number(awayXg.toFixed(2)),
      totalXg,
      homeAvgScored: homeAvgScored ?? null,
      homeAvgConceded: homeAvgConceded ?? null,
      awayAvgScored: awayAvgScored ?? null,
      awayAvgConceded: awayAvgConceded ?? null,
      h2hMeetingsCount,
      h2hAvgTotalGoals: h2hAvgTotalGoals ?? null,
      referee: context?.refereeAnnounced ? cleanDisplayText(context.referee) : null,
      refereeShrunkRate: context?.refereeAnnounced ? context.refereeShrunkRate ?? null : null,
      refereeLeagueBaseline: context?.refereeAnnounced ? context.refereeLeagueBaseline ?? null : null,
      isDerby: Boolean(context?.isDerby),
      lineupConfirmed: Boolean(context?.lineupConfirmed),
      topPick: topPick
        ? {
            marketCode: topPick.marketCode,
            selection: cleanDisplayText(topPick.selection),
            probability: Number(topPick.modelProbability.toFixed(4)),
            confidenceTier: topPick.confidenceTier,
            priceSource: cleanDisplayText(topPick.priceSource || (topPick.marketOdds ? 'Verified Odds' : 'Model line, no market price')),
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

  if (evaluation.needsHistory) {
    const s1 = cleanDisplayText(
      `Not enough history to recommend a pick for ${home} vs ${away}: ${home} has ${proj.homeGamesPlayed} stored games and ${away} has ${proj.awayGamesPlayed} stored games.`
    );
    const s2 = cleanDisplayText(
      evaluation.abstentionReason || 'Additional verified season games are needed before publishing calibrated totals.'
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
        homeGamesPlayed: proj.homeGamesPlayed,
        awayGamesPlayed: proj.awayGamesPlayed,
        reason: s2,
      },
      alternates: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const topPick = evaluation.topPick;
  const alternates = selectTopBasketballAlternates(evaluation.picks || [], topPick);

  const sentence1 = topPick
    ? cleanDisplayText(
        `Model recommends ${cleanDisplayText(topPick.selection)} at ${pct(topPick.calibratedProbability)} (${tierToDisplayLabel(topPick.tier)} confidence).`
      )
    : cleanDisplayText(
        `No qualified pick for ${home} vs ${away}: calibrated totals sit too close to available lines.`
      );

  const sentence2 = cleanDisplayText(
    `Model projects ${home} ${proj.homeMean.toFixed(1)} pts and ${away} ${proj.awayMean.toFixed(1)} pts (${proj.gameTotalMean.toFixed(1)} total pts, std ${proj.gameTotalStd.toFixed(1)}), with ${home} averaging ${proj.homeAvgScored.toFixed(1)} scored vs ${away} allowing ${proj.awayAvgAllowed.toFixed(1)}.`
  );

  let restNote = '';
  if (proj.homeIsB2B && proj.awayIsB2B) {
    restNote = `Both ${home} and ${away} play on zero days rest in a back to back spot.`;
  } else if (proj.homeIsB2B) {
    restNote = `${home} plays on a back to back (${proj.homeRestDays ?? 0} rest days vs ${proj.awayRestDays ?? 'N/A'} for ${away}).`;
  } else if (proj.awayIsB2B) {
    restNote = `${away} plays on a back to back (${proj.awayRestDays ?? 0} rest days vs ${proj.homeRestDays ?? 'N/A'} for ${home}).`;
  } else {
    restNote = `Rest stands at ${proj.homeRestDays ?? 'N/A'} days for ${home} and ${proj.awayRestDays ?? 'N/A'} days for ${away}.`;
  }

  let marketNote = '';
  if (topPick && !topPick.isModelLine && topPick.marketOdds) {
    const evPart =
      topPick.expectedValue !== null && topPick.expectedValue !== undefined
        ? ` (${topPick.expectedValue >= 0 ? '+' : '\u2212'}${Math.abs(topPick.expectedValue * 100).toFixed(1)}% EV)`
        : '';
    marketNote = `Compared against ${cleanDisplayText(topPick.priceSource)} line ${topPick.line.toFixed(1)} at ${topPick.marketOdds.toFixed(2)} odds${evPart}.`;
  } else if (fixture.basketballStats?.sportsbookTotal !== undefined) {
    marketNote = `Model line, no market price published; projection sits vs ${fixture.basketballStats.sportsbookTotal.toFixed(1)} posted total.`;
  } else if (topPick) {
    marketNote = `Model line, no market price published at ${topPick.line.toFixed(1)} pts.`;
  } else if (evaluation.abstentionReason) {
    marketNote = cleanDisplayText(evaluation.abstentionReason);
  }

  const fullSummary = [sentence1, sentence2, cleanDisplayText(restNote), cleanDisplayText(marketNote)]
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
      homeGamesPlayed: proj.homeGamesPlayed,
      awayGamesPlayed: proj.awayGamesPlayed,
      homeProjected: Number(proj.homeMean.toFixed(1)),
      awayProjected: Number(proj.awayMean.toFixed(1)),
      projectedTotal: Number(proj.gameTotalMean.toFixed(1)),
      projectedTotalStd: Number(proj.gameTotalStd.toFixed(1)),
      homeAvgScored: Number(proj.homeAvgScored.toFixed(1)),
      awayAvgAllowed: Number(proj.awayAvgAllowed.toFixed(1)),
      homeRestDays: proj.homeRestDays,
      awayRestDays: proj.awayRestDays,
      homeIsB2B: proj.homeIsB2B,
      awayIsB2B: proj.awayIsB2B,
      sportsbookTotal: fixture.basketballStats?.sportsbookTotal ?? null,
      topPick: topPick
        ? {
            marketCode: topPick.marketCode,
            selection: cleanDisplayText(topPick.selection),
            line: topPick.line,
            probability: Number(topPick.calibratedProbability.toFixed(4)),
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
