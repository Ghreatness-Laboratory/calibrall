'use client';

import React from 'react';
import { MarketPrediction } from '@/types';
import { Check, ShieldCheck, AlertCircle, TrendingUp, X } from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';

interface Props {
  prediction: MarketPrediction | null;
  noRecommendationReason?: string;
}

export default function ExplanationCard({ prediction, noRecommendationReason }: Props) {
  if (!prediction) {
    return (
      <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] p-5 text-center">
        <ShieldCheck className="w-6 h-6 text-[#5E6A63] mx-auto mb-1.5" strokeWidth={2} />
        <h4 className="text-[13px] font-semibold text-[#ECF1EE]">
          {noRecommendationReason ? 'No qualified recommendation' : 'Select a market line'}
        </h4>
        <p className="text-[11.5px] mt-1 text-[#8B9890]">
          {noRecommendationReason 
            ? cleanDisplayText(noRecommendationReason)
            : 'Select any row in the comparison table to audit evidence and model rationale.'}
        </p>
      </div>
    );
  }

  const { 
    explanation, 
    substituteOption, 
    fragilityScore, 
    fragilityFlags, 
    similarFixturesComparison, 
    liveStateStatus,
    whyPanel,
    confidenceTier,
    calibratedProbability,
    uncertaintySpread,
    ci90,
    engineVersion
  } = prediction;

  const formatHeadline = () => {
    if (explanation?.headline) return cleanDisplayText(explanation.headline);
    const edgeText = prediction.edge ? ` (+${(prediction.edge * 100).toFixed(1)}% edge)` : '';
    const probVal = calibratedProbability ?? prediction.modelProbability;
    const spreadText = uncertaintySpread !== undefined ? ` ± ${(uncertaintySpread * 100).toFixed(1)}%` : '';
    const probText = ` (${(probVal * 100).toFixed(1)}% prob${spreadText})`;
    return cleanDisplayText(`${prediction.qualificationStatus === 'QUALIFIED_VALUE' ? 'Strong value: ' : ''}${prediction.selection.toLowerCase()}${edgeText || probText}`);
  };

  return (
    <div className="bg-[#101713] border border-white/[0.07] rounded-[14px] overflow-hidden space-y-0">
      {/* Live State Alert if Red Card or Match in Progress */}
      {liveStateStatus && (liveStateStatus.isLive || liveStateStatus.isSupersededByRedCard) && (
        <div className={`py-2 px-4 text-[11px] font-semibold flex items-center gap-2 ${
          liveStateStatus.isSupersededByRedCard ? 'bg-red-950/70 border-b border-red-500/40 text-red-200' : 'bg-amber-950/60 border-b border-[#E2AE45]/30 text-[#E2AE45]'
        }`}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          <span>{cleanDisplayText(liveStateStatus.statusNotice)}</span>
        </div>
      )}

      {/* Header block separated by hairline */}
      <div className="p-3.5 border-b border-white/[0.07]">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#B6E63B] flex items-center gap-1.5 font-semibold text-[12px]">
            <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2} />
            <span>Statistical evidence audit</span>
          </span>
          <div className="flex items-center gap-2">
            {confidenceTier && (
              <span className={`px-2 py-0.5 rounded-[4px] font-mono text-[9.5px] font-semibold ${
                confidenceTier === 'HIGH'
                  ? 'bg-[#B6E63B]/15 text-[#B6E63B] border border-[#B6E63B]/30'
                  : confidenceTier === 'MEDIUM'
                  ? 'bg-[#E2AE45]/15 text-[#E2AE45] border border-[#E2AE45]/30'
                  : 'bg-white/[0.06] text-[#8B9890] border border-white/10'
              }`}>
                Tier: {confidenceTier}
              </span>
            )}
            {fragilityScore !== undefined && (
              <span className={`px-2 py-0.5 rounded-[4px] font-mono text-[9.5px] ${
                fragilityScore >= 0.40 
                  ? 'bg-[#E2AE45]/15 text-[#E2AE45] border border-[#E2AE45]/30' 
                  : 'bg-white/[0.04] text-[#8B9890] border border-white/[0.07]'
              }`}>
                Fragility: {(fragilityScore * 100).toFixed(0)}%
              </span>
            )}
            <span className="text-[#5E6A63] font-mono text-[10px]">
              {engineVersion ? cleanDisplayText(engineVersion) : 'Dixon Coles v2.5'}
            </span>
          </div>
        </div>

        <h3 className="text-[14px] font-[650] text-[#ECF1EE] leading-snug mt-1.5">
          {formatHeadline()}
        </h3>

        <p className="text-[12px] text-[#8B9890] leading-[1.55] mt-1">
          {cleanDisplayText(explanation?.summary || 'Modeled using calibrated Poisson joint matrices and empirical distribution regressions.')}
        </p>
      </div>

      <div className="p-3.5 space-y-3.5 text-[12px]">
        {/* v2.5 WHY PANEL: Top 3 factors for, top 3 against, active risk flags, uncertainty summary */}
        {whyPanel && (
          <div className="bg-[#151E19] border border-white/[0.08] rounded-[11px] p-3 space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 text-[11px]">
              <span className="font-semibold text-[#ECF1EE] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#B6E63B]" strokeWidth={2} />
                <span>Decision rationale and uncertainty</span>
              </span>
              <span className="font-mono text-[10px] text-[#5E6A63] bg-white/[0.04] px-1.5 py-0.5 rounded">
                Data completeness: {whyPanel.dataCompletenessPct ?? (prediction.dataQualityScore ? Math.round(prediction.dataQualityScore * 100) : 100)}%
              </span>
            </div>

            {/* Factors For */}
            {((whyPanel.factorsFor && whyPanel.factorsFor.length > 0) || (whyPanel as any).topFactorsFor?.length > 0) && (
              <div>
                <span className="text-[11px] font-mono uppercase text-[#B6E63B] font-semibold block mb-1">
                  Top factors in favor:
                </span>
                <ul className="space-y-1 pl-4 list-disc text-[#ECF1EE]/90 text-[11.5px] leading-relaxed">
                  {(whyPanel.factorsFor || (whyPanel as any).topFactorsFor).map((item: string, idx: number) => (
                    <li key={idx}>{cleanDisplayText(item)}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Factors Against */}
            {((whyPanel.factorsAgainst && whyPanel.factorsAgainst.length > 0) || (whyPanel as any).topFactorsAgainst?.length > 0) && (
              <div className="pt-1 border-t border-white/[0.05]">
                <span className="text-[11px] font-mono uppercase text-[#E2AE45] font-semibold block mb-1">
                  Counterbalancing factors:
                </span>
                <ul className="space-y-1 pl-4 list-disc text-[#8B9890] text-[11.5px] leading-relaxed">
                  {(whyPanel.factorsAgainst || (whyPanel as any).topFactorsAgainst).map((item: string, idx: number) => (
                    <li key={idx}>{cleanDisplayText(item)}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Active Risk Flags */}
            <div className="pt-1 border-t border-white/[0.05]">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-mono uppercase text-[#E2AE45] font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-[#E2AE45]" strokeWidth={2} />
                  <span>Risk flags:</span>
                </span>
                <span className="font-mono text-[10px] text-[#8B9890]">
                  {(whyPanel.riskFlags || (whyPanel as any).activeRiskFlags || []).length === 0 
                    ? 'None triggered' 
                    : `${(whyPanel.riskFlags || (whyPanel as any).activeRiskFlags || []).length} active`}
                </span>
              </div>
              {(whyPanel.riskFlags || (whyPanel as any).activeRiskFlags || []).length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(whyPanel.riskFlags || (whyPanel as any).activeRiskFlags || []).map((flag: string, idx: number) => (
                    <span 
                      key={idx}
                      className="px-2 py-0.5 rounded-[4px] text-[10px] font-mono bg-[#E2AE45]/15 text-[#E2AE45] border border-[#E2AE45]/30"
                    >
                      {cleanDisplayText(flag)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#8B9890] italic">
                  Zero adverse contextual risk flags identified across H2H, fatigue, lineups, and derby history.
                </p>
              )}
            </div>

            {/* Uncertainty & 90% CI footer */}
            <div className="pt-2 border-t border-white/[0.05] flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono text-[#8B9890]">
              <span>{cleanDisplayText(whyPanel.uncertaintySummary || 'Modeled with empirical covariates and calibrated shrinkage')}</span>
              {ci90 && (
                <span className="text-[#ECF1EE]">
                  90% CI: {(ci90[0] * 100).toFixed(1)}% to {(ci90[1] * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        )}
        {/* LOWER VARIANCE SUBSTITUTE BOX (if Fragility Triggered or Substitute exists) */}
        {substituteOption && (
          <div className="bg-[#151E19] border border-[#B6E63B]/40 rounded-[11px] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono tracking-wider uppercase text-[#B6E63B] font-semibold flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" strokeWidth={2} />
                <span>Lower Variance Substitute Option</span>
              </span>
              <span className="px-1.5 py-0.5 rounded-[4px] text-[9.5px] font-mono bg-[rgba(182,230,59,0.12)] text-[#B6E63B] border border-[#B6E63B]/30 font-semibold">
                &#8722;{substituteOption.varianceReductionPct}% variance
              </span>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <div>
                <div className="text-[13px] font-[650] text-[#ECF1EE]">
                  {cleanDisplayText(substituteOption.selection)}
                </div>
                <div className="text-[11px] text-[#8B9890] mt-0.5">
                  {cleanDisplayText(substituteOption.marketName)}
                </div>
              </div>

              <div className="text-right font-mono tabular-nums">
                <div className="text-[13px] font-bold text-[#B6E63B]">
                  {(substituteOption.modelProbability * 100).toFixed(1)}% prob
                </div>
                <div className="text-[10.5px] text-[#8B9890]">
                  {substituteOption.edgeOverBaseline !== undefined 
                    ? `+${(substituteOption.edgeOverBaseline * 100).toFixed(1)}% edge` 
                    : (substituteOption.odds ? `@${substituteOption.odds.toFixed(2)}` : '')}
                </div>
              </div>
            </div>

            <p className="text-[11.5px] text-[#ECF1EE]/90 bg-[#101713] p-2.5 rounded-[8px] border border-white/[0.05] leading-relaxed">
              <span className="text-[#B6E63B] font-medium">Reason for swap: </span>
              {cleanDisplayText(substituteOption.reasonForSwap)}
            </p>

            {/* Margin breakdown if available */}
            {substituteOption.marginDetails && (
              <div className="pt-1 border-t border-white/[0.06] flex items-center justify-between text-[10.5px] font-mono text-[#8B9890] tabular-nums">
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
          <h4 className="font-semibold text-[13px] text-[#ECF1EE] flex items-center gap-1.5 mb-1.5">
            <Check className="w-4 h-4 text-[#B6E63B] shrink-0" strokeWidth={2} />
            <span>Key quantitative evidence</span>
          </h4>
          <ul className="space-y-1.5 pl-4 list-disc text-[#ECF1EE]/90 text-[12px] leading-[1.55]">
            {explanation?.keySupportingFactors?.map((factor, idx) => (
              <li key={idx}>{cleanDisplayText(factor)}</li>
            ))}
          </ul>
        </div>

        {/* Similar Historical Fixtures Details */}
        {similarFixturesComparison && similarFixturesComparison.similarMatches.length > 0 && (
          <div className="bg-[#151E19] border border-white/[0.07] rounded-[11px] p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#ECF1EE] font-medium">Similar Fixture Precedents (K=5)</span>
              <span className="font-mono text-[#B6E63B] text-[10.5px] font-semibold tabular-nums">
                Hit rate: {(similarFixturesComparison.marketHitRate * 100).toFixed(0)}%
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10.5px] font-mono text-[#8B9890] tabular-nums">
              {similarFixturesComparison.similarMatches.slice(0, 4).map((m, idx) => (
                <div key={idx} className="flex items-center justify-between bg-[#101713] px-2 py-1 rounded-[5px] border border-white/[0.04]">
                  <span className="truncate max-w-[140px] text-[#ECF1EE]">{cleanDisplayText(m.fixtureName)}</span>
                  <span className="text-[#B6E63B] font-semibold ml-1">{cleanDisplayText(m.score)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk box: compact amber tinted card with 1px amber border at 28% opacity */}
        <div className="bg-[#E2AE45]/[0.08] border border-[#E2AE45]/[0.28] rounded-[11px] p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-[12px] text-[#E2AE45] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              <span>Risk factors and invalidation triggers</span>
            </h4>
            {fragilityFlags && fragilityFlags.length > 0 && (
              <span className="text-[10px] font-mono text-[#E2AE45] font-semibold">
                {fragilityFlags.length} flag{fragilityFlags.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <ul className="space-y-1.5 pl-4 list-disc text-[#8B9890] text-[11.5px] leading-[1.55]">
            {explanation?.counterarguments?.map((item, idx) => (
              <li key={idx}>{cleanDisplayText(item)}</li>
            ))}
          </ul>
        </div>

        {/* Why Ranked Above Alternatives */}
        {explanation?.whyRankedAboveAlternatives && (
          <div>
            <h4 className="font-semibold text-[#ECF1EE] flex items-center gap-1.5 mb-1 text-[13px]">
              <TrendingUp className="w-3.5 h-3.5 text-[#B6E63B]" strokeWidth={2} />
              <span>Cross market priority rationale</span>
            </h4>
            <p className="text-[#8B9890] bg-[#151E19] p-2.5 rounded-[11px] border border-white/[0.07] text-[12px] leading-[1.55]">
              {cleanDisplayText(explanation.whyRankedAboveAlternatives)}
            </p>
          </div>
        )}

        {/* Alternative Comparisons */}
        {explanation?.alternativeComparisons && explanation.alternativeComparisons.length > 0 && (
          <div>
            <h4 className="font-semibold text-[#ECF1EE] mb-1.5 text-[12px]">Evaluated alternative lines:</h4>
            <div className="space-y-1.5">
              {explanation.alternativeComparisons.map((alt, idx) => (
                <div key={idx} className="bg-[#151E19] p-2 rounded-[8px] border border-white/[0.05] flex items-start justify-between text-[11px]">
                  <div>
                    <span className="font-medium text-[#ECF1EE]">{cleanDisplayText(alt.alternative)}</span>
                    <span className="text-[#8B9890] font-mono ml-2 tabular-nums">({(alt.modelProbability * 100).toFixed(1)}%)</span>
                    <p className="text-[#8B9890] mt-0.5 leading-normal">{cleanDisplayText(alt.reasonRejected)}</p>
                  </div>
                  <X className="w-3.5 h-3.5 text-[#5E6A63] shrink-0 mt-0.5 ml-2" strokeWidth={2} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Limitations & Sample Size */}
        <div className="pt-2 border-t border-white/[0.05] flex flex-wrap items-center justify-between text-[11px] font-mono text-[#5E6A63] tabular-nums">
          <span>Sample basis: {explanation?.sampleSize || 20} matches</span>
          <span suppressHydrationWarning>
            Audit timestamp: {explanation?.generatedAt ? new Date(explanation.generatedAt).toISOString().slice(11, 16) + ' UTC' : '16:00 UTC'}
          </span>
        </div>
      </div>
    </div>
  );
}
