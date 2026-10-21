'use client';

import React, { useState, useMemo } from 'react';
import { MarketPrediction, RiskTier } from '@/types';
import { 
  ArrowUpDown, 
  Clock, 
  ChevronRight, 
  ChevronDown, 
  Sliders, 
  ShieldCheck, 
  AlertTriangle,
  Layers,
  Scale,
  Gauge,
  Info
} from 'lucide-react';
import { 
  formatSelectionName, 
  getOptionTypeLabel, 
  getPeriodLabel, 
  formatExpectedValue, 
  formatOdds,
  getRiskTierBadge
} from '@/lib/prediction/marketCatalog';

interface Props {
  predictions: MarketPrediction[];
  onSelectPrediction?: (prediction: MarketPrediction) => void;
  selectedPredictionId?: string;
  homeTeamName?: string;
  awayTeamName?: string;
}

type ViewMode = 'TIER_GROUPED' | 'MARKET_SECTIONS' | 'ALL_LINES';

export default function MarketComparisonTable({
  predictions,
  onSelectPrediction,
  selectedPredictionId,
  homeTeamName = 'Home',
  awayTeamName = 'Away',
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('TIER_GROUPED');
  const [marketFilter, setMarketFilter] = useState<string>('ALL');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Handicap interactive state
  const [handicapMode, setHandicapMode] = useState<'asian' | 'european'>('asian');
  const [selectedHandicapLine, setSelectedHandicapLine] = useState<number>(0.5);

  const handleRowClick = (pred: MarketPrediction) => {
    if (onSelectPrediction) {
      onSelectPrediction(pred);
    }
    setExpandedId((prev) => (prev === pred.id ? null : pred.id));
  };

  // Group by risk tier
  const tierGroups = useMemo(() => {
    const safe: MarketPrediction[] = [];
    const moderate: MarketPrediction[] = [];
    const risky: MarketPrediction[] = [];
    const longshot: MarketPrediction[] = [];
    const insufficientData: MarketPrediction[] = [];

    predictions.forEach(p => {
      if (p.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY' && (p.evidenceTier?.includes('Insufficient Data') || p.explanation?.dataLimitations?.some(d => d.includes('Insufficient')))) {
        insufficientData.push(p);
      } else if (p.riskTier === 'SAFE') {
        safe.push(p);
      } else if (p.riskTier === 'MODERATE') {
        moderate.push(p);
      } else if (p.riskTier === 'RISKY') {
        risky.push(p);
      } else {
        longshot.push(p);
      }
    });

    return {
      safe: safe.sort((a, b) => b.modelProbability - a.modelProbability),
      moderate: moderate.sort((a, b) => b.modelProbability - a.modelProbability),
      risky: risky.sort((a, b) => b.modelProbability - a.modelProbability),
      longshot: longshot.sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0)),
      insufficientData
    };
  }, [predictions]);

  // Handicap lines analysis
  const handicapPredictions = useMemo(() => {
    return predictions.filter(p => p.marketCategory === 'handicap' || p.optionType === 'asian_handicap' || p.optionType === 'european_handicap');
  }, [predictions]);

  // Safest handicap line per team
  const safestHomeHandicap = useMemo(() => {
    const homeLines = handicapPredictions.filter(p => p.handicapType === 'asian' && p.selection.includes(homeTeamName));
    return homeLines.sort((a, b) => b.modelProbability - a.modelProbability)[0];
  }, [handicapPredictions, homeTeamName]);

  const safestAwayHandicap = useMemo(() => {
    const awayLines = handicapPredictions.filter(p => p.handicapType === 'asian' && p.selection.includes(awayTeamName));
    return awayLines.sort((a, b) => b.modelProbability - a.modelProbability)[0];
  }, [handicapPredictions, awayTeamName]);

  // Goal bounds analysis
  const goalBoundsPredictions = useMemo(() => {
    return predictions.filter(p => p.marketCategory === 'goal_bounds' || p.optionType === 'goal_bounds' || p.optionType === 'team_goal_bounds');
  }, [predictions]);

  const mostLikelyGoalBand = useMemo(() => {
    const matchBands = goalBoundsPredictions.filter(p => p.optionType === 'goal_bounds');
    return matchBands.sort((a, b) => b.modelProbability - a.modelProbability)[0];
  }, [goalBoundsPredictions]);

  const safestWideBand = useMemo(() => {
    // Wide bands: 1-3, 0-2, 2-4
    const wideBands = goalBoundsPredictions.filter(p => ['1-3', '0-2', '2-4'].includes(p.goalBand || ''));
    return wideBands.sort((a, b) => b.modelProbability - a.modelProbability)[0];
  }, [goalBoundsPredictions]);

  // Halves analysis
  const halfPredictions = useMemo(() => {
    return predictions.filter(p => p.marketCategory === 'half_time' || p.optionType === 'highest_scoring_half' || p.optionType === 'first_half_goals' || p.optionType === 'second_half_result');
  }, [predictions]);

  const hasHalfData = useMemo(() => {
    return halfPredictions.length > 0 && !halfPredictions.every(p => p.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY');
  }, [halfPredictions]);

  // Filtered list for "All lines" table
  const filteredList = useMemo(() => {
    let list = predictions;
    if (marketFilter !== 'ALL') {
      list = list.filter(p => p.marketCategory === marketFilter || p.optionType === marketFilter);
    }
    return [...list].sort((a, b) => {
      const aVal = a.modelProbability;
      const bVal = b.modelProbability;
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
  }, [predictions, marketFilter, sortAsc]);

  const renderPredictionRow = (pred: MarketPrediction) => {
    const isSelected = selectedPredictionId === pred.id;
    const isExpanded = expandedId === pred.id;
    const isTop = pred.isTopPick;
    const probPct = pred.modelProbability * 100;
    const selectionName = formatSelectionName(pred.selection);
    const categoryLabel = getOptionTypeLabel(pred.optionType);
    const evFormatted = formatExpectedValue(pred.expectedValue);
    const oddsFormatted = formatOdds(pred.marketOdds);
    const tierBadge = getRiskTierBadge(pred.riskTier);

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
          {/* Selection cell */}
          <div className="min-w-0 pr-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[13px] font-[500] text-[#e8efe9] leading-tight truncate">
                {selectionName}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider ${tierBadge.badgeClass}`}>
                {tierBadge.label}
              </span>
              {isTop && (
                <span className="text-[9px] text-[#b8e63a] border-[0.5px] border-[#b8e63a]/40 rounded-[3px] px-1.5 py-0.5 leading-none shrink-0 font-[500]">
                  Top pick
                </span>
              )}
              {pred.pushProbability !== undefined && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-[3px] bg-white/[0.06] border border-white/10 text-[#8fa69a] shrink-0 leading-none">
                  Push {(pred.pushProbability * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#8fa69a] mt-0.5 truncate leading-tight flex items-center gap-2">
              <span>{categoryLabel}</span>
              {pred.plainEnglishReason && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="text-[#8fa69a]/80 truncate max-w-sm">{pred.plainEnglishReason}</span>
                </>
              )}
            </div>
          </div>

          {/* Prob & Odds cell */}
          <div className="text-right whitespace-nowrap pl-2 flex flex-col items-end">
            <span className="font-mono text-[13px] text-[#e8efe9] tabular-nums font-semibold leading-tight">
              {probPct.toFixed(1)}%
            </span>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8fa69a]">
              {pred.marketOdds && <span>@{oddsFormatted}</span>}
              {pred.expectedValue !== undefined && (
                <span className={evFormatted.colorClass}>{evFormatted.text}</span>
              )}
            </div>
          </div>

          {/* Chevron */}
          <div className="w-4 h-4 flex items-center justify-center text-[#8fa69a] shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#e8efe9]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="px-3.5 pb-3.5 pt-1 bg-[#0c1c14]/50 border-t border-white/[0.04] text-[12px] space-y-2">
            <div className="text-[11px] text-[#c9d6ce] leading-relaxed">
              <span className="text-[#8fa69a] font-[500]">Settlement rule: </span>
              {pred.settlementRule}
            </div>

            {pred.plainEnglishReason && (
              <div className="p-2 rounded bg-[#0a1812] border border-white/[0.06] text-[11px] text-[#b8e63a]">
                <span className="text-[#8fa69a] block font-mono text-[10px] uppercase">Model Rationale:</span>
                {pred.plainEnglishReason}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono pt-1 text-[#8fa69a]">
              <div>
                <span>Odds: </span>
                <span className="text-[#e8efe9]">{oddsFormatted}</span>
              </div>
              <div>
                <span>Edge: </span>
                <span className={pred.edge && pred.edge >= 0 ? 'text-[#b8e63a]' : 'text-[#8fa69a]'}>
                  {pred.edge !== undefined ? `${(pred.edge * 100).toFixed(1)}%` : 'n/a'}
                </span>
              </div>
              <div>
                <span>EV: </span>
                <span className={`font-[500] ${evFormatted.colorClass}`}>{evFormatted.text}</span>
              </div>
              <div>
                <span>Confidence: </span>
                <span className="text-[#e8efe9]">{((pred.confidenceScore ?? 0.75) * 100).toFixed(0)}%</span>
              </div>
              {pred.winProb !== undefined && (
                <div>
                  <span>Win/Push/Loss: </span>
                  <span className="text-[#e8efe9]">
                    {(pred.winProb * 100).toFixed(0)}% / {((pred.pushProb ?? 0) * 100).toFixed(0)}% / {((pred.lossProb ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] overflow-hidden space-y-0">
      {/* Header with View Mode Tabs */}
      <div className="p-3.5 border-b-[0.5px] border-white/[0.08] flex flex-wrap items-center justify-between gap-3 bg-[#0a1812]/50">
        <div>
          <h3 className="text-[15px] font-[500] text-[#e8efe9] flex items-center gap-2">
            <span>Market Intel & Candidate Lines ({predictions.length})</span>
          </h3>
          <p className="text-[11px] text-[#8fa69a] mt-0.5">
            Dixon-Coles bivariate distributions & negative binomial models grouped by risk tier.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-[#0c1c14] p-1 rounded-[8px] border border-white/[0.08] text-[11px]">
          <button
            onClick={() => setViewMode('TIER_GROUPED')}
            type="button"
            className={`px-2.5 py-1 rounded-[6px] font-[500] transition-colors ${
              viewMode === 'TIER_GROUPED' ? 'bg-[#b8e63a] text-[#0a1812]' : 'text-[#8fa69a] hover:text-[#e8efe9]'
            }`}
          >
            Grouped by Tier
          </button>
          <button
            onClick={() => setViewMode('MARKET_SECTIONS')}
            type="button"
            className={`px-2.5 py-1 rounded-[6px] font-[500] transition-colors ${
              viewMode === 'MARKET_SECTIONS' ? 'bg-[#b8e63a] text-[#0a1812]' : 'text-[#8fa69a] hover:text-[#e8efe9]'
            }`}
          >
            Special Markets
          </button>
          <button
            onClick={() => setViewMode('ALL_LINES')}
            type="button"
            className={`px-2.5 py-1 rounded-[6px] font-[500] transition-colors ${
              viewMode === 'ALL_LINES' ? 'bg-[#b8e63a] text-[#0a1812]' : 'text-[#8fa69a] hover:text-[#e8efe9]'
            }`}
          >
            All Lines
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: GROUPED BY TIER (Requirement 11) */}
      {viewMode === 'TIER_GROUPED' && (
        <div className="divide-y divide-white/[0.08]">
          {/* SAFE TIER */}
          <div className="p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#b8e63a]" />
                <h4 className="text-[13px] font-[600] text-[#b8e63a]">
                  SAFE TIERS (≥75% Probability & High Confidence)
                </h4>
                <span className="text-[10px] font-mono text-[#8fa69a] bg-white/[0.05] px-1.5 py-0.5 rounded">
                  {tierGroups.safe.length} lines
                </span>
              </div>
            </div>
            {tierGroups.safe.length > 0 ? (
              <div className="divide-y-[0.5px] divide-white/[0.06] border border-white/[0.06] rounded-[8px] overflow-hidden bg-[#0a1812]/30">
                {tierGroups.safe.map(renderPredictionRow)}
              </div>
            ) : (
              <p className="text-[11px] text-[#8fa69a] italic px-2 py-1">No markets currently satisfy the strict SAFE criteria (≥75% prob & ≥70% confidence).</p>
            )}
          </div>

          {/* MODERATE TIER */}
          <div className="p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#e3b341]" />
                <h4 className="text-[13px] font-[600] text-[#e3b341]">
                  MODERATE TIERS (60% - 75% Probability)
                </h4>
                <span className="text-[10px] font-mono text-[#8fa69a] bg-white/[0.05] px-1.5 py-0.5 rounded">
                  {tierGroups.moderate.length} lines
                </span>
              </div>
            </div>
            {tierGroups.moderate.length > 0 ? (
              <div className="divide-y-[0.5px] divide-white/[0.06] border border-white/[0.06] rounded-[8px] overflow-hidden bg-[#0a1812]/30">
                {tierGroups.moderate.map(renderPredictionRow)}
              </div>
            ) : (
              <p className="text-[11px] text-[#8fa69a] italic px-2 py-1">No markets in the moderate range.</p>
            )}
          </div>

          {/* RISKY TIER */}
          <div className="p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
                <h4 className="text-[13px] font-[600] text-orange-400">
                  RISKY VALUE PLAYS (45% - 60% Probability with Edge)
                </h4>
                <span className="text-[10px] font-mono text-[#8fa69a] bg-white/[0.05] px-1.5 py-0.5 rounded">
                  {tierGroups.risky.length} lines
                </span>
              </div>
            </div>
            {tierGroups.risky.length > 0 ? (
              <div className="divide-y-[0.5px] divide-white/[0.06] border border-white/[0.06] rounded-[8px] overflow-hidden bg-[#0a1812]/30">
                {tierGroups.risky.map(renderPredictionRow)}
              </div>
            ) : (
              <p className="text-[11px] text-[#8fa69a] italic px-2 py-1">No markets classified as risky value plays.</p>
            )}
          </div>

          {/* LONGSHOTS */}
          {tierGroups.longshot.length > 0 && (
            <div className="p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                  <h4 className="text-[13px] font-[600] text-purple-300">
                    LONGSHOTS (&lt;45% Probability)
                  </h4>
                  <span className="text-[10px] font-mono text-[#8fa69a] bg-white/[0.05] px-1.5 py-0.5 rounded">
                    {tierGroups.longshot.length} lines
                  </span>
                </div>
              </div>
              <div className="divide-y-[0.5px] divide-white/[0.06] border border-white/[0.06] rounded-[8px] overflow-hidden bg-[#0a1812]/30">
                {tierGroups.longshot.slice(0, 4).map(renderPredictionRow)}
              </div>
            </div>
          )}

          {/* INSUFFICIENT DATA / ABSTAIN SECTION (Requirement 14) */}
          {tierGroups.insufficientData.length > 0 && (
            <div className="p-3.5 space-y-2 bg-[#0c1c14]/40">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <h4 className="text-[12px] font-[600]">
                  INSUFFICIENT DATA (Model Abstains)
                </h4>
              </div>
              <p className="text-[11px] text-[#8fa69a]">
                In accordance with calibration standards, the engine skips fabricating probabilities when corner, card, or half split records lack adequate sample size.
              </p>
              <div className="divide-y-[0.5px] divide-white/[0.06] border border-white/[0.06] rounded-[8px] overflow-hidden bg-[#0a1812]/20">
                {tierGroups.insufficientData.map(renderPredictionRow)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: SPECIAL MARKETS (HANDICAP, GOAL BOUNDS, HALVES) - Requirement 16 */}
      {viewMode === 'MARKET_SECTIONS' && (
        <div className="p-4 space-y-6">
          {/* 1. HANDICAP SECTION */}
          <div className="bg-[#0a1812] border border-white/[0.08] rounded-[10px] p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#b8e63a]" />
                <h4 className="text-[14px] font-[600] text-[#e8efe9]">Handicap Intel (Asian & European)</h4>
              </div>

              {/* Handicap Switcher */}
              <div className="flex items-center gap-1 bg-[#0f2219] p-1 rounded-[6px] border border-white/[0.08] text-[11px]">
                <button
                  type="button"
                  onClick={() => setHandicapMode('asian')}
                  className={`px-2 py-0.5 rounded font-[500] ${handicapMode === 'asian' ? 'bg-[#b8e63a] text-[#0a1812]' : 'text-[#8fa69a]'}`}
                >
                  Asian Handicap
                </button>
                <button
                  type="button"
                  onClick={() => setHandicapMode('european')}
                  className={`px-2 py-0.5 rounded font-[500] ${handicapMode === 'european' ? 'bg-[#b8e63a] text-[#0a1812]' : 'text-[#8fa69a]'}`}
                >
                  European (3-Way)
                </button>
              </div>
            </div>

            {/* Safest Handicap Callouts (Requirement 16) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {safestHomeHandicap && (
                <div className="p-2.5 rounded-[8px] bg-[#0f2219] border border-white/[0.06] space-y-1">
                  <div className="text-[10px] uppercase font-mono text-[#8fa69a]">Safest {homeTeamName} line</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-[500] text-[#e8efe9]">{safestHomeHandicap.selection}</span>
                    <span className="font-mono text-[#b8e63a] font-bold">{(safestHomeHandicap.modelProbability * 100).toFixed(0)}%</span>
                  </div>
                  {safestHomeHandicap.pushProbability !== undefined && (
                    <div className="text-[10px] text-[#8fa69a]">Push returns stake (Push: {(safestHomeHandicap.pushProbability * 100).toFixed(0)}%)</div>
                  )}
                </div>
              )}

              {safestAwayHandicap && (
                <div className="p-2.5 rounded-[8px] bg-[#0f2219] border border-white/[0.06] space-y-1">
                  <div className="text-[10px] uppercase font-mono text-[#8fa69a]">Safest {awayTeamName} line</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-[500] text-[#e8efe9]">{safestAwayHandicap.selection}</span>
                    <span className="font-mono text-[#b8e63a] font-bold">{(safestAwayHandicap.modelProbability * 100).toFixed(0)}%</span>
                  </div>
                  {safestAwayHandicap.pushProbability !== undefined && (
                    <div className="text-[10px] text-[#8fa69a]">Push returns stake (Push: {(safestAwayHandicap.pushProbability * 100).toFixed(0)}%)</div>
                  )}
                </div>
              )}
            </div>

            {/* Handicap lines list */}
            <div className="divide-y-[0.5px] divide-white/[0.06] border border-white/[0.06] rounded-[8px] overflow-hidden bg-[#0c1c14]/40">
              {handicapPredictions
                .filter(p => p.handicapType === handicapMode)
                .map(renderPredictionRow)}
            </div>
          </div>

          {/* 2. GOAL BOUNDS SECTION (Requirement 16) */}
          <div className="bg-[#0a1812] border border-white/[0.08] rounded-[10px] p-4 space-y-3.5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#b8e63a]" />
                <h4 className="text-[14px] font-[600] text-[#e8efe9]">Goal Bounds (Total & Team Goal Ranges)</h4>
              </div>
              <span className="text-[11px] font-mono text-[#8fa69a]">Non-overlapping bands</span>
            </div>

            {/* Highlights: Most likely band & Safest wide band */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mostLikelyGoalBand && (
                <div className="p-2.5 rounded-[8px] bg-[#0f2219] border border-white/[0.06] space-y-1">
                  <div className="text-[10px] uppercase font-mono text-[#8fa69a]">Most Likely Goal Band</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-[500] text-[#e8efe9]">{mostLikelyGoalBand.selection}</span>
                    <span className="font-mono text-[#b8e63a] font-bold">{(mostLikelyGoalBand.modelProbability * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-[10px] text-[#8fa69a]">Modal point of bivariate Poisson joint matrix</div>
                </div>
              )}

              {safestWideBand && (
                <div className="p-2.5 rounded-[8px] bg-[#0f2219] border border-white/[0.06] space-y-1">
                  <div className="text-[10px] uppercase font-mono text-[#8fa69a]">Safest Wide Band Cushion</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-[500] text-[#e8efe9]">{safestWideBand.selection}</span>
                    <span className="font-mono text-[#b8e63a] font-bold">{(safestWideBand.modelProbability * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-[10px] text-[#8fa69a]">Wide range covers bulk of simulated scorelines</div>
                </div>
              )}
            </div>

            {/* Bands table */}
            <div className="divide-y-[0.5px] divide-white/[0.06] border border-white/[0.06] rounded-[8px] overflow-hidden bg-[#0c1c14]/40">
              {goalBoundsPredictions.map(renderPredictionRow)}
            </div>
          </div>

          {/* 3. HALVES ANALYSIS SECTION (Requirement 16) */}
          <div className="bg-[#0a1812] border border-white/[0.08] rounded-[10px] p-4 space-y-3.5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#b8e63a]" />
                <h4 className="text-[14px] font-[600] text-[#e8efe9]">Half-by-Half Breakdown & Highest Scoring Half</h4>
              </div>
              <span className="text-[11px] font-mono text-[#8fa69a]">
                {hasHalfData ? 'Empirically calibrated (100% sum)' : 'Insufficient split data'}
              </span>
            </div>

            {hasHalfData ? (
              <div className="divide-y-[0.5px] divide-white/[0.06] border border-white/[0.06] rounded-[8px] overflow-hidden bg-[#0c1c14]/40">
                {halfPredictions.map(renderPredictionRow)}
              </div>
            ) : (
              <div className="p-4 rounded-[8px] bg-[#0f2219] border border-white/[0.06] text-center text-[12px] text-[#8fa69a] space-y-1">
                <AlertTriangle className="w-4 h-4 text-amber-400 mx-auto" />
                <p className="font-[500] text-[#e8efe9]">Insufficient Half Split Data</p>
                <p>First-half and second-half goal records not available. Engine abstains to prevent fabricated projections.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW MODE 3: ALL LINES TRADITIONAL TABLE */}
      {viewMode === 'ALL_LINES' && (
        <div className="space-y-0">
          {/* Filter Bar for All Lines */}
          <div className="border-b-[0.5px] border-white/[0.08] bg-[#0c1c14] py-2 px-3.5 flex items-center justify-between gap-3 text-[11px]">
            <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
              {['ALL', 'match_result', 'double_chance', 'handicap', 'total_goals', 'goal_bounds', 'half_time', 'total_corners', 'bookings', 'combos'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setMarketFilter(cat)}
                  type="button"
                  className={`px-2.5 py-1 rounded-[6px] font-[500] transition-colors whitespace-nowrap ${
                    marketFilter === cat
                      ? 'bg-[#b8e63a] text-[#0a1812]'
                      : 'bg-[#0f2219] text-[#8fa69a] hover:text-[#e8efe9] border border-white/[0.08]'
                  }`}
                >
                  {cat === 'ALL' ? 'All' : cat.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSortAsc(!sortAsc)}
              type="button"
              className="flex items-center gap-1 text-[#8fa69a] hover:text-[#e8efe9] shrink-0 font-mono"
            >
              <span>Prob</span>
              <ArrowUpDown className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y-[0.5px] divide-white/[0.06]">
            {filteredList.map(renderPredictionRow)}
          </div>
        </div>
      )}

      {/* Mandatory Statistical Estimate Disclaimer (Requirement 15) */}
      <div className="p-3 bg-[#0a1812]/80 border-t border-white/[0.08] text-[11px] text-[#8fa69a] flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-[#8fa69a] shrink-0" />
        <span>Statistical estimate only: model probabilities are derived from Dixon-Coles parameters and do not represent guaranteed outcomes.</span>
      </div>
    </div>
  );
}
