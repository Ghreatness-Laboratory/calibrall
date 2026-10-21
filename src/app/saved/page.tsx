'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { FIXTURES, FIXTURE_STATISTICS } from '@/lib/data/seedData';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import { getStoredSavedFixtures, toggleStoredSavedFixture } from '@/lib/supabase/client';
import { Bookmark, ArrowRight, Bell, Trash2, Layers } from 'lucide-react';

export default function SavedMatchesPage() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setSavedIds(getStoredSavedFixtures());
    setIsLoaded(true);
  }, []);

  const savedFixtures = useMemo(() => {
    return FIXTURES.filter(f => savedIds.includes(f.id)).map(fixture => {
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
        topPick: evalResult.topPick,
        noRecommendationReason: evalResult.noRecommendationReason,
      };
    });
  }, [savedIds]);

  const handleClearAll = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('matchmind_demo_saved_fixtures', JSON.stringify([]));
      setSavedIds([]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-2">
            <Bookmark className="w-6 h-6 text-brand-amber fill-brand-amber" />
            <span>Saved Fixtures Watchlist</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Track prioritized matches, monitor pre-match market movements, and receive line edge notifications.
          </p>
        </div>

        {savedIds.length > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-surface-200 hover:bg-surface-100 border border-border text-xs text-rose-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Watchlist</span>
          </button>
        )}
      </div>

      {/* Content */}
      {isLoaded && savedFixtures.length > 0 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedFixtures.map(({ fixture, topPick, noRecommendationReason }) => (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                topPrediction={topPick}
                noRecommendationReason={noRecommendationReason}
                isSavedInitial={true}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="p-16 text-center bg-surface-200 border border-border rounded-lg space-y-3">
          <Bookmark className="w-10 h-10 mx-auto text-gray-600" />
          <h3 className="text-white font-bold text-base">Your Watchlist is Empty</h3>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            You haven&apos;t bookmarked any fixtures yet. Click the bookmark icon on any fixture card or analysis page to monitor line updates.
          </p>
          <div className="pt-2">
            <Link
              href="/matches"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded bg-brand-emerald text-navy-950 font-bold text-xs"
            >
              <span>Explore European Fixtures</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
