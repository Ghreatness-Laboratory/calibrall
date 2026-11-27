import {
  Fixture,
  FixtureContext,
  MarketPrediction,
} from '@/types';
import { getFootballDataProvider } from '@/lib/data/provider';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { matchesStore, StoredOddsSnapshot } from '@/lib/data/matchesStore';
import { evaluateFixtureMarkets, EvaluatedFixtureResult } from '@/lib/prediction/marketSelection';
import { loadFootballPickModerationMap } from '@/lib/prediction/footballPickPersistence';
import {
  generateFootballExplanation,
  generateBasketballExplanation,
} from '@/lib/prediction/explanationGenerator';
import { isTeamNewsEnabled } from '@/lib/prediction/featureFlags';
import { getBasketballFixturesAndEvaluations } from '@/lib/basketball/readService';
import type {
  BasketballGameEvaluation,
  BasketballPickCandidate,
  BbOddsQuote,
} from '@/lib/basketball/picker';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { chunkArray } from '@/lib/supabase/pagination';
import { matchesDayFilter } from '@/lib/utils/dateWindow';
import { cleanDisplayText, displayName } from '@/lib/utils/formatText';
import {
  canonicalizeCompetitionId,
  getFixtureCanonicalCompetitionId,
} from '@/lib/data/competitionSearch';
import { SLIP_BUILDER_GLOBAL_BOUNDS } from '@/lib/tiers';
import { isDisabledRecommendationMarket } from '@/lib/markets';
import { getFlaggedExplanationFixtureIds } from './storage';
import type {
  SlipBookmakerQuote,
  SlipBuildDiagnostics,
  SlipCandidateLeg,
  SlipDayFilter,
  SlipMarketGroupKey,
  SlipOddsBasis,
  SlipSportFilter,
} from './types';

export interface CandidateBuilderInput {
  day: SlipDayFilter;
  sport: SlipSportFilter;
  competitionIds: string[];
  markets: SlipMarketGroupKey[];
  oddsBasis: SlipOddsBasis;
  bestPriceComparison: boolean;
  maxPriceAgeMinutes?: number;
  nowMs?: number;
}

export interface EvaluatedFootballSlateEntry {
  fixture: Fixture;
  context: FixtureContext;
  evalResult: EvaluatedFixtureResult;
  snapshots: StoredOddsSnapshot[];
  isModeratedOut?: boolean;
}

export interface EvaluatedBasketballSlateEntry {
  fixture: Fixture;
  evaluation: BasketballGameEvaluation;
  quotes: BbOddsQuote[];
}

export interface CandidateBuildOutput {
  candidates: SlipCandidateLeg[];
  diagnostics: SlipBuildDiagnostics;
}

const NON_UPCOMING_STATUSES = new Set([
  'FINISHED',
  'IN_PLAY',
  'PAUSED',
  'POSTPONED',
  'CANCELED',
  'CANCELLED',
  'SUSPENDED',
  'AWARDED',
]);

export function mapFootballMarketGroup(pred: MarketPrediction): SlipMarketGroupKey {
  if (
    pred.optionType === 'multi_goals' ||
    pred.optionType === 'team_multi_goals' ||
    pred.optionType === 'first_half_multi_goals' ||
    pred.marketCategory === 'multi_goals'
  ) {
    return 'multi_goals';
  }
  if (
    pred.optionType === 'asian_handicap' ||
    pred.optionType === 'european_handicap' ||
    pred.marketCategory === 'handicap'
  ) {
    return 'handicap';
  }
  if (pred.optionType === 'double_chance' || pred.marketCategory === 'double_chance') {
    return 'double_chance';
  }
  if (pred.optionType === 'both_teams_to_score' || pred.marketCategory === 'btts') {
    return 'btts';
  }
  if (
    pred.optionType === 'corners' ||
    pred.optionType === 'corner_handicap' ||
    pred.marketCategory === 'total_corners' ||
    pred.marketCategory === 'team_corners'
  ) {
    return 'corners';
  }
  if (
    pred.optionType === 'bookings' ||
    pred.optionType === 'team_bookings' ||
    pred.optionType === 'booking_points' ||
    pred.marketCategory === 'bookings'
  ) {
    return 'cards';
  }
  if (
    pred.optionType === 'first_half_goals' ||
    pred.optionType === 'second_half_result' ||
    pred.optionType === 'highest_scoring_half' ||
    pred.marketCode.startsWith('FH_') ||
    pred.marketCode.startsWith('2H_') ||
    pred.marketCode.startsWith('HSH_')
  ) {
    return 'halves';
  }
  if (
    pred.optionType === 'win' ||
    pred.optionType === 'draw' ||
    pred.optionType === 'draw_no_bet' ||
    pred.optionType === 'win_draw_combo' ||
    pred.marketCategory === 'match_result'
  ) {
    return 'match_result';
  }
  return 'total_goals';
}

