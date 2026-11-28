'use client';

import React, { useState } from 'react';
import { MarketPrediction } from '@/types';
import { Check, ShieldCheck, AlertCircle, TrendingUp, X } from 'lucide-react';
import { cleanDisplayText } from '@/lib/utils/formatText';
import { getMarketEvidenceFamily } from '@/lib/prediction/explanationValidator';

interface Props {
  prediction: MarketPrediction | null;
  noRecommendationReason?: string;
}

export default function ExplanationCard({ prediction, noRecommendationReason }: Props) {
  const [expandedSummary, setExpandedSummary] = useState(false);

  if (!prediction) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] p-5 text-center space-y-2">
        <ShieldCheck className="w-6 h-6 text-[var(--text-3)] mx-auto" strokeWidth={2} />
        <h4 className="font-display text-[14px] font-semibold text-[var(--text)]">
          {noRecommendationReason ? 'Withheld: analysis only' : 'Select a market line'}
        </h4>
        <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
          {noRecommendationReason
            ? cleanDisplayText(noRecommendationReason)
            : 'Select any row in the market intel list to audit evidence and model rationale.'}
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
    engineVersion,
  } = prediction;

  const formatHeadline = () => {
    if (explanation?.headline) return cleanDisplayText(explanation.headline);
    const probVal = calibratedProbability ?? prediction.modelProbability;
    const spreadText = uncertaintySpread !== undefined ? ` ± ${(uncertaintySpread * 100).toFixed(1)}%` : '';
    const probText = ` (${(probVal * 100).toFixed(1)}%${spreadText})`;
    return cleanDisplayText(`${prediction.selection}${probText}`);
  };

  const summaryText = cleanDisplayText(
    explanation?.summary ||
      prediction.plainEnglishReason ||
      'Modeled using calibrated Poisson joint matrices and empirical distribution regressions.'
  );

  const tierLabel =
    confidenceTier === 'HIGH' ? 'High' : confidenceTier === 'MEDIUM' ? 'Medium' : 'Low';

  const marketFamily = getMarketEvidenceFamily(prediction, 'football');
  const h2hMeetings = prediction.evidence?.sampleSizes?.h2hMeetings ?? 0;

  const refereeLine = (() => {
    if (marketFamily !== 'cards') return null;
    const ref = prediction.evidence?.referee;
    if (!ref) return null;
    if (!ref.leagueBaseline || ref.leagueBaseline <= 0) {
      return ref.announced && ref.name ? `Referee ${cleanDisplayText(ref.name)}` : 'Referee unannounced';
    }
    return cleanDisplayText(ref.explanation);
  })();

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-[18px] overflow-hidden">
      {liveStateStatus && (liveStateStatus.isLive || liveStateStatus.isSupersededByRedCard) && (
        <div
          className={`py-2.5 px-4 text-[12px] font-semibold flex items-center gap-2 border-b ${
            liveStateStatus.isSupersededByRedCard
              ? 'bg-[var(--danger-soft)] border-[var(--danger)]/30 text-[var(--danger)]'
              : 'bg-[var(--medium-soft)] border-[var(--medium)]/30 text-[var(--medium)]'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={2} />
          <span>{cleanDisplayText(liveStateStatus.statusNotice)}</span>
        </div>
      )}

      {/* Header block */}
      <div className="p-4 border-b border-[var(--line)] space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
          <span className="text-[var(--accent)] flex items-center gap-1.5 font-semibold text-[12.5px]">
            <ShieldCheck className="w-4 h-4" strokeWidth={2} />
            <span>Statistical evidence audit</span>
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {prediction.marketScope && (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--line)]">
                {cleanDisplayText(prediction.marketScope)}
              </span>
            )}
            {confidenceTier && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${
                  confidenceTier === 'HIGH'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30'
                    : confidenceTier === 'MEDIUM'
                    ? 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/30'
                    : 'bg-[var(--muted-soft)] text-[var(--muted)] border-[var(--line)]'
                }`}
              >
                {tierLabel} tier
              </span>
            )}
            {fragilityScore !== undefined && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10.5px] border tabular-nums ${
                  fragilityScore >= 0.4
                    ? 'bg-[var(--medium-soft)] text-[var(--medium)] border-[var(--medium)]/30'
                    : 'bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--line)]'
                }`}
              >
                Fragility {(fragilityScore * 100).toFixed(0)}%
              </span>
            )}
            <span className="text-[var(--text-3)] text-[10.5px]">
              {engineVersion ? cleanDisplayText(engineVersion) : 'Dixon Coles v2.5'}
            </span>
          </div>
        </div>

        <h3 className="font-display text-[15px] font-bold text-[var(--text)] leading-snug">
          {formatHeadline()}
        </h3>

        <div>
          <p className={`text-[12.5px] text-[var(--text-2)] leading-[1.5] ${expandedSummary ? '' : 'line-clamp-3'}`}>
            {summaryText}
          </p>
          {summaryText.length > 140 && (
            <button
              type="button"
              onClick={() => setExpandedSummary((prev) => !prev)}
              className="min-h-[44px] inline-flex items-center text-[12px] font-semibold text-[var(--accent)] -my-2 touch-press"
            >
              {expandedSummary ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3.5 text-[12.5px]">
        {prediction.evidence && (
          <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3 space-y-2.5 text-[11.5px]">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-2 gap-2">
              <span className="font-semibold text-[var(--text)]">Pick evidence breakdown</span>
              <span className="text-[11px] text-[var(--accent)] tabular-nums font-medium">
                {cleanDisplayText(prediction.evidence.walkForwardValidation.leagueGroup)} · BSS{' '}
                {prediction.evidence.walkForwardValidation.brierSkill >= 0 ? '+' : '\u2212'}
                {Math.abs(prediction.evidence.walkForwardValidation.brierSkill).toFixed(4)}
              </span>
            </div>

            <div className="text-[var(--text)] leading-[1.5]">
              <span className="text-[var(--accent)] font-semibold">Line rationale: </span>
              {cleanDisplayText(prediction.evidence.whyLineChosen)}
            </div>

            <div className="grid grid-cols-1 gap-1.5 text-[var(--text-2)] tabular-nums">
              <div className="bg-[var(--surface)] px-2.5 py-2 rounded-[10px] border border-[var(--line)]">
                <span className="text-[var(--text)] font-medium">
                  {marketFamily === 'cards'
                    ? 'Cards model inputs: '
                    : marketFamily === 'corners'
                    ? 'Corners model inputs: '
                    : 'Fitted strengths: '}
                </span>
                {marketFamily === 'cards' ? (
                  <span>
                    {prediction.evidence.fittedStrengths.expectedCards !== undefined &&
                    prediction.evidence.fittedStrengths.expectedCards > 0
                      ? cleanDisplayText(
                          `Projected total ${prediction.evidence.fittedStrengths.expectedCards.toFixed(2)} cards`
                        )
                      : 'Disciplinary rate estimates applied'}
                  </span>
                ) : marketFamily === 'corners' ? (
                  <span>
                    {prediction.evidence.fittedStrengths.expectedCornersHome !== undefined &&
                    prediction.evidence.fittedStrengths.expectedCornersHome > 0
                      ? cleanDisplayText(
                          `Home ${(prediction.evidence.fittedStrengths.expectedCornersHome).toFixed(1)} + Away ${(prediction.evidence.fittedStrengths.expectedCornersAway ?? 0).toFixed(1)} expected corners`
                        )
                      : 'Corner volume estimates applied'}
                  </span>
                ) : (
                  <span>
                    {cleanDisplayText(
                      `Home Att ${prediction.evidence.fittedStrengths.homeAttack.toFixed(2)} / Def ${prediction.evidence.fittedStrengths.homeDefense.toFixed(2)} (${prediction.evidence.fittedStrengths.homeXg.toFixed(2)} xG) | Away Att ${prediction.evidence.fittedStrengths.awayAttack.toFixed(2)} / Def ${prediction.evidence.fittedStrengths.awayDefense.toFixed(2)} (${prediction.evidence.fittedStrengths.awayXg.toFixed(2)} xG)`
                    )}
                  </span>
                )}
              </div>

              <div className="bg-[var(--surface)] px-2.5 py-2 rounded-[10px] border border-[var(--line)]">
                <span className="text-[var(--text)] font-medium">Bookmaker &amp; EV: </span>
                {prediction.marketOdds &&
                prediction.evidence.expectedValue !== null &&
                prediction.evidence.expectedValue !== undefined ? (
                  <span className="text-[var(--accent)]">
                    {cleanDisplayText(
                      `@${prediction.marketOdds.toFixed(2)} | Devigged prob ${((prediction.evidence.deviggedMarketProb ?? 0) * 100).toFixed(1)}% | EV ${prediction.evidence.expectedValue >= 0 ? '+' : '\u2212'}${Math.abs(prediction.evidence.expectedValue * 100).toFixed(1)}%`
                    )}
                  </span>
                ) : (
                  <span>No real bookmaker odds stored for this line</span>
                )}
              </div>

              <div className="bg-[var(--surface)] px-2.5 py-2 rounded-[10px] border border-[var(--line)]">
                <span className="text-[var(--text)] font-medium">Sample sizes: </span>
                {cleanDisplayText(
                  `Home ${prediction.evidence.sampleSizes.homeMatches} · Away ${prediction.evidence.sampleSizes.awayMatches} · League ${prediction.evidence.sampleSizes.leagueMatches} · Walk forward ${prediction.evidence.sampleSizes.walkForwardMatches}${
                    h2hMeetings >= 3 ? ` · H2H ${h2hMeetings}` : ''
                  }`
                )}
              </div>

              {refereeLine && (
                <div className="bg-[var(--surface)] px-2.5 py-2 rounded-[10px] border border-[var(--line)]">
                  <span className="text-[var(--text)] font-medium">Referee: </span>
                  {refereeLine}
                </div>
              )}

              {(h2hMeetings >= 3 || (marketFamily === 'cards' && prediction.evidence.derby.isDerby)) && (
                <div className="bg-[var(--surface)] px-2.5 py-2 rounded-[10px] border border-[var(--line)]">
                  <span className="text-[var(--text)] font-medium">
                    {h2hMeetings >= 3 && marketFamily === 'cards' && prediction.evidence.derby.isDerby
                      ? 'H2H & Derby: '
                      : h2hMeetings >= 3
                      ? 'Head to head: '
                      : 'Rivalry context: '}
                  </span>
                  {cleanDisplayText(
                    [
                      h2hMeetings >= 3
                        ? `${prediction.evidence.h2h.summary} (${h2hMeetings} meetings, weight ${prediction.evidence.h2h.weightApplied.toFixed(2)})`
                        : null,
                      marketFamily === 'cards' && prediction.evidence.derby.isDerby
                        ? `Derby: ${prediction.evidence.derby.name || 'Rivalry'} (cards x${prediction.evidence.derby.cardsMultiplierApplied.toFixed(2)})`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' | ')
                  )}
                </div>
              )}

              <div className="bg-[var(--surface)] px-2.5 py-2 rounded-[10px] border border-[var(--line)]">
                <span className="text-[var(--text)] font-medium">Walk forward CI: </span>
                {cleanDisplayText(
                  `95% Bootstrap CI [${prediction.evidence.walkForwardValidation.ci95Lower.toFixed(4)}, ${prediction.evidence.walkForwardValidation.ci95Upper.toFixed(4)}] (${prediction.evidence.walkForwardValidation.allowed ? 'Allowed' : 'Blocked'})`
                )}
              </div>
            </div>
          </div>
        )}

        {whyPanel && (
          <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3 space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-2 text-[11.5px]">
              <span className="font-semibold text-[var(--text)] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[var(--accent)]" strokeWidth={2} />
                <span>Decision rationale &amp; uncertainty</span>
              </span>
              <span className="text-[10.5px] text-[var(--text-2)] bg-[var(--surface)] px-2 py-0.5 rounded-full border border-[var(--line)] tabular-nums">
                Data {whyPanel.dataCompletenessPct ?? (prediction.dataQualityScore ? Math.round(prediction.dataQualityScore * 100) : 100)}%
              </span>
            </div>

            {((whyPanel.factorsFor && whyPanel.factorsFor.length > 0) || (whyPanel as any).topFactorsFor?.length > 0) && (
              <div>
                <span className="text-[11.5px] text-[var(--accent)] font-semibold block mb-1">
                  Supporting factors
                </span>
                <ul className="space-y-1 pl-4 list-disc text-[var(--text)] text-[12.5px] leading-[1.5]">
                  {(whyPanel.factorsFor || (whyPanel as any).topFactorsFor).map((item: string, idx: number) => (
                    <li key={idx}>{cleanDisplayText(item)}</li>
                  ))}
                </ul>
              </div>
            )}

            {((whyPanel.factorsAgainst && whyPanel.factorsAgainst.length > 0) || (whyPanel as any).topFactorsAgainst?.length > 0) && (
              <div className="pt-2 border-t border-[var(--line)]">
                <span className="text-[11.5px] text-[var(--medium)] font-semibold block mb-1">
                  Counterbalancing factors
                </span>
                <ul className="space-y-1 pl-4 list-disc text-[var(--text-2)] text-[12.5px] leading-[1.5]">
                  {(whyPanel.factorsAgainst || (whyPanel as any).topFactorsAgainst).map((item: string, idx: number) => (
                    <li key={idx}>{cleanDisplayText(item)}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-2 border-t border-[var(--line)]">
              <div className="flex items-center justify-between text-[11.5px] mb-1">
                <span className="text-[var(--medium)] font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" strokeWidth={2} />
                  <span>Risk flags</span>
                </span>
                <span className="text-[10.5px] text-[var(--text-2)]">
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
                      className="px-2 py-0.5 rounded-full text-[10.5px] bg-[var(--medium-soft)] text-[var(--medium)] border border-[var(--medium)]/30"
                    >
                      {cleanDisplayText(flag)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11.5px] text-[var(--text-2)]">
                  Zero adverse contextual risk flags across H2H, fatigue, lineups, and derby history.
                </p>
              )}
            </div>

            <div className="pt-2 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-2)] tabular-nums">
              <span>{cleanDisplayText(whyPanel.uncertaintySummary || 'Modeled with empirical covariates and shrinkage')}</span>
              {ci90 && (
                <span className="text-[var(--text)] font-medium">
                  90% CI: {(ci90[0] * 100).toFixed(1)}% to {(ci90[1] * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        )}

        {substituteOption && (
          <div className="bg-[var(--surface-2)] border border-[var(--accent)]/30 rounded-[12px] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] text-[var(--accent)] font-semibold flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" strokeWidth={2} />
                <span>Alternative line projection</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30 font-semibold tabular-nums">
                −{substituteOption.varianceReductionPct}% variance
              </span>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <div>
                <div className="font-display text-[14px] font-bold text-[var(--text)]">
                  {cleanDisplayText(substituteOption.selection)}
                </div>
                <div className="text-[11.5px] text-[var(--text-2)] mt-0.5">
                  {cleanDisplayText(substituteOption.marketName)}
                </div>
              </div>

              <div className="text-right tabular-nums">
                <div className="font-display text-[14px] font-bold text-[var(--accent)]">
                  {(substituteOption.modelProbability * 100).toFixed(1)}%
                </div>
                <div className="text-[11px] text-[var(--text-2)]">
                  {substituteOption.edgeOverBaseline !== undefined
                    ? `+${(substituteOption.edgeOverBaseline * 100).toFixed(1)}% edge`
                    : substituteOption.odds
                    ? `@${substituteOption.odds.toFixed(2)}`
                    : ''}
                </div>
              </div>
            </div>

            <p className="text-[12px] text-[var(--text)] bg-[var(--surface)] p-2.5 rounded-[10px] border border-[var(--line)] leading-[1.5]">
              <span className="text-[var(--accent)] font-medium">Reason for swap: </span>
              {cleanDisplayText(substituteOption.reasonForSwap)}
            </p>
          </div>
        )}

        {explanation?.keySupportingFactors && explanation.keySupportingFactors.length > 0 && (
          <div>
            <h4 className="font-display font-semibold text-[14px] text-[var(--text)] flex items-center gap-1.5 mb-1.5">
              <Check className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={2} />
              <span>Key quantitative evidence</span>
            </h4>
            <ul className="space-y-1.5 pl-4 list-disc text-[var(--text-2)] text-[12.5px] leading-[1.5]">
              {explanation.keySupportingFactors.map((factor, idx) => (
                <li key={idx}>{cleanDisplayText(factor)}</li>
              ))}
            </ul>
          </div>
        )}

        {similarFixturesComparison && similarFixturesComparison.similarMatches.length > 0 && (
          <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[12px] p-3 space-y-2">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[var(--text)] font-medium">Similar fixture precedents (K=5)</span>
              <span className="text-[var(--accent)] text-[11px] font-semibold tabular-nums">
                Hit rate {(similarFixturesComparison.marketHitRate * 100).toFixed(0)}%
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-[var(--text-2)] tabular-nums">
              {similarFixturesComparison.similarMatches.slice(0, 4).map((m, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-[var(--surface)] px-2.5 py-1.5 rounded-[8px] border border-[var(--line)]"
                >
                  <span className="truncate max-w-[160px] text-[var(--text)]">{cleanDisplayText(m.fixtureName)}</span>
                  <span className="text-[var(--accent)] font-semibold ml-1">{cleanDisplayText(m.score)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {explanation?.counterarguments && explanation.counterarguments.length > 0 && (
          <div className="bg-[var(--medium-soft)] border border-[var(--medium)]/30 rounded-[12px] p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-[12.5px] text-[var(--medium)] flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={2} />
                <span>Risk factors and invalidation triggers</span>
              </h4>
              {fragilityFlags && fragilityFlags.length > 0 && (
                <span className="text-[10.5px] text-[var(--medium)] font-semibold">
                  {fragilityFlags.length} flag{fragilityFlags.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <ul className="space-y-1 pl-4 list-disc text-[var(--text-2)] text-[12px] leading-[1.5]">
              {explanation.counterarguments.map((item, idx) => (
                <li key={idx}>{cleanDisplayText(item)}</li>
              ))}
            </ul>
          </div>
        )}

        {explanation?.alternativeComparisons && explanation.alternativeComparisons.length > 0 && (
          <div>
            <h4 className="font-display font-semibold text-[14px] text-[var(--text)] mb-1.5">
              Evaluated alternative lines
            </h4>
            <div className="space-y-1.5">
              {explanation.alternativeComparisons.map((alt, idx) => (
                <div
                  key={idx}
                  className="bg-[var(--surface-2)] p-2.5 rounded-[10px] border border-[var(--line)] flex items-start justify-between text-[11.5px]"
                >
                  <div>
                    <span className="font-medium text-[var(--text)]">{cleanDisplayText(alt.alternative)}</span>
                    <span className="text-[var(--text-2)] ml-2 tabular-nums">
                      ({(alt.modelProbability * 100).toFixed(1)}%)
                    </span>
                    <p className="text-[var(--text-2)] mt-0.5 leading-[1.45]">{cleanDisplayText(alt.reasonRejected)}</p>
                  </div>
                  <X className="w-4 h-4 text-[var(--text-3)] shrink-0 mt-0.5 ml-2" strokeWidth={2} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-[var(--line)] flex flex-wrap items-center justify-between text-[11px] text-[var(--text-3)] tabular-nums">
          <span>Sample basis: {explanation?.sampleSize || 20} matches</span>
          <span suppressHydrationWarning>
            Audit timestamp:{' '}
            {explanation?.generatedAt
              ? new Date(explanation.generatedAt).toISOString().slice(11, 16) + ' UTC'
              : '16:00 UTC'}
          </span>
        </div>
      </div>
    </div>
  );
}
