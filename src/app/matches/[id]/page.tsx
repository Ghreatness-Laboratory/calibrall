'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import MarketComparisonTable from '@/components/MarketComparisonTable';
import ExplanationCard from '@/components/ExplanationCard';
import ScorelineMatrix from '@/components/ScorelineMatrix';
import FactorsAndStatePanel from '@/components/FactorsAndStatePanel';
import TeamCrest from '@/components/TeamCrest';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Bookmark,
  CheckCircle2,
  AlertCircle,
  Users,
  Grid,
  FileText,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/supabase/client';
import { Fixture, MarketPrediction } from '@/types';
import { formatExpectedValue, formatSelectionName, getRiskTierBadge, formatOdds } from '@/lib/prediction/marketCatalog';
import { checkDerby } from '@/lib/prediction/contextFactors';
import type { BasketballGameEvaluation, BasketballPickCandidate } from '@/lib/basketball/picker';
import type { BasketballMarketCategory } from '@/lib/basketball/markets';
import { evaluateLiveMatchState } from '@/lib/prediction/liveMatchState';
import { extractMatchStats, settleMarketPrediction } from '@/lib/prediction/settlementEngine';
import QuantitativeFactorsAuditPanel from '@/components/QuantitativeFactorsAuditPanel';
import LineupComparisonPanel from '@/components/LineupComparisonPanel';
import LineupChip from '@/components/LineupChip';
import { getFixtureLineupState } from '@/lib/data/lineupsService';
import { forwardPickLedger } from '@/lib/prediction/forwardPickLedger';
import { displayName, formatMatchTime, cleanDisplayText } from '@/lib/utils/formatText';

const BB_CAT_TITLES: Record<BasketballMarketCategory, string> = {
  game_total: 'Game Total Over/Under',
  home_total: 'Home Team Total Over/Under',
  away_total: 'Away Team Total Over/Under',
  h1_game_total: '1st Half Game Total Over/Under',
  h1_team_total: '1st Half Team Total Over/Under',
};

function getClientBbSettlement(pick: BasketballPickCandidate, fixture: Fixture): {
  status: 'PENDING' | 'WON' | 'LOST' | 'PUSH' | 'VOID';
  actualLabel: string | null;
} {
  if (fixture.status === 'POSTPONED' || fixture.status === 'CANCELED') {
    return { status: 'VOID', actualLabel: fixture.status };
  }
  if (fixture.status !== 'FINISHED') {
    return { status: 'PENDING', actualLabel: null };
  }
  const h = fixture.homeScore ?? null;
  const a = fixture.awayScore ?? null;
  const h1h = fixture.homeHalfTimeScore ?? null;
  const h1a = fixture.awayHalfTimeScore ?? null;
  let actual: number | null = null;
  let label: string | null = h !== null && a !== null ? `${h} - ${a}` : null;

  if (pick.marketCategory === 'game_total' && h !== null && a !== null) actual = h + a;
  else if (pick.marketCategory === 'home_total' && h !== null) actual = h;
  else if (pick.marketCategory === 'away_total' && a !== null) actual = a;
  else if (pick.marketCategory === 'h1_game_total' && h1h !== null && h1a !== null) {
    actual = h1h + h1a;
    label = `1H ${h1h} - ${h1a}`;
  } else if (pick.marketCategory === 'h1_team_total') {
    if (pick.side === 'away' && h1a !== null) {
      actual = h1a;
      label = `1H Away ${h1a}`;
    } else if (pick.side !== 'away' && h1h !== null) {
      actual = h1h;
      label = `1H Home ${h1h}`;
    }
  }

  if (actual === null) return { status: 'PENDING', actualLabel: 'Missing official period breakdown' };
  if (Math.abs(actual - pick.line) < 1e-6) return { status: 'PUSH', actualLabel: `${actual.toFixed(0)} (${label})` };
  const isOver = pick.marketCode.endsWith('_OVER');
  const won = isOver ? actual > pick.line : actual < pick.line;
  return { status: won ? 'WON' : 'LOST', actualLabel: `${actual.toFixed(0)} (${label})` };
}