export function formatPriceAgeLabel(observedAt: string | null, nowMs: number): {
  ageMinutes: number | null;
  label: string;
} {
  if (!observedAt) {
    return { ageMinutes: null, label: 'Price timestamp unavailable' };
  }
  const obsMs = Date.parse(observedAt);
  if (!Number.isFinite(obsMs)) {
    return { ageMinutes: null, label: 'Price timestamp unavailable' };
  }
  const diffMs = Math.max(0, nowMs - obsMs);
  const mins = Math.round(diffMs / 60_000);
  if (mins <= 0) {
    return { ageMinutes: 0, label: 'price from just now' };
  }
  if (mins === 1) {
    return { ageMinutes: 1, label: 'price from 1 minute ago' };
  }
  if (mins < 60) {
    return { ageMinutes: mins, label: `price from ${mins} minutes ago` };
  }
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (remMins === 0) {
    return {
      ageMinutes: mins,
      label: hrs === 1 ? 'price from 1 hour ago' : `price from ${hrs} hours ago`,
    };
  }
  return {
    ageMinutes: mins,
    label: `price from ${hrs}h ${remMins}m ago`,
  };
}

export function isPriceFresh(
  observedAt: string | null | undefined,
  kickoffMs: number,
  nowMs: number,
  maxPriceAgeMinutes: number
): boolean {
  if (!observedAt) return false;
  const obsMs = Date.parse(observedAt);
  if (!Number.isFinite(obsMs)) return false;
  if (obsMs > kickoffMs) return false;
  if (obsMs > nowMs + 120_000) return false; // reject absurd future timestamps
  const ageMs = nowMs - obsMs;
  if (ageMs > maxPriceAgeMinutes * 60_000) return false;
  return true;
}

function getFallbackVerifiedOddsPrice(
  fixture: Fixture,
  marketCode: string
): { price: number; bookmaker: string; observedAt: string | null } | null {
  const vo = fixture.verifiedOdds;
  if (!vo) return null;
  let price: number | undefined;
  switch (marketCode) {
    case '1X2_HOME':
      price = vo.homeWin;
      break;
    case '1X2_DRAW':
      price = vo.draw;
      break;
    case '1X2_AWAY':
      price = vo.awayWin;
      break;
    case 'TOTAL_GOALS_O15':
      price = vo.over15Goals;
      break;
    case 'TOTAL_GOALS_U15':
      price = vo.under15Goals;
      break;
    case 'TOTAL_GOALS_O25':
      price = vo.over25Goals;
      break;
    case 'TOTAL_GOALS_U25':
      price = vo.under25Goals;
      break;
    case 'TOTAL_GOALS_O35':
      price = vo.over35Goals;
      break;
    case 'TOTAL_GOALS_U35':
      price = vo.under35Goals;
      break;
    case 'BTTS_YES':
      price = vo.bttsYes;
      break;
    case 'BTTS_NO':
      price = vo.bttsNo;
      break;
    default:
      price = undefined;
  }
  if (!price || !Number.isFinite(price) || price <= 1.01) return null;
  return {
    price: Math.round(price * 1000) / 1000,
    bookmaker: cleanDisplayText(vo.bookmakerName || 'EU Bookmaker Consensus'),
    observedAt: vo.observedAt || null,
  };
}

function normalizeSnapshotMarketCode(rawCode: string): string {
  const u = rawCode.trim().toUpperCase();
  if (u === 'HOME_WIN' || u === 'MATCH_RESULT_HOME') return '1X2_HOME';
  if (u === 'DRAW' || u === 'MATCH_RESULT_DRAW') return '1X2_DRAW';
  if (u === 'AWAY_WIN' || u === 'MATCH_RESULT_AWAY') return '1X2_AWAY';
  if (u === 'OVER_15') return 'TOTAL_GOALS_O15';
  if (u === 'UNDER_15') return 'TOTAL_GOALS_U15';
  if (u === 'OVER_25') return 'TOTAL_GOALS_O25';
  if (u === 'UNDER_25') return 'TOTAL_GOALS_U25';
  if (u === 'OVER_35') return 'TOTAL_GOALS_O35';
  if (u === 'UNDER_35') return 'TOTAL_GOALS_U35';
  return u;
}

function isConsensusBookmakerName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('consensus') || lower.includes('average');
}

