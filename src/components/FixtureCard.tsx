'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Fixture, MarketPrediction } from '@/types';
import { Bookmark, Clock, ArrowUpRight, AlertCircle, TrendingUp } from 'lucide-react';
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
    <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-2.5 transition-all duration-150 hover:border-white/[0.14] group touch-press">
      {/* Header row 11px muted: Competition name, Matchday, Clock + UTC time, Bookmark */}
      <div className="flex items-center justify-between text-[11px] text-[#8B9890]">
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate text-[#8B9890]">{fixture.competition.name}</span>
          <span className="text-[#5E6A63]">·</span>
          <span className="font-mono tabular-nums shrink-0">MD {fixture.matchday}</span>
          {derbyInfo && (
            <span className="ml-1 px-1.5 py-0.5 rounded-[4px] text-[9.5px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/25 truncate shrink-0">
              ⚡ {derbyInfo.name}
            </span>
          )}
          {fixture.hasCoachChange && (
            <span className="px-1.5 py-0.5 rounded-[4px] text-[9.5px] font-medium bg-[#E2AE45]/15 text-[#E2AE45] border border-[#E2AE45]/30 shrink-0">
              New Coach
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="flex items-center gap-1 font-mono text-[10.5px] text-[#5E6A63] tabular-nums" suppressHydrationWarning>
            <Clock className="w-3.5 h-3.5 text-[#5E6A63]" strokeWidth={2} />
            <span suppressHydrationWarning>
              {isFinished ? 'FT' : kickoffFormatted}
            </span>
          </span>
          <button
            onClick={handleToggleBookmark}
            type="button"
            className="min-w-[28px] min-h-[28px] flex items-center justify-center p-1 -mr-1 rounded-[6px] hover:bg-[#151E19] transition-colors"
            title={isSaved ? 'Remove from saved' : 'Save fixture'}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
          >
            <Bookmark
              strokeWidth={2}
              className={`w-3.5 h-3.5 transition-colors ${
                isSaved ? 'text-[#E2AE45] fill-[#E2AE45]' : 'text-[#5E6A63] hover:text-[#ECF1EE]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main fixture matchup row */}
      <Link href={`/matches/${fixture.id}`} className="block">
        <div className="grid grid-cols-12 items-center gap-2.5">
          {/* Teams column (8 cols): 22x22 crests, names at 13px weight 600 */}
          <div className="col-span-8 flex flex-col gap-2">
            {/* Home team row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-h-[24px] min-w-0">
                <TeamCrest
                  crestUrl={fixture.homeTeam.crestUrl}
                  teamName={homeName}
                  size={22}
                />
                <span className="text-[13px] font-semibold text-[#ECF1EE] leading-tight truncate group-hover:text-[#B6E63B] transition-colors">
                  {homeName}
                </span>
              </div>
              {isFinished && (
                <span className="font-mono text-[13px] font-semibold text-[#ECF1EE] ml-2 shrink-0 tabular-nums">
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
                <span className="text-[13px] font-semibold text-[#ECF1EE] leading-tight truncate group-hover:text-[#B6E63B] transition-colors">
                  {awayName}
                </span>
              </div>
              {isFinished && (
                <span className="font-mono text-[13px] font-semibold text-[#ECF1EE] ml-2 shrink-0 tabular-nums">
                  {fixture.awayScore ?? 0}
                </span>
              )}
            </div>
          </div>

          {/* Right column separated by a hairline */}
          <div className="col-span-4 border-l border-white/[0.07] pl-2.5 flex flex-col justify-center items-end text-right min-h-[48px]">
            <span className="text-[10px] text-[#5E6A63] truncate max-w-full font-mono">
              {fixture.venue ? fixture.venue.split(' ')[0] : 'Stadium'}
            </span>
            <div className="flex items-center gap-1 text-[11.5px] font-medium text-[#B6E63B] mt-1 group-hover:underline">
              <span>Analysis</span>
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            </div>
          </div>
        </div>

        {/* Top pick nested container: 11px radius, hairline border */}
        <div className="mt-2.5">
          {topPrediction ? (
            <div className="bg-[#151E19] rounded-[11px] border border-white/[0.07] hover:border-[#B6E63B]/30 p-2.5 space-y-1.5 transition-colors">
              {/* Row 1: "Top pick" + Risk tier badge, odds + EV in mono at right */}
              <div className="flex items-center justify-between text-[10.5px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#8B9890] font-medium">Top pick</span>
                  {tierBadge && (
                    <span className={`px-1.5 py-0.5 rounded-[4px] text-[9.5px] font-semibold tracking-wider ${tierBadge.badgeClass}`}>
                      {tierBadge.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono text-[10.5px] tabular-nums">
                  {topPrediction.marketOdds && (
                    <span className="text-[#ECF1EE] bg-[#101713] px-1.5 py-0.5 rounded-[4px] border border-white/[0.07]">
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
                <span className="text-[13px] font-semibold text-[#ECF1EE] truncate">
                  {formatSelectionName(topPrediction.selection)}
                </span>
                <span className="font-mono text-[12.5px] font-semibold text-[#B6E63B] shrink-0 tabular-nums">
                  {(topPrediction.modelProbability * 100).toFixed(1)}%
                </span>
              </div>

              {/* Row 3: Plain-English reason */}
              {topPrediction.plainEnglishReason && (
                <p className="text-[11.5px] text-[#8B9890] line-clamp-2 leading-relaxed">
                  {topPrediction.plainEnglishReason}
                </p>
              )}

              {/* Row 4: 3px probability bar */}
              <div className="w-full h-1 bg-[#101713] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-[#B6E63B]"
                  style={{
                    width: `${Math.min(100, Math.max(0, topPrediction.modelProbability * 100))}%`,
                  }}
                />
              </div>

              {/* Row 5: Substitute Option chip if present */}
              {topPrediction.substituteOption && (
                <div className="pt-1.5 mt-1 border-t border-white/[0.05] flex items-center justify-between text-[10.5px]">
                  <span className="text-[#B6E63B] font-medium flex items-center gap-1 truncate">
                    <TrendingUp className="w-3 h-3 shrink-0" strokeWidth={2} />
                    <span>Sub: {topPrediction.substituteOption.selection}</span>
                  </span>
                  <span className="font-mono text-[9.5px] text-[#5E6A63] shrink-0 ml-1 tabular-nums">
                    −{topPrediction.substituteOption.varianceReductionPct}% var
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#151E19] rounded-[11px] border border-white/[0.07] p-2.5 flex items-center gap-2 text-[#8B9890] text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 text-[#5E6A63] shrink-0" strokeWidth={2} />
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
