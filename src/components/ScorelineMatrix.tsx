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
    <div className="bg-surface-200 border border-border rounded p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-border">
        <div>
          <h4 className="text-sm font-bold text-white">Dixon-Coles Scoreline Distribution Matrix</h4>
          <p className="text-xs text-gray-400">
            Bivariate Poisson joint probabilities adjusted for low-scoring football outcomes (tau parameter: -0.13)
          </p>
        </div>
        <div className="flex items-center space-x-3 text-xs mt-2 sm:mt-0 font-mono">
          <span className="text-brand-blue">{homeTeamName.split(' ')[0]} xG: {homeXg.toFixed(2)}</span>
          <span className="text-brand-amber">{awayTeamName.split(' ')[0]} xG: {awayXg.toFixed(2)}</span>
        </div>
      </div>

      {/* Probability Summary Pills */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center font-mono text-xs">
        <div className="p-2 rounded bg-surface-100 border border-border">
          <span className="text-[10px] text-gray-400 block uppercase">Home Win (1)</span>
          <span className="text-base font-bold text-brand-emerald">{(result.homeWin * 100).toFixed(1)}%</span>
        </div>
        <div className="p-2 rounded bg-surface-100 border border-border">
          <span className="text-[10px] text-gray-400 block uppercase">Draw (X)</span>
          <span className="text-base font-bold text-brand-blue">{(result.draw * 100).toFixed(1)}%</span>
        </div>
        <div className="p-2 rounded bg-surface-100 border border-border">
          <span className="text-[10px] text-gray-400 block uppercase">Away Win (2)</span>
          <span className="text-base font-bold text-brand-amber">{(result.awayWin * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* Heatmap Matrix */}
      <div className="overflow-x-auto">
        <div className="min-w-[340px]">
          <div className="text-[11px] font-mono text-center text-gray-400 mb-1">
            Away Team Goals ({awayTeamName}) →
          </div>
          <table className="w-full text-center text-xs border-collapse">
            <thead>
              <tr>
                <th className="p-1 text-[10px] font-mono text-gray-500 uppercase">H \ A</th>
                {[0, 1, 2, 3, 4, 5].map(a => (
                  <th key={a} className="p-1 text-[11px] font-mono font-bold text-gray-300">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4, 5].map(h => (
                <tr key={h}>
                  <td className="p-1 text-[11px] font-mono font-bold text-gray-300">
                    {h}
                  </td>
                  {[0, 1, 2, 3, 4, 5].map(a => {
                    const prob = result.matrix[h][a];
                    const pct = prob * 100;
                    const intensity = Math.min(1, prob / maxP);
                    const isDraw = h === a;
                    const isHomeWin = h > a;

                    // Compute background color intensity
                    const bgStyle = isHomeWin
                      ? `rgba(16, 185, 129, ${0.08 + intensity * 0.7})`
                      : isDraw
                      ? `rgba(59, 130, 246, ${0.08 + intensity * 0.7})`
                      : `rgba(245, 158, 11, ${0.08 + intensity * 0.7})`;

                    return (
                      <td
                        key={a}
                        style={{ backgroundColor: bgStyle }}
                        className="p-1.5 border border-[#0a0d14] rounded-sm transition-transform hover:scale-110 hover:z-10 cursor-default"
                        title={`${h} - ${a}: ${pct.toFixed(2)}%`}
                      >
                        <span className="font-mono text-[11px] font-semibold text-white drop-shadow">
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

      {/* Top 3 most probable exact scores */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-gray-400">
        <span className="font-medium text-gray-300">Most Probable Exact Scores:</span>
        <div className="flex items-center space-x-2 font-mono text-[11px]">
          {result.mostLikelyScorelines.slice(0, 3).map((sc, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-surface-100 border border-border text-white">
              {sc.home} - {sc.away} <span className="text-brand-emerald">({(sc.probability * 100).toFixed(1)}%)</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
