'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { applyCanonicalTopPick } from '@/lib/prediction/canonicalHeadlinePick';
import { syncSlateExplanations } from '@/lib/prediction/explanationGenerator';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import NBAScoreProjectionTool from '@/components/nba/NBAScoreProjectionTool';
import CompetitionFilter from '@/components/CompetitionFilter';
import {
  CountryCompetitionGroup,
  buildCompetitionGroupsFromFixtures,
  fixtureMatchesSearchQuery,
  getFixtureCanonicalCompetitionId,
  normalizeSelectedCompetitionIds,
} from '@/lib/data/competitionSearch';
import { matchesDayFilter } from '@/lib/utils/dateWindow';
import { Search, Zap, TrendingUp, AlertCircle, Calendar, X } from 'lucide-react';

export default function DashboardPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';
  const isMultiSport = sport === 'all';

  const [selectedCompIds, setSelectedCompIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'completed'>('upcoming');
  const [apiCompGroups, setApiCompGroups] = useState<CountryCompetitionGroup[] | null>(null);
  const [apiTotalCompFixtures, setApiTotalCompFixtures] = useState<number | null>(null);

  useEffect(() => {
    setSelectedCompIds((prev) => normalizeSelectedCompetitionIds(prev, sport));
  }, [sport]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setDebouncedSearchQuery('');
      return;
    }
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const dayParam = activeTab === 'today' ? 'today' : 'ALL';
    fetch(`/api/v1/competitions?sport=${encodeURIComponent(sport)}&day=${dayParam}&include_empty=true`, {
      cache: 'no-store',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (Array.isArray(json.groupedByCountry)) {
          setApiCompGroups(json.groupedByCountry);
        }
        if (typeof json.totalFixtures === 'number') {
          setApiTotalCompFixtures(json.totalFixtures);
        }
      })
      .catch((err) => {
        console.error('[DashboardPage] Error fetching active competitions:', err);
        setApiCompGroups(null);
        setApiTotalCompFixtures(null);
      });
  }, [sport, activeTab]);

  const { fixtures, lastUpdated, error, isOffline, isSavedCopy, evaluations } = useLiveFixtures(
    selectedCompIds.length > 0 ? selectedCompIds : 'ALL',
    'ALL',
    sport,
    activeTab === 'today' ? 'today' : 'ALL'
  );

  const { compGroups, totalCompFixtures } = useMemo(() => {
    const dayParam = activeTab === 'today' ? 'today' : 'ALL';
    if (Array.isArray(apiCompGroups) && apiCompGroups.length > 0 && ((apiTotalCompFixtures ?? 0) > 0 || fixtures.length === 0 || selectedCompIds.length > 0)) {
      return { compGroups: apiCompGroups, totalCompFixtures: apiTotalCompFixtures ?? 0 };
    }
    const derived = buildCompetitionGroupsFromFixtures({
      fixtures,
      sport,
      day: dayParam,
      hideZeroFixtures: false,
    });
    return {
      compGroups: derived.groupedByCountry,
      totalCompFixtures: derived.totalFixtures,
    };
  }, [apiCompGroups, apiTotalCompFixtures, fixtures, sport, activeTab, selectedCompIds.length]);

  const selectedCompSet = useMemo(() => new Set(selectedCompIds), [selectedCompIds]);

  const evaluatedFixtures = useMemo(() => {
    if (isBasketball) return [];
    const canonical = fixtures
      .filter((f) => f.sport !== 'basketball')
      .map((fixture) => {
        const stats = getFixtureStatistics(fixture);
        const context = buildFixtureContextFromStats(fixture, stats);
        const evalResult = applyCanonicalTopPick(
          evaluateFixtureMarkets(context),
          fixture.writtenExplanation,
          fixture
        );

        return {
          fixtureId: fixture.id,
          fixture,
          context,
          predictions: evalResult.predictions,
          topPick: evalResult.topPick,
          noRecommendationReason: evalResult.noRecommendationReason || stats.noRecommendationReason,
          writtenExplanation: fixture.writtenExplanation,
        };
      });
    return syncSlateExplanations(canonical);
  }, [fixtures, isBasketball]);

  const footballEvalById = useMemo(() => {
    const map = new Map<string, (typeof evaluatedFixtures)[number]>();
    for (const item of evaluatedFixtures) {
      map.set(item.fixtureId, item);
    }
    return map;
  }, [evaluatedFixtures]);

  const filteredList = useMemo(() => {
    if (isBasketball || isMultiSport) return [];
    return evaluatedFixtures.filter(({ fixture }) => {
      if (selectedCompSet.size > 0 && !selectedCompSet.has(getFixtureCanonicalCompetitionId(fixture))) {
        return false;
      }
      if (debouncedSearchQuery.trim() && !fixtureMatchesSearchQuery(fixture, debouncedSearchQuery)) {
        return false;
      }
      if (activeTab === 'completed') {
        return fixture.status === 'FINISHED';
      } else if (activeTab === 'today') {
        return fixture.status !== 'FINISHED' && matchesDayFilter(fixture.kickoffTime, 'today');
      }
      return fixture.status !== 'FINISHED';
    });
  }, [evaluatedFixtures, selectedCompSet, debouncedSearchQuery, activeTab, isBasketball, isMultiSport]);

  const filteredBasketball = useMemo(() => {
    if (!isBasketball) return [];
    return fixtures.filter((fixture) => {
      if (selectedCompSet.size > 0 && !selectedCompSet.has(getFixtureCanonicalCompetitionId(fixture))) {
        return false;
      }
      if (debouncedSearchQuery.trim() && !fixtureMatchesSearchQuery(fixture, debouncedSearchQuery)) {
        return false;
      }
      if (activeTab === 'completed') {
        return fixture.status === 'FINISHED';
      } else if (activeTab === 'today') {
        return fixture.status !== 'FINISHED' && matchesDayFilter(fixture.kickoffTime, 'today');
      }
      return fixture.status !== 'FINISHED';
    });
  }, [fixtures, selectedCompSet, debouncedSearchQuery, activeTab, isBasketball]);

  const filteredAllSports = useMemo(() => {
    if (!isMultiSport) return [];
    return fixtures.filter((fixture) => {
      if (selectedCompSet.size > 0 && !selectedCompSet.has(getFixtureCanonicalCompetitionId(fixture))) {
        return false;
      }
      if (debouncedSearchQuery.trim() && !fixtureMatchesSearchQuery(fixture, debouncedSearchQuery)) {
        return false;
      }
      if (activeTab === 'completed') {
        return fixture.status === 'FINISHED';
      } else if (activeTab === 'today') {
        return fixture.status !== 'FINISHED' && matchesDayFilter(fixture.kickoffTime, 'today');
      }
      return fixture.status !== 'FINISHED';
    });
  }, [fixtures, selectedCompSet, debouncedSearchQuery, activeTab, isMultiSport]);

  if (isSwitching) {
    return (
      <div className="space-y-4 py-4 animate-pulse">
        <div className="h-8 w-64 bg-[var(--surface)] rounded-[10px]" />
        <div className="h-32 bg-[var(--surface)] rounded-[18px] border border-[var(--line)]" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div className="h-44 bg-[var(--surface)] rounded-[18px] border border-[var(--line)]" />
          <div className="h-44 bg-[var(--surface)] rounded-[18px] border border-[var(--line)]" />
          <div className="h-44 bg-[var(--surface)] rounded-[18px] border border-[var(--line)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
        <div>
          <h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--text)] flex items-center gap-2 flex-wrap">
            <span>{isBasketball ? 'Basketball totals terminal' : 'Market intelligence dashboard'}</span>
            <span className="text-[10.5px] px-2.5 py-0.5 rounded-full border border-[var(--accent)]/35 bg-[var(--accent-soft)] text-[var(--accent)] font-semibold">
              Live
            </span>
          </h1>
          <p className="text-[12.5px] text-[var(--text-2)] mt-1">
            {isBasketball
              ? 'NBA, NCAAB Division I, and EuroLeague game, team, and 1st half totals models.'
              : 'Real-time multi-market evaluation across authorized catalog lines.'}
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" strokeWidth={2} />
          <input
            type="text"
            placeholder={isBasketball ? 'Search basketball team or league' : 'Search club or league'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 min-h-[44px] bg-[var(--surface)] border border-[var(--line)] pl-10 pr-10 rounded-[12px] text-[13px] text-[var(--text)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setDebouncedSearchQuery('');
              }}
              className="absolute inset-y-0 right-0 min-w-[44px] flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)]"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {(isSavedCopy || error) && (
        <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[12px] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            {isSavedCopy
              ? `Showing saved copy${lastUpdated ? ` from ${lastUpdated}` : ''}${error ? ` (${error})` : ''}.`
              : isOffline
              ? 'You appear to be offline and no saved copy is available.'
              : error || 'Unable to load fixtures.'}
          </span>
        </div>
      )}

      {isBasketball && (
        <div className="pt-1">
          <NBAScoreProjectionTool />
        </div>
      )}

      {!isBasketball && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-1.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[var(--text)] flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.75} />
                <span>Goal lines</span>
              </span>
              <span className="text-[var(--text-3)] text-[11px] tabular-nums">Mean 2.85 xG</span>
            </div>
            <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
              Bivariate Poisson goal line modeling tracks offensive and defensive rates across European leagues.
            </p>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-1.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[var(--text)] flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.75} />
                <span>Corner volume</span>
              </span>
              <span className="text-[var(--text-3)] text-[11px] tabular-nums">Mean 10.8</span>
            </div>
            <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
              Negative Binomial corner projections calibrate over/under volume when corner coverage exists.
            </p>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-1.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[var(--text)] flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-[var(--medium)]" strokeWidth={1.75} />
                <span>Disciplinary cards</span>
              </span>
              <span className="text-[var(--text-3)] text-[11px] tabular-nums">Line 4.5</span>
            </div>
            <p className="text-[12.5px] text-[var(--text-2)] leading-[1.5]">
              Referee and team discipline baselines calibrate cards totals while displaying &ldquo;—&rdquo; when absent.
            </p>
          </div>
        </div>
      )}

      {/* Fixtures Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
        <div className="flex items-center gap-1 bg-[var(--surface)] p-1 rounded-[12px] border border-[var(--line)] text-[12px] font-medium self-start">
          {(
            [
              { id: 'today', label: "Today's games" },
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'completed', label: 'Completed' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
              className={`min-h-[38px] px-3 rounded-[9px] transition-colors touch-press ${
                activeTab === tab.id
                  ? 'bg-[var(--accent-fill)] text-[var(--accent-ink)] font-bold'
                  : 'text-[var(--text-2)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-72">
          <CompetitionFilter
            selectedCompetitionIds={selectedCompIds}
            onApplyCompetitionIds={setSelectedCompIds}
            groups={compGroups}
            totalFixturesCount={totalCompFixtures}
            showSportBadge={isMultiSport}
          />
        </div>
      </div>

      {/* Matchup Grid */}
      {isMultiSport ? (
        filteredAllSports.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredAllSports.map((f) => {
              if (f.sport === 'basketball') {
                return <NBAGameCard key={f.id} fixture={f} evaluation={evaluations?.[f.id]} />;
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
          <div className="p-8 text-center bg-[var(--surface)] border border-dashed border-[var(--border-strong)] rounded-[18px] space-y-2.5">
            <div className="w-10 h-10 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center mx-auto text-[var(--text-3)]">
              <Calendar className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <h3 className="font-display text-[var(--text)] font-semibold text-[14px]">No games scheduled</h3>
            <p className="text-[12px] text-[var(--text-2)] max-w-sm mx-auto">
              No fixtures matching your active competition or search filters.
            </p>
          </div>
        )
      ) : isBasketball ? (
        filteredBasketball.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredBasketball.map((f) => (
              <NBAGameCard key={f.id} fixture={f} evaluation={evaluations?.[f.id]} />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-[var(--surface)] border border-dashed border-[var(--border-strong)] rounded-[18px] space-y-2.5">
            <div className="w-10 h-10 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center mx-auto text-[var(--text-3)]">
              <Calendar className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <h3 className="font-display text-[var(--text)] font-semibold text-[14px]">
              {activeTab === 'today' ? 'No games today' : 'No games scheduled'}
            </h3>
            <p className="text-[12px] text-[var(--text-2)] max-w-sm mx-auto">
              No basketball matchups matching your current filter.
            </p>
          </div>
        )
      ) : filteredList.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredList.map(({ fixture, topPick, noRecommendationReason, writtenExplanation }) => (
            <FixtureCard
              key={fixture.id}
              fixture={fixture}
              topPrediction={topPick}
              noRecommendationReason={noRecommendationReason}
              writtenExplanation={writtenExplanation}
            />
          ))}
        </div>
      ) : (
        <div className="p-8 text-center bg-[var(--surface)] border border-dashed border-[var(--border-strong)] rounded-[18px] space-y-2.5">
          <div className="w-10 h-10 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center mx-auto text-[var(--text-3)]">
            <Calendar className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <h3 className="font-display text-[var(--text)] font-semibold text-[14px]">No games scheduled</h3>
          <p className="text-[12px] text-[var(--text-2)] max-w-sm mx-auto">
            No European football fixtures matching your filter. Check upcoming matchdays.
          </p>
        </div>
      )}
    </div>
  );
}
