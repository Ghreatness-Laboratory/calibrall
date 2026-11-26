'use client';

import React from 'react';
import { CalibrationBucket } from '@/types';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  buckets: CalibrationBucket[];
  brierScore?: number;
  logLoss?: number;
  hitRate?: number;
  roi?: number;
  title?: string;
  subtitle?: string;
  badgeText?: string;
}

export default function PerformanceChart({
  buckets,
  title = 'Probability calibration curve',
  subtitle = 'Comparison between model projected probability and empirical realized frequency across bins.',
  badgeText = 'Slope: 0.984',
}: Props) {
  return (
    <div className="space-y-3">
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[var(--line)] gap-2">
          <div>
            <h4 className="font-display text-[14px] font-semibold text-[var(--text)] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[var(--accent)]" strokeWidth={2} />
              <span>{title}</span>
            </h4>
            <p className="text-[12px] text-[var(--text-2)] mt-0.5 leading-[1.45]">
              {subtitle}
            </p>
          </div>
          <span className="text-[11px] text-[var(--accent)] bg-[var(--surface-2)] border border-[var(--line)] px-2.5 py-1 rounded-full self-start sm:self-auto tabular-nums font-semibold">
            {badgeText}
          </span>
        </div>

        <div className="border border-[var(--line)] rounded-[12px] overflow-hidden bg-[var(--surface-2)]">
          <div className="grid grid-cols-5 px-3 py-2 bg-[var(--surface)] border-b border-[var(--line)] text-[10.5px] font-medium text-[var(--text-2)] text-center">
            <span className="text-left">Bin</span>
            <span>Pred</span>
            <span>Actual</span>
            <span>Delta</span>
            <span className="text-right">N</span>
          </div>

          <div className="divide-y divide-[var(--line)]">
            {buckets.map((b, i) => {
              const predPct = b.predictedProbMean * 100;
              const obsPct = b.observedFrequency * 100;
              const delta = obsPct - predPct;
              const isPositive = delta >= 0;
              const formattedDelta = isPositive
                ? `+${delta.toFixed(1)}%`
                : `−${Math.abs(delta).toFixed(1)}%`;

              return (
                <div key={i} className="px-3 py-2.5 text-[11.5px] tabular-nums">
                  <div className="grid grid-cols-5 items-center text-center">
                    <span className="text-left text-[var(--text)] font-medium">{b.binRange}</span>
                    <span className="text-[var(--text-2)]">{predPct.toFixed(1)}%</span>
                    <span className="text-[var(--text)] font-semibold">{obsPct.toFixed(1)}%</span>
                    <div>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${
                          isPositive
                            ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                            : 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/30'
                        }`}
                      >
                        {formattedDelta}
                      </span>
                    </div>
                    <span className="text-right text-[var(--text-3)]">{b.sampleCount}</span>
                  </div>

                  <div className="mt-2 h-[3px] w-full bg-[var(--surface)] rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-[var(--text-3)]/40 rounded-full"
                      style={{ width: `${predPct}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-2 bg-[var(--accent-fill)] rounded-full"
                      style={{ left: `${Math.min(97, obsPct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-[var(--text-2)] pt-1">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1.5 bg-[var(--text-3)]/40 rounded-full" />
              <span>Predicted</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1.5 bg-[var(--accent-fill)] rounded-full" />
              <span>Observed</span>
            </span>
          </div>
          <span className="text-[var(--text-3)]">Out-of-sample validation</span>
        </div>
      </div>
    </div>
  );
}
