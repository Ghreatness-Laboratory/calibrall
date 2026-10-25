'use client';

import React, { useState, useMemo } from 'react';
import { getFixtureStatistics, COMPETITIONS } from '@/lib/data/seedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import SportSwitcher from '@/components/SportSwitcher';
import { MarketPrediction, MatchStatus } from '@/types';
import { 
  RotateCw, 
  Info, 
  Search, 
  Calendar,
  X
} from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';

type FootballMarketGroup = 'ALL' | 'results' | 'goals' | 'corners' | 'cards';

export default function MatchesPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedComp, setSelectedComp] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedFootballGroup, setSelectedFootballGroup] = useState<FootballMarketGroup>('ALL');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const { fixtures, isLoading, lastUpdated, isDelayed, refetch } = useLiveFixtures(
    isBasketball ? 'NBA' : selectedComp, 
    selectedStatus, 
    sport
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (refetch) {
      await refetch();
    }
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedComp('ALL');
    setSelectedStatus('ALL');
    setSelectedFootballGroup('ALL');
  };

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
    if (group === 'results') {
      return p.optionType === 'win' || p.optionType === 'draw' || p.optionType === 'double_chance' || p.optionType === 'draw_no_bet' || p.optionType === 'win_draw_combo' || p.marketCategory === 'match_result' || p.marketCategory === 'double_chance' || p.marketCategory === 'draw_no_bet' || p.marketCategory === 'combos';
    }
    return true;
  };

  // Filtered fixtures by search query and market group
  const filteredFootball = useMemo(() => {
    if (isBasketball) return [];
    return evaluatedFootballFixtures.filter(({ fixture, predictions }) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const home = fixture.homeTeam.name.toLowerCase();
        const away = fixture.awayTeam.name.toLowerCase();
        const comp = fixture.competition.name.toLowerCase();
        if (!home.includes(q) && !away.includes(q) && !comp.includes(q)) {
          return false;
        }
      }

      // Market group filter
      if (selectedFootballGroup !== 'ALL') {
        const hasMatchingMarket = predictions.some(p => matchesFootballMarketGroup(p, selectedFootballGroup));
        if (!hasMatchingMarket) return false;
      }
      return true;
    });
  }, [evaluatedFootballFixtures, searchQuery, selectedFootballGroup, isBasketball]);

  const filteredBasketball = useMemo(() => {
    if (!isBasketball) return [];
    if (!searchQuery.trim()) return fixtures;
    const q = searchQuery.toLowerCase().trim();
    return fixtures.filter(f => {
      const home = f.homeTeam.name.toLowerCase();
      const away = f.awayTeam.name.toLowerCase();
      return home.includes(q) || away.includes(q);
    });
  }, [fixtures, searchQuery, isBasketball]);

  const footballMarketFilters: { id: FootballMarketGroup; label: string }[] = [
    { id: 'ALL', label: 'All markets' },
    { id: 'results', label: 'Results' },
    { id: 'goals', label: 'Goals' },
    { id: 'corners', label: 'Corners' },
    { id: 'cards', label: 'Cards' },
  ];

  if (isSwitching) {
    return (
      <div className="space-y-3 py-2 animate-pulse">
        <div className="h-6 w-44 bg-[#101713] rounded-[8px]" />
        <div className="h-4 w-56 bg-[#101713] rounded-[8px]" />
        <div className="h-[38px] bg-[#101713] rounded-[11px]" />
        <div className="h-10 bg-[#101713] rounded-[11px]" />
        <div className="h-44 bg-[#101713] rounded-[14px]" />
      </div>
    );
  }

  const scheduledCount = isBasketball 
    ? `${fixtures.length} matchups` 
    : `${fixtures.length} scheduled`;

  const hasActiveFilters = searchQuery.trim() !== '' || selectedComp !== 'ALL' || selectedStatus !== 'ALL' || selectedFootballGroup !== 'ALL';

  return (
    <div className="space-y-3 py-1">
      {/* Sport switcher control */}
      <div className="pt-0.5">
        <SportSwitcher />
      </div>

      {/* Header: H2 "Fixtures and markets" at 19px with one line subtitle, and 34px square outlined refresh icon button on right */}
      <div className="flex items-center justify-between pt-1">
        <div className="space-y-0.5">
          <h2 className="text-[19px] font-[700] leading-[1.25] text-[#ECF1EE] tracking-[-0.02em]">
            Fixtures and markets
          </h2>
          <p className="text-[12px] text-[#8B9890] leading-tight">
            {scheduledCount} · Active matchday pipelines · All kickoff times WAT {lastUpdated ? `· Last updated ${lastUpdated}` : ''}
          </p>
        </div>

        <button
          onClick={handleRefresh}
          type="button"
          disabled={isRefreshing}
          className="w-[34px] h-[34px] min-w-[34px] min-h-[34px] rounded-[10px] border border-white/[0.07] bg-[#101713] hover:bg-[#151E19] text-[#8B9890] hover:text-[#ECF1EE] flex items-center justify-center transition-colors touch-press"
          title="Refresh fixtures"
          aria-label="Refresh fixtures"
        >
          <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#B6E63B]' : ''}`} strokeWidth={2} />
        </button>
      </div>

      {/* Notice if sync is delayed by more than 2 hours or snapshot older than 30 minutes */}
      {isDelayed && (
        <div className="p-2.5 rounded-[10px] bg-[#E2AE45]/10 border border-[#E2AE45]/30 text-[#E2AE45] text-[11.5px] flex items-center gap-2">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Data may be out of date (snapshot is older than 30 minutes).</span>
        </div>
      )}

      {/* Bug 6: Single notice at the top when odds are not connected */}
      <div className="p-2.5 rounded-[10px] bg-white/[0.04] border border-white/[0.08] text-[#8B9890] text-[11.5px] flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" />
        <span>Odds not connected. Showing probability analysis only.</span>
      </div>

      {/* Slim info note: 11.5px text, 2px lime left border, small info icon */}
      <div className="border-l-2 border-[#B6E63B] bg-[#101713] rounded-r-[10px] px-3 py-2 flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-[#B6E63B] shrink-0" strokeWidth={2} />
        <span className="text-[11.5px] leading-[16px] text-[#8B9890]">
          Live probabilities recalibrate on fixture ticks. Models abstain when data depth is insufficient.
        </span>
      </div>

      {/* Search field: 40px high with search icon and placeholder "Search club name" */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-[#8B9890]" strokeWidth={2} />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search club name"
          className="w-full h-10 pl-9 pr-8 rounded-[11px] bg-[#101713] border border-white/[0.07] text-[13px] text-[#ECF1EE] placeholder:text-[#5E6A63] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B6E63B]/40 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            type="button"
            className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#8B9890] hover:text-[#ECF1EE]"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Competition and Status selects: 2-column grid, small 11px label above each */}
      {!isBasketball && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-[#8B9890] font-normal mb-1 block">
              Competition
            </label>
            <select
              value={selectedComp}
              onChange={(e) => setSelectedComp(e.target.value)}
              className="w-full h-10 px-3 rounded-[11px] bg-[#101713] border border-white/[0.07] text-[13px] text-[#ECF1EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B6E63B]/40 appearance-none cursor-pointer"
            >
              <option value="ALL">All competitions</option>
              {COMPETITIONS.map(comp => (
                <option key={comp.code} value={comp.code}>
                  {cleanDisplayText(comp.name)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] text-[#8B9890] font-normal mb-1 block">
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-10 px-3 rounded-[11px] bg-[#101713] border border-white/[0.07] text-[13px] text-[#ECF1EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B6E63B]/40 appearance-none cursor-pointer"
            >
              <option value="ALL">All fixtures</option>
              <option value="TIMED">Upcoming</option>
              <option value="IN_PLAY">Live now</option>
              <option value="FINISHED">Completed</option>
            </select>
          </div>
        </div>
      )}

      {/* Market type chips: scroll horizontally in a single row (30px high pills) with scrollbar hidden */}
      {!isBasketball ? (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
          {footballMarketFilters.map(tab => {
            const isActive = selectedFootballGroup === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedFootballGroup(tab.id)}
                type="button"
                className={`h-[30px] px-3.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                  isActive
                    ? 'bg-[#B6E63B]/[0.12] border-[#B6E63B] text-[#B6E63B] font-semibold'
                    : 'bg-transparent border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="pt-0.5">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
            <span className="h-[30px] px-3.5 rounded-full text-[12px] font-semibold bg-[#B6E63B]/[0.12] border border-[#B6E63B] text-[#B6E63B] flex items-center">
              NBA Lines & Spreads
            </span>
          </div>
        </div>
      )}

      {/* Fixtures list with skeleton loaders on loading */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-44 bg-[#101713] rounded-[14px] border border-white/[0.07] animate-pulse p-4 space-y-3">
              <div className="h-3 w-32 bg-[#151E19] rounded" />
              <div className="space-y-2 pt-1">
                <div className="h-4 w-48 bg-[#151E19] rounded" />
                <div className="h-4 w-40 bg-[#151E19] rounded" />
              </div>
              <div className="h-16 bg-[#151E19] rounded-[11px]" />
            </div>
          ))}
        </div>
      ) : isBasketball ? (
        filteredBasketball.length > 0 ? (
          <div className="space-y-3">
            {filteredBasketball.map(f => (
              <NBAGameCard key={f.id} fixture={f} />
            ))}
          </div>
        ) : (
          /* Empty state: dashed border card with 46px icon tile, 15px title, 12.5px text, and Clear filters button */
          <div className="border border-dashed border-white/[0.15] bg-[#101713] rounded-[14px] p-6 text-center space-y-2.5">
            <div className="w-[46px] h-[46px] rounded-full bg-[#151E19] flex items-center justify-center text-[#8B9890] mx-auto">
              <Calendar className="w-5 h-5" strokeWidth={2} />
            </div>
            <div className="text-[15px] font-[600] text-[#ECF1EE]">
              No games scheduled
            </div>
            <p className="text-[12.5px] text-[#8B9890] max-w-xs mx-auto leading-relaxed">
              No NBA matchups matched your filter criteria. Try adjusting your query or resetting filters.
            </p>
            {hasActiveFilters && (
              <div className="pt-1">
                <button
                  onClick={handleClearFilters}
                  type="button"
                  className="h-[36px] px-4 rounded-[11px] border border-white/[0.07] bg-[#151E19] hover:bg-[#101713] text-[12.5px] font-medium text-[#ECF1EE] transition-colors touch-press"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )
      ) : filteredFootball.length > 0 ? (
        <div className="space-y-3">
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
        /* Empty state: dashed border card with 46px icon tile, 15px title, 12.5px text, and Clear filters button */
        <div className="border border-dashed border-white/[0.15] bg-[#101713] rounded-[14px] p-6 text-center space-y-2.5">
          <div className="w-[46px] h-[46px] rounded-full bg-[#151E19] flex items-center justify-center text-[#8B9890] mx-auto">
            <Calendar className="w-5 h-5" strokeWidth={2} />
          </div>
          <div className="text-[15px] font-[600] text-[#ECF1EE]">
            No games scheduled
          </div>
          <p className="text-[12.5px] text-[#8B9890] max-w-xs mx-auto leading-relaxed">
            No football matches matched your current search and filter parameters. Try clearing your filters to see scheduled fixtures.
          </p>
          {hasActiveFilters && (
            <div className="pt-1">
              <button
                onClick={handleClearFilters}
                type="button"
                className="h-[36px] px-4 rounded-[11px] border border-white/[0.07] bg-[#151E19] hover:bg-[#101713] text-[12.5px] font-medium text-[#ECF1EE] transition-colors touch-press"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
