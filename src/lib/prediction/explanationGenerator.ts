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

  const stateTags = context?.stateTags || [];
  const hasScheduleCongestion =
    stateTags.includes('fixture-congested') || stateTags.includes('high-fatigue');
  const hasKeyAbsences = stateTags.includes('key-absences');
  const isLowScoringTendency = totalXg > 0 && totalXg < 2.2;
  const isModerateSample = homeSamples < 15 || awaySamples < 15;

  const contextDrivers: string[] = [];
  if (
    context?.refereeAnnounced &&
    context.referee &&
    context.refereeShrunkRate !== undefined &&
    context.refereeLeagueBaseline !== undefined
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
  if (isLowScoringTendency) {
    contextDrivers.push(`low scoring projection (${totalXg.toFixed(2)} combined xG)`);
  }
  if (isModerateSample) {
    contextDrivers.push(`moderate sample depth (${homeSamples} vs ${awaySamples} matches)`);
  }

  let sentence3Context = '';
  if (contextDrivers.length > 0) {
    const joined = contextDrivers.slice(0, 3).join('; ');
    sentence3Context = cleanDisplayText(`${joined.charAt(0).toUpperCase() + joined.slice(1)}.`);
  }

  let sentence4Market = '';
  if (topPick) {
    const lineupText = context?.lineupConfirmed ? 'confirmed team news' : 'pre lineup projections';
    if (topPick.marketOdds && topPick.marketOdds > 1 && topPick.expectedValue !== undefined && topPick.expectedValue !== null) {
      const evPct = (topPick.expectedValue * 100).toFixed(1);
      const evSign = topPick.expectedValue >= 0 ? '+' : '\u2212';
      sentence4Market = cleanDisplayText(
        `Backed by ${topPick.marketOdds.toFixed(2)} market odds (${evSign}${Math.abs(Number(evPct)).toFixed(1)}% EV) on ${lineupText}.`
      );
    } else {
      sentence4Market = cleanDisplayText(`Model line, no market price published; evaluated on ${lineupText}.`);
    }
    if (topPick.multiGoalsMeta) {
      sentence4Market += ` ${cleanDisplayText(`Selected band ${topPick.multiGoalsMeta.band} keeps range width at ${topPick.multiGoalsMeta.span} around ${topPick.multiGoalsMeta.expectedTotalGoals.toFixed(2)} expected goals.`)}`;
    } else if (!sentence3Context && topPick.evidence?.whyLineChosen) {
      const ladderSnippet = cleanDisplayText(topPick.evidence.whyLineChosen).split('.')[0]?.trim();
      if (ladderSnippet) {
        sentence4Market = `${sentence4Market} ${ladderSnippet}.`;
      }
    }
  } else {
    sentence4Market = cleanDisplayText(
      evaluation.noRecommendationReason || 'Market edge and data uncertainty checks kept this fixture in abstain mode.'
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
      stateTags,
      lowScoringTendency: isLowScoringTendency,
      moderateSampleRisk: isModerateSample,
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

  const paceDeltaStr =
    proj.paceAdjustment >= 0
      ? `+${proj.paceAdjustment.toFixed(1)}`
      : `\u2212${Math.abs(proj.paceAdjustment).toFixed(1)}`;
  const paceSummary =
    Math.abs(proj.paceAdjustment) >= 0.3
      ? `pace matchup shifts total by ${paceDeltaStr} pts`
      : `neutral pace matchup (${paceDeltaStr} pts)`;

  let restSummary = '';
  if (proj.homeIsB2B && proj.awayIsB2B) {
    restSummary = `both teams play on zero days rest in a back to back spot`;
  } else if (proj.homeIsB2B) {
    restSummary = `${home} plays on a back to back (${proj.homeRestDays ?? 0}d rest vs ${proj.awayRestDays ?? 'N/A'}d for ${away})`;
  } else if (proj.awayIsB2B) {
    restSummary = `${away} plays on a back to back (${proj.awayRestDays ?? 0}d rest vs ${proj.homeRestDays ?? 'N/A'}d for ${home})`;
  } else {
    restSummary = `rest stands at ${proj.homeRestDays ?? 'N/A'} days for ${home} and ${proj.awayRestDays ?? 'N/A'} days for ${away}`;
  }

  const thinSampleNote =
    proj.homeGamesPlayed < 10 || proj.awayGamesPlayed < 10
      ? `; early sample risk (${proj.homeGamesPlayed} vs ${proj.awayGamesPlayed} games)`
      : '';
  const contextSentence = cleanDisplayText(
    `${paceSummary.charAt(0).toUpperCase() + paceSummary.slice(1)} and ${restSummary}${thinSampleNote}.`
  );

  let marketNote = '';
  if (topPick && !topPick.isModelLine && topPick.marketOdds) {
    const evPart =
      topPick.expectedValue !== null && topPick.expectedValue !== undefined
        ? ` (${topPick.expectedValue >= 0 ? '+' : '\u2212'}${Math.abs(topPick.expectedValue * 100).toFixed(1)}% EV)`
        : '';
    marketNote = `Model projects ${topPick.projectedMean.toFixed(1)} vs ${cleanDisplayText(topPick.priceSource)} line ${topPick.line.toFixed(1)} (game total ${proj.gameTotalMean.toFixed(1)}) at ${topPick.marketOdds.toFixed(2)} odds${evPart}.`;
  } else if (fixture.basketballStats?.sportsbookTotal !== undefined) {
    marketNote = `Model total ${proj.gameTotalMean.toFixed(1)} pts vs ${fixture.basketballStats.sportsbookTotal.toFixed(1)} posted total; model line, no market price published.`;
  } else if (topPick) {
    marketNote = `Model projects ${topPick.projectedMean.toFixed(1)} vs ${topPick.line.toFixed(1)} line (game total ${proj.gameTotalMean.toFixed(1)} pts); model line, no market price published.`;
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
      homeGamesPlayed: proj.homeGamesPlayed,
      awayGamesPlayed: proj.awayGamesPlayed,
      homeProjected: Number(proj.homeMean.toFixed(1)),
      awayProjected: Number(proj.awayMean.toFixed(1)),
      projectedTotal: Number(proj.gameTotalMean.toFixed(1)),
      projectedTotalStd: Number(proj.gameTotalStd.toFixed(1)),
      homeAvgScored: Number(proj.homeAvgScored.toFixed(1)),
      awayAvgAllowed: Number(proj.awayAvgAllowed.toFixed(1)),
      homePaceDelta: Number(proj.homePaceDelta.toFixed(2)),
      awayPaceDelta: Number(proj.awayPaceDelta.toFixed(2)),
      paceAdjustment: Number(proj.paceAdjustment.toFixed(2)),
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
