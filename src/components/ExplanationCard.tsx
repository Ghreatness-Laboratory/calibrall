'use client';

import React from 'react';
import { MarketPrediction } from '@/types';
import { 
  ShieldCheck, 
  AlertTriangle, 
  TrendingUp, 
  HelpCircle, 
  CheckCircle2, 
  XCircle,
  FileText,
  BarChart2
} from 'lucide-react';

interface Props {
  prediction: MarketPrediction | null;
  noRecommendationReason?: string;
}

export default function ExplanationCard({ prediction, noRecommendationReason }: Props) {
  if (!prediction) {
    return (
      <div className="bg-surface-200 border border-border rounded p-6 text-center text-gray-400">
        <HelpCircle className="w-8 h-8 mx-auto mb-2 text-gray-600" />
        <h4 className="text-white font-medium text-sm">No Market Selected</h4>
        <p className="text-xs mt-1">Click any market row in the comparison table to inspect the statistical audit and model explanation.</p>
      </div>
    );
  }

  const { explanation } = prediction;

  return (
    <div className="bg-surface-200 border border-border rounded overflow-hidden">
      {/* Header */}
      <div className="bg-[#0e131d] border-b border-border p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-brand-emerald flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Statistical Evidence Audit</span>
          </span>
          <span className="text-[10px] font-mono text-gray-400">
            Model: {explanation?.modelType || 'Dixon-Coles v2.4'}
          </span>
        </div>

        <h3 className="text-base font-bold text-white mt-1">
          {explanation?.headline || `${prediction.selection} (${(prediction.modelProbability * 100).toFixed(1)}%)`}
        </h3>

        <p className="text-xs text-gray-300 mt-2 leading-relaxed">
          {explanation?.summary}
        </p>
      </div>

      <div className="p-4 space-y-4 text-xs">
        {/* Key Supporting Factors */}
        <div>
          <h4 className="font-semibold text-white flex items-center space-x-1.5 mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald" />
            <span>Key Quantitative Evidence</span>
          </h4>
          <ul className="space-y-1.5 pl-5 list-disc text-gray-300">
            {explanation?.keySupportingFactors.map((factor, idx) => (
              <li key={idx} className="leading-relaxed">{factor}</li>
            ))}
          </ul>
        </div>

        {/* Counterarguments & Invalidation Factors */}
        <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded">
          <h4 className="font-semibold text-amber-400 flex items-center space-x-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Risk Factors & Model Invalidation Triggers</span>
          </h4>
          <ul className="space-y-1 pl-4 list-disc text-gray-300">
            {explanation?.counterarguments.map((item, idx) => (
              <li key={idx} className="leading-relaxed">{item}</li>
            ))}
          </ul>
        </div>

        {/* Why Ranked Above Alternatives */}
        {explanation?.whyRankedAboveAlternatives && (
          <div>
            <h4 className="font-semibold text-white flex items-center space-x-1.5 mb-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-brand-blue" />
              <span>Cross-Market Priority Rationale</span>
            </h4>
            <p className="text-gray-300 bg-surface-100 p-2.5 rounded border border-border leading-relaxed">
              {explanation.whyRankedAboveAlternatives}
            </p>
          </div>
        )}

        {/* Alternative Comparisons */}
        {explanation?.alternativeComparisons && explanation.alternativeComparisons.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-300 mb-2">Evaluated & Rejected Alternative Lines:</h4>
            <div className="space-y-1.5">
              {explanation.alternativeComparisons.map((alt, idx) => (
                <div key={idx} className="bg-surface-100 p-2 rounded border border-border flex items-start justify-between text-[11px]">
                  <div>
                    <span className="font-medium text-white">{alt.alternative}</span>
                    <span className="text-gray-500 font-mono ml-2">({(alt.modelProbability * 100).toFixed(1)}% prob)</span>
                    <p className="text-gray-400 mt-0.5">{alt.reasonRejected}</p>
                  </div>
                  <XCircle className="w-4 h-4 text-gray-500 shrink-0 mt-0.5 ml-2" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data Limitations & Sample Size */}
        <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center justify-between text-[11px] text-gray-400">
          <span>Sample basis: {explanation?.sampleSize || 20} matches</span>
          <span>Timestamp: {new Date(explanation?.generatedAt || Date.now()).toLocaleTimeString()} UTC</span>
        </div>
      </div>
    </div>
  );
}
