'use client';

import React, { useState, useMemo } from 'react';
import { COMPETITIONS, FIXTURES, FIXTURE_STATISTICS } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import { Search } from 'lucide-react';

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
        stateTags: stats.stateTags,
        lineupConfirmed: stats.lineupConfirmed,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <h1 className="text-[18px] font-[500] text-[#e8efe9]">
            Fixtures & market intelligence explorer
          </h1>
          <p className="text-[12px] text-[#8fa69a] mt-0.5">
            Search, filter, and inspect scheduled European fixtures and quantitative prediction outputs.
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[12px]">
          {/* Team Search */}
          <div>
            <label className="block text-[#8fa69a] mb-1 text-[11px] font-[500]">Team search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#8fa69a]" />
              <input
                type="text"
                placeholder="Search club name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0a1812] border border-white/[0.08] pl-8 pr-3 py-1.5 rounded-[8px] text-[12px] text-[#e8efe9] placeholder-[#8fa69a]/50 focus:outline-hidden focus:border-[#b8e63a]"
              />
            </div>
          </div>

          {/* League Filter */}
          <div>
            <label className="block text-[#8fa69a] mb-1 text-[11px] font-[500]">Competition</label>
            <select
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
              className="w-full bg-[#0a1812] border border-white/[0.08] px-3 py-1.5 rounded-[8px] text-[12px] text-[#e8efe9] focus:outline-hidden focus:border-[#b8e63a]"
            >
              <option value="ALL">All competitions (5 Tier-1)</option>
              {COMPETITIONS.map(c => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.country})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[#8fa69a] mb-1 text-[11px] font-[500]">Fixture status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-[#0a1812] border border-white/[0.08] px-3 py-1.5 rounded-[8px] text-[12px] text-[#e8efe9] focus:outline-hidden focus:border-[#b8e63a]"
            >
              <option value="ALL">All fixtures</option>
              <option value="TIMED">Upcoming only</option>
              <option value="FINISHED">Completed results</option>
            </select>
          </div>

          {/* Min Probability Slider */}
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-[#8fa69a] font-[500]">Min probability</span>
              <span className="font-mono text-[#b8e63a]">{(minProbability * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.40"
              max="0.80"
              step="0.05"
              value={minProbability}
              onChange={(e) => setMinProbability(parseFloat(e.target.value))}
              className="w-full accent-[#b8e63a] cursor-pointer"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[12px] text-[#8fa69a]">
          <span>Found {filtered.length} matching fixtures</span>
          <button
            onClick={() => {
              setSelectedLeague('ALL');
              setSearchQuery('');
              setStatusFilter('ALL');
              setMinProbability(0.50);
            }}
            type="button"
            className="text-[#b8e63a] hover:underline"
          >
            Reset filters
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
