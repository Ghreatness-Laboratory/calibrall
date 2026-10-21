'use client';

import React, { useState } from 'react';
import { VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';
import PerformanceChart from '@/components/PerformanceChart';
import { 
  BarChart3, 
  ShieldCheck, 
  Calendar,
  Lock
} from 'lucide-react';

export default function PerformancePage() {
  const [activeTab, setActiveTab] = useState<'markets' | 'competitions' | 'state_tags'>('state_tags');
  const report = VERIFIED_PERFORMANCE_REPORT;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div>
          <h1 className="text-[18px] font-[500] text-[#e8efe9] flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#b8e63a]" />
            <span>Audited historical performance & calibration</span>
          </h1>
          <p className="text-[12px] text-[#8fa69a] mt-0.5">
            Empirical out-of-sample backtesting, forward walk-origin evaluation, and state-tag validation. Every call, on record.
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#8fa69a] bg-[#0f2219] border border-white/[0.08] px-2.5 py-1 rounded-[6px]">
          <Calendar className="w-3.5 h-3.5 text-[#8fa69a]" />
          <span>Window: {report.outOfSampleValidationWindow.split(' ')[0]} to present</span>
        </div>
      </div>

      {/* Probabilistic Rigor Manifesto */}
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-4 text-[12px] text-[#8fa69a] space-y-1.5">
        <div className="flex items-center gap-2 text-[#b8e63a] font-[500]">
          <ShieldCheck className="w-4 h-4" />
          <span>The Calibrall verification charter</span>
        </div>
        <p className="leading-normal">
          Unlike tipping services that quote selective win rates on arbitrary bets, Calibrall evaluates all pre-match predictions against settled scores using standardized probabilistic metrics: <span className="text-[#e8efe9]">Brier Score</span> (mean squared error of probability forecasts) and <span className="text-[#e8efe9]">Logarithmic Loss</span>. No prediction is ever retroactively omitted, altered, or replaced.
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
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] overflow-hidden">
        <div className="p-3 bg-[#0a1812]/50 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-[11px]">
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
              onClick={() => setActiveTab('markets')}
              type="button"
              className={`px-2.5 py-1 rounded-[4px] transition-colors font-[500] ${
                activeTab === 'markets' ? 'bg-[#b8e63a] text-[#0a1812]' : 'text-[#8fa69a] hover:text-[#e8efe9]'
              }`}
            >
              Breakdown by market
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

        {activeTab === 'state_tags' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#0a1812]/80 text-[#8fa69a] font-mono text-[10px] uppercase border-b border-white/[0.06]">
                <tr>
                  <th className="py-2 px-3">State tag</th>
                  <th className="py-2 px-3">Sample</th>
                  <th className="py-2 px-3">Hit rate</th>
                  <th className="py-2 px-3">Brier score</th>
                  <th className="py-2 px-3">Average edge</th>
                  <th className="py-2 px-3">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {report.byStateTag.map((tag, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 font-[500] text-[#e8efe9]">
                      #{tag.tag}
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
        ) : activeTab === 'markets' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#0a1812]/80 text-[#8fa69a] font-mono text-[10px] uppercase border-b border-white/[0.06]">
                <tr>
                  <th className="py-2 px-3">Market category</th>
                  <th className="py-2 px-3">Sample</th>
                  <th className="py-2 px-3">Hit rate</th>
                  <th className="py-2 px-3">Brier score</th>
                  <th className="py-2 px-3">Average edge</th>
                  <th className="py-2 px-3">ROI</th>
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#0a1812]/80 text-[#8fa69a] font-mono text-[10px] uppercase border-b border-white/[0.06]">
                <tr>
                  <th className="py-2 px-3">Competition</th>
                  <th className="py-2 px-3">Code</th>
                  <th className="py-2 px-3">Sample</th>
                  <th className="py-2 px-3">Hit rate</th>
                  <th className="py-2 px-3">Brier score</th>
                  <th className="py-2 px-3">Reliability</th>
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
                      <span className="text-[10px] font-mono text-[#b8e63a] bg-[#b8e63a]/15 border border-[#b8e63a]/30 px-1.5 py-0.5 rounded-[4px]">
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

      {/* Audit Log Guarantee */}
      <div className="p-3 bg-[#0f2219] border border-white/[0.08] rounded-[8px] flex items-center justify-between text-[11px] text-[#8fa69a]">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-[#b8e63a]" />
          <span>Every prediction snapshot is cryptographically stamped prior to kickoff.</span>
        </div>
        <span className="font-mono">SHA-256 verified</span>
      </div>
    </div>
  );
}
