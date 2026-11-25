'use client';

import React from 'react';
import Link from 'next/link';
import { Fixture } from '@/types';
import TeamCrest from '../TeamCrest';
import { cleanDisplayText } from '@/lib/utils/formatText';
import type { BasketballGameEvaluation } from '@/lib/basketball/picker';

interface NBAGameCardProps {
  fixture: Fixture;
  evaluation?: BasketballGameEvaluation;
}

export default function NBAGameCard({ fixture, evaluation }: NBAGameCardProps) {
  const stats = fixture.basketballStats;
  const isFinished = fixture.status === 'FINISHED';
  const isLive = fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED';
  const kickoffDate = new Date(fixture.kickoffTime);
  const now = new Date();
  const isToday = kickoffDate.toDateString() === now.toDateString();
  const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === kickoffDate.toDateString();

  const localTime = kickoffDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const localDatePrefix = isToday
    ? ''
    : isTomorrow
    ? 'Tomorrow, '
    : kickoffDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ';
  const timeStr = `${localDatePrefix}${localTime}`;

  const leagueCode = stats?.league || fixture.competition?.code || 'NBA';
  const seasonDisplay = cleanDisplayText(fixture.seasonYear || '2026 to 2027');
  const needsHistory = Boolean(evaluation?.needsHistory ?? stats?.needsHistory ?? fixture.insufficientData);
  const abstentionReason = evaluation?.abstentionReason || stats?.abstentionReason || 'Needs history';

  const homeName = fixture.homeTeam.shortName || fixture.homeTeam.name;
  const awayName = fixture.awayTeam.shortName || fixture.awayTeam.name;

  const hasFinalScores =
    (isFinished || isLive) &&
    fixture.homeScore !== null &&
    fixture.homeScore !== undefined &&
    fixture.awayScore !== null &&
    fixture.awayScore !== undefined;

  const homeScoreDisplay = hasFinalScores
    ? String(fixture.homeScore)
    : !needsHistory && stats?.homeProjected
    ? stats.homeProjected.toFixed(1)
    : '—';
  const awayScoreDisplay = hasFinalScores
    ? String(fixture.awayScore)
    : !needsHistory && stats?.awayProjected
    ? stats.awayProjected.toFixed(1)
    : '—';

  const homeSubLine =
    !needsHistory && stats?.homeOff && stats?.homeDef
      ? `Avg ${stats.homeOff.toFixed(1)} for · ${stats.homeDef.toFixed(1)} against${stats.homeIsB2B ? ' · B2B' : stats.homeRestDays !== null && stats.homeRestDays !== undefined ? ` · ${stats.homeRestDays}d rest` : ''}`
      : 'Awaiting minimum team sample';

  const awaySubLine =
    !needsHistory && stats?.awayOff && stats?.awayDef
      ? `Avg ${stats.awayOff.toFixed(1)} for · ${stats.awayDef.toFixed(1)} against${stats.awayIsB2B ? ' · B2B' : stats.awayRestDays !== null && stats.awayRestDays !== undefined ? ` · ${stats.awayRestDays}d rest` : ''}`
      : 'Awaiting minimum team sample';

  const topPick = evaluation?.topPick || null;
  const projTotalStr = !needsHistory && stats?.projectedTotal ? stats.projectedTotal.toFixed(1) : '—';
  const h1ProjStr =
    !needsHistory && !stats?.needsH1History && stats?.h1ProjectedTotal
      ? stats.h1ProjectedTotal.toFixed(1)
      : 'Needs history';

  const tierBadgeClass =
    topPick?.tier === 'HIGH'
      ? 'bg-[#B6E63B]/15 text-[#B6E63B] border-[#B6E63B]/40'
      : topPick?.tier === 'MEDIUM'
      ? 'bg-[#E8B04A]/15 text-[#E8B04A] border-[#E8B04A]/40'
      : 'bg-[#151E19] text-[#8B9890] border-white/[0.07]';

  return (
    <Link href={`/matches/${fixture.id}`} className="block">
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3 flex flex-col justify-between transition-transform duration-150 touch-press space-y-2">
        {/* Header: League, Neutral tag if applicable, local time or status */}
        <div className="flex items-center justify-between text-[11.5px] text-[#8B9890] gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-[#ECF1EE]">{leagueCode}</span>
            <span>·</span>
            <span className="truncate">{seasonDisplay}</span>
            {stats?.neutral && (
              <span className="px-1.5 py-0.5 rounded-[5px] text-[9.5px] bg-[#151E19] text-[#8B9890] border border-white/[0.08]">
                Neutral
              </span>
            )}
          </div>

          <div className="shrink-0">
            {isFinished ? (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-[#151E19] text-[#8B9890] border border-white/[0.07] font-medium">
                Final
              </span>
            ) : isLive ? (
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

        {/* Teams and Final/Projected Points */}
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamCrest
                canonicalTeamId={fixture.homeTeam.id}
                crestUrl={fixture.homeTeam.crestUrl}
                teamName={cleanDisplayText(homeName)}
                size={28}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-[600] text-[#ECF1EE] leading-tight truncate">
                  {cleanDisplayText(homeName)}
                </span>
                <span className="text-[10.5px] text-[#5E6A63] tabular-nums mt-0.5 truncate">
                  {homeSubLine}
                </span>
              </div>
            </div>

            <span className="text-[19px] leading-none tabular-nums font-[600] text-[#ECF1EE] shrink-0">
              {homeScoreDisplay}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamCrest
                canonicalTeamId={fixture.awayTeam.id}
                crestUrl={fixture.awayTeam.crestUrl}
                teamName={cleanDisplayText(awayName)}
                size={28}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-[600] text-[#ECF1EE] leading-tight truncate">
                  {cleanDisplayText(awayName)}
                </span>
                <span className="text-[10.5px] text-[#5E6A63] tabular-nums mt-0.5 truncate">
                  {awaySubLine}
                </span>
              </div>
            </div>

            <span className="text-[19px] leading-none tabular-nums font-[600] text-[#ECF1EE] shrink-0">
              {awayScoreDisplay}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/[0.07] pt-1.5" />

        {/* Honest Empty State vs Calibrated Totals Pick */}
        {needsHistory ? (
          <div className="flex items-center justify-between gap-2 text-[11.5px]">
            <span className="px-2 py-0.5 rounded-full bg-[#E8B04A]/12 text-[#E8B04A] border border-[#E8B04A]/30 font-semibold text-[10.5px] shrink-0">
              Needs history
            </span>
            <span className="text-[#8B9890] truncate">{cleanDisplayText(abstentionReason)}</span>
          </div>
        ) : topPick ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[12.5px] gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10.5px] text-[#8B9890] shrink-0">Top total</span>
                <span className="font-[600] text-[#ECF1EE] truncate">
                  {cleanDisplayText(topPick.selection)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-[600] text-[#B6E63B] tabular-nums">
                  {(topPick.calibratedProbability * 100).toFixed(1)}%
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${tierBadgeClass}`}>
                  {topPick.tier}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#8B9890] pt-0.5 gap-2">
              <span className="tabular-nums truncate">
                {topPick.isModelLine
                  ? topPick.priceSource
                  : `${topPick.priceSource} @${topPick.marketOdds?.toFixed(2)}${
                      topPick.expectedValue !== null
                        ? ` · EV ${topPick.expectedValue >= 0 ? '+' : ''}${(topPick.expectedValue * 100).toFixed(1)}%`
                        : ''
                    }`}
              </span>
              <span className="tabular-nums shrink-0 text-[#ECF1EE]">
                Proj {projTotalStr} · 1H {h1ProjStr}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11.5px] text-[#8B9890] gap-2">
            <span>No qualified totals pick</span>
            <span className="tabular-nums shrink-0 text-[#ECF1EE]">
              Proj {projTotalStr} · 1H {h1ProjStr}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
