'use client';

import React, { useState } from 'react';
import { 
  MarketPrediction, 
  StateTag, 
  FactorCode, 
  ContextFactorMeasurement, 
  MissingFactorFlag, 
  FactorContribution 
} from '@/types';
import { 
  STATE_TAG_REGISTRY, 
  FACTOR_DEFINITIONS, 
  ContextEvaluationResult 
} from '@/lib/prediction/contextFactors';
import { 
  Cpu, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Info, 
  Clock, 
  TrendingUp, 
  Activity, 
  Sliders, 
  HelpCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  XCircle
} from 'lucide-react';

interface Props {
  contextEvaluation: ContextEvaluationResult;
  rankedOptions: MarketPrediction[];
  onSelectOption?: (option: MarketPrediction) => void;
  selectedOptionId?: string;
}

export default function FactorsAndStatePanel({
  contextEvaluation,
  rankedOptions,
  onSelectOption,
  selectedOptionId,
}: Props) {
  const [selectedMarketTab, setSelectedMarketTab] = useState<'total_goals' | 'total_corners' | 'bookings' | 'match_result'>('total_goals');
  const [showAllFactors, setShowAllFactors] = useState(false);

  const {
    stateTags,
    lineupStatus,
    activeFactors,
    missingFactors,
    compositeUncertaintyMultiplier,
    dataQualityScore,
    correlationWarnings,
  } = contextEvaluation;

  return (
    <div className="bg-surface-200 border border-border rounded-lg overflow-hidden space-y-6 p-5 shadow-terminal">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-brand-emerald" />
            <h2 className="text-lg font-black text-white tracking-wide">
              Context Factors &amp; State-Based Weighing
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-100 border border-border text-gray-300">
              L2 Shrinkage Active
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Pre-match verified data points weighted through regularized models. Weights are learned, never hand-picked.
          </p>
        </div>

        {/* Lineup Confirmation Status Pill */}
        <div className="flex items-center space-x-2">
          {lineupStatus === 'confirmed' ? (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-brand-emerald/10 border border-brand-emerald/40 text-brand-emerald font-mono text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>OFFICIAL LINEUPS CONFIRMED</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/40 text-brand-amber font-mono text-xs font-bold">
              <Clock className="w-4 h-4 animate-pulse" />
              <span>PRE-LINEUP MODE (T &gt; 60m)</span>
            </div>
          )}
        </div>
      </div>

      {/* Pre-lineup Warning Banner if applicable */}
      {lineupStatus === 'pre-lineup' && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-300 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-brand-amber" />
          <div className="leading-relaxed">
            <strong className="text-white">Pre-Lineup State Notice:</strong> Official team sheets are not yet published. The engine applies an automatic <strong>+22% uncertainty margin</strong>. Projections will automatically re-run with confirmed starters upon team sheet submission.
          </div>
        </div>
      )}

      {/* State Tags Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-white uppercase font-mono tracking-wider text-[11px] flex items-center space-x-1.5">
            <Activity className="w-3.5 h-3.5 text-brand-blue" />
            <span>Active Verified Match State Tags ({stateTags.length})</span>
          </span>
          <span className="text-[11px] font-mono text-gray-400">
            Uncertainty Scale: <strong>{compositeUncertaintyMultiplier.toFixed(2)}x</strong> | Data Quality: <strong>{(dataQualityScore * 100).toFixed(0)}%</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {stateTags.map((tag) => {
            const info = STATE_TAG_REGISTRY[tag];
            return (
              <div 
                key={tag} 
                className="p-3 rounded bg-surface-100 border border-border space-y-1.5 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-brand-emerald">
                    #{tag}
                  </span>
                  <span className="text-[10px] font-mono text-gray-400 bg-surface-50 px-1.5 py-0.5 rounded">
                    {info?.uncertaintyMultiplier ? `+${((info.uncertaintyMultiplier - 1) * 100).toFixed(0)}% Uncert` : 'Active'}
                  </span>
                </div>
                <div className="text-xs font-semibold text-white">
                  {info?.label ?? tag}
                </div>
                <p className="text-[11px] text-gray-400 leading-tight">
                  {info?.hypothesis}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Missing Factors Flagging (Requirement B: Never treat missing factor as zero) */}
      {missingFactors.length > 0 && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded space-y-2 text-xs">
          <div className="flex items-center space-x-2 text-brand-rose font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Missing Factor Flags (Explicitly Penalized — Never Zeroed)</span>
          </div>
          <p className="text-gray-300 text-[11px]">
            The following factors were unmeasured or incomplete. Rather than treating them as neutral or zero, the model widens uncertainty and scales down confidence:
          </p>
          <div className="space-y-1.5 pt-1">
            {missingFactors.map((mf, i) => (
              <div key={i} className="flex items-start justify-between bg-surface-100/60 p-2 rounded border border-rose-500/20 text-[11px]">
                <div>
                  <span className="font-bold text-white">{mf.factorName}</span>
                  <p className="text-gray-400">{mf.reason}</p>
                </div>
                <span className="font-mono text-brand-rose shrink-0 ml-2">
                  +{(mf.uncertaintyPenalty * 100).toFixed(0)}% Uncert Penalty
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correlation Warnings if present */}
      {correlationWarnings.length > 0 && (
        <div className="p-3 bg-surface-100 border border-border rounded space-y-1 text-xs">
          <div className="flex items-center space-x-1.5 font-bold text-gray-300 text-[11px] font-mono uppercase tracking-wider">
            <Info className="w-3.5 h-3.5 text-brand-blue" />
            <span>Inter-Market Correlation Warnings</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-[11px] text-gray-400">
            {correlationWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Top N Ranked Selection Options (Requirement E) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-brand-emerald" />
              <span>Top {rankedOptions.length} Ranked Selection Options (Across All Markets)</span>
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Ranked with learned market-specific weights. Evidence tiers labeled in plain text.
            </p>
          </div>
          <span className="text-[10px] font-mono text-gray-400">
            Configured Max: N={rankedOptions.length}
          </span>
        </div>

        <div className="space-y-3">
          {rankedOptions.map((opt, idx) => {
            const isSelected = selectedOptionId === opt.id;
            const isTop = opt.isTopPick;

            return (
              <div
                key={opt.id}
                onClick={() => onSelectOption && onSelectOption(opt)}
                className={`p-4 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-surface-100 border-brand-emerald ring-1 ring-brand-emerald shadow-glow-emerald'
                    : isTop
                    ? 'bg-brand-emerald/5 border-brand-emerald/30 hover:border-brand-emerald/60'
                    : 'bg-surface-100/60 border-border hover:border-gray-500'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
                  <div className="flex items-center space-x-3">
                    <span className="font-mono text-xs font-bold text-gray-500 w-5">#{idx + 1}</span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-sm">{opt.selection}</span>
                        {isTop && (
                          <span className="text-[9px] bg-brand-emerald text-navy-950 font-bold px-1.5 py-0.5 rounded font-mono uppercase">
                            Top Recommendation
                          </span>
                        )}
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-gray-300">
                          {opt.evidenceTier}
                        </span>
                        {opt.pushProbability !== undefined && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono border border-amber-500/30">
                            Push If Landed On {opt.line}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400 font-mono mt-0.5">
                        <span className="text-brand-accent">Option: {opt.optionType ? opt.optionType.replace(/_/g, ' ') : opt.marketName}</span>
                        <span>•</span>
                        <span>Period: {opt.period ?? 'REGULAR_TIME'}</span>
                        <span>•</span>
                        <span>Data Quality: {(opt.dataQualityScore * 100).toFixed(0)}%</span>
                      </div>
                      {opt.settlementRule && (
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          Rule: {opt.settlementRule}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Odds & Prob Metrics */}
                  <div className="flex items-center space-x-4 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-gray-400 block">Model Prob</span>
                      <span className="text-sm font-bold text-brand-emerald">
                        {(opt.modelProbability * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block">Verified Odds</span>
                      <span className="text-sm font-bold text-white">
                        {opt.marketOdds ? opt.marketOdds.toFixed(2) : 'Unpub'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block">Expected Value</span>
                      <span className={`text-sm font-bold ${
                        (opt.expectedValue ?? 0) > 0 ? 'text-brand-emerald' : 'text-gray-500'
                      }`}>
                        {opt.expectedValue ? `+${(opt.expectedValue * 100).toFixed(1)}%` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block">Confidence</span>
                      <span className="text-xs font-bold text-white">
                        {opt.modelConfidence}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Top 3 Factor Contributions (Requirement E) */}
                <div className="pt-3 space-y-2">
                  <div className="text-[10px] font-mono font-bold uppercase text-gray-400 tracking-wider flex items-center justify-between">
                    <span>Top 3 Factor Contributions (Learned Regularized Weights):</span>
                    <span>State Tags: [{opt.stateTags.join(', ')}]</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                    {opt.topFactorContributions.map((fc, fIdx) => (
                      <div key={fIdx} className="p-2 rounded bg-surface-200 border border-border-subtle space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-white">{fc.factorName}</span>
                          <span className="font-mono text-brand-blue text-[10px]">
                            Weight: {(fc.weight * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300 leading-tight">
                          {fc.impactDescription}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Alternatives Rejected Summary */}
                  {opt.alternativesRejected && opt.alternativesRejected.length > 0 && (
                    <div className="pt-1 text-[11px] text-gray-400 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-300">Rejected Alternatives:</span>
                      {opt.alternativesRejected.map((alt, aIdx) => (
                        <span key={aIdx} className="bg-surface-200 px-2 py-0.5 rounded border border-border text-[10px]">
                          {alt.alternative} ({alt.reasonRejected})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 10 Factor Measurements Matrix (Accordion / Collapsible) */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface-100">
        <button
          onClick={() => setShowAllFactors(!showAllFactors)}
          className="w-full p-3.5 bg-surface-50 hover:bg-surface-100 flex items-center justify-between text-xs text-white font-bold transition-colors"
        >
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-brand-emerald" />
            <span>Full 10-Factor Pre-Match Ingestion &amp; Weight Matrix (Click to Inspect)</span>
          </div>
          <div className="flex items-center space-x-2 text-gray-400 font-mono text-[11px]">
            <span>{showAllFactors ? 'Hide Factor Details' : 'Show All 10 Factors'}</span>
            {showAllFactors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showAllFactors && (
          <div className="p-4 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0b1017] text-gray-400 font-mono text-[10px] uppercase border-b border-border">
                  <tr>
                    <th className="py-2.5 px-3">Factor Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Pre-Match Measured Data</th>
                    <th className="py-2.5 px-3">Shrinkage</th>
                    <th className="py-2.5 px-3">Ablation Gain (Brier)</th>
                    <th className="py-2.5 px-3">Goals Wt</th>
                    <th className="py-2.5 px-3">Corners Wt</th>
                    <th className="py-2.5 px-3">Cards Wt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {activeFactors.map((f, i) => {
                    const def = FACTOR_DEFINITIONS[f.factorCode];
                    return (
                      <tr key={i} className="hover:bg-surface-200 transition-colors">
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-white block">{f.factorName}</span>
                          <span className="text-[10px] text-gray-500 font-mono">{f.factorCode}</span>
                        </td>
                        <td className="py-2.5 px-3 uppercase text-[10px] font-mono text-gray-400">
                          {f.category}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-gray-300">
                          <div><strong className="text-white">Home:</strong> {f.homeValue}</div>
                          <div><strong className="text-white">Away:</strong> {f.awayValue}</div>
                          <span className="text-[10px] text-gray-500 block">{f.description}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-amber-400">
                          {(f.shrinkageApplied * 100).toFixed(0)}%
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-brand-emerald">
                          -{def?.ablationGainBrier.toFixed(4)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-gray-300">
                          {(f.marketWeights.total_goals ?? 0 * 100).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-gray-300">
                          {(f.marketWeights.total_corners ?? 0 * 100).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-gray-300">
                          {(f.marketWeights.bookings ?? 0 * 100).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Mandatory Platform Disclaimer (Requirement E) */}
      <div className="p-3 bg-surface-100 border border-border rounded text-[11px] text-gray-400 flex items-start space-x-2">
        <Info className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Mandatory Compliance Standard:</strong> These selection options are algorithmic quantitative research outputs. CALIBRALL is strictly an analytics software terminal. The platform does not take, place, or facilitate wagers, provide staking or bankroll allocation advice, or guarantee event outcomes.
        </p>
      </div>
    </div>
  );
}
