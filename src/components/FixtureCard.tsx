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
    <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-3.5 space-y-3 transition-colors hover:border-white/20 group">
      {/* Header row 11px muted: "Premier League · MD 28" left, clock icon + "16:30 UTC" + bookmark right */}
      <div className="flex items-center justify-between text-[11px] text-[#8fa69a]">
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate">{fixture.competition.name}</span>
          <span className="text-[#8fa69a]/60">·</span>
          <span className="font-mono shrink-0">MD {fixture.matchday}</span>
          {derbyInfo && (
            <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 truncate shrink-0">
              ⚡ {derbyInfo.name}
            </span>
          )}
          {fixture.hasCoachChange && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
              New Coach
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="flex items-center gap-1 font-mono text-[11px] text-[#8fa69a]" suppressHydrationWarning>
            <Clock className="w-3.5 h-3.5 text-[#8fa69a]" />
            <span suppressHydrationWarning>
              {isFinished ? 'Full time' : kickoffFormatted}
            </span>
          </span>
          <button
            onClick={handleToggleBookmark}
            type="button"
            className="p-1 -mr-1 rounded-[6px] hover:bg-white/[0.05] transition-colors"
            title={isSaved ? 'Remove from saved' : 'Save fixture'}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
          >
            <Bookmark
              className={`w-3.5 h-3.5 transition-colors ${
                isSaved ? 'text-[#e3b341] fill-[#e3b341]' : 'text-[#8fa69a] hover:text-[#e8efe9]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main fixture matchup row */}
      <Link href={`/matches/${fixture.id}`} className="block">
        <div className="grid grid-cols-12 items-center gap-3">
          {/* Teams column (8 cols): 24x24 crests, names at 14px/500 ("Arsenal", "Liverpool"), 10px between rows */}
          <div className="col-span-8 flex flex-col gap-[10px]">
            {/* Home team row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[10px] min-h-[24px] min-w-0">
                <TeamCrest
                  crestUrl={fixture.homeTeam.crestUrl}
                  teamName={homeName}
                  size={24}
                />
                <span className="text-[14px] font-[500] text-[#e8efe9] leading-tight truncate group-hover:text-[#b8e63a] transition-colors">
                  {homeName}
                </span>
              </div>
              {isFinished && (
                <span className="font-mono text-[13px] text-[#e8efe9] ml-2 shrink-0">
                  {fixture.homeScore ?? 0}
                </span>
              )}
            </div>

            {/* Away team row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[10px] min-h-[24px] min-w-0">
                <TeamCrest
                  crestUrl={fixture.awayTeam.crestUrl}
                  teamName={awayName}
                  size={24}
                />
                <span className="text-[14px] font-[500] text-[#e8efe9] leading-tight truncate group-hover:text-[#b8e63a] transition-colors">
                  {awayName}
                </span>
              </div>
              {isFinished && (
                <span className="font-mono text-[13px] text-[#e8efe9] ml-2 shrink-0">
                  {fixture.awayScore ?? 0}
                </span>
              )}
            </div>
          </div>

          {/* Right column separated by a hairline: venue (11px muted) and "Market intel" link with arrow-up-right */}
          <div className="col-span-4 border-l border-white/[0.08] pl-3 flex flex-col justify-center items-end text-right min-h-[58px]">
            <span className="text-[11px] text-[#8fa69a] truncate max-w-full">
              {fixture.venue ? fixture.venue.split(' ')[0] : 'Stadium'}
            </span>
            <div className="flex items-center gap-1 text-[12px] font-[500] text-[#b8e63a] mt-1 group-hover:underline">
              <span>Market intel</span>
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
            </div>
          </div>
        </div>

        {/* Top pick: nested panel with a subtle border */}
        <div className="mt-3">
          {topPrediction ? (
            <div className="bg-[#0a1812]/70 rounded-[8px] border border-white/[0.12] hover:border-[#b8e63a]/30 p-2.5 space-y-2 transition-colors">
              {/* Row 1: "Top pick" + Risk tier badge, odds + EV in mono at right */}
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#8fa69a] font-medium">Top pick</span>
                  {tierBadge && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${tierBadge.badgeClass}`}>
                      {tierBadge.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  {topPrediction.marketOdds && (
                    <span className="text-[#e8efe9] bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/10">
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

              {/* Row 2: pick name (14px/500), probability in mono at right */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-[500] text-[#e8efe9] truncate">
                  {formatSelectionName(topPrediction.selection)}
                </span>
                <span className="font-mono text-[13px] font-semibold text-[#b8e63a] shrink-0">
                  {(topPrediction.modelProbability * 100).toFixed(1)}%
                </span>
              </div>

              {/* Row 3: Plain-English reason */}
              {topPrediction.plainEnglishReason && (
                <p className="text-[11px] text-[#8fa69a] line-clamp-2 leading-relaxed">
                  {topPrediction.plainEnglishReason}
                </p>
              )}

              {/* Row 4: 4px probability bar beneath filled to probability */}
              <div className="w-full h-1 bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    topPrediction.riskTier === 'SAFE' 
                      ? 'bg-[#b8e63a]' 
                      : topPrediction.riskTier === 'MODERATE' 
                      ? 'bg-[#e3b341]' 
                      : topPrediction.riskTier === 'RISKY' 
                      ? 'bg-orange-400' 
                      : 'bg-purple-400'
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(0, topPrediction.modelProbability * 100))}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="bg-[#0a1812]/50 rounded-[8px] border border-white/[0.06] p-2.5 flex items-center gap-2 text-[#8fa69a] text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 text-[#8fa69a] shrink-0" />
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
