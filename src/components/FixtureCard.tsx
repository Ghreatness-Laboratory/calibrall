'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Fixture, MarketPrediction, WrittenMatchExplanation } from '@/types';
import { Bookmark, ChevronRight, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/storage/userStorage';
import TeamCrest from '@/components/TeamCrest';
import LineupChip from '@/components/LineupChip';
import { getFixtureLineupState } from '@/lib/data/lineupsService';
import { formatExpectedValue, formatSelectionName, getRiskTierBadge, formatOdds } from '@/lib/prediction/marketCatalog';
import { cleanDisplayText, displayName, formatMatchTime } from '@/lib/utils/formatText';
import { settleMarketPrediction, extractMatchStats } from '@/lib/prediction/settlementEngine';
import { getMarketEvidenceFamily } from '@/lib/prediction/explanationValidator';
import WhyThisPickSheet from '@/components/WhyThisPickSheet';

interface Props {
  fixture: Fixture;
  topPrediction?: MarketPrediction | null;
  noRecommendationReason?: string;
  writtenExplanation?: WrittenMatchExplanation;
  isSavedInitial?: boolean;
}

function summarizeToTwoSentences(text: string): { shortText: string; hasMore: boolean } {
  const cleaned = cleanDisplayText(text).trim();
  if (!cleaned) return { shortText: '', hasMore: false };
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length <= 2) {
    if (cleaned.length <= 165) {
      return { shortText: cleaned, hasMore: false };
    }
    return { shortText: `${cleaned.slice(0, 160).trim()}…`, hasMore: true };
  }
  const firstTwo = sentences.slice(0, 2).join(' ').trim();
  return { shortText: firstTwo, hasMore: sentences.length > 2 || firstTwo.length < cleaned.length };
}

