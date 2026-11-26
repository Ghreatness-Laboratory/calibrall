'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '@/lib/prediction/marketSelection';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import { useSport } from '@/lib/context/SportContext';
import { getStoredSavedFixtures } from '@/lib/supabase/client';
import { Bookmark, ArrowRight, Trash2 } from 'lucide-react';

export default function SavedMatchesPage() {
  const { sport } = useSport();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { fixtures, evaluations, liveDataAvailable, lastUpdated, error, isOffline, isSavedCopy } =
    useLiveFixtures(undefined, undefined, sport);

  useEffect(() => {
    setSavedIds(getStoredSavedFixtures());
    setIsLoaded(true);
  }, []);

  const savedBasketballFixtures = useMemo(() => {
    if (sport !== 'basketball') return [];
    return fixtures.filter((f) => savedIds.includes(f.id));
  }, [fixtures, savedIds, sport]);

  const savedFixtures = useMemo(() => {
    if (sport === 'basketball') return [];
    const raw = fixtures
      .filter((f) => savedIds.includes(f.id))
      .map((fixture) => {
        const stats = getFixtureStatistics(fixture);
        const evalResult = evaluateFixtureMarkets(buildFixtureContextFromStats(fixture, stats));

        return {
          fixtureId: fixture.id,
          fixture,
          topPick: evalResult.topPick,
          predictions: evalResult.predictions,
          noRecommendationReason: evalResult.noRecommendationReason || stats.noRecommendationReason,
        };
      });
    return selectDiversifiedSlatePicks(raw, 0.4);
  }, [fixtures, savedIds, sport]);

  const handleClearAll = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('matchmind_demo_saved_fixtures', JSON.stringify([]));
      setSavedIds([]);
    }
  };

  return (
    <div className="space-y-4 py-1">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-[var(--line)]">
        <div className="space-y-1">
          <h1 className="font-display text-[26px] font-bold leading-[1.15] text-[var(--text)] tracking-[-0.02em] flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-[var(--medium)] fill-[var(--medium)]" />
            <span>Saved watchlist</span>
          </h1>
          <p className="text-[12.5px] text-[var(--text-2)]">
            Track prioritized matches and monitor pre-match model calculations.
          </p>
        </div>

        {savedIds.length > 0 && (
          <button
            onClick={handleClearAll}
            type="button"
            className="min-h-[44px] flex items-center gap-1.5 px-3.5 rounded-[12px] bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--line)] text-[12px] font-medium text-[var(--text-2)] hover:text-[var(--text)] touch-press shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span>Clear all</span>
          </button>
        )}
      </div>

      {(isSavedCopy || error) && (
        <div className="p-3 rounded-[12px] bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[12px]">
          {isSavedCopy
            ? `Showing saved copy${lastUpdated ? ` from ${lastUpdated}` : ''}${error ? ` (${error})` : ''}.`
            : isOffline
            ? 'You appear to be offline and no saved copy is available.'
            : error || 'Unable to load fixtures.'}
        </div>
      )}

      {isLoaded &&
      (sport === 'basketball' ? savedBasketballFixtures.length > 0 : savedFixtures.length > 0) ? (
        <div className="space-y-3">
          {sport === 'basketball'
            ? savedBasketballFixtures.map((fixture) => (
                <NBAGameCard
                  key={fixture.id}
                  fixture={fixture}
                  evaluation={evaluations?.[fixture.id]}
                  isSavedInitial={true}
                />
              ))
            : savedFixtures.map(({ fixture, topPick, noRecommendationReason }) => (
                <FixtureCard
                  key={fixture.id}
                  fixture={fixture}
                  topPrediction={topPick}
                  noRecommendationReason={noRecommendationReason}
                  isSavedInitial={true}
                />
              ))}
        </div>
      ) : isLoaded && savedIds.length > 0 && !liveDataAvailable ? (
        <div className="p-8 text-center bg-[var(--surface)] border border-[var(--line)] rounded-[18px] space-y-2.5">
          <Bookmark className="w-8 h-8 mx-auto text-[var(--text-3)]" />
          <h3 suppressHydrationWarning className="font-display text-[var(--text)] font-semibold text-[14px]">
            {isOffline
              ? 'You appear to be offline.'
              : error
              ? error
              : 'Live data unavailable.'}
            {lastUpdated ? ` Last updated ${lastUpdated}` : ''}
          </h3>
          <p className="text-[12.5px] text-[var(--text-2)] max-w-sm mx-auto">
            You have {savedIds.length} bookmarked fixture{savedIds.length > 1 ? 's' : ''}. Live fixture data will display once pipelines synchronize.
          </p>
        </div>
      ) : (
        <div className="border border-dashed border-[var(--border-strong)] rounded-[18px] bg-[var(--surface)] p-8 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[var(--medium)]">
            <Bookmark className="w-5 h-5" strokeWidth={1.8} />
          </div>
          <h3 className="font-display text-[16px] font-semibold text-[var(--text)]">
            Your watchlist is empty
          </h3>
          <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)] max-w-xs mx-auto">
            Tap the bookmark icon on any fixture card or analysis page to monitor lines.
          </p>
          <div className="pt-1">
            <Link
              href="/matches"
              className="inline-flex items-center gap-1.5 min-h-[44px] px-5 rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] font-bold text-[13px] touch-press"
            >
              <span>Explore fixtures</span>
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
