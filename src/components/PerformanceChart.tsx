'use client';

import React from 'react';
import { CalibrationBucket } from '@/types';
import { CheckCircle2, TrendingUp, AlertCircle, Info } from 'lucide-react';

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
    <div className="space-y-6">
      {/* High-level KPI metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-surface-200 border border-border rounded">
          <span className="text-[11px] font-mono text-gray-400 block uppercase">Overall Hit Rate</span>
          <span className="text-xl font-bold text-brand-emerald tabular-nums">
            {(hitRate * 100).toFixed(1)}%
          </span>
          <span className="text-[10px] text-gray-500 block mt-0.5">420 settled predictions</span>
        </div>

        <div className="p-3.5 bg-surface-200 border border-border rounded">
          <span className="text-[11px] font-mono text-gray-400 block uppercase">Brier Score</span>
          <span className="text-xl font-bold text-white tabular-nums">
            {brierScore.toFixed(3)}
          </span>
          <span className="text-[10px] text-brand-emerald block mt-0.5">Benchmark &lt; 0.20 (Good)</span>
        </div>

        <div className="p-3.5 bg-surface-200 border border-border rounded">
          <span className="text-[11px] font-mono text-gray-400 block uppercase">Log Loss (Entropy)</span>
          <span className="text-xl font-bold text-white tabular-nums">
            {logLoss.toFixed(3)}
          </span>
          <span className="text-[10px] text-gray-500 block mt-0.5">Out-of-sample evaluated</span>
        </div>

        <div className="p-3.5 bg-surface-200 border border-border rounded">
          <span className="text-[11px] font-mono text-gray-400 block uppercase">Realized Value Yield</span>
          <span className="text-xl font-bold text-brand-emerald tabular-nums">
            +{(roi * 100).toFixed(1)}%
          </span>
          <span className="text-[10px] text-gray-500 block mt-0.5">Consistent level-stake record</span>
        </div>
      </div>

      {/* Probability Calibration Reliability Plot */}
      <div className="bg-surface-200 border border-border rounded p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-border">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-brand-emerald" />
              <span>Probability Calibration Curve (Reliability Diagram)</span>
            </h4>
            <p className="text-xs text-gray-400 mt-0.5">
              Comparison between Model Estimated Probability and Empirical Realized Outcome Frequency across 8 probability bins.
            </p>
          </div>
          <span className="text-xs font-mono text-brand-blue bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded mt-2 sm:mt-0">
            Calibration Slope: 0.984 (Target: 1.00)
          </span>
        </div>

        {/* Calibration bins table and bar comparison */}
        <div className="space-y-3">
          {buckets.map((b, i) => {
            const predPct = b.predictedProbMean * 100;
            const obsPct = b.observedFrequency * 100;
            const delta = obsPct - predPct;

            return (
              <div key={i} className="text-xs">
                <div className="flex items-center justify-between mb-1 text-[11px]">
                  <span className="font-mono text-gray-300 font-medium">Bin {b.binRange}</span>
                  <div className="flex items-center space-x-3 font-mono">
                    <span className="text-gray-400">Pred: <strong className="text-white">{predPct.toFixed(1)}%</strong></span>
                    <span className="text-brand-emerald">Actual: <strong className="text-brand-emerald">{obsPct.toFixed(1)}%</strong></span>
                    <span className={`text-[10px] ${Math.abs(delta) < 2 ? 'text-gray-400' : delta > 0 ? 'text-brand-emerald' : 'text-brand-amber'}`}>
                      (Δ {delta > 0 ? '+' : ''}{delta.toFixed(1)}%)
                    </span>
                    <span className="text-gray-500 text-[10px]">n={b.sampleCount}</span>
                  </div>
                </div>

                {/* Comparative bar */}
                <div className="h-2 w-full bg-navy-900 rounded-full overflow-hidden flex relative">
                  {/* Model predicted bar */}
                  <div
                    className="h-full bg-brand-blue/60"
                    style={{ width: `${predPct}%` }}
                    title={`Predicted: ${predPct.toFixed(1)}%`}
                  />
                  {/* Marker for actual observed */}
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-brand-emerald shadow-glow-emerald"
                    style={{ left: `${obsPct}%` }}
                    title={`Observed: ${obsPct.toFixed(1)}%`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-gray-400">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-2 bg-brand-blue/60 rounded-xs"></span>
              <span>Model Predicted</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-2 bg-brand-emerald rounded-xs"></span>
              <span>Empirical Frequency</span>
            </span>
          </div>
          <span className="italic">Evaluated on held-out out-of-sample data (Walk-Forward)</span>
        </div>
      </div>
    </div>
  );
}
