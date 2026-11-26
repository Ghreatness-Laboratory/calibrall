'use client';

import React from 'react';
import { generateScorelineDistribution } from '@/lib/prediction/math';

interface Props {
  homeTeamName: string;
  awayTeamName: string;
  homeXg: number;
  awayXg: number;
}

export default function ScorelineMatrix({
  homeTeamName,
  awayTeamName,
  homeXg,
  awayXg,
}: Props) {
  const maxGoals = 5;
  const result = generateScorelineDistribution(homeXg, awayXg, maxGoals);

  const cleanHome = homeTeamName.split(' ')[0];
  const cleanAway = awayTeamName.split(' ')[0];

  let maxP = 0.001;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      if (result.matrix[h][a] > maxP) maxP = result.matrix[h][a];
    }
  }

  const highestOutcome =
    result.homeWin >= result.draw && result.homeWin >= result.awayWin
      ? 'HOME'
      : result.draw >= result.awayWin
      ? 'DRAW'
      : 'AWAY';

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3.5">
      {/* Title & subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between pb-3 border-b border-[var(--line)] gap-2">
        <div>
          <h4 className="font-display text-[14px] font-semibold text-[var(--text)]">
            Scoreline distribution matrix
          </h4>
          <p className="text-[11.5px] text-[var(--text-2)] mt-0.5 leading-normal">
            Bivariate Poisson joint probabilities, low score adjusted (tau −0.13). Values in %.
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11.5px] font-medium tabular-nums shrink-0">
          <span className="text-[var(--accent)]">{cleanHome} xG {homeXg.toFixed(2)}</span>
          <span className="text-[var(--medium)]">{cleanAway} xG {awayXg.toFixed(2)}</span>
        </div>
      </div>

      {/* 1/X/2 summary: 3 equal cards */}
      <div className="grid grid-cols-3 gap-2 text-left">
        <div className="p-2.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)]">
          <span className="text-[10.5px] text-[var(--text-2)] block leading-tight">Home win</span>
          <span
            className={`font-display text-[16px] font-bold tabular-nums mt-0.5 block ${
              highestOutcome === 'HOME' ? 'text-[var(--accent)]' : 'text-[var(--text)]'
            }`}
          >
            {(result.homeWin * 100).toFixed(1)}%
          </span>
        </div>

        <div className="p-2.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)]">
          <span className="text-[10.5px] text-[var(--text-2)] block leading-tight">Draw</span>
          <span
            className={`font-display text-[16px] font-bold tabular-nums mt-0.5 block ${
              highestOutcome === 'DRAW' ? 'text-[var(--accent)]' : 'text-[var(--text)]'
            }`}
          >
            {(result.draw * 100).toFixed(1)}%
          </span>
        </div>

        <div className="p-2.5 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)]">
          <span className="text-[10.5px] text-[var(--text-2)] block leading-tight">Away win</span>
          <span
            className={`font-display text-[16px] font-bold tabular-nums mt-0.5 block ${
              highestOutcome === 'AWAY' ? 'text-[var(--accent)]' : 'text-[var(--text)]'
            }`}
          >
            {(result.awayWin * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Matrix grid: 7 columns */}
      <div className="w-full">
        <div className="text-[10.5px] text-[var(--text-2)] text-center mb-1.5 font-medium">
          {cleanAway} goals →
        </div>

        <div className="grid grid-cols-[22px_repeat(6,minmax(0,1fr))] gap-[3px] text-center text-[10.5px] text-[var(--text-2)] mb-[3px] tabular-nums">
          <div className="h-6 flex items-center justify-center">H\A</div>
          {[0, 1, 2, 3, 4, 5].map((a) => (
            <div key={a} className="h-6 flex items-center justify-center font-semibold">
              {a}
            </div>
          ))}
        </div>

        <div className="space-y-[3px]">
          {[0, 1, 2, 3, 4, 5].map((h) => (
            <div
              key={h}
              className="grid grid-cols-[22px_repeat(6,minmax(0,1fr))] gap-[3px] items-center text-center text-[11px] tabular-nums"
            >
              <div className="text-[10.5px] text-[var(--text-2)] font-semibold flex items-center justify-center">
                {h}
              </div>
              {[0, 1, 2, 3, 4, 5].map((a) => {
                const prob = result.matrix[h][a];
                const pct = prob * 100;
                const alpha = 0.06 + (prob / maxP) * 0.65;
                const isHighHeat = alpha > 0.38;
                const isDiagonal = h === a;

                return (
                  <div
                    key={a}
                    style={{ backgroundColor: `rgba(166, 224, 74, ${alpha})` }}
                    className={`h-7 rounded-[6px] flex items-center justify-center select-none ${
                      isDiagonal ? 'ring-1 ring-[var(--line)]' : ''
                    } ${isHighHeat ? 'text-[#0A0E0D] font-bold' : 'text-[var(--text)] font-medium'}`}
                    title={`${cleanHome} ${h} to ${a} ${cleanAway}: ${pct.toFixed(2)}%`}
                  >
                    {pct >= 0.5 ? pct.toFixed(1) : '<0.5'}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="text-[10.5px] text-[var(--text-2)] text-center mt-1.5 font-medium">
          Rows: {cleanHome} goals
        </div>
      </div>

      {/* Most likely exact scores */}
      <div className="pt-3 border-t border-[var(--line)] flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="text-[var(--text-2)] shrink-0 font-medium">Most likely scores:</span>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums">
          {result.mostLikelyScorelines.slice(0, 4).map((sc, i) => {
            const isFirst = i === 0;
            return (
              <span
                key={i}
                className={`px-2.5 py-1 rounded-full border leading-tight ${
                  isFirst
                    ? 'border-[var(--accent)]/35 text-[var(--accent)] bg-[var(--accent-soft)] font-semibold'
                    : 'border-[var(--line)] text-[var(--text)] bg-[var(--surface-2)]'
                }`}
              >
                {sc.home} to {sc.away} · {(sc.probability * 100).toFixed(1)}%
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
