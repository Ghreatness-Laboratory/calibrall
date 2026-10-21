'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  COMPETITIONS, 
  getFixtureStatistics, 
} from '@/lib/data/seedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import NBAScoreProjectionTool from '@/components/nba/NBAScoreProjectionTool';
import TeamCrest from '@/components/TeamCrest';
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

export default function DashboardPage() {
  const { sport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'completed'>('today');

  const { fixtures, isLoading, liveDataAvailable, lastUpdated } = useLiveFixtures(
    isBasketball ? 'NBA' : selectedLeague,
    'ALL',
    sport
  );

  const savedFixtureIds = useMemo(() => getStoredSavedFixtures(), []);

  // Pre-calculate market evaluation for all live football fixtures
  const evaluatedFixtures = useMemo(() => {
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
        predictions: evalResult.predictions,
        topPick: evalResult.topPick,
        noRecommendationReason: evalResult.noRecommendationReason,
      };
    });
  }, [fixtures, isBasketball]);

  // Filter football fixtures
  const filteredList = useMemo(() => {
    if (isBasketball) return [];
    return evaluatedFixtures.filter(({ fixture }) => {
      if (selectedLeague !== 'ALL' && fixture.competition.code !== selectedLeague) {
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
        return fixture.status !== 'FINISHED';
      }
      return true;
    });
  }, [evaluatedFixtures, selectedLeague, searchQuery, activeTab, isBasketball]);

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

  // Aggregate top market opportunities across football fixtures
  const topOpportunities = useMemo(() => {
    if (isBasketball) return [];
    const qualified: {
      fixtureId: string;
      homeTeam: Team;
      awayTeam: Team;
      matchName: string;
      compCode: string;
      marketName: string;
      selection: string;
      probability: number;
      odds?: number;
      expectedValue?: number;
      edge?: number;
    }[] = [];

    evaluatedFixtures.forEach(({ fixture, predictions }) => {
      predictions.forEach(p => {
        if (p.qualificationStatus === 'QUALIFIED_VALUE' || p.qualificationStatus === 'QUALIFIED_PROBABILITY') {
          qualified.push({
            fixtureId: fixture.id,
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
            matchName: `${fixture.homeTeam.shortName || fixture.homeTeam.name} vs ${fixture.awayTeam.shortName || fixture.awayTeam.name}`,
            compCode: fixture.competition.code,
            marketName: p.marketName,
            selection: p.selection,
            probability: p.modelProbability,
            odds: p.marketOdds,
            expectedValue: p.expectedValue,
            edge: p.edge,
          });
        }
      });
    });

    return qualified.sort((a, b) => (b.expectedValue ?? 0) - (a.expectedValue ?? 0)).slice(0, 5);
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
    <div className="space-y-6">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
        <div>
          <h1 className="text-[18px] font-[620] text-[var(--text)] flex items-center gap-2">
            <span>{isBasketball ? 'NBA Analytics & Market Terminal' : 'Market Intelligence Dashboard'}</span>
            <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-[5px] border border-[var(--accent)]/40 text-[var(--accent)] font-semibold">
              LIVE
            </span>
          </h1>
          <p className="text-[12.5px] text-[var(--text-2)] mt-0.5">
            {isBasketball 
              ? 'Multi-team efficiency modeling, projected totals, spreads, and pace analysis for all 30 NBA franchises.'
              : 'Real-time multi-market evaluation across the 10 authorized catalog types. Every call, on record.'}
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-3)]" strokeWidth={1.75} />
          <input
            type="text"
            placeholder={isBasketball ? "Search NBA franchise..." : "Search club or league..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-[var(--surface)] border border-[var(--border)] pl-8 pr-3 py-1.5 rounded-[10px] text-[12px] text-[var(--text)] placeholder-[var(--text-3)] focus:outline-hidden focus:border-[var(--accent)] w-52 sm:w-60"
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
              Elevated offensive volume in Barcelona vs Real Madrid (3.60 combined xG). Arsenal vs Liverpool exhibits balanced 1.62 - 1.48 expectation.
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
              Man City vs Tottenham corner expectation (11.0 total) offers qualified statistical support on Over 9.5 corners.
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

        {/* League selector for Football only */}
        {!isBasketball && (
          <div className="flex items-center gap-1 overflow-x-auto text-[11px] pb-1 [scrollbar-width:none]">
            <button
              onClick={() => setSelectedLeague('ALL')}
              type="button"
              className={`px-2 py-0.5 rounded-[5px] whitespace-nowrap transition-colors ${
                selectedLeague === 'ALL'
                  ? 'bg-[var(--surface-2)] text-[var(--text)] font-semibold border border-[var(--border-strong)]'
                  : 'text-[var(--text-3)] hover:text-[var(--text)]'
              }`}
            >
              All leagues
            </button>
            {COMPETITIONS.map(c => (
              <button
                key={c.code}
                onClick={() => setSelectedLeague(c.code)}
                type="button"
                className={`px-2 py-0.5 rounded-[5px] whitespace-nowrap transition-colors ${
                  selectedLeague === c.code
                    ? 'bg-[var(--surface-2)] text-[var(--text)] font-semibold border border-[var(--border-strong)]'
                    : 'text-[var(--text-3)] hover:text-[var(--text)]'
                }`}
              >
                {c.code}
              </button>
            ))}
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
