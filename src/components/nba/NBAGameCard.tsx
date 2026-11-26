'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Fixture } from '@/types';
import { Bookmark, ChevronRight } from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/storage/userStorage';
import TeamCrest from '../TeamCrest';
import { cleanDisplayText } from '@/lib/utils/formatText';
import type { BasketballGameEvaluation, BasketballPickCandidate } from '@/lib/basketball/picker';
import type { BasketballMarketCategory } from '@/lib/basketball/markets';
import WhyThisPickSheet from '../WhyThisPickSheet';

export type BasketballMarketGroupFilter = 'ALL' | 'game_total' | 'team_total' | 'h1_total';

interface NBAGameCardProps {
  fixture: Fixture;
  evaluation?: BasketballGameEvaluation;
  marketGroupFilter?: BasketballMarketGroupFilter;
  isSavedInitial?: boolean;
}

const CATEGORY_SHORT_LABEL: Record<BasketballMarketCategory, string> = {
  game_total: 'Game total',
  home_total: 'Team total',
  away_total: 'Team total',
  h1_game_total: '1st half',
  h1_team_total: '1st half',
};

function selectPickForFilter(
  evaluation: BasketballGameEvaluation | undefined,
  filter: BasketballMarketGroupFilter
): BasketballPickCandidate | null {
  if (!evaluation || evaluation.needsHistory || evaluation.picks.length === 0) {
    return null;
  }

  if (filter === 'ALL') {
    return evaluation.topPick || evaluation.picks[0] || null;
  }

  const matching = evaluation.picks.filter((p) => {
    if (filter === 'game_total') return p.marketCategory === 'game_total';
    if (filter === 'team_total')
      return p.marketCategory === 'home_total' || p.marketCategory === 'away_total';
    if (filter === 'h1_total')
      return p.marketCategory === 'h1_game_total' || p.marketCategory === 'h1_team_total';
    return true;
  });

  if (matching.length === 0) return null;
  if (evaluation.topPick && matching.some((p) => p.marketCode === evaluation.topPick?.marketCode)) {
    return evaluation.topPick;
  }
  return matching[0];
}

