'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Fixture, MarketPrediction } from '@/types';
import { Bookmark, Clock, ChevronRight, CheckCircle2, AlertCircle, ArrowUpRight } from 'lucide-react';
import { toggleStoredSavedFixture, getStoredSavedFixtures } from '@/lib/supabase/client';

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

  React.useEffect(() => {
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
  const kickoffFormatted = React.useMemo(() => {
    try {
      const d = new Date(fixture.kickoffTime);
      if (isNaN(d.getTime())) return '16:00 UTC';
      const h = String(d.getUTCHours()).padStart(2, '0');
      const m = String(d.getUTCMinutes()).padStart(2, '0');
      return `${h}:${m} UTC`;
    } catch {
      return '16:00 UTC';
    }
  }, [fixture.kickoffTime]);

  return (
    <div className="bg-surface-200 border border-border hover:border-gray-500/50 transition-all rounded overflow-hidden group">
      {/* Top micro bar */}
      <div className="px-3 py-2 bg-surface-100 border-b border-border/80 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <img
            src={fixture.competition.emblemUrl}
            alt={fixture.competition.name}
            className="w-4 h-4 object-contain"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <span className="font-semibold text-gray-300 text-[11px] uppercase tracking-wider">
            {fixture.competition.name}
          </span>
          <span className="text-gray-600">•</span>
          <span className="text-[11px] text-gray-400 font-mono">MD {fixture.matchday}</span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="flex items-center space-x-1 text-[11px] font-mono text-gray-400" suppressHydrationWarning>
            <Clock className="w-3 h-3 text-gray-500" />
            <span suppressHydrationWarning>
              {isFinished ? 'FULL TIME' : kickoffFormatted}
            </span>
          </span>
          <button
            onClick={handleToggleBookmark}
            className={`p-1 rounded hover:bg-surface-50 transition-colors ${
              isSaved ? 'text-brand-amber' : 'text-gray-500 hover:text-gray-300'
            }`}
            title={isSaved ? 'Remove from Saved' : 'Save Fixture'}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-brand-amber' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Fixture Body */}
      <Link href={`/matches/${fixture.id}`} className="block p-4">
        <div className="grid grid-cols-12 items-center gap-3">
          {/* Teams column (8 cols) */}
          <div className="col-span-8 space-y-2.5">
            {/* Home Team */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <img
                  src={fixture.homeTeam.crestUrl}
                  alt={fixture.homeTeam.name}
                  className="w-6 h-6 object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <span className="font-bold text-sm text-white group-hover:text-brand-emerald transition-colors">
                  {fixture.homeTeam.name}
                </span>
              </div>
              {isFinished && (
                <span className="font-mono text-base font-bold text-white px-2">
                  {fixture.homeScore ?? 0}
                </span>
              )}
            </div>

            {/* Away Team */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <img
                  src={fixture.awayTeam.crestUrl}
                  alt={fixture.awayTeam.name}
                  className="w-6 h-6 object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <span className="font-bold text-sm text-white group-hover:text-brand-emerald transition-colors">
                  {fixture.awayTeam.name}
                </span>
              </div>
              {isFinished && (
                <span className="font-mono text-base font-bold text-white px-2">
                  {fixture.awayScore ?? 0}
                </span>
              )}
            </div>
          </div>

          {/* Action indicator (4 cols) */}
          <div className="col-span-4 border-l border-border-subtle pl-3 text-right flex flex-col justify-center items-end">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Market Intel</span>
            <div className="flex items-center text-xs text-brand-emerald font-semibold mt-1">
              <span>Inspect</span>
              <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
            </div>
          </div>
        </div>

        {/* Top Recommendation Bar */}
        <div className="mt-3.5 pt-3 border-t border-border-subtle/80 flex items-center justify-between text-xs">
          {topPrediction ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/30">
                <CheckCircle2 className="w-3 h-3 mr-1 shrink-0" />
                TOP PICK: {topPrediction.selection}
              </span>
              <span className="font-mono text-gray-300 text-[11px]">
                {(topPrediction.modelProbability * 100).toFixed(1)}% prob
                {topPrediction.expectedValue ? ` (+${(topPrediction.expectedValue * 100).toFixed(1)}% EV)` : ''}
              </span>
              {topPrediction.stateTags && topPrediction.stateTags.length > 0 && (
                <span className="hidden sm:inline-flex text-[9px] font-mono text-gray-400 bg-surface-100 px-1.5 py-0.5 rounded border border-border">
                  #{topPrediction.stateTags[0]}
                </span>
              )}
              {topPrediction.lineupStatus === 'pre-lineup' && (
                <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-1 rounded border border-amber-500/20">
                  Pre-Lineup
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 text-gray-400 text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 text-gray-500" />
              <span>No strong market recommendation (Insufficient statistical edge)</span>
            </div>
          )}

          <div className="text-[10px] text-gray-500 font-mono">
            {fixture.venue ? fixture.venue.split(' ')[0] : 'League'}
          </div>
        </div>
      </Link>
    </div>
  );
}
