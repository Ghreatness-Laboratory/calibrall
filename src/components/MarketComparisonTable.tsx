'use client';

import React, { useState } from 'react';
import { MarketPrediction } from '@/types';
import { ArrowUpDown } from 'lucide-react';

interface Props {
  predictions: MarketPrediction[];
  onSelectPrediction?: (prediction: MarketPrediction) => void;
  selectedPredictionId?: string;
}

type FilterCategory = 'ALL' | 'goals' | 'btts' | 'corners' | '1X2';

export default function MarketComparisonTable({
  predictions,
  onSelectPrediction,
  selectedPredictionId,
}: Props) {
  const [filter, setFilter] = useState<FilterCategory>('ALL');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const filters: { id: FilterCategory; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: 'goals', label: 'Goals' },
    { id: 'btts', label: 'BTTS' },
    { id: 'corners', label: 'Corners' },
    { id: '1X2', label: '1X2' },
  ];

  const filtered = predictions.filter((p) => {
    if (filter === 'ALL') return true;
    if (filter === 'goals') {
      return (
        p.marketCategory === 'total_goals' ||
        p.optionType === 'over_under_goals' ||
        p.optionType === 'first_half_goals'
      );
    }
    if (filter === 'btts') {
      return (
        p.marketCategory === 'btts' ||
        p.optionType === 'both_teams_to_score'
      );
    }
    if (filter === 'corners') {
      return (
        p.marketCategory === 'total_corners' ||
        p.marketCategory === 'team_corners' ||
        p.optionType === 'corners'
      );
    }
    if (filter === '1X2') {
      return (
        p.marketCategory === 'match_result' ||
        p.optionType === 'win' ||
        p.optionType === 'draw' ||
        p.optionType === 'double_chance'
      );
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a.modelProbability;
    const bVal = b.modelProbability;
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  const cleanSelectionName = (name: string) => {
    return name
      .replace(/ Football Club/gi, '')
      .replace(/ FC/gi, '')
      .replace(/ CF/gi, '');
  };

  return (
    <div className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] overflow-hidden">
      {/* Filter Chips: compact pill chips that fit on one row at 360px */}
      <div className="p-3 border-b-[0.5px] border-white/[0.08] bg-[#0c1c14]">
        <div className="flex items-center justify-between gap-1 w-full text-[12px]">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              type="button"
              className={`flex-1 text-center py-1.5 px-2 rounded-[6px] text-[12px] font-[500] transition-colors whitespace-nowrap ${
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

      {/* 3-Column List Layout: Market | Model prob | Odds */}
      <div className="w-full">
        {/* Header row: 11px muted sentence case, no ALL CAPS */}
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_56px] items-center gap-2 px-3.5 py-2.5 text-[11px] text-[#8fa69a] border-b-[0.5px] border-white/[0.06] bg-[#0c1c14]/60 select-none">
          <div>Market</div>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            type="button"
            className="flex items-center gap-1 hover:text-[#e8efe9] text-left"
            title="Sort by model probability"
          >
            <span>Model prob</span>
            <ArrowUpDown className="w-3.5 h-3.5 text-[#8fa69a]" />
          </button>
          <div className="text-center">Odds</div>
        </div>

        {/* Rows: 12px 14px padding, 0.5px hairline divider */}
        <div className="divide-y-[0.5px] divide-white/[0.06]">
          {sorted.map((pred) => {
            const isSelected = selectedPredictionId === pred.id;
            const isTop = pred.isTopPick;
            const probPct = pred.modelProbability * 100;

            return (
              <div
                key={pred.id}
                onClick={() => onSelectPrediction && onSelectPrediction(pred)}
                className={`grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_56px] items-center gap-2 px-3.5 py-3 cursor-pointer transition-colors relative ${
                  isTop
                    ? 'bg-[#b8e63a]/[0.07] border-l-2 border-[#b8e63a]'
                    : isSelected
                    ? 'bg-white/[0.04] border-l-2 border-white/40'
                    : 'hover:bg-white/[0.02] border-l-2 border-transparent'
                }`}
              >
                {/* Market cell: selection 13px/500 on one line, market type beneath in 11px muted. Short team names. */}
                <div className="min-w-0 pr-1">
                  <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                    <span className="text-[13px] font-[500] text-[#e8efe9] leading-tight truncate">
                      {cleanSelectionName(pred.selection)}
                    </span>
                    {isTop && (
                      <span className="text-[11px] text-[#b8e63a] border-[0.5px] border-[#b8e63a]/40 rounded-[4px] px-1.5 py-0.5 leading-none shrink-0 font-[500] whitespace-nowrap">
                        Top pick
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#8fa69a] mt-0.5 truncate leading-tight">
                    {pred.marketName}
                  </div>
                </div>

                {/* Model prob cell: value in mono 13px (tabular-nums) with 3px progress bar beneath it */}
                <div className="min-w-0 pr-2">
                  <div className="font-mono text-[13px] text-[#e8efe9] tabular-nums font-[500] leading-tight">
                    {probPct.toFixed(1)}%
                  </div>
                  <div className="w-full h-[3px] bg-white/[0.08] rounded-full overflow-hidden mt-1.5">
                    <div
                      className="h-full bg-[#b8e63a] rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(5, probPct))}%` }}
                    />
                  </div>
                </div>

                {/* Odds cell: mono 12px in a small outlined chip (0.5px border, 6px radius, 4px vertical padding), centered, fixed 56px width */}
                <div className="w-[56px] flex justify-center">
                  <span className="w-full text-center py-1 font-mono text-[12px] text-[#e8efe9] rounded-[6px] border-[0.5px] border-white/10 bg-[#0a1812] tabular-nums leading-none block">
                    {pred.marketOdds ? pred.marketOdds.toFixed(2) : '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
