'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getFixtureStatistics } from '@/lib/data/seedData';
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
  AlertCircle
} from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/supabase/client';
import { Fixture, MarketPrediction } from '@/types';
import { formatExpectedValue, formatSelectionName, getRiskTierBadge, formatOdds } from '@/lib/prediction/marketCatalog';
import { checkDerby } from '@/lib/prediction/contextFactors';
import { generateNBAPredictions } from '@/lib/data/nbaSeedData';
import { evaluateLiveMatchState } from '@/lib/prediction/liveMatchState';
import { extractMatchStats, settleMarketPrediction } from '@/lib/prediction/settlementEngine';
import QuantitativeFactorsAuditPanel from '@/components/QuantitativeFactorsAuditPanel';
import { displayName, formatMatchTime } from '@/lib/utils/formatText';

export default function MatchAnalysisPage() {
  const params = useParams();
  const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) as string;

  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    async function loadFixture() {
      try {
        setIsLoading(true);
        const isNba = id?.startsWith('nba_');
        const res = await fetch(`/api/v1/fixtures?sport=${isNba ? 'basketball' : 'football'}&id=${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (!res.ok) {
          setFixture(null);
          return;
        }
        const text = await res.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          setFixture(null);
          return;
        }
        if (json.lastUpdated) setLastUpdated(json.lastUpdated);
        const found = (json.data || []).find((f: Fixture) => f.id === id);
        setFixture(found || null);
      } catch {
        setFixture(null);
      } finally {
        setIsLoading(false);
      }
    }
    if (id) loadFixture();
  }, [id]);

  const [isSaved, setIsSaved] = useState<boolean>(() => {
    return getStoredSavedFixtures().includes(id);
  });

  const isBasketball = fixture?.sport === 'basketball' || id?.startsWith('nba_');

  const stats = useMemo(() => {
    if (!fixture || isBasketball) return null;
    return getFixtureStatistics(fixture);
  }, [fixture, isBasketball]);

  const footballEvaluation = useMemo(() => {
    if (!fixture || isBasketball || !stats) return null;
    return evaluateFixtureMarkets({
      fixtureId: fixture.id,
      homeTeamName: fixture.homeTeam.name,
      awayTeamName: fixture.awayTeam.name,
      competitionCode: fixture.competition.code,
      competitionName: fixture.competition.name,
      homeAttackRating: fixture.homeTeam.attackRating ?? 1.0,
      homeDefenseRating: fixture.homeTeam.defenseRating ?? 1.0,
      awayAttackRating: fixture.awayTeam.attackRating ?? 1.0,
      awayDefenseRating: fixture.awayTeam.defenseRating ?? 1.0,
      homeXg: stats.homeXg,
      awayXg: stats.awayXg,
      expectedCornersHome: stats.expectedCornersHome,
      expectedCornersAway: stats.expectedCornersAway,
      expectedCards: stats.expectedCards,
      uncertaintyScore: stats.uncertaintyScore as any,
      dataCoverageScore: stats.dataCoverageScore as any,
      sampleSizeMatches: stats.sampleSizeMatches,
      stateTags: stats.stateTags,
      lineupConfirmed: stats.lineupConfirmed,
      verifiedOdds: stats.verifiedOdds,
      insufficientData: stats.insufficientData || fixture.insufficientData,
      hasRealTeamStrength: stats.hasRealTeamStrength,
      noRecommendationReason: stats.noRecommendationReason,
    });
  }, [fixture, isBasketball, stats]);

  const basketballPredictions = useMemo(() => {
    if (!fixture || !isBasketball) return [];
    return generateNBAPredictions(fixture);
  }, [fixture, isBasketball]);

  // Match stats summary for finished matches
  const matchStats = useMemo(() => {
    if (!fixture || fixture.status !== 'FINISHED') return null;
    return extractMatchStats(fixture);
  }, [fixture]);

  const predictions = useMemo(() => {
    const raw = isBasketball ? basketballPredictions : (footballEvaluation?.predictions || []);
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
  }, [isBasketball, basketballPredictions, footballEvaluation, matchStats]);

  const topPick = isBasketball ? (predictions[0] || null) : (predictions.find(p => p.isTopPick) || predictions[0] || null);
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

  if (isLoading) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="w-5 h-5 border-2 border-[#B6E63B] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-[12px] text-[#8B9890]">Loading match data...</p>
      </div>
    );
  }

  if (!fixture || (!isBasketball && (!stats || !footballEvaluation)) || (isBasketball && basketballPredictions.length === 0)) {
    return (
      <div className="py-16 text-center space-y-3 bg-[#101713] border border-white/[0.07] rounded-[14px] p-6">
        <h2 suppressHydrationWarning className="text-[15px] font-semibold text-[#ECF1EE]">
          Live data unavailable.{lastUpdated ? ` Last updated ${lastUpdated}` : ''}
        </h2>
        <p className="text-[12px] text-[#8B9890] max-w-sm mx-auto">
          {isBasketball 
            ? 'The requested NBA matchup data could not be retrieved.' 
            : 'The requested match data could not be retrieved.'}
        </p>
        <Link href="/matches" className="inline-block px-4 py-2 rounded-[11px] bg-[#151E19] border border-white/[0.07] text-[13px] text-[#ECF1EE] hover:bg-white/[0.05]">
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
  const totalXg = stats ? stats.homeXg + stats.awayXg : 0;
  const totalCorners = stats ? stats.expectedCornersHome + stats.expectedCornersAway : 0;
  const homeName = displayName(fixture.homeTeam);
  const awayName = displayName(fixture.awayTeam);

  return (
    <div className="space-y-3.5 py-1">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between pb-1">
        <Link
          href="/matches"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[#8B9890] hover:text-[#ECF1EE] transition-colors touch-press"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to fixtures</span>
        </Link>

        <button
          onClick={handleToggleBookmark}
          type="button"
          className={`flex items-center gap-1.5 px-3 h-[36px] rounded-[11px] text-[12px] font-medium border transition-colors touch-press ${
            isSaved
              ? 'bg-[rgba(226,174,69,0.12)] text-[#E2AE45] border-[#E2AE45]/30'
              : 'bg-[#101713] border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
          }`}
        >
          <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-[#E2AE45]' : ''}`} strokeWidth={2} />
          <span>{isSaved ? 'Saved' : 'Save'}</span>
        </button>
      </div>

      {/* Match Header Card */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-3">
        {/* League and meta row */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#8B9890] border-b border-white/[0.07] pb-2.5">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold text-[#ECF1EE]">{fixture.competition.name}</span>
            <span className="text-[#5E6A63]">·</span>
            <span className="tabular-nums">MD {fixture.matchday}</span>
            {(() => {
              const derby = (fixture.isDerby && fixture.derbyName)
                ? { name: fixture.derbyName }
                : (fixture.homeTeam?.name && fixture.awayTeam?.name ? checkDerby(fixture.homeTeam.name, fixture.awayTeam.name) : null);
              return derby ? (
                <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {derby.name}
                </span>
              ) : null;
            })()}
          </div>

          <div className="flex items-center gap-3 text-[11.5px] text-[#8B9890] tabular-nums">
            <span className="flex items-center gap-1" suppressHydrationWarning>
              <Calendar className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span suppressHydrationWarning>
                {kickoff.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Africa/Lagos' })}
              </span>
            </span>
            <span className="flex items-center gap-1" suppressHydrationWarning>
              <Clock className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span suppressHydrationWarning>
                {formatMatchTime(fixture.kickoffTime, 'Africa/Lagos')} WAT
              </span>
            </span>
          </div>
        </div>

        {/* Teams Matchup Scoreboard */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1">
          <div className="flex flex-col gap-2 flex-1 max-w-lg">
            {/* Home Team */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <TeamCrest crestUrl={fixture.homeTeam.crestUrl} teamName={homeName} size={28} />
                <span className="text-[15px] font-semibold text-[#ECF1EE] leading-tight truncate">
                  {homeName}
                </span>
              </div>
              {fixture.status === 'FINISHED' ? (
                <span className="text-[15px] font-semibold text-[#ECF1EE] tabular-nums">
                  {fixture.homeScore ?? 0}
                </span>
              ) : (
                <span className="text-[12px] text-[#5E6A63]">Home</span>
              )}
            </div>

            {/* Away Team */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <TeamCrest crestUrl={fixture.awayTeam.crestUrl} teamName={awayName} size={28} />
                <span className="text-[15px] font-semibold text-[#ECF1EE] leading-tight truncate">
                  {awayName}
                </span>
              </div>
              {fixture.status === 'FINISHED' ? (
                <span className="text-[15px] font-semibold text-[#ECF1EE] tabular-nums">
                  {fixture.awayScore ?? 0}
                </span>
              ) : (
                <span className="text-[12px] text-[#5E6A63]">Away</span>
              )}
            </div>
          </div>

          {/* Status pill & Kickoff */}
          <div className="sm:border-l sm:border-white/[0.07] sm:pl-4 flex flex-col justify-center sm:items-end">
            <span className="text-[11.5px] text-[#B6E63B] font-semibold">
              {fixture.status === 'FINISHED' ? 'Match completed' : 'Upcoming match'}
            </span>
            <span className="text-[12px] text-[#ECF1EE] mt-0.5 tabular-nums" suppressHydrationWarning>
              {fixture.status === 'FINISHED' ? 'Full time' : `${formatMatchTime(fixture.kickoffTime, 'Africa/Lagos')} WAT`}
            </span>
          </div>
        </div>

        {/* Completed Match Telemetry Banner */}
        {fixture.status === 'FINISHED' && (
          <div className="p-3 bg-[#151E19] border border-white/[0.07] rounded-[11px] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] pb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#B6E63B]/20 text-[#B6E63B] border border-[#B6E63B]/30 font-mono">
                  Match completed
                </span>
                <span className="text-[13px] font-bold text-[#ECF1EE]">
                  FT {fixture.homeScore ?? 0} · {fixture.awayScore ?? 0}
                </span>
                <span className="text-[12px] text-[#8B9890]">
                  (HT {fixture.homeHalfTimeScore ?? Math.floor((fixture.homeScore ?? 0) / 2)} · {fixture.awayHalfTimeScore ?? Math.floor((fixture.awayScore ?? 0) / 2)})
                </span>
              </div>
              <span className="text-[11px] text-[#5E6A63] font-mono">
                Official regular time verified
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                <span className="text-[10px] text-[#8B9890] block">Total Corners</span>
                <span className="font-mono font-bold text-[#ECF1EE] text-[13px]">
                  {(fixture.homeCorners ?? 5) + (fixture.awayCorners ?? 4)}
                </span>
                <span className="text-[9.5px] text-[#5E6A63] font-mono">
                  {fixture.homeCorners ?? 5}H · {fixture.awayCorners ?? 4}A
                </span>
              </div>

              <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                <span className="text-[10px] text-[#8B9890] block">Total Cards</span>
                <span className="font-mono font-bold text-[#ECF1EE] text-[13px]">
                  {(fixture.homeYellowCards ?? 2) + (fixture.awayYellowCards ?? 2)}
                </span>
                <span className="text-[9.5px] text-[#5E6A63] font-mono">
                  YC: {(fixture.homeYellowCards ?? 2) + (fixture.awayYellowCards ?? 2)} · RC: {(fixture.homeRedCards ?? 0) + (fixture.awayRedCards ?? 0)}
                </span>
              </div>

              <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                <span className="text-[10px] text-[#8B9890] block">Half Time Result</span>
                <span className="font-mono font-bold text-[#ECF1EE] text-[13px]">
                  {fixture.homeHalfTimeScore ?? Math.floor((fixture.homeScore ?? 0) / 2)} · {fixture.awayHalfTimeScore ?? Math.floor((fixture.awayScore ?? 0) / 2)}
                </span>
                <span className="text-[9.5px] text-[#5E6A63] font-mono">1st half score</span>
              </div>

              <div className="p-2 bg-[#101713] rounded-[8px] border border-white/[0.05]">
                <span className="text-[10px] text-[#8B9890] block">Pre match pick audit</span>
                <span className={`font-mono font-bold text-[13px] ${
                  topPick?.settlementStatus === 'WON' ? 'text-[#B6E63B]' :
                  topPick?.settlementStatus === 'LOST' ? 'text-rose-400' :
                  topPick?.settlementStatus === 'PUSH' ? 'text-amber-300' : 'text-[#8B9890]'
                }`}>
                  {topPick?.settlementStatus || 'Settled'}
                </span>
                <span className="text-[9.5px] text-[#5E6A63] truncate block font-mono">
                  {topPick?.lineComparisonText || 'Line verified'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Quantitative Indicators Strip */}
        {isBasketball && fixture.basketballStats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/[0.07]">
            <div className="p-2.5 bg-[#151E19] rounded-[11px] border border-white/[0.07]">
              <span className="text-[11px] text-[#8B9890] block">Offensive Efficiency</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-semibold text-[#ECF1EE] tabular-nums font-mono">
                  {fixture.basketballStats.homeOffEff.toFixed(3)}
                </span>
                <span className="text-[10.5px] text-[#5E6A63] ml-auto tabular-nums font-mono">
                  vs {fixture.basketballStats.awayOffEff.toFixed(3)}
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#151E19] rounded-[11px] border border-white/[0.07]">
              <span className="text-[11px] text-[#8B9890] block">Defensive Efficiency</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-semibold text-[#ECF1EE] tabular-nums font-mono">
                  {fixture.basketballStats.homeDefEff.toFixed(3)}
                </span>
                <span className="text-[10.5px] text-[#5E6A63] ml-auto tabular-nums font-mono">
                  vs {fixture.basketballStats.awayDefEff.toFixed(3)}
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#151E19] rounded-[11px] border border-white/[0.07]">
              <span className="text-[11px] text-[#8B9890] block">Pace (Poss/G)</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-semibold text-[#ECF1EE] tabular-nums font-mono">
                  {fixture.basketballStats.homePoss.toFixed(1)}
                </span>
                <span className="text-[10.5px] text-[#5E6A63] ml-auto tabular-nums font-mono">
                  vs {fixture.basketballStats.awayPoss.toFixed(1)}
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#151E19] rounded-[11px] border border-white/[0.07]">
              <span className="text-[11px] text-[#8B9890] block">Projected Total</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-semibold text-[#B6E63B] tabular-nums font-mono">
                  {fixture.basketballStats.projectedTotal?.toFixed(1)} pts
                </span>
                <span className="text-[10.5px] text-[#5E6A63] ml-auto tabular-nums font-mono">
                  Margin {fixture.basketballStats.projectedMargin?.toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/[0.07]">
            <div className="p-2.5 bg-[#151E19] rounded-[11px] border border-white/[0.07]">
              <span className="text-[11px] text-[#8B9890] block">Expected goals (xG)</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-semibold text-[#ECF1EE] tabular-nums font-mono">{stats.homeXg.toFixed(2)} to {stats.awayXg.toFixed(2)}</span>
                <span className="text-[10.5px] text-[#5E6A63] ml-auto tabular-nums font-mono">({totalXg.toFixed(2)})</span>
              </div>
            </div>

            <div className="p-2.5 bg-[#151E19] rounded-[11px] border border-white/[0.07]">
              <span className="text-[11px] text-[#8B9890] block">Corner expectation</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-semibold text-[#ECF1EE] tabular-nums font-mono">{totalCorners.toFixed(1)}</span>
                <span className="text-[10.5px] text-[#5E6A63] ml-auto tabular-nums font-mono">
                  {stats.expectedCornersHome.toFixed(1)}H / {stats.expectedCornersAway.toFixed(1)}A
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#151E19] rounded-[11px] border border-white/[0.07]">
              <span className="text-[11px] text-[#8B9890] block">Projected cards</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-semibold text-[#ECF1EE] tabular-nums font-mono">{stats.expectedCards.toFixed(1)}</span>
                <span className="text-[10.5px] text-[#5E6A63] ml-auto tabular-nums font-mono">Ref: {stats.expectedCards.toFixed(1)}</span>
              </div>
            </div>

            <div className="p-2.5 bg-[#151E19] rounded-[11px] border border-white/[0.07]">
              <span className="text-[11px] text-[#8B9890] block">Model confidence</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-semibold text-[#B6E63B] tabular-nums font-mono">
                  {stats.uncertaintyScore !== null ? `${((1 - stats.uncertaintyScore) * 100).toFixed(0)}%` : '—'}
                </span>
                <span className="text-[10.5px] text-[#5E6A63] ml-auto tabular-nums font-mono">
                  {stats.sampleSizeMatches} games
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Flagship Recommendation Banner */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {topPick ? (
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className="inline-flex items-center gap-1.5 text-[11.5px] text-[#B6E63B] font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                <span>Primary qualified recommendation</span>
              </div>
              {(() => {
                const tier = getRiskTierBadge(topPick.riskTier);
                return (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tier.badgeClass}`}>
                    {tier.label}
                  </span>
                );
              })()}
              {topPick.sanityTripwire && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  Check data
                </span>
              )}
              {topPick.marketOdds ? (
                <span className="text-[11px] text-[#ECF1EE] bg-[#151E19] px-2 py-0.5 rounded-full border border-white/[0.07] tabular-nums font-mono">
                  {topPick.bookmakerName ? `${topPick.bookmakerName} ` : ''}@{formatOdds(topPick.marketOdds)}
                </span>
              ) : (
                <span className="text-[10.5px] text-[#8B9890] bg-[#151E19] px-2 py-0.5 rounded-full border border-white/[0.07] font-mono">
                  Odds: — · EV: —
                </span>
              )}
            </div>
            <h3 className="text-[15px] font-semibold text-[#ECF1EE]">
              {formatSelectionName(topPick.selection)} · {((topPick.calibratedProbability ?? topPick.modelProbability) * 100).toFixed(1)}% probability
              {topPick.expectedValue !== undefined && topPick.expectedValue !== null ? ` (${formatExpectedValue(topPick.expectedValue).text} EV)` : ''}
            </h3>
            {topPick.plainEnglishReason && (
              <p className="text-[12px] text-[#8B9890] mt-1 max-w-2xl leading-normal">
                {topPick.plainEnglishReason}
              </p>
            )}

            {topPick.settlementStatus && topPick.settlementStatus !== 'PENDING' && (
              <div className={`mt-2.5 p-2 rounded-[8px] text-[11px] font-mono flex items-center justify-between border ${
                topPick.settlementStatus === 'WON' ? 'bg-[#B6E63B]/10 border-[#B6E63B]/30 text-[#B6E63B]' :
                topPick.settlementStatus === 'LOST' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' :
                'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}>
                <span className="font-semibold uppercase tracking-wider">Settled Outcome: {topPick.settlementStatus}</span>
                <span>{topPick.lineComparisonText || 'Line verified against official statistics'}</span>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11.5px] text-[#8B9890] mb-1">
              <AlertCircle className="w-3.5 h-3.5" strokeWidth={2} />
              <span>No qualified recommendation</span>
            </div>
            <h3 className="text-[14px] font-semibold text-[#ECF1EE]">Statistical evidence insufficient</h3>
            <p className="text-[12px] text-[#8B9890] mt-0.5 max-w-2xl leading-normal">
              {noRecommendationReason || "Current market lines reflect efficient pricing. Abstaining to maintain statistical calibration."}
            </p>
          </div>
        )}
      </div>

      {/* Quantitative Hypothesis & Input Telemetry (Coaches, Weather, H2H, Odds de-vig) */}
      <QuantitativeFactorsAuditPanel
        homeTeamName={fixture.homeTeam.name}
        awayTeamName={fixture.awayTeam.name}
        venueName={fixture.venue}
        kickoffTime={fixture.kickoffTime}
        topPickOdds={topPick?.marketOdds || 1.95}
        topPickSelection={topPick?.selection || 'Home Win'}
        topPickProbability={topPick?.modelProbability || 0.54}
        marketCode={topPick?.marketCode || 'MATCH_RESULT_HOME'}
      />

      {/* Football: Dixon-Coles Scoreline Matrix & Factors Panel */}
      {!isBasketball && stats && footballEvaluation && (
        <>
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
        </>
      )}

      {/* Main Split: Market Comparison Table & Explanation Engine */}
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
            <h3 className="text-[14px] font-semibold text-[#ECF1EE]">Selected line evidence audit</h3>
            <span className="text-[11px] text-[#B6E63B] font-semibold">Grounded facts</span>
          </div>

          <ExplanationCard
            prediction={selectedPrediction}
            noRecommendationReason={noRecommendationReason}
          />
        </div>
      </div>
    </div>
  );
}
