'use client';

import React from 'react';
import Link from 'next/link';
import { Fixture } from '@/types';
import { Clock, Calendar, TrendingUp, ShieldCheck, CheckCircle2 } from 'lucide-react';
import TeamCrest from '../TeamCrest';

interface NBAGameCardProps {
  fixture: Fixture;
}

export default function NBAGameCard({ fixture }: NBAGameCardProps) {
  const stats = fixture.basketballStats;
  const isFinished = fixture.status === 'FINISHED';
  const kickoffDate = new Date(fixture.kickoffTime);
  const timeStr = kickoffDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
  const dateStr = kickoffDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

  const homeName = fixture.homeTeam.name;
  const awayName = fixture.awayTeam.name;

  return (
    <div className="bg-[#0f2219] border border-white/[0.08] hover:border-white/[0.16] rounded-[12px] p-4 flex flex-col justify-between transition-all space-y-3.5">
      {/* Top Meta Header */}
      <div className="flex items-center justify-between text-[11px] text-[#8fa69a] pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5 font-medium text-[#e8efe9]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#b8e63a]" />
          <span>NBA Regular Season</span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          {isFinished ? (
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/10 text-[#e8efe9]">
              FINAL
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[#8fa69a]">
              <Clock className="w-3 h-3 text-[#b8e63a]" />
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
            <TeamCrest crestUrl={fixture.homeTeam.crestUrl} teamName={homeName} size={24} />
            <span className="text-[13px] font-[500] text-[#e8efe9] truncate">
              {homeName}
            </span>
          </div>

          <div className="font-mono tabular-nums text-right shrink-0">
            {isFinished ? (
              <span className={`text-[15px] font-[600] ${
                (fixture.homeScore ?? 0) > (fixture.awayScore ?? 0) ? 'text-[#b8e63a]' : 'text-[#8fa69a]'
              }`}>
                {fixture.homeScore}
              </span>
            ) : stats ? (
              <div className="text-right">
                <span className="text-[14px] font-[600] text-[#b8e63a]">
                  {stats.homeProjected.toFixed(1)}
                </span>
                <span className="block text-[10px] text-[#8fa69a]">proj</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Away Team Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <TeamCrest crestUrl={fixture.awayTeam.crestUrl} teamName={awayName} size={24} />
            <span className="text-[13px] font-[500] text-[#e8efe9] truncate">
              {awayName}
            </span>
          </div>

          <div className="font-mono tabular-nums text-right shrink-0">
            {isFinished ? (
              <span className={`text-[15px] font-[600] ${
                (fixture.awayScore ?? 0) > (fixture.homeScore ?? 0) ? 'text-[#b8e63a]' : 'text-[#8fa69a]'
              }`}>
                {fixture.awayScore}
              </span>
            ) : stats ? (
              <div className="text-right">
                <span className="text-[14px] font-[600] text-[#5eb6e8]">
                  {stats.awayProjected.toFixed(1)}
                </span>
                <span className="block text-[10px] text-[#8fa69a]">proj</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Projections & Leans Footer */}
      {stats && (
        <div className="pt-2 border-t border-white/[0.06] space-y-2">
          {/* Proj Total & Margin */}
          <div className="flex items-center justify-between text-[11px] font-mono text-[#8fa69a]">
            <span>
              Total: <strong className="text-[#e8efe9] font-semibold">{stats.projectedTotal.toFixed(1)}</strong>
              {stats.sportsbookTotal && (
                <span className="text-[#8fa69a]/70 ml-1">(O/U {stats.sportsbookTotal})</span>
              )}
            </span>
            <span>
              Margin: <strong className="text-[#e8efe9] font-semibold">{stats.projectedMargin.toFixed(1)} pts</strong>
            </span>
          </div>

          {/* Winner Lean Chip */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-[#8fa69a]">Winner lean:</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#b8e63a]/15 text-[#b8e63a] border border-[#b8e63a]/30">
                {stats.projectedWinner.split(' ').pop()}
              </span>
            </div>

            {stats.totalLean && (
              <span className="text-[11px] font-mono font-medium text-[#5eb6e8]">
                Lean: {stats.totalLean}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
