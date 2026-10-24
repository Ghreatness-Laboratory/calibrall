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
  const { fixtures, isLoading, liveDataAvailable, lastUpdated } = useLiveFixtures(undefined, undefined, sport);

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <h1 className="text-[18px] font-[500] text-[#e8efe9] flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-[#e3b341] fill-[#e3b341]" />
            <span>Saved fixtures watchlist</span>
          </h1>
          <p className="text-[12px] text-[#8fa69a] mt-0.5">
            Track prioritized matches, monitor pre-match market movements, and receive line updates.
          </p>
        </div>

        {savedIds.length > 0 && (
          <button
            onClick={handleClearAll}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[#0f2219] hover:bg-white/[0.04] border border-white/[0.08] text-[12px] font-[500] text-[#8fa69a] hover:text-[#e8efe9] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear watchlist</span>
          </button>
        )}
      </div>

      {/* Content */}
      {isLoaded && savedFixtures.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
        <div className="p-12 text-center bg-[#0f2219] border border-white/[0.08] rounded-[12px] space-y-3">
          <Bookmark className="w-8 h-8 mx-auto text-[#8fa69a]/40" />
          <h3 suppressHydrationWarning className="text-[#e8efe9] font-[500] text-[15px]">
            Live data unavailable.{lastUpdated ? ` Last updated ${lastUpdated}` : ''}
          </h3>
          <p className="text-[12px] text-[#8fa69a] max-w-sm mx-auto">
            You have {savedIds.length} bookmarked fixture{savedIds.length > 1 ? 's' : ''}. Live fixture data will display once live API synchronization completes.
          </p>
        </div>
      ) : (
        <div className="p-12 text-center bg-[#0f2219] border border-white/[0.08] rounded-[12px] space-y-3">
          <Bookmark className="w-8 h-8 mx-auto text-[#8fa69a]/40" />
          <h3 className="text-[#e8efe9] font-[500] text-[15px]">Your watchlist is empty</h3>
          <p className="text-[12px] text-[#8fa69a] max-w-sm mx-auto">
            You haven&apos;t bookmarked any fixtures yet. Click the bookmark icon on any fixture card or analysis page to monitor line updates.
          </p>
          <div className="pt-1">
            <Link
              href="/matches"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-[#b8e63a] hover:bg-[#c8ee47] text-[#0a1812] font-[500] text-[13px] transition-colors"
            >
              <span>Explore fixtures</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
