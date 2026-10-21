'use client';

import React, { useState } from 'react';
import { MarketPrediction } from '@/types';
import { 
  ArrowUpDown, 
  ChevronRight,
  Clock,
  Layers
} from 'lucide-react';
import { getPeriodLabel } from '@/lib/prediction/marketCatalog';

interface Props {
  predictions: MarketPrediction[];
  onSelectPrediction?: (prediction: MarketPrediction) => void;
  selectedPredictionId?: string;
}

type SortField = 'modelProbability' | 'expectedValue' | 'marketOdds' | 'marketCategory' | 'optionType';

export default function MarketComparisonTable({
  predictions,
  onSelectPrediction,
  selectedPredictionId,
}: Props) {
  const [sortField, setSortField] = useState<SortField>('expectedValue');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [filterOptionType, setFilterOptionType] = useState<string>('ALL');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const filtered = predictions.filter(p => {
    if (filterOptionType === 'ALL') return true;
    return p.optionType === filterOptionType;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[sortField] ?? -999;
    let bVal = b[sortField] ?? -999;
    if (sortField === 'marketCategory') {
      aVal = a.marketCategory;
      bVal = b.marketCategory;
    } else if (sortField === 'optionType') {
      aVal = a.optionType;
      bVal = b.optionType;
    }
    if (aVal < bVal) return sortAsc ? -1 : 1;
    if (aVal > bVal) return sortAsc ? 1 : -1;
    return 0;
  });

  const renderStatusBadge = (pred: MarketPrediction) => {
    const tierText = pred.evidenceTier || (
      pred.qualificationStatus === 'QUALIFIED_VALUE' ? 'Tier 1: Qualified value' :
      pred.qualificationStatus === 'QUALIFIED_PROBABILITY' ? 'Tier 2: High probability' :
      pred.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY' ? 'Unqualified: Uncertainty' :
      'Unqualified: Marginal edge'
    );

    switch (pred.qualificationStatus) {
      case 'QUALIFIED_VALUE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-[500] bg-[#b8e63a]/15 text-[#b8e63a] border border-[#b8e63a]/30">
            <span>{tierText}</span>
          </span>
        );
      case 'QUALIFIED_PROBABILITY':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-[500] bg-white/[0.08] text-[#e8efe9] border border-white/20">
            <span>{tierText}</span>
          </span>
        );
      case 'UNQUALIFIED_HIGH_UNCERTAINTY':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-[500] bg-rose-500/10 text-rose-300 border border-rose-500/20">
            <span>{tierText}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-[500] bg-white/[0.04] text-[#8fa69a] border border-white/[0.08]">
            <span>{tierText}</span>
          </span>
        );
    }
  };

  const presentOptionTypes: { id: string; label: string }[] = [
    { id: 'ALL', label: 'All 10 options' },
    { id: 'win', label: '1. Win' },
    { id: 'draw', label: '2. Draw' },
    { id: 'double_chance', label: '3. Double chance' },
    { id: 'over_under_goals', label: '4. Over/under' },
    { id: 'both_teams_to_score', label: '5. BTTS' },
    { id: 'corners', label: '6. Corners' },
    { id: 'bookings', label: '7. Bookings' },
    { id: 'highest_scoring_half', label: '8. Highest half' },
    { id: 'first_half_goals', label: '9. 1st half' },
    { id: 'second_half_result', label: '10. 2nd half' },
  ];

  return (
    <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] overflow-hidden">
      {/* Option Type Filter Tabs */}
      <div className="p-3 bg-[#0a1812]/50 border-b border-white/[0.08] space-y-2">
        <div className="flex items-center justify-between text-[11px] text-[#8fa69a]">
          <div className="flex items-center gap-1.5 font-mono text-[#e8efe9]">
            <Layers className="w-3.5 h-3.5 text-[#b8e63a]" />
            <span>Filter by catalog option:</span>
          </div>
          <span className="font-mono">
            Showing {sorted.length} / {predictions.length} lines
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1">
          {presentOptionTypes.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterOptionType(tab.id)}
              type="button"
              className={`px-2 py-0.5 rounded-[4px] whitespace-nowrap transition-colors ${
                filterOptionType === tab.id
                  ? 'bg-[#b8e63a] text-[#0a1812] font-[500]'
                  : 'text-[#8fa69a] hover:text-[#e8efe9] bg-[#0a1812] border border-white/[0.06]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-[#0a1812]/80 text-[#8fa69a] font-mono text-[10px] uppercase border-b border-white/[0.06]">
            <tr>
              <th className="py-2 px-3">Option & selection</th>
              <th className="py-2 px-3">Period</th>
              <th 
                className="py-2 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('modelProbability')}
              >
                <div className="flex items-center gap-1">
                  <span>Prob</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th 
                className="py-2 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('marketOdds')}
              >
                <div className="flex items-center gap-1">
                  <span>Price</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th 
                className="py-2 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('expectedValue')}
              >
                <div className="flex items-center gap-1">
                  <span>EV</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-2 px-3">Evidence tier</th>
              <th className="py-2 px-2 text-right">Audit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {sorted.map((pred) => {
              const isSelected = selectedPredictionId === pred.id;
              const hasPositiveEv = (pred.expectedValue ?? 0) > 0;
              const isTop = pred.isTopPick;

              return (
                <tr
                  key={pred.id}
                  onClick={() => onSelectPrediction && onSelectPrediction(pred)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-white/[0.06] ring-1 ring-inset ring-[#b8e63a]'
                      : isTop
                      ? 'bg-[#b8e63a]/[0.03] hover:bg-white/[0.02]'
                      : 'hover:bg-white/[0.02]'
                  }`}
                >
                  {/* Option & Selection */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      {isTop && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#b8e63a] shrink-0" title="Top Recommendation" />
                      )}
                      <div>
                        <div className="font-[500] text-[#e8efe9] flex items-center gap-1.5">
                          <span>{pred.selection}</span>
                          {isTop && (
                            <span className="text-[9px] bg-[#b8e63a]/20 text-[#b8e63a] px-1 rounded-[3px] font-mono">
                              Top pick
                            </span>
                          )}
                          {pred.pushProbability !== undefined && (
                            <span className="text-[9px] bg-white/10 text-[#8fa69a] px-1 rounded-[3px] font-mono">
                              Push
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#8fa69a] flex items-center gap-1 mt-0.5">
                          <span className="text-[#b8e63a]">{pred.marketName}</span>
                          <span>·</span>
                          <span className="font-mono">{pred.optionType.replace(/_/g, ' ')}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Period & Settlement */}
                  <td className="py-2.5 px-3 text-[11px]">
                    <div className="flex flex-col">
                      <span className="font-mono text-[#e8efe9] flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#b8e63a] shrink-0" />
                        <span>{getPeriodLabel(pred.period)}</span>
                      </span>
                      <span className="text-[10px] text-[#8fa69a] truncate max-w-[130px]" title={pred.settlementRule}>
                        {pred.settlementRule}
                      </span>
                    </div>
                  </td>

                  {/* Model Probability */}
                  <td className="py-2.5 px-3 font-mono text-[#e8efe9] tabular-nums font-[500]">
                    {(pred.modelProbability * 100).toFixed(1)}%
                  </td>

                  {/* Market Odds / Analysis Mode */}
                  <td className="py-2.5 px-3 font-mono text-[11px]">
                    {pred.marketOdds ? (
                      <span className="bg-[#0a1812] px-1.5 py-0.5 rounded-[4px] border border-white/[0.08] text-[#e8efe9]">
                        {pred.marketOdds.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#8fa69a] bg-[#0a1812] px-1.5 py-0.5 rounded-[4px] border border-white/[0.06]">
                        Analysis
                      </span>
                    )}
                  </td>

                  {/* Estimated EV */}
                  <td className="py-2.5 px-3 font-mono tabular-nums">
                    {pred.expectedValue !== undefined ? (
                      <span className={hasPositiveEv ? 'text-[#b8e63a] font-[500]' : 'text-[#8fa69a]'}>
                        {hasPositiveEv ? '+' : ''}{((pred.expectedValue ?? 0) * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[#8fa69a]/60 text-[11px]">—</span>
                    )}
                  </td>

                  {/* Evidence Tier */}
                  <td className="py-2.5 px-3">
                    {renderStatusBadge(pred)}
                  </td>

                  {/* Detail Arrow */}
                  <td className="py-2.5 px-2 text-right text-[#8fa69a]">
                    <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
