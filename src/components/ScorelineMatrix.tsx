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

  // Find max probability in the matrix for color scaling
  let maxP = 0.001;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      if (result.matrix[h][a] > maxP) maxP = result.matrix[h][a];
    }
  }

  return (
    <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/[0.08] gap-2">
        <div>
          <h4 className="text-[14px] font-[500] text-[#e8efe9]">Dixon-Coles scoreline distribution matrix</h4>
          <p className="text-[12px] text-[#8fa69a]">
            Bivariate Poisson joint probabilities adjusted for low-scoring football outcomes (tau parameter: -0.13)
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-[#8fa69a]">
          <span>{homeTeamName.split(' ')[0]} xG: {homeXg.toFixed(2)}</span>
          <span>{awayTeamName.split(' ')[0]} xG: {awayXg.toFixed(2)}</span>
        </div>
      </div>

      {/* Probability Summary Pills */}
      <div className="grid grid-cols-3 gap-2 text-center font-mono text-[12px]">
        <div className="p-2 rounded-[8px] bg-[#0a1812] border border-white/[0.06]">
          <span className="text-[10px] text-[#8fa69a] block">Home win (1)</span>
          <span className="text-[15px] font-[500] text-[#b8e63a]">{(result.homeWin * 100).toFixed(1)}%</span>
        </div>
        <div className="p-2 rounded-[8px] bg-[#0a1812] border border-white/[0.06]">
          <span className="text-[10px] text-[#8fa69a] block">Draw (X)</span>
          <span className="text-[15px] font-[500] text-[#e8efe9]">{(result.draw * 100).toFixed(1)}%</span>
        </div>
        <div className="p-2 rounded-[8px] bg-[#0a1812] border border-white/[0.06]">
          <span className="text-[10px] text-[#8fa69a] block">Away win (2)</span>
          <span className="text-[15px] font-[500] text-[#8fa69a]">{(result.awayWin * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* Heatmap Matrix */}
      <div className="overflow-x-auto">
        <div className="min-w-[340px]">
          <div className="text-[11px] font-mono text-center text-[#8fa69a] mb-1">
            Away team goals ({awayTeamName}) →
          </div>
          <table className="w-full text-center text-[11px] border-collapse">
            <thead>
              <tr>
                <th className="p-1 font-mono text-[#8fa69a] text-[10px]">H \ A</th>
                {[0, 1, 2, 3, 4, 5].map(a => (
                  <th key={a} className="p-1 font-mono text-[#8fa69a] font-[500]">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4, 5].map(h => (
                <tr key={h}>
                  <td className="p-1 font-mono text-[#8fa69a] font-[500]">
                    {h}
                  </td>
                  {[0, 1, 2, 3, 4, 5].map(a => {
                    const prob = result.matrix[h][a];
                    const pct = prob * 100;
                    const intensity = Math.min(1, prob / maxP);
                    const isDraw = h === a;
                    const isHomeWin = h > a;

                    const bgStyle = isHomeWin
                      ? `rgba(184, 230, 58, ${0.05 + intensity * 0.45})`
                      : isDraw
                      ? `rgba(232, 239, 233, ${0.04 + intensity * 0.3})`
                      : `rgba(227, 179, 65, ${0.04 + intensity * 0.35})`;

                    return (
                      <td
                        key={a}
                        style={{ backgroundColor: bgStyle }}
                        className="p-1.5 border border-[#0a1812] rounded-[3px] cursor-default font-mono text-[11px]"
                        title={`${h} - ${a}: ${pct.toFixed(2)}%`}
                      >
                        <span className="text-[#e8efe9] font-[500]">
                          {pct > 0.5 ? `${pct.toFixed(1)}%` : '<0.5%'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top 3 exact scores */}
      <div className="pt-2.5 border-t border-white/[0.06] flex flex-wrap items-center justify-between text-[11px] text-[#8fa69a] gap-2">
        <span>Most probable exact scores:</span>
        <div className="flex items-center gap-2 font-mono">
          {result.mostLikelyScorelines.slice(0, 3).map((sc, i) => (
            <span key={i} className="px-2 py-0.5 rounded-[4px] bg-[#0a1812] border border-white/[0.06] text-[#e8efe9]">
              {sc.home} - {sc.away} <span className="text-[#b8e63a]">({(sc.probability * 100).toFixed(1)}%)</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
