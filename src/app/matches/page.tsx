'use client';

import React, { useState, useMemo } from 'react';
import { COMPETITIONS, getFixtureStatistics } from '@/lib/data/seedData';
import { NBA_COMPETITION } from '@/lib/data/nbaSeedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import { Search, SlidersHorizontal, Info, Calendar, RefreshCw } from 'lucide-react';
import { MarketPrediction, RiskTier } from '@/types';

type FootballMarketGroup = 'ALL' | 'goals' | 'corners' | 'cards' | 'handicap' | 'results' | 'halves' | 'goal_bounds';
type BasketballMarketGroup = 'ALL' | 'moneyline' | 'spread' | 'total_points';

export default function MatchesPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedRiskTier, setSelectedRiskTier] = useState<string>('ALL');
  const [selectedFootballGroup, setSelectedFootballGroup] = useState<FootballMarketGroup>('ALL');
  const [selectedBasketballGroup, setSelectedBasketballGroup] = useState<BasketballMarketGroup>('ALL');
  const [minProbability, setMinProbability] = useState<number>(0.50);

  const { fixtures, isLoading, liveDataAvailable, lastUpdated, refetch } = useLiveFixtures(
    isBasketball ? 'NBA' : selectedLeague, 
    statusFilter, 
    sport
  );

  // Football evaluated fixtures
  const evaluatedFootballFixtures = useMemo(() => {
    if (isBasketball) return [];
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
  }, [fixtures, isBasketball]);

  // Market Group Matching
  const matchesFootballMarketGroup = (p: MarketPrediction, group: FootballMarketGroup): boolean => {
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

  // Filtered fixtures
  const filteredFootball = useMemo(() => {
    if (isBasketball) return [];
    return evaluatedFootballFixtures.filter(({ fixture, topPick, predictions }) => {
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
      if (selectedFootballGroup !== 'ALL') {
        const hasMatchingMarket = predictions.some(p => matchesFootballMarketGroup(p, selectedFootballGroup) && p.modelProbability >= minProbability);
        if (!hasMatchingMarket) return false;
      }
      return true;
    });
  }, [evaluatedFootballFixtures, selectedLeague, statusFilter, searchQuery, minProbability, selectedRiskTier, selectedFootballGroup, isBasketball]);

  const filteredBasketball = useMemo(() => {
    if (!isBasketball) return [];
    return fixtures.filter(fixture => {
      if (statusFilter !== 'ALL' && fixture.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesHome = fixture.homeTeam.name.toLowerCase().includes(q);
        const matchesAway = fixture.awayTeam.name.toLowerCase().includes(q);
        if (!matchesHome && !matchesAway) return false;
      }
      return true;
    });
  }, [fixtures, statusFilter, searchQuery, isBasketball]);

  const footballMarketFilters: { id: FootballMarketGroup; label: string }[] = [
    { id: 'ALL', label: 'All markets' },
    { id: 'results', label: 'Results & Double Chance' },
    { id: 'goals', label: 'Goals' },
    { id: 'handicap', label: 'Handicap' },
    { id: 'goal_bounds', label: 'Goal Bounds' },
    { id: 'halves', label: 'Halves' },
    { id: 'corners', label: 'Corners' },
    { id: 'cards', label: 'Cards' },
  ];

  const basketballMarketFilters: { id: BasketballMarketGroup; label: string }[] = [
    { id: 'ALL', label: 'All NBA markets' },
    { id: 'moneyline', label: 'Moneyline' },
    { id: 'spread', label: 'Point Spread' },
    { id: 'total_points', label: 'Game Total Points' },
  ];

  const riskTierPills: { id: string; label: string }[] = [
    { id: 'ALL', label: 'All Tiers' },
    { id: 'SAFE', label: 'Safe (≥75%)' },
    { id: 'MODERATE', label: 'Moderate (60-75%)' },
    { id: 'RISKY', label: 'Risky (45-60%)' },
  ];

  if (isSwitching) {
    return (
      <div className="space-y-6 py-6 animate-pulse">
        <div className="h-8 w-64 bg-white/10 rounded-[8px]" />
        <div className="h-28 bg-[#0f2219] rounded-[12px] border border-white/10" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <div className="h-44 bg-[#0f2219] rounded-[12px] border border-white/10" />
          <div className="h-44 bg-[#0f2219] rounded-[12px] border border-white/10" />
          <div className="h-44 bg-[#0f2219] rounded-[12px] border border-white/10" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <h1 className="text-[18px] font-[500] text-[#e8efe9]">
            {isBasketball ? 'NBA Matchups & Market Intelligence Explorer' : 'Fixtures & Market Intelligence Explorer'}
          </h1>
          <p className="text-[12px] text-[#8fa69a] mt-0.5">
            {isBasketball
              ? 'NBA schedules, projected scores, totals, spreads, and winner leans derived from efficiency ratings.'
              : 'Search, filter, and inspect scheduled European fixtures and quantitative prediction outputs.'}
          </p>
        </div>

        <button
          onClick={() => refetch()}
          type="button"
          className="self-start sm:self-auto h-[34px] px-3 rounded-[8px] bg-[#0f2219] hover:bg-white/[0.04] border border-white/[0.08] text-[12px] text-[#8fa69a] hover:text-[#e8efe9] flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#b8e63a]' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Responsible Use Disclaimer Banner */}
      <div className="p-3 bg-[#0f2219] border border-white/[0.08] rounded-[10px] flex items-start gap-2.5 text-[12px] text-[#8fa69a]">
        <Info className="w-4 h-4 text-[#b8e63a] shrink-0 mt-0.5" />
        <p className="leading-normal">
          <span className="text-[#e8efe9] font-[500]">Statistical estimate notice:</span> All outputs are probabilistic projections derived from {isBasketball ? 'NBA offensive/defensive efficiency and possessions ratings' : 'Dixon-Coles and negative binomial distribution models'}, not guaranteed outcomes. Please use responsibly.
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-[12px]">
          {/* Team Search */}
          <div>
            <label className="block text-[#8fa69a] mb-1 text-[11px] font-[500]">Team search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#8fa69a]" />
              <input
                type="text"
                placeholder={isBasketball ? 'Search NBA team (e.g. Celtics)...' : 'Search club name...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0a1812] border border-white/[0.08] pl-8 pr-3 py-1.5 rounded-[8px] text-[12px] text-[#e8efe9] placeholder-[#8fa69a]/50 focus:outline-hidden focus:border-[#b8e63a]"
              />
            </div>
          </div>

          {/* League Filter - Only shown for football, or NBA only for basketball */}
          <div>
            <label className="block text-[#8fa69a] mb-1 text-[11px] font-[500]">Competition</label>
            {isBasketball ? (
              <select
                disabled
                className="w-full bg-[#0a1812] border border-white/[0.08] px-3 py-1.5 rounded-[8px] text-[12px] text-[#e8efe9] opacity-90 cursor-default"
              >
                <option value="NBA">NBA (National Basketball Association)</option>
              </select>
            ) : (
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
            )}
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[#8fa69a] mb-1 text-[11px] font-[500]">Game status</label>
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
        </div>

        {/* Market Category Pills */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#8fa69a] mr-1 shrink-0">Market type:</span>
            {isBasketball ? (
              basketballMarketFilters.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedBasketballGroup(tab.id)}
                  type="button"
                  className={`px-2.5 py-1 rounded-[6px] text-[11px] font-[500] whitespace-nowrap transition-colors ${
                    selectedBasketballGroup === tab.id
                      ? 'bg-[#b8e63a] text-[#0a1812]'
                      : 'bg-[#0a1812] text-[#8fa69a] hover:text-[#e8efe9] border border-white/[0.06]'
                  }`}
                >
                  {tab.label}
                </button>
              ))
            ) : (
              footballMarketFilters.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedFootballGroup(tab.id)}
                  type="button"
                  className={`px-2.5 py-1 rounded-[6px] text-[11px] font-[500] whitespace-nowrap transition-colors ${
                    selectedFootballGroup === tab.id
                      ? 'bg-[#b8e63a] text-[#0a1812]'
                      : 'bg-[#0a1812] text-[#8fa69a] hover:text-[#e8efe9] border border-white/[0.06]'
                  }`}
                >
                  {tab.label}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Grid of Fixtures */}
      {isBasketball ? (
        filteredBasketball.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredBasketball.map(fixture => (
              <NBAGameCard key={fixture.id} fixture={fixture} />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center bg-[#0f2219] border border-white/[0.08] rounded-[12px] space-y-2">
            <Calendar className="w-8 h-8 mx-auto text-[#8fa69a]/40" />
            <h3 className="text-[#e8efe9] font-[500] text-[15px]">No games scheduled</h3>
            <p className="text-[12px] text-[#8fa69a] max-w-sm mx-auto">
              No NBA matchups matching your filter criteria. Next scheduled games will stream automatically on matchday.
            </p>
          </div>
        )
      ) : (
        filteredFootball.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredFootball.map(({ fixture, topPick, noRecommendationReason }) => (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                topPrediction={topPick}
                noRecommendationReason={noRecommendationReason}
              />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center bg-[#0f2219] border border-white/[0.08] rounded-[12px] space-y-2">
            <Calendar className="w-8 h-8 mx-auto text-[#8fa69a]/40" />
            <h3 className="text-[#e8efe9] font-[500] text-[15px]">No games scheduled</h3>
            <p className="text-[12px] text-[#8fa69a] max-w-sm mx-auto">
              No European football fixtures matching your search filter. Next fixtures will appear on the next matchday.
            </p>
          </div>
        )
      )}
    </div>
  );
}
