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
import { cleanDisplayText } from '@/lib/utils/formatText';

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
      } else if (p.confidenceTier === 'HIGH' || p.riskTier === 'HIGH' || p.riskTier === 'SAFE') {
        safe.push(p);
      } else if (p.confidenceTier === 'MEDIUM' || p.riskTier === 'MEDIUM' || p.riskTier === 'MODERATE') {
        moderate.push(p);
      } else if (p.confidenceTier === 'LOW' || p.riskTier === 'LOW' || p.riskTier === 'RISKY') {
        risky.push(p);
      } else {
        longshot.push(p);
      }
    });

    return {
      safe: safe.sort((a, b) => (b.calibratedProbability ?? b.modelProbability) - (a.calibratedProbability ?? a.modelProbability)),
      moderate: moderate.sort((a, b) => (b.calibratedProbability ?? b.modelProbability) - (a.calibratedProbability ?? a.modelProbability)),
      risky: risky.sort((a, b) => (b.calibratedProbability ?? b.modelProbability) - (a.calibratedProbability ?? a.modelProbability)),
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

  // Goal bounds analysis (bands)
  const goalBoundsPredictions = useMemo(() => {
    return predictions.filter(p => p.marketCategory === 'goal_bounds');
  }, [predictions]);

  const mostLikelyGoalBand = useMemo(() => {
    return goalBoundsPredictions
      .filter(p => p.selection.includes('Exact') || p.selection.includes('goals') || p.selection.includes('to'))
      .sort((a, b) => b.modelProbability - a.modelProbability)[0];
  }, [goalBoundsPredictions]);

  const safestWideBand = useMemo(() => {
    return goalBoundsPredictions
      .filter(p => p.selection.includes('2 to 4') || p.selection.includes('1 to 3') || p.selection.includes('2 to 5') || p.selection.includes('Wide'))
      .sort((a, b) => b.modelProbability - a.modelProbability)[0];
  }, [goalBoundsPredictions]);

  // Halves predictions
  const halfPredictions = useMemo(() => {
    return predictions.filter(p => p.marketCategory === 'half_time');
  }, [predictions]);

  const hasHalfData = halfPredictions.length > 0;

  // Filtered list for "ALL_LINES" mode
  const filteredList = useMemo(() => {
    let list = [...predictions];
    if (marketFilter !== 'ALL') {
      list = list.filter(p => p.marketCategory === marketFilter || p.optionType === marketFilter);
    }
    return list.sort((a, b) => {
      const pA = a.calibratedProbability ?? a.modelProbability;
      const pB = b.calibratedProbability ?? b.modelProbability;
      return sortAsc ? pA - pB : pB - pA;
    });
  }, [predictions, marketFilter, sortAsc]);

  const renderPredictionRow = (pred: MarketPrediction) => {
    const isSelected = selectedPredictionId === pred.id;
    const isExpanded = expandedId === pred.id;
    const isAbstained = pred.qualificationStatus === 'UNQUALIFIED_HIGH_UNCERTAINTY';
    const probPct = (pred.calibratedProbability ?? pred.modelProbability) * 100;
    const oddsFormatted = pred.marketOdds ? formatOdds(pred.marketOdds) : 'N/A';
    const evFormatted = formatExpectedValue(pred.expectedValue);
    const riskBadge = getRiskTierBadge(pred.riskTier);

    return (
      <div 
        key={pred.id} 
        className={`transition-colors border-b border-white/[0.05] ${
          isSelected ? 'bg-[rgba(182,230,59,0.08)]' : 'hover:bg-white/[0.02]'
        }`}
      >
        <div 
          onClick={() => handleRowClick(pred)}
          className="p-3 flex items-center justify-between cursor-pointer select-none text-[12px] gap-2 touch-press"
        >
          {/* Main selection column */}
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <span className={`font-semibold truncate text-[13px] ${isSelected ? 'text-[#B6E63B]' : 'text-[#ECF1EE]'}`}>
                {cleanDisplayText(pred.selection)}
              </span>
              {pred.handicapLine !== undefined && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#151E19] text-[#8B9890] rounded border border-white/[0.07]">
                  {pred.handicapLine > 0 ? `+${pred.handicapLine}` : pred.handicapLine}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[10.5px] text-[#8B9890] mt-0.5">
              <span>{cleanDisplayText(getOptionTypeLabel(pred.optionType))}</span>
              <span>·</span>
              <span className="font-mono">{cleanDisplayText(getPeriodLabel(pred.period))}</span>
              {pred.riskTier && (
                <>
                  <span>·</span>
                  <span className={`px-1.5 py-0.2 rounded-full font-mono text-[9px] ${riskBadge.badgeClass}`}>
                    {cleanDisplayText(riskBadge.label)}
                  </span>
                </>
              )}
              {pred.settlementStatus && pred.settlementStatus !== 'PENDING' && (
                <>
                  <span>·</span>
                  <span className={`px-1.5 py-0.2 rounded-full font-mono text-[9px] font-bold ${
                    pred.settlementStatus === 'WON' ? 'bg-[#B6E63B]/20 text-[#B6E63B] border border-[#B6E63B]/30' :
                    pred.settlementStatus === 'LOST' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                    pred.settlementStatus === 'PUSH' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                    'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                  }`}>
                    {pred.settlementStatus}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Prob & Odds cell */}
          <div className="text-right whitespace-nowrap pl-2 flex flex-col items-end">
            <span className="font-mono text-[13px] text-[#ECF1EE] tabular-nums font-semibold leading-tight">
              {probPct.toFixed(1)}%
            </span>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8B9890]">
              {pred.sanityTripwire && (
                <span className="px-1 py-0.2 rounded text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Check data
                </span>
              )}
              {pred.marketOdds ? (
                <span className="tabular-nums">@{oddsFormatted}</span>
              ) : (
                <span className="text-[9px] text-[#5E6A63]">No odds</span>
              )}
              {pred.expectedValue !== undefined && pred.expectedValue !== null && (
                <span className={`${evFormatted.colorClass} tabular-nums`}>{cleanDisplayText(evFormatted.text)}</span>
              )}
            </div>
          </div>

          {/* Chevron */}
          <div className="w-4 h-4 flex items-center justify-center text-[#8B9890] shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#ECF1EE]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="px-3.5 pb-3.5 pt-1 bg-[#151E19]/60 border-t border-white/[0.05] text-[12px] space-y-2">
            {pred.settlementStatus && pred.settlementStatus !== 'PENDING' && (
              <div className="p-2.5 rounded-[8px] bg-[#101713] border border-white/[0.07] text-[11px] flex flex-wrap items-center justify-between gap-2">
                <span className="text-[#8B9890] font-mono text-[10px] uppercase">Settlement Outcome:</span>
                <span className={`font-mono font-semibold ${
                  pred.settlementStatus === 'WON' ? 'text-[#B6E63B]' :
                  pred.settlementStatus === 'LOST' ? 'text-rose-400' :
                  pred.settlementStatus === 'PUSH' ? 'text-amber-300' : 'text-[#8B9890]'
                }`}>
                  {cleanDisplayText(pred.lineComparisonText || pred.settlementStatus)}
                </span>
              </div>
            )}

            <div className="text-[11px] text-[#8B9890] leading-relaxed">
              <span className="text-[#ECF1EE] font-medium">Settlement rule: </span>
              {cleanDisplayText(pred.settlementRule)}
            </div>

            {pred.plainEnglishReason && (
              <div className="p-2.5 rounded-[8px] bg-[#101713] border border-white/[0.07] text-[11px] text-[#B6E63B]">
                <span className="text-[#8B9890] block font-mono text-[10px] uppercase tracking-wider">Model Rationale:</span>
                {cleanDisplayText(pred.plainEnglishReason)}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono pt-1 text-[#8B9890] tabular-nums">
              <div>
                <span>Odds: </span>
                <span className="text-[#ECF1EE]">{oddsFormatted}</span>
              </div>
              <div>
                <span>Edge: </span>
                <span className={pred.edge && pred.edge >= 0 ? 'text-[#B6E63B]' : 'text-[#8B9890]'}>
                  {pred.edge !== undefined ? `${(pred.edge * 100).toFixed(1)}%` : 'n/a'}
                </span>
              </div>
              <div>
                <span>EV: </span>
                <span className={`font-semibold ${evFormatted.colorClass}`}>{evFormatted.text}</span>
              </div>
              <div>
                <span>Confidence: </span>
                <span className="text-[#ECF1EE]">{((pred.confidenceScore ?? 0.75) * 100).toFixed(0)}%</span>
              </div>
              {pred.winProb !== undefined && (
                <div>
                  <span>Win/Push/Loss: </span>
                  <span className="text-[#ECF1EE]">
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
    <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] overflow-hidden space-y-0">
      {/* Header with View Mode Tabs */}
      <div className="p-3.5 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-3 bg-[#151E19]/50">
        <div>
          <h3 className="text-[14px] font-semibold text-[#ECF1EE] flex items-center gap-2">
            <span>Market Intel & Candidate Lines ({predictions.length})</span>
          </h3>
          <p className="text-[11px] text-[#8B9890] mt-0.5">
            Dixon Coles bivariate distributions & negative binomial models grouped by risk tier.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-[#101713] p-1 rounded-[11px] border border-white/[0.07] text-[11px]">
          <button
            onClick={() => setViewMode('TIER_GROUPED')}
            type="button"
            className={`px-2.5 py-1 rounded-[8px] font-medium transition-colors touch-press ${
              viewMode === 'TIER_GROUPED' ? 'bg-[#B6E63B] text-[#0A0F0D] font-bold' : 'text-[#8B9890] hover:text-[#ECF1EE]'
            }`}
          >
            Grouped by Tier
          </button>
          <button
            onClick={() => setViewMode('MARKET_SECTIONS')}
            type="button"
            className={`px-2.5 py-1 rounded-[8px] font-medium transition-colors touch-press ${
              viewMode === 'MARKET_SECTIONS' ? 'bg-[#B6E63B] text-[#0A0F0D] font-bold' : 'text-[#8B9890] hover:text-[#ECF1EE]'
            }`}
          >
            Special Markets
          </button>
          <button
            onClick={() => setViewMode('ALL_LINES')}
            type="button"
            className={`px-2.5 py-1 rounded-[8px] font-medium transition-colors touch-press ${
              viewMode === 'ALL_LINES' ? 'bg-[#B6E63B] text-[#0A0F0D] font-bold' : 'text-[#8B9890] hover:text-[#ECF1EE]'
            }`}
          >
            All Lines
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: GROUPED BY TIER */}
      {viewMode === 'TIER_GROUPED' && (
        <div className="divide-y divide-white/[0.07]">
          {/* HIGH CONFIDENCE TIER */}
          <div className="p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B6E63B]" />
                <h4 className="text-[12.5px] font-semibold text-[#B6E63B]">
                  HIGH CONFIDENCE TIERS (≥60% Calibrated Probability & Low Uncertainty)
                </h4>
                <span className="text-[10px] font-mono text-[#8B9890] bg-white/[0.05] px-1.5 py-0.5 rounded">
                  {tierGroups.safe.length} lines
                </span>
              </div>
            </div>
            {tierGroups.safe.length > 0 ? (
              <div className="divide-y divide-white/[0.05] border border-white/[0.07] rounded-[11px] overflow-hidden bg-[#151E19]/40">
                {tierGroups.safe.map(renderPredictionRow)}
              </div>
            ) : (
              <p className="text-[11px] text-[#8B9890] italic px-2 py-1">No candidate lines meet the rigorous High Confidence criteria without risk flags.</p>
            )}
          </div>

          {/* MEDIUM CONFIDENCE TIER */}
          <div className="p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E2AE45]" />
                <h4 className="text-[12.5px] font-semibold text-[#E2AE45]">
                  MEDIUM CONFIDENCE TIERS (Balanced Edge and Moderate Variance)
                </h4>
                <span className="text-[10px] font-mono text-[#8B9890] bg-white/[0.05] px-1.5 py-0.5 rounded">
                  {tierGroups.moderate.length} lines
                </span>
              </div>
            </div>
            {tierGroups.moderate.length > 0 ? (
              <div className="divide-y divide-white/[0.05] border border-white/[0.07] rounded-[11px] overflow-hidden bg-[#151E19]/40">
                {tierGroups.moderate.map(renderPredictionRow)}
              </div>
            ) : (
              <p className="text-[11px] text-[#8B9890] italic px-2 py-1">No markets in the medium confidence range.</p>
            )}
          </div>

          {/* LOW CONFIDENCE TIER */}
          <div className="p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
                <h4 className="text-[12.5px] font-semibold text-orange-400">
                  LOW CONFIDENCE VALUE PLAYS (Higher Variance or Risk Flags Present)
                </h4>
                <span className="text-[10px] font-mono text-[#8B9890] bg-white/[0.05] px-1.5 py-0.5 rounded">
                  {tierGroups.risky.length} lines
                </span>
              </div>
            </div>
            {tierGroups.risky.length > 0 ? (
              <div className="divide-y divide-white/[0.05] border border-white/[0.07] rounded-[11px] overflow-hidden bg-[#151E19]/40">
                {tierGroups.risky.map(renderPredictionRow)}
              </div>
            ) : (
              <p className="text-[11px] text-[#8B9890] italic px-2 py-1">No markets classified as low confidence value plays.</p>
            )}
          </div>

          {/* LONGSHOTS */}
          {tierGroups.longshot.length > 0 && (
            <div className="p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                  <h4 className="text-[12.5px] font-semibold text-purple-300">
                    LONGSHOTS (&lt;45% Probability)
                  </h4>
                  <span className="text-[10px] font-mono text-[#8B9890] bg-white/[0.05] px-1.5 py-0.5 rounded">
                    {tierGroups.longshot.length} lines
                  </span>
                </div>
              </div>
              <div className="divide-y divide-white/[0.05] border border-white/[0.07] rounded-[11px] overflow-hidden bg-[#151E19]/40">
                {tierGroups.longshot.slice(0, 4).map(renderPredictionRow)}
              </div>
            </div>
          )}

          {/* INSUFFICIENT DATA / ABSTAIN SECTION */}
          {tierGroups.insufficientData.length > 0 && (
            <div className="p-3.5 space-y-2 bg-[#151E19]/50">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <h4 className="text-[12px] font-semibold">
                  INSUFFICIENT DATA (Model Abstains)
                </h4>
              </div>
              <p className="text-[11px] text-[#8B9890]">
                In accordance with calibration standards, the engine skips fabricating probabilities when corner, card, or half split records lack adequate sample size.
              </p>
              <div className="divide-y divide-white/[0.05] border border-white/[0.07] rounded-[11px] overflow-hidden bg-[#101713]/50">
                {tierGroups.insufficientData.map(renderPredictionRow)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: SPECIAL MARKETS */}
      {viewMode === 'MARKET_SECTIONS' && (
        <div className="p-3.5 space-y-4">
          {/* 1. HANDICAP SECTION */}
          <div className="bg-[#151E19] border border-white/[0.07] rounded-[11px] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#B6E63B]" />
                <h4 className="text-[13px] font-semibold text-[#ECF1EE]">Handicap Intel (Asian & European)</h4>
              </div>

              {/* Handicap Switcher */}
              <div className="flex items-center gap-1 bg-[#101713] p-1 rounded-[8px] border border-white/[0.07] text-[11px]">
                <button
                  type="button"
                  onClick={() => setHandicapMode('asian')}
                  className={`px-2 py-0.5 rounded font-medium touch-press ${handicapMode === 'asian' ? 'bg-[#B6E63B] text-[#0A0F0D] font-bold' : 'text-[#8B9890]'}`}
                >
                  Asian Handicap
                </button>
                <button
                  type="button"
                  onClick={() => setHandicapMode('european')}
                  className={`px-2 py-0.5 rounded font-medium touch-press ${handicapMode === 'european' ? 'bg-[#B6E63B] text-[#0A0F0D] font-bold' : 'text-[#8B9890]'}`}
                >
                  European (3 Way)
                </button>
              </div>
            </div>

            {/* Top Handicap Callouts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {safestHomeHandicap && (
                <div className="p-2.5 rounded-[8px] bg-[#101713] border border-white/[0.07] space-y-1">
                  <div className="text-[10px] uppercase font-mono text-[#8B9890]">Top {cleanDisplayText(homeTeamName)} line</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-medium text-[#ECF1EE]">{cleanDisplayText(safestHomeHandicap.selection)}</span>
                    <span className="font-mono text-[#B6E63B] font-bold tabular-nums">{(safestHomeHandicap.modelProbability * 100).toFixed(0)}%</span>
                  </div>
                  {safestHomeHandicap.pushProbability !== undefined && (
                    <div className="text-[10px] text-[#8B9890] tabular-nums">Push returns stake (Push: {(safestHomeHandicap.pushProbability * 100).toFixed(0)}%)</div>
                  )}
                </div>
              )}

              {safestAwayHandicap && (
                <div className="p-2.5 rounded-[8px] bg-[#101713] border border-white/[0.07] space-y-1">
                  <div className="text-[10px] uppercase font-mono text-[#8B9890]">Top {cleanDisplayText(awayTeamName)} line</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-medium text-[#ECF1EE]">{cleanDisplayText(safestAwayHandicap.selection)}</span>
                    <span className="font-mono text-[#B6E63B] font-bold tabular-nums">{(safestAwayHandicap.modelProbability * 100).toFixed(0)}%</span>
                  </div>
                  {safestAwayHandicap.pushProbability !== undefined && (
                    <div className="text-[10px] text-[#8B9890] tabular-nums">Push returns stake (Push: {(safestAwayHandicap.pushProbability * 100).toFixed(0)}%)</div>
                  )}
                </div>
              )}
            </div>

            {/* Handicap lines list */}
            <div className="divide-y divide-white/[0.05] border border-white/[0.07] rounded-[8px] overflow-hidden bg-[#101713]/50">
              {handicapPredictions
                .filter(p => p.handicapType === handicapMode)
                .map(renderPredictionRow)}
            </div>
          </div>

          {/* 2. GOAL BOUNDS SECTION */}
          <div className="bg-[#151E19] border border-white/[0.07] rounded-[11px] p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#B6E63B]" />
                <h4 className="text-[13px] font-semibold text-[#ECF1EE]">Goal Bounds (Total & Team Goal Ranges)</h4>
              </div>
              <span className="text-[11px] font-mono text-[#8B9890]">Non overlapping bands</span>
            </div>

            {/* Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {mostLikelyGoalBand && (
                <div className="p-2.5 rounded-[8px] bg-[#101713] border border-white/[0.07] space-y-1">
                  <div className="text-[10px] uppercase font-mono text-[#8B9890]">Most Likely Goal Band</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-medium text-[#ECF1EE]">{cleanDisplayText(mostLikelyGoalBand.selection)}</span>
                    <span className="font-mono text-[#B6E63B] font-bold tabular-nums">{(mostLikelyGoalBand.modelProbability * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-[10px] text-[#8B9890]">Modal point of bivariate Poisson joint matrix</div>
                </div>
              )}

              {safestWideBand && (
                <div className="p-2.5 rounded-[8px] bg-[#101713] border border-white/[0.07] space-y-1">
                  <div className="text-[10px] uppercase font-mono text-[#8B9890]">Top Wide Band Cushion</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-medium text-[#ECF1EE]">{cleanDisplayText(safestWideBand.selection)}</span>
                    <span className="font-mono text-[#B6E63B] font-bold tabular-nums">{(safestWideBand.modelProbability * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-[10px] text-[#8B9890]">Wide range covers bulk of simulated scorelines</div>
                </div>
              )}
            </div>

            {/* Bands table */}
            <div className="divide-y divide-white/[0.05] border border-white/[0.07] rounded-[8px] overflow-hidden bg-[#101713]/50">
              {goalBoundsPredictions.map(renderPredictionRow)}
            </div>
          </div>

          {/* 3. HALVES ANALYSIS SECTION */}
          <div className="bg-[#151E19] border border-white/[0.07] rounded-[11px] p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#B6E63B]" />
                <h4 className="text-[13px] font-semibold text-[#ECF1EE]">Half by Half Breakdown & Highest Scoring Half</h4>
              </div>
              <span className="text-[11px] font-mono text-[#8B9890]">
                {hasHalfData ? 'Empirically calibrated (100% sum)' : 'Insufficient split data'}
              </span>
            </div>

            {hasHalfData ? (
              <div className="divide-y divide-white/[0.05] border border-white/[0.07] rounded-[8px] overflow-hidden bg-[#101713]/50">
                {halfPredictions.map(renderPredictionRow)}
              </div>
            ) : (
              <div className="p-4 rounded-[8px] bg-[#101713] border border-white/[0.07] text-center text-[12px] text-[#8B9890] space-y-1">
                <AlertTriangle className="w-4 h-4 text-[#E2AE45] mx-auto" />
                <p className="font-semibold text-[#ECF1EE]">Insufficient Half Split Data</p>
                <p>First half and second half goal records not available. Engine abstains to prevent fabricated projections.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW MODE 3: ALL LINES TRADITIONAL TABLE */}
      {viewMode === 'ALL_LINES' && (
        <div className="space-y-0">
          {/* Filter Bar for All Lines */}
          <div className="border-b border-white/[0.07] bg-[#151E19] py-2 px-3.5 flex items-center justify-between gap-3 text-[11px]">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {['ALL', 'match_result', 'double_chance', 'handicap', 'total_goals', 'goal_bounds', 'half_time', 'total_corners', 'bookings', 'combos'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setMarketFilter(cat)}
                  type="button"
                  className={`px-2.5 py-1 rounded-[8px] font-medium transition-colors whitespace-nowrap touch-press ${
                    marketFilter === cat
                      ? 'bg-[#B6E63B] text-[#0A0F0D] font-bold'
                      : 'bg-[#101713] text-[#8B9890] hover:text-[#ECF1EE] border border-white/[0.07]'
                  }`}
                >
                  {cat === 'ALL' ? 'All' : cleanDisplayText(cat)}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSortAsc(!sortAsc)}
              type="button"
              className="flex items-center gap-1 text-[#8B9890] hover:text-[#ECF1EE] shrink-0 font-mono touch-press"
            >
              <span>Prob</span>
              <ArrowUpDown className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {filteredList.map(renderPredictionRow)}
          </div>
        </div>
      )}

      {/* Mandatory Statistical Estimate Disclaimer */}
      <div className="p-3 bg-[#101713] border-t border-white/[0.07] text-[11px] text-[#8B9890] flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-[#8B9890] shrink-0" />
        <span>Statistical estimate only: model probabilities are derived from Dixon Coles parameters and do not represent guaranteed outcomes.</span>
      </div>
    </div>
  );
}
