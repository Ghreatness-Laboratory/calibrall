'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Fixture, MarketPrediction } from '@/types';
import { Bookmark, ChevronRight, CheckCircle2, XCircle, MinusCircle, AlertCircle } from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/supabase/client';
import TeamCrest from '@/components/TeamCrest';
import { formatExpectedValue, formatSelectionName, getRiskTierBadge, formatOdds } from '@/lib/prediction/marketCatalog';
import { cleanDisplayText, displayName, formatMatchTime } from '@/lib/utils/formatText';
import { settleMarketPrediction, extractMatchStats } from '@/lib/prediction/settlementEngine';

interface Props {
  fixture: Fixture;
  topPrediction?: MarketPrediction | null;
  noRecommendationReason?: string;
  isSavedInitial?: boolean;
}

export default function FixtureCard({
  fixture,
  topPrediction,
  noRecommendationReason,
  isSavedInitial,
}: Props) {
  const [isSaved, setIsSaved] = useState<boolean>(isSavedInitial ?? false);

  useEffect(() => {
    if (isSavedInitial === undefined) {
      setIsSaved(getStoredSavedFixtures().includes(fixture.id));
    }
  }, [fixture.id, isSavedInitial]);

  const handleToggleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const updated = toggleStoredSavedFixture(fixture.id);
    setIsSaved(updated);
  };

  const isFinished = fixture.status === 'FINISHED';
  const isInPlay = fixture.status === 'IN_PLAY';
  const isPaused = fixture.status === 'PAUSED';

  const stats = useMemo(() => extractMatchStats(fixture), [fixture]);

  const settledTopPrediction = useMemo(() => {
    if (!topPrediction || !isFinished) return null;
    return settleMarketPrediction(topPrediction, stats);
  }, [topPrediction, isFinished, stats]);

  const kickoffFormatted = useMemo(() => {
    return formatMatchTime(fixture.kickoffTime, 'Africa/Lagos');
  }, [fixture.kickoffTime]);

  const homeName = displayName(fixture.homeTeam);
  const awayName = displayName(fixture.awayTeam);

  const tierBadge = topPrediction ? getRiskTierBadge(topPrediction.confidenceTier || topPrediction.riskTier) : null;
  const dataCoverage = topPrediction?.dataCompletenessScore !== undefined && topPrediction?.dataCompletenessScore !== null
    ? Math.round(topPrediction.dataCompletenessScore * 100) 
    : (topPrediction?.dataQualityScore !== undefined && topPrediction?.dataQualityScore !== null ? Math.round(topPrediction.dataQualityScore * 100) : null);

  const hasRealOdds = Boolean(topPrediction?.marketOdds && topPrediction.expectedValue !== null && topPrediction.expectedValue !== undefined);

  const evFormatted = hasRealOdds && topPrediction?.expectedValue !== undefined && topPrediction?.expectedValue !== null
    ? cleanDisplayText(formatExpectedValue(topPrediction.expectedValue).text)
    : null;

  const oddsFormatted = topPrediction?.marketOdds 
    ? formatOdds(topPrediction.marketOdds) 
    : null;

  const probPercent = topPrediction
    ? (topPrediction.calibratedProbability !== undefined
        ? (topPrediction.calibratedProbability * 100).toFixed(1)
        : (topPrediction.modelProbability * 100).toFixed(1))
    : null;

  const uncertaintyText = topPrediction?.uncertaintySpread !== null && topPrediction?.uncertaintySpread !== undefined
    ? ` ± ${(topPrediction.uncertaintySpread * 100).toFixed(1)}%`
    : ' ± —';

  const probProgress = topPrediction && probPercent
    ? Math.min(100, Math.max(0, parseFloat(probPercent)))
    : 50;

  return (
    <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3 space-y-2.5 touch-press transition-transform duration-150">
      {/* Header: "League · MD n" caption left, time + bookmark icon right */}
      <div className="flex items-center justify-between text-[11.5px] text-[#8B9890]">
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate">{cleanDisplayText(fixture.competition.name)}</span>
          <span className="text-[#5E6A63]">·</span>
          <span className="tabular-nums shrink-0">MD {fixture.matchday}</span>
          {isFinished && (
            <span className="ml-1 px-1.5 py-0.5 rounded-[4px] bg-[#B6E63B]/[0.12] text-[#B6E63B] font-mono text-[9.5px] font-semibold border border-[#B6E63B]/30">
              Match completed
            </span>
          )}
          {isInPlay && (
            <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-rose-500/20 text-rose-300 font-mono text-[9.5px] font-semibold border border-rose-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              {stats.minute}&apos;
            </span>
          )}
          {isPaused && (
            <span className="ml-1 px-1.5 py-0.5 rounded-[4px] bg-amber-500/20 text-amber-300 font-mono text-[9.5px] font-semibold border border-amber-500/30">
              HT
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11.5px] text-[#8B9890] tabular-nums" suppressHydrationWarning>
            {isFinished ? 'FT' : (isInPlay ? 'Live' : kickoffFormatted)}
          </span>
          <button
            onClick={handleToggleBookmark}
            type="button"
            className="w-7 h-7 flex items-center justify-center -mr-1 rounded-full hover:bg-[#151E19] transition-colors"
            title={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
          >
            <Bookmark
              strokeWidth={2}
              className={`w-3.5 h-3.5 transition-colors ${
                isSaved ? 'text-[#E2AE45] fill-[#E2AE45]' : 'text-[#8B9890]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main fixture matchup row */}
      <Link href={`/matches/${fixture.id}`} className="block">
        <div className="flex items-center justify-between gap-3">
          {/* Two team rows (28px crest, name 13 semibold) */}
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            {/* Home team row */}
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamCrest
                crestUrl={fixture.homeTeam.crestUrl}
                teamName={cleanDisplayText(homeName)}
                size={28}
              />
              <span className="text-[13px] font-[600] text-[#ECF1EE] leading-tight truncate">
                {cleanDisplayText(homeName)}
              </span>
              {isFinished && (
                <span className="text-[13px] font-[600] text-[#ECF1EE] ml-auto mr-2 tabular-nums">
                  {stats.homeScore}
                </span>
              )}
            </div>

            {/* Away team row */}
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamCrest
                crestUrl={fixture.awayTeam.crestUrl}
                teamName={cleanDisplayText(awayName)}
                size={28}
              />
              <span className="text-[13px] font-[600] text-[#ECF1EE] leading-tight truncate">
                {cleanDisplayText(awayName)}
              </span>
              {isFinished && (
                <span className="text-[13px] font-[600] text-[#ECF1EE] ml-auto mr-2 tabular-nums">
                  {stats.awayScore}
                </span>
              )}
            </div>
          </div>

          {/* Right: "Analysis" + chevron, vertically centered */}
          <div className="flex items-center gap-0.5 text-[12.5px] font-[600] text-[#B6E63B] shrink-0">
            <span>Analysis</span>
            <ChevronRight className="w-4 h-4 text-[#B6E63B]" strokeWidth={2} />
          </div>
        </div>

        {/* When match is completed, show completed statistics row */}
        {isFinished && (
          <div className="mt-2 pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-[#8B9890] font-mono">
            <div>
              <span className="text-[#ECF1EE] font-semibold">FT: {stats.homeScore} · {stats.awayScore}</span>
              <span className="text-[#5E6A63] ml-1.5">(HT: {stats.homeHalfTimeScore} · {stats.awayHalfTimeScore})</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span>Corners: {stats.totalCorners} ({stats.homeCorners}H · {stats.awayCorners}A)</span>
              <span>Cards: {stats.totalCardPoints}</span>
            </div>
          </div>
        )}

        {/* Pick block inset in a raised surface (radius 11) */}
        <div className="mt-2.5">
          {topPrediction ? (
            <div className="bg-[#151E19] rounded-[11px] p-2.5 space-y-1.5">
              {/* Row 1: "Top pick" (or "Pre-match pick" if in play) caption, small amber chip, data completeness. Right: Odds/EV only when real odds exist */}
              <div className="flex items-center justify-between text-[11px] gap-2">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[#8B9890]">{isInPlay ? 'Pre-match pick' : 'Top pick'}</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#E2AE45]/[0.15] text-[#E2AE45] leading-tight">
                    {cleanDisplayText(tierBadge?.label || 'MEDIUM')}
                  </span>
                  <span className="text-[#5E6A63] tabular-nums">
                    {dataCoverage !== null ? `${dataCoverage}% data` : '—'}
                  </span>
                  {topPrediction.sanityTripwire && (
                    <span className="px-1.5 py-0.5 rounded-[4px] bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9.5px] font-mono font-semibold">
                      Check data
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-[#8B9890] tabular-nums truncate text-right">
                  {hasRealOdds ? (
                    <span>
                      {topPrediction?.bookmakerName ? `${topPrediction.bookmakerName} ` : ''}@{oddsFormatted} · {evFormatted} EV
                    </span>
                  ) : (
                    <span className="text-[#5E6A63]">Odds: — · EV: —</span>
                  )}
                </div>
              </div>

              {/* Row 2: pick name 13.5 semibold left; prob % with real uncertainty accent right */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-[600] text-[#ECF1EE] truncate">
                  {cleanDisplayText(formatSelectionName(topPrediction.selection))}
                </span>
                {probPercent && (
                  <span className="text-[12.5px] font-[600] text-[#B6E63B] tabular-nums shrink-0">
                    {probPercent}%{uncertaintyText}
                  </span>
                )}
              </div>

              {/* Settlement Banner when match completed */}
              {settledTopPrediction && (
                <div className={`mt-1 px-2.5 py-1.5 rounded-[8px] flex items-center justify-between text-[11px] font-mono border ${
                  settledTopPrediction.settlementStatus === 'WON'
                    ? 'bg-[#B6E63B]/[0.12] border-[#B6E63B]/40 text-[#B6E63B]'
                    : settledTopPrediction.settlementStatus === 'PUSH'
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-white/[0.04] border-white/[0.08] text-[#8B9890]'
                }`}>
                  <div className="flex items-center gap-1.5">
                    {settledTopPrediction.settlementStatus === 'WON' && <CheckCircle2 className="w-3.5 h-3.5 text-[#B6E63B]" />}
                    {settledTopPrediction.settlementStatus === 'LOST' && <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                    {settledTopPrediction.settlementStatus === 'PUSH' && <MinusCircle className="w-3.5 h-3.5 text-amber-400" />}
                    <span>{cleanDisplayText(settledTopPrediction.lineComparisonText)}</span>
                  </div>
                  <span className="font-bold uppercase tracking-wider">{settledTopPrediction.settlementStatus}</span>
                </div>
              )}

              {/* Row 3: 4px progress bar below */}
              {!isFinished && (
                <div className="w-full h-1 bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300 bg-[#B6E63B]"
                    style={{ width: `${probProgress}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#151E19] rounded-[11px] p-2.5 flex items-center justify-between text-[11.5px] text-[#8B9890]">
              <span className="truncate">
                {cleanDisplayText(
                  noRecommendationReason && noRecommendationReason !== 'Not enough data'
                    ? noRecommendationReason
                    : (fixture.insufficientData
                        ? (fixture.homeTeam.hasRealTeamStrength === false && fixture.awayTeam.hasRealTeamStrength === false
                            ? `Needs matches for ${homeName}: has 0, ${awayName}: has 0`
                            : (fixture.homeTeam.hasRealTeamStrength === false
                                ? `Needs matches for ${homeName}: has 0`
                                : `Needs matches for ${awayName}: has 0`))
                        : 'No strong lean')
                )}
              </span>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
