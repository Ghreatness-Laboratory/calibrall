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

  // Short clean names
  const cleanHome = homeTeamName.split(' ')[0];
  const cleanAway = awayTeamName.split(' ')[0];

  // Find max probability in the matrix for color scaling
  let maxP = 0.001;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      if (result.matrix[h][a] > maxP) maxP = result.matrix[h][a];
    }
  }

  // Determine highest 1X2 outcome
  const highestOutcome =
    result.homeWin >= result.draw && result.homeWin >= result.awayWin
      ? 'HOME'
      : result.draw >= result.awayWin
      ? 'DRAW'
      : 'AWAY';

  return (
    <div className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] p-4 space-y-3.5">
      {/* Title & subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between pb-3 border-b-[0.5px] border-white/[0.08] gap-2">
        <div>
          <h4 className="text-[15px] font-[500] text-[#e8efe9]">
            Scoreline distribution matrix
          </h4>
          <p className="text-[12px] text-[#8fa69a] mt-0.5 leading-normal">
            Bivariate Poisson joint probabilities, low score adjusted (tau &#8722;0.13). Values in %.
          </p>
        </div>

        {/* xG line in mono 12px sentence case */}
        <div className="flex items-center gap-3 text-[12px] font-mono shrink-0">
          <span className="text-[#5eb6e8]">{cleanHome} xG {homeXg.toFixed(2)}</span>
          <span className="text-[#e3b341]">{cleanAway} xG {awayXg.toFixed(2)}</span>
        </div>
      </div>

      {/* 1/X/2 summary: 3 equal cards (8px gap, 10px padding, 8px radius) */}
      <div className="grid grid-cols-3 gap-2 text-left">
        <div className="p-2.5 rounded-[8px] bg-[#0c1c14] border-[0.5px] border-white/[0.08]">
          <span className="text-[11px] text-[#8fa69a] block leading-tight">Home win</span>
          <span
            className={`text-[16px] font-[500] font-mono tabular-nums mt-0.5 block ${
              highestOutcome === 'HOME' ? 'text-[#b8e63a]' : 'text-[#e8efe9]'
            }`}
          >
            {(result.homeWin * 100).toFixed(1)}%
          </span>
        </div>

        <div className="p-2.5 rounded-[8px] bg-[#0c1c14] border-[0.5px] border-white/[0.08]">
          <span className="text-[11px] text-[#8fa69a] block leading-tight">Draw</span>
          <span
            className={`text-[16px] font-[500] font-mono tabular-nums mt-0.5 block ${
              highestOutcome === 'DRAW' ? 'text-[#b8e63a]' : 'text-[#e8efe9]'
            }`}
          >
            {(result.draw * 100).toFixed(1)}%
          </span>
        </div>

        <div className="p-2.5 rounded-[8px] bg-[#0c1c14] border-[0.5px] border-white/[0.08]">
          <span className="text-[11px] text-[#8fa69a] block leading-tight">Away win</span>
          <span
            className={`text-[16px] font-[500] font-mono tabular-nums mt-0.5 block ${
              highestOutcome === 'AWAY' ? 'text-[#b8e63a]' : 'text-[#e8efe9]'
            }`}
          >
            {(result.awayWin * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Matrix grid: 7 columns (20px label column + 6 equal columns for 0 to 5 goals) */}
      <div className="w-full">
        {/* Axis labels */}
        <div className="text-[11px] text-[#8fa69a] text-center mb-1">
          {cleanAway} goals →
        </div>

        {/* 7 Columns Header */}
        <div className="grid grid-cols-[20px_repeat(6,minmax(0,1fr))] gap-[2px] text-center text-[11px] font-mono text-[#8fa69a] mb-[2px]">
          <div className="h-6 flex items-center justify-center text-[10px]">H\A</div>
          {[0, 1, 2, 3, 4, 5].map((a) => (
            <div key={a} className="h-6 flex items-center justify-center font-[500]">
              {a}
            </div>
          ))}
        </div>

        {/* 6 Rows */}
        <div className="space-y-[2px]">
          {[0, 1, 2, 3, 4, 5].map((h) => (
            <div
              key={h}
              className="grid grid-cols-[20px_repeat(6,minmax(0,1fr))] gap-[2px] items-center text-center font-mono text-[11px] tabular-nums"
            >
              <div className="text-[11px] text-[#8fa69a] font-[500] flex items-center justify-center">
                {h}
              </div>
              {[0, 1, 2, 3, 4, 5].map((a) => {
                const prob = result.matrix[h][a];
                const pct = prob * 100;
                const alpha = 0.04 + (prob / maxP) * 0.6;
                const isDark = alpha > 0.38;
                const isDiagonal = h === a;

                return (
                  <div
                    key={a}
                    style={{ backgroundColor: `rgba(184, 230, 58, ${alpha})` }}
                    className={`h-7 rounded-[3px] flex items-center justify-center select-none ${
                      isDiagonal ? 'ring-[0.5px] ring-white/20' : ''
                    } ${isDark ? 'text-[#0a1812] font-[600]' : 'text-[#e8efe9] font-[500]'}`}
                    title={`${cleanHome} ${h} to ${a} ${cleanAway}: ${pct.toFixed(2)}%`}
                  >
                    {pct >= 0.5 ? pct.toFixed(1) : '<0.5'}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="text-[11px] text-[#8fa69a] text-center mt-1">
          Rows: {cleanHome} goals
        </div>
      </div>

      {/* Most likely exact scores */}
      <div className="pt-2 border-t-[0.5px] border-white/[0.06] flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-[#8fa69a] shrink-0">Most likely scores:</span>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[12px] tabular-nums">
          {result.mostLikelyScorelines.slice(0, 4).map((sc, i) => {
            const isFirst = i === 0;
            return (
              <span
                key={i}
                className={`px-2 py-0.5 rounded-[6px] border-[0.5px] leading-tight ${
                  isFirst
                    ? 'border-[#b8e63a]/40 text-[#b8e63a] bg-[#b8e63a]/10 font-[500]'
                    : 'border-white/10 text-[#e8efe9] bg-[#0c1c14]'
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
