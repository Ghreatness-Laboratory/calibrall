'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard, { BasketballMarketGroupFilter } from '@/components/nba/NBAGameCard';
import CompetitionFilter from '@/components/CompetitionFilter';
import { CountryCompetitionGroup } from '@/lib/data/canonicalCompetitions';
import { matchesDayFilter, DayFilterType } from '@/lib/data/fixturesDatabase';
import { MarketPrediction } from '@/types';
import type { BasketballLeague } from '@/lib/basketball/markets';
import { RotateCw, Info, Search, Calendar, X, AlertCircle } from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';

type FootballMarketGroup = 'ALL' | 'results' | 'goals' | 'corners' | 'cards';
type BasketballLeagueFilter = 'ALL' | BasketballLeague;
type BasketballMarketFilter = BasketballMarketGroupFilter;

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
  const [utcTime, setUtcTime] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const h = String(now.getUTCHours()).padStart(2, '0');
      const m = String(now.getUTCMinutes()).padStart(2, '0');
      setUtcTime(`${h}:${m} UTC`);
    };
    updateClock();
    const id = setInterval(updateClock, 60000);
    return () => clearInterval(id);
  }, []);

  const loadCompetitions = React.useCallback(() => {
    if (isBasketball) return;
    fetch('/api/v1/competitions?sport=football', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json.groupedByCountry && Array.isArray(json.groupedByCountry)) {
          setCompGroups(json.groupedByCountry);
        }
        if (typeof json.totalFixtures === 'number') {
          setTotalCompetitionsFixtures(json.totalFixtures);
        }
      })
      .catch((err) => console.error('[MatchesPage] Error fetching active competitions:', err));
  }, [isBasketball]);

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
    refetch,
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

  const evaluatedFootballFixtures = useMemo(() => {
    if (isBasketball) return [];
    const raw = fixtures.map((fixture) => {
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
    return selectDiversifiedSlatePicks(raw, 0.4);
  }, [fixtures, isBasketball]);

  const matchesFootballMarketGroup = (p: MarketPrediction, group: FootballMarketGroup): boolean => {
    if (group === 'ALL') return true;
    if (group === 'goals') {
      return (
        p.optionType === 'over_under_goals' ||
        p.optionType === 'first_half_goals' ||
        p.marketCategory === 'total_goals' ||
        p.marketCategory === 'team_goals' ||
        p.marketCategory === 'btts'
      );
    }
    if (group === 'corners') {
      return (
        p.optionType === 'corners' ||
        p.optionType === 'corner_handicap' ||
        p.marketCategory === 'total_corners' ||
        p.marketCategory === 'team_corners'
      );
    }
    if (group === 'cards') {
      return (
        p.optionType === 'bookings' ||
        p.optionType === 'team_bookings' ||
        p.optionType === 'booking_points' ||
        p.marketCategory === 'bookings'
      );
    }
    if (group === 'results') {
      return (
        p.optionType === 'win' ||
        p.optionType === 'draw' ||
        p.optionType === 'double_chance' ||
        p.optionType === 'draw_no_bet' ||
        p.optionType === 'win_draw_combo' ||
        p.marketCategory === 'match_result' ||
        p.marketCategory === 'double_chance' ||
        p.marketCategory === 'draw_no_bet' ||
        p.marketCategory === 'combos'
      );
    }
    return true;
  };

  const filteredFootball = useMemo(() => {
    if (isBasketball) return [];
    return evaluatedFootballFixtures.filter(({ fixture, predictions }) => {
      if (selectedCompId !== 'ALL') {
        const fixtureCompId = fixture.competitionId || fixture.competition?.id;
        if (fixtureCompId !== selectedCompId) {
          return false;
        }
      }
      if (selectedDay !== 'ALL') {
        if (!matchesDayFilter(fixture.kickoffTime, selectedDay)) {
          return false;
        }
      }
      if (selectedStatus !== 'ALL') {
        if (fixture.status !== selectedStatus) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const home = fixture.homeTeam.name.toLowerCase();
        const away = fixture.awayTeam.name.toLowerCase();
        const comp = fixture.competition.name.toLowerCase();
        if (!home.includes(q) && !away.includes(q) && !comp.includes(q)) {
          return false;
        }
      }
      if (selectedFootballGroup !== 'ALL') {
        const hasMatchingMarket = predictions.some((p) =>
          matchesFootballMarketGroup(p, selectedFootballGroup)
        );
        if (!hasMatchingMarket) return false;
      }
      return true;
    });
  }, [
    evaluatedFootballFixtures,
    selectedCompId,
    selectedDay,
    selectedStatus,
    searchQuery,
    selectedFootballGroup,
    isBasketball,
  ]);

  const filteredBasketball = useMemo(() => {
    if (!isBasketball) return [];
    return fixtures.filter((f) => {
      const gameLeague = f.basketballStats?.league || f.competition?.code;
      if (selectedBbLeague !== 'ALL' && gameLeague !== selectedBbLeague) {
        return false;
      }
      if (selectedDay !== 'ALL' && !matchesDayFilter(f.kickoffTime, selectedDay)) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const home = f.homeTeam.name.toLowerCase();
        const away = f.awayTeam.name.toLowerCase();
        const league = (gameLeague || '').toLowerCase();
        if (!home.includes(q) && !away.includes(q) && !league.includes(q)) return false;
      }
      if (selectedBbGroup !== 'ALL') {
        const ev = evaluations?.[f.id];
        if (!ev || ev.needsHistory) {
          return false;
        }
        if (selectedBbGroup === 'game_total') {
          return ev.picks.some((p) => p.marketCategory === 'game_total');
        }
        if (selectedBbGroup === 'team_total') {
          return ev.picks.some(
            (p) => p.marketCategory === 'home_total' || p.marketCategory === 'away_total'
          );
        }
        if (selectedBbGroup === 'h1_total') {
          return (
            ev.picks.some(
              (p) => p.marketCategory === 'h1_game_total' || p.marketCategory === 'h1_team_total'
            ) || Boolean(f.basketballStats?.needsH1History)
          );
        }
      }
      return true;
    });
  }, [
    fixtures,
    searchQuery,
    isBasketball,
    selectedBbLeague,
    selectedDay,
    selectedBbGroup,
    evaluations,
  ]);

  const quickLeagueChips = useMemo(() => {
    const flat: { id: string; label: string; count: number }[] = [];
    for (const grp of compGroups) {
      for (const comp of grp.competitions) {
        if (comp.fixtureCount > 0) {
          flat.push({ id: comp.id, label: cleanDisplayText(comp.name), count: comp.fixtureCount });
        }
      }
    }
    return flat.sort((a, b) => b.count - a.count).slice(0, 6);
  }, [compGroups]);

  const footballMarketFilters: { id: FootballMarketGroup; label: string }[] = [
    { id: 'ALL', label: 'All markets' },
    { id: 'results', label: 'Results' },
    { id: 'goals', label: 'Goals' },
    { id: 'corners', label: 'Corners' },
    { id: 'cards', label: 'Cards' },
  ];

  const basketballMarketFilters: { id: BasketballMarketFilter; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: 'game_total', label: 'Game total' },
    { id: 'team_total', label: 'Team total' },
    { id: 'h1_total', label: '1st half' },
  ];

  if (isSwitching) {
    return (
      <div className="space-y-4 py-2 animate-pulse">
        <div className="h-4 w-32 bg-[var(--surface)] rounded-[8px]" />
        <div className="h-8 w-40 bg-[var(--surface)] rounded-[8px]" />
        <div className="h-11 bg-[var(--surface)] rounded-[12px]" />
        <div className="h-48 bg-[var(--surface)] rounded-[18px]" />
        <div className="h-48 bg-[var(--surface)] rounded-[18px]" />
      </div>
    );
  }

  const scheduledCount = isBasketball
    ? `${filteredBasketball.length} matchups`
    : `${fixtures.length} scheduled`;

  const hasActiveFilters = isBasketball
    ? searchQuery.trim() !== '' ||
      selectedBbLeague !== 'ALL' ||
      selectedDay !== 'ALL' ||
      selectedStatus !== 'ALL' ||
      selectedBbGroup !== 'ALL'
    : searchQuery.trim() !== '' ||
      selectedCompId !== 'ALL' ||
      selectedDay !== 'ALL' ||
      selectedStatus !== 'ALL' ||
      selectedFootballGroup !== 'ALL';

  const showStaleBanner = Boolean(isDelayed && !storedHistoryMode && (fixtures.length > 0 || error));
  const staleWindowLabel =
    (staleLimitMinutes || 4320) >= 1440
      ? `${Math.round((staleLimitMinutes || 4320) / 1440)} days`
      : `${staleLimitMinutes || 4320} minutes`;

  return (
    <div className="space-y-4 py-1">
      {/* Top Status & Large Title */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-2)]">
          <div className="inline-flex items-center gap-1.5 font-medium text-[var(--text)]">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            <span>Model live</span>
          </div>
          <span className="tabular-nums font-medium" suppressHydrationWarning>
            {utcTime || 'UTC'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h1 className="font-display text-[26px] font-bold leading-[1.15] text-[var(--text)] tracking-[-0.02em]">
              Fixtures
            </h1>
            <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
              {storedHistoryMode
                ? `${fixtures.length} stored history · Archive mode`
                : isBasketball
                ? `${scheduledCount} · Local tip-off times${lastUpdated ? ` · Updated ${lastUpdated}` : ''}`
                : `${scheduledCount} · Calibrated match schedule${lastUpdated ? ` · Updated ${lastUpdated}` : ''}`}
            </p>
          </div>

          <button
            onClick={handleRefresh}
            type="button"
            disabled={isRefreshing}
            className="min-w-[44px] min-h-[44px] rounded-[12px] border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] flex items-center justify-center transition-colors touch-press shrink-0"
            title="Refresh fixtures"
            aria-label="Refresh fixtures"
          >
            <RotateCw
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[var(--accent)]' : ''}`}
              strokeWidth={2}
            />
          </button>
        </div>
      </div>

      {/* Horizontal Date Strip */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5" role="group" aria-label="Date filter">
        {(['ALL', 'today', 'tomorrow', 'weekend'] as const).map((day) => {
          const isActive = selectedDay === day;
          const label =
            day === 'ALL'
              ? 'All days'
              : day === 'today'
              ? 'Today'
              : day === 'tomorrow'
              ? 'Tomorrow'
              : 'Weekend';
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`min-h-[44px] px-4 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors shrink-0 border touch-press ${
                isActive
                  ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                  : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* League Filter Chips */}
      {isBasketball ? (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5" role="group" aria-label="League filter">
          {(
            [
              { id: 'ALL', label: 'All leagues' },
              { id: 'NBA', label: 'NBA' },
              { id: 'NCAAB', label: 'NCAAB' },
              { id: 'EUROLEAGUE', label: 'EuroLeague' },
            ] as const
          ).map((chip) => {
            const isActive = selectedBbLeague === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setSelectedBbLeague(chip.id)}
                className={`min-h-[44px] px-3.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                  isActive
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                    : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      ) : (
        quickLeagueChips.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5" role="group" aria-label="League quick filter">
            <button
              type="button"
              onClick={() => setSelectedCompId('ALL')}
              className={`min-h-[44px] px-3.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                selectedCompId === 'ALL'
                  ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                  : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
              }`}
            >
              All leagues
            </button>
            {quickLeagueChips.map((chip) => {
              const isActive = selectedCompId === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setSelectedCompId(chip.id)}
                  className={`min-h-[44px] px-3.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                      : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                  }`}
                >
                  <span>{chip.label}</span>
                  <span className="text-[10.5px] opacity-75 tabular-nums">{chip.count}</span>
                </button>
              );
            })}
          </div>
        )
      )}

      {/* Search & Selector Controls */}
      <div className="space-y-2.5">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-[var(--text-3)]" strokeWidth={2} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isBasketball ? 'Search NBA, NCAAB, or EuroLeague team' : 'Search club or league'}
            className="w-full min-h-[44px] pl-10 pr-10 rounded-[12px] bg-[var(--surface)] border border-[var(--line)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus-visible:outline-none focus-visible:border-[var(--accent)] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              type="button"
              className="absolute inset-y-0 right-0 min-w-[44px] flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)]"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
          {!isBasketball && (
            <CompetitionFilter
              selectedCompetitionId={selectedCompId}
              onSelectCompetitionId={setSelectedCompId}
              groups={compGroups}
              totalFixturesCount={totalCompetitionsFixtures || fixtures.length}
            />
          )}

          <div className={isBasketball ? 'sm:col-span-2' : ''}>
            <label className="text-[11px] text-[var(--text-2)] font-medium mb-1 block">
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-[12px] bg-[var(--surface)] border border-[var(--line)] text-[13px] text-[var(--text)] focus-visible:outline-none focus-visible:border-[var(--accent)] appearance-none cursor-pointer"
            >
              <option value="ALL">All fixtures</option>
              <option value="TIMED">Upcoming</option>
              <option value="IN_PLAY">Live now</option>
              <option value="FINISHED">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Market Focus Chips */}
      {!isBasketball ? (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
          {footballMarketFilters.map((tab) => {
            const isActive = selectedFootballGroup === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedFootballGroup(tab.id)}
                type="button"
                className={`min-h-[44px] px-3.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                  isActive
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                    : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
          {basketballMarketFilters.map((tab) => {
            const isActive = selectedBbGroup === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedBbGroup(tab.id)}
                type="button"
                className={`min-h-[44px] px-3.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                  isActive
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                    : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Notices */}
      {(storedHistoryMode || hasFreeFixturesSource === false) && !isBasketball && (
        <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[12px] flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>Archive view active for this competition. Showing stored match history and picks.</span>
        </div>
      )}

      {isSavedCopy && fixtures.length > 0 && (
        <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[12px] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {isOffline ? 'Offline' : error || (serverStatus ? `Server error (${serverStatus})` : 'Server unavailable')}: showing saved copy{lastUpdated ? ` (${lastUpdated})` : ''}.
            </span>
          </div>
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-[var(--medium)]/20 text-[10.5px] font-semibold">
            Saved copy
          </span>
        </div>
      )}

      {showStaleBanner && !isSavedCopy && (
        <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[12px] space-y-1">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {failedProvider
                ? `Feed ${failedProvider} refresh failed. Showing stored fixtures older than ${staleWindowLabel}.`
                : `Stored fixtures are older than ${staleWindowLabel} (last updated ${lastUpdated || 'never'}).`}
            </span>
          </div>
        </div>
      )}

      {/* Fixtures List / Skeleton Loaders */}
      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading fixtures">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-[var(--surface)] rounded-[18px] border border-[var(--line)] animate-pulse p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="h-3.5 w-36 bg-[var(--surface-2)] rounded" />
                <div className="h-3.5 w-14 bg-[var(--surface-2)] rounded" />
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[var(--surface-2)]" />
                  <div className="h-4 w-44 bg-[var(--surface-2)] rounded" />
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[var(--surface-2)]" />
                  <div className="h-4 w-40 bg-[var(--surface-2)] rounded" />
                </div>
              </div>
              <div className="h-24 bg-[var(--surface-2)] rounded-[12px]" />
              <div className="h-5 w-32 bg-[var(--surface-2)] rounded" />
            </div>
          ))}
        </div>
      ) : isBasketball ? (
        filteredBasketball.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredBasketball.map((f) => (
              <NBAGameCard
                key={f.id}
                fixture={f}
                evaluation={evaluations?.[f.id]}
                marketGroupFilter={selectedBbGroup}
              />
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-[var(--border-strong)] bg-[var(--surface)] rounded-[18px] p-6 text-center space-y-3">
            <div className="w-[46px] h-[46px] rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-2)] mx-auto">
              <Calendar className="w-5 h-5" strokeWidth={2} />
            </div>
            <div className="font-display text-[15px] font-semibold text-[var(--text)]">
              {selectedDay === 'today' ? 'No games today' : 'No games scheduled'}
            </div>
            <p className="text-[12.5px] text-[var(--text-2)] max-w-xs mx-auto leading-[1.5]">
              No basketball matchups matched the active filters.
            </p>
            {hasActiveFilters && (
              <div>
                <button
                  onClick={handleClearFilters}
                  type="button"
                  className="min-h-[44px] px-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--surface)] text-[12.5px] font-medium text-[var(--text)] transition-colors touch-press"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )
      ) : filteredFootball.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        <div className="border border-[var(--danger)]/30 bg-[var(--danger-soft)] rounded-[18px] p-6 text-center space-y-3">
          <div className="w-[46px] h-[46px] rounded-full bg-[var(--danger)]/20 text-[var(--danger)] flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="font-display text-[16px] font-bold text-[var(--text)]">
            {isOffline
              ? 'Offline: browser is not connected'
              : error || `Fixtures unavailable${serverStatus ? ` (${serverStatus})` : ''}`}
          </div>
          <p className="text-[12.5px] text-[var(--text-2)] max-w-sm mx-auto leading-[1.5]">
            {isOffline
              ? 'Your browser appears offline and no saved copy exists for this filter.'
              : `Request could not load fresh fixtures${lastUpdated ? ` (last updated ${lastUpdated})` : ''}.`}
          </p>
          {failedProvider && (
            <div className="text-[12px] text-[var(--danger)]">
              Failed provider: <span className="font-semibold">{failedProvider}</span>
            </div>
          )}
          {quotaHeaders && Object.keys(quotaHeaders).length > 0 && (
            <div className="mt-2 p-2.5 rounded-[12px] bg-[var(--surface)] border border-[var(--line)] text-left max-w-sm mx-auto text-[11px] text-[var(--text-2)] space-y-1">
              <div className="text-[var(--text)] font-semibold">Quota response headers</div>
              {Object.entries(quotaHeaders).map(([key, val]) => (
                <div key={key} className="flex justify-between tabular-nums">
                  <span className="text-[var(--text-3)]">{key}:</span>
                  <span className="text-[var(--text)]">{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="border border-dashed border-[var(--border-strong)] bg-[var(--surface)] rounded-[18px] p-6 text-center space-y-3">
          <div className="w-[46px] h-[46px] rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-2)] mx-auto">
            <Calendar className="w-5 h-5" strokeWidth={2} />
          </div>
          <div className="font-display text-[15px] font-semibold text-[var(--text)]">
            No games scheduled
          </div>
          <p className="text-[12.5px] text-[var(--text-2)] max-w-xs mx-auto leading-[1.5]">
            No football matches matched your current search and filter parameters.
          </p>
          {hasActiveFilters && (
            <div>
              <button
                onClick={handleClearFilters}
                type="button"
                className="min-h-[44px] px-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--surface)] text-[12.5px] font-medium text-[var(--text)] transition-colors touch-press"
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
