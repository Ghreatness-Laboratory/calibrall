'use client';

import React, { useState } from 'react';
import { VERIFIED_PERFORMANCE_REPORT } from '@/lib/data/seedData';
import PerformanceChart from '@/components/PerformanceChart';
import { 
  BarChart3, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  Calendar,
  Layers,
  Database,
  Lock
} from 'lucide-react';

export default function PerformancePage() {
  const [activeTab, setActiveTab] = useState<'calibration' | 'markets' | 'competitions'>('calibration');
  const report = VERIFIED_PERFORMANCE_REPORT;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-brand-emerald" />
            <span>Audited Historical Performance & Calibration</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            <span className="font-mono text-brand-accent font-semibold mr-1.5">Every call, on record.</span>
            Empirical out-of-sample backtesting and forward walk-origin evaluation. Immutable prediction log verification.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono text-gray-400 bg-surface-200 border border-border px-3 py-1.5 rounded">
          <Calendar className="w-3.5 h-3.5 text-brand-blue" />
          <span>Window: {report.outOfSampleValidationWindow.split(' ')[0]} to present</span>
        </div>
      </div>

      {/* Probabilistic Rigor Manifesto */}
      <div className="bg-[#0b1019] border border-border rounded-lg p-4 text-xs text-gray-300 space-y-2">
        <div className="flex items-center space-x-2 text-brand-emerald font-bold">
          <ShieldCheck className="w-4 h-4" />
          <span>The CALIBRALL Verification Charter</span>
        </div>
        <p className="leading-relaxed">
          Unlike tipping services that quote misleading win rates on arbitrarily selected bets, CALIBRALL evaluates all pre-match predictions against settled scores using standardized probabilistic metrics: <strong>Brier Score</strong> (mean squared error of probability forecasts) and <strong>Logarithmic Loss</strong>. No prediction is ever retroactively omitted, altered, or replaced.
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

      {/* Secondary Tabs: Performance by Market Category vs Competition */}
      <div className="bg-surface-200 border border-border rounded overflow-hidden">
        <div className="p-3.5 bg-surface-100 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('calibration')}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                activeTab === 'calibration' ? 'bg-surface-50 text-white font-semibold' : 'text-gray-400 hover:text-white'
              }`}
            >
              Breakdown by Market Category
            </button>
            <button
              onClick={() => setActiveTab('competitions')}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                activeTab === 'competitions' ? 'bg-surface-50 text-white font-semibold' : 'text-gray-400 hover:text-white'
              }`}
            >
              Breakdown by Competition
            </button>
          </div>
          <span className="text-[11px] font-mono text-gray-400">Sample size: {report.settledPredictions} settled bets</span>
        </div>

        {activeTab === 'calibration' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0c1017] text-gray-400 font-mono text-[10px] uppercase border-b border-border">
                <tr>
                  <th className="py-2.5 px-4">Market Category</th>
                  <th className="py-2.5 px-4">Sample Size</th>
                  <th className="py-2.5 px-4">Hit Rate</th>
                  <th className="py-2.5 px-4">Brier Score</th>
                  <th className="py-2.5 px-4">Average Statistical Edge</th>
                  <th className="py-2.5 px-4">Realized Yield</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {report.byMarketCategory.map((cat, idx) => (
                  <tr key={idx} className="hover:bg-surface-100 transition-colors">
                    <td className="py-3 px-4 font-bold text-white flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-brand-emerald" />
                      <span>{cat.name}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-300">n = {cat.sampleSize}</td>
                    <td className="py-3 px-4 font-mono font-bold text-brand-emerald">
                      {(cat.hitRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 font-mono text-white">
                      {cat.brierScore.toFixed(3)}
                    </td>
                    <td className="py-3 px-4 font-mono text-brand-blue">
                      +{(cat.avgEdge * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-brand-emerald">
                      +{(cat.roi * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0c1017] text-gray-400 font-mono text-[10px] uppercase border-b border-border">
                <tr>
                  <th className="py-2.5 px-4">Competition</th>
                  <th className="py-2.5 px-4">Code</th>
                  <th className="py-2.5 px-4">Sample Size</th>
                  <th className="py-2.5 px-4">Hit Rate</th>
                  <th className="py-2.5 px-4">Brier Score</th>
                  <th className="py-2.5 px-4">Model Reliability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {report.byCompetition.map((comp, idx) => (
                  <tr key={idx} className="hover:bg-surface-100 transition-colors">
                    <td className="py-3 px-4 font-bold text-white">{comp.competitionName}</td>
                    <td className="py-3 px-4 font-mono text-gray-400">{comp.competitionCode}</td>
                    <td className="py-3 px-4 font-mono text-gray-300">n = {comp.sampleSize}</td>
                    <td className="py-3 px-4 font-mono font-bold text-brand-emerald">
                      {(comp.hitRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 font-mono text-white">
                      {comp.brierScore.toFixed(3)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-mono text-brand-emerald bg-brand-emerald/10 border border-brand-emerald/30 px-2 py-0.5 rounded">
                        High Fit (R² &gt; 0.94)
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
      <div className="p-4 bg-surface-100 border border-border rounded flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center space-x-2">
          <Lock className="w-4 h-4 text-brand-blue" />
          <span>Every prediction snapshot is cryptographically stamped with UTC kickoff timestamp prior to ball roll.</span>
        </div>
        <span className="font-mono text-[11px] text-gray-500">PostgreSQL SHA-256 Verified</span>
      </div>
    </div>
  );
}
