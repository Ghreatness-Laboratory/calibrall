'use client';

import React, { useState } from 'react';
import { 
  MarketPrediction, 
} from '@/types';
import { 
  STATE_TAG_REGISTRY, 
  FACTOR_DEFINITIONS, 
  ContextEvaluationResult 
} from '@/lib/prediction/contextFactors';
import {
  getOptionTypeLabel,
  getPeriodLabel,
  formatSelectionName,
  formatExpectedValue,
  formatOdds
} from '@/lib/prediction/marketCatalog';
import { 
  Cpu, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Info, 
  Clock, 
  Sliders, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';

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
    <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-4 space-y-4">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#B6E63B]" />
            <h2 className="text-[14px] font-semibold text-[#ECF1EE]">
              Context factors & state based weighing
            </h2>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] bg-[#151E19] border border-white/[0.07] text-[#8B9890]">
              L2 shrinkage active
            </span>
          </div>
          <p className="text-[11.5px] text-[#8B9890] mt-0.5">
            Pre match data points weighted through regularized models. Weights are mathematically trained, not hand picked.
          </p>
        </div>

        {/* Lineup Confirmation Status Pill */}
        <div>
          {lineupStatus === 'confirmed' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[rgba(182,230,59,0.12)] border border-[#B6E63B]/30 text-[#B6E63B] font-mono text-[11px] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Official lineups confirmed</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[rgba(226,174,69,0.12)] border border-[#E2AE45]/30 text-[#E2AE45] font-mono text-[11px] font-semibold">
              <Clock className="w-3.5 h-3.5" />
              <span>Pre lineup mode (T &gt; 60m)</span>
            </div>
          )}
        </div>
      </div>

      {/* Pre lineup Warning Banner if applicable */}
      {lineupStatus === 'pre-lineup' && (
        <div className="p-3 bg-[#151E19] border border-[#E2AE45]/20 rounded-[11px] text-[12px] text-[#8B9890] flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#E2AE45]" />
          <div className="leading-normal">
            <span className="text-[#ECF1EE] font-medium">Pre lineup state notice:</span> Official team sheets are not yet published. The engine applies an automatic <span className="text-[#E2AE45] font-semibold">+22% uncertainty margin</span>. Projections will automatically re-run with confirmed starters upon team sheet submission.
          </div>
        </div>
      )}

      {/* State Tags Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-mono text-[#8B9890] flex items-center gap-1.5">
            <span>Active state tags ({stateTags.length})</span>
          </span>
          <span className="font-mono text-[#8B9890] tabular-nums">
            Uncertainty: <span className="text-[#ECF1EE]">{compositeUncertaintyMultiplier.toFixed(2)}x</span> · Quality: <span className="text-[#B6E63B]">{(dataQualityScore * 100).toFixed(0)}%</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {stateTags.map((tag) => {
            const info = STATE_TAG_REGISTRY[tag];
            return (
              <div 
                key={tag} 
                className="p-2.5 rounded-[10px] bg-[#151E19] border border-white/[0.07] space-y-1 hover:border-white/20 transition-colors"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono font-semibold text-[#B6E63B]">
                    #{cleanDisplayText(tag)}
                  </span>
                  <span className="font-mono text-[10px] text-[#8B9890] bg-[#101713] px-1 py-0.5 rounded-[4px] border border-white/[0.05]">
                    {info?.uncertaintyMultiplier ? `+${((info.uncertaintyMultiplier - 1) * 100).toFixed(0)}% uncert` : 'Active'}
                  </span>
                </div>
                <div className="text-[12px] font-semibold text-[#ECF1EE]">
                  {cleanDisplayText(info?.label ?? tag)}
                </div>
                <p className="text-[11px] text-[#8B9890] leading-tight">
                  {cleanDisplayText(info?.hypothesis)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Missing Factors Flagging */}
      {missingFactors.length > 0 && (
        <div className="p-3 bg-[#151E19] border border-rose-500/20 rounded-[11px] space-y-1.5 text-[12px]">
          <div className="flex items-center gap-1.5 text-rose-300 font-semibold">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Missing factor penalties (Explicitly penalized · never zeroed)</span>
          </div>
          <div className="space-y-1 pt-1">
            {missingFactors.map((mf, i) => (
              <div key={i} className="flex items-start justify-between bg-[#101713] p-2 rounded-[8px] border border-white/[0.05] text-[11px]">
                <div>
                  <span className="font-medium text-[#ECF1EE]">{cleanDisplayText(mf.factorName)}</span>
                  <p className="text-[#8B9890]">{cleanDisplayText(mf.reason)}</p>
                </div>
                <span className="font-mono text-rose-400 shrink-0 ml-2 tabular-nums">
                  +{(mf.uncertaintyPenalty * 100).toFixed(0)}% uncertainty
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correlation Warnings if present */}
      {correlationWarnings.length > 0 && (
        <div className="p-3 bg-[#151E19] border border-white/[0.07] rounded-[11px] space-y-1 text-[11px]">
          <div className="flex items-center gap-1.5 font-semibold text-[#ECF1EE]">
            <Info className="w-3.5 h-3.5 text-[#B6E63B]" />
            <span>Inter market correlation warnings</span>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-[#8B9890]">
            {correlationWarnings.map((w, i) => (
              <li key={i}>{cleanDisplayText(w)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Top Ranked Options */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[#ECF1EE]">
            Top {rankedOptions.length} ranked options
          </h3>
          <span className="text-[11px] text-[#8B9890]">
            Authorized catalogue
          </span>
        </div>

        <div className="space-y-2">
          {rankedOptions.map((opt, idx) => {
            const isSelected = selectedOptionId === opt.id;
            const isQualified = opt.qualificationStatus === 'QUALIFIED_VALUE' || opt.qualificationStatus === 'QUALIFIED_PROBABILITY';
            const showHighlight = opt.isTopPick && isQualified;

            const selectionName = formatSelectionName(opt.selection);
            const optionTypeLabel = getOptionTypeLabel(opt.optionType);
            const periodLabel = getPeriodLabel(opt.period);
            const evFormatted = formatExpectedValue(opt.expectedValue);
            const oddsFormatted = formatOdds(opt.marketOdds);

            // Subline reason
            let sublineReason = 'High uncertainty';
            const tierLower = (opt.evidenceTier || '').toLowerCase();
            if (opt.qualificationStatus === 'QUALIFIED_VALUE') {
              sublineReason = 'Qualified value';
            } else if (opt.qualificationStatus === 'QUALIFIED_PROBABILITY') {
              sublineReason = 'Statistical edge';
            } else if (tierLower.includes('inadequate data')) {
              sublineReason = 'Inadequate data';
            } else if (tierLower.includes('draw')) {
              sublineReason = 'Draw variance';
            } else if (opt.qualificationStatus === 'UNQUALIFIED_MARGINAL' || tierLower.includes('marginal')) {
              sublineReason = 'Marginal edge';
            } else if (tierLower.includes('sub')) {
              sublineReason = 'Sub threshold probability';
            }

            return (
              <div
                key={opt.id}
                onClick={() => onSelectOption && onSelectOption(opt)}
                className={`p-3 rounded-[11px] transition-colors cursor-pointer touch-press ${
                  showHighlight
                    ? 'bg-[#151E19] border border-white/[0.07] border-l-2 border-l-[#B6E63B]'
                    : isSelected
                    ? 'bg-[#151E19] border border-white/20 ring-1 ring-white/20'
                    : 'bg-[#151E19] border border-white/[0.07] hover:border-white/20'
                }`}
              >
                {/* Row 1: Rank (#1) in 11px mono muted, selection name at 13.5px font-semibold, status chip on the right */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[11px] text-[#8B9890] shrink-0 w-5">
                      #{idx + 1}
                    </span>
                    <span className="font-semibold text-[#ECF1EE] text-[13.5px] leading-tight truncate">
                      {cleanDisplayText(selectionName)}
                    </span>
                  </div>

                  {/* Status chip: small 11px chip */}
                  <div className="shrink-0">
                    {isQualified ? (
                      <span className="inline-block text-[10.5px] font-semibold px-2 py-0.5 rounded-[6px] border border-[#B6E63B]/40 text-[#B6E63B] bg-[rgba(182,230,59,0.12)]">
                        Qualified
                      </span>
                    ) : (
                      <span className="inline-block text-[10.5px] font-semibold px-2 py-0.5 rounded-[6px] border border-[#E2AE45]/40 text-[#E2AE45] bg-[rgba(226,174,69,0.12)]">
                        Abstain
                      </span>
                    )}
                  </div>
                </div>

                {/* Row 2: subline, 11px muted, indented under the name */}
                <div className="pl-7 mt-1 text-[11px] text-[#8B9890] leading-tight truncate">
                  <span>{cleanDisplayText(optionTypeLabel)}</span>
                  <span className="mx-1.5 text-white/20">·</span>
                  <span>{cleanDisplayText(periodLabel)}</span>
                  <span className="mx-1.5 text-white/20">·</span>
                  <span className="tabular-nums">Quality {(opt.dataQualityScore * 100).toFixed(0)}%</span>
                  <span className="mx-1.5 text-white/20">·</span>
                  <span>{cleanDisplayText(sublineReason)}</span>
                </div>

                {/* Row 3: 3 equal columns (Prob, Odds, EV). Labels 11px muted, values mono 13px, tabular-nums */}
                <div className="grid grid-cols-3 gap-2 pt-2.5 mt-2.5 border-t border-white/[0.05] text-left">
                  <div>
                    <span className="text-[10.5px] text-[#8B9890] block">Prob</span>
                    <span className="font-mono text-[13px] tabular-nums font-semibold text-[#ECF1EE]">
                      {(opt.modelProbability * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div>
                    <span className="text-[10.5px] text-[#8B9890] block">Odds</span>
                    <span className={`font-mono text-[13px] tabular-nums ${opt.marketOdds ? 'text-[#ECF1EE]' : 'text-[#8B9890]'}`}>
                      {oddsFormatted}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10.5px] text-[#8B9890] block">EV</span>
                    <span className={`font-mono text-[13px] tabular-nums font-semibold ${evFormatted.colorClass}`}>
                      {cleanDisplayText(evFormatted.text)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Collapsible Factor Breakdown Table */}
      <div className="pt-2 border-t border-white/[0.07]">
        <button
          onClick={() => setShowAllFactors(!showAllFactors)}
          type="button"
          className="flex items-center justify-between w-full text-[12px] text-[#8B9890] hover:text-[#ECF1EE] py-1 touch-press"
        >
          <span className="flex items-center gap-1.5 font-medium">
            <Sliders className="w-3.5 h-3.5 text-[#B6E63B]" />
            <span>Detailed factor contributions & shrinkage ({activeFactors.length} factors)</span>
          </span>
          {showAllFactors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAllFactors && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-[#151E19] text-[#8B9890] font-mono text-[10px] uppercase border-b border-white/[0.07]">
                <tr>
                  <th className="py-2 px-3">Factor</th>
                  <th className="py-2 px-3">Category</th>
                  <th className="py-2 px-3">Pre match measured data</th>
                  <th className="py-2 px-3">Shrinkage</th>
                  <th className="py-2 px-3">Ablation gain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {activeFactors.map((f, i) => {
                  const def = FACTOR_DEFINITIONS[f.factorCode];
                  return (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2 px-3">
                        <span className="font-semibold text-[#ECF1EE] block">{cleanDisplayText(f.factorName)}</span>
                        <span className="text-[10px] text-[#8B9890] font-mono">{cleanDisplayText(f.factorCode)}</span>
                      </td>
                      <td className="py-2 px-3 uppercase text-[10px] font-mono text-[#8B9890]">
                        {cleanDisplayText(f.category)}
                      </td>
                      <td className="py-2 px-3 text-[#8B9890]">
                        <div><span className="text-[#ECF1EE]">H:</span> {cleanDisplayText(f.homeValue)} · <span className="text-[#ECF1EE]">A:</span> {cleanDisplayText(f.awayValue)}</div>
                      </td>
                      <td className="py-2 px-3 font-mono text-[#ECF1EE] tabular-nums">
                        {(f.shrinkageApplied * 100).toFixed(0)}%
                      </td>
                      <td className="py-2 px-3 font-mono text-[#B6E63B] tabular-nums">
                        &#8722;{def?.ablationGainBrier.toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mandatory Platform Disclaimer */}
      <div className="p-2.5 bg-[#151E19] border border-white/[0.07] rounded-[11px] text-[11px] text-[#8B9890] flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-[#8B9890] shrink-0 mt-0.5" />
        <p className="leading-normal">
          <span className="text-[#ECF1EE] font-medium">Compliance note:</span> These selections are algorithmic research outputs. Calibrall is strictly an analytics terminal and does not facilitate wagers or guarantee outcomes.
        </p>
      </div>
    </div>
  );
}
