'use client';

import React from 'react';
import Link from 'next/link';
import { Fixture } from '@/types';
import { Clock } from 'lucide-react';
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

  const homeName = fixture.homeTeam.name;
  const awayName = fixture.awayTeam.name;

  return (
    <Link href={`/matches/${fixture.id}`} className="block">
      <div className="bg-[#101713] border border-white/[0.07] hover:border-white/[0.14] rounded-[14px] p-3.5 flex flex-col justify-between transition-all duration-150 space-y-3 touch-press">
        {/* Top Meta Header */}
        <div className="flex items-center justify-between text-[11px] text-[#8B9890] pb-2 border-b border-white/[0.07]">
          <div className="flex items-center gap-1.5 font-medium text-[#ECF1EE]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B6E63B]" />
            <span>NBA Regular Season</span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10.5px] tabular-nums">
            {isFinished ? (
              <span className="px-1.5 py-0.5 rounded-[4px] text-[9.5px] bg-[#151E19] text-[#ECF1EE] border border-white/[0.07]">
                FINAL
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[#5E6A63]">
                <Clock className="w-3 h-3 text-[#5E6A63]" strokeWidth={2} />
                <span>{timeStr}</span>
              </span>
            )}
          </div>
        </div>

        {/* Teams & Projected Score / Final Score */}
        <div className="space-y-2">
          {/* Home Team Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamCrest crestUrl={fixture.homeTeam.crestUrl} teamName={cleanDisplayText(homeName)} size={22} />
              <span className="text-[13px] font-semibold text-[#ECF1EE] truncate">
                {cleanDisplayText(homeName)}
              </span>
            </div>

            <div className="font-mono tabular-nums text-right shrink-0">
              {isFinished ? (
                <span className={`text-[13.5px] font-semibold ${
                  (fixture.homeScore ?? 0) > (fixture.awayScore ?? 0) ? 'text-[#B6E63B]' : 'text-[#8B9890]'
                }`}>
                  {fixture.homeScore}
                </span>
              ) : stats ? (
                <div className="text-right">
                  <span className="text-[13px] font-semibold text-[#B6E63B]">
                    {stats.homeProjected.toFixed(1)}
                  </span>
                  <span className="block text-[9.5px] text-[#5E6A63]">proj</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Away Team Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamCrest crestUrl={fixture.awayTeam.crestUrl} teamName={cleanDisplayText(awayName)} size={22} />
              <span className="text-[13px] font-semibold text-[#ECF1EE] truncate">
                {cleanDisplayText(awayName)}
              </span>
            </div>

            <div className="font-mono tabular-nums text-right shrink-0">
              {isFinished ? (
                <span className={`text-[13.5px] font-semibold ${
                  (fixture.awayScore ?? 0) > (fixture.homeScore ?? 0) ? 'text-[#B6E63B]' : 'text-[#8B9890]'
                }`}>
                  {fixture.awayScore}
                </span>
              ) : stats ? (
                <div className="text-right">
                  <span className="text-[13px] font-semibold text-[#5aa9e6]">
                    {stats.awayProjected.toFixed(1)}
                  </span>
                  <span className="block text-[9.5px] text-[#5E6A63]">proj</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Projections & Leans Footer */}
        {stats && (
          <div className="pt-2 border-t border-white/[0.07] space-y-1.5">
            <div className="flex items-center justify-between text-[10.5px] font-mono text-[#8B9890] tabular-nums">
              <span>
                Total: <strong className="text-[#ECF1EE] font-semibold">{stats.projectedTotal.toFixed(1)}</strong>
                {stats.sportsbookTotal && (
                  <span className="text-[#5E6A63] ml-1">(O/U {stats.sportsbookTotal})</span>
                )}
              </span>
              <span>
                Margin: <strong className="text-[#ECF1EE] font-semibold">{stats.projectedMargin.toFixed(1)} pts</strong>
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-[#8B9890]">Winner lean:</span>
                <span className="px-2 py-0.5 rounded-[5px] text-[10.5px] font-semibold bg-[rgba(182,230,59,0.12)] text-[#B6E63B] border border-[#B6E63B]/30">
                  {cleanDisplayText(stats.projectedWinner.split(' ').pop() || '')}
                </span>
              </div>

              {stats.totalLean && (
                <span className="text-[10.5px] font-mono font-medium text-[#5aa9e6]">
                  Lean: {cleanDisplayText(stats.totalLean)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
