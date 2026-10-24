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
  const now = new Date();
  const isToday = kickoffDate.toDateString() === now.toDateString();
  const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === kickoffDate.toDateString();

  const localTime = kickoffDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const localDatePrefix = isToday ? '' : isTomorrow ? 'Tomorrow, ' : kickoffDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ';
  const timeStr = `${localDatePrefix}${localTime}`;

  const seasonDisplay = fixture.seasonYear || '2026-27';

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
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3 flex flex-col justify-between transition-transform duration-150 touch-press space-y-2">
        {/* Header: Dynamic season caption, local time or live status */}
        <div className="flex items-center justify-between text-[11.5px] text-[#8B9890]">
          <div className="flex items-center gap-1.5">
            <span>NBA · {seasonDisplay}</span>
          </div>

          <div>
            {isFinished ? (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-[#151E19] text-[#8B9890] border border-white/[0.07] font-medium">
                Final
              </span>
            ) : fixture.status === 'IN_PLAY' ? (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-[rgba(182,230,59,0.12)] text-[#B6E63B] border border-[#B6E63B]/40 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B6E63B] animate-pulse" />
                <span>LIVE</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-[#151E19] text-[#8B9890] border border-white/[0.07] font-medium tabular-nums">
                {timeStr}
              </span>
            )}
          </div>
        </div>

        {/* Teams and Scores */}
        <div className="space-y-1.5 pt-0.5">
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
                  className={`text-[13px] leading-tight truncate ${
                    homeIsWinner
                      ? 'font-[600] text-[#ECF1EE]'
                      : 'font-normal text-[#8B9890]'
                  }`}
                >
                  {cleanDisplayText(homeName)}
                </span>
                <span className="text-[10.5px] text-[#5E6A63] tabular-nums mt-0.5">
                  Off {homeOff} · Def {homeDef}
                </span>
              </div>
            </div>

            <span
              className={`text-[20px] leading-none tabular-nums ${
                homeIsWinner
                  ? 'font-[600] text-[#B6E63B]'
                  : 'font-normal text-[#8B9890]'
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
                  className={`text-[13px] leading-tight truncate ${
                    !homeIsWinner
                      ? 'font-[600] text-[#ECF1EE]'
                      : 'font-normal text-[#8B9890]'
                  }`}
                >
                  {cleanDisplayText(awayName)}
                </span>
                <span className="text-[10.5px] text-[#5E6A63] tabular-nums mt-0.5">
                  Off {awayOff} · Def {awayDef}
                </span>
              </div>
            </div>

            <span
              className={`text-[20px] leading-none tabular-nums ${
                !homeIsWinner
                  ? 'font-[600] text-[#B6E63B]'
                  : 'font-normal text-[#8B9890]'
              }`}
            >
              {awayScoreVal}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/[0.07] pt-1.5" />

        {/* Top Market Row: "Top market" caption + market name 13 semibold + % in accent + small neutral "82% conf" chip */}
        <div className="flex items-center justify-between text-[12.5px]">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-[10.5px] text-[#8B9890] font-normal shrink-0">Top market</span>
            <span className="font-[600] text-[#ECF1EE] truncate">
              {topMarketLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-[600] text-[#B6E63B] tabular-nums">
              {probVal}%
            </span>
            <span className="bg-[#151E19] text-[#8B9890] text-[10px] px-1.5 py-0.5 rounded-full font-medium tabular-nums border border-white/[0.07]">
              {confVal}% conf
            </span>
          </div>
        </div>

        {/* Last line: "Proj. total 216.4 · Line 224.5" muted left, "Margin 1.7 pts" semibold right */}
        <div className="flex items-center justify-between text-[11px] pt-0.5">
          <span className="text-[#8B9890] tabular-nums">
            Proj. total {projTotal} · Line {lineTotal}
          </span>
          <span className="font-[600] text-[#ECF1EE] tabular-nums text-[11.5px]">
            Margin {marginPts} pts
          </span>
        </div>
      </div>
    </Link>
  );
}
