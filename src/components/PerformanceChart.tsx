'use client';

import React from 'react';
import { CalibrationBucket } from '@/types';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  buckets: CalibrationBucket[];
  brierScore: number;
  logLoss: number;
  hitRate: number;
  roi: number;
}

export default function PerformanceChart({
  buckets,
  brierScore,
  logLoss,
  hitRate,
  roi,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Metrics: 2x2 grid (4 across on desktop), 8px gap, cards with 12px padding and 8px radius */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="p-3 bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[8px]">
          <span className="text-[11px] text-[#8fa69a] block mb-1 text-left">Settled predictions</span>
          <span className="text-[22px] font-[500] text-[#e8efe9] font-mono tabular-nums leading-tight block">
            420
          </span>
          <span className="text-[10px] text-[#8fa69a] block mt-1">Out-of-sample sample</span>
        </div>

        <div className="p-3 bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[8px]">
          <span className="text-[11px] text-[#8fa69a] block mb-1 text-left">Overall hit rate</span>
          <span className="text-[22px] font-[500] text-[#b8e63a] font-mono tabular-nums leading-tight block">
            {(hitRate * 100).toFixed(1)}%
          </span>
          <span className="text-[10px] text-[#8fa69a] block mt-1">All qualified picks</span>
        </div>

        <div className="p-3 bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[8px]">
          <span className="text-[11px] text-[#8fa69a] block mb-1 text-left">Brier calibration</span>
          <span className="text-[22px] font-[500] text-[#e8efe9] font-mono tabular-nums leading-tight block">
            {brierScore.toFixed(3)}
          </span>
          <span className="text-[10px] text-[#b8e63a] block mt-1">Benchmark &lt; 0.20 (Good)</span>
        </div>

        <div className="p-3 bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[8px]">
          <span className="text-[11px] text-[#8fa69a] block mb-1 text-left">Level-stake ROI</span>
          <span className="text-[22px] font-[500] text-[#b8e63a] font-mono tabular-nums leading-tight block">
            +{(roi * 100).toFixed(1)}%
          </span>
          <span className="text-[10px] text-[#8fa69a] block mt-1">Flat 1-unit flat staking</span>
        </div>
      </div>

      {/* Probability Calibration Reliability Plot */}
      <div className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] p-4 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-[0.5px] border-white/[0.08] gap-2">
          <div>
            <h4 className="text-[15px] font-[500] text-[#e8efe9] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#b8e63a]" />
              <span>Probability calibration curve (Reliability diagram)</span>
            </h4>
            <p className="text-[12px] text-[#8fa69a] mt-0.5 leading-normal">
              Comparison between model estimated probability and empirical realized outcome frequency across 8 probability bins.
            </p>
          </div>
          <span className="text-[11px] font-mono text-[#b8e63a] bg-[#0a1812] border-[0.5px] border-white/[0.08] px-2 py-0.5 rounded-[4px] self-start sm:self-auto">
            Slope: 0.984 (Target: 1.00)
          </span>
        </div>

        {/* Calibration bins table and bar comparison */}
        <div className="space-y-2.5">
          {buckets.map((b, i) => {
            const predPct = b.predictedProbMean * 100;
            const obsPct = b.observedFrequency * 100;
            const delta = obsPct - predPct;

            return (
              <div key={i} className="text-[12px]">
                <div className="flex items-center justify-between mb-1 text-[11px]">
                  <span className="font-mono text-[#e8efe9]">Bin {b.binRange}</span>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="text-[#8fa69a]">Pred: <span className="text-[#e8efe9]">{predPct.toFixed(1)}%</span></span>
                    <span className="text-[#b8e63a]">Actual: <span>{obsPct.toFixed(1)}%</span></span>
                    <span className={`text-[10px] ${Math.abs(delta) < 2 ? 'text-[#8fa69a]' : delta > 0 ? 'text-[#b8e63a]' : 'text-[#e3b341]'}`}>
                      (Δ {delta > 0 ? '+' : ''}{delta.toFixed(1)}%)
                    </span>
                    <span className="text-[#8fa69a]/60 text-[10px]">n={b.sampleCount}</span>
                  </div>
                </div>

                {/* Comparative bar */}
                <div className="h-1.5 w-full bg-[#0a1812] rounded-full overflow-hidden flex relative">
                  {/* Model predicted bar */}
                  <div
                    className="h-full bg-white/20 rounded-full"
                    style={{ width: `${predPct}%` }}
                    title={`Predicted: ${predPct.toFixed(1)}%`}
                  />
                  {/* Marker for actual observed */}
                  <div
                    className="absolute top-0 bottom-0 w-1.5 bg-[#b8e63a] rounded-full"
                    style={{ left: `${obsPct}%` }}
                    title={`Observed: ${obsPct.toFixed(1)}%`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t-[0.5px] border-white/[0.06] flex items-center justify-between text-[11px] text-[#8fa69a]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1.5 bg-white/20 rounded-full"></span>
              <span>Model predicted</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1.5 bg-[#b8e63a] rounded-full"></span>
              <span>Empirical frequency</span>
            </span>
          </div>
          <span className="italic">Evaluated on held-out out-of-sample data</span>
        </div>
      </div>
    </div>
  );
}
