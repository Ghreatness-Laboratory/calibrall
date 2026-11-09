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
      {/* Probability Calibration Card */}
      <div className="bg-[#101613] border border-[#1F2A24] rounded-[14px] p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#1F2A24] gap-1.5">
          <div>
            <h4 className="text-[14px] font-[600] text-[#E9EFEB] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#B8E636]" strokeWidth={2} />
              <span>Probability calibration curve</span>
            </h4>
            <p className="text-[11.5px] text-[#8B9892] mt-0.5 leading-normal">
              Comparison between model projected probability and empirical realized frequency across probability bins.
            </p>
          </div>
          <span className="text-[10.5px] text-[#B8E636] bg-[#151D19] border border-[#1F2A24] px-2 py-0.5 rounded-full self-start sm:self-auto tabular-nums font-semibold">
            Slope: 0.984
          </span>
        </div>

        {/* Grouped card: header row and compact 5-column data rows */}
        <div className="border border-[#1F2A24] rounded-[11px] overflow-hidden bg-[#151D19]">
          <div className="grid grid-cols-5 px-3 py-2 bg-[#101613] border-b border-[#1F2A24] text-[10px] font-semibold uppercase text-[#5E6B65] tracking-wider text-center">
            <span className="text-left">BIN</span>
            <span>PRED</span>
            <span>ACTUAL</span>
            <span>DELTA</span>
            <span className="text-right">N</span>
          </div>

          <div className="divide-y divide-[#1F2A24]">
            {buckets.map((b, i) => {
              const predPct = b.predictedProbMean * 100;
              const obsPct = b.observedFrequency * 100;
              const delta = obsPct - predPct;
              const isPositive = delta >= 0;
              const formattedDelta = isPositive 
                ? `+${delta.toFixed(1)}%` 
                : `−${Math.abs(delta).toFixed(1)}%`;

              return (
                <div key={i} className="px-3 py-2 text-[11.5px] tabular-nums">
                  <div className="grid grid-cols-5 items-center text-center">
                    <span className="text-left text-[#E9EFEB] font-medium">{b.binRange}</span>
                    <span className="text-[#8B9892]">{predPct.toFixed(1)}%</span>
                    <span className="text-[#E9EFEB] font-semibold">{obsPct.toFixed(1)}%</span>
                    <div>
                      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        isPositive 
                          ? 'bg-[#B8E636]/12 text-[#B8E636] border-[#B8E636]/30' 
                          : 'bg-[#E8B04A]/12 text-[#E8B04A] border-[#E8B04A]/30'
                      }`}>
                        {formattedDelta}
                      </span>
                    </div>
                    <span className="text-right text-[#5E6B65]">{b.sampleCount}</span>
                  </div>

                  {/* Thin progress bar per row */}
                  <div className="mt-1.5 h-[3px] w-full bg-[#101613] rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-white/20 rounded-full"
                      style={{ width: `${predPct}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-2 bg-[#B8E636] rounded-full"
                      style={{ left: `${Math.min(97, obsPct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between text-[10.5px] text-[#8B9892] pt-1">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-1.5 bg-white/20 rounded-full" />
              <span>Predicted</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-1.5 bg-[#B8E636] rounded-full" />
              <span>Observed</span>
            </span>
          </div>
          <span className="text-[#5E6B65]">Out of sample validation</span>
        </div>
      </div>
    </div>
  );
}
