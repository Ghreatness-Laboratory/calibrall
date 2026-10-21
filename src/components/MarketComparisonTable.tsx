'use client';

import React, { useState } from 'react';
import { MarketPrediction, QualificationStatus } from '@/types';
import { TrendingUp, AlertTriangle, CheckCircle, HelpCircle, ArrowUpDown, ChevronRight } from 'lucide-react';

interface Props {
  predictions: MarketPrediction[];
  onSelectPrediction?: (prediction: MarketPrediction) => void;
  selectedPredictionId?: string;
}

type SortField = 'modelProbability' | 'expectedValue' | 'marketOdds' | 'marketCategory';

export default function MarketComparisonTable({
  predictions,
  onSelectPrediction,
  selectedPredictionId,
}: Props) {
  const [sortField, setSortField] = useState<SortField>('expectedValue');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const filtered = predictions.filter(p => {
    if (filterCategory === 'ALL') return true;
    return p.marketCategory === filterCategory;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[sortField] ?? -999;
    let bVal = b[sortField] ?? -999;
    if (sortField === 'marketCategory') {
      aVal = a.marketCategory;
      bVal = b.marketCategory;
    }
    if (aVal < bVal) return sortAsc ? -1 : 1;
    if (aVal > bVal) return sortAsc ? 1 : -1;
    return 0;
  });

  const renderStatusBadge = (status: QualificationStatus) => {
    switch (status) {
      case 'QUALIFIED_VALUE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-brand-emerald border border-brand-emerald/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            Qualified Value
          </span>
        );
      case 'QUALIFIED_PROBABILITY':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-brand-blue border border-brand-blue/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            High Probability
          </span>
        );
      case 'UNQUALIFIED_HIGH_UNCERTAINTY':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-brand-rose border border-brand-rose/30">
            <AlertTriangle className="w-3 h-3 mr-1" />
            High Uncertainty
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-500/10 text-gray-400 border border-gray-700">
            Marginal / No Edge
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

  return (
    <div className="bg-surface-200 border border-border rounded overflow-hidden">
      {/* Category filters */}
      <div className="p-3 bg-surface-100 border-b border-border flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-1 overflow-x-auto text-xs">
          {[
            { id: 'ALL', label: 'All Markets' },
            { id: 'total_goals', label: 'Goals' },
            { id: 'btts', label: 'BTTS' },
            { id: 'total_corners', label: 'Corners' },
            { id: 'match_result', label: '1X2 Result' },
            { id: 'bookings', label: 'Cards' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterCategory(tab.id)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                filterCategory === tab.id
                  ? 'bg-brand-emerald text-navy-950 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-surface-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-gray-400 font-mono">
          Showing {sorted.length} candidate lines
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0c1017] text-gray-400 font-mono text-[11px] uppercase tracking-wider border-b border-border">
            <tr>
              <th className="py-2.5 px-3">Market & Selection</th>
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
                  <span>Decimal Odds</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-2.5 px-3">Implied Prob</th>
              <th 
                className="py-2.5 px-3 cursor-pointer hover:text-white"
                onClick={() => handleSort('expectedValue')}
              >
                <div className="flex items-center space-x-1">
                  <span>Estimated EV</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-2.5 px-3">Confidence</th>
              <th className="py-2.5 px-3">Qualification</th>
              <th className="py-2.5 px-2 text-right">Details</th>
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
                  {/* Market & Selection */}
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
                        </div>
                        <div className="text-[10px] text-gray-400 capitalize">{pred.marketName}</div>
                      </div>
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

                  {/* Market Odds */}
                  <td className="py-3 px-3 font-mono font-medium text-gray-200">
                    {pred.marketOdds ? (
                      <span className="bg-surface-100 px-1.5 py-0.5 rounded border border-border">
                        {pred.marketOdds.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-gray-500 italic">Unpublished</span>
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
                      <span className="text-gray-500">—</span>
                    )}
                  </td>

                  {/* Confidence */}
                  <td className="py-3 px-3">
                    {renderConfidenceBadge(pred.modelConfidence)}
                  </td>

                  {/* Qualification Status */}
                  <td className="py-3 px-3">
                    {renderStatusBadge(pred.qualificationStatus)}
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
