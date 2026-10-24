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
    <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-3">
      {/* Title & subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between pb-2.5 border-b border-white/[0.07] gap-2">
        <div>
          <h4 className="text-[14px] font-semibold text-[#ECF1EE]">
            Scoreline distribution matrix
          </h4>
          <p className="text-[11.5px] text-[#8B9890] mt-0.5 leading-normal">
            Bivariate Poisson joint probabilities, low score adjusted (tau &#8722;0.13). Values in %.
          </p>
        </div>

        {/* xG line in mono 12px sentence case */}
        <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
          <span className="text-[#B6E63B]">{cleanHome} xG {homeXg.toFixed(2)}</span>
          <span className="text-[#E2AE45]">{cleanAway} xG {awayXg.toFixed(2)}</span>
        </div>
      </div>

      {/* 1/X/2 summary: 3 equal cards */}
      <div className="grid grid-cols-3 gap-2 text-left">
        <div className="p-2.5 rounded-[11px] bg-[#151E19] border border-white/[0.07]">
          <span className="text-[10.5px] text-[#8B9890] block leading-tight">Home win</span>
          <span
            className={`text-[15px] font-semibold font-mono tabular-nums mt-0.5 block ${
              highestOutcome === 'HOME' ? 'text-[#B6E63B]' : 'text-[#ECF1EE]'
            }`}
          >
            {(result.homeWin * 100).toFixed(1)}%
          </span>
        </div>

        <div className="p-2.5 rounded-[11px] bg-[#151E19] border border-white/[0.07]">
          <span className="text-[10.5px] text-[#8B9890] block leading-tight">Draw</span>
          <span
            className={`text-[15px] font-semibold font-mono tabular-nums mt-0.5 block ${
              highestOutcome === 'DRAW' ? 'text-[#B6E63B]' : 'text-[#ECF1EE]'
            }`}
          >
            {(result.draw * 100).toFixed(1)}%
          </span>
        </div>

        <div className="p-2.5 rounded-[11px] bg-[#151E19] border border-white/[0.07]">
          <span className="text-[10.5px] text-[#8B9890] block leading-tight">Away win</span>
          <span
            className={`text-[15px] font-semibold font-mono tabular-nums mt-0.5 block ${
              highestOutcome === 'AWAY' ? 'text-[#B6E63B]' : 'text-[#ECF1EE]'
            }`}
          >
            {(result.awayWin * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Matrix grid: 7 columns (20px label column + 6 equal columns for 0 to 5 goals) */}
      <div className="w-full">
        {/* Axis labels */}
        <div className="text-[10.5px] text-[#8B9890] text-center mb-1 font-mono">
          {cleanAway} goals →
        </div>

        {/* 7 Columns Header */}
        <div className="grid grid-cols-[20px_repeat(6,minmax(0,1fr))] gap-[2px] text-center text-[10px] font-mono text-[#8B9890] mb-[2px]">
          <div className="h-6 flex items-center justify-center">H\A</div>
          {[0, 1, 2, 3, 4, 5].map((a) => (
            <div key={a} className="h-6 flex items-center justify-center font-semibold">
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
              <div className="text-[10.5px] text-[#8B9890] font-semibold flex items-center justify-center">
                {h}
              </div>
              {[0, 1, 2, 3, 4, 5].map((a) => {
                const prob = result.matrix[h][a];
                const pct = prob * 100;
                const alpha = 0.05 + (prob / maxP) * 0.65;
                const isDark = alpha > 0.40;
                const isDiagonal = h === a;

                return (
                  <div
                    key={a}
                    style={{ backgroundColor: `rgba(182, 230, 59, ${alpha})` }}
                    className={`h-7 rounded-[4px] flex items-center justify-center select-none ${
                      isDiagonal ? 'ring-[0.5px] ring-white/20' : ''
                    } ${isDark ? 'text-[#0A0F0D] font-bold' : 'text-[#ECF1EE] font-medium'}`}
                    title={`${cleanHome} ${h} to ${a} ${cleanAway}: ${pct.toFixed(2)}%`}
                  >
                    {pct >= 0.5 ? pct.toFixed(1) : '<0.5'}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="text-[10.5px] text-[#8B9890] text-center mt-1 font-mono">
          Rows: {cleanHome} goals
        </div>
      </div>

      {/* Most likely exact scores */}
      <div className="pt-2 border-t border-white/[0.07] flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="text-[#8B9890] shrink-0 font-medium">Most likely scores:</span>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] tabular-nums">
          {result.mostLikelyScorelines.slice(0, 4).map((sc, i) => {
            const isFirst = i === 0;
            return (
              <span
                key={i}
                className={`px-2 py-0.5 rounded-[6px] border leading-tight ${
                  isFirst
                    ? 'border-[#B6E63B]/40 text-[#B6E63B] bg-[rgba(182,230,59,0.12)] font-semibold'
                    : 'border-white/[0.07] text-[#ECF1EE] bg-[#151E19]'
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
