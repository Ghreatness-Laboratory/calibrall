'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getFixtureStatistics, buildFixtureContextFromStats } from '@/lib/data/seedData';
import { useLiveFixtures } from '@/lib/hooks/useLiveFixtures';
import { evaluateFixtureMarkets, selectDiversifiedSlatePicks } from '@/lib/prediction/marketSelection';
import { syncSlateExplanations } from '@/lib/prediction/explanationGenerator';
import FixtureCard from '@/components/FixtureCard';
import NBAGameCard from '@/components/nba/NBAGameCard';
import { useSport } from '@/lib/context/SportContext';
import {
  getStoredSavedFixtures,
  clearStoredSavedFixtures,
  getStoredSavedSlips,
  removeSavedSlipFromStorage,
  clearStoredSavedSlips,
  StoredSavedSlip,
} from '@/lib/storage/userStorage';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { Bookmark, ArrowRight, Trash2, Layers, Copy, Check } from 'lucide-react';

export default function SavedMatchesPage() {
  const { sport } = useSport();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedSlips, setSavedSlips] = useState<StoredSavedSlip[]>([]);
  const [copiedSlipId, setCopiedSlipId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const { fixtures, evaluations, liveDataAvailable, lastUpdated, error, isOffline, isSavedCopy } =
    useLiveFixtures(undefined, undefined, sport);

  useEffect(() => {
    setSavedIds(getStoredSavedFixtures());
    setSavedSlips(getStoredSavedSlips());
    setIsLoaded(true);
  }, []);

  const savedBasketballFixtures = useMemo(() => {
    if (sport !== 'basketball' && sport !== 'all') return [];
    return fixtures.filter((f) => f.sport === 'basketball' && savedIds.includes(f.id));
  }, [fixtures, savedIds, sport]);

  const savedFixtures = useMemo(() => {
    if (sport === 'basketball') return [];
    const raw = fixtures
      .filter((f) => f.sport !== 'basketball' && savedIds.includes(f.id))
      .map((fixture) => {
        const stats = getFixtureStatistics(fixture);
        const context = buildFixtureContextFromStats(fixture, stats);
        const evalResult = evaluateFixtureMarkets(context);

        return {
          fixtureId: fixture.id,
          fixture,
          context,
          topPick: evalResult.topPick,
          predictions: evalResult.predictions,
          noRecommendationReason: evalResult.noRecommendationReason || stats.noRecommendationReason,
          writtenExplanation: fixture.writtenExplanation,
        };
      });
    return syncSlateExplanations(selectDiversifiedSlatePicks(raw, 0.4));
  }, [fixtures, savedIds, sport]);

  const handleClearAll = () => {
    clearStoredSavedFixtures();
    clearStoredSavedSlips();
    setSavedIds([]);
    setSavedSlips([]);
  };

  const handleCopySlip = async (slip: StoredSavedSlip) => {
    const lines = [
      `Calibrall Saved Slip (${slip.style === 'balanced' ? 'Balanced' : 'Safest'})`,
      `Combined odds: ${slip.combinedOdds.toFixed(2)} | Estimated hit chance: ${slip.estimatedHitChancePct.toFixed(
        1
      )}%`,
      ...slip.legs.map(
        (l, idx) =>
          `${idx + 1}. ${cleanDisplayText(l.matchLabel)} | ${cleanDisplayText(
            l.selection
          )} @ ${l.decimalOdds.toFixed(2)} (${cleanDisplayText(l.bookmakerName)})`
      ),
      cleanDisplayText(slip.honestNotice),
      '18+ · Gamble responsibly',
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedSlipId(slip.slipId);
      setTimeout(() => setCopiedSlipId(null), 1600);
    } catch {
      // ignore
    }
  };

  const handleRemoveSlip = (slipId: string) => {
    setSavedSlips(removeSavedSlipFromStorage(slipId));
  };

  const hasAnySaved = savedIds.length > 0 || savedSlips.length > 0;

  return (
    <div className="space-y-4 py-1">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-[var(--line)]">
        <div className="space-y-1">
          <h1 className="font-display text-[26px] font-bold leading-[1.15] text-[var(--text)] tracking-[-0.02em] flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-[var(--medium)] fill-[var(--medium)]" />
            <span>Saved watchlist</span>
          </h1>
          <p className="text-[12.5px] text-[var(--text-2)]">
            Track prioritized matches, saved slips, and pre match model calculations.
          </p>
        </div>

        {hasAnySaved && (
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

      {isLoaded && savedSlips.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display text-[15px] font-bold text-[var(--text)] flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[var(--accent)]" />
              <span>Saved slips ({savedSlips.length})</span>
            </h2>
            <Link
              href="/slips"
              className="text-[12px] font-semibold text-[var(--accent)] hover:underline"
            >
              Build another
            </Link>
          </div>

          <div className="space-y-2.5">
            {savedSlips.map((slip) => (
              <div
                key={slip.slipId}
                className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2 pb-2 border-b border-[var(--line)]">
                  <div>
                    <div className="text-[13px] font-bold text-[var(--text)]">
                      {slip.legs.length} legs · {slip.style === 'balanced' ? 'Balanced' : 'Safest'}
                    </div>
                    <div className="text-[11.5px] text-[var(--accent)] font-semibold tabular-nums">
                      Estimated hit chance {slip.estimatedHitChancePct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[var(--text-3)] uppercase">Combined odds</div>
                    <div className="font-display text-[19px] font-bold text-[var(--text)] tabular-nums">
                      {slip.combinedOdds.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {slip.legs.map((leg, idx) => (
                    <div
                      key={`${slip.slipId}_leg_${idx}`}
                      className="rounded-[10px] bg-[var(--surface-2)]/70 border border-[var(--line)] px-3 py-2 flex items-center justify-between gap-2 text-[12px]"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--text)] truncate">
                          {cleanDisplayText(leg.matchLabel)}
                        </div>
                        <div className="text-[11px] text-[var(--text-2)] truncate">
                          {cleanDisplayText(leg.selection)} · {cleanDisplayText(leg.bookmakerName)}
                        </div>
                      </div>
                      <span className="font-bold text-[var(--text)] tabular-nums shrink-0">
                        {leg.decimalOdds.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-[var(--text-2)]">
                  {cleanDisplayText(slip.honestNotice)}
                </p>

                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleCopySlip(slip)}
                    className="flex-1 min-h-[44px] rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] text-[12px] font-semibold text-[var(--text)] flex items-center justify-center gap-1.5"
                  >
                    {copiedSlipId === slip.slipId ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy slip</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveSlip(slip.slipId)}
                    className="min-h-[44px] px-3.5 rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] text-[12px] font-semibold text-[var(--text-2)] hover:text-[var(--text)] flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {isLoaded &&
      (savedBasketballFixtures.length > 0 || savedFixtures.length > 0) ? (
        <div className="space-y-3">
          {savedBasketballFixtures.map((fixture) => (
            <NBAGameCard
              key={fixture.id}
              fixture={fixture}
              evaluation={evaluations?.[fixture.id]}
              isSavedInitial={true}
            />
          ))}
          {savedFixtures.map(({ fixture, topPick, noRecommendationReason, writtenExplanation }) => (
            <FixtureCard
              key={fixture.id}
              fixture={fixture}
              topPrediction={topPick}
              noRecommendationReason={noRecommendationReason}
              writtenExplanation={writtenExplanation}
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
      ) : isLoaded && savedSlips.length === 0 ? (
        <div className="border border-dashed border-[var(--border-strong)] rounded-[18px] bg-[var(--surface)] p-8 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center text-[var(--medium)]">
            <Bookmark className="w-5 h-5" strokeWidth={1.8} />
          </div>
          <h3 className="font-display text-[16px] font-semibold text-[var(--text)]">
            Your watchlist is empty
          </h3>
          <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)] max-w-xs mx-auto">
            Tap the bookmark icon on any fixture card or save a built slip from the Slip builder.
          </p>
          <div className="pt-1 flex items-center gap-2 flex-wrap justify-center">
            <Link
              href="/matches"
              className="inline-flex items-center gap-1.5 min-h-[44px] px-5 rounded-[12px] bg-[var(--accent-fill)] hover:opacity-95 text-[var(--accent-ink)] font-bold text-[13px] touch-press"
            >
              <span>Explore fixtures</span>
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link
              href="/slips"
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text)] font-semibold text-[13px] touch-press"
            >
              <Layers className="w-4 h-4 text-[var(--accent)]" />
              <span>Build a slip</span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
