'use client';

import React, { useState } from 'react';
import { VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';
import { VERIFIED_NBA_PERFORMANCE_REPORT } from '@/lib/data/nbaSeedData';
import PerformanceChart from '@/components/PerformanceChart';
import { useSport } from '@/lib/context/SportContext';
import { 
  BarChart3, 
  ShieldCheck, 
  Calendar,
  Lock,
  Layers,
  Sparkles
} from 'lucide-react';
import { Sport } from '@/types';

export default function PerformancePage() {
  const { sport, setSport, isSwitching } = useSport();
  const [activeTab, setActiveTab] = useState<'markets' | 'competitions' | 'state_tags'>('markets');

  const report = sport === 'basketball' ? VERIFIED_NBA_PERFORMANCE_REPORT : VERIFIED_PERFORMANCE_REPORT;
  const isBasketball = sport === 'basketball';

  if (isSwitching) {
    return (
      <div className="space-y-6 py-6 animate-pulse">
        <div className="h-8 w-64 bg-white/10 rounded-[8px]" />
        <div className="h-40 bg-[#0f2219] rounded-[12px] border border-white/10" />
        <div className="h-64 bg-[#0f2219] rounded-[12px] border border-white/10" />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-7 py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b-[0.5px] border-white/[0.08]">
        <div className="space-y-1 text-left">
          <span className="text-[11px] font-[500] tracking-[0.04em] text-[#b8e63a] block">
            Audited Track Record ({isBasketball ? 'Basketball / NBA' : 'European Football'})
          </span>
          <h1 className="text-[22px] font-[500] leading-[1.25] tracking-[-0.01em] text-[#e8efe9] text-left">
            {isBasketball ? 'NBA Efficiency Model Calibration & Performance' : 'Walk-forward model calibration & performance'}
          </h1>
          <p className="text-[13px] leading-[1.65] text-[#8fa69a] text-left max-w-[560px]">
            {isBasketball 
              ? 'Empirical backtesting on the 2024-25 NBA Regular Season across Moneyline, Point Spread, and Game Totals. Every call, on record.'
              : 'Empirical out-of-sample backtesting, forward walk-origin evaluation, and state-tag validation. Every call, on record.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {/* Sport Sub-filter */}
          <div className="bg-[#0f2219] border border-white/[0.08] p-1 rounded-[8px] flex items-center text-[11px]">
            <button
              onClick={() => setSport('football')}
              type="button"
              className={`px-3 py-1 rounded-[6px] transition-colors font-medium ${
                sport === 'football' ? 'bg-[#b8e63a] text-[#0a1812]' : 'text-[#8fa69a] hover:text-[#e8efe9]'
              }`}
            >
              ⚽ Football
            </button>
            <button
              onClick={() => setSport('basketball')}
              type="button"
              className={`px-3 py-1 rounded-[6px] transition-colors font-medium ${
                sport === 'basketball' ? 'bg-[#b8e63a] text-[#0a1812]' : 'text-[#8fa69a] hover:text-[#e8efe9]'
              }`}
            >
              🏀 Basketball
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#8fa69a] bg-[#0f2219] border-[0.5px] border-white/[0.08] px-2.5 py-1.5 rounded-[6px]">
            <Calendar className="w-3.5 h-3.5 text-[#8fa69a]" />
            <span>Window: {report.outOfSampleValidationWindow.split(' ')[0]} to present</span>
          </div>
        </div>
      </div>

      {/* Probabilistic Rigor Manifesto */}
      <div className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] p-4 text-[12px] text-[#8fa69a] space-y-1.5">
        <div className="flex items-center gap-2 text-[#b8e63a] font-[500]">
          <ShieldCheck className="w-4 h-4" />
          <span>The Calibrall Verification Charter: Segregated Sport Audits</span>
        </div>
        <p className="leading-[1.65]">
          Unlike tipping services that quote selective win rates or merge unrelated sports, Calibrall audits <span className="text-[#e8efe9]">Football</span> and <span className="text-[#e8efe9]">Basketball</span> performance independently. All predictions are benchmarked using standardized scoring rules: <span className="text-[#e8efe9]">Brier Score</span> ({report.brierScore.toFixed(3)}) and <span className="text-[#e8efe9]">Logarithmic Loss</span> ({report.logLoss.toFixed(3)}). Never mixed, never retroactively edited.
        </p>
      </div>

      {/* Main KPI & Calibration Component */}
      <PerformanceChart
        buckets={report.calibrationBuckets}
        brierScore={report.brierScore}
        logLoss={report.logLoss}
        hitRate={report.hitRate}
        roi={report.averageYieldRoi}
      />

      {/* Secondary Tabs */}
      <div className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] overflow-hidden">
        <div className="p-3 bg-[#0a1812]/50 border-b-[0.5px] border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-[11px]">
            <button
              onClick={() => setActiveTab('markets')}
              type="button"
              className={`px-2.5 py-1 rounded-[4px] transition-colors font-[500] ${
                activeTab === 'markets' ? 'bg-[#b8e63a] text-[#0a1812]' : 'text-[#8fa69a] hover:text-[#e8efe9]'
              }`}
            >
              Breakdown by market
            </button>
            <button
              onClick={() => setActiveTab('state_tags')}
              type="button"
              className={`px-2.5 py-1 rounded-[4px] transition-colors font-[500] ${
                activeTab === 'state_tags' ? 'bg-[#b8e63a] text-[#0a1812]' : 'text-[#8fa69a] hover:text-[#e8efe9]'
              }`}
            >
              Performance by state tag
            </button>
            <button
              onClick={() => setActiveTab('competitions')}
              type="button"
              className={`px-2.5 py-1 rounded-[4px] transition-colors font-[500] ${
                activeTab === 'competitions' ? 'bg-[#b8e63a] text-[#0a1812]' : 'text-[#8fa69a] hover:text-[#e8efe9]'
              }`}
            >
              Breakdown by competition
            </button>
          </div>
          <span className="text-[11px] font-mono text-[#8fa69a]">{report.settledPredictions} settled bets</span>
        </div>

        {activeTab === 'markets' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#0a1812]/80 text-[#8fa69a] text-[11px] font-[500] border-b-[0.5px] border-white/[0.06]">
                <tr>
                  <th className="py-2.5 px-3">Market category</th>
                  <th className="py-2.5 px-3">Sample</th>
                  <th className="py-2.5 px-3">Hit rate</th>
                  <th className="py-2.5 px-3">Brier score</th>
                  <th className="py-2.5 px-3">Average edge</th>
                  <th className="py-2.5 px-3">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {report.byMarketCategory.map((cat, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 font-[500] text-[#e8efe9]">
                      {cat.name}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#8fa69a]">n = {cat.sampleSize}</td>
                    <td className="py-2.5 px-3 font-mono text-[#b8e63a] font-[500] tabular-nums">
                      {(cat.hitRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#e8efe9] tabular-nums">
                      {cat.brierScore.toFixed(3)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#8fa69a] tabular-nums">
                      +{(cat.avgEdge * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono font-[500] text-[#b8e63a] tabular-nums">
                      +{(cat.roi * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'state_tags' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#0a1812]/80 text-[#8fa69a] text-[11px] font-[500] border-b-[0.5px] border-white/[0.06]">
                <tr>
                  <th className="py-2.5 px-3">State tag</th>
                  <th className="py-2.5 px-3">Sample</th>
                  <th className="py-2.5 px-3">Hit rate</th>
                  <th className="py-2.5 px-3">Brier score</th>
                  <th className="py-2.5 px-3">Average edge</th>
                  <th className="py-2.5 px-3">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {report.byStateTag.map((tag, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 font-[500] text-[#e8efe9]">
                      #{tag.tag} ({tag.label})
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#8fa69a]">n = {tag.sampleSize}</td>
                    <td className="py-2.5 px-3 font-mono text-[#b8e63a] font-[500] tabular-nums">
                      {(tag.hitRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#e8efe9] tabular-nums">
                      {tag.brierScore.toFixed(3)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#8fa69a] tabular-nums">
                      +{(tag.avgEdge * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono font-[500] text-[#b8e63a] tabular-nums">
                      +{(tag.roi * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#0a1812]/80 text-[#8fa69a] text-[11px] font-[500] border-b-[0.5px] border-white/[0.06]">
                <tr>
                  <th className="py-2.5 px-3">Competition</th>
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3">Sample</th>
                  <th className="py-2.5 px-3">Hit rate</th>
                  <th className="py-2.5 px-3">Brier score</th>
                  <th className="py-2.5 px-3">Reliability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {report.byCompetition.map((comp, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 font-[500] text-[#e8efe9]">{comp.competitionName}</td>
                    <td className="py-2.5 px-3 font-mono text-[#8fa69a]">{comp.competitionCode}</td>
                    <td className="py-2.5 px-3 font-mono text-[#8fa69a]">n = {comp.sampleSize}</td>
                    <td className="py-2.5 px-3 font-mono text-[#b8e63a] font-[500] tabular-nums">
                      {(comp.hitRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#e8efe9] tabular-nums">
                      {comp.brierScore.toFixed(3)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] text-[#b8e63a] bg-[#b8e63a]/15 border border-[#b8e63a]/30 px-1.5 py-0.5 rounded-[4px]">
                        High fit (R² &gt; 0.94)
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Responsible Use Notice */}
      <div className="p-3 bg-[#0f2219] border border-white/[0.08] rounded-[10px] flex items-center justify-between text-[11px] text-[#8fa69a]">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#b8e63a]" />
          <span>Statistical estimate, not a guaranteed outcome. Please use responsibly.</span>
        </span>
        <span className="font-mono text-[#8fa69a]/70">
          Walk-Forward Evaluation Protocol
        </span>
      </div>
    </div>
  );
}
