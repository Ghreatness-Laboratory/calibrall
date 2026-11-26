'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import NBAScoreProjectionTool from '@/components/nba/NBAScoreProjectionTool';
import CompetitionFilter from '@/components/CompetitionFilter';
import { CountryCompetitionGroup } from '@/lib/data/canonicalCompetitions';
import { matchesDayFilter } from '@/lib/utils/dateWindow';
import { Search, Zap, TrendingUp, AlertCircle, Calendar } from 'lucide-react';
import type { BasketballLeague } from '@/lib/basketball/markets';

export default function DashboardPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const [selectedCompId, setSelectedCompId] = useState<string>('ALL');
  const [selectedBbLeague, setSelectedBbLeague] = useState<'ALL' | BasketballLeague>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'completed'>('upcoming');
  const [compGroups, setCompGroups] = useState<CountryCompetitionGroup[]>([]);
  const [totalCompFixtures, setTotalCompFixtures] = useState<number>(0);

  useEffect(() => {
    if (isBasketball) return;
    fetch('/api/v1/competitions?sport=football', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json.groupedByCountry && Array.isArray(json.groupedByCountry)) {
          setCompGroups(json.groupedByCountry);
        }
        if (typeof json.totalFixtures === 'number') {
          setTotalCompFixtures(json.totalFixtures);
        }
      })
      .catch((err) => console.error('[DashboardPage] Error fetching active competitions:', err));
  }, [isBasketball]);

  const { fixtures, lastUpdated, error, isOffline, isSavedCopy, evaluations } = useLiveFixtures(
    isBasketball ? selectedBbLeague : selectedCompId,
    'ALL',
    sport,
    activeTab === 'today' ? 'today' : 'ALL'
  );

  const evaluatedFixtures = useMemo(() => {
    if (isBasketball) return [];
    const raw = fixtures.map((fixture) => {
      const stats = getFixtureStatistics(fixture);
      const evalResult = evaluateFixtureMarkets(buildFixtureContextFromStats(fixture, stats));

      return {
        fixtureId: fixture.id,
        fixture,
        predictions: evalResult.predictions,
        topPick: evalResult.topPick,
        noRecommendationReason: evalResult.noRecommendationReason || stats.noRecommendationReason,
      };
    });
    return selectDiversifiedSlatePicks(raw, 0.4);
  }, [fixtures, isBasketball]);

  const filteredList = useMemo(() => {
    if (isBasketball) return [];
    const subset = evaluatedFixtures.filter(({ fixture }) => {
      if (selectedCompId !== 'ALL' && (fixture.competitionId || fixture.competition.id) !== selectedCompId) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesHome = fixture.homeTeam.name.toLowerCase().includes(q);
        const matchesAway = fixture.awayTeam.name.toLowerCase().includes(q);
        const matchesComp = fixture.competition.name.toLowerCase().includes(q);
        if (!matchesHome && !matchesAway && !matchesComp) return false;
      }
      if (activeTab === 'completed') {
        return fixture.status === 'FINISHED';
      } else if (activeTab === 'today') {
        return fixture.status !== 'FINISHED' && matchesDayFilter(fixture.kickoffTime, 'today');
      }
      return fixture.status !== 'FINISHED';
    });
    return selectDiversifiedSlatePicks(subset, 0.4);
  }, [evaluatedFixtures, selectedCompId, searchQuery, activeTab, isBasketball]);

  const filteredBasketball = useMemo(() => {
    if (!isBasketball) return [];
    return fixtures.filter((fixture) => {
      const gameLeague = fixture.basketballStats?.league || fixture.competition?.code;
      if (selectedBbLeague !== 'ALL' && gameLeague !== selectedBbLeague) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesHome = fixture.homeTeam.name.toLowerCase().includes(q);
        const matchesAway = fixture.awayTeam.name.toLowerCase().includes(q);
        const matchesLeague = (gameLeague || '').toLowerCase().includes(q);
        if (!matchesHome && !matchesAway && !matchesLeague) return false;
      }
      if (activeTab === 'completed') {
        return fixture.status === 'FINISHED';
      } else if (activeTab === 'today') {
        return fixture.status !== 'FINISHED' && matchesDayFilter(fixture.kickoffTime, 'today');
      }
      return fixture.status !== 'FINISHED';
    });
  }, [fixtures, selectedBbLeague, searchQuery, activeTab, isBasketball]);

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
            placeholder={isBasketball ? 'Search NBA, NCAAB or EuroLeague...' : 'Search club or league...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 min-h-[44px] bg-[var(--surface)] border border-[var(--line)] pl-10 pr-3.5 rounded-[12px] text-[13px] text-[var(--text)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
          />
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
                <span>Disciplinary bookings</span>
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

        {isBasketball ? (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {(
              [
                { id: 'ALL', label: 'All' },
                { id: 'NBA', label: 'NBA' },
                { id: 'NCAAB', label: 'NCAAB' },
                { id: 'EUROLEAGUE', label: 'EuroLeague' },
              ] as const
            ).map((chip) => {
              const active = selectedBbLeague === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setSelectedBbLeague(chip.id)}
                  className={`min-h-[44px] px-4 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                    active
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                      : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="w-full sm:w-72">
            <CompetitionFilter
              selectedCompetitionId={selectedCompId}
              onSelectCompetitionId={setSelectedCompId}
              groups={compGroups}
              totalFixturesCount={totalCompFixtures || fixtures.length}
            />
          </div>
        )}
      </div>

      {/* Matchup Grid */}
      {isBasketball ? (
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
          {filteredList.map(({ fixture, topPick, noRecommendationReason }) => (
            <FixtureCard
              key={fixture.id}
              fixture={fixture}
              topPrediction={topPick}
              noRecommendationReason={noRecommendationReason}
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
