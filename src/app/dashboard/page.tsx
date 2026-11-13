'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import NBAScoreProjectionTool from '@/components/nba/NBAScoreProjectionTool';
import TeamCrest from '@/components/TeamCrest';
import CompetitionFilter from '@/components/CompetitionFilter';
import { CountryCompetitionGroup } from '@/lib/data/canonicalCompetitions';
import { matchesDayFilter } from '@/lib/utils/dateWindow';
import { 
  Search, 
  Zap, 
  TrendingUp, 
  AlertCircle, 
  ArrowUpRight, 
  Layers,
  Calculator,
  Calendar
} from 'lucide-react';
import { getStoredSavedFixtures } from '@/lib/supabase/client';
import { Team } from '@/types';
import { formatExpectedValue, formatOdds, formatSelectionName } from '@/lib/prediction/marketCatalog';
import { displayName } from '@/lib/utils/formatText';

export default function DashboardPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const [selectedCompId, setSelectedCompId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'completed'>('upcoming');
  const [compGroups, setCompGroups] = useState<CountryCompetitionGroup[]>([]);
  const [totalCompFixtures, setTotalCompFixtures] = useState<number>(0);

  useEffect(() => {
    if (isBasketball) return;
    fetch('/api/v1/competitions?sport=football', { cache: 'no-store' })
      .then(res => res.json())
      .then(json => {
        if (json.groupedByCountry && Array.isArray(json.groupedByCountry)) {
          setCompGroups(json.groupedByCountry);
        }
        if (typeof json.totalFixtures === 'number') {
          setTotalCompFixtures(json.totalFixtures);
        }
      })
      .catch(err => console.error('[DashboardPage] Error fetching active competitions:', err));
  }, [isBasketball]);

  const { fixtures, isLoading, liveDataAvailable, lastUpdated } = useLiveFixtures(
    isBasketball ? 'comp_nba' : selectedCompId,
    'ALL',
    sport,
    !isBasketball && activeTab === 'today' ? 'today' : 'ALL'
  );

  const savedFixtureIds = useMemo(() => getStoredSavedFixtures(), []);

  // Pre-calculate market evaluation for all live football fixtures with 40% diversity cap
  const evaluatedFixtures = useMemo(() => {
    if (isBasketball) return [];
    const raw = fixtures.map(fixture => {
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
    return selectDiversifiedSlatePicks(raw, 0.40);
  }, [fixtures, isBasketball]);

  // Filter football fixtures by competition_id ONLY + tab day/status and preserve diversity cap on visible slate
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
    return selectDiversifiedSlatePicks(subset, 0.40);
  }, [evaluatedFixtures, selectedCompId, searchQuery, activeTab, isBasketball]);

  // Basketball filtered fixtures
  const filteredBasketball = useMemo(() => {
    if (!isBasketball) return [];
    return fixtures.filter(fixture => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesHome = fixture.homeTeam.name.toLowerCase().includes(q);
        const matchesAway = fixture.awayTeam.name.toLowerCase().includes(q);
        if (!matchesHome && !matchesAway) return false;
      }
      if (activeTab === 'completed') {
        return fixture.status === 'FINISHED';
      } else if (activeTab === 'today') {
        return fixture.status !== 'FINISHED';
      }
      return true;
    });
  }, [fixtures, searchQuery, activeTab, isBasketball]);

  // Aggregate top market models across football fixtures
  const topOpportunities = useMemo(() => {
    if (isBasketball) return [];
    const models: {
      fixtureId: string;
      homeTeam: Team;
      awayTeam: Team;
      matchName: string;
      compCode: string;
      marketName: string;
      selection: string;
      probability: number;
      odds?: number;
    }[] = [];

    evaluatedFixtures.forEach(({ fixture, predictions }) => {
      predictions.forEach(p => {
        if (p.qualificationStatus === 'QUALIFIED_VALUE' || p.qualificationStatus === 'QUALIFIED_PROBABILITY') {
          models.push({
            fixtureId: fixture.id,
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            matchName: `${displayName(fixture.homeTeam)} vs ${displayName(fixture.awayTeam)}`,
            compCode: fixture.competition.code,
            marketName: p.marketName,
            selection: p.selection,
            probability: p.modelProbability,
            odds: p.marketOdds,
          });
        }
      });
    });

    return models.sort((a, b) => b.probability - a.probability).slice(0, 5);
  }, [evaluatedFixtures, isBasketball]);

  if (isSwitching) {
    return (
      <div className="space-y-6 py-6 animate-pulse">
        <div className="h-8 w-64 bg-[var(--surface-2)] rounded-[10px]" />
        <div className="h-32 bg-[var(--surface)] rounded-[12px] border border-[var(--border)]" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div className="h-44 bg-[var(--surface)] rounded-[12px] border border-[var(--border)]" />
          <div className="h-44 bg-[var(--surface)] rounded-[12px] border border-[var(--border)]" />
          <div className="h-44 bg-[var(--surface)] rounded-[12px] border border-[var(--border)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/[0.07]">
        <div>
          <h2 className="text-[19px] font-bold leading-[1.25] tracking-[-0.02em] text-[#ECF1EE] flex items-center gap-2">
            <span>{isBasketball ? 'NBA Analytics & Market Terminal' : 'Market Intelligence Dashboard'}</span>
            <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-[5px] border border-[#B6E63B]/40 text-[#B6E63B] font-semibold">
              LIVE
            </span>
          </h2>
          <p className="text-[12px] text-[#8B9890] mt-0.5">
            {isBasketball 
              ? 'Multi team efficiency modeling, projected totals, spreads, and pace analysis for all 30 NBA franchises.'
              : 'Real time multi market evaluation across the authorized catalog types. Every call, on record.'}
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-[#5E6A63]" strokeWidth={2} />
          <input
            type="text"
            placeholder={isBasketball ? "Search NBA franchise..." : "Search club or league..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 h-[40px] bg-[#151E19] border border-white/[0.07] pl-9 pr-3 rounded-[11px] text-[13px] text-[#ECF1EE] placeholder-[#5E6A63] focus:outline-hidden focus:border-[#B6E63B]"
          />
        </div>
      </div>

      {/* When Basketball: Embedded Projection Tool */}
      {isBasketball && (
        <div className="pt-1">
          <NBAScoreProjectionTool />
        </div>
      )}

      {/* When Football: Top Analytical Insights Grid */}
      {!isBasketball && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-[600] text-[var(--text)] flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.75} />
                <span>Goal lines (over / under)</span>
              </span>
              <span className="font-mono text-[var(--text-3)] text-[10.5px]">Mean: 2.85 xG</span>
            </div>
            <p className="text-[12px] text-[var(--text-2)] leading-normal">
              Elevated offensive volume in Barcelona vs Real Madrid (3.60 combined xG). Arsenal vs Liverpool exhibits balanced 1.62 to 1.48 expectation.
            </p>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-[600] text-[var(--text)] flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.75} />
                <span>Corner volume distribution</span>
              </span>
              <span className="font-mono text-[var(--text-3)] text-[10.5px]">Mean: 10.8</span>
            </div>
            <p className="text-[12px] text-[var(--text-2)] leading-normal">
              Man City vs Tottenham corner expectation (11.0 total) offers calibrated model probability on Over 9.5 corners.
            </p>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-[600] text-[var(--text)] flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-[var(--warn)]" strokeWidth={1.75} />
                <span>Disciplinary bookings</span>
              </span>
              <span className="font-mono text-[var(--text-3)] text-[10.5px]">Line: 4.5</span>
            </div>
            <p className="text-[12px] text-[var(--text-2)] leading-normal">
              Derby d&apos;Italia (Inter vs Juventus) ref Daniele Orsato averages 5.60 cards/match; elevated probability on Over 4.5 Bookings.
            </p>
          </div>
        </div>
      )}

      {/* Fixtures Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
        {/* Tabs: Today vs Upcoming vs Completed */}
        <div className="flex items-center gap-1 bg-[var(--surface)] p-1 rounded-[10px] border border-[var(--border)] text-[12px] font-medium self-start">
          <button
            onClick={() => setActiveTab('today')}
            type="button"
            className={`px-3 py-1 rounded-[8px] transition-colors ${
              activeTab === 'today'
                ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-semibold'
                : 'text-[var(--text-2)] hover:text-[var(--text)]'
            }`}
          >
            Today&apos;s games
          </button>
          <button
            onClick={() => setActiveTab('upcoming')}
            type="button"
            className={`px-3 py-1 rounded-[8px] transition-colors ${
              activeTab === 'upcoming'
                ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-semibold'
                : 'text-[var(--text-2)] hover:text-[var(--text)]'
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            type="button"
            className={`px-3 py-1 rounded-[8px] transition-colors ${
              activeTab === 'completed'
                ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-semibold'
                : 'text-[var(--text-2)] hover:text-[var(--text)]'
            }`}
          >
            Completed
          </button>
        </div>

        {/* Database-driven competition selector for Football only */}
        {!isBasketball && (
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filteredBasketball.map(f => (
              <NBAGameCard key={f.id} fixture={f} />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-[var(--surface)] border border-dashed border-[var(--border-strong)] rounded-[12px] space-y-2.5">
            <div className="w-[34px] h-[34px] rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center mx-auto text-[var(--text-3)]">
              <Calendar className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <h3 className="text-[var(--text)] font-[600] text-[12.5px]">No games scheduled</h3>
            <p className="text-[11.5px] text-[var(--text-3)] max-w-sm mx-auto">
              No NBA matchups matching your current filter. Scheduled games will appear on matchday.
            </p>
          </div>
        )
      ) : (
        filteredList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
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
          <div className="p-8 text-center bg-[var(--surface)] border border-dashed border-[var(--border-strong)] rounded-[12px] space-y-2.5">
            <div className="w-[34px] h-[34px] rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center mx-auto text-[var(--text-3)]">
              <Calendar className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <h3 className="text-[var(--text)] font-[600] text-[12.5px]">No games scheduled</h3>
            <p className="text-[11.5px] text-[var(--text-3)] max-w-sm mx-auto">
              No European football fixtures matching your filter. Check upcoming matchdays.
            </p>
          </div>
        )
      )}
    </div>
  );
}
