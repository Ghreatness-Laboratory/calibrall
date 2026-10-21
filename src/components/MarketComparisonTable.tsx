'use client';

import React, { useState } from 'react';
import { MarketPrediction } from '@/types';
import { ArrowUpDown, Clock, ChevronRight, ChevronDown } from 'lucide-react';
import { 
  formatSelectionName, 
  getOptionTypeLabel, 
  getPeriodLabel, 
  formatExpectedValue, 
  formatOdds 
} from '@/lib/prediction/marketCatalog';

interface Props {
  predictions: MarketPrediction[];
  onSelectPrediction?: (prediction: MarketPrediction) => void;
  selectedPredictionId?: string;
}

const FILTER_ITEMS: { id: string; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'win', label: 'Win' },
  { id: 'draw', label: 'Draw' },
  { id: 'double_chance', label: 'Double chance' },
  { id: 'over_under_goals', label: 'Goals' },
  { id: 'both_teams_to_score', label: 'BTTS' },
  { id: 'corners', label: 'Corners' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'highest_scoring_half', label: 'Highest half' },
  { id: 'first_half_goals', label: '1st half goals' },
  { id: 'second_half_result', label: '2nd half result' },
];

export default function MarketComparisonTable({
  predictions,
  onSelectPrediction,
  selectedPredictionId,
}: Props) {
  const [filter, setFilter] = useState<string>('ALL');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = predictions.filter((p) => {
    if (filter === 'ALL') return true;
    return p.optionType === filter;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a.modelProbability;
    const bVal = b.modelProbability;
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  const handleRowClick = (pred: MarketPrediction) => {
    if (onSelectPrediction) {
      onSelectPrediction(pred);
    }
    setExpandedId((prev) => (prev === pred.id ? null : pred.id));
  };

  const getSpecialRuleTag = (pred: MarketPrediction) => {
    if (pred.marketCode === 'TOTAL_GOALS_O20_PUSH') {
      return 'Push at 2';
    }
    if (pred.period === 'FIRST_HALF') {
      return '1st half only';
    }
    if (pred.period === 'SECOND_HALF') {
      return '2nd half only';
    }
    if (pred.period === 'FULL_TIME') {
      return 'Full time';
    }
    return null;
  };

  return (
    <div className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] overflow-hidden">
      {/* Header: "All catalogue lines (24)" 15px/500 left, "Showing 24 of 24" 11px muted right */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b-[0.5px] border-white/[0.08]">
        <h3 className="text-[15px] font-[500] text-[#e8efe9]">
          All catalogue lines ({predictions.length})
        </h3>
        <span className="text-[11px] text-[#8fa69a]">
          Showing {sorted.length} of {predictions.length}
        </span>
      </div>

      {/* Filter chips: one scrollable row of pills (12px, 6px 12px padding), scrollbar hidden */}
      <div className="border-b-[0.5px] border-white/[0.08] bg-[#0c1c14] py-2 px-3.5">
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {FILTER_ITEMS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              type="button"
              className={`py-1.5 px-3 rounded-[6px] text-[12px] font-[500] transition-colors whitespace-nowrap shrink-0 ${
                filter === f.id
                  ? 'bg-[#b8e63a] text-[#0a1812]'
                  : 'bg-[#0f2219] text-[#8fa69a] hover:text-[#e8efe9] border-[0.5px] border-white/[0.08]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Single note above the list: clock icon, 11px muted */}
      <div className="flex items-center gap-1.5 px-3.5 py-2 border-b-[0.5px] border-white/[0.06] bg-[#0c1c14]/40 text-[11px] text-[#8fa69a]">
        <Clock className="w-3.5 h-3.5 text-[#8fa69a] shrink-0" />
        <span>All lines settle on regular time (90 min) unless marked.</span>
      </div>

      {/* Table: 2 content columns plus chevron, grid-template-columns: minmax(0,1fr) auto 16px */}
      <div className="w-full">
        {/* Table header row: 11px muted sentence case, no ALL CAPS */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-3 px-3.5 py-2 text-[11px] text-[#8fa69a] border-b-[0.5px] border-white/[0.06] bg-[#0c1c14]/80 select-none">
          <div>Selection</div>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            type="button"
            className="flex items-center gap-1 hover:text-[#e8efe9] justify-end whitespace-nowrap"
            title="Sort by model probability"
          >
            <span>Prob</span>
            <ArrowUpDown className="w-3 h-3 text-[#8fa69a]" />
          </button>
          <div className="w-4" />
        </div>

        {/* Rows: 11px 14px padding, 0.5px hairline divider */}
        <div className="divide-y-[0.5px] divide-white/[0.06]">
          {sorted.map((pred) => {
            const isSelected = selectedPredictionId === pred.id;
            const isExpanded = expandedId === pred.id;
            const isTop = pred.isTopPick;
            const probPct = pred.modelProbability * 100;
            const selectionName = formatSelectionName(pred.selection);
            const categoryLabel = getOptionTypeLabel(pred.optionType);
            const specialTag = getSpecialRuleTag(pred);
            const evFormatted = formatExpectedValue(pred.expectedValue);
            const oddsFormatted = formatOdds(pred.marketOdds);

            return (
              <div key={pred.id} className="transition-colors">
                <div
                  onClick={() => handleRowClick(pred)}
                  className={`grid grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-3 px-3.5 py-[11px] cursor-pointer transition-colors ${
                    isTop
                      ? 'bg-[#b8e63a]/[0.05] border-l-2 border-[#b8e63a]'
                      : isSelected
                      ? 'bg-white/[0.04] border-l-2 border-white/40'
                      : 'hover:bg-white/[0.02] border-l-2 border-transparent'
                  }`}
                >
                  {/* Selection cell: name 13px/500 sentence case, category 11px muted beneath */}
                  <div className="min-w-0 pr-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13px] font-[500] text-[#e8efe9] leading-tight truncate">
                        {selectionName}
                      </span>
                      {specialTag && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[3px] bg-white/[0.06] border border-white/10 text-[#8fa69a] shrink-0 leading-none">
                          {specialTag}
                        </span>
                      )}
                      {isTop && (
                        <span className="text-[10px] text-[#b8e63a] border-[0.5px] border-[#b8e63a]/40 rounded-[3px] px-1.5 py-0.5 leading-none shrink-0 font-[500]">
                          Top pick
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#8fa69a] mt-0.5 truncate leading-tight">
                      {categoryLabel}
                    </div>
                  </div>

                  {/* Prob cell: mono 13px, right-aligned, tabular-nums, no clipped text */}
                  <div className="text-right whitespace-nowrap pl-2">
                    <span className="font-mono text-[13px] text-[#e8efe9] tabular-nums font-[500] leading-tight">
                      {probPct.toFixed(1)}%
                    </span>
                  </div>

                  {/* Chevron-right icon (14px) */}
                  <div className="w-4 h-4 flex items-center justify-center text-[#8fa69a] shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#e8efe9]" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </div>
                </div>

                {/* Expanded view showing full settlement rule and market details */}
                {isExpanded && (
                  <div className="px-3.5 pb-3 pt-1 bg-[#0c1c14]/40 border-t border-white/[0.04] text-[12px] space-y-2">
                    <div className="text-[11px] text-[#c9d6ce] leading-relaxed">
                      <span className="text-[#8fa69a] font-[500]">Settlement rule: </span>
                      {pred.settlementRule}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono pt-1 text-[#8fa69a]">
                      <div>
                        <span>Odds: </span>
                        <span className="text-[#e8efe9]">{oddsFormatted}</span>
                      </div>
                      <div>
                        <span>EV: </span>
                        <span className={`font-[500] ${evFormatted.colorClass}`}>{evFormatted.text}</span>
                      </div>
                      <div>
                        <span>Period: </span>
                        <span className="text-[#e8efe9]">{getPeriodLabel(pred.period)}</span>
                      </div>
                      {pred.pushProbability !== undefined && (
                        <div>
                          <span>Push prob: </span>
                          <span className="text-[#e8efe9]">{(pred.pushProbability * 100).toFixed(1)}%</span>
                        </div>
                      )}
                      <div>
                        {pred.qualificationStatus === 'QUALIFIED_VALUE' ? (
                          <span className="text-[#b8e63a] font-[500]">✓ Qualified value</span>
                        ) : pred.qualificationStatus === 'QUALIFIED_PROBABILITY' ? (
                          <span className="text-[#b8e63a] font-[500]">✓ Probability analysis</span>
                        ) : (
                          <span className="text-[#e3b341]">Abstain</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
