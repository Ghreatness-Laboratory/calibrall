'use client';

import React, { useState } from 'react';
import { MarketPrediction } from '@/types';
import {
  STATE_TAG_REGISTRY,
  FACTOR_DEFINITIONS,
  ContextEvaluationResult,
} from '@/lib/prediction/contextFactors';
import {
  getOptionTypeLabel,
  getPeriodLabel,
  formatSelectionName,
  formatOdds,
} from '@/lib/prediction/marketCatalog';
import {
  Cpu,
  CheckCircle2,
  AlertCircle,
  Info,
  Clock,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { isTeamNewsEnabled } from '@/lib/prediction/featureFlags';

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
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-4 space-y-4">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Cpu className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="font-display text-[14px] font-semibold text-[var(--text)]">
              Context factors &amp; state-based weighting
            </h2>
            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)]">
              L2 shrinkage active
            </span>
          </div>
          <p className="text-[12px] text-[var(--text-2)] mt-0.5 leading-[1.5]">
            Pre-match data points weighted through regularized models.
          </p>
        </div>

        <div>
          {isTeamNewsEnabled() ? (
            lineupStatus === 'confirmed' ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[var(--accent)] text-[11px] font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Lineups confirmed</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--medium-soft)] border border-[var(--medium)]/30 text-[var(--medium)] text-[11px] font-semibold">
                <Clock className="w-3.5 h-3.5" />
                <span>Pre-lineup mode</span>
              </div>
            )
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--line)] text-[var(--text-2)] text-[11px]">
              <span>Team news pending</span>
            </div>
          )}
        </div>
      </div>

      {/* Pre-lineup Warning Banner */}
      {isTeamNewsEnabled() && lineupStatus === 'pre-lineup' && (
        <div className="p-3 bg-[var(--surface-2)] border border-[var(--medium)]/30 rounded-[12px] text-[12px] text-[var(--text-2)] flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--medium)]" />
          <div className="leading-[1.5]">
            <span className="text-[var(--text)] font-semibold">Pre-lineup state: </span>
            Official team sheets are not yet published. The engine applies an automatic{' '}
            <span className="text-[var(--medium)] font-semibold">+22% uncertainty margin</span>.
          </div>
        </div>
      )}

      {/* State Tags Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11.5px] tabular-nums">
          <span className="text-[var(--text-2)] font-medium">
            Active state tags ({stateTags.length})
          </span>
          <span className="text-[var(--text-2)]">
            Uncertainty <span className="text-[var(--text)] font-semibold">{compositeUncertaintyMultiplier.toFixed(2)}x</span> · Quality{' '}
            <span className="text-[var(--accent)] font-semibold">{(dataQualityScore * 100).toFixed(0)}%</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {stateTags.map((tag) => {
            const info = STATE_TAG_REGISTRY[tag];
            return (
              <div
                key={tag}
                className="p-3 rounded-[12px] bg-[var(--surface-2)] border border-[var(--line)] space-y-1"
              >
                <div className="flex items-center justify-between text-[11px] gap-2">
                  <span className="font-semibold text-[var(--accent)] truncate">
                    #{cleanDisplayText(tag)}
                  </span>
                  <span className="text-[10.5px] text-[var(--text-2)] bg-[var(--surface)] px-2 py-0.5 rounded-full border border-[var(--line)] shrink-0 tabular-nums">
                    {info?.uncertaintyMultiplier
                      ? `+${((info.uncertaintyMultiplier - 1) * 100).toFixed(0)}% spread`
                      : 'Active'}
                  </span>
                </div>
                <div className="text-[12.5px] font-semibold text-[var(--text)]">
                  {cleanDisplayText(info?.label ?? tag)}
                </div>
                <p className="text-[11px] text-[var(--text-2)] leading-snug">
                  {cleanDisplayText(info?.hypothesis)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Missing Factors Flagging */}
      {missingFactors.length > 0 && (
        <div className="p-3 bg-[var(--surface-2)] border border-[var(--danger)]/30 rounded-[12px] space-y-2 text-[12px]">
          <div className="flex items-center gap-1.5 text-[var(--danger)] font-semibold">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Missing factor penalties (explicitly penalized)</span>
          </div>
          <div className="space-y-1.5">
            {missingFactors.map((mf, i) => (
              <div
                key={i}
                className="flex items-start justify-between bg-[var(--surface)] p-2.5 rounded-[10px] border border-[var(--line)] text-[11.5px]"
              >
                <div>
                  <span className="font-medium text-[var(--text)]">
                    {cleanDisplayText(mf.factorName)}
                  </span>
                  <p className="text-[var(--text-2)]">{cleanDisplayText(mf.reason)}</p>
                </div>
                <span className="text-[var(--danger)] shrink-0 ml-2 font-semibold tabular-nums">
                  +{(mf.uncertaintyPenalty * 100).toFixed(0)}% spread
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correlation Warnings */}
      {correlationWarnings.length > 0 && (
        <div className="p-3 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] space-y-1 text-[11.5px]">
          <div className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
            <Info className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Inter-market correlation notes</span>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-[var(--text-2)]">
            {correlationWarnings.map((w, i) => (
              <li key={i}>{cleanDisplayText(w)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Top Ranked Options */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[14px] font-semibold text-[var(--text)]">
            Model probability analysis ({rankedOptions.length} markets)
          </h3>
          <span className="text-[11px] text-[var(--text-2)]">Data coverage</span>
        </div>

        <div className="space-y-2">
          {rankedOptions.map((opt, idx) => {
            const isSelected = selectedOptionId === opt.id;
            const isQualified =
              opt.qualificationStatus === 'QUALIFIED_VALUE' ||
              opt.qualificationStatus === 'QUALIFIED_PROBABILITY';
            const showHighlight = opt.isTopPick && isQualified;

            const selectionName = formatSelectionName(opt.selection);
            const optionTypeLabel = getOptionTypeLabel(opt.optionType);
            const periodLabel = getPeriodLabel(opt.period);
            const oddsFormatted = formatOdds(opt.marketOdds);

            let sublineReason = 'High uncertainty';
            const tierLower = (opt.evidenceTier || '').toLowerCase();
            if (opt.qualificationStatus === 'QUALIFIED_VALUE') {
              sublineReason = 'Model probability';
            } else if (opt.qualificationStatus === 'QUALIFIED_PROBABILITY') {
              sublineReason = 'Model probability';
            } else if (tierLower.includes('inadequate data')) {
              sublineReason = 'Inadequate data';
            } else if (tierLower.includes('draw')) {
              sublineReason = 'Draw variance';
            } else if (
              opt.qualificationStatus === 'UNQUALIFIED_MARGINAL' ||
              tierLower.includes('marginal')
            ) {
              sublineReason = 'Withheld: analysis only';
            } else if (tierLower.includes('sub')) {
              sublineReason = 'Sub-threshold probability';
            }

            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectOption && onSelectOption(opt)}
                className={`w-full text-left p-3.5 rounded-[12px] transition-colors touch-press border ${
                  showHighlight
                    ? 'bg-[var(--surface-2)] border-[var(--accent)]/40'
                    : isSelected
                    ? 'bg-[var(--surface-2)] border-[var(--border-strong)]'
                    : 'bg-[var(--surface-2)] border-[var(--line)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] text-[var(--text-2)] shrink-0 w-5 tabular-nums">
                      #{idx + 1}
                    </span>
                    <span className="font-display font-semibold text-[var(--text)] text-[14px] leading-tight truncate">
                      {cleanDisplayText(selectionName)}
                    </span>
                  </div>

                  <div className="shrink-0">
                    {isQualified ? (
                      <span className="inline-block text-[10.5px] font-semibold px-2.5 py-0.5 rounded-full border border-[var(--accent)]/35 text-[var(--accent)] bg-[var(--accent-soft)]">
                        Calibrated
                      </span>
                    ) : (
                      <span className="inline-block text-[10.5px] font-semibold px-2.5 py-0.5 rounded-full border border-[var(--medium)]/35 text-[var(--medium)] bg-[var(--medium-soft)]">
                        Analysis only
                      </span>
                    )}
                  </div>
                </div>

                <div className="pl-7 mt-1 text-[11px] text-[var(--text-2)] leading-tight truncate">
                  <span>{cleanDisplayText(optionTypeLabel)}</span>
                  <span className="mx-1.5 text-[var(--text-3)]">·</span>
                  <span>{cleanDisplayText(periodLabel)}</span>
                  <span className="mx-1.5 text-[var(--text-3)]">·</span>
                  <span className="tabular-nums">
                    Quality {(opt.dataQualityScore * 100).toFixed(0)}%
                  </span>
                  <span className="mx-1.5 text-[var(--text-3)]">·</span>
                  <span>{cleanDisplayText(sublineReason)}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2.5 mt-2.5 border-t border-[var(--line)] text-left tabular-nums">
                  <div>
                    <span className="text-[10.5px] text-[var(--text-2)] block">Prob</span>
                    <span className="font-display text-[13.5px] font-bold text-[var(--text)]">
                      {(opt.modelProbability * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div>
                    <span className="text-[10.5px] text-[var(--text-2)] block">Odds</span>
                    <span
                      className={`text-[13px] font-medium ${
                        opt.marketOdds ? 'text-[var(--text)]' : 'text-[var(--text-2)]'
                      }`}
                    >
                      {oddsFormatted}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10.5px] text-[var(--text-2)] block">Status</span>
                    <span className="text-[11.5px] font-semibold text-[var(--text-2)]">
                      {isQualified ? 'Calibrated' : 'Analysis only'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Collapsible Factor Breakdown Table */}
      <div className="pt-2 border-t border-[var(--line)]">
        <button
          onClick={() => setShowAllFactors(!showAllFactors)}
          type="button"
          className="min-h-[44px] flex items-center justify-between w-full text-[12.5px] text-[var(--text-2)] hover:text-[var(--text)] py-1 touch-press"
        >
          <span className="flex items-center gap-2 font-medium">
            <Sliders className="w-4 h-4 text-[var(--accent)]" />
            <span>Detailed factor contributions &amp; shrinkage ({activeFactors.length})</span>
          </span>
          {showAllFactors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAllFactors && (
          <div className="mt-2 overflow-x-auto rounded-[12px] border border-[var(--line)]">
            <table className="w-full text-left text-[11.5px]">
              <thead className="bg-[var(--surface-2)] text-[var(--text-2)] text-[10.5px] font-medium border-b border-[var(--line)]">
                <tr>
                  <th className="py-2.5 px-3">Factor</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Pre-match data</th>
                  <th className="py-2.5 px-3">Shrinkage</th>
                  <th className="py-2.5 px-3">Ablation gain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {activeFactors.map((f, i) => {
                  const def = FACTOR_DEFINITIONS[f.factorCode];
                  return (
                    <tr key={i} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-[var(--text)] block">
                          {cleanDisplayText(f.factorName)}
                        </span>
                        <span className="text-[10.5px] text-[var(--text-2)]">
                          {cleanDisplayText(f.factorCode)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[var(--text-2)]">
                        {cleanDisplayText(f.category)}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-2)]">
                        <span className="text-[var(--text)] font-medium">H:</span>{' '}
                        {cleanDisplayText(f.homeValue)} ·{' '}
                        <span className="text-[var(--text)] font-medium">A:</span>{' '}
                        {cleanDisplayText(f.awayValue)}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text)] tabular-nums">
                        {(f.shrinkageApplied * 100).toFixed(0)}%
                      </td>
                      <td className="py-2.5 px-3 text-[var(--accent)] font-semibold tabular-nums">
                        −{def?.ablationGainBrier.toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Compliance Disclaimer */}
      <div className="p-3 bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] text-[11.5px] text-[var(--text-2)] flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-[var(--text-2)] shrink-0 mt-0.5" />
        <p className="leading-[1.5]">
          <span className="text-[var(--text)] font-semibold">Compliance note: </span>
          These selections are algorithmic research outputs. Calibrall is an analytics terminal and does not facilitate wagers or guarantee outcomes.
        </p>
      </div>
    </div>
  );
}