export default function FixtureCard({
  fixture,
  topPrediction,
  noRecommendationReason,
  writtenExplanation,
  isSavedInitial,
}: Props) {
  const candidateExplanation =
    writtenExplanation !== undefined ? writtenExplanation : fixture.writtenExplanation;
  const activeExplanation =
    !topPrediction ||
    !candidateExplanation?.activePickMarketCode ||
    candidateExplanation.activePickMarketCode === topPrediction.marketCode
      ? candidateExplanation
      : undefined;
  const [isSaved, setIsSaved] = useState<boolean>(isSavedInitial ?? false);
  const [expandedRationale, setExpandedRationale] = useState<boolean>(false);
  const [whySheetOpen, setWhySheetOpen] = useState<boolean>(false);

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

  const hasVerifiedLiveMinute = typeof fixture.minute === 'number' && !isNaN(fixture.minute);
  const isPostponed = fixture.status === 'POSTPONED';
  const isCanceled = fixture.status === 'CANCELED';
  const isFinished = fixture.status === 'FINISHED';
  const isPaused = fixture.status === 'PAUSED';
  const isInPlayWithMinute = fixture.status === 'IN_PLAY' && hasVerifiedLiveMinute;
  const isAwaitingResult =
    !isFinished &&
    !isPostponed &&
    !isCanceled &&
    !isPaused &&
    !isInPlayWithMinute &&
    (isPastKickoff || fixture.status === 'IN_PLAY');

  const stats = useMemo(() => extractMatchStats(fixture), [fixture]);

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
    if (isCanceled) return 'Canceled';
    return kickoffFormatted;
  }, [isFinished, isPaused, isPostponed, isCanceled, kickoffFormatted]);

  const homeName = displayName(fixture.homeTeam);
  const awayName = displayName(fixture.awayTeam);

  const staleDaysMatch = noRecommendationReason?.match(/last match (\d+) days ago/);
  const staleDays = staleDaysMatch ? staleDaysMatch[1] : null;

  const tierInfo = topPrediction
    ? getRiskTierBadge(topPrediction.confidenceTier || topPrediction.riskTier, {
        isSpeculative: topPrediction.isSpeculative,
      })
    : null;

  const hasRealOdds = Boolean(
    topPrediction?.marketOdds && topPrediction.expectedValue !== null && topPrediction.expectedValue !== undefined
  );

  const evFormatted =
    hasRealOdds && topPrediction?.expectedValue !== undefined && topPrediction?.expectedValue !== null
      ? cleanDisplayText(formatExpectedValue(topPrediction.expectedValue).text)
      : null;

  const oddsFormatted = topPrediction?.marketOdds ? formatOdds(topPrediction.marketOdds) : null;

  const probPercent = topPrediction
    ? (topPrediction.calibratedProbability !== undefined
        ? topPrediction.calibratedProbability * 100
        : topPrediction.modelProbability * 100
      ).toFixed(1)
    : null;

  const uncertaintyText =
    topPrediction?.uncertaintySpread !== null && topPrediction?.uncertaintySpread !== undefined
      ? ` ± ${(topPrediction.uncertaintySpread * 100).toFixed(1)}%`
      : '';

  const probProgress =
    topPrediction && probPercent ? Math.min(100, Math.max(0, parseFloat(probPercent))) : 0;

  const lineupState = useMemo(() => {
    return getFixtureLineupState(fixture);
  }, [fixture]);

  const fullExplanation = useMemo(() => {
    if (!topPrediction) return '';
    return cleanDisplayText(
      topPrediction.plainEnglishReason || topPrediction.evidence?.whyLineChosen || ''
    );
  }, [topPrediction]);

  const { shortText, hasMore } = useMemo(
    () => summarizeToTwoSentences(fullExplanation),
    [fullExplanation]
  );

  const refBaselineText = useMemo(() => {
    if (!topPrediction || getMarketEvidenceFamily(topPrediction, 'football') !== 'cards') {
      return null;
    }
    const ref = topPrediction.evidence?.referee;
    if (!ref) return null;
    const hasPositiveBaseline = typeof ref.leagueBaseline === 'number' && ref.leagueBaseline > 0;
    if (ref.announced && ref.name) {
      const ratePart =
        ref.shrunkCardsPerMatch !== undefined ? `${ref.shrunkCardsPerMatch.toFixed(2)} cards/m` : null;
      const basePart = hasPositiveBaseline ? `vs ${ref.leagueBaseline!.toFixed(2)} baseline` : null;
      const detail = [ratePart, basePart].filter(Boolean).join(' ');
      return detail ? `${cleanDisplayText(ref.name)} (${detail})` : cleanDisplayText(ref.name);
    }
    if (hasPositiveBaseline) {
      return `Referee unannounced · ${ref.leagueBaseline!.toFixed(2)} league avg`;
    }
    return 'Referee unannounced';
  }, [topPrediction]);

  return (
    <article className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
      {/* Header: League & matchday left, kickoff time + bookmark right */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-2)] min-w-0 flex-wrap">
          <span className="font-medium text-[var(--text)] truncate">
            {cleanDisplayText(fixture.competition.name)}
          </span>
          <span className="text-[var(--text-3)]">·</span>
          <span className="tabular-nums shrink-0">Matchday {fixture.matchday}</span>

          {staleDays && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--medium-soft)] text-[var(--medium)] text-[10.5px] font-medium border border-[var(--medium)]/30">
              Stale · {staleDays}d
            </span>
          )}
          {isInPlayWithMinute && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--danger-soft)] text-[var(--danger)] text-[10.5px] font-semibold border border-[var(--danger)]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)] animate-pulse" />
              Live {fixture.minute}&apos;
            </span>
          )}
          {isAwaitingResult && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--medium-soft)] text-[var(--medium)] text-[10.5px] font-medium border border-[var(--medium)]/30">
              Awaiting result
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[12px] font-semibold text-[var(--text)] tabular-nums" suppressHydrationWarning>
            {statusBadgeText}
          </span>
          <button
            onClick={handleToggleBookmark}
            type="button"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center touch-press"
            title={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
          >
            <span
              className={`w-[34px] h-[34px] rounded-[10px] border flex items-center justify-center transition-colors ${
                isSaved
                  ? 'bg-[var(--medium-soft)] border-[var(--medium)]/40 text-[var(--medium)]'
                  : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--text-2)]'
              }`}
            >
              <Bookmark
                strokeWidth={2}
                className={`w-4 h-4 ${isSaved ? 'fill-[var(--medium)]' : ''}`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Two team rows with 28px crests */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <TeamCrest
              canonicalTeamId={fixture.homeTeam.id}
              crestUrl={fixture.homeTeam.crestUrl}
              teamName={cleanDisplayText(homeName)}
              size={28}
            />
            <span className="font-display text-[15px] font-semibold text-[var(--text)] leading-tight truncate">
              {cleanDisplayText(homeName)}
            </span>
          </div>
          {isFinished && (
            <span className="font-display text-[16px] font-bold text-[var(--text)] tabular-nums shrink-0">
              {stats.homeScore}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <TeamCrest
              canonicalTeamId={fixture.awayTeam.id}
              crestUrl={fixture.awayTeam.crestUrl}
              teamName={cleanDisplayText(awayName)}
              size={28}
            />
            <span className="font-display text-[15px] font-semibold text-[var(--text)] leading-tight truncate">
              {cleanDisplayText(awayName)}
            </span>
          </div>
          {isFinished && (
            <span className="font-display text-[16px] font-bold text-[var(--text)] tabular-nums shrink-0">
              {stats.awayScore}
            </span>
          )}
        </div>
      </div>

      {/* Finished match summary with em-dash fallback for missing stats */}
      {isFinished && (
        <div className="pt-2 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-2)] tabular-nums">
          <div>
            <span className="text-[var(--text)] font-semibold">
              FT {stats.homeScore} – {stats.awayScore}
            </span>
            <span className="text-[var(--text-3)] ml-1.5">
              (HT {stats.homeHalfTimeScore ?? '—'} – {stats.awayHalfTimeScore ?? '—'})
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>Corners: {stats.totalCorners > 0 ? stats.totalCorners : '—'}</span>
            <span>Cards: {stats.totalCardPoints > 0 ? stats.totalCardPoints : '—'}</span>
          </div>
        </div>
      )}

      {/* Inset projection panel (12px radius, --surface-2) */}
      {topPrediction ? (
        <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3 space-y-2.5">
          {/* Status chips row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {tierInfo && (
                <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${tierInfo.badgeClass}`}>
                  {tierInfo.label === 'Speculative' ? 'Speculative' : `${tierInfo.label} confidence`}
                </span>
              )}
              {!isFinished && <LineupChip lineupState={lineupState} isPastKickoff={isPastKickoff} />}
              {topPrediction.sanityTripwire && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--danger-soft)] text-[var(--danger)] text-[10.5px] font-semibold border border-[var(--danger)]/30">
                  Check data
                </span>
              )}
            </div>

            {refBaselineText && (
              <span className="text-[10.5px] text-[var(--text-3)] truncate">
                {cleanDisplayText(refBaselineText)}
              </span>
            )}
          </div>

          {/* Pick title + probability ± interval */}
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-[17px] sm:text-[18px] font-bold text-[var(--text)] leading-snug break-words min-w-0">
              {cleanDisplayText(formatSelectionName(topPrediction.selection))}
            </span>
            {probPercent && (
              <span className="font-display text-[15px] font-bold text-[var(--accent)] tabular-nums shrink-0">
                {probPercent}%
                {uncertaintyText && (
                  <span className="text-[11.5px] font-medium text-[var(--text-2)]">{uncertaintyText}</span>
                )}
              </span>
            )}
          </div>

          {/* Probability meter with threshold tick (60% for Multi goals, 70% standard) */}
          {!isFinished && (
            <div className="relative w-full h-1.5 bg-[var(--surface)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 bg-[var(--accent-fill)]"
                style={{ width: `${probProgress}%` }}
              />
              <span
                aria-hidden="true"
                className="absolute top-0 bottom-0 w-[1.5px] bg-[var(--text)]/50"
                style={{ left: topPrediction.marketCategory === 'multi_goals' ? '60%' : '70%' }}
              />
            </div>
          )}

          {/* Odds / analysis line */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] tabular-nums text-[var(--text-2)]">
            {hasRealOdds ? (
              <>
                <span className="text-[var(--text)] font-medium">
                  Odds @{oddsFormatted}
                  {topPrediction.evidence?.deviggedMarketProb !== null &&
                  topPrediction.evidence?.deviggedMarketProb !== undefined
                    ? ` · Market ${(topPrediction.evidence.deviggedMarketProb * 100).toFixed(1)}%`
                    : ''}
                </span>
                <span className="font-semibold text-[var(--accent)]">EV {evFormatted}</span>
              </>
              ) : (
                <span>
                  {topPrediction.priceSource
                    ? cleanDisplayText(topPrediction.priceSource)
                    : 'Probability analysis only · No bookmaker odds'}
                </span>
              )}
          </div>

          {/* Settlement banner when finished */}
          {settledTopPrediction && (
            <div
              className={`px-2.5 py-1.5 rounded-[8px] flex items-center justify-between gap-2 text-[11px] border ${
                settledTopPrediction.settlementStatus === 'WON'
                  ? 'bg-[var(--accent-soft)] border-[var(--accent)]/30 text-[var(--accent)]'
                  : settledTopPrediction.settlementStatus === 'PUSH'
                  ? 'bg-[var(--medium-soft)] border-[var(--medium)]/30 text-[var(--medium)]'
                  : 'bg-[var(--danger-soft)] border-[var(--danger)]/30 text-[var(--danger)]'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {settledTopPrediction.settlementStatus === 'WON' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                {settledTopPrediction.settlementStatus === 'LOST' && <XCircle className="w-3.5 h-3.5 shrink-0" />}
                {settledTopPrediction.settlementStatus === 'PUSH' && <MinusCircle className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{cleanDisplayText(settledTopPrediction.lineComparisonText)}</span>
              </div>
              <span className="font-semibold shrink-0">{settledTopPrediction.settlementStatus}</span>
            </div>
          )}

          {/* Written 1-line explanation + Why this pick sheet */}
          {activeExplanation?.oneLineSummary ? (
            <div className="pt-2 border-t border-[var(--line)] space-y-1">
              <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
                {cleanDisplayText(activeExplanation.oneLineSummary)}
              </p>
              <button
                type="button"
                onClick={() => setWhySheetOpen(true)}
                className="min-h-[44px] inline-flex items-center text-[12px] font-semibold text-[var(--accent)] touch-press -my-1"
              >
                Why this pick
              </button>
            </div>
          ) : fullExplanation ? (
            <div className="pt-1 border-t border-[var(--line)]">
              <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
                {expandedRationale ? fullExplanation : shortText}
              </p>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setExpandedRationale((prev) => !prev)}
                  className="min-h-[44px] inline-flex items-center text-[12px] font-semibold text-[var(--accent)] touch-press -my-2"
                >
                  {expandedRationale ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-[var(--medium-soft)] text-[var(--medium)] text-[10.5px] font-semibold border border-[var(--medium)]/30">
              {fixture.insufficientData ? 'Abstained' : 'No recommendation'}
            </span>
            {!isFinished && <LineupChip lineupState={lineupState} isPastKickoff={isPastKickoff} />}
          </div>
          <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
            {cleanDisplayText(
              activeExplanation?.oneLineSummary ||
                (noRecommendationReason && noRecommendationReason !== 'Not enough data'
                  ? noRecommendationReason
                  : `${homeName} and ${awayName} lack qualifying predictive edge above the 70.0% calibration threshold.`)
            )}
          </p>
          {activeExplanation && (
            <button
              type="button"
              onClick={() => setWhySheetOpen(true)}
              className="min-h-[44px] inline-flex items-center text-[12px] font-semibold text-[var(--accent)] touch-press -my-2"
            >
              Why this pick
            </button>
          )}
        </div>
      )}

      {/* View full analysis row */}
      <Link
        href={`/matches/${fixture.id}`}
        className="min-h-[44px] pt-2 border-t border-[var(--line)] flex items-center justify-between text-[13px] font-semibold text-[var(--accent)] touch-press rounded-[8px]"
      >
        <span>View full analysis</span>
        <ChevronRight className="w-4 h-4 shrink-0" strokeWidth={2.2} />
      </Link>

      <WhyThisPickSheet
        open={whySheetOpen}
        onClose={() => setWhySheetOpen(false)}
        matchTitle={`${homeName} vs ${awayName}`}
        pickLabel={topPrediction ? cleanDisplayText(formatSelectionName(topPrediction.selection)) : undefined}
        explanation={activeExplanation}
      />
    </article>
  );
}
