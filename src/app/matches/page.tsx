'use client';

import React, { useState, useMemo } from 'react';
import { COMPETITIONS, getFixtureStatistics } from '@/lib/data/seedData';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import { Search, SlidersHorizontal, Info } from 'lucide-react';
import { MarketPrediction, RiskTier } from '@/types';

type MarketGroupFilter = 'ALL' | 'goals' | 'corners' | 'cards' | 'handicap' | 'results' | 'halves' | 'goal_bounds';

export default function MatchesPage() {
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedRiskTier, setSelectedRiskTier] = useState<string>('ALL');
  const [selectedMarketGroup, setSelectedMarketGroup] = useState<MarketGroupFilter>('ALL');
  const [minProbability, setMinProbability] = useState<number>(0.50);

  const { fixtures, isLoading, liveDataAvailable, lastUpdated } = useLiveFixtures(selectedLeague, statusFilter);

  const evaluatedFixtures = useMemo(() => {
    return fixtures.map(fixture => {
      const stats = getFixtureStatistics(fixture);

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
        predictions: evalResult.predictions,
        noRecommendationReason: evalResult.noRecommendationReason,
      };
    });
  }, [fixtures]);

  const matchesMarketGroup = (p: MarketPrediction, group: MarketGroupFilter): boolean => {
    if (group === 'ALL') return true;
    if (group === 'goals') {
      return p.optionType === 'over_under_goals' || p.optionType === 'first_half_goals' || p.marketCategory === 'total_goals' || p.marketCategory === 'team_goals' || p.marketCategory === 'btts';
    }
    if (group === 'corners') {
      return p.optionType === 'corners' || p.optionType === 'corner_handicap' || p.marketCategory === 'total_corners' || p.marketCategory === 'team_corners';
    }
    if (group === 'cards') {
      return p.optionType === 'bookings' || p.optionType === 'team_bookings' || p.optionType === 'booking_points' || p.marketCategory === 'bookings';
    }
    if (group === 'handicap') {
      return p.optionType === 'asian_handicap' || p.optionType === 'european_handicap' || p.optionType === 'corner_handicap' || p.marketCategory === 'handicap';
    }
    if (group === 'results') {
      return p.optionType === 'win' || p.optionType === 'draw' || p.optionType === 'double_chance' || p.optionType === 'draw_no_bet' || p.optionType === 'win_draw_combo' || p.marketCategory === 'match_result' || p.marketCategory === 'double_chance' || p.marketCategory === 'draw_no_bet' || p.marketCategory === 'combos';
    }
    if (group === 'halves') {
      return p.optionType === 'highest_scoring_half' || p.optionType === 'first_half_goals' || p.optionType === 'second_half_result' || p.marketCategory === 'half_time';
    }
    if (group === 'goal_bounds') {
      return p.optionType === 'goal_bounds' || p.optionType === 'team_goal_bounds' || p.marketCategory === 'goal_bounds';
    }
    return true;
  };

  const filtered = useMemo(() => {
    return evaluatedFixtures.filter(({ fixture, topPick, predictions }) => {
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
      if (selectedRiskTier !== 'ALL') {
        if (!topPick || topPick.riskTier !== selectedRiskTier) {
          return false;
        }
      }
      if (selectedMarketGroup !== 'ALL') {
        const hasMatchingMarket = predictions.some(p => matchesMarketGroup(p, selectedMarketGroup) && p.modelProbability >= minProbability);
        if (!hasMatchingMarket) return false;
      }
      return true;
    });
  }, [evaluatedFixtures, selectedLeague, statusFilter, searchQuery, minProbability, selectedRiskTier, selectedMarketGroup]);

  const marketGroupFilters: { id: MarketGroupFilter; label: string }[] = [
    { id: 'ALL', label: 'All markets' },
    { id: 'results', label: 'Results & Double Chance' },
    { id: 'goals', label: 'Goals' },
    { id: 'handicap', label: 'Handicap' },
    { id: 'goal_bounds', label: 'Goal Bounds' },
    { id: 'halves', label: 'Halves' },
    { id: 'corners', label: 'Corners' },
    { id: 'cards', label: 'Cards' },
  ];

  const riskTierPills: { id: string; label: string }[] = [
    { id: 'ALL', label: 'All Tiers' },
    { id: 'SAFE', label: 'Safe (≥75%)' },
    { id: 'MODERATE', label: 'Moderate (60-75%)' },
    { id: 'RISKY', label: 'Risky (45-60%)' },
  ];

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

      {/* Responsible Use Disclaimer Banner (Requirement 15) */}
      <div className="p-3 bg-[#0f2219] border border-white/[0.08] rounded-[10px] flex items-start gap-2.5 text-[12px] text-[#8fa69a]">
        <Info className="w-4 h-4 text-[#b8e63a] shrink-0 mt-0.5" />
        <p className="leading-normal">
          <span className="text-[#e8efe9] font-[500]">Statistical estimate notice:</span> All outputs are probabilistic projections derived from Dixon-Coles and negative binomial distribution models, not guaranteed outcomes.
        </p>
      </div>

      {/* Filter Toolbar (Requirements 12 & 16) */}
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

        {/* Market Category Pills (Requirements 12 & 16) */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1 [scrollbar-width:none]">
          <span className="text-[#8fa69a] font-mono shrink-0 mr-1">Market:</span>
          {marketGroupFilters.map(filter => (
            <button
              key={filter.id}
              onClick={() => setSelectedMarketGroup(filter.id)}
              type="button"
              className={`px-2.5 py-1 rounded-[6px] whitespace-nowrap transition-colors text-[11px] font-[500] ${
                selectedMarketGroup === filter.id
                  ? 'bg-[#b8e63a] text-[#0a1812] font-semibold'
                  : 'bg-[#0a1812] border border-white/[0.06] text-[#8fa69a] hover:text-[#e8efe9]'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Risk Tier Quick Buttons (Requirement 12) */}
        <div className="pt-1 flex items-center justify-between gap-2 flex-wrap text-[11px]">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            <span className="text-[#8fa69a] font-mono shrink-0 mr-1">Tier:</span>
            {riskTierPills.map(tier => (
              <button
                key={tier.id}
                onClick={() => setSelectedRiskTier(tier.id)}
                type="button"
                className={`px-2 py-0.5 rounded-[4px] whitespace-nowrap transition-colors text-[11px] ${
                  selectedRiskTier === tier.id
                    ? 'bg-white/20 text-white font-semibold border border-white/30'
                    : 'bg-[#0a1812] border border-white/[0.06] text-[#8fa69a] hover:text-[#e8efe9]'
                }`}
              >
                {tier.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-[#8fa69a]">
            <span>Found {filtered.length} matching fixtures</span>
            <button
              onClick={() => {
                setSelectedLeague('ALL');
                setSearchQuery('');
                setStatusFilter('ALL');
                setSelectedRiskTier('ALL');
                setSelectedMarketGroup('ALL');
                setMinProbability(0.50);
              }}
              type="button"
              className="text-[#b8e63a] hover:underline"
            >
              Reset filters
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
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
      ) : (
        <div className="p-12 text-center bg-[#0f2219] border border-white/[0.08] rounded-[12px] text-[#8fa69a] space-y-2">
          <div className="font-mono text-[13px] text-[#e8efe9]">
            {liveDataAvailable ? 'No matching fixtures found' : `Live data unavailable. Last updated ${lastUpdated}`}
          </div>
          <p className="text-[12px] max-w-sm mx-auto">
            {liveDataAvailable ? 'Try adjusting your minimum probability, risk tier, or competition filters.' : 'Live European football fixtures will populate once API connectivity is established.'}
          </p>
        </div>
      )}
    </div>
  );
}
