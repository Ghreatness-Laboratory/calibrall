'use client';

import React, { useState, useMemo } from 'react';
import { COMPETITIONS, FIXTURES, FIXTURE_STATISTICS } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import { Search, Filter, SlidersHorizontal, Activity, Calendar, ArrowUpDown } from 'lucide-react';

export default function MatchesPage() {
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [minProbability, setMinProbability] = useState<number>(0.50);

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
        verifiedOdds: stats.verifiedOdds,
      });

      return {
        fixture,
        topPick: evalResult.topPick,
        noRecommendationReason: evalResult.noRecommendationReason,
      };
    });
  }, []);

  const filtered = useMemo(() => {
    return evaluatedFixtures.filter(({ fixture, topPick }) => {
      if (selectedLeague !== 'ALL' && fixture.competition.code !== selectedLeague) {
        return false;
      }
      if (statusFilter !== 'ALL' && fixture.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesHome = fixture.homeTeam.name.toLowerCase().includes(q);
        const matchesAway = fixture.awayTeam.name.toLowerCase().includes(q);
        if (!matchesHome && !matchesAway) return false;
      }
      if (topPick && topPick.modelProbability < minProbability) {
        return false;
      }
      return true;
    });
  }, [evaluatedFixtures, selectedLeague, statusFilter, searchQuery, minProbability]);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-2">
            <Activity className="w-6 h-6 text-brand-emerald" />
            <span>Fixtures & Market Intelligence Explorer</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Search, filter, and inspect scheduled European fixtures and quantitative prediction outputs.
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-surface-200 border border-border rounded p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Team Search */}
          <div>
            <label className="block text-gray-400 mb-1 text-[11px] font-medium">Team or Club Search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-500" />
              <input
                type="text"
                placeholder="e.g. Arsenal, Real Madrid..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-100 border border-border pl-8 pr-3 py-1.5 rounded text-xs text-white placeholder-gray-500 focus:outline-hidden focus:border-brand-emerald"
              />
            </div>
          </div>

          {/* League Filter */}
          <div>
            <label className="block text-gray-400 mb-1 text-[11px] font-medium">Competition</label>
            <select
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className="w-full bg-surface-100 border border-border px-3 py-1.5 rounded text-xs text-white focus:outline-hidden focus:border-brand-emerald"
            >
              <option value="ALL">All Competitions (5 Tier-1)</option>
              {COMPETITIONS.map(c => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.country})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-gray-400 mb-1 text-[11px] font-medium">Fixture Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-surface-100 border border-border px-3 py-1.5 rounded text-xs text-white focus:outline-hidden focus:border-brand-emerald"
            >
              <option value="ALL">All Scheduled & Completed</option>
              <option value="TIMED">Upcoming / Pre-Match Only</option>
              <option value="FINISHED">Completed / Settled Results</option>
            </select>
          </div>

          {/* Min Probability Slider */}
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-gray-400 font-medium">Min Model Probability</span>
              <span className="font-mono text-brand-emerald font-bold">{(minProbability * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.40"
              max="0.80"
              step="0.05"
              value={minProbability}
              onChange={(e) => setMinProbability(parseFloat(e.target.value))}
              className="w-full accent-brand-emerald cursor-pointer"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-gray-400">
          <span>Found {filtered.length} matching fixtures</span>
          <button
            onClick={() => {
              setSelectedLeague('ALL');
              setSearchQuery('');
              setStatusFilter('ALL');
              setMinProbability(0.50);
            }}
            className="text-brand-emerald hover:underline"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(({ fixture, topPick, noRecommendationReason }) => (
          <FixtureCard
            key={fixture.id}
            fixture={fixture}
            topPrediction={topPick}
            noRecommendationReason={noRecommendationReason}
          />
        ))}
      </div>
    </div>
  );
}
