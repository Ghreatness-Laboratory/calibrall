'use client';

import React, { useState, useMemo } from 'react';
import { COMPETITIONS, getFixtureStatistics } from '@/lib/data/seedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import { Search, Info, Calendar, RefreshCw } from 'lucide-react';
import { MarketPrediction } from '@/types';

type FootballMarketGroup = 'ALL' | 'results' | 'goals' | 'handicap' | 'goal_bounds' | 'halves' | 'corners' | 'cards';
type BasketballMarketGroup = 'ALL' | 'moneyline' | 'spread' | 'total_points';

export default function MatchesPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedFootballGroup, setSelectedFootballGroup] = useState<FootballMarketGroup>('ALL');
  const [selectedBasketballGroup, setSelectedBasketballGroup] = useState<BasketballMarketGroup>('ALL');

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
    return evaluatedFootballFixtures.filter(({ fixture, predictions }) => {
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
      if (selectedFootballGroup !== 'ALL') {
        const hasMatchingMarket = predictions.some(p => matchesFootballMarketGroup(p, selectedFootballGroup));
        if (!hasMatchingMarket) return false;
      }
      return true;
    });
  }, [evaluatedFootballFixtures, selectedLeague, statusFilter, searchQuery, selectedFootballGroup, isBasketball]);

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
    { id: 'results', label: 'Results' },
    { id: 'goals', label: 'Goals' },
    { id: 'corners', label: 'Corners' },
    { id: 'cards', label: 'Cards' },
    { id: 'handicap', label: 'Handicap' },
    { id: 'halves', label: 'Halves' },
    { id: 'goal_bounds', label: 'Bounds' },
  ];

  const basketballMarketFilters: { id: BasketballMarketGroup; label: string }[] = [
    { id: 'ALL', label: 'All NBA lines' },
    { id: 'moneyline', label: 'Moneyline' },
    { id: 'spread', label: 'Point Spread' },
    { id: 'total_points', label: 'Game Totals' },
  ];

  const clearFilters = () => {
    setSelectedLeague('ALL');
    setSearchQuery('');
    setStatusFilter('ALL');
    setSelectedFootballGroup('ALL');
    setSelectedBasketballGroup('ALL');
  };

  // Skeleton Loader for smooth transitions
  if (isSwitching) {
    return (
      <div className="space-y-4 py-2 animate-pulse">
        <div className="h-6 w-48 bg-[#151E19] rounded-[6px]" />
        <div className="h-10 bg-[#151E19] rounded-[11px]" />
        <div className="grid grid-cols-2 gap-2.5">
          <div className="h-10 bg-[#151E19] rounded-[11px]" />
          <div className="h-10 bg-[#151E19] rounded-[11px]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="h-40 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
          <div className="h-40 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
        </div>
      </div>
    );
  }

  const activeFixturesCount = isBasketball ? filteredBasketball.length : filteredFootball.length;

  return (
    <div className="space-y-4 py-1">
      {/* 6. FIXTURES HEADER: 19px H2 with one line subtitle, 34px square outlined refresh icon button */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-white/[0.07]">
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-bold leading-[1.25] tracking-[-0.02em] text-[#ECF1EE] truncate">
            {isBasketball ? 'NBA Matchups and markets' : 'Fixtures and markets'}
          </h2>
          <p className="text-[12px] text-[#8B9890] mt-0.5 truncate">
            {isBasketball 
              ? 'Real time efficiency models and pace projections.' 
              : 'Quantitative models and expected value discovery across Europe.'}
          </p>
        </div>

        <button
          onClick={() => refetch()}
          type="button"
          className="w-[34px] h-[34px] min-w-[34px] min-h-[34px] rounded-[10px] bg-[#101713] hover:bg-[#151E19] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE] flex items-center justify-center transition-transform active:scale-[0.98] shrink-0"
          title="Refresh fixtures"
          aria-label="Refresh fixtures"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#B6E63B]' : ''}`} strokeWidth={2} />
        </button>
      </div>

      {/* 6. SLIM INFO NOTE: 11.5px text, a 2px lime left border, and a small info icon */}
      <div className="border-l-2 border-l-[#B6E63B] bg-[#101713] border-y border-r border-white/[0.05] px-3.5 py-2.5 rounded-r-[10px] text-[11.5px] leading-normal text-[#8B9890] flex items-center gap-2">
        <Info className="w-4 h-4 text-[#B6E63B] shrink-0" strokeWidth={2} />
        <p className="truncate">
          <span className="font-medium text-[#ECF1EE]">Statistical estimate notice:</span> Modeled probabilities are projections, not guarantees.
        </p>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-3">
        {/* Search Field: 40px high, placeholder "Search club name" */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-[#5E6A63]" strokeWidth={2} />
          <input
            type="text"
            placeholder={isBasketball ? 'Search team name...' : 'Search club name'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-[40px] bg-[#151E19] border border-white/[0.07] pl-9 pr-3 rounded-[11px] text-[13px] text-[#ECF1EE] placeholder-[#5E6A63] focus:outline-hidden focus:border-[#B6E63B]"
          />
        </div>

        {/* Competition and Status Selects: Side by side in a two column grid, 11px label above each */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Competition Column */}
          <div>
            <label className="block text-[11px] font-medium text-[#8B9890] mb-1">
              Competition
            </label>
            {isBasketball ? (
              <select
                disabled
                className="w-full h-[40px] bg-[#151E19] border border-white/[0.07] px-3 rounded-[11px] text-[12.5px] text-[#ECF1EE] opacity-90 cursor-default"
              >
                <option value="NBA">NBA</option>
              </select>
            ) : (
              <select
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value)}
                className="w-full h-[40px] bg-[#151E19] border border-white/[0.07] px-3 rounded-[11px] text-[12.5px] text-[#ECF1EE] focus:outline-hidden focus:border-[#B6E63B]"
              >
                <option value="ALL">All leagues</option>
                {COMPETITIONS.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Status Column */}
          <div>
            <label className="block text-[11px] font-medium text-[#8B9890] mb-1">
              Game status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-[40px] bg-[#151E19] border border-white/[0.07] px-3 rounded-[11px] text-[12.5px] text-[#ECF1EE] focus:outline-hidden focus:border-[#B6E63B]"
            >
              <option value="ALL">All fixtures</option>
              <option value="TIMED">Upcoming</option>
              <option value="FINISHED">Completed</option>
            </select>
          </div>
        </div>

        {/* Market Type Chips: Horizontal single row scroll, 30px high pills, scrollbar hidden */}
        <div className="pt-1 border-t border-white/[0.05]">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
            {isBasketball ? (
              basketballMarketFilters.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedBasketballGroup(tab.id)}
                  type="button"
                  className={`h-[30px] px-3.5 rounded-full text-[11.5px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 ${
                    selectedBasketballGroup === tab.id
                      ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B]'
                      : 'bg-[#151E19] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
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
                  className={`h-[30px] px-3.5 rounded-full text-[11.5px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 ${
                    selectedFootballGroup === tab.id
                      ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B]'
                      : 'bg-[#151E19] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
                  }`}
                >
                  {tab.label}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* FIXTURES LIST / EMPTY STATE */}
      {isLoading ? (
        // Skeleton loader instead of spinner
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-44 bg-[#101713] border border-white/[0.07] rounded-[14px] p-4 space-y-3">
              <div className="h-4 w-28 bg-[#151E19] rounded-[6px]" />
              <div className="h-10 bg-[#151E19] rounded-[8px]" />
              <div className="h-14 bg-[#151E19] rounded-[8px]" />
            </div>
          ))}
        </div>
      ) : activeFixturesCount > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {isBasketball
            ? filteredBasketball.map(fixture => (
                <NBAGameCard key={fixture.id} fixture={fixture} />
              ))
            : filteredFootball.map(({ fixture, topPick, noRecommendationReason }) => (
                <FixtureCard
                  key={fixture.id}
                  fixture={fixture}
                  topPrediction={topPick}
                  noRecommendationReason={noRecommendationReason}
                />
              ))}
        </div>
      ) : (
        /* 6. EMPTY STATE: Dashed border card, 46px icon tile, 15px title "No games scheduled", 12.5px description, secondary "Clear filters" button */
        <div className="border border-dashed border-white/[0.12] rounded-[14px] bg-[#101713] p-8 text-center flex flex-col items-center justify-center space-y-2.5">
          <div className="w-[46px] h-[46px] rounded-[12px] bg-[#151E19] border border-white/[0.07] flex items-center justify-center text-[#8B9890]">
            <Calendar className="w-5 h-5" strokeWidth={2} />
          </div>
          <h3 className="text-[15px] font-semibold text-[#ECF1EE]">
            No games scheduled
          </h3>
          <p className="text-[12.5px] leading-relaxed text-[#8B9890] max-w-xs mx-auto">
            No matches found matching the selected competition or status filter.
          </p>
          <div className="pt-1">
            <button
              onClick={clearFilters}
              type="button"
              className="h-[38px] px-4 rounded-[11px] bg-[#151E19] hover:bg-white/[0.05] border border-white/[0.07] text-[12px] font-medium text-[#ECF1EE] transition-transform active:scale-[0.98]"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
