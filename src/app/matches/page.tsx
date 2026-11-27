'use client';

import React, { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '@/lib/prediction/marketSelection';
import {
  generateFootballExplanation,
  syncSlateExplanations,
} from '@/lib/prediction/explanationGenerator';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard, { BasketballMarketGroupFilter } from '@/components/nba/NBAGameCard';
import CompetitionFilter from '@/components/CompetitionFilter';
import {
  CountryCompetitionGroup,
  UnmappedFixtureEntry,
  CANONICAL_COMPETITIONS_CATALOG,
  buildCompetitionGroupsFromFixtures,
  fixtureMatchesSearchQuery,
  getFixtureCanonicalCompetitionId,
  normalizeSelectedCompetitionIds,
} from '@/lib/data/competitionSearch';
import { matchesDayFilter, DayFilterType } from '@/lib/utils/dateWindow';
import { Fixture, MarketPrediction } from '@/types';
import Link from 'next/link';
import { RotateCw, Info, Search, Calendar, X, AlertCircle, AlertTriangle, Layers } from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';

type FootballMarketGroup = 'ALL' | 'results' | 'goals' | 'multi_goals' | 'goal_runs' | 'corners' | 'cards';
type BasketballMarketFilter = BasketballMarketGroupFilter;

const COMP_STORAGE_PREFIX = 'calibrall_selected_competitions_v1:';

function MatchesPageInner() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';
  const isMultiSport = sport === 'all';

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [selectedCompIds, setSelectedCompIds] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayFilterType>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedFootballGroup, setSelectedFootballGroup] = useState<FootballMarketGroup>('ALL');
  const [selectedBbGroup, setSelectedBbGroup] = useState<BasketballMarketFilter>('ALL');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [apiCompGroups, setApiCompGroups] = useState<CountryCompetitionGroup[] | null>(null);
  const [apiTotalFixtures, setApiTotalFixtures] = useState<number | null>(null);
  const [unmappedFixtures, setUnmappedFixtures] = useState<UnmappedFixtureEntry[]>([]);
  const [showUnmappedDetails, setShowUnmappedDetails] = useState<boolean>(false);
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

  // Debounce top search input (immediate clear when empty)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setDebouncedSearchQuery('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync competition filter from URL (?competition=...) or remembered choice in localStorage
  useEffect(() => {
    const urlComp = searchParams.get('competition') ?? searchParams.get('competition_id');
    const storageKey = `${COMP_STORAGE_PREFIX}${sport}`;

    let hadForeignSportParam = false;
    if (urlComp !== null) {
      const hasRawValues = urlComp
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .some((s) => Boolean(s) && s !== 'all');
      const normalized = normalizeSelectedCompetitionIds(urlComp, sport);
      if (normalized.length > 0 || !hasRawValues) {
        setSelectedCompIds(normalized);
        try {
          window.localStorage.setItem(storageKey, normalized.length > 0 ? normalized.join(',') : 'ALL');
        } catch {
          // ignore storage failures
        }
        return;
      }
      hadForeignSportParam = hasRawValues;
    }

    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved && saved.toUpperCase() !== 'ALL') {
        const restored = normalizeSelectedCompetitionIds(saved, sport);
        setSelectedCompIds(restored);
        if (restored.length > 0) {
          const nextParams = new URLSearchParams(Array.from(searchParams.entries()));
          nextParams.set('competition', restored.join(','));
          router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
        }
        return;
      }
    } catch {
      // ignore storage failures
    }

    setSelectedCompIds([]);
    if (hadForeignSportParam) {
      const nextParams = new URLSearchParams(Array.from(searchParams.entries()));
      nextParams.delete('competition');
      nextParams.delete('competition_id');
      const qs = nextParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [sport, searchParams, pathname, router]);

  const applyCompetitionIds = useCallback(
    (nextIds: string[]) => {
      const clean = normalizeSelectedCompetitionIds(nextIds, sport);
      setSelectedCompIds(clean);

      const storageKey = `${COMP_STORAGE_PREFIX}${sport}`;
      try {
        window.localStorage.setItem(storageKey, clean.length > 0 ? clean.join(',') : 'ALL');
      } catch {
        // ignore storage failures
      }

      const nextParams = new URLSearchParams(Array.from(searchParams.entries()));
      nextParams.delete('competition_id');
      if (clean.length > 0) {
        nextParams.set('competition', clean.join(','));
      } else {
        nextParams.delete('competition');
      }
      const qs = nextParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sport, searchParams, pathname, router]
  );

  const loadCompetitions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('sport', sport);
      params.set('include_empty', 'true');
      if (selectedDay && selectedDay !== 'ALL') {
        params.set('day', selectedDay);
      }

      const res = await fetch(`/api/v1/competitions?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      if (Array.isArray(json.groupedByCountry)) {
        setApiCompGroups(json.groupedByCountry);
      }
      if (typeof json.totalFixtures === 'number') {
        setApiTotalFixtures(json.totalFixtures);
      }
      if (Array.isArray(json.unmappedFixtures)) {
        setUnmappedFixtures(json.unmappedFixtures);
      } else {
        setUnmappedFixtures([]);
      }
    } catch (err) {
      console.error('[MatchesPage] Error fetching canonical competitions:', err);
      setApiCompGroups(null);
      setApiTotalFixtures(null);
    }
  }, [sport, selectedDay]);

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
    selectedCompIds.length > 0 ? selectedCompIds : 'ALL',
    selectedStatus,
    sport,
    selectedDay
  );

  // Build canonical competition groups: prefer authoritative day-scoped DB API counts,
  // and cleanly fall back or hydrate from loaded fixtures when API is unavailable or returning empty while cached fixtures exist.
  const { compGroups, totalCompetitionsFixtures } = useMemo(() => {
    const apiHasGroups = Array.isArray(apiCompGroups) && apiCompGroups.length > 0;
    const apiCount = typeof apiTotalFixtures === 'number' ? apiTotalFixtures : 0;

    if (apiHasGroups && (apiCount > 0 || fixtures.length === 0 || selectedCompIds.length > 0)) {
      return {
        compGroups: apiCompGroups,
        totalCompetitionsFixtures: apiCount,
      };
    }

    const derived = buildCompetitionGroupsFromFixtures({
      fixtures,
      sport,
      day: selectedDay,
      hideZeroFixtures: false,
    });

    if (apiHasGroups && apiCount === 0 && derived.totalFixtures === 0) {
      return {
        compGroups: apiCompGroups,
        totalCompetitionsFixtures: 0,
      };
    }

    return {
      compGroups: derived.groupedByCountry,
      totalCompetitionsFixtures: derived.totalFixtures,
    };
  }, [apiCompGroups, apiTotalFixtures, fixtures, sport, selectedDay, selectedCompIds.length]);

  const compMetaById = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const grp of compGroups) {
      for (const comp of grp.competitions) {
        map.set(comp.id.toLowerCase(), {
          name: cleanDisplayText(comp.name),
          count: comp.fixtureCount,
        });
      }
    }
    return map;
  }, [compGroups]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadCompetitions(), refetch ? refetch() : Promise.resolve()]);
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    applyCompetitionIds([]);
    setSelectedDay('ALL');
    setSelectedStatus('ALL');
    setSelectedFootballGroup('ALL');
    setSelectedBbGroup('ALL');
  };

  const matchesStatusFilter = (fixture: Fixture, statusFilter: string): boolean => {
    if (!statusFilter || statusFilter === 'ALL') return true;
    if (statusFilter === 'TIMED') {
      return fixture.status === 'TIMED' || fixture.status === 'SCHEDULED';
    }
    if (statusFilter === 'IN_PLAY') {
      return fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED';
    }
    return fixture.status === statusFilter;
  };

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
    if (group === 'multi_goals') {
      return (
        p.optionType === 'multi_goals' ||
        p.optionType === 'team_multi_goals' ||
        p.optionType === 'first_half_multi_goals' ||
        p.marketCategory === 'multi_goals'
      );
    }
    if (group === 'goal_runs') {
      return p.optionType === 'goal_runs' || p.marketCategory === 'goal_runs';
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

  const evaluatedFootballFixtures = useMemo(() => {
    if (isBasketball) return [];
    const footballOnly = fixtures.filter((f) => f.sport !== 'basketball');
    const raw = footballOnly.map((fixture) => {
      const stats = getFixtureStatistics(fixture);
      const context = buildFixtureContextFromStats(fixture, stats);
      const evalResult = evaluateFixtureMarkets(context);

      return {
        fixtureId: fixture.id,
        fixture,
        context,
        topPick: evalResult.topPick,
        predictions: evalResult.predictions,
        noRecommendationReason: evalResult.noRecommendationReason || stats.noRecommendationReason,
        writtenExplanation: fixture.writtenExplanation,
      };
    });
    return syncSlateExplanations(selectDiversifiedSlatePicks(raw, 0.4));
  }, [fixtures, isBasketball]);

  const footballEvalById = useMemo(() => {
    const map = new Map<string, (typeof evaluatedFootballFixtures)[number]>();
    for (const item of evaluatedFootballFixtures) {
      map.set(item.fixtureId, item);
    }
    return map;
  }, [evaluatedFootballFixtures]);

  const selectedCompSet = useMemo(() => new Set(selectedCompIds), [selectedCompIds]);

  const filteredFootball = useMemo(() => {
    if (isBasketball || isMultiSport) return [];
    return evaluatedFootballFixtures.filter(({ fixture, predictions }) => {
      if (selectedCompSet.size > 0) {
        const fixtureCompId = getFixtureCanonicalCompetitionId(fixture);
        if (!selectedCompSet.has(fixtureCompId)) return false;
      }
      if (selectedDay !== 'ALL' && !matchesDayFilter(fixture.kickoffTime, selectedDay)) {
        return false;
      }
      if (!matchesStatusFilter(fixture, selectedStatus)) {
        return false;
      }
      if (debouncedSearchQuery.trim() && !fixtureMatchesSearchQuery(fixture, debouncedSearchQuery)) {
        return false;
      }
      if (selectedFootballGroup !== 'ALL') {
        const hasMatchingMarket =
          selectedFootballGroup === 'multi_goals'
            ? predictions.some(
                (p) =>
                  matchesFootballMarketGroup(p, 'multi_goals') &&
                  !p.isSpeculative &&
                  Boolean(p.isValidated) &&
                  (p.rankingScore ?? 0) > 0
              )
            : predictions.some((p) => matchesFootballMarketGroup(p, selectedFootballGroup));
        if (!hasMatchingMarket) return false;
      }
      return true;
    });
  }, [
    evaluatedFootballFixtures,
    selectedCompSet,
    selectedDay,
    selectedStatus,
    debouncedSearchQuery,
    selectedFootballGroup,
    isBasketball,
    isMultiSport,
  ]);

  const filteredBasketball = useMemo(() => {
    if (!isBasketball) return [];
    return fixtures.filter((f) => {
      if (selectedCompSet.size > 0) {
        const fixtureCompId = getFixtureCanonicalCompetitionId(f);
        if (!selectedCompSet.has(fixtureCompId)) return false;
      }
      if (selectedDay !== 'ALL' && !matchesDayFilter(f.kickoffTime, selectedDay)) {
        return false;
      }
      if (!matchesStatusFilter(f, selectedStatus)) {
        return false;
      }
      if (debouncedSearchQuery.trim() && !fixtureMatchesSearchQuery(f, debouncedSearchQuery)) {
        return false;
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
    debouncedSearchQuery,
    isBasketball,
    selectedCompSet,
    selectedDay,
    selectedStatus,
    selectedBbGroup,
    evaluations,
  ]);

  const filteredAllSports = useMemo(() => {
    if (!isMultiSport) return [];
    return fixtures.filter((f) => {
      if (selectedCompSet.size > 0) {
        const fixtureCompId = getFixtureCanonicalCompetitionId(f);
        if (!selectedCompSet.has(fixtureCompId)) return false;
      }
      if (selectedDay !== 'ALL' && !matchesDayFilter(f.kickoffTime, selectedDay)) {
        return false;
      }
      if (!matchesStatusFilter(f, selectedStatus)) {
        return false;
      }
      if (debouncedSearchQuery.trim() && !fixtureMatchesSearchQuery(f, debouncedSearchQuery)) {
        return false;
      }
      return true;
    });
  }, [fixtures, isMultiSport, selectedCompSet, selectedDay, selectedStatus, debouncedSearchQuery]);

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

  const toggleQuickChip = (compId: string) => {
    const clean = compId.toLowerCase();
    if (selectedCompSet.has(clean)) {
      applyCompetitionIds(selectedCompIds.filter((id) => id !== clean));
    } else {
      applyCompetitionIds([...selectedCompIds, clean]);
    }
  };

  const footballMarketFilters: { id: FootballMarketGroup; label: string }[] = [
    { id: 'ALL', label: 'All markets' },
    { id: 'results', label: 'Results' },
    { id: 'goals', label: 'Goals' },
    { id: 'multi_goals', label: 'Multi goals' },
    { id: 'goal_runs', label: 'Goal runs' },
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

  const displayedCount = isBasketball
    ? filteredBasketball.length
    : isMultiSport
    ? filteredAllSports.length
    : filteredFootball.length;

  const scheduledCount = isBasketball
    ? `${displayedCount} matchups`
    : `${displayedCount} scheduled`;

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedCompIds.length > 0 ||
    selectedDay !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    (isBasketball ? selectedBbGroup !== 'ALL' : !isMultiSport && selectedFootballGroup !== 'ALL');

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
          <div className="space-y-0.5 min-w-0">
            <h1 className="font-display text-[26px] font-bold leading-[1.15] text-[var(--text)] tracking-[-0.02em]">
              Fixtures
            </h1>
            <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
              {storedHistoryMode
                ? `${displayedCount} stored history · Archive mode`
                : isBasketball
                ? `${scheduledCount} · Local tip off times${lastUpdated ? ` · Updated ${lastUpdated}` : ''}`
                : isMultiSport
                ? `${scheduledCount} · Football and basketball slate${lastUpdated ? ` · Updated ${lastUpdated}` : ''}`
                : `${scheduledCount} · Calibrated match schedule${lastUpdated ? ` · Updated ${lastUpdated}` : ''}`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/slips"
              className="min-h-[44px] px-3 rounded-[12px] bg-[var(--accent-soft)] border border-[var(--accent)]/40 text-[12px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]/80 flex items-center gap-1.5 transition-colors touch-press whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5" strokeWidth={2} />
              <span>Build a slip</span>
            </Link>

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

      {/* Quick League Filter Chips */}
      {quickLeagueChips.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5" role="group" aria-label="League quick filter">
          <button
            type="button"
            onClick={() => applyCompetitionIds([])}
            className={`min-h-[44px] px-3.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
              selectedCompIds.length === 0
                ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)] font-semibold'
                : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
            }`}
          >
            All leagues
          </button>
          {quickLeagueChips.map((chip) => {
            const isActive = selectedCompSet.has(chip.id.toLowerCase());
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => toggleQuickChip(chip.id)}
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
            placeholder={
              isBasketball
                ? 'Search basketball team or league'
                : 'Search club or league'
            }
            data-testid="fixtures-top-search"
            className="w-full min-h-[44px] pl-10 pr-11 rounded-[12px] bg-[var(--surface)] border border-[var(--line)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] focus-visible:outline-none focus-visible:border-[var(--accent)] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setDebouncedSearchQuery('');
              }}
              type="button"
              className="absolute inset-y-0 right-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)]"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
          <CompetitionFilter
            selectedCompetitionIds={selectedCompIds}
            onApplyCompetitionIds={applyCompetitionIds}
            groups={compGroups}
            totalFixturesCount={totalCompetitionsFixtures}
            showSportBadge={isMultiSport}
          />

          <div>
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
      {!isBasketball && !isMultiSport && (
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
      )}

      {isBasketball && (
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

      {/* Selected Competition Removable Chips Above the List */}
      {selectedCompIds.length > 0 && (
        <div
          className="flex items-center flex-wrap gap-2 pt-0.5"
          data-testid="selected-competition-chips"
          aria-label="Active competition filters"
        >
          {selectedCompIds.map((id) => {
            const meta = compMetaById.get(id);
            const fallbackName = CANONICAL_COMPETITIONS_CATALOG[id]?.name || id;
            const label = cleanDisplayText(meta?.name || fallbackName);
            const count = meta?.count;
            return (
              <button
                key={id}
                type="button"
                onClick={() => applyCompetitionIds(selectedCompIds.filter((x) => x !== id))}
                className="min-h-[44px] pl-3.5 pr-2.5 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/45 text-[var(--accent)] text-[12.5px] font-semibold inline-flex items-center gap-2 touch-press"
                aria-label={`Remove ${label} filter`}
              >
                <span>{label}</span>
                {typeof count === 'number' && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--accent)]/15 tabular-nums">
                    {count}
                  </span>
                )}
                <X className="w-3.5 h-3.5 shrink-0" strokeWidth={2.4} />
              </button>
            );
          })}
          {selectedCompIds.length > 1 && (
            <button
              type="button"
              onClick={() => applyCompetitionIds([])}
              className="min-h-[44px] px-3 rounded-full border border-[var(--line)] bg-[var(--surface)] text-[12px] text-[var(--text-2)] hover:text-[var(--text)] touch-press"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Notices */}
      {(storedHistoryMode || hasFreeFixturesSource === false) && !isBasketball && (
        <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[12px] flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>Archive view active for this competition. Showing stored match history and picks.</span>
        </div>
      )}

      {unmappedFixtures.length > 0 && (
        <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[12px] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {unmappedFixtures.length} fixture{unmappedFixtures.length === 1 ? '' : 's'} could not be mapped to a canonical league and {unmappedFixtures.length === 1 ? 'was' : 'were'} withheld.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowUnmappedDetails((v) => !v)}
              className="min-h-[36px] px-2.5 rounded-[8px] border border-[var(--medium)]/30 text-[11px] font-semibold shrink-0"
            >
              {showUnmappedDetails ? 'Hide' : 'List'}
            </button>
          </div>
          {showUnmappedDetails && (
            <ul className="space-y-1 text-[11px] text-[var(--text)] border-t border-[var(--medium)]/20 pt-2">
              {unmappedFixtures.slice(0, 20).map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {cleanDisplayText(u.homeTeamName)} vs {cleanDisplayText(u.awayTeamName)}
                  </span>
                  <span className="text-[var(--text-2)] shrink-0">
                    {cleanDisplayText(u.reason)}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
      ) : isMultiSport ? (
        filteredAllSports.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredAllSports.map((f) => {
              if (f.sport === 'basketball') {
                return (
                  <NBAGameCard
                    key={f.id}
                    fixture={f}
                    evaluation={evaluations?.[f.id]}
                  />
                );
              }
              const ev = footballEvalById.get(f.id);
              return (
                <FixtureCard
                  key={f.id}
                  fixture={f}
                  topPrediction={ev?.topPick}
                  noRecommendationReason={ev?.noRecommendationReason}
                  writtenExplanation={ev?.writtenExplanation}
                />
              );
            })}
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
              No fixtures matched your active search and competition filters.
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
          {filteredFootball.map(({ fixture, context, topPick, predictions, noRecommendationReason, writtenExplanation }) => {
            const focusedPick =
              selectedFootballGroup === 'multi_goals' && topPick?.marketCategory !== 'multi_goals'
                ? predictions.find(
                    (p) =>
                      matchesFootballMarketGroup(p, 'multi_goals') &&
                      !p.isSpeculative &&
                      Boolean(p.isValidated) &&
                      (p.rankingScore ?? 0) > 0
                  ) || topPick
                : selectedFootballGroup === 'goal_runs' && topPick?.marketCategory !== 'goal_runs'
                ? predictions
                    .filter((p) => matchesFootballMarketGroup(p, 'goal_runs'))
                    .sort(
                      (a, b) =>
                        (b.calibratedProbability ?? b.modelProbability) -
                        (a.calibratedProbability ?? a.modelProbability)
                    )[0] || topPick
                : topPick;
            const syncedWrittenExplanation =
              focusedPick &&
              topPick?.marketCode !== focusedPick.marketCode
                ? (() => {
                    const regenerated = generateFootballExplanation({
                      fixture,
                      evaluation: {
                        topPick: focusedPick,
                        predictions,
                        noRecommendationReason,
                      },
                      context,
                    });
                    if (writtenExplanation?.tierLocked) {
                      return {
                        ...regenerated,
                        fullSummary: '',
                        driverTiles: [],
                        reasoning: {},
                        alternates: [],
                        marketBoard: [],
                        tierLocked: true,
                        dailySummaryLimitReached: Boolean(writtenExplanation.dailySummaryLimitReached),
                      };
                    }
                    return writtenExplanation
                      ? {
                          ...regenerated,
                          tierLocked: writtenExplanation.tierLocked,
                          dailySummaryLimitReached: writtenExplanation.dailySummaryLimitReached,
                        }
                      : regenerated;
                  })()
                : writtenExplanation;
            return (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                topPrediction={focusedPick}
                noRecommendationReason={noRecommendationReason}
                writtenExplanation={syncedWrittenExplanation}
              />
            );
          })}
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

export default function MatchesPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 py-2 animate-pulse">
          <div className="h-8 w-40 bg-[var(--surface)] rounded-[8px]" />
          <div className="h-11 bg-[var(--surface)] rounded-[12px]" />
          <div className="h-48 bg-[var(--surface)] rounded-[18px]" />
        </div>
      }
    >
      <MatchesPageInner />
    </Suspense>
  );
}
