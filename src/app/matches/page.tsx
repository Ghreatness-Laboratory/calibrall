'use client';

import React, { useState, useMemo } from 'react';
import { getFixtureStatistics } from '@/lib/data/seedData';
import { useSport } from '@/lib/context/SportContext';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import { Sport } from '@/types';
import { MarketPrediction } from '@/types';

type FootballMarketGroup = 'ALL' | 'results' | 'goals' | 'corners' | 'cards';

export default function MatchesPage() {
  const { sport, setSport, isSwitching } = useSport();
  const isBasketball = sport === 'basketball';

  const [selectedFootballGroup, setSelectedFootballGroup] = useState<FootballMarketGroup>('ALL');

  const { fixtures, isLoading } = useLiveFixtures(
    isBasketball ? 'NBA' : 'ALL', 
    'ALL', 
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
    if (group === 'results') {
      return p.optionType === 'win' || p.optionType === 'draw' || p.optionType === 'double_chance' || p.optionType === 'draw_no_bet' || p.optionType === 'win_draw_combo' || p.marketCategory === 'match_result' || p.marketCategory === 'double_chance' || p.marketCategory === 'draw_no_bet' || p.marketCategory === 'combos';
    }
    return true;
  };

  // Filtered fixtures
  const filteredFootball = useMemo(() => {
    if (isBasketball) return [];
    return evaluatedFootballFixtures.filter(({ predictions }) => {
      if (selectedFootballGroup !== 'ALL') {
        const hasMatchingMarket = predictions.some(p => matchesFootballMarketGroup(p, selectedFootballGroup));
        if (!hasMatchingMarket) return false;
      }
      return true;
    });
  }, [evaluatedFootballFixtures, selectedFootballGroup, isBasketball]);

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
        <div className="h-7 w-32 bg-[#141A23] rounded-[10px]" />
        <div className="h-4 w-44 bg-[#141A23] rounded-[8px]" />
        <div className="h-[40px] bg-[#141A23] rounded-[14px]" />
        <div className="h-44 bg-[#141A23] rounded-[18px]" />
      </div>
    );
  }

  const scheduledCount = isBasketball ? '12 matchups' : '104 scheduled';

  return (
    <div className="space-y-3 py-1">
      {/* Title 24/30 semibold with muted subtitle ("104 scheduled · Today") */}
      <div className="space-y-0.5">
        <h1 className="text-[24px] font-semibold leading-[30px] text-[#EDF1F6] tracking-[-0.015em]">
          Fixtures
        </h1>
        <p className="text-[13px] text-[#8A95A5] leading-normal">
          {scheduledCount} · Today
        </p>
      </div>

      {/* Segmented Football/Basketball control: 40px high, selected = accent fill, 13.5px semibold */}
      <div className="h-[40px] bg-[#141A23] border border-[#232C3A] p-1 rounded-[14px] flex items-center gap-1 w-full">
        <button
          onClick={() => setSport('football')}
          type="button"
          className={`flex-1 h-full rounded-[10px] flex items-center justify-center text-[13.5px] transition-all touch-press ${
            !isBasketball
              ? 'bg-[#A8E05F] text-[#0D1117] font-semibold'
              : 'text-[#8A95A5] font-medium hover:text-[#EDF1F6]'
          }`}
        >
          Football
        </button>
        <button
          onClick={() => setSport('basketball')}
          type="button"
          className={`flex-1 h-full rounded-[10px] flex items-center justify-center text-[13.5px] transition-all touch-press ${
            isBasketball
              ? 'bg-[#A8E05F] text-[#0D1117] font-semibold'
              : 'text-[#8A95A5] font-medium hover:text-[#EDF1F6]'
          }`}
        >
          Basketball
        </button>
      </div>

      {/* Filter chips (football): 30px high, outlined, horizontally scrollable, active = accent tint + accent border */}
      {!isBasketball ? (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
          {footballMarketFilters.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedFootballGroup(tab.id)}
              type="button"
              className={`h-[30px] px-3.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 border ${
                selectedFootballGroup === tab.id
                  ? 'bg-[#A8E05F]/[0.12] border-[#A8E05F] text-[#A8E05F]'
                  : 'bg-transparent border-[#232C3A] text-[#8A95A5] hover:text-[#EDF1F6]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="pt-0.5">
          <h2 className="text-[15px] font-semibold text-[#EDF1F6]">
            Results
          </h2>
        </div>
      )}

      {/* Fixtures list with 12px gaps */}
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-44 bg-[#141A23] rounded-[18px] border border-[#232C3A]" />
          ))}
        </div>
      ) : isBasketball ? (
        <div className="space-y-3">
          {fixtures.map(f => (
            <NBAGameCard key={f.id} fixture={f} />
          ))}
        </div>
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
        <div className="p-8 rounded-[18px] bg-[#141A23] border border-[#232C3A] text-center space-y-2">
          <div className="text-[14px] font-semibold text-[#EDF1F6]">
            No fixtures match this filter
          </div>
          <p className="text-[12px] text-[#8A95A5]">
            Select &quot;All markets&quot; to see available fixtures.
          </p>
        </div>
      )}
    </div>
  );
}
