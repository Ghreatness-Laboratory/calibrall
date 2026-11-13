'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Fixture, MarketPrediction } from '@/types';
import { Bookmark, ChevronRight, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/supabase/client';
import TeamCrest from '@/components/TeamCrest';
import LineupChip from '@/components/LineupChip';
import { getFixtureLineupState } from '@/lib/data/lineupsService';
import { formatExpectedValue, formatSelectionName, getRiskTierBadge, formatOdds } from '@/lib/prediction/marketCatalog';
import { cleanDisplayText, displayName, formatMatchTime } from '@/lib/utils/formatText';
import { settleMarketPrediction, extractMatchStats } from '@/lib/prediction/settlementEngine';
import { isTeamNewsEnabled } from '@/lib/prediction/featureFlags';
import { matchesStore } from '@/lib/data/matchesStore';

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

  const isPastKickoff = useMemo(() => {
    const kickoffMs = new Date(fixture.kickoffTime).getTime();
    return !isNaN(kickoffMs) && Date.now() >= kickoffMs;
  }, [fixture.kickoffTime]);

  const elapsedMinutes = useMemo(() => {
    const kickoffMs = new Date(fixture.kickoffTime).getTime();
    if (isNaN(kickoffMs) || Date.now() < kickoffMs) return 0;
    return Math.floor((Date.now() - kickoffMs) / 60000);
  }, [fixture.kickoffTime]);

  const isPostponed = fixture.status === 'POSTPONED';
  const isFinished = fixture.status === 'FINISHED' || (isPastKickoff && elapsedMinutes >= 125 && !isPostponed);
  const isPaused = fixture.status === 'PAUSED' || (isPastKickoff && !isFinished && !isPostponed && elapsedMinutes >= 47 && elapsedMinutes <= 62);
  const isInPlay = fixture.status === 'IN_PLAY' || (isPastKickoff && !isFinished && !isPaused && !isPostponed);

  const stats = useMemo(() => extractMatchStats(fixture), [fixture]);

  const displayMinute = useMemo(() => {
    if (fixture.minute !== undefined && fixture.minute !== null) return fixture.minute;
    if (isInPlay) {
      if (elapsedMinutes <= 45) return Math.max(1, elapsedMinutes);
      if (elapsedMinutes > 60) return Math.min(90, elapsedMinutes - 15);
      return 45;
    }
    return stats.minute || 90;
  }, [fixture.minute, isInPlay, elapsedMinutes, stats.minute]);

  const settledTopPrediction = useMemo(() => {
    if (!topPrediction || !isFinished) return null;
    return settleMarketPrediction(topPrediction, stats);
  }, [topPrediction, isFinished, stats]);

  const kickoffFormatted = useMemo(() => {
    return formatMatchTime(fixture.kickoffTime, 'Africa/Lagos');
  }, [fixture.kickoffTime]);

  const statusBadgeText = useMemo(() => {
    if (isFinished) return 'FT';
    if (isPaused) return 'HT';
    if (isPostponed) return 'Postponed';
    // When in-play, the left badge renders the red LIVE minute pill.
    // Display kickoffFormatted on the right so 'LIVE 82\'' is rendered once, not twice.
    if (isInPlay) return kickoffFormatted;
    return kickoffFormatted;
  }, [isFinished, isPaused, isPostponed, isInPlay, kickoffFormatted]);

  const homeName = displayName(fixture.homeTeam);
  const awayName = displayName(fixture.awayTeam);

  // Stale data check: parse "last match N days ago" if present
  const staleDaysMatch = noRecommendationReason?.match(/last match (\d+) days ago/);
  const staleDays = staleDaysMatch ? staleDaysMatch[1] : null;

  const rawTier = topPrediction ? getRiskTierBadge(topPrediction.confidenceTier || topPrediction.riskTier) : null;
  // Eliminate word "Safe" everywhere
  const tierLabel = rawTier?.label === 'SAFE' ? 'HIGH' : (rawTier?.label || 'MEDIUM');

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

  const lineupState = useMemo(() => {
    return getFixtureLineupState(fixture);
  }, [fixture]);

  return (
    <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3 space-y-2 touch-press transition-transform duration-150">
      {/* Header: League & Matchday left, Kickoff right + Bookmark */}
      <div className="flex items-center justify-between text-[11px] text-[#8B9892] gap-2">
        <div className="flex items-center gap-1.5 truncate flex-wrap">
          <span className="truncate">{cleanDisplayText(fixture.competition.name)}</span>
          <span className="text-[#5E6B65]">·</span>
          <span className="tabular-nums shrink-0">MD {fixture.matchday}</span>

          {/* Stale data note */}
          {staleDays && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#E8B04A]/12 text-[#E8B04A] text-[9.5px] font-medium border border-[#E8B04A]/30">
              Stale data · {staleDays}d
            </span>
          )}

          {isFinished && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#B8E636]/12 text-[#B8E636] text-[9.5px] font-semibold border border-[#B8E636]/30">
              FT
            </span>
          )}
          {isInPlay && (
            <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#E5684F]/15 text-[#E5684F] text-[9.5px] font-semibold border border-[#E5684F]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E5684F] animate-pulse" />
              LIVE {displayMinute}&apos;
            </span>
          )}
          {isPaused && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#E8B04A]/15 text-[#E8B04A] text-[9.5px] font-semibold border border-[#E8B04A]/30">
              HT
            </span>
          )}
          {isPostponed && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#E8B04A]/15 text-[#E8B04A] text-[9.5px] font-semibold border border-[#E8B04A]/30">
              Postponed
            </span>
          )}

          {/* Lineup / team news note */}
          {!isFinished && (
            <LineupChip lineupState={lineupState} isPastKickoff={isPastKickoff} className="ml-0.5" />
          )}

          {/* Data coverage indicator */}
          {!staleDays && (
            <span className="text-[9.5px] text-[#5E6B65] ml-1">
              {dataCoverage !== null ? `${dataCoverage}% data` : 'standard data'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[12px] font-[600] text-[#E9EFEB] tabular-nums" suppressHydrationWarning>
            {statusBadgeText}
          </span>
          <button
            onClick={handleToggleBookmark}
            type="button"
            className="w-6 h-6 flex items-center justify-center -mr-1 rounded-full hover:bg-[#151D19] transition-colors"
            title={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
          >
            <Bookmark
              strokeWidth={2}
              className={`w-3.5 h-3.5 transition-colors ${
                isSaved ? 'text-[#E8B04A] fill-[#E8B04A]' : 'text-[#8B9892]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main fixture matchup row */}
      <Link href={`/matches/${fixture.id}`} className="block">
        <div className="flex items-center justify-between gap-2.5">
          {/* Two team rows with 22px crest circle */}
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            {/* Home team row */}
            <div className="flex items-center gap-2 min-w-0">
              <TeamCrest
                canonicalTeamId={fixture.homeTeam.id}
                crestUrl={fixture.homeTeam.crestUrl}
                teamName={cleanDisplayText(homeName)}
                size={22}
              />
              <span className="text-[13px] font-[600] text-[#E9EFEB] leading-tight truncate">
                {cleanDisplayText(homeName)}
              </span>
              {isFinished && (
                <span className="text-[13px] font-[600] text-[#E9EFEB] ml-auto mr-1.5 tabular-nums">
                  {stats.homeScore}
                </span>
              )}
            </div>

            {/* Away team row */}
            <div className="flex items-center gap-2 min-w-0">
              <TeamCrest
                canonicalTeamId={fixture.awayTeam.id}
                crestUrl={fixture.awayTeam.crestUrl}
                teamName={cleanDisplayText(awayName)}
                size={22}
              />
              <span className="text-[13px] font-[600] text-[#E9EFEB] leading-tight truncate">
                {cleanDisplayText(awayName)}
              </span>
              {isFinished && (
                <span className="text-[13px] font-[600] text-[#E9EFEB] ml-auto mr-1.5 tabular-nums">
                  {stats.awayScore}
                </span>
              )}
            </div>
          </div>

          {/* Right: small "Analysis ›" ghost button */}
          <div className="flex items-center gap-0.5 text-[11.5px] font-[600] text-[#B8E636] px-2 py-1 rounded-full bg-[#B8E636]/10 hover:bg-[#B8E636]/20 transition-colors shrink-0">
            <span>Analysis</span>
            <ChevronRight className="w-3 h-3 text-[#B8E636]" strokeWidth={2.5} />
          </div>
        </div>

        {/* When match is completed, show compact stats summary */}
        {isFinished && (
          <div className="mt-1.5 pt-1.5 border-t border-[#1F2A24] flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-[#8B9892]">
            <div>
              <span className="text-[#E9EFEB] font-semibold">FT: {stats.homeScore} · {stats.awayScore}</span>
              <span className="text-[#5E6B65] ml-1">(HT: {stats.homeHalfTimeScore} · {stats.awayHalfTimeScore})</span>
            </div>
            <div className="flex items-center gap-2 tabular-nums">
              <span>Corners: {stats.totalCorners}</span>
              <span>Cards: {stats.totalCardPoints}</span>
            </div>
          </div>
        )}

        {/* Inner panel: 10px radius, --surface-2 background */}
        <div className="mt-2">
          {topPrediction ? (
            <div className="bg-[#151D19] rounded-[10px] p-2 space-y-1">
              {/* Row 1: Model projection + Tier */}
              <div className="flex items-center justify-between text-[10.5px] gap-2">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[#8B9892]">Model projection</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-semibold bg-[#E8B04A]/15 text-[#E8B04A] leading-tight">
                    {cleanDisplayText(tierLabel)}
                  </span>
                  {topPrediction.sanityTripwire && (
                    <span className="px-1.5 py-0.2 rounded-full bg-[#E5684F]/15 text-[#E5684F] text-[9px] font-semibold">
                      Check data
                    </span>
                  )}
                </div>

                <div className="text-[10.5px] text-[#8B9892] tabular-nums truncate text-right">
                  <span className="text-[#8B9892]">
                    Status: Calibrated
                  </span>
                </div>
              </div>

              {/* Row 2: pick name left; prob % right */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-[600] text-[#E9EFEB] truncate">
                  {cleanDisplayText(formatSelectionName(topPrediction.selection))}
                </span>
                {probPercent && (
                  <span className="text-[12px] font-[650] text-[#B8E636] tabular-nums shrink-0">
                    {probPercent}%{uncertaintyText}
                  </span>
                )}
              </div>

              {/* Real Odds, De-vigged Probability & Expected Value (strictly omitted when unpriced) */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10.5px] tabular-nums">
                {hasRealOdds && topPrediction.evidence?.expectedValue !== null && topPrediction.evidence?.expectedValue !== undefined ? (
                  <>
                    <span className="text-[#E9EFEB]">
                      Price @{oddsFormatted}
                      {topPrediction.evidence.deviggedMarketProb !== null && topPrediction.evidence.deviggedMarketProb !== undefined
                        ? ` · Market ${(topPrediction.evidence.deviggedMarketProb * 100).toFixed(1)}%`
                        : ''}
                    </span>
                    <span className="font-semibold text-[#B8E636]">
                      EV {cleanDisplayText(evFormatted || '')}
                    </span>
                  </>
                ) : (
                  <span className="text-[#8B9892]">
                    No bookmaker odds stored · Probability analysis only
                  </span>
                )}
              </div>

              {/* Settlement Banner when match completed */}
              {settledTopPrediction && (
                <div className={`mt-0.5 px-2 py-1 rounded-[6px] flex items-center justify-between text-[10px] border ${
                  settledTopPrediction.settlementStatus === 'WON'
                    ? 'bg-[#B8E636]/12 border-[#B8E636]/30 text-[#B8E636]'
                    : settledTopPrediction.settlementStatus === 'PUSH'
                    ? 'bg-[#E8B04A]/15 border-[#E8B04A]/30 text-[#E8B04A]'
                    : 'bg-[#E5684F]/15 border-[#E5684F]/30 text-[#E5684F]'
                }`}>
                  <div className="flex items-center gap-1">
                    {settledTopPrediction.settlementStatus === 'WON' && <CheckCircle2 className="w-3 h-3 text-[#B8E636]" />}
                    {settledTopPrediction.settlementStatus === 'LOST' && <XCircle className="w-3 h-3 text-[#E5684F]" />}
                    {settledTopPrediction.settlementStatus === 'PUSH' && <MinusCircle className="w-3 h-3 text-[#E8B04A]" />}
                    <span className="truncate">{cleanDisplayText(settledTopPrediction.lineComparisonText)}</span>
                  </div>
                  <span className="font-bold uppercase tracking-wider shrink-0">{settledTopPrediction.settlementStatus}</span>
                </div>
              )}

              {/* Progress bar */}
              {!isFinished && (
                <div className="w-full h-1 bg-[#101613] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300 bg-[#B8E636]"
                    style={{ width: `${probProgress}%` }}
                  />
                </div>
              )}

              {/* Evidence Audit Strip */}
              {topPrediction.evidence && (
                <div className="pt-1.5 mt-1 border-t border-[#1F2A24] space-y-1 text-[10px] leading-snug text-[#8B9892]">
                  <p className="text-[#E9EFEB]/90">
                    {cleanDisplayText(topPrediction.evidence.whyLineChosen)}
                  </p>
                  <div className="grid grid-cols-1 gap-0.5 tabular-nums">
                    <div>
                      <span className="text-[#5E6B65]">Strengths: </span>
                      <span>
                        {cleanDisplayText(
                          `Home Att ${topPrediction.evidence.fittedStrengths.homeAttack.toFixed(2)} Def ${topPrediction.evidence.fittedStrengths.homeDefense.toFixed(2)} (${topPrediction.evidence.fittedStrengths.homeXg.toFixed(2)} xG) vs Away Att ${topPrediction.evidence.fittedStrengths.awayAttack.toFixed(2)} Def ${topPrediction.evidence.fittedStrengths.awayDefense.toFixed(2)} (${topPrediction.evidence.fittedStrengths.awayXg.toFixed(2)} xG)`
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#5E6B65]">Samples: </span>
                      <span>
                        {cleanDisplayText(
                          `Home ${topPrediction.evidence.sampleSizes.homeMatches} · Away ${topPrediction.evidence.sampleSizes.awayMatches} · League ${topPrediction.evidence.sampleSizes.leagueMatches} · Walk forward ${topPrediction.evidence.sampleSizes.walkForwardMatches} · H2H ${topPrediction.evidence.sampleSizes.h2hMeetings}`
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#5E6B65]">Referee: </span>
                      <span>
                        {cleanDisplayText(
                          topPrediction.evidence.referee.announced && topPrediction.evidence.referee.name
                            ? `${topPrediction.evidence.referee.name} (${topPrediction.evidence.referee.shrunkCardsPerMatch !== undefined ? topPrediction.evidence.referee.shrunkCardsPerMatch.toFixed(2) : 'baseline'} cards/m vs ${topPrediction.evidence.referee.leagueBaseline !== undefined ? topPrediction.evidence.referee.leagueBaseline.toFixed(2) : 'league'} baseline)`
                            : topPrediction.evidence.referee.leagueBaseline !== undefined
                              ? `Unannounced (league baseline ${topPrediction.evidence.referee.leagueBaseline.toFixed(2)} cards/m)`
                              : topPrediction.evidence.referee.explanation
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#5E6B65]">H2H &amp; Derby: </span>
                      <span>
                        {cleanDisplayText(
                          `${topPrediction.evidence.h2h.summary} (w=${topPrediction.evidence.h2h.weightApplied.toFixed(2)}) · ${
                            topPrediction.evidence.derby.isDerby
                              ? `Derby: ${topPrediction.evidence.derby.name || 'Rivalry'} (${topPrediction.evidence.derby.source || 'verified'}, cards x${topPrediction.evidence.derby.cardsMultiplierApplied.toFixed(2)})`
                              : 'No active rivalry flag'
                          }`
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#151D19] rounded-[10px] px-2.5 py-2 flex items-center justify-between text-[11px] text-[#8B9892]">
              <span className="truncate leading-tight">
                {cleanDisplayText(
                  noRecommendationReason && noRecommendationReason !== 'Not enough data'
                    ? noRecommendationReason
                    : (() => {
                        const hCount = matchesStore.getTeamMatchCountSync(fixture.homeTeam.id || fixture.homeTeam.name);
                        const aCount = matchesStore.getTeamMatchCountSync(fixture.awayTeam.id || fixture.awayTeam.name);
                        return `Abstained: ${homeName} (${hCount} matches) & ${awayName} (${aCount} matches) lack qualifying predictive edge.`;
                      })()
                )}
              </span>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