function resolveFootballRealQuotes(params: {
  fixture: Fixture;
  marketCode: string;
  snapshots: StoredOddsSnapshot[];
  kickoffMs: number;
  nowMs: number;
  maxPriceAgeMinutes: number;
}): {
  freshQuotes: SlipBookmakerQuote[];
  hadStaleOnly: boolean;
} {
  const { fixture, marketCode, snapshots, kickoffMs, nowMs, maxPriceAgeMinutes } = params;
  const freshQuotes: SlipBookmakerQuote[] = [];
  let sawAnyMatchingQuote = false;

  const targetCode = normalizeSnapshotMarketCode(marketCode);
  const byBookmaker = new Map<string, SlipBookmakerQuote>();

  for (const snap of snapshots) {
    if (normalizeSnapshotMarketCode(snap.market_code) !== targetCode) continue;
    const oddsVal = Number(snap.decimal_odds);
    if (!Number.isFinite(oddsVal) || oddsVal <= 1.01) continue;
    sawAnyMatchingQuote = true;

    if (!isPriceFresh(snap.observed_at, kickoffMs, nowMs, maxPriceAgeMinutes)) {
      continue;
    }

    const cleanBk = cleanDisplayText(snap.bookmaker || 'Bookmaker');
    const ageInfo = formatPriceAgeLabel(snap.observed_at || null, nowMs);
    const quote: SlipBookmakerQuote = {
      bookmaker: cleanBk,
      decimalOdds: Math.round(oddsVal * 1000) / 1000,
      observedAt: snap.observed_at || null,
      ageMinutes: ageInfo.ageMinutes,
      ageLabel: ageInfo.label,
      isConsensus: isConsensusBookmakerName(cleanBk),
    };

    const existing = byBookmaker.get(cleanBk.toLowerCase());
    if (
      !existing ||
      Date.parse(quote.observedAt || '') > Date.parse(existing.observedAt || '')
    ) {
      byBookmaker.set(cleanBk.toLowerCase(), quote);
    }
  }

  for (const q of byBookmaker.values()) {
    freshQuotes.push(q);
  }

  // Fallback to fixture.verifiedOdds consensus quote ONLY if fresh and not already represented
  const fallback = getFallbackVerifiedOddsPrice(fixture, targetCode);
  if (fallback) {
    sawAnyMatchingQuote = true;
    if (isPriceFresh(fallback.observedAt, kickoffMs, nowMs, maxPriceAgeMinutes)) {
      const hasConsensus = freshQuotes.some((q) => q.isConsensus);
      if (!hasConsensus && !byBookmaker.has(fallback.bookmaker.toLowerCase())) {
        const ageInfo = formatPriceAgeLabel(fallback.observedAt, nowMs);
        freshQuotes.push({
          bookmaker: fallback.bookmaker,
          decimalOdds: fallback.price,
          observedAt: fallback.observedAt,
          ageMinutes: ageInfo.ageMinutes,
          ageLabel: ageInfo.label,
          isConsensus: true,
        });
      }
    }
  }

  freshQuotes.sort((a, b) => b.decimalOdds - a.decimalOdds);
  return {
    freshQuotes,
    hadStaleOnly: sawAnyMatchingQuote && freshQuotes.length === 0,
  };
}

function resolveBasketballRealQuotes(params: {
  pick: BasketballPickCandidate;
  quotes: BbOddsQuote[];
  kickoffMs: number;
  nowMs: number;
  maxPriceAgeMinutes: number;
}): {
  freshQuotes: SlipBookmakerQuote[];
  hadStaleOnly: boolean;
} {
  const { pick, quotes, kickoffMs, nowMs, maxPriceAgeMinutes } = params;
  const isOver = pick.selection.toLowerCase().startsWith('over');
  const freshQuotes: SlipBookmakerQuote[] = [];
  let sawAnyMatching = false;

  const byBookmaker = new Map<string, SlipBookmakerQuote>();
  for (const q of quotes) {
    if (q.market_category !== pick.marketCategory || q.side !== pick.side) continue;
    if (Math.abs(Number(q.line) - Number(pick.line)) > 0.01) continue;
    const rawOdds = isOver ? q.over_odds : q.under_odds;
    if (!rawOdds || !Number.isFinite(rawOdds) || rawOdds <= 1.01) continue;

    sawAnyMatching = true;
    if (!isPriceFresh(q.observed_at, kickoffMs, nowMs, maxPriceAgeMinutes)) {
      continue;
    }

    const cleanBk = cleanDisplayText(q.bookmaker || 'Bookmaker');
    const ageInfo = formatPriceAgeLabel(q.observed_at, nowMs);
    const quote: SlipBookmakerQuote = {
      bookmaker: cleanBk,
      decimalOdds: Math.round(rawOdds * 1000) / 1000,
      observedAt: q.observed_at,
      ageMinutes: ageInfo.ageMinutes,
      ageLabel: ageInfo.label,
      isConsensus: isConsensusBookmakerName(cleanBk),
    };

    const existing = byBookmaker.get(cleanBk.toLowerCase());
    if (
      !existing ||
      Date.parse(quote.observedAt || '') > Date.parse(existing.observedAt || '')
    ) {
      byBookmaker.set(cleanBk.toLowerCase(), quote);
    }
  }

  for (const q of byBookmaker.values()) {
    freshQuotes.push(q);
  }
  freshQuotes.sort((a, b) => b.decimalOdds - a.decimalOdds);

  return {
    freshQuotes,
    hadStaleOnly: sawAnyMatching && freshQuotes.length === 0,
  };
}

