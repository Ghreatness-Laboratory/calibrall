'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Fixture, MarketPrediction } from '@/types';
import { Bookmark, Clock, ArrowUpRight, AlertCircle } from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/supabase/client';
import TeamCrest from '@/components/TeamCrest';
import { formatExpectedValue, formatSelectionName, getRiskTierBadge, formatOdds } from '@/lib/prediction/marketCatalog';
import { checkDerby } from '@/lib/prediction/contextFactors';

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
  const kickoffFormatted = useMemo(() => {
    try {
      const d = new Date(fixture.kickoffTime);
      if (isNaN(d.getTime())) return '16:30 UTC';
      const h = String(d.getUTCHours()).padStart(2, '0');
      const m = String(d.getUTCMinutes()).padStart(2, '0');
      return `${h}:${m} UTC`;
    } catch {
      return '16:30 UTC';
    }
  }, [fixture.kickoffTime]);

  const homeName = fixture.homeTeam.shortName || fixture.homeTeam.name;
  const awayName = fixture.awayTeam.shortName || fixture.awayTeam.name;

  const derbyInfo = useMemo(() => {
    if (fixture.isDerby && fixture.derbyName) {
      return { name: fixture.derbyName };
    }
    return checkDerby(fixture.homeTeam.name, fixture.awayTeam.name);
  }, [fixture]);

  const tierBadge = topPrediction ? getRiskTierBadge(topPrediction.riskTier) : null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-3.5 space-y-2.5 transition-colors hover:border-[var(--border-strong)] group">
      {/* Header row 11px muted: "Premier League · MD 28" left, clock icon + "16:30 UTC" + bookmark right */}
      <div className="flex items-center justify-between text-[11px] text-[var(--text-3)]">
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate text-[var(--text-2)]">{fixture.competition.name}</span>
          <span className="text-[var(--text-3)]/60">·</span>
          <span className="font-mono shrink-0">MD {fixture.matchday}</span>
          {derbyInfo && (
            <span className="ml-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-[600] bg-rose-500/15 text-rose-300 border border-rose-500/25 truncate shrink-0">
              ⚡ {derbyInfo.name}
            </span>
          )}
          {fixture.hasCoachChange && (
            <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">
              New Coach
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="flex items-center gap-1 font-mono text-[10.5px] text-[var(--text-3)]" suppressHydrationWarning>
            <Clock className="w-3.5 h-3.5 text-[var(--text-3)]" strokeWidth={1.75} />
            <span suppressHydrationWarning>
              {isFinished ? 'Full time' : kickoffFormatted}
            </span>
          </span>
          <button
            onClick={handleToggleBookmark}
            type="button"
            className="p-1 -mr-1 rounded-[6px] hover:bg-[var(--surface-2)] transition-colors"
            title={isSaved ? 'Remove from saved' : 'Save fixture'}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
          >
            <Bookmark
              strokeWidth={1.75}
              className={`w-3.5 h-3.5 transition-colors ${
                isSaved ? 'text-[var(--warn)] fill-[var(--warn)]' : 'text-[var(--text-3)] hover:text-[var(--text)]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main fixture matchup row */}
      <Link href={`/matches/${fixture.id}`} className="block">
        <div className="grid grid-cols-12 items-center gap-2.5">
          {/* Teams column (8 cols): 24x24 crests, names at 13px/600 */}
          <div className="col-span-8 flex flex-col gap-2">
            {/* Home team row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-h-[24px] min-w-0">
                <TeamCrest
                  crestUrl={fixture.homeTeam.crestUrl}
                  teamName={homeName}
                  size={22}
                />
                <span className="text-[13px] font-[600] text-[var(--text)] leading-tight truncate group-hover:text-[var(--accent)] transition-colors">
                  {homeName}
                </span>
              </div>
              {isFinished && (
                <span className="font-mono text-[12.5px] text-[var(--text)] ml-2 shrink-0">
                  {fixture.homeScore ?? 0}
                </span>
              )}
            </div>

            {/* Away team row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-h-[24px] min-w-0">
                <TeamCrest
                  crestUrl={fixture.awayTeam.crestUrl}
                  teamName={awayName}
                  size={22}
                />
                <span className="text-[13px] font-[600] text-[var(--text)] leading-tight truncate group-hover:text-[var(--accent)] transition-colors">
                  {awayName}
                </span>
              </div>
              {isFinished && (
                <span className="font-mono text-[12.5px] text-[var(--text)] ml-2 shrink-0">
                  {fixture.awayScore ?? 0}
                </span>
              )}
            </div>
          </div>

          {/* Right column separated by a hairline */}
          <div className="col-span-4 border-l border-[var(--border)] pl-2.5 flex flex-col justify-center items-end text-right min-h-[52px]">
            <span className="text-[10.5px] text-[var(--text-3)] truncate max-w-full">
              {fixture.venue ? fixture.venue.split(' ')[0] : 'Stadium'}
            </span>
            <div className="flex items-center gap-1 text-[11.5px] font-[550] text-[var(--accent)] mt-1 group-hover:underline">
              <span>Market intel</span>
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            </div>
          </div>
        </div>

        {/* Top pick: nested panel with a subtle border */}
        <div className="mt-2.5">
          {topPrediction ? (
            <div className="bg-[var(--surface-2)] rounded-[8px] border border-[var(--border)] hover:border-[var(--accent)]/30 p-2.5 space-y-1.5 transition-colors">
              {/* Row 1: "Top pick" + Risk tier badge, odds + EV in mono at right */}
              <div className="flex items-center justify-between text-[10.5px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--text-3)] font-medium">Top pick</span>
                  {tierBadge && (
                    <span className={`px-1.5 py-0.5 rounded-[4px] text-[9.5px] font-[600] tracking-wider ${tierBadge.badgeClass}`}>
                      {tierBadge.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono text-[10.5px]">
                  {topPrediction.marketOdds && (
                    <span className="text-[var(--text)] bg-[var(--surface)] px-1.5 py-0.5 rounded-[4px] border border-[var(--border)]">
                      @{formatOdds(topPrediction.marketOdds)}
                    </span>
                  )}
                  {topPrediction.expectedValue !== undefined && (
                    <span className={formatExpectedValue(topPrediction.expectedValue).colorClass}>
                      {formatExpectedValue(topPrediction.expectedValue).text} EV
                    </span>
                  )}
                </div>
              </div>

              {/* Row 2: pick name (13px/600), probability in mono at right */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-[600] text-[var(--text)] truncate">
                  {formatSelectionName(topPrediction.selection)}
                </span>
                <span className="font-mono text-[12.5px] font-[600] text-[var(--accent)] shrink-0">
                  {(topPrediction.modelProbability * 100).toFixed(1)}%
                </span>
              </div>

              {/* Row 3: Plain-English reason */}
              {topPrediction.plainEnglishReason && (
                <p className="text-[11.5px] text-[var(--text-3)] line-clamp-2 leading-relaxed">
                  {topPrediction.plainEnglishReason}
                </p>
              )}

              {/* Row 4: 3px probability bar beneath filled to probability */}
              <div className="w-full h-1 bg-[var(--surface)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-[var(--accent)]"
                  style={{
                    width: `${Math.min(100, Math.max(0, topPrediction.modelProbability * 100))}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="bg-[var(--surface-2)] rounded-[8px] border border-[var(--border)] p-2.5 flex items-center gap-2 text-[var(--text-3)] text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 text-[var(--text-3)] shrink-0" strokeWidth={1.75} />
              <span className="truncate">
                {noRecommendationReason || 'No strong recommendation (Abstaining on marginal edge)'}
              </span>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
