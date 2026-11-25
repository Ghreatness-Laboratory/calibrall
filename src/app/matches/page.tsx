'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import SportSwitcher from '@/components/SportSwitcher';
import CompetitionFilter from '@/components/CompetitionFilter';
import { CountryCompetitionGroup } from '@/lib/data/canonicalCompetitions';
import { matchesDayFilter, DayFilterType } from '@/lib/data/fixturesDatabase';
import { MarketPrediction, MatchStatus } from '@/types';
import type { BasketballLeague, BasketballMarketCategory } from '@/lib/basketball/markets';
import { 
  RotateCw, 
  Info, 
  Search, 
  Calendar,
  X,
  AlertCircle
} from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';

type FootballMarketGroup = 'ALL' | 'results' | 'goals' | 'corners' | 'cards';
type BasketballLeagueFilter = 'ALL' | BasketballLeague;
type BasketballMarketFilter = 'ALL' | BasketballMarketCategory;

export default function MatchesPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCompId, setSelectedCompId] = useState<string>('ALL');
  const [selectedBbLeague, setSelectedBbLeague] = useState<BasketballLeagueFilter>('ALL');
  const [selectedDay, setSelectedDay] = useState<DayFilterType>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedFootballGroup, setSelectedFootballGroup] = useState<FootballMarketGroup>('ALL');
  const [selectedBbGroup, setSelectedBbGroup] = useState<BasketballMarketFilter>('ALL');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [compGroups, setCompGroups] = useState<CountryCompetitionGroup[]>([]);
  const [totalCompetitionsFixtures, setTotalCompetitionsFixtures] = useState<number>(0);

  const loadCompetitions = React.useCallback(() => {
    if (isBasketball) return;
    fetch('/api/v1/competitions?sport=football', { cache: 'no-store' })
      .then(res => res.json())
      .then(json => {
        if (json.groupedByCountry && Array.isArray(json.groupedByCountry)) {
          setCompGroups(json.groupedByCountry);
        }
        if (typeof json.totalFixtures === 'number') {
          setTotalCompetitionsFixtures(json.totalFixtures);
        }
      })
      .catch(err => console.error('[MatchesPage] Error fetching active competitions:', err));
  }, [isBasketball]);

  // Fetch active competitions dynamically from the database
  useEffect(() => {
    loadCompetitions();
  }, [loadCompetitions]);

  const { 
    fixtures, 
    isLoading, 
    liveDataAvailable, 
    lastUpdated, 
    isDelayed, 
    staleLimitMinutes,
    hasFreeFixturesSource,
    storedHistoryMode,
    error,
    serverStatus,
    isOffline,
    isSavedCopy,
    failedProvider, 
    quotaHeaders, 
    evaluations,
    refetch 
  } = useLiveFixtures(
    isBasketball ? selectedBbLeague : selectedCompId, 
    selectedStatus, 
    sport,
    selectedDay
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    loadCompetitions();
    if (refetch) {
      await refetch();
    }
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedCompId('ALL');
    setSelectedBbLeague('ALL');
    setSelectedDay('ALL');
    setSelectedStatus('ALL');
    setSelectedFootballGroup('ALL');
    setSelectedBbGroup('ALL');
  };

  // Football evaluated fixtures with 40% market family diversity cap
  const evaluatedFootballFixtures = useMemo(() => {
    if (isBasketball) return [];
    const raw = fixtures.map(fixture => {
      const stats = getFixtureStatistics(fixture);
      const evalResult = evaluateFixtureMarkets(buildFixtureContextFromStats(fixture, stats));

      return {
        fixtureId: fixture.id,
        fixture,
        topPick: evalResult.topPick,
        predictions: evalResult.predictions,
        noRecommendationReason: evalResult.noRecommendationReason || stats.noRecommendationReason,
      };
    });
    return selectDiversifiedSlatePicks(raw, 0.40);
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

  // Filtered fixtures by competition_id only, combined with day filter, search, and market group
  const filteredFootball = useMemo(() => {
    if (isBasketball) return [];
    return evaluatedFootballFixtures.filter(({ fixture, predictions }) => {
      // Rule 3: Filter by competition_id ONLY
      if (selectedCompId !== 'ALL') {
        const fixtureCompId = fixture.competitionId || fixture.competition?.id;
        if (fixtureCompId !== selectedCompId) {
          return false;
        }
      }

      // Rule 3: Combine with day filter
      if (selectedDay !== 'ALL') {
        if (!matchesDayFilter(fixture.kickoffTime, selectedDay)) {
          return false;
        }
      }

      // Status filter
      if (selectedStatus !== 'ALL') {
        if (fixture.status !== selectedStatus) {
          return false;
        }
      }

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
  }, [evaluatedFootballFixtures, selectedCompId, selectedDay, selectedStatus, searchQuery, selectedFootballGroup, isBasketball]);

  const filteredBasketball = useMemo(() => {
    if (!isBasketball) return [];
    return fixtures.filter(f => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const home = f.homeTeam.name.toLowerCase();
        const away = f.awayTeam.name.toLowerCase();
        const league = (f.basketballStats?.league || f.competition?.code || '').toLowerCase();
        if (!home.includes(q) && !away.includes(q) && !league.includes(q)) return false;
      }
      if (selectedBbGroup !== 'ALL') {
        const ev = evaluations?.[f.id];
        if (!ev || ev.needsHistory || !ev.picks.some(p => p.marketCategory === selectedBbGroup)) {
          return false;
        }
      }
      return true;
    });
  }, [fixtures, searchQuery, isBasketball, selectedBbGroup, evaluations]);

  const footballMarketFilters: { id: FootballMarketGroup; label: string }[] = [
    { id: 'ALL', label: 'All markets' },
    { id: 'results', label: 'Results' },
    { id: 'goals', label: 'Goals' },
    { id: 'corners', label: 'Corners' },
    { id: 'cards', label: 'Cards' },
  ];

  const basketballMarketFilters: { id: BasketballMarketFilter; label: string }[] = [
    { id: 'ALL', label: 'All totals' },
    { id: 'game_total', label: 'Game Total' },
    { id: 'home_total', label: 'Home Total' },
    { id: 'away_total', label: 'Away Total' },
    { id: 'h1_game_total', label: '1st Half Total' },
    { id: 'h1_team_total', label: '1st Half Team' },
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

  const hasActiveFilters = isBasketball
    ? searchQuery.trim() !== '' || selectedBbLeague !== 'ALL' || selectedDay !== 'ALL' || selectedStatus !== 'ALL' || selectedBbGroup !== 'ALL'
    : searchQuery.trim() !== '' || selectedCompId !== 'ALL' || selectedDay !== 'ALL' || selectedStatus !== 'ALL' || selectedFootballGroup !== 'ALL';
  const showStaleBanner = Boolean(isDelayed && !storedHistoryMode && (fixtures.length > 0 || error));
  const staleWindowLabel = (staleLimitMinutes || 4320) >= 1440
    ? `${Math.round((staleLimitMinutes || 4320) / 1440)} days`
    : `${staleLimitMinutes || 4320} minutes`;

  return (
    <div className="space-y-3 py-1">
      {/* Sport switcher control */}
      <div className="pt-0.5">
        <SportSwitcher />
      </div>

      {/* Header: H2 "Fixtures and markets" at 20px with one line subtitle, and 34px square outlined refresh icon button on right */}
      <div className="flex items-center justify-between pt-1">
        <div className="space-y-0.5">
          <h2 className="text-[20px] font-[700] leading-[1.22] text-[#E9EFEB] tracking-[-0.025em]">
            Fixtures and markets
          </h2>
          <p className="text-[12px] text-[#8B9892] leading-tight">
            {storedHistoryMode
              ? `${fixtures.length} stored history · Fixtures not available on free tier`
              : `${scheduledCount} · Database fixture store · All kickoff times WAT ${lastUpdated ? `· Last updated ${lastUpdated}` : ''}`}
          </p>
        </div>

        <button
          onClick={handleRefresh}
          type="button"
          disabled={isRefreshing}
          className="w-[34px] h-[34px] min-w-[34px] min-h-[34px] rounded-[10px] border border-[#1F2A24] bg-[#101613] hover:bg-[#151D19] text-[#8B9892] hover:text-[#E9EFEB] flex items-center justify-center transition-colors touch-press"
          title="Refresh fixtures"
          aria-label="Refresh fixtures"
        >
          <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#B8E636]' : ''}`} strokeWidth={2} />
        </button>
      </div>

      {/* Notice for leagues without a free fixtures provider */}
      {(storedHistoryMode || hasFreeFixturesSource === false) && !isBasketball && (
        <div className="p-2.5 rounded-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11.5px] flex items-center gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 text-amber-300" />
          <span>
            Fixtures not available on free tier for this league. Showing stored match history and picks only.
          </span>
        </div>
      )}

      {/* Saved copy notice when serving preserved fixtures after a server/network error */}
      {isSavedCopy && fixtures.length > 0 && (
        <div className="p-2.5 rounded-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11.5px] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isOffline ? 'Offline' : (error || (serverStatus ? `server error (${serverStatus})` : 'Server unavailable'))}: keeping saved copy{lastUpdated ? ` (last updated ${lastUpdated})` : ''}.
            </span>
          </div>
          <span className="shrink-0 px-2 py-0.5 rounded-[6px] bg-amber-500/20 font-mono text-[10px] font-semibold uppercase">
            saved copy
          </span>
        </div>
      )}

      {/* Error/staleness banner shown ONLY when stored fixtures exceed the 3 day staleness limit */}
      {showStaleBanner && !isSavedCopy && (
        <div className="p-2.5 rounded-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11.5px] space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {failedProvider
                ? `Provider feed ${failedProvider} refresh failed. Showing stored fixtures (last updated ${lastUpdated || 'never'}, older than ${staleWindowLabel} limit).`
                : `Stored fixtures are older than ${staleWindowLabel} (last updated ${lastUpdated || 'never'}).`}
            </span>
          </div>
          {quotaHeaders && Object.keys(quotaHeaders).length > 0 && (
            <div className="font-mono text-[10.5px] text-amber-200/80 pl-5">
              Quota: {Object.entries(quotaHeaders).map(([k, v]) => `${k}=${v}`).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Verified odds vs unquoted snapshot status */}
      {isBasketball ? (
        Object.values(evaluations || {}).some(ev => ev.picks.some(p => !p.isModelLine)) ? (
          <div className="p-2.5 rounded-[10px] bg-[#B8E636]/[0.08] border border-[#B8E636]/20 text-[#B8E636] text-[11.5px] flex items-center gap-2 font-mono">
            <Info className="w-3.5 h-3.5 text-[#B8E636] shrink-0" />
            <span>Bookmaker totals matched where available. Unpriced totals display &quot;model line - no market price&quot; with no EV.</span>
          </div>
        ) : (
          <div className="p-2.5 rounded-[10px] bg-[#151D19] border border-[#1F2A24] text-[#8B9892] text-[11.5px] flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-[#B8E636] shrink-0" />
            <span>Model totals active across NBA, NCAAB Division I, and EuroLeague. Unpriced lines display &quot;model line - no market price&quot; without EV.</span>
          </div>
        )
      ) : fixtures.some(f => Boolean(f.verifiedOdds)) ? (
        <div className="p-2.5 rounded-[10px] bg-[#B8E636]/[0.08] border border-[#B8E636]/20 text-[#B8E636] text-[11.5px] flex items-center gap-2 font-mono">
          <Info className="w-3.5 h-3.5 text-[#B8E636] shrink-0" />
          <span>Real bookmaker odds active (DraftKings sportsbook lines). Unquoted lines show &quot;—&quot;.</span>
        </div>
      ) : (
        <div className="p-2.5 rounded-[10px] bg-[#151D19] border border-[#1F2A24] text-[#8B9892] text-[11.5px] flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-[#B8E636] shrink-0" />
          <span>Odds not connected. Unquoted markets show &quot;—&quot;. Showing probability analysis only.</span>
        </div>
      )}

      {/* Slim info note: 11.5px text, 2px lime left border, small info icon */}
      <div className="border-l-2 border-[#B8E636] bg-[#101613] rounded-r-[10px] px-3 py-2 flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-[#B8E636] shrink-0" strokeWidth={2} />
        <span className="text-[11.5px] leading-[16px] text-[#8B9892]">
          {isBasketball
            ? 'Walk-forward calibrated totals and 1st half models only. Games without enough team or half-score history abstain cleanly.'
            : 'Live probabilities recalibrate on fixture ticks. Models abstain when data depth is insufficient.'}
        </span>
      </div>

      {/* Search field: 40px high with search icon */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-[#8B9890]" strokeWidth={2} />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={isBasketball ? 'Search NBA, NCAAB, or EuroLeague team' : 'Search club name'}
          className="w-full h-10 pl-9 pr-8 rounded-[12px] bg-[#101613] border border-[#1F2A24] text-[13px] text-[#E9EFEB] placeholder:text-[#5E6B65] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#B8E636] transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            type="button"
            className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#8B9892] hover:text-[#E9EFEB]"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Competition / League and Status selects: 2-column grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {isBasketball ? (
          <div>
            <label className="text-[11px] text-[#8B9892] font-normal mb-1 block">
              League
            </label>
            <select
              value={selectedBbLeague}
              onChange={(e) => setSelectedBbLeague(e.target.value as BasketballLeagueFilter)}
              className="w-full h-10 px-3 rounded-[12px] bg-[#101613] border border-[#1F2A24] text-[13px] text-[#E9EFEB] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#B8E636] appearance-none cursor-pointer"
            >
              <option value="ALL">All leagues (NBA · NCAAB · EuroLeague)</option>
              <option value="NBA">NBA</option>
              <option value="NCAAB">NCAAB Division I</option>
              <option value="EUROLEAGUE">EuroLeague</option>
            </select>
          </div>
        ) : (
          <CompetitionFilter
            selectedCompetitionId={selectedCompId}
            onSelectCompetitionId={setSelectedCompId}
            groups={compGroups}
            totalFixturesCount={totalCompetitionsFixtures || fixtures.length}
          />
        )}

        <div>
          <label className="text-[11px] text-[#8B9892] font-normal mb-1 block">
            Status
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full h-10 px-3 rounded-[12px] bg-[#101613] border border-[#1F2A24] text-[13px] text-[#E9EFEB] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#B8E636] appearance-none cursor-pointer"
          >
            <option value="ALL">All fixtures</option>
            <option value="TIMED">Upcoming</option>
            <option value="IN_PLAY">Live now</option>
            <option value="FINISHED">Completed</option>
          </select>
        </div>
      </div>

      {/* Day Filter Controls (Today / Tomorrow / Weekend / All) */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
        <span className="text-[11px] text-[#8B9892] mr-1 shrink-0 flex items-center gap-1">
          <Calendar className="w-3 h-3 text-[#8B9892]" />
          Day:
        </span>
        {(['ALL', 'today', 'tomorrow', 'weekend'] as const).map(day => {
          const isActive = selectedDay === day;
          const label = day === 'ALL' ? 'All days' : day === 'today' ? 'Today' : day === 'tomorrow' ? 'Tomorrow' : 'Weekend';
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`h-7 px-3 rounded-[9px] text-[11px] font-medium transition-colors shrink-0 border ${
                isActive
                  ? 'bg-[#B8E636]/15 border-[#B8E636]/40 text-[#B8E636] font-semibold'
                  : 'bg-[#101613] border-[#1F2A24] text-[#8B9892] hover:text-[#E9EFEB]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

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
                className={`h-[30px] px-3.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                  isActive
                    ? 'bg-[#B8E636]/12 border-[#B8E636]/30 text-[#B8E636] font-semibold'
                    : 'bg-[#151D19] border-[#1F2A24] text-[#8B9892] hover:text-[#E9EFEB]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
          {basketballMarketFilters.map(tab => {
            const isActive = selectedBbGroup === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedBbGroup(tab.id)}
                type="button"
                className={`h-[30px] px-3.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                  isActive
                    ? 'bg-[#B8E636]/12 border-[#B8E636]/30 text-[#B8E636] font-semibold'
                    : 'bg-[#151D19] border-[#1F2A24] text-[#8B9892] hover:text-[#E9EFEB]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
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
              <NBAGameCard key={f.id} fixture={f} evaluation={evaluations?.[f.id]} />
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
              No NBA, NCAAB, or EuroLeague matchups matched your filter criteria. Try adjusting your query or resetting filters.
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
      ) : !storedHistoryMode && (error || !liveDataAvailable) && fixtures.length === 0 ? (
        /* Loud Error State showing real status and reason */
        <div className="border border-rose-500/30 bg-rose-500/10 rounded-[14px] p-6 text-center space-y-3">
          <div className="w-[46px] h-[46px] rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="text-[16px] font-[700] text-[#ECF1EE]">
            {isOffline
              ? 'Offline: browser is not connected'
              : (error || `Fixtures unavailable${serverStatus ? ` (${serverStatus})` : ''}`)}
          </div>
          <p className="text-[12.5px] text-[#8B9890] max-w-sm mx-auto leading-relaxed">
            {isOffline
              ? 'Your browser appears offline and no saved copy exists for this filter.'
              : `Request could not load fresh fixtures${lastUpdated ? ` (last updated ${lastUpdated})` : ''}. No synthetic substitute data is generated.`}
          </p>
          {failedProvider && (
            <div className="text-[12px] font-mono text-rose-300">
              Failed Provider: <span className="font-semibold text-rose-200">{failedProvider}</span>
            </div>
          )}
          {quotaHeaders && Object.keys(quotaHeaders).length > 0 && (
            <div className="mt-2 p-2.5 rounded-[8px] bg-[#101713] border border-white/[0.08] text-left max-w-sm mx-auto text-[11px] font-mono text-[#8B9890] space-y-1">
              <div className="text-[#ECF1EE] font-semibold text-[10.5px] uppercase">Quota Response Headers:</div>
              {Object.entries(quotaHeaders).map(([key, val]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-[#5E6A63]">{key}:</span>
                  <span className="text-[#ECF1EE]">{val}</span>
                </div>
              ))}
            </div>
          )}
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
