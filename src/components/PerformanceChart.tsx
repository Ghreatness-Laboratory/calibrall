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
      {/* 8. STAT TILES: Two column, two row grid. 10.5px label, 21px value weight 700 (lime for hit rate & ROI), 10.5px caption in subtle color */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Tile 1: Settled predictions */}
        <div className="p-3.5 bg-[#101713] border border-white/[0.07] rounded-[14px]">
          <span className="text-[10.5px] text-[#8B9890] block mb-0.5">Settled predictions</span>
          <span className="text-[21px] font-bold text-[#ECF1EE] font-mono tabular-nums leading-tight block">
            420
          </span>
          <span className="text-[10.5px] text-[#5E6A63] block mt-1 font-mono">Out-of-sample</span>
        </div>

        {/* Tile 2: Overall hit rate */}
        <div className="p-3.5 bg-[#101713] border border-white/[0.07] rounded-[14px]">
          <span className="text-[10.5px] text-[#8B9890] block mb-0.5">Overall hit rate</span>
          <span className="text-[21px] font-bold text-[#B6E63B] font-mono tabular-nums leading-tight block">
            {(hitRate * 100).toFixed(1)}%
          </span>
          <span className="text-[10.5px] text-[#5E6A63] block mt-1 font-mono">Qualified picks</span>
        </div>

        {/* Tile 3: Brier calibration */}
        <div className="p-3.5 bg-[#101713] border border-white/[0.07] rounded-[14px]">
          <span className="text-[10.5px] text-[#8B9890] block mb-0.5">Brier calibration</span>
          <span className="text-[21px] font-bold text-[#ECF1EE] font-mono tabular-nums leading-tight block">
            {brierScore.toFixed(3)}
          </span>
          <span className="text-[10.5px] text-[#B6E63B] block mt-1 font-mono">&lt; 0.20 Target</span>
        </div>

        {/* Tile 4: Level stake ROI */}
        <div className="p-3.5 bg-[#101713] border border-white/[0.07] rounded-[14px]">
          <span className="text-[10.5px] text-[#8B9890] block mb-0.5">Level stake ROI</span>
          <span className="text-[21px] font-bold text-[#B6E63B] font-mono tabular-nums leading-tight block">
            +{(roi * 100).toFixed(1)}%
          </span>
          <span className="text-[10.5px] text-[#5E6A63] block mt-1 font-mono">1-unit flat stake</span>
        </div>
      </div>

      {/* 8. PROBABILITY CALIBRATION: 14px title, 11.5px muted explanation, slope shown as a small lime mono value */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-white/[0.07] gap-1.5">
          <div>
            <h4 className="text-[14px] font-[650] text-[#ECF1EE] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#B6E63B]" strokeWidth={2} />
              <span>Probability calibration curve</span>
            </h4>
            <p className="text-[11.5px] text-[#8B9890] mt-0.5 leading-normal">
              Comparison between model estimated probability and empirical realized frequency across probability bins.
            </p>
          </div>
          <span className="text-[10px] font-mono text-[#B6E63B] bg-[#151E19] border border-white/[0.07] px-2 py-0.5 rounded-[5px] self-start sm:self-auto tabular-nums">
            Slope: 0.984 (Target: 1.00)
          </span>
        </div>

        {/* Grouped card: header row (Bin, Pred, Actual, Delta, N in 9.5px mono uppercase) and compact 5-column data rows */}
        <div className="border border-white/[0.07] rounded-[11px] overflow-hidden bg-[#151E19]">
          <div className="grid grid-cols-5 px-3 py-2 bg-[#101713] border-b border-white/[0.07] text-[9.5px] font-mono uppercase text-[#8B9890] tracking-wider text-center">
            <span className="text-left">BIN</span>
            <span>PRED</span>
            <span>ACTUAL</span>
            <span>DELTA</span>
            <span className="text-right">N</span>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {buckets.map((b, i) => {
              const predPct = b.predictedProbMean * 100;
              const obsPct = b.observedFrequency * 100;
              const delta = obsPct - predPct;
              const isPositive = delta >= 0;

              return (
                <div key={i} className="px-3 py-2 text-[11.5px] font-mono tabular-nums">
                  <div className="grid grid-cols-5 items-center text-center">
                    <span className="text-left text-[#ECF1EE] font-medium">{b.binRange}</span>
                    <span className="text-[#8B9890]">{predPct.toFixed(1)}%</span>
                    <span className="text-[#ECF1EE] font-semibold">{obsPct.toFixed(1)}%</span>
                    <span className={isPositive ? 'text-[#B6E63B] font-semibold' : 'text-[#F08A4B] font-semibold'}>
                      {isPositive ? '+' : ''}{delta.toFixed(1)}%
                    </span>
                    <span className="text-right text-[#5E6A63]">{b.sampleCount}</span>
                  </div>

                  {/* Compact comparative progress bar */}
                  <div className="mt-1.5 h-1 w-full bg-[#101713] rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-white/20 rounded-full"
                      style={{ width: `${predPct}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-1.5 bg-[#B6E63B] rounded-full"
                      style={{ left: `${Math.min(98, obsPct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between text-[10.5px] text-[#8B9890] pt-1">
          <div className="flex items-center gap-3 font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-1.5 bg-white/20 rounded-full" />
              <span>Predicted</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-1.5 bg-[#B6E63B] rounded-full" />
              <span>Observed</span>
            </span>
          </div>
          <span className="text-[#5E6A63] font-mono">Out-of-sample validation</span>
        </div>
      </div>
    </div>
  );
}
