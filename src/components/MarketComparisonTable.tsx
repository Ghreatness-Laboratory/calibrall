'use client';

import React, { useState } from 'react';
import { MarketPrediction, SupportedOptionType } from '@/types';
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle, 
  ArrowUpDown, 
  ChevronRight,
  Clock,
  Layers,
  Scale
} from 'lucide-react';
import { SUPPORTED_OPTIONS_CATALOGUE, getPeriodLabel } from '@/lib/prediction/marketCatalog';

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
      pred.qualificationStatus === 'QUALIFIED_VALUE' ? 'Tier 1: Qualified Value' :
      pred.qualificationStatus === 'QUALIFIED_PROBABILITY' ? 'Tier 2: High Probability' :
      pred.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY' ? 'Unqualified: High Uncertainty' :
      'Unqualified: Marginal Edge'
    );

    switch (pred.qualificationStatus) {
      case 'QUALIFIED_VALUE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-brand-emerald border border-brand-emerald/30">
            <CheckCircle className="w-3 h-3 mr-1 shrink-0" />
            <span>{tierText}</span>
          </span>
        );
      case 'QUALIFIED_PROBABILITY':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-brand-blue border border-brand-blue/30">
            <CheckCircle className="w-3 h-3 mr-1 shrink-0" />
            <span>{tierText}</span>
          </span>
        );
      case 'UNQUALIFIED_HIGH_UNCERTAINTY':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-brand-rose border border-brand-rose/30">
            <AlertTriangle className="w-3 h-3 mr-1 shrink-0" />
            <span>{tierText}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-500/10 text-gray-400 border border-gray-700">
            <span>{tierText}</span>
          </span>
        );
    }
  };

  const renderConfidenceBadge = (confidence: string) => {
    const colors: Record<string, string> = {
      VERY_HIGH: 'text-brand-emerald bg-emerald-500/10 border-emerald-500/30',
      HIGH: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/20',
      MODERATE: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      LOW: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${colors[confidence] || 'text-gray-400'}`}>
        {confidence}
      </span>
    );
  };

  // Option types available in predictions
  const presentOptionTypes: { id: string; label: string }[] = [
    { id: 'ALL', label: 'All Options (10 Supported)' },
    { id: 'win', label: '1. Win' },
    { id: 'draw', label: '2. Draw' },
    { id: 'double_chance', label: '3. Double Chance' },
    { id: 'over_under_goals', label: '4. Over/Under Goals' },
    { id: 'both_teams_to_score', label: '5. BTTS' },
    { id: 'corners', label: '6. Corners' },
    { id: 'bookings', label: '7. Bookings' },
    { id: 'highest_scoring_half', label: '8. Highest Half' },
    { id: 'first_half_goals', label: '9. 1st Half Goals' },
    { id: 'second_half_result', label: '10. 2nd Half Result' },
  ];

  return (
    <div className="bg-surface-200 border border-border rounded overflow-hidden">
      {/* Option Type Filter Tabs */}
      <div className="p-3 bg-surface-100 border-b border-border space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center space-x-1.5 font-mono text-[11px] uppercase tracking-wider text-gray-300">
            <Layers className="w-3.5 h-3.5 text-brand-emerald" />
            <span>Filter by Supported Option Type:</span>
          </div>
          <span className="font-mono text-[11px] text-gray-400">
            Showing {sorted.length} / {predictions.length} candidate lines
          </span>
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto text-xs pb-1 scrollbar-thin">
          {presentOptionTypes.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterOptionType(tab.id)}
              className={`px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors ${
                filterOptionType === tab.id
                  ? 'bg-brand-emerald text-navy-950 font-semibold shadow-xs'
                  : 'text-gray-400 hover:text-white bg-surface-200 border border-border-subtle hover:bg-surface-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0c1017] text-gray-400 font-mono text-[11px] uppercase tracking-wider border-b border-border">
            <tr>
              <th className="py-2.5 px-3">Option & Selection</th>
              <th className="py-2.5 px-3">Period & Settlement</th>
              <th 
                className="py-2.5 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('modelProbability')}
              >
                <div className="flex items-center space-x-1">
                  <span>Model Prob</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th 
                className="py-2.5 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('marketOdds')}
              >
                <div className="flex items-center space-x-1">
                  <span>Price / Mode</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-2.5 px-3">Implied Prob</th>
              <th 
                className="py-2.5 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('expectedValue')}
              >
                <div className="flex items-center space-x-1">
                  <span>Edge / EV</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-2.5 px-3">Confidence</th>
              <th className="py-2.5 px-3">Evidence Tier</th>
              <th className="py-2.5 px-2 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
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
                      ? 'bg-surface-50 ring-1 ring-inset ring-brand-emerald'
                      : isTop
                      ? 'bg-brand-emerald/5 hover:bg-surface-50'
                      : 'hover:bg-surface-100'
                  }`}
                >
                  {/* Option & Selection */}
                  <td className="py-3 px-3">
                    <div className="flex items-center space-x-2">
                      {isTop && (
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-emerald shrink-0" title="Top Recommendation" />
                      )}
                      <div>
                        <div className="font-semibold text-white flex items-center space-x-1.5">
                          <span>{pred.selection}</span>
                          {isTop && (
                            <span className="text-[9px] bg-brand-emerald/20 text-brand-emerald px-1 rounded font-mono uppercase">Top Pick</span>
                          )}
                          {pred.pushProbability !== undefined && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 rounded font-mono" title={`Push probability: ${(pred.pushProbability * 100).toFixed(1)}%`}>
                              Push Rule
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 capitalize flex items-center space-x-1 mt-0.5">
                          <span className="text-brand-accent font-medium">{pred.marketName}</span>
                          <span>•</span>
                          <span className="font-mono text-gray-500">[{pred.optionType.replace(/_/g, ' ')}]</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Period & Settlement */}
                  <td className="py-3 px-3 text-[11px]">
                    <div className="flex flex-col">
                      <span className="font-mono font-medium text-gray-300 flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-brand-emerald shrink-0" />
                        <span>{getPeriodLabel(pred.period)}</span>
                      </span>
                      <span className="text-[10px] text-gray-500 truncate max-w-[150px]" title={pred.settlementRule}>
                        {pred.settlementRule}
                      </span>
                    </div>
                  </td>

                  {/* Model Probability */}
                  <td className="py-3 px-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-16 bg-navy-900 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-brand-emerald h-full rounded-full"
                          style={{ width: `${Math.min(100, pred.modelProbability * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono font-bold text-white tabular-nums">
                        {(pred.modelProbability * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>

                  {/* Market Odds / Analysis Mode */}
                  <td className="py-3 px-3 font-mono text-[11px]">
                    {pred.marketOdds ? (
                      <span className="bg-surface-100 px-1.5 py-0.5 rounded border border-border text-gray-200 font-bold">
                        {pred.marketOdds.toFixed(2)}
                      </span>
                    ) : (
                      <span className="inline-block text-[10px] text-blue-400/90 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                        Probability-Based
                      </span>
                    )}
                  </td>

                  {/* Implied Prob */}
                  <td className="py-3 px-3 font-mono text-gray-400 tabular-nums">
                    {pred.impliedProbability ? `${(pred.impliedProbability * 100).toFixed(1)}%` : '—'}
                  </td>

                  {/* Estimated EV / Edge */}
                  <td className="py-3 px-3 font-mono tabular-nums">
                    {pred.expectedValue !== undefined ? (
                      <span className={`font-semibold flex items-center space-x-0.5 ${
                        hasPositiveEv ? 'text-brand-emerald' : 'text-gray-500'
                      }`}>
                        {hasPositiveEv ? '+' : ''}{(pred.expectedValue * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-gray-500 italic text-[11px]">Analysis Only</span>
                    )}
                  </td>

                  {/* Confidence */}
                  <td className="py-3 px-3">
                    {renderConfidenceBadge(pred.modelConfidence)}
                  </td>

                  {/* Evidence Tier */}
                  <td className="py-3 px-3">
                    {renderStatusBadge(pred)}
                  </td>

                  {/* Detail Arrow */}
                  <td className="py-3 px-2 text-right text-gray-400">
                    <ChevronRight className="w-4 h-4 ml-auto" />
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