export default function NBAGameCard({
  fixture,
  evaluation,
  marketGroupFilter = 'ALL',
  isSavedInitial,
}: NBAGameCardProps) {
  const [isSaved, setIsSaved] = useState<boolean>(isSavedInitial ?? false);
  const [whySheetOpen, setWhySheetOpen] = useState<boolean>(false);
  const writtenExplanation = fixture.writtenExplanation || evaluation?.writtenExplanation;

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

  const stats = fixture.basketballStats;
  const isFinished = fixture.status === 'FINISHED';
  const isLive = fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED';
  const isPostponed = fixture.status === 'POSTPONED';
  const isCanceled = fixture.status === 'CANCELED';

  const kickoffDate = new Date(fixture.kickoffTime);
  const now = new Date();
  const isToday = kickoffDate.toDateString() === now.toDateString();
  const isTomorrow =
    new Date(now.getTime() + 86400000).toDateString() === kickoffDate.toDateString();

  const localTime = kickoffDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const localDatePrefix = isToday
    ? ''
    : isTomorrow
    ? 'Tomorrow, '
    : kickoffDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ';
  const timeStr = `${localDatePrefix}${localTime}`;

  const rawLeague = stats?.league || fixture.competition?.code || 'NBA';
  const leagueLabel = rawLeague === 'EUROLEAGUE' ? 'EuroLeague' : rawLeague;
  const seasonDisplay = cleanDisplayText(fixture.seasonYear || '2026 to 2027');

  const baseNeedsHistory = Boolean(
    evaluation?.needsHistory ?? stats?.needsHistory ?? fixture.insufficientData
  );
  const h1NeedsHistory = marketGroupFilter === 'h1_total' && Boolean(stats?.needsH1History);
  const needsHistory = baseNeedsHistory || h1NeedsHistory;
  const abstentionReason = h1NeedsHistory
    ? 'Needs history: 1st half box score history unavailable'
    : evaluation?.abstentionReason || stats?.abstentionReason || 'Needs history';

  const homeName = fixture.homeTeam.shortName || fixture.homeTeam.name;
  const awayName = fixture.awayTeam.shortName || fixture.awayTeam.name;

  const hasFinalScores =
    (isFinished || isLive) &&
    fixture.homeScore !== null &&
    fixture.homeScore !== undefined &&
    fixture.awayScore !== null &&
    fixture.awayScore !== undefined;

  const homeScoreDisplay = hasFinalScores
    ? String(fixture.homeScore)
    : !baseNeedsHistory && stats?.homeProjected
    ? stats.homeProjected.toFixed(1)
    : '—';
  const awayScoreDisplay = hasFinalScores
    ? String(fixture.awayScore)
    : !baseNeedsHistory && stats?.awayProjected
    ? stats.awayProjected.toFixed(1)
    : '—';

  const homeSubLine =
    !baseNeedsHistory && stats?.homeOff && stats?.homeDef
      ? `Avg ${stats.homeOff.toFixed(1)} for · ${stats.homeDef.toFixed(1)} against${
          stats.homeIsB2B
            ? ' · B2B'
            : stats.homeRestDays !== null && stats.homeRestDays !== undefined
            ? ` · ${stats.homeRestDays}d rest`
            : ''
        }`
      : 'Needs history';

  const awaySubLine =
    !baseNeedsHistory && stats?.awayOff && stats?.awayDef
      ? `Avg ${stats.awayOff.toFixed(1)} for · ${stats.awayDef.toFixed(1)} against${
          stats.awayIsB2B
            ? ' · B2B'
            : stats.awayRestDays !== null && stats.awayRestDays !== undefined
            ? ` · ${stats.awayRestDays}d rest`
            : ''
        }`
      : 'Needs history';

  const displayPick = selectPickForFilter(evaluation, marketGroupFilter);
  const projTotalStr =
    !baseNeedsHistory && stats?.projectedTotal ? stats.projectedTotal.toFixed(1) : '—';
  const h1ProjStr =
    !baseNeedsHistory && !stats?.needsH1History && stats?.h1ProjectedTotal
      ? stats.h1ProjectedTotal.toFixed(1)
      : '—';

  const hasRealPrice = Boolean(
    displayPick &&
      !displayPick.isModelLine &&
      displayPick.marketOdds !== null &&
      displayPick.marketOdds !== undefined
  );

  const tierBadgeClass =
    displayPick?.tier === 'HIGH'
      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
      : displayPick?.tier === 'MEDIUM'
      ? 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/35'
      : 'bg-[var(--muted-soft)] text-[var(--muted)] border-[var(--line)]';

  const tierLabel =
    displayPick?.tier === 'HIGH'
      ? 'High'
      : displayPick?.tier === 'MEDIUM'
      ? 'Medium'
      : 'Speculative';

  const probPct = displayPick ? (displayPick.calibratedProbability * 100).toFixed(1) : null;
  const probProgress = probPct ? Math.min(100, Math.max(0, parseFloat(probPct))) : 0;

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between text-[11px] text-[var(--text-2)] gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="font-semibold text-[var(--text)]">{leagueLabel}</span>
          <span className="text-[var(--text-3)]">·</span>
          <span className="truncate">{seasonDisplay}</span>
          {stats?.neutral && (
            <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--line)]">
              Neutral
            </span>
          )}
          {!isFinished && !isPostponed && !isCanceled && !needsHistory && displayPick && !hasRealPrice && (
            <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--line)]">
              Awaiting lines
            </span>
          )}
          {isFinished && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[10.5px] font-semibold border border-[var(--accent)]/30">
              Final
            </span>
          )}
          {isLive && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/35 text-[10.5px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              Live
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11.5px] font-semibold text-[var(--text)] tabular-nums" suppressHydrationWarning>
            {isFinished ? 'FT' : isLive ? 'Live' : isPostponed ? 'Postponed' : isCanceled ? 'Canceled' : timeStr}
          </span>
          <button
            onClick={handleToggleBookmark}
            type="button"
            className="w-[44px] h-[44px] -my-2 -mr-2 flex items-center justify-center rounded-[12px] hover:bg-[var(--surface-2)] transition-colors touch-press"
            title={isSaved ? 'Remove bookmark' : 'Bookmark game'}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark game'}
          >
            <Bookmark
              strokeWidth={2}
              className={`w-4 h-4 transition-colors ${
                isSaved ? 'text-[var(--medium)] fill-[var(--medium)]' : 'text-[var(--text-2)]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Team Rows with 28px crests */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <TeamCrest
              canonicalTeamId={fixture.homeTeam.id}
              crestUrl={fixture.homeTeam.crestUrl}
              teamName={cleanDisplayText(homeName)}
              size={28}
            />
            <div className="flex flex-col min-w-0">
              <span className="font-display text-[14px] font-semibold text-[var(--text)] leading-tight truncate">
                {cleanDisplayText(homeName)}
              </span>
              <span className="text-[10.5px] text-[var(--text-3)] tabular-nums truncate">
                {homeSubLine}
              </span>
            </div>
          </div>
          <span className="font-display text-[16px] leading-none tabular-nums font-bold text-[var(--text)] shrink-0">
            {homeScoreDisplay}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <TeamCrest
              canonicalTeamId={fixture.awayTeam.id}
              crestUrl={fixture.awayTeam.crestUrl}
              teamName={cleanDisplayText(awayName)}
              size={28}
            />
            <div className="flex flex-col min-w-0">
              <span className="font-display text-[14px] font-semibold text-[var(--text)] leading-tight truncate">
                {cleanDisplayText(awayName)}
              </span>
              <span className="text-[10.5px] text-[var(--text-3)] tabular-nums truncate">
                {awaySubLine}
              </span>
            </div>
          </div>
          <span className="font-display text-[16px] leading-none tabular-nums font-bold text-[var(--text)] shrink-0">
            {awayScoreDisplay}
          </span>
        </div>
      </div>

      {/* Inset 12px projection panel */}
      {needsHistory ? (
        <div className="bg-[var(--surface-2)] rounded-[12px] p-3 flex items-center justify-between gap-2 text-[11.5px] border border-[var(--line)]">
          <span className="px-2.5 py-0.5 rounded-full bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30 font-semibold text-[10.5px] shrink-0">
            Needs history
          </span>
          <span className="text-[var(--text-2)] truncate">{cleanDisplayText(abstentionReason)}</span>
        </div>
      ) : displayPick ? (
        <div className="bg-[var(--surface-2)] rounded-[12px] p-3 space-y-2 border border-[var(--line)]">
          <div className="flex items-center justify-between text-[11px] gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[var(--text-2)] truncate">
                {CATEGORY_SHORT_LABEL[displayPick.marketCategory]}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border leading-tight ${tierBadgeClass}`}
              >
                {tierLabel}
              </span>
            </div>
            <span className="text-[10.5px] text-[var(--text-2)] shrink-0">
              {hasRealPrice ? 'Priced' : 'Calibrated'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="font-display text-[15px] font-bold text-[var(--text)] truncate">
              {cleanDisplayText(displayPick.selection)} pts
            </span>
            {probPct && (
              <span className="font-display text-[15px] font-bold text-[var(--accent)] tabular-nums shrink-0">
                {probPct}%
              </span>
            )}
          </div>

          {!isFinished && (
            <div className="relative w-full h-1.5 bg-[var(--surface)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 bg-[var(--accent-fill)]"
                style={{ width: `${probProgress}%` }}
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
            {hasRealPrice ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[var(--text)] truncate">
                  {displayPick.priceSource} @{displayPick.marketOdds?.toFixed(2)}
                </span>
                {displayPick.expectedValue !== null && (
                  <span
                    className={`font-semibold shrink-0 ${
                      displayPick.expectedValue >= 0 ? 'text-[var(--accent)]' : 'text-[var(--text-2)]'
                    }`}
                  >
                    EV {displayPick.expectedValue >= 0 ? '+' : ''}
                    {(displayPick.expectedValue * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[var(--text-2)] truncate">Model line, no market price</span>
            )}

            <span className="text-[var(--text-3)] shrink-0">
              Proj {projTotalStr} · 1H {h1ProjStr}
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--surface-2)] rounded-[12px] p-3 flex items-center justify-between text-[11.5px] text-[var(--text-2)] gap-2 border border-[var(--line)]">
          <span>Awaiting lines · no qualified totals call</span>
          <span className="tabular-nums shrink-0 text-[var(--text)]">
            Proj {projTotalStr} · 1H {h1ProjStr}
          </span>
        </div>
      )}

      {writtenExplanation?.oneLineSummary && (
        <div className="pt-1 border-t border-[var(--line)] space-y-1">
          <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
            {cleanDisplayText(writtenExplanation.oneLineSummary)}
          </p>
          <button
            type="button"
            onClick={() => setWhySheetOpen(true)}
            className="min-h-[44px] inline-flex items-center text-[12px] font-semibold text-[var(--accent)] touch-press -my-1"
          >
            Why this pick
          </button>
        </div>
      )}

      <Link
        href={`/matches/${fixture.id}`}
        className="min-h-[44px] -mx-1 px-2 rounded-[12px] flex items-center justify-between text-[12.5px] font-semibold text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors touch-press"
      >
        <span>View full analysis</span>
        <ChevronRight className="w-4 h-4" strokeWidth={2} />
      </Link>

      <WhyThisPickSheet
        open={whySheetOpen}
        onClose={() => setWhySheetOpen(false)}
        matchTitle={`${homeName} vs ${awayName}`}
        pickLabel={displayPick ? `${displayPick.selection} pts` : undefined}
        explanation={writtenExplanation}
      />
    </div>
  );
}
