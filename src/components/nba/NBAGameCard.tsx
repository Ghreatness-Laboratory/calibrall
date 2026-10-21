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
    <div className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] rounded-[12px] p-3.5 flex flex-col justify-between transition-all space-y-3">
      {/* Top Meta Header */}
      <div className="flex items-center justify-between text-[11px] text-[var(--text-3)] pb-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5 font-[550] text-[var(--text)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]" />
          <span>NBA Regular Season</span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[10.5px]">
          {isFinished ? (
            <span className="px-1.5 py-0.2 rounded-[4px] text-[9.5px] bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]">
              FINAL
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[var(--text-3)]">
              <Clock className="w-3 h-3 text-[var(--accent)]" strokeWidth={1.75} />
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
            <TeamCrest crestUrl={fixture.homeTeam.crestUrl} teamName={homeName} size={22} />
            <span className="text-[13px] font-[600] text-[var(--text)] truncate">
              {homeName}
            </span>
          </div>

          <div className="font-mono tabular-nums text-right shrink-0">
            {isFinished ? (
              <span className={`text-[14px] font-[600] ${
                (fixture.homeScore ?? 0) > (fixture.awayScore ?? 0) ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'
              }`}>
                {fixture.homeScore}
              </span>
            ) : stats ? (
              <div className="text-right">
                <span className="text-[13.5px] font-[600] text-[var(--accent)]">
                  {stats.homeProjected.toFixed(1)}
                </span>
                <span className="block text-[9.5px] text-[var(--text-3)]">proj</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Away Team Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <TeamCrest crestUrl={fixture.awayTeam.crestUrl} teamName={awayName} size={22} />
            <span className="text-[13px] font-[600] text-[var(--text)] truncate">
              {awayName}
            </span>
          </div>

          <div className="font-mono tabular-nums text-right shrink-0">
            {isFinished ? (
              <span className={`text-[14px] font-[600] ${
                (fixture.awayScore ?? 0) > (fixture.homeScore ?? 0) ? 'text-[var(--accent)]' : 'text-[var(--text-3)]'
              }`}>
                {fixture.awayScore}
              </span>
            ) : stats ? (
              <div className="text-right">
                <span className="text-[13.5px] font-[600] text-[var(--info)]">
                  {stats.awayProjected.toFixed(1)}
                </span>
                <span className="block text-[9.5px] text-[var(--text-3)]">proj</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Projections & Leans Footer */}
      {stats && (
        <div className="pt-2 border-t border-[var(--border)] space-y-1.5">
          {/* Proj Total & Margin */}
          <div className="flex items-center justify-between text-[10.5px] font-mono text-[var(--text-3)]">
            <span>
              Total: <strong className="text-[var(--text)] font-[600]">{stats.projectedTotal.toFixed(1)}</strong>
              {stats.sportsbookTotal && (
                <span className="text-[var(--text-3)]/80 ml-1">(O/U {stats.sportsbookTotal})</span>
              )}
            </span>
            <span>
              Margin: <strong className="text-[var(--text)] font-[600]">{stats.projectedMargin.toFixed(1)} pts</strong>
            </span>
          </div>

          {/* Winner Lean Chip */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-[var(--text-3)]">Winner lean:</span>
              <span className="px-2 py-0.5 rounded-[5px] text-[10.5px] font-[600] bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30">
                {stats.projectedWinner.split(' ').pop()}
              </span>
            </div>

            {stats.totalLean && (
              <span className="text-[10.5px] font-mono font-[550] text-[var(--info)]">
                Lean: {stats.totalLean}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
