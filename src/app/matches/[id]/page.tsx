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
  MapPin, 
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

export default function MatchAnalysisPage() {
  const params = useParams();
  const id = params?.id as string;

  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    async function loadFixture() {
      try {
        setIsLoading(true);
        const isNba = id?.startsWith('nba_');
        const res = await fetch(`/api/v1/fixtures?sport=${isNba ? 'basketball' : 'football'}`, { cache: 'no-store' });
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
      homeAttackRating: fixture.homeTeam.attackRating,
      homeDefenseRating: fixture.homeTeam.defenseRating,
      awayAttackRating: fixture.awayTeam.attackRating,
      awayDefenseRating: fixture.awayTeam.defenseRating,
      homeXg: stats.homeXg,
      awayXg: stats.awayXg,
      expectedCornersHome: stats.expectedCornersHome,
      expectedCornersAway: stats.expectedCornersAway,
      expectedCards: stats.expectedCards,
      uncertaintyScore: stats.uncertaintyScore,
      dataCoverageScore: stats.dataCoverageScore,
      sampleSizeMatches: stats.sampleSizeMatches,
      stateTags: stats.stateTags,
      lineupConfirmed: stats.lineupConfirmed,
      verifiedOdds: stats.verifiedOdds,
    });
  }, [fixture, isBasketball, stats]);

  const basketballPredictions = useMemo(() => {
    if (!fixture || !isBasketball) return [];
    return generateNBAPredictions(fixture);
  }, [fixture, isBasketball]);

  const predictions = isBasketball ? basketballPredictions : (footballEvaluation?.predictions || []);
  const topPick = isBasketball ? (basketballPredictions[0] || null) : (footballEvaluation?.topPick || null);
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
        <p className="text-[12px] font-mono text-[#8B9890]">Loading live match data...</p>
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
            ? 'The requested NBA matchup data could not be retrieved from live statistical feeds.' 
            : 'The requested match data could not be retrieved from live European football pipelines.'}
        </p>
        <Link href="/matches" className="inline-block px-4 py-2 rounded-[11px] bg-[#151E19] border border-white/[0.07] text-[12px] text-[#ECF1EE] hover:bg-white/[0.05]">
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
  const homeName = fixture.homeTeam.shortName || fixture.homeTeam.name;
  const awayName = fixture.awayTeam.shortName || fixture.awayTeam.name;

  return (
    <div className="space-y-4 py-1">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between pb-1">
        <Link
          href="/matches"
          className="inline-flex items-center gap-1.5 text-[12px] text-[#8B9890] hover:text-[#ECF1EE] transition-colors touch-press"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to fixtures</span>
        </Link>

        <button
          onClick={handleToggleBookmark}
          type="button"
          className={`flex items-center gap-1.5 px-3 h-[34px] rounded-[10px] text-[12px] font-medium border transition-colors touch-press ${
            isSaved
              ? 'bg-[#E2AE45]/15 text-[#E2AE45] border-[#E2AE45]/30'
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8B9890] border-b border-white/[0.07] pb-2.5">
          <div className="flex items-center gap-1.5 truncate">
            <TeamCrest
              crestUrl={fixture.competition.emblemUrl}
              teamName={fixture.competition.name}
              size={18}
            />
            <span className="font-semibold text-[#ECF1EE]">{fixture.competition.name}</span>
            <span className="text-[#5E6A63]">·</span>
            <span className="font-mono tabular-nums">MD {fixture.matchday}</span>
            {(() => {
              const derby = (fixture.isDerby && fixture.derbyName) ? { name: fixture.derbyName } : checkDerby(fixture.homeTeam.name, fixture.awayTeam.name);
              return derby ? (
                <span className="ml-1 px-1.5 py-0.5 rounded-[4px] text-[9.5px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  ⚡ {derby.name}
                </span>
              ) : null;
            })()}
          </div>

          <div className="flex items-center gap-3 font-mono text-[10.5px] text-[#5E6A63] tabular-nums">
            <span className="flex items-center gap-1" suppressHydrationWarning>
              <Calendar className="w-3.5 h-3.5" strokeWidth={2} />
              <span suppressHydrationWarning>
                {kickoff.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
              </span>
            </span>
            <span className="flex items-center gap-1" suppressHydrationWarning>
              <Clock className="w-3.5 h-3.5" strokeWidth={2} />
              <span suppressHydrationWarning>
                {String(kickoff.getUTCHours()).padStart(2, '0')}:{String(kickoff.getUTCMinutes()).padStart(2, '0')} UTC
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
                <TeamCrest crestUrl={fixture.homeTeam.crestUrl} teamName={fixture.homeTeam.name} size={22} />
                <span className="text-[14px] font-[650] text-[#ECF1EE] leading-tight truncate">
                  {homeName}
                </span>
              </div>
              {fixture.status === 'FINISHED' ? (
                <span className="font-mono text-[14px] font-bold text-[#ECF1EE] tabular-nums">
                  {fixture.homeScore ?? 0}
                </span>
              ) : (
                <span className="text-[11px] font-mono text-[#5E6A63]">Home</span>
              )}
            </div>

            {/* Away Team */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <TeamCrest crestUrl={fixture.awayTeam.crestUrl} teamName={fixture.awayTeam.name} size={22} />
                <span className="text-[14px] font-[650] text-[#ECF1EE] leading-tight truncate">
                  {awayName}
                </span>
              </div>
              {fixture.status === 'FINISHED' ? (
                <span className="font-mono text-[14px] font-bold text-[#ECF1EE] tabular-nums">
                  {fixture.awayScore ?? 0}
                </span>
              ) : (
                <span className="text-[11px] font-mono text-[#5E6A63]">Away</span>
              )}
            </div>
          </div>

          {/* Status pill & Kickoff */}
          <div className="sm:border-l sm:border-white/[0.07] sm:pl-4 flex flex-col justify-center sm:items-end">
            <span className="text-[11px] font-mono text-[#B6E63B] font-semibold">
              {fixture.status === 'FINISHED' ? 'Completed' : 'Upcoming match'}
            </span>
            <span className="text-[12px] text-[#ECF1EE] font-mono mt-0.5 tabular-nums" suppressHydrationWarning>
              {fixture.status === 'FINISHED' ? 'Full time' : kickoff.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'}
            </span>
          </div>
        </div>

        {/* Quantitative Indicators Strip */}
        {isBasketball && fixture.basketballStats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-white/[0.07]">
            <div className="p-2.5 bg-[#151E19] rounded-[10px] border border-white/[0.05]">
              <span className="text-[10.5px] text-[#8B9890] block">Offensive Efficiency</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[13.5px] font-semibold text-[#ECF1EE] font-mono tabular-nums">
                  {fixture.basketballStats.homeOffEff.toFixed(3)}
                </span>
                <span className="text-[10px] text-[#5E6A63] font-mono ml-auto tabular-nums">
                  vs {fixture.basketballStats.awayOffEff.toFixed(3)}
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#151E19] rounded-[10px] border border-white/[0.05]">
              <span className="text-[10.5px] text-[#8B9890] block">Defensive Efficiency</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[13.5px] font-semibold text-[#ECF1EE] font-mono tabular-nums">
                  {fixture.basketballStats.homeDefEff.toFixed(3)}
                </span>
                <span className="text-[10px] text-[#5E6A63] font-mono ml-auto tabular-nums">
                  vs {fixture.basketballStats.awayDefEff.toFixed(3)}
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#151E19] rounded-[10px] border border-white/[0.05]">
              <span className="text-[10.5px] text-[#8B9890] block">Pace (Poss/G)</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[13.5px] font-semibold text-[#ECF1EE] font-mono tabular-nums">
                  {fixture.basketballStats.homePoss.toFixed(1)}
                </span>
                <span className="text-[10px] text-[#5E6A63] font-mono ml-auto tabular-nums">
                  vs {fixture.basketballStats.awayPoss.toFixed(1)}
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#151E19] rounded-[10px] border border-white/[0.05]">
              <span className="text-[10.5px] text-[#8B9890] block">Projected Total</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[13.5px] font-bold text-[#B6E63B] font-mono tabular-nums">
                  {fixture.basketballStats.projectedTotal?.toFixed(1)} pts
                </span>
                <span className="text-[10px] text-[#5E6A63] font-mono ml-auto tabular-nums">
                  M: {fixture.basketballStats.projectedMargin?.toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-white/[0.07]">
            <div className="p-2.5 bg-[#151E19] rounded-[10px] border border-white/[0.05]">
              <span className="text-[10.5px] text-[#8B9890] block">Expected goals (xG)</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[13.5px] font-semibold text-[#ECF1EE] font-mono tabular-nums">{stats.homeXg.toFixed(2)} to {stats.awayXg.toFixed(2)}</span>
                <span className="text-[10px] text-[#5E6A63] font-mono ml-auto tabular-nums">({totalXg.toFixed(2)})</span>
              </div>
            </div>

            <div className="p-2.5 bg-[#151E19] rounded-[10px] border border-white/[0.05]">
              <span className="text-[10.5px] text-[#8B9890] block">Corner expectation</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[13.5px] font-semibold text-[#ECF1EE] font-mono tabular-nums">{totalCorners.toFixed(1)}</span>
                <span className="text-[10px] text-[#5E6A63] font-mono ml-auto tabular-nums">
                  {stats.expectedCornersHome.toFixed(1)}H / {stats.expectedCornersAway.toFixed(1)}A
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#151E19] rounded-[10px] border border-white/[0.05]">
              <span className="text-[10.5px] text-[#8B9890] block">Projected cards</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[13.5px] font-semibold text-[#ECF1EE] font-mono tabular-nums">{stats.expectedCards.toFixed(1)}</span>
                <span className="text-[10px] text-[#5E6A63] font-mono ml-auto tabular-nums">Ref: {stats.expectedCards.toFixed(1)}</span>
              </div>
            </div>

            <div className="p-2.5 bg-[#151E19] rounded-[10px] border border-white/[0.05]">
              <span className="text-[10.5px] text-[#8B9890] block">Model confidence</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[13.5px] font-bold text-[#B6E63B] font-mono tabular-nums">
                  {((1 - stats.uncertaintyScore) * 100).toFixed(0)}%
                </span>
                <span className="text-[10px] text-[#5E6A63] font-mono ml-auto tabular-nums">
                  {stats.sampleSizeMatches} games
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Flagship Recommendation Banner */}
      <div className="bg-[#101713] border border-[#B6E63B]/30 rounded-[14px] p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {topPick ? (
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#B6E63B] font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                <span>Primary qualified recommendation</span>
              </div>
              {(() => {
                const tier = getRiskTierBadge(topPick.riskTier);
                return (
                  <span className={`px-2 py-0.5 rounded-[5px] text-[9.5px] font-bold font-mono tracking-wider ${tier.badgeClass}`}>
                    {tier.label}
                  </span>
                );
              })()}
              {topPick.marketOdds && (
                <span className="text-[11px] font-mono text-[#ECF1EE] bg-[#151E19] px-1.5 py-0.5 rounded-[4px] border border-white/[0.07] tabular-nums">
                  @{formatOdds(topPick.marketOdds)}
                </span>
              )}
            </div>
            <h3 className="text-[15px] font-bold text-[#ECF1EE]">
              {formatSelectionName(topPick.selection)} · {(topPick.modelProbability * 100).toFixed(1)}% probability
              {topPick.expectedValue !== undefined ? ` (${formatExpectedValue(topPick.expectedValue).text} EV)` : ''}
            </h3>
            {topPick.plainEnglishReason && (
              <p className="text-[12px] text-[#B6E63B] font-medium mt-1 max-w-2xl leading-normal">
                {topPick.plainEnglishReason}
              </p>
            )}
          </div>
        ) : (
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#8B9890] mb-1">
              <AlertCircle className="w-3.5 h-3.5" strokeWidth={2} />
              <span>No qualified recommendation</span>
            </div>
            <h3 className="text-[14px] font-semibold text-[#ECF1EE]">Statistical evidence insufficient</h3>
            <p className="text-[12px] text-[#8B9890] mt-0.5 max-w-2xl leading-normal">
              {noRecommendationReason || "Current market lines reflect efficient pricing. Abstaining to maintain statistical calibration."}
            </p>
          </div>
        )}

        <div className="shrink-0 flex items-center">
          <span className="text-[10.5px] font-mono text-[#5E6A63]">
            {isBasketball ? 'NBA Efficiency Model' : 'Dixon Coles bivariate Poisson'}
          </span>
        </div>
      </div>

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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
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
            <span className="text-[11px] text-[#B6E63B] font-mono font-medium">Grounded facts</span>
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
