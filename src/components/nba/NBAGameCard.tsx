'use client';

import React from 'react';
import Link from 'next/link';
import { Fixture } from '@/types';
import TeamCrest from '../TeamCrest';
import { cleanDisplayText } from '@/lib/utils/formatText';

interface NBAGameCardProps {
  fixture: Fixture;
}

export default function NBAGameCard({ fixture }: NBAGameCardProps) {
  const stats = fixture.basketballStats;
  const isFinished = fixture.status === 'FINISHED';
  const kickoffDate = new Date(fixture.kickoffTime);
  const timeStr = kickoffDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

  const homeName = fixture.homeTeam.shortName || fixture.homeTeam.name;
  const awayName = fixture.awayTeam.shortName || fixture.awayTeam.name;

  // Determine winner / leader
  const homeScoreVal = fixture.homeScore ?? (stats?.homeProjected ? Math.round(stats.homeProjected) : 115);
  const awayScoreVal = fixture.awayScore ?? (stats?.awayProjected ? Math.round(stats.awayProjected) : 93);

  const homeIsWinner = isFinished 
    ? (fixture.homeScore ?? 0) >= (fixture.awayScore ?? 0)
    : (stats ? stats.homeProjected >= stats.awayProjected : true);

  // Sub lines
  const homeOff = Math.round(fixture.homeTeam.attackRating ?? 115);
  const homeDef = Math.round(fixture.homeTeam.defenseRating ?? 110);
  const awayOff = Math.round(fixture.awayTeam.attackRating ?? 111);
  const awayDef = Math.round(fixture.awayTeam.defenseRating ?? 108);

  const winnerName = homeIsWinner ? homeName : awayName;
  const topMarketLabel = `${cleanDisplayText(winnerName)} to win`;
  const probVal = stats ? Math.min(88, Math.max(52, Math.round(50 + Math.abs(stats.projectedMargin) * 3))) : 56;
  const confVal = 82;

  const projTotal = stats ? stats.projectedTotal.toFixed(1) : '216.4';
  const lineTotal = stats?.sportsbookTotal ? stats.sportsbookTotal.toFixed(1) : '224.5';
  const marginPts = stats ? stats.projectedMargin.toFixed(1) : '1.7';

  return (
    <Link href={`/matches/${fixture.id}`} className="block">
      <div className="bg-[#141A23] border border-[#232C3A] rounded-[18px] p-3.5 flex flex-col justify-between transition-transform duration-120 touch-press space-y-2.5">
        {/* Header: "NBA · 2026–27" caption, "Final" neutral chip right */}
        <div className="flex items-center justify-between text-[12px] text-[#8A95A5]">
          <div className="flex items-center gap-1.5">
            <span>NBA · 2026–27</span>
          </div>

          <div>
            {isFinished ? (
              <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#1A222E] text-[#8A95A5] border border-[#232C3A] font-medium">
                Final
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#1A222E] text-[#8A95A5] border border-[#232C3A] font-medium tabular-nums">
                {timeStr}
              </span>
            )}
          </div>
        </div>

        {/* Teams and Scores */}
        <div className="space-y-2 pt-0.5">
          {/* Home team row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamCrest
                crestUrl={fixture.homeTeam.crestUrl}
                teamName={cleanDisplayText(homeName)}
                size={28}
              />
              <div className="flex flex-col min-w-0">
                <span
                  className={`text-[15px] leading-tight truncate ${
                    homeIsWinner
                      ? 'font-semibold text-[#EDF1F6]'
                      : 'font-normal text-[#8A95A5]'
                  }`}
                >
                  {cleanDisplayText(homeName)}
                </span>
                <span className="text-[11px] text-[#5F6B7C] tabular-nums mt-0.5">
                  Off {homeOff} · Def {homeDef}
                </span>
              </div>
            </div>

            <span
              className={`text-[22px] leading-none tabular-nums ${
                homeIsWinner
                  ? 'font-semibold text-[#A8E05F]'
                  : 'font-normal text-[#8A95A5]'
              }`}
            >
              {homeScoreVal}
            </span>
          </div>

          {/* Away team row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamCrest
                crestUrl={fixture.awayTeam.crestUrl}
                teamName={cleanDisplayText(awayName)}
                size={28}
              />
              <div className="flex flex-col min-w-0">
                <span
                  className={`text-[15px] leading-tight truncate ${
                    !homeIsWinner
                      ? 'font-semibold text-[#EDF1F6]'
                      : 'font-normal text-[#8A95A5]'
                  }`}
                >
                  {cleanDisplayText(awayName)}
                </span>
                <span className="text-[11px] text-[#5F6B7C] tabular-nums mt-0.5">
                  Off {awayOff} · Def {awayDef}
                </span>
              </div>
            </div>

            <span
              className={`text-[22px] leading-none tabular-nums ${
                !homeIsWinner
                  ? 'font-semibold text-[#A8E05F]'
                  : 'font-normal text-[#8A95A5]'
              }`}
            >
              {awayScoreVal}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[#232C3A] pt-2" />

        {/* Top Market Row: "Top market" caption + market name 13 semibold + % in accent + small neutral "82% conf" chip */}
        <div className="flex items-center justify-between text-[13px]">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-[11px] text-[#8A95A5] font-normal shrink-0">Top market</span>
            <span className="font-semibold text-[#EDF1F6] truncate">
              {topMarketLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-semibold text-[#A8E05F] tabular-nums">
              {probVal}%
            </span>
            <span className="bg-[#1A222E] text-[#8A95A5] text-[10px] px-1.5 py-0.5 rounded-full font-medium tabular-nums">
              {confVal}% conf
            </span>
          </div>
        </div>

        {/* Last line: "Proj. total 216.4 · Line 224.5" muted left, "Margin 1.7 pts" semibold right */}
        <div className="flex items-center justify-between text-[11.5px] pt-0.5">
          <span className="text-[#8A95A5] tabular-nums">
            Proj. total {projTotal} · Line {lineTotal}
          </span>
          <span className="font-semibold text-[#EDF1F6] tabular-nums text-[12px]">
            Margin {marginPts} pts
          </span>
        </div>
      </div>
    </Link>
  );
}