function selectQuoteForTier(
  freshQuotes: SlipBookmakerQuote[],
  bestPriceComparison: boolean
): { chosen: SlipBookmakerQuote; exposedQuotes: SlipBookmakerQuote[]; bestApplied: boolean } {
  if (bestPriceComparison) {
    const nonConsensus = freshQuotes.filter((q) => !q.isConsensus);
    const best = nonConsensus[0] || freshQuotes[0];
    return {
      chosen: best,
      exposedQuotes: freshQuotes,
      bestApplied: freshQuotes.length > 1 && best.decimalOdds > freshQuotes[freshQuotes.length - 1].decimalOdds,
    };
  }
  // Free / Pro: prefer stored consensus quote if available, otherwise median/primary bookmaker (not best-shopped)
  const consensus = freshQuotes.find((q) => q.isConsensus);
  if (consensus) {
    return { chosen: consensus, exposedQuotes: [], bestApplied: false };
  }
  const midIdx = Math.floor(freshQuotes.length / 2);
  return { chosen: freshQuotes[midIdx], exposedQuotes: [], bestApplied: false };
}

function normalizeCompetitionFilterSet(ids: string[]): Set<string> | null {
  const cleaned = ids
    .map((id) => canonicalizeCompetitionId(id) || id.trim().toLowerCase())
    .filter((id) => id && id !== 'all');
  if (cleaned.length === 0) return null;
  return new Set(cleaned);
}

/**
 * Pure deterministic candidate builder operating on evaluated slates.
 * Exported directly so unit tests and benchmarks can test multi-bookmaker/stale-price/team-news
 * logic without mutating the persistent SQLite database.
 */
