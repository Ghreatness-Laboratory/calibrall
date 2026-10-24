'use client';

import React, { useState } from 'react';
import { VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';
import { VERIFIED_NBA_PERFORMANCE_REPORT } from '@/lib/data/nbaSeedData';
import PerformanceChart from '@/components/PerformanceChart';
import { useSport } from '@/lib/context/SportContext';
import { 
  ShieldCheck, 
  Calendar
} from 'lucide-react';

export default function PerformancePage() {
  const { sport, isSwitching } = useSport();
  const [activeTab, setActiveTab] = useState<'markets' | 'state_tags' | 'competitions'>('markets');

  const report = sport === 'basketball' ? VERIFIED_NBA_PERFORMANCE_REPORT : VERIFIED_PERFORMANCE_REPORT;
  const isBasketball = sport === 'basketball';

  if (isSwitching) {
    return (
      <div className="space-y-4 py-3 animate-pulse">
        <div className="h-6 w-48 bg-[#151E19] rounded-[6px]" />
        <div className="h-28 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
        <div className="h-48 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
      </div>
    );
  }

  const breakdownTabs = [
    { id: 'markets' as const, label: 'By market' },
    { id: 'state_tags' as const, label: 'By state tag' },
    { id: 'competitions' as const, label: 'By competition' },
  ];

  return (
    <div className="space-y-4 py-1">
      {/* 8. HEADER: Mono eyebrow "AUDITED TRACK RECORD (SPORT)", 19px H2, one line 12px subtitle */}
      <div className="space-y-1 pb-2 border-b border-white/[0.07]">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#B6E63B] font-semibold block">
          AUDITED TRACK RECORD ({isBasketball ? 'BASKETBALL / NBA' : 'FOOTBALL'})
        </span>
        <h2 className="text-[19px] font-bold leading-[1.25] tracking-[-0.02em] text-[#ECF1EE]">
          Model calibration and performance
        </h2>
        <p className="text-[12px] text-[#8B9890] truncate">
          {isBasketball
            ? 'Empirical backtesting on the 2024-25 NBA Regular Season across Moneyline, Point Spread, and Game Totals.'
            : 'Empirical out-of-sample backtesting, forward walk-origin evaluation, and state-tag validation.'}
        </p>

        {/* Small 30px high mono chip showing the date window with a calendar icon */}
        <div className="pt-1.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#8B9890] bg-[#101713] border border-white/[0.07] px-3 h-[30px] rounded-[9px] tabular-nums">
            <Calendar className="w-3.5 h-3.5 text-[#B6E63B]" strokeWidth={2} />
            <span>Window: {report.outOfSampleValidationWindow.split(' ')[0]} to present</span>
          </div>
        </div>
      </div>

      {/* 8. VERIFICATION CHARTER: One compact card with shield icon, 12.5px lime title, 11.5px body text */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 space-y-1.5">
        <div className="flex items-center gap-2 text-[#B6E63B] font-semibold text-[12.5px]">
          <ShieldCheck className="w-4 h-4 shrink-0" strokeWidth={2} />
          <span>The Calibrall Verification Charter: Segregated Sport Audits</span>
        </div>
        <p className="text-[11.5px] leading-[1.55] text-[#8B9890]">
          Unlike tipping services that quote selective win rates or merge unrelated sports, Calibrall audits <span className="text-[#ECF1EE] font-medium">Football</span> and <span className="text-[#ECF1EE] font-medium">Basketball</span> performance independently. All predictions are benchmarked using standardized scoring rules: <span className="text-[#ECF1EE] font-medium">Brier Score</span> ({report.brierScore.toFixed(3)}) and <span className="text-[#ECF1EE] font-medium">Logarithmic Loss</span> ({report.logLoss.toFixed(3)}). Never mixed, never retroactively edited.
        </p>
      </div>

      {/* 8. STAT TILES & PROBABILITY CALIBRATION */}
      <PerformanceChart
        buckets={report.calibrationBuckets}
        brierScore={report.brierScore}
        logLoss={report.logLoss}
        hitRate={report.hitRate}
        roi={report.averageYieldRoi}
      />

      {/* 8. BREAKDOWN: 14px title, horizontally scrolling chips for the 3 views, grouped list card */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-[14px] font-[650] text-[#ECF1EE]">Performance breakdown</h3>
          <span className="text-[11px] font-mono text-[#5E6A63] tabular-nums self-start sm:self-auto">
            {report.settledPredictions} settled calls
          </span>
        </div>

        {/* Horizontally scrolling chips for the three views (hidden scrollbar) */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {breakdownTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
              className={`h-[30px] px-3.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors touch-press shrink-0 ${
                activeTab === tab.id
                  ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B] font-semibold'
                  : 'bg-[#151E19] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Grouped list card with hairline dividers - NO HORIZONTAL SCROLLING */}
        <div className="border border-white/[0.07] bg-[#101713] rounded-[14px] divide-y divide-white/[0.07] overflow-hidden">
          {activeTab === 'markets' ? (
            report.byMarketCategory.map((cat, idx) => (
              <div key={idx} className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#151E19]/40 transition-colors">
                <div className="min-w-0">
                  <div className="text-[13px] font-[600] text-[#ECF1EE] truncate">
                    {cat.name}
                  </div>
                  <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                    n = {cat.sampleSize} · Brier: {cat.brierScore.toFixed(3)}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[15px] font-bold text-[#B6E63B] font-mono tabular-nums leading-tight">
                    {(cat.hitRate * 100).toFixed(1)}%
                  </div>
                  <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                    +{(cat.avgEdge * 100).toFixed(1)}% edge
                  </div>
                </div>
              </div>
            ))
          ) : activeTab === 'state_tags' ? (
            report.byStateTag.map((tag, idx) => (
              <div key={idx} className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#151E19]/40 transition-colors">
                <div className="min-w-0">
                  <div className="text-[13px] font-[600] text-[#ECF1EE] truncate">
                    #{tag.tag} ({tag.label})
                  </div>
                  <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                    n = {tag.sampleSize} · Brier: {tag.brierScore.toFixed(3)}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[15px] font-bold text-[#B6E63B] font-mono tabular-nums leading-tight">
                    {(tag.hitRate * 100).toFixed(1)}%
                  </div>
                  <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                    +{(tag.avgEdge * 100).toFixed(1)}% edge
                  </div>
                </div>
              </div>
            ))
          ) : (
            report.byCompetition.map((comp, idx) => (
              <div key={idx} className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#151E19]/40 transition-colors">
                <div className="min-w-0">
                  <div className="text-[13px] font-[600] text-[#ECF1EE] truncate">
                    {comp.competitionName}
                  </div>
                  <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                    {comp.competitionCode} · n = {comp.sampleSize} · Brier: {comp.brierScore.toFixed(3)}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[15px] font-bold text-[#B6E63B] font-mono tabular-nums leading-tight">
                    {(comp.hitRate * 100).toFixed(1)}%
                  </div>
                  <div className="text-[11px] font-mono text-[#8B9890] mt-0.5 tabular-nums">
                    settled
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 8. Slim single-line statistical estimate note */}
      <div className="text-center pt-3 pb-1 text-[11px] font-mono text-[#5E6A63]">
        Statistical estimate notice: Past calibration across walk-forward validation windows does not guarantee future market returns.
      </div>
    </div>
  );
}
