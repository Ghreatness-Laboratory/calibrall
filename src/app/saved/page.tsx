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
      <div className="flex items-center justify-between gap-3 pb-1 border-b border-white/[0.07]">
        <div className="space-y-0.5">
          <h1 className="text-[23px] font-[700] leading-[1.2] text-[#ECF1EE] tracking-[-0.025em] flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-[#E2AE45] fill-[#E2AE45]" />
            <span>Saved watchlist</span>
          </h1>
          <p className="text-[12px] text-[#8B9890]">
            Track prioritized matches and monitor pre match model calculations.
          </p>
        </div>

        {savedIds.length > 0 && (
          <button
            onClick={handleClearAll}
            type="button"
            className="flex items-center gap-1.5 px-3 h-[36px] rounded-[11px] bg-[#151E19] hover:bg-white/[0.05] border border-white/[0.07] text-[12px] font-medium text-[#8B9890] hover:text-[#ECF1EE] transition-transform active:scale-[0.98] touch-press shrink-0"
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
        <div className="p-8 text-center bg-[#101713] border border-white/[0.07] rounded-[14px] space-y-2.5">
          <Bookmark className="w-8 h-8 mx-auto text-[#5E6A63]" />
          <h3 suppressHydrationWarning className="text-[#ECF1EE] font-semibold text-[14px]">
            Live data unavailable.{lastUpdated ? ` Last updated ${lastUpdated}` : ''}
          </h3>
          <p className="text-[12px] text-[#8B9890] max-w-sm mx-auto">
            You have {savedIds.length} bookmarked fixture{savedIds.length > 1 ? 's' : ''}. Live fixture data will display once live pipelines synchronize.
          </p>
        </div>
      ) : (
        <div className="border border-dashed border-white/[0.12] rounded-[14px] bg-[#101713] p-8 text-center flex flex-col items-center justify-center space-y-2.5">
          <div className="w-[46px] h-[46px] rounded-[12px] bg-[#151E19] border border-white/[0.07] flex items-center justify-center text-[#8B9890]">
            <Bookmark className="w-5 h-5 text-[#E2AE45]" strokeWidth={1.8} />
          </div>
          <h3 className="text-[15px] font-semibold text-[#ECF1EE]">Your watchlist is empty</h3>
          <p className="text-[12.5px] leading-relaxed text-[#8B9890] max-w-xs mx-auto">
            Tap the bookmark icon on any fixture card or analysis page to monitor lines.
          </p>
          <div className="pt-1">
            <Link
              href="/matches"
              className="inline-flex items-center gap-1.5 h-[44px] px-4 rounded-[11px] bg-[#B6E63B] hover:bg-[#c3ed4e] text-[#0A0F0D] font-semibold text-[13px] transition-transform active:scale-[0.98] touch-press"
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
