'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Fixture } from '@/types';
import { Bookmark, ChevronRight } from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/supabase/client';
import TeamCrest from '../TeamCrest';
import { cleanDisplayText } from '@/lib/utils/formatText';
import type { BasketballGameEvaluation, BasketballPickCandidate } from '@/lib/basketball/picker';
import type { BasketballMarketCategory } from '@/lib/basketball/markets';

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
    if (filter === 'team_total') return p.marketCategory === 'home_total' || p.marketCategory === 'away_total';
    if (filter === 'h1_total') return p.marketCategory === 'h1_game_total' || p.marketCategory === 'h1_team_total';
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
  const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === kickoffDate.toDateString();

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

  const baseNeedsHistory = Boolean(evaluation?.needsHistory ?? stats?.needsHistory ?? fixture.insufficientData);
  const h1NeedsHistory = marketGroupFilter === 'h1_total' && Boolean(stats?.needsH1History);
  const needsHistory = baseNeedsHistory || h1NeedsHistory;
  const abstentionReason = h1NeedsHistory
    ? 'Needs history: 1st half box score history unavailable for this matchup'
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
  const projTotalStr = !baseNeedsHistory && stats?.projectedTotal ? stats.projectedTotal.toFixed(1) : '—';
  const h1ProjStr =
    !baseNeedsHistory && !stats?.needsH1History && stats?.h1ProjectedTotal
      ? stats.h1ProjectedTotal.toFixed(1)
      : 'Needs history';

  const hasRealPrice = Boolean(
    displayPick &&
      !displayPick.isModelLine &&
      displayPick.marketOdds !== null &&
      displayPick.marketOdds !== undefined
  );

  const tierBadgeClass =
    displayPick?.tier === 'HIGH'
      ? 'bg-[#B8E636]/15 text-[#B8E636] border-[#B8E636]/40'
      : displayPick?.tier === 'MEDIUM'
      ? 'bg-[#E8B04A]/15 text-[#E8B04A] border-[#E8B04A]/40'
      : 'bg-[#101613] text-[#8B9892] border-[#1F2A24]';

  const probPct = displayPick ? (displayPick.calibratedProbability * 100).toFixed(1) : null;
  const probProgress = probPct ? Math.min(100, Math.max(0, parseFloat(probPct))) : 0;

  return (
    <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3 space-y-2 touch-press transition-transform duration-150">
      {/* Header: League & Season left, Local tip-off time + Bookmark right */}
      <div className="flex items-center justify-between text-[11px] text-[#8B9892] gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="font-semibold text-[#E9EFEB]">{leagueLabel}</span>
          <span className="text-[#5E6B65]">·</span>
          <span className="truncate">{seasonDisplay}</span>
          {stats?.neutral && (
            <span className="px-1.5 py-0.5 rounded-full text-[9.5px] bg-[#151D19] text-[#8B9892] border border-[#1F2A24]">
              Neutral
            </span>
          )}
          {!isFinished && !isPostponed && !isCanceled && !needsHistory && displayPick && !hasRealPrice && (
            <span className="px-1.5 py-0.5 rounded-full text-[9.5px] bg-[#151D19] text-[#8B9892] border border-[#1F2A24]">
              Awaiting lines
            </span>
          )}
          {isFinished && (
            <span className="px-1.5 py-0.5 rounded-full bg-[#B8E636]/12 text-[#B8E636] text-[9.5px] font-semibold border border-[#B8E636]/30">
              Final
            </span>
          )}
          {isLive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#B8E636]/12 text-[#B8E636] border border-[#B8E636]/40 text-[9.5px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B8E636] animate-pulse" />
              LIVE
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11.5px] font-[600] text-[#E9EFEB] tabular-nums" suppressHydrationWarning>
            {isFinished ? 'FT' : isLive ? 'LIVE' : isPostponed ? 'Postponed' : isCanceled ? 'Canceled' : timeStr}
          </span>
          <button
            onClick={handleToggleBookmark}
            type="button"
            className="w-6 h-6 flex items-center justify-center -mr-1 rounded-full hover:bg-[#151D19] transition-colors"
            title={isSaved ? 'Remove bookmark' : 'Bookmark game'}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark game'}
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

      <Link href={`/matches/${fixture.id}`} className="block space-y-2">
        {/* Matchup teams + Projected/Final score */}
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            {/* Home team */}
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <TeamCrest
                  canonicalTeamId={fixture.homeTeam.id}
                  crestUrl={fixture.homeTeam.crestUrl}
                  teamName={cleanDisplayText(homeName)}
                  size={24}
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-[600] text-[#E9EFEB] leading-tight truncate">
                    {cleanDisplayText(homeName)}
                  </span>
                  <span className="text-[10px] text-[#5E6B65] tabular-nums truncate">
                    {homeSubLine}
                  </span>
                </div>
              </div>
              <span className="text-[16px] leading-none tabular-nums font-[650] text-[#E9EFEB] shrink-0">
                {homeScoreDisplay}
              </span>
            </div>

            {/* Away team */}
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <TeamCrest
                  canonicalTeamId={fixture.awayTeam.id}
                  crestUrl={fixture.awayTeam.crestUrl}
                  teamName={cleanDisplayText(awayName)}
                  size={24}
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-[600] text-[#E9EFEB] leading-tight truncate">
                    {cleanDisplayText(awayName)}
                  </span>
                  <span className="text-[10px] text-[#5E6B65] tabular-nums truncate">
                    {awaySubLine}
                  </span>
                </div>
              </div>
              <span className="text-[16px] leading-none tabular-nums font-[650] text-[#E9EFEB] shrink-0">
                {awayScoreDisplay}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-0.5 text-[11px] font-[600] text-[#B8E636] px-2 py-1 rounded-full bg-[#B8E636]/10 hover:bg-[#B8E636]/20 transition-colors shrink-0">
            <span>Analysis</span>
            <ChevronRight className="w-3 h-3 text-[#B8E636]" strokeWidth={2.5} />
          </div>
        </div>

        {/* Inner model panel matching FixtureCard */}
        {needsHistory ? (
          <div className="bg-[#151D19] rounded-[10px] p-2.5 flex items-center justify-between gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-[#E8B04A]/12 text-[#E8B04A] border border-[#E8B04A]/30 font-semibold text-[10px] shrink-0">
              Needs history
            </span>
            <span className="text-[#8B9892] truncate">{cleanDisplayText(abstentionReason)}</span>
          </div>
        ) : displayPick ? (
          <div className="bg-[#151D19] rounded-[10px] p-2.5 space-y-1.5">
            {/* Row 1: Market family + Tier badge + Calibration status */}
            <div className="flex items-center justify-between text-[10.5px] gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[#8B9892] truncate">
                  {CATEGORY_SHORT_LABEL[displayPick.marketCategory]}
                </span>
                <span className={`px-1.5 py-0.2 rounded-full text-[9.5px] font-semibold border leading-tight ${tierBadgeClass}`}>
                  {displayPick.tier}
                </span>
              </div>
              <span className="text-[10.5px] text-[#8B9892] shrink-0">
                {hasRealPrice ? 'Priced' : 'Calibrated'}
              </span>
            </div>

            {/* Row 2: Line and side left, Calibrated probability right */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-[600] text-[#E9EFEB] truncate">
                {cleanDisplayText(displayPick.selection)} pts
              </span>
              {probPct && (
                <span className="text-[12.5px] font-[650] text-[#B8E636] tabular-nums shrink-0">
                  {probPct}%
                </span>
              )}
            </div>

            {/* Row 3: Real price & EV ONLY when real odds exist, else "Model line - no market price" */}
            <div className="flex items-center justify-between gap-2 text-[10.5px] tabular-nums">
              {hasRealPrice ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[#E9EFEB] truncate">
                    {displayPick.priceSource} @{displayPick.marketOdds?.toFixed(2)}
                  </span>
                  {displayPick.expectedValue !== null && (
                    <span className={`font-semibold shrink-0 ${displayPick.expectedValue >= 0 ? 'text-[#B8E636]' : 'text-[#8B9892]'}`}>
                      EV {displayPick.expectedValue >= 0 ? '+' : ''}{(displayPick.expectedValue * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-[#8B9892] truncate">
                  Model line - no market price
                </span>
              )}

              <span className="text-[#5E6B65] shrink-0">
                Proj {projTotalStr} · 1H {h1ProjStr}
              </span>
            </div>

            {/* Row 4: Probability bar */}
            {!isFinished && (
              <div className="w-full h-1 bg-[#101613] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-[#B8E636]"
                  style={{ width: `${probProgress}%` }}
                />
              </div>
            )}

            {/* Row 5: One-line evidence note */}
            {displayPick.evidenceLine && (
              <p
                className="text-[10.5px] text-[#8B9892] truncate pt-0.5"
                title={cleanDisplayText(displayPick.evidenceLine)}
              >
                {cleanDisplayText(displayPick.evidenceLine)}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-[#151D19] rounded-[10px] p-2.5 flex items-center justify-between text-[11px] text-[#8B9892] gap-2">
            <span>Awaiting lines · no qualified totals call</span>
            <span className="tabular-nums shrink-0 text-[#E9EFEB]">
              Proj {projTotalStr} · 1H {h1ProjStr}
            </span>
          </div>
        )}
      </Link>
    </div>
  );
}
