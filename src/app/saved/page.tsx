'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getFixtureStatistics } from '@/lib/data/seedData';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import { useSport } from '@/lib/context/SportContext';
import { getStoredSavedFixtures } from '@/lib/supabase/client';
import { Bookmark, ArrowRight, Trash2 } from 'lucide-react';

export default function SavedMatchesPage() {
  const { sport } = useSport();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { fixtures, liveDataAvailable, lastUpdated } = useLiveFixtures(undefined, undefined, sport);

  useEffect(() => {
    setSavedIds(getStoredSavedFixtures());
    setIsLoaded(true);
  }, []);

  const savedFixtures = useMemo(() => {
    return fixtures.filter(f => savedIds.includes(f.id)).map(fixture => {
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
        noRecommendationReason: evalResult.noRecommendationReason,
      };
    });
  }, [fixtures, savedIds]);

  const handleClearAll = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('matchmind_demo_saved_fixtures', JSON.stringify([]));
      setSavedIds([]);
    }
  };

  return (
    <div className="space-y-3.5 py-1">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-1 border-b border-[#232C3A]">
        <div className="space-y-0.5">
          <h1 className="text-[24px] font-semibold leading-[30px] text-[#EDF1F6] tracking-[-0.015em] flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-[#E8B64A] fill-[#E8B64A]" />
            <span>Saved watchlist</span>
          </h1>
          <p className="text-[13px] text-[#8A95A5]">
            Track prioritized matches and monitor pre match model calculations.
          </p>
        </div>

        {savedIds.length > 0 && (
          <button
            onClick={handleClearAll}
            type="button"
            className="flex items-center gap-1.5 px-3 h-[36px] rounded-[10px] bg-[#141A23] hover:bg-[#1A222E] border border-[#232C3A] text-[12px] font-medium text-[#8A95A5] hover:text-[#EDF1F6] transition-transform active:scale-[0.98] touch-press shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span>Clear all</span>
          </button>
        )}
      </div>

      {/* Content */}
      {isLoaded && savedFixtures.length > 0 ? (
        <div className="space-y-3">
          {savedFixtures.map(({ fixture, topPick, noRecommendationReason }) => (
            fixture.sport === 'basketball' ? (
              <NBAGameCard key={fixture.id} fixture={fixture} />
            ) : (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                topPrediction={topPick}
                noRecommendationReason={noRecommendationReason}
                isSavedInitial={true}
              />
            )
          ))}
        </div>
      ) : isLoaded && savedIds.length > 0 && !liveDataAvailable ? (
        <div className="p-8 text-center bg-[#141A23] border border-[#232C3A] rounded-[18px] space-y-2.5">
          <Bookmark className="w-8 h-8 mx-auto text-[#5F6B7C]" />
          <h3 suppressHydrationWarning className="text-[#EDF1F6] font-semibold text-[14px]">
            Live data unavailable.{lastUpdated ? ` Last updated ${lastUpdated}` : ''}
          </h3>
          <p className="text-[12px] text-[#8A95A5] max-w-sm mx-auto">
            You have {savedIds.length} bookmarked fixture{savedIds.length > 1 ? 's' : ''}. Live fixture data will display once live pipelines synchronize.
          </p>
        </div>
      ) : (
        <div className="border border-dashed border-[#232C3A] rounded-[18px] bg-[#141A23] p-8 text-center flex flex-col items-center justify-center space-y-2.5">
          <div className="w-[44px] h-[44px] rounded-[12px] bg-[#1A222E] border border-[#232C3A] flex items-center justify-center text-[#8A95A5]">
            <Bookmark className="w-5 h-5 text-[#E8B64A]" strokeWidth={1.8} />
          </div>
          <h3 className="text-[15px] font-semibold text-[#EDF1F6]">Your watchlist is empty</h3>
          <p className="text-[12.5px] leading-relaxed text-[#8A95A5] max-w-xs mx-auto">
            Tap the bookmark icon on any fixture card or analysis page to monitor lines.
          </p>
          <div className="pt-1">
            <Link
              href="/matches"
              className="inline-flex items-center gap-1.5 h-[40px] px-4 rounded-[12px] bg-[#A8E05F] hover:bg-[#b5e870] text-[#0D1117] font-semibold text-[13px] transition-transform active:scale-[0.98] touch-press"
            >
              <span>Explore fixtures</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
