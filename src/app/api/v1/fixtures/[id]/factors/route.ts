import { NextResponse } from 'next/server';
import { getFootballDataProvider } from '@/lib/data/provider';
import { evaluateFixtureMarkets } from '@/lib/prediction/marketSelection';
import { STATE_TAG_REGISTRY, FACTOR_DEFINITIONS } from '@/lib/prediction/contextFactors';

export const dynamic = 'force-dynamic';
export const revalidate = 120;

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const provider = getFootballDataProvider();
  const fixture = await provider.getFixtureById(params.id);

  if (!fixture) {
    return NextResponse.json(
      { error: 'Fixture not found', code: 'FIXTURE_NOT_FOUND' },
      { status: 404 }
    );
  }

  const context = await provider.getFixtureContext(params.id);
  if (!context) {
    return NextResponse.json(
      { error: 'Context not found for fixture', code: 'CONTEXT_NOT_FOUND' },
      { status: 404 }
    );
  }

  const evalResult = evaluateFixtureMarkets(context);
  const { contextEvaluation, rankedOptions, topPick, noRecommendationReason } = evalResult;

  // Format detailed state tags
  const detailedStateTags = contextEvaluation.stateTags.map(tag => {
    const reg = STATE_TAG_REGISTRY[tag];
    return {
      tag,
      label: reg?.label ?? tag,
      description: reg?.description ?? '',
      uncertaintyMultiplier: reg?.uncertaintyMultiplier ?? 1.0,
      affectedMarkets: reg?.affectedMarkets ?? [],
      hypothesis: reg?.hypothesis ?? '',
    };
  });

  return NextResponse.json({
    fixtureId: fixture.id,
    matchName: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
    competition: fixture.competition.name,
    kickoffTime: fixture.kickoffTime,
    lineupStatus: contextEvaluation.lineupStatus,
    dataQualityScore: contextEvaluation.dataQualityScore,
    compositeUncertaintyMultiplier: contextEvaluation.compositeUncertaintyMultiplier,
    stateTags: detailedStateTags,
    missingFactors: contextEvaluation.missingFactors,
    factors: contextEvaluation.activeFactors.map(f => {
      const def = FACTOR_DEFINITIONS[f.factorCode];
      return {
        factorCode: f.factorCode,
        name: f.factorName,
        category: f.category,
        description: f.description,
        homeValue: f.homeValue,
        awayValue: f.awayValue,
        isMeasured: f.isMeasured,
        isMissing: f.isMissing,
        shrinkageApplied: f.shrinkageApplied,
        ablationGainBrier: def?.ablationGainBrier ?? 0.01,
        marketWeights: f.marketWeights,
      };
    }),
    topRankedOptions: rankedOptions.map(opt => ({
      marketCode: opt.marketCode,
      marketName: opt.marketName,
      selection: opt.selection,
      line: opt.line,
      modelProbability: opt.modelProbability,
      marketOdds: opt.marketOdds,
      expectedValue: opt.expectedValue,
      edge: opt.edge,
      modelConfidence: opt.modelConfidence,
      qualificationStatus: opt.qualificationStatus,
      evidenceTier: opt.evidenceTier,
      dataQualityScore: opt.dataQualityScore,
      stateTags: opt.stateTags,
      lineupStatus: opt.lineupStatus,
      topFactorContributions: opt.topFactorContributions,
      correlationWarnings: opt.correlationWarnings,
      alternativesRejected: opt.alternativesRejected,
    })),
    topPick: topPick ? {
      selection: topPick.selection,
      marketName: topPick.marketName,
      modelProbability: topPick.modelProbability,
      evidenceTier: topPick.evidenceTier,
      expectedValue: topPick.expectedValue,
    } : null,
    noRecommendationReason,
    complianceNotice: 'Quantitative research and analysis options only. The platform does not take or place wagers, provide staking advice, or use guarantee language.',
    evaluatedAt: new Date().toISOString(),
  });
}