export function buildSlipCandidatesFromEvaluatedSlates(params: {
  input: CandidateBuilderInput;
  footballEntries: EvaluatedFootballSlateEntry[];
  basketballEntries: EvaluatedBasketballSlateEntry[];
  flaggedFixtureIds: Set<string>;
  skipDayFilter?: boolean;
}): CandidateBuildOutput {
  const { input, footballEntries, basketballEntries, flaggedFixtureIds, skipDayFilter } = params;
  const nowMs = input.nowMs ?? Date.now();
  const maxPriceAgeMinutes =
    input.maxPriceAgeMinutes ?? SLIP_BUILDER_GLOBAL_BOUNDS.maxPriceAgeMinutes;
  const compSet = normalizeCompetitionFilterSet(input.competitionIds || []);
  const marketSet =
    input.markets && input.markets.length > 0 ? new Set<SlipMarketGroupKey>(input.markets) : null;
  const globalTeamNewsEnabled = isTeamNewsEnabled();

  const candidates: SlipCandidateLeg[] = [];
  const realPricedMatchIds = new Set<string>();
  const modelFairMatchIds = new Set<string>();
  const diagnostics: SlipBuildDiagnostics = {
    fixturesScanned: 0,
    upcomingFixtures: 0,
    qualifiedMatches: 0,
    candidateLegs: 0,
    realPricedLegs: 0,
    modelFairLegs: 0,
    rejectedStalePrices: 0,
    rejectedFlaggedExplanations: 0,
    rejectedAbstainedOrThin: 0,
    searchDurationMs: 0,
    realPricedMatches: 0,
    modelFairAvailableMatches: 0,
  };

  // 1. Evaluate Football entries
  if (input.sport === 'football' || input.sport === 'all') {
    for (const entry of footballEntries) {
      const { fixture, context, evalResult, snapshots, isModeratedOut } = entry;
      if (isModeratedOut) continue;

      const compId = getFixtureCanonicalCompetitionId(fixture).toLowerCase();
      if (compSet && !compSet.has(compId)) continue;
      if (!skipDayFilter && !matchesDayFilter(fixture.kickoffTime, input.day)) continue;

      diagnostics.fixturesScanned++;

      const kickoffMs = Date.parse(fixture.kickoffTime);
      if (
        NON_UPCOMING_STATUSES.has(String(fixture.status || '').toUpperCase()) ||
        !Number.isFinite(kickoffMs) ||
        kickoffMs <= nowMs
      ) {
        continue;
      }
      diagnostics.upcomingFixtures++;

      const homeSamples = context.homeSampleMatches ?? context.sampleSizeMatches ?? 0;
      const awaySamples = context.awaySampleMatches ?? context.sampleSizeMatches ?? 0;
      if (
        fixture.insufficientData ||
        context.insufficientData ||
        homeSamples < 10 ||
        awaySamples < 10 ||
        evalResult.topPick === null ||
        Boolean(evalResult.noRecommendationReason)
      ) {
        diagnostics.rejectedAbstainedOrThin++;
        continue;
      }

      if (flaggedFixtureIds.has(fixture.id)) {
        diagnostics.rejectedFlaggedExplanations++;
        continue;
      }

      const poolPicks: MarketPrediction[] = [];
      const seenCodes = new Set<string>();
      for (const p of [evalResult.topPick, ...(evalResult.rankedOptions || []), ...(evalResult.predictions || [])]) {
        if (!p || !p.marketCode || seenCodes.has(p.marketCode)) continue;
        seenCodes.add(p.marketCode);
        poolPicks.push(p);
      }

      const teamNewsPending = !globalTeamNewsEnabled || context.lineupConfirmed !== true;
      let matchAddedLeg = false;

      for (const pick of poolPicks) {
        if (isDisabledRecommendationMarket(pick)) continue;
        if (pick.abstainReason || pick.sanityTripwire || pick.isSpeculative) continue;
        if (
          pick.marketCategory === 'multi_goals' &&
          (!pick.isValidated || (pick.rankingScore ?? 0) <= 0)
        ) {
          continue;
        }
        if (
          pick.qualificationStatus === 'NO_RECOMMENDATION' ||
          pick.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY' ||
          pick.qualificationStatus === 'UNQUALIFIED_MARGINAL'
        ) {
          continue;
        }
        if (pick.confidenceTier !== 'HIGH' && pick.confidenceTier !== 'MEDIUM') {
          continue;
        }

        const marketGroup = mapFootballMarketGroup(pick);
        if (marketSet && !marketSet.has(marketGroup)) {
          continue;
        }

        const calibratedProbability = Number(
          pick.calibratedProbability ?? pick.modelProbability
        );
        if (!Number.isFinite(calibratedProbability) || calibratedProbability <= 0.02 || calibratedProbability >= 0.985) {
          continue;
        }

        // Apply "team news pending" confidence lowering (HIGH -> MEDIUM)
        const lowered = teamNewsPending && pick.confidenceTier === 'HIGH';
        const effectiveTier: 'HIGH' | 'MEDIUM' = lowered ? 'MEDIUM' : pick.confidenceTier;
        const teamNewsNote = teamNewsPending
          ? lowered
            ? 'Team news pending: confidence lowered from High to Medium'
            : 'Team news pending before kickoff'
          : null;

        // Check real bookmaker prices vs model-fair fallback
        const { freshQuotes, hadStaleOnly } = resolveFootballRealQuotes({
          fixture,
          marketCode: pick.marketCode,
          snapshots,
          kickoffMs,
          nowMs,
          maxPriceAgeMinutes,
        });

        if (freshQuotes.length > 0) {
          realPricedMatchIds.add(fixture.id);
        }
        modelFairMatchIds.add(fixture.id);

        if (hadStaleOnly) {
          diagnostics.rejectedStalePrices++;
        }

        if (freshQuotes.length === 0 && input.oddsBasis === 'real') {
          continue;
        }

        let decimalOdds: number;
        let oddsSourceType: 'real_bookmaker' | 'model_fair';
        let bookmakerName: string;
        let observedAt: string | null;
        let priceAgeMinutes: number | null;
        let priceAgeLabel: string;
        let impliedProbability: number | null;
        let marketEdge: number | null;
        let expectedValue: number | null;
        let bookmakerQuotes: SlipBookmakerQuote[] = [];
        let bestQuoteApplied = false;

        if (freshQuotes.length > 0) {
          const pickedQuote = selectQuoteForTier(freshQuotes, input.bestPriceComparison);
          decimalOdds = pickedQuote.chosen.decimalOdds;
          oddsSourceType = 'real_bookmaker';
          bookmakerName = pickedQuote.chosen.bookmaker;
          observedAt = pickedQuote.chosen.observedAt;
          priceAgeMinutes = pickedQuote.chosen.ageMinutes;
          priceAgeLabel = pickedQuote.chosen.ageLabel;
          impliedProbability = Math.round((1 / decimalOdds) * 10000) / 10000;
          marketEdge = Math.round((calibratedProbability - impliedProbability) * 10000) / 10000;
          expectedValue = Math.round((calibratedProbability * decimalOdds - 1) * 10000) / 10000;
          bookmakerQuotes = pickedQuote.exposedQuotes;
          bestQuoteApplied = pickedQuote.bestApplied;
        } else {
          // Model-fair odds ONLY when input.oddsBasis === 'model_fair'
          decimalOdds = Math.max(1.02, Math.round((1 / calibratedProbability) * 1000) / 1000);
          oddsSourceType = 'model_fair';
          bookmakerName = 'Model fair price';
          observedAt = null;
          priceAgeMinutes = null;
          priceAgeLabel = 'Model fair odds, not a bookmaker price';
          impliedProbability = null;
          marketEdge = null;
          expectedValue = null;
        }

        const adjustedPickForExpl: MarketPrediction = {
          ...pick,
          confidenceTier: effectiveTier,
          confidenceReason: lowered
            ? 'Team news pending: confidence lowered from High to Medium'
            : pick.confidenceReason,
          marketOdds: oddsSourceType === 'real_bookmaker' ? decimalOdds : undefined,
          impliedProbability: impliedProbability ?? undefined,
          expectedValue: expectedValue ?? undefined,
          priceSource: oddsSourceType === 'real_bookmaker' ? bookmakerName : undefined,
        };

        const expl = generateFootballExplanation({
          fixture,
          evaluation: {
            topPick: adjustedPickForExpl,
            predictions: evalResult.predictions,
          },
          context,
        });

        if (!expl.validationPassed) {
          diagnostics.rejectedFlaggedExplanations++;
          continue;
        }

        const homeClean = cleanDisplayText(displayName(fixture.homeTeam));
        const awayClean = cleanDisplayText(displayName(fixture.awayTeam));

        candidates.push({
          matchId: fixture.id,
          sport: 'football',
          matchLabel: `${homeClean} vs ${awayClean}`,
          homeTeamId: String(fixture.homeTeam.id || homeClean),
          awayTeamId: String(fixture.awayTeam.id || awayClean),
          homeTeamName: homeClean,
          awayTeamName: awayClean,
          competitionId: compId,
          competitionCode: cleanDisplayText(fixture.competition.code),
          competitionName: cleanDisplayText(fixture.competition.name),
          kickoffTime: fixture.kickoffTime,
          marketCode: pick.marketCode,
          marketGroup,
          marketName: cleanDisplayText(pick.marketName),
          selection: cleanDisplayText(pick.selection),
          line: pick.line ?? null,
          decimalOdds,
          oddsSourceType,
          bookmakerName: cleanDisplayText(bookmakerName),
          observedAt,
          priceAgeMinutes,
          priceAgeLabel: cleanDisplayText(priceAgeLabel),
          calibratedProbability: Math.round(calibratedProbability * 10000) / 10000,
          impliedProbability,
          marketEdge,
          expectedValue,
          confidenceTier: effectiveTier,
          teamNewsLowered: lowered,
          teamNewsNote: teamNewsNote ? cleanDisplayText(teamNewsNote) : null,
          oneLineWhy: cleanDisplayText(expl.oneLineSummary),
          bookmakerQuotes,
          bestQuoteApplied,
        });

        matchAddedLeg = true;
        if (oddsSourceType === 'real_bookmaker') diagnostics.realPricedLegs++;
        else diagnostics.modelFairLegs++;
      }

      if (matchAddedLeg) diagnostics.qualifiedMatches++;
    }
  }

  // 2. Evaluate Basketball entries
  if (input.sport === 'basketball' || input.sport === 'all') {
    for (const entry of basketballEntries) {
      const { fixture, evaluation, quotes } = entry;
      const compId = getFixtureCanonicalCompetitionId(fixture).toLowerCase();
      if (compSet && !compSet.has(compId)) continue;
      if (!skipDayFilter && !matchesDayFilter(fixture.kickoffTime, input.day)) continue;
      if (marketSet && !marketSet.has('basketball_totals')) continue;

      diagnostics.fixturesScanned++;

      const kickoffMs = Date.parse(fixture.kickoffTime);
      if (
        NON_UPCOMING_STATUSES.has(String(fixture.status || '').toUpperCase()) ||
        !Number.isFinite(kickoffMs) ||
        kickoffMs <= nowMs
      ) {
        continue;
      }
      diagnostics.upcomingFixtures++;

      if (
        evaluation.needsHistory ||
        evaluation.topPick === null ||
        Boolean(evaluation.abstentionReason)
      ) {
        diagnostics.rejectedAbstainedOrThin++;
        continue;
      }

      if (flaggedFixtureIds.has(fixture.id)) {
        diagnostics.rejectedFlaggedExplanations++;
        continue;
      }

      const poolPicks: BasketballPickCandidate[] = [];
      const seenKey = new Set<string>();
      for (const p of [evaluation.topPick, ...(evaluation.picks || [])]) {
        if (!p) continue;
        const k = `${p.marketCode}:${p.line}`;
        if (seenKey.has(k)) continue;
        seenKey.add(k);
        poolPicks.push(p);
      }

      const teamNewsPending = !globalTeamNewsEnabled;
      let matchAddedLeg = false;

      for (const pick of poolPicks) {
        if (
          pick.qualificationStatus === 'NO_RECOMMENDATION' ||
          pick.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY' ||
          pick.qualificationStatus === 'UNQUALIFIED_MARGINAL'
        ) {
          continue;
        }
        if (pick.tier !== 'HIGH' && pick.tier !== 'MEDIUM') {
          continue;
        }

        const calibratedProbability = Number(pick.calibratedProbability);
        if (!Number.isFinite(calibratedProbability) || calibratedProbability <= 0.02 || calibratedProbability >= 0.985) {
          continue;
        }

        const lowered = teamNewsPending && pick.tier === 'HIGH';
        const effectiveTier: 'HIGH' | 'MEDIUM' = lowered ? 'MEDIUM' : pick.tier;
        const teamNewsNote = teamNewsPending
          ? lowered
            ? 'Team news pending: confidence lowered from High to Medium'
            : 'Team news pending before tipoff'
          : null;

        const { freshQuotes, hadStaleOnly } = resolveBasketballRealQuotes({
          pick,
          quotes,
          kickoffMs,
          nowMs,
          maxPriceAgeMinutes,
        });

        if (freshQuotes.length > 0) {
          realPricedMatchIds.add(fixture.id);
        }
        modelFairMatchIds.add(fixture.id);

        if (hadStaleOnly) {
          diagnostics.rejectedStalePrices++;
        }

        if (freshQuotes.length === 0 && input.oddsBasis === 'real') {
          continue;
        }

        let decimalOdds: number;
        let oddsSourceType: 'real_bookmaker' | 'model_fair';
        let bookmakerName: string;
        let observedAt: string | null;
        let priceAgeMinutes: number | null;
        let priceAgeLabel: string;
        let impliedProbability: number | null;
        let marketEdge: number | null;
        let expectedValue: number | null;
        let bookmakerQuotes: SlipBookmakerQuote[] = [];
        let bestQuoteApplied = false;

        if (freshQuotes.length > 0) {
          const pickedQuote = selectQuoteForTier(freshQuotes, input.bestPriceComparison);
          decimalOdds = pickedQuote.chosen.decimalOdds;
          oddsSourceType = 'real_bookmaker';
          bookmakerName = pickedQuote.chosen.bookmaker;
          observedAt = pickedQuote.chosen.observedAt;
          priceAgeMinutes = pickedQuote.chosen.ageMinutes;
          priceAgeLabel = pickedQuote.chosen.ageLabel;
          impliedProbability = Math.round((1 / decimalOdds) * 10000) / 10000;
          marketEdge = Math.round((calibratedProbability - impliedProbability) * 10000) / 10000;
          expectedValue = Math.round((calibratedProbability * decimalOdds - 1) * 10000) / 10000;
          bookmakerQuotes = pickedQuote.exposedQuotes;
          bestQuoteApplied = pickedQuote.bestApplied;
        } else {
          decimalOdds = Math.max(1.02, Math.round((1 / calibratedProbability) * 1000) / 1000);
          oddsSourceType = 'model_fair';
          bookmakerName = 'Model fair price';
          observedAt = null;
          priceAgeMinutes = null;
          priceAgeLabel = 'Model fair odds, not a bookmaker price';
          impliedProbability = null;
          marketEdge = null;
          expectedValue = null;
        }

        const adjustedPickForExpl: BasketballPickCandidate = {
          ...pick,
          tier: effectiveTier,
          marketOdds: oddsSourceType === 'real_bookmaker' ? decimalOdds : null,
          impliedProbability,
          expectedValue,
          isModelLine: oddsSourceType !== 'real_bookmaker',
          priceSource:
            oddsSourceType === 'real_bookmaker'
              ? bookmakerName
              : 'Model fair odds, not a bookmaker price',
        };

        const expl = generateBasketballExplanation({
          fixture,
          evaluation,
          activePickOverride: adjustedPickForExpl,
        });

        if (!expl.validationPassed) {
          diagnostics.rejectedFlaggedExplanations++;
          continue;
        }

        const homeClean = cleanDisplayText(displayName(fixture.homeTeam));
        const awayClean = cleanDisplayText(displayName(fixture.awayTeam));

        const marketLabel =
          pick.marketCategory === 'game_total'
            ? 'Game total'
            : pick.marketCategory === 'home_total'
            ? 'Home team total'
            : pick.marketCategory === 'away_total'
            ? 'Away team total'
            : pick.marketCategory === 'h1_game_total'
            ? '1st half total'
            : '1st half team total';

        candidates.push({
          matchId: fixture.id,
          sport: 'basketball',
          matchLabel: `${homeClean} vs ${awayClean}`,
          homeTeamId: String(fixture.homeTeam.id || homeClean),
          awayTeamId: String(fixture.awayTeam.id || awayClean),
          homeTeamName: homeClean,
          awayTeamName: awayClean,
          competitionId: compId,
          competitionCode: cleanDisplayText(fixture.competition.code),
          competitionName: cleanDisplayText(fixture.competition.name),
          kickoffTime: fixture.kickoffTime,
          marketCode: pick.marketCode,
          marketGroup: 'basketball_totals',
          marketName: cleanDisplayText(marketLabel),
          selection: cleanDisplayText(pick.selection),
          line: Number.isFinite(pick.line) ? pick.line : null,
          decimalOdds,
          oddsSourceType,
          bookmakerName: cleanDisplayText(bookmakerName),
          observedAt,
          priceAgeMinutes,
          priceAgeLabel: cleanDisplayText(priceAgeLabel),
          calibratedProbability: Math.round(calibratedProbability * 10000) / 10000,
          impliedProbability,
          marketEdge,
          expectedValue,
          confidenceTier: effectiveTier,
          teamNewsLowered: lowered,
          teamNewsNote: teamNewsNote ? cleanDisplayText(teamNewsNote) : null,
          oneLineWhy: cleanDisplayText(expl.oneLineSummary),
          bookmakerQuotes,
          bestQuoteApplied,
        });

        matchAddedLeg = true;
        if (oddsSourceType === 'real_bookmaker') diagnostics.realPricedLegs++;
        else diagnostics.modelFairLegs++;
      }

      if (matchAddedLeg) diagnostics.qualifiedMatches++;
    }
  }

  diagnostics.candidateLegs = candidates.length;
  diagnostics.realPricedMatches = realPricedMatchIds.size;
  diagnostics.modelFairAvailableMatches = modelFairMatchIds.size;
  return { candidates, diagnostics };
}

