'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { FIXTURES, FIXTURE_STATISTICS } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import MarketComparisonTable from '@/components/MarketComparisonTable';
import ExplanationCard from '@/components/ExplanationCard';
import ScorelineMatrix from '@/components/ScorelineMatrix';
import FactorsAndStatePanel from '@/components/FactorsAndStatePanel';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  MapPin, 
  UserCheck, 
  ShieldAlert, 
  Zap, 
  TrendingUp, 
  AlertTriangle, 
  Bookmark,
  Share2,
  CheckCircle2,
  Layers,
  Database
} from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/supabase/client';
import { MarketPrediction } from '@/types';

export default function MatchAnalysisPage() {
  const params = useParams();
  const id = params?.id as string;

  const fixture = FIXTURES.find(f => f.id === id);

  const [isSaved, setIsSaved] = useState<boolean>(() => {
    if (!fixture) return false;
    return getStoredSavedFixtures().includes(fixture.id);
  });

  const stats = useMemo(() => {
    if (!fixture) return null;
    return FIXTURE_STATISTICS[fixture.id] || {
      homeXg: 1.55,
      awayXg: 1.25,
      expectedCornersHome: 5.4,
      expectedCornersAway: 4.8,
      expectedCards: 4.2,
      uncertaintyScore: 0.09,
      dataCoverageScore: 0.94,
      sampleSizeMatches: 20,
    };
  }, [fixture]);

  const evaluation = useMemo(() => {
    if (!fixture || !stats) return null;
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
  }, [fixture, stats]);

  // Selected prediction for explanation inspection
  const [selectedPrediction, setSelectedPrediction] = useState<MarketPrediction | null>(() => {
    return evaluation?.topPick || (evaluation?.predictions[0] ?? null);
  });

  if (!fixture || !stats || !evaluation) {
    return (
      <div className="py-20 text-center space-y-4">
        <h2 className="text-xl font-bold text-white">Fixture Not Found</h2>
        <p className="text-xs text-gray-400">The requested fixture ID does not exist in the active European database.</p>
        <Link href="/matches" className="inline-block px-4 py-2 rounded bg-surface-100 border border-border text-xs text-white">
          Return to Fixtures
        </Link>
      </div>
    );
  }

  const handleToggleBookmark = () => {
    const updated = toggleStoredSavedFixture(fixture.id);
    setIsSaved(updated);
  };

  const kickoff = new Date(fixture.kickoffTime);
  const totalXg = stats.homeXg + stats.awayXg;
  const totalCorners = stats.expectedCornersHome + stats.expectedCornersAway;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/matches"
          className="inline-flex items-center space-x-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to All Fixtures</span>
        </Link>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleToggleBookmark}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs border transition-colors ${
              isSaved
                ? 'bg-amber-500/10 text-brand-amber border-brand-amber/30'
                : 'bg-surface-200 border-border text-gray-400 hover:text-white'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-brand-amber' : ''}`} />
            <span>{isSaved ? 'Saved to Watchlist' : 'Save Match'}</span>
          </button>
        </div>
      </div>

      {/* Match Header Hero Card */}
      <div className="bg-surface-200 border border-border rounded-lg p-6 space-y-6 shadow-terminal">
        {/* League and meta row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-border-subtle pb-4">
          <div className="flex items-center space-x-2">
            <img src={fixture.competition.emblemUrl} alt="" className="w-5 h-5 object-contain" />
            <span className="font-bold text-white uppercase tracking-wider">{fixture.competition.name}</span>
            <span className="text-gray-500">•</span>
            <span className="text-gray-400 font-mono">Matchday {fixture.matchday}</span>
          </div>

          <div className="flex items-center space-x-4 text-gray-400 font-mono text-[11px]">
            <span className="flex items-center space-x-1" suppressHydrationWarning>
              <Calendar className="w-3.5 h-3.5" />
              <span suppressHydrationWarning>
                {kickoff.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
              </span>
            </span>
            <span className="flex items-center space-x-1" suppressHydrationWarning>
              <Clock className="w-3.5 h-3.5" />
              <span suppressHydrationWarning>
                {String(kickoff.getUTCHours()).padStart(2, '0')}:{String(kickoff.getUTCMinutes()).padStart(2, '0')} UTC
              </span>
            </span>
            {fixture.venue && (
              <span className="hidden sm:flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>{fixture.venue}</span>
              </span>
            )}
            {fixture.referee && (
              <span className="hidden md:flex items-center space-x-1 text-gray-400">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Ref: {fixture.referee}</span>
              </span>
            )}
          </div>
        </div>

        {/* Teams Matchup Scoreboard */}
        <div className="grid grid-cols-12 items-center gap-4 py-2">
          {/* Home Team */}
          <div className="col-span-5 flex items-center justify-end space-x-4 text-right">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white">{fixture.homeTeam.name}</h2>
              <div className="flex items-center justify-end space-x-1 mt-1">
                {fixture.homeTeam.recentForm?.map((f, i) => (
                  <span
                    key={i}
                    className={`w-4 h-4 rounded-xs text-[10px] font-mono font-bold flex items-center justify-center ${
                      f === 'W' ? 'bg-brand-emerald text-navy-950' : f === 'D' ? 'bg-gray-600 text-white' : 'bg-rose-600 text-white'
                    }`}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
            <img src={fixture.homeTeam.crestUrl} alt={fixture.homeTeam.name} className="w-12 h-12 object-contain" />
          </div>

          {/* Versus / Score */}
          <div className="col-span-2 text-center">
            {fixture.status === 'FINISHED' ? (
              <div className="font-mono text-3xl font-extrabold text-white">
                {fixture.homeScore} : {fixture.awayScore}
              </div>
            ) : (
              <div className="inline-block px-3 py-1 rounded bg-surface-100 border border-border font-mono text-xs font-bold text-gray-300">
                VS
              </div>
            )}
            <span className="block text-[10px] font-mono text-gray-500 mt-1 uppercase">
              {fixture.status}
            </span>
          </div>

          {/* Away Team */}
          <div className="col-span-5 flex items-center space-x-4">
            <img src={fixture.awayTeam.crestUrl} alt={fixture.awayTeam.name} className="w-12 h-12 object-contain" />
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white">{fixture.awayTeam.name}</h2>
              <div className="flex items-center space-x-1 mt-1">
                {fixture.awayTeam.recentForm?.map((f, i) => (
                  <span
                    key={i}
                    className={`w-4 h-4 rounded-xs text-[10px] font-mono font-bold flex items-center justify-center ${
                      f === 'W' ? 'bg-brand-emerald text-navy-950' : f === 'D' ? 'bg-gray-600 text-white' : 'bg-rose-600 text-white'
                    }`}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Expected Quant Indicators Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-border-subtle">
          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="text-[10px] font-mono text-gray-400 block uppercase">Expected Goals (xG)</span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-brand-blue font-mono">{stats.homeXg.toFixed(2)}</span>
              <span className="text-xs text-gray-500">-</span>
              <span className="text-lg font-bold text-brand-amber font-mono">{stats.awayXg.toFixed(2)}</span>
              <span className="text-[11px] text-gray-400 font-mono ml-auto">Total: {totalXg.toFixed(2)}</span>
            </div>
          </div>

          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="text-[10px] font-mono text-gray-400 block uppercase">Corner Expectation</span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-white font-mono">{totalCorners.toFixed(1)}</span>
              <span className="text-[11px] text-gray-400 font-mono ml-auto">
                {stats.expectedCornersHome.toFixed(1)}H / {stats.expectedCornersAway.toFixed(1)}A
              </span>
            </div>
          </div>

          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="text-[10px] font-mono text-gray-400 block uppercase">Projected Cards</span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-brand-amber font-mono">{stats.expectedCards.toFixed(1)}</span>
              <span className="text-[11px] text-gray-400 font-mono ml-auto">Ref avg: {stats.expectedCards.toFixed(1)}</span>
            </div>
          </div>

          <div className="p-3 bg-surface-100 rounded border border-border">
            <span className="text-[10px] font-mono text-gray-400 block uppercase">Model Uncertainty / Coverage</span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-lg font-bold text-brand-emerald font-mono">
                {((1 - stats.uncertaintyScore) * 100).toFixed(0)}%
              </span>
              <span className="text-[11px] text-gray-400 font-mono ml-auto">
                Coverage: {(stats.dataCoverageScore * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Flagship Intelligent Market Recommendation Banner */}
      <div className="bg-[#0e1420] border-2 border-brand-emerald/40 rounded-lg p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {evaluation.topPick ? (
          <div>
            <div className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-brand-emerald uppercase tracking-wider mb-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>Primary Qualified Recommendation</span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white">
              {evaluation.topPick.selection} — {(evaluation.topPick.modelProbability * 100).toFixed(1)}% Probability
              {evaluation.topPick.expectedValue ? ` (+${(evaluation.topPick.expectedValue * 100).toFixed(1)}% EV)` : ''}
            </h3>
            <p className="text-xs text-gray-300 mt-1 max-w-2xl">
              Ranked highest across {evaluation.predictions.length} candidate lines. Passes minimum sample size ({stats.sampleSizeMatches} matches) and margin-of-safety edge filters.
            </p>
          </div>
        ) : (
          <div>
            <div className="inline-flex items-center space-x-1.5 text-xs font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">
              <AlertTriangle className="w-4 h-4" />
              <span>Abstention: No Strong Recommendation</span>
            </div>
            <h3 className="text-lg font-bold text-white">Statistical Evidence Insufficient</h3>
            <p className="text-xs text-gray-300 mt-1 max-w-2xl">
              {evaluation.noRecommendationReason || "Current market prices reflect efficient probabilities. Recommending a selection here would violate our statistical discipline."}
            </p>
          </div>
        )}

        <div className="shrink-0 flex items-center space-x-2">
          <span className="text-[11px] font-mono text-gray-400">Dixon-Coles bivariate Poisson</span>
        </div>
      </div>

      {/* Dixon-Coles Scoreline Probability Heatmap Matrix */}
      <ScorelineMatrix
        homeTeamName={fixture.homeTeam.name}
        awayTeamName={fixture.awayTeam.name}
        homeXg={stats.homeXg}
        awayXg={stats.awayXg}
      />

      {/* Factors and State-Based Weighing Panel */}
      <FactorsAndStatePanel
        contextEvaluation={evaluation.contextEvaluation}
        rankedOptions={evaluation.rankedOptions}
        selectedOptionId={selectedPrediction?.id}
        onSelectOption={(p) => setSelectedPrediction(p)}
      />

      {/* Main Split: Market Comparison Table (Left 7 cols) & Explanation Engine (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Table */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-brand-emerald" />
              <span>All Evaluated Market Lines ({evaluation.predictions.length})</span>
            </h3>
            <span className="text-xs text-gray-400">Click any row to view full evidence audit</span>
          </div>

          <MarketComparisonTable
            predictions={evaluation.predictions}
            selectedPredictionId={selectedPrediction?.id}
            onSelectPrediction={(p) => setSelectedPrediction(p)}
          />
        </div>

        {/* Explanation Card */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Selected Line Evidence Audit</h3>
            <span className="text-xs text-brand-emerald font-mono">Grounded Facts</span>
          </div>

          <ExplanationCard
            prediction={selectedPrediction}
            noRecommendationReason={evaluation.noRecommendationReason}
          />
        </div>
      </div>
    </div>
  );
}
