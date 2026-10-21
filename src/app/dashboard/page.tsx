'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  COMPETITIONS, 
  FIXTURES, 
  FIXTURE_STATISTICS, 
  VERIFIED_PERFORMANCE_REPORT 
} from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import { 
  Activity, 
  Search, 
  Filter, 
  CheckCircle2, 
  TrendingUp, 
  AlertTriangle, 
  Zap, 
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  BarChart2,
  Bookmark
} from 'lucide-react';
import { getStoredSavedFixtures } from '@/lib/supabase/client';

export default function DashboardPage() {
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'completed'>('today');

  const savedFixtureIds = useMemo(() => getStoredSavedFixtures(), []);

  // Pre-calculate market evaluation for all fixtures
  const evaluatedFixtures = useMemo(() => {
    return FIXTURES.map(fixture => {
      const stats = FIXTURE_STATISTICS[fixture.id] || {
        homeXg: 1.5,
        awayXg: 1.2,
        expectedCornersHome: 5.5,
        expectedCornersAway: 4.5,
        expectedCards: 4.2,
        uncertaintyScore: 0.1,
        dataCoverageScore: 0.92,
        sampleSizeMatches: 20,
      };

      const evalResult = evaluateFixtureMarkets({
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

      return {
        fixture,
        predictions: evalResult.predictions,
        topPick: evalResult.topPick,
        noRecommendationReason: evalResult.noRecommendationReason,
      };
    });
  }, []);

  // Filter fixtures
  const filteredList = useMemo(() => {
    return evaluatedFixtures.filter(({ fixture }) => {
      // League filter
      if (selectedLeague !== 'ALL' && fixture.competition.code !== selectedLeague) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesHome = fixture.homeTeam.name.toLowerCase().includes(q);
        const matchesAway = fixture.awayTeam.name.toLowerCase().includes(q);
        const matchesComp = fixture.competition.name.toLowerCase().includes(q);
        if (!matchesHome && !matchesAway && !matchesComp) return false;
      }
      // Tab filter
      if (activeTab === 'completed') {
        return fixture.status === 'FINISHED';
      } else if (activeTab === 'today') {
        return fixture.status !== 'FINISHED';
      }
      return true;
    });
  }, [evaluatedFixtures, selectedLeague, searchQuery, activeTab]);

  // Aggregate top market opportunities across all fixtures
  const topOpportunities = useMemo(() => {
    const qualified: {
      fixtureId: string;
      matchName: string;
      compCode: string;
      marketName: string;
      selection: string;
      probability: number;
      odds?: number;
      expectedValue?: number;
      edge?: number;
      confidence: string;
    }[] = [];

    evaluatedFixtures.forEach(({ fixture, predictions }) => {
      predictions.forEach(p => {
        if (p.qualificationStatus === 'QUALIFIED_VALUE' || p.qualificationStatus === 'QUALIFIED_PROBABILITY') {
          qualified.push({
            fixtureId: fixture.id,
            matchName: `${fixture.homeTeam.shortName} vs ${fixture.awayTeam.shortName}`,
            compCode: fixture.competition.code,
            marketName: p.marketName,
            selection: p.selection,
            probability: p.modelProbability,
            odds: p.marketOdds,
            expectedValue: p.expectedValue,
            edge: p.edge,
            confidence: p.modelConfidence,
          });
        }
      });
    });

    return qualified.sort((a, b) => (b.expectedValue ?? 0) - (a.expectedValue ?? 0)).slice(0, 5);
  }, [evaluatedFixtures]);

  return (
    <div className="space-y-6">
      {/* Top Header & Data Freshness Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-2">
            <span>Market Intelligence Dashboard</span>
            <span className="text-xs font-mono font-bold text-brand-accent bg-brand-accent/10 border border-brand-accent/30 px-2 py-0.5 rounded">
              LIVE
            </span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            <span className="font-mono text-brand-accent font-semibold mr-1.5">Every call, on record.</span>
            Real-time multi-market evaluation, Poisson probability distributions, and expected value ranking.
          </p>
        </div>

        {/* Global Controls & Filters */}
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search team or league..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-surface-200 border border-border pl-8 pr-3 py-1.5 rounded text-xs text-white placeholder-gray-500 focus:outline-hidden focus:border-brand-emerald w-48 sm:w-60"
            />
          </div>
        </div>
      </div>

      {/* Top 3 Analytical Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Goal Market Sentiment */}
        <div className="bg-surface-200 border border-border rounded p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-brand-emerald" />
              <span>Goal Markets (Over/Under)</span>
            </span>
            <span className="text-[10px] font-mono text-gray-400">Mean: 2.85 xG</span>
          </div>
          <p className="text-xs text-gray-300">
            High offensive generation identified in Barcelona vs Real Madrid (3.60 combined xG). Arsenal vs Liverpool exhibits balanced 1.62 - 1.48 expectation.
          </p>
        </div>

        {/* Corner Market Sentiment */}
        <div className="bg-surface-200 border border-border rounded p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white flex items-center space-x-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-brand-blue" />
              <span>Corner Volume Trends</span>
            </span>
            <span className="text-[10px] font-mono text-gray-400">Mean: 10.8 Corners</span>
          </div>
          <p className="text-xs text-gray-300">
            Manchester City vs Tottenham corner expectation (11.0 total) offers qualified statistical support on Over 9.5 corners.
          </p>
        </div>

        {/* Disciplinary Intensity */}
        <div className="bg-surface-200 border border-border rounded p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white flex items-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-brand-amber" />
              <span>Disciplinary Bookings</span>
            </span>
            <span className="text-[10px] font-mono text-gray-400">Cards Line: 4.5</span>
          </div>
          <p className="text-xs text-gray-300">
            Derby d&apos;Italia (Inter vs Juventus) ref Daniele Orsato averages 5.60 cards/match; elevated probability on Over 4.5 Bookings.
          </p>
        </div>
      </div>

      {/* Leading Value Opportunities Table across all games */}
      <div className="bg-surface-200 border border-border rounded overflow-hidden">
        <div className="p-3.5 bg-surface-100 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-brand-emerald" />
            <h2 className="text-sm font-bold text-white">Best-Supported Market Opportunities</h2>
          </div>
          <span className="text-[11px] font-mono text-gray-400">Ranked by Expected Value (EV)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0c1017] text-gray-400 font-mono text-[10px] uppercase border-b border-border">
              <tr>
                <th className="py-2.5 px-3">Match</th>
                <th className="py-2.5 px-3">Market Line</th>
                <th className="py-2.5 px-3">Selection</th>
                <th className="py-2.5 px-3">Model Prob</th>
                <th className="py-2.5 px-3">Odds</th>
                <th className="py-2.5 px-3">Edge</th>
                <th className="py-2.5 px-3">Est. EV</th>
                <th className="py-2.5 px-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {topOpportunities.map((item, idx) => (
                <tr key={idx} className="hover:bg-surface-50 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-white flex items-center space-x-2">
                    <span className="px-1.5 py-0.5 rounded bg-surface-50 text-[10px] font-mono text-gray-400">
                      {item.compCode}
                    </span>
                    <span>{item.matchName}</span>
                  </td>
                  <td className="py-2.5 px-3 text-gray-400">{item.marketName}</td>
                  <td className="py-2.5 px-3 font-medium text-brand-emerald">{item.selection}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-white tabular-nums">
                    {(item.probability * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 font-mono text-gray-300">
                    {item.odds ? item.odds.toFixed(2) : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-brand-blue tabular-nums">
                    {item.edge ? `+${(item.edge * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-brand-emerald tabular-nums">
                    {item.expectedValue ? `+${(item.expectedValue * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3">
                    <Link
                      href={`/matches/${item.fixtureId}`}
                      className="inline-flex items-center space-x-1 text-xs text-brand-emerald hover:underline font-medium"
                    >
                      <span>Analyze</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Fixtures Explorer Section */}
      <div className="space-y-4">
        {/* League and Tab Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-100 p-2.5 rounded border border-border">
          {/* League Pills */}
          <div className="flex items-center space-x-1 overflow-x-auto text-xs">
            <button
              onClick={() => setSelectedLeague('ALL')}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                selectedLeague === 'ALL'
                  ? 'bg-brand-emerald text-navy-950 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-surface-50'
              }`}
            >
              All Competitions
            </button>
            {COMPETITIONS.map(c => (
              <button
                key={c.code}
                onClick={() => setSelectedLeague(c.code)}
                className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center space-x-1.5 ${
                  selectedLeague === c.code
                    ? 'bg-brand-emerald text-navy-950 font-semibold'
                    : 'text-gray-400 hover:text-white hover:bg-surface-50'
                }`}
              >
                <span>{c.code}</span>
              </button>
            ))}
          </div>

          {/* Status Tabs */}
          <div className="flex items-center space-x-1 bg-surface-200 p-1 rounded border border-border text-xs">
            <button
              onClick={() => setActiveTab('today')}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === 'today' ? 'bg-surface-50 text-white font-medium' : 'text-gray-400 hover:text-white'
              }`}
            >
              Today & Upcoming
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === 'completed' ? 'bg-surface-50 text-white font-medium' : 'text-gray-400 hover:text-white'
              }`}
            >
              Recent Completed
            </button>
          </div>
        </div>

        {/* Fixture Cards Grid */}
        {filteredList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredList.map(({ fixture, topPick, noRecommendationReason }) => (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                topPrediction={topPick}
                noRecommendationReason={noRecommendationReason}
                isSavedInitial={savedFixtureIds.includes(fixture.id)}
              />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center bg-surface-200 border border-border rounded text-gray-400">
            <Layers className="w-10 h-10 mx-auto text-gray-600 mb-3" />
            <h3 className="text-white font-medium text-sm">No Fixtures Match Your Filter</h3>
            <p className="text-xs mt-1">Try clearing your search query or selecting a different competition.</p>
          </div>
        )}
      </div>
    </div>
  );
}
