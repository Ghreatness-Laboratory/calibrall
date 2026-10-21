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
      <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] p-6 text-center text-[#8fa69a]">
        <HelpCircle className="w-7 h-7 mx-auto mb-2 text-[#8fa69a]/40" />
        <h4 className="text-[#e8efe9] font-[500] text-[14px]">No market selected</h4>
        <p className="text-[12px] mt-1">Select any row in the comparison table to audit evidence and model rationale.</p>
      </div>
    );
  }

  const { explanation } = prediction;

  return (
    <div className="bg-[#0f2219] border border-white/[0.08] rounded-[12px] overflow-hidden">
      {/* Header */}
      <div className="bg-[#0a1812]/70 border-b border-white/[0.08] p-4 space-y-1">
        <div className="flex items-center justify-between text-[11px] font-mono text-[#8fa69a]">
          <span className="text-[#b8e63a] flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Evidence audit</span>
          </span>
          <span>{explanation?.modelType || 'Dixon-Coles v2.4'}</span>
        </div>

        <h3 className="text-[15px] font-[500] text-[#e8efe9]">
          {explanation?.headline || `${prediction.selection} (${(prediction.modelProbability * 100).toFixed(1)}%)`}
        </h3>

        <p className="text-[12px] text-[#8fa69a] leading-normal pt-0.5">
          {explanation?.summary}
        </p>
      </div>

      <div className="p-4 space-y-4 text-[12px]">
        {/* Key Supporting Factors */}
        <div>
          <h4 className="font-[500] text-[#e8efe9] flex items-center gap-1.5 mb-2">
            <Check className="w-3.5 h-3.5 text-[#b8e63a]" />
            <span>Key quantitative evidence</span>
          </h4>
          <ul className="space-y-1 pl-4 list-disc text-[#8fa69a]">
            {explanation?.keySupportingFactors.map((factor, idx) => (
              <li key={idx} className="leading-normal">{factor}</li>
            ))}
          </ul>
        </div>

        {/* Counterarguments */}
        <div className="p-3 bg-[#0a1812]/50 border border-white/[0.06] rounded-[8px]">
          <h4 className="font-[500] text-[#e3b341] flex items-center gap-1.5 mb-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Risk factors & invalidation triggers</span>
          </h4>
          <ul className="space-y-1 pl-4 list-disc text-[#8fa69a]">
            {explanation?.counterarguments.map((item, idx) => (
              <li key={idx} className="leading-normal">{item}</li>
            ))}
          </ul>
        </div>

        {/* Why Ranked Above Alternatives */}
        {explanation?.whyRankedAboveAlternatives && (
          <div>
            <h4 className="font-[500] text-[#e8efe9] flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-[#b8e63a]" />
              <span>Cross-market priority rationale</span>
            </h4>
            <p className="text-[#8fa69a] bg-[#0a1812]/50 p-2.5 rounded-[8px] border border-white/[0.06] leading-normal">
              {explanation.whyRankedAboveAlternatives}
            </p>
          </div>
        )}

        {/* Alternative Comparisons */}
        {explanation?.alternativeComparisons && explanation.alternativeComparisons.length > 0 && (
          <div>
            <h4 className="font-[500] text-[#e8efe9] mb-1.5">Evaluated & rejected alternative lines:</h4>
            <div className="space-y-1.5">
              {explanation.alternativeComparisons.map((alt, idx) => (
                <div key={idx} className="bg-[#0a1812]/50 p-2 rounded-[8px] border border-white/[0.06] flex items-start justify-between text-[11px]">
                  <div>
                    <span className="font-[500] text-[#e8efe9]">{alt.alternative}</span>
                    <span className="text-[#8fa69a] font-mono ml-2">({(alt.modelProbability * 100).toFixed(1)}%)</span>
                    <p className="text-[#8fa69a] mt-0.5">{alt.reasonRejected}</p>
                  </div>
                  <X className="w-3.5 h-3.5 text-[#8fa69a] shrink-0 mt-0.5 ml-2" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Limitations & Sample Size */}
        <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between text-[11px] text-[#8fa69a] font-mono">
          <span>Sample basis: {explanation?.sampleSize || 20} matches</span>
          <span suppressHydrationWarning>
            UTC timestamp: {explanation?.generatedAt ? new Date(explanation.generatedAt).toISOString().slice(11, 16) + ' UTC' : '16:00 UTC'}
          </span>
        </div>
      </div>
    </div>
  );
}
