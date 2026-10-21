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

  const { explanation } = prediction;

  // Format headline according to specifications
  const formatHeadline = () => {
    if (explanation?.headline) return explanation.headline;
    const edgeText = prediction.edge ? ` (+${(prediction.edge * 100).toFixed(1)}% edge)` : '';
    const probText = ` (${(prediction.modelProbability * 100).toFixed(1)}% prob)`;
    return `${prediction.qualificationStatus === 'QUALIFIED_VALUE' ? 'Strong value: ' : ''}${prediction.selection.toLowerCase()}${edgeText || probText}`;
  };

  return (
    <div className="bg-[#0f2219] border-[0.5px] border-white/[0.08] rounded-[12px] overflow-hidden">
      {/* Header block (14px 16px padding), continuous with card background, separated by hairline */}
      <div className="py-[14px] px-4 border-b-[0.5px] border-white/[0.08]">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#b8e63a] flex items-center gap-1.5 font-[500]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Statistical evidence audit</span>
          </span>
          <span className="text-[#8fa69a]">Dixon-Coles · NegBinomial</span>
        </div>

        <h3 className="text-[15px] font-[500] text-[#e8efe9] leading-[1.35] mt-2">
          {formatHeadline()}
        </h3>

        <p className="text-[12px] text-[#8fa69a] leading-[1.65] mt-1">
          {explanation?.summary || 'Modeled using calibrated Poisson joint matrices and distribution regressions.'}
        </p>
      </div>

      <div className="p-4 space-y-4 text-[12px]">
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

        {/* Risk box: bg rgba(227,179,65,0.08), 0.5px amber border at 35% opacity, 8px radius, 12px padding */}
        <div className="bg-[#e3b341]/[0.08] border-[0.5px] border-[#e3b341]/35 rounded-[8px] p-3 space-y-1.5">
          <h4 className="font-[500] text-[12px] text-[#e3b341] flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Risk factors and invalidation triggers</span>
          </h4>
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