/**
 * Loads upcoming evaluated slates and stored odds snapshots ONLY from local/Supabase DB.
 * Zero live Odds API calls are ever triggered from this function.
 */
export async function loadAndBuildSlipCandidates(
  input: CandidateBuilderInput
): Promise<CandidateBuildOutput> {
  const nowMs = input.nowMs ?? Date.now();
  const flaggedFixtureIds = await getFlaggedExplanationFixtureIds();

  const footballEntries: EvaluatedFootballSlateEntry[] = [];
  const basketballEntries: EvaluatedBasketballSlateEntry[] = [];

  if (input.sport === 'football' || input.sport === 'all') {
    const provider = getFootballDataProvider();
    const liveResult = await provider.getLiveFixtures();
    const upcomingFootball = liveResult.fixtures.filter((f) => {
      if (f.sport === 'basketball') return false;
      if (NON_UPCOMING_STATUSES.has(String(f.status || '').toUpperCase())) return false;
      const ms = Date.parse(f.kickoffTime);
      if (!Number.isFinite(ms) || ms <= nowMs) return false;
      return matchesDayFilter(f.kickoffTime, input.day);
    });

    if (upcomingFootball.length > 0) {
      const fixtureIds = upcomingFootball.map((f) => f.id);
      const [moderationMap, quotesByMatch] = await Promise.all([
        loadFootballPickModerationMap(fixtureIds),
        matchesStore.getBookmakerQuotesForMatches(fixtureIds),
      ]);

      for (const fixture of upcomingFootball) {
        const mod = moderationMap.get(fixture.id);
        const isModeratedOut = Boolean(mod?.isHidden || mod?.voidedReason);
        const stats = getFixtureStatistics(fixture);
        const context = buildFixtureContextFromStats(fixture, stats);
        const evalResult = evaluateFixtureMarkets(context);
        footballEntries.push({
          fixture,
          context,
          evalResult,
          snapshots: quotesByMatch[fixture.id] || [],
          isModeratedOut,
        });
      }
    }
  }

  if (input.sport === 'basketball' || input.sport === 'all') {
    const bb = await getBasketballFixturesAndEvaluations({
      status: 'SCHEDULED',
      day: input.day,
    });

    const bbGameIds = bb.fixtures.map((f) => f.id);
    const bbQuotesByGame = new Map<string, BbOddsQuote[]>();

    if (bbGameIds.length > 0 && isSupabaseConfigured && supabase) {
      for (const idChunk of chunkArray(bbGameIds, 200)) {
        const { data: oddsRows } = await supabase
          .from('bb_odds_snapshots')
          .select('*')
          .in('game_id', idChunk);
        for (const r of oddsRows || []) {
          const gid = String(r.game_id || '');
          if (!gid) continue;
          const q: BbOddsQuote = {
            id: String(r.id),
            game_id: gid,
            league: r.league,
            market_category: r.market_category,
            side: r.side || 'game',
            line: Number(r.line),
            over_odds:
              r.over_odds !== null && r.over_odds !== undefined ? Number(r.over_odds) : null,
            under_odds:
              r.under_odds !== null && r.under_odds !== undefined ? Number(r.under_odds) : null,
            bookmaker: String(r.bookmaker || 'Bookmaker'),
            observed_at: String(r.observed_at || ''),
          };
          const arr = bbQuotesByGame.get(gid) || [];
          arr.push(q);
          bbQuotesByGame.set(gid, arr);
        }
      }
    }

    for (const fixture of bb.fixtures) {
      const evaluation = bb.evaluationsById[fixture.id];
      if (!evaluation) continue;
      basketballEntries.push({
        fixture,
        evaluation,
        quotes: bbQuotesByGame.get(fixture.id) || [],
      });
    }
  }

  return buildSlipCandidatesFromEvaluatedSlates({
    input: { ...input, nowMs },
    footballEntries,
    basketballEntries,
    flaggedFixtureIds,
  });
}