export default function MatchAnalysisPage() {
  const params = useParams();
  const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) as string;

  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [bbEvaluation, setBbEvaluation] = useState<BasketballGameEvaluation | null>(null);
  const [selectedBbPickKey, setSelectedBbPickKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    async function loadFixture() {
      try {
        setIsLoading(true);
        const isBb = id?.startsWith('bbg_') || id?.startsWith('nba_');
        const res = await fetch(`/api/v1/fixtures?sport=${isBb ? 'basketball' : 'football'}&id=${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (!res.ok) {
          setFixture(null);
          setBbEvaluation(null);
          return;
        }
        const text = await res.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          setFixture(null);
          setBbEvaluation(null);
          return;
        }
        if (json.lastUpdated) setLastUpdated(json.lastUpdated);
        const found = (json.data || []).find((f: Fixture) => f.id === id);
        setFixture(found || null);
        setBbEvaluation(json.evaluations?.[id] || null);
      } catch {
        setFixture(null);
        setBbEvaluation(null);
      } finally {
        setIsLoading(false);
      }
    }
    if (id) loadFixture();
  }, [id]);

  const [isSaved, setIsSaved] = useState<boolean>(() => {
    return getStoredSavedFixtures().includes(id);
  });

  const isBasketball = fixture?.sport === 'basketball' || id?.startsWith('bbg_') || id?.startsWith('nba_');

  const stats = useMemo(() => {
    if (!fixture || isBasketball) return null;
    return getFixtureStatistics(fixture);
  }, [fixture, isBasketball]);

  const footballEvaluation = useMemo(() => {
    if (!fixture || isBasketball || !stats) return null;
    return evaluateFixtureMarkets(buildFixtureContextFromStats(fixture, stats));
  }, [fixture, isBasketball, stats]);

  // Match stats summary for finished matches
  const matchStats = useMemo(() => {
    if (!fixture || isBasketball || fixture.status !== 'FINISHED') return null;
    return extractMatchStats(fixture);
  }, [fixture, isBasketball]);

  const predictions = useMemo(() => {
    if (isBasketball) return [];
    const raw = footballEvaluation?.predictions || [];
    if (!matchStats) return raw;
    return raw.map((p) => {
      const settled = settleMarketPrediction(p, matchStats);
      return {
        ...p,
        settlementStatus: settled.settlementStatus,
        actualStatValue: settled.actualStatValue,
        lineComparisonText: settled.lineComparisonText,
      };
    });
  }, [isBasketball, footballEvaluation, matchStats]);

  const topPick = isBasketball ? null : (predictions.find(p => p.isTopPick) || (footballEvaluation?.noRecommendationReason ? null : predictions[0]) || null);
  const noRecommendationReason = isBasketball ? undefined : footballEvaluation?.noRecommendationReason;

  // Live match state tracking
  const liveState = useMemo(() => {
    if (!fixture) return undefined;
    return evaluateLiveMatchState(fixture);
  }, [fixture]);

  // Selected prediction for explanation inspection
  const [selectedPredictionOverride, setSelectedPredictionOverride] = useState<MarketPrediction | null>(null);
  const rawSelected = selectedPredictionOverride || topPick || (predictions[0] ?? null);
  const selectedPrediction = useMemo(() => {
    if (!rawSelected) return null;
    return {
      ...rawSelected,
      liveStateStatus: liveState
    };
  }, [rawSelected, liveState]);
  const setSelectedPrediction = (p: MarketPrediction | null) => setSelectedPredictionOverride(p);

  // Analysis Tab navigation
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'markets' | 'lineups' | 'poisson' | 'form' | 'coaches' | 'weather'>('markets');

  const lineupState = useMemo(() => {
    if (!fixture || isBasketball) return null;
    return getFixtureLineupState(fixture);
  }, [fixture, isBasketball]);

  const pickRevisions = useMemo(() => {
    if (!fixture) return [];
    return forwardPickLedger.getPickRevisions(fixture.id);
  }, [fixture]);

  const isDataInsufficient = useMemo(() => {
    if (!fixture) return true;
    if (fixture.insufficientData || stats?.insufficientData) return true;
    if (noRecommendationReason && (noRecommendationReason.startsWith('Data out of date') || noRecommendationReason.toLowerCase().includes('insufficient'))) return true;
    return false;
  }, [fixture, stats, noRecommendationReason]);

  const highTierCount = useMemo(() => {
    return predictions.filter(p => p.confidenceTier === 'HIGH' || p.riskTier === 'SAFE' || p.riskTier === 'LOW').length;
  }, [predictions]);

  const medTierCount = useMemo(() => {
    return predictions.filter(p => p.confidenceTier === 'MEDIUM' || p.riskTier === 'MEDIUM' || p.riskTier === 'MODERATE').length;
  }, [predictions]);

  const lowTierCount = useMemo(() => {
    return predictions.filter(p => p.confidenceTier === 'LOW' || p.riskTier === 'RISKY' || p.riskTier === 'LONGSHOT').length;
  }, [predictions]);

  if (isLoading) {
    return (
      <div className="space-y-3 py-1 animate-pulse">
        <div className="flex items-center justify-between pb-0.5">
          <div className="h-4 w-28 bg-[#151D19] rounded-[8px]" />
          <div className="h-[36px] w-20 bg-[#151D19] rounded-full" />
        </div>
        <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-3 w-32 bg-[#151D19] rounded-[4px]" />
            <div className="h-3 w-16 bg-[#151D19] rounded-[4px]" />
          </div>
          <div className="space-y-2 py-0.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[#151D19]" />
                <div className="h-4 w-32 bg-[#151D19] rounded-[4px]" />
              </div>
              <div className="h-5 w-12 bg-[#151D19] rounded-full" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[#151D19]" />
                <div className="h-4 w-28 bg-[#151D19] rounded-[4px]" />
              </div>
              <div className="h-5 w-12 bg-[#151D19] rounded-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1F2A24]">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-2.5 bg-[#151D19] rounded-[10px] space-y-1.5">
                <div className="h-2.5 w-20 bg-[#101613] rounded-[4px]" />
                <div className="h-4 w-14 bg-[#101613] rounded-[4px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!fixture || (!isBasketball && (!stats || !footballEvaluation))) {
    return (
      <div className="py-16 text-center space-y-3 bg-[#101613] border border-[#1F2A24] rounded-[14px] p-6">
        <h2 suppressHydrationWarning className="text-[15px] font-semibold text-[#E9EFEB]">
          Live data unavailable.{lastUpdated ? ` Last updated ${lastUpdated}` : ''}
        </h2>
        <p className="text-[12px] text-[#8B9892] max-w-sm mx-auto">
          {isBasketball 
            ? 'The requested basketball matchup data could not be retrieved.' 
            : 'The requested match data could not be retrieved.'}
        </p>
        <Link href="/matches" className="inline-block px-4 py-2 rounded-[13px] bg-[#151D19] border border-[#1F2A24] text-[13px] text-[#E9EFEB] hover:bg-white/[0.05]">
          Return to fixtures
        </Link>
      </div>
    );
  }

  const handleToggleBookmark = () => {
    const updated = toggleStoredSavedFixture(fixture.id);
    setIsSaved(updated);
  };

  const kickoff = new Date(fixture.kickoffTime);
  const homeName = displayName(fixture.homeTeam);
  const awayName = displayName(fixture.awayTeam);

  if (isBasketball) {
    const bStats = fixture.basketballStats;
    const proj = bbEvaluation?.projection;
    const needsHistory = Boolean(bbEvaluation?.needsHistory ?? bStats?.needsHistory ?? fixture.insufficientData);
    const needsH1History = Boolean(proj?.needsH1History ?? bStats?.needsH1History);
    const abstentionReason = bbEvaluation?.abstentionReason || bStats?.abstentionReason || 'Needs history';
    const bbPicks = bbEvaluation?.picks || [];
    const bbTopPick = bbEvaluation?.topPick || null;
    const activeBbPick =
      bbPicks.find((p) => `${p.marketCode}_${p.line}` === selectedBbPickKey) ||
      bbTopPick ||
      bbPicks[0] ||
      null;

    const leagueCode = bStats?.league || fixture.competition?.code || 'NBA';
    const isFinished = fixture.status === 'FINISHED';
    const isLive = fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED';
    const hasFinalScore =
      (isFinished || isLive) &&
      fixture.homeScore !== null &&
      fixture.homeScore !== undefined &&
      fixture.awayScore !== null &&
      fixture.awayScore !== undefined;
    const hasH1Score =
      fixture.homeHalfTimeScore !== null &&
      fixture.homeHalfTimeScore !== undefined &&
      fixture.awayHalfTimeScore !== null &&
      fixture.awayHalfTimeScore !== undefined;

    const totalMean = proj ? proj.gameTotalMean : bStats?.projectedTotal;
    const totalStd = proj ? proj.gameTotalStd : bStats?.projectedTotalStd;
    const h1TotalMean = proj ? proj.h1TotalMean : bStats?.h1ProjectedTotal;
    const h1TotalStd = proj ? proj.h1TotalStd : bStats?.h1ProjectedTotalStd;
    const homeMean = proj ? proj.homeMean : bStats?.homeProjected;
    const awayMean = proj ? proj.awayMean : bStats?.awayProjected;

    const tierStyle = (t: BasketballPickCandidate['tier']) =>
      t === 'HIGH'
        ? 'bg-[#B8E636]/15 text-[#B8E636] border-[#B8E636]/30'
        : t === 'MEDIUM'
        ? 'bg-[#E8B04A]/15 text-[#E8B04A] border-[#E8B04A]/30'
        : 'bg-[#151D19] text-[#8B9892] border-[#1F2A24]';

    return (
      <div className="space-y-3 py-1">
        {/* Back and Save */}
        <div className="flex items-center justify-between pb-0.5">
          <Link
            href="/matches"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-[#8B9892] hover:text-[#E9EFEB] transition-colors touch-press font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to fixtures</span>
          </Link>

          <button
            onClick={handleToggleBookmark}
            type="button"
            className={`flex items-center gap-1.5 px-3 h-[36px] rounded-full text-[12px] font-semibold border transition-colors touch-press ${
              isSaved
                ? 'bg-[#E8B04A]/12 text-[#E8B04A] border-[#E8B04A]/30'
                : 'bg-[#101613] border-[#1F2A24] text-[#8B9892] hover:text-[#E9EFEB]'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-[#E8B04A]' : ''}`} strokeWidth={2} />
            <span>{isSaved ? 'Saved' : 'Save'}</span>
          </button>
        </div>

        {/* Basketball Header Card */}
        <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#8B9892] border-b border-[#1F2A24] pb-2.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-[#E9EFEB]">{leagueCode}</span>
              <span className="text-[#5E6B65]">·</span>
              <span>{cleanDisplayText(fixture.seasonYear || '2026 to 2027')}</span>
              {bStats?.neutral && (
                <span className="px-2 py-0.5 rounded-full bg-[#151D19] border border-[#1F2A24] text-[10px] text-[#E9EFEB]">
                  Neutral court
                </span>
              )}
              {isFinished ? (
                <span className="px-2 py-0.5 rounded-full bg-[#B8E636]/12 text-[#B8E636] text-[10px] font-semibold border border-[#B8E636]/30">
                  Final
                </span>
              ) : isLive ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E5684F]/15 text-[#E5684F] text-[10px] font-semibold border border-[#E5684F]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E5684F] animate-pulse" />
                  LIVE
                </span>
              ) : fixture.status === 'POSTPONED' || fixture.status === 'CANCELED' ? (
                <span className="px-2 py-0.5 rounded-full bg-[#E8B04A]/15 text-[#E8B04A] text-[10px] font-semibold border border-[#E8B04A]/30">
                  {fixture.status}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-[#151D19] text-[#8B9892] text-[10px] font-medium border border-[#1F2A24]">
                  Scheduled
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 text-[11px] text-[#8B9892] tabular-nums">
              <span className="flex items-center gap-1" suppressHydrationWarning>
                <Calendar className="w-3.5 h-3.5 text-[#5E6B65]" strokeWidth={1.8} />
                <span suppressHydrationWarning>
                  {kickoff.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Africa/Lagos' })}
                </span>
              </span>
              <span className="flex items-center gap-1" suppressHydrationWarning>
                <Clock className="w-3.5 h-3.5 text-[#5E6B65]" strokeWidth={1.8} />
                <span suppressHydrationWarning>
                  {formatMatchTime(fixture.kickoffTime, 'Africa/Lagos')}
                </span>
              </span>
            </div>
          </div>

          {/* Teams */}
          <div className="space-y-2 py-0.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <TeamCrest canonicalTeamId={fixture.homeTeam.id} crestUrl={fixture.homeTeam.crestUrl} teamName={homeName} size={24} />
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-[#E9EFEB] truncate">{cleanDisplayText(homeName)}</div>
                  {!needsHistory && bStats && (
                    <div className="text-[10.5px] text-[#8B9892] tabular-nums truncate">
                      Avg {bStats.homeOff.toFixed(1)} scored · {bStats.homeDef.toFixed(1)} allowed
                      {bStats.homeIsB2B ? ' · Back to back' : bStats.homeRestDays !== null && bStats.homeRestDays !== undefined ? ` · ${bStats.homeRestDays}d rest` : ''}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasFinalScore ? (
                  <span className="text-[16px] font-semibold text-[#E9EFEB] tabular-nums">{fixture.homeScore}</span>
                ) : !needsHistory && homeMean !== undefined ? (
                  <span className="text-[14px] font-semibold text-[#8B9892] tabular-nums">{homeMean.toFixed(1)} proj</span>
                ) : null}
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#151D19] text-[#5E6B65] font-medium border border-[#1F2A24]">
                  Home
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <TeamCrest canonicalTeamId={fixture.awayTeam.id} crestUrl={fixture.awayTeam.crestUrl} teamName={awayName} size={24} />
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-[#E9EFEB] truncate">{cleanDisplayText(awayName)}</div>
                  {!needsHistory && bStats && (
                    <div className="text-[10.5px] text-[#8B9892] tabular-nums truncate">
                      Avg {bStats.awayOff.toFixed(1)} scored · {bStats.awayDef.toFixed(1)} allowed
                      {bStats.awayIsB2B ? ' · Back to back' : bStats.awayRestDays !== null && bStats.awayRestDays !== undefined ? ` · ${bStats.awayRestDays}d rest` : ''}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasFinalScore ? (
                  <span className="text-[16px] font-semibold text-[#E9EFEB] tabular-nums">{fixture.awayScore}</span>
                ) : !needsHistory && awayMean !== undefined ? (
                  <span className="text-[14px] font-semibold text-[#8B9892] tabular-nums">{awayMean.toFixed(1)} proj</span>
                ) : null}
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#151D19] text-[#5E6B65] font-medium border border-[#1F2A24]">
                  Away
                </span>
              </div>
            </div>

            {hasH1Score && (
              <div className="text-[11px] text-[#8B9892] tabular-nums pt-0.5">
                Official 1st half score: <strong className="text-[#E9EFEB]">{fixture.homeHalfTimeScore} to {fixture.awayHalfTimeScore}</strong> (Total {(fixture.homeHalfTimeScore! + fixture.awayHalfTimeScore!)})
              </div>
            )}
          </div>

          {/* 2x2 Projection Grid */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1F2A24]">
            <div className="p-2.5 bg-[#151D19] rounded-[10px]">
              <span className="text-[10.5px] text-[#8B9892] block">Projected Game Total</span>
              <div className="mt-0.5 text-[14px] font-semibold text-[#E9EFEB] tabular-nums">
                {!needsHistory && totalMean !== undefined ? (
                  <>
                    {totalMean.toFixed(1)}{totalStd ? ` ± ${totalStd.toFixed(1)}` : ''}
                  </>
                ) : (
                  <span className="text-[#5E6B65]">—</span>
                )}
              </div>
            </div>

            <div className="p-2.5 bg-[#151D19] rounded-[10px]">
              <span className="text-[10.5px] text-[#8B9892] block">1st Half Total Projection</span>
              <div className="mt-0.5 text-[14px] font-semibold text-[#E9EFEB] tabular-nums">
                {!needsHistory && !needsH1History && h1TotalMean !== undefined ? (
                  <>
                    {h1TotalMean.toFixed(1)}{h1TotalStd ? ` ± ${h1TotalStd.toFixed(1)}` : ''}
                  </>
                ) : (
                  <span className="text-[#E8B04A] text-[12px]">Needs history</span>
                )}
              </div>
            </div>

            <div className="p-2.5 bg-[#151D19] rounded-[10px]">
              <span className="text-[10.5px] text-[#8B9892] block">Team Totals Projection</span>
              <div className="mt-0.5 text-[14px] font-semibold text-[#E9EFEB] tabular-nums">
                {!needsHistory && homeMean !== undefined && awayMean !== undefined ? (
                  `${homeMean.toFixed(1)} to ${awayMean.toFixed(1)}`
                ) : (
                  <span className="text-[#5E6B65]">—</span>
                )}
              </div>
            </div>

            <div className="p-2.5 bg-[#151D19] rounded-[10px]">
              <span className="text-[10.5px] text-[#8B9892] block">Site &amp; OT / H2H Context</span>
              <div className="mt-0.5 text-[12px] font-semibold text-[#E9EFEB] tabular-nums truncate">
                {proj ? (
                  <>
                    {proj.neutral ? 'Neutral (0 edge)' : `Home +${proj.homeAdvantagePts.toFixed(1)}`}
                    {proj.h2hMeetings >= 2 && proj.h2hAvgTotal !== null ? ` · H2H ${proj.h2hAvgTotal.toFixed(1)}` : ''}
                  </>
                ) : (
                  <span className="text-[#5E6B65]">—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Honest Needs history vs Totals Evaluation */}
        {needsHistory ? (
          <div className="rounded-[14px] p-3.5 border border-[#E8B04A]/30 bg-[#E8B04A]/10 space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#E8B04A]">
              <AlertCircle className="w-4 h-4 text-[#E8B04A] shrink-0" strokeWidth={2} />
              <span>Needs history</span>
            </div>
            <p className="text-[12px] text-[#E9EFEB] leading-[1.5]">
              {cleanDisplayText(abstentionReason)}. Model lines and probabilities are withheld rather than invented from incomplete sample history.
            </p>
          </div>
        ) : (
          <>
            {bbTopPick && (
              <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex items-center gap-1.5 text-[11.5px] text-[#B8E636] font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                    <span>Top Totals Selection</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tierStyle(bbTopPick.tier)}`}>
                    {bbTopPick.tier}
                  </span>
                  {bbTopPick.isModelLine ? (
                    <span className="text-[11px] text-[#8B9892] bg-[#151D19] px-2 py-0.5 rounded-full border border-[#1F2A24]">
                      {bbTopPick.priceSource}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#E9EFEB] bg-[#151D19] px-2 py-0.5 rounded-full border border-[#1F2A24] tabular-nums">
                      {bbTopPick.priceSource} @{bbTopPick.marketOdds?.toFixed(2)}
                      {bbTopPick.expectedValue !== null
                        ? ` · EV ${bbTopPick.expectedValue >= 0 ? '+' : ''}${(bbTopPick.expectedValue * 100).toFixed(1)}%`
                        : ''}
                    </span>
                  )}
                </div>

                <h3 className="text-[15px] font-semibold text-[#E9EFEB]">
                  {cleanDisplayText(bbTopPick.selection)} · {(bbTopPick.calibratedProbability * 100).toFixed(1)}% calibrated probability
                </h3>

                <p className="text-[12px] text-[#8B9892] leading-normal">
                  {cleanDisplayText(bbTopPick.evidenceLine)}
                </p>
              </div>
            )}

            {needsH1History && (
              <div className="rounded-[12px] p-3 border border-[#E8B04A]/25 bg-[#E8B04A]/8 text-[12px] text-[#E9EFEB] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#E8B04A] shrink-0" />
                <span>
                  1st half totals withheld (Needs history): {cleanDisplayText(proj?.h1AbstentionReason || 'Insufficient verified half scores')}.
                </span>
              </div>
            )}

            {/* Authorized Totals Markets Board & Evidence Inspector */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
              <div className="lg:col-span-7 bg-[#101613] border border-[#1F2A24] rounded-[14px] overflow-hidden divide-y divide-[#1F2A24]">
                <div className="p-3 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-[#E9EFEB]">Authorized Totals Markets</h3>
                  <span className="text-[10.5px] text-[#8B9892]">Game · Team · 1st Half</span>
                </div>
                {bbPicks.length > 0 ? (
                  bbPicks.map((p) => {
                    const key = `${p.marketCode}_${p.line}`;
                    const isSelected = activeBbPick ? `${activeBbPick.marketCode}_${activeBbPick.line}` === key : false;
                    const sett = getClientBbSettlement(p, fixture);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedBbPickKey(key)}
                        className={`w-full text-left p-3 space-y-1.5 transition-colors ${
                          isSelected ? 'bg-[#151D19]' : 'hover:bg-[#151D19]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10.5px] text-[#8B9892]">
                            {BB_CAT_TITLES[p.marketCategory]}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isFinished && (
                              <span
                                className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                  sett.status === 'WON'
                                    ? 'bg-[#B8E636]/12 text-[#B8E636] border-[#B8E636]/30'
                                    : sett.status === 'LOST'
                                    ? 'bg-[#E5684F]/15 text-[#E5684F] border-[#E5684F]/30'
                                    : 'bg-[#151D19] text-[#8B9892] border-[#1F2A24]'
                                }`}
                              >
                                {sett.status}
                              </span>
                            )}
                            <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full border font-semibold ${tierStyle(p.tier)}`}>
                              {p.tier}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13.5px] font-semibold text-[#E9EFEB]">
                            {cleanDisplayText(p.selection)}
                          </span>
                          <span className="text-[13.5px] font-semibold text-[#B8E636] tabular-nums">
                            {(p.calibratedProbability * 100).toFixed(1)}%
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-[#8B9892] tabular-nums">
                          <span>Proj {p.projectedMean.toFixed(1)} (±{p.projectedStd.toFixed(1)})</span>
                          <span>
                            {p.isModelLine
                              ? p.priceSource
                              : `${p.priceSource} @${p.marketOdds?.toFixed(2)}${
                                  p.expectedValue !== null
                                    ? ` · EV ${p.expectedValue >= 0 ? '+' : ''}${(p.expectedValue * 100).toFixed(1)}%`
                                    : ''
                                }`}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-4 text-[12px] text-[#8B9892]">
                    No totals markets cleared evaluation gates for this matchup.
                  </div>
                )}
              </div>

              {/* Inspector Panel */}
              <div className="lg:col-span-5 bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold text-[#E9EFEB]">Selected line evidence audit</h3>
                  <span className="text-[11px] text-[#B8E636] font-semibold">Real numbers only</span>
                </div>

                {activeBbPick ? (
                  <div className="space-y-2.5 text-[12px]">
                    <div className="bg-[#151D19] rounded-[10px] p-2.5 space-y-1">
                      <div className="text-[10.5px] text-[#8B9892]">{BB_CAT_TITLES[activeBbPick.marketCategory]}</div>
                      <div className="text-[14px] font-semibold text-[#E9EFEB]">
                        {cleanDisplayText(activeBbPick.selection)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                      <div className="bg-[#151D19] rounded-[8px] p-2">
                        <span className="text-[#8B9892] block">Raw → Calibrated</span>
                        <span className="text-[#E9EFEB] font-semibold">
                          {(activeBbPick.rawProbability * 100).toFixed(1)}% → {(activeBbPick.calibratedProbability * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="bg-[#151D19] rounded-[8px] p-2">
                        <span className="text-[#8B9892] block">Walk-forward gate</span>
                        <span className={activeBbPick.passedBaselineGate ? 'text-[#B8E636] font-semibold' : 'text-[#E8B04A] font-semibold'}>
                          {activeBbPick.passedBaselineGate ? 'Passed baseline' : 'Speculative only'}
                        </span>
                      </div>
                      <div className="bg-[#151D19] rounded-[8px] p-2">
                        <span className="text-[#8B9892] block">Price source</span>
                        <span className="text-[#E9EFEB] font-medium">
                          {activeBbPick.isModelLine
                            ? activeBbPick.priceSource
                            : `${activeBbPick.priceSource} @${activeBbPick.marketOdds?.toFixed(2)}`}
                        </span>
                      </div>
                      <div className="bg-[#151D19] rounded-[8px] p-2">
                        <span className="text-[#8B9892] block">Expected Value (EV)</span>
                        <span className="text-[#E9EFEB] font-semibold">
                          {activeBbPick.isModelLine || activeBbPick.expectedValue === null
                            ? 'N/A (no price)'
                            : `${activeBbPick.expectedValue >= 0 ? '+' : ''}${(activeBbPick.expectedValue * 100).toFixed(1)}%`}
                        </span>
                      </div>
                    </div>

                    {isFinished && (
                      <div className="bg-[#151D19] rounded-[8px] p-2 text-[11.5px] flex items-center justify-between">
                        <span className="text-[#8B9892]">Official settlement</span>
                        <span className="font-semibold text-[#E9EFEB]">
                          {(() => {
                            const s = getClientBbSettlement(activeBbPick, fixture);
                            return `${s.status}${s.actualLabel ? ` · ${s.actualLabel}` : ''}`;
                          })()}
                        </span>
                      </div>
                    )}

                    <div className="text-[11.5px] text-[#8B9892] leading-relaxed bg-[#0A0F0D] border border-white/[0.04] rounded-[8px] p-2.5">
                      <span className="text-[#E9EFEB] font-medium">Evidence: </span>
                      {cleanDisplayText(activeBbPick.evidenceLine)}
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-[#8B9892]">Select a totals line to inspect model evidence.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  const totalXg = stats ? stats.homeXg + stats.awayXg : 0;
  const totalCorners = stats ? stats.expectedCornersHome + stats.expectedCornersAway : 0;

  return (
    <div className="space-y-3 py-1">
      {/* Back and Save controls sit in one row */}
      <div className="flex items-center justify-between pb-0.5">
        <Link
          href="/matches"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[#8B9892] hover:text-[#E9EFEB] transition-colors touch-press font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to fixtures</span>
        </Link>

        <button
          onClick={handleToggleBookmark}
          type="button"
          className={`flex items-center gap-1.5 px-3 h-[36px] rounded-full text-[12px] font-semibold border transition-colors touch-press ${
            isSaved
              ? 'bg-[#E8B04A]/12 text-[#E8B04A] border-[#E8B04A]/30'
              : 'bg-[#101613] border-[#1F2A24] text-[#8B9892] hover:text-[#E9EFEB]'
          }`}
        >
          <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-[#E8B04A]' : ''}`} strokeWidth={2} />
          <span>{isSaved ? 'Saved' : 'Save'}</span>
        </button>
      </div>

      {/* Match Header Card: League, Date & Team News chip, then two team rows with Home/Away on the right */}
      <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3.5 space-y-3">
        {/* League and meta row */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#8B9892] border-b border-[#1F2A24] pb-2.5">
          <div className="flex items-center gap-1.5 truncate flex-wrap">
            <span className="font-semibold text-[#E9EFEB]">{cleanDisplayText(fixture.competition.name)}</span>
            <span className="text-[#5E6B65]">·</span>
            <span className="tabular-nums">MD {fixture.matchday}</span>
            {(() => {
              const kickoffMs = kickoff.getTime();
              const isPastKickoff = !isNaN(kickoffMs) && Date.now() >= kickoffMs;
              const hasVerifiedLiveMinute = typeof fixture.minute === 'number' && !isNaN(fixture.minute);
              if (fixture.status === 'FINISHED') {
                return (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-[#B8E636]/12 text-[#B8E636] text-[10px] font-semibold border border-[#B8E636]/30">
                    FT
                  </span>
                );
              }
              if (fixture.status === 'IN_PLAY' && hasVerifiedLiveMinute) {
                return (
                  <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E5684F]/15 text-[#E5684F] text-[10px] font-semibold border border-[#E5684F]/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E5684F] animate-pulse" />
                    LIVE {fixture.minute}&apos;
                  </span>
                );
              }
              if (fixture.status === 'PAUSED') {
                return (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-[#E8B04A]/15 text-[#E8B04A] text-[10px] font-semibold border border-[#E8B04A]/30">
                    HT
                  </span>
                );
              }
              if (fixture.status === 'POSTPONED') {
                return (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-[#E8B04A]/15 text-[#E8B04A] text-[10px] font-semibold border border-[#E8B04A]/30">
                    Postponed
                  </span>
                );
              }
              if (fixture.status === 'CANCELED') {
                return (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-[#E5684F]/15 text-[#E5684F] text-[10px] font-semibold border border-[#E5684F]/30">
                    Canceled
                  </span>
                );
              }
              if (isPastKickoff || (fixture.status === 'IN_PLAY' && !hasVerifiedLiveMinute)) {
                return (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-[#E8B04A]/15 text-[#E8B04A] text-[10px] font-semibold border border-[#E8B04A]/30">
                    kicked off, awaiting result
                  </span>
                );
              }
              return null;
            })()}
            {lineupState && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#151D19] border border-[#1F2A24] text-[#B8E636]">
                Team news
              </span>
            )}
            {(() => {
              const staleMatch = noRecommendationReason?.match(/last match (\d+) days ago/);
              const sDays = staleMatch ? staleMatch[1] : null;
              if (sDays) {
                return (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-[#E8B04A]/15 text-[#E8B04A] text-[9.5px] font-semibold border border-[#E8B04A]/30">
                    Stale data · {sDays}d
                  </span>
                );
              }
              return null;
            })()}
          </div>

          <div className="flex items-center gap-2.5 text-[11px] text-[#8B9892] tabular-nums">
            <span className="flex items-center gap-1" suppressHydrationWarning>
              <Calendar className="w-3.5 h-3.5 text-[#5E6B65]" strokeWidth={1.8} />
              <span suppressHydrationWarning>
                {kickoff.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Africa/Lagos' })}
              </span>
            </span>
            <span className="flex items-center gap-1" suppressHydrationWarning>
              <Clock className="w-3.5 h-3.5 text-[#5E6B65]" strokeWidth={1.8} />
              <span suppressHydrationWarning>
                {formatMatchTime(fixture.kickoffTime, 'Africa/Lagos')}
              </span>
            </span>
          </div>
        </div>

        {/* Teams Matchup: Two team rows with Home/Away on the right */}
        <div className="space-y-2 py-0.5">
          {/* Home Team Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamCrest canonicalTeamId={fixture.homeTeam.id} crestUrl={fixture.homeTeam.crestUrl} teamName={homeName} size={24} />
              <span className="text-[14px] font-semibold text-[#E9EFEB] leading-tight truncate">
                {cleanDisplayText(homeName)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {fixture.status === 'FINISHED' ? (
                <span className="text-[14px] font-semibold text-[#E9EFEB] tabular-nums">
                  {fixture.homeScore ?? 0}
                </span>
              ) : null}
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#151D19] text-[#5E6B65] font-medium border border-[#1F2A24]">
                Home
              </span>
            </div>
          </div>

          {/* Away Team Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamCrest canonicalTeamId={fixture.awayTeam.id} crestUrl={fixture.awayTeam.crestUrl} teamName={awayName} size={24} />
              <span className="text-[14px] font-semibold text-[#E9EFEB] leading-tight truncate">
                {cleanDisplayText(awayName)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {fixture.status === 'FINISHED' ? (
                <span className="text-[14px] font-semibold text-[#E9EFEB] tabular-nums">
                  {fixture.awayScore ?? 0}
                </span>
              ) : null}
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#151D19] text-[#5E6B65] font-medium border border-[#1F2A24]">
                Away
              </span>
            </div>
          </div>
        </div>

        {/* 2x2 grid of xG, Corners, Projected cards and Confidence. Show "—" in dim grey when there is no data. Do not show "0.00". */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1F2A24]">
          {/* Tile 1: xG */}
          <div className="p-2.5 bg-[#151D19] rounded-[10px]">
            <span className="text-[10.5px] text-[#8B9892] block">Expected goals (xG)</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              {!isDataInsufficient && stats && (stats.homeXg > 0 || stats.awayXg > 0) ? (
                <span className="text-[14px] font-semibold text-[#E9EFEB] tabular-nums">
                  {stats.homeXg.toFixed(2)} to {stats.awayXg.toFixed(2)}
                </span>
              ) : (
                <span className="text-[14px] font-semibold text-[#5E6B65]">—</span>
              )}
            </div>
          </div>

          {/* Tile 2: Corners */}
          <div className="p-2.5 bg-[#151D19] rounded-[10px]">
            <span className="text-[10.5px] text-[#8B9892] block">Corner expectation</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              {!isDataInsufficient && stats && totalCorners > 0 ? (
                <span className="text-[14px] font-semibold text-[#E9EFEB] tabular-nums">
                  {totalCorners.toFixed(1)} corners
                </span>
              ) : (
                <span className="text-[14px] font-semibold text-[#5E6B65]">—</span>
              )}
            </div>
          </div>

          {/* Tile 3: Projected Cards */}
          <div className="p-2.5 bg-[#151D19] rounded-[10px]">
            <span className="text-[10.5px] text-[#8B9892] block">Projected cards</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              {!isDataInsufficient && stats && stats.expectedCards > 0 ? (
                <span className="text-[14px] font-semibold text-[#E9EFEB] tabular-nums">
                  {stats.expectedCards.toFixed(1)} cards
                </span>
              ) : (
                <span className="text-[14px] font-semibold text-[#5E6B65]">—</span>
              )}
            </div>
          </div>

          {/* Tile 4: Confidence */}
          <div className="p-2.5 bg-[#151D19] rounded-[10px]">
            <span className="text-[10.5px] text-[#8B9892] block">Model confidence</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              {!isDataInsufficient && stats && stats.uncertaintyScore !== null && stats.uncertaintyScore !== undefined ? (
                <span className="text-[14px] font-semibold text-[#B8E636] tabular-nums">
                  {((1 - stats.uncertaintyScore) * 100).toFixed(0)}%
                </span>
              ) : (
                <span className="text-[14px] font-semibold text-[#5E6B65]">—</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Flagship Recommendation or Amber Warning Card */}
      {isDataInsufficient || !topPick ? (
        /* Amber warning card ("Statistical evidence insufficient") in place of scoreline matrix and probabilities */
        <div className="rounded-[14px] p-3.5 border border-[#E8B04A]/30 bg-[#E8B04A]/10 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#E8B04A]">
            <AlertCircle className="w-4 h-4 text-[#E8B04A] shrink-0" strokeWidth={2} />
            <span>Statistical evidence insufficient</span>
          </div>
          <p className="text-[12px] text-[#E9EFEB] leading-[1.5]">
            {noRecommendationReason || (() => {
              const hCount = fixture.homeTeam.storedMatchCount ?? 0;
              const aCount = fixture.awayTeam.storedMatchCount ?? 0;
              return `Model projection withheld: ${homeName} (${hCount} matches stored) & ${awayName} (${aCount} matches stored) have insufficient statistical depth or staleness exceeding the 21 day threshold. Rather than inventing a projection, the engine abstains to preserve calibration integrity.`;
            })()}
          </p>
        </div>
      ) : (
        <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3.5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 text-[11.5px] text-[#B8E636] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
              <span>Model probability & calibration status</span>
            </div>
            {(() => {
              const tier = getRiskTierBadge(topPick.riskTier);
              return (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tier.badgeClass}`}>
                  {tier.label}
                </span>
              );
            })()}
            {topPick.marketOdds && (
              <span className="text-[11px] text-[#E9EFEB] bg-[#151D19] px-2 py-0.5 rounded-full border border-[#1F2A24] tabular-nums">
                @{formatOdds(topPick.marketOdds)}
              </span>
            )}
          </div>
          <h3 className="text-[15px] font-semibold text-[#E9EFEB]">
            {formatSelectionName(topPick.selection)} · {((topPick.calibratedProbability ?? topPick.modelProbability) * 100).toFixed(1)}% model probability
          </h3>
          {topPick.plainEnglishReason && (
            <p className="text-[12px] text-[#8B9892] leading-normal">
              {topPick.plainEnglishReason}
            </p>
          )}
        </div>
      )}

      {/* Tabs become horizontally scrollable pills: Market Intel, Lineups, Poisson, Form, Coaches, Weather */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 border-b border-[#1F2A24]">
        {[
          { id: 'markets' as const, label: 'Market Intel' },
          { id: 'lineups' as const, label: 'Lineups' },
          { id: 'poisson' as const, label: 'Poisson' },
          { id: 'form' as const, label: 'Form' },
          { id: 'coaches' as const, label: 'Coaches' },
          { id: 'weather' as const, label: 'Weather' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveAnalysisTab(tab.id)}
            type="button"
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 ${
              activeAnalysisTab === tab.id
                ? 'bg-[#B8E636]/12 text-[#B8E636] border border-[#B8E636]/30 font-semibold'
                : 'bg-[#151D19] text-[#8B9892] border border-[#1F2A24] hover:text-[#E9EFEB]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Confidence Tiers: Compact rows with a coloured dot, title, one-line description and a "0 lines" count badge */}
      {activeAnalysisTab === 'markets' && (
        <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5E6B65]">
            CONFIDENCE TIERS
          </div>
          <div className="divide-y divide-[#1F2A24] text-[12px]">
            {/* High confidence row */}
            <div className="py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#B8E636] shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-[#E9EFEB]">High Confidence</span>
                  <p className="text-[11px] text-[#8B9892] truncate">Narrow variance bounds & high sample depth</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#151D19] border border-[#1F2A24] text-[#8B9892] tabular-nums shrink-0 font-medium">
                {highTierCount} {highTierCount === 1 ? 'line' : 'lines'}
              </span>
            </div>

            {/* Medium confidence row */}
            <div className="py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#E8B04A] shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-[#E9EFEB]">Medium Confidence</span>
                  <p className="text-[11px] text-[#8B9892] truncate">Calculated edge with moderate market spread</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#151D19] border border-[#1F2A24] text-[#8B9892] tabular-nums shrink-0 font-medium">
                {medTierCount} {medTierCount === 1 ? 'line' : 'lines'}
              </span>
            </div>

            {/* Speculative / Low confidence row */}
            <div className="py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#5E6B65] shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-[#E9EFEB]">Speculative / Abstain</span>
                  <p className="text-[11px] text-[#8B9892] truncate">High volatility lines or unverified prerequisites</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#151D19] border border-[#1F2A24] text-[#8B9892] tabular-nums shrink-0 font-medium">
                {lowTierCount} {lowTierCount === 1 ? 'line' : 'lines'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: Lineups */}
      {activeAnalysisTab === 'lineups' && lineupState && (
        <LineupComparisonPanel
          lineupState={lineupState}
          homeTeamName={homeName}
          awayTeamName={awayName}
          topPick={topPick}
          revisions={pickRevisions}
        />
      )}

      {/* TAB 2: Poisson Matrix (show only when data exists) */}
      {activeAnalysisTab === 'poisson' && (
        isDataInsufficient || !stats || !footballEvaluation ? (
          <div className="rounded-[14px] p-4 border border-[#E8B04A]/30 bg-[#E8B04A]/10 space-y-1.5 text-center">
            <AlertCircle className="w-5 h-5 text-[#E8B04A] mx-auto" />
            <h4 className="text-[13px] font-semibold text-[#E8B04A]">Poisson Matrix Withheld</h4>
            <p className="text-[12px] text-[#E9EFEB] max-w-sm mx-auto">
              Statistical evidence insufficient for {homeName} ({fixture.homeTeam.storedMatchCount ?? 0} matches stored) and {awayName} ({fixture.awayTeam.storedMatchCount ?? 0} matches stored) to parameterize Dixon Coles bivariate Poisson distribution. Abstaining rather than rendering fake probabilities.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <ScorelineMatrix
              homeTeamName={fixture.homeTeam.name}
              awayTeamName={fixture.awayTeam.name}
              homeXg={stats.homeXg}
              awayXg={stats.awayXg}
            />

            <FactorsAndStatePanel
              contextEvaluation={footballEvaluation.contextEvaluation}
              rankedOptions={footballEvaluation.rankedOptions}
              selectedOptionId={selectedPrediction?.id}
              onSelectOption={(p) => setSelectedPrediction(p)}
            />
          </div>
        )
      )}

      {/* TAB 3: Form */}
      {activeAnalysisTab === 'form' && (
        <QuantitativeFactorsAuditPanel
          homeTeamName={fixture.homeTeam.name}
          awayTeamName={fixture.awayTeam.name}
          venueName={fixture.venue}
          kickoffTime={fixture.kickoffTime}
          topPickOdds={topPick?.marketOdds || 1.95}
          topPickSelection={topPick?.selection || 'Home Win'}
          topPickProbability={topPick?.modelProbability || 0.54}
          marketCode={topPick?.marketCode || 'MATCH_RESULT_HOME'}
          initialTab="form"
        />
      )}

      {/* TAB 4: Coaches */}
      {activeAnalysisTab === 'coaches' && (
        <QuantitativeFactorsAuditPanel
          homeTeamName={fixture.homeTeam.name}
          awayTeamName={fixture.awayTeam.name}
          venueName={fixture.venue}
          kickoffTime={fixture.kickoffTime}
          topPickOdds={topPick?.marketOdds || 1.95}
          topPickSelection={topPick?.selection || 'Home Win'}
          topPickProbability={topPick?.modelProbability || 0.54}
          marketCode={topPick?.marketCode || 'MATCH_RESULT_HOME'}
          initialTab="tactics"
        />
      )}

      {/* TAB 5: Weather */}
      {activeAnalysisTab === 'weather' && (
        <QuantitativeFactorsAuditPanel
          homeTeamName={fixture.homeTeam.name}
          awayTeamName={fixture.awayTeam.name}
          venueName={fixture.venue}
          kickoffTime={fixture.kickoffTime}
          topPickOdds={topPick?.marketOdds || 1.95}
          topPickSelection={topPick?.selection || 'Home Win'}
          topPickProbability={topPick?.modelProbability || 0.54}
          marketCode={topPick?.marketCode || 'MATCH_RESULT_HOME'}
          initialTab="weather"
        />
      )}

      {/* TAB 6: Market Intel */}
      {activeAnalysisTab === 'markets' && (
        <div className="space-y-3">
          {lineupState?.anyKeyPlayerOut && (
            <div className="p-3 bg-[#E8B04A]/10 border border-[#E8B04A]/30 rounded-[12px] flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2 text-[#E8B04A] font-semibold">
                <AlertTriangle className="w-4 h-4 text-[#E8B04A] shrink-0" />
                <span>Lineup alert: {cleanDisplayText(lineupState.firstKeyPlayerOutName || 'Key player')} missing from starting XI</span>
              </div>
              <button
                onClick={() => setActiveAnalysisTab('lineups')}
                type="button"
                className="text-[11px] text-[#B8E636] hover:underline font-semibold"
              >
                Inspect XI →
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            {/* Table */}
            <div className="lg:col-span-7 space-y-3">
              <MarketComparisonTable
                predictions={predictions}
                selectedPredictionId={selectedPrediction?.id}
                onSelectPrediction={(p) => setSelectedPrediction(p)}
                homeTeamName={fixture.homeTeam.name}
                awayTeamName={fixture.awayTeam.name}
              />
            </div>

            {/* Explanation Card */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-[#E9EFEB]">Selected line evidence audit</h3>
                <span className="text-[11px] text-[#B8E636] font-semibold">Grounded facts</span>
              </div>

              <ExplanationCard
                prediction={selectedPrediction}
                noRecommendationReason={noRecommendationReason}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
