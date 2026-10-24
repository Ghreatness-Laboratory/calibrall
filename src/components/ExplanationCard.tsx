'use client';

import React from 'react';
import { MarketPrediction } from '@/types';
import { 
  ShieldCheck, 
  AlertCircle, 
  TrendingUp, 
  HelpCircle, 
  Check, 
  X
} from 'lucide-react';

interface Props {
  prediction: MarketPrediction | null;
  noRecommendationReason?: string;
}

export default function ExplanationCard({ prediction, noRecommendationReason }: Props) {
  if (!prediction) {
    return (
      <div className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] p-6 text-center text-[#8fa69a]">
        <HelpCircle className="w-7 h-7 mx-auto mb-2 text-[#8fa69a]/40" />
        <h4 className="text-[#e8efe9] font-[500] text-[14px]">No market selected</h4>
        <p className="text-[12px] mt-1">Select any row in the comparison table to audit evidence and model rationale.</p>
      </div>
    );
  }

  const { explanation, substituteOption, fragilityScore, fragilityFlags, situationalPatterns, similarFixturesComparison, attackingDefendingMatchup, liveStateStatus } = prediction;

  // Format headline according to specifications
  const formatHeadline = () => {
    if (explanation?.headline) return explanation.headline;
    const edgeText = prediction.edge ? ` (+${(prediction.edge * 100).toFixed(1)}% edge)` : '';
    const probText = ` (${(prediction.modelProbability * 100).toFixed(1)}% prob)`;
    return `${prediction.qualificationStatus === 'QUALIFIED_VALUE' ? 'Strong value: ' : ''}${prediction.selection.toLowerCase()}${edgeText || probText}`;
  };

  return (
    <div className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] overflow-hidden space-y-0">
      {/* Live State Alert if Red Card or Match in Progress */}
      {liveStateStatus && (liveStateStatus.isLive || liveStateStatus.isSupersededByRedCard) && (
        <div className={`py-2 px-4 text-[11px] font-[550] flex items-center gap-2 ${
          liveStateStatus.isSupersededByRedCard ? 'bg-red-950/70 border-b border-red-500/40 text-red-200' : 'bg-amber-950/60 border-b border-amber-500/30 text-amber-200'
        }`}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{liveStateStatus.statusNotice}</span>
        </div>
      )}

      {/* Header block (14px 16px padding), continuous with card background, separated by hairline */}
      <div className="py-[14px] px-4 border-b-[0.5px] border-white/[0.08]">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#b8e63a] flex items-center gap-1.5 font-[500]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Statistical evidence audit</span>
          </span>
          <div className="flex items-center gap-2">
            {fragilityScore !== undefined && (
              <span className={`px-2 py-0.5 rounded-[4px] font-mono text-[10px] ${
                fragilityScore >= 0.40 
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' 
                  : 'bg-white/[0.04] text-[#8fa69a] border border-white/[0.08]'
              }`}>
                Fragility: {(fragilityScore * 100).toFixed(0)}%
              </span>
            )}
            <span className="text-[#8fa69a]">Dixon-Coles · NegBinomial</span>
          </div>
        </div>

        <h3 className="text-[15px] font-[500] text-[#e8efe9] leading-[1.35] mt-2">
          {formatHeadline()}
        </h3>

        <p className="text-[12px] text-[#8fa69a] leading-[1.65] mt-1">
          {explanation?.summary || 'Modeled using calibrated Poisson joint matrices and distribution regressions.'}
        </p>
      </div>

      <div className="p-4 space-y-4 text-[12px]">
        {/* LOWER-VARIANCE SUBSTITUTE BOX (if Fragility Triggered or Substitute exists) */}
        {substituteOption && (
          <div className="bg-[#0b1f14] border border-[#b8e63a]/40 rounded-[10px] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-mono tracking-wider uppercase text-[#b8e63a] font-[600] flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Lower-Variance Substitute Option</span>
              </span>
              <span className="px-1.5 py-0.2 rounded-[4px] text-[10px] font-mono bg-[#b8e63a]/15 text-[#b8e63a] border border-[#b8e63a]/30">
                −{substituteOption.varianceReductionPct}% variance
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <div className="text-[14px] font-[600] text-[#e8efe9]">
                  {substituteOption.selection}
                </div>
                <div className="text-[11px] text-[#8fa69a] mt-0.5">
                  {substituteOption.marketName}
                </div>
              </div>

              <div className="text-right font-mono">
                <div className="text-[13.5px] font-[600] text-[#b8e63a]">
                  {(substituteOption.modelProbability * 100).toFixed(1)}% prob
                </div>
                <div className="text-[11px] text-[#8fa69a]">
                  {substituteOption.edgeOverBaseline !== undefined 
                    ? `+${(substituteOption.edgeOverBaseline * 100).toFixed(1)}% edge` 
                    : (substituteOption.odds ? `@${substituteOption.odds.toFixed(2)}` : '')}
                </div>
              </div>
            </div>

            <p className="text-[11.5px] text-[#c9d6ce] bg-[#06140e] p-2.5 rounded-[6px] border border-white/[0.04] leading-relaxed">
              <span className="text-[#b8e63a] font-[500]">Reason for swap: </span>
              {substituteOption.reasonForSwap}
            </p>

            {/* Margin breakdown if available */}
            {substituteOption.marginDetails && (
              <div className="pt-1 border-t border-white/[0.06] flex items-center justify-between text-[10.5px] font-mono text-[#8fa69a]">
                <span>Fav by 1: {(substituteOption.marginDetails.favWinsBy1Prob * 100).toFixed(0)}%</span>
                <span>Fav by 2: {(substituteOption.marginDetails.favWinsBy2Prob * 100).toFixed(0)}%</span>
                <span>Fav by 3+: {(substituteOption.marginDetails.favWinsBy3PlusProb * 100).toFixed(0)}%</span>
                <span>Draw: {(substituteOption.marginDetails.drawProb * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        )}

        {/* Key quantitative evidence */}
        <div>
          <h4 className="font-[500] text-[13px] text-[#e8efe9] flex items-center gap-1.5 mb-2">
            <Check className="w-4 h-4 text-[#b8e63a] shrink-0" />
            <span>Key quantitative evidence</span>
          </h4>
          <ul className="space-y-1.5 pl-[18px] list-disc text-[#c9d6ce] text-[12px] leading-[1.65]">
            {explanation?.keySupportingFactors?.map((factor, idx) => (
              <li key={idx}>{factor}</li>
            ))}
          </ul>
        </div>

        {/* Similar Historical Fixtures Details */}
        {similarFixturesComparison && similarFixturesComparison.similarMatches.length > 0 && (
          <div className="bg-[#0a1812]/60 border border-white/[0.06] rounded-[8px] p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#e8efe9] font-[500]">Similar-Fixture Historical Precedents (K=5)</span>
              <span className="font-mono text-[#b8e63a] text-[10.5px]">
                Hit rate: {(similarFixturesComparison.marketHitRate * 100).toFixed(0)}%
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10.5px] font-mono text-[#8fa69a]">
              {similarFixturesComparison.similarMatches.slice(0, 4).map((m, idx) => (
                <div key={idx} className="flex items-center justify-between bg-black/20 px-2 py-1 rounded-[4px]">
                  <span className="truncate max-w-[140px] text-[#c9d6ce]">{m.fixtureName}</span>
                  <span className="text-white font-[500] ml-1">{m.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk box: bg rgba(227,179,65,0.08), 0.5px amber border at 35% opacity, 8px radius, 12px padding */}
        <div className="bg-[#e3b341]/[0.08] border-[0.5px] border-[#e3b341]/35 rounded-[8px] p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="font-[500] text-[12px] text-[#e3b341] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Risk factors and invalidation triggers</span>
            </h4>
            {fragilityFlags && fragilityFlags.length > 0 && (
              <span className="text-[10px] font-mono text-[#e3b341]">
                {fragilityFlags.length} flag{fragilityFlags.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <ul className="space-y-1.5 pl-[18px] list-disc text-[#8fa69a] text-[12px] leading-[1.65]">
            {explanation?.counterarguments?.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>

        {/* Why Ranked Above Alternatives */}
        {explanation?.whyRankedAboveAlternatives && (
          <div>
            <h4 className="font-[500] text-[#e8efe9] flex items-center gap-1.5 mb-1 text-[13px]">
              <TrendingUp className="w-3.5 h-3.5 text-[#b8e63a]" />
              <span>Cross-market priority rationale</span>
            </h4>
            <p className="text-[#8fa69a] bg-[#0a1812]/50 p-2.5 rounded-[8px] border-[0.5px] border-white/[0.06] text-[12px] leading-[1.65]">
              {explanation.whyRankedAboveAlternatives}
            </p>
          </div>
        )}

        {/* Alternative Comparisons */}
        {explanation?.alternativeComparisons && explanation.alternativeComparisons.length > 0 && (
          <div>
            <h4 className="font-[500] text-[#e8efe9] mb-1.5 text-[12px]">Evaluated alternative lines:</h4>
            <div className="space-y-1.5">
              {explanation.alternativeComparisons.map((alt, idx) => (
                <div key={idx} className="bg-[#0a1812]/50 p-2 rounded-[8px] border-[0.5px] border-white/[0.06] flex items-start justify-between text-[11px]">
                  <div>
                    <span className="font-[500] text-[#e8efe9]">{alt.alternative}</span>
                    <span className="text-[#8fa69a] font-mono ml-2 tabular-nums">({(alt.modelProbability * 100).toFixed(1)}%)</span>
                    <p className="text-[#8fa69a] mt-0.5 leading-normal">{alt.reasonRejected}</p>
                  </div>
                  <X className="w-3.5 h-3.5 text-[#8fa69a] shrink-0 mt-0.5 ml-2" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Limitations & Sample Size */}
        <div className="pt-2 border-t-[0.5px] border-white/[0.06] flex flex-wrap items-center justify-between text-[11px] text-[#8fa69a]">
          <span>Sample basis: {explanation?.sampleSize || 20} matches</span>
          <span suppressHydrationWarning>
            Audit timestamp: {explanation?.generatedAt ? new Date(explanation.generatedAt).toISOString().slice(11, 16) + ' UTC' : '16:00 UTC'}
          </span>
        </div>
      </div>
    </div>
  );
}
