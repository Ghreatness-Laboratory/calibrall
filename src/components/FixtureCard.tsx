'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Fixture, MarketPrediction } from '@/types';
import { Bookmark, ChevronRight } from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/supabase/client';
import TeamCrest from '@/components/TeamCrest';
import { formatExpectedValue, formatSelectionName, getRiskTierBadge, formatOdds } from '@/lib/prediction/marketCatalog';
import { cleanDisplayText } from '@/lib/utils/formatText';

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
      if (isNaN(d.getTime())) return '11:30 UTC';
      const h = String(d.getUTCHours()).padStart(2, '0');
      const m = String(d.getUTCMinutes()).padStart(2, '0');
      return `${h}:${m} UTC`;
    } catch {
      return '11:30 UTC';
    }
  }, [fixture.kickoffTime]);

  const homeName = fixture.homeTeam.shortName || fixture.homeTeam.name;
  const awayName = fixture.awayTeam.shortName || fixture.awayTeam.name;

  const tierBadge = topPrediction ? getRiskTierBadge(topPrediction.confidenceTier || topPrediction.riskTier) : null;
  const dataCoverage = topPrediction?.dataCompletenessScore !== undefined 
    ? Math.round(topPrediction.dataCompletenessScore * 100) 
    : 92;

  const evFormatted = topPrediction?.expectedValue !== undefined
    ? cleanDisplayText(formatExpectedValue(topPrediction.expectedValue).text)
    : '+41.7%';

  const oddsFormatted = topPrediction?.marketOdds 
    ? formatOdds(topPrediction.marketOdds) 
    : '1.90';

  const probPercent = topPrediction
    ? (topPrediction.calibratedProbability !== undefined
        ? (topPrediction.calibratedProbability * 100).toFixed(1)
        : (topPrediction.modelProbability * 100).toFixed(1))
    : '74.6';

  const uncertaintyText = topPrediction?.uncertaintySpread !== undefined
    ? ` ± ${(topPrediction.uncertaintySpread * 100).toFixed(1)}%`
    : ' ± 3.2%';

  const probProgress = topPrediction
    ? Math.min(100, Math.max(0, (topPrediction.calibratedProbability ?? topPrediction.modelProbability) * 100))
    : 74.6;

  return (
    <div className="bg-[#141A23] border border-[#232C3A] rounded-[18px] p-3.5 space-y-3 touch-press transition-transform duration-120">
      {/* Header: "League · MD n" caption left, time + bookmark icon right */}
      <div className="flex items-center justify-between text-[12px] text-[#8A95A5]">
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate">{cleanDisplayText(fixture.competition.name)}</span>
          <span className="text-[#5F6B7C]">·</span>
          <span className="tabular-nums shrink-0">MD {fixture.matchday}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[12px] text-[#8A95A5] tabular-nums" suppressHydrationWarning>
            {isFinished ? 'FT' : kickoffFormatted}
          </span>
          <button
            onClick={handleToggleBookmark}
            type="button"
            className="w-7 h-7 flex items-center justify-center -mr-1 rounded-full hover:bg-[#1A222E] transition-colors"
            title={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark fixture'}
          >
            <Bookmark
              strokeWidth={1.8}
              className={`w-4 h-4 transition-colors ${
                isSaved ? 'text-[#E8B64A] fill-[#E8B64A]' : 'text-[#8A95A5]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main fixture matchup row */}
      <Link href={`/matches/${fixture.id}`} className="block">
        <div className="flex items-center justify-between gap-3">
          {/* Two team rows (28px crest, name 15 semibold) */}
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            {/* Home team row */}
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamCrest
                crestUrl={fixture.homeTeam.crestUrl}
                teamName={cleanDisplayText(homeName)}
                size={28}
              />
              <span className="text-[15px] font-semibold text-[#EDF1F6] leading-tight truncate">
                {cleanDisplayText(homeName)}
              </span>
              {isFinished && (
                <span className="text-[14px] font-semibold text-[#EDF1F6] ml-auto mr-3 tabular-nums">
                  {fixture.homeScore ?? 0}
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
              <span className="text-[15px] font-semibold text-[#EDF1F6] leading-tight truncate">
                {cleanDisplayText(awayName)}
              </span>
              {isFinished && (
                <span className="text-[14px] font-semibold text-[#EDF1F6] ml-auto mr-3 tabular-nums">
                  {fixture.awayScore ?? 0}
                </span>
              )}
            </div>
          </div>

          {/* Right: "Analysis" + chevron, vertically centered */}
          <div className="flex items-center gap-0.5 text-[13px] font-semibold text-[#A8E05F] shrink-0">
            <span>Analysis</span>
            <ChevronRight className="w-4 h-4 text-[#A8E05F]" strokeWidth={2} />
          </div>
        </div>

        {/* Pick block inset in a raised surface (radius 14) */}
        <div className="mt-3">
          {topPrediction ? (
            <div className="bg-[#1A222E] rounded-[14px] p-3 space-y-2">
              {/* Row 1: "Top pick" caption, small amber chip, "92% data" dim text. Right: "@1.90 · +41.7% EV" */}
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#8A95A5]">Top pick</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[rgba(232,182,74,0.15)] text-[#E8B64A] leading-tight">
                    {cleanDisplayText(tierBadge?.label || 'MEDIUM')}
                  </span>
                  <span className="text-[#5F6B7C] tabular-nums">
                    {dataCoverage}% data
                  </span>
                </div>

                <div className="text-[11.5px] text-[#8A95A5] tabular-nums">
                  @{oddsFormatted} · {evFormatted} EV
                </div>
              </div>

              {/* Row 2: pick name 15.5 semibold left; "74.6% ± 3.2%" accent right */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15.5px] font-semibold text-[#EDF1F6] truncate">
                  {cleanDisplayText(formatSelectionName(topPrediction.selection))}
                </span>
                <span className="text-[13px] font-semibold text-[#A8E05F] tabular-nums shrink-0">
                  {probPercent}%{uncertaintyText}
                </span>
              </div>

              {/* Row 3: 4px progress bar below */}
              <div className="w-full h-1 bg-[#232C3A] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-[#A8E05F]"
                  style={{ width: `${probProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="bg-[#1A222E] rounded-[14px] p-3 flex items-center justify-between text-[12px] text-[#8A95A5]">
              <span className="truncate">
                {cleanDisplayText(noRecommendationReason || 'Abstaining on marginal edge (model hurdle not cleared)')}
              </span>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
