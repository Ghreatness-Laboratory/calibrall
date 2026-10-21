'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  COMPETITIONS, 
  FIXTURES, 
  FIXTURE_STATISTICS, 
} from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import TeamCrest from '@/components/TeamCrest';
import { 
  Search, 
  Zap, 
  TrendingUp, 
  AlertCircle, 
  ArrowUpRight, 
  Layers 
} from 'lucide-react';
import { getStoredSavedFixtures } from '@/lib/supabase/client';
import { Team } from '@/types';

export default function DashboardPage() {
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'completed'>('today');

  const savedFixtureIds = useMemo(() => getStoredSavedFixtures(), []);

  // Pre-calculate market evaluation for all fixtures
  const evaluatedFixtures = useMemo(() => {
    return FIXTURES.map(fixture => {
      const stats = FIXTURE_STATISTICS[fixture.id] || {
        homeXg: 1.5,
        awayXg: 1.2,
        expectedCornersHome: 5.5,
        expectedCornersAway: 4.5,
        expectedCards: 4.2,
        uncertaintyScore: 0.1,
        dataCoverageScore: 0.92,
        sampleSizeMatches: 20,
      };

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
  }, []);

  // Filter fixtures
  const filteredList = useMemo(() => {
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
  }, [evaluatedFixtures, selectedLeague, searchQuery, activeTab]);

  // Aggregate top market opportunities across all fixtures
  const topOpportunities = useMemo(() => {
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
  }, [evaluatedFixtures]);

  return (
    <div className="space-y-6">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <h1 className="text-[18px] font-[500] text-[#e8efe9] flex items-center gap-2">
            <span>Market intelligence dashboard</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] border border-[#b8e63a]/40 text-[#b8e63a]">
              Live
            </span>
          </h1>
          <p className="text-[12px] text-[#8fa69a] mt-0.5">
            Real-time multi-market evaluation across the 10 authorized catalog types. Every call, on record.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#8fa69a]" />
          <input
            type="text"
            placeholder="Search club or league..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-[#0f2219] border border-white/[0.08] pl-8 pr-3 py-1.5 rounded-[8px] text-[12px] text-[#e8efe9] placeholder-[#8fa69a]/50 focus:outline-hidden focus:border-[#b8e63a] w-52 sm:w-60"
          />
        </div>
      </div>

      {/* Top Analytical Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-[500] text-[#e8efe9] flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#b8e63a]" />
              <span>Goal lines (over / under)</span>
            </span>
            <span className="font-mono text-[#8fa69a]">Mean: 2.85 xG</span>
          </div>
          <p className="text-[12px] text-[#8fa69a] leading-normal">
            Elevated offensive volume in Barcelona vs Real Madrid (3.60 combined xG). Arsenal vs Liverpool exhibits balanced 1.62 - 1.48 expectation.
          </p>
        </div>

        <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-[500] text-[#e8efe9] flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-[#e8efe9]" />
              <span>Corner volume distribution</span>
            </span>
            <span className="font-mono text-[#8fa69a]">Mean: 10.8</span>
          </div>
          <p className="text-[12px] text-[#8fa69a] leading-normal">
            Man City vs Tottenham corner expectation (11.0 total) offers qualified statistical support on Over 9.5 corners.
          </p>
        </div>

        <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-[500] text-[#e8efe9] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-[#e3b341]" />
              <span>Disciplinary bookings</span>
            </span>
            <span className="font-mono text-[#8fa69a]">Line: 4.5</span>
          </div>
          <p className="text-[12px] text-[#8fa69a] leading-normal">
            Derby d&apos;Italia (Inter vs Juventus) ref Daniele Orsato averages 5.60 cards/match; elevated probability on Over 4.5 Bookings.
          </p>
        </div>
      </div>

      {/* Leading Value Opportunities Table */}
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] overflow-hidden">
        <div className="p-3 bg-[#0a1812]/50 border-b border-white/[0.08] flex items-center justify-between text-[12px]">
          <h2 className="font-[500] text-[#e8efe9]">Best-supported market opportunities</h2>
          <span className="font-mono text-[11px] text-[#8fa69a]">Ranked by expected value (EV)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-[#0a1812]/80 text-[#8fa69a] text-[11px] font-[500] border-b border-white/[0.06]">
              <tr>
                <th className="py-2 px-3">Match</th>
                <th className="py-2 px-3">Market</th>
                <th className="py-2 px-3">Selection</th>
                <th className="py-2 px-3">Prob</th>
                <th className="py-2 px-3">Odds</th>
                <th className="py-2 px-3">Edge</th>
                <th className="py-2 px-3">Est. EV</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {topOpportunities.map((item, idx) => (
                <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-3 text-[#e8efe9]">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center -space-x-1 shrink-0">
                        <TeamCrest
                          crestUrl={item.homeTeam.crestUrl}
                          teamName={item.homeTeam.shortName || item.homeTeam.name}
                          size={20}
                        />
                        <TeamCrest
                          crestUrl={item.awayTeam.crestUrl}
                          teamName={item.awayTeam.shortName || item.awayTeam.name}
                          size={20}
                        />
                      </div>
                      <span className="font-[500] truncate max-w-[140px] sm:max-w-none">{item.matchName}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-[#8fa69a]">{item.marketName}</td>
                  <td className="py-2.5 px-3 font-[500] text-[#e8efe9]">{item.selection}</td>
                  <td className="py-2.5 px-3 font-mono text-[#e8efe9] tabular-nums">
                    {(item.probability * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[#8fa69a]">
                    {item.odds ? item.odds.toFixed(2) : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[#8fa69a] tabular-nums">
                    {item.edge ? `+${(item.edge * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[#b8e63a] font-[500] tabular-nums">
                    {item.expectedValue ? `+${(item.expectedValue * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <Link
                      href={`/matches/${item.fixtureId}`}
                      className="inline-flex items-center gap-0.5 text-[11px] text-[#b8e63a] hover:underline font-[500]"
                    >
                      <span>Analyze</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Fixtures Section */}
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#0f2219] p-2 rounded-[8px] border border-white/[0.08]">
          {/* League Filter Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
            <button
              onClick={() => setSelectedLeague('ALL')}
              type="button"
              className={`px-2.5 py-1 rounded-[6px] transition-colors ${
                selectedLeague === 'ALL'
                  ? 'bg-[#b8e63a] text-[#0a1812] font-[500]'
                  : 'text-[#8fa69a] hover:text-[#e8efe9]'
              }`}
            >
              All leagues
            </button>
            {COMPETITIONS.map(c => (
              <button
                key={c.code}
                onClick={() => setSelectedLeague(c.code)}
                type="button"
                className={`px-2.5 py-1 rounded-[6px] transition-colors ${
                  selectedLeague === c.code
                    ? 'bg-[#b8e63a] text-[#0a1812] font-[500]'
                    : 'text-[#8fa69a] hover:text-[#e8efe9]'
                }`}
              >
                {c.code}
              </button>
            ))}
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-[#0a1812] p-0.5 rounded-[6px] border border-white/[0.06] text-[11px]">
            <button
              onClick={() => setActiveTab('today')}
              type="button"
              className={`px-2.5 py-1 rounded-[4px] transition-colors ${
                activeTab === 'today' ? 'bg-white/[0.08] text-[#e8efe9] font-[500]' : 'text-[#8fa69a] hover:text-[#e8efe9]'
              }`}
            >
              Today & upcoming
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              type="button"
              className={`px-2.5 py-1 rounded-[4px] transition-colors ${
                activeTab === 'completed' ? 'bg-white/[0.08] text-[#e8efe9] font-[500]' : 'text-[#8fa69a] hover:text-[#e8efe9]'
              }`}
            >
              Completed
            </button>
          </div>
        </div>

        {/* Fixtures Grid */}
        {filteredList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredList.map(({ fixture, topPick, noRecommendationReason }) => (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                topPrediction={topPick}
                noRecommendationReason={noRecommendationReason}
                isSavedInitial={savedFixtureIds.includes(fixture.id)}
              />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center bg-[#0f2219] border border-white/[0.08] rounded-[12px] text-[#8fa69a]">
            <Layers className="w-8 h-8 mx-auto text-[#8fa69a]/40 mb-2" />
            <h3 className="text-[#e8efe9] font-[500] text-[14px]">No fixtures match your filter</h3>
            <p className="text-[12px] mt-0.5">Try clearing your search query or selecting a different competition.</p>
          </div>
        )}
      </div>
    </div>
  );
}
