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
  UserCheck, 
  Bookmark,
  CheckCircle2,
  Layers,
  AlertCircle
} from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/supabase/client';
import { Fixture, MarketPrediction } from '@/types';
import { formatExpectedValue, formatSelectionName, getRiskTierBadge, formatOdds } from '@/lib/prediction/marketCatalog';
import { checkDerby } from '@/lib/prediction/contextFactors';
import { generateNBAPredictions } from '@/lib/data/nbaSeedData';

export default function MatchAnalysisPage() {
  const params = useParams();
  const id = params?.id as string;

  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
  });

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

  // Selected prediction for explanation inspection
  const [selectedPredictionOverride, setSelectedPredictionOverride] = useState<MarketPrediction | null>(null);
  const selectedPrediction = selectedPredictionOverride || topPick || (predictions[0] ?? null);
  const setSelectedPrediction = (p: MarketPrediction | null) => setSelectedPredictionOverride(p);

  if (isLoading) {
    return (
      <div className="py-20 text-center space-y-3">
        <div className="w-5 h-5 border-2 border-[#b8e63a] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-[12px] font-mono text-[#8fa69a]">Loading live match data...</p>
      </div>
    );
  }

  if (!fixture || (!isBasketball && (!stats || !footballEvaluation)) || (isBasketball && basketballPredictions.length === 0)) {
    return (
      <div className="py-20 text-center space-y-4">
        <h2 className="text-[16px] font-[500] text-[#e8efe9]">Live data unavailable. Last updated {lastUpdated}</h2>
        <p className="text-[13px] text-[#8fa69a]">
          {isBasketball 
            ? 'The requested NBA matchup data could not be retrieved from live statistical feeds.' 
            : 'The requested match data could not be retrieved from live European football pipelines.'}
        </p>
        <Link href="/matches" className="inline-block px-4 py-2 rounded-[8px] bg-[#0f2219] border border-white/[0.08] text-[13px] text-[#e8efe9]">
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
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/matches"
          className="inline-flex items-center gap-1.5 text-[12px] text-[#8fa69a] hover:text-[#e8efe9] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to fixtures</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleBookmark}
            type="button"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-[500] border transition-colors ${
              isSaved
                ? 'bg-[#e3b341]/10 text-[#e3b341] border-[#e3b341]/30'
                : 'bg-[#0f2219] border-white/[0.08] text-[#8fa69a] hover:text-[#e8efe9]'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-[#e3b341]' : ''}`} />
            <span>{isSaved ? 'Saved to watchlist' : 'Save fixture'}</span>
          </button>
        </div>
      </div>

      {/* Match Header Card */}
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-5 space-y-5">
        {/* League and meta row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#8fa69a] border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2">
            <TeamCrest
              crestUrl={fixture.competition.emblemUrl}
              teamName={fixture.competition.name}
              size={20}
            />
            <span className="font-[500] text-[#e8efe9]">{fixture.competition.name}</span>
            <span className="text-[#8fa69a]/60">·</span>
            <span className="font-mono">Matchday {fixture.matchday}</span>
            {(() => {
              const derby = (fixture.isDerby && fixture.derbyName) ? { name: fixture.derbyName } : checkDerby(fixture.homeTeam.name, fixture.awayTeam.name);
              return derby ? (
                <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  ⚡ {derby.name}
                </span>
              ) : null;
            })()}
            {fixture.hasCoachChange && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                New Manager
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 font-mono text-[11px] text-[#8fa69a]">
            <span className="flex items-center gap-1" suppressHydrationWarning>
              <Calendar className="w-3.5 h-3.5" />
              <span suppressHydrationWarning>
                {kickoff.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
              </span>
            </span>
            <span className="flex items-center gap-1" suppressHydrationWarning>
              <Clock className="w-3.5 h-3.5" />
              <span suppressHydrationWarning>
                {String(kickoff.getUTCHours()).padStart(2, '0')}:{String(kickoff.getUTCMinutes()).padStart(2, '0')} UTC
              </span>
            </span>
            {fixture.venue && (
              <span className="hidden sm:flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>{fixture.venue}</span>
              </span>
            )}
            {fixture.referee && (
              <span className="hidden md:flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Referee: {fixture.referee}</span>
              </span>
            )}
          </div>
        </div>

        {/* Teams Matchup Scoreboard */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1">
          {/* Teams list with exact crest treatment: 24x24px fixed square box, 10px to right of crest, 14px/500, 10px between rows */}
          <div className="flex flex-col gap-[10px] flex-1 max-w-lg">
            {/* Home Team Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[10px] min-h-[24px]">
                <TeamCrest
                  crestUrl={fixture.homeTeam.crestUrl}
                  teamName={fixture.homeTeam.name}
                  size={24}
                />
                <span className="text-[14px] font-[500] text-[#e8efe9] leading-tight">
                  {homeName}
                </span>
                <div className="hidden sm:flex items-center gap-1 ml-2">
                  {fixture.homeTeam.recentForm?.map((f, i) => (
                    <span
                      key={i}
                      className={`w-3.5 h-3.5 rounded-[3px] text-[10px] font-mono font-[500] flex items-center justify-center ${
                        f === 'W' ? 'bg-[#b8e63a] text-[#0a1812]' : f === 'D' ? 'bg-white/20 text-[#e8efe9]' : 'bg-rose-500/80 text-white'
                      }`}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              {fixture.status === 'FINISHED' ? (
                <span className="font-mono text-[14px] font-[500] text-[#e8efe9]">
                  {fixture.homeScore ?? 0}
                </span>
              ) : (
                <span className="text-[11px] font-mono text-[#8fa69a]">Home</span>
              )}
            </div>

            {/* Away Team Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[10px] min-h-[24px]">
                <TeamCrest
                  crestUrl={fixture.awayTeam.crestUrl}
                  teamName={fixture.awayTeam.name}
                  size={24}
                />
                <span className="text-[14px] font-[500] text-[#e8efe9] leading-tight">
                  {awayName}
                </span>
                <div className="hidden sm:flex items-center gap-1 ml-2">
                  {fixture.awayTeam.recentForm?.map((f, i) => (
                    <span
                      key={i}
                      className={`w-3.5 h-3.5 rounded-[3px] text-[10px] font-mono font-[500] flex items-center justify-center ${
                        f === 'W' ? 'bg-[#b8e63a] text-[#0a1812]' : f === 'D' ? 'bg-white/20 text-[#e8efe9]' : 'bg-rose-500/80 text-white'
                      }`}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              {fixture.status === 'FINISHED' ? (
                <span className="font-mono text-[14px] font-[500] text-[#e8efe9]">
                  {fixture.awayScore ?? 0}
                </span>
              ) : (
                <span className="text-[11px] font-mono text-[#8fa69a]">Away</span>
              )}
            </div>
          </div>

          {/* Status pill & Kickoff */}
          <div className="sm:border-l sm:border-white/[0.08] sm:pl-6 flex flex-col justify-center sm:items-end">
            <span className="text-[11px] font-mono text-[#b8e63a]">
              {fixture.status === 'FINISHED' ? 'Completed' : 'Upcoming match'}
            </span>
            <span className="text-[13px] text-[#e8efe9] font-mono mt-0.5" suppressHydrationWarning>
              {fixture.status === 'FINISHED' ? 'Full time' : kickoff.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'}
            </span>
          </div>
        </div>

        {/* Quantitative Indicators Banner */}
        {isBasketball && fixture.basketballStats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3.5 border-t border-white/[0.08]">
            <div className="p-2.5 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06]">
              <span className="text-[11px] text-[#8fa69a] block">Offensive Efficiency</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-[500] text-[#e8efe9] font-mono">
                  {fixture.basketballStats.homeOffEff.toFixed(3)}
                </span>
                <span className="text-[11px] text-[#8fa69a] font-mono ml-auto">
                  vs {fixture.basketballStats.awayOffEff.toFixed(3)}
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06]">
              <span className="text-[11px] text-[#8fa69a] block">Defensive Efficiency</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-[500] text-[#e8efe9] font-mono">
                  {fixture.basketballStats.homeDefEff.toFixed(3)}
                </span>
                <span className="text-[11px] text-[#8fa69a] font-mono ml-auto">
                  vs {fixture.basketballStats.awayDefEff.toFixed(3)}
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06]">
              <span className="text-[11px] text-[#8fa69a] block">Pace (Possessions/G)</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-[500] text-[#e8efe9] font-mono">
                  {fixture.basketballStats.homePoss.toFixed(1)}
                </span>
                <span className="text-[11px] text-[#8fa69a] font-mono ml-auto">
                  vs {fixture.basketballStats.awayPoss.toFixed(1)}
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06]">
              <span className="text-[11px] text-[#8fa69a] block">Projected Total</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-[500] text-[#b8e63a] font-mono">
                  {fixture.basketballStats.projectedTotal?.toFixed(1)} pts
                </span>
                <span className="text-[11px] text-[#8fa69a] font-mono ml-auto">
                  Margin: {fixture.basketballStats.projectedMargin?.toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3.5 border-t border-white/[0.08]">
            <div className="p-2.5 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06]">
              <span className="text-[11px] text-[#8fa69a] block">Expected goals (xG)</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-[500] text-[#e8efe9] font-mono">{stats.homeXg.toFixed(2)} - {stats.awayXg.toFixed(2)}</span>
                <span className="text-[11px] text-[#8fa69a] font-mono ml-auto">({totalXg.toFixed(2)})</span>
              </div>
            </div>

            <div className="p-2.5 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06]">
              <span className="text-[11px] text-[#8fa69a] block">Corner expectation</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-[500] text-[#e8efe9] font-mono">{totalCorners.toFixed(1)}</span>
                <span className="text-[11px] text-[#8fa69a] font-mono ml-auto">
                  {stats.expectedCornersHome.toFixed(1)}H / {stats.expectedCornersAway.toFixed(1)}A
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06]">
              <span className="text-[11px] text-[#8fa69a] block">Projected cards</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-[500] text-[#e8efe9] font-mono">{stats.expectedCards.toFixed(1)}</span>
                <span className="text-[11px] text-[#8fa69a] font-mono ml-auto">Ref: {stats.expectedCards.toFixed(1)}</span>
              </div>
            </div>

            <div className="p-2.5 bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06]">
              <span className="text-[11px] text-[#8fa69a] block">Confidence / coverage</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[14px] font-[500] text-[#b8e63a] font-mono">
                  {((1 - stats.uncertaintyScore) * 100).toFixed(0)}%
                </span>
                <span className="text-[11px] text-[#8fa69a] font-mono ml-auto">
                  {stats.sampleSizeMatches} games
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Flagship Recommendation Banner */}
      <div className="bg-[#0f2219] border border-[#b8e63a]/30 rounded-[12px] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {topPick ? (
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#b8e63a]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Primary qualified recommendation</span>
              </div>
              {(() => {
                const tier = getRiskTierBadge(topPick.riskTier);
                return (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider ${tier.badgeClass}`}>
                    {tier.label}
                  </span>
                );
              })()}
              {topPick.marketOdds && (
                <span className="text-[11px] font-mono text-[#e8efe9] bg-white/[0.08] px-1.5 py-0.5 rounded border border-white/10">
                  @{formatOdds(topPick.marketOdds)}
                </span>
              )}
            </div>
            <h3 className="text-[15px] font-[500] text-[#e8efe9]">
              {formatSelectionName(topPick.selection)} — {(topPick.modelProbability * 100).toFixed(1)}% probability
              {topPick.expectedValue !== undefined ? ` (${formatExpectedValue(topPick.expectedValue).text} EV)` : ''}
            </h3>
            {topPick.plainEnglishReason && (
              <p className="text-[12px] text-[#b8e63a] font-medium mt-1 max-w-2xl leading-normal">
                {topPick.plainEnglishReason}
              </p>
            )}
            <p className="text-[11px] text-[#8fa69a] mt-0.5 max-w-2xl leading-normal">
              Ranked highest across {predictions.length} candidate lines. {isBasketball ? 'Calculated via official NBA Possession-Efficiency methodology.' : `Passes minimum sample size (${stats?.sampleSizeMatches ?? 10} matches) and margin-of-safety filters.`}
            </p>
          </div>
        ) : (
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#8fa69a] mb-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>No strong recommendation</span>
            </div>
            <h3 className="text-[15px] font-[500] text-[#e8efe9]">Statistical evidence insufficient</h3>
            <p className="text-[12px] text-[#8fa69a] mt-0.5 max-w-2xl leading-normal">
              {noRecommendationReason || "Current market prices reflect efficient probabilities. Abstaining to maintain statistical calibration."}
            </p>
          </div>
        )}

        <div className="shrink-0 flex items-center">
          <span className="text-[11px] font-mono text-[#8fa69a]">
            {isBasketball ? 'NBA Efficiency Model' : 'Dixon-Coles bivariate Poisson'}
          </span>
        </div>
      </div>

      {/* Basketball: NBA Efficiency Math Breakdown */}
      {isBasketball && fixture.basketballStats && (
        <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div>
              <h3 className="text-[15px] font-[500] text-[#e8efe9]">NBA Score Projection Math Breakdown</h3>
              <p className="text-[11px] text-[#8fa69a] mt-0.5">Strict efficiency × possession formulas (no pace blending or unrequested adjustments)</p>
            </div>
            <span className="text-[11px] font-mono text-[#b8e63a] bg-[#b8e63a]/10 px-2.5 py-1 rounded border border-[#b8e63a]/20">
              Verified Model
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-[12px]">
            <div className="p-3 bg-[#0a1812] border border-white/[0.06] rounded-[8px]">
              <div className="text-[10px] text-[#8fa69a] font-mono uppercase">{fixture.homeTeam.name} Offense</div>
              <div className="text-[16px] font-mono font-bold text-[#e8efe9] mt-1">{fixture.basketballStats.homeOff.toFixed(2)}</div>
              <div className="text-[11px] text-[#8fa69a] font-mono mt-0.5">
                {fixture.basketballStats.homeOffEff} × {fixture.basketballStats.homePoss}
              </div>
            </div>

            <div className="p-3 bg-[#0a1812] border border-white/[0.06] rounded-[8px]">
              <div className="text-[10px] text-[#8fa69a] font-mono uppercase">{fixture.awayTeam.name} Offense</div>
              <div className="text-[16px] font-mono font-bold text-[#e8efe9] mt-1">{fixture.basketballStats.awayOff.toFixed(2)}</div>
              <div className="text-[11px] text-[#8fa69a] font-mono mt-0.5">
                {fixture.basketballStats.awayOffEff} × {fixture.basketballStats.awayPoss}
              </div>
            </div>

            <div className="p-3 bg-[#0a1812] border border-white/[0.06] rounded-[8px]">
              <div className="text-[10px] text-[#8fa69a] font-mono uppercase">{fixture.homeTeam.name} Defense (Allows)</div>
              <div className="text-[16px] font-mono font-bold text-[#e8efe9] mt-1">{fixture.basketballStats.homeDef.toFixed(2)}</div>
              <div className="text-[11px] text-[#8fa69a] font-mono mt-0.5">
                {fixture.basketballStats.homeDefEff} × {fixture.basketballStats.awayPoss}
              </div>
            </div>

            <div className="p-3 bg-[#0a1812] border border-white/[0.06] rounded-[8px]">
              <div className="text-[10px] text-[#8fa69a] font-mono uppercase">{fixture.awayTeam.name} Defense (Allows)</div>
              <div className="text-[16px] font-mono font-bold text-[#e8efe9] mt-1">{fixture.basketballStats.awayDef.toFixed(2)}</div>
              <div className="text-[11px] text-[#8fa69a] font-mono mt-0.5">
                {fixture.basketballStats.awayDefEff} × {fixture.basketballStats.homePoss}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3 bg-[#0a1812] border border-white/[0.06] rounded-[8px]">
              <div className="text-[10px] text-[#8fa69a] font-mono uppercase">Projected Scores (Avg Off + Opp Def)</div>
              <div className="text-[15px] font-mono font-bold text-[#b8e63a] mt-1">
                {fixture.basketballStats.homeProjected.toFixed(2)} - {fixture.basketballStats.awayProjected.toFixed(2)}
              </div>
            </div>

            <div className="p-3 bg-[#0a1812] border border-white/[0.06] rounded-[8px]">
              <div className="text-[10px] text-[#8fa69a] font-mono uppercase">Projected Total Points</div>
              <div className="text-[15px] font-mono font-bold text-[#e8efe9] mt-1">
                {fixture.basketballStats.projectedTotal.toFixed(2)}
              </div>
            </div>

            <div className="p-3 bg-[#0a1812] border border-white/[0.06] rounded-[8px]">
              <div className="text-[10px] text-[#8fa69a] font-mono uppercase">Spread Margin & Projected Winner</div>
              <div className="text-[15px] font-mono font-bold text-[#e8efe9] mt-1">
                {fixture.basketballStats.projectedWinner} by {fixture.basketballStats.projectedMargin.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Main Split: Market Comparison Table (Left 7 cols) & Explanation Engine (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
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
            <h3 className="text-[15px] font-[500] text-[#e8efe9]">Selected line evidence audit</h3>
            <span className="text-[11px] text-[#b8e63a] font-[500]">Grounded facts</span>
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
