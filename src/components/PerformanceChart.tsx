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
    <div className="space-y-3">
      {/* Metrics: 2x2 grid (4 on desktop), cards with 14px radius and hairline borders */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 bg-[#101713] border border-white/[0.07] rounded-[14px]">
          <span className="text-[10.5px] text-[#8B9890] block mb-0.5">Settled predictions</span>
          <span className="text-[20px] font-semibold text-[#ECF1EE] font-mono tabular-nums leading-tight block">
            420
          </span>
          <span className="text-[10px] text-[#5E6A63] block mt-0.5 font-mono">Out-of-sample</span>
        </div>

        <div className="p-3 bg-[#101713] border border-white/[0.07] rounded-[14px]">
          <span className="text-[10.5px] text-[#8B9890] block mb-0.5">Overall hit rate</span>
          <span className="text-[20px] font-semibold text-[#B6E63B] font-mono tabular-nums leading-tight block">
            {(hitRate * 100).toFixed(1)}%
          </span>
          <span className="text-[10px] text-[#5E6A63] block mt-0.5 font-mono">Qualified picks</span>
        </div>

        <div className="p-3 bg-[#101713] border border-white/[0.07] rounded-[14px]">
          <span className="text-[10.5px] text-[#8B9890] block mb-0.5">Brier calibration</span>
          <span className="text-[20px] font-semibold text-[#ECF1EE] font-mono tabular-nums leading-tight block">
            {brierScore.toFixed(3)}
          </span>
          <span className="text-[10px] text-[#B6E63B] block mt-0.5 font-mono">&lt; 0.20 Target</span>
        </div>

        <div className="p-3 bg-[#101713] border border-white/[0.07] rounded-[14px]">
          <span className="text-[10.5px] text-[#8B9890] block mb-0.5">Level-stake ROI</span>
          <span className="text-[20px] font-semibold text-[#B6E63B] font-mono tabular-nums leading-tight block">
            +{(roi * 100).toFixed(1)}%
          </span>
          <span className="text-[10px] text-[#5E6A63] block mt-0.5 font-mono">1-unit flat stake</span>
        </div>
      </div>

      {/* Probability Calibration Reliability Plot */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-white/[0.07] gap-2">
          <div>
            <h4 className="text-[13px] font-semibold text-[#ECF1EE] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#B6E63B]" strokeWidth={2} />
              <span>Probability calibration curve (Reliability diagram)</span>
            </h4>
            <p className="text-[11.5px] text-[#8B9890] mt-0.5 leading-normal">
              Comparison between model estimated probability and empirical realized frequency across probability bins.
            </p>
          </div>
          <span className="text-[10px] font-mono text-[#B6E63B] bg-[#151E19] border border-white/[0.07] px-2 py-0.5 rounded-[5px] self-start sm:self-auto tabular-nums">
            Slope: 0.984 (Target: 1.00)
          </span>
        </div>

        {/* Calibration bins table and bar comparison */}
        <div className="space-y-2">
          {buckets.map((b, i) => {
            const predPct = b.predictedProbMean * 100;
            const obsPct = b.observedFrequency * 100;
            const delta = obsPct - predPct;

            return (
              <div key={i} className="text-[12px]">
                <div className="flex items-center justify-between mb-1 text-[11px]">
                  <span className="font-mono text-[#ECF1EE]">Bin {b.binRange}</span>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="text-[#8B9890]">Pred: <span className="text-[#ECF1EE]">{predPct.toFixed(1)}%</span></span>
                    <span className="text-[#B6E63B]">Actual: <span>{obsPct.toFixed(1)}%</span></span>
                    <span className={`text-[10px] ${Math.abs(delta) < 2 ? 'text-[#8B9890]' : delta > 0 ? 'text-[#B6E63B]' : 'text-[#E2AE45]'}`}>
                      (Δ {delta > 0 ? '+' : ''}{delta.toFixed(1)}%)
                    </span>
                    <span className="text-[#5E6A63] text-[10px]">n={b.sampleCount}</span>
                  </div>
                </div>

                {/* Comparative bar */}
                <div className="h-1.5 w-full bg-[#151E19] rounded-full overflow-hidden flex relative">
                  {/* Model predicted bar */}
                  <div
                    className="h-full bg-white/20 rounded-full"
                    style={{ width: `${predPct}%` }}
                    title={`Predicted: ${predPct.toFixed(1)}%`}
                  />
                  {/* Marker for actual observed */}
                  <div
                    className="absolute top-0 bottom-0 w-1.5 bg-[#B6E63B] rounded-full"
                    style={{ left: `${obsPct}%` }}
                    title={`Observed: ${obsPct.toFixed(1)}%`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between text-[10.5px] text-[#8B9890]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1.5 bg-white/20 rounded-full"></span>
              <span>Predicted</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1.5 bg-[#B6E63B] rounded-full"></span>
              <span>Observed</span>
            </span>
          </div>
          <span className="italic text-[#5E6A63]">Out-of-sample validation</span>
        </div>
      </div>
    </div>
  );
}
