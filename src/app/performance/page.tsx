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
  Trophy,
  Dribbble
} from 'lucide-react';

export default function PerformancePage() {
  const { sport, setSport, isSwitching } = useSport();
  const [activeTab, setActiveTab] = useState<'markets' | 'competitions' | 'state_tags'>('markets');

  const report = sport === 'basketball' ? VERIFIED_NBA_PERFORMANCE_REPORT : VERIFIED_PERFORMANCE_REPORT;
  const isBasketball = sport === 'basketball';

  if (isSwitching) {
    return (
      <div className="space-y-4 py-4 animate-pulse">
        <div className="h-6 w-48 bg-[#151E19] rounded-[6px]" />
        <div className="h-32 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
        <div className="h-64 bg-[#101713] rounded-[14px] border border-white/[0.07]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.07]">
        <div className="space-y-0.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#B6E63B] font-semibold block">
            AUDITED TRACK RECORD ({isBasketball ? 'BASKETBALL / NBA' : 'EUROPEAN FOOTBALL'})
          </span>
          <h2 className="text-[19px] font-bold leading-[1.25] tracking-[-0.02em] text-[#ECF1EE]">
            {isBasketball ? 'NBA Model Calibration & Track Record' : 'Walk-Forward Model Calibration & Track Record'}
          </h2>
          <p className="text-[12px] text-[#8B9890] max-w-lg">
            {isBasketball 
              ? 'Empirical backtesting on the 2024-25 NBA Regular Season across Moneyline, Point Spread, and Game Totals. Every call, on record.'
              : 'Empirical out-of-sample backtesting, forward walk-origin evaluation, and state-tag validation. Every call, on record.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sport Sub-filter */}
          <div className="bg-[#101713] border border-white/[0.07] p-[3px] rounded-[11px] flex items-center text-[12px] h-[36px]">
            <button
              onClick={() => setSport('football')}
              type="button"
              className={`px-3 h-full rounded-[8px] transition-colors font-medium flex items-center gap-1.5 touch-press ${
                sport === 'football' ? 'bg-[#B6E63B] text-[#0A0F0D] font-semibold' : 'text-[#8B9890] hover:text-[#ECF1EE]'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" strokeWidth={2} />
              <span>Football</span>
            </button>
            <button
              onClick={() => setSport('basketball')}
              type="button"
              className={`px-3 h-full rounded-[8px] transition-colors font-medium flex items-center gap-1.5 touch-press ${
                sport === 'basketball' ? 'bg-[#B6E63B] text-[#0A0F0D] font-semibold' : 'text-[#8B9890] hover:text-[#ECF1EE]'
              }`}
            >
              <Dribbble className="w-3.5 h-3.5" strokeWidth={2} />
              <span>Basketball</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-[#8B9890] bg-[#101713] border border-white/[0.07] px-3 h-[36px] rounded-[11px] tabular-nums">
            <Calendar className="w-3.5 h-3.5 text-[#5E6A63]" />
            <span>Window: {report.outOfSampleValidationWindow.split(' ')[0]} to present</span>
          </div>
        </div>
      </div>

      {/* Probabilistic Rigor Card */}
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-3.5 text-[12px] text-[#8B9890] space-y-1.5">
        <div className="flex items-center gap-2 text-[#B6E63B] font-semibold text-[13px]">
          <ShieldCheck className="w-4 h-4" strokeWidth={2} />
          <span>The Calibrall Verification Charter: Segregated Sport Audits</span>
        </div>
        <p className="leading-[1.55]">
          Unlike tipping services that quote selective win rates or merge unrelated sports, Calibrall audits <span className="text-[#ECF1EE]">Football</span> and <span className="text-[#ECF1EE]">Basketball</span> performance independently. All predictions are benchmarked using standardized scoring rules: <span className="text-[#ECF1EE]">Brier Score</span> ({report.brierScore.toFixed(3)}) and <span className="text-[#ECF1EE]">Logarithmic Loss</span> ({report.logLoss.toFixed(3)}). Never mixed, never retroactively edited.
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
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] overflow-hidden">
        <div className="p-3 bg-[#151E19] border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              onClick={() => setActiveTab('markets')}
              type="button"
              className={`h-[30px] px-3 rounded-full transition-colors font-medium touch-press ${
                activeTab === 'markets' 
                  ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B]' 
                  : 'bg-[#101713] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
              }`}
            >
              Breakdown by market
            </button>
            <button
              onClick={() => setActiveTab('state_tags')}
              type="button"
              className={`h-[30px] px-3 rounded-full transition-colors font-medium touch-press ${
                activeTab === 'state_tags' 
                  ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B]' 
                  : 'bg-[#101713] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
              }`}
            >
              By state tag
            </button>
            <button
              onClick={() => setActiveTab('competitions')}
              type="button"
              className={`h-[30px] px-3 rounded-full transition-colors font-medium touch-press ${
                activeTab === 'competitions' 
                  ? 'bg-[rgba(182,230,59,0.12)] border border-[#B6E63B] text-[#B6E63B]' 
                  : 'bg-[#101713] border border-white/[0.07] text-[#8B9890] hover:text-[#ECF1EE]'
              }`}
            >
              By competition
            </button>
          </div>
          <span className="text-[11px] font-mono text-[#5E6A63] tabular-nums">{report.settledPredictions} settled calls</span>
        </div>

        {activeTab === 'markets' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#151E19] text-[#8B9890] text-[10px] font-mono uppercase tracking-wider border-b border-white/[0.07]">
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
                    <td className="py-2.5 px-3 font-semibold text-[#ECF1EE]">
                      {cat.name}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#8B9890] tabular-nums">n = {cat.sampleSize}</td>
                    <td className="py-2.5 px-3 font-mono text-[#B6E63B] font-semibold tabular-nums">
                      {(cat.hitRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#ECF1EE] tabular-nums">
                      {cat.brierScore.toFixed(3)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#8B9890] tabular-nums">
                      +{(cat.avgEdge * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#B6E63B] tabular-nums">
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
              <thead className="bg-[#151E19] text-[#8B9890] text-[10px] font-mono uppercase tracking-wider border-b border-white/[0.07]">
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
                    <td className="py-2.5 px-3 font-semibold text-[#ECF1EE]">
                      #{tag.tag} ({tag.label})
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#8B9890] tabular-nums">n = {tag.sampleSize}</td>
                    <td className="py-2.5 px-3 font-mono text-[#B6E63B] font-semibold tabular-nums">
                      {(tag.hitRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#ECF1EE] tabular-nums">
                      {tag.brierScore.toFixed(3)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#8B9890] tabular-nums">
                      +{(tag.avgEdge * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#B6E63B] tabular-nums">
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
              <thead className="bg-[#151E19] text-[#8B9890] text-[10px] font-mono uppercase tracking-wider border-b border-white/[0.07]">
                <tr>
                  <th className="py-2.5 px-3">Competition</th>
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3">Sample</th>
                  <th className="py-2.5 px-3">Hit rate</th>
                  <th className="py-2.5 px-3">Brier score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {report.byCompetition.map((comp, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-[#ECF1EE]">
                      {comp.competitionName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#5E6A63] tabular-nums">
                      {comp.competitionCode}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#8B9890] tabular-nums">n = {comp.sampleSize}</td>
                    <td className="py-2.5 px-3 font-mono text-[#B6E63B] font-semibold tabular-nums">
                      {(comp.hitRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#ECF1EE] tabular-nums">
                      {comp.brierScore.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
